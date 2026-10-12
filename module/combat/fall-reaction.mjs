/**
 * Arrest a Fall and Catfall (Chapter 6, Skill Actions — Acrobatics),
 * both reactions triggered "when you fall." Neither rolls falling
 * damage itself — this project's existing Falling From Height
 * workflow (falling.mjs/falling-workflow.mjs) already owns that, and
 * its own prompt already expects a distance "already reduced for...
 * a successful Grab an Edge, if [it] applied" — these two follow the
 * same established pattern: compute the actual reduction from the
 * actor's real Acrobatics bonus (not leave it as generic "x2" text)
 * and report it, leaving the final Falling From Height roll to the
 * separate, already-built action once the true distance is known.
 *
 * "If this reduces the distance fallen to less than 10 feet, you
 * take no damage" depends on the actual fall distance, which isn't
 * yet known at the moment this reaction resolves (the fall may still
 * be in progress) — left as guidance text for whoever enters the
 * final distance into Falling From Height, not evaluated here.
 */

/**
 * Arrest a Fall: "Success You fall without taking damage. Failure
 * You fall normally."
 *
 * @param {string} degreeKey
 * @returns {{noDamage: boolean}}
 */
export function arrestAFallOutcome(degreeKey) {
  return { noDamage: degreeKey === "heroic" || degreeKey === "critical" || degreeKey === "success" };
}

/**
 * Catfall: reduces the effective fall distance by a multiple of the
 * actor's own Acrobatics skill bonus (critical x5, success x2,
 * partial x1), or doubles the distance for damage purposes on a
 * fumble instead.
 *
 * @param {number} acrobaticsBonus
 * @param {string} degreeKey
 * @returns {{reductionFeet: number, damageMultiplier: number}}
 */
export function catfallOutcome(acrobaticsBonus, degreeKey) {
  const bonus = Math.max(0, Math.floor(Number(acrobaticsBonus) || 0));

  switch (degreeKey) {
    case "heroic":
    case "critical":
      return { reductionFeet: bonus * 5, damageMultiplier: 1 };
    case "success":
      return { reductionFeet: bonus * 2, damageMultiplier: 1 };
    case "partial":
      return { reductionFeet: bonus, damageMultiplier: 1 };
    case "fumble":
    case "blunder":
      return { reductionFeet: 0, damageMultiplier: 2 };
    case "failure":
    default:
      return { reductionFeet: 0, damageMultiplier: 1 };
  }
}
