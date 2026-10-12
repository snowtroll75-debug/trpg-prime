#!/usr/bin/env node
/**
 * verify-chapter10-331-340 — block 33 (pages 331–340, Sympathy to Warp
 * Mind) and Graham's rulings of 1 October 2026.
 *
 * NEW at 3.609.0.
 *
 *   E  the two questions left open: critical recurring by table, Heroic at
 *      a printed Critical
 *   L  the ladder: double, basic criticals, a rung's recurring rider, heat
 *      regardless of saves, the warps that never reached their pool
 *   K  living creatures; undead and oozes
 *   X  an encasement an Escape breaks
 *   F  the second save
 *   T  Turn Undead's save at the start of a turn
 *   A  Visage Of Horror and Painful Rebuke at the attack gate
 *   S  True Strike and True Target's edge
 *   M  Vampiric Touch, Trade Essence, Vigour
 *   Z  Tangling Creepers' zone, Untamed Journey, Transmute's modes
 *   P  the pack, the plan and the manifest
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { typeRecurringTags } from "../module/combat/critical-riders.mjs";
import { effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import {
  DEGREE_ORDER, ladderRungAmount, normaliseRecurringLadder, normaliseSaveLadder, saveLadderOutcome
} from "../module/magic/save-ladder.mjs";
import { kindGateResult, LIVING_KIND } from "../module/kind-targeting.mjs";
import { damageScope, inDamageScope } from "../module/magic/damage-scope.mjs";
import { ESCAPE_DC_FLAG, escapableEffects, escapeDCFor, escapeFrees } from "../module/magic/encase.mjs";
import { followUpOutcome, normaliseFollowUpSave } from "../module/magic/follow-up-save.mjs";
import {
  normaliseTurnSave, spellSavesOnTurnStart, steppedSeverity, turnSaveOutcome, turnSaveReaches, turnSaveRecord
} from "../module/magic/turn-save.mjs";
import {
  HORROR, horrorMemoryAfter, horrorMustSave, horrorOutcome, normaliseRebuke, rebukesAgainst
} from "../module/magic/aggression-wards.mjs";
import { STRIKE_EDGE_FLAG, strikeEdgeFrom, withoutCircumstancePenalties } from "../module/magic/strike-edge.mjs";
import {
  essenceTradeAmount, essenceTradeCap, normaliseEssenceTrade, normaliseSiphon, normaliseTurnHeal,
  siphonAmount, siphonExpires, siphonedPool, turnHealed
} from "../module/magic/life-transfer.mjs";
import { zoneEffectParts, zoneIsPlaced } from "../module/magic/obscuring-zone.mjs";
import { aggregateWarpSelection, mergeWarpSelections } from "../module/magic/spell-warp.mjs";
import { normaliseTempImmunity } from "../module/magic/temp-immunity-row.mjs";
import { spellDefersItsSave } from "../module/magic/sanctuary.mjs";
import { SELF_REPORTING_KINDS } from "../module/magic/cast-result-line.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";
import { DAMAGE_TYPES } from "../module/config.mjs";
import { PLAN, plannedFields } from "./block33-plan.mjs";

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
const actionWf = src("module", "combat", "action-workflow.mjs");
const gate = src("module", "combat", "sanctuary-gate.mjs");
const combat = src("module", "documents", "combat.mjs");
const effectApp = src("module", "combat", "effect-application-workflow.mjs");
const emanFx = src("module", "magic", "emanation-effects.mjs");
const recurringWf = src("module", "magic", "recurring-ladder-workflow.mjs");

/* ================================================================== *
 * E. The two questions left open
 * ================================================================== */
{
  const tags = [{ key: "recurring", label: "Recurring Damage", value: 3 }, { key: "stunned", value: 1 }];
  const typed = typeRecurringTags(tags, "electricity", DAMAGE_TYPES);
  ok("E1 an Electricity critical's recurring is electricity", typed[0].damageType === "electricity");
  ok("E1b the other tags are untouched", deepEqual(typed[1], tags[1]));
  ok("E1c a recurring that names its type keeps it",
    typeRecurringTags([{ key: "recurring", value: 1, damageType: "acid" }], "fire", DAMAGE_TYPES)[0].damageType === "acid");
  ok("E1d a table that is no damage type leaves the tag alone",
    typeRecurringTags(tags, "nonsense", DAMAGE_TYPES)[0].damageType === undefined);
  ok("E1e both the target's tags and a backfire's are typed",
    (attackWf.match(/typeRecurringTags\(/g) ?? []).length === 2 && /const tableKey = CRITICAL_TABLES\[damageType\] \? damageType : "slashing";/.test(attackWf));

  const rows = [{ onSave: ["critical"] }, { onSave: ["success"] }, { onSave: ["failure"] }];
  ok("E2 a Heroic reads at a printed Critical", effectiveSaveDegree(rows, "heroic") === "critical");
  ok("E2b a spell that prints no Critical lets a Heroic escape",
    effectiveSaveDegree([{ onSave: ["failure"] }], "heroic") === "heroic");
  ok("E2c a spell that prints Heroic keeps it", effectiveSaveDegree([{ onSave: ["heroic"] }, { onSave: ["critical"] }], "heroic") === "heroic");
  ok("E2d a Critical is still a Critical", effectiveSaveDegree(rows, "critical") === "critical");
}

/* ================================================================== *
 * L. The ladder
 * ================================================================== */
{
  const wail = normaliseSaveLadder(PLAN["Wail Of The Banshee"].effects[0]);
  const read = (d) => saveLadderOutcome(wail, d);
  const share = (d) => ladderRungAmount(read(d), { shared: 21 }).fixed;
  ok("L1 Wail's ladder parses", Boolean(wail));
  ok("L1b Heroic: nothing", read("heroic").harmless === true);
  ok("L1c Critical: half (floored)", share("critical") === 10);
  ok("L1d Success: full", share("success") === 21 && read("success").severity === null);
  ok("L1e Failure: full and a serious critical", share("failure") === 21 && read("failure").severity === "serious");
  ok("L1f Fumble: double and a deadly critical", share("fumble") === 42 && read("fumble").severity === "deadly");
  ok("L1g Blunder: dies", read("blunder").slays === true);
  ok("L1h a Partial reads at the Failure", read("partial").rung === "failure");

  const volcano = normaliseSaveLadder(PLAN["Volcanic Inferno"].effects[0]);
  ok("L2 Volcanic Inferno: half, full, full and a minor critical",
    ladderRungAmount(saveLadderOutcome(volcano, "success"), { shared: 9 }).fixed === 4
    && saveLadderOutcome(volcano, "fumble").severity === "minor"
    && saveLadderOutcome(volcano, "critical").harmless === true);
  ok("L2b the heat regardless of saves, out to 5 feet",
    deepEqual(volcano.regardless, { formula: "3d6", type: "fire", reachFeet: 5 }));
  ok("L2c a malformed heat is refused", normaliseSaveLadder({ kind: "saveLadder", ladder: { failure: "1d6" }, regardless: { formula: "lots", type: "fire" } }).regardless === null);

  const portal = normaliseRecurringLadder(PLAN["Portal Maelstrom"].effects[0].recurring);
  ok("L3 Portal Maelstrom's turn ladder reads its criticals as a Basic save's", portal?.basicCriticals === true);
  ok("L3b the severity comes from the roll, not the rung",
    saveLadderOutcome(portal, "failure", { basicSeverity: "serious" }).severity === "serious"
    && saveLadderOutcome(portal, "failure", { basicSeverity: null }).severity === null);
  ok("L3c a ladder that does not ask ignores it",
    saveLadderOutcome(wail, "success", { basicSeverity: "deadly" }).severity === null);
  ok("L3d the turn sweep hands it the margin's severity",
    /basicSeverity: spec\.basicCriticals \? basicSavingThrow\(rolled, check\?\.outcome\?\.margin \?\? null\)\.criticalSeverity : null/.test(recurringWf));
  ok("L3e and so does the cast", /basicSeverity: saveLadder\.basicCriticals \? basicSavingThrow\(degreeKey, margin\)\.criticalSeverity : null/.test(cast));

  const incand = normaliseSaveLadder(PLAN["Incandescence"].effects[0]);
  ok("L4 Incandescence: no recurring on a Success", saveLadderOutcome(incand, "success").persistent === 0);
  ok("L4b full on a Failure, double on a Fumble",
    saveLadderOutcome(incand, "failure").persistent === 1 && saveLadderOutcome(incand, "fumble").persistent === 2);
  ok("L4c a rung with only a recurring rider is not harmless",
    saveLadderOutcome(normaliseSaveLadder({ kind: "saveLadder", ladder: { failure: "" }, persistentOn: { failure: 1 } }), "failure").harmless === false);
  ok("L4d the save path rolls the rung's rider and multiplies it",
    /const rungPersistAmount = Math\.floor\(rungPersistRoll\.total \* outcome\.persistent\);/.test(cast));

  const warps = (rows, i, times = 1) => aggregateWarpSelection(rows, { [`warp-${i}`]: times }).mods;
  ok("L5 Incandescence's warp grows the recurring by a die",
    warps(PLAN["Incandescence"].warps, 0).persistentDice === "1d4");
  ok("L5b Umbral Blast's warp reaches the essence pool", warps(PLAN["Umbral Blast"].warps, 0).secondaryDice === "1d4");
  ok("L5c and Meteor Swarm's twice over", warps(PLAN["Meteor Swarm"].warps, 0, 2).secondaryDice === "4d6");
  ok("L5d Phantasmal Killer's warp names its rungs",
    deepEqual(warps(PLAN["Phantasmal Killer"].warps, 0, 2).rungDice, { failure: "2d6", fumble: "4d6" }));
  ok("L5e a second pass adds", mergeWarpSelections(
    aggregateWarpSelection(PLAN["Umbral Blast"].warps, { "warp-0": 1 }),
    aggregateWarpSelection(PLAN["Umbral Blast"].warps, { "warp-0": 1 })).mods.secondaryDice === "2d4");
  ok("L5f the second pool rolls its warp", /const secondaryFormula = addDice\(secondary\.formula, warpMods\?\.secondaryDice\);/.test(cast));
  ok("L5g the rung rolls its own", /new Roll\(addDice\(rungAmount\.formula, warpMods\?\.rungDice\?\.\[outcome\.rung\]\)\)/.test(cast));
  ok("L5h Vital Beacon's bleed-stopping warp reaches the beacon",
    /stopsBleeding: Boolean\(effect\.stopsBleeding \|\| warpMods\?\.stopsBleeding\)/.test(applier)
    && warps(PLAN["Vital Beacon"].warps, 1).stopsBleeding === true);
  ok("L5i Voice Of Healing's warp heals 1d6+6",
    warps(PLAN["Voice Of Healing"].warps, 1).healDice === "1d6" && warps(PLAN["Voice Of Healing"].warps, 1).healBonus === 6);
  ok("L5j Turn Undead's warp raises the level", warps(PLAN["Turn Undead"].warps, 0, 2).levelBump === 2);

  ok("L6 who takes a critical is kept on the result", (cast.match(/results\[results\.length - 1\]\.critical = true;/g) ?? []).length === 2);
  ok("L6b the heat is measured beyond the template",
    /feetFromPointToToken\(origin, tok\) <= Number\(areaConfig\.distance\) \+ reach/.test(cast));
}

/* ================================================================== *
 * K. Kinds
 * ================================================================== */
{
  ok("K1 a humanoid is living", kindGateResult({}, { details: { creatureType: "Humanoid" } }, LIVING_KIND).allowed === true);
  ok("K1b an undead is not", kindGateResult({}, { details: { creatureType: "Undead" } }, LIVING_KIND).allowed === false);
  ok("K1c nor a construct", kindGateResult({}, { details: { traits: "Construct, Large" } }, LIVING_KIND).allowed === false);
  ok("K1d a character with no type recorded is", kindGateResult({}, {}, LIVING_KIND).allowed === true);
  const scope = damageScope({ damageScope: PLAN["Wall Of Light"].damageScope });
  ok("K2 Wall Of Light reaches undead", inDamageScope(scope, { details: { creatureType: "Undead" } }));
  ok("K2b and oozes", inDamageScope(scope, { details: { creatureType: "Ooze" } }));
  ok("K2c and nobody else", !inDamageScope(scope, { details: { creatureType: "Humanoid" } }));
  ok("K2d an empty kinds scope is no scope", damageScope({ damageScope: "kinds:" }) === null);
  ok("K3 Wall Of Light deals essence", PLAN["Wall Of Light"].damage.type === "essence" && Boolean(DAMAGE_TYPES.essence));
}

/* ================================================================== *
 * X. Encasement
 * ================================================================== */
{
  const fx = [
    { id: "a", flags: { "trg-prime": { [ESCAPE_DC_FLAG]: 19, escapeFrom: "Volcanic Inferno" } } },
    { id: "b", flags: { "trg-prime": { [ESCAPE_DC_FLAG]: 22, escapeFrom: "Volcanic Inferno" } } },
    { id: "c", flags: { "trg-prime": {} } },
    { id: "d", disabled: true, flags: { "trg-prime": { [ESCAPE_DC_FLAG]: 30 } } }
  ];
  const held = escapableEffects(fx);
  ok("X1 the held effects are found", held.map((h) => h.id).join() === "a,b");
  ok("X1b the Escape is against the highest DC", escapeDCFor(held) === 22);
  ok("X1c nothing held, no DC", escapeDCFor([]) === null);
  ok("X2 a Success breaks free, a Failure does not", escapeFrees("success") && escapeFrees("critical") && !escapeFrees("failure"));
  ok("X3 the Escape reads the hold's DC", /if \(action\.key === "escape" && escapeHoldDC !== null\) \{\n\s+resolved\.dc = escapeHoldDC;/.test(actionWf));
  ok("X3b and a success clears it", /if \(escapeHolds\.length && escapeFrees\(degree\)\) \{/.test(actionWf));
  ok("X4 only what this cast applied is stamped",
    /\.filter\(\(a\) => a && !a\.immune && !a\.wasAlreadyPresent\)/.test(applier));
  const rows = PLAN["Volcanic Inferno"].effects.filter((e) => e.escape);
  ok("X5 the rock is slowed 1 and -10 ft, both escapable",
    rows.some((r) => r.condition === "slowed" && r.value === 1) && rows.some((r) => r.slot === "allSpeeds" && r.value === -10));
}

/* ================================================================== *
 * F. The second save
 * ================================================================== */
{
  const umbral = normaliseFollowUpSave(PLAN["Umbral Blast"].effects[0]);
  ok("F1 Umbral Blast's second save is owed by a critical", umbral?.trigger === "critical" && umbral.save === "fortitude");
  ok("F1b a Success escapes", followUpOutcome(umbral, "success").rows.length === 0);
  ok("F1c a Failure blinds a round per point", followUpOutcome(umbral, "failure").rows[0]?.roundsPerMargin === 1);
  ok("F1d a Fumble blinds for good", followUpOutcome(umbral, "fumble").rows[0]?.duration === "permanent");
  ok("F1e a Blunder reads at the Fumble", followUpOutcome(umbral, "blunder").rung === "fumble");
  const pk = normaliseFollowUpSave(PLAN["Phantasmal Killer"].effects.find((e) => e.kind === "followUpSave"));
  ok("F2 Phantasmal Killer: failing the Fortitude save kills", followUpOutcome(pk, "failure").slays === true);
  ok("F2b passing it does not", followUpOutcome(pk, "success").slays === false);
  const havoc = normaliseFollowUpSave(PLAN["Vision Of Havoc"].effects[0]);
  ok("F3 Vision Of Havoc: a failed Reflex stuns, with a Will save each turn",
    followUpOutcome(havoc, "failure").rows[0]?.conditionSave?.save === "will");
  ok("F4 a malformed second save is refused", normaliseFollowUpSave({ kind: "followUpSave", save: "luck", rungs: { failure: [] } }) === null);
  ok("F5 a critical-triggered row reaches those the save marked",
    /effect\.kind === "followUpSave" && effect\.trigger === "critical"\n\s+\? ladderResults\.filter\(\(r\) => r\?\.critical\)/.test(applier));
  ok("F5b the rung is applied with the SECOND save's margin",
    /margin: followCheck\?\.outcome\?\.margin \?\? null,/.test(applier));
  ok("F6 the kinds are declared", ["followUpSave", "turnSave", "horror", "rebuke", "siphon", "essenceTrade",
    "turnHeal", "terrainFreedom", "wake", "timeStop", "lash"].every((k) => HANDLED_EFFECT_KINDS.includes(k)));
  ok("F6b a critical-triggered save that finds nobody says nothing",
    SELF_REPORTING_KINDS.includes("followUpSave") && SELF_REPORTING_KINDS.includes("turnSave"));
}

/* ================================================================== *
 * T. Turn Undead
 * ================================================================== */
{
  const row = PLAN["Turn Undead"].effects[0];
  const spec = normaliseTurnSave(row);
  const rec = turnSaveRecord(spec, { levelBump: 1, casterLevel: 9, kindGate: "undead" });
  ok("T1 the ceiling is level 1, raised by the warp", spec.maxLevel === 1 && rec.maxLevel === 2);
  ok("T1b a level-2 undead is turned with the warp", turnSaveReaches(rec, 2) && !turnSaveReaches(rec, 3));
  ok("T2 Critical: nothing", turnSaveOutcome(rec, "critical").rows.length === 0);
  ok("T2b Heroic reads at the Critical", turnSaveOutcome(rec, "heroic").rung === "critical");
  ok("T2c Success: stunned 1, past an immunity",
    turnSaveOutcome(rec, "success").rows[0]?.condition === "stunned" && turnSaveOutcome(rec, "success").rows[0]?.ignoreImmunity === true);
  ok("T2d Failure: fleeing", turnSaveOutcome(rec, "failure").rows[0]?.condition === "fleeing");
  ok("T2e Fumble: fleeing and an essence critical", turnSaveOutcome(rec, "fumble").critical?.damageType === "essence");
  ok("T3 the critical climbs a step per 4 levels", steppedSeverity("minor", { casterLevel: 9, level: 1, stepLevels: 4 }) === "deadly"
    && steppedSeverity("minor", { casterLevel: 4, level: 1, stepLevels: 4 }) === "minor"
    && steppedSeverity("minor", { casterLevel: 5, level: 1, stepLevels: 4 }) === "serious");
  ok("T3b and never past deadly", steppedSeverity("serious", { casterLevel: 30, level: 0, stepLevels: 4 }) === "deadly");
  ok("T4 the cast rolls nothing", spellSavesOnTurnStart(PLAN["Turn Undead"].effects));
  ok("T4b nor does a ladder owed only at the start of a turn", spellSavesOnTurnStart(PLAN["Portal Maelstrom"].effects));
  ok("T4c a ladder rolled at the cast still rolls", !spellSavesOnTurnStart(PLAN["Wail Of The Banshee"].effects));
  ok("T4d the save branch asks", /&& !spellSavesOnTurnStart\(spellData\.effects\)\) \{/.test(cast));
  ok("T5 the circle is recorded", emanationIsLive({ area: "30-foot emanation", effects: PLAN["Turn Undead"].effects })
  && !emanationIsLive({ area: "30-foot emanation", effects: [] }));
  ok("T5b and the turn clock asks", /applyTurnSaves\(actor, combatant\.token\?\.object \?\? null\)/.test(combat));
  ok("T6 an immunity can be passed by a tag that says so",
    /const immune = !tag\.ignoreImmunity && \(/.test(effectApp) && /\.\.\.\(tag\.ignoreImmunity \? \{ force: true \} : \{\}\)/.test(effectApp));
}

/* ================================================================== *
 * A. The attack gate
 * ================================================================== */
{
  ok("A1 Success passes, Failure frightens, Fumble wastes",
    horrorOutcome("success") === HORROR.PASSED && horrorOutcome("failure") === HORROR.FRIGHTENED
    && horrorOutcome("fumble") === HORROR.WASTED && horrorOutcome("heroic") === HORROR.PASSED);
  ok("A1b a Partial frightens", horrorOutcome("partial") === HORROR.FRIGHTENED);
  const mem = horrorMemoryAfter({}, "x", 3);
  ok("A2 immune through its next turn", !horrorMustSave(mem, "x", 3) && !horrorMustSave(mem, "x", 4) && horrorMustSave(mem, "x", 5));
  ok("A2b another opponent still saves", horrorMustSave(mem, "y", 3));
  ok("A2c outside combat every move asks", horrorMustSave(horrorMemoryAfter({}, "x", null), "x", null));
  ok("A3 the visage defers its save", spellDefersItsSave(PLAN["Visage Of Horror"].effects));
  ok("A3b the gate asks after Sanctuary", /const horror = await horrorCheck\(attacker, targetActor, sourceName\);/.test(gate));
  const reb = normaliseRebuke({ casterUuid: "C", formula: "2d6", type: "mental", once: true });
  ok("A4 a rebuke parses", reb?.once === true && reb.formula === "2d6");
  ok("A4b it bites only on its caster",
    rebukesAgainst([{ spec: { casterUuid: "C", formula: "2d6", type: "mental" } }], "C").length === 1
    && rebukesAgainst([{ spec: { casterUuid: "C", formula: "2d6", type: "mental" } }], "D").length === 0);
  ok("A4c a malformed rebuke is refused", normaliseRebuke({ casterUuid: "C", formula: "lots", type: "mental" }) === null);
  ok("A5 the gate rebukes when the attack is not blocked", /if \(!horror\.blocked\) await rebukeCheck\(attacker, targetActor, sourceName\);/.test(gate));
  ok("A5b a spent rebuke ends", /if \(spec\.once\) \{\n\s+await effect\.delete\(\);/.test(gate));
}

/* ================================================================== *
 * S. The edge
 * ================================================================== */
{
  const fx = [{ flags: { "trg-prime": { [STRIKE_EDGE_FLAG]: { ignoreCircumstance: true, ignoreConcealment: true, targetUuid: "T", label: "True Target" } } } }];
  ok("S1 an edge against one foe applies to it", strikeEdgeFrom(fx, "T")?.ignoreConcealment === true);
  ok("S1b and to nobody else", strikeEdgeFrom(fx, "U") === null);
  ok("S1c an edge naming nobody applies to anyone",
    strikeEdgeFrom([{ flags: { "trg-prime": { [STRIKE_EDGE_FLAG]: { ignoreCircumstance: true } } } }], "U")?.ignoreCircumstance === true);
  const { kept, removed } = withoutCircumstancePenalties([
    { label: "Unsteady", value: -2, type: "circumstance" }, { label: "Aid", value: 2, type: "circumstance" },
    { label: "Frightened", value: -1, type: "status" }]);
  ok("S2 only circumstance penalties go", removed.length === 1 && kept.length === 2);
  ok("S3 the attack skips the miss chance when it holds one",
    /if \(targetActor && !strikeEdge\?\.ignoreConcealment\) \{/.test(attackWf));
  ok("S3b and drops the penalties before the roll", /modifiers\.splice\(0, modifiers\.length, \.\.\.kept\);/.test(attackWf));
  ok("S4 True Target is narrowed to the chosen foe",
    /for \(const g of granted\) g\.when = \{ \.\.\.\(g\.when \?\? \{\}\), targetUuids: \[edgeAgainst\] \};/.test(applier));
  const tt = PLAN["True Target"].effects[0];
  ok("S4b its advantage is spent on the first attack", tt.grants[0].oneShot === true && tt.againstChosenFoe === true);
}

/* ================================================================== *
 * M. Life and power
 * ================================================================== */
{
  const sip = normaliseSiphon(PLAN["Vampiric Touch"].effects[0]);
  ok("M1 Vampiric Touch keeps half", sip?.share === 0.5 && siphonAmount(13, sip.share) === 6);
  ok("M1b the larger pool stands", siphonedPool(9, 6) === 9 && siphonedPool(2, 6) === 6);
  ok("M1c the minute takes only its own pool", siphonExpires(6, 6) && !siphonExpires(10, 6) && !siphonExpires(0, 6));
  ok("M1d the save path counts what each creature took",
    /if \(siphonRow\) siphonTotal \+= siphonAmount\(packet\.taken \+ \(secondPacket\?\.taken \?\? 0\), siphonRow\.share\);/.test(cast));
  const trade = normaliseEssenceTrade(PLAN["Trade Essence"].effects[0]);
  ok("M2 2 PP per caster level, +1 per warp", essenceTradeCap(trade, 5) === 10 && essenceTradeCap(trade, 5, 1) === 15);
  ok("M2b the donor cannot go below 0",
    essenceTradeAmount(10, { cap: 10, donorPP: 4, recipientPP: 0, recipientMax: 20 }).amount === 4);
  ok("M2c nor the recipient past its maximum",
    essenceTradeAmount(10, { cap: 10, donorPP: 20, recipientPP: 18, recipientMax: 20 }).amount === 2);
  ok("M2d nor the caster past the limit",
    essenceTradeAmount(30, { cap: 10, donorPP: 40, recipientPP: 0, recipientMax: 40 }).limitedBy === "the caster's limit");
  const heal = normaliseTurnHeal(PLAN["Vigour"].effects[0], 1);
  ok("M3 Vigour heals 2, 3 warped", normaliseTurnHeal(PLAN["Vigour"].effects[0]).amount === 2 && heal.amount === 3);
  ok("M3b never past maximum", turnHealed(heal, 9, 10) === 1 && turnHealed(heal, 10, 10) === 0);
  ok("M3c at the end of the turn", /const healLines = await applyTurnHeals\(actor\);/.test(combat));
}

/* ================================================================== *
 * Z. Zones, freedom, modes and the smaller ones
 * ================================================================== */
{
  const parts = zoneEffectParts(PLAN["Tangling Creepers"].effects, "c1");
  ok("Z1 the creepers lay -10 ft and no condition", parts?.flag?.speedPenalty === -10 && parts.statuses.length === 0);
  ok("Z1b the creepers are placed, not carried", zoneIsPlaced({ area: "40-foot burst", effects: PLAN["Tangling Creepers"].effects }));
  ok("Z1c the penalty lands on the creature's own speeds, unless it is free",
    /if \(penalty < 0 && !immune\) \{/.test(emanFx));
  ok("Z2 Untamed Journey frees the creature", /ignoresDifficultTerrain: true, \[ENVIRONMENT_SPEED_IMMUNE_FLAG\]: true/.test(applier));
  const modes = PLAN["Transmute Rock & Mud"].apOptions;
  ok("Z3 two modes, both 3 AP", modes.length === 2 && modes.every((m) => m.ap === 3));
  ok("Z3b Mud to Rock saves Reflex or Acrobatics", modes[0].defence === "Reflex" && modes[0].saveAlternative === "acrobatics");
  ok("Z3c Rock to Mud saves nothing", modes[1].defence === "");
  ok("Z3d the cast honours a mode's save", /const effDefence = apMode && Object\.prototype\.hasOwnProperty\.call\(apMode, "defence"\)/.test(cast));
  ok("Z3e the better of the two is rolled", /const altBetter = altSkill && Number\(altSkill\.total \?\? -Infinity\) > Number\(save\?\.total \?\? 0\);/.test(cast));
  ok("Z4 Wake does not raise the fallen", /\} else if \(hp <= 0 \|\| dying\) \{/.test(applier));
  ok("Z5 Time Stop's roll is whispered to the GM", /whisper: gmIds, blind: true/.test(applier));
  ok("Z6 a month is thirty days", normaliseTempImmunity({ kind: "tempImmunity", length: "1 month" })?.seconds === 30 * 86400);
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
ok("P2 Wail is still a Fortitude save on 8d10 essence",
  /^fortitude$/i.test(String(pack.get("Wail Of The Banshee")?.defence ?? "").trim()) && pack.get("Wail Of The Banshee")?.damage?.formula === "8d10");
ok("P2b Volcanic Inferno still rolls 14d6 fire on a Reflex", pack.get("Volcanic Inferno")?.damage?.formula === "14d6"
  && /^reflex$/i.test(String(pack.get("Volcanic Inferno")?.defence ?? "").trim()));
ok("P2c Turn Undead is still keyed at undead and sustained",
  pack.get("Turn Undead")?.kindGate === "undead" && pack.get("Turn Undead")?.sustained === true);
ok("P2d Vampiric Touch is still a Basic Fortitude", /basic fortitude/i.test(pack.get("Vampiric Touch")?.defence ?? ""));
ok("P2e Umbral Blast still carries its essence pool", pack.get("Umbral Blast")?.secondaryDamage?.formula === "8d4");
ok("P2f every ladder in the plan parses", Object.values(PLAN).flatMap((f) => (f.effects ?? []))
  .filter((e) => e.kind === "saveLadder").every((e) => normaliseSaveLadder(e) || normaliseRecurringLadder(e.recurring)));
{
  const { PACK_REPAIRS } = await import("../module/data/pack-repairs.mjs");
  for (const [name, fields] of Object.entries(plannedFields())) {
    for (const field of fields) {
      const entries = PACK_REPAIRS.filter((r) => r.name === name && r.field === field);
      // 3.609.1 re-dated Vision Of Havoc's effects (the held stun, F4 of the
      // live test); every other entry is still 3.609.0's.
      const since = name === "Vision Of Havoc" && field === "effects" ? "3.609.1" : "3.609.0";
      ok(`P3 ${name}.${field} has one ${since} pack-repair entry`, entries.length === 1 && entries[0].since === since);
      ok(`P3b and its \`to\` is the plan`, deepEqual(entries[0]?.to, PLAN[name][field]));
    }
  }
}
ok("P4 the degree names are the system's", DEGREE_ORDER.length === 7);

if (failures.length) {
  console.log(`verify-chapter10-331-340: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-chapter10-331-340: OK — ${checks} checks. A wail, a volcano, a turning, a second save, `
  + "a horror, an edge, a siphon and a vine — each read where the book prints it.");
