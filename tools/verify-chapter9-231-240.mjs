#!/usr/bin/env node
/**
 * verify-chapter9-231-240 — afflictions, and Chapter 9's opening.
 *
 * NEW at 3.583.0, for the pages 231-240 audit and Graham's fifteen
 * rulings of 22 September 2026:
 *
 *   A  the three afflictions page 232 prints (D6; R7)
 *   B  a stage's conditions, applied — the block's headline (D1; R1, R2)
 *   C  incubation, a stage interval and a duration as clocks (D2-D4; R3-R5)
 *   D  what an affliction holds (D5; R6)
 *   E  bleed and recurring damage as a casting penalty (D7; R8)
 *   F  a cantrip counteracts at the PP you can cast (D9; R10)
 *   G  spell availability tiers (D10; R11 — a warning, not a refusal)
 *   H  the daily study each tradition pays (D11; R12)
 *   I  an unwilling touch (D12; R13)
 *   J  the optional harder Save DC (page 237; R14)
 *   K  the wiring, asked of the other side
 *
 * WRITTEN BEFORE THE LIVE DRIVE, DELIBERATELY AND UNUSUALLY. The order
 * this project has used since block 20 is drive first, harness second,
 * because a harness written first encodes what I believe rather than
 * what is true. It is inverted here for one reason: `verify-rules-have-
 * callers` found ten exports with no caller in this release, which is
 * block 22's own lesson (travel and sustenance shipped verified and
 * unreachable), and four of them are figures whose only honest consumer
 * is a check. Shipping them uncalled to preserve an ordering rule would
 * trade a real defect for a procedural one.
 *
 * So this file is a FIRST PASS. The live drive of 3.583.0 gets to
 * correct it, and what it finds is added here afterwards — the sections
 * below are what can be held without a running world, not everything
 * that needs holding.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  afflictionSpan, conditionRemovalAllowed, deadlineDue, spanSeconds,
  applyStageChange, initialExposureOutcome, stageDelta, UNIT_SECONDS
} from "../module/afflictions.mjs";
import {
  castingLimitToday, dailyStudyLine, dailyStudyRequired,
  DAILY_STUDY_LABEL, DAILY_STUDY_MINUTES
} from "../module/magic/daily-study.mjs";
import {
  availabilityWarning, spellAvailabilityTier, AVAILABILITY_TIERS
} from "../module/magic/repertoire.mjs";
import { touchAttackOutcome, touchAttackRequired } from "../module/magic/spell-range.mjs";
import { castingOutcome, harderSaveStep, maxPPPerCast } from "../module/magic/casting.mjs";
import { DIFFICULTY_BY_KEY } from "../module/dice/resolution.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { afflictionDocument } from "./build-afflictions.mjs";

let checks = 0;
let failures = 0;
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

function ok(label, condition, detail = "") {
  checks += 1;
  if (condition) return;
  failures += 1;
  process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ""}\n`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

/* ================================================================== */
/* A — THE THREE AFFLICTIONS THE PAGE PRINTS (D6; R7)                  */
/* ================================================================== */

const SOURCE = JSON.parse(read("tools", "afflictions.json"));
const byName = Object.fromEntries(SOURCE.afflictions.map((a) => [a.name, a]));

eq("A1 all three are written", SOURCE.afflictions.map((a) => a.name).sort(),
  ["Blinding Sickness", "Filth Fever", "Lycanthropy"]);

// Filth Fever, transcribed from the page: "Level 0; Saving Throw
// Fortitude; Incubation 1d4 hours; Duration Until cured; Stage 1 No
// effect; Stage 2 Sickened 1 (1 day); Stage 3 Sickened 1 & Slowed 1
// (1 day); Stage 4 Paralyzed (1 day); Stage 5 Dead".
{
  const f = byName["Filth Fever"];
  eq("A2 Filth Fever is level 0", f.level, 0);
  eq("A2b Fortitude", f.savingThrow, "fortitude");
  eq("A2c incubation 1d4 hours", f.incubation, "1d4 hours");
  eq("A2d duration until cured", f.duration, "Until cured");
  eq("A2e five stages", f.stages.length, 5);
  eq("A2f stage 1 is no effect at all", f.stages[0].conditions, []);
  eq("A2g stage 3 is both", f.stages[2].conditions.map((c) => c.key).sort(), ["sickened", "slowed"]);
  eq("A2h stage 5 is death", f.stages[4].conditions.map((c) => c.key), ["dead"]);
}
{
  const b = byName["Blinding Sickness"];
  eq("A3 Blinding Sickness is level 2", b.level, 2);
  eq("A3b incubation 1 day", b.incubation, "1 day");
  eq("A3c four stages", b.stages.length, 4);
  eq("A3d and it ends blind", b.stages[3].conditions.map((c) => c.key), ["blinded"]);
}
{
  const l = byName["Lycanthropy"];
  ok("A4 Lycanthropy is a curse", l.afflictionType === "curse");
  eq("A4b its incubation is the moon", l.incubation, "until full moon");
  ok("A4c and it carries the Uncommon trait the page prints",
    /uncommon/i.test(l.traits));
}

/*
 * EVERY CONDITION KEY RESOLVES, and carries a value only where the
 * condition is valued. A stage naming a condition the registry does not
 * have is a stage that applies nothing — which is the defect this whole
 * release is about, reappearing as a typo.
 */
{
  const unknown = [];
  const mismatched = [];
  for (const a of SOURCE.afflictions) {
    for (const stage of a.stages) {
      for (const c of stage.conditions ?? []) {
        if (!CONDITIONS[c.key]) { unknown.push(`${a.name}/${c.key}`); continue; }
        const valued = Boolean(CONDITIONS[c.key].valued);
        const hasValue = c.value !== null && c.value !== undefined;
        if (valued !== hasValue) mismatched.push(`${a.name}/${c.key}`);
      }
    }
  }
  ok("A5 every stage's conditions resolve", unknown.length === 0, unknown.join(", "));
  ok("A5b and a valued condition carries a value", mismatched.length === 0, mismatched.join(", "));
}

// The built document is what the pack will hold.
{
  const doc = afflictionDocument(byName["Filth Fever"]);
  eq("A6 the document is an affliction item", doc.type, "affliction");
  eq("A6b maxStage follows the stages written", doc.system.maxStage, 5);
  ok("A6c and each stage keeps its conditions",
    doc.system.stages[1].conditions.length === 1);
  ok("A6d the id is stable across rebuilds",
    afflictionDocument(byName["Filth Fever"])._id === doc._id);
}

/* ================================================================== */
/* B — THE STAGE LADDER (page 232)                                     */
/* ================================================================== */

eq("B1 Critical reduces by 2", stageDelta("critical"), -2);
eq("B2 Success by 1", stageDelta("success"), -1);
eq("B3 Failure raises by 1", stageDelta("failure"), 1);
eq("B4 Fumble by 2", stageDelta("fumble"), 2);
// "If the affliction's stage is ever reduced below 1, the affliction ends."
eq("B5 below 1 ends it", applyStageChange(1, -1, 5), { stage: 0, ended: true });
// "If the stage is increased beyond its maximum value, the affliction
// instead repeats the effects of its highest stage."
eq("B6 beyond the maximum repeats the highest", applyStageChange(5, 2, 5), { stage: 5, ended: false });
eq("B7 exposure: a success is unaffected", initialExposureOutcome("success").affected, false);
eq("B8 a failure starts at stage 1", initialExposureOutcome("failure").startingStage, 1);
eq("B9 a fumble at stage 2", initialExposureOutcome("fumble").startingStage, 2);

/* ================================================================== */
/* C — THE THREE CLOCKS (D2, D3, D4; R3, R4, R5)                       */
/* ================================================================== */

eq("C1 a literal span resolves to seconds", afflictionSpan("1 day"),
  { kind: "span", formula: "1", unit: "day", seconds: 86400 });
// A FORMULA WAITS FOR THE CALLER'S ROLL — a pure module that rolled
// would give every reader of the text a different answer.
eq("C2 a formula is returned unrolled", afflictionSpan("1d4 hours"),
  { kind: "span", formula: "1d4", unit: "hour", seconds: null });
eq("C3 'until cured' is open, not zero", afflictionSpan("Until cured").kind, "open");
eq("C4 and so is the full moon", afflictionSpan("until full moon").kind, "open");
eq("C5 'Instant' is already past", afflictionSpan("Instant").kind, "instant");
eq("C6 nothing written is nothing at all", afflictionSpan(""), null);
eq("C7 a day is 86400 seconds", UNIT_SECONDS.day, 86400);
eq("C8 spanSeconds multiplies", spanSeconds(4, "hour"), 14400);

/*
 * A NULL DEADLINE IS NEVER DUE. `Number(null)` is 0 and 0 is finite —
 * the exact mistake block 22's water clock shipped with, and the reason
 * this is a named function rather than a comparison at each call site.
 */
eq("C9 an open deadline never rings", deadlineDue(null, 9e9), false);
eq("C10 nor an absent one", deadlineDue(undefined, 9e9), false);
eq("C11 a stamped one rings on the second", deadlineDue(100, 100), true);
eq("C12 and not before", deadlineDue(100, 99), false);

/* ================================================================== */
/* D — WHAT AN AFFLICTION HOLDS (D5; R6)                               */
/* ================================================================== */

eq("D1 a condition nothing holds is free to remove",
  conditionRemovalAllowed({ heldByAffliction: false, fromRule: true }).allowed, true);
// "Cannot be removed while the affliction persists" — a spell, a rest or
// a sweep is exactly what the sentence refuses, GM-run or not.
eq("D2 a rule cannot lift a held condition",
  conditionRemovalAllowed({ heldByAffliction: true, fromRule: true, byGM: true }).allowed, false);
eq("D3 and it says why", /page 232/.test(
  conditionRemovalAllowed({ heldByAffliction: true, fromRule: true }).reason), true);
eq("D4 the GM's own hand may lift it (R6's carve-out)",
  conditionRemovalAllowed({ heldByAffliction: true, byGM: true, fromRule: false }).allowed, true);
eq("D5 a player's cannot",
  conditionRemovalAllowed({ heldByAffliction: true, byGM: false, fromRule: false }).allowed, false);

/* ================================================================== */
/* E — BLEED AND RECURRING AS A CASTING PENALTY (D7; R8)               */
/* ================================================================== */

{
  const wf = code("module", "magic", "cast-workflow.mjs");
  /*
   * READ OFF THE CASTER, NOT ASKED. Every other entry in that list comes
   * off the dialog because only the table knows whether the boat is
   * rough; these two are facts about the character at the moment of the
   * roll, and a checkbox for them would be a question with one answer.
   */
  ok("E1 bleeding is read from the actor",
    /getConditionValue\?\.\("bleeding"\)/.test(wf), "page 238's only unapplied penalty");
  ok("E2 and recurring damage too", /getConditionValue\?\.\("recurring"\)/.test(wf));
  ok("E3 both are applied as a penalty, not a bonus",
    /value: -bleeding/.test(wf) && /value: -recurring/.test(wf));
  ok("E4 and only when there is some",
    /if \(bleeding\) situational\.push/.test(wf) && /if \(recurring\) situational\.push/.test(wf),
    "a zero-value entry on every cast is noise");
  ok("E5 the keys are the registry's own",
    Boolean(CONDITIONS.bleeding) && Boolean(CONDITIONS.recurring));
}

/* ================================================================== */
/* F — A CANTRIP COUNTERACTS AT THE PP YOU CAN CAST (D9; R10)          */
/* ================================================================== */

{
  const wf = code("module", "combat", "counteract-workflow.mjs");
  ok("F1 the acting value starts at the caster's maximum",
    /value="\$\{maxCastablePP\}"/.test(wf), "0 took -2 per point of the target");
  ok("F2 which is caster level + 1",
    /maxPPPerCast\(Number\(actor\.system\?\.magic\?\.casterLevelValue \?\? 0\)\)/.test(wf));
  ok("F3 and the dialog says the rule out loud",
    /always treated as the PP that you are able to/.test(wf),
    "a prefilled number nobody understands is changed back");
  eq("F4 a level-8 caster counteracts at 9", maxPPPerCast(8), 9);
}

/* ================================================================== */
/* G — SPELL AVAILABILITY (D10; R11 — a warning)                       */
/* ================================================================== */

eq("G1 the three tiers page 235 names", AVAILABILITY_TIERS, ["common", "uncommon", "rare"]);
// "All spells listed in the Core Rulebook are considered Common" — so
// the default has to be common, or the whole shipped pack starts warning.
eq("G2 an unmarked spell is Common", spellAvailabilityTier({ system: {} }), "common");
eq("G3 a marked one is not", spellAvailabilityTier({ system: { availability: "rare" } }), "rare");
eq("G4 an unrecognised value falls back rather than warning",
  spellAvailabilityTier({ system: { availability: "legendary" } }), "common");
eq("G5 Core spells say nothing", availabilityWarning({ name: "Light", system: {} }).warn, false);
eq("G6 a supplement spell warns", availabilityWarning({ name: "X", system: { availability: "uncommon" } }).warn, true);
ok("G7 and the warning cites the page",
  /page 235/.test(availabilityWarning({ name: "X", system: { availability: "rare" } }).said));
// R11 IS A WARNING, NOT A REFUSAL. The pick must still go through.
{
  const wf = code("module", "magic", "spellbook-workflow.mjs");
  /*
   * A WARNING, NOT A REFUSAL. The first draft of this check looked for
   * an absence of `return null` near the warning and failed on the
   * `if (!created) return null` that guards the creation itself — a
   * check that asked the wrong question and would have sent me to
   * "fix" working code. What it should ask is that the warning is a
   * CARD LINE and the picked spell is still handed back.
   */
  ok("G8 the warning is a line on the card",
    /availability\.warn \? \[line\(/.test(wf));
  ok("G8b and the pick still goes through",
    /await postCard\(actor, "Spell Book"[\s\S]*?\n  return created;/.test(wf),
    "the page hands this question to the table twice in four sentences");
}

/* ================================================================== */
/* H — THE DAILY STUDY (D11; R12)                                      */
/* ================================================================== */

// Page 235's own figures: thirty minutes with a library, an hour of
// prayer, an hour of communion.
eq("H1 a Learned arcane caster owes thirty minutes",
  dailyStudyRequired({ tradition: "arcane", style: "book" }).minutes, 30);
eq("H2 Divinity owes an hour of prayer",
  dailyStudyRequired({ tradition: "divinity", style: "list" }).minutes, 60);
eq("H3 Verdant owes an hour of communion",
  dailyStudyRequired({ tradition: "verdant", style: "list" }).minutes, 60);
eq("H4 Ethereal owes thirty",
  dailyStudyRequired({ tradition: "ethereal", style: "book" }).minutes, 30);
// "You have no need to study or maintain a Spell Library."
eq("H5 an Instinctive caster owes nothing",
  dailyStudyRequired({ tradition: "arcane", style: "instinctive" }).owed, false);
// THE HOUR IS NOT THE SAME HOUR. Identical durations, different fictions.
ok("H6 prayer and communion are not the same sentence",
  DAILY_STUDY_LABEL.divinity !== DAILY_STUDY_LABEL.verdant);
eq("H7 and the figures are the page's", DAILY_STUDY_MINUTES,
  { arcane: 30, ethereal: 30, divinity: 60, verdant: 60 });
// "If a learned caster is unable to study their Spell Library, they can
// only cast cantrips that day."
eq("H8 no study, cantrips only", castingLimitToday({ owed: true, studied: false }).cantripsOnly, true);
eq("H9 studied, no limit", castingLimitToday({ owed: true, studied: true }).cantripsOnly, false);
eq("H10 and an Instinctive caster is never limited by it",
  castingLimitToday({ owed: false, studied: false }).cantripsOnly, false);
ok("H11 the card names what was not done",
  /cantrips only today/.test(dailyStudyLine(dailyStudyRequired({ tradition: "divinity", style: "list" }), false)));

/* ================================================================== */
/* I — AN UNWILLING TOUCH (D12; R13)                                   */
/* ================================================================== */

eq("I1 a touch on an unwilling target needs the roll",
  touchAttackRequired({ rangeText: "touch", willing: false }), true);
eq("I2 a willing one does not", touchAttackRequired({ rangeText: "touch", willing: true }), false);
/*
 * AN ATTACK SPELL ALREADY ROLLS. Page 239: its Cast a Spell check IS the
 * attack roll — asking for a second would hit twice.
 */
eq("I3 an Attack spell is not asked twice",
  touchAttackRequired({ rangeText: "touch", willing: false, isAttackSpell: true }), false);
eq("I4 and a ranged spell is not asked at all",
  touchAttackRequired({ rangeText: "30 feet", willing: false }), false);
eq("I5 the touch lands on a tie", touchAttackOutcome(18, 18).landed, true);
eq("I6 and misses below it", touchAttackOutcome(17, 18).landed, false);

/* ================================================================== */
/* J — THE OPTIONAL HARDER SAVE DC (page 237; R14)                     */
/* ================================================================== */

/*
 * ASKED OF THE DIFFICULTY LADDER, not of the two numbers in the
 * sentence. Block 22's audit guessed Hard was +5 and the ladder said +2.
 */
eq("J1 a Critical makes the Save DC Hard", harderSaveStep("critical"), DIFFICULTY_BY_KEY.hard.modifier);
eq("J2 a Heroic makes it Very Hard", harderSaveStep("heroic"), DIFFICULTY_BY_KEY.veryHard.modifier);
eq("J1b and Hard is +2", DIFFICULTY_BY_KEY.hard.modifier, 2);
eq("J2b Very Hard +5", DIFFICULTY_BY_KEY.veryHard.modifier, 5);
eq("J3 nothing else is stepped", harderSaveStep("success"), 0);
// "If you apply this result, you do not save any PP."
eq("J4 a Critical still halves the base when the rule is off",
  castingOutcome("critical", { basePP: 8, warpPP: 4 }).ppSpent, 8);
eq("J5 and saves nothing when it is on",
  castingOutcome("critical", { basePP: 8, warpPP: 4, waiveSaving: true }).ppSpent, 12);
eq("J6 a Heroic halves the total when off",
  castingOutcome("heroic", { basePP: 8, warpPP: 4 }).ppSpent, 6);
eq("J7 and saves nothing when on",
  castingOutcome("heroic", { basePP: 8, warpPP: 4, waiveSaving: true }).ppSpent, 12);
eq("J8 a Success is untouched either way",
  castingOutcome("success", { basePP: 8, warpPP: 4, waiveSaving: true }).ppSpent, 12);
// Warp Manipulation's own trade still works beside it.
eq("J9 the Critical trade is not broken",
  castingOutcome("critical", { basePP: 8, warpPP: 4, waiveCritical: true }).ppSpent, 12);

/* ================================================================== */
/* K — THE WIRING                                                      */
/* ================================================================== */

{
  const wf = code("module", "combat", "affliction-workflow.mjs");
  /*
   * ONE PATH FOR A DISEASE AND A POISON (R2: "same as Poison"). There
   * were two until this release, and the one every hand-written
   * affliction took applied nothing at all.
   */
  ok("K1 there is one stage path", /async function enterStage\(/.test(wf));
  ok("K1b and the other is gone", !/applyStageEffect/.test(wf),
    "two paths is two chances to get it wrong");
  ok("K2 conditions are applied on entering a stage",
    /lines\.push\(\.\.\.await applyPoisonConditions\(actor, item, entry\)\)/.test(wf));
  /*
   * THE RECORD LIVES WHERE BOTH CAN REACH IT. It used to be written only
   * `if (poison)`, so a disease's list was computed and discarded — the
   * single line that made every hand-written affliction inert.
   */
  /*
   * THE WHOLE LINE, not the call inside it. The first draft asked that
   * `setRecord(item, { applied: record })` appear and that one particular
   * old guard not — and the mutation runner walked straight through it by
   * writing a DIFFERENT guard around the same call. What matters is that
   * nothing conditions this write on the affliction being a poison.
   */
  ok("K3 the applied record is written for every affliction",
    /\n  if \(item\?\.id && actor\.items\?\.get\?\.\(item\.id\)\) await setRecord\(item, \{ applied: record \}\);/.test(wf),
    "one `if (poison)` here is what made every disease inert");
  ok("K4 and withdrawal reads the same record",
    /const applied = recordOf\(item\)\.applied \?\? \[\];/.test(wf));
  /*
   * COMPUTED, not mentioned. `incubationEndsAt,` also appears in
   * `deadlineDue(record.incubationEndsAt, worldTime)`, so the first draft
   * of this check passed while the stamp was hard-wired to null.
   */
  ok("K5 incubation is stamped, not ignored",
    /incubationEndsAt = Number\(globalThis\.game\?\.time\?\.worldTime \?\? 0\) \+ seconds;/.test(wf),
    "a deadline nothing sets never rings");
  ok("K6 the world clock sweeps afflictions", /export async function sweepAfflictions\(/.test(wf));
  // DURATION FIRST. A long jump can ring all three deadlines, and an
  // affliction that has expired must not roll one last stage save.
  const sweep = wf.slice(wf.indexOf("export async function sweepAfflictions("));
  /*
   * BOTH MUST BE FOUND, and then ordered. `indexOf` answers -1 for a
   * string that is not there, and -1 is less than every real index — so
   * an ordering check alone passes loudest when the thing it is ordering
   * has been deleted.
   */
  const order = (a, b) => {
    const i = sweep.indexOf(a);
    const j = sweep.indexOf(b);
    return i >= 0 && j >= 0 && i < j;
  };
  ok("K7 the duration is checked before the stage save",
    order("record.endsAt", "record.stageDueAt"));
  ok("K7b and incubation before the stage save too",
    order("record.incubationEndsAt", "record.stageDueAt"));
  ok("K8 the lock asks the rule rather than repeating it",
    /conditionRemovalAllowed\(\{/.test(wf));
  ok("K9 and the affliction's own withdrawal is let through",
    /if \(releasing\) return true;/.test(wf));
}
{
  const script = code("scripts", "trg-prime.mjs");
  ok("K10 the sweep is on the world clock",
    /await sweepAfflictions\(actor, worldTime\)/.test(script));
  ok("K11 gated by the module's own predicate",
    /if \(hasAfflictions\(actor\)\) \{/.test(script));
  ok("K12 and the lock is registered at init",
    /registerAfflictionConditionLock\(\);/.test(script));
}
{
  const gate = code("module", "magic", "spell-availability.mjs");
  ok("K13 the cast gate asks the study rule",
    /castingLimitToday\(\{ owed:/.test(gate),
    "the rule was hand-rolled at this call site until the ratchet said so");
  /*
   * A STAMP FROM LAST WEEK IS NOT AN ANSWER ABOUT THIS MORNING. Without
   * the window a character would stay locked out of their spells across
   * a session boundary.
   */
  ok("K14 and only believes today's stamp", /since < 86400/.test(gate));
}
{
  const prep = code("module", "uses-workflow.mjs");
  ok("K15 daily preparation charges the time",
    /dailyStudyRequired\(\{/.test(prep));
  ok("K16 stamps whether it was paid",
    /"dailyStudy", \{\n?\s*studied,/.test(prep) || /studied, at: Number/.test(prep));
  ok("K17 and the old manual reminder is gone",
    !/Reminder \(GM judgement, not tracked\)/.test(prep),
    "it sat beside four lines this card had already automated");
}
{
  const cast = code("module", "magic", "cast-workflow.mjs");
  ok("K18 the optional rule reaches the Save DC", /\+ harderSaveDCStep\n/.test(cast));
  ok("K19 and takes the PP saving with it",
    /waiveSaving: harderSaveRule && harderSaveDCStep > 0/.test(cast),
    "the paragraph that raises the DC withdraws the saving in the same breath");
  ok("K20 the unwilling touch is offered only where it can bite",
    /touchAttackRequired\(\{ rangeText: spell\?\.system\?\.range, willing: false, isAttackSpell: isAttack \}\)/.test(cast));
  /*
   * K21 READS THE CONDITION, NOT ITS PUNCTUATION. It was `/&& !touchMissed\)/`
   * — the clause plus the closing paren — and 3.598.0 added a fourth clause
   * after it for Sanctuary's deferred save, so a check about a missed touch
   * went red over a bracket that had moved. The rule it guards is unchanged.
   */
  // AND 3.609.0 lets a cast MODE carry its own save (Transmute Rock & Mud),
  // so the defence is `(effDefence ?? spellData.defence)` — same rule.
  ok("K21 a missed touch stops the spell",
    /\(effDefence \?\? spellData\.defence\) && saveDC != null && !touchMissed/.test(cast));
}
{
  const sj = JSON.parse(read("system.json"));
  ok("K22 the afflictions pack is declared",
    sj.packs.some((p) => p.name === "afflictions" && p.type === "Item"));
}

/* ================================================================== */
/* L — THE LIVE DEFECTS OF 3.583.0 → 3.583.1                           */
/*                                                                     */
/* Neither was visible to a source pattern, and neither could have     */
/* been: both are about what happens when two correct rules meet.      */
/* ================================================================== */

{
  const wf = code("module", "combat", "affliction-workflow.mjs");
  /*
   * F1. The page-232 lock refused the affliction's OWN stage change.
   * `releasing` was set only by `releaseAffliction`, and entering a new
   * stage does not go through that — so Filth Fever climbed from Stage 2
   * to Stage 4 on a Fumble, applied Paralyzed, and left the Stage 2
   * Sickened on beside it. A lock whose own key is refused.
   */
  ok("L1 the affliction's own withdrawal is let through the lock",
    /  releasing = true;\n  try \{[\s\S]*?const plan = conditionsToWithdraw\(/.test(wf),
    "the stage change is the affliction taking its own conditions back");
  ok("L1b and the flag is always put back",
    /\} finally \{\n    releasing = false;\n  \}/.test(wf),
    "a throw mid-withdrawal would otherwise disable the lock for the session");
  /*
   * F3-adjacent. Foundry calls a PRE-hook synchronously and does not
   * await it, so an async release racing the deletion finished first in
   * the drive for no reason it could be relied on to repeat.
   */
  ok("L2 the cure runs after the delete, not racing it",
    /Hooks\.on\("deleteItem", async \(item\) => \{/.test(wf)
    && !/Hooks\.on\("preDeleteItem"/.test(wf),
    "a pre-hook's promise is dropped on the floor");
}

{
  /*
   * F2. `dailyStudyRequired` tested `style !== "instinctive"`, and
   * "instinctive" was a word daily-study.mjs invented — `memorisationContext`
   * answers only "book", "list" or NULL. Handed the context's own value, a
   * Bard fell through to "learned", was charged thirty minutes, and would
   * then have been refused everything but cantrips.
   *
   * It passed every test because the single call site wrote
   * `?? "instinctive"` — a rule that is wrong and a caller patching it.
   */
  eq("L3 a Wizard's book owes its thirty minutes",
    dailyStudyRequired({ tradition: "arcane", style: "book" }).minutes, 30);
  eq("L3b a Cleric's list owes its hour",
    dailyStudyRequired({ tradition: "divinity", style: "list" }).minutes, 60);
  // THE VALUE THE PRODUCING MODULE ACTUALLY RETURNS for an instinctive caster.
  eq("L4 null owes nothing", dailyStudyRequired({ tradition: "ethereal", style: null }).owed, false);
  eq("L4b undefined owes nothing", dailyStudyRequired({ tradition: "ethereal", style: undefined }).owed, false);
  eq("L4c and an empty string owes nothing",
    dailyStudyRequired({ tradition: "ethereal", style: "" }).owed, false);
  // NAMING WHAT OWES FAILS SAFE: a style nobody has thought of yet owes
  // nothing, rather than owing an hour and locking a caster out.
  eq("L5 an unknown style owes nothing",
    dailyStudyRequired({ tradition: "arcane", style: "whatever" }).owed, false);
  ok("L6 and the call site no longer patches the rule",
    !/\?\? "instinctive"/.test(code("module", "uses-workflow.mjs")),
    "a rule that needs a caller to be correct breaks on the second caller");
}

/* ================================================================== */

process.stdout.write(failures
  ? `\nverify-chapter9-231-240: FAILED — ${failures} of ${checks} checks.\n`
  : `\nverify-chapter9-231-240: OK — ${checks} checks. Pages 231-240: afflictions and Chapter 9's opening.\n`);
process.exit(failures ? 1 : 0);
