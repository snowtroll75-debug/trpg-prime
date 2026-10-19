#!/usr/bin/env node
/**
 * mutate-ff30-block24 — the mutation half of verify-ff30-block24 (3.657.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PE = m("peril-effect.mjs"), PW = m("peril-workflow.mjs"), DW = m("combat", "damage-workflow.mjs"), AW = m("combat", "attack-workflow.mjs"), GO = m("combat", "grab-only.mjs");
const MUTATIONS = [
  { name: "a minor critical blinds too", file: PE, from: "  if (at < 0 || at < Math.max(0, min)) return [];", to: "  if (at < 0) return [];", breaks: "B1" },
  { name: "a blank condition row is kept", file: PE, from: ".filter((c) => c && String(c.key ?? \"\").trim());", to: ".filter((c) => c);", breaks: "B1" },
  { name: "a bracketed kind is missed", file: PE, from: " || [...have].some((h) => h.split(/[\\s,()]+/).includes(k))", to: "", breaks: "B2" },
  { name: "the grab trait matches a lookalike", file: GO, from: "/(^|[\\s,(])grab([\\s,)]|$)/i", to: "/grab/i", breaks: "B3" },
  { name: "the swarm passes nothing on (what 3.656.1 did)", file: PW, from: "    if (spec.exposeOnDamage?.affliction && record.damage > 0) {", to: "    if (false) {", breaks: "S1" },
  { name: "the swarm infects the unhurt", file: PW, from: "    if (spec.exposeOnDamage?.affliction && record.damage > 0) {", to: "    if (spec.exposeOnDamage?.affliction) {", breaks: "S1" },
  { name: "the critical blinds nobody", file: PW, from: "      const rows = severityConditions(spec, sev)", to: "      const rows = severityConditions(spec, null)", breaks: "S2" },
  { name: "the vampire stays immune", file: PW, from: "          ignoreImmunityTo: bypassKind ? takenType : \"\",", to: "          ignoreImmunityTo: \"\",", breaks: "S3" },
  { name: "every immunity is bypassed", file: DW, from: "  if (packet.immune && bypass && bypass === String(type ?? \"\").trim().toLowerCase()) {", to: "  if (packet.immune && bypass) {", breaks: "S3" },
  { name: "the grab trait grabs nobody", file: AW, from: "    if (strikeLands && outcome.hits && targetActor && hasGrabTrait(weapon)) {", to: "    if (false) {", breaks: "S4" },
  { name: "a missed or carried strike grabs", file: AW, from: "    if (strikeLands && outcome.hits && targetActor && hasGrabTrait(weapon)) {", to: "    if (targetActor && hasGrabTrait(weapon)) {", breaks: "S4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block24.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block24: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block24: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block24: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
