#!/usr/bin/env node
/**
 * verify-difficult-terrain — the terrain pair, and the AP that grows one.
 *
 * NEW at 3.501.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BOTH SPELLS CARRIED `effects: []` AND DID NOTHING. Verdant Snare had no
 * duration either — its clock is in the prose.
 *
 * SECTION B IS THE ONE THAT COULD BREAK SOMETHING ELSE. The behaviour
 * builder is the CREATURE AURAS' own, widened rather than copied, so
 * every check that a bare aura still charges all four movement types is
 * a check that the whirlwind did not change when the vines arrived.
 *
 * SECTION A IS THE AIR WARP, and what it changes is WHICH movements are
 * charged, not how much. A flying-only patch that also charged walking
 * would be the printed spell with a 6 PP surcharge.
 *
 * SECTION D IS THE CLAUSE THE SYSTEM DOES NOT ENFORCE. Foundry's
 * movement-cost behaviour charges everyone in the Region and cannot
 * exempt one creature, so disbelief rides on the Region's own NAME —
 * where a GM dragging a token sees it — and on the card.
 *
 * SECTION P IS THE AP SCALE. Row zero is the printed spell and is always
 * offered: "1 AP+" means a caster may spend one and stop.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DIFFICULT_MULTIPLIER, normaliseDifficultTerrain, terrainMovements,
  terrainAuraShape, terrainRegionName, terrainPlacedLine, terrainRemainderLine
} from "../module/magic/difficult-terrain.mjs";
import { terrainBehaviours } from "../module/creature-aura-workflow.mjs";
import {
  normaliseApScale, apScaleChoices, apScaleMods, apScaleCost, apScaleLine,
  baseAPOf, castAPIsScalable
} from "../module/magic/ap-scale.mjs";
import { castTimeWithExtraActions, totalCastTime } from "../module/magic/cast-time.mjs";
import { emptyWarp, aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { REGION_CLAIMING_KINDS } from "../module/magic/area-region-life.mjs";

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

/* ================================================================== *
 * N. THE ROW
 * ================================================================== */

const ground = normaliseDifficultTerrain({ kind: "difficultTerrain", label: "Verdant Snare" }, {});
ok("N1 the row reads back whole",
  ground?.label === "Verdant Snare" && ground.multiplier === DIFFICULT_MULTIPLIER
  && ground.air === false && ground.illusory === false);
ok("N2 a malformed row is refused",
  normaliseDifficultTerrain(null, {}) === null
  && normaliseDifficultTerrain({ kind: "note" }, {}) === null);
equal("N3 DOUBLE IS THE SYSTEM'S OWN WORD", DIFFICULT_MULTIPLIER, 2,
  "\"difficult terrain, in this system, costs double\" — combat/fly.mjs");
equal("N4 a multiplier below double cannot be declared",
  normaliseDifficultTerrain({ multiplier: 1 }, {}).multiplier, 2,
  "terrain that costs normal movement is not terrain");
ok("N5 the illusion flag survives",
  normaliseDifficultTerrain({ illusory: true }, {}).illusory === true);

/* ================================================================== *
 * A. THE AIR WARP
 * ================================================================== */

const air = normaliseDifficultTerrain({ kind: "difficultTerrain", label: "Warped Terrain", illusory: true },
  { terrainInAir: true });
ok("A1 THE WARP IS READ FROM A DECLARED MOD",
  air.air === true,
  "not from the warp's printed text — the phantom-key defect 3.499.1 paid for twice");
ok("A2 without it the terrain is on the ground",
  normaliseDifficultTerrain({ kind: "difficultTerrain" }, {}).air === false);
ok("A3 the ground version charges walking and not flight",
  terrainMovements(ground).includes("walk") && terrainMovements(ground).includes("fly") === false,
  "\"covers the ground\" — a printed patch of vines does not slow a bird");
ok("A4 THE AIR VERSION CHARGES FLIGHT AND NOT WALKING",
  terrainMovements(air).includes("fly") && terrainMovements(air).includes("walk") === false,
  "a flying-only patch that also charged walking is the printed spell with a 6 PP surcharge");
// A5 THE MOD IS IN THE VOCABULARY, or it is offered, charged for and dropped.
ok("A5 terrainInAir is declared in the warp vocabulary",
  emptyWarp().mods.terrainInAir === false);
ok("A6 and buying it sets it",
  aggregateWarpSelection(
    [{ ppCost: 6, text: "in the air", mods: { terrainInAir: true } }], { "warp-0": true }
  ).mods.terrainInAir === true,
  "the aggregate is the only road from the chooser to the effect");

/* ================================================================== *
 * B. THE BEHAVIOUR, BORROWED FROM THE CREATURE AURAS
 * ================================================================== */

// B1 CHANGED AT 3.579.0, AND DELIBERATELY. Page 196: "if you have a Fly
// speed, you are unhindered by difficult terrain." Every creature aura
// used to charge all four movements; the block-19 audit's D16 and
// Graham's R16 of 21 September 2026 made the silence mean the three
// GROUND movements, with flight charged only by an aura that says so.
const bareAura = { kind: "terrain", name: "Whirlwind", movementCostMultiplier: 2 };
const bare = terrainBehaviours(bareAura)[0];
ok("B1 A BARE AURA CHARGES THE GROUND MOVEMENTS AND LEAVES FLIERS ALONE",
  bare?.system?.difficulties?.walk === 2 && bare.system.difficulties.fly === 1
  && bare.system.difficulties.swim === 2 && bare.system.difficulties.burrow === 2,
  "page 196: a Fly speed is unhindered by difficult terrain unless the aura names flight");
// AND AN AURA THAT NAMES FLIGHT STILL CHARGES IT — the half that must not
// have been lost with the default.
{
  const flying = terrainBehaviours({
    kind: "terrain", name: "Storm", movementCostMultiplier: 2, movementTypes: ["walk", "fly"] })[0];
  ok("B1b AND AN AURA THAT NAMES FLIGHT STILL CHARGES IT",
    flying?.system?.difficulties?.fly === 2 && flying.system.difficulties.walk === 2
    && flying.system.difficulties.swim === 1);
}

const groundBehaviour = terrainBehaviours(terrainAuraShape(ground, "Verdant Snare"))[0];
equal("B2 the vines charge walking", groundBehaviour?.system?.difficulties?.walk, 2);
equal("B3 and leave flight alone", groundBehaviour?.system?.difficulties?.fly, 1);
const airBehaviour = terrainBehaviours(terrainAuraShape(air, "Warped Terrain"))[0];
equal("B4 the air version charges flight", airBehaviour?.system?.difficulties?.fly, 2);
equal("B5 and leaves walking alone", airBehaviour?.system?.difficulties?.walk, 1);
equal("B6 it is still the one behaviour type Foundry knows",
  groundBehaviour?.type, "modifyMovementCost");

// B7 ABSENT AND EMPTY ARE DIFFERENT ANSWERS. The first draft conflated
// them — `Array.isArray(x) && x.length` is falsy for `[]` — so an
// explicitly empty list fell through to charging ALL FOUR, the exact
// opposite of what it asked for.
ok("B7 AN EMPTY MOVEMENT LIST CHARGES NOTHING RATHER THAN EVERYTHING",
  terrainBehaviours({ ...bareAura, movementTypes: [] }).length === 0,
  "a behaviour charging nothing is worse than no Region, because the card would say it worked");
ok("B8 an unrecognised movement type is not a movement type",
  terrainBehaviours({ ...bareAura, movementTypes: ["teleport"] }).length === 0);
ok("B9 a shape with no multiplier builds nothing",
  terrainBehaviours({ kind: "terrain", name: "x" }).length === 0);
ok("B10 a malformed spec builds no shape", terrainAuraShape(null) === null);
// B11 DISBELIEF IS NOT AN exemptTrait. That field names a trait the
// behaviour cannot express; "except disbelieved" is a rule no trait check
// could ever confirm.
equal("B11 the exempt-trait field is left alone",
  terrainAuraShape(air, "Warped Terrain").exemptTrait, null);

/* ================================================================== *
 * D. THE CLAUSE THE SYSTEM DOES NOT ENFORCE
 * ================================================================== */

const airName = terrainRegionName(air, "Warped Terrain");
ok("D1 THE REGION'S NAME CARRIES THE DISBELIEF CLAUSE",
  /disbelief/i.test(airName),
  "a GM dragging a token across it sees the name, and nothing else");
ok("D2 and says it is theirs to run", /by hand/i.test(airName));
ok("D3 the air version says flying only", /flying only/i.test(airName));
ok("D4 a spell that is not an illusion is owed no disbelief clause",
  /disbelief/i.test(terrainRegionName(ground, "Verdant Snare")) === false,
  "a card reciting every clause a spell might have had is one nobody reads by the third cast");
ok("D5 THE CARD NAMES IT TOO",
  /Search action/i.test(terrainRemainderLine(air) ?? ""));
equal("D6 and says nothing for the vines", terrainRemainderLine(ground), null);
ok("D7 the placed line says who is slowed",
  terrainPlacedLine(air, "10-foot radius").startsWith("Flying creatures")
  && terrainPlacedLine(ground, "10-foot radius").startsWith("Creatures"));
ok("D8 and what it costs", /10 feet of movement/.test(terrainPlacedLine(ground, "x")));

/* ================================================================== *
 * P. THE AP SCALE
 * ================================================================== */

const scale = { per: "areaGrowth", step: 5, maxExtra: 2, label: "each extra AP adds 5 feet" };
ok("P1 a scale reads back whole", normaliseApScale(scale)?.step === 5);
ok("P2 a step of nothing is not an offer",
  normaliseApScale({ ...scale, step: 0 }) === null,
  "a prompt whose every choice is the same choice");
ok("P3 a cap of nothing is not an offer", normaliseApScale({ ...scale, maxExtra: 0 }) === null);
ok("P4 no scale at all is not an offer", normaliseApScale(null) === null);

const rows = apScaleChoices(scale, 1);
equal("P5 three rows for a cap of two extra", rows.length, 3);
// P6 IS THE ONE A CASTER WOULD FEEL. "1 AP+" means they may spend one and stop.
ok("P6 ROW ZERO IS THE PRINTED SPELL",
  rows[0].ap === 1 && rows[0].extra === 0 && rows[0].amount === 0,
  "a prompt forcing at least one extra action is a cost the book never printed");
ok("P7 the last row is the printed maximum",
  rows[2].ap === 3 && rows[2].amount === 10,
  "\"up to a maximum of 10 extra feet when utilizing 3 AP\"");

equal("P8 the mods it contributes land in the area channel",
  apScaleMods(scale, 2).areaGrowth, 10,
  "`areaGrowth` is what warp-area.mjs already reads");
equal("P9 no extra actions buy nothing", Object.keys(apScaleMods(scale, 0)).length, 0);
// P10 THE CLAMP IS IN THE ARITHMETIC, not the dialog: a returned index is
// data from outside this file.
equal("P10 A CHOICE ABOVE THE CAP IS CLAMPED", apScaleMods(scale, 9).areaGrowth, 10);
equal("P11 and so is the AP it costs", apScaleCost(scale, 9), 2);
equal("P12 a negative choice costs nothing", apScaleCost(scale, -3), 0);

ok("P13 a scalable cast time is recognised", castAPIsScalable("1 AP+"));
ok("P14 a plain one is not", castAPIsScalable(2) === false && castAPIsScalable("Reaction") === false);
equal("P15 the base AP is read out of it", baseAPOf("1 AP+"), 1);
equal("P16 an unreadable cast time yields null rather than a guess", baseAPOf("Reaction"), null,
  "a cast time nothing can read must not be offered an upgrade");
ok("P17 the card says what the actions bought", /radius \+10/.test(apScaleLine(scale, 2) ?? ""));
equal("P18 and says nothing when none were spent", apScaleLine(scale, 0), null);

/* ================================================================== *
 * W. WHERE IT IS WIRED
 * ================================================================== */

ok("W1 difficultTerrain claims its Region",
  REGION_CLAIMING_KINDS.includes("difficultTerrain"),
  "the movement cost lives ON the Region, so deleting it is the spell not happening");
ok("W2 the handler exists",
  CAST.includes('if (row?.kind !== "difficultTerrain" || !placedArea?.regionId) continue;'));
ok("W3 IT BORROWS THE AURAS' BUILDER",
  CAST.includes("terrainBehaviours(terrainAuraShape(spec, spell.name))"),
  "that function is the one place that knows how the behaviour is spelled");
ok("W4 the Region is renamed so the clause is visible",
  CAST.includes("terrainRegionName(spec, spell.name)"));
ok("W5 the warp mods reach the row",
  CAST.includes("normaliseDifficultTerrain(row, warpMods)"),
  "passing {} would make every casting a ground one");
/*
 * W6 AND W7 USED TO MATCH THE WORKFLOW'S SOURCE TEXT, and at 3.518.0
 * they both failed because the rule was MOVED rather than changed —
 * the arithmetic they were quoting became `castTimeWithExtraActions`
 * and `totalCastTime` in magic/cast-time.mjs. A check that fails when a
 * rule moves and passes when it is neutered is the wrong way round, and
 * this project has now recorded that shape three times. So they RUN it.
 *
 * W6 still reads the source, and honestly so: "the AP choice is made
 * BEFORE the pool is checked" is a claim about ORDER inside one
 * function, which no pure call can answer. Its anchor is the pool gate
 * itself rather than a spelling of the total.
 */
ok("W6 THE AP CHOICE IS MADE BEFORE THE POOL IS CHECKED",
  CAST.indexOf("apScaleChoices(spellData.apScale") < CAST.indexOf("ensureActionPoints(actor, castTimeApCost(effCastAPWithScale)"),
  "a caster who picks 3 AP with two in the pool should be told now, not clamped at the end");
equal("W7 THE EXTRA ACTIONS REACH THE COST", castTimeWithExtraActions("1 AP+", 2), 3,
  "a bigger spell for free is not what the book prints");
equal("W7b and they are still there at the spend",
  totalCastTime(castTimeWithExtraActions("1 AP+", 2)), 3);
equal("W7c while buying none leaves the printed time untouched, unit and all",
  castTimeWithExtraActions("1 AP+", 0), "1 AP+",
  "collapsing it to a number here is how the legality gate lost sight of a unit");
equal("W7d and extra CASTING TIME is charged on top of both",
  totalCastTime(castTimeWithExtraActions("1 AP+", 2), { extraApSpent: 3 }), 6);
ok("W8 THE AP GROWTH IS ADDED TO THE WARP CHANNEL, NOT ASSIGNED OVER IT",
  CAST.includes("warpMods[key] = (Number(warpMods[key]) || 0) + Number(value);"),
  "a spell with both an area warp and an AP scale would otherwise lose one of them");

/* ================================================================== *
 * G. THE PACK
 * ================================================================== */

let snare = null;
let warped = null;
const declarers = [];
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.type !== "spell") continue;
    if (value.name === "Verdant Snare") snare = value;
    if (value.name === "Warped Terrain") warped = value;
    if ((value.system?.effects ?? []).some((e) => e?.kind === "difficultTerrain")) {
      declarers.push(value.name);
    }
  }
} finally {
  await db.close().catch(() => {});
}

ok("G1 Verdant Snare declares terrain",
  (snare?.system?.effects ?? []).some((e) => e.kind === "difficultTerrain"));
equal("G2 and now has a clock", String(snare?.system?.duration ?? ""), "1 round",
  "it printed none, and 3.500.0 expires the Region on that stamp — so with an empty "
  + "field the vines would have been permanent");
ok("G3 Warped Terrain declares terrain, as an illusion",
  (warped?.system?.effects ?? []).some((e) => e.kind === "difficultTerrain" && e.illusory === true));
ok("G4 its air warp declares the mod",
  (warped?.system?.warps ?? []).some((w) => w?.mods?.terrainInAir === true),
  "it carried `mods: {}` and bought nothing");
ok("G5 THE AP SCALE IS DECLARED", normaliseApScale(warped?.system?.apScale)?.step === 5);
equal("G6 with the printed cap", normaliseApScale(warped?.system?.apScale)?.maxExtra, 2,
  "\"up to a maximum of 10 extra feet when utilizing 3 AP\"");
ok("G7 and its cast time still says so", castAPIsScalable(warped?.system?.castAP));
// G8 THE RATCHET.
// 2 -> 4 AT 3.589.0 (block 27): FALSE MIRE, whose illusory quicksand is
// the same shape as Warped Terrain's, and ENTANGLE, whose plants are
// real. Both print "1 minute", so C2 of verify-region-expiry — the check
// with teeth — still holds for them.
// 4 -> 5 AT 3.590.0 (block 28): ICE SLICK, whose entire entry is "slick
// ice coats the area, causing it to become difficult terrain". It is the
// first declarer whose page prints NO DURATION, and that is what made
// this ratchet worth having: the moment it became the eleventh Region
// claimant, `verify-region-expiry` C2 refused it for having nothing to
// count. Graham ruled 1 minute on 25 September, matching Warped Terrain,
// False Mire and Entangle, and the difference is declared in
// verify-spell-book-fields because the book says nothing at all.
//
// GUST IS THE FIFTH CANDIDATE AND IS DELIBERATELY NOT HERE. Its Partial
// rung is "moving against the wind counts as difficult terrain" -- a
// DEGREE-GATED and DIRECTIONAL reading, and a terrain row is written onto
// the Region, which sees neither. It would have made the whole blast
// difficult ground for everyone, including the creatures who critically
// succeeded, and said nothing about it. Printed instead.
// 5 -> 7 AT 3.608.0 (block 32's R7): STONE CALL's minute of debris and
// SOLID FOG's cloud. Both print "1 minute", so C2 of verify-region-expiry
// still has something to count — and Solid Fog's Region, a live zone, is
// ended with its emanation rather than by the Region clock.
// 7 -> 8 AT 3.609.0: PORTAL MAELSTROM, block 33's R2 ("While the maelstrom
// persists, the area is difficult terrain"). Transmute Rock & Mud's terrain
// rides a cast MODE and is not a top-level row, so it is not counted here.
// 8 -> 10 AT 3.610.0 (R9): WALL OF THORNS ("the spaces occupied by the wall
// are difficult terrain") and WALL OF WIND ("acts as difficult terrain for
// creatures attempting to traverse it"). Both print a countable duration.
// 10 -> 11 AT 3.612.0 (block 34's R6): WEB ("Any space filled with the web
// becomes difficult terrain"), beside its check on moving through it. It
// prints "1 minute".
ok("G8 exactly eleven spells lay difficult terrain",
  declarers.length === 11, `declarers: ${JSON.stringify(declarers)}`);
// G9 STILL THE ONLY SCALABLE CAST TIME IN THE PACK. A second one arriving
// is the moment to widen the shape, with two examples instead of one.
ok("G9 Verdant Snare's own warps are untouched",
  (snare?.system?.warps ?? []).some((w) => w?.mods?.areaGrowth === 10)
  && (snare?.system?.warps ?? []).some((w) => w?.mods?.durationText === "1 minute"),
  "both were already live and neither needed this release");

if (failures.length) {
  process.stderr.write(`verify-difficult-terrain: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-difficult-terrain: OK — ${checks} checks. Two spells that did nothing now lay ground `
  + "that costs double, the air warp moves which movements are charged, and the clause "
  + "Foundry cannot enforce is named on the Region itself.\n");
