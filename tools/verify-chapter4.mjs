#!/usr/bin/env node
/**
 * verify-chapter4 — Skills & Actions, the registers. NEW at 3.556.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * Auditing pages 61–70 on 16 September 2026 I found Chapter 4 in good
 * order — every table matching, the thirty Basic Actions right down to
 * their trait lines and AP costs — and then looked for what would have
 * told me, and found almost nothing.
 *
 * `verify-chapter1` pins the level DC of 14, that the degree ladder never
 * runs backwards, and TWO of the eleven bonus types. That is the whole of
 * it. The seven printed degree BOUNDARIES were unchecked (only their
 * order); the Bonus Check Table was unchecked — `verify-skill-aid` drives
 * `bonusCheckModifier` as its own oracle, which cannot notice the table
 * being wrong; the nine difficulty rungs, nine bonus types, Auto Check
 * and Taking Time were unchecked; and the thirty-action register is read
 * by four harness files and compared to the book by none.
 *
 * Every one of those fails the way a class table does: a wrong number is
 * plausible, used everywhere, and contradicted by nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE THREE THINGS THAT BLOCK CHANGED.
 *
 *   H. Avert Gaze, which was the one printed Basic Action with no
 *      automation at all (D1), built at 3.556.0 on Graham's ruling R1.
 *   I. Identify Power through a specialist skill, his amendment to the
 *      printed line on the same day.
 *   J. The stacking comment (D2) that described a Chapter 4 sentence the
 *      book has never contained.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  BONUS_CHECK_TABLE, BONUS_TYPES, DEGREES, DIFFICULTIES, DIFFICULTY_BY_KEY,
  LEVEL_DC_BASE, autoCheckTotal, bonusCheckModifier, levelDC, resolveDegree
} from "../module/dice/resolution.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";
import { BASIC_ACTION_STANCE_EFFECTS } from "../module/combat/basic-action-stances.mjs";
import { collectConditionals, matchesCheck, automaticSelections } from "../module/conditionals.mjs";
import {
  readInvokedSkillKey, specialistInvokedKey, specialistSkillActions
} from "../module/specialist-skill-table.mjs";
import { affordableRanks } from "../module/skill-points.mjs";
import { missChanceDC } from "../module/combat/attack.mjs";
import {
  consumableDCModifier, createSuccessModifier, effectiveItemLevel
} from "../module/create-crafting.mjs";
import { earnIncomeForDegree } from "../module/earn-income.mjs";
import { SKILLS } from "../module/config.mjs";
import { tradeoffOptions } from "../module/difficulty-tradeoffs.mjs";
import {
  isJumpAction, jumpDC, jumpDCLabel, jumpNote, jumpPrompt, jumpWorking
} from "../module/jumping.mjs";
import { fullDefenceBlockReason, noteFullDefenceMove } from "../module/combat/reactions.mjs";
import { TREAT_AFFLICTION_KIND, firstAidDC, treatAfflictionDC } from "../module/medicine-dc.mjs";
import { afflictionSaveDC } from "../module/afflictions.mjs";
import {
  painToleranceIgnoredPoints, treatWoundsTargetDC
} from "../module/medicine-modifiers.mjs";
import { painToleranceReducedValue } from "../module/combat/pain-tolerance.mjs";
import { attitudeDegreeSteps, improveDegree } from "../module/attitude.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * A. THE ACTION RESOLUTION TABLE (page 63), DRIVEN
 *
 *   Exceeds by 20+  Heroic       Fails by less than 5  Partial
 *   Exceeds by 10+  Critical     Fails by 5+           Failure
 *   Equals/Exceeds  Success      Fails by 10+          Fumble
 *                                Fails by 20+          Blunder
 *
 * Asserted at the BOUNDARIES, either side of every step, because a
 * ladder that is one off is a ladder that still looks ordered.
 * ================================================================== */
eq("A1 the book prints seven degrees", DEGREES.map((d) => d.key),
  ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
{
  const at = (margin) => resolveDegree(margin).key;
  const edges = [
    [21, "heroic"], [20, "heroic"], [19, "critical"],
    [11, "critical"], [10, "critical"], [9, "success"],
    [1, "success"], [0, "success"], [-1, "partial"],
    [-4, "partial"], [-5, "failure"],
    [-9, "failure"], [-10, "fumble"],
    [-19, "fumble"], [-20, "blunder"], [-40, "blunder"]
  ];
  eq("A2 every printed boundary lands on the printed degree",
    edges.filter(([margin, want]) => at(margin) !== want)
      .map(([margin, want]) => `${margin}: ${at(margin)} not ${want}`), []);
}
// "Equals or Exceeds — Success" is the one boundary a reader gets wrong,
// so it is named on its own as well.
eq("A3 exactly equalling the DC succeeds", resolveDegree(0).success, true);
eq("A4 and one short of it does not", resolveDegree(-1).success, false);
eq("A5 the three succeeding degrees are the three the book calls successes",
  DEGREES.filter((d) => d.success).map((d) => d.key), ["heroic", "critical", "success"]);

/* ================================================================== *
 * B. THE BONUS CHECK TABLE (page 64)
 *
 * Blunder -2, Fumble -1, Failure 0, Partial +1, Success +2, Critical
 * +3, Heroic +4. Driven through the ACCESSOR as well as compared to the
 * table, because every caller uses the accessor.
 * ================================================================== */
eq("B1 the Bonus Check Table is the seven printed rows",
  ["blunder", "fumble", "failure", "partial", "success", "critical", "heroic"]
    .map((key) => BONUS_CHECK_TABLE[key]),
  [-2, -1, 0, 1, 2, 3, 4]);
eq("B2 and the accessor returns them",
  ["blunder", "fumble", "failure", "partial", "success", "critical", "heroic"]
    .map(bonusCheckModifier),
  [-2, -1, 0, 1, 2, 3, 4]);
// AID CAN HURT, and that is the half a calculator lets everyone forget.
ok("B3 a fumbled Aid hands the lead a penalty", bonusCheckModifier("fumble") < 0);
eq("B4 an unknown degree confers nothing rather than guessing",
  bonusCheckModifier("nonsense"), 0);
// Page 64's worked example: Nyphari beats DC 15 by 5 — a Success — and
// grants +2.
eq("B5 the book's own worked example gives +2",
  bonusCheckModifier(resolveDegree(20 - 15).key), 2);

/* ================================================================== *
 * C. DIFFICULTY, THE LEVEL DC, TAKING TIME AND AUTO CHECK (pages 63–64)
 * ================================================================== */
eq("C1 the example difficulty ladder is the nine printed rungs",
  DIFFICULTIES.map((d) => [d.key, d.modifier]),
  [["routine", 0], ["incrediblyEasy", -10], ["veryEasy", -5], ["easy", -2],
    ["medium", 0], ["hard", 2], ["veryHard", 5], ["incrediblyHard", 10],
    ["impossible", 0]]);
// The two rungs that are not modifiers at all. "Routine — No Check
// Required"; "Impossible — Check Auto Fails". Both have to survive as
// something other than a +0.
eq("C2 Routine requires no check", DIFFICULTY_BY_KEY.routine.auto, "success");
eq("C3 and Impossible fails whatever is rolled", DIFFICULTY_BY_KEY.impossible.auto, "failure");
eq("C4 no other rung resolves itself",
  DIFFICULTIES.filter((d) => d.auto).map((d) => d.key), ["routine", "impossible"]);
// "Difficulty modifiers range from +10 to -10."
eq("C5 the ladder spans the printed range",
  [Math.min(...DIFFICULTIES.map((d) => d.modifier)),
    Math.max(...DIFFICULTIES.map((d) => d.modifier))], [-10, 10]);
// "The DC is equal to the level of the task +14 unless noted otherwise."
eq("C6 the level modifier is 14", LEVEL_DC_BASE, 14);
eq("C7 and a level DC is that level plus it", [0, 1, 8, 20].map(levelDC), [14, 15, 22, 34]);
// "Taking Time grants you a special +4 circumstance bonus."
{
  const dialog = strip(read("module", "apps", "check-dialog.mjs"));
  ok("C8 Taking Time is +4, and circumstance",
    /label: "Taking Time",\s*value: 4,\s*type: "circumstance"/.test(dialog),
    "one circumstance bonus applies at a time, so the TYPE is half the rule");
}
// "receive a result of 10 + your rank bonus (do not apply any other
// bonuses, penalties, or modifiers)."
eq("C9 an Auto Check is ten plus rank and nothing else",
  [0, 1, 5, 12].map(autoCheckTotal), [10, 11, 15, 22]);
ok("C10 and it never goes below ten", autoCheckTotal(-5) === 10);

/* ================================================================== *
 * D. THE ELEVEN BONUS TYPES (page 62 and Appendix 1)
 *
 * The two references agree word for word, and this is the whole list.
 * Getting one of these wrong does not break anything — it silently
 * doubles a bonus, or silently eats one.
 * ================================================================== */
const PRINTED_STACKING = [
  ["armour", "highest"],        // "do not stack, and you may only apply the highest"
  ["circumstance", "highest"],  // "You may only apply one circumstance bonus"
  ["class", "stack"],           // "stack if gained from different sources"
  ["dodge", "dodge"],           // "stack with all other bonuses to DB even other dodge bonuses"
  ["item", "highest"],          // "Multiple item bonuses to the same value do not stack"
  ["luck", "highest"],          // "Only the highest luck bonus applies"
  ["naturalArmour", "highest"], // "does not stack, and you may only apply the highest"
  ["race", "stack"],            // "stack if gained from different sources"
  ["resistance", "highest"],    // "Only the highest resistance bonus applies"
  ["shield", "highest"],        // "stack with all other bonuses to DB except other shield bonuses"
  ["status", "highest"]         // "you may only apply one status bonus"
];
{
  const wrong = PRINTED_STACKING
    .filter(([key, rule]) => BONUS_TYPES[key]?.stacking !== rule)
    .map(([key, rule]) => `${key}: printed ${rule}, system ${BONUS_TYPES[key]?.stacking}`);
  eq("D1 every printed bonus type carries its printed stacking rule", wrong, []);
  // Untyped is the system's own twelfth, and it has to stack or every
  // untyped modifier on a card would swallow the others.
  eq("D2 plus untyped, which stacks", BONUS_TYPES.untyped?.stacking, "stack");
  eq("D3 and there is no twelfth printed type to have missed",
    Object.keys(BONUS_TYPES).filter((k) => k !== "untyped").sort(),
    PRINTED_STACKING.map(([k]) => k).sort());
  // THE THREE THAT STACK ARE THE THREE THE BOOK SAYS STACK, named
  // together because page 62's removed blanket line said the opposite of
  // all three at once.
  eq("D4 exactly three types stack, and dodge is its own rule",
    Object.entries(BONUS_TYPES).filter(([, v]) => v.stacking === "stack").map(([k]) => k).sort(),
    ["class", "race", "untyped"]);
}
// "Your maximum skill ranks in any one skill cannot be higher than your
// career level" — page 62 says it three times.
eq("E1 ranks are capped at character level",
  affordableRanks({ current: 0, wanted: 9, remaining: 99, level: 4 }), 4);
eq("E2 and by what is left to spend",
  affordableRanks({ current: 0, wanted: 4, remaining: 2, level: 20 }), 2);
eq("E3 lowering a rank is always allowed",
  affordableRanks({ current: 5, wanted: 1, remaining: 0, level: 20 }), 1);
// "If more than one flat check would ever cause or prevent the same
// thing, just roll once using the highest DC." (page 64)
eq("E4 two flat checks for the same thing roll once, at the higher DC",
  missChanceDC({ hidden: true, concealed: true }), 17);
eq("E5 each alone is its own DC",
  [missChanceDC({ hidden: true }), missChanceDC({ concealed: true }), missChanceDC({})],
  [10, 17, null]);

/* ================================================================== *
 * F. THE THIRTY BASIC ACTIONS (pages 65–68)
 *
 * Name, trait line and AP cost, transcribed once from the book. The
 * trait line is not decoration: Attack drives the multiple attack
 * penalty, Movement provokes, Open forbids a second Open action, and
 * Flourish limits one per turn.
 * ================================================================== */
const PRINTED_ACTIONS = [
  ["Aid Defensive", "Attack", "1"],
  ["Aid Offensive", "Attack", "1"],
  ["Aim", "Concentrate", "3"],
  ["Attack of Opportunity", "Attack", "Reaction"],
  ["Avert Gaze", "", "1"],
  ["Charge", "Attack, Flourish, Movement, Open", "3"],
  ["Coup de Grace", "Attack, Save", "3"],
  ["Crawl", "Movement", "1"],
  ["Delay", "", "Free"],
  ["Disarm Attack", "Attack", "1"],
  ["Double Slice", "Attack, Flourish", "3"],
  ["Drop Prone", "Movement", "1"],
  ["Escape", "Attack", "1"],
  ["Fight Defensively", "Attack, Defence, Open", "2"],
  ["Flowing Movement", "", "Free"],
  ["Full Defence", "Defence, Open", "3"],
  ["Grapple Attack", "Attack", "1"],
  ["Interact", "Manipulate", "1"],
  ["Prepare", "Concentrate, Flourish", "1"],
  ["Ready", "Concentrate", "2"],
  ["Release", "Manipulate", "Free"],
  ["Reposition", "Movement", "2"],
  ["Shield Bash", "Attack", "1"],
  ["Shove Attack", "Attack", "1"],
  ["Stand", "Movement", "1"],
  ["Step", "Movement", "1"],
  ["Stride", "Movement", "1"],
  ["Strike", "Attack", "1"],
  ["Take Cover", "", "1"],
  ["Trip Attack", "Attack", "1"]
];
{
  const byName = new Map(BASIC_ACTIONS.map((a) => [a.name, a]));
  const missing = PRINTED_ACTIONS.filter(([n]) => !byName.has(n)).map(([n]) => n);
  eq("F1 every printed Basic Action is in the table", missing, []);
  const wrong = [];
  for (const [name, traits, ap] of PRINTED_ACTIONS) {
    const a = byName.get(name);
    if (!a) continue;
    if (String(a.traits ?? "") !== traits) {
      wrong.push(`${name} traits: printed "${traits}", system "${a.traits ?? ""}"`);
    }
    if (String(a.apCost ?? "") !== ap) {
      wrong.push(`${name} AP: printed "${ap}", system "${a.apCost ?? ""}"`);
    }
  }
  eq("F2 with the printed trait line and AP cost", wrong, []);
  // THE THREE THAT ARE NOT AP AT ALL, named so that a tidy-up which
  // "normalises" them to numbers fails here rather than at the table.
  eq("F3 the Reaction and the two Free actions keep their printed costs",
    PRINTED_ACTIONS.filter(([, , ap]) => !/^\d+$/.test(ap)).map(([n, , ap]) => `${n}: ${ap}`),
    ["Attack of Opportunity: Reaction", "Delay: Free", "Flowing Movement: Free",
      "Release: Free"]);
  // Shield Block is the system's own extra — printed with the shields
  // rather than here — and saying so stops it reading as an error.
  // IMPROVISED ATTACK joined it at 3.576.0: printed on page 166 (Chapter
  // 6, "Improvised Attacks"), built as an action by Graham's R5.
  eq("F4 the entries the system carries beyond these pages are Shield Block and Improvised Attack",
    BASIC_ACTIONS.filter((a) => !PRINTED_ACTIONS.some(([n]) => n === a.name)).map((a) => a.name).sort(),
    ["Improvised Attack", "Shield Block"]);
}

/* ================================================================== *
 * G. THE GENERAL SKILL ACTIONS (pages 69–70)
 * ================================================================== */
const PRINTED_GENERAL = [
  ["Create", "trained"], ["Earn Income", "trained"], ["Identify Power", "trained"],
  ["Learn a Spell", "trained"], ["Recall Knowledge", "untrained"], ["Research", "trained"],
  ["Spell Concentration", "trained"], ["Study Target", "trained"], ["Subsist", "untrained"],
  ["Transfer Runes", "trained"]
];
{
  const byName = new Map(SKILL_ACTIONS.map((a) => [a.name, a]));
  const wrong = [];
  for (const [name, tier] of PRINTED_GENERAL) {
    const a = byName.get(name);
    if (!a) { wrong.push(`${name}: absent`); continue; }
    // UNTRAINED IS THE ABSENCE OF THE FIELD, by the gate's own contract:
    // "Untrained actions omit it and are never gated."
    const held = a.proficiency === "trained" ? "trained" : "untrained";
    if (held !== tier) wrong.push(`${name}: printed ${tier}, system ${held}`);
  }
  eq("G1 all ten general skill actions are present at their printed tier", wrong, []);
  const gate = strip(read("module", "combat", "action-workflow.mjs"));
  ok("G2 and the gate refuses a Trained action to an untrained character",
    /if \(action\.proficiency === "trained"\)/.test(gate));
}
// Create's work table (page 69): 0–4→2, 5–6→3 … 19–20→10, 21+→11.
eq("G3 the Create success modifier is the printed table",
  [0, 4, 5, 6, 7, 8, 13, 14, 19, 20, 21, 40].map(createSuccessModifier),
  [2, 2, 3, 3, 4, 4, 7, 7, 10, 10, 11, 11]);
eq("G4 a level-0 item counts as level 1 for the work maths",
  [0, 1, 2].map(effectiveItemLevel), [1, 1, 2]);
eq("G5 the consumable batch DC modifier is its own printed table",
  [1, 3, 4, 5, 6, 7, 8, 9, 10, 20].map(consumableDCModifier),
  [-2, -2, 0, 2, 2, 5, 5, 10, 10, 10]);
// Earn Income (page 70): income = task level x ranks, modified by degree.
{
  const at = (degree) => earnIncomeForDegree(degree, 5, 4);
  eq("G6 Success earns task level x ranks", at("success").perDay, 20);
  eq("G7 Critical counts your ranks as two higher", at("critical").perDay, 30);
  eq("G8 Partial earns half", at("partial").perDay, 10);
  eq("G9 Failure earns a tenth, rounded down", at("failure").perDay, 2);
  eq("G10 and a Fumble earns nothing and gets you fired",
    [at("fumble").perDay, at("fumble").fired], [0, true]);
}

/* ================================================================== *
 * H. AVERT GAZE — D1, built at 3.556.0
 *
 * The one printed Basic Action with no automation at all. The note that
 * kept it out said "visual abilities" was "a category this system has no
 * way to detect automatically"; `visual` is one of the appendix's own
 * traits and 32 pack entries carry it.
 *
 * GRAHAM'S RULING R1, 16 September 2026: OFFER IT, NEVER ASSUME IT. The
 * trait is necessary and not sufficient — the book says visual abilities
 * "that specifically necessitate looking at a creature or object" — so
 * the system's job is to put the tick in front of the player and let
 * them answer the one question only they can.
 * ================================================================== */
{
  const gaze = BASIC_ACTION_STANCE_EFFECTS.avertGaze;
  ok("H1 Avert Gaze is a stance like the other two", Boolean(gaze));
  eq("H2 and writes no unconditional bonus anywhere", gaze.changes, []);
  eq("H3 both of its entries are +2 circumstance",
    gaze.conditionals.map((c) => [c.value, c.type]), [[2, "circumstance"], [2, "circumstance"]]);
  eq("H4 and NEITHER applies itself", gaze.conditionals.map((c) => c.auto), [false, false]);

  const effect = {
    id: "gaze", name: "Avert Gaze", disabled: false,
    flags: { "trg-prime": { conditionals: gaze.conditionals } }
  };
  const rows = collectConditionals([], [effect]);
  eq("H5 the dialog collects them off the effect", rows.length, 2);
  const offered = (context) => rows.filter((r) => matchesCheck(r, context)).length;
  // EXACTLY ONE on any save — the trait-scoped entry when the trait is
  // there, the GM's-call entry when it is not. Two would be a doubled
  // bonus; none would be the gap this fixes.
  eq("H6 exactly one is offered on a save against a visual ability",
    offered({ checkType: "save", subject: "will", traits: "visual, mental" }), 1);
  eq("H7 and exactly one on a save against something untagged",
    offered({ checkType: "save", subject: "fortitude", traits: "poison" }), 1);
  eq("H8 nothing is offered on a skill check",
    offered({ checkType: "skill", subject: "stealth", traits: "visual" }), 0);
  eq("H9 nor on an attack", offered({ checkType: "attack", subject: "", traits: "visual" }), 0);
  eq("H10 and nothing is ever automatic",
    (automaticSelections(rows, { checkType: "save", subject: "will", traits: "visual" })
      ?.modifiers ?? []).length,
    0);
  // The card has to stop telling the player to do it by hand.
  const actions = BASIC_ACTIONS.find((a) => a.key === "avertGaze");
  ok("H11 the action's card says the bonus is offered, not applied",
    /OFFERED on your saving-throw dialogs/.test(String(actions?.description ?? "")));
  ok("H12 and no longer tells them to apply it manually",
    !/apply manually/i.test(String(actions?.description ?? "")));
  // `visual` has to remain a real trait, or both entries match nothing.
  const traits = read("module", "data", "appendix-traits.mjs");
  ok("H13 `visual` is still one of the appendix's traits", /"visual"/.test(traits),
    "the whole rule hangs on the trait the audit found 32 pack entries carrying");
}

/* ================================================================== *
 * I. IDENTIFY POWER THROUGH A SPECIALIST SKILL
 *
 * Graham's amendment, 16 September 2026: "Using either Arcana, Nature,
 * Occultism, Religion OR AN APPROPRIATE SPECIALIST SKILL."
 * ================================================================== */
{
  eq("I1 exactly the actions that declare it are open to specialist skills",
    // 3.629.0: Disable a Peril too — a haunt's Disable line can name a
    // specialist Lore (Pillars of Faith's Spirit Lore).
    specialistSkillActions(SKILL_ACTIONS).map((a) => a.name), ["Identify Power", "Disable a Peril"]);
  const identify = SKILL_ACTIONS.find((a) => a.key === "identifyPower");
  eq("I2 and the four printed knowledge skills are still the ordinary route",
    identify.skills, ["arcana", "religion", "occultism", "nature"]);
  // ITS OWN CARD HAS TO SAY SO. Live testing at 3.556.0 found the action
  // working through Spell Lore while its outcome card still described the
  // tradition table as the whole rule — a card that contradicts what just
  // happened is how a player decides the system is guessing.
  ok("I2a and the action's card names the specialist route as well",
    /OR an appropriate specialist skill/.test(String(identify.description ?? "")),
    "the card is where a player reads the rule, and it described half of it");
  eq("I3 a specialist invocation is marked as one",
    readInvokedSkillKey(specialistInvokedKey("herbLore")), { specialist: true, key: "herbLore" });
  // THE BARE KEY EITHER WAY, because `subject` drives conditional
  // matching: an entry scoped to "arcana" must not fire on a Herb Lore
  // roll, and one scoped to "herbLore" must.
  eq("I4 an ordinary skill is not", readInvokedSkillKey("arcana"), { specialist: false, key: "arcana" });
  eq("I5 and nothing at all is neither", readInvokedSkillKey(""), { specialist: false, key: "" });
  const workflow = strip(read("module", "combat", "action-workflow.mjs"));
  // The UNSTRIPPED source too: I8b reads a comment, which `strip` removes.
  const RAW_WORKFLOW = read("module", "combat", "action-workflow.mjs");
  ok("I6 the check reads the specialist collection, not the skills one",
    /const specialist = system\.specialistSkills\?\.\[invoked\.key\];/.test(workflow));
  ok("I7 and rolls it as a specialist check",
    /type: "specialist",\s*label: `\$\{action\.name\} — \$\{specialist\?\.label \?\? invoked\.key\}`/
      .test(workflow),
    "typed so a conditional scoped to a skill can never match a specialist roll");
  ok("I8 a specialist skill you hold satisfies the Trained gate",
    /if \(!actor\.system\?\.specialistSkills\?\.\[invokedForGate\.key\]\)/.test(workflow),
    "you do not buy ranks in one — a background grants it, or you do not have it");
  // I8b — GRAHAM'S RULING R2, 16 September 2026.
  //
  // The 3.8 rulebook revision deleted page 20's "A specialist skill is
  // always considered to be trained and gains an additional +1 bonus."
  // The +1 contradicted page 97's own `Level + Class Bonus + Ability
  // Modifier + 2`, so deleting it was right — but the TRAINED half went
  // with it, and for that revision the book stated it nowhere. This gate
  // and the Identify Power amendment both rested on it. Offered the
  // choice, he answered "I will amend": the sentence returns to the book
  // and nothing in the system changes.
  //
  // Pinned because the danger here is not a wrong line of code, it is a
  // future reader searching the book for the rule, failing to find it,
  // and deleting a gate that is correct. The provenance has to live
  // somewhere a check can insist on.
  ok("I8b and the source records where that rule comes from",
    /Graham's Identify Power amendment/.test(RAW_WORKFLOW)
    && /His\s*\n?\s*\/\/ ruling R2: "I will amend\."/.test(RAW_WORKFLOW)
    && /DO NOT REMOVE THIS GATE/.test(RAW_WORKFLOW),
    "the ruling that keeps this gate alive must be readable beside it");
  eq("I8c the +2 the book does print is the one the specialist total uses",
    /Level \+ Class Bonus \+\s*\n?\s*\/\/ Ability Modifier \+ 2/.test(RAW_WORKFLOW), true);
  // BOTH SITES, counted. There are two `subject:` hand-offs — one for the
  // dialog and one for the Shift-skipped roll — and a check that only
  // asserts "at least one" is a check a half-done edit walks through.
  eq("I9 and the subject passed to conditionals is the bare key, at both hand-offs",
    (workflow.match(
      /subject: readInvokedSkillKey\(invokedSkillKey \?\? ""\)\.key \|\| action\.skills\?\.\[0\] \|\| "",/g
    ) ?? []).length, 2);
  const sheet = strip(read("module", "sheets", "actor-sheet.mjs"));
  ok("I10 the specialist row offers the action",
    /const openToSpecialists = \[\.\.\.specialistSkillActions\(SKILL_ACTIONS\), \.\.\.opened\]/.test(sheet));
  ok("I11 invoking it through the prefixed key",
    /invokedSkillKey: specialistInvokedKey\(key\),/.test(sheet));
}

/* ================================================================== *
 * J. THE STACKING COMMENT — D2
 *
 * It described a Chapter 4 sentence the book has never contained, and
 * offered a documented switch to adopt it. The behaviour was right; the
 * comment would have talked the next reader out of it.
 * ================================================================== */
{
  const registry = read("module", "bonuses", "registry.mjs");
  ok("J1 the registry no longer claims Chapter 4 says race bonuses are wasted",
    !/Chapter 4 says multiple\s*\n?\s*\*? ?race bonuses to the same \*skill\* do not stack and are wasted/
      .test(registry) && !/do not stack and are wasted/.test(registry));
  ok("J2 nor invites anyone to switch race bonuses to highest",
    !/skill: \{ race: "highest" \}/.test(registry),
    "following that would have broken a rule Appendix 1 and page 62 agree on");
  ok("J3 and it records what the real contradiction was",
    /blanket line/.test(registry) && /Graham removed the blanket line/i.test(registry));
  eq("J4 race bonuses still stack, which is the rule it would have broken",
    BONUS_TYPES.race.stacking, "stack");
  eq("J5 and there are no overrides in force",
    JSON.parse(JSON.stringify(
      (await import("../module/bonuses/registry.mjs")).STACKING_OVERRIDES)), {});
}

/* ================================================================== *
 * K. THE MASTER SKILLS TABLE AND THE PER-SKILL REGISTERS (pages 74-80)
 *
 * D3 of the pages 71-80 audit. Twenty-six skills and the ability each
 * one runs on, and until 3.557.0 no check anywhere compared either to
 * the book. `verify-chapter2` covers specialist skills; `verify-
 * backgrounds` reads SKILLS only to resolve names. Neither asserts the
 * register.
 *
 * A GOVERNING ABILITY IS LOAD-BEARING IN THE PLAINEST WAY — it is the
 * modifier every check with that skill adds. Acrobatics on Strength
 * would change every Acrobatics roll in the game and would look
 * completely plausible on a sheet, which is the whole family this file
 * exists for: a wrong number that is used everywhere and contradicted by
 * nothing.
 * ================================================================== */
{
  // The table as page 74 prints it, in its printed order, name and stat.
  const PRINTED_SKILLS = [
    ["Acrobatics", "dexterity"], ["Arcana", "intelligence"],
    ["Artistry", "intelligence"], ["Athletics", "strength"],
    ["Climbing", "dexterity"], ["Crafting", "intelligence"],
    ["Culture", "intelligence"], ["Deception", "charisma"],
    ["Diplomacy", "charisma"], ["Handle Animal", "wisdom"],
    ["Intimidate", "charisma"], ["Linguistics", "intelligence"],
    ["Medicine", "wisdom"], ["Meditation", "wisdom"],
    ["Mental Focus", "wisdom"], ["Nature", "wisdom"],
    ["Occultism", "intelligence"], ["Perception", "wisdom"],
    ["Perform", "charisma"], ["Planes", "intelligence"],
    ["Power Manipulation", "intelligence"], ["Religion", "wisdom"],
    ["Sense Motive", "wisdom"], ["Stealth", "dexterity"],
    ["Survival", "wisdom"], ["Thievery", "dexterity"]
  ];
  const entries = Object.values(SKILLS);
  eq("K1 the book prints twenty-six skills", entries.length, PRINTED_SKILLS.length);
  // NAME AND ABILITY TOGETHER, as pairs, so a skill silently swapping
  // stat with its neighbour cannot pass by keeping both lists' contents.
  eq("K2 every skill is the printed skill on the printed ability",
    entries.map((s) => [s.label, s.ability]), PRINTED_SKILLS);
  // AND NOTHING ELSE IS A SKILL. Said separately from K2 because a
  // twenty-seventh entry appended after Thievery is the shape a new
  // "skill" actually arrives in.
  eq("K3 and there is no twenty-seventh",
    Object.keys(SKILLS).filter((key) => !PRINTED_SKILLS
      .some(([label]) => SKILLS[key].label === label)), []);

  /* ---- the per-skill action registers, pages 75-80 ---- */
  //
  // A FLOOR, NOT AN EXHAUSTIVE LIST. Page 74 calls these "suggested
  // actions" and Earn Income's own text says "you can use a skill", so
  // the system offering more than the book lists under a skill is
  // consistent rather than wrong. What must hold is that every action
  // the book DOES list is there, on that skill, at the tier printed.
  const PRINTED_REGISTERS = {
    acrobatics: {
      untrained: ["Arrest a Fall", "Balance", "Escape", "Hover", "Squeeze", "Tumble"],
      trained: ["Aerial Manoeuvre", "Catfall", "Kip Up", "Nimble Crawl"]
    },
    arcana: {
      untrained: ["Recall Knowledge"],
      trained: ["Create", "Identify Power", "Learn a Spell", "Research", "Study Target", "Transfer Runes"]
    },
    artistry: { untrained: ["Recall Knowledge"], trained: ["Earn Income", "Research"] },
    athletics: { untrained: ["Force Open", "High Jump", "Long Jump"], trained: ["Swim"] },
    climbing: { untrained: ["Climb"], trained: ["Grab an Edge"] },
    crafting: {
      untrained: ["Evaluate", "Recall Knowledge"],
      trained: ["Create", "Identify Alchemy", "Repair", "Research", "Study Target"]
    },
    culture: { untrained: ["Recall Knowledge", "Subsist"], trained: ["Research", "Study Target"] },
    deception: {
      untrained: ["Aggravate", "Bluff", "Create a Diversion"],
      trained: ["Disguise", "Feint"]
    }
  };
  const missing = [];
  const misTiered = [];
  for (const [skill, register] of Object.entries(PRINTED_REGISTERS)) {
    for (const [tier, names] of Object.entries(register)) {
      for (const name of names) {
        const action = SKILL_ACTIONS.find(
          (a) => a.name === name && (a.skills ?? []).includes(skill)
        );
        if (!action) { missing.push(`${skill}/${name}`); continue; }
        const gated = action.proficiency === "trained";
        if (gated !== (tier === "trained")) misTiered.push(`${skill}/${name}`);
      }
    }
  }
  eq("K4 every printed action is on the skill the book lists it under", missing, []);
  eq("K5 and gated at the tier the book prints it at", misTiered, []);
  // The registers must have been WORTH checking — a table that matched
  // eight empty lists would satisfy K4 and K5 in silence.
  // THE TABLE ABOVE MUST HAVE BEEN WORTH CHECKING — eight empty
  // registers would satisfy K4 and K5 in perfect silence.
  const registerEntries = Object.values(PRINTED_REGISTERS)
    .reduce((n, r) => n + r.untrained.length + r.trained.length, 0);
  eq("K6 and the register checked is the printed one, not an empty one",
    registerEntries, 42);
  // Forty-two ENTRIES, thirty-three distinct ACTIONS: Recall Knowledge is
  // listed under four of these eight skills, Research under four, Study
  // Target under three and Create under two. Both numbers are pinned
  // because the audit reported the second and this table holds the first.
  eq("K7 which is thirty-three distinct actions listed more than once each",
    new Set(Object.values(PRINTED_REGISTERS)
      .flatMap((r) => [...r.untrained, ...r.trained])).size, 33);
}

/* ================================================================== *
 * L. THE TWO JUMP DCs — D1, and Graham's ruling R1 of 16 September 2026
 *
 *   High Jump — "The DC of the check is equal to 4 per foot jumped."
 *   Long Jump — "The DC of the check is equal to the amount of feet."
 *   Both      — "If you didn't Stride at least 10 feet, the DC of the
 *                jump is doubled."
 *
 * Until 3.557.0 both declared `against: "none"` and computed nothing.
 * ================================================================== */
{
  eq("L1 High Jump is four per foot", jumpDC({ actionKey: "highJump", feet: 12 })?.dc, 48);
  eq("L2 Long Jump is one per foot", jumpDC({ actionKey: "longJump", feet: 15 })?.dc, 15);
  // THE DOUBLING, asserted on both, because it is printed on both and a
  // multiplier applied to only one is the plausible half-edit here.
  eq("L3 and without the 10-foot Stride High Jump doubles",
    jumpDC({ actionKey: "highJump", feet: 12, strode: false })?.dc, 96);
  eq("L4 as does Long Jump",
    jumpDC({ actionKey: "longJump", feet: 15, strode: false })?.dc, 30);
  eq("L5 the undoubled DC is still carried beside it, for the card",
    jumpDC({ actionKey: "highJump", feet: 12, strode: false })?.base, 48);
  // NO DISTANCE IS NOT A ZERO DC. The field defaults to zero and that
  // must mean "the GM keeps the call", exactly as before this existed —
  // a DC of 0 would be a jump that cannot be failed.
  eq("L6 no distance declared computes no DC",
    jumpDC({ actionKey: "highJump", feet: 0 }), null);
  eq("L7 nor does junk in the field",
    jumpDC({ actionKey: "longJump", feet: "over there" }), null);
  eq("L8 and a negative distance is not a negative DC",
    jumpDC({ actionKey: "highJump", feet: -20 }), null);
  eq("L9 no other action computes a jump DC", jumpDC({ actionKey: "tumble", feet: 12 }), null);
  eq("L10 and only the two jumps are jump actions",
    ["highJump", "longJump", "tumble", "climb", "swim"].filter(isJumpAction),
    ["highJump", "longJump"]);
  // THE WORKING, which is the half of R1 option A that is not arithmetic.
  {
    const doubled = jumpDC({ actionKey: "highJump", feet: 12, strode: false });
    const working = jumpWorking(doubled);
    ok("L11 the card shows both numbers and why the second one happened",
      working.includes("12 feet") && working.includes("48")
      && working.includes("96") && /without a 10-foot Stride/.test(working),
      `got: ${working}`);
    eq("L12 and the DC is captioned with the distance it came from",
      jumpDCLabel(doubled), "12 feet of High Jump");
    ok("L13 the note is the working, labelled", jumpNote(doubled).includes(working));
    eq("L14 and there is no note without a distance", jumpNote(null), "");
  }
  // THE PROMPT'S WORDING COMES FROM THE RULE, not from the dialog — a
  // prompt reading "4 per foot" over a table that said 5 would be this
  // file's own subject reintroduced where a reader trusts it most.
  eq("L15 the High Jump prompt quotes its own formula",
    jumpPrompt("highJump")?.hint.includes("4 per foot jumped"), true);
  eq("L16 and the Long Jump prompt quotes its own",
    jumpPrompt("longJump")?.hint.includes("1 per foot jumped"), true);
  ok("L17 the Stride question is asked as the deviation, not the assumption",
    /I did not Stride at least 10 feet/.test(jumpPrompt("longJump")?.strideLabel ?? ""),
    "the printed action includes the Stride, so an untouched dialog must assert nothing");

  /* ---- and it is wired where a computed DC can still be adjusted ---- */
  const workflow = strip(read("module", "combat", "action-workflow.mjs"));
  ok("L18 the workflow asks for the distance before the roll",
    /const declared = await promptJumpDistance\(action\.key\);/.test(workflow));
  // CANCEL AND "YOU SET IT" ARE DIFFERENT ANSWERS, and collapsing them
  // is the edit that makes a zero-distance jump abandon the action.
  ok("L19 and tells a cancelled dialog apart from a declined distance",
    /if \(declared === undefined\) return null;/.test(workflow)
    && !/if \(!declared\) return null;/.test(workflow));
  ok("L20 the declared distance becomes the DC",
    /if \(jumpSetup\) \{\s*resolved\.dc = jumpSetup\.dc;/.test(workflow));
  ok("L21 and it is asked before the check dialog, so the GM can still adjust it",
    workflow.indexOf("promptJumpDistance") < workflow.indexOf("const suggestedDC"),
    "page 77: 'The DC may also be increased or decreased due to the situation'");
  ok("L22 the working reaches the card",
    /lines\.push\(line\(jumpNote\(jumpSetup\)\)\);/.test(workflow));
  // THE PRINTED COST AND TRAIT LINE, unchanged by any of this.
  {
    const jumps = ["highJump", "longJump"].map(
      (key) => SKILL_ACTIONS.find((a) => a.key === key));
    eq("L23 both jumps still cost what the book prints",
      jumps.map((a) => a.apCost),
      ["2 (or 1 with a +2 difficulty increase)", "2 (or 1 with a +2 difficulty increase)"]);
    eq("L24 and both are still Movement", jumps.map((a) => a.traits), ["Movement", "Movement"]);
    // THE TRADE-OFF NOW COSTS SOMETHING. `resolveAction` guards every DC
    // adjustment with `finalDC !== null`, so while these two had no DC
    // the printed "+2 difficulty to jump for 1 AP" cut the AP and put the
    // +2 nowhere. Pinned here because it is a consequence of L20 that
    // nothing else would notice being undone.
    eq("L25 and the printed +2-for-1-AP trade-off is still offered on both",
      jumps.map((a) => tradeoffOptions(a.key).map((o) => o.dc)), [[2], [2]]);
  }
}

/* ================================================================== *
 * M. KIP UP'S MOVEMENT TRAIT — D2, and what restoring it nearly did
 *
 * Page 76 prints Kip Up under MOVEMENT; the system stored no traits at
 * all. The audit called the omission harmless, and for the omission it
 * was. RESTORING it was not: `noteFullDefenceMove` read the trait with
 * no exemption for Free actions, so a Free action would have consumed
 * the single Move that Full Defence allows — and the Stride after it
 * would have been refused. A rule nobody wrote, arriving through a data
 * line being made correct.
 * ================================================================== */
{
  const kipUp = SKILL_ACTIONS.find((a) => a.key === "kipUp");
  eq("M1 Kip Up carries the trait the book prints", kipUp.traits, "Movement");
  eq("M2 at the Free cost the book prints", kipUp.apCost, "Free");
  eq("M3 against the fixed DC the book prints", kipUp.fixedDC, 20);
  // FULL DEFENCE NEVER BLOCKED IT, and must not start to.
  eq("M4 Full Defence does not block a Free action",
    fullDefenceBlockReason(kipUp, { fullDefence: true, movesUsed: 1 }), null);
  // AND MUST NOT CHARGE IT FOR THE MOVE IT NEVER NEEDED. Driven rather
  // than grepped: this is the branch that would have changed.
  {
    const stanceName = BASIC_ACTION_STANCE_EFFECTS.fullDefence.name;
    const spent = [];
    const actor = {
      effects: [{ name: stanceName, getFlag: () => true }],
      getFlag: () => 0,
      setFlag: async (...args) => { spent.push(args); }
    };
    eq("M5 and does not spend the Move allowance on it",
      await noteFullDefenceMove(actor, kipUp), false);
    eq("M6 nothing was written", spent.length, 0);
    // NOT VACUOUS: a real Movement action still spends it.
    const stride = SKILL_ACTIONS.find((a) => a.traits === "Movement" && a.apCost === "1")
      ?? { traits: "Movement", apCost: "1" };
    eq("M7 but an ordinary Movement action still does",
      await noteFullDefenceMove(actor, stride), true);
    eq("M8 and that one was written", spent.length, 1);
  }
}

/* ================================================================== *
 * O. PAGES 81-90 — twelve more skills, and the six defects of block 8
 *
 * Diplomacy, Handle Animal, Intimidate, Linguistics, Medicine,
 * Meditation, Mental Focus, Nature, Occultism, Perception, Perform and
 * Planes. Section K did the eight skills of pages 75-80; nothing pinned
 * these twelve, their 62 register entries or their forty trait lines.
 * ================================================================== */
{
  const PRINTED_REGISTERS_81_90 = {
    diplomacy: {
      untrained: ["Encourage", "Gather Information", "Make an Impression", "Request"],
      trained: ["Barter (Selling)", "Barter (Purchasing)", "Command", "Rally"]
    },
    handleAnimal: {
      untrained: ["Mount / Dismount"],
      trained: ["Command an Animal", "Express Rider", "Guide with Knees", "Stay in Saddle", "Train Animal"]
    },
    intimidate: { untrained: ["Aggravate", "Coerce", "Demoralise"], trained: [] },
    linguistics: {
      untrained: ["Recall Knowledge"],
      trained: ["Create Forgery", "Decipher Writing", "Discern Secret Message", "Research"]
    },
    medicine: {
      untrained: ["First Aid", "Recall Knowledge", "Resuscitation"],
      trained: ["Research", "Treat Disease", "Treat Injury", "Treat Toxin", "Treat Wounds"]
    },
    meditation: {
      untrained: [],
      trained: ["Cleansing Trance", "Clear Mind", "Healing Trance", "Power Recovery"]
    },
    mentalFocus: {
      untrained: ["Spatial Awareness"],
      trained: ["Invoke Rage", "Pain Tolerance", "Revoke Rage", "Spell Concentration", "Stunned Manoeuvre"]
    },
    nature: {
      untrained: ["Recall Knowledge"],
      trained: ["Create", "Identify Power", "Learn a Spell", "Research", "Study Target", "Transfer Runes"]
    },
    occultism: {
      untrained: ["Recall Knowledge"],
      trained: ["Create", "Identify Power", "Learn a Spell", "Research", "Study Target", "Transfer Runes"]
    },
    perception: { untrained: ["Awareness", "Search", "Time Sense"], trained: [] },
    perform: { untrained: ["Entertain"], trained: ["Earn Income"] },
    planes: { untrained: ["Recall Knowledge", "Subsist"], trained: ["Research", "Study Target"] }
  };
  // BARTER IS TWO ACTIONS AND MOUNT IS ONE. The book prints one Barter
  // with two outcome tables (selling and purchasing), which is two
  // actions here; and prints "MOUNT/DISMOUNT" as a heading while its
  // register line says "Mount". Both are transcribed as the system names
  // them, and named here so a reader meeting the difference knows it was
  // read rather than missed.
  const missing = [];
  const misTiered = [];
  for (const [skill, register] of Object.entries(PRINTED_REGISTERS_81_90)) {
    for (const [tier, names] of Object.entries(register)) {
      for (const name of names) {
        const action = SKILL_ACTIONS.find(
          (a) => a.name === name && (a.skills ?? []).includes(skill)
        );
        if (!action) { missing.push(`${skill}/${name}`); continue; }
        const gated = action.proficiency === "trained";
        if (gated !== (tier === "trained")) misTiered.push(`${skill}/${name}`);
      }
    }
  }
  eq("O1 every printed action is on the skill the book lists it under", missing, []);
  eq("O2 and gated at the tier the book prints it at", misTiered, []);
  eq("O3 the register checked is the printed one, not an empty one",
    Object.values(PRINTED_REGISTERS_81_90)
      .reduce((n, r) => n + r.untrained.length + r.trained.length, 0), 63);

  /* ---- the printed trait lines and AP costs ---- */
  const PRINTED_LINES = {
    "Encourage": ["Auditory, Concentrate, Emotion, Linguistic", "1"],
    "Request": ["Auditory, Concentrate, Linguistic, Mental", "1"],
    "Command": ["Auditory, Concentrate, Emotion, Linguistic", "1"],
    "Rally": ["Auditory, Concentrate, Emotion, Linguistic", "2"],
    "Mount / Dismount": ["Movement", "1"],
    "Command an Animal": ["Auditory, Concentrate", "1"],
    "Guide with Knees": ["Concentrate, Movement, Open", "Free"],
    "Stay in Saddle": ["Movement", "Reaction"],
    "Aggravate": ["Concentrate, Manipulate", "2"],
    "Demoralise": ["Auditory, Concentrate, Emotion, Fear, Mental", "1"],
    "Discern Secret Message": ["Concentrate, Secret", "1"],
    "First Aid": ["Flourish, Manipulate", "3"],
    "Resuscitation": ["Flourish, Manipulate", "3"],
    "Treat Injury": ["Healing, Manipulate", null],
    "Treat Wounds": ["Healing, Manipulate", null],
    "Cleansing Trance": ["Bonus, Concentrate, Healing, Mental", null],
    "Clear Mind": ["Bonus, Concentrate, Mental", null],
    "Healing Trance": ["Concentrate, Healing, Mental", null],
    "Spatial Awareness": ["Concentrate, Mental", "Free"],
    "Pain Tolerance": ["Concentrate, Flourish, Mental", "Free"],
    "Refocus": ["Concentrate, Mental", "1"],
    "Stunned Manoeuvre": ["Concentrate, Mental", "Reaction"],
    "Awareness": ["Concentrate", "Free"],
    "Search": ["Concentrate", "1"],
    // D1. INVOKE RAGE PRINTS FOUR TRAITS, NOT FIVE. The system carried an
    // OPEN it does not print, and Open is enforced — "only if you haven't
    // used an action with the attack or open trait yet this turn" — so a
    // character who had already swung was refused the rage. Guide with
    // Knees above IS printed Open and keeps it, which is how we know the
    // book uses the trait on purpose.
    "Invoke Rage": ["Concentrate, Emotion, Mental, Rage", null],
    "Revoke Rage": ["Concentrate, Emotion, Mental, Rage", null]
  };
  const normTraits = (v) => String(v ?? "").toLowerCase().split(/[,;]/)
    .map((x) => x.trim()).filter(Boolean).sort().join(",");
  const lineFaults = [];
  for (const [name, [traits, ap]] of Object.entries(PRINTED_LINES)) {
    const action = SKILL_ACTIONS.find((a) => a.name === name);
    if (!action) { lineFaults.push(`${name}: missing`); continue; }
    if (normTraits(action.traits) !== normTraits(traits)) {
      lineFaults.push(`${name} traits: ${JSON.stringify(action.traits)}`);
    }
    if (ap !== null && String(action.apCost) !== ap) {
      lineFaults.push(`${name} AP: ${JSON.stringify(action.apCost)}`);
    }
  }
  eq("O4 every printed trait line and AP cost matches", lineFaults, []);
  ok("O5 and Invoke Rage carries no Open trait",
    !/\bopen\b/i.test(SKILL_ACTIONS.find((a) => a.key === "invokeRage").traits),
    "the book prints CONCENTRATE EMOTION MENTAL RAGE; Open would refuse the rage after an attack");

  /* ---- D3: the three DC sources, and the rung that had none ---- */
  eq("O6 First Aid's DC comes from the printed bleeding table",
    [1, 4, 5, 8, 9, 12, 13, 40].map((v) => firstAidDC(v)?.dc), [20, 20, 25, 25, 30, 30, 40, 40]);
  eq("O7 and a creature that is not bleeding is not a patient", firstAidDC(0), null);
  {
    const carried = [
      { name: "Filth Fever", system: { afflictionType: "disease", level: 2, rarityModifier: 2 } },
      { name: "Wasp Venom", system: { afflictionType: "poison", level: 4, rarityModifier: 0 } },
      { name: "Blackfinger", system: { afflictionType: "poison", level: 9, rarityModifier: 0 } }
    ];
    // THE SAME DC THE SAVE USES, so treating and resisting are one number.
    eq("O8 Treat Toxin takes the poison's own save DC",
      treatAfflictionDC(carried, "poison")?.dc, afflictionSaveDC(9, 0));
    eq("O9 the WORST of them when a creature carries several",
      treatAfflictionDC(carried, "poison")?.name, "Blackfinger");
    eq("O10 and Treat Disease reads the disease, not the poison",
      treatAfflictionDC(carried, "disease")?.name, "Filth Fever");
    eq("O11 nothing of that kind resolves nothing",
      treatAfflictionDC(carried.slice(1), "disease"), null);
  }
  eq("O12 the two Medicine actions that treat an affliction are the two the book gives one",
    Object.keys(TREAT_AFFLICTION_KIND).sort(), ["treatDisease", "treatToxin"]);
  {
    const stunned = SKILL_ACTIONS.find((a) => a.key === "stunnedManoeuvre");
    eq("O13 Stunned Manoeuvre rolls against the stunner's level DC",
      [stunned.against, stunned.difficulty], ["levelDC", "veryHard"]);
  }

  /* ---- THE DIFFICULTY RUNG LANDS ON THE DC, NOT THE ROLL ----
   *
   * Graham's instruction of 16 September 2026, following the Example
   * Difficulty table: "For consistency I need it to follow the example
   * difficulty table and always apply the modifier to the DC."
   *
   * The system already did. What was missing was anything saying so, and
   * anything noticing an action that declares a rung with no DC for the
   * rung to land on — where the printed difficulty silently does nothing.
   */
  {
    const check = strip(read("module", "dice", "check.mjs"));
    ok("O14 the one place a rung is applied adds it to the DC",
      /return Number\(this\.baseDC\) \+ Number\(difficulty\?\.modifier \?\? 0\);/.test(check)
      && !/dieTotal.*difficulty\?\.modifier/.test(check),
      "Easy is -2: on the DC that is easier, on the roll it would be harder");
    const orphans = SKILL_ACTIONS
      .filter((a) => a.difficulty && (!a.against || a.against === "none"))
      .map((a) => a.name);
    eq("O15 and no action declares a rung with no DC for it to land on", orphans, []);
  }

  /* ---- D4: the two trade-offs that were printed and unreachable ---- */
  eq("O16 Treat Wounds' additional targets cost 5 DC each",
    [0, 1, 3].map(treatWoundsTargetDC), [0, 5, 15]);
  eq("O17 Pain Tolerance's first point is free and every 4 DC buys another",
    [0, 3, 4, 7, 8, 12].map(painToleranceIgnoredPoints), [1, 1, 2, 2, 3, 4]);
  eq("O18 and the suppression ignores what was bought, not always one",
    [painToleranceReducedValue(3, 1), painToleranceReducedValue(3, 2), painToleranceReducedValue(1, 3)],
    [2, 1, 0]);

  /* ---- D5: the half-sentence Command an Animal never implemented ---- */
  eq("O19 a helpful animal improves the degree by one step",
    attitudeDegreeSteps("commandAnAnimal", "helpful"), 1);
  eq("O20 a friendly one does not — the book names one rung",
    attitudeDegreeSteps("commandAnAnimal", "friendly"), 0);
  eq("O21 and no other action reads an attitude for its degree",
    attitudeDegreeSteps("request", "helpful"), 0);
  eq("O22 improving walks the ladder the right way and stops at Heroic",
    ["partial", "success", "critical", "heroic"].map((d) => improveDegree(d)),
    ["success", "critical", "heroic", "heroic"]);
  eq("O23 and refuses a degree it does not know", improveDegree("aloof"), null);
}

console.log(`verify-chapter4: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-chapter4: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-chapter4: all pass");
