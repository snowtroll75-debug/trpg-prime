/**
 * FALSE ARROGANCE (3.612.0, block 34's R8). Pure; no Foundry.
 *
 * Page 348: "When the target fails an attack roll or skill check, it incurs
 * a -1 status penalty to subsequent attack rolls and skill checks until the
 * end of its turn (or the end of its next turn if the roll was made outside
 * its turn). If the target fails again while under this penalty, the
 * penalty increases to -2. The duration of the effect varies based on the
 * target's Will save. After making the save, the creature becomes
 * temporarily immune to the spell for 24 hours.
 *   Critical unaffected · Success 1 round · Partial 1 minute ·
 *   Failure 10 minutes · Fumble 24 hours"
 *
 * TWO THINGS ON THE TARGET, WITH TWO CLOCKS. The spell's own effect is a
 * marker that lasts as long as the save decided (markers.mjs, read and never
 * spent). The penalty is a separate effect that each failure writes and
 * rewrites, lasting to the end of this turn or the next. One effect could
 * not carry both lengths, and the penalty must be able to lapse and come
 * back while the spell runs on.
 *
 * WHAT COUNTS AS A FAILURE: any degree that is not a success — Partial
 * included, since a Partial "fails by less than 5". On an attack roll or a
 * skill check, and nothing else: saves, Spellcraft and flat checks are not
 * what the page names.
 */

export const ARROGANCE_PENALTY_FLAG = "falseArrogancePenalty";
const ARROGANCE_CHECK_TYPES = Object.freeze(["attack", "skill"]);
const ARROGANCE_MAX_PENALTY = 2;

/** Does this roll feed the spell? */
export function arroganceTriggers(checkType, degreeIsSuccess, degreeKnown = true) {
  return Boolean(degreeKnown) && !degreeIsSuccess && ARROGANCE_CHECK_TYPES.includes(String(checkType ?? ""));
}

/** The penalty after one more failure: 1, then 2, never more. */
export function nextArrogancePenalty(current) {
  const now = Math.max(0, Math.trunc(Number(current) || 0));
  return Math.min(ARROGANCE_MAX_PENALTY, now + 1);
}

/**
 * How long the penalty lasts, as the duration text the engine already reads
 * ("until the end of its turn" is one round boundary, "its next turn" two).
 * @param {boolean} ownTurn the failed roll was made on the creature's own turn
 */
export function arroganceWindow(ownTurn) {
  return ownTurn ? "until the end of its turn" : "until the end of its next turn";
}

/** The card line under the failed roll. */
export function arroganceLine(name, penalty, window) {
  return `False Arrogance: ${name} blames the world — a −${penalty} status penalty to attack rolls `
    + `and skill checks ${window}.`;
}
