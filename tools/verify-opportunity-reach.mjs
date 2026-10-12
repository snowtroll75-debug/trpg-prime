#!/usr/bin/env node
/**
 * verify-opportunity-reach — an Attack of Opportunity is provoked AT reach.
 *
 * NEW at 3.374.0, for Graham's report of 23 August 2026: an AoO fires and
 * "the character moves and then is out of range".
 *
 * WHAT WAS WRONG. `rollWeaponAttack` measures the distance to the target
 * at the moment it is called and refuses outright when the target is
 * beyond reach. For an ordinary Strike that is right. For an Attack of
 * Opportunity it asks the wrong question: the reaction is provoked BY the
 * target leaving reach, so by the time anybody reads the card and clicks
 * the button, the provoker has always finished moving. The strike its own
 * departure provoked was then refused for the departure.
 *
 * And the reaction was spent BEFORE that call, so the reactor lost it and
 * got no roll — the one outcome worse than no automation at all.
 *
 * WHAT THIS CHECKS. Two things, and neither is the arithmetic: that the
 * reach gate can be told the question is already answered, and that the
 * AoO path tells it. Plus the refund, which is the safety net for every
 * other way `rollWeaponAttack` can decline.
 *
 * These are structural assertions over source, which is a weaker claim
 * than driving the rule — said plainly rather than left to be assumed.
 * The reach gate needs a canvas, two tokens and a live distance, so the
 * proof that it behaves is a live pass, not this file.
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
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const attack = read("module/combat/attack-workflow.mjs");
const opportunity = read("module/combat/opportunity.mjs");

/* ------------------------------------------------------------------ *
 * A. The gate can be told the question is already answered
 * ------------------------------------------------------------------ */

ok("A1 rollWeaponAttack accepts reachAlreadyEstablished",
  /reachAlreadyEstablished\s*=\s*false/.test(attack),
  "the option must exist and default to false, so no ordinary Strike is affected");

// THE DEFAULT IS THE SAFETY. Every other caller must keep the gate.
ok("A2 it defaults to false", /reachAlreadyEstablished\s*=\s*false/.test(attack));

const gate = attack.slice(
  attack.indexOf("let reach = null;"),
  attack.indexOf("let rangeIncrement = null;")
);
ok("A3 the reach gate consults the flag", /reachAlreadyEstablished/.test(gate));

// A4 ASSERTED THE BUG, and this is the correction.
//
// The first version of this check demanded the flag sit on the ENCLOSING
// condition, skipping the reach block entirely. That is what the first fix
// did, and it made every Attack of Opportunity throw: `reach` is read again
// much later for the attack-roll modifier, so skipping the block left it
// null and `reach.penalty` blew up. The harness went green over it, because
// the check and the code shared the same wrong idea.
//
// It was caught by driving one strike. So the assertion is now the opposite:
// the block must still RUN, and only the distance is withheld.
// 3.575.0: the reach block's condition is named (`measuresReach`) and no
// longer carries `!targetCannotBeFlanked` — reach is not a flanking
// question (block-15 audit, D12). The flanking block keeps its own gate.
ok("A4 the reach block still runs — only the distance is withheld",
  /const measuresReach = positional && !isRanged;\s*if \(measuresReach\) \{[\s\S]{0,400}const normalReach/.test(attack),
  "the enclosing condition must not be gated on the flag, or `reach` is left null");
ok("A4b the flag decides the DISTANCE passed to reachPenalty",
  /reachAlreadyEstablished \? null : distanceToTarget/.test(attack),
  "null is reachPenalty's own 'nothing to measure' case");
// THE ASSERTION THAT WOULD HAVE CAUGHT IT. `reach` is dereferenced later;
// it must therefore be assigned on every path the dereference can be
// reached by.
ok("A4c reach is always assigned before it is read",
  !/if\s*\([^)]*reachAlreadyEstablished[^)]*\)\s*\{\s*const normalReach/.test(attack)
    && !/const measuresReach = [^;]*reachAlreadyEstablished/.test(attack),
  "a path that leaves `reach` null will throw on reach.penalty");

// The refusal itself must still exist for everyone else.
ok("A5 the out-of-reach refusal still exists for ordinary Strikes",
  /if\s*\(reach\.outOfReach\)/.test(gate) && /return null;/.test(gate));

/* ------------------------------------------------------------------ *
 * B. The Attack of Opportunity says so
 * ------------------------------------------------------------------ */

// THE STRIKE MOVED, AND THIS SLICE FOLLOWED IT (3.430.2).
//
// Everything below is a property of what an Attack of Opportunity DOES,
// and until 3.430.2 that lived inside `executeAttackOfOpportunity` —
// which is why this file sliced from there. Graham's report that the
// character sheet's own action rolled nothing showed that door had never
// been wired to any of it, so the strike is now `performOpportunityStrike`
// and BOTH doors call it. The slice points at the rule rather than at one
// of its callers; see verify-opportunity-doors for the sharing itself.
const strike = opportunity.slice(
  opportunity.indexOf("async function performOpportunityStrike("),
  opportunity.indexOf("export async function executeAttackOfOpportunity"));

ok("B1 the AoO strike passes reachAlreadyEstablished",
  /reachAlreadyEstablished:\s*true/.test(strike));
// PASSED IN, NOT READ OFF A CARD. It was `card.triggerKind`, which is
// precisely what made the strike reachable only from a card.
ok("B2 it still passes provokedByMovement", /provokedByMovement:\s*triggerKind === "movement"/.test(strike));
ok("B3 it is still flagged as a reaction", /isReaction:\s*true/.test(strike));

/* ------------------------------------------------------------------ *
 * C. A reaction is not eaten by a refusal
 * ------------------------------------------------------------------ */

ok("C1 a null attack result refunds the reaction", /if\s*\(!result\)/.test(strike));
// A THROW MUST REFUND TOO. The first 3.374.0 attempt threw inside
// rollWeaponAttack, so a refund guarded only by `!result` never ran and the
// reaction vanished with no card and no warning.
ok("C1b the strike is wrapped so a throw also refunds",
  /try\s*\{[\s\S]{0,400}rollWeaponAttack\(/.test(strike) && /catch\s*\(err\)/.test(strike));
ok("C2 the refund is capped at the reactor's maximum",
  /Math\.min\(max,\s*current \+ 1\)/.test(strike),
  "a refund past the cap would hand out reactions the character never had");
ok("C3 the refund says so rather than happening silently",
  /ui\.notifications\.info/.test(strike));
// ORDERING. The refund must come BEFORE the offer is marked used, or a
// reactor who got no attack still loses the button.
// NOW A PROPERTY ACROSS THE TWO PIECES, and stronger for it: the refund
// lives in the shared strike, and the card door only marks its offer
// spent after that strike has returned a real result.
const cardDoor = opportunity.slice(opportunity.indexOf("export async function executeAttackOfOpportunity"));
const refundAt = strike.indexOf("if (!result)");
const bailAt = cardDoor.indexOf("if (!result) return null;");
const markUsedAt = cardDoor.indexOf("const nextUsed");
ok("C4 the refund happens before the offer is marked spent",
  refundAt > -1 && bailAt > -1 && markUsedAt > -1 && bailAt < markUsedAt);

/* ------------------------------------------------------------------ *
 * D. Nothing was left behind from the abandoned interrupt design
 * ------------------------------------------------------------------ */

// A pause/resume interrupt was started and then dropped when Graham said
// the simpler prompt was enough. Its pure rule was deleted the same hour;
// this makes sure no half of it creeps back in unwired.
const rules = read("module/combat/opportunity-rules.mjs");
ok("D1 no orphaned movementResumes rule", !/movementResumes/.test(rules));
ok("D2 no pauseMovement call was left in the opportunity path",
  !/pauseMovement|resumeMovement/.test(opportunity));

/* ------------------------------------------------------------------ */

const EXPECTED_CHECKS = 18;
ok("Z1 the check count is what this file expects",
  checks + 1 === EXPECTED_CHECKS,
  `expected ${EXPECTED_CHECKS}, ran ${checks + 1}`);

if (failures.length) {
  process.stderr.write(`\nverify-opportunity-reach: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-opportunity-reach: OK — ${checks} checks.\n`);
