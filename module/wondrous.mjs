/**
 * Wondrous items (Chapter 11) — pricing an item by its abilities.
 *
 * "Any magical item that is not covered by one of the above categories
 * falls into the wondrous category." Which means there is no catalogue
 * to price against: a wondrous item is priced by ADDING UP WHAT IT DOES.
 *
 *   "To determine the final cost of a wondrous magic item, add up the
 *   cost of all its individual abilities. To determine the items level,
 *   always round down to the nearest price if its total does not match
 *   one of the below values."
 *
 * So this file is a calculator, not a table reader. Each ability has a
 * BASE LEVEL from the cost table's modifier column, and then a set of
 * adjustments that move that level up or down — a save bonus that
 * applies to only one save is two levels cheaper, a skill bonus of a
 * type other than status is one level dearer, and so on. The level is
 * then read back as a price.
 *
 * THE CHAPTER GIVES NO WORKED EXAMPLE of the whole calculation, which
 * makes the adjustments the risky part: every one of them is a sentence
 * I have had to turn into arithmetic. Two of the shipped items do
 * confirm one adjustment each, and they are pinned as such in the
 * harness — Faith's Eye is a Skill Bonus +1 (level 4) restricted to
 * clerics and crusaders, which is exactly the PREREQUISITES rule's
 * "reduce the level of the ability by one" and it ships at level 3.
 */

import {
  SPELL_EFFECT_ENHANCEMENTS, WONDROUS_COST_TABLE, itemLevelForPrice, priceForLevel
} from "./magic-item-tables.mjs";

/**
 * A spell ability's frequency surcharge (3.617.0, Graham's R18 of block 37):
 * the armour/weapon Spell Effect table's — 1/day +0, 3/day +1, at will +2,
 * constant +4. Keys as the grants store them.
 */
export function wondrousSpellSurcharge(frequency = "daily") {
  const key = String(frequency ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (key === "thrice" || key === "3/day") return SPELL_EFFECT_ENHANCEMENTS["3/day"];
  if (key === "atwill") return SPELL_EFFECT_ENHANCEMENTS["at will"];
  if (key === "constant") return SPELL_EFFECT_ENHANCEMENTS.constant;
  return SPELL_EFFECT_ENHANCEMENTS["1/day"];
}

/**
 * The cost table's modifier column, as `kind -> level per value`.
 *
 * Read off TABLE 12 row by row: "Stat +1" sits on the 1,250 gp row,
 * which is level 5, so a +1 stat bonus is a level 5 ability. The
 * harness diffs every entry here against the table in the document.
 *
 * `spell` is indexed by the spell's PP, and PP 0 is a real value — a
 * cantrip is a level 1 ability, not a free one.
 */
export const WONDROUS_MODIFIERS = Object.freeze({
  spell: Object.freeze({
    0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10,
    10: 11, 11: 12, 12: 13, 13: 14, 14: 15, 15: 16, 16: 17, 17: 18, 18: 19, 19: 20
  }),
  baseDR: Object.freeze({ 1: 3, 2: 7, 3: 11, 4: 15, 5: 19 }),
  drBonus: Object.freeze({ 1: 5, 2: 10, 3: 15, 4: 20 }),
  dbBonus: Object.freeze({ 1: 6, 2: 12, 3: 18 }),
  energyResistance: Object.freeze({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 }),
  physicalResistance: Object.freeze({ 1: 6, 2: 11, 3: 17 }),
  saveBonus: Object.freeze({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 }),
  skillBonus: Object.freeze({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 }),
  spellAdder: Object.freeze({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20 }),
  stat: Object.freeze({ 1: 5, 2: 9, 3: 13, 4: 17 })
});

/** Every ability kind the table prices, for callers that offer a choice. */
export const WONDROUS_ABILITY_KINDS = Object.freeze(Object.keys(WONDROUS_MODIFIERS));

/**
 * The adjustments, as the chapter states them.
 *
 * Kept as data rather than as branches inside the function so that each
 * one can be checked against the sentence it came from, and so that a
 * reader can see the whole set at once. `levels` is added to the
 * ability's base level.
 */
export const WONDROUS_ADJUSTMENTS = Object.freeze([
  {
    key: "oneSave", kinds: ["saveBonus"], levels: -2,
    text: "If the bonus is only applied to one saving throw then reduce the level of the effect by two"
  },
  {
    key: "twoSaves", kinds: ["saveBonus"], levels: -1,
    text: "or by one if it applies to two saving throws"
  },
  {
    key: "onePartOfSave", kinds: ["saveBonus"], levels: -2,
    text: "if a resistance bonus is only applied to a single specific part of a saving throw, then lower the level of this ability by two"
  },
  {
    key: "somePartsOfSave", kinds: ["saveBonus"], levels: -1,
    text: "If the bonus applies to more than one specific part of a saving throw, then lower level of the ability by one"
  },
  {
    key: "oneSkillAction", kinds: ["skillBonus"], levels: -2,
    text: "If a skill bonus is only applied to a single specific action of a skill, then lower the level of this ability by two"
  },
  {
    key: "someSkillActions", kinds: ["skillBonus"], levels: -1,
    text: "If the bonus applies to more than one specific skill action but not the entire skill, then lower level of the ability by one"
  },
  {
    key: "specificDBAspect", kinds: ["dbBonus"], levels: -1,
    text: "If the bonus only applies to a specific aspect of DB, lower the level of the ability by one"
  },
  {
    key: "situationalStat", kinds: ["stat"], levels: -2,
    text: "If the bonus is situational and does not apply to all aspects of the ability score, then lower the level of the ability by two"
  },
  {
    key: "extraEqualStat", kinds: ["stat"], levels: 2,
    text: "You may apply additional, equal value stat bonuses to the item by increasing its level by 2"
  },
  // THE THREE "WRONG TYPE OF BONUS" CLAUSES, which move in the other
  // direction and by different amounts — DR is +2 where DB and skill are
  // +1. Worth stating, because "an off-type bonus costs one more level"
  // is the rule a reader assumes and it is wrong for DR.
  {
    key: "offTypeDB", kinds: ["dbBonus"], levels: 1,
    text: "If the bonus to DB is a type other than status, then increase the level of this ability by one"
  },
  {
    key: "offTypeDR", kinds: ["drBonus"], levels: 2,
    text: "If the bonus to DR is a type other than status, then increase the level of this ability by two"
  },
  {
    key: "offTypeSave", kinds: ["saveBonus"], levels: 1,
    text: "If the bonus to a saving throw is a type other than resistance, then increase the level of this ability by one"
  },
  {
    key: "offTypeSkill", kinds: ["skillBonus"], levels: 1,
    text: "If the item grants a different type of bonus to a skill, the level of the ability is increased by one"
  },
  // AND THE TWO THAT APPLY TO ANY ABILITY.
  {
    key: "limitedUse", kinds: null, levels: -1,
    text: "If the bonus or ability has limited use, then the level of the ability should be reduced by one (unless it is a spell)"
  },
  {
    key: "prerequisites", kinds: null, levels: -1,
    text: "If a wondrous items ability is keyed to be used by a specific race, class or has some other usage limit, then reduce the level of the ability by one"
  }
]);

const ADJUSTMENT_BY_KEY = new Map(WONDROUS_ADJUSTMENTS.map((a) => [a.key, a]));

/**
 * One ability's level, with its adjustments applied.
 *
 * Returns `{ level, price, base, applied, problems }`. An adjustment
 * that does not apply to this kind of ability is REPORTED rather than
 * silently ignored — "limited use" on a spell is the chapter's own
 * exception and worth saying out loud, and a save adjustment on a skill
 * bonus is a caller's mistake.
 *
 * The level is clamped to the table's range, since there is no level 0
 * ability and nothing above 20.
 */
export function wondrousAbilityLevel({ kind = "", value = 0, adjustments = [], frequency = "" } = {}) {
  const ladder = WONDROUS_MODIFIERS[kind];
  const problems = [];
  if (!ladder) {
    return { level: 0, price: 0, base: 0, applied: [], problems: [`"${kind}" is not a wondrous ability the table prices`] };
  }
  const key = Math.floor(Number(value) || 0);
  const base = ladder[key];
  if (base === undefined) {
    return {
      level: 0, price: 0, base: 0, applied: [],
      problems: [`the table prices no ${kind} of ${key} — it lists ${Object.keys(ladder).join(", ")}`]
    };
  }

  let level = base;
  const applied = [];
  // A SPELL IS PRICED BY ITS PP AND HOW OFTEN (R18): the frequency
  // surcharge rides on top. An unstated frequency is 1/day, +0.
  const surcharge = kind === "spell" && frequency ? wondrousSpellSurcharge(frequency) : 0;
  level += surcharge;
  for (const name of adjustments) {
    const adjustment = ADJUSTMENT_BY_KEY.get(name);
    if (!adjustment) { problems.push(`"${name}" is not one of the chapter's adjustments`); continue; }
    if (adjustment.kinds && !adjustment.kinds.includes(kind)) {
      problems.push(`"${name}" does not apply to a ${kind} ability`);
      continue;
    }
    // "...reduced by one (UNLESS IT IS A SPELL)" — the one carve-out in
    // the adjustment list, and the reason limited use is not simply a
    // blanket −1.
    if (name === "limitedUse" && kind === "spell") {
      problems.push("limited use does not reduce a spell's level — the chapter excepts spells");
      continue;
    }
    level += adjustment.levels;
    applied.push(name);
  }

  const clamped = Math.min(WONDROUS_COST_TABLE.length, Math.max(1, level));
  if (clamped !== level) {
    problems.push(`level ${level} is off the table — clamped to ${clamped}`);
  }
  return { level: clamped, price: priceForLevel("wondrous", clamped), base, applied, surcharge, problems };
}

/**
 * A whole wondrous item: the sum of its abilities, and the level that
 * sum buys.
 *
 * The level is read back off the ladder rather than taken from the
 * dearest ability, because "add up the cost of all its individual
 * abilities" then "round down to the nearest price" is two steps and
 * the second one is not the first. An item with two level-5 abilities
 * costs 2,500 gp and is level 6 — dearer than either part, and a level
 * higher.
 */
export function wondrousItemValue(abilities = []) {
  const priced = (abilities ?? []).map((ability) => ({
    ...ability, ...wondrousAbilityLevel(ability)
  }));
  const total = priced.reduce((sum, ability) => sum + ability.price, 0);
  return {
    abilities: priced,
    price: total,
    level: itemLevelForPrice("wondrous", total),
    problems: priced.flatMap((ability) => ability.problems)
  };
}
