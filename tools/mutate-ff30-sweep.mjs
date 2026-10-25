#!/usr/bin/env node
/**
 * mutate-ff30-sweep — the mutation half of verify-ff30-sweep (3.663.5).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AC = m("documents", "actor.mjs");
const CB = m("documents", "combat.mjs");
const MUTATIONS = [
  { name: "the clamp ignores the reaction allowance (3.663.4 as shipped)", file: AC, from: '      + (key === "reactions" ? Math.max(0, Number(reactionAllowance) || 0) : 0);', to: ';', breaks: "F1" },
  { name: "the allowance goes to every resource", file: AC, from: '(key === "reactions" ? Math.max(0, Number(reactionAllowance) || 0) : 0)', to: '(Math.max(0, Number(reactionAllowance) || 0))', breaks: "F1" },
  { name: "a negative allowance shrinks the pool", file: AC, from: 'Math.max(0, Number(reactionAllowance) || 0)', to: '(Number(reactionAllowance) || 0)', breaks: "F1" },
  { name: "the call site passes no allowance", file: AC, from: 'reactionAllowance: Number(this.flags?.["trg-prime"]?.reactionGrant?.bonus) || 0', to: 'reactionAllowance: 0', breaks: "F1b" },
  { name: "the refill writes no flag", file: CB, from: '      [`flags.${SYSTEM_ID}.reactionGrant`]: { combatId: this.id, bonus: acting.canAct ? reactionState.bonus : 0 },\n', to: '', breaks: "F1c" },
  { name: "a creature that cannot act keeps the allowance", file: CB, from: 'bonus: acting.canAct ? reactionState.bonus : 0 }', to: 'bonus: reactionState.bonus }', breaks: "F1c" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-sweep.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-sweep: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-sweep: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-sweep: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
