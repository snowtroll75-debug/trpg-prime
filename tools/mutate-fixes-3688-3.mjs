#!/usr/bin/env node
/** mutate-fixes-3688-3 — the mutation half of verify-fixes-3688-3 (3.688.3: the ritual's secondary rows start at "not participating"). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "the rows open on Success again", file: CW, from: "return `<option value=\"${key}\">${", to: "return `<option value=\"${key}\"${key === \"success\" ? \" selected\" : \"\"}>${" },
  { name: "the rows open on Critical", file: CW, from: "return `<option value=\"${key}\">${", to: "return `<option value=\"${key}\"${key === \"critical\" ? \" selected\" : \"\"}>${" },
  { name: "the blank option not marked selected", file: CW, from: "<option value=\"\" selected>— not participating —</option>", to: "<option value=\"\">— not participating —</option>" },
  { name: "a blank row counted as a seat", file: CW, from: "String(result[`secondary-${i}`] ?? \"\").trim()).filter(Boolean);", to: "String(result[`secondary-${i}`] ?? \"\").trim() || \"success\");" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.698.0\"", to: "\"version\": \"3.688.2\"" },
  { name: "the download names the last release", file: SJ, from: "releases/download/v3.698.0/trg-prime.zip", to: "releases/download/v3.688.2/trg-prime.zip" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3688-3.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3688-3: verify-fixes-3688-3 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3688-3: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3688-3: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
