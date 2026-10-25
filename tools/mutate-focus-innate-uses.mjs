#!/usr/bin/env node
/** mutate-focus-innate-uses — six mutations against verify-focus-innate-uses.mjs. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
const USES = path.join(SYSTEM_ROOT, "module", "uses.mjs");
const UW = path.join(SYSTEM_ROOT, "module", "uses-workflow.mjs");
const ITEM = path.join(SYSTEM_ROOT, "module", "documents", "item.mjs");
const MUTATIONS = [
  { name: "a printed count no longer wins", file: USES, from: '  if (!system?.innate) return null;\n  if (String(system?.usesPerDay ?? "").trim()) return null;\n  return /\\bfocus\\b/i', to: '  if (!system?.innate) return null;\n  return /\\bfocus\\b/i', breaks: "A4/A5" },
  { name: "innate is not required", file: USES, from: "  if (!system?.innate) return null;\n  if (String(system", to: "  if (String(system", breaks: "A2" },
  { name: "any item type qualifies", file: USES, from: '  if (type !== "spell") return null;\n  if (!system?.innate)', to: "  if (!system?.innate)", breaks: "A6" },
  { name: "'Focused' counts as Focus", file: USES, from: "  if (!system?.innate) return null;\n  if (String(system?.usesPerDay ?? \"\").trim()) return null;\n  return /\\bfocus\\b/i.test(", to: "  if (!system?.innate) return null;\n  if (String(system?.usesPerDay ?? \"\").trim()) return null;\n  return /focus/i.test(", breaks: "A7" },
  { name: "itemUsesMax stops consulting the default", file: UW, from: "  if (focusDefault !== null) return focusDefault + Math.max(0, Math.floor(bonus));\n", to: "", breaks: "B1" },
  { name: "creation no longer writes the one use", file: ITEM, from: '      if (Number(this.system?.usesValue ?? 0) < full) this.updateSource({ "system.usesValue": full });', to: "      void full;", breaks: "B2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-focus-innate-uses.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([USES, UW, ITEM]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-focus-innate-uses: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-focus-innate-uses: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-focus-innate-uses: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
