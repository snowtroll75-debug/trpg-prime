/**
 * Pain Tolerance (Chapter 6, Skill Actions — Mental Focus): "Critical
 * You ignore up to 1 point of the Dazed, Injured, or Weakened
 * condition until the end of your next turn. Success... until the
 * end of your current turn. Fumble... immune to this check for 1
 * hour."
 *
 * Scoped deliberately. The three target conditions carry different
 * bonus types in this project's own penalty calculation — Injured is
 * untyped, but Dazed and Weakened are Status, which stacks by
 * "highest applies" rather than summing (confirmed against this
 * project's own stacking logic before building anything). That rules
 * out a safe, universal "offsetting bonus" approach: an offsetting
 * Status bonus wouldn't reliably cancel a Status penalty if any other
 * Status modifier were also present, but it would for Injured's
 * untyped one — an inconsistency not worth building around. Instead,
 * this actually reduces the actor's real condition value by 1 and
 * restores it later, which behaves identically regardless of the
 * condition's bonus type.
 *
 * The "increase the DC before rolling for more suppression" option
 * and the fumble's one-hour real-world-time immunity are both left
 * out: this project has no existing check-configuration hook for a
 * pre-roll trade-off of this shape (the closest precedent, Medicine's
 * AP-for-healing trade, is a different shape entirely), and no
 * existing real-world-time cooldown mechanism anywhere else to build
 * this on top of, unlike everything else in this audit which reuses
 * turn/round-based infrastructure that already exists. Confirmed by
 * Graham directly: the DC-increase applies uniformly to whichever of
 * the three conditions was actually selected, not Injured
 * specifically — an apparent asymmetry flagged earlier in this
 * project's own audit turned out to be a misreading, not a genuine
 * rulebook inconsistency.
 */

/**
 * How many of the actor's own turn-ends must pass before the
 * suppressed point is restored — 1 for success ("until the end of
 * your current turn," the very next turn-end for this actor), 2 for
 * critical ("until the end of your next turn," skipping the current
 * one).
 *
 * @param {string} degreeKey
 * @returns {number|null} null if this degree grants no suppression.
 */
export function painToleranceTurnsRemaining(degreeKey) {
  if (degreeKey === "critical" || degreeKey === "heroic") return 2;
  if (degreeKey === "success") return 1;
  return null;
}

/**
 * The actor's chosen condition, reduced by the points ignored and
 * floored at 0 — "ignore up to 1 point", plus whatever a raised DC
 * bought.
 *
 * THE SECOND ARGUMENT IS NEW AT 3.559.0. It defaulted to one point
 * because one point was all the action could ever ignore: page 88's
 * trade — "for every 4 that you increase the DC, you may ignore an
 * additional point" — was printed in the action's own description and
 * implemented nowhere, so a player could read the offer and not take it.
 *
 * @param {number} currentValue
 * @param {number} [points] Points ignored; see painToleranceIgnoredPoints.
 * @returns {number}
 */
export function painToleranceReducedValue(currentValue, points = 1) {
  const ignored = Math.max(1, Math.floor(Number(points) || 1));
  return Math.max(0, Math.floor(Number(currentValue) || 0) - ignored);
}

const SYSTEM_ID = "trg-prime";
const FLAG_PREFIX = "painTolerance_";

/**
 * Applies the suppression: reduces the chosen condition by 1 and
 * flags how many of this actor's own turn-ends must pass before it's
 * restored.
 *
 * @param {Actor} actor
 * @param {string} conditionKey "dazed", "injured", or "weakened"
 * @param {string} degreeKey
 * @returns {Promise<number|null>} The new (reduced) value, or null if
 *   this degree grants no suppression.
 */
export async function applyPainTolerance(actor, conditionKey, degreeKey, points = 1) {
  const turnsRemaining = painToleranceTurnsRemaining(degreeKey);
  if (!turnsRemaining) return null;

  const currentValue = actor.getConditionValue(conditionKey) ?? 0;
  const newValue = painToleranceReducedValue(currentValue, points);

  // HOW MANY POINTS WERE ACTUALLY SUPPRESSED, not how many were bought.
  // A character with Dazed 1 who paid to ignore three points has one
  // point suppressed, and restoring three at the end of the turn would
  // hand them two points of a condition they never had.
  const suppressed = currentValue - newValue;

  await actor.toggleStatusEffect(conditionKey, { value: newValue });
  await actor.setFlag(SYSTEM_ID, `${FLAG_PREFIX}${conditionKey}`, { turnsRemaining, suppressed });

  return newValue;
}

/**
 * Called from _onEndTurn: decrements every pending Pain Tolerance
 * suppression by one turn-end, restoring the point (adding 1 back to
 * the condition) once its counter reaches 0.
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function decrementPainToleranceSuppressions(actor) {
  for (const conditionKey of ["dazed", "injured", "weakened"]) {
    const pending = actor.getFlag(SYSTEM_ID, `${FLAG_PREFIX}${conditionKey}`);
    if (!pending) continue;

    const remaining = Number(pending.turnsRemaining ?? 0) - 1;
    if (remaining > 0) {
      await actor.setFlag(SYSTEM_ID, `${FLAG_PREFIX}${conditionKey}`, { turnsRemaining: remaining });
      continue;
    }

    await actor.unsetFlag(SYSTEM_ID, `${FLAG_PREFIX}${conditionKey}`);
    // If the condition was fully healed/removed while this was still
    // pending, there's nothing left to restore a point to — adding
    // it back would incorrectly re-introduce a condition that's
    // otherwise gone.
    if (!actor.hasCondition?.(conditionKey)) continue;
    const currentValue = actor.getConditionValue(conditionKey) ?? 0;
    // AS MANY POINTS AS WERE SUPPRESSED (3.559.0). Cards written before
    // this version carry no count and restore one, which is the old
    // behaviour and is said out loud rather than silently trusted.
    const restore = Math.max(1, Math.floor(Number(pending.suppressed) || 1));
    await actor.toggleStatusEffect(conditionKey, { value: currentValue + restore });
  }
}
