#!/usr/bin/env node
/**
 * mutate-equipment-conditionals — four mutations against
 * verify-equipment-conditionals.mjs: the gate dropped, the gate applied
 * to every type, the gate ignoring destruction, and the gate applied to
 * effects too.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const MUTATIONS = [
  { name: "the gate is dropped", file: C, from: "      if (kind === \"item\" && !equipmentInUse(document)) continue;\n", to: "", breaks: "A1 — a coat in the pack protects" },
  { name: "every item type is gated", file: C, from: "  if (!EQUIPMENT_TYPES.includes(String(item?.type ?? \"\"))) return true;", to: "  if (!EQUIPMENT_TYPES.includes(String(item?.type ?? \"\"))) return Boolean(item?.system?.equipped);", breaks: "A6 — a feat has to be 'equipped'" },
  { name: "destruction is ignored", file: C, from: "  return wornAndStanding(item);", to: "  return Boolean(item?.system?.equipped);", breaks: "A3" },
  { name: "effects are gated too", file: C, from: "      if (kind === \"item\" && !equipmentInUse(document)) continue;", to: "      if (!equipmentInUse(document)) continue;", breaks: "A8 — an effect is not equipment" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-equipment-conditionals.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([C]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-equipment-conditionals: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-equipment-conditionals: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-equipment-conditionals: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
