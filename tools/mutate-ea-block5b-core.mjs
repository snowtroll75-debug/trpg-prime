#!/usr/bin/env node
/** mutate-ea-block5b-core — the mutation half of verify-ea-block5b-core. NEW at 3.683.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CO = m("conditionals.mjs"), CK = m("dice", "check.mjs"), DLG = m("apps", "check-dialog.mjs"), LW = m("light-workflow.mjs"),
  APIW = m("module-api-workflow.mjs"), FALL = m("combat", "falling-workflow.mjs"), PF = m("combat", "passive-feats.mjs"),
  DT = m("magic", "difficult-terrain.mjs"), CAW = m("creature-aura-workflow.mjs"), STORM = m("magic", "storm-workflow.mjs"),
  MVW = m("combat", "movement-workflow.mjs"), MV = m("combat", "movement.mjs"), APW = m("combat", "action-points-workflow.mjs"),
  SP = m("combat", "space.mjs"), FW = m("feats-workflow.mjs");
const MUTATIONS = [
  // L (C4)
  { name: "THE GAP: the light axis is never matched", file: CO, from: "  if (wantedLightLevels && !wantedLightLevels.some((t) => lightLevels.includes(t))) return false;\n", to: "", breaks: "L6/L7" },
  { name: "\"5 or less\" reaches the whole ladder", file: CO, from: "      const max = entry.max === undefined || entry.max === null ? LIGHT_LEVEL_MAX : level(entry.max);", to: "      const max = LIGHT_LEVEL_MAX;", breaks: "L2" },
  { name: "a range is read as a word", file: CO, from: "    const list = axis === \"lightLevels\" ? lightLevelList(when[axis]) : cleanList(when[axis]", to: "    const list = axis === \"lightLevelsX\" ? lightLevelList(when[axis]) : cleanList(when[axis]", breaks: "L5" },
  { name: "the wildcard never stands a row down", file: CO, from: "  if (excludes(excluded.lightLevels, lightLevels)) return false;\n", to: "", breaks: "L9" },
  { name: "the automatic path carries no light", file: CK, from: "          lightLevel: rollerLight,\n", to: "          lightLevel: \"\",\n", breaks: "L16" },
  { name: "the automatic path never reads the token", file: CK, from: "          : wantsLight ? ((await import(\"../light-workflow.mjs\"))", to: "          : false ? ((await import(\"../light-workflow.mjs\"))", breaks: "L16" },
  { name: "the dialog reads only what a caller says", file: DLG, from: "            lightLevel: String(lightLevel ?? \"\").trim() !== \"\" ? lightLevel : (ambientLightLevelOf(actor) ?? \"\"),", to: "            lightLevel: lightLevel,", breaks: "L17" },
  { name: "an unlinked token's own light is not read", file: LW, from: "    const token = actor?.token ?? actor?.getActiveTokens?.()?.[0] ?? null;", to: "    const token = actor?.getActiveTokens?.()?.[1] ?? null;", breaks: "L13" },
  { name: "the light helper is not on the API", file: APIW, from: "      lightLevelAt: async (token) =>", to: "      lightLevelAtX: async (token) =>", breaks: "L15" },
  // U (C5)
  { name: "a given distance still opens the dialog", file: FALL, from: "  const result = ask === false\n", to: "  const result = false\n", breaks: "U3/U4" },
  { name: "the helper always asks", file: APIW, from: "ask: !given });", to: "ask: true });", breaks: "U4/U6" },
  { name: "the underwater helper is not on the API", file: APIW, from: "      isUnderwater: async (token) =>", to: "      isUnderwaterX: async (token) =>", breaks: "U1/U2" },
  // T (C16)
  { name: "\"magical\" is merely truthy again: every terrain eased", file: PF, from: "  if (String(flags.ignoresDifficultTerrain ?? \"\").trim().toLowerCase() === MAGICAL_TERRAIN_RELIEF) return MAGICAL_TERRAIN_RELIEF;\n", to: "", breaks: "T1" },
  { name: "the magical kind never eases", file: PF, from: "    if (scope === MAGICAL_TERRAIN_RELIEF) return pathIsMagical();", to: "    if (scope === MAGICAL_TERRAIN_RELIEF) return false;", breaks: "T2" },
  { name: "the path is scanned for every carrier", file: PF, from: "    if (magicalKnown === null) magicalKnown =", to: "    magicalKnown =", breaks: "T5" },
  { name: "a mix counts as magical", file: PF, from: "  return rows.length > 0 && rows.every((r) => r?.magical === true);", to: "  return rows.length > 0 && rows.some((r) => r?.magical === true);", breaks: "T6" },
  { name: "a spell's ground is not marked", file: DT, from: "    magical: true\n  };", to: "    magical: false\n  };", breaks: "T7" },
  { name: "a creature's aura is marked too", file: CAW, from: "    ...(aura.magical === true ? { flags:", to: "    ...(true ? { flags:", breaks: "T8" },
  { name: "the storm drops the mark", file: STORM, from: "[SYSTEM_ID]: { ...(b.flags?.[SYSTEM_ID] ?? {}), [STORM_TERRAIN_FLAG]: true }", to: "[SYSTEM_ID]: { [STORM_TERRAIN_FLAG]: true }", breaks: "T10" },
  { name: "the movement workflow never tells the relief", file: MVW, from: "      magicalTerrain: () => onlyMagicalTerrain(costingTerrainOnPath(movement))\n", to: "      magicalTerrain: false\n", breaks: "T11" },
  // M (C17)
  { name: "the drag's own spend is counted twice", file: MV, from: "  if (String(use ?? \"\").trim()) return false;\n", to: "", breaks: "M1/M6" },
  { name: "the book's word \"Movement\" is not read", file: MV, from: "  return /\\bmove(?:ment)?\\b/i.test(text);", to: "  return /\\bmove\\b/i.test(text);", breaks: "M1" },
  { name: "the record never starts again", file: MV, from: "ap: (same ? Math.max(0, Number(record.ap) || 0) : 0) + spent };", to: "ap: Math.max(0, Number(record?.ap) || 0) + spent };", breaks: "M2" },
  { name: "feet are the terrain's price", file: MV, from: "    feet += Math.max(0, Number(pool?.movedFeet) || 0);", to: "    feet += Math.max(0, Number(pool?.movedCost) || 0);", breaks: "M3" },
  { name: "another turn's actions count", file: MV, from: "  if (same) ap += Math.max(0, Number(record.ap) || 0);", to: "  if (record) ap += Math.max(0, Number(record.ap) || 0);", breaks: "M4" },
  { name: "a Movement-trait action's AP is never recorded", file: APW, from: "    ...(countsAsMovementAp({ use, traits })\n", to: "    ...(false\n", breaks: "M6" },
  { name: "a Stride records no feet", file: MVW, from: "  stridePool.movedFeet = (Number(stridePool.movedFeet) || 0) + proposedDistance(movement);\n", to: "", breaks: "M8" },
  { name: "a stale tally answers outside combat", file: MVW, from: "  if (!actor || !combat?.started) return { feet: 0, apOnMovement: 0 };", to: "  if (!actor) return { feet: 0, apOnMovement: 0 };", breaks: "M7" },
  { name: "the movement helper is not on the API", file: APIW, from: "      movementThisTurn: async (actor) =>", to: "      movementThisTurnX: async (actor) =>", breaks: "M5/M7" },
  // P (C18)
  { name: "THE GAP: an incorporeal mover is stopped by an enemy", file: SP, from: "  if (incorporeal) return { allowed: true, needsTumble: false, multiplier: 1, reason: \"incorporeal — passes through\" };\n", to: "", breaks: "P1" },
  { name: "a switched-off form still passes", file: SP, from: "    if (!effect || effect.disabled || effect.isSuppressed === true) continue;", to: "    if (!effect) continue;", breaks: "P4" },
  { name: "the space rules never pass it on", file: MVW, from: "      swarm: moverIsSwarm || isSwarm(other.actor?.system),\n      incorporeal\n    });", to: "      swarm: moverIsSwarm || isSwarm(other.actor?.system)\n    });", breaks: "P5" },
  // S (C19)
  { name: "THE DEFECT: Shadow Stance is not a stance", file: FW, from: "    flags: { [SYSTEM_ID]: { [FEAT_STANCE_FLAG]: true } }\n", to: "", breaks: "S2" },
  { name: "Open is asked of a reaction", file: FW, from: "  const traits = ignoreOpen\n", to: "  const traits = false\n", breaks: "S4" },
  { name: "the reaction pays the printed AP", file: FW, from: "  const cost = Math.max(0, Math.trunc(Number(apCost) || 0));", to: "  const cost = 1;", breaks: "S4" },
  { name: "the stance before it lingers", file: FW, from: "  if (others.length > keep) {", to: "  if (false) {", breaks: "S5" },
  { name: "the button no longer runs the body", file: FW, from: "      await enterShadowStanceFor(actor, item);\n", to: "", breaks: "S9" },
  { name: "the stance helper is not offered", file: FW, from: "  enterShadowStance: async (actor,", to: "  enterShadowStanceX: async (actor,", breaks: "S1" },
  { name: "the effect is renamed and the attack workflow loses it", file: FW, from: "    name: \"Shadow Stance\",\n    img: item.img,", to: "    name: \"Shadow Stance (stance)\",\n    img: item.img,", breaks: "S3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block5b-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block5b-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-ea-block5b-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block5b-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
