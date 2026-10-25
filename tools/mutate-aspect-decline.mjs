#!/usr/bin/env node
/**
 * mutate-aspect-decline — four mutations against verify-aspect-decline.mjs:
 * the decline ignored, the decline beating an explicit need, the registry
 * recording a decline for an absent key, and config's reader dropped.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "aspect-rules.mjs");
const A = path.join(SYSTEM_ROOT, "module", "module-api.mjs");
const G = path.join(SYSTEM_ROOT, "module", "config.mjs");
const MUTATIONS = [
  { name: "the decline is ignored", file: R, from: "    || (!classDeclinesAspect && String(classTradition", to: "    || (String(classTradition", breaks: "A2" },
  { name: "a decline beats an explicit need", file: R, from: "  if (cls && (classNeedsAspect\n    || (!classDeclinesAspect", to: "  if (cls && !classDeclinesAspect && (classNeedsAspect\n    || (!classDeclinesAspect", breaks: "A3" },
  { name: "an absent key is recorded as a decline", file: A, from: "    declinesDivineAspect: spec.needsDivineAspect === false,", to: "    declinesDivineAspect: !spec.needsDivineAspect,", breaks: "B3" },
  { name: "config's reader always says no", file: G, from: "  return Boolean(registeredClass(clean)?.declinesDivineAspect);", to: "  return false;", breaks: "B4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-aspect-decline.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([R, A, G]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-aspect-decline: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-aspect-decline: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-aspect-decline: OK — all ${results.length} mutations caught, tree restored.\n`);
// A SURVIVOR FAILS THE SWEEP (3.664.0): this harness reported FAILED and exited 0.
if (bad.length) process.exitCode = 1;
