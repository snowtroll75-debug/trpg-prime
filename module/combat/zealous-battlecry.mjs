/**
 * ZEALOUS BATTLECRY — NEW at 3.614.0, Graham's R7 of 2 October 2026 (block 35):
 * "Automate as stated."
 *
 * Page 360:
 *   "Trigger You and at least 1 ally are about to roll initiative.
 *    Range 10 feet; Targets you and the triggering ally.
 *    … Both you and the target ally roll a d100, and the higher result is
 *    used for determining initiative rolls."
 *
 * READ AS THE DIE, NOT THE TOTAL. Initiative here is "d100 + (Dex x5) +
 * (Wis x5)", and what the two roll is the d100: each keeps their own bonus
 * and both use the better die. So the pair is recorded on the combat when
 * the spell is cast, each roll stores its own die, and once both have
 * rolled each initiative is moved by the difference between the better die
 * and its own.
 *
 * Pure; no Foundry. The documents half is zealous-battlecry-workflow.mjs.
 */

export const ZEALOUS_BATTLECRY = "Zealous Battlecry";
export const ZEALOUS_RANGE_FEET = 10;
export const ZEALOUS_PAIRS_FLAG = "zealousPairs";
export const INIT_DIE_FLAG = "initDie";

/**
 * Both combatants' initiatives once each has rolled, or null while one has
 * not.
 * @param {{initiative: number|null, die: number|null}} a
 * @param {{initiative: number|null, die: number|null}} b
 * @returns {{die: number, a: number, b: number}|null}
 */
export function zealousInitiatives(a, b) {
  const ready = (c) => Number.isFinite(Number(c?.initiative)) && c?.initiative !== null
    && Number.isFinite(Number(c?.die)) && c?.die !== null;
  if (!ready(a) || !ready(b)) return null;
  const die = Math.max(Number(a.die), Number(b.die));
  return {
    die,
    a: Number(a.initiative) - Number(a.die) + die,
    b: Number(b.initiative) - Number(b.die) + die
  };
}

/** The card line once a pair is settled. */
export function zealousLine(nameA, nameB, die, totals) {
  return `<strong>Zealous Battlecry</strong> — ${nameA} and ${nameB} both use the higher d100, `
    + `<strong>${die}</strong>: initiative ${totals.a} and ${totals.b}.`;
}
