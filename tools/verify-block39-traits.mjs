#!/usr/bin/env node
/**
 * verify-block39-traits — block 39's traits (Appendix 3, pages 406–409),
 * 3.622.0.
 *
 * Graham's rulings of 5 October 2026 (R8–R13, "your recommendation") on
 * claude/audit-pages-401-409.md, and the audit's A11–A20.
 *
 *   A  the per-turn limits: combat only (A11/R13), Word's −4 (A12), Press
 *      and Open by the MAP counter (A13), Word's opening (R11), Stance by
 *      combat (A15)
 *   B  Conviction's advantage (A14), Explore (A16), Emotion and Fear (A18)
 *   C  Light (A17/R9)
 *   D  Rare and Uncommon (A19/R10)
 *   E  Splash (A20)
 *   F  the elemental environments (R8, R11)
 *   G  Teleportation, Rod, Staff, Invested, Rage, Composition, Polymorph and
 *      Morph, Chance, Secret (R11, R12)
 *   H  the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const T = await import("../module/traits.mjs");
const TW = await import("../module/traits-workflow.mjs");
const TR = await import("../module/trait-rules.mjs");
const L = await import("../module/light.mjs");
const LS = await import("../module/magic/light-shift.mjs");
const AF = await import("../module/afflictions.mjs");
const UW = await import("../module/combat/underwater.mjs");
const { SKILL_ACTIONS } = await import("../module/data/skill-actions.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const TWS = strip(read("module", "traits-workflow.mjs"));
const FEATS = strip(read("module", "feats-workflow.mjs"));
const APW = strip(read("module", "combat", "action-points-workflow.mjs"));
const ACTION = strip(read("module", "combat", "action-workflow.mjs"));
const BOMB = strip(read("module", "alchemical-workflow.mjs"));
const SPIRIT = strip(read("module", "magic", "spiritual-weapon-workflow.mjs"));
const CHECK = strip(read("module", "dice", "check.mjs"));
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const EFFECTS = strip(read("module", "magic", "spell-effects.mjs"));
const LWF = strip(read("module", "light-workflow.mjs"));
const LSWF = strip(read("module", "magic", "light-shift-workflow.mjs"));
const LEARN = strip(read("module", "magic", "learn-spell-workflow.mjs"));
const AFWF = strip(read("module", "combat", "affliction-workflow.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const CHARGED = strip(read("module", "charged-items-workflow.mjs"));
const MAGIC = strip(read("module", "magic-items-workflow.mjs"));
const TRW = strip(read("module", "trait-rules-workflow.mjs"));
const ENVWF = strip(read("module", "environment-workflow.mjs"));
const MAIN = strip(read("scripts", "trg-prime.mjs"));
const ITEM_HBS = read("templates", "item", "item-sheet.hbs");

const blocked = (traits, usage, opts) => T.traitRestriction({ traits }, usage, opts).blocked;

/* A — per-turn limits */
{
  ok("A1 A11/R13 — out of combat the per-turn limits do not apply",
    ["Flourish", "Defence", "Teleportation", "Word", "Open"].every((t) => !blocked(t, { flourish: 1, defence: 1, teleportation: 1, word: 1, actions: 3, attack: 2, open: 1 }, { inEncounter: false }))
    && !blocked("Press", {}, { inEncounter: false }));
  ok("A2 A11/R13 — in combat they do",
    blocked("Flourish", { flourish: 1 }, { inEncounter: true }) && blocked("Defence", { defence: 1 }, { inEncounter: true })
    && blocked("Teleportation", { teleportation: 1 }, { inEncounter: true }) && blocked("Press", {}, { inEncounter: true }));
  ok("A3 Explore and Downtime keep their encounter test",
    blocked("Explore", {}, { inEncounter: true }) && !blocked("Explore", {}, { inEncounter: false })
    && blocked("Downtime", {}, { inEncounter: true }));
  ok("A4 Conviction's once a round still holds out of combat",
    blocked("Conviction", {}, { inEncounter: false, convictionSpentThisRound: true }));
  ok("A5 A13 — Press and Open read the multiple attack penalty's counter",
    !blocked("Press", { attack: 0 }, { inEncounter: true, attacksThisTurn: 1 })
    && blocked("Open", { attack: 0 }, { inEncounter: true, attacksThisTurn: 1 })
    && !blocked("Open", { attack: 0 }, { inEncounter: true, attacksThisTurn: 0 }));
  ok("A6 R11 — a Word spell is refused once any AP has been spent this turn",
    blocked("Word", { actions: 0 }, { inEncounter: true, actedThisTurn: true })
    && !blocked("Word", { actions: 0 }, { inEncounter: true, actedThisTurn: false }));
  ok("A7 the workflow hands them in: the counter on your own turn, AP spent this turn",
    /attacksThisTurn: ownTurn \? Number\(actor\?\.getFlag\?\.\(SYSTEM_ID, "attackCount"\) \?\? 0\) : 0,/.test(TWS)
    && /actedThisTurn: Boolean\(ownTurn && apStamp && apStamp\.combatId === combat\.id/.test(TWS)
    && /round: game\.combat\.round, turn: game\.combat\.turn \}/.test(APW));
  ok("A8 A11 — the record is written only in combat",
    /export async function recordTraitUsage\(actor, action\) \{\s*if \(!game\.combat\?\.started\) return;/.test(TWS));
  ok("A9 A12 — Word's −4 only on your own turn",
    /export function wordAftermathModifier\(actor\) \{\s*if \(!isOwnTurn\(actor\)\) return null;/.test(TWS));
  ok("A10 A12 — and on every attack check: attack actions, bombs, Spiritual Weapon",
    /&& wordAftermathModifier\(actor\)\s*\? \[wordAftermathModifier\(actor\)\] : \[\]\),/.test(ACTION)
    && /const wordPenalty = wordAftermathModifier\(actor\);\s*if \(wordPenalty\) modifiers\.push\(wordPenalty\);/.test(BOMB)
    && /\.\.\.\(wordPenalty \? \[wordPenalty\] : \[\]\),/.test(SPIRIT));
  const combat = { id: "c2", round: 2 };
  const actor = (stamp) => ({ getFlag: () => stamp });
  ok("A11 A15 — a stance is remembered by combat",
    TW.lastStanceRoundIn(actor({ combatId: "c2", round: 4 }), combat) === 4
    && TW.lastStanceRoundIn(actor({ combatId: "c1", round: 4 }), combat) === null
    && TW.lastStanceRoundIn(actor(4), combat) === null
    && TW.stanceStamp(combat).combatId === "c2");
  ok("A12 A15 — both stance writers stamp the combat",
    /await actor\.setFlag\(SYSTEM_ID, STANCE_ROUND_FLAG, stanceStamp\(\)\);/.test(TWS)
    && /const lastStance = lastStanceRoundIn\(actor\);/.test(FEATS)
    && /await actor\.setFlag\(SYSTEM_ID, "lastStanceRound", stanceStamp\(\)\);/.test(FEATS));
  ok("A13 bombs and Spiritual Weapon also meet the target's conditions",
    /attackTermsAgainst\(targetActor, actor, \{ distanceFeet: distance \}\)/.test(BOMB)
    && /attackTermsAgainst\(targetActor, caster, \{ distanceFeet: await distanceBetweenActors\(caster, targetActor\) \}\)/.test(SPIRIT));
}

/* B — Conviction, Explore, Emotion and Fear */
{
  ok("B1 A14 — Conviction's advantage cancels against a disadvantage",
    /const \{ resolveBias \} = await import\("\.\.\/conditionals\.mjs"\);\s*check\.bias = resolveBias\(check\.bias, \["advantage"\], BIAS\);\s*check\.modifiers\.push\(\{\s*label: advantageKept/.test(CHECK)
    && !/check\.bias = BIAS\.ADVANTAGE;/.test(CHECK));
  const survey = SKILL_ACTIONS.find((a) => a.key === "surveyWildlife");
  const tracks = SKILL_ACTIONS.find((a) => a.key === "assessTracks");
  ok("B2 A16 — Survey Wildlife and Assess Tracks are Explore actions",
    T.hasTrait(survey, "explore") && T.hasTrait(tracks, "explore")
    && T.traitRestriction(survey, {}, { inEncounter: true }).blocked);
  ok("B3 A18 — Fear brings Emotion and Mental; Emotion brings Mental",
    T.hasTrait("Fear", "mental") && T.hasTrait("Fear", "emotion") && T.hasTrait("Emotion", "mental")
    && !T.hasTrait("Mental", "emotion"));
  ok("B4 A18 — so a Mindless creature is immune to an Emotion effect",
    T.immuneToEffect({ traits: "Emotion, Enchantment" }, { details: { traits: "Mindless" } })?.trait === "mental"
    && T.immuneToEffect({ traits: "Fear" }, { details: { traits: "Mindless" } })?.trait === "mental"
    && T.immuneToEffect({ traits: "Enchantment" }, { details: { traits: "Mindless" } }) === null);
}

/* C — Light */
{
  const fairy = TR.lightTraitDefaultRow({ traits: "Invocation, Light", duration: "10 minutes", area: "10-foot radius", effects: [] }, "Fairy Fire");
  const aegis = TR.lightTraitDefaultRow({ traits: "Light, Warding", duration: "Sustained (1 minute)", area: "10-foot emanation", effects: [{ kind: "bonus" }] }, "Radiant Aegis");
  ok("C1 A17/R9 — a lasting Light spell stating no light gets +1 step, max 8",
    fairy?.kind === "lightShift" && fairy.steps === 1 && fairy.cap === 8 && fairy.target === "targets"
    && aegis?.target === "self" && aegis.radiusFeet === 10);
  ok("C2 R9 — not when it states its own, not when it is instant, not without the trait",
    TR.lightTraitDefaultRow({ traits: "Light", duration: "1 hour", effects: [{ kind: "light" }] }) === null
    && TR.lightTraitDefaultRow({ traits: "Light", duration: "", effects: [] }) === null
    && TR.lightTraitDefaultRow({ traits: "Light", duration: "instantaneous", effects: [] }) === null
    && TR.lightTraitDefaultRow({ traits: "Invocation", duration: "1 minute", effects: [] }) === null);
  ok("C3 A17 — a raise stops at its cap, and a brighter level is left alone",
    L.shiftLightLevel(6, 1, 1, 8) === 7 && L.shiftLightLevel(8, 1, 1, 8) === 8 && L.shiftLightLevel(9, 1, 1, 8) === 9
    && L.shiftLightLevel(9, 2) === 10 && L.shiftLightLevel(6, -3, 2) === 3);
  ok("C4 the cap travels: the row, the region flag, the light reading",
    LS.normaliseLightShift({ kind: "lightShift", steps: 1, radiusFeet: 5, cap: 8 })?.cap === 8
    && LS.normaliseLightShift({ kind: "lightShift", steps: 2, radiusFeet: 5 })?.cap === 10
    && /lightShift: \{ steps: spec\.steps, floor: spec\.floor, cap: spec\.cap \?\? 10 \},/.test(LSWF)
    && /level = shiftLightLevel\(level, shift\.steps, shift\.floor, shift\.cap\);/.test(LWF));
  ok("C5 the cast's own call draws it, and a spell with no row of its own still reaches it",
    /const lightDefault = lightTraitDefault \? lightTraitDefaultRow\(spell\.system \?\? \{\}, spell\.name\) : null;/.test(EFFECTS)
    && /lightTraitDefault: true,/.test(CAST)
    && /\(effEffects\.length \|\| lightTraitDefaultRow\(spellData, spell\.name\)\)/.test(CAST));
}

/* D — Rare and Uncommon */
{
  ok("D1 A19/R10 — Recall Knowledge and identify on a Rare creature +5, Uncommon +2",
    TR.rarityRaiseForAction("recallKnowledge", ["humanoid", "rare"]) === 5
    && TR.rarityRaiseForAction("identifyPower", ["uncommon"]) === 2
    && TR.rarityRaiseForAction("stride", ["rare"]) === 0
    && TR.rarityRaiseForAction("recallKnowledge", ["beast"]) === 0);
  ok("D2 A19/R10 — an affliction's DC: the GM's own modifier, or the page's",
    AF.afflictionSaveDC(5, { rarity: "rare" }) === AF.afflictionSaveDC(5, 0) + 5
    && AF.afflictionSaveDC(5, { rarity: "uncommon" }) === AF.afflictionSaveDC(5, 0) + 2
    && AF.afflictionSaveDC(5, { rarity: "rare", rarityModifier: 3 }) === AF.afflictionSaveDC(5, 0) + 3
    && AF.afflictionSaveDC(5, 4) === AF.afflictionSaveDC(5, 0) + 4
    && /dc: afflictionSaveDC\(item\.system\.level, item\.system\),/.test(AFWF)
    && /Rare \+5, Uncommon \+2/.test(ITEM_HBS));
  ok("D3 R10 — learning a Rare or Uncommon spell, and the action's DC",
    /const rarityRaise = rarityDCIncrease\(document\.system \?\? \{\}\);/.test(LEARN)
    && /cost: \{ \.\.\.cost, dc: cost\.dc \+ rarityRaise \},/.test(LEARN)
    && /\? rarityRaiseForAction\(action\.key, creatureTraits\(targetActor\.system \?\? \{\}\)\)/.test(ACTION)
    && /finalDC \+= rarityRaise;/.test(ACTION));
}

/* E — Splash */
{
  ok("E1 A20 — a critical multiplies the splash by its severity",
    TR.splashOnHit(2, null) === 2 && TR.splashOnHit(2, "minor") === 2 && TR.splashOnHit(2, "serious") === 4
    && TR.splashOnHit(2, "deadly") === 6);
  ok("E2 A20 — a miss scatters half the throw, in a d8 direction",
    TR.scatter(40, 1).feet === 20 && TR.scatter(40, 1).direction === "north" && TR.scatter(45, 8).direction === "north-west"
    && TR.scatter(45, 8).feet === 20);
  ok("E3 the bomb and the spell both apply it",
    /const splashOnTarget = splashOnHit\(splashAmount\(splash\), critical\?\.severity \?\? null\);/.test(BOMB)
    && /const landed = scatter\(distance, d8\.total\);/.test(BOMB)
    && /const splashDealt = splashOnHit\(splashTotal\(splashSpec, Number\(clMods\?\.steps \?\? 0\)\), outcome\.critical\?\.severity \?\? null\);/.test(CAST));
}

/* F — elemental environments */
{
  ok("F1 R11 — Fire, Air and Water cannot be cast underwater",
    ["Fire", "Air", "Water"].every((t) => TR.elementalCastingRefusal(t, { underwater: true }) !== "")
    && TR.elementalCastingRefusal("Fire", { underwater: false }) === ""
    && TR.elementalCastingRefusal("Earth", { underwater: true }) === "");
  ok("F2 R11 — Earth not in mid-air; Sonic not in a vacuum",
    TR.elementalCastingRefusal("Earth", { airborne: true }) !== "" && TR.elementalCastingRefusal("Sonic", { vacuum: true }) !== ""
    && TR.elementalCastingRefusal("Sonic", { underwater: true }) === "");
  ok("F3 R11 — Cold crystalises to piercing underwater",
    TR.underwaterDamageType("cold", true) === "piercing" && TR.underwaterDamageType("cold", false) === "cold"
    && TR.underwaterDamageType("fire", true) === "fire");
  const shock = UW.underwaterElectricity({ underwater: true, traits: "Electricity, Invocation" });
  ok("F4 R8 — Electricity underwater: a 10-ft sphere, the caster in it, and taking double",
    shock.applies && shock.radiusFeet === 10 && shock.includesCaster && shock.creatorTakesDouble
    && !UW.underwaterElectricity({ underwater: false, traits: "Electricity" }).applies);
  ok("F5 the cast is refused before anything is spent, and the vacuum is on the Weather section",
    /if \(!\(await elementalCastGate\(actor, spellData, spell\.name\)\)\) return null;/.test(CAST)
    && /const damageType = underwaterDamageType\(dmg\.type \|\| "force", await actorUnderwater\(actor\)\);/.test(CAST)
    && /name="flags\.\$\{SYSTEM_ID\}\.weather\.vacuum"/.test(ENVWF));
}

/* G — the rest of section C */
{
  const combat = { id: "c1", round: 3, turn: 1 };
  ok("G1 R11 — Teleportation: a check the first time, a failure the second in a turn",
    TR.teleportArrival(null, combat).check && !TR.teleportArrival(null, combat).fails
    && TR.teleportArrival({ combatId: "c1", round: 3, turn: 1 }, combat).fails
    && TR.teleportArrival({ combatId: "c1", round: 3, turn: 0 }, combat).check
    && !TR.teleportArrival(null, null).check);
  ok("G2 the cast reaches it, and the button rolls Spatial Awareness",
    /for \(const said of await teleportationArrives\(actor, spell, moved\)\) lines\.push\(line\(said\)\);/.test(CAST)
    && /SKILL_ACTIONS\.find\(\(a\) => a\.key === "spatialAwareness"\)/.test(TRW) && /registerTraitRuleHooks\(\);/.test(MAIN));
  ok("G3 R11 — Rod: once a round, and not with an item's spell",
    TR.rodRefusal({ combatId: "c1", round: 3 }, combat) !== "" && TR.rodRefusal({ combatId: "c1", round: 2 }, combat) === ""
    && TR.rodRefusal(null, combat, { fromItemCast: true }) !== "" && TR.rodRefusal(null, null) === "");
  ok("G4 the three rod paths ask and stamp",
    /const refused = rodUseRefusal\(actor\);/.test(CHARGED) && /await stampRodUse\(actor, item\);/.test(CHARGED)
    && /!rodUseRefusal\(actor, \{ fromItemCast: isItemCast \}\)/.test(CAST)
    && /rodUsedThisRound\(check\.actor\) \? null : advantageRodFor/.test(CHECK));
  const staff = (id, invested) => ({ id, name: `Staff ${id}`, system: { traits: "Invested Magical Staff", invested } });
  ok("G5 R11 — Staff: one invested at a time",
    TR.staffInvestRefusal(staff("b", false), [staff("a", true), staff("b", false)]) !== ""
    && TR.staffInvestRefusal(staff("b", false), [staff("a", false), staff("b", false)]) === ""
    && /const refused = staffInvestRefusal\(item, Array\.from\(actor\.items \?\? \[\]\)\);/.test(MAGIC));
  ok("G6 R12 — an un-invested Invested item is refused",
    TR.investedRefusal({ system: { traits: "Invested Warding", invested: false } }) !== ""
    && TR.investedRefusal({ system: { traits: "Invested Warding", invested: true } }) === ""
    && TR.investedRefusal({ system: { traits: "Magical" } }) === ""
    && /if \(notInvested\) \{[\s\S]{0,140}return null;/.test(MAGIC));
  ok("G7 R11 — Rage actions need a rage; Invoke Rage is exempt",
    TR.rageTraitRefusal({ traits: "Rage" }, false) !== "" && TR.rageTraitRefusal({ traits: "Rage" }, true) === ""
    && TR.rageTraitRefusal({ traits: "Rage" }, false, { key: "invokeRage" }) === ""
    && /const rage = rageTraitRefusal\(action, raging, \{ key: action\?\.key \?\? "" \}\);/.test(TWS));
  ok("G8 R11 — Composition: one at a time",
    TR.compositionsToEnd([{ id: "a", name: "Inspire Courage" }, { id: "b", name: "Shield" }], (n) => n === "Inspire Courage").join() === "a"
    && /const ended = await endPreviousComposition\(actor, spell\);/.test(CAST));
  const conflicts = TR.shapeChangeConflicts("Alteration, Polymorph", [
    { castId: "p", traits: "Polymorph" }, { castId: "m", traits: "Morph" }, { castId: "x", traits: "Warding" }]);
  ok("G9 R11 — a polymorph counters a polymorph and ends a morph",
    conflicts.counter.join() === "p" && conflicts.end.join() === "m"
    && TR.shapeChangeConflicts("Morph", [{ castId: "p", traits: "Polymorph" }]).counter.length === 0
    && /const shaped = await shapeChangeArrives\(actor, spell, target, \{/.test(CAST)
    && /if \(total \+ mod < dc\) \{/.test(TRW));
  ok("G10 R11 — a morph's grown strike is magical",
    TR.morphStrikeIsMagical("Alteration, Morph") && !TR.morphStrikeIsMagical("Polymorph")
    && /data\.flags\["trg-prime"\]\.magicalStrike = true;/.test(EFFECTS)
    && /\|\| weapon\?\.flags\?\.\[SYSTEM_ID\]\?\.magicalStrike === true\s*(\n\s*\/\/[^\n]*)*\n\s*\|\| Boolean\(magicalAttackSource/.test(ATTACK));
  ok("G11 R11 — Chance: one chance effect a roll",
    /check\.chanceUsed = "Fateful Temptation";/.test(CHECK) && /&& \(check\.saveSource \|\| check\.sourceUuid\) && !check\.chanceUsed\)/.test(CHECK)
    && /&& check\.outcome\?\.degree\?\.key && !check\.chanceUsed\)/.test(CHECK) && /if \(this\.chanceUsed\) return;/.test(CHECK));
  ok("G12 R11 — a Secret spell's casting check is rolled blind",
    /\.\.\.\(secretRollMode\(spellData\) \? \{ rollMode: secretRollMode\(spellData\) \} : \{\}\)/.test(CAST)
    && T.secretRollMode({ traits: "Curse, Secret" }) === "blind");
  ok("G13 item traits are read space- or comma-separated",
    TR.itemHasTrait({ system: { traits: "Invested Magical Rod" } }, "rod") && TR.itemHasTrait({ system: { traits: "Rod, Magical" } }, "rod")
    && !TR.itemHasTrait({ system: { traits: "Rodent" } }, "rod"));
}

/* H — the version */
{
  const sys = JSON.parse(read("system.json"));
  ok("H1 the version is 3.622.0 or later", String(sys.version).localeCompare("3.622.0", undefined, { numeric: true }) >= 0);
}

if (failures.length) {
  console.log(`verify-block39-traits: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block39-traits: OK — ${checks} checks. The per-turn limits in combat only, Word, Press and Open, stances by combat; Light's step; rarity's DCs; splash; the elemental environments; Teleportation, Rod, Staff, Invested, Rage, Composition, Polymorph, Chance and Secret.`);
