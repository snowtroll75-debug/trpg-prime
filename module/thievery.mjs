/**
 * THIEVERY (Chapter 4, page 96). Pure; no Foundry.
 *
 * NEW at 3.565.0. The two time ladders and the thieves'-tools
 * requirement on Disable a Device and Pick Lock were already built. What
 * was not: Pick Pocket's two numeric rules, and the successes the two
 * Thievery ladders earn.
 */

/* ------------------------------------------------------------------ *
 * PICK POCKET                                                         *
 * ------------------------------------------------------------------ */

/**
 * "If the object is in a pocket, purse or is closely guarded in some
 * other way the DC is increased by 5."
 */
export const GUARDED_OBJECT_DC = 5;

/**
 * "Be aware that your check automatically fails if the creature you are
 * stealing from is in combat or on guard."
 *
 * TWO CONDITIONS, AND ONLY ONE OF THEM IS KNOWABLE. Whether a creature
 * is in combat is a fact the system holds; whether it is "on guard" is
 * the GM's reading of the scene. So this takes both as arguments and the
 * caller supplies what it can — the combat half from `game.combat`, the
 * other from a checkbox — rather than this module reaching for either.
 *
 * AN AUTO-FAIL IS NOT A REFUSAL. The action is attempted and fails; it
 * is not blocked before the AP is spent, because the character does not
 * know the mark is alert until they try. That is also why this returns a
 * reason rather than a boolean: the card has to say which half fired.
 *
 * @param {object} state
 * @param {boolean} state.inCombat
 * @param {boolean} state.onGuard
 * @returns {string} the reason, or "" when the attempt may resolve normally
 */
export function pickPocketAutoFail({ inCombat = false, onGuard = false } = {}) {
  if (inCombat) return "the creature is in combat";
  if (onGuard) return "the creature is on guard";
  return "";
}

/* ------------------------------------------------------------------ *
 * DISABLE A DEVICE / PICK LOCK — COMPLEXITY                           *
 * ------------------------------------------------------------------ */

/**
 * "The complexity of the device determines the number of successful
 * attempts required to fully disarm it."
 *
 *   Critical — "you disable the device or make significant progress in
 *               disarming a complex device, ACHIEVING TWO SUCCESSES"
 *   Success  — "you disable the device, or you achieve ONE SUCCESS"
 *
 * Pick Lock prints the same ladder for "a complex lock".
 *
 *   Heroic   — THREE (3.619.0; Chapter 12, page 397, block 38's A1 and
 *              Graham's R14): "a critical on a disabling check counts as
 *              two successes on a single component, whereas a result of
 *              heroic counts as three". Chapter 4 prints no Heroic row, so
 *              it fell back to the Critical's two. Locks alike.
 *
 * A FUMBLE COSTS NO PROGRESS, and does not reset it either. The printed
 * Fumble is "you trigger the device" (or "you break your tools") — both
 * are consequences elsewhere, and neither says the work so far is
 * undone. Inventing a reset would be the harsher reading of a sentence
 * the book did not write.
 *
 * @param {string} degree
 * @returns {number} successes earned, 0–3
 */
export function disableSuccesses(degree) {
  const key = String(degree ?? "");
  if (key === "heroic") return 3;
  if (key === "critical") return 2;
  if (key === "success") return 1;
  return 0;
}

/**
 * Progress after this attempt.
 *
 * @param {number} already successes banked before this check
 * @param {number} required the device's complexity
 * @param {string} degree
 * @returns {{banked: number, required: number, done: boolean, earned: number}}
 */
export function disableProgress(already, required, degree) {
  const need = Math.max(1, Math.trunc(Number(required) || 1));
  const earned = disableSuccesses(degree);
  const banked = Math.min(need, Math.max(0, Math.trunc(Number(already) || 0)) + earned);
  return { banked, required: need, done: banked >= need, earned };
}
