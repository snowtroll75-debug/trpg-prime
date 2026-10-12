/**
 * Spatial Awareness (Chapter 6, Skill Actions — Perception): "Failure
 * You immediately lose 1 AP. If you have no AP remaining then you
 * gain Stunned 1. Fumble You immediately lose 2 AP. If you have no
 * AP remaining then you gain Stunned 2."
 *
 * A clean, fully mechanical outcome with nothing GM-adjudicated —
 * the AP loss and the conditional Stunned both follow directly from
 * the actor's own current AP total.
 */

const AP_LOSS = { failure: 1, fumble: 2 };
const STUNNED_VALUE = { failure: 1, fumble: 2 };

/**
 * @param {number} currentAP
 * @param {string} degreeKey "failure" or "fumble" — any other degree
 *   has no stated consequence.
 * @returns {{newAP: number, stunnedValue: number|null}} stunnedValue
 *   is null when AP remains after the loss — "if you have no AP
 *   remaining" wasn't met.
 */
export function spatialAwarenessOutcome(currentAP, degreeKey) {
  const loss = AP_LOSS[degreeKey];
  if (!loss) return { newAP: Math.max(0, Math.floor(Number(currentAP) || 0)), stunnedValue: null };

  const before = Math.max(0, Math.floor(Number(currentAP) || 0));
  const newAP = Math.max(0, before - loss);
  const stunnedValue = newAP === 0 ? STUNNED_VALUE[degreeKey] : null;

  return { newAP, stunnedValue };
}
