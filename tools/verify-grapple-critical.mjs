#!/usr/bin/env node
/**
 * verify-grapple-critical — a critical Grapple is better than a success.
 *
 * NEW at 3.375.0.
 *
 * WHAT THIS IS FOR. The book as printed reads *"Critical: Your target is
 * immobilised"*, and the condition table transcribed it faithfully.
 * Driving the two degrees side by side exposed what that meant HERE:
 * `grabbed` declares `includes: ["flatFooted", "immobilised"]`, so Grabbed
 * is a strict superset of Immobilised — and a critical therefore left the
 * target LESS affected than a success. Not Grabbed put them outside the
 * maintenance rule and outside everything else keyed on Grabbed.
 *
 * Graham confirmed the printed line is a TYPO and gave the corrected text
 * on 23 August 2026: *"Your target is Grabbed and takes a -4 circumstance
 * penalty to checks made to Escape your Grapple until the end of your next
 * turn."*
 *
 * THE GENERAL RULE THIS FILE DEFENDS: a better degree may never apply a
 * weaker set of conditions than a lesser one. That is checked here for
 * every action in the table, not just Grapple, because the same mistake
 * can be transcribed into any of them — and a check that only knew about
 * Grapple would have to be rewritten the next time it happened.
 */

import { CONDITIONS } from "../module/conditions/registry.mjs";
import {
  BASIC_ACTION_CONDITION_EFFECTS,
  basicActionConditionEffects
} from "../module/combat/basic-action-conditions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/** Every condition a key implies, following `includes` transitively. */
function expand(key, seen = new Set()) {
  if (!key || seen.has(key)) return seen;
  seen.add(key);
  for (const inner of CONDITIONS[key]?.includes ?? []) expand(inner, seen);
  return seen;
}
/** The conditions a degree applies to the target, fully expanded. */
function targetConditions(actionKey, degree) {
  const out = new Set();
  for (const e of basicActionConditionEffects(actionKey, degree)) {
    if (e.target !== "target" || !e.active) continue;
    for (const k of expand(e.conditionKey)) out.add(k);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * A. Grapple's corrected critical
 * ------------------------------------------------------------------ */

const crit = basicActionConditionEffects("grappleAttack", "critical");
equal("A1 the critical applies exactly one condition", crit.length, 1);
equal("A2 the critical GRABS, it does not merely immobilise", crit[0]?.conditionKey, "grabbed");
equal("A3 it applies to the target", crit[0]?.target, "target");
equal("A4 it is applied, not cleared", crit[0]?.active, true);

const conds = crit[0]?.conditionals ?? [];
equal("A5 the critical carries one conditional", conds.length, 1);
equal("A6 it is a -4", conds[0]?.value, -4);
equal("A7 typed circumstance, as the text says", conds[0]?.type, "circumstance");
equal("A8 scoped to the Escape action", JSON.stringify(conds[0]?.when?.actions), JSON.stringify(["escape"]));
// AUTO, because the action's own identity settles the scope completely.
// An unticked row here would make the penalty optional, which the sentence
// does not.
equal("A9 pre-ticked — no judgement is left to make", conds[0]?.auto, true);
ok("A10 it is a modifier, not advantage", conds[0]?.kind === "modifier");
ok("A11 it names itself on the roll", Boolean(String(conds[0]?.label ?? "").trim()));

/* ------------------------------------------------------------------ *
 * B. A success still grabs, and carries no penalty
 * ------------------------------------------------------------------ */

const succ = basicActionConditionEffects("grappleAttack", "success");
equal("B1 success grabs", succ[0]?.conditionKey, "grabbed");
ok("B2 success carries no Escape penalty — that is the critical's advantage",
  !(succ[0]?.conditionals ?? []).length);

/* ------------------------------------------------------------------ *
 * C. THE GENERAL RULE — no degree may be weaker than a lesser one
 * ------------------------------------------------------------------ */

const LADDER = ["success", "critical"];
for (const actionKey of Object.keys(BASIC_ACTION_CONDITION_EFFECTS)) {
  const lesser = targetConditions(actionKey, LADDER[0]);
  const better = targetConditions(actionKey, LADDER[1]);
  if (!lesser.size || !better.size) continue;
  const missing = [...lesser].filter((k) => !better.has(k));
  ok(`C ${actionKey}: the critical applies everything the success does`,
    missing.length === 0,
    `critical is missing ${missing.join(", ")} — rolling better would leave the target less affected`);
}

/* ------------------------------------------------------------------ *
 * D. The stamping path carries conditionals as well as the expiry
 * ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
const src = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/basic-action-conditions.mjs"), "utf8");

ok("D1 conditionals are stamped onto the applied effect",
  /flags\.\$\{SYSTEM_ID\}\.conditionals/.test(src));
// D2 WAS TOO WEAK and a mutation walked through it. Asserting that the
// string `conditionExpiresRound` appears says nothing about whether the
// guard around it still works — changing `expiresRound !== null` to
// `false` left the literal in place and the check green. It now asserts
// the GUARD, which is the part that can be disabled.
ok("D2 the expiry is stamped when one was stated",
  /if \(expiresRound !== null\) stamped\[`flags\.\$\{SYSTEM_ID\}\.conditionExpiresRound`\] = expiresRound;/.test(src),
  "the literal alone proves nothing — the guard is what a mutation disables");
// THE BUG THIS PREVENTS: an early `continue` on a null expiry would skip
// the conditional too, so a critical with no stated duration would apply
// the grab and silently drop the penalty.
ok("D3 a missing expiry does not skip the conditional",
  !/if\s*\(expiresRound === null \|\| !effect\.active\)\s*continue;/.test(src),
  "the guard must not return early before conditionals are considered");
ok("D4 both ride ONE effect document",
  /await document\.update\(stamped\)/.test(src),
  "two documents would be two things to expire, and one would be missed");

/* ------------------------------------------------------------------ *
 * E. The card says what the system does
 * ------------------------------------------------------------------ */

// THE HALF THE FIRST FIX MISSED. 3.375.0 corrected the condition table and
// left the action's printed outcome text saying "Your target is immobilised".
// The system applied Grabbed and the card described Immobilised, which is
// worse than no card at all — the player trusts what they read, and nothing
// on screen disagreed with itself. Caught by driving one critical.
//
// Checked generally: for every degree that applies a condition to the
// target, the outcome text must name that condition and must not name a
// DIFFERENT one from the same table as its outcome.
const { BASIC_ACTIONS } = await import("../module/data/basic-actions.mjs");
const byKey = new Map(BASIC_ACTIONS.map((a) => [a.key, a]));
const norm = (t) => String(t ?? "").toLowerCase().replace(/[^a-z]/g, "");

for (const actionKey of Object.keys(BASIC_ACTION_CONDITION_EFFECTS)) {
  const action = byKey.get(actionKey);
  if (!action) continue;
  for (const degree of ["critical", "success"]) {
    const applied = basicActionConditionEffects(actionKey, degree)
      .filter((e) => e.target === "target" && e.active)
      .map((e) => e.conditionKey);
    if (!applied.length) continue;
    const text = norm(action.outcomes?.[degree]);
    if (!text) continue;
    for (const key of applied) {
      const label = norm(CONDITIONS[key]?.label ?? key);
      ok(`E ${actionKey}.${degree} names ${key} in its outcome text`,
        text.includes(label) || text.includes(norm(key)),
        `the card describes something other than the ${key} it applies`);
    }
  }
}

// Grapple's corrected sentence specifically, since it carries a number the
// generic check above cannot see.
const gc = norm(byKey.get("grappleAttack")?.outcomes?.critical);
ok("E grapple critical states the -4", gc.includes("circumstancepenalty") && /4/.test(String(byKey.get("grappleAttack")?.outcomes?.critical)));
ok("E grapple critical no longer says immobilised", !gc.includes("immobilised"));

/* ------------------------------------------------------------------ */

const EXPECTED_CHECKS = 28;
ok("Z1 the check count is what this file expects",
  checks + 1 === EXPECTED_CHECKS,
  `expected ${EXPECTED_CHECKS}, ran ${checks + 1}`);

if (failures.length) {
  process.stderr.write(`\nverify-grapple-critical: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-grapple-critical: OK — ${checks} checks.\n`);
