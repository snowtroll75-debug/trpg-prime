#!/usr/bin/env node
/**
 * verify-chapter4-skills-91-100 — the last six skills.
 *
 * NEW at 3.565.0, from the Chapter 4 audit of pages 91–100 and Graham's
 * rulings R1–R6 of 17 September 2026.
 *
 * The block's shape, and why this file is mostly about wiring: every one
 * of the twenty-two actions on these pages already carried correct data
 * — traits, AP, the full outcome ladder, the register tier. Six of them
 * appeared NOWHERE ELSE in the system. So the checks that matter are
 * less "is the arithmetic right" than "does anything ask".
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";
import { spendPowerPoints, powerPointSpendNote, SOUL_DRAIN_PER_PP } from "../module/power-points.mjs";
import { meetsSkillClassType, skillClassTypeRequirement } from "../module/skill-requirements.mjs";
import { rechargeAmount, rechargeConsequence } from "../module/recharge-item.mjs";
import { auraModifier, isSensePowerAction, AURA_MODIFIERS } from "../module/sense-power.mjs";
import { sneakModifiers, isConcealable } from "../module/stealth.mjs";
import { coverTracksPenalty, herbsAtOnce, herbYield, herbYieldWeight } from "../module/survival-rules.mjs";
import { pickPocketAutoFail, disableSuccesses, disableProgress, GUARDED_OBJECT_DC } from "../module/thievery.mjs";
import { misreadKey, hasMisread, withMisread, misreadModifier, misreadFlagPatch } from "../module/sense-motive.mjs";
import { chargedItemLevel } from "../module/charged-items.mjs";
import { TOOL_REQUIREMENTS, TOOL_MODES } from "../module/tools-requirement.mjs";
import { BASIC_ACTION_CONDITION_EFFECTS, basicActionConditionEffects }
  from "../module/combat/basic-action-conditions.mjs";
import { levelDC } from "../module/dice/resolution.mjs";
import * as resolution from "../module/dice/resolution.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}
const actionOf = (key) => SKILL_ACTIONS.find((a) => a.key === key) ?? null;

/* ================================================================== *
 * P. POWER POINTS AND THE NEGATIVE-PP RULE (page 91)
 * ================================================================== */

equal("P1 A SPEND WITHIN THE POOL COSTS NOTHING EXTRA",
  JSON.stringify(spendPowerPoints(10, 4)),
  JSON.stringify({ value: 6, spent: 4, shortfall: 0, soulDrain: 0 }));

equal("P2 THE POOL FLOORS AT ZERO", spendPowerPoints(3, 8).value, 0);
equal("P2b AND THE SHORTFALL IS FIVE PER PP", spendPowerPoints(3, 8).soulDrain, 25,
  "8 declared against 3 held is 5 below zero — Graham's R3: the overspend is always "
  + "allowed and paid for");
equal("P2c the rate is the printed one", SOUL_DRAIN_PER_PP, 5);

equal("P3 SPENDING EXACTLY THE POOL DRAINS NOTHING", spendPowerPoints(4, 4).soulDrain, 0,
  "the boundary — `>` not `>=`, or every caster who emptied their pool would be drained");
equal("P3b one past it drains once over", spendPowerPoints(4, 5).soulDrain, 5);

equal("P4 AN EMPTY POOL PAYS FOR EVERYTHING", spendPowerPoints(0, 2).soulDrain, 10);
equal("P5 A ZERO SPEND IS NOT A SPEND", spendPowerPoints(5, 0).spent, 0);
equal("P5b and a negative cost is not a refund", spendPowerPoints(5, -3).value, 5,
  "'spend -3 PP' is a caller bug; handing back three points would hide it");

ok("P6 THE NOTE NAMES THE SHORTFALL, NOT JUST ITS PRICE",
  /2 PB? below 0|2 PP below 0/.test(powerPointSpendNote(spendPowerPoints(1, 3), "Dispel")),
  powerPointSpendNote(spendPowerPoints(1, 3), "Dispel"));
equal("P6b AN UNSPENT NOTE IS EMPTY",
  powerPointSpendNote(spendPowerPoints(5, 0), "Sigil"), "");

/* ================================================================== *
 * A. THE ADEPT GATE AND SIGIL'S RANKS (page 91; rulings R1, R2)
 * ================================================================== */

equal("A1 POWER MANIPULATION REQUIRES ADEPT",
  skillClassTypeRequirement("powerManipulation"), "Adept");
equal("A1b AND IT IS THE ONLY SKILL THAT REQUIRES ANYTHING",
  skillClassTypeRequirement("stealth"), "",
  "one requirement line in all of Chapter 4");

ok("A2 AN ADEPT PASSES", meetsSkillClassType("powerManipulation", "Adept"));
ok("A2b A BARD'S \"Adept/Expert\" PASSES",
  meetsSkillClassType("powerManipulation", "Adept, Expert"),
  "effectiveTiers splits the slash; reading classType alone refused the Bard for class "
  + "feats on 13 August 2026 and would have refused them here");
ok("A2b2 AND SO DOES A RAW, UNSPLIT \"Adept/Expert\"",
  meetsSkillClassType("powerManipulation", "Adept/Expert"),
  "effectiveTiers comma-joins before this sees it, so the slash arm is defence against a "
  + "caller that passes a class item's own classType straight in — which is exactly what "
  + "the sheet does elsewhere, and what would silently refuse every Bard");
ok("A2c AN ARCHETYPE THAT GRANTS ADEPT PASSES",
  meetsSkillClassType("powerManipulation", "Martial, Adept"));
ok("A3 A FIGHTER DOES NOT", !meetsSkillClassType("powerManipulation", "Martial"));
ok("A3b NOR DOES A CHARACTER WITH NO CLASS",
  !meetsSkillClassType("powerManipulation", ""));
ok("A4 AN UNGATED SKILL IS ALWAYS SATISFIED",
  meetsSkillClassType("stealth", ""),
  "the level cap governs a classless character; this must not become a second rule");

equal("A5 SIGIL DECLARES ITS RANK GATE", actionOf("sigil")?.minRank, 2,
  "page 91's \"Ranks 2\" — the only rank gate on an action in the core book, and it "
  + "reuses the minRank built for Pillars of Faith rather than a second table");

/* ================================================================== *
 * C. THE THREE PP COSTS (page 91)
 * ================================================================== */

equal("C1 SIGIL COSTS 1 PP", actionOf("sigil")?.ppCost, 1);
equal("C2 RECHARGE ITEM COSTS 2 PP", actionOf("rechargeItem")?.ppCost, 2);
equal("C3 DISPEL'S COST IS DECLARED, NOT FIXED",
  actionOf("dispel")?.ppCostPrompt, "spellMaximum",
  "\"an amount of PP up to the maximum that you can use to cast a spell\"");
equal("C3b and it therefore has no flat ppCost",
  actionOf("dispel")?.ppCost, undefined,
  "a flat number here would be spent INSTEAD of the declared one");

/* ================================================================== *
 * R. RECHARGE ITEM (page 91; ruling R4)
 * ================================================================== */

equal("R1 HEROIC IS ONE PP PER CASTER LEVEL", rechargeAmount("heroic", 8), 8);
equal("R2 A CRITICAL IS ONE PER TWO, ROUNDED UP", rechargeAmount("critical", 7), 4);
equal("R3 A SUCCESS IS ONE PER FOUR, ROUNDED UP", rechargeAmount("success", 9), 3);
equal("R3b ROUNDING UP MATTERS AT LOW LEVELS", rechargeAmount("success", 1), 1,
  "a floor would make a Success do nothing at all for the first four levels");
equal("R4 A PARTIAL REGAINS NOTHING", rechargeAmount("partial", 20), 0);
equal("R4b and so do failure and fumble",
  rechargeAmount("failure", 20) + rechargeAmount("fumble", 20), 0);

ok("R5 A SUCCESS LOCKS THE ITEM UNTIL DAILY PREPARATION",
  rechargeConsequence("success").immune);
ok("R5b AND SO DOES A FUMBLE, for the opposite reason",
  rechargeConsequence("fumble").immune);
ok("R5c ONLY THE FUMBLE BLOCKS NATURAL RECHARGING",
  rechargeConsequence("fumble").blocksNatural
  && !rechargeConsequence("success").blocksNatural);
ok("R6 A PARTIAL LOCKS NOTHING",
  !rechargeConsequence("partial").immune,
  "\"you may continue for another ten minutes and attempt the check again\" — an item "
  + "locked out on a Partial could not be retried, which is the one thing it offers");
ok("R6b and a Failure locks nothing either",
  !rechargeConsequence("failure").immune);
ok("R7 ONLY A FUMBLE RISKS RESONANCE", rechargeConsequence("fumble").resonance
  && !rechargeConsequence("critical").resonance);

// R4's DC. The three level formulas already existed; nothing chose
// between them until chargedItemLevel.
equal("R8 A WAND IS ITS SPELL'S COST PLUS ONE",
  chargedItemLevel({ kind: "wand", spells: [{ pp: 2 }] }), 3);
equal("R8b A FLEXIBLE WAND IS ONE HIGHER",
  chargedItemLevel({ kind: "wand", flexible: true, spells: [{ pp: 6 }] }), 8);
equal("R8c A STAFF MATCHES THE CHAPTER'S WORKED EXAMPLE",
  chargedItemLevel({ kind: "staff", spells: [{ pp: 2 }, { pp: 2 }, { pp: 4 }, { pp: 6 }], schools: ["a", "b"] }),
  9, "Aelar's staff: highest 6, +2, +1 for the second school");
equal("R8d A MISSING FLAG IS LEVEL 0, not a crash", chargedItemLevel(null), 0);
equal("R9 THE DC IS THE ITEM'S LEVEL DC", levelDC(9), levelDC(chargedItemLevel(
  { kind: "staff", spells: [{ pp: 2 }, { pp: 2 }, { pp: 4 }, { pp: 6 }], schools: ["a", "b"] })),
  "Graham's R4: \"The level of the item determines its DC (which should equate to a "
  + "characters level DC)\" — rarity does not enter it");

/* ================================================================== *
 * S. SENSE POWER'S AURA TABLE (page 91)
 * ================================================================== */

equal("S1 THE TABLE HAS ITS FOUR PRINTED ROWS", AURA_MODIFIERS.length, 4);
equal("S1b a different tradition is -5",
  AURA_MODIFIERS.find((r) => r.key === "tradition")?.modifier, -5);
equal("S1c Shadow magic is -10",
  AURA_MODIFIERS.find((r) => r.key === "shadow")?.modifier, -10);
equal("S1d a magical trap is -10",
  AURA_MODIFIERS.find((r) => r.key === "trap")?.modifier, -10);
equal("S1e Insight magic is -5",
  AURA_MODIFIERS.find((r) => r.key === "insight")?.modifier, -5);

equal("S2 NO AURA DECLARED IS NO MODIFIER", auraModifier([]), null,
  "ordinary magic is simply found — the opposed check is the exception, and an "
  + "untouched dialog must leave the action exactly as it was");
equal("S2b and an unknown key is not an aura", auraModifier(["dragon"]), null);

equal("S3 ONE AURA IS ITS OWN ROW", auraModifier(["shadow"]).value, -10);
equal("S4 TWO AURAS TAKE THE WORST, NOT THE SUM",
  auraModifier(["tradition", "shadow"]).value, -10,
  "Appendix 1's rule; summing would reach -30 off three boxes and make the action "
  + "unusable on a rule the table does not print");
equal("S4b and three still take the worst",
  auraModifier(["tradition", "shadow", "trap"]).value, -10);
ok("S4c the label says it chose", /worst of 2/.test(auraModifier(["tradition", "shadow"]).label));

ok("S5 BOTH HALVES OF SENSE POWER ARE THE SAME ACTION",
  isSensePowerAction("senseMagicBroad") && isSensePowerAction("senseMagicFocused"));
ok("S5b and nothing else is", !isSensePowerAction("senseMentalEffect"));

/* ================================================================== *
 * T. STEALTH (pages 93–94)
 * ================================================================== */

equal("T1 COVER IS +2 WHILE SNEAKING",
  sneakModifiers({ cover: "standard" })[0]?.value, 2);
equal("T1b AND GREATER COVER IS +4",
  sneakModifiers({ cover: "greater" })[0]?.value, 4);

{
  const plain = sneakModifiers({ cover: "greater" });
  equal("T2 GREATER COVER ALONE IS +4", plain[0]?.value, 4);

  // THE DEFECT THIS SECTION EXISTS FOR (D9).
  const covered = sneakModifiers({ cover: "greater", takeCoverStealthBonus: 8 });
  equal("T3 TAKE COVER'S +8 IS CANCELLED",
    covered.reduce((sum, r) => sum + r.value, 0), -4,
    "the effect is already adding +8, so the rows must net to +4 — page 93: \"the bonus "
    + "increase from Taking Cover does not apply because you are actively moving\"");
  ok("T3b and the cancelling row says why",
    covered.some((r) => /Taking Cover/.test(r.label)),
    "a silently smaller number would read as a bug");
  equal("T4 A SNEAKER NOT TAKING COVER GETS NO CORRECTION ROW",
    sneakModifiers({ cover: "standard" }).length, 1);

  const fast = sneakModifiers({ cover: "none", fullSpeed: true });
  equal("T5 FULL SPEED IS -4", fast[0]?.value, -4);
  equal("T6 AN UNTOUCHED DIALOG ASSERTS NOTHING",
    sneakModifiers({}).length, 0);
}

equal("T7 A SMALL OBJECT MAY BE CONCEALED", isConcealable("small"), true);
equal("T7b a medium one may not", isConcealable("medium"), false);
equal("T7c AN UNKNOWN SIZE IS UNKNOWN, NOT A REFUSAL", isConcealable(""), null,
  "the action is routinely used on things that are not items on the sheet");

ok("T8 HIDE NOW APPLIES ITS CONDITION",
  basicActionConditionEffects("hide", "success")
    .some((e) => e.conditionKey === "hidden" && e.active),
  "page 93: \"you now transition from being observed to being hidden\" — and Sneak "
  + "beside it had this all along, which is how the gap hid");
ok("T8b AND A HEROIC HIDE STILL DOES",
  basicActionConditionEffects("hide", "heroic").length > 0,
  "the succeeding-degree cascade — \"rolling better made things worse\", 3.402.0");
ok("T9 A FUMBLED SNEAK CLEARS BOTH STATES",
  basicActionConditionEffects("sneak", "fumble")
    .filter((e) => !e.active).length === 2,
  "\"the creature continues to observe you\" — and until now a sneaker who fumbled kept "
  + "whatever Hidden they set out with");
ok("T9b Hide does not invent a fumble it has no text for",
  !BASIC_ACTION_CONDITION_EFFECTS.hide.fumble);

/* ================================================================== *
 * V. SURVIVAL (page 95)
 * ================================================================== */

equal("V1 FOUR CHARACTERS ARE FREE", coverTracksPenalty(4), 0,
  "\"beyond the first four\" — the off-by-one IS the rule");
equal("V1b THE FIFTH COSTS 2", coverTracksPenalty(5), -2);
equal("V1c and eight costs 8", coverTracksPenalty(8), -8);
equal("V1d a party smaller than four still pays nothing", coverTracksPenalty(1), 0);

equal("V2 ONE HERB WITH NO RANKS", herbsAtOnce(0), 1,
  "\"you must declare which herb you are looking for\" — everybody gets one");
equal("V2b FIVE RANKS BUY THE SECOND", herbsAtOnce(5), 2);
equal("V2c four ranks do not", herbsAtOnce(4), 1);
equal("V2d ten ranks, three herbs", herbsAtOnce(10), 3);
equal("V2e TWENTY RANKS REACH THE PRINTED MAXIMUM OF FIVE", herbsAtOnce(20), 5);
equal("V2f and the cap holds past it", herbsAtOnce(40), 5);

equal("V3 A CRITICAL IS FOUR YIELDS", herbYield("critical"), 4);
equal("V3b A SUCCESS IS TWO", herbYield("success"), 2);
equal("V3c A PARTIAL IS ONE", herbYield("partial"), 1);
equal("V3d A FAILURE IS NOTHING", herbYield("failure"), 0);
equal("V4 A HEROIC MATCHES THE CRITICAL", herbYield("heroic"), 4,
  "the printed ladder stops at Critical; a Heroic IS a Critical with extra benefit, and "
  + "the alternative is 3.402.0's bug again — rolling better making things worse");
equal("V5 THE FULL DAY ADDS ONE OF EACH", herbYield("success", true), 3);
equal("V5b BUT NOTHING PLUS A BONUS IS STILL NOTHING",
  herbYield("failure", true), 0);
equal("V6 A YIELD WEIGHS A TENTH OF A POUND", herbYieldWeight(1), 0.1);
equal("V6b and four weigh four tenths",
  Number(herbYieldWeight(4).toFixed(1)), 0.4,
  "a function rather than a bare constant, so the card cannot carry its own * 0.1");

/* ================================================================== *
 * H. THIEVERY (page 96)
 * ================================================================== */

equal("H1 A GUARDED OBJECT RAISES THE DC BY 5", GUARDED_OBJECT_DC, 5);

equal("H2 A MARK IN COMBAT AUTO-FAILS",
  pickPocketAutoFail({ inCombat: true }), "the creature is in combat");
equal("H2b AND ONE ON GUARD",
  pickPocketAutoFail({ onGuard: true }), "the creature is on guard");
equal("H2c AN ORDINARY MARK DOES NOT", pickPocketAutoFail({}), "");
ok("H2d the reason is returned, not a boolean",
  pickPocketAutoFail({ inCombat: true }) !== pickPocketAutoFail({ onGuard: true }),
  "the card has to say which half of the sentence fired");

equal("H3 A CRITICAL EARNS TWO SUCCESSES", disableSuccesses("critical"), 2);
equal("H3b A SUCCESS EARNS ONE", disableSuccesses("success"), 1);
// 3.619.0 (block 38's A1, Graham's R14): Chapter 12, page 397 — "a result of
// heroic counts as three". Chapter 4 printed no Heroic row.
equal("H3c A HEROIC EARNS THREE", disableSuccesses("heroic"), 3);
equal("H3d A FUMBLE EARNS NONE", disableSuccesses("fumble"), 0);

{
  const p = disableProgress(1, 3, "critical");
  equal("H4 PROGRESS ACCUMULATES", p.banked, 3);
  ok("H4b and a complex device completes", p.done);
  const early = disableProgress(0, 3, "success");
  ok("H4c one success does not finish a three-success device", !early.done);
  equal("H5 A FUMBLE COSTS NO PROGRESS", disableProgress(2, 3, "fumble").banked, 2,
    "\"you trigger the device\" says nothing about undoing the work — inventing a reset "
    + "would be the harsher reading of a sentence the book did not write");
  equal("H5b banked progress never exceeds what is required",
    disableProgress(5, 2, "critical").banked, 2);
}

/* ================================================================== *
 * M. DETECT DECEPTION'S LASTING PENALTY (page 92)
 * ================================================================== */

ok("M1 THE KEY CANNOT CONTAIN A DOT",
  !misreadKey("Actor.CLlkeanjOvPI6Q0J").includes("."),
  "Foundry's setFlag reads a dot as a path — this cost a live test at 3.559.1 and hit "
  + "attitude.mjs at 3.408.0. Third time, so it is flattened in the pure module");
equal("M1b AN EMPTY UUID KEYS NOTHING", misreadKey(""), "");

{
  const after = withMisread({}, "Actor.AAA", "fumble");
  ok("M2 A FUMBLE SETS THE MISREAD", hasMisread(after, "Actor.AAA"));
  equal("M2b and it is -4", misreadModifier(after, "Actor.AAA", "Kel")?.value, -4);
  ok("M2c named after the creature", /Kel/.test(misreadModifier(after, "Actor.AAA", "Kel").label));

  ok("M3 A CRITICAL CLEARS IT",
    !hasMisread(withMisread(after, "Actor.AAA", "critical"), "Actor.AAA"));
  ok("M3b AND SO DOES A HEROIC",
    !hasMisread(withMisread(after, "Actor.AAA", "heroic"), "Actor.AAA"));
  ok("M4 A PLAIN SUCCESS DOES NOT",
    hasMisread(withMisread(after, "Actor.AAA", "success"), "Actor.AAA"),
    "\"until you achieve a CRITICAL SUCCESS against them\" — a Success clearing it would "
    + "make the penalty last exactly one check");
  ok("M4b nor does a failure",
    hasMisread(withMisread(after, "Actor.AAA", "failure"), "Actor.AAA"));

  ok("M5 IT IS PER TARGET", !hasMisread(after, "Actor.BBB"));
  equal("M5b and another target's row is untouched",
    Object.keys(withMisread(after, "Actor.BBB", "fumble")).length, 2);

  const original = { [misreadKey("Actor.AAA")]: true };
  withMisread(original, "Actor.AAA", "critical");
  ok("M6 THE RECORD IS NOT MUTATED IN PLACE",
    hasMisread(original, "Actor.AAA"),
    "the caller holds a live document flag; editing it in place is how a write gets "
    + "skipped because \"nothing changed\"");

  equal("M7 NO MISREAD IS NO ROW", misreadModifier({}, "Actor.AAA"), null);
}

/* ------------------------------------------------------------------ *
 * M8 — THE WRITE, NOT THE RECORD. Found by driving 3.565.0 live on the
 * day it shipped: `withMisread` returned exactly the right object and
 * the -4 stayed on the sheet anyway, because Foundry's setFlag MERGES.
 * A removed key must travel as a DELETION, not as an absence.
 * ------------------------------------------------------------------ */

const DEL = Symbol("deletion");
{
  const key = misreadKey("Actor.AAA");
  const prefix = "flags.trg-prime.detectDeceptionMisreads";

  const adding = misreadFlagPatch({}, { [key]: true }, prefix, DEL);
  equal("M8 A NEW MISREAD IS SET", adding[`${prefix}.${key}`], true);

  const clearing = misreadFlagPatch({ [key]: true }, {}, prefix, DEL);
  equal("M8b A CLEARED ONE CARRIES THE DELETION, NOT AN ABSENCE",
    clearing[`${prefix}.${key}`], DEL,
    "setFlag merges — writing the record back without the key leaves the key, so the "
    + "card said \"cleared\" while the -4 stayed. This is the whole defect");
  equal("M8c and the patch is not empty", Object.keys(clearing).length, 1);

  equal("M9 AN UNCHANGED RECORD PATCHES NOTHING",
    Object.keys(misreadFlagPatch({ [key]: true }, { [key]: true }, prefix, DEL)).length, 0,
    "an empty patch is what stops a write happening at all");

  const other = misreadKey("Actor.BBB");
  const both = misreadFlagPatch({ [key]: true }, { [other]: true }, prefix, DEL);
  equal("M10 ONE TARGET CLEARS WHILE ANOTHER SETS, in one patch",
    `${both[`${prefix}.${key}`] === DEL}/${both[`${prefix}.${other}`]}`, "true/true");
}

/* ================================================================== *
 * D. SENSE DIRECTION'S COMPASS (page 95)
 * ================================================================== */

ok("D1 SENSE DIRECTION REQUIRES A COMPASS",
  Boolean(TOOL_REQUIREMENTS.senseDirection));
equal("D2 AND LACKING IT STEPS THE DIFFICULTY",
  TOOL_REQUIREMENTS.senseDirection?.mode, TOOL_MODES.DIFFICULTY_STEP,
  "\"the check difficulty increases by one step\" — the same printed shape as Force "
  + "Open's crowbar, so it is the same mode rather than a branch beside it");
ok("D3 THE COMPASS IS NAMED",
  (TOOL_REQUIREMENTS.senseDirection?.tools ?? []).includes("Compass"));

/* ================================================================== *
 * W. THE WIRING
 * ================================================================== *
 *
 * Six of this block's actions had no reference anywhere outside their
 * data entry. Every rule above is reachable from a fixture and none of
 * it does anything unless the workflow asks, so the call sites are
 * counted rather than trusted — the shape this harness has been lied to
 * by nine times when it searched for a name instead.
 */

const wf = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
const count = (rx) => [...wf.matchAll(rx)].length;

equal("W1 THE PP COST IS SPENT", count(/await applyPowerPointCost\(actor, ppCost, ppLabel\)/g), 1,
  "action-workflow.mjs never touched resources.pp before 3.565.0");
equal("W2 DISPEL ASKS FOR ITS DECLARATION", count(/await promptDispel\(/g), 1);
equal("W3 AND GETS THE COUNTERACT MODIFIER",
  count(/counteractModifier\(dispelSetup\.pp, dispelSetup\.effectValue\)/g), 1,
  "the rulebook calls this a counteract check; counteractModifier existed the whole "
  + "time and was reachable only from a button on the actor sheet");
equal("W4 RECHARGE ITEM ASKS FOR ITS ITEM", count(/await promptRechargeItem\(actor\)/g), 1);
equal("W5 AND APPLIES THE PP IT EARNED", count(/rechargeAmount\(/g), 1);
equal("W6 SENSE POWER ASKS ABOUT THE AURA", count(/await promptSensePowerAura\(\)/g), 1);
equal("W7 SNEAK ASKS ABOUT COVER AND SPEED", count(/await promptSneakOptions\(\)/g), 1);
equal("W8 AND READS THE LIVE TAKE COVER EFFECT",
  count(/takeCoverStealthBonus:/g), 1,
  "assumed rather than read, a character not Taking Cover would get a phantom -8");
equal("W9 COVER TRACKS ASKS HOW MANY", count(/await promptCoverTracks\(\)/g), 1);
equal("W10 GATHER HERBS READS THE CHARACTER'S RANKS",
  count(/herbsAtOnce\(skillRanks\(/g), 1,
  "a hard-coded ceiling would hand a 1st-level forager five herbs");
equal("W11 PICK POCKET RESOLVES ITS AUTO-FAIL WITHOUT ROLLING",
  count(/if \(pickPocketSetup\.autoFail\) \{/g), 1);
equal("W12 AND RAISES THE DC FOR A GUARDED OBJECT",
  count(/finalDC \+= GUARDED_OBJECT_DC/g), 1);
equal("W13 DETECT DECEPTION WRITES ITS MISREAD",
  count(/withMisread\(held, targetActor\.uuid, degree\)/g), 1);
equal("W13b AND WRITES IT AS A PATCH, NOT WITH setFlag",
  count(/misreadFlagPatch\(/g), 1,
  "setFlag merges, so a cleared key survives the write — found live at 3.565.0");
equal("W13c setFlag is not used for this flag at all",
  count(/setFlag\?\.\(SYSTEM_ID, DETECT_DECEPTION_FLAG/g), 0);
equal("W13d and the deletion comes from the one measured helper",
  count(/misreadFlagPatch\([\s\S]{0,120}deletionValue\(\)/g), 1,
  "deletion.mjs records that the obvious spellings are silent no-ops");
equal("W14 AND READS IT BACK AS A MODIFIER", count(/misreadModifier\(/g), 1);

const daily = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "uses-workflow.mjs"), "utf8");
ok("W15 DAILY PREPARATION CLEARS THE RECHARGE LOCKOUT",
  /rechargeImmuneUntilPrep/.test(daily),
  "\"temporarily immune until your next daily preparation\" — without this the lockout "
  + "is permanent");

const charged = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "charged-items-workflow.mjs"), "utf8");
ok("W16 A FUMBLE'S 24-HOUR BLOCK STOPS NATURAL RECHARGING",
  /rechargeBlockedUntil/.test(charged));

const actorSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs"), "utf8");
ok("W17 THE ADEPT GATE RUNS ON WRITE",
  /meetsSkillClassType\(key, tiers\)/.test(actorSrc),
  "Graham's R1 is \"refuse a non-adept\" at build time — an input's max attribute does "
  + "not stop a typed value; only _preUpdate does");

/* ================================================================== *
 * S. NO SIDEBAR IS PRINTED TWICE IN THE PACK DATA
 * ================================================================== *
 *
 * WORD WRITES A TEXT BOX TWICE. A sidebar lives inside
 * mc:AlternateContent — once under mc:Choice for modern readers and
 * again under mc:Fallback (a v:textbox) for old ones. The extraction
 * that built this pack walked every <w:t>, so it read every sidebar in
 * the rulebook twice: 85 text boxes, 2,274 of the book's 75,245 <w:t>
 * elements, 33k characters of doubled prose.
 *
 * FOUND BECAUSE GRAHAM CORRECTED MY ERRATA. The pages 91-100 audit
 * reported NEGATIVE PP (page 91) and FEAT VS FEAT (page 100) as printed
 * twice in the book. His reply, 17 September 2026: "E1 and E2 are not
 * duplicated." They are not. My extractor doubled them, and had been
 * doubling every sidebar in every block audited so far.
 *
 * Six pack entries had carried the doubling into shipped data.
 * `tools/pages.py` now skips mc:Fallback; this check is the other half,
 * so a future import cannot put it back quietly.
 */

{
  const { ClassicLevel } = await import("classic-level");
  const SIDEBARS = [
    "CONJURE SPELLS", "MAGE ARMOUR & INCREASING DR", "PACK ATTACK",
    "HEALING MISCELLANOUS INJURIES", "FORM SPELLS", "CRITICAL RESISTANCE",
    "REPLACING AN ANIMAL COMPANION", "PRECISION DAMAGE", "NEGATIVE PP",
    "FEAT VS FEAT"
  ];
  const doubled = [];
  for (const pack of ["spells", "feats"]) {
    const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
    await db.open();
    for await (const [, v] of db.iterator()) {
      const text = String(v?.system?.description ?? "");
      for (const head of SIDEBARS) {
        if (text.split(head).length - 1 > 1) doubled.push(`${pack}/${v.name}: ${head}`);
      }
    }
    await db.close();
  }
  equal("S1 NO PACK DESCRIPTION CARRIES A SIDEBAR TWICE", doubled.length, 0,
    doubled.join("; "));
}

/* ================================================================== *
 * N. THE NAMES THE 3.8.1 REVISION SETTLED
 * ================================================================== *
 *
 * The pages 91-100 audit raised two names the book gave twice (E3, E4).
 * The 3.8.1 revision of 17 September 2026 picked one of each, and it did
 * NOT pick the one the system had carried:
 *
 *   register "Sense Power"  + heading "SENSE MAGIC - BROAD/FOCUSED"
 *     -> register is now "Sense Magic (Broad & Focused)"
 *   register "Disable Device" + heading "DISABLE A DEVICE"
 *     -> heading is now "DISABLE DEVICE", and the index with it
 *
 * The KEYS do not move. `senseMagicBroad` and `senseMagicFocused`
 * already matched the headings, and `disableADevice` is internal — a key
 * rename would break every flag, feat mapping and saved card that names
 * it, to gain nothing a reader ever sees.
 */

equal("N1 SENSE MAGIC (BROAD), as 3.8.1 names it",
  actionOf("senseMagicBroad")?.name, "Sense Magic (Broad)");
equal("N2 SENSE MAGIC (FOCUSED)",
  actionOf("senseMagicFocused")?.name, "Sense Magic (Focused)");
equal("N3 DISABLE DEVICE, without the article",
  actionOf("disableADevice")?.name, "Disable Device");
equal("N3b and its key is untouched",
  Boolean(actionOf("disableADevice")), true,
  "a key rename would break every feat mapping and saved card naming it");

/* ------------------------------------------------------------------ *
 * CONCEAL AN OBJECT, rewritten in 3.8.1 (audit errata E7).
 *
 * The action now carries YOUR outcomes. The printed Success/Failure/
 * Fumble ladder is the SEARCHER's — 3.8.1 says so in prose — and putting
 * it on the action would print "Success: the searcher finds the
 * concealed object" on a card celebrating your success.
 * ------------------------------------------------------------------ */

{
  const conceal = actionOf("concealAnObject");
  ok("N4 A SUCCESS IS YOURS, NOT THE SEARCHER'S",
    /does not notice/.test(conceal?.outcomes?.success ?? ""),
    conceal?.outcomes?.success);
  ok("N4b and a failure is too",
    /sees you conceal/.test(conceal?.outcomes?.failure ?? ""),
    conceal?.outcomes?.failure);
  ok("N4c THE SEARCHER'S LADDER IS IN THE DESCRIPTION",
    /Search \(Perception\)/.test(conceal?.description ?? "")
    && /searcher finds/.test(conceal?.description ?? ""),
    "a GM rolling the Search check needs it, and it must not be the action's own");
  ok("N5 THE SIZE LIMIT IS THE PRINTED ONE",
    /Small or smaller/.test(conceal?.description ?? ""));
}

/* ------------------------------------------------------------------ *
 * THE DIFFICULTY LABELS NOW SAY WHERE THE MODIFIER LANDS.
 *
 * 3.8.1 rewrote "Easy (+2)" as "Easy (DC -2)" wherever it appeared —
 * Graham's own correction of the pages 81-90 errata E1, and the printed
 * form of his 16 September ruling that a difficulty modifier moves the
 * DC and never the roll. The dialog now reads the way the page does.
 * ------------------------------------------------------------------ */

{
  const { DIFFICULTIES } = resolution;
  const byKey = (k) => DIFFICULTIES.find((d) => d.key === k);
  equal("N6 EASY IS A DC MODIFIER, and says so", byKey("easy").label, "Easy (DC -2)");
  equal("N6b and its sign is unchanged", byKey("easy").modifier, -2,
    "the label is the only thing that moved; a sign change here would be a rules change");
  equal("N6c HARD", byKey("hard").label, "Hard (DC +2)");
  equal("N6d VERY HARD", byKey("veryHard").label, "Very hard (DC +5)");
  ok("N6e every numbered rung names the DC",
    DIFFICULTIES.filter((d) => d.modifier !== 0 || d.key === "medium")
      .every((d) => /\(DC [+-]\d+\)/.test(d.label)),
    DIFFICULTIES.map((d) => d.label).join(" | "));
}

/* ================================================================== *
 * G. THE DEGREE EVERY HANDLER READS
 * ================================================================== *
 *
 * THE DEFECT THIS SECTION EXISTS FOR, found by driving 3.565.1 live in
 * Graham's world the day it shipped.
 *
 * `shadowborn.degree` is what the dice produced. `degree` is what the
 * ACTION DECLARES, after `declaredDegree` has collapsed anything it does
 * not print onto the nearest thing it does.
 *
 * A Detect Deception failing by 43 is a BLUNDER — and Detect Deception
 * declares no blunder. The card printed "Fumble", correctly, while all
 * six of this release's new handlers read the RAW value, saw "blunder",
 * and did nothing. The card and the sheet disagreed about what had
 * happened, and it took a live roll big enough to blunder to show it: a
 * merely-bad roll fumbles, and fumbling works.
 *
 * `action-workflow.mjs` had already written the rule down — "The card
 * and every handler below read this one variable, so they cannot
 * disagree about it" — twenty lines above the handlers that disagreed.
 *
 * SO THIS COUNTS, rather than naming the six. A seventh handler added
 * next year gets the same answer without anyone remembering to add it
 * here.
 */

{
  const outcomeStart = wf.indexOf("async function applyActionOutcome");
  const body = wf.slice(outcomeStart);
  // The three legitimate readers: the two lines that COMPUTE `degree`
  // from it, and the note that reports an attitude step by name.
  // CODE ONLY. The comments in this file name `shadowborn.degree` on
  // purpose — a reader has to be told which variable is the wrong one —
  // and counting those would make the rule impossible to explain in
  // place. Comment lines are dropped before counting.
  const code = body
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
  const raw = [...code.matchAll(/shadowborn\.degree/g)].length;
  equal("G1 ONLY THE LINES THAT BUILD `degree` READ THE RAW ONE", raw, 5,
    "three in the improveDegree expression that derives `degree` (two on its own "
    + "line plus the fallback beneath it), and two in the attitude-step note, which "
    + "has to name the value it moved from. Every other handler must read `degree` — "
    + "see the comment on the PP gate. A SIXTH IS A NEW HANDLER READING THE WRONG "
    + "VARIABLE, which is the whole defect this section exists for");

  for (const call of [
    "rechargeConsequence(degree)",
    "withMisread(held, targetActor.uuid, degree)",
    "herbYield(degree, gatherHerbsSetup.soleActivity)",
    // 3.620.0 (the 3.619.0 drive's F3): the ROLLED degree for the count —
    // Disable Device prints no Heroic line, so the declared degree turned a
    // heroic into a critical and earned two. disableSuccesses already gives a
    // blunder or a fumble nothing, so the rolled degree cannot do nothing
    // silently.
    "disableSuccesses(disableDegree)"
  ]) {
    ok(`G2 ${call.split("(")[0]} reads the declared degree`, body.includes(call),
      "reading shadowborn.degree here means a blunder, or any degree the action does "
      + "not print, silently does nothing while the card says otherwise");
  }
  ok("G2b and Dispel's half-refund does too",
    /const halved = degree === "critical" \|\| degree === "partial";/.test(body));
  ok("G2c and Recharge Item's PP",
    /rechargeAmount\(\s*degree,/.test(body));

  for (const gate of [
    'action.key === "rechargeItem" && rechargeSetup && degree',
    'action.key === "detectDeception" && targetActor && degree',
    'action.key === "gatherHerbs" && gatherHerbsSetup && degree',
    'action.key === "coverTracks" && coverTracksCount !== null && degree',
    '(action.key === "disableADevice" || action.key === "pickLock") && degree'
  ]) {
    ok(`G3 gated on degree: ${gate.slice(0, 44)}…`, body.includes(gate),
      "gating on rawDegree lets a degree the action does not declare reach a handler "
      + "that has no branch for it");
  }
}

/* ================================================================== *
 * X. THE DEAD EXTRACTOR IS GONE (D16)
 * ================================================================== */

const oe = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "outcome-effects.mjs"), "utf8");
// THE DECLARATION IS WHAT IS SEARCHED FOR, not the bare name: the
// header above deliberately NAMES all nine so a later reader can find
// what used to be here, and a search for the bare name would therefore
// fail against the very comment that records the removal.
for (const name of [
  "const APPLY_VERB", "const ADJECTIVAL_FOLLOWERS", "const GM_DISCRETION",
  "const ADJUSTS_EXISTING", "const NON_CREATURE_SUBJECT", "const LABEL_ALIASES",
  "function spellings", "function subjectFor", "function clausesOf"
]) {
  ok(`X1 ${name} is gone from outcome-effects`, !oe.includes(name),
    "it was declared and never called — the module's header described an extractor that "
    + "had never run");
}
ok("X2 THE HEADER NOW SAYS WHAT THE MODULE DOES",
  /READING A MODIFIER OUT OF A SKILL ACTION/.test(oe));
ok("X3 AND RECORDS WHY IT WAS REMOVED RATHER THAN WIRED",
  /basic-action-conditions/.test(oe),
  "conditions are declared per action; a parser beside that table would be two answers "
  + "to one question");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-chapter4-skills-91-100: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter4-skills-91-100: OK — ${checks} checks. `
  + "The last six skills do what page 91 to 96 say they do.\n");
