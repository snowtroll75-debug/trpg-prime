#!/usr/bin/env node
/**
 * mutate-drive-36241 — can verify-drive-36241 fail?
 *
 * NEW at 3.624.2. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RES = at("module", "magic", "resurrection.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const VERIFY = at("tools", "verify-drive-36241.mjs");

const MUTATIONS = [
  { file: RES, name: "O1: THE OBSERVATION — Bleeding is left on the body", from: "Object.freeze([\"bleeding\", \"dying\", \"unconscious\", \"dead\"]);", to: "Object.freeze([\"dying\", \"unconscious\", \"dead\"]);", breaks: "A1/A3" },
  { file: RES, name: "O1: Bleeding cleared last, after Dead", from: "Object.freeze([\"bleeding\", \"dying\", \"unconscious\", \"dead\"]);", to: "Object.freeze([\"dying\", \"unconscious\", \"dead\", \"bleeding\"]);", breaks: "A2" },
  { file: RES, name: "O1: Injured is cleared too", from: "Object.freeze([\"bleeding\", \"dying\", \"unconscious\", \"dead\"]);", to: "Object.freeze([\"bleeding\", \"injured\", \"dying\", \"unconscious\", \"dead\"]);", breaks: "C2" },
  { file: APPLIER, name: "O1: only one Bleeding effect is removed", from: "            for (let tries = 0; tries < 6 && target.hasCondition?.(gone); tries += 1) {", to: "            for (let tries = 0; tries < 1 && target.hasCondition?.(gone); tries += 1) {", breaks: "B2" },
  { file: APPLIER, name: "O1: the card never says the bleeding stopped", from: "          if (bled) lines.push(line(bleedingStoppedLine(target.name)));\n", to: "", breaks: "B3" },
  { file: APPLIER, name: "O1: whether it bled is read after it was cleared", from: "          const bled = Boolean(target.hasCondition?.(\"bleeding\"));\n          for (const gone of DEATH_CONDITIONS_CLEARED) {", to: "          for (const gone of DEATH_CONDITIONS_CLEARED) {", breaks: "B1" },
  { file: RES, name: "O1: the line forgets the creature", from: "  return `The bleeding that killed <strong>${targetName}</strong> stops", to: "  return `The bleeding that killed <strong>the creature</strong> stops", breaks: "B4" }
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
    process.stderr.write("mutate-drive-36241: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-drive-36241: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-36241: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
