#!/usr/bin/env node
/**
 * mutate-chapter7-critical-201-210 — can the pages 201-210 checks fail?
 *
 * NEW at 3.580.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back as it stood where one line
 * can put it back: an airborne character who is never told jumping needs
 * ground, water that does nothing, a creature that never runs out of
 * air, a critical whose bonus dice ignore precision, armour-granted CR
 * that nothing bypasses, a rigid clause that applies to leather, an
 * unarmoured clause that lands on the armoured, a Persistence amendment
 * ignored, a Chaos that only talks about the fumble table, a Conviction
 * given to the mook, and three optional rules with no lever. Then every
 * new rule, one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const ATTACK = at("combat", "attack.mjs");
const ATTACKWF = at("combat", "attack-workflow.mjs");
const ACTIONWF = at("combat", "action-workflow.mjs");
const UNDER = at("combat", "underwater.mjs");
const UNDERWF = at("combat", "underwater-workflow.mjs");
const DROWN = at("drowning.mjs");
const DROWNWF = at("drowning-workflow.mjs");
const FLY = at("combat", "fly.mjs");
const PARSER = at("effect-parser.mjs");
const RIDERS = at("combat", "critical-riders.mjs");
const HITLOC = at("combat", "hit-location.mjs");
const REGISTRY = at("conditions", "registry.mjs");
const ACTOR = at("documents", "actor.mjs");
const COMBAT = at("documents", "combat.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const CARDS = at("dice", "check-card-interactions.mjs");
const ALCH = at("alchemical-workflow.mjs");
const SETTINGS = at("settings.mjs");
const TABLES = at("data", "critical-tables.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter7-critical-201-210.mjs");

const MUTATIONS = [
  /* ── the defects, put back ─────────────────────────────────────── */
  { file: FLY, name: "D1 THE DEFECT: nothing is said about a ground action in the air",
    from: "  if (!aloft || !actionName) return \"\";", to: "  return \"\";", breaks: "A1" },
  { file: FLY, name: "D1: jumping loses the page's own reason",
    from: "  const jumping = /\\bjump\\b/i.test(actionName);", to: "  const jumping = false;", breaks: "A3" },
  { file: ACTIONWF, name: "D1 THE DEFECT: the action card never asks where this is happening",
    from: "  if (aloft) out.push(line(`<em>${aloft}</em>`));", to: "", breaks: "A6" },

  { file: UNDER, name: "D2 THE DEFECT: a swim Speed is no exemption, or everyone is exempt",
    from: "  return !(Number(swimSpeed) > 0);", to: "  return false;", breaks: "B1" },
  { file: UNDER, name: "D2: piercing pays the melee penalty too",
    from: "  return UNDERWATER_PENALISED_MELEE.includes(type) ? UNDERWATER_MELEE_PENALTY : 0;",
    to: "  return UNDERWATER_MELEE_PENALTY;", breaks: "B4" },
  { file: UNDER, name: "D2: only the attacker's own water counts",
    from: "  if (!attackerUnderwater && !targetUnderwater) return 0;",
    to: "  if (!attackerUnderwater) return 0;", breaks: "B4" },
  { file: UNDER, name: "D2: a blocked ranged attack is merely shortened",
    from: "      automaticMiss: true,\n      rangeIncrementFactor: 1,",
    to: "      automaticMiss: false,\n      rangeIncrementFactor: 0.5,", breaks: "B6" },
  { file: UNDER, name: "D2: piercing keeps its full range underwater",
    from: "      rangeIncrementFactor: 0.5,\n      note: \"a piercing ranged attack has its range increments halved through water\"",
    to: "      rangeIncrementFactor: 1,\n      note: \"a piercing ranged attack has its range increments halved through water\"", breaks: "B7" },
  { file: UNDER, name: "D2: the fire trait no longer fails",
    from: "  return /(^|[,\\s])fire([,\\s]|$)/i.test(String(traits ?? \"\"));", to: "  return false;", breaks: "B8" },
  { file: UNDER, name: "D2: a firearm counts as fire",
    from: "  return /(^|[,\\s])fire([,\\s]|$)/i.test(String(traits ?? \"\"));",
    to: "  return /fire/i.test(String(traits ?? \"\"));", breaks: "B9" },
  { file: UNDER, name: "D2: the creator of an electric effect is spared",
    from: "    creatorTakesDouble: applies", to: "    creatorTakesDouble: false", breaks: "B10" },
  // RE-ANCHORED AT 3.622.0: the trait's 10-ft sphere (block 39's R8).
  { file: UNDER, name: "D2: the sphere has no radius",
    from: "    radiusFeet: applies ? 10 : 0,",
    to: "    radiusFeet: 0,", breaks: "B10" },
  { file: UNDER, name: "D2: a Region named for water is not water",
    from: "  const named = NAMED.test(String(region?.name ?? \"\"));", to: "  const named = false;", breaks: "B14" },
  { file: UNDERWF, name: "D2: the Region document is asked first again (F4 all over)",
    from: "    const inside = region.tokens?.has?.(tokenDocument)",
    to: "    const inside = region.testPoint?.(centre) ?? region.tokens?.has?.(tokenDocument)", breaks: "B15" },
  { file: ATTACKWF, name: "D2 THE DEFECT: the attack path never looks at the water",
    from: "  const targetUnderwater = tokenIsUnderwater(targetToken ?? null);",
    to: "  const targetUnderwater = false;", breaks: "B17" },
  { file: ATTACKWF, name: "D2: a blocked ranged attack rolls anyway",
    from: "  if (waterRanged.automaticMiss) {", to: "  if (false) {", breaks: "B18" },
  { file: ATTACKWF, name: "D2: a fire attack underwater rolls anyway",
    from: "  if (!waterExempt.fireFails && underwaterFireFails({", to: "  if (false && ({", breaks: "B19" },

  { file: DROWN, name: "D3 THE DEFECT: no floor on a lungful",
    from: "  const base = Math.max(1, 5 + con);", to: "  const base = 5 + con;", breaks: "C1" },
  { file: DROWN, name: "D3: attacking costs no more air than standing still",
    from: "  return actedViolently ? 2 : 1;", to: "  return 1;", breaks: "C3" },
  { file: DROWN, name: "D3: speaking costs one round like anything else",
    from: "  if (spoke) return Infinity;", to: "  if (spoke) return 1;", breaks: "C4" },
  { file: DROWN, name: "D3: running out of air is never noticed",
    from: "  return { remaining: left, ranOut: had > 0 && left === 0 };",
    to: "  return { remaining: left, ranOut: false };", breaks: "C5" },
  { file: DROWN, name: "D3: the suffocation ladder stops being cumulative",
    from: "    penalty: SUFFOCATION_SAVE_STEP * prior,\n    damage: SUFFOCATION_BASE_DAMAGE + SUFFOCATION_DAMAGE_STEP * prior",
    to: "    penalty: SUFFOCATION_SAVE_STEP,\n    damage: SUFFOCATION_BASE_DAMAGE", breaks: "C7" },
  { file: DROWN, name: "D3: the DC climbs instead of the save falling",
    from: "    dc: SUFFOCATION_SAVE_DC,", to: "    dc: SUFFOCATION_SAVE_DC + 2 * prior,", breaks: "C7" },
  { file: DROWN, name: "D3: a critical failure merely hurts",
    from: "  if (criticalFailure) return { passed: false, dies: true, damage: 0 };",
    to: "  if (criticalFailure) return { passed: false, dies: false, damage: 0 };", breaks: "C9" },
  { file: DROWN, name: "D3: air restored always wakes you, whatever else is wrong",
    from: "  return { stopsSuffocating: true, wakes: !otherReasonUnconscious };",
    to: "  return { stopsSuffocating: true, wakes: true };", breaks: "C10" },
  { file: REGISTRY, name: "D3: Suffocating stops carrying Unconscious",
    from: "    label: \"Suffocating\", valued: false, hud: true, icon: \"icons/svg/silenced.svg\",\n    includes: [\"unconscious\"]",
    to: "    label: \"Suffocating\", valued: false, hud: true, icon: \"icons/svg/silenced.svg\"", breaks: "C12" },
  { file: COMBAT, name: "D3 THE DEFECT: the air clock never runs",
    from: "      await advanceDrowningAtTurnEnd(actor, {", to: "      await (async () => null)(actor, {", breaks: "C18" },
  { file: UNDERWF, name: "D3: going under takes no breath",
    from: "  await startHoldingBreath(actor);", to: "", breaks: "C20" },
  { file: CASTWF, name: "D3: a verbal spell underwater costs nothing",
    from: "    await loseAirToEvent(actor, { spoke: true });", to: "", breaks: "C21" },

  { file: ATTACK, name: "D4 THE DEFECT: the critical dice ignore precision immunity",
    from: "  if (!dice || immune) return 0;", to: "  if (!dice) return 0;", breaks: "D2" },
  { file: ATTACK, name: "D4: precision resistance does not halve them",
    from: "  return resisted ? Math.floor(dice / 2) : dice;", to: "  return dice;", breaks: "D2" },
  { file: ATTACK, name: "D4 THE DEFECT: Number(null) is 0 and 0 is finite",
    from: "  const critDice = criticalDice === null || criticalDice === undefined\n    ? (CRITICAL_BONUS_DICE[critical] ?? 0)\n    : Math.max(0, Math.floor(Number(criticalDice) || 0));",
    to: "  const critDice = Number.isFinite(Number(criticalDice))\n    ? Math.max(0, Math.floor(Number(criticalDice)))\n    : (CRITICAL_BONUS_DICE[critical] ?? 0);", breaks: "D5" },
  { file: ATTACKWF, name: "D4: the damage path stops gating the critical dice",
    from: "    criticalDice: drainDice ? 0 : critDiceKept,", to: "", breaks: "D6" },

  { file: ATTACK, name: "D5 THE DEFECT: armour-granted CR is never bypassed",
    from: "  if (!declaredLocation || locationArmoured || !fromArmour) {", to: "  if (true) {", breaks: "E1" },
  { file: ATTACK, name: "D5: the bypass takes the whole CR, not the armour's share",
    from: "  const bypassed = Math.min(total, fromArmour);", to: "  const bypassed = total;", breaks: "E1" },
  { file: ATTACK, name: "D5: an armoured location is bypassed too",
    from: "  if (!declaredLocation || locationArmoured || !fromArmour) {",
    to: "  if (!declaredLocation || !fromArmour) {", breaks: "E1" },
  { file: ATTACKWF, name: "D5: the reduced CR is computed and thrown away",
    from: "    criticalResistance: crBypass.criticalResistance,",
    to: "    criticalResistance: Number(targetActor?.system?.combat?.criticalResistance ?? 0),", breaks: "E4" },

  { file: PARSER, name: "D6/D7 THE DEFECT: every armour kind qualifies for every clause",
    from: "    if (kind === \"metal\" && !state.metal) continue;\n    if (kind === \"rigid\" && !state.rigid) continue;",
    to: "", breaks: "F4" },
  { file: PARSER, name: "D7: the plain clause is taken before the stricter one",
    from: "  const order = [\"metal\", \"rigid\", \"armoured\"];",
    to: "  const order = [\"armoured\", \"metal\", \"rigid\"];", breaks: "F2" },
  { file: PARSER, name: "D8 THE DEFECT: an unarmoured clause lands on an armoured target",
    from: "  if (!armoured) return clauses.find((c) => c.kind === \"unarmoured\") ?? null;",
    to: "  if (!armoured) return null;", breaks: "F10" },
  { file: PARSER, name: "D8: and an armoured target collects it as well",
    from: "    const found = clauses.find((c) => c.kind === kind);",
    to: "    const found = clauses.find((c) => c.kind === kind || c.kind === \"unarmoured\");", breaks: "F10" },
  { file: PARSER, name: "D8: an unarmoured clause damages armour that is not there",
    from: "  return Boolean(clause && clause.kind !== \"unarmoured\");",
    to: "  return Boolean(clause);", breaks: "F13" },
  { file: HITLOC, name: "D6/D7: the armour kind is read from every piece, wherever it is",
    from: "      && armourPieceCoversLocation(item, location));", to: "      );", breaks: "F14" },
  { file: HITLOC, name: "D6/D7: unequipped armour still counts",
    from: "    (item) => item.type === \"armour\" && item.system?.equipped\n      && armourPieceCoversLocation(item, location));",
    to: "    (item) => item.type === \"armour\"\n      && armourPieceCoversLocation(item, location));", breaks: "F15" },

  { file: PARSER, name: "D9 THE DEFECT: a clause that rewrites Persistence is ignored",
    from: "  return extractPersistenceAmendment(clause?.text) ?? String(row?.persistence ?? \"\");",
    to: "  return String(row?.persistence ?? \"\");", breaks: "G2" },
  { file: PARSER, name: "D9: the amendment applies whatever the target wears",
    from: "  const clause = selectArmourClause(row, armour);\n  return extractPersistenceAmendment(clause?.text)",
    to: "  const clause = (row?.armourClauses ?? [])[0] ?? null;\n  return extractPersistenceAmendment(clause?.text)", breaks: "G2" },
  { file: ATTACKWF, name: "D9: the workflow goes back to the printed column",
    from: "  const persistenceInfo = computePersistenceRounds(persistence, severity);",
    to: "  const persistenceInfo = computePersistenceRounds(row.persistence, severity);", breaks: "G4" },
  { file: ATTACKWF, name: "D9: and the Death/Fatal test reads the printed one",
    from: "  const save = deathOrFatalSave({ ...row, persistence }, damageType, attackBonus);",
    to: "  const save = deathOrFatalSave(row, damageType, attackBonus);", breaks: "G5" },

  { file: ATTACKWF, name: "D10 THE DEFECT: Chaos talks about the fumble table again",
    from: "    chaosFumble = await rollChaosFumble(actor, weapon);", to: "    chaosFumble = null;", breaks: "H4" },
  { file: ATTACKWF, name: "D10: the mook path talks about it too",
    from: "    chaosFumble = await rollChaosFumble(attacker ?? targetActor, weapon);",
    to: "    chaosFumble = null;", breaks: "H5" },
  { file: ATTACKWF, name: "D10: a 1 on the fumble does nothing",
    from: "  return { roll: roll.total, row, category, backfires: roll.total === 1, rollObject: roll };",
    to: "  return { roll: roll.total, row, category, backfires: false, rollObject: roll };", breaks: "H3" },
  { file: ATTACKWF, name: "D10: the rebound reads the target's armour instead of the attacker's",
    from: "      const ownArmour = withWholeBodyArmour(armourAtLocation(Array.from(actor.items ?? []), hitLocation), actor.system);",
    to: "      const ownArmour = targetArmour;", breaks: "H7" },

  { file: ATTACKWF, name: "D11 THE DEFECT: the mook keeps the Conviction",
    from: "    await awardConviction(attacker ?? targetActor, chaos.conviction);",
    to: "    await awardConviction(targetActor, chaos.conviction);", breaks: "I2" },
  { file: ATTACKWF, name: "D11: the attacker is never passed in",
    // Re-anchored at 3.668.0: the injury steps sit inside the held blow's guard.
    from: "          attacker: actor,\n          weapon,", to: "          weapon,", breaks: "I4" },

  { file: ATTACK, name: "D12 THE DEFECT: Quick Damage converts nothing",
    from: "  const staticExtra = quickDamage ? (dice + critDice) * quickDamageStatic(faces) : 0;",
    to: "  const staticExtra = 0;", breaks: "J4" },
  { file: ATTACK, name: "D12: it takes the weapon's own dice away as well",
    from: "  const totalDice = count + rolledExtra + mods.extraDice;",
    to: "  const totalDice = rolledExtra + mods.extraDice;", breaks: "J4" },
  { file: ATTACK, name: "D12: the extra dice are rolled AND counted flat",
    from: "  const rolledExtra = quickDamage ? 0 : dice + critDice;",
    to: "  const rolledExtra = dice + critDice;", breaks: "J4" },
  { file: ATTACK, name: "D12: every die converts at the same rate",
    from: "  return QUICK_DAMAGE_TABLE[size] ?? Math.max(1, Math.floor(size / 2) + 1);",
    to: "  return 4;", breaks: "J2" },
  { file: ATTACK, name: "D12: an unlisted die answers its bare average",
    from: "  return QUICK_DAMAGE_TABLE[size] ?? Math.max(1, Math.floor(size / 2) + 1);",
    to: "  return QUICK_DAMAGE_TABLE[size] ?? Math.max(1, Math.floor(size / 2));", breaks: "J3" },
  { file: ATTACKWF, name: "D12: the setting never reaches the formula",
    from: "    quickDamage: setting(\"quickDamage\", false),", to: "", breaks: "J6" },
  { file: SETTINGS, name: "D12: Quick Damage is on for everybody",
    from: "    name: \"Quick Damage\",", to: "    name: \"Quick Damage\", config: false,", breaks: "J7" },

  { file: ATTACK, name: "D13 THE DEFECT: the lethality shift is ignored",
    from: "  const base = 5 + Math.trunc(Number(thresholdShift) || 0);", to: "  const base = 5;", breaks: "K2" },
  { file: ATTACK, name: "D13: the shift moves only the first band",
    from: "  if (effective >= base + increment * 2) {", to: "  if (effective >= 5 + increment * 2) {", breaks: "K2" },
  { file: ATTACK, name: "D13: the shift is applied backwards",
    from: "  const base = 5 + Math.trunc(Number(thresholdShift) || 0);",
    to: "  const base = 5 - Math.trunc(Number(thresholdShift) || 0);", breaks: "K2" },
  { file: ATTACK, name: "D13: attackOutcome drops it on the floor",
    from: "      ? criticalSeverity(criticalAV, criticalResistance, deadly ? 9 : 10, criticalThresholdShift)",
    to: "      ? criticalSeverity(criticalAV, criticalResistance, deadly ? 9 : 10)", breaks: "K5" },

  { file: REGISTRY, name: "D14 THE DEFECT: the location never narrows anything",
    from: "    const narrowed = INJURY_LOCATION_TARGETS[String(injuryLocation ?? \"\").toLowerCase()] ?? null;",
    to: "    const narrowed = null;", breaks: "L5" },
  { file: REGISTRY, name: "D14: an unlisted location narrows to nothing at all",
    from: "    if (narrowed) {\n      for (const target of narrowed) push(target, label, -value(\"injured\"), \"untyped\");\n    } else {",
    to: "    if (true) {\n      for (const target of narrowed ?? []) push(target, label, -value(\"injured\"), \"untyped\");\n    } else {", breaks: "L7" },
  { file: REGISTRY, name: "D14: legs stop penalising speed",
    from: "  legs: [\"system.combat.movement.land\", \"system.skills.acrobatics\"],",
    to: "  legs: [\"system.skills.acrobatics\"],", breaks: "L2" },
  { file: ATTACKWF, name: "D14: the location is never recorded",
    from: "          await injuredEffect.setFlag(SYSTEM_ID, \"injuryLocation\", hitLocation);", to: "", breaks: "L9" },
  { file: ATTACKWF, name: "D14: it is recorded whether the rule is on or not",
    from: "      if (setting(\"specificLocationInjuries\", false)", to: "      if (true", breaks: "L10" },
  { file: ACTOR, name: "D14: the flag is written and read by nobody",
    from: "    .map((e) => e.getFlag?.(\"trg-prime\", \"injuryLocation\"))", to: "    .map(() => null)", breaks: "L11" },

  { file: RIDERS, name: "D15 THE DEFECT: the alternate result is never read",
    from: "    /if\\s+target\\s+has\\s+no\\s+armou?r\\s+use\\s+'?(\\d{1,3})'?\\s+result\\s+instead/i);",
    to: "    /never going to match this/i);", breaks: "M1" },
  { file: RIDERS, name: "D15: every save is the target's own",
    from: "  const adjacent = /\\badjacent\\b/i.test(str.slice(0, match.index + 1));",
    to: "  const adjacent = false;", breaks: "M3" },
  // RETARGETED AT 3.581.0: the save rider was rewritten for D8 (an AP
  // price, and "to X" as well as "to avoid X"), so the cut now happens
  // on its own line rather than in a chain. The rule it mutates is
  // unchanged — Acid 31's "and is Injured 1" must not be swallowed into
  // what the save avoids.
  { file: RIDERS, name: "D15: the save clause swallows what the save does not avoid",
    from: "  const clause = tail.replace(/\\s+and\\s+(is\\s+|takes\\s+)?[A-Z].*$/, \"\").trim();",
    to: "  const clause = tail.trim();", breaks: "M2" },
  { file: RIDERS, name: "D15: the AP price is lost",
    from: "    ap: Math.max(1, Math.trunc(Number(match[1]) || 1)),", to: "    ap: 1,", breaks: "M4" },
  { file: RIDERS, name: "D15: every row offers a free attack",
    from: "  return /\\bfree\\s+attack\\s+with\\s+your\\s+current\\s+MAP\\b/i.test(String(text ?? \"\"));",
    to: "  return true;", breaks: "M5" },
  { file: RIDERS, name: "D15: the flat check's DC is fixed",
    from: "    dc: Math.trunc(Number(match[1]) || 0),", to: "    dc: 5,", breaks: "M6" },
  { file: RIDERS, name: "D15: the flat check keeps the book's truncated tail",
    from: "    .replace(/\\s+and\\s+(is\\s+|takes\\s+)?[A-Z].*$/, \"\")\n    .trim()\n    .replace(/\\s+(and|until)$/i, \"\");",
    to: "    .trim();", breaks: "M6" },
  { file: ATTACKWF, name: "D15: the alternate result is offered rather than applied",
    from: "  if (alternate !== null && !targetArmoured) {", to: "  if (false) {", breaks: "M9" },
  { file: ATTACKWF, name: "D15: the alternate applies to an armoured target too",
    from: "  if (alternate !== null && !targetArmoured) {", to: "  if (alternate !== null) {", breaks: "M9" },
  { file: ATTACKWF, name: "D15: the row's save loses its Injury DC",
    from: "        dc: Number(attackBonus || 0) + 10,", to: "        dc: 15,", breaks: "M12" },
  { file: CARDS, name: "D15: the AP escape lifts the condition without charging",
    from: "          await target.update({ \"system.resources.ap.value\": current - raw.ap });", to: "", breaks: "M14" },

  /* ── the three defects live testing found (3.580.1) ───────────── */
  { file: UNDERWF, name: "F1 THE DEFECT: the swim Speed is read from a path that does not exist",
    from: "  return speedValue(actor?.system?.combat?.movement?.swim) || 0;",
    to: "  return Number(actor?.system?.attributes?.speeds?.swim ?? 0) || 0;", breaks: "B15c" },
  { file: DROWNWF, name: "F2 THE DEFECT: the damage comes from the module that does not export it",
    from: "await import(\"./combat/dying-workflow.mjs\")",
    to: "await import(\"./combat/damage-workflow.mjs\")", breaks: "C16b" },
  { file: DROWNWF, name: "F4 THE DEFECT: the save reads a degree field that does not exist",
    from: "    criticalFailure: CRITICAL_FAILURE_DEGREES.includes(\n      String(check?.outcome?.degree?.key ?? \"\")),",
    to: "    criticalFailure: Boolean(check?.outcome?.degree?.criticalFailure),", breaks: "C17d" },
  { file: DROWNWF, name: "F4: the named degree moves off the Fumble",
    from: "const CRITICAL_FAILURE_DEGREE = \"fumble\";",
    to: "const CRITICAL_FAILURE_DEGREE = \"blunder\";", breaks: "C17d" },
  { file: DROWNWF, name: "F4: the set is listed by hand instead of derived",
    from: "  DEGREES.filter((d) => d.rank <= (DEGREE_BY_KEY[CRITICAL_FAILURE_DEGREE]?.rank ?? -1))\n    .map((d) => d.key));",
    to: "  [\"fumble\", \"blunder\"]);", breaks: "C17d" },
  { file: DROWNWF, name: "F4: the threshold becomes 'worse than' rather than 'at or worse'",
    from: "d.rank <= (DEGREE_BY_KEY[CRITICAL_FAILURE_DEGREE]?.rank ?? -1)",
    to: "d.rank < (DEGREE_BY_KEY[CRITICAL_FAILURE_DEGREE]?.rank ?? -1)", breaks: "C17d" },
  { file: ACTIONWF, name: "F3 THE DEFECT: the check path loses the note again",
    from: "    const notes = placeNotes(actor, action);\n    if (notes.length) await postCard(actor, action.name, notes);",
    to: "    const notes = [];\n    if (notes.length) await postCard(actor, action.name, notes);", breaks: "A9" },
  { file: ACTIONWF, name: "F3: and the no-roll path loses it",
    from: "    lines.push(...placeNotes(actor, action));", to: "", breaks: "A8" },
  { file: ACTIONWF, name: "F3: the water half of the note is dropped",
    from: "  if (water) out.push(line(`<em>${water}</em>`));", to: "", breaks: "A6" },

  /* ── the tables themselves ─────────────────────────────────────── */
  { file: TABLES, name: "N: the word Rigid is stranded on an effect again",
    from: "      \"effect\": \"Side strike breaks ribs. Target is Stunned 2 and Injured 1.\"",
    to: "      \"effect\": \"Side strike breaks ribs. Target is Stunned 2 and Injured 1. Rigid.\"", breaks: "N2" },
  { file: TABLES, name: "N: a rigid clause is filed as an ordinary one",
    from: "      \"effect\": \"Side strike breaks ribs. Target is Stunned 2 and Injured 1.\",\n      \"armourClauses\": [\n        { \"kind\": \"rigid\", \"text\": \"Ignore the Stunned.\" }",
    to: "      \"effect\": \"Side strike breaks ribs. Target is Stunned 2 and Injured 1.\",\n      \"armourClauses\": [\n        { \"kind\": \"armoured\", \"text\": \"Ignore the Stunned.\" }", breaks: "F6" },
  { file: TABLES, name: "N: two clauses are crammed back into one",
    from: "      \"effect\": \"A vicious hack to targets lower leg must open a blood vessel or something. Bleeding 3 & falls prone.\",\n      \"armourClauses\": [\n        { \"kind\": \"armoured\", \"text\": \"Reduce bleeding by 1.\" },\n        { \"kind\": \"rigid\", \"text\": \"Reduce bleeding by 2.\" }",
    to: "      \"effect\": \"A vicious hack to targets lower leg must open a blood vessel or something. Bleeding 3 & falls prone.\",\n      \"armourClauses\": [\n        { \"kind\": \"armoured\", \"text\": \"Reduce bleeding by 1. Rigid Armoured: Reduce bleeding by 2.\" }",
    breaks: "F1" },
  { file: TABLES, name: "N: subdual is made as deadly as the rest",
    from: "      \"persistence\": \"Fatal\",\n      \"effect\": \"Skull is fractured and brain damage occurs. Target is Unconscious and Dazed 6.\"",
    to: "      \"persistence\": \"Death\",\n      \"effect\": \"Skull is fractured and brain damage occurs. Target is Unconscious and Dazed 6.\"",
    breaks: "N5" },

  /* ── the rest of the new rules, one line at a time ─────────────── */
  { file: DROWN, name: "R3: a feat's multiplier is ignored",
    from: "  const factor = Math.max(1, Math.trunc(Number(multiplier) || 1));", to: "  const factor = 1;", breaks: "C2" },
  { file: DROWN, name: "R3: spending more air than there is goes negative",
    from: "  const left = Math.max(0, had - spend);", to: "  const left = had - spend;", breaks: "C5" },
  { file: DROWN, name: "R3: a passed save still deals its damage",
    from: "  return { passed, dies: false, damage: passed ? 0 : Math.max(0, Math.trunc(Number(damage) || 0)) };",
    to: "  return { passed, dies: false, damage: Math.max(0, Math.trunc(Number(damage) || 0)) };", breaks: "C9" },
  { file: UNDER, name: "R2: the resistances change",
    from: "_RESISTANCES = Object.freeze([\"acid\", \"fire\"]);",
    to: "_RESISTANCES = Object.freeze([\"acid\", \"cold\"]);", breaks: "B2" },
  { file: UNDER, name: "R2: the melee penalty changes",
    from: "_MELEE_PENALTY = -2;",
    to: "_MELEE_PENALTY = -1;", breaks: "B3" },
  { file: UNDER, name: "R2: piercing joins the blocked types",
    from: "_BLOCKED_RANGED = Object.freeze([\"bludgeoning\", \"slashing\"]);",
    to: "_BLOCKED_RANGED = Object.freeze([\"bludgeoning\", \"slashing\", \"piercing\"]);",
    breaks: "B5" },
  { file: UNDER, name: "R2: the ground-action note stops naming the page",
    from: "  return `<strong>${actionName} underwater.</strong> Page 201: some ground-based actions `",
    to: "  return `<strong>${actionName} underwater.</strong> Some ground-based actions `", breaks: "B12" },
  { file: ATTACK, name: "R4: the printed bonus dice change",
    from: "_BONUS_DICE = Object.freeze({ minor: 1, serious: 2, deadly: 3 });",
    to: "_BONUS_DICE = Object.freeze({ minor: 1, serious: 2, deadly: 4 });", breaks: "D1" },
  { file: ATTACK, name: "R12: a table row changes",
    from: "  2: 1, 3: 2, 4: 3, 6: 4, 8: 5, 10: 6, 12: 7", to: "  2: 1, 3: 2, 4: 3, 6: 3, 8: 5, 10: 6, 12: 7",
    breaks: "J1" },
  { file: DROWNWF, name: "R3: the cumulative penalty never reaches the roll",
    from: "    modifiers.push({ label: \"Suffocating\", value: plan.penalty, type: \"status\" });", to: "", breaks: "C15" },
  { file: DROWNWF, name: "R3: a critical failure does not kill",
    from: "    await actor.toggleStatusEffect(\"dead\", { active: true });", to: "", breaks: "C16" },
  { file: DROWNWF, name: "R3: running out of air applies nothing",
    from: "  await actor.toggleStatusEffect(\"suffocating\", { active: true });", to: "", breaks: "C17" },
  { file: COMBAT, name: "R3: attacking no longer costs the second round of air",
    from: "        actedViolently: Number(actor.getFlag?.(SYSTEM_ID, \"attackCount\") ?? 0) > 0",
    to: "        actedViolently: false", breaks: "C19" },
  { file: UNDERWF, name: "R2: leaving the water does not restore air",
    from: "    } else {\n      await restoreAir(actor);\n    }\n    await ChatMessage.create({", to: "    } else {\n    }\n    await ChatMessage.create({", breaks: "C20" },
  { file: UNDERWF, name: "R2: the resistances are written as a number",
    from: "      key: \"system.combat.resistances\",", to: "      key: \"system.combat.drBonus\",", breaks: "B16" },
  { file: ATTACKWF, name: "R2: the increment is halved before Archer and Far Shot lengthen it",
    from: "    if (waterRanged.rangeIncrementFactor !== 1) {\n      rangeIncrement = Math.max(1, Math.floor(rangeIncrement * waterRanged.rangeIncrementFactor));\n    }",
    to: "", breaks: "B20" },
  { file: ATTACKWF, name: "R5: the declared location is never read",
    from: "  const declaredLocation = actor.getFlag?.(SYSTEM_ID, \"vitalStrikeLocation\") ?? null;",
    to: "  const declaredLocation = null;", breaks: "E3" },
  { file: ATTACKWF, name: "R9: the UH/FR/P record keeps the printed column",
    from: "        code: persistence,", to: "        code: row.persistence,", breaks: "G6" },
  { file: ATTACKWF, name: "R15: the buttons stop being offered",
    from: "        `<button type=\"button\" data-action=\"criticalRowSave\" style=\"width:100%\">`",
    to: "        `<span>`", breaks: "M11" },
  { file: CARDS, name: "R15: the save button is never bound",
    from: "    for (const button of html.querySelectorAll?.('[data-action=\"criticalRowSave\"]') ?? []) {",
    to: "    for (const button of []) {", breaks: "M13" },
  { file: ALCH, name: "R11: the bomb path stops naming the attacker",
    from: "damageType, attacker: actor });", to: "damageType });", breaks: "I5" },
  { file: SETTINGS, name: "R13: the lethality lever starts somewhere other than the printed numbers",
    from: "    type: Number,\n    default: 0,\n    range: { min: -4, max: 10, step: 1 }",
    to: "    type: Number,\n    default: 2,\n    range: { min: -4, max: 10, step: 1 }", breaks: "K6" },
  { file: ATTACKWF, name: "R13: the attack path stops reading the lever",
    from: "    criticalThresholdShift: Number(setting(\"criticalThresholdShift\", 0) || 0),", to: "", breaks: "K7" },
  { file: PARSER, name: "R6-R8: a boolean qualifies for the strict clauses",
    from: "    ? { armoured: armour, rigid: false, metal: false }",
    to: "    ? { armoured: armour, rigid: true, metal: true }", breaks: "F12" },
  { file: PARSER, name: "R9: any word after 'persistence becomes' is taken",
    from: "    /\\bpersistence\\s+becomes\\s+(Death|Fatal|UH|FR|[MDP])\\b/i);",
    to: "    /\\bpersistence\\s+becomes\\s+(\\w+)\\b/i);", breaks: "G1" }
];

function run() {
  try {
    execFileSync("node", [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const files = Array.from(new Set(MUTATIONS.map((m) => m.file)));
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

if (!run()) {
  console.error("mutate-chapter7-critical-201-210: the check FAILS before any mutation.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

if (survived || unmatched) {
  console.error(
    `\nmutate-chapter7-critical-201-210: FAILED — ${survived} survived, ${unmatched} unmatched.\n`);
  process.exit(1);
}
console.log(
  `\nmutate-chapter7-critical-201-210: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
