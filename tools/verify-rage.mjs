#!/usr/bin/env node
/**
 * verify-rage — a rage can be entered, and can be left.
 *
 * NEW at 3.416.0, after Graham's session on 26 August 2026 ended with a
 * character stuck in a rage the system had no exit from.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUR DEFECTS, AND THEY COMPOUNDED.
 *
 *   A  TEMPORARY HP WAS INVISIBLE. `hp.temp` was rendered on the PARTY
 *      sheet and nowhere else, so rage's class-bonus x 20 grant could
 *      only be seen by opening a different sheet.
 *
 *   B  NOTHING ENDED A RAGE. `endRage` had exactly ONE caller — a
 *      SUCCESSFUL Revoke Rage roll. The `duration: {seconds: 60}` on the
 *      effect was read by nobody: neither sweep in this system touches
 *      it, and Foundry does not delete an expired effect by itself. The
 *      printed minute was decoration.
 *
 *   C  `rageEffect` MATCHED BY NAME AND IGNORED `disabled`. Switching
 *      the effect off left Foundry no longer applying the changes while
 *      every rule still answered "yes, raging" — the character kept none
 *      of the benefit and all of the lock.
 *
 *   D  `mustRideOut` WAS CLEARED BY NOTHING. Set on a fumbled Revoke, it
 *      refuses every later Revoke while waiting for a minute that B had
 *      already established nobody was counting.
 *
 * D on top of B is the trap: one bad roll, and the rage is permanent. C
 * is why the obvious escape hatch did not work either.
 *
 * The lesson is B's shape rather than any single line: `endRage` was
 * correct, tested, and reachable from exactly one branch of one action.
 * `verify-rules-have-callers` counts an export with NO callers; it has
 * nothing to say about one whose only caller is a success branch. "Can
 * this state be left?" is a question about the graph, not the function.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RAGE_DURATION_SECONDS, RAGE_DURATION_ROUNDS, RAGE_EFFECT_NAME,
  rageExpiry, rageHasElapsed, rageTemporaryHP, revokeRageResult
} from "../module/combat/rage.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const src = (...f) => fs.readFileSync(path.join(SYSTEM_ROOT, ...f), "utf8");

/* ================================================================== *
 * A. The minute, on both clocks
 * ================================================================== */

ok("A1 a rage lasts one minute", RAGE_DURATION_SECONDS === 60);
ok("A2 which is ten rounds", RAGE_DURATION_ROUNDS === 10,
  "a round is six seconds; both clocks must mean the same minute");

const started = rageExpiry({ worldTime: 1000, round: 3 });
ok("A3 the world-clock end is stamped", started.endsAtWorldTime === 1060);
ok("A4 the combat-clock end is stamped", started.endsOnRound === 13);
ok("A5 a rage begun outside combat has no round to count",
  rageExpiry({ worldTime: 500, round: null }).endsOnRound === null,
  "there are no rounds in a corridor");

/* ================================================================== *
 * B. Has the minute run out?
 * ================================================================== */

ok("B1 not before either clock reaches its mark",
  rageHasElapsed(started, { worldTime: 1030, round: 5 }) === false);
ok("B2 the world clock ends it", rageHasElapsed(started, { worldTime: 1060, round: null }) === true);
ok("B3 the combat clock ends it", rageHasElapsed(started, { worldTime: null, round: 13 }) === true);
// EITHER CLOCK, because only one of them is moving at a time. A rage in
// a fight gets rounds and no seconds; one in a corridor gets the
// reverse. Requiring both would end no rage anywhere.
ok("B4 either clock is enough, not both",
  rageHasElapsed(started, { worldTime: 99999, round: 4 }) === true
  && rageHasElapsed(started, { worldTime: 1001, round: 99 }) === true);
// B5 SAID THE OPPOSITE AT 3.416.0, and was wrong. It asserted that an
// unstamped rage simply never expires, reasoning that no start time was
// available. Throngar Redtusk disproved it a day later: his stuck rage
// carried `duration: {seconds: 60}` and Foundry had computed
// `remaining: -9459`. The start time was recorded from the beginning and
// nothing read it — the same defect the release fixed, inside the fix.
ok("B5 an unstamped rage falls back to the effect's own countdown",
  rageHasElapsed({ degree: "success" }, { worldTime: 99999, durationRemaining: -9459 }) === true,
  "Foundry recorded the start; reading it is not inventing one");
ok("B5b and an unstamped rage still running does not expire",
  rageHasElapsed({ degree: "success" }, { worldTime: 99999, durationRemaining: 42 }) === false);
ok("B5c a rage with neither a stamp nor a countdown is unmeasurable",
  rageHasElapsed({ degree: "success" }, { worldTime: 99999, round: 999 }) === false,
  "that one waits to be revoked or switched off, which is now possible");
// A STAMP STILL WINS over the fallback: a modern rage is measured by the
// clocks it recorded, not by whatever Foundry's countdown happens to say.
ok("B5d a stamped rage ignores the countdown",
  rageHasElapsed(started, { worldTime: 1030, round: 5, durationRemaining: -999 }) === false);
ok("B6 no state at all has not elapsed",
  rageHasElapsed(null, { worldTime: 99999, round: 999 }) === false);

/* ================================================================== *
 * C. THE EXIT EXISTS — the section this file was written for
 *
 * Not "does endRage work" (it always did) but "can the state be left".
 * Three routes, and before 3.416.0 there was one, reachable only by
 * rolling well.
 * ================================================================== */

const workflow = src("module", "combat", "rage-workflow.mjs");
const combatDoc = src("module", "documents", "combat.mjs");
const bootstrap = src("scripts", "trg-prime.mjs");

ok("C1 a rage can be ended by revoking it",
  /endRage\(/.test(src("module", "combat", "action-workflow.mjs")),
  "the original route, and until 3.416.0 the only one");
// ANCHORED WITH \b, and every one of these needed it. The first draft
// wrote /export async function expireRage/, which happily matches
// `expireRageX` — so a mutation renaming the function survived a check
// whose whole purpose was to notice that it had gone. Five of the ten
// mutations survived the first run for exactly this reason: a prefix is
// not a name.
ok("C2 a rage ends when its minute runs out",
  /export async function expireRage\b/.test(workflow));
// AND THE SWEEP MUST BIND THE REAL FUNCTION, not merely call something
// spelled like it: renaming the IMPORT while leaving the call site
// intact is a live way to break this, and reads as fine at a glance.
ok("C3 the combat clock sweeps it",
  /import \{ expireRage \}/.test(combatDoc) && /\bexpireRage\(/.test(combatDoc),
  "a rage in a fight is measured in rounds");
ok("C4 the world clock sweeps it too",
  /\{ expireRage \} = await import/.test(bootstrap) && /\bexpireRage\(/.test(bootstrap),
  "a rage outside a fight gets no turns at all");
// A LEFTOVER FROM BEFORE THE TOGGLE HOOK EXISTED cannot be ended by that
// hook — it fires on the transition, and the transition already
// happened. The sweep therefore looks past `rageEffect` to find a
// disabled one and clears it.
ok("C4b the sweep can see a disabled leftover",
  /effects\?\.find\(\(e\) => e\.name === RAGE_EFFECT_NAME\)/.test(workflow),
  "rageEffect ignores a disabled rage, which is right and hides a leftover");
ok("C4c a leftover is cleared without charging Fatigue",
  /endRageOnDisable\(effect, \{ fatigue: 0 \}\)/.test(workflow),
  "it ended whenever it was switched off; the cost cannot land now");
ok("C5 switching the effect off ends it",
  /export async function endRageOnDisable\b/.test(workflow)
  && /\bendRageOnDisable\b/.test(bootstrap),
  "the gesture a GM reaches for first must not be the one with no meaning");

// AND EVERY EXIT MUST CHARGE THE COST. "When you eventually come out of
// Rage, you are fatigued 1 for 1 hour" — however it ends. An exit that
// skipped it would be the cheapest way out and would ignore the rule.
// WINDOWED, and the window had to grow when expireRage did — a
// character-count fence around a regex is a fragile way to say "inside
// this function", and it failed the moment the function gained the
// leftover branch. Matched against the extracted body instead.
{
  const at = workflow.indexOf("export async function expireRage");
  const body = at === -1 ? "" : workflow.slice(at, workflow.indexOf("\n}", at));
  ok("C6 expiry charges the Fatigue", /endRage\(actor, \{ fatigue/.test(body),
    "however a rage ends, the book charges Fatigue for coming out of one");
}
ok("C7 the toggle charges the Fatigue",
  /endRageOnDisable[\s\S]{0,1600}?key: "fatigued"/.test(workflow));
ok("C8 the toggle clears the temporary HP it granted",
  /endRageOnDisable[\s\S]{0,1400}?hp\.temp/.test(workflow),
  "otherwise switching it off is strictly better than playing the rule");

/* ================================================================== *
 * D. A disabled rage is not a rage
 * ================================================================== */

ok("D1 rageEffect ignores a disabled effect",
  /effect\.name === RAGE_EFFECT_NAME && !effect\.disabled/.test(workflow),
  "the sheet and the rules must not disagree about the same character");

/* ================================================================== *
 * E. Revoke, and the ride-out that locked the door
 * ================================================================== */

ok("E1 a good revoke ends the rage", revokeRageResult("success").ended === true);
ok("E2 a fumble does not, and must be ridden out",
  revokeRageResult("fumble").mustRideOut === true);
ok("E3 the fumble costs more Fatigue",
  revokeRageResult("fumble").fatigue > revokeRageResult("success").fatigue);
// THE LOCK IS ONLY SURVIVABLE BECAUSE THE MINUTE IS NOW REAL. Before
// 3.416.0 `mustRideOut` waited on a clock nobody read, so a fumbled
// Revoke was permanent.
ok("E4 a ride-out rage still expires on the clock",
  rageHasElapsed({ ...started, mustRideOut: true }, { worldTime: 1060 }) === true,
  "otherwise one bad roll is a permanent condition");

/* ================================================================== *
 * F. Temporary HP is visible where the character is
 * ================================================================== */

const sheet = src("templates", "actor", "actor-sheet.hbs");
const party = src("templates", "actor", "party-sheet.hbs");
ok("F1 the party sheet shows temporary HP", /hp\.temp/.test(party));
// THE `name` ATTRIBUTE, not merely a mention. A Handlebars expression
// beside it renders the number; only `name` binds the field to the
// document, and the first draft of this check matched either — so a
// mutation renaming the binding survived while the display stayed put.
ok("F2 and so does the character sheet",
  /name="system\.resources\.hp\.temp"/.test(sheet),
  "it was on the party sheet alone, so rage's grant was invisible to its owner");
ok("F3 the grant is what the book says",
  rageTemporaryHP(3) === 60 && rageTemporaryHP(0) === 0,
  "class bonus x 20");

/* ================================================================== */

const label = "verify-rage";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
