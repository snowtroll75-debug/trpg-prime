#!/usr/bin/env node
/**
 * verify-ff30-codex — 3.631.0, Fiends & Fables 3.0 block 1 (Chapter 2,
 * Creature Abilities; Graham's ruling of 9 October 2026: "all automated").
 *
 * Three questions, driven rather than read:
 *   A  the pure rails — derives, inheritance, aura damage, area use, breath
 *      memory, compound actions, after-strike escalation, pack attack
 *   B  the workflows read them where the rule lives (source anchors)
 *   C  the packs carry every declaration declare-ff30-codex.mjs made, and
 *      the two 3.0 entries exist
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { CODEX_DECLARATIONS, NEW_ENTRIES } from "./ff30-codex-declarations.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (p) => import(new URL(`../module/${p}`, import.meta.url));
const ability = (name, derives, extra = {}) => ({ type: "ability", name, system: { active: true }, flags: { "trg-prime": { creatureAbility: { derives }, ...extra } } });

/* ------------------------------------------------------------ A. derives */
const rules = await mod("creature-ability-rules.mjs");
equal("A1 Hover and Wingless Flight hover; a Darkvision does not", [rules.abilitiesHover([ability("Hover", { hover: true })]), rules.abilitiesHover([ability("Darkvision", { sense: {} })])], [true, false]);
equal("A2 Slow (I) and (II) stack as an AP penalty", rules.abilityApPenalty([ability("Slow", { apPenalty: 1 }), ability("Slow (II)", { apPenalty: 2 })]), 3);
equal("A3 Elusive Movement never provokes; Smoke Form only on a full-Speed move", [
  rules.movementProvokeExempt([ability("Elusive Movement", { noMovementProvoke: true })], { movedFeet: 5, speedFeet: 30 }),
  rules.movementProvokeExempt([ability("Smoke Form", { noMovementProvoke: { fullMoveOnly: true } })], { movedFeet: 20, speedFeet: 30 }),
  rules.movementProvokeExempt([ability("Smoke Form", { noMovementProvoke: { fullMoveOnly: true } })], { movedFeet: 30, speedFeet: 30 })
], [true, false, true]);
equal("A4 Hold Breath is ×10; nothing is ×1", [rules.abilityBreathMultiplier([ability("Hold Breath", { breathMultiplier: 10 })]), rules.abilityBreathMultiplier([])], [10, 1]);
equal("A5 Eternal Essence: no armour penalties and FDC −1", [rules.abilitiesIgnoreArmourPenalties([ability("Eternal Essence", { noArmourPenalties: true, fumbleDCAll: -1 })]), rules.abilityFumbleDCShift([ability("Eternal Essence", { noArmourPenalties: true, fumbleDCAll: -1 })])], [true, -1]);
equal("A6 Fire Healing heals from fire at half, and not from cold", [rules.healsFromDamage([ability("Fire Healing", { healsFromDamage: { type: "fire", fraction: 0.5 } })], "Fire"), rules.healsFromDamage([ability("Fire Healing", { healsFromDamage: { type: "fire", fraction: 0.5 } })], "cold")], [{ type: "fire", fraction: 0.5 }, null]);
equal("A7 Gallop is +10; Vorpal Weapons is a flag", [rules.abilityGallop([ability("Gallop", { gallop: 10 })]), rules.abilitiesVorpalWeapons([ability("Vorpal Weapons", { vorpalWeapons: true })])], [10, true]);
equal("A8 Monstrous Grab's grapple is MAP-exempt, lower-cased", Array.from(rules.abilityMapExemptActions([ability("Monstrous Grab", { mapExempt: ["GrappleAttack"] })])), ["grappleattack"]);
equal("A9 Elemental Strikes reads its element from the name — Fiery is fire, Caustic acid", [rules.abilityElementalStrikes([ability("Fiery Strikes", { elementalStrikes: { dice: "1d6" } })]), rules.elementOfName("Caustic Aura"), rules.elementOfName("Shocking Blood"), rules.elementOfName("Blood Scent")], [{ dice: "1d6", type: "fire", doubles: true }, "acid", "electricity", ""]);
equal("A10 Regeneration: automatic when declared, locked out by damage ≥ its amount", [rules.regenerationIsAutomatic([ability("Regeneration", { turnStart: { kind: "regeneration", auto: true } })]), rules.regenerationIsAutomatic([ability("Regeneration", { turnStart: { kind: "regeneration" } })]), rules.regenerationLockedOut(8, 8), rules.regenerationLockedOut(7, 8), rules.regenerationLockedOut(0, 0)], [true, false, true, false, false]);
equal("A11 Fearful Strength swaps Intimidate to Strength", Array.from(rules.abilitySkillSwaps([ability("Fearful Strength", { skillAbilitySwap: { skill: "intimidate", ability: "Strength" } })]).entries()), [["intimidate", "strength"]]);
equal("A12 Draconic Shifting's subdual holds only while shifted", [rules.strikesAreSubdual([ability("Draconic Shifting", { strikesSubdual: true }, { shifted: true })]), rules.strikesAreSubdual([ability("Draconic Shifting", { strikesSubdual: true })])], [true, false]);
equal("A13 Plant Resistance keeps bleed and recurring, hands the rest to the GM", rules.plantResistanceSplit([{ key: "bleeding", value: 2 }, { key: "stunned", value: 1 }, { key: "recurringFire", recurring: true }]), { keep: [{ key: "bleeding", value: 2 }, { key: "recurringFire", recurring: true }], gm: [{ key: "stunned", value: 1 }] });
equal("A14 Spell Resilience is the class bonus as a racial row, and nothing without the ability", [rules.spellResilienceModifiers({ items: [ability("Spell Resilience", { spellResilience: true })], system: { identity: { classBonus: 3 } } }), rules.spellResilienceModifiers({ items: [], system: { identity: { classBonus: 3 } } })], [[{ label: "Spell Resilience", value: 3, type: "race" }], []]);
equal("A15 Arcadian and True Caster: the casting derives", [rules.castingDerives([ability("Arcadian Caster", { castNoProvoke: true, specialistAll: true, learnTraditions: ["Arcane", "ethereal"] })]), rules.castingDerives([ability("True Caster", { learnTraditions: "any" })]).traditions], [{ castNoProvoke: true, specialistAll: true, traditions: ["arcane", "ethereal"] }, "any"]);
equal("A16 Survival Instinct still derives natural DR per level", rules.abilityNaturalDR([ability("Survival Instinct", { naturalDRPerLevel: 1 })], 12), 12);

/* ------------------------------------------------------------ A. the area rail's rungs (3.631.1, found live) */
const pe = await mod("peril-effect.mjs");
const wing = { save: "reflex", outcomes: { partial: "pushed 5 feet.", failure: "pushed 10 feet and falls prone." }, conditions: { failure: [{ key: "prone" }] } };
const ladder = { save: "will", outcomes: { failure: "frightened 2." }, conditions: { failure: [{ key: "frightened", value: 2 }] } };
equal("A16b a rung with its own printed line applies only its own conditions; an inline 'Failure or worse' ladder still reaches its Partial", [
  pe.perilEffectOutcome(wing, "partial").rows.map((r) => r.key), pe.perilEffectOutcome(wing, "failure").rows.map((r) => r.key), pe.perilEffectOutcome(ladder, "partial").rows.map((r) => r.key)
], [[], ["prone"], ["frightened"]]);

/* ------------------------------------------------------------ A. inheritance */
const inh = await mod("codex-inheritance.mjs");
const nameIndex = inh.buildCodexIndex([{ pack: "creature-abilities", name: "Darkvision", flags: { "trg-prime": { a: 1 } } }, { pack: "creature-abilities", name: "Acute Sense", flags: { "trg-prime": { a: 2 } } }]);
equal("A17 the base name drops a parenthesis and a range on the way to its entry", [inh.inheritedCodexFlags({ type: "ability", name: "Darkvision (55 ft.)", flags: {} }, nameIndex)?.a, inh.inheritedCodexFlags({ type: "ability", name: "Darkvision 60 ft", flags: {} }, nameIndex)?.a, inh.inheritedCodexFlags({ type: "ability", name: "Acute Sense (Smell)", flags: {} }, nameIndex)?.a], [1, 1, 2]);
const index = inh.buildCodexIndex([
  { pack: "creature-abilities", name: "Stench", flags: { "trg-prime": { auras: [{ id: "x" }] } } },
  { pack: "abilities", name: "Stench", flags: { "trg-prime": { conditionals: [] } } },
  { pack: "abilities", name: "Trample", flags: { "trg-prime": { creatureAbility: { action: { kind: "trample" } } } } },
  { pack: "creature-abilities", name: "Twin", flags: { "trg-prime": { a: 1 } } },
  { pack: "creature-abilities", name: "Twin", flags: { "trg-prime": { a: 2 } } },
  { pack: "creature-abilities", member: "trg-prime.creature-abilities", name: "Howl", flags: { "trg-prime": { a: "system" } } },
  { pack: "creature-abilities", member: "fiends-and-fables-prime.creature-abilities", name: "Howl", flags: { "trg-prime": { a: "module" } } }
]);
equal("A18 the Codex pack wins a name both hold; a name twice in one pack is left out", [index.get("stench")?.auras?.length, index.get("trample")?.creatureAbility?.action?.kind, index.has("twin")], [1, "trample", false]);
equal("A18b a name the system's pack and a module's extension both hold resolves to the system's (federated, 3.628.0)", index.get("howl")?.a, "system");
ok("A18c the index is read through the federated pack list, never a literal system id", read("module/codex-inheritance-workflow.mjs").includes("for (const pack of contentPacksFor(name)) {"));
const copy = { type: "ability", name: "Darkvision (55 ft.)", flags: { "trg-prime": { creatureAbility: { derives: { sense: { fixedFeet: 55, category: "stale" } } }, old: true } } };
const entryIndex = inh.buildCodexIndex([{ pack: "creature-abilities", name: "Darkvision", flags: { "trg-prime": { creatureAbility: { derives: { sense: { category: "primary", special: true, fixedFeet: 60 } } } } } }]);
const inherited = inh.inheritedCodexFlags(copy, entryIndex);
equal("A19 the copy takes the entry's declarations, keeps its printed range, keeps its own extra keys", [inherited.creatureAbility.derives.sense, inherited.old], [{ fixedFeet: 55, category: "primary", special: true }, true]);
equal("A20 a copy that opts out, a non-ability, a name with no entry: untouched", [inh.inheritedCodexFlags({ ...copy, flags: { "trg-prime": { codexInherit: false } } }, entryIndex), inh.inheritedCodexFlags({ ...copy, type: "feat" }, entryIndex), inh.inheritedCodexFlags({ ...copy, name: "Fire Breath" }, entryIndex)], [null, null, null]);
equal("A21 the merge replaces arrays and deep-merges objects", inh.inheritedCodexFlags({ type: "ability", name: "M", flags: { "trg-prime": { a: { x: 1, y: [1] }, b: 2 } } }, inh.buildCodexIndex([{ pack: "abilities", name: "M", flags: { "trg-prime": { a: { y: [2], z: 3 } } } }])), { a: { x: 1, y: [2], z: 3 }, b: 2 });

/* ------------------------------------------------------------ A. aura damage */
const ca = await mod("creature-auras.mjs");
const fiery = ca.normaliseAura({ id: "e", name: "Elemental Aura", radius: 10, triggers: ["enter"], save: "reflex", damage: { dice: "2d6" }, damageTypeFromName: true }, { id: "i", name: "Freezing Aura" });
equal("A22 aura damage normalises a formula and a type; a type can come from the name; a malformed one is dropped", [fiery.damage, ca.normaliseAura({ id: "x", name: "X", radius: 10, triggers: ["enter"], save: "reflex", damage: { formula: "lots", type: "fire" } }, {}).damage, ca.normaliseAura({ id: "x", name: "X", radius: 10, triggers: ["enter"], save: "reflex", damage: { formula: "2d6" } }, {}).damage], [{ formula: "2d6", type: "cold", basic: true }, null, null]);
const death = ca.normaliseAura({ id: "d", name: "Aura of Death", radius: 30, triggers: ["turnStart", "enter"], save: "fortitude", livingOnly: true, damage: { formula: "4d6", type: "essence" } }, { id: "i", name: "Aura of Death" });
const ruin = ca.normaliseAura({ id: "r", name: "Aura of Ruin", radius: 30, triggers: ["turnStart"], save: "will", appliesToTraits: ["Good", "ordered"], conditions: { failure: [{ key: "sickened", value: 1 }] } }, {});
equal("A23 a damage aura rolls; its damage and living-only survive; Ruin's aligned filter is lower-cased", [ca.auraRolls(death), death.damage, death.livingOnly, ruin.appliesToTraits], [true, { formula: "4d6", type: "essence", basic: true }, true, ["good", "ordered"]]);
equal("A24 an inactive ability emits no aura", ca.aurasOf([{ type: "ability", system: { active: false }, flags: { "trg-prime": { auras: [{ id: "x", name: "X", radius: 10, save: "reflex" }] } } }]).length, 0);

/* ------------------------------------------------------------ A. area use, breath, compound, after-strikes, pack */
const area = await mod("creature-area.mjs");
const roar = { flags: { "trg-prime": { creatureAbility: { area: { save: "fortitude", cooldownSeconds: 3600, damage: { fromItem: "breath" } }, activation: { kind: "action", ap: 2 } }, lastUsedAt: 100 } } };
equal("A25 a cooldown refuses within the hour and allows after", [area.declaredAreaUse(roar, { worldTime: 500 }).refusal.length > 0, area.declaredAreaUse(roar, { worldTime: 4000 }).refusal], [true, ""]);
const breathItem = { name: "Fire Breath", flags: { "trg-prime": { creatureAbility: { area: { save: "reflex", damage: { formula: "13d8", type: "fire" } } } } } };
equal("A26 Draconic Roar borrows the breath's dice; Wing Buffet borrows the wing's", [
  area.resolveAreaDamageSource({ damage: { fromItem: "breath" } }, [breathItem]).damage,
  area.resolveAreaDamageSource({ damageByRung: { failure: { weapon: "wing" }, fumble: { weapon: "wing", times: 2 } } }, [{ type: "weapon", name: "Wing", system: { damage: "2d6", damageType: "bludgeoning" } }], { bab: 0, strength: 7 }).damageByRung
], [{ formula: "13d8", type: "fire" }, { failure: "2d6+7", fumble: "2*(2d6+7)" }]);
equal("A27 the weapon's formula adds BAB dice, Strength and an extra base die", [area.weaponDamageFormula({ system: { damage: "1d8" } }, { bab: 6, strength: 4 }), area.weaponDamageFormula({ system: { damage: "1d8+1" } }, { bab: 0, strength: 0, extraDice: 1 })], ["2d8+4", "2d8+1"]);
const bm = await mod("breath-memory.mjs");
equal("A28 half the breath's dice, rounded up; a record remembers degree and damage", [bm.halfDiceFormula("13d8"), bm.halfDiceFormula("4d6", 0.5), bm.breathRecord({ name: "Fire Breath", formula: "13d8", type: "fire" }, [{ uuid: "u", name: "A", degree: "failure", damage: 30 }], { round: 3 }).targets], ["7d8", "2d6", [{ uuid: "u", name: "A", degree: "failure", damage: 30 }]]);
equal("A29 a next-turn rider is due the round after, not the same round, and not two later", [bm.nextTurnRiderDue({ round: 3, targets: [{}] }, { round: 4 }), bm.nextTurnRiderDue({ round: 3, targets: [{}] }, { round: 3 }), bm.nextTurnRiderDue({ round: 3, targets: [{}] }, { round: 5 }), bm.damagedTargets({ targets: [{ damage: 0 }, { damage: 5 }] }).length], [true, false, false, 1]);
equal("A30 riders are read off the entries", bm.breathRiders([{ flags: { "trg-prime": { creatureAbility: { breathRider: { kind: "penetrating" } } } } }, {}]).map((r) => r.rider.kind), ["penetrating"]);
const comp = await mod("combat/compound-action.mjs");
const charge = { flags: { "trg-prime": { creatureAbility: { compound: { ap: 2, legs: [{ move: "land", times: 2 }], strikes: [{ weapon: "gore", bonus: { value: 2, type: "circumstance" }, extraBaseDice: 1 }], map: "normal" } } } } };
equal("A31 Powerful Charge: twice the land Speed, the Gore at +2 with an extra die", [comp.compoundLegs(comp.compoundOf(charge), { land: 30 }), comp.compoundStrikes(comp.compoundOf(charge), [{ type: "weapon", id: "g", name: "Gore" }, { type: "weapon", id: "c", name: "Claw" }]).strikes.map((s) => [s.weaponName, s.bonus.value, s.extraBaseDice])], [[{ speedKey: "land", maxFeet: 60, note: "", provokes: true }], [["Gore", 2, 1]]]);
equal("A32 Torrent's fixed MAP −2 and Double Strike's MAP-after both freeze the counter; a missing weapon is reported", [comp.compoundStrikeOptions({}, comp.compoundMapRule({ map: { fixed: -2 } })), comp.compoundStrikeOptions({}, comp.compoundMapRule({ map: "after" })).mapFrozen, comp.compoundStrikes({ strikes: [{ weapon: "tail" }] }, [{ type: "weapon", name: "Claw" }]).missing], [{ apPaid: true, extraModifiers: [], mapOverride: -2, mapFrozen: true }, true, ["tail"]]);
equal("A33 Draconic Assault's third strike is a non-claw", comp.compoundStrikes({ strikes: [{ weapon: ".", notWeapon: "claw" }] }, [{ type: "weapon", id: "c", name: "Claw" }, { type: "weapon", id: "b", name: "Bite" }]).strikes[0].weaponName, "Bite");
equal("A34 Surge of Speed: once every ten minutes", [comp.compoundAvailable({ flags: { "trg-prime": { creatureAbility: { compound: { cooldownSeconds: 600 } }, lastUsedAt: 0 } } }, 300).ok, comp.compoundAvailable({ flags: { "trg-prime": { creatureAbility: { compound: { cooldownSeconds: 600 } }, lastUsedAt: 0 } } }, 700).ok], [false, true]);
const das = await mod("combat/declared-after-strikes.mjs");
equal("A35 Life Drain escalates 5, 10, 15 per target; Shadow Hand's die by severity", [das.escalatingDrainValue({ base: 5, perHit: 5 }, 0), das.escalatingDrainValue({ base: 5, perHit: 5 }, 2), das.amountFormulaBySeverity({ amountBySeverity: { minor: "1d6", serious: "2d6", deadly: "2d6" } }, "Deadly"), das.amountFormulaBySeverity({ amountBySeverity: { minor: "1d6" } }, "serious")], [{ value: 5, hits: 1 }, { value: 15, hits: 3 }, "2d6", "1d6"]);
const specs = das.declaredAfterStrikes([{ flags: { "trg-prime": { afterStrikes: [{ key: "ld", label: "Life Drain", save: "fortitude", livingOnly: true, selfHeal: 3, drain: { key: "soulDrain", base: 5, perHit: 5 } }, { key: "ds", label: "Dispelling Strike", dispel: true }] } } }]);
equal("A36 a self-heal, a living-only gate and a dispel-only after-strike all normalise", [specs[0].selfHeal, specs[0].livingOnly, specs[0].drain, specs[1].dispel, specs.length], [3, true, { key: "soulDrain", base: 5, perHit: 5, onFailureOnly: true }, true, 2]);
const pack = await mod("combat/pack-attack.mjs");
equal("A37 Pack Attack: two allies in reach count; a prone one and a distant one do not", [pack.packAttackAllies([{ reachFeet: 5, distanceFeet: 5 }, { reachFeet: 5, distanceFeet: 5 }]), pack.packAttackAllies([{ reachFeet: 5, distanceFeet: 10 }, { conditions: ["unconscious"], reachFeet: 5, distanceFeet: 5 }]), pack.packAttackDice({ items: [ability("Pack Attack", { packAttack: true })] }, null, {})], [2, 0, 0]);
const fly = await mod("combat/fly.mjs");
equal("A38 a hovering creature never falls at turn end", [fly.fallsAtTurnEnd({ elevation: 20, flySpeed: 40, round: 2, hover: true }).falls, fly.fallsAtTurnEnd({ elevation: 20, flySpeed: 40, round: 2 }).falls], [false, true]);
const mv = await mod("combat/movement.mjs");
equal("A39 a compound leg is armable, limited and free", [mv.isArmableMovement("compoundLeg"), mv.validateCompoundLeg({ speedKey: "fly", maxFeet: 120 }, { moveCost: 130, speedKey: "fly" }).allowed, mv.validateCompoundLeg({ speedKey: "fly", maxFeet: 120 }, { moveCost: 60, speedKey: "land" }).allowed, mv.validateCompoundLeg({ speedKey: "fly", maxFeet: 120 }, { moveCost: 60, speedKey: "fly" })], [true, false, false, { allowed: true, reason: "", apCost: 0, limit: 120 }]);
const ep = await mod("effect-parser.mjs");
equal("A40 Skewering Strikes: +1/+2/+3 bleed by severity, nothing when inactive", [ep.applySkeweringStrikes([{ key: "bleeding", value: 2 }], { active: true, severity: "deadly" }), ep.applySkeweringStrikes([{ key: "bleeding", value: 2 }], { active: false, severity: "deadly" })], [[{ key: "bleeding", value: 5 }], [{ key: "bleeding", value: 2 }]]);
const carriers = await mod("declaration-carriers.mjs");
equal("A41 a declaration carrier is an applied effect or an active ability, never an inactive one", carriers.declarationCarriers({ appliedEffects: [{ id: "e" }], items: [{ type: "ability", name: "A", system: { active: true } }, { type: "ability", name: "B", system: { active: false } }, { type: "feat" }] }).map((c) => c.id ?? c.name), ["e", "A"]);
ok("A42 Reactive Disarm is recognised by its item", /String\(i\.name \?\? ""\)\.trim\(\)\.toLowerCase\(\) === "reactive disarm"/.test(read("module", "combat", "reactive-disarm-workflow.mjs")));

/* ------------------------------------------------------------ B. the workflows read them */
const src = {
  fly: read("module", "combat", "fly-workflow.mjs"), combat: read("module", "documents", "combat.mjs"), movement: read("module", "combat", "movement-workflow.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs"), actor: read("module", "documents", "actor.mjs"), auraW: read("module", "creature-aura-workflow.mjs"),
  activation: read("module", "creature-activation-workflow.mjs"), peril: read("module", "peril-workflow.mjs"), turn: read("module", "creature-turn-start-workflow.mjs"),
  item: read("module", "documents", "item.mjs"), drowning: read("module", "drowning-workflow.mjs"), riders: read("module", "magic", "strike-riders-workflow.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs"), dying: read("module", "combat", "dying-workflow.mjs"), hooks: read("module", "codex-hooks-workflow.mjs"),
  dgw: read("module", "combat", "death-guard-workflow.mjs"), dasw: read("module", "combat", "declared-after-strikes-workflow.mjs"), damage: read("module", "combat", "damage-workflow.mjs"),
  init: read("scripts", "trg-prime.mjs"), action: read("module", "combat", "action-workflow.mjs"), codex: read("module", "codex-actions-workflow.mjs")
};
ok("B1 the fall at turn end asks whether the creature hovers", /hover: abilitiesHover\(Array\.from\(actor\.items \?\? \[\]\)\)/.test(src.fly));
ok("B2 AP regain adds the Slow ability to Slowed", /slowed: slowed \+ abilitySlow/.test(src.combat));
ok("B3 the movement AoO reads Elusive Movement / Smoke Form", /movementProvokeExempt\(Array\.from\(actor\?\.items \?\? \[\]\), \{/.test(src.movement));
ok("B4 Gallop raises the Stride Speed once past one Stride's worth", /const galloping = gallop > 0 && stridePool\.movedCost \+ cost > speed;/.test(src.movement) && /speed: strideSpeed,/.test(src.movement));
ok("B5 Hold Breath reaches the drowning multiplier", /Math\.max\(best, abilityBreathMultiplier\(/.test(src.drowning));
ok("B6 Eternal Essence strikes the armour penalties and the Fumble DC", /if \(abilitiesIgnoreArmourPenalties\(Array\.from\(items \?\? \[\]\)\)\) \{\s*penalty = 0;/.test(src.actor) && /abilityFumbleDCShift\(Array\.from\(actor\.items \?\? \[\]\)\)/.test(src.attack));
ok("B7 Fire Healing is asked before the defences zero the packet", /const healing = healsFromDamage\(targetItems, type\);\s*if \(healing\) \{/.test(src.damage) && /targetItems: Array\.from\(targetActor\.items \?\? \[\]\)/.test(src.damage));
ok("B8 a rolled aura applies its declared damage", /if \(aura\.damage\) \{\s*lines\.push\(await applyAuraDamage\(/.test(src.auraW) && /\|\| aura\?\.damage( \|\| aura\?\.damageByDegree \|\| aura\?\.criticals)?( \|\| aura\?\.traitEffect)?(\)|\n)/.test(read("module", "creature-auras.mjs")));
ok("B9 Aura of Ruin passes over a creature without the aligned trait", /if \(aura\.appliesToTraits\?\.length\) \{/.test(src.auraW));
ok("B10 a declared area effect is rolled through the peril rail with the AP spent", /const area = declaredArea\(item\);/.test(src.activation) && /runDeclaredAreaEffect\(actor, spec, \{ title: item\.name, results \}\)/.test(src.activation) && /await spendActionPoints\(actor, apCost, item\.name\);/.test(src.activation));
ok("B11 the peril rail: damage by rung, a critical by rung, a push by rung, a size-shifted degree, an immunity window", /spec\.damageByRung\?\.\[key\]/.test(src.peril) && /rollCriticalInjury\(peril, \{ targetActor: actor, damageType: spec\.damage\?\.type \|\| "bludgeoning", severity: rungSeverity/.test(src.peril) && /const pushFeet = Number\(spec\.push\?\.\[key\]/.test(src.peril) && /spec\.degreeShift\?\.largerBy/.test(src.peril) && /"areaImmunities"/.test(src.peril));
ok("B12 Penetrating Breath bypasses DR and resistance on the rolled breath", /if \(spec\.ignoreResistance\) setResistanceBypass\(\[spec\.damage\.type\], 5\);/.test(src.peril) && /spec\.drBypassed = true; spec\.ignoreResistance = true;/.test(src.activation));
ok("B13 the breath is remembered after it is rolled", /await recordBreath\(actor, item, use, results\);/.test(src.activation) && /registerBreathHooks\(\);/.test(src.init));
ok("B14 the Codex's own actions and compound actions come before the generic card", /const own = await useCodexAction\(actor, item\);\s*if \(own !== null\) return own;/.test(src.activation) && /if \(compoundOf\(item\)\) \{/.test(src.activation));
ok("B15 Regeneration applies itself with the lockout, and the damage record is cleared", /if \(a\.kind === "regeneration" && autoRegen\) \{/.test(src.turn) && /regenerationLockedOut\(damageSince, a\.amount\)/.test(src.turn) && /"damageSinceTurn", since \+ incoming/.test(src.dying));
ok("B16 Codex inheritance runs in prepareBaseData and the index is built at ready", /applyCodexInheritance\(this\);/.test(src.item) && /await registerCodexInheritance\(\);/.test(src.init));
ok("B17 death guards, after-strikes and Defensive Casting read ability items too", /declaredDeathGuards\(effects\)/.test(src.dgw) && /const effects = declarationCarriers\(actor\);/.test(src.dgw) && /declaredAfterStrikes\(declarationCarriers\(actor\)\)/.test(src.dasw) && /declaredDefensiveCasting\(declarationCarriers\(actor\)\)/.test(src.cast));
ok("B18 Life Drain's heal, drain and Dispelling Strike's dispel fire in the after-strike loop", /if \(spec\.selfHeal > 0\) \{/.test(src.dasw) && /escalatingDrainValue\(spec\.drain, record\[k\]\)/.test(src.dasw) && /if \(spec\.dispel\) lines\.push\(\.\.\.await dispelFromStrike\(/.test(src.dasw));
ok("B19 Elemental Strikes ride every physical weapon, and double a matching declared die", /\.\.\.elementalStrikeRiders\(actor, weapon\)\]/.test(src.riders) && /elemental\?\.doubles && String\(row\?\.damageType/.test(src.riders));
ok("B20 Pack Attack, Penetrating Strikes, Secondary Critical, Skewering, Reactive Disarm, Vorpal, Draconic Shifting and Plant Resistance are on the attack path", /const packDice = packAttackDice\(actor, targetToken, \{ attackerToken \}\);/.test(src.attack) && /const penetratingStrike = isMelee/.test(src.attack) && /weaponSecondaryCritical\(weaponData\)/.test(src.attack) && /applySkeweringStrikes\(applySavageStrikes\(/.test(src.attack) && /await offerReactiveDisarm\(targetActor, actor, weapon\);/.test(src.attack) && /const shiftedSubdual = strikesAreSubdual\(/.test(src.attack) && /hasPlantResistance\(Array\.from\(targetActor\.items \?\? \[\]\)\)/.test(src.attack) && /abilitiesVorpalWeapons\(owned\)/.test(read("module", "codex-runes.mjs")));
ok("B21 the strike log and the grapple record feed Rend, Tear Flesh, Constrict and Swallow", /"strikeLog", \[\.\.\.log\.slice\(-5\), \{/.test(src.attack) && /await targetActor\.setFlag\(SYSTEM_ID, "grabbedBy"/.test(src.action) && /"strikeLog"\)\) \? actor\.getFlag\(SYSTEM_ID, "strikeLog"\) : \[\];/.test(src.codex));
ok("B22 Monstrous Grab / Knockdown: no MAP on the declared actions", /if \(countsTowardMAP\(action\.traits\) && !mapExempt\) \{/.test(src.action));
ok("B23 Fearful Strength swaps the skill's ability when Strength is higher", /const swap = abilitySwaps\.get\(key\);/.test(src.actor) && /skill\.ability = swap;/.test(src.actor));
ok("B24 a kill, a cast and a secondary hit are announced, and the Codex listens", /Hooks\.callAll\("trgPrimeCreatureSlain"/.test(src.dying) && /Hooks\.callAll\("trgPrimeSpellCast"/.test(src.cast) && /Hooks\.callAll\("trgPrimeSecondaryDamage"/.test(src.attack) && /Hooks\.on\("trgPrimeCreatureSlain"/.test(src.hooks) && /Hooks\.on\("trgPrimeSpellCast"/.test(src.hooks) && /Hooks\.on\("trgPrimeSecondaryDamage"/.test(src.hooks) && /registerCodexHooks\(\);/.test(src.init));
ok("B25 Souldrinker heals as a Cure at its level, only within four levels; Alien Mind answers a mental trait", /const roll = await new Roll\(`\$\{level\}d8`\)\.evaluate\(\);/.test(src.hooks) && /levelOf\(victim\) >= levelOf\(killer\) - below/.test(src.hooks) && /wanted\.some\(\(t\) => traits\.includes\(t\)\)/.test(src.hooks));
ok("B26 Spell Resilience adds its row to a spell's save and its DB", /\.\.\.spellResilienceModifiers\(target\)/.test(src.cast) && /baseDB \+ dragonhideDB \+ resilienceDB/.test(src.cast));
ok("B27 Arcadian Caster casts as Specialist and provokes nothing", /\|\| castDerives\.specialistAll;/.test(src.cast) && /&& !castDerives\.castNoProvoke\) \{/.test(src.cast));
ok("B28 Elemental Grasp and Elemental Blood run at the turn start, from the holder and the bleeder", /abilityRule\(Array\.from\(holder\.items \?\? \[\]\), "grabbedTurnDamage"\)/.test(src.hooks) && /abilityRule\(Array\.from\(actor\.items \?\? \[\]\), "bleedSplash"\)/.test(src.hooks));
ok("B29 Corrode splits between metal armour and a metal shield", /const half = Math\.floor\(Number\(amount\) \/ 2\);/.test(src.hooks));
ok("B30 Trample arms a free leg that provokes nothing and resolves on the GM's targets", /provokes: false \}, item\.name\);/.test(src.codex) && /data-trg-trample/.test(src.codex));

/* ------------------------------------------------------------ C. the packs carry it */
const { ClassicLevel } = await import("classic-level");
async function readPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json", createIfMissing: false });
  await db.open();
  const out = new Map();
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && !key.slice(7).includes("!")) out.set(String(value?.name ?? "").trim().toLowerCase(), value);
  await db.close();
  return out;
}
const packs = { "creature-abilities": await readPack("creature-abilities"), abilities: await readPack("abilities") };
let declaredFound = 0; const declaredMissing = [];
for (const [name, declared] of Object.entries(CODEX_DECLARATIONS)) {
  const doc = packs["creature-abilities"].get(name.toLowerCase()) ?? packs.abilities.get(name.toLowerCase());
  if (!doc) { declaredMissing.push(`${name}: no entry`); continue; }
  const trg = doc.flags?.["trg-prime"] ?? {};
  let present = true;
  for (const [key, value] of Object.entries(declared.flags)) {
    if (key === "creatureAbility") {
      for (const [k2, v2] of Object.entries(value)) {
        if (k2 === "derives") { for (const [k3, v3] of Object.entries(v2)) if (JSON.stringify(trg.creatureAbility?.derives?.[k3]) !== JSON.stringify(v3)) present = false; }
        else if (JSON.stringify(trg.creatureAbility?.[k2]) !== JSON.stringify(v2)) present = false;
      }
    } else if (JSON.stringify(trg[key]) !== JSON.stringify(value)) present = false;
  }
  if (present) declaredFound++; else declaredMissing.push(name);
}
equal("C1 every declaration is on its pack entry", declaredMissing, []);
equal("C2 and there are as many as the declaration file holds", declaredFound, Object.keys(CODEX_DECLARATIONS).length);
equal("C3 Scorching Breath and Wing Buffet are in the Codex pack with their rails", NEW_ENTRIES.map((e) => [packs["creature-abilities"].get(e.name.toLowerCase())?._id, Boolean(packs["creature-abilities"].get(e.name.toLowerCase())?.flags?.["trg-prime"]?.creatureAbility?.[e.name === "Wing Buffet" ? "area" : "breathRider"])]), NEW_ENTRIES.map((e) => [e._id, true]));
const codexCount = packs["creature-abilities"].size;
equal("C4 the Codex pack holds its 103 entries plus the two", codexCount, 105);

const EXPECTED = 80;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-codex: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-codex: ${checks} checks — all green.`);
