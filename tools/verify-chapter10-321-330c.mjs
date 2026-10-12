#!/usr/bin/env node
/**
 * verify-chapter10-321-330c — block 32, R3 to R8, and the 3.606.0 findings.
 *
 * NEW at 3.608.0, beside verify-chapter10-321-330 and -330b.
 *
 *   R  the damage riders: metal, the arc, the armour bypass, bleed as
 *      Bleeding and the vibration through an immunity
 *   S  Size Alteration's bounded step
 *   G  Spectral Grasp's four maneuvers
 *   D  Spell Drain, waiting on the drained caster
 *   T  Spell Turning, read by the casting
 *   Z  Solid Fog's zone, both halves
 *   W  Stoneskin's wearing clock
 *   X  Spiritual Weapon and Smash
 *   F  the 3.606.0 live-test findings
 *   P  the pack, the plan and the manifest
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ARMOUR_STEPS, armourBypassCategories, critSplashAmount, critSplashCatches, isMetalTarget, itemsSeenByCritical,
  metalAttackRow, metalRecurring, normaliseConditionDamage, normaliseCritSplash, normaliseImmuneAlternate,
  normaliseMetalAffinity, wearsMetalArmour
} from "../module/magic/attack-riders.mjs";
import { boundedSizeSteps } from "../module/magic/size-step.mjs";
import { maneuverChoices, maneuverOutcomeText, maneuverPushFeet } from "../module/magic/spell-maneuver.mjs";
import { drainedDegree, drainedPP, normaliseSpellDrain } from "../module/magic/spell-drain.mjs";
import { castCanBeTurned, normaliseSpellTurning, turningModifierRow } from "../module/magic/spell-turning.mjs";
import { obscuredFromInside, zoneEffectParts, zoneIsPlaced } from "../module/magic/obscuring-zone.mjs";
import { hitWears, normaliseWearingClock, wornClocks } from "../module/magic/wearing-clock.mjs";
import {
  normaliseSpiritualWeapon, spiritualDamageFormula, spiritualRecord, spiritualSourceWeapons
} from "../module/magic/spiritual-weapon.mjs";
import { normaliseVersusDamage, versusDamageBonus, versusDamageReaching } from "../module/magic/versus-damage.mjs";
import { SELF_REPORTING_KINDS } from "../module/magic/cast-result-line.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { emanationIsLive, liveEmanationEffects } from "../module/magic/emanation.mjs";
import { aggregateWarpSelection, mergeWarpSelections } from "../module/magic/spell-warp.mjs";
import { DAMAGE_TYPES } from "../module/config.mjs";
import { PLAN, plannedFields } from "./block32c-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const src = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const cast = src("module", "magic", "cast-workflow.mjs");
const applier = src("module", "magic", "spell-effects.mjs");
const attackWf = src("module", "combat", "attack-workflow.mjs");

/* ================================================================== *
 * R. The damage riders
 * ================================================================== */

const plate = [{ type: "armour", system: { equipped: true, traits: "Metal, Rigid", category: "Heavy" } }];
const leather = [{ type: "armour", system: { equipped: true, traits: "", category: "Light" } }];
const unworn = [{ type: "armour", system: { equipped: false, traits: "Metal", category: "Heavy" } }];
ok("R1 metal armour worn is metal", wearsMetalArmour(plate) && isMetalTarget(plate));
ok("R1b leather is not, and nor is plate in a pack", !isMetalTarget(leather) && !isMetalTarget(unworn));
ok("R1c a creature made of metal is, armour or not", isMetalTarget([], true));

const metal = normaliseMetalAffinity(PLAN["Shocking Grasp"].damage.metal);
ok("R2 Shocking Grasp's metal affinity parses", Boolean(metal));
ok("R2b +1 circumstance against metal", deepEqual(metalAttackRow(metal, true, "Shocking Grasp"),
  { label: "Shocking Grasp vs metal", value: 1, type: "circumstance" }));
ok("R2c and nothing against anything else", metalAttackRow(metal, false, "x") === null);
ok("R3 the recurring rider lands on metal", metalRecurring(metal, { isMetal: true, amount: 1 }).amount === 1);
ok("R3b and not on anything else", metalRecurring(metal, { isMetal: false, amount: 1 }).applies === false);
ok("R3c a critical doubles it — warp included", metalRecurring(metal, { isMetal: true, critical: true, amount: 2 }).amount === 4);
ok("R3d a spell with no affinity is untouched", metalRecurring(null, { isMetal: false, amount: 3 }).amount === 3);
ok("R4 the attack pool carries the metal row", /spellAttackBonusRows\(actor\.system\?\.combat\?\.attack\?\.checkModifiers\)\.concat\(metalRow \? \[metalRow\] : \[\]\)/.test(cast));
ok("R4b a target that is not metal takes no recurring", /else if \(metalSpec\?\.recurringOnlyVsMetal && !targetIsMetal\) \{/.test(cast));
ok("R4c the rolled rider goes through metalRecurring", /const amount = metalRider\.amount;/.test(cast));

const arc = normaliseCritSplash(PLAN["Shock Bolt"].damage.critSplash);
ok("R5 Shock Bolt's arc parses", Boolean(arc) && arc.save === "reflex" && arc.basic === true);
ok("R5b half, rounded down", critSplashAmount(arc, 15) === 7);
ok("R5c adjacent and in metal: caught", critSplashCatches(arc, { feet: 5, wearsMetal: true }));
ok("R5d ten feet away: not adjacent", !critSplashCatches(arc, { feet: 10, wearsMetal: true }));
ok("R5e adjacent in leather: spared", !critSplashCatches(arc, { feet: 5, wearsMetal: false }));
ok("R5f the struck creature is not its own neighbour", !critSplashCatches(arc, { feet: 0, wearsMetal: true, isStruck: true }));
{
  const { critSplashLine } = await import("../module/magic/attack-riders.mjs");
  // FOUND LIVE ON 3.608.1: "…: nobody. 7 damage, basic Reflex."
  ok("R5g an arc with nobody to reach names no damage",
    !/damage/.test(critSplashLine("Shock Bolt", 7, [], arc)) && /no adjacent creature/.test(critSplashLine("Shock Bolt", 7, [], arc)));
}
ok("R6 the arc fires on an injury, not merely a critical",
  /if \(critSplash && outcome\.critical && spellInflictsCriticalInjury\(spellData\)\) \{/.test(cast));
ok("R6b the neighbours save through the save path", /const arc = await resolveSpellSave\(actor, \{/.test(cast));
ok("R6c against the cast's DC", /saveDC: Number\(splashSaveDC \?\? 0\) \|\| 0,/.test(cast)
  && /splashSaveDC: nominalSaveDC/.test(cast));
ok("R6d half of the bolt's own dice", /const amount = critSplashAmount\(critSplash, boltRolled\);/.test(cast));

ok("R7 light, then medium, then heavy", deepEqual(armourBypassCategories("light", 0), ["light"])
  && deepEqual(armourBypassCategories("light", 1), ["light", "medium"])
  && deepEqual(armourBypassCategories("light", 2), ARMOUR_STEPS));
ok("R7b and nowhere past heavy", deepEqual(armourBypassCategories("light", 5), ARMOUR_STEPS));
ok("R7c no bypass is no bypass", armourBypassCategories("", 2).length === 0);
ok("R7d the table does not see bypassed armour", itemsSeenByCritical([...plate, ...leather], ["light"]).length === 1);
ok("R8 the result carries the bypass", /const armourBypass = armourBypassCategories\(dmg\.critArmourBypass, warpMods\?\.armourStep\);/.test(cast));
ok("R8b the injury roll is handed it", /armourBypass: ray\.armourBypass \?\? \[\],/.test(cast));
ok("R8c and reads the struck location from what is left", /armourAtLocation\(seenItems, hitLocation\)/.test(attackWf));
{
  const once = aggregateWarpSelection(PLAN["Sonic Bolt"].warps, { "warp-1": 1 }).mods.armourStep;
  const twice = aggregateWarpSelection(PLAN["Sonic Bolt"].warps, { "warp-1": 2 }).mods.armourStep;
  ok("R8d the warp buys steps", once === 1 && twice === 2);
  ok("R8e and they survive a split purchase",
    mergeWarpSelections({ mods: { armourStep: 1 } }, { mods: { armourStep: 1 } }).mods.armourStep === 2);
}

const bleed = normaliseConditionDamage(PLAN["Sonic Rupture"].damage.asCondition);
const vib = normaliseImmuneAlternate(PLAN["Sonic Rupture"].damage.immuneAlternate);
ok("R9 bleed damage is Bleeding, its critical sonic", bleed?.condition === "bleeding" && bleed?.criticalType === "sonic");
ok("R9b the bleed-immune take 5d8 sonic through the immunity",
  vib?.immuneTo === "bleeding" && vib?.formula === "5d8" && vib?.type === "sonic" && vib?.ignoresImmunity === true);
ok("R9c a malformed alternate is refused", normaliseImmuneAlternate({ immuneTo: "x", formula: "lots", type: "sonic" }) === null);
ok("R10 the save scales the Bleeding value", /const value = Math\.floor\(baseDamage \* bs\.damageMultiplier\);/.test(cast)
  && /await applyConditionTags\(target, \[\{ key: asCondition\.condition, label, value \}\]\)/.test(cast));
ok("R10b the immune are sent to the vibration", /const spared = immuneAlternate && target\.isImmuneToCondition\?\.\(immuneAlternate\.immuneTo\);/.test(cast));
ok("R10c through their immunity to it", /ignoreImmunityTo: immuneAlternate\.ignoresImmunity \? immuneAlternate\.type : ""/.test(cast));
ok("R10d rolled once for the whole cone", /if \(alternateBase === null\) \{/.test(cast));
{
  globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: {} };
  const { resolveAgainstDefences } = await import("../module/combat/damage-workflow.mjs");
  const deaf = { combat: { immunities: "sonic, fire", armour: { dr: 0 } } };
  ok("R11 immune is immune", resolveAgainstDefences(deaf, { amount: 20, type: "sonic" }).taken === 0);
  ok("R11b until the damage names that immunity", resolveAgainstDefences(deaf, { amount: 20, type: "sonic", ignoreImmunityTo: "sonic" }).taken === 20);
  ok("R11c and only that one", resolveAgainstDefences(deaf, { amount: 20, type: "fire", ignoreImmunityTo: "sonic" }).taken === 0);
}

/* ================================================================== *
 * S. Size Alteration
 * ================================================================== */

const sa = PLAN["Size Alteration"].effects[0];
const step = (size, warp = {}) => boundedSizeSteps(size, sa, warp).steps;
ok("S1 a Medium creature grows a step", step("medium") === 1);
ok("S2 a Large one does not", step("large") === 0 && boundedSizeSteps("large", sa).why === "too large");
ok("S3 +6 PP: two steps", step("medium", { reach: 1 }) === 2);
ok("S3b or a Large creature by one", step("large", { reach: 1 }) === 1);
ok("S3c and a Huge one still not", step("huge", { reach: 1 }) === 0);
ok("S4 reduce instead", step("medium", { reverse: true }) === -1);
ok("S4b tiny minimum: a Small creature shrinks one of two", step("small", { reach: 1, reverse: true }) === -1);
ok("S4c a Tiny one is at the floor", step("tiny", { reverse: true }) === 0);
ok("S5 the applier asks the bounded step for a row with a ceiling",
  /reach: Number\(warpMods\?\.sizeReach \?\? 0\),/.test(applier)
  && /reverse: Boolean\(effect\.reversible && warpMods\?\.sizeReverse\)/.test(applier));
{
  const w = PLAN["Size Alteration"].warps;
  const reduce = aggregateWarpSelection(w, { "warp-0": 1 }).mods;
  const reach = aggregateWarpSelection(w, { "warp-3": 1 }).mods;
  ok("S6 the reduce warp buys the reversal", reduce.sizeReverse === true);
  ok("S6b the +6 warp buys the reach — not the Shape forms' prompt", reach.sizeReach === 1 && !reach.sizeSteps);
}

/* ================================================================== *
 * G. Spectral Grasp
 * ================================================================== */

const grasp = PLAN["Spectral Grasp"].effects[0];
ok("G1 four maneuvers offered, in the printed order",
  deepEqual(maneuverChoices(grasp), ["disarmAttack", "grappleAttack", "shoveAttack", "tripAttack"]));
ok("G1b Tanglefoot's single action is unchanged", deepEqual(maneuverChoices({ action: "grappleAttack" }), ["grappleAttack"]));
ok("G2 a shove pushes 5 feet, 10 on a critical",
  maneuverPushFeet("shoveAttack", "success") === 5 && maneuverPushFeet("shoveAttack", "critical") === 10
  && maneuverPushFeet("shoveAttack", "failure") === 0 && maneuverPushFeet("tripAttack", "critical") === 0);
ok("G3 a Heroic disarm reads the Critical's words",
  maneuverOutcomeText({ outcomes: { heroic: "", critical: "C", success: "S" } }, "heroic") === "C");
ok("G4 each action rolls against its own DC", /actionTargetDC\(actionData\.against, target\.system \?\? null\)\.dc/.test(applier));
ok("G5 the shove moves the token", /const moved = await forceMoveAway\(caster, target, pushFeet\);/.test(applier));
ok("G6 the spell's own -4 is carried", grasp.penalty === -4);
// FOUND LIVE ON 3.608.1: "heroic — no effect." above "ZZ Bare is pushed 10 ft".
ok("G7 a push or a disarm is not 'no effect'", /: after\.length \? "\." : " — no effect\."\)/.test(applier));

/* ================================================================== *
 * D. Spell Drain
 * ================================================================== */

const drainRows = PLAN["Spell Drain"].effects.filter((e) => e.kind === "spellDrain").map(normaliseSpellDrain);
ok("D1 three rungs, and the Critical is none of them", drainRows.length === 3 && drainRows.every(Boolean)
  && PLAN["Spell Drain"].effects.every((e) => !(e.onSave ?? []).includes("critical")));
const [dSuccess, dFailure, dFumble] = drainRows;
ok("D2 Success: -2 to the Spellcraft check", dSuccess.penalty === -2 && !dSuccess.forced);
ok("D3 Failure: the casting fails and its PP are absorbed", dFailure.forced === "failure" && dFailure.absorb);
ok("D4 Fumble: as Failure and a fumble", dFumble.forced === "fumble" && dFumble.absorb);
ok("D5 a drain never lifts a worse roll", drainedDegree(dFailure, "blunder") === "blunder" && drainedDegree(dFailure, "fumble") === "fumble");
ok("D5b and brings a better one down", drainedDegree(dFailure, "heroic") === "failure" && drainedDegree(dFumble, "success") === "fumble");
ok("D6 the drainer fills to the maximum and no further", drainedPP(14, 40, 50) === 10 && drainedPP(14, 30, 50) === 14);
ok("D7 the penalty joins the casting check", /if \(drain\?\.penalty\) \{\n\s*modifiers\.push\(\{/.test(cast));
ok("D7b the forced degree overrides the dice", /degree = drainedDegree\(drain, degree\);/.test(cast));
ok("D7c the PP are settled once the cost is known", /rolledDegree: degree, ppSpent, castName: spell\.name/.test(cast));
ok("D8 the applier leaves the rung waiting", /const drainRecorded = await recordSpellDrain\(target, effect, caster\);/.test(applier));

/* ================================================================== *
 * T. Spell Turning
 * ================================================================== */

ok("T1 a targeted spell can be turned", castCanBeTurned({ targets: "1 creature", area: "" }));
ok("T1b an area spell cannot, whatever its Targets line says", !castCanBeTurned({ targets: "creatures in the area", area: "20-foot radius" }));
ok("T1c nor a spell that targets nobody", !castCanBeTurned({ targets: "", area: "" }));
ok("T2 the counteract row: +2 per PP above", deepEqual(turningModifierRow(14, 10),
  { label: "Counteract (14 vs 10 PP)", value: 8, type: "circumstance" }) && turningModifierRow(14, 14) === null);
ok("T3 the ward records THIS casting's PP", /normaliseSpellTurning\(\{ \.\.\.effect, pp: Number\(rollData\?\.pp \?\? 0\) \}\)/.test(applier)
  && normaliseSpellTurning({ kind: "spellTurning", pp: 16 }).pp === 16);
ok("T4 the casting offers it, after success and before resolution",
  /if \(outcome\.cast && !isItemCast\) \{\n\s*const \{ castCanBeTurned \}/.test(cast)
  && cast.indexOf("offerSpellTurning(actor, spell") < cast.indexOf("  let spellAttack = null;"));

/* ================================================================== *
 * Z. Solid Fog
 * ================================================================== */

const fog = PLAN["Solid Fog"].effects;
ok("Z1 the fog is placed, not carried", zoneIsPlaced({ effects: fog, area: "20-foot radius" }));
ok("Z1b an emanation's zone would follow its caster", !zoneIsPlaced({ effects: fog, area: "10-foot emanation" }));
ok("Z2 it is live, and its row travels", emanationIsLive({ effects: fog, area: "20-foot radius" })
  && liveEmanationEffects({ effects: fog }).some((e) => e.kind === "zone"));
const parts = zoneEffectParts(fog, "c1");
ok("Z3 inside: concealed", deepEqual(parts?.statuses, ["concealed"]));
ok("Z4 from inside, the outside is concealed", Boolean(obscuredFromInside([parts.flag], [])));
ok("Z4b but not a creature in the same cloud", obscuredFromInside([parts.flag], [parts.flag]) === null);
ok("Z4c and nobody outside the cloud is obscured by it", obscuredFromInside([], [parts.flag]) === null);
ok("Z5 the avoidance check asks the attacker's cloud",
  // 3.610.0: a wall or storm that screens the line joins the same expression.
  // 3.616.0: an Arrow Catching wearer's ranged attacker ignores it all (B3).
  // 3.621.0: and a Dazzled attacker's concealment (block 39's R7).
  /const concealed = !ignoreConcealed && \(Boolean\(targetActor\.hasCondition\("concealed"\)\) \|\| byLight\.concealed \|\| Boolean\(fogged\)\n\s*\|\| Boolean\(screened\) \|\| senses\.concealed\);/
    .test(src("module", "combat", "targeting.mjs")));
ok("Z6 the circle is put down where it was cast", /\.\.\.\(zoneIsPlaced\(spellData\) \? \{ anchorTokenId: null \} : \{\}\),/.test(cast));
ok("Z7 the membership effect carries the condition",
  /statuses: zone\.statuses,/.test(src("module", "magic", "emanation-effects.mjs")));

/* ================================================================== *
 * W. Stoneskin
 * ================================================================== */

const clock = normaliseWearingClock(PLAN["Stoneskin"].effects.find((e) => e.kind === "wearingClock"));
ok("W1 a physical hit wears it", hitWears(clock, "slashing", DAMAGE_TYPES) && hitWears(clock, "bludgeoning", DAMAGE_TYPES));
ok("W1b fire does not", !hitWears(clock, "fire", DAMAGE_TYPES));
{
  const worn = wornClocks({ end: 1600, expiresRound: 110, duration: { value: 600, units: "seconds" } }, 60, { worldTime: 1000, round: 10 });
  ok("W2 a minute comes off all three clocks", worn.end === 1540 && worn.expiresRound === 100
    && worn.duration?.value === 540 && worn.duration?.units === "seconds" && !worn.spent);
  // FOUND LIVE ON 3.608.1: V14 refuses a duration whose value is not an
  // integer, and a null written back failed the whole update.
  ok("W2b a duration with no value is left alone, not written as null",
    wornClocks({ end: 1600, duration: { value: null, units: "seconds" } }, 60, { worldTime: 1000 }).duration === null);
  ok("W2c a duration in rounds loses ten", wornClocks({ duration: { value: 100, units: "rounds" } }, 60).duration?.value === 90);
  const wf = src("module", "magic", "wearing-clock-workflow.mjs");
  ok("W2d the workflow writes only the value, and says when the write is refused",
    /update\["duration\.value"\] = result\.duration\.value;/.test(wf) && !/duration\.seconds/.test(wf)
    && /!\(await effect\.update\(update\)\)\) failed = true;/.test(wf));
  ok("W3 the last minute worn away ends it", wornClocks({ end: 1050 }, 60, { worldTime: 1000 }).spent === true);
  ok("W3b by the round clock too", wornClocks({ expiresRound: 12 }, 60, { worldTime: 0, round: 5 }).spent === true);
}
ok("W4 the attack path asks after every blow that landed",
  /await wearOnHit\(damageOutcome\.targetActor, damageOutcome\.damageType\);/.test(attackWf));
ok("W5 the damage step says what it dealt", /targetActor, damageType: effectiveDamageType, drStoppedCritical \};/.test(attackWf));
ok("W6 the +4 PP warp widens the resistance",
  aggregateWarpSelection(PLAN["Stoneskin"].warps, { "warp-0": 1 }).mods.defenceValue === "physical"
  && /\? \{ \.\.\.effect, value: String\(warpMods\.defenceValue\) \}/.test(applier));

/* ================================================================== *
 * X. Spiritual Weapon and Smash
 * ================================================================== */

const sw = normaliseSpiritualWeapon(PLAN["Spiritual Weapon"].effects[0]);
const mace = { type: "weapon", name: "Mace", system: { equipped: true, attackMode: "melee", damage: "1d6" } };
const bow = { type: "weapon", name: "Bow", system: { equipped: true, attackMode: "missile", damage: "1d8" } };
const fist = { type: "weapon", name: "Unarmed Strike", system: { equipped: true, attackMode: "melee", category: "Unarmed", natural: true, damage: "1d4" } };
ok("X1 only a held melee weapon is a source", deepEqual(spiritualSourceWeapons([mace, bow]).map((w) => w.name), ["Mace"]));
// FOUND LIVE ON 3.608.1: a wizard with nothing in hand got a force copy of his fist.
ok("X1b an Unarmed Strike is not a held weapon", spiritualSourceWeapons([fist]).length === 0);
const rec = spiritualRecord(sw, mace, 1);
ok("X2 its dice, and +1 item plus the warp", rec.dice === "1d6" && rec.itemBonus === 2 && rec.damageType === "force");
ok("X3 modified by the magical ability", spiritualDamageFormula(rec, 3) === "1d6 + 3" && spiritualDamageFormula(rec, -1) === "1d6 - 1");
ok("X4 a Sustain strikes again", /const strikeLines = ranOut \? \[\] : await strikeOnSustain\(actor, entry\.id\);/
  .test(src("module", "magic", "sustain-workflow.mjs")));
const smash = normaliseVersusDamage({ ...PLAN["Smash"].effects[0], value: 9 });
ok("X5 Smash is capped at +5", smash.value === 5);
ok("X6 it reaches a construct and nothing else",
  versusDamageReaching([smash], ["construct"]).length === 1 && versusDamageReaching([smash], ["humanoid"]).length === 0);
ok("X7 discharged, the bonus doubles", versusDamageBonus([smash], { discharge: true }).value === 10
  && versusDamageBonus([smash]).value === 5);
ok("X8 the weapon's formula takes it", /if \(versus\.value > 0\) formula \+= ` \+ \$\{versus\.value\}`;/.test(attackWf));

/* ================================================================== *
 * F. The 3.606.0 live-test findings
 * ================================================================== */

ok("F1 a condition only granted is not 'already present'",
  /const wasAlreadyPresent = directConditionEffect\(actor, tag\.key\) !== null;/
    .test(src("module", "combat", "effect-application-workflow.mjs")));
ok("F2 a save ladder, terrain and a zone speak for themselves",
  ["saveLadder", "difficultTerrain", "zone"].every((k) => SELF_REPORTING_KINDS.includes(k)));
ok("F3 the owed save is capitalised", /const saveWord = String\(stamped\.save \?\? ""\)\.charAt\(0\)\.toUpperCase\(\)/.test(applier));

for (const kind of ["zone", "wearingClock", "spiritualWeapon", "versusDamage", "spellDrain", "spellTurning"]) {
  ok(`K ${kind} is a handled kind with a case`, HANDLED_EFFECT_KINDS.includes(kind) && applier.includes(`case "${kind}":`));
}

/* ================================================================== *
 * P. The pack, the plan and the manifest
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

for (const [name, fields] of Object.entries(PLAN)) {
  for (const [field, value] of Object.entries(fields)) {
    ok(`P1 ${name}.${field} is exactly the plan`, deepEqual(pack.get(name)?.[field], value));
  }
}
ok("P2 Sonic Rupture is still a Basic Fortitude", /basic fortitude/i.test(pack.get("Sonic Rupture")?.defence ?? ""));
ok("P2b Spell Drain still rolls Will", /^will$/i.test(String(pack.get("Spell Drain")?.defence ?? "").trim()));
ok("P2c Stone Call's damage is untouched", pack.get("Stone Call")?.damage?.formula === "4d6"
  && /basic reflex/i.test(pack.get("Stone Call")?.defence ?? ""));
ok("P2d Spiritual Weapon is still sustained", pack.get("Spiritual Weapon")?.sustained === true);
ok("P2e Spectral Grasp and Shock Bolt still target a creature",
  /creature/.test(pack.get("Spectral Grasp")?.targets ?? "") && /creature/.test(pack.get("Shock Bolt")?.targets ?? ""));
{
  const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
  for (const [name, fields] of Object.entries(plannedFields())) {
    for (const field of fields) {
      const entry = PACK_REPAIRS.find((r) => r.name === name && r.field === field && r.since === "3.608.0");
      ok(`P3 ${name}.${field} has a 3.608.0 pack-repair entry`, Boolean(entry));
      ok(`P3b and its \`to\` is the plan`, deepEqual(entry?.to, PLAN[name][field]));
    }
  }
}

/* ================================================================== *
 * H. Graham's rulings of 30 September 2026 (3.608.1)
 * ================================================================== */
{
  const { PLAN: RULED, plannedFields: ruledFields } = await import("./block32d-plan.mjs");
  const { effectAppliesOnDegree, effectiveSaveDegree } = await import("../module/magic/spell-degrees.mjs");
  const swd = pack.get("Speak With Dead");
  const haunt = (swd?.effects ?? []).find((e) => e.kind === "marker" && e.marker === "haunted");
  ok("H1 a Heroic corpse haunts its caster", effectAppliesOnDegree(haunt, "heroic") === true);
  ok("H1b a Critical one still does", effectAppliesOnDegree(haunt, "critical") === true);
  ok("H1c a Success does not", effectAppliesOnDegree(haunt, "success") === false);
  ok("H2 and a Heroic reads the Critical's words",
    effectiveSaveDegree(swd?.effects ?? [], "heroic") === "heroic"
    && (swd?.effects ?? []).some((e) => e.kind === "note" && (e.onSave ?? []).includes("heroic")
      && /deceive/.test(e.text)));
  ok("H3 the pack is the ruled plan", deepEqual(swd?.effects, RULED["Speak With Dead"].effects));
  const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
  const { classifyRepairs } = await import("../module/pack-repair.mjs");
  const { PLAN: FIRST } = await import("./block32-plan.mjs");
  for (const [name, fields] of Object.entries(ruledFields())) {
    for (const field of fields) {
      const entries = PACK_REPAIRS.filter((r) => r.name === name && r.field === field);
      const entry = entries[0];
      ok(`H4 ${name}.${field} keeps one pack-repair entry, re-dated 3.608.1`,
        entries.length === 1 && entry?.since === "3.608.1");
      ok("H4b its `to` is the ruled plan", deepEqual(entry?.to, RULED[name][field]));
      ok("H4c and it still recognises what 3.606.0 wrote",
        (entry?.alsoFrom ?? []).some((f) => deepEqual(f, FIRST[name][field])));
      const state = (own) => classifyRepairs({ [field]: own }, [entry])[0]?.state;
      ok("H5 a copy never repaired is brought up to the ruling", state(entry?.from) === "stale");
      ok("H5b a copy repaired at 3.606.0 is brought up too", state(FIRST[name][field]) === "stale");
      ok("H5c a current copy is left alone", state(RULED[name][field]) === "current");
      ok("H5d a house-ruled copy is left alone", state([{ kind: "note", text: "mine" }]) === "custom");
    }
  }
}

if (failures.length) {
  console.log(`verify-chapter10-321-330c: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-chapter10-321-330c: OK — ${checks} checks. Riders, sizes, maneuvers, a drain, a ward, a fog, `
  + "a skin of stone, a weapon of force and a smash — each read where the book prints it.");
