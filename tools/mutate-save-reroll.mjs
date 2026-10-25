#!/usr/bin/env node
/**
 * mutate-save-reroll — six mutations against verify-save-reroll.mjs: the
 * warp's degrees ignored by rerollCovers, the bonus never aggregated, the
 * offerable degrees read off the row alone, the reroll made whatever the
 * warps covered, the relief table losing Sickened, and the rider growing
 * above half HP.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "save-reroll.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "save-reaction-spells-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "condition-relief.mjs");
const D = path.join(SYSTEM_ROOT, "module", "combat", "damage-riders.mjs");
const MUTATIONS = [
  { name: "rerollCovers ignores the warp's degrees", file: R, from: "  return (Array.isArray(warpMods?.rerollDegrees) ? warpMods.rerollDegrees : []).map(lower).includes(key);", to: "  return false;", breaks: "C2" },
  { name: "the bonus is never aggregated", file: W, from: "    if (m.rerollBonus) mods.rerollBonus += Number(m.rerollBonus) * times;\n", to: "", breaks: "C1" },
  { name: "the offerable degrees are the row's alone", file: R, from: "    for (const d of Array.isArray(w?.mods?.rerollDegrees) ? w.mods.rerollDegrees : []) if (DEGREES.includes(lower(d))) out.add(lower(d));\n", to: "", breaks: "B2" },
  { name: "the reroll is made whatever the warps covered", file: F, from: "  if (!rerollCovers(chosen.spec, result.warpMods, degree.key)) {", to: "  if (false) {", breaks: "F1" },
  { name: "the immunity span is not said", file: F, from: "saver.name, bonus?.value ?? 0, chosen.spec.immunitySeconds);", to: "saver.name, bonus?.value ?? 0);", breaks: "F1b" },
  { name: "a span in minutes reads as seconds", file: R, from: "    : secs % 60 === 0 ? `${secs / 60} minute${secs === 60 ? \"\" : \"s\"}` : `${secs} seconds`;", to: "    : `${secs} seconds`;", breaks: "C5" },
  { name: "Sickened leaves the relief table", file: C, from: "  sickened: Object.freeze({ label: \"Sickened\", step: 1 }),\n", to: "", breaks: "D1" },
  { name: "the rider grows above half HP too", file: D, from: "  const low = max > 0 && Number.isFinite(hp) && hp <= Math.floor(max / 2);", to: "  const low = max > 0 && Number.isFinite(hp);", breaks: "E2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-save-reroll.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([R, W, F, C, D]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-save-reroll: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-save-reroll: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-save-reroll: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
