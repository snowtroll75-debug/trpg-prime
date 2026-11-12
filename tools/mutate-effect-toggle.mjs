#!/usr/bin/env node
/** mutate-effect-toggle — the mutation half of verify-effect-toggle. NEW at 3.684.9. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CSS = path.join(SYSTEM_ROOT, "styles", "trg-prime.css");
const SH = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const MUTATIONS = [
  { name: "THE DEFECT: the inactive row takes no clicks", file: CSS, from: "       switched off. Measured in Graham's world: the toggle's centre hit\n       the card behind it until this was set. */\n    pointer-events: auto;\n", to: "       switched off. Measured in Graham's world: the toggle's centre hit\n       the card behind it until this was set. */\n", breaks: "T1" },
  { name: "the buttons take no clicks", file: CSS, from: "  .trg-prime .effect-row.disabled button {\n    pointer-events: auto;\n  }", to: "  .trg-prime .effect-row.disabled button {\n    pointer-events: none;\n  }", breaks: "T1/T1b" },
  { name: "the toggle only switches off", file: SH, from: "    if (effect) await effect.update({ disabled: !effect.disabled });", to: "    if (effect) await effect.update({ disabled: true });", breaks: "T3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-effect-toggle.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-effect-toggle: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-effect-toggle: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-effect-toggle: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
