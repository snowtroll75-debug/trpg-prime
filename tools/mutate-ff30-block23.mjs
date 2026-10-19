#!/usr/bin/env node
/**
 * mutate-ff30-block23 — the mutation half of verify-ff30-block23 (3.656.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CR = m("codex-action-rules.mjs"), AW = m("combat", "attack-workflow.mjs"), CW = m("codex-actions-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "a word that merely ends in recurring counts", file: CR, from: "/\\brecurring\\s*\\+\\s*(\\d+)/i", to: "/recurring\\s*\\+\\s*(\\d+)/i", breaks: "B1" },
  { name: "every spell may be combined", file: CR, from: ".filter((i) => i?.type === \"spell\" && i.system?.innate === true\n", to: ".filter((i) => i?.type === \"spell\"\n", breaks: "B2" },
  { name: "the tradition is not read", file: CR, from: "&& (!want || ", to: "&& (true || ", breaks: "B3" },
  { name: "the Fiery Slam lays nothing (what 3.655.1 did)", file: AW, from: "      if (recurring > 0) lines.push(", to: "      if (false) lines.push(", breaks: "S1" },
  { name: "an immune target burns anyway", file: AW, from: "  if (immune) return `<em>No recurring", to: "  if (false) return `<em>No recurring", breaks: "S1" },
  { name: "two recurrings add instead of keeping the stronger", file: AW, from: "  const next = recurringAfterHit(existing, amount, damageType);\n  await targetActor.toggleStatusEffect(\"recurring\"", to: "  const next = { value: amount + (existing?.value ?? 0), damageType };\n  await targetActor.toggleStatusEffect(\"recurring\"", breaks: "S1" },
  { name: "the AP is spent before the spell is chosen", file: CW, from: "  const spell = spells[Number(index)];\n  if (!(await spendAp(actor, spec.ap ?? 2, item.name))) return false;", to: "  const spell = spells[Number(index)];\n  if (!(await spendAp(actor, 0, item.name))) return false;", breaks: "S2" },
  { name: "the innate is never cast", file: CW, from: "  await castSpell(actor, spell, { presetTargets: true, apPaid: true, carried: { label: weapon.name, attackBonus:", to: "  void (castSpell, spell, { presetTargets: true, apPaid: true, carried: { label: weapon.name, attackBonus:", breaks: "S2" },
  { name: "the kind is not registered", file: CW, from: "const KINDS = Object.freeze({ strikeWithInnate, constrict,", to: "const KINDS = Object.freeze({ constrict,", breaks: "S2" },
  { name: "the innate keeps its own attack", file: CAST, from: "  const innateAttackHere = Number.isFinite(carried?.attackBonus)\n", to: "  const innateAttackHere = false\n", breaks: "S3" },
  { name: "the Strike's penalty rides into the spell (what 3.656.0 did)", file: CR, from: "    if (/multiple attack penalty|range increment/i.test(label) || String(m?.type ?? \"\").toLowerCase() === \"circumstance\") return sum;\n", to: "", breaks: "B4" },
  { name: "the circumstance is kept", file: CR, from: " || String(m?.type ?? \"\").toLowerCase() === \"circumstance\") return sum;", to: ") return sum;", breaks: "B4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block23.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block23: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block23: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block23: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
