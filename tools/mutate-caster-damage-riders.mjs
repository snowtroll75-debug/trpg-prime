#!/usr/bin/env node
/**
 * mutate-caster-damage-riders — five mutations against
 * verify-caster-damage-riders.mjs: the damage-type axis ignored, the
 * target-type axis ignored, a blow that took nothing still ridden, the
 * marker keyed by rider alone, and the save path no longer asking.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "caster-damage-riders.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "the damage-type axis is ignored", file: R, from: "    if (r.damageTypes.length && !r.damageTypes.includes(type)) return false;\n", to: "", breaks: "B2" },
  { name: "the target-type axis is ignored", file: R, from: "    if (r.targetTypes.length && !r.targetTypes.some((t) => types.includes(t))) return false;\n", to: "", breaks: "B2" },
  { name: "a blow that took nothing is still ridden", file: R, from: "  if (!(Number(taken) > 0)) return [];\n", to: "", breaks: "B2" },
  { name: "the marker is keyed by rider alone", file: R, from: "  return `${rider?.id ?? \"\"}:${String(targetUuid ?? \"\").trim().replace(/\\./g, \"|\")}`;", to: "  return `${rider?.id ?? \"\"}:`;", breaks: "B3/B4" },
  { name: "the dots are left in the key (setFlag nests them)", file: R, from: ".trim().replace(/\\./g, \"|\")}`;", to: ".trim()}`;", breaks: "B4/B8" },
  { name: "the save path no longer asks", file: C, from: "        const riderHP = await applyCasterSpellDamageRiders(actor, spell, target, {", to: "        const riderHP = null; await (async () => null)(actor, spell, target, {", breaks: "C1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-caster-damage-riders.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([R, C]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-caster-damage-riders: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-caster-damage-riders: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-caster-damage-riders: OK — all ${results.length} mutations caught, tree restored.\n`);
