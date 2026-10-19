#!/usr/bin/env node
/**
 * mutate-ff30-block30 — the mutation half of verify-ff30-block30 (3.661.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const GO = m("combat", "grab-only.mjs"), AW = m("combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "a blank key lays a condition", file: GO, from: "  return key ? { key } : null;", to: "  return raw ? { key } : null;", breaks: "B1" },
  { name: "the card forgets Escape", file: GO, from: ". It may Escape to free itself.`;", to: ".`;", breaks: "B2" },
  { name: "the Web wounds as well (what 3.660.1 did)", file: AW, from: "  const strikeLands = !grabOnly && !hitCondition && !spellCarried;", to: "  const strikeLands = !grabOnly && !spellCarried;", breaks: "S1" },
  { name: "the condition is never laid", file: AW, from: "  if (hitCondition && outcome.hits && targetActor) {", to: "  if (false) {", breaks: "S1" },
  { name: "a Web hit offers a carried spell", file: AW, from: "  if (!grabOnly && !hitCondition && outcome.hits && targetActor) {", to: "  if (!grabOnly && outcome.hits && targetActor) {", breaks: "S1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block30.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block30: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block30: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block30: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
