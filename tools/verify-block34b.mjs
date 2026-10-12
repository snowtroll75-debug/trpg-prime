#!/usr/bin/env node
/**
 * verify-block34b — block 34, part two (3.612.0), and the 3.611.1 drive's
 * two findings.
 *
 * NEW at 3.612.0. The audit is claude/audit-pages-341-350.md; the drive is
 * claude/live-testing-report-3.611.1.md.
 *
 *   A  F1  a temporary immunity keeps the spell off: no save, no rows
 *   B  G1  a creature the cap spared is not "not chosen by the caster"
 *   C  R4  Fateful Temptation's shift and bonus; Lucky Break's reroll
 *   D  R6  Web's check on moving through it
 *   E  R8  False Arrogance's penalty after a failure
 *   F  R8  Inspire Heroics' advantage, once a round, in the composition
 *   G      the pack, the repairs and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { DEGREES, buildOutcome } from "../module/dice/resolution.mjs";
import { applyDegreeShift, degreeShiftLine } from "../module/dice/degree-shift.mjs";
import { spellImmunityKeys, immunityStillRunning, immuneRefusedLine } from "../module/magic/temp-immunity-row.mjs";
import {
  FATEFUL_TEMPTATION, LUCKY_BREAK, FATEFUL_RANGE_FEET, LUCKY_BREAK_IMMUNITY_SECONDS, isNamedSpell,
  luckyBreakTriggers, fatefulBonus, fatefulModifier, reactionCasterEligible, fatefulLine, luckyBreakLine
} from "../module/magic/save-reaction-spells.mjs";
import {
  ENTRY_CHECK_FLAG, normaliseEntryCheck, entryCheckSkill, entryCheckOutcome, entryCheckCalled, entryTurnKey, entryCheckLine
} from "../module/magic/entry-check.mjs";
import {
  ARROGANCE_PENALTY_FLAG, arroganceTriggers, nextArrogancePenalty, arroganceWindow, arroganceLine
} from "../module/magic/false-arrogance.mjs";
import {
  HELD_SPENT_ROUND_FLAG, normaliseHeldBonus, heldRoundKey, heldBonusSpentThisRound, heldBonusMatches, heldBonusButtonLabel
} from "../module/magic/held-bonus.mjs";
import { effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import { aggregateWarpSelection, warpedEmanationEffects } from "../module/magic/spell-warp.mjs";
import { LIVE_EMANATION_EFFECT_KINDS, emanationIsLive } from "../module/magic/emanation.mjs";
import { emanationEffectData } from "../module/magic/emanation-effects.mjs";
import { MARKERS } from "../module/magic/markers.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { TRG_SCHEMA_VERSION } from "../module/migration.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";
import { PLAN } from "./block34b-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const KEYS = DEGREES.map((d) => d.key);
const CAST = read("module", "magic", "cast-workflow.mjs");
const CHECK = read("module", "dice", "check.mjs");
const CARD = read("module", "dice", "check-card-interactions.mjs");
/** The text of one function, from its declaration to the next top-level one. */
function bodyOf(source, head) {
  const at = source.indexOf(head);
  if (at < 0) return "";
  const next = source.slice(at + head.length).search(/\n(?:export )?(?:async )?function |\n {2}(?:static )?(?:async )?[a-zA-Z#]+\([^)]*\) \{\n/);
  return next < 0 ? source.slice(at) : source.slice(at, at + head.length + next);
}

/* ================================================================== *
 * A. F1 — an immunity keeps the spell off
 * ================================================================== */
{
  const words = PLAN["False Arrogance"].effects;
  ok("A1 a spell's immunity rows name its keys; a spell with none has none",
    JSON.stringify(spellImmunityKeys(words, "False Arrogance")) === '["False Arrogance"]'
    && spellImmunityKeys([{ kind: "bonus" }], "X").length === 0
    && JSON.stringify(spellImmunityKeys([{ kind: "tempImmunity", length: "1 day", immunityKey: "shared" }], "Y")) === '["shared"]');
  ok("A2 the longest running immunity is the one reported",
    immunityStillRunning({}, ["a", "b"], 0, (r, k) => (k === "a" ? 30 : 90)) === 90
    && immunityStillRunning({}, ["a"], 0, () => 0) === 0);
  ok("A3 the card says the spell does not affect it, and for how long",
    /doesn't affect FoeB<\/strong> — it is temporarily immune \(10 minutes left\)/.test(immuneRefusedLine("FoeB", "Word Of Blinding", "10 minutes")));
  const save = bodyOf(CAST, "async function resolveSpellSave(");
  ok("A4 the save path drops the immune before anything is rolled",
    save.includes("targets = await dropTemporarilyImmune(spell.name, spellData.effects, targets, lines);")
    && save.indexOf("dropTemporarilyImmune(") < save.indexOf("TRGCheck.roll("));
  ok("A5 and returns when nobody is left, rather than asking the empty-target question",
    /if \(!targets\.length && before\) return null;/.test(save));
  ok("A6 a spell with no save is kept off the same way",
    CAST.includes("if (!isAttack) effectTargets = await dropTemporarilyImmune(spell.name, effEffects, effectTargets, lines);"));
  const gate = bodyOf(CAST, "async function dropTemporarilyImmune(");
  ok("A7 the refusal is said once per card", gate.includes("if (!lines.includes(said)) lines.push(said);")
    && gate.includes("immunityStillRunning(") && gate.includes("kept.push(target)"));
}

/* ================================================================== *
 * B. G1 — capped is not "not chosen"
 * ================================================================== */
ok("B1 the not-chosen line is measured against what was ticked, not what the cap kept",
  /const ticked = applyAreaChoice\(before, chosen\);\s*\n\s*const spared = before\s*\n\s*\.filter\(\(a\) => !ticked\.includes\(a\)\)/.test(CAST));

/* ================================================================== *
 * C. R4 — Fateful Temptation and Lucky Break
 * ================================================================== */
{
  const at = (key) => applyDegreeShift(buildOutcome({ dieTotal: 0, modifiers: [], dc: 0 }), "")
    && applyDegreeShift({ degree: DEGREES.find((d) => d.key === key), margin: 0 }, "fateful").degree.key;
  ok("C1 only the two named degrees move: Success to Critical, Failure to Fumble",
    KEYS.map((k) => `${k}>${at(k)}`).join(" ")
      === "heroic>heroic critical>critical success>critical partial>partial failure>fumble fumble>fumble blunder>blunder",
    KEYS.map((k) => `${k}>${at(k)}`).join(" "));
  const moved = applyDegreeShift(buildOutcome({ dieTotal: 12, modifiers: [], dc: 10 }), "fateful");
  ok("C2 a moved outcome says where it came from and keeps its total",
    moved.degree.key === "critical" && moved.shiftedFrom === "success" && moved.total === 12 && moved.bonusCheck === 3);
  ok("C3 no shift is no change", applyDegreeShift(buildOutcome({ dieTotal: 12, modifiers: [], dc: 10 }), "").degree.key === "success"
    && applyDegreeShift(buildOutcome({ dieTotal: 12, modifiers: [], dc: 10 }), "nonsense").degree.key === "success");
  ok("C4 the shift line names both degrees", degreeShiftLine("Fateful Temptation", "Success", "Critical") === "Fateful Temptation: the Success becomes a Critical.");
  ok("C5 +2, +1 a warp, never above +5", [0, 1, 2, 3, 4].map((n) => fatefulBonus({ bonusValue: n })).join() === "2,3,4,5,5"
    && fatefulBonus(null) === 2 && fatefulModifier(4).type === "status" && fatefulModifier(4).value === 4);
  ok("C6 Lucky Break answers a Partial and a Failure, never a Fumble",
    KEYS.filter(luckyBreakTriggers).join() === "partial,failure");
  ok("C7 a caster must hold it, be yours, be in range, afford it and have a reaction in a fight",
    reactionCasterEligible({ hasSpell: true, canAct: true, pp: 7, ppCost: 7, feet: 120, rangeFeet: FATEFUL_RANGE_FEET }).ok
    && !reactionCasterEligible({ hasSpell: true, canAct: true, pp: 7, ppCost: 7, feet: 125, rangeFeet: 120 }).ok
    && !reactionCasterEligible({ hasSpell: true, canAct: false, pp: 7, ppCost: 7 }).ok
    && !reactionCasterEligible({ hasSpell: true, canAct: true, pp: 6, ppCost: 7 }).ok
    && !reactionCasterEligible({ hasSpell: true, canAct: true, pp: 7, ppCost: 7, inCombat: true, reactions: 0 }).ok
    && reactionCasterEligible({ hasSpell: true, canAct: true, pp: 7, ppCost: 7, inCombat: false, reactions: 0 }).ok
    && !reactionCasterEligible({ hasSpell: true, canAct: true, pp: 7, ppCost: 7, sameSide: false }).ok
    && !reactionCasterEligible({ hasSpell: true, canAct: true, pp: 7, ppCost: 7, immune: true }).ok);
  ok("C8 the spells are found by name, curly apostrophes and case aside",
    isNamedSpell({ type: "spell", name: "lucky break" }, LUCKY_BREAK) && !isNamedSpell({ type: "feat", name: "Lucky Break" }, LUCKY_BREAK)
    && isNamedSpell({ type: "spell", name: FATEFUL_TEMPTATION }, "Fateful Temptation"));
  ok("C9 Lucky Break's immunity is ten minutes", LUCKY_BREAK_IMMUNITY_SECONDS === 600
    && /immune to Lucky Break for 10 minutes/.test(luckyBreakLine("Failure", 21, "A")) && /\+3 status/.test(fatefulLine("B", 3)));

  const roll = bodyOf(CHECK, "  static async roll(");
  ok("C10 Fateful Temptation is offered before the dice", roll.includes("offerFatefulTemptation(check)")
    && roll.indexOf("offerFatefulTemptation(check)") < roll.indexOf("await check.evaluate();"));
  ok("C11 its bonus joins the modifiers and its shift the check", roll.includes("check.modifiers.push(fate.modifier);")
    && roll.includes("check.degreeShift = fate.shift;"));
  ok("C12 Lucky Break is offered after the dice and before the card or the caller sees them",
    roll.indexOf("offerLuckyBreak(check)") > roll.indexOf("await check.evaluate();")
    && roll.indexOf("offerLuckyBreak(check)") < roll.indexOf("await check.toMessage(config.messageData);"));
  ok("C13 neither is offered on a reroll's second throw",
    /check\.type === "save" && !check\.flat && !check\.saveReactionResolved\)\s*\{\s*\n\s*const \{ offerFatefulTemptation \}/.test(roll)
    // 3.622.0: and only while no other Chance effect has altered the roll.
    && /check\.type === "save" && !check\.flat && !check\.saveReactionResolved\s*\n\s*&& check\.outcome\?\.degree\?\.key && !check\.chanceUsed\)/.test(roll));
  const evaluate = bodyOf(CHECK, "  async evaluate() {");
  ok("C14 every outcome the check builds is shifted",
    // 3.621.0: wrapped once more, by what a condition forces (block 39's R7).
    /this\.outcome = (?:this\.#conditionForced\()?applyDegreeShift\(buildOutcome\(/.test(evaluate)
    && (CHECK.match(/applyDegreeShift\(buildOutcome\(\{/g) ?? []).length === 3);
  const reroll = bodyOf(CHECK, "  async reroll() {");
  ok("C15 the reroll throws fresh dice and spends nothing a second time",
    reroll.includes("this.firstOutcome = this.outcome;") && reroll.includes("this._visionDraw = null;")
    && /this\.dice = this\.die === "d100" \? await this\.#rollD100\(\) : await this\.#rollD20\(\);/.test(reroll)
    && !/#take/.test(reroll));
  ok("C16 the shift rides on the card and is moved again when the card is rebuilt",
    CHECK.includes("degreeShift: this.degreeShift,")
    && /const outcome = applyDegreeShift\(buildOutcome\(\{[\s\S]{0,200}\}\), raw\.degreeShift \?\? ""\);/.test(CARD));
  ok("C17 a reaction cast skips the target picker, and the cast hands back its warps",
    // 3.617.0: a potion fed to someone presets its targets the same way.
    CAST.includes("if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {")
    && CAST.includes("return { ...outcome, ppSpent, check, spellSave, refunded: castRefunded, warpMods };"));
  const flow = read("module", "magic", "save-reaction-spells-workflow.mjs");
  ok("C18 both are cast through castSpell, and the user's targets are put back",
    // FOUR AT 3.614.0: Unity (R6 of block 35) is cast the same way.
    // FIVE AT 3.625.0: a row-declared reroll spell (Saintly Intercession) is cast the same way.
    (flow.match(/castAsReaction\(/g) ?? []).length === 5 && flow.includes("return await castSpell(caster, spell, { reaction: { presetTargets: preset } });")
    && /finally \{\s*\n\s*if \(preset\) setTargets\(previous\);/.test(flow));
  // THREE AT 3.614.0, with Unity's.
  ok("C19 a failed casting gives nothing", (flow.match(/if \(!result\?\.cast\) return null;/g) ?? []).length === 4);
  ok("C20 Lucky Break rerolls and then records the immunity",
    flow.indexOf("await check.reroll();") > 0 && flow.indexOf("withImmunity(prunedImmunities(record, now), LUCKY_BREAK") > flow.indexOf("await check.reroll();"));
}

/* ================================================================== *
 * D. R6 — Web
 * ================================================================== */
{
  const row = PLAN.Web.effects.find((e) => e.kind === "entryCheck");
  const spec = normaliseEntryCheck(row);
  ok("D1 Web's check is Athletics or Acrobatics", JSON.stringify(spec?.skills) === '["athletics","acrobatics"]');
  const read7 = KEYS.map((k) => {
    const o = entryCheckOutcome(spec, k, "athletics");
    return `${k}=${o.at}${o.unaffected ? "/U" : ""}${o.endsChecksThisTurn ? "/E" : ""}${o.clears ? "/C" : ""}/${o.rows.length}`;
  }).join(" ");
  ok("D2 every degree reaches its printed outcome",
    read7 === "heroic=heroic/U/E/C/0 critical=critical/U/E/C/0 success=success/U/C/0 partial=failure/1 failure=failure/1 fumble=fumble/2 blunder=fumble/2", read7);
  ok("D3 only Athletics clears the web", !entryCheckOutcome(spec, "success", "acrobatics").clears
    && entryCheckOutcome(spec, "critical", "athletics").clears && !entryCheckOutcome(spec, "failure", "athletics").clears);
  ok("D4 the mover rolls its better skill, Athletics on a tie",
    entryCheckSkill(spec, { athletics: 4, acrobatics: 4 }) === "athletics" && entryCheckSkill(spec, { athletics: 4, acrobatics: 6 }) === "acrobatics");
  ok("D5 a check is called on entering, or on moving from inside, and not otherwise",
    entryCheckCalled(false, 1, 1) && entryCheckCalled(true, 0, 2) && !entryCheckCalled(true, 0, 0) && !entryCheckCalled(false, 0, 4));
  ok("D6 a Critical's 'this turn' is the combat turn, and nothing outside one",
    entryTurnKey({ combatId: "c", round: 2, turn: 1 }) === "c:2:1" && entryTurnKey({}) === null);
  const fail = spec.degrees.failure.rows[0];
  const fumble = spec.degrees.fumble.rows;
  ok("D7 a Failure is −10 ft to every Speed until the start of its next turn",
    fail.kind === "bonus" && fail.slot === "allSpeeds" && fail.bonusType === "circumstance" && fail.value === -10
    && parseSpellDuration(fail.duration)?.rounds === 1);
  ok("D8 a Fumble is immobilised for that turn and −10 ft for the round after",
    fumble[0].kind === "condition" && fumble[0].condition === "immobilised" && parseSpellDuration(fumble[0].duration)?.rounds === 1
    && fumble[1].slot === "allSpeeds" && fumble[1].value === -10 && parseSpellDuration(fumble[1].duration)?.rounds === 2);
  ok("D9 the card line names the roll, the DC and what happened",
    /rolls Athletics <strong>12<\/strong> vs DC <strong>20<\/strong> \(Partial, read as Failure\): takes a −10-foot/.test(
      entryCheckLine("Rat", spec, entryCheckOutcome(spec, "partial", "athletics"), "Athletics", 12, 20))
    && /clears the web from each square it left/.test(entryCheckLine("Rat", spec, entryCheckOutcome(spec, "success", "athletics"), "Athletics", 25, 20)));
  ok("D10 Web is difficult terrain too", PLAN.Web.effects.some((e) => e.kind === "difficultTerrain"));
  ok("D11 the cast records the check on the Region at this cast's DC",
    /if \(row\?\.kind !== "entryCheck" \|\| !placedArea\?\.regionId\) continue;[\s\S]{0,400}recordEntryCheck\(region, row, \{\s*\n\s*dc: nominalSaveDC/.test(CAST));
  const ew = read("module", "magic", "entry-check-workflow.mjs");
  ok("D12 the hook is the acting GM's, on a Speed's own move, once per movement",
    /Hooks\.on\("moveToken"[\s\S]{0,120}if \(!isActingGM\(\)\) return;/.test(ew)
    && ew.includes("if (!hazardTriggers(actionOf(movement))) return;") && ew.includes("if (alreadyAnswered(movement?.id)) return;"));
  ok("D13 the rung is applied by the spell engine", ew.includes("await applySpellEffects(caster ?? mover, spell, {")
    && ew.includes("effects: outcome.rows"));
  ok("D14 a Critical ends the checks for this turn", ew.includes("if (turnKey && cleared?.region === region.id && cleared?.turn === turnKey) continue;")
    && ew.includes("if (outcome.endsChecksThisTurn && turnKey)"));
  ok("D15 the system boots the hook", /registerEntryChecks\(\);/.test(read("scripts", "trg-prime.mjs")));
  ok("D16 the kind is handled, and quietly by the effect engine",
    HANDLED_EFFECT_KINDS.includes("entryCheck") && /case "storm":\s*\n[\s\S]{0,200}case "entryCheck": \{/.test(read("module", "magic", "spell-effects.mjs")));
  ok("D17 the Region flag is the one the hook reads", ENTRY_CHECK_FLAG === "entryCheck" && ew.includes("region.setFlag(SYSTEM_ID, ENTRY_CHECK_FLAG,")
    && ew.includes("region.getFlag?.(SYSTEM_ID, ENTRY_CHECK_FLAG)"));
}

/* ================================================================== *
 * E. R8 — False Arrogance
 * ================================================================== */
{
  const rows = PLAN["False Arrogance"].effects;
  const gated = rows.filter((e) => Array.isArray(e.onSave));
  const length = (deg) => rows.find((r) => r.kind === "marker" && r.onSave.includes(effectiveSaveDegree(gated, deg)))?.duration ?? "none";
  ok("E1 the duration is the save's: none, 1 round, 1 minute, 10 minutes, 24 hours",
    KEYS.map(length).join("|") === "none|none|1 round|1 minute|10 minutes|24 hours|24 hours", KEYS.map(length).join("|"));
  ok("E2 every save, the Critical included, earns 24 hours of immunity",
    KEYS.every((k) => rows.some((r) => r.kind === "tempImmunity" && r.onSave.includes(effectiveSaveDegree(gated, k)) && r.length === "24 hours")));
  ok("E3 the marker is registered and read, not spent",
    MARKERS.falseArrogance?.consumed === false && MARKERS.falseArrogance?.reader === "module/magic/false-arrogance-workflow.mjs");
  ok("E4 a failed attack roll or skill check feeds it; a save, Spellcraft or a success does not",
    arroganceTriggers("attack", false) && arroganceTriggers("skill", false) && !arroganceTriggers("save", false)
    && !arroganceTriggers("spellcraft", false) && !arroganceTriggers("attack", true) && !arroganceTriggers("skill", false, false));
  ok("E5 −1, then −2, and no worse", [0, 1, 2, 5].map(nextArrogancePenalty).join() === "1,2,2,2");
  ok("E6 to the end of this turn on its own turn, the next turn otherwise",
    parseSpellDuration(arroganceWindow(true))?.rounds === 1 && parseSpellDuration(arroganceWindow(false))?.rounds === 2);
  ok("E7 the card says the penalty and how long", /−2 status penalty to attack rolls and skill checks until the end of its turn/.test(arroganceLine("A", 2, arroganceWindow(true))));
  const fw = read("module", "magic", "false-arrogance-workflow.mjs");
  // PRESENT AND BEFORE — an absent line's -1 is "before" everything.
  const removes = fw.indexOf("if (existing) await existing.delete();");
  ok("E8 the penalty replaces the last one rather than stacking", removes >= 0 && removes < fw.indexOf("createEmbeddedDocuments(\"ActiveEffect\"")
    && fw.includes(`[ARROGANCE_PENALTY_FLAG]: penalty`) && ARROGANCE_PENALTY_FLAG === "falseArrogancePenalty");
  ok("E9 it lands on attack and every skill, as a status penalty",
    fw.includes('const keys = ["attack", ...Object.keys(actor.system?.skills ?? {})]') && fw.includes("key: `${key}.status`")
    && fw.includes("value: String(-penalty)"));
  const roll = bodyOf(CHECK, "  static async roll(");
  ok("E10 every roll is asked once its degree is final",
    roll.indexOf("onArroganceCheck(check)") > roll.indexOf("offerLuckyBreak(check)")
    && roll.indexOf("onArroganceCheck(check)") < roll.indexOf("await check.toMessage(config.messageData);"));
}

/* ================================================================== *
 * F. R8 — Inspire Heroics
 * ================================================================== */
{
  const row = PLAN["Inspire Heroics"].effects[0];
  const spec = normaliseHeldBonus(row);
  ok("F1 a skill check with advantage, once each round", spec?.kind === "advantage" && spec.perRound === true
    && JSON.stringify(spec.checkTypes) === '["skill"]' && /once this round/.test(heldBonusButtonLabel(spec)));
  ok("F2 a normalised spec survives a second normalisation", normaliseHeldBonus(spec)?.perRound === true);
  const k = heldRoundKey({ combatId: "c", round: 3 });
  ok("F3 the round is the combat's, else six seconds of the clock",
    k === "c:c:3" && heldRoundKey({ worldTime: 13 }) === "t:2" && heldRoundKey({ worldTime: 11 }) === "t:1");
  ok("F4 spent this round is spent; last round's spend is not",
    heldBonusSpentThisRound(spec, k, k) && !heldBonusSpentThisRound(spec, k, heldRoundKey({ combatId: "c", round: 4 }))
    && !heldBonusSpentThisRound({ ...spec, perRound: false }, k, k));
  const widen = (sel) => normaliseHeldBonus(warpedEmanationEffects(PLAN["Inspire Heroics"].effects,
    aggregateWarpSelection(PLAN["Inspire Heroics"].warps, sel).mods)[0]);
  ok("F5 the warps widen it to saves, then attacks, then any check",
    !heldBonusMatches(widen({}), { type: "save" }) && heldBonusMatches(widen({ "warp-0": "1" }), { type: "save" })
    && !heldBonusMatches(widen({ "warp-0": "1" }), { type: "attack" }) && heldBonusMatches(widen({ "warp-1": "1" }), { type: "attack" })
    && heldBonusMatches(widen({ "warp-2": "1" }), { type: "initiative" }) && !heldBonusMatches(widen({ "warp-2": "1" }), { type: "damage" }));
  ok("F6 it is a live emanation, and its members carry the advantage",
    LIVE_EMANATION_EFFECT_KINDS.includes("heldBonus")
    && emanationIsLive({ area: "60-foot emanation", effects: PLAN["Inspire Heroics"].effects })
    && emanationEffectData({ name: "Inspire Heroics", effects: PLAN["Inspire Heroics"].effects }, "c1", "B")?.flags?.["trg-prime"]?.heldBonus?.perRound === true);
  const spend = read("module", "magic", "held-bonus-workflow.mjs");
  ok("F7 spending it records the round and keeps the effect",
    // WIDENED 3.613.0: R4's sibling check sits between the two.
    /if \(spec\.perRound\) \{[\s\S]{0,1600}await effect\.setFlag\(SYSTEM_ID, HELD_SPENT_ROUND_FLAG, key\);\s*\n\s*return true;\s*\n\s*\}/.test(spend)
    && spend.indexOf("if (spec.perRound) {") < spend.indexOf("await effect.delete();"));
  // RE-ANCHORED 3.613.0 (R4): the card now filters through heldOffersThisRound,
  // which is what drops a bonus spent this round — see verify-block35 C.
  ok("F8 the card offers it only while unspent this round",
    CARD.includes("const held = heldOffersThisRound(candidates, roundNow);")
    && CARD.includes("spentKey: effect.flags?.[SYSTEM_ID]?.[HELD_SPENT_ROUND_FLAG] ?? null")
    && HELD_SPENT_ROUND_FLAG === "heldSpentRound");
}

/* ================================================================== *
 * G. The pack, the repairs, the version
 * ================================================================== */
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const held = {};
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && PLAN[value?.name]) held[value.name] = value.system;
    }
  } finally {
    await db.close();
  }
  for (const [name, plan] of Object.entries(PLAN)) {
    for (const [field, to] of Object.entries(plan)) {
      ok(`G1 ${name}'s ${field} is the plan's`, JSON.stringify(held[name]?.[field]) === JSON.stringify(to));
      const entry = PACK_REPAIRS.find((e) => e.name === name && e.field === field && e.pack === "spells");
      // 3.612.0 OR 3.612.1: the 3.612.0 drive's G1/G3 rewrote three of them.
      ok(`G2 ${name}'s ${field} has a repair entry to the plan's value`, entry && /^3\.612\.[01]$/.test(entry.since)
        && JSON.stringify(entry.to) === JSON.stringify(to));
    }
  }
  const sys = JSON.parse(read("system.json"));
  // 3.612 OR LATER (3.613.0), and all three agreeing with each other: a
  // later release must not run the pack-copy gate behind these entries.
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => { const [a, b] = String(v).split(".").map(Number); return a > 3 || (a === 3 && b >= 612); };
  ok("G3 the version, the schema and the pack-copy gate are current, 3.612 or later",
    // THE SCHEMA MAY TRAIL THE VERSION (3.616.1): a point release that
    // changes no stored shape keeps the schema at its newest migration pass,
    // which verify-speed-pool F4 requires. It may never lead it.
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0 && atLeast(gate));
  // THE GATE FOLLOWS THE NEWEST REPAIR ENTRY, not the release (3.614.1): a
  // point release with no new entries leaves it where it is, and
  // verify-pack-repairs F1b holds it to the manifest.
}

if (failures.length) {
  console.log(`verify-block34b: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block34b: OK — ${checks} checks. Block 34's reactions to a save, Web's check, False Arrogance and Inspire Heroics, and an immunity that keeps a spell off.`);
