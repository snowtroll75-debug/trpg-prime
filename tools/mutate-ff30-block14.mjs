#!/usr/bin/env node
/**
 * mutate-ff30-block14 — the mutation half of verify-ff30-block14 (3.644.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TH = m("magic", "thorns.mjs"), AT = m("combat", "attack-workflow.mjs"), AL = m("ally-aura-effects.mjs");
const MUTATIONS = [
  { name: "critical-only is not read", file: TH, from: "    criticalOnly: raw.criticalOnly === true", to: "    criticalOnly: false", breaks: "M1" },
  { name: "critical-only fires on any blow", file: TH, from: "  if (spec.criticalOnly && !critical) return false;", to: "", breaks: "M2" },
  { name: "the Strike never says it was a critical", file: AT, from: "      distanceFeet: meleeDistance,\n      critical: Boolean(critical)\n", to: "      distanceFeet: meleeDistance\n", breaks: "M3" },
  { name: "a statuses-only effect is dropped", file: AL, from: "&& !warpFreeSchool && !statuses.length) return null;", to: "&& !warpFreeSchool) return null;", breaks: "A1" },
  { name: "the status keeps its case", file: AL, from: "String(s ?? \"\").trim().toLowerCase()).filter(Boolean);", to: "String(s ?? \"\").trim()).filter(Boolean);", breaks: "A1" },
  { name: "the grant forgets its status", file: AL, from: "    ...(fx.statuses?.length ? { statuses: [...fx.statuses] } : {}),\n", to: "", breaks: "A2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block14.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block14: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block14: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block14: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
