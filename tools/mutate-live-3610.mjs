#!/usr/bin/env node
/**
 * mutate-live-3610 — can verify-live-3610 fail?
 *
 * NEW at 3.610.1. Each mutation puts back one of the shipped defects the
 * 3.610.0 drive found. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const HIT = at("module", "magic", "area-save-workflow.mjs");
const STORM = at("module", "magic", "storm.mjs");
const STORM_FLOW = at("module", "magic", "storm-workflow.mjs");
const WALL = at("module", "magic", "wall-spell.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const VERIFY = at("tools", "verify-live-3610.mjs");

const MUTATIONS = [
  { file: HIT, name: "F1 — Number(null) is a total again",
    from: "  const given = amount === null || amount === undefined || amount === \"\" ? NaN : Number(amount);\n  let base = given;",
    to: "  let base = Number(amount);", breaks: "A1/A2/A3" },
  { file: HIT, name: "F1 — the formula is never rolled",
    from: "  if (!Number.isFinite(base)) base = formula ? (await new Roll(formula).evaluate()).total : 0;",
    to: "  if (!Number.isFinite(base)) base = 0;", breaks: "A2" },
  { file: STORM_FLOW, name: "F1 — lightning passes a zero total",
    from: "  let amount = null;\n", to: "  let amount = 0;\n", breaks: "A6" },
  { file: STORM, name: "F2 — every Sustain is the first",
    from: "  return Number(lastRound) === Number(round);", to: "  return false;", breaks: "B3" },
  { file: STORM, name: "F2 — a storm never struck counts as struck in round 0",
    from: "  if (lastRound === null || lastRound === undefined || lastRound === \"\") return false;\n", to: "", breaks: "B2" },
  { file: STORM_FLOW, name: "F2 — the guard is skipped",
    from: "  if (stormStruckThisRound(record.sustainRound, round)) {", to: "  if (false) {", breaks: "B5" },
  { file: STORM_FLOW, name: "F2 — the round is never remembered",
    from: "  if (round !== null) record.sustainRound = round;\n", to: "", breaks: "B7" },
  { file: WALL, name: "G1 — 'thickness thick' again",
    from: "    ? ` (${/thick/i.test(spec.thickness) ? spec.thickness : `${spec.thickness} thick`})`",
    to: "    ? ` (${spec.thickness} thick)`", breaks: "C1" },
  { file: WALL, name: "G1 — a ring is a 20 ft wall again",
    from: "  if (placed?.form === \"ring\") return { t: \"wall\", distance: spec.ringRadiusFeet, shape: \"radius ring\" };\n",
    to: "", breaks: "C3" },
  { file: CAST, name: "G1 — the cast never re-describes a ring",
    from: "      if (wallSpec && placed?.form === \"ring\") Object.assign(areaConfig, wallAreaConfig(wallSpec, placed));\n",
    to: "", breaks: "C5" },
  { file: CAST, name: "G2 — a dissipated wall is not remembered",
    from: "          wallDissipated = true;\n", to: "", breaks: "D3" },
  { file: CAST, name: "G2 — a dissipated wall's notes are printed",
    // RE-ANCHORED AT 3.622.0: the expression is wrapped by the polymorph filter.
    from: "(wallDissipated ? (effEffects ?? []).filter((r) => r?.kind !== \"note\") : effEffects)",
    to: "(effEffects)", breaks: "D4" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-live-3610 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-live-3610: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-live-3610: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
