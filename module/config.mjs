/**
 * Central configuration for TRG Prime.
 *
 * Skills are keyed by a stable slug so that every downstream rules element
 * (races, heritages, backgrounds, feats, class abilities, items and Active
 * Effects) can address a single skill by path, for example:
 *
 *   system.skills.religion.racial
 *   system.skills.handleAnimal.item
 *
 * Array indices could never provide this guarantee, because an index changes
 * whenever the collection is reordered or an entry is inserted.
 */
import { registeredClass } from "./module-api.mjs";

export const ATTRIBUTE_KEYS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma"
];

/**
 * Creature Size Modifiers (Chapter 1, Glossary of Terms — SIZE). Base HP
 * is a flat, one-time addition (not multiplied by level); Str/Dex mirror
 * each other with opposite sign, increasing by 1 per size step away from
 * Medium. The Gargantuan Dex entry is printed as "3" (no minus sign) in
 * the source text — interpolated as -3 to match the established
 * Str/Dex-mirror pattern every other size follows exactly; recorded as
 * an amendment rather than a silent guess.
 */
/**
 * Magical Traditions (Chapter 9): each tradition has one associated
 * skill and one governing ability score. Spellcraft = BSB + tradition
 * ability score; Charged Items can also be cast using the tradition
 * skill directly (Arcana/Occultism/Nature/Religion).
 */
export const TRADITIONS = {
  arcane: { label: "Arcane", skill: "arcana", ability: "intelligence", auraColour: "Red" },
  divinity: { label: "Divinity", skill: "religion", ability: "wisdom", auraColour: "Blue" },
  ethereal: { label: "Ethereal", skill: "occultism", ability: "charisma", auraColour: "Purple" },
  verdant: { label: "Verdant", skill: "nature", ability: "constitution", auraColour: "Green" }
};

/**
 * Ethics (Chapter 8, Other Rules — the Ethics Alignment System): fifteen
 * distinct ethical orientations a character can choose, replacing a
 * traditional alignment grid. "In the Ethics Alignment System,
 * characters can select one of the following ethics" — the sheet's own
 * Alignment field is this table now (3.220.0), not free text, since the
 * book prints a closed list rather than an open one.
 *
 * Keyed by a stable slug, matching every other keyed choice table in
 * this file — so a future label edit (a spelling fix, a house-rule
 * rename) cannot orphan a character who already chose one. `principle`
 * is the book's own "Guiding Principle" column, carried along so the
 * sheet can remind a player what they picked rather than just naming it.
 *
 * This is a DIFFERENT concept from the four-way alignment TRAITS
 * (chaos/evil/good/order) a creature or a divine aspect can carry —
 * see ALIGNMENT_OPPOSITES in creature-traits.mjs and the Deific
 * Aspect's own alignment feat in crusader.mjs. Those are unaffected:
 * neither reads this table or the character's chosen Ethic.
 */
export const ETHICS = {
  benevolence: {
    label: "Benevolence",
    principle: "Strives to promote kindness, empathy, and well-being for all beings, embracing the principles of good."
  },
  justice: {
    label: "Justice",
    principle: "Upholds fairness, equality, and the rule of law, seeking to rectify injustice and protect the rights of individuals."
  },
  harmony: {
    label: "Harmony",
    principle: "Values unity, cooperation, and peaceful coexistence, fostering a sense of balance and understanding among diverse entities."
  },
  prudence: {
    label: "Prudence",
    principle: "Emphasises wisdom, rationality, and careful decision-making, seeking to avoid unnecessary risks or harm."
  },
  autonomy: {
    label: "Autonomy",
    principle: "Cherishes individual freedom, personal choices, and self-determination, allowing each being to shape their own destiny."
  },
  altruism: {
    label: "Altruism",
    principle: "Places the needs of others before oneself, prioritising selfless acts and self-sacrifice to alleviate suffering and promote well-being."
  },
  equilibrium: {
    label: "Equilibrium",
    principle: "Values maintaining a harmonious balance between opposing forces and perspectives. Strives to find common ground and compromise to prevent extremes and ensure stability."
  },
  discipline: {
    label: "Discipline",
    principle: "Values structure, organisation, and adherence to established rules and systems. Strives to maintain order and efficiency, believing that a structured framework is necessary for the well-being and success of individuals and societies."
  },
  adaptability: {
    label: "Adaptability",
    principle: "Prioritises flexibility and openness to change, recognising the dynamic nature of ethical considerations. Seeks to adjust actions and decisions based on evolving circumstances to maintain harmony and fairness."
  },
  ambition: {
    label: "Ambition",
    principle: "Driven by personal success and achievement, willing to pursue goals with determination, even if it means stepping on others."
  },
  exploitation: {
    label: "Exploitation",
    principle: "Seeks to manipulate and exploit others for personal gain, disregarding ethical considerations in favour of power and control."
  },
  anarchy: {
    label: "Anarchy",
    principle: "Embraces chaos, disorder, and the rejection of authority, seeking to dismantle oppressive systems and structures."
  },
  malevolence: {
    label: "Malevolence",
    principle: "Delights in causing harm, suffering, and chaos, revelling in the infliction of pain upon others."
  },
  deception: {
    label: "Deception",
    principle: "Relies on lies, manipulation, and deceit to achieve personal goals, disregarding the well-being of others."
  },
  nihilism: {
    label: "Nihilism",
    principle: "Rejects moral absolutes, embracing a belief in the inherent meaninglessness of existence and the absence of ethical principles."
  },

  // THE CREATURE CODEX'S TWO, and the reason the list is now seventeen
  // rather than fifteen. Chapter 8's fifteen are the ethics a PLAYER
  // chooses; these two are the ones a creature is given, and the Codex is
  // explicit that they are not a subset of the others:
  //
  //   "Mindless creatures or those of low intelligence lack comprehension
  //    of complex ethical choices, and their actions are governed solely
  //    by instinct. These creatures possess either the animal or mindless
  //    ethics which are described below."
  //
  // Until now an NPC had to be given one of the fifteen — a zombie filed
  // under Prudence or Autonomy — or left blank. Neither is what the book
  // says.
  //
  // They sit at the END of the table on purpose. The order is the book's
  // own, and these two come from a different book; putting them last
  // keeps Chapter 8's fifteen reading in its printed order, which is how
  // anyone comparing the sheet to the page will read it.
  //
  // `mindless` here is the ETHIC. The mindless TRAIT — the one that
  // penalises Intelligence and Charisma and grants immunity to Mental —
  // is a different thing entirely and lives in creature-traits.mjs. A
  // creature usually has both, and nothing in this file reads that one.
  animal: {
    label: "Animal",
    source: "Creature Codex",
    principle: "Creatures with this ethic exhibit instincts and behaviours akin to those found in the animal kingdom. They are driven by primal needs, instincts, and natural inclinations. These beings lack the capacity for complex moral reasoning, and their actions are primarily governed by survival, territoriality, and the pursuit of food and safety. Such creatures may be aggressive if threatened, protective of their young, or may engage in social hierarchies common to their species. While not inherently malicious, they can pose a threat to those who encroach upon their territory or provoke them."
  },
  mindless: {
    label: "Mindless",
    source: "Creature Codex",
    principle: "Creatures with this ethic lack any discernible consciousness or self-awareness. They do not possess thoughts, emotions, or moral reasoning, rendering them devoid of intentions or motivations. Instead, they rely solely on instinctive reactions to stimuli in their environment."
  }
};

/*
 * CREATURE SIZE MODIFIERS II (page 197), with the Space column the table
 * prints and the two reaches it corrects.
 *
 * DIMINUTIVE AND TINY REACH 0, not 5 (3.579.0; the block-19 audit's D12,
 * Graham's R12 of 21 September 2026). They had reach 5 here, so a pixie
 * threatened the square beside it like a swordsman. The page is explicit
 * in two places: the table gives both a reach of 0', and the text says
 * they "can occupy the same space as another creature and must do so to
 * make attacks against them".
 *
 * `space` is the table's own column, in feet — under 5 for the smallest
 * two, which is what `sharesSquare` turns into a rule. `perSquare` is the
 * same sentence's cap: "Up to four Tiny creatures can occupy the same
 * space and up to eight Diminutive creatures." Null means one, which is
 * every other row.
 *
 * COLOSSAL IS 25, not the table's 30 (errata E5): the text beneath says a
 * Colossal creature "occupies twenty-five squares", which is 25 feet
 * across, and the grid footprint the system uses agrees.
 */
export const SIZE_TABLE = {
  diminutive: { label: "Diminutive", baseHP: 0, strMod: -3, dexMod: 3, reach: 0, space: 5, sharesSquare: true, perSquare: 8 },
  tiny: { label: "Tiny", baseHP: 10, strMod: -2, dexMod: 2, reach: 0, space: 5, sharesSquare: true, perSquare: 4 },
  small: { label: "Small", baseHP: 20, strMod: -1, dexMod: 1, reach: 5, space: 5, sharesSquare: false, perSquare: 1 },
  medium: { label: "Medium", baseHP: 30, strMod: 0, dexMod: 0, reach: 5, space: 5, sharesSquare: false, perSquare: 1 },
  large: { label: "Large", baseHP: 50, strMod: 1, dexMod: -1, reach: 10, space: 10, sharesSquare: false, perSquare: 1 },
  huge: { label: "Huge", baseHP: 80, strMod: 2, dexMod: -2, reach: 15, space: 15, sharesSquare: false, perSquare: 1 },
  gargantuan: { label: "Gargantuan", baseHP: 120, strMod: 3, dexMod: -3, reach: 20, space: 20, sharesSquare: false, perSquare: 1 },
  colossal: { label: "Colossal", baseHP: 250, strMod: 4, dexMod: -4, reach: 25, space: 25, sharesSquare: false, perSquare: 1 }
};

/**
 * Max Hit Points (Chapter 1, Glossary — HIT POINTS): "Size Modifier + Con
 * (per level) + Class Mod (per level) + Other Modifiers." Size's Base HP
 * is a flat, one-time addition; Constitution and the class's HP-per-level
 * rate both scale with level.
 *
 * `hpPerLevel` is "Class Mod". A class item with a progression table
 * supplies it (documents/actor.mjs reads system.progression.hitPoints);
 * the field stays editable for NPCs and for characters with no class.
 * `other` is a manual catch-all for anything the formula doesn't capture
 * (feats, magic items, etc.), matching the rulebook's own "Other
 * Modifiers" term.
 */
/**
 * Class Bonus, from the Level Table (Chapter 3).
 *
 * Banded rather than per-level: the printed table steps at 5th, 10th,
 * 15th and 20th. Exported so verify-classes.mjs can run it against the
 * transcribed table instead of grepping the two lines of it that a
 * source-text check happened to name — four of the six bands could be
 * changed without a single check going red.
 */
export function classBonusForLevel(level) {
  const lvl = Math.max(Number(level) || 0, 0);
  if (lvl < 1) return 0;
  if (lvl >= 20) return 6;
  if (lvl >= 15) return 5;
  if (lvl >= 10) return 4;
  if (lvl >= 5) return 3;
  return 2;
}

/**
 * Which classes carry a Deific Aspect / Wizard School class ability
 * (tools/class-data.mjs — Cleric and Crusader both list "Deific Aspect"
 * among their abilities, Wizard lists "Wizard School"; no other class
 * does, and EXPECTED_ABILITIES in verify-classes.mjs pins that). The
 * Foundations card's "Add" buttons for those two slots use this so a
 * Fighter or a Rogue isn't offered a picker for something their class
 * never asks them to select — an archetype (Priestly Path, Arcane Bond)
 * never opens either list to a different class, so the character's own
 * class item name is the whole answer, not the effective/archetype-
 * widened class list feats already use.
 */
/**
 * The item types that say WHERE A CHARACTER COMES FROM, and which
 * therefore hand out specialist skills and languages: race, heritage,
 * background and — from 3.250.0 — a campaign origin.
 *
 * ONE LIST, BECAUSE THERE WERE FOUR. The same three type names were
 * written out by hand in languages-workflow, grants-workflow and
 * grant-cleanup (twice), each governing a different half of the same
 * behaviour. Adding a fourth type meant finding all four from memory,
 * and missing one would have given us an origin that grants a specialist
 * skill it can never take back, or whose languages nothing reads —
 * failures that look like nothing at all until a character deletes the
 * item months later.
 *
 * A class is deliberately NOT here: it grants through its own levelled
 * table, and its cleanup restores sheet fields no foundation touches.
 */
export const FOUNDATION_ITEM_TYPES = Object.freeze([
  "race", "heritage", "background", "origin"
]);

export const DIVINE_ASPECT_CLASSES = ["Cleric", "Crusader"];
export const WIZARD_SCHOOL_CLASSES = ["Wizard"];

export function classNeedsDivineAspect(className) {
  const clean = String(className ?? "").trim();
  return DIVINE_ASPECT_CLASSES.includes(clean) || Boolean(registeredClass(clean)?.needsDivineAspect);
}

/**
 * A registered class that DECLINES the aspect (3.625.0): its book says a
 * divinity caster of this class needs no Divine Aspect, so the tradition
 * inference in aspect-rules.mjs must not raise the banner for it.
 */
export function classDeclinesDivineAspect(className) {
  const clean = String(className ?? "").trim();
  return Boolean(registeredClass(clean)?.declinesDivineAspect);
}

export function classNeedsWizardSchool(className) {
  const clean = String(className ?? "").trim();
  return WIZARD_SCHOOL_CLASSES.includes(clean) || Boolean(registeredClass(clean)?.needsWizardSchool);
}

/**
 * XP and Level (Graham's ruling, 3.218.0): a character has 10,000 XP at
 * 1st level, and each additional 10,000 raises Level by one — 20,000 at
 * 2nd, 30,000 at 3rd, and so on. Level is read off the XP total rather
 * than typed in separately, for PLAYER CHARACTERS only; see
 * documents/actor.mjs's prepareIdentity for why NPCs are excluded.
 *
 * Capped at the Level Table's own twentieth row (Chapter 3) — the same
 * ceiling classBonusForLevel above tops out at — since there is no
 * twenty-first row for any class to resolve against.
 */
export const XP_PER_LEVEL = 10000;
export const MAX_CHARACTER_LEVEL = 20;

/** The Level a total XP figure resolves to. Never below 1st. */
export function levelForXP(xp) {
  const value = Math.max(0, Number(xp) || 0);
  const level = Math.floor(value / XP_PER_LEVEL);
  return Math.min(Math.max(level, 1), MAX_CHARACTER_LEVEL);
}

/** The XP total AT which a given Level is first reached. */
export function xpForLevel(level) {
  const lvl = Math.min(Math.max(Math.round(Number(level) || 0), 1), MAX_CHARACTER_LEVEL);
  return lvl * XP_PER_LEVEL;
}

/**
 * The XP total that raises a character from the given Level to the next
 * one — what the sheet's "Next Level" field shows. A character already
 * at the twentieth level has no next threshold to show, so this returns
 * their own current-level figure rather than inventing a 21st row.
 */
export function xpForNextLevel(level) {
  const lvl = Math.min(Math.max(Math.round(Number(level) || 0), 1), MAX_CHARACTER_LEVEL);
  return xpForLevel(Math.min(lvl + 1, MAX_CHARACTER_LEVEL));
}

/**
 * Resolve Level (and, for a player character, Next Level) onto an
 * identity block, in place.
 *
 * A PURE function, deliberately: documents/actor.mjs's prepareIdentity
 * cannot itself be imported outside Foundry (it lives on a class that
 * extends the Foundry Actor global), so the actual level-from-XP logic
 * lives here instead — the same reason fighter.mjs and rogue.mjs are
 * their own modules — precisely so a harness can RUN it against a stub
 * identity object rather than only grep the call site.
 *
 * NPCs are left alone entirely: a GM types an NPC's level directly for
 * quick stat-blocking, and NPCs are not expected to track XP at all.
 *
 * @param {object} identity system.identity — mutated in place.
 * @param {string} actorType "character" or "npc".
 */
export function deriveLevelFromXP(identity, actorType) {
  if (actorType !== "character" || !identity?.xp) return;
  identity.level = levelForXP(identity.xp.value);
  identity.xp.max = xpForNextLevel(identity.level);
}

export function hitPointMax({ size, conTotal, level, hpPerLevel, other }) {
  const sizeEntry = SIZE_TABLE[size] ?? SIZE_TABLE.medium;
  const lvl = Math.max(1, Math.round(Number(level) || 0));
  return Math.round(
    sizeEntry.baseHP +
      (Number(conTotal) || 0) * lvl +
      (Number(hpPerLevel) || 0) * lvl +
      (Number(other) || 0)
  );
}

/**
 * Natural Healing (Chapter 7, Death & Dying): "You recover one tenth of
 * your Total HPs for every full hour of rest in a safe environment."
 * A flat per-hour rate (rounded down once), multiplied by hours rested
 * — Medicine checks, herbs, or magical healing can add to this, but
 * that's each their own separate mechanic, not part of this baseline.
 */
export function naturalHPHealing(maxHP, hours) {
  const perHour = Math.floor(Math.max(0, Math.floor(Number(maxHP) || 0)) / 10);
  return perHour * Math.max(0, Math.floor(Number(hours) || 0));
}

export const ATTRIBUTE_LABELS = {
  strength: "Strength",
  dexterity: "Dexterity",
  constitution: "Constitution",
  intelligence: "Intelligence",
  wisdom: "Wisdom",
  charisma: "Charisma"
};

export const ATTRIBUTE_ICONS = {
  strength: "fa-solid fa-hand-fist",
  dexterity: "fa-solid fa-feather-pointed",
  constitution: "fa-solid fa-heart-pulse",
  intelligence: "fa-solid fa-book-open",
  wisdom: "fa-solid fa-eye",
  charisma: "fa-solid fa-crown"
};

/**
 * The twenty-six master skills of TRG Prime Core 3.1, Chapter 4.
 * The key ability recorded here is the default; an actor may override it in
 * their own data if a feat or ability changes the governing attribute.
 */
export const SKILLS = {
  acrobatics: { label: "Acrobatics", ability: "dexterity" },
  arcana: { label: "Arcana", ability: "intelligence" },
  artistry: { label: "Artistry", ability: "intelligence" },
  athletics: { label: "Athletics", ability: "strength" },
  climbing: { label: "Climbing", ability: "dexterity" },
  crafting: { label: "Crafting", ability: "intelligence" },
  culture: { label: "Culture", ability: "intelligence" },
  deception: { label: "Deception", ability: "charisma" },
  diplomacy: { label: "Diplomacy", ability: "charisma" },
  handleAnimal: { label: "Handle Animal", ability: "wisdom" },
  intimidate: { label: "Intimidate", ability: "charisma" },
  linguistics: { label: "Linguistics", ability: "intelligence" },
  medicine: { label: "Medicine", ability: "wisdom" },
  meditation: { label: "Meditation", ability: "wisdom" },
  mentalFocus: { label: "Mental Focus", ability: "wisdom" },
  nature: { label: "Nature", ability: "wisdom" },
  occultism: { label: "Occultism", ability: "intelligence" },
  perception: { label: "Perception", ability: "wisdom" },
  perform: { label: "Perform", ability: "charisma" },
  planes: { label: "Planes", ability: "intelligence" },
  powerManipulation: { label: "Power Manipulation", ability: "intelligence" },
  religion: { label: "Religion", ability: "wisdom" },
  senseMotive: { label: "Sense Motive", ability: "wisdom" },
  stealth: { label: "Stealth", ability: "dexterity" },
  survival: { label: "Survival", ability: "wisdom" },
  thievery: { label: "Thievery", ability: "dexterity" }
};

/** Keys of the master skills defined by the core rules. */
export const CORE_SKILL_KEYS = Object.keys(SKILLS);

/** The bonus fields carried by every master skill entry. */
export const SKILL_BONUS_FIELDS = [
  "ranks",
  "class",
  "racial",
  "item",
  "status",
  "other"
];

/** The bonus fields carried by every specialist skill entry. */
export const SPECIALIST_BONUS_FIELDS = [
  "class",
  "racial",
  "item",
  "status",
  "other"
];

/**
 * Convert a human readable name into a stable camelCase key.
 * "Handle Animal" -> "handleAnimal", "Power Manipulation" -> "powerManipulation"
 * @param {string} value
 * @returns {string}
 */
export function slugifyKey(value) {
  const words = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "";

  return words
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/**
 * Produce a key that does not already exist within the supplied collection.
 * @param {string} desired The preferred key.
 * @param {object} collection The collection the key must be unique within.
 * @returns {string}
 */
export function uniqueKey(desired, collection) {
  const base = desired || "entry";
  if (!Object.hasOwn(collection ?? {}, base)) return base;

  let suffix = 2;
  while (Object.hasOwn(collection ?? {}, `${base}${suffix}`)) suffix += 1;
  return `${base}${suffix}`;
}

/** A blank master skill entry. */
export function blankSkill(ability = "intelligence") {
  return {
    label: "",
    ability,
    // "This is a class skill" — a yes/no, NOT a number.
    //
    // It used to be expressed by typing your class bonus into `class`
    // below, which made one field mean two different things: "this skill
    // gets my class bonus" and "something granted a flat class-type
    // bonus here" (Favoured Terrain writes +2 into that slot). They
    // behave differently — several sources agreeing that a skill is a
    // class skill give you the bonus once per source, while a flat
    // class-type bonus is its own entry — so they are two fields now.
    classSkill: false,
    ranks: 0,
    class: 0,
    racial: 0,
    item: 0,
    status: 0,
    other: 0,
    total: 0,
    dc: 10
  };
}

/** A blank specialist skill entry. */
export function blankSpecialistSkill(ability = "intelligence") {
  return {
    label: "New Specialist Skill",
    ability,
    class: 0,
    racial: 0,
    item: 0,
    status: 0,
    other: 0,
    total: 0,
    dc: 10
  };
}

/**
 * Damage types (Core 3.1, Chapter 7). Needed now for Recurring Damage
 * labelling; the damage pipeline will consume the full metadata later.
 */
export const DAMAGE_TYPES = {
  // dr: how Damage Reduction interacts with the type (Chapter 7).
  //   "full"  DR applies in full (physical types)
  //   "half"  armour may only use half its DR (the five energy types)
  //   "none"  armour is ineffective and DR does not apply at all
  bludgeoning: { label: "Bludgeoning", group: "physical", dr: "full" },
  piercing: { label: "Piercing", group: "physical", dr: "full" },
  slashing: { label: "Slashing", group: "physical", dr: "full" },
  subdual: { label: "Subdual", group: "physical", dr: "full", nonlethal: true },
  acid: { label: "Acid", group: "energy", dr: "half" },
  cold: { label: "Cold", group: "energy", dr: "half" },
  electricity: { label: "Electricity", group: "energy", dr: "half" },
  fire: { label: "Fire", group: "energy", dr: "half" },
  sonic: { label: "Sonic", group: "energy", dr: "half" },
  essence: { label: "Essence", group: "special", dr: "none" },
  force: { label: "Force", group: "special", dr: "none" },
  aligned: { label: "Aligned", group: "special", dr: "none" },
  mental: { label: "Mental", group: "special", dr: "none" },
  poison: { label: "Poison", group: "special", dr: "none" }
};

export const TRG = {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABELS,
  ATTRIBUTE_ICONS,
  SKILLS,
  CORE_SKILL_KEYS,
  SKILL_BONUS_FIELDS,
  SPECIALIST_BONUS_FIELDS,
  DAMAGE_TYPES
};

/**
 * The thirteen weapon groups, as printed (Chapter 6, page 157):
 *   Axe, Brawling, Club, Knife, Spear, Polearm, Sword, Flail, Hammer,
 *   Pick, Dart (with the blowgun), Bow (with every crossbow and the
 *   Repeater), Sling.
 * The pack had Crossbow and Blowgun groups of its own until 3.575.0
 * (Graham, 19 Sep 2026: follow print). What a weapon FIRES is now its
 * own field — see `weaponAmmunitionFamily` in combat/ammunition.mjs.
 */
export const WEAPON_GROUPS = Object.freeze([
  "Axe", "Bow", "Brawling", "Club", "Dart", "Flail", "Hammer",
  "Knife", "Pick", "Polearm", "Sling", "Spear", "Sword"
]);
