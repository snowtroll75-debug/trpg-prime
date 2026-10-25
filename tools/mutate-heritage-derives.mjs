#!/usr/bin/env node
/** mutate-heritage-derives — the mutation half of verify-heritage-derives. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CAR = m("creature-ability-rules.mjs"), EW = m("combat", "exhaustion-workflow.mjs"), DW = m("drowning-workflow.mjs");
const MUTATIONS = [
  { name: "heat immunity in every environment", file: CAR, from: "  if (String(environment ?? \"\") !== \"extremeHeat\") return null;\n  for (const { item, derives } of abilityDerives(items)) if (derives.heatEnvironmentImmune === true)", to: "  for (const { item, derives } of abilityDerives(items)) if (derives.heatEnvironmentImmune === true)", breaks: "A2" },
  { name: "any truthy heat derive counts", file: CAR, from: "derives.heatEnvironmentImmune === true", to: "derives.heatEnvironmentImmune", breaks: "A2" },
  { name: "the check never asks", file: EW, from: "  if (heatImmune) {\n", to: "  if (false) {\n", breaks: "A3" },
  { name: "the check goes on anyway", file: EW, from: "no damage, no Fatigue.</p>`]);\n    return null;\n", to: "no damage, no Fatigue.</p>`]);\n", breaks: "A3" },
  { name: "any truthy water derive counts", file: CAR, from: "derives.breathesWater === true", to: "derives.breathesWater", breaks: "B2" },
  { name: "a heritage grants no weapons", file: m("grants-workflow.mjs"), from: "    { field: \"grantedSpells\", pack: \"spells\" },\n    // A HERITAGE MAY GRANT A NATURAL ATTACK (3.664.0).", to: "    { field: \"grantedSpells\", pack: \"spells\" }\n  ],\n  zzz: [\n    // A HERITAGE MAY GRANT A NATURAL ATTACK (3.664.0).", breaks: "C1" },
  { name: "a scoped increase reaches every condition", file: m("combat", "attack.mjs"), from: "    if (wanted.length && !wanted.includes(String(condition ?? \"\").trim().toLowerCase())) return 0;\n", to: "", breaks: "D1" },
  { name: "a negative increase subtracts", file: m("combat", "attack.mjs"), from: "    return Math.max(0, Number(raw.value) || 0);", to: "    return Number(raw.value) || 0;", breaks: "D2" },
  { name: "the declaration is read without its condition", file: m("combat", "targeting.mjs"), from: "missCheckIncreaseFor(e.getFlag?.(\"trg-prime\", \"missCheckDCIncrease\"), condition)", to: "missCheckIncreaseFor(e.getFlag?.(\"trg-prime\", \"missCheckDCIncrease\"), \"hidden\")", breaks: "D3" },
  { name: "magical-only Ghost Touch reaches mundane strikes", file: m("combat", "attack-workflow.mjs"), from: "    if (raw.magicalOnly === true && !magical) continue;\n", to: "", breaks: "E1" },
  { name: "the water breather holds its breath", file: DW, from: "  if (amphibious) {\n", to: "  if (false) {\n", breaks: "B3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-heritage-derives.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-heritage-derives: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-heritage-derives: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-heritage-derives: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
