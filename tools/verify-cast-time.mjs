#!/usr/bin/env node
/**
 * verify-cast-time — how long a spell takes, and whether that fits in a fight.
 *
 * NEW at 3.518.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A TEN-MINUTE RITUAL COST TEN ACTION POINTS.
 *
 * `cast-workflow.mjs` turned a cast time into AP with `baseAPOf`, which
 * reads a string's LEADING NUMBER and knows nothing about its unit. So
 * "10 minutes" became 10 AP and "7 days" became 7 AP — and because the
 * affordability gate refuses a cost the pool cannot cover, a ritual cast
 * during an encounter was rejected for being SEVEN AP SHORT rather than
 * for taking ten minutes, with a "proceed anyway" button beside it.
 *
 * Measured before building: EIGHTY-ONE spells in the pack print a cast
 * time in minutes, hours or days. Every one was mispriced this way.
 *
 * `parseApCost` had the right answer all along — it returns 0 for any
 * label it cannot read as a number — so this was ONE conversion
 * disagreeing with the rest of the system, not a missing rule.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 7 September 2026, is section L:
 *
 *   "Anything with a cast time of more than 3 AP cannot be cast in
 *    combat. A combat round is 6 seconds so an AP equates to about 2
 *    seconds. A 1 minute casting would be 30 AP and a 10 minutes casting
 *    300 AP, no combat would ever last that long."
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION W IS THE CHANNEL THIS RELEASE EXISTS FOR: five warps across
 * five spells say some version of "the casting time changes" and every
 * one shipped with `mods: {}`. Three SET a new time, one REDUCES the
 * printed one, and one goes the other way entirely.
 *
 * SECTION S IS THE REST OF THE PACK — the 81 long casts and the 570 AP
 * ones — which must price exactly as they did, because the only
 * behaviour this release changes is the unit conversion.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  MAX_COMBAT_AP, SECONDS_PER_AP, castTimeAP, castTimeApCost,
  castTimeIsCombatLegal, castTimeLabel, offersCastTimeWarp,
  castTimeWithExtraActions, tooLongForCombatLine, totalCastTime, warpedCastTime
} from "../module/magic/cast-time.mjs";
import { parseApCost } from "../module/combat/action-points.mjs";
import { baseAPOf } from "../module/magic/ap-scale.mjs";
import { extraCastingTimeIncrement } from "../module/magic/casting.mjs";
import {
  WARP_UNLIMITED, aggregateWarpSelection, emptyWarp, warpMaxTimes
} from "../module/magic/spell-warp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* ================================================================== *
 * C. THE CONVERSION
 * ================================================================== */

equal("C1 an AP is two seconds", SECONDS_PER_AP, 2, "Graham: a round is 6 seconds");
equal("C2 the ceiling is three", MAX_COMBAT_AP, 3);
equal("C3 A MINUTE IS THIRTY AP", castTimeAP("1 minute"), 30, "Graham's own worked example");
equal("C4 TEN MINUTES IS THREE HUNDRED", castTimeAP("10 minutes"), 300, "his second worked example");
equal("C5 an hour", castTimeAP("1 hour"), 1800);
equal("C6 a day", castTimeAP("1 day"), 43200);
equal("C7 seven days", castTimeAP("7 days"), 302400,
  "the longest cast in the pack, and it used to cost 7 AP");
equal("C8 a plain number is already AP", castTimeAP(2), 2);
equal("C9 so is a numeric string", castTimeAP("3"), 3);
equal("C10 plurals and singulars read alike",
  castTimeAP("1 minutes"), castTimeAP("1 minute"));
equal("C11 A TRAILING SENTENCE DOES NOT DEFEAT IT",
  castTimeAP("10 minutes  Requirements Offerings worth 500 silver pieces per level of creature called"),
  300, "two spells in the pack carry their requirements inside the cast-time field");
equal("C11b PART OF AN ACTION IS AN ACTION",
  castTimeAP("3 seconds"), 2,
  "rounding down would make a three-second cast cheaper than a four-second one");
equal("C11c and no time at all is free rather than one action",
  castTimeAP("0 minutes"), 0,
  "a floor here would guard nothing the pack contains and could never fail");
equal("C12 and so does a rate",
  castTimeAP("1 hour/creature level"), 1800, "Planar Binding prices per level; the unit is still an hour");

/* ================================================================== *
 * N. NULL IS NOT ZERO
 * ================================================================== */

equal("N1 A REACTION IS OUTSIDE THE AP ECONOMY", castTimeAP("Reaction"), null,
  "zero would make it a free action; null makes it a different economy");
equal("N2 so is Free", castTimeAP("Free"), null);
equal("N3 and an empty cast time", castTimeAP(""), null);
equal("N4 and a missing one", castTimeAP(null), null);
equal("N5 AND A LABEL NOTHING CAN READ, rather than a guess",
  castTimeAP("when the moon is right"), null,
  "`parseApCost` treats an unreadable cost as free; guessing upward would invent a refusal");
equal("N6 but all of them cost nothing", castTimeApCost("Reaction"), 0);
equal("N6b and so does the unreadable one", castTimeApCost("when the moon is right"), 0);
ok("N7 AND EVERY ONE OF THEM IS CASTABLE IN A FIGHT",
  ["Reaction", "Free", "", null, "when the moon is right"].every(castTimeIsCombatLegal),
  "a reaction spell refused for taking too long would be the defect, reversed");

/* ================================================================== *
 * A. THE AP-SHAPED STRINGS KEEP THEIR OLD ANSWER
 * ================================================================== */

equal("A1 \"1-3 AP\" IS ONE, NOT THREE", castTimeAP("1-3 AP"), 1,
  "the caster may cast it with a single action; charging three would bill for a choice they did not make");
equal("A2 \"1 AP+\" is its floor", castTimeAP("1 AP+"), 1,
  "Warped Terrain — extra actions are added on top by the AP-scale prompt");
ok("A3 AND BOTH STILL AGREE WITH `baseAPOf`",
  ["1-3 AP", "1 AP+", "2", "3"].every((v) => castTimeAP(v) === baseAPOf(v)),
  "these are the shapes this release must NOT reprice");
ok("A4 while the time units deliberately disagree with it",
  castTimeAP("10 minutes") !== baseAPOf("10 minutes")
  && castTimeAP("1 minute") !== baseAPOf("1 minute"),
  "that disagreement is the defect being fixed");

/* ================================================================== *
 * L. GRAHAM'S LINE
 * ================================================================== */

ok("L1 THREE AP IS CASTABLE", castTimeIsCombatLegal(3));
ok("L2 AND FOUR IS NOT", castTimeIsCombatLegal(4) === false,
  "\"more than 3 AP cannot be cast in combat\"");
ok("L3 a minute is not", castTimeIsCombatLegal("1 minute") === false);
ok("L4 ten minutes is not", castTimeIsCombatLegal("10 minutes") === false);
ok("L5 seven days is certainly not", castTimeIsCombatLegal("7 days") === false);
ok("L6 one and two AP are", castTimeIsCombatLegal(1) && castTimeIsCombatLegal(2));

/* ================================================================== *
 * R. THE REFUSAL SAYS THE ARITHMETIC
 * ================================================================== */

const refusal = tooLongForCombatLine("Crackling Tempest", "1 minute");
ok("R1 it names the spell", /Crackling Tempest/.test(refusal));
ok("R2 it prints the printed time", /1 minute/.test(refusal), refusal);
ok("R3 AND IT SHOWS THE WORKING", /30 AP/.test(refusal) && /2 seconds/.test(refusal),
  `"you cannot cast this" reads like a bug; "a minute is about 30 actions" reads like a rule — got: ${refusal}`);
ok("R4 and names the ceiling", /3 AP/.test(refusal), refusal);
const apRefusal = tooLongForCombatLine("Hypothetical", 9);
ok("R5 A CAST ALREADY IN AP DOES NOT GET THE CONVERSION EXPLAINED",
  !/seconds an action/.test(String(apRefusal)),
  `9 AP needs no arithmetic shown — got: ${apRefusal}`);
equal("R6 and an unnamed spell produces no line", tooLongForCombatLine("", "1 minute"), null);
equal("R7 nor does one with no readable time", tooLongForCombatLine("Ward", "Reaction"), null,
  "a reaction is never refused, so a refusal line for one would be unreachable text");

/* ================================================================== *
 * B. THE LABEL
 * ================================================================== */

equal("B1 a number gets its unit", castTimeLabel(2), "2 AP");
equal("B2 so does a numeric string", castTimeLabel("3"), "3 AP");
equal("B3 A TIME CARRIES ITS OWN WORDS", castTimeLabel("10 minutes"), "10 minutes",
  "\"10 minutes AP\" is what appending the unit blindly would produce");
equal("B4 and so does a reaction", castTimeLabel("Reaction"), "Reaction");
equal("B5 nothing prints nothing", castTimeLabel(null), "");

/* ================================================================== *
 * W. THE WARP CHANNEL
 * ================================================================== */

equal("W1 castApSet IS DECLARED VOCABULARY", emptyWarp().mods.castApSet, null,
  "an undeclared mod key is offered, charged, and silently dropped");
equal("W1b and so is castApDelta", emptyWarp().mods.castApDelta, 0);

const agg = (warps, form) => aggregateWarpSelection(warps, form);
const SET3 = [{ ppCost: 5, text: "cast time changes to 3 AP", mods: { castApSet: 3 } }];
const MINUS = [{ ppCost: 2, text: "lower the AP cost by 1 (min 1)", mods: { castApDelta: -1 } }];

equal("W2 A SET REPLACES THE PRINTED TIME",
  warpedCastTime("1 minute", agg(SET3, { "warp-0": 1 }).mods), 3);
equal("W3 AND BUYING IT TWICE STILL SAYS THREE",
  warpedCastTime("1 minute", agg(SET3, { "warp-0": 2 }).mods), 3,
  "\"changes to 3 AP\" names a new time; twice is the same new time");
equal("W4 A DELTA LOWERS IT", warpedCastTime(3, agg(MINUS, { "warp-0": 1 }).mods), 2);
equal("W5 AND ACCUMULATES", warpedCastTime(3, agg(MINUS, { "warp-0": 2 }).mods), 1);
equal("W6 DOWN TO THE PRINTED FLOOR AND NO FURTHER",
  warpedCastTime(3, agg(MINUS, { "warp-0": 9 }).mods), 1,
  "\"(min 1)\" — a cast that costs nothing is not what the sentence offers");
equal("W7 an unwarped cast is untouched", warpedCastTime("1 minute", {}), "1 minute");
equal("W8 A SET TO A TIME UNIT KEEPS THE UNIT",
  warpedCastTime(2, { castApSet: "10 minutes" }), "10 minutes",
  "Restore Senses goes the other way; collapsing it to a number would lose the words the card prints");
equal("W9 THE SET IS APPLIED BEFORE THE DELTA",
  warpedCastTime(2, { castApSet: 3, castApDelta: -1 }), 2,
  "\"changes to 3 AP\" then \"lower it by 1\" is 2, not 1 — the other order reads the base twice");
equal("W10 A DELTA ON A TIME UNIT WORKS IN AP",
  warpedCastTime("1 minute", { castApDelta: -1 }), 29,
  "one action off a thirty-action ritual, at the ruling's own conversion");
equal("W11 AND A REACTION HAS NO NUMBER TO LOWER",
  warpedCastTime("Reaction", { castApDelta: -1 }), "Reaction",
  "reducing it would turn a reaction into a 1 AP cast, which is a different thing");
equal("W12 A SET OF ZERO IS A REAL NEW CAST TIME",
  warpedCastTime(2, agg([{ ppCost: 1, text: "free", mods: { castApSet: 0 } }], { "warp-0": 1 }).mods), 0,
  "`if (m.castApSet)` in the aggregator would drop it as falsy");

/* ================================================================== *
 * T. EXTRA ACTIONS BOUGHT ON TOP ("1 AP+")
 * ================================================================== */

equal("T1 BUYING NONE LEAVES THE PRINTED TIME UNTOUCHED, UNIT AND ALL",
  castTimeWithExtraActions("1 minute", 0), "1 minute",
  "collapsing a string to its number here is how the legality gate lost sight of the unit");
equal("T1b including one nobody can read", castTimeWithExtraActions("Reaction", 0), "Reaction");
equal("T2 two extra actions on a scalable cast", castTimeWithExtraActions("1 AP+", 2), 3);
equal("T3 and on a plain one", castTimeWithExtraActions(2, 1), 3);
// T4 IS PLAIN ARITHMETIC AND SAYS SO. A first draft labelled this "a
// negative is not an extra action" and then asserted 1, which is the
// negative being applied — a check whose name disagreed with its own
// expectation. There is no clamp here on purpose: `apScaleChoices` only
// ever offers additions, so a floor would guard an input that cannot
// arrive and could never fail.
equal("T4 it adds what it is given, including a negative",
  castTimeWithExtraActions(2, -1), 1);

/* ================================================================== *
 * X. THE CHOOSER'S BOXES
 * ================================================================== */

equal("X1 A SET IS BOUGHT ONCE", warpMaxTimes(SET3[0]), 1,
  "repeating it changes nothing, so the chooser offers a checkbox");
equal("X2 AND A DELTA HAS NO CEILING", warpMaxTimes(MINUS[0]), WARP_UNLIMITED,
  "\"(min 1)\" is the bound, and it could never be reached if the option were bought once");

/* ================================================================== *
 * O. WHICH SPELLS OFFER ONE
 * ================================================================== */

ok("O1 a spell selling a set offers a cast-time warp",
  offersCastTimeWarp({ warps: SET3 }));
ok("O2 and one selling a delta does too", offersCastTimeWarp({ warps: MINUS }));
ok("O3 A SPELL WITH NO WARPS AT ALL DOES NOT", offersCastTimeWarp({}) === false);
ok("O4 nor does one whose warps buy other things",
  offersCastTimeWarp({ warps: [{ mods: { bonusValue: 2 } }, { mods: { extraTargets: 1 } }] }) === false);
ok("O5 IT READS THE MODS, NOT THE PRINTED SENTENCE",
  offersCastTimeWarp({ warps: [{ text: "reduce the casting time to 3 AP", mods: {} }] }) === false,
  "matching the text is how `absorbConditions` and `reduceBleed` spent two releases inert");
ok("O6 and a delta of zero is not an offer",
  offersCastTimeWarp({ warps: [{ mods: { castApDelta: 0 } }] }) === false);

/* ================================================================== *
 * THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) spells.push(v);
await db.close();

/* ── P. THE FIVE ──────────────────────────────────────────────────── */

const byName = (n) => spells.find((s) => s.name === n);
const warpOf = (n, i) => byName(n)?.system?.warps?.[i];

equal("P1 Regenerate — a minute becomes two actions", warpOf("Regenerate", 0)?.mods?.castApSet, 2);
equal("P1b for one PP", warpOf("Regenerate", 0)?.ppCost, 1,
  "the cheapest warp in the channel, doing the largest thing in it");
equal("P2 Restoration — the gap 3.517.0 left", warpOf("Restoration", 4)?.mods?.castApSet, 3);
equal("P3 Crackling Tempest — its only warp", warpOf("Crackling Tempest", 0)?.mods?.castApSet, 3);
equal("P4 Lifekeeping — the only delta of the five",
  warpOf("Lifekeeping", 2)?.mods?.castApDelta, -1);
equal("P5 Restore Senses — the only one going the other way",
  warpOf("Restore Senses", 1)?.mods?.castApSet, "10 minutes");

ok("P6 EACH ONE STILL SITS UNDER THE SENTENCE THAT SOLD IT",
  [["Regenerate", 0], ["Restoration", 4], ["Crackling Tempest", 0],
    ["Lifekeeping", 2], ["Restore Senses", 1]]
    .every(([n, i]) => /cast(ing)? time|AP cost/i.test(String(warpOf(n, i)?.text ?? ""))),
  "a mod on the wrong index buys the right thing for the wrong option");

/* ── E. WHAT EACH ONE ACTUALLY BUYS ───────────────────────────────── */

const bought = (name, idx) => {
  const s = byName(name);
  const mods = aggregateWarpSelection(s.system.warps, { [`warp-${idx}`]: 1 }).mods;
  return warpedCastTime(s.system.castAP, mods);
};

ok("E1 REGENERATE IS UNCASTABLE IN A FIGHT UNTIL IT IS WARPED",
  castTimeIsCombatLegal(byName("Regenerate").system.castAP) === false
  && castTimeIsCombatLegal(bought("Regenerate", 0)) === true,
  "that is the whole value of the warp, and before this release it bought nothing");
ok("E2 so is Restoration",
  castTimeIsCombatLegal(byName("Restoration").system.castAP) === false
  && castTimeIsCombatLegal(bought("Restoration", 4)) === true);
ok("E3 and Crackling Tempest",
  castTimeIsCombatLegal(byName("Crackling Tempest").system.castAP) === false
  && castTimeIsCombatLegal(bought("Crackling Tempest", 0)) === true);
equal("E4 LIFEKEEPING GOES THREE TO TWO", bought("Lifekeeping", 2), 2);
ok("E4b and was castable either way",
  castTimeIsCombatLegal(byName("Lifekeeping").system.castAP)
  && castTimeIsCombatLegal(bought("Lifekeeping", 2)),
  "the only one of the five whose warp is a convenience rather than a permission");
ok("E5 RESTORE SENSES BECOMES UNCASTABLE IN A FIGHT",
  castTimeIsCombatLegal(byName("Restore Senses").system.castAP) === true
  && castTimeIsCombatLegal(bought("Restore Senses", 1)) === false,
  "buying it mid-encounter buys a spell you can no longer cast, and the gate says so before the check is rolled");

/* ── S. THE REST OF THE PACK ──────────────────────────────────────── */

const longCasts = spells.filter((s) => !castTimeIsCombatLegal(s.system?.castAP));
equal("S1 EIGHTY-ONE SPELLS ARE TOO LONG TO CAST IN A FIGHT", longCasts.length, 81,
  "an exact measurement, not an impression — this is the population the defect was mispricing");
ok("S2 AND EVERY ONE OF THEM IS A TIME UNIT, not an AP count",
  longCasts.every((s) => /second|minute|hour|day|week/i.test(String(s.system?.castAP))),
  `not: ${JSON.stringify(longCasts.filter((s) => !/second|minute|hour|day|week/i.test(String(s.system?.castAP))).map((s) => [s.name, s.system.castAP]))}`);
ok("S3 SO NO SPELL PRINTING A PLAIN AP COST IS NEWLY REFUSED",
  spells.filter((s) => typeof s.system?.castAP === "number").every((s) => s.system.castAP <= MAX_COMBAT_AP),
  "the ceiling only ever bites the long casts; a 4 AP spell would be a rules question, not a conversion");

const mispriced = spells.filter((s) => {
  const c = s.system?.castAP;
  return typeof c === "string" && parseApCost(baseAPOf(c) ?? 0) !== castTimeApCost(c);
});
equal("S4 AND EIGHTY-ONE IS ALSO WHAT THE OLD CONVERSION GOT WRONG",
  mispriced.length, 81,
  "measured against `baseAPOf` directly, so the count is the defect's own footprint rather than a restatement of S1");

ok("S5 THE SPELLS THAT WERE PRICED RIGHT ARE PRICED THE SAME",
  spells.filter((s) => castTimeIsCombatLegal(s.system?.castAP))
    .every((s) => castTimeApCost(s.system?.castAP) === parseApCost(baseAPOf(s.system?.castAP) ?? s.system?.castAP)),
  "570-odd spells that must not move by a single action");

/* ── I. THE EXTRA-CASTING-TIME PROMPT ─────────────────────────────── */

equal("I1 A ONE-MINUTE SPELL TAKES EXTRA TIME IN MINUTES",
  extraCastingTimeIncrement("1 minute")?.unit, "minute");
equal("I2 AND ONCE WARPED DOWN IT TAKES IT IN ACTIONS",
  extraCastingTimeIncrement(bought("Regenerate", 0))?.unit, "AP",
  "the prompt used to read the printed spell and offer minutes for a two-action cast");
equal("I2b at three AP an increment", extraCastingTimeIncrement(bought("Regenerate", 0))?.size, 3);
equal("I3 AND A SPELL WARPED OUT TO TEN MINUTES CAN TAKE NO EXTRA TIME AT ALL",
  extraCastingTimeIncrement(bought("Restore Senses", 1)), null,
  "longer-than-a-minute cast times are ineligible, which the printed 2 AP version was not");

/* ── D. WHAT THE WORKFLOW ACTUALLY SPENDS ─────────────────────────── */

// THE WORKFLOW'S OWN FUNCTION, not a copy of its arithmetic. The first
// draft of this section rewrote the spend line here so it could be
// tested — a check that agrees with a copy of the rule rather than with
// the rule, and one that would pass happily while the real line was
// neutered. `totalCastTime` exists so this section can call the thing
// `castSpell` calls.
const spend = (castAP, mods = {}, extraApSpent = 0, apDelta = 0) =>
  parseApCost(totalCastTime(warpedCastTime(castAP, mods), { extraApSpent, apDelta }));

equal("D1 an ordinary two-action spell spends two", spend(2), 2);
equal("D2 A REACTION SPENDS NOTHING", spend("Reaction"), 0,
  "the floor must not push it up to 1 — it draws on a separate economy");
equal("D3 QUICKEN STILL TAKES AN ACTION OFF", spend(3, {}, 0, -1), 2);
equal("D4 and cannot take a cast below one", spend(1, {}, 0, -1), 1);
equal("D5 EXTRA CASTING TIME STILL ADDS ITS ACTIONS", spend(2, {}, 3), 5);
equal("D6 A WARPED REGENERATE COSTS ITS WARPED TIME",
  spend("1 minute", { castApSet: 2 }), 2,
  "and NOT 1, which is what the leading number of \"1 minute\" used to charge");
equal("D7 QUICKEN STACKS WITH THE WARP DOWN TO THE FLOOR",
  spend(3, { castApDelta: -1 }, 0, -1), 1);
/*
 * D8 WAS WRITTEN AS AN ASSUMPTION AND FAILED, which is the check doing
 * its job on its author. I expected a cast warped out to ten minutes to
 * come back as the words "10 minutes"; it comes back as 300, its honest
 * AP equivalent, because that is what the conversion says and
 * `totalCastTime` has no business softening it.
 *
 * SO THE CHECK NOW ASSERTS THE COUPLING INSTEAD. Three hundred AP is a
 * true number that must never reach the pool, and the only thing
 * standing between it and `spendActionCost` is the legality gate. Both
 * halves are pinned here so that deleting the gate breaks a check rather
 * than a session.
 */
equal("D8 A CAST WARPED OUT TO TEN MINUTES COMPUTES ITS HONEST 300 AP",
  totalCastTime(warpedCastTime(2, { castApSet: "10 minutes" })), 300);
ok("D8b AND IS KEPT FROM THE POOL BY THE LEGALITY GATE, NOT BY THE SPEND",
  castTimeIsCombatLegal(warpedCastTime(2, { castApSet: "10 minutes" })) === false,
  "if this ever passes, 300 AP reaches spendActionCost and clamps a caster to zero");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-cast-time: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-cast-time: OK — ${checks} checks. `
  + "Five inert warps live; 81 long casts priced by the ruling rather than by their leading digit.\n");
