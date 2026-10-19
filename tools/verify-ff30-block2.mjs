#!/usr/bin/env node
/**
 * verify-ff30-block2 — 3.632.0, Fiends & Fables 3.0 block 2 (Chapter 3 Feats
 * & Traits, the runes, the Aligned appendix; Graham's rulings of 10 October
 * 2026: "go with your recommendations for all").
 *
 *   A  the pure rules, driven — module breaths and swarm attacks read as
 *      areas, the special-sense prerequisite, Crimson Covenant, Howling
 *      Kinship, Scaly Resilience, the underwater exemptions and waterline
 *   B  the workflows read them where the rule lives (source anchors)
 *   C  the feats pack carries the declarations and the three new feats
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { FEAT_DECLARATIONS, MODULE_OWNED_FEATS } from "./ff30-codex-declarations.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (p) => import(new URL(`../module/${p}`, import.meta.url));
const ability = (name, description, flags = {}) => ({ type: "ability", name, system: { description }, flags });

/* ------------------------------------------------------------ A. module breaths (ruling 16) */
const area = await mod("creature-area.mjs");
const dragon = ability("Fire Dragon Breath", "x", { "fiends-and-fables-prime": { breath: { shape: "cone", distance: 30, damage: "12d8", damageType: "fire", save: "reflex" } }, "trg-prime": { creatureAbility: { activation: { kind: "action", ap: 2 } } } });
equal("A1 a dragon's breath shape reads as a declared breath: basic save, its dice and type, targets, AP", area.moduleBreathArea(dragon),
  { save: "reflex", basic: true, damage: { formula: "12d8", type: "fire" }, scope: "targets", intro: "A 30-foot cone — target the creatures in it.", breath: true, moduleBreath: true, ap: 2 });
const spider = ability("Fire Breath", "Action 2 AP (fire, focus, invocation, save, verdant). The Inferno Spider breathes a 20-foot cone of flame that deals 10d6 fire damage; targets make a basic Reflex save.");
equal("A2 a printed breath sentence reads the same way", [area.moduleBreathArea(spider)?.damage, area.moduleBreathArea(spider)?.save, area.moduleBreathArea(spider)?.ap], [{ formula: "10d6", type: "fire" }, "reflex", 2]);
// 3.633.0 (block 3, R10): two damage types are now a breath with a further
// packet — verify-ff30-block3 A9 — so they are no longer in this list.
equal("A3 a repair placeholder, a lingering cloud and an unprinted save stay cards", [
  area.moduleBreathArea(ability("Electricity Breath", "[INTERIM PLACEHOLDER — …] Action 2 AP. breathes a 60-foot line that deals 9d6 electricity damage; basic Reflex save.")),
  area.moduleBreathArea(ability("Iron Golem Breath", "must make a basic Fort saving throw to avoid 4d10 poison damage. The poison lingers after the initial round.")),
  area.moduleBreathArea(ability("Dream Breath", "Action 2 AP. exhales a 30-foot cone. Creatures caught in the area take 20d10 mental damage."))
], [null, null, null]);
equal("A4 a printed DC is the DC", area.moduleBreathArea(ability("Breath Weapon", "Action 2 AP The Akrexe breathes a blast of fire that deals 6d6 fire damage to all creatures in a 30-foot cone (basic Reflex DC 20)."))?.dc, 20);
const declaredOwn = ability("Fire Dragon Breath", "x", { ...dragon.flags, "trg-prime": { creatureAbility: { area: { save: "will", scope: "area", radiusFeet: 10 } } } });
equal("A5 an entry's own declared area wins over the module's shape; a non-breath is not a breath", [area.declaredArea(declaredOwn)?.save, area.moduleBreathArea(ability("Water Breathing", "You can breathe water."))], ["will", null]);

/* ------------------------------------------------------------ A. swarm attacks (ruling 9) */
const ratBites = ability("Rat Bites", "Action 1 AP. Each enemy in the rat swarm’s space takes 1d6+1 piercing damage with a basic Reflex save. Any target that takes damage from the attack is also subjected to Filth Fever.");
equal("A6 a swarm's bite reads as its own space: enemies only, basic Reflex, the rider carried", area.moduleSwarmArea(ratBites),
  { save: "reflex", basic: true, damage: { formula: "1d6+1", type: "piercing" }, scope: "sharedSpace", enemiesOnly: true, intro: "Every creature in the swarm's space.", swarmAttack: true, notes: ["Any target that takes damage from the attack is also subjected to Filth Fever."], ap: 1 });
const pe = await mod("peril-effect.mjs");
equal("A7 the area rail keeps the shared-space scope", [pe.perilEffectSpec({ save: "reflex", scope: "sharedSpace" }).scope, pe.perilEffectSpec({ save: "reflex", scope: "area", radiusFeet: 0 }).scope], ["sharedSpace", "targets"]);
const act = await mod("creature-activation.mjs");
equal("A8 the Use button speaks for a module breath and a swarm's bite", [act.isUsable(spider), act.isUsable(ratBites), act.isUsable(ability("Scent", "You smell things."))], [true, true, false]);

/* ------------------------------------------------------------ A. feats */
const pre = await mod("prerequisites.mjs");
const enhanced = "Any special visual sense (Darkvision, Nightvision etc)";
equal("A9 'Any special visual sense' asks the actor's senses, and fails open when not told (ruling 1)", [
  pre.meetsParseablePrerequisites(enhanced, { specialSenseModalities: new Set(["auditory"]) }),
  pre.meetsParseablePrerequisites(enhanced, { specialSenseModalities: new Set(["visual"]) }),
  pre.meetsParseablePrerequisites(enhanced, {})
], [false, true, true]);
const feats = await mod("codex-feat-rules.mjs");
const owner = [{ type: "feat", name: "Crimson Covenant" }];
equal("A10 Crimson Covenant arms on a bleed result of 5+, only for its owner (ruling 2)", [
  feats.crimsonCovenantArms(owner, [{ key: "bleeding", value: 5 }]), feats.crimsonCovenantArms(owner, [{ key: "bleeding", value: 4 }]),
  feats.crimsonCovenantArms([], [{ key: "bleeding", value: 6 }])
], [true, false, false]);
equal("A11 an armed covenant adds +4 luck and goes live; a live one is spent; none does nothing", [
  feats.crimsonCovenantAtAttack({ state: "armed" }), feats.crimsonCovenantAtAttack({ state: "live" }), feats.crimsonCovenantAtAttack(undefined).modifier,
  feats.crimsonCovenantStopsBleeding({ state: "live" }), feats.crimsonCovenantStopsBleeding({ state: "armed" })
], [{ modifier: { label: "Crimson Covenant", value: 4, type: "luck" }, next: "live" }, { modifier: null, next: null }, null, true, false]);
equal("A12 Howling Kinship: +1 circumstance within 10 ft, and only with the feat (ruling 3)", [
  feats.howlingKinshipModifier({ masterOwnsFeat: true, partnerFeet: 10 }), feats.howlingKinshipModifier({ masterOwnsFeat: true, partnerFeet: 15 }), feats.howlingKinshipModifier({ masterOwnsFeat: false, partnerFeet: 5 })
], [{ label: "Howling Kinship", value: 1, type: "circumstance" }, null, null]);
equal("A13 Scaly Resilience needs the feat, a breath and the reaction (ruling 4)", [
  feats.scalyResilience({ ownsFeat: true, isBreath: true, reactionAvailable: true }),
  feats.scalyResilience({ ownsFeat: true, isBreath: false }), feats.scalyResilience({ ownsFeat: true, isBreath: true, reactionAvailable: false })
], [{ saveModifier: { label: "Scaly Resilience", value: 1, type: "circumstance" }, resist: true }, null, null]);

/* ------------------------------------------------------------ A. underwater (ruling 6) */
const uw = await mod("combat/underwater.mjs");
equal("A14 Aquatic and Underwater Marauder lift the melee −2; Submersible lifts it and the fire failure", [
  uw.underwaterStrikeExemption({ aquaticAttacker: true }), uw.underwaterStrikeExemption({ submersibleWeapon: true }), uw.underwaterStrikeExemption({ marauder: true }), uw.underwaterStrikeExemption({})
], [{ meleePenalty: true, fireFails: false }, { meleePenalty: true, fireFails: true }, { meleePenalty: true, fireFails: false }, { meleePenalty: false, fireFails: false }]);
equal("A15 the waterline: a breather holds its breath going in, an Aquatic creature coming out", [
  uw.breathOnWaterline({ entering: true }), uw.breathOnWaterline({ entering: false }), uw.breathOnWaterline({ entering: true, aquatic: true }), uw.breathOnWaterline({ entering: false, aquatic: true })
], ["hold", "restore", "restore", "hold"]);

/* ------------------------------------------------------------ A. a swarm shares space (3.632.2, found live) */
const space = await mod("combat/space.mjs");
equal("A16 a swarm ends in a creature's space and a creature in a swarm's; anyone else still may not", [
  space.mayEndInSquare({ moverSize: "large", occupants: [{ size: "large" }], moverIsSwarm: true }).allowed,
  space.mayEndInSquare({ moverSize: "medium", occupants: [{ size: "large", swarm: true }] }).allowed,
  space.mayEndInSquare({ moverSize: "medium", occupants: [{ size: "medium" }] }).allowed,
  space.passageThrough({ moverSize: "medium", occupantSize: "medium", swarm: true }).allowed,
  space.passageThrough({ moverSize: "medium", occupantSize: "medium" }).allowed
], [true, true, false, true, false]);

/* ------------------------------------------------------------ B. where the rules live */
const src = {
  activation: read("module", "creature-activation-workflow.mjs"), peril: read("module", "peril-workflow.mjs"), damage: read("module", "combat", "damage-workflow.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs"), hooks: read("module", "codex-hooks-workflow.mjs"), uwWf: read("module", "combat", "underwater-workflow.mjs"),
  picker: read("module", "picker-filters.mjs"), featsWf: read("module", "feats-workflow.mjs"), familiar: read("module", "familiar-workflow.mjs"),
  spawn: read("module", "spawn-workflow.mjs"), swarm: read("module", "swarm-workflow.mjs"), runes: read("module", "rune-actions-workflow.mjs"),
  aligned: read("module", "aligned-control-workflow.mjs"), sense: read("module", "aligned-sense-workflow.mjs"), actions: read("module", "data", "special-actions.mjs"),
  actor: read("module", "documents", "actor.mjs"), actionWf: read("module", "combat", "action-workflow.mjs"), uses: read("module", "uses-workflow.mjs"),
  runeData: read("module", "codex-rune-data.mjs"), init: read("scripts", "trg-prime.mjs")
};
ok("B1 the Use button rolls whatever area the item declares, its own or a module's, with the printed AP", /const area = declaredArea\(item\);/.test(src.activation) && /const apCost = Number\(activation\.ap \?\? activation\.actionPoints \?\? use\.ap\) \|\| 0;/.test(src.activation));
ok("B2 a breath is a breath to whoever it reaches, and a creature's area is an area effect", /spec\.isBreath = true;/.test(src.activation) && /spec\.isCreatureArea = spec\.scope !== "sharedSpace";/.test(src.activation));
ok("B3 a swarm's space is the squares that overlap its own, enemies only when it says so", /if \(spec\.scope === "sharedSpace"\) \{/.test(src.peril) && /if \(spec\.enemiesOnly && t\.disposition === token\.disposition\) continue;/.test(src.peril) && /tokenSquares\(t\.object\)\.some\(\(q\) => mine\.has/.test(src.peril));
ok("B4 Scaly Resilience spends the reaction, adds its row and resists the breath", /await spendReaction\(actor, SCALY_RESILIENCE\);/.test(src.peril) && /if \(scaly\) saveConfig\.modifiers = \[\.\.\.\(saveConfig\.modifiers \?\? \[\]\), scaly\.saveModifier\];/.test(src.peril) && /extraResistance: scaly\?\.resist \? spec\.damage\.type : ""/.test(src.peril));
ok("B5 a one-blow resistance joins the defender's resistances for the resolution", /resistances: \[targetActor\.system\?\.combat\?\.resistances, extra\]/.test(src.damage) && /(?:const|let) packet = resolveAgainstDefences\(defenderSystem, \{/.test(src.damage));
ok("B6 the area rail tells the damage path what shape it is and whether a swarm dealt it", /area: Boolean\(area\), attackerIsSwarm: Boolean\(attackerIsSwarm\),/.test(src.damage) && /area: spec\.isCreatureArea === true, attackerIsSwarm: spec\.scope === "sharedSpace" \}\);\n        if \(spec\.ignoreResistance\) clearResistanceBypass\(\);/.test(src.peril));
ok("B7 Crimson Covenant is armed by the hook and spent by the next strike", /const covenant = crimsonCovenantAtAttack\(actor\.getFlag\?\.\(SYSTEM_ID, CRIMSON_COVENANT_FLAG\)\);/.test(src.attack) && /if \(covenant\.modifier\) modifiers\.push\(covenant\.modifier\);/.test(src.attack) && /Hooks\.callAll\("trgPrimeCriticalInjury"/.test(src.attack) && /Hooks\.on\("trgPrimeCriticalInjury"/.test(src.hooks) && /await attacker\.toggleStatusEffect\("bleeding", \{ active: false \}\);/.test(src.hooks));
ok("B8 Howling Kinship measures master and companion token to token", /const kinship = howlingKinshipFor\(actor\);\n    if \(kinship\) modifiers\.push\(kinship\);/.test(src.attack) && /nearest = Math\.min\(nearest, Number\(distanceBetween\(mine, theirs\)\)\);/.test(src.attack));
ok("B9 Aquatic, Submersible and Underwater Marauder reach the strike", /if \(!waterExempt\.fireFails && underwaterFireFails\(\{/.test(src.attack) && /const waterMelee = isRanged \|\| waterExempt\.meleePenalty \? 0 : underwaterMeleePenalty\(\{/.test(src.attack) && /aquaticAttacker: hasCreatureTrait\(actor\.system, "aquatic"\),/.test(src.attack));
ok("B10 an Aquatic creature holds its breath out of the water, not in it", (src.uwWf.match(/breathOnWaterline\(\{ entering: (true|false), aquatic: hasCreatureTrait\(actor\.system, "aquatic"\) \}\) === "hold"/g) ?? []).length === 2);
ok("B11 the picker tells the prerequisite gate which special senses the actor has", /\.filter\(\(sense\) => sense\.special && sense\.modality\)/.test(src.picker) && /specialSenseModalities,/.test(src.picker));
ok("B12 Abyssal and Nirvanic Familiar are left to the module's own button (3.632.1) — core registers no key that would override it", /ABYSSAL FAMILIAR \/ NIRVANIC FAMILIAR are NOT registered here \(3\.632\.1\)/.test(src.featsWf) && /"furry friend": \{/.test(src.featsWf) && !/"abyssal familiar": \{/.test(src.featsWf) && !/"nirvanic familiar": \{/.test(src.featsWf) && /export function familiarsOf\(masterActor\) \{/.test(src.familiar) && !/becomeCreatureFamiliar/.test(src.familiar));
ok("B13 the Spawn trait applies Injured 2 once, and Fed checks a living meal of half its level", /if \(actor\.getFlag\?\.\(SYSTEM_ID, SPAWN_FLAG\)\?\.since !== undefined\) return false;/.test(src.spawn) && /toggleStatusEffect\("injured", \{ active: true, value: SPAWN_INJURED \}\)/.test(src.spawn) && /if \(levelOf\(meal\) < needed\)/.test(src.spawn) && /if \(!isLivingCreature\(meal\.system \?\? \{\}\)\)/.test(src.spawn) && /registerSpawnHooks\(\);/.test(src.init));
ok("B14 the swarm bites what it newly covers and what it occupies at its turn, spending no AP", /const fresh = now\.filter\(\(a\) => !before\.has\(a\.id\)\);/.test(src.swarm) && /begins its turn occupying their space/.test(src.swarm) && !/spendActionPoints/.test(src.swarm) && /registerSwarmHooks\(\);/.test(src.init));
ok("B15 Swarmed rolls its cone through the area rail against the rune's DC", /save: "reflex", basic: true, dc: throwing\.dc,/.test(src.runes) && /await runDeclaredAreaEffect\(actor, spec, \{\n    title: `\$\{item\.name\} — \$\{action\.label\}`,/.test(src.runes));
ok("B16 Aligned Control rolls the Will save and applies it: the Spawn's shift, the Critical's immunity, the register", /lines\.push\(\.\.\.await rollAlignedControlSave\(actor, targetActor, \{ targetLevel, dc \}\)\);/.test(src.aligned) && /spawnControlDegree\(target\.system, degree, \{ grantsControl: true, fromCreator \}\)/.test(src.aligned) && /if \(outcome\.immuneUntilPreparation\) \{/.test(src.aligned) && /await recordControlled\(controller, \{ target,/.test(src.aligned) && /\?\.\[actor\.uuid\]\) \{/.test(src.aligned));
ok("B17 its new saves are offered when the clock runs out and when the controller's side acts against it", /if \(!by \|\| by\.renewing \|\| !by\.newSaveAtEnd\) return;/.test(src.aligned) && /Hooks\.on\("trgPrimeStrikeRolled"/.test(src.aligned) && /Hooks\.callAll\("trgPrimeStrikeRolled"/.test(src.attack) && /registerAlignedControlHooks\(\);/.test(src.init) && /unsetFlag\(SYSTEM_ID, "alignedControlImmune"\)/.test(src.uses));
ok("B18 Sense Aligned: the action, its requirement, its dispatch and the active +1", /key: "senseAligned",/.test(src.actions) && /requirement: "combat\.alignedSense",/.test(src.actions) && /system\.combat\.alignedSense = alignedTraitsOf\(system\)\.length;/.test(src.actor) && /if \(action\.key === "senseAligned"\) \{/.test(src.actionWf) && /if \(active\) config\.modifiers = \[\.\.\.\(config\.modifiers \?\? \[\]\), \{ label: "Active detection", \.\.\.ACTIVE_DETECTION_BONUS \}\];/.test(src.sense));
ok("B19 Submersible is recorded as applied", /readFrom: "You ignore the usual attack penalties and limitations associated with underwater combat when wielding it\.",/.test(src.runeData) && /key: "submersible",[\s\S]{0,900}automation: "applied",[\s\S]{0,300}note: "Underwater, the strike takes no −2 through the water and a fire weapon does not fail\."/.test(src.runeData));

ok("B20 the movement gate tells the page-198 rules who is a swarm", /const moverIsSwarm = isSwarm\(mover\.system\);\n  const ending = mayEndInSquare\(\{\n    moverSize,\n    moverIsSwarm,/.test(read("module", "combat", "movement-workflow.mjs")) && /swarm: isSwarm\(o\.actor\?\.system\) \}\)\)/.test(read("module", "combat", "movement-workflow.mjs")) && /swarm: moverIsSwarm \|\| isSwarm\(other\.actor\?\.system\)/.test(read("module", "combat", "movement-workflow.mjs")));
ok("B21 Aligned Control's card names the condition it applied; Sense Aligned's roll asks for no DC", /label: conditionLabel\("controlled"\) \}\];/.test(src.aligned) && /suppressDegree: true,/.test(src.sense));

/* ------------------------------------------------------------ C. the feats pack */
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), { valueEncoding: "json", createIfMissing: false });
await db.open();
const byName = new Map();
for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.type === "feat") byName.set(String(value.name).trim().toLowerCase(), value);
await db.close();
// 3.632.1: Fiends & Fables Prime ships Abyssal Familiar, Nirvanic Familiar and
// Scaly Resilience in its own federated feats pack; a core copy is a duplicate.
equal("C1 core does not duplicate the three feats the module ships", MODULE_OWNED_FEATS.map((f) => byName.has(f.name.toLowerCase())), MODULE_OWNED_FEATS.map(() => false));
equal("C2 Crimson Covenant carries no manual +4 row now that it is automated", byName.get("crimson covenant")?.flags?.["trg-prime"]?.conditionals, []);
equal("C3 Howling Kinship keeps only the Handle Animal row", (byName.get("howling kinship")?.flags?.["trg-prime"]?.conditionals ?? []).map((c) => c.type), ["class"]);
equal("C4 Enhanced Smell's prerequisite reads olfactory", byName.get("enhanced smell")?.system?.prerequisites, FEAT_DECLARATIONS["Enhanced Smell"].system.prerequisites);

const EXPECTED = 42;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block2: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block2: ${checks} checks — all green.`);
