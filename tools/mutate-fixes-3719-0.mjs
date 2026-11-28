#!/usr/bin/env node
/**
 * mutate-fixes-3719-0 — can verify-fixes-3719-0 fail? NEW at 3.719.0.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RELAY = path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const LINKED = path.join(SYSTEM_ROOT, "module", "combat", "linked-conditions-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-fixes-3719-0.mjs");

const MUTATIONS = [
  { file: FX, name: "THE SHIPPED STATE: Writ of Restraint stamps the effect directly",
    from: "              await setEffectFlags(e, { fumbleNoReactions: true }).catch(() => {});",
    to: "              await e.setFlag(SYSTEM_ID, \"fumbleNoReactions\", true).catch(() => {});", breaks: "A4/A5" },
  { file: RELAY, name: "the GM refuses the no-Reactions stamp",
    from: "  \"fumbleNoReactions\"]);", to: "  ]);", breaks: "A1/A2" },
  { file: LINKED, name: "the follow-on carry writes directly",
    from: "await setEffectFlags(effect, { [flag]: value }).catch(() => {});",
    to: "await effect.setFlag(\"trg-prime\", flag, value).catch(() => {});", breaks: "A6" },
  { file: FX, name: "THE SHIPPED STATE: Restoration writes the once-a-day record directly",
    from: "            await setTargetFlag(target, RELIEF_FLAG,\n",
    to: "            await target.setFlag(SYSTEM_ID, RELIEF_FLAG,\n", breaks: "B4/B5" },
  { file: RELAY, name: "the GM refuses the once-a-day record",
    from: "  \"reliefUsedToday\"\n]);", to: "]);", breaks: "B1/B2" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RELAY, FX, LINKED, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3719-0: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const at = original.indexOf(m.from);
    if (at < 0 || original.indexOf(m.from, at + 1) >= 0) { results.push({ m, state: at < 0 ? "UNMATCHED" : "AMBIGUOUS" }); continue; }
    fs.writeFileSync(m.file, original.slice(0, at) + m.to + original.slice(at + m.from.length));
    try { results.push({ m, state: run() ? "SURVIVED" : "caught" }); } finally { fs.writeFileSync(m.file, original); }
  }
} finally {
  guard.restore();
  guard.release();
}
for (const r of results) process.stdout.write(`  ${r.state.padEnd(9)} ${r.m.name}\n`);
const bad = results.filter((r) => r.state !== "caught");
if (bad.length) { process.stderr.write(`\nmutate-fixes-3719-0: ${bad.length} of ${results.length} not caught.\n`); process.exit(1); }
process.stdout.write(`\nmutate-fixes-3719-0: OK — all ${results.length} mutations caught, tree restored.\n`);
