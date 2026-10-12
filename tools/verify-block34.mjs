#!/usr/bin/env node
/**
 * verify-block34 — pages 341–350 (3.611.0).
 *
 * The audit is claude/audit-pages-341-350.md; Graham ruled on 2 October
 * 2026: R1–R10 "Your recommendation", R2 "Should be +3" and "This is an
 * auto warp if 14 or more PP are spent on the spell".
 *
 *   A  rows a warp unlocks, rows the cast's PP decides, condition values a warp grows
 *   B  the new warp channels, aggregated and capped
 *   C  Inspiration's held die
 *   D  a defence type chosen at the cast (Element Ward)
 *   E  a die the caster is asked about (Destructive Roar)
 *   F  a spell that adds the caster's Strength (Guiding Stone)
 *   G  a DR pool below zero (Devastating Might)
 *   H  smaller rules: heal and bleed both, mental attributes, "the current turn", two lights
 *   I  the pack and the manifest
 *   J  wiring, read as source
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { rowAppliesToCast, warpedConditionValue } from "../module/magic/condition-warp.mjs";
import { aggregateWarpSelection, warpMaxTimes } from "../module/magic/spell-warp.mjs";
import { heldDieStepMaxTimes, normaliseHeldBonus, warpedHeldBonus } from "../module/magic/held-bonus.mjs";
import { acceptedDefenceChoice, defaultDefenceChoice, defenceValueChoices } from "../module/magic/defence-choice.mjs";
import { damageDieUpgrade, upgradedFormula } from "../module/magic/damage-die-upgrade.mjs";
import { damageAbility, withDamageAbility } from "../module/magic/spell-damage-ability.mjs";
import { drAfterPenalty } from "../module/combat/dr-penalty.mjs";
import { bleedReliefFor, normaliseBleedAlternative } from "../module/magic/bleed-relief.mjs";
import { normaliseSlotChoice } from "../module/magic/slot-choice.mjs";
import { parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { LIGHT_SOURCES } from "../module/light-sources.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { normaliseFollowUpSave, followUpOutcome } from "../module/magic/follow-up-save.mjs";
import { normaliseFlatLadder, flatOutcome, flatResolution } from "../module/magic/flat-ladder.mjs";
import { targetCapFor } from "../module/magic/target-count.mjs";
import { PLAN } from "./block34-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ================================================================== *
 * A. Row gates and condition warps
 * ================================================================== */
{
  ok("A1 no warp leaves a condition at its value", warpedConditionValue(1, {}) === 1);
  ok("A2 a warp grows it", warpedConditionValue(1, { conditionBump: 2 }) === 3);
  ok("A3 to its printed ceiling and no further", warpedConditionValue(1, { conditionBump: 9, conditionMax: 5 }) === 5);
  ok("A4 a ceiling never lowers what the row gave", warpedConditionValue(6, { conditionBump: 1, conditionMax: 5 }) === 6);
  ok("A5 a row may decline the warp", warpedConditionValue(1, { conditionBump: 2 }, { warpBump: false }) === 1);
  ok("A6 an unvalued condition is untouched", warpedConditionValue(null, { conditionBump: 2 }) === null);
  ok("A7 a row's own ceiling beats the warp's", warpedConditionValue(1, { conditionBump: 9, conditionMax: 5 }, { warpMax: 3 }) === 3);
  ok("A8 an ungated row applies", rowAppliesToCast({ kind: "heal" }, {}, 5));
  ok("A9 an unlocked row waits for its warp", !rowAppliesToCast({ kind: "x", unlockedBy: "injured" }, {}, 5)
    && rowAppliesToCast({ kind: "x", unlockedBy: "injured" }, { unlocks: ["injured"] }, 5)
    && !rowAppliesToCast({ kind: "x", unlockedBy: "injured" }, { unlocks: ["dazedOrWeakened"] }, 5));
  ok("A10 ppAtLeast: 14 is reached at 14 and not at 13", rowAppliesToCast({ ppAtLeast: 14 }, {}, 14)
    && !rowAppliesToCast({ ppAtLeast: 14 }, {}, 13));
  ok("A11 ppBelow: 14 holds at 13 and not at 14", rowAppliesToCast({ ppBelow: 14 }, {}, 13)
    && !rowAppliesToCast({ ppBelow: 14 }, {}, 14));
  ok("A12 with no PP to read, neither of a pair applies", !rowAppliesToCast({ ppAtLeast: 14 }, {}, null)
    && !rowAppliesToCast({ ppBelow: 14 }, {}, undefined));
  // Zealous Conviction's pair, exactly one at every total.
  const pair = (PLAN["Zealous Conviction"].effects ?? []).filter((e) => e.kind === "conditional");
  ok("A13 Zealous Conviction gives exactly one of +2 and +3 at any total",
    [12, 13, 14, 20].every((pp) => pair.filter((e) => rowAppliesToCast(e, {}, pp)).length === 1)
    && pair.find((e) => rowAppliesToCast(e, {}, 14))?.grants?.[0]?.value === 3
    && pair.find((e) => rowAppliesToCast(e, {}, 13))?.grants?.[0]?.value === 2);
}

/* ================================================================== *
 * B. The warp channels
 * ================================================================== */
{
  const waves = PLAN["Waves Of Fatigue"].warps;
  const twice = aggregateWarpSelection(waves, { "warp-0": 2 });
  ok("B1 Waves Of Fatigue's warp bought twice is two levels", twice.mods.conditionBump === 2 && twice.mods.conditionMax === 5);
  ok("B2 and can be bought four times", warpMaxTimes(waves[0]) === 4);
  ok("B3 Cloud Mind's warp grows dazed and the die together", (() => {
    const m = aggregateWarpSelection(PLAN["Cloud Mind"].warps, { "warp-0": 2 }).mods;
    return m.conditionBump === 2 && m.damageDice === "2d6";
  })());
  const animal = aggregateWarpSelection(PLAN["Animal Healing"].warps, { "warp-2": 1, "warp-3": 1, "warp-1": 2 }).mods;
  ok("B4 unlocks are a union", deepEqual([...animal.unlocks].sort(), ["dazedOrWeakened", "injured"]));
  ok("B5 and bleed points count", animal.bleedPoints === 2);
  ok("B6 Element Ward's warp makes the field an immunity",
    aggregateWarpSelection(PLAN["Element Ward"].warps, { "warp-0": 1 }).mods.defenceField === "immunity");
  const insp = aggregateWarpSelection(PLAN.Inspiration.warps, { "warp-0": 1, "warp-1": 2, "warp-2": 1 }).mods;
  ok("B7 Inspiration's three warps aggregate", deepEqual(insp.heldChecks, ["attack", "save"]) && insp.heldDieStep === 2
    && insp.heldDieFrom === "1d6" && insp.heldDice === 1);
  ok("B8 the die step can be bought twice from a d6", warpMaxTimes(PLAN.Inspiration.warps[1]) === 2);
  ok("B9 a flat temp HP warp sums", aggregateWarpSelection(PLAN["Zealous Conviction"].warps, { "warp-0": 3 }).mods.tempHPBonus === 3
    && aggregateWarpSelection(PLAN["Battle’s Call"].warps, { "warp-0": 2 }).mods.tempHPBonus === 10);
  ok("B10 Banish Fatigue's +2 grows both the suppression and the removal",
    (() => { const m = aggregateWarpSelection(PLAN["Banish Fatigue"].warps, { "warp-0": 1, "warp-1": 1 }).mods;
      return m.suppressBump === 1 && m.reliefBump === 1 && deepEqual(m.unlocks, ["permanent"]); })());
  ok("B11 an empty selection buys none of it", (() => {
    const m = aggregateWarpSelection(PLAN.Inspiration.warps, {}).mods;
    return m.heldDieStep === 0 && m.heldDice === 0 && !m.heldChecks.length && !m.unlocks.length
      && m.conditionBump === 0 && m.tempHPBonus === 0 && m.defenceField === null;
  })());
}

/* ================================================================== *
 * C. Inspiration's held die
 * ================================================================== */
{
  const row = (PLAN.Inspiration.effects ?? null);
  ok("C0 Inspiration's own row is untouched by the plan", row === null);
  const spec = normaliseHeldBonus({ kind: "heldBonus", heldKind: "die", die: "1d6", checkTypes: ["skill"], label: "Inspiration" });
  ok("C1 no warp leaves the held die as printed", deepEqual(warpedHeldBonus(spec, {}), spec));
  ok("C2 one step is a d8", warpedHeldBonus(spec, { heldDieStep: 1 }).die === "1d8");
  ok("C3 the ladder stops at d10", warpedHeldBonus(spec, { heldDieStep: 5 }).die === "1d10");
  ok("C4 an additional die", warpedHeldBonus(spec, { heldDice: 1 }).die === "2d6");
  ok("C5 attack and save join skill", deepEqual(warpedHeldBonus(spec, { heldChecks: ["attack", "save"] }).checkTypes, ["skill", "attack", "save"]));
  ok("C6 an unknown check type is refused", deepEqual(warpedHeldBonus(spec, { heldChecks: ["banana"] }).checkTypes, ["skill"]));
  ok("C7 the warped spec still normalises", Boolean(normaliseHeldBonus(warpedHeldBonus(spec, { heldDieStep: 1, heldDice: 1, heldChecks: ["save"] }))));
  ok("C8 two steps fit from a d6, three from a d4, none from a d10",
    heldDieStepMaxTimes("1d6") === 2 && heldDieStepMaxTimes("1d4") === 3 && heldDieStepMaxTimes("1d10") === 1);
  const mod = normaliseHeldBonus({ kind: "heldBonus", value: 2, checkTypes: ["attack"] });
  ok("C9 a modifier ignores die warps", warpedHeldBonus(mod, { heldDieStep: 2, heldDice: 1 }).value === 2
    && warpedHeldBonus(mod, { heldDieStep: 2 }).die === mod.die);
}

/* ================================================================== *
 * D. A defence type chosen at the cast
 * ================================================================== */
{
  const ward = PLAN["Element Ward"].effects[0];
  ok("D1 Element Ward offers the four printed types", deepEqual(defenceValueChoices(ward), ["acid", "cold", "electricity", "fire"]));
  ok("D2 an ordinary defence row offers nothing", defenceValueChoices({ kind: "defence", field: "resistance", value: "fire" }).length === 0);
  ok("D3 a pick off the list falls back to the first", acceptedDefenceChoice(["acid", "fire"], "sonic") === "acid"
    && acceptedDefenceChoice(["acid", "fire"], "FIRE") === "fire" && defaultDefenceChoice([]) === "");
}

/* ================================================================== *
 * E. Destructive Roar's bigger die
 * ================================================================== */
{
  const up = damageDieUpgrade(PLAN["Destructive Roar"].damage);
  ok("E1 the row declares d8 → d12 and the question", up?.from === 8 && up?.to === 12 && /dealt damage/.test(up?.ask));
  ok("E2 every d8 grows, the warp's included", upgradedFormula("1d8 + 2d8", up) === "1d12 + 2d12" && upgradedFormula("3d8", up) === "3d12");
  ok("E3 other dice are untouched", upgradedFormula("1d8 + 1d6 + 2d80", up) === "1d12 + 1d6 + 2d80");
  ok("E4 a malformed upgrade is none", damageDieUpgrade({ upgrade: { from: 12, to: 8, ask: "?" } }) === null
    && damageDieUpgrade({ upgrade: { from: 8, to: 12 } }) === null && damageDieUpgrade({}) === null);
}

/* ================================================================== *
 * F. Guiding Stone's Strength
 * ================================================================== */
{
  const row = PLAN["Guiding Stone"].damage;
  ok("F1 the row adds Strength", damageAbility(row) === "strength");
  ok("F2 a positive Strength is added", withDamageAbility("2d6", row, { attributes: { strength: { total: 3 } } }).formula === "2d6 + 3");
  ok("F3 a negative one subtracted", withDamageAbility("2d6", row, { attributes: { strength: { total: -1 } } }).formula === "2d6 - 1");
  ok("F4 zero, or no ability, changes nothing", withDamageAbility("2d6", row, { attributes: { strength: { total: 0 } } }).formula === "2d6"
    && withDamageAbility("2d6", { formula: "2d6" }, { attributes: { strength: { total: 4 } } }).formula === "2d6");
}

/* ================================================================== *
 * G. A DR pool below zero
 * ================================================================== */
{
  ok("G1 a positive pool changes nothing here", deepEqual(drAfterPenalty(5, 2, 2), { armourDr: 5, naturalDr: 2, penalty: 0 }));
  ok("G2 −3 comes off natural armour first", deepEqual(drAfterPenalty(5, 4, -3), { armourDr: 5, naturalDr: 1, penalty: 3 }));
  ok("G3 then off the armour", deepEqual(drAfterPenalty(5, 1, -3), { armourDr: 3, naturalDr: 0, penalty: 3 }));
  ok("G4 never below zero", deepEqual(drAfterPenalty(1, 0, -3), { armourDr: 0, naturalDr: 0, penalty: 3 }));
}

/* ================================================================== *
 * H. Smaller rules
 * ================================================================== */
{
  const animal = normaliseBleedAlternative(PLAN["Animal Healing"].effects[0]);
  ok("H1 Animal Healing heals and stops bleed together", deepEqual(bleedReliefFor(animal, {}, true), { heal: true, bleed: 1 }));
  const cure = normaliseBleedAlternative({ kind: "heal", formula: "1d8", bleedAlternative: 1 });
  ok("H2 Cure still chooses", deepEqual(bleedReliefFor(cure, {}, true), { heal: false, bleed: 1 }));
  const wits = normaliseSlotChoice(PLAN.Wits.effects[0]);
  ok("H3 Wits chooses between the mental scores", deepEqual(wits?.options, ["intelligence", "wisdom", "charisma"]));
  ok("H4 \"until the end of the current turn\" is one round",
    parseSpellDuration("until the end of the current turn")?.rounds === 1);
  ok("H5 Ember Of Devotion lights one step, Luminance three",
    LIGHT_SOURCES["ember-of-devotion"]?.steps === 1 && LIGHT_SOURCES.luminance?.steps === 3
    && LIGHT_SOURCES["ember-of-devotion"]?.item === "Ember Of Devotion" && LIGHT_SOURCES.luminance?.item === "Luminance");
  ok("H6 the critical-injury row is a handled kind", HANDLED_EFFECT_KINDS.includes("criticalInjury"));
  const dread = normaliseFollowUpSave(PLAN["Woeful Dread"].effects.find((e) => e.kind === "followUpSave"));
  ok("H7 Woeful Dread's second save kills on a failure", followUpOutcome(dread, "failure").slays === true
    && followUpOutcome(dread, "fumble").slays === true);
  ok("H8 and on a success carries the +10 injury, fleeing and frightened 4",
    (() => { const rows = followUpOutcome(dread, "success").rows;
      return rows.some((r) => r.kind === "criticalInjury" && r.modifier === 10)
        && rows.some((r) => r.condition === "fleeing") && rows.some((r) => r.condition === "frightened" && r.value === 4); })());
  const death = normaliseFlatLadder(PLAN["Word Of Death"].effects[0]);
  ok("H9 R1: Word Of Death's Failure drops a big creature to 0 HP",
    flatResolution(flatOutcome(death, "failure"), 150)?.finalHP === 0 && flatResolution(flatOutcome(death, "failure"), 80)?.dies === true);
  ok("H10 Death's Defiance's modes target one, two and three",
    PLAN["Death’s Defiance"].apOptions.map((o) => targetCapFor(o.targets, {}, 10)).join() === "1,2,3");
}

/* ================================================================== *
 * I. The pack and the manifest
 * ================================================================== */
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name).trim(), v.system);
  }
} finally { await db.close(); }
const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
for (const [name, fields] of Object.entries(PLAN)) {
  for (const [field, value] of Object.entries(fields)) {
    ok(`I1 ${name}.${field} is exactly the plan`, deepEqual(pack.get(name)?.[field], value));
    const entries = PACK_REPAIRS.filter((r) => r.name === name && r.field === field && /^3\.611\.[01]$/.test(r.since));
    ok(`I2 ${name}.${field} has one 3.611.0 pack-repair entry whose \`to\` is the plan`,
      entries.length === 1 && deepEqual(entries[0].to, value));
  }
}
ok("I3 R1: Word Of Death's text says 0 HP", /otherwise, it drops to 0 HP\./.test(String(pack.get("Word Of Death")?.description))
  && !/-10 HP/.test(String(pack.get("Word Of Death")?.description)));
ok("I4 R2: Zealous Conviction's text says +3, and the next heading is gone",
  /increases to \+3/.test(String(pack.get("Zealous Conviction")?.description))
  && !/SPECIALIST SPELLS/.test(String(pack.get("Zealous Conviction")?.description)));
ok("I5 no row in the block reads a warp-unlock nobody sells", Object.entries(PLAN).every(([name, f]) => {
  const unlockers = new Set((pack.get(name)?.warps ?? []).flatMap((w) => w.mods?.unlocks ?? []));
  return (pack.get(name)?.effects ?? []).every((e) => !e.unlockedBy || unlockers.has(e.unlockedBy));
}));

/* ================================================================== *
 * J. Wiring
 * ================================================================== */
{
  const cast = read("module", "magic", "cast-workflow.mjs");
  const effects = read("module", "magic", "spell-effects.mjs");
  const attack = read("module", "combat", "attack-workflow.mjs");
  const damageFlow = read("module", "combat", "damage-workflow.mjs");
  const death = read("module", "combat", "death-state.mjs");
  const relay = read("module", "combat", "target-relay.mjs");
  const relayFlow = read("module", "combat", "target-relay-workflow.mjs");
  ok("J1 H1: an empty area prints no hand-roll line", /if \(!isAreaResolution\) \{\s*\n\s*lines\.push\(\s*\n\s*line\(\s*\n\s*`<em>No target selected — each affected creature rolls/.test(cast));
  ok("J2 every row passes the cast gate first", /for \(const effect of effects\) \{\s*\n(?:\s*\/\/[^\n]*\n)*\s*if \(!rowAppliesToCast\(effect, warpMods, rollData\?\.pp \?\? null\)\) continue;/.test(effects));
  ok("J3 a valued condition reads its warp", effects.includes("if (cond.valued) conditionValue = warpedConditionValue(conditionValue, warpMods, effect);"));
  ok("J4 the critical-injury case rolls at the row's modifier", /case "criticalInjury": \{[\s\S]{0,2200}rollCriticalInjury\(caster, \{\s*\n\s*targetActor: target, damageType, severity, attackBonus: 0, modifier\s*\n\s*\}\);/.test(effects));
  ok("J5 a held bonus is warped before it is stored", /const spec = warpedHeldBonus\(authored, warpMods\);[\s\S]{0,300}HELD_BONUS_FLAG\]: spec/.test(effects));
  ok("J6 a defence type is asked once per cast and swapped to immunity by the warp",
    /if \(!castChoices\.has\(effect\)\)/.test(effects) && /warpMods\?\.defenceField && effect\.field === "resistance"/.test(effects));
  ok("J7 a slot choice is asked once per cast", /castChoices\.set\(`slot:\$\{effects\.indexOf\(effect\)\}`/.test(effects));
  ok("J8 a flat temp HP warp reaches the formula", /const flatTemp = Math\.max\(0, Math\.trunc\(Number\(warpMods\?\.tempHPBonus\) \|\| 0\)\);/.test(effects));
  ok("J9 an attack spell adds the caster's ability", /const damageFormula = withDamageAbility\(/.test(cast));
  ok("J10 the save damage asks about the bigger die before it rolls",
    cast.indexOf("const upgrade = damageDieUpgrade(effectiveDamage);") > 0
    && cast.indexOf("const upgrade = damageDieUpgrade(effectiveDamage);") < cast.indexOf("const dmgRoll = await new Roll(damageFormula).evaluate();"));
  ok("J11 an AP mode's own target count is the cap", cast.includes("cap: targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel),"));
  ok("J12 both damage paths spend a negative DR pool", /drAfterPenalty\(derivedDr, derivedNatural, targetSystem\?\.combat\?\.dr\?\.total\)/.test(damageFlow)
    && /const penalisedPools = drAfterPenalty\(/.test(attack) && /const dr = penalisedPools\.armourDr;/.test(attack));
  ok("J13 Death's Defiance's recovery costs no Fatigued, across the relay too",
    /healActor\(target, amount \+ conduit, \{ noDyingFatigue: effect\.noDyingFatigue === true, dyingHalf: riderPlan\.dyingHalf \}\)/.test(effects)
    && /applyDyingRecovery\(actor, \{ noFatigue: noDyingFatigue \}\)/.test(effects)
    && /const state = noFatigue \? \{ \.\.\.recovered, fatigued: current \} : recovered;/.test(death)
    && /noDyingFatigue: payload\.noDyingFatigue === true/.test(relay)
    && /noDyingFatigue: options\?\.noDyingFatigue === true/.test(relayFlow)
    && /relayHeal\(actor, amount, \{ magical, noDyingFatigue, dyingHalf \}, null\)/.test(effects));
}

if (failures.length) {
  console.log(`verify-block34: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block34: OK — ${checks} checks. Pages 341–350: the save spells that did nothing, the areas that reached the wrong creatures, and the reactions and warps that had nowhere to go.`);
