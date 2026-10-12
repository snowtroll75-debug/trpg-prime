#!/usr/bin/env node
/**
 * verify-suppression — ignoring a point of a condition, and whether the
 * subtraction is REACHED by the penalties.
 *
 * NEW at 3.439.0, for Banish Fatigue and Confident Veil.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WHOLE SPELL IS A NUMBER GOING DOWN SOMEWHERE ELSE.
 *
 * There is no card to read, no die to roll, no token to move. Banish
 * Fatigue works if and only if a penalty that would have been -3 comes
 * out at -2. Every other visible sign — an effect on the sheet, a line
 * on the cast card, a flag with the right number in it — can be perfect
 * while the spell does nothing at all, which is 3.435.0's lesson aimed
 * at the quietest mechanism in the system.
 *
 * So section D does not stop at "the subtraction happens". It drives the
 * REAL `conditionModifiers` — the function the actor's derived data
 * calls — over a suppressed map and asks whether the penalty rows it
 * produces actually changed. That is the only claim here that would
 * still be true if every other one were faked.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `bodyOf` IS A BRACE WALK PAST THE PARAMETER LIST. Same reader as
 * verify-strike-riders, same reasons, and the same two defences: a claim
 * about `prepareConditions` must not be answerable by an import at the
 * top of actor.mjs, and every ordering claim is anchored on a call.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SUPPRESSION_FLAG, normaliseSuppression, normaliseSuppressionChoice,
  suppressedConditionValues, suppressionCastLine
} from "../module/conditions/suppression.mjs";
import { CONDITIONS, conditionModifiers } from "../module/conditions/registry.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const actorSrc = read("module", "documents", "actor.mjs");
const applier = read("module", "magic", "spell-effects.mjs");

const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  let cursor = start + signature.length - 1;
  if (src[cursor] === "(") {
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      if (src[cursor] === "(") parens += 1;
      else if (src[cursor] === ")") { parens -= 1; if (parens === 0) break; }
    }
  }
  const open = src.indexOf("{", cursor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return "";
}
function before(body, a, b) {
  const clean = strip(body);
  const i = clean.indexOf(a); const j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}
const has = (body, needle) => strip(body).includes(needle);

/* ================================================================== *
 * A. THE READER, BEFORE IT IS BELIEVED
 * ================================================================== */

const prepBody = bodyOf(actorSrc, "function prepareConditions(");
ok("A1 prepareConditions' body was found", prepBody.length > 0,
  "a renamed function must fail here, not silently stop being checked");
ok("A2 and it reaches the function's real code",
  // `resolveConditions(direct.keys(), { withhold })` since 3.577.0 (Smelling Salts).
  prepBody.includes("resolveConditions(direct.keys()") && prepBody.includes("conditionModifiers({"),
  "the parameter-list walk: a body that cannot see these is not this function's body");
ok("A3 the import at the top of actor.mjs is out of scope",
  !prepBody.includes('from "../conditions/suppression.mjs"'),
  "the import-position trap — the names are all in that import too");

/* ================================================================== *
 * B. WHAT A SUPPRESSION IS
 * ================================================================== */

ok("B1 a plain suppression normalises",
  normaliseSuppression({ condition: "fatigued", amount: 1 })?.amount === 1);
ok("B2 rubbish is refused",
  normaliseSuppression(null) === null && normaliseSuppression("fatigued") === null);
ok("B3 a suppression with no condition is refused",
  normaliseSuppression({ amount: 1 }) === null);
// A SUPPRESSION OF ZERO IS MALFORMED, not a no-op: it would be an effect
// on the sheet that changes nothing.
ok("B4 zero and negative amounts are refused",
  normaliseSuppression({ condition: "fatigued", amount: 0 }) === null
  && normaliseSuppression({ condition: "fatigued", amount: -2 }) === null
  && normaliseSuppression({ condition: "fatigued" }) === null);
ok("B5 the condition is lower-cased so authoring case cannot miss",
  normaliseSuppression({ condition: "Fatigued", amount: 1 })?.condition === "fatigued");
// THE ROUND TRIP. This spec is stored on the effect flag and read back on
// EVERY data preparation — far more often than a held bonus is read, and
// held-bonus.mjs is where this project learned what a non-idempotent
// normaliser costs.
const once = normaliseSuppression({ condition: "frightened", amount: 2, label: "Confident Veil" });
ok("B6 normalising a normalised spec returns the same spec",
  JSON.stringify(once) === JSON.stringify(normaliseSuppression(once)));

/* ================================================================== *
 * C. WHAT THE SUBTRACTION DOES
 * ================================================================== */

const spec1 = normaliseSuppression({ condition: "fatigued", amount: 1 });
const values = new Map([["fatigued", 3], ["frightened", 2]]);

ok("C1 it subtracts", suppressedConditionValues(values, [spec1]).get("fatigued") === 2);
ok("C2 and leaves other conditions alone",
  suppressedConditionValues(values, [spec1]).get("frightened") === 2);
ok("C3 it floors at zero",
  suppressedConditionValues(new Map([["fatigued", 1]]),
    [normaliseSuppression({ condition: "fatigued", amount: 4 })]).get("fatigued") === 0);
// IT LOWERS THE NUMBER; IT NEVER REMOVES THE CONDITION. A rule that asks
// `hasCondition` for a reason that is not a penalty must still find it.
ok("C4 a fully suppressed condition is still present",
  suppressedConditionValues(new Map([["fatigued", 1]]),
    [normaliseSuppression({ condition: "fatigued", amount: 1 })]).has("fatigued"),
  "you have the condition, you are ignoring its effect — not the same sentence");
// AND IT NEVER INVENTS ONE. A spell that ignores fatigue must not give
// its target fatigue.
ok("C5 suppressing a condition nobody has adds nothing",
  suppressedConditionValues(new Map(), [spec1]).size === 0);
ok("C6 the input map is not mutated",
  (() => { const m = new Map([["fatigued", 3]]); suppressedConditionValues(m, [spec1]); return m.get("fatigued") === 3; })(),
  "derived data runs constantly; a mutating read would compound every pass");
// HIGHEST APPLIES, NOT SUMMED — the ruling in the header.
ok("C7 two suppressions of one condition do not add",
  suppressedConditionValues(new Map([["fatigued", 4]]),
    [normaliseSuppression({ condition: "fatigued", amount: 1 }),
      normaliseSuppression({ condition: "fatigued", amount: 2 })]).get("fatigued") === 2,
  "two PP 1 spells must not ignore three points between them");
ok("C8 and the order they arrive in cannot change the answer",
  suppressedConditionValues(new Map([["fatigued", 4]]),
    [normaliseSuppression({ condition: "fatigued", amount: 2 }),
      normaliseSuppression({ condition: "fatigued", amount: 1 })]).get("fatigued") === 2);
ok("C9 no suppressions leaves the values as they were",
  suppressedConditionValues(values, []).get("fatigued") === 3
  && suppressedConditionValues(values, null).get("fatigued") === 3);

/* ================================================================== *
 * D. DOES IT REACH THE PENALTIES?  — the only claim that matters
 * ================================================================== *
 *
 * Driven through the REAL `conditionModifiers`, the function the actor's
 * derived data calls, with the same shape of arguments.
 */

const skillAbilities = { athletics: "strength", arcana: "intelligence" };
const rows = (map) => conditionModifiers({ values: map, skillAbilities });

const unsuppressed = rows(new Map([["fatigued", 3]]));
const suppressed = rows(suppressedConditionValues(new Map([["fatigued", 3]]), [spec1]));

ok("D0 the unsuppressed case produces real penalty rows", unsuppressed.length > 0,
  "without this every comparison below would be a comparison of two empty lists");
ok("D1 a suppressed condition penalises less",
  suppressed.every((r) => Math.abs(r.value) === 2) && unsuppressed.every((r) => Math.abs(r.value) === 3),
  `unsuppressed ${unsuppressed[0]?.value}, suppressed ${suppressed[0]?.value}`);
ok("D2 and it reaches every target the condition reached",
  suppressed.length === unsuppressed.length,
  "a suppression must lower the penalty, not remove rows from it");
// FULLY SUPPRESSED IS NO PENALTY AT ALL, because conditionModifiers
// pushes nothing for an amount of zero. This is the sentence Banish
// Fatigue is bought for.
const wiped = rows(suppressedConditionValues(new Map([["fatigued", 1]]), [spec1]));
ok("D3 ignoring the only point leaves no penalty at all", wiped.length === 0);
// AND THE CONDITION IS STILL THERE while that is true — the two halves
// of C4 and D3 together are the whole rule.
ok("D4 even though the creature still has the condition",
  suppressedConditionValues(new Map([["fatigued", 1]]), [spec1]).has("fatigued"));
// A CONDITION NOBODY SUPPRESSED IS UNTOUCHED, so a bug that subtracted
// from everything would fail here rather than look like a success.
const other = rows(suppressedConditionValues(new Map([["frightened", 2]]), [spec1]));
ok("D5 an unrelated condition still penalises in full",
  other.length > 0 && other.every((r) => Math.abs(r.value) === 2));

/* ================================================================== *
 * E. IS THE SUBTRACTION WIRED INTO DERIVED DATA?
 * ================================================================== */

/*
 * EVERY CLAIM HERE IS SCOPED TO THE STATEMENT IT IS ABOUT, and the
 * mutation runner is why. The first draft of this section asked four
 * things of the WHOLE function body and all four survived their
 * mutations:
 *
 *   - "a disabled effect suppresses nothing" searched the body for
 *     `if (effect.disabled) continue;` — and prepareConditions has TWO
 *     effect loops, so the guard in the first answered for the one
 *     deleted from the second. That is the 3.436.0 H7 shape exactly.
 *   - "the raw values are kept" searched for `rawValues,`, which is also
 *     a substring of the call two lines above it.
 *   - the two ordering claims stayed true when the mutation changed
 *     WHICH map was passed rather than moving anything.
 *
 * So the loop gets its own slice, and the two places the map is handed
 * on are matched as whole statements.
 */
const suppressLoop = (() => {
  const clean = strip(prepBody);
  const from = clean.indexOf("const suppressions = [];");
  const to = clean.indexOf("const values =");
  return from === -1 || to === -1 || to < from ? "" : clean.slice(from, to);
})();

ok("E0 the suppression loop was found on its own", suppressLoop.length > 0,
  "without its own slice, the loop above it answers every question asked here");
ok("E1 it collects suppressions from the actor's effects",
  suppressLoop.includes("normaliseSuppression(effect.flags?.[\"trg-prime\"]?.[SUPPRESSION_FLAG])"),
  "anchored on the CALL — the name is also in the import at the top of the file");
ok("E2 and a disabled effect suppresses nothing",
  suppressLoop.includes("if (effect.disabled) continue;"),
  "scoped to THIS loop: the condition loop above has a copy that would answer for it");
ok("E3 the effective values are the suppressed ones",
  has(prepBody, "const values = suppressedConditionValues(rawValues, suppressions);"));

// WHAT IS HANDED ON, not merely what order things appear in. A mutation
// that leaves the subtraction exactly where it is and passes the RAW map
// to the penalties is the 3.435.0 defect in its purest form: every
// visible sign correct, the spell dead.
ok("E4 the modifiers are built from the suppressed map",
  /conditionModifiers\(\{\s*values\s*,/.test(strip(prepBody)),
  "passing `values: rawValues` here would leave every other check green and the spell dead");
ok("E5 and the suppressed map is the one published for everything else",
  // RE-ANCHORED AT 3.621.0: `direct`, the conditions as applied (block 39's A3).
  has(prepBody, "actor._trgConditions = { effective, granted, values, rawValues, suppressions, direct };"),
  "getConditionValue reads that map, so the sheet and the maths must agree — "
  + "and this is matched as a whole statement so a swapped property cannot hide in it");
ok("E6 the raw values are published beside them under their own name",
  /_trgConditions = \{[^}]*\brawValues\b[^}]*\}/.test(strip(prepBody)),
  "a rule that wants what the character actually HAS must still be able to ask");
ok("E7 the subtraction happens before either of those",
  before(prepBody, "suppressedConditionValues(rawValues, suppressions)", "conditionModifiers({")
  && before(prepBody, "suppressedConditionValues(rawValues, suppressions)", "actor._trgConditions ="));

/* ================================================================== *
 * F. THE APPLIER
 * ================================================================== */

const caseBody = bodyOf(applier, 'case "suppress": {');
ok("F0 the applier has a suppress case", caseBody.length > 0);
ok("F1 a malformed suppression is refused out loud",
  has(caseBody, "if (!spec) {") && has(caseBody, "malformed suppression"));
ok("F2 a condition the registry does not know is refused out loud",
  has(caseBody, "if (!CONDITIONS[spec.condition]) {") && has(caseBody, "unknown condition"),
  "otherwise it subtracts from nothing, for ever, silently");
// RELAYED SINCE 3.474.0. The effect is still created on the target; it
// is asked of the GM when the target is not ours, after a live session
// found a player casting on another player's character refused by
// Foundry. The check asserts the CREATION, not one route to it.
ok("F3 the effect is created on the target",
  has(caseBody, 'createEffectsOn(target, [data])'));
ok("F4 under the flag prepareConditions reads",
  has(caseBody, "[SUPPRESSION_FLAG]: spec") && SUPPRESSION_FLAG === "conditionSuppression");
// THE CARD REPORTS BOTH SIDES, and reads the number rather than working
// it out — a second place deciding what a suppression is worth would be
// the place that does not know about highest-applies.
ok("F5 the card reads the value before and after rather than computing it",
  before(caseBody, "const before = Number(target.getConditionValue", "createEffectsOn")
  && has(caseBody, "const after = Number(target.getConditionValue"));

ok("F6 the cast line names the condition and the number",
  /1 point/.test(suppressionCastLine(spec1)) && /fatigued/.test(suppressionCastLine(spec1)));
ok("F7 and pluralises honestly",
  /2 points/.test(suppressionCastLine(normaliseSuppression({ condition: "fatigued", amount: 2 }))));

/* ================================================================== *
 * G. THE PACK
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && value?.type === "spell") spells.push(value);
  }
} finally { await db.close(); }

ok("G0 the spells pack was read", spells.length > 600, `only ${spells.length} found`);

const byName = Object.fromEntries(spells.map((s) => [s.name, s]));
const suppressRows = [];
for (const spell of spells) {
  for (const row of spell.system?.effects ?? []) {
    if (row?.kind === "suppress") suppressRows.push({ spell: spell.name, row });
  }
}
// G1 IS A CENSUS, AND IT MOVED AT 3.529.0: 2 → 3. Voice Of Healing's
// printed "may ignore up to -1 of the Dazed or Weakened condition for the
// duration" had lived in a `note` and done nothing; it is a real
// suppression row now. See verify-condition-suppression for the warps
// that swap and raise it.
// 3 → 6 at 3.587.0: Death Ward (a complete ignore of Doomed) and the two
// CHOICE rows, Delay Pain and Decursive Veil, which name their options
// instead of a condition.
ok("G1 six spells declare a suppression", suppressRows.length === 6,
  suppressRows.map((r) => r.spell).join(", "));

/*
 * A CHOICE ROW IS NOT A MALFORMED PLAIN ROW, and this check crashed
 * rather than failed when the first one was authored — `normaliseSuppression`
 * returned null and G3 read `.condition` off it. Recorded because the
 * crash is the useful part: a row shape the pack now contains and the
 * harness had never met reached an unguarded property read, which is the
 * same class of fault as the code it is checking.
 *
 * So the rows are split by shape and each shape is checked as itself.
 */
const choiceRows = suppressRows.filter(({ row }) => Array.isArray(row?.choices));
const plainRows = suppressRows.filter(({ row }) => !Array.isArray(row?.choices));

ok("G1b two of them are choices between options", choiceRows.length === 2,
  choiceRows.map((r) => r.spell).join(", "));
// EVERY ROW IN EVERY PACK, not the two this release wrote.
ok("G2 every plain suppression row normalises",
  plainRows.every(({ row }) => normaliseSuppression(row) !== null));
ok("G2b every choice row normalises",
  choiceRows.every(({ row }) => normaliseSuppressionChoice(row) !== null));
ok("G3 and every one names a condition the registry knows",
  plainRows.every(({ row }) => Boolean(CONDITIONS[normaliseSuppression(row).condition]))
  && choiceRows.every(({ row }) => normaliseSuppressionChoice(row).options
    .every((o) => Boolean(CONDITIONS[o.condition]))),
  "a typo here would subtract from nothing at a table");
// EVERY OPTION CARRIES ITS OWN AMOUNT, which is the whole reason the
// shape exists — Delay Pain grants ten of two conditions and five of a
// third, and a single row would have to be wrong about one of them.
ok("G3b Delay Pain's three options keep their own amounts",
  (() => {
    const spec = normaliseSuppressionChoice(
      byName["Delay Pain"]?.system.effects.find((e) => e.kind === "suppress"));
    if (!spec) return false;
    const by = Object.fromEntries(spec.options.map((o) => [o.condition, o.amount]));
    return by.dazed === 10 && by.weakened === 10 && by.injured === 5;
  })());
// A COMPLETE IGNORE IS NOT A LARGE NUMBER. Death Ward ignores Doomed
// outright, and Doomed has no printed maximum — see normaliseSuppression.
ok("G3c Death Ward ignores Doomed entirely rather than by a number",
  (() => {
    const row = byName["Death Ward"]?.system.effects.find((e) => e.kind === "suppress");
    const spec = normaliseSuppression(row);
    return Boolean(spec?.all) && spec.amount === Infinity && row.amount === undefined;
  })());
ok("G3d and a complete ignore actually zeroes the value",
  suppressedConditionValues(new Map([["doomed", 6]]),
    [normaliseSuppression({ condition: "doomed", all: true })]).get("doomed") === 0);
ok("G4 Banish Fatigue ignores a point of fatigue, on its target",
  byName["Banish Fatigue"]?.system.effects.some(
    (e) => e.kind === "suppress" && e.condition === "fatigued" && e.amount === 1 && e.target === "targets"));
ok("G5 Confident Veil ignores a point of frightened, on the caster",
  byName["Confident Veil"]?.system.effects.some(
    (e) => e.kind === "suppress" && e.condition === "frightened" && e.amount === 1 && e.target === "self"));
// THE CLAUSES THAT ARE NOT AUTOMATED MUST STILL BE PRINTED. Both spells
// carry a printed rule this mechanism deliberately does not implement,
// and dropping the note would turn "flagged" into "silently missing".
ok("G6 Confident Veil still prints its fumbled-fear-save clause",
  byName["Confident Veil"]?.system.effects.some((e) => e.kind === "note" && /fumble/i.test(e.text)));
// The note became a row at 3.611.0: the warp unlocks a fatigued relief.
ok("G7 Banish Fatigue's permanent removal is a row its warp unlocks",
  byName["Banish Fatigue"]?.system.effects.some((e) => e.kind === "conditionRelief" && e.unlockedBy === "permanent"));

/* ================================================================== *
 * H. SURGE OF THE TEMPEST'S REPAIR
 * ================================================================== */

const surge = byName["Surge Of The Tempest"]?.system ?? {};
ok("H1 the save is BASIC, so the damage scales by degree",
  /basic/i.test(surge.defence ?? ""),
  '"must make a basic Reflex save" — the word is what parseSpellDefence reads');
ok("H2 the damage is in the field the cast workflow rolls",
  surge.damage?.formula === "1d12" && surge.damage?.type === "electricity",
  "baseDamage is documented as being for warping and criticals, and nothing rolls it");
// THE TRAP THIS RELEASE CLOSED. `system.damage.persistent` is printed on
// EVERY degree with no gate, and this spell's persistent electricity is
// printed "in the event of a fumble". Filling the formula while leaving
// the field would have handed every target of every cast a point of
// persistent damage the spell does not grant.
ok("H3 the fumble-only persistent damage is NOT in the ungated field",
  !String(surge.damage?.persistent ?? "").trim(),
  "persistent damage has no degree gate; putting it back here re-opens the trap");
// RE-AIMED AT 3.613.0 (block 35's B2): the fumble's recurring electricity
// is a recurring CONDITION ROW now, gated on the fumble — applied rather
// than printed, and still nowhere near the ungated field H3 guards.
ok("H4 and it is applied on a fumble only, as a recurring condition",
  (surge.effects ?? []).some((e) => e.kind === "condition" && e.condition === "recurring"
    && e.damageType === "electricity" && JSON.stringify(e.onSave) === '["fumble"]'));
ok("H5 the dazzled half is gated on a fumble",
  (surge.effects ?? []).some(
    (e) => e.kind === "condition" && e.condition === "dazzled"
      && Array.isArray(e.onSave) && e.onSave.length === 1 && e.onSave[0] === "fumble"));
ok("H6 and dazzled is a condition the registry knows", Boolean(CONDITIONS.dazzled));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-suppression: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-suppression: OK — ${checks} checks. A suppression lowers the effective value, never `
  + `removes the condition, does not stack, and is REACHED by the real conditionModifiers.\n`);
