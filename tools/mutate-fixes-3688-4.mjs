#!/usr/bin/env node
/** mutate-fixes-3688-4 — the mutation half of verify-fixes-3688-4 (3.688.4: the different-tradition count is held to the recorded secondaries). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "the guard removed", file: CW, from: "  if (diffTradition > degrees.length) {", to: "  if (false) {" },
  { name: "the guard counts seats, Ritual Experts' included", file: CW, from: "  if (diffTradition > degrees.length) {", to: "  if (diffTradition > secondaryCount) {" },
  { name: "the guard warns but rolls on", file: CW, from: "Record each one's result, or lower the count.`\n    );\n    return null;", to: "Record each one's result, or lower the count.`\n    );" },
  { name: "the DC reads the raw box again", file: CW, from: "    differentTraditionSecondaryCasters: diffTradition,", to: "    differentTraditionSecondaryCasters: Number(result.diffTradition || 0)," },
  { name: "the count trimmed silently instead", file: CW, from: "  const diffTradition = Math.max(0, Math.floor(Number(result.diffTradition) || 0));", to: "  const diffTradition = Math.min(degrees.length, Math.max(0, Math.floor(Number(result.diffTradition) || 0)));" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.709.0\"", to: "\"version\": \"3.688.3\"" },
  { name: "the download names the last release", file: SJ, from: "releases/download/v3.709.0/trg-prime.zip", to: "releases/download/v3.688.3/trg-prime.zip" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3688-4.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3688-4: verify-fixes-3688-4 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-fixes-3688-4: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3688-4: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
