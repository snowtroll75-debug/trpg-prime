#!/usr/bin/env node
/**
 * mutate-chapter9-241-250 — can the pages 241-250 checks fail?
 *
 * NEW at 3.585.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, because this block found several rules that
 * were written, tested and reachable by nothing:
 *
 *   - `controlBonusPerLevel` was a real template field with a real
 *     modifier target and NO PACK ENTRY EVER WROTE IT, so every Cleric,
 *     Druid and Wizard computed level + ability and no more.
 *   - `magicRitualSecondaryModifier` had no caller anywhere; the dialog
 *     printed its four numbers in a hint and asked the GM to add up.
 *   - `rollSpellFumble`'s `ritual` flag was never passed, so the Spell
 *     Fumble Modifiers table's +20 Spell Ritual row was unreachable.
 *   - the breach rule read a Breach TRAIT that no spell in the pack has
 *     ever carried, while seven spells print "(B)" on their range.
 *   - a spell's recurring damage was a printed sentence.
 *
 * Each of those is a mutation below, put back one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const CASTING = at("magic", "casting.mjs");
const CLOCK = at("magic", "sustain-clock.mjs");
const SUSTAIN = at("magic", "sustain.mjs");
const SUSTAINWF = at("magic", "sustain-workflow.mjs");
const ACTIVE = at("magic", "active-spells.mjs");
const REGISTER = at("magic", "control-register.mjs");
const ALIGNED = at("aligned.mjs");
const ALIGNEDWF = at("aligned-control-workflow.mjs");
const COMBAT = at("documents", "combat.mjs");
const ACTOR = at("documents", "actor.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const ATTACKWF = at("combat", "attack-workflow.mjs");
const TEMPLATE = at("magic", "spell-template.mjs");
const LADDER = at("magic", "save-ladder.mjs");
const PIERCE = at("magic", "defence-pierce.mjs");
const META = at("magic", "metamagic.mjs");
const TABLES = at("data", "spell-tables.mjs");
const DAMAGE = at("magic", "spell-damage.mjs");
const AUTHOR = path.join(SYSTEM_ROOT, "tools", "author-block24-spells.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter9-241-250.mjs");

const MUTATIONS = [
  /* ── A/B: the sustain clock (R1) ───────────────────────────────── */
  { file: CLOCK, name: "B THE GAP: a minute of sustaining costs nothing",
    from: "    exhaustionCheck: !exhausted && held >= SUSTAIN_EXHAUSTION_ROUNDS,",
    to: "    exhaustionCheck: false,", breaks: "B2" },
  { file: CLOCK, name: "B: the exhaustion check fires every round after the first minute",
    from: "    exhaustionCheck: !exhausted && held >= SUSTAIN_EXHAUSTION_ROUNDS,",
    to: "    exhaustionCheck: held >= SUSTAIN_EXHAUSTION_ROUNDS,", breaks: "B3" },
  { file: CLOCK, name: "B: the minute threshold drifts to a round",
    from: "const SUSTAIN_EXHAUSTION_ROUNDS = 10;", to: "const SUSTAIN_EXHAUSTION_ROUNDS = 1;",
    breaks: "B1" },
  { file: CLOCK, name: "B: the ten-minute period is charged from round one",
    from: "  const due = Math.max(0, Math.ceil((held - SUSTAIN_RECHARGE_ROUNDS) / SUSTAIN_RECHARGE_ROUNDS));",
    to: "  const due = Math.max(0, Math.ceil(held / SUSTAIN_RECHARGE_ROUNDS));", breaks: "B4" },
  { file: CLOCK, name: "B: what has already been collected is forgotten, and charged again",
    from: "    ppCharges: Math.max(0, due - paid),", to: "    ppCharges: Math.max(0, due),",
    breaks: "B7" },
  { file: CLOCK, name: "B: the re-expenditure period halves",
    from: "const SUSTAIN_RECHARGE_ROUNDS = 100;", to: "const SUSTAIN_RECHARGE_ROUNDS = 50;",
    breaks: "B5" },
  { file: CLOCK, name: "B: a junk tally becomes NaN and poisons every comparison",
    from: "  return value !== null && value !== undefined && value !== \"\" && Number.isFinite(Number(value));",
    to: "  return true;", breaks: "B10/B10b" },
  { file: CLOCK, name: "B: a sustain that owes nothing still says something",
    from: "  return parts.length ? `${parts.join(\"; \")}.` : \"\";",
    to: "  return `${parts.join(\"; \")}.`;", breaks: "B13" },
  { file: ACTIVE, name: "B: the tally stops counting, so no clock can ever run",
    from: "  entry.sustainedRounds = roundsHeld(entry) + 1;",
    to: "  entry.sustainedRounds = 0;", breaks: "B16" },

  /* ── A: the action's printed requirements ──────────────────────── */
  { file: SUSTAIN, name: "A: Sustain a Spell becomes free",
    from: 'export const SUSTAIN_AP_COST = "1";', to: 'export const SUSTAIN_AP_COST = "0";',
    breaks: "A1" },
  { file: SUSTAIN, name: "A: a fatigued caster is told about the wrong requirement",
    from: "  if (Number(fatigued) > 0) {", to: "  if (false) {", breaks: "A3/A4" },

  /* ── C: an interrupted sustain (R2) ────────────────────────────── */
  { file: SUSTAINWF, name: "C THE GAP: damage no longer threatens a sustained spell",
    from: '  Hooks.on("preUpdateActor", (actor, changed) => {',
    to: '  Hooks.on("preUpdateActorZZ", (actor, changed) => {', breaks: "C1" },
  { file: SUSTAINWF, name: "C: the watch moves to `system.hp`, the vestigial path R9 died on",
    from: "    const after = changed?.system?.resources?.hp?.value;",
    to: "    const after = changed?.system?.hp?.value;", breaks: "C2" },
  { file: SUSTAINWF, name: "C: the guard is hand-rolled instead of imported",
    from: 'import { hitPointsLost } from "./pending-cast.mjs";',
    to: 'const hitPointsLost = (a, b) => Number(b) < Number(a);', breaks: "C3" },
  { file: SUSTAINWF, name: "C: a failed concentration check no longer ends the spell",
    from: "    await endActiveSpell(actor, entry.id, { dismissed: false });\n    ended.push(entry.name);",
    to: "    ended.push(entry.name);", breaks: "C4" },
  { file: ACTIVE, name: "C: the casting DC stops travelling, so the check asks for it again",
    from: "    castingDC: Number(castingDC) || 0,", to: "", breaks: "C5" },

  /* ── D: Dismiss ────────────────────────────────────────────────── */
  { file: at("magic", "dismiss.mjs"), name: "D: Dismiss stops being a Concentrate action",
    from: 'export const DISMISS_TRAITS = "Concentrate";',
    to: 'export const DISMISS_TRAITS = "Manipulate";', breaks: "D2" },

  /* ── F: control levels (R3) ────────────────────────────────────── */
  { file: CASTING, name: "F THE SHIPPED DEFECT: no class grants a control bonus",
    from: "const CONTROL_BONUS_CLASSES = Object.freeze({ cleric: 1, druid: 1, wizard: 1 });",
    to: "const CONTROL_BONUS_CLASSES = Object.freeze({});", breaks: "F1/F3" },
  { file: CASTING, name: "F: the Wizard specialist doubling is lost",
    from: '  return held.some((s) => CONTROL_BONUS_SCHOOLS.includes(s)) ? 2 : base;',
    to: "  return base;", breaks: "F4/F5" },
  { file: CASTING, name: "F: Conjurer stops reading as Translocation",
    from: 'const CONTROL_BONUS_SCHOOLS = Object.freeze(["enchantment", "translocation"]);',
    to: 'const CONTROL_BONUS_SCHOOLS = Object.freeze(["enchantment"]);', breaks: "F5" },
  { file: CASTING, name: "F: any class with a school doubles, not only the Wizard",
    from: '  if (name !== "wizard") return base;', to: "  if (false) return base;", breaks: "F7" },
  { file: CASTING, name: "F: a class the page does not name gains the bonus anyway",
    from: "  const base = CONTROL_BONUS_CLASSES[name] ?? 0;\n  if (!base) return 0;",
    to: "  const base = CONTROL_BONUS_CLASSES[name] ?? 1;", breaks: "F8" },
  { file: ACTOR, name: "F: the derivation goes back to reading an unwritten field",
    from: "    const derivedControlBonus = controlBonusPerLevelFor(",
    to: "    const derivedControlBonus = 0 || ((a, b) => 0)(", breaks: "F11" },

  /* ── G: going over the cap (R4) ────────────────────────────────── */
  { file: REGISTER, name: "G: the release save drifts off DC 20",
    from: "CONTROL_RELEASE_DC = 20;", to: "CONTROL_RELEASE_DC = 15;",
    breaks: "G1" },
  { file: REGISTER, name: "G: the LOWEST-level creature pulls to escape",
    from: "      if (!highest || entryLevel(entry) > entryLevel(highest)) highest = entry;",
    to: "      if (!highest || entryLevel(entry) < entryLevel(highest)) highest = entry;",
    breaks: "G6" },
  { file: REGISTER, name: "G: a heroic save is not good enough to break free",
    from: '  return ["heroic", "critical", "success"].includes(String(degreeKey ?? "").trim());',
    to: '  return String(degreeKey ?? "").trim() === "success";', breaks: "G9" },
  { file: REGISTER, name: "G: a blunder frees the creature",
    from: '  return ["heroic", "critical", "success"].includes(String(degreeKey ?? "").trim());',
    to: '  return String(degreeKey ?? "").trim() !== "failure";', breaks: "G11" },
  { file: REGISTER, name: "G: re-taking a creature counts it a second time",
    from: "  const list = (Array.isArray(entries) ? entries : []).filter((e) => !sameCreature(e, entry));",
    to: "  const list = (Array.isArray(entries) ? entries : []);", breaks: "G12" },
  { file: REGISTER, name: "G: a junk creature level becomes NaN",
    from: "  const raw = entry?.level;\n  if (!readable(raw)) return 0;",
    to: "  const raw = entry?.level;", breaks: "G3b" },
  { file: ALIGNED, name: "G: going over the cap is refused again, so the DC 20 rule can never fire",
    from: "  const overBy = Math.max(0, wouldHold - cap);",
    to: "  const overBy = Math.max(0, wouldHold - cap);\n  if (overBy > 0) problems.push(`Control Level: ${wouldHold} exceeds ${cap}`);",
    breaks: "G17/G20" },
  { file: ALIGNED, name: "G: the excess is reported as zero, so no card warns about it",
    from: "    overCap: overBy > 0,", to: "    overCap: false,", breaks: "G18" },
  { file: ALIGNEDWF, name: "G: the tally goes back to the zero it used to pass",
    from: "    controlledAlready: controlledLevelsOf(actor)", to: "    controlledAlready: 0",
    breaks: "G22" },
  { file: COMBAT, name: "G: nothing pulls on the controller's turn",
    from: "    await sweepControlOverflow(actor);", to: "", breaks: "G23" },

  /* ── H: overcasting by Sacrifice ───────────────────────────────── */
  { file: CASTING, name: "H: the overcast DC rises by 1 per PP, not 2",
    from: "  return over * 2;", to: "  return over * 1;", breaks: "H1" },

  /* ── I: the Magic Ritual (R5, R6, R7) ──────────────────────────── */
  { file: CASTING, name: "I: each secondary caster buys 1 PP of headroom, not 2",
    from: "  return 2 * Math.max(0, Math.floor(Number(secondaryCasterCount) || 0));",
    to: "  return 1 * Math.max(0, Math.floor(Number(secondaryCasterCount) || 0));",
    breaks: "I1" },
  { file: CASTING, name: "I: a ritual Fumble costs -4 rather than the printed -10",
    from: "    case \"fumble\":\n      return -10;", to: "    case \"fumble\":\n      return -4;",
    breaks: "I2" },
  { file: CASTING, name: "I: a Heroic ritual is no longer capped at Success",
    from: "  if (degree.rank > DEGREE_BY_KEY.success.rank) return \"success\";",
    to: "  if (false) return \"success\";",
    breaks: "I4/I5" },
  { file: CASTWF, name: "I THE SHIPPED DEFECT: the secondaries are summed by hand again",
    from: "          const mod = magicRitualSecondaryModifier(key);", to: "          const mod = 0;",
    breaks: "I11" },
  { file: CASTWF, name: "I: the ladder loses its only caller a second way",
    from: "    (sum, key) => sum + magicRitualSecondaryModifier(key), 0);",
    to: "    (sum) => sum + 0, 0);", breaks: "I11" },
  { file: CASTWF, name: "I THE SHIPPED DEFECT: a successful ritual posts a card and casts nothing",
    from: "      ritual: { degree, ppOver, secondaryCount, check }",
    to: "      stored: null", breaks: "I13" },
  { file: CASTWF, name: "I: the cast re-rolls its own check instead of taking the ritual's degree",
    from: "  if (ritual) degree = String(ritual.degree ?? degree);", to: "", breaks: "I14" },
  { file: CASTWF, name: "I: the ritual's headroom stops raising the cap",
    from: "  const ritualHeadroom = Math.max(0, Math.floor(Number(ritual?.ppOver) || 0));",
    to: "  const ritualHeadroom = 0;", breaks: "I15" },
  { file: CASTWF, name: "I THE SHIPPED DEFECT: a ritual fumble never reaches the fumble table",
    from: "      ritual: Boolean(ritual),", to: "      ritual: false,", breaks: "I16" },
  { file: TABLES, name: "I: the Spell Ritual row drifts off +20",
    from: '  "Spell Ritual": 20,', to: '  "Spell Ritual": 10,', breaks: "I17/I18" },

  /* ── J: the four tables ────────────────────────────────────────── */
  { file: TABLES, name: "J: the Spell Fumble Table loses its open-ended last row",
    from: '    "min": 351,\n    "max": 9999,\n    "effect": "You open a permanent gate', to: '    "min": 999,\n    "max": 9999,\n    "effect": "You open a permanent gate', breaks: "J4" },
  { file: TABLES, name: "J: Ethereal's fumble modifier loses its sign",
    from: '  "Ethereal": -10,', to: '  "Ethereal": 10,', breaks: "J10" },
  { file: TABLES, name: "J: a cantrip stops damping resonance",
    from: '  "Cantrip": -20,', to: '  "Cantrip": 20,', breaks: "J14" },
  { file: TABLES, name: "J: an attack spell's resonance modifier halves",
    from: '  "Attack Spell": 20,', to: '  "Attack Spell": 10,', breaks: "J15/J17" },

  /* ── K: resonance's second trigger (R8) ────────────────────────── */
  { file: ATTACKWF, name: "K THE GAP: a spell's 66 critical injury invokes nothing",
    from: "  if (percentile.value === CRITICAL_CHAOS_FACE && spellResonance) {",
    to: "  if (false && spellResonance) {", breaks: "K2" },
  { file: ATTACKWF, name: "K: resonance is made hostage to the optional chaos setting",
    from: "  if (percentile.value === CRITICAL_CHAOS_FACE && spellResonance) {",
    to: "  if (percentile.value === CRITICAL_CHAOS_FACE && spellResonance && setting(\"chaosResults\", false)) {",
    breaks: "K3" },
  { file: CASTWF, name: "K: the save path's injuries stop carrying their modifiers",
    // RE-AIMED AT 3.608.0: the printed ladder's branch now ends before
    // Sonic Rupture's condition-damage branch rather than the basic one.
    // RE-ANCHORED 3.609.0: the rung's recurring rider now follows the injury.
    from: "          modifier: outcome.modifier,\n          spellResonance: resonanceContext\n        });\n      }\n      /*\n       * THE RECURRING RIDER, BY RUNG",
    to: "          modifier: outcome.modifier\n        });\n      }\n      /*\n       * THE RECURRING RIDER, BY RUNG", breaks: "K5" },

  /* ── L: (B) breach (R9) ────────────────────────────────────────── */
  { file: TEMPLATE, name: "L THE SHIPPED DEFECT: breach reads a trait no spell carries",
    from: '  if (/\\(\\s*B\\s*\\)/i.test(marked)) return true;', to: "", breaks: "L1/L2/L3" },
  { file: TEMPLATE, name: "L: only the range is read, not the area",
    from: '  const marked = `${spellData?.range ?? ""} ${spellData?.area ?? ""} ${spellData?.targets ?? ""}`;',
    to: '  const marked = `${spellData?.range ?? ""}`;', breaks: "L1" },
  { file: TEMPLATE, name: "L: every spell breaches",
    from: '  return /\\bbreach\\b/i.test(String(spellData?.traits ?? ""));', to: "  return true;",
    breaks: "L5" },
  { file: CASTWF, name: "L: the cast goes back to asking the traits line",
    from: "        const breach = spellBreaches(spellData);",
    to: '        const breach = /\\bbreach\\b/i.test(spellData.traits || "");', breaks: "L8" },

  /* ── M: recurring damage (R10, R11) ────────────────────────────── */
  { file: CASTWF, name: "M THE SHIPPED DEFECT: recurring damage is printed, not applied",
    from: '      await targetActor.toggleStatusEffect("recurring", {', to: "      await (async () => ({}))({",
    breaks: "M1" },
  { file: CASTWF, name: "M: the stacking rule is written a second time",
    from: "      const next = recurringAfterHit(existing, amount, damageType);",
    to: "      const next = { value: amount, damageType, replaced: false };", breaks: "M2" },
  { file: CASTWF, name: "M: a critical-only rider fires on every hit",
    from: '    const criticalOnly = String(dmg.persistentOn ?? "").trim().toLowerCase() === "critical";',
    to: "    const criticalOnly = false;", breaks: "M3" },

  /* ── N: what the live drive taught (R13) ───────────────────────── */
  { file: PIERCE, name: "N THE DRAFT THAT WOULD HAVE SHIPPED: the unarmoured half vanishes",
    from: "  const unarmoured = Boolean(raw.unarmoured);", to: "  const unarmoured = false;",
    breaks: "N2" },
  { file: PIERCE, name: "N: the Defence-Bonus half stops subtracting",
    from: "  for (const slot of slots) amount += Math.max(0, Number(defence?.[slot]) || 0);",
    to: "  for (const slot of slots) amount += 0 * (Number(defence?.[slot]) || 0);", breaks: "N4" },
  { file: PIERCE, name: "N: a negative defence component becomes a gift to the attacker",
    from: "  for (const slot of slots) amount += Math.max(0, Number(defence?.[slot]) || 0);",
    to: "  for (const slot of slots) amount += Number(defence?.[slot]) || 0;", breaks: "N6" },
  { file: PIERCE, name: "N: every weapon the caster holds pierces, not the one enchanted",
    from: "    if (spec.weaponIds.length && !spec.weaponIds.includes(id)) continue;", to: "",
    breaks: "N5" },
  { file: PIERCE, name: "N: a row that pierces nothing is accepted and does nothing",
    from: "  if (!slots.length && !unarmoured) return null;", to: "", breaks: "N8" },
  { file: PIERCE, name: "N: the base 10 becomes pierceable",
    from: '  "ability", "class", "item", "status", "circumstance", "other"',
    to: '  "base", "ability", "class", "item", "status", "circumstance", "other"', breaks: "N9" },
  { file: ATTACKWF, name: "N: the armour half never reaches the damage pipeline",
    from: "    ) || Boolean(damagePierce.unarmoured);", to: "    );", breaks: "N11" },

  /* ── O: a spell's own four outcomes (R12) ──────────────────────── */
  { file: LADDER, name: "O THE BUG THE DRIVE FOUND: a Blunder is a complete reprieve",
    from: "  for (let i = DEGREE_ORDER.length - 1; i >= 0; i -= 1) {\n    if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];\n  }\n",
    to: "", breaks: "O9/O10/O11" },
  { file: LADDER, name: "O: the walk goes UP, so a fumble takes the success rung",
    from: "  for (let i = from; i < DEGREE_ORDER.length; i += 1) {",
    to: "  for (let i = from; i >= 0; i -= 1) {",
    breaks: "O8/O11" },
  { file: LADDER, name: "O: the -20 is dropped, so a Failure and a Fumble injure alike",
    from: "    modifier: Number(spec.criticalModifier?.[rung] ?? 0) || 0",
    to: "    modifier: 0", breaks: "O5" },
  { file: LADDER, name: "O: a critical save is no longer unaffected",
    // RE-ANCHORED AT 3.591.0: Massacre's fumble KILLS, so a rung with no
    // dice is no longer automatically harmless (see save-ladder `slays`).
    // RE-ANCHORED AGAIN AT 3.606.0, when block 32 added three more terms.
    // RE-ANCHORED 3.609.0 (the rung's recurring rider joined the test).
    from: "    harmless: !dice && !slays && !severity && dropsTo === null && !soulDestroyed && !persistent,", to: "    harmless: false,", breaks: "O2" },
  { file: LADDER, name: "O: a malformed ladder is quietly accepted",
    from: "    if (dice && !/^\\d+(d\\d+)?(\\s*\\+\\s*\\d+)?$/i.test(dice)) return null;", to: "",
    breaks: "O13" },
  { file: LADDER, name: "O: any effect row is treated as a ladder",
    from: '  if (lower(raw.kind) !== "saveladder") return null;', to: "", breaks: "O14" },
  { file: CASTWF, name: "O: the printed ladder is ignored in favour of the basic arithmetic",
    from: "    if (saveLadder) {", to: "    if (false) {", breaks: "O15" },

  /* ── P: base damage as a gate (R18) ────────────────────────────── */
  { file: META, name: "P THE SHIPPED DEFECT: Empower adds the whole damage, not the base",
    from: "        agg.extraDamageDice = addDice(agg.extraDamageDice, base);",
    to: "        agg.extraDamageDice = addDice(agg.extraDamageDice, damageFormula);", breaks: "P3" },
  { file: META, name: "P: a spell with no base damage entry may be Empowered anyway",
    from: '  if (has("empower spell") && baseDamage) {', to: '  if (has("empower spell") && damageFormula) {',
    breaks: "P2" },
  { file: META, name: "P: and Intensified reads the wrong die",
    from: '  if (has("intensified spell") && firstDiceTerm(baseDamage)) {\n    const term = firstDiceTerm(baseDamage);',
    to: '  if (has("intensified spell") && firstDiceTerm(damageFormula)) {\n    const term = firstDiceTerm(damageFormula);',
    breaks: "P2" },

  /* ── R: the live-test fixes and the critical ruling ────────────── */
  { file: CASTWF, name: "R THE LIVE DEFECT: the ritual writes into the caster's own modifier array",
    from: "  const modifiers = [...(system.magic?.spellcraft?.checkModifiers ?? [",
    to: "  const modifiers = (system.magic?.spellcraft?.checkModifiers ?? [", breaks: "R1" },
  { file: CASTWF, name: "R THE LIVE DEFECT: a ritual's cast rolls a second check of its own",
    from: "    : ritual?.check\n    ? ritual.check", to: "    : false\n    ? null", breaks: "R2" },
  { file: DAMAGE, name: "R: a spell critical goes back to adding nothing",
    from: "  const base = String(spellSystem?.baseDamage ?? \"\").trim();\n  if (!base) return \"\";",
    to: "  const base = String(spellSystem?.damage?.formula ?? \"\").trim();", breaks: "R7" },
  { file: DAMAGE, name: "R: a dual base damage silently scales nothing",
    from: '  const primary = base.split("/")[0].trim();', to: "  const primary = base;",
    breaks: "R7b" },
  { file: DAMAGE, name: "R: the critical ladder flattens to one die at every severity",
    from: "    ? ({ minor: 1, serious: 2, deadly: 3 }[String(severity ?? \"\").trim()] ?? 0)",
    to: "    ? ({ minor: 1, serious: 1, deadly: 1 }[String(severity ?? \"\").trim()] ?? 0)",
    breaks: "R4/R5" },
  { file: DAMAGE, name: "R: a multi-die base is read as a single die",
    from: "  const per = Math.max(1, Number(match[1] || 1));", to: "  const per = 1;", breaks: "R6" },
  { file: CASTWF, name: "R: the card stops naming the dice the critical added",
    from: "${critFormula ? ` + ${critFormula} critical` : \"\"}", to: "", breaks: "R11b" },
  { file: CASTWF, name: "R: the attack path stops adding the critical's base damage",
    from: "  const critFormula = criticalBonusDamage(spell.system, outcome.critical?.severity ?? null);",
    to: "  const critFormula = \"\";", breaks: "R11" },

  /* ── Q: the block's spell data ─────────────────────────────────── */
  { file: AUTHOR, name: "Q: Acid Arrow becomes a spell that can never lapse",
    from: '    y.sustainType = "duration";', to: '    y.sustainType = "attack";', breaks: "Q2" },
  { file: AUTHOR, name: "Q: its Sustain choice moves where only the copy lives",
    from: "    y.sustainChoices = [", to: "    y.emanation = {\n      sustainChoices: [", breaks: "Q3" },
  { file: AUTHOR, name: "Q: Align Weapon goes back to a key nothing reads",
    from: "        picks: 1,", to: '        choose: "aligned",', breaks: "Q4" },
  { file: AUTHOR, name: "Q: Abjurers Strike loses the half that actually fires",
    from: "        unarmoured: true,", to: "", breaks: "Q5" },
  // ONE LINE, GENUINELY CHANGED. The first draft of this mutation carried
  // four unchanged lines of context to reach its insertion point, and
  // `verify-mutation-anchors` A5 refused it: the note's own text line is
  // unique on its own, so the context was decoration that would break
  // the day anything was inserted beside it.
  { file: AUTHOR, name: "Q: Animal Growth regains its inert warp mod",
    from: '        text: "The animal grows by one size category.',
    to: '        sizeSteps: 2,\n        text: "The animal grows by one size category.',
    breaks: "Q6" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const files = Array.from(new Set(MUTATIONS.map((m) => m.file)));
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

if (!run()) {
  console.error("mutate-chapter9-241-250: the check FAILS before any mutation.");
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

process.stdout.write(survived + unmatched
  ? `\nmutate-chapter9-241-250: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter9-241-250: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
