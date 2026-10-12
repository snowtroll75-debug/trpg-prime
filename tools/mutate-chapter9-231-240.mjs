#!/usr/bin/env node
/**
 * mutate-chapter9-231-240 — can the pages 231-240 checks fail?
 *
 * NEW at 3.583.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECT FIRST, and it is one line. `applyPoisonConditions`
 * computed exactly the right list of conditions for a disease and then
 * wrote it only `if (poison)` — so every hand-written affliction's
 * stages were text on a card and nothing else. The first mutation below
 * puts that single condition back.
 *
 * Then incubation ignored, the clocks missing, the lock absent, and each
 * of Chapter 9's seven smaller rules, one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const AFF = at("afflictions.mjs");
const AFFWF = at("combat", "affliction-workflow.mjs");
const STUDY = at("magic", "daily-study.mjs");
const REP = at("magic", "repertoire.mjs");
const RANGE = at("magic", "spell-range.mjs");
const CASTING = at("magic", "casting.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const AVAIL = at("magic", "spell-availability.mjs");
const BOOK = at("magic", "spellbook-workflow.mjs");
const USESWF = at("uses-workflow.mjs");
const COUNTER = at("combat", "counteract-workflow.mjs");
const SCRIPT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const SOURCE = path.join(SYSTEM_ROOT, "tools", "afflictions.json");
const BUILD = path.join(SYSTEM_ROOT, "tools", "build-afflictions.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter9-231-240.mjs");

const MUTATIONS = [
  /* ── A: the data ───────────────────────────────────────────────── */
  { file: SOURCE, name: "A THE DEFECT: the three printed afflictions do not exist",
    from: '"name": "Filth Fever"', to: '"name": "Filth Fever ZZ"', breaks: "A1/A2" },
  { file: SOURCE, name: "A: Filth Fever's incubation drifts from the page",
    from: '"incubation": "1d4 hours"', to: '"incubation": "4 hours"', breaks: "A2c" },
  { file: SOURCE, name: "A: a stage loses one of its two conditions",
    from: '{ "key": "sickened", "value": 1 }, { "key": "slowed", "value": 1 }',
    to: '{ "key": "sickened", "value": 1 }', breaks: "A2g" },
  { file: SOURCE, name: "A: stage 1's 'No effect' quietly gains one",
    from: '{ "effect": "No effect", "interval": "1 day", "conditions": [] }',
    to: '{ "effect": "No effect", "interval": "1 day", "conditions": [{ "key": "sickened", "value": 1 }] }',
    breaks: "A2f" },
  { file: SOURCE, name: "A: a condition key stops resolving",
    from: '{ "key": "dazzled", "value": null }', to: '{ "key": "dazzed", "value": null }', breaks: "A5" },
  { file: SOURCE, name: "A: a valued condition loses its value",
    from: '{ "key": "fatigued", "value": 1 }', to: '{ "key": "fatigued", "value": null }', breaks: "A5b" },
  { file: SOURCE, name: "A: Lycanthropy stops being a curse",
    from: '"afflictionType": "curse"', to: '"afflictionType": "poison"', breaks: "A4" },
  { file: BUILD, name: "A: the built document drops the stages' conditions",
    from: "    conditions: s.conditions ?? [],", to: "    conditions: [],", breaks: "A6c" },
  { file: BUILD, name: "A: ids stop being stable, so a rebuild orphans every link",
    from: "  return crypto.createHash(\"sha1\").update(`trg-affliction:${name}`).digest(\"base64\")",
    to: "  return crypto.createHash(\"sha1\").update(`trg-affliction:${name}:${Math.random()}`).digest(\"base64\")",
    breaks: "A6d" },

  /* ── B: the stage ladder ───────────────────────────────────────── */
  { file: AFF, name: "B: a Critical reduces by one, not two",
    from: "  critical: -2,", to: "  critical: -1,", breaks: "B1" },
  { file: AFF, name: "B: a Fumble raises by one, not two",
    from: "  fumble: 2,", to: "  fumble: 1,", breaks: "B4" },
  { file: AFF, name: "B: below 1 no longer ends it",
    from: "  if (next < 1) return { stage: 0, ended: true };", to: "  if (next < 0) return { stage: 0, ended: true };",
    breaks: "B5" },
  { file: AFF, name: "B: beyond the maximum runs past the highest stage",
    from: "  return { stage: Math.min(next, cap), ended: false };", to: "  return { stage: next, ended: false };",
    breaks: "B6" },
  { file: AFF, name: "B: a fumbled exposure starts where a failure does",
    from: "      return { affected: true, startingStage: 2 };", to: "      return { affected: true, startingStage: 1 };",
    breaks: "B9" },

  /* ── C: the three clocks ───────────────────────────────────────── */
  { file: AFF, name: "C THE DEFECT: an unreadable span is treated as nothing at all",
    from: "  if (!match) return { kind: \"open\", reason: raw };",
    to: "  if (!match) return null;", breaks: "C3/C4" },
  { file: AFF, name: "C: a formula is rolled at parse time instead of by the caller",
    from: "    seconds: literal === null ? null : literal * UNIT_SECONDS[unit]",
    to: "    seconds: literal === null ? 3600 : literal * UNIT_SECONDS[unit]", breaks: "C2" },
  { file: AFF, name: "C: 'Instant' becomes an open span, so it never arrives",
    from: "  if (INSTANT_SPAN.test(raw)) return { kind: \"instant\" };", to: "", breaks: "C5" },
  { file: AFF, name: "C: a day drifts",
    from: "  day: 86400,", to: "  day: 43200,", breaks: "C7/C8" },
  { file: AFF, name: "C THE OLD MISTAKE: Number(null) is 0, and 0 is finite",
    from: "  if (at === null || at === undefined || at === \"\") return false;", to: "", breaks: "C9/C10" },
  { file: AFF, name: "C: a deadline rings a second early",
    from: "  return Number(worldTime) >= stamp;", to: "  return Number(worldTime) >= stamp - 1;", breaks: "C12" },

  /* ── D: what an affliction holds ───────────────────────────────── */
  { file: AFF, name: "D THE DEFECT: nothing holds a condition at all",
    from: "  if (!heldByAffliction) return { allowed: true, reason: \"\" };\n  if (fromRule) {",
    to: "  return { allowed: true, reason: \"\" };\n  if (fromRule) {", breaks: "D2" },
  { file: AFF, name: "D: a rule run by the GM slips through the sentence",
    from: "  if (fromRule) {", to: "  if (fromRule && !byGM) {", breaks: "D2" },
  { file: AFF, name: "D: R6's carve-out is lost, so no GM can ever lift it",
    from: "  if (byGM) return { allowed: true, reason: \"\" };", to: "", breaks: "D4" },
  { file: AFF, name: "D: a player may lift it too",
    from: "  return { allowed: false, reason: \"an affliction is holding it — page 232; only the GM can lift it\" };",
    to: "  return { allowed: true, reason: \"\" };", breaks: "D5" },

  /* ── E: bleed and recurring as a casting penalty ───────────────── */
  { file: CASTWF, name: "E THE DEFECT: bleed is not a casting penalty",
    from: "  if (bleeding) situational.push({ label: `Bleeding ${bleeding}`, value: -bleeding, type: \"circumstance\" });",
    to: "", breaks: "E3/E4" },
  { file: CASTWF, name: "E THE DEFECT: nor is recurring damage",
    from: "  if (recurring) situational.push({ label: `Recurring damage ${recurring}`, value: -recurring, type: \"circumstance\" });",
    to: "", breaks: "E2/E3" },
  { file: CASTWF, name: "E: the penalty is applied as a bonus",
    from: "value: -bleeding, type: \"circumstance\" });", to: "value: bleeding, type: \"circumstance\" });", breaks: "E3" },
  { file: CASTWF, name: "E: bleeding is asked of the dialog instead of the character",
    from: "  const bleeding = Math.max(0, Math.floor(Number(actor.getConditionValue?.(\"bleeding\") ?? 0)));",
    to: "  const bleeding = Math.max(0, Math.floor(Number(conditions.bleeding ?? 0)));", breaks: "E1" },

  /* ── F: the cantrip counteract ─────────────────────────────────── */
  { file: COUNTER, name: "F THE DEFECT: the acting value starts at 0 again",
    from: '<input id="trg-cc-acting" type="number" name="acting" value="${maxCastablePP}">',
    to: '<input id="trg-cc-acting" type="number" name="acting" value="0">', breaks: "F1" },
  { file: COUNTER, name: "F: the maximum is read from the character level, not the caster level",
    from: "  const maxCastablePP = maxPPPerCast(Number(actor.system?.magic?.casterLevelValue ?? 0));",
    to: "  const maxCastablePP = maxPPPerCast(Number(actor.system?.identity?.level ?? 0));", breaks: "F2" },
  { file: COUNTER, name: "F: the dialog stops explaining the number it filled in",
    from: "          page 236: \"cantrips … are always treated as the PP that you are able to",
    to: "          the acting value is set to", breaks: "F3" },
  { file: CASTING, name: "F: the cap is the caster level, without the +1",
    from: "  return Math.max(0, Math.floor(Number(casterLevel) || 0)) + 1;",
    to: "  return Math.max(0, Math.floor(Number(casterLevel) || 0));", breaks: "F4" },

  /* ── G: spell availability ─────────────────────────────────────── */
  { file: REP, name: "G THE DEFECT: every spell is Common, so nothing ever warns",
    from: "  return AVAILABILITY_TIERS.includes(raw) ? raw : \"common\";", to: "  return \"common\";", breaks: "G3" },
  { file: REP, name: "G: an unmarked Core spell starts warning",
    from: "  const tier = spellAvailabilityTier(spell);\n  if (tier === \"common\") return { tier, warn: false, said: \"\" };",
    to: "  const tier = spellAvailabilityTier(spell);", breaks: "G5" },
  { file: REP, name: "G: a tier the page does not name is accepted",
    from: "AVAILABILITY_TIERS = Object.freeze([\"common\", \"uncommon\", \"rare\"]);",
    to: "AVAILABILITY_TIERS = Object.freeze([\"common\", \"uncommon\", \"rare\", \"legendary\"]);",
    breaks: "G1/G4" },
  { file: REP, name: "G: the warning stops citing the page",
    from: "    said: `${name} is ${tier} — page 235: a spell from supplemental material is `",
    to: "    said: `${name} is ${tier}. A spell from supplemental material is `", breaks: "G7" },
  { file: BOOK, name: "G THE DEFECT: the pick says nothing about availability",
    from: "    ...(availability.warn ? [line(`<strong>Check with your GM:</strong> ${availability.said}`)] : []),",
    to: "", breaks: "G8" },

  /* ── H: the daily study ────────────────────────────────────────── */
  { file: STUDY, name: "H: an arcane caster's thirty minutes becomes an hour",
    from: "  arcane: 30,", to: "  arcane: 60,", breaks: "H1/H7" },
  { file: STUDY, name: "H: Divinity's hour of prayer shrinks",
    from: "  divinity: 60,", to: "  divinity: 30,", breaks: "H2/H7" },
  { file: STUDY, name: "H THE DEFECT: an Instinctive caster is charged for a library they do not keep",
    from: "  if (!learned || !minutes) return { owed: false, minutes: 0, doing: \"\", tradition: key };", to: "",
    breaks: "H5" },
  { file: STUDY, name: "H: prayer and communion become the same sentence",
    from: "  verdant: \"in quiet communion with nature\"", to: "  verdant: \"in prayer\"", breaks: "H6" },
  { file: STUDY, name: "H THE DEFECT: skipping the study costs nothing",
    from: "  if (!owed || studied) return { cantripsOnly: false, reason: \"\" };",
    to: "  return { cantripsOnly: false, reason: \"\" };", breaks: "H8" },
  { file: STUDY, name: "H: a caster who studied is limited anyway",
    from: "  if (!owed || studied) return { cantripsOnly: false, reason: \"\" };",
    to: "  if (!owed) return { cantripsOnly: false, reason: \"\" };", breaks: "H9" },
  { file: STUDY, name: "H: the card stops naming the consequence",
    from: "      + \"<strong>cantrips only today</strong> (page 235).\";", to: "      + \"(page 235).\";", breaks: "H11" },

  /* ── I: the unwilling touch ────────────────────────────────────── */
  { file: RANGE, name: "I THE DEFECT: an unwilling touch needs no roll",
    from: "  if (willing) return false;", to: "  return false;", breaks: "I1" },
  { file: RANGE, name: "I: an Attack spell is asked to hit twice",
    from: "  if (isAttackSpell) return false;", to: "", breaks: "I3" },
  { file: RANGE, name: "I: every spell becomes a touch spell",
    from: "  return /^\\s*touch\\s*$/i.test(String(rangeText ?? \"\"));", to: "  return true;", breaks: "I4" },
  { file: RANGE, name: "I: the touch misses on a tie",
    from: "  return { landed: av >= db, by: av - db };", to: "  return { landed: av > db, by: av - db };", breaks: "I5" },

  /* ── J: the optional harder Save DC ────────────────────────────── */
  { file: CASTING, name: "J: the audit's own guess comes back — Hard as +5",
    from: "  if (degreeKey === \"critical\") return DIFFICULTY_BY_KEY.hard.modifier;",
    to: "  if (degreeKey === \"critical\") return DIFFICULTY_BY_KEY.veryHard.modifier;", breaks: "J1" },
  { file: CASTING, name: "J: a Heroic steps the same as a Critical",
    from: "  if (degreeKey === \"heroic\") return DIFFICULTY_BY_KEY.veryHard.modifier;",
    to: "  if (degreeKey === \"heroic\") return DIFFICULTY_BY_KEY.hard.modifier;", breaks: "J2" },
  { file: CASTING, name: "J: a Success is stepped too",
    from: "  if (degreeKey === \"heroic\") return DIFFICULTY_BY_KEY.veryHard.modifier;\n  return 0;",
    to: "  if (degreeKey === \"heroic\") return DIFFICULTY_BY_KEY.veryHard.modifier;\n  return 2;", breaks: "J3" },
  { file: CASTING, name: "J THE DEFECT: the DC is raised and the PP saving is kept anyway",
    from: "  if (waiveSaving && (degree === \"critical\" || degree === \"heroic\")) degree = \"success\";", to: "",
    breaks: "J5/J7" },
  { file: CASTING, name: "J: only the Critical loses its saving, not the Heroic",
    from: "  if (waiveSaving && (degree === \"critical\" || degree === \"heroic\")) degree = \"success\";",
    to: "  if (waiveSaving && degree === \"critical\") degree = \"success\";", breaks: "J7" },
  { file: CASTING, name: "J: the rule fires even when the world has it switched off",
    from: "  if (waiveSaving && (degree === \"critical\" || degree === \"heroic\")) degree = \"success\";",
    to: "  if (degree === \"critical\" || degree === \"heroic\") degree = \"success\";", breaks: "J4/J6" },
  { file: CASTING, name: "J: Warp Manipulation's own trade is broken by it",
    from: "  let degree = waiveCritical && degreeKey === \"critical\" ? \"success\" : degreeKey;",
    to: "  let degree = degreeKey;", breaks: "J9" },

  /* ── K: the wiring ─────────────────────────────────────────────── */
  { file: AFFWF, name: "K THE DEFECT, IN ONE LINE: a disease's conditions are computed and discarded",
    from: "  if (item?.id && actor.items?.get?.(item.id)) await setRecord(item, { applied: record });",
    to: "  if (poisonOf(item) && item?.id && actor.items?.get?.(item.id)) await setRecord(item, { applied: record });",
    breaks: "K3" },
  { file: AFFWF, name: "K: a stage stops applying its conditions",
    from: "  lines.push(...await applyPoisonConditions(actor, item, entry));", to: "", breaks: "K2" },
  { file: AFFWF, name: "K: withdrawal looks in the poison flag again",
    from: "  const applied = recordOf(item).applied ?? [];", to: "  const applied = poisonOf(item)?.applied ?? [];",
    breaks: "K4" },
  { file: AFFWF, name: "K THE DEFECT: incubation is stamped nowhere, so it arrives at once",
    from: "    incubationEndsAt = Number(globalThis.game?.time?.worldTime ?? 0) + seconds;",
    to: "    incubationEndsAt = null;", breaks: "K5" },
  { file: AFFWF, name: "K: the sweep rolls a stage save for an affliction that has expired",
    from: "    if (deadlineDue(record.endsAt, worldTime)) {", to: "    if (false) {", breaks: "K7" },
  { file: AFFWF, name: "K: the lock repeats the rule instead of asking it",
    from: "      const verdict = conditionRemovalAllowed({", to: "      const verdict = ((x) => ({ allowed: false, reason: \"held\" }))({",
    breaks: "K8" },
  { file: AFFWF, name: "K: the affliction's own withdrawal is refused by its own lock",
    from: "    if (releasing) return true;", to: "", breaks: "K9" },
  { file: SCRIPT, name: "K THE DEFECT: the world clock never sweeps an affliction",
    from: "        for (const said of await sweepAfflictions(actor, worldTime)) {",
    to: "        for (const said of []) {", breaks: "K10" },
  { file: SCRIPT, name: "K: the sweep runs over every actor on every tick",
    from: "      if (hasAfflictions(actor)) {", to: "      if (true) {", breaks: "K11" },
  { file: SCRIPT, name: "K: the condition lock is never registered",
    from: "  registerAfflictionConditionLock();", to: "", breaks: "K12" },
  { file: AVAIL, name: "K: the cast gate stops asking the study rule",
    from: "    const limit = castingLimitToday({ owed: Number(stamp.minutes ?? 0) > 0, studied: stamp.studied !== false });",
    to: "    const limit = { cantripsOnly: false, reason: \"\" };", breaks: "K13" },
  { file: AVAIL, name: "K: last week's stamp locks a caster out of this morning",
    from: "    if (limit.cantripsOnly && since >= 0 && since < 86400) {", to: "    if (limit.cantripsOnly) {", breaks: "K14" },
  { file: USESWF, name: "K THE DEFECT: daily preparation charges no time",
    from: "  const studyRequired = dailyStudyRequired({", to: "  const studyRequired = ((x) => ({ owed: false, minutes: 0, doing: \"\" }))({",
    breaks: "K15" },
  { file: USESWF, name: "K THE DEFECT: the manual reminder comes back",
    from: "          line(studyLine)",
    to: "          line(\"<em>Reminder (GM judgement, not tracked): skipping daily preparation entirely limits you to cantrips only that day.</em>\")",
    breaks: "K17" },
  { file: CASTWF, name: "K: the optional rule never reaches the Save DC",
    from: "      + harderSaveDCStep\n", to: "      + 0\n", breaks: "K18" },
  { file: CASTWF, name: "K: the DC is raised and the saving kept",
    from: "    waiveSaving: harderSaveRule && harderSaveDCStep > 0", to: "    waiveSaving: false", breaks: "K19" },
  { file: CASTWF, name: "K: the unwilling touch is offered on every spell",
    from: "  const touchField = touchAttackRequired({ rangeText: spell?.system?.range, willing: false, isAttackSpell: isAttack })",
    to: "  const touchField = (true)", breaks: "K20" },
  // RE-ANCHORED at 3.598.0: the branch gained a fourth clause for Sanctuary's
  // deferred save, so the old anchor's closing bracket had moved. The rule is
  // unchanged — a missed touch still stops the spell.
  { file: CASTWF, name: "K: a missed touch lands the spell anyway",
    from: "&& saveDC != null && !touchMissed", to: "&& saveDC != null", breaks: "K21" },

  /* ── L: the live defects of 3.583.0 → 3.583.1 ──────────────────── */
  { file: AFFWF, name: "L THE LIVE DEFECT: the lock refuses the affliction's own stage change",
    from: "  releasing = true;\n  try {\n    const plan = conditionsToWithdraw(",
    to: "  try {\n    const plan = conditionsToWithdraw(", breaks: "L1" },
  { file: AFFWF, name: "L: the release flag is never put back, disabling the lock for the session",
    from: "    if (item?.id && actor.items?.get?.(item.id)) await setRecord(item, { applied: [] });\n  } finally {\n    releasing = false;",
    to: "    if (item?.id && actor.items?.get?.(item.id)) await setRecord(item, { applied: [] });\n  } finally {\n    void 0;", breaks: "L1b" },
  { file: AFFWF, name: "L THE LIVE DEFECT: the cure races the deletion on a pre-hook",
    from: "  Hooks.on(\"deleteItem\", async (item) => {", to: "  Hooks.on(\"preDeleteItem\", async (item) => {", breaks: "L2" },
  { file: STUDY, name: "L THE LIVE DEFECT: 'instinctive' is a word this file invented",
    from: "  const learned = LEARNED_STYLES.includes(String(style ?? \"\").trim().toLowerCase());",
    to: "  const learned = String(style ?? \"\").trim().toLowerCase() !== \"instinctive\";", breaks: "L4" },
  { file: STUDY, name: "L: a style nobody thought of owes an hour instead of nothing",
    from: "const LEARNED_STYLES = Object.freeze([\"book\", \"list\"]);",
    to: "const LEARNED_STYLES = Object.freeze([\"book\", \"list\", \"whatever\"]);", breaks: "L5" },
  { file: USESWF, name: "L: the call site goes back to patching the rule",
    from: "    style: memorisationContext(actor)?.style ?? \"\"",
    to: "    style: memorisationContext(actor)?.style ?? \"instinctive\"", breaks: "L6" }
];

/* ------------------------------------------------------------------ */

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const files = Array.from(new Set(MUTATIONS.map((m) => m.file)));
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

if (!run()) {
  console.error("mutate-chapter9-231-240: the check FAILS before any mutation.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

process.stdout.write(survived + unmatched
  ? `\nmutate-chapter9-231-240: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter9-231-240: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
