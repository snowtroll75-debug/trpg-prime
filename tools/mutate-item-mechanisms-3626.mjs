#!/usr/bin/env node
/**
 * mutate-item-mechanisms-3626 — the mutation half of verify-item-mechanisms-3626: each entry breaks one
 * rule the suite exists to hold, and the suite must go red for every one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const H = path.join(SYSTEM_ROOT, "module", "magic", "healing-riders.mjs");
const U = path.join(SYSTEM_ROOT, "module", "wondrous-use.mjs");
const E = path.join(SYSTEM_ROOT, "module", "wondrous-effects.mjs");
const P = path.join(SYSTEM_ROOT, "module", "rod-powers.mjs");
const C = path.join(SYSTEM_ROOT, "module", "consumable-use.mjs");
const I = path.join(SYSTEM_ROOT, "module", "magic", "item-healing-workflow.mjs");
const MUTATIONS = [
  { name: "an uninvested pair of gloves still rides", file: H, from: "    const active = charged ? Boolean(item?.system?.equipped) : Boolean(item?.system?.invested && item?.system?.equipped);", to: "    const active = true;", breaks: "A3" },
  { name: "the Lifebinder reading is lost", file: H, from: "    if (withFeat?.feat && feats.has(String(withFeat.feat).toLowerCase())) maximiseDice = Math.max(maximiseDice, Math.trunc(Number(withFeat.dice) || 0));\n", to: "", breaks: "A2" },
  { name: "a daily rider spent today is offered again", file: H, from: "  if ([\"daily\", \"1/day\"].includes(String(rider.frequency).toLowerCase())) return !rider.usedToday;", to: "  if ([\"daily\", \"1/day\"].includes(String(rider.frequency).toLowerCase())) return true;", breaks: "A5" },
  { name: "a `use` ability is not an item's use", file: U, from: "  return wondrousAbilitiesOf(item).find((a) => (a?.kind === \"heal\" && a?.formula) || (a?.kind === \"use\" && a?.automation)) ?? null;", to: "  return wondrousAbilitiesOf(item).find((a) => a?.kind === \"heal\" && a?.formula) ?? null;", breaks: "B1" },
  { name: "an expended Focus use is offered again", file: U, from: "  if (use.frequency === \"focus\" && wondrousFocusSpent(item)) {\n    return { ok: false, reason: \"is expended — Refocus restores it\" };\n  }\n", to: "", breaks: "B2" },
  { name: "a required trait is not required", file: E, from: "    if (!have.includes(want)) return false;\n  }\n  if (ability?.requiresFeat) {", to: "  }\n  if (ability?.requiresFeat) {", breaks: "B3" },
  { name: "a rod's actions are not read", file: P, from: "    const matches = (key && subjects.includes(key)) || (action && actions.includes(action)) || (types.length && types.includes(String(checkType ?? \"\")));\n    if (!matches) continue;\n    return { ...rodRow(item), cost: Math.max(0, Math.floor(Number(spec.cost ?? 2) || 0)) };", to: "    const matches = (key && subjects.includes(key)) || (types.length && types.includes(String(checkType ?? \"\")));\n    if (!matches) continue;\n    return { ...rodRow(item), cost: Math.max(0, Math.floor(Number(spec.cost ?? 2) || 0)) };", breaks: "C1" },
  { name: "a bonus rod answers every check", file: P, from: "    if (!matches) continue;\n    return {\n      ...rodRow(item),\n      cost:", to: "    return {\n      ...rodRow(item),\n      cost:", breaks: "C2" },
  { name: "the chosen rows are dropped", file: C, from: "  return [...(effect?.effects ?? []), ...(picked?.effects ?? [])];", to: "  return [...(effect?.effects ?? [])];", breaks: "D2" },
  { name: "a required trait refuses nobody", file: C, from: "  return have.includes(want) ? \"\" : `${recipientName} does not possess the ${want.charAt(0).toUpperCase() + want.slice(1)} trait — it has no effect.`;", to: "  return \"\";", breaks: "D4" },
  { name: "Last Vigil offers the 6 PP step on a 2 PP spell", file: I, from: "    const steps = (Array.isArray(spec.steps) ? spec.steps : []).filter((s) => Number(s?.minPP ?? 0) <= Number(ppRequired));", to: "    const steps = (Array.isArray(spec.steps) ? spec.steps : []);", breaks: "E3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-item-mechanisms-3626.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([H, U, E, P, C, I]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-item-mechanisms-3626: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-item-mechanisms-3626: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-item-mechanisms-3626: OK — all ${results.length} mutations caught, tree restored.\n`);
