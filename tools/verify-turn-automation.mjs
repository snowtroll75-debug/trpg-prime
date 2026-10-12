#!/usr/bin/env node
/**
 * verify-turn-automation — a second GM connecting must not switch the
 * combat rules off for the first one.
 *
 * NEW at 3.430.1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 28 August 2026:
 *
 *   "1. No surprise round is being prompted at the start of a combat.
 *    2. Actors are not beginning the fight flat-footed.
 *    You should not be disabling rules that work!"
 *
 * Two rules, one cause, no error message. `TRGCombat.automates` read
 * `turnAutomation && isActingGM()`, and `startCombat` asked it before
 * doing anything. `isActingGM()` answers "am I the DESIGNATED GM
 * client?" — the right question inside a hook that fires everywhere, and
 * the wrong one inside a method that only ever runs on the client whose
 * user clicked the button.
 *
 * Graham's world holds two GM users. Foundry names one of them
 * `game.users.activeGM`; the other clicks Begin Combat and falls straight
 * through to `super.startCombat()`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NO TEST COULD HAVE CAUGHT IT, which is the part worth keeping.
 *
 * Every live pass this project has run drove combat from the seat that
 * HAPPENED TO BE `activeGM` — so the failing branch was unreachable by
 * the method used to test it. combat/target-relay.mjs records the same
 * sentence about a permission defect found in the same world in August:
 * "a permission defect is invisible to that method by construction."
 * This is the identity version of it.
 *
 * Section C is therefore the one that matters: it asserts the invoked
 * decision CANNOT CONSULT the acting GM at all, because a decision that
 * cannot see a second GM cannot be changed by one.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { automatesBroadcast, automatesInvoked } from "../module/combat/turn-automation.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const combat = read("module", "documents", "combat.mjs");
const rule = read("module", "combat", "turn-automation.mjs");

/** The body of one method, so an ordering or usage claim is about it. */
function method(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  // To the next method at the same indentation — enough for a usage claim.
  const rest = src.slice(start + signature.length);
  const end = rest.search(/\n  (?:async |static |\/\*\*|#|[a-zA-Z_])/);
  return rest.slice(0, end === -1 ? rest.length : end);
}

/* ================================================================== *
 * A. THE INVOKED DECISION — a method the user's own click runs
 * ================================================================== */

ok("A1 a GM with automation on runs it",
  automatesInvoked({ enabled: true, isGM: true }) === true);
ok("A2 automation switched off stops it",
  automatesInvoked({ enabled: false, isGM: true }) === false);
ok("A3 a player does not drive combat",
  automatesInvoked({ enabled: true, isGM: false }) === false);
// THE WHOLE DEFECT, stated as the property that was violated. A second
// GM connecting changes `game.users.activeGM` and nothing else about
// this user; the answer must not move.
ok("A4 the answer does not depend on which GM Foundry designated",
  automatesInvoked({ enabled: true, isGM: true, isActingGM: false }) === true,
  "the GM who clicked Begin Combat got no surprise round and no Flat-Footed");
ok("A5 and a missing argument object is not an accident waiting to happen",
  automatesInvoked() === false && automatesInvoked({}) === false);

/* ================================================================== *
 * B. THE BROADCAST DECISION — a callback that fires on every client
 * ================================================================== */

ok("B1 the acting GM runs it", automatesBroadcast({ enabled: true, isActingGM: true }) === true);
// STILL NECESSARY, and this is why the fix is a split rather than a
// replacement. This build's `_manageTurnEvents` is not gated on the
// active GM, so `_onStartTurn` really does run on every connected
// client; dropping the guard would apply each turn's bookkeeping once
// per GM logged in.
ok("B2 a second GM does NOT, or a two-GM table books every turn twice",
  automatesBroadcast({ enabled: true, isActingGM: false }) === false);
ok("B3 automation switched off stops it too",
  automatesBroadcast({ enabled: false, isActingGM: true }) === false);

/* ================================================================== *
 * C. THE TWO ARE NOT THE SAME QUESTION
 * ================================================================== */

// THE ANCHOR THAT MATTERS. `automatesInvoked` must not so much as
// mention the acting GM: a decision that cannot consult a second GM
// cannot be changed by one. Asserted against the SOURCE of the function
// rather than its behaviour, because behaviour can be right today and
// acquire the parameter tomorrow.
const invokedSrc = rule.slice(rule.indexOf("export function automatesInvoked"));
const invokedBody = invokedSrc.slice(0, invokedSrc.indexOf("\n}") + 2);
ok("C1 the invoked decision cannot see the acting GM",
  !/isActingGM|activeGM/.test(invokedBody), invokedBody.trim());
ok("C2 and the broadcast one is defined entirely by it",
  /isActingGM/.test(rule.slice(rule.indexOf("export function automatesBroadcast"))));
ok("C3 they answer differently for a non-acting GM",
  automatesInvoked({ enabled: true, isGM: true })
  !== automatesBroadcast({ enabled: true, isActingGM: false }),
  "if these agreed there would be nothing to split");

/* ================================================================== *
 * D. THE CALL SITES — each guard on the right side of the line
 * ================================================================== */

// REACHABILITY, NOT PRESENCE: each of these names the guard inside the
// method it governs, so moving a guard out of a method fails the check
// rather than passing on a match elsewhere in a 1000-line file.
for (const [label, signature, want] of [
  ["D1 startCombat", "async startCombat() {", "automatesInvoked"],
  ["D2 nextTurn", "async nextTurn() {", "automatesInvoked"],
  ["D3 _onStartTurn", "async _onStartTurn(combatant) {", "automates"],
  ["D4 _onEndTurn", "async _onEndTurn(combatant, context) {", "automates"]
]) {
  const body = method(combat, signature);
  ok(`${label} is guarded`, body.length > 0 && /TRGCombat\.automates/.test(body),
    body ? "no guard found in the method body" : "method not found");
  const usesInvoked = /TRGCombat\.automatesInvoked/.test(body);
  ok(`${label} uses the ${want} form`,
    want === "automatesInvoked" ? usesInvoked : !usesInvoked,
    want === "automatesInvoked"
      ? "a method the user's click runs must not ask which GM Foundry designated"
      : "a callback that fires on every client must ask exactly that");
}

// AND THE TWO GETTERS ARE BUILT FROM THE PURE RULES, not from a second
// copy of the expression. The whole reason this is a file is that the
// expression was written inline and was wrong in one of its two uses.
// THE RETURN IS THE DELEGATION, not merely a call somewhere inside the
// getter. `return true || automatesBroadcast({...})` leaves the call
// text intact and short-circuits past it — presence-versus-reachability,
// which is the shape that has now survived a first mutation run in three
// consecutive harness files.
ok("D5 the getters delegate to the pure rules",
  /static get automates\(\) \{\s*return automatesBroadcast\(\{/.test(combat)
  && /static get automatesInvoked\(\) \{\s*return automatesInvoked\(\{/.test(combat));
ok("D6 and the setting is read in one place",
  (combat.match(/game\.settings\.get\(SYSTEM_ID, "turnAutomation"\)/g) ?? []).length === 1,
  "two readings of one switch is how the two uses came to disagree");

/* ================================================================== */

const label = "verify-turn-automation";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
