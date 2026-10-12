#!/usr/bin/env node
/**
 * verify-chapter1 — the rules on pages 6-15 of Core 3.8.
 *
 * NEW at 3.549.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS.
 *
 * The pages 6-15 audit of 10 September 2026 went through Chapter 1 rule
 * by rule and found most of it correctly automated. It also found that
 * almost none of it was PINNED: the core check ladder, the open-ended
 * chains, auto-hit and auto-miss, the Level DC constant, the casting DC,
 * the size table, the HP formula, the race modifiers and the ability
 * point pool were all reachable by any edit without a single check going
 * red. Two of them had already drifted — see D1 and D2 below — and
 * nothing said so.
 *
 * That is the shape of this project's worst defects: a rule that is
 * right, unwatched, and then quietly is not. So the fix pass that
 * corrected them writes the pins at the same time.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO THAT HAD DRIFTED, and are section-pinned here for good:
 *
 * D1 (section J) — the Creature Size Modifiers table is applied by the
 *   system to every actor, and page 14 says the Race Table's values
 *   already include it. The Halfling and Gnome ability-modifier effects
 *   nonetheless carried the FULL printed line, so both Small races
 *   double-counted Str -1 / Dex +1: a Halfling resolved Str -2 / Dex +3
 *   against a printed -1 / +2. J drives the pack itself and asserts
 *   racial + size = printed for all eight races, which is the invariant
 *   the lost 3.193.0 check used to hold.
 *
 * D2 (section G) — the Cast a Spell DC rounded UP, making every odd-PP
 *   spell one DC harder than printed. Chapter 9 gives the formula and
 *   says nothing about rounding, so page 10's "unless otherwise stated,
 *   always round down" governs it (Graham's ruling, 10 September 2026).
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IT DRIVES vs WHAT IT READS. Everything here that can be a pure
 * function is CALLED with real inputs and its answer compared against
 * the printed rule. Three things cannot be — the initiative formula, the
 * Str/Dex size application and the auto-hit branch all live inside
 * Foundry-bound methods — and those are read out of source, which is
 * weaker and is labelled as such where it happens.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

import {
  BONUS_TYPES,
  DEGREES,
  basicSavingThrow,
  buildOutcome,
  levelDC,
  LEVEL_DC_BASE
} from "../module/dice/resolution.mjs";
import {
  CHAIN_PROFILES,
  OPEN_ENDED,
  percentileValue,
  rollChain,
  rollPercentile
} from "../module/dice/open-ended.mjs";
import { attackOutcome, criticalSeverity } from "../module/combat/attack.mjs";
import { castingDC } from "../module/magic/casting.mjs";
import { SIZE_TABLE, hitPointMax } from "../module/config.mjs";
import {
  BASE_AP,
  DEFAULT_DEATH_STATE,
  applyDyingChange,
  computeAPRegain,
  effectiveDeathState
} from "../module/combat/turn-economy.mjs";
import { abilityBaseRange, abilityPointPool, abilityPointsSpent } from "../module/attributes.mjs";
import { extractConditionIncrease, extractConditionReduction } from "../module/effect-parser.mjs";
import { RACIAL_PP_PER_LEVEL } from "../module/racial-pp.mjs";
import {
  ABILITY_COLLAPSE,
  abilityCollapse,
  collapseExempt,
  collapseTransition,
  constitutionIsFatal
} from "../module/combat/ability-collapse.mjs";
import { MINDLESS_PENALISED_ATTRIBUTES } from "../module/creature-traits.mjs";

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

/** A scripted die: hands back the listed faces in order. */
function scripted(faces) {
  let i = 0;
  return async () => faces[Math.min(i++, faces.length - 1)];
}

/**
 * The body of a named method or function, braces balanced.
 *
 * WHY A BODY AND NOT A FILE SEARCH. The first draft of section N asked
 * only whether `_refusedAsSecondBackground` appeared anywhere in
 * item.mjs — and mutate-chapter1's N1 walked straight past it by
 * disconnecting the CALL and leaving the DEFINITION in place. A rule
 * that is defined and never called is precisely the shape this project
 * keeps finding, so asking "is it defined?" is asking the wrong
 * question. These now ask whether the guard is reached from the method
 * Foundry actually invokes.
 */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  const open = src.indexOf("{", start + signature.length - 1);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return "";
}

/* ================================================================== *
 * A. THE CORE RULES (p7)
 *
 *   "Compare the total to a number called the action's Difficulty (DC)
 *    ... If the result equals or exceeds the Difficulty, the action is a
 *    success."
 *
 * The boundary is the whole rule: margin 0 must be a success and -1 must
 * not. Driven through buildOutcome, which is what every check in the
 * system resolves through.
 * ================================================================== */
{
  const at = (dieTotal, dc) => buildOutcome({ dieTotal, modifiers: [], dc });

  ok("A1 equal to the DC is a success", at(15, 15).degree?.success === true,
    `degree ${at(15, 15).degree?.key}`);
  ok("A2 one over the DC is a success", at(16, 15).degree?.success === true);
  ok("A3 one under the DC is not a success", at(14, 15).degree?.success !== true);
  eq("A4 margin is total minus DC", at(21, 15).margin, 6);
  eq("A5 margin is null with no DC", buildOutcome({ dieTotal: 10, modifiers: [] }).margin, null);

  // "Rolling a natural 20 ... is not an automatic success, and rolling a
  // natural 1 ... is not an automatic failure" (p7). buildOutcome is
  // handed a die TOTAL and never the face, which is the structural
  // reason a check cannot auto-anything — pinned so that a future edit
  // adding a face-aware branch here goes red.
  //
  // POSITIVE FIRST, THEN THE ABSENCE. verify-checks-read-source caught
  // the first draft of this: an assertion that is only "this text is NOT
  // in the file" passes just as happily when the file is EMPTY, so it
  // proves nothing about a file that has been gutted. The slice has to
  // be found before its contents mean anything.
  const resolutionSrc = strip(read("module", "dice", "resolution.mjs"));
  const outcomeBody = resolutionSrc.split("export function buildOutcome")[1] ?? "";
  ok("A6a buildOutcome is where the outcome is resolved", outcomeBody.length > 200
    && /resolveDegree\(margin\)/.test(outcomeBody));
  ok("A6b buildOutcome never inspects a die face",
    !/\bface\b|unmodified/.test(outcomeBody));
  ok("A7 a natural 20 that misses the DC still fails", at(20, 35).degree?.success !== true);
  ok("A8 a natural 1 that beats the DC still succeeds", at(1 + 30, 15).degree?.success === true);

  // The ladder is ordered: a better margin can never be a worse degree.
  let previous = -Infinity;
  let monotonic = true;
  for (let margin = -40; margin <= 40; margin += 1) {
    const rank = DEGREES.length - DEGREES.findIndex((d) => margin >= d.min);
    if (rank < previous) monotonic = false;
    previous = rank;
  }
  ok("A9 the degree ladder never goes backwards as the margin improves", monotonic);
}

/* ================================================================== *
 * B. OPEN ENDED ROLLS, d20 (p10)
 *
 *   "if the result is 20, roll again and add the new result to the first
 *    roll ... If the first d20 roll is a 1, the dice are rolled again and
 *    the result subtracted ... A roll of 1 on anything other than the
 *    first roll does not cause one to roll again."
 *
 * Both worked examples from page 10 are driven as written.
 * ================================================================== */
{
  const chain = (faces, openEnded = OPEN_ENDED.BOTH) =>
    rollChain({ draw: scripted(faces), profile: CHAIN_PROFILES.d20, openEnded });

  const marcusHigh = await chain([20, 20, 5]);
  eq("B1 page 10's Detect Deception example: 20, 20, 5 totals 45", marcusHigh.total, 45);
  ok("B2 ...which with a +17 skill is the printed 62", 17 + marcusHigh.total === 62);

  const marcusLow = await chain([1, 20, 3]);
  eq("B3 page 10's Deception example: 1, then 20 and 3 subtracted, totals -22", marcusLow.total, -22);
  ok("B4 ...which with a +11 skill is the printed -11", 11 + marcusLow.total === -11);

  eq("B5 a 1 after the opening 1 does not chain", (await chain([1, 1])).total, 0);
  eq("B6 a 1 after an opening 20 does not chain", (await chain([20, 1])).total, 21);
  eq("B7 the downward chain continues on a 20", (await chain([1, 20, 20, 4])).total, -43);
  eq("B8 an ordinary roll does not chain at all", (await chain([13, 20])).total, 13);
  eq("B9 the upward chain continues while 20s come", (await chain([20, 20, 20, 2])).total, 62);

  // "Sometimes an open-ended roll may be bottom-ended or top-ended. If
  // this is the case, the roll will only continue in one direction."
  eq("B10 top-ended: a 20 chains", (await chain([20, 7], OPEN_ENDED.TOP)).total, 27);
  eq("B11 top-ended: a 1 does not", (await chain([1, 20], OPEN_ENDED.TOP)).total, 1);
  eq("B12 bottom-ended: a 1 chains", (await chain([1, 7], OPEN_ENDED.BOTTOM)).total, -6);
  eq("B13 bottom-ended: a 20 does not", (await chain([20, 20], OPEN_ENDED.BOTTOM)).total, 20);
  eq("B14 none: neither chains", (await chain([20, 20], OPEN_ENDED.NONE)).total, 20);
}

/* ================================================================== *
 * C. d% (p9-10)
 *
 *   "a roll of 96-100 indicates that the dice are rolled again and the
 *    result added to the first roll and a roll of 01-05 the next die
 *    subtracted."
 *   "The exception to this is double zeroes, which does not read as a
 *    '0' but instead as a '100'."
 * ================================================================== */
{
  const chain = (faces) =>
    rollChain({ draw: scripted(faces), profile: CHAIN_PROFILES.d100, openEnded: OPEN_ENDED.BOTH });

  eq("C1 96 chains upward", (await chain([96, 30])).total, 126);
  eq("C2 100 chains upward", (await chain([100, 30])).total, 130);
  eq("C3 95 does not chain", (await chain([95, 30])).total, 95);
  eq("C4 05 chains downward", (await chain([5, 30])).total, -25);
  eq("C5 06 does not chain", (await chain([6, 30])).total, 6);
  eq("C6 the upward chain continues while 96+ come", (await chain([96, 97, 10])).total, 203);

  eq("C7 double zero reads as 100", percentileValue(0, 0), 100);
  eq("C8 a 5 and a 7 read as 57", percentileValue(5, 7), 57);
  eq("C9 a 0 and a 4 read as 4", percentileValue(0, 4), 4);
  eq("C10 a d10's 10 folds to 0", percentileValue(10, 10), 100);

  // Every pair of digits lands inside 1-100, which is the range the page
  // claims the two dice between them produce.
  let inRange = true;
  for (let tens = 0; tens <= 9; tens += 1) {
    for (let unit = 0; unit <= 9; unit += 1) {
      const value = percentileValue(tens, unit);
      if (!(value >= 1 && value <= 100)) inRange = false;
    }
  }
  ok("C11 all 100 digit pairs land in 1-100", inRange);

  // Advantage on a d100 "allow[s] you to select the more favourable die
  // as the tens digit" (p8); disadvantage takes "the less favourable die
  // as the tens digit" (p9).
  const adv = await rollPercentile({ drawTen: scripted([6]), drawUnit: scripted([7]), bias: "advantage" });
  eq("C12 advantage puts the higher digit in the tens", adv.value, 76);
  const dis = await rollPercentile({ drawTen: scripted([9]), drawUnit: scripted([1]), bias: "disadvantage" });
  eq("C13 disadvantage puts the lower digit in the tens", dis.value, 19);
}

/* ================================================================== *
 * D. CHAOS RESULT (p10, optional)
 *
 *   "a GM may introduce an element of chaos if a 1 is rolled immediately
 *    after an open-ended 20 or 1 ... For d100 rolls, the same rule
 *    applies if a 66 is rolled on the initial check."
 * ================================================================== */
{
  const d20 = (faces) =>
    rollChain({ draw: scripted(faces), profile: CHAIN_PROFILES.d20, openEnded: OPEN_ENDED.BOTH });
  const d100 = (faces) =>
    rollChain({ draw: scripted(faces), profile: CHAIN_PROFILES.d100, openEnded: OPEN_ENDED.BOTH });

  ok("D1 a 1 straight after a 20 is chaos", (await d20([20, 1])).chaos === true);
  ok("D2 a 1 straight after a 1 is chaos", (await d20([1, 1])).chaos === true);
  ok("D3 an opening 1 alone is not chaos", (await d20([1, 7])).chaos !== true);
  ok("D4 an ordinary pair is not chaos", (await d20([13, 4])).chaos !== true);
  ok("D5 an initial 66 on d100 is chaos", (await d100([66])).chaos === true);
  ok("D6 an initial 65 on d100 is not", (await d100([65])).chaos !== true);
}

/* ================================================================== *
 * E. ATTACK ROLLS, ATTACK VALUE AND CRITICALS (p8)
 *
 *   "If the total meets or exceeds your target's Defensive Bonus (DB),
 *    you successfully hit ... If your attack value is 5 or greater, you
 *    have inflicted a critical hit."
 *
 * Plus Chapter 7's auto-hit and auto-miss, which page 7 points to when
 * it says attack rolls "follow different rules".
 * ================================================================== */
{
  const at = (total, db, unmodified = 10) => attackOutcome({ unmodified, total, db });

  eq("E1 AV is the amount the roll exceeded DB by", at(23, 15).av, 8);
  ok("E2 meeting the DB exactly hits", at(15, 15).hits === true);
  ok("E3 one under the DB misses", at(14, 15).hits === false);
  ok("E4 AV 5 is a critical", at(20, 15).critical !== null, `AV ${at(20, 15).av}`);
  ok("E5 AV 4 is not a critical", at(19, 15).critical === null);

  eq("E6 AV 5 is Minor", criticalSeverity(5).severity, "minor");
  eq("E7 AV 14 is still Minor", criticalSeverity(14).severity, "minor");
  eq("E8 AV 15 is Serious", criticalSeverity(15).severity, "serious");
  eq("E9 AV 24 is still Serious", criticalSeverity(24).severity, "serious");
  eq("E10 AV 25 is Deadly", criticalSeverity(25).severity, "deadly");
  eq("E11 AV 4 reaches no severity", criticalSeverity(4), null);

  ok("E12 an unmodified 1 always misses", at(40, 10, 1).hits === false);
  ok("E13 an unmodified 20 always hits", at(5, 30, 20).hits === true);
  ok("E14 an unmodified 20 that did not beat the DB earns no critical",
    at(5, 30, 20).critical === null);
}

/* ================================================================== *
 * F. LEVEL DC (p9) and the BASIC SAVING THROW TABLE (p10)
 *
 *   "Level DC = level + 14"
 *   "5-14 Minor +1 base / 15-24 Serious +2 base / 25+ Deadly +3 base"
 *
 * The ladder itself is driven in depth by verify-basic-save; what is
 * pinned here is that the two agree, and the constant.
 * ================================================================== */
{
  eq("F1 the Level DC constant is 14", LEVEL_DC_BASE, 14);
  eq("F2 Level DC at 1st level is 15", levelDC(1), 15);
  eq("F3 Level DC at 12th level is 26", levelDC(12), 26);

  eq("F4 a critical save takes nothing", basicSavingThrow("critical").damageMultiplier, 0);
  eq("F5 a successful save takes half", basicSavingThrow("success").damageMultiplier, 0.5);
  eq("F6 a partial takes full", basicSavingThrow("partial").damageMultiplier, 1);
  eq("F7 failing by 5 adds 1 base", basicSavingThrow("failure", -5).bonusBaseDamage, 1);
  eq("F8 failing by 14 still adds 1", basicSavingThrow("failure", -14).bonusBaseDamage, 1);
  eq("F9 failing by 15 adds 2", basicSavingThrow("fumble", -15).bonusBaseDamage, 2);
  eq("F10 failing by 25 adds 3", basicSavingThrow("blunder", -25).bonusBaseDamage, 3);
  eq("F11 failing by 4 adds none", basicSavingThrow("failure", -4).bonusBaseDamage, 0);

  // THE MARGIN MUST REACH THE LADDER. Refocus's Blunder called this
  // without it until 3.549.0, which floored every failure at "missed by
  // 0" and so never reached a bonus die or a critical. Pinned as the
  // difference the argument makes, rather than as the absence of a bug.
  ok("F12 omitting the margin reaches no severity at all",
    basicSavingThrow("failure").criticalSeverity === null);
  ok("F13 the refocus backlash passes its save margin",
    /basicSavingThrow\(\s*saveDegree\s*,\s*margin\s*\)/.test(
      strip(read("module", "combat", "action-workflow.mjs"))));
}

/* ================================================================== *
 * G. CAST A SPELL DC (Chapter 9's formula, page 10's rounding)
 *
 *   "Cast a Spell DC = 10 + (Spell PP cost) x1.5"
 *   "Unless otherwise stated, always round down."
 *
 * Chapter 9 states no rounding for this formula, so Chapter 1's default
 * governs it. Graham's ruling, 10 September 2026.
 * ================================================================== */
{
  eq("G1 PP 0 is DC 10", castingDC(0), 10);
  eq("G2 PP 1 is DC 11 (11.5 rounded down)", castingDC(1), 11);
  eq("G3 PP 2 is DC 13", castingDC(2), 13);
  eq("G4 PP 3 is DC 14 (14.5 rounded down)", castingDC(3), 14);
  eq("G5 PP 4 is DC 16", castingDC(4), 16);
  eq("G6 PP 5 is DC 17 (17.5 rounded down)", castingDC(5), 17);
  eq("G7 PP 9 is DC 23", castingDC(9), 23);

  // Every odd PP cost is the case that rounding decides; every even one
  // is exact. Driven across the whole usable range rather than sampled.
  let allDown = true;
  for (let pp = 0; pp <= 20; pp += 1) {
    if (castingDC(pp) !== 10 + Math.floor(pp * 1.5)) allDown = false;
  }
  ok("G8 the formula rounds down at every PP cost from 0 to 20", allDown);

  // ONE DEFINITION. A second copy of this formula lived in resolution.mjs
  // rounding a third way and was called by nothing; it is gone, and this
  // is what keeps it gone. The positive half is here for the same reason
  // as A6a — an absence proves nothing about an empty file.
  const resolutionText = strip(read("module", "dice", "resolution.mjs"));
  ok("G9a resolution.mjs is the file it claims to be",
    /export function basicSavingThrow/.test(resolutionText)
    && /export const LEVEL_DC_BASE/.test(resolutionText));
  ok("G9b the casting DC has exactly one definition in the system",
    !/export function castSpellDC/.test(resolutionText));
}

/* ================================================================== *
 * H. ROUNDING (p10)
 *
 *   "Unless otherwise stated, always round down. For example, if you are
 *    asked to take half of 7, the result would be 3."
 * ================================================================== */
{
  eq("H1 half of 7 is 3, as printed", Math.floor(7 / 2), 3);
  eq("H2 a successful basic save halves downward",
    Math.floor(7 * basicSavingThrow("success").damageMultiplier), 3);
}

/* ================================================================== *
 * I. DEATH STATE (p8) and ACTION POINTS (p8, p11)
 *
 *   "most characters have a Death State of 5 ... they die immediately if
 *    their Dying value ever becomes greater than their Death State"
 *   "Each character begins a tactical round with a set amount of Action
 *    Points (AP) usually 3."
 * ================================================================== */
{
  eq("I1 the default Death State is 5", DEFAULT_DEATH_STATE, 5);
  ok("I2 Dying equal to Death State is not death",
    applyDyingChange({ dying: 4, delta: 1, deathState: 5 }).dead === false);
  ok("I3 Dying greater than Death State is death",
    applyDyingChange({ dying: 5, delta: 1, deathState: 5 }).dead === true);
  ok("I4 a frail Death State of 4 dies a point earlier",
    applyDyingChange({ dying: 4, delta: 1, deathState: 4 }).dead === true);
  ok("I5 a resilient Death State of 6 survives a point longer",
    applyDyingChange({ dying: 5, delta: 1, deathState: 6 }).dead === false);
  eq("I6 Doomed reduces the effective Death State", effectiveDeathState(5, 2), 3);

  // A failed stabilisation is one of the four moments page 8 names, and
  // the card that applies it must route through the same threshold.
  ok("I7 a failed stabilisation can kill through the same function",
    applyDyingChange({ dying: 5, delta: 2, deathState: 5 }).dead === true);
  ok("I8 the increase card exists and uses applyDyingChange",
    /increaseCondition/.test(strip(read("module", "dice", "check-card-interactions.mjs")))
    && /applyDyingChange/.test(strip(read("module", "dice", "check-card-interactions.mjs"))));

  eq("I9 a turn's base Action Points is 3", BASE_AP, 3);
  eq("I10 an unimpeded turn regains 3", computeAPRegain({}).ap, 3);
  ok("I11 Quickened grants more than the base", computeAPRegain({ quickened: 1 }).ap > BASE_AP);
  ok("I12 Slowed grants less than the base", computeAPRegain({ slowed: 1 }).ap < BASE_AP);
}

/* ================================================================== *
 * J. CREATURE SIZE MODIFIERS (p10) and the RACE TABLE (p14)
 *
 * The size table as printed, and then THE INVARIANT PAGE 14 STATES:
 *
 *   "Be aware that any size modifiers to ability scores and hit points
 *    are included in the above values."
 *
 * The system applies the size table itself, so a race item must carry
 * only the REMAINDER. racial + size = printed, driven against the pack.
 * This is the check whose loss let the Halfling and Gnome double-count
 * ship — see the header.
 * ================================================================== */
{
  // THE REACHES CHAPTER 7 PRINTS (3.579.0). Chapter 1's own size table
  // is the one this block was written against; page 197's CREATURE SIZE
  // MODIFIERS II gives Diminutive and Tiny a reach of 0', and says in
  // words that they "must" occupy a target's space to attack it. The
  // block-19 audit's D12 and Graham's R12 of 21 September 2026.
  const printedSizes = {
    diminutive: { baseHP: 0, strMod: -3, dexMod: 3, reach: 0 },
    tiny: { baseHP: 10, strMod: -2, dexMod: 2, reach: 0 },
    small: { baseHP: 20, strMod: -1, dexMod: 1, reach: 5 },
    medium: { baseHP: 30, strMod: 0, dexMod: 0, reach: 5 },
    large: { baseHP: 50, strMod: 1, dexMod: -1, reach: 10 },
    huge: { baseHP: 80, strMod: 2, dexMod: -2, reach: 15 },
    gargantuan: { baseHP: 120, strMod: 3, dexMod: -3, reach: 20 },
    colossal: { baseHP: 250, strMod: 4, dexMod: -4, reach: 25 }
  };
  for (const [size, printed] of Object.entries(printedSizes)) {
    const entry = SIZE_TABLE[size];
    ok(`J1 ${size} exists in the size table`, Boolean(entry));
    if (!entry) continue;
    eq(`J2 ${size} base HP`, entry.baseHP, printed.baseHP);
    eq(`J3 ${size} Str modifier`, entry.strMod, printed.strMod);
    eq(`J4 ${size} Dex modifier`, entry.dexMod, printed.dexMod);
    eq(`J5 ${size} reach`, entry.reach, printed.reach);
  }
  eq("J6 the table holds exactly the eight printed sizes",
    Object.keys(SIZE_TABLE).length, Object.keys(printedSizes).length);

  // HP: "size, class, Con and then any modifiers" (p9). A Medium 1st
  // level character with Con 0 and no class dice is the size row itself.
  eq("J7 HP starts from the size row", hitPointMax({ size: "medium", conTotal: 0, level: 1, hpPerLevel: 0 }), 30);
  eq("J8 a Small character starts from 20", hitPointMax({ size: "small", conTotal: 0, level: 1, hpPerLevel: 0 }), 20);
  eq("J9 Con and class dice are per level",
    hitPointMax({ size: "medium", conTotal: 2, level: 3, hpPerLevel: 8 }), 30 + (2 * 3) + (8 * 3));

  // ── The Race Table, as printed on page 14, reconciled with Chapter 2
  // where the two disagree. Graham's ruling of 10 September 2026: "the
  // Chapter and Pack are correct", so Ascendan Cha +2, Gnome Cha +1 and
  // Kornargon's absent Cha are the canonical values and the page 14
  // table is the thing in error.
  const printedRaces = {
    Ascendan: { size: "medium", speed: 25, pp: 1, mods: { strength: -1, constitution: -1, intelligence: 2, charisma: 2 } },
    Dwarf: { size: "medium", speed: 20, pp: 0, mods: { strength: 1, dexterity: -1, constitution: 2, wisdom: 1, charisma: -1 } },
    Elf: { size: "medium", speed: 30, pp: 1, mods: { dexterity: 1, constitution: -1, intelligence: 1 } },
    Gnome: { size: "small", speed: 20, pp: 1, mods: { strength: -1, dexterity: 1, constitution: 1, charisma: 1 } },
    Halfling: { size: "small", speed: 20, pp: 0, mods: { strength: -1, dexterity: 2, constitution: 1, charisma: 1 } },
    Human: { size: "medium", speed: 25, pp: 0, mods: {} },
    Kornargon: { size: "medium", speed: 25, pp: 0, mods: { dexterity: 1, constitution: 1, wisdom: -1 } },
    Orc: { size: "medium", speed: 25, pp: -1, mods: { strength: 2, dexterity: 1, constitution: 2, intelligence: -1, wisdom: -1, charisma: -1 } }
  };

  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "races"), {
    keyEncoding: "utf8",
    valueEncoding: "json"
  });
  await db.open();
  const effects = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items.effects!")) effects.push(value);
    }
  } finally {
    await db.close();
  }

  // Both slots STACK, which is why the double-count added rather than
  // one overriding the other — and why plain addition is the right
  // arithmetic to check against.
  eq("J10 a race bonus stacks", BONUS_TYPES.race.stacking, "stack");
  eq("J11 an untyped bonus stacks", BONUS_TYPES.untyped.stacking, "stack");

  for (const [race, printed] of Object.entries(printedRaces)) {
    const abilities = effects.find((e) => e?.name === `${race}: ability modifiers`);
    const sizeSpeed = effects.find((e) => e?.name === `${race}: size and speed`);

    // Human's modifiers are all zero and it carries no ability effect at
    // all, which is correct rather than missing.
    const racial = {};
    for (const change of abilities?.changes ?? []) {
      const key = String(change.key ?? "").split(".")[2];
      if (key) racial[key] = Number(change.value);
    }

    ok(`J12 ${race} declares its size and speed`, Boolean(sizeSpeed));
    const declaredSize = String(
      (sizeSpeed?.changes ?? []).find((c) => /identity\.size$/.test(String(c.key)))?.value ?? ""
    ).toLowerCase();
    const declaredSpeed = Number(
      (sizeSpeed?.changes ?? []).find((c) => /movement\.land$/.test(String(c.key)))?.value ?? NaN
    );
    eq(`J13 ${race} size`, declaredSize, printed.size);
    eq(`J14 ${race} speed`, declaredSpeed, printed.speed);

    // THE INVARIANT. What the sheet ends up showing is the race item's
    // racial slot PLUS the size table the system applies on its own.
    const sizeEntry = SIZE_TABLE[printed.size];
    const resolved = { ...racial };
    resolved.strength = (resolved.strength ?? 0) + sizeEntry.strMod;
    resolved.dexterity = (resolved.dexterity ?? 0) + sizeEntry.dexMod;
    for (const key of Object.keys(resolved)) if (!resolved[key]) delete resolved[key];

    const expected = { ...printed.mods };
    for (const key of Object.keys(expected)) if (!expected[key]) delete expected[key];

    const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
    eq(`J15 ${race}: racial + size equals the printed line`, sortKeys(resolved), sortKeys(expected));

    eq(`J16 ${race} Power Points`, RACIAL_PP_PER_LEVEL[race.toLowerCase()], printed.pp);
  }
}

/* ================================================================== *
 * K. ABILITY SCORES (p12)
 *
 *   "you are given 6 points to distribute ... The only restriction is
 *    that no ability score can exceed 4 points ... You cannot have
 *    abilities lower than -4 ... use your level-based ability score
 *    increases to bring a base ability above 4 to a maximum of 6."
 * ================================================================== */
{
  eq("K1 the creation pool is 6 points", abilityPointPool(1), 6);
  eq("K2 the creation ceiling is 4", abilityBaseRange(1).max, 4);
  eq("K3 the floor is -4", abilityBaseRange(1).min, -4);
  eq("K4 a 3rd level increase raises the ceiling to 5", abilityBaseRange(3).max, 5);
  eq("K5 a 6th level increase raises it to 6", abilityBaseRange(6).max, 6);
  eq("K6 the ceiling never passes 6", abilityBaseRange(20).max, 6);

  // "If you opt for a negative value in an ability score, you gain bonus
  // points" — Lewi's Strength -2 buying two points back (p12).
  eq("K7 six points spread one each spends the pool",
    abilityPointsSpent({ strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 }), 6);
  eq("K8 a -2 refunds two points, as in the printed example",
    abilityPointsSpent({ strength: -2, dexterity: 4, constitution: 4, intelligence: 0, wisdom: 0, charisma: 0 }), 6);
}

/* ================================================================== *
 * L. THINGS THAT LIVE INSIDE FOUNDRY-BOUND METHODS
 *
 * Read out of source rather than driven, which is weaker, and is said so
 * rather than dressed up. Each one is a formula whose printed form is
 * unambiguous, so a source match is worth having even where a call is
 * not available.
 * ================================================================== */
{
  const actor = strip(read("module", "documents", "actor.mjs"));

  // "Initiative is a d100 roll + (Dex x5) + (Wis x5)" (p9).
  ok("L1 initiative is (Dex + Wis) x 5",
    /combat\.initiative\.ability\s*=\s*\(\s*dexterity\s*\+\s*wisdom\s*\)\s*\*\s*5/.test(actor));

  // "Base Defence score which is equal to 10 + class Base Defence Bonus"
  ok("L2 base defence starts at 10", /combat\.defence\.base\s*=\s*10/.test(actor));

  // Con -> Fortitude, Dex -> Reflex, Wis -> Will (p13).
  ok("L3 the three saves read their printed abilities",
    /fortitude:\s*"constitution"/.test(actor)
    && /reflex:\s*"dexterity"/.test(actor)
    && /will:\s*"wisdom"/.test(actor));

  // The size table applied to Str and Dex, which is the other half of
  // section J's invariant — if this ever stops happening, the race items
  // become wrong in the opposite direction.
  ok("L4 the size table's Str and Dex reach the attributes",
    /sizeEntry\.strMod/.test(actor) && /sizeEntry\.dexMod/.test(actor));

  // The tracker and the sheet must roll initiative through the same
  // entry point, or an effect that grants a bias applies on one and not
  // the other (3.549.0).
  ok("L5 tracker initiative goes through TRGCheck.roll",
    /TRGCheck\.roll\(\{[\s\S]*?type:\s*"initiative"/.test(strip(read("module", "documents", "combat.mjs"))));
}

/* ================================================================== *
 * M. THE FAILED STABILISATION WORDING (p8's fourth trigger)
 *
 * Resuscitation is the only action in the table that worsens a
 * condition, and until 3.549.0 its two harmful degrees were read by
 * nothing. Both directions are driven against the printed sentences.
 * ================================================================== */
{
  const fumble = "You increase the target's Dying condition by 1.";
  const blunder = "You increase the target's Dying condition by 2.";
  const success = "You reduce the target's Dying condition by 1.";

  eq("M1 the Fumble's increase is read", extractConditionIncrease(fumble, "dying"), 1);
  eq("M2 the Blunder's increase is read", extractConditionIncrease(blunder, "dying"), 2);
  eq("M3 the reduction parser ignores an increase", extractConditionReduction(fumble, "dying"), null);
  eq("M4 the increase parser ignores a reduction", extractConditionIncrease(success, "dying"), null);
  eq("M5 the reduction still reads its own sentence", extractConditionReduction(success, "dying"), 1);
  eq("M6 First Aid's bleeding reduction still reads",
    extractConditionReduction("You reduce the bleeding by 3", "bleeding"), 3);

  // The sentences above must be the ones actually in the table.
  const actions = read("module", "data", "skill-actions.mjs");
  ok("M7 Resuscitation still carries the increase wording",
    actions.includes(fumble) && actions.includes(blunder));
}

/* ================================================================== *
 * N. BACKGROUNDS (p15)
 *
 *   "When you create your character at 1st level you select one
 *    background of your choice. Once your background selection is made,
 *    it cannot be amended at higher levels."
 * ================================================================== */
{
  const printed = [
    "Acolyte", "Acrobat", "Animal Friend", "Apprentice", "Arcane Apprentice", "Archaeologist",
    "Barbarian", "Barkeep", "Bounty Hunter", "Charlatan", "Cook", "Criminal", "Cultist",
    "Detective", "Diplomat", "Entertainer", "Farmhand", "Field Medic", "Fortune Teller",
    "Gambler", "Gladiator", "Guard", "Herbalist", "Hermit", "Highwayman", "Hunter",
    "Labourer", "Lay Healer", "Martial Artist", "Merchant", "Miner", "Outrider", "Prisoner",
    "Sailor", "Scholar", "Scout", "Servant of Nature", "Soldier", "Squire", "Street Urchin",
    "Templar", "Weaver"
  ];

  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "backgrounds"), {
    keyEncoding: "utf8",
    valueEncoding: "json"
  });
  await db.open();
  const names = new Set();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.type === "background") {
        names.add(String(value.name).toLowerCase());
      }
    }
  } finally {
    await db.close();
  }

  eq("N1 the pack holds 42 backgrounds", names.size, printed.length);
  for (const name of printed) {
    ok(`N2 ${name} is in the pack`, names.has(name.toLowerCase()));
  }

  // The rule is enforced where every route in must pass, not only in the
  // sheet's picker (3.549.0). The GM exemption is on removal alone.
  const item = strip(read("module", "documents", "item.mjs"));
  const preCreate = bodyOf(item, "async _preCreate(");
  const preDelete = bodyOf(item, "async _preDelete(");
  const refuseAdd = bodyOf(item, "_refusedAsDuplicateIdentity(options)");
  const refuseDelete = bodyOf(item, "_refusedAsIdentityRemoval(options)");

  ok("N3 _preCreate itself refuses a duplicate identity item",
    /_refusedAsDuplicateIdentity\(\s*options\s*\)\s*\)\s*return false/.test(preCreate),
    "the guard must be REACHED, not merely defined");
  ok("N4 _preDelete itself refuses removal above 1st level",
    /_refusedAsIdentityRemoval\(\s*options\s*\)\s*\)\s*return false/.test(preDelete),
    "the guard must be REACHED, not merely defined");
  ok("N5 the add refusal tests for an existing item of the same type",
    /LOCKED_IDENTITY_TYPES\.includes\(type\)/.test(refuseAdd) && /existing\.length/.test(refuseAdd));
  ok("N6 the removal refusal tests the character's level",
    /identity\?\.level/.test(refuseDelete) && /level\s*>\s*1/.test(refuseDelete));
  ok("N7 the GM is exempt from the removal lock only",
    /isGM/.test(refuseDelete) && !/isGM/.test(refuseAdd));

  // WIDENED AT 3.552.0. Page 20 puts race, heritage and background in one
  // sentence — "Once your race, heritage, and background are decided, they
  // cannot be changed later" — and only the background half shipped at
  // 3.549.0, because block 1 stopped at page 15. The asymmetry that left
  // was backwards: a player could not drop a background but could swap
  // their whole race.
  const lockedList = /LOCKED_IDENTITY_TYPES = Object\.freeze\(\[([^\]]*)\]\)/.exec(item)?.[1] ?? "";
  for (const type of ["race", "heritage", "background"]) {
    ok(`N8 ${type} is one of the locked identity slots`, lockedList.includes(`"${type}"`),
      `page 20 names all three in one sentence — found: ${lockedList.trim()}`);
  }
  ok("N9 the sheet picker returns rather than warning for a locked slot",
    /LOCKED_IDENTITY_TYPES\.includes\(singleType\)/.test(
      strip(read("module", "sheets", "actor-sheet.mjs"))),
    "otherwise the player picks something the document layer then rejects");
}

/* ================================================================== *
 * O. AN ABILITY SCORE OF -5 (p13)
 *
 *   STR "too weak to move in any way and is unconscious"
 *   DEX "incapable of moving and is effectively immobile (but not
 *        unconscious)"
 *   CON "is dead"
 *   INT "comatose (unless it is mindless)"
 *   WIS "incapable of rational thought and is unconscious"
 *   CHA "not able to exert himself in any way and is unconscious"
 *
 * Automated at 3.550.0 on Graham's ruling. All six sentences driven.
 * ================================================================== */
{
  const at = (totals, mindless = false) => abilityCollapse(totals, { mindless });

  eq("O1 Strength -5 is unconscious", at({ strength: -5 }).conditions, ["unconscious"]);
  eq("O2 Dexterity -5 is immobilised", at({ dexterity: -5 }).conditions, ["immobilised"]);
  ok("O3 Dexterity -5 is NOT unconscious",
    !at({ dexterity: -5 }).conditions.includes("unconscious"),
    "'(but not unconscious)' is the only parenthesis in the six sentences and it is there for a reason");
  ok("O4 Constitution -5 is dead", at({ constitution: -5 }).dead === true);
  eq("O5 Intelligence -5 is unconscious", at({ intelligence: -5 }).conditions, ["unconscious"]);
  eq("O6 ...and the card says the printed word",
    at({ intelligence: -5 }).reasons[0].printed, "comatose");
  eq("O7 Wisdom -5 is unconscious", at({ wisdom: -5 }).conditions, ["unconscious"]);
  eq("O8 Charisma -5 is unconscious", at({ charisma: -5 }).conditions, ["unconscious"]);

  eq("O9 -4 is not a collapse", at({ strength: -4, dexterity: -4, constitution: -4 }).conditions, []);
  ok("O10 -4 Constitution is not death", at({ constitution: -4 }).dead === false);
  eq("O11 a score worse than -5 still collapses", at({ strength: -6 }).conditions, ["unconscious"]);
  ok("O12 an ordinary creature collapses at nothing",
    at({ strength: 0, dexterity: 1, constitution: 2, intelligence: 0, wisdom: 1, charisma: -1 })
      .conditions.length === 0);

  // Death swallows the rest — a corpse is not additionally Unconscious.
  eq("O13 death applies no other condition", at({ strength: -5, constitution: -5 }).conditions, []);
  ok("O14 ...but both reasons are still recorded",
    at({ strength: -5, constitution: -5 }).reasons.length === 2);
  eq("O15 two unconscious causes are one condition",
    at({ strength: -5, wisdom: -5 }).conditions, ["unconscious"]);

  // THE MINDLESS CARVE-OUT, and the interpolation in it. The book writes
  // "unless it is mindless" against Intelligence; this system's Mindless
  // rule drives Intelligence AND Charisma to -5, so the exemption is
  // keyed off that same list. Pinned as the tie between the two rules,
  // which is what must not drift.
  eq("O16 a mindless creature is not comatose from Intelligence", at({ intelligence: -5 }, true).conditions, []);
  eq("O17 nor unconscious from Charisma", at({ charisma: -5 }, true).conditions, []);
  eq("O18 the exemption covers exactly what the Mindless penalty drives",
    Object.keys(ABILITY_COLLAPSE).filter((k) => collapseExempt(k, true)).sort(),
    [...MINDLESS_PENALISED_ATTRIBUTES].sort());
  ok("O19 mindlessness does not excuse a fatal Constitution",
    at({ constitution: -5 }, true).dead === true,
    "Constitution is not on the Mindless penalty's list, so nothing may excuse it");
  ok("O20 mindlessness does not excuse Strength",
    at({ strength: -5 }, true).conditions.includes("unconscious"));

  // Death is ONE question with ONE answer: `isDead` must see a fatal
  // Constitution, or reapDead, the death watch and the turn-start skip
  // each go on believing a Con -5 character is alive.
  ok("O21 a fatal Constitution is fatal", constitutionIsFatal({ attributes: { constitution: { total: -5 } } }));
  ok("O22 -4 Constitution is not", !constitutionIsFatal({ attributes: { constitution: { total: -4 } } }));
  ok("O23 a missing Constitution is not", !constitutionIsFatal({}));
  ok("O24 isDead asks the Constitution rule",
    /constitutionIsFatal\(actor\?\.system\)/.test(strip(read("module", "combat", "death-state.mjs"))),
    "otherwise reapDead's own guard refuses to reap a Constitution death");

  // The trigger. A rule with no trigger is the same shape as a rule with
  // no caller: correct, tested, and not happening.
  const workflow = strip(read("module", "combat", "ability-collapse-workflow.mjs"));
  ok("O25 every route an attribute can move by is watched",
    /Hooks\.on\("updateActor"/.test(workflow)
    && /Hooks\.on\("createActiveEffect"/.test(workflow)
    && /Hooks\.on\("deleteActiveEffect"/.test(workflow));
  // ── The recovery, DRIVEN rather than read. This is the half of the
  // rule with the judgement in it, and the first draft left it inside
  // the hook where nothing could reach it — mutate-chapter1 walked past
  // two source-reading checks on it, which is how it came to be pure.
  const plan = (o) => collapseTransition(o);

  eq("O26a a fresh collapse applies the condition",
    plan({ demanded: ["unconscious"], owned: [], present: [] }).apply, ["unconscious"]);
  eq("O26b a condition already standing is not re-applied",
    plan({ demanded: ["unconscious"], owned: ["unconscious"], present: ["unconscious"] }).apply, []);
  eq("O26c a restored score takes the condition back off",
    plan({ demanded: [], owned: ["unconscious"], present: ["unconscious"] }).remove, ["unconscious"]);
  eq("O26d ...and stops claiming it",
    plan({ demanded: [], owned: ["unconscious"], present: ["unconscious"] }).owned, []);

  eq("O27 it never removes a condition it did not apply",
    plan({ demanded: [], owned: [], present: ["unconscious"] }).remove, [],
    "a character unconscious from a spell is not woken by an unrelated recovery");
  eq("O27b nor claims one somebody else applied",
    plan({ demanded: ["unconscious"], owned: [], present: ["unconscious"] }).owned, [],
    "claiming it would mean removing it later");

  eq("O28 it will not wake somebody who is unconscious at 0 HP",
    plan({ demanded: [], owned: ["unconscious"], present: ["unconscious"],
      otherReasonUnconscious: true }).remove, [],
    "the worse bug than the one the recovery path fixes");
  eq("O28b but Immobilised still lifts, since that exception is Unconscious's alone",
    plan({ demanded: [], owned: ["immobilised"], present: ["immobilised"],
      otherReasonUnconscious: true }).remove, ["immobilised"]);

  ok("O28c the workflow decides nothing itself",
    /collapseTransition\(\{/.test(workflow)
    && !/otherReasonToBeUnconscious\(actor\)\) continue/.test(workflow),
    "the ownership rule and the 0-HP exception must stay in the pure module");
  ok("O29 one client only", /isActingGM\(\)/.test(workflow));
  ok("O30 the hooks are registered at startup",
    /registerAbilityCollapseHooks\(\)/.test(strip(read("scripts", "trg-prime.mjs"))));

  // ── THE DOUBLE-APPLY, found by driving 3.550.0 live (3.551.0).
  //
  // Every condition the rule applied landed twice and its card posted
  // twice, because applying a condition is itself a document event that
  // re-enters the rule before the DERIVED `actor.statuses` has caught up.
  // Three things keep it closed, and all three are pinned.
  const registerBody = bodyOf(workflow, "export function registerAbilityCollapseHooks(");
  ok("O31 presence is read from the effect DOCUMENTS, not only the derived set",
    /function presentStatuses\(/.test(workflow)
    && /for \(const effect of actor\?\.effects/.test(workflow),
    "the derived set lags the write that this rule itself just made");
  ok("O32 the transition is handed document-level presence",
    /present: presentStatuses\(actor\)/.test(workflow));
  ok("O33 the death branch asks the documents too",
    /presentStatuses\(actor\)\.includes\("dead"\)/.test(workflow),
    "otherwise the death announces and reaps twice");
  ok("O34 no hook settles inline — every one schedules",
    registerBody.length > 200 && !/settleAbilityCollapse\(/.test(registerBody)
    && /scheduleSettle\(/.test(registerBody),
    "six hooks calling the rule directly is what produced two of everything");
  ok("O35 the scheduler runs outside the hook's own task",
    /setTimeout\(resolve, 0\)/.test(bodyOf(workflow, "function scheduleSettle(")));
  ok("O36 and coalesces a storm of hooks into one pass",
    /again = true/.test(workflow) && /while \(entry\.again\)/.test(workflow),
    "a request arriving mid-pass marks the current one to run again, not a second pass");

  // The death watch carried the same latent fault since 3.373.0 and was
  // surfaced by the Constitution death leaving two Dead effects.
  const watch = strip(read("module", "combat", "death-watch-workflow.mjs"));
  const watchRegister = bodyOf(watch, "export function registerDeathWatchHooks(");
  ok("O37 the death watch asks the documents whether the skull is on",
    /function alreadySkulled\(/.test(watch)
    && /needsReaping\(isDead\(actor\), alreadySkulled\(actor\)\)/.test(watch));
  ok("O38 and schedules rather than reaping inline",
    watchRegister.length > 200 && !/reapIfNewlyDead\(/.test(watchRegister)
    && /scheduleReap\(/.test(watchRegister));
  ok("O39 the death watch's scheduler defers and coalesces too",
    /setTimeout\(resolve, 0\)/.test(bodyOf(watch, "function scheduleReap("))
    && /while \(entry\.again\)/.test(watch));
}

/* ================================================================== */

process.stdout.write(`verify-chapter1: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\nverify-chapter1: ${failures.length} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("verify-chapter1: all pass\n");
