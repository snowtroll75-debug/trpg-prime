#!/usr/bin/env node
/**
 * verify-region-expiry — a spell's area gets an ending.
 *
 * NEW at 3.500.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HALF 3.480.0 DID NOT DO. It made an UNCLAIMED Region temporary and
 * stopped 113 spells littering the scene; nothing ever deleted a CLAIMED
 * one. Six spells claim theirs, and every one prints a finite duration —
 * Consecrate a day, Verdant Retribution a minute — so each left a Region
 * on the canvas for ever.
 *
 * SECTION E IS THE ARITHMETIC, and it is deliberately thin: the stamp is
 * `endsStamp` and the test is `endsHaveElapsed`, both written for
 * emanations at 3.430.0. What is checked here is that this file ASKS
 * them rather than growing a copy.
 *
 * SECTION U IS THE ONE THAT MATTERS MOST AND LOOKS LEAST LIKE A FEATURE:
 * AN UNSTAMPED REGION IS NEVER TOUCHED. Litter is invisible and annoying;
 * a GM's hand-placed Region deleted on a clock nobody set is a rules
 * dispute mid-fight. The sweep's permission is the flag.
 *
 * SECTION C IS THE PACK, and it is a ratchet in both directions: the six
 * claimants must still claim, and each must still print a duration this
 * can count. A seventh claimant with an uncountable duration would be a
 * new permanent Region, and this is where that gets noticed.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { warpedDurationText } from "../module/magic/active-spells.mjs";
import {
  REGION_EXPIRY_FLAG, regionExpiryRecord, normaliseRegionExpiry,
  regionHasExpired, expiredRegions, regionExpiredLine
} from "../module/magic/region-expiry.mjs";
import { endsStamp } from "../module/magic/spell-ends.mjs";
import { REGION_CLAIMING_KINDS } from "../module/magic/area-region-life.mjs";
import { parseSpellDuration } from "../module/magic/spell-effects.mjs";

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
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const CAST = read("module", "magic", "cast-workflow.mjs");
const COMBAT = read("module", "documents", "combat.mjs");
const SCRIPT = read("scripts", "trg-prime.mjs");
const FLOW = read("module", "magic", "region-expiry-workflow.mjs");

/* ================================================================== *
 * R. THE RECORD
 * ================================================================== */

const rec = regionExpiryRecord({
  castId: "abc", spellName: "Spike Stones",
  ends: { endsAtWorldTime: 3600, endsOnRound: null }
});
ok("R1 the record reads back whole",
  rec.castId === "abc" && rec.spellName === "Spike Stones" && rec.ends.endsAtWorldTime === 3600);
equal("R2 a nameless spell still gets a name", regionExpiryRecord({}).spellName, "A spell",
  "the sweep prints it, and \"undefined's area disperses\" is a bug report");
// R3 THE REFUSAL `endsStamp` ALREADY MAKES, repeated here because a
// record is written from a stamp that may be null.
equal("R3 A STAMP OF TWO NULLS IS NOT A CLOCK",
  regionExpiryRecord({ ends: { endsAtWorldTime: null, endsOnRound: null } }).ends, null,
  "storing one would leave the sweep asking about it for ever");
equal("R4 no stamp at all is no clock", regionExpiryRecord({ ends: null }).ends, null);
ok("R5 a Region that is not ours normalises to nothing",
  normaliseRegionExpiry(null) === null);
// R6 THE ID IS FOR TRACING, NOT PERMISSION. A Region placed before this
// release carries no castId and is still ours to expire if it has a clock.
ok("R6 a record with no castId is still a record",
  normaliseRegionExpiry({ spellName: "Consecrate", ends: { endsAtWorldTime: 10, endsOnRound: null } })
    ?.ends?.endsAtWorldTime === 10);

/* ================================================================== *
 * E. THE TWO CLOCKS
 * ================================================================== */

const minute = regionExpiryRecord({
  spellName: "Verdant Retribution",
  ends: endsStamp({ seconds: 60, rounds: 10, worldTime: 1000, round: 3 })
});

ok("E1 not yet, on either clock",
  regionHasExpired(minute, { worldTime: 1030, round: 8 }) === false);
ok("E2 THE WORLD CLOCK REACHES IT",
  regionHasExpired(minute, { worldTime: 1060, round: null }),
  "a Region placed in a corridor gets no rounds to count");
ok("E3 THE ROUND CLOCK REACHES IT",
  regionHasExpired(minute, { worldTime: null, round: 13 }),
  "Consecrate's day will never elapse inside a combat, and a minute may never see the world move");
ok("E4 an unstamped Region never expires",
  regionHasExpired(regionExpiryRecord({ spellName: "x" }), { worldTime: 999999, round: 999 }) === false);
ok("E5 no record at all never expires",
  regionHasExpired(null, { worldTime: 999999, round: 999 }) === false);
// E6 THE ARITHMETIC IS BORROWED, NOT COPIED.
ok("E6 the elapsed test is the one spell-ends.mjs owns",
  read("module", "magic", "region-expiry.mjs").includes("endsHaveElapsed(normaliseRegionExpiry(record)?.ends"),
  "a second copy agrees with the first only until somebody edits one");

/* ================================================================== *
 * U. WHAT THE SWEEP WILL NOT TOUCH
 * ================================================================== */

const rows = [
  { id: "expired", record: regionExpiryRecord({ spellName: "Spike Stones", ends: { endsAtWorldTime: 100, endsOnRound: null } }) },
  { id: "running", record: regionExpiryRecord({ spellName: "Consecrate", ends: { endsAtWorldTime: 90000, endsOnRound: null } }) },
  { id: "unstamped", record: null },
  { id: "clockless", record: { spellName: "Forget", ends: null } }
];
const gone = expiredRegions(rows, { worldTime: 500, round: null });
equal("U1 exactly one of the four goes", gone.length, 1);
equal("U2 and it is the expired one", gone[0]?.id, "expired");
equal("U3 the name travels with it", gone[0]?.spellName, "Spike Stones",
  "a Region vanishing with no line is indistinguishable from something having broken");
// U4 IS THE ONE THAT MATTERS MOST. A GM's own Region carries no flag.
ok("U4 AN UNSTAMPED REGION IS NEVER TOUCHED",
  gone.some((g) => g.id === "unstamped") === false,
  "the sweep's permission IS the flag: no flag, no opinion");
ok("U5 nor one whose duration nothing can count",
  gone.some((g) => g.id === "clockless") === false,
  "\"varies\" has no end anybody can compute");
ok("U6 a row with no id is ignored rather than deleted",
  expiredRegions([{ record: rows[0].record }], { worldTime: 500 }).length === 0);
ok("U7 nothing at all sweeps nothing",
  expiredRegions(null, { worldTime: 500 }).length === 0
  && expiredRegions([], { worldTime: 500 }).length === 0);

/* ================================================================== *
 * W. WHERE IT IS WIRED
 * ================================================================== */

ok("W1 THE STAMP IS ON THE KEEP BRANCH, not the clear one",
  CAST.includes("} else if (placedArea?.regionId && !emanationIsLive(spellData)) {"),
  "a stamped Region that was about to be deleted anyway is a flag nobody reads");
ok("W2 A LIVE EMANATION IS EXCLUDED",
  CAST.includes("!emanationIsLive(spellData)"),
  "emanation-workflow already deletes its Region; a second clock on one document "
  + "is the two-clocks defect 3.476.0 paid for on effects");
/*
 * W3 MOVED AT 3.521.0, and it moved because the rule did. Six places
 * each carried their own `warpMods?.durationText || spellData.duration`;
 * they now all ask `warpedDurationText`, which additionally carries a
 * printed (D) forward. This still reads the source, because "the Region
 * stamp uses the warped duration and not the printed one" is a claim
 * about WHICH VALUE one workflow line passes — but W3b beneath it runs
 * the rule, so a neutered resolver fails here even if the call site is
 * spelled correctly.
 */
ok("W3 the stamp uses the warped duration",
  CAST.includes("parseSpellDuration(warpedDurationText(spellData?.duration, warpMods))"),
  "a warp that buys a longer duration must buy a longer Region with it");
ok("W3b AND THE WARPED DURATION IS REALLY THE LONGER ONE",
  parseSpellDuration(warpedDurationText("1 minute", { durationText: "10 minutes" }))?.seconds === 600
  && parseSpellDuration(warpedDurationText("1 minute", {}))?.seconds === 60,
  "run rather than matched — a check that only greps passes while the rule is neutered in place");
// W4/W5 ASSERT THE IMPORT AS WELL AS THE CALL, and that is not belt and
// braces. Checking only the call site let `mutate-region-expiry` replace
// each import with a local stub returning nothing: the call stayed, the
// text matched, and neither clock swept a thing.
ok("W4 THE ROUND CLOCK SWEEPS",
  COMBAT.includes("sweepRegionExpiry(canvas?.scene ?? null")
  && COMBAT.includes("await import(\"../magic/region-expiry-workflow.mjs\")"));
ok("W5 THE WORLD CLOCK SWEEPS TOO",
  SCRIPT.includes("sweepRegionExpiry(canvas?.scene ?? null")
  && SCRIPT.includes("await import(\"../module/magic/region-expiry-workflow.mjs\")"),
  "whichever clock is moving is the one that reaches the mark");
ok("W6 the world-clock sweep is outside the per-actor loop",
  SCRIPT.indexOf("sweepRegionExpiry") < SCRIPT.indexOf("const actors = new Set(game.actors"),
  "a Region belongs to the canvas, not to a character — sweeping it once per actor "
  + "would ask the same question forty times and print the line forty times");
ok("W7 a clockless Region is never stamped",
  FLOW.includes("if (!record.ends) return false;"),
  "claiming it for a sweep that can never act on it is a flag nobody reads");
// W8 NAMES BOTH ENDS. Asking only whether the constant APPEARS in the
// file passed while the sweep read a hand-typed literal — the stamp's own
// use of it kept the text present.
ok("W8 the sweep reads the flag the stamp writes",
  FLOW.includes("setFlag(SYSTEM_ID, REGION_EXPIRY_FLAG")
  && FLOW.includes("getFlag?.(SYSTEM_ID, REGION_EXPIRY_FLAG)"),
  "a stamp and a sweep naming different flags is a Region nobody collects");
equal("W9 the flag name both ends use", REGION_EXPIRY_FLAG, "spellRegion");

/* ================================================================== *
 * C. THE SIX CLAIMANTS
 * ================================================================== */

const claimants = [];
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.type !== "spell") continue;
    const rowsOf = Array.isArray(value.system?.effects) ? value.system.effects : [];
    if (!rowsOf.some((r) => REGION_CLAIMING_KINDS.includes(String(r?.kind ?? "")))) continue;
    claimants.push({ name: value.name, duration: String(value.system?.duration ?? "") });
  }
} finally {
  await db.close().catch(() => {});
}

// C1 WAS SIX AT 3.500.0 AND IS EIGHT AT 3.501.0. Verdant Snare and Warped
// Terrain joined as the terrain pair, and the count is exact rather than a
// minimum for the reason the whole file exists: a claimant that arrives
// without being noticed is a Region that stays on the scene for ever.
// This check is what made the pair declare a duration each.
// 8 -> 10 AT 3.589.0: False Mire and Entangle, the block-27 difficult
// terrains. Both print a countable "1 minute", which is what C2 below
// exists to insist on — a claimant whose duration cannot be counted is a
// Region that stays on the scene for ever.
// 10 -> 11 AT 3.590.0: ICE SLICK, and it is the one that earned C2 its
// keep. The page prints NO Duration line at all \u2014 the whole entry is
// "slick ice coats the area, causing it to become difficult terrain" \u2014
// so the moment the terrain row was authored, this file reported a
// claimant with nothing to count and C3 reported it as permanent by
// design. Neither was noticed by reading the page; both were noticed by
// placing the thing. Graham ruled 1 minute on 25 September 2026, on the
// comparison with Warped Terrain, False Mire and Entangle, and the
// difference from the book is declared in verify-spell-book-fields.
// 11 -> 13 AT 3.608.0: STONE CALL and SOLID FOG, block 32's R7. Both
// print a countable "1 minute".
// 13 -> 14 AT 3.609.0: PORTAL MAELSTROM's difficult terrain (block 33's
// R2), which prints a countable "1 minute".
// 14 -> 23 AT 3.610.0 (R9): the nine walls and Storm Of Vengeance claim the
// Region they place (Storm Of Vengeance prints "sustained (1 minute)"; the
// walls 1 or 10 minutes) — less Wall Of Thorns, already counted for its hazard.
// 23 -> 24 AT 3.612.0 (block 34's R6): WEB, whose Region carries its
// difficult terrain and its entry check; it prints "1 minute".
ok("C1 the claimants are still the twenty-four that were measured",
  claimants.length === 24,
  `found ${claimants.length}: ${JSON.stringify(claimants.map((c) => c.name))}`);
// C2 IS THE RATCHET WITH TEETH. A claimant whose duration this cannot
// count is a new permanent Region, and it would arrive silently.
const uncountable = claimants.filter((c) => {
  const parsed = parseSpellDuration(c.duration);
  return !(parsed?.seconds != null || parsed?.rounds != null);
});
ok("C2 EVERY CLAIMANT PRINTS A DURATION THIS CAN COUNT",
  uncountable.length === 0,
  `uncountable: ${JSON.stringify(uncountable)}`);
ok("C3 not one of them is permanent by design",
  claimants.every((c) => c.duration.trim().length > 0),
  "the Region was claimed because the mechanism reads it, and the mechanism stops "
  + "when the spell does");

/* ================================================================== *
 * D. WHAT IT SAYS
 * ================================================================== */

ok("D1 the line names the spell", regionExpiredLine("Spike Stones").includes("Spike Stones"));
ok("D2 and says why it went", /duration is spent/.test(regionExpiredLine("x")));

if (failures.length) {
  process.stderr.write(`verify-region-expiry: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-region-expiry: OK — ${checks} checks. Six spells that claimed a Region for ever `
  + "now get an ending on whichever clock is moving, and an unstamped Region is still "
  + "nobody's to delete.\n");
