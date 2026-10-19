#!/usr/bin/env node
/**
 * mutate-ff30-block16 — the mutation half of verify-ff30-block16 (3.649.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RU = m("codex-action-rules.mjs"), CW = m("codex-actions-workflow.mjs"), CS = m("combat", "creature-secondary.mjs"),
  CHK = m("dice", "check.mjs"), ATK = m("combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "the burst catches Air creatures too", file: RU, from: "    excludeKinds: (Array.isArray(b.excludeKinds) ? b.excludeKinds : []).map((k) => String(k).trim().toLowerCase()).filter(Boolean),", to: "    excludeKinds: [],", breaks: "G1" },
  { name: "the burst is not basic", file: RU, from: "    basic: b.basic !== false,", to: "    basic: false,", breaks: "G1" },
  { name: "a radiusless burst still bursts", file: RU, from: "  if (!radiusFeet) return null;\n  return {\n    save:", to: "  return {\n    save:", breaks: "G2" },
  { name: "a printed DC is dropped", file: RU, from: "    ...(Number(b.dc) > 0 ? { dc: Math.trunc(Number(b.dc)) } : {})", to: "", breaks: "G2" },
  { name: "unreadable dice pass", file: RU, from: "    .filter((r) => /^\\d+d\\d+([+-]\\d+)?$/i.test(r.dice) && r.type);", to: "    .filter((r) => r.type);", breaks: "G3" },
  { name: "the Reach trait does not extend the range", file: RU, from: "  return base + (weaponHasReach ? Math.max(0, Number(extension) || 0) : 0) + Math.max(0, Number(plusFeet) || 0);", to: "  return base + Math.max(0, Number(plusFeet) || 0);", breaks: "G4" },
  { name: "the +5 feet is forgotten", file: RU, from: "  return base + (weaponHasReach ? Math.max(0, Number(extension) || 0) : 0) + Math.max(0, Number(plusFeet) || 0);", to: "  return base + (weaponHasReach ? Math.max(0, Number(extension) || 0) : 0);", breaks: "G4" },
  { name: "the later creatures take no penalty", file: RU, from: "  return m ? Number(m.value) || 0 : 0;", to: "  return 0;", breaks: "G5" },
  { name: "the action's packet is always mundane", file: CS, from: "      why: \"\", parameter: \"\", against: \"\", mundane: !magical", to: "      why: \"\", parameter: \"\", against: \"\", mundane: true", breaks: "G6" },
  { name: "an aligned row slips through", file: CS, from: "    if (!DICE.test(dice) || !TYPE.test(type) || ALIGNED_TRAITS.includes(type)) continue;\n    out.push({\n      label: `${String(row?.label", to: "    if (!DICE.test(dice) || !TYPE.test(type)) continue;\n    out.push({\n      label: `${String(row?.label", breaks: "G7" },
  { name: "Lightning Strike is not a Codex action", file: CW, from: "sizeShift, strikeBurst, sweepingStrike, toggleEffect });", to: "sizeShift, strikeBurst, toggleEffect });", breaks: "S1" },
  { name: "Thundering Strike is free", file: CW, from: "  if (check === null || check === undefined) return false;\n  await spendActionPoints(actor, ap, item.name);\n  const area", to: "  if (check === null || check === undefined) return false;\n  const area", breaks: "S2" },
  { name: "every creature rolls its own die", file: CW, from: "      ...(later ? { presetDice: dice, mapFrozen: true, mapOverride: map } : {})", to: "      ...(later ? { mapFrozen: true, mapOverride: map } : {})", breaks: "S3" },
  { name: "a check rolls even when handed a die", file: CHK, from: "    this.dice = this.presetDice\n      ? this.presetDice\n      : this.die", to: "    this.dice = false\n      ? this.presetDice\n      : this.die", breaks: "S4" },
  { name: "conviction is offered on every creature", file: ATK, from: "    ...(presetDice ? { presetDice, allowConviction: false } : {}),", to: "    ...(presetDice ? { presetDice } : {}),", breaks: "S5" },
  { name: "every creature fumbles the one swing", file: ATK, from: "  if (outcome.fumbleRisk && !presetDice) {", to: "  if (outcome.fumbleRisk) {", breaks: "S7" },
  { name: "the damage is rolled again for each creature", file: ATK, from: "  if (shared[slot]) return Roll.fromData(shared[slot]);", to: "", breaks: "S6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block16.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block16: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block16: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block16: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
