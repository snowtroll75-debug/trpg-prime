/**
 * verify-chapter6-gear-181-190 — the last herbs, the oils, the poisons,
 * the vials, and the start of Chapter 7's round (pages 181-190).
 *
 * NEW at 3.578.0, for the pages 181-190 audit. Eleven defects and
 * Graham's rulings of 20 September 2026 (R1-R14):
 *
 *   - a thrown bomb that always hit and never crit, cost nothing, took no
 *     multiple attack or range penalty, and applied none of its effects
 *     (D1-D6; R4-R7);
 *   - thirteen poisons that were text (D7; R1-R3, R13);
 *   - five oils that were text (D8; R8, R9);
 *   - six herbs that were text (D9; R12);
 *   - an unconscious creature that still got its AP (D10; R14);
 *   - four items whose words had drifted from 3.8.1 (D11);
 *   - and R10 (reagents) and R11 (vials by Crafting or Nature).
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one of
 * Graham's rulings, never from the module under test.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  BOMB_STRIKE_AP, TANGLEFOOT_INTERACTS, bombAttackResult, bombCriticalDice, bombEffectsOf, bombRange, bombReaches,
  bombRidersFor, bombSaveDC, onlyVsText, recurringAfterHit, tanglefootInteract
} from "../module/bombs.mjs";
import { immuneToEffect } from "../module/traits.mjs";
import {
  POISON_COAT_FLAG, afflictionItemData, afflictionTraits, applyHandsCheck, coatActive, coatHandsCheck, conditionLockedBy,
  conditionsToWithdraw, durationRounds, exposureResult, poisonAfflictionOf, poisonCriticalSeverity, stageIntervalRounds
} from "../module/poisons.mjs";
import { exposureStartingStage } from "../module/afflictions.mjs";
import {
  OIL_COAT_FLAG, ammoSplit, armourguardAt, armourguardBonus, hpAfterArmourguard, oilCoatLive, oilOf, oilSeconds,
  oilTarget, struckMaterial
} from "../module/oils.mjs";
import { reagentEffectText, reagentMods, reagentOffers } from "../module/reagents.mjs";
import { nearbyRecipient, scaledAlchemicalEffect, activationCost } from "../module/elixirs.mjs";
import { normaliseConditional, matchesCheck } from "../module/conditionals.mjs";
import { actsThisTurn } from "../module/combat/turn-economy.mjs";
import { effectiveArmourDR } from "../module/items.mjs";
import { assembledCastingDC } from "../module/magic/casting-dc.mjs";
import { ITEM_TYPES } from "../module/create-crafting.mjs";
import { levelDC } from "../module/dice/resolution.mjs";
import { materialDefenceWord } from "../module/item-quality.mjs";
import { afflictionSpan } from "../module/afflictions.mjs";

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
// Comments are stripped before a source pattern is looked for, so a
// sentence ABOUT the code cannot pass for the code.
const code = (...parts) => read(...parts).split("\n")
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

async function packDocs(pack, prefix = "!items!") {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith(prefix) && !key.slice(prefix.length).includes("!")) out.push(value);
  }
  await db.close();
  return out;
}
const ALCH = new Map((await packDocs("alchemical")).map((d) => [d.name, d]));
const A = (name) => ALCH.get(name);
const atLevel = (item, level) => ({ ...item, system: { ...item.system, itemLevel: level } });

/* ================================================================== */
/* A — POISONS AS DATA (pages 183-184; D7, R1)                         */
/* ================================================================== */

// [name, delivery, stages: [damage, [conditions], critical]] — as printed.
const PRINTED_POISONS = Object.freeze([
  ["Arsenic", "ingested", [["1d4", ["sickened 1"], false], ["1d6", ["sickened 2"], false], ["2d6", ["sickened 3"], true]]],
  // E6: the second "Stage 3" is Stage 4.
  ["Belladonna", "ingested", [["", ["dazzled"], false], ["1d6", ["sickened 2"], false],
    ["1d6", ["dazed 1", "sickened 2"], false], ["2d6", ["sickened 3"], true]]],
  ["Black Smear", "injury", [["1d6", ["weakened 1"], false], ["1d6", ["weakened 1"], false], ["1d6", ["weakened 2"], false]]],
  ["Bloodroot", "injury", [["", ["dazed 2"], false], ["", ["dazed 2"], false], ["", ["dazed 2"], false], ["", ["dazed 2"], false]]],
  ["Blue Whinnis", "injury", [["", ["weakened 3"], false], ["", ["unconscious"], false]]],
  ["Giant Centipede Poison", "injury", [["1d10", [], false], ["1d10", ["flatFooted"], false], ["2d10", ["weakened 2"], false]]],
  ["Graveroot", "injury", [["1d10", [], false], ["2d10", [], true], ["2d10", [], true]]],
  ["Green Dragon Bile", "contact", [["6d6", ["sickened 2"], false], ["6d6", ["sickened 2"], true], ["8d6", ["sickened 4"], true]]],
  ["Greenblood Oil", "injury", [["2d10", ["sickened 1"], false], ["3d10", ["sickened 2"], false], ["4d10", ["sickened 2"], true]]],
  ["Oil of Taggit", "ingested", [["", ["unconscious"], false]]],
  ["Wyvern Poison", "injury", [["5d6", [], false], ["6d6", [], false], ["8d6", [], false]]]
]);
const condText = (c) => (c.value ? `${c.key} ${c.value}` : c.key);
for (const [name, delivery, stages] of PRINTED_POISONS) {
  const item = A(name);
  const poison = poisonAfflictionOf(item);
  ok(`A1 ${name} carries its affliction`, Boolean(poison));
  if (!poison) continue;
  eq(`A1 ${name}: delivered by ${delivery}`, poison.delivery, delivery);
  ok(`A1 ${name}: its traits name the same delivery`,
    new RegExp(`\\b${delivery}\\b`, "i").test(String(item.system?.traits ?? "")));
  eq(`A1 ${name}: the stages as printed`,
    poison.stages.map((s) => [s.damage, (s.conditions ?? []).map(condText), Boolean(s.critical)]), stages);
}
{
  const bw = poisonAfflictionOf(A("Blue Whinnis"));
  eq("A1b Blue Whinnis: stage 1 is 2 rounds; stage 2's unconsciousness lasts 1d3 hours",
    [bw.stages[0].interval, bw.stages[1].conditionDuration], ["2 rounds", "1d3 hours"]);
  eq("A1c Oil of Taggit: unconscious for the poison's 1d3 hours",
    poisonAfflictionOf(A("Oil of Taggit")).stages[0].conditionDuration, "1d3 hours");
  eq("A1d Arsenic: 'you can't reduce your sickened condition while affected'",
    poisonAfflictionOf(A("Arsenic")).locks, ["sickened"]);
}
// Kamarsk and Sumark: one save, four outcomes.
for (const [name, cond, success, failure] of [
  ["Kamarsk Oil", "blinded", ["dazzled", "10 minutes"], ["blinded", "1 hour"]],
  ["Sumark Oil", "deafened", ["deafened", "1 minute"], ["deafened", "1 hour"]]
]) {
  const p = poisonAfflictionOf(A(name));
  eq(`A2 ${name}: Critical — unaffected`, exposureResult(p, "critical").affected, false);
  eq(`A2 ${name}: Heroic reads as Critical`, exposureResult(p, "heroic").affected, false);
  const s = exposureResult(p, "success");
  eq(`A2 ${name}: Success`, [s.affected, s.outcome?.conditions?.[0]?.key, s.outcome?.conditionDuration], [true, ...success]);
  const f = exposureResult(p, "failure");
  eq(`A2 ${name}: Failure`, [f.affected, f.outcome?.conditions?.[0]?.key, f.outcome?.conditionDuration], [true, ...failure]);
  eq(`A2 ${name}: a Partial reads as a Failure`, exposureResult(p, "partial").outcome?.conditionDuration, failure[1]);
  const fu = exposureResult(p, "fumble");
  eq(`A2 ${name}: Fumble — permanently`, [fu.outcome?.conditions?.[0]?.key, fu.outcome?.conditionDuration], [cond, "permanent"]);
  eq(`A2 ${name}: a Blunder reads as a Fumble`, exposureResult(p, "blunder").outcome?.conditionDuration, "permanent");
}
// A staged poison's exposure is the engine's table.
{
  const p = poisonAfflictionOf(A("Wyvern Poison"));
  eq("A3 a staged poison: Success unaffected, Failure stage 1, Fumble stage 2",
    [exposureResult(p, "success").affected, exposureResult(p, "failure").startingStage, exposureResult(p, "fumble").startingStage],
    [false, 1, 2]);
  eq("A3b a Fumble against a one-stage poison is stage 1 (Oil of Taggit), not a stage that does not exist",
    [exposureStartingStage(2, 1), exposureStartingStage(2, 3), exposureStartingStage(1, 1), exposureStartingStage(0, 1)],
    [1, 2, 1, 0]);
}

/* ================================================================== */
/* B — THE AFFLICTION A POISON BECOMES (D7, R1, R13)                   */
/* ================================================================== */

{
  const data = afflictionItemData(A("Arsenic"));
  eq("B1 it is an affliction item, level-based Fortitude at the poison's level",
    [data.type, data.system.savingThrow, data.system.level, data.system.maxStage, data.system.incubating, data.system.currentStage],
    ["affliction", "fortitude", 1, 3, true, 0]);
  eq("B1b its save DC is the level DC — 'level-based fortitude saves' (p.183)", levelDC(data.system.level), 15);
  eq("B1c each stage keeps its damage, its conditions and its poison critical",
    data.system.stages.map((s) => [s.damage, s.conditions.length, s.criticalOnFailure, s.criticalDamageType]),
    [["1d4", 1, false, "poison"], ["1d6", 1, false, "poison"], ["2d6", 1, true, "poison"]]);
  eq("B1d what poisons add rides in a flag", Object.keys(data.flags["trg-prime"].poison).sort(),
    ["applied", "delivery", "durationRounds", "elapsedRounds", "locks", "outcomes"]);
  eq("B1e Arsenic's minutes are not rounds", data.flags["trg-prime"].poison.durationRounds, null);
  eq("B1f Wyvern Poison's 6 rounds are", afflictionItemData(A("Wyvern Poison")).flags["trg-prime"].poison.durationRounds, 6);
  ok("B1g a consumable with no poison is not one", afflictionItemData(A("Antitoxin")) === null && poisonAfflictionOf(A("Fire Oil")) === null);
}
// R1: stages that run in rounds are the end phase's; minutes keep the button.
eq("B2 a stage's rounds: 1 round, 2 rounds, none printed in a rounds poison, minutes in a rounds poison, minutes",
  [
    stageIntervalRounds({ interval: "1 round" }, 6),
    stageIntervalRounds({ interval: "2 rounds" }, null),
    stageIntervalRounds({ interval: "" }, 4),
    stageIntervalRounds({ interval: "1 minute" }, 4),
    stageIntervalRounds({ interval: "1 minute" }, null),
    stageIntervalRounds({ interval: "10 minutes" }, durationRounds("30 minutes"))
  ],
  [1, 2, 1, 1, null, null]);
// R13: the severity is the margin the save failed by, as a spell's.
eq("B3 poison critical: a failure by 4 is none; by 5 minor, 15 serious, 25 deadly",
  [-4, -5, -14, -15, -24, -25, 3].map(poisonCriticalSeverity), [null, "minor", "minor", "serious", "serious", "deadly", null]);
// What a stage takes back when it ends.
eq("B4 withdrawing a stage: a valued condition by what it added, a plain one only if it put it there",
  conditionsToWithdraw([
    { key: "sickened", value: 2, added: true },
    { key: "dazzled", value: null, added: true },
    { key: "blinded", value: null, added: false },
    { key: "weakened", value: 1, added: false }
  ], (k) => ({ sickened: 3, dazzled: 1, blinded: 1, weakened: 1 })[k] ?? null),
  [
    { key: "sickened", value: 1, remove: false },
    { key: "dazzled", value: null, remove: true },
    { key: "weakened", value: null, remove: true }
  ]);
{
  const arsenic = (stage) => ({ type: "affliction", name: "Arsenic", system: { currentStage: stage },
    flags: { "trg-prime": { poison: { locks: ["sickened"] } } } });
  eq("B5 Arsenic locks Sickened once it has taken hold, and not before",
    [conditionLockedBy([arsenic(2)], "sickened"), conditionLockedBy([arsenic(0)], "sickened"), conditionLockedBy([arsenic(2)], "dazed")],
    ["Arsenic", null, null]);
}

/* ================================================================== */
/* C — APPLYING A POISON (R1-R3)                                       */
/* ================================================================== */

{
  const weapon = { id: "w", type: "weapon", system: { equipped: true, size: "M", traits: "" } };
  const shield = { id: "s", type: "shield", system: { equipped: true, size: "M" } };
  const dagger = { id: "d", type: "weapon", system: { equipped: true, size: "S", traits: "" } };
  const vial = { id: "p", type: "consumable", system: { equipped: true } };
  eq("C1 R3: coating a weapon takes two hands — the weapon's own and the vial's do not count against them",
    [coatHandsCheck([weapon, vial], weapon, vial).ok, coatHandsCheck([weapon, shield, vial], weapon, vial).ok,
      coatHandsCheck([weapon, dagger], weapon, vial).ok],
    [true, false, false]);
  eq("C1b p.183: any other poison takes one free hand",
    [applyHandsCheck([weapon, vial], vial).ok, applyHandsCheck([weapon, shield], vial).ok], [true, false]);
  const coat = { appliedAt: 1000, combatId: "c1", round: 3 };
  eq("C2 R2: a coat dries after a minute of world time, or ten rounds of its combat",
    [coatActive(coat, { worldTime: 1059 }), coatActive(coat, { worldTime: 1060 }),
      coatActive(coat, { worldTime: 1000, combatId: "c1", round: 12 }), coatActive(coat, { worldTime: 1000, combatId: "c1", round: 13 }),
      coatActive(null, { worldTime: 0 })],
    [true, false, true, false, false]);
  eq("C3 the printed activation: Arsenic 1 AP, Black Smear 3 AP, the rest 2 AP (in combat)",
    ["Arsenic", "Black Smear", "Wyvern Poison"].map((n) => activationCost(A(n).system.activation, { inCombat: true }).ap), [1, 3, 2]);
}
{
  const use = code("module", "consumable-use-workflow.mjs");
  // 3.617.0: the Pearl, Bandage and Gloves branch sits between the oil and the elixir.
  ok("C4 a poison is used as a poison, before the elixir path",
    /if \(poisonAfflictionOf\(item\)\) return usePoison\(actor, item\);\s*[\s\S]{0,200}if \(oilOf\(item\)\) return useOil\(actor, item\);\s*(?:if \(consumableSpecialOf\(item\)\) \{[\s\S]{0,300}?return useSpecialConsumable\(actor, item\);\s*\}\s*)?(?:\{[\s\S]{0,900}?ingestRefusal[\s\S]{0,300}?\n  \}\s*)?if \(isAlchemicalConsumable\(item\) && !isBomb\(item\)\) return useAlchemical\(actor, item\);/.test(use));
  const pw = code("module", "poison-workflow.mjs");
  ok("C5 an injury poison coats a weapon, refused without two hands, before any AP",
    /if \(poison\.delivery === "injury"\)/.test(pw)
    && /const hands = coatHandsCheck\(actor\.items, weapon, item, size\);\s*if \(!hands\.ok\) \{[\s\S]{0,200}return null;\s*\}\s*if \(cost\.ap > 0\)/.test(pw));
  ok("C5b the coat is the weapon's flag, stamped with the clock", /await weapon\.setFlag\(SYSTEM_ID, POISON_COAT_FLAG, \{\s*name: item\.name,\s*data,\s*appliedAt:/.test(pw));
  ok("C6 any other poison needs exactly one target, then rolls its exposure save",
    /if \(targets\.length !== 1 \|\| !targets\[0\]\?\.actor\)/.test(pw)
    && /const result = await exposeToAffliction\(target, data\);/.test(pw));
  ok("C7 R2: the first hit spends the coat, and a dried one delivers nothing",
    /await weapon\.unsetFlag\(SYSTEM_ID, POISON_COAT_FLAG\);\s*const wet = coatActive\(/.test(pw)
    && /if \(!wet\) \{[\s\S]{0,300}return \{ delivered: false, dried: true \};/.test(pw));
  const atk = code("module", "combat", "attack-workflow.mjs");
  // A STRAY SHOT CARRIES IT TOO (3.579.0; page 192, R2 of the block-19
  // audit): the blow landed, on somebody else, and an injury poison is
  // delivered by the blow. So the creature is resolved first and the
  // delivery reads that, rather than `targetActor` directly.
  ok("C8 a Strike that hits delivers the weapon's poison, after its damage",
    /damageOutcome = await resolveWeaponDamage\([\s\S]{0,6000}const poisonedTarget = outcome\.hits \? targetActor : \(strayStruckToken\?\.actor \?\? null\);\s*if \(poisonedTarget && weapon\?\.getFlag\?\.\(SYSTEM_ID, POISON_COAT_FLAG\)\) \{\s*const \{ deliverWeaponPoison \} = await import\("\.\.\/poison-workflow\.mjs"\);\s*await deliverWeaponPoison\(actor, weapon, poisonedTarget\);/.test(atk));
  ok("C8b the flag it reads is the one the coat writes", POISON_COAT_FLAG === "poisonCoat" && /POISON_COAT_FLAG/.test(atk));
}

/* ================================================================== */
/* D — THE AFFLICTION ENGINE, ROUND BY ROUND (R1, p.190)               */
/* ================================================================== */

{
  const aw = code("module", "combat", "affliction-workflow.mjs");
  ok("D1 an exposure starts at a stage the affliction has",
    /startingStage: exposureStartingStage\(rolled\.startingStage, item\.system\.maxStage\)/.test(aw));
  ok("D2 a stage's damage is dealt as poison damage (unless the stage names another type, 3.627.0)", /const type = stageDamageType\(entry\);\s*const applied = await applyTypedDamage\(actor, \{ amount: roll\.total, type, traits: type === "poison" \? \["poison"\] : \[\] \}\)/.test(aw) && /return t \|\| "poison";/.test(aw));
  /*
   * RE-ANCHORED AT 3.583.0, NOT WEAKENED. This named
   * `enterPoisonStage`, and 3.583.0 collapsed that function and
   * `applyStageEffect` into one `enterStage` — because the second of
   * them applied no conditions at all, which is the pages 231-240
   * audit's D1. The BEHAVIOUR this check guards is unchanged and still
   * required: the last stage's conditions come off before the new
   * stage's go on. Only the function's name moved.
   */
  ok("D3 a stage's conditions replace the last stage's", /async function enterStage[\s\S]{0,300}await withdrawStageConditions\(actor, item\);[\s\S]{0,400}applyPoisonConditions\(actor, item, entry\)/.test(aw));
  ok("D3b and there is only one stage path to get it right in",
    !/applyStageEffect/.test(aw), "two paths is two chances to get it wrong");
  ok("D4 R13: a poison critical's severity is the margin", /const severity = poisonCriticalSeverity\(margin\);/.test(aw)
    && /rollCriticalInjury\(actor, \{ targetActor: actor, damageType: "poison", severity, attackBonus: 0 \}\)/.test(aw));
  ok("D5 p.190: damage first, then the save", /if \(poison && withDamage\) await dealStageDamage\(actor, item\);\s*(?:\/\/[^\n]*\n\s*)*if \(!poison && withDamage && item\.system\.stages\?\.\[currentStage - 1\]\?\.damage\) await dealStageDamage\(actor, item\);\s*const check = await rollAfflictionSave\(/.test(aw));
  ok("D6 the end phase: a due stage deals its damage, a spent poison ends, else the save",
    /if \(due\) await dealStageDamage\(actor, item\);\s*if \(poison\.durationRounds && elapsed >= poison\.durationRounds\) \{\s*await endPoison\(/.test(aw)
    && /if \(due\) await rollAfflictionStageSave\(actor, actor\.items\.get\(item\.id\) \?\? item, \{ withDamage: false \}\);/.test(aw));
  ok("D6b a poison that fails to take hold is gone", /if \(poison\) \{\s*await item\.delete\(\);\s*\} else \{/.test(aw));
  ok("D6c an immune creature is refused before the affliction is copied onto it",
    /export async function exposeToAffliction[\s\S]{0,300}const immunity = immuneToEffect\(data\.system, targetActor\.system, ownedCreatureTypeSystem\(targetActor\)\);\s*if \(immunity\) \{/.test(aw));
  const cmb = code("module", "documents", "combat.mjs");
  ok("D7 the end phase advances the afflictions", /const \{ advanceAfflictionsAtEndPhase \} = await import\("\.\.\/combat\/affliction-workflow\.mjs"\);\s*await advanceAfflictionsAtEndPhase\(actor\);/.test(cmb));
  const cw = code("module", "combat", "conditions-workflow.mjs");
  ok("D8 Arsenic: Retch is refused while it holds", /const lockedBy = conditionLockedBy\(Array\.from\(actor\?\.items \?\? \[\]\), "sickened"\);\s*if \(lockedBy\) \{[\s\S]{0,200}return null;/.test(cw));
  const cu = code("module", "consumable-use-workflow.mjs");
  ok("D9 Anti-Plague's new save is not the end of an interval", /rollAfflictionStageSave\(recipient, affliction, \{ withDamage: false \}\)/.test(cu));
}

/* ================================================================== */
/* E — BOMBS (pages 185-186; D1-D6, R4-R7)                             */
/* ================================================================== */

eq("E1 'Activate Strike (1 AP)'", BOMB_STRIKE_AP, 1);
eq("E2 R4: against DB — AV 0 hits, AV -1 misses, AV 5 a minor critical",
  [
    [bombAttackResult({ unmodified: 10, total: 20, db: 20 }).hits, bombAttackResult({ unmodified: 10, total: 20, db: 20 }).critical],
    [bombAttackResult({ unmodified: 10, total: 19, db: 20 }).hits],
    [bombAttackResult({ unmodified: 10, total: 25, db: 20 }).critical?.severity]
  ],
  [[true, null], [false], ["minor"]]);
eq("E2b an unmodified 1 misses and a 20 hits, whatever the totals",
  [bombAttackResult({ unmodified: 1, total: 40, db: 20 }).hits, bombAttackResult({ unmodified: 20, total: 5, db: 20 }).hits],
  [false, true]);
eq("E2c serious at AV 15 and deadly at AV 25", [15, 25].map((av) => bombAttackResult({ unmodified: 10, total: 20 + av, db: 20 }).critical?.severity),
  ["serious", "deadly"]);
eq("E2d no DB, nothing resolved", bombAttackResult({ unmodified: 10, total: 30, db: null }).hits, null);
eq("E3 the range: 20 ft increments, -4 each beyond the first, six at most",
  [bombRange(20), bombRange(21), bombRange(60), bombRange(120), bombRange(121), bombRange(null)]
    .map((r) => [r.increments, r.penalty, r.outOfRange]),
  [[1, 0, false], [2, -4, false], [3, -8, false], [6, -20, false], [7, 0, true], [1, 0, false]]);
eq("E4 a critical adds dice of the bomb's own size; a bag with no dice adds nothing",
  [bombCriticalDice("2d6", 2), bombCriticalDice("1d8", 1), bombCriticalDice("0", 3), bombCriticalDice("1d4", 0)],
  ["2d6", "1d8", "", ""]);
{
  const sulphur = bombEffectsOf(A("Sulphur Bomb"));
  const onHit = (e, crit) => bombRidersFor(e, { hit: true, critical: crit }).map((r) => r.slot ?? r.condition);
  eq("E5 Sulphur Bomb: -1 Perception and attack on a hit, sickened 1 instead on a critical",
    [onHit(sulphur, false), onHit(sulphur, true), bombRidersFor(sulphur, { hit: false })],
    [["perception", "attack"], ["sickened"], []]);
  eq("E5b Sulphur Bomb: temporarily immune for 1 minute", sulphur.immunitySeconds, 60);
  const haze = bombEffectsOf(A("Violet Haze"));
  eq("E6 Violet Haze: frightened 1, or 2 on a critical",
    [bombRidersFor(haze, { hit: true }).map((r) => r.value), bombRidersFor(haze, { hit: true, critical: true }).map((r) => r.value)],
    [[1], [2]]);
  const ice = bombEffectsOf(A("Liquid Ice"));
  eq("E7 Liquid Ice: -5 status to Speeds for 1 round", bombRidersFor(ice, { hit: true }).map((r) => [r.slot, r.value, r.duration]),
    [["allSpeeds", -5, "1 round"]]);
  const bag = bombEffectsOf(A("Tanglefoot Bag"));
  eq("E8 R7 Tanglefoot: -10 status to Speeds for 1 minute; immobilised 1 round on a critical",
    [bombRidersFor(bag, { hit: true }).map((r) => [r.slot, r.value, r.duration]),
      bombRidersFor(bag, { hit: true, critical: true }).filter((r) => r.on === "critical").map((r) => [r.condition, r.duration])],
    [[["allSpeeds", -10, "1 minute"]], [["immobilised", "1 round"]]]);
  eq("E8b R7: three Interacts from anyone, the third ends it", [TANGLEFOOT_INTERACTS, tanglefootInteract(3), tanglefootInteract(1)],
    [3, { left: 2, ended: false }, { left: 0, ended: true }]);
  ok("E8c R7: the bag throws with no damage", String(A("Tanglefoot Bag").flags["trg-prime"].alchemical.bomb.damage) === "0" && Boolean(bag.escape));
  const thunder = bombEffectsOf(A("Thunderstone"));
  eq("E9 R6 Thunderstone: each creature within 10 ft, Fortitude, deafened", [thunder.area?.radius, thunder.area?.save, thunder.area?.condition],
    [10, "fortitude", "deafened"]);
  eq("E9b R6: at the vial's level DC (level 1: DC 15)", [bombSaveDC(1), bombSaveDC(A("Thunderstone").system.itemLevel)], [15, levelDC(A("Thunderstone").system.itemLevel)]);
  const holy = bombEffectsOf(A("Holy Water"));
  eq("E10 R5 Holy Water: essence damage with the Good trait", [A("Holy Water").flags["trg-prime"].alchemical.bomb.damageType, holy.sourceTraits],
    ["essence", ["good"]]);
  eq("E10b R5: only undead and evil eternals are harmed",
    [
      bombReaches(holy, { details: { creatureType: "Undead" } }),
      bombReaches(holy, { details: { creatureType: "Eternal", traits: "Evil" } }),
      bombReaches(holy, { details: { creatureType: "Eternal", traits: "Good" } }),
      bombReaches(holy, { details: { creatureType: "Humanoid" } }),
      bombReaches(bombEffectsOf(A("Acid")), { details: { creatureType: "Humanoid" } })
    ],
    [true, true, false, false, true]);
}
eq("E11 a second flask keeps the stronger recurring damage of its type; another type replaces it",
  [recurringAfterHit({ value: 2, damageType: "acid" }, 1, "acid"), recurringAfterHit({ value: 1, damageType: "acid" }, 3, "acid"),
    recurringAfterHit({ value: 2, damageType: "fire" }, 1, "acid"), recurringAfterHit(null, 1, "fire")],
  [{ value: 2, damageType: "acid", replaced: false }, { value: 3, damageType: "acid", replaced: false },
    { value: 1, damageType: "acid", replaced: true }, { value: 1, damageType: "fire", replaced: false }]);
{
  const bw = code("module", "alchemical-workflow.mjs");
  ok("E12 D2: out of range is refused before the AP, then 1 AP is spent",
    /if \(range\.outOfRange\) \{[\s\S]{0,300}return null;\s*\}[\s\S]{0,200}await spendActionPoints\(actor, String\(BOMB_STRIKE_AP\)/.test(bw));
  ok("E13 D2: the multiple attack penalty is taken and counted",
    /const map = mapPenalty\(attackIndex, false, false\);/.test(bw) && /await actor\.setFlag\?\.\(SYSTEM_ID, "attackCount", attackIndex \+ 1\);/.test(bw));
  ok("E14 D1: rolled against the target's DB", /type: "attack",\s*dc: db,/.test(bw) && /const result = bombAttackResult\(\{/.test(bw));
  ok("E15 D1: a hit is a hit, not an object compared with a string", /const hit = result\.hits === true;/.test(bw) && !/check\.outcome !== "failure"/.test(bw));
  ok("E16 D3: recurring damage is the Recurring condition", /await targetActor\.toggleStatusEffect\("recurring", \{ value: next\.value, damageType: next\.damageType \}\);/.test(bw));
  ok("E17 D3: bleed is the Bleeding condition", /applyConditionTags\(targetActor, \[\{ key: "bleeding", label: "Bleeding", value: amount \}\]\)/.test(bw));
  ok("E18 R4: a critical rolls its injury", /await rollCriticalInjury\(actor, \{\s*targetActor,\s*damageType,\s*severity: critical\.severity,/.test(bw));
  ok("E19 R5: Holy Water leaves anyone else untouched", /if \(hit && targetActor && !reaches\) \{/.test(bw));
  ok("E20 D4: the riders are applied", /await applyBombRiders\(actor, item, targetActor, targetToken, extras, \{ critical: Boolean\(critical\), lines \}\);/.test(bw));
  ok("E21 R6: the burst is rolled around the target", /await resolveBombArea\(actor, item, targetToken, extras\.area, burst\);/.test(bw)
    && /const dc = bombSaveDC\(item\.system\?\.itemLevel\);/.test(bw));
  ok("E22 R7: the escape and the scrape are buttons", /export async function tanglefootEscape\(message\)/.test(bw) && /export async function tanglefootScrape\(message\)/.test(bw));
  const ci = code("module", "dice", "check-card-interactions.mjs");
  ok("E22b and the card binds both", /\[data-action="tanglefootEscape"\]/.test(ci) && /\[data-action="tanglefootScrape"\]/.test(ci));
}

/* ================================================================== */
/* F — OILS (page 182; D8, R8, R9)                                     */
/* ================================================================== */

{
  const blanch = oilOf(A("Adamantine Blanch"));
  const cold = oilOf(A("Cold Iron Blanch"));
  const silver = oilOf(A("Silversheen"));
  eq("F1 the blanches: adamantine and cold iron for 1 minute on a weapon, until fired on ammunition",
    [[blanch.material, blanch.weaponDuration, blanch.ammoDuration, blanch.ammoCount], [cold.material, cold.weaponDuration, cold.ammoDuration]],
    [["adamantine", "1 minute", "", 10], ["coldIron", "1 minute", ""]]);
  eq("F1b Silversheen: silver for the next hour, weapon or ammunition", [silver.material, silver.weaponDuration, silver.ammoDuration], ["silver", "1 hour", "1 hour"]);
  eq("F2 durations in seconds", ["1 minute", "1 hour", "24 hours", "3 rounds", ""].map(oilSeconds), [60, 3600, 86400, 18, null]);
  const bow = { type: "weapon", system: { attackMode: "missile", traits: "" } };
  const dagger = { type: "weapon", system: { attackMode: "melee", traits: "agile, thrown 10 ft" } };
  const sword = { type: "weapon", system: { attackMode: "melee", traits: "" } };
  const javelin = { type: "weapon", system: { attackMode: "thrown", traits: "" } };
  const arrows = { type: "ammunition", system: {} };
  eq("F3 'one melee weapon, one thrown weapon, or 10 pieces of ammunition' — a bow is none of them",
    [bow, dagger, sword, javelin, arrows, { type: "armour" }].map((t) => oilTarget(blanch, t).as),
    [null, "weapon", "weapon", "weapon", "ammunition", null]);
  const guard = oilOf(A("Armourguard"));
  eq("F4 R9 Armourguard: +5 HP, +1 DR, +1 DB for 24 hours", [guard.hp, guard.dr, guard.db, guard.duration], [5, 1, 1, "24 hours"]);
  eq("F4b R9: +5 HP, +1 DR, +1 DB for every additional 4 levels",
    [4, 7, 8, 12].map((l) => { const a = armourguardAt(guard, l, 4); return [a.hp, a.dr, a.db]; }),
    [[5, 1, 1], [5, 1, 1], [10, 2, 2], [15, 3, 3]]);
  eq("F4c it goes on armour, shields, and another metal item", ["armour", "shield", "weapon", "consumable"].map((type) => oilTarget(guard, { type }).ok),
    [true, true, true, false]);
  const nul = oilOf(A("Nulladir"));
  eq("F5 Nulladir: Fortitude DC 16 or sickened 1 for 3 rounds", [nul.kind, nul.save, nul.dc, nul.conditions, nul.duration],
    ["vapour", "fortitude", 16, [{ key: "sickened", value: 1 }], "3 rounds"]);
}
{
  const wc = { kind: "material", material: "coldIron", name: "Cold Iron Blanch", endsAt: 1060 };
  const ac = { kind: "material", material: "silver", name: "Silversheen", endsAt: null };
  eq("F6 R8: a fired piece's coat, then the weapon's, then what the weapon is made of",
    [
      struckMaterial({ weaponMaterial: "", weaponCoat: wc, ammoCoat: ac, now: { worldTime: 1000 } }).material,
      struckMaterial({ weaponMaterial: "", weaponCoat: wc, now: { worldTime: 1000 } }).material,
      struckMaterial({ weaponMaterial: "mithril", weaponCoat: wc, now: { worldTime: 1060 } }).material,
      struckMaterial({ weaponMaterial: "mithril", now: { worldTime: 0 } }).coated
    ],
    ["silver", "coldIron", "mithril", false]);
  eq("F6b and the defence layer reads it as the words a weakness names",
    ["coldIron", "silver", "adamantine"].map(materialDefenceWord), ["cold iron", "silver", "adamantine"]);
  eq("F7 a coat's clock: world time, or its combat's rounds",
    [oilCoatLive({ endsAt: 1060 }, { worldTime: 1059 }), oilCoatLive({ endsAt: 1060 }, { worldTime: 1060 }),
      oilCoatLive({ endsAt: null }, { worldTime: 9e9 }),
      oilCoatLive({ endsAt: 9e9, combatId: "c", round: 1, rounds: 10 }, { worldTime: 0, combatId: "c", round: 11 })],
    [true, false, true, false]);
  eq("F8 R8: ten pieces split from the stack; fewer, and the stack is coated whole",
    [ammoSplit(25), ammoSplit(10), ammoSplit(7)], [{ coated: 10, left: 15, split: true }, { coated: 10, left: 0, split: false }, { coated: 7, left: 0, split: false }]);
  eq("F9 when Armourguard comes off, its HP go first", [hpAfterArmourguard({ value: 12, max: 15 }, 5), hpAfterArmourguard({ value: 8, max: 15 }, 5)],
    [{ value: 10, max: 10 }, { value: 8, max: 10 }]);
  const armour = (flag) => ({ type: "armour", system: { dr: 3, quality: "standard", material: "", superiorTraits: "" },
    flags: flag ? { "trg-prime": { [OIL_COAT_FLAG]: flag } } : {} });
  // The world clock is Foundry's; in here it is set by hand.
  globalThis.game = { time: { worldTime: 5000 } };
  eq("F10 R9: armour gains +1 item DR while it lasts, and not after",
    [effectiveArmourDR(armour(null)), effectiveArmourDR(armour({ kind: "armourguard", dr: 1, db: 0, hp: 5, endsAt: 5001 })),
      effectiveArmourDR(armour({ kind: "armourguard", dr: 1, endsAt: 5000 }))],
    [3, 4, 3]);
  delete globalThis.game;
  eq("F10b a shield's DB bonus is read the same way", armourguardBonus({ flags: { "trg-prime": { oilCoat: { kind: "armourguard", db: 2, dr: 0, hp: 10, endsAt: null, name: "Armourguard" } } } }, { worldTime: 0 }),
    { hp: 10, dr: 0, db: 2, name: "Armourguard" });
  const atk = code("module", "combat", "attack-workflow.mjs");
  // COUNTED, NOT MERELY FOUND (3.579.0). A stray shot is a second damage
  // call and it carries the coat too, so a check that only asked whether
  // the phrase appeared anywhere stopped noticing its loss from the hit
  // path. Both calls must hand the fired piece's coat over.
  ok("F11 the damage reads the struck material, and says so",
    /material: materialDefenceWord\(struck\.material\),/.test(atk) && /weaponCoat: oilCoatOf\(weapon\),\s*ammoCoat,/.test(atk)
    && (atk.match(/ammoCoat: oilCoatOf\(ammo\),/g) ?? []).length === 2
    && /if \(struck\.coated\) \{\s*lines\.push/.test(atk));
  const act = code("module", "documents", "actor.mjs");
  ok("F12 R9: an Armourguarded shield's +1 item DB joins the item pool while its bonus is in force",
    /if \(shieldBonus > 0\) \{[\s\S]{0,300}const resin = armourguardBonus\(item\);[\s\S]{0,100}actor\.addBonus\("system\.combat\.defence", \{\s*type: "item",\s*value: resin\.db,/.test(act));
  const ow = code("module", "oil-workflow.mjs");
  ok("F13 R8: ammunition is split into a stack of its own, carrying the coat",
    /const split = ammoSplit\(target\.system\?\.quantity, oil\.ammoCount\);/.test(ow) && /const \[coated\] = await actor\.createEmbeddedDocuments\("Item", \[data\]\);\s*await target\.update\(\{ "system\.quantity": split\.left \}\);/.test(ow)
    && /const coated = await coatAmmunition\(actor, target, item, coat, split\);/.test(ow));
  ok("F14 R9: Armourguard adds to the item's HP, and the sweep takes it away", /"system\.hp\.max": Number\(fresh\.system\.hp\.max\) \+ at\.hp,/.test(ow)
    && /if \(coat\.kind === "armourguard"\) \{\s*await removeArmourguard\(target, coat\);/.test(ow));
  ok("F15 Nulladir rolls the printed save and applies its condition on a failure", /dc: oil\.dc,/.test(ow) && /if \(!success && oil\.conditions\.length\) \{/.test(ow));
  const hook = code("scripts", "trg-prime.mjs");
  ok("F16 the world clock sweeps coats", /const \{ sweepExpiredCoats \} = await import\("\.\.\/module\/oil-workflow\.mjs"\);/.test(hook));
  ok("F16b and a dried poison coat goes with them", /if \(poison && !coatActive\(poison, clock\)\) \{\s*await target\.unsetFlag\(SYSTEM_ID, POISON_COAT_FLAG\);/.test(ow));
}

/* ================================================================== */
/* G — HERBS (page 181; D9, R12)                                       */
/* ================================================================== */

{
  const lim = scaledAlchemicalEffect(A("Limorsor"));
  eq("G1 Limorsor: 1d6 HP, 1 bleeding stopped, +1 item to saves against disease and poison for 10 minutes",
    [lim.effects.map((e) => e.kind), lim.effects[0].formula, lim.effects[1].amount, lim.effects[2].grants[0].value,
      lim.effects[2].grants[0].bonusType, lim.effects[2].grants[0].when.traits, lim.duration],
    [["heal", "conditionRelief", "conditional"], "1d6", 1, 1, "item", ["disease", "poison"], "10 minutes"]);
  const prep = scaledAlchemicalEffect(A("Reglen"), { mode: "prepared" });
  eq("G2 Reglen prepared: 7d6+18, all bleeding, an injury reduced by 4",
    prep.effects.map((e) => e.formula ?? `${e.condition} ${e.amount >= 99 ? "all" : e.amount}`), ["7d6+18", "bleeding all", "injured 4"]);
  const raw = scaledAlchemicalEffect(A("Reglen"), { mode: "unprepared" });
  eq("G2b Reglen unprepared: a Fortitude save, or sickened 2", [raw.selfSave?.save, raw.effects.map((e) => [e.condition, e.value])],
    ["fortitude", [["sickened", 2]]]);
  const conds = (A("Moly").flags["trg-prime"].conditionals ?? []).map((c, i) => normaliseConditional(c, { id: "moly", name: "Moly" }, i));
  eq("G3 R12 Moly: +2 item to saves against a spell, ticked; against anything else, offered",
    [
      conds.filter((c) => matchesCheck(c, { checkType: "save", subject: "will", traditions: "arcane" })).map((c) => [c.value, c.type, c.auto]),
      conds.filter((c) => matchesCheck(c, { checkType: "save", subject: "will" })).map((c) => [c.value, c.type, c.auto]),
      conds.filter((c) => matchesCheck(c, { checkType: "skill", subject: "perception" })).length
    ],
    [[[2, "item", true]], [[2, "item", false]], 0]);
  const sage = scaledAlchemicalEffect(A("Nightsage"));
  eq("G4 R12 Nightsage: ten minutes, a minute at a time", [A("Nightsage").system.uses, sage.duration], [{ value: 10, max: 10 }, "1 minute"]);
  eq("G4b the corporeal undead within 5 ft: +2 status to saves against essence effects",
    [sage.nearby.radius, sage.effects[0].target, sage.effects[0].grants[0].value, sage.effects[0].grants[0].bonusType, sage.effects[0].grants[0].when.traits],
    [5, "targets", 2, "status", ["essence"]]);
  eq("G4c 'corporeal undead' — undead, and not incorporeal",
    [{ details: { creatureType: "Undead" } }, { details: { creatureType: "Undead", traits: "Incorporeal" } }, { details: { creatureType: "Humanoid" } }]
      .map((s) => nearbyRecipient(s, sage.nearby)),
    [true, false, false]);
  const wb = scaledAlchemicalEffect(A("Winterbite"));
  eq("G5 R12 Winterbite: +2 item offered on Perception and Survival for an hour",
    [wb.duration, wb.effects[0].grants[0].value, wb.effects[0].grants[0].when.subjects, wb.effects[0].grants[0].auto], ["1 hour", 2, ["perception", "survival"], false]);
  const kr = scaledAlchemicalEffect(A("Kritillish"));
  eq("G6 R12 Kritillish: light as a torch for 24 hours", [kr.effects[0].kind, kr.effects[0].source, kr.duration], ["light", "torch", "24 hours"]);
  const cu = code("module", "consumable-use-workflow.mjs");
  ok("G7 a save against what was taken is rolled first, and a success stops the effects",
    /resisted = Boolean\(check\?\.outcome\?\.degree\?\.success\);/.test(cu) && /if \(resisted \|\| \(around && !around\.length\)\) \{/.test(cu));
  ok("G8 the creatures around are those within the radius that it reaches",
    /if \(distanceBetween\(own, token\) > radius\) continue;\s*if \(nearbyRecipient\(token\.actor\.system, scaled\.nearby\)\) around\.push\(token\.actor\);/.test(cu)
    && /targets: fed \? \[recipient\] : \(around \?\? \[\]\)/.test(cu));
}

/* ================================================================== */
/* H — REAGENTS (R10)                                                  */
/* ================================================================== */

{
  const fireSpell = { traits: "Fire, Evocation", damage: { formula: "4d6" }, defence: "Reflex" };
  const coldSpell = { traits: "Cold", damage: { formula: "2d8" }, defence: "" };
  const holdSpell = { traits: "Enchantment", damage: { formula: "" }, defence: "Will" };
  const plainSpell = { traits: "Divination", damage: { formula: "" }, defence: "" };
  const bleedSpell = { traits: "Healing", damage: { formula: "" }, defence: "", effects: [{ kind: "conditionRelief", condition: "bleeding", amount: 1 }] };
  const carried = ["Fire Oil", "Liquid Ice", "Acid", "Tanglefoot Bag", "Holy Water", "Sulphur Bomb", "Blood-Block", "Toxic Gas", "Violet Haze",
    "Bottled Lightning", "Thunderstone"].map((n) => ({ ...A(n), id: n }));
  const names = (spell, ctx) => reagentOffers(carried, spell, ctx).map((o) => o.name).sort();
  eq("H1 a fire spell with a save: Fire Oil, and the Tanglefoot Bag for the caster to judge", names(fireSpell), ["Fire Oil", "Tanglefoot Bag"]);
  eq("H2 a cold spell with no save: Liquid Ice only", names(coldSpell), ["Liquid Ice"]);
  eq("H3 a divinity spell: Holy Water, whatever its traits", names(plainSpell, { tradition: "divinity" }), ["Holy Water"]);
  eq("H4 a spell that stops bleeding: Blood-Block", names(bleedSpell), ["Blood-Block"]);
  eq("H5 a spell with a save and nothing to add to: only the judgement one", names(holdSpell), ["Tanglefoot Bag"]);
  eq("H6 each vial's printed trait",
    [["Toxic Gas", { traits: "Poison", damage: {}, defence: "Fortitude" }], ["Bottled Lightning", { traits: "Electricity", damage: { formula: "1d6" } }],
      ["Bottled Lightning", { traits: "Light", damage: { formula: "1d6" } }], ["Sulphur Bomb", { traits: "Air" }],
      ["Thunderstone", { traits: "Sonic", damage: { formula: "3d6" } }], ["Acid", { traits: "Acid", damage: { formula: "1d4" } }],
      ["Violet Haze", { traits: "Mental", defence: "Will" }], ["Liquid Ice", { traits: "Water", damage: { formula: "1d8" } }]]
      .map(([n, s]) => names(s).includes(n)),
    [true, true, true, true, true, true, true, true]);
  const pick = (spell, ...wanted) => reagentOffers(carried, spell, { tradition: "divinity" }).filter((o) => wanted.includes(o.name));
  eq("H7 +1 die of the spell's own die; two of them are two",
    [reagentMods(pick(fireSpell, "Fire Oil"), fireSpell).damageDice,
      reagentMods([...pick(fireSpell, "Fire Oil"), ...pick(fireSpell, "Fire Oil")], fireSpell).damageDice],
    ["1d6", "2d6"]);
  eq("H8 Holy Water +2 Spellcraft; Sulphur Bomb casting DC -1; Tanglefoot, Toxic Gas and Violet Haze save DC +1",
    [
      reagentMods(pick(plainSpell, "Holy Water"), plainSpell).spellcraft,
      reagentMods(pick({ traits: "Air" }, "Sulphur Bomb"), {}).castingDC,
      reagentMods(pick(holdSpell, "Tanglefoot Bag"), holdSpell).saveDC,
      reagentMods(pick({ traits: "Poison, Mental", defence: "Will" }, "Toxic Gas", "Violet Haze"), {}).saveDC
    ],
    [2, -1, 1, 2]);
  eq("H9 Blood-Block stops as much more as the elixir stops at its level",
    [reagentMods(reagentOffers([{ ...A("Blood-Block"), id: "b" }], bleedSpell), bleedSpell).reliefBump,
      reagentMods(reagentOffers([{ ...atLevel(A("Blood-Block"), Number(A("Blood-Block").flags["trg-prime"].alchemical.baseLevel) + 3), id: "b" }], bleedSpell), bleedSpell).reliefBump],
    [1, 2]);
  ok("H10 the tick says what it does", /\+1 damage die \(d6\)/.test(reagentEffectText(pick(fireSpell, "Fire Oil")[0].use, fireSpell)));
  eq("H11 a reagent's casting DC is a labelled part", assembledCastingDC({ totalPP: 2, reagentDelta: -1 }).parts.filter((p) => p.label === "Reagent"),
    [{ label: "Reagent", value: -1 }]);
  ok("H11b and moves the DC by exactly that", assembledCastingDC({ totalPP: 2, reagentDelta: -1 }).dc === assembledCastingDC({ totalPP: 2 }).dc - 1);
  const cw = code("module", "magic", "cast-workflow.mjs");
  ok("H12 the cast offers them on its prompt, and only on a cast that has one",
    /const reagentChoices = \(isItemCast \|\| isInnate \|\| noCheckCantrip\)\s*\? \[\]\s*: reagentOffers\(Array\.from\(actor\.items \?\? \[\]\), spellData, \{ tradition \}\);/.test(cw)
    && /await promptCastingConditions\(spell, \{ extraInc, isAttack, actor, reagents: reagentChoices \}\)/.test(cw));
  ok("H12b and the ticks the player left are the ones it uses",
    /reagents: reagents\.filter\(\(r\) => Boolean\(form\[`reagent-\$\{r\.id\}`\]\)\)\.map\(\(r\) => r\.id\)/.test(cw)
    && /const reagentsUsed = reagentChoices\.filter\(\(r\) => \(conditions\.reagents \?\? \[\]\)\.includes\(r\.id\)\);/.test(cw));
  ok("H13 a ticked one is spent", /if \(quantity <= 1\) await item\.delete\(\);\s*else await item\.update\(\{ "system\.quantity": quantity - 1 \}\);/.test(cw));
  ok("H14 and its bonus lands in the channels that carry it",
    /warpMods\.damageDice = addDice\(warpMods\.damageDice, reagentBonus\.damageDice\)/.test(cw)
    && /warpMods\.saveDC = \(Number\(warpMods\.saveDC\) \|\| 0\) \+ reagentBonus\.saveDC/.test(cw)
    && /warpMods\.reliefBump = \(Number\(warpMods\.reliefBump\) \|\| 0\) \+ reagentBonus\.reliefBump/.test(cw)
    && /reagentDelta: reagentBonus\.castingDC/.test(cw)
    && /if \(used\.use\.effect === "spellcraft"\) situational\.push\(/.test(cw));
  ok("H15 the card says which were spent", /const lines = \[\.\.\.reagentLines\];/.test(cw));
}

/* ================================================================== */
/* I — THE ROUND (page 190; D10, R14) AND THE VIALS' SKILLS (R11)      */
/* ================================================================== */

eq("I1 R14: Unconscious and Petrified cannot act; Paralyzed keeps its AP with a line",
  [actsThisTurn({ unconscious: true }).canAct, actsThisTurn({ petrified: true }).canAct, actsThisTurn({ paralyzed: true }).canAct,
    Boolean(actsThisTurn({ paralyzed: true }).note), actsThisTurn({}).canAct, actsThisTurn({}).note],
  [false, false, true, true, true, ""]);
{
  const cmb = code("module", "documents", "combat.mjs");
  ok("I2 p.190: no AP and no reaction when it cannot act",
    /const regain = computeAPRegain\(\{ stunned, slowed: slowed \+ abilitySlow, quickened, \.\.\.\(acting\.canAct \? \{\} : \{ base: 0 \}\) \}\);/.test(cmb)
    && /const finalAP = acting\.canAct\s*\? apForTurn\(/.test(cmb) && /const newReactions = acting\.canAct \? reactionState\.value : 0;/.test(cmb));
  ok("I2b and the Phase 1 card says why", /if \(!acting\.canAct\) \{[\s\S]{0,200}cannot act: <strong>no AP and no reaction<\/strong> this turn\./.test(cmb));
}
eq("I3 R11: vials by Crafting or Nature, with Alchemical Crafting", [ITEM_TYPES.vials.skills, ITEM_TYPES.vials.feat],
  [["crafting", "nature"], "Alchemical Crafting"]);

/* ================================================================== */
/* J — THE WORDS (D11, R9)                                             */
/* ================================================================== */

for (const name of ["Acid", "Fire Oil", "Toxic Gas"]) {
  const item = A(name);
  ok(`J1 ${name} says recurring, as 3.8.1 does`, /recurring/i.test(item.system.description) && !/persistent/i.test(item.system.description)
    && /recurring/i.test(item.flags["trg-prime"].alchemical.higherLevel));
}
ok("J2 Nightsage says essence energy", /essence energy/i.test(A("Nightsage").system.description) && !/positive energy/i.test(A("Nightsage").system.description));
ok("J3 Armourguard carries Graham's amended text",
  /\+5-item bonus to the items HP for the next 24 hours/.test(A("Armourguard").system.description)
  && /armour gains a \+1-item bonus to DR/.test(A("Armourguard").system.description)
  && /the HP bonus increases by \+5, DR by \+1 and DB by \+1/.test(A("Armourguard").flags["trg-prime"].alchemical.higherLevel));

/* ================================================================== */
/* K — 3.578.1: THE 3.578.0 LIVE TEST, AND GRAHAM'S RULING ON DR       */
/* ================================================================== */

// F1: "Alchemical Consumable Ingested Poison" was ONE trait to every reader.
eq("K1 F1 a poison's affliction carries its traits as a list, Poison among them",
  [afflictionTraits("Alchemical Consumable Ingested Poison"), afflictionTraits(""), afflictionTraits("Poison, Injury"),
    afflictionItemData(A("Arsenic")).system.traits],
  ["Alchemical, Consumable, Ingested, Poison", "Poison", "Poison, Injury", "Alchemical, Consumable, Ingested, Poison"]);
eq("K1b so a creature immune to poison is immune to it (the zombie that went blind)",
  immuneToEffect(afflictionItemData(A("Kamarsk Oil")).system, { combat: { immunities: "bleeding, poison, sleep" } }), { trait: "poison" });
{
  const lim = scaledAlchemicalEffect(A("Limorsor")).effects[2].grants[0];
  const entry = normaliseConditional({ ...lim, type: lim.bonusType }, { id: "l", name: "Limorsor" }, 0);
  ok("K1c and Limorsor's +1 against poison reaches a poison's save",
    matchesCheck(entry, { checkType: "save", subject: "fortitude", traits: afflictionItemData(A("Arsenic")).system.traits }));
}
{
  const bw = code("module", "alchemical-workflow.mjs");
  // Graham, 20 September 2026: "Whether a bomb is affected by DR,
  // Resistance and Immunity should be down to its damage type, the same
  // as all other attacks."
  ok("K2 the ruling: a bomb's damage meets the target's DR, derived and applied by type",
    /traits: extras\.sourceTraits,\s*dr: null,\s*naturalArmourDr: null,\s*isCritical: Boolean\(critical\)/.test(bw));
  ok("K3 F5 the critical injury and the burst come after the throw's card",
    /const card = await postBombCard\([\s\S]{0,400}if \(injury\) await injury\(\);\s*if \(extras\.area && targetToken\) \{\s*const burst = \[\];\s*await resolveBombArea\(actor, item, targetToken, extras\.area, burst\);/.test(bw)
    && /injury = async \(\) => \{/.test(bw));
  ok("K4 F4 the card names them in the plural", /harms only \$\{onlyVsText\(extras\.onlyVs\)\}/.test(bw));
}
eq("K4b 'undead and evil eternals'", [onlyVsText(["undead", "evil eternal"]), onlyVsText([])], ["undead and evil eternals", ""]);
ok("K5 F3 the Speeds slots are words on the card", /allSpeeds: "to all Speeds",/.test(code("module", "magic", "spell-effects.mjs")));
/*
 * K6 RE-ANCHORED AT 3.583.0, NOT WEAKENED. F6 of the 3.578.0 live test:
 * Wyvern Poison has no incubation and Graveroot's is "Instant", and the
 * card said "once incubation passes" to both. That was fixed by testing
 * the string here; 3.583.0 made incubation a real clock, so the same
 * question is now asked of `afflictionSpan`, which answers "instant" for
 * one and null for the other.
 *
 * ASKED OF THE RULE AND OF THE BRANCH, because the two together are what
 * F6 needs: the span must classify them, and the workflow must take the
 * no-incubation branch for both.
 */
eq("K6 F6 'Instant' is already past", afflictionSpan("Instant").kind, "instant");
eq("K6b and nothing written is no incubation at all", afflictionSpan(""), null);
ok("K6c so neither reaches the incubating branch",
  /const incubates = incubation\?\.kind === "span" \|\| incubation\?\.kind === "open";/
    .test(code("module", "combat", "affliction-workflow.mjs")),
  "Wyvern Poison and Graveroot were both told to wait for an incubation they do not have");
{
  const ow = code("module", "oil-workflow.mjs");
  ok("K7 F7 a worn-off split goes back into the stack it came from",
    /const home = ammoHome\(actor, target, coat\.originalName\);\s*if \(home\) \{\s*await home\.update\(\{ "system\.quantity": Number\(home\.system\?\.quantity \?\? 0\) \+ Number\(target\.system\?\.quantity \?\? 0\) \}\);\s*await target\.delete\(\);/.test(ow)
    && /i\.name === originalName && !oilCoatOf\(i\)\) \?\? null;/.test(ow));
}

/* ================================================================== */

if (failures) {
  console.error(`verify-chapter6-gear-181-190: FAILED — ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`verify-chapter6-gear-181-190: OK — ${checks} checks. Pages 181-190: the poisons, the oils, the vials, the round.`);
