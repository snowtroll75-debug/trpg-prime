#!/usr/bin/env node
/**
 * mutate-magical-attacks — four mutations against verify-magical-attacks.mjs:
 * the target axis ignored, the weapon axis ignored, a disabled effect
 * read, and the damage path no longer asking.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = path.join(SYSTEM_ROOT, "module", "combat", "magical-attacks.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "the target axis is ignored", file: M, from: "    if (d.targetUuids.length && (!uuid || !d.targetUuids.includes(uuid))) continue;\n", to: "", breaks: "B2" },
  { name: "the weapon axis is ignored", file: M, from: "    if (d.weaponNames.length && (!name || !d.weaponNames.includes(name))) continue;\n", to: "", breaks: "B3" },
  { name: "a disabled effect is read", file: M, from: "    if (!effect || effect.disabled) continue;", to: "    if (!effect) continue;", breaks: "A1" },
  { name: "the damage path no longer asks", file: A, from: "      || Boolean(magicalAttackSource(declaredMagicalAttacks(", to: "      || false && Boolean(magicalAttackSource(declaredMagicalAttacks(", breaks: "C1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-magical-attacks.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([M, A]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-magical-attacks: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-magical-attacks: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-magical-attacks: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
