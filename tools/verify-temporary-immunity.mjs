#!/usr/bin/env node
/**
 * verify-temporary-immunity — the record, and the gap it does not close.
 *
 * NEW at 3.400.0, built for Guidance.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE POINT OF THIS FILE AS MUCH AS SECTIONS A-C.
 *
 * "Temporarily immune" is printed TWENTY-SIX times in the rulebook and
 * was implemented nowhere: Encourage, Demoralise, Rally, Treat Wounds,
 * Recharge Item and the rest all carried the phrase in a description and
 * relied on somebody at the table remembering it.
 *
 * 3.400.0 built the mechanism and wired exactly ONE — Guidance. A green
 * run of this file must not be mistaken for "the book's immunities are
 * handled", so D names the unwired ones explicitly: the anti-silence rule
 * turned on the harness itself, the same shape as verify-light-sources'
 * NOT_WIRED list.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND AT 3.559.0 THE LIST ITSELF TURNED OUT TO BE WRONG.
 *
 * Auditing pages 81-90 found it naming CALM — "a Diplomacy action,
 * applied to everyone in an emanation" — which is a PP 4 spell that
 * prints no immunity at all. The action meant was RALLY, and Rally was
 * not on the list. A list built so a green run could not lie had been
 * inaccurate for five releases.
 *
 * The four skill actions these pages print are wired now, and D7-D12
 * name them so the gap can no longer be shrunk by deleting a row.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  IMMUNITY_FLAG, ONE_HOUR, immunityKey, isTemporarilyImmune,
  immunityRemaining, withImmunity, prunedImmunities, describeRemaining
} from "../module/temporary-immunity.mjs";
import { MARKERS } from "../module/magic/markers.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. Stamping and asking
 * ================================================================== */

const NOW = 10_000;

{
  const rec = withImmunity({}, "Guidance", ONE_HOUR, NOW);
  ok("A1 stamping makes it immune", isTemporarilyImmune(rec, "guidance", NOW) === true);
  ok("A2 the key is normalised", isTemporarilyImmune(rec, "GUIDANCE", NOW) === true);
  ok("A3 an unrelated key is not immune", isTemporarilyImmune(rec, "calm", NOW) === false);
  ok("A4 an empty key is never immune", isTemporarilyImmune(rec, "", NOW) === false,
    "reachable only because the WRITER refuses to store one — see C6");
  ok("A5 an empty record is never immune", isTemporarilyImmune({}, "guidance", NOW) === false);
  ok("A6 a missing record is never immune", isTemporarilyImmune(undefined, "guidance", NOW) === false);

  ok("A7 still immune a minute before it ends",
    isTemporarilyImmune(rec, "guidance", NOW + ONE_HOUR - 60) === true);
  // A8. THE BOUNDARY, and it is deliberate. An immunity that expires
  // exactly now HAS expired — the alternative blocks a rule for one
  // extra tick at precisely the moment a player has waited it out on
  // purpose.
  ok("A8 not immune at the exact moment it expires",
    isTemporarilyImmune(rec, "guidance", NOW + ONE_HOUR) === false);
  ok("A9 not immune afterwards",
    isTemporarilyImmune(rec, "guidance", NOW + ONE_HOUR + 1) === false);
}

/* ================================================================== *
 * B. How much is left, and what to call it
 * ================================================================== */

{
  const rec = withImmunity({}, "guidance", ONE_HOUR, NOW);
  ok("B1 the full span remains at the moment it is stamped",
    immunityRemaining(rec, "guidance", NOW) === ONE_HOUR);
  ok("B2 it counts down", immunityRemaining(rec, "guidance", NOW + 600) === ONE_HOUR - 600);
  ok("B3 it never goes negative", immunityRemaining(rec, "guidance", NOW + 99_999) === 0);
  ok("B4 an unknown key has nothing left", immunityRemaining(rec, "nothing", NOW) === 0);
}

/*
 * B4a-B4d ADDED at 3.597.0, from the 3.596.0 live drive. Hours were the
 * largest unit because every caller until Scrying measured in hours or
 * less, so a week printed as "168 hours" — correct arithmetic and a
 * terrible way to tell somebody they are safe for a week. MEASURED IN BARE
 * SECONDS, not against the module's own constants, so a wrong week cannot
 * agree with itself.
 */
ok("B4a A WEEK READS AS A WEEK, not as 168 hours",
  describeRemaining(604800) === "1 week", describeRemaining(604800));
ok("B4b two weeks pluralise", describeRemaining(1209600) === "2 weeks");
ok("B4c a day reads as a day, not as 24 hours",
  describeRemaining(86400) === "1 day", describeRemaining(86400));
ok("B4d and six days stay days rather than rounding to a week",
  describeRemaining(6 * 86400) === "6 days", describeRemaining(6 * 86400));
ok("B5 an hour reads as an hour", describeRemaining(ONE_HOUR) === "1 hour");
ok("B6 two hours pluralise", describeRemaining(2 * ONE_HOUR) === "2 hours");
ok("B7 ten minutes reads as minutes", describeRemaining(600) === "10 minutes");
ok("B8 one minute is singular", describeRemaining(60) === "1 minute");
ok("B9 seconds read as seconds", describeRemaining(45) === "45 seconds");
ok("B10 nothing left reads as nothing", describeRemaining(0) === "");
// B11. ROUNDED DOWN TO THE UNIT. A card saying "59 minutes" where the
// rule printed an hour reads as a bug rather than as arithmetic.
ok("B11 just under an hour still reads in minutes",
  describeRemaining(ONE_HOUR - 1) === "59 minutes", describeRemaining(ONE_HOUR - 1));

/* ================================================================== *
 * C. Re-stamping, and not shrinking
 * ================================================================== */

{
  // C1. THE LONGER EXPIRY WINS. Re-applying an immunity already running
  // must not SHORTEN it — invisible while every rule uses the same
  // interval, and wrong the moment two name one key with different ones.
  const long = withImmunity({}, "guidance", ONE_HOUR, NOW);
  const short = withImmunity(long, "guidance", 60, NOW);
  ok("C1 a shorter re-stamp does not cut it short",
    immunityRemaining(short, "guidance", NOW) === ONE_HOUR,
    `${immunityRemaining(short, "guidance", NOW)}`);

  const longer = withImmunity(long, "guidance", 2 * ONE_HOUR, NOW);
  ok("C2 a longer re-stamp extends it",
    immunityRemaining(longer, "guidance", NOW) === 2 * ONE_HOUR);

  // C3. A LATER STAMP OF THE SAME LENGTH DOES extend it, which is the
  // ordinary case: spending Guidance again an hour later.
  const later = withImmunity(long, "guidance", ONE_HOUR, NOW + ONE_HOUR);
  ok("C3 stamping later moves the end later",
    immunityRemaining(later, "guidance", NOW + ONE_HOUR) === ONE_HOUR);
}

{
  // C6. THE WRITER IS WHERE THE EMPTY-KEY INVARIANT LIVES. The reader
  // used to carry a guard of its own and no input could reach it: an
  // empty key never has an entry, so the lookup already answered false.
  // A mutation proved the guard dead, it was removed, and this is what
  // replaced it — a check on the line that can actually be broken.
  const rec = withImmunity({ guidance: NOW + 100 }, "", 60, NOW);
  ok("C6 an empty key is never written", Object.hasOwn(rec, "") === false,
    JSON.stringify(rec));
  ok("C6b and the rest of the record survives", rec.guidance === NOW + 100);
  ok("C6c a whitespace-only key is the same as empty",
    Object.hasOwn(withImmunity({}, "   ", 60, NOW), "") === false);
}

{
  // C4. IT RETURNS A NEW OBJECT. A caller cannot half-write a flag it
  // then fails to save.
  const original = Object.freeze({ guidance: 999 });
  const next = withImmunity(original, "calm", 60, NOW);
  ok("C4 the original record is not mutated", original.calm === undefined);
  ok("C4b and the new one carries both", next.guidance === 999 && next.calm === NOW + 60);
}

{
  const rec = { guidance: NOW + 100, calm: NOW - 100, demoralize: NOW + ONE_HOUR };
  const pruned = prunedImmunities(rec, NOW);
  ok("C5 pruning drops what has expired", pruned.calm === undefined);
  ok("C5b and keeps what has not",
    pruned.guidance === NOW + 100 && pruned.demoralize === NOW + ONE_HOUR);
  ok("C5c pruning changes no answer",
    isTemporarilyImmune(pruned, "guidance", NOW) === isTemporarilyImmune(rec, "guidance", NOW),
    "pruning is housekeeping, not a rule");
}

/* ================================================================== *
 * D. What is wired, and what is only printed
 * ================================================================== */

const declared = Object.entries(MARKERS)
  .filter(([, entry]) => Number(entry.immunitySeconds) > 0)
  .map(([key]) => key);

// D. THE IMMUNITY'S ONE USER, MIGRATED AT 3.411.0.
//
// Guidance carried `immunitySeconds` on a MARKER until four PP 1 spells
// turned out to share its shape and it became the first HELD BONUS.
// These checks moved with it rather than being deleted: the mechanism
// still has exactly one user, and that is still worth knowing.
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let guidance = null;
  const withImmunity = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      for (const effect of value.system?.effects ?? []) {
        if (effect.kind === "heldBonus" && Number(effect.immunitySeconds) > 0) {
          withImmunity.push(value.name);
          if (value.name === "Guidance") guidance = effect;
        }
      }
    }
  } finally { await db.close(); }

  ok("D1 at least one held bonus declares an immunity", withImmunity.length > 0,
    "the mechanism exists for the 26 printed \"temporarily immune\" rules");
  ok("D2 Guidance is one of them", Boolean(guidance), `declared: ${withImmunity.join(", ") || "none"}`);
  ok("D3 Guidance's immunity is the printed hour", Number(guidance?.immunitySeconds) === ONE_HOUR,
    `${guidance?.immunitySeconds} seconds — the spell prints 1 hour`);
  // D4 IS THE BACKLOG, unchanged: 25 other printed instances are unwired.
  ok("D4 only Guidance uses it so far", withImmunity.length === 1,
    `${withImmunity.length}: ${withImmunity.join(", ")} — 25 more are printed and unwired`);
}


/**
 * The rules that print "temporarily immune" and are NOT wired to this
 * mechanism, each with the interval the book gives it.
 *
 * DECLARED SO A GREEN RUN CANNOT LIE. Twenty-six occurrences of the
 * phrase, one of them implemented. Listing the rest here means the gap
 * is a known one rather than an accident of what happened to get built,
 * and D5 fails if one of them quietly acquires a marker without this
 * list being updated to match.
 */
/*
 * REWRITTEN AT 3.559.0, and the rewrite is the point.
 *
 * This list existed so a green run could not be mistaken for "the book's
 * immunities are handled". It was right to exist and wrong in its
 * contents: it named CALM, described as "a Diplomacy action, applied to
 * everyone in an emanation rather than one target". Calm is a PP 4
 * SPELL and prints no immunity at all. The action described is RALLY
 * (page 82), which was not on the list — so the honesty list was itself
 * inaccurate for five releases, which is the failure mode it was built
 * to prevent, one layer up.
 *
 * Four of the six are wired now (see ACTION_IMMUNITIES). What is left
 * is what the record cannot yet express, and each says which problem it
 * has rather than merely that it has one.
 */
const PRINTED_NOT_WIRED = Object.freeze({
  treatWoundsFumble: "Treat Wounds' Fumble — 'immune to your attempts to treat wounds until "
    + "your next daily preparation'. An EVENT, not a span: this record holds expiry "
    + "timestamps and a daily preparation has no timestamp until it happens.",
  coerceFumble: "Coerce's Fumble — 'immune to further attempts by you to Intimidate them for "
    + "at least 1 week'. A span, but gated on one degree and scoped to the SKILL rather than "
    + "the action, so neither the stamp site nor the key shape fits.",
  painToleranceFumble: "Pain Tolerance's Fumble — 'immune to this check for 1 hour'. Also "
    + "degree-gated, and it lands on the performer rather than a target, which is the one "
    + "direction the action gate does not currently look.",
  rechargeItem: "Recharge Item — 'temporarily immune until your next daily preparation'. Not "
    + "a span at all but an event, the same shape as Treat Wounds' Fumble above."
});

for (const [key, reason] of Object.entries(PRINTED_NOT_WIRED)) {
  ok(`D4 the unwired rule "${key}" says why`, reason.length > 40);
  ok(`D5 "${key}" has not quietly been wired without this list being updated`,
    !declared.includes(key),
    "it now declares an immunity — remove it from PRINTED_NOT_WIRED");
}

// D6. AND THE COUNT IS NAMED. If somebody wires three more and forgets
// to shrink this list, the numbers stop agreeing with the prose above.
ok("D6 the declared gap is four rules", Object.keys(PRINTED_NOT_WIRED).length === 4,
  "update the file's own header if this changes");
// AND THE FOUR THAT WERE WIRED ARE NAMED, so shrinking the gap list
// cannot be done by deleting rows. Each of these must now BE wired.
{
  const { ACTION_IMMUNITIES, actionImmunityKey } = await import("../module/temporary-immunity.mjs");
  ok("D7 the four skill actions the 3.8 book prints an immunity for are wired",
    ["encourage", "demoralise", "rally", "treatWounds"]
      .every((key) => ACTION_IMMUNITIES[key]?.seconds > 0),
    "Encourage and Rally an hour, Demoralise ten minutes, Treat Wounds an hour");
  ok("D8 Demoralise's is ten minutes, not an assumed hour",
    ACTION_IMMUNITIES.demoralise.seconds === 600,
    "the mechanism takes a span for exactly this reason");
  // "IMMUNE TO YOUR ATTEMPTS" — a second bard may still encourage the
  // same ally in the same hour, which a bare action key would forbid.
  ok("D9 the performer is part of the key where the book names one",
    actionImmunityKey("encourage", "Actor.A") !== actionImmunityKey("encourage", "Actor.B"),
    "'immune to YOUR attempts to encourage'");
  ok("D10 and not where it does not",
    actionImmunityKey("treatWounds", "Actor.A") === actionImmunityKey("treatWounds", "Actor.B"),
    "'temporarily immune to Treat Wounds actions' names no performer");
  ok("D11 an action that prints no immunity gets no key",
    actionImmunityKey("tumble", "Actor.A") === "");
  // D11b. A DOT-FREE KEY, and this one was a live defect, not a
  // precaution. Foundry's setFlag reads a dot as a PATH, so an actor
  // uuid turned "demoralise:actor.cllkeanjovpi6q0j" into a nested object
  // on the way in while every read asked for the flat key — the write
  // appeared to work, the card announced the immunity, and the creature
  // was immune to nothing. `attitude.mjs` met the same door at 3.408.0
  // and its M5 has guarded it since; this is that guard, one module on.
  ok("D11b the key carries no dot, whatever the uuid looked like",
    !actionImmunityKey("demoralise", "Actor.CLlkeanjOvPI6Q0J").includes("."),
    "setFlag would nest it and every read would miss");
  ok("D11c and two performers still key apart once the dots are gone",
    actionImmunityKey("demoralise", "Actor.AAA") !== actionImmunityKey("demoralise", "Actor.BBB"),
    "replacing dots must not collapse the uuids into one");
  ok("D12 Calm is not among them", !ACTION_IMMUNITIES.calm,
    "it is a PP 4 spell and prints no immunity; the rule meant was Rally");
  // D13. REGARDLESS OF YOUR RESULT — found by driving it, not by reading
  // it. The stamp's first version sat inside the outcome block, and
  // Demoralise prints text for a Critical and a Success only: a FAILED
  // Demoralise matched no outcome, so nothing was stamped and the target
  // could be shouted at again immediately. Page 84 is explicit, and the
  // other three are unconditional in the same way.
  {
    const src = fs.readFileSync(
      path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
    const stamp = src.indexOf("if (targetActor && rawDegree && ACTION_IMMUNITIES[action.key] && !ignoreActionImmunity)");
    const degreeBlock = src.indexOf("\n  if (degree) {");
    ok("D13 the immunity is stamped whatever the degree, not only on a matched outcome",
      stamp > 0 && degreeBlock > 0 && stamp < degreeBlock,
      "page 84: 'Regardless of your result, the target is temporarily immune'");
  }
}

/* ================================================================== *
 * E. The flag has one name
 * ================================================================== */

ok("E1 the flag name is a constant", typeof IMMUNITY_FLAG === "string" && IMMUNITY_FLAG.length > 0);
ok("E2 immunityKey normalises", immunityKey("  Treat Wounds  ") === "treat wounds");
ok("E3 immunityKey of nothing is empty", immunityKey(undefined) === "");

// E4. THE READER AND THE WRITER USE ONE FLAG NAME. Both sides import
// IMMUNITY_FLAG rather than spelling it — the lesson the marker flag
// taught at 3.395.0, when a mutation renamed one end and 59 checks
// stayed green.
const sources = ["module/magic/markers.mjs", "module/magic/spell-effects.mjs"];
for (const rel of sources) {
  const file = path.join(SYSTEM_ROOT, rel);
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  ok(`E4 ${rel} reads the flag name from the constant`,
    text.includes("IMMUNITY_FLAG"),
    "spelling the flag by hand is how the two ends drift apart");
  ok(`E4b ${rel} does not spell the flag literally`,
    !text.includes('"temporaryImmunity"'),
    "a literal here is a second author for the name");
}

/* ================================================================== */

process.stdout.write(`verify-temporary-immunity: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
