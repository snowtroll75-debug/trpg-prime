#!/usr/bin/env node
/**
 * mutate-drive-36240 — can verify-drive-36240 fail?
 *
 * NEW at 3.624.1. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RES = at("module", "magic", "resurrection.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const VERIFY = at("tools", "verify-drive-36240.mjs");

const MUTATIONS = [
  { file: RES, name: "F1: THE OLD DEFECT — Dead is cleared first", from: "Object.freeze([\"bleeding\", \"dying\", \"unconscious\", \"dead\"]);", to: "Object.freeze([\"bleeding\", \"dead\", \"dying\", \"unconscious\"]);", breaks: "A3/A4" },
  { file: RES, name: "F1: Dead before Unconscious, Dying still first", from: "Object.freeze([\"bleeding\", \"dying\", \"unconscious\", \"dead\"]);", to: "Object.freeze([\"bleeding\", \"dying\", \"dead\", \"unconscious\"]);", breaks: "A4" },
  { file: RES, name: "F1: Dying is never cleared", from: "Object.freeze([\"bleeding\", \"dying\", \"unconscious\", \"dead\"]);", to: "Object.freeze([\"bleeding\", \"unconscious\", \"dead\"]);", breaks: "A0/A3" },
  { file: APPLIER, name: "F1: the applier goes back to its own literal order", from: "          for (const gone of DEATH_CONDITIONS_CLEARED) {", to: "          for (const gone of [\"dead\", \"dying\", \"unconscious\"]) {", breaks: "B1/B3" },
  { file: APPLIER, name: "F1: the conditions are cleared after the body is restored", from: "          for (const gone of DEATH_CONDITIONS_CLEARED) {\n            for (let tries = 0; tries < 6 && target.hasCondition?.(gone); tries += 1) {\n              await target.toggleStatusEffect?.(gone, { active: false });\n            }\n          }\n          await target.update?.(restoredResourceUpdate());", to: "          await target.update?.(restoredResourceUpdate());\n          for (const gone of DEATH_CONDITIONS_CLEARED) {\n            for (let tries = 0; tries < 6 && target.hasCondition?.(gone); tries += 1) {\n              await target.toggleStatusEffect?.(gone, { active: false });\n            }\n          }", breaks: "B2" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-drive-36240: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-drive-36240: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-36240: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
