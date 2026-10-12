#!/usr/bin/env node
/**
 * mutate-item-fixes-3626-1 — the mutation half of verify-item-fixes-3626-1: each entry breaks one
 * rule the suite exists to hold, and the suite must go red for every one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const D = path.join(SYSTEM_ROOT, "module", "combat", "damage-conditionals.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "damage-conditionals-workflow.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const I = path.join(SYSTEM_ROOT, "module", "magic", "item-healing-workflow.mjs");
const F = path.join(SYSTEM_ROOT, "module", "wondrous-effects.mjs");
const C = path.join(SYSTEM_ROOT, "module", "consumable-use-workflow.mjs");
const MUTATIONS = [
  { name: "an advantage row reaches the damage roll", file: D, from: "    .filter((row) => row.kind === CONDITIONAL_KINDS.MODIFIER && Number.isFinite(Number(row.value)) && Number(row.value) !== 0);", to: "    .filter(() => true);", breaks: "A1 A5" },
  { name: "the damage context is not a damage check", file: D, from: "  return conditionalRows(entries, { ...context, checkType: \"damage\" })", to: "  return conditionalRows(entries, { ...context, checkType: \"attack\" })", breaks: "A1" },
  { name: "every row is ticked in advance", file: D, from: "  return (rows ?? []).filter((row) => row.auto).map((row) => row.id);", to: "  return (rows ?? []).map((row) => row.id);", breaks: "A2" },
  { name: "two bonuses of one type stack", file: D, from: "    if (!held || Math.abs(value) > Math.abs(held.value)) best.set(key, { ...row, value, type });", to: "    best.set(`${key}:${counted.length + best.size}`, { ...row, value, type });", breaks: "A4" },
  { name: "the card does not say the type", file: D, from: "    return `${row.label}: ${signed}${type === \"untyped\" ? \"\" : ` ${type}`} to damage${row.scope ? ` (${row.scope})` : \"\"}.`;", to: "    return `${row.label}: ${signed} to damage${row.scope ? ` (${row.scope})` : \"\"}.`;", breaks: "A3" },
  { name: "the hit path never asks", file: A, from: "    const declaredDamage = await declaredDamageBonus(actor, weapon, { skipPrompt: skipDialog(event) });\n", to: "    const declaredDamage = { bonus: 0, lines: [] };\n", breaks: "B1" },
  { name: "the formula ignores the total", file: A, from: "    formula += declaredDamageTotal > 0 ? ` + ${declaredDamageTotal}` : ` - ${Math.abs(declaredDamageTotal)}`;\n", to: "", breaks: "B2" },
  { name: "the workflow asks even when every row is automatic", file: W, from: "  if (offered.length && !skipPrompt && DialogV2) {", to: "  if (!skipPrompt && DialogV2) {", breaks: "B3" },
  { name: "a rune's packet is as mundane as it ever was", file: A, from: "        magical: rune.mundane ? strikeIsMagical : true,\n", to: "        magical: strikeIsMagical,\n", breaks: "C2" },
  { name: "an unguent's packet is magical by itself", file: A, from: "      .map((packet) => ({ ...packet, mundane: true }));", to: "      .map((packet) => ({ ...packet }));", breaks: "C2" },
  { name: "a partial ward is not recorded", file: E, from: "          wardedBy = `${ward.label}, ${incomingValue} → ${kept}`;\n", to: "", breaks: "D2" },
  { name: "a partial ward is not said", file: E, from: "      const partly = tag.wardedPartly ? ` (reduced by ${tag.wardedPartly})` : \"\";", to: "      const partly = \"\";", breaks: "D1" },
  { name: "one qualifying condition is spent without asking", file: I, from: "        picked = yes ? held : null;", to: "        picked = held;", breaks: "E1" },
  { name: "a `use` ability reads +0 again", file: F, from: "    case \"use\": {", to: "    case \"never\": {", breaks: "F1" },
  { name: "a printed activation is dropped from the grant", file: F, from: "        ...(Number(ability.castAP) > 0 ? { castAP: Math.trunc(Number(ability.castAP)) } : {})\n", to: "", breaks: "F2" },
  { name: "the other path asks nobody's traits", file: C, from: "        if (!rows.length || rows.some((row) => String(row?.target ?? \"self\") === \"self\")) recipients.push(actor);\n", to: "", breaks: "G1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-item-fixes-3626-1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([D, W, A, E, I, F, C]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-item-fixes-3626-1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-item-fixes-3626-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-item-fixes-3626-1: OK — all ${results.length} mutations caught, tree restored.\n`);
