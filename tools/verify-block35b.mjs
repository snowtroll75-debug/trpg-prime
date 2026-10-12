#!/usr/bin/env node
/**
 * verify-block35b — block 35, part two (3.614.0), and the 3.613.0 drive's F1.
 *
 * NEW at 3.614.0. The audit is claude/audit-pages-351-360.md; the drive is
 * claude/live-testing-report-3.613.0.md.
 *
 *   A  R2   Stasis
 *   B  R6   Unity
 *   C  R7   Zealous Battlecry
 *   D  R8   Renewal's Touch's turn options
 *   E  R9   Wellspring Of Valour's heal on damage
 *   F  R10  Nature's Bounty's food
 *   G  R11  Precious Metals
 *   H  R15  Wild Morph's "instead" warps
 *   I  F1   an attack-gated row reaching nobody says nothing
 *   J       the pack, the repairs and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  STASIS_FLAG, normaliseStasis, stasisEffectOf, frozenByStasis, stasisSaveOutcome, stasisElapsed,
  resumedClockUpdates, shortenedStasisUpdates, stasisLine
} from "../module/magic/stasis.mjs";
import {
  UNITY, unitySourceKey, unityMoment, unityWindowOpen, unityModifier
} from "../module/magic/save-reaction-spells.mjs";
import { zealousInitiatives, zealousLine, ZEALOUS_PAIRS_FLAG, INIT_DIE_FLAG } from "../module/combat/zealous-battlecry.mjs";
import { turnOptionsSpec, turnOptionChoices, turnOptionUsed, turnOptionKey, TURN_OPTIONS_FLAG } from "../module/magic/turn-options.mjs";
import { warpedHealFormula } from "../module/magic/caster-level-mods.mjs";
import { normaliseDamageHeal, damageHealVerdict, DAMAGE_HEAL_FLAG } from "../module/magic/damage-heal.mjs";
import { LIVE_EMANATION_EFFECT_KINDS } from "../module/magic/emanation.mjs";
import { emanationEffectData } from "../module/magic/emanation-effects.mjs";
import { aggregateWarpSelection, warpedEmanationEffects } from "../module/magic/spell-warp.mjs";
import { materialShiftChoices, shiftableItem, materialShiftLine } from "../module/magic/material-shift.mjs";
import { attackRowRecipients, isAttackGated } from "../module/magic/attack-degree-rows.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { TRG_SCHEMA_VERSION } from "../module/migration.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";
import { PLAN } from "./block35b-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const FX = read("module", "magic", "spell-effects.mjs");
const COMBAT = read("module", "documents", "combat.mjs");
const DYING = read("module", "combat", "dying-workflow.mjs");
const APPLY = read("module", "combat", "effect-application-workflow.mjs");
const LINKED = read("module", "combat", "linked-conditions-workflow.mjs");
const CHECK = read("module", "dice", "check.mjs");
const BOOT = read("scripts", "trg-prime.mjs");
const STASISF = read("module", "magic", "stasis-workflow.mjs");
const UNITYF = read("module", "magic", "save-reaction-spells-workflow.mjs");
const ATTACK = read("module", "combat", "attack-workflow.mjs");
const row = (name, kind, i = 0) => (PLAN[name]?.effects ?? []).filter((e) => e.kind === kind)[i];

/* ================================================================== *
 * A. R2 — Stasis
 * ================================================================== */
{
  const fail = normaliseStasis(row("Stasis", "stasis", 0));
  const fumble = normaliseStasis(row("Stasis", "stasis", 1));
  ok("A1 the Failure holds 1 round, the Fumble 3 with a save each turn",
    fail?.rounds === 1 && !fail.saveEachTurn && fumble?.rounds === 3 && fumble.saveEachTurn === true
    && JSON.stringify(row("Stasis", "stasis", 0).onSave) === '["failure"]'
    && JSON.stringify(row("Stasis", "stasis", 1).onSave) === '["fumble"]');
  ok("A2 a row with no length is refused", normaliseStasis({ kind: "stasis" }) === null);
  const held = { id: "s", flags: { "trg-prime": { [STASIS_FLAG]: {} } } };
  ok("A3 the stasis is found, and everything else on the creature is frozen but it",
    stasisEffectOf([{ id: "a", flags: {} }, held])?.id === "s"
    && frozenByStasis({ id: "a" }, held) && !frozenByStasis(held, held) && !frozenByStasis({ id: "a" }, null)
    && stasisEffectOf([{ ...held, disabled: true }]) === null);
  ok("A4 the Fumble's save: a critical ends it, a success takes a round off, a failure nothing",
    stasisSaveOutcome({ key: "critical", success: true }) === "end"
    && stasisSaveOutcome({ key: "heroic", success: true }) === "end"
    && stasisSaveOutcome({ key: "success", success: true }) === "shorten"
    && stasisSaveOutcome({ key: "failure", success: false }) === "none");
  const el = stasisElapsed({ startRound: 3, startTime: 100 }, { round: 5, worldTime: 112 });
  ok("A5 the time it lasted, in rounds and seconds", el.rounds === 2 && el.seconds === 12
    && stasisElapsed({ startRound: null, startTime: 100 }, { round: null, worldTime: 118 }).seconds === 18);
  const moved = resumedClockUpdates({ conditionExpiresRound: 6, spellEffectEnd: 500, conditionExpiresTime: 900 }, { rounds: 2, seconds: 12 });
  ok("A6 the frozen clocks move on by that time, and only clocks that exist",
    moved["flags.trg-prime.conditionExpiresRound"] === 8 && moved["flags.trg-prime.spellEffectEnd"] === 512
    && moved["flags.trg-prime.conditionExpiresTime"] === 912
    && Object.keys(resumedClockUpdates({}, { rounds: 2, seconds: 12 })).length === 0);
  const short = shortenedStasisUpdates({ conditionExpiresRound: 7, spellEffectEnd: 118 });
  ok("A7 a round off is a round off both clocks",
    short["flags.trg-prime.conditionExpiresRound"] === 6 && short["flags.trg-prime.spellEffectEnd"] === 112);
  ok("A8 impervious: the damage primitive refuses a creature in stasis",
    /if \(Array\.from\(actor\?\.effects \?\? \[\]\)\.some\(\(e\) => !e\.disabled && e\.flags\?\.\["trg-prime"\]\?\.stasis\)\) \{\s*\n\s*return \{ case: "stasis"/.test(DYING)
    && ATTACK.includes('if (damageResult.case === "stasis") {'));
  ok("A9 no time passes: all three expiry sweeps skip what the stasis freezes",
    (APPLY.match(/if \(frozenByStasis\(effect, stasis\)\) continue;/g) ?? []).length === 2
    && LINKED.includes("if (frozenByStasis(effect, stasis)) continue;"));
  ok("A10 its turns: nothing starts, nothing ends, and the Fumble's save is rolled",
    COMBAT.includes("const said = await stasisTurnStart(actor);") && COMBAT.includes("const said = await stasisTurnEnd(actor);")
    && STASISF.includes('const outcome = stasisSaveOutcome(check?.outcome?.degree ?? null);'));
  ok("A11 targeting warns, moving is refused, and the clocks resume when it ends",
    STASISF.includes('globalThis.Hooks.on("targetToken"') && STASISF.includes("ui.notifications.warn(`${token.name} is in stasis and cannot be targeted by anything.`);")
    && /Hooks\.on\("preUpdateToken"[\s\S]{0,300}return false;/.test(STASISF)
    && STASISF.includes("const elapsed = stasisElapsed(record, now());")
    && BOOT.includes("registerStasis();"));
  ok("A12 the engine applies the row", FX.includes('case "stasis": {') && HANDLED_EFFECT_KINDS.includes("stasis")
    && stasisLine("X", fumble).includes("3 rounds") && stasisLine("X", fumble).includes("saves again"));
}

/* ================================================================== *
 * B. R6 — Unity
 * ================================================================== */
{
  const key = unitySourceKey({ sourceUuid: "Actor.a.Item.b", saveSource: "Fear" });
  const moment = unityMoment({ worldTime: 50, combatId: "c", round: 2, turn: 1 });
  ok("B1 a save names its source; one that names none has nothing to answer",
    key === "Actor.a.Item.b|Fear" && unitySourceKey({}) === "");
  ok("B2 the window answers the same source at the same moment only",
    unityWindowOpen({ key, moment }, key, moment)
    && !unityWindowOpen({ key, moment }, "x|Fear", moment)
    && !unityWindowOpen({ key, moment }, key, unityMoment({ worldTime: 56, combatId: "c", round: 2, turn: 2 }))
    && !unityWindowOpen({ key: "", moment }, "", moment));
  const mod = unityModifier("Cleric", "Will", 9, 2);
  ok("B3 the swap is the difference, and nothing when the caster's is no better",
    mod?.value === 7 && /\+9 instead of \+2/.test(mod.label) && unityModifier("C", "Will", 2, 5) === null);
  ok("B4 offered before the dice, after Fateful Temptation, for a save naming its source",
    CHECK.indexOf("offerFatefulTemptation(check)") < CHECK.indexOf("offerUnity(check)")
    && CHECK.indexOf("offerUnity(check)") < CHECK.indexOf("let advantageSpent = false;")
    // 3.622.0: and only while no other Chance effect has altered the roll.
    && CHECK.includes("&& (check.saveSource || check.sourceUuid) && !check.chanceUsed) {"));
  ok("B5 one casting opens the window; each ally then decides",
    UNITYF.includes("await chosen.actor.setFlag(SYSTEM_ID, UNITY_WINDOW_FLAG, { key, moment, source: check.saveSource ?? \"\" });")
    && UNITYF.includes("const use = await DialogV2.confirm({") && UNITY === "Unity");
}

/* ================================================================== *
 * C. R7 — Zealous Battlecry
 * ================================================================== */
{
  const z = zealousInitiatives({ initiative: 80, die: 50 }, { initiative: 95, die: 70 });
  ok("C1 both use the higher d100 and keep their own bonuses", z?.die === 70 && z.a === 100 && z.b === 95);
  ok("C2 nothing until both have rolled", zealousInitiatives({ initiative: 80, die: 50 }, { initiative: null, die: null }) === null);
  ok("C3 the card says so", zealousLine("A", "B", 70, { a: 100, b: 95 }).includes("<strong>70</strong>"));
  ok("C4 offered before each roll, each roll's die stored, settled after the update",
    COMBAT.indexOf("await offerZealousBattlecry(this, combatant);") < COMBAT.indexOf("const check = await TRGCombat.rollCombatantInitiative(combatant);")
    && COMBAT.includes("[`flags.${SYSTEM_ID}.initDie`]: Number(check.dice?.total ?? 0)")
    && COMBAT.indexOf('await this.updateEmbeddedDocuments("Combatant", updates);') < COMBAT.indexOf("await settleZealousBattlecry(this);")
    && ZEALOUS_PAIRS_FLAG === "zealousPairs" && INIT_DIE_FLAG === "initDie");
}

/* ================================================================== *
 * D. R8 — Renewal's Touch
 * ================================================================== */
{
  const raw = row("Renewal’s Touch", "turnOptions");
  const warps = PLAN["Renewal’s Touch"].warps;
  const base = turnOptionsSpec(raw, aggregateWarpSelection(warps, {}).mods, warpedHealFormula);
  ok("D1 the four printed options", JSON.stringify(turnOptionChoices(base).map((c) => c.key))
    === '["heal","bleed","reduce:fatigued","recovery"]' && base.apCost === 2 && base.heal === "1d8 + 8");
  const all = turnOptionsSpec(raw, aggregateWarpSelection(warps, { "warp-0": 1, "warp-1": 2, "warp-2": 1, "warp-3": 1, "warp-4": 1 }).mods, warpedHealFormula);
  ok("D2 every warp feeds them", all.heal === "1d8 + 8 + 1d8 + 8" && all.bleed === 3
    && all.reduce.fatigued === 2 && all.reduce.injured === 2 && all.reduce.dazed === 3 && all.reduce.weakened === 3
    && all.reduce.soulDrain === 6);
  ok("D3 the unlocked options are offered only when bought", !("injured" in base.reduce) && !("soulDrain" in base.reduce));
  ok("D4 one a turn", turnOptionUsed(turnOptionKey("c", 3), turnOptionKey("c", 3)) && !turnOptionUsed(turnOptionKey("c", 2), turnOptionKey("c", 3)));
  ok("D5 offered after the AP are regained, applied by the engine, wired at init",
    COMBAT.indexOf('await TRGCombat.#postTurnCard(actor, "Phase 1 — Assessment", lines);\n\n    // RENEWAL') > 0
    && COMBAT.includes("await offerTurnOptions(actor, this);") && FX.includes('case "turnOptions": {')
    && BOOT.includes("registerTurnOptions();") && TURN_OPTIONS_FLAG === "turnOptions"
    && HANDLED_EFFECT_KINDS.includes("turnOptions"));
}

/* ================================================================== *
 * E. R9 — Wellspring Of Valour
 * ================================================================== */
{
  ok("E1 the heal is 1d6, a die more per warp", normaliseDamageHeal({ dice: "1d6" }, 0)?.dice === "1d6"
    && normaliseDamageHeal({ dice: "1d6" }, 2)?.dice === "3d6" && normaliseDamageHeal({ dice: "x" }) === null);
  const v = (o) => damageHealVerdict({ hpBefore: 20, hpAfter: 15, nowKey: "k", ...o });
  ok("E2 the first damage this round heals; the second, a scratch absorbed, and the dying do not",
    v({}) === "heal" && v({ spentKey: "k" }) === "spent" && v({ hpAfter: 20 }) === "none"
    && v({ dying: true }) === "withheld" && v({ spentKey: "j" }) === "heal");
  ok("E3 it rides the aura's membership", LIVE_EMANATION_EFFECT_KINDS.includes("damageHeal")
    && emanationEffectData({ name: "W", effects: PLAN["Wellspring Of Valour"].effects }, "c", "X")?.flags?.["trg-prime"]?.[DAMAGE_HEAL_FLAG]?.dice === "1d6");
  ok("E4 the warp's die reaches a creature walking in",
    warpedEmanationEffects(PLAN["Wellspring Of Valour"].effects, { bonusValue: 1 }).find((e) => e.kind === "damageHeal")?.extraDice === 1);
  ok("E5 asked after every blow, and applied at the cast",
    DYING.includes("await healAfterDamage(actor, hpBefore);") && FX.includes('case "damageHeal": {')
    && HANDLED_EFFECT_KINDS.includes("damageHeal")
    && !PLAN["Wellspring Of Valour"].effects.some((e) => e.kind === "note"));
}

/* ================================================================== *
 * F. R10 — Nature's Bounty
 * ================================================================== */
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "consumables"), { valueEncoding: "json" });
  await db.open();
  let fruit = null;
  try {
    for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && value?.name === "Bountiful Fruit") fruit = value;
  } finally {
    await db.close();
  }
  ok("F1 the fruit is in the consumables pack and heals 3d10+12 when eaten",
    fruit?.flags?.["trg-prime"]?.consumable?.effect?.effects?.[0]?.formula === "3d10 + 12"
    && fruit.system.activation === "Interact (1 AP)");
  const c = row("Nature’s Bounty", "conjureItem");
  ok("F2 the spell conjures it for a minute, carrying the heal the warp grows",
    c?.itemName === "Bountiful Fruit" && c.healOnUse === "3d10 + 12" && PLAN["Nature’s Bounty"].duration === "1 minute"
    && FX.includes("heal.formula = warpedHealFormula(String(effect.healOnUse), warpMods ?? {});")
    && warpedHealFormula("3d10 + 12", { damageDice: "1d10" }) === "3d10 + 12 + 1d10");
}

/* ================================================================== *
 * G. R11 — Precious Metals
 * ================================================================== */
{
  ok("G1 six metals, and nine with the warp",
    materialShiftChoices({}).length === 6
    && materialShiftChoices(aggregateWarpSelection(PLAN["Precious Metals"].warps, { "warp-0": 1 }).mods).length === 9);
  ok("G2 cold iron and silver are the system's materials; copper, gold, iron and steel are plain metal",
    materialShiftChoices({}).find((m) => m.name === "cold iron")?.key === "coldIron"
    && materialShiftChoices({}).find((m) => m.name === "silver")?.key === "silver"
    && materialShiftChoices({}).filter((m) => !m.key).length === 4);
  ok("G3 a weapon, armour or shield of metal — not a claw, nor densewood",
    shiftableItem({ type: "weapon", system: {} }) && shiftableItem({ type: "armour", system: {} })
    && !shiftableItem({ type: "weapon", system: { natural: true } })
    && !shiftableItem({ type: "shield", system: { material: "densewood" } })
    && !shiftableItem({ type: "consumable", system: {} }));
  ok("G4 the card says what a plain metal means", materialShiftLine("Mace", { name: "gold", key: "" }).includes("table's call"));
  ok("G5 applied by the engine, and put back when it ends",
    FX.includes('case "materialShift": {') && BOOT.includes("registerMaterialShift();")
    && read("module", "magic", "material-shift-workflow.mjs").includes('await item.update({ "system.material": record.from ?? "" });'));
}

/* ================================================================== *
 * H. R15 — Wild Morph
 * ================================================================== */
{
  const w = PLAN["Wild Morph"].warps;
  const mv = aggregateWarpSelection(w, { "warp-1": 1 }).mods;
  const ab = aggregateWarpSelection(w, { "warp-2": 1 }).mods;
  ok("H1 the two 'instead' warps carry their states", mv.morphMovement === true && ab.morphAbility === true
    && aggregateWarpSelection(w, {}).mods.morphMovement === false);
  ok("H2 the movement is a speed the creature gains; the ability is said",
    FX.includes("if (warpMods?.morphMovement) {") && FX.includes("creatureAbility: { derives: { movement: { key: move.key, feet: move.feet, orLand: false } } }")
    && FX.includes("if (warpMods?.morphAbility) {"));
}

/* ================================================================== *
 * I. F1 of the 3.613.0 drive
 * ================================================================== */
{
  ok("I1 an attack-gated row that reaches nobody says nothing",
    FX.includes("if (!isDegreeGated(effect) && !isAttackGated(effect) && !reportsItsOwnAbsence(effect)) {")
    && isAttackGated({ onAttack: ["hit"] }) && !isAttackGated({ kind: "condition" })
    && attackRowRecipients({ onAttack: ["hit"] }, [{ n: 1 }], [{ target: null, critical: false }]).length === 1);
}

/* ================================================================== *
 * J. The pack, the repairs, the version
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
      ok(`J1 ${name}'s ${field} is the plan's`, JSON.stringify(held[name]?.[field]) === JSON.stringify(to));
      const entry = PACK_REPAIRS.find((e) => e.name === name && e.field === field && e.pack === "spells");
      ok(`J2 ${name}'s ${field} has a 3.614 repair entry to the plan's value`, entry && /^3\.614\.\d+$/.test(entry.since)
        && JSON.stringify(entry.to) === JSON.stringify(to));
    }
  }
  const rewritten = PACK_REPAIRS.filter((e) => ["stasis-effects-3613", "renewal-s-touch-warps-3613"].includes(e.id));
  ok("J3 the two 3.613.0 entries rewritten know their 3.613.0 rows", rewritten.length === 2
    && rewritten.every((e) => Array.isArray(e.alsoFrom) && e.alsoFrom.length === 1));
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => { const [a, b] = String(v).split(".").map(Number); return a > 3 || (a === 3 && b >= 614); };
  ok("J4 the version, the schema and the pack-copy gate are current, 3.614 or later",
    // THE SCHEMA MAY TRAIL THE VERSION (3.616.1): a point release that
    // changes no stored shape keeps the schema at its newest migration pass,
    // which verify-speed-pool F4 requires. It may never lead it.
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0 && atLeast(gate));
  // THE GATE FOLLOWS THE NEWEST REPAIR ENTRY, not the release (3.614.1): a
  // point release with no new entries leaves it where it is, and
  // verify-pack-repairs F1b holds it to the manifest.
}

if (failures.length) {
  console.log(`verify-block35b: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block35b: OK — ${checks} checks. Stasis, Unity, Zealous Battlecry, Renewal's Touch, Wellspring's heal, Nature's Bounty, Precious Metals and Wild Morph's movement.`);
