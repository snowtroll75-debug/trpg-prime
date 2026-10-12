#!/usr/bin/env node
/**
 * verify-basic-save — what the word "basic" in a save line buys.
 *
 * NEW at 3.440.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 29 August 2026, quoted so it can be argued with:
 *
 *   "Any spell which has the word Basic in its save line increases
 *    damage on save adding a die of base damage per save tier failure
 *    (so Minor +1 die, serious +2 die and deadly +3 die). This also
 *    triggers a critical if the save line has the wording. Spells with
 *    a save type without the word basic rely purely on their
 *    description to determine results."
 *
 * The system already did all of this. THAT IS EXACTLY WHY THIS FILE
 * EXISTS. `basicSavingThrow` was named in no harness file at all — the
 * whole ladder was correct and entirely unpinned, so any edit to it
 * would have gone unreported, and "it already works" was a claim from
 * reading rather than from measurement. This project's own history says
 * what that is worth: 3.408.0's census exists because "PP 0 is finished"
 * came from remembering the work rather than measuring the pack.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE LADDER, NOT TWO. The failure bands are `criticalSeverity`'s own —
 * the same 5 / 15 / 25 thresholds an attack's critical uses — reached
 * through that function rather than copied. Section C drives BOTH and
 * compares them, so a future edit to either cannot quietly disagree.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WORD IS THE GATE, and section D is about that and nothing else.
 * A save line without "basic" must buy none of this: no scaling, no
 * bonus dice, no critical. `parseSpellDefence` reads /basic/ out of the
 * printed string, and `resolveSpellSave` puts the entire ladder behind
 * `if (isBasic)`.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { basicSavingThrow } from "../module/dice/resolution.mjs";
import { criticalSeverity } from "../module/combat/attack.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
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
const has = (body, needle) => strip(body).includes(needle);

/* ================================================================== *
 * A. THE READER
 * ================================================================== */

const saveBody = bodyOf(cast, "async function resolveSpellSave(");
const parseBody = bodyOf(cast, "function parseSpellDefence(");
ok("A1 both function bodies were found", saveBody.length > 0 && parseBody.length > 0);
ok("A2 and the save body reaches its real code",
  saveBody.includes("basicSavingThrow(degreeKey, margin)"),
  "a body that cannot see the ladder is not this function's body");
ok("A3 the two bodies do not overlap",
  !parseBody.includes("basicSavingThrow("),
  "bodyOf ran past a closing brace and is reading the rest of the file");

/* ================================================================== *
 * B. THE LADDER — driven, one row per printed sentence
 * ================================================================== */

const none = (d, m = null) => {
  const r = basicSavingThrow(d, m);
  return r.bonusBaseDamage === 0 && r.criticalSeverity === null;
};

ok("B1 a critical save takes nothing",
  basicSavingThrow("critical", 12).damageMultiplier === 0 && none("critical", 12));
ok("B2 a heroic save takes nothing either",
  basicSavingThrow("heroic", 30).damageMultiplier === 0 && none("heroic", 30),
  "heroic is a better critical, and a better degree is never weaker");
ok("B3 a success takes half", basicSavingThrow("success", 4).damageMultiplier === 0.5 && none("success", 4));
ok("B4 a partial takes full", basicSavingThrow("partial", -2).damageMultiplier === 1 && none("partial", -2));

// "A DIE OF BASE DAMAGE PER SAVE TIER FAILURE" — the three tiers, at the
// bottom, middle and top of each band, so a boundary error shows up.
ok("B5 failing by 5 is minor: +1 die and a minor critical",
  basicSavingThrow("failure", -5).bonusBaseDamage === 1
  && basicSavingThrow("failure", -5).criticalSeverity === "minor");
ok("B6 failing by 14 is still minor",
  basicSavingThrow("failure", -14).bonusBaseDamage === 1
  && basicSavingThrow("failure", -14).criticalSeverity === "minor");
ok("B7 failing by 15 is serious: +2 dice",
  basicSavingThrow("failure", -15).bonusBaseDamage === 2
  && basicSavingThrow("failure", -15).criticalSeverity === "serious");
ok("B8 failing by 24 is still serious",
  basicSavingThrow("failure", -24).bonusBaseDamage === 2);
ok("B9 failing by 25 is deadly: +3 dice",
  basicSavingThrow("failure", -25).bonusBaseDamage === 3
  && basicSavingThrow("failure", -25).criticalSeverity === "deadly");
ok("B10 and deeper still is deadly, not a fourth tier",
  basicSavingThrow("failure", -100).bonusBaseDamage === 3
  && basicSavingThrow("failure", -100).criticalSeverity === "deadly",
  "the ruling names three tiers; a fourth would be invented");

// A FAILURE THAT REACHES NO TIER TAKES FULL DAMAGE AND NOTHING MORE.
// Below 5 there is no critical band, so there is no die and no critical
// — the failure is bad, not catastrophic.
ok("B11 failing by 4 is full damage and no more",
  basicSavingThrow("failure", -4).damageMultiplier === 1 && none("failure", -4));
ok("B12 a fumble and a blunder walk the same ladder",
  basicSavingThrow("fumble", -14).bonusBaseDamage === 1
  && basicSavingThrow("blunder", -25).bonusBaseDamage === 3,
  "they are worse failures, not different rules");
// A MARGIN NOBODY SUPPLIED MUST NOT INVENT A TIER.
ok("B13 a missing margin buys no dice and no critical",
  basicSavingThrow("failure", null).damageMultiplier === 1 && none("failure", null));
ok("B14 an unknown degree takes full damage and no more",
  basicSavingThrow("nonsense", -30).damageMultiplier === 1 && none("nonsense", -30),
  "the safe direction: full damage, never a free critical");

/* ================================================================== *
 * C. ONE LADDER, NOT TWO
 * ================================================================== */

let agree = true;
for (let failedBy = 0; failedBy <= 40; failedBy += 1) {
  const save = basicSavingThrow("failure", -failedBy);
  const attack = criticalSeverity(failedBy);
  if (save.bonusBaseDamage !== (attack?.bonusDice ?? 0)) agree = false;
  if (save.criticalSeverity !== (attack?.severity ?? null)) agree = false;
}
ok("C1 the save's tiers ARE the attack's critical bands, at every margin 0-40", agree,
  "a copied ladder is two places deciding one question, and they drift");

/* ================================================================== *
 * D. THE WORD IS THE GATE
 * ================================================================== */

ok("D1 the word 'basic' is what parseSpellDefence reads",
  has(parseBody, "basic: /\\bbasic\\b/i.test(s)"),
  "the ruling turns on one printed word, so this is the line it turns on");
ok("D2 and the ladder is behind it",
  has(saveBody, "const isBasic = parsed.basic && Boolean(damageFormula);")
  && has(saveBody, "if (isBasic) {"));
// "SPELLS WITH A SAVE TYPE WITHOUT THE WORD BASIC RELY PURELY ON THEIR
// DESCRIPTION." So the else branch must apply no damage at all — no
// scaling, no bonus dice, no critical.
/*
 * THE ELSE BLOCK, BRACE-MATCHED — not "everything after `} else {`".
 * The first draft sliced to the end of the function and swept up the
 * code that runs AFTER the if/else for every target, so it reported the
 * non-basic branch as doing things it does not do. Two checks failed on
 * a reader that was reading the wrong region, which is the good
 * direction to fail in and the reason this comment is here.
 */
const elseBranch = (() => {
  const clean = strip(saveBody);
  const i = clean.indexOf("} else {");
  if (i === -1) return "";
  const open = clean.indexOf("{", i + 1);
  let depth = 0;
  for (let j = open; j < clean.length; j += 1) {
    if (clean[j] === "{") depth += 1;
    else if (clean[j] === "}") { depth -= 1; if (depth === 0) return clean.slice(open, j + 1); }
  }
  return "";
})();
ok("D3 the non-basic branch was found, and only it",
  elseBranch.length > 0 && !elseBranch.includes("if (isBasic)"),
  "a slice that ran to the end of the function would report code the branch never reaches");
ok("D4 and it applies no damage of its own",
  !elseBranch.includes("basicSavingThrow(") && !elseBranch.includes("applyDamageAndCheckDying("),
  "a non-basic save must rely purely on the spell's description");
ok("D5 nor rolls a critical injury",
  !elseBranch.includes("rollCriticalInjury("),
  '"this also triggers a critical IF the save line has the wording"');

/* ================================================================== *
 * E. WHAT THE BASIC BRANCH ACTUALLY DOES WITH THE TIER
 * ================================================================== */

/*
 * RE-ANCHORED AT 3.585.1, and the rule they pin is now MORE true.
 *
 * These quoted the old line, which rolled `bs.bonusBaseDamage` dice at
 * the die size of the DAMAGE formula. Their own stated intent was "a
 * die of BASE DAMAGE per save tier failure" — and the Base Damage entry
 * is a field of its own that the formula only happened to agree with.
 * Graham's ruling of 23 September 2026 on page 247 moved the source to
 * that field, which also stops the 20 damaging spells printing no Base
 * Damage from collecting bonus dice the page denies them.
 */
ok("E1 the bonus dice come from the spell's own BASE DAMAGE entry",
  has(saveBody, "criticalBonusDamage(spell.system, bs.criticalSeverity, bs.bonusBaseDamage)"),
  '"a die of BASE DAMAGE per save tier failure" — the printed entry, not the damage formula');
ok("E2 and only when that entry yields dice to roll",
  has(saveBody, "if (saveCrit) {"),
  "a spell with no Base Damage entry adds nothing on a failed save");
ok("E3 the damage is scaled by the multiplier before the dice are added",
  /amount = Math\.floor\(baseDamage \* bs\.damageMultiplier\)/.test(strip(saveBody))
  && strip(saveBody).indexOf("bs.damageMultiplier") < strip(saveBody).indexOf("bs.bonusBaseDamage"),
  "halving AFTER adding the tier dice would halve the punishment for failing badly");
ok("E4 a reached tier lands a real critical injury",
  has(saveBody, "if (bs.criticalSeverity && !packet.immune) {")
  && has(saveBody, "rollCriticalInjury(actor, {"),
  '"this also triggers a critical"');
/*
 * E5 IS PINNED TO THE PRIMARY PACKET'S OWN BLOCK (3.591.0). It used to
 * grep for the bare line, and 3.591.0 gave that line a twin: a spell
 * with two damage pools under one save applies a second packet with the
 * same flag. A mutation that blanked the PRIMARY packet's flag was then
 * satisfied by the SECONDARY one \u2014 a check answered by an unrelated
 * occurrence, which is how E5 passed on a tree where a basic save's own
 * critical had stopped being marked.
 */
ok("E5 and the damage packet is marked critical when one was reached",
  has(saveBody, `if (packet.taken > 0) {
        const applied = await applyDamageAndCheckDying(target, packet.taken, {
          isCritical: Boolean(bs.criticalSeverity)`));
ok("E5b AND SO IS THE SECOND POOL'S, when a spell rolls two",
  has(saveBody, `if (secondPacket && secondPacket.taken > 0) {
        const appliedSecond = await applyDamageAndCheckDying(target, secondPacket.taken, {
          isCritical: Boolean(bs.criticalSeverity)`),
  "Meteor Swarm's fire half is as critical as its bludgeoning half \u2014 one save, one degree");
// AND IT IS STILL RESOLVED AGAINST DEFENCES. A tier die that skipped
// resistance would make failing a save the way to bypass immunity.
/*
 * PINNED TO THE BASIC BRANCH'S OWN LINE AT 3.585.0.
 *
 * This asked whether `resolveAgainstDefences(target.system ?? {}, {`
 * appeared ANYWHERE in `resolveSpellSave`. When R12 added a second
 * branch for spells that print their own four outcomes, that branch
 * resolved against defences too — and the check went on passing with
 * the BASIC path's resolution entirely gutted. `mutate-basic-save`
 * caught it the same day.
 *
 * The shape is one this project keeps finding: a check that a name
 * appears somewhere, satisfied by an unrelated occurrence of it. The
 * two branches name their packets differently, so the check can now say
 * which one it means.
 */
ok("E6 the whole amount still meets the target's defences",
  has(saveBody, "const packet = resolveAgainstDefences(target.system ?? {}, {"));

/* ================================================================== *
 * F. THE PACK USES THE WORD ON PURPOSE
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

ok("F0 the spells pack was read", spells.length > 600, `only ${spells.length} found`);

const basicSpells = spells.filter((s) => /\bbasic\b/i.test(String(s.system?.defence ?? "")));
ok("F1 the word is in use across the pack", basicSpells.length > 50,
  `${basicSpells.length} spells carry a basic save`);
/*
 * A BASIC SAVE WITH NOTHING TO SCALE IS THE WORD DOING NOTHING.
 *
 * `isBasic` is `parsed.basic && Boolean(damageFormula)`, so a spell that
 * prints "Basic" and carries no `damage.formula` gets none of the
 * ladder: no halving on a success, no tier dice, no critical. The save
 * line promises a rule the spell cannot reach.
 *
 * FOUND BY THIS CHECK on 29 August 2026 — four of them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND I DESCRIBED THEM WRONGLY FOR THREE DAYS. This block used to say
 * their damage was "stranded in `baseDamage`", as though the number were
 * sitting in the wrong field. It is not. `baseDamage` is the PER-DIE
 * BASE that Empower Spell and the warping options multiply, and it is
 * doing its job. The spell's actual damage was in its PRINTED
 * DESCRIPTION, in a rulebook attached to the thread that I had not read.
 *
 * Graham, 1 September 2026: "Vampiric Touch inflicts 6d6 points of
 * essence damage (again look at the rulebook)."
 *
 * TWO OF THE FOUR ARE NOW FIXED because he supplied the text — Vampiric
 * Touch (6d6 essence) and Draining Burst (20d8), both at 3.451.0. The
 * two that remain are not missing a number; they need a MECHANISM that
 * does not exist yet, and each now says which.
 *
 * A RATCHET, NOT A FAILURE. The list may only SHRINK: a fifth spell
 * fails this check immediately, and each name carries what is actually
 * wrong so none is quietly forgotten. `tools/rulebook.mjs` exists so the
 * next entry on it is read before it is described.
 */
const BASIC_WITHOUT_DAMAGE = Object.freeze({
  "Verdant Retribution":
    "PP 14. NOT a missing number — a missing mechanism. Printed: the area becomes difficult "
    + "terrain and deals \"2d8 poison damage to an enemy each time it enters an affected area "
    + "(square)\". That is damage on ENTERING a square, which nothing in the system triggers on; "
    + "a flat 2d8 on the cast would be a different spell. Needs terrain-entry before it can be built.",
  "Elemental Shield":
    "PP 10. Same shape. Printed: \"any adjacent creature that attacks you with a melee attack must "
    + "make a Basic Reflex saving throw or take 2d6 damage\". The save is real and belongs to a "
    + "REACTIVE trigger on being attacked in melee — the same on-attack trigger Aura Of Vitality's "
    + "heal waits on. Not castable damage, so a formula here would be wrong rather than incomplete."
});
const basicWithoutDamage = basicSpells.filter(
  (s) => !String(s.system?.damage?.formula ?? "").trim());
const undeclared = basicWithoutDamage.filter((s) => !BASIC_WITHOUT_DAMAGE[s.name]);
ok("F2 no NEW basic save is missing the damage it would scale",
  undeclared.length === 0,
  `${undeclared.length} undeclared: ${undeclared.map((s) => s.name).join(", ")}`);
// THE RATCHET MAY ONLY SHRINK, and this is the half that enforces it: a
// name that has been fixed must be removed from the list rather than
// left to make the backlog look permanent.
const staleDeclarations = Object.keys(BASIC_WITHOUT_DAMAGE)
  .filter((name) => !basicWithoutDamage.some((s) => s.name === name));
ok("F3 and no declaration outlives the problem it describes",
  staleDeclarations.length === 0,
  `fixed, so remove from the list: ${staleDeclarations.join(", ")}`);

/* ================================================================== *
 * G. THE RULING IS A SHAPE, NOT THREE NAMES (3.442.0)
 * ================================================================== *
 *
 * Graham, 29 August 2026: "Surge of the tempest should be basic reflex."
 * Its header prints "Saving Throw Reflex" and its PROSE says "must make a
 * basic Reflex save"; the prose wins, and the word decides whether damage
 * scales by degree at all.
 *
 * A ruling about one spell is a ruling about every spell shaped like it,
 * so `parse-spell-book.mjs` now records `proseBasicSave` per entry and
 * this asks the question of all 692 at once. Without that field it would
 * be a list of the names somebody happened to find — and the first sweep
 * for them, run with a fixed-width window that read into neighbouring
 * entries, reported NINETY-ONE where the real answer was nine.
 *
 * THE CHECK IS SCOPED TO SPELLS THAT ROLL DAMAGE, because `isBasic` is
 * `parsed.basic && Boolean(damageFormula)`: on a spell with no formula
 * the word buys nothing and demanding it would be noise. Those are on
 * F2's backlog instead.
 */

/*
 * ANSWERED ON 1 SEPTEMBER 2026, AND NEITHER WAS A CONFLICT.
 *
 * Both entries below were reported to Graham as the pack disagreeing
 * with the book. Both were me reading a stat block instead of the spell.
 *
 * STORM OF VENGEANCE — "This is a complex high-level spell which grants
 * a base effect and then allows the caster to select from one of five
 * options directly after casting and every round they sustain it. This
 * is why the variables differ as the spell can have a different effect
 * each turn." The numbers were never in disagreement; they belong to
 * different options of one spell. It stays here because it needs a
 * sustained-choice mechanism, NOT because anything is contradictory.
 *
 * SHOCK BOLT — the save is real and I had not read where it applies:
 * "If the attack inflicts a critical injury, all adjacent targets who
 * are wearing metal armour take half damage (basic Reflex)." The 2d12
 * attack rolls no save because it is an attack; the basic Reflex belongs
 * to a splash on a critical. Its Cantrip trait was removed at 3.451.0 on
 * Graham's instruction.
 */
const AWAITING_A_RULING = Object.freeze({
  // STORM OF VENGEANCE CAME OFF AT 3.610.0: its five strikes are a `storm`
  // row chosen at the cast and at each Sustain, each with its own save.
  "Shock Bolt":
    "ANSWERED 1 Sep 2026, not a conflict: the basic Reflex belongs to adjacent creatures in metal "
    + "armour on a CRITICAL INJURY, taking half damage. The 2d12 attack correctly rolls no save. "
    + "Held here pending a critical-splash mechanism."
});

// The book reference, keyed the way `verify-spell-book-fields` keys it:
// punctuation and case are typesetting, not identity.
const bookKey = (n) => String(n).toUpperCase().replace(/[^A-Z0-9]/g, "");
const bookBy = new Map(
  JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "tools", "spell-book-fields.json"), "utf8"))
    .map((e) => [bookKey(e.name), e]));

const proseBasic = spells.filter((s) => Boolean(bookBy.get(bookKey(s.name))?.proseBasicSave));
ok("G0 the reference carries the prose reading", proseBasic.length > 40,
  `only ${proseBasic.length} spells record a basic save in prose — re-run parse-spell-book.mjs`);

const unmarked = proseBasic.filter((s) => {
  if (/\bbasic\b/i.test(String(s.system?.defence ?? ""))) return false;
  return Boolean(String(s.system?.damage?.formula ?? "").trim());
});
const unruled = unmarked.filter((s) => !AWAITING_A_RULING[s.name]);
ok("G1 every damage spell whose prose says basic says it in the pack too",
  unruled.length === 0,
  `${unruled.length}: ${unruled.map((s) => s.name).join(", ")}`);
ok("G2 and nothing waits for a ruling it has already had",
  Object.keys(AWAITING_A_RULING).every((n) => unmarked.some((s) => s.name === n)),
  `resolved, so remove: ${Object.keys(AWAITING_A_RULING).filter((n) => !unmarked.some((s) => s.name === n)).join(", ")}`);
ok("G3 every spell held back says why",
  Object.values(AWAITING_A_RULING).every((why) => String(why).length > 60));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-basic-save: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-basic-save: OK — ${checks} checks. Minor +1, serious +2, deadly +3, a critical with `
  + `them, and none of it without the word.\n`);
