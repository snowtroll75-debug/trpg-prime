#!/usr/bin/env node
/**
 * verify-dismissible-spells — the (D) on a duration line.
 *
 * NEW at 3.494.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND LIVE, 5 September 2026, while testing Delayed Respite's
 * dismissal — and it had been true since Dismiss was built.
 *
 * `magic/dismiss.mjs` is complete and has been since 3.434.0: 1 AP,
 * Concentrate, both doors wired, and it reaches "EVERY active entry".
 * But the registration gate in cast-workflow.mjs asked three questions:
 *
 *     if (lock || spellData.sustained || emanationIsLive(spellData)) {
 *
 * — PP locked, sustained, live emanation. None of them is the question
 * the book prints on the duration line. So a spell whose duration says
 * (D), whose entire meaning is "this can be dismissed", registered
 * nothing, and the action written to dismiss it could not see it.
 *
 * SECTION M IS THE MEASUREMENT, and it is asked of the live pack rather
 * than of my memory of it: 56 spells print (D) and 53 of them are
 * neither sustained nor locked. Shield, Mirror Image, Levitate,
 * Antimagic Field, Cloudkill, Geas, every Shape Of The ⟨…⟩, all three
 * Prisons — and Delayed Respite, whose dismissal Graham had just ruled
 * on.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION X IS WHY THIS RELEASE IS NOT WORSE THAN THE GAP.
 *
 * Everything registered before this had something that ended it: a lock
 * ends at daily preparations, a sustained spell at its lapse, an
 * emanation on its own stamped clock. A flat "1 minute (D)" has none of
 * those, so 53 more registrations without a clock would have traded a
 * gap for a panel filling up with spells that ended last session. The
 * entry now wears the emanation's own stamp and ONE sweep reads both.
 *
 * SECTION S IS THE ONE THING THIS DELIBERATELY DOES NOT DO. 62 of the 72
 * sustained spells print a cap — "Bless, Sustained (1 minute)" — and
 * stamping the entry would end them there for the first time.
 * `emanation-growth.mjs` records the decision not to invent that clock,
 * in those words, and this change does one thing.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { isDismissibleDuration, activeSpellState } from "../module/magic/active-spells.mjs";
import { removeEffectsByCastId } from "../module/combat/effect-application-workflow.mjs";
import { endsStamp, endsHaveElapsed } from "../module/magic/spell-ends.mjs";
import { castWillRegister } from "../module/magic/active-spells.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
function bodyOf(source, signature) {
  const at = source.indexOf(signature);
  if (at < 0) return "";
  const rest = source.slice(at + signature.length);
  const stops = [rest.indexOf("\nexport "), rest.indexOf("\nasync function"), rest.indexOf("\nfunction ")]
    .filter((n) => n > 0);
  return rest.slice(0, stops.length ? Math.min(...stops) : rest.length);
}

/* ================================================================== *
 * D. READING THE (D)
 * ================================================================== */

ok("D1 a plain (D) is read", isDismissibleDuration("1 round (D)"));
ok("D1b wherever it sits in the line", isDismissibleDuration("10 minutes (D)")
  && isDismissibleDuration("varies (D)"));
ok("D2 and a spell without one is not dismissible",
  isDismissibleDuration("1 minute") === false);
// D3 NOT A BARE LETTER. "(S)" is a different notation entirely — a
// sustained spell that runs a fixed duration while dormant — and a test
// loose enough to catch a D anywhere would catch half the pack.
ok("D3 (S) is not (D)", isDismissibleDuration("10 minutes (S)") === false);
ok("D3b nor is a D in a word",
  isDismissibleDuration("1 day") === false
  && isDismissibleDuration("until daily preparations") === false);
ok("D4 nothing at all is not dismissible",
  isDismissibleDuration("") === false && isDismissibleDuration(null) === false);

/* ================================================================== *
 * E. THE STAMP THAT TAKES IT OFF THE PANEL AGAIN
 * ================================================================== */

const stamp = endsStamp({ seconds: 60, rounds: 10, worldTime: 1000, round: 3 });
equal("E1 the world clock is stamped", stamp.endsAtWorldTime, 1060);
equal("E1b and the round clock", stamp.endsOnRound, 13);
// E2 OUT OF COMBAT THERE ARE NO ROUNDS, and a null round must not become
// round 0 — which every combat has already passed.
equal("E2 no encounter means no round mark",
  endsStamp({ seconds: 60, rounds: 10, worldTime: 1000, round: null }).endsOnRound, null);
ok("E2b but the world clock still counts",
  endsStamp({ seconds: 60, rounds: 10, worldTime: 1000, round: null }).endsAtWorldTime === 1060);

// E3 NOTHING TO COUNT IS NO STAMP AT ALL. A stamp of two nulls reads
// downstream exactly like a spell still running, and would be asked
// about forever. "varies (D)" — Forget, Confusion — gets none, and is
// ended by a person instead.
ok("E3 AN UNCOUNTABLE DURATION GETS NO STAMP",
  endsStamp({ seconds: null, rounds: null, worldTime: 1000, round: 3 }) === null,
  "Forget and Confusion print \"varies\" and end when somebody says so");

ok("E4 an elapsed world clock ends it",
  endsHaveElapsed({ endsAtWorldTime: 1060, endsOnRound: null }, { worldTime: 1060 }));
ok("E4b and one still running does not",
  endsHaveElapsed({ endsAtWorldTime: 1060, endsOnRound: null }, { worldTime: 1059 }) === false);
ok("E5 EITHER CLOCK ENDS IT — the round one alone",
  endsHaveElapsed({ endsAtWorldTime: null, endsOnRound: 13 }, { worldTime: null, round: 13 }),
  "rounds pass in a fight where the world clock does not move");
ok("E6 an unstamped entry never expires",
  endsHaveElapsed(null, { worldTime: 9e9, round: 9999 }) === false,
  "inventing a clock would end somebody's spell at a moment nobody chose");

/* ================================================================== *
 * G. THE GATE
 * ================================================================== */

const cast = read("module", "magic", "cast-workflow.mjs");

/*
 * G1 ASSERTED THE WHOLE LINE, INCLUDING WHERE IT STOPS, and 3.512.0 broke
 * it by adding a FIFTH question — `|| singleCasting`, so that a spell whose
 * only reason to be remembered is "only one of these at a time" is
 * remembered. Nothing about dismissal changed and this check failed anyway.
 *
 * That is the same shape as `A3 NO ANCHOR CARRIES A CLOSING DELIMITER IT
 * DOES NOT CHANGE`, one file over: an assertion on where a GROWING list
 * ends is disarmed — or here, falsely tripped — by the next thing anybody
 * adds to it. `verify-emanation` and `verify-light-shift` already assert
 * the prefix for exactly this reason, and their comments say so. This one
 * now matches them.
 */
/*
 * G1 IS RUN, NOT READ (3.528.0). It asserted the gate's literal text, and
 * the gate has now broken it twice: once at 3.494.0 when it gained a
 * fourth limb, and again at 3.528.0 when the five limbs moved behind
 * `castWillRegister` so the stamp and the registration could not disagree.
 * Both times the RULE was right and the check failed on punctuation.
 * What it cares about is that a dismissible cast gets a registry entry.
 */
ok("G1 A DISMISSIBLE CAST IS REGISTERED",
  castWillRegister({ durationText: "1 minute (D)" }) === true,
  "53 of 56 dismissible spells could not be dismissed");
ok("G1a and it is the (D) doing it, not the minute",
  castWillRegister({ durationText: "1 minute" }) === false);
ok("G1b read off the duration this cast actually got",
  cast.includes("const dismissible = isDismissibleDuration(durationText);"),
  "durationText is the warped one where a warp bought more");
ok("G2 the entry says why it is listed",
  cast.includes("        dismissible,"));

// G3 THE STAMP IS WRITTEN AT THE CAST, from the same parsed duration the
// effects use, rather than from a second reading of the string.
ok("G3 the end is stamped from the parsed duration",
  cast.includes("const parsedForEnd = parseSpellDuration(durationText);")
  && cast.includes("seconds: parsedForEnd?.seconds ?? null,")
  && cast.includes("rounds: parsedForEnd?.rounds ?? null,"));

// G4 THE TWO REFUSALS, both older decisions than this release. A locked
// spell is ended by its lock; a sustained one by its lapse, and stamping
// it would invent the clock emanation-growth.mjs decided not to.
//
// THE SECOND REFUSAL NARROWED AT 3.538.0, and the narrowing is the point
// rather than an incidental rename. The guard used to read the spell's
// PRINTED sustained flag; it now reads `warpedSustained`, the answer
// after warps. A spell warped out of sustaining — Circle Of Warmth
// bought an hour — is no longer sustained, so it DOES take a stamp, and
// should: an unsustained hour is exactly the thing a clock is for, and
// it is parsed from the warped duration text.
//
// The lock refusal is untouched, which keeps the daily-preparations rung
// safe: it locks, so it still gets no stamp, and the two-clocks defect
// 3.476.0 paid for cannot come back through this door.
ok("G4 A LOCKED OR STILL-SUSTAINED SPELL GETS NO STAMP",
  cast.includes("ends: (lock || warpedSustained) ? null : endsStamp({"),
  "two clocks on one thing is the defect 3.476.0 paid for");

// G4b THE GUARD ASKS THE RULE, NOT THE PRINTED FLAG. This file greps
// source — it is on the verify-checks-read-source backlog and says so —
// so the one thing it can check honestly is that the cast path no longer
// consults `spellData.sustained` at the sites the warp now governs.
ok("G4b AND NOTHING IN THE REGISTRATION READS THE PRINTED FLAG ANY MORE",
  !cast.includes("sustained: Boolean(spellData.sustained),")
  && cast.includes("const warpedSustained = sustainAfterWarp(spellData.sustained, warpMods);"),
  "the banner, the panel entry, the stamp and the orphan-sweep predicate have to share "
  + "one answer; a site left on the printed flag is how they come to disagree");

/* ================================================================== *
 * X. IT COMES OFF AGAIN — one sweep, both stamps
 * ================================================================== */

const reg = read("module", "magic", "active-spells.mjs");
const sweep = bodyOf(reg, "export async function sweepActiveSpellExpiry(");

ok("X1 THE SWEEP READS THE ENTRY'S OWN STAMP",
  sweep.includes("endsHaveElapsed(entry?.ends, { worldTime, round })"),
  "without it the panel fills with spells that ended last session");
ok("X1b AND THE EMANATION'S, in one sweep rather than two",
  sweep.includes("|| emanationHasElapsed(entry?.emanation, { worldTime, round })"),
  "a second sweeper is a second thing to remember to call from both clocks");
ok("X2 a duration running out is not a dismissal",
  sweep.includes("await endActiveSpell(actor, entry.id, { dismissed: false });"),
  "Delayed Respite's card says \"released early\" only when somebody chose it");

// X3 BOTH CLOCKS CALL IT. The gap this release closes came from a rule
// wired to one caller and not the other.
const combat = read("module", "documents", "combat.mjs");
const boot = read("scripts", "trg-prime.mjs");
ok("X3 the turn clock sweeps",
  /const faded = await sweepActiveSpellExpiry\(actor, \{/.test(combat),
  "the result is bound, not merely the call present");
ok("X3b and the world clock, for a spell cast in a corridor",
  /sweepActiveSpellExpiry\(actor, \{ worldTime, round:/.test(boot));
// X3c THE WORLD-CLOCK GATE ASKS ABOUT BOTH STAMPS. It read
// `e?.emanation?.ends` alone, which would have skipped every (D) entry
// before the sweep it guards was ever reached.
ok("X3c and its guard looks for either stamp",
  boot.includes('(e) => e?.ends || e?.emanation?.ends'),
  "a widened sweep behind a narrow guard is a widened sweep nobody reaches");

/* ================================================================== *
 * T. THE OPTION TRAVELS
 * ================================================================== */

const eaw = read("module", "combat", "effect-application-workflow.mjs");

/*
 * T1 IS RUN, NOT READ (3.527.0). It used to assert the primitive's exact
 * signature text:
 *
 *   eaw.includes("export async function removeEffectsByCastId(actor, castId,
 *                 { dismissed = true } = {}) {")
 *
 * and 3.527.0 broke it by ADDING a `direct` option — the rule was extended,
 * behaved correctly, and the check failed anyway. That is the failure
 * direction that matters: a source-grep fails when the rule MOVES and
 * passes when the rule is NEUTERED. It is the fifth time this project has
 * recorded that class, and the fix is the same each time — drive the rule
 * on a fixture and assert what it DOES.
 *
 * A FAKE ACTOR IS ENOUGH. The primitive reads `effects`, `items`,
 * `isOwner` and `deleteEmbeddedDocuments`, so the harness can hold one
 * without a world.
 */
function fakeActor(effects = [], items = []) {
  const removed = [];
  return {
    actor: {
      name: "Ally", isOwner: true, effects, items,
      deleteEmbeddedDocuments: async (type, ids) => { removed.push({ type, ids }); }
    },
    removed
  };
}
const eff = (id, castId) => ({ id, getFlag: (_s, k) => (k === "castId" ? castId : undefined) });

{
  const { actor, removed } = fakeActor([eff("e1", "c1"), eff("e2", "c2")]);
  const n = await removeEffectsByCastId(actor, "c1", { dismissed: false });
  ok("T1 THE PRIMITIVE REMOVES THIS CAST'S EFFECTS AND ONLY THIS CAST'S",
    n === 1 && removed[0]?.type === "ActiveEffect"
    && JSON.stringify(removed[0]?.ids) === JSON.stringify(["e1"]),
    `returned ${n}, removed ${JSON.stringify(removed)}`);
}
{
  const { actor, removed } = fakeActor([eff("e1", "c1")]);
  const n = await removeEffectsByCastId(actor, "nope");
  ok("T1b AND REMOVES NOTHING FOR A CAST THAT LEFT NOTHING",
    n === 0 && removed.length === 0,
    `returned ${n}, removed ${JSON.stringify(removed)}`);
}
ok("T1c and it still hands the option to the release",
  eaw.includes("await releaseRespitesByCastId(actor, castId, { dismissed });"),
  "kept as a read: whether a person chose the ending only shows up in a "
  + "Respite's card wording, which needs a live packet to observe");
ok("T2 and the registry passes it down",
  reg.includes("export async function endActiveSpell(actor, id, { dismissed = true } = {}) {")
  && reg.includes("await removeEffectsByCastId(target, id, { dismissed });"));
// T3 THE DEFAULT IS THE PERSON, because a sweep is the caller that knows
// it is not one and can say so.
ok("T3 a caller that says nothing is treated as a dismissal",
  reg.includes("{ dismissed = true } = {}"),
  "the Dismiss action and the Magic tab both call it bare");

/* ================================================================== *
 * P. THE PANEL
 * ================================================================== */

equal("P1 a sustained entry says so", activeSpellState({ sustained: true }), "Sustained");
equal("P1b with its type when it has one",
  activeSpellState({ sustained: true, sustainType: "duration" }), "Sustained (duration)");
equal("P2 a locked one says what locks it",
  activeSpellState({ lock: "dailyPrep" }), "PP locked (dailyPrep)");
// P3 THE ROW THAT USED TO LIE. The template branched two ways, so an
// entry that was neither sustained nor locked printed "PP locked ()".
equal("P3 A DISMISSIBLE ONE SAYS DISMISSIBLE", activeSpellState({ dismissible: true }), "Dismissible");
equal("P3b and an emanation says emanation",
  activeSpellState({ emanation: { radiusFeet: 10 } }), "Emanation");
const hbs = read("templates", "actor", "actor-sheet.hbs");
ok("P4 the template prints the computed string",
  hbs.includes("<span>{{spell.state}}</span>"));
ok("P4b and no longer branches two ways over three cases",
  !hbs.includes("{{else}}PP locked ({{spell.lock}}){{/if}}"),
  "\"PP locked ()\" over a Shield that locks nothing");
ok("P5 the sheet computes it",
  read("module", "sheets", "actor-sheet.mjs").includes("state: activeSpellState(entry)"));

/* ================================================================== *
 * S. WHAT THIS DELIBERATELY LEAVES ALONE
 * ================================================================== */

// A sustained spell's PP is not locked and its lapse is not this
// release's business. These assert the two rules that were true before
// it and must stay true: a merely-dismissible entry locks nothing and is
// invisible to the sustained machinery.
const { lockedPP, hasSustained, sustainedLapses } =
  await import("../module/magic/active-spells.mjs");
const dRow = { id: "x", name: "Shield", pp: 1, lock: null, sustained: false, dismissible: true };
equal("S1 A DISMISSIBLE ENTRY LOCKS NO PP", lockedPP([dRow]), 0,
  "53 spells joining the list must not lock 53 spells' worth of points");
equal("S2 and is not a sustained spell", hasSustained([dRow]), false,
  "PP recovery and rest both ask this");
equal("S3 and never lapses", sustainedLapses(dRow, 99), false);

/* ================================================================== *
 * M. THE MEASUREMENT, asked of the live pack
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let total = 0;
const dSpells = [];
const uncountable = [];
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.type !== "spell") continue;
    total += 1;
    const duration = String(value.system?.duration ?? "");
    if (!isDismissibleDuration(duration)) continue;
    dSpells.push({ name: value.name, duration, sustained: Boolean(value.system?.sustained) });
    if (/^\s*varies/i.test(duration)) uncountable.push(value.name);
  }
} finally {
  await db.close().catch(() => {});
}

ok("M1 the pack is the one this was measured against", total > 600,
  `${total} spells`);
ok("M2 (D) spells exist in numbers", dSpells.length >= 50,
  `${dSpells.length} spells print (D)`);
// M3 THE SPELLS THE GAP ACTUALLY COST. Named, because a count is easy to
// read past and "Shield could not be dismissed" is not.
const named = ["Shield", "Mirror Image", "Levitate", "Antimagic Field", "Delayed Respite"];
const missing = named.filter((n) => !dSpells.some((s) => s.name === n));
ok("M3 the spells the gap cost are all (D)", missing.length === 0,
  `not found as (D): ${missing.join(", ")}`);
// M4 AND MOST OF THEM ARE DISMISSIBLE FOR NO OTHER REASON — which is
// what made the gate's three questions insufficient.
const onlyD = dSpells.filter((s) => !s.sustained && !/daily prep|unlimited/i.test(s.duration));
ok("M4 most (D) spells have no other reason to be registered",
  onlyD.length >= 40,
  `${onlyD.length} of ${dSpells.length} are neither sustained nor PP-locked`);
// M5 THE FEW WITH NO COMPUTABLE END are dismissed by a person and never
// swept, which is honest rather than a gap.
ok("M5 the uncountable ones are few and named",
  uncountable.length <= 4, `varies (D): ${uncountable.join(", ")}`);

if (failures.length) {
  process.stderr.write(`verify-dismissible-spells: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-dismissible-spells: OK — ${checks} checks. ${dSpells.length} spells print (D) and all of `
  + `them now register, wear a clock, and come off the panel when it runs out.\n`);
