#!/usr/bin/env node
/**
 * mutate-fixes-3719-1 — can verify-fixes-3719-1 fail? NEW at 3.719.1.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RW = path.join(SYSTEM_ROOT, "module", "rewards.mjs");
const TJ = path.join(SYSTEM_ROOT, "template.json");
const SH = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3719-1.mjs");

const MUTATIONS = [
  { file: RW, name: "the marker is never read", from: "  if (system?.gm?.challengeZero === true) return 0;\n", to: "", breaks: "A1/A6/A9" },
  { file: RW, name: "the marker beats a number in the box", from: "  const typed = whole(system?.gm?.challenge);\n  if (typed > 0) return typed;\n  if (system?.gm?.challengeZero === true) return 0;", to: "  const typed = whole(system?.gm?.challenge);\n  if (system?.gm?.challengeZero === true) return 0;\n  if (typed > 0) return typed;", breaks: "A3" },
  { file: RW, name: "anything truthy is the marker", from: "  if (system?.gm?.challengeZero === true) return 0;", to: "  if (system?.gm?.challengeZero) return 0;", breaks: "A5" },
  { file: RW, name: "every blank box is Effective Level 0", from: "  if (system?.gm?.challengeZero === true) return 0;", to: "  if (system?.gm?.challengeZero !== false) return 0;", breaks: "A2/A4" },
  { file: TJ, name: "the template leaves the marker out", from: "          \"challengeZero\": false,\n", to: "", breaks: "B1" },
  { file: TJ, name: "the marker is on by default", from: "          \"challengeZero\": false,", to: "          \"challengeZero\": true,", breaks: "B1" },
  { file: SH, name: "the tick box writes somewhere else", from: "<input type=\"checkbox\" name=\"system.gm.challengeZero\"", to: "<input type=\"checkbox\" name=\"system.gm.challengeNone\"", breaks: "B2" },
  { file: SH, name: "the tick box has no label", from: "<span>Effective Level 0</span>", to: "<span></span>", breaks: "B3" },
  { file: SJ, name: "the version is not raised", from: "\"version\": \"3.719.1\"", to: "\"version\": \"3.719.0\"", breaks: "Z" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RW, TJ, SH, SJ, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3719-1: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-fixes-3719-1: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-fixes-3719-1: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
