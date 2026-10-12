/**
 * ARROW CATCHING DRAWS THE MISSILE — NEW at 3.616.0, the second half of
 * Graham's R6 of block 36 (page 366), and B3 of the audit.
 *
 * "When activated the armour or shield increases its bonus to DB by +1
 * against missile attacks. Additionally, any projectile or thrown weapon
 * aimed at a target within 5 feet of the wielder diverts from its original
 * target and targets them instead. If the wielder has greater cover, the
 * projectile or thrown weapon is not diverted. Additionally, those
 * attacking the wearer with ranged weapons ignore any bonuses for the
 * concealed condition that would normally apply."
 *
 * 3.615.0 built the activation and the +1. This is the rest:
 *
 *   - THE DIVERSION. Graham ruled it covers missiles "aimed at anyone": an
 *     ally, a foe, a stranger. The attacker and the original target are
 *     never the catcher — a wearer shot at is simply shot at, and a wearer
 *     cannot divert their own arrow onto themselves. Greater cover is read
 *     from the Take Cover the system itself applied; cover the GM rules by
 *     eye is the GM's.
 *   - CONCEALMENT. A ranged attacker ignores the wearer's concealed
 *     condition — and only that one. Hidden and invisible are other
 *     conditions with their own checks, and the page names one.
 *
 * Two catchers within five feet: the nearer one takes it, and a tie goes
 * to whichever the scene lists first. The page does not say; a missile
 * cannot land twice.
 *
 * Pure; no Foundry.
 */

/** The page's "within 5 feet of the wielder". */
export const ARROW_CATCHING_FEET = 5;

/**
 * Whether a creature's Arrow Catching is switched on: an equipped piece
 * carrying the rune with its minute running. Read through the same sum the
 * +1 DB comes from, so the two can never disagree.
 * @param {{missileDefence?: number}} runeBonuses runeBonusesForActor's answer
 */
export function arrowCatchingActive(runeBonuses) {
  return Number(runeBonuses?.missileDefence ?? 0) > 0;
}

/**
 * Which creature, if any, the missile is drawn to.
 *
 * @param {Array<{id: string, distanceToTarget: number|null, active: boolean, cover?: string}>} candidates
 *   every other creature on the scene, with its distance to the original
 *   target in feet
 * @param {{attackerId?: string, targetId?: string, ranged: boolean}} attack
 * @returns {object|null} the candidate that catches it
 */
export function divertingCatcher(candidates, { attackerId = "", targetId = "", ranged = false } = {}) {
  if (!ranged) return null;
  let best = null;
  for (const c of candidates ?? []) {
    if (!c?.active) continue;
    if (!c.id || c.id === attackerId || c.id === targetId) continue;
    const feet = Number(c.distanceToTarget);
    if (c.distanceToTarget === null || c.distanceToTarget === undefined || !Number.isFinite(feet)) continue;
    if (feet > ARROW_CATCHING_FEET) continue;
    // "If the wielder has greater cover, the projectile … is not diverted."
    if (String(c.cover ?? "") === "greater") continue;
    if (!best || feet < Number(best.distanceToTarget)) best = c;
  }
  return best;
}

/**
 * Whether a ranged attacker sees through the target's concealed
 * condition: "those attacking the wearer with ranged weapons ignore any
 * bonuses for the concealed condition".
 */
export function ignoresConcealmentOf(runeBonuses, { ranged = false } = {}) {
  return Boolean(ranged) && arrowCatchingActive(runeBonuses);
}

/** The card's line for a diverted missile. */
export function diversionLine({ weaponName = "The missile", fromName = "its target", toName = "the wearer", feet = null } = {}) {
  const at = Number.isFinite(Number(feet)) && feet !== null ? ` ${feet} ft away` : "";
  return `<strong>${toName}'s Arrow Catching rune draws the shot.</strong> ${weaponName} was aimed at ${fromName}${at}, and is diverted to ${toName} instead.`;
}
