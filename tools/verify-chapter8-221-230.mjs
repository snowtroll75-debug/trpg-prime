/**
 * verify-chapter8-221-230 — the fumble tables' own riders, and
 * Chapter 8's Other Rules (pages 221-230).
 *
 * NEW at 3.582.1, for the pages 221-230 audit. Ten defects and Graham's
 * rulings of 22 September 2026 (R1-R9, R11-R15; R10 leaves wind to the
 * GM):
 *
 *   A  the three fumble tables themselves
 *   B  the riders, read from each row's own text (D1; R1, R3-R6, R15)
 *   C  "until the bleed damage stops" (D2; R2)
 *   D  travel speed (D3; R7)
 *   E  a climb or swim speed replaces the check (D4; R8)
 *   F  flat-footed while climbing (D5; R9)
 *   G  burrowing holds your breath (D7; R11)
 *   H  food and water (D8; R12)
 *   I  daily preparation (D9; R13)
 *   J  the falling soft landing (D10; R14)
 *   K  the wiring, asked of the other side
 *   L  the live defects of this block, 3.582.0 → 3.582.1
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one
 * of Graham's rulings, never from the module under test.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  allyRerollRider, breakWeaponRider, dropWeaponRider, fumbleSaveDC, ignoresDR,
  levelDCSaveRider, randomMovementRider, reactionRider, typeSplitDamageRider,
  untilHealedConditions, untilInteractRider, fumbleRowRiders, FUMBLE_SAVE_DIFFICULTY
} from "../module/combat/fumble-riders.mjs";
import {
  travelSpeed, partyTravelSpeed, travelTime,
  FEET_PER_MINUTE_PER_SPEED, SPEED_PER_MPH, TRAVEL_HOURS_PER_DAY, TERRAIN_DIVISORS
} from "../module/travel.mjs";
import {
  advanceDay, foodIsShort, recordIntake, sustenanceChecksDue,
  FOOD_POUNDS_PER_DAY, WATER_GALLONS_PER_DAY
} from "../module/sustenance.mjs";
import {
  dailyPreparationAllowed, spellEndsAtPreparation, endedSpellsLine, DAY_SECONDS
} from "../module/rest/daily-preparation-gate.mjs";
import {
  effectiveFallDistance, softLandingReduction, fallingDamage,
  SOFT_LANDING_FEET, DOVE_IN_FEET
} from "../module/combat/falling.mjs";
import { rollsAsCheck, speedReplacesCheck, automaticSuccessLine, SPEED_REPLACES_CHECK } from "../module/combat/action-degrees.mjs";
import { climbingFlatFooted } from "../module/combat/basic-action-conditions.mjs";
import { reactionBlockReason, fumbleBlocksReactions, FUMBLE_REACTION_BLOCK } from "../module/combat/reactions.mjs";
import { DIFFICULTY_BY_KEY, levelDC } from "../module/dice/resolution.mjs";
import { FUMBLE_TABLES } from "../module/data/fumble-tables.mjs";
import { durationClauses } from "../module/combat/critical-durations.mjs";
// M — the two rules that shipped at 3.582.0 with nobody calling them.
import { travelCardBody } from "../module/travel-card.mjs";
import { sustenanceLine } from "../module/sustenance-workflow.mjs";

let failures = 0;
let checks = 0;
function ok(label, condition, why = "") {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${why ? ` — ${why}` : ""}`);
}
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const rowOf = (table, n) => FUMBLE_TABLES[table].find((r) => n >= r.min && n <= r.max);

/* ================================================================== */
/* A — THE THREE TABLES                                                */
/* ================================================================== */

for (const table of ["missile", "thrown", "unarmed"]) {
  eq(`A1 the ${table} fumble table has thirty rows`, FUMBLE_TABLES[table].length, 30);
}
// Transcribed from page 221, 222 and 223 — the row every table shares.
for (const table of ["melee", "missile", "thrown", "unarmed"]) {
  ok(`A2 ${table} 1 is the same self-deprecating line`,
    rowOf(table, 1).effect.startsWith("You can't even fumble well."));
}
eq("A3 the four tables together are 120 rows",
  Object.values(FUMBLE_TABLES).flat().length, 120);

/* ================================================================== */
/* B — THE RIDERS (D1; R1, R3-R6, R15)                                */
/* ================================================================== */

/*
 * COUNTED FROM THE TABLES, not from a list of row numbers written here —
 * the same argument `critical-riders.mjs` makes. Each figure is the one
 * the audit reported, so a pattern that silently stops matching is a
 * failing check rather than a quieter card.
 */
{
  const counts = {};
  for (const row of Object.values(FUMBLE_TABLES).flat()) {
    for (const [key, value] of Object.entries(fumbleRowRiders(row))) {
      const present = value !== null && value !== false
        && !(Array.isArray(value) && !value.length);
      if (present) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  // SORTED, because `eq` compares serialised objects and key order is
  // whatever the loop happened to produce.
  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  eq("B1 the riders, counted across all 120 rows", sorted, {
    allyReroll: 9, breakWeapon: 4, dropWeapon: 6, ignoresDR: 8, levelDCSave: 4,
    randomMovement: 1, reactions: 6, typeSplit: 6, untilHealed: 13, untilInteract: 3
  }, "the figures the audit reported");
}

// R3 "Auto" — the ally reroll, transcribed from the 66 row.
eq("B2 a random ally, with a critical on yourself when none is in range",
  allyRerollRider(rowOf("melee", 66).effect),
  { target: "randomAlly", ignoresMAP: false, includesSelf: false, fallback: "self" });
// Thrown 21-25: "the closest creature to the original target (this can be yourself)".
eq("B3 the closest creature, which may be you",
  allyRerollRider(rowOf("thrown", 21).effect),
  { target: "closest", ignoresMAP: false, includesSelf: true, fallback: "none" });
// Missile 98-99: "Reroll the attack targeting a random ally within range ignoring MAP".
eq("B4 ignoring the multiple attack penalty",
  allyRerollRider(rowOf("missile", 98).effect).ignoresMAP, true);
// Unarmed 98-99: "you critically hit yourself".
eq("B5 no ally involved at all", allyRerollRider(rowOf("unarmed", 98).effect).target, "self");

/*
 * R4 — "a DC equal to your Level DC (HARD)", and Hard is +2.
 *
 * THE AUDIT GUESSED +5 OUT LOUD. The ladder says otherwise, and this
 * check asks the ladder rather than repeating either number.
 */
eq("B6 Hard is the +2 step", DIFFICULTY_BY_KEY.hard.modifier, 2);
eq("B6b and very hard is the +5 the audit confused it with", DIFFICULTY_BY_KEY.veryHard.modifier, 5);
/*
 * A LITERAL 2, NOT `DIFFICULTY_BY_KEY[FUMBLE_SAVE_DIFFICULTY].modifier`.
 * The first draft of this check put the constant on both sides, so it
 * asked only that `fumbleSaveDC` use it — re-tuning the constant to
 * "veryHard" moved both sides together and the check still passed. The
 * mutation runner found that within a minute of being written.
 */
eq("B7 the save DC is the level's own DC plus that step", fumbleSaveDC(5), levelDC(5) + 2);
eq("B7b and the difficulty the rows fall back on is Hard", FUMBLE_SAVE_DIFFICULTY, "hard");
eq("B8 melee 100 is a Fortitude save on the fumbler alone",
  levelDCSaveRider(rowOf("melee", 100).effect), { save: "fortitude", scope: "self", difficulty: "hard" });
// Unarmed 100: "All targets including yourself basic Reflex Saving throw".
eq("B9 unarmed 100 reaches everyone",
  levelDCSaveRider(rowOf("unarmed", 100).effect), { save: "reflex", scope: "everyone", difficulty: "hard" });

// R5 "Unequip" — and the bomb clause that travels with two of them.
eq("B10 the weapon is dropped", dropWeaponRider(rowOf("melee", 11).effect), { drops: true, dud: false });
eq("B11 and a bomb dropped is a dud", dropWeaponRider(rowOf("thrown", 11).effect), { drops: true, dud: true });

// R6 — the break, and the bow's string.
eq("B12 a broken weapon", breakWeaponRider(rowOf("missile", 81).effect),
  { breaks: true, bowString: false, interacts: 0 });
eq("B13 a snapped string, with its repair cost", breakWeaponRider(rowOf("missile", 21).effect),
  { breaks: true, bowString: true, interacts: 3 });
// MELEE 100 DOES NOT BREAK THE WEAPON, and missile and thrown 100 do.
// Found by driving it: the melee row is "You spin your weapon… and
// deliver an almost lethal blow to yourself", with no break at all.
eq("B14 melee 100 breaks nothing", breakWeaponRider(rowOf("melee", 100).effect), null);
ok("B14b while missile and thrown 100 do",
  Boolean(breakWeaponRider(rowOf("missile", 100).effect))
  && Boolean(breakWeaponRider(rowOf("thrown", 100).effect)));

// The split by damage type, transcribed from the 26-29 row.
eq("B15 piercing or slashing bleeds, bludgeoning hits",
  typeSplitDamageRider(rowOf("melee", 26).effect),
  {
    piercingSlashing: { type: "bleed", formula: "1d4" },
    bludgeoning: { type: "damage", formula: "1d10", ignoresDR: true }
  });

// Reactions, both directions.
eq("B16 a row that takes your reactions away", reactionRider(rowOf("unarmed", 11).effect),
  { triggers: false, blockedRounds: 1 });
eq("B17 a row that provokes them", reactionRider(rowOf("unarmed", 21).effect),
  { triggers: true, blockedRounds: 0 });

// Unarmed 86-90: "you move 10' in a random direction. This movement
// Triggers Reactions".
eq("B18 ten feet, randomly, provoking", randomMovementRider(rowOf("unarmed", 86).effect),
  { feet: 10, random: true, triggersReactions: true });

// "until you spend 2 Interact actions to free yourself" — and what it frees.
eq("B19 the escape, and the condition it clears",
  untilInteractRider(rowOf("melee", 51).effect), { interacts: 2, frees: "slowed" });

// R15 — "until healed", scoped to its own conjunct.
eq("B20 a single condition until healed", untilHealedConditions(rowOf("melee", 41).effect), ["weakened"]);
// Unarmed 81-85: "You fall prone AND are Injured 2 until healed" — the
// Prone is not until healed, it ends when you stand up.
eq("B21 and not the one on the other side of the 'and'",
  untilHealedConditions(rowOf("unarmed", 81).effect), ["injured"]);

// "Ignoring DR & Resistance" is REPORTED, not enforced — self-damage
// never ran the pipeline, so eight rows were already right.
eq("B22 the phrase is recognised", ignoresDR(rowOf("melee", 61).effect), true);
ok("B23 and nothing pretends to enforce it",
  !/ignoreDR|bypassDR/.test(code("module", "combat", "fumble-riders-workflow.mjs")));

/* ================================================================== */
/* C — "UNTIL THE BLEED DAMAGE STOPS" (D2; R2)                        */
/* ================================================================== */

// Three fumble rows, transcribed: "You are taking 1d6 recurring damage
// and are Sickened 1 until the bleed damage stops."
for (const table of ["melee", "missile", "thrown"]) {
  const clause = durationClauses(rowOf(table, 86).effect).find((c) => c.duration.kind === "linked");
  eq(`C1 ${table} 86-90 waits for the bleeding`, clause?.duration?.to, "bleeding");
}
// AND THE WIDENING FOUND A CRITICAL ROW TOO — Mental 70, "Recurring 1 &
// Controlled by you until the bleed damage ends", a Controlled that was
// permanent. Pinned in verify-chapter7-critical-211-220's own count.
eq("C2 the noun may be followed by 'damage'",
  durationClauses("Sickened 1 until the bleed damage stops.")[0]?.duration?.to, "bleeding");
eq("C2b and still works without it",
  durationClauses("Sickened 1 until the bleeding stops.")[0]?.duration?.to, "bleeding");

/* ================================================================== */
/* D — TRAVEL SPEED (D3; R7)                                          */
/* ================================================================== */

/*
 * THE PRINTED TABLE, ROW FOR ROW, against the derivation. Page 226.
 * If the book re-tunes a row this fails rather than the formula quietly
 * disagreeing with the page.
 */
const PRINTED_TRAVEL = [
  [10, 100, 1, 8], [15, 150, 1.5, 12], [20, 200, 2, 16], [25, 250, 2.5, 20],
  [30, 300, 3, 24], [35, 350, 3.5, 28], [40, 400, 4, 32], [50, 500, 5, 40], [60, 600, 6, 48]
];
for (const [speed, fpm, mph, mpd] of PRINTED_TRAVEL) {
  eq(`D1 Speed ${speed} covers the printed distances`,
    (({ feetPerMinute, milesPerHour, milesPerDay }) => [feetPerMinute, milesPerHour, milesPerDay])(travelSpeed(speed)),
    [fpm, mph, mpd]);
}
eq("D2 the constants the derivation rests on",
  [FEET_PER_MINUTE_PER_SPEED, SPEED_PER_MPH, TRAVEL_HOURS_PER_DAY], [10, 10, 8]);
// "halved… and quartered when moving through formidable terrain"
eq("D3 difficult terrain halves it", travelSpeed(30, "difficult").milesPerDay, 12);
eq("D4 formidable terrain quarters it", travelSpeed(30, "formidable").milesPerDay, 6);
eq("D4b the divisors are the book's two", TERRAIN_DIVISORS, { normal: 1, difficult: 2, formidable: 4 });
// "the character with the slowest speed determines how fast the party travel"
eq("D5 the party moves at its slowest",
  partyTravelSpeed([{ name: "A", speed: 30 }, { name: "B", speed: 20 }, { name: "C", speed: 25 }]).speed, 20);
eq("D5b and says who set the pace",
  partyTravelSpeed([{ name: "A", speed: 30 }, { name: "B", speed: 20 }]).pacedBy, "B");
eq("D6 a journey at Speed 30", travelTime(120, 30).days, 5);

/* ================================================================== */
/* E — A SPEED REPLACES THE CHECK (D4; R8 "Yes")                      */
/* ================================================================== */

// "Instead of making Climb (Climbing) checks, you automatically succeed"
eq("E1 a climb speed answers the Climb check",
  rollsAsCheck({ key: "climb" }, { speeds: { climb: 20 } }), false);
eq("E2 a swim speed answers the Swim check",
  rollsAsCheck({ key: "swim" }, { speeds: { swim: 30 } }), false);
eq("E3 without one, the check stands",
  rollsAsCheck({ key: "climb" }, { speeds: {} }), true);
// "in hazardous conditions… Climbing checks may still be necessary"
eq("E4 hazardous conditions bring the check back",
  rollsAsCheck({ key: "climb" }, { speeds: { climb: 20 }, hazardous: true }), true);
// A fly speed grants the ACTIONS; the page never says they succeed.
eq("E5 only climb and swim are excused", SPEED_REPLACES_CHECK, { climb: "climb", swim: "swim" });
eq("E5b so Fly still rolls", speedReplacesCheck({ key: "fly" }, { speeds: { fly: 40 } }), false);
eq("E6 and an unrelated action is untouched",
  rollsAsCheck({ key: "strike" }, { speeds: { climb: 20 } }), true);
ok("E7 the card says which speed did it",
  automaticSuccessLine({ key: "climb", name: "Climb" }, { speeds: { climb: 20 } })
    .includes("climb speed of 20 feet"));

/* ================================================================== */
/* F — FLAT-FOOTED WHILE CLIMBING (D5; R9 "Yes")                      */
/* ================================================================== */

eq("F1 no climb speed means flat-footed",
  climbingFlatFooted({ climbSpeed: 0 }), [{ target: "self", conditionKey: "flatFooted", active: true }]);
eq("F2 a climb speed waives it", climbingFlatFooted({ climbSpeed: 20 }), []);
// "Increasing the difficulty by 2 lets you… ignore the flat-footed condition."
eq("F3 and so does the +2 DC trade-off",
  climbingFlatFooted({ climbSpeed: 0, ignoresFlatFooted: true }), []);

/* ================================================================== */
/* G — BURROWING HOLDS YOUR BREATH (D7; R11 "Yes")                    */
/* ================================================================== */

// Asked of the source, because the act of holding a breath is Foundry's.
{
  const wf = code("module", "combat", "action-workflow.mjs");
  ok("G1 the burrow rule calls page 202's own function",
    /startHoldingBreath/.test(wf) && /action\?\.key !== "burrow"/.test(wf));
  // BOTH BRANCHES — Burrow declares checkType "none" and takes the
  // no-roll path, which is exactly what block 20's F3 got wrong.
  // CALL SITES ONLY — the helper's own declaration matches the same
  // text, so counting every occurrence would answer three and pass even
  // if one branch lost its call.
  eq("G2 and it is called from both action branches",
    (wf.match(/await burrowingBreathLines\(actor, action\)/g) ?? []).length, 2);
}

/* ================================================================== */
/* H — FOOD AND WATER (D8; R12 "Yes")                                 */
/* ================================================================== */

eq("H1 the book's figures", [FOOD_POUNDS_PER_DAY, WATER_GALLONS_PER_DAY], [1, 1]);
eq("H2 a short day is short", foodIsShort(0), true);
eq("H2b and a full one is not", foodIsShort(2), false);
// "Each day that you consume less than the required amount of food…"
eq("H3 food is one check per short day",
  sustenanceChecksDue({ daysWithoutFood: 3 }).checks, 3);
// "After a day with no water… begin making Exhaustion checks every hour."
eq("H4 a dry day starts the hourly clock and owes nothing yet",
  sustenanceChecksDue({ daysWithoutWater: 1, hoursSinceWaterFailed: 0 }),
  { checks: 0, reasons: ["a day without water — hourly checks begin now"], hourly: true });
eq("H5 and then one per hour",
  sustenanceChecksDue({ daysWithoutWater: 1, hoursSinceWaterFailed: 5 }).checks, 5);
eq("H6 less than a full dry day owes nothing",
  sustenanceChecksDue({ daysWithoutWater: 0, hoursSinceWaterFailed: 9 }),
  { checks: 0, reasons: [], hourly: false });
// Drinking stops the water clock; it does not feed you.
{
  const after = recordIntake({ daysWithoutFood: 3, daysWithoutWater: 2, hoursSinceWaterFailed: 6 }, { gallons: 1 });
  eq("H7 water clears the water clock", [after.daysWithoutWater, after.hoursSinceWaterFailed], [0, 0]);
  eq("H7b and leaves the hunger", after.daysWithoutFood, 3);
}
eq("H8 a fed and watered day clears both",
  advanceDay({ daysWithoutFood: 4, daysWithoutWater: 2 }, { pounds: 2, gallons: 1 }),
  { daysWithoutFood: 0, daysWithoutWater: 0, hoursSinceWaterFailed: 0 });

/* ================================================================== */
/* I — DAILY PREPARATION (D9; R13 "Yes")                              */
/* ================================================================== */

// "To use daily preparation you must have fully rested (typically 8 hours)."
eq("I1 eight hours rested is enough",
  dailyPreparationAllowed({ hoursRested: 8, requiredHours: 8 }).allowed, true);
eq("I2 seven is not", dailyPreparationAllowed({ hoursRested: 7, requiredHours: 8 }),
  { allowed: false, short: 1, requiredHours: 8, unrecorded: false });
// "TYPICALLY" — a race or effect that shortens the night shortens this.
eq("I3 a four-hour trance is a full rest for someone who needs four",
  dailyPreparationAllowed({ hoursRested: 4, requiredHours: 4 }).allowed, true);

/*
 * I4-I8: NO REST RECORDED IS NOT A REST OF ZERO HOURS (3.586.2).
 *
 * Reported from a live table on 24 September 2026, the morning after
 * this gate shipped: every character in the world was refused daily
 * preparation with "the last rest was 0 — 8 short". The flag the gate
 * reads is written only by the rest workflow, and only since 3.582.0, so
 * every character that existed before that release had none —
 * `Number(null ?? 0)` gave 0, and 0 is a finite number smaller than 8.
 *
 * The gate was not reporting a short rest. It was reporting an ABSENCE
 * in the words of a short rest, and there was no way out of it except
 * taking again a rest the table had already taken in the fiction.
 */
eq("I4 an unrecorded rest is allowed rather than read as zero",
  dailyPreparationAllowed({ hoursRested: null, requiredHours: 8 }).allowed, true);
eq("I5 and it says that is what happened",
  dailyPreparationAllowed({ hoursRested: null, requiredHours: 8 }).unrecorded, true);
eq("I6 undefined is the same as null — a missing flag reads either way",
  dailyPreparationAllowed({ requiredHours: 8 }).allowed, true);
// A RECORDED ZERO IS INFORMATION AND IS STILL REFUSED. `|| 0` or a
// truthiness test would have folded it into "unrecorded" and handed the
// gate's own bug back in the fix for it.
eq("I7 a rest RECORDED as zero hours is still a refusal",
  dailyPreparationAllowed({ hoursRested: 0, requiredHours: 8 }),
  { allowed: false, short: 8, requiredHours: 8, unrecorded: false });
eq("I8 and a short rest is still refused, which is the rule itself",
  dailyPreparationAllowed({ hoursRested: 7, requiredHours: 8 }).allowed, false);

/*
 * I9 IS THE CHECK THAT WOULD ACTUALLY HAVE CAUGHT IT, and its absence is
 * the real lesson of this defect.
 *
 * `dailyPreparationAllowed` was never wrong. Handed 0 it correctly said
 * "not enough", and I1-I3 proved that from the day it shipped. The bug
 * was entirely in the CALLER, which turned a missing flag into a 0
 * before the rule ever saw it — so every check on the rule passed while
 * the table was locked out.
 *
 * A pure rule with a clean set of checks around it is worth nothing if
 * the one line that feeds it is unexamined. This asserts the feed.
 */
{
  const usesSrc = read("module", "uses-workflow.mjs");
  eq("I9 the caller passes a missing flag through as null, not as zero",
    /hoursRested: lastRest\?\.hours \?\? null,/.test(usesSrc), true);
  eq("I9b and it does not coerce it on the way",
    /hoursRested: Number\(lastRest\?\.hours \?\? 0\)/.test(usesSrc), false);
  eq("I9c and an unrecorded rest puts a line on the card rather than passing in silence",
    /if \(gate\.unrecorded\) \{/.test(usesSrc), true);
}

// "Spells with a duration of 24 hours or less end."
const spellEffect = (seconds) => ({
  duration: seconds === null ? {} : { seconds },
  flags: { "trg-prime": { spellEffect: true } }
});
eq("I4 an hour-long spell ends", spellEndsAtPreparation(spellEffect(3600)), true);
// LITERAL SECONDS, not `DAY_SECONDS` on both sides — the constant is
// what the page fixes at 24 hours, so a check that spells it out is the
// only one that notices the constant moving.
eq("I5 exactly a day ends", spellEndsAtPreparation(spellEffect(86400)), true);
eq("I5b and the constant is the day the page names", DAY_SECONDS, 86400);
eq("I6 a week does not", spellEndsAtPreparation(spellEffect(86401)), false);
/*
 * A PERMANENT SPELL SURVIVES — no duration is not "zero, which is less
 * than a day".
 *
 * BOTH SHAPES, because they fail differently. An ABSENT duration gives
 * NaN, and `NaN <= 86400` is already false, so dropping the guard leaves
 * that case answering correctly by accident; a duration recorded as ZERO
 * is the one that would start ending every permanent enchantment each
 * morning. I7 alone survived its own mutation until I7b was written.
 */
eq("I7 a spell with no duration is permanent, not instant",
  spellEndsAtPreparation(spellEffect(null)), false);
eq("I7b and one recorded as zero seconds is too",
  spellEndsAtPreparation(spellEffect(0)), false);
eq("I8 and something that is not a spell is not touched",
  spellEndsAtPreparation({ duration: { seconds: 60 }, flags: {} }), false);
ok("I9 the card says what ended", endedSpellsLine(["Mage Armour"]).includes("Mage Armour"));
ok("I9b and says so when nothing did", endedSpellsLine([]).includes("No spell"));

// The manual reminder is gone, and the gate is real.
{
  const uw = code("module", "uses-workflow.mjs");
  ok("I10 the 'handle manually' reminder is gone", !/handle manually/i.test(uw));
  ok("I11 the gate refuses rather than warning",
    /if \(!gate\.allowed\) \{[\s\S]{0,400}return postCard/.test(uw));
  ok("I12 and a rest records its own length",
    /setFlag\(SYSTEM_ID, "lastRest"/.test(code("module", "rest", "rest-workflow.mjs")));
}

/* ================================================================== */
/* J — THE FALLING SOFT LANDING (D10; R14 "Yes")                      */
/* ================================================================== */

eq("J1 the two figures the page prints", [SOFT_LANDING_FEET, DOVE_IN_FEET], [20, 30]);
// "when falling into 10-foot-deep water, you treat the fall as 10 feet
// shorter" — the book's own worked example.
eq("J2 the depth caps the reduction", softLandingReduction({ soft: true, depth: 10 }), 10);
eq("J3 and a deliberate dive is worth thirty", softLandingReduction({ soft: true, dove: true, depth: 50 }), 30);
eq("J4 a hard landing reduces nothing", softLandingReduction({ soft: false, depth: 100 }), 0);
{
  const landed = effectiveFallDistance(20, { soft: true, depth: 10, surface: "water" });
  eq("J5 the page's example, end to end", [landed.effective, fallingDamage(landed.effective)], [10, 5]);
  ok("J5b and the card can say why", landed.reasons.join(" ").includes("water"));
}
// "You can Grab an Edge (Climbing) as a reaction… treat the fall as
// though it were 20 feet shorter."
eq("J6 grabbing an edge is worth twenty",
  effectiveFallDistance(60, { grabbedAnEdge: true }).effective, 40);
eq("J7 a plain fall is unreduced", effectiveFallDistance(60, {}).effective, 60);

/* ================================================================== */
/* L — THE LIVE DEFECTS OF THIS BLOCK (3.582.0 → 3.582.1)             */
/* ================================================================== */

/*
 * Both found by driving the rows in a live world before this file was
 * written, which is the order blocks 21 and 22 have kept.
 */

// F1 — "If you are attacking with a BOW, the string has snapped." The
// first draft asked the weapon's NAME with `\bbow\b`, which does not
// match "Shortbow": a live drive broke the bow it should have restrung.
{
  const wf = code("module", "combat", "fumble-riders-workflow.mjs");
  ok("L1 a bow is identified by its group, as the Archer feat already does",
    /const group = String\(weapon\?\.system\?\.group \?\? ""\)/.test(wf)
    && /return group === "bow";/.test(wf),
    "asking the name alone fails on Shortbow");
  ok("L1b and the name fallback has no word boundary before 'bow'",
    /\/bow\\b\/i\.test/.test(wf) && !/\\bbow\\b/.test(wf));
}

// F2 — the no-Reactions effect carried a flag nothing read.
eq("L2 a fumble can block reactions", reactionBlockReason({ fumbled: true }), FUMBLE_REACTION_BLOCK);
eq("L2b and the older blocks still win where they apply",
  reactionBlockReason({ flatFooted: true, fumbled: true }).includes("Flat-Footed"), true);
eq("L3 the block is detected from the effect",
  fumbleBlocksReactions({ effects: [{ disabled: false, getFlag: (s, f) => f === "fumbleNoReactions" }] }), true);
eq("L3b and absent when there is none", fumbleBlocksReactions({ effects: [] }), false);
// A DISABLED EFFECT IS NOT A BLOCK. An empty list answers false under
// any predicate at all, so it proves nothing on its own; this is the
// case that asks the predicate to be the right one.
eq("L3c and a disabled one does not block",
  fumbleBlocksReactions({ effects: [{ disabled: true, getFlag: (s, f) => f === "fumbleNoReactions" }] }), false);
ok("L4 and the actor-facing gate asks for it",
  /fumbled: fumbleBlocksReactions\(actor\)/.test(code("module", "combat", "reactions.mjs")),
  "a state nothing consults is a state that does not exist");

/* ================================================================== */
/* K — THE WIRING, ASKED OF THE OTHER SIDE                             */
/* ================================================================== */

{
  const FILES = [
    ["module", "combat", "fumble-riders.mjs"],
    ["module", "combat", "fumble-riders-workflow.mjs"],
    ["module", "travel.mjs"],
    ["module", "sustenance.mjs"],
    ["module", "rest", "daily-preparation-gate.mjs"],
    ["module", "rest", "rest-workflow.mjs"],
    ["module", "uses-workflow.mjs"],
    ["module", "combat", "action-degrees.mjs"],
    ["module", "combat", "action-workflow.mjs"],
    ["module", "combat", "basic-action-conditions.mjs"],
    ["module", "combat", "reactions.mjs"],
    ["module", "combat", "falling.mjs"],
    ["module", "combat", "attack-workflow.mjs"]
  ];
  const exportsOf = (file) => {
    const src = fs.readFileSync(file, "utf8");
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const halves = part.split(/\s+as\s+/i);
        const name = (halves[1] ?? halves[0]).trim();
        if (name) names.add(name);
      }
    }
    return names;
  };
  let resolved = 0;
  const wrong = [];
  for (const parts of FILES) {
    const full = path.join(SYSTEM_ROOT, ...parts);
    const src = fs.readFileSync(full, "utf8");
    for (const pattern of [
      /(?:const|let)\s*\{([^}]+)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g,
      /import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g
    ]) {
      let match;
      while ((match = pattern.exec(src))) {
        const target = path.resolve(path.dirname(full), match[2]);
        if (!fs.existsSync(target)) { wrong.push(`${parts.join("/")} → ${match[2]} (no such file)`); continue; }
        const have = exportsOf(target);
        for (const raw of match[1].split(",")) {
          const name = raw.split(/\s+as\s+|:/i)[0].trim();
          if (!name) continue;
          resolved++;
          if (!have.has(name)) wrong.push(`${parts.join("/")}: "${name}" is not exported by ${match[2]}`);
        }
      }
    }
  }
  ok("K1 every named import resolves to a real export", wrong.length === 0, wrong.join("; "));
  ok("K2 and there were enough to mean something", resolved > 200, `only ${resolved} checked`);
}

// The fumble path reads the row's riders at all.
ok("K3 the fumble path applies the riders",
  /applyFumbleRiders\(actor, row/.test(code("module", "combat", "attack-workflow.mjs")));
/*
 * AND THE IMPORT, separately. Block 21's J12 was this same hole: a call
 * site satisfies a call-site check whatever it is calling, so a stubbed
 * local `const applyFumbleRiders = …` leaves K3 green while the riders
 * are never reached. The import is what makes the call the real one.
 */
ok("K3b and it is the real module it calls",
  /const \{ applyFumbleRiders \} = await import\("\.\/fumble-riders-workflow\.mjs"\)/
    .test(code("module", "combat", "attack-workflow.mjs")),
  "a call site proves nothing about what it calls");
// …and reads text durations through the same module the critical path uses.
ok("K4 and the fumble path gets the critical path's clocks too",
  /stampRowDurations\(tags, row\.effect/.test(code("module", "combat", "attack-workflow.mjs")));
/*
 * AND ITS OWN IMPORT, tied to its own call. Two branches of this file
 * now import the same function; a check that only asks whether the name
 * appears is satisfied by the other branch's line. That is precisely how
 * block 21's J12a went blind the moment this block was written.
 */
ok("K4b tied to the import in that branch, not the critical path's",
  /const \{ stampRowDurations \} = await import\("\.\/linked-conditions-workflow\.mjs"\);[\s\S]{0,200}?stampRowDurations\(tags, row\.effect/
    .test(code("module", "combat", "attack-workflow.mjs")),
  "an import somewhere in the file is not an import in this branch");
// A weapon's damage type is `system.damageType`, measured live.
ok("K5 the damage type is read from the field that holds it",
  /weapon\?\.system\?\.damageType/.test(code("module", "combat", "fumble-riders-workflow.mjs")));
// The break is recorded the way the system records one.
ok("K6 a break is hit points, not an invented flag",
  /breakItemValue\(current\)/.test(code("module", "combat", "fumble-riders-workflow.mjs"))
  && !/flags\.\$\{SYSTEM_ID\}\.broken/.test(code("module", "combat", "fumble-riders-workflow.mjs")));
// Allies come off the canvas, not out of game.actors.
ok("K7 allies are read from the canvas",
  /canvas\?\.tokens\?\.placeables/.test(code("module", "combat", "fumble-riders-workflow.mjs"))
  && !/game\.actors/.test(code("module", "combat", "fumble-riders-workflow.mjs")));

/* ================================================================== */
/* M — THE RULES REACH A PLAYER                                        */
/*                                                                     */
/* THE HOLE THE FIRST FULL SWEEP FOUND. `travel.mjs` and               */
/* `sustenance.mjs` shipped at 3.582.0 with thirty checks between them */
/* and NO PRODUCTION FILE IMPORTING EITHER — arithmetic verified       */
/* against all nine printed rows that no GM could reach from inside    */
/* Foundry, and two clocks nothing wound. `verify-rules-have-callers`  */
/* named all three uncalled exports; this section is the other half,   */
/* because a ratchet says an import exists and not that the rule is    */
/* reachable, correct, or asked at the right moment.                   */
/* ================================================================== */

{
  const party = [
    { name: "Slow", speed: 20 },
    { name: "Quick", speed: 40 }
  ];
  const body = travelCardBody(party, "normal", 16);
  // The party is paced by its slowest: 20 → 200 ft/min, 2 mph, 16 miles a day.
  ok("M1 the card names the slowest as the pace", /paced by <strong>Slow<\/strong>/.test(body));
  ok("M2 and prints that pace's three figures", /200 feet a minute/.test(body)
    && /2 mph/.test(body) && /16 miles a day/.test(body), body.slice(0, 200));
  // 16 miles at 16 miles a day is one day, and 8 hours of it.
  ok("M3 a journey is answered in days and hours", /1 day/.test(body) && /8 hours of travel/.test(body),
    body.slice(0, 400));
  // EVERY MEMBER IS LISTED, not only the one who sets the pace — the GM
  // needs to see who is holding the party up to decide what to do about it.
  ok("M4 every traveller has a row", /<td>Quick<\/td>/.test(body) && /<td>Slow<\/td>/.test(body));
  // Difficult terrain halves the answer, through the same card.
  ok("M5 terrain divides the card's figures",
    /8 miles a day/.test(travelCardBody(party, "difficult", 0)));
  ok("M6 and an empty party says so rather than dividing by nothing",
    /No one in the party/.test(travelCardBody([], "normal", 0)));
}

// THE SPEED IS READ THROUGH THE POOL READER. `system.combat.movement.land`
// is a pool, and `Number(pool)` is NaN — the mistake `verify-speed-pool`
// exists because of.
{
  const dialog = code("module", "travel-dialog.mjs");
  ok("M7 the land speed comes through speedValue",
    /speedValue\(actor\?\.system\?\.combat\?\.movement\?\.land\)/.test(dialog),
    "reading the pool as a number is NaN, not a Speed");
  ok("M8 and the GM can reach it — a toolbar button calls the dialog",
    /openTravelDialog\(\)/.test(code("scripts", "trg-prime.mjs"))
    && /title: "Travel"/.test(code("scripts", "trg-prime.mjs")),
    "a dialog nothing opens is the same hole in a different file");
}

// THE SUSTENANCE CLOCKS, on the two clocks that move.
{
  ok("M9 a fed day quotes the page's own range",
    /1–2 lb/.test(sustenanceLine({ daysWithoutFood: 0, daysWithoutWater: 0 })));
  ok("M10 a hungry day is counted out loud",
    /3<\/strong> days short of food/.test(sustenanceLine({ daysWithoutFood: 3, daysWithoutWater: 0 })));
  ok("M11 and a dry one says the hourly checks start",
    /every hour/.test(sustenanceLine({ daysWithoutFood: 0, daysWithoutWater: 1 })));

  const rest = code("module", "rest", "rest-workflow.mjs");
  /*
   * ONLY A FULL NIGHT ADVANCES THE DAY. Gating on anything shorter
   * starves a party that caught its breath four times in an afternoon —
   * and `wholeHours` rather than `realHours` is the tranced Elf, who
   * rests four hours and receives a full night.
   */
  ok("M12 a day passes only on a full rest",
    /if \(wholeHours >= restHours\) \{/.test(rest),
    "a one-hour breather must not cost a day's rations");
  ok("M13 and the rest asks the sustenance module for it",
    /advanceSustenanceDay\(actor, \{ ate, drank \}\)/.test(rest));
  ok("M14 the dialog asks whether they ate and drank",
    /name="ate-\$\{actor\.id\}" checked/.test(rest) && /name="drank-\$\{actor\.id\}" checked/.test(rest),
    "defaulted on, because the common case is a party with rations");
  ok("M15 and the answers reach the rest itself",
    /ate: Boolean\(result\[`ate-\$\{actor\.id\}`\]\)/.test(rest)
    && /drank: Boolean\(result\[`drank-\$\{actor\.id\}`\]\)/.test(rest),
    "a checkbox nothing reads is decoration — block 22's F2 in another file");
  ok("M16 the card says what the day cost",
    /for \(const said of summary\.sustenanceLines \?\? \[\]\) lines\.push\(summaryLine\(said\)\)/.test(rest));

  const script = code("scripts", "trg-prime.mjs");
  ok("M17 the hourly check rides the world clock",
    /sweepSustenanceHours\(actor, worldTime\)/.test(script),
    "an hourly rule needs an hourly tick");
  ok("M18 gated by the module's own predicate, not a flag name copied into the script",
    /if \(isDehydrated\(actor\)\) \{/.test(script));

  const wf = code("module", "sustenance-workflow.mjs");
  /*
   * THE STAMP MOVES BY WHAT WAS CHARGED, not to `worldTime`. A GM who
   * advances the clock ninety minutes owes one check and keeps the spare
   * half hour; moving the stamp to now throws the remainder away every
   * nudge, so two ninety-minute jumps would owe two checks instead of
   * three.
   */
  ok("M19 the water stamp keeps its remainder",
    /waterClockAt: since \+ \(checks \* WATER_INTERVAL_SECONDS\)/.test(wf),
    "moving the stamp to now loses every part-hour");
  // The day that crosses the threshold costs no hourly check — the page
  // says the hourly clock BEGINS then.
  ok("M20 the crossing day starts the clock rather than charging for it",
    /hoursSinceWaterFailed: 0\n\s*\}\);/.test(wf) || /hoursSinceWaterFailed: 0,/.test(wf));
}

/* ================================================================== */
/* N — THE LIVE DEFECTS OF 3.582.1 → 3.582.2                           */
/*                                                                     */
/* BOTH FOUND BY DRIVING, NEITHER VISIBLE TO A SOURCE PATTERN.         */
/* ================================================================== */

{
  const wf = code("module", "combat", "fumble-riders-workflow.mjs");
  /*
   * F4. `alliesOf` filtered on DISPOSITION ALONE, so "reroll this attack
   * against a randomly selected ally WITHIN RANGE" reached every
   * friendly token on the scene. Driven live, a sabre swung in an empty
   * corridor gashed a player character five hundred feet away — and the
   * row's own fallback, "if no allies are within range you inflict a
   * Critical Injury to yourself", could therefore never fire while any
   * ally stood anywhere on the map.
   *
   * The card had said "within range" since the rider was written. Nothing
   * had ever asked how far that was.
   */
  ok("N1 the ally search measures a distance at all",
    /distanceBetween\(ownToken, token\) <= maxFeet/.test(wf),
    "disposition is not a range");
  ok("N2 through the system's own measure, imported not reimplemented",
    /import \{ distanceBetween \} from "\.\/geometry\.mjs";/.test(wf)
    && /import \{ weaponReachExtension \} from "\.\/attack\.mjs";/.test(wf),
    "a second distance function is a second thing that can disagree");
  ok("N3 and the range comes from the attack that fumbled",
    /const rangeFeet = attackRangeFeet\(actor, weapon\);/.test(wf)
    && /alliesOf\(actor, rangeFeet\)/.test(wf));
  // A ranged weapon reaches six increments; melee reaches its reach.
  ok("N4 a missile weapon reaches six increments",
    /return increment > 0 \? increment \* SIX_INCREMENTS : ADJACENT_FEET;/.test(wf));
  ok("N5 a melee weapon reaches its reach plus the Reach trait",
    /return reach \+ weaponReachExtension\(system\);/.test(wf));
  /*
   * NO TOKEN, NO RANGE. An actor with nothing on the canvas cannot be
   * measured from, and the honest answer sends the row down its printed
   * fallback — which hurts the fumbler. Guessing the other way reaches
   * out and hurts somebody else's character, which is the defect.
   */
  ok("N6 an actor with no token finds no allies rather than all of them",
    /if \(!ownToken\) return \[\];/.test(wf),
    "the safe direction is the one that hurts the fumbler");
  // BOTH SENTENCES, COUNTED. There are two places that say it — the
  // self-crit fallback and the row with no fallback — and a check that
  // the phrase appears *somewhere* is satisfied by either. That is the
  // third time this shape has been caught in this block alone.
  eq("N7 and BOTH cards name the distance it measured",
    (wf.match(/No ally within \$\{rangeFeet\} ft/g) ?? []).length, 2);
}

{
  const wf = code("module", "sustenance-workflow.mjs");
  /*
   * F5. `Number(null)` is 0, and 0 is finite — so a cleared water clock
   * read back as the epoch rather than as "no clock". It never reached
   * an answer, because the sweep returns early while the character is
   * hydrated; it is filed because `state.waterClockAt === null` was
   * already false for every cleared clock in the world, and the next
   * caller to ask would have been wrong.
   */
  ok("N8 a cleared water clock reads back as no clock",
    /stored === null \|\| stored === undefined \|\| stored === ""/.test(wf),
    "Number(null) is 0, and 0 is a finite number");
}

/* ================================================================== */

process.stdout.write(failures
  ? `\nverify-chapter8-221-230: FAILED — ${failures} of ${checks} checks.\n`
  : `\nverify-chapter8-221-230: OK — ${checks} checks. Pages 221-230: the fumble riders, travel, movement speeds, sustenance, preparation and falling.\n`);
process.exit(failures ? 1 : 0);
