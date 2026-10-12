#!/usr/bin/env node
/**
 * mutate-walls-storm — can verify-walls-storm fail?
 *
 * NEW at 3.610.0. Each mutation puts back a way the walls or the storm
 * could be wrong. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "wall-spell.mjs");
const FLOW = at("module", "magic", "wall-spell-workflow.mjs");
const STORM = at("module", "magic", "storm.mjs");
const STORM_FLOW = at("module", "magic", "storm-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const TARGETING = at("module", "combat", "targeting.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const SUSTAIN = at("module", "magic", "sustain-workflow.mjs");
const ACTIVE = at("module", "magic", "active-spells.mjs");
const TURN = at("module", "magic", "turn-save.mjs");
const LIFE = at("module", "magic", "area-region-life.mjs");
const TEMPLATE = at("module", "magic", "spell-template.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const VERIFY = at("tools", "verify-walls-storm.mjs");

const MUTATIONS = [
  { file: RULE, name: "the length warp is ignored",
    from: "  const lengthFeet = num(raw.length) + Math.max(0, num(warpMods?.wallLength));",
    to: "  const lengthFeet = num(raw.length);", breaks: "A5" },
  { file: RULE, name: "the ring warp is ignored",
    from: "    ? num(raw.ringRadius) + Math.max(0, num(warpMods?.wallRadius)) : 0;", to: "    ? num(raw.ringRadius) : 0;", breaks: "A6" },
  { file: RULE, name: "the HP warp is ignored",
    from: "    hp: Math.max(0, num(raw.sections.hp)) + Math.max(0, num(warpMods?.wallHp))", to: "    hp: Math.max(0, num(raw.sections.hp))", breaks: "A7" },
  { file: RULE, name: "every wall's space is a 5-foot strip",
    from: "    stripFeet: snap === \"centre\" ? 5 : 1,", to: "    stripFeet: 5,", breaks: "A8" },
  { file: RULE, name: "a wall that blocks nothing still writes Foundry Walls",
    from: "    block: blocks ? block : null,", to: "    block,", breaks: "A13" },
  { file: RULE, name: "a ring with no radius is accepted",
    from: "  if (forms.includes(\"ring\") && !(ringRadiusFeet > 0)) return null;\n", to: "", breaks: "A16" },
  { file: RULE, name: "a border wall snaps to a square's middle",
    from: "  if (snap === \"border\") {", to: "  if (false) {", breaks: "B8" },
  { file: RULE, name: "a line may be as long as the cursor is far",
    from: "  const len = Math.max(Number(minPx), Math.min(Number(maxPx), d));", to: "  const len = Math.max(Number(minPx), d);", breaks: "B10" },
  { file: RULE, name: "a ring's middle is in the wall",
    from: "    return Math.abs(d - num(tmpl.radius)) <= half + E;", to: "    return d <= num(tmpl.radius) + half + E;", breaks: "B5" },
  { file: RULE, name: "a ring is left open",
    from: "    return pts.map((p, i) => [...p, ...pts[(i + 1) % sides]]);", to: "    return pts.slice(1).map((p, i) => [...pts[i], ...p]);", breaks: "B14" },
  { file: RULE, name: "a ring's Region has no hole",
    from: "      { type: \"circle\", hole: true,", to: "      { type: \"circle\", hole: false,", breaks: "B16" },
  { file: RULE, name: "a move that starts in the wall counts as crossing it",
    from: "  if (inside(path[0])) return { entered: false, lastOutside: null };\n", to: "", breaks: "B19" },
  { file: RULE, name: "a move is checked at its ends only",
    from: "    const samples = segmentSamples(path[i - 1], path[i], step).slice(1);", to: "    const samples = [path[i]];", breaks: "B20" },
  { file: STORM, name: "the last strike may be chosen again",
    from: "  return (spec?.modes ?? []).filter((m) => m.key !== text(last));", to: "  return [...(spec?.modes ?? [])];", breaks: "D7" },
  { file: STORM, name: "a thunderclap immunity never ends",
    from: "  return Number.isFinite(t) && Number(worldTime) < t;", to: "  return Number.isFinite(t);", breaks: "D10" },
  { file: TEMPLATE, name: "the template rule does not know a wall",
    from: "  if (tmpl?.t === \"wall\") return wallContains(tmpl, point, { pxPerFt });", to: "", breaks: "B7" },
  { file: WARP, name: "the aggregator drops the length warp",
    from: "    if (m.wallLength) mods.wallLength += Number(m.wallLength) * times;\n", to: "", breaks: "E15" },
  { file: CAST, name: "a wall is drawn from its (absent) area text",
    from: "        ? await placeWall(wallSpec, actor, rangeFeet, spell.name)", to: "        ? null", breaks: "F2" },
  { file: CAST, name: "the wall is never raised",
    from: "        for (const said of await raiseWall(region, wallSpec, placedArea, {", to: "        for (const said of await (async () => [])(region, wallSpec, placedArea, {", breaks: "F4" },
  { file: CAST, name: "the storm never strikes",
    from: "        for (const said of await castStorm(region, row, {", to: "        for (const said of await (async () => [])(region, row, {", breaks: "F5" },
  { file: LIFE, name: "the wall's Region is cleaned away at the cast",
    from: "  \"wall\", \"storm\",\n  // A THRESHOLD (3.630.1,", to: "  \"storm\",\n  // A THRESHOLD (3.630.1,", breaks: "F7" },
  { file: TURN, name: "Wall Of Fire rolls at the cast",
    from: "    || (String(e?.kind ?? \"\") === \"wall\" && String(e?.turn ?? \"\") === \"startOfTurn\"));", to: "    );", breaks: "F9" },
  { file: COMBAT, name: "a creature beginning its turn in a wall of fire is not asked",
    from: "      for (const burn of await applyWallTurnSaves(actor, combatant.token?.object ?? null, \"startOfTurn\")) {",
    to: "      for (const burn of [] ?? applyWallTurnSaves) {", breaks: "F10" },
  { file: COMBAT, name: "a creature ending its turn in a wall of blades is not asked",
    from: "      ladderLines.push(...await applyWallTurnSaves(actor, combatant.token?.object ?? null, \"endOfTurn\"));", to: "", breaks: "F11" },
  { file: FLOW, name: "a Fumble walks on through the blades",
    from: "      if (rec.stopsOnFumble && [\"fumble\", \"blunder\"].includes(hit.degree) && lastOutside) {",
    to: "      if (false) {", breaks: "F13" },
  { file: FLOW, name: "the wall's own stop counts as a crossing",
    from: "    if (operation?.trgWallStop) return;\n", to: "", breaks: "F13" },
  { file: FLOW, name: "Wall Of Light burns the living too",
    from: "      if (!(await inScope(rec, mover, caster))) continue;\n      const hit", to: "      const hit", breaks: "F14" },
  { file: FLOW, name: "a wall forms through a creature",
    from: "  if (spec.unobstructed) {\n    const inTheWay = creaturesInWall(placed);", to: "  if (false) {\n    const inTheWay = creaturesInWall(placed);", breaks: "F15" },
  { file: FLOW, name: "the Foundry Walls stay when the Region goes",
    from: "  Hooks.on(\"deleteRegion\", async (region) => {", to: "  Hooks.on(\"deleteRegionX\", async (region) => {", breaks: "F17" },
  { file: TARGETING, name: "a wall of fire conceals nothing",
    from: "\n    || Boolean(screened) || senses.concealed);", to: " || senses.concealed);", breaks: "F19" },
  { file: ATTACK, name: "an arrow flies through a wall of wind",
    from: "    if (wind && !thrownAttack) {", to: "    if (false) {", breaks: "F20" },
  { file: ATTACK, name: "the gales cost nothing",
    from: "    if (gales) weatherRows.push({ label: `${gales} (gales)`, value: -4, type: \"circumstance\" });", to: "", breaks: "F21" },
  { file: SUSTAIN, name: "a Sustain does not strike",
    from: "    strikeLines.push(...await stormOnSustain(actor, entry.id));", to: "", breaks: "F22" },
  { file: STORM_FLOW, name: "the storm forgets what it last did",
    from: "  await region.setFlag(SYSTEM_ID, STORM_FLAG, { ...record, last: mode.key, screen: Boolean(mode.screen) });",
    to: "  await region.setFlag(SYSTEM_ID, STORM_FLAG, { ...record, screen: Boolean(mode.screen) });", breaks: "F23" },
  { file: ACTIVE, name: "a dismissed storm leaves its cloud",
    // 3.622.2: the filter also takes the cast's light circles; the storm's half is the stamp.
    from: "      .filter((r) => r.getFlag?.(\"trg-prime\", REGION_EXPIRY_FLAG)?.castId === id || circles.has(r.id))", to: "      .filter((r) => circles.has(r.id))", breaks: "F26" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-walls-storm does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}
let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) { console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`); unmatched++; continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
process.stdout.write(survived + unmatched
  ? `\nmutate-walls-storm: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-walls-storm: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
