#!/usr/bin/env node
/**
 * mutate-ff30-block8 — the mutation half of verify-ff30-block8 (3.638.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CA = m("combat", "compound-action.mjs"), CW = m("combat", "compound-action-workflow.mjs");
const DECL = path.join(SYSTEM_ROOT, "tools", "ff30-codex-declarations.mjs");

const MUTATIONS = [
  { name: "the limit is never read", file: CA, from: "  return Number.isFinite(n) && n > 0 ? n : 0;", to: "  return 0;", breaks: "C1" },
  { name: "a negative limit counts", file: CA, from: "Number.isFinite(n) && n > 0 ? n : 0", to: "Number.isFinite(n) ? n : 0", breaks: "C1" },
  { name: "the limit lets one strike too many through", file: CA, from: "Object.keys(used ?? {}).length < limit", to: "Object.keys(used ?? {}).length <= limit", breaks: "C2" },
  { name: "a limit of none refuses everything", file: CA, from: "return limit <= 0 || Object", to: "return Object", breaks: "C2" },
  { name: "the card forgets the limit", file: CW, from: "strikes, mapRule, choose, label: item.name", to: "strikes, mapRule, label: item.name", breaks: "W1" },
  { name: "a press past the limit goes through", file: CW, from: "  if (!compoundStrikeAllowed(raw.choose, raw.used)) { ui.notifications?.warn(", to: "  if (false) { ui.notifications?.warn(", breaks: "W2" },
  { name: "Pouncing Assault lowers the creature's DB again", file: DECL, from: 'selfEffect: { label: "Pouncing Assault", defenceCircumstance: 4,', to: 'selfEffect: { label: "Pouncing Assault", defenceCircumstance: -4,', breaks: "P1" },
  { name: "the remaining buttons stay live", file: CW, from: "if (!compoundStrikeAllowed(raw.choose, raw.used) || !compoundPickAllowed(raw.strikes, Number(button.dataset.strike), raw.used)) { button.disabled = true; continue; }", to: "if (!compoundPickAllowed(raw.strikes, Number(button.dataset.strike), raw.used)) { button.disabled = true; continue; }", breaks: "W3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block8.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block8: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block8: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block8: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
