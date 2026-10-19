#!/usr/bin/env node
/**
 * mutate-ff30-block34 — the mutation half of verify-ff30-block34 (3.663.3).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AW = m("combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "Pack Attack is labelled Precision Hunter again", file: AW, from: 'packDice ? { dice: packDice, label: "Pack Attack"', to: 'packDice ? { dice: packDice, label: "Precision Hunter"', breaks: "F1" },
  { name: "the breakdown never reaches the damage step", file: AW, from: "sneakDice = 0, precisionDice = 0, precisionParts = null, damageRiders = [],", to: "sneakDice = 0, precisionDice = 0, damageRiders = [],", breaks: "F1b" },
  { name: "the card ignores the breakdown", file: AW, from: "const parts = Array.isArray(precisionParts) && precisionParts.length ? precisionParts :", to: "const parts = false ? precisionParts :", breaks: "F1c" },
  { name: "Pack Attack's die leaves the roll", file: AW, from: "const compoundPrecision = Math.max(0, Math.floor(Number(extraPrecisionDice) || 0)) + packDice;", to: "const compoundPrecision = Math.max(0, Math.floor(Number(extraPrecisionDice) || 0));", breaks: "F1d" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block34.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block34: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block34: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block34: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
