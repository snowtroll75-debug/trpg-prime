#!/usr/bin/env node
/**
 * mutate-feat-hooks-3625 — six mutations against verify-feat-hooks-3625.mjs:
 * the variant applied regardless of the feat, the variant mutating the
 * entry, the difference read as a sum, a Partial boosted, the boost
 * uncapped, and the hook dropped.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const F = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const C = path.join(SYSTEM_ROOT, "module", "conditionals.mjs");
const A = path.join(SYSTEM_ROOT, "module", "skill-aid.mjs");
const B = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const MUTATIONS = [
  { name: "the variant applies regardless of the feat", file: F, from: "  const variant = variants.find((v) => v && owned.has(String(v.feat ?? \"\").trim().toLowerCase()));", to: "  const variant = variants[0];", breaks: "A1" },
  { name: "the variant mutates the entry", file: F, from: "  const out = { ...action, variantApplied: String(variant.feat) };", to: "  const out = action; out.variantApplied = String(variant.feat);", breaks: "A3" },
  { name: "the difference is read as a sum", file: C, from: "    return Math.trunc(a) - Math.trunc(b);", to: "    return Math.trunc(a) + Math.trunc(b);", breaks: "B2" },
  { name: "a Partial is boosted too", file: A, from: "  const success = [\"success\", \"critical\", \"heroic\"].includes(", to: "  const success = [\"partial\", \"success\", \"critical\", \"heroic\"].includes(", breaks: "C2" },
  { name: "the boost is uncapped", file: A, from: "value = Math.min(boost.max, value + boost.value);", to: "value = value + boost.value;", breaks: "C2" },
  { name: "the hook is dropped", file: B, from: "      if (actor) Hooks.callAll(\"trgPrimeInitiativeRolled\", { actor, combatant: this.combatants.get(id), combat: this });\n", to: "", breaks: "D1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-feat-hooks-3625.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([F, C, A, B]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-feat-hooks-3625: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-feat-hooks-3625: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-feat-hooks-3625: OK — all ${results.length} mutations caught, tree restored.\n`);
