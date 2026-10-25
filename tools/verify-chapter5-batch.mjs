#!/usr/bin/env node
/**
 * verify-chapter5-batch — the four Chapter 5 feats built at 3.377.0.
 *
 *   THE BIGGER THEY ARE   +2 base damage, sling, target Large or larger
 *   SAVAGE STRIKES        unarmed critical: bleed +1d4, and a floor of 1
 *                         at severity serious or worse
 *   SHADOWBORN AGILITY    Squeeze fumble -> failure; Escape success ->
 *                         critical
 *   QUICK IDENTIFICATION  a better Identify Power ladder, with a rung the
 *                         base ladder does not have
 *
 * All four were `featNote`-only in the pack: declared in prose, doing
 * nothing. Graham's standing rule — "a feat should grant the ability, not
 * just declare it."
 *
 * WHAT THIS FILE IS REALLY GUARDING. Every one of these feats is a
 * CONDITIONAL bonus, and the expensive mistake with a conditional bonus is
 * never that it fails to fire — somebody notices that within a session.
 * It is that it fires when it should not, quietly, for the whole
 * campaign. So each section spends most of its checks on the negative
 * cases: wrong weapon, wrong size, wrong action, wrong degree, feat
 * absent. §5.12, learned on the Grapple conditional the same day.
 */

import { biggerTheyAreDamageBonus } from "../module/combat/attack.mjs";
import { applySavageStrikes, applySerratedBonus } from "../module/effect-parser.mjs";
import { isUnarmedAttack } from "../module/combat/unarmed.mjs";
import { shadowbornAgilityDegree, shadowbornStepNote } from "../module/skill-feats.mjs";
import { identifyPowerLadderFor, timeLadder } from "../module/general-skill-options.mjs";
import { DEGREE_ORDER } from "../module/creature-activation.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. THE BIGGER THEY ARE
 * ================================================================== */

const BIG = ["The Bigger They Are"];
const big = (weaponGroup, targetSize, featNames = BIG) =>
  biggerTheyAreDamageBonus({ featNames, weaponGroup, targetSize });

equal("A1 sling vs Large", big("sling", "large"), 2);
equal("A2 sling vs Huge", big("sling", "huge"), 2);
equal("A3 sling vs Gargantuan", big("sling", "gargantuan"), 2);
equal("A4 sling vs Colossal", big("sling", "colossal"), 2);
// The boundary is the whole rule: Medium is the size below Large.
equal("A5 sling vs Medium — the rung below", big("sling", "medium"), 0);
equal("A6 sling vs Small", big("sling", "small"), 0);
equal("A7 a bow gets nothing", big("bow", "huge"), 0);
equal("A8 a longsword gets nothing", big("sword", "colossal"), 0);
equal("A9 no feat, no bonus", big("sling", "huge", []), 0);
equal("A10 a different feat is not this one", big("sling", "huge", ["Sure Shot"]), 0);
equal("A11 case and spacing are tolerated", big(" SLING ", " Large ", [" the bigger they are "]), 2);
// THE BUG THIS PREVENTS. `sizeCategoryDifference` defaults an unknown
// size to "medium", which is right for a penalty and would be a silent
// +2 here on every NPC with a blank size field — most of this world's.
equal("A12 an unknown size earns nothing", big("sling", ""), 0);
equal("A13 nonsense size earns nothing", big("sling", "enormous"), 0);
// ABSOLUTE, NOT RELATIVE — "a Large or larger creature", not "larger
// than you". A Huge slinger shooting a Large target still gets it.
equal("A14 the rule is absolute, not relative to the shooter", big("sling", "large"), 2);

/* ================================================================== *
 * B. SAVAGE STRIKES
 * ================================================================== */

const bleedTag = (value) => ({ key: "bleeding", label: "Bleeding", value });
const otherTag = { key: "stunned", label: "Stunned", value: 1 };
const bleedOf = (tags) => tags.find((t) => t.key === "bleeding")?.value ?? null;

const savage = (tags, opts) => applySavageStrikes(tags, opts);

// Clause 1 — a row that already bleeds gains the d4.
equal("B1 an existing bleed gains the rolled d4",
  bleedOf(savage([bleedTag(2)], { active: true, severity: "minor", bleedBonus: 3 })), 5);
equal("B2 every face of the d4 is added as rolled",
  [1, 2, 3, 4].map((f) => bleedOf(savage([bleedTag(1)], { active: true, severity: "minor", bleedBonus: f }))).join(","),
  "2,3,4,5");
ok("B3 other conditions on the row are untouched",
  savage([bleedTag(2), otherTag], { active: true, severity: "minor", bleedBonus: 2 })
    .some((t) => t.key === "stunned" && t.value === 1));

// Clause 2 — the floor, and ONLY at serious or worse.
equal("B4 no bleed + serious = a flat 1",
  bleedOf(savage([otherTag], { active: true, severity: "serious", bleedBonus: 4 })), 1);
equal("B5 no bleed + deadly = a flat 1",
  bleedOf(savage([otherTag], { active: true, severity: "deadly", bleedBonus: 4 })), 1);
// THE READING, stated in the module and stated here: the floor is a flat
// 1 and does NOT also take the d4 — otherwise the printed "1" describes
// something that can never happen.
ok("B6 the floor is a flat 1, not 1 + the d4",
  bleedOf(savage([otherTag], { active: true, severity: "deadly", bleedBonus: 4 })) === 1,
  "if this ever reads 5, the second clause has been folded into the first");
equal("B7 no bleed + MINOR earns no floor",
  bleedOf(savage([otherTag], { active: true, severity: "minor", bleedBonus: 4 })), null);
equal("B8 an unknown severity earns no floor",
  bleedOf(savage([otherTag], { active: true, severity: "", bleedBonus: 4 })), null);

// Off switch.
equal("B9 inactive changes nothing",
  bleedOf(savage([bleedTag(2)], { active: false, severity: "deadly", bleedBonus: 4 })), 2);
ok("B10 inactive adds no floor either",
  bleedOf(savage([otherTag], { active: false, severity: "deadly", bleedBonus: 4 })) === null);
// A bonus that failed to arrive must not silently read as +0 — that is
// indistinguishable from the feat not applying (§5.4).
equal("B11 a missing d4 leaves the bleed alone rather than adding zero",
  bleedOf(savage([bleedTag(2)], { active: true, severity: "minor", bleedBonus: 0 })), 2);
// B11 ALONE WAS TOO WEAK and a mutation walked through it: dropping the
// `bonus <= 0` half of the guard is invisible at zero, because adding
// zero changes nothing. A NEGATIVE bonus is what separates a guard that
// rejects bad input from one that just happens to be harmless on it.
equal("B11b a negative d4 never REDUCES the bleed",
  bleedOf(savage([bleedTag(3)], { active: true, severity: "minor", bleedBonus: -2 })), 3);
equal("B11c nor does a nonsense one",
  bleedOf(savage([bleedTag(3)], { active: true, severity: "minor", bleedBonus: "lots" })), 3);

// It composes with Serrated rather than replacing it — the two are
// different sources and both are printed as increasing a bleed.
equal("B12 Serrated's +1 and Savage Strikes' d4 both land",
  bleedOf(savage(applySerratedBonus([bleedTag(2)], true), { active: true, severity: "minor", bleedBonus: 3 })), 6);

/* ================================================================== *
 * C. SHADOWBORN AGILITY
 * ================================================================== */

const SHADOW = ["Shadowborn Agility"];
const shadow = (a, d, f = SHADOW) => shadowbornAgilityDegree(a, d, f);

equal("C1 a fumbled Squeeze becomes a failure", shadow("squeeze", "fumble").degree, "failure");
equal("C2 a successful Escape becomes a critical", shadow("escape", "success").degree, "critical");
ok("C3 both report that they were upgraded",
  shadow("squeeze", "fumble").upgraded && shadow("escape", "success").upgraded);

// THE NEGATIVES. Only these two pairs move; everything else is untouched.
equal("C4 a fumbled Escape is still a fumble", shadow("escape", "fumble").degree, "fumble");
equal("C5 a successful Squeeze is still a success", shadow("squeeze", "success").degree, "success");
equal("C6 a blundered Squeeze is still a blunder", shadow("squeeze", "blunder").degree, "blunder");
equal("C7 a partial Escape is still a partial", shadow("escape", "partial").degree, "partial");
equal("C8 a fumbled Tumble is untouched — wrong action", shadow("tumble", "fumble").degree, "fumble");
equal("C9 a successful Trip is untouched — wrong action", shadow("tripAttack", "success").degree, "success");
equal("C10 without the feat nothing moves", shadow("escape", "success", []).degree, "success");
equal("C11 a different feat is not this one", shadow("escape", "success", ["Shadow Manipulation"]).degree, "success");
ok("C12 an unchanged degree reports upgraded:false",
  !shadow("escape", "fumble").upgraded && !shadow("escape", "success", []).upgraded);

// A caller assigns the result unconditionally, so an unknown degree must
// come back as itself rather than as null or undefined.
equal("C13 an unknown degree survives the round trip", shadow("escape", "wibble").degree, "wibble");

// The two destinations must be real degrees, or the outcome table and the
// condition table will both silently miss.
for (const key of ["failure", "critical"]) {
  ok(`C14 ${key} is a real rung on the ladder`, DEGREE_ORDER.includes(key));
}
// AND THE DIRECTION. DEGREE_ORDER runs best-to-worst, and its comment in
// creature-activation.mjs said the opposite until 3.377.0. If either
// upgrade ever moves the wrong way this catches it, which is the whole
// reason the comment was worth correcting rather than ignoring.
for (const [action, from, to] of [["squeeze", "fumble", "failure"], ["escape", "success", "critical"]]) {
  ok(`C15 ${action} ${from} -> ${to} moves toward the GOOD end`,
    DEGREE_ORDER.indexOf(to) < DEGREE_ORDER.indexOf(from),
    "an upgrade that moved the other way would make the feat a penalty");
}

// The card must say it happened — §5.9, the card says what the system did.
ok("C16 an upgrade names itself on the card", /Shadowborn Agility/.test(shadowbornStepNote(shadow("escape", "success"), "escape")));
ok("C17 and names both degrees", (() => {
  const n = shadowbornStepNote(shadow("squeeze", "fumble"), "squeeze");
  return /Fumble/.test(n) && /Failure/.test(n);
})(), "a card reading Failure over a fumbled die must say why");
ok("C18 nothing is printed when nothing changed", shadowbornStepNote(shadow("escape", "fumble"), "escape") === "");
ok("C19 the Step option is offered on Escape", /Step/.test(shadowbornStepNote(shadow("escape", "success"), "escape")));
ok("C20 and NOT on Squeeze, which has nothing to step out of",
  !/Step/.test(shadowbornStepNote(shadow("squeeze", "fumble"), "squeeze")));

/* ================================================================== *
 * D. QUICK IDENTIFICATION
 * ================================================================== */

// Reached through the ACCESSOR the workflow itself uses, not through the
// TIME_LADDERS table directly. Importing the table moved the uncalled-
// exports ratchet — a genuine orphan appeared to gain a caller because a
// tools file named it — and a harness must not be able to flatter the
// numbers it is measuring.
const BASE = timeLadder("identifyPower");
const standardLadder = identifyPowerLadderFor(BASE, []);
const quickLadder = identifyPowerLadderFor(BASE, ["Quick Identification"]);
const standard = standardLadder.options;
const quick = quickLadder.options;
const rung = (ladder, key) => ladder.find((o) => o.key === key) ?? null;

/* THE SHAPE, FIRST — and this section exists because of a live failure,
 * not a hypothetical. The first 3.377.0 build returned a bare ARRAY of
 * rungs here. `promptTimeLadder` reads `ladder.options`, so it threw on
 * `undefined.map`, resolveAction unwound, and Identify Power posted
 * NOTHING AT ALL — no dialog, no card, no notification. A feat meant to
 * improve the action deleted it.
 *
 * The harness was green throughout, because every check asked about the
 * NUMBERS and the one wiring check asked whether the call site contained
 * the right text. Neither can see a shape. §5.3, and the most expensive
 * instance of it in this batch. */
for (const [name, ladder] of [["standard", standardLadder], ["feat", quickLadder]]) {
  ok(`D0 the ${name} ladder is a descriptor, not a bare list`,
    ladder && !Array.isArray(ladder) && Array.isArray(ladder.options),
    "promptTimeLadder reads ladder.options and throws on an array");
  for (const field of ["defaultKey", "title", "hint", "icon", "button", "rowLabel"]) {
    ok(`D0 the ${name} ladder keeps its ${field}`, Boolean(ladder?.[field]),
      "the dialog and the check row are built from these");
  }
  ok(`D0 the ${name} ladder's default is one of its own rungs`,
    ladder.options.some((o) => o.key === ladder.defaultKey),
    "a default naming a rung that is not there opens the dialog on nothing");
  // ladderModifier reads these two off every chosen rung.
  ok(`D0 every ${name} rung has a key, a label and a modifier`,
    ladder.options.every((o) => o.key && o.label && typeof o.modifier === "number"));
}
ok("D0 the feat changes ONLY the rungs",
  ["defaultKey", "title", "hint", "icon", "button", "rowLabel", "actionKey"]
    .every((f) => quickLadder[f] === BASE[f]),
  "presentation belongs to the action, not to the feat");
ok("D0 and does not mutate the shared ladder",
  BASE.options.length === 4,
  "swapping must not edit TIME_LADDERS in place");

equal("D1 the standard ladder is untouched, four rungs", standard.length, 4);
equal("D2 the feat's ladder has five", quick.length, 5);
for (const [key, modifier] of [["tenMinutes", 2], ["minute", 0], ["round", -2], ["action", -5], ["free", -10]]) {
  equal(`D3 ${key} is ${modifier}`, rung(quick, key)?.modifier, modifier);
}
// The base ladder must keep its own numbers — the feat swaps the table,
// it does not edit the shared one.
for (const [key, modifier] of [["tenMinutes", 0], ["minute", -2], ["round", -5], ["action", -10]]) {
  equal(`D4 standard ${key} is still ${modifier}`, rung(standard, key)?.modifier, modifier);
}
ok("D5 the standard ladder has no free rung", rung(standard, "free") === null,
  "the fifth rung is the feat's whole reason for existing");
// EVERY rung must be better with the feat than without, or the feat is a
// downgrade at some time budget — checked as a rule rather than rung by
// rung, so a future edit to either table cannot quietly invert one.
for (const option of standard) {
  const improved = rung(quick, option.key);
  ok(`D6 ${option.key} is no worse with the feat`,
    improved && improved.modifier > option.modifier,
    `standard ${option.modifier}, feat ${improved?.modifier}`);
}
equal("D7 no feat returns the base ladder itself, unwrapped", identifyPowerLadderFor(BASE, []), BASE);
equal("D8 a different feat does not switch ladders", identifyPowerLadderFor(BASE, ["Oddity Assessment"]).options.length, 4);
equal("D9 case and spacing are tolerated", identifyPowerLadderFor(BASE, [" quick identification "]).options.length, 5);
// The free rung costs nothing from the pool.
ok("D10 the 0 AP rung spends nothing", ["0", "Free", 0].includes(rung(quick, "free")?.apCost));
ok("D11 and is labelled as the feat prints it", /0\s*AP/i.test(String(rung(quick, "free")?.label)));

/* ================================================================== *
 * E. Nothing here is note-only any more
 * ================================================================== */

// Each feat must be reachable from a real caller, not just exist. §5.1.
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
const attackSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/attack-workflow.mjs"), "utf8");
const actionSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/action-workflow.mjs"), "utf8");

ok("E1 The Bigger They Are reaches the damage formula",
  /biggerTheyAreDamageBonus\(\{/.test(attackSrc) && /if \(biggerBonus > 0\) formula \+=/.test(attackSrc));
ok("E2 and the damage step is actually given a target size",
  /targetSize: targetActor\?\.system\?\.identity\?\.size/.test(attackSrc),
  "the function had no target reference at all before 3.377.0 — that was the blocker");
ok("E3 Savage Strikes reaches the applied condition tags",
  /applySavageStrikes\(\s*\n?\s*applySerratedBonus\(/.test(attackSrc),
  "it must wrap Serrated's result, so both increases land");
// BOTH DETECTION ROUTES, because the data uses both and a mutation that
// dropped one survived the first version of this file. Pack natural
// attacks carry `category: "Unarmed"`; feat-created ones carry the trait
// keyword. Reading only one silently disables the feat for half the
// unarmed attacks in the game, and nothing on the card would say so.
// 3.576.0: BOTH ROUTES NOW LIVE IN ONE RULE, `isUnarmedAttack`
// (combat/unarmed.mjs), which Savage Strikes calls — so this checks the
// call, and then the rule by behaviour rather than by its spelling.
ok("E3b unarmed is detected by BOTH category and trait",
  // Re-anchored at 3.671.0: a weapon the holder's unarmed abilities reach counts too (C6).
  /const savageIsUnarmed = isUnarmedAttack\(weapon\?\.system \?\? \{ traits: weaponTraits \}\)(?:\s*\/\/[^\n]*\n\s*\|\| declaresUnarmedAbilities\(unarmedAbilityCarriers\(actor\), weapon\))?;/.test(attackSrc)
  && isUnarmedAttack({ category: "Unarmed", traits: "" })
  && isUnarmedAttack({ category: "brawling", traits: "finesse, unarmed" })
  && !isUnarmedAttack({ category: "Martial", traits: "Keen" }),
  "one route alone covers only half the unarmed attacks this system creates");
ok("E4 Shadowborn Agility rewrites the degree before anything reads it",
  /const shadowborn = shadowbornAgilityDegree\(action\.key/.test(actionSrc)
  && actionSrc.indexOf("shadowbornAgilityDegree(action.key") < actionSrc.indexOf("pickOutcome(degree"),
  "upgrading after pickOutcome would print one degree and apply another");
// AND THE CARD ACTUALLY SAYS SO. E4 proves the ordering; it does not
// prove anything is printed, and a mutation that deleted the line
// survived the first version of this file. C16-C20 test the sentence;
// this tests that anyone ever sees it.
ok("E4b the upgrade note is pushed onto the card",
  /if \(shadowbornNote\) lines\.push\(line\(shadowbornNote\)\);/.test(actionSrc),
  "a silent upgrade is a card that disagrees with the die in front of the player");
ok("E5 and the same degree feeds the condition table",
  actionSrc.indexOf("shadowbornAgilityDegree(action.key") < actionSrc.indexOf("basicActionConditionEffects(action.key, degree)"),
  "text and conditions must not be able to disagree");
ok("E6 Quick Identification swaps the ladder where it is chosen",
  /identifyPowerLadderFor\(baseLadder, actorFeatNames\)/.test(actionSrc)
  && /const actionLadder = \(baseLadder && action\.key === "identifyPower"\)/.test(actionSrc),
  "choosing the ladder twice is how a player is charged for a rung they did not pick");

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-chapter5-batch: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter5-batch: OK — ${checks} checks.\n`);
