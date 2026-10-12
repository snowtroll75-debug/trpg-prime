#!/usr/bin/env node
/**
 * mutate-chapter7-critical-211-220 — can the pages 211-220 checks fail?
 *
 * NEW at 3.581.1. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back as it stood where one line
 * can put it back: a one-round condition that never expires, a rider
 * that outlives the bleed it was tied to, a target knocked out by a
 * sentence saying they are untouched, a light hit that kills by idiom,
 * three rows that spell Immobilized with a z, a PP drain that costs
 * nothing, a caster who can still cast, a save whose price is swept
 * into its own description, an escape nobody is offered, and a trigger
 * nobody watches.
 *
 * THEN THE TWO THIS BLOCK'S OWN LIVE DRIVE FOUND, before the harness
 * was written: a scoped "(D)" rolled on a column that says Fatal, and a
 * condition that lost its clock for the crime of having a successor.
 *
 * Then every new rule, one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const PARSER = at("effect-parser.mjs");
const DUR = at("combat", "critical-durations.mjs");
const RIDERS = at("combat", "critical-riders.mjs");
const LINKED = at("combat", "linked-conditions-workflow.mjs");
const WATCH = at("combat", "critical-ap-watch.mjs");
const CASTR = at("magic", "casting-restriction-workflow.mjs");
const APPLY = at("combat", "effect-application-workflow.mjs");
const ATTACKWF = at("combat", "attack-workflow.mjs");
const APWF = at("combat", "action-points-workflow.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter7-critical-211-220.mjs");

const MUTATIONS = [
  /* ── D1: the one-round durations ───────────────────────────────── */
  { file: PARSER, name: "D1 THE DEFECT: only the fumble tables' 'your' counts",
    from: "(?:your|their|its|his|her|the\\s+target'?s?)?\\s*next\\s+turn",
    to: "(?:your)?\\s*next\\s+turn", breaks: "A1/A6" },
  { file: PARSER, name: "D1: a one-round duration becomes two",
    from: "    return { autoExpires: true, rounds: 1 };",
    to: "    return { autoExpires: true, rounds: 2 };", breaks: "A4" },
  { file: DUR, name: "D1 THE DEFECT: no clause governs anything",
    from: "            governing.set(mention, clause.duration);", to: "", breaks: "B1/B4/B5" },
  { file: DUR, name: "D1: a clause reaches back over the sentence before it",
    from: "      let segmentStart = from;", to: "      let segmentStart = 0;", breaks: "B2" },
  { file: DUR, name: "D1: a clause governs what comes after it too",
    from: "          if (mention.index >= start && mention.index < clause.start) {",
    to: "          if (mention.index >= start) {", breaks: "B3" },
  { file: DUR, name: "D1: the first clause in a sentence wins instead of the nearest",
    from: "        segmentStart = clause.end;", to: "", breaks: "B4" },
  { file: DUR, name: "D1: bleeding loses its own clock and takes the text's",
    from: "      duration: SELF_TIMED_CONDITION_IDS.includes(mention.key)",
    to: "      duration: [].includes(mention.key)", breaks: "B7" },

  /* ── D2: until the bleeding stops ──────────────────────────────── */
  { file: DUR, name: "D2 THE DEFECT: nothing waits for another condition",
    from: "    const to = LINK_WORDS[String(match[1]).toLowerCase().replace(/\\s+/g, \" \")] ?? null;",
    to: "    const to = null;", breaks: "C1/C2/C3" },
  { file: DUR, name: "D2: 'until the damage ends' stops meaning recurring damage",
    from: "  damage: \"recurring\",", to: "  damage: \"bleeding\",", breaks: "C1" },
  { file: DUR, name: "D2: 'until bleed ends' is no longer recognised",
    from: "  bleed: \"bleeding\",", to: "", breaks: "C1/C2" },
  { file: LINKED, name: "D2 THE DEFECT: the link is never stamped",
    from: "      stamped.endsWith = duration.to;", to: "", breaks: "I2" },
  { file: LINKED, name: "D2: the cascade removes a rider whose condition is still there",
    from: "    ended.filter((key) => !actor.hasCondition?.(key))",
    to: "    ended", breaks: "I5" },
  { file: LINKED, name: "D2: the cascade removes everything, not only what was waiting",
    from: "    if (!link || !waiting.has(link)) continue;", to: "    if (!link) continue;", breaks: "I5" },
  { file: APPLY, name: "D2: the flag is written under a different name",
    from: "ENDS_WITH_FLAG = \"conditionEndsWith\";",
    to: "ENDS_WITH_FLAG = \"endsWith\";", breaks: "J3" },
  { file: LINKED, name: "D2: the cascade retypes the flag name instead of importing it",
    from: "    const link = effect.getFlag?.(SYSTEM_ID, ENDS_WITH_FLAG);",
    to: "    const link = effect.getFlag?.(SYSTEM_ID, \"conditionEndsWith\");", breaks: "J4" },
  { file: LINKED, name: "D2: the cascade looks the actor up by uuid again (F5/F6 all over)",
    from: "      const actor = effect?.parent;",
    to: "      const actor = game.actors.get(effect?.parent?.id);", breaks: "J5/J6" },
  { file: BOOT, name: "D2 THE DEFECT: the cascade is never registered",
    from: "  registerLinkedConditionHooks();", to: "", breaks: "J11" },

  /* ── D3 and R11: a condition as the price of a failed save ─────── */
  { file: PARSER, name: "D3 THE DEFECT: a consequence clause is applied up front",
    from: "  const spans = [];\n\n  for (const [from, to] of sentenceSpans(str)) {",
    to: "  const spans = [];\n  return spans;\n  for (const [from, to] of sentenceSpans(str)) {", breaks: "D1/D2/D8" },
  { file: PARSER, name: "D3: the marker alone is enough, so flavour becomes a consequence",
    from: "    const gate = sentence.match(SAVE_OR_CHECK);\n    if (!gate) continue;",
    to: "    const gate = { index: 0, 0: \"\" };", breaks: "D5" },
  { file: PARSER, name: "D3: the clause swallows the rest of the row",
    from: "    const and = rest.match(/\\s+and\\s+/i);", to: "    const and = null;", breaks: "D3" },
  { file: PARSER, name: "D3: the strip shortens the string and every index after it shifts",
    from: "    out = out.slice(0, span.start) + \" \".repeat(span.end - span.start) + out.slice(span.end);",
    to: "    out = out.slice(0, span.start) + out.slice(span.end);", breaks: "D6" },
  { file: PARSER, name: "D3: the threatened condition is dropped instead of handed on",
    from: "  return tagsFrom(spans.map((span) => span.text).join(\". \"));",
    to: "  return [];", breaks: "D2" },

  /* ── E: registry words used as English ─────────────────────────── */
  { file: PARSER, name: "E THE DEFECT: 'a dead arm' kills again",
    from: "  if (DETERMINER_BEFORE.test(before) && NOUN_AFTER.test(after)) return false;",
    to: "", breaks: "E1" },
  { file: PARSER, name: "E: 'broken breath' breaks the target again",
    from: "  if (NAMED_AS_CONDITION_ONLY.includes(key)) return NAMED_AS_CONDITION.test(after);",
    to: "", breaks: "E2/E3" },
  { file: PARSER, name: "E: or Broken stops resolving even when the book names it",
    from: "const NAMED_AS_CONDITION = /^\\s+condition\\b/i;",
    to: "const NAMED_AS_CONDITION = /^zzz$/i;", breaks: "E4" },
  { file: PARSER, name: "E: 'does not go unnoticed' applies Unnoticed again",
    from: "  if (NEGATED_BEFORE.test(before)) return false;", to: "", breaks: "E5" },
  { file: PARSER, name: "E: the literal test is asked of valued conditions too",
    from: "          if (!def.valued && !mentionIsLiteral(str, key, match.index, match[0].length)) continue;",
    to: "          if (!mentionIsLiteral(str, key, match.index, match[0].length)) continue;", breaks: "E6" },
  { file: PARSER, name: "E THE DEFECT: Immobilized with a z applies nothing",
    from: "  immobilised: [\"immobilized\"]", to: "  immobilised: []", breaks: "E7/E10" },
  { file: PARSER, name: "E: the mentions lose their positions",
    from: "  return out.sort((a, b) => a.index - b.index);", to: "  return out;", breaks: "E11" },

  /* ── F: one condition behind another ───────────────────────────── */
  { file: DUR, name: "F THE DEFECT: both conditions land at once",
    from: "    if (!after || !CONDITIONS[after]) continue;", to: "    continue;", breaks: "F1/F3/F4/F8" },
  { file: DUR, name: "F: 'and then falls prone' becomes a successor (the guard goes)",
    from: "    } else if (andThen && DEFERRED.test(sentence)) {",
    to: "    } else if (andThen) {", breaks: "F7/F8" },
  { file: DUR, name: "F: the successor is applied immediately as well",
    from: "  return (tags ?? []).filter((tag) => !deferred.has(tag.key));",
    to: "  return tags ?? [];", breaks: "F9" },
  { file: DUR, name: "F: a deferral stops being a segment boundary, so the minute lands on the wrong condition",
    from: "        const start = nearest.length ? Math.max(...nearest) : segmentStart;",
    to: "        const start = segmentStart;", breaks: "F6" },
  { file: DUR, name: "F: 'when the control ends' stops naming Controlled",
    from: "    if (cleaned.length >= 4 && (key.toLowerCase().startsWith(cleaned) || label.startsWith(cleaned))) {",
    to: "    if (false) {", breaks: "F10" },
  { file: DUR, name: "F: any word names a condition",
    from: "  const cleaned = String(word ?? \"\").trim().toLowerCase();\n  if (!cleaned) return null;",
    to: "  const cleaned = \"bleed\";", breaks: "F12" },

  /* ── G: a real-world span ──────────────────────────────────────── */
  { file: DUR, name: "G THE DEFECT: minutes and hours are prose again",
    from: "const SPAN_GLOBAL = /\\b(?:for|lasting)\\s+(\\d+d\\d+|\\d+)\\s*(minute|hour|day)s?\\b/gi;",
    to: "const SPAN_GLOBAL = /\\bzzz\\b/gi;", breaks: "G4/G6/G7" },
  { file: DUR, name: "G: a formula is averaged rather than rolled",
    from: "    if (/^\\d+$/.test(amount)) {", to: "    if (true) {", breaks: "G4" },
  { file: DUR, name: "G: a minute stops being ten rounds",
    from: "MINUTE_ROUNDS = 10;", to: "MINUTE_ROUNDS = 1;", breaks: "G1/F5" },
  { file: DUR, name: "G: an hour stops being an hour",
    from: "minute: 60, hour: 3600, day: 86400", to: "minute: 60, hour: 60, day: 86400", breaks: "G3" },
  { file: LINKED, name: "G: the world-time deadline is never stamped",
    from: "      stamped.expiresTime = now + seconds;", to: "", breaks: "I3" },
  { file: LINKED, name: "G: the world clock sweeps effects whose time has not come",
    from: "    if (Number(worldTime) < Number(end)) continue;", to: "", breaks: "I6" },
  { file: BOOT, name: "G THE DEFECT: nothing sweeps a critical's world-clock deadline",
    from: "      for (const label of await sweepWorldTimeConditions(actor, worldTime)) {",
    to: "      for (const label of []) {", breaks: "J10" },

  /* ── H: the six instructions ───────────────────────────────────── */
  { file: RIDERS, name: "H THE DEFECT: the PP drain costs nothing",
    from: "  const match = String(text ?? \"\").match(/\\bdrained\\s+of\\s+(\\d+)\\s*PP\\b/i);",
    to: "  const match = null;", breaks: "H1" },
  { file: RIDERS, name: "H: any 'Drained N' is read as a PP drain",
    from: "\\bdrained\\s+of\\s+(\\d+)\\s*PP\\b", to: "\\bdrained\\D*(\\d+)", breaks: "H3" },
  { file: RIDERS, name: "H THE DEFECT: the casting lockout does not exist",
    from: "  const spells = str.match(/\\bcannot\\s+cast\\s+spells?\\b/i);", to: "  const spells = null;", breaks: "H4" },
  { file: RIDERS, name: "H: the scoped (D) is not read off the clause",
    from: "    return { scope: \"spells\", index: spells.index, persistence: scoped ? scoped[1].toUpperCase() : null };",
    to: "    return { scope: \"spells\", index: spells.index, persistence: null };", breaks: "H5" },
  { file: RIDERS, name: "H: 'cannot speak' stops being a verbal lockout",
    from: "  const verbal = str.match(/\\bcannot\\s+(?:use\\s+verbal\\s+components|speak)\\b/i);",
    to: "  const verbal = str.match(/\\bcannot\\s+use\\s+verbal\\s+components\\b/i);", breaks: "H8" },
  { file: DUR, name: "H: a lockout's duration is looked for BEFORE it instead of after",
    from: "    .find((c) => c.start >= from && c.start < sentence[1]);",
    to: "    .find((c) => c.start < from);", breaks: "H7/H8" },
  { file: RIDERS, name: "H THE DEFECT: no Spell Concentration is demanded",
    from: "    /\\bspell\\s*casting\\s+requires\\s+a\\s+Spell\\s+Concentration\\s+success\\s+(?:(next|this)\\s+round)?/i);",
    to: "    /\\bzzz\\b/i);", breaks: "H9" },
  { file: RIDERS, name: "H THE DEFECT: the ice has no way out",
    from: "  const spend = str.match(/\\b(?:may\\s+)?spend\\s+(\\d+)\\s*AP\\s+each\\s+round\\s+(?:trying\\s+)?to\\s+([^.]+)/i);",
    to: "  const spend = null;", breaks: "H11" },
  { file: RIDERS, name: "H: the escape's DC is not read from the sentence after it",
    from: "  const dc = str.slice(spend.index).match(/\\bDC\\s+(\\d+)\\s+flat\\s+check\\b/i);",
    to: "  const dc = [\"\", \"20\"];", breaks: "H11" },
  { file: RIDERS, name: "H THE DEFECT: the save's AP price is swept into what it avoids",
    from: "  const cost = tail.match(/\\((\\d+)\\s*AP\\)/i);", to: "  const cost = null;", breaks: "H12" },
  { file: RIDERS, name: "H: 'to break the ice' is printed as 'to avoid break the ice'",
    from: "  const achieving = avoiding ? null : clause.match(/^to\\s+(.*)$/i);",
    to: "  const achieving = null;", breaks: "H12" },
  { file: RIDERS, name: "H: an avoiding save starts claiming to achieve something",
    from: "  const avoiding = clause.match(/^(?:to\\s+avoid\\s+|or\\s+be\\s+)(.*)$/i);",
    to: "  const avoiding = null;", breaks: "H13" },
  { file: RIDERS, name: "H THE DEFECT: nothing watches the exertion",
    from: "    /\\beach\\s+time\\s+the\\s+target\\s+spends\\s+more\\s+than\\s+(\\d+)\\s*AP\\s+in\\s+a\\s+round\\b[^.]*?\\bDC\\s+(\\d+)\\s+flat\\s+check\\b/i);",
    to: "    /\\bzzz\\b/i);", breaks: "H14" },
  { file: RIDERS, name: "H: a quiet row starts answering riders it was never given",
    from: "    ppDrain: powerPointDrain(effect),", to: "    ppDrain: 1,", breaks: "H16" },

  /* ── I: the stamping, and the wiring ───────────────────────────── */
  { file: APPLY, name: "I THE DEFECT: a tag's own clock is ignored",
    from: "    expiresRound: tag?.expiresRound !== undefined && tag?.expiresRound !== null",
    to: "    expiresRound: false", breaks: "I1" },
  { file: APPLY, name: "I: the per-tag clock is detected by truthiness, so round 0 is no round",
    from: "    expiresRound: tag?.expiresRound !== undefined && tag?.expiresRound !== null\n      ? tag.expiresRound\n      : expiresRound,",
    to: "    expiresRound: tag?.expiresRound ? tag.expiresRound : expiresRound,", breaks: "J13" },
  { file: APPLY, name: "I: a new rule stamps its deadline on somebody else's condition",
    // RE-ANCHORED 3.613.0: the end of the anchor moved to the source-traits
    // stamp (R14), which now sits between the timing and the update.
    from: "        ...(wasAlreadyPresent ? {} : {\n          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn\n        })\n      });\n      // WHAT PUT IT THERE (3.613.0, R14)",
    to: "        endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn\n      });\n      // WHAT PUT IT THERE (3.613.0, R14)",
    breaks: "I7" },
  { file: ATTACKWF, name: "I THE DEFECT: the critical path never reads the row's own words about time",
    from: "      const { stampRowDurations } = await import(\"./linked-conditions-workflow.mjs\");",
    to: "      const stampRowDurations = async (t) => ({ timed: [], plain: t, notes: [] });", breaks: "J12" },
  { file: ATTACKWF, name: "I: the qualifying armour clause's own duration is not read",
    from: "        `${row.effect} ${qualifying?.text ?? \"\"}`,", to: "        row.effect,", breaks: "J12" },
  { file: ATTACKWF, name: "I: a text-timed tag gets the Persistence clock behind it as well",
    from: "        applied.push(...await relayConditionTags(targetActor, textTimed, {}, () =>\n          applyConditionTags(targetActor, textTimed, {})));",
    to: "        applied.push(...await relayConditionTags(targetActor, textTimed, { expiresRound }, () =>\n          applyConditionTags(targetActor, textTimed, { expiresRound })));",
    breaks: "I4" },
  { file: APWF, name: "I THE DEFECT: nothing reports an action point leaving a pool",
    from: "    await checkApSpendWatch(actor, cost);", to: "", breaks: "J7" },
  { file: WATCH, name: "I: the watch fires at the threshold instead of above it",
    from: "  if (amount <= found.watch.threshold) return false;",
    to: "  if (amount < found.watch.threshold) return false;", breaks: "I8" },
  { file: WATCH, name: "I: a passed check applies the condition anyway",
    from: "  if (check?.outcome?.degree?.success) return false;", to: "", breaks: "I9" },
  { file: WATCH, name: "I: the watch is a status, so the target looks stricken before anything happened",
    from: "    changes: [],\n    flags: { [SYSTEM_ID]: { [AP_WATCH_FLAG]: payload } }",
    to: "    statuses: [\"unconscious\"],\n    changes: [],\n    flags: { [SYSTEM_ID]: { [AP_WATCH_FLAG]: payload } }",
    breaks: "I10" },
  { file: CASTWF, name: "I THE DEFECT: the casting lockout is not honoured",
    from: "    if (refusal.blocked && !drunkPotion) {", to: "    if (false) {", breaks: "J8" },
  { file: CASTR, name: "I: a verbal lockout blocks every spell, not only verbal ones",
    from: "  if (scopes.includes(\"verbal\") && spellData?.components?.verbal && !isInnate) {",
    to: "  if (scopes.includes(\"verbal\")) {", breaks: "I11" },
  { file: CASTR, name: "I: a total lockout becomes a concentration prompt",
    from: "  if (scopes.includes(\"spells\")) {", to: "  if (false) {", breaks: "I12" },

  /* ── K: the two defects this block's live drive found ──────────── */
  { file: ATTACKWF, name: "K THE LIVE DEFECT: the scoped (D) reads the column, which says Fatal",
    from: "          ? injuryDurationFormula(severity)", to: "          ? persistenceInfo.rollFormula", breaks: "K2" },
  { file: LINKED, name: "K THE LIVE DEFECT: a successor alone costs a condition its clock",
    from: "    if (!duration) {\n      plain.push(followOn ? { ...tag, followOn } : tag);",
    to: "    if (!duration && !followOn) {\n      plain.push(tag);", breaks: "K3" },
  { file: DUR, name: "K: the carve-out is copied rather than imported",
    from: "import { SELF_TIMED_CONDITION_IDS } from \"../injuries.mjs\";",
    to: "const SELF_TIMED_CONDITION_IDS = [\"bleeding\", \"recurring\", \"sickened\"];", breaks: "J14" }
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
  console.error("mutate-chapter7-critical-211-220: the check FAILS before any mutation.");
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
  ? `\nmutate-chapter7-critical-211-220: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter7-critical-211-220: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
