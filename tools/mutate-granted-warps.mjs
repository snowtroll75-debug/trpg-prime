#!/usr/bin/env node
/**
 * mutate-granted-warps — five mutations against verify-granted-warps.mjs:
 * the name axis ignored, the innate axis ignored, the granted warps
 * dropped from the merge, the daily-limit waiver never aggregated, and
 * the relief case ignoring the waiver.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const G = path.join(SYSTEM_ROOT, "module", "magic", "granted-warps.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const MUTATIONS = [
  { name: "the name axis is ignored", file: G, from: "      if (m.name && m.name !== name) continue;\n", to: "", breaks: "B4 — Fireball gets Restoration's warp" },
  { name: "the innate axis is ignored", file: G, from: "      if (m.innate !== null && m.innate !== undefined && m.innate !== innate) continue;\n", to: "", breaks: "B3" },
  { name: "the granted warps are dropped from the merge", file: G, from: "  return [...own, ...granted];", to: "  return [...own];", breaks: "B6" },
  { name: "the waiver is never aggregated", file: W, from: "    if (m.ignoreDailyLimit) mods.ignoreDailyLimit = true;\n", to: "", breaks: "C1" },
  { name: "the relief case ignores the waiver", file: E, from: "if (!warpMods?.ignoreDailyLimit && alreadyRelievedToday(reliefRecord, reliefSpec.oncePerDay))", to: "if (alreadyRelievedToday(reliefRecord, reliefSpec.oncePerDay))", breaks: "D3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-granted-warps.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([G, W, E]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-granted-warps: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-granted-warps: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-granted-warps: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
