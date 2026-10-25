#!/usr/bin/env node
/**
 * mutate-recovery-companions — five mutations against
 * verify-recovery-companions.mjs: the extra applied on every degree, the
 * extra never applied, a Partial counted as a success, the refocused
 * ability itself offered again, and the rest no longer asking.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const V = path.join(SYSTEM_ROOT, "module", "rest", "recovery.mjs");
const F = path.join(SYSTEM_ROOT, "module", "combat", "refocus.mjs");
const W = path.join(SYSTEM_ROOT, "module", "rest", "rest-workflow.mjs");
const MUTATIONS = [
  { name: "the extra is applied on every degree", file: V, from: "    .filter((e) => e.degrees.includes(String(degreeKey ?? \"\")))\n", to: "", breaks: "A3" },
  { name: "the extra is never applied", file: V, from: "      return level + extra;", to: "      return level;", breaks: "A3" },
  { name: "a Partial counts as a success", file: F, from: "return [\"heroic\", \"critical\", \"success\"].includes(", to: "return [\"heroic\", \"critical\", \"success\", \"partial\"].includes(", breaks: "B2" },
  { name: "the refocused ability is offered again", file: F, from: "i && i.id !== chosenId && i.spent &&", to: "i && i.spent &&", breaks: "B3" },
  { name: "the rest no longer asks", file: W, from: "          powerRecoveryExtras(Array.from(actor.appliedEffects ?? actor.effects ?? [])));", to: "          []);", breaks: "C1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-recovery-companions.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([V, F, W]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-recovery-companions: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-recovery-companions: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-recovery-companions: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
