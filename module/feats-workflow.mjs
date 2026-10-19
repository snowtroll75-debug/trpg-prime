import { SKILLS, WEAPON_GROUPS, blankSpecialistSkill, slugifyKey, uniqueKey } from "./config.mjs";
import { generalAP } from "./combat/restricted-ap.mjs";
import { lastStanceRoundIn, stanceStamp } from "./traits-workflow.mjs";
import { isCantripSpell } from "./magic/casting.mjs";
import { findSpecialistSkillByLabel } from "./specialist-grants.mjs";
import { archetypeBSBDue } from "./magic/archetype-casting.mjs";
import {
  WILD_SHAPE_FORM_FEATS,
  WILD_SHAPE_POOL_SPELL
} from "./magic/wildshape-feats.mjs";
import { ACTION_FEATS } from "./combat/action-feats.mjs";
import { runArchetypeCastingStep } from "./magic/archetype-casting-workflow.mjs";
import { addPendingModifier } from "./pending-modifiers.mjs";
import { applyConditionTags } from "./combat/effect-application-workflow.mjs";
import { SKILL_SPECIALTIES } from "./skill-specialties.mjs";
import { RACIAL_PP_PER_LEVEL, HERITAGE_PP_PER_LEVEL, ppLevels } from "./racial-pp.mjs";
import {
  firstLevelChoiceRefusal, duplicateMode, applyDuplicateRule, allKnownRefusal,
  choiceFromEffectName
} from "./feats.mjs";

/**
 * Feat automation (Chapter 5).
 *
 * Three tiers, matching what each feat's rules actually permit:
 *
 *   PASSIVE   Flat, unconditional bonuses are authored on the compendium
 *             entry as transferred Active Effects with CUSTOM pool changes —
 *             they apply the moment the feat is on the actor and vanish when
 *             it is removed. No code here; the Appendix 1 pools do the work.
 *
 *   ACTIVATED Feats with a choice or a per-use trigger get a "Use" action on
 *             the sheet (registered below). Choices create clearly-named
 *             Active Effects; per-check triggers queue a one-shot pending
 *             modifier that appears as a tickbox in the next roll dialog.
 *             Daily-preparation choices are flagged and swept at daily prep.
 *
 *   NOTE      Rules the current data model cannot represent honestly yet
 *             (senses, spell repertoire swaps, school-scoped DCs) stay
 *             visible as named effects/notes rather than pretending.
 *
 * The registry is keyed by normalised feat name so compendium and world
 * copies both resolve. Modules/later batches extend FEAT_AUTOMATION.
 */

const SYSTEM_ID = "trg-prime";
const FEAT_SOURCE_FLAG = "featSource";
export const DAILY_PREP_FLAG = "expiresOnDailyPrep";

const { DialogV2 } = foundry.applications.api;

/**
 * HTML-escape text that came from a PLAYER.
 *
 * Chat card content is enriched rather than sanitised by Foundry, so a
 * free-text answer interpolated raw runs for every connected client. The
 * choosers that ask a player to name something are the only place in this
 * file where untrusted text reaches a card.
 */
function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * A spell by name, preferring the actor-independent sources a scroll uses:
 * the stored UUID, then the compendium by name. The same preference order
 * `resolveSpellSource` applies for a scroll being read, so the Book of
 * Notations copies the spell the scroll would actually have cast.
 */
async function resolveSpellByNameOrUuid(name, uuid) {
  if (uuid) {
    try {
      const resolve = foundry.utils?.fromUuid ?? globalThis.fromUuid;
      const doc = await resolve(uuid);
      if (doc?.type === "spell") return doc.toObject();
    } catch (_e) { /* the entry moved — fall through to the name */ }
  }
  const pack = contentPack("spells");
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!pack || !wanted) return null;
  const index = await pack.getIndex();
  const entry = Array.from(index.values()).find(
    (e) => String(e.name).trim().toLowerCase() === wanted
  );
  if (!entry) return null;
  const doc = await pack.getDocument(entry._id);
  return doc?.toObject() ?? null;
}

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

// `rolls` defaults to none — the vast majority of this registry's cards
// apply a flat, already-computed number and have no die roll to attach.
// Crusader's Mercy is the first entry here that rolls actual healing
// dice; passing the evaluated Roll through `rolls` (rather than baking
// its total into the text, as every earlier entry does) is what lets
// Dice So Nice animate it, matching the shape attack-workflow.mjs's own
// postCard already uses for the same reason.
async function postCard(actor, title, lines, rolls = []) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">${title}</h3>${lines.join("")}</div>`
  });
}

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/**
 * The Battle Readiness gate for the reaction-spending feats in this
 * registry, which deduct the reaction resource directly rather than
 * through spendReaction. A Fighter with Battle Readiness holds two
 * reactions a round, but only one may go on a reaction WITHOUT the
 * Attack or Martial trait — and none of the reaction feats automated
 * here carry either, so each counts against that one unrestricted
 * spend. Returns false (with the reason shown) when the spend must be
 * refused; otherwise records the spend and returns true.
 *
 * Only bites while a combat is running — outside one the reaction pool
 * is not being tracked turn-by-turn, and neither is this.
 */
async function fighterReactionGate(actor, label, traits = "") {
  if (!game.combat?.started) return true;
  const { battleReadinessBonus, battleReadinessSpendBlock, reactionQualifies } =
    await import("./fighter.mjs");
  if (!(battleReadinessBonus(actor) > 0)) return true;
  const qualifies = reactionQualifies(traits);
  const blocked = battleReadinessSpendBlock({
    hasBattleReadiness: true,
    qualifies,
    nonQualifyingSpent: Boolean(actor.getFlag?.(SYSTEM_ID, "nonMartialReactionSpent"))
  });
  if (blocked) {
    ui.notifications.warn(`${label}: ${blocked}`);
    return false;
  }
  if (!qualifies) await actor.setFlag(SYSTEM_ID, "nonMartialReactionSpent", true);
  return true;
}

/** Delete this feat's previous choice-effects, then create the new one. */
async function replaceFeatEffect(actor, item, effectData, { dailyPrep = false } = {}) {
  const stale = Array.from(actor.effects ?? [])
    .filter((e) => e.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) === item.id)
    .map((e) => e.id);
  if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);

  effectData.flags ??= {};
  effectData.flags[SYSTEM_ID] = {
    ...(effectData.flags[SYSTEM_ID] ?? {}),
    [FEAT_SOURCE_FLAG]: item.id,
    ...(dailyPrep ? { [DAILY_PREP_FLAG]: true } : {})
  };
  effectData.origin = item.uuid;
  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  return effect;
}

/**
 * The Fighter's and the Rogue's "must select a magical tradition at 1st
 * level" — see the FEAT_AUTOMATION entries for why this is a chooser.
 *
 * Writes the same field the sheet's own dropdown writes, so the two
 * cannot disagree, and reports what a tradition does and does NOT do for
 * a class that casts nothing.
 */
async function chooseMagicalTradition(actor, item) {
  const { TRADITIONS } = await import("./config.mjs");
  const current = String(actor.system?.magic?.tradition ?? "").trim().toLowerCase();
  const picked = await chooseFromList(
    `${item.name} — Magical Tradition`,
    current ? "Change your magical tradition" : "Magical tradition (required at 1st level)",
    Object.entries(TRADITIONS).map(([key, t]) => [key, t.label])
  );
  if (!picked) return;
  await actor.update({ "system.magic.tradition": picked });
  const label = TRADITIONS[picked]?.label ?? picked;
  await postCard(actor, `${item.name} — Magical Tradition`, [
    line(`Your magical tradition is <strong>${esc(label)}</strong>.`),
    line("<em>This grants no spellcasting — your Power Points stay at 0 and you gain no "
      + "spells, repertoire or memorisation. It is the tradition you are counted as "
      + "belonging to for everything that asks.</em>")
  ]);
}

async function chooseFromList(title, label, options) {
  const opts = options.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  // A form-group is a two-column grid with a 150px label column, which is
  // right for "Spell to gain" and wrong for a sentence. The Crusader's
  // reaction-feat prompt is a sentence — it wrapped into five short lines
  // beside the select and read as broken. A long prompt stacks above its
  // control instead.
  const stacked = String(label ?? "").length > 40 ? " stacked" : "";
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-medal" },
    classes: ["trg-prime"],
    position: { width: stacked ? 460 : 380 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group${stacked}"><label>${label}</label>
      <select name="choice">${opts}</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result.choice;
}

async function enterText(title, label, placeholder = "", value = "") {
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-medal" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group"><label>${label}</label>
      <input type="text" name="text" placeholder="${placeholder}" value="${esc(value)}"></div></div>`,
    buttons: [
      {
        action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return String(result.text ?? "").trim();
}

/**
 * Choose a spell from the spells compendium and embed it on the actor,
 * replacing a previous choice made through the same feature. Shared by
 * Arcane Knowledge, Elven Magic (both), Ethereal Trick and future pickers.
 *
 * @param {Actor} actor
 * @param {object} options
 * @param {string} options.title Dialog/card title (the feature name).
 * @param {(entry: object) => boolean} options.filter Index filter; index
 *   carries system.tradition and system.ppCost.
 * @param {string} options.flagKey Item flag marking this feature's choice.
 * @param {boolean} [options.innate] Mark the granted copy innate.
 * @param {string} [options.addTrait] Trait to append if missing (e.g. focus).
 * @param {string} [options.grantNote] Extra card line.
 */
/**
 * Is this spell on a given class's specialist list?
 *
 * `specialistClass` IS A LIST, and three spells prove it: Soothing Words,
 * Vibrant Thorns and Nature's Bounty are all printed "[Cleric, Druid]". The
 * Bard and Druid choosers compared the whole field with `=== "druid"`, so a
 * spell shared with the Cleric was silently absent from the Druid's own pick
 * — two of its seven PP 1 spells, and nothing said so. The generic
 * Specialist Spell chooser beside them had always split on commas, so the
 * system disagreed with itself about what a Druid may take.
 *
 * Found live on 3.318.0 while confirming the specialist choosers still
 * worked after the exclusion default landed: the Druid dialog offered five
 * spells where the pack holds seven.
 *
 * @param {object} spellSystem
 * @param {string} className
 * @returns {boolean}
 */
export function onSpecialistList(spellSystem, className) {
  return String(spellSystem?.specialistClass ?? "")
    .split(/[,;]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(String(className).trim().toLowerCase());
}

async function grantChosenSpell(actor, {
  title, filter, flagKey, innate = false, addTrait = "", grantNote = "",
  indexFields = [], extraFlags = null, sourceItem = null,
  // A RACIAL PICK IS MADE ONCE, AT 1ST LEVEL (3.552.5).
  //
  // Graham's R2 ruling of 15 Sep 2026, extended from Versatile at his
  // instruction: "R2 should also extend to the cantrip choosers." Opt-in
  // per chooser rather than applied here to all of them, because this
  // helper also serves FEAT picks — Ethereal Trick, Verdant Gnome,
  // Unusual Magic, Elven Magic Greater — and a feat taken at 5th level
  // is chosen at 5th level. Locking those to 1st would refuse a choice
  // the character had every right to make.
  firstLevelChoice = false,
  // A FREE PICK MUST NOT REACH A SPELL THAT IS SOMEBODY ELSE'S GRANT.
  //
  // Graham's ruling, 15 Aug 2026, on the Menora's healing-spell pick:
  // "They are specialist spells and should not be offered." A specialist
  // spell is what a heritage, wizard school or divine aspect HANDS you;
  // offering the same pool to a chooser that says "any spell" turns every
  // one of those grants into something anybody can simply take.
  //
  // Found by auditing the Menora list, and it was not only Menora: the
  // Urloch chooser was offering 69 specialist spells among its 219, and
  // the same ruling was extended to it. Defaulted ON so a chooser added
  // later has to ASK for specialists rather than leak them by omission —
  // the same reasoning `spellNeedsTarget` uses for area spells.
  allowSpecialist = false
}) {
  const pack = contentPack("spells");
  if (!pack) {
    ui.notifications.warn(`${title}: spells compendium not found.`);
    return null;
  }
  // `system.traits` IS BASE, NOT OPT-IN (3.552.7).
  //
  // Foundry's compendium index carries only _id/name/img/type plus the
  // `system.*` fields a caller asks for, and the cached index MERGES what
  // each call requests. That makes an undeclared field look present as
  // soon as anything else asks for it — so a chooser whose filter reads
  // `system.traits` works perfectly in testing and fails on a cold world,
  // silently, as "no matching spells found in the compendium".
  //
  // Found live by Graham's Arcane Knowledge test at 3.552.5: pressing Use
  // on a freshly loaded world found nothing, and the identical pipeline
  // run a minute later found twenty spells, because the first run had
  // warmed the index. Six choosers read traits through `isCantripSpell`
  // and only Menora declared the field. Traits are the single most-read
  // spell field there is, so it joins the base list rather than being
  // added to five more `indexFields` arrays that the seventh chooser will
  // forget. Anything else a filter reads must still be declared — see
  // verify-chooser-index-fields, which fails the build if one is missed.
  const index = await pack.getIndex({
    fields: ["system.tradition", "system.ppCost", "system.specialist", "system.traits", ...indexFields]
  });
  const candidates = Array.from(index.values())
    .filter((entry) => allowSpecialist || !entry.system?.specialist)
    .filter(filter)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!candidates.length) {
    ui.notifications.warn(`${title}: no matching spells found in the compendium.`);
    return null;
  }
  // Scoped to the SOURCE when there is one.
  //
  // The flag key alone is actor-wide, which is right for a feat you can
  // only have once and catastrophically wrong for anything you can have
  // two of. Divine aspects are the first: a character with Dawn and War
  // pressing Use on War found Dawn's spell under the same flag, offered
  // "Replace Luminance with which spell?" — naming a spell that belongs
  // to a different aspect entirely — and then DELETED it. Found by
  // review at 3.209.0, before it shipped.
  //
  // Callers that pass no sourceItem keep the actor-wide behaviour, which
  // is what every existing one wants.
  const already = actor.items.find((i) =>
    i.type === "spell" && i.getFlag(SYSTEM_ID, flagKey) &&
    (!sourceItem?.id || i.getFlag(SYSTEM_ID, "grantedBy")?.sourceId === sourceItem.id));

  // THE 1ST-LEVEL LOCK, asked here because `already` is the answer to
  // "is there a choice to change" — the same question Versatile asks of
  // its effect. A character who has never picked is never refused; see
  // feats.mjs's firstLevelChoiceRefusal for why that limit exists.
  if (firstLevelChoice) {
    const refusal = firstLevelChoiceRefusal({
      level: actor.system?.identity?.level,
      isGM: Boolean(game.user?.isGM),
      alreadyChosen: Boolean(already),
      label: title
    });
    if (refusal) {
      ui.notifications.warn(refusal);
      return null;
    }
  }

  // A SPELL THE CHARACTER ALREADY HAS (3.552.9).
  //
  // Graham's ruling of 15 September 2026: hidden where a second copy
  // would do nothing (a repertoire grant), offered and labelled where it
  // would not (an innate focus copy). The reasoning, and why the answer
  // is read off `innate` rather than set per chooser, is in feats.mjs's
  // duplicateMode.
  //
  // The pick being REPLACED is excluded from the held list, or the
  // chooser would hide the very answer the player pressed Use to change
  // — and a label reading "Daze (already known)" beside "Replace Daze
  // with which spell?" would be telling them something they can see.
  const heldNames = Array.from(actor.items ?? [])
    .filter((item) => item.id !== already?.id)
    .map((item) => item.name);
  const rows = applyDuplicateRule(candidates, heldNames, duplicateMode({ innate }));
  // EVERY CANDIDATE HIDDEN IS NOT AN EMPTY COMPENDIUM. Said in its own
  // words, because "no matching spells found in the compendium" is what
  // the cold-index bug said for six releases, and a Lorist who happens
  // to know every arcane spell on the list should not be told the pack
  // is broken.
  if (!rows.length) {
    ui.notifications.warn(allKnownRefusal(title));
    return null;
  }

  const choiceId = await chooseFromList(title,
    already ? `Replace ${already.name} with which spell?` : "Spell to gain",
    rows.map((row) => [row.id, row.label]));
  if (!choiceId) return null;
  if (already) await already.delete();

  const source = await pack.getDocument(choiceId);
  const data = packItemData(source);
  if (innate) data.system.innate = true;
  // Every grantChosenSpell caller hands over a spell OUTSIDE the ordinary
  // daily memorisation cycle — a specialist spell, a heritage/background/
  // archetype bonus repertoire spell — never a "list"-style leveled pick or
  // a Spell Book slot (those are created only by memorisation-workflow.mjs
  // and spellbook-workflow.mjs). Chapter 9's own cast gate reads `prepared`
  // for a "learned" caster, and every spell ships `prepared: false` in the
  // compendium, so left alone this created a spell a learned caster could
  // never actually cast — the exact bug Graham hit with Physical Boost
  // (Alteration's specialist spell) and Cloistered Priest's own pick.
  // Matches the `bonusSpells`/`specialistSpells` special-case already
  // applied for the GRANT_FIELDS path in grants-workflow.mjs.
  data.system.prepared = true;
  if (addTrait) {
    const traits = String(data.system.traits ?? "");
    if (!new RegExp(`\\b${addTrait}\\b`, "i").test(traits)) {
      data.system.traits = traits ? `${traits}, ${addTrait}` : addTrait;
    }
  }
  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${flagKey}`, true);
  for (const [key, value] of Object.entries(extraFlags ?? {})) {
    foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${key}`, value);
  }
  // Provenance, so grant-cleanup takes the spell down with its source.
  // Without it a picked spell outlives the feature that granted it — and
  // Menora's copy carries a permanent warp discount for a heritage the
  // character no longer has. Callers that pass no sourceItem keep the old
  // behaviour rather than silently binding to the wrong document.
  if (sourceItem?.id) {
    foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
      sourceId: sourceItem.id,
      sourceName: sourceItem.name,
      requested: data.name
    });
  }
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  await postCard(actor, title, [
    line(`<strong>${created.name}</strong> gained${innate ? " as an innate spell" : ""}${addTrait ? ` with the ${addTrait} trait` : ""}.`),
    ...(grantNote ? [line(grantNote)] : [])
  ]);
  return created;
}

/**
 * Apply a feat's own chooser with the answer supplied, rather than
 * prompting for it.
 *
 * Two backgrounds grant a feat with the choice already made in the book —
 * "Weapon Focus (Unarmed)", "Favoured Terrain (Underground)".
 *
 * The answer is THREADED to the feat's own `use`, which takes it as an
 * option. An earlier version instead swapped the module-level
 * `chooseFromList` binding for the duration of the call, and that was
 * badly wrong: the swap is only safe under strict LIFO nesting, so two
 * overlapping Apply Grants — a double-click is enough — left the second
 * call restoring the FIRST call's stub as the module's permanent chooser.
 * Every chooser feat in the session then silently answered itself or did
 * nothing at all, until the page was reloaded. It also hijacked any
 * dialog the player opened during the four socket round-trips inside
 * `use()`. Threading costs two feats an optional parameter and is
 * re-entrant by construction.
 *
 * A feat opts in with `acceptsChoice: true`. Anything else is refused
 * rather than driven blind.
 *
 * @param {Actor} actor
 * @param {Item} featItem The granted feat, already embedded.
 * @param {string} choice The option to select, as the feat labels it.
 * @returns {Promise<{applied: boolean, reason?: string}>}
 */
export async function applyFeatQualifier(actor, featItem, choice) {
  const automation = FEAT_AUTOMATION[normalise(featItem?.name)];
  if (!automation?.use) return { applied: false, reason: "no automation" };
  if (!automation.acceptsChoice) {
    return { applied: false, reason: `${featItem.name} cannot be set automatically` };
  }

  const wanted = String(choice ?? "").trim();
  // Already recorded — don't re-drive. Favoured Terrain's effect is
  // authored DISABLED (you enable it on entering the terrain), so
  // re-running it on every Apply Grants would silently switch off an
  // effect the player had turned on, and post a duplicate card.
  if (automation.recordedChoice?.(actor, featItem) === wanted) {
    return { applied: true, reason: "already set" };
  }

  const result = await automation.use(actor, featItem, { presetChoice: wanted });
  // Verified from the actor, not from the return value: the point is that
  // the choice LANDED, and only the feat knows where it records it.
  const recorded = automation.recordedChoice?.(actor, featItem);
  if (recorded !== wanted) {
    return { applied: false, reason: result?.reason ?? `"${choice}" was not applied` };
  }
  return { applied: true };
}

/**
 * A background whose printed specialist skill is a CHOICE, not a name.
 *
 * The prompt comes off the item's own `specialistChoice` flag, so this
 * one handler serves every such background and the remaining forty land
 * as pack data rather than as code.
 *
 * The created skill is recorded against the background in the SAME
 * provenance flag the ordinary grants use, which is what makes it leave
 * with the background — and re-using this button REPLACES the previous
 * answer rather than accumulating one skill per click, which was the
 * obvious way to get this wrong.
 */
async function useBackground(actor, item) {
  // One Use button, three possible questions. Scholar asks two of them,
  // which is why this dispatches rather than each being its own entry:
  // a background gets ONE button and it has to cover whatever that
  // background declares.
  let did = false;
  if (item?.getFlag?.(SYSTEM_ID, "skillChoice")) did = await chooseBackgroundSkills(actor, item) || did;
  if (item?.getFlag?.(SYSTEM_ID, "spellChoice")) did = await chooseBackgroundSpell(actor, item) || did;
  if (item?.getFlag?.(SYSTEM_ID, "specialistChoice")) did = await useBackgroundSpecialistChoice(actor, item) || did;
  if (!did && !item?.getFlag?.(SYSTEM_ID, "skillChoice") &&
    !item?.getFlag?.(SYSTEM_ID, "spellChoice") && !item?.getFlag?.(SYSTEM_ID, "specialistChoice")) {
    ui.notifications.warn(`${item?.name ?? "This background"} has nothing to choose.`);
  }
  return did;
}

/**
 * "+1 class bonus to N skills of your choice, from …" — Scholar, the only
 * background where the player picks WHICH skills the bonuses land on.
 *
 * The picks become one effect carrying the same CUSTOM-mode class-pool
 * changes the authored ones use, so a chosen +1 and a printed +1 are the
 * same thing to everything downstream.
 */
async function chooseBackgroundSkills(actor, item) {
  const spec = item.getFlag(SYSTEM_ID, "skillChoice");
  const count = Math.max(1, Number(spec?.count) || 1);
  const from = Array.isArray(spec?.from) ? spec.from : [];
  if (!from.length) return false;

  const { SKILL_KEY_BY_NAME } = await import("./background-skills.mjs");
  const keyToName = Object.fromEntries(
    Object.entries(SKILL_KEY_BY_NAME).map(([name, key]) => [key, name])
  );

  // SEEDED from what is already recorded, not started empty.
  //
  // replaceFeatEffect deletes every effect this item owns before creating
  // the new one, so the effect is always exactly what the current run
  // produced. Starting empty meant a player who pressed Use to change one
  // skill and then cancelled the second prompt — an entirely natural
  // "actually, leave it" — had their three bonuses replaced by one. And
  // the card's own advice to "press Use again" made it worse, because the
  // next run started empty too.
  const existing = Array.from(actor.effects ?? [])
    .find((e) => e.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) === item.id);
  const chosen = (existing?.changes ?? [])
    .map((c) => keyToName[String(c.key).split(".")[2]])
    .filter((name) => from.includes(name));

  let changed = false;
  for (let n = 0; n < count; n += 1) {
    const current = chosen[n] ?? null;
    const options = from
      .filter((name) => !chosen.includes(name) || name === current)
      .map((name) => [name, name === current ? `${name} — current` : name]);
    if (!options.length) break;
    const pick = await chooseFromList(
      item.name,
      `Skill ${n + 1} of ${count}${current ? ` (currently ${current})` : ""}`,
      options
    );
    // Cancelling a slot means "leave this one as it is" — it does not
    // abandon the slots after it, and it never clears a slot already
    // answered.
    if (!pick) continue;
    if (pick !== current) changed = true;
    chosen[n] = pick;
  }
  const picked = chosen.filter(Boolean);
  if (!picked.length) return false;
  // Nothing to write, and nothing to say — don't delete and rebuild an
  // identical effect just to post a card about it.
  if (!changed && existing) return false;

  const keys = picked.map((name) => SKILL_KEY_BY_NAME[name]).filter(Boolean);
  await replaceFeatEffect(actor, item, {
    name: `${item.name}: ${picked.join(", ")}`,
    img: item.img,
    description: `+1 class bonus to ${picked.join(", ")}.`,
    changes: keys.map((key) => ({
      key: `system.skills.${key}.class`,
      type: CHANGE_TYPE.CUSTOM,
      value: "1",
      priority: 20
    }))
  });
  await postCard(actor, item.name, [
    line(`+1 class bonus to <strong>${esc(picked.join(", "))}</strong>.`),
    ...(picked.length < count
      ? [line(`<em>${count - picked.length} still to choose — press Use again; what you have picked is kept.</em>`)]
      : [line("<em>Press Use again to change them.</em>")])
  ]);
  return true;
}

/**
 * "You may select an ethereal cantrip and cast it using your spellcraft
 * bonus" — Weaver. Filtered from the compendium rather than typed, and
 * tagged so it leaves with the background.
 */
export function backgroundSpellFilter(spec) {
  return (s) =>
    (spec?.ppCost === undefined || Number(s.system?.ppCost ?? -1) === Number(spec.ppCost)) &&
    (!spec?.tradition || new RegExp(spec.tradition, "i").test(String(s.system?.tradition ?? "")));
}

async function chooseBackgroundSpell(actor, item) {
  const spec = item.getFlag(SYSTEM_ID, "spellChoice");
  if (!spec) return false;
  // NOT innate, unless the entry says so. Weaver's rule is "cast it using
  // your spellcraft bonus", which is the ordinary casting path — an
  // innate spell is resolved from magical ability and level and never
  // touches Spellcraft, so marking it innate would have made the card's
  // own note ("Cast using your Spellcraft bonus") impossible to honour.
  // Ethereal Trick, which has the identical rule text, grants a plain
  // spell; the racial cantrips are innate because their rules say
  // "cast it as an innate spell with the focus trait", and Weaver's
  // does not.
  const created = await grantChosenSpell(actor, {
    title: item.name,
    filter: backgroundSpellFilter(spec),
    flagKey: "backgroundSpell",
    innate: Boolean(spec.innate),
    addTrait: spec.innate ? "focus" : "",
    grantNote: spec.note ?? "",
    sourceItem: item
  });
  return Boolean(created);
}

/**
 * "You gain any one PP 1 Specialist Spell at 1st level. This spell is
 * based upon your deific aspect." (Cleric, Chapter 3.)
 *
 * Each aspect lists EIGHT specialist spells and the character picks one.
 * Until 3.209.0 the grant path handed over all eight, which is seven
 * spells the character never had — and no dialog anywhere offered the
 * choice, so there was nothing to correct it with.
 *
 * Filtered by NAME against the aspect's own printed list rather than by
 * tradition or cost, because the list is the rule. Pressing Use again
 * REPLACES the previous pick, the same way every other chooser here
 * behaves, and the granted spell carries the aspect's provenance so it
 * leaves when the aspect does.
 */
/**
 * The reaction feat a Crusader picks when their aspect is neither good
 * nor evil — six of the ten, so this is the common path.
 *
 * "You may select one of the feats, but once selected, it cannot be
 * changed." Recorded against THIS aspect, and refused thereafter: the
 * permanence is the rule, so the code enforces it rather than printing
 * it on a card and hoping.
 */
async function chooseAlignmentFeat(actor, item) {
  const { alignmentFeat, alignmentFeatNames } = await import("./crusader.mjs");
  const names = alignmentFeatNames(actor);
  if (!names) return false;
  const verdict = alignmentFeat(item.system?.traits, names);
  if (!verdict.chosen) return false;

  const flagKey = `alignmentFeat-${item.id}`;
  const recorded = actor.getFlag(SYSTEM_ID, flagKey);
  if (recorded) {
    ui.notifications.info(
      `${item.name}: you chose ${recorded}, and it cannot be changed.`
    );
    return false;
  }

  const picked = await chooseFromList(
    item.name,
    `${item.name} is neither good nor evil — choose your reaction feat. This cannot be changed.`,
    verdict.options.map((name) => [name, name])
  );
  if (!picked) return false;

  // Already on the sheet from somewhere else: record the choice, but do
  // not hand over a second copy.
  const held = Array.from(actor.items ?? []).find(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === picked.trim().toLowerCase()
  );
  if (!held) {
    const pack = contentPack("feats");
    const index = await pack.getIndex();
    const entry = Array.from(index.values()).find(
      (e) => String(e.name).trim().toLowerCase() === picked.trim().toLowerCase()
    );
    if (!entry) {
      ui.notifications.warn(`${item.name}: "${picked}" is not in the feats compendium.`);
      return false;
    }
    const data = packItemData(await pack.getDocument(entry._id));
    // The aspect's provenance, so grant-cleanup takes it down when the
    // aspect is removed — a hand-dragged feat carries none and would
    // outlive the aspect that granted it.
    foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
      sourceId: item.id, sourceName: item.name, requested: picked
    });
    await actor.createEmbeddedDocuments("Item", [data]);
  }
  await actor.setFlag(SYSTEM_ID, flagKey, picked);
  await postCard(actor, item.name, [
    line(`<strong>${esc(picked)}</strong> chosen as your reaction feat${held ? " (already on your sheet)" : ""}.`),
    line("<em>Once selected, it cannot be changed.</em>")
  ]);
  return true;
}

async function useDivineAspect(actor, item) {
  const printed = String(item?.system?.specialistSpells ?? "").trim();
  if (!printed) {
    ui.notifications.warn(`${item?.name ?? "This aspect"} lists no specialist spells.`);
    return false;
  }
  const { parseGrantList } = await import("./grants.mjs");
  // Compared with apostrophes stripped on both sides: the appendix, the
  // spells pack and the class entries disagree about which apostrophe to
  // use and whether to use one at all. Death's Defiance is in all three
  // lists under three spellings.
  const key = (value) => String(value ?? "").replace(/[\u2019\u2018']/g, "").trim().toLowerCase();
  const wanted = new Set(parseGrantList(printed).map(key));
  if (!wanted.size) {
    ui.notifications.warn(`${item.name}: its specialist-spell list could not be read.`);
    return false;
  }

  // "You gain any one PP 1 Specialist Spell at 1st level." The Cleric's
  // line restricts the pick; the aspect's own entry does not repeat it,
  // and the eight it lists split four at PP 1 and four at PP 7 (three
  // and five for Pandemonium).
  // Offering all eight let a 1st-level Cleric take a PP 7 spell the
  // class line excludes, so the cost is part of the filter.
  //
  // Applied only when the character HAS a class whose own line says so.
  // Both the Cleric and the Crusader print "any one PP 1 Specialist
  // Spell at 1st level" verbatim, so both restrict; a Druid's aspect, or
  // one on an NPC with no such class, offers the whole list rather than
  // a restriction borrowed from somebody else's class. Keyed on the
  // sentence rather than on a list of class names so a later class that
  // prints the same rule is covered without a code change.
  const clerical = Array.from(actor.items ?? []).some(
    (i) => i.type === "class" && /\bPP 1 Specialist Spell\b/i.test(String(i.system?.description ?? ""))
  );
  const created = await grantChosenSpell(actor, {
    title: item.name,
    // SPECIALIST BY DESIGN, and this line was missing until 3.421.0.
    //
    // Graham, 27 August 2026: "Divine Aspects are not working properly
    // and not allowing the character to select specialist spells."
    //
    // `grantChosenSpell` excludes specialist spells by default, and the
    // paragraph defending that default names THIS FEATURE as one of the
    // things it is protecting: "a specialist spell is what a heritage,
    // wizard school or DIVINE ASPECT hands you". The guard was written
    // with the victim's name in it. Every one of the 44 spells the ten
    // aspects list carries `specialist: true`, so the filter emptied the
    // list before the aspect's own name filter ever ran — the chooser
    // reported "no matching spells found in the compendium" for every
    // aspect, on every character, always.
    //
    // The Bard, Druid and Specialist Spell choosers all carry this line
    // and a comment saying why. This one is the granting side of the
    // same rule and had neither.
    allowSpecialist: true,
    filter: (entry) => wanted.has(key(entry.name)) &&
      (!clerical || Number(entry.system?.ppCost ?? -1) === 1),
    flagKey: "aspectSpecialistSpell",
    grantNote: clerical
      ? "Your deific aspect's PP 1 specialist spell. Press Use again to change it."
      : "Your deific aspect's specialist spell. Press Use again to change it.",
    sourceItem: item
  });
  return Boolean(created);
}

/**
 * What to call the thing a specialist-skill choice hangs off, on a card.
 *
 * "your background" for a background, "your race" for a race, and the
 * item's own name for anything else — so a feat or an ability that grows
 * this mechanism later says something true without another edit here.
 */
function carrierLabel(item) {
  const type = String(item?.type ?? "").trim();
  if (type === "background") return "the background";
  if (type === "race") return "the race";
  if (type === "heritage") return "the heritage";
  return item?.name ? `${item.name}` : "the item that granted it";
}

async function useBackgroundSpecialistChoice(actor, item) {
  const choice = item?.getFlag?.(SYSTEM_ID, "specialistChoice");
  if (!choice) {
    ui.notifications.warn(`${item?.name ?? "This background"} declares no specialist-skill choice.`);
    return false;
  }

  const { planSpecialistSkills } = await import("./specialist-grants.mjs");
  const total = Math.max(1, Number(choice.count) || 1);

  const storedKeys = actor.getFlag(SYSTEM_ID, "backgroundChoiceKeys")?.[item.id];
  // Per-SLOT memory, as an array. A single remembered key meant Scholar's
  // second lore deleted the first. A legacy world holds a bare string
  // here from when every chooser asked once; that lands at index 0, which
  // is the only slot those backgrounds have.
  const keys = Array.isArray(storedKeys) ? [...storedKeys] : storedKeys ? [storedKeys] : [];
  const skills = actor.system?.specialistSkills ?? {};

  // ALL answers are collected before anything is written.
  //
  // Asking and writing slot by slot meant the two lores could never be
  // swapped: each pass collided with the other slot's still-present
  // entry and reported "unchanged". Worse, excluding the other slot to
  // fix that made pass 0 write over the very key pass 1 was about to
  // delete. Gathering first makes the whole edit one atomic decision.
  const answers = [];
  let asked = false;
  for (let pass = 0; pass < total; pass += 1) {
    const prompt = total > 1
      ? `${choice.prompt ?? choice.label} (${pass + 1} of ${total})`
      : (choice.prompt ?? choice.label);
    const currentLabel = String(skills[keys[pass]]?.label ?? "");
    // Pre-filled with this slot's current answer, so editing the second
    // doesn't mean retyping the first from memory.
    const answer = await enterText(item.name, prompt, choice.placeholder ?? "", currentLabel);
    // Cancelling a slot means "leave this one as it is" — it does not
    // abandon the slots after it.
    if (!answer) { answers.push(currentLabel || null); continue; }
    asked = true;
    answers.push(applySuffix(answer, choice.suffix));
  }
  if (!asked) return false;

  // Everything this background currently owns is out of the way for the
  // dedupe — the player is allowed to reuse their own slots' labels.
  const others = { ...skills };
  for (const key of keys) if (key) delete others[key];

  // Planned SLOT BY SLOT, not as one flat list.
  //
  // planSpecialistSkills takes labels and hands back only the ones it
  // could create, so a flat call loses which answer belonged to which
  // slot. That was not cosmetic: a pick dropped because the label already
  // existed elsewhere on the sheet left its slot's key out of the write
  // set, and the key was then deleted as stale — so typing a name you
  // already had DELETED a different lore, while the card said "that pick
  // is unchanged". The compacted result also renumbered the surviving
  // slots, so the next run pre-filled slot 2's answer into slot 1.
  //
  // `taken` grows as slots are planned, so two slots given the same
  // answer still collide with each other exactly as before.
  const taken = { ...others };
  const slots = [];
  const skipped = [];
  for (let pass = 0; pass < total; pass += 1) {
    // A slot keeps what it already holds whenever its answer cannot be
    // used — cancelled, blank, or colliding.
    const held = keys[pass] && skills[keys[pass]]
      ? { key: keys[pass], label: String(skills[keys[pass]].label ?? ""), isNew: false }
      : null;
    const wanted = answers[pass];
    if (!wanted) { slots.push(held); continue; }
    const planned = planSpecialistSkills([wanted], taken);
    if (!planned.create.length) {
      skipped.push(...planned.skipped);
      slots.push(held);
      continue;
    }
    const [entry] = planned.create;
    taken[entry.key] = { label: entry.label };
    slots.push({ ...entry, isNew: true });
  }

  if (skipped.length) {
    await postCard(actor, item.name, [
      line(`<strong>${esc(skipped.join(", "))}</strong> already on your sheet — that pick is unchanged.`),
      line("<em>Rename or remove that entry first if you want this background to own it.</em>")
    ]);
  }

  // Positional: one entry per slot, null for a slot with nothing in it.
  // Compacting this list is what made the prompts describe the wrong slot.
  const newKeys = slots.map((slot) => slot?.key ?? null);
  const rewritten = new Set(newKeys.filter(Boolean));
  const writes = slots.filter((slot) => slot?.isNew);
  const removals = keys.filter((key) => key && !rewritten.has(key));
  if (!writes.length && !removals.length) return false;

  // One update — but NOTHING may be both deleted and set in it.
  //
  // A deletion and an assignment to the same key are, since Foundry 14,
  // the very same object property — one plain JS overwrite wins, no
  // special precedence involved. Before the ForcedDeletion sentinel
  // replaced the old `-=` prefix, they were two DIFFERENT string keys
  // that could both land in one update object, and Foundry's own
  // deletion-always-wins handling of that pairing is what caused the
  // bug this comment used to describe: an update carrying `-=aaLore`,
  // `-=bbLore`, `bbLore` and `aaLore` together left the actor with
  // neither, whatever the key order. The same trap already cost the
  // compendium refresh its content flags once.
  //
  // The underlying hazard remains the same, just enforced differently
  // now: `removals` and `writes` below must stay disjoint sets of keys,
  // or whichever loop runs second silently overwrites the first.
  //
  // It bites HERE because a re-run usually produces the same slugs.
  // Swap Scholar's two lores, or retype one unchanged, and
  // planSpecialistSkills — which dedupes against everything EXCEPT this
  // background's own keys, precisely so reusing your own labels is
  // allowed — hands back `astronomyLore` and `heraldryLore` again. Both
  // were then queued for deletion and for creation, and both vanished:
  // the character silently lost the two skills the swap was meant to
  // reorder, and the next Use had nothing left to pre-fill from.
  const update = {};
  for (const key of removals) update[`system.specialistSkills.${key}`] = deletionValue();
  for (const { key, label } of writes) {
    // A key this background already holds keeps its bonus fields and its
    // ability, and only changes label — a swap reuses both slugs, and
    // blanking them would cost the player every number they had typed.
    update[`system.specialistSkills.${key}`] = { ...specialistBase(actor, key, skills[key]), label };
  }
  await actor.update(update);

  const record = { ...(actor.getFlag(SYSTEM_ID, "grantedSpecialistSkills") ?? {}) };
  // Only the keys THIS chooser previously held are replaced. A background
  // may ALSO grant a literal specialist skill — Archaeologist grants
  // Archaeology and asks for an Ancient Civilisation Lore — and that
  // grant is recorded against the same item id. Overwriting the whole
  // entry orphaned it permanently: removing the background no longer knew
  // about it, and Apply Grants could not re-record it either, because
  // applySpecialistSkillGrants returns early when the skill already
  // exists, before it reaches its own record write.
  const literal = (record[item.id] ?? []).filter((key) => !keys.includes(key));
  record[item.id] = [...new Set([...literal, ...newKeys.filter(Boolean)])];
  await actor.setFlag(SYSTEM_ID, "grantedSpecialistSkills", record);
  await actor.setFlag(SYSTEM_ID, "backgroundChoiceKeys", { [item.id]: newKeys });

  const finalLabels = slots.filter(Boolean).map((slot) => slot.label);
  await postCard(actor, item.name, [
    line(`Specialist skill${finalLabels.length > 1 ? "s" : ""}: <strong>${esc(finalLabels.join(", "))}</strong>.`),
    // THE NOUN FOLLOWS THE ITEM (3.552.3). This said "with the background"
    // whatever carried the choice, which was true of all eight backgrounds
    // and became false the moment the Human's ethnicity lore reached the
    // same prompt: a race's card told the player their lore leaves with a
    // background they have not got. Found in live testing on 15 Sep 2026.
    line(`<em>${finalLabels.length > 1 ? "They leave" : "It leaves"} with ${carrierLabel(item)}. Use this button again to change ${finalLabels.length > 1 ? "them" : "it"}.</em>`)
  ]);
  return true;
}

/**
 * The stored shape of a specialist skill, safe to write back.
 *
 * `prepareDerivedData` OVERWRITES `class`, `total` and `dc` on every
 * specialist skill each cycle (documents/actor.mjs) — class from the
 * character's class bonus, the other two from the resolved roll. Writing
 * the prepared entry back therefore persists three numbers the sheet
 * recomputes anyway, and on a world where the actor's own `_source` still
 * holds the legacy ARRAY shape the prepared copy is the ONLY thing
 * available, so this path is reached in earnest rather than in theory.
 */
function specialistBase(actor, key, prepared) {
  const source = actor?._source?.system?.specialistSkills;
  if (source && !Array.isArray(source) && source[key]) return { ...source[key] };
  if (!prepared) return blankSpecialistSkill("intelligence");
  const entry = blankSpecialistSkill(String(prepared.ability ?? "intelligence"));
  // `class` is deliberately not carried across: it is not a stored slot
  // for specialist skills, it is the character's class bonus stamped on.
  for (const field of ["racial", "item", "status", "other"]) {
    entry[field] = Number(prepared[field]) || 0;
  }
  return entry;
}

/**
 * "One Ancient Civilisation Lore" wants the answer turned into a lore
 * ("Old Numaria" → "Old Numaria Lore"); a craft specialty is used as
 * typed.
 *
 * Matched as a whole WORD — "Swamp Lore" keeps its suffix, "Old Numaria"
 * gains one. A single word that merely ENDS in those letters
 * ("Folklore") still gains it, which is deliberate: the alternative is a
 * substring match that would drop the marker from any answer containing
 * the letters anywhere. The suffix is escaped before it reaches the
 * RegExp — it is authored today, but interpolating a data-driven string
 * raw is one rename away from a syntax error at Use time.
 */
function applySuffix(answer, suffix) {
  const tail = String(suffix ?? "").trim();
  if (!tail) return answer;
  const escaped = tail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const already = new RegExp(`(^|\\s)${escaped}$`, "i").test(answer.trim());
  return already ? answer : `${answer} ${tail}`;
}
/**
 * The "+N racial bonus to your racial specialist skill" pattern (Cultural,
 * Dwarven/Elven/Halfling Scholar): until races define their specialist
 * skills (reconciliation q8), the player chooses which of the actor's
 * specialist skills carries the bonus.
 */
async function specialistSkillBonus(actor, item, { title, value }) {
  const specialist = Object.entries(actor.system.specialistSkills ?? {});
  if (!specialist.length) {
    ui.notifications.warn(`${title}: this character has no specialist skills yet — add one on the Skills tab first.`);
    return;
  }
  const slug = await chooseFromList(title, `Specialist skill for the +${value} racial bonus`,
    specialist.map(([key, skill]) => [key, skill.label ?? key]));
  if (!slug) return;
  const label = actor.system.specialistSkills[slug]?.label ?? slug;
  await replaceFeatEffect(actor, item, {
    name: `${title}: ${label} +${value}`,
    img: item.img,
    changes: [{
      key: `system.specialistSkills.${slug}.racial`,
      type: CHANGE_TYPE.ADD,
      value: String(value),
      priority: 20
    }]
  });
  await postCard(actor, title, [
    line(`+${value} racial bonus to the <strong>${label}</strong> specialist skill (visible in its racial slot).`)
  ]);
}

/* -------------------------------------------------------------------- */
/*  Stored-delta grants, trued up at daily preparation                   */
/* -------------------------------------------------------------------- */

/**
 * pp.max is a stored, sheet-editable value, and stays one — the class table deliberately does not assign it (no class PP engine yet — the class tables carry a PP column, but wiring it up has to be designed against these stored-delta grants rather than over them), so this
 * grant is applied as a RECORDED stored delta rather than an in-memory
 * bonus that a sheet submit would bake in twice. The flag remembers what
 * was granted; reconciliation trues it up after level changes and reverses
 * it cleanly if the feat is removed.
 */
/**
 * How many levels a PER-LEVEL racial or heritage Power Point line counts.
 *
 * ONE OWNER, because three groups of grants ask this question and they
 * must not drift: the racial lines (Ascendan, Elf, Gnome, Orc), the
 * heritage line that corrects one (Sharuk-Xal), and the heritages whose
 * printed text already said "per level" (Urloch, Gul-Fyr, Fey). Before
 * 3.417.0 the first two were flat and the third scaled, so the same
 * printed phrase meant two different things depending on which item it
 * was written on.
 *
 * Floored at zero: a level of 0 or a missing one grants nothing rather
 * than reaching for a negative multiple.
 */
/* NOT EXPORTED: it is a two-line adapter from an actor to `ppLevels`,
   used only by the grant rows below. The rule itself lives in
   racial-pp.mjs, where a harness can reach it; exporting the adapter as
   well would add an uncalled export and say nothing new. */
function racialPPLevels(actor) {
  return ppLevels(actor?.system?.identity?.level);
}

/** Level-scaled stored-delta grants: feature name → flag, path, due. */
export const PP_GRANTS = [
  {
    name: "aura of power",
    flag: "auraOfPowerGranted",
    label: "Aura of Power",
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    due: (actor) => Math.max(0, Number(actor.system.identity?.level ?? 0))
  },
  {
    name: "elven magic",
    flag: "elvenMagicPPGranted",
    label: "Elven Magic",
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    due: (actor) => Math.max(0, Number(actor.system.magic?.casterLevelValue ?? 0))
  },
  {
    name: "stone-like endurance",
    flag: "stoneLikeHPGranted",
    label: "Stone-Like Endurance",
    path: "system.resources.hp.other",
    statLabel: "Max HP (misc)",
    due: (actor) => Math.max(0, Number(actor.system.identity?.level ?? 0))
  },
  {
    name: "inner reserve",
    flag: "innerReserveHPGranted",
    label: "Inner Reserve",
    path: "system.resources.hp.other",
    statLabel: "Max HP (misc)",
    due: (actor) => Math.max(0, Number(actor.system.identity?.level ?? 0))
  },
  // ---- Archetype stored-delta grants (Chapter 5, 3.185.0) ----
  {
    name: "war priest",
    flag: "warPriestHPGranted",
    label: "War Priest",
    path: "system.resources.hp.other",
    statLabel: "Max HP (misc)",
    due: (actor) => 2 * Math.max(0, Number(actor.system.identity?.level ?? 0))
  },
  {
    name: "enigma",
    flag: "enigmaPPGranted",
    label: "Enigma",
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    due: (actor) => 2 * Math.max(0, Number(actor.system.identity?.level ?? 0))
  },
  {
    name: "cloistered priest",
    flag: "cloisteredPriestPPGranted",
    label: "Cloistered Priest",
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    due: (actor) => Math.max(0, Number(actor.system.magic?.casterLevelValue ?? 0))
  },
  // Knight feats (Class, Chapter 5): Arcane/Divine Knight, Noble
  // Warrior, Primal Defender — "low PP (1 per level)". The half-level
  // caster level and the PP 2 memorisation stay on each feat's note.
  ...["arcane knight", "divine knight", "noble warrior", "primal defender"].map((name) => ({
    name,
    flag: `${name.replace(/\s+(.)/g, (m, c) => c.toUpperCase())}PPGranted`,
    label: name.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    due: (actor) => Math.max(0, Number(actor.system.identity?.level ?? 0))
  })),
  // "You gain a BSB equal to half your level" — the four caster
  // archetypes. Stored deltas onto the sheet's BSB field, trued up as
  // levels change.
  //
  // A FLOOR, NOT AN ADDITION (Graham, 20 August 2026: "the BSB modifier
  // should only be applied if the character does not already have a
  // higher BSB"). Until now this handed half level to anyone, so a
  // Cleric taking Arcanist stacked it on top of a class table that
  // already gave more. `archetypeBSBDue` compares against the BSB the
  // character would have WITHOUT this grant — class table plus their own
  // field, minus what this grant has already recorded — so it fills a
  // gap and nothing else, and gives its contribution back if the class
  // table later overtakes the floor.
  ...["animist", "arcanist", "gleeman", "priest"].map((name) => ({
    name,
    flag: `${name}BSBGranted`,
    label: name.charAt(0).toUpperCase() + name.slice(1),
    path: "system.magic.bsb",
    statLabel: "BSB",
    due: (actor) => archetypeBSBDue({
      level: actor.system.identity?.level,
      classBSB: actor.system.progression?.bsb,
      // The STORED field, not the derived one — see `storedValue`.
      ownFieldBSB: foundry.utils.getProperty(actor?._source ?? actor, "system.magic.bsb"),
      alreadyGranted: actor.getFlag?.(SYSTEM_ID, `${name}BSBGranted`)
    })
  })),
  // Chapter 2 racial Power Points: a flat, one-off line in the race's
  // mechanics box, not a per-level rate. Recorded as stored deltas like
  // everything else that touches pp.max, so the field stays the
  // player's to edit and removing the race hands the point back.
  // The Orc's -1 is a genuine negative due; reconcilePPGrant handles it
  // symmetrically and Math.max(0, …) keeps the pool itself off negatives.
  // Heritage Power Point lines (Chapter 2). Sharuk-Xal's "+1 instead of
  // -1" is a delta of +2 against the Orc's own -1, which the race grant
  // has already applied.
  ...[{ heritage: "Sharuk-Xal", value: HERITAGE_PP_PER_LEVEL["sharuk-xal"] }].map(({ heritage, value }) => ({
    name: heritage.toLowerCase(),
    flag: `${heritage.toLowerCase().replace(/-/g, "")}HeritagePPGranted`,
    label: `${heritage} (Power Points)`,
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    types: ["heritage"],
    // PER LEVEL, like the racial line it corrects — see the race block
    // below. Sharuk-Xal reads "your racial Power Points are +1 instead of
    // -1", so it must scale exactly as the racial figure it replaces:
    // flat here against a per-level race would have drifted a point
    // further out of true at every level.
    due: (actor) => value * racialPPLevels(actor)
  })),
  // Per-LEVEL heritage lines (Chapter 2): Urloch, Gul-Fyr and the Fey
  // human each gain "an additional PP per level"; Stout-Fyr gains "+1 per
  // level bonus to HP". Same stored-delta mechanism as the flat lines
  // above, but the due scales with level and is trued up on level change.
  // `types: ["heritage"]` keeps the name match off a same-named feat.
  ...[
    { heritage: "Urloch", stat: "pp", value: HERITAGE_PP_PER_LEVEL.urloch },
    { heritage: "Gul-Fyr", stat: "pp", value: HERITAGE_PP_PER_LEVEL["gul-fyr"] },
    { heritage: "Fey", stat: "pp", value: HERITAGE_PP_PER_LEVEL.fey },
    { heritage: "Stout-Fyr", stat: "hp", value: 1 }
  ].map(({ heritage, stat, value }) => {
    const slug = heritage.toLowerCase().replace(/-/g, "");
    return {
      name: heritage.toLowerCase(),
      flag: `${slug}Heritage${stat.toUpperCase()}PerLevelGranted`,
      label: `${heritage} (${stat === "pp" ? "Power Points" : "HP"} per level)`,
      path: stat === "pp" ? "system.resources.pp.base" : "system.resources.hp.other",
      statLabel: stat === "pp" ? "maximum PP" : "Max HP (misc)",
      types: ["heritage"],
      // Same owner as the racial lines — see racialPPLevels.
      due: (actor) => value * racialPPLevels(actor)
    };
  }),
  // Chapter 2 BACKGROUND Power Points — the Lay Healer's "you also gain an
  // additional power point". Worded exactly as the racial lines are, so
  // carried the same way: a recorded stored delta on the player's own
  // pp.max field, reversed when the background is removed.
  ...[{ background: "Lay Healer", value: 1 }].map(({ background, value }) => ({
    name: background.toLowerCase(),
    flag: `${background.toLowerCase().replace(/[^a-z]/g, "")}BackgroundPPGranted`,
    label: `${background} (Power Points)`,
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    types: ["background"],
    due: () => value
  })),
  // RACIAL POWER POINTS ARE PER LEVEL — Graham's ruling, 27 August 2026.
  //
  // They shipped FLAT (`due: () => value`), so an Orc Sharuk-Xal at 3rd
  // level carried the +1 the pair nets out to, once, instead of once per
  // level. That is what "Sharuk-Xal is not adding PP correctly" was: the
  // grant fired, the arithmetic was right, and the scale was wrong — a
  // gap that widens by a point every level and therefore looks fine on
  // the character you build it on.
  //
  // The three heritages that say "an additional PP per level" (Urloch,
  // Gul-Fyr, Fey) now grant the same KIND of thing a race does, and are
  // simply a second helping of it. Graham was shown that consequence
  // when the ruling was made.
  // THE VALUES COME FROM racial-pp.mjs, not a second copy here. Only the
  // races that actually owe something need a grant row; the four printed
  // at 0 are recorded there so "grants nothing" is distinguishable from
  // "nobody checked".
  ...Object.entries(RACIAL_PP_PER_LEVEL)
    .filter(([, value]) => value !== 0)
    .map(([key, value]) => ({ race: key[0].toUpperCase() + key.slice(1), value }))
    .map(({ race, value }) => ({
    name: race.toLowerCase(),
    flag: `${race.toLowerCase()}RacialPPGranted`,
    label: `${race} (racial Power Points)`,
    path: "system.resources.pp.base",
    statLabel: "maximum PP",
    types: ["race"],
    due: (actor) => value * racialPPLevels(actor)
  }))
];

/** A stored-delta grant looked up by feature name. */
function ppGrantByName(name) {
  return PP_GRANTS.find((g) => g.name === name) ?? null;
}

/**
 * The STORED value at a path, not the derived one.
 *
 * Every stored-delta grant in this file reads a value, adds to it, and
 * writes it back. `foundry.utils.getProperty(actor, path)` returns the
 * value AFTER Active Effects have been applied — so if any effect also
 * writes that slot, the effect's contribution is read and then baked into
 * the stored data, and it compounds on every reconcile.
 *
 * That was harmless while these paths were touched by nothing else. The
 * Chapter 2 backgrounds put a bonus on skill class slots and made it
 * live: a Soldier who also took a class-skill grant on Athletics would
 * have gained a further +1 at every level band, permanently, and removing
 * the feat would not have handed it back. Found in review of 3.197.0.
 *
 * `actor._source` is the un-derived document data, which is what a
 * read-modify-write against a stored field has always meant.
 */
function storedValue(actor, path) {
  return Number(foundry.utils.getProperty(actor?._source ?? actor, path) ?? 0);
}

/**
 * True up one PP-per-level grant. pp.max is a stored, sheet-editable value
 * (no class engine yet), so grants are RECORDED stored deltas — the flag
 * remembers what was granted, reconciliation adjusts after level changes,
 * and removal of the feature reverses it at the next reconcile.
 */
async function reconcilePPGrant(actor, grant, { report = false } = {}) {
  // Feats and abilities were the only stored-delta carriers until
  // Chapter 2 landed. A race's Power Point line (Ascendan +1, Orc -1)
  // belongs on the RACE item itself, and the same mechanism serves it —
  // hence the per-grant type list, defaulting to the original pair. It
  // has to be a stored delta rather than an effect for the same reason
  // every other one is: pp.max is the player's own editable field until
  // classes land, and an effect writing it would lock them out of it.
  const types = grant.types ?? ["feat", "ability"];
  const owned = actor.items.some(
    (i) => types.includes(i.type) && normalise(i.name) === grant.name
  );
  const granted = Number(actor.getFlag(SYSTEM_ID, grant.flag) ?? 0);
  const due = owned ? grant.due(actor) : 0;
  if (granted === due) return null;

  const delta = due - granted;
  const path = grant.path ?? "system.resources.pp.base";
  const current = storedValue(actor, path);
  // The write is floored so the POOL cannot go negative, and what
  // actually lands is not always the delta that was asked for. The flag
  // has to record what HAPPENED, not what was owed: recording the
  // intention while the floor swallowed it meant the Orc's -1 racial PP
  // against a pool of 0 was never subtracted, and then handed a whole
  // point BACK when the race was removed. Tracking the applied amount
  // instead also lets the outstanding part land later, once the pool is
  // large enough to take it.
  //
  // Floored against the RESOLVED maximum, not against the base. For a
  // caster the base is legitimately 0 — the whole pool comes from the
  // class table and the magical ability score — so flooring on the base
  // swallowed every negative grant on every caster, permanently: an Orc
  // Ranger's -1 never landed, and Sharuk-Xal's "+2 against the Orc's own
  // -1" then netted +2 instead of +1.
  const floor = path.endsWith("resources.pp.base")
    ? -(Number(actor.system?.resources?.pp?.classTable ?? 0) +
        Number(actor.system?.resources?.pp?.abilityBonus ?? 0))
    : 0;
  const next = Math.max(floor, current + delta);
  const applied = next - current;
  const recorded = granted + applied;
  if (applied) await actor.update({ [path]: next });
  if (recorded === 0) {
    // A negative grant against a pool too small to take it settles at
    // recorded 0 while `due` stays negative, so this branch is reached
    // on every single reconcile — and reconciliation now runs on daily
    // prep, on every item deletion AND on every Apply Grants. unsetFlag
    // doesn't check existence before writing, so an unguarded call here
    // meant a real document update, broadcast and re-render, several
    // times over for a flag that was never set.
    if (actor.getFlag(SYSTEM_ID, grant.flag) !== undefined) {
      await actor.unsetFlag(SYSTEM_ID, grant.flag);
    }
  } else await actor.setFlag(SYSTEM_ID, grant.flag, recorded);
  if (!applied) return null;

  const signed = (value) => `${value > 0 ? "+" : ""}${value}`;
  const summary = `${grant.label}: ${grant.statLabel ?? "maximum PP"} ${signed(applied)} (now includes ${signed(recorded)} from the feature).`;
  if (report) await postCard(actor, grant.label, [line(summary)]);
  return summary;
}

/** Kept for API/back-compat: Aura of Power's reconcile, now via PP_GRANTS. */
export async function reconcileAuraOfPower(actor, { report = false } = {}) {
  return reconcilePPGrant(actor, PP_GRANTS[0], { report });
}

/**
 * Take Blade Ally's rune back off whichever weapon is carrying it.
 *
 * Called from two places and it must behave identically in both: when the
 * Crusader imbues a different weapon (feats-workflow, just before the new
 * one is written) and when the day turns (uses-workflow's Daily
 * Preparation). "Select one weapon when you make your daily preparations"
 * makes the imbuement a DAILY thing, so it lapses rather than persisting
 * until manually moved.
 *
 * RESTORES THE SAVED FIELD RATHER THAN SUBTRACTING THE RUNE. The flag
 * records `previousRunes` — the field exactly as it stood before the ally
 * landed — so a rune the player added by other means while imbued is not
 * lost, and removing the divine rune cannot accidentally strip a bought
 * one of the same name.
 *
 * SILENT AND IDEMPOTENT. Nothing imbued, weapon since deleted, or a flag
 * written before 3.330.0 (which has no `previousRunes`) all mean "nothing
 * to give back" — and a pre-3.330.0 flag genuinely has nothing to give
 * back, because that version never wrote the weapon at all.
 *
 * @param {Actor} actor
 * @param {Item} allyItem the Divine Ally ability
 * @returns {Promise<string|null>} the released weapon's name, or null
 */
export async function releaseBladeAlly(actor, allyItem) {
  const held = allyItem?.flags?.[SYSTEM_ID]?.bladeAlly;
  if (!held?.weaponId) return null;
  const weapon = actor?.items?.get?.(held.weaponId);
  await allyItem.unsetFlag(SYSTEM_ID, "bladeAlly");
  if (!weapon) return null;
  // The etching exemption goes with the rune, always — even on the
  // pre-3.330.0 path below that has no field to restore, since a stale
  // exemption would silently spare a rune the player later buys.
  await weapon.unsetFlag(SYSTEM_ID, "bladeAllyRune");
  if (held.previousRunes === undefined) return null;
  if (String(weapon.system?.runes ?? "") !== String(held.previousRunes)) {
    // The field moved while we held it. The saved value is still the right
    // thing to restore — it is what the weapon carried before the ally
    // arrived — but say so rather than overwriting quietly.
    ui.notifications?.info?.(
      `Blade Ally: ${weapon.name}'s runes changed while imbued; restoring what it carried before.`
    );
  }
  await weapon.update({ "system.runes": String(held.previousRunes) });
  return weapon.name;
}

/**
 * Exceptional Training (Human): the chosen skill's class slot must track
 * the character's class bonus as it grows with level. Stored-delta style:
 * the flag records which skill and what was written; reconcile trues up.
 */
export async function reconcileExceptionalTraining(actor) {
  return unwindClassSkillDelta(actor, "exceptionalTraining", "Exceptional Training", "exceptional training");
}

/**
 * Undo a legacy stored-delta class-skill write.
 *
 * These grants used to WRITE the class bonus into
 * `system.skills.<key>.class` and true it up at Daily Preparation and on
 * every level change. As of 3.204.0 the bonus is derived from the flag
 * instead, so the stored number is a duplicate: the character would carry
 * the class bonus twice, once from the old write and once from the
 * derive.
 *
 * So reconcile no longer writes anything — it only takes back what a
 * previous version wrote, once, and then has nothing left to do. The
 * function stays because Daily Preparation and the level-change hook both
 * call it, and because a world that has not opened every character yet
 * still has deltas sitting in it.
 */
async function unwindClassSkillDelta(actor, flagKey, label, featName) {
  const record = actor.getFlag(SYSTEM_ID, flagKey) ?? null;
  if (!record?.skill) return null;
  const written = Number(record.written ?? 0);
  const owned = !featName || actor.items.some(
    (i) => i.type === "feat" && normalise(i.name) === featName
  );

  // The feat is gone: forget the choice entirely, so the derive stops
  // counting it. (It already ignores grants whose feat is absent — this
  // is the tidy-up, not the mechanism.)
  if (!owned) {
    if (written > 0) {
      const path = `system.skills.${record.skill}.class`;
      await actor.update({ [path]: Math.max(0, storedValue(actor, path) - written) });
    }
    await actor.unsetFlag(SYSTEM_ID, flagKey);
    return null;
  }

  if (written === 0) return null;
  const path = `system.skills.${record.skill}.class`;
  // `storedValue` reads actor._source. A derived read here would see the
  // bonus the new code has just contributed and subtract it from storage.
  await actor.update({ [path]: Math.max(0, storedValue(actor, path) - written) });
  await actor.setFlag(SYSTEM_ID, flagKey, { skill: record.skill, written: 0 });
  const skillLabel = actor.system.skills?.[record.skill]?.label ?? record.skill;
  return `${label}: ${skillLabel} is a class skill — the old typed bonus has been taken back out, since it is worked out from your class bonus now.`;
}

/* -------------------------------------------------------------------- */
/*  Class-skill grants (archetypes, 3.185.0)                             */
/* -------------------------------------------------------------------- */

/**
 * Archetype feats that make a skill a CLASS skill: the chosen skill's
 * class slot tracks the character's class bonus, exactly the Exceptional
 * Training pattern — a recorded stored delta, trued up at daily prep and
 * reversed if the feat is removed. `options` limits the chooser
 * ("any" = every skill).
 */
// IMPORTED and then re-exported, not re-exported directly.
//
// `export { X } from "./y.mjs"` forwards the name to this module's
// consumers and creates NO local binding — so the twelve uses of
// CLASS_SKILL_GRANTS below this line were all ReferenceErrors, and
// every archetype class-skill chooser (Adventurer, Alchemist, Animist,
// Arcanist, Artificer, Champion, Gleeman, Priest, Thief, Warden,
// Warrior) plus Exceptional Training threw the moment its Use button
// was pressed. Broken since 3.204.0 and green in every harness, because
// nothing had ever resolved an identifier. See tools/verify-lint.mjs.
import { CLASS_SKILL_GRANTS } from "./class-skills.mjs";
import { queuedPassiveAutomation } from "./module-api.mjs";
import { FORMULA_BOOK_CAPACITY, hasFormulaCapacity, packItemData } from "./items.mjs";
import { parseGrantList as parseFormulaList } from "./grants.mjs";
import { effectiveClasses, elevatedLineageBlocked, elevatedLineageChoices, heritageMechanics } from "./feats.mjs";
import { repositionAvoided, repositionSaveDC, repositionSaveNote } from "./combat/improved-reposition.mjs";
import { alteredCantripBlocked, isOffTradition } from "./magic/casting-feats.mjs";
import { isProficientWith, proficiencyProfile } from "./proficiency-rules.mjs";
import { CHANGE_TYPE } from "./effect-change-types.mjs";
import { hasHulkingForm, hulkingFormEffectData, hulkingFormNote } from "./hulking-form.mjs";
import { deletionValue } from "./deletion.mjs";
import { speedValue } from "./combat/speed-pool.mjs";
import { contentPack } from "./content-packs.mjs";
export { CLASS_SKILL_GRANTS };

/**
 * The card and chooser helpers a COMPANION MODULE's automations need
 * (3.560.0), handed over through game.trgPrime.modules.helpers rather
 * than exported one by one. A module's Use handler should look and post
 * exactly like a core one, which means using the same four functions.
 */
export const MODULE_HELPERS = Object.freeze({
  line,
  postCard,
  replaceFeatEffect,
  chooseFromList,
  enterText,
  // The authored-choice runner: an item carrying skillChoice /
  // spellChoice / specialistChoice flags gets its Use from this, so a
  // module heritage that says "select any one Lore specialist skill" is
  // the same chooser a core background is.
  useBackground,
  /**
   * A module archetype's "choose one of these skills as a class skill"
   * (3.571.0): the feat registers its CLASS_SKILL_GRANTS entry through
   * `registerClassSkillGrant`, and its Use calls this to run the same
   * chooser the Priest's does. Nothing to do when no entry is registered
   * under the feat's name.
   */
  useClassSkillGrant: async (actor, item) => {
    const grant = CLASS_SKILL_GRANTS.find((g) => g.name === normalise(item?.name));
    if (!grant) {
      ui.notifications.warn(`${item?.name ?? "This feat"} has no class-skill grant registered.`);
      return false;
    }
    await chooseClassSkill(actor, item, grant);
    return true;
  }
});

/**
 * Take back one class-skill grant's legacy stored write.
 *
 * Nothing to true up any more: the bonus follows the class bonus because
 * it is derived from it, so a level change needs no write at all. See
 * unwindClassSkillDelta.
 */
async function reconcileClassSkillGrant(actor, grant) {
  return unwindClassSkillDelta(actor, grant.flag, grant.label, grant.name);
}

/** The chooser + first write for a class-skill grant's Use action. */
async function chooseClassSkill(actor, item, grant) {
  const existing = actor.getFlag(SYSTEM_ID, grant.flag);
  const options = (grant.options === "any"
    ? Object.keys(SKILLS)
    : grant.options
  ).map((key) => [key, SKILLS[key]?.label ?? key]);
  const key = grant.options.length === 1 && grant.options !== "any"
    ? grant.options[0]
    : await chooseFromList(grant.label,
      existing?.skill
        ? `Class skill (currently ${SKILLS[existing.skill]?.label ?? existing.skill})`
        : "Skill to become a class skill", options);
  if (!key) return;
  // Moving the grant to a different skill: nothing needs reversing now
  // that the bonus is derived — but a world that has not been through
  // Daily Preparation since 3.204.0 may still carry the old written
  // amount on the previous skill, and that has to come off.
  if (existing?.skill && existing.skill !== key) {
    const oldPath = `system.skills.${existing.skill}.class`;
    // _source, not derived: Favoured Terrain writes ADD-mode changes to
      // skill class slots, and Miner now creates that effect automatically —
      // so a derived read here baked the effect into stored data and
      // compounded on every move of the grant.
      const oldCurrent = storedValue(actor, oldPath);
    await actor.update({ [oldPath]: Math.max(0, oldCurrent - Number(existing.written ?? 0)) });
  }
  await actor.setFlag(SYSTEM_ID, grant.flag, { skill: key, written: 0 });
  await reconcileClassSkillGrant(actor, grant);
  const label = SKILLS[key]?.label ?? key;
  await postCard(actor, grant.label, [
    line(`<strong>${label}</strong> is now a class skill — worth your class bonus, and it follows your class bonus as you level. Remove ${grant.label} and it stops counting.`)
  ]);
}

/* -------------------------------------------------------------------- */
/*  Feat stances (Chapter 5, 3.190.0)                                    */
/* -------------------------------------------------------------------- */

const FEAT_STANCE_FLAG = "featStance";

/**
 * Enter a feat stance: enforces the STANCE per-round rule ("wait at
 * least one round before using another"), replaces the previous feat
 * stance (or keeps one extra with Stance Mastery — its per-round
 * Exhaustion check stays a table rule, per its note), spends the AP,
 * and creates the stance's effect. The effect may carry
 * `stanceActionMods` — `{bonuses: [{actions, value, type, label}],
 * apReductions: {actionKey: n}}` — which the action workflow applies
 * while the stance is up.
 */
async function enterFeatStance(actor, item, { name, apCost = 1, description, changes = [], stanceActionMods = null, extraLines = [] }) {
  /* eslint-disable-next-line no-param-reassign -- see the Reactive Stance note below */
  const round = game.combat?.started ? (game.combat?.round ?? null) : null;
  // KEYED BY COMBAT (3.622.0; block 39's A15) — see `lastStanceRoundIn`.
  const lastStance = lastStanceRoundIn(actor);
  if (round !== null && lastStance !== null && round <= lastStance) {
    ui.notifications.warn(`${name}: you must wait at least one round after entering a Stance before using another.`);
    return;
  }
  // REACTIVE STANCE (Chapter 5) waives the cost for ONE entry, taken free
  // when initiative is rolled. The flag is set by the offer and cleared
  // the moment it has been honoured, so every other entry pays as usual —
  // and the waiver rides here rather than in a second copy of this
  // function, because everything else the stance rule polices (the
  // per-round wait, replacing the previous stance, Stance Mastery's extra)
  // must apply to a free entry exactly as it does to a bought one.
  if (actor.getFlag?.(SYSTEM_ID, "reactiveStanceFree")) apCost = 0;

  const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
  if (game.combat?.started && apCost > 0 && ap < apCost) {
    ui.notifications.warn(`${name}: ${apCost} AP required.`);
    return;
  }

  const existing = Array.from(actor.effects ?? [])
    .filter((e) => e.getFlag?.(SYSTEM_ID, FEAT_STANCE_FLAG));
  const mastery = actor.items.some(
    (i) => i.type === "feat" && normalise(i.name) === "stance mastery"
  );
  const keep = mastery ? 1 : 0;
  if (existing.length > keep) {
    await actor.deleteEmbeddedDocuments("ActiveEffect",
      existing.slice(0, existing.length - keep).map((e) => e.id));
  }

  if (game.combat?.started && apCost > 0) {
    await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - apCost });
  }
  if (round !== null) await actor.setFlag(SYSTEM_ID, "lastStanceRound", stanceStamp());

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name,
    img: item.img,
    description,
    changes,
    flags: {
      [SYSTEM_ID]: {
        [FEAT_STANCE_FLAG]: true,
        [FEAT_SOURCE_FLAG]: item.id,
        ...(stanceActionMods ? { stanceActionMods } : {})
      }
    }
  }]);

  await postCard(actor, name, [
    line(`<strong>${name}</strong> entered${game.combat?.started && apCost ? ` (${apCost} AP)` : ""} — its effect stays until you leave the stance (delete the effect) or enter another.`),
    ...(mastery && existing.length ? [line("<em>Stance Mastery: a second stance is running alongside — make an Exhaustion check each round beyond the first that both are maintained (both drop on a failure).</em>")] : []),
    ...extraLines
  ]);
}

/* -------------------------------------------------------------------- */
/*  The A-batch automation registry                                      */
/* -------------------------------------------------------------------- */

const SKILL_OPTIONS = Object.entries(SKILLS).map(([key, def]) => [key, def.label ?? key]);

/**
 * Write a feat's free formula into the character's formula book.
 *
 * WHY THIS EXISTS. Alchemical Crafting, Brew Potion and Magical Crafting
 * each print "You may add the formula for any one ... when you select
 * this feat", and each of their Use handlers asked for the name and then
 * recorded it as an ActiveEffect ON THE FEAT — a place nothing else
 * reads. The character's actual formula list lives in `system.formulae`
 * on a book (any item carrying the "stores formulae" trait), which is
 * what Add Formula maintains and what the sheet shows. So the formula
 * was captured and then filed somewhere it could never be used.
 * Reported by Graham, 12 Aug 2026.
 *
 * NO GOLD IS CHARGED. Add Formula buys one at 10% of the item's price;
 * this one is granted by the feat, and "you may add the formula ... when
 * you select this feat" is not a purchase.
 *
 * The book's 20-formula capacity still applies — it is the book's limit,
 * not the purchase's — and a character with no book at all is told so
 * rather than silently losing the formula.
 *
 * @param {Actor} actor
 * @param {string} formula
 * @returns {Promise<{book: Item, count: number}|null>}
 */
async function addFormulaToBook(actor, formula) {
  const books = Array.from(actor.items ?? []).filter((i) =>
    /\bstores formulae\b/i.test(String(i.system?.traits ?? "")));
  if (!books.length) {
    ui.notifications.warn(
      `No formula book: ${actor.name} needs a Crafting Book or Formula Book to write "${formula}" into. ` +
      "Add one and press Use again."
    );
    return null;
  }
  // Whichever has room. A character with two books and a full first one
  // should not be told they are out of space.
  const book = books.find((b) => hasFormulaCapacity(parseFormulaList(b.system?.formulae).length))
    ?? null;
  if (!book) {
    ui.notifications.warn(
      `Every formula book ${actor.name} carries is full (${FORMULA_BOOK_CAPACITY} formulae, Chapter 6).`
    );
    return null;
  }
  const existing = parseFormulaList(book.system?.formulae);
  if (existing.some((entry) => entry.trim().toLowerCase() === formula.trim().toLowerCase())) {
    ui.notifications.info(`${book.name} already holds the ${formula} formula.`);
    return { book, count: existing.length };
  }
  existing.push(formula);
  await book.update({ "system.formulae": existing.join(", ") });
  return { book, count: existing.length };
}

/**
 * The Warrior archetype's either/or, in one place.
 *
 * "You may choose to become proficient in either all simple and martial
 * weapons or all armour and shields." A table keyed by feat name cannot
 * express "one of these two", which is why this needs a chooser at all —
 * and why the archetype granted nothing until 3.302.0 while its card
 * said otherwise.
 *
 * `grantKey` is what the chosen effect carries; proficiency-rules.mjs
 * owns what each key actually grants (PROFICIENCY_CHOICE_GRANTS), so the
 * package is defined once, beside every other proficiency rule, rather
 * than half here and half there.
 */
/**
 * Sacred Weapon: etch your deity's symbol onto a favoured weapon.
 *
 * "The item transforms into a religious symbol of the gods, serving as a
 * divine focus for members of your faith. Additionally, the item also
 * becomes a +1 Divine Spell Adder."
 *
 * BOTH HALVES ARE CHANNELS THAT ALREADY EXIST. `spellAdderSources` reads
 * `flags.trg-prime.spellAdder` off ANY item and its own comment already
 * names this feat as the reason that channel is open; the divine-focus
 * half is the `magic.focusCasting`/`focusReady` pair the component gate
 * reads. Nothing new is invented, which is why this is a Use button and
 * not a system.
 *
 * THE VANISHING IS THE RULE WORTH KEEPING. "If you etch a symbol onto a
 * different weapon, the original one INSTANTLY VANISHES" — a year is long
 * enough that no table will see the duration expire, but moving the
 * symbol happens the first time a Crusader finds a better sword.
 * `sacredWeaponSuperseded` answers which items stop being sacred, so this
 * cannot forget one.
 */
async function etchSacredWeapon(actor, item) {
  const { SACRED_WEAPON_ADDER, SACRED_WEAPON_DAYS, sacredWeaponSuperseded } =
    await import("./combat/grant-feats.mjs");
  const weapons = Array.from(actor.items ?? []).filter((i) => i.type === "weapon");
  if (!weapons.length) {
    ui.notifications.warn("Sacred Weapon: you have no weapons on your sheet to etch.");
    return;
  }
  const weaponId = await chooseFromList(
    "Sacred Weapon",
    "Which favoured weapon takes your deity's symbol? (10 minutes; lasts a year)",
    weapons.map((w) => [w.id, w.name])
  );
  if (!weaponId) return;

  const etched = weapons.filter((w) => w.flags?.[SYSTEM_ID]?.sacredWeapon);
  const lost = sacredWeaponSuperseded(etched, weaponId);
  for (const id of lost) {
    const old = actor.items.get(id);
    await old?.update({
      [`flags.${SYSTEM_ID}.sacredWeapon`]: deletionValue(),
      [`flags.${SYSTEM_ID}.spellAdder`]: deletionValue()
    });
  }

  const weapon = actor.items.get(weaponId);
  await weapon.update({
    [`flags.${SYSTEM_ID}.sacredWeapon`]: { etchedOn: Number(game.time?.worldTime ?? 0) },
    [`flags.${SYSTEM_ID}.spellAdder`]: SACRED_WEAPON_ADDER
  });

  await postCard(actor, "Sacred Weapon", [
    line(`Ten minutes' work etches your deity's symbol onto <strong>${weapon.name}</strong>.`),
    line(`It is now a <strong>divine focus</strong> for members of your faith and a <strong>+${SACRED_WEAPON_ADDER} Divine Spell Adder</strong>, for ${SACRED_WEAPON_DAYS} days.`),
    ...(lost.length
      ? [line(`<em>The symbol on ${lost.map((id) => weapons.find((w) => w.id === id)?.name ?? "your old weapon").join(", ")} instantly vanishes.</em>`)]
      : [])
  ]);
}

/**
 * Mercy of Relief's other half: spend the Crusader's Mercy use to cast
 * Restoration rather than to heal.
 *
 * "TREATED AS AN INNATE SPELL FOR CASTING RULE PURPOSES" is the whole of
 * how it casts, and it is not a phrase this needs to interpret: a
 * temporary Restoration marked innate goes through `castSpell` and picks
 * up every innate rule already written — no PP, no Spellcraft check, the
 * free warping budget, the component waivers. Building a second, shorter
 * heal here is the mistake `castInnateSpell` already taught this project.
 */
async function mercyOfReliefRestoration(actor, item, remaining) {
  const pack = contentPack("spells");
  const index = await pack.getIndex();
  const entry = index.find((e) => String(e.name).trim().toLowerCase() === "restoration");
  if (!entry) {
    ui.notifications.warn("Mercy of Relief: the Restoration spell is missing from the compendium.");
    return;
  }
  const source = (await pack.getDocument(entry._id)).toObject();
  delete source._id;
  source.system.innate = true;
  source.system.prepared = true;
  source.name = "Restoration (Mercy of Relief)";

  const [spell] = await actor.createEmbeddedDocuments("Item", [source]);
  try {
    const { castSpell } = await import("./magic/cast-workflow.mjs");
    const result = await castSpell(actor, spell);
    if (!result?.cast) return;
    const usesLeft = remaining === null || remaining === Infinity ? null : remaining - 1;
    if (usesLeft !== null) await item.update({ "system.usesValue": usesLeft });
    await postCard(actor, "Mercy of Relief", [
      line("Your touch relieves fatigue and injury — <strong>Restoration</strong> instead of healing."),
      ...(usesLeft !== null
        ? [line(`${usesLeft} Crusader's Mercy use${usesLeft === 1 ? "" : "s"} remaining today.`)]
        : [])
    ]);
  } finally {
    // A TEMPORARY DOCUMENT, DELETED WHETHER OR NOT THE CAST WORKED. The
    // spell is not the Crusader's to keep — it is a shape their Mercy took
    // for one action — and leaving it behind would put a permanent innate
    // Restoration on the sheet, restorable by Refocus and castable again.
    await spell.delete();
  }
}

const PROFICIENCY_CHOICES = Object.freeze({
  weapons: {
    label: "All simple and martial weapons",
    effectName: "Warrior: simple & martial weapons",
    grantKey: "warrior:weapons",
    description: "Proficient with every simple and martial weapon."
  },
  armour: {
    label: "All armour and shields",
    effectName: "Warrior: all armour & shields",
    grantKey: "warrior:armour",
    // NOT tower shields. The sentence stops at "all armour and shields",
    // exactly as the Crusader's own line does; the Fighter's is the one
    // that says "(including tower shields)" and the only entry in the
    // class table that gets them.
    description: "Proficient with all armour and with buckler, light and heavy shields (not tower shields)."
  }
});

/**
 * Put one of the four extra Wild Shape forms on the sheet as an innate
 * spell that spends the shared pool.
 *
 * REFUSES WITHOUT THE POOL. A Druid who has never pressed Wild Shape has
 * no Shape Of The Animal on their sheet, and a form spell created beside
 * nothing would be untracked — castable without limit, which is the
 * opposite of what these feats do. Saying so and sending the player to
 * the right button is the honest failure.
 */
async function configureFormFeatSpell(actor, item, spellName) {
  const wanted = normalise(spellName);
  const poolSpell = actor.items.find(
    (i) => i.type === "spell" && normalise(i.name) === normalise(WILD_SHAPE_POOL_SPELL)
  );
  if (!poolSpell?.system?.innate) {
    ui.notifications.warn(
      `${item.name}: press Use on your Wild Shape ability first — these forms spend its daily uses, so it has to exist before they can.`
    );
    return;
  }

  let spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === wanted);
  if (!spell) {
    const pack = contentPack("spells");
    const index = pack ? await pack.getIndex() : null;
    const entry = index ? Array.from(index.values()).find((s) => normalise(s.name) === wanted) : null;
    if (!pack || !entry) {
      ui.notifications.warn(`${item.name}: ${spellName} is not in the spells compendium.`);
      return;
    }
    const source = await pack.getDocument(entry._id);
    const data = packItemData(source);
    data.system.innate = true;
    // NO `usesPerDay` OF ITS OWN, deliberately. The empty field is what
    // makes `usesPoolItem` the only answer to "how many are left" — give
    // this spell a number and there are two counters again.
    data.system.usesPerDay = "";
    const traits = String(data.system.traits ?? "");
    if (!/\bfocus\b/i.test(traits)) data.system.traits = traits ? `${traits}, focus` : "focus";
    foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
      sourceId: item.id, sourceName: item.name, requested: data.name
    });
    [spell] = await actor.createEmbeddedDocuments("Item", [data]);
  } else if (!spell.system.innate || spell.system.usesPerDay) {
    await spell.update({ "system.innate": true, "system.usesPerDay": "" });
  }

  const { itemUsesRemaining, itemUsesMax } = await import("./uses-workflow.mjs");
  const left = itemUsesRemaining(spell);
  const max = itemUsesMax(spell);
  await postCard(actor, item.name, [
    line(`<strong>${esc(spellName)}</strong> is available as an innate form, cast at your level with no Spellcraft check.`),
    line(`<em>It spends your <strong>Wild Shape</strong> uses — <strong>${left} / ${max}</strong> remaining today, shared with every other form you know.</em>`)
  ]);
}

export const FEAT_AUTOMATION = {
  /**
   * The Chapter 5 feat that grants a companion (Druid / Ranger, BSB +2).
   *
   * Creates a real linked Actor rather than an item on this sheet — see
   * module/companion.mjs for why. The chooser, the creation and the
   * grant cascade all live in companion-workflow.mjs; this entry is the
   * button.
   */
  "animal companion": {
    hint: "Choose a base creature and create your companion as a linked actor, with its class, species and creature type applied.",
    async use(actor, item) {
      const { createCompanionFor } = await import("./companion-workflow.mjs");
      await createCompanionFor(actor, item);
    }
  },

  /**
   * The Familiar feat's button (Wizard, Chapter 5).
   *
   * A familiar is a separate LINKED actor for the same reasons an animal
   * companion is — see companion.mjs — and a third actor type rather than
   * a companion, because every number on its sheet is its master's. See
   * familiar.mjs.
   */
  "familiar": {
    hint: "Choose a form and summon your familiar as a linked actor, with your saves, attack and defence bonuses, hit points and skill ranks.",
    async use(actor, item) {
      const { createFamiliarFor } = await import("./familiar-workflow.mjs");
      await createFamiliarFor(actor, item);
    }
  },

  /**
   * FURRY FRIEND (Racial, gnome, Chapter 5): "This connection grants you
   * a familiar, a loyal companion magically linked to your essence. The
   * specific type of animal for your familiar is your choice, though it
   * is common for gnomes to select creatures with a burrow Speed."
   *
   * NEW at 3.379.0, and it is one line of wiring rather than a feature,
   * because the familiar engine was already built — for the Wizard's
   * "Familiar" feat, which is the only thing that could reach it.
   *
   * THE FEAT'S OWN NOTE SAID OTHERWISE, and that is the interesting part.
   * Its pack effect reads: "Run as an NPC for now — the familiar
   * companion model is a later milestone." That milestone shipped; the
   * note did not notice. A feat carrying a stale apology for a system
   * that now exists is indistinguishable, from the outside, from a feat
   * that genuinely cannot be built — which is exactly how this one sat
   * unbuilt while its engine ran under another feat's name.
   *
   * THE SAME FUNCTION, DELIBERATELY. `createFamiliarFor` takes the feat
   * item and records its name on the familiar, so Furry Friend's familiar
   * says it came from Furry Friend. Its one-familiar-per-master guard is
   * on the MASTER, not on the feat, so a gnome wizard holding both feats
   * still gets one familiar and is told why — which is the right answer
   * and needed no code to arrange.
   */
  /**
   * ELEVATED LINEAGE (Racial, half-elf, Chapter 5): "you gain the
   * benefits associated with the elf heritage of your elven parent or
   * ancestors."
   *
   * NEW at 3.379.0. Like Furry Friend directly below, its pack note
   * apologised for a system that has since shipped — "apply when
   * heritages are built (heritage compendium pending)" — and the
   * heritage compendium holds six elf heritages.
   *
   * ASKED, NOT DERIVED. Which elf a half-elf is descended from is a fact
   * about that character and exists only in the player's head; there is
   * nothing on the sheet to read it from. So the feat offers the six.
   */
  /**
   * IMPROVED REPOSITION (General, Chapter 5). NEW at 3.381.0.
   *
   * TAKEN BEFORE YOU MOVE, and that is forced by Foundry rather than
   * chosen: `preMoveToken` is synchronous, so the decision about whether
   * a move provokes cannot wait on a saving throw. The save is its own
   * declared step and its success is remembered for the next Reposition.
   *
   * THE FEAT'S OTHER CLAUSE IS NOT HERE. "You no longer need a free hand
   * to use the Reposition action" waives a restriction this system does
   * not enforce — Reposition's free-hand requirement is printed on the
   * card and adjudicated at the table. The hint below says so, rather
   * than leaving a player to wonder which half they are getting.
   */
  /**
   * ALTERED CANTRIP (Racial, Chapter 5; prereq BSB +1). NEW at 3.382.0.
   *
   * A SWAP, NOT A GRANT. "This feat replaces one of your existing
   * cantrips and does not add an additional one" — so the count must not
   * move, and a character with no cantrips is refused rather than given
   * their first one. Modelled on `openRepertoireSwap`, which already does
   * exactly this shape for repertoire spells.
   *
   * THE SECOND SENTENCE NEEDS NO CODE. "You wield it as if it were an
   * inherent part of your own magical tradition" is already true: there
   * is no positive tradition gate at cast time. `traditionGate` is a
   * NEGATIVE rule that blocks a tradition somebody has been explicitly
   * cut off from, and nothing refuses a spell for merely belonging to a
   * tradition that is not yours. Writing code to "make it count" would
   * change nothing and look like it did.
   */
  "altered cantrip": {
    hint: "Swap one of your cantrips for a cantrip from another tradition. Replaces — it does not add.",
    async use(actor) {
      const { DialogV2 } = foundry.applications.api;
      const casterTradition = actor.system?.magic?.tradition ?? "";
      // A cantrip is a spell of 0 PP on the sheet, whichever pool put it
      // there — this feat does not care which.
      const owned = Array.from(actor.items ?? [])
        .filter((i) => i.type === "spell" && Number(i.system?.ppCost ?? 0) === 0);

      const pack = contentPack("spells");
      if (!pack) {
        ui.notifications.warn("Altered Cantrip: the spell compendium is missing.");
        return;
      }
      const index = await pack.getIndex({ fields: ["system.ppCost", "system.tradition"] });
      const candidates = index
        .filter((e) => Number(e.system?.ppCost ?? 0) === 0
          && isOffTradition(e.system?.tradition, casterTradition))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));

      const blocked = alteredCantripBlocked({
        ownedCantrips: owned.length, candidates: candidates.length, casterTradition
      });
      if (blocked) {
        ui.notifications.warn(`Altered Cantrip: ${blocked}.`);
        return;
      }

      const outRows = owned.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
      const inRows = candidates.map((c) =>
        `<option value="${c._id}">${c.name} (${c.system?.tradition ?? "—"})</option>`).join("");
      const choice = await DialogV2.wait({
        window: { title: "Altered Cantrip — swap a cantrip", icon: "fa-solid fa-wand-magic-sparkles" },
        classes: ["trg-prime"],
        position: { width: 460 },
        content: `<div class="trg-prime trg-check-dialog">`
          + `<p class="hint" style="margin:0 0 6px">Your tradition is <strong>${casterTradition || "none"}</strong>. `
          + `The incoming cantrip must come from another one, and replaces the outgoing cantrip rather than adding to it.</p>`
          + `<div class="form-group"><label>Give up</label><select name="outgoing">${outRows}</select></div>`
          + `<div class="form-group"><label>Take instead</label><select name="incoming">${inRows}</select></div></div>`,
        buttons: [
          {
            action: "swap", label: "Swap", icon: "fa-solid fa-right-left", default: true,
            callback: (event, button, dialog) => {
              const root = dialog?.element ?? button?.form;
              return {
                outgoing: root?.querySelector?.('[name="outgoing"]')?.value ?? null,
                incoming: root?.querySelector?.('[name="incoming"]')?.value ?? null
              };
            }
          },
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (!choice || choice === "cancel" || !choice.outgoing || !choice.incoming) return;

      const outgoing = actor.items.get(choice.outgoing);
      const incomingDoc = await pack.getDocument(choice.incoming);
      if (!outgoing || !incomingDoc) return;

      // THE INCOMING ONE IS CREATED FIRST. If the creation fails, a
      // delete-first order would have cost the character a cantrip and
      // given nothing back — and the feat's whole promise is that the
      // count does not move.
      const outgoingName = outgoing.name;
      const data = incomingDoc.toObject();
      data.system = { ...(data.system ?? {}), prepared: true };
      data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
        [SYSTEM_ID]: { alteredCantrip: { replaced: outgoingName } }
      });
      const [created] = await actor.createEmbeddedDocuments("Item", [data]);
      if (!created) {
        ui.notifications.warn("Altered Cantrip: the new cantrip could not be created — nothing was changed.");
        return;
      }
      await outgoing.delete();

      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime"><p><strong>${actor.name}</strong> sets aside `
          + `<strong>${outgoingName}</strong> and takes <strong>${created.name}</strong> `
          + `(${incomingDoc.system?.tradition ?? "another tradition"}) in its place.</p>`
          + `<p><em>It is wielded as though it were part of their own tradition.</em></p></div>`
      });
    }
  },

  "improved reposition": {
    hint: "Roll the Reflex save to avoid reactions on your next Reposition. (The free-hand clause needs no automation — this system does not enforce a free hand for Reposition.)",
    async use(actor) {
      const { DialogV2 } = foundry.applications.api;
      // The DC is the TARGET's level DC, and Reposition's target is the
      // willing ally you swap with. Odd, and implemented as printed.
      const candidates = (canvas?.tokens?.placeables ?? [])
        .filter((t) => t.actor && t.actor.id !== actor.id)
        .map((t) => ({ id: t.actor.id, name: t.name, level: Number(t.actor.system?.identity?.level ?? 0) }));
      if (!candidates.length) {
        ui.notifications.warn("Improved Reposition: there is nobody on this scene to reposition with.");
        return;
      }
      const rows = candidates.map((c) =>
        `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">`
        + `<input type="radio" name="ally" value="${c.id}" style="margin:0">`
        + `<span>${c.name} <span style="opacity:.7">(level ${c.level} — DC ${repositionSaveDC(c.level)})</span></span></label>`
      ).join("");
      const chosenId = await DialogV2.wait({
        window: { title: "Improved Reposition — who are you swapping with?", icon: "fa-solid fa-right-left" },
        classes: ["trg-prime"],
        position: { width: 420 },
        content: `<div class="trg-prime trg-check-dialog">`
          + `<p class="hint" style="margin:0 0 6px">The Reflex save is made against <strong>your target's</strong> level DC, as the feat is written.</p>${rows}</div>`,
        buttons: [
          {
            action: "roll", label: "Roll Reflex", icon: "fa-solid fa-dice-d20", default: true,
            callback: (event, button, dialog) => {
              const root = dialog?.element ?? button?.form;
              return root?.querySelector?.('input[name="ally"]:checked')?.value ?? null;
            }
          },
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (!chosenId || chosenId === "cancel") return;
      const target = candidates.find((c) => c.id === chosenId);
      if (!target) return;

      const { TRGCheck } = await import("./dice/check.mjs");
      const check = await TRGCheck.roll({
        actor,
        label: "Improved Reposition — Reflex",
        subtitle: `To avoid reactions, vs ${target.name}'s level DC`,
        type: "save",
        subject: "reflex",
        dc: repositionSaveDC(target.level)
      });

      const avoided = repositionAvoided(check?.outcome?.degree?.key ?? "");
      // SET ONLY ON A SUCCESS, and consumed by the next Reposition
      // whether or not that move would have provoked anything.
      if (avoided) await actor.setFlag(SYSTEM_ID, "repositionReactionsAvoided", true);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime"><p>${repositionSaveNote(avoided, target.name)}</p></div>`
      });
    }
  },

  "elevated lineage": {
    hint: "Choose the elf heritage of your elven parent or ancestors and gain its benefits.",
    async use(actor) {
      const pack = contentPack("heritages");
      if (!pack) {
        ui.notifications.warn("Elevated Lineage: the heritage compendium is missing.");
        return;
      }
      const all = await pack.getDocuments();
      const choices = elevatedLineageChoices(all);
      const blocked = elevatedLineageBlocked({
        hasHeritage: actor.items.some((i) => i.type === "heritage"),
        choiceCount: choices.length
      });
      if (blocked) {
        ui.notifications.warn(`Elevated Lineage: ${blocked}.`);
        return;
      }

      const { DialogV2 } = foundry.applications.api;
      const rows = choices.map((h) => {
        const m = heritageMechanics(h);
        // WHAT IT DOES IS SHOWN BEFORE IT IS CHOSEN. One of the six
        // carries no mechanics at all, and a player picking blind would
        // have no way to tell that from a broken feat.
        const note = m.mechanical
          ? `${m.conditionals} conditional${m.conditionals === 1 ? "" : "s"}`
            + (m.grants ? `, ${m.grants} granted` : "")
          : "no mechanical effect recorded";
        return `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">`
          + `<input type="radio" name="heritage" value="${h.id}" style="margin:0">`
          + `<span>${h.name} <span style="opacity:.7">(${note})</span></span></label>`;
      }).join("");

      const chosenId = await DialogV2.wait({
        window: { title: "Elevated Lineage — your elven ancestry", icon: "fa-solid fa-seedling" },
        classes: ["trg-prime"],
        position: { width: 420 },
        content: `<div class="trg-prime trg-check-dialog">`
          + `<p class="hint" style="margin:0 0 6px">Which elf heritage did your elven parent or ancestors carry?</p>`
          + `${rows}</div>`,
        buttons: [
          {
            action: "choose",
            label: "Gain this heritage",
            icon: "fa-solid fa-seedling",
            default: true,
            callback: (event, button, dialog) => {
              const root = dialog?.element ?? button?.form;
              return root?.querySelector?.('input[name="heritage"]:checked')?.value ?? null;
            }
          },
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (!chosenId || chosenId === "cancel") return;

      const heritage = choices.find((h) => h.id === chosenId);
      if (!heritage) return;
      const [added] = await actor.createEmbeddedDocuments("Item", [heritage.toObject()]);
      // Granted feats and abilities arrive through the ordinary grant
      // path, not reproduced here. Every elf heritage's lists are empty
      // today; running it anyway means the day one is filled in, this
      // needs no change.
      const { applyAllGrants } = await import("./grants-workflow.mjs");
      if (added) await applyAllGrants(actor, added);

      const m = heritageMechanics(heritage);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime"><p><strong>${actor.name}</strong> claims the `
          + `<strong>${heritage.name}</strong> heritage of their elven ancestors.</p>`
          + (m.mechanical
            ? ""
            : `<p><em>${heritage.name} carries no recorded mechanical benefit — `
              + "the heritage is yours, but no number on the sheet changes.</em></p>")
          + "</div>"
      });
    }
  },

  // ABYSSAL FAMILIAR / NIRVANIC FAMILIAR are NOT registered here (3.632.1).
  // Fiends & Fables Prime 0.11.1 ships both feats and registers their Use
  // button itself (scripts/feats-framework.mjs, live-tested 4 September 2026):
  // the Quasit or Cherubim drawn as a linked creature familiar with its printed
  // statistics. A core key would take precedence over it ("core has since
  // built it — its version wins"), so core leaves the key to the module.

  "furry friend": {
    hint: "Choose a form and summon your familiar as a linked actor. Gnomes traditionally choose a burrowing animal — the form is appearance only.",
    async use(actor, item) {
      const { createFamiliarFor } = await import("./familiar-workflow.mjs");
      await createFamiliarFor(actor, item);
    }
  },

  /**
   * Empower Familiar (Wizard, Chapter 5): "You can select any two
   * familiar abilities for your familiar."
   *
   * The feat's presence IS the allowance — `familiarAbilityBudget` counts
   * copies of it — so pressing Use does not hand anything out. It reports
   * where the familiar stands, which is the only thing left to say.
   */
  "empower familiar": {
    hint: "Your familiar's ability allowance rises by two. Press Use to see where it stands.",
    async use(actor) {
      const { familiarsOf } = await import("./familiar-workflow.mjs");
      const { familiarAbilityBudget } = await import("./familiar.mjs");
      const familiar = familiarsOf(actor)[0] ?? null;
      if (!familiar) {
        ui.notifications.warn("Empower Familiar: you have no familiar yet — press Use on the Familiar feat first.");
        return;
      }
      const empowerPicks = Array.from(actor.items ?? [])
        .filter((i) => normalise(i.name) === "empower familiar").length;
      const budget = familiarAbilityBudget({
        abilityNames: Array.from(familiar.items ?? [])
          .filter((i) => i.type === "ability").map((i) => i.name),
        level: familiar.system?.identity?.level ?? 1,
        empowerPicks
      });
      await postCard(actor, "Empower Familiar", [
        line(`<strong>${esc(familiar.name)}</strong> has <strong>${budget.spent}</strong> of <strong>${budget.available}</strong> abilities chosen.`),
        line(`<em>Empower Familiar is worth +2 of that${empowerPicks > 1 ? ` (${empowerPicks} copies)` : ""}. Empathic Link costs nothing.</em>`)
      ]);
    }
  },

  /**
   * Versatile Familiar (Wizard, Chapter 5): "During your daily
   * preparation, your familiar may switch out any one of its familiar
   * abilities for another."
   *
   * A swap, not a gain — so the button removes one and adds one in a
   * single step rather than trusting a player to remember the first half.
   * Empathic Link is excluded from what can be given up: it is not part
   * of the allowance, so trading it away would cost a pick to get back.
   */
  "versatile familiar": {
    hint: "Daily preparation: swap one of your familiar's abilities for another.",
    async use(actor) {
      const { familiarsOf, familiarAbilityChoices } = await import("./familiar-workflow.mjs");
      const { FREE_FAMILIAR_ABILITIES } = await import("./familiar.mjs");
      const familiar = familiarsOf(actor)[0] ?? null;
      if (!familiar) {
        ui.notifications.warn("Versatile Familiar: you have no familiar yet.");
        return;
      }
      const free = new Set(FREE_FAMILIAR_ABILITIES.map(normalise));
      const owned = Array.from(familiar.items ?? [])
        .filter((i) => i.type === "ability" && !free.has(normalise(i.name)));
      if (!owned.length) {
        ui.notifications.warn(`Versatile Familiar: ${familiar.name} has no chosen abilities to swap.`);
        return;
      }
      // PAIRS, not names. `chooseFromList` destructures each option as
      // `[value, label]`, so an array of strings makes it read the first
      // TWO CHARACTERS of each name — the picker offered "F" and "S"
      // instead of Flier and Scent, and the swap would have written a
      // one-letter ability name into the card.
      const giveUp = await chooseFromList(
        "Versatile Familiar", "Ability to give up", owned.map((i) => [i.name, i.name])
      );
      if (!giveUp) return;
      const ownedNames = new Set(owned.map((i) => normalise(i.name)));
      const available = (await familiarAbilityChoices())
        .filter((a) => !ownedNames.has(normalise(a.name)) && !free.has(normalise(a.name)));
      if (!available.length) {
        ui.notifications.warn("Versatile Familiar: there is nothing left to swap to.");
        return;
      }
      const takeUp = await chooseFromList(
        "Versatile Familiar", "Ability to take instead",
        available.map((a) => [a.name, a.system?.prerequisites ? `${a.name} (${a.system.prerequisites})` : a.name])
      );
      if (!takeUp) return;
      const removing = owned.find((i) => i.name === giveUp);
      const adding = available.find((a) => a.name === takeUp);
      await familiar.deleteEmbeddedDocuments("Item", [removing.id]);
      await familiar.createEmbeddedDocuments("Item", [adding.toObject()]);
      await postCard(actor, "Versatile Familiar", [
        line(`<strong>${esc(familiar.name)}</strong> gives up <strong>${esc(giveUp)}</strong> and takes <strong>${esc(takeUp)}</strong>.`),
        ...(adding.system?.prerequisites
          ? [line(`<em>${esc(takeUp)} requires ${esc(adding.system.prerequisites)} — check it still qualifies.</em>`)]
          : [])
      ]);
    }
  },

  "ageless knowledge": {
    hint: "Choose a skill for today's +2 racial bonus (until next daily preparation).",
    async use(actor, item) {
      const key = await chooseFromList("Ageless Knowledge", "Skill for today's +2 racial bonus", SKILL_OPTIONS);
      if (!key) return;
      const label = SKILLS[key]?.label ?? key;
      await replaceFeatEffect(actor, item, {
        name: `Ageless Knowledge: ${label} +2`,
        img: item.img,
        // ADD mode into the racial SLOT so the bonus is visible in the
        // skills table's racial column (the sheet locks the input while
        // the effect is live). Race bonuses stack, so slot-adding is
        // rules-equivalent to the typed pool here.
        changes: [{
          key: `system.skills.${key}.racial`,
          type: CHANGE_TYPE.ADD,
          value: "2",
          priority: 20
        }]
      }, { dailyPrep: true });
      await postCard(actor, "Ageless Knowledge", [
        line(`+2 racial bonus to <strong>${label}</strong> until the next daily preparation.`)
      ]);
    }
  },

  // Galad-Iar (Kornargon heritage, Chapter 2): "You emit dim light within
  // 5 feet of you. You can activate or suppress this ability as an
  // action, which has the concentrate trait." A toggle rather than a
  // chooser — the effect IS the light, so removing it suppresses.
  "galad-iar": {
    hint: "Activate or suppress your dim light (1 action, concentrate).",
    async use(actor, item) {
      // filter, not find: two quick clicks can leave two effects behind,
      // and deleting one of them would report "suppressed" while the
      // light stayed on. Sweep every match, as Hybrid Transformation
      // does.
      const lit = Array.from(actor.effects ?? [])
        .filter((e) => e.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) === item.id)
        .map((e) => e.id);
      if (lit.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", lit);
        await postCard(actor, "Galad-Iar", [line("Your shadow-light is <strong>suppressed</strong>.")]);
        return;
      }
      // "You can activate or suppress this ability as an action" — the
      // same 1 AP in combat that every other action costs.
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Galad-Iar: 1 AP required to activate or suppress the light.");
        return;
      }
      if (game.combat?.started) await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      await replaceFeatEffect(actor, item, {
        name: "Galad-Iar: dim light (5 ft)",
        img: item.img,
        description: "You emit dim light within 5 feet. Use the heritage again to suppress it."
      });
      await postCard(actor, "Galad-Iar", [
        line("You emit <strong>dim light within 5 feet</strong> — use it again to suppress."),
        line("<em>Token lighting isn't set automatically; adjust the token's light source to match if your table uses it.</em>")
      ]);
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Chapter 2 heritage choosers (3.196.0)                              */
  /*                                                                      */
  /*  Keyed off the HERITAGE item's own name, exactly as feats are —      */
  /*  useFeat normalises item.name and looks it up here, so a heritage     */
  /*  row's Use button reaches these with no extra plumbing. Anything     */
  /*  a heritage grants unconditionally (a skill bonus, DR, a trait)      */
  /*  lives on its pack effects instead; only genuine PLAYER CHOICES      */
  /*  belong in this table.                                              */
  /* ------------------------------------------------------------------ */

  // Menora (Ascendan): "may select any one spell with the healing trait
  // which costs one less PP to Warp". The discount is recorded on the
  // granted spell itself and read at Warp time.
  "menora": {
    hint: "Choose your healing spell — it costs 1 less PP to Warp.",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Menora",
        // `system.traits` was declared here and nowhere else until
        // 3.552.7, which is exactly how the cold-index bug hid: this
        // chooser warmed the field for the six that had forgotten it.
        // It is base now, so the declaration is gone rather than left
        // to suggest that asking per-caller is what keeps traits alive.
        // "…any one spell with the healing trait", narrowed by Graham's
        // ruling of 15 Aug 2026 to the ones a Menora can actually CAST.
        //
        // WHY THIS NARROWING EXISTS. A Menora is always an Ascendan, and
        // the Ascendan's Forbidden Magic allows no connection with divine
        // or verdant magic — so picking Cure, the most obvious healing
        // spell in the game, granted a spell with a warp discount that
        // could never be cast, and nothing said so. Found live on 3.317.1.
        //
        // ANY OPEN ROUTE IS ENOUGH, which is the same reading the cast
        // gate uses: Restoration is "divinity, ethereal, verdant" and a
        // Menora casts it as ethereal, so it stays on the list. Only a
        // spell whose EVERY route is closed is dropped. Graham chose this
        // over the stricter "nothing tagged divinity or verdant", which
        // would also have taken away five spells she can legally cast.
        //
        // Specialist spells are excluded by grantChosenSpell's own
        // default — see the note there.
        filter: (s) => {
          if (!/\bhealing\b/i.test(String(s.system?.traits ?? ""))) return false;
          const traditions = String(s.system?.tradition ?? "")
            .split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
          return traditions.some((t) => t !== "divinity" && t !== "verdant");
        },
        flagKey: "menoraSpell",
        // Graham's ruling of 15 September 2026, extending R2 a second
        // time: "the Tirvni, Urloch and Menora racial spell choosers
        // should follow the same pattern." A heritage's spell is picked
        // when the heritage is taken, which is 1st level.
        firstLevelChoice: true,
        extraFlags: { warpDiscount: 1 },
        grantNote: "Warping this spell costs 1 PP less (minimum 1). Your +2 racial to Treat Wounds is applied automatically — it arrives pre-ticked in the check dialog.",
        sourceItem: item
      });
    }
  },

  // Urloch (Ascendan): "may select any one spell with a maximum PP cost
  // of 2 to add to your repertoire. This spell may be selected from any
  // tradition." The lost abilities, the +10 fumble modifier and the PP
  // per level are all automatic; only the spell is a choice.
  "urloch": {
    hint: "Choose your PP 2-or-less repertoire spell (any tradition).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Urloch",
        filter: (s) => Number(s.system?.ppCost ?? 99) <= 2,
        flagKey: "urlochSpell",
        // Graham's ruling of 15 September 2026 — see Menora above.
        firstLevelChoice: true,
        grantNote: "A bonus repertoire spell from any tradition — needs no memorisation and doesn't count against known spells.",
        sourceItem: item
      });
    }
  },

  // Dengar (Dwarf): "You also gain an additional crafting specialty. You
  // gain advantage on all checks made with this speciality." The extra
  // SLOT comes from the heritage's specialtyGrant flag (the cap is raised
  // whether or not this button is ever pressed); this records WHICH of
  // the held specialties carries the advantage.
  "dengar": {
    hint: "Choose which of your crafting specialties carries advantage.",
    async use(actor, item) {
      const { getSkillSpecialty } = await import("./skill-specialties-workflow.mjs");
      const { SKILL_SPECIALTIES } = await import("./skill-specialties.mjs");
      const held = getSkillSpecialty(actor, "crafting");
      if (!held.length) {
        ui.notifications.warn(
          "Dengar: pick your crafting specialties first (Skills tab) — your cap is already raised by 1."
        );
        return;
      }
      const options = SKILL_SPECIALTIES.crafting.options;
      const choice = await chooseFromList("Dengar", "Crafting specialty with advantage",
        held.map((key) => [key, options.find((o) => o.key === key)?.label ?? key]));
      if (!choice) return;
      const label = options.find((o) => o.key === choice)?.label ?? choice;
      await replaceFeatEffect(actor, item, {
        name: `Dengar: ${label}`,
        img: item.img,
        description: `Advantage on every Crafting check made with the ${label} specialty.`,
        flags: {
          [SYSTEM_ID]: {
            conditionals: [{
              kind: "advantage",
              label: `Dengar (${label})`,
              scope: `Crafting checks using the ${label} specialty`,
              auto: false,
              when: { checkTypes: ["skill"], subjects: ["crafting"] }
            }]
          }
        }
      });
      await postCard(actor, "Dengar", [
        line(`Advantage recorded for <strong>${label}</strong> — tick it in the Crafting check dialog when the specialty applies.`)
      ]);
    }
  },

  // Noldorni (Elf): "may select any one arcane or verdant cantrip at 1st
  // level which you may cast as an innate spell with the focus trait."
  "noldorni": {
    hint: "Choose your innate arcane/verdant cantrip (focus trait).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Noldorni",
        filter: (s) => isCantripSpell(s) &&
          /arcane|verdant/i.test(String(s.system?.tradition ?? "")),
        flagKey: "noldorniSpell",
        firstLevelChoice: true,
        innate: true,
        addTrait: "focus",
        grantNote: "Your +1 racial to Make an Impression is applied automatically — it arrives pre-ticked in the Diplomacy check dialog.",
        sourceItem: item
      });
    }
  },

  // Gul-Fyr (Halfling): "may select any one arcane cantrip and cast it as
  // an innate spell with the focus trait."
  "gul-fyr": {
    hint: "Choose your innate arcane cantrip (focus trait).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Gul-Fyr",
        filter: (s) => isCantripSpell(s) &&
          /arcane/i.test(String(s.system?.tradition ?? "")),
        flagKey: "gulFyrSpell",
        firstLevelChoice: true,
        innate: true,
        addTrait: "focus",
        grantNote: "Your +1 PP per level is applied automatically.",
        sourceItem: item
      });
    }
  },

  // Tirvni (Gnome): "may select a spell of up to 2 PP (ethereal or
  // verdant) and cast it as an innate spell with the focus trait."
  "tirvni": {
    hint: "Choose your innate ethereal/verdant spell of up to 2 PP (focus trait).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Tirvni",
        filter: (s) => Number(s.system?.ppCost ?? 99) <= 2 &&
          /ethereal|verdant/i.test(String(s.system?.tradition ?? "")),
        flagKey: "tirvniSpell",
        // Graham's ruling of 15 September 2026 — see Menora above.
        firstLevelChoice: true,
        innate: true,
        addTrait: "focus",
        sourceItem: item
      });
    }
  },

  // Furini (Gnome): "You may choose one spell school. You gain a +1
  // racial bonus to Cast a Spell (Spellcraft) checks made from this
  // school and reduce all its warping PP costs by 1 (min 1)."
  //
  // A school is one of the eight Chapter 9 names, and every spell already
  // carries its school on `system.traits` — so the WARP DISCOUNT is
  // automatic, matched at cast time. The +1 stays a queued modifier, the
  // shape Ascendan Magic uses: the school-scoped Save DC half of that
  // rule still has no hook, and making one half silent while the other
  // is automatic is worse than one visible prompt.
  //
  // Unlike Ascendan Magic this always re-prompts, pre-selecting the
  // current school. A chooser answerable exactly once left no way to fix
  // a mis-click, and no way to rebuild the effect after the heritage was
  // removed and re-added.
  "furini": {
    hint: "Choose your spell school — its warp costs drop by 1 automatically.",
    async use(actor, item) {
      const { SPELL_SCHOOLS } = await import("./data/spell-tables.mjs");
      const current = actor.getFlag(SYSTEM_ID, "furiniSchool");
      const school = await chooseFromList("Furini",
        current ? `Spell school (currently ${current})` : "Your chosen spell school",
        SPELL_SCHOOLS.map((s) => [s, s === current ? `${s} — current` : s]));
      if (!school) return;
      if (school !== current) await actor.setFlag(SYSTEM_ID, "furiniSchool", school);
      await replaceFeatEffect(actor, item, {
        name: `Furini: ${school}`,
        img: item.img,
        description: `+1 racial bonus to Cast a Spell (Spellcraft) checks for ${school} spells, and all ${school} warping PP costs are reduced by 1 (minimum 1).`,
        flags: {
          [SYSTEM_ID]: {
            warpDiscountSchool: { school, value: 1 },
            // A STANDING CONDITIONAL, not a queued one-shot (3.320.0).
            //
            // This was `addPendingModifier`, and it never fired once. Queued
            // modifiers are offered and consumed in exactly one place —
            // `check-dialog.mjs` — and a casting check does not open that
            // dialog; it has its own Casting Conditions prompt. So the bonus
            // was unreachable by construction. Confirmed live on 3.319.2: a
            // Furini with the +1 queued cast an Insight spell TWICE, both
            // checks resolved at Modifiers +5 with no Furini row, and the
            // queued modifier was still sitting unspent afterwards.
            //
            // A school IS a trait — 76 spells carry Insight — and since
            // 3.319.1 the casting check hands its spell's traits to the
            // conditional engine. So the bonus can simply be scoped, the
            // way Sindarni's is, and apply itself every time instead of
            // needing the Use button pressed before every cast.
            conditionals: [{
              kind: "modifier",
              value: 1,
              type: "race",
              label: `Furini (${school})`,
              scope: `Casting a spell of the ${school} school`,
              auto: true,
              when: { checkTypes: ["spellcraft"], traits: [school.toLowerCase()] }
            }]
          }
        }
      });
      await postCard(actor, "Furini", [
        line(`School: <strong>${school}</strong>. Warping a ${school} spell now costs <strong>1 PP less</strong> (minimum 1), applied automatically.`),
        line(`Your <strong>+1 racial bonus</strong> to Cast a Spell checks for ${school} spells is applied automatically — it needs no ticking and no re-use.`)
      ]);
    }
  },

  // Tribal (Human): "select either Arcana, Nature, Occultism or Religion
  // — you gain advantage to all Recall Knowledge checks made with the
  // selected skill regarding ancient lore." Offered rather than automatic:
  // "regarding ancient lore" is the judgement the text leaves to a person.
  "tribal": {
    hint: "Choose your ancient-lore knowledge skill.",
    async use(actor, item) {
      const choices = [
        ["arcana", "Arcana"],
        ["nature", "Nature"],
        ["occultism", "Occultism"],
        ["religion", "Religion"]
      ];
      const choice = await chooseFromList("Tribal", "Skill for ancient lore", choices);
      if (!choice) return;
      const label = choices.find(([key]) => key === choice)[1];
      await replaceFeatEffect(actor, item, {
        name: `Tribal: ${label}`,
        img: item.img,
        description: `Advantage on Recall Knowledge checks made with ${label} regarding ancient lore.`,
        flags: {
          [SYSTEM_ID]: {
            conditionals: [{
              kind: "advantage",
              label: `Tribal (${label})`,
              scope: `Recall Knowledge with ${label} regarding ancient lore`,
              auto: false,
              when: { actions: ["recallKnowledge"], subjects: [choice] }
            }]
          }
        }
      });
      await postCard(actor, "Tribal", [
        line(`Ancient lore skill: <strong>${label}</strong> — tick the advantage in the Recall Knowledge dialog when the subject is ancient lore.`)
      ]);
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Chapter 2 background choosers (3.197.0)                            */
  /*                                                                      */
  /*  Two of the forty-two name a specialist skill the RULEBOOK leaves    */
  /*  to the player — "Specialist skill related to your specialty",       */
  /*  "One Ancient Civilisation Lore". Those are instructions, not skill  */
  /*  names, and a sheet entry called "One Ancient Civilisation Lore" is  */
  /*  exactly what this avoids. Both read their prompt from the item's    */
  /*  own `specialistChoice` flag rather than hard-coding it, so the      */
  /*  remaining forty land as data.                                      */
  /* ------------------------------------------------------------------ */
  "archetypal path": {
    hint: "Choose your Archetypal Path: Arcanist, Assassin, Gleeman, Gymnast, Mastermind or Warden — prerequisites waived.",
    async use(actor, item) {
      // Rogue, 1st (Chapter 3). Prerequisites are WAIVED, per Graham
      // (3.217.0): the text only waives progression requirements
      // explicitly, but half the list is unreachable at 1st level
      // otherwise — Assassin alone needs Perception 4 and Stealth 4
      // ranks, which no 1st-level character can hold. Same machinery as
      // the Fighter's Martial Training.
      const options = item?.flags?.[SYSTEM_ID]?.archetypeChoices ?? [
        "Arcanist", "Assassin", "Gleeman", "Gymnast", "Mastermind", "Warden"
      ];
      const flagKey = `archetypalPath-${item.id}`;
      const recorded = actor.getFlag(SYSTEM_ID, flagKey);
      if (recorded) {
        ui.notifications.info(
          `${item.name}: your path is ${recorded}. You may still take another archetype feat later — through a normal feat pick, with no progression requirement.`
        );
        return;
      }
      const picked = await chooseFromList(
        item.name,
        "Archetype feat that becomes your Archetypal Path — prerequisites waived",
        options.map((name) => [name, name])
      );
      if (!picked) return;
      const held = Array.from(actor.items ?? []).find(
        (i) => i.type === "feat" && normalise(i.name) === normalise(picked)
      );
      // ALREADY ON THE SHEET: claim it rather than adding a second copy.
      // Without provenance the feat goes on costing a class pick, which
      // is exactly the complaint Graham raised about Martial Training —
      // and these two paths share its shape. The class grants this
      // archetype however it arrived, so a player who bought it before
      // pressing Use gets their pick back.
      if (held) {
        await held.update({
          [`flags.${SYSTEM_ID}.grantedBy`]: {
            sourceId: item.id, sourceName: item.name, requested: picked
          }
        });
      } else {
        const pack = contentPack("feats");
        const index = await pack.getIndex();
        const entry = Array.from(index.values()).find(
          (e) => normalise(e.name) === normalise(picked)
        );
        if (!entry) {
          ui.notifications.warn(`${item.name}: "${picked}" is not in the feats compendium.`);
          return;
        }
        const data = packItemData(await pack.getDocument(entry._id));
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
          sourceId: item.id, sourceName: item.name, requested: picked
        });
        await actor.createEmbeddedDocuments("Item", [data]);
      }
      await actor.setFlag(SYSTEM_ID, flagKey, picked);
      await postCard(actor, item.name, [
        line(`<strong>${picked}</strong> gained as your Archetypal Path${held ? " (already on your sheet)" : ""}.`),
        line("<em>Prerequisites waived. You do not need to meet its progression requirements before selecting another archetype, and may run two archetypes at once.</em>")
      ]);
    }
  },

  "apprentice": { hint: "Name your craft specialty — it becomes a specialist skill.", use: useBackground },
  "archaeologist": { hint: "Name the ancient civilisation you studied — it becomes a specialist skill.", use: useBackground },
  "cultist": { hint: "Name your deity or cult — it becomes a specialist skill.", use: useBackground },
  "hermit": { hint: "Name the terrain you know — it becomes a specialist skill.", use: useBackground },
  "highwayman": { hint: "Name the terrain you worked — it becomes a specialist skill.", use: useBackground },
  "scholar": { hint: "Pick your three skills and name your two lores.", use: useBackground },
  "scout": { hint: "Name the terrain you guided through — it becomes a specialist skill.", use: useBackground },
  "templar": { hint: "Name the deity you served — it becomes a specialist skill.", use: useBackground },
  "weaver": { hint: "Choose your ethereal cantrip.", use: useBackground },

  // A RACE CAN CARRY AN AUTHORED CHOICE TOO (3.552.0). Page 28 gives the
  // Human "lore based upon your ethnicity" — the one race whose printed
  // specialist skill is a choice rather than a name, and therefore the
  // one race that got no specialist skill at all, because every other
  // race fills `system.specialistSkills` with literal names and nothing
  // asked. `useBackground` dispatches on the item's own choice flags and
  // never looks at its type, so the Human's specialistChoice reaches the
  // same prompt, the same slot memory and the same removal-with-the-item
  // that eight backgrounds already use.
  "human": { hint: "Name the lore of your ethnicity — it becomes a specialist skill.", use: useBackground },

  "ageless language": {
    hint: "Choose a language to speak, read and write until next daily preparation.",
    async use(actor, item) {
      const language = await enterText("Ageless Language", "Language gained until next daily preparation", "e.g. Old Numari");
      if (!language) return;
      await replaceFeatEffect(actor, item, {
        name: `Ageless Language: ${language}`,
        img: item.img,
        description: "Fluent (read, write, speak) until the next daily preparation.",
        // Read by the Languages panel, which shows it as a "today" chip
        // that costs no pick — it is fluency for a day, not a language
        // learned. Any future feature granting a temporary language can
        // use the same flag.
        flags: { "trg-prime": { temporaryLanguage: language } }
      }, { dailyPrep: true });
      await postCard(actor, "Ageless Language", [
        line(`Fluent in <strong>${language}</strong> until the next daily preparation.`)
      ]);
    }
  },

  "ageless patience": {
    hint: "Queue the +2 racial bonus for a skill check made with double time.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2,
        type: "race",
        label: "Ageless Patience (double time)",
        scope: "One skill check taken with double the usual time",
        oneShot: true
      });
      await postCard(actor, "Ageless Patience", [
        line("A +2 racial bonus is queued — tick it in the next skill check dialog (the check must take double the usual time)."),
        line("<em>Remember:</em> on that check a blunder counts as a fumble, and a fumble as a failure.")
      ]);
    }
  },

  "animal magic": {
    hint: "Configure the granted Calm Animal as an innate verdant focus spell.",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "calm animal");
      if (!spell) {
        ui.notifications.warn("Animal Magic: Calm Animal is not on this character yet — use Apply All Grants (or re-add the feat) first.");
        return;
      }
      const traits = String(spell.system.traits ?? "");
      const updates = { "system.innate": true };
      if (!/\bfocus\b/i.test(traits)) {
        updates["system.traits"] = traits ? `${traits}, focus` : "focus";
      }
      await spell.update(updates);
      await postCard(actor, "Animal Magic", [
        line("<strong>Calm Animal</strong> is configured as an innate verdant spell with the focus trait — it now appears with your innate spells.")
      ]);
    }
  },

  "animal sense": {
    hint: "Choose Darkvision or Scent (if your animal race has it naturally).",
    async use(actor, item) {
      const sense = await chooseFromList("Animal Sense", "Sense gained from your bestial side", [
        ["Darkvision", "Darkvision"],
        ["Scent", "Scent"]
      ]);
      if (!sense) return;
      await replaceFeatEffect(actor, item, {
        name: `${sense} (Animal Sense)`,
        img: item.img,
        description: "Granted by Animal Sense. Only valid if your animal race possesses this sense naturally."
      });
      await postCard(actor, "Animal Sense", [
        line(`<strong>${sense}</strong> gained (shown on the Effects tab). If your animal race does not naturally possess it, this choice is invalid — pick the other.`)
      ]);
    }
  },

  "animal voice": {
    hint: "Queue the +1 racial bonus for a Diplomacy check with animals.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 1,
        type: "race",
        label: "Animal Voice (animals)",
        scope: "One Diplomacy check when interacting with animals",
        oneShot: true
      });
      await postCard(actor, "Animal Voice", [
        line("A +1 racial bonus is queued — tick it in the next Diplomacy check dialog when talking with animals.")
      ]);
    }
  },

  // THE SEVENTH SCHOLAR, added at 3.567.0. Six feats print "a +N bonus to
  // your racial specialist skill" alongside their ordinary skill bonuses
  // and six call `specialistSkillBonus`; this one printed the same
  // sentence and called nothing. Its Arcana and Occultism halves ride an
  // effect and always worked, which is why the missing half survived —
  // everything around it looked right. Found in the pages 101-110 audit.
  "ascendan scholar": {
    hint: "Choose which of your specialist skills carries the +1 racial bonus (Arcana/Occultism +1 are always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Ascendan Scholar", value: 1 });
    }
  },

  "ascendan magic": {
    hint: "Record your chosen school; queue the +1 for a matching Spellcraft check.",
    async use(actor, item) {
      let school = actor.getFlag(SYSTEM_ID, "ascendanMagicSchool");
      if (!school) {
        school = await enterText("Ascendan Magic", "Your chosen magical school", "e.g. Invocation");
        if (!school) return;
        await actor.setFlag(SYSTEM_ID, "ascendanMagicSchool", school);
        await replaceFeatEffect(actor, item, {
          name: `Ascendan Magic: ${school}`,
          img: item.img,
          description: `+1 racial bonus to Spellcraft checks and Save DCs for ${school} spells.`
        });
      }
      await addPendingModifier(actor, {
        value: 1,
        type: "race",
        label: `Ascendan Magic (${school})`,
        scope: `One Spellcraft check for a ${school} spell`,
        oneShot: true
      });
      await postCard(actor, "Ascendan Magic", [
        line(`School: <strong>${school}</strong>. A +1 racial bonus is queued for your next ${school} Spellcraft check.`),
        line(`<em>Apply the +1 to the Save DC of ${school} spells by hand where it matters — school-scoped DCs aren't modelled yet.</em>`)
      ]);
    }
  },

  "aura of power": {
    hint: "Apply (or true up after level change) the +1 maximum PP per level.",
    async use(actor) {
      const summary = await reconcileAuraOfPower(actor, { report: true });
      if (!summary) {
        ui.notifications.info("Aura of Power: maximum PP already includes the full grant for your level.");
      }
    }
  },

  // The Bard's own two 1st-level PP 1 Specialist Spell picks — the
  // second CLASS-item Use entry (see the note on "druid" above). TWO
  // slots rather than one, so a slot is asked for first; each slot is
  // independently repeatable through grantChosenSpell's own
  // replace-on-reuse behaviour, scoped by its own flagKey — the same
  // shape the Wizard's two spell-book "opening picks vs level-ups" pools
  // will need to keep separate once that class's own release lands.
  "bard": {
    hint: "Choose your two 1st-level PP 1 Bard Specialist Spells (repeatable per slot — replaces that slot's current pick).",
    async use(actor, item) {
      const slot = await chooseFromList("Bard Specialist Spell", "Which slot?", [
        ["1", "Specialist Spell 1"],
        ["2", "Specialist Spell 2"]
      ]);
      if (!slot) return;
      await grantChosenSpell(actor, {
        title: `Bard Specialist Spell ${slot}`,
        // SPECIALIST BY DESIGN. `grantChosenSpell` excludes specialist
        // spells by default (Graham, 15 Aug 2026) so that a free repertoire
        // pick cannot take what a heritage or school is meant to grant.
        // THIS chooser is the granting side of that rule, and every one of
        // the 106 specialist-class spells carries `specialist: true` — so
        // without this line the list is empty and the feature silently
        // offers nothing at all.
        allowSpecialist: true,
        filter: (s) => onSpecialistList(s.system, "bard") && Number(s.system?.ppCost) === 1,
        flagKey: `bardSpecialistSpell${slot}`,
        indexFields: ["system.specialistClass"],
        grantNote: "One of your two free PP 1 Bard Specialist Spells. The Specialist Spell feat buys further ones (any PP tier you qualify for).",
        sourceItem: item
      });
    }
  },

  // Book of Notations (Bard, 1st): "Each day during your daily
  // preparation, you may select any one spell from your repertoire...
  // and cast it as a Specialist Spell until the following day. At 5th
  // level and then every 5 levels thereafter, you may select an
  // additional spell." A daily, SWEPT pick — like the Cleric/Druid's
  // "list"-style memorisation, not a persists-until-changed choice like
  // Hunter's Method — so the slots are re-offered fresh each Use press
  // and cleared at the next Daily Preparation (uses-workflow.mjs).
  //
  // Only the REPERTOIRE half of the printed sentence is automated. "Any
  // one ethereal spell that you have a scroll for" needs a scroll item
  // and a scroll-to-spell resolution this pack has nowhere at all (grep
  // the whole of module/ for "scroll" — nothing) — a genuine
  // infrastructure gap, not a oversight, and the hint below says so.
  "book of notations": {
    hint: "Pick today's Book of Notations spell(s) — from your repertoire, or any ethereal spell you carry a scroll for. Cast as Specialist Spells until the next Daily Preparation.",
    async use(actor, item) {
      const { bookOfNotationsSlots, scrollSpellCandidates, isEtherealSpell } = await import("./bard.mjs");
      const { consumableSpellRef } = await import("./consumable-use.mjs");
      const level = Number(actor.system?.identity?.level ?? 0);
      const slots = bookOfNotationsSlots(level);

      const repertoire = Array.from(actor.items ?? []).filter(
        (i) => i.type === "spell" && Boolean(i.flags?.[SYSTEM_ID]?.repertoirePick)
      );

      // "OR ANY ONE ETHEREAL SPELL THAT YOU HAVE A SCROLL FOR" (3.326.0).
      // The scroll names its spell; the spell names its tradition. Resolved
      // through the same lookup a scroll uses when it is read, so a world
      // that has house-ruled a spell gets ITS version here too.
      const scrollSpells = [];
      for (const cand of scrollSpellCandidates(Array.from(actor.items ?? []), consumableSpellRef)) {
        // Already in the repertoire? Then it is offered by the first half of
        // the rule and a second row for it would be a duplicate choice.
        if (repertoire.some((r) => String(r.name).trim().toLowerCase() === cand.name.trim().toLowerCase())) continue;
        const source = await resolveSpellByNameOrUuid(cand.name, cand.uuid);
        if (!source || !isEtherealSpell(source.system)) continue;
        scrollSpells.push({ ...cand, source });
      }

      if (!repertoire.length && !scrollSpells.length) {
        ui.notifications.warn("Book of Notations: no repertoire spells or ethereal scrolls to choose from yet.");
        return;
      }

      const currentlyPicked = new Set(
        repertoire
          .filter((i) => Boolean(i.flags?.[SYSTEM_ID]?.bookOfNotationsPick))
          .map((i) => i.id)
      );

      // A scroll row is keyed `scroll:<name>` rather than by item id: the
      // spell it names has no item on the sheet yet, and creating one before
      // the player has chosen it would leave litter behind a cancelled dialog.
      const optionsFor = (selectedId) => [
        `<option value=""${selectedId ? "" : " selected"}>— none —</option>`,
        ...repertoire.map(
          (s) => `<option value="${s.id}"${s.id === selectedId ? " selected" : ""}>${s.name}</option>`
        ),
        ...scrollSpells.map((s) => {
          const key = `scroll:${s.name}`;
          return `<option value="${esc(key)}"${key === selectedId ? " selected" : ""}>${esc(s.name)} (from ${esc(s.scrollName)})</option>`;
        })
      ].join("");
      const rows = Array.from({ length: slots }, (_, i) => {
        const picked = Array.from(currentlyPicked)[i] ?? "";
        return `<div class="form-group"><label>Slot ${i + 1}</label>
          <select name="slot${i}">${optionsFor(picked)}</select></div>`;
      }).join("");

      const result = await DialogV2.wait({
        window: { title: "Book of Notations — Today's Spells", icon: "fa-solid fa-book-open" },
        classes: ["trg-prime"],
        position: { width: 420 },
        content: `<div class="trg-prime trg-check-dialog">
          <p class="hint">Select up to ${slots} spell${slots === 1 ? "" : "s"}${scrollSpells.length ? " — from your repertoire, or an ethereal spell you carry a scroll for" : " from your repertoire"} to cast as a Specialist Spell until the next Daily Preparation.${scrollSpells.length ? " Copying from a scroll does not use it up." : ""}</p>
          ${rows}
        </div>`,
        buttons: [
          {
            action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
            callback: (evt, button) =>
              new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
                button.form ?? button.closest("form")
              ).object
          },
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      if (!result || result === "cancel") return;

      const chosenIds = new Set(
        Object.values(result).map((v) => String(v || "")).filter(Boolean)
      );

      const updates = [];
      for (const spell of repertoire) {
        const shouldHave = chosenIds.has(spell.id);
        const has = Boolean(spell.flags?.[SYSTEM_ID]?.bookOfNotationsPick);
        if (shouldHave !== has) {
          updates.push({ _id: spell.id, [`flags.${SYSTEM_ID}.bookOfNotationsPick`]: shouldHave });
        }
      }
      if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);

      // A SCROLL PICK ARRIVES AS A SPELL ITEM, because that is what carries
      // the flag `castSpell` reads to treat it as a Specialist Spell — and
      // because there is nowhere else to hang "castable today" on a spell the
      // Bard does not know. Marked `bookOfNotationsScroll` so the daily-prep
      // sweep DELETES it rather than merely unflagging it: unflagging would
      // leave the Bard permanently holding a spell they only borrowed.
      //
      // YESTERDAY'S BORROWED SPELLS GO FIRST, so re-running the chooser
      // replaces them instead of stacking a second copy.
      const stale = Array.from(actor.items ?? []).filter(
        (i) => i.type === "spell" && Boolean(i.flags?.[SYSTEM_ID]?.bookOfNotationsScroll)
      );
      if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));

      const chosenScrolls = scrollSpells.filter((s) => chosenIds.has(`scroll:${s.name}`));
      if (chosenScrolls.length) {
        await actor.createEmbeddedDocuments("Item", chosenScrolls.map((s) => {
          const data = foundry.utils.deepClone(s.source);
          delete data._id;
          // Not memorised, not a repertoire pick — borrowed for the day.
          foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.bookOfNotationsPick`, true);
          foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.bookOfNotationsScroll`, true);
          foundry.utils.setProperty(data, "system.prepared", true);
          return data;
        }));
      }

      const chosenNames = [
        ...repertoire.filter((s) => chosenIds.has(s.id)).map((s) => s.name),
        ...chosenScrolls.map((s) => `${s.name} (from ${s.scrollName})`)
      ];
      await postCard(actor, "Book of Notations", [
        chosenNames.length
          ? line(`<strong>${chosenNames.join(", ")}</strong> may be cast as Specialist Spell${chosenNames.length === 1 ? "" : "s"} until the next Daily Preparation.`)
          : line("No spells selected today.")
      ]);
    }
  },

  // Channels (Cleric, 1st): "you may use the Channels ability [Charisma
  // modifier +1 times] each day. Each time you use this ability; you may
  // cast one of the following spells as an innate spell: Cure, Inflict,
  // Lifekeeping or Restoration." One shared pool, spent from the ability
  // item's own uses (already authored `usesPerDay: "Charisma +1"`),
  // covering FOUR different spells — unlike Wild Shape's "configure once,
  // cast normally forever" shape (one spell, its OWN uses tracked on
  // itself), Channels spends-then-casts each time, closer to Crusader's
  // Mercy's shape. The chosen spell's own uses-per-day is left BLANK
  // (untracked) so castInnateSpell never double-gates it — the ability's
  // own pool, checked here, is the only bookkeeping.
  "channels": {
    hint: "Spend a Channels use to cast Cure, Inflict, Lifekeeping or Restoration as an innate spell.",
    async use(actor, item) {
      const { itemUsesRemaining } = await import("./uses-workflow.mjs");
      const remaining = itemUsesRemaining(item);
      if (remaining !== null && !(remaining > 0)) {
        ui.notifications.warn("Channels: no uses remain today (resets at Daily Preparation).");
        return;
      }

      const { channelsSpellChoices } = await import("./cleric.mjs");
      const choices = channelsSpellChoices(
        item,
        Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
      );
      const picked = await chooseFromList(
        "Channels",
        "Spell to cast as an innate spell",
        choices.map((name) => [name, name])
      );
      if (!picked) return;

      let spell = Array.from(actor.items ?? []).find(
        (i) => i.type === "spell" &&
          normalise(i.name) === normalise(picked) &&
          i.flags?.[SYSTEM_ID]?.grantedBy?.sourceId === item.id
      );
      if (!spell) {
        const pack = contentPack("spells");
        const index = pack ? await pack.getIndex() : null;
        const entry = index ? Array.from(index.values()).find((s) => normalise(s.name) === normalise(picked)) : null;
        if (!pack || !entry) {
          ui.notifications.warn(`Channels: "${picked}" is not in the spells compendium.`);
          return;
        }
        const source = await pack.getDocument(entry._id);
        const data = packItemData(source);
        data.system.innate = true;
        // Blank, deliberately: this copy's own uses are never checked or
        // spent — the Channels item's shared pool (above) is the only
        // bookkeeping, so a second, per-spell gate would either fight it
        // or silently do nothing.
        data.system.usesPerDay = "";
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
          sourceId: item.id, sourceName: item.name, requested: picked
        });
        [spell] = await actor.createEmbeddedDocuments("Item", [data]);
      }

      const { castSpell } = await import("./magic/cast-workflow.mjs");
      const result = await castSpell(actor, spell);
      if (!result) return;

      if (remaining !== null && remaining !== Infinity) {
        await item.update({ "system.usesValue": remaining - 1 });
        await postCard(actor, "Channels", [
          line(`${remaining - 1} Channels use${remaining - 1 === 1 ? "" : "s"} remaining today.`)
        ]);
      }
    }
  },

  // Priestly Path (Cleric, 1st): the third of Chapter 3's "choose an
  // archetype feat, prerequisites waived" pickers — after the Fighter's
  // Martial Training and the Rogue's Archetypal Path, same shape. One of
  // the seven options (Loremaster, "10 ranks total" across seven skills)
  // is unreachable at 1st level otherwise, the same reasoning that waived
  // prerequisites for those two.
  "priestly path": {
    hint: "Choose your Priestly Path: Adventurer, Blessed by the Gods, Cloistered Priest, Enigma, Loremaster, Medic or War Priest — prerequisites waived.",
    async use(actor, item) {
      const options = item?.flags?.[SYSTEM_ID]?.archetypeChoices ?? [
        "Adventurer", "Blessed by the Gods", "Cloistered Priest", "Enigma", "Loremaster", "Medic", "War Priest"
      ];
      const flagKey = `priestlyPath-${item.id}`;
      const recorded = actor.getFlag(SYSTEM_ID, flagKey);
      if (recorded) {
        ui.notifications.info(
          `${item.name}: your path is ${recorded}. You must complete its progression requirements before selecting another.`
        );
        return;
      }
      const picked = await chooseFromList(
        item.name,
        "Archetype feat that becomes your Priestly Path — prerequisites waived",
        options.map((name) => [name, name])
      );
      if (!picked) return;
      const held = Array.from(actor.items ?? []).find(
        (i) => i.type === "feat" && normalise(i.name) === normalise(picked)
      );
      // ALREADY ON THE SHEET: claim it rather than adding a second copy.
      // Without provenance the feat goes on costing a class pick, which
      // is exactly the complaint Graham raised about Martial Training —
      // and these two paths share its shape. The class grants this
      // archetype however it arrived, so a player who bought it before
      // pressing Use gets their pick back.
      if (held) {
        await held.update({
          [`flags.${SYSTEM_ID}.grantedBy`]: {
            sourceId: item.id, sourceName: item.name, requested: picked
          }
        });
      } else {
        const pack = contentPack("feats");
        const index = await pack.getIndex();
        const entry = Array.from(index.values()).find(
          (e) => normalise(e.name) === normalise(picked)
        );
        if (!entry) {
          ui.notifications.warn(`${item.name}: "${picked}" is not in the feats compendium.`);
          return;
        }
        const data = packItemData(await pack.getDocument(entry._id));
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
          sourceId: item.id, sourceName: item.name, requested: picked
        });
        await actor.createEmbeddedDocuments("Item", [data]);
      }
      await actor.setFlag(SYSTEM_ID, flagKey, picked);
      await postCard(actor, item.name, [
        line(`<strong>${picked}</strong> gained as your Priestly Path${held ? " (already on your sheet)" : ""}.`),
        line("<em>Prerequisites waived. You must complete this archetype's progression requirements before selecting another.</em>")
      ]);
    }
  },

  // Arcane Bond (Wizard, 1st): "During your daily preparation each day,
  // you can designate a single item you own as your bonded item... The
  // item becomes a +1-spell adder which functions only for you. At 6th
  // level and then every 6 levels thereafter, the bonus... increases by
  // +1." The daily choice and the bonus LADDER are real (wizard.mjs's
  // arcaneBondBonus) — what "spell adder" actually DOES mechanically is
  // not defined anywhere in this pack's source text outside this one
  // sentence, the same shape of gap Blade Ally's rune got at 3.228.0.
  // Recorded as a flag on the ability item, like Blade Ally's own choice
  // — no ActiveEffect, because nothing would read it.
  "arcane bond": {
    hint: "Designate today's bonded item — it becomes a Spell Adder, paying the full PP cost of that many casts today.",
    async use(actor, item) {
      const bondable = Array.from(actor.items ?? []).filter(
        (i) => ["weapon", "armour", "shield", "gear", "consumable", "ammunition"].includes(i.type)
      );
      if (!bondable.length) {
        ui.notifications.warn("Arcane Bond: you have no items to designate yet.");
        return;
      }
      const picked = await chooseFromList(
        "Arcane Bond",
        "Item to designate as your bonded item today",
        bondable.map((i) => [i.id, i.name])
      );
      if (!picked) return;
      const chosen = bondable.find((i) => i.id === picked);
      if (!chosen) return;

      const { arcaneBondBonus } = await import("./wizard.mjs");
      const level = Number(actor.system?.identity?.level ?? 0);
      const bonus = arcaneBondBonus(level);
      await item.setFlag(SYSTEM_ID, "arcaneBond", { itemId: chosen.id, itemName: chosen.name, bonus });
      await postCard(actor, "Arcane Bond", [
        line(`<strong>${esc(chosen.name)}</strong> is your bonded item today — a <strong>+${bonus} Spell Adder</strong>.`),
        // WHAT A SPELL ADDER DOES was recorded here for several releases
        // as having "no defined mechanical effect anywhere in this pack's
        // source text". It was defined — in the familiars pack, on Spell
        // Battery: "a +1 Spell Adder allowing you to cast any one spell
        // from your repertoire each day with no power point cost". The
        // mechanic now lives in magic/spell-adder.mjs and is shared by
        // every carrier rather than bolted onto this one.
        line(`<em>That is <strong>${bonus} free cast${bonus === 1 ? "" : "s"} a day</strong> — when you cast a spell that costs PP you will be offered the use, and taking it pays the whole cost including any warping. Refreshes at Daily Preparation.</em>`),
        line("<em>Re-press Use to change the item, or after levelling to refresh the bonus.</em>")
      ]);
    }
  },

  "beastman": {
    hint: "Choose your sense (Nightvision, or Darkvision if your race has Nightvision) and record your animal lineage.",
    async use(actor, item) {
      const sense = await chooseFromList("Beastman", "Sense gained", [
        ["Nightvision", "Nightvision"],
        ["Darkvision", "Darkvision (only if your race already has Nightvision)"]
      ]);
      if (!sense) return;
      const lineage = await enterText("Beastman", "Animal lineage (your animal race)", "e.g. Wolf, Bear, Badger");
      if (!lineage) return;
      await actor.setFlag(SYSTEM_ID, "beastmanLineage", lineage);
      await replaceFeatEffect(actor, item, {
        name: `Beastman (${lineage}): ${sense}`,
        img: item.img,
        description: `${sense} from your bestial blood; ${lineage} lineage. Beastman racial feats are now available in the feat picker.`
      });
      await postCard(actor, "Beastman", [
        line(`Lineage recorded: <strong>${lineage}</strong>. You gain <strong>${sense}</strong> (shown on the Effects tab).`),
        line("Beastman racial feats now appear in your Add Racial Feat picker.")
      ]);
    }
  },

  "bestial resilience": {
    hint: "Once per day below half HP: Fast Healing equal to Constitution for 1 minute (10+ also resists bludgeoning).",
    async use(actor, item) {
      const uses = Number(item.system.usesValue ?? 0);
      if (uses <= 0) {
        ui.notifications.warn("Bestial Resilience: no uses remain today (resets at Daily Preparation).");
        return;
      }
      const hp = actor.system.resources?.hp ?? {};
      if (Number(hp.value ?? 0) >= Number(hp.max ?? 0) / 2) {
        const { DialogV2: D } = foundry.applications.api;
        const proceed = await D.confirm({
          window: { title: "Bestial Resilience" },
          content: "<p>You are not below half HP — the trigger condition isn't met. Activate anyway (GM call)?</p>",
          rejectClose: false
        });
        if (!proceed) return;
      }

      const con = Number(actor.system.attributes?.constitution?.total ?? 0);
      const level = Number(actor.system.identity?.level ?? 0);
      const inCombat = Boolean(game.combat?.started);

      const effectData = {
        name: `Bestial Resilience: Fast Healing ${con}`,
        img: item.img,
        description: `Fast Healing ${con} at the start of each turn for 1 minute.` +
          (level >= 10 ? " Also resistant to bludgeoning damage for the duration." : ""),
        changes: level >= 10
          ? [{
              key: "system.combat.resistances",
              type: CHANGE_TYPE.ADD,
              value: ", bludgeoning",
              priority: 20
            }]
          : [],
        duration: inCombat
          ? { rounds: 10, startTime: Number(game.time?.worldTime ?? 0) }
          : { seconds: 60, startTime: Number(game.time?.worldTime ?? 0) },
        flags: {
          [SYSTEM_ID]: {
            fastHealing: con,
            ...(inCombat
              ? { conditionExpiresRound: (game.combat.round ?? 0) + 10 }
              : { spellEffect: true, spellEffectEnd: Number(game.time?.worldTime ?? 0) + 60 })
          }
        }
      };
      await replaceFeatEffect(actor, item, effectData);
      await item.update({ "system.usesValue": uses - 1 });

      await postCard(actor, "Bestial Resilience", [
        line(`<strong>Fast Healing ${con}</strong> for 1 minute — healed automatically at the start of each of your turns in combat.`),
        ...(level >= 10 ? [line("Level 10+: also <strong>resistant to bludgeoning</strong> for the duration.")] : []),
        line(`${uses - 1} use${uses - 1 === 1 ? "" : "s"} remaining today.`)
      ]);
    }
  },

  "component savant": {
    hint: "Queue a component swap for your next cast (+1 PP): change one component type for another.",
    async use(actor) {
      const types = [["somatic", "Somatic"], ["verbal", "Verbal"], ["material", "Material"], ["focus", "Focus"]];
      const from = await chooseFromList("Component Savant", "Component to replace (must be on the spell)", types);
      if (!from) return;
      const to = await chooseFromList("Component Savant", "Component to use instead",
        types.filter(([k]) => k !== from));
      if (!to) return;
      await actor.setFlag(SYSTEM_ID, "componentSwapNext", { from, to, pp: 1 });
      await postCard(actor, "Component Savant", [
        line(`Your next cast swaps its <strong>${from}</strong> component for <strong>${to}</strong> (+1 PP, shown in the casting card).`),
        line("<em>The swap applies to the component gate and pouch use automatically, then clears after the cast.</em>")
      ]);
    }
  },

  // Crusader's Mercy (1st): "you may target yourself with a word of
  // divine power which heals you of 1d8+4 hit points of damage. At 3rd
  // level and then every 2 levels thereafter the amount healed
  // increases by 1d8+4. You may use this ability an amount of times
  // per day equal to your Charisma." usesPerDay: "Charisma" was
  // already correctly authored on the pack data (uses.mjs's bare
  // ability-score grammar resolves it); this is the first entry in
  // this registry to roll actual healing dice rather than apply a
  // precomputed number, so postCard is called with the evaluated Roll
  // for Dice So Nice support (see postCard's own comment above).
  "sacred weapon": {
    hint: "Etch your deity's symbol onto a favoured weapon (10 minutes): it becomes a divine focus and a +1 Divine Spell Adder for a year. Etching a new one wipes the old.",
    async use(actor, item) { await etchSacredWeapon(actor, item); }
  },

  "crusader's mercy": {
    hint: "1 AP: heal yourself with a word of divine power — dice scale with level, uses/day equal to Charisma.",
    async use(actor, item) {
      const { itemUsesRemaining } = await import("./uses-workflow.mjs");
      const remaining = itemUsesRemaining(item);
      if (remaining !== null && !(remaining > 0)) {
        ui.notifications.warn("Crusader's Mercy: no uses remain today (resets at Daily Preparation).");
        return;
      }

      const { crusadersMercyFormula } = await import("./crusader.mjs");
      const level = Number(actor.system?.identity?.level ?? 0);
      const formula = crusadersMercyFormula(level);
      if (!formula) {
        ui.notifications.warn("Crusader's Mercy: not available below 1st level.");
        return;
      }

      // MERCY OF RELIEF (Chapter 5): "when using your Crusaders Mercy
      // ability, INSTEAD of healing hit points you may instead choose to
      // duplicate the effects of a restoration spell. This is treated as an
      // innate spell for casting rule purposes."
      //
      // ASKED BEFORE THE AP IS SPENT, because it is an either/or rather
      // than a rider: a player who meant to cast Restoration and finds
      // themselves healed has spent the use on the wrong half. Cancelling
      // the picker leaves the ability unspent entirely.
      const { mercyOfReliefOffered } = await import("./combat/grant-feats.mjs");
      if (mercyOfReliefOffered(Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat").map((i) => i.name))) {
        const pick = await chooseFromList(
          "Crusader's Mercy",
          "Heal, or duplicate a Restoration instead?",
          [["heal", `Heal (${formula})`], ["restoration", "Restoration (Mercy of Relief)"]]
        );
        if (!pick) return;
        if (pick === "restoration") {
          await mercyOfReliefRestoration(actor, item, remaining);
          return;
        }
      }

      const { spendActionCost } = await import("./combat/action-points-workflow.mjs");
      await spendActionCost(actor, "1", item.name);

      const roll = await new Roll(formula).evaluate();
      const hp = actor.system?.resources?.hp;
      const maxHP = Number(hp?.max ?? 0);
      const current = Number(hp?.value ?? 0);
      const newValue = Math.min(maxHP, current + roll.total);
      await actor.update({ "system.resources.hp.value": newValue });

      const usesLeft = remaining === null || remaining === Infinity ? null : remaining - 1;
      if (usesLeft !== null) {
        await item.update({ "system.usesValue": usesLeft });
      }

      await postCard(actor, "Crusader's Mercy", [
        line(`A word of divine power heals <strong>${newValue - current}</strong> HP (rolled ${formula}). Now <strong>${newValue} / ${maxHP}</strong> HP.`),
        ...(usesLeft !== null
          ? [line(`${usesLeft} use${usesLeft === 1 ? "" : "s"} remaining today.`)]
          : [])
      ], [roll]);
    }
  },

  "cultural": {
    hint: "Choose which of your specialist skills carries the +2 racial bonus (Culture's +2 is always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Cultural", value: 2 });
    }
  },

  "daring fortune": {
    hint: "Queue the +4 racial bonus for an untrained skill check.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 4, type: "race", label: "Daring Fortune (untrained)",
        scope: "One skill check made untrained (trained-only actions allowed)", oneShot: true
      });
      await postCard(actor, "Daring Fortune", [
        line("A +4 racial bonus is queued for your next untrained skill check — trained-only actions are permitted."),
        line("<em>If you reroll it with Luck of the Small Folk, add your class bonus to the reroll.</em>")
      ]);
    }
  },

  "darkened veil": {
    hint: "Reaction when targeted while concealed/hidden in dim light or darkness: your avoidance flat check DC drops by 2.",
    async use(actor) {
      const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
      if (reactions <= 0) {
        ui.notifications.warn("Darkened Veil: no reaction available this round.");
        return;
      }
      if (!(await fighterReactionGate(actor, "Darkened Veil"))) return;
      await actor.update({ "system.resources.reactions.value": reactions - 1 });
      // Graham's ruling (1 Aug 2026): the DEFENDER rolls the avoidance flat
      // check, so lowering its DC helps the defender. The next avoidance
      // check this actor makes consumes this queued reduction automatically.
      await actor.setFlag(SYSTEM_ID, "missCheckDCReduction", 2);
      await postCard(actor, "Darkened Veil", [
        line("Reaction spent — your next avoidance flat check DC is lowered by <strong>2</strong> (Concealed 17 → 15, Hidden 10 → 8), applied automatically when the attack or spell resolves.")
      ]);
    }
  },

  // Devotion (1st): "Trigger You fumble a check with either a class
  // skill or favoured weapon attack. ...expend 2 PP treat the check as
  // a failure." A REACTION to a trigger the system already sees, not a
  // stored choice — the button on the card that reports the fumble is
  // where this actually fires (a new button injected onto the fumbled
  // skill check's own card in check-card-interactions.mjs, and a
  // DialogV2 prompt inserted into rollFumbleCheck in
  // combat/attack-workflow.mjs for the favoured-weapon-attack half).
  // This registry entry exists only so the ability has something to
  // say if pressed directly — Use has nothing to do without a fumble
  // already on the table.
  "devotion": {
    hint: "Reaction to your own fumbled class-skill check or favoured-weapon attack: the button appears on that check's own card, not here.",
    async use(actor) {
      await postCard(actor, "Devotion", [
        line("Devotion fires as a reaction to your OWN fumble, not from this button."),
        line("A class-skill check that comes back Fumble or Blunder grows a Devotion button on its own card."),
        line("A favoured-weapon attack that fails its fumble check offers the same choice before rolling on the fumble table."),
        line("Either way it costs 2 PP and treats the roll as an ordinary failure/miss instead.")
      ]);
    }
  },

  "dramatic luck": {
    hint: "Spend a Conviction point: the skill check or save you just rolled becomes a natural 20 (your next natural 20 becomes a 1).",
    async use(actor, item) {
      // THROUGH THE ONE-PER-ROUND GATE (3.619.0; Chapter 12, block 38's A2):
      // "You may spend only one conviction point per round." Dramatic Luck
      // took its point straight off the pool, so it neither asked whether
      // the round's point was gone nor counted as it.
      const { getConvictionState, markConvictionSpent } = await import("./conviction.mjs");
      const state = getConvictionState(actor);
      if (!state.ok) {
        ui.notifications.warn(`Dramatic Luck: ${state.reason}`);
        return;
      }
      await markConvictionSpent(actor);
      await replaceFeatEffect(actor, item, {
        name: "Dramatic Luck: next natural 20 becomes a 1",
        img: item.img,
        description: "The debt from Dramatic Luck — the next natural 20 this character rolls is immediately treated as a natural 1 (cannot be amended). Remove this effect when it triggers."
      });
      await postCard(actor, "Dramatic Luck", [
        line("Conviction spent — treat the skill check or saving throw you just made as a <strong>natural 20</strong> (GM adjusts the result)."),
        line("<strong>The debt:</strong> your next natural 20 becomes a natural 1 — tracked as an effect; remove it when it bites.")
      ]);
    }
  },

  "dwarven scholar": {
    hint: "Choose which of your specialist skills carries the +1 racial bonus (Crafting/Religion +1 are always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Dwarven Scholar", value: 1 });
    }
  },

  "dracoris": {
    hint: "Queue the +1 racial bonus for an interaction with a Wyrm-type creature (the DR 1 is always on).",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 1, type: "race", label: "Dracoris (Wyrm interaction)",
        scope: "One check interacting with a Wyrm-type creature", oneShot: true
      });
      await postCard(actor, "Dracoris", [
        line("A +1 racial bonus is queued for your next interaction check with a Wyrm-type creature.")
      ]);
    }
  },

  // Divine Ally (4th): "your devotion attracts a spirit of your
  // deity's alignment. Once you choose an ally, your choice can't be
  // changed." Three very different resolutions behind one permanent
  // pick, stored on the ability item's own allyChosen flag:
  //
  // - Shield Ally has an exact mechanical precedent already in this
  //   codebase — Shield Focus's shieldFocus derivation in
  //   documents/actor.mjs, which this reuses the same way (see
  //   shieldAllyBonus in crusader.mjs and its wiring below).
  // - Steed Ally gets the "companion automation arrives with the
  //   companion model" note already used by 5+ other feats
  //   (animal-ability.json, converse-with-master.json, and others) —
  //   this is a pre-existing, standing policy, not a new one.
  // - Blade Ally's WEAPON choice is re-pickable every day (the book's
  //   own "select one weapon when you make your daily preparations"),
  //   surfaced at Daily Preparation the same way Hunter's Method's
  //   choice is (see uses-workflow.mjs). Its RUNE choice is recorded
  //   for reference only — no "property rune" system, and no
  //   definitions for called/courageous/disrupting/ghost touch/
  //   returning/shifting, exist anywhere in this pack's source text
  //   (classes.txt, magic.txt) to automate mechanically.
  "divine ally": {
    hint: "Choose your permanent Divine Ally (Blade/Shield/Steed) — cannot be changed once picked. Blade Ally's weapon+rune are set here too, and re-set at daily preparation.",
    async use(actor, item) {
      const {
        divineAllyChoices, deificAlignment, DIVINE_ALLIES, BLADE_ALLY_RUNES, bladeAllyRuneField
      } = await import("./crusader.mjs");
      const { bladeAllyRuneChoices, divineAlliesOpen } =
        await import("./combat/grant-feats.mjs");
      const featNames = Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat").map((i) => i.name);
      let chosen = divineAllyChoices(actor);

      // SECOND ALLY (Chapter 5): "you may select an additional Divine Ally
      // from those available to you." The pick is still permanent and still
      // made from the class's own list — what the feat changes is how many
      // times you may make it, so the loop asks `divineAlliesOpen` rather
      // than testing for a single empty flag.
      const offered = item?.flags?.[SYSTEM_ID]?.allyChoices ?? DIVINE_ALLIES;
      const room = divineAlliesOpen(offered, chosen, featNames);
      if (room.remaining > 0 && room.open.length) {
        const choice = await chooseFromList(
          "Divine Ally",
          chosen.length
            ? `Choose an additional divine ally — this choice is PERMANENT (${room.remaining} left)`
            : "Choose your divine ally — this choice is PERMANENT",
          room.open.map((name) => [name, name])
        );
        if (choice) {
          chosen = [...chosen, choice];
          await item.setFlag(SYSTEM_ID, "allyChosen", chosen);
        } else if (!chosen.length) {
          return;
        }
      }
      // BLADE ALLY IS THE ONE WITH A DAILY CHOICE, so it is the one this
      // button goes on to resolve — whichever position it was picked in.
      const ally = chosen.includes("Blade Ally") ? "Blade Ally" : (chosen[0] ?? null);
      if (!ally) return;

      if (ally === "Blade Ally") {
        const weapons = Array.from(actor.items ?? []).filter((i) => i.type === "weapon");
        if (!weapons.length) {
          ui.notifications.warn("Blade Ally: you have no weapons on your sheet to imbue.");
          return;
        }
        const weaponId = await chooseFromList(
          "Blade Ally",
          "Weapon to imbue for today's preparations",
          weapons.map((w) => [w.id, w.name])
        );
        if (!weaponId) return;
        const weapon = weapons.find((w) => w.id === weaponId);
        // RADIANT BLADE (Chapter 5): "you may add the aligned and flaming
        // weapon property runes to the list that you may select during
        // daily preparation. Any aligned trait that you select must match
        // that of your deific aspect or deity." The alignment is written
        // into the offered label rather than asked as a second question,
        // so the requirement cannot be got wrong — and a Crusader whose
        // aspect names no alignment is simply not offered Aligned.
        const runeOptions = bladeAllyRuneChoices(
          BLADE_ALLY_RUNES, featNames, deificAlignment(actor)
        );
        const rune = await chooseFromList(
          "Blade Ally", "Property rune", runeOptions.map((r) => [r, r])
        );
        if (!rune) return;

        // THE RUNE GOES ON THE WEAPON (3.330.0), not just in a flag.
        //
        // Everything this needed already existed — see the long note on
        // BLADE_ALLY_RUNES in crusader.mjs. Writing `system.runes` is the
        // whole fix: Disrupting then rolls its own damage packet through
        // attack-workflow, Courageous reaches fear saves through
        // rune-effects, Called and Shifting appear as rune actions, and
        // Ghost Touch and Returning are reported on the attack card. Not
        // one line of rune machinery had to be written.
        //
        // LAST NIGHT'S BLADE IS RELEASED FIRST. The ally moves; the rune
        // must not accumulate behind it. `previousRunes` is the field
        // exactly as it stood before the ally landed, so restoring is a
        // write-back rather than a subtraction — which is the only way to
        // be sure a rune the PLAYER added while imbued survives the
        // handover, and that removing ours cannot strip theirs.
        await releaseBladeAlly(actor, item);

        // THE WEAPON REMEMBERS THAT THIS RUNE IS ON LOAN (3.331.0).
        //
        // Graham's ruling: Blade Ally bypasses the rune limitations. Both
        // of them are rules about ETCHING — needing a potency rune
        // beneath, and the item's additional-rune allowance — and a
        // spirit inhabiting a blade for a day etches nothing. Without
        // this, a 4th-level Crusader imbuing his ordinary axe got a
        // weapon reporting "1 rune inscribed with no potency rune", which
        // is the ordinary case rather than an edge one.
        //
        // The flag lives on the WEAPON, not on the ability, because
        // `_applyRunes` runs on the item and has no view of the actor's
        // other items. Cleared by `releaseBladeAlly`.
        const previousRunes = String(weapon.system?.runes ?? "");
        await weapon.update({
          "system.runes": bladeAllyRuneField(previousRunes, rune),
          [`flags.${SYSTEM_ID}.bladeAllyRune`]: rune
        });
        await item.setFlag(SYSTEM_ID, "bladeAlly", {
          weaponId: weapon.id, weaponName: weapon.name, rune, previousRunes
        });

        const catalogue = (await import("./weapon-rune-data.mjs")).WEAPON_RUNES;
        const entry = catalogue.find((r) => normalise(r.name) === normalise(rune));
        await postCard(actor, "Divine Ally — Blade Ally", [
          line(`A spirit of battle dwells in your <strong>${esc(weapon.name)}</strong>, bearing the <strong>${esc(rune)} I</strong> rune.`),
          entry?.effect ? line(`<em>${esc(entry.effect)}</em>`) : "",
          line("<em>Written onto the weapon itself, so it works exactly as a bought rune of the same name does &mdash; and any runes the weapon already carried are untouched.</em>"),
          line("Re-press this button (or use the Daily Preparation reminder) to imbue a different weapon each day — the ally itself is what's permanent, not the weapon. The old weapon is released when you do.")
        ]);
        return;
      }

      if (ally === "Shield Ally") {
        await postCard(actor, "Divine Ally — Shield Ally", [
          line("A spirit of protection dwells in your shield: its bonus is <strong>+1 higher</strong> whenever a shield is equipped, applied automatically alongside Shield Focus.")
        ]);
        return;
      }

      // Steed Ally: "You gain a young animal companion as a mount —
      // ordinarily one with the mount special ability, such as a horse."
      //
      // A REAL LINKED COMPANION, not a note (3.329.0). This carried the
      // standing "companion automation arrives with the companion model"
      // note for several releases — and the model arrived. The Animal
      // Companion feat has created linked companion actors, with their
      // class, species, creature type and levelled grants, since
      // companion-workflow.mjs; a steed is the same thing from a
      // different granting item, so it calls the same function rather
      // than growing a second one (lesson 13). Found stale during the
      // Chapter 3 amber sweep, 18 Aug 2026.
      //
      // Restricted to MOUNT_CREATURES — the pack declares no mount
      // ability, so the two ridable species are named beside the
      // chooser and pinned by verify-chapter3-ambers.
      const { createCompanionFor, MOUNT_CREATURES } = await import("./companion-workflow.mjs");
      const steed = await createCompanionFor(actor, item, {
        only: MOUNT_CREATURES,
        title: "Divine Ally — Steed Ally",
        intro: "Choose your steed's base creature. A spirit of your deity's alignment takes "
          + "the form of a young mount; its size, ability scores, speeds, senses, natural "
          + "attacks and specials all come from the species, and its level follows yours."
      });
      if (!steed) return;
      await postCard(actor, "Divine Ally — Steed Ally", [
        line(`A spirit of your deity's alignment takes the form of <strong>${esc(steed.name)}</strong>, `
          + "your steed — created as a linked companion actor that levels with you."),
        line("<em>The steed's own sheet carries its species, natural attacks and the Animal Companion "
          + "progression. Riding rules themselves are Chapter 6's.</em>")
      ]);
    }
  },

  // The first CLASS-item Use entry — nothing else in this registry is
  // keyed to a class's own name, because nothing else has needed a
  // chooser that belongs to the class rather than to one of its
  // abilities or a feat. useFeat's type table (TYPE_AUTOMATION) only
  // intercepts divine-aspect/wizard-school/creature-type; "class" falls
  // through to this plain name lookup exactly like a feat or ability
  // would, and the Foundations row already renders a Use button for any
  // item hasFeatAutomation says yes to (actor-sheet.hbs's identity
  // block), so no template change was needed to reach it.
  /**
   * "When you select this feat you gain a new specialist spell for which
   * you meet the prerequisites. If a specialist spell requires a unique
   * feat to purchase it, you may not select it with this feat. You may
   * select this feat multiple times, on each occasion selecting a
   * different specialist spell." (Chapter 5.)
   *
   * IT DID NOTHING AT ALL until now. The feat was in the pack, was
   * offered by the picker, could be taken — and had no entry in this
   * table, so its row rendered no Use button and no spell ever arrived.
   * The Druid entry below has been telling players "the Specialist Spell
   * feat buys further ones" since it was written, which is a promise
   * nothing kept. Reported by Graham, 12 Aug 2026.
   *
   * THREE PARTS OF THE RULE, each read off the data:
   *
   *  - "for which you meet the prerequisites" — the PP tier is the gate.
   *    specialistMaxPP is the character's LEVEL (casting.mjs), so a 3rd
   *    level character may buy PP 1-3 and reaches the PP 7 tier at 7th.
   *  - "requires a unique feat" — a specialist spell's list is named by
   *    `specialistClass`, and two of those names are not classes at all
   *    but archetype feats (Loremaster). Matching against the
   *    character's CLASSES therefore excludes exactly the spells that
   *    need a feat to unlock, for the reason the rule gives, rather than
   *    by a hardcoded list of names. Effective classes are used, so an
   *    archetype that opens another class's list is honoured.
   *  - "a different specialist spell" — anything already on the sheet is
   *    filtered out, so a second copy of the feat cannot re-buy the
   *    first copy's pick.
   *
   * `sourceItem` is this feat, so each COPY owns its own choice: pressing
   * Use again re-picks for that copy and leaves the others alone. That
   * is grantChosenSpell's per-source scoping, and it is what makes a
   * repeatable feat behave.
   */
  "specialist spell": {
    hint: "Choose the specialist spell this feat buys (repeatable — this copy's pick).",
    async use(actor, item) {
      const { specialistMaxPP } = await import("./magic/casting.mjs");
      const level = Number(actor.system?.identity?.level ?? 0);
      const maxPP = specialistMaxPP(level);
      const archetypes = Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat" && i.system?.category === "Archetype")
        .map((i) => i.name);
      const className = Array.from(actor.items ?? []).find((i) => i.type === "class")?.name ?? "";
      const mine = new Set(
        effectiveClasses(className, archetypes)
          .split(/,\s*/).map((n) => n.trim().toLowerCase()).filter(Boolean)
      );
      if (!mine.size) {
        ui.notifications.warn("Specialist Spell: this character has no class to draw a specialist list from.");
        return;
      }
      const owned = new Set(
        Array.from(actor.items ?? [])
          .filter((i) => i.type === "spell")
          .map((i) => String(i.name).trim().toLowerCase())
      );
      // WHICH SPECIALIST SPELLS (3.623.0, block 40, Graham's R2): the
      // class tag alone let a Cleric of Dawn buy Tyranny's spells and
      // left a Crusader unable to buy its own aspect's — Appendix 4 says
      // they "may be learnt by clerics and crusaders who select this
      // deific aspect by taking the specialist spell feat". The rule is
      // specialistSpellAccess (aspect-rules.mjs).
      const { specialistSpellAccess } = await import("./aspect-rules.mjs");
      const { specialistAccessFor } = await import("./aspect-workflow.mjs");
      const access = await specialistAccessFor(actor);
      await grantChosenSpell(actor, {
        title: "Specialist Spell",
        // SPECIALIST BY DESIGN. `grantChosenSpell` excludes specialist
        // spells by default (Graham, 15 Aug 2026) so that a free repertoire
        // pick cannot take what a heritage or school is meant to grant.
        // THIS chooser is the granting side of that rule, and every one of
        // the 106 specialist-class spells carries `specialist: true` — so
        // without this line the list is empty and the feature silently
        // offers nothing at all.
        allowSpecialist: true,
        filter: (s) => {
          if (!specialistSpellAccess({
            ...access,
            myClasses: mine,
            spellName: s.name,
            specialistClass: s.system?.specialistClass
          })) return false;
          if (Number(s.system?.ppCost ?? Infinity) > maxPP) return false;
          return !owned.has(String(s.name).trim().toLowerCase());
        },
        flagKey: "featSpecialistSpell",
        indexFields: ["system.specialistClass"],
        grantNote: `A specialist spell bought with the Specialist Spell feat (PP ${maxPP} or less at level ${level}).`,
        sourceItem: item
      });
    }
  },

  /**
   * The Fighter's and the Rogue's magical tradition (3.329.0).
   *
   * Both classes print the same sentence: "You have no spell casting
   * abilities but must select a magical tradition at 1st level."
   *
   * The "no spell casting" half was always enforced — PP 0, no caster
   * style, no memorisation or repertoire card, and setting a tradition
   * does not change any of that. The CHOICE was the gap: the sheet has
   * always offered the dropdown (it is only hidden when a class fixes
   * the tradition, which these two do not), but nothing ever asked, and
   * it starts blank. A character built entirely through the system
   * therefore ended up without a choice the book requires. Found in the
   * Chapter 3 audit, 18 Aug 2026.
   *
   * A CHOOSER, NOT A DERIVE. There is nothing to compute — the tradition
   * is the player's pick, and it matters elsewhere (tradition-scoped
   * conditionals, item use, what a scroll can be read from), which is
   * why the book asks for one even from a class that casts nothing.
   *
   * Re-pressable: the tradition is not declared permanent, unlike Divine
   * Ally, so the button changes it rather than refusing.
   */
  "fighter": {
    hint: "Choose your magical tradition — required at 1st level even though you cast no spells.",
    async use(actor, item) { await chooseMagicalTradition(actor, item); }
  },

  "rogue": {
    hint: "Choose your magical tradition — required at 1st level even though you cast no spells.",
    async use(actor, item) { await chooseMagicalTradition(actor, item); }
  },

  "druid": {
    hint: "Choose your 1st-level PP 1 Druid Specialist Spell (repeatable — replaces the current pick).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Druid Specialist Spell",
        // SPECIALIST BY DESIGN. `grantChosenSpell` excludes specialist
        // spells by default (Graham, 15 Aug 2026) so that a free repertoire
        // pick cannot take what a heritage or school is meant to grant.
        // THIS chooser is the granting side of that rule, and every one of
        // the 106 specialist-class spells carries `specialist: true` — so
        // without this line the list is empty and the feature silently
        // offers nothing at all.
        allowSpecialist: true,
        filter: (s) => onSpecialistList(s.system, "druid") && Number(s.system?.ppCost) === 1,
        flagKey: "druidSpecialistSpell",
        indexFields: ["system.specialistClass"],
        grantNote: "Your free PP 1 Druid Specialist Spell. The Specialist Spell feat buys further ones (any PP tier you qualify for).",
        sourceItem: item
      });
    }
  },

  "earthbound might": {
    hint: "Queue the +2 racial bonus for a melee attack against a foe on the same earth/stone surface.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "race", label: "Earthbound Might (shared earth)",
        scope: "One melee attack vs a foe on the same solid earth or stone surface", oneShot: true
      });
      await postCard(actor, "Earthbound Might", [
        line("A +2 racial bonus is queued — tick it in the next melee attack dialog when you and your foe stand on the same solid earth or stone.")
      ]);
    }
  },

  "elven magic": {
    hint: "Choose your bonus arcane/verdant cantrip; the +1 PP per caster level trues up automatically.",
    async use(actor, item) {
      const summary = await reconcilePPGrant(actor, PP_GRANTS[1], { report: true });
      if (!summary) {
        ui.notifications.info("Elven Magic: maximum PP already includes the full caster-level grant.");
      }
      await grantChosenSpell(actor, {
        title: "Elven Magic",
        filter: (s) => isCantripSpell(s) &&
          /arcane|verdant/i.test(String(s.system?.tradition ?? "")),
        flagKey: "elvenMagicSpell",
        grantNote: "A bonus repertoire spell — needs no memorisation and doesn't count against known spells.",
        sourceItem: item
      });
    }
  },

  "elven magic, greater": {
    hint: "Choose your bonus PP 2 arcane/verdant spell.",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Elven Magic, Greater",
        filter: (s) => Number(s.system?.ppCost ?? -1) === 2 &&
          /arcane|verdant/i.test(String(s.system?.tradition ?? "")),
        flagKey: "elvenMagicGreaterSpell",
        grantNote: "A bonus repertoire spell — needs no memorisation and doesn't count against known spells.",
        sourceItem: item
      });
    }
  },

  "elven scholar": {
    hint: "Choose which of your specialist skills carries the +2 racial bonus (Arcana/Nature +1 are always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Elven Scholar", value: 2 });
    }
  },

  "elven spirit": {
    hint: "Queue the +1 racial bonus for a save against immobilising/paralysing/slowing effects.",
    async use(actor, item) {
      await addPendingModifier(actor, {
        value: 1, type: "race", label: "Elven Spirit",
        scope: "One save vs an immobilised/paralyzed/slowed effect", oneShot: true
      });
      await postCard(actor, "Elven Spirit", [
        line("A +1 racial bonus is queued for your next save against an immobilising, paralysing or slowing effect."),
        line("<em>Ghoul paralysis doesn't affect you at all; movement-restricting conditions of 2+ rounds last 1 round less.</em>")
      ]);
    }
  },

  "ethereal trick": {
    hint: "Choose an ethereal cantrip to add to your known spells (cast with your Spellcraft bonus).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Ethereal Trick",
        filter: (s) => isCantripSpell(s) &&
          /ethereal/i.test(String(s.system?.tradition ?? "")),
        flagKey: "etherealTrick",
        grantNote: "Cast it using your own Spellcraft bonus.",
        sourceItem: item
      });
    }
  },

  "exceptional training": {
    hint: "Choose a non-class skill — it becomes a class skill (kept in step with your class bonus).",
    async use(actor, item) {
      const classBonus = Number(actor.system.identity?.classBonus ?? 0);
      // The STORED class value, not the derived one: a background's +1
      // class bonus rides in the bonus pool and shows up in the derived
      // slot, which would have made every skill a background touches look
      // like it was already a class skill and hidden it from this list.
      const candidates = Object.entries(actor.system.skills ?? {})
        .filter(([key]) => storedValue(actor, `system.skills.${key}.class`) === 0)
        .map(([key, skill]) => [key, skill.label ?? key]);
      if (!candidates.length) {
        ui.notifications.warn("Exceptional Training: every skill already has a class bonus.");
        return;
      }
      const key = await chooseFromList("Exceptional Training", "Skill to become a class skill", candidates);
      if (!key) return;
      const label = actor.system.skills[key]?.label ?? key;

      // Reverse a previous choice first (the feat records what it wrote).
      const previous = actor.getFlag(SYSTEM_ID, "exceptionalTraining");
      if (previous?.skill && previous.skill !== key) {
        const prevPath = `system.skills.${previous.skill}.class`;
        const prevCurrent = storedValue(actor, prevPath);
        await actor.update({ [prevPath]: Math.max(0, prevCurrent - Number(previous.written ?? 0)) });
      }

      // The CHOICE is recorded and nothing is written. The class bonus is
      // derived from this flag now (class-skills.mjs), so writing it into
      // the slot as well would count it twice — and the number would then
      // need truing up at every level change, which is the machinery this
      // replaced.
      await actor.setFlag(SYSTEM_ID, "exceptionalTraining", { skill: key, written: 0 });
      await replaceFeatEffect(actor, item, {
        name: `Exceptional Training: ${label}`,
        img: item.img,
        description: `${label} is a class skill — worth your class bonus, and it follows your class bonus as you level.`
      });
      await postCard(actor, "Exceptional Training", [
        line(`<strong>${label}</strong> is now a class skill — worth your class bonus (${classBonus} at your level), and it keeps step with it. Remove the feat and it stops counting.`)
      ]);
    }
  },

  "ferocious charge": {
    hint: "Queue the +2 circumstance bonus for a melee attack after a 20 ft straight-line charge (attack doubles as a 0 AP Trip).",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "circumstance", label: "Ferocious Charge",
        scope: "One melee attack after moving 20+ ft in a straight line to the target", oneShot: true
      });
      await postCard(actor, "Ferocious Charge", [
        line("A +2 circumstance bonus is queued — tick it in the melee attack dialog at the end of your 20+ ft straight-line charge."),
        line("<em>The attack is also treated as a Trip action for 0 AP — resolve the Trip alongside the hit.</em>")
      ]);
    }
  },

  "focused pursuit": {
    hint: "Create your new Specialised Skill.",
    async use(actor, item) {
      const existing = actor.getFlag(SYSTEM_ID, "focusedPursuitSkill");
      if (existing && actor.system.specialistSkills?.[existing]) {
        const label = actor.system.specialistSkills[existing].label;
        ui.notifications.info(`Focused Pursuit already created "${label}" — edit or remove it on the Skills tab.`);
        return;
      }
      const name = await enterText("Focused Pursuit", "Name of your new Specialised Skill", "e.g. Clockwork Devices");
      if (!name) return;
      const ability = await chooseFromList("Focused Pursuit", "Associated ability", [
        ["strength", "Strength"], ["dexterity", "Dexterity"], ["constitution", "Constitution"],
        ["intelligence", "Intelligence"], ["wisdom", "Wisdom"], ["charisma", "Charisma"]
      ]);
      if (!ability) return;

      const skill = { ...blankSpecialistSkill(ability), label: name };
      const key = uniqueKey(slugifyKey(name), actor.system.specialistSkills ?? {});
      await actor.update({ [`system.specialistSkills.${key}`]: skill });
      await actor.setFlag(SYSTEM_ID, "focusedPursuitSkill", key);
      await postCard(actor, "Focused Pursuit", [
        line(`New Specialised Skill created: <strong>${name}</strong> (${ability}) — it appears with your specialist skills.`)
      ]);
    }
  },

  "halfling scholar": {
    hint: "Choose which of your specialist skills carries the +2 racial bonus (Acrobatics/Stealth +1 are always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Halfling Scholar", value: 2 });
    }
  },

  "hammerhands": {
    hint: "Queue the +2 circumstance bonus for an unarmed shove attempt.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "circumstance", label: "Hammerhands (unarmed shove)",
        scope: "One Shove attempt while fighting unarmed", oneShot: true
      });
      await postCard(actor, "Hammerhands", [
        line("A +2 circumstance bonus is queued for your next unarmed Shove attempt."),
        line("<em>Your unarmed attacks deal bludgeoning damage.</em>")
      ]);
    }
  },

  "hauling shadow": {
    hint: "Queue the +2 circumstance bonus for concealing an object stored in your shadow.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "circumstance", label: "Hauling Shadow",
        scope: "One Conceal an Object (Stealth) check for an item in your shadow", oneShot: true
      });
      await postCard(actor, "Hauling Shadow", [
        line("A +2 circumstance bonus is queued for concealing an object stored in your shadow."),
        line("<em>Shadow capacity 10 lbs; stored items don't count towards carried weight (track by hand — deduct from encumbrance-relevant gear or stow them in a container marked weightless).</em>")
      ]);
    }
  },

  "hidden emotion": {
    hint: "Queue the +1/level racial bonus for a save vs an emotion effect (advantage 1/day via the charge button).",
    async use(actor) {
      const level = Math.max(1, Number(actor.system.identity?.level ?? 1));
      await addPendingModifier(actor, {
        value: level, type: "race", label: "Hidden Emotion",
        scope: "One saving throw against an emotion effect", oneShot: true
      });
      await postCard(actor, "Hidden Emotion", [
        line(`A +${level} racial bonus (your level) is queued for your next save against an emotion effect.`),
        line("<em>Once per day you may also take Advantage on such a save — spend the feat's daily charge (lightning button) when you do.</em>")
      ]);
    }
  },

  "hunt prey": {
    hint: "1 AP: designate your current target as your hunted prey — your class bonus rides every check against it (attacks automatically; a tickbox on other checks).",
    async use(actor) {
      // Ranger, 1st (Chapter 3). "You must be able to see or hear the
      // prey, or you must be tracking the prey" is the player's own
      // clause — the button records the designation, the card repeats
      // the requirement.
      const targetToken = game.user.targets?.first?.() ?? [...(game.user.targets ?? [])][0] ?? null;
      if (!targetToken?.actor) {
        ui.notifications.warn("Hunt Prey: target the creature first, then press Use.");
        return;
      }
      const { traitGate, recordTraitUsage } = await import("./traits-workflow.mjs");
      const action = { traits: "Concentrate" };
      if (!traitGate(actor, action, "Hunt Prey")) return;
      const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      await spendActionPoints(actor, "1", "Hunt Prey");
      await recordTraitUsage(actor, action);
      const { huntedPrey, selectedHunterMethod, HUNTER_METHODS } = await import("./ranger.mjs");
      const prior = huntedPrey(actor);
      const prey = {
        tokenId: targetToken.id,
        actorId: targetToken.actor.id,
        name: targetToken.actor.name
      };
      await actor.setFlag(SYSTEM_ID, "huntedPrey", prey);
      const classBonus = Number(actor.system?.identity?.classBonus ?? 0);
      const methodKey = selectedHunterMethod(actor);
      const methodLabel = HUNTER_METHODS.find((m) => m.key === methodKey)?.label ?? null;
      const hasMethod = actor.items.some(
        (i) => i.type === "ability" && normalise(i.name) === "hunter's method"
      );
      await postCard(actor, "Hunt Prey", [
        line(`<strong>${esc(prey.name)}</strong> is your hunted prey${prior?.name && prior.tokenId !== prey.tokenId ? ` — ${esc(prior.name)} loses the designation` : ""}.`),
        line(`Your <strong>+${classBonus}</strong> class bonus applies to all checks against it — attacks automatically, other checks via the "against your hunted prey" tickbox.`),
        ...(hasMethod
          ? [line(methodLabel
              ? `<strong>${methodLabel}</strong> applies (Hunter's Method).`
              : "<em>No Hunter's Method selected — press Use on Hunter's Method to choose one.</em>")]
          : []),
        line("<em>Requires that you can see or hear the prey, or are tracking it.</em>")
      ]);
    }
  },

  "hunter's method": {
    hint: "Choose the Method applied when you Hunt Prey — selected during daily preparation; press Use to set or change it.",
    async use(actor, item) {
      // Ranger, 1st (Chapter 3). One stored slot IS the rule — "The
      // Ranger may only have one Hunter's Method active at a time."
      // Changed freely through this button; the book times the choice
      // to daily preparation, which the daily-prep card reminds about.
      const { HUNTER_METHODS, precisionHunterDice } = await import("./ranger.mjs");
      const offered = item?.flags?.[SYSTEM_ID]?.methodChoices ?? HUNTER_METHODS.map((m) => m.label);
      const current = String(item.flags?.[SYSTEM_ID]?.hunterMethodChoice ?? "");
      const options = offered.map((label) => {
        const key = HUNTER_METHODS.find((m) => m.label === label)?.key ?? label.toLowerCase();
        return [key, label + (key === current ? " (current)" : "")];
      });
      const choice = await chooseFromList(item.name, "Method applied when you Hunt Prey", options);
      if (!choice) return;
      await item.setFlag(SYSTEM_ID, "hunterMethodChoice", choice);
      const level = Number(actor.system?.identity?.level ?? 0);
      const detail = {
        precision: `Once per round, the first Strike that damages your prey deals +${precisionHunterDice(level)}d6 precision damage — added to the damage roll automatically.`,
        relentless: `Your multiple attack penalty against your prey is reduced by ${level >= 11 ? 2 : 1} — applied to the attack roll automatically.`,
        warden: "+1 circumstance to DB against your prey's attacks (automatic) and to saves against its abilities (the prey tickbox on the save dialog).",
        stalker: `+${level >= 10 ? 2 : 1} circumstance to Stealth, Perception and Survival checks against your prey (the prey tickbox on those checks).`
      }[choice];
      const label = HUNTER_METHODS.find((m) => m.key === choice)?.label ?? choice;
      await postCard(actor, item.name, [
        line(`<strong>${label}</strong> is your Hunter's Method.`),
        ...(detail ? [line(detail)] : []),
        line("<em>The book times this choice to daily preparation — change it there with this same button.</em>")
      ]);
    }
  },

  "hybrid transformation": {
    hint: "Shift between humanoid and Hybrid Form (1 AP; free with Sudden Form): bite strike + natural base DR 1.",
    async use(actor, item) {
      const inForm = actor.getFlag(SYSTEM_ID, "hybridForm") ?? null;
      const inCombat = Boolean(game.combat?.started);
      // Sudden Form (Chapter 5): "cost 1 less AP" — the 1 AP shift becomes free.
      const shiftCost = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "sudden form"
      ) ? 0 : 1;
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (inCombat && ap < shiftCost) {
        ui.notifications.warn("Hybrid Transformation: 1 AP required to shift.");
        return;
      }

      if (inForm) {
        // Return to humanoid form: remove the bite and the form effect.
        if (inCombat && shiftCost) await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - shiftCost });
        const bite = actor.items.get(inForm.biteId);
        if (bite) await bite.delete();
        const stale = Array.from(actor.effects ?? [])
          .filter((e) => e.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) === item.id)
          .map((e) => e.id);
        if (stale.length) await actor.deleteEmbeddedDocuments("ActiveEffect", stale);
        await actor.unsetFlag(SYSTEM_ID, "hybridForm");
        await postCard(actor, "Hybrid Transformation", [
          line(`Returned to humanoid form${inCombat && shiftCost ? " (1 AP spent)" : inCombat ? " (free — Sudden Form)" : ""}.`)
        ]);
        return;
      }

      if (inCombat && shiftCost) await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - shiftCost });
      // HULKING FORM (Chapter 5, Beastman, level 10) RIDES THIS SHIFT.
      //
      // "While in your hybrid form, you gain the effects of the Enlarge
      // spell" — a clause with no button of its own, no duration of its
      // own and no way to end other than this one. So it is applied HERE,
      // as a SECOND effect, created below once the form's own is in place.
      //
      // 3.567.0 put it on the Hybrid Form effect, so that one deletion
      // could not leave a permanently Large Beastman behind. Graham's
      // corrected wording of 17 September gave the clause a duration the
      // form does not have — "at base PP cost for 10 minutes" — and two
      // deadlines cannot live on one effect, because an effect is the
      // unit Foundry expires. So they are separate, and the guarantee is
      // kept by the FLAG instead: this one carries the same featSource as
      // the form's, and the revert branch above deletes by that flag, so
      // whichever ends first — the ten minutes or the shift back — ends
      // the growth.
      //
      // Read BEFORE either effect exists, so the step is taken from the
      // character's own size rather than from a size this feat granted a
      // moment ago. See module/hulking-form.mjs.
      const hulkingHeld = hasHulkingForm(
        Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
      );
      const currentSize = actor.system?.identity?.size;
      const hulking = hulkingHeld
        ? hulkingFormEffectData(currentSize, {
            img: item.img,
            worldTime: Number(game.time?.worldTime ?? 0),
            systemId: SYSTEM_ID
          })
        : null;
      const hulkingLine = hulkingHeld ? hulkingFormNote(currentSize) : "";
      const lineage = actor.getFlag(SYSTEM_ID, "beastmanLineage") ?? "beast";
      const [bite] = await actor.createEmbeddedDocuments("Item", [{
        name: "Hybrid Bite",
        type: "weapon",
        img: "icons/creatures/abilities/mouth-teeth-long-red.webp",
        system: {
          damage: "1d6",
          damageType: "piercing",
          traits: "agile, finesse, unarmed, brawling",
          attackMode: "melee",
          group: "brawling",
          natural: true,
          equipped: true,
          // A granted natural attack. Every character is proficient with
          // unarmed attacks, and the proficiency engine reads the
          // category — a created weapon without one would be the only
          // natural attack in the game that carries a -4.
          category: "Unarmed",
          proficiency: "simple",
          description: `Natural strike of your ${lineage} hybrid form (Hybrid Transformation).`
        }
      }]);
      await replaceFeatEffect(actor, item, {
        name: "Hybrid Form",
        img: item.img,
        description: "Merged humanoid/beast form: bite strike, natural base DR 1."
          + (hulking ? " Hulking Form is running its own ten-minute clock beside this." : "")
          + " Cannot disguise your nature while transformed. Return to humanoid form via the feat's Use button (1 AP).",
        changes: [{
          key: "system.combat.naturalArmourBase.natural",
          type: CHANGE_TYPE.CUSTOM,
          value: "1",
          priority: 20
        }]
      });
      // STAMPED WITH THE FORM'S OWN SOURCE FLAG, which is what makes the
      // revert sweep take it away too. Created AFTER replaceFeatEffect,
      // because that helper clears every effect carrying this flag before
      // writing its own — running it in the other order would delete the
      // growth a moment after granting it.
      if (hulking) {
        hulking.flags[SYSTEM_ID][FEAT_SOURCE_FLAG] = item.id;
        hulking.origin = item.uuid;
        await actor.createEmbeddedDocuments("ActiveEffect", [hulking]);
      }
      await actor.setFlag(SYSTEM_ID, "hybridForm", { biteId: bite.id });
      await postCard(actor, "Hybrid Transformation", [
        line(`<strong>Hybrid Form assumed</strong>${inCombat && shiftCost ? " (1 AP spent)" : inCombat ? " (free — Sudden Form)" : ""} — Hybrid Bite (1d6 piercing; agile, finesse, unarmed, brawling) added to your attacks, natural base DR 1 active.`),
        ...(hulkingLine ? [line(hulkingLine)] : []),
        line("<em>You cannot disguise your nature while transformed. Use again to return (1 AP).</em>")
      ]);
    }
  },

  "indomitable resilience": {
    hint: "Queue the +2 racial bonus for a save vs a Soul-school spell (the +2 to Dying Checks is automatic).",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "race", label: "Indomitable Resilience (Soul school)",
        scope: "One saving throw against a Soul-school spell", oneShot: true
      });
      await postCard(actor, "Indomitable Resilience", [
        line("A +2 racial bonus is queued for your next save against a Soul-school spell."),
        line("<em>+2 to Dying Checks is applied automatically in the turn automation; the +2 DB vs Soul spells is applied by hand when relevant.</em>")
      ]);
    }
  },

  "innate courage": {
    hint: "Queue the +2 racial bonus for a save against a fear effect.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "race", label: "Innate Courage (fear)",
        scope: "One saving throw against a fear effect", oneShot: true
      });
      await postCard(actor, "Innate Courage", [
        line("A +2 racial bonus is queued for your next save against a fear effect.")
      ]);
    }
  },

  "kornargon scholar": {
    hint: "Choose which of your specialist skills carries the +2 racial bonus (Stealth/Planes +1 are always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Kornargon Scholar", value: 2 });
    }
  },

  "luck of the small folk": {
    hint: "Reaction, 1/day (2 with Guiding Fortune; hourly with More Small Folk Luck): reroll a failed skill check or saving throw.",
    async use(actor, item) {
      // More Small Folk Luck: recharges hourly — the daily use tracker no
      // longer gates it (the table polices the hour); the Guiding Fortune
      // failed-attack trigger explicitly stays once per day.
      const hourly = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "more small folk luck"
      );
      const uses = Number(item.system.usesValue ?? 0);
      if (!hourly && uses <= 0) {
        ui.notifications.warn("Luck of the Small Folk: no uses remain today (resets at Daily Preparation).");
        return;
      }
      // NOT ON A CHECK LUCK HAS CHANGED (3.624.0, block 40's R12): "you may
      // only apply a fortune effect to a check once and therefore cannot use
      // other abilities such as Halfling Luck to reroll a check after luck
      // has been applied." The triggering check is the last one rolled.
      const { lastCheckTouchedByLuck } = await import("./luck-workflow.mjs");
      if (lastCheckTouchedByLuck(actor)) {
        ui.notifications.warn("Luck of the Small Folk: luck was applied to that check — a check takes only one fortune effect (Appendix 5).");
        return;
      }
      if (game.combat?.started) {
        const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
        if (reactions <= 0) {
          ui.notifications.warn("Luck of the Small Folk: no reaction available this round.");
          return;
        }
        if (!(await fighterReactionGate(actor, "Luck of the Small Folk"))) return;
        await actor.update({ "system.resources.reactions.value": reactions - 1 });
      }
      if (!hourly) await item.update({ "system.usesValue": uses - 1 });
      const hasGuiding = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "guiding fortune"
      );
      await postCard(actor, "Luck of the Small Folk", [
        line(`<strong>Reroll the triggering ${hasGuiding ? "skill check, saving throw or (Guiding Fortune) attack check" : "skill check or saving throw"}</strong> — you must accept the new result, even if worse.`),
        line(hourly
          ? `Recharges every <strong>hour</strong> (More Small Folk Luck — track the hour at the table)${hasGuiding ? "; the failed-attack trigger remains once per day" : ""}${game.combat?.started ? "; reaction spent" : ""}.`
          : `${uses - 1} use${uses - 1 === 1 ? "" : "s"} remaining today${game.combat?.started ? "; reaction spent" : ""}.`)
      ]);
    }
  },

  "luck for all": {
    hint: "Spend a Luck of the Small Folk use: an ally within 30 ft rerolls their failed check instead.",
    async use(actor) {
      const lotsf = actor.items.find(
        (i) => i.type === "feat" && normalise(i.name) === "luck of the small folk"
      );
      if (!lotsf) {
        ui.notifications.warn("Luck for All requires Luck of the Small Folk.");
        return;
      }
      const uses = Number(lotsf.system.usesValue ?? 0);
      if (uses <= 0) {
        ui.notifications.warn("Luck for All: no Luck of the Small Folk uses remain today.");
        return;
      }
      if (game.combat?.started) {
        const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
        if (reactions <= 0) {
          ui.notifications.warn("Luck for All: no reaction available this round.");
          return;
        }
        if (!(await fighterReactionGate(actor, "Luck for All"))) return;
        await actor.update({ "system.resources.reactions.value": reactions - 1 });
      }
      await lotsf.update({ "system.usesValue": uses - 1 });
      await postCard(actor, "Luck for All", [
        line("<strong>An ally within 30 feet rerolls their failed skill check or saving throw</strong> — they must abide by the new result, even if worse."),
        line("<em>Guiding Fortune's attack-check trigger cannot be shared through Luck for All.</em>"),
        line(`${uses - 1} Luck of the Small Folk use${uses - 1 === 1 ? "" : "s"} remaining today.`)
      ]);
    }
  },

  "martial training": {
    hint: "Choose your archetype feat: Aegis, Archer, Armour Master, Cavalier, Champion, Vanguard or Warden — prerequisites waived. Press again to change it.",
    async use(actor, item) {
      // Fighter, 1st (Chapter 3). The seven options are read off the
      // ability item itself — the builder hoists them from the book's own
      // sentence — with the printed list as fallback for a hand-made copy.
      const options = item?.flags?.[SYSTEM_ID]?.archetypeChoices ?? [
        "Aegis", "Archer", "Armour Master", "Cavalier", "Champion", "Vanguard", "Warden"
      ];
      const flagKey = `martialTraining-${item.id}`;
      const recorded = actor.getFlag(SYSTEM_ID, flagKey);

      // RE-PRESSING CHANGES THE CHOICE, as every other chooser in this
      // file does. It used to refuse outright — "you chose X" and nothing
      // more — which left a player who picked wrongly with no way back
      // through the interface. Graham hit exactly that: the recorded
      // choice was Armour Master, the feat was gone from the sheet, and
      // the archetype he actually wanted had to be bought with a normal
      // pick, putting his class pool over budget. Reported 13 Aug 2026.
      const picked = await chooseFromList(
        item.name,
        recorded
          ? `Archetype feat — currently ${recorded}. Choosing another replaces it.`
          : "Archetype feat gained — normal prerequisites and progression requirements are waived",
        options.map((name) => [name, name])
      );
      if (!picked) return;

      // Take down the one this ability granted before, if it is still
      // here and is not what was just chosen. Only a feat THIS ability
      // granted is removed — one the player bought themselves is theirs.
      if (recorded && normalise(recorded) !== normalise(picked)) {
        const previous = Array.from(actor.items ?? []).find((i) =>
          i.type === "feat" && normalise(i.name) === normalise(recorded) &&
          i.flags?.[SYSTEM_ID]?.grantedBy?.sourceId === item.id);
        if (previous) await previous.delete();
      }

      const held = Array.from(actor.items ?? []).find(
        (i) => i.type === "feat" && normalise(i.name) === normalise(picked)
      );

      // ALREADY ON THE SHEET: claim it rather than handing over a second
      // copy. Stamping provenance is the point — without it the feat goes
      // on costing a class pick, which is the whole complaint. The
      // ability grants this archetype however it arrived, so a player who
      // had already bought it gets their pick back.
      if (held) {
        await held.update({
          [`flags.${SYSTEM_ID}.grantedBy`]: {
            sourceId: item.id, sourceName: item.name, requested: picked
          }
        });
      } else {
        const pack = contentPack("feats");
        const index = await pack.getIndex();
        const entry = Array.from(index.values()).find(
          (e) => normalise(e.name) === normalise(picked)
        );
        if (!entry) {
          ui.notifications.warn(`${item.name}: "${picked}" is not in the feats compendium.`);
          return;
        }
        const data = packItemData(await pack.getDocument(entry._id));
        // Provenance, so grant-cleanup takes the archetype down with the
        // ability (and the ability with the class). Also how the feat
        // budget knows this pick was granted, not spent.
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
          sourceId: item.id, sourceName: item.name, requested: picked
        });
        await actor.createEmbeddedDocuments("Item", [data]);
      }
      await actor.setFlag(SYSTEM_ID, flagKey, picked);
      await postCard(actor, item.name, [
        line(`<strong>${picked}</strong> gained as your Martial Training archetype${held ? " (already on your sheet — it no longer costs a pick)" : ""}.`),
        line(`<em>You did not need to meet its prerequisites or progression requirements${recorded && normalise(recorded) !== normalise(picked) ? `, and it replaces ${recorded}` : ""}. Press Use again to change it.</em>`)
      ]);
    }
  },

  "master of aid": {
    hint: "Queue your class bonus for an Aid check with a skill you have 10+ ranks in.",
    async use(actor) {
      const classBonus = Number(actor.system.identity?.classBonus ?? 0);
      const qualifying = Object.values(actor.system.skills ?? {})
        .filter((s) => Number(s.ranks ?? 0) >= 10).length;
      if (!qualifying) {
        ui.notifications.warn("Master of Aid: no skill has 10+ ranks yet.");
        return;
      }
      await addPendingModifier(actor, {
        value: classBonus, type: "class", label: "Master of Aid",
        scope: "One Aid check using a skill with 10+ ranks", oneShot: true
      });
      await postCard(actor, "Master of Aid", [
        line(`Your class bonus (+${classBonus}) is queued for your next Aid check with a skill of 10+ ranks.`)
      ]);
    }
  },

  "mental fortress": {
    hint: "Reaction on a failed save vs a mental effect: roll Mental Focus and use the better result.",
    async use(actor) {
      const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
      if (game.combat?.started && reactions <= 0) {
        ui.notifications.warn("Mental Fortress: no reaction available this round.");
        return;
      }
      if (game.combat?.started) {
        if (!(await fighterReactionGate(actor, "Mental Fortress"))) return;
        await actor.update({ "system.resources.reactions.value": reactions - 1 });
      }
      const skill = actor.system.skills?.mentalFocus;
      const { TRGCheck } = await import("./dice/check.mjs");
      const check = await TRGCheck.roll({
        actor,
        label: "Mental Fortress — Mental Focus",
        subtitle: "Replaces the failed save against the mental effect if better",
        type: "skill",
        modifiers: skill?.checkModifiers ?? [
          { label: "Mental Focus", value: Number(skill?.total ?? 0), type: "untyped" }
        ]
      });
      await postCard(actor, "Mental Fortress", [
        line(`Mental Focus result: <strong>${check.outcome?.total ?? "—"}</strong> — treat it as the saving throw if it beats your original; otherwise the original stands.`),
        ...(game.combat?.started ? [line("Reaction spent.")] : [])
      ]);
    }
  },

  "mountain strider": {
    hint: "Queue the +2 racial bonus for a Balance or Climb check on stone/earth (stone/earth difficult terrain is normal for you).",
    async use(actor) {
      const which = await chooseFromList("Mountain Strider", "Which check is coming up?", [
        ["Balance (Acrobatics)", "Balance (Acrobatics)"],
        ["Climb (Climbing)", "Climb (Climbing)"]
      ]);
      if (!which) return;
      await addPendingModifier(actor, {
        value: 2, type: "race", label: `Mountain Strider (${which})`,
        scope: `One ${which} check on stone or earth`, oneShot: true
      });
      await postCard(actor, "Mountain Strider", [
        line(`A +2 racial bonus is queued for your next ${which} check on stone or earth.`)
      ]);
    }
  },

  "ogre lore": {
    hint: "Add the Ogre Lore specialised skill (the +1 Athletics/Intimidate is always on).",
    async use(actor) {
      const existing = actor.getFlag(SYSTEM_ID, "ogreLoreSkill");
      if (existing && actor.system.specialistSkills?.[existing]) {
        ui.notifications.info("Ogre Lore is already on your specialist skills.");
        return;
      }
      const skill = { ...blankSpecialistSkill("intelligence"), label: "Ogre Lore" };
      const key = uniqueKey(slugifyKey("Ogre Lore"), actor.system.specialistSkills ?? {});
      await actor.update({ [`system.specialistSkills.${key}`]: skill });
      await actor.setFlag(SYSTEM_ID, "ogreLoreSkill", key);
      await postCard(actor, "Ogre Lore", [
        line("<strong>Ogre Lore</strong> added to your specialised skills.")
      ]);
    }
  },

  "one with the mountain": {
    hint: "Configure the granted Meld Into Stone as a divinity innate focus spell.",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "meld into stone");
      if (!spell) {
        ui.notifications.warn("One with the Mountain: Meld Into Stone is not on this character yet — use Apply All Grants (or re-add the feat) first.");
        return;
      }
      const traits = String(spell.system.traits ?? "");
      const updates = { "system.innate": true };
      if (!/\bfocus\b/i.test(traits)) updates["system.traits"] = traits ? `${traits}, focus` : "focus";
      await spell.update(updates);
      await postCard(actor, "One with the Mountain", [
        line("<strong>Meld Into Stone</strong> configured as a divinity innate spell with the focus trait.")
      ]);
    }
  },

  "orc scholar": {
    hint: "Choose which of your specialist skills carries the +2 racial bonus (Athletics/Survival +1 are always on).",
    async use(actor, item) {
      await specialistSkillBonus(actor, item, { title: "Orc Scholar", value: 2 });
    }
  },


  "press the advantage": {
    hint: "Once per round on a trigger: free Step (Stride at 13th) or Interact. Crits and manoeuvre successes prompt automatically — press Use for a trigger the system can't see (enemy disabled, enemy fumble in reach).",
    async use(actor) {
      // Fighter, 4th (Chapter 3). Two of the four triggers resolve at
      // the table rather than in a workflow the system watches — an
      // enemy DISABLED (0 HP, killed, unconscious) and an enemy within
      // reach FUMBLING an attack against you — so this button lets the
      // player claim them. Same once-per-round flag as the automatic
      // prompts, enforced in maybePromptPressTheAdvantage.
      if (!game.combat?.started) {
        ui.notifications.warn("Press the Advantage: only during an encounter.");
        return;
      }
      if (actor.getFlag(SYSTEM_ID, "pressAdvantageUsed")) {
        ui.notifications.warn("Press the Advantage: already used this round — it resets at the start of your turn.");
        return;
      }
      const trigger = await chooseFromList("Press the Advantage", "What just happened?", [
        ["disabled", "You disabled an enemy (0 HP, killed, or unconscious)"],
        ["fumble", "An enemy within your reach fumbled an attack against you"],
        ["manoeuvre", "You succeeded at another martial combat manoeuvre"]
      ]);
      if (!trigger) return;
      const label = {
        disabled: "an enemy disabled",
        fumble: "an enemy within reach fumbled an attack against you",
        manoeuvre: "a successful martial combat manoeuvre"
      }[trigger];
      const { maybePromptPressTheAdvantage } = await import("./combat/attack-workflow.mjs");
      await maybePromptPressTheAdvantage(actor, label);
    }
  },

  "primal shape": {
    hint: "Configure Shape Of The Animal as a 1/day innate ability (uses scale at 9th and every 4 levels).",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "shape of the animal");
      if (!spell) {
        ui.notifications.warn("Primal Shape: Shape Of The Animal is not on this character yet — use Apply All Grants (or re-add the feat) first.");
        return;
      }
      const level = Number(actor.system.identity?.level ?? 1);
      const uses = 1 + Math.max(0, Math.floor((level - 5) / 4));
      const traits = String(spell.system.traits ?? "");
      const sudden = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "sudden form"
      );
      const baseAP = Number(spell.system.castAP ?? 2);
      const updates = {
        "system.innate": true,
        "system.usesPerDay": String(uses),
        "system.usesValue": Math.min(uses, Number(spell.system.usesValue ?? uses) || uses),
        // Sudden Form: Primal Shape costs 1 less AP.
        "system.castAP": sudden ? Math.max(0, baseAP - 1) : baseAP
      };
      if (!/\bfocus\b/i.test(traits)) updates["system.traits"] = traits ? `${traits}, focus` : "focus";
      await spell.update(updates);
      const lineage = actor.getFlag(SYSTEM_ID, "beastmanLineage") ?? "your beast heritage";
      await postCard(actor, "Primal Shape", [
        line(`<strong>Shape Of The Animal</strong> configured as an innate ability — <strong>${uses}/day</strong> at level ${level}, caster level = your level.`),
        line(`<em>The form must reflect ${lineage}. Re-use this button after levelling to refresh the uses-per-day.</em>`)
      ]);
    }
  },

  "roguish skill": {
    hint: "Choose the skill(s) carrying your +1 class bonus — one at 1st, another at 5th, 10th, 15th and 20th; no repeats.",
    async use(actor, item) {
      // Rogue, 1st (Chapter 3). The picks are stored as skill KEYS on
      // this ability item and read everywhere through roguishSkillPicks
      // — the sheet derives the +1, and Scoundrel's Luck's refund asks
      // whether the rolled skill is on this list.
      const { roguishSkillPickCount } = await import("./rogue.mjs");
      const offered = item?.flags?.[SYSTEM_ID]?.skillChoices ?? [
        "Acrobatics", "Athletics", "Climbing", "Deception", "Intimidate", "Stealth", "Thievery"
      ];
      const level = Number(actor.system?.identity?.level ?? 0);
      const allowed = roguishSkillPickCount(level);
      const picks = [...(item.flags?.[SYSTEM_ID]?.roguishSkillChoices ?? [])];
      const label = (key) => offered.find((name) => name.toLowerCase() === key) ?? key;
      const summary = () => picks.map((key) => `<strong>${label(key)}</strong>`).join(", ");
      if (picks.length >= allowed) {
        const nextAt = allowed < 5 ? allowed * 5 : null;
        await postCard(actor, item.name, [
          line(`Skills with the +1 class bonus: ${summary()}.`),
          line(nextAt
            ? `<em>Your next skill arrives at ${nextAt}th level.</em>`
            : "<em>All five skills are chosen.</em>")
        ]);
        return;
      }
      // "You may not select the same skill more than once."
      while (picks.length < allowed) {
        const options = offered
          .filter((name) => !picks.includes(name.toLowerCase()))
          .map((name) => [name.toLowerCase(), name]);
        const choice = await chooseFromList(
          "Roguish Skill",
          `Skill ${picks.length + 1} of ${allowed} for the +1 class bonus`,
          options
        );
        if (!choice) break;
        picks.push(choice);
      }
      if (!picks.length) return;
      await item.setFlag(SYSTEM_ID, "roguishSkillChoices", picks);
      await postCard(actor, item.name, [
        line(`Skills with the +1 class bonus: ${summary()} — applied automatically.`),
        ...(picks.length < allowed
          ? [line(`<em>${allowed - picks.length} pick${allowed - picks.length === 1 ? "" : "s"} still owed — press Use again to choose.</em>`)]
          : []),
        ...(actor.items.some((i) => i.type === "ability" && normalise(i.name) === "scoundrel's luck")
          ? [line("<em>Scoundrel's Luck: conviction spent on advantage for these skills is refunded automatically when the check fails.</em>")]
          : [])
      ]);
    }
  },

  "resilience of stone": {
    hint: "Reaction on a physical critical hit: roll the opposed Fortitude save — success grants CR 1–3 against it.",
    async use(actor) {
      const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
      if (game.combat?.started && reactions <= 0) {
        ui.notifications.warn("Resilience of Stone: no reaction available this round.");
        return;
      }
      const levelText = await enterText("Resilience of Stone", "Attacker's level (for the opposed Level DC)", "e.g. 8");
      if (!levelText) return;
      const attackerLevel = Math.max(1, Number(levelText) || 1);
      if (game.combat?.started) {
        if (!(await fighterReactionGate(actor, "Resilience of Stone"))) return;
        await actor.update({ "system.resources.reactions.value": reactions - 1 });
      }
      const { levelDC } = await import("./dice/resolution.mjs");
      const save = actor.system.combat?.saves?.fortitude;
      const { TRGCheck } = await import("./dice/check.mjs");
      const check = await TRGCheck.roll({
        actor,
        label: "Resilience of Stone — Fortitude",
        subject: "fortitude",
        subtitle: `Opposed Level-Based Save vs level ${attackerLevel}`,
        type: "save",
        dc: levelDC(attackerLevel),
        modifiers: save?.checkModifiers ?? [
          { label: "Fortitude", value: Number(save?.total ?? 0), type: "untyped" }
        ]
      });
      const degree = check.outcome?.degree?.key ?? "failure";
      const cr = degree === "heroic" ? 3 : degree === "critical" ? 2 : check.outcome?.degree?.success ? 1 : 0;
      await postCard(actor, "Resilience of Stone", [
        cr > 0
          ? line(`<strong>CR ${cr}</strong> against this critical — enter it as Critical Resistance when resolving the injury (Universal Modifier Tables tab, or raise the AV threshold by ${cr}).`)
          : line("<strong>Failure</strong> — the critical is unaffected."),
        ...(game.combat?.started ? [line("Reaction spent.")] : [])
      ]);
    }
  },

  // Converted from a queued one-shot to a standing conditional alongside
  // Furini (3.320.0), for the same reason and with the same evidence: a
  // bonus queued for a Spellcraft check is offered only by the check
  // dialog, which a cast never opens. Safe to convert because "Shadow" is
  // a real trait carried by 58 spells in the pack, so the scope matches
  // something. Ascendan Magic has the identical defect and is NOT
  // converted here — its school is free text the player types, which may
  // not correspond to any trait, and that is a design question for
  // Chapter 5's audit rather than a mechanical translation.
  "shadow magi": {
    hint: "Your +1 to Shadow-school Spellcraft checks is applied automatically.",
    async use(actor, item) {
      await replaceFeatEffect(actor, item, {
        name: "Shadow Magi",
        img: item.img,
        description: "+1 to Cast a Spell (Spellcraft) checks for Shadow-school spells.",
        flags: {
          [SYSTEM_ID]: {
            conditionals: [{
              kind: "modifier",
              value: 1,
              type: "untyped",
              label: "Shadow Magi",
              scope: "Casting a spell of the Shadow school",
              auto: true,
              when: { checkTypes: ["spellcraft"], traits: ["shadow"] }
            }]
          }
        }
      });
      await postCard(actor, "Shadow Magi", [
        line("Your <strong>+1</strong> to Shadow-school Spellcraft checks is now applied automatically."),
        line("<em>Shadow-school spells you cast also have their save DC increased by 1 — apply by hand; school-scoped save DCs aren't modelled.</em>")
      ]);
    }
  },

  "shadow sense": {
    hint: "Queue the +1 circumstance bonus for a Perception check or Will save against shadow magic.",
    async use(actor) {
      const which = await chooseFromList("Shadow Sense", "Which check is coming up?", [
        ["Perception vs shadow magic", "Perception vs shadow magic"],
        ["Will save vs shadow magic", "Will save vs shadow magic"]
      ]);
      if (!which) return;
      await addPendingModifier(actor, {
        value: 1, type: "circumstance", label: "Shadow Sense",
        scope: `One ${which}`, oneShot: true
      });
      await postCard(actor, "Shadow Sense", [
        line(`A +1 circumstance bonus is queued for your next ${which}.`),
        line("<em>Sense Magic (Power Manipulation) to detect active shadow magic: the penalty is −5 rather than −10.</em>")
      ]);
    }
  },

  "shadowy guise": {
    hint: "Configure the granted Self Mirage as an ethereal innate focus spell.",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "self mirage");
      if (!spell) {
        ui.notifications.warn("Shadowy Guise: Self Mirage is not on this character yet — use Apply All Grants first.");
        return;
      }
      const traits = String(spell.system.traits ?? "");
      const updates = { "system.innate": true };
      if (!/\bfocus\b/i.test(traits)) updates["system.traits"] = traits ? `${traits}, focus` : "focus";
      await spell.update(updates);
      await postCard(actor, "Shadowy Guise", [
        line("<strong>Self Mirage</strong> configured as an ethereal innate spell with the focus trait.")
      ]);
    }
  },

  "share thoughts": {
    hint: "Configure the granted Telepathy as an at-will innate spell (Ascendan targets only).",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "telepathy");
      if (!spell) {
        ui.notifications.warn("Share Thoughts: Telepathy is not on this character yet — use Apply All Grants first.");
        return;
      }
      await spell.update({ "system.innate": true, "system.usesPerDay": "unlimited" });
      const unrestricted = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "mind speech"
      );
      await postCard(actor, "Share Thoughts", [
        line(`<strong>Telepathy</strong> configured as an at-will innate spell${unrestricted ? " — unrestricted targets (Mind Speech)" : " — Ascendan targets only (Mind Speech lifts this)"}.`)
      ]);
    }
  },

  "small folk rider": {
    hint: "Queue the extra +2 racial bonus for handling a traditional halfling mount (the base +2 is always on).",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "race", label: "Small Folk Rider (halfling mount)",
        scope: "One Handle Animal check with a pony or riding dog", oneShot: true
      });
      await postCard(actor, "Small Folk Rider", [
        line("An extra +2 racial bonus is queued for your next Handle Animal check with a traditional halfling mount.")
      ]);
    }
  },

  /*
   * RUNEMAGE'S SECOND HALF (3.546.0).
   *
   * "You also gain a +2-class bonus on all checks made to identify runic
   * symbols." The component replacement and the DC changes are automatic
   * — see magic/runemage.mjs and magic/casting-dc.mjs — but WHICH check
   * counts as identifying a runic symbol is a table call: it might be
   * Linguistics, Arcana, a specialist Lore, or a Perception check to spot
   * one at all. So it is queued the way every other situational bonus in
   * this file is, rather than guessing a skill and being wrong.
   */
  runemage: {
    hint: "Queue the +2 class bonus for a check to identify runic symbols.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "class", label: "Runemage (runic symbols)",
        scope: "One check made to identify runic symbols", oneShot: true
      });
      await postCard(actor, "Runemage", [
        line("A <strong>+2 class bonus</strong> is queued for your next check to identify runic symbols."),
        line("<em>Your casting components, casting DC and save DCs are handled automatically — see the Symbol line on your cast cards.</em>")
      ]);
    }
  },

  "stone wise": {
    hint: "First use creates the Stone Lore specialist skill (+2 racial); later uses queue the +2 stonework Perception bonus.",
    async use(actor, item) {
      /*
       * IT MADE A SECOND STONE LORE (fixed 3.546.0).
       *
       * Graham, 10 Sep 2026: "adding a duplicate copy of Stone Lore to
       * the specialist skills rather than applying the +2 bonus to the
       * existing skill."
       *
       * Stone Wise is a DWARF feat, and the Dwarf race already grants
       * "Dwarven Lore, Stone Lore" — so the character this feat is for
       * always has the skill before the button is ever pressed. The
       * handler called `uniqueKey(slugifyKey("Stone Lore"), ...)`
       * regardless, and uniqueKey does exactly what its name says:
       * `stoneLore` was taken, so it produced `stoneLore2`.
       *
       * THE DEDUPE ALREADY EXISTED, one file away and unused here.
       * `planSpecialistSkills` matches by LABEL, case-insensitively,
       * under a comment describing this precise failure — "a player who
       * typed 'Stone Lore' by hand before picking the race should not end
       * up with a second one called stoneLore2". The bug was not a
       * missing rule; it was a second implementation of a solved problem.
       */
      const existingKey = findSpecialistSkillByLabel(actor.system.specialistSkills, "Stone Lore")
        ?? actor.getFlag(SYSTEM_ID, "stoneWiseSkill");
      const existing = existingKey ? actor.system.specialistSkills?.[existingKey] : null;

      if (existing && Number(existing.racial ?? 0) < 2) {
        // THE SKILL IS THERE AND THE BONUS IS NOT — the ordinary case for
        // every Dwarf, and the one that used to make a duplicate.
        await actor.update({ [`system.specialistSkills.${existingKey}.racial`]: 2 });
        await actor.setFlag(SYSTEM_ID, "stoneWiseSkill", existingKey);
        await postCard(actor, "Stone Wise", [
          line("<strong>+2 racial bonus</strong> applied to your existing <strong>Stone Lore</strong> specialist skill."),
          line("<em>Use again before a stonework Perception check to queue that +2.</em>")
        ]);
        return;
      }

      if (!existingKey || !actor.system.specialistSkills?.[existingKey]) {
        const skill = { ...blankSpecialistSkill("intelligence"), label: "Stone Lore", racial: 2 };
        const key = uniqueKey(slugifyKey("Stone Lore"), actor.system.specialistSkills ?? {});
        await actor.update({ [`system.specialistSkills.${key}`]: skill });
        await actor.setFlag(SYSTEM_ID, "stoneWiseSkill", key);
        await postCard(actor, "Stone Wise", [
          line("<strong>Stone Lore</strong> specialist skill created with its +2 racial bonus."),
          line("<em>Use again before a stonework Perception check to queue that +2.</em>")
        ]);
        return;
      }
      await addPendingModifier(actor, {
        value: 2, type: "race", label: "Stone Wise (stonework)",
        scope: "One Perception check for unusual stonework or stone traps", oneShot: true
      });
      await postCard(actor, "Stone Wise", [
        line("A +2 racial bonus is queued for your next stonework Perception check.")
      ]);
    }
  },

  "stone-like endurance": {
    hint: "Queue the +2 for an exhaustion check (+1 HP/level and +2 Dying Checks are automatic).",
    async use(actor) {
      const summary = await reconcilePPGrant(actor, PP_GRANTS[2], { report: false });
      await addPendingModifier(actor, {
        value: 2, type: "untyped", label: "Stone-Like Endurance",
        scope: "One exhaustion check", oneShot: true
      });
      await postCard(actor, "Stone-Like Endurance", [
        line("A +2 bonus is queued for your next exhaustion check."),
        ...(summary ? [line(summary)] : []),
        line("<em>+1 HP per level and +2 to Dying Checks are applied automatically.</em>")
      ]);
    }
  },

  "swift pursuit": {
    hint: "Reaction when your hunted prey moves away — prompted automatically on the map; press Use for movement the system can't see.",
    async use(actor) {
      // Ranger, 6th (Chapter 3). The automatic prompt watches token
      // movement (combat/swift-pursuit.mjs); this button is the same
      // claim for movement outside the map's sight — narrative
      // repositioning, an off-scene chase — mirroring how Press the
      // Advantage's Use covers its unwatchable triggers.
      const { huntedPrey, swiftPursuitMode } = await import("./ranger.mjs");
      const prey = huntedPrey(actor);
      if (!prey) {
        ui.notifications.warn("Swift Pursuit: no hunted prey designated — use Hunt Prey first.");
        return;
      }
      const mode = swiftPursuitMode(Number(actor.system?.identity?.level ?? 0));
      if (!mode) {
        ui.notifications.warn("Swift Pursuit arrives at 6th level.");
        return;
      }
      if (game.combat?.started && Number(actor.system?.resources?.reactions?.value ?? 0) <= 0) {
        ui.notifications.warn("Swift Pursuit: no reaction available this round.");
        return;
      }
      const { spendReaction } = await import("./combat/action-points-workflow.mjs");
      await spendReaction(actor, "Swift Pursuit");
      await postCard(actor, "Swift Pursuit", [
        line(`<strong>${esc(prey.name)}</strong> moved away — reaction spent.`),
        line(mode === "stride"
          ? "<strong>Stride</strong> up to half your Speed. The movement must bring you closer to your prey — move the token by hand."
          : "<strong>Step 5 feet</strong> — move the token by hand.")
      ]);
    }
  },

  "temporal grasp": {
    hint: "Configure the granted Haste as an arcane innate focus spell (self only).",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "haste");
      if (!spell) {
        ui.notifications.warn("Temporal Grasp: Haste is not on this character yet — use Apply All Grants first.");
        return;
      }
      const traits = String(spell.system.traits ?? "");
      const updates = { "system.innate": true, "system.targets": "Self only (Temporal Grasp)" };
      if (!/\bfocus\b/i.test(traits)) updates["system.traits"] = traits ? `${traits}, focus` : "focus";
      await spell.update(updates);
      await postCard(actor, "Temporal Grasp", [
        line("<strong>Haste</strong> configured as an arcane innate focus spell — <strong>self only</strong>.")
      ]);
    }
  },

  "terrain mastery": {
    hint: "Toggle 'in one of my favoured terrains': terrain-cost relief for you, and a +1 (+2 at 15th) aura to allies' Stealth, Perception and Survival within 30 ft.",
    async use(actor, item) {
      // Ranger, 9th (Chapter 3). Which terrain the party is standing in
      // is the GM's world, not the map's data — so this is a toggle, the
      // same judgement-stays-with-the-player shape as the prey tickbox.
      // While on, allies' check dialogs offer the aura bonus whenever
      // this token is within 30 feet.
      //
      // THE TERRAIN HALF USED TO BE A SENTENCE ON THIS CARD, and the
      // pages 51-60 audit caught it: "You ignore natural difficult
      // terrain... — apply to your own movement." A finished mechanism
      // was sitting one import away. `ignoresDifficultTerrain` scans
      // items AND effects for the flag below, and `wildStrideCost`
      // prices the move off it; the Wild Stride feat and the Silvarni
      // heritage both already carried it. This is the third carrier, and
      // it is the SAME MISS the pages 18-30 audit found for the Silvarni
      // — the mechanism shipped complete and the thing that needed it
      // carried prose instead.
      //
      // ON THE ITEM, NOT THE ACTOR, because that is the channel the
      // mechanism reads. The actor flag stays as well: an ALLY's check
      // dialog asks the Ranger ACTOR whether the aura is up, and making
      // it hunt for the ability item to answer would be a second lookup
      // for the same fact. Both are written here, in one place, so they
      // cannot drift.
      const { terrainMasteryBonus } = await import("./ranger.mjs");
      const on = Boolean(actor.getFlag(SYSTEM_ID, "terrainMasteryActive"));
      if (on) {
        await actor.unsetFlag(SYSTEM_ID, "terrainMasteryActive");
        await item?.unsetFlag?.(SYSTEM_ID, "ignoresDifficultTerrain");
        await postCard(actor, "Terrain Mastery", [
          line("You are no longer in a favoured terrain — the aura is off, and difficult ground costs you full again.")
        ]);
        return;
      }
      await actor.setFlag(SYSTEM_ID, "terrainMasteryActive", true);
      await item?.setFlag?.(SYSTEM_ID, "ignoresDifficultTerrain", true);
      const bonus = terrainMasteryBonus(Number(actor.system?.identity?.level ?? 0));
      await postCard(actor, "Terrain Mastery", [
        line("<strong>You are in one of your favoured terrains.</strong>"),
        line("You ignore natural difficult terrain and treat natural formidable terrain as difficult terrain — <strong>applied to your movement automatically</strong> while this is on."),
        line(`Allies within 30 feet who can see or hear you gain a <strong>+${bonus}</strong> circumstance bonus to Survival, Stealth and Perception checks in this terrain — offered on their check dialogs while this is on.`),
        line("<em>Press Use again when you leave the terrain.</em>")
      ]);
    }
  },

  "tusks": {
    hint: "Grow your tusks: a 1d6 piercing unarmed attack (brawling, finesse).",
    async use(actor, item) {
      const existing = actor.getFlag(SYSTEM_ID, "tusksWeapon");
      if (existing && actor.items.get(existing)) {
        ui.notifications.info("Tusks are already among your attacks.");
        return;
      }
      const [tusks] = await actor.createEmbeddedDocuments("Item", [{
        name: "Tusks",
        type: "weapon",
        img: "icons/creatures/abilities/mouth-teeth-sharp.webp",
        system: {
          damage: "1d6",
          damageType: "piercing",
          traits: "finesse, unarmed, brawling",
          attackMode: "melee",
          group: "brawling",
          natural: true,
          equipped: true,
          // A granted natural attack. Every character is proficient with
          // unarmed attacks, and the proficiency engine reads the
          // category — a created weapon without one would be the only
          // natural attack in the game that carries a -4.
          category: "Unarmed",
          proficiency: "simple",
          description: "Rending tusks (Tusks racial feat)."
        }
      }]);
      await actor.setFlag(SYSTEM_ID, "tusksWeapon", tusks.id);
      await postCard(actor, "Tusks", [
        line("<strong>Tusks</strong> added to your attacks — 1d6 piercing, brawling group, finesse, unarmed.")
      ]);
    }
  },

  "unusual magic": {
    hint: "Choose your bonus PP 2 ethereal spell.",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Unusual Magic",
        filter: (s) => Number(s.system?.ppCost ?? -1) === 2 &&
          /ethereal/i.test(String(s.system?.tradition ?? "")),
        flagKey: "unusualMagicSpell",
        grantNote: "A bonus repertoire spell — needs no memorisation and doesn't count against known spells.",
        sourceItem: item
      });
    }
  },

  "unusual weaponry": {
    hint: "Record your chosen weapon and its downgraded proficiency category.",
    async use(actor, item) {
      const weapon = await enterText("Unusual Weaponry", "Weapon chosen", "e.g. Spiked Chain");
      if (!weapon) return;
      const treatment = await chooseFromList("Unusual Weaponry", "Treatment", [
        ["Exotic as Martial", "Exotic weapon treated as Martial"],
        ["Martial as Simple", "Martial weapon treated as Simple"]
      ]);
      if (!treatment) return;
      await replaceFeatEffect(actor, item, {
        name: `Unusual Weaponry: ${weapon} (${treatment})`,
        img: item.img,
        description: `${weapon} — ${treatment === "Exotic as Martial" ? "an Exotic weapon treated as Martial" : "a Martial weapon treated as Simple"} for your proficiency. Set the proficiency on the weapon item accordingly.`
      });
      await postCard(actor, "Unusual Weaponry", [
        line(`<strong>${weapon}</strong> recorded: ${treatment === "Exotic as Martial" ? "Exotic → treated as Martial" : "Martial → treated as Simple"}.`)
      ]);
    }
  },

  /**
   * DRINK BLOOD (3.627.0) — the Creature Codex's vampire ability, and Pillars
   * of Faith's Unliving Vampire's. The requirement read off the target, the
   * grabbed case's Athletics check against its Fortitude DC, Soul Drain 10
   * (more with Blood Renewal) and the drinker healed by what landed. See
   * drink-blood.mjs.
   */
  "drink blood": {
    hint: "1 AP: feed on a grabbed, immobilised, paralysed, unconscious or willing target in reach — Soul Drain 10, healed the same.",
    async use(actor, item) {
      const { useDrinkBlood } = await import("./drink-blood-workflow.mjs");
      return useDrinkBlood(actor, item);
    }
  },
  "unyielding tenacity": {
    hint: "Reaction when you would gain Dying (1/day; hourly with Incredible Tenacity): stay at 1 HP, Injured 1.",
    async use(actor, item) {
      const hourly = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "incredible tenacity"
      );
      const uses = Number(item.system.usesValue ?? 0);
      if (!hourly && uses <= 0) {
        ui.notifications.warn("Unyielding Tenacity: no uses remain today (resets at Daily Preparation).");
        return;
      }
      if (game.combat?.started) {
        const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
        if (reactions <= 0) {
          ui.notifications.warn("Unyielding Tenacity: no reaction available this round.");
          return;
        }
        if (!(await fighterReactionGate(actor, "Unyielding Tenacity"))) return;
        await actor.update({ "system.resources.reactions.value": reactions - 1 });
      }
      if (!hourly) await item.update({ "system.usesValue": uses - 1 });

      // Refuse death's door: 1 HP, no Dying, Injured +1.
      await actor.update({ "system.resources.hp.value": 1 });
      if (actor.hasCondition?.("dying")) await actor.toggleStatusEffect("dying", { active: false });
      if (actor.hasCondition?.("unconscious")) await actor.toggleStatusEffect("unconscious", { active: false });
      const injured = Number(actor.getConditionValue?.("injured") ?? 0);
      await actor.toggleStatusEffect("injured", { active: true, value: injured + 1 });

      await postCard(actor, "Unyielding Tenacity", [
        line("<strong>You refuse to fall</strong> — Dying avoided, you remain at <strong>1 HP</strong> and gain <strong>Injured " + (injured + 1) + "</strong>."),
        line("<em>Reduce any recurring damage or bleed from the triggering attack by 2 (adjust the condition's value on the sheet).</em>"),
        line(hourly
          ? "Recharges every <strong>hour</strong> (Incredible Tenacity — track the hour at the table)."
          : `${uses - 1} use${uses - 1 === 1 ? "" : "s"} remaining today.`)
      ]);
    }
  },

  "verdant gnome": {
    hint: "Choose your verdant cantrip (cast with your own Spellcraft bonus).",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Verdant Gnome",
        filter: (s) => isCantripSpell(s) &&
          /verdant/i.test(String(s.system?.tradition ?? "")),
        flagKey: "verdantGnomeSpell",
        grantNote: "Cast it using your own Spellcraft bonus.",
        sourceItem: item
      });
    }
  },

  "verdant healing": {
    hint: "After a 10-minute rest: regain HP equal to your level.",
    async use(actor) {
      const hp = actor.system.resources?.hp ?? {};
      const level = Math.max(1, Number(actor.system.identity?.level ?? 1));
      const before = Number(hp.value ?? 0);
      const after = Math.min(Number(hp.max ?? 0), before + level);
      if (after === before) {
        ui.notifications.info("Verdant Healing: already at full HP.");
        return;
      }
      await actor.update({ "system.resources.hp.value": after });
      await postCard(actor, "Verdant Healing", [
        line(`After 10 minutes of rest: <strong>+${after - before} HP</strong> (HP ${before} → ${after}).`)
      ]);
    }
  },

  "voice of the beast": {
    hint: "Configure Speak With Animals as an innate ability (uses scale at 9th and every 4 levels).",
    async use(actor) {
      const spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "speak with animals");
      if (!spell) {
        ui.notifications.warn("Voice of the Beast: Speak With Animals is not on this character yet — use Apply All Grants first.");
        return;
      }
      const level = Number(actor.system.identity?.level ?? 1);
      const uses = 1 + Math.max(0, Math.floor((level - 5) / 4));
      await spell.update({
        "system.innate": true,
        "system.usesPerDay": String(uses),
        "system.usesValue": Math.min(uses, Number(spell.system.usesValue ?? uses) || uses)
      });
      await postCard(actor, "Voice of the Beast", [
        line(`<strong>Speak With Animals</strong> configured as an innate ability — <strong>${uses}/day</strong> at level ${level}, caster level = your level.`),
        line("<em>Re-use this button after levelling to refresh the uses-per-day.</em>")
      ]);
    }
  },

  /*
   * THE FOUR FORM FEATS (Chapter 5, Druid) — Humanoid, Plant, Elemental
   * and Wyrm Shape. Each prints one sentence: "You may use your Wild
   * Shape ability to take the form of an X as if using the Shape of the
   * X spell."
   *
   * ONE BUTTON EACH, ONE POOL BETWEEN THEM. Graham's ruling, 21 August
   * 2026: they spend the Druid's existing allowance rather than adding
   * one of their own. The mechanism is `usesPoolItem` (uses-workflow.mjs)
   * — these four spells own no daily counter and read Shape Of The
   * Animal's. See module/magic/wildshape-feats.mjs for why that is a
   * pointer and not a sum.
   *
   * Built from the table rather than written out four times, because
   * four copies of one paragraph is four places for the pool rule to
   * drift apart.
   */
  /*
   * THE TEN ACTION-ECONOMY FEATS (Chapter 5, batch C5). Each is a way to
   * spend your actions, so each is a button — unlike the reaction feats,
   * which are offered by a card when something happens to you.
   *
   * Built from the table rather than written out ten times, for the
   * reason the previous batch proved the hard way: eleven copies of "pay
   * the AP, roll the Strikes, advance the penalty" is eleven places for
   * the penalty rule to drift from what the table declares. The table
   * says what each costs and how its Strikes treat the multiple attack
   * penalty; `runActionFeat` is the only thing that acts on it.
   *
   * Knife Flurry is absent deliberately — it is triggered by your own
   * knife landing, not pressed, and arrives as a card. See
   * module/combat/action-feat-detection.mjs.
   */
  ...Object.fromEntries(
    Object.entries(ACTION_FEATS)
      .filter(([, entry]) => !entry.triggered)
      .map(([feat, entry]) => [feat, {
        hint: `${entry.apCost} AP: ${entry.summary}`,
        async use(actor, item) {
          const { runActionFeat } = await import("./combat/action-feats-workflow.mjs");
          await runActionFeat(actor, item);
        }
      }])
  ),

  ...Object.fromEntries(
    Object.entries(WILD_SHAPE_FORM_FEATS).map(([feat, spellName]) => [feat, {
      hint: `Configure ${spellName} as an innate form — it spends your Wild Shape uses, not a new allowance of its own.`,
      async use(actor, item) {
        await configureFormFeatSpell(actor, item, spellName);
      }
    }])
  ),

  "wild shape": {
    hint: "Configure Shape Of The Animal as an innate ability — uses scale at 5th and every two levels; creates the spell on first press if it isn't on the sheet yet.",
    async use(actor, item) {
      const { wildShapeDailyUses } = await import("./druid.mjs");
      let spell = actor.items.find((i) => i.type === "spell" && normalise(i.name) === "shape of the animal");
      if (!spell) {
        // Primal Shape and Voice of the Beast both just WARN here and
        // send the player to re-add the granting FEAT through a picker
        // (addFromPicker calls applyAllGrants on the freshly-created
        // item, which is where a feat's own grantedSpells actually
        // fires). Wild Shape is a class ABILITY, not a feat — abilities
        // have no picker slot of their own to re-add through at all,
        // and classAbilities grants never cascade into their own further
        // grants (grants-workflow.mjs's applyGrant loop doesn't
        // recurse) — so a player who lost this spell, or a class
        // granted before this feature existed, would have no button
        // anywhere that fixes it. Creating it directly here is the
        // deviation that keeps this ability self-sufficient the way the
        // feat-based precedents aren't quite.
        const pack = contentPack("spells");
        const index = pack ? await pack.getIndex() : null;
        const entry = index ? Array.from(index.values()).find((s) => normalise(s.name) === "shape of the animal") : null;
        if (!pack || !entry) {
          ui.notifications.warn("Wild Shape: Shape Of The Animal is not in the spells compendium.");
          return;
        }
        const source = await pack.getDocument(entry._id);
        const data = packItemData(source);
        data.system.innate = true;
        const traits = String(data.system.traits ?? "");
        if (!/\bfocus\b/i.test(traits)) data.system.traits = traits ? `${traits}, focus` : "focus";
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
          sourceId: item.id, sourceName: item.name, requested: data.name
        });
        [spell] = await actor.createEmbeddedDocuments("Item", [data]);
      }
      const level = Number(actor.system.identity?.level ?? 1);
      // WILDFORM (Creature Codex, Chapter 3): "Rather than the above
      // effect, a druid gains an additional daily use of Wildshape each
      // day per power level (I-IV) of the rune."
      //
      // Added HERE, where the daily count is written, rather than
      // anywhere else — this button is the one place that decides how
      // many uses Wild Shape has, and a second place that also decided
      // it would be a second answer. `hasWildshape` is true by standing
      // here at all: this is the Wild Shape ability's own Use button.
      const { wildformWildshapeBonus } = await import("./codex-runes.mjs");
      const runeUses = wildformWildshapeBonus(
        Array.from(actor.items ?? []), { hasWildshape: true });
      // EXTRA WILDSHAPE JOINS THE SAME SUM (3.351.0), for the same
      // reason the rune does: the count lives on the SPELL, which the
      // generic `itemUsesMax` path cannot reach without compounding.
      const uses = wildShapeDailyUses({
        level,
        featNames: Array.from(actor.items ?? [])
          .filter((i) => i.type === "feat").map((i) => i.name),
        runeUses
      });
      await spell.update({
        "system.innate": true,
        "system.usesPerDay": String(uses),
        "system.usesValue": Math.min(uses, Number(spell.system.usesValue ?? uses) || uses)
      });
      // THE SIZE CLAUSE LIVES ON THE SPELL, NOT HERE (3.332.0).
      //
      // 3.329.0 implemented "you may reduce your size by one step" as a
      // confirm dialog on this button plus an ActiveEffect overriding
      // `system.identity.size`. That worked, and it was the wrong place.
      //
      // Shape Of The Animal carries its own warping options, and two of
      // them ARE the two clauses this ability's text describes:
      //
      //   +1 PP  increase the duration to 10 minutes
      //   +4 PP  increase or decrease the size of the form by one step
      //   +6 PP  ...by two steps
      //
      // which is exactly what "(which increases accordingly with the
      // default warping options)" means — the step count scales with what
      // you pay. Innate casts now choose their warps free up to the
      // character's level (Graham's ruling, cast-workflow.mjs), so a
      // 4th-level Druid can afford one step and a 6th-level Druid two,
      // out of the spell, with no second mechanism.
      //
      // Graham's ruling, 18 Aug 2026: remove the bespoke dialog and use
      // the spell's warp. NOTE THE TRADE, honestly: that warp is a
      // qualitative option (`mods: {}`), so the size is now PRINTED on
      // the cast card for the table to apply rather than written to an
      // ActiveEffect. The audit records it that way rather than claiming
      // more.
      //
      // Any effect left over from a 3.329.0 cast is cleaned up here, once
      // — a stored override nobody can now find a button to remove is
      // worse than either design.
      const stale = Array.from(actor.effects ?? [])
        .filter((e) => e.getFlag?.(SYSTEM_ID, "wildShapeSize"));
      if (stale.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map((e) => e.id));
      }
      const sizeLine = "<em>Size, duration and the rest are <strong>warping options on the spell</strong> — "
        + `cast it and choose them in the Warp dialog, free up to ${level} PP (your level). `
        + "One size step costs 4 PP there, two costs 6, and the 10-minute duration costs 1.</em>";

      await postCard(actor, "Wild Shape", [
        line(`<strong>Shape Of The Animal</strong> configured as an innate ability — <strong>${uses}/day</strong> at level ${level}, caster level = your level.`),
        runeUses
          ? line(`<em>${runeUses} of those come from a Wildform rune — for a character with Wild Shape the rune grants uses <strong>instead of</strong> its own animal form, not as well.</em>`)
          : "",
        line(sizeLine),
        line("<em>Wild Shape's own upgrade to the printed duration: the form lasts <strong>10 minutes</strong>, or <strong>1 hour</strong> if you take the spell's 10-minute warping option (1 PP of your free innate budget).</em>"),
        line("<em>Re-use this button after levelling to refresh the uses-per-day.</em>")
      ]);
    }
  },

  "wings of the wyrm": {
    hint: "2 AP, 1/day: leathery wings for 10 minutes — fly Speed equal to your Speed.",
    async use(actor, item) {
      const uses = Number(item.system.usesValue ?? 0);
      if (uses <= 0) {
        ui.notifications.warn("Wings of the Wyrm: no uses remain today (resets at Daily Preparation).");
        return;
      }
      const inCombat = Boolean(game.combat?.started);
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (inCombat && ap < 2) {
        ui.notifications.warn("Wings of the Wyrm: 2 AP required.");
        return;
      }
      if (inCombat) await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 2 });
      await item.update({ "system.usesValue": uses - 1 });

      // speedValue, not Number(): a pooled speed reads NaN, and this one
      // would have named the granted fly speed "Wings of the Wyrm (fly NaN)".
      const speed = speedValue(actor.system.combat?.movement?.land) || 30;
      await replaceFeatEffect(actor, item, {
        name: `Wings of the Wyrm (fly ${speed})`,
        img: item.img,
        description: "Leathery draconic wings for 10 minutes — fly Speed equal to your Speed.",
        changes: [{
          // `.base` since 3.412.0 — the speeds are bonus pools now, and a
          // granted movement mode is a base rather than a typed bonus.
          key: "system.combat.movement.fly.base",
          type: CHANGE_TYPE.ADD,
          value: String(speed),
          priority: 20
        }],
        duration: { seconds: 600, startTime: Number(game.time?.worldTime ?? 0) },
        flags: {
          [SYSTEM_ID]: {
            spellEffect: true,
            spellEffectEnd: Number(game.time?.worldTime ?? 0) + 600
          }
        }
      });
      await postCard(actor, "Wings of the Wyrm", [
        line(`<strong>Wings unfurl</strong>${inCombat ? " (2 AP spent)" : ""} — fly Speed <strong>${speed}</strong> for 10 minutes (expires with world time).`),
        line(`${uses - 1} use${uses - 1 === 1 ? "" : "s"} remaining today.`)
      ]);
    }
  },

  "worldly": {
    hint: "Queue the +2 racial bonus for Diplomacy with non-humans or a foreign-customs recall check.",
    async use(actor, item) {
      const which = await chooseFromList("Worldly", "Which check is coming up?", [
        ["Diplomacy (non-human)", "Diplomacy with an intelligent non-human"],
        ["Recall customs", "Recall knowledge of another culture's customs"]
      ]);
      if (!which) return;
      await addPendingModifier(actor, {
        value: 2, type: "race", label: "Worldly",
        scope: which === "Diplomacy (non-human)"
          ? "One Diplomacy check with an intelligent non-human"
          : "One check to recall another culture's customs",
        oneShot: true
      });
      await postCard(actor, "Worldly", [
        line("A +2 racial bonus is queued for the chosen check.")
      ]);
    }
  },

  /* ---- Racial ABILITIES (Chapter 2) ---------------------------------- */

  "arcane knowledge": {
    hint: "Choose an arcane or ethereal cantrip (PP 0) as an innate focus spell.",
    setup: true,
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Arcane Knowledge",
        filter: (s) => isCantripSpell(s) &&
          /arcane|ethereal/i.test(String(s.system?.tradition ?? "")),
        flagKey: "arcaneKnowledge",
        firstLevelChoice: true,
        innate: true,
        addTrait: "focus",
        grantNote: "It appears in your innate spells table.",
        sourceItem: item
      });
    }
  },




  // OFFERED AUTOMATICALLY SINCE 3.320.0. The cast workflow now asks the
  // target before rolling their save (see magic/save-reactions.mjs), which
  // is the only place the advantage could ever have been applied — this
  // roll opens no configuration dialog.
  //
  // The Use button is kept as the MANUAL path, for a save rolled outside a
  // cast: a trap, a hazard, a GM rolling by hand. It no longer claims the
  // advantage can be ticked somewhere, because it cannot; it tells the
  // truth about what it just spent.
  "gnome resistance": {
    hint: "Offered automatically on a spell's save. Use this only for a save rolled outside a cast.",
    async use(actor) {
      const reactions = Number(actor.system.resources?.reactions?.value ?? 0);
      if (reactions <= 0) {
        ui.notifications.warn("Gnome Resistance: no reaction available this round.");
        return;
      }
      if (!(await fighterReactionGate(actor, "Gnome Resistance"))) return;
      await actor.update({ "system.resources.reactions.value": reactions - 1 });
      await postCard(actor, "Gnome Resistance", [
        line("Reaction spent — this save is made with <strong>Advantage</strong>. Choose <em>Advantage</em> in the roll dialog, or roll two dice and take the better."),
        line("<em>When a spell forces the save, you are asked automatically before it is rolled and need not press this. Does not apply to area-effect spells.</em>")
      ]);
    }
  },



  "versatile": {
    hint: "Choose your two 1st-level ability scores for the +1 racial modifiers.",
    setup: true,
    async use(actor, item) {
      // "Choose your two 1ST-LEVEL ability scores." Graham's R2 ruling of
      // 15 Sep 2026 puts this on the same footing as the race, heritage
      // and background lock: a player may not re-allocate after 1st
      // level, and the GM may. See feats.mjs's firstLevelChoiceRefusal
      // for why a choice never made is never locked — refusing that case
      // would leave a Human with no ability modifiers at all, which is
      // the defect D8 was about.
      const alreadyChosen = Array.from(actor.effects ?? [])
        .some((e) => e.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) === item.id);
      const refusal = firstLevelChoiceRefusal({
        level: actor.system?.identity?.level,
        isGM: Boolean(game.user?.isGM),
        alreadyChosen,
        label: "Versatile"
      });
      if (refusal) {
        ui.notifications.warn(refusal);
        return;
      }

      const options = [
        ["strength", "Strength"], ["dexterity", "Dexterity"], ["constitution", "Constitution"],
        ["intelligence", "Intelligence"], ["wisdom", "Wisdom"], ["charisma", "Charisma"]
      ];
      const first = await chooseFromList("Versatile", "First ability score (+1 racial)", options);
      if (!first) return;
      const second = await chooseFromList("Versatile", "Second ability score (+1 racial)",
        options.filter(([k]) => k !== first));
      if (!second) return;
      const label = (key) => options.find(([k]) => k === key)[1];
      await replaceFeatEffect(actor, item, {
        name: `Versatile: ${label(first)} & ${label(second)} +1`,
        img: item.img,
        changes: [first, second].map((key) => ({
          key: `system.attributes.${key}.racial`,
          type: CHANGE_TYPE.ADD,
          value: "1",
          priority: 20
        }))
      });
      await postCard(actor, "Versatile", [
        line(`+1 racial modifier to <strong>${label(first)}</strong> and <strong>${label(second)}</strong> — visible in each attribute's racial slot.`)
      ]);
    }
  },

  "shadow stance": {
    hint: "Enter Shadow Stance (1 AP): Concealed until the start of your next turn.",
    async use(actor, item) {
      // THE PRINTED TRAITS ARE OPEN AND STANCE, and until 3.552.4 this
      // button consulted neither. The block reads "SHADOW STANCE / OPEN
      // STANCE / Action 1 AP": that second line is the TRAITS line, and
      // the pages 18-30 audit misread it as a second ability that was
      // missing. Graham corrected it on 15 Sep 2026 — and the correction
      // found a real hole, because `system.traits` on the ability was
      // empty, so both rules the system already models reached nothing:
      //
      //   OPEN   — must be your first action of the turn (traits.mjs)
      //   STANCE — wait a round before entering another stance
      //
      // Gated BEFORE the AP is spent, and recorded after, which is the
      // order every other trait-bearing action in the system uses.
      const { traitGate, recordTraitUsage } = await import("./traits-workflow.mjs");
      if (!traitGate(actor, item.system, item.name)) return;

      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Shadow Stance: 1 AP required.");
        return;
      }
      if (game.combat?.started) {
        await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      }
      // "UNTIL THE START OF YOUR NEXT TURN" IS A CLOCK, and until 3.552.0
      // this applied Concealed with no clock at all: it stayed until
      // somebody noticed and unticked it, which is a permanent -2 to be
      // hit for the price of one AP. Stamped on the round counter the
      // same way a spell or critical condition is, so the start-of-turn
      // sweep (`expireTimedConditions`) takes it away on its own.
      //
      // OUT OF COMBAT THERE IS NO ROUND to count to, so the condition is
      // applied untimed and the card says so rather than inventing a
      // six-second duration for a stance entered in a corridor.
      const inCombat = Boolean(game.combat?.started);
      const expiresRound = inCombat ? Number(game.combat?.round ?? 0) + 1 : null;
      await applyConditionTags(actor, [{ key: "concealed", label: "Concealed" }], { expiresRound });
      await recordTraitUsage(actor, item.system);
      await replaceFeatEffect(actor, item, {
        name: "Shadow Stance",
        img: item.img,
        description: "Concealed until the start of your next turn. At the start of each turn in the stance: a successful Sneak (Stealth) check moving you at least 10 ft reactivates Concealed."
      });
      await postCard(actor, "Shadow Stance", [
        line(`Stance entered${inCombat ? " (1 AP spent)" : ""} — <strong>Concealed</strong>${
          inCombat ? " until the start of your next turn" : " (no combat is running, so it is not on a clock)"}.`),
        line("<em>Each turn in the stance: succeed at a Sneak (Stealth) check moving 10+ ft to reactivate Concealed; end the stance by removing its effect.</em>")
      ]);
    }
  },


  /* ---------------- General feats: A batch (Chapter 5) ---------------- */

  "adoptive race": {
    hint: "Record your adopted race — racial heritage and racial feat pickers then draw from it instead of your own race.",
    async use(actor, item) {
      const CORE_RACES = ["Ascendan", "Dwarf", "Elf", "Gnome", "Halfling", "Human", "Kornargon", "Orc"];
      const own = actor.items.find((i) => i.type === "race")?.name ?? "";
      const options = CORE_RACES
        .filter((r) => r.toLowerCase() !== own.toLowerCase())
        .map((r) => [r, r]);
      const choice = await chooseFromList("Adoptive Race", "Adopted race (GM approval)", options);
      if (!choice) return;
      await actor.setFlag(SYSTEM_ID, "adoptiveRace", choice);
      await replaceFeatEffect(actor, item, {
        name: `Adoptive Race: ${choice}`,
        img: item.img,
        description: `Raised among ${choice}s — racial heritage and racial feats are selected from the ${choice} lists instead of ${own || "your birth race"}'s. Feats requiring a physiological feature are barred; the GM may allow such feats from the birth race instead.`
      });
      await postCard(actor, "Adoptive Race", [
        line(`Adopted race recorded: <strong>${choice}</strong> — the racial feat picker now offers ${choice} feats${own ? ` instead of ${own} ones` : ""}.`),
        line("<em>Feats requiring a physiological feature (such as Orc Tusks) remain barred — the GM may allow those from your birth race.</em>")
      ]);
    }
  },

  "agile tumbler": {
    hint: "After a critical Tumble result: queue the +2 circumstance bonus for your next physical attack or skill check this turn.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "circumstance", label: "Agile Tumbler (Tumble critical)",
        scope: "One physical attack or skill check before the end of your turn", oneShot: true
      });
      await postCard(actor, "Agile Tumbler", [
        line("A +2 circumstance bonus is queued — tick it in the dialog of your next physical attack or skill check, made before the end of your turn.")
      ]);
    }
  },

  "alchemical crafting": {
    hint: "Record the free level-1 Alchemical formula gained with this feat.",
    async use(actor, item) {
      const formula = await enterText("Alchemical Crafting",
        "Level-1 Alchemical item formula", "e.g. Lesser Healing Elixir");
      if (!formula) return;
      await replaceFeatEffect(actor, item, {
        name: `Alchemical Crafting: ${formula} formula`,
        img: item.img,
        description: `Knows the formula for ${formula} (level-1 Alchemical item) and may Create (Crafting or Nature) Alchemical items whose formulas they hold. Formulas gained later from other sources are tracked separately.`
      });
      const filed = await addFormulaToBook(actor, formula);
      await postCard(actor, "Alchemical Crafting", [
        line(`Formula recorded: <strong>${formula}</strong> — you may Create it with Crafting or Nature.`),
        filed
          ? line(`Written into <strong>${filed.book.name}</strong> — now holding ${filed.count} of ${FORMULA_BOOK_CAPACITY} formulae.`)
          : line(`<em>Not written to a formula book — see the warning. The feat still grants it; add a book and press Use again.</em>`)
      ]);
    }
  },

  "animal insight": {
    hint: "Queue the +2 class bonus for Command an Animal, or the +1 class bonus for Spellcraft on an animal-affecting spell.",
    async use(actor) {
      const which = await chooseFromList("Animal Insight", "Queue which bonus?", [
        ["command", "+2 class — Command an Animal (Handle Animal)"],
        ["spellcraft", "+1 class — Spellcraft, casting a spell that directly affects animals"]
      ]);
      if (!which) return;
      const command = which === "command";
      await addPendingModifier(actor, {
        value: command ? 2 : 1, type: "class",
        label: command ? "Animal Insight (Command an Animal)" : "Animal Insight (animal spell)",
        scope: command
          ? "One Command an Animal (Handle Animal) check"
          : "One Spellcraft check casting a spell that directly affects animals",
        oneShot: true
      });
      await postCard(actor, "Animal Insight", [
        line(command
          ? "A +2 class bonus is queued — tick it in the next Command an Animal (Handle Animal) dialog."
          : "A +1 class bonus is queued — tick it in the Spellcraft dialog when casting a spell that directly affects animals.")
      ]);
    }
  },

  "armour focus": {
    hint: "Pick the armour this feat focuses on — its DR rises by 1, recorded on the armour item.",
    async use(actor, item) {
      const armours = actor.items.filter((i) => i.type === "armour");
      if (!armours.length) {
        ui.notifications.warn("Armour Focus: this character carries no armour items — add the armour first, then Use this feat.");
        return;
      }
      const id = await chooseFromList("Armour Focus", "Armour type to focus in (DR +1)",
        armours.map((a) => [a.id, `${a.name} (DR ${a.system.dr ?? 0}${a.getFlag(SYSTEM_ID, "armourFocus") ? ", already focused" : ""})`]));
      if (!id) return;
      const armour = actor.items.get(id);
      if (!armour) return;
      if (armour.getFlag(SYSTEM_ID, "armourFocus")) {
        ui.notifications.warn(`Armour Focus: ${armour.name} already carries an Armour Focus DR increase — repeat picks of this feat must select a different armour type.`);
        return;
      }
      await armour.update({
        "system.dr": Number(armour.system.dr ?? 0) + 1,
        [`flags.${SYSTEM_ID}.armourFocus`]: true
      });
      // This feat's answer lives on the ARMOUR, so the feat has no
      // effect of its own for the sheet to read. It records the pick on
      // itself purely so the row can show it — the feat is repeatable
      // and a second copy must be tellable from the first.
      await item?.setFlag?.(SYSTEM_ID, "choiceLabel", armour.name);
      await postCard(actor, "Armour Focus", [
        line(`<strong>${armour.name}</strong> DR increased to <strong>${armour.system.dr}</strong> (recorded on the item).`),
        line("<em>If you replace this armour with another of the focused type, Use the feat again on the new item.</em>")
      ]);
    }
  },

  /* ------- Class feats: casters & divine wave (Chapter 5) ------- */

  "charismatic caster": {
    hint: "Switch your spellcasting ability score to Charisma (level 1 choice — one way).",
    async use(actor) {
      const current = String(actor.system.magic?.castingAbility ?? "");
      if (current === "charisma") {
        ui.notifications.info("Charismatic Caster: your casting ability is already Charisma.");
        return;
      }
      // Recorded as a CHOICE, not written into the field. Casting ability
      // is derived now — from your tradition, and from your class if it
      // names one — so writing the field would have been undone on the
      // next prepare with a card still claiming it had worked.
      await actor.setFlag(SYSTEM_ID, "castingAbilityChoice", "charisma");
      await postCard(actor, "Charismatic Caster", [
        line(`Casting ability switched${current ? ` from <strong>${current}</strong>` : ""} to <strong>Charisma</strong> — PP, Spellcraft and all casting mechanics now use Cha.`)
      ]);
    }
  },

  "signature spell": {
    hint: "Record your signature spell — warping it costs 1 PP less (automatic in the cast dialog).",
    async use(actor, item) {
      const spells = actor.items.filter((i) => i.type === "spell" && Number(i.system?.ppCost ?? 0) > 0);
      if (!spells.length) {
        ui.notifications.warn("Signature Spell: this character has no levelled spells.");
        return;
      }
      const previous = spells.find((s) => s.getFlag(SYSTEM_ID, "signatureSpell"));
      const id = await chooseFromList("Signature Spell",
        previous ? `Signature spell (currently ${previous.name})` : "Your signature spell",
        spells.map((s) => [s.id, s.name]));
      if (!id) return;
      if (previous && previous.id !== id) await previous.unsetFlag(SYSTEM_ID, "signatureSpell");
      await actor.items.get(id).setFlag(SYSTEM_ID, "signatureSpell", true);
      await postCard(actor, "Signature Spell", [
        line(`Signature spell recorded: <strong>${actor.items.get(id).name}</strong> — whenever you warp it, the total PP cost drops by 1 (automatic).`)
      ]);
    }
  },

  "monster lore": {
    hint: "Queue your Wisdom as a status bonus for a Recall Knowledge check about a creature.",
    async use(actor) {
      const wis = Number(actor.system.attributes?.wisdom?.total ?? 0);
      if (wis <= 0) {
        ui.notifications.info("Monster Lore: your Wisdom modifier grants no bonus.");
        return;
      }
      await addPendingModifier(actor, {
        value: wis, type: "status", label: "Monster Lore (Wis)",
        scope: "One Recall Knowledge check about a creature's abilities", oneShot: true
      });
      await postCard(actor, "Monster Lore", [
        line(`A +${wis} status bonus is queued — tick it on your next Recall Knowledge check about a creature.`)
      ]);
    }
  },

  "healing channel": {
    hint: "Spend PP for +1 class per PP on a Medicine healing check (max half caster level, cap 5).",
    async use(actor, item) {
      const cl = Math.max(0, Number(actor.system.magic?.casterLevelValue ?? 0));
      const maxSpend = Math.min(5, Math.ceil(cl / 2));
      const pp = Number(actor.system.resources?.pp?.value ?? 0);
      if (!maxSpend || !pp) {
        ui.notifications.warn("Healing Channel: no PP available (or no caster level).");
        return;
      }
      const spendText = await enterText("Healing Channel",
        `PP to spend (1-${Math.min(maxSpend, pp)}; +1 class per PP on the Medicine check)`, "1");
      const spend = Math.min(Math.min(maxSpend, pp), Math.max(1, Number.parseInt(spendText ?? "", 10) || 0));
      if (!spend) return;
      await actor.update({ "system.resources.pp.value": pp - spend });
      await addPendingModifier(actor, {
        value: spend, type: "class", label: `Healing Channel (${spend} PP)`,
        scope: "One Medicine check made to heal a target's injuries", oneShot: true
      });
      await postCard(actor, "Healing Channel", [
        line(`<strong>${spend} PP</strong> spent — a +${spend} class bonus is queued for your next healing Medicine check.`),
        line("<em>Casting Cure: the healing dice become d10s (+10 for ranged) — automatic in the cast.</em>")
      ]);
    }
  },

  "lorist": {
    hint: "Add an arcane spell to your repertoire (1 at 5th; another at 10th and every 5 levels).",
    async use(actor, item) {
      const level = Number(actor.system.identity?.level ?? 0);
      const allowed = 1 + Math.max(0, Math.floor((level - 5) / 5));
      const taken = actor.items.filter((i) => i.type === "spell" && i.getFlag(SYSTEM_ID, "loristSpell")).length;
      if (taken >= allowed) {
        ui.notifications.info(`Lorist: all ${allowed} arcane pick${allowed > 1 ? "s" : ""} at level ${level} are already taken (next at level ${(Math.floor((level - 5) / 5) + 1) * 5 + 5}).`);
        return;
      }
      await grantChosenSpell(actor, {
        title: "Lorist",
        filter: (s) => /arcane/i.test(String(s.system?.tradition ?? "")),
        flagKey: `loristSpell-${taken + 1}`,
        grantNote: "An arcane spell added to your repertoire — cast as an ETHEREAL spell.",
        sourceItem: item
      });
      const granted = actor.items.find((i) => i.type === "spell" && i.getFlag(SYSTEM_ID, `loristSpell-${taken + 1}`));
      if (granted) await granted.setFlag(SYSTEM_ID, "loristSpell", true);
    }
  },

  "smite evil": {
    hint: "1 AP: your Blade Ally Strikes deal +1d6 good damage until your next turn.",
    async use(actor, item) {
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Smite Evil: 1 AP required.");
        return;
      }
      if (game.combat?.started) await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      await replaceFeatEffect(actor, item, {
        name: "Smite Evil (+1d6 good)",
        img: item.img,
        description: "Strikes with your Blade Ally weapon deal +1d6 base GOOD damage until the beginning of your next turn — add the die to those damage rolls, then remove this effect."
      });
      await postCard(actor, "Smite Evil", [
        line(`Blade Ally empowered${game.combat?.started ? " (1 AP)" : ""} — <strong>+1d6 good damage</strong> on its Strikes until your next turn.`)
      ]);
    }
  },

  "smite good": {
    hint: "1 AP: your Blade Ally Strikes deal +1d6 evil damage until your next turn.",
    async use(actor, item) {
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Smite Good: 1 AP required.");
        return;
      }
      if (game.combat?.started) await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      await replaceFeatEffect(actor, item, {
        name: "Smite Good (+1d6 evil)",
        img: item.img,
        description: "Strikes with your Blade Ally weapon deal +1d6 base EVIL damage until the beginning of your next turn — add the die to those damage rolls, then remove this effect."
      });
      await postCard(actor, "Smite Good", [
        line(`Blade Ally empowered${game.combat?.started ? " (1 AP)" : ""} — <strong>+1d6 evil damage</strong> on its Strikes until your next turn.`)
      ]);
    }
  },

  "deific disruption": {
    hint: "Reaction: sacrifice PP — the triggering attack takes a circumstance penalty equal to the PP spent.",
    async use(actor) {
      const pp = Number(actor.system.resources?.pp?.value ?? 0);
      if (!pp) {
        ui.notifications.warn("Deific Disruption: no PP remaining.");
        return;
      }
      const spendText = await enterText("Deific Disruption", `PP to sacrifice (1-${pp})`, "2");
      const spend = Math.min(pp, Math.max(1, Number.parseInt(spendText ?? "", 10) || 0));
      if (!spend) return;
      await actor.update({ "system.resources.pp.value": pp - spend });
      await postCard(actor, "Deific Disruption", [
        line(`Reaction — <strong>${spend} PP</strong> sacrificed: the triggering attack against your ally takes a <strong>-${spend} circumstance penalty</strong> (reduce its total).`)
      ]);
    }
  },

  "spell substitution": {
    hint: "10 minutes' contemplation: Meditation vs the spell's casting DC to swap a prepared spell.",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      // MORE THAN ONE SPELL AT A TIME (3.630.0) — Pillars of Faith's Living
      // Concordance: "you may replace two memorised Divinity spells instead
      // of one … Make a single Meditation check using the higher Casting DC
      // of the two replacement spells." Declared on an applied effect as
      // `flags.trg-prime.spellSubstitution = { count: 2, label }`.
      const wider = Array.from(actor.appliedEffects ?? actor.effects ?? [])
        .map((e) => e?.flags?.["trg-prime"]?.spellSubstitution)
        .find((f) => f && Number(f.count) > 1) ?? null;
      const count = wider ? Math.trunc(Number(wider.count)) : 1;
      const dcText = await enterText("Spell Substitution",
        count > 1
          ? `Casting DC — the higher of the ${count} replacement spells (${wider.label ?? "two at once"})`
          : "Casting DC of the spell being swapped", "e.g. 16");
      const dc = Number.parseInt(dcText ?? "", 10);
      if (!Number.isFinite(dc)) return;
      const skill = actor.system.skills?.meditation;
      const check = await TRGCheck.roll({
        actor,
        label: "Spell Substitution",
        subtitle: "10 minutes' quiet contemplation — Meditation vs the casting DC",
        type: "skill",
        dc,
        modifiers: skill?.checkModifiers ?? [
          { label: "Meditation", value: Number(skill?.total ?? 0), type: "untyped" }
        ]
      });
      const degree = check.outcome?.degree?.key ?? "failure";
      const outcomes = {
        heroic: "<strong>Critical:</strong> spell swapped — no further restriction.",
        critical: "<strong>Critical:</strong> spell swapped — no further restriction.",
        success: "<strong>Success:</strong> spell swapped — Spell Substitution unavailable for an hour.",
        partial: "<strong>Partial:</strong> spell swapped — Spell Substitution unavailable until after your next daily preparation.",
        failure: "<strong>Failure:</strong> no swap — Spell Substitution unavailable until after your next daily preparation.",
        fumble: "<strong>Failure:</strong> no swap — Spell Substitution unavailable until after your next daily preparation.",
        blunder: "<strong>Failure:</strong> no swap — Spell Substitution unavailable until after your next daily preparation."
      };
      await postCard(actor, "Spell Substitution", [
        line(outcomes[degree]),
        line(count > 1
          ? `<em>${wider.label ?? "Living Concordance"}: one check for up to ${count} Divinity spells — on a success swap them all on your sheet; on a failure neither is replaced.</em>`
          : "<em>Swap the prepared spell on your sheet if successful. An interrupted swap leaves the original prepared.</em>")
      ]);
    }
  },

  /* ------------- Class feats: stances wave (Chapter 5) ------------- */

  "disarm stance": {
    hint: "Enter the stance: +1 circumstance on Disarm checks; +2 Attack DC against being disarmed; first size -2 ignored.",
    async use(actor, item) {
      await enterFeatStance(actor, item, {
        name: "Disarm Stance",
        apCost: 1,
        description: "One-handed weapon, other hand(s) free: +1 circumstance on Disarm checks (automatic in the dialog). +2 circumstance to your Attack DC against attempts to Disarm YOU, and the first -2 size penalty for disarming larger creatures is ignored (apply both at the table).",
        stanceActionMods: {
          bonuses: [{ actions: ["disarmAttack"], value: 1, type: "circumstance", label: "Disarm Stance" }]
        },
        extraLines: [line("<em>+1 on Disarm is automatic; the +2 Attack DC against being disarmed and the ignored first size -2 are table calls.</em>")]
      });
    }
  },

  "disrupting stance": {
    hint: "Enter the stance: Concentrate actions in your reach provoke AoOs; interrupted spells recover at -4.",
    async use(actor, item) {
      await enterFeatStance(actor, item, {
        name: "Disrupting Stance",
        apCost: 1,
        description: "Creatures within your reach that use a Concentrate action provoke an Attack of Opportunity from you. If the interrupted action is a spell, its Spell Concentration recovery checks take a -4 circumstance penalty.",
        extraLines: [line("<em>Take the provoked AoOs as reactions; apply the -4 to the caster's Spell Concentration recovery.</em>")]
      });
    }
  },

  "double stance": {
    hint: "Enter the stance: Double Slice costs 2 AP; the non-agile second-weapon penalty is only -1.",
    async use(actor, item) {
      await enterFeatStance(actor, item, {
        name: "Double Stance",
        apCost: 1,
        description: "Double Slice costs 2 AP (automatic), and the second weapon's penalty is only -1 when it lacks the agile trait (apply -1 instead of -2). Twin Riposte's reaction triggers while this stance is up.",
        stanceActionMods: {
          apReductions: { doubleSlice: 1 }
        },
        extraLines: [line("<em>Double Slice: 2 AP automatic; second non-agile weapon takes -1 instead of -2 (manual). Twin Riposte is live in this stance.</em>")]
      });
    }
  },

  "duelling parry": {
    hint: "Enter the stance (one-handed weapon, other hand free): +2 extra dodge when Fighting Defensively.",
    async use(actor, item) {
      const oneHanded = actor.items.some((i) =>
        i.type === "weapon" && i.system?.equipped &&
        (i.system?.attackMode ?? "melee") !== "missile"
      );
      if (!oneHanded) {
        ui.notifications.warn("Duelling Parry: you must be wielding a melee weapon in one hand (other hand free).");
        return;
      }
      const dance = actor.items.some(
        (i) => i.type === "feat" && normalise(i.name) === "duelling dance"
      );
      await enterFeatStance(actor, item, {
        name: "Duelling Parry",
        apCost: 1,
        description: `While you keep a one-handed weapon and a free hand: Fight Defensively grants +2 EXTRA dodge (added to the stance automatically)${dance ? ", and costs only 1 AP (Duelling Dance)" : ""}. Duelling Riposte's reaction triggers while this stance is up.`,
        ...(dance ? { stanceActionMods: { apReductions: { fightDefensively: 1 } } } : {}),
        extraLines: [
          line("<em>Enter Fight Defensively as normal — the +2 extra dodge joins it automatically while this stance is up.</em>"),
          ...(dance ? [line("<em>Duelling Dance: Fight Defensively costs 1 AP in this stance — automatic.</em>")] : []),
          line("<em>Duelling Riposte: when a creature in reach fumbles a Strike, react with an Attack or Disarm (no MAP).</em>")
        ]
      });
    }
  },

  "lunging stance": {
    hint: "Enter the stance: AoOs reach 5 ft further, and Lunge's penalties are negated.",
    async use(actor, item) {
      await enterFeatStance(actor, item, {
        name: "Lunging Stance",
        apCost: 1,
        description: "Attacks of Opportunity may target foes 5 ft beyond your reach (the AoO Strike gains 5 ft). Lunge's -1 penalty is negated — don't queue it while this stance is up.",
        extraLines: [line("<em>While in this stance, use Lunge freely with no penalty (skip its queued -1).</em>")]
      });
    }
  },

  "mobile shot": {
    hint: "Enter the stance (missile weapon): your ranged Strikes don't provoke; AoO with a loaded ranged weapon within 5 ft.",
    async use(actor, item) {
      const missile = actor.items.some((i) =>
        i.type === "weapon" && i.system?.equipped && i.system?.attackMode === "missile"
      );
      if (!missile) {
        ui.notifications.warn("Mobile Shot: you must be wielding a missile weapon.");
        return;
      }
      await enterFeatStance(actor, item, {
        name: "Mobile Shot",
        apCost: 1,
        description: "Your ranged Strikes no longer provoke Attacks of Opportunity or other ranged-attack-triggered reactions. You may make an Attack of Opportunity with a LOADED ranged weapon against targets within 5 ft.",
        extraLines: [line("<em>Ranged Strikes don't provoke; AoO with a loaded ranged weapon within 5 ft.</em>")]
      });
    }
  },

  /* ------------- Class feats: metamagic wave (Chapter 5) ------------- */

  "elemental spell": {
    hint: "Record this copy's energy type (acid/cold/electricity/fire) — it then appears in the cast dialog's metamagic options.",
    async use(actor, item) {
      const TYPES = ["acid", "cold", "electricity", "fire"];
      const taken = new Set(Array.from(actor.effects ?? [])
        .map((e) => e.getFlag?.(SYSTEM_ID, "elementalSpellType"))
        .filter(Boolean));
      const own = actor.getFlag(SYSTEM_ID, `elementalSpell-${item.id}`);
      const options = TYPES.filter((t) => !taken.has(t) || t === own)
        .map((t) => [t, t.charAt(0).toUpperCase() + t.slice(1)]);
      const choice = await chooseFromList("Elemental Spell", "Energy type for this copy of the feat", options);
      if (!choice) return;
      await replaceFeatEffect(actor, item, {
        name: `Elemental Spell: ${choice}`,
        img: item.img,
        description: `The cast dialog offers "+2 PP — damage becomes ${choice}" on damaging spells (full replacement automatic; the half/half split is a card note).`,
        // The TYPE is stored lower-case because the cast dialog matches on
        // it; the row shows the option's own label, or it reads
        // "Elemental Spell (fire)".
        flags: {
          [SYSTEM_ID]: {
            elementalSpellType: choice,
            choiceLabel: options.find(([value]) => value === choice)?.[1] ?? choice
          }
        }
      });
      await actor.setFlag(SYSTEM_ID, `elementalSpell-${item.id}`, choice);
      await postCard(actor, "Elemental Spell", [
        line(`Energy type recorded: <strong>${choice}</strong> — available in the cast dialog's metamagic section.`)
      ]);
    }
  },

  "effortless spell": {
    hint: "Free action, 1 PP: gain the effects of Sustain a Spell for one of your active spells.",
    async use(actor) {
      const pp = Number(actor.system.resources?.pp?.value ?? 0);
      if (pp < 1) {
        ui.notifications.warn("Effortless Spell: 1 PP required.");
        return;
      }
      const { getActiveSpells } = await import("./magic/active-spells.mjs");
      const active = getActiveSpells(actor).filter((s) => s.sustained || s.sustainType);
      if (!active.length) {
        ui.notifications.warn("Effortless Spell: no active sustained spells to extend.");
        return;
      }
      const id = await chooseFromList("Effortless Spell", "Active spell to sustain (1 PP, free action)",
        active.map((s) => [s.id, s.name]));
      if (!id) return;
      await actor.update({ "system.resources.pp.value": pp - 1 });
      const { sustainActiveSpell } = await import("./magic/active-spells.mjs");
      const entry = await sustainActiveSpell(actor, id, game.combat?.round ?? 0);
      await postCard(actor, "Effortless Spell", [
        line(`<strong>1 PP</strong> spent — ${entry?.name ?? "the spell"} is sustained as a <strong>free action</strong> (no AP, no Sustain action).`)
      ]);
    }
  },

  /* ------------- Class feats: martial wave G-Z (Chapter 5) ------------- */

  "improved critical": {
    hint: "Record the Weapon Focus group whose attacks gain the Keen trait.",
    async use(actor, item) {
      const focused = Array.from(actor.appliedEffects ?? actor.effects ?? [])
        .map((e) => e.getFlag?.(SYSTEM_ID, "weaponFocusGroup"))
        .filter(Boolean);
      if (!focused.length) {
        ui.notifications.warn("Improved Critical: record a Weapon Focus group first (the feat's prerequisite).");
        return;
      }
      const choice = await chooseFromList("Improved Critical", "Focused weapon group to gain Keen", focused.map((g) => [g, g]));
      if (!choice) return;
      await replaceFeatEffect(actor, item, {
        name: `Improved Critical: ${choice} (Keen)`,
        img: item.img,
        description: `Attacks with ${choice}-group weapons gain the Keen trait — applied automatically in the attack workflow (no effect on already-Keen weapons).`,
        flags: { [SYSTEM_ID]: { improvedCriticalGroup: choice } }
      });
      await postCard(actor, "Improved Critical", [
        line(`Weapon group recorded: <strong>${choice}</strong> — its attacks are Keen automatically.`)
      ]);
    }
  },

  "weapon specialisation": {
    hint: "Record the Weapon Focus group that deals +2 extra base damage.",
    async use(actor, item) {
      const focused = Array.from(actor.appliedEffects ?? actor.effects ?? [])
        .map((e) => e.getFlag?.(SYSTEM_ID, "weaponFocusGroup"))
        .filter(Boolean);
      if (!focused.length) {
        ui.notifications.warn("Weapon Specialisation: record a Weapon Focus group first (the feat's prerequisite chain).");
        return;
      }
      const choice = await chooseFromList("Weapon Specialisation", "Focused weapon group for +2 base damage", focused.map((g) => [g, g]));
      if (!choice) return;
      await replaceFeatEffect(actor, item, {
        name: `Weapon Specialisation: ${choice} +2`,
        img: item.img,
        description: `Weapons of the ${choice} group deal +2 extra base damage — applied automatically in the damage roll.`,
        flags: { [SYSTEM_ID]: { weaponSpecialisationGroup: choice } }
      });
      await postCard(actor, "Weapon Specialisation", [
        line(`Weapon group recorded: <strong>${choice}</strong> — +2 base damage applied automatically.`)
      ]);
    }
  },

  "power attack": {
    hint: "Queue a Power Attack: your next melee Strike deals +2d8 (scaling) and counts as two attacks for MAP.",
    async use(actor) {
      const bab = Number(actor.system.combat?.bab?.total ?? 0);
      const dice = bab >= 18 ? 4 : bab >= 12 ? 3 : 2;
      await actor.setFlag(SYSTEM_ID, "powerAttackQueued", true);
      await postCard(actor, "Power Attack", [
        line(`<strong>Power Attack queued</strong> (2 AP) — make your melee Strike now: it deals +${dice}d8 damage and counts as TWO attacks for the multiple attack penalty${Array.from(actor.items ?? []).some((i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "furious focus") ? " (Furious Focus: only one)" : ""}.`),
        line("<em>Spend 2 AP for the Strike (1 AP Strike + 1 AP for the feat). The queue clears on your next Strike.</em>")
      ]);
    }
  },

  "guarded move": {
    hint: "1 AP: Stride with your guard up — +4 circumstance to DB against attacks provoked by the movement.",
    async use(actor, item) {
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Guarded Move: 1 AP required.");
        return;
      }
      if (game.combat?.started) {
        await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      }
      await replaceFeatEffect(actor, item, {
        name: "Guarded Move (+4 vs provoked attacks)",
        img: item.img,
        description: "+4 circumstance bonus to DB against attacks PROVOKED BY THIS MOVEMENT, until the beginning of your next turn. Apply it to those attacks only; remove the effect at your next turn."
      });
      await postCard(actor, "Guarded Move", [
        line(`Stride with your guard up${game.combat?.started ? " (1 AP spent)" : ""} — <strong>+4 circumstance to DB</strong> against attacks provoked by this movement, until your next turn.`)
      ]);
    }
  },

  "lunge": {
    hint: "Queue a Lunge: your next melee attack action gains Reach at a -1 circumstance penalty.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: -1, type: "circumstance", label: "Lunge (reach)",
        scope: "One melee attack action made with Reach via Lunge", oneShot: true
      });
      await postCard(actor, "Lunge", [
        line("A <strong>-1 circumstance penalty</strong> is queued — tick it on the melee attack you make with Lunge's extra reach (the attack action gains the Reach trait for that Strike).")
      ]);
    }
  },

  "nimble dodge": {
    hint: "Reaction when attacked (no ACP, not encumbered): +2 dodge to DB against that one attack.",
    async use(actor, item) {
      // ASKED OF THE CONDITION (3.573.0), not of the 20 lb step count.
      // The feat prints "You are not encumbered or subject to an ACP", and
      // Encumbered is any excess at all — a character nineteen pounds over
      // has no step yet but is plainly encumbered, and used to qualify.
      if (Number(actor.system.combat?.acp?.total ?? 0) > 0
        || Boolean(actor._trgEncumbered)
        || Boolean(actor.hasCondition?.("encumbered"))) {
        ui.notifications.warn("Nimble Dodge: not usable while suffering an ACP or encumbrance penalty.");
        return;
      }
      await replaceFeatEffect(actor, item, {
        name: "Nimble Dodge (+2 vs one attack)",
        img: item.img,
        changes: [{
          key: "system.combat.defence.dodge",
          type: CHANGE_TYPE.CUSTOM,
          value: "2",
          priority: 20
        }],
        description: "Reaction: +2 dodge to DB against the triggering attack ONLY — delete this effect once that attack resolves."
      });
      await postCard(actor, "Nimble Dodge", [
        line("Reaction spent — <strong>+2 dodge to DB</strong> against the incoming attack. Remove the effect once the attack resolves.")
      ]);
    }
  },

  "shield block": {
    hint: "Reaction when damaged: your shield's DR reduces the damage; you lose its DB bonus until your next turn.",
    /**
     * WHICH NUMBER A BLOCK USES. `system.combat.shield.blockDR`, the
     * derived value — NOT the shield item's own `system.dr`, which is
     * what this read until 3.233.5.
     *
     * The raw field is the printed figure on the item and nothing else.
     * Everything that changes what a shield actually stops lives outside
     * it: quality and material bonuses (`computeShieldModifiers`), a
     * broken shield's halving, a destroyed one contributing nothing, and
     * — per Graham's ruling at 3.233.5 — the Chapter 6 BDB multiplier,
     * because a shield's DR is a BASE value exactly as worn armour's is.
     * Reading the raw field meant a masterwork shield blocked for less
     * than the sheet said it had, a broken one blocked for full, and no
     * shield ever scaled with its bearer.
     *
     * All four are already resolved onto `blockDR` by
     * `prepareArmourProtection`, so this reads the answer rather than
     * recomputing a worse version of it (lesson 13).
     *
     * SUMMED ACROSS EQUIPPED SHIELDS, which is what the derivation does,
     * where this used to name only the first one found. Two equipped
     * shields is a strange loadout, but if the sheet adds them then a
     * block has to as well, or the two disagree.
     */
    async use(actor) {
      const shields = actor.items.filter((i) => i.type === "shield" && i.system?.equipped);
      if (!shields.length) {
        ui.notifications.warn("Shield Block: no equipped shield.");
        return;
      }
      // ANIMATED (Chapter 11): "you can't use the shield for reactions
      // such as Shield Block" while it is floating. Refused rather than
      // silently blocking, because the player chose to animate it and
      // needs to know that is why.
      const { animatedShields } = await import("./rune-actions.mjs");
      const floating = animatedShields(shields);
      if (floating.length === shields.length) {
        ui.notifications.warn(
          `Shield Block: ${floating.map((s) => s.name).join(", ")} ` +
          "is animated and cannot be used for reactions. End the rune first.");
        return;
      }
      const dr = Number(actor.system?.combat?.shield?.blockDR ?? 0);
      if (!dr) {
        ui.notifications.warn(
          `Shield Block: ${shields.map((s) => s.name).join(", ")} ` +
          "currently provides no DR — a destroyed shield stops nothing, and a shield with no DR " +
          "of its own cannot block."
        );
        return;
      }
      const base = Number(actor.system?.combat?.shield?.dr ?? 0);
      const bdb = Number(actor.system?.combat?.bdb?.total ?? 0);
      const { loseShieldBonusUntilNextTurn } = await import("./combat/shield-bash.mjs");
      await loseShieldBonusUntilNextTurn(actor);
      await postCard(actor, "Shield Block", [
        // Agreeing in number, because summing two equipped shields is a
        // real (if odd) case and "Tower Shield, Heavy Steel Shield
        // grants" reads as a bug in a card that is otherwise precise.
        line(`Reaction — <strong>${shields.map((s) => s.name).join(", ")}</strong> ${shields.length === 1 ? "grants" : "grant"} <strong>DR ${dr}</strong> against the incoming attack: reduce the damage by ${dr}; you and the ${shields.length === 1 ? "shield take" : "shields take"} any remainder (apply the ${shields.length === 1 ? "shield's" : "shields'"} share to its HP).`),
        ...(dr !== base
          ? [line(`<em>Base DR ${base}, multiplied by your BDB of ${bdb} (Chapter 6).</em>`)]
          : []),
        line("<em>Your shield bonus to DB is lost until the beginning of your next turn (already applied to the sheet).</em>")
      ]);
    }
  },

  "stealthy strike": {
    hint: "Check your precision dice and queue the reminder for a qualifying Strike (flanked / flat-footed target).",
    async use(actor) {
      const ranks = Number(actor.system.skills?.stealth?.ranks ?? 0);
      const dice = 1 + Math.floor(ranks / 6);
      await postCard(actor, "Stealthy Strike", [
        line(`Against a <strong>flanked or flat-footed</strong> target, your agile/finesse melee or ranged attacks deal <strong>+${dice}d6 precision damage</strong> (Stealth ${ranks} ranks).`),
        line("<em>Thrown melee weapons must also be agile or finesse. Rolled automatically on a qualifying Strike (3.651.0), as Sneak Attack is.</em>")
      ]);
    }
  },

  /* ------------- Class feats: martial wave A-F (Chapter 5) ------------- */

  "assess target": {
    hint: "After your Assess Target Strike hits: roll the free Recall Knowledge with your Warfare bonus (-2, or no penalty on a critical).",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      const warfare = Object.entries(actor.system.specialistSkills ?? {})
        .find(([, s]) => /warfare/i.test(String(s.label ?? "")));
      if (!warfare) {
        ui.notifications.warn("Assess Target: this character has no Warfare specialist skill (the feat's prerequisite).");
        return;
      }
      const result = await chooseFromList("Assess Target", "How did the Strike land?", [
        ["hit", "Hit — Recall Knowledge at -2 circumstance"],
        ["critical", "Critical — no penalty"]
      ]);
      if (!result) return;
      const modifiers = [...(warfare[1].checkModifiers ?? [
        { label: warfare[1].label ?? "Warfare", value: Number(warfare[1].total ?? 0), type: "untyped" }
      ])];
      if (result === "hit") {
        modifiers.push({ label: "Assess Target", value: -2, type: "circumstance" });
      }
      // The card IS the outcome here — the GM adjudicates what is
      // learnt, so nothing reads the result.
      await TRGCheck.roll({
        actor,
        label: "Assess Target — Recall Knowledge (Warfare)",
        subtitle: "Free Action after the Strike — GM adjudicates what is learnt",
        type: "skill",
        dc: null,
        modifiers
      });
      await postCard(actor, "Assess Target", [
        line("The GM reveals the target's strengths and weaknesses per the result."),
        line("<em>The target is immune to Assess Target until after your next daily preparations.</em>")
      ]);
    }
  },

  "beyond reach": {
    hint: "Reaction when a foe closes to melee: Acrobatics vs their Attack DC to step 5 ft away.",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      const target = game.user?.targets?.first?.();
      const dc = target
        ? Number(target.actor?.system?.combat?.attack?.dc ?? 0) || null
        : Number.parseInt(await enterText("Beyond Reach", "Opponent's Attack DC", "e.g. 18") ?? "", 10);
      const skill = actor.system.skills?.acrobatics;
      const check = await TRGCheck.roll({
        actor,
        label: "Beyond Reach",
        subtitle: `Reaction — Acrobatics vs Attack DC${target ? ` (${target.name})` : ""}`,
        type: "skill",
        dc: Number.isFinite(dc) ? dc : null,
        modifiers: skill?.checkModifiers ?? [
          { label: "Acrobatics", value: Number(skill?.total ?? 0), type: "untyped" }
        ]
      });
      const success = Boolean(check.outcome?.degree?.success);
      await postCard(actor, "Beyond Reach", [
        line(success
          ? "<strong>Success:</strong> step back 5 feet as a reaction, leaving their melee range — they may keep advancing if they have movement left."
          : "<strong>Failure:</strong> you hold your ground."),
        line("<em>No step if it would carry you into a different foe's melee range, or if you are cornered.</em>")
      ]);
    }
  },

  "critical focus": {
    hint: "Reaction after your melee/missile critical: modify the critical result by up to 5.",
    async use(actor) {
      const record = actor.getFlag(SYSTEM_ID, "lastCriticalInjury");
      if (!record) {
        ui.notifications.warn("Critical Focus: no critical injury has been rolled to modify.");
        return;
      }
      const { adjustableRows } = await import("./combat/critical-adjust.mjs");
      const rows = adjustableRows(record.damageType, record.result, 5);
      const choices = rows.filter((row) => !row.current);
      if (!choices.length) {
        ui.notifications.info("Critical Focus: an allowance of 5 reaches no other row on this table.");
        return;
      }
      const pick = await chooseFromList("Critical Focus",
        `Modify the critical result (rolled ${record.result}, up to ±5)`,
        choices.map((row) => [String(row.roll), `${row.roll}: ${String(row.text ?? "").slice(0, 80)}`]));
      if (!pick) return;
      const chosen = rows.find((row) => String(row.roll) === pick);
      await postCard(actor, "Critical Focus", [
        line(`Critical result modified from <strong>${record.result}</strong> to <strong>${pick}</strong> (reaction spent):`),
        line(String(chosen?.text ?? ""))
      ]);
    }
  },

  "favoured terrain": {
    hint: "Choose this copy's terrain; toggle the created effect ON while you are in it.",
    // The TERRAIN is permanent even though the effect is toggled in play.
    setup: true,
    // Miner grants this as "Favoured Terrain (Underground)".
    acceptsChoice: true,
    recordedChoice: (actor, item) => actor.getFlag(SYSTEM_ID, `favouredTerrain-${item.id}`) ?? null,
    async use(actor, item, { presetChoice = null } = {}) {
      const TERRAINS = ["Aquatic", "Arctic", "Desert", "Mountain", "Plains", "Sky", "Swamp", "Underground", "Woodland"];
      const taken = new Set(Array.from(actor.effects ?? [])
        .map((e) => e.getFlag?.(SYSTEM_ID, "favouredTerrainType"))
        .filter(Boolean));
      const own = actor.getFlag(SYSTEM_ID, `favouredTerrain-${item.id}`);
      const options = TERRAINS.filter((t) => !taken.has(t) || t === own).map((t) => [t, t]);
      if (presetChoice && !options.some(([t]) => t === presetChoice)) {
        return { reason: `${presetChoice} is already taken by another copy of Favoured Terrain` };
      }
      const choice = presetChoice
        ?? await chooseFromList("Favoured Terrain", "Terrain for this copy of the feat", options);
      if (!choice) return;
      await replaceFeatEffect(actor, item, {
        name: `Favoured Terrain: ${choice}`,
        img: item.img,
        disabled: true,
        description: `While in ${choice.toLowerCase()} terrain, ENABLE this effect: +2 class to Nature, Perception, Stealth and Survival; +10 class to Initiative; verdant casting DCs -1 (automatic in the cast dialog while enabled). Disable it on leaving the terrain.`,
        changes: [
          ...["nature", "perception", "stealth", "survival"].map((key) => ({
            key: `system.skills.${key}.class`,
            type: CHANGE_TYPE.ADD,
            value: "2",
            priority: 20
          })),
          {
            key: "system.combat.initiative.class",
            type: CHANGE_TYPE.ADD,
            value: "10",
            priority: 20
          }
        ],
        flags: { [SYSTEM_ID]: { favouredTerrainActive: true, favouredTerrainType: choice, choiceLabel: choice } }
      });
      await actor.setFlag(SYSTEM_ID, `favouredTerrain-${item.id}`, choice);
      await postCard(actor, "Favoured Terrain", [
        line(`Terrain recorded: <strong>${choice}</strong> — the effect is created DISABLED; enable it while you are in ${choice.toLowerCase()} terrain and disable it when you leave.`),
        line("<em>While enabled: +2 class to Nature/Perception/Stealth/Survival, +10 class Initiative, and verdant casting DCs -1 (automatic).</em>")
      ]);
    }
  },

  /* ---------------- Archetype feats (Chapter 5, 3.185.0) ---------------- */

  "adventurer": {
    hint: "Choose the skill this archetype makes a class skill (the ancient-history Recall bonus is a dialog call).",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "adventurer"));
    }
  },

  "alchemist": {
    hint: "Make Crafting a class skill (Alchemical Crafting is granted automatically when this feat is added).",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "alchemist"));
    }
  },

  "animist": {
    hint: "Choose your class skill, true up the BSB, and prepare today's two verdant cantrips.",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "animist"));
      await reconcilePPGrant(actor, ppGrantByName("animist"), { report: true });
      await runArchetypeCastingStep(actor, "animist");
    }
  },

  "arcanist": {
    hint: "Choose your class skill, true up the BSB, fill the four-cantrip spellbook and prepare two of them.",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "arcanist"));
      await reconcilePPGrant(actor, ppGrantByName("arcanist"), { report: true });
      // The card that used to stand here said "add them from the spells
      // compendium" — a ritual, and one nobody performed. The spellbook
      // is now filled by the picker and the two prepared from it.
      await runArchetypeCastingStep(actor, "arcanist");
    }
  },

  "artificer": {
    hint: "Make Crafting a class skill; the crafting-specialty cap rises automatically (pick it in the Skill Specialties manager).",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "artificer"));
      await postCard(actor, "Artificer", [
        line("<em>Your Crafting specialty cap includes this archetype — pick the (common) specialty in the Skill Specialties manager on the Skills tab.</em>")
      ]);
    }
  },

  "champion": {
    hint: "Choose the class skill, and gain the Crusader deity trait (all-armour proficiency is passive).",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "champion"));

      // "…and gain the Crusader deity trait (including the bonus feat
      // granted)." Until 3.303.0 that sentence was a note on a card.
      //
      // The trait IS the Crusader's Deific Aspect ability — the item
      // that carries the edicts, the deific skill, the specialist and
      // bonus spells, and the `alignmentFeats` flag naming the reaction
      // feat an aspect's alignment hands over. Granting the ability
      // grants all of it, and crusader.mjs's alignmentFeatNames finds
      // the names on it, so nothing here restates what the book prints.
      //
      // THE CRUSADER'S COPY, not the Cleric's. Both are named "Deific
      // Aspect"; only the Crusader's carries alignmentFeats, and it is
      // told apart by its own `sourceClass` field rather than by id.
      const held = Array.from(actor.items ?? []).find(
        (i) => i.type === "ability" && normalise(i.name) === "deific aspect" &&
          i.flags?.[SYSTEM_ID]?.alignmentFeats
      );
      if (held) {
        ui.notifications.info("Champion: you already have the Crusader deity trait.");
        return;
      }

      const pack = contentPack("abilities");
      const index = await pack.getIndex({ fields: ["system.sourceClass"] });
      const entry = Array.from(index.values()).find(
        (e) => normalise(e.name) === "deific aspect" &&
          normalise(e.system?.sourceClass) === "crusader"
      );
      if (!entry) {
        ui.notifications.warn("Champion: the Crusader's Deific Aspect is not in the abilities compendium.");
        return;
      }
      const data = packItemData(await pack.getDocument(entry._id));
      // Provenance, so the ability is free, and so deleting Champion
      // takes the deity trait down with it.
      foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
        sourceId: item.id, sourceName: item.name, requested: data.name
      });
      await actor.createEmbeddedDocuments("Item", [data]);

      // Imported here rather than at module scope, matching the other
      // crusader.mjs use in this file — the module reaches for Foundry
      // globals and the static import would run at load.
      const { alignmentFeatNames } = await import("./crusader.mjs");
      const names = alignmentFeatNames(actor);
      await postCard(actor, "Champion", [
        line("<strong>Crusader deity trait</strong> gained — Deific Aspect, with its edicts, deific skill, specialist and bonus spells."),
        names
          ? line(`<em>The bonus feat follows your aspect's alignment: ${names.good} (good) or ${names.evil} (evil). Press Apply Grants on your divine aspect to take it.</em>`)
          : line("<em>Add a divine aspect, then press Apply Grants on it to receive the bonus reaction feat.</em>")
      ]);
    }
  },

  "cloistered priest": {
    hint: "Choose your Cleric Specialist Spell; the +1 PP per caster level trues up automatically.",
    async use(actor, item) {
      await reconcilePPGrant(actor, ppGrantByName("cloistered priest"), { report: true });
      // A CLERIC SPECIALIST SPELL, as printed (3.623.0, Graham's R3). The
      // old filter asked for the divinity tradition and left specialist
      // spells excluded, so it offered every ordinary divinity spell and
      // no specialist one: every aspect spell is specialist with an
      // empty tradition. "Appropriate" is the Cleric half of R2 — your
      // aspect's spells and the Cleric specialist spells no aspect
      // lists — at the same PP ceiling the Specialist Spell feat uses.
      const { specialistMaxPP } = await import("./magic/casting.mjs");
      const { clericSpecialistAccess } = await import("./aspect-rules.mjs");
      const { specialistAccessFor } = await import("./aspect-workflow.mjs");
      const access = await specialistAccessFor(actor);
      const maxPP = specialistMaxPP(Number(actor.system?.identity?.level ?? 0));
      const owned = new Set(Array.from(actor.items ?? [])
        .filter((i) => i.type === "spell").map((i) => String(i.name).trim().toLowerCase()));
      await grantChosenSpell(actor, {
        title: "Cloistered Priest",
        allowSpecialist: true,
        filter: (s) => Boolean(s.system?.specialist)
          && clericSpecialistAccess({ ...access, spellName: s.name, specialistClass: s.system?.specialistClass })
          && Number(s.system?.ppCost ?? Infinity) <= maxPP
          && !owned.has(String(s.name).trim().toLowerCase()),
        flagKey: "cloisteredPriestSpell",
        indexFields: ["system.specialistClass"],
        grantNote: `Your Cleric Specialist Spell (PP ${maxPP} or less): your aspect's, or a Cleric specialist spell no aspect lists.`,
        sourceItem: item
      });
    }
  },

  "enigma": {
    hint: "True up the +2 PP per level; the instinctive-caster conversion is described on the card.",
    async use(actor) {
      const summary = await reconcilePPGrant(actor, ppGrantByName("enigma"), { report: true });
      if (!summary) {
        ui.notifications.info("Enigma: maximum PP already includes the full per-level grant.");
      }
      await postCard(actor, "Enigma", [
        line("You are an <strong>Instinctive caster</strong>: no memorisation, no 30-minute daily preparation — your repertoire is always available."),
        line("1st level: any two PP 2 spells + two cantrips from your tradition. Each level: two new spells. From 3rd level and every two levels: swap one repertoire spell."),
        line("<em>Add repertoire spells from the spells compendium as you gain them; Magical Discovery adds more.</em>")
      ]);
    }
  },

  "gleeman": {
    hint: "Choose your class skill, true up the BSB, and select the two ethereal cantrips you cast instinctively.",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "gleeman"));
      await reconcilePPGrant(actor, ppGrantByName("gleeman"), { report: true });
      await runArchetypeCastingStep(actor, "gleeman");
    }
  },

  "loremaster": {
    hint: "Create the two Lore specialist skills (the +2 to all Recall Knowledge is automatic).",
    async use(actor, item) {
      for (const slot of ["first", "second"]) {
        const flagKey = `loremaster-${slot}`;
        const existing = actor.getFlag(SYSTEM_ID, flagKey);
        if (existing && actor.system.specialistSkills?.[existing]) continue;
        const name = await enterText("Loremaster", `Name of your ${slot} Lore specialist skill`, "e.g. Ancient Empires Lore");
        if (!name) return;
        const skill = { ...blankSpecialistSkill("intelligence"), label: name };
        const key = uniqueKey(slugifyKey(name), actor.system.specialistSkills ?? {});
        await actor.update({ [`system.specialistSkills.${key}`]: skill });
        await actor.setFlag(SYSTEM_ID, flagKey, key);
      }
      await postCard(actor, "Loremaster", [
        line("Lore specialist skills created — they appear with your specialist skills."),
        line("<em>The +2 class bonus to ALL Recall Knowledge checks is applied automatically in the check dialog.</em>")
      ]);
    }
  },

  "priest": {
    hint: "Choose your class skill, true up the BSB, and prepare today's two divinity cantrips.",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "priest"));
      await reconcilePPGrant(actor, ppGrantByName("priest"), { report: true });
      await runArchetypeCastingStep(actor, "priest");
    }
  },

  "primal warrior": {
    hint: "Choose the bonus attack/save spell this archetype adds to your repertoire.",
    async use(actor, item) {
      await grantChosenSpell(actor, {
        title: "Primal Warrior",
        // "…the bonus ATTACK/SAVE spell this archetype adds", and attack
        // and save are the spell's CATEGORY — `system.category` — not a
        // trait. Measured against the pack on 15 September 2026, live in
        // Graham's world: the old `traits` test matched 0 of 586
        // non-specialist spells, and the whole chooser was riding on the
        // `Boolean(s.system?.defence)` clause beside it — which, being an
        // undeclared index field, was itself always `undefined`. So this
        // chooser offered NOTHING, in every world, until 3.552.7 made the
        // field base; and with defence as the only live test it then
        // offered 190 spells and missed all 30 attack spells, which carry
        // no defence at all (Scorching Ray, Shock Bolt, Acid Bolt…).
        //
        // Reading the category gives 217: the 30 attack spells and the
        // 187 save spells, which is what the ability prints. The eight
        // UTILITY spells that happen to carry a Will or Fortitude defence
        // — Scrying, Unremarkable Aura, Spirit Mark, Verdant Retribution,
        // Solitude, Rainbow Cloak, Temporal Stasis, Tame — are no longer
        // offered, because a utility spell is not an attack or save spell
        // however it is resisted. Reported to Graham with the change.
        filter: (s) => /^(attack|save)$/i.test(String(s.system?.category ?? "").trim()),
        // Declared because the filter reads it: an undeclared index field
        // is simply `undefined`, which is exactly how the clause this
        // replaced came to be dead. See verify-chooser-index-fields.
        indexFields: ["system.category"],
        flagKey: "primalWarriorSpell",
        grantNote: "A bonus repertoire spell — attack/save spells are open to you when selecting spells from now on.",
        sourceItem: item
      });
    }
  },

  "thief": {
    hint: "Choose your class skill; the rogue-feat pick is recorded until Rogue class feats exist.",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "thief"));
      const pick = await chooseFromList("Thief", "Rogue feat gained with this archetype", [
        ["Acrobatic Bluff", "Acrobatic Bluff"], ["Guarded Move", "Guarded Move"],
        ["Mobility", "Mobility"], ["Stealthy Strike", "Stealthy Strike"]
      ]);
      if (!pick) return;
      await replaceFeatEffect(actor, item, {
        name: `Thief: ${pick}`,
        img: item.img,
        description: `Gains the ${pick} feat — add it from the feats compendium once Rogue class feats arrive.`
      });
      await postCard(actor, "Thief", [
        line(`Rogue feat recorded: <strong>${pick}</strong> — it will resolve once Rogue class feats are in the compendium.`)
      ]);
    }
  },

  "vanguard": {
    hint: "Daily preparation: choose the weapon trait your two-handed weapons carry today.",
    async use(actor, item) {
      const trait = await chooseFromList("Vanguard", "Today's two-handed weapon trait", [
        ["Backswing", "Backswing"], ["Disarm", "Disarm"], ["Reach", "Reach"],
        ["Shove", "Shove"], ["Thrown (10')", "Thrown (10')"], ["Versatile", "Versatile"]
      ]);
      if (!trait) return;
      await replaceFeatEffect(actor, item, {
        name: `Vanguard: ${trait} today`,
        img: item.img,
        description: `Until the next daily preparation, two-handed weapons you use carry the ${trait} trait (apply its rules at the table). The +1 class attack bonus and the defensive-stance dodge bonus are automatic.`
      }, { dailyPrep: true });
      await postCard(actor, "Vanguard", [
        line(`Today's two-handed weapon trait: <strong>${trait}</strong> — resets at daily preparation.`)
      ]);
    }
  },

  "warden": {
    hint: "Choose the class skill this archetype grants (Favoured Terrain resolves once Ranger class feats exist).",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "warden"));
    }
  },

  "warrior": {
    hint: "Choose your class skill, then your proficiency package — weapons OR armour. The proficiency choice is permanent.",
    async use(actor, item) {
      await chooseClassSkill(actor, item, CLASS_SKILL_GRANTS.find((g) => g.name === "warrior"));

      // LOCKED ONCE CHOSEN (Graham's ruling, 13 Aug 2026). Unlike Martial
      // Training, which may be re-pressed to change the archetype, this
      // is a one-time election — "You MAY CHOOSE to become proficient in
      // either ... or ...". A GM who has to undo one deletes the effect,
      // which carries the choice and is named for it on the Effects tab.
      //
      // THE EFFECT IS THE RECORD; THE FLAG IS ONLY THE LOCK. Measured
      // live on 13 Aug 2026: deleting the effect took the proficiency
      // away and left the flag standing, so the ability refused to open
      // its chooser ever again — the undo advice in the message below
      // was false, and the character was left with neither package and
      // no way to pick one. The lock therefore holds only while the
      // grant it locks is actually present; a flag left behind by a
      // deleted effect is cleared rather than obeyed.
      const flagKey = `warriorProficiency-${item.id}`;
      const recorded = actor.getFlag(SYSTEM_ID, flagKey);
      const held = recorded ? PROFICIENCY_CHOICES[recorded] : null;
      const grantStillHeld = Boolean(held) && Array.from(actor.effects ?? []).some(
        (effect) => effect.getFlag?.(SYSTEM_ID, "proficiencyChoice") === held.grantKey
      );
      if (held && grantStillHeld) {
        ui.notifications.info(
          `Warrior: you chose ${held.label}. That choice is permanent — a GM can undo it by deleting the "${held.effectName}" effect.`
        );
        return;
      }
      if (recorded) await actor.unsetFlag(SYSTEM_ID, flagKey);

      const pick = await chooseFromList("Warrior", "Proficiency gained — this choice is permanent",
        Object.entries(PROFICIENCY_CHOICES).map(([key, entry]) => [key, entry.label]));
      if (!pick) return;
      const chosen = PROFICIENCY_CHOICES[pick];

      await replaceFeatEffect(actor, item, {
        name: chosen.effectName,
        img: item.img,
        description: chosen.description,
        // THE FLAG IS THE GRANT, not the description. This effect used to
        // carry prose telling the player to "set proficiency on weapon
        // items accordingly" — which is to say the archetype did nothing
        // and asked the player to do it by hand. proficiency-rules.mjs
        // reads this key and applies the package itself; see
        // PROFICIENCY_CHOICE_GRANTS there.
        flags: { [SYSTEM_ID]: { proficiencyChoice: chosen.grantKey } }
      });
      await actor.setFlag(SYSTEM_ID, flagKey, pick);
      await postCard(actor, "Warrior", [
        line(`Proficiency gained: <strong>${chosen.label}</strong>.`),
        line("<em>This choice is permanent.</em>")
      ]);
    }
  },

  "war priest": {
    hint: "True up the +2 HP per level (the +1 class BAB is always on; heavy armour + martial feat access are on the note).",
    async use(actor) {
      const summary = await reconcilePPGrant(actor, ppGrantByName("war priest"), { report: true });
      if (!summary) {
        ui.notifications.info("War Priest: Max HP already includes the full per-level grant.");
      }
    }
  },

  /* ---- Archetype-granted abilities ---- */

  "death mark": {
    hint: "3 AP: designate your mark — +2 circumstance to Attack/Perception/Feint against it; deadly on agile/finesse/unarmed/close-range attacks.",
    async use(actor, item) {
      const markedToken = game.user?.targets?.first?.() ?? null;
      const targetName = markedToken?.name ??
        await enterText("Death Mark", "Creature to mark (you must see and hear it)", "e.g. Varrok the Cruel");
      if (!targetName) return;
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 3) {
        ui.notifications.warn("Death Mark: 3 AP required.");
        return;
      }
      if (game.combat?.started) {
        await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 3 });
      }
      /*
       * THE MARK IS A UUID (3.586.3). Everything that can scope a rule to
       * one creature matches on one, so a typed name marks nobody any
       * rule can compare against. The name route is kept — a GM may be
       * marking something with no token — and says plainly that it is
       * the note-only half. See combat/death-mark.mjs.
       */
      const markedUuid = markedToken?.actor?.uuid ?? "";
      const { deathMarkConditionals, DEATH_MARK_FLAG } =
        await import("./combat/death-mark.mjs");
      const conditionals = deathMarkConditionals(markedUuid, targetName);
      await replaceFeatEffect(actor, item, {
        name: `Death Mark: ${targetName}`,
        img: item.img,
        description: `${targetName} is your mark, until it dies or you mark another.`,
        flags: {
          [SYSTEM_ID]: {
            ...(markedUuid ? { [DEATH_MARK_FLAG]: { uuid: markedUuid, name: targetName } } : {}),
            ...(conditionals.length ? { conditionals } : {})
          }
        }
      });
      await postCard(actor, "Death Mark", [
        line(`<strong>${targetName}</strong> is marked${game.combat?.started ? " (3 AP spent)" : ""}.`),
        markedUuid
          ? line("<strong>+2 circumstance</strong> to Attack, Perception and Feint against it — offered in those dialogs. Agile, finesse, unarmed and first-increment ranged attacks against it gain <strong>Deadly</strong> automatically; an already-Deadly weapon deals +1 instead.")
          : line("<em>Marked by name only — no token was targeted, so nothing can be scoped to it. Apply the +2 and the Deadly rider by hand, or re-mark with the creature targeted.</em>")
      ]);
    }
  },

  "agile display": {
    hint: "1 AP (Flourish): Step 5 ft and roll Acrobatics vs an adjacent foe's Reflex DC — success makes it Flat-Footed to your next melee Strike.",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      const target = game.user?.targets?.first?.();
      const dc = target
        ? 10 + Number(target.actor?.system?.combat?.saves?.reflex?.total ?? 0)
        : Number.parseInt(await enterText("Agile Display", "Adjacent creature's Reflex DC", "e.g. 16") ?? "", 10);
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Agile Display: 1 AP required.");
        return;
      }
      if (game.combat?.started) {
        await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      }
      const skill = actor.system.skills?.acrobatics;
      const check = await TRGCheck.roll({
        actor,
        label: "Agile Display",
        subtitle: `Step 5 ft — Acrobatics vs Reflex DC${target ? ` (${target.name})` : ""}`,
        type: "skill",
        dc: Number.isFinite(dc) ? dc : null,
        modifiers: skill?.checkModifiers ?? [
          { label: "Acrobatics", value: Number(skill?.total ?? 0), type: "untyped" }
        ]
      });
      const degree = check.outcome?.degree?.key ?? null;
      const lines = [];
      /*
       * IT APPLIES THE CONDITION NOW (3.586.3).
       *
       * Reported live on 24 September 2026 as "doing nothing", and it
       * was: this ladder described three outcomes and applied exactly
       * one of them — Prone, to the caster, on a blunder. A success
       * printed the words "is Flat-Footed" and touched the target not at
       * all.
       *
       * PLAIN FLAT-FOOTED, ON GRAHAM'S RULING of 24 September 2026. The
       * page says "against your next melee Strike" and the system has no
       * per-attacker Flat-Footed — every other source of it (Trip, Aim,
       * the basic-action ladders) applies the condition outright. So
       * this does what they do, with the tightest clock the sentence
       * allows: it is gone at the end of your turn, which is the window
       * the Strike has to happen in.
       */
      const ffTarget = target?.actor ?? null;
      const applyFlatFooted = async () => {
        if (!ffTarget) return false;
        await applyConditionTags(ffTarget, [{ key: "flatFooted", label: "Flat-Footed" }], {
          expiresRound: game.combat?.started ? Number(game.combat.round ?? 0) : null
        });
        return true;
      };
      if (["heroic", "critical"].includes(degree)) {
        const did = await applyFlatFooted();
        lines.push(line(`<strong>Critical:</strong> Tumble through their space as part of this action — and ${did ? `<strong>${target.name}</strong> is <strong>Flat-Footed</strong> until the end of your turn` : "they are <strong>Flat-Footed</strong> against your next melee Strike this turn"}.`));
      } else if (degree === "success") {
        const did = await applyFlatFooted();
        lines.push(line(`<strong>Success:</strong> ${did ? `<strong>${target.name}</strong> is <strong>Flat-Footed</strong> until the end of your turn` : "the creature is <strong>Flat-Footed</strong> against your next melee Strike, made before the end of your turn"}.`));
      } else if (degree === "blunder") {
        lines.push(line("<strong>Blunder:</strong> you fall <strong>Prone</strong> and your turn ends."));
        await actor.toggleStatusEffect?.("prone", { active: true });
      } else if (degree) {
        lines.push(line("<strong>Failure:</strong> no further effect."));
      } else {
        lines.push(line("No DC available — GM adjudicates (Critical: Tumble through + Flat-Footed; Success: Flat-Footed to your next melee Strike; Blunder: fall Prone, turn ends)."));
      }
      await postCard(actor, "Agile Display", lines);
    }
  },

  "sense weakness": {
    hint: "Observe a target and Recall Knowledge — success: Flat-Footed to your attacks until your next turn (Critical: 1 minute).",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      const time = await chooseFromList("Sense Weakness", "Time spent observing", [
        ["2", "2 AP (+2 to the check)"],
        ["1", "1 AP (+0)"]
      ]);
      if (!time) return;
      const skillKey = await chooseFromList("Sense Weakness", "Recall Knowledge with which skill?",
        ["arcana", "crafting", "culture", "nature", "occultism", "planes", "religion"]
          .map((k) => [k, SKILLS[k]?.label ?? k]));
      if (!skillKey) return;
      const target = game.user?.targets?.first?.();
      const { levelDC } = await import("./dice/resolution.mjs");
      const dc = target ? levelDC(Number(target.actor?.system?.identity?.level ?? 0)) : null;
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      const cost = Number(time);
      if (game.combat?.started && ap < cost) {
        ui.notifications.warn(`Sense Weakness: ${cost} AP required.`);
        return;
      }
      if (game.combat?.started) {
        await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - cost });
      }
      const skill = actor.system.skills?.[skillKey];
      const modifiers = [...(skill?.checkModifiers ?? [
        { label: skill?.label ?? skillKey, value: Number(skill?.total ?? 0), type: "untyped" }
      ])];
      if (time === "2") modifiers.push({ label: "Careful observation (2 AP)", value: 2, type: "circumstance" });
      const check = await TRGCheck.roll({
        actor,
        label: "Sense Weakness",
        subtitle: `Recall Knowledge${target ? ` vs ${target.name} (level DC)` : ""}`,
        type: "skill",
        dc,
        modifiers
      });
      const degree = check.outcome?.degree?.key ?? null;
      const lines = [];
      /*
       * AND SENSE WEAKNESS TOO (3.586.3), which Graham did not report
       * and has exactly the same fault as its two siblings: it rolled,
       * named a degree, and applied nothing. All three archetype
       * abilities were built in one release and share one shape.
       *
       * Same ruling, same clock reasoning as Agile Display: the plain
       * condition, for the window the page gives it — the start of your
       * next turn on a success, ten rounds on a critical.
       */
      const swTarget = target?.actor ?? null;
      const markFlatFooted = async (rounds) => {
        if (!swTarget) return false;
        await applyConditionTags(swTarget, [{ key: "flatFooted", label: "Flat-Footed" }], {
          expiresRound: game.combat?.started ? Number(game.combat.round ?? 0) + rounds : null
        });
        return true;
      };
      if (["heroic", "critical"].includes(degree)) {
        const did = await markFlatFooted(10);
        lines.push(line(`<strong>Critical:</strong> ${target?.name ?? "the target"} is <strong>Flat-Footed${did ? " for 1 minute" : " against your attacks for 1 minute"}</strong>.`));
      } else if (degree === "success") {
        const did = await markFlatFooted(1);
        lines.push(line(`<strong>Success:</strong> ${target?.name ?? "the target"} is <strong>Flat-Footed${did ? " until the start of your next turn" : " against your attacks until the start of your next turn"}</strong>.`));
      } else if (degree) {
        lines.push(line("<strong>Failure:</strong> no weakness found."));
      } else {
        lines.push(line("No target selected — GM adjudicates (Success: Flat-Footed to your attacks until your next turn; Critical: for 1 minute)."));
      }
      lines.push(line("<em>The target is immune to your Sense Weakness for 1 minute after this use.</em>"));
      await postCard(actor, "Sense Weakness", lines);
    }
  },

  /* ---------------- General feats: S-Z batch (Chapter 5) ---------------- */

  "skill focus": {
    hint: "Record the skill action this copy grants +2 class on (a different action per copy).",
    setup: true,
    async use(actor, item) {
      const { SKILL_ACTIONS } = await import("./data/skill-actions.mjs");
      const taken = new Set(Array.from(actor.effects ?? [])
        .map((e) => e.getFlag?.(SYSTEM_ID, "skillFocusAction"))
        .filter(Boolean));
      const own = actor.getFlag(SYSTEM_ID, `skillFocus-${item.id}`);
      const options = SKILL_ACTIONS
        .filter((a) => a.checkType === "skill" && (!taken.has(a.key) || a.key === own))
        .map((a) => [a.key, `${a.name} (${(a.skills ?? []).join(", ")})`])
        .sort((a, b) => a[1].localeCompare(b[1]));
      const choice = await chooseFromList("Skill Focus", "Skill action for the +2 class bonus", options);
      if (!choice) return;
      const action = SKILL_ACTIONS.find((a) => a.key === choice);
      await replaceFeatEffect(actor, item, {
        name: `Skill Focus: ${action.name} +2`,
        img: item.img,
        description: `+2 class bonus when performing ${action.name} — applied automatically in that action's check dialog.`,
        // `choiceLabel` is what the sheet shows in brackets after the
        // feat's name — exact, rather than recovered from this effect's
        // own name. See feats.mjs's choiceFromEffectName.
        flags: { [SYSTEM_ID]: { skillFocusAction: choice, choiceLabel: action.name } }
      });
      await actor.setFlag(SYSTEM_ID, `skillFocus-${item.id}`, choice);
      await postCard(actor, "Skill Focus", [
        line(`Action recorded: <strong>${action.name}</strong> — the +2 class bonus is applied automatically when it rolls.`)
      ]);
    }
  },

  "spell recognition": {
    hint: "Reaction: identify a spell as it is cast — success queues a bonus to your save or DB against it.",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      const skillKey = await chooseFromList("Spell Recognition", "Identify with which skill?", [
        ["arcana", "Arcana"], ["nature", "Nature"], ["occultism", "Occultism"], ["religion", "Religion"]
      ]);
      if (!skillKey) return;
      const dcText = await enterText("Spell Recognition",
        "Identify DC (GM — spell's DC; -2 if the spell is in your repertoire)", "e.g. 18");
      if (dcText === null) return;
      const dc = Number.parseInt(dcText, 10);
      const skill = actor.system.skills?.[skillKey];
      const modifiers = skill?.checkModifiers ?? [
        { label: skill?.label ?? skillKey, value: Number(skill?.total ?? 0), type: "untyped" }
      ];
      const check = await TRGCheck.roll({
        actor,
        label: "Spell Recognition",
        subtitle: "Reaction — identify the spell as it is cast",
        type: "skill",
        dc: Number.isFinite(dc) ? dc : null,
        modifiers: [...modifiers]
      });
      const degree = check.outcome?.degree?.key ?? null;
      if (!degree) {
        await postCard(actor, "Spell Recognition", [
          line("No DC entered — the GM adjudicates the result (Critical: +2, Success: +1 to your save or DB against the spell).")
        ]);
        return;
      }
      const bonus = ["heroic", "critical"].includes(degree) ? 2
        : degree === "success" ? 1 : 0;
      if (!bonus) {
        await postCard(actor, "Spell Recognition", [
          line("<strong>Failure:</strong> you fail to recognise the spell.")
        ]);
        return;
      }
      await addPendingModifier(actor, {
        value: bonus, type: "circumstance", label: "Spell Recognition",
        scope: "Your saving throw or DB against the identified spell", oneShot: true
      });
      await postCard(actor, "Spell Recognition", [
        line(`<strong>${degree === "success" ? "Success" : "Critical"}:</strong> spell identified — a +${bonus} circumstance bonus is queued for your saving throw (tick it in the dialog) or your DB against it.`)
      ]);
    }
  },

  "weapon exemplar": {
    hint: "Choose your trained weapon group(s) — one at 4th, another at 8th, 12th, 16th and 20th; earlier picks carry the larger bonus.",
    async use(actor, item) {
      // Fighter, 4th (Chapter 3). Order of picking is the whole rule:
      // "the bonuses granted by previous weapon groups increase by +1
      // each", so the picks are stored as an ORDERED list on this
      // ability item and read everywhere through weaponExemplarPicks.
      const { weaponExemplarTierCount, weaponExemplarBonusFor } = await import("./fighter.mjs");
      // THE THIRTEEN PRINTED GROUPS (Chapter 6, page 157). Crossbow and
      // Blowgun were pack-only groups until 3.575.0; the book puts the
      // crossbows in Bow and the blowgun in Dart. See WEAPON_GROUPS.
      const GROUPS = WEAPON_GROUPS;
      const level = Number(actor.system?.identity?.level ?? 0);
      const tiers = weaponExemplarTierCount(level);
      if (!tiers) {
        ui.notifications.info("Weapon Exemplar: your first weapon group arrives at 4th level.");
        return;
      }
      const picks = [...(item.flags?.[SYSTEM_ID]?.weaponExemplarGroups ?? [])];
      const summary = () => picks.map((g) =>
        `<strong>${g}</strong> +${weaponExemplarBonusFor(picks, tiers, g)}`
      ).join(", ");
      if (picks.length >= tiers) {
        const nextAt = tiers < 5 ? 4 + tiers * 4 : null;
        await postCard(actor, item.name, [
          line(`Trained weapon groups: ${summary()} (class bonus to attack and damage rolls).`),
          line(nextAt
            ? `<em>Your next group arrives at ${nextAt}th level.</em>`
            : "<em>All five groups are chosen.</em>")
        ]);
        return;
      }
      // One question per unfilled tier — a Fighter who levelled from 7th
      // to 12th owes two picks, asked in order so seniority is theirs to
      // set. Cancelling keeps what has been answered so far.
      while (picks.length < tiers) {
        const options = GROUPS.filter((g) => !picks.includes(g)).map((g) => [g, g]);
        const ordinal = ["first", "second", "third", "fourth", "fifth"][picks.length];
        const choice = await chooseFromList(
          "Weapon Exemplar",
          `Your ${ordinal} weapon group — earlier picks carry the larger bonus`,
          options
        );
        if (!choice) break;
        picks.push(choice);
      }
      if (!picks.length) return;
      await item.setFlag(SYSTEM_ID, "weaponExemplarGroups", picks);
      await postCard(actor, item.name, [
        line(`Trained weapon groups: ${summary()} (class bonus to attack and damage rolls, applied automatically).`),
        ...(picks.length < tiers
          ? [line(`<em>${tiers - picks.length} pick${tiers - picks.length === 1 ? "" : "s"} still owed — press Use again to choose.</em>`)]
          : []),
        ...(level >= 13
          ? [line("<em>Weapon Supremacy: with these groups you treat a miss by " +
              `${level >= 19 ? "2 or less" : "1"} as a hit (not on disadvantage) — applied automatically.</em>`)]
          : [])
      ]);
    }
  },

  "weapon focus": {
    hint: "Record the weapon group this copy grants +1 class attack with (a different group per copy).",
    setup: true,
    // A background may grant this with the group already decided (Martial
    // Artist's "Weapon Focus (Unarmed)" → Brawling). The answer arrives as
    // an option rather than through a swapped-out dialog.
    acceptsChoice: true,
    recordedChoice: (actor, item) => actor.getFlag(SYSTEM_ID, `weaponFocus-${item.id}`) ?? null,
    async use(actor, item, { presetChoice = null } = {}) {
      // THE THIRTEEN PRINTED GROUPS (Chapter 6, page 157). Crossbow and
      // Blowgun were pack-only groups until 3.575.0; the book puts the
      // crossbows in Bow and the blowgun in Dart. See WEAPON_GROUPS.
      const GROUPS = WEAPON_GROUPS;
      const taken = new Set(Array.from(actor.effects ?? [])
        .map((e) => String(e.getFlag?.(SYSTEM_ID, "weaponFocusGroup") ?? ""))
        .filter(Boolean));
      const own = String(actor.getFlag(SYSTEM_ID, `weaponFocus-${item.id}`) ?? "");
      const options = GROUPS
        .filter((g) => !taken.has(g) || g === own)
        .map((g) => [g, g]);
      // A preset must be a group this copy may actually take — another
      // copy already holding it is a real refusal, not something to
      // override silently.
      if (presetChoice && !options.some(([g]) => g === presetChoice)) {
        return { reason: `${presetChoice} is already taken by another copy of Weapon Focus` };
      }
      const choice = presetChoice
        ?? await chooseFromList("Weapon Focus", "Weapon group for the +1 class attack bonus", options);
      if (!choice) return;
      await replaceFeatEffect(actor, item, {
        name: `Weapon Focus: ${choice} +1`,
        img: item.img,
        description: `+1 class bonus on attack rolls with ${choice}-group weapons — applied automatically in the attack dialog.`,
        flags: { [SYSTEM_ID]: { weaponFocusGroup: choice, choiceLabel: choice } }
      });
      await actor.setFlag(SYSTEM_ID, `weaponFocus-${item.id}`, choice);
      await postCard(actor, "Weapon Focus", [
        line(`Weapon group recorded: <strong>${choice}</strong> — the +1 class bonus is applied automatically when attacking with it.`)
      ]);
    }
  },

  "weapon proficient": {
    hint: "Record the specific weapon this copy makes you proficient with.",
    async use(actor, item) {
      // "Select a weapon which you are not proficient with." Until
      // 3.215.0 this filtered on the item's `proficiency` field, which
      // every weapon in the pack ships as "" — so the list was always
      // empty and the feat always fell through to typing a name by hand.
      const profile = proficiencyProfile(actor);
      const carried = actor.items.filter(
        (i) => i.type === "weapon" && !isProficientWith(profile, i)
      );
      let name;
      if (carried.length) {
        const id = await chooseFromList("Weapon Proficient", "Weapon to become proficient with",
          [...carried.map((w) => [w.id, w.name]), ["__other__", "Another weapon (type its name)..."]]);
        if (!id) return;
        name = id === "__other__" ? null : carried.find((w) => w.id === id)?.name;
      }
      if (!name) {
        name = await enterText("Weapon Proficient", "Weapon name", "e.g. Spiked Chain");
        if (!name) return;
      }
      await replaceFeatEffect(actor, item, {
        name: `Weapon Proficient: ${name}`,
        img: item.img,
        description: `Proficient with ${name} — the -4 non-proficiency penalty is waived automatically in the attack dialog (matched by weapon name).`,
        flags: { [SYSTEM_ID]: { weaponProficientName: name, choiceLabel: name } }
      });
      await postCard(actor, "Weapon Proficient", [
        line(`Weapon recorded: <strong>${name}</strong> — the non-proficiency penalty no longer applies to it.`)
      ]);
    }
  },

  /* ---------------- General feats: O-R batch (Chapter 5) ---------------- */

  "professional specialist": {
    hint: "Create the new Specialist Skill this pick grants (repeatable up to INT +1 copies).",
    async use(actor, item) {
      const existing = actor.getFlag(SYSTEM_ID, `professionalSpecialist-${item.id}`);
      if (existing && actor.system.specialistSkills?.[existing]) {
        const label = actor.system.specialistSkills[existing].label;
        ui.notifications.info(`This copy of Professional Specialist already created "${label}" — edit or remove it on the Skills tab.`);
        return;
      }
      const name = await enterText("Professional Specialist", "Name of your new Specialist Skill", "e.g. Sailing, Heraldry");
      if (!name) return;
      const ability = await chooseFromList("Professional Specialist", "Associated ability", [
        ["strength", "Strength"], ["dexterity", "Dexterity"], ["constitution", "Constitution"],
        ["intelligence", "Intelligence"], ["wisdom", "Wisdom"], ["charisma", "Charisma"]
      ]);
      if (!ability) return;
      const skill = { ...blankSpecialistSkill(ability), label: name };
      const key = uniqueKey(slugifyKey(name), actor.system.specialistSkills ?? {});
      await actor.update({ [`system.specialistSkills.${key}`]: skill });
      await actor.setFlag(SYSTEM_ID, `professionalSpecialist-${item.id}`, key);
      await postCard(actor, "Professional Specialist", [
        line(`New Specialist Skill created: <strong>${name}</strong> (${ability}) — it appears with your specialist skills.`),
        line("<em>This feat may be taken multiple times, but never more than your INT +1.</em>")
      ]);
    }
  },

  "quick donning": {
    hint: "DC 20 Athletics (or Warfare) check to don or remove armour with greater haste.",
    async use(actor) {
      const { TRGCheck } = await import("./dice/check.mjs");
      const warfare = Object.entries(actor.system.specialistSkills ?? {})
        .find(([, s]) => /warfare/i.test(String(s.label ?? "")));
      const options = [["athletics", "Athletics"]];
      if (warfare) options.push([`spec:${warfare[0]}`, warfare[1].label ?? "Warfare"]);
      const which = options.length > 1
        ? await chooseFromList("Quick Donning", "Check to attempt (DC 20)", options)
        : "athletics";
      if (!which) return;
      const source = which.startsWith("spec:")
        ? actor.system.specialistSkills[which.slice(5)]
        : actor.system.skills?.athletics;
      const modifiers = source?.checkModifiers ?? [
        { label: source?.label ?? "Athletics", value: Number(source?.total ?? 0), type: "untyped" }
      ];
      const check = await TRGCheck.roll({
        actor,
        label: "Quick Donning",
        subtitle: "DC 20 — don or remove armour with greater haste",
        type: "skill",
        dc: 20,
        modifiers: [...modifiers]
      });
      const degree = check.outcome?.degree?.key ?? "failure";
      const outcomes = {
        heroic: "It takes 2 rounds to don light armour, 1 minute to don medium or heavy armour, and 2 rounds to remove any armour.",
        critical: "It takes 2 rounds to don light armour, 1 minute to don medium or heavy armour, and 2 rounds to remove any armour.",
        success: "It takes 5 rounds to don light armour, 2 minutes to don medium or heavy armour, and 5 rounds to remove any armour.",
        partial: "No improvement — the armour takes its usual time.",
        failure: "No improvement — the armour takes its usual time.",
        fumble: "All hands and no fingers: it takes TWICE the usual time to don or remove the armour.",
        blunder: "All hands and no fingers: it takes TWICE the usual time to don or remove the armour."
      };
      await postCard(actor, "Quick Donning", [
        line(`<strong>${degree.charAt(0).toUpperCase() + degree.slice(1)}:</strong> ${outcomes[degree]}`)
      ]);
    }
  },

  /* ---------------- General feats: M+N batch (Chapter 5) ---------------- */

  "magical crafting": {
    hint: "Record the free level-2 magical item or rune formula gained with this feat.",
    setup: true,
    async use(actor, item) {
      const formula = await enterText("Magical Crafting",
        "Level-2 magical item or rune formula", "e.g. Rune of Sharpness");
      if (!formula) return;
      await replaceFeatEffect(actor, item, {
        name: `Magical Crafting: ${formula} formula`,
        img: item.img,
        description: `Knows the formula for ${formula} (level-2 magical item or rune) and may Create (Arcana, Nature, Occultism or Religion) permanent magical items and runes whose formulas they hold. Formulas gained later from other sources are tracked separately.`
      });
      const filed = await addFormulaToBook(actor, formula);
      await postCard(actor, "Magical Crafting", [
        line(`Formula recorded: <strong>${formula}</strong> — you may Create it with Arcana, Nature, Occultism or Religion.`),
        filed
          ? line(`Written into <strong>${filed.book.name}</strong> — now holding ${filed.count} of ${FORMULA_BOOK_CAPACITY} formulae.`)
          : line(`<em>Not written to a formula book — see the warning. The feat still grants it; add a book and press Use again.</em>`)
      ]);
    }
  },

  "magical discovery": {
    hint: "Instinctive casters: +1 repertoire pick. Learned casters: +1 daily memorised slot. Applies automatically — fill it with the class's own Pick Spell / Memorise Spell button.",
    async use(actor, item) {
      // The class declares its caster style since 3.224.0, so a Ranger
      // is never asked whether it is instinctive; the question remains
      // only for a character whose class predates the field or whose
      // casting comes from somewhere other than a class. Recorded on
      // THIS COPY (not actor-wide) since a class-less caster could in
      // principle answer differently across copies.
      const declared = String(actor.system?.magic?.casterStyle ?? "").trim().toLowerCase();
      let kind = declared;
      if (!["instinctive", "learned"].includes(declared)) {
        const stored = String(item.getFlag?.(SYSTEM_ID, "magicalDiscoveryStyleChoice") ?? "").trim().toLowerCase();
        kind = ["instinctive", "learned"].includes(stored)
          ? stored
          : await chooseFromList("Magical Discovery", "Which kind of caster are you?", [
            ["instinctive", "Instinctive — an additional repertoire pick"],
            ["learned", "Learned — an additional daily memorised slot"]
          ]);
        if (!kind) return;
        await item.setFlag(SYSTEM_ID, "magicalDiscoveryStyleChoice", kind);
      }
      // The bonus itself is DERIVED — repertoireContext/memorisationContext
      // (magical-discovery.mjs's magicalDiscoveryBonus) count every owned
      // copy of this feat and add one slot per copy straight onto the
      // Repertoire/Memorisation card's own allowance, so it's already
      // live the moment the feat is on the sheet. Use just confirms that
      // and (for a class-less caster) records which bucket this copy
      // belongs to. The effect below is a passive, purely descriptive
      // note for the Effects tab — it carries no changes of its own.
      if (kind === "instinctive") {
        await replaceFeatEffect(actor, item, {
          name: "Magical Discovery: +1 repertoire pick",
          img: item.img,
          description: "One additional repertoire pick — already added to your Spell Repertoire card's allowance. Fill it with Pick Spell."
        });
        await postCard(actor, "Magical Discovery", [
          line("Recorded: <strong>+1 repertoire pick</strong> — already reflected on the Spell Repertoire card. Fill it with Pick Spell from the Magic tab.")
        ]);
        return;
      }
      await replaceFeatEffect(actor, item, {
        name: "Magical Discovery: +1 memorised slot",
        img: item.img,
        description: "One additional leveled spell memorised each day — already added to your Memorisation card's allowance. Fill it with Memorise Spell."
      });
      await postCard(actor, "Magical Discovery", [
        line("Recorded: <strong>+1 memorised spell slot</strong> each day — already reflected on the Memorisation card. Fill it with Memorise Spell from the Magic tab.")
      ]);
    }
  },

  "moment of clarity": {
    hint: "1 AP: Concentrate actions are permitted (despite Rage) until the end of your turn.",
    async use(actor, item) {
      const ap = generalAP(actor); // 3.648.0: not Haste's or Fast Attack's point
      if (game.combat?.started && ap < 1) {
        ui.notifications.warn("Moment of Clarity: 1 AP required.");
        return;
      }
      if (game.combat?.started) {
        await actor.update({ "system.resources.ap.value": Number(actor.system.resources?.ap?.value ?? 0) - 1 });
      }
      await replaceFeatEffect(actor, item, {
        name: "Moment of Clarity",
        img: item.img,
        description: "Concentrate-trait actions are permitted, with or without the Rage trait, until the end of this turn. The Defence-trait prohibition still applies.",
        flags: { [SYSTEM_ID]: { momentOfClarity: true } }
      });
      await postCard(actor, "Moment of Clarity", [
        line(`Rage parts for a moment${game.combat?.started ? " (1 AP spent)" : ""} — <strong>Concentrate actions are permitted until the end of your turn</strong>.`),
        line("<em>The clarity ends automatically when your turn does. Defence-trait actions stay forbidden while raging.</em>")
      ]);
    }
  },

  /* ---------------- General feats: I-L batch (Chapter 5) ---------------- */

  "inner reserve": {
    hint: "True up the +1 HP per level (the +2 to exhaustion checks is automatic; fatigue saves stay a table call).",
    async use(actor) {
      const summary = await reconcilePPGrant(actor, PP_GRANTS[3], { report: true });
      if (!summary) {
        ui.notifications.info("Inner Reserve: Max HP already includes the full per-level grant.");
      }
      await postCard(actor, "Inner Reserve", [
        line("The <strong>+2 class bonus to exhaustion checks</strong> is applied automatically when those checks roll."),
        line("<em>For saving throws to resist fatigue from other sources, add the +2 class bonus in the roll dialog.</em>")
      ]);
    }
  },

  /* ---------------- General feats: F-H batch (Chapter 5) ---------------- */

  "flawless performance": {
    hint: "Record the Perform specialty this feat grants advantage on (Performance / Earn Income only).",
    setup: true,
    async use(actor, item) {
      const options = SKILL_SPECIALTIES.perform.options.map((o) => [o.key, o.label]);
      const choice = await chooseFromList("Flawless Performance",
        "Perform specialty (advantage on its Performance / Earn Income checks)", options);
      if (!choice) return;
      const label = SKILL_SPECIALTIES.perform.options.find((o) => o.key === choice)?.label ?? choice;
      await replaceFeatEffect(actor, item, {
        name: `Flawless Performance: advantage on ${label}`,
        img: item.img,
        description: `Advantage on Performance and Earn Income (Perform) checks made with the ${label} specialty — select Advantage in the roll dialog. Not usable when Perform is doing something else (such as casting a bard spell).`
      });
      await postCard(actor, "Flawless Performance", [
        line(`Specialty recorded: <strong>${label}</strong> — select Advantage on its Performance / Earn Income checks.`),
        line("<em>No advantage when Perform is being used for anything else (e.g. casting a bard spell).</em>")
      ]);
    }
  },

  /* ---------------- General feats: C batch (Chapter 5) ---------------- */

  "counter spell": {
    hint: "After identifying a spell via Spell Recognition: run Dispel as a Free action to counter it.",
    async use(actor) {
      const { SKILL_ACTIONS } = await import("./data/skill-actions.mjs");
      const { resolveAction } = await import("./combat/action-workflow.mjs");
      const base = SKILL_ACTIONS.find((a) => a.key === "dispel");
      if (!base) {
        ui.notifications.warn("Counter Spell: the Dispel skill action was not found.");
        return;
      }
      return resolveAction(actor, {
        ...base,
        name: "Counter Spell (free Dispel)",
        apCost: "0",
        requirements: "You have just identified the incoming spell with Spell Recognition."
      }, { invokedSkillKey: "powerManipulation" });
    }
  },

  /* ---------------- General feats: B batch (Chapter 5) ---------------- */

  "battle cry": {
    hint: "Demoralise as a free action at initiative — or as a reaction on your critical hit (Intimidate 10+).",
    async use(actor) {
      const timing = await chooseFromList("Battle Cry", "When are you crying out?", [
        ["initiative", "Rolling initiative — Demoralise as a free action"],
        ["reaction", "Just landed a critical hit — Demoralise as a reaction (Intimidate 10+ ranks)"]
      ]);
      if (!timing) return;
      const { SKILL_ACTIONS } = await import("./data/skill-actions.mjs");
      const { resolveAction } = await import("./combat/action-workflow.mjs");
      const base = SKILL_ACTIONS.find((a) => a.key === "demoralise");
      if (!base) {
        ui.notifications.warn("Battle Cry: the Demoralise skill action was not found.");
        return;
      }
      return resolveAction(actor, {
        ...base,
        name: timing === "reaction" ? "Battle Cry (reaction Demoralise)" : "Battle Cry (free Demoralise)",
        apCost: timing === "reaction" ? "Reaction" : "0"
      }, { invokedSkillKey: "intimidate" });
    }
  },

  "battle medic": {
    hint: "Treat Wounds in combat as a 3 AP action (Medicine vs the usual Treat Wounds DC).",
    async use(actor) {
      const { SKILL_ACTIONS } = await import("./data/skill-actions.mjs");
      const { resolveAction } = await import("./combat/action-workflow.mjs");
      const base = SKILL_ACTIONS.find((a) => a.key === "treatWounds");
      if (!base) {
        ui.notifications.warn("Battle Medic: the Treat Wounds skill action was not found.");
        return;
      }
      return resolveAction(actor, {
        ...base,
        name: "Battle Medic (Treat Wounds, 3 AP)",
        apCost: "3",
        requirements: "You are holding healer's tools, or you are wearing them and have a hand free."
      }, { invokedSkillKey: "medicine" });
    }
  },

  "breath control": {
    hint: "Queue the +2 circumstance bonus for a saving throw against an inhaled threat.",
    async use(actor) {
      await addPendingModifier(actor, {
        value: 2, type: "circumstance", label: "Breath Control (inhaled threat)",
        scope: "One saving throw against an inhaled threat (e.g. inhaled poison)", oneShot: true
      });
      await postCard(actor, "Breath Control", [
        line("A +2 circumstance bonus is queued — tick it in the next saving-throw dialog against an inhaled threat."),
        line("<em>You can also hold your breath 10× as long as usual before suffocating.</em>")
      ]);
    }
  },

  "brew potion": {
    hint: "Record the free level-1 Potion formula gained with this feat.",
    async use(actor, item) {
      const formula = await enterText("Brew Potion",
        "Level-1 Potion formula", "e.g. Potion of Healing");
      if (!formula) return;
      await replaceFeatEffect(actor, item, {
        name: `Brew Potion: ${formula} formula`,
        img: item.img,
        description: `Knows the formula for ${formula} (level-1 Potion) and may Create (Arcana, Nature, Occultism or Religion) Potions whose formulas they hold. Formulas gained later from other sources are tracked separately.`
      });
      const filed = await addFormulaToBook(actor, formula);
      await postCard(actor, "Brew Potion", [
        line(`Formula recorded: <strong>${formula}</strong> — you may Create it with Arcana, Nature, Occultism or Religion.`),
        filed
          ? line(`Written into <strong>${filed.book.name}</strong> — now holding ${filed.count} of ${FORMULA_BOOK_CAPACITY} formulae.`)
          : line(`<em>Not written to a formula book — see the warning. The feat still grants it; add a book and press Use again.</em>`)
      ]);
    }
  },

  "artistic expertise": {
    hint: "Record the artistic specialty this feat grants advantage on.",
    async use(actor, item) {
      const options = [];
      for (const skillKey of ["artistry", "perform"]) {
        const def = SKILL_SPECIALTIES[skillKey];
        for (const o of def.options) options.push([`${skillKey}.${o.key}`, `${def.label}: ${o.label}`]);
      }
      const choice = await chooseFromList("Artistic Expertise", "Specialty (advantage on its checks)", options);
      if (!choice) return;
      const label = options.find(([v]) => v === choice)?.[1] ?? choice;
      await replaceFeatEffect(actor, item, {
        name: `Artistic Expertise: advantage on ${label}`,
        img: item.img,
        description: `Advantage on all skill checks made for the ${label} specialty — select Advantage in the roll dialog. Repeat picks of this feat record a different specialty each.`,
        // The SPECIALTY alone, so the sheet reads "Artistic Expertise
        // (Dance)" rather than repeating the effect's whole sentence.
        flags: { [SYSTEM_ID]: { choiceLabel: label } }
      });
      await postCard(actor, "Artistic Expertise", [
        line(`Specialty recorded: <strong>${label}</strong> — select Advantage in the roll dialog when making its checks.`)
      ]);
    }
  }
};

/**
 * One Use button covering all eight Wizard schools, dispatched by the
 * item's own name (Alteration, Enchantment, Insight, Invocation, Shadow,
 * Soul, Translocation, Warding). Two schools have a real daily choice to
 * make (Alteration's Enhancement, Warding's Resistance); three are
 * passive bonuses with nothing to pick, so Use just confirms where the
 * bonus already shows up; two are genuine content gaps (Shadow,
 * Translocation — see wizard.mjs's header note); Soul's Necroscope is
 * flavour with no bonus to compute at all.
 */
async function useWizardSchool(actor, item) {
  const school = String(item?.name ?? "").trim();
  const level = Number(actor.system?.identity?.level ?? 0);

  if (school === "Alteration") {
    const { ALTERATION_ENHANCEMENT_KEYS } = await import("./wizard.mjs");
    const labels = { strength: "Strength", constitution: "Constitution", dexterity: "Dexterity" };
    const picked = await chooseFromList(
      "Enhancement",
      "Ability score for the +1-status bonus",
      ALTERATION_ENHANCEMENT_KEYS.map((k) => [k, labels[k]])
    );
    if (!picked) return;
    await replaceFeatEffect(actor, item, {
      name: `Enhancement: ${labels[picked]} +1`,
      img: item.img,
      description: "A +1-status bonus from Alteration's Enhancement — changeable during daily preparation.",
      changes: [{
        key: `system.attributes.${picked}.status`,
        type: CHANGE_TYPE.ADD,
        value: "1",
        priority: 20
      }]
    });
    await item.setFlag(SYSTEM_ID, "alterationChoice", picked);
    await postCard(actor, "Enhancement", [
      line(`<strong>+1-status</strong> bonus to <strong>${labels[picked]}</strong> — visible in that attribute's status slot.`),
      line("<em>Press Use again any time to move it — the Daily Preparation card reminds you of today's choice.</em>")
    ]);
    return;
  }

  if (school === "Warding") {
    const { WARDING_ENERGY_TYPES, wardingResistanceField } = await import("./wizard.mjs");
    const labels = { acid: "Acid", cold: "Cold", electricity: "Electricity", fire: "Fire", sonic: "Sonic" };
    const picked = await chooseFromList(
      "Resistance",
      "Energy type",
      WARDING_ENERGY_TYPES.map((k) => [k, labels[k]])
    );
    if (!picked) return;
    const field = wardingResistanceField(level);
    const isImmune = field === "immunities";
    await replaceFeatEffect(actor, item, {
      name: `${isImmune ? "Immunity" : "Resistance"}: ${labels[picked]}`,
      img: item.img,
      description: `${isImmune ? "Immunity" : "Resistance"} to ${labels[picked]} from Warding's Resistance — changeable during daily preparation.`,
      changes: [{
        key: `system.combat.${field}`,
        type: CHANGE_TYPE.ADD,
        value: `, ${labels[picked]}`,
        priority: 20
      }]
    });
    await item.setFlag(SYSTEM_ID, "wardingChoice", picked);
    await postCard(actor, "Resistance", [
      line(`<strong>${isImmune ? "Immunity" : "Resistance"}</strong> to <strong>${labels[picked]}</strong> — visible in your ${isImmune ? "Immunities" : "Resistances"} field.`),
      line(isImmune
        ? "<em>20th level: this reads as an immunity, per the ability's own text.</em>"
        : "<em>Press Use again any time to change it — the Daily Preparation card reminds you of today's choice. Re-press after reaching 20th level to convert it to an immunity.</em>")
    ]);
    return;
  }

  if (school === "Enchantment") {
    const { enchantingSmileBonus } = await import("./wizard.mjs");
    const bonus = enchantingSmileBonus(level);
    await postCard(actor, "Enchanting Smile", [
      line(`Automatic — a <strong>+${bonus}</strong> class bonus to Deception, Diplomacy and Intimidate is already included in those totals.`)
    ]);
    return;
  }

  if (school === "Insight") {
    const { forewarnedBonus } = await import("./wizard.mjs");
    const bonus = forewarnedBonus(level);
    await postCard(actor, "Forewarned", [
      line(`Automatic — a <strong>+${bonus}</strong> bonus (your level +10) is already included in your Initiative total.`)
    ]);
    return;
  }

  if (school === "Invocation") {
    await postCard(actor, "Intense Spells", [
      line("Automatic — casting a spell with the Invocation trait that deals damage adds half its PP cost to the damage, folded in before Damage Reduction and resistances apply.")
    ]);
    return;
  }

  if (school === "Soul") {
    const { NECROSCOPE_NOTE } = await import("./wizard.mjs");
    await postCard(actor, "Necroscope", [line(NECROSCOPE_NOTE)]);
    return;
  }

  // POWERFUL ILLUSION (3.332.0). Graham's ruling restates the printed
  // ability as "any Shadow spell that you cast may have a 1 PP warping
  // option applied to it for free" — a school, which is a trait, rather
  // than the undefined "illusion" category that made this a gap.
  //
  // Carried on an ActiveEffect rather than written anywhere, exactly as
  // Furini's school-scoped warp discount is: cast-workflow reads both
  // channels off the actor's effects and matches them against the
  // spell's own traits. Nothing new had to be taught about scoping.
  if (school === "Shadow") {
    const { POWERFUL_ILLUSION } = await import("./wizard.mjs");
    await replaceFeatEffect(actor, item, {
      name: "Powerful Illusion",
      img: item.img,
      description: `The first ${POWERFUL_ILLUSION.value} PP of warping on any ${POWERFUL_ILLUSION.school} spell you cast is free.`,
      flags: { [SYSTEM_ID]: { warpFreeSchool: { ...POWERFUL_ILLUSION, label: "Powerful Illusion" } } }
    });
    await postCard(actor, "Powerful Illusion", [
      line(`Automatic — the first <strong>${POWERFUL_ILLUSION.value} PP</strong> of warping on any spell with the <strong>${POWERFUL_ILLUSION.school}</strong> trait costs you nothing.`),
      line("<em>Unlike a warping <em>discount</em>, which never takes a cost below 1 PP, this one is genuinely free: a 1 PP option on a Shadow spell costs 0, and a 2 PP option costs 1.</em>")
    ]);
    return;
  }

  const { WIZARD_SCHOOL_GAPS } = await import("./wizard.mjs");
  const gap = WIZARD_SCHOOL_GAPS[school];
  if (gap) {
    await postCard(actor, school, [line(`<em>${gap}</em>`)]);
    return;
  }

  ui.notifications.info(`${item.name}: nothing to configure.`);
}

/**
 * Automation keyed by item TYPE rather than by name.
 *
 * The ten divine aspects are called Dawn, Death, Justice, Magic, Murder,
 * Nature, Pandemonium, Time, Tyranny and War. Registering those ten in
 * the name-keyed table would put "Nature", "Time", "Magic" and "War"
 * into a namespace shared with 429 feats and every heritage — one
 * future feat called War and a player pressing Use on it would be asked
 * to pick a cleric spell. Every aspect wants the SAME action anyway, so
 * the type is the right key.
 *
 * The eight Wizard schools join it at 3.230.0 for the same reason —
 * Shadow, Insight, Soul and Warding are ordinary English words too.
 */
const TYPE_AUTOMATION = {
  "divine-aspect": {
    hint: "Choose your aspect's specialist spell (and, for a Crusader, its reaction feat).",
    use: useDivineAspectAll
  },
  "wizard-school": {
    hint: "Alteration/Warding: choose today's daily bonus. Enchantment/Insight/Invocation: confirm the automatic bonus. Shadow/Soul/Translocation: see the note.",
    use: useWizardSchool
  }
};

/**
 * One Use button, two possible questions — the same shape useBackground
 * has, and for the same reason: an item gets ONE button and it has to
 * cover whatever that item declares.
 *
 * The reaction feat runs FIRST and only for a Crusader whose aspect is
 * neither good nor evil; the specialist spell is asked of everyone.
 */
async function useDivineAspectAll(actor, item) {
  let did = await chooseAlignmentFeat(actor, item);
  did = await useDivineAspect(actor, item) || did;
  return did;
}

/**
 * Item types that are FIRST-CLASS pack entries with their own names, and
 * so must never fall through to the feat name table.
 *
 * A divine aspect is called Dawn, Nature, Time or War; a Wizard school
 * is called Shadow, Insight, Soul or Warding; a creature type is called
 * Beast, Construct, Fey or Undead. Those are ordinary English words
 * sharing a namespace with 429 feats — and a feat named Shadow (or
 * Construct, or Beast) would otherwise put a Use button on every copy of
 * the school or creature type and run the feat's automation from it. The
 * type table is the only thing that should speak for them.
 */
const OWN_NAMESPACE_TYPES = new Set(["divine-aspect", "wizard-school", "creature-type"]);

/** Whether a feat (or an item whose whole type is automated) has a Use action. */
export function hasFeatAutomation(name, type = "") {
  if (type && type in TYPE_AUTOMATION) return true;
  if (OWN_NAMESPACE_TYPES.has(type)) return false;
  return normalise(name) in FEAT_AUTOMATION;
}

/**
 * Whether a Use action RECORDS A PERMANENT CHOICE rather than doing
 * something in play. Graham's ruling of 15 September 2026 (R1 of the
 * pages 31–40 audit).
 *
 * THE DIFFERENCE MATTERS BECAUSE ONE OF THEM IS SILENT. A Soldier is
 * granted Weapon Focus, whose Use button records the weapon group the
 * +1 class attack bonus applies to. Until it is pressed the bonus does
 * not exist — and the Apply Grants card said nothing, because the "also
 * has a Use action" nudge was scoped to races and heritages. Same for
 * the Arcane Apprentice's free Magical Crafting formula and the
 * Entertainer's Flawless Performance specialty: a grant the character
 * never received, with nothing anywhere saying so.
 *
 * Battle Medic and Quick Donning are the other half of the argument.
 * Both have Use buttons; both are things you do in a fight, not things
 * you record once. Nudging for those on every Apply Grants press would
 * be noise, and noise is how the line that matters gets skimmed past.
 *
 * `acceptsChoice` entries (Favoured Terrain) count: the terrain is
 * permanent even though the effect it creates is toggled in play.
 */
// Not exported: the only question the card ever asks is the one below,
// and an exported rule with no caller outside its own file is an
// opinion, not automation (lesson 5.1).
function isSetupChoice(name, type = "") {
  if (OWN_NAMESPACE_TYPES.has(type)) return false;
  if (type && type in TYPE_AUTOMATION) return Boolean(TYPE_AUTOMATION[type].setup);
  return Boolean(FEAT_AUTOMATION[normalise(name)]?.setup);
}

/**
 * …and whether that choice is STILL OUTSTANDING on this actor.
 *
 * A nudge that cannot tell "you have not chosen yet" from "you chose
 * last week" nags for ever, and a card that nags is a card nobody reads.
 * Two ways of asking, because the automations record their answers in
 * two different places:
 *
 *   - the entry's own `recordedChoice` where it has one (Weapon Focus
 *     and Favoured Terrain, the two that accept a preset answer), which
 *     is the same reader `applyFeatQualifier` trusts;
 *   - otherwise the STAMP every feat-created effect and every granted
 *     item carries — `featSource` / `grantedBy.sourceId` — because what
 *     a chooser leaves behind is an effect or an item, and both name the
 *     feat they came from.
 */
export function setupChoicePending(actor, item) {
  if (!item || !isSetupChoice(item.name, item.type)) return false;
  const automation = FEAT_AUTOMATION[normalise(item.name)];
  if (automation?.recordedChoice) {
    return automation.recordedChoice(actor, item) == null;
  }
  const stampedEffect = Array.from(actor?.effects ?? [])
    .some((e) => e.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) === item.id);
  const stampedItem = Array.from(actor?.items ?? [])
    .some((i) => i.getFlag?.(SYSTEM_ID, "grantedBy")?.sourceId === item.id);
  return !(stampedEffect || stampedItem);
}

/**
 * The pick a feat has recorded on this actor, for the SHEET to show in
 * brackets after its name. Graham's request of 15 September 2026.
 *
 * Read off the effect the chooser created rather than off the actor flag
 * each one keeps, for two reasons: the effect is where a repeatable feat
 * keeps its per-copy answer (the flags are keyed by item id and would
 * need a second per-feat table here to find), and the effect is what
 * leaves with the feat — so a deleted copy stops showing its group on
 * the same tick, without a cleanup pass.
 *
 * Only feats whose Use action RECORDS something are asked, which is the
 * same `setup` flag the Apply Grants nudge turns on: an in-play action
 * like Battle Medic leaves effects behind too, and "Battle Medic
 * (Treat Wounds)" would be noise on a row that never had a choice.
 */
export function recordedFeatChoice(actor, item) {
  // REPEATABLE IS THE WHOLE TEST. Graham's rule, 15 September 2026: "if
  // a feat or ability can be taken multiple times, each time selecting a
  // new option then the option should be shown in brackets. If it may
  // only be taken once, then don't."
  //
  // Read off the item's own `system.repeatable`, which the feats pack
  // already carries and which agrees with the printed text — Armour
  // Focus prints "You may select this feat multiple times" and is
  // flagged; Improved Critical and Weapon Specialisation each choose a
  // weapon group, print no such clause, and are not. The abilities
  // schema has no such field at all, which is the right answer for a
  // racial ability: you get it once.
  //
  // This replaced a gate on the `setup` flag, which was the wrong
  // question and showed live as "Magical Crafting (Rune of Sharpness
  // formula)" — a feat you take once, whose row never needed to say so.
  if (!item || item.system?.repeatable !== true) return "";
  // A chooser that records its answer somewhere other than an effect
  // says so on the feat itself — Armour Focus writes the DR onto the
  // ARMOUR, so the feat has no effect of its own to read.
  const own = String(item.getFlag?.(SYSTEM_ID, "choiceLabel") ?? "").trim();
  if (own) return own;
  for (const effect of Array.from(actor?.effects ?? [])) {
    if (effect.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) !== item.id) continue;
    const pick = choiceFromEffectName(item.name, {
      name: effect.name,
      label: effect.getFlag?.(SYSTEM_ID, "choiceLabel")
    });
    if (pick) return pick;
  }
  // …AND A CHOOSER WHOSE ANSWER IS AN ITEM. Specialist Spell buys a
  // spell rather than writing an effect — "repeatable, this copy's
  // pick" — so a second copy is tellable from the first only by what it
  // bought. Taken only when this feat granted exactly ONE thing, so a
  // feat handing over a package never picks one of them at random.
  const granted = Array.from(actor?.items ?? [])
    .filter((i) => i.getFlag?.(SYSTEM_ID, "grantedBy")?.sourceId === item.id);
  if (granted.length === 1) return String(granted[0].name ?? "").trim();
  return "";
}

/**
 * Abilities that ARE automated but have no button, and where they act.
 *
 * WHY THIS EXISTS. `useFeat` used to answer anything without a `use` handler
 * with "X has no automated action — see its description." For a genuinely
 * unbuilt feature that is honest. For a PASSIVE it is a lie of omission, and
 * it cost real credibility: the 13 Aug 2026 combat playtest drove Frenzy,
 * Battle Readiness and Killer's Edge, got that sentence three times, and
 * reported all three to Graham as design gaps. All three were fully wired.
 *
 *   Frenzy           gates two skill actions (canInvokeRage checks for it)
 *   Battle Readiness adds a reaction to the per-round pool (fighter.mjs)
 *   Killer's Edge    puts adjustment buttons on a qualifying critical card
 *
 * None of them SHOULD have a button — a passive with a Use button would be
 * worse. What they needed was for the system to say so. Anything added here
 * must be genuinely wired; the harness asserts that each named mechanism
 * actually exists, so this table cannot become a place to hide unbuilt work.
 */
export const PASSIVE_AUTOMATION = Object.freeze({
  frenzy:
    "Works automatically: Frenzy unlocks the <strong>Invoke Rage</strong> and "
    + "<strong>Revoke Rage</strong> actions on your Mental Focus skill. Use them from there.",
  "battle readiness":
    "Works automatically: you gain <strong>one extra reaction</strong> each round, "
    + "spendable only on a Reaction-type action with the Attack or Martial trait. "
    + "The reaction pool already includes it.",
  "killer's edge":
    "Works automatically: land a critical with an <strong>agile</strong> or "
    + "<strong>finesse</strong> weapon and the injury card offers buttons to shift "
    + "the result by up to your class bonus.",

  // THE THREE "TWO ADDITIONAL TIMES PER DAY" FEATS (3.351.0).
  //
  // All three shipped as a featNote reading "…when the class model
  // lands". It landed. Each now feeds the real daily maximum through
  // `extraUsesBonus` (module/extra-uses.mjs), which `itemUsesMax` and
  // the daily-preparation top-up both read — so the number on the sheet
  // and the number a night's rest restores to are the same number.
  //
  // No button, deliberately: there is nothing to choose and nothing to
  // spend. What they needed was for the system to SAY so, which is the
  // whole reason this table exists.
  "extra channels": "Works automatically: your <strong>Channels</strong> ability gains "
    + "<strong>+2 uses per day</strong>, on the sheet and at daily preparation. "
    + "Two copies of this feat are worth +4.",
  "extra mercy": "Works automatically: <strong>Crusader's Mercy</strong> gains "
    + "<strong>+2 uses per day</strong>, on the sheet and at daily preparation. "
    + "Two copies of this feat are worth +4.",
  "extra wildshape": "Works automatically: <strong>Wild Shape</strong> gains "
    + "<strong>+2 uses per day</strong>. The count lives on Shape Of The Animal and "
    + "is recomputed at daily preparation, so there is nothing to re-press.",

  // THE THREE CHANNEL FEATS (3.352.0). Two widen the list the Channels
  // button offers; the third widens who an undead-keyed spell may reach.
  // None is a button of its own, and each says so — a feat that silently
  // does nothing is how a whole family stayed broken through a release
  // earlier this chapter.
  "turn undead": "Works automatically: <strong>Turn Undead</strong> now appears in your "
    + "<strong>Channels</strong> spell list. It spends a Channels use like any other — "
    + "press Use on Channels and choose it.",
  "versatile channels": "Works automatically: <strong>Remove Curse</strong>, "
    + "<strong>Remove Disease</strong>, <strong>Remove Paralysis</strong> and "
    + "<strong>Restore Senses</strong> now appear in your <strong>Channels</strong> "
    + "spell list, each spending one Channels use.",
  "alignment channel": "Works automatically: a spell keyed at <strong>undead</strong> also "
    + "reaches an <strong>Eternal with the evil trait</strong>. The cast card names anyone "
    + "your positive energy reached because of this feat.",

  // THE THIRTEEN REACTION FEATS (3.353.0). None of them is a button on
  // the sheet, because none of them is something you DO on your own
  // turn — a card appears when the trigger happens and offers it to
  // whoever may take it. What they each needed was for the system to say
  // where they act, which is the whole reason this table exists.
  "cleave": "Works automatically: when your Strike drops a foe and another is in reach, a card offers a Strike against them. It uses your <strong>current</strong> multiple attack penalty and does not increase it.",
  "great cleave": "Works automatically: your <strong>Cleave</strong> keeps going while it keeps dropping foes — the whole chain costs the one reaction. The Cleave card says so when you hold this.",
  "allied strike": "Works automatically: a card appears whenever you take an attack action, offering an ally within 30 ft a free attack.",
  "armoured counter": "Works automatically: a card appears when a blow wounds you without a critical, offering a 1 AP attack action back. Needs medium or heavy armour, and the card says so when you have neither.",
  "self preservation": "Works automatically: a card appears when an attack wounds you, reporting <strong>DR +2 plus half your level</strong> against it and the aligned damage you deal back.",
  "chance of redemption": "Works automatically: a card appears when an enemy wounds an ally within 10 ft of you; it rolls the foe's Will save and reports how far the attack is reduced.",
  "strike of retribution": "Works automatically: a card appears when an enemy wounds an ally within 10 ft, offering to intercept the blow on <strong>your</strong> Defensive Bonus and strike back if it lands.",
  "guardian defence": "Works automatically: a card appears when an ally in your reach is hit, offering an immediate <strong>Aid Defensive</strong>.",
  "duelling riposte": "Works automatically: a card appears when a creature in your reach fumbles a Strike. Needs a one-handed weapon and a free hand.",
  "twin riposte": "Works automatically: a card appears when a creature in your reach fumbles a Strike, while you are in <strong>Double Stance</strong>.",
  "disarm block": "Works automatically: a card appears when your shield turns a blow aside — a Disarm attempt, as a <strong>Free</strong> action, needing no free hand.",
  "offensive parry": "Works automatically: a card appears when you use <strong>Shield Block</strong>, offering a Shove as a <strong>Free</strong> action.",
  "shadowing": "Works automatically: a card appears when a creature in your reach moves away, offering a 1 AP Stride after them.",

  // KNIFE FLURRY (3.354.0) is the one action feat with no button: it is
  // triggered by your own knife landing, not chosen on your turn. Graham's
  // ruling — a feat that must be remembered at exactly that moment is a
  // feat that goes unused.
  "knife flurry": "Works automatically: a card appears whenever your knife lands, offering the "
    + "<strong>Feint</strong> as a <strong>0 AP</strong> action. It carries the attack trait, so your "
    + "multiple attack penalty applies to it and then climbs.",

  // TRAP FINDER'S THIRD BONUS (3.555.0), and the one line of GM setup it
  // asks for.
  //
  // The Perception and save halves are authored conditionals and need
  // nothing said. The DB half cannot be a conditional — DB is a number
  // somebody else rolls against — so it is applied in the attack
  // workflow, and it can only fire on an attack the system can SEE is a
  // trap. No pack ships a trap, so this hint is where a GM finds out
  // what to type. Graham's ruling of 16 September 2026: read the trait
  // if it is there, say how to set it if it is not, and never guess.
  // THE TWO CHANNELS A GM CAN ACTUALLY SET, and it is deliberately not
  // three. `attackIsFromATrap` also reads `details.creatureType`, and
  // live testing at 3.555.0 showed why naming it here would have been a
  // wasted instruction: that field is DERIVED from an owned creature-type
  // item, so typing into it does not stick — and the twelve authored
  // creature types are Undead through Animal, with no Trap among them.
  // The rule still reads it, so a Trap creature type authored later works
  // without changing this; the hint names what works today.
  "trap finder": "Works automatically: the Perception and saving-throw bonuses are offered on "
    + "your check dialogs, and rise to <strong>+4</strong> at 10 Perception ranks on their own. "
    + "The <strong>+2 DB against attacks made by traps</strong> is applied for you when the attack "
    + "carries the <strong>trap</strong> trait — put it on the trap's own <strong>Traits</strong> "
    + "line, or on the attack it makes, and the attack card will name the bonus."
});

/** Is this a wired passive — automated, but with nothing to press? */
export function isPassiveAutomation(name, type = "") {
  if (type && type in TYPE_AUTOMATION) return false;
  return normalise(name) in PASSIVE_AUTOMATION || queuedPassiveAutomation().has(normalise(name));
}

/** Hint text for the sheet tooltip. */
export function featAutomationHint(name, type = "") {
  if (type && type in TYPE_AUTOMATION) return TYPE_AUTOMATION[type].hint;
  if (OWN_NAMESPACE_TYPES.has(type)) return "";
  return FEAT_AUTOMATION[normalise(name)]?.hint
    ?? PASSIVE_AUTOMATION[normalise(name)]
    ?? queuedPassiveAutomation().get(normalise(name))
    ?? "";
}

/* ------------------------------------------------------------------ */
/*  A DECLARED CHOICE OF ABILITY (3.563.0)                             */
/* ------------------------------------------------------------------ */

/**
 * The names an item offers through `flags.trg-prime.abilityChoices`, or
 * null when it declares none. Pure.
 *
 * Priestly Path, Martial Training and Archetypal Path each have a
 * chooser of their own that grants an archetype FEAT; Hunter's Method
 * and Divine Ally record a choice in a flag. What none of them does is
 * grant an ABILITY — and that is the shape every Pillars of Faith class
 * prints: "select an Archival Discipline... grants you a Specialist
 * Skill, a 1st-level Specialist Spell, a unique Discipline Ability".
 * Each discipline is an ability item carrying its own skill and spells,
 * and the class ability that offers them declares the list. Recognised
 * by what the item DECLARES, not what it is called, the same way a Codex
 * activation is, so a module's chooser needs no code at all.
 */
export function abilityChoicesOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.abilityChoices;
  if (!Array.isArray(raw)) return null;
  const names = raw.map((n) => String(n ?? "").trim()).filter(Boolean);
  return names.length ? names : null;
}

/** The sheet tooltip for a declared chooser. */
export function abilityChoiceHint(item) {
  const names = abilityChoicesOf(item);
  if (!names) return "";
  const recorded = recordedAbilityChoice(item);
  return recorded
    ? `Chosen: ${recorded}.`
    : `Choose one: ${names.join(", ")}.`;
}

/** What this chooser has already handed over, by the stamp it left. */
function recordedAbilityChoice(item) {
  const actor = item?.parent;
  if (!actor?.items) return "";
  const granted = Array.from(actor.items).find(
    (i) => i.type === "ability" && i.flags?.[SYSTEM_ID]?.grantedBy?.sourceId === item.id
  );
  return granted?.name ?? "";
}

/**
 * Offer the list, grant the chosen ability from the (federated)
 * abilities pack — the copy whose `sourceClass` matches the chooser's
 * own, so two classes can both print an "Exorcist" — and stamp it
 * `grantedBy` this item, which is what makes it leave with the chooser
 * and what its own grants (a discipline's specialist spells, its lore
 * skill) run on through the ordinary autogrant path.
 *
 * ONE CHOICE. A second Use reports the recorded one rather than granting
 * another; changing it is deleting the granted ability and choosing
 * again, which the stamp makes safe.
 */
async function useAbilityChoice(actor, item) {
  const names = abilityChoicesOf(item);
  if (!names) return false;
  const recorded = recordedAbilityChoice(item);
  if (recorded) {
    ui.notifications.info(`${item.name}: you chose ${recorded}. Delete it from your sheet to choose again.`);
    return false;
  }
  const picked = await chooseFromList(item.name, "Choose one", names.map((n) => [n, n]));
  if (!picked) return false;
  const pack = contentPack("abilities");
  if (!pack) {
    ui.notifications.warn("The abilities compendium is not available.");
    return false;
  }
  const wantedClass = normalise(item.system?.sourceClass ?? "");
  const index = await pack.getIndex({ fields: ["system.sourceClass"] });
  const candidates = Array.from(index.values()).filter((e) => normalise(e.name) === normalise(picked));
  const entry = candidates.find((e) => normalise(e.system?.sourceClass ?? "") === wantedClass) ?? candidates[0];
  if (!entry) {
    ui.notifications.warn(`${item.name}: "${picked}" is not in the abilities compendium.`);
    return false;
  }
  const data = packItemData(await pack.getDocument(entry._id));
  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
    sourceId: item.id, sourceName: item.name, requested: picked
  });
  await actor.createEmbeddedDocuments("Item", [data]);
  await postCard(actor, item.name, [
    line(`<strong>${picked}</strong> chosen.`),
    line(`<em>It leaves with ${item.name}. Its own grants — a specialist skill, specialist spells — apply as it lands.</em>`)
  ]);
  return true;
}

/** Dispatch a feat's Use action. */
/**
 * Use actions already in flight, keyed by item.
 *
 * Every automation that TOGGLES something reads the current state, then
 * writes — and a second click landing between those two steps sees the
 * stale state and acts on it. Found live at 3.195.0 with Galad-Iar: two
 * quick clicks both took the "not lit" branch and left two light effects
 * behind. Recoverable (the toggle sweeps every match now), but the
 * clicks should simply not race.
 *
 * Guarding here rather than in one handler covers all 137 automations,
 * including every chooser dialog that a double click would otherwise
 * open twice.
 */
const USE_IN_FLIGHT = new Set();

export async function useFeat(actor, item) {
  // The type table wins. An aspect named War must not be driven by a
  // feat that happens to share its name.
  const automation = TYPE_AUTOMATION[item?.type] ?? FEAT_AUTOMATION[normalise(item?.name)];

  // A Creature Codex ability that prints an Action line gets a card of
  // its own cost, trigger and ladder. Checked AFTER the two tables, so a
  // bespoke automation always wins — a Codex ability that later earns
  // real mechanics is not shadowed by this generic one.
  if (!automation) {
    const { hasCreatureActivation, useCreatureAbility } =
      await import("./creature-activation-workflow.mjs");
    if (hasCreatureActivation(item)) {
      const key = `${actor?.id}:${item?.id}`;
      if (USE_IN_FLIGHT.has(key)) return;
      USE_IN_FLIGHT.add(key);
      try {
        return await useCreatureAbility(actor, item);
      } finally {
        USE_IN_FLIGHT.delete(key);
      }
    }
  }

  // A DECLARED CHOICE OF ABILITY (3.563.0) — see abilityChoicesOf. After
  // the tables and the Codex activation for the same reason the
  // activation is: a bespoke automation always wins.
  if (!automation && abilityChoicesOf(item)) {
    const key = `${actor?.id}:${item?.id}`;
    if (USE_IN_FLIGHT.has(key)) return;
    USE_IN_FLIGHT.add(key);
    try {
      return await useAbilityChoice(actor, item);
    } finally {
      USE_IN_FLIGHT.delete(key);
    }
  }

  if (!automation) {
    // A WIRED PASSIVE SAYS WHAT IT DOES. See PASSIVE_AUTOMATION: answering
    // "no automated action" for something that is fully automated reads as
    // unbuilt, and was reported as such off the back of this very message.
    const passive = PASSIVE_AUTOMATION[normalise(item?.name)]
      ?? queuedPassiveAutomation().get(normalise(item?.name));
    if (passive) {
      await postCard(actor, item.name, [line(passive)]);
      return;
    }
    ui.notifications.info(`${item?.name ?? "This feat"} has no automated action — see its description.`);
    return;
  }
  const key = `${actor?.id}:${item?.id}`;
  if (USE_IN_FLIGHT.has(key)) return;
  USE_IN_FLIGHT.add(key);
  try {
    await automation.use(actor, item);
  } finally {
    USE_IN_FLIGHT.delete(key);
  }
}

/**
 * True up every stored-delta grant (PP/HP/BSB per level, Exceptional
 * Training, the archetype class-skill grants) WITHOUT touching daily
 * choices. Called by the daily-prep sweep and by grant cleanup when a
 * feature is removed mid-day, so a deleted War Priest gives its HP back
 * immediately rather than at the next dawn.
 */
/**
 * In-flight reconciliation, per actor.
 *
 * Every stored-delta grant is a read-modify-write against a value that
 * lives on the document: read the flag, read the current stat, write the
 * difference. That is safe exactly as long as two of them never overlap
 * — and they do overlap, because `deleteItem` is a Foundry hook and
 * Foundry does not await hook callbacks.
 *
 * Removing a race deletes the abilities it granted, and each of THOSE
 * deletions re-fires the same hook, so one drag of a race off a sheet
 * starts three reconciliations at once. Two of them read the flag before
 * either had cleared it, but the second read the stat AFTER the first
 * had already written it — so the Orc's -1 racial Power Point was handed
 * back twice, and a character gained a point by losing a race.
 *
 * Chaining per actor makes the later calls see the earlier ones' work,
 * at which point they correctly find nothing left to do. Found in live
 * testing on Graham's world at 3.193.0; the harness could not see it,
 * because it is a property of concurrent hooks rather than of the
 * arithmetic, which was right all along.
 */
const RECONCILE_QUEUES = new Map();

export async function reconcileAllGrants(actor) {
  if (!actor?.id) return [];
  const previous = RECONCILE_QUEUES.get(actor.id) ?? Promise.resolve();
  const run = previous
    .catch(() => {})
    .then(() => reconcileAllGrantsNow(actor));
  // The queued handle swallows failures, so one error can't wedge every
  // later reconciliation for the rest of the session; the caller still
  // gets the real promise and the real rejection.
  const settled = run.catch(() => {});
  RECONCILE_QUEUES.set(actor.id, settled);
  settled.then(() => {
    if (RECONCILE_QUEUES.get(actor.id) === settled) RECONCILE_QUEUES.delete(actor.id);
  });
  return run;
}

async function reconcileAllGrantsNow(actor) {
  const lines = [];
  for (const grant of PP_GRANTS) {
    const summary = await reconcilePPGrant(actor, grant);
    if (summary) lines.push(summary);
  }
  const training = await reconcileExceptionalTraining(actor);
  if (training) lines.push(training);
  for (const grant of CLASS_SKILL_GRANTS) {
    const summary = await reconcileClassSkillGrant(actor, grant);
    if (summary) lines.push(summary);
  }
  const trapFinder = await reconcileTrapFinder(actor);
  if (trapFinder) lines.push(trapFinder);

  return lines;
}

/**
 * Trap Finder (Rogue 1st / Ranger 1st): "+2-circumstance bonus ... If
 * you have 10 or more ranks in the perception skill, your bonus
 * increases to +4."
 *
 * The ability ships its conditionals authored at 2; a conditional's
 * value is static JSON, so the rank-scaled half is TRUED UP here on the
 * actor's own copy — the same shape as Aura of Power's PP grant. Runs
 * whenever grants reconcile (Apply Grants, item removal), which is also
 * when levels and ranks change hands. Symmetric: dropping back below 10
 * ranks (a rebuild) writes the 2 back.
 */
async function reconcileTrapFinder(actor) {
  const { trapFinderValue } = await import("./rogue.mjs");
  const wanted = trapFinderValue(actor.system?.skills?.perception?.ranks ?? 0);
  for (const item of actor.items ?? []) {
    if (item.type !== "ability" || normalise(item.name) !== "trap finder") continue;
    const declared = item.flags?.[SYSTEM_ID]?.conditionals;
    if (!Array.isArray(declared) || !declared.length) continue;
    if (declared.every((entry) => Number(entry?.value) === wanted)) return null;
    await item.update({
      [`flags.${SYSTEM_ID}.conditionals`]: declared.map((entry) => ({ ...entry, value: wanted }))
    });
    return `Trap Finder's bonus is <strong>+${wanted}</strong> (${wanted === 4 ? "10+ Perception ranks" : "below 10 Perception ranks"}).`;
  }
  return null;
}

/**
 * Daily preparation sweep: remove yesterday's daily-prep feat choices and
 * true up level-scaled grants. Returns report lines for the daily-prep card.
 */
export async function sweepFeatDailyPrep(actor) {
  const lines = [];

  const stale = Array.from(actor.effects ?? [])
    .filter((e) => e.getFlag?.(SYSTEM_ID, DAILY_PREP_FLAG));
  if (stale.length) {
    const names = stale.map((e) => e.name);
    await actor.deleteEmbeddedDocuments("ActiveEffect", stale.map((e) => e.id));
    lines.push(`Daily choices reset: ${names.join(", ")} — pick again from the feat's Use button.`);
  }

  lines.push(...await reconcileAllGrants(actor));

  // Guiding Fortune raises Luck of the Small Folk to 2/day via bonusUses.
  const lotsf = actor.items.find(
    (i) => i.type === "feat" && normalise(i.name) === "luck of the small folk"
  );
  if (lotsf) {
    const hasGuiding = actor.items.some(
      (i) => i.type === "feat" && normalise(i.name) === "guiding fortune"
    );
    const desired = hasGuiding ? 1 : 0;
    if (Number(lotsf.system.bonusUses ?? 0) !== desired) {
      await lotsf.update({ "system.bonusUses": desired });
      lines.push(`Luck of the Small Folk: ${desired ? "2 uses/day (Guiding Fortune)" : "back to 1 use/day"}.`);
    }
  }

  return lines;
}

/**
 * Where a stored-delta grant's flag disagrees with the field it wrote to.
 *
 * NEW at 3.433.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO SEE.
 *
 * Graham, 29 August 2026: "Sharuk-Xal should be granting +1PP per level
 * but the 3rd level bard is only gaining a +2 bonus to PP."
 *
 * The grants were innocent. Grokash Hervik's flags recorded exactly the
 * right amounts — `orcRacialPPGranted: -3` and
 * `sharukxalHeritagePPGranted: +6`, netting the +1 per level his
 * heritage owes — while `pp.base` held 2. A point had gone missing
 * BETWEEN the record and the field. Merrick Thorne was worse: Aura of
 * Power recorded +3 against a base of 0, so the whole grant was gone.
 *
 * AND NOTHING COULD EVER NOTICE. `reconcilePPGrant` opens with
 * `if (granted === due) return null` — the flag is the only record of
 * what was applied, so once the field drifts from it the pass agrees
 * with itself for ever and re-applies nothing. The bookkeeping is
 * self-consistent and wrong, which is the worst shape a ledger can take.
 *
 * HOW IT DRIFTED. Almost certainly the migration of 26 August 2026 that
 * reset `system` to template defaults on every player sheet: flags live
 * OUTSIDE `system` and survived it, so every stored-delta grant in the
 * world came out claiming to have been applied to a field that no longer
 * held it. See claude/incident-2026-08-26.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT INFERRED.
 *
 * The invariant is `field = the player's own value + Σ recorded`. The
 * player's own value is not recorded anywhere, so this cannot be solved
 * exactly — but it can be BOUNDED. A field lower than the sum of the
 * positive record is missing points no matter what the player typed,
 * because their own contribution cannot be negative.
 *
 * So this reports the SHORTFALL and never a surplus: a field ABOVE the
 * sum is a player who typed a base of their own, which is theirs to keep
 * and none of this pass's business.
 *
 * @param {Actor} actor
 * @param {Array} grants the PP_GRANTS rows to audit
 * @returns {Array<{path: string, recorded: number, field: number, short: number}>}
 */
export function storedDeltaShortfall(actor, grants = PP_GRANTS) {
  const byPath = new Map();
  for (const grant of grants) {
    const path = grant.path ?? "system.resources.pp.base";
    const recorded = Number(actor?.getFlag?.(SYSTEM_ID, grant.flag) ?? 0);
    if (!recorded) continue;
    byPath.set(path, (byPath.get(path) ?? 0) + recorded);
  }
  const out = [];
  for (const [path, recorded] of byPath) {
    // A NET-NEGATIVE RECORD OWES NOTHING. An Orc whose only grant is -1
    // per level has a field legitimately below zero-plus-nothing; there
    // is no shortfall to find and topping it "up" would hand them points.
    if (recorded <= 0) continue;
    const field = Number(storedValue(actor, path)) || 0;
    if (field >= recorded) continue;
    out.push({ path, recorded, field, short: recorded - field });
  }
  return out;
}
