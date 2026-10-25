#!/usr/bin/env node
/**
 * mutate-ff30-block35 — the mutation half of verify-ff30-block35 (3.663.4).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CR = m("creature-ability-rules.mjs");
const MUTATIONS = [
  { name: "the Plant type is not Plant Resistance (3.663.3 as shipped)", file: CR, from: '\n    || Array.from(items ?? []).some((i) => i?.type === "creature-type" && i?.system?.critOnlyDamage === true);', to: ";", breaks: "F1" },
  { name: "any item carrying the flag counts", file: CR, from: 'i?.type === "creature-type" && i?.system?.critOnlyDamage === true', to: 'i?.system?.critOnlyDamage === true', breaks: "F1" },
  { name: "bleeding is offered rather than kept", file: CR, from: 'if (key === "bleeding" || /^recurring/.test(key) || tag?.recurring) keep.push(tag);', to: 'if (/^recurring/.test(key) || tag?.recurring) keep.push(tag);', breaks: "F1b" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block35.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block35: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block35: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block35: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
