#!/usr/bin/env node
/** mutate-live-fixes-3706-1 — the mutation half of verify-live-fixes-3706-1 (the 3.706.0 live test's findings, 3.706.1). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AF = M("combat", "action-feats.mjs");
const AWK = M("combat", "attack-workflow.mjs");
const MUTATIONS = [
  { name: "A Combat Grapple's clock one round on again", file: AF, from: "const UNTIL_END_OF_NEXT_TURN_ROUNDS = 2;", to: "const UNTIL_END_OF_NEXT_TURN_ROUNDS = 1;" },
  { name: "A no clock in an encounter", file: AF, from: "  return { grab: true, expiresRound: inCombat ? (Number(round) || 0) + UNTIL_END_OF_NEXT_TURN_ROUNDS : null };", to: "  return { grab: true, expiresRound: null };" },
  { name: "B an Attack of Opportunity thrown again", file: AWK, from: "    !reachAlreadyEstablished &&\n    distanceToTarget !== null &&", to: "    distanceToTarget !== null &&" },
  { name: "B nothing ever thrown by distance", file: AWK, from: "    distanceToTarget > meleeReach &&\n    // A SPELL'S REACH", to: "    false &&\n    // A SPELL'S REACH" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-live-fixes-3706-1.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-live-fixes-3706-1: verify-live-fixes-3706-1 already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-live-fixes-3706-1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-live-fixes-3706-1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
