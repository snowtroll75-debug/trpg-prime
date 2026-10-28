/**
 * Configuration for every "Add" button on the sheet: which pack it
 * searches, and — for slots with an automatic filter — which extra
 * index fields the filter needs (Foundry's default compendium index
 * only carries _id/name/img/type, so anything a filter inspects has
 * to be requested explicitly).
 *
 * Kept as one place to add a new slot rather than scattered per
 * button, matching the same "reusable, not bespoke per section"
 * design as the grant-resolution mechanism itself.
 */
import { sourceEntryId } from "./items.mjs";
import { SKILLS } from "./config.mjs";
import { pickerSpecialistAllowed } from "./aspect-rules.mjs";
import { meetsParseablePrerequisites, prerequisiteNameKey } from "./prerequisites.mjs";
import { meetsProgressionRequirement } from "./archetype-progression.mjs";
import { CLASS_SKILL_GRANTS } from "./class-skills.mjs";
import { registeredClassNames, registeredArchetypeNames, hasRegisteredFeatAccess, featGateBlock, exclusiveFeatConflict } from "./module-api.mjs";
import { contentPacksFor } from "./content-packs.mjs";
import { actorSenses } from "./senses.mjs";
import { resolveCasterStyle } from "./magic/caster-style.mjs";

/**
 * Classes a feat's prerequisites BAR it to.
 *
 * Chapter 5 writes these as a "Non-<Class>" clause: Warrior is
 * "Athletics 2 ranks, Str +2, Dex +2, Non-Fighter", and every archetype
 * that mirrors a class carries one — Thief/Non-Rogue, Warden/Non-Ranger,
 * Priest/Non-Cleric, Champion/Non-Crusader, Animist/Non-Druid,
 * Arcanist/Non-Wizard, Gleeman/Non-Bard — as do Stealthy Strike and
 * Spell Adept.
 *
 * Nothing in this system read a prerequisite before 3.204.0, so a Fighter
 * has always been offered Warrior. This reads the one clause that can be
 * decided from data the picker already has; ranks, ability minimums and
 * BAB thresholds are still on the player to check.
 *
 * "Non-pure spellcaster" (Spell Adept) is deliberately NOT matched: it is
 * a category, not a class name, and guessing at which classes count as
 * pure spellcasters is the kind of inference that ends up wrong.
 *
 * @param {string} prerequisites The printed line.
 * @returns {string[]} Lower-cased class names this feat is barred to.
 */
export function barredClasses(prerequisites) {
  const CLASS_NAMES = ["bard", "cleric", "crusader", "druid", "fighter", "ranger", "rogue", "wizard"];
  const barred = [];
  for (const match of String(prerequisites ?? "").matchAll(/\bNon-([A-Za-z]+)/gi)) {
    const name = match[1].toLowerCase();
    // A module class (3.563.0) can be barred by name the same way.
    if (CLASS_NAMES.includes(name) || registeredClassNames().includes(name)) barred.push(name);
  }
  return barred;
}

/**
 * Whether a character of these classes may take this feat at all.
 *
 * Their effective classes are used, not just the class item's name, so an
 * archetype that opens another class's list cannot be used to sidestep
 * the bar either.
 */
export function meetsClassPrerequisite(entry, className) {
  const barred = barredClasses(entry?.system?.prerequisites);
  if (!barred.length) return true;
  const mine = String(className ?? "")
    .split(/,\s*/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return !barred.some((name) => mine.includes(name));
}

/** The three class TYPES (Chapter 3). The Bard is "Adept/Expert". */
const TIER_NAMES = ["martial", "expert", "adept"];

/**
 * Does this feat carry the Companion trait?
 *
 * Nineteen do, and every one of them is filed under the General
 * category — so this trait is the only thing that tells a companion's
 * feat from a character's. Exported because the harness checks the pack
 * against it, and because "which feats are companion feats" is a
 * question worth having ONE answer to.
 */
/**
 * The companion kind a feat belongs to (3.674.0, C4): its declared
 * `flags.trg-prime.companionKind`, else "animal" for a Companion-trait feat
 * (the Animal Companion's own), else "" (not a companion feat).
 */
export function companionFeatKind(entry) {
  const declared = String(entry?.flags?.["trg-prime"]?.companionKind ?? "").trim().toLowerCase();
  if (declared) return declared;
  return hasCompanionTrait(entry) ? "animal" : "";
}

export function hasCompanionTrait(entry) {
  return String(entry?.system?.traits ?? "")
    .split(/,\s*/)
    .some((trait) => trait.trim().toLowerCase() === "companion");
}

export const PICKER_SLOTS = Object.freeze({
  race: { pack: "races", title: "Add Race" },
  heritage: {
    pack: "heritages",
    title: "Add Heritage",
    fields: ["system.sourceRace"]
  },
  // THE CLASS SLOT SPANS TWO PACKS (Graham, 3.263.0). The sixteen
  // creature classes shipped in 3.253.x and were never reachable from
  // this button — the slot named one pack and the creature classes were
  // in the other. A character and a creature both pick "a class"; they
  // simply default to different halves of the list, which is what the
  // Kind facet below does.
  class: { pack: ["classes", "creature-classes"], title: "Add Class" },
  background: { pack: "backgrounds", title: "Add Background" },
  // A CAMPAIGN ORIGIN (3.250.0). A character has exactly one, which this
  // sheet expresses through SINGLE_SLOTS — a warning rather than a
  // refusal or a silent swap, the same latitude race, heritage,
  // background, class and creature type each get.
  origin: {
    pack: "origins",
    title: "Add Origin",
    // Two of the ten are restricted to a race by their own heading
    // ("Dwarven Artisan Clan - Dwarf Only"), and system.sourceRace is
    // the field a heritage is already filtered on — so this is the same
    // gate rather than a second one. Requested as an index field for
    // the reason every other gate here carries in its comment: an
    // unrequested field reads undefined and offers everything.
    fields: ["system.sourceRace"]
  },
  creatureType: { pack: "creature-types", title: "Add Creature Type" },
  // excludeOwned (this slot and every other one below it down to
  // classAbility): a second copy of the SAME pack entry is never a
  // legitimate pick for a feat/ability/aspect/school — unlike a weapon or
  // a spell, there's no version of "own two" that means anything. Nothing
  // excluded this until 3.230.8; found live picking the same racial feat
  // twice for one character and creating two fully independent items.
  divineAspect: { pack: "divine-aspects", title: "Add Divine Aspect", excludeOwned: true },
  wizardSchool: { pack: "wizard-schools", title: "Add Wizard School", excludeOwned: true },
  racialFeat: {
    pack: "feats",
    title: "Add Racial Feat",
    fields: ["system.category", "system.sourceRace", "system.prerequisites", "system.repeatable", "system.repeatLimit"],
    excludeOwned: true
  },
  archetypeFeat: {
    pack: "feats",
    title: "Add Archetype Feat",
    // "system.traits" is what the filter's tier/archetype/class gate below
    // actually reads (entry.system?.traits) — without it in the index
    // request, Foundry's default index (_id/name/img/type only) means every
    // entry's traits read back as undefined and the gate passes everyone.
    fields: ["system.category", "system.prerequisites", "system.traits", "system.repeatable", "system.repeatLimit"],
    excludeOwned: true
  },
  classFeat: {
    pack: "feats",
    title: "Add Class Feat",
    // Same reasoning as archetypeFeat above — the tier/archetype/class gate
    // needs system.traits requested, or it silently gates nobody.
    fields: ["system.category", "system.sourceClass", "system.prerequisites", "system.traits", "system.repeatable", "system.repeatLimit"],
    excludeOwned: true
  },
  generalFeat: {
    pack: "feats",
    title: "Add General Feat",
    // "system.traits" is what the Companion gate below reads. Foundry's
    // default index carries _id/name/img/type only, so a field that is
    // not requested reads back undefined for every entry and the gate
    // silently passes everyone — the exact fault archetypeFeat and
    // classFeat each had to be taught, and the reason this slot could
    // not simply be given a filter. "system.repeatable" (3.339.0) is the
    // same trap pointing the other way: unrequested, it reads undefined,
    // every repeatable feat looks non-repeatable, and the fix silently
    // does nothing at all. "system.repeatLimit" (3.359.0) joins it for
    // exactly the same reason — an unrequested cap is no cap.
    // "flags.trg-prime.companionKind" (3.674.0, C4): the kind a companion
    // feat belongs to, read by the gate below — unrequested it would read
    // undefined and every dragon feat would be offered to every wolf.
    fields: ["system.category", "system.prerequisites", "system.traits", "system.repeatable", "system.repeatLimit", "flags.trg-prime.companionKind"],
    excludeOwned: true
  },
  // ONE table holds racial and Creature Codex abilities (Graham,
  // 3.266.0), so one button adds to it — spanning both packs the way
  // the class slot does, with a Kind facet that opens on whichever half
  // suits the actor.
  racialAbility: {
    pack: ["abilities", "creature-abilities"],
    title: "Add Racial or Creature Ability",
    fields: ["system.category", "system.sourceRace"],
    excludeOwned: true
  },
  classAbility: {
    pack: "abilities",
    title: "Add Class/Proficiency Ability",
    fields: ["system.category", "system.sourceClass"],
    excludeOwned: true
  },
  spell: {
    pack: "spells",
    title: "Add Spell",
    fields: ["system.tradition", "system.specialist", "system.specialistClass"]
  },
  weapon: { pack: "weapons", title: "Add Weapon", purchasable: true, customisable: true },
  armour: { pack: "armour", title: "Add Armour", purchasable: true, customisable: true },
  shield: { pack: "shields", title: "Add Shield", purchasable: true, customisable: true },
  ammunition: { pack: "ammunition", title: "Add Ammunition", purchasable: true },
  gear: { pack: "gear", title: "Add Gear", purchasable: true },
  consumable: { pack: "consumables", title: "Add Consumable", purchasable: true },
  // CHARGED, WONDROUS AND SPECIFIC ITEMS (Chapter 11). All three packs
  // shipped with no way at all to add them to a sheet: charged and
  // wondrous items are stored as `gear` and so were invisible beside the
  // rucksacks, and the specific armour and weapons had no picker of
  // their own anywhere. Graham found all of it live at 3.246.1.
  //
  // `purchasable` on each, because these are things a character buys —
  // and a Staff of Fire at 9,000 gp is exactly the case the purchase
  // path exists for.
  chargedItem: { pack: "charged-items", title: "Add Charged Item", purchasable: true },
  wondrous: { pack: "wondrous", title: "Add Wondrous Item", purchasable: true },
  specificItem: { pack: "specific-items", title: "Add Specific Armour or Weapon", purchasable: true },
  // The alchemical items (Chapter 6): elixirs, herbs, oils, poisons and
  // vials. Their own pack rather than folded into the magical
  // consumables, because they are made by "natural or scientific means"
  // and priced off their own ladder — and because a player looking for a
  // poison is not looking for a Potion of Cure.
  alchemical: { pack: "alchemical", title: "Add Alchemical Item", purchasable: true }
});

/**
 * The drop-down filters each picker offers, beside its search box.
 *
 * Graham, 3.247.4: "I want the filters to apply to the add boxes so that
 * a character can filter what they are picking from the lists." So the
 * facets are declared per SLOT, next to the pack each slot draws on, and
 * the picker derives the actual options from the entries on offer — a
 * facet with fewer than two distinct values is not shown at all.
 *
 * `fields` are the extra index fields the facet needs; without them
 * Foundry's default index carries only _id/name/img/type and every read
 * comes back undefined, which is the mistake the feat slots' own
 * `system.traits` gate already made once.
 */
export const PICKER_FACETS = Object.freeze({
  weapon: [
    { key: "group", label: "Group", fields: ["system.group"],
      read: (entry) => entry.system?.group },
    { key: "category", label: "Category", fields: ["system.category"],
      read: (entry) => entry.system?.category }
  ],
  armour: [
    { key: "category", label: "Category", fields: ["system.category"],
      read: (entry) => entry.system?.category }
  ],
  // Shields carry no category or size field of their own in the pack, so
  // they get no facet rather than a menu built from a path that is
  // always undefined. Twelve shields is a list you can read.
  shield: [],
  gear: [
    { key: "category", label: "Kind", fields: ["system.gearCategory"],
      read: (entry) => entry.system?.gearCategory }
  ],
  // The consumables' kind is where the builder already put it — a flag,
  // not a system field. Reading a field that does not exist would have
  // offered no menu and looked like a design decision rather than a
  // wrong path, which is why every facet above was checked against the
  // real pack before shipping.
  consumable: [
    { key: "kind", label: "Kind", fields: ["flags.trg-prime.consumable.kind"],
      read: (entry) => entry.flags?.["trg-prime"]?.consumable?.kind }
  ],
  ammunition: [
    { key: "weapon", label: "For", fields: ["system.compatibleWeaponGroup"],
      read: (entry) => entry.system?.compatibleWeaponGroup }
  ],
  chargedItem: [
    { key: "kind", label: "Kind", fields: ["flags.trg-prime.chargedItem.kind"],
      read: (entry) => entry.flags?.["trg-prime"]?.chargedItem?.kind }
  ],
  wondrous: [
    { key: "slot", label: "Slot", fields: ["system.slot"],
      read: (entry) => entry.system?.slot }
  ],
  alchemical: [
    { key: "kind", label: "Kind", fields: ["flags.trg-prime.alchemical.section"],
      read: (entry) => entry.flags?.["trg-prime"]?.alchemical?.section },
    { key: "delivery", label: "Delivery", fields: ["flags.trg-prime.alchemical.delivery"],
      read: (entry) => entry.flags?.["trg-prime"]?.alchemical?.delivery }
  ],
  specificItem: [
    { key: "type", label: "Type", fields: [],
      read: (entry) => entry.type }
  ],
  spell: [
    { key: "tradition", label: "Tradition", fields: ["system.tradition"],
      read: (entry) => entry.system?.tradition },
    { key: "pp", label: "PP", fields: ["system.ppCost"],
      read: (entry) => entry.system?.ppCost }
  ],
  // Which half of the class list to show. `defaultValue` is set per
  // actor by classFacets() below rather than fixed here, because the
  // answer depends on who is picking.
  class: [
    { key: "kind", label: "Kind", fields: [],
      read: (entry) => (entry._pack === "creature-classes" ? "Creature" : "Character") }
  ],
  racialAbility: [
    { key: "kind", label: "Kind", fields: [],
      read: (entry) => (entry._pack === "creature-abilities" ? "Creature" : "Racial") }
  ],
  racialFeat: FEAT_FACETS(),
  archetypeFeat: FEAT_FACETS(),
  classFeat: FEAT_FACETS(),
  generalFeat: FEAT_FACETS()
});

function FEAT_FACETS() {
  return [
    { key: "category", label: "Category", fields: ["system.category"],
      read: (entry) => entry.system?.category }
  ];
}

/**
 * The facets for a slot, or none.
 *
 * `actor` is optional and only the class slot reads it: a creature's
 * picker opens on creature classes and a character's on character
 * classes, with the other set one menu-click away. Defaulting rather
 * than filtering is deliberate — an NPC built on a PC class is a thing
 * the Codex explicitly allows ("Some creatures will have a PC or NPC
 * class instead of a Creature Class (this is often the case with
 * humanoids)"), so hiding the other half outright would contradict the
 * page.
 */
export function facetsFor(slotKey, actor = null) {
  const facets = PICKER_FACETS[slotKey] ?? [];
  if (!actor) return facets;
  if (slotKey === "class") {
    return facets.map((facet) => facet.key === "kind"
      ? { ...facet, defaultValue: defaultClassKind(actor) }
      : facet);
  }
  if (slotKey === "racialAbility") {
    return facets.map((facet) => facet.key === "kind"
      ? { ...facet, defaultValue: defaultAbilityKind(actor) }
      : facet);
  }
  return facets;
}

/**
 * Which half of the ability list this actor opens on.
 *
 * Same rule as the class picker, and read from the actor's TYPE for the
 * same reason: a fresh NPC owns nothing, which is when the default
 * matters most.
 */
export function defaultAbilityKind(actor) {
  return String(actor?.type ?? "").toLowerCase() === "npc" ? "Creature" : "Racial";
}

/**
 * Which half of the class list this actor opens on.
 *
 * Read from the actor's TYPE, not from what it currently owns: a fresh
 * NPC owns nothing, and that is exactly when the default matters most.
 */
export function defaultClassKind(actor) {
  return String(actor?.type ?? "").toLowerCase() === "npc" ? "Creature" : "Character";
}


/**
 * The set of pack-entry ids the actor already owns a copy of, scoped to
 * ONE compendium pack and matched by `_stats.compendiumSource`'s trailing
 * id (sourceEntryId) — never by name. Several packs in this system
 * genuinely ship duplicate names (two different "Sleep" spells at
 * different PP costs), so a name match can't reliably tell "already have
 * this one" from "coincidentally shares a name with something else."
 *
 * An item with no recorded compendiumSource (hand-built on the sheet, or
 * from before 3.230.7 started stamping it on picker-created items) simply
 * never excludes anything — the same "fail open, don't guess" shape as
 * the rest of this file's filters.
 */
/**
 * The compendium-source prefixes that count as "this slot's pack": the
 * system pack and every module pack federated into it (3.627.0).
 *
 * Before 3.627.0 only `Compendium.trg-prime.<pack>.` was recognised, so a
 * feat picked from a module pack (`Compendium.trg-pillars-of-faith.pof-feats.…`)
 * never counted as owned and could be picked a second time — every
 * Pillars of Faith feat since 0.4.0. Found in the Chapter 9 audit.
 */
function ownedSourcePrefixes(packName, packs = globalThis.game?.packs) {
  const prefixes = [`Compendium.trg-prime.${packName}.`];
  for (const pack of contentPacksFor(packName, packs)) {
    const id = pack?.collection ?? (pack?.metadata ? `${pack.metadata.packageName}.${pack.metadata.name}` : "");
    if (id && !prefixes.includes(`Compendium.${id}.`)) prefixes.push(`Compendium.${id}.`);
  }
  return prefixes;
}

export function ownedSourceIds(actor, packName, packs = globalThis.game?.packs) {
  const prefixes = ownedSourcePrefixes(packName, packs);
  const ids = new Set();
  for (const item of Array.from(actor?.items ?? [])) {
    const source = item?._stats?.compendiumSource;
    if (typeof source !== "string" || !prefixes.some((prefix) => source.startsWith(prefix))) continue;
    const id = sourceEntryId(source);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Wraps a slot's own automatic filter (buildPickerFilter's result, which
 * may be null) with the excludeOwned exclusion above, when the slot asks
 * for it. Composed rather than baked into buildPickerFilter itself, since
 * buildPickerFilter is pure (entry) => boolean with no actor reference —
 * ownership is a different kind of question, about the actor, not the
 * entry's own data, and answering it needs the actor.
 */
export function withOwnedExclusion(baseFilter, actor, slotKey) {
  const slot = PICKER_SLOTS[slotKey];
  if (!slot?.excludeOwned) return baseFilter;
  const owned = ownedSourceIds(actor, slot.pack);
  if (!owned.size) return baseFilter;
  const stats = actorPrerequisiteStats(actor);
  return (entry) => {
    if (baseFilter && !baseFilter(entry)) return false;
    if (!owned.has(entry._id)) return true;
    if (!isRepeatable(entry)) return false;
    // A REPEATABLE FEAT MAY STILL HAVE A CEILING. See `repeatLimitOf`:
    // eleven of the fourteen have none, and Professional Specialist's
    // "never more than your INT +1" had been printed on its card and
    // enforced nowhere since the repeatable flag was introduced.
    return ownedCopies(actor, slot.pack, entry._id) < repeatLimitOf(entry, stats);
  };
}

/**
 * Whether a pack entry may legitimately be owned more than once.
 *
 * CHAPTER 5: "unless stated in its individual description, each feat may
 * only be selected once." FOURTEEN FEATS STATE OTHERWISE — Weapon Focus
 * "on each occasion selecting a different weapon group", Skill Focus a
 * different skill, and so on through Armour Focus, Weapon Proficient,
 * Specialist Spell, Elemental Spell, Favoured Terrain, Toughness and the
 * four specialty feats.
 *
 * The exclusion above was right for 422 feats and wrong for these
 * fourteen, because the exception is printed in prose inside each feat's
 * own description, where no gate could see it. 3.339.0 lifts it into
 * `system.repeatable` so the gate can.
 *
 * READS THE FIELD, NOT A LIST OF NAMES. A name list here would have to be
 * kept in step by hand with the pack, and the pack is the thing the book
 * was transcribed into — so the pack is where the fact belongs.
 *
 * THE FIELD MUST BE REQUESTED IN THE SLOT'S `fields`, or Foundry's
 * default index returns undefined for it and every repeatable feat reads
 * as non-repeatable — which is silently the old, broken behaviour rather
 * than a visible failure. This file has been caught by exactly that three
 * times already (system.traits on archetypeFeat, classFeat and
 * generalFeat), so the harness asserts the request as well as the read.
 *
 * @param {object} entry A compendium index entry.
 * @returns {boolean}
 */
export function isRepeatable(entry) {
  return Boolean(entry?.system?.repeatable);
}

/**
 * How many copies of a repeatable feat a character may hold.
 *
 * ELEVEN OF THE FOURTEEN SAY "as many as you like, each time choosing
 * something different" — Weapon Focus a different weapon group, Skill
 * Focus a different skill — and for those the answer is Infinity: the
 * choosing is the limit, and it is made when the feat is used rather than
 * when it is picked.
 *
 * ONE SAYS OTHERWISE, and it went unenforced from 3.339.0 until this
 * audit. Professional Specialist: "you may select this feat multiple
 * times, but never more than your INT +1." The cap was printed on the
 * feat's own card and nowhere else, so a character could take it six
 * times with an Intelligence of 1 and be told, politely, six times, that
 * they should not have.
 *
 * DECLARED AS A FORMULA ON THE ENTRY, not as a name in this file. A list
 * here would need keeping in step by hand with the pack, and the pack is
 * where the book was transcribed — the same reasoning `isRepeatable`
 * already follows for the field beside it.
 *
 * @param {object} entry  a compendium index entry
 * @param {object} stats  from `actorPrerequisiteStats`
 * @returns {number} the cap, or Infinity when the feat names none
 */
export function repeatLimitOf(entry, stats = {}) {
  const raw = entry?.system?.repeatLimit;
  if (raw === null || raw === undefined || raw === "") return Infinity;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.max(0, raw) : Infinity;

  // "intelligence + 1" — an ability name and an optional offset, which is
  // the only shape the chapter prints. Anything else is left as no cap
  // rather than guessed at: a limit nobody can read is worse than none.
  const match = /^\s*([a-z]+)\s*(?:([+-])\s*(\d+))?\s*$/i.exec(String(raw));
  if (!match) return Infinity;
  const ability = Number(stats?.abilities?.[match[1].toLowerCase()]);
  if (!Number.isFinite(ability)) return Infinity;
  const offset = match[2] ? Number(match[3]) * (match[2] === "-" ? -1 : 1) : 0;
  return Math.max(0, ability + offset);
}

/** How many copies of this pack entry the actor already holds. */
export function ownedCopies(actor, packName, entryId, packs = globalThis.game?.packs) {
  const prefixes = ownedSourcePrefixes(packName, packs);
  let count = 0;
  for (const item of Array.from(actor?.items ?? [])) {
    const source = item?._stats?.compendiumSource;
    if (typeof source !== "string" || !prefixes.some((prefix) => source.startsWith(prefix))) continue;
    if (sourceEntryId(source) === entryId) count += 1;
  }
  return count;
}

// The four feat slots — the only ones whose entries carry a
// `system.prerequisites` free-text field the picker already reads (for
// the Non-Class bar) and already requests as an index field. Racial/class
// Ability slots carry prerequisites text on some entries too (38 of 64
// abilities), but neither requests "system.prerequisites" as an index
// field nor gates on it today — extending this there is a reasonable
// follow-up, deliberately left out of this pass rather than widened
// without the same field-request plumbing and test coverage this one got.
const PREREQUISITE_GATED_SLOTS = new Set(["racialFeat", "archetypeFeat", "classFeat", "generalFeat"]);

/**
 * The actor stats module/prerequisites.mjs's meetsParseablePrerequisites
 * needs, read off the actor's OWN resolved data (post-bonus totals, not
 * base values) — level, BAB, BSB, all six ability totals, and every
 * skill's current ranks.
 */
function actorPrerequisiteStats(actor) {
  const system = actor?.system ?? {};
  const abilities = {};
  for (const key of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
    abilities[key] = Number(system.attributes?.[key]?.total ?? 0);
  }
  const skillRanks = {};
  for (const key of Object.keys(SKILLS)) {
    skillRanks[key] = Number(system.skills?.[key]?.ranks ?? 0);
  }
  // WHAT THIS ACTOR HAS, for prerequisites that name a feat. Abilities
  // are included beside feats because the printed text does not
  // distinguish them — six feats require "Wild Shape", which is a Druid
  // CLASS ABILITY item, and one requires "Divine Ally". Whether a
  // requirement is stored as a feat or an ability is an implementation
  // detail of this system, not something the book knows about.
  const ownedNames = new Set(
    Array.from(actor?.items ?? [])
      .filter((item) => item?.type === "feat" || item?.type === "ability")
      .map((item) => prerequisiteNameKey(item.name))
  );

  // THE SPECIAL SENSES IT HAS, by modality (3.632.0) — the Enhanced sense
  // feats' "Any special visual sense". The same derive the sheet shows.
  const specialSenseModalities = new Set(
    actorSenses(system, Array.from(actor?.items ?? []))
      .filter((sense) => sense.special && sense.modality)
      .map((sense) => String(sense.modality).toLowerCase())
  );

  return {
    ownedNames,
    specialSenseModalities,
    level: Number(system.identity?.level ?? 0),
    bab: Number(system.combat?.bab?.total ?? 0),
    // Same sum documents/actor.mjs's own spellcraft resolution already
    // uses for "BSB and tradition ability" — no single stored BSB-total
    // field exists the way combat.bab.total does, so this mirrors that
    // computation rather than inventing a second one.
    bsb: Number(system.magic?.bsb ?? 0) + Number(system.progression?.bsb ?? 0),
    abilities,
    skillRanks,
    // HOW THE CLASS CASTS (3.671.0), for "Learned Caster" (Inner Tempest's
    // Shugenja; ruling IT-C9: "only available to Learned casters (such as
    // the cleric, druid and wizard)"). "" for a class that casts nothing.
    // RESOLVED, as the actor derives it (an Enigma Wizard is instinctive):
    // the class's own style with any owned item's override.
    casterStyle: String(resolveCasterStyle(Array.from(actor?.items ?? []).find((i) => i?.type === "class")?.system?.casterStyle ?? "", Array.from(actor?.items ?? [])) ?? "").trim().toLowerCase()
  };
}

/**
 * Wraps a slot's own automatic filter with the Chapter 5 prerequisite gate
 * (module/prerequisites.mjs), for the feat slots whose entries carry
 * prerequisites text. Composed rather than baked into buildPickerFilter
 * itself, for the same reason withOwnedExclusion above is: buildPickerFilter
 * is pure (entry) => boolean with no actor reference, and checking an
 * actor's own stats needs the actor.
 */
export function withPrerequisitesGate(baseFilter, actor, slotKey, knownNames = null) {
  if (!PREREQUISITE_GATED_SLOTS.has(slotKey)) return baseFilter;
  // `knownNames` is what lets a clause be recognised as the name of a
  // feat rather than as prose — see meetsParseablePrerequisites. Absent,
  // named clauses go on passing open exactly as they always did, which
  // is why every existing caller keeps working unchanged.
  const stats = { ...actorPrerequisiteStats(actor), knownNames: knownNames ?? null };
  return (entry) =>
    (baseFilter ? baseFilter(entry) : true) &&
    meetsParseablePrerequisites(entry.system?.prerequisites, stats);
}

/**
 * The Heritage trait: "the feat may be selected at 1st level only."
 * Graham's ruling, 9 Sep 2026 — CHARACTER LEVEL 1, full stop.
 *
 * NOTHING READ THIS TRAIT BEFORE 3.544.0. Six feats carry it —
 * Half-Elf, Half-Orc, Half-Ogre, Beastman, Adoptive Race and Enigma —
 * spread across three categories, and every one of them was offered at
 * every level.
 *
 * BEASTMAN SHOWS HOW IT WAS MEANT TO WORK AND DIDN'T: its prerequisites
 * field reads "Level 1 only", written as prose because there was no
 * mechanism to write it into. It would not have worked even if parsed —
 * a level clause is a MINIMUM, so "Level 1" is satisfied by everyone
 * from 1st onward. Prose is not a mechanism, and a prerequisite that
 * reads as its own opposite is worse than none.
 *
 * NOT FOLDED INTO buildPickerFilter, which is pure `(entry) => boolean`
 * with no actor to read a level off — the same reason withOwnedExclusion
 * and withPrerequisitesGate are composed around it rather than baked in.
 *
 * @param {Function|null} baseFilter
 * @param {object} actor
 * @param {string} slotKey
 * @returns {Function|null}
 */
export function withHeritageGate(baseFilter, actor, slotKey) {
  if (!PREREQUISITE_GATED_SLOTS.has(slotKey)) return baseFilter;
  const level = Number(actor?.system?.identity?.level ?? 0);
  // AT 1st LEVEL NOTHING IS HIDDEN, so the wrapper gets out of the way
  // entirely rather than re-testing every entry to reach the same answer.
  if (level <= 1) return baseFilter;
  return (entry) => {
    if (baseFilter && !baseFilter(entry)) return false;
    return !hasHeritageTrait(entry);
  };
}

/** Does this entry carry the Heritage trait? */
export function hasHeritageTrait(entry) {
  return String(entry?.system?.traits ?? "")
    .split(/,\s*/)
    .map((t) => t.trim().toLowerCase())
    .includes("heritage");
}

/**
 * Why the Heritage feats are missing, for a character past 1st level —
 * or null when they are not being hidden.
 *
 * SAID OUT LOUD rather than left to be noticed. A player who read
 * "Heritage" in the book and cannot find Half-Elf in the list has no way
 * to tell a rule from a bug, which is precisely how this defect survived:
 * the feats were VISIBLE when they should have been hidden, and nobody
 * could see the rule was missing either.
 */
export function heritageBlockReason(actor) {
  const level = Number(actor?.system?.identity?.level ?? 0);
  if (level <= 1) return null;
  return `Heritage feats may be selected at 1st level only — this character is level ${level}.`;
}

// The three archetype feats gained through a "prerequisites waived"
// chooser (Martial Training, Archetypal Path, Priestly Path —
// module/feats-workflow.mjs) explicitly do not require their own
// Progression Requirements before selecting another archetype ("does not
// require you to complete its progression requirements before selecting
// another archetype... may run two archetypes at once" — each chooser's
// own printed text). Those choosers stamp their OWN name as
// flags["trg-prime"].grantedBy.sourceName on the archetype item they
// grant, which is how an ordinary pick (nothing stamps grantedBy for the
// generic addItemFromPicker flow — it stamps addedFrom instead) is told
// apart from a waived one here.
const ARCHETYPE_WAIVER_ABILITY_NAMES = new Set(["martial training", "archetypal path", "priestly path"]);

/** The actor's owned Archetype feats that were picked ORDINARILY — i.e.
 * still subject to their own Progression Requirements before a second,
 * different archetype can be picked. */
function ownedOrdinaryArchetypeFeats(actor) {
  return Array.from(actor?.items ?? []).filter((item) => {
    if (item?.type !== "feat" || item?.system?.category !== "Archetype") return false;
    const sourceName = String(item?.flags?.["trg-prime"]?.grantedBy?.sourceName ?? "").toLowerCase();
    if (ARCHETYPE_WAIVER_ABILITY_NAMES.has(sourceName)) return false;
    // AN ARCHETYPE A CLASS ITSELF HANDS OVER IS WAIVED TOO (3.563.0).
    // Pillars of Faith's Folkwarden: "You gain the Alchemist archetype
    // feat as a bonus feat... does not impose its normal Progression
    // Requirements upon you." The class's grantedFeats path stamps the
    // CLASS as the source, so the granting item's type is the test. No
    // core class grants an archetype this way, so nothing else moves.
    const sourceId = item?.flags?.["trg-prime"]?.grantedBy?.sourceId;
    if (sourceId && actor?.items?.get?.(sourceId)?.type === "class") return false;
    return true;
  });
}

/**
 * Whether the actor currently has an ordinarily-picked archetype whose
 * Progression Requirements aren't (safely-parseably) met yet — the state
 * that blocks picking any OTHER archetype feat at all.
 * @returns {object|null} the blocking archetype feat item, or null if
 *   nothing blocks.
 */
function blockingArchetype(actor) {
  const stats = actorPrerequisiteStats(actor);
  return (
    ownedOrdinaryArchetypeFeats(actor).find(
      (feat) => !meetsProgressionRequirement(feat.system?.progressionRequirements, stats, archetypeGrantContext(actor, feat))
    ) ?? null
  );
}

/**
 * "GAINED CLASS SKILL +N RANKS" (3.671.0, Inner Tempest's Inner Adept):
 * the skill this archetype's own class-skill grant chose, read where the
 * grant records it (`flags.trg-prime.<flag>.skill`). Grants are keyed by
 * the feat's lowercased name, as useClassSkillGrant finds them.
 */
export function archetypeGrantContext(actor, feat) {
  const name = String(feat?.name ?? "").trim().toLowerCase();
  const grant = CLASS_SKILL_GRANTS.find((g) => String(g?.name ?? "").trim().toLowerCase() === name);
  if (!grant) return { hasGrant: false, grantedSkill: "" };
  const record = actor?.flags?.["trg-prime"]?.[grant.flag];
  return { hasGrant: true, grantedSkill: String(record?.skill ?? "") };
}

/**
 * Wraps the archetypeFeat slot's filter with the "one archetype at a
 * time" gate (Chapter 5): if the actor already holds an ordinarily-picked
 * archetype whose own Progression Requirements aren't met, no OTHER
 * archetype feat is offered at all until they are. Every other slot
 * passes through unchanged — this rule is specific to archetypeFeat.
 */
/** The four feat slots a feat gate or exclusive group applies to. */
const FEAT_GATED_SLOTS = Object.freeze(["racialFeat", "archetypeFeat", "classFeat", "generalFeat"]);

/** The names of the feats an actor owns, as the gates read them. */
export function ownedFeatNames(actor) {
  return Array.from(actor?.items ?? []).filter((i) => i?.type === "feat").map((i) => String(i?.name ?? ""));
}

/**
 * Feat gates and exclusive groups a module registered (3.627.0).
 *
 * A feat carrying a gated trait is hidden until the actor owns one of the
 * feats that open it ("Type-specific class feats require the named
 * Unliving Archetype"); a feat in an exclusive group is hidden once
 * another member is owned ("a character may only ever select one Unliving
 * Archetype Feat"). Hide-only here, as every picker gate is; the second
 * half of the exclusive rule is the refusal in TRGItem._preCreate.
 */
export function withFeatGates(baseFilter, actor, slotKey) {
  if (!FEAT_GATED_SLOTS.includes(slotKey)) return baseFilter;
  const owned = ownedFeatNames(actor);
  return (entry) => {
    if (baseFilter && !baseFilter(entry)) return false;
    if (featGateBlock(entry?.system?.traits, owned, entry?.name)) return false;
    if (exclusiveFeatConflict(entry?.name, owned)) return false;
    return true;
  };
}

export function withArchetypeProgressionGate(baseFilter, actor, slotKey) {
  if (slotKey !== "archetypeFeat") return baseFilter;
  if (!blockingArchetype(actor)) return baseFilter;
  return () => false;
}

/**
 * A player-facing explanation for why the archetypeFeat picker just
 * showed nothing, when withArchetypeProgressionGate is the reason —
 * otherwise null. Meant as pickFromPack's own `emptyMessage` option, so
 * the picker says WHY rather than just "no entries," the same courtesy
 * PICKER_SLOTS' other emptyMessage-worthy gaps already get.
 */
export function archetypeProgressionBlockReason(actor) {
  const feat = blockingArchetype(actor);
  if (!feat) return null;
  return (
    `You're still progressing ${feat.name} — its Progression Requirements ` +
    `("${feat.system?.progressionRequirements}") aren't met yet, so no other archetype ` +
    "feat is offered until they are."
  );
}

/**
 * Builds the automatic filter for a slot, given the actor's current
 * context. Slots with no automatic filter (most of them — gear,
 * weapons, races, classes, backgrounds, divine aspects, archetype
 * feats) return null, meaning "show everything in the pack."
 *
 * An entry with no source tag of its own (sourceRace/sourceClass
 * empty) always passes — an untagged feat or ability is available to
 * everyone rather than accidentally hidden by a filter it was never
 * meant to be subject to.
 *
 * @param {string} slotKey
 * @param {{race?: string, class?: string, tradition?: string,
 *   isCompanion?: boolean}} context
 * @returns {((entry: object) => boolean) | null}
 */
export function buildPickerFilter(slotKey, context = {}) {
  // `className` is the EFFECTIVE class list (the class item plus every
  // class list an owned archetype opens), used for gating which feats a
  // character can reach. `ownClass` is what they actually are, used for
  // the "Non-Fighter" bar — the two are different questions and conflating
  // them refused a Wizard-with-Thief every Non-Rogue feat.
  const {
    race = "", class: className = "", ownClass = className, tradition = "", tier = "",
    // Classes whose TRAIT gates only are opened (3.670.0; Inner Magic).
    traitClasses = "",
    // The heritage, for an access list limited to one (3.669.0).
    heritage = "",
    // Whether the sheet asking is a companion's. Read from the actor's
    // TYPE rather than guessed from its name or its master, because
    // "companion" is a document type in this system and nothing else
    // needs interpreting.
    isCompanion = false,
    // …and which kind (3.674.0, C4): "animal", "dragon", …
    companionKind = "animal",
    // What specialistSpellAccess needs (aspect-workflow's
    // specialistAccessFor), for the spell slot only. Absent, no
    // specialist spell is hidden — the behaviour before 3.623.0.
    specialistAccess = null
  } = context;

  // A source tag lists one OR MORE names ("Ascendan, Elf" — Chapter 5:
  // "you must satisfy at least one of these traits"). The character needs
  // just one in common; an untagged entry passes for everyone. Exact string
  // equality was the same bug the spell-tradition filter had — it would have
  // hidden every multi-race feat from everyone.
  const parseNames = (s) =>
    String(s ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const matchesSource = (sourceTag, actorValue) => {
    const tags = parseNames(sourceTag);
    if (!tags.length) return true;
    const mine = parseNames(actorValue);
    return tags.some((t) => mine.includes(t));
  };

  switch (slotKey) {
    case "heritage":
      return (entry) => matchesSource(entry.system?.sourceRace, race);
    case "origin":
      // An origin with no sourceRace is open to everyone, which is
      // matchesSource's own default — eight of the ten.
      return (entry) => matchesSource(entry.system?.sourceRace, race);
    case "racialFeat":
      // A registered access list (3.571.0) opens a feat tagged for
      // another race — Pillars' "Existing racial feats" — beside the tag.
      return (entry) =>
        entry.system?.category === "Racial" &&
        (matchesSource(entry.system?.sourceRace, race) || hasRegisteredFeatAccess("race", race, entry.name, heritage));
    case "classFeat":
      // Class feats gate on their TRAITS (Chapter 5): class names
      // (Fighter, Druid...) require one of the actor's effective classes
      // (own class + lists opened by archetypes — Animist opens Druid
      // feats, etc.); ARCHETYPE names (Archer, Aegis, Thief...) require
      // owning that archetype feat. Any-of across both kinds — Mobile
      // Shot ("Archer, Fighter, Ranger") is open to the Archer archetype
      // OR either class. Tier traits (Martial/Expert/Adept) pass ungated
      // until classes carry tier data (reconciliation). Archetype feats
      // themselves also count as class feats ("a special type of class
      // feat") but live in their own picker slot.
      return (entry) => {
        if (entry.system?.category !== "Class") return false;
        if (!meetsClassPrerequisite(entry, ownClass)) return false;
        // A CLASS'S TRAIT OPENED BY A FEAT (3.670.0 C11; 3.671.0) passes
        // the source gate for a feat that carries that trait: Steel
        // Disciple's Kensai-trait feats are source-tagged Kensai too, and
        // were refused here before the trait was read. A feat tagged for
        // the class without its trait stays closed.
        const ownTraits = parseNames(entry.system?.traits);
        const openedByTrait = parseNames(traitClasses).filter((c) => ownTraits.includes(c));
        if (!matchesSource(entry.system?.sourceClass, [className, ...openedByTrait].join(", "))) return false;
        const CLASS_NAMES = ["bard", "cleric", "crusader", "druid", "fighter", "ranger", "rogue", "wizard"];
        const ARCHETYPE_NAMES = ["adventurer", "aegis", "alchemist", "animist", "arcanist", "archer",
          "armour master", "artificer", "assassin", "blessed by the gods", "cavalier", "champion",
          "cloistered priest", "enigma", "gleeman", "gymnast", "language master", "loremaster",
          "mastermind", "medic", "priest", "primal warrior", "runemage", "thief", "vanguard",
          "warden", "war priest", "warrior"];
        const traitList = String(entry.system?.traits ?? "")
          .split(/,\s*/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        // Module classes and archetypes (3.560.0) gate the same way.
        const classGates = traitList.filter((t) => CLASS_NAMES.includes(t) || registeredClassNames().includes(t));
        const archetypeGates = traitList.filter((t) => ARCHETYPE_NAMES.includes(t) || registeredArchetypeNames().includes(t));
        // TIER traits — Martial, Expert, Adept — are a gate too, and the
        // comment that used to sit here said they "pass ungated until
        // classes carry tier data". Classes carry it now.
        //
        // This is not cosmetic. The Rogue's own printed rule is "class
        // feats ... for which you meet the prerequisites or match the
        // appropriate class trait (Rogue or Expert)", and Evasion is
        // traited "Advantage, Expert, Ranger" — so a Rogue was refused
        // the very feat their class hands them at 2nd level, and could
        // never take it back if they deleted it. Disarm Stance and
        // Stealthy Strike were hidden from them the same way.
        const tierGates = traitList.filter((t) => TIER_NAMES.includes(t));
        if (!classGates.length && !archetypeGates.length && !tierGates.length) return true;
        // A registered access list (3.571.0): "the Archivist also gains
        // access to Bardic Lore, Familiar..." — the feat's own trait says
        // Bard; the registration says the Archivist may take it too.
        if (hasRegisteredFeatAccess("class", className, entry.name)) return true;
        const myClasses = [className, traitClasses].join(", ")
          .split(/,\s*/)
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        const myArchetypes = String(context.archetypes ?? "")
          .split(/,\s*/)
          .map((a) => a.trim().toLowerCase())
          .filter(Boolean);
        const myTier = String(tier ?? "").toLowerCase()
          .split(/[,/]\s*/).map((t) => t.trim()).filter(Boolean);
        return classGates.some((g) => myClasses.includes(g)) ||
          archetypeGates.some((g) => myArchetypes.includes(g)) ||
          tierGates.some((g) => myTier.includes(g));
      };
    case "archetypeFeat":
      // Class-trait gating (Chapter 5): an archetype feat carrying one or
      // more CLASS names as traits (Mastermind: "Bard, Ranger, Rogue";
      // War Priest: "Cleric") is only available to those classes.
      //
      // TIER TRAITS GATE HERE TOO, and until 3.544.0 they did not.
      //
      // The comment that stood here said tier tags "pass untouched",
      // which was true when it was written — classes carried no tier
      // data, so there was nothing to compare against. The classFeat
      // branch above was brought up to date when they did; this one was
      // not, and the stale sentence read like a decision rather than an
      // oversight for as long as it stayed.
      //
      // Measured, 9 Sep 2026: a 4th-level Rogue, a 4th-level Fighter and
      // a Wizard were each offered the IDENTICAL 22 archetype feats.
      // Graham's report — Enigma (Adept, Heritage) offered to a Rogue.
      // Five feats were ungated: Enigma (Adept), Assassin (Expert),
      // Armour Master, Aegis and Cavalier (Martial).
      //
      // ANY-OF ACROSS BOTH KINDS, exactly as classFeat does it. No
      // archetype feat in the pack carries a class name AND a tier
      // today, so the two readings cannot be told apart by the data —
      // this follows the branch above rather than inventing a second
      // rule that happens to agree.
      return (entry) => {
        if (entry.system?.category !== "Archetype") return false;
        // "Non-Fighter" and friends. A Fighter has been offered Warrior
        // since archetypes shipped, because nothing read a prerequisite.
        if (!meetsClassPrerequisite(entry, ownClass)) return false;
        const CLASS_NAMES = ["bard", "cleric", "crusader", "druid", "fighter", "ranger", "rogue", "wizard"];
        const archTraits = String(entry.system?.traits ?? "")
          .split(/,\s*/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);
        // A module class's name is a class gate here too (3.563.0).
        const traitClasses = archTraits.filter((t) => CLASS_NAMES.includes(t) || registeredClassNames().includes(t));
        const traitTiers = archTraits.filter((t) => TIER_NAMES.includes(t));
        if (!traitClasses.length && !traitTiers.length) return true;
        // OPENED BY A MODULE (3.671.0): registerFeatAccess("archetype",
        // class, names) — Inner Tempest opens Vanguard to the Kensai,
        // Mastermind and Runemage to the Mystic. Any one of the effective
        // classes will do, as for class feats; the "Non-X" prerequisite
        // above still applies.
        if (hasRegisteredFeatAccess("archetype", className, entry.name)) return true;
        // `className` is the EFFECTIVE class LIST — "Bard, Fighter" for a
        // Bard who owns the Warrior archetype — so it has to be split
        // before it is matched, exactly as the classFeat branch above
        // does. Compared whole, "bard, fighter" is in no trait list at
        // all, and taking one archetype hid every OTHER archetype the
        // character qualified for: a Bard with Warrior stopped being
        // offered Mastermind, Cloistered Priest, Primal Warrior,
        // Runemage, Vanguard or War Priest. Found by review at 3.212.0,
        // reachable as soon as a class had two class lists to join.
        const mineClasses = String(className ?? "")
          .split(/,\s*/)
          .map((c) => c.trim().toLowerCase())
          .filter(Boolean);
        // THE BARD IS "Adept/Expert" — one class, two tiers — and an
        // archetype can add another (War Priest makes a Cleric martial
        // "as well as adept"). Split on both separators for the same
        // reason the classFeat branch does.
        const mineTiers = String(tier ?? "").toLowerCase()
          .split(/[,/]\s*/).map((t) => t.trim()).filter(Boolean);
        return traitClasses.some((t) => mineClasses.includes(t))
          || traitTiers.some((t) => mineTiers.includes(t));
      };
    case "generalFeat":
      // COMPANION FEATS ARE FILED AS GENERAL, and the chapter gives them
      // nowhere else to go — they carry the Companion trait and no
      // category of their own. So all nineteen sat in every character's
      // Add General Feat box, which is what Graham reported at 3.249.2:
      // "Animal Companion feats should only be available to Animal
      // Companions and not for other characters."
      //
      // THE TRAIT IS THE GATE, NOT THE NAME. Support, Trampler and
      // Perfect Flanking say nothing about companions in either. And a
      // companion still sees the ordinary General feats too (Graham's
      // ruling) — this hides companion feats from everyone else, it does
      // not wall a companion off from the rest of the list.
      return (entry) => {
        if (entry.system?.category !== "General") return false;
        if (!meetsClassPrerequisite(entry, ownClass)) return false;
        // A COMPANION FEAT GOES TO ITS OWN KIND (3.674.0, C4; Graham's
        // B10-12): the Animal Companion's to an animal companion, the
        // Dragon Companion's four to a dragon, neither to anyone else.
        const featKind = companionFeatKind(entry);
        if (featKind) return isCompanion && (String(companionKind || "animal").toLowerCase() === featKind);
        return true;
      };
    case "racialAbility":
      // A Codex ability belongs to no race, so the race gate must not be
      // applied to it — gating it would offer an empty list on every
      // creature that has no race set, which is most of them.
      return (entry) =>
        entry.system?.category === "Creature" ||
        (entry.system?.category === "Racial" &&
          matchesSource(entry.system?.sourceRace, race));
    case "classAbility":
      return (entry) =>
        (entry.system?.category === "Class" || entry.system?.category === "Proficiency") &&
        matchesSource(entry.system?.sourceClass, className);
    case "spell": {
      // A SPECIALIST SPELL THE CHARACTER CANNOT LEARN IS HIDDEN (3.623.0,
      // block 40, Graham's R8): another class's, or another aspect's.
      // Every aspect spell has an empty tradition, so the tradition test
      // below passed all 44 to every caster — a Wizard could add Healer's
      // Grace from the sheet. Dragging from the compendium is untouched:
      // the GM's route in.
      const specialistOk = (entry) => !specialistAccess || pickerSpecialistAllowed(entry, specialistAccess);
      // No automatic filter until the actor actually has a known
      // tradition — showing everything is more useful than showing
      // nothing for a character who hasn't picked a caster class yet.
      if (!tradition) return specialistAccess ? specialistOk : null;
      // A spell lists one OR MORE traditions ("arcane, verdant"); a caster needs
      // just ONE of them in common to learn it, and an all-traditions spell is
      // therefore available to every caster. An untagged spell is available to
      // all. (Exact string equality was the bug — it hid every multi-tradition
      // spell from a single-tradition caster.)
      const parse = (s) => String(s ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      const casterTraditions = parse(tradition);
      return (entry) => {
        if (!specialistOk(entry)) return false;
        const spellTraditions = parse(entry.system?.tradition);
        return spellTraditions.length === 0 || spellTraditions.some((t) => casterTraditions.includes(t));
      };
    }
    default:
      return null;
  }
}

/**
 * Escapes a value for use inside a double-quoted HTML attribute.
 *
 * Lives here rather than in picker-workflow.mjs because the option
 * builder below needs it and this module is Foundry-free — a harness can
 * import it, where importing the workflow pulls in Foundry's globals and
 * throws under node.
 */
export function escapeAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The <option> list for one facet, with its default preselected.
 *
 * Pure, so the harness can assert what it RETURNS. A mutation that
 * dropped the `selected` attribute survived a check that only asked
 * whether facetsFor() computed a default — computing a default and never
 * rendering it look identical from outside.
 *
 * A default naming a value that is not on offer falls back to "All"
 * rather than preselecting nothing and showing an empty list.
 */
export function facetOptionsHtml(facet, values = []) {
  const preset = values.includes(String(facet?.defaultValue ?? "")) ? String(facet.defaultValue) : "";
  const option = (v, label) =>
    `<option value="${escapeAttribute(v)}"${v === preset ? " selected" : ""}>${label}</option>`;
  return [option("", "All"), ...values.map((v) => option(v, v))].join("\n          ");
}
