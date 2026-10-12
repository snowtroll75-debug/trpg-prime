/**
 * Spell casting (Core 3.1, Chapter 9). Pure logic; the Foundry workflow in
 * cast-workflow.mjs layers on top.
 */

import { RESONANCE_MODIFIERS } from "../data/spell-tables.mjs";
import { DEGREE_BY_KEY, DIFFICULTY_BY_KEY } from "../dice/resolution.mjs";

/**
 * Casting DC: "Cast a Spell DC = 10 + (Spell PP cost) x1.5" (Chapter 9).
 *
 * ROUNDS DOWN (3.549.0). Chapter 9 prints the formula and says nothing
 * about rounding, so Chapter 1's default governs it: "Unless otherwise
 * stated, always round down." This rounded UP from the day it was
 * written, which made every ODD-PP spell one DC harder than printed —
 * PP 1 was DC 12 against a printed 11, PP 3 was 15 against 14. Graham's
 * ruling, 10 September 2026, on the pages 6-15 audit.
 *
 * The half only ever appears on an odd PP cost, so this is the whole of
 * the difference: even costs were correct under either rounding.
 *
 * ONE DEFINITION. resolution.mjs carried a second copy of this formula
 * (`castSpellDC`, rounding a third way, with Math.round) that nothing
 * called. Removed in the same release rather than corrected — two
 * spellings of one rule is how they come to disagree.
 */
export function castingDC(pp) {
  return 10 + Math.floor(Number(pp) * 1.5);
}

/** "you're limited to casting spells with a Power Point (PP) cost equal to
 * or lower than your caster level +1." */
export function maxPPPerCast(casterLevel) {
  return Math.max(0, Math.floor(Number(casterLevel) || 0)) + 1;
}

/**
 * Power Point Recovery (Chapter 9): three distinct rates depending on
 * what the character was doing. All take hours/half-nights as an input
 * rather than tracking game-time automatically, matching how deprivation
 * modifiers (exhaustion.mjs) already work in this project.
 */

/** Active: 1 PP every 3 hours. */
export function activePPRecovery(hours) {
  return Math.floor(Math.max(0, Number(hours) || 0) / 3);
}

/** Resting: 1 PP per 2 caster levels (round up), per hour of rest. */
export function restingPPRecovery(casterLevel, hours) {
  const perHour = Math.ceil(Math.max(1, Math.floor(Number(casterLevel) || 0)) / 2);
  return perHour * Math.max(0, Math.floor(Number(hours) || 0));
}

/**
 * Sleeping: 50% of max PP per half of a full night's rest. Capped at
 * one full sleep cycle (two halves = 100%) per 24 hours — any further
 * sleep in the same day counts as Resting instead, which the caller is
 * responsible for applying separately.
 */
export function sleepingPPRecovery(maxPP, halfNights) {
  const cappedHalves = Math.min(2, Math.max(0, Math.floor(Number(halfNights) || 0)));
  return Math.floor(Math.max(0, Number(maxPP) || 0) * 0.5 * cappedHalves);
}

/** Save DC = 10 + PP Cost + Casting Ability Score + Other Modifiers.
 * Warping PP counts toward the cost, raising the DC. */
export function spellSaveDC({ pp, castingAbility = 0, modifiers = 0 } = {}) {
  return (
    10 +
    Math.max(0, Math.floor(Number(pp) || 0)) +
    Math.floor(Number(castingAbility) || 0) +
    Math.floor(Number(modifiers) || 0)
  );
}

/**
 * Innate Spells (Chapter 9): always warped to the maximum, treating
 * character level as caster level. "Innate Attack Bonus = magical
 * ability score + level." Verified against the rulebook's own worked
 * example (Saros, level 6, Int +3 -> +9).
 */
export function innateAttackBonus(magicalAbility, level) {
  return Math.floor(Number(magicalAbility) || 0) + Math.floor(Number(level) || 0);
}

/** "Innate Save = 10 + magical ability score + level." */
export function innateSaveDC(magicalAbility, level) {
  return 10 + Math.floor(Number(magicalAbility) || 0) + Math.floor(Number(level) || 0);
}

/**
 * Specialist Spells (Chapter 9): a distinct casting mode for spells
 * learned through class features or archetype feats rather than a
 * normal spell list. Very Easy (-5) casting difficulty and a PP cap of
 * character level (not caster level) apply universally; the higher-of
 * two formulas apply specifically to Attack/Save specialist spells.
 */
export const SPECIALIST_DIFFICULTY = "veryEasy";

/** Max PP for a specialist spell: character level, not caster level.
 * Verified against the rulebook's own worked example (Nyphari, 6th
 * level bard, caster level 3, specialist max PP 6 not 4). */
export function specialistMaxPP(characterLevel) {
  return Math.max(0, Math.floor(Number(characterLevel) || 0));
}

/** "...equal to your magical ability score + level or your spellcraft
 * bonus, whichever is higher" — reuses innateAttackBonus rather than
 * duplicating its formula. */
export function specialistAttackBonus(magicalAbility, level, spellcraftBonus) {
  return Math.max(
    innateAttackBonus(magicalAbility, level),
    Math.floor(Number(spellcraftBonus) || 0)
  );
}

/**
 * How much the specialist formula RAISES an attack that is already being
 * rolled off Spellcraft — zero when Spellcraft is the higher of the two.
 *
 * WHY A DIFFERENCE AND NOT THE BONUS ITSELF. A spell attack in this system
 * is the Cast a Spell check: `resolveSpellAttack` takes that roll's total
 * and compares it to the target's Defence Bonus, and that total already has
 * the Spellcraft bonus inside it along with the die and every other
 * modifier. So the printed "whichever is higher" cannot replace the total;
 * it sets a floor under the BONUS half of it, and what the attack needs is
 * the gap between the two.
 *
 * `specialistAttackBonus` had been written, tested, and called by nothing
 * since it landed, while its twin `specialistSaveDC` was wired — so one
 * half of one printed sentence was honoured and the other was not, and a
 * specialist whose ability + level beat their Spellcraft attacked at the
 * lower number while their save DCs used the higher. Graham confirmed on
 * 22 August 2026 that the attack clause stands as written. Found by
 * tools/verify-rules-have-callers.mjs.
 */
export function specialistAttackUplift(magicalAbility, level, spellcraftBonus) {
  const spellcraft = Math.floor(Number(spellcraftBonus) || 0);
  // THE CLAMP IS UNREACHABLE TODAY and is kept deliberately.
  // `specialistAttackBonus` is itself a max against Spellcraft, so this
  // subtraction cannot go negative — no input reaches the floor, and no
  // mutation of it can be caught. It stays because the day that function
  // changes shape is the day a printed floor would silently become a
  // penalty, which is a mistake this project has made before in another
  // guise ("a waiver is a discount, never a rebate").
  return Math.max(0, specialistAttackBonus(magicalAbility, level, spellcraft) - spellcraft);
}

/** "...equal to your magical ability score + level +10 or your
 * spellcraft bonus +10, whichever is higher." */
export function specialistSaveDC(magicalAbility, level, spellcraftBonus) {
  return Math.max(
    innateSaveDC(magicalAbility, level),
    Math.floor(Number(spellcraftBonus) || 0) + 10
  );
}

/**
 * Resolve a Cast a Spell check outcome into whether the spell takes effect
 * and how many PP are spent (Chapter 9, Casting Spells).
 *
 *   Heroic   cast; halve the TOTAL PP cost (with warping), round up
 *   Critical cast; halve the BASE PP cost (warping still full), round up
 *   Success  cast; full cost
 *   Partial  fails; no PP lost
 *   Failure  fails; lose HALF the PP, round down
 *   Fumble   fails; lose the PP; roll the Spell Fumble Table
 *   Blunder  as Fumble at +20
 *
 * @param {string} degreeKey
 * @param {object} options
 * @param {number} options.basePP The spell's own cost.
 * @param {number} [options.warpPP] Additional PP spent on warping.
 * @returns {{cast: boolean, ppSpent: number, fumbleRoll: boolean,
 *   fumbleModifier: number}}
 */
/**
 * THE OPTIONAL HARDER SAVE DC (3.583.0; page 237, Graham's R14).
 *
 * > "A Critical result makes the Save DC Hard (+2), and Heroic Very Hard
 * >  (+5). If you apply this result, you do not save any PP."
 *
 * ASKED OF THE DIFFICULTY LADDER, not of the two numbers in that
 * sentence. Block 22 learned this the hard way: the audit guessed Hard
 * was +5 and the ladder said +2, and the check that caught it was the
 * one that asked the ladder rather than repeating a figure.
 *
 * @param {string} degreeKey
 * @returns {number} the DC step, or 0 when the rule does not apply
 */
export function harderSaveStep(degreeKey) {
  if (degreeKey === "critical") return DIFFICULTY_BY_KEY.hard.modifier;
  if (degreeKey === "heroic") return DIFFICULTY_BY_KEY.veryHard.modifier;
  return 0;
}

export function castingOutcome(degreeKey, { basePP, warpPP = 0, waiveCritical = false, waiveSaving = false } = {}) {
  const base = Math.max(0, Math.floor(Number(basePP) || 0));
  const warp = Math.max(0, Math.floor(Number(warpPP) || 0));
  const total = base + warp;

  // WARP MANIPULATION TRADES THE CRITICAL AWAY (3.358.0): "if the result of
  // the spell is a Critical, you may add a warping option of up to 4. This
  // REPLACES the usual benefit of achieving a Critical on your spell
  // check." The usual benefit is the halved base below, so a caster who
  // took the larger allowance pays for the spell as though they had
  // succeeded — which is the trade, and the reason the offer has to say so
  // before it is accepted.
  let degree = waiveCritical && degreeKey === "critical" ? "success" : degreeKey;
  /*
   * AND THE OPTIONAL RULE TAKES BOTH (page 237): "if you apply this
   * result, you do not save any PP". `waiveCritical` above is Warp
   * Manipulation's trade and reaches only a Critical; this reaches the
   * Heroic too, because the sentence that raises the Save DC raises it
   * for both and withdraws the saving from both.
   */
  if (waiveSaving && (degree === "critical" || degree === "heroic")) degree = "success";

  switch (degree) {
    case "heroic":
      return {
        cast: true,
        ppSpent: Math.ceil(total / 2),
        fumbleRoll: false,
        fumbleModifier: 0
      };
    case "critical":
      return {
        cast: true,
        ppSpent: Math.ceil(base / 2) + warp,
        fumbleRoll: false,
        fumbleModifier: 0
      };
    case "success":
      return { cast: true, ppSpent: total, fumbleRoll: false, fumbleModifier: 0 };
    case "partial":
      return { cast: false, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 };
    case "failure":
      return {
        cast: false,
        ppSpent: Math.floor(total / 2),
        fumbleRoll: false,
        fumbleModifier: 0
      };
    case "fumble":
      return { cast: false, ppSpent: total, fumbleRoll: true, fumbleModifier: 0 };
    case "blunder":
      return { cast: false, ppSpent: total, fumbleRoll: true, fumbleModifier: 20 };
    default:
      return { cast: false, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 };
  }
}

/**
 * Extra casting time: +1 circumstance per increment beyond the first, to a
 * maximum of +5. Not available to reaction/free spells or those taking more
 * than a minute.
 *
 * @param {number} increments Extra increments taken.
 * @returns {number}
 */
export function extraCastingTimeBonus(increments) {
  return Math.max(0, Math.min(5, Math.floor(Number(increments) || 0)));
}

/**
 * The extra-casting-time increment for a spell's cast time, or null if the spell
 * can't take extra time (Chapter 9): a 1–3 AP spell adds 3 AP per increment; a
 * 1-minute spell adds 1 minute per increment; Free/Reaction, sub-1-AP, and
 * longer-than-1-minute cast times are ineligible.
 *
 * @param {number|string} castAP The spell's stored cast time.
 * @returns {{unit: "AP"|"minute", size: number, label: string}|null}
 */
export function extraCastingTimeIncrement(castAP) {
  if (typeof castAP === "number") {
    return castAP >= 1 && castAP <= 3
      ? { unit: "AP", size: 3, label: "+3 AP each" }
      : null;
  }
  const t = String(castAP ?? "").trim().toLowerCase();
  if (/^1\s*-\s*3\s*ap$/.test(t)) return { unit: "AP", size: 3, label: "+3 AP each" };
  if (/^1\s*minute$/.test(t)) return { unit: "minute", size: 1, label: "+1 minute each" };
  return null;
}

/**
 * Casting Focus (Chapter 9): a caster who casts with a focus gains a +1 item
 * bonus while the focus is in hand, or a -2 circumstance penalty when casting
 * without it. Returns a check-modifier entry, or null for a non-focus caster.
 *
 * @param {object} magic The actor's `system.magic`.
 * @returns {{label: string, value: number, type: string}|null}
 */
export function focusCheckModifier(magic) {
  if (!magic?.focusCasting) return null;
  return magic.focusReady
    ? { label: "Casting Focus", value: 1, type: "item" }
    : { label: "Casting without focus", value: -2, type: "circumstance" };
}

/**
 * The extra Spell-Fumble-roll penalty for a focus caster who fumbles while
 * casting without their focus (Chapter 9: "+10 to the Fumble Roll").
 *
 * @param {object} magic The actor's `system.magic`.
 * @returns {number} 10 when a focus caster lacks their focus, else 0.
 */
export function focusFumblePenalty(magic) {
  return magic?.focusCasting && !magic?.focusReady ? 10 : 0;
}

/**
 * The classes page 242 gives a per-level control bonus, and the two
 * wizard schools that double it.
 *
 * "Wizard (Conjurer, Enchanter)" NAMES TWO SPECIALISTS THAT ARE NOT THE
 * NAMES OF THIS SYSTEM'S SCHOOLS, so the mapping is stated here rather
 * than guessed at a call site. The eight wizard schools are Alteration,
 * Enchantment, Insight, Invocation, Shadow, Soul, Translocation and
 * Warding. Enchanter is plainly Enchantment. Conjurer is Translocation:
 * there is no Conjuration school, and MEASURED against the pack every
 * one of the nine Conjure spells — Plant, Elemental, Fey, Swarm, Entity,
 * Giant, Animal, Wyrm and Eternal — carries the Translocation trait.
 */
const CONTROL_BONUS_CLASSES = Object.freeze({ cleric: 1, druid: 1, wizard: 1 });

/** The wizard schools that raise the Wizard's own +1 to +2. */
const CONTROL_BONUS_SCHOOLS = Object.freeze(["enchantment", "translocation"]);

/**
 * A character's per-level control bonus, from their class and school.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS EXISTED AS A FIELD AND NOTHING WROTE IT (fixed 3.585.0).
 *
 * `system.magic.controlBonusPerLevel` has been a real template field
 * with a real modifier target since control levels were written, and the
 * comment below this one used to end "until classes are real items".
 * Classes became real items and nobody came back. MEASURED before the
 * fix: no entry in classes, wizard-schools, feats or abilities wrote the
 * field, so every caster in the system computed level + ability and no
 * more — Avrok, the book's own worked example, came out at 11 instead of
 * 18.
 *
 * @param {string} className The character's class item name.
 * @param {string[]} schools Their wizard school names, if any.
 * @returns {number} 0, 1 or 2.
 */
export function controlBonusPerLevelFor(className, schools = []) {
  const name = String(className ?? "").trim().toLowerCase();
  const base = CONTROL_BONUS_CLASSES[name] ?? 0;
  if (!base) return 0;
  // ONLY THE WIZARD DOUBLES. A Cleric who somehow held an Enchantment
  // school would still be a Cleric, and the page grants the +2 to
  // "Wizard (Conjurer, Enchanter)" rather than to the school itself.
  if (name !== "wizard") return base;
  const held = (Array.isArray(schools) ? schools : [])
    .map((s) => String(s ?? "").trim().toLowerCase());
  return held.some((s) => CONTROL_BONUS_SCHOOLS.includes(s)) ? 2 : base;
}

/**
 * Control Levels (Chapter 9): the total creature levels a caster may control at
 * once = character level + magical ability modifier + a per-level class bonus
 * (Cleric/Druid/Wizard +1/level; Wizard Conjurer/Enchanter +2/level; others 0),
 * the bonus coming from `controlBonusPerLevelFor` above.
 *
 * Verified against the book: Avrok (Cleric 7, ability 4) → 7 + 4 + 7 = 18;
 * Jamie (Crusader 14, ability 5, no class bonus) → 14 + 5 + 0 = 19.
 *
 * @param {number} level Character level.
 * @param {number} abilityMod Magical (tradition) ability modifier.
 * @param {number} bonusPerLevel Class per-level control bonus (0, 1, or 2).
 * @returns {number}
 */
export function controlLevelCap(level, abilityMod, bonusPerLevel = 0) {
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  const ability = Math.floor(Number(abilityMod) || 0);
  const perLevel = Math.max(0, Math.floor(Number(bonusPerLevel) || 0));
  return lvl + ability + perLevel * lvl;
}

/** Cantrips: no check normally; DC 10 if penalties force one. */
export const CANTRIP_PENALISED_DC = 10;

/**
 * Spell Concentration (Chapter 4, General Skill Actions): a Free reaction
 * triggered by taking damage while casting or sustaining a spell, rolled
 * "using the original DC for casting the spell" at Medium difficulty,
 * stepped up if the interrupting damage was itself a critical injury.
 *
 * The table lists no Heroic row; treated as at least as good as Critical,
 * matching the interpolation convention used elsewhere for sparse tables.
 */
export function concentrationOutcome(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return {
        maintains: true,
        fatigue: 0,
        spellFails: false,
        ppLossFraction: 0,
        rollFumble: false,
        rollResonance: false
      };
    case "success":
      return {
        maintains: true,
        fatigue: 1,
        spellFails: false,
        ppLossFraction: 0,
        rollFumble: false,
        rollResonance: false
      };
    case "partial":
      return {
        maintains: true,
        fatigue: 2,
        spellFails: false,
        ppLossFraction: 0,
        rollFumble: false,
        rollResonance: false
      };
    case "failure":
      return {
        maintains: false,
        fatigue: 0,
        spellFails: true,
        ppLossFraction: 0.5,
        rollFumble: false,
        rollResonance: false
      };
    case "fumble":
      return {
        maintains: false,
        fatigue: 0,
        spellFails: true,
        ppLossFraction: 1,
        rollFumble: true,
        rollResonance: false
      };
    case "blunder":
      return {
        maintains: false,
        fatigue: 0,
        spellFails: true,
        ppLossFraction: 1,
        rollFumble: true,
        rollResonance: true
      };
    default:
      return {
        maintains: false,
        fatigue: 0,
        spellFails: true,
        ppLossFraction: 1,
        rollFumble: false,
        rollResonance: false
      };
  }
}

/** The Spell Concentration DC step-up when the interrupting damage was
 * itself a critical injury: Minor is Hard (+2), Serious Very Hard (+5),
 * Deadly Incredibly Hard (+10). Returns a TRGCheck difficulty key. */
export function concentrationDifficulty(criticalSeverity) {
  switch (criticalSeverity) {
    case "minor":
      return "hard";
    case "serious":
      return "veryHard";
    case "deadly":
      return "incrediblyHard";
    default:
      return "medium";
  }
}

/**
 * Overcasting by Sacrifice: the casting DC rises by 2 per PP over the
 * caster's limit, and a Fortitude save (attack level = the spell's PP cost)
 * determines Soul Drain.
 */
export function overcastDCIncrease(pp, casterLevel) {
  const over = Math.max(0, Math.floor(Number(pp) || 0) - maxPPPerCast(casterLevel));
  return over * 2;
}

/**
 * Soul Drain formulas per degree of the Sacrifice Fortitude save. Returned
 * as dice expressions with the per-PP-over scaling applied; the Foundry
 * layer rolls them.
 *
 * @param {string} degreeKey
 * @param {number} ppOver PP above the caster's normal maximum.
 * @returns {{formula: string, critical: string|null}|null}
 */
export function sacrificeSoulDrain(degreeKey, ppOver) {
  const over = Math.max(0, Math.floor(Number(ppOver) || 0));
  switch (degreeKey) {
    case "heroic":
      return { formula: "2d6", critical: null };
    case "critical":
      return { formula: `1d10 + ${1 * over}`, critical: null };
    case "success":
      return { formula: `2d10 + ${2 * over}`, critical: null };
    // The rulebook's Sacrifice table lists no Partial row (recorded as an
    // amendment). Following the Basic Saving Throw pattern, where Partial
    // sits with Failure's damage but without its extra sting, Partial uses
    // the Failure formula without the Essence Critical.
    case "partial":
      return { formula: `4d10 + ${4 * over}`, critical: null };
    case "failure":
      return { formula: `4d10 + ${4 * over}`, critical: "serious" };
    case "fumble":
    case "blunder":
      return { formula: `5d10 + ${5 * over}`, critical: "deadly" };
    default:
      return null;
  }
}

/**
 * Resonance Modifiers (Chapter 9): sums the applicable situational
 * modifiers for a Resonance Event roll. Location and spell-trait
 * modifiers are each mutually exclusive by their own nature (a place is
 * one alignment, a spell is one trait); Per PP, Evil Spell, Ethereal
 * Magic, and Soul Magic all stack independently on top. References
 * RESONANCE_MODIFIERS directly rather than duplicating its numbers.
 */
/**
 * The full Spell Fumble roll modifier (Chapter 9, Spell Fumble Modifiers table):
 * the tradition/school modifier, +20 on a Blunder, +5 per PP of the spell, the
 * no-focus danger (+10), and +20 for a Spell Ritual.
 *
 * @param {number} traditionModifier The already-resolved tradition/school mod.
 * @param {object} [opts]
 * @returns {number}
 */
export function spellFumbleModifierTotal(traditionModifier, { blunder = false, pp = 0, focusPenalty = 0, ritual = false } = {}) {
  return (Number(traditionModifier) || 0)
    + (blunder ? 20 : 0)
    + 5 * Math.max(0, Math.floor(Number(pp) || 0))
    + (Number(focusPenalty) || 0)
    + (ritual ? 20 : 0);
}

export function resonanceModifierTotal({
  location = null,
  spellTrait = null,
  pp = 0,
  evilSpell = false,
  etherealMagic = false,
  soulMagic = false,
  // A FLAT MODIFIER NAMED BY WHAT CALLS THE ROLL (3.616.0): Charge
  // Depletion's 66, "Roll on the Resonance Event table at +20".
  extra = 0
} = {}) {
  let total = Math.floor(Number(extra) || 0);

  if (location === "good") total += RESONANCE_MODIFIERS["In a good, aligned area"];
  else if (location === "evil") total += RESONANCE_MODIFIERS["In an evil aligned area"];
  else if (location === "darklands") total += RESONANCE_MODIFIERS["In the dark lands"];

  if (spellTrait === "cantrip") total += RESONANCE_MODIFIERS.Cantrip;
  else if (spellTrait === "attack") total += RESONANCE_MODIFIERS["Attack Spell"];
  else if (spellTrait === "save") total += RESONANCE_MODIFIERS["Save Spell"];
  else if (spellTrait === "utility") total += RESONANCE_MODIFIERS["Utility Spell"];

  total +=
    RESONANCE_MODIFIERS["Per PP of the spell"] *
    Math.max(0, Math.floor(Number(pp) || 0));
  if (evilSpell) total += RESONANCE_MODIFIERS["Evil Spell"];
  if (etherealMagic) total += RESONANCE_MODIFIERS["Ethereal Magic"];
  if (soulMagic) total += RESONANCE_MODIFIERS["Soul Magic"];

  return total;
}

/**
 * Casting in Armour (Chapter 9): each tradition prohibits a different
 * category of armour while casting. Wearing a prohibited piece
 * increases spellcraft DC by that piece's own DR bonus x2. Divinity
 * casters are never prohibited; the other three each have their own
 * rule. Multiple prohibited pieces (e.g. a prohibited body armour and a
 * prohibited helmet) each contribute their own DR x2 — the rulebook
 * doesn't say only the highest applies, so this sums them.
 */
export function isArmourProhibited(tradition, armour) {
  if (tradition === "arcane") return true;
  if (tradition === "ethereal") {
    return String(armour.category ?? "").toLowerCase() === "heavy" || Boolean(armour.isHelmet);
  }
  if (tradition === "verdant") {
    return String(armour.material ?? "").toLowerCase() === "metal";
  }
  return false;
}

export function armourCastingPenalty(tradition, equippedArmour = []) {
  if (tradition === "divinity") return 0;
  return equippedArmour.reduce((total, armour) => {
    if (!isArmourProhibited(tradition, armour)) return total;
    return total + Math.max(0, Math.floor(Number(armour.dr) || 0)) * 2;
  }, 0);
}

/**
 * Magic Ritual overcasting (Chapter 9): the cooperative alternative to
 * Sacrifice. A primary caster, aided by secondary casters, can overcast
 * further than they could alone.
 */

/** "...permits the Primary caster to cast a spell of a number of PP
 * higher than their normal maximum by 2 x the amount of secondary
 * casters." Verified against the rulebook's own worked example (Quinn,
 * needing +4 PP, needs at least 2 secondary casters). */
export function magicRitualOvercastLimit(secondaryCasterCount) {
  return 2 * Math.max(0, Math.floor(Number(secondaryCasterCount) || 0));
}

/**
 * Each secondary caster's own check modifies the primary's Spellcraft
 * check: "Critical: +4. Success: +2. Failure: -4. Fumble: -10." No
 * Heroic/Partial/Blunder rows are listed; Heroic is treated as at least
 * as good as Critical (+4), Partial holds at the Failure penalty (no
 * explicit worse value given), and Blunder is one step worse than
 * Fumble, matching the sparse-table convention used throughout this
 * project.
 */
export function magicRitualSecondaryModifier(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return 4;
    case "success":
      return 2;
    case "partial":
    case "failure":
      return -4;
    case "fumble":
      return -10;
    case "blunder":
      return -14;
    default:
      return 0;
  }
}

/**
 * Ritual Mods (Chapter 9): situational DC modifiers layered on top of
 * the normal casting DC. "Suitable Ritual Focus" varies by GM discretion
 * and is supplied directly as a number rather than encoded here.
 */
export function ritualDCModifierTotal({
  ppOverPrimaryMax = 0,
  differentTraditionSecondaryCasters = 0,
  castingTimeX100 = false,
  castingTimeX10 = false,
  durationUnaltered = false,
  ritualFocusModifier = 0
} = {}) {
  let total = 0;
  total += 2 * Math.max(0, Math.floor(Number(ppOverPrimaryMax) || 0));
  total += 2 * Math.max(0, Math.floor(Number(differentTraditionSecondaryCasters) || 0));
  if (castingTimeX100) total += -2;
  // Casting time x10 is explicitly +/-0 in the rulebook's own table —
  // included for completeness, contributes nothing.
  if (durationUnaltered) total += -10;
  total += Math.floor(Number(ritualFocusModifier) || 0);
  return total;
}

/**
 * The ritual's final result is a normal Spell Casting Check "except that
 * the maximum result is a success" — Heroic and Critical both cap down
 * to Success. Nothing to cap on Partial/Failure/Fumble/Blunder.
 */
export function capRitualDegree(degreeKey) {
  const degree = DEGREE_BY_KEY[degreeKey] ?? DEGREE_BY_KEY.failure;
  if (degree.rank > DEGREE_BY_KEY.success.rank) return "success";
  return degreeKey;
}

/**
 * Does this spell need somebody pointed at before it is cast?
 *
 * WHY THIS EXISTS. `promptTargetSelection` has guarded every weapon
 * attack since it was written, for a reason its own file states: "nothing
 * stops an attack from being declared and rolled against whatever was
 * last targeted, or nothing at all". Casting had no such guard. In the
 * 3.286.0 playtest a Wizard put three Magic Missiles into her own
 * fighter, because the last thing targeted was him — by an enemy, on the
 * previous turn — and the cast never asked.
 *
 * NOT EVERY SPELL WANTS THE PROMPT, which is why this is a question
 * rather than an unconditional call:
 *
 *   `targets` names creatures ("1 or more creatures") — ask.
 *   `category: "attack"` resolves against a target's DB — ask, even if
 *     the entry left `targets` blank.
 *   `area` places a template, and the template decides who is caught —
 *     do not ask. Prompting for Fireball would collect a target the
 *     spell then ignores, which is worse than not asking.
 *   Neither — Mage Armour, Shield, True Strike — is cast on yourself or
 *     on nothing, and a prompt there is pure noise.
 *
 * AREA WINS OVER `targets`. A spell carrying both is an area spell with
 * a note about what it catches; the template is still what resolves it.
 *
 * @param {object} spellSystem
 * @returns {boolean}
 */
export function spellNeedsTarget(spellSystem) {
  const area = String(spellSystem?.area ?? "").trim();
  if (area) return false;
  const targets = String(spellSystem?.targets ?? "").trim();
  const category = String(spellSystem?.category ?? "").trim().toLowerCase();
  return Boolean(targets) || category === "attack";
}

/**
 * Does this spell resolve its own effect, rather than leaving it to the
 * effect engine or to the GM?
 *
 * DECLARED ON THE SPELL — `flags.trg-prime.selfApplying` — rather than
 * listed by name in the caster, so the next spell of this kind works
 * without editing `castSpell`. Cutting Words is the first: its penalty goes
 * onto the triggering check's own card, applied by code, and nothing about
 * the spell's `effects` array says so.
 *
 * @param {object} spell the spell Item (or anything carrying its flags)
 */
export function spellAppliesItself(spell) {
  return Boolean(spell?.flags?.["trg-prime"]?.selfApplying);
}

/**
 * The line a NON-BASIC save writes on the cast card.
 *
 * EXTRACTED SO IT CAN BE DRIVEN (3.356.1). "Apply the spell's effect by
 * hand" is advice, and advice that is wrong is worse than none: live on 21
 * August 2026 the Cutting Words cast card asked for a by-hand ruling in the
 * same breath as the card below it reported the penalty already applied.
 * The decision about when to offer that advice lived inside
 * `resolveSpellSave`, which no harness can call, so nothing could catch it.
 *
 * @param {object} state
 * @param {string} state.targetName
 * @param {string} state.degreeLabel
 * @param {number} state.total       what the defender rolled
 * @param {number} state.saveDC
 * @param {boolean} state.saved      the save succeeded
 * @param {boolean} state.negates    the spell's save line says "negates"
 * @param {boolean} state.hasEffects the spell carries structured effects
 * @param {boolean} state.selfApplying the spell resolves itself
 * @returns {string} the sentence, without its wrapping paragraph
 */
export function nonBasicSaveLine({
  targetName = "The target",
  degreeLabel = "",
  total = 0,
  saveDC = 0,
  saved = false,
  negates = false,
  hasEffects = false,
  selfApplying = false,
  // A SAVE THAT SUCCEEDS AND IS STILL REACHED (3.611.1, G3 of the 3.611.0
  // drive). Woeful Dread's Success is "a -20 mental critical injury and
  // frightened 1", and its card said the creature "resists" directly above
  // the injury and the condition landing on it.
  reachedOnSave = false
} = {}) {
  const head = `${targetName}: <strong>${degreeLabel}</strong> save (${total} vs ${saveDC}) — `;
  if (saved && reachedOnSave) return `${head}is affected even so.`;
  if (saved) return `${head}resists${negates ? " (negated)" : ""}.`;
  const byHand = hasEffects || selfApplying
    ? ""
    : " <em>Apply the spell's effect by hand.</em>";
  return `${head}is affected.${byHand}`;
}

/**
 * Is this spell a cantrip?
 *
 * PP 0 **AND** THE CANTRIP TRAIT (3.552.0), because the two are not the
 * same set and six choosers had been treating them as one. Every chooser
 * that offers "a cantrip" filtered on `ppCost === 0` alone, and the pack
 * holds 30 PP-0 spells of which exactly one is not a cantrip: Guidance,
 * printed as an INSIGHT UTILITY, traditions divinity/ethereal/verdant.
 * It was therefore offered by five of the six — Noldorni, Elven Magic,
 * Ethereal Trick, Verdant Gnome and Arcane Knowledge — every one of which
 * says "cantrip" in its own printed text. Only Gul-Fyr, being arcane-only,
 * escaped it.
 *
 * The pages 18-30 audit found this on Noldorni; the other four came out
 * of asking the same question of the pack rather than of the one report.
 *
 * BOTH HALVES ARE KEPT. Arcane Knowledge prints "cantrip (PP 0)", so the
 * cost is part of its own rule, and no cantrip in the pack costs anything
 * — requiring both is exact today and stays honest if either drifts.
 */
export function isCantripSpell(spell) {
  if (Number(spell?.system?.ppCost ?? 1) !== 0) return false;
  return /\bcantrip\b/i.test(String(spell?.system?.traits ?? ""));
}

/**
 * Does a SUCCESSFUL save still land a rung of this spell? (3.611.1, G3.)
 *
 * Read the way every printed ladder is read (`effectiveSaveDegree`): the
 * degree names its own rung, or the nearest printed one no better than
 * it. Notes and temporary immunities do not count — "The spell fails" and
 * "immune for 10 minutes" are not the creature being affected.
 *
 * @param {object[]} effects the spell's rows
 * @param {string} degree the rolled degree key
 * @param {Function} effective `effectiveSaveDegree`, injected
 * @returns {boolean}
 */
export function savedRungActsWith(effects, degree, effective) {
  const gated = (Array.isArray(effects) ? effects : [])
    .filter((e) => Array.isArray(e?.onSave) && e.onSave.length && e.kind !== "note" && e.kind !== "tempImmunity");
  if (!gated.length || typeof effective !== "function") return false;
  const key = effective(gated, degree);
  return gated.some((e) => e.onSave.includes(key));
}
