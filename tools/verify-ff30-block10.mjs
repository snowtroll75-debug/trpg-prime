#!/usr/bin/env node
/**
 * verify-ff30-block10 — 3.640.0, Fiends & Fables 3.0 block 10 (the demons;
 * Graham, 13 October 2026: "go with your recommendations"):
 *   R3  aura fullDamage, doubleIfGrabbedBy, reactiveType; ally-aura enemyEffect
 *   R4  thorns read applied effects and roll a declared save; a reaction
 *   R5  deathArea (Death Throes); Reactive Evil
 *   R6  dice-valued condition rows; area excludeKinds
 *   R7  Constrict's healSelf, condition (capped) and followSave; basicAction with a skill
 *   R8  compound modes, perTarget, extraDamage and onCritical
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (p) => import(new URL(`../module/${p}`, import.meta.url));
const AU = await imp("creature-auras.mjs");
const AL = await imp("ally-aura-effects.mjs");
const TH = await imp("magic/thorns.mjs");
const PE = await imp("peril-effect.mjs");
const R = await imp("codex-action-rules.mjs");
const CA = await imp("combat/compound-action.mjs");
const DA = await imp("combat/declared-after-strikes.mjs");
const src = {
  aw: read("module", "creature-aura-workflow.mjs"), th: read("module", "magic", "thorns-workflow.mjs"), pw: read("module", "peril-workflow.mjs"),
  cx: read("module", "codex-actions-workflow.mjs"), cw: read("module", "combat", "compound-action-workflow.mjs"), at: read("module", "combat", "attack-workflow.mjs"),
  alw: read("module", "ally-aura-effects-workflow.mjs")
};

/* R3 */
equal("A1 full damage never below ×1; held doubles; plain is the save's", [
  AU.auraDamageMultiplier({ fullDamage: true }, 0.5), AU.auraDamageMultiplier({ fullDamage: true }, 0), AU.auraDamageMultiplier({ fullDamage: true, doubleIfGrabbedBy: true }, 0.5, { grabbedByEmitter: true }),
  AU.auraDamageMultiplier({}, 0.5), AU.auraDamageMultiplier({ doubleIfGrabbedBy: true }, 1, { grabbedByEmitter: false })], [1, 1, 2, 0.5, 1]);
equal("A2 Reactive Evil: fire resisted turns it; once turned, each takes the worse; unresisted stays fire", [
  AU.reactiveAuraType({ type: "fire", reactiveType: "evil" }, { ownTaken: 0, reactiveTaken: 30 }),
  AU.reactiveAuraType({ type: "fire", reactiveType: "evil" }, { ownTaken: 30, reactiveTaken: 30, active: false }),
  AU.reactiveAuraType({ type: "fire", reactiveType: "evil" }, { ownTaken: 20, reactiveTaken: 30, active: true }),
  AU.reactiveAuraType({ type: "fire" }, { ownTaken: 0, reactiveTaken: 30 })],
  [{ type: "evil", triggers: true }, { type: "fire", triggers: false }, { type: "evil", triggers: true }, { type: "fire", triggers: false }]);
ok("A3 the aura workflow reads the hold, the multiplier and the reactive type, and the emitter's turn ends the turn", /const multiplier = auraDamageMultiplier\(aura\.damage, bs\.damageMultiplier, \{ grabbedByEmitter \}\);/.test(src.aw) && /const pick = reactiveAuraType\(aura\.damage,/.test(src.aw) && /if \(trigger === "turnStart" && token\.actor\?\.getFlag\?\.\(SYSTEM_ID, AURA_REACTIVE_FLAG\)\) await token\.actor\.unsetFlag/.test(src.aw));
{ const emitter = { id: "e", disposition: -1, centreFeet: { x: 0, y: 0 }, widthFeet: 10, auras: [{ id: "cmd", name: "Aura of Command", kind: "ally", radius: 100, allyEffect: AL.allyEffectOf({ changes: [{ key: "system.combat.attack.circumstance", value: "1" }] }), enemyEffect: AL.allyEffectOf({ changes: [{ key: "system.combat.attack.circumstance", value: "-1" }] }) }] };
  const w = AL.wantedAllyGrants({ subjects: [{ id: "f", disposition: -1, centreFeet: { x: 20, y: 0 }, widthFeet: 5 }, { id: "p", disposition: 1, centreFeet: { x: 20, y: 0 }, widthFeet: 5 }], emitters: [emitter] });
  equal("A4 an ally takes the +1, an enemy the −1, under different keys", [w.get("f").map((g) => [g.key, AL.allyGrantEffectData(g).changes[0].value]), w.get("p").map((g) => [g.key, AL.allyGrantEffectData(g).changes[0].value])], [[["e:cmd", "1"]], [["e:cmd:enemy", "-1"]]]); }
equal("A6 an outcome-only ladder rolls only when it says so", [AU.auraRolls({ save: "will", outcomes: { success: "x" }, rollOutcomes: true }), AU.auraRolls({ save: "will", outcomes: { success: "x" } }), AU.auraRolls({ save: "will", outcomes: {}, rollOutcomes: true })], [true, false, false]);
ok("A5 the ally-aura sync counts an aura with only an enemy effect", /a\.kind === "ally" && \(a\.allyEffect \|\| a\.enemyEffect\)/.test(src.alw));
/* R4 */
{ const t = TH.normaliseThorns({ label: "Reactive Slime", damage: "2d6", damageType: "acid", reachFeet: 5, save: { key: "reflex", dc: 21 }, reaction: true });
  const f = TH.normaliseThorns({ label: "Aura of Flames", damage: "3d8+10", damageType: "fire", reachFeet: 100, save: { key: "fortitude", dc: 34, avoidsCriticalOnly: true } });
  equal("T1 a rolled save, a reaction, and 3d8+10 accepted", [t?.saveRoll, t?.reaction, f?.damage, f?.saveRoll?.avoidsCriticalOnly, TH.normaliseThorns({ damage: "1", damageType: "piercing", save: "reflex" })?.save], [{ key: "reflex", dc: 21, basic: true, avoidsCriticalOnly: false }, true, "3d8+10", true, "reflex"]);
  equal("T2 the save halves Reactive Slime but never the Balor's flames", [TH.thornsSaveMultiplier(t, 0.5), TH.thornsSaveMultiplier(f, 0.5), TH.thornsSaveMultiplier(f, 0)], [0.5, 1, 1]); }
ok("T3 thorns read applied effects, spend the reaction and roll the save", /for \(const effect of actor\?\.appliedEffects \?\? actor\?\.effects \?\? \[\]\)/.test(src.th) && /await spendReaction\(defender, spec\.label\);/.test(src.th) && /const mult = thornsSaveMultiplier\(spec, bs\.damageMultiplier\);/.test(src.th));
/* R5 */
equal("D1 death areas are read from the items that declare them", R.deathAreasOf([{ id: "a", name: "Death Throes", flags: { "trg-prime": { creatureAbility: { deathArea: { save: "reflex", radiusFeet: 100 } } } } }, { id: "b", name: "Claw", flags: {} }, { id: "c", name: "Half", flags: { "trg-prime": { creatureAbility: { deathArea: { radiusFeet: 100 } } } } }]).map((d) => [d.itemId, d.name]), [["a", "Death Throes"]]);
ok("D2 Dead offers the card; its button runs the area rail once", /effect\.statuses\?\.has\?\.\("dead"\)/.test(src.cx) && /await offerDeathAreas\(actor\);/.test(src.cx) && /await message\.setFlag\(SYSTEM_ID, "deathArea", \{ \.\.\.spec, used: true \}\);/.test(src.cx) && /runDeclaredAreaEffect\(actor, areaSpec,/.test(src.cx));
/* R6 */
equal("V1 dice values are dice; numbers are not", [PE.isDiceValue("2d8"), PE.isDiceValue("1d6+1"), PE.isDiceValue(9), PE.isDiceValue("2"), PE.isDiceValue(["2d8"])], [true, true, false, false, false]);
equal("V2 a demon is passed over by kind; others are not", [PE.excludedKind({ excludeKinds: ["demon"] }, ["Eternal", "Demon"]), PE.excludedKind({ excludeKinds: ["demon"] }, ["Animal"]), PE.excludedKind({}, ["Demon"])], ["demon", "", ""]);
equal("V3 a recurring row carries its damage type", DA.declaredConditionTag({ key: "recurring", value: "2d8", damageType: "Piercing" }).damageType, "piercing");
ok("V4 the area rail rolls dice values and passes excluded kinds", /if \(isDiceValue\(tag\.value\)\) \{ const r = await new Roll/.test(src.pw) && /const passed = excludedKind\(spec, kinds\);/.test(src.pw));
/* R7 */
equal("K1 Soul Drain 5, at most 20", [R.cappedConditionValue(0, 5, 20), R.cappedConditionValue(18, 5, 20), R.cappedConditionValue(20, 5, 20), R.cappedConditionValue(40, 5, 0)], [5, 2, 0, 5]);
{ const a = R.basicActionWithSkill({ key: "grappleAttack", name: "Grapple Attack", checkType: "unarmed" }, { skill: "diplomacy" }, "Embrace");
  equal("K2 Embrace is the grapple, rolled with Diplomacy", [a.key, a.checkType, a.skills, a.name], ["grappleAttack", "skill", ["diplomacy"], "Embrace (Grapple Attack, Diplomacy)"]); }
ok("K3 Constrict carries its riders; the basic action is a Codex kind", /lines\.push\(\.\.\.await constrictRiders\(actor, item, spec, target, applied\)\);/.test(src.cx) && /heldAdvantage, basicAction(, weaponStrike)?(, carrionFeast, sizeShift)?(, strikeBurst, sweepingStrike)?(, toggleEffect)? \}\);/.test(src.cx) && /await resolveAction\(actor, action, \{ invokedSkillKey: spec\.skill \?\? null \}\);/.test(src.cx));
/* R8 */
{ const spec = { ap: 2, strikes: [], modes: [{ label: "All in reach", strikes: [{ weapon: "sword", perTarget: true }], map: "after" }, { label: "One target", strikes: [{ weapon: "sword", extraDamage: 25, onCritical: { severityUp: 1, extraDamageMultiplier: 2 } }] }, { nolabel: true }] };
  const modes = CA.compoundModes(spec);
  equal("S1 two modes; laid over the action", [modes.length, CA.compoundWithMode(spec, modes[0]).map, CA.compoundWithMode(spec, modes[1]).modeLabel, "modes" in CA.compoundWithMode(spec, modes[1])], [2, "after", "One target", false]);
  const [one] = CA.compoundStrikes(CA.compoundWithMode(spec, modes[1]), [{ type: "weapon", id: "s", name: "Broadsword" }]).strikes;
  const [all] = CA.compoundStrikes(CA.compoundWithMode(spec, modes[0]), [{ type: "weapon", id: "s", name: "Broadsword" }]).strikes;
  equal("S2 per-target counts; +25, ×2 and deadly on a critical", [CA.compoundStrikeCount(all, 3), CA.compoundStrikeCount(all, 0), CA.compoundStrikeCount(one, 3), CA.compoundFlatDamage(one.extraDamage, null, one.onCritical), CA.compoundFlatDamage(one.extraDamage, "minor", one.onCritical), CA.steppedCriticalSeverity("minor", 1), CA.steppedCriticalSeverity("deadly", 1)], [3, 1, 1, 25, 50, "serious", "deadly"]);
  equal("S3 the strike's options carry the flat damage and the boost", Object.keys(CA.compoundStrikeOptions(one, { kind: "normal" })).sort(), ["apPaid", "criticalBoost", "extraFlatDamage", "extraModifiers"]); }
ok("S4 modes are asked first; the strike reaches the damage formula", /const modes = compoundModes\(spec\);/.test(src.cw) && /strike\.count = compoundStrikeCount\(strike, targetCount\);/.test(src.cw) && /if \(compoundFlatTotal\) formula \+= ` \+ \$\{compoundFlatTotal\}`;/.test(src.at) && /critical: boostedCritical,/.test(src.at));

// 3.640.1, found live.
equal("L1 an area reaches from the user's edge to the target's: beside a Large vrock, 5 ft reaches; a Medium user is as before plus its half", [PE.areaReachFeet(5, 10, 5), PE.areaReachFeet(30, 5, 5), PE.areaReachFeet(5, 10, 10)], [10, 32.5, 12.5]);
ok("L2 the area rail measures with it", /distance <= areaReachFeet\(spec\.radiusFeet, emitterWidth,/.test(src.pw));
ok("L3 an outcome-only ladder's own line is not followed by \"Unaffected\"", /&& !\(aura\.rollOutcomes && text\)(\n[^\n]*\n[^\n]*\n\s+&& !aura\.moveLimits\?\.\[String\(degree\?\.key \?\? "failure"\)\])?\) \{/.test(src.aw));
ok("L4 a returned blow shows the roll and what the save left", /rolled \$\{rawTotal\}\$\{rawTotal !== roll\.total \? `, \$\{roll\.total\} after the save` : ""\}/.test(src.th));

const EXPECTED = 27;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block10: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block10: ${checks} checks — all green.`);
