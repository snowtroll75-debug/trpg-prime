#!/usr/bin/env node
/**
 * mutate-ff30-block29 — the mutation half of verify-ff30-block29 (3.660.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DS = m("combat", "declared-after-strikes.mjs"), DW = m("combat", "declared-after-strikes-workflow.mjs"), SDM = m("conditions", "soul-drain.mjs"), EV = m("conditions", "condition-events-workflow.mjs");
const MUTATIONS = [
  { name: "the drain degrees are lost", file: DS, from: "    damageAsDrain: list(raw.damageAsDrain),", to: "    damageAsDrain: [],", breaks: "B1" },
  { name: "a window with no degree is kept", file: DS, from: "    immuneOn: raw.immuneOn && typeof raw.immuneOn === \"object\" && list(raw.immuneOn.degrees).length", to: "    immuneOn: raw.immuneOn && typeof raw.immuneOn === \"object\"", breaks: "B1" },
  { name: "the immunity never ends", file: DS, from: "  return Number(record?.[key] ?? 0) > Number(now || 0);", to: "  return Number(record?.[key] ?? 0) > 0;", breaks: "B2" },
  { name: "the follow-on is dropped", file: DS, from: "Array.isArray(row.followOn.tags) && row.followOn.tags.length) tag.followOn = { ...row.followOn };", to: "Array.isArray(row.followOn.tags) && row.followOn.tags.length) tag.followOn = null;", breaks: "B3" },
  { name: "the immune are corrupted again", file: DW, from: "        lines.push(`<em>${spec.label}: ${targetActor.name} is still immune to ${actor.name}'s ${spec.label}.</em>`);\n        continue;", to: "        lines.push(`<em>${spec.label}: ${targetActor.name} is still immune to ${actor.name}'s ${spec.label}.</em>`);", breaks: "S1" },
  { name: "the save never hears the damage", file: DW, from: "rollDeclaredSave(actor, targetActor, spec, level, critical, damageTaken)", to: "rollDeclaredSave(actor, targetActor, spec, level, critical)", breaks: "S1" },
  { name: "the damage is drained without being given back", file: DW, from: "    await healActor(targetActor, taken, { magical: true });\n", to: "", breaks: "S2" },
  { name: "the clamp is struck again (what 3.660.0 did)", file: SDM, from: "  return Math.max(0, owed - clamped);", to: "  return owed;", breaks: "B4" },
  { name: "the drain deals its whole amount anyway", file: EV, from: "    const result = await applyDamageAndCheckDying(actor, owed);", to: "    const result = await applyDamageAndCheckDying(actor, damage);", breaks: "S3" },
  { name: "no window opens", file: DW, from: "  if (spec.immuneOn?.degrees.includes(degree) && targetActor.setFlag) {", to: "  if (false) {", breaks: "S2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block29.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block29: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block29: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block29: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
