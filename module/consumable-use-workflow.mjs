/**
 * Using a consumable, wired up (Chapter 11).
 *
 * `consumable-use.mjs` holds the rule; this is the Foundry side. The
 * shape follows the one the Cleric's Channels established
 * (feats-workflow, "channels"): find the spell, make an innate copy of
 * it, hand it to `castSpell`, and only then spend the resource. That
 * order matters — a cancelled cast must not eat the potion.
 *
 * THE SPELL DOCUMENT IS TEMPORARY, AND DELIBERATELY SO.
 *
 * Channels keeps its copy embedded on the actor, because a Cleric has
 * Channels every day and the copy is worth reusing. A potion is drunk
 * once and the bottle is thrown away. Embedding a spell for it would
 * leave one of two messes: an orphan spell item on the sheet after the
 * potion is gone, or a `deleteItem` cascade that removes the spell out
 * from under the effects it just created. So the copy is built with
 * `new Item.implementation(data, {parent: actor})` — a real document
 * with a real `system`, never written to the database, gone when this
 * function returns.
 *
 * That is safe because of exactly what `castSpell` does with the spell
 * document: it reads `system`, `name` and `getFlag`, and it only ever
 * calls `spell.update()` on the innate per-day-uses path, which is
 * gated on `system.usesPerDay` — left blank here for that reason. The
 * one thing that outlives the call is `spell.uuid`, written as the
 * `origin` of any ActiveEffect the spell applies; nothing in this
 * system resolves an effect's origin (grep `fromUuid` — every caller
 * is an actor or a party member), so a dangling one is cosmetic. If
 * that ever stops being true, this is the line that has to change.
 */

import { ingestRefusal } from "./conditions/condition-rules.mjs";
import {
  consumableEffectRef, consumableKind, consumableMode, consumableSaveDC,
  chosenConsumableEffects, consumableSpellRef, consumableTraitRefusal, consumableUsable, consumableUseRule, consumeOneUse, drunkSpellTargeting
} from "./consumable-use.mjs";
import { casterContext, rollReleaseCheck } from "./charged-items-workflow.mjs";
import { aggregateWarpSelection } from "./magic/spell-warp.mjs";
import { componentGate } from "./magic/component-gate.mjs";
import { contentPack } from "./content-packs.mjs";
import {
  CONSCIOUS_WHILE_DYING_FLAG, activationCastTime, activationCost, isAlchemicalConsumable, nearbyRecipient, recipientMode, scaledAlchemicalEffect
} from "./elixirs.mjs";
import { isBomb } from "./alchemical.mjs";
import { poisonAfflictionOf } from "./poisons.mjs";
import { usePoison } from "./poison-workflow.mjs";
import { oilOf } from "./oils.mjs";
import { consumableSpecialOf } from "./consumable-specials.mjs";
import { useOil } from "./oil-workflow.mjs";

const SYSTEM_ID = "trg-prime";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * The source spell for a consumable: the actor's own copy first (a
 * house-ruled spell should win over the printed one), then the stored
 * UUID, then the compendium by name.
 *
 * The UUID is second rather than first on purpose. It is the precise
 * answer, but a world that has edited its Fireball wants THAT Fireball
 * out of its potions, and matching the name is how every other lookup
 * in this system expresses that preference (spellTraditionFor,
 * Channels, the rune spell grants).
 */
async function resolveSpellSource(actor, ref) {
  const wanted = String(ref.name ?? "").trim().toLowerCase();
  if (wanted) {
    const owned = Array.from(actor?.items ?? []).find(
      (i) => i.type === "spell" && String(i.name).trim().toLowerCase() === wanted
    );
    if (owned) return owned.toObject();
  }
  if (ref.uuid) {
    const resolve = foundry.utils?.fromUuid ?? globalThis.fromUuid;
    try {
      const doc = await resolve(ref.uuid);
      if (doc?.type === "spell") return doc.toObject();
    } catch (_e) {
      /* the compendium moved or the entry went — fall through to the name */
    }
  }
  const pack = contentPack("spells");
  if (!pack || !wanted) return null;
  const index = await pack.getIndex();
  const entry = Array.from(index.values()).find(
    (e) => String(e.name).trim().toLowerCase() === wanted
  );
  if (!entry) return null;
  const source = await pack.getDocument(entry._id);
  return source?.toObject() ?? null;
}

/**
 * A spell-shaped document for a consumable that has no spell.
 *
 * `applySpellEffects` and the whole of `castSpell` want a spell; the
 * Potion of Cure has a heal formula and a name. Rather than a second
 * resolver that would drift from the first, the item's own effect is
 * dressed as a spell — 0 PP, innate, already prepared, its `effects`
 * carried straight across — and goes down the identical path. Every
 * field below is a default that makes the shared resolution do nothing
 * it should not: no components to gate, no save to roll, no area to
 * place, no target to prompt for.
 */
export function syntheticSpellData(item, effect) {
  return {
    name: effect.label || item.name,
    type: "spell",
    img: item.img,
    system: {
      tradition: "",
      category: "utility",
      level: 0,
      ppCost: 0,
      castAP: 2,
      range: "",
      area: "",
      targets: "",
      duration: effect.duration,
      defence: "",
      baseDamage: "",
      damage: { formula: "", type: "", persistent: "" },
      casterLevelMods: [],
      effects: effect.effects,
      warps: [],
      apOptions: [],
      prepared: true,
      sustained: false,
      sustainType: "",
      areaTargeting: "all",
      specialist: false,
      innate: true,
      components: { somatic: false, verbal: false, material: false, focus: false },
      traits: item.system?.traits ?? "",
      description: item.system?.description ?? ""
    },
    // A DOSE DRESSED AS A SPELL SAYS SO (3.630.1, F4 — found on the retest):
    // the resolver's "the spell is spent" read `type`, which is "spell" here
    // by construction. A flag survives the data model where a system field
    // might not.
    flags: { [SYSTEM_ID]: { syntheticConsumable: true } }
  };
}

/**
 * Build the temporary innate spell the item releases.
 *
 * Everything set here is a statement about the ITEM rather than about
 * whoever is holding it — see the `itemCast` note in cast-workflow for
 * why each one is needed.
 */
function buildItemSpell(actor, item, data, ref, saveDC = { dc: null, source: "" }, { apPaid = false, drunk = false } = {}) {
  data.system.innate = true;
  // Blank: this copy tracks no per-day uses. Non-blank would send
  // castSpell down `spell.update()`, which a document that was never
  // written cannot do.
  data.system.usesPerDay = "";
  data.system.usesValue = null;
  // NOT `prepared = true`, though a potion is plainly not memorised.
  // `canCastSpell` reads `if (innate) return true` before it looks at
  // `prepared` at all, so setting it here would be a second statement of a
  // rule already made above — and a second statement is what let the innate
  // PP exemption hide behind itself until 3.309.0 (see the `totalPP` note in
  // cast-workflow). Checked by mutation: forcing it false changes nothing.
  // A FIXED DC ONLY WHERE THE ITEM ACTUALLY OWNS ONE. `null` means "the
  // ordinary formula stands", which is how "a scroll's Save DC is the
  // caster's" is implemented — by not overriding it. Writing a number
  // here in that case would be a second statement of a rule cast-workflow
  // already makes, and the two would drift. See `consumableSaveDC`.
  if (saveDC.dc !== null) data.system.fixedSaveDC = saveDC.dc;

  /*
   * THE ITEM'S OWN ACTIVATION IS WHAT USING IT COSTS (3.614.1, F3 of the
   * 3.614.0 drive). The spell inside a potion is not cast by the drinker:
   * "Interact (2 AP)" is the time it takes, whatever the spell prints. Until
   * now the released spell charged its own cast time — 2 AP for every effect
   * a consumable carries (so a Bountiful Fruit or a Goodberry, "Interact
   * (1 AP)", cost 2), and "1 minute" for a Potion of Water Breathing or of
   * Gaseous Form, which then could not be drunk in an encounter at all.
   * A SCROLL IS READ, and reading one takes the spell's own casting time;
   * an item that prints no activation (a wand, a staff) keeps the spell's.
   */
  const printedTime = consumableKind(item) === "scroll" ? null : activationCastTime(item?.system?.activation);
  if (printedTime) data.system.castAP = printedTime;
  // ALREADY PAID (3.617.0, R1): a potion's activation is paid by whoever
  // drinks or feeds it, before the spell is cast by the one it reaches.
  if (apPaid) data.system.castAP = "free";
  // AIMED AT ITS DRINKER (3.617.0, R1) — see `drunkSpellTargeting`.
  if (drunk) Object.assign(data.system, drunkSpellTargeting(data.system));

  // The warp the maker paid for, re-aggregated into the same shape an
  // interactive warp produces so the resolution cannot tell them apart.
  const warp = ref.warp?.form
    ? aggregateWarpSelection(data.system?.warps, ref.warp.form)
    : null;

  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.itemCast`, {
    itemName: item.name,
    itemId: item.id,
    kind: consumableKind(item),
    pp: ref.pp,
    casterLevel: ref.pp,
    // What the card should say about where the Save DC came from, so the
    // number on the table is never unexplained. Empty when nothing rolls
    // a save at all.
    saveDCSource: saveDC.source ?? "",
    warp: warp ? { mods: warp.mods, notes: warp.notes } : null,
    // DRUNK, NOT CAST (3.617.0, R1): drinking a potion is not casting a
    // spell, so a Rage, a lost voice or a full pair of hands does not stop
    // it — see the gates in cast-workflow.
    consumed: Boolean(drunk)
  });
  // A temporary document. See this file's header for why it is never
  // created on the actor.
  return new Item.implementation(data, { parent: actor });
}

/**
 * Release a spell from an item — the one path both consumables and charged
 * items take.
 *
 * A WAND AND A POTION ASK THE SAME QUESTION of this system: build the spell
 * the item carries, decide whose Save DC it uses, and hand it to `castSpell`
 * marked as an item cast. Before 3.312.0 only the consumable side existed and
 * `castFromChargedItem` posted a card naming the check it would have rolled —
 * so a wand described a spell instead of casting one. Rather than grow a
 * second copy of the resolve/DC/build sequence over there, it is exported
 * from here and called from both. One resolver, two callers.
 *
 * @param {Actor} actor
 * @param {Item} item The physical item — potion, scroll, wand, staff.
 * @param {{name:string, uuid:string, pp:number, warp:object|null}} ref
 * @param {object} [options]
 * @param {string} [options.kind] The consumable kind, where there is one.
 *   Only "scroll" changes anything (see `consumableSaveDC`).
 * @param {object|null} [options.data] Pre-resolved spell data, for the effect
 *   mode where the "spell" is synthesised from the item's own printed effect.
 * @param {object|null} [options.itemCheck] The already-rolled release check,
 *   which for an attack spell is also the attack roll.
 * @returns {Promise<{cast:boolean, missing:boolean, result:object|null, saveDC:object|null}>}
 */
export async function releaseItemSpell(actor, item, ref, {
  kind = "",
  data = null,
  itemCheck = null,
  apPaid = false,
  drunk = false,
  presetTargets = false,
  // A DC THE ITEM PRINTS (3.618.0, R15): Da Big Itter's "Fear (DC 20)".
  fixedDC = null
} = {}) {
  const source = data ?? await resolveSpellSource(actor, ref);
  if (!source) return { cast: false, missing: true, result: null, saveDC: null };

  const context = casterContext(actor);
  const saveDC = Number(fixedDC) > 0 ? { dc: Number(fixedDC), source: "printed on the item" } : consumableSaveDC({
    kind,
    // The item's own level, which is what Graham's default-DC rule names.
    // For a consumable that is the spell's PP by construction; for a wand it
    // is the wand's level, which is not the same number.
    itemLevel: Number(item?.system?.itemLevel ?? ref.pp ?? 0),
    spellDefence: source.system?.defence ?? "",
    isCaster: context.isCaster,
    spellTradition: source.system?.tradition ?? "",
    skillTotals: context.skillTotals
  });

  const spell = buildItemSpell(actor, item, source, ref, saveDC, { apPaid, drunk });
  const { castSpell } = await import("./magic/cast-workflow.mjs");
  const result = await castSpell(actor, spell, { itemCheck, presetTargets });
  return { cast: Boolean(result), missing: false, result, saveDC };
}

/**
 * Reading a scroll: which check, and did it work.
 *
 * The ladder is `castFromItemOptions` — the same one a wand offers,
 * because it is the same question ("you did not write this; can you read
 * it back?"). Unavailable paths are shown WITH their reason and are
 * still selectable, matching how this system reports rather than
 * enforces everywhere a GM might overrule it.
 *
 * WHETHER A FAILED READING BURNS THE SCROLL is settled by
 * `castingOutcome`, the system's own answer to what a degree costs:
 * anything that casts spends it, a Partial spends nothing (the reading
 * falters and the page survives), and a Failure or worse spends it.
 * That is an inference from the PP rule rather than a quoted line about
 * scrolls — flagged as one, in one place, so it is a one-line change if
 * Graham rules otherwise.
 *
 * @returns {Promise<{cast:boolean, spend:boolean, lines:string[]}|null>}
 */
async function readScrollCheck(actor, item, ref) {
  // THE SAME LADDER, ROLLED THE SAME WAY. This used to be its own copy of
  // the dialog-and-roll, sitting a few hundred lines from the wand's — which
  // was fine while the wand's did not exist. Now that a charged item really
  // releases spells, two copies would be two places for the release rule to
  // drift, so both go through `rollReleaseCheck`.
  const release = await rollReleaseCheck(actor, {
    itemName: item.name,
    spellName: ref.name,
    pp: ref.pp,
    title: `${item.name} — Read the Scroll`,
    icon: "fa-solid fa-scroll",
    hint: "An unavailable path is still offered — the GM may allow the attempt. A Partial leaves the scroll intact; anything worse spends it."
  });
  if (!release) return null;

  const { check, degree, outcome } = release;
  const lines = [];
  if (outcome.cast) {
    lines.push(line(`<strong>The scroll reads true.</strong> ${esc(ref.name)} is released.`));
  } else if (degree === "partial") {
    lines.push(line("<strong>The reading falters</strong> — the scroll is unharmed and may be tried again."));
  } else {
    lines.push(line("<strong>The reading fails</strong> and the scroll is spent."));
  }

  // THE SPELL FUMBLE TABLE IS NOT ROLLED HERE ANY MORE. It used to be, and
  // the wand path had no equivalent — so a Fumble on the identical roll gave
  // a scroll the table and a wand nothing. `rollReleaseCheck` now rolls it
  // for both, which is the only arrangement in which the two cannot drift.
  // Rolling it again here would roll it twice.

  // THE READING CHECK IS ALSO THE ATTACK ROLL, when the spell is an attack.
  // Graham, 14 Aug 2026, asked whether releasing from an item should roll
  // once or twice: "Yes — the release check is the attack." That matches
  // what an ordinary cast already does — `resolveSpellAttack` compares the
  // Cast a Spell check's own total against the target's Defence Bonus, so a
  // caster's attack roll IS their casting roll — and it is the literal
  // reading of "the user's own spell attack value". Handed back rather than
  // dropped, and passed to `castSpell` as `itemCheck`.
  return { cast: outcome.cast, spend: outcome.cast || outcome.ppSpent > 0, lines, check };
}

/**
 * Use a consumable: drink the potion, apply the unguent, read the
 * scroll.
 *
 * @returns {Promise<{used:boolean, cast:boolean, remaining:number}|null>}
 */
export async function useConsumable(actor, item) {
  const { usable, reason } = consumableUsable(item);
  if (!usable) {
    ui.notifications.warn(`${item.name} cannot be used: ${reason}.`);
    return null;
  }

  // AN ELIXIR IS NOT A SPELL IN A BOTTLE (3.577.0). See elixirs.mjs: the
  // alchemical items go their own way, and a bomb is thrown, not used.
  // A POISON BECOMES AN AFFLICTION (3.578.0, the block-18 audit's R1): it
  // coats a weapon or reaches a creature — see poison-workflow.mjs.
  if (poisonAfflictionOf(item)) return usePoison(actor, item);
  // AN OIL GOES ON SOMETHING (3.578.0, D8) — see oil-workflow.mjs.
  if (oilOf(item)) return useOil(actor, item);
  // A PEARL, A BANDAGE, A PAIR OF GLOVES (3.617.0, block 37) — the other
  // consumables that do something. See consumable-specials.mjs.
  if (consumableSpecialOf(item)) {
    const { useSpecialConsumable } = await import("./consumable-specials-workflow.mjs");
    return useSpecialConsumable(actor, item);
  }
  // SICKENED (3.621.0; Appendix 2, block 39's R7): "you cannot willingly
  // ingest anything while sickened." A potion or an elixir — anything drunk
  // or carrying the Ingested trait — taken by the sickened creature itself.
  // Feeding it to somebody else is not the drinker ingesting it.
  {
    const ingested = consumableUseRule(consumableKind(item)).drunk === true
      || /\b(ingested|elixir)\b/i.test(String(item?.system?.traits ?? ""));
    const toAnother = Array.from(game.user?.targets ?? []).some((t) => t?.actor && t.actor.id !== actor.id);
    const refused = ingested && !toAnother ? ingestRefusal(actor.conditions?.effective) : "";
    if (refused) {
      ui.notifications.warn(`${item.name}: ${refused}.`);
      return null;
    }
  }
  if (isAlchemicalConsumable(item) && !isBomb(item)) return useAlchemical(actor, item);

  const kind = consumableKind(item);
  const rule = consumableUseRule(kind);
  const mode = consumableMode(item);

  // WHAT IT RELEASES, in one of three shapes — a compendium spell, its own
  // printed effect, or nothing but its description. `ref` is the common
  // ground: a name and the PP the item was made at, which is all the card
  // and the Save DC need.
  let ref = null;
  let data = null;
  if (mode === "spell") {
    ref = consumableSpellRef(item);
    data = await resolveSpellSource(actor, ref);
    if (!data) {
      ui.notifications.warn(
        `${item.name} carries "${ref.name}", which is not in this world or its spell compendium.`
      );
      return null;
    }
  } else if (mode === "effect") {
    const effect = consumableEffectRef(item);
    ref = { name: effect.label || item.name, uuid: "", pp: effect.pp, warp: null };
    // WHICH OF ITS EFFECTS (3.626.0): asked before anything is paid.
    let choice = -1;
    if (effect.choose?.length) {
      const { DialogV2 } = foundry.applications.api;
      const picked = await DialogV2.wait({
        window: { title: `${item.name} — Choose one` },
        classes: ["trg-prime"],
        content: `<div class="trg-prime trg-check-dialog"><p>${esc(item.name)} offers a choice:</p>${effect.choose.map((c, i) => `<div class="form-group"><label><input type="radio" name="choice" value="${i}"${i === 0 ? " checked" : ""}> ${esc(c.label || `Option ${i + 1}`)}</label></div>`).join("")}</div>`,
        buttons: [
          { action: "ok", label: "Use", callback: (_e, button) => String(button.form?.elements?.choice?.value ?? "0") },
          { action: "cancel", label: "Cancel" }
        ],
        rejectClose: false
      });
      if (picked === null || picked === undefined || picked === "cancel") return null;
      choice = Number(picked) || 0;
    }
    data = syntheticSpellData(item, { ...effect, effects: chosenConsumableEffects(effect, choice) });
    data.system.consumableRequiresTrait = effect.requiresTrait;
  } else {
    ref = {
      name: item.name,
      uuid: "",
      pp: Math.max(0, Math.floor(Number(item.system?.itemLevel ?? 0))),
      warp: null
    };
  }

  // COMPONENTS BEFORE THE READING, not after it (3.325.1).
  //
  // The component gate lives inside `castSpell`, which for a scroll runs
  // AFTER the reading check has already decided the page is spent. Until
  // 3.325.0 that could not bite, because an item cast skipped the gate
  // entirely. The moment scrolls started honouring their components
  // (Graham's ruling, 17 Aug 2026) the ordering became visible, and it was
  // ugly: live on 17 Aug a Bard with a greatsword in both hands read a
  // Scroll of Alarm, rolled a Success, watched the card say "The scroll
  // reads true. Alarm is released" — and got nothing at all, because the
  // gate then refused the somatic component. The scroll was gone, the
  // spell never happened, and the card said otherwise.
  //
  // So the gate is asked here, before a die is rolled, exactly as every
  // other pre-cast gate is: "Gated before any PP/AP is committed". The
  // material clause is waived because the scroll supplies it. `castSpell`
  // still runs its own copy — this is a cheaper refusal in front of it,
  // not a replacement, and the two agree because they are the same call.
  if (rule.needsCheck && data && !componentGate(
    actor, data.system ?? {}, ref.name, { materialProvided: true }
  )) return null;

  /*
   * A DESCRIPTION-ONLY ITEM STILL TAKES ITS PRINTED TIME (3.617.0, B5 of
   * block 37). The description path never asked: a one-minute item was
   * used mid-combat for nothing, and Tumbling cost no AP at all.
   */
  if (mode === "description" && !rule.needsCheck) {
    const cost = activationCost(item.system?.activation, { inCombat: Boolean(game.combat?.started) });
    if (!cost.allowed) {
      ui.notifications.warn(`${item.name} ${cost.reason}.`);
      return null;
    }
    if (cost.ap > 0) {
      const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      if (!await ensureActionPoints(actor, cost.ap, item.name)) return null;
      await spendActionPoints(actor, cost.ap, item.name);
    }
  }

  // The check comes FIRST for a scroll, because a failed reading never
  // reaches the spell at all — and because a scroll spent on a failure is
  // spent whether or not anything was cast.
  let scroll = null;
  if (rule.needsCheck) {
    scroll = await readScrollCheck(actor, item, ref);
    if (!scroll) return null;
  }

  /*
   * A POTION REACHES ITS DRINKER (3.617.0, Graham's R1 of block 37). Who:
   * you, or the one targeted creature within reach — the same question an
   * elixir asks (`recipientMode`). The activation is the drinker's or the
   * feeder's, paid here; the spell is then cast BY the creature it reaches,
   * aimed at itself, so its "self" rows and its "targets" rows agree.
   */
  let drink = null;
  if (rule.drunk && data) {
    const targets = Array.from(game.user?.targets ?? []);
    const ownToken = actor.getActiveTokens?.()?.[0] ?? null;
    const only = targets.length === 1 ? targets[0] : null;
    let distance = null;
    if (only && ownToken && only.document?.id !== ownToken.document?.id) {
      const { distanceBetween } = await import("./combat/geometry.mjs");
      distance = distanceBetween(ownToken, only);
    }
    const who = recipientMode({
      targetCount: targets.length,
      targetIsSelf: Boolean(only && ownToken && only.document?.id === ownToken.document?.id) || only?.actor?.id === actor.id,
      distance
    });
    if (who.mode === "refuse") {
      ui.notifications.warn(`${item.name}: ${who.reason}.`);
      return null;
    }
    const recipient = who.mode === "fed" ? only.actor : actor;
    const recipientToken = who.mode === "fed" ? only : ownToken;
    // A TRAIT THE RECIPIENT MUST HAVE (3.626.0) — refused before anything is paid.
    if (data?.system?.consumableRequiresTrait) {
      const { creatureTraits } = await import("./creature-traits.mjs");
      const refusal = consumableTraitRefusal({ requiresTrait: data.system.consumableRequiresTrait }, creatureTraits(recipient.system ?? {}).join(", "), recipient.name);
      if (refusal) { ui.notifications.warn(`${item.name}: ${refusal}`); return null; }
    }
    const inCombat = Boolean(game.combat?.started);
    const cost = activationCost(item.system?.activation, { inCombat });
    if (!cost.allowed) {
      ui.notifications.warn(`${item.name} ${cost.reason}.`);
      return null;
    }
    if (cost.ap > 0) {
      const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
      if (!await ensureActionPoints(actor, cost.ap, item.name)) return null;
      await spendActionPoints(actor, cost.ap, item.name);
    }
    drink = { recipient, recipientToken, fed: who.mode === "fed", ap: cost.ap, time: cost.time };
  }

  let castResult = null;
  if (data && (!rule.needsCheck || scroll.cast)) {
    // `data` is already resolved above, so it is handed straight over —
    // this call is here for the Save DC and the temporary spell document,
    // both of which are the same work a wand needs.
    let released;
    if (drink) {
      // THE DRINKER IS THE ONE TARGET for the length of the cast, and the
      // player's own targets come back afterwards.
      const previous = Array.from(game.user?.targets ?? []);
      const aim = drink.recipientToken;
      const setTargets = (tokens) => {
        const wanted = new Set(tokens.map((t) => t.id));
        for (const t of canvas?.tokens?.placeables ?? []) {
          if (t.isTargeted !== wanted.has(t.id)) t.setTarget(wanted.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
        }
      };
      try {
        if (aim) setTargets([aim]);
        released = await releaseItemSpell(drink.recipient, item, ref, {
          kind, data, itemCheck: null, apPaid: true, drunk: true, presetTargets: Boolean(aim)
        });
      } finally {
        if (aim) setTargets(previous);
      }
      // NOTHING TAKEN, NOTHING PAID: the activation comes back too.
      if (!released.result && drink.ap > 0) {
        const { refundActionCost } = await import("./combat/action-points-workflow.mjs");
        await refundActionCost(actor, drink.ap);
      }
    } else {
      // A TRAIT THE RECIPIENT MUST HAVE, ON THIS PATH TOO (3.626.1; found live
      // on 0.8.0: Embalmer's Black Resin, an `other`, healed a living Cleric).
      // The gate above sits inside the potion branch; an `other` or an
      // unguent reaches its effect's "self" rows through the user and its
      // "targets" rows through the user's targets, so both are asked.
      if (data?.system?.consumableRequiresTrait) {
        const { creatureTraits } = await import("./creature-traits.mjs");
        const rows = Array.isArray(data.system?.effects) ? data.system.effects : [];
        const recipients = [];
        if (!rows.length || rows.some((row) => String(row?.target ?? "self") === "self")) recipients.push(actor);
        if (rows.some((row) => String(row?.target ?? "") === "targets")) {
          for (const token of game.user?.targets ?? []) if (token.actor) recipients.push(token.actor);
        }
        for (const recipient of recipients) {
          const refusal = consumableTraitRefusal({ requiresTrait: data.system.consumableRequiresTrait }, creatureTraits(recipient.system ?? {}).join(", "), recipient.name);
          if (refusal) { ui.notifications.warn(`${item.name}: ${refusal}`); return null; }
        }
      }
      released = await releaseItemSpell(actor, item, ref, {
        kind,
        data,
        itemCheck: scroll?.check ?? null
      });
    }
    castResult = released.result;
    // NO CAST, NO COST. A cancelled target prompt, a refused trait gate or
    // a Rage that forbids spells all return null, and none of them should
    // have swallowed the potion. A scroll whose CHECK already failed is
    // the exception: that one is spent by the failure itself, below.
    if (!castResult && !rule.needsCheck) return null;
  }

  const spend = rule.needsCheck ? scroll.spend : true;
  let after = {
    uses: Number(item.system?.uses?.value ?? 1),
    quantity: Number(item.system?.quantity ?? 1),
    destroy: false,
    spent: false
  };
  if (spend) {
    after = consumeOneUse({
      uses: item.system?.uses?.value,
      max: item.system?.uses?.max,
      quantity: item.system?.quantity
    });
  }

  const lines = [
    line(drink?.fed
      ? `<strong>${esc(actor.name)} feeds ${esc(item.name)} to ${esc(drink.recipient.name)}</strong>${mode === "spell" ? ` — ${esc(ref.name)} at ${ref.pp} PP` : ""}.`
      : mode === "spell"
        ? `<strong>${esc(actor.name)} ${rule.verb.toLowerCase()}s ${esc(item.name)}</strong> — ${esc(ref.name)} at ${ref.pp} PP.`
        : `<strong>${esc(actor.name)} ${rule.verb.toLowerCase()}s ${esc(item.name)}</strong>.`),
    ...(drink?.time ? [line(`<em>${esc(item.system?.activation ?? drink.time)}${drink.ap ? ` — ${drink.ap} AP` : ""}.</em>`)] : []),
    ...(scroll?.lines ?? [])
  ];
  // The description path has nothing else to say, so it says the item's own
  // words — which is what the GM has to apply by hand.
  if (mode === "description" && (!rule.needsCheck || scroll.cast)) {
    lines.push(line(item.system?.description || "No effect is recorded on this item yet — open it and give it a spell, or an effect."));
  }
  if (spend) {
    lines.push(after.destroy
      ? line(`The last of it is gone — ${esc(item.name)} is removed from the sheet.`)
      : line(`${after.quantity} remaining${after.uses > 1 ? `, ${after.uses} uses in the open one` : ""}.`));
  }
  await postCard(actor, `${item.name} — ${rule.verb}`, lines);

  if (spend) {
    if (after.destroy) await item.delete();
    else {
      await item.update({
        "system.quantity": after.quantity,
        "system.uses.value": after.uses
      });
    }
  }

  return { used: true, mode, cast: Boolean(castResult), remaining: after.quantity };
}

/* ─────────────────────────── alchemical items ───────────────────────── */

/**
 * Drink, apply or feed an alchemical item (Chapter 6, pages 178-180).
 *
 * NEW at 3.577.0 (block 17, D7 and D8; Graham's R7). The rules are in
 * elixirs.mjs; this is the order they happen in, and every refusal comes
 * before anything is spent:
 *
 *   1  which use, when the item has two (Angelstep: raw or pigment)
 *   2  who for — you, or the ONE targeted creature within reach
 *   3  the printed activation: its AP, or a refusal if it cannot fit
 *      inside an encounter
 *   4  the effect, through `applySpellEffects` — the spell engine's own
 *      resolver, but not `castSpell`, because drinking is not casting
 *   5  what the engine does not do: a bonus that waits, a new save, waking
 *   6  one use spent, and the card
 */
async function useAlchemical(actor, item) {
  const { DialogV2 } = foundry.applications.api;
  const authored = item?.flags?.[SYSTEM_ID]?.consumable?.effect ?? null;

  // 1. WHICH USE.
  let mode = "";
  if (Array.isArray(authored?.modes) && authored.modes.length > 1) {
    const rows = authored.modes.map((m, i) => `<label style="display:flex;gap:8px;align-items:flex-start;padding:2px 0">`
      + `<input type="radio" name="mode" value="${esc(m.key)}"${i === 0 ? " checked" : ""}><span>${esc(m.label ?? m.key)}</span></label>`).join("");
    mode = await DialogV2.wait({
      window: { title: item.name, icon: "fa-solid fa-leaf" },
      classes: ["trg-prime"],
      position: { width: 440 },
      content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
      buttons: [
        { action: "use", label: "Use", icon: "fa-solid fa-check", default: true,
          callback: (event, button) => button.form?.querySelector?.('input[name="mode"]:checked')?.value ?? "" },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!mode || mode === "cancel") return null;
  }

  // 2. WHO FOR.
  const targets = Array.from(game.user?.targets ?? []);
  const ownToken = actor.getActiveTokens?.()?.[0] ?? null;
  const only = targets.length === 1 ? targets[0] : null;
  let distance = null;
  if (only && ownToken && only.document?.id !== ownToken.document?.id) {
    const { distanceBetween } = await import("./combat/geometry.mjs");
    distance = distanceBetween(ownToken, only);
  }
  // An item that reaches the creatures AROUND you (Nightsage) is lit where
  // you stand, whoever is targeted.
  const who = authored?.nearby ? { mode: "self" } : recipientMode({
    targetCount: targets.length,
    targetIsSelf: Boolean(only && ownToken && only.document?.id === ownToken.document?.id) || only?.actor?.id === actor.id,
    distance
  });
  if (who.mode === "refuse") {
    ui.notifications.warn(`${item.name}: ${who.reason}.`);
    return null;
  }
  const fed = who.mode === "fed";
  const recipient = fed ? only.actor : actor;

  // A COATING NEEDS A WEAPON IN HAND (3.630.1, F7 of the 3.630.0 live test).
  // Rose of Thorns used with no weapon wielded spent the dose and printed
  // "no weapon was chosen — nothing applied". Refused here, before the AP
  // and the dose, as Talon Strike's cast is refused before its PP.
  const coats = (Array.isArray(authored?.effects) ? authored.effects : [])
    .some((row) => row?.kind === "strikeRider" && row.weaponScoped && (row.target ?? "self") === "self");
  if (coats) {
    const { enchantableWeapons } = await import("./magic/strike-riders.mjs");
    if (!enchantableWeapons(Array.from(recipient.items ?? [])).length) {
      ui.notifications.warn(`${item.name}: ${recipient.name} is wielding no weapon to coat — equip one first. The dose is kept.`);
      return null;
    }
  }

  // 3. THE PRINTED ACTIVATION.
  const inCombat = Boolean(game.combat?.started);
  const cost = activationCost(item.system?.activation, { inCombat });
  if (!cost.allowed) {
    ui.notifications.warn(`${item.name} ${cost.reason}.`);
    return null;
  }
  if (cost.ap > 0) {
    const { spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    await spendActionPoints(actor, cost.ap, item.name);
  }

  // 4. THE EFFECT.
  const scaled = scaledAlchemicalEffect(item, { mode, fed });
  const lines = [line(fed
    ? `<strong>${esc(actor.name)}</strong> feeds ${esc(item.name)} to <strong>${esc(recipient.name)}</strong>`
      + `${Number(item.system?.itemLevel) > 0 ? ` (level ${Number(item.system.itemLevel)})` : ""}.`
    : `<strong>${esc(actor.name)}</strong> uses ${esc(item.name)}`
      + `${Number(item.system?.itemLevel) > 0 ? ` (level ${Number(item.system.itemLevel)})` : ""}.`)];
  if (cost.time) lines.push(line(`<em>${esc(item.system?.activation ?? cost.time)}${cost.ap ? ` — ${cost.ap} AP` : ""}.</em>`));

  // A SAVE AGAINST WHAT WAS TAKEN (3.578.0; Reglen unprepared). No DC is
  // printed, so the item's own level DC — the reading poisons take.
  let resisted = false;
  if (scaled?.selfSave) {
    const save = ["fortitude", "reflex", "will"].includes(scaled.selfSave.save) ? scaled.selfSave.save : "fortitude";
    const Save = `${save[0].toUpperCase()}${save.slice(1)}`;
    const { levelDC } = await import("./dice/resolution.mjs");
    const dc = Number(scaled.selfSave.dc) || levelDC(Math.max(0, Math.floor(Number(item.system?.itemLevel) || 0)));
    const { TRGCheck } = await import("./dice/check.mjs");
    const check = await TRGCheck.roll({
      actor: recipient,
      label: `${item.name} — ${Save} Save`,
      subtitle: scaled.selfSave.why ?? "",
      type: "save",
      subject: save,
      traits: item.system?.traits ?? "",
      dc,
      modifiers: recipient.system?.combat?.saves?.[save]?.checkModifiers
        ?? [{ label: Save, value: Number(recipient.system?.combat?.saves?.[save]?.total ?? 0), type: "untyped" }]
    });
    resisted = Boolean(check?.outcome?.degree?.success);
    lines.push(line(`${Save} DC ${dc}: <strong>${resisted ? "saved" : "failed"}</strong>${resisted ? " — nothing happens" : ""}.`));
  }

  // THE CREATURES AROUND (3.578.0; Nightsage). Those within the radius
  // who are what the item reaches, as the use begins — a minute's burn
  // at a time, so the circle is taken fresh at each lighting.
  let around = null;
  if (scaled?.nearby) {
    around = [];
    const radius = Math.max(0, Number(scaled.nearby.radius) || 5);
    const own = recipient.getActiveTokens?.()?.[0] ?? ownToken;
    if (own) {
      const { distanceBetween } = await import("./combat/geometry.mjs");
      for (const token of canvas?.tokens?.placeables ?? []) {
        if (!token.actor || token.document?.id === own.document?.id) continue;
        if (distanceBetween(own, token) > radius) continue;
        if (nearbyRecipient(token.actor.system, scaled.nearby)) around.push(token.actor);
      }
    }
    // AND THE USER, WHEN IT STANDS IN IT TOO (3.630.0) — Funeral Resin's
    // smoke "fills a 10-foot radius": the one who lit it is inside it.
    if (scaled.nearby.includeSelf === true && nearbyRecipient(recipient.system, scaled.nearby)) around.unshift(recipient);
    lines.push(line(around.length
      ? `Within ${radius} ft: ${around.map((a) => `<strong>${esc(a.name)}</strong>`).join(", ")}.`
      : `<em>No ${esc(scaled.nearby.label ?? "creature it reaches")} within ${radius} ft — nothing to reach this minute.</em>`));
  }

  if (resisted || (around && !around.length)) {
    // Nothing further: the save or the empty circle has said why.
  } else if (scaled?.effects?.length) {
    let duration = scaled.duration;
    if (scaled.rollDuration) {
      const roll = await new Roll(scaled.rollDuration.formula).evaluate();
      duration = `${roll.total} ${scaled.rollDuration.unit}`;
      lines.push(line(`Lasts <strong>${duration}</strong> (${esc(scaled.rollDuration.formula)}).`));
    }
    const data = syntheticSpellData(item, { label: scaled.label, effects: scaled.effects, duration });
    const spell = new Item.implementation(data, { parent: actor });
    const { applySpellEffects } = await import("./magic/spell-effects.mjs");
    await applySpellEffects(actor, spell, { targets: fed ? [recipient] : (around ?? []), lines });
  } else if (!scaled || (!scaled.pending && !scaled.wake && !scaled.resave)) {
    // TEXT ONLY (Black Amaranth, Bone Reed): the item's own words, which
    // is what the GM applies.
    lines.push(line(item.system?.description || "No effect is recorded on this item."));
  }

  // 5. WHAT THE ENGINE DOES NOT DO.
  if (scaled?.pending) {
    const { addPendingModifier } = await import("./pending-modifiers.mjs");
    await addPendingModifier(actor, { ...scaled.pending, oneShot: true });
    const v = Number(scaled.pending.value);
    lines.push(line(`<strong>${v > 0 ? "+" : ""}${v} ${esc(scaled.pending.type ?? "")}</strong> waits for ${esc(scaled.pending.scope ?? "the next roll")} — offered in that roll's dialog.`));
  }
  if (scaled?.resave) {
    // EITHER OF TWO (3.630.0): Divine Nectar's "one disease or poison"
    // reads `resave: "disease|poison"` — one new save, against whichever.
    const either = String(scaled.resave).includes("|");
    const trait = new RegExp(`\\b(?:${scaled.resave})\\b`, "i");
    const afflicted = Array.from(recipient.items ?? []).filter((i) => i.type === "affliction"
      && trait.test(String(i.system?.traits ?? "")) && Number(i.system?.currentStage ?? 0) >= 1 && !i.system?.incubating);
    if (!afflicted.length) lines.push(line(`<em>${esc(recipient.name)} has no ${esc(String(scaled.resave).split("|").join(" or "))} to save against now.</em>`));
    for (const affliction of afflicted) {
      const again = await DialogV2.confirm({
        window: { title: `${item.name} — a new save` },
        content: `<p>${esc(recipient.name)} may immediately make a new saving throw against <strong>${esc(affliction.name)}</strong>, with the bonus.</p>`,
        rejectClose: false
      });
      if (!again) continue;
      const { rollAfflictionStageSave } = await import("./combat/affliction-workflow.mjs");
      // A NEW SAVE, NOT THE END OF AN INTERVAL (3.578.0): no stage damage.
      await rollAfflictionStageSave(recipient, affliction, { withDamage: false });
      lines.push(line(`A new save against <strong>${esc(affliction.name)}</strong> is rolled.`));
      if (either) break;
    }
  }
  if (scaled?.wake) {
    const dyingEffect = Array.from(recipient.effects ?? [])
      .find((e) => !e.disabled && Array.from(e.statuses ?? []).includes("dying"));
    if (dyingEffect) {
      await recipient.setFlag(SYSTEM_ID, CONSCIOUS_WHILE_DYING_FLAG, dyingEffect.id);
      lines.push(line(`<strong>${esc(recipient.name)}</strong> is conscious — but still Dying, and still makes a Dying Check each round.`));
    } else {
      lines.push(line(`${esc(recipient.name)} may attempt a new saving throw against a spell or effect that has already rendered them unconscious or stunned.`));
    }
  }
  if (scaled?.note) lines.push(line(`<em>${esc(scaled.note)}</em>`));

  // 6. ONE USE, AND THE CARD.
  const after = consumeOneUse({
    uses: item.system?.uses?.value,
    max: item.system?.uses?.max,
    quantity: item.system?.quantity
  });
  lines.push(after.destroy
    ? line(`The last of it is gone — ${esc(item.name)} is removed from the sheet.`)
    : line(`${after.quantity} remaining${after.uses > 1 ? `, ${after.uses} uses in the open one` : ""}.`));
  await postCard(actor, `${item.name} — ${fed ? "Fed" : "Used"}`, lines);
  if (after.destroy) await item.delete();
  else await item.update({ "system.quantity": after.quantity, "system.uses.value": after.uses });
  return { used: true, fed, recipient: recipient.id, mode };
}

/**
 * ONE USE GONE, WITHOUT A CARD (3.626.0): what a consumable spent from
 * somewhere else — a Soulguard Talisman broken on a failed save — writes.
 * The caller says what happened on its own card.
 */
export async function useConsumableUp(actor, item) {
  const after = consumeOneUse({
    uses: item.system?.uses?.value,
    max: item.system?.uses?.max,
    quantity: item.system?.quantity
  });
  if (after.destroy) await item.delete();
  else await item.update({ "system.quantity": after.quantity, "system.uses.value": after.uses });
  return after;
}
