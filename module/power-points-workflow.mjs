/**
 * Applying a Power Point spend to an actor — the pool, and the Soul
 * Drain a shortfall costs (Chapter 4, page 91's NEGATIVE PP).
 *
 * The rule itself is in power-points.mjs and is pure. This is the one
 * place that writes it to a sheet, so that "spend PP" cannot be done
 * anywhere without the half of the sentence that charges for going
 * below zero.
 */
import { spendPowerPoints, powerPointSpendNote } from "./power-points.mjs";

/**
 * Spend PP, flooring the pool at 0 and applying the Soul Drain the
 * shortfall costs.
 *
 * SOUL DRAIN ACCUMULATES rather than replacing: it is a valued
 * condition, and a caster who overspends twice in a fight is twice as
 * drained. Read immediately before the write, not carried in, because
 * a Resonance Event or a second overspend between the two would be
 * overwritten by a stale total — the same trap `applyPainTolerance`
 * records for its own suppressed value.
 *
 * @param {Actor} actor
 * @param {number} cost
 * @param {string} label what the PP was spent on, for the card line
 * @returns {Promise<{value:number, spent:number, shortfall:number,
 *   soulDrain:number, note:string}>}
 */
export async function applyPowerPointCost(actor, cost, label = "") {
  const current = Number(actor?.system?.resources?.pp?.value ?? 0);
  const result = spendPowerPoints(current, cost);
  if (!result.spent) return { ...result, note: "" };

  await actor.update({ "system.resources.pp.value": result.value });

  if (result.soulDrain) {
    /*
     * THROUGH `setSoulDrain`, NOT THE TOGGLE (3.589.0).
     *
     * This wrote the condition directly, which skips the half of the
     * Soul Drain rule that matters most: Soul Drain lowers MAXIMUM hit
     * points, and `setSoulDrain` checks whether it has driven that
     * maximum below zero — in which case the character dies. A caster
     * who overspends far enough is killed by the overspend, and this
     * path silently could not kill anybody.
     *
     * Two writers of one condition, one of them knowing a rule the
     * other did not. Found while building the resource drain, which
     * needed the same call for Enervation's soul drain and turned up
     * the disagreement.
     */
    const { setSoulDrain } = await import("./combat/dying-workflow.mjs");
    const drained = Number(actor.getConditionValue?.("soulDrain") ?? 0);
    await setSoulDrain(actor, drained + result.soulDrain);
  }

  return { ...result, note: powerPointSpendNote(result, label) };
}
