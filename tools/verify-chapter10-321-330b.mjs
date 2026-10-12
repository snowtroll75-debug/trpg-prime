#!/usr/bin/env node
/**
 * verify-chapter10-321-330b — block 32, Spirit Trap (R1) and Shroud (R2).
 *
 * NEW at 3.606.0, beside verify-chapter10-321-330 (the nine ladders).
 *
 *   M  the movement bind — its rungs, its walk, its floor and its leash
 *   V  the movement hook asking it, driven against a stubbed grid
 *   T  the new save at the start of the creature's own turn
 *   S  the applier handing it everyone who rolled
 *   L  a creature that sees the light as darker than it is
 *   G  a skill ladder that governs the spell's other rows
 *   F  the flat ladder, one target at a time — the defect found here
 *   P  the pack, the plan and the manifest
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  normaliseMovementBind, bindOutcome, difficultFloor, leashRefuses, leashRefusalLine, bindLine,
  MOVEMENT_BIND_FLAG
} from "../module/magic/movement-bind.mjs";
import { movementBindVerdict, bindRecord } from "../module/magic/movement-bind-workflow.mjs";
import { DEGREE_ORDER } from "../module/magic/save-ladder.mjs";
import { LADDER_KINDS } from "../module/magic/flat-ladder.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import {
  perceivedLightShift, lightPenaltyRow, visualRangeReport, LIGHT_PERCEPTION_FLAG
} from "../module/light-check.mjs";
import {
  normaliseSkillLadder, skillLadderOutcome, governedGroups, skillLadderJudgedLine, skillLadderNobodyLine
} from "../module/magic/skill-ladder.mjs";
import { PLAN, plannedFields } from "./block32b-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const src = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ================================================================== *
 * M. The movement bind — driven
 * ================================================================== */

const trapRow = PLAN["Spirit Trap"].effects.find((e) => e.kind === "movementBind");
const trap = normaliseMovementBind(trapRow);
ok("M1 Spirit Trap's bind parses", Boolean(trap));
const at = (d) => bindOutcome(trap, d);
ok("M2 a Critical goes free", at("critical").free === true);
ok("M2b a Heroic reads at the Critical and goes free", at("heroic").rung === "critical" && at("heroic").free);
ok("M3 a Success makes all terrain difficult and owes a new save",
  at("success").bind?.difficult === true && at("success").bind?.leashFeet === null && at("success").bind?.resave === true);
ok("M4 a Failure is a 5-foot leash with a new save",
  at("failure").bind?.leashFeet === 5 && at("failure").bind?.resave === true && at("failure").bind?.difficult === false);
ok("M4b a Partial reads at the Failure", at("partial").rung === "failure" && at("partial").bind?.leashFeet === 5);
ok("M5 a Fumble is the leash with NO further save", at("fumble").bind?.leashFeet === 5 && at("fumble").bind?.resave === false);
ok("M5b a Blunder reads at the Fumble", at("blunder").rung === "fumble" && at("blunder").bind?.resave === false);
ok("M6 every degree reaches some rung", DEGREE_ORDER.every((d) => at(d).rung !== null));
ok("M7 an unknown save is refused", normaliseMovementBind({ ...trapRow, save: "luck" }) === null);
ok("M7b a negative leash is refused",
  normaliseMovementBind({ ...trapRow, rungs: { failure: { leashFeet: -5 } } }) === null);
ok("M7c a row of another kind is not a bind", normaliseMovementBind({ ...trapRow, kind: "saveLadder" }) === null);

ok("M8 THE FLOOR IS A FLOOR: open ground costs double", difficultFloor(10, 10) === 20);
ok("M8b ground already difficult costs what it did, not four times", difficultFloor(20, 10) === 20);
ok("M8c formidable ground stays formidable", difficultFloor(30, 10) === 30);
ok("M9 the leash allows its own length — \"no more than 5 feet\" includes five", leashRefuses(5, 5) === false);
ok("M9b and refuses a step past it", leashRefuses(10, 5) === true);
ok("M9c no leash refuses nothing", leashRefuses(500, null) === false);
ok("M9d an unmeasured point refuses nothing", leashRefuses(NaN, 5) === false);
ok("M10 the refusal names the spell and both numbers",
  /Spirit Trap/.test(leashRefusalLine("Ann", "Spirit Trap", 5, 15)) && /5 feet/.test(leashRefusalLine("Ann", "Spirit Trap", 5, 15))
  && /15 feet/.test(leashRefusalLine("Ann", "Spirit Trap", 5, 15)));
ok("M11 the card says whether another save is owed",
  /New save/.test(bindLine("Ann", "Spirit Trap", "failure", at("failure")))
  && /No further save/.test(bindLine("Ann", "Spirit Trap", "fumble", at("fumble"))));
ok("M11b and a clamped degree says what it was read as",
  /read as Failure/.test(bindLine("Ann", "Spirit Trap", "partial", at("partial"))));

/* ================================================================== *
 * V. The movement hook's verdict — driven against a stubbed grid
 * ================================================================== */

{
  const SQ = 100;
  globalThis.canvas = {
    grid: {
      // THE STUB MEASURES THE WAY A 5-FOOT GRID DOES FOR ADJACENCY — one
      // square in any direction is 5 feet — which is all a 5-foot leash asks.
      measurePath: ([a, b]) => ({
        distance: Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / SQ * 5
      })
    }
  };
  const flag = (bind, anchor) => ({ flags: { "trg-prime": { [MOVEMENT_BIND_FLAG]: {
    ...trapRow, saveDC: 15, bind, rung: "x", anchor } } },
    getFlag(scope, key) { return this.flags?.[scope]?.[key]; } });
  const tokenWith = (effects) => ({ parent: { id: "S" }, actor: { name: "Ann", effects } });
  const leashed = tokenWith([flag({ difficult: false, leashFeet: 5, resave: true }, { x: 0, y: 0, sceneId: "S" })]);

  ok("V1 a step within the leash is allowed",
    movementBindVerdict(leashed, { destination: { x: 100, y: 0 } }).refused === "");
  ok("V1b a diagonal step within it is allowed",
    movementBindVerdict(leashed, { destination: { x: 100, y: 100 } }).refused === "");
  ok("V2 a move two squares out is refused",
    movementBindVerdict(leashed, { destination: { x: 200, y: 0 } }).refused !== "");
  ok("V3 OUT AND BACK IN ONE DRAG IS REFUSED — every waypoint is asked",
    movementBindVerdict(leashed, {
      pending: { waypoints: [{ x: 400, y: 0 }] }, destination: { x: 0, y: 0 }
    }).refused !== "");
  ok("V4 a leash on another scene does not bind this one",
    movementBindVerdict(tokenWith([flag({ difficult: false, leashFeet: 5, resave: true },
      { x: 0, y: 0, sceneId: "OTHER" })]), { destination: { x: 900, y: 0 } }).refused === "");
  const heavy = tokenWith([flag({ difficult: true, leashFeet: null, resave: true }, null)]);
  ok("V5 heavy ground is reported to the hook", movementBindVerdict(heavy, { destination: { x: 900, y: 0 } }).difficult === true);
  ok("V5b and refuses nothing", movementBindVerdict(heavy, { destination: { x: 900, y: 0 } }).refused === "");
  ok("V6 a disabled bind binds nothing",
    movementBindVerdict(tokenWith([{ ...flag({ difficult: false, leashFeet: 5, resave: true },
      { x: 0, y: 0, sceneId: "S" }), disabled: true }]), { destination: { x: 900, y: 0 } }).refused === "");
  ok("V7 an unbound creature is untouched",
    deepEqual(movementBindVerdict(tokenWith([]), { destination: { x: 900, y: 0 } }), { refused: "", difficult: false }));
  delete globalThis.canvas;
}

const mw = src("module", "combat", "movement-workflow.mjs");
const hook = mw.slice(mw.indexOf("function onPreMoveToken("));
ok("V8 the hook asks the bind beside the space rules",
  /const bound = movementBindVerdict\(tokenDocument, movement\);\n\s+if \(bound\.refused\) \{\n\s+ui\.notifications\.warn\(bound\.refused\);\n\s+return false;/.test(hook));
ok("V8b BEFORE anything is charged — a refused move costs nothing",
  hook.indexOf("movementBindVerdict(tokenDocument, movement)") < hook.indexOf("if (!chargeable(tokenDocument, movement))"));
ok("V9 heavy ground floors the cost the move is charged",
  // RE-ANCHORED AT 3.621.0: the Blinded's terrain joins the bind's (block 39's R7).
  /const allDifficult = bound\.difficult \|\| blindDifficult;\s*const cost = allDifficult \? difficultFloor\(surcharged, proposedDistance\(movement\)\) : surcharged;/.test(hook));

/* ================================================================== *
 * T. The new save at the start of the creature's turn
 * ================================================================== */

const combat = src("module", "documents", "combat.mjs");
const startTurn = combat.slice(combat.indexOf("async _onStartTurn(combatant) {"), combat.indexOf("async _onEndTurn("));
ok("T1 the start of a turn rolls the binds' new saves",
  /for \(const said of await rollMovementBindSaves\(actor, combatant\.token \?\? null\)\)/.test(startTurn));
const bwf = src("module", "magic", "movement-bind-workflow.mjs");
ok("T2 only binds that owe one are rolled", /filter\(\(\{ record \}\) => record\.bind\.resave\)/.test(bwf));
ok("T3 a new save that frees the creature deletes the bind", /if \(outcome\.free\) \{\n\s+await effect\.delete\(\);/.test(bwf));
ok("T4 a new rung is written back with a fresh anchor",
  /await effect\.setFlag\(SYSTEM_ID, MOVEMENT_BIND_FLAG, bindRecord\(spec, outcome, \{/.test(bwf));
{
  const doc = { x: 300, y: 400, parent: { id: "S" } };
  const leash = bindRecord(trap, at("failure"), { saveDC: 15, tokenDocument: doc, raw: trapRow });
  ok("T5 a leash is anchored where the creature stands", deepEqual(leash.anchor, { x: 300, y: 400, sceneId: "S" }));
  ok("T5b heavy ground needs no anchor", bindRecord(trap, at("success"), { saveDC: 15, tokenDocument: doc, raw: trapRow }).anchor === null);
  ok("T5c a freeing rung writes nothing", bindRecord(trap, at("critical"), { saveDC: 15, tokenDocument: doc, raw: trapRow }) === null);
  ok("T5d the record keeps the DC the new save is rolled against", leash.saveDC === 15);
  ok("T5e and the row it came from, so the new save can read the ladder again",
    normaliseMovementBind(leash) !== null);
}

/* ================================================================== *
 * S. The applier
 * ================================================================== */

const applier = src("module", "magic", "spell-effects.mjs");
ok("S1 movementBind is a handled kind", HANDLED_EFFECT_KINDS.includes("movementBind"));
ok("S2 it is handed everyone who rolled — a Critical is an outcome too", LADDER_KINDS.includes("movementBind"));
const bindCase = applier.slice(applier.indexOf('case "movementBind": {'), applier.indexOf('case "splash": {'));
ok("S3 each target reads its OWN rolled degree",
  /const rolled = \(Array\.isArray\(saveResults\) \? saveResults : \[\]\)\.find\(\(r\) => r\?\.target === target\);/.test(bindCase));
ok("S3b and a freeing rung creates nothing", /if \(outcome\.free\) break;/.test(bindCase));
ok("S3c the effect is on the spell's clock and cast", /if \(castId\) flags\[SYSTEM_ID\]\.castId = castId;/.test(bindCase)
  && /conditionExpiresRound = timing\.expiresRound/.test(bindCase));

/* ================================================================== *
 * L. The light one creature sees
 * ================================================================== */

{
  const fx = (n, disabled = false) => ({ disabled, flags: { "trg-prime": { [LIGHT_PERCEPTION_FLAG]: n } } });
  ok("L1 no shroud, no shift", perceivedLightShift([]) === 0);
  ok("L1b a shroud is -2", perceivedLightShift([fx(-2)]) === -2);
  ok("L1c two shrouds are not a deeper one", perceivedLightShift([fx(-2), fx(-2)]) === -2);
  ok("L1d the darker of two wins", perceivedLightShift([fx(-1), fx(-2)]) === -2);
  ok("L1e a disabled shroud does nothing", perceivedLightShift([fx(-2, true)]) === 0);
  const plain = lightPenaltyRow({ ambientLevel: 8, items: [], subject: "perception" });
  const dim = lightPenaltyRow({ ambientLevel: 8, items: [], subject: "perception", shift: -2 });
  ok("L2 Bright Light costs nothing to see in", plain === null);
  ok("L2b SHROUDED, Bright Light is seen as Twilight — the -2 the page's table gives it",
    dim?.value === -2 && dim?.effectiveLevel === 6, JSON.stringify(dim));
  ok("L2c and the hint says why", /2 steps darker to them/.test(dim?.hint ?? ""));
  ok("L2d Perception only", lightPenaltyRow({ ambientLevel: 8, subject: "stealth", shift: -2 }) === null);
  const dv = [{ flags: { "trg-prime": { creatureAbility: { derives: { light: { raisesLevelBy: 2 } } } } } }];
  // THE ORDER IS TESTED WHERE THE ORDER CHANGES THE ANSWER. In Bright
  // Light a darkvision creature's senses are already capped at 8, so
  // senses-then-shroud would leave it at Twilight (-2), while
  // shroud-then-senses dims it to Twilight and lets darkvision lift it back
  // to Bright (no penalty). The first draft of this check used Twilight,
  // where both orders agree, and so measured nothing about the order at all.
  ok("L3 the shroud dims the light BEFORE the creature's own senses lift it",
    lightPenaltyRow({ ambientLevel: 8, items: dv, subject: "perception", shift: -2 }) === null);
  ok("L3b while a creature without darkvision feels the whole shroud",
    lightPenaltyRow({ ambientLevel: 8, items: [], subject: "perception", shift: -2 })?.value === -2);
  const rep = visualRangeReport({ ambientLevel: 8, senses: [{ name: "Sight", modality: "visual", rangeFeet: 100 }], shift: -2 });
  ok("L4 the visual range report sees the shroud too", rep.effectiveLevel === 6);
  ok("L5 the check dialog passes the shroud",
    /shift: perceivedLightShift\(Array\.from\(actor\.effects \?\? \[\]\)\)/.test(src("module", "apps", "check-dialog.mjs")));
  ok("L5b and so does the sheet's senses block",
    /shift: perceivedLightShift\(Array\.from\(this\.actor\.effects \?\? \[\]\)\)/.test(src("module", "sheets", "actor-sheet.mjs")));
  ok("L6 lightPerception is a handled kind", HANDLED_EFFECT_KINDS.includes("lightPerception"));
  const lpCase = applier.slice(applier.indexOf('case "lightPerception": {'), applier.indexOf('case "movementBind": {'));
  ok("L6b the applier writes the shift onto the target's effect",
    /\{ \[SYSTEM_ID\]: \{ spellBuff: true, \[LIGHT_PERCEPTION_FLAG\]: steps \} \}/.test(lpCase));
  ok("L6c a shift of nothing is refused out loud", /declares a light shift of nothing/.test(lpCase));
}

/* ================================================================== *
 * G. A skill ladder that governs the spell's other rows
 * ================================================================== */

{
  const shroudRow = PLAN["Shroud"].effects.find((e) => e.kind === "skillLadder");
  const spec = normaliseSkillLadder(shroudRow);
  ok("G1 Shroud's ladder parses", Boolean(spec));
  ok("G1b aimed at the cast's own targets", spec?.candidates === "targets");
  ok("G1c and governing", spec?.governs === true);
  ok("G1d a ladder aimed at the scene cannot govern — there is no cast target to govern",
    normaliseSkillLadder({ ...shroudRow, candidates: "scene" })?.governs === false);
  ok("G1e Shape Stone's shape is unchanged: scene, not governing",
    normaliseSkillLadder({ kind: "skillLadder", skills: ["acrobatics"], degrees: { failure: { text: "x" } } })?.candidates === "scene");
  const o = (d) => skillLadderOutcome(spec, d);
  ok("G2 a Critical avoids it entirely", o("critical").unaffected === true);
  ok("G2b a Heroic too — a better roll never does worse", o("heroic").unaffected === true);
  ok("G3 a Success shrouds for 1 round", o("success").duration === "1 round" && !o("success").unaffected);
  ok("G4 a Failure shrouds for the full duration", o("failure").duration === "" && !o("failure").unaffected);
  ok("G4b a Partial reads at the Failure", o("partial").at === "failure");
  ok("G4c a Blunder too", o("blunder").at === "failure");
  const groups = governedGroups([
    { actor: "willing", resisted: false, outcome: null },
    { actor: "crit", resisted: true, outcome: o("critical") },
    { actor: "succ", resisted: true, outcome: o("success") },
    { actor: "fail", resisted: true, outcome: o("failure") }
  ]);
  const byLen = Object.fromEntries(groups.map((g) => [g.duration, g.actors.join()]));
  ok("G5 THE WILLING TAKE IT FOR THE SPELL'S OWN DURATION, beside the failures",
    byLen[""] === "willing,fail", JSON.stringify(byLen));
  ok("G5b a Success takes it for a round", byLen["1 round"] === "succ");
  ok("G5c a Critical takes nothing", !groups.some((g) => g.actors.includes("crit")));
  ok("G6 the closing line is the spell's own, not Shape Stone's",
    /whether a target is willing/.test(skillLadderJudgedLine(spec)) && !/stone/.test(skillLadderJudgedLine(spec)));
  ok("G6b and Shape Stone keeps its own", /standing on the stone/.test(skillLadderJudgedLine(null)));
  ok("G6c nobody resisting says so in the spell's words", /each is shrouded/.test(skillLadderNobodyLine("Shroud", spec)));

  const gov = applier.slice(applier.indexOf("  const governing = effects.find("), applier.indexOf("  for (const effect of effects) {"));
  ok("G7 a governing ladder is resolved BEFORE the effect loop", gov.length > 200);
  ok("G7b with the cast's targets", /\n\s+targets\n\s+\}\);/.test(gov));
  ok("G8 each group is handed to the same applier with its length",
    /await applySpellEffects\(caster, spell, \{[\s\S]{0,300}durationOverride: group\.duration \|\| null/.test(gov));
  ok("G8b notes are not governed", /e\?\.kind !== "note"/.test(gov));
  ok("G9 the loop then skips the governed rows",
    /if \(governed && \(effect === governing \|\| effect\?\.kind !== "note"\)\) continue;/.test(applier));
  ok("G10 a group's length reaches every row that declares none",
    /const spellDurationSource = durationOverride \|\| warpedDurationText\(spell\.system\?\.duration, warpMods\);/.test(applier));
  const slw = src("module", "magic", "skill-ladder-workflow.mjs");
  ok("G11 in targets mode the picker offers the cast's targets", /const candidates = targetsMode\n\s+\? targetTokens/.test(slw));
  ok("G11b every target nobody ticked is willing",
    /if \(!uuid \|\| !chosen\.includes\(uuid\)\) governed\.push\(\{ actor, resisted: false, outcome: null \}\);/.test(slw));
  ok("G11c the check says what it is for", /\$\{spec\.purpose \|\| "to keep their balance"\}/.test(slw));
}

/* ================================================================== *
 * F. One target at a time — the flat ladder defect
 * ================================================================== */

{
  const flat = applier.slice(applier.indexOf('case "flatLadder": {'), applier.indexOf('case "movementBind": {'));
  ok("F1 the flat ladder resolves THIS target's rung only",
    /const mine = ladderResults\.find\(\(r\) => r\?\.target === target\);/.test(flat)
    && /applyFlatLadder\(caster, spec, target, mine\.degree, castId\)/.test(flat));
  ok("F1b and no longer walks every result inside a per-recipient loop",
    !/for \(const r of ladderResults\)/.test(flat));
}

/* ================================================================== *
 * P. The pack, the plan and the manifest
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
    ok(`P1 ${name}.${field} is exactly the plan`, deepEqual(pack.get(name)?.[field], value));
  }
}
ok("P2 Spirit Trap still rolls Will", /will/i.test(pack.get("Spirit Trap")?.defence ?? ""));
ok("P2b and still buys extra targets", (pack.get("Spirit Trap")?.warps ?? []).some((w) => w?.mods?.extraTargets === 1));
ok("P3 Shroud carries no save — its check is the ladder's", !String(pack.get("Shroud")?.defence ?? "").trim());
ok("P3b its bonus is to saves against LIGHT", (pack.get("Shroud")?.effects ?? []).some((e) => e.kind === "conditional"
  && e.grants?.[0]?.value === 2 && deepEqual(e.grants?.[0]?.when?.traits, ["light"])));
ok("P3c and its shift is two steps darker", (pack.get("Shroud")?.effects ?? []).some((e) => e.kind === "lightPerception" && e.steps === -2));
{
  const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
  for (const [name, fields] of Object.entries(plannedFields())) {
    for (const field of fields) {
      const entry = PACK_REPAIRS.find((r) => r.name === name && r.field === field && r.since === "3.606.0");
      ok(`P4 ${name}.${field} has a 3.606.0 pack-repair entry`, Boolean(entry));
      ok(`P4b and its \`to\` is the plan`, deepEqual(entry?.to, PLAN[name][field]));
    }
  }
}

if (failures.length) {
  console.log(`verify-chapter10-321-330b: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-chapter10-321-330b: OK — ${checks} checks. A pinned shadow and a shroud, read at the rung the book printed.`);
