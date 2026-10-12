/**
 * verify-chapter6-gear-144-150 — Chapter 6's gear mechanics.
 *
 * WHY THIS FILE EXISTS. The pages 141-150 audit found that Chapter 6's
 * WEALTH half is well covered — `verify-starting-wealth` (89 checks) and
 * `verify-backgrounds` (23) — while its GEAR half had no verify file at
 * all. Encumbrance, coin weight, item status and damage, the special
 * materials, the superior traits, the armour ACP and Max Dex maths, the
 * DR multiplier, donning and sleeping in armour: none of it was asked
 * anything by anybody.
 *
 * The cost of that was D1. A material that reduces an armour's check
 * penalty was ADDED to the stored penalty, which this pack writes as a
 * negative, and the sum then read for its magnitude. Thirteen of the
 * twenty-six armour pieces got the wrong figure and seven were made
 * strictly WORSE by the material meant to help them — a Legendary suit
 * of Padded acquired an ACP of 2 for being well made. Nothing complained
 * for as long as the feature has existed.
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE. That is the
 * lesson of the companion skill-points defect: a check that takes the
 * module's own constant as its expected value agrees with the defect for
 * ever.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  weightAllowance,
  encumbranceSteps,
  encumbranceSpeedSteps,
  isEncumbered,
  reducedPenalty,
  penaltyMagnitude,
  encumbranceSpeedPenalty,
  ENCUMBRANCE_SPEED_PENALTY_PER_STEP,
  totalArmourCheckPenalty,
  totalArmourSpeedPenalty
} from "../module/encumbrance.mjs";
import {
  itemStatus,
  applyItemDamage,
  breakItemValue,
  brokenArmourDR,
  coinWeight
} from "../module/items.mjs";
import {
  MATERIALS,
  QUALITY_TIERS,
  ARMOUR_SUPERIOR_TRAITS,
  computeArmourModifiers,
  computeWeaponModifiers,
  computeEffectiveLevel,
  materialDefenceWord,
  materialGrantedWeaponTraits,
  eaogSpellDCIncrease,
  eaogSaveConditionals,
  stepDownDieSize,
  DRAGONHIDE_DRAGONS,
  dragonhideEnergyTypes,
  dragonhideResistances,
  dragonhideShieldDB,
  dragonhideLabel,
  applicableMaterials
} from "../module/item-quality.mjs";
import { resolveDamageTypeField } from "../module/defences.mjs";
import { DEFENCE_MATERIALS } from "../module/defences.mjs";
import { DONNING_TIMES, FULL_SUIT_MULTIPLIER, isFullSuit, timeToAP, AP_PER_ROUND, AP_PER_MINUTE, donningTime } from "../module/donning.mjs";
import { sleepingInArmourModifier, sleepingInArmourFatigue } from "../module/items.mjs";
import { drMultiplier } from "../module/combat/damage.mjs";

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

async function packItems(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, value] of db.iterator()) out.push(value);
  await db.close();
  return out;
}

/* ================================================================== */
/* A — ENCUMBRANCE (page 146)                                          */
/* ================================================================== */

/* PRINTED: "Weight Allowance = 50 + (strength x 10)". */
eq("A1 the weight allowance formula", [-2, 0, 3, 5].map(weightAllowance), [30, 50, 80, 100]);

/* PRINTED, the Dex penalty: "a -1 penalty to any Dex based checks,
 * attacks and saving throws for each 20 lb (OR PART THEREOF) in excess."
 * PRINTED, the Speed penalty, in the very next paragraph: "For every 20
 * lbs that you are carrying in excess of your weight allowance, you also
 * take a -5 penalty to your speed" — no such phrase.
 *
 * Graham ruled on 18 September 2026 that page 146 governs, against
 * Appendix 2's ENCUMBERED entry which drops the parenthesis. So the two
 * counts round in OPPOSITE directions and cannot be one number, which is
 * what they were until 3.573.0. */
const dexSteps = [0, 1, 19, 20, 21, 40, 41].map((over) => encumbranceSteps(50 + over, 50));
const spdSteps = [0, 1, 19, 20, 21, 40, 41].map((over) => encumbranceSpeedSteps(50 + over, 50));
eq("A2 the Dex penalty counts a PART step — 1 lb over is already -1",
  dexSteps, [0, 1, 1, 1, 2, 2, 3],
  "page 146: 'for each 20 lb (or part thereof) in excess'");
eq("A3 the Speed penalty counts only FULL steps",
  spdSteps, [0, 0, 0, 1, 1, 2, 2],
  "page 146's speed clause prints no 'part thereof'");
ok("A4 and the two genuinely differ — this asymmetry IS the ruling",
  encumbranceSteps(51, 50) === 1 && encumbranceSpeedSteps(51, 50) === 0,
  "if a tidying edit ever makes these agree, one of the two printed sentences has been lost");

/* PRINTED: "If you exceed your weight allowance you gain the encumbered
 * condition." ANY excess — a separate question from the steps. */
eq("A5 encumbered on any excess at all",
  [0, 1, 19, 20].map((over) => isEncumbered(50 + over, 50)), [false, true, true, true]);
ok("A6 and not at or under the allowance",
  !isEncumbered(50, 50) && !isEncumbered(49, 50));

eq("A7 the speed penalty is -5 per step", ENCUMBRANCE_SPEED_PENALTY_PER_STEP, 5);
eq("A8 applied per step", [0, 1, 2, 3].map(encumbranceSpeedPenalty), [0, 5, 10, 15]);

/* THE CONDITION MUST ACTUALLY BE APPLIED. Until 3.573.0 `encumbered` was
 * registered and applied to nobody, and Nimble Dodge — whose printed
 * requirement is "you are not encumbered or subject to an ACP" — gated on
 * the 20 lb step count instead, so a character nineteen pounds over
 * qualified. Read from source because applying a condition needs a live
 * Foundry actor. */
const workflow = read("module", "encumbrance-workflow.mjs");
ok("A9 the workflow applies the Encumbered condition",
  /conditionId: "encumbered"/.test(workflow),
  "the condition was registered and applied to nobody");
ok("A10 keyed on ANY excess, not on the step count",
  /const encumbered = Boolean\(actor\._trgEncumbered\);/.test(workflow),
  "gating on steps would exempt a character 19 lb over");
ok("A11 and it is cleared under its own flag, separately from Immobilised",
  /const ENCUMBERED_FLAG = "encumberedByLoad";/.test(workflow),
  "sharing Immobilised's flag would clear both when only one should go");
const feats = read("module", "feats-workflow.mjs");
ok("A12 Nimble Dodge asks the condition, not the step count",
  /Boolean\(actor\._trgEncumbered\)/.test(feats)
    && !/Number\(actor\._trgEncumbranceSteps \?\? 0\) > 0/.test(feats),
  "the feat prints 'you are not encumbered'; steps are a different question");

/* PRINTED: "For coins to register as weight... you must carry 50. Each 50
 * coins will register as 1 pound of weight." COUNTS coins, not value. */
eq("A13 fifty coins weigh one pound",
  coinWeight({ gp: 50 }), 1);
eq("A14 forty-nine weigh nothing", coinWeight({ gp: 49 }), 0);
eq("A15 and it is the COUNT, not the value — 50 copper weigh the same as 50 gold",
  coinWeight({ cp: 50 }), coinWeight({ gp: 50 }));
eq("A16 mixed denominations are counted together",
  coinWeight({ gp: 25, sp: 25 }), 1);

/* ================================================================== */
/* B — THE ARMOUR CHECK PENALTY (pages 147-150)                        */
/* ================================================================== */

/* THE DEFECT THIS FILE WAS WRITTEN TO CATCH.
 *
 * PRINTED, Eaog: "all penalties are reduced by 2 (min 0)".
 * PRINTED, the Superior Armour table: the ACP column is a REDUCTION —
 * Expert 0, Master 1, Legendary 2.
 *
 * A reduction must never become a penalty. Asserted on the real pack
 * below as well, because the arithmetic being right in isolation is not
 * the same as the shipped armour coming out right. */
eq("B1 a reduction larger than the penalty floors at zero, never inverts",
  penaltyMagnitude(reducedPenalty(0, 2)), 0,
  "Padded stores 0; +2 reduction used to make it a penalty of 2");
eq("B2 a partial reduction leaves the remainder",
  penaltyMagnitude(reducedPenalty(-8, 2)), 6);
eq("B3 an exact reduction reaches zero",
  penaltyMagnitude(reducedPenalty(-2, 2)), 0);
eq("B4 a NEGATIVE delta is an increase — the Heavy superior trait",
  penaltyMagnitude(reducedPenalty(0, -1)), 1);
eq("B5 and it increases a real penalty too",
  penaltyMagnitude(reducedPenalty(-8, -1)), 9);
eq("B6 the sign it was stored with does not matter",
  penaltyMagnitude(reducedPenalty(8, 2)), penaltyMagnitude(reducedPenalty(-8, 2)),
  "this project's convention is that a penalty's sign is not meaningful");

const armour = await packItems("armour");
ok("B7 the armour pack is readable", armour.length > 0);

/* EVERY PIECE OF SHIPPED ARMOUR, against the printed rule. Eaog reduces
 * all penalties by 2, floored at 0 — so for each piece the answer is
 * max(0, |printed ACP| - 2) and nothing else. */
const eaogWrong = [];
for (const item of armour) {
  const printed = penaltyMagnitude(item.system?.penalty);
  const expected = Math.max(0, printed - 2);
  const mods = computeArmourModifiers("standard", "eaog", [], { category: item.system?.category || "" });
  const actual = penaltyMagnitude(reducedPenalty(item.system?.penalty, mods.acpDelta));
  if (actual !== expected) eaogWrong.push(`${item.name} (${printed} -> expected ${expected}, got ${actual})`);
}
ok(`B8 every one of the ${armour.length} shipped armour pieces gets Eaog's reduction right`,
  eaogWrong.length === 0, eaogWrong.slice(0, 6).join("; "));

const legendaryWrong = [];
for (const item of armour) {
  const printed = penaltyMagnitude(item.system?.penalty);
  const expected = Math.max(0, printed - 2);
  const mods = computeArmourModifiers("legendary", "", [], { category: item.system?.category || "" });
  const actual = penaltyMagnitude(reducedPenalty(item.system?.penalty, mods.acpDelta));
  if (actual !== expected) legendaryWrong.push(`${item.name} (${printed} -> expected ${expected}, got ${actual})`);
}
ok("B9 and Legendary quality's reduction of 2 likewise",
  legendaryWrong.length === 0, legendaryWrong.slice(0, 6).join("; "));

ok("B10 no shipped armour is made WORSE by a material meant to help it",
  armour.every((item) => {
    const plain = penaltyMagnitude(item.system?.penalty);
    const mods = computeArmourModifiers("standard", "mithril", [], { category: item.system?.category || "" });
    return penaltyMagnitude(reducedPenalty(item.system?.penalty, mods.acpDelta)) <= plain;
  }),
  "seven pieces used to come out with a larger ACP for being made of Mithril");

/* PRINTED, page 149: "if you wear armour that you not proficient in, all
 * penalties are doubled." */
eq("B11 a non-proficient wearer's penalty doubles",
  totalArmourCheckPenalty([{ penalty: -4, proficient: false }]), 8);
eq("B12 and a proficient one's does not",
  totalArmourCheckPenalty([{ penalty: -4, proficient: true }]), 4);
eq("B13 pieces sum",
  totalArmourCheckPenalty([{ penalty: -4, proficient: true }, { penalty: -2, proficient: true }]), 6);

eq("B14 armour speed penalties floor at zero under a reduction",
  totalArmourSpeedPenalty([{ speedPenalty: -5, speedPenaltyDelta: 10 }]), 0);

/* ================================================================== */
/* C — THE SUPERIOR ARMOUR TABLE (page 150)                            */
/* ================================================================== */

/* PRINTED: Quality | ACP | MAX DEX | HP
 *          Expert     0     +1       +10%
 *          Master     1     +2       +20%
 *          Legendary  2     +3       +30%
 * and "Expert armour may have one additional trait when crafted, master
 * two and legendary three." */
const PRINTED_SUPERIOR = {
  expert: { acp: 0, maxDex: 1, hp: 10, traits: 1 },
  master: { acp: 1, maxDex: 2, hp: 20, traits: 2 },
  legendary: { acp: 2, maxDex: 3, hp: 30, traits: 3 }
};
for (const [tier, printed] of Object.entries(PRINTED_SUPERIOR)) {
  const entry = QUALITY_TIERS[tier];
  eq(`C1.${tier} the printed superior armour row`,
    [entry?.armour?.acpReduction, entry?.armour?.maxDexBonus, entry?.armour?.hpPercent, entry?.maxTraits],
    [printed.acp, printed.maxDex, printed.hp, printed.traits]);
}

/* PRINTED, the seven traits and their exact effects. */
eq("C2 Cushioned grants +1 DR against bludgeoning",
  [ARMOUR_SUPERIOR_TRAITS.cushioned?.drBonus, ARMOUR_SUPERIOR_TRAITS.cushioned?.drBonusVsType],
  [1, "bludgeoning"]);
eq("C3 Flame Resistant, fire", ARMOUR_SUPERIOR_TRAITS.flameResistant?.drBonusVsType, "fire");
eq("C4 Insulated, electricity", ARMOUR_SUPERIOR_TRAITS.insulated?.drBonusVsType, "electricity");
eq("C5 Reinforced, slashing", ARMOUR_SUPERIOR_TRAITS.reinforced?.drBonusVsType, "slashing");
eq("C6 Warm, cold", ARMOUR_SUPERIOR_TRAITS.warm?.drBonusVsType, "cold");
/* "Heavy: ACP penalties are increased by 1 and the Max Dex is reduced by
 * 1. The DR of the armour is increased by 1 and its weight ... increased
 * by 25%." */
eq("C7 Heavy — ACP +1, Max Dex -1, DR +1, weight +25%",
  [ARMOUR_SUPERIOR_TRAITS.heavy?.acpPenaltyIncrease, ARMOUR_SUPERIOR_TRAITS.heavy?.maxDexReduction,
    ARMOUR_SUPERIOR_TRAITS.heavy?.drBonus, ARMOUR_SUPERIOR_TRAITS.heavy?.weightPercent],
  [1, 1, 1, 25]);
/* "Lightweight: ACP is reduced by 1, Max Dex increased by 1 and Speed
 * penalties reduced by 5. Furthermore, the weight ... reduced by 25%." */
eq("C8 Lightweight — ACP -1, Max Dex +1, Speed penalty -5, weight -25%",
  [ARMOUR_SUPERIOR_TRAITS.lightweight?.acpReduction, ARMOUR_SUPERIOR_TRAITS.lightweight?.maxDexBonus,
    ARMOUR_SUPERIOR_TRAITS.lightweight?.speedPenaltyReduction, ARMOUR_SUPERIOR_TRAITS.lightweight?.weightPercent],
  [1, 1, 5, -25]);
eq("C9 seven armour traits, no more and no fewer",
  Object.keys(ARMOUR_SUPERIOR_TRAITS).length, 7,
  "page 150 prints Cushioned, Flame Resistant, Heavy, Insulated, Lightweight, Reinforced, Warm");
/* "Each armour trait increases the total level of the armour ... by 1." */
eq("C10 each trait adds one level",
  [0, 1, 2, 3].map((n) => computeEffectiveLevel(0, "standard", "", ["cushioned", "warm", "insulated"].slice(0, n))),
  [0, 1, 2, 3]);

/* ================================================================== */
/* D — SPECIAL MATERIALS (pages 147-148)                               */
/* ================================================================== */

/* PRINTED level modifiers, typed from the page. */
const PRINTED_LEVEL_DELTA = {
  adamantine: 5, coldIron: 2, densewood: 2, dragonhide: 3,
  eaog: 6, mithril: 4, silver: 1, alchemicalSilver: 2
};
for (const [key, delta] of Object.entries(PRINTED_LEVEL_DELTA)) {
  eq(`D1.${key} the printed level modifier`, MATERIALS[key]?.levelDelta, delta);
}

/* "Weapons constructed of a special material automatically overcome that
 * type of resistance." Mithril: "classed as silver for overcoming
 * resistance." Alchemical silver: "all the benefits of silver." */
eq("D2 Mithril overcomes SILVER resistance, not 'mithril' resistance",
  materialDefenceWord("mithril"), "silver",
  "the label was handed to the defence layer, and nothing is weak to mithril");
eq("D3 Alchemical Silver likewise", materialDefenceWord("alchemicalSilver"), "silver");
eq("D4 Cold Iron and Silver are unchanged",
  [materialDefenceWord("coldIron"), materialDefenceWord("silver")], ["cold iron", "silver"]);
ok("D5 and all four are words the defence layer actually recognises",
  ["mithril", "alchemicalSilver", "coldIron", "silver"]
    .every((key) => DEFENCE_MATERIALS.includes(materialDefenceWord(key))),
  "a word DEFENCE_MATERIALS does not list bypasses nothing");

/* "Densewood weapons gain the Keen Trait" / Eaog "weapons inflict an
 * additional die of base damage and gain the Keen trait" / Mithril
 * "weapons ... gain the Keen trait". */
for (const key of ["densewood", "eaog", "mithril"]) {
  ok(`D6.${key} ${key} weapons gain Keen`,
    materialGrantedWeaponTraits({ material: key }).includes("keen"));
}
ok("D7 and a plain weapon does not",
  !materialGrantedWeaponTraits({ material: "" }).includes("keen"));
ok("D8 nor does one made of a material that does not grant it",
  !materialGrantedWeaponTraits({ material: "adamantine" }).includes("keen"));

/* THE READER MUST EXIST, not just the value. Keen is detected by a regex
 * over the weapon's own traits string, and customisation writes the
 * material key instead — so for as long as the materials have existed,
 * `grantedTraits` was computed and discarded. */
const attack = read("module", "combat", "attack-workflow.mjs");
ok("D9 the attack workflow reads the material's granted traits",
  /materialGrantedWeaponTraits\(weaponData\)\.includes\("keen"\)/.test(attack),
  "without this the computed Keen reaches nothing");

/* "Adamantine weapons inflict an additional die of base damage" and the
 * same for Eaog; "Silver weapons ... reduce their damage die size by 1
 * step." */
eq("D10 Adamantine and Eaog each add a die",
  [computeWeaponModifiers("standard", "adamantine", []).extraDice,
    computeWeaponModifiers("standard", "eaog", []).extraDice], [1, 1]);
eq("D11 Silver steps the damage die down by one",
  computeWeaponModifiers("standard", "silver", []).damageDieStepDown, 1);
eq("D12 and the stepper walks the ladder", [stepDownDieSize(8), stepDownDieSize(6)], [6, 4]);

/* "All Spell Casting DCs are increased by 2 and the wearer also gains a
 * +2-item bonus to all saving throws against magic" — Eaog. Both figures
 * existed on the material and were read by nothing. */
const eaogWorn = [{ type: "armour", system: { equipped: true, material: "eaog" } }];
const plainWorn = [{ type: "armour", system: { equipped: true, material: "" } }];
const eaogCarried = [{ type: "armour", system: { equipped: false, material: "eaog" } }];
eq("D13 Eaog raises the wearer's casting DCs by 2", eaogSpellDCIncrease(eaogWorn), 2);
eq("D14 and only while it is worn", eaogSpellDCIncrease(eaogCarried), 0);
eq("D15 plain armour raises nothing", eaogSpellDCIncrease(plainWorn), 0);
eq("D16 two Eaog pieces are still +2 — it is the material, not the count",
  eaogSpellDCIncrease([...eaogWorn, ...eaogWorn]), 2);
const eaogSaves = eaogSaveConditionals(eaogWorn);
eq("D17 the +2 against magic is offered as ONE conditional", eaogSaves.length, 1);
eq("D18 worth +2, typed item", [eaogSaves[0]?.value, eaogSaves[0]?.type], [2, "item"]);
ok("D19 and NOT automatic — the system cannot tell a spell from a pit trap",
  eaogSaves[0]?.auto === false,
  "pooling it would grant +2 against a falling rock");
eq("D20 scoped to saving throws", eaogSaves[0]?.when?.checkTypes, ["save"]);
eq("D21 plain armour offers none", eaogSaveConditionals(plainWorn), []);
const actorSource = read("module", "documents", "actor.mjs");
ok("D22 the actor publishes them where collectConditionals will look",
  /\.\.\.eaogSaveConditionals\(Array\.from\(actor\.items \?\? \[\]\)\)/.test(actorSource));
ok("D23 and the casting DC reaches the assembler that prints its parts",
  /materialPenalty: Number\(system\.magic\?\.materialCastingDC \?\? 0\)/
    .test(read("module", "magic", "cast-workflow.mjs")),
  "a DC contributor that is not in `parts` is one the card never shows");

/* ================================================================== */
/* E — ITEM DAMAGE AND THE BROKEN CONDITION (page 146)                 */
/* ================================================================== */

/* PRINTED: "It becomes broken when its Hit Points are reduced to 0. If
 * its HP are reduced to a negative value equal to half its HP (round up)
 * it is destroyed." */
eq("E1 intact above zero", itemStatus(1, 20), "intact");
eq("E2 broken AT zero", itemStatus(0, 20), "broken");
eq("E3 still broken just above the destroyed line", itemStatus(-9, 20), "broken");
eq("E4 destroyed at negative half, which ROUNDS UP", itemStatus(-10, 20), "destroyed");
/* THE ROUNDING ONLY SHOWS ON AN ODD MAXIMUM, AND ONLY AT ONE VALUE.
 * Half of 15 rounds UP to 8, so -8 is destroyed and -7 is still broken.
 * The first version of this check asserted -8 was destroyed, which is
 * true under either rounding and therefore proved nothing — caught by
 * mutate-chapter6-gear-144-150, whose floor mutation survived it. */
eq("E5a an odd maximum: destroyed at negative half ROUNDED UP",
  itemStatus(-8, 15), "destroyed", "half of 15 rounds up to 8");
eq("E5b and one point short of it is still only broken",
  itemStatus(-7, 15), "broken",
  "flooring would destroy it here — this is the value that tells the two apart");
eq("E6 an item with no maximum HP is untracked, not broken", itemStatus(0, 0), "untracked");

/* PRINTED: "Each time an item takes HP damage, reduce it by an amount
 * equal to the items DR." */
eq("E7 damage is reduced by the item's DR", applyItemDamage(20, 10, 4), 14);
eq("E8 and never heals when DR exceeds the damage", applyItemDamage(20, 3, 9), 20);

/* PRINTED: "if an effect makes an item broken automatically it is
 * reduced to 0 HP ... if the item had more Hit Points than that." */
eq("E9 breaking an item outright takes it to 0", breakItemValue(17), 0);
eq("E10 and never heals one already below", breakItemValue(-6), -6);

/* PRINTED: "Broken armour has it DR reduced by 50%." */
eq("E11 broken armour keeps half its DR, rounded down",
  [6, 5, 1, 0].map(brokenArmourDR), [3, 2, 0, 0]);

/* PRINTED: "With the exception of armour, a broken object can't be used
 * for its normal function, nor does it grant bonuses."
 *
 * ENFORCED SINCE 3.573.0, per Graham's ruling of 18 September 2026 —
 * before that the sentence was printed to chat and a broken weapon still
 * attacked. Read from source: both sites need a live document. */
ok("E12 a broken weapon is refused before the attack begins",
  /if \(weaponCondition === "broken" \|\| weaponCondition === "destroyed"\)/.test(attack),
  "a weapon's normal function is attacking");
ok("E13 and refused BEFORE any AP is spent or a target prompted",
  attack.indexOf("const weaponCondition = itemStatus(")
    < attack.indexOf("const confirmed = skipTargetPrompt"),
  "refusing after the cost would take the action and give nothing");
const effectDoc = read("module", "documents", "active-effect.mjs");
ok("E14 a broken item's effects are suppressed, so it grants no bonuses",
  /get isSuppressed\(\)/.test(effectDoc)
    && /itemStatus\(hp\.value, hp\.max\)/.test(effectDoc),
  "`isSuppressed` is Foundry's own hook for this and covers every consumer at once");
ok("E15 an item with no HP maximum is never suppressed",
  /!== "untracked"/.test(effectDoc),
  "every ordinary item in the game is untracked; suppressing those would disable the world");

/* "A destroyed item can't be Repaired." The Crafting path always
 * refused; the GM Modifier tool did not. */
const modifier = read("module", "modifier", "app.mjs");
ok("E16 the GM tool refuses to repair a destroyed item",
  /itemStatus\(before, max\) === "destroyed"/.test(modifier));
ok("E17 and reduces damage by DR, not by the always-zero `hardness`",
  /Number\(item\.system\?\.dr \?\? 0\) \|\| 0,/.test(modifier),
  "hardness is 0 on all 26 armour and all 12 shields, so the tool applied every point in full");

/* The one effect in the system that breaks an item now does so. */
ok("E18 Item Depletion's broken result is flagged as breaking",
  /breaks: true,/.test(read("module", "magic-items.mjs")));
ok("E19 and the workflow carries it out rather than announcing it",
  /await item\.update\(\{ "system\.hp\.value": after \}\);/
    .test(read("module", "magic-items-workflow.mjs")));

/* ================================================================== */
/* F — ARMOUR: DR MULTIPLIER, DONNING, SLEEPING (pages 149-150)        */
/* ================================================================== */

/* PRINTED DR MULTIPLIER TABLE:
 *   BDB 0-5 Base, 6-11 x2, 12-17 x3, 18-23 x4, 24+ x5 */
eq("F1 the printed DR multiplier bands",
  [0, 5, 6, 11, 12, 17, 18, 23, 24, 30].map(drMultiplier),
  [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);

/* PRINTED: "Donning light armour takes 5 rounds, medium armour takes 4
 * minutes, and heavy armour takes 10 minutes; these times are doubled
 * when donning a full suit of armour." */
eq("F2 light armour, 5 rounds", DONNING_TIMES.light, { rounds: 5 });
eq("F3 medium armour, 4 minutes", DONNING_TIMES.medium, { minutes: 4 });
eq("F4 heavy armour, 10 minutes", DONNING_TIMES.heavy, { minutes: 10 });
eq("F5 doubled for a full suit", FULL_SUIT_MULTIPLIER, 2);
eq("F6 a round is 3 AP and a minute 30", [AP_PER_ROUND, AP_PER_MINUTE], [3, 30]);
eq("F7 the printed times in action points",
  [timeToAP(DONNING_TIMES.light), timeToAP(DONNING_TIMES.medium), timeToAP(DONNING_TIMES.heavy)],
  [15, 120, 300]);

/* A SUIT IS DECIDED BY COVERAGE, not by its name. Page 149: "Each of
 * these suits includes greaves and bracers" — legs and arms as well as
 * the torso. The doubling was dead code until 3.573.0: `donningTimeFor`
 * took a `fullSuit` option no caller passed. */
ok("F8 a piece covering torso, arms and legs is a full suit",
  isFullSuit({ system: { coversTorso: true, coversArms: true, coversLegs: true } }));
ok("F9 a breastplate is not",
  !isFullSuit({ system: { coversTorso: true, coversArms: false, coversLegs: false } }));
ok("F10 and neither is a helmet",
  !isFullSuit({ system: { isHelmet: true, coversTorso: false, coversArms: false, coversLegs: false } }),
  "guessing from the name would have doubled the Full Helmet");

const suits = armour.filter((item) => isFullSuit(item));
ok(`F11 the pack's suits of armour are recognised (${suits.length} found)`,
  suits.length >= 5 && suits.every((item) => /^Full /.test(item.name)),
  suits.map((s) => s.name).join(", "));
/* A SUIT MAY INCLUDE A HELMET AND STILL BE A SUIT. Page 149: "Each of
 * these suits includes greaves and bracers of an appropriate material
 * and MAY ALSO INCLUDE A HELMET (if stated)" — and three of the five do.
 * The first version of this check excluded anything with `isHelmet` and
 * failed on Full Platemail, which was my reading of the page being
 * wrong, not the data. What must not be a suit is a piece worn ALONE:
 * a helmet, bracers or greaves cover none of torso, arms and legs. */
ok("F12 a standalone helmet, bracers or greaves are not a suit",
  !armour.some((item) => isFullSuit(item) && !/^Full /.test(item.name)),
  armour.filter((i) => isFullSuit(i) && !/^Full /.test(i.name)).map((i) => i.name).join(", "));
ok("F12b and none of the fittings sold separately qualifies",
  ["Metal Helmet", "Leather Helmet", "Full Helmet", "Chain Bracers", "Leather Bracers", "Leather Greaves"]
    .every((name) => {
      const item = armour.find((a) => a.name === name);
      return !item || !isFullSuit(item);
    }),
  "a fitting covers one location; a suit covers three");
ok("F13 the sheet asks for the doubling",
  /donningTimeFor\(this\.item, \{ fullSuit: isFullSuit\(this\.item\) \}\)/
    .test(read("module", "sheets", "item-sheet.mjs")),
  "the multiplier existed and no caller ever passed the option");

/* PRINTED: "you must make a DC 20 Fortitude Saving throw. Success You
 * have no fatigue / Failure You gain fatigue 1 / Fumble You gain fatigue
 * 2. This check has the following modifiers: Light Armour +5, Heavy
 * Armour -5, Rigid -1, Metal -2." */
eq("F14 sleeping in armour — the printed fatigue ladder",
  ["success", "failure", "fumble"].map(sleepingInArmourFatigue), [0, 1, 2]);
eq("F15 a critical is no worse than a success", sleepingInArmourFatigue("critical"), 0);
eq("F16 light armour, +5",
  sleepingInArmourModifier({ category: "light" }), 5);
eq("F17 heavy armour, -5",
  sleepingInArmourModifier({ category: "heavy" }), -5);
eq("F18 rigid metal heavy armour stacks all three: -5 -1 -2",
  sleepingInArmourModifier({ category: "heavy", rigid: true, metal: true }), -8);
eq("F19 medium armour has no category modifier of its own",
  sleepingInArmourModifier({ category: "medium" }), 0);
eq("F20 and Rigid and Metal still stack on Medium",
  sleepingInArmourModifier({ category: "medium", rigid: true, metal: true }), -3,
  "the two are traits, not weight classes");


/* ================================================================== */
/* G — DRAGONHIDE'S DRAGON (page 147, and Graham's table)              */
/* ================================================================== */

/* PRINTED, page 147: "A dragonhide shield provides an additional +2 DB
 * when used against the energy type of the dragon the scales were
 * harvested from. Dragonhide armour grants the wearer resistance against
 * the same energy type."
 *
 * THE DRAGONS, from Graham on 19 September 2026 — typed here as he gave
 * them, never read out of the module, so the module is checked against
 * the ruling rather than against itself:
 *
 *   Cave - Acid        Cold - Cold          Fire - Fire
 *   Forest - Poison    Guardian - Force     Light - Electricity
 *   Sea - Sonic        Shade - Cold and Fire
 *
 * Until 3.574.0 both effects were computed on the material and could
 * never fire, because nothing recorded which dragon. */
const GRAHAMS_DRAGONS = {
  cave: ["acid"], cold: ["cold"], fire: ["fire"], forest: ["poison"],
  guardian: ["force"], light: ["electricity"], sea: ["sonic"], shade: ["cold", "fire"]
};
eq("G1 exactly the eight dragons Graham listed",
  Object.keys(DRAGONHIDE_DRAGONS).sort(), Object.keys(GRAHAMS_DRAGONS).sort());
for (const [dragon, energy] of Object.entries(GRAHAMS_DRAGONS)) {
  eq(`G2.${dragon} the ${dragon} dragon carries ${energy.join(" and ")}`,
    dragonhideEnergyTypes({ material: "dragonhide", dragonType: dragon }), energy);
}

/* EVERY ENERGY WORD MUST BE ONE THE DAMAGE PIPELINE READS. A resistance
 * written in a word `resolveDamageTypeField` does not know is a
 * resistance that halves nothing, and says nothing about it. */
for (const [dragon, energy] of Object.entries(GRAHAMS_DRAGONS)) {
  const read = [...resolveDamageTypeField(energy.join(", ")).damageTypes];
  eq(`G3.${dragon} the damage pipeline reads ${dragon}'s resistance as a damage type`,
    read.sort(), [...energy].sort());
}

const suit = (dragonType, extra = {}) =>
  ({ type: "armour", system: { equipped: true, material: "dragonhide", dragonType, ...extra } });
const dhShield = (dragonType, extra = {}) =>
  ({ type: "shield", system: { equipped: true, material: "dragonhide", dragonType, ...extra } });

eq("G4 Fire Dragonhide armour resists fire", dragonhideResistances([suit("fire")]), ["fire"]);
eq("G5 SHADE resists BOTH cold and fire — never only the first",
  dragonhideResistances([suit("shade")]), ["cold", "fire"]);
eq("G6 two Fire pieces are ONE resistance — it halves once, however granted",
  dragonhideResistances([suit("fire"), suit("fire")]), ["fire"]);
eq("G7 a Dragonhide SHIELD resists nothing — the page gives shields the DB, armour the resistance",
  dragonhideResistances([dhShield("fire")]), []);
eq("G8 Dragonhide with no dragon chosen grants nothing", dragonhideResistances([suit("")]), []);
eq("G9 an unknown dragon grants nothing rather than a guess", dragonhideResistances([suit("purple")]), []);
eq("G10 a dragon recorded on a NON-Dragonhide item grants nothing",
  dragonhideResistances([{ type: "armour", system: { equipped: true, material: "mithril", dragonType: "fire" } }]), []);
eq("G11 armour carried rather than worn grants nothing",
  dragonhideResistances([suit("fire", { equipped: false })]), []);
/* THE WORN-MATERIAL GATE: broken armour keeps protecting — the printed
 * exception to Broken is armour, whose DR halves and goes on working —
 * and destroyed armour does not. */
eq("G12 BROKEN Dragonhide armour still resists — like its DR, it goes on protecting",
  dragonhideResistances([suit("fire", { hp: { value: 0, max: 20 } })]), ["fire"]);
eq("G13 DESTROYED Dragonhide armour resists nothing",
  dragonhideResistances([suit("fire", { hp: { value: -10, max: 20 } })]), []);
ok("G14 and the same gate now covers Eaog, which had none",
  eaogSpellDCIncrease([{ type: "armour", system: { equipped: true, material: "eaog", hp: { value: -10, max: 20 } } }]) === 0,
  "destroyed Eaog armour was the one thing still warding its wearer");

eq("G15 the shield: +2 DB against its dragon's energy",
  dragonhideShieldDB([dhShield("fire")], ["fire"]), 2);
eq("G16 and nothing against any other type",
  ["cold", "acid", "slashing", "piercing"].map((t) => dragonhideShieldDB([dhShield("fire")], [t])), [0, 0, 0, 0]);
eq("G17 a Shade shield raises DB against either of its two",
  [dragonhideShieldDB([dhShield("shade")], ["cold"]), dragonhideShieldDB([dhShield("shade")], ["fire"])], [2, 2]);
eq("G18 never more than +2, whatever else is carried",
  dragonhideShieldDB([dhShield("fire"), dhShield("fire")], ["fire"]), 2);
eq("G19 Dragonhide ARMOUR gives no DB — that half is the shield's",
  dragonhideShieldDB([suit("fire")], ["fire"]), 0);
eq("G20 an attack of unknown type meets no bonus", dragonhideShieldDB([dhShield("fire")], []), 0);
eq("G21 matched however the incoming type is cased", dragonhideShieldDB([dhShield("fire")], ["FIRE"]), 2);

eq("G22 the sheet names the dragon and its energy",
  dragonhideLabel({ material: "dragonhide", dragonType: "shade" }), "Shade dragon — cold and fire");
eq("G23 and says nothing for an item that is not Dragonhide",
  dragonhideLabel({ material: "mithril", dragonType: "fire" }), "");

/* THE WIRING, from source: all three sites need a live Foundry. */
ok("G24 the actor writes Dragonhide resistance into the field the damage pipeline reads",
  /\.\.\.runeEffects\.resistances, \.\.\.materialResistances/.test(actorSource)
    && /dragonhideResistances\(Array\.from\(actor\.items \?\? \[\]\)\)/.test(actorSource));
const castSource = read("module", "magic", "cast-workflow.mjs");
ok("G25 a spell attack meets the shield, keyed on the type the spell will DEAL",
  /const dealtType = String\(warpMods\?\.elementalType \?\? damageType\)\.toLowerCase\(\);/.test(castSource)
    && /dragonhideShieldDB\(Array\.from\(targetActor\.items \?\? \[\]\), \[dealtType\]\)/.test(castSource),
  "an energy attack against DB is almost always a spell");
ok("G26 and the card prints the DB it actually compared against",
  !/vs DB \$\{baseDB\}/.test(castSource) && /vs DB \$\{defendedDB\}/.test(castSource),
  "'attack 17 vs DB 16 — Miss' is a card that contradicts itself");
ok("G27 a weapon strike meets it too, beside Arrow Catching",
  /\+ arrowCatchingDB \+ dragonhideDB \+/.test(attack)
    && /dragonhideShieldDB\(Array\.from\(targetActor\.items \?\? \[\]\), \[weaponData\.damageType\]\)/.test(attack));

/* THE DIALOG: the dragon is chosen with the material, and discarded when
 * the material changes. */
const dialog = read("module", "item-customize-workflow.mjs");
ok("G28 the customise dialog offers the dragon",
  /class="trg-customise-dragon"/.test(dialog));
ok("G29 and drops it when the material is not Dragonhide",
  /dragonType: form\.querySelector\("\.trg-customise-material"\)\.value === "dragonhide"/.test(dialog),
  "a suit re-made in Mithril must not quietly keep a dragon");
for (const writer of ["customise-on-add.mjs", "picker-workflow.mjs", ["sheets", "item-sheet.mjs"]]) {
  const parts = Array.isArray(writer) ? writer : [writer];
  const text = read("module", ...parts);
  ok(`G30.${parts.at(-1)} ${parts.at(-1)} writes the chosen dragon back to the item`,
    /dragonType/.test(text) && /choice\.dragonType/.test(text),
    "a dialog whose answer nobody writes down is a dialog that does nothing");
}
const schema = JSON.parse(read("template.json"));
eq("G31 armour and shields both carry the field",
  [schema.Item.armour.dragonType, schema.Item.shield.dragonType], ["", ""]);

/* PRINTED: "can only be utilized in the crafting of medium or heavy
 * armour as well as METAL shields." */
ok("G32 Dragonhide is refused for a wooden shield",
  !applicableMaterials("shield", "light", { metal: false }).some((m) => m.key === "dragonhide"));
ok("G33 offered for a metal one",
  applicableMaterials("shield", "light", { metal: true }).some((m) => m.key === "dragonhide"));
ok("G34 and not refused on a guess when the caller does not know",
  applicableMaterials("shield", "light").some((m) => m.key === "dragonhide"));
ok("G35 the other materials are untouched by the metal rule",
  applicableMaterials("shield", "light", { metal: false }).some((m) => m.key === "densewood"));
const shields = await packItems("shields");
ok(`G36 every shipped shield records whether it is metal (${shields.length})`,
  shields.length > 0 && shields.every((s) => typeof s.system?.metal === "boolean"),
  "the restriction reads this field; a shield without it could never be refused");


/* ================================================================== */
/* H — WHAT LIVE TESTING OF 3.574.0 FOUND                              */
/* ================================================================== */

/* THREE DEFECTS, each invisible to every check above because each is
 * about what a real world shows rather than what a rule computes.
 *
 * H1-H3: THE CONDITION'S NAME AND ICON. Encumbered is kept off the token
 * HUD, so it is not in CONFIG.statusEffects, and the sync looked only
 * there — every overloaded character wore an effect called "encumbered"
 * with Foundry's default aura icon. */
ok("H1 the condition's name falls back to the registry, not to the raw id",
  /: \(registered\?\.label \?\? conditionId\);/.test(workflow)
    && /const registered = CONDITIONS\[conditionId\];/.test(workflow),
  "a HUD-less condition is not in CONFIG.statusEffects; the registry holds every label");
ok("H2 and so does its icon",
  /const img = status\?\.img \?\? registered\?\.icon;/.test(workflow));
ok("H3 the registry is imported where it is used",
  /import \{ CONDITIONS \} from "\.\/conditions\/registry\.mjs";/.test(workflow));

/* H4-H6: A CHARACTER ALREADY OVERLOADED. The sync fired on a change, so
 * a character over its allowance when the world opened — or created that
 * way — carried the load and none of the condition. The original test
 * kit was 1 lb over and unconditioned on the day. */
ok("H4 an actor created already overloaded is synced",
  /Hooks\.on\("createActor", \(actor\) => sync\(actor\)\);/.test(workflow));
ok("H5 every actor is synced once when the world opens",
  /Hooks\.once\("ready", \(\) => \{\s*for \(const actor of game\.actors \?\? \[\]\) \{\s*void syncEncumbranceImmobilised\(actor, \{ quiet: true \}\);/.test(workflow),
  "installing the release left every overloaded character exactly as it was");
ok("H6 and quietly — no banner per overloaded character on opening a world",
  /notice: encumbered && !quiet/.test(workflow) && /notice: quiet \? "" :/.test(workflow));

/* H7-H10: THE DONNING SENTENCE. "Doubled for a full suit of armour" was
 * written when the doubling was NOT applied; once 3.573.0 applied it,
 * the same words under "20 minutes" read as an instruction to double
 * again. The sheet now says which case the number is. */
eq("H7 a full suit's time says it already includes the doubling",
  donningTime("heavy", { fullSuit: true }).doubled, true);
eq("H8 an ordinary piece's does not", donningTime("heavy", { fullSuit: false }).doubled, false);
const sheetTemplate = read("templates", "item", "item-sheet.hbs");
ok("H9 the sheet reads `doubled` to choose its sentence",
  /\{\{#if donning\.doubled\}\}\s*Already doubled/.test(sheetTemplate)
    && /Doubled if worn as a full suit of armour\./.test(sheetTemplate));
ok("H10 and the old unconditional sentence is gone",
  !/\{\{\/if\}\}\s*Doubled for a full suit of armour\. Removing/.test(sheetTemplate),
  "under a doubled figure it read as 'double this again'");
ok("H11 a Fleetguard time is NOT claimed as doubled — the rune's printed time replaces the chapter's",
  /doubled: false,\s*improved: ap < base\.ap,/.test(read("module", "codex-runes.mjs")));

console.log(
  failures
    ? `verify-chapter6-gear-144-150: ${failures} FAILED of ${checks}`
    : `verify-chapter6-gear-144-150: ${checks} checks passed`
);
process.exit(failures ? 1 : 0);
