#!/usr/bin/env node
/** mutate-release-links — the mutation half of verify-release-links. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "THE DEFECT: the download is blank", file: SJ, from: "  \"download\": \"https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.672.1/trg-prime.zip\",", to: "  \"download\": \"\",", breaks: "A2" },
  { name: "THE DEFECT: there is no manifest", file: SJ, from: ",\n  \"manifest\": \"https://raw.githubusercontent.com/snowtroll75-debug/trpg-prime/main/system.json\"", to: "", breaks: "A1" },
  { name: "the download names the last release", file: SJ, from: "releases/download/v3.672.1/trg-prime.zip", to: "releases/download/v3.672.0/trg-prime.zip", breaks: "A2" },
  { name: "the manifest points at a release, not main", file: SJ, from: "\"manifest\": \"https://raw.githubusercontent.com/snowtroll75-debug/trpg-prime/main/system.json\"", to: "\"manifest\": \"https://raw.githubusercontent.com/snowtroll75-debug/trpg-prime/v3.672.1/system.json\"", breaks: "A1" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.672.1\"", to: "\"version\": \"3.671.1\"", breaks: "A2/A4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-release-links.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-release-links: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-release-links: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-release-links: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
