#!/usr/bin/env node
/**
 * mutate-ff30-block9 — the mutation half of verify-ff30-block9 (3.639.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RULES = m("codex-action-rules.mjs"), CX = m("codex-actions-workflow.mjs");
const DA = m("combat", "declared-after-strikes.mjs"), DW = m("combat", "declared-after-strikes-workflow.mjs");
const DECL = path.join(SYSTEM_ROOT, "tools", "ff30-codex-declarations.mjs");

const MUTATIONS = [
  { name: "requireCondition is ignored", file: RULES, from: "  if (!want) return Array.from(held ?? []);", to: "  return Array.from(held ?? []);", breaks: "M1" },
  { name: "the save halves Mandibles again", file: RULES, from: "  if (!spec?.saveAvoidsCriticalOnly) return basic;", to: "  return basic;", breaks: "M2" },
  { name: "Constrict reaches every held creature", file: CX, from: "const held = constrictTargets(grabbedByActor(actor), spec,", to: "const held = constrictTargets(grabbedByActor(actor), {},", breaks: "M3" },
  { name: "a printed DC is ignored", file: DA, from: "  const base = Number(spec?.dc) > 0 ? Math.trunc(Number(spec.dc)) : Math.trunc(Number(baseDC) || 0);", to: "  const base = Math.trunc(Number(baseDC) || 0);", breaks: "P1" },
  { name: "stacking keeps the declared value", file: DA, from: "  return spec?.stack ? Math.max(0, Number(existing) || 0) + add : add;", to: "  return add;", breaks: "P2" },
  { name: "the threshold fires one early", file: DA, from: "if ((Number(values?.[t.key]) || 0) >= t.atLeast", to: "if ((Number(values?.[t.key]) || 0) >= t.atLeast - 1", breaks: "P3" },
  { name: "a threshold of 0 is kept", file: DA, from: ".filter((t) => t.key && t.apply && t.atLeast > 0),", to: ".filter((t) => t.key && t.apply),", breaks: "P4" },
  { name: "the workflow forgets the threshold", file: DW, from: "  const reached = thresholdConditions(spec, Object.fromEntries", to: "  const reached = [] && thresholdConditions(spec, Object.fromEntries", breaks: "P5" },
  { name: "Foresight offers on damage rolls", file: RULES, from: "\"initiative\", \"flat\"]);", to: "\"initiative\", \"flat\", \"damage\"]);", breaks: "F1" },
  { name: "Foresight's use is never spent", file: CX, from: "  if (counted) await item.update({ \"system.usesValue\": left - 1 });\n  await card(actor, item.name, [\n    line(`${actor.name} holds", to: "  await card(actor, item.name, [\n    line(`${actor.name} holds", breaks: "F2" },
  { name: "Trample takes any weapon again", file: RULES, from: "  return null;\n}", to: "  return list[0] ?? null;\n}", breaks: "T1" },
  { name: "the Codex Trample loses its Hoof", file: DECL, from: "weapon: \"slam\", fallbackWeapons: [\"hoof\"]", to: "weapon: \"slam\"", breaks: "T2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block9.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block9: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block9: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block9: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
