#!/usr/bin/env node
/**
 * verify-session-fixes-0829 — the four things Graham's 29 August session
 * turned up, and the shape they share.
 *
 * NEW at 3.433.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE OF THE FOUR ARE THE SAME DEFECT WEARING DIFFERENT CLOTHES: a
 * RECORD that outlived, or failed to outlive, the thing it described.
 *
 *   1. SHARUK-XAL. The grant flags said -3 and +6 — exactly right — and
 *      `pp.base` held 2. The record was correct and the field had lost a
 *      point, and `reconcilePPGrant` opens with `if (granted === due)
 *      return null`, so the flag agreeing with itself meant nothing ever
 *      looked at the field again. Merrick Thorne's Aura of Power recorded
 *      +3 against a base of 0: the whole grant, gone, invisibly.
 *
 *   3. RAGE. How much temporary HP a rage granted was recorded ON THE
 *      RAGE EFFECT. Any path that removed the effect other than `endRage`
 *      took the only record of the debt with it — so Throngar Redtusk sat
 *      on 28 unreclaimable temporary HP with no rage effect at all. Two
 *      previous fixes both made `endRage` more careful and neither moved
 *      the bookkeeping, which is why this was the third report.
 *
 *   2. FLAT-FOOTED. `applyConditionTags` stamped ITS timing onto whatever
 *      effect already carried the status, without asking whether it had
 *      placed it. Chapter 4 Step 4's deliberately untimed Flat-Footed
 *      acquired a countdown belonging to the attack that hit the PC.
 *
 * The fourth is the acting-GM axis again:
 *
 *   4. INJURY DURATIONS. `expireTimedConditions` was asked only about the
 *      combatant whose turn was starting, on the acting GM's client. A
 *      condition on anybody else waited for their own turn — and if
 *      combat ended first, or that client was a testing seat rather than
 *      the one at the table, for ever. Reproduced live: a Stunned stamped
 *      to expire on round 2 was still there at round 3.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { expiryToWrite } from "../module/combat/condition-timing.mjs";
import { effectExpiredLine } from "../module/combat/effect-expiry.mjs";

let checks = 0;
const failures = [];
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const feats = read("module", "feats-workflow.mjs");
const migration = read("module", "migration.mjs");
const rage = read("module", "combat", "rage-workflow.mjs");
const combat = read("module", "documents", "combat.mjs");
const effects = read("module", "combat", "effect-application-workflow.mjs");
const boot = read("scripts", "trg-prime.mjs");

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}
/** One named function's body, so a claim is about it, not the file. */
function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  const rest = src.slice(start + signature.length);
  const end = rest.search(/\n(?:export )?(?:async )?function |\n\/\*\*/);
  return rest.slice(0, end === -1 ? rest.length : end);
}
function before(body, a, b) {
  const clean = stripComments(body);
  const i = clean.indexOf(a);
  const j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * A. WHOSE CLOCK IS IT — the flat-footed defect
 * ================================================================== */

// WE PLACED IT, so the clock is ours.
ok("A1 a condition we applied takes our timing",
  expiryToWrite({ weApplied: true, existing: null, incoming: 5 }) === 5);
// THE ONE THAT BIT GRAHAM. Step 4's Flat-Footed is deliberately untimed;
// a hit that also inflicts Flat-Footed must not put a deadline on it.
ok("A2 an existing UNTIMED condition is not given a clock",
  expiryToWrite({ weApplied: false, existing: null, incoming: 5 }) === null,
  "flat-footed vanished from a PC after they were hit");
// TWO CLOCKS: the later wins, so a second injury extends and can never cut short.
ok("A3 a later expiry extends an earlier one",
  expiryToWrite({ weApplied: false, existing: 3, incoming: 7 }) === 7);
ok("A4 an earlier expiry never shortens a later one",
  expiryToWrite({ weApplied: false, existing: 7, incoming: 3 }) === 7,
  "bleeding for 3 more rounds on top of 1 is four rounds, not one");
ok("A5 no incoming timing writes nothing",
  expiryToWrite({ weApplied: true, existing: 4, incoming: null }) === null);
ok("A6 round zero is a real expiry, not a falsy one",
  expiryToWrite({ weApplied: true, existing: null, incoming: 0 }) === 0,
  "`if (expiresRound)` would drop it; the rule tests for null");

// AND THE RULE IS ASKED AT BOTH BRANCHES, valued and not.
ok("A7 the valued branch asks it",
  (effects.match(/expiryToWrite\(\{/g) ?? []).length === 2,
  `${(effects.match(/expiryToWrite\(\{/g) ?? []).length} call sites — Bleeding and Flat-Footed are different branches`);
ok("A8 and passes whether it created the effect",
  (effects.match(/weApplied: !wasAlreadyPresent/g) ?? []).length === 2);
/*
 * COUNTED AT BOTH BRANCHES (3.581.1). This asked only that
 * `expiresRound: allowed` appear SOMEWHERE and that one particular
 * wrong spelling not appear — so a branch that went back to the raw
 * request in any other spelling passed, on the strength of the other
 * branch still being right. Found by its own mutation surviving after
 * the pages 211-220 work moved the text: the runner put the defect back
 * in the boolean branch and this check did not notice.
 *
 * There are two call sites (A7), so there must be two stamps.
 */
eq("A9 the stamp uses the rule's answer, not the raw request — at both branches",
  (effects.match(/expiresRound: allowed, duration/g) ?? []).length, 2);
ok("A9b and never the raw request",
  !/buildTimingUpdates\(\{ expiresRound, duration/.test(effects)
  && !/expiresRound: timing\.expiresRound, duration/.test(effects),
  "passing the raw expiresRound is the defect");

/* ================================================================== *
 * B. A DEBT MUST OUTLIVE THE THING THAT INCURRED IT — rage
 * ================================================================== */

ok("B1 the granted temporary HP is recorded on the ACTOR",
  /await actor\.setFlag\(SYSTEM_ID, RAGE_TEMP_HP_FLAG, temporaryHP\);/.test(rage),
  "recording it on the effect meant deleting the effect erased the debt");
// SCOPED TO `endRage`, not to the file. `RAGE_TEMP_HP_FLAG` is written in
// `beginRage` hundreds of lines earlier, so a whole-file ordering claim is
// satisfied by that write and says nothing about which one endRage reads
// first. The fifth time an ordering check in this project has been decided
// by text outside the function it was about.
ok("B2 endRage prefers the actor's record",
  before(bodyOf(rage, "export async function endRage(actor, { fatigue = 1 } = {}) {"),
    "actor?.getFlag?.(SYSTEM_ID, RAGE_TEMP_HP_FLAG)",
    "effect?.getFlag?.(SYSTEM_ID, RAGE_FLAG)?.temporaryHP"),
  "the effect's flag is a fallback for a rage begun before 3.433.0");
ok("B3 orphaned temporary HP can be reclaimed",
  /export async function reclaimOrphanedRageTemporaryHP\(actor\)/.test(rage));
// A LIVE RAGE IS NOT AN ORPHAN. Reclaiming from one would strip a raging
// character of the pool they are meant to be fighting with.
ok("B4 a rage still running is left alone",
  /if \(rageEffect\(actor\)\) return 0;/.test(rage));
// ALSO SCOPED. `Math.min(currentTemp, granted)` appears in endRage and
// endRageOnDisable too, so the unscoped test passed while the reclaim's
// own copy was gutted.
ok("B5 it never takes more than is there",
  /const reclaimed = Math\.min\(currentTemp, granted\);/.test(
    bodyOf(rage, "export async function reclaimOrphanedRageTemporaryHP(actor) {")));
ok("B6 and no Fatigue is charged for a rage that ended earlier",
  /NO FATIGUE IS CHARGED/.test(rage));
ok("B7 the record is cleared once settled",
  (rage.match(/await clearRageTempRecord\(actor\);/g) ?? []).length >= 3,
  "endRage, endRageOnDisable and the reclaim all settle the same debt");
// BOTH CLOCKS, like rage's own expiry — one in a fight, one in a corridor.
ok("B8 the turn sweep reclaims orphans",
  /await reclaimOrphanedRageTemporaryHP\(actor\)/.test(combat));
ok("B9 and so does the world clock",
  /reclaimOrphanedRageTemporaryHP/.test(boot));

/* ================================================================== *
 * C. A LEDGER THAT AGREES WITH ITSELF AND NOT WITH THE SHEET
 * ================================================================== */

// THE FUNCTION EXISTING PROVES NOTHING. The first version of this check
// asserted its signature, and a mutation that deleted the line which
// actually REPORTS a shortfall sailed through — the function was still
// declared, still exported, and always returned an empty list.
const shortfallBody = bodyOf(feats, "export function storedDeltaShortfall(actor, grants = PP_GRANTS) {");
ok("C1 the shortfall between record and field is detectable",
  /export function storedDeltaShortfall\(actor, grants = PP_GRANTS\)/.test(feats)
  && /out\.push\(\{ path, recorded, field, short: recorded - field \}\);/.test(shortfallBody),
  "a detector that always answers 'nothing' is worse than none");
// ONLY A SHORTFALL, NEVER A SURPLUS. A field above the record is the
// player's own typed value and is none of this pass's business.
ok("C2 a field at or above the record is left alone",
  /if \(field >= recorded\) continue;/.test(feats),
  "topping down would take a player's own base off them");
// A NET-NEGATIVE RECORD OWES NOTHING — an Orc's -1 per level is not a
// shortfall, and 'repairing' it would hand them points.
ok("C3 a net-negative record is not a shortfall",
  /if \(recorded <= 0\) continue;/.test(feats));
ok("C4 the repair runs as a versioned migration pass",
  /runIf\("3\.433\.0", "grants whose field lost what the record claims"/.test(migration));
ok("C5 which writes the FIELD, not the flag",
  /update\[row\.path\] = row\.recorded;/.test(migration),
  "the record was right all along; the field is what lost the points");
// DOTTED KEYS, per verify-migration-safety and the 26 August incident.
ok("C6 with a dotted key",
  /await actor\.update\(update, \{ diff: false \}\)/.test(migration)
  && !/update\.system =/.test(migration));
ok("C7 and it reports every change it made",
  /Grants restored/.test(migration)
  && /Nothing was lowered/.test(migration),
  "a migration that quietly moves a player's maximum PP is one nobody can check");
// THE SCHEMA VERSION IS THE TRIGGER — the silent failure caught at 3.431.0.
//
// ASKED AS A RULE, NOT AS A NUMBER (3.552.1). This read `schema ===
// "3.435.0"`, which pins the constant to the release this file was
// written in: it then fails the moment the constant legitimately rises,
// and it says "the schema version does not admit this release's pass"
// when the truth is that the CHECK is out of date. That is a check
// crying wolf, and a check that cries wolf is one somebody eventually
// edits to shut up. What it actually cares about is that THIS file's
// pass — the 3.433.0 stored-delta shortfall — is reachable, and that no
// pass anywhere is registered above the trigger.
const schema = /TRG_SCHEMA_VERSION = "([\d.]+)"/.exec(migration)?.[1] ?? "0.0.0";
const atLeast = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return true;
};
ok("C8 the schema version admits this release's pass", atLeast(schema, "3.433.0"), schema);
const registeredPasses = [...migration.matchAll(/runIf\("([\d.]+)",/g)].map((m) => m[1]);
const unreachablePasses = registeredPasses.filter((v) => !atLeast(schema, v));
ok("C8a and no pass at all is registered above it",
  unreachablePasses.length === 0,
  `unreachable: ${unreachablePasses.join(", ")}`);

/* ================================================================== *
 * D. THE EXPIRY SWEEP DOES NOT DEPEND ON WHOSE TURN IT IS
 * ================================================================== */

// REPRODUCED LIVE: a Stunned stamped to expire on round 2 was still
// there at round 3, because the sweep only ever asked about the
// combatant whose turn was starting.
ok("D1 every combatant is swept, not only the current one",
  // THE SHARED SWEEP ITSELF (3.614.0): stasis's turn start loops the
  // combatants too, so the anchor is the loop that keeps the `swept` set.
  /const swept = new Set\(\);\n {4}for \(const other of this\.combatants \?\? \[\]\) \{/.test(combat),
  "a condition on anybody else waited for THEIR turn, or for ever");
ok("D2 each actor is asked once",
  /if \(!subject \|\| swept\.has\(subject\.id\)\) continue;/.test(combat),
  "two combatants can share one actor");
/*
 * D3 WAS A GREP FOR THE SENTENCE'S SOURCE TEXT, and 3.514.0 broke it by
 * moving that sentence — unchanged — into `combat/effect-expiry.mjs` so
 * the world clock could print the same one. Nothing about naming whose
 * condition ended changed, and this check failed anyway.
 *
 * That is the defect class this project has recorded three times: a check
 * that asserts the SOURCE of a rule rather than running it passes when
 * the rule is neutered and fails when it is merely moved. Both halves of
 * that are wrong. It runs the rule now.
 */
ok("D3 THE CARD NAMES WHOSE CONDITION ENDED",
  effectExpiredLine("Stunned", "Toben") === "<strong>Stunned</strong> expires on Toben.",
  effectExpiredLine("Stunned", "Toben"));
ok("D3b and says nothing extra when it is the current combatant's own",
  effectExpiredLine("Stunned", "") === "<strong>Stunned</strong> expires.",
  effectExpiredLine("Stunned", ""));
ok("D4 the sweep still only deletes what is due",
  /if \(Number\(currentRound\) < Number\(expiresRound\)\) continue;/.test(effects),
  "asking about everybody is only safe because it refuses what is not due");

/* ================================================================== */

const label = "verify-session-fixes-0829";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
