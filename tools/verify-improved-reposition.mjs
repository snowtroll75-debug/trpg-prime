#!/usr/bin/env node
/**
 * verify-improved-reposition — the last of the Chapter 5 combat feats.
 *
 * NEW at 3.381.0, deferred from 3.378.0 with a reason: the feat needed a
 * mechanism the system did not have, and a shape that was not obvious.
 *
 * "You no longer need a free hand to use the Reposition action. In
 * addition, you make a Reflex DC (against your targets level DC) to avoid
 * reactions when using this action."
 *
 * ONLY HALF OF THIS IS CODE, and section D is where that is held down.
 * The free-hand clause waives a restriction this system does not enforce
 * anywhere — `attack.mjs` says so about itself. Implementing it would
 * produce a feat that passes a harness and changes nothing at a table,
 * which is the exact shape this audit exists to find, so it is DECLARED
 * as unnecessary instead.
 *
 * THE SAVE IS TAKEN BEFORE THE MOVE because Foundry forces it. The
 * `preMoveToken` hook that decides whether a move provokes is
 * SYNCHRONOUS, and a saving throw is an asynchronous, usually
 * interactive roll. There is nowhere inside that decision to wait for
 * one. So the save is its own step and its success is remembered — which
 * is also Graham's own steer on Attack of Opportunity ("perhaps all we
 * need here is a prompt on the chat log") applied a second time.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { repositionAvoided, repositionSaveDC, repositionSaveNote } from "../module/combat/improved-reposition.mjs";
import { moveActionProvokes } from "../module/combat/opportunity-rules.mjs";
import { levelDC } from "../module/dice/resolution.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== *
 * A. The DC — the target's level, oddly, but as printed
 * ================================================================== */

// Driven against `levelDC` itself rather than against 14 retyped here, so
// the two cannot drift if the ladder ever moves.
for (const level of [0, 1, 5, 12, 20]) {
  equal(`A1 level ${level} gives the level DC`, repositionSaveDC(level), levelDC(level));
}
equal("A2 a missing level is treated as 0, not as NaN", repositionSaveDC(undefined), levelDC(0));
equal("A3 rubbish is treated as 0", repositionSaveDC("over there"), levelDC(0));
// A negative level would otherwise produce a DC below the floor, which
// is not a thing the ladder has.
equal("A4 a negative level cannot lower the DC", repositionSaveDC(-5), levelDC(0));
equal("A5 a fractional level is floored", repositionSaveDC(5.9), levelDC(5));

/* ================================================================== *
 * B. What counts as making the save
 * ================================================================== */

ok("B1 a success avoids", repositionAvoided("success"));
ok("B2 a critical avoids", repositionAvoided("critical"));
ok("B3 a heroic avoids", repositionAvoided("heroic"));
// A PARTIAL DOES NOT COUNT. The sentence offers one thing — avoiding
// reactions — and there is no half of it to hand over. This defers to
// the degree table's own `success: false` rather than deciding for itself.
ok("B4 a PARTIAL does not avoid", !repositionAvoided("partial"),
  "there is no half of 'avoid reactions' to give");
ok("B5 a failure does not", !repositionAvoided("failure"));
ok("B6 a fumble does not", !repositionAvoided("fumble"));
ok("B7 a blunder does not", !repositionAvoided("blunder"));
ok("B8 an unknown degree does not", !repositionAvoided("wibble"));
ok("B9 no degree at all does not", !repositionAvoided(undefined) && !repositionAvoided(""));
ok("B10 case and spacing are tolerated", repositionAvoided(" Success "));

/* ================================================================== *
 * C. ONE function decides whether a move provokes
 * ================================================================== */

// The avoidance is a third argument to the EXISTING rule, not a second
// rule beside it. That function's own header records what a duplicate
// cost last time: it was copied verbatim to its call site, and the
// tested copy went inert.
equal("C1 a Reposition provokes by default", moveActionProvokes("reposition", true), true);
equal("C2 and does not once the save is made", moveActionProvokes("reposition", true, true), false);
// The waiver must not leak into every other kind of movement.
equal("C3 an unarmed Stride still provokes", moveActionProvokes(null, false), true);
equal("C4 a Step still does not", moveActionProvokes("step", false), false);
equal("C5 a Crawl still does", moveActionProvokes("crawl", true), true);
// AND IT MUST NOT INVENT A PROVOKE. `avoided` only ever removes one.
equal("C6 avoiding something that never provoked is still no provoke",
  moveActionProvokes("step", false, true), false);
equal("C7 avoided:false changes nothing", moveActionProvokes("reposition", true, false), true);

/* ================================================================== *
 * D. The half that is deliberately NOT code
 * ================================================================== */

const attackSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/attack.mjs"), "utf8");
const featsWork = fs.readFileSync(path.join(SYSTEM_ROOT, "module/feats-workflow.mjs"), "utf8");
const moveWork = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/movement-workflow.mjs"), "utf8");
const repoSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/combat/improved-reposition.mjs"), "utf8");

// THE CLAIM THE FREE-HAND DECISION RESTS ON, checked rather than
// remembered. If this system ever DOES start enforcing a free hand, this
// check goes red and the feat's other half stops being moot.
// MATCHED ON THE DISTINCTIVE PHRASE, not on the punctuation around it.
// The first version of this quoted the comment with single quotes and an
// apostrophe it does not have, and went red against correct code — a
// check that fails on the spelling of the thing it is checking is worse
// than no check, because the next person deletes it rather than reads it.
ok("D1 the system still does not enforce a free hand",
  /Free hand/.test(attackSrc) && /a restriction this system enforces anywhere/.test(attackSrc),
  "if this changed, Improved Reposition's first clause would need real code");
ok("D2 and the feat's hint tells the player so",
  /does not enforce a free hand for Reposition/.test(featsWork),
  "a player must not be left wondering which half of their feat they got");

/* ================================================================== *
 * E. The wiring
 * ================================================================== */

ok("E1 the feat has an automation entry", /"improved reposition": \{/.test(featsWork));
ok("E2 the flag is set only when the save succeeded",
  /if \(avoided\) await actor\.setFlag\(SYSTEM_ID, "repositionReactionsAvoided", true\);/.test(featsWork));
ok("E3 the move reads that flag",
  /Boolean\(actor\?\.getFlag\?\.\(SYSTEM_ID, "repositionReactionsAvoided"\)\)/.test(moveWork));
// SCOPED TO REPOSITION. A saved-up avoidance must not silently cover a
// Stride the character happens to make next.
ok("E4 and only for a Reposition",
  /armedKey === "reposition"\s*\n?\s*&& Boolean\(actor\?\.getFlag/.test(moveWork),
  "an avoidance bought for one action must not pay for another");
// CLEARED WHATEVER HAPPENS. A one-shot that survives its move would let
// one save buy silence for the rest of the fight.
ok("E5 the flag is cleared when read",
  /unsetFlag\?\.\(SYSTEM_ID, "repositionReactionsAvoided"\)/.test(moveWork));
/* THE ARGUMENT LIST GREW AT 3.548.0 — `moverImmune`, for the Swarm's
 * immunity to reactions provoked by movement — so this asserts that
 * `avoided` still reaches the one rule rather than pinning the exact
 * arity, which would break again the next time the rule learns a fact. */
ok("E6 the avoidance goes through the one provoke rule",
  /moveActionProvokes\(\s*armedKey,\s*config\?\.provokesReactions,\s*avoided\b/.test(moveWork),
  "a caller skipping the call would be a second place deciding this");
ok("E7 the save's result is announced",
  /repositionSaveNote\(avoided, target\.name\)/.test(featsWork),
  "a Reposition that provokes nothing looks like a broken reaction system otherwise");
ok("E8 both outcomes are announced, not just the good one",
  /the save fails/.test(repoSrc),
  "silence on a failed save reads as the feat not having fired");
// The DC shown in the picker must be the DC rolled against.
ok("E9 the dialog shows the DC it will roll against",
  /DC \$\{repositionSaveDC\(c\.level\)\}/.test(featsWork));

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-improved-reposition: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-improved-reposition: OK — ${checks} checks.\n`);
