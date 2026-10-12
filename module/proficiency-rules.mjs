/**
 * Is this CHARACTER proficient with this ITEM?
 *
 * WHAT WAS THERE BEFORE
 *
 * A string field on the item: `system.proficiency`. Every one of the 76
 * weapons, 26 armours and 12 shields in the packs shipped it as `""`,
 * and the only code that read it asked `proficiency !== "none"` — so it
 * was true for everything, for everyone, always. The -4 non-proficiency
 * penalty could not fire. The doubled armour check penalty could not
 * fire. A Wizard in full plate holding a greatsword took no penalty of
 * any kind.
 *
 * It was also the wrong SHAPE. Proficiency is not a property of a sword.
 * The same sword is fine for a Fighter and a mistake for a Wizard, and
 * an item field has nowhere to put that. This module asks the question
 * the right way round.
 *
 * HOW THE CLASS ENTRIES ARE WRITTEN
 *
 * From "Proficiency Breakdown.docx", which gives each class's printed
 * sentence and then expands it into an explicit list. The entries below
 * are RULES, not those lists — "Light armour, plus the light tier of the
 * Other table" rather than nine names — because a new armour added to
 * the pack should be covered without editing eight class entries.
 *
 * That makes them checkable only against something written down
 * separately. This header used to say that the printed lists lived in
 * `tools/source/proficiency-lines.txt` and that
 * `tools/verify-proficiency.mjs` diffed against them. NEITHER FILE
 * EXISTED. The table shipped unchecked, and the sixteen creature classes
 * below were missing from it for sixteen releases without a single
 * complaint from anything — see CREATURE_CLASS_PROFICIENCY.
 *
 * THAT PARAGRAPH THEN SAID "The harness exists now." IT DID NOT EXIST
 * EITHER. A claim of coverage had been corrected by a sentence making
 * the same claim, and it stood for a further nineteen releases. The
 * harness exists as of 3.535.0: `tools/verify-proficiency.mjs`, 41
 * checks, and `tools/mutate-proficiency.mjs`, which breaks the rules
 * below fourteen ways and requires the verify to notice each one.
 *
 * WHAT IT ACTUALLY CHECKS IS NARROWER THAN WHAT WAS PROMISED, and
 * deliberately. The printed sentence is prose — "any non-metal armour or
 * shield" — and diffing a structured table against prose needs a parser
 * whose mistakes would be indistinguishable from the defects it hunts.
 * So the prose is used only where it is decidable: whether a class has
 * an entry at all, and the tower shield, where the grant tracks a
 * literal parenthetical in two sentences out of twenty-four. What
 * replaces the diff is the cross-product — every class against every
 * item in the packs, 6,576 pairs — which is what this module was made
 * pure for.
 *
 * TWO GRANTS THE PACKS CANNOT REACH: no pack weapon carries the
 * Alchemical group and none carries an Ancient Echoes rune, so the
 * cross-product never executes either branch. Both are covered by
 * fixtures running this same function.
 *
 * Pure. No Foundry, no documents — `proficiencyProfile` takes an actor
 * and flattens it to plain data, and everything after that runs on plain
 * data, so the harness puts every item in every pack past all 24 classes
 * without a world — 62,088 pairs, of which 145 are the weapons, armour
 * and shields the question is actually about.
 *
 * IT READ SEVEN PACKS FROM A HARDCODED LIST UNTIL 3.536.0, and the list
 * omitted four — including every named magic item in the game. Thirty-one
 * gear items had never been put past a class, and two silent defects were
 * living in them. The packs directory is walked now.
 */

import { favouredWeaponMatches } from "./divine-aspect.mjs";
import { weaponWaivesProficiency } from "./codex-runes.mjs";
import { registeredClass } from "./module-api.mjs";
import { weaponFormBaseOf } from "./charged-weapon-forms.mjs";

const SYSTEM_ID = "trg-prime";

/* ------------------------------------------------------------------ */
/* Vocabulary                                                          */
/* ------------------------------------------------------------------ */

/** Size order, smallest first. "Small or smaller" is an index compare. */
export const SIZE_ORDER = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

const sizeIndex = (value) => SIZE_ORDER.indexOf(String(value ?? "").trim().toLowerCase());

const norm = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Names, compared with the typography flattened — the packs use a curly
 * apostrophe in "Footman’s Flail" and a straight one in "Footman's
 * Mace", and an en dash in "Klar - Bone" is a hyphen in half the
 * documents that mention it.
 */
export const nameKey = (value) => String(value ?? "")
  .replace(/[‘’ʼ]/g, "'")
  .replace(/[–—]/g, "-")
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "");

/**
 * The Other armour table, split into the tiers the class lists imply.
 *
 * The document never states this split; it states nine class lists that
 * are only consistent if it exists. A Rogue (light armour) gets exactly
 * the leather three. A Cleric (light and medium) gets those plus the
 * metal helmet and the chain pieces. Nobody but the all-armour classes
 * gets the Full Helmet or the metal greaves and bracers — which are also
 * the three carrying the Rigid trait.
 *
 * Written down here rather than derived from Rigid, because "the three
 * Rigid ones happen to be the heavy tier" is a coincidence this table
 * would survive and a derivation would not.
 */
export const OTHER_ARMOUR_TIERS = Object.freeze({
  light: ["Leather Helmet", "Leather Greaves", "Leather Bracers"],
  medium: ["Metal Helmet", "Chain Greaves", "Chain Bracers"],
  heavy: ["Full Helmet", "Metal Greaves", "Metal Bracers"]
});

/**
 * The attack group alchemical weapons form.
 *
 * Chapter 6, Vials: "Alchemical weapons have a range increment of 20
 * feet and attack as martial thrown weapons (with their own attack
 * group)."
 *
 * A GROUP, not a category — which is what lets the Alchemist archetype
 * hand it to a Wizard, who has no martial weapons at all. But a
 * character who already has martial weapons has these too: "Alchemical
 * Weapons should be Martial" (Graham, 13 Aug 2026). Both routes are
 * answered by isProficientWithAlchemical, in one place.
 *
 * Named once here because the workflow that throws a bomb and the table
 * that grants the proficiency must agree on the spelling.
 */
export const ALCHEMICAL_WEAPON_GROUP = "Alchemical";

/** Every shield category except the tower — five classes get exactly this. */
const SHIELDS_BUT_TOWER = ["buckler", "light", "heavy"];
const ALL_SHIELDS = ["buckler", "light", "heavy", "tower"];

/** The four shields with no metal in them. Druid and Ranger get these. */
const NON_METAL_SHIELDS = ["Light Wooden Shield", "Heavy Wooden Shield", "Klar - Bone", "Madu - Leather"];

/**
 * The Druid's and Ranger's medium armour — their PRINTED LIST, named
 * rather than read off the Metal trait because it is the class entry's
 * own answer.
 *
 * NOT shared with the Fey creature class, whose line is the same three
 * words — "any non-metal armour" — with no printed expansion after it, and
 * which gets the material rule the words actually state.
 *
 * SCALE IS NOT METAL (Graham, 9 Sep 2026): the pack's Scale is `Rigid`,
 * and the book's "Metal, Rigid" is the erratum. So the Fey's material
 * rule reaches Scale too, and the two clauses now agree on it. This
 * comment said the opposite until 3.575.0, a month after the ruling.
 */
const DRUIDIC_MEDIUM = ["Hide", "Hardened Leather", "Full Hardened Leather", "Scale"];

/**
 * Whether a piece carries a named trait.
 *
 * Traits are a comma-separated line and several carry a value ("Thrown
 * 20 ft", and the armour table's "Rigid Full Helm"), so this matches the
 * trait's NAME at the start of an entry rather than anywhere in the
 * string — otherwise "Finesse" would be found inside a hypothetical
 * "Anti-Finesse". One implementation, used by the weapon rules and the
 * armour rules both, because two would be two to get wrong.
 */
function hasTrait(system, traitName) {
  const wanted = norm(traitName);
  return String(system?.traits ?? "")
    .split(",")
    .map((entry) => norm(entry))
    .some((entry) => entry === wanted || entry.startsWith(`${wanted} `));
}

/* ------------------------------------------------------------------ */
/* The eight classes                                                   */
/* ------------------------------------------------------------------ */

/**
 * @typedef {object} ClassProficiency
 * @property {string[]} armourCategories  Light / Medium / Heavy, in full.
 * @property {string[]} armourNames       Individual main-table armours beyond those.
 * @property {string[]} otherTiers        Which tiers of the Other table.
 * @property {string[]} armourExclude     Names removed from whatever the above allow.
 * @property {string[]} shieldCategories  buckler / light / heavy / tower.
 * @property {string[]} shieldNames       Individual shields beyond those.
 * @property {string[]} weaponCategories  Simple / Martial / Exotic.
 * @property {string[]} weaponNames       Individual weapons.
 * @property {object[]} weaponRules       Shape rules — group, size, trait.
 * @property {boolean}  deityWeapons      Whether the deific aspect's weapon counts.
 */

export const CLASS_PROFICIENCY = Object.freeze({
  bard: {
    label: "Bard",
    armourCategories: ["Light"],
    armourNames: [],
    otherTiers: ["light"],
    // The Bard's printed list stops at Greaves and Bracers where every
    // other light-armour class also gets the Leather Helmet. Graham,
    // asked about it: "Helmets block ethereal spellcasting." Encoded as
    // the exclusion it is, rather than smoothed away.
    armourExclude: ["Leather Helmet"],
    shieldCategories: SHIELDS_BUT_TOWER,
    shieldNames: [],
    weaponCategories: ["Simple"],
    weaponNames: ["Short Bow", "Composite Shortbow"],
    weaponRules: [
      { kind: "groupSize", groups: ["Knife", "Sword"], maxSize: "small",
        why: "any weapon from the Knife or Sword weapon group which has a size of small or smaller" },
      { kind: "trait", value: "Finesse", why: "any weapon that has the finesse trait" }
    ],
    deityWeapons: false
  },

  cleric: {
    label: "Cleric",
    armourCategories: ["Light", "Medium"],
    armourNames: [],
    otherTiers: ["light", "medium"],
    armourExclude: [],
    shieldCategories: SHIELDS_BUT_TOWER,
    shieldNames: [],
    weaponCategories: ["Simple"],
    weaponNames: [],
    weaponRules: [],
    // "any additional weapon as dictated by your deity" — the aspect
    // item carries the name, so it is collected on the actor rather than
    // listed here.
    deityWeapons: true
  },

  crusader: {
    label: "Crusader",
    armourCategories: ["Light", "Medium", "Heavy"],
    armourNames: [],
    otherTiers: ["light", "medium", "heavy"],
    armourExclude: [],
    shieldCategories: SHIELDS_BUT_TOWER,
    shieldNames: [],
    weaponCategories: ["Simple", "Martial"],
    weaponNames: [],
    weaponRules: [],
    deityWeapons: true
  },

  druid: {
    label: "Druid",
    armourCategories: ["Light"],
    armourNames: DRUIDIC_MEDIUM,
    otherTiers: ["light"],
    armourExclude: [],
    shieldCategories: [],
    shieldNames: NON_METAL_SHIELDS,
    weaponCategories: [],
    // "All other weapons contain metal in the core rules" — so this is a
    // list of three, not a rule about materials.
    weaponNames: ["Club", "Staff", "Sling"],
    weaponRules: [],
    deityWeapons: false
  },

  fighter: {
    label: "Fighter",
    armourCategories: ["Light", "Medium", "Heavy"],
    armourNames: [],
    otherTiers: ["light", "medium", "heavy"],
    armourExclude: [],
    shieldCategories: ALL_SHIELDS,
    shieldNames: [],
    weaponCategories: ["Simple", "Martial"],
    weaponNames: [],
    weaponRules: [],
    deityWeapons: false
  },

  ranger: {
    label: "Ranger",
    armourCategories: ["Light"],
    armourNames: DRUIDIC_MEDIUM,
    otherTiers: ["light"],
    armourExclude: [],
    shieldCategories: [],
    shieldNames: NON_METAL_SHIELDS,
    weaponCategories: ["Simple", "Martial"],
    weaponNames: [],
    weaponRules: [],
    deityWeapons: false
  },

  rogue: {
    label: "Rogue",
    armourCategories: ["Light"],
    armourNames: [],
    otherTiers: ["light"],
    armourExclude: [],
    // "light armour and bucklers" — and the Parrying Scabbard classes as
    // a buckler (Graham, 2026-08-06), which is why the category rather
    // than the name.
    shieldCategories: ["buckler"],
    shieldNames: [],
    weaponCategories: ["Simple"],
    weaponNames: ["Short Bow", "Composite Shortbow"],
    weaponRules: [
      { kind: "maxSize", value: "small", why: "all small weapons" }
    ],
    deityWeapons: false
  },

  wizard: {
    label: "Wizard",
    armourCategories: [],
    armourNames: [],
    otherTiers: [],
    armourExclude: [],
    shieldCategories: [],
    shieldNames: [],
    weaponCategories: [],
    // "the dagger and quarterstaff" — the pack calls the quarterstaff a
    // Staff, and there is no other staff in it.
    weaponNames: ["Dagger", "Staff"],
    weaponRules: [],
    deityWeapons: false
  }
});

/* ------------------------------------------------------------------ */
/* The sixteen creature classes                                        */
/* ------------------------------------------------------------------ */

/**
 * The Creature Codex's classes: one named for each of the twelve
 * creature types, plus Caster, Hybrid, Sneak and Tough.
 *
 * WHY THIS TABLE EXISTS
 *
 * Every one of the sixteen ships its printed sentence in
 * `system.proficiencies`, and the sheet's proficiency panel has been
 * printing that sentence all along. Nothing READ it. `proficiencyProfile`
 * looked its class up in CLASS_PROFICIENCY above, which holds the eight
 * player classes and only those, so "Undead (Creature Class)" normalised
 * to `undeadcreatureclass`, missed, and left the creature with no
 * proficiency of any kind beyond the universal unarmed one. A Barrow
 * Wight took -4 on its own Long Spear — seen in the 3.286.0 playtest,
 * recorded there as expected behaviour, and walked past. Reported by
 * Graham, 12 Aug 2026.
 *
 * A separate table rather than more rows in the one above, because the
 * two are checked against different documents — Chapter 3 of the core
 * book, and Chapter 1 of the Creature Codex — and because the shape of
 * the sentences differs: a creature class never grants a deity's weapon,
 * and several grant nothing at all beyond what every creature already
 * has.
 *
 * NATURAL WEAPONS ARE ALREADY UNIVERSAL. Six of the sixteen say some
 * version of "proficient with all of its natural weapons", and the ten
 * creature attacks in the pack — Bite, Claw, Gore, Hoof, Slam, Sting,
 * Tail Slap, Tentacle, Unarmed Strike, Wings — are all category Unarmed,
 * which UNIVERSAL_WEAPON_CATEGORIES already covers for every character.
 * So those clauses add no entry here; they are stated in each `why`
 * instead, so the table still shows the sentence was read rather than
 * skipped.
 *
 * "ALL ARMOUR AND SHIELDS" DOES NOT INCLUDE THE TOWER. The distinction
 * is the core book's, not this table's: the Crusader's "all armour and
 * shields" and the Fighter's "all armour and shields (including tower
 * shields)" are already read that way above. Elemental and Eternal print
 * the Crusader's wording and get the Crusader's shields; Tough prints
 * the Fighter's, parenthetical and all, and gets the Fighter's.
 */
export const CREATURE_CLASS_PROFICIENCY = Object.freeze({
  aberrationcreatureclass: {
    label: "Aberration",
    // "An Aberration is only proficient with simple weapons."
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: ["Simple"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  animalcreatureclass: {
    label: "Animal",
    // "proficient with all of its natural weapons. An animal has no
    // armour proficiency but may be trained later." The training is the
    // Armour Proficiency feats, which stack on top of any class entry
    // through FEAT_GRANTS — so "later" needs nothing here.
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: [], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  beastcreatureclass: {
    label: "Beast",
    // "all of its natural attack forms... not proficient with any
    // armour or shields."
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: [], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  castercreatureclass: {
    label: "Caster",
    // "A caster is proficient with simple weapons and no armour."
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: ["Simple"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  constructcreatureclass: {
    label: "Construct",
    // "proficient with unarmed weapons only, although many are
    // constructed to use specific weapons." The second clause is a GM's
    // licence to add a weapon to the individual creature, not a grant to
    // every construct — a construct built around a Greatsword gets it
    // from the Weapon Proficient effect, the same route a character's
    // named weapon takes.
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: [], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  elementalcreatureclass: {
    label: "Elemental",
    // "proficient in all armour and shields. It may use all simple and
    // martial weapons."
    armourCategories: ["Light", "Medium", "Heavy"], armourNames: [],
    otherTiers: ["light", "medium", "heavy"], armourExclude: [],
    armourRules: [],
    shieldCategories: SHIELDS_BUT_TOWER, shieldNames: [],
    weaponCategories: ["Simple", "Martial"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  eternalcreatureclass: {
    label: "Eternal",
    // Word for word the Elemental's line.
    armourCategories: ["Light", "Medium", "Heavy"], armourNames: [],
    otherTiers: ["light", "medium", "heavy"], armourExclude: [],
    armourRules: [],
    shieldCategories: SHIELDS_BUT_TOWER, shieldNames: [],
    weaponCategories: ["Simple", "Martial"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  feycreatureclass: {
    label: "Fey",
    // "proficient with all simple weapons and any non-metal armour."
    //
    // A RULE, not the Druid's list. See DRUIDIC_MEDIUM above: the Druid's
    // printed expansion of the same three words includes Scale, which
    // carries the Metal trait. The Fey line has no printed expansion, so
    // it gets what it says — and therefore does not get Scale.
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [
      { kind: "notTrait", value: "Metal", why: "any non-metal armour" }
    ],
    shieldCategories: [], shieldNames: [],
    weaponCategories: ["Simple"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  humanoidcreatureclass: {
    label: "Humanoid",
    // "proficient with all light armour and simple weapons." No shields:
    // a humanoid creature that carries one is normally built on a PC or
    // NPC class instead, which the Codex says outright.
    armourCategories: ["Light"], armourNames: [], otherTiers: ["light"], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: ["Simple"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  hybridcreatureclass: {
    label: "Hybrid",
    // "all light and medium armour and shields. They may use all simple
    // and martial weapons."
    armourCategories: ["Light", "Medium"], armourNames: [],
    otherTiers: ["light", "medium"], armourExclude: [],
    armourRules: [],
    shieldCategories: SHIELDS_BUT_TOWER, shieldNames: [],
    weaponCategories: ["Simple", "Martial"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  oozecreatureclass: {
    label: "Ooze",
    // "proficient with natural weapons only."
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: [], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  plantcreatureclass: {
    label: "Plant",
    // Word for word the Ooze's line.
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: [], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  sneakcreatureclass: {
    label: "Sneak",
    // "light armour and bucklers... all simple weapons, all small
    // weapons and shortbows" — the Rogue's line word for word, and so
    // the Rogue's entry clause for clause.
    armourCategories: ["Light"], armourNames: [], otherTiers: ["light"], armourExclude: [],
    armourRules: [],
    shieldCategories: ["buckler"], shieldNames: [],
    weaponCategories: ["Simple"], weaponNames: ["Short Bow", "Composite Shortbow"],
    weaponRules: [
      { kind: "maxSize", value: "small", why: "all small weapons" }
    ],
    deityWeapons: false
  },

  toughcreatureclass: {
    label: "Tough",
    // "all armour and shields (including tower shields)... all simple
    // and martial weapons" — the Fighter's line, parenthetical and all.
    armourCategories: ["Light", "Medium", "Heavy"], armourNames: [],
    otherTiers: ["light", "medium", "heavy"], armourExclude: [],
    armourRules: [],
    shieldCategories: ALL_SHIELDS, shieldNames: [],
    weaponCategories: ["Simple", "Martial"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  undeadcreatureclass: {
    label: "Undead",
    // "proficiencies with natural weapons and all simple weapons."
    armourCategories: [], armourNames: [], otherTiers: [], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: ["Simple"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  },

  wyrmcreatureclass: {
    label: "Wyrm",
    // "Proficient with all weapons and armour."
    //
    // ALL weapons means the Exotic twelve as well — the only entry in
    // either table that reaches them, and the reason Exotic is a
    // category here rather than a list of names.
    //
    // NO SHIELDS. Every other line that means shields says "and shields"
    // (see the eight above and the fifteen here — the book is
    // consistent about it), and this one says "and armour". Read as
    // written rather than rounded up. Flagged to Graham, 12 Aug 2026.
    armourCategories: ["Light", "Medium", "Heavy"], armourNames: [],
    otherTiers: ["light", "medium", "heavy"], armourExclude: [],
    armourRules: [],
    shieldCategories: [], shieldNames: [],
    weaponCategories: ["Simple", "Martial", "Exotic"], weaponNames: [], weaponRules: [],
    deityWeapons: false
  }
});

/**
 * The entry for a class item's name, from whichever table holds it.
 *
 * ONE lookup, so a call site cannot consult the player classes and
 * forget the creature ones — which is exactly the bug this function was
 * added to close. An NPC built on a player class resolves here too; the
 * Codex says that is normal for humanoids.
 *
 * @param {string} name The class item's name.
 * @returns {{key: string, entry: object}|null}
 */
export function classProficiencyEntry(name) {
  const key = norm(name).replace(/[^a-z]/g, "");
  // A module class (3.560.0) registers its proficiency block in the same
  // shape; it answers after both core tables, never instead of them.
  const registered = registeredClass(name)?.proficiency ?? null;
  const entry = CLASS_PROFICIENCY[key] ?? CREATURE_CLASS_PROFICIENCY[key] ?? registered;
  return entry ? { key, entry } : null;
}

/**
 * True for every character, whatever their class.
 *
 * "Be aware that all characters are proficient with unarmed (natural)
 * attacks." The feat requirement in that same sentence is about having
 * the attack at all, not about being proficient with it, so it is not
 * checked here.
 */
export const UNIVERSAL_WEAPON_CATEGORIES = Object.freeze(["Unarmed"]);

/* ------------------------------------------------------------------ */
/* Feats                                                               */
/* ------------------------------------------------------------------ */

/**
 * What each proficiency feat grants.
 *
 * The armour feats name a category, and take the matching tier of the
 * Other table with them — the same split the class lists imply. The
 * light shield feat is explicit that it covers two categories: "You are
 * proficient in the use of light shields and bucklers."
 */
export const FEAT_GRANTS = Object.freeze({
  "armour proficiency, light": { armourCategories: ["Light"], otherTiers: ["light"] },
  "armour proficiency, medium": { armourCategories: ["Medium"], otherTiers: ["medium"] },
  "armour proficiency, heavy": { armourCategories: ["Heavy"], otherTiers: ["heavy"] },
  "shield proficiency, light": { shieldCategories: ["buckler", "light"] },
  "shield proficiency, heavy": { shieldCategories: ["heavy"] },
  "shield proficiency, tower": { shieldCategories: ["tower"] },

  /* --- archetypes that grant armour in their own text ------------------- */
  // NOT feats named "Armour Proficiency, X" — archetypes whose printed
  // paragraph hands over a category as part of what the archetype IS.
  // Reported by Graham (13 Aug 2026): War Priest "does not seem to grant
  // Heavy Armour Proficiency". It never did — this table is keyed by
  // feat name and no archetype was in it, so the sentence was text on a
  // card and nothing else.
  //
  // The `otherTiers` entry beside each category is not decoration: the
  // Other armour table (helmets, bracers, greaves) is split by the same
  // tiers, so a category granted without its tier would leave a
  // heavy-armoured War Priest unable to wear a heavy helm.

  // "You also become proficient with heavy armour." Heavy alone — the
  // Cleric already carries light and medium, and a Cleric is the only
  // class that can take this (the feat is traited Cleric).
  "war priest": { armourCategories: ["Heavy"], otherTiers: ["heavy"] },

  // "You become proficient in the use of all armour." All three
  // categories and NO shields — the sentence stops at armour, where the
  // Crusader's own line reads "all armour and shields". Written as the
  // archetype reads, not as its parent class reads.
  champion: {
    armourCategories: ["Light", "Medium", "Heavy"],
    otherTiers: ["light", "medium", "heavy"]
  },

  // "You also add Alchemical weapon to your list of attack
  // proficiencies." Chapter 6, Vials: "Alchemical weapons have a range
  // increment of 20 feet and attack as martial thrown weapons (WITH
  // THEIR OWN ATTACK GROUP)" — Graham's ruling, 13 Aug 2026, confirming
  // it: a group of its own, not something Martial-weapon proficiency
  // reaches. So this grant is the only thing in the book that hands it
  // over, which is exactly why it had to exist for the archetype to
  // mean anything.
  alchemist: { weaponGroups: [ALCHEMICAL_WEAPON_GROUP] }

  // NOT HERE, and deliberately:
  //
  //   Warrior — "You may choose to become proficient in either all
  //     simple and martial weapons OR all armour and shields." A CHOICE,
  //     so it needs a Use button recording which was taken, the way
  //     Weapon Proficient does. A table keyed by name cannot express
  //     "one of these two", and quietly granting either half would give
  //     a character proficiencies they never chose. See
  //     PROFICIENCY_CHOICE_GRANTS below.

  // "Weapon Proficient" is not here: it names ONE weapon, chosen when
  // the feat is taken and recorded on a choice effect, so it is read off
  // the effect where the name actually is.
});

/**
 * Packages a CHOSEN archetype grant hands over.
 *
 * Separate from FEAT_GRANTS because these are not decided by owning the
 * feat — they are decided by what the player picked when they used it.
 * The choice lives on an effect (`flags.trg-prime.proficiencyChoice`),
 * the way Weapon Proficient's chosen weapon does, so deleting the effect
 * undoes the grant and grant-cleanup takes it with the feat.
 *
 * Keyed "<feat>:<option>" so a second either/or archetype can be added
 * without a second mechanism.
 */
export const PROFICIENCY_CHOICE_GRANTS = Object.freeze({
  // Warrior: "either all simple and martial weapons or all armour and
  // shields."
  "warrior:weapons": {
    label: "Simple and martial weapons",
    weaponCategories: ["Simple", "Martial"]
  },
  "warrior:armour": {
    label: "All armour and shields",
    armourCategories: ["Light", "Medium", "Heavy"],
    otherTiers: ["light", "medium", "heavy"],
    // NOT tower shields. "All armour and shields" is the Crusader's
    // wording too, and the Crusader gets buckler/light/heavy; the
    // Fighter's line is the one that says "(including tower shields)".
    // Read as the book reads, not as the archetype's parent class does.
    shieldCategories: SHIELDS_BUT_TOWER
  }
});

/* ------------------------------------------------------------------ */
/* Building a profile                                                  */
/* ------------------------------------------------------------------ */

/**
 * Everything about a character that bears on proficiency, as plain data.
 *
 * @param {object} actor
 * @returns {{
 *   classKey: string|null, classLabel: string,
 *   armourCategories: Set<string>, armourNames: Set<string>, otherTiers: Set<string>,
 *   armourExclude: Set<string>,
 *   shieldCategories: Set<string>, shieldNames: Set<string>,
 *   weaponCategories: Set<string>, weaponNames: Set<string>, weaponGroups: Set<string>,
 *   weaponRules: object[], sources: object[]
 * }}
 */
/**
 * Does a held divine aspect's favoured weapon grant proficiency?
 * (3.623.0, R10.) The class table says so for the Cleric and the
 * Crusader; the Deific Aspect ability says so for anyone else who holds
 * it — the Champion's "Crusader deity trait".
 *
 * @param {object|null} entry the class's proficiency entry
 * @param {object[]} items the actor's items
 */
export function deityWeaponsApply(entry, items = []) {
  if (entry?.deityWeapons) return true;
  return Array.from(items ?? []).some((i) => i?.type === "ability"
    && String(i?.name ?? "").trim().toLowerCase() === "deific aspect");
}

export function proficiencyProfile(actor) {
  const items = Array.from(actor?.items ?? []);

  const profile = {
    classKey: null,
    classLabel: "",
    // The wielder's race, for the Exotic racial clause
    // (`effectiveWeaponCategory`). The race ITEM is the record; the
    // identity field is the fallback for an actor built by hand.
    race: String(
      items.find((item) => item.type === "race")?.name
      ?? actor?.system?.identity?.race ?? ""
    ).trim(),
    armourCategories: new Set(),
    // Which source put each category in the set above — so the panel can
    // credit "Heavy" to War Priest rather than to the Cleric that did not
    // grant it. First writer wins: a class grant is the reason you have a
    // category, and a feat that repeats one is not a second reason.
    armourCategoryBy: {},
    armourNames: new Set(),
    otherTiers: new Set(),
    armourExclude: new Set(),
    shieldCategories: new Set(),
    shieldNames: new Set(),
    weaponCategories: new Set(UNIVERSAL_WEAPON_CATEGORIES),
    weaponNames: new Set(),
    weaponGroups: new Set(),
    weaponRules: [],
    armourRules: [],
    sources: [],
    // The same names as the key sets above, unflattened, with where each
    // came from — for the sheet, which has to print them.
    labels: { armour: [], armourExclude: [], shield: [], weapon: [] }
  };

  const classItem = items.find((item) => item.type === "class");
  const resolved = classProficiencyEntry(classItem?.name);
  const classKey = resolved?.key ?? null;
  const entry = resolved?.entry;

  if (entry) {
    profile.classKey = classKey;
    profile.classLabel = entry.label;
    for (const value of entry.armourCategories) {
      profile.armourCategories.add(value);
      profile.armourCategoryBy[value] ??= entry.label;
    }
    for (const value of entry.armourNames) {
      profile.armourNames.add(nameKey(value));
      profile.labels.armour.push({ label: value, source: entry.label });
    }
    for (const value of entry.otherTiers) profile.otherTiers.add(value);
    // The exclusion is applied at the end, so it beats anything the
    // class or a feat would otherwise allow — a Bard who takes Armour
    // Proficiency, Light does not thereby get a helmet back.
    for (const value of entry.armourExclude) {
      profile.armourExclude.add(nameKey(value));
      profile.labels.armourExclude.push({ label: value, source: entry.label });
    }
    for (const value of entry.shieldCategories) profile.shieldCategories.add(value);
    for (const value of entry.shieldNames) {
      profile.shieldNames.add(nameKey(value));
      profile.labels.shield.push({ label: value, source: entry.label });
    }
    for (const value of entry.weaponCategories) profile.weaponCategories.add(value);
    for (const value of entry.weaponNames) {
      profile.weaponNames.add(nameKey(value));
      profile.labels.weapon.push({ label: value, source: entry.label });
    }
    for (const rule of entry.weaponRules) profile.weaponRules.push({ ...rule, source: entry.label });
    // Only the creature table carries these today, so the player entries
    // have no such field — hence the default rather than a bare read.
    for (const rule of entry.armourRules ?? []) profile.armourRules.push({ ...rule, source: entry.label });
    profile.sources.push({ label: entry.label, kind: "class" });
  }

  // Feats.
  for (const item of items) {
    if (item.type !== "feat") continue;
    const grant = FEAT_GRANTS[norm(item.name)];
    if (!grant) continue;
    for (const value of grant.armourCategories ?? []) {
      profile.armourCategories.add(value);
      profile.armourCategoryBy[value] ??= item.name;
    }
    for (const value of grant.otherTiers ?? []) profile.otherTiers.add(value);
    for (const value of grant.shieldCategories ?? []) profile.shieldCategories.add(value);
    // NO weaponCategories BRANCH HERE, deliberately. No entry in this
    // table grants one — the archetypes that hand over whole weapon
    // categories do it through a CHOICE (Warrior), which lands in
    // PROFICIENCY_CHOICE_GRANTS below and is read from the effect. A
    // branch for a shape nothing uses is a line no mutation can kill,
    // which is how it was found.
    //
    // WEAPON GROUPS were not read here until 3.303.0. Every entry in the
    // table happened to be armour or shields, so the omission was
    // invisible — and the moment the Alchemist's group grant was added
    // it would have been a table entry that granted nothing, which is
    // the defect this whole table was reported for.
    for (const value of grant.weaponGroups ?? []) {
      profile.weaponGroups.add(norm(value));
      profile.labels.weapon.push({ label: `${value} group`, source: item.name });
    }
    profile.sources.push({ label: item.name, kind: "feat" });
  }

  // A divine aspect's favoured weapon, for the two classes whose text
  // says the deity grants one. Held as a name; matched loosely below,
  // because an aspect can name a whole group ("any Axe").
  //
  // AND FOR WHOEVER HOLDS THE CRUSADER DEITY TRAIT (3.623.0, block 40,
  // Graham's R10): a Champion gains "the Crusader deity trait", whose
  // Favoured Weapon line is proficiency and +1 together. The +1 already
  // read any held aspect; the proficiency read only the class table.
  if (deityWeaponsApply(entry, items)) {
    for (const item of items) {
      if (item.type !== "divine-aspect") continue;
      const weapon = String(item.system?.favouredWeapon ?? "").trim();
      if (!weapon) continue;
      profile.weaponNames.add(nameKey(weapon));
      profile.labels.weapon.push({ label: weapon, source: item.name });
      profile.weaponRules.push({
        kind: "favouredWeapon", value: weapon, source: item.name,
        why: "your deific aspect's favoured weapon"
      });
      profile.sources.push({ label: `${weapon} (${item.name})`, kind: "weapon" });
    }
  }

  // Recorded choices and transferred effects: Weapon Proficient names a
  // single weapon; a heritage can grant a whole weapon group.
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect.disabled) continue;
    const named = effect.getFlag?.(SYSTEM_ID, "weaponProficientName");
    if (named) {
      profile.weaponNames.add(nameKey(named));
      profile.labels.weapon.push({ label: String(named), source: effect.name });
      profile.sources.push({ label: String(named), kind: "weapon" });
    }
    // A CHOSEN archetype package (Warrior's either/or). Applied here
    // rather than from FEAT_GRANTS because owning the feat is not what
    // decides it — the recorded choice is.
    const choice = PROFICIENCY_CHOICE_GRANTS[effect.getFlag?.(SYSTEM_ID, "proficiencyChoice")];
    if (choice) {
      for (const value of choice.armourCategories ?? []) {
        profile.armourCategories.add(value);
        profile.armourCategoryBy[value] ??= effect.name;
      }
      for (const value of choice.otherTiers ?? []) profile.otherTiers.add(value);
      for (const value of choice.shieldCategories ?? []) profile.shieldCategories.add(value);
      for (const value of choice.weaponCategories ?? []) profile.weaponCategories.add(value);
      profile.sources.push({ label: effect.name, kind: "feat" });
    }

    const groups = effect.getFlag?.(SYSTEM_ID, "weaponGroupProficiency");
    for (const group of Array.isArray(groups) ? groups : groups ? [groups] : []) {
      if (!group) continue;
      profile.weaponGroups.add(norm(group));
      profile.labels.weapon.push({ label: `${group} group`, source: effect.name });
      profile.sources.push({ label: `${group} group`, kind: "weapon" });
    }
  }

  return profile;
}

/* ------------------------------------------------------------------ */
/* Asking the question                                                 */
/* ------------------------------------------------------------------ */

/**
 * Is this character proficient with alchemical weapons?
 *
 * Asked separately from `isProficientWith` because a vial is NOT a
 * weapon item — the fifty alchemical entries are consumables, with no
 * category, group or damage fields — so the ordinary weapon path has
 * nothing to match on. What decides it is the group, and the group is
 * held on the profile like any other.
 *
 * @param {object} profile From proficiencyProfile.
 * @returns {boolean}
 */
export function isProficientWithAlchemical(profile) {
  // MARTIAL WEAPON PROFICIENCY COVERS THEM. Graham's ruling, 13 Aug
  // 2026: "Alchemical Weapons should be Martial." The chapter's "(with
  // their own attack group)" makes them a group rather than a category —
  // which is what the Alchemist archetype grants to a class that has no
  // martial weapons at all — but a character who may swing a greatsword
  // may also throw a flask.
  //
  // DERIVED FROM THE CATEGORY rather than listed against the three
  // classes that have it today, so a class added later is covered by
  // the rule instead of by somebody remembering.
  if (profile?.weaponCategories?.has("Martial")) return true;
  return Boolean(profile?.weaponGroups?.has(norm(ALCHEMICAL_WEAPON_GROUP)));
}

/**
 * Shield categories another category's proficiency covers. The parrying
 * scabbard (Graham, 19 Sep 2026): light-shield proficiency.
 */
export const SHIELD_CATEGORY_COVERED_BY = Object.freeze({ scabbard: "light" });

/**
 * Does the weapon carry a racial trait naming this race? The trait line
 * is a comma list and the race is one of its entries — "Dwarf, Exotic,
 * Hand & a Half, …" — matched whole, letters only, so an Elf does not
 * match a trait that merely contains the letters.
 *
 * @param {string} race The wielder's race name.
 * @param {string} traits The weapon's trait line.
 * @returns {boolean}
 */
export function racialWeaponMatches(race, traits) {
  const wanted = norm(race).replace(/[^a-z]/g, "");
  if (!wanted) return false;
  return String(traits ?? "").split(",")
    .map((entry) => norm(entry).replace(/[^a-z]/g, ""))
    .some((entry) => entry === wanted);
}

/**
 * The weapon's category FOR THIS WIELDER. An exotic weapon whose racial
 * trait names the wielder's race is martial for them (Chapter 6, Exotic);
 * everything else is what the item says.
 *
 * @param {object} profile From proficiencyProfile (carries `race`).
 * @param {object} item
 * @returns {string}
 */
export function effectiveWeaponCategory(profile, item) {
  const category = String(item?.system?.category ?? "");
  if (norm(category) === "exotic" && racialWeaponMatches(profile?.race, item?.system?.traits)) {
    return "Martial";
  }
  return category;
}

/**
 * @param {object} profile From proficiencyProfile.
 * @param {object} item    An item, or a plain {type, name, system} stand-in.
 * @returns {{proficient: boolean, why: string}}
 */
export function proficiencyOf(profile, item) {
  const type = item?.type;
  const system = item?.system ?? {};
  const key = nameKey(item?.name);

  // FAIL OPEN on an item that predates the category field.
  //
  // `category` arrived in 3.215.0. A weapon, armour or shield already
  // sitting on a character in an existing world has none until it is
  // refreshed from the compendium, and treating "I do not know" as "not
  // proficient" would put a -4 on every attack every existing character
  // makes, and double every armour check penalty they have — a bug far
  // worse than the one this module was written to fix.
  //
  // Armour is the exception in one direction only: it ships its category
  // from the start, so an armour without one is genuinely unknown too.
  // AN IMPROVISED ATTACK ASKS NO PROFICIENCY (3.576.0). Chapter 6: "When
  // attacking with an item that's primary purpose is not a weapon, then you
  // suffer a -4-circumstance penalty" — that penalty is the whole cost, and
  // a torch belongs to no weapon category for proficiency to be missing
  // from. See goods.mjs.
  if (type === "weapon" && system.improvised === true) {
    return { proficient: true, why: "an improvised attack — its own penalty applies instead" };
  }

  if (["weapon", "armour", "shield"].includes(type) && !String(system.category ?? "").trim()) {
    return {
      proficient: true,
      why: "this item predates the proficiency rules — refresh it from the compendium"
    };
  }

  if (type === "armour") {
    if (profile.armourExclude.has(key)) {
      return { proficient: false, why: `${item.name} is specifically excluded for a ${profile.classLabel}` };
    }
    const category = String(system.category ?? "");
    if (category === "Other") {
      for (const tier of profile.otherTiers) {
        if ((OTHER_ARMOUR_TIERS[tier] ?? []).some((name) => nameKey(name) === key)) {
          return { proficient: true, why: `${tier} armour proficiency covers ${item.name}` };
        }
      }
    } else {
      if (profile.armourCategories.has(category)) {
        return { proficient: true, why: `${category.toLowerCase()} armour proficiency` };
      }
      if (profile.armourNames.has(key)) {
        return { proficient: true, why: `${item.name} is named specifically` };
      }
    }
    // Material rules — the Fey's "any non-metal armour" — asked LAST and
    // in ONE place, so they cover the Other table's helmets and greaves
    // on the same terms as the main table's hauberks. The two branches
    // above used to end in their own `return false`, and a rule added to
    // either of them alone is how a Fey comes to be barred from a
    // leather helmet it is plainly proficient with.
    for (const rule of profile.armourRules) {
      if (armourRuleMatches(rule, item)) return { proficient: true, why: rule.why ?? "granted" };
    }
    return category === "Other"
      ? { proficient: false, why: `no proficiency covering ${item.name}` }
      : { proficient: false, why: `not proficient with ${category.toLowerCase() || "this"} armour` };
  }

  if (type === "shield") {
    const category = norm(system.category);
    if (profile.shieldCategories.has(category)) {
      return { proficient: true, why: `${category} shield proficiency` };
    }
    // THE PARRYING SCABBARD IS ITS OWN CATEGORY (Graham, 19 Sep 2026) and
    // light-shield proficiency covers it. It was filed as a buckler, which
    // made it cost no hand and follow the buckler's rules.
    const coveredBy = SHIELD_CATEGORY_COVERED_BY[category];
    if (coveredBy && profile.shieldCategories.has(coveredBy)) {
      return { proficient: true, why: `${coveredBy} shield proficiency covers the ${category}` };
    }
    if (profile.shieldNames.has(key)) {
      return { proficient: true, why: `${item.name} is named specifically` };
    }
    return { proficient: false, why: `not proficient with ${category || "this"} shields` };
  }

  if (type === "weapon") {
    // THE RACIAL CLAUSE (Chapter 6, Exotic): "If your race matches that of
    // the weapon's racial trait, it is considered a martial weapon." Read
    // before everything else, so a dwarf's zokarrin goes through every
    // following test as the martial weapon it is for them. Not built
    // until 3.575.0.
    const category = effectiveWeaponCategory(profile, item);
    const racial = category !== String(system.category ?? "");
    if (racial && profile.weaponCategories.has(category)) {
      return { proficient: true, why: `martial weapon proficiency (a ${profile.race} weapon, martial for a ${profile.race})` };
    }
    if (profile.weaponCategories.has(category)) {
      return { proficient: true, why: category === "Unarmed"
        ? "every character is proficient with unarmed attacks"
        : `${category.toLowerCase()} weapon proficiency` };
    }
    if (profile.weaponNames.has(key)) {
      return { proficient: true, why: `${item.name} is named specifically` };
    }
    // A CHARGED ITEM'S WEAPON FORM IS ITS BASE WEAPON (3.616.1, Graham's R2):
    // "Staff of Fire (Staff)" is a Staff to a Wizard. See weaponFormBaseOf.
    const formBase = weaponFormBaseOf(item);
    if (formBase && profile.weaponNames.has(nameKey(formBase))) {
      return { proficient: true, why: `${item.name} is a ${formBase}, named specifically` };
    }
    if (profile.weaponGroups.has(norm(system.group))) {
      return { proficient: true, why: `proficiency with the ${system.group} group` };
    }
    for (const rule of profile.weaponRules) {
      if (weaponRuleMatches(rule, item)) return { proficient: true, why: rule.why ?? "granted" };
    }
    // ANCIENT ECHOES (Creature Codex, Chapter 3), asked LAST, after every
    // real grant has had its say: "You need no proficiency to use a
    // weapon inscribed with this rune."
    //
    // The rune does not make a character proficient — it makes the
    // proficiency unnecessary — so a character who was already proficient
    // keeps their own reason and never sees the rune's. Answered here
    // rather than in the attack workflow so that the sheet's proficiency
    // list, the attack card's -4 and the caster's "non-proficient
    // items" warning all give the same answer; a rule enforced in one
    // consumer and not the others is how a sheet comes to disagree with
    // a card.
    const waiver = weaponWaivesProficiency(item);
    if (waiver.waived) return { proficient: true, why: waiver.why };
    // Name the CATEGORY, not the weapon. The first version of this
    // message read "not proficient with Greatsword", which on the attack
    // card came out as "Non-proficient — not proficient with Greatsword"
    // — a sentence that repeats the thing it is meant to explain. Seen
    // live, 3.215.0.
    return {
      proficient: false,
      why: category
        ? `${item.name} is ${/^[aeiou]/i.test(category) ? "an" : "a"} ${category.toLowerCase()} weapon`
        : `not proficient with ${item?.name ?? "this weapon"}`
    };
  }

  // Anything else — a wand, a rope — is not a proficiency question.
  return { proficient: true, why: "" };
}

/** The boolean on its own, for call sites that do not want the reason. */
export function isProficientWith(profile, item) {
  return proficiencyOf(profile, item).proficient;
}

function weaponRuleMatches(rule, item) {
  const system = item?.system ?? {};
  switch (rule.kind) {
    case "groupSize": {
      const group = norm(system.group);
      if (!rule.groups.some((entry) => norm(entry) === group)) return false;
      const cap = sizeIndex(rule.maxSize);
      const size = sizeIndex(system.size);
      return cap >= 0 && size >= 0 && size <= cap;
    }
    case "maxSize": {
      const cap = sizeIndex(rule.value);
      const size = sizeIndex(system.size);
      return cap >= 0 && size >= 0 && size <= cap;
    }
    case "trait":
      return hasTrait(system, rule.value);
    case "group":
      return norm(system.group) === norm(rule.value);
    case "favouredWeapon":
      // ONE implementation of this rule, in divine-aspect.mjs, which
      // verify-favoured-weapon-group.mjs and verify-block40-aspects.mjs
      // drive — including the cases that separate a suffix match from a
      // prefix one ("Staff Sling" must not join a deity favouring the
      // Staff). A second copy here would have been a second copy to get
      // wrong.
      //
      // Matched against the weapon's GROUP as well as its name, because
      // an aspect can favour a whole group rather than one weapon.
      return favouredWeaponMatches(rule.value, item?.name) ||
        favouredWeaponMatches(rule.value, system.group);
    default:
      return false;
  }
}

/**
 * Armour shape rules. One kind so far: the Fey's material clause.
 *
 * Deliberately NOT a mirror of weaponRuleMatches's `trait` case with the
 * sense flipped by a flag — "grant everything without this trait" and
 * "grant everything with it" behave differently at the edges (an armour
 * with no trait line at all is granted by one and refused by the other),
 * and a shared function with a boolean argument would hide that.
 */
function armourRuleMatches(rule, item) {
  const system = item?.system ?? {};
  switch (rule.kind) {
    case "notTrait":
      return !hasTrait(system, rule.value);
    case "trait":
      return hasTrait(system, rule.value);
    default:
      return false;
  }
}

/**
 * The profile as a short list of readable clauses, for the sheet.
 *
 * The Combat tab used to print the class's proficiency sentence
 * verbatim, which is the book's prose and says nothing about the feats
 * and grants stacked on top of it. This says what the character can
 * actually use, and where each part came from.
 */
export function proficiencyDescription(profile) {
  const armour = [];
  const shield = [];
  const weapon = [];
  const push = (list, text, source) => { if (text) list.push({ text, source }); };

  const ordered = (set, order) => order.filter((entry) => set.has(entry));

  const armourCategories = ordered(profile.armourCategories, ["Light", "Medium", "Heavy"]);
  // CREDITED TO WHAT ACTUALLY GRANTED IT, not to the class. This line
  // used to name `profile.classLabel` whatever the source was, which was
  // harmless while only the class filled the set and became a false
  // statement the moment a feat did: a War Priest read "Light, Medium,
  // Heavy armour — Cleric", and the Cleric grants no heavy armour. The
  // same was already true of Armour Proficiency, Heavy; it went
  // unnoticed because nobody had asked the panel to explain a grant.
  //
  // Distinct sources, in the order the categories are printed, so the
  // credit reads "Cleric, War Priest" rather than repeating either.
  const categoryCredit = [];
  for (const category of armourCategories) {
    const source = profile.armourCategoryBy?.[category];
    if (source && !categoryCredit.includes(source)) categoryCredit.push(source);
  }
  const armourSource = categoryCredit.join(", ") || profile.classLabel;
  if (armourCategories.length === 3) push(armour, "All armour", armourSource);
  else if (armourCategories.length) push(armour, `${armourCategories.join(", ")} armour`, armourSource);
  // The Other table — helmets, greaves, bracers — is its own line rather
  // than folded into "light armour", because a player looking for
  // whether they can wear a helmet will not find the answer under
  // "light armour".
  const tiers = ordered(profile.otherTiers, ["light", "medium", "heavy"]);
  for (const tier of tiers) {
    const pieces = (OTHER_ARMOUR_TIERS[tier] ?? [])
      .filter((name) => !profile.armourExclude.has(nameKey(name)));
    if (pieces.length) push(armour, pieces.join(", "), `${tier} armour proficiency`);
  }
  // Names are printed from `labels`, not from the key sets — the sets
  // hold flattened keys so they compare reliably, and
  // "fullhardenedleather" is not something to show anybody.
  for (const entry of profile.labels.armour) push(armour, entry.label, entry.source);
  // The material clauses, printed as the sentence they came from — the
  // Fey's armour is a rule, so there are no names in `labels.armour` to
  // print and the panel would otherwise show a Fey no armour at all.
  for (const rule of profile.armourRules ?? []) push(armour, sentenceCase(rule.why), rule.source);
  for (const entry of profile.labels.armourExclude) push(armour, `Not ${entry.label}`, entry.source);

  const shieldCategories = ordered(profile.shieldCategories, ["buckler", "light", "heavy", "tower"]);
  if (shieldCategories.length === 4) push(shield, "All shields", profile.classLabel);
  else if (shieldCategories.length === 3 && !profile.shieldCategories.has("tower")) {
    push(shield, "All shields except tower", profile.classLabel);
  } else if (shieldCategories.length) {
    push(shield, `${shieldCategories.join(", ")} shields`, profile.classLabel);
  }
  for (const entry of profile.labels.shield) push(shield, entry.label, entry.source);

  const weaponCategories = ordered(profile.weaponCategories, ["Simple", "Martial", "Exotic"]);
  if (weaponCategories.length) push(weapon, `${weaponCategories.join(", ")} weapons`, profile.classLabel);
  for (const rule of profile.weaponRules) push(weapon, sentenceCase(rule.why), rule.source);
  for (const entry of profile.labels.weapon) push(weapon, entry.label, entry.source);
  push(weapon, "Unarmed attacks", "every character");

  return {
    armour,
    shield,
    weapon,
    // Kept so a caller that just wants one list does not have to know the
    // grouping. The panel uses the groups.
    all: [...armour, ...shield, ...weapon],
    empty: !armour.length && !shield.length && weapon.length <= 1
  };
}

function sentenceCase(text) {
  const value = String(text ?? "").trim();
  return value ? value[0].toUpperCase() + value.slice(1) : "";
}

export { SYSTEM_ID as PROFICIENCY_SYSTEM_ID };
