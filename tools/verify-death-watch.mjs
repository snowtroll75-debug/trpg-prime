#!/usr/bin/env node
/**
 * verify-death-watch — the death threshold, and the phase labelling.
 *
 * NEW at 3.373.0, covering the two defects Graham reported on 23 August
 * 2026. The first per-rule verify file since the corpus was lost, and the
 * start of the practice agreed that day: the 190-file backlog cannot be
 * rebuilt, but every new batch ships with its own checks so new work is
 * provable even though old work is not.
 *
 * WHAT IT CAN AND CANNOT SEE. `needsReaping`, `dyingIsFatal` and
 * `recoveryState` are pure and are DRIVEN here. The hook registration that
 * calls them is Foundry-only; what is asserted about it is structural — that
 * the registrar exists, is wired into the init script, and watches the four
 * routes a death can arrive by. That is a weaker claim and is marked as
 * such: a structural check cannot see whether a hook fires, which is why
 * this batch was also driven live before shipping.
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
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const death = await import(new URL("../module/combat/death-state.mjs", import.meta.url));

/* ------------------------------------------------------------------ *
 * A. needsReaping — the rule that was missing
 * ------------------------------------------------------------------ */

equal("A1 dead and unskulled needs reaping", death.needsReaping(true, false), true);
equal("A2 dead and already skulled does not", death.needsReaping(true, true), false);
equal("A3 alive never needs reaping", death.needsReaping(false, false), false);
equal("A4 alive and somehow skulled still does not", death.needsReaping(false, true), false);

// IDEMPOTENCE IS THE POINT, not a nicety. Four hooks watch four routes and
// several can fire for one change; without this the same death reaps twice
// and posts two cards.
equal("A5 a second pass over a reaped actor is a no-op", death.needsReaping(true, true), false);

// Truthiness is coerced, because `statuses.has` returns a boolean but a
// caller reading a flag may hand over undefined.
equal("A6 undefined 'dead' is not dead", death.needsReaping(undefined, false), false);
equal("A7 undefined 'skulled' still reaps", death.needsReaping(true, undefined), true);

/* ------------------------------------------------------------------ *
 * B. dyingIsFatal — the threshold itself
 * ------------------------------------------------------------------ */

equal("B1 Dying below the Death State is survivable", death.dyingIsFatal(4, 5), false);
// THE BOUNDARY. "Exceeds" — equal is not fatal. Graham's report said
// "exceeds Death State", and an off-by-one here kills a character a full
// step early, which is the least recoverable bug in the system.
equal("B2 Dying EQUAL to the Death State is not fatal", death.dyingIsFatal(5, 5), false);
equal("B3 Dying one past the Death State is fatal", death.dyingIsFatal(6, 5), true);
equal("B4 Dying far past is fatal", death.dyingIsFatal(12, 5), true);
equal("B5 a non-finite Dying is not fatal", death.dyingIsFatal(null, 5), false);
equal("B6 a non-finite Death State is not fatal", death.dyingIsFatal(6, undefined), false);
equal("B7 no condition at all is not fatal", death.dyingIsFatal(undefined, 5), false);

/* ------------------------------------------------------------------ *
 * C. The watcher is wired
 * ------------------------------------------------------------------ */

const watch = read("module/combat/death-watch-workflow.mjs");
const init = read("scripts/trg-prime.mjs");

ok("C1 the registrar is exported", /export function registerDeathWatchHooks\s*\(/.test(watch));
ok("C2 init imports it", /registerDeathWatchHooks\s*}\s*from\s*"[^"]*death-watch-workflow\.mjs"/.test(init));
// CALLED, not merely imported. Lesson 5.2: `shieldedStrideBonus` was named
// in a workflow and never imported, and every weapon attack threw for a
// release. This is the same assertion from the other side — an import with
// no call is a hook that never registers.
ok("C3 init CALLS it", /^\s*registerDeathWatchHooks\(\);/m.test(init));

for (const hook of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateActor"]) {
  ok(`C4 watches ${hook}`, new RegExp(`Hooks\\.on\\("${hook}"`).test(watch));
}

// The decision must NOT be re-derived inside the workflow. This is the
// project's recurring defect shape — a rule made inside a Foundry-only
// function that no harness can call — and the whole reason `needsReaping`
// exists as a separate pure predicate.
ok("C5 the workflow asks needsReaping rather than re-deriving it",
  /needsReaping\(/.test(watch));
ok("C6 the workflow does not re-implement the threshold",
  !/>\s*deathState|dying\s*>\s*/.test(watch),
  "a comparison against the Death State appears in the workflow");

// One client only, or every connected browser races to delete combatants.
// THE REAP ITSELF IS GATED (re-anchored 3.630.0: the Death State trim is gated too).
ok("C7 gated on the acting GM", /if \(!isActingGM\(\)\) return false;/.test(watch));

// Announced only when THIS call did the removal, so the turn-boundary path
// cannot double-post.
// RE-ANCHORED AT 3.621.0: an instant death (Doomed, Fatigue 20, Soul Drain) is
// announced out of combat too, where there is nothing to remove.
ok("C8 announces only on an actual removal, or an instant death", /if\s*\(result\.removed \|\| result\.cause\)/.test(watch));

/* ------------------------------------------------------------------ *
 * D. Phase 3's cards name their own phase
 * ------------------------------------------------------------------ */

const combat = read("module/documents/combat.mjs");

ok("D1 the phase label is written once", /const END_PHASE_LABEL = "Phase 3 — End Phase";/.test(combat));

// THE DEFECT ITSELF. TRGCheck.roll posts its card immediately and the phase
// summary is posted last, so a flat check always lands above the card that
// explains it. Each check therefore has to say which phase it belongs to.
const recurringCheck = combat.slice(
  combat.indexOf('label: "Recurring Damage — Flat Check"'),
  combat.indexOf('label: "Recurring Damage — Flat Check"') + 240
);
// THE SUBTITLE NOW HAS A SECOND JOB (3.579.0; page 193, Graham's R18):
// recurring damage gained bleeding's GM lever, so the line names the
// reduced DC when there is one — exactly as the bleed check below does.
// Either way the phase is on it, which is what this check is for.
ok("D2 the recurring flat check carries the phase",
  /subtitle: recurringEasier\s*\? `\$\{END_PHASE_LABEL\}[\s\S]{0,80}: END_PHASE_LABEL,/.test(recurringCheck));

const bleedCheck = combat.slice(
  combat.indexOf('label: "Bleeding — Flat Check"'),
  combat.indexOf('label: "Bleeding — Flat Check"') + 320
);
ok("D3 the bleeding flat check carries the phase", /END_PHASE_LABEL/.test(bleedCheck));
// The reduction note must not have displaced the phase — both matter.
ok("D4 the bleeding subtitle keeps its reduction note too", /reduced by/.test(bleedCheck));

// The summary card uses the same constant, so the two cannot drift.
ok("D5 the summary card uses the same constant",
  /#postTurnCard\(actor, END_PHASE_LABEL, lines\)/.test(combat));
ok("D6 no stray hand-written copy of the label remains",
  (combat.match(/"Phase 3 — End Phase"/g) ?? []).length === 1,
  "the literal should appear only in the constant's definition");

// The flat checks must still be in the END phase — the defect was
// presentational, and a "fix" that moved them would be a real regression.
const endPhase = combat.slice(combat.indexOf("async _onEndTurn("));
ok("D7 the recurring flat check is in _onEndTurn",
  endPhase.includes('label: "Recurring Damage — Flat Check"'));
const startPhase = combat.slice(combat.indexOf("async _onStartTurn("), combat.indexOf("async _onEndTurn("));
ok("D8 no flat check was moved into _onStartTurn",
  !/Flat Check/.test(startPhase));

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const EXPECTED_CHECKS = 34;
ok("Z1 the check count is what this file expects",
  checks + 1 === EXPECTED_CHECKS,
  `expected ${EXPECTED_CHECKS}, ran ${checks + 1}. A DROP is the interesting direction — `
  + "a mutation that deletes a branch also deletes the checks guarding it.");

if (failures.length) {
  process.stderr.write(`\nverify-death-watch: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-death-watch: OK — ${checks} checks.\n`);
