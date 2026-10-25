/**
 * verify-chapter7-combat-191-200 — attacks, damage, injuries, dying,
 * space, terrain, cover, flanking, mounted combat (pages 191-200).
 *
 * NEW at 3.579.0, for the pages 191-200 audit. Twenty defects and
 * Graham's rulings of 21 September 2026 (R1-R20):
 *
 *   A  the multiple attack penalty, on everything with the attack trait
 *      and on spell attacks (D1; R1)
 *   B  the stray shot that strikes nobody (D2; R2)
 *   C  line of sight as a GM call (D3; R3)
 *   D  cover: DB, Reflex and Stealth, and lesser cover at all (D4; R4)
 *   E  the subdual critical when DR stops one (D5; R5)
 *   F  injury severities, and Unconscious at a combined 10 (D6; R6)
 *   G  Treat Injury's printed ladder (D7; R7)
 *   H  Fatal injuries blocking recovery (D8; R8)
 *   I  Persistence: UH, FR, P, and the clock that should not be stamped
 *      on Bleeding, Recurring Damage or sickened (D9; R9)
 *   J  Fast Healing and Regeneration reducing Injured (D10; R10)
 *   K  the Dying Check's Chaos row (D11; R11)
 *   L  Tiny and Diminutive: reach 0, shared squares, the caps (D12; R12)
 *   M  mounted combat (D13; R13)
 *   N  flanking's four conditions (D14; R14)
 *   O  moving through creatures (D15; R15)
 *   P  formidable terrain, and fliers unhindered (D16; R16)
 *   Q  unusual surfaces (D17; R17)
 *   R  exhaustion's ACP row, the Will option, the recurring lever
 *      (D18; R18)
 *   S  the bomb card's flat check (D20)
 *
 * EVERY EXPECTED VALUE IS TRANSCRIBED FROM THE PRINTED PAGE or from one
 * of Graham's rulings, never from the module under test.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { countsTowardMAP, criticalBecomesSubdual, mapPenalty, reachPenalty, spellCountsTowardMAP } from "../module/combat/attack.mjs";
import { assembledSpellAttackTotal } from "../module/magic/casting-dc.mjs";
import { coverAllowsHide, COVER_TYPES } from "../module/combat/ranged.mjs";
import { TAKE_COVER_EFFECTS } from "../module/combat/basic-action-stances.mjs";
import {
  combinedInjuryValue, injuryHealingOverTime, injuryIncapacitationPlan, injuryRecovery, injurySeverity,
  injuryHealingKey, injuryValueAfterStepDown, isFatalPersistence, mayRecoverFromDying, persistenceCleared, persistenceCode,
  splitPersistenceTags, stepDownStaysTreated, treatInjuryDC,
  FAST_HEALING_INJURY_SECONDS, REGENERATION_INJURY_SECONDS
} from "../module/injuries.mjs";
import { mayEndInSquare, meleeFromHere, passageThrough } from "../module/combat/space.mjs";
import { allyThreatens } from "../module/combat/flanking.mjs";
import {
  mountSizeAllowed, mountedAttackBonus, mountedDefenceOffer, mountedReach, sharedActionPoints
} from "../module/combat/mounted.mjs";
import { regionContains, surfaceMovementEffect, struckOnSurfaceNote, surfacesUnder, unusualSurfaceOf } from "../module/combat/surfaces.mjs";
import { sizeSteps } from "../module/combat/space.mjs";
import { terrainKindLabel, terrainPlacedLine, terrainRegionName } from "../module/magic/difficult-terrain.mjs";
import { exhaustionLoadPenalty, exhaustionSave } from "../module/exhaustion.mjs";
import { SIZE_TABLE } from "../module/config.mjs";
import { RECURRING_FLAT_CHECK_DC } from "../module/conditions/registry.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";
import { BASIC_ACTIONS } from "../module/data/basic-actions.mjs";

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

/* ================================================================== */
/* A — THE MULTIPLE ATTACK PENALTY (page 191; D1, R1)                  */
/* ================================================================== */

// "Any action which has the attack trait counts towards the multiple
// attack penalty including disarm, shove, spells etc." Graham's R1:
// "Only things with the attack trait."
eq("A1 the trait is the test", [
  countsTowardMAP("Attack"),
  countsTowardMAP("Attack, Flourish"),
  countsTowardMAP("Flourish, Attack"),
  countsTowardMAP("Attack Flourish"),
  countsTowardMAP("Healing, Manipulate"),
  countsTowardMAP("Counterattack"),
  countsTowardMAP("")
], [true, true, true, true, false, false, false]);

eq("A2 the traits line may arrive on an object", [
  countsTowardMAP({ traits: "Attack" }), countsTowardMAP({ traits: "Move" }), countsTowardMAP(null)
], [true, false, false]);

// A spell writes no trait; rolling an attack is what having it means.
eq("A3 an attack spell counts, a save spell does not", [
  spellCountsTowardMAP({ category: "attack" }),
  spellCountsTowardMAP({ category: "Attack" }),
  spellCountsTowardMAP({ category: "save" }),
  spellCountsTowardMAP({ category: "utility" }),
  spellCountsTowardMAP({ category: "save", traits: "Attack" })
], [true, true, false, false, true]);

// The four manoeuvres page 191 names, from the pack data.
for (const key of ["disarmAttack", "shoveAttack", "tripAttack", "grappleAttack"]) {
  const action = BASIC_ACTIONS.find((a) => a.key === key);
  ok(`A4 ${key} carries the Attack trait`, Boolean(action) && countsTowardMAP(action.traits),
    `traits ${JSON.stringify(action?.traits)}`);
}
// And one that must not.
{
  const aid = BASIC_ACTIONS.find((a) => a.key === "aidDefensive");
  ok("A5 a non-attack action is untouched by the ladder",
    !aid || countsTowardMAP(aid.traits) === /(^|[,\s])attack([,\s]|$)/i.test(String(aid.traits ?? "")));
}

// The ladder itself is unchanged: -5/-10, or -4/-8 agile.
eq("A6 the ladder", [mapPenalty(0), mapPenalty(1), mapPenalty(2), mapPenalty(1, true), mapPenalty(2, true)],
  [0, -5, -10, -4, -8]);

// A spell attack takes it off the total.
eq("A7 the spell attack total carries a MAP term", [
  assembledSpellAttackTotal({ checkTotal: 20, map: -5 }).total,
  assembledSpellAttackTotal({ checkTotal: 20, map: 0 }).total,
  assembledSpellAttackTotal({ checkTotal: 20, map: 5 }).total,
  assembledSpellAttackTotal({ checkTotal: 20, map: -5 }).parts[0]?.label
], [15, 20, 20, "Multiple attack penalty"]);

{
  const aw = code("module", "combat", "action-workflow.mjs");
  ok("A8 the action path adds the row and advances the counter",
    // Re-anchored at 3.666.0: through the combat-only helpers (turn-records.mjs).
    /if \(countsTowardMAP\(action\.traits\) && !mapExempt\) \{[\s\S]{0,300}mapPenalty\(attackCountOf\(actor\)\)/.test(aw)
    && /if \(check && countsTowardMAP\(action\.traits\)\) \{[\s\S]{0,200}await setAttackCount\(actor, attackCountOf\(actor\) \+ 1\);/.test(aw));
  const cw = code("module", "magic", "cast-workflow.mjs");
  ok("A9 the spell path reads the same counter and advances it",
    /const mapBefore = mapCount \?\? attackCountOf\(actor\);/.test(cw)
    && /const spellMap = spellCountsTowardMAP\(spellData\) \? mapPenalty\(mapBefore\) : 0;/.test(cw)
    && /await setAttackCount\(actor, mapBefore \+ 1\);/.test(cw));
}

/* ================================================================== */
/* B — THE STRAY SHOT (page 200; D2, R2)                               */
/* ================================================================== */

{
  const w = code("module", "combat", "attack-workflow.mjs");
  ok("B1 the struck combatant is kept", /strayStruckToken = struckToken \?\? null;/.test(w));
  ok("B2 the damage is rolled against them, never at the aimed target",
    /\} else if \(strayStruckToken\) \{[\s\S]{0,1400}targetTokenOverride: strayStruckToken/.test(w));
  ok("B3 no critical is possible from a stray shot",
    /\} else if \(strayStruckToken\) \{[\s\S]{0,400}critical: null,/.test(w));
  ok("B4 no Sneak Attack or Precision dice ride along",
    !/\} else if \(strayStruckToken\) \{[\s\S]{0,1400}(sneakDice|precisionDice):/.test(w));
  ok("B5 the damage step reads the override before the user's target",
    /const targetTokenHere = targetTokenOverride \?\? firstTargetToken\(\) \?\? null;/.test(w));
  ok("B6 the card says damage is rolled", /damage is rolled against them/.test(read("module", "combat", "attack-workflow.mjs")));
}

/* ================================================================== */
/* C — LINE OF SIGHT (page 199; D3, R3 "GM Call")                      */
/* ================================================================== */

{
  const w = code("module", "combat", "attack-workflow.mjs");
  ok("C1 a blocked line is noted, not refused",
    /lineOfSightNote =\s*`<em>No clear line of sight/.test(w)
    && /lineOfEffectBlocked\(attackerToken\.center, targetToken\.center\)/.test(w));
  ok("C2 the note reaches the card", /if \(lineOfSightNote\) lines\.push\(line\(lineOfSightNote\)\);/.test(w));
  ok("C3 the shot is never cancelled for it",
    !/lineOfSightNote[\s\S]{0,200}return null;/.test(w));
  ok("C4 the card calls it the GM's", /is the GM's call/.test(read("module", "combat", "attack-workflow.mjs")));
}

/* ================================================================== */
/* D — COVER (page 198; D4, R4)                                        */
/* ================================================================== */

// The printed table: Lesser +2 (no hiding), Standard +4, Greater +8.
eq("D1 the cover table", [
  COVER_TYPES.lesser.bonus, COVER_TYPES.standard.bonus, COVER_TYPES.greater.bonus
], [2, 4, 8]);
eq("D2 the Can Hide column", [
  coverAllowsHide("none"), coverAllowsHide("lesser"), coverAllowsHide("standard"), coverAllowsHide("greater")
], [false, false, true, true]);

// "a +4-circumstance bonus to your DB, Reflex saves and Hide & Sneak
// (Stealth) checks", and the same sentence at +8.
const changeFor = (level, key) =>
  TAKE_COVER_EFFECTS[level]?.changes?.find((c) => c.key === key)?.value ?? null;
eq("D3 standard cover is all three at +4", [
  changeFor("standard", "system.combat.defence.circumstance"),
  changeFor("standard", "system.combat.saves.reflex.circumstance"),
  changeFor("standard", "system.skills.stealth.circumstance")
], [4, 4, 4]);
eq("D4 greater cover is all three at +8", [
  changeFor("greater", "system.combat.defence.circumstance"),
  changeFor("greater", "system.combat.saves.reflex.circumstance"),
  changeFor("greater", "system.skills.stealth.circumstance")
], [8, 8, 8]);
eq("D5 lesser cover is DB alone at +2", [
  changeFor("lesser", "system.combat.defence.circumstance"),
  changeFor("lesser", "system.combat.saves.reflex.circumstance"),
  changeFor("lesser", "system.skills.stealth.circumstance")
], [2, null, null]);

{
  const aw = code("module", "combat", "action-workflow.mjs");
  ok("D6 Take Cover offers the lesser tier", /action: "lesser", label: "A creature is in the way/.test(aw));
  // F1 (3.579.1): the bonuses were right and the action's own printed
  // description still named the old pair, so the card contradicted
  // itself — "+8 to DB and Stealth" beside "+4 to DB, Reflex and Stealth".
  {
    const cover = BASIC_ACTIONS.find((a) => a.key === "takeCover");
    ok("D6b F1 and its description names all three, and lesser cover",
      /Reflex saves and Stealth/.test(cover?.description ?? "")
      && /Lesser cover/i.test(cover?.description ?? "")
      && !/to DB and to Stealth checks/.test(cover?.description ?? ""));
  }
  ok("D7 Hide is refused behind lesser cover",
    /if \(action\.key === "hide"\) \{\s*const level = takeCoverLevelOf\(actor\);\s*if \(level && !coverAllowsHide\(level\)\) \{[\s\S]{0,200}return null;/.test(aw));
}

/* ================================================================== */
/* E — THE SUBDUAL CRITICAL (page 192; D5, R5)                         */
/* ================================================================== */

// "If DR reduces the damage from a critical hit to zero or less, the
// target takes a subdual critical instead of the normal type."
eq("E1 DR stopping a critical makes it subdual", [
  criticalBecomesSubdual({ critical: "minor", damageType: "slashing", total: 4, taken: 0, drApplied: 4 }),
  criticalBecomesSubdual({ critical: "deadly", damageType: "piercing", total: 9, taken: 0, drApplied: 12 })
], [true, true]);
eq("E2 and nothing else does", [
  criticalBecomesSubdual({ critical: null, damageType: "slashing", total: 4, taken: 0, drApplied: 4 }),
  criticalBecomesSubdual({ critical: "minor", damageType: "subdual", total: 4, taken: 0, drApplied: 4 }),
  criticalBecomesSubdual({ critical: "minor", damageType: "slashing", total: 4, taken: 0, drApplied: 0 }),
  criticalBecomesSubdual({ critical: "minor", damageType: "slashing", total: 0, taken: 0, drApplied: 4 }),
  criticalBecomesSubdual({ critical: "minor", damageType: "slashing", total: 9, taken: 5, drApplied: 4 })
], [false, false, false, false, false]);

{
  const w = code("module", "combat", "attack-workflow.mjs");
  ok("E3 the damage step answers the question", /drStoppedCritical = criticalBecomesSubdual\(\{/.test(w));
  ok("E4 and hands it back", /drStoppedCritical \};/.test(w));
  ok("E5 the card offers the re-read on the Subdual table at the same result",
    /data-action="subdualCritical"/.test(w)
    && /record\.damageType\) !== "subdual"/.test(w));
  const ci = code("module", "dice", "check-card-interactions.mjs");
  ok("E6 the button re-reads rather than rolling again",
    /subdualCritical[\s\S]{0,700}damageType: "subdual",[\s\S]{0,200}forcedResult: raw\.record\.result/.test(ci));
}

/* ================================================================== */
/* F — INJURY SEVERITIES AND INCAPACITATION (page 194; D6, R6)         */
/* ================================================================== */

// "up to 4 are called Minor… from 5-7… Serious… 8+ … Deadly."
eq("F1 the bands", [1, 4, 5, 7, 8, 30].map((v) => injurySeverity(v)?.key),
  ["minor", "minor", "serious", "serious", "deadly", "deadly"]);
eq("F2 nothing is an injury below 1", [injurySeverity(0), injurySeverity(-2), injurySeverity(null)],
  [null, null, null]);

// R6(a): the sum of dazed + injured + weakened, and nothing else.
eq("F3 the combined value", [
  combinedInjuryValue({ dazed: 3, injured: 4, weakened: 3 }),
  combinedInjuryValue({ dazed: 3, injured: 4, weakened: 3, fatigued: 9 }),
  combinedInjuryValue({}),
  combinedInjuryValue({ injured: -2 })
], [10, 10, 0, 0]);

// R6(b): unconscious at 10 or more, awake below 10.
eq("F4 the threshold", [
  injuryIncapacitationPlan({ combined: 10, present: [] }).apply,
  injuryIncapacitationPlan({ combined: 11, present: [] }).apply,
  injuryIncapacitationPlan({ combined: 9, present: [] }).apply
], [true, true, false]);
eq("F5 it lifts again, and only its own", [
  injuryIncapacitationPlan({ combined: 4, present: ["unconscious"], owned: true }).remove,
  injuryIncapacitationPlan({ combined: 4, present: ["unconscious"], owned: false }).remove,
  injuryIncapacitationPlan({ combined: 4, present: ["unconscious"], owned: true, otherReasonUnconscious: true }).remove
], [true, false, false]);
{
  const w = code("module", "injury-workflow.mjs");
  ok("F6 0 HP and dying hold the creature down", /present\.includes\("dying"\) \|\| present\.includes\("dead"\)/.test(w)
    && /resources\?\.hp\?\.value \?\? 1\) <= 0\) return true;/.test(w));
  ok("F7 the hooks are registered at startup",
    /registerInjuryHooks\(\);/.test(code("scripts", "trg-prime.mjs")));
}

/* ================================================================== */
/* G — TREATING INJURIES (page 194; D7, R7)                            */
/* ================================================================== */

eq("G1 the printed DCs", ["minor", "serious", "deadly"].map(treatInjuryDC), [20, 24, 30]);
// "Minor Injuries will heal by themselves in three days of rest… a DC 20
// … will halve their recovery time."
eq("G2 a Minor injury's clock", [
  injuryRecovery("minor", false).days, injuryRecovery("minor", true).days, injuryRecovery("minor", true, true).days
], [3, 2, 1]);
// "A Serious Injury… will turn into a Minor Injury… in 10 days of rest,
// after being treated." Untreated, it has no clock at all.
eq("G3 a Serious injury's clock", [
  injuryRecovery("serious", false).days, injuryRecovery("serious", true).days, injuryRecovery("serious", true).becomes
], [null, 10, "minor"]);
// "Deadly Injuries… will become a Serious Injury… after 20 days if treated."
eq("G4 a Deadly injury's clock", [
  injuryRecovery("deadly", false).days, injuryRecovery("deadly", true).days, injuryRecovery("deadly", true).becomes
], [null, 20, "serious"]);
// "lowering value accordingly"
eq("G5 the step down", [9, 8, 7, 5, 4, 1].map(injuryValueAfterStepDown), [7, 7, 4, 4, 0, 0]);
// "Once turned into Minor Injuries, Serious Injuries will continue to
// heal without the need of any further treatment."
eq("G6 a stepped-down injury keeps its mark",
  [stepDownStaysTreated("serious"), stepDownStaysTreated("deadly"), stepDownStaysTreated("minor")],
  [true, true, false]);

{
  const action = SKILL_ACTIONS.find((a) => a.key === "treatInjury");
  ok("G7 the old draft's Crippling fumble is gone",
    Boolean(action) && !/Crippling/i.test(JSON.stringify(action)));
  ok("G8 the printed ladder is on the card", Boolean(action)
    && /10 days/.test(action.outcomes.success) && /20/.test(action.outcomes.success));
  const aw = code("module", "combat", "action-workflow.mjs");
  ok("G9 the DC is read from the patient",
    /if \(action\.key === "treatInjury" && targetActor\) \{[\s\S]{0,500}resolved\.dc = treatInjurySetup\.dc;/.test(aw));
  ok("G10 a success starts the clock",
    /action\.key === "treatInjury" && targetActor && \["critical", "success"\]\.includes\(degree\)/.test(aw));
}

/* ================================================================== */
/* H — FATAL INJURIES (page 193; D8, R8)                               */
/* ================================================================== */

eq("H1 the Persistence column names them", [
  isFatalPersistence("Fatal"), isFatalPersistence("Death"), isFatalPersistence("UH/Fatal"),
  isFatalPersistence("UH"), isFatalPersistence("P"), isFatalPersistence("-")
], [true, true, true, false, false, false]);
eq("H2 one blocks recovery", [mayRecoverFromDying(0), mayRecoverFromDying(1), mayRecoverFromDying(3)],
  [true, false, false]);
{
  const ds = code("module", "combat", "death-state.mjs");
  ok("H3 Dying is held at 1 rather than removed",
    /if \(!mayLeaveDying\(actor\)\) \{\s*await actor\.toggleStatusEffect\("dying", \{ value: 1 \}\);/.test(ds));
  ok("H4 the turn card says why", /if \(state\.blocked\) \{/.test(code("module", "documents", "combat.mjs")));
  ok("H5 the mark is made where the row is read",
    /if \(isFatalPersistence\(row\.persistence\)\) \{\s*\{\s*const fatalEntry = \{ effect: row\.effect, severity, persistence: row\.persistence \};[\s\S]{0,160}markFatalInjury\(targetActor, fatalEntry\)/.test(code("module", "combat", "attack-workflow.mjs")));
  ok("H6 and cleared by the GM's button",
    /data-action="clearFatalInjury"/.test(code("module", "combat", "attack-workflow.mjs"))
    && /clearFatalInjury[\s\S]{0,600}await clearFatalInjury\(target\);/.test(code("module", "dice", "check-card-interactions.mjs")));
}

/* ================================================================== */
/* I — PERSISTENCE (page 193; D9, R9)                                  */
/* ================================================================== */

eq("I1 the five kinds, and the compound rows the tables print", [
  persistenceCode("M"), persistenceCode("D"), persistenceCode("UH"), persistenceCode("FR"),
  persistenceCode("P"), persistenceCode("UH/Fatal"), persistenceCode("Surface Scrape"), persistenceCode("-")
], ["M", "D", "UH", "FR", "P", "UH", "", ""]);

// R9: UH clears at full HP magically, or at full HP then ten minutes'
// rest; FR clears on eight hours' sleep; P never clears by itself.
eq("I2 Until Healed", [
  persistenceCleared("UH", { fullHP: true, magicalHealing: true }),
  persistenceCleared("UH", { fullHP: true, restMinutes: 10 }),
  persistenceCleared("UH", { fullHP: true, restMinutes: 9 }),
  persistenceCleared("UH", { fullHP: false, magicalHealing: true })
], [true, true, false, false]);
eq("I3 Full Rest", [
  persistenceCleared("FR", { sleepHours: 8 }), persistenceCleared("FR", { sleepHours: 7 })
], [true, false]);
eq("I4 Permanent waits for the GM", [
  persistenceCleared("P", { fullHP: true, magicalHealing: true, sleepHours: 8, restMinutes: 60 })
], [false]);

// "these rules only apply to conditions that do not have their own
// durations" — Bleeding, Recurring Damage and sickened keep their own.
{
  const split = splitPersistenceTags([
    { key: "bleeding" }, { key: "dazed" }, { key: "recurring" }, { key: "sickened" }, { key: "injured" }
  ]);
  eq("I5 the self-timed conditions are held back",
    [split.selfTimed.map((t) => t.key), split.timed.map((t) => t.key)],
    [["bleeding", "recurring", "sickened"], ["dazed", "injured"]]);
}
{
  const w = code("module", "combat", "attack-workflow.mjs");
  ok("I6 they are applied without the round clock",
    /if \(selfTimed\.length\) \{[\s\S]{0,300}applyConditionTags\(targetActor, selfTimed, \{\}\)/.test(w));
  ok("I7 and the timed ones still take it",
    /if \(timed\.length\) \{[\s\S]{0,300}applyConditionTags\(targetActor, timed, \{ expiresRound \}\)/.test(w));
  // `persistence`, not `row.persistence`, since 3.580.0: an armour clause
  // may rewrite the column (page 204, Graham's R9 of 21 September 2026 —
  // Bludgeoning 41-43, "Metal Armoured: Persistence becomes D"), so the
  // record has to be of what this target actually got.
  ok("I8 UH, FR and P are recorded for the events that end them",
    /const persistenceEntry = \{\s*code: persistence,[\s\S]{0,400}\(\) => recordPersistence\(targetActor, persistenceEntry\)\)\) \{/.test(w));
  const rw = code("module", "rest", "rest-workflow.mjs");
  ok("I9 a rest settles them, and says so",
    /const persistenceCleared = await settlePersistence\(actor, \{/.test(rw)
    && /for \(const cleared of summary\.persistenceCleared \?\? \[\]\)/.test(rw));
  ok("I10 and so does magical healing to full",
    /settlePersistence\(actor, \{ fullHP: true, magicalHealing: true \}\)/.test(code("module", "magic", "spell-effects.mjs")));
}

/* ================================================================== */
/* J — FAST HEALING AND REGENERATION (page 193; D10, R10)              */
/* ================================================================== */

// "Fast Healing reduces your Injured condition by its value every hour.
// Regenerate does the same, every 10 minutes."
eq("J1 the two periods", [FAST_HEALING_INJURY_SECONDS, REGENERATION_INJURY_SECONDS], [3600, 600]);
eq("J2 whole periods only, with the remainder carried", [
  injuryHealingOverTime(2, 7200, 3600),
  injuryHealingOverTime(2, 3500, 3600),
  injuryHealingOverTime(2, 3700, 3600),
  injuryHealingOverTime(3, 1800, 600)
], [
  { reduction: 4, periods: 2, remainder: 0 },
  { reduction: 0, periods: 0, remainder: 3500 },
  { reduction: 2, periods: 1, remainder: 100 },
  { reduction: 9, periods: 3, remainder: 0 }
]);
eq("J3 no rate heals nothing", [injuryHealingOverTime(0, 7200, 3600).reduction], [0]);
{
  const w = code("module", "injury-workflow.mjs");
  ok("J4 the world clock drives it",
    /Hooks\.on\("updateWorldTime", async \(_worldTime, delta\) => \{[\s\S]{0,400}for \(const actor of injuredActors\(\)\) await advanceInjuryHealing\(actor, seconds\);/.test(w));
  // F2 (3.579.1): the hook iterated `game.actors` alone, and an UNLINKED
  // token's actor is not in that collection — so Fast Healing reduced
  // Injured for player characters and for no monster in the world.
  ok("J5 F2 and it reaches a token's own actor, not only the sidebar",
    /for \(const scene of game\.scenes \?\? \[\]\) \{\s*for \(const token of scene\.tokens \?\? \[\]\) \{/.test(w)
    && /if \(token\.actorLink\) continue;/.test(w));
  // F5 (3.579.2): keyed on the EFFECT, not the actor. An unlinked token
  // with no delta SHARES the base actor's effects — different `uuid`s,
  // one record — so an actor key healed the same injury twice in a tick
  // ("Injured 8 → 6" and "Injured 6 → 4" together). Driving 3.579.1
  // found it; the harness had agreed with the uuid key.
  ok("J6 F5 de-duplicated by the effect document the reduction writes to",
    /const seen = new Map\(\);/.test(w)
    && /const key = injuryIdentityOf\(actor\);/.test(w)
    && /if \(!key \|\| seen\.has\(key\)\) return;/.test(w));
  ok("J6b F6 the identity is decided by injuryHealingKey, not by a uuid",
    /return injuryHealingKey\(\{/.test(w)
    && /deltaEffectIds: Array\.from\(actor\?\.token\?\.delta\?\._source\?\.effects \?\? \[\]\)\.map\(\(row\) => row\?\._id\)/.test(w));
  ok("J6c F5 and a creature with no injury is not a creature to heal",
    /if \(!Number\(actor\?\.getConditionValue\?\.\("injured"\) \?\? 0\)\) return null;/.test(w));
}

// F6 (3.579.3): F5's OWN FIX did nothing. Keying on `effect.uuid` renames
// the shared document instead of identifying it — a synthetic actor's
// effect uuid is the base document's id under the token's path. Driving
// 3.579.2 healed the same injury twice again, 8 → 6 then 6 → 4, and the
// base and its token diverged to 6 and 4.
//
// THE THREE SHAPES BELOW ARE TRANSCRIBED FROM THAT WORLD, uuid for uuid:
// one base actor, one unlinked token of it carrying no delta, and two
// unlinked tokens each carrying an Injured effect of their own.
{
  const BASE_ACTOR = "dPA5L6j9SuJ9WEb1";
  const BASE_EFFECT = "BBS0dL1QgvLg4v4z";
  const TOKEN_PATH = "Scene.35MCRef5paa5ZZWN.Token.cjyaX8wbUxCvqF2y.Actor.dPA5L6j9SuJ9WEb1";

  const sidebar = injuryHealingKey({
    actorUuid: `Actor.${BASE_ACTOR}`, actorId: BASE_ACTOR, isToken: false,
    effectId: BASE_EFFECT, effectUuid: `Actor.${BASE_ACTOR}.ActiveEffect.${BASE_EFFECT}`,
    deltaEffectIds: []
  });
  const shared = injuryHealingKey({
    actorUuid: TOKEN_PATH, actorId: BASE_ACTOR, isToken: true,
    effectId: BASE_EFFECT, effectUuid: `${TOKEN_PATH}.ActiveEffect.${BASE_EFFECT}`,
    deltaEffectIds: []   // the delta stores nothing — the effect is the base's
  });
  ok("J7 F6 an unlinked token with an empty delta is the SAME record as its sidebar actor",
    sidebar === shared, `sidebar ${sidebar} vs token ${shared}`);

  // And the key names the document, not either actor's view of it.
  eq("J7b F6 and the name is the one the effect actually lives under",
    sidebar, `effect:Actor.${BASE_ACTOR}.ActiveEffect.${BASE_EFFECT}`);

  // Two unlinked tokens of one base actor, each with its own Injured
  // effect in its own delta: genuinely two creatures, two keys.
  const ownA = injuryHealingKey({
    actorUuid: "Scene.35MCRef5paa5ZZWN.Token.AAAA.Actor.ram1", actorId: "ram1", isToken: true,
    effectId: "pHZASMrfBAk5vcV9",
    effectUuid: "Scene.35MCRef5paa5ZZWN.Token.AAAA.Actor.ram1.ActiveEffect.pHZASMrfBAk5vcV9",
    deltaEffectIds: ["pHZASMrfBAk5vcV9"]
  });
  const ownB = injuryHealingKey({
    actorUuid: "Scene.35MCRef5paa5ZZWN.Token.BBBB.Actor.ram1", actorId: "ram1", isToken: true,
    effectId: "vwLWdk4HxnmXwXGa",
    effectUuid: "Scene.35MCRef5paa5ZZWN.Token.BBBB.Actor.ram1.ActiveEffect.vwLWdk4HxnmXwXGa",
    deltaEffectIds: ["vwLWdk4HxnmXwXGa"]
  });
  ok("J8 F6 two unlinked tokens with injuries of their own stay two records",
    ownA !== ownB && ownA !== sidebar && ownB !== sidebar);

  // A token whose delta stores an OVERRIDE of the base actor's effect —
  // same id, its own value — is its own record too: the sidebar's write
  // cannot reach it.
  const override = injuryHealingKey({
    actorUuid: TOKEN_PATH, actorId: BASE_ACTOR, isToken: true,
    effectId: BASE_EFFECT, effectUuid: `${TOKEN_PATH}.ActiveEffect.${BASE_EFFECT}`,
    deltaEffectIds: [BASE_EFFECT]
  });
  ok("J9 F6 a token that stores its own copy of the effect is its own record",
    override !== sidebar);

  // No effect at all falls back to the actor, and nothing at all is null.
  eq("J10 F6 the fallbacks", [
    injuryHealingKey({ actorUuid: "Actor.x" }),
    injuryHealingKey({})
  ], ["actor:Actor.x", null]);
}

/* ================================================================== */
/* K — THE DYING CHECK'S CHAOS ROW (page 194; D11, R11)                */
/* ================================================================== */

{
  const c = code("module", "documents", "combat.mjs");
  ok("K1 Chaos is read from the dice, not the optional setting",
    /if \(check\?\.dice\?\.chaos\) \{/.test(c) && !/chaosResults[\s\S]{0,200}Dying Check/.test(c));
  ok("K2 the row says what page 194 says",
    /minor complication or benefit/.test(read("module", "documents", "combat.mjs")));
  ok("K3 the degree is unchanged — 'treat as a Modified Result'",
    !/if \(check\?\.dice\?\.chaos\) \{[\s\S]{0,300}degree =/.test(c));
}

/* ================================================================== */
/* L — TINY AND DIMINUTIVE (page 197; D12, R12)                        */
/* ================================================================== */

// The table: both have a reach of 0' and a space of under 5 feet.
eq("L1 the printed reaches",
  ["diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"]
    .map((s) => SIZE_TABLE[s].reach),
  [0, 0, 5, 5, 10, 15, 20, 25]);
// "Up to four Tiny creatures can occupy the same space and up to eight
// Diminutive creatures."
eq("L2 the caps", [SIZE_TABLE.tiny.perSquare, SIZE_TABLE.diminutive.perSquare, SIZE_TABLE.medium.perSquare],
  [4, 8, 1]);
eq("L3 only those two share a square",
  ["diminutive", "tiny", "small", "medium", "large"].map((s) => SIZE_TABLE[s].sharesSquare),
  [true, true, false, false, false]);

// "must do so to make attacks against them"
eq("L4 a reach of 0 attacks only from inside the square", [
  meleeFromHere({ attackerSize: "tiny", distanceFeet: 5 }).allowed,
  meleeFromHere({ attackerSize: "tiny", distanceFeet: 0 }).allowed,
  meleeFromHere({ attackerSize: "diminutive", distanceFeet: 5 }).allowed,
  meleeFromHere({ attackerSize: "medium", distanceFeet: 5 }).allowed
], [false, true, false, true]);

// A reach of 0 must survive the penalty function too.
eq("L5 reachPenalty honours a reach of zero", [
  reachPenalty(false, 0, 0).outOfReach,
  reachPenalty(false, 0, 5).outOfReach,
  reachPenalty(false, 5, 5).outOfReach,
  reachPenalty(false, undefined, 5).outOfReach
], [false, true, false, false]);

eq("L6 the square's capacity is enforced", [
  mayEndInSquare({ moverSize: "medium", occupants: [{ size: "medium" }] }).allowed,
  mayEndInSquare({ moverSize: "medium", occupants: [{ size: "large" }] }).allowed,
  mayEndInSquare({ moverSize: "tiny", occupants: [{ size: "medium" }] }).allowed,
  mayEndInSquare({ moverSize: "tiny", occupants: [{ size: "tiny" }, { size: "tiny" }, { size: "tiny" }] }).allowed,
  mayEndInSquare({ moverSize: "tiny", occupants: [{ size: "tiny" }, { size: "tiny" }, { size: "tiny" }, { size: "tiny" }] }).allowed,
  mayEndInSquare({ moverSize: "medium", occupants: [] }).allowed
], [false, false, true, true, false, true]);

ok("L7 the geometry no longer turns a reach of 0 into 5", (() => {
  const g = code("module", "combat", "geometry.mjs");
  return /const reachFeet = declared === undefined \? 5 : Math\.max\(0, declared\);/.test(g)
    && /\.find\(\(v\) => Number\.isFinite\(v\)\)/.test(g)
    && !/Number\(reach\) \|\| Number\(token\.actor\?\.system\?\.combat\?\.reach\) \|\| 5/.test(g);
})());

/* ================================================================== */
/* M — MOUNTED COMBAT (page 200; D13, R13)                             */
/* ================================================================== */

// "a combined pool of action points, which is determined by the
// character with the lowest amount of action points between you."
eq("M1 the shared pool", [
  sharedActionPoints(3, 2), sharedActionPoints(1, 3), sharedActionPoints(3, 3), sharedActionPoints(0, 3)
], [2, 1, 3, 0]);
// "you can attack a creature with a reach of 10 feet rather than 5
// (assuming of course that your mount does not have reduced reach)."
eq("M2 the shared reach", [mountedReach(5, 10), mountedReach(10, 5), mountedReach(5, 5)], [10, 10, 5]);
// "a +2-circumstance bonus to all attack checks against unmounted targets"
eq("M3 the bonus", [
  mountedAttackBonus(true, false), mountedAttackBonus(true, true),
  mountedAttackBonus(false, false), mountedAttackBonus(false, true)
], [2, 0, 0, 0]);
// "your mount to be at least one size larger than you"
eq("M4 the size gate", [mountSizeAllowed(1), mountSizeAllowed(2), mountSizeAllowed(0), mountSizeAllowed(-1)],
  [true, true, false, false]);
// F3 (3.579.1): `sizeSteps` is what the gate is fed, and it was NOT
// exported — the ratchet could not see a dynamic import, un-exported it,
// and Mount threw on the first live click. Driven here, and the import
// is static so the ratchet keeps seeing it.
eq("M4b F3 the steps it is fed", [sizeSteps("large", "medium"), sizeSteps("medium", "medium"), sizeSteps("small", "medium")],
  [1, 0, -1]);
ok("M4c F3 and the Mount action imports it where the ratchet can see it",
  /^import \{ sizeSteps \} from "\.\/space\.mjs";$/m.test(code("module", "combat", "action-workflow.mjs"))
  && !/await import\("\.\/space\.mjs"\)/.test(code("module", "combat", "action-workflow.mjs")));
ok("M5 the defence offer names both halves", (() => {
  const text = mountedDefenceOffer({ riderName: "Tomas", mountName: "Warhorse" });
  return /target the mount instead/.test(text) && /lesser cover/.test(text);
})());
eq("M6 and says nothing without a pair", [mountedDefenceOffer({}), mountedDefenceOffer({ riderName: "Tomas" })],
  ["", ""]);
{
  const w = code("module", "combat", "attack-workflow.mjs");
  ok("M7 the attack path uses the shared reach and the shared counter",
    /const normalReach = steedActor\s*\? mountedReach\(/.test(w)
    && /const attackIndex = await sharedMapCount\(actor\);/.test(w)
    && /await setSharedMapCount\(actor, attackIndex \+ mapSteps\);/.test(w));
  ok("M8 the pool is shared at the turn's start and at every spend",
    /syncSharedAP\(actor\)/.test(code("module", "documents", "combat.mjs"))
    && /syncSharedAP\(actor, result\.newValue\)/.test(code("module", "combat", "action-points-workflow.mjs")));
  ok("M9 the mount takes the rider's initiative",
    /alignSteedInitiative\(this\)/.test(code("module", "documents", "combat.mjs"))
    && /await steedCombatant\.update\(\{ initiative: rider \}\);/.test(code("module", "combat", "mounted-workflow.mjs")));
}

/* ================================================================== */
/* N — FLANKING'S CONDITIONS (page 200; D14, R14)                      */
/* ================================================================== */

// "The flanking characters must also be threatening the same enemy,
// meaning they are capable of making melee attacks against that enemy."
eq("N1 an able ally threatens", [allyThreatens({}).threatens], [true]);
eq("N2 one that cannot act does not", [
  allyThreatens({ conditions: ["unconscious"] }).threatens,
  allyThreatens({ conditions: ["dying"] }).threatens,
  allyThreatens({ conditions: ["paralyzed"] }).threatens,
  allyThreatens({ conditions: ["stunned"] }).threatens,
  allyThreatens({ conditions: ["dead"] }).threatens
], [false, false, false, false, false]);
eq("N3 nor one fighting something else", [
  allyThreatens({ conditions: ["confused"] }).threatens,
  allyThreatens({ conditions: ["fleeing"] }).threatens
], [false, false]);
eq("N4 nor one with no melee attack", [allyThreatens({ canStrike: false }).threatens], [false]);
eq("N5 nor one beyond its own reach", [
  allyThreatens({ reachFeet: 5, distanceFeet: 10 }).threatens,
  allyThreatens({ reachFeet: 10, distanceFeet: 10 }).threatens,
  allyThreatens({ reachFeet: 0, distanceFeet: 5 }).threatens,
  allyThreatens({ reachFeet: 5, distanceFeet: null }).threatens
], [false, true, false, true]);
{
  const w = code("module", "combat", "attack-workflow.mjs");
  ok("N6 the attack path asks all four",
    /const verdict = allyThreatens\(\{[\s\S]{0,400}conditions: Array\.from\(allyActor\?\.statuses \?\? \[\]\),[\s\S]{0,400}reachFeet:[\s\S]{0,200}distanceFeet: distanceBetween\(token, targetToken\),/.test(w));
  ok("N6b and drops an ally who is not threatening",
    /if \(!verdict\.threatens\) \{[\s\S]{0,300}return null;\s*\}/.test(w));
}

/* ================================================================== */
/* O — MOVING THROUGH CREATURES (page 198; D15, R15)                   */
/* ================================================================== */

// "You may move through the occupied space of a willing ally."
eq("O1 an ally is free", [passageThrough({ ally: true }).allowed, passageThrough({ ally: true }).multiplier],
  [true, 1]);
// "If a creature is at least three sizes larger than you… freely… this
// also works in reverse."
eq("O2 three sizes apart is free", [
  passageThrough({ moverSize: "medium", occupantSize: "gargantuan" }).allowed,
  passageThrough({ moverSize: "gargantuan", occupantSize: "medium" }).allowed,
  passageThrough({ moverSize: "medium", occupantSize: "huge" }).allowed
], [true, true, false]);
// "prone and is your size or smaller… difficult terrain"; larger prone is
// "Greater difficult terrain".
eq("O3 a prone creature's square", [
  passageThrough({ moverSize: "medium", occupantSize: "small", prone: true }).multiplier,
  passageThrough({ moverSize: "medium", occupantSize: "medium", prone: true }).multiplier,
  passageThrough({ moverSize: "medium", occupantSize: "large", prone: true }).multiplier
], [2, 2, 3]);
// "you must make a Tumble (Acrobatics) check"
eq("O4 an unwilling creature needs the Tumble", [
  passageThrough({ moverSize: "medium", occupantSize: "medium" }).allowed,
  passageThrough({ moverSize: "medium", occupantSize: "medium" }).needsTumble
], [false, true]);
eq("O5 a passed Tumble reads its own degree", [
  passageThrough({ moverSize: "medium", occupantSize: "medium", tumbled: "difficult" }).multiplier,
  passageThrough({ moverSize: "medium", occupantSize: "medium", tumbled: "normal" }).multiplier
], [2, 1]);
{
  const w = code("module", "combat", "movement-workflow.mjs");
  ok("O6 the move is refused before anything is charged",
    /const space = spaceRules\(tokenDocument, movement\);\s*if \(space\.refused\) \{[\s\S]{0,140}return false;/.test(w));
  // RE-POINTED AT 3.606.0: the sum is named `surcharged`, because Spirit
  // Trap's difficult-terrain floor is applied to it on the next line.
  ok("O7 the surcharge is added to the measured cost",
    // 3.651.0: an aura's difficult ground rides the same sum.
    /const surcharged = measured \+ Math\.max\(0, Number\(space\.surcharge\) \|\| 0\)( \+ Math\.max\(0, Number\(auraLimits\.surcharge\) \|\| 0\))?;/.test(w));
  ok("O8 the Tumble marker is spent, and cleared each turn",
    /void mover\.unsetFlag\(SYSTEM_ID, TUMBLE_FLAG\);/.test(w)
    && /MOVED_FLAG, ARMED_FLAG, TUMBLE_FLAG/.test(w));
  ok("O9 the Tumble action leaves one",
    /if \(action\.key === "tumble"\) \{[\s\S]{0,400}setFlag\(SYSTEM_ID, TUMBLE_FLAG, degree === "success" \? "difficult" : "normal"\)/
      .test(code("module", "combat", "action-workflow.mjs")));
}

/* ================================================================== */
/* P — TERRAIN (page 196; D16, R16)                                    */
/* ================================================================== */

// "Moving through these areas costs x3 the usual amount of movement."
eq("P1 ×3 ground has its own name", [terrainKindLabel(2), terrainKindLabel(3), terrainKindLabel(4)],
  ["difficult terrain", "formidable terrain", "formidable terrain"]);
ok("P2 the Region and the card use it",
  /formidable terrain/.test(terrainRegionName({ multiplier: 3 }, "Brambles"))
  && /formidable terrain/.test(terrainPlacedLine({ multiplier: 3 }, "20-foot burst")));
ok("P3 and ×2 ground is still difficult",
  /difficult terrain/.test(terrainRegionName({ multiplier: 2 }, "Mud"))
  && !/formidable/.test(terrainRegionName({ multiplier: 2 }, "Mud")));
// "if you have a Fly speed, you are unhindered by difficult terrain."
ok("P4 a creature aura no longer charges fliers by default",
  /const DEFAULT_AURA_MOVEMENTS = Object\.freeze\(\["walk", "swim", "burrow"\]\);/
    .test(code("module", "creature-aura-workflow.mjs"))
  && /listed === null\s*\? \[\.\.\.DEFAULT_AURA_MOVEMENTS\]/.test(code("module", "creature-aura-workflow.mjs")));
ok("P5 unless the aura says it reaches them",
  /: listed\.filter\(\(m\) => ALL_MOVEMENTS\.includes\(String\(m\)\)\)/.test(code("module", "creature-aura-workflow.mjs")));

/* ================================================================== */
/* Q — UNUSUAL SURFACES (page 196; D17, R17)                           */
/* ================================================================== */

eq("Q1 a Region declares one, by flag or by name", [
  unusualSurfaceOf({ name: "Icy ledge (unusual surface)" })?.label,
  unusualSurfaceOf({ name: "Rocks", flags: { "trg-prime": { unusualSurface: { label: "Scree", dc: 15 } } } })?.dc,
  unusualSurfaceOf({ name: "Rocks" })
], ["Icy ledge (unusual surface)", 15, null]);
// "Whilst moving on any unusual surface, you are flat-footed."
eq("Q2 moving on one is flat-footed, and asks for Balance", [
  surfaceMovementEffect([{ label: "Ledge", dc: 18 }]).flatFooted,
  surfaceMovementEffect([{ label: "Ledge", dc: 18 }]).balance,
  surfaceMovementEffect([{ label: "Ledge", dc: 18 }, { label: "Scree", dc: 15 }]).dc,
  surfaceMovementEffect([{ label: "Ledge", dc: 18 }, { label: "Scree", dc: null }]).dc,
  surfaceMovementEffect([]).flatFooted,
  surfaceMovementEffect([{ label: "Ledge" }], false).flatFooted
], [true, true, 18, 18, false, false]);
// "if you are struck by an attack while on such a surface, the GM may
// require you to make a similar check"
ok("Q3 being struck on one is offered, not rolled", (() => {
  const note = struckOnSurfaceNote({ defenderName: "Nomira", labels: ["a narrow ledge"], dc: 18 });
  return /the GM may call/.test(note) && /Balance \(Acrobatics\)/.test(note);
})());
eq("Q4 and says nothing when there is no surface",
  [struckOnSurfaceNote({ defenderName: "Nomira", labels: [] }), struckOnSurfaceNote({ labels: ["Ledge"] })], ["", ""]);
ok("Q5 the movement hook applies it",
  /applySurfaceEffects\(mover, surfacesOnPath\(movement\)\)/.test(code("module", "combat", "movement-workflow.mjs")));
ok("Q6 and the attack card offers the check",
  /struckOnSurfaceNote\(\{/.test(code("module", "combat", "attack-workflow.mjs")));

/* ── THE LIVE-TEST FIXES (3.579.1) ───────────────────────────────── */

// F4: `RegionDocument#testPoint` answers FALSE for a point inside the
// shape, and the placeable answers true. The first version asked the
// document and fell back with `??`, which never fires on `false` — so no
// surface was ever detected and the whole of R17 was inert.
{
  const inside = { x: 120, y: 120 };
  const doc = {
    name: "Ledge (unusual surface)",
    testPoint: () => false,                       // the document, wrong
    object: { testPoint: (p) => p.x > 100 }       // the placeable, right
  };
  eq("Q7 F4 the placeable is asked first",
    [regionContains(doc, inside), regionContains(doc, { x: 10, y: 10 })], [true, false]);
  eq("Q7b and the document only when there is no placeable",
    [regionContains({ testPoint: () => true }, inside), regionContains({}, inside)], [true, false]);
}
// F4: and standing on one is the Region's own token set, which Foundry
// keeps as tokens move — no geometry to get wrong.
{
  const token = { id: "t1" };
  const scene = { regions: [
    { name: "Ledge (unusual surface)", tokens: new Set([token]), testPoint: () => false },
    { name: "Scree (unusual surface)", tokens: new Set(), testPoint: () => false }
  ] };
  eq("Q8 F4 the defender's surfaces come from the region's token set",
    surfacesUnder(scene, token).map((s) => s.label), ["Ledge (unusual surface)"]);
  eq("Q8b and a plain Region is not one",
    surfacesUnder({ regions: [{ name: "Mud", tokens: new Set([token]) }] }, token), []);
}
ok("Q9 F4 neither caller asks the document first",
  !/region\.testPoint\?\.\(/.test(code("module", "combat", "movement-workflow.mjs"))
  && !/region\.testPoint\?\.\(/.test(code("module", "combat", "attack-workflow.mjs")));

/* ================================================================== */
/* R — EXHAUSTION AND THE RECURRING LEVER (page 195/193; D18, R18)     */
/* ================================================================== */

// "ACP/Encumbrance penalty — varies"
eq("R1 the load penalty", [
  exhaustionLoadPenalty({ acp: 3, encumbranceSteps: 2 }),
  exhaustionLoadPenalty({ acp: 3 }),
  exhaustionLoadPenalty({ encumbranceSteps: 2 }),
  exhaustionLoadPenalty({}),
  exhaustionLoadPenalty({ acp: -3 })
], [-5, -3, -2, 0, -3]);
eq("R2 Fortitude is the printed default, Will the GM's option",
  [exhaustionSave(""), exhaustionSave("fortitude"), exhaustionSave("will"), exhaustionSave("WILL")],
  ["fortitude", "fortitude", "will", "will"]);
{
  const w = code("module", "combat", "exhaustion-workflow.mjs");
  ok("R3 the check reads both, automatically",
    /const load = exhaustionLoadPenalty\(\{[\s\S]{0,400}acp: Number\(actor\.system\?\.combat\?\.acp\?\.total \?\? 0\),/.test(w)
    && /if \(load\) \{\s*modifiers\.push\(\{ label: "ACP \/ Encumbrance", value: load, type: "untyped" \}\);/.test(w));
  ok("R4 and the prompt offers the save", /<option value="will">Will \(GM's call\)<\/option>/.test(w));
  ok("R5 the save chosen is the one rolled", /const saveKey = exhaustionSave\(save\);/.test(w));
}
// "The GM may rule that an action taken against it… lowers the flat check DC."
{
  const c = code("module", "documents", "combat.mjs");
  ok("R6 recurring damage has bleeding's lever",
    /recurringFlatCheckReduction/.test(c) && /const recurringDC = Math\.max\(1, RECURRING_FLAT_CHECK_DC - recurringEasier\);/.test(c));
  const mgr = code("module", "conditions", "manager.mjs");
  ok("R7 and the dialog can set it, on both conditions",
    /const reductionRow = \["bleeding", "recurring"\]\.includes\(id\)/.test(mgr)
    && /name="flatCheckReduction"/.test(mgr)
    && /recurringFlatCheckReduction/.test(mgr));
}

/* ================================================================== */
/* S — THE BOMB CARD'S FLAT CHECK (D20)                                */
/* ================================================================== */

eq("S1 the engine's DC", [RECURRING_FLAT_CHECK_DC], [16]);
ok("S2 the bomb card quotes it rather than a number of its own",
  /until a DC \$\{RECURRING_FLAT_CHECK_DC\} flat check ends it/.test(read("module", "alchemical-workflow.mjs")));
ok("S3 and no card says DC 15", !/DC 15 flat check/.test(read("module", "alchemical-workflow.mjs")));

/* ================================================================== */

if (failures) {
  console.error(`verify-chapter7-combat-191-200: FAILED — ${failures} of ${checks}`);
  process.exit(1);
}
console.log(`verify-chapter7-combat-191-200: OK — ${checks} checks. Pages 191-200: attacks, injuries, space, mounts.`);
