#!/usr/bin/env node
/**
 * verify-condition-clocks — a condition a spell applies must end.
 *
 * NEW at 3.590.0. Graham's ruling of 25 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS, AND WHY IT IS A CENSUS RATHER THAN A SPOT CHECK.
 *
 * The same shape turned up in three consecutive blocks. Pages 271-280:
 * six spells applied one flat condition on every failing degree. Pages
 * 281-290: six more. Each time I treated it as that block's problem, and
 * each time it was found only because I happened to be reading those
 * pages.
 *
 * Swept properly, the pack held SIXTEEN condition rows with no clock of
 * any kind. Twelve were defects. Hold Animal and Hold Kind paralyzed a
 * creature PERMANENTLY on a save it had SUCCEEDED at; Sleep left a
 * target unconscious for ever; Word Of Deafening deafened for ever on
 * every rung including the critical, where the page says one round.
 *
 * None of them looked broken. A card that says "Paralyzed" is a card
 * that says "Paralyzed" whether or not the condition will ever lift.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE EXCLUSIONS ARE THE HARD PART, AND THEY ARE NAMED WITH REASONS.
 *
 * Not every condition needs a clock on its effect, because some end by
 * other machinery. Counting those would have made this check cry wolf on
 * forty rows and be switched off within a week. Each exclusion below is
 * a rule somewhere else in the system, named so that a reader can go and
 * check it rather than trust this list.
 *
 * A SPELL THAT MEANS PERMANENT SAYS SO. Block 25 made `permanent` a
 * duration the parser reads, precisely so that "never expires" and
 * "nobody proofread this" stop being the same value — and this check is
 * what that distinction was for.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
// ONE MAP, TWO CENSUSES. See tools/lib/self-ending-conditions.mjs for
// why it left this file.
import { SELF_ENDING } from "./lib/self-ending-conditions.mjs";
import { declaresOwnDuration, parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import {
  CONDITION_SAVE_FLAG, ON_FAILURE, ON_SUCCESS, conditionSaveOutcome, normaliseConditionSave
} from "../module/magic/condition-save.mjs";
import { savableConditions } from "../module/magic/condition-save-workflow.mjs";
import {
  marginDurationText, parseRolledDuration, rolledDurationText, roundsFromMargin
} from "../module/magic/condition-timing-rules.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}


async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.push(value);
    }
  } finally {
    await db.close();
  }
  return out;
}
const spells = await spellsPack();
ok("A0 the spells pack could be read", spells !== null);

/* ================================================================== *
 * A. THE CENSUS
 * ================================================================== */

const unclocked = [];
for (const spell of spells ?? []) {
  const sys = spell.system ?? {};
  const spellDuration = parseSpellDuration(sys.duration);
  const spellBounded = Boolean(spellDuration
    && (spellDuration.rounds != null || spellDuration.seconds != null));
  // A SPELL THAT IS ITSELF PERMANENT gives its conditions that length on
  // purpose, and said so through the parser.
  if (spellDuration?.permanent) continue;

  for (const row of sys.effects ?? []) {
    if (row.kind !== "condition") continue;
    if (SELF_ENDING.has(row.condition)) continue;
    // A ROLLED LENGTH IS A LENGTH. See magic/condition-timing-rules.mjs.
    if (parseRolledDuration(row.durationRoll)) continue;
    // AND SO IS ONE SCALED FROM THE SAVE'S MARGIN.
    if (Number(row.roundsPerMargin) > 0) continue;
    /*
     * A CONDITION YOU CAN ROLL OUT OF EVERY TURN DOES END, and that is
     * the only kind of clock Petrification has: "the spell ends if the
     * creature is petrified or the slowed condition is removed" — a tug
     * of war with no printed length, which is the page's own design.
     *
     * COUNTED ONLY WHEN THE SAVE CAN ACTUALLY END IT. A save that merely
     * makes the condition worse, or one that shortens a duration the row
     * does not have, is not an exit — and the exclusion is written that
     * way so a spell cannot buy its way off this list with a save that
     * leads nowhere.
     */
    const escape = normaliseConditionSave({ ...row.conditionSave, condition: row.condition });
    if (escape && (escape.onSuccess === "end" || escape.onSuccess === "reduceValue")) continue;
    // AND ONE THE ESCAPE ACTION BREAKS (3.609.0, block 33's R1). Volcanic
    // Inferno's rock: "A trapped creature can attempt to Escape against your
    // spell DC". The row stamps that DC and the Escape action reads it, so
    // the condition has an exit even with no printed length. See
    // magic/encase.mjs.
    if (row.escape === true) continue;
    // AND ONE THAT ENDS WITH ANOTHER CONDITION THAT ENDS (3.613.0, R13).
    // Sickly Ray's "slowed 1 as long as it's sickened": the linked clock
    // (combat/linked-conditions-workflow.mjs) lifts it when the sickened
    // goes, and the sickened is shed by Retch. A link to a condition with no
    // exit of its own is no exit, so it stays on the list.
    if (row.endsWith && SELF_ENDING.has(String(row.endsWith))) continue;
    // ASKED OF THE ONE FUNCTION THAT DECIDES IT (3.590.0). This read
    // `row.duration ? ...` directly, which is a second answer to "does
    // this row declare a duration".
    //
    // IT IS NOT A BUG FIX, AND THE COMMENT THAT FIRST SAT HERE SAID IT
    // WAS. I claimed `declaresOwnDuration` refuses `"   "` where the
    // truthiness test accepts it and so let a whitespace duration off
    // this list. Both give null: `parseSpellDuration("   ")` finds no
    // number, no turn phrase and no "sustain", and returns null exactly
    // as the refusal does. The mutation written to prove the difference
    // survived, which is how the claim was caught. It is a consistency
    // change so that one function answers the question, and the honest
    // size of it is that.
    const own = declaresOwnDuration(row) ? parseSpellDuration(row.duration) : null;
    if (own?.permanent) continue;
    if (own && (own.rounds != null || own.seconds != null)) continue;
    if (spellBounded) continue;
    unclocked.push(`${spell.name} :: ${row.condition}${row.value ? ` ${row.value}` : ""}`
      + ` (${Array.isArray(row.onSave) && row.onSave.length ? row.onSave.join("/") : "UNGATED"})`);
  }
}

ok("A1 EVERY CONDITION A SPELL APPLIES CAN END",
  unclocked.length === 0,
  unclocked.length
    ? `${unclocked.length} with no clock:\n      ${unclocked.sort().join("\n      ")}`
    : "");

/*
 * A2 IS THE GUARD ON A1, and it is the half that matters most.
 *
 * A1 passes trivially if the exclusion list swallows everything, and an
 * exclusion list is exactly the kind of thing that grows quietly when a
 * check starts failing. So every name on it must be a condition the
 * registry actually has, and the list must not have grown without this
 * number being changed on purpose.
 */
ok("A2 every self-ending condition is a real one",
  [...SELF_ENDING.keys()].every((c) => Boolean(CONDITIONS[c])),
  [...SELF_ENDING.keys()].filter((c) => !CONDITIONS[c]).join(", "));
ok("A3 the exclusion list is the thirteen that were measured",
  SELF_ENDING.size === 13,
  `${SELF_ENDING.size} — an exclusion added without moving this number is a suppression`);
ok("A4 and every one of them gives its reason",
  [...SELF_ENDING.values()].every((why) => String(why).trim().length > 10),
  "an exception with no reason is a suppression");

/* ================================================================== *
 * B. PERMANENCE IS SAID, NOT INFERRED
 * ================================================================== */

const permanentRows = [];
for (const spell of spells ?? []) {
  for (const row of spell.system?.effects ?? []) {
    if (row.kind !== "condition") continue;
    if (parseSpellDuration(row.duration)?.permanent) permanentRows.push(`${spell.name} :: ${row.condition}`);
  }
}
ok("B1 the spells that mean permanent say so on the row",
  permanentRows.length >= 3,
  `${permanentRows.length}: ${permanentRows.sort().join(", ")}`);
ok("B2 and \"permanent\" is a duration the parser reads",
  parseSpellDuration("permanent")?.permanent === true
  && parseSpellDuration("permanant") === null,
  "the misspelling must still be unreadable");

/* ================================================================== *
 * C. A ROLLED LENGTH IS NOT THE DIE'S FACE
 * ================================================================== */

ok("C1 a dice duration no longer parses as a number",
  parseSpellDuration("1d4 minutes") === null && parseSpellDuration("3d6 rounds") === null,
  "it read the FOUR and the SIX — a confident wrong answer from a correctly written string");
ok("C2 and the rule reads it properly instead",
  parseRolledDuration("1d4 minutes")?.formula === "1d4"
  && parseRolledDuration("1d4 minutes")?.unit === "minute"
  && parseRolledDuration("3d6 rounds")?.unit === "round");
ok("C3 a rolled length rejoins the one duration reader",
  parseSpellDuration(rolledDurationText(3, "minute"))?.rounds === 30,
  "a second path to \"how long is this\" is a second answer waiting to disagree");
ok("C4 and never produces nothing",
  rolledDurationText(0, "round") === "1 round",
  "a 3d6 that came up 0 would otherwise be the permanence this release is about");
ok("C5 the two spells that need it declare it",
  ["Word Of Blinding", "Magnificent Dawn"].every((n) => (spells ?? [])
    .find((s) => s.name === n)?.system?.effects
    ?.some((e) => parseRolledDuration(e.durationRoll))));

/* ================================================================== *
 * D. A LENGTH FROM THE MARGIN
 * ================================================================== */

ok("D1 rounds scale by the failure, floored at one",
  roundsFromMargin(-7, 2) === 3 && roundsFromMargin(-21, 4) === 5
  && roundsFromMargin(-1, 2) === 1,
  "zero rounds is a condition applied and instantly gone — the spell doing nothing on a save it failed");
ok("D2 an unmeasured margin is refused, not read as zero",
  roundsFromMargin(null, 2) === null && roundsFromMargin(undefined, 2) === null,
  "Number(null) is 0 and 0 is finite");
ok("D3 and a nonsense step is refused",
  roundsFromMargin(-7, 0) === null);
ok("D4 its text rejoins the one duration reader too",
  parseSpellDuration(marginDurationText(roundsFromMargin(-7, 2)))?.rounds === 3);

/* ================================================================== *
 * E. A CONDITION YOU CAN SAVE OUT OF
 * ================================================================== */

{
  const hold = normaliseConditionSave({ save: "will", condition: "paralyzed",
    onSuccess: "shorten", amount: 1, label: "Hold Animal" });
  const dom = normaliseConditionSave({ save: "will", condition: "controlled",
    onSuccess: "end", label: "Dominate" });
  const pet = normaliseConditionSave({ save: "fortitude", condition: "slowed",
    onSuccess: "end", onFailure: "increaseValue", amount: 1, label: "Petrification" });

  ok("E1 the three printed shapes all normalise", Boolean(hold && dom && pet));
  /*
   * E1b IS THE BUG ITS OWN FIRST TEST RUN FOUND. The vocabulary is
   * camelCase and the matcher lowercased the input, so `increaseValue`
   * matched nothing and fell back to "none" — Petrification's entire
   * mechanism, silently absent.
   */
  ok("E1b a camelCase verb survives the matcher",
    pet?.onFailure === "increaseValue"
    && normaliseConditionSave({ save: "will", condition: "frightened",
      onSuccess: "reduceValue", label: "X" })?.onSuccess === "reduceValue",
    "lower(\"increaseValue\") is in no vocabulary, and the fallback was silent");
  ok("E2 a save out of nothing, or on an unknown save, is refused",
    normaliseConditionSave({ save: "will", onSuccess: "end" }) === null
    && normaliseConditionSave({ save: "luck", condition: "x", onSuccess: "end" }) === null
    && normaliseConditionSave({ save: "will", condition: "x", onSuccess: "explode" }) === null);
  ok("E3 a critical always ends it, whatever the spell's own success does",
    conditionSaveOutcome(hold, "critical").ends === true
    && conditionSaveOutcome(pet, "critical").ends === true,
    "Hold Animal prints that exception in as many words");
  ok("E3b and a heroic reads as a critical",
    conditionSaveOutcome(hold, "heroic").ends === true,
    "a degree better than the best one printed cannot be worse than it");
  ok("E4 shortening, ending and reducing stay three different verbs",
    conditionSaveOutcome(hold, "success").shortenRounds === 1
    && conditionSaveOutcome(hold, "success").ends === false
    && conditionSaveOutcome(dom, "success").ends === true,
    "paralyzed is unvalued — there is no number on it to lower");
  ok("E5 Petrification's failure makes it WORSE",
    conditionSaveOutcome(pet, "fumble").valueDelta === 1
    && conditionSaveOutcome(hold, "fumble").valueDelta === 0,
    "a mechanism built for escape alone would have needed a second one a page later");
  ok("E6 the vocabularies are the ones the pages print",
    ON_SUCCESS.length === 3 && ON_FAILURE.length === 2);
}
ok("E7 the spec rides the condition's own effect, read past disabled ones",
  savableConditions({ effects: [
    { disabled: false, getFlag: (s, f) => (f === CONDITION_SAVE_FLAG
      ? { save: "will", condition: "paralyzed", onSuccess: "shorten", saveDC: 20 } : null) },
    { disabled: true, getFlag: () => ({ save: "will", condition: "slowed", onSuccess: "end" }) }
  ] }).length === 1,
  "a suppressed condition must not keep asking its owner to roll");
ok("E8 and an actor carrying none answers cleanly",
  savableConditions(null).length === 0 && savableConditions({}).length === 0);
ok("E9 the four spells that print it declare it",
  ["Hold Animal", "Hold Kind", "Petrification"].every((n) => (spells ?? [])
    .find((s) => s.name === n)?.system?.effects
    ?.some((e) => normaliseConditionSave({ ...e.conditionSave, condition: e.condition }))),
  "Dominate's is a note until its own page is revisited");

/* ================================================================== *
 * F. THE SPELLS THE CENSUS FIXED
 * ================================================================== */

const rowsOf = (n) => (spells ?? []).find((s) => s.name === n)?.system?.effects ?? [];
const onDegree = (n, d) => rowsOf(n).filter((r) => r.kind === "condition"
  && Array.isArray(r.onSave) && r.onSave.includes(d));

ok("F1 Hold Animal and Hold Kind stun a success rather than paralyzing it",
  ["Hold Animal", "Hold Kind"].every((n) =>
    onDegree(n, "success").every((r) => r.condition === "stunned")
    && !onDegree(n, "success").some((r) => r.condition === "paralyzed")),
  "a creature that SUCCEEDED used to be paralyzed, permanently");
ok("F2 and their paralysis has the length its page prints",
  ["Hold Animal", "Hold Kind"].every((n) =>
    onDegree(n, "failure").some((r) => r.duration === "1 round")
    && onDegree(n, "fumble").some((r) => r.duration === "4 rounds")));
ok("F3 Sleep wakes its targets",
  onDegree("Sleep", "failure").some((r) => r.condition === "unconscious" && r.duration === "1 minute")
  && onDegree("Sleep", "fumble").some((r) => r.condition === "unconscious" && r.duration === "1 hour"));
ok("F4 Word Of Deafening's critical is one round, not for ever",
  onDegree("Word Of Deafening", "critical").some((r) => r.duration === "1 round"));
ok("F5 Ghoul Touch's three rungs are three different conditions",
  onDegree("Ghoul Touch", "success").some((r) => r.condition === "stunned")
  && onDegree("Ghoul Touch", "failure").some((r) => r.condition === "slowed" && r.duration === "1 minute")
  && onDegree("Ghoul Touch", "fumble").some((r) => r.condition === "paralyzed" && r.duration === "1 minute"));
ok("F6 Fear's fleeing lasts the round its page gives it",
  rowsOf("Fear").some((r) => r.condition === "fleeing" && r.duration === "1 round"));
ok("F7 and Fear's four frightened rungs were not disturbed",
  [1, 2, 3, 4].every((v) => rowsOf("Fear")
    .some((r) => r.condition === "frightened" && r.value === v)),
  "the census fixed the fleeing and nothing else on this spell");

/* ================================================================== */

process.stdout.write(failures.length
  ? `\nverify-condition-clocks: FAILED — ${failures.length} of ${checks}:\n  ${failures.join("\n  ")}\n`
  : `\nverify-condition-clocks: OK — ${checks} checks. Every condition a spell applies can end, and the ones that cannot say so.\n`);
process.exit(failures.length ? 1 : 0);
