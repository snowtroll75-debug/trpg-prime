#!/usr/bin/env node
/**
 * verify-automation-pass — 3.630.0, Pillars of Faith's final automation
 * pass and the Undead Lords campaign option (Graham, 8 October 2026). What
 * the module could only print as a card, the core can now do:
 *
 *   A  extra feat picks a module grants; the archetype-only pool
 *   B  death guards: unconditional, one use, "would die", outright blows
 *   C  the declared effect: a closed list of flags, Death State
 *   D  conditions removed, resources restored, Dying relieved, rolled reliefs
 *   E  the next fire spell; a resistance a cast ignores
 *   F  condition-only weapon riders with a save; a gate that refuses a spend
 *   G  one degree better, counted; a declared Success
 *   H  thresholds: a save on crossing, who it stops, the bars
 *   I  one accurate fact; a choice of saves or ranked skills; counted pending entries
 *   J  riders that grow against a kind; the spell rider's tradition gate
 *   K  the wiring — hooks, helpers, anchors
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
const fx = (flags, extra = {}) => ({ id: extra.id ?? "e1", name: extra.name ?? "fx", disabled: false, flags: { "trg-prime": flags }, ...extra });

/* A — feat picks */
const F = await imp("feats.mjs");
const API = await imp("module-api.mjs");
const row = (bonusFeat = false) => ({ bonusFeat });
const groups = { racialFeats: [], classFeats: [row()], archetypeFeats: [row()], generalFeats: [] };
const plain = F.featBudget({ groups, level: 2 });
const lords = F.featBudget({ groups, level: 2, extraPicks: [{ label: "Undead Lords", archetype: 1 }] });
equal("A1 without a bonus the archetype feat spends a Class pick, and no archetype pool shows", [plain.class.spent, plain.archetype ?? null], [2, null]);
equal("A2 the Undead Lords pick is spent first by the Archetype feat; Class is spared", [lords.class.spent, lords.class.available, lords.archetype], [1, plain.class.available, { spent: 1, available: 1 }]);
const two = F.featBudget({ groups: { ...groups, archetypeFeats: [row(), row()] }, level: 2, extraPicks: [{ label: "Undead Lords", archetype: 1 }] });
equal("A3 a second Archetype feat draws on Class again", [two.class.spent, two.archetype.spent], [2, 1]);
equal("A4 the labels travel for the banner; a row giving nothing is not one", F.featBudget({ groups, level: 2, extraPicks: [{ label: "Undead Lords", archetype: 1 }, { label: "Nothing" }] }).extraLabels, ["Undead Lords"]);
API.resetModuleRegistry();
ok("A5 a pick bonus needs a function", API.registerFeatPickBonus("x", null) === false && API.registerFeatPickBonus("Undead Lords", () => ({ label: "L", archetype: 1 })) === true);
API.registerFeatPickBonus("Broken", () => { throw new Error("boom"); });
const quiet = console.warn; console.warn = () => {};
equal("A6 every registered bonus is asked; one that throws is skipped, never the banner", F.registeredFeatPicks({}), [{ label: "L", archetype: 1 }]);
console.warn = quiet;
const hbs = read("templates", "actor", "actor-sheet.hbs");
ok("A7 the banner shows the bonus pool and the campaign", /\{\{#if featPicks\.archetype\}\}[\s\S]{0,200}Bonus Archetype:/.test(hbs) && /Campaign: \{\{#each featPicks\.extraLabels\}\}/.test(hbs));
ok("A8 the sheet hands the registered picks to the budget", /extraPicks: registeredFeatPicks\(actor\)/.test(read("module", "sheets", "actor-sheet.mjs")));

/* B — death guards */
const DG = await imp("combat/death-guard.mjs");
const second = { label: "Second Heart", auto: true, once: true, notOutright: true, needsDeathState: true };
const phoenix = { label: "Phoenix Root", auto: true, trigger: "death", heal: "1", once: true };
const lotus = { label: "Prism Lotus", auto: true, trigger: "death", heal: "half", once: true };
const zero = DG.declaredDeathGuardSources([fx({ deathGuard: second }), fx({ deathGuard: phoenix }, { id: "e2" })]);
const dying = DG.declaredDeathGuardSources([fx({ deathGuard: second }), fx({ deathGuard: phoenix }, { id: "e2" })], { trigger: "death" });
equal("B1 an unconditional guard is a guard; the 0-HP list and the would-die list are apart", [zero.map((r) => r.spec.label), dying.map((r) => r.spec.label), dying[0].effect.id], [["Second Heart"], ["Phoenix Root"], "e2"]);
equal("B2 a 3.627.0 declaration reads exactly as it did", DG.declaredDeathGuards([fx({ deathGuard: { label: "Unliving Fortitude", save: "fortitude", exceptDamageTypes: ["essence"], exceptWeakness: true } })])[0],
  { label: "Unliving Fortitude", save: "fortitude", offer: false, exceptDamageTypes: ["essence"], exceptWeakness: true, frequency: "", spell: "" });
equal("B3 'auto' with a save is still the save; neither is no guard", [DG.declaredDeathGuards([fx({ deathGuard: { auto: true, save: "will" } })])[0]?.auto ?? null, DG.declaredDeathGuards([fx({ deathGuard: { label: "X" } })]).length], [null, 0]);
const sh = zero[0].spec;
equal("B4 Second Heart does not answer massive damage or a creature with no Death State", [DG.deathGuardExcepted(sh, { massive: true }), DG.deathGuardExcepted(sh, { noDeathState: true }), DG.deathGuardExcepted(sh, {})],
  ["the blow kills outright (massive damage)", "the creature has no Death State", null]);
equal("B5 a would-die guard restores 1 HP, or half the maximum (at least 1)", [DG.deathGuardHealTo(dying[0].spec, 40), DG.deathGuardHealTo(DG.declaredDeathGuardSources([fx({ deathGuard: lotus })], { trigger: "death" })[0].spec, 41), DG.deathGuardHealTo({ heal: "half" }, 1)], [1, 20, 1]);
const DGW = read("module", "combat", "death-guard-workflow.mjs");
ok("B6 an unconditional guard holds without a roll or a question", /\} else if \(spec\.auto\) \{/.test(DGW));
ok("B7 a one-use guard is spent when it fires, at 0 HP and at death", (DGW.match(/if \(spec\.once\) lines\.push\(\.\.\.await spendGuard\(actor, effect, spec\)\);/g) ?? []).length === 2 && /await effect\.delete\(\)/.test(DGW));
ok("B8 a would-die guard drops Dying through the ordinary recovery and heals", /await actor\.update\(\{ "system\.resources\.hp\.value": hp \}\);\s*await actor\.toggleStatusEffect\("dying", \{ value: 1 \}\);\s*const state = await applyDyingRecovery\(actor\);/.test(DGW));
const DS = read("module", "combat", "death-state.mjs");
ok("B9 the reaper asks the would-die guards before the skull, never for an instant death", (() => {
  const i = DS.indexOf("const spared = await trySparingGuards(actor);");
  return i > 0 && i < DS.indexOf('await actor.toggleStatusEffect("dead", { active: true, overlay: true });') && /if \(!instantDeathOf\(actor\)\) \{\s*const body = actor\?\.system;\s*if \(!constitutionIsFatal\(body\)\) \{/.test(DS);
})());
const DW = read("module", "combat", "dying-workflow.mjs");
ok("B10 the 0-HP guard is told whether the blow is massive and whether the creature has a Death State", /massive: massiveDamageInstantDeath\(amount, hpBefore, maxHP\),\s*noDeathState: hasNoDeathState\(creatureTypeSystem\)/.test(DW));
equal("B11 every death in the damage path reports a spared creature", (DW.match(/if \(reaped\.spared\) return \{ case: "spared"/g) ?? []).length, 4);
ok("B12 the dying check says when a guard answers", (read("module", "documents", "combat.mjs").match(/if \(reaped\.spared\) lines\.push/g) ?? []).length === 2);
const D = await imp("combat/death-state.mjs");
equal("B13 the end of a Death State bonus trims Dying, never kills", [D.dyingTrimmedTo(6, 5), D.dyingTrimmedTo(4, 5), D.dyingTrimmedTo(3, 0)], [5, null, null]);
ok("B14 the death watch trims before it reaps", /trimDyingToDeathState\(actor\)\.finally\(\(\) => scheduleReap\(actor\)\)/.test(read("module", "combat", "death-watch-workflow.mjs")));

/* C — the declared effect */
const DE = await imp("magic/declared-effect.mjs");
const sec = DE.normaliseDeclaredEffect({ kind: "declare", label: "Second Heart", flags: { deathGuard: second, macro: { evil: true } } });
equal("C1 only the listed flags are carried", Object.keys(sec.flags), ["deathGuard"]);
equal("C2 a non-object flag is refused; nothing to declare is no row", [DE.normaliseDeclaredEffect({ flags: { deathGuard: "yes" } }), DE.normaliseDeclaredEffect({ flags: {} })], [null, null]);
const wr = DE.normaliseDeclaredEffect({ label: "Worldroot Fragment", deathState: 1, noStack: true });
const wrData = DE.declaredEffectData(wr, "trg-prime", "add");
equal("C3 Death State is the one change, and its end trims rather than kills", [wrData.changes, wrData.flags["trg-prime"].deathStateClamp, wrData.flags["trg-prime"].declaredKey],
  [[{ key: "system.combat.deathState", type: "add", value: "1" }], true, "worldroot fragment"]);
equal("C4 a second Worldroot Fragment is refused", [DE.declaredAlreadyOn([fx({ declaredKey: "worldroot fragment" })], wr), DE.declaredAlreadyOn([], wr)], [true, false]);
const writ = DE.normaliseDeclaredEffect({ label: "Writ of Restraint", flags: { fumbleNoReactions: true }, rounds: 1 });
equal("C5 no Reactions is a plain true, for one round", [writ.flags.fumbleNoReactions, writ.rounds, DE.normaliseDeclaredEffect({ flags: { fumbleNoReactions: "yes" } })], [true, 1, null]);
const ember = DE.normaliseDeclaredEffect({ label: "Emberthistle", flags: { nextSpellDamage: { damageTypes: ["fire"], dice: "1d4" }, strikeRider: { label: "Emberthistle", dice: "1d4", damageType: "fire", whenDamageTypes: ["fire"], once: true, spendOnHit: true } } });
equal("C6 a rider travels normalised beside the spell boost", [ember.flags.strikeRider.whenDamageTypes, ember.flags.strikeRider.spendOnHit, Boolean(ember.flags.nextSpellDamage)], [["fire"], true, true]);
ok("C7 the card says what a guard does", /first blow that would drop it to 0 HP/.test(DE.declaredCastLine(sec)) && /Death State \+1/.test(DE.declaredCastLine(wr)));

/* D — remove, restore, relieve */
const R = await imp("magic/restore-rows.mjs");
equal("D1 a removal names known conditions or a persistent type", [R.normaliseConditionRemove({ conditions: ["dazzled", "nonsense"] }, { dazzled: {} })?.conditions, R.normaliseConditionRemove({ conditions: [] }, {}), R.normaliseConditionRemove({ recurringType: "Acid" }, {})?.recurringType], [["dazzled"], null, "acid"]);
const recurring = (t, id) => ({ id, flags: { "trg-prime": { condition: "recurring", damageType: t } } });
equal("D2 one source of persistent acid ends, the fire stays", R.recurringToEnd([recurring("fire", "a"), recurring("acid", "b"), recurring("acid", "c")], { recurringType: "acid", count: 1 }).map((e) => e.id), ["b"]);
equal("D3 a restore names a resource and an amount", [R.normaliseRestore({ resource: "pp", amount: "all" })?.all, R.normaliseRestore({ resource: "gold", amount: 1 }), R.normaliseRestore({ resource: "conviction", amount: 0 })], [true, null, null]);
equal("D4 all PP is the ceiling less what is locked; a number is capped by the room", [R.restoreAmount(R.normaliseRestore({ resource: "pp", amount: "all" }), { value: 3, max: 20, locked: 5 }), R.restoreAmount(R.normaliseRestore({ resource: "conviction", amount: 1 }), { value: 3, max: 3 }), R.restoreAmount(R.normaliseRestore({ resource: "hp", amount: "all" }), { value: 0, max: 30 })], [12, 0, 30]);
const CR = await imp("magic/condition-relief.mjs");
const soul = CR.normaliseConditionRelief({ kind: "conditionRelief", condition: "dying", amount: 1 });
const nine = CR.normaliseConditionRelief({ kind: "conditionRelief", condition: "fatigued", amount: "1d6", choices: ["fatigued", "injured"], choiceAmounts: { injured: "1d4", nonsense: "1d4" } });
equal("D5 Dying is relieved; a dice amount is a formula; a per-choice formula for Injured", [soul?.condition, nine.amountFormula, nine.choiceAmounts, CR.reliefAmountFormula(nine, "injured"), CR.reliefAmountFormula(nine, "fatigued")], ["dying", "1d6", { injured: "1d4" }, "1d4", "1d6"]);
equal("D6 an older relief row normalises exactly as it did", Object.keys(CR.normaliseConditionRelief({ kind: "conditionRelief", condition: "fatigued", amount: 2 })), ["condition", "amount", "oncePerDay", "choices", "casterGains"]);
const resin = CR.normaliseConditionRelief({ kind: "conditionRelief", condition: "bleeding", amount: "1d4", targetItems: ["Unliving Zombie"] });
equal("D7 Embalmer's Black Resin reaches only the creatures it names", [CR.reliefReaches(resin, ["Unliving Zombie"]), CR.reliefReaches(resin, ["Unliving Vampire"]), CR.reliefReaches(soul, [])], [true, false, true]);
const SE = read("module", "magic", "spell-effects.mjs");
ok("D8 Dying relieved to 0 is a recovery; the dead are not relieved", /else if \(relief\.condition === "dying"\) \{[\s\S]{0,400}applyDyingRecovery\(target\)/.test(SE) && /if \(isDead\(target\)\) \{\s*lines\.push\(line\(`<em>\$\{target\.name\} is dead/.test(SE));
ok("D9 a restore of HP goes through healActor", /const healed = await healActor\(target, give, \{ magical: true \}\);/.test(SE));
ok("D10 a re-save may answer either of two afflictions, once", /const either = String\(scaled\.resave\)\.includes\("\|"\);/.test(read("module", "consumable-use-workflow.mjs")) && /if \(either\) break;/.test(read("module", "consumable-use-workflow.mjs")));

/* E — the next fire spell */
const N = await imp("magic/next-spell-damage.mjs");
const boosts = N.declaredNextSpellDamage([fx({ nextSpellDamage: { label: "Blackfire Ivy", damageTypes: ["fire"], extraDie: true, ignoreResistance: true } }, { id: "ivy" }), fx({ nextSpellDamage: { damageTypes: [] } }, { id: "bad" })]);
equal("E1 a boost needs types and a die", boosts.map((b) => b.effectId), ["ivy"]);
const fireBall = { effects: [{ kind: "damage", formula: "6d6", damageType: "fire" }] };
const frost = { effects: [{ kind: "damage", formula: "4d8", damageType: "cold" }] };
const savedFire = { save: { damage: { formula: "3d10", type: "fire" } } };
equal("E2 one more of the spell's own dice, for a fire spell only", [N.nextSpellDamageFor(boosts, fireBall)?.dice, N.nextSpellDamageFor(boosts, frost), N.nextSpellDamageFor(boosts, savedFire)?.dice, N.nextSpellDamageFor(boosts, frost, { elementalType: "fire" })?.dice],
  ["1d6", null, "1d10", "1d8"]);
globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: {} };
const DMG = await imp("combat/damage-workflow.mjs");
const resists = { combat: { resistances: "fire" } };
const before = DMG.resolveAgainstDefences(resists, { amount: 10, type: "fire", dr: 0, naturalArmourDr: 0 }).taken;
DMG.setResistanceBypass(["fire"]);
const during = DMG.resolveAgainstDefences(resists, { amount: 10, type: "fire", dr: 0, naturalArmourDr: 0 }).taken;
const coldDuring = DMG.resolveAgainstDefences({ combat: { resistances: "cold" } }, { amount: 10, type: "cold", dr: 0, naturalArmourDr: 0 }).taken;
// A FIRE SPELL CARRIES THE FIRE TRAIT (3.630.1, F6): "fire" resistance is
// read as a trait too, and the bypass must lift that copy as well.
const spellDuring = DMG.resolveAgainstDefences(resists, { amount: 10, type: "fire", dr: 0, naturalArmourDr: 0, magical: true, targeted: true, sourceTraits: ["fire", "invocation", "arcane"] }).taken;
// …AND A BYPASS NOBODY CLEARED LAPSES ON ITS OWN CLOCK.
const realNow = Date.now;
Date.now = () => realNow() + 200000;
const lapsed = DMG.resolveAgainstDefences(resists, { amount: 10, type: "fire", dr: 0, naturalArmourDr: 0 }).taken;
Date.now = realNow;
DMG.clearResistanceBypass();
const after = DMG.resolveAgainstDefences(resists, { amount: 10, type: "fire", dr: 0, naturalArmourDr: 0 }).taken;
equal("E3 the cast's ignored resistance is fire's alone, and only while it lasts", [before < 10, during, coldDuring < 10, lapsed < 10, after < 10], [true, 10, true, true, true]);
equal("E3b the bypass lifts the trait-keyed copy a fire spell meets", spellDuring, 10);
const CW = read("module", "magic", "cast-workflow.mjs");
ok("E4 the boost joins the warp dice beside the reagents and is spent", /if \(boost\) \{\s*warpMods\.damageDice = addDice\(warpMods\.damageDice, boost\.dice\);\s*if \(boost\.ignoreResistance\) setResistanceBypass\(boost\.types\);/.test(CW) && /if \(spent\) await spent\.delete\(\);/.test(CW));
ok("E5 the bypass is cleared at the cast's start and at its end", /clearResistanceBypass\(\);\s*const \{ declaredNextSpellDamage/.test(CW) && /clearResistanceBypass\(\); \}\s*return \{ \.\.\.outcome, ppSpent/.test(CW));

/* F — weapon riders */
const SR = await imp("magic/strike-riders.mjs");
const rose = SR.normaliseStrikeRider({ label: "Rose of Thorns", condition: "bleeding", conditionValue: 2, conditionRounds: 0, once: true, spendOnHit: true });
const tangle = SR.normaliseStrikeRider({ label: "Tangleweed", condition: "slowed", conditionValue: 1, conditionSave: { save: "reflex", dc: 18 }, once: true });
equal("F1 a condition and no die is a rider; Bleeding stays until staunched; a save rides with it", [rose?.conditionOnly, "conditionRounds" in (rose ?? {}) && rose.conditionRounds === null, tangle?.conditionSave, "conditionRounds" in (tangle ?? {})], [true, true, { save: "reflex", dc: 18 }, false]);
equal("F2 neither die nor condition is still malformed; an older rider keeps its shape", [SR.normaliseStrikeRider({ label: "x" }), Object.keys(SR.normaliseStrikeRider({ dice: "1d6", damageType: "force" })).includes("conditionOnly")], [null, false]);
equal("F3 a condition-only rider adds no damage packet", SR.riderPacketsFor([rose], { attackMode: "melee" }).length, 0);
const emberRider = SR.normaliseStrikeRider({ label: "Emberthistle", dice: "1d4", damageType: "fire", whenDamageTypes: ["fire"], once: true, spendOnHit: true });
equal("F4 a gated once-rider is not spent by a blow its gate refuses", [SR.ridersSpentBy([emberRider], { attackMode: "melee" }, { ctx: { damageType: "slashing" } }).length, SR.ridersSpentBy([emberRider], { attackMode: "melee" }, { ctx: { damageType: "fire" } }).length, SR.ridersSpentBy([emberRider], { attackMode: "melee" }).length], [0, 1, 1]);
const SRW = read("module", "magic", "strike-riders-workflow.mjs");
ok("F5 the condition's save is rolled and a success resists", /if \(spec\.conditionSave\) \{[\s\S]{0,900}if \(\["heroic", "critical", "success"\]\.includes\(key\)\) \{/.test(SRW));
ok("F6 the hit path hands the strike's facts to the spend", /spendStrikeRiders\(actor, weapon, \{ ctx: riderCtx \}\)/.test(read("module", "combat", "attack-workflow.mjs")));

/* G — one degree better; a declared Success */
const SC = await imp("magic/save-convert.mjs");
const litany = SC.declaredSaveConvertSources([fx({ saveConvert: { label: "Communal Litany", saves: ["fortitude", "reflex", "will"], traits: ["fear", "mental"], improve: true, uses: 2 } })]);
const spec = litany[0].spec;
equal("G1 the printed improvements, and none for a Success", ["failure", "partial", "fumble", "blunder", "success"].map((d) => SC.convertTarget(spec, d)), ["partial", "success", "failure", "fumble", null]);
equal("G2 counted uses; offered against a Fear save, not a Poison one", [spec.uses, SC.saveConvertVerdict(spec, { save: "will", degree: "failure", traits: ["fear"] }), SC.saveConvertVerdict(spec, { save: "will", degree: "failure", traits: ["poison"] })], [2, "offer", null]);
equal("G3 Iron Will of the Tomb still converts to a Success", SC.convertTarget(SC.declaredSaveConverts([fx({ saveConvert: { label: "Iron Will", saves: ["will"] } })])[0], "fumble"), "success");
ok("G4 a counted conversion spends a use, the last one deletes", /if \(left <= 0\) await effect\.delete\(\);\s*else await effect\.update\(\{ \[`flags\.\$\{SYSTEM_ID\}\.saveConvert\.uses`\]: left \}\);/.test(read("module", "magic", "save-convert-workflow.mjs")));
const CHK = read("module", "dice", "check.mjs");
ok("G5 a declared Success is asked before any reroll and stops them", (() => {
  const i = CHK.indexOf("const declared = await offerFateDeclare(check);");
  return i > 0 && i < CHK.indexOf("const luck = await offerLuckyBreak(check);") && /check\.saveReactionResolved = true;\s*\}\s*\}/.test(CHK.slice(i, i + 400));
})());
const FD = read("module", "dice", "fate-declare-workflow.mjs");
ok("G6 the Success is exactly Success and the effect goes", /convertedOutcome\(check\.outcome, "success"\)/.test(FD) && /shiftedFrom: undefined/.test(FD) && /await source\.effect\.delete\(\)/.test(FD));
{
  globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: {} };
  const CK = await imp("dice/check.mjs");
  const shown = CK.buildOutcomeDisplay({ degree: { key: "success", label: "Success" }, margin: -6, dc: 20, modifiers: [], modifierTotal: 0, bonusCheck: null, declared: true });
  ok("G7 a declared Success shows no margin and offers no Conviction", shown.marginText === "Declared — the dice do not count"
    && /declared: true \};\s*(\/\/[^\n]*\n\s*)*check\.luckUsed = true;/.test(FD));
}

/* H — thresholds */
const EC = await imp("magic/entry-check.mjs");
const law = EC.normaliseEntryCheck({ kind: "entryCheck", label: "Old Law", save: "will", crossingOnly: true, oncePerRound: true, hostileOnly: true,
  gate: [{ types: ["undead"] }, { traits: ["spirit"] }, { incorporeal: true }, { nothing: 1 }],
  degrees: { critical: { unaffected: true }, failure: { text: "cannot cross", pushBack: true, bar: "turn" }, fumble: { pushBack: true, bar: "spell" } } });
equal("H1 a threshold saves instead of a skill, crosses from outside, once a round", [law.save, law.skills, law.crossingOnly, law.oncePerRound, law.hostileOnly, law.gate.length], ["will", [], true, true, true, 3]);
const ward = EC.normaliseEntryCheck({ kind: "entryCheck", save: "will", gate: [{ traits: ["spirit"] }, { types: ["undead"], incorporeal: true }], degrees: { failure: { bar: 60 } } });
equal("H2 'a disembodied spirit or incorporeal Undead' — a skeleton walks through", [EC.entryGateHolds(ward, { traits: ["spirit"] }), EC.entryGateHolds(ward, { types: ["undead"], incorporeal: true }), EC.entryGateHolds(ward, { types: ["undead"] }), EC.entryGateHolds(law, { types: ["humanoid"] })], [true, true, false, false]);
equal("H3 a rung puts the creature back and bars it", [EC.entryCheckOutcome(law, "failure", "").pushBack, EC.entryCheckOutcome(law, "blunder", "").bar, EC.entryCheckOutcome(law, "heroic", "").unaffected], [true, "spell", true]);
// A THRESHOLD KEEPS ITS REGION (3.630.1, F10): an entry check is the
// whole of Old Law and Threshold Ward, so it must claim the placed Region.
{
  const ARL = await imp("magic/area-region-life.mjs");
  ok("H4b a spell whose only area row is an entry check keeps its Region",
    ARL.areaRegionIsClaimed({ effects: [{ kind: "modifier" }, { kind: "entryCheck", save: "will" }] }) === true
    && ARL.shouldClearAreaRegion("r1", { effects: [{ kind: "entryCheck" }] }) === false);
}
// THE PUSH BACK IS A DISPLACEMENT (3.630.1, F11): a walk back across the
// threshold was itself a crossing, refused and pushed back again for ever.
{
  const ECWsrc = read("module", "magic", "entry-check-workflow.mjs");
  const HT = await imp("magic/hazard-terrain.mjs");
  ok("H4c the push back displaces, and a displacement asks no entry check",
    /await tokenDocument\.update\(\{ x: back\.x, y: back\.y \}, \{\s*movement: \{ \[tokenDocument\.id\]: \{ method: "api", waypoints: \[\{ x: back\.x, y: back\.y, action: "displace" \}\] \} \}/.test(ECWsrc)
    && HT.hazardTriggers("displace") === false && HT.hazardTriggers("walk") === true);
}
// A BLANK COUNTERACT DC IS NO DC, AND EXORCISE'S IS ITS LEVEL'S (3.630.1, F12/F13).
{
  const CC = read("module", "combat", "counteract-workflow.mjs");
  ok("H4d an empty DC box no longer measures the Counteract against DC 0",
    /result\.dc === null \? null : Number\(result\.dc\);\s*let dc = Number\.isFinite\(rawDC\) && rawDC > 0 \? rawDC : null;/.test(CC)
    && /if \(dc === null && dcFromLevel\) \{[\s\S]{0,120}dc = levelDC\(/.test(CC));
  ok("H4g the level/PP difference is untyped, so a real circumstance bonus stacks with it",
    /label: `Level\/PP difference \(\$\{result\.acting\} vs \$\{result\.target\}\)`,\s*value: modifier,\s*(\/\/[^\n]*\n\s*)*type: "untyped"/.test(CC));
  ok("H4e the dialog carries a circumstance box, and Exorcise pre-fills its warp",
    /name="circumstance" value="\$\{Math\.trunc\(Number\(circumstance\) \|\| 0\)\}"/.test(CC)
    && /if \(circ\) modifiers\.push\(\{ label: "Circumstance", value: circ, type: "circumstance" \}\);/.test(CC)
    && /rollCounteractCheck\(caster, \{ targetLevel: 0, dc: null, circumstance: warpCirc, dcFromLevel: true \}\)/.test(read("module", "magic", "spell-effects.mjs")));
}
// THE SHEET'S OWN DAMAGE ROLL ASKS THE DAMAGE CONDITIONALS TOO (3.630.1, F16).
ok("H4f the standalone Damage roll hands its declared bonus to resolveWeaponDamage",
  /const standaloneDeclared = await declaredDamageBonus\(actor, weapon\);\s*const damageResult = await resolveWeaponDamage\(actor, weapon, \{\s*declaredBonus: standaloneDeclared\.bonus,\s*declaredBonusLines: standaloneDeclared\.lines,/.test(read("module", "combat", "attack-workflow.mjs")));
// THE SECOND REAPER HEARS OF THE SPARE (3.630.1, F1): the damage card no
// longer says "has died" when the death watch's reap ran the guard.
{
  const DSsrc = read("module", "combat", "death-state.mjs");
  ok("B9 an in-flight reap is awaited and its spare shared; a spare just given is handed on once",
    /if \(key && reaping\.has\(key\)\) \{\s*const shared = await reaping\.get\(key\)\.catch\(\(\) => null\);\s*takeRecentlySpared\(key\);\s*return shared\?\.spared \? \{ \.\.\.out, spared: shared\.spared \} : out;/.test(DSsrc)
    && /if \(!isDead\(actor\)\) \{\s*const spared = takeRecentlySpared\(key\);\s*return spared \? \{ \.\.\.out, spared \} : out;/.test(DSsrc)
    && /if \(result\?\.spared\) rememberSpared\(key, result\.spared\);/.test(DSsrc));
}
// WAKING RACES THE DEATH STATE'S CLEAR WITHOUT THROWING (3.630.1, F3).
ok("B10b the Death State's own clear loses the same race quietly",
  /try \{\s*await actor\.toggleStatusEffect\("unconscious", \{ active: false \}\);\s*\} catch \(_e\) \{\s*return !actor\.hasCondition\?\.\("unconscious"\);\s*\}/.test(read("module", "combat", "death-state.mjs")));
ok("B10 the wake deletes only what is still there, and a lost race is no failure",
  /for \(const effect of direct\) \{\s*if \(!actor\.effects\?\.get\?\.\(effect\.id\)\) continue;\s*try \{ await effect\.delete\(\); \} catch \(_e\) \{ \/\* already gone \*\/ \}\s*\}/.test(read("module", "conditions", "condition-events-workflow.mjs")));
// A DOSE IS NOT A SPELL, AND "HAD NO" (3.630.1, F4/F5).
{
  const CRL = await imp("magic/condition-relief.mjs");
  const SEsrc = read("module", "magic", "spell-effects.mjs");
  ok("D9 a herb's empty relief says the dose is spent, and an empty removal says 'had no'",
    /the dose is spent/.test(CRL.reliefNothingLine("Toben", "Dying", "dose")) && /the spell is spent/.test(CRL.reliefNothingLine("Toben", "Dying"))
    && SEsrc.includes('reliefNothingLine(target.name, relief.label, spell?.type === "spell" && !spell?.flags?.[SYSTEM_ID]?.syntheticConsumable ? "spell" : "dose")')
    && /flags: \{ \[SYSTEM_ID\]: \{ syntheticConsumable: true \} \}/.test(read("module", "consumable-use-workflow.mjs"))
    && SEsrc.includes("`${target.name} had no ${["));
}
// A COATING WITH NO WEAPON IN HAND KEEPS ITS DOSE (3.630.1, F7).
ok("F7 a weapon coating is refused before the AP and the dose when no weapon is wielded", (() => {
  const CU = read("module", "consumable-use-workflow.mjs");
  const i = CU.indexOf("if (!enchantableWeapons(Array.from(recipient.items ?? [])).length) {");
  return i > 0 && i < CU.indexOf("// 3. THE PRINTED ACTIVATION.") && /The dose is kept\.`\);\s*return null;/.test(CU.slice(i, i + 300));
})());
equal("H4 Web's outcome keeps its shape", Object.keys(EC.entryCheckOutcome(EC.normaliseEntryCheck({ kind: "entryCheck", skills: ["athletics"], degrees: { failure: { text: "stuck" } } }), "failure", "athletics")),
  ["rolled", "at", "clamped", "text", "rows", "unaffected", "endsChecksThisTurn", "clears"]);
const turn = "c:2:1";
equal("H5 bars: this turn, for a minute, for the spell", [EC.entryBarred({ r: EC.entryBarFor({ bar: "turn" }, { turnKey: turn }) }, "r", { turnKey: turn }), EC.entryBarred({ r: EC.entryBarFor({ bar: "turn" }, { turnKey: turn }) }, "r", { turnKey: "c:3:1" }),
  EC.entryBarred({ r: EC.entryBarFor({ bar: 60 }, { now: 100 }) }, "r", { now: 150 }), EC.entryBarred({ r: EC.entryBarFor({ bar: 60 }, { now: 100 }) }, "r", { now: 161 }), EC.entryBarred({ r: EC.entryBarFor({ bar: "spell" }) }, "r", {})], [true, false, true, false, true]);
const ECW = read("module", "magic", "entry-check-workflow.mjs");
ok("H6 a threshold asks only a creature crossing in from outside", /if \(spec\.crossingOnly\) \{\s*if \(startedInside \|\| !enteredInside\) continue;/.test(ECW));
ok("H7 a stopped creature is put back outside", /if \(outcome\.pushBack\) \{\s*const moved = await pushBackOutside\(/.test(ECW));

/* I — facts, choices, counts */
const RF = await imp("magic/reveal-fact.mjs");
const facts = { saves: { fortitude: 8, reflex: 3, will: 3 }, defences: { immunities: [], weaknesses: ["fire"], resistances: ["cold"] }, speeds: { land: 30, fly: 0, swim: 20 }, senses: [{ name: "Sight" }, { name: "Darkvision", rangeFeet: 60 }] };
equal("I1 Defences: the lowest save (ties said); Resilience: a weakness before a resistance", [RF.revealFact("defences", facts).text, RF.revealFact("resilience", facts).text], ["its lowest save is <strong>Reflex and Will</strong> (tied).", "it has <strong>weakness to fire</strong>."]);
equal("I1b three equal saves are said as equal", RF.revealFact("defences", { ...facts, saves: { fortitude: 3, reflex: 3, will: 3 } }).text, "its three saves are <strong>equal</strong> — none is weaker than the others.");
equal("I2 Mobility lists the speeds it has; Senses the first unusual one; Capability is the GM's", [RF.revealFact("mobility", facts).text, RF.revealFact("senses", facts).text, RF.revealFact("capability", facts).gm],
  ["it moves by <strong>land 30 feet</strong>, <strong>swim 20 feet</strong>.", "its most significant unusual sense is <strong>Darkvision</strong> (60 ft.).", true]);
const SL = await imp("magic/slot-choice.mjs");
const grace = SL.withRankedSkills(SL.normaliseSlotChoice({ kind: "bonus", chooseFrom: "savesOrRankedSkills", value: 1 }), { athletics: { ranks: 2 }, arcana: { ranks: 0 } });
equal("I3 Exemplar's Grace: the three saves and the caster's ranked skills", grace.options, ["fortitude", "reflex", "will", "athletics"]);
equal("I4 one more pick per warp", [SL.slotChoiceCount(grace, {}), SL.slotChoiceCount(grace, { choiceExtra: 1 })], [{ count: 1, prompt: true }, { count: 2, prompt: true }]);
const SP = await imp("magic/spell-pending.mjs");
const portents = SP.normalisePendingGrant({ label: "Portent", swing: "advantage", scope: "Spend a Portent", uses: 3, turns: 10 }, false, () => 1);
equal("I5 three Portents in one entry, ten turns", [portents.uses, portents.turns, portents.oneShot], [3, 10, true]);
const PM = await imp("pending-modifiers.mjs");
const store = {};
const fakeActor = { getFlag: (s, k) => store[k], setFlag: async (s, k, v) => { store[k] = v; } };
const rec = await PM.addPendingModifier(fakeActor, { kind: "advantage", label: "Portent", scope: "x", oneShot: true, uses: 3 });
await PM.consumePendingModifiers(fakeActor, [rec.id]);
const one = PM.pendingModifiers(fakeActor)[0]?.usesLeft;
await PM.consumePendingModifiers(fakeActor, [rec.id]);
await PM.consumePendingModifiers(fakeActor, [rec.id]);
equal("I6 a Portent spent loses one; the last one goes", [rec.usesLeft, one, PM.pendingModifiers(fakeActor).length], [3, 2, 0]);

/* J — riders that grow */
const DR = await imp("combat/damage-riders.mjs");
const judgement = DR.declaredDamageRiders([fx({ strikeDamageRider: { dice: "1d6", label: "Judgement", oncePerRound: true, extraVs: { dice: "1d6", targetTypes: ["undead"], targetTraits: ["unliving"] } } })]);
equal("J1 Restless End grows the Judgement against Undead or Unliving only", [DR.damageRidersFor(judgement, { targetTypes: ["undead"] })[0].dice, DR.damageRidersFor(judgement, { targetTraits: ["unliving"] })[0].dice, DR.damageRidersFor(judgement, { targetTypes: ["humanoid"] })[0].dice], ["1d6 + 1d6", "1d6 + 1d6", "1d6"]);
{
  const DR = await imp("combat/damage-riders.mjs");
  const AWsrc = read("module", "combat", "attack-workflow.mjs");
  const spec = { id: "j", label: "Judgement", dice: "1d6", targetUuids: [], oncePerRound: true, extraVs: { dice: "1d6", label: "Restless End", targetTypes: ["undead"], targetTraits: [] } };
  const [hit] = DR.damageRidersFor([spec], { targetTypes: ["undead"] });
  ok("J1b the grown die is named on the card", hit?.grownBy === "Restless End"
    && /secondary damage\$\{rider\.grownBy \? ` \(with \$\{rider\.grownBy\}\)` : ""\}/.test(AWsrc));
}
const CDR = await imp("magic/caster-damage-riders.mjs");
const mantle = CDR.declaredSpellDamageRiders([fx({ spellDamageRider: { label: "Elemental Mantle", dice: "1d6", damageType: "fire", when: { damageTypes: ["fire"], traditions: ["verdant"] }, oncePerRoundAny: true } }, { id: "m" })]);
equal("J2 Elemental Mantle rides a Verdant fire spell, once a round over all", [CDR.spellDamageRidersFor(mantle, { damageType: "fire", taken: 5, tradition: "verdant" }).length, CDR.spellDamageRidersFor(mantle, { damageType: "fire", taken: 5, tradition: "arcane" }).length,
  CDR.spellDamageRidersFor(mantle, { damageType: "fire", taken: 5, tradition: "verdant", targetUuid: "B", used: CDR.spellRidersBurnUpdate(mantle, "A", {}) }).length], [1, 0, 0]);

/* K — wiring */
const APIW = read("module", "module-api-workflow.mjs");
ok("K1 the API offers the feat-pick bonus and the damage share", /registerFeatPickBonus: \(key, picks, moduleId\) => registerFeatPickBonus\(key, picks, moduleId\)/.test(APIW) && /registerDamageShare: \(key, share, moduleId\) => registerDamageShare\(key, share, moduleId\)/.test(APIW));
ok("K2 the helpers a module's offers need", ["grantTempHP", "activeRunesOn", "runeMarkersOf", "runeFrequencyAllows", "runeUseUpdates", "activeToken", "distanceBetween"].every((k) => new RegExp(`\\b${k}: async`).test(APIW)));
API.resetModuleRegistry();
ok("K3 a damage share needs a function and is listed", API.registerDamageShare("x", 1) === false && API.registerDamageShare("Martyr's Aegis", async () => null) === true && API.registeredDamageShares().length === 1);
ok("K4 a share is asked below Sacrificing Shield and above the dying machinery", (() => {
  const i = DW.indexOf("for (const share of registeredDamageShares()) {");
  return i > DW.indexOf("const redirect = await redirectWithShield(actor, amount);") && i < DW.indexOf("const alreadyDying = Boolean(actor.hasCondition?.(\"dying\"));");
})());
ok("K5 an overflowing heal is announced, not for the Dying", /if \(excess > 0 && !wasDying\) globalThis\.Hooks\?\.callAll\?\.\("trgPrimeOverheal"/.test(SE));
ok("K6 a landed spell rider is announced", /globalThis\.Hooks\?\.callAll\?\.\("trgPrimeSpellRiderLanded", \{ caster: actor, target, rider, taken: packet\.taken, spell, lines: follow \}\);/.test(CW));
ok("K7 a check's final degree is announced", /globalThis\.Hooks\?\.callAll\?\.\("trgPrimeCheckResolved", \{/.test(CHK));
const AW = read("module", "combat", "action-workflow.mjs");
ok("K8 an action may be refused before anything is spent; its total reaches the module", /if \(globalThis\.Hooks\?\.call\?\.\("trgPrimeActionAttempt", \{ actor, action, targetActor, invokedSkillKey: requestedSkillKey \}\) === false\) return null;/.test(AW) && /checkTotal: check\.outcome\?\.total \?\? null,/.test(AW));
ok("K9 the declared row and the six new kinds are known", ["declare", "conditionRemove", "restore", "counteractAffliction", "counteractRoll", "revealFact"].every((k) => read("module", "magic", "effect-kinds.mjs").includes(`"${k}"`)));
ok("K10 Sporeglow grows by caster level", /for \(const step of Array\.isArray\(effect\.byCasterLevel\) \? effect\.byCasterLevel : \[\]\) \{\s*if \(casterLevelOf\(caster\?\.system\) < Number\(step\?\.cl \?\? Infinity\)\) continue;/.test(SE));
ok("K11 Writ's Slowed 2 steps down to 1, carrying its save and no Reactions", /tag\.followOn = \{\s*tags: \[\{ key: effect\.condition, label: cond\.label, value: Math\.trunc\(Number\(effect\.thenValue\)\) \}\],/.test(SE) && /if \(\["conditionSave", "fumbleNoReactions"\]\.includes\(flag\)\)/.test(read("module", "combat", "linked-conditions-workflow.mjs")));
ok("K12 an escape save carries its modifier", /\.\.\.\(spec\.modifier \? \{ modifiers: \[\{ label: spec\.label, value: spec\.modifier/.test(read("module", "magic", "condition-save-workflow.mjs")));
ok("K13 an attacker's own Ghost Touch while in a stance", /\|\| actorGhostTouch\(actor\)/.test(read("module", "combat", "attack-workflow.mjs")));
ok("K14 Spell Substitution takes two spells when an effect says so", /\.map\(\(e\) => e\?\.flags\?\.\["trg-prime"\]\?\.spellSubstitution\)/.test(read("module", "feats-workflow.mjs")));
ok("K15 a feat opens an action to a specialist skill", /substituteSkillActions\(`specialist:\$\{slugifyKey\(label\)\}`, featNames, SKILL_ACTIONS\)/.test(read("module", "sheets", "actor-sheet.mjs")));
ok("K16 a nearby item may include its user", /if \(scaled\.nearby\.includeSelf === true && nearbyRecipient\(recipient\.system, scaled\.nearby\)\) around\.unshift\(recipient\);/.test(read("module", "consumable-use-workflow.mjs")));
ok("K17 the warp counts are declared, applied and merged", ["choiceExtra", "declareUses", "heldUses", "resaveModifier"].every((k) => (read("module", "magic", "spell-warp.mjs").match(new RegExp(k, "g")) ?? []).length >= 3));

if (failures.length) { console.log(`verify-automation-pass: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-automation-pass: ${checks} checks — all green.`);
