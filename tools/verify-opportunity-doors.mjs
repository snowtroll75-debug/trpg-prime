#!/usr/bin/env node
/**
 * verify-opportunity-doors — both ways of taking an Attack of
 * Opportunity reach the same rule.
 *
 * NEW at 3.430.2.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 28 August 2026: "Attack of Opportunity is spending a reaction
 * but not prompting an attack" — and, when asked which control he used,
 * "I was clicking the action on the character sheet."
 *
 * There were two doors. The offer card's per-reactor button ran the
 * whole engine: eligibility re-check, target the provoker, spend the
 * reaction, roll a MAP-exempt strike, refund if nothing happened, and
 * post the disruption note on a critical against a manipulate action.
 * The sheet's action ran NONE of it — `FEAT_AUTOMATION` had no entry for
 * Attack of Opportunity, so `useFeat` fell through to the generic
 * Creature Codex activation card, which prints an ability's own text and
 * says it applies nothing.
 *
 * A player or GM who found only the sheet got a description and no
 * attack. The engine was never broken; it was unreachable from the
 * control they were using.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SUSTAIN DEFECT, ONE RELEASE LATER.
 *
 * magic/sustain.mjs records the same shape almost word for word: "Two
 * doors onto one rule, each doing the half the other did not." There it
 * was the Actions tab spending an AP for nothing while the Magic tab
 * sustained for free. Here the sheet posts a card for nothing while the
 * offer card does the work.
 *
 * So the check that matters is not "does the sheet door exist" but
 * "is there exactly ONE implementation, which both doors call". Two
 * doors that each work are still two rules waiting to disagree.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const opp = read("module", "combat", "opportunity.mjs");
const feats = read("module", "feats-workflow.mjs");
const actions = read("module", "combat", "action-workflow.mjs");

/** One function's body, so a claim is about it and not about the file. */
function body(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  const rest = src.slice(start + signature.length);
  const end = rest.search(/\n(?:export )?(?:async )?function |\n\/\*\*\n \* Door/);
  return rest.slice(0, end === -1 ? rest.length : end);
}

/* ================================================================== *
 * A. THE SHEET DOOR EXISTS AND IS WIRED
 * ================================================================== */

// WHERE THE ACTIONS TAB ACTUALLY DISPATCHES, and the first fix put this
// in the wrong place (3.430.3). Attack of Opportunity is a BASIC ACTION
// with `key: "attackOfOpportunity"`, not a feat item — so an entry in
// `FEAT_AUTOMATION`, keyed on an item's name, could never fire. Driving
// it live is what found that: no actor in the world owns an item by that
// name, because there is no such item.
ok("A1 the action key is dispatched",
  /if \(action\.key === "attackOfOpportunity"\) \{/.test(actions),
  "checkType 'none' means the generic path spends the Reaction and posts the description");
const branch = actions.slice(
  actions.indexOf('if (action.key === "attackOfOpportunity") {'),
  actions.indexOf('if (action.key === "attackOfOpportunity") {') + 400);
ok("A2 which calls the engine rather than reimplementing it",
  /useAttackOfOpportunity\(actor\)/.test(branch)
  && /import\("\.\/opportunity\.mjs"\)/.test(branch),
  "the branch must reach the one implementation, not carry a second copy");
// AND RETURNS, so the generic checkType:"none" path never runs and the
// Reaction is not spent twice — the hazard sustain-workflow.mjs records.
ok("A3 and returns before the generic path can spend the cost again",
  /useAttackOfOpportunity\(actor\);\s*\n\s*return null;/.test(branch),
  "two spends for one reaction would be worse than the bug being fixed");
// ROUTED EARLY. The generic path is the fall-through at the end of the
// dispatch, so a branch placed after it is a branch that never runs.
ok("A4 routed beside the other early returns",
  actions.indexOf('if (action.key === "attackOfOpportunity") {')
    < actions.indexOf('if (isArmableMovement(action.key)) {'),
  "a branch after the generic path is a branch that never runs");
// AND NOT ON THE DOOR IT IS NOT BEHIND. The first attempt wired
// FEAT_AUTOMATION, which useFeat reads by item name; left as a check so
// the wrong fix cannot quietly come back alongside the right one.
// A NEGATIVE ALONE IS VACUOUS, and `verify-checks-read-source` caught
// this one the hour it was written: "the key is absent" stays true when
// the file is blank, so the assertion proved nothing about
// feats-workflow.mjs at all. Paired with the positive that the table it
// would live in is actually there.
ok("A5 not wired to useFeat, which this action never reaches",
  /export const FEAT_AUTOMATION = \{/.test(feats)
  && !/"attack of opportunity": \{/.test(feats),
  "there is no item by that name in any pack — the entry could never fire");

/* ================================================================== *
 * B. ONE IMPLEMENTATION, TWO DOORS
 * ================================================================== */

ok("B1 the strike is a single named rule", /async function performOpportunityStrike\(/.test(opp));
ok("B2 the card door calls it",
  /performOpportunityStrike\(reactor, \{/.test(body(opp, "export async function executeAttackOfOpportunity(message, reactorActorId) {")));
ok("B3 the sheet door calls it",
  /performOpportunityStrike\(actor, \{/.test(body(opp, "export async function useAttackOfOpportunity(actor) {")));

// THE ANCHOR THAT WOULD HAVE CAUGHT THE ORIGINAL DEFECT, and would
// catch a future fix that copies the engine instead of calling it.
// Each of these is spent, rolled or refunded in exactly one place.
for (const [label, needle] of [
  ["B4 the reaction is spent", 'spendReaction(reactor, "Attack of Opportunity"'],
  ["B5 the strike is rolled", "rollWeaponAttack(reactor, weapon, {"],
  ["B6 the reaction is refunded", '"system.resources.reactions.value": Math.min(max, current + 1)'],
  ["B7 the flat-footed allowance is marked", 'setFlag(SYSTEM_ID, "flatFootedOpportunityUsed", true)']
]) {
  ok(`${label} in exactly one place`,
    (opp.split(needle).length - 1) === 1,
    `${opp.split(needle).length - 1} occurrences — two doors must share one, not own one each`);
}

/* ================================================================== *
 * C. WHAT THE TWO DOORS LEGITIMATELY DIFFER ON
 * ================================================================== */

// The card knows who provoked because a move posted it. The sheet does
// not, and must not invent one — the GM picks in the prompt the engine
// already opens. This is the honest difference, so it is stated.
ok("C1 the card door hands over the provoker it recorded",
  /provokerToken: canvas\?\.tokens\?\.get\?\.\(card\.provokerTokenId\)/.test(opp));
ok("C2 the sheet door names none",
  !/provokerToken/.test(body(opp, "export async function useAttackOfOpportunity(actor) {")),
  "a GM invoking it by hand is asserting the trigger and choosing the target");

// THE TRIGGER KIND TRAVELS, and is not re-derived. `disruptsOnCritical`
// and Shielded Stride both turn on it, and the sheet door genuinely does
// not know it — null is the correct answer there, not a guess.
ok("C3 the disruption rule reads the trigger it was passed",
  /disruptsOnCritical\(triggerKind, isCritical\)/.test(opp),
  "reading a card variable here is what made this function card-only");
ok("C4 and Shielded Stride reads the same one",
  /provokedByMovement: triggerKind === "movement"/.test(opp));

/* ================================================================== *
 * D. THE OFFER IS ONLY MARKED SPENT IF A STRIKE HAPPENED
 * ================================================================== */

// Extracted alongside the split: the offer used to be marked used after
// a refund could still have run, so a cancelled target prompt returned
// the reaction and disabled the button anyway — the reactor kept the
// resource and lost the opportunity.
const cardDoor = body(opp, "export async function executeAttackOfOpportunity(message, reactorActorId) {");
ok("D1 a refused or cancelled strike leaves the button live",
  cardDoor.indexOf("if (!result) return null;") !== -1
  && cardDoor.indexOf("if (!result) return null;") < cardDoor.indexOf("setFlag(SYSTEM_ID, AOO_FLAG"),
  "otherwise the reaction is refunded and the offer is disabled anyway");

/* ================================================================== */

const label = "verify-opportunity-doors";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
