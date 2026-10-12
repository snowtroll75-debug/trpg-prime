#!/usr/bin/env node
/**
 * mutate-chapter7-combat-191-200 — can the pages 191-200 checks fail?
 *
 * NEW at 3.579.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back as it stood where one line can
 * put it back: a Disarm that takes no multiple attack penalty, a spell
 * attack that takes none either, a stray shot that strikes nobody, cover
 * that gives DB and nothing else, a Tiny creature with a five-foot reach,
 * a flank granted by an unconscious ally, a move straight through an
 * enemy, a creature aura that charges fliers, and a bomb card quoting DC
 * 15. Then every new rule, one line at a time.
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
const CASTDC = at("magic", "casting-dc.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const RANGED = at("combat", "ranged.mjs");
const STANCES = at("combat", "basic-action-stances.mjs");
const INJURIES = at("injuries.mjs");
const INJURYWF = at("injury-workflow.mjs");
const DEATH = at("combat", "death-state.mjs");
const COMBAT = at("documents", "combat.mjs");
const CONFIG = at("config.mjs");
const SPACE = at("combat", "space.mjs");
const GEOMETRY = at("combat", "geometry.mjs");
const FLANKING = at("combat", "flanking.mjs");
const MOVEWF = at("combat", "movement-workflow.mjs");
const MOUNTED = at("combat", "mounted.mjs");
const MOUNTEDWF = at("combat", "mounted-workflow.mjs");
const AURAWF = at("creature-aura-workflow.mjs");
const TERRAIN = at("magic", "difficult-terrain.mjs");
const SURFACES = at("combat", "surfaces.mjs");
const EXHAUST = at("exhaustion.mjs");
const EXHAUSTWF = at("combat", "exhaustion-workflow.mjs");
const CONDMGR = at("conditions", "manager.mjs");
const SKILLACT = at("data", "skill-actions.mjs");
const BASICACT = at("data", "basic-actions.mjs");
const BOMBWF = at("alchemical-workflow.mjs");
const CARDS = at("dice", "check-card-interactions.mjs");
const SPELLFX = at("magic", "spell-effects.mjs");
const RESTWF = at("rest", "rest-workflow.mjs");
const APWF = at("combat", "action-points-workflow.mjs");
const HOOK = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter7-combat-191-200.mjs");

const MUTATIONS = [
  /* ── the defects, put back ─────────────────────────────────────── */
  { file: ACTIONWF, name: "D1 THE DEFECT: a Disarm takes no multiple attack penalty",
    from: "  if (countsTowardMAP(action.traits) && !mapExempt) {\n    const map = mapPenalty(Number(actor.getFlag(SYSTEM_ID, \"attackCount\") ?? 0));",
    to: "  if (false) {\n    const map = mapPenalty(Number(actor.getFlag(SYSTEM_ID, \"attackCount\") ?? 0));", breaks: "A8" },
  { file: ACTIONWF, name: "D1 THE DEFECT: and never advances the counter",
    from: "  if (check && countsTowardMAP(action.traits)) {", to: "  if (false) {", breaks: "A8" },
  { file: CASTWF, name: "D1 THE DEFECT: a spell attack takes none either",
    from: "  const spellMap = spellCountsTowardMAP(spellData) ? mapPenalty(mapBefore) : 0;",
    to: "  const spellMap = 0;", breaks: "A9" },
  { file: ATTACKWF, name: "D2 THE DEFECT: a stray shot strikes nobody",
    from: "      strayStruckToken = struckToken ?? null;", to: "", breaks: "B1" },
  { file: ATTACKWF, name: "D2 THE DEFECT: the stray damage lands on the aimed target",
    from: "      targetTokenOverride: strayStruckToken", to: "      targetTokenOverride: null", breaks: "B2" },
  { file: ATTACKWF, name: "D3 THE DEFECT: no line of sight is ever measured",
    from: "    if (lineOfSightNote === null && lineOfEffectBlocked(attackerToken.center, targetToken.center)) {",
    to: "    if (false) {", breaks: "C1" },
  { file: STANCES, name: "D4 THE DEFECT: standard cover gives DB and nothing else",
    from: "      { key: \"system.combat.saves.reflex.circumstance\", value: 4 },\n      { key: \"system.skills.stealth.circumstance\", value: 4 }",
    to: "      { key: \"system.skills.stealth.circumstance\", value: 4 }", breaks: "D3" },
  { file: STANCES, name: "D4 THE DEFECT: greater cover gives no Reflex",
    from: "      { key: \"system.combat.saves.reflex.circumstance\", value: 8 },", to: "", breaks: "D4" },
  { file: CONFIG, name: "D12 THE DEFECT: a Tiny creature threatens the next square",
    from: "  tiny: { label: \"Tiny\", baseHP: 10, strMod: -2, dexMod: 2, reach: 0,",
    to: "  tiny: { label: \"Tiny\", baseHP: 10, strMod: -2, dexMod: 2, reach: 5,", breaks: "L1" },
  { file: ATTACK, name: "D12 THE DEFECT: a reach of zero becomes five again",
    from: "  const base = Number.isFinite(declared) ? Math.max(0, declared) : 5;",
    to: "  const base = Number(normalReach) || 5;", breaks: "L5" },
  { file: FLANKING, name: "D14 THE DEFECT: an unconscious ally still flanks",
    from: "  const blocked = CANNOT_THREATEN.find((c) => active.has(c));", to: "  const blocked = null;", breaks: "N2" },
  { file: SPACE, name: "D15 THE DEFECT: you may walk straight through an enemy",
    from: "  return {\n    allowed: false, needsTumble: true, multiplier: 1,",
    to: "  return {\n    allowed: true, needsTumble: false, multiplier: 1,", breaks: "O4" },
  { file: SPACE, name: "D15 THE DEFECT: and end your turn inside one",
    from: "  if (!sharesSquare(moverSize)) {\n    return { allowed: false,",
    to: "  if (false) {\n    return { allowed: false,", breaks: "L6" },
  { file: AURAWF, name: "D16 THE DEFECT: a creature aura charges fliers",
    from: "    ? [...DEFAULT_AURA_MOVEMENTS]", to: "    ? [...ALL_MOVEMENTS]", breaks: "P4" },
  { file: BOMBWF, name: "D20 THE DEFECT: the bomb card quotes DC 15",
    from: "until a DC ${RECURRING_FLAT_CHECK_DC} flat check ends it", to: "until a DC 15 flat check ends it", breaks: "S2" },

  /* ── the multiple attack penalty ───────────────────────────────── */
  { file: ATTACK, name: "R1: anything rolled counts, trait or not",
    from: "  return /(^|[,\\s])attack([,\\s]|$)/i.test(String(source ?? \"\"));", to: "  return true;", breaks: "A1" },
  { file: ATTACK, name: "R1: a substring counts as the trait",
    from: "  return /(^|[,\\s])attack([,\\s]|$)/i.test(String(source ?? \"\"));",
    to: "  return /attack/i.test(String(source ?? \"\"));", breaks: "A1" },
  { file: ATTACK, name: "R1: a save spell counts as an attack",
    from: "  return String(spellData?.category ?? \"\").trim().toLowerCase() === \"attack\";", to: "  return true;", breaks: "A3" },
  { file: CASTDC, name: "R1: the MAP term is added rather than subtracted",
    from: "  total += push(parts, \"Multiple attack penalty\", Math.min(0, int(map)));",
    to: "  total += push(parts, \"Multiple attack penalty\", Math.abs(int(map)));", breaks: "A7" },

  /* ── the subdual critical ──────────────────────────────────────── */
  { file: ATTACK, name: "R5: any critical reduced to zero becomes subdual, DR or not",
    from: "  if (!(Number(drApplied) > 0)) return false;", to: "", breaks: "E2" },
  { file: ATTACK, name: "R5: a blow that dealt nothing becomes a subdual critical",
    from: "  if (!(Number(total) > 0)) return false;", to: "", breaks: "E2" },
  { file: ATTACK, name: "R5: a subdual critical converts to itself for ever",
    from: "  if (String(damageType).trim().toLowerCase() === \"subdual\") return false;", to: "", breaks: "E2" },
  { file: ATTACK, name: "R5: a plain hit converts too",
    from: "  if (!critical) return false;", to: "", breaks: "E2" },
  { file: ATTACKWF, name: "R5: the damage step never asks",
    from: "    drStoppedCritical = criticalBecomesSubdual({", to: "    drStoppedCritical = false && criticalBecomesSubdual({", breaks: "E3" },

  /* ── cover ─────────────────────────────────────────────────────── */
  { file: RANGED, name: "R4: lesser cover is enough to hide behind",
    from: "  return Boolean(COVER_TYPES[String(coverKey ?? \"\").trim().toLowerCase()]?.canHide);", to: "  return true;", breaks: "D2" },
  { file: ACTIONWF, name: "R4: Hide is never refused",
    from: "    if (level && !coverAllowsHide(level)) {", to: "    if (false) {", breaks: "D7" },

  /* ── injuries ──────────────────────────────────────────────────── */
  { file: INJURIES, name: "p.194: a value of 4 is a Serious injury",
    from: "  { key: \"minor\", label: \"Minor\", min: 1, max: 4 },", to: "  { key: \"minor\", label: \"Minor\", min: 1, max: 3 },", breaks: "F1" },
  { file: INJURIES, name: "p.194: a value of 8 is still Serious",
    from: "  { key: \"deadly\", label: \"Deadly\", min: 8, max: Infinity }",
    to: "  { key: \"deadly\", label: \"Deadly\", min: 9, max: Infinity }", breaks: "F1" },
  { file: INJURIES, name: "R6(a): fatigue counts toward the combined value",
    from: "INJURY_CONDITION_IDS = Object.freeze([\"dazed\", \"injured\", \"weakened\"]);",
    to: "INJURY_CONDITION_IDS = Object.freeze([\"dazed\", \"injured\", \"weakened\", \"fatigued\"]);", breaks: "F3" },
  { file: INJURIES, name: "R6(b): unconscious only above 10",
    from: "  return Number(combined) >= INCAPACITATION_THRESHOLD;", to: "  return Number(combined) > INCAPACITATION_THRESHOLD;", breaks: "F4" },
  { file: INJURIES, name: "R6: the Unconscious is lifted whoever applied it",
    from: "  if (owned && has && !otherReasonUnconscious) return { apply: false, remove: true, owned: false };",
    to: "  if (has) return { apply: false, remove: true, owned: false };", breaks: "F5" },

  /* ── treating injuries ─────────────────────────────────────────── */
  { file: INJURIES, name: "p.194: a Serious injury is treated at DC 20",
    from: "  serious: Object.freeze({ dc: 24, days: 10, becomes: \"minor\", needsTreatment: true }),",
    to: "  serious: Object.freeze({ dc: 20, days: 10, becomes: \"minor\", needsTreatment: true }),", breaks: "G1" },
  { file: INJURIES, name: "p.194: a Deadly injury steps down in 10 days",
    from: "  deadly: Object.freeze({ dc: 30, days: 20, becomes: \"serious\", needsTreatment: true })",
    to: "  deadly: Object.freeze({ dc: 30, days: 10, becomes: \"serious\", needsTreatment: true })", breaks: "G4" },
  { file: INJURIES, name: "p.194: an untreated Serious injury heals itself",
    from: "  if (row.needsTreatment && !treated) {", to: "  if (false) {", breaks: "G3" },
  { file: INJURIES, name: "p.194: the check does not halve a Minor injury's rest",
    from: "  let days = row.needsTreatment ? row.days : (treated ? Math.ceil(row.days / 2) : row.days);",
    to: "  let days = row.days;", breaks: "G2" },
  { file: INJURIES, name: "p.194: a step down heals the injury outright",
    from: "  return target ? Math.min(Math.floor(Number(value)) - 1, target.max) : 0;", to: "  return 0;", breaks: "G5" },
  { file: INJURIES, name: "p.194: a stepped-down injury needs treating again",
    from: "  return Boolean(INJURY_TREATMENT[String(fromSeverity ?? \"\").toLowerCase()]?.needsTreatment);",
    to: "  return false;", breaks: "G6" },
  { file: SKILLACT, name: "R7: Treat Injury's old Crippling fumble returns",
    from: "      fumble: \"\",\n      blunder: \"\"\n    },\n    description: \"Spend at least 8 hours caring for a living creature with an Injury,",
    to: "      fumble: \"The injury increases in severity by one step. If it was already Crippling, the target must make a Fortitude Saving Throw against their own attack level or die.\",\n      blunder: \"\"\n    },\n    description: \"Spend at least 8 hours caring for a living creature with an Injury,",
    breaks: "G7" },
  { file: ACTIONWF, name: "R7: the DC is not read from the patient",
    from: "    resolved.dc = treatInjurySetup.dc;", to: "", breaks: "G9" },

  /* ── fatal injuries ────────────────────────────────────────────── */
  { file: INJURIES, name: "R8: only a row saying Fatal is fatal",
    from: "  return /\\b(fatal|death)\\b/i.test(String(persistenceCode ?? \"\"));",
    to: "  return /\\bfatal\\b/i.test(String(persistenceCode ?? \"\"));", breaks: "H1" },
  { file: INJURIES, name: "R8: a Fatal injury stops nothing",
    from: "  return !(Number(fatalCount) > 0);", to: "  return true;", breaks: "H2" },
  { file: DEATH, name: "R8: Dying is lost despite the Fatal injury",
    from: "  if (!mayLeaveDying(actor)) {", to: "  if (false) {", breaks: "H3" },
  { file: ATTACKWF, name: "R8: a Fatal row leaves no mark",
    from: "    if (isFatalPersistence(row.persistence)) {", to: "    if (false) {", breaks: "H5" },

  /* ── persistence ───────────────────────────────────────────────── */
  { file: INJURIES, name: "R9: a compound row is not a kind at all",
    from: "  const first = String(raw ?? \"\").trim().split(/[/\\s]+/)[0]?.toUpperCase() ?? \"\";",
    to: "  const first = String(raw ?? \"\").trim().toUpperCase();", breaks: "I1" },
  { file: INJURIES, name: "R9: Until Healed clears without full HP",
    from: "    if (!fullHP) return false;", to: "", breaks: "I2" },
  { file: INJURIES, name: "R9: five minutes' rest clears Until Healed",
    from: "    return Boolean(magicalHealing) || Number(restMinutes) >= 10;",
    to: "    return Boolean(magicalHealing) || Number(restMinutes) >= 5;", breaks: "I2" },
  { file: INJURIES, name: "R9: Full Rest clears in seven hours",
    from: "  if (kind === \"FR\") return Number(sleepHours) >= 8;", to: "  if (kind === \"FR\") return Number(sleepHours) >= 7;", breaks: "I3" },
  { file: INJURIES, name: "R9: Permanent clears with everything else",
    from: "  return false;\n}\n\n/* ------------------------------------------------------------------ */\n/* Fatal injuries (page 193; R8)",
    to: "  return true;\n}\n\n/* ------------------------------------------------------------------ */\n/* Fatal injuries (page 193; R8)", breaks: "I4" },
  { file: INJURIES, name: "R9: bleeding takes the Persistence clock again",
    from: "const SELF_TIMED_CONDITION_IDS = Object.freeze([\"bleeding\", \"recurring\", \"sickened\"]);",
    to: "const SELF_TIMED_CONDITION_IDS = Object.freeze([\"recurring\", \"sickened\"]);", breaks: "I5" },
  { file: ATTACKWF, name: "R9: the self-timed conditions take the clock too",
    from: "          applyConditionTags(targetActor, selfTimed, {})));",
    to: "          applyConditionTags(targetActor, selfTimed, { expiresRound })));", breaks: "I6" },

  /* ── fast healing and regeneration ─────────────────────────────── */
  { file: INJURIES, name: "R10: Fast Healing reduces Injured every ten minutes",
    from: "FAST_HEALING_INJURY_SECONDS = 3600;", to: "FAST_HEALING_INJURY_SECONDS = 600;", breaks: "J1" },
  { file: INJURIES, name: "R10: Regeneration reduces it hourly",
    from: "REGENERATION_INJURY_SECONDS = 600;", to: "REGENERATION_INJURY_SECONDS = 3600;", breaks: "J1" },
  { file: INJURIES, name: "R10: a part period heals a full one",
    from: "  const periods = Math.floor(elapsed / per);", to: "  const periods = Math.ceil(elapsed / per);", breaks: "J2" },
  { file: INJURIES, name: "R10: the remainder is thrown away",
    from: "  return { reduction: value * periods, periods, remainder: elapsed - periods * per };",
    to: "  return { reduction: value * periods, periods, remainder: 0 };", breaks: "J2" },

  /* ── the Dying Check's Chaos row ───────────────────────────────── */
  { file: COMBAT, name: "R11: Chaos on the Dying Check says nothing",
    from: "    if (check?.dice?.chaos) {", to: "    if (false) {", breaks: "K1" },

  /* ── size, space and movement ──────────────────────────────────── */
  { file: CONFIG, name: "R12: six Tiny creatures share a square",
    from: "  tiny: { label: \"Tiny\", baseHP: 10, strMod: -2, dexMod: 2, reach: 0, space: 5, sharesSquare: true, perSquare: 4 },",
    to: "  tiny: { label: \"Tiny\", baseHP: 10, strMod: -2, dexMod: 2, reach: 0, space: 5, sharesSquare: true, perSquare: 6 },",
    breaks: "L2" },
  { file: CONFIG, name: "R12: a Medium creature shares a square",
    from: "  medium: { label: \"Medium\", baseHP: 30, strMod: 0, dexMod: 0, reach: 5, space: 5, sharesSquare: false, perSquare: 1 },",
    to: "  medium: { label: \"Medium\", baseHP: 30, strMod: 0, dexMod: 0, reach: 5, space: 5, sharesSquare: true, perSquare: 1 },",
    breaks: "L3" },
  { file: SPACE, name: "R12: a reach of zero strikes at five feet",
    from: "  if (reach > 0) return { allowed: true, mustShareSquare: false };", to: "  return { allowed: true, mustShareSquare: false };", breaks: "L4" },
  { file: SPACE, name: "R15: two sizes apart is free passage",
    from: "const FREE_PASSAGE_STEPS = 3;", to: "const FREE_PASSAGE_STEPS = 2;", breaks: "O2" },
  { file: SPACE, name: "R15: a larger prone creature is only difficult ground",
    from: "    return steps > 0\n      ? { allowed: true, needsTumble: false, multiplier: FORMIDABLE_MULTIPLIER,",
    to: "    return steps > 0\n      ? { allowed: true, needsTumble: false, multiplier: DIFFICULT_MULTIPLIER,", breaks: "O3" },
  { file: SPACE, name: "R15: an ally's square costs double",
    from: "  if (ally) return { allowed: true, needsTumble: false, multiplier: 1, reason: \"a willing ally\" };",
    to: "  if (ally) return { allowed: true, needsTumble: false, multiplier: 2, reason: \"a willing ally\" };", breaks: "O1" },
  { file: SPACE, name: "R15: a critical Tumble still costs double",
    from: "      multiplier: String(tumbled) === \"normal\" ? 1 : DIFFICULT_MULTIPLIER,", to: "      multiplier: DIFFICULT_MULTIPLIER,", breaks: "O5" },
  { file: MOVEWF, name: "R15: the refusal is never acted on",
    from: "  if (space.refused) {", to: "  if (false) {", breaks: "O6" },
  { file: MOVEWF, name: "R15: the surcharge is never charged",
    // RE-ANCHORED AT 3.606.0: the sum is named `surcharged` now, because a
    // Spirit Trap's difficult-terrain floor is applied to it next.
    from: "  const surcharged = measured + Math.max(0, Number(space.surcharge) || 0);", to: "  const surcharged = measured;", breaks: "O7" },
  { file: MOVEWF, name: "R15: the Tumble marker survives the turn",
    from: "  for (const flag of [MOVED_FLAG, ARMED_FLAG, TUMBLE_FLAG, ...LEGACY_FLAGS]) {",
    to: "  for (const flag of [MOVED_FLAG, ARMED_FLAG, ...LEGACY_FLAGS]) {", breaks: "O8" },
  { file: GEOMETRY, name: "R12: engagement turns a reach of zero into five",
    from: "    const reachFeet = declared === undefined ? 5 : Math.max(0, declared);", to: "    const reachFeet = declared || 5;", breaks: "L7" },

  /* ── mounted combat ────────────────────────────────────────────── */
  { file: MOUNTED, name: "R13: the shared pool is the larger of the two",
    from: "  return Math.min(a, b);", to: "  return Math.max(a, b);", breaks: "M1" },
  { file: MOUNTED, name: "R13: the rider keeps their own reach",
    from: "  return Math.max(rider, mount);", to: "  return rider;", breaks: "M2" },
  { file: MOUNTED, name: "R13: the +2 applies against another rider too",
    from: "  return attackerMounted && !targetMounted ? MOUNTED_ATTACK_BONUS : 0;",
    to: "  return attackerMounted ? MOUNTED_ATTACK_BONUS : 0;", breaks: "M3" },
  { file: MOUNTED, name: "p.200: a mount of your own size will do",
    from: "  return Number(sizeStepsLargerThanRider) >= 1;", to: "  return Number(sizeStepsLargerThanRider) >= 0;", breaks: "M4" },
  { file: MOUNTED, name: "R13: the defence offer forgets the cover",
    from: "    + `and if ${mountName} is in the way, ${riderName} has lesser cover (+2 circumstance DB) against this attack.`;",
    to: "    + \"\";", breaks: "M5" },
  { file: ATTACKWF, name: "R13: the shared counter is the rider's alone",
    from: "  const attackIndex = await sharedMapCount(actor);",
    to: "  const attackIndex = Number(actor.getFlag(SYSTEM_ID, \"attackCount\") ?? 0);", breaks: "M7" },
  { file: MOUNTEDWF, name: "R13: the mount keeps its own initiative",
    from: "    await steedCombatant.update({ initiative: rider });", to: "", breaks: "M9" },

  /* ── flanking ──────────────────────────────────────────────────── */
  { file: FLANKING, name: "R14: a fleeing ally still flanks",
    from: "const NOT_FIGHTING_THIS_ENEMY = Object.freeze([\"confused\", \"fleeing\"]);",
    to: "const NOT_FIGHTING_THIS_ENEMY = Object.freeze([]);", breaks: "N3" },
  { file: FLANKING, name: "R14: an ally with no melee attack still flanks",
    from: "  if (!canStrike) return { threatens: false, reason: \"has no melee attack\" };", to: "", breaks: "N4" },
  { file: FLANKING, name: "R14: reach is not asked",
    from: "  if (distanceFeet !== null && Number(distanceFeet) > Math.max(0, Number(reachFeet) || 0)) {", to: "  if (false) {", breaks: "N5" },
  { file: FLANKING, name: "R14: an unmeasurable distance refuses the flank",
    from: "  if (distanceFeet !== null && Number(distanceFeet) > Math.max(0, Number(reachFeet) || 0)) {",
    to: "  if (Number(distanceFeet ?? 999) > Math.max(0, Number(reachFeet) || 0)) {", breaks: "N5" },
  { file: ATTACKWF, name: "R14: the attack path asks nothing of the ally",
    from: "          if (!verdict.threatens) {", to: "          if (false) {", breaks: "N6" },

  /* ── terrain ───────────────────────────────────────────────────── */
  { file: TERRAIN, name: "R16: x3 ground is called difficult terrain",
    from: "  return int(multiplier) >= FORMIDABLE_MULTIPLIER ? \"formidable terrain\" : \"difficult terrain\";",
    to: "  return \"difficult terrain\";", breaks: "P1" },
  { file: TERRAIN, name: "R16: x2 ground is called formidable",
    from: "  return int(multiplier) >= FORMIDABLE_MULTIPLIER ? \"formidable terrain\" : \"difficult terrain\";",
    to: "  return \"formidable terrain\";", breaks: "P3" },
  { file: TERRAIN, name: "R16: the Region's name forgets which kind it is",
    from: "  const parts = [spec?.air ? `${kind}, flying only` : kind];",
    to: "  const parts = [spec?.air ? \"difficult terrain, flying only\" : \"difficult terrain\"];", breaks: "P2" },

  /* ── unusual surfaces ──────────────────────────────────────────── */
  { file: SURFACES, name: "R17: a Region named for one is not one",
    from: "  if (!raw && !named) return null;", to: "  if (!raw) return null;", breaks: "Q1" },
  { file: SURFACES, name: "R17: moving on one is not flat-footed",
    from: "  if (!list.length || !moved) {", to: "  if (true) {", breaks: "Q2" },
  { file: SURFACES, name: "R17: a move that never happened is still flat-footed",
    from: "  if (!list.length || !moved) {", to: "  if (!list.length) {", breaks: "Q2" },
  { file: SURFACES, name: "R17: the easiest surface decides the DC",
    from: "    dc: dcs.length ? Math.max(...dcs) : null", to: "    dc: dcs.length ? Math.min(...dcs) : null", breaks: "Q2" },
  { file: SURFACES, name: "R17: being struck on one rolls rather than offers",
    from: "  return `<strong>${defenderName} is on ${list.join(\" and \")}.</strong> Page 196: the GM may call `",
    to: "  return `<strong>${defenderName} is on ${list.join(\" and \")}.</strong> Page 196: roll `", breaks: "Q3" },
  { file: MOVEWF, name: "R17: the movement hook applies nothing",
    from: "  if (displaced) applySurfaceEffects(mover, surfacesOnPath(movement));", to: "", breaks: "Q5" },

  /* ── exhaustion, and the recurring lever ───────────────────────── */
  { file: EXHAUST, name: "R18: encumbrance is not counted",
    from: "  return -(armour + load);", to: "  return -armour;", breaks: "R1" },
  { file: EXHAUST, name: "R18: the ACP is applied as a bonus",
    from: "  return -(armour + load);", to: "  return armour + load;", breaks: "R1" },
  { file: EXHAUST, name: "R18: Will is the default save",
    from: "  return String(choice ?? \"\").trim().toLowerCase() === \"will\" ? \"will\" : \"fortitude\";", to: "  return \"will\";", breaks: "R2" },
  { file: EXHAUSTWF, name: "R18: the load never reaches the check",
    from: "  if (load) {", to: "  if (false) {", breaks: "R3" },
  { file: COMBAT, name: "R18: the recurring flat check has no lever",
    from: "    const recurringDC = Math.max(1, RECURRING_FLAT_CHECK_DC - recurringEasier);",
    to: "    const recurringDC = RECURRING_FLAT_CHECK_DC;", breaks: "R6" },
  { file: CONDMGR, name: "R18: the dialog offers no lever",
    from: "  const reductionRow = [\"bleeding\", \"recurring\"].includes(id)", to: "  const reductionRow = false", breaks: "R7" },

  /* ── the wiring that carries them ──────────────────────────────── */
  { file: HOOK, name: "the injury hooks are never registered",
    from: "  registerInjuryHooks();", to: "", breaks: "F7" },
  { file: INJURYWF, name: "R10: the world clock heals nothing",
    from: "  Hooks.on(\"updateWorldTime\", async (_worldTime, delta) => {", to: "  Hooks.once(\"nothing\", async (_worldTime, delta) => {", breaks: "J4" },
  { file: SPELLFX, name: "R9: healing to full clears no Until Healed injury",
    from: "    const cleared = await settlePersistence(actor, { fullHP: true, magicalHealing: true });",
    to: "    const cleared = [];", breaks: "I10" },
  { file: RESTWF, name: "R9: a rest settles no persistence",
    from: "  const persistenceCleared = await settlePersistence(actor, {", to: "  const persistenceCleared = [] ?? await settlePersistence(actor, {", breaks: "I9" },
  { file: APWF, name: "R13: a spend never reaches the mount",
    from: "    await syncSharedAP(actor, result.newValue);", to: "", breaks: "M8" },
  { file: CARDS, name: "R5: the subdual button re-rolls on the weapon's own table",
    from: "            damageType: \"subdual\",", to: "            damageType: \"slashing\",", breaks: "E6" },
  { file: CARDS, name: "R8: the Fatal mark is never cleared",
    from: "          await clearFatalInjury(target);", to: "", breaks: "H6" },

  /* ── what the 3.579.0 live test found ──────────────────────────── */
  { file: SURFACES, name: "F4 THE DEFECT: the Region document is asked first, and answers false",
    from: "    if (typeof placeable?.testPoint === \"function\") return Boolean(placeable.testPoint(point));\n    if (typeof region?.testPoint === \"function\") return Boolean(region.testPoint(point));",
    to: "    if (typeof region?.testPoint === \"function\") return Boolean(region.testPoint(point));\n    if (typeof placeable?.testPoint === \"function\") return Boolean(placeable.testPoint(point));",
    breaks: "Q7" },
  { file: SURFACES, name: "F4: standing on one is measured rather than asked",
    from: "    const inside = region.tokens?.has?.(tokenDocument)", to: "    const inside = false && region.tokens?.has?.(tokenDocument)",
    breaks: "Q8" },
  { file: SPACE, name: "F3 THE DEFECT: sizeSteps goes back to being unexported",
    from: " * @returns {number}\n */\nexport function sizeSteps(a, b) {",
    to: " * @returns {number}\n */\nfunction sizeSteps(a, b) {", breaks: "M4b — Mount throws on the first click" },
  { file: INJURYWF, name: "F2 THE DEFECT: the world clock sees the sidebar only",
    from: "  for (const scene of game.scenes ?? []) {", to: "  for (const scene of []) {", breaks: "J5" },
  { file: INJURYWF, name: "F2: a linked token heals twice in one tick",
    from: "    if (token.actorLink) continue;", to: "", breaks: "J5" },
  { file: INJURYWF, name: "F5 THE DEFECT: keyed on the actor again, so a shared effect heals twice",
    from: "    const key = injuryIdentityOf(actor);", to: "    const key = actor.uuid;", breaks: "J6" },
  { file: INJURYWF, name: "F6 THE DEFECT: the uuid key that renamed the shared effect instead of finding it",
    from: "  return injuryHealingKey({", to: "  return String(effect?.uuid ?? \"\") || null;\n  const _dead = ({", breaks: "J6b" },
  { file: INJURYWF, name: "F6: the delta is never asked whose effect this is",
    from: "    deltaEffectIds: Array.from(actor?.token?.delta?._source?.effects ?? []).map((row) => row?._id)",
    to: "    deltaEffectIds: []", breaks: "J6b" },
  { file: INJURIES, name: "F6: a token's view of a shared effect keeps its own name",
    from: "  if (!own) return `effect:Actor.${actorId}.ActiveEffect.${effectId}`;",
    to: "", breaks: "J7" },
  { file: INJURIES, name: "F6: every token counts as carrying its own effect",
    from: "  const own = isToken\n    ? Array.from(deltaEffectIds ?? []).some((id) => id && id === effectId)\n    : true;",
    to: "  const own = true;", breaks: "J7" },
  { file: INJURIES, name: "F6: a token with its own effect is folded into the base actor",
    from: "  const own = isToken\n    ? Array.from(deltaEffectIds ?? []).some((id) => id && id === effectId)\n    : true;",
    to: "  const own = false;", breaks: "J8" },
  { file: BASICACT, name: "F1: Take Cover's description forgets Reflex saves again",
    from: "Standard cover becomes Greater cover (+8 circumstance to DB, Reflex saves and Stealth)",
    to: "Standard cover becomes Greater cover (+8 circumstance to DB and to Stealth checks)", breaks: "D6b" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([
  ATTACK, ATTACKWF, ACTIONWF, CASTDC, CASTWF, RANGED, STANCES, INJURIES, INJURYWF, DEATH, COMBAT, CONFIG,
  SPACE, GEOMETRY, FLANKING, MOVEWF, MOUNTED, MOUNTEDWF, AURAWF, TERRAIN, SURFACES, EXHAUST, EXHAUSTWF,
  CONDMGR, SKILLACT, BASICACT, BOMBWF, CARDS, SPELLFX, RESTWF, APWF, HOOK, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter7-combat-191-200: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-chapter7-combat-191-200: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter7-combat-191-200: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
