#!/usr/bin/env node
/**
 * mutate-critical-increments — can verify-critical-increments fail?
 *
 * NEW at 3.608.3. SURVIVED and an unmatched anchor are both failures.
 * The first mutation is the shipped state: no raise read at all.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const PARSER = at("module", "effect-parser.mjs");
const TABLES = at("module", "data", "critical-tables.mjs");
const VERIFY = at("tools", "verify-critical-increments.mjs");

const MUTATIONS = [
  { file: PARSER, name: "THE SHIPPED STATE — no raise is read",
    from: "  if (increases.length) {\n", to: "  if (false) {\n", breaks: "B50/B59/B67/B79/B89, C1" },
  { file: PARSER, name: "a raise replaces instead of adding",
    from: "      return up && tag.value !== null ? { ...tag, value: tag.value + up.delta } : tag;",
    to: "      return up && tag.value !== null ? { ...tag, value: up.delta } : tag;", breaks: "B* metal" },
  { file: PARSER, name: "the label need not touch the sign — Bleeding 1 +2 reads as a raise",
    from: "      const pattern = new RegExp(`\\\\b${escapeRegExp(word)}\\\\s*\\\\+\\\\s*(\\\\d+)\\\\b`, \"gi\");",
    to: "      const pattern = new RegExp(`\\\\b${escapeRegExp(word)}[^+]*\\\\+\\\\s*(\\\\d+)\\\\b`, \"gi\");", breaks: "A3" },
  { file: PARSER, name: "a raise of zero counts",
    from: "        if (value <= 0) continue;\n        const previous = found.get(key);",
    to: "        const previous = found.get(key);", breaks: "A5" },
  { file: TABLES, name: "row 59's clause goes back inside the row text",
    from: "Recurring 3 & Stunned 2.\",\n      \"armourClauses\": [\n        { \"kind\": \"metal\", \"text\": \"Stunned +1.\" }\n      ]",
    to: "Recurring 3 & Stunned 2. Metal Armour: Stunned +1.\"", breaks: "B59, B59d, C2" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-critical-increments does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}
let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) { console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`); unmatched++; continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
process.stdout.write(survived + unmatched
  ? `\nmutate-critical-increments: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-critical-increments: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
