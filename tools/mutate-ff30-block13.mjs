#!/usr/bin/env node
/**
 * mutate-ff30-block13 — the mutation half of verify-ff30-block13 (3.643.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const R = m("codex-action-rules.mjs"), ST = m("combat", "strike-type-options.mjs"), AT = m("combat", "attack-workflow.mjs"), CX = m("codex-actions-workflow.mjs");
const MUTATIONS = [
  { name: "the ability's weapon is never refused", file: R, from: '  return via && !viaAbility ? via : "";', to: '  return "";', breaks: "X1" },
  { name: "the ability's own strike is refused too", file: R, from: '  return via && !viaAbility ? via : "";', to: '  return via;', breaks: "X1" },
  { name: "the name must match its case", file: R, from: '=== want) ?? null;', to: '=== String(spec?.weapon ?? "")) ?? null;', breaks: "X2" },
  { name: "an ability by that name is taken for the weapon", file: R, from: 'find((i) => i?.type === "weapon" && String(i.name', to: 'find((i) => String(i.name', breaks: "X2" },
  { name: "the weapon's own types are not read", file: ST, from: "  const raw = weapon?.flags?.[SYSTEM_ID]?.strikeTypes;", to: "  const raw = [];", breaks: "X3" },
  { name: "the Strike never refuses", file: AT, from: "  if (viaRefused) {\n", to: "  if (false) {\n", breaks: "X4" },
  { name: "the Strike never asks the weapon's types", file: AT, from: ", ...weaponStrikeTypeOptions(weapon)];", to: "];", breaks: "X4" },
  { name: "the action strikes without its pass", file: CX, from: "rollWeaponAttack(actor, weapon, { apPaid: true, viaAbility: true })", to: "rollWeaponAttack(actor, weapon, { apPaid: true })", breaks: "X5" },
  { name: "the action is not a kind", file: CX, from: "heldAdvantage, basicAction, weaponStrike, carrionFeast, sizeShift, strikeBurst, sweepingStrike, toggleEffect });", to: "heldAdvantage, basicAction, carrionFeast, sizeShift, strikeBurst, sweepingStrike, toggleEffect });", breaks: "X5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block13.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block13: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block13: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block13: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
