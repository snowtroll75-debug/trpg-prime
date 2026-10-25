#!/usr/bin/env node
/**
 * verify-block2-core — 3.666.0: the core changes Inner Tempest's Chapter 4
 * needs, as ruled by Graham on 21 October 2026 (the Block 2 audit). The
 * multiple attack penalty's "combat only" ruling has its own pair
 * (verify-map-combat-only).
 *
 *   A  a defence that lasts one attack (Nimble Dodge, Evade, Impact
 *      Absorption, Root the Body against a Shove or Trip)
 *   B  a reaction that rolls a skill before a save (Steel the Mind)
 *   C  a defence row against a list of DCs (a Trip)
 *   D  the Dying Check's scope (Resist Dying)
 *   E  an action's own time ladder (Centred Balance, Elemental Ward)
 *   F  an action's traits on its check (Maintain Clarity)
 *   G  a ward zone on the ground (Elemental Ward)
 *   H  the helpers a module reaches them through
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A ------------------------------------------------------------------ */
const oa = await mod("combat", "one-attack.mjs");
equal("A1 the declarations normalise", [oa.oneAttackSpec(true), oa.oneAttackSpec({ against: "weapon" }), oa.oneAttackSpec({ actions: ["shoveAttack", "TripAttack"] }), oa.oneAttackSpec(null), oa.oneAttackSpec({})],
  [{ against: "attack", actions: [] }, { against: "weapon", actions: [] }, { against: null, actions: ["shoveattack", "tripattack"] }, null, { against: "attack", actions: [] }]);
const any = oa.oneAttackSpec(true), weapon = oa.oneAttackSpec({ against: "weapon" }), shove = oa.oneAttackSpec({ actions: ["shoveAttack", "tripAttack"] });
equal("A2 a DB defence is spent by any attack against the DB, and by nothing else", ["weapon", "spell", "bomb", "spiritualWeapon", "action"].map((kind) => oa.oneAttackUsedBy(any, { kind, actionKey: "shoveAttack" })), [true, true, true, true, false]);
equal("A3 Impact Absorption's is spent by a weapon Strike only", ["weapon", "spell", "bomb"].map((kind) => oa.oneAttackUsedBy(weapon, { kind })), [true, false, false]);
equal("A4 Root the Body's is spent by a Shove or a Trip, not a Strike or a Grapple", [oa.oneAttackUsedBy(shove, { kind: "action", actionKey: "tripAttack" }), oa.oneAttackUsedBy(shove, { kind: "weapon" }), oa.oneAttackUsedBy(shove, { kind: "action", actionKey: "grappleAttack" })], [true, false, false]);
const fx = (id, flag, disabled = false) => ({ id, disabled, flags: { "trg-prime": flag === undefined ? {} : { oneAttack: flag } } });
equal("A5 only the effects that attack spends, and never a disabled one or a plain one", oa.oneAttackEffectIds([fx("dodge", true), fx("dr", { against: "weapon" }), fx("root", { actions: ["shoveAttack"] }), fx("off", true, true), fx("plain")], { kind: "weapon" }), ["dodge", "dr"]);
const aw = read("module", "combat", "attack-workflow.mjs");
// RE-ANCHORED 3.668.0: the resolved Strike is announced after the spend, before the return.
// Re-anchored at 3.671.0: the resolved hook also says whether the target may react (C9).
ok("A6 every Strike spends them after it has resolved, damage included", /check\.attackFumbled = confirmedFumble;[\s\S]{0,2400}await consumeOneAttackEffects\(targetActor, \{ kind: "weapon", attackerUuid: actor\?\.uuid \?\? "" \}\);\s*\}\s*\/\/ A STRIKE RESOLVED \(3\.668\.0\)[^]{0,1800}?\n  return check;\n\}/.test(aw));
ok("A7 …and so do a spell attack, a bomb and a spiritual weapon", /consumeOneAttackEffects\(targetActor, \{ kind: "spell", attackerUuid: actor\?\.uuid \?\? "" \}\)/.test(read("module", "magic", "cast-workflow.mjs"))
  && /consumeOneAttackEffects\(targetActor, \{ kind: "bomb", attackerUuid: actor\?\.uuid \?\? "" \}\)/.test(read("module", "alchemical-workflow.mjs"))
  && /consumeOneAttackEffects\(targetActor, \{ kind: "spiritualWeapon", attackerUuid: caster\?\.uuid \?\? "" \}\)/.test(read("module", "magic", "spiritual-weapon-workflow.mjs")));
ok("A8 …and an action against a creature, by its key", /if \(check && targetActor\) \{[\s\S]{0,160}await consumeOneAttackEffects\(targetActor, \{ kind: "action", actionKey: action\.key, attackerUuid: actor\?\.uuid \?\? "" \}\);/.test(read("module", "combat", "action-workflow.mjs")));
const relay = await mod("combat", "target-relay.mjs");
let consumed = null;
const reply = await relay.performRelay({ action: relay.RELAY_ACTIONS.ONE_ATTACK, uuid: "Actor.d", payload: { event: { kind: "weapon", actionKey: "" }, effects: ["forged"] } }, { fromUuid: async () => ({ uuid: "Actor.d" }), consumeOneAttack: async (t, e) => { consumed = e; return ["dodge"]; } });
equal("A9 the GM's client decides what an attack spends from the attack, never from ids it was sent", [reply, consumed], [{ ok: true, result: ["dodge"] }, { kind: "weapon", actionKey: "", attackerUuid: "" }]);
const watched = oa.oneAttackSpec({ against: "attack", fromUuids: ["Actor.Foe"] });
equal("A9b a defence naming its attacker is spent by that attacker only, matched case-sensitively", [oa.oneAttackUsedBy(watched, { kind: "weapon", attackerUuid: "Actor.Foe" }), oa.oneAttackUsedBy(watched, { kind: "weapon", attackerUuid: "Actor.other" }), oa.oneAttackUsedBy(watched, { kind: "weapon", attackerUuid: "actor.foe" })], [true, false, false]);
const rw = read("module", "combat", "target-relay-workflow.mjs");
ok("A10 removed directly when this client may, relayed to the GM when not, and a failed relay is announced", /if \(direct \|\| !needsRelay\(target\)\) \{\s*await target\.deleteEmbeddedDocuments\("ActiveEffect", ids\);/.test(rw) && /ask\(RELAY_ACTIONS\.ONE_ATTACK, target, \{ event \}\)/.test(rw) && /A defence that lasts one attack could not be removed/.test(rw) && /consumeOneAttack: async \(target, event\) => consumeOneAttackEffects\(target, event, \{ direct: true \}\)/.test(rw));
const fw = read("module", "feats-workflow.mjs");
const nimble = fw.slice(fw.indexOf('"nimble dodge": {'), fw.indexOf('"shield block": {'));
ok("A11 THE DEFECT: Nimble Dodge lasts one attack, spends its reaction, and is refused with none left", /flags: \{ \[SYSTEM_ID\]: \{ oneAttack: true \} \}/.test(nimble) && /if \(inCombat\) await spendReaction\(actor, "Nimble Dodge"\);/.test(nimble) && /if \(inCombat && !\(Number\(actor\.system\?\.resources\?\.reactions\?\.value \?\? 0\) > 0\)\) \{\s*ui\.notifications\.warn\("Nimble Dodge: no reaction left this round\."\);\s*return;/.test(nimble) && !/delete this effect once/.test(nimble));

/* B ------------------------------------------------------------------ */
const sb = await mod("magic", "save-bonus-reactions.mjs");
const steel = sb.normaliseSaveBonusReaction({ label: "Steel the Mind", skill: "mentalFocus", saves: ["will"], traits: ["emotion", "mental"] }, "Steel the Mind");
equal("B1 a declaration normalises; one without a skill is refused", [steel && [steel.skill, steel.saves, steel.traits, steel.type], sb.normaliseSaveBonusReaction({ saves: ["will"] })], [["mentalFocus", ["will"], ["emotion", "mental"], "circumstance"], null]);
equal("B2 offered on a Will save against Emotion or Mental, and on nothing else", [sb.saveBonusReactionsFor([steel], { save: "will", traits: "Mental, Fear" }).length, sb.saveBonusReactionsFor([steel], { save: "fortitude", traits: "mental" }).length, sb.saveBonusReactionsFor([steel], { save: "will", traits: "fire" }).length, sb.saveBonusReactionsFor([steel], { save: "will", traits: "" }).length], [1, 0, 0, 0]);
equal("B3 a negative Bonus Check counts as 0", [sb.saveBonusFromDegree(3), sb.saveBonusFromDegree(-2), sb.saveBonusFromDegree(0)], [3, 0, 0]);
ok("B4 asked before the dice, with the save and its traits, and added to the save", /const bonus = await offerSaveBonusReaction\(check\.actor, \{\s*save, traits: check\.traits, saveName: save, sourceLabel: check\.saveSource \|\| check\.label\s*\}\);\s*if \(bonus\) check\.modifiers\.push\(\{ label: bonus\.label, value: bonus\.value, type: bonus\.type \}\);/.test(read("module", "dice", "check.mjs")));
const sbs = read("module", "magic", "save-bonus-reactions.mjs");
ok("B5 the skill is rolled against your own Level DC, and the reaction spent in combat once the answer is yes", /dc: levelDC\(level\),/.test(sbs) && /if \(!taken\) return null;\s*if \(inCombat\) await spendReaction\(actor, entry\.label\);/.test(sbs) && /if \(inCombat && !\(Number\(actor\?\.system\?\.resources\?\.reactions\?\.value \?\? 0\) > 0\)\) return null;/.test(sbs));

/* C ------------------------------------------------------------------ */
const dd = await mod("combat", "defence-dc.mjs");
const rooted = { items: [{ id: "r", name: "Root", flags: { "trg-prime": { defenceDC: [{ dc: "fortitudeDC", value: 3, label: "Root the Body", when: { actions: ["shoveAttack", "tripAttack"] } }] } } }], appliedEffects: [] };
equal("C1 a row raising your Fortitude DC reaches a Trip rolled against the higher of two DCs, once", [dd.defenceDCBonus(rooted, ["skillDC:acrobatics", "fortitudeDC"], "tripAttack").total, dd.defenceDCBonus(rooted, "fortitudeDC", "shoveAttack").total, dd.defenceDCBonus(rooted, ["skillDC:acrobatics"], "tripAttack").total], [3, 3, 0]);

/* D ------------------------------------------------------------------ */
ok("D1 the Dying Check carries the action key a bonus can name, and still no subject", /label: "Dying Check",[\s\S]{0,1500}actionKey: "dyingCheck",/.test(read("module", "documents", "combat.mjs")));

/* E ------------------------------------------------------------------ */
const gso = await mod("general-skill-options.mjs");
const CB = { key: "centredBalance", name: "Centred Balance", timeLadder: { options: [{ key: "ten", label: "10 minutes", modifier: 0, apCost: "10 minutes" }, { key: "one", label: "1 minute", modifier: -2, apCost: "1 minute" }, { key: "ap", label: "1 AP", modifier: -10, apCost: "1" }], defaultKey: "ten" } };
const ladder = gso.declaredTimeLadder(CB);
equal("E1 a declared ladder normalises, with its title from the action", ladder && [ladder.options.map((o) => o.modifier), ladder.defaultKey, ladder.title], [[0, -2, -10], "ten", "Centred Balance — time spent"]);
equal("E2 a rung missing its cost, a fractional modifier or a default outside the rungs is refused", [gso.declaredTimeLadder({ timeLadder: { options: [{ key: "a", label: "A", modifier: 0 }] } }), gso.declaredTimeLadder({ timeLadder: { options: [{ key: "a", label: "A", modifier: 0.5, apCost: "1" }] } }), gso.declaredTimeLadder({ timeLadder: { options: [{ key: "a", label: "A", modifier: 0, apCost: "1" }], defaultKey: "b" } })], [null, null, null]);
equal("E3 a core ladder of the same key still wins; an action with none has none", [gso.timeLadder("identifyPower", CB)?.actionKey, gso.timeLadder("centredBalance", CB)?.actionKey, gso.timeLadder("search", { key: "search" })], ["identifyPower", "centredBalance", null]);
ok("E4 the workflow asks the action for its own", /const baseLadder = skipDialog\(event\) \? null : timeLadder\(action\.key, action\);/.test(read("module", "combat", "action-workflow.mjs")));

/* F ------------------------------------------------------------------ */
const cc = await mod("create-crafting.mjs");
equal("F1 an action's own traits, with the alchemical one where it applies", [cc.actionCheckTraits({ key: "maintainClarity", traits: "Concentrate, Mental" }), cc.actionCheckTraits({ key: "identifyAlchemy", traits: "Concentrate" }), cc.actionCheckTraits({ key: "search" })], ["concentrate, mental", "concentrate, alchemical", ""]);
equal("F2 both the dialog and the roll are given them", (read("module", "combat", "action-workflow.mjs").match(/traits: actionCheckTraits\(action, createItemTypeKey\),/g) ?? []).length, 2);
const cond = await mod("conditionals.mjs");
const clarity = cond.normaliseConditional({ kind: "modifier", value: 2, type: "circumstance", label: "Maintain Clarity", auto: false, when: { checkTypes: ["skill"], traits: ["concentrate", "mental"] } }, { id: "mc", name: "Maintain Clarity" });
equal("F3 so a bonus scoped to Concentrate and Mental actions reaches them and nothing else", [cond.conditionalRows([clarity], { checkType: "skill", traits: cc.actionCheckTraits({ traits: "Concentrate, Mental" }) }).length, cond.conditionalRows([clarity], { checkType: "skill", traits: cc.actionCheckTraits({ traits: "Manipulate" }) }).length], [1, 0]);

/* G ------------------------------------------------------------------ */
const wz = await mod("combat", "ward-zone.mjs");
equal("G1 a ward names one of the four damage types", [wz.normaliseWardZone({ label: "Elemental Ward", damageType: "Fire" }), wz.normaliseWardZone({ damageType: "sonic" }), wz.normaliseWardZone(null)], [{ label: "Elemental Ward", damageType: "fire", weakness: false }, null, null]);
const res = wz.wardEffectData({ label: "Elemental Ward", damageType: "cold", weakness: false }, "Scene.s.Region.r");
const weak = wz.wardEffectData({ label: "Elemental Ward", damageType: "cold", weakness: true }, "Scene.s.Region.r");
equal("G2 resistance, or on a Blunder weakness, written as every resistance is, and marked with its ward", [res.changes[0].key, res.changes[0].value, res.changes[0].type, weak.changes[0].key, res.flags["trg-prime"].wardZoneOf], ["system.combat.resistances", ", cold", "add", "system.combat.weaknesses", "Scene.s.Region.r"]);
equal("G3 entering adds, leaving removes, staying does nothing", [wz.wardDelta([], ["a"]), wz.wardDelta(["a"], []), wz.wardDelta(["a"], ["a", "b"])], [{ add: ["a"], remove: [] }, { add: [], remove: ["a"] }, { add: ["b"], remove: [] }]);
const wzw = read("module", "combat", "ward-zone-workflow.mjs");
ok("G4 the circle is the acting GM's to keep in step, serialised per scene", /if \(!scene \|\| !isActingGM\(\)\) return Promise\.resolve\(\);\s*return serialiseByKey\(`ward-zones:\$\{scene\.id\}`/.test(wzw));
ok("G5 asked of the Region at each token's committed centre, then the delta applied", /region\.testPoint\(\{ x: c\.x, y: c\.y,/.test(wzw) && /const \{ add, remove \} = wardDelta\(holding, inside\);/.test(wzw));
ok("G6 it lasts its world time through core's region-expiry sweep", /if \(Number\(seconds\) > 0\) \{\s*const \{ stampRegionExpiry \} = await import\("\.\.\/magic\/region-expiry-workflow\.mjs"\);\s*await stampRegionExpiry\(region\.id, \{[\s\S]{0,120}endsAtWorldTime: Math\.trunc\(Number\(game\.time\?\.worldTime \?\? 0\) \+ Number\(seconds\)\)/.test(wzw));
ok("G7 moving, arriving, leaving, and a ward placed, reshaped or gone all resync", ["updateToken", "createToken", "deleteToken", "createRegion", "updateRegion", "deleteRegion", "canvasReady"].every((h) => wzw.includes(`Hooks.on("${h}"`)) && /registerWardZones\(\);/.test(read("scripts", "trg-prime.mjs")));

/* H ------------------------------------------------------------------ */
ok("H1 the module helpers expose the Bonus Check table, the Level DC and the ward", /bonusCheckModifier: \(degreeKey\) => bonusCheckModifierOf\(degreeKey\),/.test(fw) && /levelDC: \(level\) => levelDCOf\(level\),/.test(fw) && /placeWardZone: async \(actor, options = \{\}\) => \{/.test(fw));

const uw = read("module", "uses-workflow.mjs");
ok("H2 a module hears the day turn over, once, after the card", (uw.match(/Hooks\.callAll\("trgPrimeDailyPreparation"/g) ?? []).length === 1 && /line\(endedSpellsSaid\)\s*\]\);[\s\S]{0,400}Hooks\.callAll\("trgPrimeDailyPreparation", \{ actor \}\);\s*\}/.test(uw));

const cbt = read("module", "documents", "combat.mjs");
ok("H3 a module hears a turn end, after stasis has had its say", /return;\s*\}\s*\}\s*(?:\/\/[^\n]*\n\s*)*Hooks\.callAll\("trgPrimeTurnEnded", \{ actor, combatant, combat: this \}\);/.test(cbt) && cbt.indexOf("trgPrimeTurnEnded") > cbt.indexOf("stasisTurnEnd(actor)"));
ok("H4 a condition is lowered no further than its floor, and removed at 0", /const to = Math\.max\(0, from - Math\.max\(0, Math\.trunc\(Number\(by\) \|\| 0\)\), floor\);/.test(fw) && /if \(to > 0\) await actor\.toggleStatusEffect\(key, \{ value: to \}\);\s*else await actor\.toggleStatusEffect\(key, \{ active: false \}\);/.test(fw));

ok("H5 \"clear it by hand\" only where a condition was laid", /const applied = basicActionConditionEffects\(action\.key, degree\);[\s\S]{0,500}if \(durationRounds && !game\.combat\?\.started && applied\.length\) \{/.test(read("module", "combat", "action-workflow.mjs")));

{
  const awSrc = read("module", "combat", "action-workflow.mjs");
  ok("H6 an action whose module applies its own rows is read by none of the generic readers", /const readsText = !action\.outcomesApplied;\s*healAmount = readsText \? extractHealAmount\(outcome\.text\) : null;/.test(awSrc) && /pushDetail = readsText \? extractPushDistance\(outcome\.text\) : null;/.test(awSrc) && /if \(targetActor && outcome\.matched && !action\.outcomesApplied\) \{\s*const steps = extractAttitudeShift/.test(awSrc) && /const modifier = readsGenericModifier\(action\) \? extractModifier\(outcome\.text\) : null;/.test(awSrc) && /if \(!action \|\| action\.outcomesApplied\) return false;/.test(fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "dedicated-rows.mjs"), "utf8")));
}

const EXPECTED = 40;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block2-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block2-core: ${checks} checks — all green.`);
