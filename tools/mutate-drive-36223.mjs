#!/usr/bin/env node
/**
 * mutate-drive-36223 — can verify-drive-36223 fail?
 *
 * NEW at 3.622.4. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const LW = path.join(SYSTEM_ROOT, "module", "light-workflow.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-drive-36223.mjs");

const MUTATIONS = [
  { file: LW, name: "O1 — THE OLD DEFECT: one cast's circles stack", from: "      if (seen.has(castId)) return false;\n", to: "", breaks: "A1" },
  { file: LW, name: "every spell counts once in all", from: "      if (!castId || !r?.getFlag?.(SYSTEM_ID, \"lightShift\")) return true;\n      if (seen.has(castId)) return false;\n      seen.add(castId);", to: "      if (!r?.getFlag?.(SYSTEM_ID, \"lightShift\")) return true;\n      if (seen.size) return false;\n      seen.add(castId);", breaks: "A2/A3/A4" },
  { file: LW, name: "a hand-drawn circle collapses with another", from: "      if (!castId || !r?.getFlag?.(SYSTEM_ID, \"lightShift\")) return true;", to: "      if (!r?.getFlag?.(SYSTEM_ID, \"lightShift\")) return true;", breaks: "A4" },
  { file: LW, name: "the cap is dropped", from: "cap: Number(s.cap) || 10 }));\n}", to: "cap: 10 }));\n}", breaks: "B2" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-drive-36223: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-drive-36223: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-36223: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
