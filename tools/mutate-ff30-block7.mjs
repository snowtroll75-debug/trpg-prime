#!/usr/bin/env node
/**
 * mutate-ff30-block7 — the mutation half of verify-ff30-block7 (3.637.1).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AM = m("combat", "ammunition.mjs"), AMW = m("combat", "ammunition-workflow.mjs");

const MUTATIONS = [
  { name: "a natural missile wants arrows", file: AM, from: "  if (String(weaponSystem?.category ?? \"\").trim().toLowerCase() === \"natural\") return false;\n", to: "", breaks: "A1" },
  { name: "the category is read case-sensitively", file: AM, from: "String(weaponSystem?.category ?? \"\").trim().toLowerCase() === \"natural\"", to: "String(weaponSystem?.category ?? \"\") === \"natural\"", breaks: "A1" },
  { name: "the workflow asks every weapon for rounds", file: AMW, from: "  if (!weaponUsesAmmunition(weapon?.system)) return none;", to: "", breaks: "B1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block7.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block7: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block7: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block7: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
