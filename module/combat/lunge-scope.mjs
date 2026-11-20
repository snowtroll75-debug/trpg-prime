/**
 * A LUNGE WITH ANOTHER ATTACK ACTION (3.705.0).
 *
 * Lunge: "Using your melee weapon, you may take an action with the attack
 * trait. This action gains the reach trait for that Strike." Graham, 20
 * November 2026: yes, any action with the attack trait, not only Strike.
 *
 * The action is run as itself (its own AP, checks and cards) while this
 * scope says it is a Lunge. Everything that measures reach or adds the
 * Strike's modifiers during that run reads the scope:
 *
 *   rollWeaponAttack     a melee Strike gains Reach (+5 ft), Lunge's -1 and
 *                        never the Reach -2 (Double Slice's two Strikes,
 *                        Vital Strike's, Combat Grapple's, …)
 *   resolveAction        a maneuver's reach (`action-reach.mjs`) is +5 ft,
 *                        with Lunge's -1 on its check
 *
 * Kept on this client, for the length of one action, because the action
 * runs here from start to finish. Nothing is written to the actor, so
 * nothing is left behind if the action is cancelled.
 *
 * Charge is the exception: its Strike comes after the move, in another
 * call, so the Lunge rides on the charge record (charge-workflow.mjs).
 */

const ACTIVE = new Map();

const keyOf = (actor) => actor?.uuid ?? actor?.id ?? null;

/**
 * Run `fn` as a Lunge by `actor`, with `terms` from `lungeStrikeTerms`.
 *
 * @template T
 * @param {Actor} actor
 * @param {{grantTraits: string[], extraModifiers: object[], waiveReachPenalty: boolean}} terms
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withLunge(actor, terms, fn) {
  const key = keyOf(actor);
  if (!key) return fn();
  ACTIVE.set(key, terms);
  try {
    return await fn();
  } finally {
    ACTIVE.delete(key);
  }
}

/**
 * The Lunge this actor's current action is made with, or null.
 *
 * @param {Actor} actor
 */
export function lungeScopeFor(actor) {
  const key = keyOf(actor);
  return key ? ACTIVE.get(key) ?? null : null;
}
