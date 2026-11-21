#!/usr/bin/env node
/**
 * verify-live-fixes-3706-1 — core 3.706.1: what the live test of 3.706.0
 * found (PC Tester and the GM, the "Test" world, 21 November 2026).
 *
 *   A  Combat Grapple's Grabbed was stamped to expire one round sooner than
 *      a Grapple Attack's laid the same round (round 2 against round 3): its
 *      "until the end of your next turn" was one round on the clock, not
 *      the two `extractDurationRounds` gives every such duration.
 *   B  An Attack of Opportunity with a Thrown-trait melee weapon (the foe's
 *      Club), taken once the provoker had moved beyond reach, was made as a
 *      throw: range penalty, and the Club thrown away. An Attack of
 *      Opportunity is a melee Strike; the provoker was in reach when it
 *      provoked.
 *
 *   R  each reproduced against the 3.706.0 shape
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const { combatGrappleGrab } = await mod("combat", "action-feats.mjs");
const { extractDurationRounds } = await mod("magic", "effect-duration.mjs");
const AWK = read("module", "combat", "attack-workflow.mjs");
const OPP = read("module", "combat", "opportunity.mjs");
const AW = read("module", "combat", "action-workflow.mjs");

/* R — as it was ------------------------------------------------------------ */
{
  const rounds = extractDurationRounds("Your target is grabbed until the end of your next turn unless you move or your target Escapes.");
  equal("R1 a Grapple Attack's Grabbed is two rounds on the clock", rounds, 2);
  ok("R2 3.706.0 gave Combat Grapple's one", 1 + 1 !== 1 + rounds);
}

/* A — Combat Grapple's clock -------------------------------------------------- */
{
  const next = extractDurationRounds("until the end of your next turn");
  equal("A1 in an encounter: the clock a Grapple Attack's has, laid the same round", combatGrappleGrab({ hits: true, inCombat: true, round: 1 }).expiresRound, 1 + next);
  equal("A2 at round 4 too", combatGrappleGrab({ hits: true, inCombat: true, round: 4 }), { grab: true, expiresRound: 4 + next });
  equal("A3 out of an encounter: no clock; a miss: nothing",
    [combatGrappleGrab({ hits: true, inCombat: false, round: 4 }), combatGrappleGrab({ hits: false, inCombat: true, round: 4 })],
    [{ grab: true, expiresRound: null }, { grab: false, expiresRound: null }]);
  ok("A4 the Grapple Attack's own clock is read the same way", /const durationRounds = extractDurationRounds\(outcome\.text\);/.test(AW)
    && /\? Number\(game\.combat\.round \?\? 0\) \+ durationRounds/.test(AW));
}

/* B — an Attack of Opportunity is never a throw ----------------------------- */
{
  const decl = AWK.slice(AWK.indexOf("  const thrownByDistance ="), AWK.indexOf("  const thrownAttack = "));
  ok("B1 the throw by distance is not made for an Attack of Opportunity", /\n\s+!reachAlreadyEstablished &&\n\s+distanceToTarget !== null &&/.test(decl));
  ok("B2 and the Attack of Opportunity is the strike that says so", /reachAlreadyEstablished: true/.test(OPP));
  ok("B3 its reach is not measured again either", /\(reachAlreadyEstablished \|\| withinReachOverride\(distanceToTarget, reachOverrideFeet\)\) \? null : distanceToTarget,/.test(AWK));
  ok("B4 a Strike that is not one still throws by distance", /canThrow &&\n[\s\S]*?distanceToTarget > meleeReach &&/.test(decl));
}

const EXPECTED = 11;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-live-fixes-3706-1: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-live-fixes-3706-1: OK — ${checks} checks`);
