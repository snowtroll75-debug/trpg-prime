#!/usr/bin/env node
/**
 * mutate-ff30-block31 — the mutation half of verify-ff30-block31 (3.662.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DS = m("combat", "declared-after-strikes.mjs"), PW = m("peril-workflow.mjs"), AW = m("combat", "declared-after-strikes-workflow.mjs");
const DW = m("combat", "dying-workflow.mjs"), CT = m("creature-type-rules.mjs"), ATW = m("combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "the Plant gate comes back", file: DW, from: "  const creatureTypeSystem = ownedCreatureTypeSystem(actor);\n", to: "  const creatureTypeSystem = ownedCreatureTypeSystem(actor);\n  if (creatureTypeSystem?.critOnlyDamage && !isCritical) return { case: \"no-damage-not-critical\", newHP: 0 };\n", breaks: "F1" },
  { name: "Plant Resistance is dropped", file: ATW, from: "const { hasPlantResistance, plantResistanceSplit } = await import(", to: "const { hasPlantResistance, plantResistanceSplit } = await import(/*x*/", breaks: "F1c" },
  { name: "dice durations are not recognised", file: DS, from: "  if (diceRounds(row?.rounds)) tag.roundsDice", to: "  if (false) tag.roundsDice", breaks: "D1" },
  { name: "the unrolled duration also sets a clock", file: DS, from: "  const rounds = tag.roundsDice ? 0 : Math.trunc(Number(row?.rounds) || 0);", to: "  const rounds = Math.trunc(Number(row?.rounds) || 0) || 1;", breaks: "D1" },
  { name: "outside combat a round is a minute", file: DS, from: "  else rest.expiresTime = Number(worldTime || 0) + rounds * 6;", to: "  else rest.expiresTime = Number(worldTime || 0) + rounds * 60;", breaks: "D2" },
  { name: "a rolled 0 lasts no rounds", file: DS, from: "  const rounds = Math.max(1, Math.trunc(Number(rolled) || 0));", to: "  const rounds = Math.trunc(Number(rolled) || 0);", breaks: "D4" },
  { name: "a plain number counts as dice", file: DS, from: "/^\\s*\\d*d\\d+\\s*([+-]\\s*\\d+)?\\s*$/i", to: "/^\\s*\\d*d?\\d+\\s*([+-]\\s*\\d+)?\\s*$/i", breaks: "D3" },
  { name: "the area never rolls it", file: PW, from: "      if (tag.roundsDice) { const r", to: "      if (false) { const r", breaks: "S1" },
  { name: "a strike never rolls it", file: AW, from: "    if (tag.roundsDice) { const r", to: "    if (false) { const r", breaks: "S2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block31.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block31: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block31: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block31: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
