/**
 * Charge (Core 3.1, Chapter 4 — Basic Actions). Pure logic; the Foundry
 * side is charge-workflow.mjs.
 *
 * "You take two Stride actions (minimum of 10 feet moved) and move
 *  directly towards your target. If your target is within reach at the
 *  end of your movement, you may make a melee Strike action against them
 *  with a +4-circumstance bonus to the attack roll.
 *  You can use Charge while Burrowing, Climbing, Flying, or Swimming
 *  instead of Striding if you have the corresponding movement type."
 *
 * Three AP buys ALL of that — two Strides and a Strike — which is why
 * the Strike this ends in must not charge its own AP on top.
 *
 * WHAT IS ENFORCED AND WHAT IS NOT. The two-Stride allowance and the
 * ten-foot minimum are enforced, because they are the parts a player
 * cannot eyeball: "have I moved far enough, and may I still move?" is
 * arithmetic against a Speed. "Directly towards" is enforced only as
 * ENDING CLOSER THAN YOU STARTED — a real test that catches a charge
 * away from the target or a sidestep, without pretending to police the
 * exact line across a hex grid, round obstacles, at three elevations.
 * The GM has the map; this has the numbers.
 */

/** "minimum of 10 feet moved" */
export const CHARGE_MINIMUM_FEET = 10;

/** "two Stride actions" — so twice your Speed, whichever Speed you used. */
export const CHARGE_STRIDES = 2;

/** "a +4-circumstance bonus to the attack roll" */
export const CHARGE_ATTACK_BONUS = 4;

/** The whole action, for the 3 AP it costs. */
export const CHARGE_AP_COST = 3;

/**
 * The furthest a Charge may carry you.
 *
 * @param {number} speed
 * @returns {number}
 */
export function chargeLimit(speed) {
  return Math.max(0, Math.floor(Number(speed) || 0)) * CHARGE_STRIDES;
}

/**
 * Is this move a legal Charge?
 *
 * @param {object} args
 * @param {number} args.moveCost      Terrain-adjusted feet of this move.
 * @param {number} args.speed         The Speed being used.
 * @param {number|null} [args.startDistance] Feet to the target before moving.
 * @param {number|null} [args.endDistance]   Feet to the target after moving.
 * @returns {{allowed: boolean, reason: string, limit: number}}
 */
export function validateChargeMove({ moveCost, speed, startDistance = null, endDistance = null } = {}) {
  const cost = Math.max(0, Number(moveCost) || 0);
  const limit = chargeLimit(speed);

  if (limit <= 0) {
    return { allowed: false, reason: "Charge needs a Speed to move with", limit };
  }
  if (cost < CHARGE_MINIMUM_FEET) {
    return {
      allowed: false,
      reason: `Charge must cover at least ${CHARGE_MINIMUM_FEET} feet — that move is ${cost}`,
      limit
    };
  }
  if (cost > limit) {
    return {
      allowed: false,
      reason: `Charge is two Strides — at most ${limit} feet at Speed ${speed} — and that move is ${cost}`,
      limit
    };
  }
  // "…and move directly towards your target." Only tested when both
  // distances are known; a Charge at a target the system cannot locate is
  // let through rather than refused on a measurement it does not have.
  if (startDistance !== null && endDistance !== null && endDistance >= startDistance) {
    return {
      allowed: false,
      reason: "Charge must move you towards your target",
      limit
    };
  }
  return { allowed: true, reason: "", limit };
}

/**
 * "If your target is within reach at the end of your movement…"
 *
 * @param {number|null} endDistance
 * @param {number} reach
 * @returns {boolean}
 */
export function chargeStrikeAvailable(endDistance, reach) {
  if (endDistance === null || endDistance === undefined) return false;
  return Number(endDistance) <= Math.max(0, Number(reach) || 0);
}

/** The modifier row the Charge Strike carries. */
export function chargeStrikeModifier() {
  return { label: "Charge", value: CHARGE_ATTACK_BONUS, type: "circumstance" };
}
