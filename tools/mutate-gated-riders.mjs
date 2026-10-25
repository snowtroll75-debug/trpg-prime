#!/usr/bin/env node
/**
 * mutate-gated-riders — six mutations against verify-gated-riders.mjs:
 * the type gate ignored, the critical gate ignored, half HP read as
 * strictly below, the weapon-name binding dropped, a gated packet left
 * unresolved, and a burnt marker ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "magic", "strike-riders.mjs");
const MUTATIONS = [
  { name: "the type gate is ignored", file: S, from: "    if (!byType && !byTrait) return false;\n", to: "", breaks: "B2" },
  { name: "the critical gate is ignored", file: S, from: "  if (spec.onCritical && !ctx.critical) return false;\n", to: "", breaks: "B2" },
  { name: "half HP read as strictly below", file: S, from: "hp > Math.floor(max / 2)) return false;", to: "hp >= Math.floor(max / 2)) return false;", breaks: "B3" },
  { name: "the weapon-name binding is dropped", file: S, from: "    if (!name || !spec.weaponNames.includes(name)) return false;\n", to: "", breaks: "C3" },
  { name: "a gated packet is left unresolved", file: S, from: "        packet.resolved = true;\n        packet.applies = holds;", to: "        packet.applies = holds;", breaks: "C1" },
  { name: "spendOnHit is lost on the round trip", file: S, from: "  const spendOnHit = raw.spendOnHit === true\n    || String(raw.spendOn ?? \"\").trim().toLowerCase() === \"hit\";", to: "  const spendOnHit = String(raw.spendOn ?? \"\").trim().toLowerCase() === \"hit\";", breaks: "A5" },
  { name: "a miss spends a spend-on-hit rider", file: S, from: "    .filter((spec) => hit || !spec.spendOnHit)\n", to: "    .filter(() => true)\n", breaks: "A4" },
  { name: "a burnt marker is ignored", file: S, from: "    .filter((spec) => !(spec.oncePerRound && ctx?.used?.[spec.id ?? spec.label]))\n", to: "", breaks: "C5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-gated-riders.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([S]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-gated-riders: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-gated-riders: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-gated-riders: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
