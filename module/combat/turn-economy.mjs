/**
 * Turn economy (Core 3.1, Chapter 7). Pure logic, no Foundry dependency.
 *
 * Phase 1 of a turn regains 3 AP and the reaction. Stunned reduces the AP
 * regained by its value and is itself reduced by the AP lost. Stunned
 * overrides Slowed: AP lost to Stunned counts toward the AP Slowed would
 * remove. Quickened grants 1 additional AP.
 *
 * The rulebook's own worked example: Stunned 1 and Slowed 2 at the start of
 * the turn loses 1 AP to Stunned, then only 1 more to Slowed, leaving 1 AP.
 */

export const BASE_AP = 3;

/**
 * Compute the AP available at the start of a turn.
 *
 * @param {object} options
 * @param {number} [options.stunned] Current Stunned value.
 * @param {number} [options.slowed] Current Slowed value.
 * @param {boolean} [options.quickened]
 * @param {number} [options.base]
 * @returns {{ap: number, stunnedRemaining: number, apLostToStunned: number,
 *   apLostToSlowed: number, reactionLost: boolean, quickenedBonus: number}}
 */
export function computeAPRegain({
  stunned = 0,
  slowed = 0,
  quickened = false,
  base = BASE_AP
} = {}) {
  const stunnedValue = Math.max(0, Math.floor(Number(stunned) || 0));
  const slowedValue = Math.max(0, Math.floor(Number(slowed) || 0));
  const quickenedBonus = quickened ? 1 : 0;
  const pool = Math.max(0, Math.floor(Number(base) || 0)) + quickenedBonus;

  // "reduce the number you regain by your Stunned value, then reduce your
  // Stunned value by the number of AP you lost."
  const apLostToStunned = Math.min(stunnedValue, pool);
  const stunnedRemaining = stunnedValue - apLostToStunned;

  // "count the AP lost to the Stunned Condition toward those lost to being
  // Slowed": Slowed removes only what Stunned has not already covered, capped
  // by the AP remaining in the pool.
  const apLostToSlowed = Math.min(
    Math.max(0, slowedValue - apLostToStunned),
    pool - apLostToStunned
  );

  const ap = Math.max(0, pool - apLostToStunned - apLostToSlowed);

  // "If the Stunned Condition forces you to lose all AP for the turn, you are
  // also unable to use reactions for that turn."
  const reactionLost = apLostToStunned >= pool && pool > 0;

  return {
    ap,
    stunnedRemaining,
    apLostToStunned,
    apLostToSlowed,
    reactionLost,
    quickenedBonus
  };
}

/**
 * CAN THIS CREATURE ACT THIS TURN AT ALL? (3.578.0; D10 of the block-18
 * audit.) Page 190, Phase 1: "If a condition prevents you from being able
 * to act, you don't regain any actions or your reaction."
 *
 * Two conditions say so outright. Unconscious: "You can't act."
 * Petrified: "incapable of taking any actions." Until now the turn start
 * refilled 3 AP and a reaction for both — only Dying, Dead and Stunned
 * were held back — so a sleeping guard could take an Attack of
 * Opportunity.
 *
 * PARALYZED KEEPS ITS AP, and says why (Graham's R14): it "can't act
 * except to Recall Knowledge and use actions that require only the use
 * of your mind (as determined by the GM)". Refusing the AP would refuse
 * the actions the condition allows; which ones those are is the GM's.
 *
 * @param {object} state
 * @param {boolean} [state.unconscious]
 * @param {boolean} [state.petrified]
 * @param {boolean} [state.paralyzed]
 * @returns {{canAct: boolean, reason: string, note: string}}
 */
export function actsThisTurn({ unconscious = false, petrified = false, paralyzed = false } = {}) {
  if (petrified) return { canAct: false, reason: "Petrified", note: "" };
  if (unconscious) return { canAct: false, reason: "Unconscious", note: "" };
  return {
    canAct: true,
    reason: "",
    note: paralyzed
      ? "Paralyzed — only Recall Knowledge and actions of the mind alone; the GM decides which."
      : ""
  };
}

/**
 * Dying check outcomes (Core 3.1, Chapter 7, Dying Check).
 *
 *   Heroic   treated as Critical (a Critical with extra benefit)
 *   Critical reduce Dying by 2
 *   Success  reduce Dying by 1
 *   Partial  no change
 *   Failure  increase Dying by 1
 *   Fumble   increase Dying by 2
 *   Blunder  dead outright
 *
 * @param {string} degreeKey
 * @returns {{delta: number, dead: boolean}}
 */
export function dyingCheckOutcome(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return { delta: -2, dead: false };
    case "success":
      return { delta: -1, dead: false };
    case "partial":
      return { delta: 0, dead: false };
    case "failure":
      return { delta: 1, dead: false };
    case "fumble":
      return { delta: 2, dead: false };
    case "blunder":
      return { delta: 0, dead: true };
    default:
      return { delta: 0, dead: false };
  }
}

export const DEFAULT_DEATH_STATE = 5;

/**
 * Stabilise (Chapter 10, PP 0): "The target's Dying condition does not
 * increase at the end of their turn. Be aware, a creature can only
 * benefit from Stabilise once per round."
 *
 * WHAT IT COVERS AND WHAT IT DOES NOT, read narrowly on purpose.
 *
 * "Does not increase" is exactly a clamp on a POSITIVE delta — Failure
 * (+1) and Fumble (+2) both become 0. It does not hold a good roll at
 * zero: a stabilised character who rolls a Critical still recovers at
 * the printed rate, because clamping BOTH directions would turn the
 * spell into a penalty on the rolls it is meant to help.
 * `Math.min(0, delta)` says that in one line and is the whole rule.
 *
 * IT DOES NOT SAVE A BLUNDER. A Blunder is `{delta: 0, dead: true}` —
 * death outright, not an increase — so a clamp on the delta cannot
 * reach it, and the caller does not offer it the chance. That is a
 * deliberate reading of the printed sentence, not an oversight: the
 * thing in this system that turns a fatal Dying Check survivable is
 * the Deathless rune, which rewrites the DEGREE before the outcome is
 * computed (documents/combat.mjs). Two mechanisms answering "did this
 * Dying Check kill me" would be two places deciding one question, and
 * that is the defect shape this chapter keeps paying for.
 *
 * ONCE PER ROUND IS NOT ENFORCED HERE. This is arithmetic on a number.
 * Consuming the marker is a state change and belongs at the one call
 * site that owns the actor — see `consumeMarker` (magic/markers.mjs).
 *
 * @param {number} delta        the Dying Check's own delta
 * @param {boolean} stabilised  whether the marker is present
 * @returns {number}
 */
export function stabilisedDyingDelta(delta, stabilised) {
  const value = Math.floor(Number(delta) || 0);
  if (!stabilised) return value;
  return Math.min(0, value);
}

/**
 * Is this Dying Check one Stabilise could change?
 *
 * SEPARATE FROM THE CLAMP, and separate on purpose. `stabilisedDyingDelta`
 * is safe to call on any delta — it returns a Critical unchanged. But the
 * marker is SPENT by looking for it, so a caller that consumes first and
 * clamps afterwards burns a one-round spell to improve a roll that was
 * already good. The rules do not say "the first Dying Check after the
 * spell is cast"; they say the condition does not increase. A check that
 * did not increase never needed it.
 *
 * Pulled out as its own function rather than written inline at the call
 * site so a harness can run it. An `if (delta > 0)` buried in combat.mjs
 * would be a decision made inside a Foundry-only function that nothing
 * can reach — the defect shape this project has a name for.
 *
 * @param {number} delta
 * @returns {boolean}
 */
export function stabiliseWouldHelp(delta) {
  return Math.floor(Number(delta) || 0) > 0;
}

/**
 * Apply a dying delta and determine survival.
 * "If your Dying condition value exceeds your Death State attribute, you die."
 * Losing the Dying condition costs 1 point of Fatigue.
 *
 * @param {object} options
 * @param {number} options.dying Current Dying value.
 * @param {number} options.delta Change from the dying check or damage.
 * @param {number} [options.deathState]
 * @returns {{dying: number, dead: boolean, recovered: boolean,
 *   fatigueGained: number}}
 */
export function applyDyingChange({
  dying,
  delta,
  deathState = DEFAULT_DEATH_STATE
} = {}) {
  const next = Math.max(0, Math.floor(Number(dying) || 0) + Math.floor(delta));
  const threshold = Math.max(0, Math.floor(Number(deathState) || 0));

  if (next > threshold) {
    return { dying: next, dead: true, recovered: false, fatigueGained: 0 };
  }

  if (next === 0) {
    return { dying: 0, dead: false, recovered: true, fatigueGained: 1 };
  }

  return { dying: next, dead: false, recovered: false, fatigueGained: 0 };
}

/**
 * Massive Damage / Instant Death (Chapter 7, Death & Dying): "If a
 * single instance of damage would reduce you to 0 HP and the excess
 * damage (beyond what it took to reach 0) is equal to or greater than
 * your maximum HP, you die immediately."
 *
 * @param {number} damage The full damage instance.
 * @param {number} hpBefore HP immediately before this damage.
 * @param {number} maxHP
 * @returns {boolean}
 */
export function massiveDamageInstantDeath(damage, hpBefore, maxHP) {
  const dmg = Math.max(0, Math.floor(Number(damage) || 0));
  const before = Math.max(0, Math.floor(Number(hpBefore) || 0));
  const max = Math.max(0, Math.floor(Number(maxHP) || 0));

  if (dmg < before) return false; // Didn't even reach 0.
  const excess = dmg - before;
  return max > 0 && excess >= max;
}

/**
 * The first time HP reaches 0 (Chapter 7, Death & Dying): "You gain
 * Unconscious and Dying 1. If the effect that reduced you to 0 HP was a
 * critical hit (or similarly lethal at GM discretion), you gain Dying 2
 * instead." Returns the Dying value to apply — the caller is
 * responsible for toggling Unconscious and Dying, and for checking
 * massiveDamageInstantDeath first.
 */
export function zeroHPDyingValue(isCritical = false) {
  return isCritical ? 2 : 1;
}

/**
 * Doomed (Appendix 2): "Your Death State is reduced by your doomed
 * value. If your Death State is reduced to 0, you instantly die."
 * Kept as a pure derivation from the base Death State rather than
 * mutating that schema field directly, since deathState is a freely
 * editable value elsewhere on the sheet (racial bonuses, GM
 * adjustments) — Doomed's reduction applies at the point of use.
 */
export function effectiveDeathState(baseDeathState, doomedValue = 0) {
  const base = Math.max(0, Math.floor(Number(baseDeathState) || 0));
  const doomed = Math.max(0, Math.floor(Number(doomedValue) || 0));
  return Math.max(0, base - doomed);
}

/** True the moment Doomed reduces effective Death State to 0 — instant
 * death, independent of any Dying check. */
export function doomedInstantDeath(baseDeathState, doomedValue = 0) {
  return doomedValue > 0 && effectiveDeathState(baseDeathState, doomedValue) === 0;
}

/**
 * Doomed (Appendix 2): "Your Doomed value decreases by 1 each full
 * night's rest." Floored at 0.
 *
 * WRITTEN AT 3.363.0 BESIDE ITS NEIGHBOUR, and for the same reason the
 * neighbour needed wiring: `setDoomed`'s own comment said this recovery
 * was "left to the GM to apply manually… there's no dedicated rest
 * workflow anywhere in this system to hook into". There is one, and has
 * been for some time; the comment outlived the fact. Doomed reduces
 * Death State, and a Doomed value that never falls is a character who
 * stays one bad roll from dying for the rest of the campaign.
 */
export function doomedRecovery(currentDoomed) {
  return Math.max(0, Math.floor(Number(currentDoomed) || 0) - 1);
}

/**
 * Soul Drain (Appendix 2): "Each time you get a full night's rest, you
 * are healed of 5 Soul Drain damage." Floored at 0.
 */
export function soulDrainRecovery(currentSoulDrain) {
  return Math.max(0, Math.floor(Number(currentSoulDrain) || 0) - 5);
}

/** "If the amount of Soul Drain damage reduces your maximum hit points
 * to less than 0, you die." */
export function soulDrainInstantDeath(baseMaxHP, soulDrain) {
  const base = Math.floor(Number(baseMaxHP) || 0);
  const drain = Math.max(0, Math.floor(Number(soulDrain) || 0));
  return base - drain < 0;
}

