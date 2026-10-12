import { alreadyGrantedNames, matchGrants, parseGrantList, parseLevelledGrantList, parseMaybeLevelledGrantList } from "./grants.mjs";
import { runExclusiveForActor } from "./grant-queue.mjs";
import { applySpecialistSkillGrants, declaresSpecialistSkills } from "./specialist-grants.mjs";
import { alignmentFeat, alignmentFeatNames, aspectItems, divineResolveTopUp } from "./crusader.mjs";
import { warriorsResolveTopUp } from "./fighter.mjs";
import { scoundrelsLuckTopUp } from "./rogue.mjs";
import { FOUNDATION_ITEM_TYPES } from "./config.mjs";
import { packItemData } from "./items.mjs";
import { contentPack } from "./content-packs.mjs";
import { sourcePackageOf } from "./sourcebooks.mjs";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/**
 * The sheet fields a class's progression table takes over, and the label
 * each one is reported under when it is cleared.
 *
 * `hpPerLevel` is here for completeness — the class REPLACES rather than
 * adds for hit points, so a leftover value is inert rather than harmful —
 * but leaving a stale 10 in a field the sheet has stopped showing is its
 * own small trap.
 */
const CLASS_OWNED_FIELDS = Object.freeze([
  ["system.combat.bab.base", "BAB Base"],
  ["system.combat.bdb.class", "BDB Class"],
  ["system.combat.saves.fortitude.class", "Fortitude (Class)"],
  ["system.combat.saves.reflex.class", "Reflex (Class)"],
  ["system.combat.saves.will.class", "Will (Class)"],
  ["system.magic.bsb", "Base Spellcraft Bonus"],
  ["system.resources.hp.hpPerLevel", "HP per Level"]
]);

/**
 * Zero any of those the character has typed a value into, and report
 * what went.
 *
 * Read from `actor._source` and NOT from prepared data. Great Fortitude,
 * Iron Will, Lightning Reflexes and Physical Training all write ADD-mode
 * effects into the very save and BAB class slots listed above, and
 * effects are applied before derived data — so a prepared read would see
 * the effect's contribution, write it into storage, and bake a feat's
 * bonus into the character permanently. That exact mistake has already
 * cost this system two bugs in the choosers.
 */
async function clearClassOwnedFields(actor, classItem) {
  const source = actor._source?.system;
  if (!source) return [];
  const update = {};
  const cleared = [];
  const restore = {};
  for (const [path, label] of CLASS_OWNED_FIELDS) {
    const stored = path
      .replace(/^system\./, "")
      .split(".")
      .reduce((node, key) => node?.[key], source);
    const value = Number(stored ?? 0);
    if (!Number.isFinite(value) || value === 0) continue;
    update[path] = 0;
    restore[path] = value;
    cleared.push(`${label} (was ${value})`);
  }
  if (!cleared.length) return [];
  await actor.update(update);
  // Recorded ON THE CLASS ITEM, so removing the class puts them back.
  //
  // Without this, adding a Fighter to compare and then dragging it off
  // left the character on zeros, with the only record of what they had
  // being a chat card that may have scrolled away hours ago. The
  // heritage's `abilitiesRemoved` flag solves the identical problem for
  // Urloch, and this is the same shape.
  await classItem.setFlag("trg-prime", "clearedFields", restore);
  return cleared;
}

/**
 * Put back the fields a class cleared, when the class is removed.
 *
 * Only fields still sitting at zero are restored. If the player has typed
 * something into one since — deciding that "BAB Other" was really theirs
 * after all, or rebuilding by hand — that value is theirs and is left
 * alone rather than overwritten by a number from before the class landed.
 *
 * @returns {Promise<string[]>} Labels restored.
 */
export async function restoreClassOwnedFields(actor, classItem) {
  const record = classItem?.flags?.["trg-prime"]?.clearedFields;
  if (!record || typeof record !== "object") return [];
  const source = actor?._source?.system;
  if (!source) return [];

  const labels = Object.fromEntries(CLASS_OWNED_FIELDS);
  const update = {};
  const restored = [];
  for (const [path, value] of Object.entries(record)) {
    const stored = Number(
      path.replace(/^system\./, "").split(".").reduce((node, key) => node?.[key], source) ?? 0
    );
    if (stored !== 0) continue;
    update[path] = value;
    restored.push(`${labels[path] ?? path} (${value})`);
  }
  if (restored.length) await actor.update(update);
  return restored;
}

/** "+3" / "0", for stating a table's contribution on the card. */
function signedNumber(value) {
  const n = Number(value) || 0;
  return n > 0 ? `+${n}` : String(n);
}

/** "st" / "nd" / "rd" / "th", for naming the level an ability arrives at. */
function ordinalSuffix(value) {
  const n = Math.abs(Number(value) || 0);
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * The full name-index of every entry in a compendium pack, or an empty
 * array if the pack doesn't exist (e.g. not yet registered, or the
 * system id doesn't match — reported as a warning rather than thrown,
 * since a missing pack should behave the same as an empty one for
 * matchGrants' purposes).
 */
async function packIndex(packName) {
  const pack = contentPack(packName);
  if (!pack) {
    ui.notifications.warn(`Compendium pack "${packName}" not found.`);
    return [];
  }
  // `system.sourceClass` is requested explicitly: Foundry's default index
  // carries only _id/name/img/type, and matchGrants needs the owning
  // class to tell two same-named abilities apart. The Rogue and the
  // Ranger both print a Trap Finder.
  const index = await pack.getIndex({ fields: ["system.sourceClass"] });
  return Array.from(index.values());
}

/**
 * Every ability name any heritage on this actor explicitly TAKES AWAY
 * (Urloch: "You lose the Ley Blood, Arcane Knowledge and Forbidden Magic
 * Ascendan abilities"). Lower-cased for comparison.
 *
 * Read on both sides of the transaction: the heritage deletes what is
 * already there, and the RACE refuses to re-grant them afterwards — order
 * of play is not fixed, and a player who applies their race's grants
 * second would otherwise hand the lost abilities straight back.
 */
export function removedAbilityNames(actor) {
  const names = new Set();
  for (const item of actor?.items ?? []) {
    if (item.type !== "heritage") continue;
    for (const name of parseGrantList(item.system?.removedAbilities ?? "")) {
      names.add(String(name).trim().toLowerCase());
    }
  }
  return names;
}

/**
 * Deletes the ability items a heritage removes, and reports what went.
 * Matched by name against the actor's own items rather than by grant
 * provenance: the ability may have arrived from the race, from an earlier
 * manual drag, or from a compendium import, and all three are "lost".
 */
export async function applyAbilityRemovals(actor, sourceItem) {
  const wanted = parseGrantList(sourceItem.system?.removedAbilities ?? "")
    .map((name) => String(name).trim().toLowerCase());
  if (!wanted.length) return { removed: [], absent: [] };

  const present = Array.from(actor.items ?? []).filter(
    (item) => item.type === "ability" && wanted.includes(String(item.name ?? "").trim().toLowerCase())
  );
  if (present.length) {
    // Record what ACTUALLY went, on the heritage itself, so removing the
    // heritage restores exactly those and nothing else. Re-running the
    // race's whole grant list instead would hand a character abilities
    // they had never been given in the first place.
    await sourceItem.setFlag("trg-prime", "abilitiesRemoved", present.map((i) => i.name));
    await actor.deleteEmbeddedDocuments("Item", present.map((i) => i.id));
  }
  const removedNames = new Set(present.map((i) => String(i.name).trim().toLowerCase()));
  return {
    removed: present.map((i) => i.name),
    absent: wanted.filter((name) => !removedNames.has(name))
  };
}

/**
 * Put back exactly the abilities a heritage took away, tagged as granted
 * by the race that owns them. Called from grant cleanup when the heritage
 * is deleted — without it a player who tries Urloch and changes their
 * mind is quietly three abilities short for ever, because nothing on the
 * sheet records that they were ever removed.
 *
 * @param {Actor} actor
 * @param {Item} heritageItem The DELETED heritage (its flags still read).
 * @returns {Promise<string[]>} Names restored.
 */
export async function restoreRemovedAbilities(actor, heritageItem) {
  // Two orderings reach here, and only one of them ever deleted anything.
  //
  //   Heritage added, THEN grants applied — the natural order, since you
  //   pick race and heritage together and press Apply Grants once. The
  //   race's grant is SUPPRESSED, so the abilities are never created, so
  //   nothing is recorded as removed.
  //
  //   Grants applied, THEN heritage added — the abilities exist, are
  //   deleted, and `abilitiesRemoved` records them.
  //
  // Restoring only the recorded set left the first case — the common one
  // — permanently three abilities short, with nothing on the sheet saying
  // why. Found in live testing. So the DECLARED list is intersected with
  // what the actor's race actually grants and folded in: that covers both
  // orderings and can never invent an ability the race doesn't confer.
  const recorded = heritageItem?.flags?.["trg-prime"]?.abilitiesRemoved;
  const race = Array.from(actor?.items ?? []).find((i) => i.type === "race");
  const wanted = new Map();
  for (const name of Array.isArray(recorded) ? recorded : []) {
    wanted.set(String(name).trim().toLowerCase(), name);
  }
  if (race) {
    const granted = new Set(
      parseGrantList(race.system?.racialAbilities ?? "").map((n) => String(n).trim().toLowerCase())
    );
    for (const name of parseGrantList(heritageItem?.system?.removedAbilities ?? "")) {
      const key = String(name).trim().toLowerCase();
      if (granted.has(key)) wanted.set(key, name);
    }
  }
  const names = Array.from(wanted.values());
  if (!names.length) return [];

  const index = await packIndex("abilities");
  const { resolved } = matchGrants(names, index);
  // Anything the character has picked up again in the meantime is left
  // alone rather than duplicated.
  const held = new Set(
    Array.from(actor.items ?? [])
      .filter((i) => i.type === "ability")
      .map((i) => String(i.name).trim().toLowerCase())
  );
  const pack = contentPack("abilities");
  const created = [];
  for (const { requested, entry } of resolved) {
    if (held.has(String(requested).trim().toLowerCase())) continue;
    const document = await pack.getDocument(entry._id);
    // Sourced and id-free. See packItemData in items.mjs for why a
    // hand-rolled toObject() could not say where the item came from.
    const data = packItemData(document);
    // Re-tagged to the RACE, which is where they came from — so deleting
    // the race later still takes them down.
    if (race) {
      data.flags = {
        ...data.flags,
        "trg-prime": {
          ...data.flags?.["trg-prime"],
          grantedBy: { sourceId: race.id, sourceName: race.name, requested }
        }
      };
    }
    created.push(data);
  }
  if (!created.length) return [];
  await actor.createEmbeddedDocuments("Item", created);
  return created.map((d) => d.name);
}

/**
 * Applies one grant field (e.g. Background.system.grantedFeats) from a
 * source item onto its owning actor: resolves each requested name
 * against the target pack, skips anything already granted by this
 * exact source, creates embedded copies of what's newly found, and
 * reports both what succeeded and what didn't resolve — a missing
 * target is a visible warning, never a silent no-op.
 *
 * @param {Actor} actor
 * @param {Item} sourceItem The Background/Class/Race/Heritage/Divine
 *   Aspect item granting things.
 * @param {string} grantField e.g. "grantedFeats".
 * @param {string} packName e.g. "feats".
 */
export async function applyGrant(
  actor, sourceItem, grantField, packName, { levelled = false, overrideValue = null } = {}
) {
  // `overrideValue` grants a name the source item does not carry in a
  // field of its own. The Crusader's deific aspect is the first: which
  // reaction feat it hands over — Strike of Retribution or Self
  // Preservation — is decided by the aspect's ALIGNMENT rather than
  // printed anywhere on the aspect as a grant list. Everything else
  // about the grant (provenance, dedupe, the card line) should behave
  // identically, so it takes this path rather than a second one.
  const rawValue = overrideValue ?? sourceItem.system?.[grantField] ?? "";
  // bonusSpells is "level: name" pairs; every other grant field so far
  // is a plain comma-separated name list. Only the names matter for
  // resolution itself — which level a bonus spell is granted at is
  // metadata for when Divine Aspects are actually populated, not
  // something this resolution step needs to act on yet.
  //
  // A LEVELLED field is different again: a class's abilities arrive over
  // twenty levels, and handing a 1st-level Fighter their 13th-level
  // Weapon Supremacy would be worse than handing them nothing. Those are
  // filtered by the character's level and the rest reported as pending,
  // so the card says what is still to come rather than silently omitting
  // it.
  let deferred = [];
  let requestedNames;
  if (levelled) {
    const level = Number(actor.system?.identity?.level ?? 1) || 1;
    const entries = parseMaybeLevelledGrantList(rawValue);
    requestedNames = entries.filter((e) => e.level <= level).map((e) => e.name);
    deferred = entries.filter((e) => e.level > level);
  } else if (grantField === "bonusSpells") {
    // Kept for a caller that asks for bonus spells UNlevelled. Nothing
    // does today — the divine-aspect entry is levelled as of 3.209.0 —
    // but the "level: name" shape still has to parse rather than being
    // read as eight spells with colons in their names.
    requestedNames = parseLevelledGrantList(rawValue).map((entry) => entry.name);
  } else {
    requestedNames = parseGrantList(rawValue);
  }
  if (!requestedNames.length) {
    return { resolved: [], unresolved: [], skipped: [], held: [], suppressed: [], deferred };
  }

  const index = await packIndex(packName);
  // A class asking for an ability gets ITS copy of a shared name.
  // A book's own copy of a shared name wins over another book's (3.628.0).
  const { resolved, unresolved } = matchGrants(requestedNames, index,
    { sourceClass: sourceItem.type === "class" ? sourceItem.name : "", preferPackage: sourcePackageOf(sourceItem) });

  const alreadyGranted = alreadyGrantedNames(actor.items, sourceItem.id);
  // A heritage that removes racial abilities (Urloch) must not have them
  // handed back the moment the race's — or a feat's — grants are
  // re-applied. Suppression is scoped to the abilities pack: a lost
  // ABILITY named the same as a feat should not silently block the feat.
  const suppressedNames = packName === "abilities" && sourceItem.type !== "heritage"
    ? removedAbilityNames(actor)
    : new Set();
  const isSuppressed = ({ requested }) => suppressedNames.has(String(requested).trim().toLowerCase());
  // Reported, not silent. A player re-applying their race's grants while
  // wearing Urloch would otherwise get a card that simply omits three
  // abilities, with nothing said about why.
  const suppressed = resolved.filter(isSuppressed);
  // ALREADY ON THE SHEET, from anywhere at all.
  //
  // `alreadyGranted` only dedupes against items this SAME source
  // granted, which is the right question for "did I press this twice"
  // and the wrong one for "does the character already have it". The
  // Crusader made that reachable: Strike of Retribution and Self
  // Preservation are ordinary Class feats with the Crusader trait, so a
  // Crusader who picked one as a bonus feat and then applied their
  // aspect ended up holding two copies — and the card said "Granted",
  // which was a lie. Two aspects on one sheet did the same.
  //
  // Reported separately from `skipped` so the card can say which of the
  // two things happened. restoreRemovedAbilities has read the actor's
  // own items this way since it was written; every other grant path
  // simply never did.
  const held = new Set(
    Array.from(actor.items ?? []).map((i) => String(i.name).trim().toLowerCase())
  );
  const toCreate = resolved.filter(
    (entry) => !alreadyGranted.has(String(entry.requested).trim().toLowerCase()) &&
      !held.has(String(entry.requested).trim().toLowerCase()) && !isSuppressed(entry)
  );
  const skipped = resolved.filter(({ requested }) =>
    alreadyGranted.has(String(requested).trim().toLowerCase())
  ).filter((entry) => !isSuppressed(entry));
  const alreadyHeld = resolved.filter(({ requested }) =>
    !alreadyGranted.has(String(requested).trim().toLowerCase()) &&
    held.has(String(requested).trim().toLowerCase())
  ).filter((entry) => !isSuppressed(entry));

  const created = [];
  for (const { requested, entry } of toCreate) {
    const pack = contentPack(packName);
    const document = await pack.getDocument(entry._id);
    const data = packItemData(document);
    data.flags = {
      ...data.flags,
      "trg-prime": {
        ...data.flags?.["trg-prime"],
        grantedBy: { sourceId: sourceItem.id, sourceName: sourceItem.name, requested }
      }
    };
    // Every spell this table can hand over — a divine aspect's LEVELLED
    // bonusSpells, a wizard school's LEVELLED specialistSpells, and a
    // race/heritage/background/feat's own grantedSpells — is "always
    // available for you to cast": none of these are the "list"-style daily
    // pick or the Wizard's Spell Book, the only two things the memorisation
    // cycle actually tracks (memorisation-workflow.mjs/spellbook-workflow.mjs
    // are the sole creators of THOSE).
    //
    // KEPT, BUT NO LONGER LOAD-BEARING. Until 3.348.0 the cast gate read
    // this field, so every granting path had to remember to set it —
    // and the note that used to stand here recorded the same defect being
    // found twice and the fix widened both times, first on a deific
    // aspect's bonus spells and then on a wizard school's specialist
    // spells. Graham hit it a third time on 20 Aug 2026. Castability now
    // follows from the `grantedBy` stamp two lines below rather than from
    // this one, so a path that forgets it can no longer refuse a spell it
    // has just granted.
    if (data.type === "spell") data.system.prepared = true;

    // GRANTED AS AN INNATE SPELL, when the granting item says so.
    //
    // Injury Relief — "you can cast Self Healing as an INNATE spell with
    // the focus trait" — is the first of these, and the trait half needs no
    // help: `_applyGrantedFocusTrait` (documents/item.mjs) already puts
    // Focus on any granted innate spell, in the one place every creation
    // path passes through. What it cannot do is decide that the grant was
    // innate in the first place, so the granting item declares it.
    //
    // DECLARED, NOT LISTED BY NAME, so the next feat of this shape needs no
    // change here — Mercy of Relief's "treated as an innate spell for
    // casting rule purposes" is already the second.
    if (data.type === "spell" && sourceItem?.flags?.["trg-prime"]?.grantInnate) {
      data.system.innate = true;
    }
    // AND HOW OFTEN, WHEN THE GRANT SAYS (3.627.0). Pillars of Faith's
    // Poltergeist Hurling: "You gain Hurling as an ethereal innate cantrip
    // which you may cast AT WILL." A plain innate grant takes the Focus
    // trait and one use (`grantedInnateTakesFocus`); a granting item that
    // declares `grantedSpellUses: {"Hurling": "unlimited"}` hands the spell
    // over with that `usesPerDay`, which is what keeps Focus off it.
    if (data.type === "spell") {
      const uses = grantedSpellUsesFor(sourceItem, data.name);
      if (uses !== null) data.system.usesPerDay = uses;
    }
    created.push(data);
  }

  if (created.length) {
    await actor.createEmbeddedDocuments("Item", created);
  }

  return { resolved: toCreate, unresolved, skipped, held: alreadyHeld, suppressed, deferred };
}

/**
 * Sheet entry point: applies every grant field a given source item type
 * defines, posting one combined report. The field-to-pack mapping is
 * deliberately explicit here rather than inferred, so adding a new
 * grant type later is a one-line addition, not a guessing game.
 */
export const GRANT_FIELDS = Object.freeze({
  // The Lay Healer "gain[s] the Lay on Hands specialist spell", the first
  // background to confer one.
  background: [
    { field: "grantedFeats", pack: "feats" },
    { field: "grantedSpells", pack: "spells" }
  ],
  // A CAMPAIGN ORIGIN grants exactly what a background does (Graham's
  // ruling, 3.250.0) — the same two fields, resolved from the same two
  // packs, through the same path. Nothing here is origin-specific, which
  // is the point: an origin written next week works the day it is
  // written, with no code behind it.
  origin: [
    { field: "grantedFeats", pack: "feats" },
    { field: "grantedSpells", pack: "spells" }
  ],
  // A class's abilities are LEVELLED — they arrive across the twenty rows
  // of its table, and the field carries "level: name" pairs so the grant
  // path can hand over only what the character has reached and name what
  // is still to come.
  class: [
    // A class's granted FEATS are levelled as well: the Rogue is handed
    // Evasion at 2nd, not at 1st. A bare name still means level 1, so
    // nothing else that uses this field is affected.
    { field: "grantedFeats", pack: "feats", levelled: true },
    { field: "classAbilities", pack: "abilities", levelled: true },
    // A class's own free starting gear — currently only the Wizard's
    // Spell Book (Chapter 3 x Chapter 6). Not levelled: it arrives the
    // moment the class does, the same as a background's grantedFeats.
    { field: "grantedGear", pack: "gear" },
    // A CLASS MAY GRANT A SPELL OUTRIGHT (3.563.0). Pillars of Faith's
    // Healer: "you automatically add Cure and Restoration to your
    // repertoire. These spells do not count against the normal number of
    // spells you learn" — and Stabilise as a cantrip. Granted, not
    // innate and not a repertoire pick, so the table lists them as
    // "Granted" and the Repertoire card's count ignores them. Levelled
    // for the same reason classAbilities is.
    { field: "grantedSpells", pack: "spells", levelled: true }
  ],
  // A CLASS ABILITY MAY GRANT (3.563.0). Pillars of Faith's disciplines
  // — an Archivist's Canonist, a Grimward's Exorcist — are ability items a
  // chooser hands over, and each carries its own specialist spells
  // ("Doctrinal Ward (1), Word of Censure (7)"). Same three fields a feat
  // has, resolved the same way; the spells are levelled because every
  // discipline prints a 1st-level and a 7th-level one.
  ability: [
    { field: "grantedSpells", pack: "spells", levelled: true },
    { field: "grantedAbilities", pack: "abilities" },
    { field: "grantedFeats", pack: "feats" }
  ],
  race: [
    { field: "grantedFeats", pack: "feats" },
    { field: "racialAbilities", pack: "abilities" },
    // An animal companion's base creature is a race item (see
    // module/companion.mjs), and a base creature arrives with its own
    // natural attacks — a Bear with its Bite and Claws. Nothing else
    // grants a weapon from a race today, so every player race leaves
    // this blank; it is additive with a harmless default.
    //
    // The pack is `companions`, not `weapons`, on purpose. The weapons
    // pack IS Chapter 6's equipment table, transcribed and diffed
    // against the book by verify-equipment.mjs; a companion's
    // size-stepped Bite is not in that table and does not belong in it.
    { field: "grantedWeapons", pack: "companions" },
    // A RACE may grant a spell outright (3.560.0). Pillars of Faith's
    // Kethrani "gain Read Aura as a divinity innate cantrip" on the race
    // itself, not a heritage — the first race to do so. Same field, same
    // pack, same innate/Focus treatment a heritage's grant gets.
    { field: "grantedSpells", pack: "spells" }
  ],
  heritage: [
    { field: "grantedFeats", pack: "feats" },
    { field: "racialAbilities", pack: "abilities" },
    // Galad-Iar casts dancing lights and light; several Ascendan
    // heritages grant a named specialist spell.
    { field: "grantedSpells", pack: "spells" }
  ],
  // Feats can grant spells, abilities AND other feats (Chapter 5 — Animal
  // Magic grants Calm Animal; the Heritage feats grant Nightvision; the
  // Alchemist archetype grants Alchemical Crafting). Same name-based lazy
  // resolution — an archetype whose granted feat doesn't exist yet (Aegis
  // → Shield Focus) resolves loudly-not-silently once class feats land.
  feat: [
    { field: "grantedSpells", pack: "spells" },
    { field: "grantedAbilities", pack: "abilities" },
    { field: "grantedFeats", pack: "feats" },
    // A FEAT MAY GRANT A NATURAL ATTACK (3.571.0). Pillars of Faith's
    // Hunter's Fangs: "You gain the following natural attack: Fangs..."
    // From the companions pack, where the system keeps natural attacks,
    // for the reason the race entry gives.
    { field: "grantedWeapons", pack: "companions" }
  ],
  // Appendix 4's bonus spells are LEVELLED: "Orb of Fire (1); Burning
  // Hands (2); Fireball (6); Wall of Fire (8)" is the character level at
  // which each arrives, per Graham. Before 3.209.0 the bracket was
  // stripped and all four were handed over at once, so a 1st-level
  // Cleric of Dawn walked away with Wall of Fire.
  //
  // The bracket looks like a PP cost — 28 of the 40 happen to match one —
  // which is why it reads as one at a glance. It is not: every aspect's
  // first entry is printed (1) where the real cost is 0 or 2.
  //
  // specialistSpells is NOT here. Deific Aspect says "you select ONE of
  // your deific aspects' specialist spells at 1st level" and each aspect
  // lists eight; granting all eight is seven spells the character never
  // had. It is a chooser now — see useDivineAspect in feats-workflow.
  "divine-aspect": [
    { field: "bonusSpells", pack: "spells", levelled: true }
  ],
  // A Wizard school's two specialist spells: "a unique Specialist Spell
  // at 1st level and another at 7th level". LEVELLED, so a 1st-level
  // Wizard gets the first and is told the second is coming — the same
  // treatment a deific aspect's bonus spells get, and for the same
  // reason.
  "wizard-school": [
    { field: "specialistSpells", pack: "spells", levelled: true }
  ],
  // A creature type's Traits subsection grants outright items rather than
  // just modifying numbers — Darkvision/Nightvision, and Eternal's own
  // Eternal Essence — the same "press Apply Grants and it lands as a real
  // ability item" shape as a race's racialAbilities, per Graham's ruling
  // that these needed to be coded rather than shown as reference text.
  "creature-type": [
    { field: "grantedAbilities", pack: "abilities" }
  ]
});

/**
 * The reaction feat a Crusader's deific aspect hands over.
 *
 * "Your deific aspect also grants you either the Strike of Retribution
 * (good) or Self Preservation (evil) reaction feat. If your deific
 * aspect has neither the good nor evil trait then you may select one of
 * the feats, but once selected, it cannot be changed."
 *
 * Called from BOTH sides — applying the aspect's grants, and applying
 * the class's — because order of play is not fixed and either can be
 * pressed first. Idempotent: the ordinary dedupe means a second run
 * reports "already granted" rather than handing over a second copy.
 *
 * A Cleric's aspect is untouched: the Cleric class declares no
 * alignment feats, and the Cleric's own Deific Aspect entry has no
 * reaction-feat clause.
 *
 * @param {(v: boolean) => void} markRequested Sets the caller's
 *   "something was asked for" flag, so a card is posted even when the
 *   only outcome is a choice the player still has to make.
 */
export async function applyAlignmentFeat(actor, aspectItem, markRequested = () => {}) {
  const names = alignmentFeatNames(actor);
  if (!names) return [];
  markRequested(true);

  const lines = [];
  const verdict = alignmentFeat(aspectItem.system?.traits, names);

  if (verdict.chosen) {
    // Five of the ten aspects are neither good nor evil, so this is
    // half of them rather than a corner. Recorded once and permanent, as
    // the book says — a re-press reports the recorded answer rather than
    // asking again.
    const recorded = actor.getFlag?.("trg-prime", `alignmentFeat-${aspectItem.id}`);
    if (recorded) {
      lines.push(line(
        `<em>Reaction feat:</em> ${recorded} — chosen for ${aspectItem.name}, and it cannot be changed.`
      ));
      return lines;
    }
    lines.push(line(
      `<strong>Reaction feat to choose:</strong> ${aspectItem.name} is neither good nor evil, ` +
      `so pick <strong>${verdict.options.join("</strong> or <strong>")}</strong> — ` +
      `press <em>Use</em> on ${aspectItem.name}. Once selected it cannot be changed.`
    ));
    return lines;
  }

  const alignment = /\bgood\b/i.test(String(aspectItem.system?.traits ?? "")) ? "good" : "evil";
  const granted = await applyGrant(actor, aspectItem, "alignmentFeat", "feats", {
    overrideValue: verdict.feat
  });
  for (const { requested } of granted.resolved) {
    // `changed += 1` stood here until 3.365.0 and threw: this function
    // returns LINES, not the {lines, changed} shape its neighbour does, so
    // the counter it incremented was never declared. It fired only when an
    // alignment feat was actually granted, which is why it survived.
    lines.push(line(`<strong>Granted:</strong> ${requested} — ${aspectItem.name} is ${alignment}.`));
  }
  for (const { requested } of granted.skipped) {
    lines.push(line(`<em>${requested}</em> already granted by ${aspectItem.name} — skipped.`));
  }
  for (const { requested } of granted.held ?? []) {
    lines.push(line(`<em>${requested}</em> is already on your sheet — not granted twice.`));
  }
  for (const requested of granted.unresolved) {
    lines.push(line(
      `<strong style="color:#8a1c1c">Not found:</strong> "${requested}" isn't in the feats compendium.`
    ));
  }
  return lines;
}

/**
 * @param {Actor} actor
 * @param {Item} sourceItem
 * @param {object} [options]
 * @param {boolean} [options.quietIfNothingNew] Post no card unless something
 *   was actually created or removed. Used by the LEVEL-UP autorun (3.327.0),
 *   which re-runs this for every foundation the character carries: a Cleric
 *   with a race, a class and a deific aspect would otherwise get three
 *   "Nothing to grant." cards every time they gained a level, which is how a
 *   useful card becomes noise a player learns to dismiss unread.
 * @returns {{lines: string[], changed: number}|null} `changed` counts REAL
 *   changes — items created or removed — and deliberately not "already
 *   granted, skipped", which is the common case on a re-run.
 */
export function applyAllGrants(actor, sourceItem, options = {}) {
  // THE DOOR, not the caller. Two paths grant on the same create — the
  // picker calls this directly, and grant-autorun's createItem watcher
  // calls it too — and this function reads "already granted?" off the
  // actor before it writes. Overlapping passes both read "not yet" and
  // both create, which is how selecting a race added every racial
  // ability twice (Graham, 21 Aug 2026).
  //
  // Serialised HERE so a caller cannot forget: grant-autorun had its own
  // queue and it did not help, because the picker was not in it.
  return runExclusiveForActor(actor?.id, () => applyAllGrantsExclusive(actor, sourceItem, options));
}

async function applyAllGrantsExclusive(actor, sourceItem, { quietIfNothingNew = false } = {}) {
  const grants = GRANT_FIELDS[sourceItem.type];
  if (!grants) {
    ui.notifications.warn(`${sourceItem.name} (${sourceItem.type}) has no grants defined for this system.`);
    return null;
  }

  const lines = [];
  let changed = 0;
  let anyRequested = false;
  // A GRANT THAT NAMES SOMETHING THE COMPENDIUM DOES NOT HAVE is a data
  // error, and `changed` does not count it — nothing was created. Counted
  // separately so a quiet pass still speaks up: silence would be the one
  // outcome that leaves a foundation half-delivered with nothing on
  // screen to say so.
  let problems = 0;

  // Removals run BEFORE the grants: Urloch's heritage may itself grant
  // something, and a removal sweeping afterwards could take it away again
  // if a name ever overlapped.
  if (sourceItem.type === "heritage" && sourceItem.system?.removedAbilities) {
    const removal = await applyAbilityRemovals(actor, sourceItem);
    for (const name of removal.removed) {
      anyRequested = true;
      changed += 1;
      lines.push(line(`<strong style="color:#8a1c1c">Removed:</strong> ${name} — lost to ${sourceItem.name}.`));
    }
    if (removal.absent.length) {
      anyRequested = true;
      lines.push(
        line(`<em>${sourceItem.name} also removes ${removal.absent.join(", ")}</em> — not on this character, so nothing to delete. Your race will not grant ${removal.absent.length > 1 ? "them" : "it"} while you carry this heritage.`)
      );
    }
  }

  for (const { field, pack, levelled } of grants) {
    const result = await applyGrant(actor, sourceItem, field, pack, { levelled });
    if (!result.resolved.length && !result.unresolved.length && !result.skipped.length &&
      !result.held?.length && !result.suppressed?.length && !result.deferred?.length) continue;
    anyRequested = true;

    for (const { requested } of result.resolved) {
      changed += 1;
      lines.push(line(`<strong>Granted:</strong> ${requested}`));
    }
    for (const { requested } of result.skipped) {
      lines.push(line(`<em>${requested}</em> already granted by ${sourceItem.name} — skipped.`));
    }
    for (const { requested } of result.held ?? []) {
      lines.push(line(`<em>${requested}</em> is already on your sheet — not granted twice.`));
    }
    for (const { requested } of result.suppressed ?? []) {
      lines.push(
        line(`<em>${requested}</em> is removed by your heritage — not granted.`)
      );
    }
    for (const requested of result.unresolved) {
      problems += 1;
      lines.push(
        line(`<strong style="color:#8a1c1c">Not found:</strong> "${requested}" isn't in the ${pack} compendium yet.`)
      );
    }
    // Named rather than omitted. A 1st-level Fighter's card should say
    // that Weapon Supremacy is coming at 13th, not quietly list two
    // abilities out of eight and leave the player wondering.
    //
    // THE WORDING WAS STALE (3.329.2, found in the Chapter 3 audit while
    // reading a companion's own Apply Grants card). "Press Apply Grants
    // again when you reach them" has been untrue since 3.327.0, when
    // grant-autorun.mjs began watching `identity.level` and running a
    // grant pass on every level change. The button still works and is
    // still idempotent — but telling the player it is REQUIRED teaches a
    // ritual the system removed, and a player who skips it now believes
    // their sheet is wrong when it isn't.
    const pending = (result.deferred ?? []).sort((a, b) => a.level - b.level);
    if (pending.length) {
      lines.push(line(
        `<em>Still to come:</em> ${pending.map((e) => `${e.name} (${e.level}${ordinalSuffix(e.level)} level)`).join(", ")} — these arrive on their own when you reach those levels.`
      ));
    }
  }

  // A class states which skills are CLASS skills, and states its
  // progression — neither of which is a grant, because neither creates an
  // item. They are reported here because Apply Grants is where a player
  // looks to find out what their class just did, and a card that lists
  // two abilities and says nothing about seven class skills or a jump in
  // hit points reads as though most of the class did not arrive.
  //
  // APPLIED, as of 3.204.0 — the class is a source in its own right and
  // the sheet derives the bonus from it (class-skills.mjs). Named here
  // because Apply Grants is where a player looks to find out what their
  // class just did, not because anything needs pressing.
  if (sourceItem.type === "class") {
    const classSkills = parseGrantList(sourceItem.system?.classSkills ?? "");
    if (classSkills.length) {
      anyRequested = true;
      lines.push(line(
        `<strong>Class skills:</strong> ${classSkills.join(", ")} — each already worth your class bonus on the Skills tab. Nothing to tick.`
      ));
    }
    const progression = actor.system?.progression;
    if (progression) {
      // Clear the numbers the player used to type by hand, because the
      // table now supplies them and the two would ADD.
      //
      // Until this release "BAB Base", the save Class column and BSB were
      // where you wrote your class's numbers — that was the documented
      // workflow, and the sheet's own tooltips said so. A level-10
      // Fighter carrying bab.base 10 and Fort class 15 would otherwise
      // silently become BAB 20 and Fort +30 the moment the class item
      // landed, with nothing on screen to explain it.
      //
      // Done HERE, on an explicit Apply Grants, rather than in a
      // migration: nobody holds a class with a table yet, so there is
      // nothing for a migration to find — the collision happens when the
      // class is added, and this is the button that adds it. Everything
      // cleared is named on the card, so it can be put back.
      const cleared = await clearClassOwnedFields(actor, sourceItem);
      if (cleared.length) {
        lines.push(line(
          `<strong>Cleared, now supplied by the table:</strong> ${cleared.join(", ")}. ` +
          `<em>These were typed in by hand; leaving them would have added to the class's own numbers. ` +
          `Remove the class and they come back.</em>`
        ));
      }
      const parts = [
        `BAB ${signedNumber(progression.bab)}`,
        `Defence ${signedNumber(progression.bdb)}`,
        `Fort ${signedNumber(progression.fortitude)}`,
        `Ref ${signedNumber(progression.reflex)}`,
        `Will ${signedNumber(progression.will)}`,
        `${progression.hitPoints} HP per level`
      ];
      if (progression.casterLevel !== null) parts.push(`caster level ${progression.casterLevel}`);
      if (progression.pp !== null) parts.push(`${progression.pp} PP`);
      lines.push(line(
        `<strong>At ${progression.level}${ordinalSuffix(progression.level)} level:</strong> ${parts.join(", ")}. ` +
        `<em>These come from the class table and update themselves when your level changes.</em>`
      ));
      if (progression.capped) {
        lines.push(line(
          `<em>Your level is past the printed table, which stops at ${progression.rowLevel} — the ${progression.rowLevel}th row is being used.</em>`
        ));
      }
    }
  }

  // Specialist skills are not compendium items, so they can't route
  // through applyGrant — they're entries written straight into the
  // actor's system data. Same reporting, different mechanism; see
  // specialist-grants.mjs for why provenance lives in a flag.
  // Backgrounds joined this list with the Chapter 2 batch: every one of
  // the forty-two confers a specialist skill, in a singular field that
  // shipped with the Soldier entry and was never read by anything.
  // ANY ITEM THAT DECLARES THE LITERAL LIST CONFERS IT (3.563.0). A class
  // ability that says "You gain Folk Lore as a specialist skill" is the
  // same sentence a race prints, and `specialistNamesFor` has read the
  // `grantedSpecialistSkills` flag off any item since 3.3xx — only this
  // gate kept feats and abilities from reaching it.
  if (FOUNDATION_ITEM_TYPES.includes(sourceItem.type) || declaresSpecialistSkills(sourceItem)) {
    const specialist = await applySpecialistSkillGrants(actor, sourceItem);
    for (const label of specialist.created) {
      anyRequested = true;
      changed += 1;
      lines.push(line(`<strong>Specialist skill added:</strong> ${label}`));
    }
    for (const label of specialist.skipped) {
      anyRequested = true;
      lines.push(line(`<em>${label}</em> already on the sheet — skipped.`));
    }

    // A feat the background grants with its CHOICE already made — Martial
  // Artist's "Weapon Focus (Unarmed)", Miner's "Favoured Terrain
  // (Underground)". The book decided; making the player re-decide on a
  // Use button they might never press would mean the feat silently did
  // nothing. Driven through the feat's OWN automation so the effect is
  // built by the one piece of code that knows how, rather than by a
  // second copy of it here.
  if (sourceItem.type === "background") {
    const qualifier = sourceItem.getFlag?.("trg-prime", "featQualifier");
    if (qualifier?.choice) {
      // Matched on the NAMED feat, not just the first this background
      // granted — a later background granting two feats would otherwise
      // qualify whichever came back first.
      const granted = Array.from(actor.items ?? []).find(
        (i) => i.type === "feat" &&
          i.flags?.["trg-prime"]?.grantedBy?.sourceId === sourceItem.id &&
          (!qualifier.feat || String(i.name).trim().toLowerCase() === String(qualifier.feat).trim().toLowerCase())
      );
      if (granted) {
        anyRequested = true;
        try {
          const { applyFeatQualifier } = await import("./feats-workflow.mjs");
          const result = await applyFeatQualifier(actor, granted, qualifier.choice);
          if (result.applied) {
            lines.push(line(
              `<strong>${granted.name}</strong> set to <strong>${qualifier.printed}</strong>` +
              `${qualifier.note ? ` (${qualifier.note})` : ""}.`
            ));
          } else {
            // Reported, not just a transient toast. A silent card and a
            // feat that does nothing is the worst pair of the two.
            lines.push(line(
              `<strong style="color:#8a1c1c">${granted.name} not set:</strong> ${result.reason} — press <em>Use</em> on it and choose ${qualifier.printed}.`
            ));
          }
        } catch (err) {
          console.warn("TRG Prime | applying a background's feat qualifier failed", err);
          lines.push(line(
            `<strong style="color:#8a1c1c">${granted.name} not set</strong> — press <em>Use</em> on it and choose ${qualifier.printed}.`
          ));
        }
      }
    }
  }

  // Skill SPECIALTIES (the sub-focus within Artistry/Crafting/Perform)
    // are a different thing again from specialist skills, and live in
    // their own flag. The Cook's "Crafting (Cooking)" hands one over so
    // its scoped bonus has something to apply to.
    const { applySpecialtySelectionGrants, grantedSpecialtySlots } =
      await import("./skill-specialties-workflow.mjs");
    for (const label of await applySpecialtySelectionGrants(actor, sourceItem)) {
      anyRequested = true;
      lines.push(line(`<strong>Specialty gained:</strong> ${label} — over and above your normal cap.`));
    }
    // A slot with no name attached (Entertainer's "Bonus Perform
    // Specialty") creates nothing, so it produced no card line at all and
    // a player had no way to know the row had done anything.
    // A chooser background creates nothing until its Use button is
    // pressed, so it produced no line at all — and Archaeologist, which
    // has no feat and no literal specialist skill either, reported
    // "Nothing to grant" while its entire distinguishing feature sat
    // unapplied. Same class of silence the specialty slot below fixes.
    const choice = sourceItem.getFlag?.("trg-prime", "specialistChoice");
    if (choice) {
      anyRequested = true;
      const many = (Number(choice.count) || 1) > 1;
      lines.push(line(
        `<strong>Specialist skill${many ? "s" : ""} to name:</strong> ${choice.label} — press <em>Use</em> on ${sourceItem.name} to choose ${many ? "them" : "it"}.`
      ));
    }
    // The other two choice kinds were left out of this and produced no
    // line at all — Weaver's only distinguishing grant is a cantrip, so
    // its card said nothing about the thing it trades its bonus feat for.
    const skillChoice = sourceItem.getFlag?.("trg-prime", "skillChoice");
    if (skillChoice) {
      anyRequested = true;
      lines.push(line(
        `<strong>${skillChoice.count} skill bonuses to choose:</strong> from ${skillChoice.from.join(", ")} — press <em>Use</em> on ${sourceItem.name}.`
      ));
    }
    const spellChoice = sourceItem.getFlag?.("trg-prime", "spellChoice");
    if (spellChoice) {
      anyRequested = true;
      lines.push(line(
        `<strong>Spell to choose:</strong> ${spellChoice.label} — press <em>Use</em> on ${sourceItem.name}.`
      ));
    }

    for (const slot of grantedSpecialtySlots(sourceItem)) {
      anyRequested = true;
      lines.push(line(
        `<strong>Specialty slot gained:</strong> ${slot.count} additional ${slot.label} specialt${slot.count === 1 ? "y" : "ies"}` +
        `${slot.developed ? " — choose with the Specialties button on the Skills tab." : ` — available once you have a rank in ${slot.label}.`}`
      ));
    }
  }

  // A divine aspect promises four things beyond its bonus spells, and
  // three of them are invisible on the card unless it says so: the class
  // skill and the favoured weapon are derived (they simply start
  // applying), and the specialist spell waits on a Use press. Before
  // 3.209.0 an aspect's card listed eight spells it should not have
  // granted and nothing else at all.
  if (sourceItem.type === "divine-aspect") {
    const specialist = String(sourceItem.system?.specialistSpells ?? "").trim();
    if (specialist) {
      anyRequested = true;
      lines.push(line(
        `<strong>Specialist spell to choose:</strong> one of ${specialist} — press <em>Use</em> on ${sourceItem.name}.`
      ));
    }
    const classSkill = String(sourceItem.system?.classSkill ?? "").trim();
    if (classSkill) {
      anyRequested = true;
      lines.push(line(`<strong>Class skill:</strong> ${classSkill} — applied automatically.`));
    }
    const favoured = String(sourceItem.system?.favouredWeapon ?? "").trim();
    if (favoured) {
      anyRequested = true;
      lines.push(line(
        `<strong>Favoured weapon:</strong> ${favoured} — you are proficient with it and attacks with it gain +1 (class).`
      ));
    }
    const ethics = sourceItem.getFlag?.("trg-prime", "suggestedEthics") ?? [];
    if (ethics.length) {
      anyRequested = true;
      lines.push(line(`<strong>Choose one ethic:</strong> ${ethics.join(", ")}.`));
    }

    // A CRUSADER's aspect hands over a reaction feat as well, chosen by
    // the aspect's own alignment. Handled by a shared function because
    // it has to run from BOTH sides — see applyAlignmentFeat.
    lines.push(...await applyAlignmentFeat(actor, sourceItem, (v) => { anyRequested = v; }));
  }

  // A Wizard school promises three things beyond its two specialist
  // spells, and two of them are invisible on the card unless it says so:
  // the class skill is derived (it simply starts applying) and the
  // unique ability is prose with no automation behind it. Pressing Apply
  // Grants on Insight otherwise told a player about Seer's Vision and
  // nothing about Perception becoming a class skill or Forewarned
  // existing at all. Same reasoning as the divine-aspect block above.
  if (sourceItem.type === "wizard-school") {
    const classSkill = String(sourceItem.system?.classSkill ?? "").trim();
    if (classSkill) {
      anyRequested = true;
      lines.push(line(`<strong>Class skill:</strong> ${classSkill} — applied automatically.`));
    }
    const abilityName = String(sourceItem.system?.uniqueAbilityName ?? "").trim();
    const abilityText = String(sourceItem.system?.uniqueAbility ?? "").trim();
    if (abilityName) {
      anyRequested = true;
      lines.push(line(`<strong>${abilityName}:</strong> ${abilityText}`));
    }
    anyRequested = true;
    lines.push(line(
      "<strong>School spells:</strong> spells of this school are +2 to their Save DC and -2 to their Casting DC — applied at the table."
    ));
  }

  // Divine Resolve (Crusader, 1st) and Warrior's Resolve (Fighter, 1st):
  // both say "increase your conviction pool AND conviction points by 1."
  // The pool maximum is derived; the point in your hand is a one-off,
  // and a derive would hand it back every time the sheet re-rendered.
  // Recorded on the class so it happens once.
  if (sourceItem.type === "class") {
    const topUps = [
      { label: "Divine Resolve", flag: "divineResolveGiven", topUp: divineResolveTopUp },
      { label: "Warrior's Resolve", flag: "warriorsResolveGiven", topUp: warriorsResolveTopUp },
      { label: "Scoundrel's Luck", flag: "scoundrelsLuckGiven", topUp: scoundrelsLuckTopUp }
    ];
    for (const entry of topUps) {
      const given = Boolean(sourceItem.getFlag?.("trg-prime", entry.flag));
      // From _source, so a SPENT point is not read as an unspent one.
      const stored = actor._source?.system?.resources?.conviction?.value;
      const topped = entry.topUp(actor, stored, given);
      if (topped !== null) {
        anyRequested = true;
        await actor.update({ "system.resources.conviction.value": topped });
        await sourceItem.setFlag("trg-prime", entry.flag, true);
        lines.push(line(
          `<strong>${entry.label}:</strong> conviction pool and points both raised by 1 — now ${topped}.`
        ));
      }
    }
  }

  // The instinctive repertoire (3.224.0): a class declaring the style
  // owes its picks through the Magic tab's Repertoire card — surfaced
  // here the same way an aspect's spell choice is, so applying the
  // class tells the player where their spells come from.
  // ANY ITEM THAT DECLARES THE STYLE, not only a class (3.547.0). Enigma
  // is a FEAT that says "You are an Instinctive caster", and this test
  // read `type === "class"`, so applying it surfaced nothing and the
  // player was never told where their spells now come from.
  if (String(sourceItem.system?.casterStyle ?? "").trim().toLowerCase() === "instinctive") {
    const { repertoirePickCount, repertoireSchedule } = await import("./magic/repertoire.mjs");
    const allowed = repertoirePickCount(Number(actor.system?.identity?.level ?? 0), repertoireSchedule(sourceItem));
    anyRequested = true;
    lines.push(line(
      `<strong>Spell repertoire:</strong> an instinctive caster — ${allowed} pick${allowed === 1 ? "" : "s"} at your level, chosen on the Magic tab's Repertoire card.`
    ));
  }

  // ...and from the CLASS side too, because order of play is not fixed.
  // A player who applied their aspect's grants before their class's
  // found no class to ask and was granted nothing, with no line on any
  // card saying so. Applying the class now sweeps whatever aspects are
  // already on the sheet.
  if (sourceItem.type === "class" && alignmentFeatNames(actor)) {
    for (const aspect of aspectItems(actor)) {
      lines.push(...await applyAlignmentFeat(actor, aspect, (v) => { anyRequested = v; }));
    }
  }

  // Stored-delta grants (a race's own Power Point line, a feature's
  // per-level HP) previously reconciled only on DELETION and at the next
  // daily preparation — so picking Ascendan gave you your +1 PP some time
  // tomorrow, and the asymmetry was what let a negative racial grant go
  // missing entirely. Reconciling here makes adding and removing mirror
  // each other, which is what they always claimed to be.
  try {
    const { reconcileAllGrants } = await import("./feats-workflow.mjs");
    const reconciled = await reconcileAllGrants(actor);
    for (const summary of reconciled ?? []) {
      anyRequested = true;
      lines.push(line(summary));
    }
  } catch (err) {
    console.warn("TRG Prime | grant reconcile after apply failed", err);
  }

  // A heritage's whole distinguishing feature is sometimes a Use-driven
  // choice with no flag any block above reads — Noldorni's innate cantrip,
  // Gul-Fyr's, Tirvni's, Furini's spell school, Tribal's ancient-lore
  // skill, Menora's and Urloch's bonus spells, Dengar's which-specialty-
  // carries-advantage, Galad-Iar's light toggle. These are authored
  // entirely through the FEAT_AUTOMATION registry — the same generic Use
  // dispatch a feat or class ability gets — not through GRANT_FIELDS or an
  // authored choice flag (specialistChoice/skillChoice/spellChoice, above),
  // so nothing before this point had any way to know one existed. Apply
  // Grants — whose own button reads "bonus feats, spells, etc." — reported
  // "Nothing to grant" while the heritage's entire point sat one button
  // over, reachable only from a small, easy-to-miss Use icon beside it.
  // Reported live by Graham on Noldorni. Same silence lesson as
  // Archaeologist (see the comment above specialistChoice), for a
  // mechanism those flags don't cover.
  //
  // AND A RACE IS THE SAME SHAPE (3.552.0). The test above was written
  // for heritages and read `type === "heritage"`, so it missed the case
  // that costs the most: a Human's ONLY ability modifiers come from
  // Versatile's chooser, and a player who added the race and did not
  // spot the small Use icon beside a granted ability had no racial
  // ability modifiers whatsoever, with nothing anywhere saying so.
  //
  // Both the identity item AND the abilities it just granted are asked
  // about, because for a race the button that matters is usually on the
  // granted ability rather than on the race itself.
  // AND A BACKGROUND IS THE SAME SHAPE AGAIN (3.553.0).
  //
  // Found auditing pages 31–40: a Soldier is granted Weapon Focus, whose
  // Use button records the weapon group its +1 class attack bonus applies
  // to. Until that is pressed the bonus does not exist — and this block
  // read `["race", "heritage"]`, so the card said nothing. The Arcane
  // Apprentice's free Magical Crafting formula and the Entertainer's
  // Flawless Performance specialty are the same silence. Every FOUNDATION
  // type is asked now (race, heritage, background, origin), because the
  // question "did this identity item leave a choice unmade" has nothing
  // to do with which of the four it is.
  //
  // AND ONLY THE CHOICES ARE NAMED. Graham's R1 ruling, 15 September
  // 2026: the nudge fires for Use actions that RECORD something and not
  // for ones you take in play. Battle Medic and Quick Donning are both
  // granted by backgrounds and both have Use buttons; naming them on
  // every Apply Grants press is noise, and noise is how the line that
  // matters gets skimmed past. See feats-workflow's isSetupChoice.
  if (FOUNDATION_ITEM_TYPES.includes(sourceItem.type)) {
    const { setupChoicePending, featAutomationHint } = await import("./feats-workflow.mjs");
    // ONE BUTTON, ONE LINE (3.552.3). The choice blocks above already say
    // "press Use on <item>" when the item declares a specialistChoice,
    // skillChoice or spellChoice, so adding the generic nudge as well
    // told the player twice, in two different wordings, about the same
    // button. Seen live on the Human's ethnicity lore, 15 Sep 2026.
    const alreadyNamed = ["specialistChoice", "skillChoice", "spellChoice"]
      .some((flag) => Boolean(sourceItem.getFlag?.("trg-prime", flag)));
    if (!alreadyNamed && setupChoicePending(actor, sourceItem)) {
      anyRequested = true;
      lines.push(line(
        `<strong>${sourceItem.name} also has a choice to make:</strong> ` +
        `${featAutomationHint(sourceItem.name, sourceItem.type)} — press <em>Use</em> on ${sourceItem.name}.`
      ));
    }
    for (const granted of Array.from(actor.items ?? [])) {
      if (granted.flags?.["trg-prime"]?.grantedBy?.sourceId !== sourceItem.id) continue;
      // A choice already made is not a choice to make — including the
      // ones the BOOK made: Martial Artist's Weapon Focus arrives set to
      // Brawling and Miner's Favoured Terrain to Underground, applied by
      // the qualifier block above, and both record their answer where
      // `setupChoicePending` reads it.
      if (!setupChoicePending(actor, granted)) continue;
      anyRequested = true;
      lines.push(line(
        `<strong>${granted.name} needs a choice:</strong> ` +
        `${featAutomationHint(granted.name, granted.type)} — press <em>Use</em> on ${granted.name}.`
      ));
    }
  }

  if (!anyRequested) {
    lines.push(line("Nothing to grant."));
  }

  // A DELIBERATE PRESS ALWAYS GETS AN ANSWER. Pressing Apply Grants and
  // seeing nothing happen is indistinguishable from a broken button, so the
  // card is posted even when it says "Nothing to grant." Only the automatic
  // level-up pass asks to be quiet, and only when there is genuinely nothing
  // new to report.
  // …and a pass that found a PROBLEM is never quiet, however many times it
  // has already been run. A missing compendium entry is fixable and stays
  // broken until someone is told about it.
  if (!(quietIfNothingNew && changed === 0 && problems === 0)) {
    await postCard(actor, `${sourceItem.name} — Apply Grants`, lines);
  }
  return { lines, changed };
}

/**
 * The `usesPerDay` a granting item declares for one of its spells, or null.
 * Keys match by name without case. (3.627.0)
 */
function grantedSpellUsesFor(sourceItem, spellName) {
  const table = sourceItem?.flags?.["trg-prime"]?.grantedSpellUses;
  if (!table || typeof table !== "object") return null;
  const wanted = String(spellName ?? "").trim().toLowerCase();
  for (const [name, uses] of Object.entries(table)) {
    if (String(name).trim().toLowerCase() === wanted) return String(uses);
  }
  return null;
}
