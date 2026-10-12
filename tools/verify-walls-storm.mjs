#!/usr/bin/env node
/**
 * verify-walls-storm — the nine walls and Storm Of Vengeance (3.610.0).
 *
 * Block 33's R9 (Graham, 1 October 2026: "As recommended"): a wall is
 * placed anywhere in range and turned freely; it carries the riders its
 * page prints; Force, Stone, Ice and Thorns are real Foundry Walls; section
 * HP is tracked by hand. Storm Of Vengeance: one of five strikes at the
 * cast and at each Sustain, never the same twice running.
 *
 *   A  the wall row, normalised
 *   B  the geometry: what is in a wall, where it ends, what a move crosses
 *   C  the card
 *   D  the storm
 *   E  the pack and the manifest
 *   F  the wiring — where each rule is read
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  WALL_FLAG, normaliseWall, pathEntersWall, segmentSamples, snapPoint, wallAreaConfig, wallBlocksLine,
  wallContains, wallEnd, wallObstructedLine, wallRaisedLine, wallRegionShapes, wallRiderLines,
  wallSectionLine, wallSegments
} from "../module/magic/wall-spell.mjs";
import {
  STORM_FLAG, normaliseStorm, spanSeconds, stormModesOffered, stormStrikeLine, thunderImmune
} from "../module/magic/storm.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { templateContains } from "../module/magic/spell-template.mjs";
import { spellSavesOnTurnStart } from "../module/magic/turn-save.mjs";
import { REGION_CLAIMING_KINDS, areaRegionIsClaimed } from "../module/magic/area-region-life.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { SELF_REPORTING_KINDS } from "../module/magic/cast-result-line.mjs";
import { PLAN, plannedFields } from "./block33-walls-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ================================================================== *
 * A. The wall row
 * ================================================================== */
{
  const fire = normaliseWall({ kind: "wall", length: 20, height: 10, thickness: "5 feet", forms: ["line", "ring"],
    ringRadius: 10, crossing: true, turn: "startOfTurn", screen: true });
  ok("A1 a wall reads its length and height", fire?.lengthFeet === 20 && fire?.heightFeet === 10);
  ok("A2 a wall may offer a line and a ring", deepEqual(fire?.forms, ["line", "ring"]) && fire?.ringRadiusFeet === 10);
  ok("A3 a centre wall's space is a 5-foot strip", fire?.snap === "centre" && fire?.stripFeet === 5);
  ok("A4 the riders come through", fire?.crossing && fire?.turn === "startOfTurn" && fire?.screen && !fire?.wind);
  const warped = normaliseWall({ kind: "wall", length: 20, forms: ["line", "ring"], ringRadius: 10,
    sections: { size: 10, hardness: 5, hp: 40 } }, { wallLength: 20, wallRadius: 5, wallHp: 10 });
  ok("A5 the length warp lengthens it", warped?.lengthFeet === 40);
  ok("A6 the ring warp widens the ring", warped?.ringRadiusFeet === 15);
  ok("A7 the HP warp strengthens each section", warped?.sections?.hp === 50 && warped?.sections?.hardness === 5);
  const stone = normaliseWall({ kind: "wall", length: 20, snap: "border",
    block: { move: "normal", sight: "normal", light: "normal", sound: "normal" }, unobstructed: true });
  ok("A8 a border wall's space is the line itself", stone?.snap === "border" && stone?.stripFeet === 1);
  ok("A9 what it blocks is Foundry's own numbers", deepEqual(stone?.block, { move: 20, sight: 20, light: 20, sound: 20 }));
  ok("A10 and it must form in open space", stone?.unobstructed === true);
  const force = normaliseWall({ kind: "wall", length: 20, snap: "border", block: { move: "normal", sight: "none" } });
  ok("A11 an invisible wall blocks movement and not sight", force?.block?.move === 20 && force?.block?.sight === 0);
  const thorns = normaliseWall({ kind: "wall", length: 20, block: { move: "none", sight: "limited" } });
  ok("A12 brambles block sight partly and movement not at all", thorns?.block?.move === 0 && thorns?.block?.sight === 10);
  ok("A13 a wall that blocks nothing has no block", normaliseWall({ kind: "wall", length: 20, block: { move: "none" } })?.block === null);
  ok("A14 a row of another kind is not a wall", normaliseWall({ kind: "hazard", length: 20 }) === null);
  ok("A15 a wall of no length is refused", normaliseWall({ kind: "wall", length: 0 }) === null);
  ok("A16 a ring with no radius is refused", normaliseWall({ kind: "wall", length: 20, forms: ["ring"] }) === null);
  ok("A17 an unknown turn is no turn", normaliseWall({ kind: "wall", length: 20, turn: "whenever" })?.turn === null);
  ok("A18 the area config is a wall of the wall's length",
    deepEqual(wallAreaConfig(fire), { t: "wall", distance: 20, shape: "wall" }) && wallAreaConfig(null) === null);
}

/* ================================================================== *
 * B. Geometry
 * ================================================================== */
{
  const px = { pxPerFt: 20 };
  const line = { t: "wall", form: "line", x0: 150, y0: 150, x1: 450, y1: 150, widthFeet: 5 };
  ok("B1 a square the line runs through is in the wall", wallContains(line, { x: 250, y: 150 }, px));
  ok("B2 the square beside it is not", !wallContains(line, { x: 250, y: 250 }, px));
  ok("B3 nor a square past its end", !wallContains(line, { x: 550, y: 150 }, px));
  const ring = { t: "wall", form: "ring", x: 500, y: 500, radius: 200, widthFeet: 5 };
  ok("B4 a point on the ring is in the wall", wallContains(ring, { x: 700, y: 500 }, px));
  ok("B5 the ring's middle is not", !wallContains(ring, { x: 500, y: 500 }, px));
  ok("B6 a template that is not a wall contains nothing here", !wallContains({ t: "circle", x: 0, y: 0 }, { x: 0, y: 0 }, px));
  ok("B7 the template rule asks the wall's rule", templateContains(line, { x: 250, y: 150 }, px)
    && !templateContains(line, { x: 250, y: 250 }, px));
  ok("B8 a border wall snaps to a corner", deepEqual(snapPoint({ x: 237, y: 181 }, 100, "border"), { x: 200, y: 200 }));
  ok("B9 a centre wall snaps to a square's middle", deepEqual(snapPoint({ x: 237, y: 181 }, 100, "centre"), { x: 250, y: 150 }));
  ok("B10 a line is no longer than the wall may be", deepEqual(wallEnd({ x: 0, y: 0 }, { x: 1000, y: 0 }, 400, 100), { x: 400, y: 0 }));
  ok("B11 nor shorter than a square", deepEqual(wallEnd({ x: 0, y: 0 }, { x: 10, y: 0 }, 400, 100), { x: 100, y: 0 }));
  ok("B12 and it may be shorter than its maximum", deepEqual(wallEnd({ x: 0, y: 0 }, { x: 0, y: 300 }, 400, 100), { x: 0, y: 300 }));
  ok("B13 a line wall is one Foundry Wall", deepEqual(wallSegments(line), [[150, 150, 450, 150]]));
  const segs = wallSegments(ring);
  ok("B14 a ring is a closed loop of segments", segs.length === 24
    && segs[23][2] === segs[0][0] && segs[23][3] === segs[0][1]);
  const lineShape = wallRegionShapes(line, 20);
  ok("B15 a line's Region is a line shape as long and as wide as the wall",
    lineShape.length === 1 && lineShape[0].type === "line" && lineShape[0].length === 300 && lineShape[0].width === 100);
  const ringShape = wallRegionShapes(ring, 20);
  ok("B16 a ring's Region is a circle with a hole", ringShape.length === 2 && !ringShape[0].hole && ringShape[1].hole
    && ringShape[0].radius === 250 && ringShape[1].radius === 150);
  const inside = (p) => wallContains(line, p, px);
  const across = pathEntersWall([{ x: 250, y: 50 }, { x: 250, y: 350 }], inside, 25);
  ok("B17 a move across the wall enters it", across.entered && across.lastOutside?.y < 100);
  ok("B18 a move beside it does not", !pathEntersWall([{ x: 50, y: 50 }, { x: 550, y: 50 }], inside, 25).entered);
  ok("B19 a move that starts inside is leaving, not entering",
    !pathEntersWall([{ x: 250, y: 150 }, { x: 250, y: 350 }], inside, 25).entered);
  ok("B20 a step too long to sample by endpoints is still caught",
    pathEntersWall([{ x: 250, y: 0 }, { x: 250, y: 300 }], inside, 25).entered);
  const s = segmentSamples({ x: 0, y: 0 }, { x: 100, y: 0 }, 25);
  ok("B21 samples run end to end", s.length === 5 && s[0].x === 0 && s[4].x === 100);
}

/* ================================================================== *
 * C. The card
 * ================================================================== */
{
  const spec = normaliseWall({ kind: "wall", length: 20, height: 10, thickness: "1 inch", snap: "border",
    block: { move: "normal", sight: "normal", light: "normal", sound: "normal" },
    sections: { size: 5, db: 0, hardness: 14, hp: 50 } });
  ok("C1 the card says how big the wall is",
    /20 ft<\/strong> long, 10 ft high \(1 inch thick\)/.test(wallRaisedLine(spec, { form: "line", lengthFeet: 20 }, "Wall Of Stone")));
  ok("C2 and a ring by its radius", /a ring of radius/.test(wallRaisedLine({ ...spec, ringRadiusFeet: 10 }, { form: "ring" }, "Wall Of Fire")));
  ok("C3 each section's numbers, by hand", /Each 5-foot section: DB 0, Hardness 14, <strong>50 HP<\/strong> — tracked by hand\./.test(wallSectionLine(spec)));
  ok("C4 a single wall's HP is the wall's", /^The wall: /.test(wallSectionLine({ sections: { sizeFeet: 0, db: 0, hardness: 30, hp: 60 } })));
  ok("C5 what it blocks on the map", /movement, sight, light, sound/.test(wallBlocksLine(spec)));
  const blades = normaliseWall({ kind: "wall", length: 20, crossing: true, stopsOnFumble: true, turn: "endOfTurn" });
  const riders = wallRiderLines(blades, 22, "8d8", "force").join(" ");
  ok("C6 the crossing rider names the save, the DC and the stop", /moves into the wall takes <strong>8d8 force<\/strong> \(Basic Reflex, DC 22\); on a Fumble its movement ends beside the wall/.test(riders));
  ok("C7 and the turn rider", /ends its turn in the wall/.test(riders));
  ok("C8 a wall of fire says concealed", /concealed/.test(wallRiderLines({ screen: true }, 0, "", "").join("")));
  ok("C9 a wall of wind says what it turns aside", /cannot pass it; a thrown weapon through it takes −2/.test(wallRiderLines({ wind: true }, 0, "", "").join("")));
  ok("C10 a wall in a creature's way dissipates, and says who", /dissipates<\/strong>.*ZZ Foe stands in its path/.test(wallObstructedLine("Wall Of Stone", ["ZZ Foe"])));
}

/* ================================================================== *
 * D. The storm
 * ================================================================== */
const stormRow = PLAN["Storm Of Vengeance"].effects.find((e) => e.kind === "storm");
const storm = normaliseStorm(stormRow);
{
  ok("D1 five strikes", storm?.modes?.length === 5);
  ok("D2 Acid Rain: 4d8 acid, no save", deepEqual(
    (({ formula, type, save }) => ({ formula, type, save }))(storm.modes.find((m) => m.key === "acidRain")),
    { formula: "4d8", type: "acid", save: "" }));
  const hail = storm.modes.find((m) => m.key === "hail");
  ok("D3 Hail: 4d10 bludgeoning, basic Fortitude", hail.formula === "4d10" && hail.type === "bludgeoning" && hail.save === "fortitude" && hail.basic);
  const bolt = storm.modes.find((m) => m.key === "lightning");
  ok("D4 Lightning: ten bolts of 4d12 electricity, basic Reflex", bolt.bolts === 10 && bolt.formula === "4d12" && bolt.save === "reflex" && bolt.basic);
  const rain = storm.modes.find((m) => m.key === "rainWind");
  ok("D5 Rain and Wind: terrain and concealment, no damage", rain.terrain && rain.screen && !rain.formula);
  const thunder = storm.modes.find((m) => m.key === "thunderclap");
  ok("D6 Thunderclap: Fortitude or deafened 10 minutes, an hour's immunity",
    thunder.save === "fortitude" && thunder.condition === "deafened" && thunder.duration === "10 minutes" && thunder.immunity === "1 hour");
  ok("D7 the strike just used is not offered", !stormModesOffered(storm, "hail").some((m) => m.key === "hail")
    && stormModesOffered(storm, "hail").length === 4);
  ok("D8 at the cast everything is offered", stormModesOffered(storm, "").length === 5);
  ok("D9 spans are counted", spanSeconds("1 hour") === 3600 && spanSeconds("10 minutes") === 600 && spanSeconds("soon") === 0);
  ok("D10 an hour's immunity runs out", thunderImmune(4600, 4000) && !thunderImmune(4600, 4600) && !thunderImmune(undefined, 0));
  ok("D11 the strike's heading names the save and DC", /Hail<\/strong> \(4d10 bludgeoning\) — Basic Fortitude save, DC 30/.test(stormStrikeLine(storm, hail, 30)));
  ok("D12 a storm of one mode is refused", normaliseStorm({ kind: "storm", modes: [{ key: "a" }] }) === null);
  ok("D13 a mode with unreadable dice is dropped", normaliseStorm({ kind: "storm",
    modes: [{ key: "a", formula: "lots" }, { key: "b" }, { key: "c" }] })?.modes?.length === 2);
}

/* ================================================================== *
 * E. The pack and the manifest
 * ================================================================== */
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name).trim(), v.system);
  }
} finally { await db.close(); }
for (const [name, fields] of Object.entries(PLAN)) {
  for (const [field, value] of Object.entries(fields)) {
    ok(`E1 ${name}.${field} is exactly the plan`, deepEqual(pack.get(name)?.[field], value));
  }
}
const wallOf = (name) => normaliseWall((pack.get(name)?.effects ?? []).find((e) => e.kind === "wall"));
const WALLS = ["Wall Of Blades", "Wall Of Dispelling", "Wall Of Fire", "Wall Of Force", "Wall Of Ice",
  "Wall Of Light", "Wall Of Stone", "Wall Of Thorns", "Wall Of Wind"];
ok("E2 all nine walls carry a wall row", WALLS.every((n) => wallOf(n)));
ok("E3 Force, Stone, Ice and Thorns are drawn on the map", ["Wall Of Force", "Wall Of Stone", "Wall Of Ice", "Wall Of Thorns"]
  .every((n) => wallOf(n)?.block) && ["Wall Of Blades", "Wall Of Fire", "Wall Of Light", "Wall Of Wind", "Wall Of Dispelling"]
  .every((n) => !wallOf(n)?.block));
ok("E4 and must form in open space", ["Wall Of Force", "Wall Of Stone", "Wall Of Ice", "Wall Of Thorns"].every((n) => wallOf(n)?.unobstructed));
ok("E5 Force, Stone and Ice stand on square edges", ["Wall Of Force", "Wall Of Stone", "Wall Of Ice"].every((n) => wallOf(n)?.snap === "border"));
ok("E6 Blades, Fire and Light bite on crossing", ["Wall Of Blades", "Wall Of Fire", "Wall Of Light"].every((n) => wallOf(n)?.crossing));
ok("E7 Blades at the end of a turn and stops a Fumble; Fire at the start", wallOf("Wall Of Blades")?.turn === "endOfTurn"
  && wallOf("Wall Of Blades")?.stopsOnFumble && wallOf("Wall Of Fire")?.turn === "startOfTurn");
ok("E8 Fire and Ice may be rings", deepEqual(wallOf("Wall Of Fire")?.forms, ["line", "ring"]) && deepEqual(wallOf("Wall Of Ice")?.forms, ["line", "ring"]));
ok("E9 Fire screens, Wind turns arrows", wallOf("Wall Of Fire")?.screen && wallOf("Wall Of Wind")?.wind);
ok("E10 the sections' numbers are the page's", wallOf("Wall Of Force")?.sections?.hp === 60 && wallOf("Wall Of Force")?.sections?.hardness === 30
  && wallOf("Wall Of Ice")?.sections?.hp === 40 && wallOf("Wall Of Stone")?.sections?.hardness === 14 && wallOf("Wall Of Thorns")?.sections?.hp === 20);
ok("E11 Thorns and Wind are difficult terrain", ["Wall Of Thorns", "Wall Of Wind"].every((n) =>
  (pack.get(n)?.effects ?? []).some((e) => e.kind === "difficultTerrain")));
ok("E12 Thorns still bites each space entered", (pack.get("Wall Of Thorns")?.effects ?? []).some((e) => e.kind === "hazard" && e.damage === "2d8"));
ok("E13 Wall Of Dispelling is 40 feet", wallOf("Wall Of Dispelling")?.lengthFeet === 40);
ok("E14 Wall Of Light still reaches only undead and oozes", /kinds:undead,ooze/.test(pack.get("Wall Of Light")?.damageScope ?? ""));
{
  const fireWarps = pack.get("Wall Of Fire")?.warps ?? [];
  const twice = aggregateWarpSelection(fireWarps, { "warp-0": 2, "warp-1": 1 });
  ok("E15 two length purchases are twenty feet, one ring purchase five", twice.mods.wallLength === 20 && twice.mods.wallRadius === 5);
  const force = aggregateWarpSelection(pack.get("Wall Of Force")?.warps ?? [], { "warp-0": 3 });
  ok("E16 Wall Of Force's HP option is +5 a time", force.mods.wallHp === 15);
}
ok("E17 Storm Of Vengeance has no save of its own and no damage", pack.get("Storm Of Vengeance")?.defence === ""
  && !pack.get("Storm Of Vengeance")?.damage?.formula);
ok("E18 and keeps its area, which is aimed", pack.get("Storm Of Vengeance")?.area === "360-foot radius" && pack.get("Storm Of Vengeance")?.sustained === true);
{
  const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
  for (const [name, fields] of Object.entries(plannedFields())) {
    for (const field of fields) {
      const entries = PACK_REPAIRS.filter((r) => r.name === name && r.field === field);
      ok(`E19 ${name}.${field} has one 3.610.0 pack-repair entry`, entries.length === 1 && entries[0].since === "3.610.0");
      ok("E19b and its `to` is the plan", deepEqual(entries[0]?.to, PLAN[name][field]));
    }
  }
}

/* ================================================================== *
 * F. Wiring
 * ================================================================== */
const cast = read("module", "magic", "cast-workflow.mjs");
const flow = read("module", "magic", "wall-spell-workflow.mjs");
const stormFlow = read("module", "magic", "storm-workflow.mjs");
const combat = read("module", "documents", "combat.mjs");
const targeting = read("module", "combat", "targeting.mjs");
const attack = read("module", "combat", "attack-workflow.mjs");
ok("F1 a wall row is read before the area", /const wallSpec = normaliseWall\(\(effEffects \?\? \[\]\)\.find\(\(e\) => e\?\.kind === "wall"\) \?\? null, warpMods\);/.test(cast));
ok("F2 and placed by the wall's own aim", /\? await placeWall\(wallSpec, actor, rangeFeet, spell\.name\)/.test(cast));
ok("F3 a wall is always placed in range", /const rangeFeet = wallSpec \? parseRangeFeet\(effRange\) :/.test(cast));
ok("F4 the cast raises the wall on its Region", /await raiseWall\(region, wallSpec, placedArea, \{/.test(cast));
ok("F5 and strikes with the storm", /await castStorm\(region, row, \{/.test(cast));
ok("F6 a wall that dissipated has no Region left to read", /if \(!canvas\.scene\?\.regions\?\.get\(placedArea\.regionId\)\) \{\s*\n\s*placedArea = \{ \.\.\.placedArea, regionId: null \};/.test(cast));
// (3.610.1: the line became a block that also sets wallDissipated — see verify-live-3610 D3.)
ok("F7 the wall and the storm claim their Regions", REGION_CLAIMING_KINDS.includes("wall") && REGION_CLAIMING_KINDS.includes("storm")
  && areaRegionIsClaimed({ effects: [{ kind: "wall" }] }));
ok("F8 both kinds are handled and speak for themselves", ["wall", "storm"].every((k) => HANDLED_EFFECT_KINDS.includes(k) && SELF_REPORTING_KINDS.includes(k)));
ok("F9 Wall Of Fire rolls nothing at the cast", spellSavesOnTurnStart([{ kind: "wall", turn: "startOfTurn" }])
  && !spellSavesOnTurnStart([{ kind: "wall", turn: "endOfTurn" }]));
ok("F10 a creature in a wall as its turn begins is asked", /applyWallTurnSaves\(actor, combatant\.token\?\.object \?\? null, "startOfTurn"\)/.test(combat));
ok("F11 and one ending its turn there", /applyWallTurnSaves\(actor, combatant\.token\?\.object \?\? null, "endOfTurn"\)/.test(combat));
ok("F12 the crossing hook rolls a Basic Reflex against the recorded DC",
  /const \{ entered, lastOutside \} = pathEntersWall\(path, inside, grid \/ 4\);/.test(flow)
  && /save: "reflex", dc: rec\.dc, label: rec\.label,\n\s*formula: rec\.formula/.test(flow));
ok("F13 a Fumble stops the mover beside the wall", /if \(rec\.stopsOnFumble && \["fumble", "blunder"\]\.includes\(hit\.degree\) && lastOutside\)/.test(flow)
  && /\{ trgWallStop: true, animate: false \}/.test(flow) && /if \(operation\?\.trgWallStop\) return;/.test(flow));
ok("F14 a wall's scope is asked on crossing (Wall Of Light)", /if \(!\(await inScope\(rec, mover, caster\)\)\) continue;/.test(flow));
ok("F15 a wall in a creature's path dissipates", /if \(spec\.unobstructed\) \{\n\s*const inTheWay = creaturesInWall\(placed\);/.test(flow));
ok("F16 a blocking wall is Foundry Walls", /createEmbeddedDocuments\("Wall", docs\)/.test(flow)
  && /c, move: spec\.block\.move, sight: spec\.block\.sight, light: spec\.block\.light, sound: spec\.block\.sound,/.test(flow));
ok("F17 they leave with the Region", /Hooks\.on\("deleteRegion"/.test(flow) && /\.filter\(\(w\) => w\.getFlag\?\.\(SYSTEM_ID, WALL_FLAG\)\?\.regionId === region\.id\)/.test(flow));
ok("F18 the hooks are registered", /registerWallSpells\(\);/.test(read("scripts", "trg-prime.mjs")));
ok("F19 concealment asks what the line crosses", /const screened = attackerActor \? screenedBetween\(attackerActor, targetActor\) : null;/.test(targeting)
  // RE-ANCHORED AT 3.621.0: a Dazzled attacker's concealment follows it (block 39's R7).
  && /\|\| Boolean\(screened\) \|\| senses\.concealed\);/.test(targeting));
ok("F20 an arrow cannot pass a wall of wind", /if \(wind && !thrownAttack\) \{/.test(attack));
ok("F21 a thrown weapon takes -2, and the storm's gales -4", /weatherRows\.push\(\{ label: `\$\{wind\} \(thrown\)`, value: -2, type: "circumstance" \}\)/.test(attack)
  && /weatherRows\.push\(\{ label: `\$\{gales\} \(gales\)`, value: -4, type: "circumstance" \}\)/.test(attack)
  && /\.\.\.weatherRows,/.test(attack));
ok("F22 a Sustain strikes again", /strikeLines\.push\(\.\.\.await stormOnSustain\(actor, entry\.id\)\)/.test(read("module", "magic", "sustain-workflow.mjs")));
ok("F23 the storm offers everything but the last", /const offered = stormModesOffered\(spec, last\);/.test(stormFlow)
  && /await region\.setFlag\(SYSTEM_ID, STORM_FLAG, \{ \.\.\.record, last: mode\.key, screen: Boolean\(mode\.screen\) \}\);/.test(stormFlow));
ok("F24 Rain and Wind's terrain is taken away when another strike is chosen", /await setRainAndWind\(region, mode\.terrain, record\.label\);/.test(stormFlow));
ok("F25 a thunderclap immunity is an hour of world time", /now \+ spanSeconds\(mode\.immunity\)/.test(stormFlow)
  && /thunderImmune\(actor\.getFlag\?\.\(SYSTEM_ID, THUNDER_IMMUNE_FLAG\), now\)/.test(stormFlow));
ok("F26 a dismissed or lapsed spell takes its placed Region with it",
  // 3.622.2: beside the cast's light circles (the 3.622.1 drive's F1).
  /\.filter\(\(r\) => r\.getFlag\?\.\("trg-prime", REGION_EXPIRY_FLAG\)\?\.castId === id \|\| circles\.has\(r\.id\)\)/.test(read("module", "magic", "active-spells.mjs")));
ok("F27 the two flags are the ones the workflows read", WALL_FLAG === "wallSpell" && STORM_FLAG === "storm");

if (failures.length) {
  console.log(`verify-walls-storm: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-walls-storm: OK — ${checks} checks. Nine walls put down where they are aimed, and a storm that strikes a different way each round.`);
