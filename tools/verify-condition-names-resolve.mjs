#!/usr/bin/env node
/**
 * verify-condition-names-resolve — a row that names a condition must name
 * one that exists.
 *
 * NEW at 3.488.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A HALF-APPLIED ROW IS WORSE THAN AN UNAPPLIED ONE.
 *
 * Critical row 87–88 read *"The target gains the Fascinated condition
 * towards you and is Injured 1."* `extractConditionTags` returned
 * `[{key:"injured"}]` — Injured 1 was applied, the fixation was not, and
 * the card looked exactly like a working card. Nobody could see the half
 * that was missing, because the half that worked was printed right next
 * to it.
 *
 * There is no FASCINATED condition in this system. Graham ruled on
 * 4 September 2026: **"Fascinated should be fixated"** — the same class of
 * ruling as the Grapple critical's "immobilised" on 23 August, and handled
 * the same way: the transcription is corrected in place and the ruling
 * lives in the check that defends it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PHRASE HAS THREE GRAMMATICAL ROLES AND ONLY ONE OF THEM APPLIES
 * ANYTHING.
 *
 * This is why the check is not simply "every 'the X condition' must
 * parse". Measured across every table this system transcribes, the phrase
 * appears in three distinct roles:
 *
 *   APPLIED      "the target gains the Fixated condition"
 *                "You have the undetected condition towards the target"
 *                → MUST parse. This is the row doing something.
 *
 *   DURATION     "is Injured 2 until the Stunned condition ends"
 *                → must NOT parse a second time. The condition was already
 *                  applied earlier in the same row ("Target is Stunned 2");
 *                  this mention is when it ends, not a second application.
 *
 *   PREREQUISITE "assistance to an adjacent creature with the Dying
 *                condition"
 *                → applies nothing to anyone. It says who may be targeted.
 *
 * A check that flagged all three would report two false positives on the
 * day it was written, and a check that cries wolf on its first run is a
 * check somebody turns off. So the discovery matcher is anchored on the
 * APPLYING VERBS, and section E holds the two excluded rows against it so
 * that the exclusion is tested by the real text rather than trusted from
 * this comment.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE EXCLUDED TWO DO NOT PARSE, WHICH IS NOT A BUG.
 *
 * Stunned and Dying are VALUED conditions, and `extractConditionTags`
 * matches a valued condition only with a number beside it. "the Stunned
 * condition" carries no number and so returns nothing — correctly, because
 * "Stunned" with no value is not an amount of Stunned. Section E asserts
 * this is the reason, so that a later change making bare valued conditions
 * parse has to come here and say so.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION R IS A RATCHET, NOT A PASS.
 *
 * Beyond the applying phrases there is a second, softer population: text
 * that NAMES a condition this system does not recognise without applying
 * it. Sweeping all 2,587 pack entries found exactly one — the alchemical
 * item **Dream Lichen**, *"doubles the amount of the Drained condition
 * they remove after a night's rest"*.
 *
 * Graham ruled on it the same day: Drained is the book's loose word for
 * Soul Drain — as the book's own SOUL DRAIN entry proves by using it
 * (*"Depending upon the source of your Drained condition…"*). The answer
 * went into `LABEL_ALIASES` in effect-parser.mjs rather than into a note
 * here, so that every reader of the text benefits, and the ratchet is
 * empty. It may only stay that way.
 *
 * WHAT THE RULING DOES NOT DO is automate Dream Lichen. The item's
 * clause doubles the nightly Soul Drain recovery that `soulDrainRecovery`
 * hard-codes at 5, and nothing reads the item — a separate gap, recorded
 * in the PP 1 plan rather than fixed here, because an alchemical item is
 * not the spell tier this work is in the middle of.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { extractConditionTags } from "../module/effect-parser.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * THE MATCHERS
 * ================================================================== */

/**
 * A row applying a condition by name.
 *
 * The verbs are the ones the transcribed text actually uses, gathered by
 * reading every occurrence rather than guessed: gain/gains/gaining, and
 * have/has (which is how "You have the undetected condition towards the
 * target" is written).
 */
const APPLYING = /\b(?:gains?|gaining|have|has)\s+the\s+([A-Za-z][A-Za-z-]*)\s+condition\b/gi;

/** Any mention at all, applying or not. */
const ANY_MENTION = /\bthe\s+([A-Za-z][A-Za-z-]*)\s+condition\b/gi;

/**
 * Does an APPLYING phrase naming this condition actually apply something?
 *
 * The parse, not the vocabulary — this is the test for section D, where
 * the question is whether the row does what it says. Every applying phrase
 * in the tables names a boolean condition, so a bare name is enough; an
 * applying phrase naming a VALUED condition with no number would fail
 * here, and should, because it would apply no amount of anything.
 */
const appliesCleanly = (name) => extractConditionTags(`gains the ${name} condition`).length > 0;

/**
 * Is this a word this system knows as a condition at all?
 *
 * The vocabulary, not the parse — this is the test for section R, and the
 * difference matters: "the Stunned condition" does not PARSE (Stunned is
 * valued and carries no number here) but Stunned is obviously a word this
 * system knows. Asking the parse question there flagged eight real
 * conditions as unknown vocabulary on the first run.
 *
 * ASKED OF THE PARSER, NOT OF A LIST BUILT HERE. The first version walked
 * the registry and assembled its own set of keys and labels — which meant
 * it could not see `LABEL_ALIASES`, and would have gone on reporting
 * "Drained" as unknown vocabulary on the day the alias was added. A check
 * holding its own copy of the vocabulary is a check that disagrees with
 * the thing it is checking.
 *
 * BOTH FORMS ARE TRIED because the parser reads valued and boolean
 * conditions by different routes: a valued one is only ever matched
 * beside a number, a boolean one only bare. A word is known if EITHER
 * route finds it.
 */
const isKnownName = (name) => extractConditionTags(`gains the ${name} condition`).length > 0
  || extractConditionTags(`gains ${name} 1`).length > 0;

/* ================================================================== *
 * D. THE TRANSCRIBED TABLES
 * ================================================================== */

const DATA_FILES = [
  "critical-tables.mjs", "fumble-tables.mjs", "spell-tables.mjs",
  "basic-actions.mjs", "skill-actions.mjs", "special-actions.mjs",
  "appendix-traits.mjs"
];

const applied = [];   // {file, name, phrase}
const mentioned = []; // every mention, any role
for (const file of DATA_FILES) {
  const source = read("module", "data", file);
  for (const m of source.matchAll(APPLYING)) applied.push({ file, name: m[1], phrase: m[0] });
  for (const m of source.matchAll(ANY_MENTION)) mentioned.push({ file, name: m[1], phrase: m[0] });
}

// D0 THE MATCHER REACHES THE TEXT. Asserted before anything is asserted
// ABOUT the text, because a discovery regex that matches nothing makes
// every check below vacuously true — which is exactly how
// `verify-checks-read-source` was sabotaged twice in two days, and how a
// blank read passes every assertion about its contents.
ok("D0 the applying matcher finds rows", applied.length >= 7,
  `found ${applied.length}; the transcribed tables carried 7 applying phrases when this was written`);
ok("D0b and the wider matcher finds more than the applying one",
  mentioned.length > applied.length,
  "if these are equal the duration and prerequisite rows have stopped being seen");

// D1 THE RULE. Every applied condition name resolves.
//
// THE FILTER IS NAMED so that D1b can run the SAME code path over a case
// whose answer is known. Testing `appliesCleanly` on its own would not do
// it: the way this check goes wrong is not that the predicate breaks, it
// is that the filter stops calling it and calls the VOCABULARY test
// instead — which accepts every real condition name, and so accepts
// "gains the Injured condition", a phrase that applies no amount of
// anything. A mutation doing exactly that survived until D1b existed.
const unresolvedIn = (rows) => rows.filter((a) => !appliesCleanly(a.name));

const unresolved = unresolvedIn(applied);
ok("D1 EVERY APPLIED CONDITION NAME RESOLVES", unresolved.length === 0,
  unresolved.map((u) => `${u.file}: "${u.phrase}" → nothing`).join("; "));

ok("D1b and the same filter rejects a bare valued name",
  unresolvedIn([{ name: "Injured" }]).length === 1
  && unresolvedIn([{ name: "Fixated" }]).length === 0,
  "the applying test must be the PARSE test, not the vocabulary test");

/* ================================================================== *
 * F. THE ROW GRAHAM RULED ON
 * ================================================================== */

const criticals = read("module", "data", "critical-tables.mjs");

/**
 * The whole effect string on disk that contains a marker phrase.
 *
 * THE ROW IS READ, NOT RETYPED. F2 and E1c used to parse a copy of the
 * row pasted into this file, which meant they went on passing after the
 * row in the data was changed underneath them — a mutation that stripped
 * "Stunned 2" out of the real row survived, because the check was still
 * happily parsing the copy. Asserting about a literal you typed yourself
 * is asserting about your own memory of the data.
 */
function rowContaining(source, marker) {
  const at = source.indexOf(marker);
  if (at === -1) return null;
  const open = source.lastIndexOf('"effect": "', at);
  if (open === -1) return null;
  const start = open + '"effect": "'.length;
  let end = start;
  while (end < source.length) {
    if (source[end] === "\\") { end += 2; continue; }
    if (source[end] === '"') break;
    end += 1;
  }
  return end > at ? source.slice(start, end) : null;
}

// F1 The correction is in the data. Anchored on the whole sentence rather
// than the word, so that "Fixated" appearing anywhere else in the file
// cannot satisfy it.
ok("F1 critical row 87–88 names Fixated",
  criticals.includes("The target gains the Fixated condition towards you and is Injured 1."),
  "Graham's ruling of 4 September 2026");
ok("F1b and the word it replaced is gone from the tables",
  !/Fascinated/i.test(criticals),
  "a second row carrying the old word would be a second silent half-effect");

// F2 THE BEHAVIOUR, not the spelling. The point of the ruling is that the
// row now applies TWO things.
const row = rowContaining(criticals, "smiling all the time");
ok("F2a the row was found on disk", Boolean(row),
  "read from the data, never retyped here — see rowContaining");
const tags = extractConditionTags(row ?? "");
ok("F2 the row parses to both halves",
  tags.length === 2
  && tags.some((t) => t.key === "fixated" && t.value === null)
  && tags.some((t) => t.key === "injured" && t.value === 1),
  `got ${JSON.stringify(tags)} — before the ruling this was [injured] alone`);

ok("F3 and Fixated is a real condition", Boolean(CONDITIONS.fixated),
  "the ruling names a condition the registry must actually carry");

/* ================================================================== *
 * E. THE TWO ROLES THAT ARE DELIBERATELY EXCLUDED
 *
 * Held against the real text, so deleting the exclusion breaks a check
 * rather than quietly widening the rule.
 * ================================================================== */

const skills = read("module", "data", "skill-actions.mjs");

ok("E1 the duration row still exists",
  criticals.includes("until the Stunned condition ends"));
ok("E1b and the applying matcher does not claim it",
  !applied.some((a) => a.phrase.includes("Stunned")),
  "\"until the Stunned condition ends\" is when it ends, not a second application");
const stunRow = rowContaining(criticals, "until the Stunned condition ends");
ok("E1c and that row DOES apply its Stun, with a value",
  Boolean(stunRow)
  && extractConditionTags(stunRow).some((t) => t.key === "stunned" && t.value === 2),
  "the exclusion is only safe because the row already applied the condition earlier — "
  + `row on disk: ${JSON.stringify(stunRow)}`);

ok("E2 the prerequisite row still exists",
  skills.includes("creature with the Dying condition"));
ok("E2b and the applying matcher does not claim it",
  !applied.some((a) => a.phrase.includes("Dying")),
  "\"a creature with the Dying condition\" says who may be targeted");

// E3 WHY those two do not resolve — the valued-condition rule. Asserted
// so a change that makes bare valued names parse must come here and
// re-decide the exclusion rather than silently invalidating it.
ok("E3 a bare valued condition name does not parse",
  CONDITIONS.stunned?.valued === true
  && extractConditionTags("the Stunned condition").length === 0,
  "if this ever passes, sections E1b/E2b are excluding rows that would now be checkable");
ok("E3b while a bare boolean one does",
  CONDITIONS.fixated?.valued === false
  && extractConditionTags("the Fixated condition").length === 1);

/* ================================================================== *
 * R. THE RATCHET — names mentioned but unrecognised, in any role
 * ================================================================== */

/**
 * Declared unrecognised names, with the evidence and what is owed.
 *
 * MAY ONLY SHRINK. A new name arriving here is a new piece of vocabulary
 * this system cannot read, and it is cheaper to answer on the day it
 * appears than to find it in a sweep months later.
 *
 * IT IS EMPTY, AND IT REACHED EMPTY THE DAY IT WAS WRITTEN. The one
 * entry it ever carried was "Drained" (pack:alchemical — Dream Lichen);
 * Graham ruled on 4 September 2026 that Drained is the book's loose word
 * for Soul Drain, and the answer went into `LABEL_ALIASES` in
 * effect-parser.mjs where every reader of the text can use it, rather
 * than into a note here. An empty ratchet is the point of a ratchet.
 */
const DECLARED = Object.freeze([]);

/**
 * "Condition" IS AN ORDINARY ENGLISH WORD, and the first run of this
 * check was reminded of it by three rows:
 *
 *   "add to the damage roll when the pack condition is met"
 *   "without speaking the password or triggering the set condition"
 *   "increase the amount condition ignored by 1 (max 5)"
 *
 * None of those name a game condition; two mean "circumstance" and the
 * third is garbled book text for "the amount THE condition is ignored by".
 *
 * THE DISCRIMINATOR IS CAPITALISATION, and it is not a guess: every
 * unrecognised game condition found by hand — Fascinated, Drained — is
 * written capitalised, and the only lowercase names in this position
 * (`undetected`, `flat-footed`) are ones the registry already knows. So a
 * capitalised unknown is a proper name this system cannot read; a
 * lowercase unknown is prose.
 *
 * That leaves a real gap: a lowercase unrecognised condition would be
 * read as prose. R4 closes it by holding the prose list itself to a
 * ratchet, so a NEW lowercase word cannot arrive unnoticed either — it
 * has to be looked at once and written down here.
 */
const PROSE = Object.freeze(["pack", "set", "amount"]);

const packsRoot = path.join(SYSTEM_ROOT, "packs");
const packNames = fs.readdirSync(packsRoot, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();

const unknownNames = new Map(); // capitalised unknown → Set(where)
const proseWords = new Map();   // lowercase unknown → Set(where)
let packEntries = 0;
let packMentions = 0;
for (const pack of packNames) {
  const db = new ClassicLevel(path.join(packsRoot, pack), { valueEncoding: "json" });
  try {
    await db.open();
    for await (const [, value] of db.iterator()) {
      if (!value || typeof value !== "object") continue;
      packEntries += 1;
      const text = JSON.stringify(value);
      for (const m of text.matchAll(ANY_MENTION)) {
        packMentions += 1;
        const word = m[1];
        if (isKnownName(word)) continue;
        const bucket = /^[A-Z]/.test(word) ? unknownNames : proseWords;
        const key = word.toLowerCase();
        if (!bucket.has(key)) bucket.set(key, new Set());
        bucket.get(key).add(`pack:${pack} — ${value.name ?? "?"}`);
      }
    }
  } catch (error) {
    failures.push(`R could not read pack ${pack} — ${error.message}`);
  } finally {
    await db.close().catch(() => {});
  }
}

/*
 * AND THE TABLES, THROUGH THE SAME BUCKETS.
 *
 * The first version of this section swept the packs alone, which left an
 * asymmetry worth naming: Fascinated was in a TABLE, and it was caught
 * only because it happened to sit behind an applying verb. A table row
 * naming an unknown condition in any other grammatical role — "while the
 * Bedazzled condition lasts" — would have passed both sections. The
 * vocabulary question is the same question wherever the text lives, so
 * it is asked of both surfaces through one pair of buckets.
 */
for (const { file, name } of mentioned) {
  packMentions += 1;
  if (isKnownName(name)) continue;
  const bucket = /^[A-Z]/.test(name) ? unknownNames : proseWords;
  const key = name.toLowerCase();
  if (!bucket.has(key)) bucket.set(key, new Set());
  bucket.get(key).add(`table:${file}`);
}

// R0 THE SWEEP REACHED THE PACKS. Same reason as D0: a pack loop that
// opened nothing would report a clean ratchet.
ok("R0 the pack sweep read entries", packEntries > 1000,
  `read ${packEntries} entries from ${packNames.length} packs`);
ok("R0b and found the phrase in them", packMentions >= 30,
  `${packMentions} mentions; a matcher that found none would make R1 and R4 vacuous`);
ok("R0c and recognised most of what it found",
  unknownNames.size + proseWords.size < packMentions,
  "if every mention were unknown the vocabulary test has stopped working");

const declaredNames = new Set(DECLARED.map((d) => d.name.toLowerCase()));
const undeclared = [...unknownNames.entries()].filter(([name]) => !declaredNames.has(name));

ok("R1 NO UNDECLARED UNRECOGNISED CONDITION NAME", undeclared.length === 0,
  undeclared.map(([n, where]) => `${n.toUpperCase()} (${[...where].join(", ")})`).join("; "));

ok("R2 the ratchet is empty and stays empty", DECLARED.length === 0,
  `${DECLARED.length} declared; it reached zero on 4 September 2026 and may only shrink`);

// R3 A DECLARED ENTRY IS STILL REAL. Vacuous while the ratchet is empty,
// and deliberately kept: the moment a name is added here it must be a
// name that is actually in the text, or the entry is a debt carried for
// nothing that would hide the day it is really paid.
ok("R3 every declared name is still in the packs",
  DECLARED.every((d) => unknownNames.has(d.name.toLowerCase())),
  "a declared entry whose text is gone should be deleted, not carried");

// R3b THE RULING ACTUALLY TOOK. Drained is the name the ratchet was
// created for, and it is now expected to READ — asserted through the
// parser, not by looking for the alias in the source, because the
// question is whether the text resolves and not whether a line exists.
const drained = extractConditionTags("Drained 3");
ok("R3b \"the Drained condition\" now reads as Soul Drain, AND NOTHING ELSE",
  drained.length === 1
  && drained[0].key === "soulDrain" && drained[0].value === 3
  && isKnownName("Drained"),
  "an alias that resolves to a second condition as well is a wrong answer that "
  + `contains a right one — got ${JSON.stringify(drained)}`);

// R4 THE PROSE LIST IS A RATCHET TOO. This is what stops the
// capitalisation discriminator from being a hole: a lowercase word this
// check decided to ignore has to have been looked at and written down.
const newProse = [...proseWords.keys()].filter((w) => !PROSE.includes(w));
ok("R4 no new ordinary-English use of \"the … condition\"", newProse.length === 0,
  newProse.map((w) => `"${w}" (${[...proseWords.get(w)].join(", ")}) `
    + `— if this is a condition name it belongs in DECLARED, if it is prose it belongs in PROSE`).join("; "));
ok("R4b and the prose list carries nothing stale",
  PROSE.every((w) => proseWords.has(w)),
  `declared prose not found: ${PROSE.filter((w) => !proseWords.has(w)).join(", ")}`);

if (failures.length) {
  process.stderr.write(`verify-condition-names-resolve: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-condition-names-resolve: OK — ${checks} checks. ${applied.length} applying phrases across `
  + `${DATA_FILES.length} tables all resolve; ${packEntries} pack entries carry `
  + `${DECLARED.length} declared unrecognised names and ${PROSE.length} declared prose words.\n`);
