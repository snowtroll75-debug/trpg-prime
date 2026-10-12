/**
 * A DR POOL BELOW ZERO TAKES DR AWAY.
 *
 * NEW at 3.611.0, block 34. Pure; no Foundry.
 *
 *   DEVASTATING MIGHT (PP 7): "All creatures within the spell's radius,
 *   including yourself, have their DR reduced by 3."
 *   +4 PP: increase the amount you reduce by 1.
 *
 * The spell is a `dr` bonus row of −3, landing in `system.combat.dr`, the
 * pool every DR bonus lands in. Both damage paths read that pool as
 * `Math.max(0, total)` and add it to natural armour — right for a bonus,
 * and it silently threw a penalty away. So a negative pool is spent here:
 * natural armour's DR first (the pool's own channel), then the armour's,
 * and never below zero.
 */

/**
 * @param {number} armourDr the armour DR this hit faces, before the penalty
 * @param {number} naturalDr the natural-armour DR, the pool's positive part included
 * @param {number} poolTotal `system.combat.dr.total`
 * @returns {{armourDr: number, naturalDr: number, penalty: number}}
 */
export function drAfterPenalty(armourDr, naturalDr, poolTotal) {
  const armour = Math.max(0, Number(armourDr) || 0);
  const natural = Math.max(0, Number(naturalDr) || 0);
  const penalty = Math.max(0, -(Number(poolTotal) || 0));
  if (!penalty) return { armourDr: armour, naturalDr: natural, penalty: 0 };
  const fromNatural = Math.min(natural, penalty);
  return {
    armourDr: Math.max(0, armour - (penalty - fromNatural)),
    naturalDr: natural - fromNatural,
    penalty
  };
}
