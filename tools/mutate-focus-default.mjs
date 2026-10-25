#!/usr/bin/env node
/** mutate-focus-default — the mutation half of verify-focus-default. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const FW = m("feats-workflow.mjs"), U = m("uses.mjs"), UW = m("uses-workflow.mjs"), IT = m("documents", "item.mjs"), AC = m("documents", "actor.mjs"), MG = m("migration.mjs");
const MUTATIONS = [
  { name: "abilities get no default", file: U, from: "export const FOCUS_DEFAULT_TYPES = Object.freeze([\"feat\", \"ability\"]);", to: "export const FOCUS_DEFAULT_TYPES = Object.freeze([\"feat\"]);", breaks: "A1" },
  { name: "every item type gets the default", file: U, from: "  if (!FOCUS_DEFAULT_TYPES.includes(String(type ?? \"\"))) return null;\n", to: "", breaks: "A4" },
  { name: "a printed count is overridden", file: U, from: "  if (String(system?.usesPerDay ?? \"\").trim()) return null;\n  return /\\bfocus\\b/i.test(String(system?.traits ?? \"\")) ? 1 : null;\n}\n\n/**\n * SPENT BY THE USE BUTTON", to: "  return /\\bfocus\\b/i.test(String(system?.traits ?? \"\")) ? 1 : null;\n}\n\n/**\n * SPENT BY THE USE BUTTON", breaks: "A2" },
  { name: "the trait is matched as a substring", file: U, from: "  return /\\bfocus\\b/i.test(String(system?.traits ?? \"\")) ? 1 : null;\n}\n\n/**\n * SPENT BY THE USE BUTTON", to: "  return /focus/i.test(String(system?.traits ?? \"\")) ? 1 : null;\n}\n\n/**\n * SPENT BY THE USE BUTTON", breaks: "A5" },
  { name: "spells lose the innate rule", file: U, from: "  if (type === \"spell\") return focusInnateDefaultUses(system, type);", to: "  if (type === \"spell\") return null;", breaks: "A3" },
  { name: "a full count is primed again", file: U, from: "  return Number.isFinite(stored) && stored >= max ? null : max;", to: "  return max;", breaks: "B2" },
  { name: "itemUsesMax keeps the innate-only rule", file: UW, from: "  const focusDefault = focusDefaultUses(owner.system, owner.type);", to: "  const focusDefault = owner.type === \"spell\" ? focusDefaultUses(owner.system, owner.type) : null;", breaks: "C1" },
  { name: "a dropped item arrives spent", file: IT, from: "    const focusUses = focusDefaultUses({ ...this.system, traits: traits ?? this.system?.traits }, this.type);", to: "    const focusUses = null;", breaks: "C2" },
  { name: "an imported actor's items arrive spent", file: AC, from: "    if (primed) update.items = items;\n", to: "", breaks: "C3" },
  { name: "the migration touches innate spells", file: MG, from: "      if (!FOCUS_DEFAULT_TYPES.includes(item.type)) continue;\n", to: "", breaks: "D2" },
  { name: "the migration overwrites a full count", file: MG, from: "      if (Number.isFinite(stored) && stored >= max) continue;\n      updates.push({ _id: item.id, \"system.usesValue\": max });", to: "      updates.push({ _id: item.id, \"system.usesValue\": max });", breaks: "D2" },
  { name: "the migration skips tokens", file: MG, from: "  for (const actor of [...actors, ...tokenActors]) {\n    if (!actor) continue;\n    const updates = [];\n    for (const item of Array.from(actor.items ?? [])) {\n      if (!FOCUS_DEFAULT_TYPES", to: "  for (const actor of [...actors]) {\n    if (!actor) continue;\n    const updates = [];\n    for (const item of Array.from(actor.items ?? [])) {\n      if (!FOCUS_DEFAULT_TYPES", breaks: "D1" },
  { name: "the schema stamp is left behind", file: MG, from: "export const TRG_SCHEMA_VERSION = \"3.666.4\";", to: "export const TRG_SCHEMA_VERSION = \"3.648.0\";", breaks: "D3" },
  { name: "the Use button never spends", file: U, from: "  return a === b;\n}", to: "  return false;\n}", breaks: "F1" },
  { name: "a handler's own spend is spent again", file: U, from: "  return a === b;\n}", to: "  return true;\n}", breaks: "F2" },
  { name: "a cancelled Use spends", file: U, from: "  if (!acted) return false;\n", to: "", breaks: "F2" },
  { name: "a printed count is spent twice", file: U, from: "  if (max === null || max === undefined) return false;\n  if (result", to: "  if (result", breaks: "F3" },
  { name: "the gate is bypassed", file: FW, from: "  return withFocusDefault(actor, item, () => useFeatNow(actor, item));", to: "  return useFeatNow(actor, item);", breaks: "F4" },
  { name: "a spent use is not refused", file: FW, from: "    ui.notifications.warn(`${item.name}: its Focus use is spent \u2014 Refocus restores it.`);\n    return null;\n", to: "", breaks: "F5" },
  { name: "any message counts as acting", file: FW, from: "    !known.has(m.id) && m.speaker?.actor === actor?.id);", to: "    !known.has(m.id));", breaks: "F6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-focus-default.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-focus-default: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-focus-default: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-focus-default: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
