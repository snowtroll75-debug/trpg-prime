#!/usr/bin/env node
/**
 * mutate-fixes-3718-3 — can verify-fixes-3718-3 fail? NEW at 3.718.3.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const PR = path.join(SYSTEM_ROOT, "module", "pack-repair.mjs");
const MIG = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3718-3.mjs");

const MUTATIONS = [
  { file: PR, name: "a one-sided key always differs", from: "    if (!isEmptyDefault(inA ? a[k] : b[k])) return false;", to: "    return false;", breaks: "A1/A2" },
  { file: PR, name: "a false counts as a default", from: "  if (value === undefined || value === null || value === \"\") return true;", to: "  if (!value) return true;", breaks: "A5/A6" },
  { file: PR, name: "a filled extra key is waved through", from: "    if (!isEmptyDefault(inA ? a[k] : b[k])) return false;", to: "    continue;", breaks: "A4" },
  { file: PR, name: "an empty list is a value", from: "  if (Array.isArray(value)) return value.length === 0;", to: "  if (Array.isArray(value)) return false;", breaks: "A7" },
  { file: PR, name: "a shared key is not compared", from: "    if (inA && inB) { if (!deepEquals(a[k], b[k])) return false; continue; }", to: "    if (inA && inB) continue;", breaks: "A12" },
  { file: MIG, name: "the pass is not re-gated", from: "  const packCopies = (await runIf(\"3.718.3\",", to: "  const packCopies = (await runIf(\"3.718.2\",", breaks: "A11" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([PR, MIG, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3718-3: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-fixes-3718-3: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-fixes-3718-3: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
