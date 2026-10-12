/**
 * verify-chapter7-critical-211-220 — how long a critical row's
 * conditions actually last, and the instructions its rows give
 * (pages 211-220).
 *
 * NEW at 3.581.1, for the pages 211-220 audit. Ten defects, four more
 * found by measuring while implementing, and Graham's rulings of
 * 21 September 2026 (R1-R5 as ruled, R6-R11 as recommended):
 *
 *   A  "until the end of THEIR next turn" (D1; R1)
 *   B  which conditions a duration clause governs (D1; R1)
 *   C  "until the bleeding stops" (D2; R2)
 *   D  a condition named as the price of a failed save (D3; R11)
 *   E  words that are conditions in the registry and English in the book
 *   F  the rows that sequence one condition behind another
 *   G  a real-world span (D10; R10)
 *   H  the six instructions (D4-D9; R4-R9)
 *   I  the stamping, end to end
 *   J  the wiring, asked of the other side of every boundary
 *   K  the live defects of this block, 3.581.0 → 3.581.1
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one
 * of Graham's rulings, never from the module under test.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION J IS THE POINT OF THIS FILE, and it is written the way it is
 * because of what blocks 19 and 20 cost. Seven live defects across five
 * releases, and every one was a NAME BELIEVED INSTEAD OF MEASURED — a
 * collection, two uuids, a data path, a module, a card branch, a degree
 * field. None was visible to a source pattern: a wrong data path reads
 * `undefined` and parses, a dynamic import of the wrong module parses, a
 * note on the wrong branch parses.
 *
 * So where this block's code reaches outside its own file, the check
 * asks the OTHER side: it resolves every named dynamic import and asks
 * the target file whether it really exports that name, and it asks the
 * registry and the ladder rather than a list of strings written here.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  conditionMentions, conditionalSpans, extractConditionTags, extractConditionalConditions,
  extractTextDuration, resolveEffectiveConditions, stripConditionalClauses, NEXT_TURN_DURATION
} from "../module/effect-parser.mjs";
import {
  conditionKeyForWord, durationAfter, durationClauses, followOnClauses,
  scopedConditionDurations, withoutFollowOns, MINUTE_ROUNDS, UNIT_SECONDS
} from "../module/combat/critical-durations.mjs";
import {
  apFlatCheckEscape, apSpendWatch, castingLockout, concentrationRequirement,
  criticalRowRiders, powerPointDrain, saveRider
} from "../module/combat/critical-riders.mjs";
import { SELF_TIMED_CONDITION_IDS } from "../module/injuries.mjs";
import { apSpendWatchOn, AP_WATCH_FLAG } from "../module/combat/critical-ap-watch.mjs";
import { castingRestrictionsOn, CASTING_RESTRICTION_FLAG } from "../module/magic/casting-restriction-workflow.mjs";
import { injuryDurationFormula } from "../module/combat/attack.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { CRITICAL_TABLES } from "../module/data/critical-tables.mjs";
import { FUMBLE_TABLES } from "../module/data/fumble-tables.mjs";

let failures = 0;
let checks = 0;
function ok(label, condition, why = "") {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${why ? ` — ${why}` : ""}`);
}
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
// Comments are stripped before a source pattern is looked for, so a
// sentence ABOUT the code cannot pass for the code.
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

const rowOf = (table, n) => CRITICAL_TABLES[table].find((r) => n >= r.min && n <= r.max);
const BARE = { armoured: false, rigid: false, metal: false };
const durationOf = (table, n, key) =>
  (scopedConditionDurations(rowOf(table, n).effect).find((t) => t.key === key) ?? {}).duration ?? null;

/* ================================================================== */
/* A — "UNTIL THE END OF THEIR NEXT TURN" (D1; R1 "Yes")              */
/* ================================================================== */

// The pattern accepted only "your", which is the FUMBLE tables' wording.
// The critical tables speak about the target and say "their".
ok("A1 their next turn is a next turn",
  extractTextDuration("Target is Stunned 2 and Injured 2 until the end of their next turn.").autoExpires);
ok("A2 your next turn still is",
  extractTextDuration("You are Flat-Footed until the end of your next turn.").autoExpires);
ok("A3 and the beginning of one",
  extractTextDuration("No reactions until beginning of next turn.").autoExpires);
eq("A4 one round, not two",
  extractTextDuration("Injured 2 until the end of their next turn."),
  { autoExpires: true, rounds: 1 });
eq("A5 a row with no stated duration says so",
  extractTextDuration("Target is Stunned 2."), { autoExpires: false, rounds: null });

/*
 * THE NINETEEN ROWS, COUNTED FROM THE TABLES THEMSELVES rather than
 * listed here. A hand-written list of row numbers beside generated data
 * is a second copy of the book, free to fall out of step with the first
 * — the same argument critical-riders.mjs makes for reading riders from
 * the text.
 */
{
  const rows = [];
  for (const [table, list] of Object.entries(CRITICAL_TABLES)) {
    for (const row of list) {
      if (NEXT_TURN_DURATION.test(row.effect)) rows.push(`${table} ${row.min}`);
    }
  }
  eq("A6 nineteen critical rows state a one-round duration", rows.length, 19);

  const timed = rows.filter((entry) => {
    const [table, min] = entry.split(" ");
    return scopedConditionDurations(rowOf(table, Number(min)).effect)
      .some((tag) => tag.duration?.kind === "rounds" && tag.duration.rounds === 1);
  });
  // Eighteen, not nineteen: Aligned 57's clause governs "cannot use
  // verbal components", which is not a condition at all — it is the
  // casting lockout of section H.
  eq("A7 eighteen of them put a CONDITION on that clock", timed.length, 18);
  ok("A8 and the nineteenth is Aligned 57, whose clause governs a lockout",
    !timed.includes("aligned 57") && castingLockout(rowOf("aligned", 57).effect)?.scope === "verbal");
}

/* ================================================================== */
/* B — WHICH CONDITIONS A CLAUSE GOVERNS (D1; R1)                     */
/* ================================================================== */

/*
 * Three rows defeat any rule that treats a duration as belonging to the
 * whole row. All three are transcribed from the printed page.
 */

// Bludgeoning 39: "Target is Stunned 1. They are also Flat-Footed until
// the end of their next turn." — a different SENTENCE.
eq("B1 the Flat-Footed is on the clock", durationOf("bludgeoning", 39, "flatFooted")?.rounds, 1);
eq("B2 the Stunned in the sentence before is not", durationOf("bludgeoning", 39, "stunned"), null);

// Aligned 57: "…until the end of their next turn AND ARE STUNNED 2." —
// the Stunned comes AFTER the clause.
eq("B3 a condition after the clause is not governed", durationOf("aligned", 57, "stunned"), null);

// Aligned 64: "-5 penalty to speed FOR 1 MINUTE and is Immobilized
// UNTIL THE END OF THEIR NEXT TURN." — two durations, one sentence.
eq("B4 the nearer clause wins", durationOf("aligned", 64, "immobilised")?.rounds, 1);
/*
 * B4b IS A PROPERTY THE BOOK DOES NOT YET EXERCISE. Aligned 64 is the
 * only row with two durations in one sentence, and the thing its first
 * clause governs — a speed penalty — is not a condition, so the rule
 * "each clause governs only what precedes it" cannot be seen through
 * that row alone. Asserted here on a constructed sentence so that it
 * stays true for the row the book writes next.
 */
{
  const two = "Target is Blinded for 1 minute and is Stunned 2 until the end of their next turn.";
  const scoped = new Map(scopedConditionDurations(two).map((t) => [t.key, t.duration]));
  eq("B4b two clauses, one sentence, each governing its own side",
    [scoped.get("blinded")?.rounds, scoped.get("stunned")?.rounds], [MINUTE_ROUNDS, 1]);
}

// Bludgeoning 47: both conditions are inside the clause.
eq("B5 both conditions in one clause", [
  durationOf("bludgeoning", 47, "stunned")?.rounds,
  durationOf("bludgeoning", 47, "injured")?.rounds
], [1, 1]);

/*
 * BLEEDING, RECURRING DAMAGE AND SICKENED KEEP THEIR OWN CLOCKS, and it
 * is the BOOK's carve-out: Chapter 7's note on the Persistence column
 * excuses exactly these three, and `injuries.mjs` has honoured it since
 * block 19's D9. Asked of that list rather than of three strings copied
 * here, so a fourth added there is a fourth here.
 */
eq("B6 the carve-out is the one injuries.mjs already holds",
  Array.from(SELF_TIMED_CONDITION_IDS).sort(), ["bleeding", "recurring", "sickened"]);
for (const [table, n, key] of [["piercing", 69, "bleeding"], ["bludgeoning", 69, "sickened"],
  ["acid", 71, "recurring"], ["essence", 59, "recurring"]]) {
  eq(`B7 ${table} ${n}: the ${key} keeps its own clock`, durationOf(table, n, key), null);
}
// …and the condition beside it on the same row does NOT keep its own.
eq("B8 piercing 69's Flat-Footed is still timed", durationOf("piercing", 69, "flatFooted")?.rounds, 1);

/* ================================================================== */
/* C — "UNTIL THE BLEEDING STOPS" (D2; R2 "Yes")                      */
/* ================================================================== */

// Four spellings across the rows that use it, all transcribed.
for (const [text, to] of [
  ["Bleeding 3 & Injured 1 until the bleeding stops.", "bleeding"],
  ["Bleeding 2 & -10-speed penalty until the bleeding ends.", "bleeding"],
  ["Bleeding 1 & Weakened 2 until bleed ends.", "bleeding"],
  ["Recurring 4 & Immobilized until the damage ends.", "recurring"],
  ["Recurring 3 & Slowed 1 until recurring ends.", "recurring"],
  ["Recurring 2 & Injured 1 until the recurring damage stops.", "recurring"]
]) {
  const clause = durationClauses(text).find((c) => c.duration.kind === "linked");
  eq(`C1 "${text.slice(text.indexOf("until"))}" waits for ${to}`, clause?.duration?.to, to);
}

// Subdual 90, the one this defect cost most: an Unconscious meant to
// last as long as a bleed.
eq("C2 subdual 90's Unconscious waits for the bleeding",
  durationOf("subdual", 90, "unconscious"), {
    kind: "linked", rounds: null, seconds: null, formula: null, unit: null, to: "bleeding",
    label: "until the bleed ends"
  });

{
  // Counted from the tables, including the one armour clause that
  // carries a link of its own (Slashing 51's rigid clause).
  let rows = 0, clauses = 0;
  for (const list of Object.values(CRITICAL_TABLES)) {
    for (const row of list) {
      if (durationClauses(row.effect).some((c) => c.duration.kind === "linked")) rows++;
      for (const clause of row.armourClauses ?? []) {
        if (durationClauses(clause.text).some((c) => c.duration.kind === "linked")) clauses++;
      }
    }
  }
  /*
   * THIRTY-ONE, AND THE AUDIT SAID TWENTY-FIVE. The audit's scan looked
   * for "until the bleeding/damage/recurring stops", and the book also
   * writes "until the RECURRING DAMAGE stops" and "until recurring
   * damage ends" — seven more rows, plus the one I had miscounted as a
   * row rather than an armour clause. Counted here from the tables by
   * the module that has to answer them, so the figure cannot drift from
   * the data again.
   */
  /*
   * THIRTY-TWO AT 3.582.0. Widening the pattern for the fumble tables'
   * "until the bleed DAMAGE stops" (the pages 221-230 audit's D2) turned
   * up a THIRTY-SECOND critical row written the same way: Mental 70,
   * "Recurring 1 & Controlled by you until the bleed damage ends" — a
   * Controlled that was permanent, on the critical side, missed by the
   * pattern this file was written to pin.
   */
  eq("C3 thirty-two rows tie a condition to another ending", rows, 32);
  eq("C4 and one armour clause does too", clauses, 1);
}

/* ================================================================== */
/* D — A CONDITION AS THE PRICE OF A FAILED SAVE (D3; R11)            */
/* ================================================================== */

// Sonic 90, transcribed: "the target appears to be untouched by your
// attack…for now. Each time the target spends more than 1 AP in a round
// they must make a DC 5 flat check or fall unconscious for 1 minute."
{
  const sonic = rowOf("sonic", 90).effect;
  eq("D1 THE DEFECT: nothing is applied up front",
    extractConditionTags(sonic).map((t) => t.key), []);
  eq("D2 and the threatened condition is handed on instead",
    extractConditionalConditions(sonic).map((t) => t.key), ["unconscious"]);
}

// Acid 31, transcribed: "Target must make a Reflex save to avoid
// dropping item and is Injured 1." The Injured is NOT conditional.
eq("D3 the row goes on after the clause",
  extractConditionTags(rowOf("acid", 31).effect).map((t) => t.key), ["injured"]);

// Acid 67, transcribed: "…must make a Fortitude save or be Sickened 1."
eq("D4 an adjacent creature's price is not the target's condition",
  extractConditionalConditions(rowOf("acid", 67).effect).map((t) => t.key), ["sickened"]);

/*
 * THE MARKER ALONE IS NOT ENOUGH — a save or check must be named before
 * it in the same sentence. These six are the book's own prose, and none
 * of them is conditional.
 */
for (const text of [
  "Your weapon comes down hard upon targets back as they attempt to avoid your attack. Target is Stunned 2.",
  "Attack is very close to striking a vital area. Target stumbles back to avoid. Target is pushed back 5' and Flat-Footed.",
  "Target turns to avoid the attack, the acid sprays across their back making them scream. Target is Sickened 1.",
  "Attack drives hard into targets lower back as they twist to avoid it. Target is Injured 2.",
  "Target twists to avoid the attack and the acid tears into their side. Target is Injured 2.",
  "Target leaps to avoid your strike and takes the blow between the legs. Target is prone and dies from shock."
]) {
  eq(`D5 flavour is not a consequence: "${text.slice(0, 34)}…"`, conditionalSpans(text), []);
}

// THE SPAN IS BLANKED, NOT DELETED, so critical-durations.mjs can
// segment the same string by the same indices.
{
  const sonic = rowOf("sonic", 90).effect;
  eq("D6 the stripped text is the same length", stripConditionalClauses(sonic).length, sonic.length);
  ok("D7 and everything outside the span is untouched",
    stripConditionalClauses(sonic).slice(0, conditionalSpans(sonic)[0].start)
      === sonic.slice(0, conditionalSpans(sonic)[0].start));
}

// ONE ROW CHANGES ACROSS EVERY TABLE, measured — this is the claim the
// rule was written on, so the check makes it rather than trusting it.
{
  const leaked = [];
  for (const [name, src] of [["crit", CRITICAL_TABLES], ["fumble", FUMBLE_TABLES]]) {
    for (const [table, list] of Object.entries(src)) {
      for (const row of list) {
        for (const text of [row.effect, ...(row.armourClauses ?? []).map((c) => c.text)]) {
          if (conditionalSpans(text).length && extractConditionalConditions(text).length) {
            leaked.push(`${name}/${table}/${row.min}`);
          }
        }
      }
    }
  }
  eq("D8 exactly two rows name a condition inside a consequence clause",
    leaked.sort(), ["crit/acid/67", "crit/sonic/90"]);
}

/* ================================================================== */
/* E — CONDITIONS IN THE REGISTRY, ENGLISH IN THE BOOK                */
/* ================================================================== */

/*
 * Four leaks, all found by dumping what the extractor produces for all
 * 873 table texts rather than by reading it. The Dead one is the
 * serious one: Subdual 31-32 is a light hit that killed whoever it
 * landed on, outright, every time.
 */
eq("E1 THE DEFECT: 'a dead arm' does not kill",
  extractConditionTags(rowOf("subdual", 31).effect).map((t) => t.key), ["injured"]);
eq("E2 'broken breath' does not break anybody",
  extractConditionTags(rowOf("bludgeoning", 47).effect).map((t) => t.key).includes("broken"), false);
eq("E3 nor does a broken weapon",
  extractConditionTags("Weapon is broken and you are Stunned 2.").map((t) => t.key), ["stunned"]);
ok("E4 but the book naming the condition still does",
  extractConditionTags("it gains the Broken condition (GM discretion).").some((t) => t.key === "broken"));
eq("E5 'does not go unnoticed' is not Unnoticed",
  extractConditionTags("Your attempt to do a star jump does not go unnoticed.").map((t) => t.key), []);
ok("E6 and a real death still reads as one",
  extractConditionTags("Your attack penetrates the targets lungs and heart. Target is dead.")
    .some((t) => t.key === "dead"));
// A VALUED CONDITION CARRIES ITS OWN PROOF — it was matched beside a
// number, which ordinary prose does not do — so the literalness rules
// are asked only of the boolean ones. A determiner and a noun around
// "Bleeding 3" must not suppress it.
eq("E6b a number is its own proof",
  extractConditionTags("The strike opens a Bleeding 3 wound.").map((t) => `${t.key}:${t.value}`),
  ["bleeding:3"]);

// "Immobilized" is a spelling, not a different condition. Three rows.
ok("E7 Immobilized resolves", extractConditionTags("Target is Immobilized.").some((t) => t.key === "immobilised"));
ok("E8 Immobilised still does", extractConditionTags("Target is Immobilised.").some((t) => t.key === "immobilised"));
{
  const rows = [];
  for (const [table, list] of Object.entries(CRITICAL_TABLES)) {
    for (const row of list) {
      if (/\bImmobilized\b/.test(row.effect)) rows.push(`${table} ${row.min}`);
    }
  }
  eq("E9 three rows use the American spelling", rows.length, 3);
  for (const entry of rows) {
    const [table, min] = entry.split(" ");
    ok(`E10 ${entry} applies it`,
      extractConditionTags(rowOf(table, Number(min)).effect).some((t) => t.key === "immobilised"));
  }
}

// The mentions carry positions, which is what the scoping is built on.
{
  const mentions = conditionMentions("Target is Stunned 1. They are also Flat-Footed until the end of their next turn.");
  // "Stunned 1" matches both the label and the book's own "stun" alias,
  // so a condition can be mentioned more than once; the de-duplication
  // is `extractConditionTags`'s job, not this one's.
  eq("E11 mentions are ordered by position",
    mentions.map((m) => m.key).filter((k, i, a) => a.indexOf(k) === i), ["stunned", "flatFooted"]);
  ok("E12 and carry where they were said", mentions.every((m) => Number.isInteger(m.index) && m.length > 0));
}

/* ================================================================== */
/* F — ONE CONDITION BEHIND ANOTHER                                    */
/* ================================================================== */

// Mental 60, transcribed: "Target is Controlled by you until the end of
// their next turn and then Injured 1 when the control ends."
{
  const clauses = followOnClauses(rowOf("mental", 60).effect);
  eq("F1 the Injured waits for the Controlled", clauses.map((c) => [c.after, c.tags.map((t) => t.key)]),
    [["controlled", ["injured"]]]);
  eq("F2 and the Controlled is still on its own clock",
    durationOf("mental", 60, "controlled")?.rounds, 1);
}

// Mental 64, transcribed: "When the Fleeing ends, target is Confused."
eq("F3 a whole sentence can be the successor",
  followOnClauses(rowOf("mental", 64).effect).map((c) => [c.after, c.tags.map((t) => t.key)]),
  [["fleeing", ["confused"]]]);

// Poison 60, transcribed: "Target Blinded and then Dazzled for 1 minute
// thereafter."
{
  const clauses = followOnClauses(rowOf("poison", 60).effect);
  eq("F4 the Dazzled waits for the Blinded", clauses.map((c) => [c.after, c.tags.map((t) => t.key)]),
    [["blinded", ["dazzled"]]]);
  eq("F5 and carries the minute, which is the Dazzled's and not the Blinded's",
    clauses[0].duration?.rounds, MINUTE_ROUNDS);
  eq("F6 so the Blinded has no duration of its own", durationOf("poison", 60, "blinded"), null);
}

// Electricity 60, transcribed: "Target is Immobilised and then falls
// prone." Both land at once — the "and then" narrates a fall, it does
// not defer one. Without the deferral guard this was a fourth clause.
eq("F7 'and then falls prone' is not a successor",
  followOnClauses(rowOf("electricity", 60).effect), []);

eq("F8 three rows in fourteen tables sequence their conditions",
  Object.values(CRITICAL_TABLES).flat().filter((r) => followOnClauses(r.effect).length).length, 3);

// A deferred condition is not also applied now.
eq("F9 the successor is held back",
  withoutFollowOns(
    resolveEffectiveConditions(rowOf("poison", 60), BARE),
    followOnClauses(rowOf("poison", 60).effect)
  ).map((t) => t.key), ["blinded"]);

// "when the control ends" is the Controlled condition; the book
// conjugates these words and a registry does not.
eq("F10 a stem names its condition", conditionKeyForWord("control"), "controlled");
eq("F11 and so does the book's word for a bleed", conditionKeyForWord("bleed"), "bleeding");
eq("F12 an unknown word names nothing", conditionKeyForWord("weather"), null);

/* ================================================================== */
/* G — A REAL-WORLD SPAN (D10; R10)                                    */
/* ================================================================== */

eq("G1 a minute is ten rounds", MINUTE_ROUNDS, 10);
eq("G2 and sixty seconds", UNIT_SECONDS.minute, 60);
eq("G3 an hour is 3600", UNIT_SECONDS.hour, 3600);

// Subdual 96, transcribed: "Target becomes Unconscious and cannot be
// revived for 1d4 hours."
eq("G4 a formula is handed on, not averaged", durationOf("subdual", 96, "unconscious"), {
  kind: "time", rounds: null, seconds: null, formula: "1d4", unit: "hour", to: null,
  label: "for 1d4 hours"
});
// Acid 96, transcribed: "Target becomes Unconscious for 1d6 hours."
eq("G5 and the other one too", durationOf("acid", 96, "unconscious")?.formula, "1d6");
// Aligned 64, transcribed: "-5 penalty to speed for 1 minute".
{
  const clause = durationClauses(rowOf("aligned", 64).effect).find((c) => c.duration.unit === "minute");
  eq("G6 a fixed minute resolves here", [clause.duration.rounds, clause.duration.seconds], [10, 60]);
}
eq("G7 five rows state a span",
  Object.values(CRITICAL_TABLES).flat()
    .filter((r) => durationClauses(r.effect).some((c) => c.duration.unit)).length, 5);

/* ================================================================== */
/* H — THE SIX INSTRUCTIONS (D4-D9; R4-R9)                             */
/* ================================================================== */

// D4 — Aligned 19, transcribed: "Drained of 2 PP."
eq("H1 the PP drain is read", powerPointDrain(rowOf("aligned", 19).effect), 2);
eq("H2 and is not the Soul Drain condition",
  extractConditionTags(rowOf("aligned", 19).effect).some((t) => t.key === "soulDrain"), false);
eq("H3 no other row drains PP",
  Object.values(CRITICAL_TABLES).flat().filter((r) => powerPointDrain(r.effect)).length, 1);

// D5 — Force 96, transcribed: "cannot cast spells for (D)."
{
  const lockout = castingLockout(rowOf("force", 96).effect);
  eq("H4 the lockout is total", lockout?.scope, "spells");
  eq("H5 and the scoped duration is read off the clause", lockout?.persistence, "D");
}
// Aligned 57, transcribed: "Target cannot use verbal components until
// the end of their next turn".
{
  const lockout = castingLockout(rowOf("aligned", 57).effect);
  eq("H6 the verbal lockout is narrower", lockout?.scope, "verbal");
  eq("H7 and its duration is the clause that follows it",
    durationAfter(rowOf("aligned", 57).effect, lockout.index)?.rounds, 1);
}
// Slashing 70, transcribed: "cannot speak until the bleeding ends."
eq("H8 a lockout can wait on a bleed",
  durationAfter(rowOf("slashing", 70).effect,
    castingLockout(rowOf("slashing", 70).effect).index)?.to, "bleeding");

// D6 — Force 39, transcribed: "Spellcasting requires a Spell
// Concentration success next round."
eq("H9 the concentration demand is one round",
  concentrationRequirement(rowOf("force", 39).effect), { rounds: 1 });
eq("H10 and no other row makes it",
  Object.values(CRITICAL_TABLES).flat().filter((r) => concentrationRequirement(r.effect)).length, 1);

// D7 — Cold 90, transcribed: "may spend 3 AP each round trying to
// remove the Ice. This is a DC 15 flat check."
eq("H11 the escape is read across two sentences",
  apFlatCheckEscape(rowOf("cold", 90).effect), { ap: 3, action: "remove the Ice", dc: 15 });

// D8 — Cold 51, transcribed: "must make a Fortitude Save (1 AP) to
// break the ice."
eq("H12 THE DEFECT: the price is lifted out of the clause",
  saveRider(rowOf("cold", 51).effect),
  { save: "fortitude", scope: "target", ap: 1, avoids: "", achieves: "break the ice" });
// …and "to avoid X" still reads as avoiding.
eq("H13 an avoiding save still avoids", saveRider(rowOf("acid", 31).effect).achieves, "");

// D9 — Sonic 90, transcribed: "Each time the target spends more than
// 1 AP in a round they must make a DC 5 flat check".
eq("H14 the watch is read", apSpendWatch(rowOf("sonic", 90).effect), { threshold: 1, dc: 5 });
eq("H15 and only one row asks for it",
  Object.values(CRITICAL_TABLES).flat().filter((r) => apSpendWatch(r.effect)).length, 1);

// A row with none of them answers "nothing" to every one.
eq("H16 a quiet row is quiet", (() => {
  const r = criticalRowRiders(rowOf("bludgeoning", 11));
  return [r.escape, r.apWatch, r.ppDrain, r.lockout, r.concentration];
})(), [null, null, 0, null, null]);

/* ================================================================== */
/* I — THE STAMPING, END TO END                                        */
/* ================================================================== */

/*
 * Driven against stubs rather than a live world, so a check can run in
 * a second — but driven, not pattern-matched, wherever the rule is
 * expressible without Foundry. The three that are not (a button, a
 * hook's registration, an ordering inside a workflow) are asked of the
 * source, and every one of those is also a mutation in the pair.
 */
const { stampRowDurations, sweepLinkedConditions, sweepWorldTimeConditions } =
  await import("../module/combat/linked-conditions-workflow.mjs");
const { applyConditionTags } = await import("../module/combat/effect-application-workflow.mjs");
const { castingRefusal } = await import("../module/magic/casting-restriction-workflow.mjs");

globalThis.game = globalThis.game ?? { combat: { round: 4 }, time: { worldTime: 1000 } };
globalThis.Roll = globalThis.Roll ?? class {
  constructor(formula) { this.formula = formula; }
  async evaluate() { this.total = 3; return this; }
};

// A tag may bring its own clock, and the call-level one is only a
// default behind it.
{
  const stamped = [];
  const actor = {
    hasCondition: () => false,
    isImmuneToCondition: () => false,
    effects: [],
    async toggleStatusEffect(key) {
      const effect = {
        statuses: new Set([key]),
        getFlag: () => null,
        async update(updates) { stamped.push({ key, updates }); }
      };
      this.effects = [effect];
      return effect;
    }
  };
  await applyConditionTags(actor, [{ key: "prone", label: "Prone", value: null, expiresRound: 9 }], { expiresRound: 2 });
  eq("I1 a tag's own clock beats the call's",
    stamped[0]?.updates?.["flags.trg-prime.conditionExpiresRound"], 9);
  stamped.length = 0;
  actor.effects = [];
  await applyConditionTags(actor, [{ key: "prone", label: "Prone", value: null }], { expiresRound: 2 });
  eq("I1b and a tag that says nothing still takes the call's",
    stamped[0]?.updates?.["flags.trg-prime.conditionExpiresRound"], 2);
}

// Subdual 90: the link is stamped, and no round clock goes with it.
{
  const row = rowOf("subdual", 90);
  const { timed } = await stampRowDurations(resolveEffectiveConditions(row, BARE), row.effect, {});
  const unconscious = timed.find((t) => t.key === "unconscious");
  eq("I2 the link is stamped", unconscious?.endsWith, "bleeding");
  eq("I2b and carries no round clock with it", unconscious?.expiresRound, undefined);
}

// Subdual 96: a world-time deadline, rolled rather than averaged.
{
  const row = rowOf("subdual", 96);
  const { timed, notes } = await stampRowDurations(resolveEffectiveConditions(row, BARE), row.effect, {});
  const unconscious = timed.find((t) => t.key === "unconscious");
  eq("I3 the world-time deadline is stamped",
    unconscious?.expiresTime, Number(globalThis.game.time.worldTime) + 3 * UNIT_SECONDS.hour);
  ok("I3b and the roll is said out loud", notes.some((n) => /\(1d4\)/.test(n)));
}

// THE PERSISTENCE CLOCK IS NOT LAYERED BEHIND A TEXT DURATION, which is
// what would put the column's rounds onto a linked or world-timed
// condition. Asked of the workflow, since the grouping is its decision.
ok("I4 text-timed tags are applied with no call-level expiry behind them",
  /applyConditionTags\(targetActor, textTimed, \{\}\)/.test(code("module", "combat", "attack-workflow.mjs")));

// The cascade removes what was waiting, and only once the condition is
// really gone — two criticals can each inflict a bleed.
{
  const removed = [];
  const make = (name, link, status) => ({
    name, statuses: new Set(status ? [status] : []),
    getFlag: (_s, flag) => (flag === "conditionEndsWith" ? link : null),
    async delete() { removed.push(name); }
  });
  const actor = {
    hasCondition: (key) => key === "recurring",
    effects: [make("rider", "bleeding", "injured"), make("other", "recurring", "slowed"), make("plain", null, "prone")]
  };
  const gone = await sweepLinkedConditions(actor, ["bleeding", "recurring"]);
  eq("I5 only the rider whose condition really ended goes", removed, ["rider"]);
  eq("I5b and it is named", gone, ["Injured"]);
}

// The world clock takes what is due and leaves what is not.
{
  const removed = [];
  const make = (name, end) => ({
    name, statuses: new Set(),
    getFlag: (_s, flag) => (flag === "conditionExpiresTime" ? end : null),
    async delete() { removed.push(name); }
  });
  const actor = { effects: [make("due", 100), make("exactly", 200), make("later", 300)] };
  const gone = await sweepWorldTimeConditions(actor, 200);
  eq("I6 what is due goes, what is not stays", removed, ["due", "exactly"]);
  eq("I6b and is named", gone.length, 2);
}

// WHOSE CLOCK IS IT applies to all three of the new stamps: a rule that
// did not create the condition does not get to set a deadline on it.
// BOTH BRANCHES, counted — `applyConditionTags` has one for valued
// conditions and one for boolean, and a guard on only one of them is a
// guard that holds for half the registry.
eq("I7 a link is only written on a condition this application created — in both branches",
  (code("module", "combat", "effect-application-workflow.mjs")
    .match(/\.\.\.\(wasAlreadyPresent \? \{\} : \{\s*\n\s*endsWith: timing\.endsWith/g) ?? []).length, 2);

// The exertion watch: above the threshold, not at it.
{
  const watch = code("module", "combat", "critical-ap-watch.mjs");
  ok("I8 the check is asked above the threshold, not at it",
    /if \(amount <= found\.watch\.threshold\) return false;/.test(watch));
  ok("I9 a passed check applies nothing",
    /if \(check\?\.outcome\?\.degree\?\.success\) return false;/.test(watch));
  ok("I10 and the watch itself is not a status — the target is untouched, for now",
    !/statuses:/.test(watch));
}

/*
 * THE TWO FLAG NAMES THAT LIVE ON A SAVED WORLD. An effect stamped by
 * one release is read by the next, so renaming either of these silently
 * orphans every watch and every lockout already sitting in somebody's
 * game. Pinned to the string, not to the constant.
 */
eq("I13 the exertion watch's flag name", AP_WATCH_FLAG, "criticalApWatch");
eq("I14 the casting restriction's flag name", CASTING_RESTRICTION_FLAG, "castingRestriction");

// The watch is found wherever on the actor it sits.
{
  const flagged = (payload) => ({
    effects: [
      { getFlag: () => null },
      { getFlag: (_s, flag) => (flag === AP_WATCH_FLAG ? payload : null) }
    ]
  });
  const payload = { threshold: 1, dc: 5, tags: [], rounds: 10 };
  eq("I15 the watch is found", apSpendWatchOn(flagged(payload))?.watch, payload);
  eq("I15b and an actor without one says so", apSpendWatchOn({ effects: [{ getFlag: () => null }] }), null);
}

// A successor is applied with the clock it was queued with, counted
// from when it arrives rather than from the blow.
{
  const { applyFollowOn } = await import("../module/combat/linked-conditions-workflow.mjs");
  let seen = null;
  const actor = {
    hasCondition: () => false, isImmuneToCondition: () => false, effects: [],
    async toggleStatusEffect(key) {
      const effect = { statuses: new Set([key]), getFlag: () => null, async update(u) { seen = u; } };
      this.effects = [effect];
      return effect;
    }
  };
  await applyFollowOn(actor, { tags: [{ key: "confused", label: "Confused", value: null }], rounds: 10, seconds: 60 });
  eq("I16 a successor's rounds start when it arrives",
    seen?.["flags.trg-prime.conditionExpiresRound"],
    Number(globalThis.game.combat.round) + 10);
  eq("I16b and so do its seconds",
    seen?.["flags.trg-prime.conditionExpiresTime"],
    Number(globalThis.game.time.worldTime) + 60);
}

// The casting gates.
{
  const withScopes = (...scopes) => ({
    name: "Somebody",
    effects: scopes.map((scope) => ({
      disabled: false,
      getFlag: (_s, flag) => (flag === "castingRestriction" ? scope : null)
    }))
  });
  eq("I11 a verbal lockout blocks only a verbal spell",
    [castingRefusal(withScopes("verbal"), { components: { verbal: true } }, false).blocked,
     castingRefusal(withScopes("verbal"), { components: { verbal: false } }, false).blocked,
     castingRefusal(withScopes("verbal"), { components: { verbal: true } }, true).blocked],
    [true, false, false]);
  eq("I12 a total lockout blocks everything",
    castingRefusal(withScopes("spells"), { components: { verbal: false } }, false).blocked, true);
  eq("I12c every restriction on the actor is reported, once",
    castingRestrictionsOn(withScopes("spells", "verbal", "spells")), ["spells", "verbal"]);
  eq("I12b and a concentration demand asks rather than refuses",
    (() => { const r = castingRefusal(withScopes("concentration"), {}, false); return [r.blocked, r.concentration]; })(),
    [false, true]);
}

/* ================================================================== */
/* K — THE LIVE DEFECTS OF THIS BLOCK (3.581.0 → 3.581.1)             */
/* ================================================================== */

/*
 * Both were found by driving the rows in a live world before this file
 * was written, which is the order this block adopted after blocks 19
 * and 20. Neither was visible to any source pattern.
 */

// F1 — the scoped "(D)" was rolled on the ROW's Persistence, and Force
// 96's column says Fatal, so the formula was null and the lockout came
// out with no duration at all.
ok("K1 a Fatal row still has a severity formula for its scoped (D)",
  Boolean(injuryDurationFormula("deadly")) && Boolean(injuryDurationFormula("minor")));
ok("K2 and the workflow rolls THAT, not the column's",
  /persistenceRounds:\s*riders\.lockout\?\.persistence === "D"\s*\?\s*injuryDurationFormula\(severity\)/
    .test(code("module", "combat", "attack-workflow.mjs")),
  "the scoped (D) must not read persistenceInfo.rollFormula — it is null on a Fatal row");

// F2 — a tag that carried a successor but no duration of its own was
// moved into the timed group, which is applied with no call-level
// expiry, so Poison 60's Blinded lost the column's clock entirely.
ok("K3 a successor alone does not move a tag off the column's clock",
  /if \(!duration\) \{\s*\n\s*plain\.push\(followOn \? \{ \.\.\.tag, followOn \} : tag\);/
    .test(code("module", "combat", "linked-conditions-workflow.mjs")));

/* ================================================================== */
/* J — THE WIRING, ASKED OF THE OTHER SIDE                             */
/* ================================================================== */

/*
 * EVERY NAMED IMPORT IN THIS BLOCK'S FILES IS RESOLVED AND THE TARGET
 * FILE IS ASKED WHETHER IT EXPORTS THAT NAME. Block 20's F2 shipped
 * `applyDamageAndCheckDying` imported from the wrong module on the
 * strength of its name, and nothing could drown for a release.
 */
{
  const FILES = [
    ["module", "combat", "critical-durations.mjs"],
    ["module", "combat", "critical-riders.mjs"],
    ["module", "combat", "linked-conditions-workflow.mjs"],
    ["module", "combat", "critical-ap-watch.mjs"],
    ["module", "magic", "casting-restriction-workflow.mjs"],
    ["module", "combat", "effect-application-workflow.mjs"],
    ["module", "effect-parser.mjs"],
    ["module", "combat", "attack-workflow.mjs"],
    ["module", "dice", "check-card-interactions.mjs"],
    ["module", "magic", "cast-workflow.mjs"],
    ["module", "combat", "action-points-workflow.mjs"],
    ["scripts", "trg-prime.mjs"]
  ];
  const exportsOf = (file) => {
    const src = fs.readFileSync(file, "utf8");
    const names = new Set();
    for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(",")) {
        const halves = part.split(/\s+as\s+/i);
        const name = (halves[1] ?? halves[0]).trim();
        if (name) names.add(name);
      }
    }
    return names;
  };

  let resolved = 0;
  const wrong = [];
  for (const parts of FILES) {
    const full = path.join(SYSTEM_ROOT, ...parts);
    const src = fs.readFileSync(full, "utf8");
    const patterns = [
      /(?:const|let)\s*\{([^}]+)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g,
      /import\s*\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(src))) {
        const target = path.resolve(path.dirname(full), match[2]);
        if (!fs.existsSync(target)) { wrong.push(`${parts.join("/")} → ${match[2]} (no such file)`); continue; }
        const have = exportsOf(target);
        for (const raw of match[1].split(",")) {
          const name = raw.split(/\s+as\s+|:/i)[0].trim();
          if (!name) continue;
          resolved++;
          if (!have.has(name)) wrong.push(`${parts.join("/")}: "${name}" is not exported by ${match[2]}`);
        }
      }
    }
  }
  ok("J1 every named import resolves to a real export", wrong.length === 0, wrong.join("; "));
  ok("J2 and there were enough of them to mean something", resolved > 500,
    `only ${resolved} imports were checked`);
}

/*
 * THE FLAGS ARE NAMED ONCE. Three new clocks, and a flag whose name is
 * typed twice is a flag that will be typed differently once.
 */
{
  const ea = read("module", "combat", "effect-application-workflow.mjs");
  for (const [constant, value] of [
    ["ENDS_WITH_FLAG", "conditionEndsWith"],
    ["END_TIME_FLAG", "conditionExpiresTime"],
    ["FOLLOW_ON_FLAG", "conditionFollowOn"]
  ]) {
    ok(`J3 ${constant} is exported as "${value}"`,
      new RegExp(`export const ${constant} = "${value}";`).test(ea));
  }
  const lc = code("module", "combat", "linked-conditions-workflow.mjs");
  ok("J4 the cascade reads those constants rather than retyping the strings",
    /ENDS_WITH_FLAG, END_TIME_FLAG, FOLLOW_ON_FLAG/.test(lc)
    && !/"conditionEndsWith"/.test(lc) && !/"conditionExpiresTime"/.test(lc));
}

// THE ACTOR IS `effect.parent`. Blocks 19 and 20 cost three releases to
// two uuids that each looked like the right way to name a document.
{
  const lc = code("module", "combat", "linked-conditions-workflow.mjs");
  ok("J5 the cascade takes the actor Foundry hands it", /const actor = effect\?\.parent;/.test(lc));
  ok("J6 and does not look one up by uuid", !/fromUuid|game\.actors\.get/.test(lc));
}

// The watch is hung where an action point actually leaves a pool.
ok("J7 the AP watch is called from spendActionPoints",
  /await checkApSpendWatch\(actor, cost\);/.test(code("module", "combat", "action-points-workflow.mjs")));

// The casting gate sits beside Rage's, before anything is spent.
{
  const cw = code("module", "magic", "cast-workflow.mjs");
  const rage = cw.indexOf("isRaging(actor)");
  const gate = cw.indexOf("castingRefusal");
  const spend = cw.indexOf("system.resources.pp.value");
  ok("J8 the critical lockout is refused beside Rage", rage >= 0 && gate > rage);
  ok("J8b and the refusal is acted on rather than computed",
    /if \(refusal\.blocked && !drunkPotion\) \{\s*\n\s*ui\.notifications\.warn\(refusal\.reason\);\s*\n\s*return null;/.test(cw));
  ok("J9 and before any PP is spent", gate >= 0 && spend > gate);
}

// The world clock sweeps this block's conditions beside the spell one.
ok("J10 the world clock sweeps a critical's own deadline",
  /sweepWorldTimeConditions\(actor, worldTime\)/.test(code("scripts", "trg-prime.mjs")));
ok("J11 and the cascade is registered at init",
  /registerLinkedConditionHooks\(\);/.test(code("scripts", "trg-prime.mjs")));

// The armour clause is read for its own duration (Slashing 51).
/*
 * THE IMPORT TIED TO *THIS* CALL, not merely present somewhere in the
 * file.
 *
 * STRENGTHENED AT 3.582.1, because block 22 gave the FUMBLE path the
 * same import and this check went blind on the spot: stubbing the
 * critical path's import left the fumble path's identical line matching,
 * so the mutation that had been caught since 3.581.0 survived the first
 * sweep after block 22 landed. A check can be true when it is written
 * and untrue a fortnight later without a line of it changing.
 *
 * The bounded gap is what ties them: the import sits two lines above the
 * call it serves, so nothing else can satisfy it from elsewhere in a
 * 4,000-line file.
 */
ok("J12a the critical path really imports the stamper, beside the call it serves",
  /const \{ stampRowDurations \} = await import\("\.\/linked-conditions-workflow\.mjs"\);[\s\S]{0,300}?stampRowDurations\(\s*\n?\s*tags,\s*\n?\s*`\$\{row\.effect\}/
    .test(code("module", "combat", "attack-workflow.mjs")),
  "an import somewhere in the file is not an import in this branch");
ok("J12 the critical path reads the qualifying clause's text too",
  /stampRowDurations\(\s*\n?\s*tags,\s*\n?\s*`\$\{row\.effect\} \$\{qualifying\?\.text \?\? ""\}`/
    .test(code("module", "combat", "attack-workflow.mjs")));

// A tag's own clock must not be detected by truthiness: round 0 is a
// real round and Number(null) is 0 — the shape that deleted the critical
// from every damage roll at 3.580.0.
ok("J13 a per-tag clock is detected by presence, not by truthiness",
  /tag\?\.expiresRound !== undefined && tag\?\.expiresRound !== null/
    .test(code("module", "combat", "effect-application-workflow.mjs")));

// The self-timed list is imported, not copied.
ok("J14 critical-durations imports the carve-out rather than freezing its own",
  /import \{ SELF_TIMED_CONDITION_IDS \} from "\.\.\/injuries\.mjs";/
    .test(read("module", "combat", "critical-durations.mjs"))
  && !/\["bleeding", "recurring", "sickened"\]/.test(code("module", "combat", "critical-durations.mjs")));

/* ================================================================== */

process.stdout.write(failures
  ? `\nverify-chapter7-critical-211-220: FAILED — ${failures} of ${checks} checks.\n`
  : `\nverify-chapter7-critical-211-220: OK — ${checks} checks. Pages 211-220: durations, links, successors, and the rows that ask for something.\n`);
process.exit(failures ? 1 : 0);
