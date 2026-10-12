#!/usr/bin/env node
/**
 * mutate-action-keys-dispatched — can verify-action-keys-dispatched fail?
 *
 * NEW at 3.434.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE DEFECT THIS RATCHET EXISTS FOR, restored on the action that
 * taught it most recently: unwire Dismiss and it goes back to charging an
 * AP to print a paragraph.
 *
 * THE CHECK FILE ITSELF IS NOT MUTATED HERE. Weakening an assertion
 * makes the check pass, so every such mutation "survives" by
 * construction — which is `verify-checks-can-fail`'s job, not this
 * file's. Five were written and deleted on the first run for exactly
 * that reason.
 *
 * #3 IS THE ONE THAT EARNED ITS PLACE: it survived, because the check
 * counted `action.key !== "attackOfOpportunity"` — a NEGATIVE guard, a
 * line whose only purpose is to exclude the action — as evidence that
 * something dispatched on it. So the ratchet would not have caught one
 * of the three defects it was built from.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ACTIONS = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-action-keys-dispatched.mjs");

const MUTATIONS = [
  {
    file: ACTIONS,
    name: "THE SHAPE: Dismiss stops being dispatched",
    from: '    if (action.key === "dismiss") {',
    to: '    if (action.key === "dismissDISABLED") {',
    breaks: "B2/B3 — 1 AP to print a paragraph, and the Magic tab still ends it for free"
  },
  {
    file: ACTIONS,
    name: "Sustain a Spell stops being dispatched",
    from: '    if (action.key === "sustainASpell") {',
    to: '    if (action.key === "sustainASpellDISABLED") {',
    breaks: "B2/B3 — the 27 August defect, restored"
  },
  {
    file: ACTIONS,
    name: "Attack of Opportunity stops being dispatched",
    from: '    if (action.key === "attackOfOpportunity") {',
    to: '    if (action.key === "attackOfOpportunityDISABLED") {',
    breaks: "B2/B3 — the 28 August defect, restored"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([ACTIONS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-action-keys-dispatched: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-action-keys-dispatched: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-action-keys-dispatched: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
