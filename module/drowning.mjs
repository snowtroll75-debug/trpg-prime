/**
 * Drowning and suffocation (Chapter 7, page 202) — the rules, pure.
 *
 * NEW at 3.580.0, for the block-20 audit's D3 and Graham's R3 of
 * 21 September 2026: "Yes."
 *
 * WHAT WAS WRONG. Nothing. There was nothing at all — no air counter, no
 * Suffocating state, no save ladder. The rest of the book had already
 * noticed without anyone acting on it: two critical rows apply
 * Suffocating by name, and a feat grants "you can also hold your breath
 * 10× as long as usual before suffocating", multiplying a number the
 * system was not counting.
 *
 * THE PAGE, in its own words:
 *
 *   "You can hold your breath for a number of rounds equal to 5 + Con or
 *    1 round whichever is greater.
 *
 *    Reduce your remaining air by 1 round at the end of each of your
 *    turns, or by 2 if you attacked or cast any spells that turn. You
 *    also lose 1 round worth of air each time you are critically hit or
 *    critically fail a save against a damaging effect. If you speak
 *    (including casting spells with verbal components or activating
 *    items with command components) you lose all remaining air.
 *
 *    When you run out of air, you fall unconscious and start
 *    suffocating. You can't recover from being unconscious and must
 *    attempt a Fortitude save, needing to achieve 20 or greater, at the
 *    end of each of your turns. On a failure, you take 10 damage
 *    (untyped), and on a critical failure, you die. On each check after
 *    the first, you take a cumulative -2 penalty to the save and the
 *    damage increases by 5; these increases are cumulative. Once your
 *    access to air is restored, you stop suffocating and are no longer
 *    unconscious.
 *
 *    Be aware that you only regain consciousness if there are no other
 *    factors causing the condition."
 */

/** The save the page names, and it is a number to beat, not a degree. */
export const SUFFOCATION_SAVE_DC = 20;

/** "On a failure, you take 10 damage (untyped)". */
export const SUFFOCATION_BASE_DAMAGE = 10;

/** "the damage increases by 5" per check after the first. */
export const SUFFOCATION_DAMAGE_STEP = 5;

/** "a cumulative -2 penalty to the save" per check after the first. */
export const SUFFOCATION_SAVE_STEP = -2;

/**
 * How long this creature can hold its breath.
 *
 * "5 + Con or 1 round whichever is greater" — the floor is there for a
 * Constitution of -4 or worse, and it is a floor on the TOTAL, not on
 * the modifier.
 *
 * @param {number} constitution the modifier, not the score
 * @param {number} [multiplier] feats that multiply it (Chapter 5's
 *   "hold your breath 10× as long as usual")
 * @returns {number} rounds
 */
export function breathCapacity(constitution, multiplier = 1) {
  const con = Math.trunc(Number(constitution) || 0);
  const base = Math.max(1, 5 + con);
  const factor = Math.max(1, Math.trunc(Number(multiplier) || 1));
  return base * factor;
}

/**
 * The air a turn costs.
 *
 * "Reduce your remaining air by 1 round at the end of each of your
 * turns, or by 2 if you attacked or cast any spells that turn."
 *
 * @param {object} [state]
 * @param {boolean} [state.actedViolently] attacked or cast this turn
 * @returns {number}
 */
export function airSpentThisTurn({ actedViolently = false } = {}) {
  return actedViolently ? 2 : 1;
}

/**
 * The air an EVENT costs, outside the turn's own tick.
 *
 * "You also lose 1 round worth of air each time you are critically hit
 * or critically fail a save against a damaging effect. If you speak…
 * you lose all remaining air."
 *
 * Speaking answers `Infinity` rather than a number, because "all
 * remaining air" is not a quantity this function can know and the
 * caller clamps it against what is left anyway.
 *
 * @param {object} [event]
 * @param {boolean} [event.criticallyHit]
 * @param {boolean} [event.criticalSaveFailure] against a damaging effect
 * @param {boolean} [event.spoke] including verbal components and command words
 * @returns {number}
 */
export function airLostToEvent({ criticallyHit = false, criticalSaveFailure = false, spoke = false } = {}) {
  if (spoke) return Infinity;
  return (criticallyHit ? 1 : 0) + (criticalSaveFailure ? 1 : 0);
}

/**
 * Spend air, and say whether it has just run out.
 *
 * @param {number} remaining
 * @param {number} cost
 * @returns {{remaining: number, ranOut: boolean}}
 */
export function spendAir(remaining, cost) {
  const had = Math.max(0, Math.trunc(Number(remaining) || 0));
  const spend = Number(cost) === Infinity ? had : Math.max(0, Math.trunc(Number(cost) || 0));
  const left = Math.max(0, had - spend);
  return { remaining: left, ranOut: had > 0 && left === 0 };
}

/**
 * The suffocation save at the Nth check.
 *
 * "attempt a Fortitude save, needing to achieve 20 or greater… On each
 * check after the first, you take a cumulative -2 penalty to the save
 * and the damage increases by 5; these increases are cumulative."
 *
 * THE DC DOES NOT MOVE; THE SAVE DOES. The page gives a fixed number to
 * achieve and a penalty to the roll, which are not the same thing as a
 * rising DC once anything else modifies the check — so the penalty is
 * returned as a modifier to apply, and the DC stays 20.
 *
 * @param {number} checksMade how many suffocation saves have already
 *   been attempted; 0 for the first
 * @returns {{dc: number, penalty: number, damage: number}}
 */
export function suffocationSave(checksMade = 0) {
  const prior = Math.max(0, Math.trunc(Number(checksMade) || 0));
  return {
    dc: SUFFOCATION_SAVE_DC,
    penalty: SUFFOCATION_SAVE_STEP * prior,
    damage: SUFFOCATION_BASE_DAMAGE + SUFFOCATION_DAMAGE_STEP * prior
  };
}

/**
 * What one suffocation save does.
 *
 * "On a failure, you take 10 damage (untyped), and on a critical
 * failure, you die."
 *
 * @param {object} state
 * @param {number} state.total the roll with its penalty already in it
 * @param {number} state.dc
 * @param {boolean} [state.criticalFailure] the check's own degree
 * @param {number} state.damage from `suffocationSave`
 * @returns {{passed: boolean, dies: boolean, damage: number}}
 */
export function suffocationOutcome({ total = 0, dc = SUFFOCATION_SAVE_DC, criticalFailure = false, damage = SUFFOCATION_BASE_DAMAGE } = {}) {
  if (criticalFailure) return { passed: false, dies: true, damage: 0 };
  const passed = Number(total) >= Number(dc);
  return { passed, dies: false, damage: passed ? 0 : Math.max(0, Math.trunc(Number(damage) || 0)) };
}

/**
 * Air is back.
 *
 * "Once your access to air is restored, you stop suffocating and are no
 * longer unconscious. Be aware that you only regain consciousness if
 * there are no other factors causing the condition."
 *
 * @param {object} [state]
 * @param {boolean} [state.otherReasonUnconscious] dying, dead, at 0 HP,
 *   or unconscious for a reason that has nothing to do with air
 * @returns {{stopsSuffocating: boolean, wakes: boolean}}
 */
export function airRestored({ otherReasonUnconscious = false } = {}) {
  return { stopsSuffocating: true, wakes: !otherReasonUnconscious };
}
