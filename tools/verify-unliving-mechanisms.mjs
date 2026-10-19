#!/usr/bin/env node
/**
 * verify-unliving-mechanisms — 3.627.0: the declarations Pillars of Faith's
 * Chapter 9 (The Unliving) needed and the core lacked. Death guards; a
 * feat's after-strike on a critical injury (and disease exposure); healing
 * for felling a foe; a declared damage-type option on natural strikes and the
 * rider gated on it; strike-rider conditions asked their gates; weapon-
 * declared riders; save conversion; always-defensive casting; Natural Leaper;
 * a granted spell's uses; a spell save DC bonus by trait; not breathing; and
 * Drink Blood.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (p) => import(new URL(`../module/${p}`, import.meta.url));
const fx = (flags) => ({ flags: { "trg-prime": flags } });

/* A. Death guards */
const dg = await mod("combat/death-guard.mjs");
const fort = fx({ deathGuard: { label: "Unliving Fortitude", save: "fortitude", exceptDamageTypes: ["essence"], exceptWeakness: true } });
const gas = fx({ deathGuard: { label: "Gaseous Escape", offer: true, frequency: "daily", spell: "Gaseous Form" } });
const guards = dg.declaredDeathGuards([gas, fort, { ...fort }, { disabled: true, ...fx({ deathGuard: { label: "Off", save: "will" } }) }]);
equal("A1 guards: a save guard first, an offer after, one per label, a disabled effect carries none", guards.map((g) => g.label), ["Unliving Fortitude", "Gaseous Escape"]);
equal("A2 a declaration that neither saves nor offers is no guard", dg.declaredDeathGuards([fx({ deathGuard: { label: "X" } })]).length, 0);
equal("A3 essence damage is excepted", dg.deathGuardExcepted(guards[0], { damageTypes: ["essence"] }), "the damage is essence");
equal("A4 a type the creature is weak to is excepted", dg.deathGuardExcepted(guards[0], { damageTypes: ["fire"], weaknesses: new Set(["fire"]) }), "fire is a damage type it is weak to");
equal("A5 slashing it is not weak to is answered", dg.deathGuardExcepted(guards[0], { damageTypes: ["slashing"], weaknesses: new Set(["fire"]) }), null);
equal("A6 a daily guard already used today does not answer", dg.deathGuardExcepted(guards[1], { usedToday: { "Gaseous Escape": true } }), "already used today");
const ldc = (l) => 10 + 2 * l;
equal("A7 opposed: the source's Level DC when known", dg.deathGuardDC(9, 4, ldc), { dc: 28, level: 9, from: "source" });
equal("A8 no source: the defender's own Level DC", dg.deathGuardDC(null, 4, ldc), { dc: 18, level: 4, from: "own" });
equal("A9 success or better holds; Partial does not", ["heroic", "critical", "success", "partial", "failure"].map(dg.deathGuardHolds), [true, true, true, false, false]);
equal("A10 the card says when the blow's type was not reported", [dg.deathGuardTypeUnknown(guards[0], []), dg.deathGuardTypeUnknown(guards[0], ["fire"]), dg.deathGuardTypeUnknown(guards[1], [])], [true, false, false]);
const dw = read("module", "combat", "dying-workflow.mjs");
ok("A11 the guard is asked after subdual and before destruction, massive damage and Dying", (() => {
  const g = dw.indexOf("const guarded = await tryDeathGuards(actor, {");
  return g > dw.indexOf('return { case: "knocked-out"') && g < dw.indexOf("if (hasNoDeathState(creatureTypeSystem)) {") && g < dw.indexOf("if (massiveDamageInstantDeath(amount, hpBefore, maxHP)) {")
    // …and a held guard's answer is the blow's result, not a remark beside it.
    && /const guarded = await tryDeathGuards\(actor, \{\s*damageTypes, sourceLevel, sourceName,[\s\S]{0,300}?\}\);\s*if \(guarded\) return guarded;/.test(dw);
})());
ok("A12 the blow's type and source reach the primitive and cross the relay", /applyDamageDirect\(actor, damage, \{ isCritical, nonlethal, redirected, damageTypes, sourceLevel, sourceName \}\)/.test(dw)
  && /damageTypes: Array\.isArray\(payload\.damageTypes\)/.test(read("module", "combat", "target-relay.mjs"))
  && /damageTypes: Array\.isArray\(options\?\.damageTypes\)/.test(read("module", "combat", "target-relay-workflow.mjs")));
const aw = read("module", "combat", "attack-workflow.mjs");
ok("A13 the weapon hit reports its type and the attacker's level", /nonlethal: Boolean\(packet\.nonlethal\),\s*\/\/ What a death guard asks[^\n]*\n\s*damageTypes: \[String\(effectiveDamageType \?\? ""\)\.trim\(\)\.toLowerCase\(\)\]\.filter\(Boolean\),\s*sourceLevel: Number\(actor\.system\?\.identity\?\.level \?\? 0\),/.test(aw));
const dgw = read("module", "combat", "death-guard-workflow.mjs");
ok("A14 a held guard writes 1 HP, marks a daily use, applies its spell to the creature itself", /await actor\.update\(\{ "system\.resources\.hp\.value": 1 \}\);/.test(dgw) && /\[spec\.label\]: true/.test(dgw) && /applySpellEffects\(actor, spell, \{ targets: \[actor\], lines \}\)/.test(dgw) && /actionKey: DEATH_GUARD_ACTION/.test(dgw));
ok("A15 a declared daily use renews at daily preparation", /if \(actor\.getFlag\?\.\(SYSTEM_ID, "declaredUsedToday"\)\) \{\s*await actor\.unsetFlag\(SYSTEM_ID, "declaredUsedToday"\);/.test(read("module", "uses-workflow.mjs")));

/* B. After-strikes a creature declares */
const da = await mod("combat/declared-after-strikes.mjs");
const venom = fx({ afterStrikes: [{ key: "ghoulishVenom", label: "Ghoulish Venom", weaponNames: ["Ghoul Claws", "Bite (Unliving Ghoul)"], onCriticalInjury: true, save: "fortitude",
  conditions: { partial: [{ key: "slowed", value: 1, rounds: 1 }], failure: [{ key: "paralyzed", rounds: 1 }], fumble: [{ key: "paralyzed", minutes: 1, resave: true }] } }] });
const plague = fx({ afterStrikes: [{ key: "ghoulFever", label: "Ghoul Fever", weaponNames: ["Bite (Unliving Ghoul)"], onCriticalInjury: true, expose: { affliction: "Ghoul Fever", oncePerDay: true } }] });
const specs = da.declaredAfterStrikes([venom, plague, fx({ afterStrikes: [{ key: "bad" }] })]);
equal("B1 two declarations, an empty one dropped", specs.map((s) => s.key), ["ghoulishVenom", "ghoulFever"]);
const ctx = { weaponName: "Ghoul Claws", critical: "serious", criticalImmune: false };
equal("B2 fires on a critical injury with a named weapon", da.declaredAfterStrikeFires(specs[0], ctx), true);
equal("B3 not on a plain hit", da.declaredAfterStrikeFires(specs[0], { ...ctx, critical: null }), false);
equal("B4 not with another weapon", da.declaredAfterStrikeFires(specs[0], { ...ctx, weaponName: "Longsword" }), false);
equal("B5 not on a creature immune to criticals — no injury was inflicted", da.declaredAfterStrikeFires(specs[0], { ...ctx, criticalImmune: true }), false);
const lich = da.declaredAfterStrikes([fx({ afterStrikes: [{ key: "paralyticTouch", label: "Paralytic Touch", save: "fortitude", onCriticalInjury: true, dcBySeverity: { serious: 2, deadly: 5 } }] })])[0];
equal("B6 the DC rises Hard for a Serious injury and Very Hard for a Deadly one", ["minor", "serious", "deadly"].map((s) => da.declaredAfterStrikeDC(lich, 30, s)), [30, 32, 35]);
equal("B7 a rounds clock in combat is a round number", da.declaredConditionTag({ key: "slowed", value: 1, rounds: 1 }, { combatRound: 4, worldTime: 100 }), { key: "slowed", value: 1, expiresRound: 5, resave: false });
equal("B8 outside combat a round is six seconds of world time", da.declaredConditionTag({ key: "paralyzed", rounds: 1 }, { combatRound: null, worldTime: 100 }), { key: "paralyzed", value: null, expiresTime: 106, resave: false });
equal("B9 minutes are world time; a resave is carried", da.declaredConditionTag({ key: "paralyzed", minutes: 1, resave: true }, { combatRound: 2, worldTime: 100 }), { key: "paralyzed", value: null, expiresTime: 160, resave: true });
equal("B10 permanent is no clock at all", da.declaredConditionTag({ key: "paralyzed" }, { combatRound: 2, worldTime: 100 }), { key: "paralyzed", value: null, resave: false });
const k = da.exposureKey("Actor.abc", "Ghoul Fever");
equal("B11 one exposure a day: blocked within 24 h, open after", [da.exposureBlocked({ [k]: 1000 }, k, 1000 + 3600), da.exposureBlocked({ [k]: 1000 }, k, 1000 + 86400)], [true, false]);
equal("B12 an exposure declaration takes the attacker's level by default", specs[1].expose, { affliction: "Ghoul Fever", level: "actorLevel", oncePerDay: true });
const daw = read("module", "combat", "declared-after-strikes-workflow.mjs");
ok("B13 the workflow sets the disease level, and the mark and the exposure travel together — through the relay for a creature this client does not own", /data\.system\.level = spec\.expose\.level === "actorLevel" \? level : spec\.expose\.level;/.test(daw) && /await relayAffliction\(targetActor, data, \{ exposureKey: oncePerDay \? key : "", now \}, async \(\) => \{\s*if \(oncePerDay\) await targetActor\.setFlag\(SYSTEM_ID, EXPOSED_FLAG, \{ \.\.\.exposures, \[key\]: now \}\);\s*return exposeToAffliction\(targetActor, data\);/.test(daw));
ok("B14 a resave rides the condition's tag to the core's escape-save rail at the same DC, through the relay", /\.\.\.\(resave \? \{ conditionSave: \{ save, onSuccess: "end", label: spec\.label, saveDC: dc \} \} : \{\}\)/.test(daw) && /await relayConditionTags\(targetActor, tags, \{\}, \(\) => applyConditionTags\(targetActor, tags, \{\}\)\)/.test(daw));
const eaw = read("module", "combat", "effect-application-workflow.mjs");
ok("B14b a tag's escape save is stamped where the condition lands", /if \(!tag\?\.conditionSave \|\| !applied\.some\(\(a\) => a\.key === tag\.key && !a\.immune\)\) continue;\s*const \{ recordConditionSave \} = await import\("\.\.\/magic\/condition-save-workflow\.mjs"\);\s*await recordConditionSave\(actor, \{ \.\.\.tag\.conditionSave, condition: tag\.key \}\);/.test(eaw));
const relay = await mod("combat/target-relay.mjs");
const seen = [];
const deps = { fromUuid: async () => ({ name: "Goblin" }), markExposure: async (t, k, n) => seen.push(["mark", k, n]), exposeAffliction: async (t, d) => { seen.push(["expose", d.name, d.system.level]); return { immune: false }; } };
const gave = await relay.performRelay({ action: relay.RELAY_ACTIONS.AFFLICTION, uuid: "x", payload: { data: { type: "affliction", name: "Ghoul Fever (Disease)", system: { level: 9 } }, exposureKey: "Actor.g:ghoul fever (disease)", now: 500 } }, deps);
equal("B14c the GM's client marks the day and exposes the creature", [gave.ok, seen], [true, [["mark", "Actor.g:ghoul fever (disease)", 500], ["expose", "Ghoul Fever (Disease)", 9]]]);
const forged = await relay.performRelay({ action: relay.RELAY_ACTIONS.AFFLICTION, uuid: "x", payload: { data: { type: "weapon", name: "Vorpal" } } }, deps);
equal("B14d and refuses anything that is not an affliction", forged.ok, false);
ok("B15 the attack path runs them after the rune after-strikes, with the critical's severity", /applyRuneAfterStrikes\(actor, weapon, targetActor, \{ critical: Boolean\(critical\) \}\)\) \{\s*lines\.push\(line\(afterLine\)\);\s*\}\s*\/\/ …AND THE ATTACKER'S OWN[\s\S]{0,300}applyDeclaredAfterStrikes\(actor, weapon, targetActor, \{ critical: critical \|\| null[,}]/.test(aw));

/* C. Felling a foe */
const of = await mod("combat/on-fell.mjs");
const hunger = of.declaredOnFell([fx({ onFell: { label: "Hunger Beyond Pain", weaponNames: ["Grave Bite", "Corpse Slam"], living: true, heal: { level: true, ability: "constitution", min: 1 }, oncePerRound: true } })])[0];
const fctx = { damageCase: "reached-zero", weaponName: "Grave Bite", targetLiving: true, used: {} };
equal("C1 fires on a living creature brought to 0 by a named attack", of.onFellFires(hunger, fctx), true);
equal("C2 not on an undead, not with another weapon, not on a blow that left it standing, not twice a round", [
  of.onFellFires(hunger, { ...fctx, targetLiving: false }), of.onFellFires(hunger, { ...fctx, weaponName: "Claws" }),
  of.onFellFires(hunger, { ...fctx, damageCase: "reduced" }), of.onFellFires(hunger, { ...fctx, damageCase: "death-guard" }),
  of.onFellFires(hunger, { ...fctx, used: { "fell:Hunger Beyond Pain": true } })], [false, false, false, false, false]);
equal("C3 heals level + Con modifier, minimum 1", [of.onFellHealing(hunger, { level: 12, abilities: { constitution: { total: 3 } } }), of.onFellHealing(hunger, { level: 0, abilities: { constitution: { total: -2 } } })], [15, 1]);
const kt = await mod("kind-targeting.mjs");
equal("C4 an Unliving character is not living; an undead is not; a plain one is", [
  kt.isLivingCreature({ details: { traits: "Unliving" } }), kt.isLivingCreature({ details: { traits: "", creatureType: "Undead" } }), kt.isLivingCreature({ details: { traits: "Humanoid" } })], [false, false, true]);

/* D. Damage-type options and the riders that read the type */
const so = await mod("combat/strike-type-options.mjs");
const essence = so.declaredStrikeTypeOptions([fx({ strikeTypeOption: { type: "essence", label: "Essence Attacks", scope: ["natural", "unarmed"], magical: true } })]);
equal("D1 a natural Versatile claw offers its own type, Versatile, then the option", so.strikeTypeChoices({ damageType: "slashing", natural: true }, essence, "piercing").map((c) => [c.type, c.source]), [["slashing", "normal"], ["piercing", "Versatile"], ["essence", "Essence Attacks"]]);
equal("D2 a sword is not reached by a natural-and-unarmed option", so.strikeTypeChoices({ damageType: "slashing", category: "Martial" }, essence, null).length, 1);
equal("D3 an essence strike through the option is magical; the weapon's own type is not made so", [
  so.strikeTypeIsMagical({ damageType: "slashing", natural: true }, essence, "essence"), so.strikeTypeIsMagical({ damageType: "slashing", natural: true }, essence, "slashing"),
  so.strikeTypeIsMagical({ damageType: "essence", natural: true }, essence, "essence")], [true, false, false]);
ok("D4 the attack path asks once, before the roll, and the damage path counts the option as a magical source", /const damageTypeChoices = strikeTypeChoices\(weaponData, strikeTypeOptions, versatileAlternate\);\s*if \(damageTypeChoices\.length > 1\) \{/.test(aw) && /\|\| strikeTypeIsMagical\(weaponData, declaredStrikeTypeOptions\(/.test(aw));
ok("D5 the standalone damage roll offers the same choices", /const showVersatile = standaloneTypeChoices\.length > 1;/.test(aw) && /\? damageTypeRadios\(standaloneTypeChoices\)/.test(aw));
const sr = await mod("magic/strike-riders.mjs");
const cold = sr.normaliseStrikeRider({ label: "Grave-Cold Touch", dice: "1d6", damageType: "cold", scope: "unarmed", whenDamageType: "essence", once: false });
equal("D6 a rider gated on its strike's type joins an essence strike only", [sr.riderPacketsFor([cold], { natural: true, name: "Claws" }, { damageType: "essence" })[0]?.applies, sr.riderPacketsFor([cold], { natural: true, name: "Claws" }, { damageType: "slashing" })[0]?.applies], [true, false]);
ok("D7 the strike's type reaches the riders", /damageType: String\(effectiveDamageType \?\? ""\)\.trim\(\)\.toLowerCase\(\),\s*targetHp:/.test(aw));

/* E. Rider conditions ask the gates; riders from feats and weapons */
const spoil = sr.normaliseStrikeRider({ label: "Venom", dice: "1d4", damageType: "poison", condition: "weakened", weaponNames: ["Fangs"], onCritical: true, once: false });
equal("E1 a rider's condition needs its weapon and its gate, as its damage does", [
  sr.riderConditionReaches(spoil, { name: "Fangs" }, { critical: true }), sr.riderConditionReaches(spoil, { name: "Sword" }, { critical: true }), sr.riderConditionReaches(spoil, { name: "Fangs" }, { critical: false })], [true, false, false]);
const srw = read("module", "magic", "strike-riders-workflow.mjs");
ok("E2 the condition half asks riderConditionReaches with the strike's context", /if \(!riderConditionReaches\(spec, identity, reachCtx\)\) continue;/.test(srw) && /applyRiderConditions\(actor, weapon, targetActor, riderCtx\)/.test(aw));
ok("E3 riders are read from the applied effects (a feat's transferred one) and a weapon declares its own", /for \(const effect of actor\?\.appliedEffects \?\? actor\?\.effects \?\? \[\]\) \{/.test(srw) && /const rows = weapon\?\.flags\?\.\[SYSTEM_ID\]\?\.strikeRiders;/.test(srw) && /\.\.\.weaponDeclaredRiders\(weapon\)/.test(srw));

/* F. Save conversion */
const sc = await mod("magic/save-convert.mjs");
const iron = sc.declaredSaveConverts([fx({ saveConvert: { label: "Iron Will of the Tomb", saves: ["will"], traits: ["fear", "mental"], cost: { condition: "slowed", value: 1 }, oncePerRound: true } })])[0];
const sctx = { save: "will", degree: "failure", traits: ["fear"], conditions: [], used: {} };
equal("F1 a failed Will save against fear is offered; a Partial is not; a Fortitude save is not", [sc.saveConvertVerdict(iron, sctx), sc.saveConvertVerdict(iron, { ...sctx, degree: "partial" }), sc.saveConvertVerdict(iron, { ...sctx, save: "fortitude" })], ["offer", null, null]);
equal("F2 unknown traits ask the table; a save naming other traits is not offered", [sc.saveConvertVerdict(iron, { ...sctx, traits: [] }), sc.saveConvertVerdict(iron, { ...sctx, traits: "fire" })], ["ask", null]);
equal("F3 not while unconscious or stunned, nor twice a round", [sc.saveConvertVerdict(iron, { ...sctx, conditions: ["unconscious"] }), sc.saveConvertVerdict(iron, { ...sctx, conditions: ["stunned"] }), sc.saveConvertVerdict(iron, { ...sctx, used: { "convert:Iron Will of the Tomb": true } })], [null, null, null]);
const conv = sc.convertedOutcome({ total: 12, degree: { key: "fumble", label: "Fumble" } });
equal("F4 the outcome becomes a Success and remembers what it was", [conv.degree.key, conv.shiftedFrom], ["success", "fumble"]);
const chk = read("module", "dice", "check.mjs");
ok("F5 the save path asks it after every reroll offer", chk.indexOf("const converted = await offerSaveConvert(check);") > chk.indexOf("const fromItem = await offerSaveRerollItems(check);"));

/* G. Always-defensive casting */
const dc = await mod("magic/defensive-casting.mjs");
const faultless = dc.declaredDefensiveCasting([fx({ defensiveCasting: { label: "Faultless Casting", always: true, dcAdd: 0 } })]);
equal("G1 the declaration is read", faultless, { label: "Faultless Casting", always: true, dcAdd: 0 });
const cdc = await mod("magic/casting-dc.mjs");
const plain = { isCantrip: false, totalPP: 4, casterLevel: 12 };
const def = cdc.assembledCastingDC({ ...plain, defensive: false, declaredDefensive: faultless });
equal("G2 a Faultless cast costs nothing more, and the card names it", [def.dc - cdc.assembledCastingDC(plain).dc, def.parts.map((p) => p.label)], [0, ["Faultless Casting, defensive"]]);
equal("G3 the core's own Defensive Casting is still +5", cdc.assembledCastingDC({ ...plain, defensive: true }).dc - cdc.assembledCastingDC(plain).dc, 5);
const cw = read("module", "magic", "cast-workflow.mjs");
ok("G4 the cast is defensive whenever declared, and the core's +5 is then not added as well", /const defensive = Boolean\(conditions\.defensive\) \|\| Boolean\(declaredDefensive\);/.test(cw) && /defensive: defensive && !declaredDefensive,\s*declaredDefensive,/.test(cw));

/* H. Natural Leaper */
const jp = await mod("jumping.mjs");
const high = jp.naturalLeaperJump(jp.jumpDC({ actionKey: "highJump", feet: 15, strode: false }), { landSpeed: 30 });
const long = jp.naturalLeaperJump(jp.jumpDC({ actionKey: "longJump", feet: 30, strode: false }), { landSpeed: 30 });
const far = jp.naturalLeaperJump(jp.jumpDC({ actionKey: "highJump", feet: 20, strode: false }), { landSpeed: 30 });
equal("H1 within half Speed a High Jump needs no check but is still the action", [high.automatic, high.freeAction], [true, false]);
equal("H2 within Speed a Long Jump needs no check and no action", [long.automatic, long.freeAction], [true, true]);
equal("H3 beyond reach it rolls, never doubled for the run-up", [far.automatic, far.dc, far.doubled], [false, 80, false]);
equal("H4 a leaper is a declared flag or an owned Natural Leaper", [jp.isNaturalLeaper([], [fx({ naturalLeaper: true })]), jp.isNaturalLeaper([{ name: "Natural Leaper" }], []), jp.isNaturalLeaper([{ name: "Leap" }], [])], [true, true, false]);
const act = read("module", "combat", "action-workflow.mjs");
ok("H5 the jump resolves a leaper's automatic jump before any roll, spending the AP only for a High Jump", /if \(jumpSetup\.automatic\) \{\s*if \(!jumpSetup\.freeAction\) \{\s*const leapCost = leapApCost\(action\.apCost\);\s*if \(!\(await ensureActionPoints\(actor, leapCost, action\.name, \{ traits: action\.traits \}\)\)\) return null;/.test(act) && /landSpeed: speedValue\(actor\.system\?\.combat\?\.movement\?\.land\)/.test(act));

/* I. Granted uses, spell DC bonus, breathing */
const gw = read("module", "grants-workflow.mjs");
ok("I1 a granting item's declared uses are written onto the granted spell", /const uses = grantedSpellUsesFor\(sourceItem, data\.name\);\s*if \(uses !== null\) data\.system\.usesPerDay = uses;/.test(gw));
const rf = await mod("combat/refocus.mjs");
equal("I2 an at-will grant takes no Focus; a plain innate grant does", [rf.grantedInnateTakesFocus({ usesPerDay: "unlimited", traits: "Cantrip" }), rf.grantedInnateTakesFocus({ usesPerDay: "", traits: "Cantrip" })], [false, true]);
const sd = await mod("magic/spell-dc-bonus.mjs");
const dominion = [fx({ spellDCBonus: { label: "Soul-Magic Dominion", value: 1, type: "racial", traits: ["soul"] } }), fx({ spellDCBonus: { label: "Other racial", value: 2, type: "racial", traits: ["soul"] } })];
equal("I3 a soul spell gets the bonus, typed bonuses do not stack; another spell gets none", [sd.declaredSpellDCBonuses(dominion, "Essence, Soul").map((b) => [b.label, b.value]), sd.declaredSpellDCBonuses(dominion, "Fire")], [[["Other racial", 2]], []]);
equal("I4 the save DC carries a declared bonus as a named part", cdc.assembledSaveDC({ baseDC: 20, declaredBonuses: [{ label: "Soul-Magic Dominion", value: 1 }] }), { dc: 21, parts: [{ label: "Soul-Magic Dominion", value: 1 }], base: 20, fixed: false });
ok("I5 the cast passes them, never for an item's spell", /declaredBonuses: \[\.\.\.\(isItemCast \? \[\] : declaredSpellDCBonuses\(/.test(cw));
ok("I6 a creature that does not breathe holds no breath", /const breathless = doesNotBreatheSource\(actor\);\s*if \(breathless\) \{/.test(read("module", "drowning-workflow.mjs")));

/* J. Drink Blood */
const db = await mod("drink-blood.mjs");
equal("J1 paralysed, unconscious, immobilised: automatic; grabbed: a check; willing: automatic; else refused", [
  db.drinkBloodRequirement(["paralyzed"]), db.drinkBloodRequirement(["grabbed"]), db.drinkBloodRequirement([], { willing: true }), db.drinkBloodRequirement(["prone"])
].map((r) => [r.ok, r.needsCheck]), [[true, false], [true, true], [true, false], [false, false]]);
const renewal = [fx({ drinkBloodBonus: { label: "Blood Renewal", value: 5, atLevel: { 12: 10 } } })];
equal("J2 Soul Drain 10, +5 with Blood Renewal, +10 from 12th level", [db.drinkBloodAmount([], 6).amount, db.drinkBloodAmount(renewal, 6).amount, db.drinkBloodAmount(renewal, 12).amount], [10, 15, 20]);
const dbw = read("module", "drink-blood-workflow.mjs");
ok("J3 the drinker heals only what landed — the relayed tag's own value where it says one — and the ability is a named automation", /const landed = applied\.some\(\(a\) => a\.immune\) \? 0 : Math\.max\(0, after - before\);/.test(dbw) && /const applied = await relayConditionTags\(target, tags, \{\}, \(\) => applyConditionTags\(target, tags, \{\}\)\);/.test(dbw) && /"drink blood": \{/.test(read("module", "feats-workflow.mjs")));

/* K. A disease's stage damage, and its type */
const afw = read("module", "combat", "affliction-workflow.mjs");
ok("K1 a stage may name its damage type; poison when it does not", /const t = String\(entry\?\.damageType \?\? ""\)\.trim\(\)\.toLowerCase\(\);\s*return t \|\| "poison";/.test(afw) && /const type = stageDamageType\(entry\);/.test(afw));
ok("K2 a disease's stage damage is dealt before its save, as a poison's is", /if \(!poison && withDamage && item\.system\.stages\?\.\[currentStage - 1\]\?\.damage\) await dealStageDamage\(actor, item\);/.test(afw));

const EXPECTED = 73;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-unliving-mechanisms: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-unliving-mechanisms: ${checks} checks — all green.`);
