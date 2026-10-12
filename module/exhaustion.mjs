/**
 * Exhaustion (Core 3.1, Chapter 7). Pure logic; the Foundry workflow in
 * exhaustion-workflow.mjs rolls the actual Fortitude save.
 *
 * "An exhaustion check is an easy (DC -2) level-based Fortitude saving
 * throw." Existing Fatigue and Injury already apply through the ordinary
 * condition-modifier pipeline (both are untyped/status penalties to all
 * checks), so this module only covers the parts that pipeline doesn't:
 * the fatigue gained per degree, the combat-duration DC creep, and the
 * cumulative deprivation modifiers.
 */

/** Fatigue gained per degree of the exhaustion check. */
export const EXHAUSTION_FATIGUE = Object.freeze({
  heroic: 0,
  critical: 0,
  success: 0,
  partial: 1,
  failure: 2,
  fumble: 4,
  blunder: 8
});

export function exhaustionFatigue(degreeKey) {
  return EXHAUSTION_FATIGUE[degreeKey] ?? 0;
}

/** A Critical result grants a +2 circumstance bonus to further exhaustion
 * checks made within the next ten minutes. */
export const EXHAUSTION_CRITICAL_BONUS = Object.freeze({
  value: 2,
  durationSeconds: 600
});

/**
 * "Combat: DC +1 per 5 rounds after the first" — a single check is made at
 * the end of combat, so this converts the combat's total round count into
 * that check's DC increase: no increase for a fight lasting one round, +1
 * once 5 further rounds have elapsed (round 6), +2 at round 11, and so on.
 *
 * @param {number} rounds Total rounds the combat lasted.
 * @returns {number}
 */
export function combatDurationModifier(rounds) {
  const value = Math.max(0, Math.floor(Number(rounds) || 0));
  if (value <= 1) return 0;
  return Math.floor((value - 1) / 5);
}

/**
 * The cumulative deprivation modifiers: -4/day with no sleep, -2/day with
 * half sleep (4 hours), -1/hour after a day without water, -2/day without
 * food. All four stack with each other and are supplied independently
 * since a character could be short on more than one at once.
 */
/**
 * Fatigue's own hard thresholds (Chapter 8, Rest & Sleep — "FATIGUED"):
 * 10 or higher and you fall unconscious until it's reduced; 20 or higher
 * and you die. The one statement of the thresholds: the sheet displays
 * it, and since 3.621.0 (Graham's R6 of block 39, "Lets automate these")
 * the actor grants Unconscious from it and `isDead` reads its "dead"
 * (conditions/condition-rules.mjs `instantDeathCause`).
 */
export function fatigueStatus(fatigue) {
  const value = Math.max(0, Math.round(Number(fatigue) || 0));
  if (value >= 20) return "dead";
  if (value >= 10) return "unconscious";
  return null;
}

/**
 * Fatigue Recovery (Chapter 8): "After every hour of rest, you make a
 * Level based Fortitude Saving Throw... Critical: reduce fatigue by 2.
 * Success: reduce by 1. Fumble: increase by 1." No Partial/Failure/
 * Blunder rows are listed; Partial and Failure hold fatigue steady (no
 * explicit worsening stated), and Blunder is treated as one step worse
 * than Fumble, consistent with the sparse-table convention used
 * throughout this project.
 */
export function fatigueRecoveryDelta(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return -2;
    case "success":
      return -1;
    case "partial":
    case "failure":
      return 0;
    case "fumble":
      return 1;
    case "blunder":
      return 2;
    default:
      return 0;
  }
}

/**
 * The cumulative deprivation modifiers: -4/day with no sleep, -2/day with
 * half sleep (4 hours), -1/hour after a day without water, -2/day without
 * food. All four stack with each other and are supplied independently
 * since a character could be short on more than one at once.
 */
export function deprivationModifier({
  daysNoSleep = 0,
  daysHalfSleep = 0,
  hoursNoWaterAfterDay = 0,
  daysNoFood = 0
} = {}) {
  return (
    -4 * Math.max(0, Number(daysNoSleep) || 0) +
    -2 * Math.max(0, Number(daysHalfSleep) || 0) +
    -1 * Math.max(0, Number(hoursNoWaterAfterDay) || 0) +
    -2 * Math.max(0, Number(daysNoFood) || 0)
  );
}

/**
 * The ACP/Encumbrance row of page 195's exhaustion modifier table.
 *
 * NEW at 3.579.0 (the block-19 audit's D18; Graham's R18 of 21 September
 * 2026). The table lists "ACP/Encumbrance penalty — varies" among the
 * check's modifiers, and neither reached it: the Armour Check Penalty
 * applies to Dexterity- and Strength-based skills and never to a save,
 * and the prompt had no field for either.
 *
 * READ AS ONE PENALTY, because the table prints them as one row: the
 * armour's ACP, plus one for each step of encumbrance the character is
 * carrying. Both are already computed elsewhere — `system.combat.acp` and
 * `encumbranceSteps` — so nothing here re-derives them.
 *
 * @param {object} state
 * @param {number} [state.acp] the Armour Check Penalty, as a magnitude
 * @param {number} [state.encumbranceSteps] steps over the allowance
 * @returns {number} a penalty (0 or negative)
 */
export function exhaustionLoadPenalty({ acp = 0, encumbranceSteps = 0 } = {}) {
  const armour = Math.max(0, Math.floor(Math.abs(Number(acp) || 0)));
  const load = Math.max(0, Math.floor(Number(encumbranceSteps) || 0));
  return -(armour + load);
}

/**
 * Which save an exhaustion check is rolled with.
 *
 * Page 195 prints Fortitude; Graham's R18 adds the GM's option of Will
 * for a check that is about the mind rather than the body — chosen in the
 * prompt, so the printed answer stays the default.
 *
 * @param {string} choice
 * @returns {"fortitude"|"will"}
 */
export function exhaustionSave(choice) {
  return String(choice ?? "").trim().toLowerCase() === "will" ? "will" : "fortitude";
}
