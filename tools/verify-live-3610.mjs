#!/usr/bin/env node
/**
 * verify-live-3610 — what the 3.610.0 live drive found.
 *
 * NEW at 3.610.1. `claude/live-testing-report-3.610.0.md` has the drive.
 *
 *   A  F1  a save after the cast deals its damage (null is no total)
 *   B  F2  the storm strikes on the first Sustain each round only
 *   C  G1  the card names a thickness and a ring properly
 *   D  G2  a dissipated wall leaves no terrain line and no notes
 *
 * Where the behaviour needs Foundry (a roll, a Region) the check reads the
 * source in the shape that carries it, with a behaviour test beside it
 * wherever the rule is pure.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { normaliseWall, wallAreaConfig, wallRaisedLine } from "../module/magic/wall-spell.mjs";
import { stormStruckThisRound } from "../module/magic/storm.mjs";
import { describeArea } from "../module/magic/spell-template.mjs";

// describeArea reads the scene's units; outside Foundry there is no canvas.
globalThis.canvas ??= { dimensions: { units: "ft" } };

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const hit = read("module", "magic", "area-save-workflow.mjs");
const stormFlow = read("module", "magic", "storm-workflow.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");

/* ================================================================== *
 * A. F1 — null is no total
 * ================================================================== */
{
  ok("A1 basicSaveHit treats a null or missing total as 'roll it here'",
    /const given = amount === null \|\| amount === undefined \|\| amount === "" \? NaN : Number\(amount\);/.test(hit),
    "Number(null) is 0: every wall crossing, turn save and lightning bolt dealt nothing");
  ok("A2 the formula is rolled when no total was given",
    /let base = given;\s*\n\s*if \(!Number\.isFinite\(base\)\) base = formula \? \(await new Roll\(formula\)\.evaluate\(\)\)\.total : 0;/.test(hit));
  ok("A3 nothing reads Number(amount) bare any more", !/let base = Number\(amount\);/.test(hit));
  // The rule itself, as the function now reads it.
  const resolve = (amount) => (amount === null || amount === undefined || amount === "" ? NaN : Number(amount));
  ok("A4 null, undefined and '' are no total; 0 and 20 are totals",
    Number.isNaN(resolve(null)) && Number.isNaN(resolve(undefined)) && Number.isNaN(resolve(""))
    && resolve(0) === 0 && resolve(20) === 20);
  // The callers that leave the roll to it really do pass nothing.
  const walls = read("module", "magic", "wall-spell-workflow.mjs");
  ok("A5 the wall's crossing and turn saves leave the roll to basicSaveHit",
    (walls.match(/basicSaveHit\(\{/g) ?? []).length >= 2 && !/amount: 0/.test(walls));
  ok("A6 the storm's lightning passes amount null, so each bolt is rolled",
    /let amount = null;/.test(stormFlow) && /formula: mode\.formula, amount, type: mode\.type/.test(stormFlow));
}

/* ================================================================== *
 * B. F2 — the first Sustain each round
 * ================================================================== */
{
  ok("B1 no round (out of combat): every Sustain strikes",
    stormStruckThisRound(3, null) === false && stormStruckThisRound(undefined, null) === false);
  ok("B2 a storm that has not yet struck on a Sustain strikes",
    stormStruckThisRound(undefined, 2) === false && stormStruckThisRound("", 2) === false && stormStruckThisRound(null, 2) === false
    // and in a round numbered 0, where Number(null) would otherwise match
    && stormStruckThisRound(null, 0) === false && stormStruckThisRound("", 0) === false);
  ok("B3 the same round: no second strike", stormStruckThisRound(2, 2) === true && stormStruckThisRound("2", 2) === true);
  ok("B4 the next round: it strikes again", stormStruckThisRound(2, 3) === false);
  ok("B5 stormOnSustain asks before the mode prompt",
    /if \(stormStruckThisRound\(record\.sustainRound, round\)\) \{/.test(stormFlow)
    && stormFlow.indexOf("stormStruckThisRound(record.sustainRound, round)") < stormFlow.indexOf("const mode = await promptStormMode(spec, record.last, record.label);"));
  ok("B6 the round is read from a started combat only",
    /const round = game\.combat\?\.started \? Number\(game\.combat\.round\) : null;/.test(stormFlow));
  ok("B7 the round is remembered with the strike",
    /if \(round !== null\) record\.sustainRound = round;\s*\n\s*const lines = await stormStrike\(actor, region, record, mode\);/.test(stormFlow)
    && /setFlag\(SYSTEM_ID, STORM_FLAG, \{ \.\.\.record, last: mode\.key/.test(stormFlow),
    "the record is written back whole, so the round rides with it");
}

/* ================================================================== *
 * C. G1 — the card's words
 * ================================================================== */
{
  const force = normaliseWall({ kind: "wall", length: 20, height: 10, thickness: "no discernible thickness" });
  const blades = normaliseWall({ kind: "wall", length: 20, height: 10, thickness: "5 feet" });
  ok("C1 Wall Of Force's thickness is shown as printed",
    wallRaisedLine(force, { form: "line", lengthFeet: 20 }, "Wall Of Force").includes("(no discernible thickness)"),
    wallRaisedLine(force, { form: "line", lengthFeet: 20 }, "Wall Of Force"));
  ok("C2 a plain thickness still says thick",
    wallRaisedLine(blades, { form: "line", lengthFeet: 20 }, "Wall Of Blades").includes("(5 feet thick)"));
  const ice = normaliseWall({ kind: "wall", length: 20, height: 10, forms: ["line", "ring"], ringRadius: 10 });
  ok("C3 a ring's area is a ring", describeArea(wallAreaConfig(ice, { form: "ring" })) === "10 ft radius ring",
    describeArea(wallAreaConfig(ice, { form: "ring" })));
  ok("C4 a line's area is unchanged", describeArea(wallAreaConfig(ice, { form: "line" })) === "20 ft wall"
    && describeArea(wallAreaConfig(ice)) === "20 ft wall");
  ok("C5 the cast re-describes the area once a ring is chosen",
    cast.includes("if (wallSpec && placed?.form === \"ring\") Object.assign(areaConfig, wallAreaConfig(wallSpec, placed));")
    && cast.indexOf("Object.assign(areaConfig, wallAreaConfig(wallSpec, placed))") < cast.indexOf("template placed — "));
}

/* ================================================================== *
 * D. G2 — a dissipated wall
 * ================================================================== */
{
  const wallAt = cast.indexOf("for (const said of await raiseWall(region, wallSpec, placedArea, {");
  const terrainAt = cast.indexOf("if (row?.kind !== \"difficultTerrain\" || !placedArea?.regionId) continue;");
  const hazardAt = cast.indexOf("if (row?.kind !== \"hazard\" || !placedArea?.regionId) continue;");
  ok("D1 the wall is raised before its terrain is laid", wallAt > 0 && terrainAt > 0 && wallAt < terrainAt,
    "a dissipated Wall Of Thorns told the card its ground was difficult terrain");
  ok("D2 and before its hazard", wallAt < hazardAt);
  ok("D3 a wall that took its Region with it says so",
    /placedArea = \{ \.\.\.placedArea, regionId: null \};\s*\n\s*wallDissipated = true;/.test(cast));
  ok("D4 its notes are not printed",
    // 3.622.0: wrapped once more, by a blocked self-cast polymorph (block 39's R11).
    cast.includes("effects: (wallDissipated ? (effEffects ?? []).filter((r) => r?.kind !== \"note\") : effEffects)"));
  ok("D5 the flag starts false for every cast", /let placedArea = null;\n[^\n]*\n  let wallDissipated = false;/.test(cast));
}

if (failures.length) {
  console.log(`verify-live-3610: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-live-3610: OK — ${checks} checks. The four things the 3.610.0 drive found, each fixed where it happened.`);
