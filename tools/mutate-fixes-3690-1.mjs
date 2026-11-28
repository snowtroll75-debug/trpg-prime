#!/usr/bin/env node
/** mutate-fixes-3690-1 — the mutation half of verify-fixes-3690-1 (3.690.1: Recharge Item's printed cost, the settle card's title, a held spell's headline). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const AW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CI = path.join(SYSTEM_ROOT, "module", "charged-items.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const RL = path.join(SYSTEM_ROOT, "module", "magic", "cast-result-line.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const PJ = path.join(SYSTEM_ROOT, "package.json");
const MUTATIONS = [
  { name: "A the card prints the action's 2 again", file: AW, from: "  const lines = headerLines(headerAction, effectiveApCost);", to: "  const lines = headerLines(action, effectiveApCost);" },
  { name: "A every item's cost rewritten", file: CI, from: "  if (pp <= 0) return text;", to: "  if (pp < 0) return text;" },
  { name: "A the kind's name dropped", file: CI, from: "`PP Cost ${pp} (${kindSpec?.label || \"this item\"}).`", to: "`PP Cost ${pp}.`" },
  { name: "B a source alone carded Metamagic", file: RL, from: "  if (src) return \"PP Sources\";", to: "  if (src) return \"Metamagic\";" },
  { name: "B both carded as sources only", file: RL, from: "  if (mm && src) return \"Metamagic and PP Sources\";", to: "  if (mm && src) return \"PP Sources\";" },
  { name: "C a held spell takes effect", file: RL, from: "const opening = held ? \"<strong>The spell is held.</strong>\"", to: "const opening = false ? \"<strong>The spell is held.</strong>\"" },
  { name: "C a failed hold called held", file: CW, from: "held: Boolean(holdingNow && outcome.cast) };", to: "held: Boolean(holdingNow) };" },
  { name: "C the cast never says held", file: CW, from: "held: Boolean(holdingNow && outcome.cast) };", to: "held: false };" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.720.0\"", to: "\"version\": \"3.690.0\"" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.720.0/trg-prime.zip", to: "releases/download/v3.690.0/trg-prime.zip" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.720.0\"", to: "\"version\": \"3.690.0\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3690-1.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-fixes-3690-1: verify-fixes-3690-1 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3690-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3690-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
