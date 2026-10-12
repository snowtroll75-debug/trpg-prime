#!/usr/bin/env node
/**
 * verify-classes — Chapter 3's numbers. NEW at 3.554.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * Auditing pages 41–50 on 15 September 2026 I checked roughly 1,400
 * printed numbers by hand — the Level Table, four class tables of twenty
 * rows each, the class-type table and every per-class field — and found
 * no differences at all. Then I looked for the check that would have
 * told me, and there was none: `verify-chapter1`, `verify-chapter2` and
 * `verify-chapter5-batch` exist, and between them sits nothing.
 *
 * Two source comments had already been written as though this file were
 * here. config.mjs: "Exported so verify-classes.mjs can run it against
 * the transcribed table instead of grepping the two lines of it that a
 * source-text check happened to name — four of the six bands could be
 * changed without a single check going red." And again: "EXPECTED_ABILITIES
 * in verify-classes.mjs pins that." Neither was true. A comment naming a
 * check that does not exist is worse than no comment, because the next
 * reader stops looking.
 *
 * WHAT THE FAILURE LOOKS LIKE, and why it needs a harness rather than
 * care: one wrong digit in a progression array is INVISIBLE. The sheet
 * shows a number, the number is plausible, every roll uses it, and
 * nothing anywhere disagrees. There is no crash, no warning and no
 * second opinion — the pack IS the opinion. The same is true of the
 * Level Table's bands, which step at 5th, 10th, 15th and 20th and would
 * survive any regex that happened to name two of them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS AND IS NOT COVERED, because a half-covered chapter reported as
 * covered is the failure this harness was rebuilt to stop.
 *
 *   COVERED, as of 3.555.0: ALL OF CHAPTER 3's numbers. The Level Table
 *   (page 42); the class-type table (page 43); and for all EIGHT classes
 *   the full entry — key abilities, hit points, skill points, class
 *   skills, granted feats, tradition, magical ability, caster style,
 *   memorisation, both cantrip counts, the spell-book opening batch and
 *   the repertoire category — plus every cell of all eight twenty-row
 *   progression tables. 1,440 printed cells in the tables alone.
 *
 *   Block 4 (15 September 2026) read pages 41–50 and brought in Bard,
 *   Cleric, Crusader and Druid. Block 5 (16 September 2026) read pages
 *   51–60 and brought in Fighter, Ranger, Rogue and Wizard, the eight
 *   Wizard Schools, the choice lists behind the four path abilities, and
 *   the three fixes that block found: sections J, K and L.
 *
 *   The old section G — "the four unread classes are at least
 *   table-shaped" — is gone, because there are none left to be shape-
 *   checked in place of being checked.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  MAX_CHARACTER_LEVEL, TRADITIONS, XP_PER_LEVEL,
  classBonusForLevel, levelForXP, xpForLevel
} from "../module/config.mjs";
import { abilityBaseRange, abilityIncreaseCount, abilityPointPool } from "../module/attributes.mjs";
import { featPicksByLevel } from "../module/feats.mjs";
import {
  NULLABLE_COLUMNS, PROGRESSION_COLUMNS,
  classAbilityRequirement, classCasts, classMinimumShortfall, classMinimumWarning,
  powerPointAbilityBonus, powerPointMax, progressionRow, resolveClassProgression,
  skillPointsPerLevel
} from "../module/class-progression.mjs";
import { resolvedCasterLevel } from "../module/magic/feat-casting.mjs";
import { memorisedSpellCount } from "../module/magic/memorisation.mjs";
import { repertoirePickCount } from "../module/magic/repertoire.mjs";
import { bookOfNotationsSlots } from "../module/bard.mjs";
import { wildShapeUsesPerDay } from "../module/druid.mjs";
import { resolveUsesPerDay } from "../module/uses.mjs";
import {
  armourExemplarSteps, pressTheAdvantageStride,
  unbreakableResolvePartialToSuccess, weaponExemplarTierCount
} from "../module/fighter.mjs";
import {
  precisionHunterDice, relentlessHunterReduction, stalkerHunterBonus,
  swiftPursuitMode, terrainMasteryBonus
} from "../module/ranger.mjs";
import {
  attackIsFromATrap, roguishSkillPickCount, sneakAttackDice,
  trapFinderDefenceBonus, trapFinderValue
} from "../module/rogue.mjs";
import {
  arcaneBondBonus, enchantingSmileBonus, forewarnedBonus,
  intenseSpellsBonus, wardingResistanceField
} from "../module/wizard.mjs";
import { spellBookSlots } from "../module/magic/spellbook.mjs";
import { ignoresDifficultTerrain } from "../module/combat/passive-feats.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * THE PRINTED LEVEL TABLE, page 42, transcribed once.
 *
 * [level, totalXP, classBonus, abilityIncrease, generalFeats, classFeats]
 *
 * `abilityIncrease` is the book's own column: a dash on most rows, and
 * on 3rd, 6th, 9th, 12th, 15th and 18th the ORDINAL of the increase
 * ("1st", "2nd" …) rather than a count of anything. Transcribed as the
 * running total it names, null for a dash.
 *
 * ONE PRINTING SLIP, not an erratum worth a pack edit: the 2nd-level row
 * prints "20.000" with a full stop. Transcribed as 20,000 — every other
 * row is level x 10,000 and the text above the table says so.
 * ================================================================== */
const LEVEL_TABLE = [
  [1, 10000, 2, null, 1, 1],
  [2, 20000, 2, null, 1, 2],
  [3, 30000, 2, 1, 2, 2],
  [4, 40000, 2, null, 2, 3],
  [5, 50000, 3, null, 3, 3],
  [6, 60000, 3, 2, 3, 4],
  [7, 70000, 3, null, 4, 4],
  [8, 80000, 3, null, 4, 5],
  [9, 90000, 3, 3, 5, 5],
  [10, 100000, 4, null, 5, 6],
  [11, 110000, 4, null, 6, 6],
  [12, 120000, 4, 4, 6, 7],
  [13, 130000, 4, null, 7, 7],
  [14, 140000, 4, null, 7, 8],
  [15, 150000, 5, 5, 8, 8],
  [16, 160000, 5, null, 8, 9],
  [17, 170000, 5, null, 9, 9],
  [18, 180000, 5, 6, 9, 10],
  [19, 190000, 5, null, 10, 10],
  [20, 200000, 6, null, 10, 11]
];

/* ================================================================== *
 * A. THE LEVEL TABLE, DRIVEN
 *
 * Every cell run through the function that serves it, rather than the
 * two or three a regex would have named.
 * ================================================================== */
eq("A1 the table has the twenty rows the book prints", LEVEL_TABLE.length, MAX_CHARACTER_LEVEL);
{
  const wrongXP = [];
  const wrongBonus = [];
  const wrongIncrease = [];
  const wrongGeneral = [];
  const wrongClass = [];
  for (const [level, xp, bonus, increase, general, klass] of LEVEL_TABLE) {
    if (xpForLevel(level) !== xp) wrongXP.push(`${level}: ${xpForLevel(level)} vs ${xp}`);
    if (classBonusForLevel(level) !== bonus) {
      wrongBonus.push(`${level}: ${classBonusForLevel(level)} vs ${bonus}`);
    }
    // The dash rows are not "no increase so far" — they are "no NEW
    // increase", so the running total is what carries across them.
    const expectedCount = increase ?? Math.floor(level / 3);
    if (abilityIncreaseCount(level) !== expectedCount) {
      wrongIncrease.push(`${level}: ${abilityIncreaseCount(level)} vs ${expectedCount}`);
    }
    const picks = featPicksByLevel(level);
    if (picks.general !== general) wrongGeneral.push(`${level}: ${picks.general} vs ${general}`);
    if (picks.class !== klass) wrongClass.push(`${level}: ${picks.class} vs ${klass}`);
  }
  eq("A2 Total XP matches every printed row", wrongXP, []);
  eq("A3 Class Bonus matches every printed row", wrongBonus, []);
  eq("A4 the Ability Increase column matches every printed row", wrongIncrease, []);
  eq("A5 General Feats matches every printed row", wrongGeneral, []);
  eq("A6 Class Feats matches every printed row", wrongClass, []);
}
// THE BANDS, NAMED AT THEIR EDGES. A5 above would catch a moved band, but
// only through twenty rows of one array; these say which step moved.
eq("A7 the Class Bonus steps exactly where the table steps",
  [1, 4, 5, 9, 10, 14, 15, 19, 20].map(classBonusForLevel),
  [2, 2, 3, 3, 4, 4, 5, 5, 6]);
eq("A8 and a level above the table keeps the twentieth row's bonus",
  classBonusForLevel(25), 6);
eq("A9 below 1st there is no class bonus at all", classBonusForLevel(0), 0);
// XP IS THE LEVEL, and the sheet derives the level from it rather than
// storing one. A misread here moves every row of every class table.
eq("A10 the XP step is the printed 10,000", XP_PER_LEVEL, 10000);
eq("A11 each threshold reads back as its own level",
  LEVEL_TABLE.map(([level, xp]) => levelForXP(xp) === level).filter((x) => !x), []);
eq("A12 a total one short of the next threshold stays on this level",
  LEVEL_TABLE.map(([level, xp]) => levelForXP(xp + XP_PER_LEVEL - 1) === level).filter((x) => !x), []);
eq("A13 the table stops at its twentieth row", levelForXP(999999), MAX_CHARACTER_LEVEL);
// "Be aware that you may not increase the base value of an ability score
// above 6 with ability score increases." — page 42, the line under the
// table, and the only hard ceiling the chapter states.
eq("A14 the printed ceiling of 6 holds at every level",
  [1, 3, 6, 9, 12, 15, 18, 20].map((l) => abilityBaseRange(l).max),
  [4, 5, 6, 6, 6, 6, 6, 6]);
eq("A15 and the point pool grows by one per increase",
  [1, 3, 6, 18, 20].map(abilityPointPool), [6, 7, 8, 12, 12]);

/* ================================================================== *
 * THE PRINTED CLASS TYPE TABLE, page 43. All eight, in the book's order.
 * ================================================================== */
const CLASS_TYPES = [
  ["Bard", "Adept/Expert"],
  ["Cleric", "Adept"],
  ["Crusader", "Martial"],
  ["Druid", "Adept"],
  ["Fighter", "Martial"],
  ["Ranger", "Martial"],
  ["Rogue", "Expert"],
  ["Wizard", "Adept"]
];

/* ================================================================== *
 * THE FOUR ENTRIES READ IN THIS BLOCK, pages 44–50.
 *
 * `bonusFeats: false` means the class's table has NO Bonus Feats column
 * at all — which is a different statement from a column printing 0, and
 * has to stay different or a Cleric acquires an allowance the book never
 * gave it.
 * ================================================================== */
const ENTRIES = [
  {
    name: "Bard", page: "44–45",
    keyAbilities: "Charisma (min +2), Dexterity, Intelligence",
    classSkills: "Acrobatics, Arcana, Artistry, Culture, Deception, Diplomacy, Intimidate, Linguistics, Nature, Occultism, Perception, Perform, Planes, Power Manipulation, Religion, Sense Motive",
    grantedFeats: "",
    hitPoints: 8, skillPoints: 8,
    tradition: "ethereal", magicalAbility: "charisma",
    casterStyle: "instinctive", memorisationStyle: "", cantripsKnown: 2, cantripsPerDay: 0,
    spellBookFirstPicks: 0, repertoireCategory: "",
    bonusFeats: true
  },
  {
    name: "Cleric", page: "46",
    keyAbilities: "Wisdom (min +2), Charisma, Constitution",
    classSkills: "Culture, Linguistics, Medicine, Meditation, Mental Focus, Planes, Power Manipulation, Religion, Sense Motive",
    // "At 1st level you gain the Heighten Spell feat."
    grantedFeats: "1: Heighten Spell",
    hitPoints: 6, skillPoints: 4,
    tradition: "divinity", magicalAbility: "wisdom",
    casterStyle: "learned", memorisationStyle: "list", cantripsKnown: 0, cantripsPerDay: 4,
    spellBookFirstPicks: 0, repertoireCategory: "",
    bonusFeats: false
  },
  {
    name: "Crusader", page: "47–48",
    keyAbilities: "Charisma (min +2), Constitution, Strength",
    classSkills: "Artistry, Athletics, Climbing, Culture, Diplomacy, Handle Animal, Intimidate, Linguistics, Medicine, Religion, Sense Motive",
    grantedFeats: "",
    hitPoints: 10, skillPoints: 4,
    tradition: "divinity", magicalAbility: "charisma",
    casterStyle: "instinctive", memorisationStyle: "", cantripsKnown: 0, cantripsPerDay: 0,
    spellBookFirstPicks: 0, repertoireCategory: "",
    bonusFeats: true
  },
  {
    // E2, amended by Graham in the rulebook on 15 September 2026: the
    // printed line had the comma INSIDE the requirement, "Constitution,
    // (min +2), Dexterity, Wisdom". The pack copied it verbatim and the
    // declared fix `druid-key-abilities-comma` removed it, because R1
    // gave the bracket a reader and the broken shape is refused.
    name: "Druid", page: "49–50",
    keyAbilities: "Constitution (min +2), Dexterity, Wisdom",
    classSkills: "Athletics, Climbing, Culture, Handle Animal, Linguistics, Meditation, Mental Focus, Nature, Power Manipulation, Survival",
    grantedFeats: "1: Heighten Spell, 1: Wild Stride",
    hitPoints: 6, skillPoints: 6,
    tradition: "verdant", magicalAbility: "constitution",
    casterStyle: "learned", memorisationStyle: "list", cantripsKnown: 0, cantripsPerDay: 4,
    spellBookFirstPicks: 0, repertoireCategory: "",
    bonusFeats: false
  },

  /* ---- block 5, pages 51–60 ---- */

  {
    // The only class whose minimum is an EITHER-OR, and the reason
    // `classAbilityRequirement` splits on "or" at all.
    name: "Fighter", page: "51–52",
    keyAbilities: "Strength or Dexterity (min +2), Constitution",
    classSkills: "Athletics, Climbing, Culture, Diplomacy, Handle Animal, Intimidate, Survival",
    // "At 1st level you gain one bonus class feat" — a PICK, which the
    // table's own Bonus Feats column carries. Nothing is named, so
    // nothing is granted, and a name appearing here would hand out a
    // feat the book never specified.
    grantedFeats: "",
    hitPoints: 12, skillPoints: 4,
    tradition: "", magicalAbility: "",
    casterStyle: "", memorisationStyle: "", cantripsKnown: 0, cantripsPerDay: 0,
    spellBookFirstPicks: 0, repertoireCategory: "",
    bonusFeats: true
  },
  {
    name: "Ranger", page: "53–54",
    keyAbilities: "Constitution (min +2), Dexterity, Wisdom",
    classSkills: "Acrobatics, Athletics, Climbing, Culture, Handle Animal, Nature, Perception, Stealth, Survival",
    // "At 1st level you gain the Favoured Terrain feat" — NAMED, so it
    // is a grant, and free. Its table prints 0 Bonus Feats until 4th,
    // which is the same convention the Rogue's Evasion and the Wizard's
    // two follow: a named grant sits outside the column.
    grantedFeats: "1: Favoured Terrain",
    hitPoints: 10, skillPoints: 6,
    tradition: "verdant", magicalAbility: "constitution",
    casterStyle: "instinctive", memorisationStyle: "", cantripsKnown: 0, cantripsPerDay: 0,
    spellBookFirstPicks: 0,
    // "any two PP 2 UTILITY verdant spells" — the only class whose
    // repertoire is narrowed to a category.
    repertoireCategory: "utility",
    bonusFeats: true
  },
  {
    name: "Rogue", page: "55–56",
    keyAbilities: "Dexterity (min +2), Wisdom, Charisma",
    classSkills: "Acrobatics, Artistry, Athletics, Climbing, Culture, Deception, Diplomacy, Intimidate, Linguistics, Perception, Sense Motive, Stealth, Thievery",
    grantedFeats: "2: Evasion",
    hitPoints: 8, skillPoints: 10,
    tradition: "", magicalAbility: "",
    casterStyle: "", memorisationStyle: "", cantripsKnown: 0, cantripsPerDay: 0,
    spellBookFirstPicks: 0, repertoireCategory: "",
    bonusFeats: true
  },
  {
    name: "Wizard", page: "57–58",
    keyAbilities: "Intelligence (min +2), Wisdom, Dexterity",
    classSkills: "Arcana, Artistry, Culture, Linguistics, Meditation, Mental Focus, Nature, Occultism, Planes, Power Manipulation, Religion",
    grantedFeats: "1: Scribe Scroll, 1: Heighten Spell",
    hitPoints: 4, skillPoints: 4,
    tradition: "arcane", magicalAbility: "intelligence",
    // The only BOOK caster: "you must spend time studying your spell
    // book", against the Cleric's and Druid's blanket tradition list.
    casterStyle: "learned", memorisationStyle: "book", cantripsKnown: 0, cantripsPerDay: 4,
    // "At 1st level you may select any six PP 2 arcane spells."
    spellBookFirstPicks: 6, repertoireCategory: "",
    bonusFeats: true
  }
];

/* ================================================================== *
 * THE FOUR PRINTED PROGRESSION TABLES, pages 45, 46, 48 and 50.
 *
 * Columns in the book's own order:
 *   bab, bdb, fortitude, reflex, will, [bonusFeats,] casterLevel, pp, bsb
 *
 * The Cleric's and Druid's tables print no Bonus Feats column, so their
 * rows carry eight numbers and the ninth is an absence.
 * ================================================================== */
const TABLES = {
  Bard: [
    [0, 0, 0, 3, 6, 0, 1, 2, 0],
    [1, 1, 1, 4, 7, 0, 1, 4, 1],
    [2, 2, 2, 5, 8, 0, 2, 6, 1],
    [3, 3, 3, 6, 9, 0, 2, 8, 2],
    [3, 3, 4, 7, 10, 1, 3, 10, 2],
    [4, 4, 5, 8, 11, 1, 3, 12, 3],
    [5, 5, 6, 9, 12, 1, 4, 14, 3],
    [6, 6, 7, 10, 13, 1, 4, 16, 4],
    [6, 6, 8, 11, 14, 1, 5, 18, 4],
    [7, 7, 9, 12, 15, 2, 5, 20, 5],
    [8, 8, 10, 13, 16, 2, 6, 22, 5],
    [9, 9, 11, 14, 17, 2, 6, 24, 6],
    [9, 9, 12, 15, 18, 2, 7, 26, 6],
    [10, 10, 13, 16, 19, 2, 7, 28, 7],
    [11, 11, 14, 17, 20, 3, 8, 30, 7],
    [12, 12, 15, 18, 21, 3, 8, 32, 8],
    [12, 12, 16, 19, 22, 3, 9, 34, 8],
    [13, 13, 17, 20, 23, 3, 9, 36, 9],
    [14, 14, 18, 21, 24, 3, 10, 38, 9],
    [15, 15, 19, 22, 25, 4, 10, 40, 10]
  ],
  Cleric: [
    [0, 0, 0, 0, 6, null, 1, 4, 1],
    [1, 1, 1, 1, 7, null, 2, 8, 2],
    [2, 2, 2, 2, 8, null, 3, 12, 3],
    [3, 3, 3, 3, 9, null, 4, 16, 4],
    [3, 3, 4, 4, 10, null, 5, 20, 5],
    [4, 4, 5, 5, 11, null, 6, 24, 6],
    [5, 5, 6, 6, 12, null, 7, 28, 7],
    [6, 6, 7, 7, 13, null, 8, 32, 8],
    [6, 6, 8, 8, 14, null, 9, 36, 9],
    [7, 7, 9, 9, 15, null, 10, 40, 10],
    [8, 8, 10, 10, 16, null, 11, 44, 11],
    [9, 9, 11, 11, 17, null, 12, 48, 12],
    [9, 9, 12, 12, 18, null, 13, 52, 13],
    [10, 10, 13, 13, 19, null, 14, 56, 14],
    [11, 11, 14, 14, 20, null, 15, 60, 15],
    [12, 12, 15, 15, 21, null, 16, 64, 16],
    [12, 12, 16, 16, 22, null, 17, 68, 17],
    [13, 13, 17, 17, 23, null, 18, 72, 18],
    [14, 14, 18, 18, 24, null, 19, 76, 19],
    [15, 15, 19, 19, 25, null, 20, 80, 20]
  ],
  Crusader: [
    [1, 1, 6, 0, 3, 0, 1, 2, 0],
    [2, 2, 7, 1, 4, 0, 1, 4, 1],
    [3, 3, 8, 2, 5, 0, 2, 6, 2],
    [4, 4, 9, 3, 6, 1, 3, 8, 3],
    [5, 5, 10, 4, 7, 1, 3, 10, 3],
    [6, 6, 11, 5, 8, 1, 4, 12, 4],
    [7, 7, 12, 6, 9, 1, 5, 14, 5],
    [8, 8, 13, 7, 10, 2, 6, 16, 6],
    [9, 9, 14, 8, 11, 2, 6, 18, 6],
    [10, 10, 15, 9, 12, 2, 7, 20, 7],
    [11, 11, 16, 10, 13, 2, 8, 22, 8],
    [12, 12, 17, 11, 14, 3, 9, 24, 9],
    [13, 13, 18, 12, 15, 3, 9, 26, 9],
    [14, 14, 19, 13, 16, 3, 10, 28, 10],
    [15, 15, 20, 14, 17, 3, 11, 30, 11],
    [16, 16, 21, 15, 18, 4, 12, 32, 12],
    [17, 17, 22, 16, 19, 4, 12, 34, 12],
    [18, 18, 23, 17, 20, 4, 13, 36, 13],
    [19, 19, 24, 18, 21, 4, 14, 38, 14],
    [20, 20, 25, 19, 22, 5, 15, 40, 15]
  ],
  Druid: [
    [0, 0, 3, 3, 3, null, 1, 4, 1],
    [1, 1, 4, 4, 4, null, 2, 8, 2],
    [2, 2, 5, 5, 5, null, 3, 12, 3],
    [3, 3, 6, 6, 6, null, 4, 16, 4],
    [3, 3, 7, 7, 7, null, 5, 20, 5],
    [4, 4, 8, 8, 8, null, 6, 24, 6],
    [5, 5, 9, 9, 9, null, 7, 28, 7],
    [6, 6, 10, 10, 10, null, 8, 32, 8],
    [6, 6, 11, 11, 11, null, 9, 36, 9],
    [7, 7, 12, 12, 12, null, 10, 40, 10],
    [8, 8, 13, 13, 13, null, 11, 44, 11],
    [9, 9, 14, 14, 14, null, 12, 48, 12],
    [9, 9, 15, 15, 15, null, 13, 52, 13],
    [10, 10, 16, 16, 16, null, 14, 56, 14],
    [11, 11, 17, 17, 17, null, 15, 60, 15],
    [12, 12, 18, 18, 18, null, 16, 64, 16],
    [12, 12, 19, 19, 19, null, 17, 68, 17],
    [13, 13, 20, 20, 20, null, 18, 72, 18],
    [14, 14, 21, 21, 21, null, 19, 76, 19],
    [15, 15, 22, 22, 22, null, 20, 80, 20]
  ],

  // A NON-CASTER'S ROW IS ALL ZEROES NOW, and it used not to be. The
  // Fighter and the Rogue printed "-" for Caster Level and PP through
  // 3.7 — transcribed here as null, an absence — beside a hard ZERO for
  // BSB, because page 43 still makes them pick a tradition and add its
  // ability to Spellcraft. Three columns that looked alike and meant two
  // different things.
  //
  // THE 3.8 REVISION PRINTS 0 IN ALL EIGHTY OF THOSE CELLS, and no dash
  // is left in any class table in the book. Graham's ruling R1, 16
  // September 2026 — "Yes make it a real 0" — so they are zeroes here
  // too, and `NULLABLE_COLUMNS` is down to `bonusFeats` alone (D5).
  //
  // WHICH MEANS THE THREE COLUMNS NOW LOOK IDENTICAL AND STILL MEAN
  // TWO DIFFERENT THINGS. What tells them apart is no longer the cell
  // but the class: see N, which pins the question that replaced it.
  Fighter: [
    [1, 1, 6, 3, 0, 1, 0, 0, 0],
    [2, 2, 7, 4, 1, 1, 0, 0, 0],
    [3, 3, 8, 5, 2, 2, 0, 0, 0],
    [4, 4, 9, 6, 3, 2, 0, 0, 0],
    [5, 5, 10, 7, 4, 3, 0, 0, 0],
    [6, 6, 11, 8, 5, 3, 0, 0, 0],
    [7, 7, 12, 9, 6, 4, 0, 0, 0],
    [8, 8, 13, 10, 7, 4, 0, 0, 0],
    [9, 9, 14, 11, 8, 5, 0, 0, 0],
    [10, 10, 15, 12, 9, 5, 0, 0, 0],
    [11, 11, 16, 13, 10, 6, 0, 0, 0],
    [12, 12, 17, 14, 11, 6, 0, 0, 0],
    [13, 13, 18, 15, 12, 7, 0, 0, 0],
    [14, 14, 19, 16, 13, 7, 0, 0, 0],
    [15, 15, 20, 17, 14, 8, 0, 0, 0],
    [16, 16, 21, 18, 15, 8, 0, 0, 0],
    [17, 17, 22, 19, 16, 9, 0, 0, 0],
    [18, 18, 23, 20, 17, 9, 0, 0, 0],
    [19, 19, 24, 21, 18, 10, 0, 0, 0],
    [20, 20, 25, 22, 19, 10, 0, 0, 0]
  ],
  Ranger: [
    [1, 1, 6, 6, 0, 0, 1, 1, 0],
    [2, 2, 7, 7, 1, 0, 1, 2, 1],
    [3, 3, 8, 8, 2, 0, 2, 3, 1],
    [4, 4, 9, 9, 3, 1, 2, 4, 2],
    [5, 5, 10, 10, 4, 1, 3, 5, 2],
    [6, 6, 11, 11, 5, 1, 3, 6, 3],
    [7, 7, 12, 12, 6, 1, 4, 7, 3],
    [8, 8, 13, 13, 7, 2, 4, 8, 4],
    [9, 9, 14, 14, 8, 2, 5, 9, 4],
    [10, 10, 15, 15, 9, 2, 5, 10, 5],
    [11, 11, 16, 16, 10, 2, 6, 11, 5],
    [12, 12, 17, 17, 11, 3, 6, 12, 6],
    [13, 13, 18, 18, 12, 3, 7, 13, 6],
    [14, 14, 19, 19, 13, 3, 7, 14, 7],
    [15, 15, 20, 20, 14, 3, 8, 15, 7],
    [16, 16, 21, 21, 15, 4, 8, 16, 8],
    [17, 17, 22, 22, 16, 4, 9, 17, 8],
    [18, 18, 23, 23, 17, 4, 9, 18, 9],
    [19, 19, 24, 24, 18, 4, 10, 19, 9],
    [20, 20, 25, 25, 19, 5, 10, 20, 10]
  ],
  Rogue: [
    [0, 0, 3, 6, 0, 1, 0, 0, 0],
    [1, 1, 4, 7, 1, 1, 0, 0, 0],
    [2, 2, 5, 8, 2, 2, 0, 0, 0],
    [3, 3, 6, 9, 3, 2, 0, 0, 0],
    [3, 3, 7, 10, 4, 3, 0, 0, 0],
    [4, 4, 8, 11, 5, 3, 0, 0, 0],
    [5, 5, 9, 12, 6, 4, 0, 0, 0],
    [6, 6, 10, 13, 7, 4, 0, 0, 0],
    [6, 6, 11, 14, 8, 5, 0, 0, 0],
    [7, 7, 12, 15, 9, 5, 0, 0, 0],
    [8, 8, 13, 16, 10, 6, 0, 0, 0],
    [9, 9, 14, 17, 11, 6, 0, 0, 0],
    [9, 9, 15, 18, 12, 7, 0, 0, 0],
    [10, 10, 16, 19, 13, 7, 0, 0, 0],
    [11, 11, 17, 20, 14, 8, 0, 0, 0],
    [12, 12, 18, 21, 15, 8, 0, 0, 0],
    [12, 12, 19, 22, 16, 9, 0, 0, 0],
    [13, 13, 20, 23, 17, 9, 0, 0, 0],
    [14, 14, 21, 24, 18, 10, 0, 0, 0],
    [15, 15, 22, 25, 19, 10, 0, 0, 0]
  ],
  // The slowest BAB in the book: 10 at 20th, where the Crusader has 20.
  Wizard: [
    [0, 0, 0, 0, 6, 0, 1, 4, 1],
    [1, 1, 1, 1, 7, 0, 2, 8, 2],
    [1, 1, 2, 2, 8, 0, 3, 12, 3],
    [2, 2, 3, 3, 9, 0, 4, 16, 4],
    [2, 2, 4, 4, 10, 1, 5, 20, 5],
    [3, 3, 5, 5, 11, 1, 6, 24, 6],
    [3, 3, 6, 6, 12, 1, 7, 28, 7],
    [4, 4, 7, 7, 13, 1, 8, 32, 8],
    [4, 4, 8, 8, 14, 1, 9, 36, 9],
    [5, 5, 9, 9, 15, 2, 10, 40, 10],
    [5, 5, 10, 10, 16, 2, 11, 44, 11],
    [6, 6, 11, 11, 17, 2, 12, 48, 12],
    [6, 6, 12, 12, 18, 2, 13, 52, 13],
    [7, 7, 13, 13, 19, 2, 14, 56, 14],
    [7, 7, 14, 14, 20, 3, 15, 60, 15],
    [8, 8, 15, 15, 21, 3, 16, 64, 16],
    [8, 8, 16, 16, 22, 3, 17, 68, 17],
    [9, 9, 17, 17, 23, 3, 18, 72, 18],
    [9, 9, 18, 18, 24, 3, 19, 76, 19],
    [10, 10, 19, 19, 25, 4, 20, 80, 20]
  ]
};

/* ================================================================== *
 * READ THE PACKS ONCE
 * ================================================================== */
async function dump(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), {
    keyEncoding: "utf8", valueEncoding: "json"
  });
  await db.open();
  const items = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) items.set(value._id, value);
    }
  } finally { await db.close(); }
  return items;
}

const classPack = await dump("classes");
const abilityPack = await dump("abilities");
const classes = [...classPack.values()].filter((v) => v.type === "class");
const byName = new Map(classes.map((c) => [String(c.name).toLowerCase(), c]));
const abilityByName = new Map(
  [...abilityPack.values()].map((v) => [String(v.name).toLowerCase(), v])
);

/* ================================================================== *
 * B. THE CLASS TYPE TABLE — all eight, page 43
 * ================================================================== */
eq("B1 the pack holds one class per printed row", classes.length, CLASS_TYPES.length);
{
  const missing = CLASS_TYPES.filter(([name]) => !byName.has(name.toLowerCase())).map(([n]) => n);
  eq("B2 and every printed class is one of them", missing, []);
  const wrong = [];
  for (const [name, type] of CLASS_TYPES) {
    const row = byName.get(name.toLowerCase());
    if (!row) continue;
    const held = String(row.system?.classType ?? "");
    if (held !== type) wrong.push(`${name}: printed "${type}", pack "${held}"`);
  }
  // The Bard's is the one that reads like a typo and is not: page 43
  // prints "Adept/Expert", and both halves are real — its class feats
  // match on either trait.
  eq("B3 every class carries the printed type", wrong, []);
}

/* ================================================================== *
 * C. THE FOUR ENTRIES, FIELD BY FIELD — pages 44–50
 * ================================================================== */
{
  const wrong = [];
  for (const entry of ENTRIES) {
    const row = byName.get(entry.name.toLowerCase());
    if (!row) { wrong.push(`${entry.name}: absent`); continue; }
    const s = row.system ?? {};
    const compare = [
      ["key abilities", String(s.keyAbilityScores ?? ""), entry.keyAbilities],
      ["hit points", Number(s.hitPoints ?? 0), entry.hitPoints],
      ["skill points", Number(s.skillPoints ?? 0), entry.skillPoints],
      ["tradition", String(s.magicalTradition ?? ""), entry.tradition],
      ["magical ability", String(s.magicalAbility ?? ""), entry.magicalAbility],
      ["caster style", String(s.casterStyle ?? ""), entry.casterStyle],
      ["memorisation", String(s.memorisationStyle ?? ""), entry.memorisationStyle],
      ["cantrips known", Number(s.cantripsKnown ?? 0), entry.cantripsKnown],
      ["cantrips per day", Number(s.cantripsPerDay ?? 0), entry.cantripsPerDay],
      ["class skills", String(s.classSkills ?? ""), entry.classSkills],
      ["granted feats", String(s.grantedFeats ?? ""), entry.grantedFeats],
      ["spell book first picks", Number(s.spellBookFirstPicks ?? 0), entry.spellBookFirstPicks],
      ["repertoire category", String(s.repertoireCategory ?? ""), entry.repertoireCategory]
    ];
    for (const [field, held, printed] of compare) {
      if (held !== printed) {
        wrong.push(`${entry.name} ${field}: printed ${JSON.stringify(printed)}, pack ${JSON.stringify(held)}`);
      }
    }
  }
  eq("C1 every printed field of all eight classes matches the pack", wrong, []);
}
// "N + Int per level" is the printed grammar, and all eight print Int —
// so a BLANK skillPointAbility is the correct storage and means
// Intelligence. A class that named one would be a Codex creature class,
// not a player class.
eq("C2 none of the eight names a skill-point ability, so all eight use Int",
  classes.filter((c) => String(c.system?.skillPointAbility ?? "").trim()).map((c) => c.name), []);
eq("C3 the skill-point rate is the printed figure plus Intelligence",
  ENTRIES.map((e) => skillPointsPerLevel(e.skillPoints, 3)),
  ENTRIES.map((e) => e.skillPoints + 3));
// Page 43: "If you are not a spell caster, you will still be required to
// select a magical tradition at 1st level ... Arcane Int, Divinity Wis,
// Ethereal Cha, Verdant Con."
eq("C4 the four traditions map to the printed ability scores",
  ["arcane", "divinity", "ethereal", "verdant"].map((k) => TRADITIONS[k]?.ability),
  ["intelligence", "wisdom", "charisma", "constitution"]);
// THAT MAPPING IS THE NON-CASTER'S FALLBACK AND NOTHING ELSE, and the
// Crusader is the class that proves it: page 48 makes it a "divinity,
// instinctive spell caster" and then says "Your charisma is your magical
// ability score" — where the page 43 table would give a divinity caster
// Wisdom. A class that declares its own ability OVERRIDES the tradition;
// only a class that declares none falls through to the table.
eq("C5 five of the six casters agree with their tradition's ability",
  ENTRIES.filter((e) => e.tradition)
    .filter((e) => TRADITIONS[e.tradition]?.ability === e.magicalAbility).map((e) => e.name),
  ["Bard", "Cleric", "Druid", "Ranger", "Wizard"]);
eq("C5a and the Crusader is the one that does not — divinity, on Charisma",
  ENTRIES.filter((e) => e.tradition)
    .filter((e) => TRADITIONS[e.tradition]?.ability !== e.magicalAbility)
    .map((e) => `${e.name}: ${e.tradition}/${e.magicalAbility}`),
  ["Crusader: divinity/charisma"]);
ok("C5b so the declared ability is applied AFTER the tradition, never before",
  (() => {
    const actor = strip(read("module", "documents", "actor.mjs"));
    const fromTradition = actor.indexOf("system.magic.castingAbility = tradition.ability");
    const fromClass = actor.indexOf("system.magic.castingAbility = system.progression.magicalAbility");
    return fromTradition > 0 && fromClass > fromTradition;
  })(),
  "reverse the two lines and every Crusader silently casts off Wisdom");
eq("C6 and the two classes that name no tradition are the two non-casters",
  classes.filter((c) => !String(c.system?.magicalTradition ?? "").trim())
    .map((c) => c.name).sort(),
  ["Fighter", "Rogue"]);

/* ================================================================== *
 * D. THE FOUR PROGRESSION TABLES, DRIVEN
 *
 * Not compared as stored data but RUN through `resolveClassProgression`,
 * which is what the actor calls. A table that is right in the pack and
 * wrong by the time it reaches the sheet is the failure a data
 * comparison cannot see.
 * ================================================================== */
{
  const wrong = [];
  const missingRows = [];
  for (const [name, table] of Object.entries(TABLES)) {
    const row = byName.get(name.toLowerCase());
    if (!row) { missingRows.push(name); continue; }
    if ((row.system?.progression ?? []).length !== table.length) {
      missingRows.push(`${name}: ${(row.system?.progression ?? []).length} rows, printed ${table.length}`);
      continue;
    }
    for (let i = 0; i < table.length; i += 1) {
      const level = i + 1;
      const resolved = resolveClassProgression(row, level);
      if (!resolved) { wrong.push(`${name} ${level}: resolved nothing`); continue; }
      if (resolved.rowLevel !== level) {
        wrong.push(`${name} ${level}: row says level ${resolved.rowLevel}`);
      }
      PROGRESSION_COLUMNS.forEach((column, index) => {
        const printed = table[i][index];
        const held = resolved[column];
        if (held !== printed) {
          wrong.push(`${name} ${level} ${column}: printed ${printed}, resolved ${held}`);
        }
      });
    }
  }
  eq("D1 all four classes carry a twenty-row table", missingRows, []);
  eq("D2 and every printed cell resolves to itself", wrong, []);
}
// A BLANK CELL IS NOT A ZERO, and this is where that costs something: a
// Cleric whose bonusFeats read 0 rather than null gains a feat allowance
// the book never printed a column for.
eq("D3 the two tables with no Bonus Feats column resolve it as an absence",
  ENTRIES.filter((e) => !e.bonusFeats).map((e) => e.name), ["Cleric", "Druid"]);
eq("D4 which is null at every level, never 0",
  ENTRIES.filter((e) => !e.bonusFeats).flatMap((e) => {
    const row = byName.get(e.name.toLowerCase());
    return [1, 5, 10, 20].map((l) => resolveClassProgression(row, l)?.bonusFeats);
  }),
  [null, null, null, null, null, null, null, null]);
eq("D5 and the one column that can be an absence is the one the book leaves out",
  [...NULLABLE_COLUMNS], ["bonusFeats"]);
// "1 to 20 (and possibly beyond)" — page 42. Above the table the last
// row holds, and says it is holding.
{
  const bard = byName.get("bard");
  eq("D6 a level above the printed table clamps to its last row",
    resolveClassProgression(bard, 25)?.bab, 15);
  eq("D7 and reports the clamp rather than pretending", resolveClassProgression(bard, 25)?.capped, true);
  eq("D8 a level below the table resolves nothing at all", progressionRow(bard, 0), null);
}

/* ================================================================== *
 * E. THE MECHANISMS BEHIND THE PROSE
 *
 * Every one of these is a sentence in a class entry that could have been
 * flavour text and is not.
 * ================================================================== */
{
  // Bard, page 44: "You may use bardic performance an amount of times
  // equal to your Cha +1 each day" — ONE pool for all three branches.
  const performance = abilityByName.get("bardic performance");
  eq("E1 Bardic Performance is a Charisma +1 pool",
    String(performance?.system?.usesPerDay ?? ""), "Charisma +1");
  eq("E2 which resolves against the score", resolveUsesPerDay("Charisma +1", { charisma: 3 }), 4);
  // Cleric, page 46: "a number of times each day equal to your Charisma
  // modifier +1" — the same shape, and deliberately so.
  eq("E3 Channels is the same Charisma +1 pool",
    String(abilityByName.get("channels")?.system?.usesPerDay ?? ""), "Charisma +1");
  // Cleric and Druid, pages 46 and 50: "equal to 2 + (level x 2)".
  eq("E4 the learned caster's memorisation budget is 2 + (level x 2)",
    [1, 2, 5, 20].map(memorisedSpellCount), [4, 6, 12, 42]);
  // Bard, page 44: "any two PP 2 ethereal spells [at 1st] ... At 3rd
  // level and then every two levels thereafter ... a new ethereal spell".
  eq("E5 the Bard's repertoire is two at 1st, one more at 3rd and every two after",
    [1, 2, 3, 4, 5, 19, 20].map((l) => repertoirePickCount(l)), [2, 2, 3, 3, 4, 11, 11]);
  // Bard, page 44: "At 5th level and then every 5 levels thereafter, you
  // may select an additional spell to cast in this way each day."
  eq("E6 Book of Notations is one, plus one more every fifth level",
    [1, 4, 5, 9, 10, 20].map(bookOfNotationsSlots), [1, 1, 2, 2, 3, 5]);
  // Druid, page 49: "At 3rd level you may once per day ... At 5th level
  // and then every two levels thereafter ... an additional time each day."
  eq("E7 Wild Shape starts at 3rd and gains one every second level from 5th",
    [1, 2, 3, 4, 5, 6, 7, 20].map(wildShapeUsesPerDay), [0, 0, 1, 1, 2, 2, 3, 9]);
  // The Bard's and Crusader's Bonus Feats columns are an allowance, not
  // a decoration: `featBudget` adds them to the class pool.
  ok("E8 the class table's Bonus Feats column reaches the feat budget",
    /classBonusFeats/.test(strip(read("module", "feats.mjs")))
      && /system\.progression\?\.bonusFeats|progression\?\.bonusFeats/.test(
        strip(read("module", "sheets", "actor-sheet.mjs"))),
    "the column is an allowance the sheet has to spend, not a number it shows");
}

/* ================================================================== *
 * F. THE MINIMUM ABILITY SCORE — R1, ruled 15 September 2026
 *
 * "warn, never refuse". Driven, because the whole value of the ruling is
 * in what it does NOT do.
 * ================================================================== */
{
  eq("F1 every class states a minimum on its printed line",
    CLASS_TYPES.map(([name]) =>
      classAbilityRequirement(byName.get(name.toLowerCase())?.system?.keyAbilityScores) === null
        ? name : null).filter(Boolean),
    []);
  eq("F2 the Bard's is Charisma +2",
    classAbilityRequirement("Charisma (min +2), Dexterity, Intelligence"),
    { abilities: ["charisma"], minimum: 2, label: "Charisma" });
  // The Fighter is the only class whose requirement is an EITHER, and a
  // parser that took the first word would hold it to Strength alone.
  eq("F3 the Fighter's is satisfied by either Strength or Dexterity",
    classAbilityRequirement("Strength or Dexterity (min +2), Constitution"),
    { abilities: ["strength", "dexterity"], minimum: 2, label: "Strength or Dexterity" });
  eq("F4 a line with no bracket states no requirement",
    classAbilityRequirement("Charisma, Dexterity, Intelligence"), null);
  // E2's shape, refused deliberately. The comma inside the requirement
  // leaves it naming nothing, and naming nothing must produce no warning
  // rather than a confident wrong one.
  eq("F5 a comma inside the requirement refuses the line rather than guessing",
    classAbilityRequirement("Constitution, (min +2), Dexterity, Wisdom"), null);
  eq("F6 as does a subject that is not an ability score",
    classAbilityRequirement("Piety (min +2), Wisdom"), null);

  const bard = byName.get("bard");
  const fighter = byName.get("fighter");
  eq("F7 a character who meets it is not warned",
    classMinimumShortfall(bard, { charisma: 2 }), null);
  eq("F8 one above it is not warned either", classMinimumShortfall(bard, { charisma: 4 }), null);
  ok("F9 one below it is", classMinimumShortfall(bard, { charisma: 0 }) !== null);
  eq("F10 and the shortfall names the class, the ability and both numbers",
    (({ className, label, minimum, held }) => ({ className, label, minimum, held }))(
      classMinimumShortfall(bard, { charisma: 0 })),
    { className: "Bard", label: "Charisma", minimum: 2, held: 0 });
  // EITHER satisfies the Fighter's, so the better of the two decides.
  eq("F11 an either-or requirement is met by whichever is higher",
    classMinimumShortfall(fighter, { strength: 0, dexterity: 2 }), null);
  eq("F12 and the shortfall reports the better of the two",
    classMinimumShortfall(fighter, { strength: 1, dexterity: -1 })?.heldKey, "strength");
  // THE SENTENCE. One string, used by the notification and the banner.
  {
    const warning = classMinimumWarning(classMinimumShortfall(bard, { charisma: 0 }));
    ok("F13 the warning names the class and what it expects", /Bard expects Charisma \+2/.test(warning));
    ok("F14 and the score the character actually has", /yours is \+0/.test(warning));
    ok("F15 it says it is guidance rather than a restriction", /guidance rather than a restriction/.test(warning));
    // WHY THIS LINE IS IN THE MESSAGE: the ruling turned on it. Scores
    // move, so a 1st-level miss is not permanent, which is why this
    // warns instead of refusing.
    ok("F16 and names the way out — the Level Table's own increases",
      /ability increase at 3rd level/.test(warning));
    eq("F17 a character who meets it gets no sentence at all",
      classMinimumWarning(classMinimumShortfall(bard, { charisma: 2 })), "");
  }
  // NEVER REFUSES. The rule lives beside the identity lock, which DOES
  // refuse, and the two are one edit apart.
  {
    const item = strip(read("module", "documents", "item.mjs"));
    const body = item.slice(item.indexOf("_warnBelowClassMinimum()"));
    const end = body.indexOf("\n  }");
    ok("F18 the class-minimum check is wired into item creation",
      /this\._warnBelowClassMinimum\(\);/.test(item));
    ok("F19 and returns nothing — it cannot refuse the class",
      end > 0 && !/return false/.test(body.slice(0, end)),
      "R1 was ruled warn-never-refuse; a `return false` here reverses it");
    ok("F20 it warns only for characters, not NPCs or companions",
      /actor\.type !== "character"/.test(body.slice(0, end)));
  }
  // THE SECOND HALF: the notification is gone in seconds, the sheet is not.
  {
    const sheet = strip(read("module", "sheets", "actor-sheet.mjs"));
    ok("F21 the sheet computes the same shortfall",
      /context\.classMinimum = context\.isCharacter/.test(sheet)
        && /classMinimumShortfall\(classItemOf\(actor\), abilityScoresOf\(actor\)\)/.test(sheet));
    ok("F21a and builds the banner's sentence from that same shortfall",
      /context\.classMinimumWarning = classMinimumWarning\(context\.classMinimum\);/.test(sheet),
      "two sentences for one rule is how the notification and the banner start disagreeing");
    ok("F22 from the ACTOR's class item, not the display row",
      !/classMinimumShortfall\(context\.identitySummary/.test(sheet),
      "identitySummary rows carry a name the feat display rule may have rewritten");
    const hbs = read("templates", "actor", "actor-sheet.hbs");
    ok("F23 and the banner shows it", /\{\{#if classMinimumWarning\}\}/.test(hbs));
    const itemHbs = read("templates", "item", "item-sheet.hbs");
    ok("F24 the class item's tooltip says the bracket is read, and no longer that it is not",
      /bracket is READ/.test(itemHbs) && !/Guidance for the player — not enforced/.test(itemHbs),
      "a tooltip that contradicts the code teaches the next reader to stop looking");
  }
  // The scores compared are the ones the sheet SHOWS. A warning computed
  // from a different number is one the player cannot clear.
  ok("F25 the comparison uses the totals the sheet displays",
    /attributes\?\.\[key\]\?\.total/.test(strip(read("module", "class-progression.mjs"))));
}

/* ================================================================== *
 * G. THE CLASS ABILITY REGISTERS, pages 44–58
 *
 * What each class gets and WHEN. The register lives on the class item as
 * "<level>: <name>" and every name has to resolve to a real ability, or
 * the sheet grants nothing and says so on a card nobody re-reads.
 * ================================================================== */
const CLASS_ABILITIES = {
  Fighter: "1: Warrior's Resolve, 1: Martial Training, 2: Battle Readiness, "
    + "3: Armour Exemplar, 4: Weapon Exemplar, 4: Press the Advantage, "
    + "9: Unbreakable Resolve, 13: Weapon Supremacy",
  Ranger: "1: Hunt Prey, 1: Trap Finder, 1: Hunter's Method, 6: Swift Pursuit, "
    + "9: Terrain Mastery",
  Rogue: "1: Archetypal Path, 1: Roguish Skill, 1: Killer's Edge, 1: Scoundrel's Luck, "
    + "1: Sneak Attack, 1: Trap Finder, 2: Pattern Disruption, 3: Opportunist's Strike",
  Wizard: "1: Arcane Bond, 1: Wizard School"
};
{
  const wrong = [];
  for (const [name, printed] of Object.entries(CLASS_ABILITIES)) {
    const held = String(byName.get(name.toLowerCase())?.system?.classAbilities ?? "");
    if (held !== printed) wrong.push(`${name}: printed "${printed}", pack "${held}"`);
  }
  eq("G1 each class's ability register matches its printed entry", wrong, []);

  const unresolved = [];
  for (const printed of Object.values(CLASS_ABILITIES)) {
    for (const entry of printed.split(",").map((e) => e.trim()).filter(Boolean)) {
      const label = entry.replace(/^\d+\s*:\s*/, "").trim();
      if (!abilityByName.has(label.toLowerCase())) unresolved.push(label);
    }
  }
  // A NAME THAT DOES NOT RESOLVE GRANTS NOTHING. This is the half that
  // actually bites: a register reading "Scoundrels Luck" without the
  // apostrophe is indistinguishable from a correct one until a Rogue
  // levels up and gets nothing.
  eq("G2 and every ability it names exists in the pack", unresolved, []);
}

/* ================================================================== *
 * H. THE EIGHT WIZARD SCHOOLS, pages 58–59
 *
 * [skill, specialist spells, unique ability] — the three things the
 * class entry promises a school grants, plus the description's own
 * fourth (the DC shifts), which is code rather than data and is pinned
 * with the rest of the magic rules.
 * ================================================================== */
const SCHOOLS = [
  ["Alteration", "Crafting", "1: Physical Boost, 7: Shifting Form", "Enhancement"],
  ["Enchantment", "Diplomacy", "1: Enchanting Utterance, 7: Haunting Miasma", "Enchanting Smile"],
  ["Insight", "Perception", "1: Seer's Vision, 7: Vigilant Eye", "Forewarned"],
  ["Invocation", "Intimidate", "1: Force Bolt, 7: Elemental Fury", "Intense Spells"],
  ["Shadow", "Deception", "1: Warped Terrain, 7: Cloak of Invisibility", "Powerful Illusion"],
  ["Soul", "Medicine", "1: Charm Undead, 7: Life Siphon", "Necroscope"],
  ["Translocation", "Survival", "1: Augment Conjuration, 7: Dimension Shift", "Summoner's Charm"],
  ["Warding", "Sense Motive", "1: Protective Ward, 7: Protector's Sphere", "Resistance"]
];
{
  const schoolPack = await dump("wizard-schools");
  const schools = [...schoolPack.values()].filter((v) => v.type === "wizard-school");
  const schoolsByName = new Map(schools.map((v) => [String(v.name).toLowerCase(), v]));
  eq("H1 the pack holds one school per printed entry", schools.length, SCHOOLS.length);
  const wrong = [];
  for (const [name, skill, spells, ability] of SCHOOLS) {
    const row = schoolsByName.get(name.toLowerCase());
    if (!row) { wrong.push(`${name}: absent`); continue; }
    if (String(row.system?.classSkill ?? "") !== skill) {
      wrong.push(`${name} skill: printed "${skill}", pack "${row.system?.classSkill}"`);
    }
    if (String(row.system?.specialistSpells ?? "") !== spells) {
      wrong.push(`${name} spells: printed "${spells}", pack "${row.system?.specialistSpells}"`);
    }
    if (String(row.system?.uniqueAbilityName ?? "") !== ability) {
      wrong.push(`${name} ability: printed "${ability}", pack "${row.system?.uniqueAbilityName}"`);
    }
  }
  eq("H2 every school's skill, both specialist spells and unique ability match the print", wrong, []);
  // "Your school grants you a bonus Wizard specialist spell" at 1st and
  // "another at 7th" — a LEVELLED grant, and the field is read as one.
  eq("H3 every school names a 1st-level and a 7th-level specialist spell",
    SCHOOLS.filter(([, , spells]) => !(/^1: .+, 7: .+$/.test(spells))).map(([n]) => n), []);
  // The eight choices the Wizard School picker offers ARE the eight
  // schools, so a school in the pack that the chooser never lists is
  // unreachable and one it lists that is not there resolves to nothing.
  const offered = abilityByName.get("wizard school")?.flags?.["trg-prime"]?.schoolChoices ?? [];
  eq("H4 and the picker offers exactly those eight",
    [...offered].sort(), SCHOOLS.map(([n]) => n).sort());
  // Translocation's Summoner's Charm is the ONE school ability still not
  // automated, and wizard.mjs declares it rather than leaving it silent.
  const wiz = strip(read("module", "wizard.mjs"));
  ok("H5 the one unautomated school ability is declared, not silent",
    /WIZARD_SCHOOL_GAPS = Object\.freeze\(\{\s*Translocation:/.test(wiz),
    "an undeclared gap is one the next reader has to rediscover");
}

/* ================================================================== *
 * I. THE CHOICE LISTS AND THE NAMED GRANTS
 *
 * Four abilities are nothing BUT a list, and a list that drifts from the
 * book offers a player something the book does not — or withholds
 * something it does.
 * ================================================================== */
const CHOICE_LISTS = [
  ["martial training", "archetypeChoices",
    ["Aegis", "Archer", "Armour Master", "Cavalier", "Champion", "Vanguard", "Warden"]],
  ["archetypal path", "archetypeChoices",
    ["Arcanist", "Assassin", "Gleeman", "Gymnast", "Mastermind", "Warden"]],
  ["priestly path", "archetypeChoices",
    ["Adventurer", "Blessed by the Gods", "Cloistered Priest", "Enigma", "Loremaster",
      "Medic", "War Priest"]],
  ["hunter's method", "methodChoices",
    ["Precision Hunter", "Relentless Hunter", "Warden Hunter", "Stalker Hunter"]],
  ["roguish skill", "skillChoices",
    ["Acrobatics", "Athletics", "Climbing", "Deception", "Intimidate", "Stealth", "Thievery"]]
];
{
  const wrong = [];
  for (const [ability, flag, printed] of CHOICE_LISTS) {
    const held = abilityByName.get(ability)?.flags?.["trg-prime"]?.[flag] ?? null;
    if (JSON.stringify(held) !== JSON.stringify(printed)) {
      wrong.push(`${ability}: printed ${JSON.stringify(printed)}, pack ${JSON.stringify(held)}`);
    }
  }
  eq("I1 every path ability offers exactly the printed list", wrong, []);

  const featPack = await dump("feats");
  const featNames = new Set(
    [...featPack.values()].filter((v) => v.type === "feat").map((v) => String(v.name).toLowerCase())
  );
  // A CHOICE THAT RESOLVES TO NOTHING IS A DEAD OPTION. Martial Training
  // grants its pick directly, prerequisites waived, so a misspelt
  // archetype hands over nothing and charges a class pick for it.
  const unresolvable = CHOICE_LISTS
    .filter(([, flag]) => flag === "archetypeChoices")
    .flatMap(([ability, , printed]) => printed
      .filter((name) => !featNames.has(name.toLowerCase()))
      .map((name) => `${ability} -> ${name}`));
  eq("I2 and every archetype it offers is a real feat", unresolvable, []);

  // The named grants, across all eight classes: "<level>: <feat>".
  const badGrants = [];
  for (const entry of ENTRIES) {
    for (const part of entry.grantedFeats.split(",").map((x) => x.trim()).filter(Boolean)) {
      const label = part.replace(/^\d+\s*:\s*/, "").trim();
      if (!featNames.has(label.toLowerCase())) badGrants.push(`${entry.name} -> ${label}`);
    }
  }
  eq("I3 every feat a class grants by name is a real feat", badGrants, []);
  // THE CONVENTION, stated so it cannot be quietly broken: a feat named
  // in `grantedFeats` is FREE and sits outside the table's Bonus Feats
  // column. The Rogue is where this looks wrong and is not — its column
  // matches the Fighter's exactly, and Evasion rides beside it.
  eq("I4 the four classes with a named grant are the ones whose prose names a feat",
    ENTRIES.filter((e) => e.grantedFeats).map((e) => e.name),
    ["Cleric", "Druid", "Ranger", "Rogue", "Wizard"]);
  eq("I5 and the Rogue's Bonus Feats column is the Fighter's, with Evasion beside it rather than in it",
    TABLES.Rogue.map((row) => row[5]), TABLES.Fighter.map((row) => row[5]));
}

/* ================================================================== *
 * J. TERRAIN MASTERY REACHES THE MOVEMENT RULE — fixed at 3.555.0
 *
 * D1 of the pages 51-60 audit. The ability's two halves: an ally aura,
 * automated since it shipped, and "you ignore natural difficult terrain
 * and treat natural formidable terrain as difficult terrain", which was
 * a sentence on a chat card reading "apply to your own movement" while
 * `ignoresDifficultTerrain` sat finished in the movement workflow.
 *
 * THE SAME MISS, TWICE. The pages 18-30 audit found it for the Silvarni
 * heritage and fixed it there; this is the third carrier of the same
 * flag and it was not added at the time.
 * ================================================================== */
{
  const fw = strip(read("module", "feats-workflow.mjs"));
  const block = fw.slice(fw.indexOf('"terrain mastery"'));
  const body = block.slice(0, block.indexOf("\n  },"));
  ok("J1 turning the toggle ON carries the difficult-terrain flag",
    /await item\?\.setFlag\?\.\(SYSTEM_ID, "ignoresDifficultTerrain", true\);/.test(body));
  ok("J2 and turning it OFF takes it away again",
    /await item\?\.unsetFlag\?\.\(SYSTEM_ID, "ignoresDifficultTerrain"\);/.test(body),
    "a Ranger who walks out of their favoured terrain keeps the relief otherwise");
  ok("J3 the handler is given the item to write it on",
    /async use\(actor, item\) \{/.test(body));
  ok("J4 and the card no longer tells the player to apply it by hand",
    !/apply to your own movement/.test(body),
    "the card said the rule and the system did not do it");
  // THE CHANNEL IT WRITES TO IS THE ONE THE MOVEMENT RULE READS, and
  // that is the whole fix — asserted against the reader, not just the
  // writer, because a flag spelled differently at either end is silent.
  // ASSERTED BEHAVIOURALLY (3.570.0), not against the text of the
  // reader. This check used to pin the exact source line of `carries`,
  // and scoping the relief for Feather Step rewrote that line without
  // changing what Terrain Mastery does — a false failure of exactly the
  // kind the conditionals anchor produced at 3.566.0. What matters is
  // that the flag Terrain Mastery WRITES is the flag the movement rule
  // READS, so that is what is asked, by running it.
  const terrainMasteryItem = { flags: { "trg-prime": { ignoresDifficultTerrain: true } } };
  ok("J5 the flag Terrain Mastery writes is one the movement rule reads",
    ignoresDifficultTerrain({ items: [terrainMasteryItem], effects: [] }, null)
      && ignoresDifficultTerrain({ items: [terrainMasteryItem], effects: [] }, "step"),
    "Terrain Mastery eases EVERY move, so it must answer true with or without an armed action");
  const movement = strip(read("module", "combat", "movement-workflow.mjs"));
  ok("J6 and the movement workflow prices the step off it",
    /const easedBy = terrainReliefName\(actor, armedKey\);/.test(movement)
      && /eases: Boolean\(easedBy\)/.test(movement));
  // The aura half must survive the fix.
  eq("J7 the aura is still 1 at 9th and 2 at 15th",
    [8, 9, 14, 15, 20].map(terrainMasteryBonus), [0, 1, 1, 2, 2]);
}

/* ================================================================== *
 * K. TRAP FINDER'S THIRD BONUS — fixed at 3.555.0
 *
 * D2 of the pages 51-60 audit. The ability prints three bonuses and
 * shipped two: "+2-circumstance bonus to Perception checks to find
 * traps, TO DB AGAINST ATTACKS MADE BY TRAPS, and to saves against
 * traps." A trap attacking a Rogue or a Ranger rolled against a defence
 * two points too low, on both classes, with nothing to say so.
 *
 * R1, Graham's ruling of 16 September 2026, on the one open question:
 * read a trap trait off the attacker, and where there is none, do
 * nothing and say how to set it. No pack ships a trap, so a guess would
 * have been the only alternative.
 * ================================================================== */
{
  const rogue = { items: [{ type: "ability", name: "Trap Finder" }] };
  const ranger = { items: [{ type: "ability", name: "Trap Finder" }, { type: "ability", name: "Hunt Prey" }] };
  const other = { items: [{ type: "ability", name: "Sneak Attack" }] };
  eq("K1 a trap attacking a Rogue meets +2 more DB",
    trapFinderDefenceBonus({ actor: rogue, attackerIsTrap: true, perceptionRanks: 0 }), 2);
  eq("K2 the Ranger's copy is the same rule",
    trapFinderDefenceBonus({ actor: ranger, attackerIsTrap: true, perceptionRanks: 0 }), 2);
  eq("K3 and it rises with the same 10 ranks the other two bonuses use",
    trapFinderDefenceBonus({ actor: rogue, attackerIsTrap: true, perceptionRanks: 10 }), 4);
  eq("K3a which is the ability's own printed band", [0, 9, 10, 20].map(trapFinderValue), [2, 2, 4, 4]);
  eq("K4 an ordinary attacker gets nothing",
    trapFinderDefenceBonus({ actor: rogue, attackerIsTrap: false, perceptionRanks: 10 }), 0);
  eq("K5 nor does a character without the ability",
    trapFinderDefenceBonus({ actor: other, attackerIsTrap: true, perceptionRanks: 10 }), 0);
  // BOTH CHANNELS A GM MIGHT USE. A pressure plate is a trap; a trapped
  // chest is an ordinary actor whose ATTACK is the trap.
  ok("K6 a trap trait on the attacker's own trait line counts",
    attackIsFromATrap({ attackerSystem: { details: { traits: "Trap, Construct" } } }));
  // THE CREATURE-TYPE CHANNEL IS REAL IN THE RULE and unreachable in
  // practice today, which live testing at 3.555.0 found: the field is
  // DERIVED from an owned creature-type item, so a GM cannot type into
  // it, and none of the twelve authored types is a Trap. Kept, because a
  // Trap type authored later then works with no code change — and K15a
  // below makes sure the HINT does not send anybody to it meanwhile.
  ok("K7 so does the creature type, for a Trap type authored later",
    attackIsFromATrap({ attackerSystem: { details: { creatureType: "Trap" } } }));
  ok("K8 and so does the trait on the attack itself",
    attackIsFromATrap({ attackerSystem: { details: { traits: "Construct" } }, weaponTraits: "reach, trap" }));
  ok("K9 an ordinary blow from an ordinary creature is not a trap",
    !attackIsFromATrap({ attackerSystem: { details: { traits: "Beast" } }, weaponTraits: "agile, finesse" }));
  ok("K10 and neither is nothing at all", !attackIsFromATrap({}));
  // WIRED, AND INTO THE NUMBER THE ATTACKER MUST BEAT.
  const attack = strip(read("module", "combat", "attack-workflow.mjs"));
  ok("K11 the attack workflow asks whether this blow is a trap",
    /const trapFinderDB = targetActor && attackIsFromATrap\(\{/.test(attack));
  ok("K12 off the DEFENDER's sheet, like Warden Hunter beside it",
    /trapFinderDefenceBonus\(\{\s*actor: targetActor,/.test(attack));
  ok("K13 and adds it to the DB the attack rolls against",
    /\+ trapFinderDB \+ \(aidDefence\?\.amount \?\? 0\)/.test(attack),
    "computed and not added is the one failure a unit test of the rule cannot see");
  ok("K14 the card says so when it fires",
    /has Trap Finder and this attack carries the trap trait/.test(attack));
  // R1's other half: where a GM finds out what to type.
  const fw = strip(read("module", "feats-workflow.mjs"));
  ok("K15 and the ability's hint says how to mark a trap",
    /"trap finder": "Works automatically:/.test(fw) && /carries the <strong>trap<\/strong> trait/.test(fw),
    "a rule that needs one word of setup and never names it is a rule nobody switches on");
  {
    // SCOPED TO THE HINT ITSELF. "creature type" is an ordinary phrase
    // elsewhere in this file, so the negative has to be asked of the one
    // string it is about.
    const at = fw.indexOf('"trap finder": "Works automatically:');
    const hint = at >= 0 ? fw.slice(at, fw.indexOf("});", at)) : "";
    ok("K15a and names only the two places a GM can actually set it",
      /own <strong>Traits<\/strong>/.test(hint) && !/creature type/i.test(hint),
      "`details.creatureType` is derived from a creature-type item and there is no Trap one");
  }
}

/* ================================================================== *
 * L. PRESS THE ADVANTAGE FIRES ON A DISABLE — fixed at 3.555.0
 *
 * D3 of the pages 51-60 audit. The ability's own comment said the Use
 * button covered "the two [triggers the system] cannot [see] — the enemy
 * you disabled, the enemy who fumbled at you". The first had stopped
 * being true: `incapacitated` is computed on the damage path for Cleave,
 * in a file attack-workflow already imports.
 * ================================================================== */
{
  const detection = strip(read("module", "combat", "reaction-feat-detection.mjs"));
  ok("L1 the disable moment now prompts Press the Advantage",
    /m\.maybePromptPressTheAdvantage\(\s*actor,/.test(detection));
  ok("L2 off the same `dropped` Cleave asks, not a second definition",
    /const dropped = incapacitated\(\{/.test(detection)
      && detection.indexOf("const dropped = incapacitated({")
        < detection.indexOf("maybePromptPressTheAdvantage"),
    "Graham's ruling of 21 August 2026 fixed what dropping a creature means; one copy of it");
  // NOT GATED ON A SECOND FOE. Cleave needs someone else in reach;
  // Press the Advantage needs nothing but the drop, and nesting it
  // inside Cleave's `others.length` would have been the easy mistake.
  // ASSERTED ON THE GUARD ITSELF, not on where the two blocks sit. An
  // ordering check passes happily while the prompt is narrowed in place,
  // which is exactly the edit worth worrying about: Cleave's `others`
  // sits right below, and borrowing it is one word.
  ok("L3 and it fires whether or not another foe is in reach",
    /if \(dropped\) \{\s*import\("\.\/attack-workflow\.mjs"\)/.test(detection),
    "the book asks only that you disabled an enemy — Cleave is the one that needs a second");
  ok("L3a and Cleave's own second-foe gate is still below it, unshared",
    detection.indexOf("const others = candidatesNear")
      > detection.indexOf("maybePromptPressTheAdvantage"));
  const attack = strip(read("module", "combat", "attack-workflow.mjs"));
  ok("L4 the critical trigger still fires too",
    /if \(outcome\.critical\) \{\s*await maybePromptPressTheAdvantage\(/.test(attack));
  ok("L5 one flag still serves every trigger, so it stays once per round",
    /await actor\.setFlag\(SYSTEM_ID, "pressAdvantageUsed", true\);/.test(attack));
  eq("L6 and the 13th-level Stride is unchanged",
    [12, 13, 20].map((l) => pressTheAdvantageStride(l)), [false, true, true]);
}

/* ================================================================== *
 * M. THE BLOCK 5 SCALING, DRIVEN
 *
 * Every "at Nth level" sentence in the four entries, run rather than
 * read. Each is one edit away from being a level out, and a level out is
 * invisible on a sheet.
 * ================================================================== */
{
  const L = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 19, 20];
  // Fighter, page 51.
  eq("M1 Armour Exemplar steps at 3rd, 7th, 11th and 15th",
    [2, 3, 6, 7, 10, 11, 14, 15].map(armourExemplarSteps), [0, 1, 1, 2, 2, 3, 3, 4]);
  eq("M1a and stops at the printed maximum of 4", [15, 19, 20].map(armourExemplarSteps), [4, 4, 4]);
  eq("M2 Weapon Exemplar adds a group at 4th and every four after",
    [3, 4, 8, 12, 16, 20].map(weaponExemplarTierCount), [0, 1, 2, 3, 4, 5]);
  eq("M3 Unbreakable Resolve turns a Partial into a Success at 19th",
    [18, 19, 20].map((l) => Boolean(unbreakableResolvePartialToSuccess(l))), [false, true, true]);
  // "1, 2 at 15th" — authored on the ability, read by the uses engine.
  eq("M3a and it is once a day, twice from 15th",
    String(abilityByName.get("unbreakable resolve")?.system?.usesPerDay ?? ""), "1, 2 at 15th");
  // Ranger, page 53.
  eq("M4 Precision Hunter is 1d6, 2d6 at 9th, 3d6 at 17th",
    [1, 8, 9, 16, 17, 20].map(precisionHunterDice), [1, 1, 2, 2, 3, 3]);
  eq("M5 Swift Pursuit is a Step at 6th and a Stride at 13th",
    [5, 6, 12, 13].map((l) => String(swiftPursuitMode(l))), ["null", "step", "step", "stride"]);
  {
    const stalker = (level) => stalkerHunterBonus({
      actor: {
        items: [{
          type: "ability", name: "Hunter's Method",
          flags: { "trg-prime": { hunterMethodChoice: "stalker" } }
        }]
      },
      level, subject: "stealth"
    });
    eq("M6 Stalker Hunter is +1, and +2 from 10th", [9, 10, 20].map(stalker), [1, 2, 2]);
    eq("M6a and only on the three skills it names",
      ["stealth", "perception", "survival", "arcana"].map((subject) => stalkerHunterBonus({
        actor: {
          items: [{
            type: "ability", name: "Hunter's Method",
            flags: { "trg-prime": { hunterMethodChoice: "stalker" } }
          }]
        },
        level: 20, subject
      })),
      [2, 2, 2, 0]);
    const relentless = (level) => relentlessHunterReduction({
      actor: {
        items: [{
          type: "ability", name: "Hunter's Method",
          flags: { "trg-prime": { hunterMethodChoice: "relentless" } }
        }]
      },
      level, targetIsPrey: true
    });
    eq("M7 Relentless Hunter cuts the multiple attack penalty by 1, and 2 from 11th",
      [10, 11, 20].map(relentless), [1, 2, 2]);
    // ONE METHOD AT A TIME — "The Ranger may only have one Hunter's
    // Method active at a time", enforced by there being one slot.
    eq("M8 and a Ranger running a different method gets neither",
      [stalkerHunterBonus({
        actor: {
          items: [{
            type: "ability", name: "Hunter's Method",
            flags: { "trg-prime": { hunterMethodChoice: "precision" } }
          }]
        },
        level: 20, subject: "stealth"
      })], [0]);
  }
  // Rogue, page 55.
  eq("M9 Roguish Skill picks one at 1st and one more every fifth level",
    [1, 4, 5, 10, 15, 20].map(roguishSkillPickCount), [1, 1, 2, 3, 4, 5]);
  eq("M10 Sneak Attack is 1d6, rising by one every three STEALTH RANKS",
    [0, 2, 3, 5, 6, 9, 12].map(sneakAttackDice), [1, 1, 2, 2, 3, 4, 5]);
  // Wizard, page 57.
  eq("M11 the Arcane Bond adder is +1, rising at 6th and every six after",
    [1, 5, 6, 11, 12, 18, 20].map(arcaneBondBonus), [1, 1, 2, 2, 3, 4, 4]);
  eq("M12 Forewarned is the wizard's level plus ten, on initiative",
    [1, 10, 20].map(forewarnedBonus), [11, 20, 30]);
  eq("M13 Enchanting Smile is +1, +2 at 10th and +3 at 20th",
    [9, 10, 19, 20].map(enchantingSmileBonus), [1, 2, 2, 3]);
  // "increases its total damage by half its PP cost" — and Chapter 1:
  // "Unless otherwise stated, always round down."
  eq("M14 Intense Spells adds half the spell's PP cost, rounded down",
    [1, 2, 3, 4, 10].map(intenseSpellsBonus), [0, 1, 1, 2, 5]);
  eq("M15 Warding's resistance becomes immunity at 20th",
    [1, 19, 20].map(wardingResistanceField), ["resistances", "resistances", "immunities"]);
  // "At 1st level you may select any six PP 2 arcane spells... Each time
  // you gain a level you automatically add two new arcane spells."
  eq("M16 the Wizard's spell book opens at six and grows by two a level",
    [1, 2, 3, 20].map((l) => spellBookSlots(l, 6)), [6, 8, 10, 44]);
  eq("M17 driven from the class's own printed figure, not a constant",
    spellBookSlots(3, Number(byName.get("wizard")?.system?.spellBookFirstPicks ?? 0)), 10);
  ok("M18 and every level in L has a table row to resolve against",
    L.every((l) => resolveClassProgression(byName.get("fighter"), l) !== null));
}

/* ================================================================== *
 * N. WHAT REPLACED THE BLANK CELL — Graham's ruling R1, 16 Sept 2026
 *
 * The Fighter's and the Rogue's Caster Level and PP columns printed "-"
 * through rulebook 3.7 and print 0 from 3.8. "Yes make it a real 0."
 *
 * TWO PLACES READ THAT NULL AS "THIS CLASS DOES NOT CAST", and while
 * only a caster's table printed a number there, that was a perfectly
 * good stand-in. It is gone now, and both ask `classCasts` instead —
 * which is the "Magical Ability Score" paragraph the six casting
 * classes carry and the two non-casters do not.
 *
 * THE POINT OF THIS SECTION is that the stand-in and the real question
 * agreed for all eight classes right up until they didn't. Nothing at
 * the table changes; what changes is that a Fighter picking the Arcane
 * tradition — which page 52 REQUIRES it to do — no longer quietly gains
 * its Intelligence as power points.
 * ================================================================== */
{
  const casting = ["Bard", "Cleric", "Crusader", "Druid", "Ranger", "Wizard"];
  const notCasting = ["Fighter", "Rogue"];
  eq("N1 the six classes with a Magical Ability Score cast",
    casting.filter((n) => !classCasts(byName.get(n.toLowerCase())?.system)), []);
  eq("N2 and the two the book says have no spell casting abilities do not",
    notCasting.filter((n) => classCasts(byName.get(n.toLowerCase())?.system)), []);
  // NOT THE TRADITION, which both non-casters are REQUIRED to have:
  // "You have no spell casting abilities but must select a magical
  // tradition at 1st level."
  eq("N3 and a tradition is not what makes a class a caster",
    notCasting.map((n) => String(byName.get(n.toLowerCase())?.system?.magicalTradition ?? "")),
    ["", ""]);
  // DRIVEN AGAINST A TRADITION ON ITS OWN, because in the pack the two
  // fields happen to agree for all eight classes — every caster fills
  // both, every non-caster fills neither — so comparing pack rows could
  // never tell a tradition test from an ability test. The character's
  // chosen tradition lands on `system.magic.tradition`, not here, but a
  // rewrite that reached for the word "tradition" would pass every
  // check above and hand a Fighter power points at the table.
  eq("N3b a tradition alone does not", classCasts({ magicalTradition: "arcane" }), false);
  eq("N3c a magical ability alone does", classCasts({ magicalAbility: "intelligence" }), true);
  eq("N3d and neither does an empty class, or none", [classCasts({}), classCasts(null)], [false, false]);

  /* ---- the PP ability bonus: THE TRADITION GRANTS IT, NOT THE CLASS ----
   *
   * Graham, 16 September 2026: "Magical Tradition should always add the
   * appropriate ability score to PP (even if the character is not a
   * caster)." That is the THIRD shape this rule has had. Through 3.557.0
   * it was gated on the PP cell being blank; at 3.558.0 this section
   * gated it on the class casting, and N5 asserted a Fighter got nothing.
   * Both were wrong, and Spellcraft — assigned with no gate at all, three
   * lines below in the same function — had been saying so all along.
   */
  const fighter = byName.get("fighter")?.system;
  const wizard = byName.get("wizard")?.system;
  const fighterL1 = resolveClassProgression(byName.get("fighter"), 1);
  const wizardL1 = resolveClassProgression(byName.get("wizard"), 1);
  eq("N4 the Fighter's table now prints a zero, not a blank",
    [fighterL1.casterLevel, fighterL1.pp], [0, 0]);
  // THE RULING, DRIVEN. A Fighter who picked Arcane and has Intelligence
  // +4 has 4 power points, from a table that prints 0.
  eq("N5 a tradition adds its ability even to a non-caster",
    powerPointAbilityBonus({ tradition: "arcane", abilityTotal: 4 }), 4);
  eq("N5b and the Fighter's printed 0 is what it lands on",
    powerPointMax(0, { ...fighter, pp: fighterL1.pp },
      powerPointAbilityBonus({ tradition: "arcane", abilityTotal: 4 })), 4);
  // NO TRADITION, NO BONUS — a monster or a half-built sheet must not
  // collect the schema's default ability by accident.
  eq("N6 no tradition adds nothing",
    [powerPointAbilityBonus({ tradition: "", abilityTotal: 4 }),
      powerPointAbilityBonus({ abilityTotal: 4 }),
      powerPointAbilityBonus()], [0, 0, 0]);
  eq("N6b and a Wizard adds all of it on top of its table",
    powerPointMax(0, { ...wizard, pp: wizardL1.pp },
      powerPointAbilityBonus({ tradition: "arcane", abilityTotal: 4 })),
    wizardL1.pp + 4);
  // `powerPointMax` DECIDES NOTHING NOW. It adds what it is handed, and
  // the gate lives in one place. Driven by handing it a bonus with no
  // class at all.
  eq("N7 the total adds whatever bonus it is given",
    powerPointMax(2, { pp: 0 }, 3), 5);
  eq("N7b and never goes below zero", powerPointMax(0, { pp: 0 }, -9), 0);

  /* ---- the caster level, and the source the sheet reads ---- */
  // `source: "none"` is what keeps the manual override box on a
  // Fighter's sheet and keeps the archetype note ("grants cantrips and
  // a BSB, not a caster level") on screen. A printed 0 must not take
  // either away.
  eq("N8 a Fighter has earned no caster level",
    resolvedCasterLevel({ level: 10, classCasterLevel: 0, classCasts: false }),
    { value: 0, source: "none" });
  eq("N9 and a Wizard's comes from its class",
    resolvedCasterLevel({ level: 10, classCasterLevel: 10, classCasts: true }),
    { value: 10, source: "class" });
  // The Knight feats still reach a Fighter, which is the one way a
  // Fighter legitimately gets one.
  eq("N10 a Knight feat still grants one through a non-casting class",
    resolvedCasterLevel({ level: 8, classCasterLevel: 0, classCasts: false, hasKnightFeat: true }).source,
    "feat");
  // AND NO CASTING CLASS EVER PRINTS 0, so reading a 0 as "no class
  // caster level" can never mis-fire on a real caster. Driven over the
  // whole pack rather than asserted, because this is the assumption the
  // branch rests on.
  // THE ACTOR HAS TO ASK THE QUESTION TOO. `resolvedCasterLevel` now
  // takes `classCasts`, and it DEFAULTS TO TRUE so that every existing
  // caller keeps working — which means the one caller that must pass
  // false can silently stop passing it and nothing above would notice.
  // Read from the source for that reason, positively and negatively.
  {
    const actorSrc = fs.readFileSync(
      path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs"), "utf8");
    ok("N11 the actor tells resolvedCasterLevel whether the class casts",
      /classCasts: classCasts\(system\.progression\),/.test(actorSrc)
      && !/classCasts: true,/.test(actorSrc));
    // AND THE PP BONUS ASKS A DIFFERENT QUESTION FROM THE CASTER LEVEL,
    // which is the whole of Graham's 16 September note. Both previous
    // spellings are named so neither can come back.
    ok("N12 the power-point bonus asks about the tradition, not the class",
      /const abilityBonus = powerPointAbilityBonus\(\{/.test(actorSrc)
      && !/const abilityBonus = classCasts\(system\.progression\)/.test(actorSrc)
      && !/const abilityBonus = tablePP === null/.test(actorSrc));
  }
  eq("N13 no casting class prints a caster level of 0 at any level",
    casting.flatMap((n) => {
      const row = byName.get(n.toLowerCase());
      return Array.from({ length: 20 }, (_, i) => resolveClassProgression(row, i + 1))
        .filter((r) => Number(r?.casterLevel) === 0)
        .map(() => n);
    }), []);
}

console.log(`verify-classes: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-classes: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-classes: all pass");
