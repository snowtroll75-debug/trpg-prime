/**
 * Coup de Grace (Chapter 4): "You automatically hit scoring the
 * maximum result for your attack (treat as 20 rolled). If the target
 * survives the attack, they must make a Level based Fortitude Saving
 * Throw or die. However, if the target is immune to critical hits,
 * the coup de grace does not deal critical damage or effects, nor
 * does it force the target to succeed at a saving throw or die."
 *
 * Deliberately scoped: the auto-hit/critical determination and the
 * save-or-die are both genuinely automated here, reusing this
 * system's existing attackOutcome (unmodified: 20 already means
 * "always hits" in that function, without needing a special case)
 * and its existing Dying/death-state mechanics directly rather than
 * re-implementing them. Actual weapon damage is NOT rolled here —
 * this system's existing "Apply Damage" workflow already handles
 * damage-then-HP application as its own deliberate step for exactly
 * this kind of manually-confirmed hit, and Coup de Grace isn't tied
 * to any specific weapon in its own action data. "Helpless" itself
 * is never defined as a mechanical condition anywhere in this
 * system's rulebook, so it isn't checked here either — the same
 * GM-adjudicated prerequisite this system already leaves to the
 * table for plenty of other requirements text.
 *
 * "A Level based Fortitude Saving Throw" doesn't state whose level —
 * read here as the attacker's, matching the standard convention for
 * an effect one creature imposes on another, and flagged as an
 * interpretation rather than a confirmed reading, same as several
 * other ambiguous rules from this project's own audit history.
 */

import { attackOutcome } from "./attack.mjs";
import { levelDC } from "../dice/resolution.mjs";
import { effectiveDeathState } from "./turn-economy.mjs";

/**
 * Coup de Grace's auto-hit/critical determination against the
 * target's actual DB — "treat as 20 rolled" is simply an unmodified
 * face of 20 fed into this system's own existing attack resolution,
 * not a special case.
 *
 * @param {number} attackTotal The attacker's attack total (as if a
 *   natural 20 were rolled — i.e. 20 + every other modifier).
 * @param {number} targetDB
 * @param {object} [options]
 * @param {number} [options.criticalResistance]
 * @param {boolean} [options.criticalImmune]
 * @returns {object} The same shape attackOutcome always returns.
 */
export function coupDeGraceAttackOutcome(attackTotal, targetDB, options = {}) {
  return attackOutcome({
    unmodified: 20,
    total: attackTotal,
    db: targetDB,
    proficient: true,
    ...options
  });
}

/**
 * The save-or-die Fortitude DC — level-based off the attacker.
 *
 * @param {number} attackerLevel
 * @returns {number}
 */
export function coupDeGraceSaveDC(attackerLevel) {
  return levelDC(attackerLevel);
}

/**
 * Whether the save-or-die failed and the target dies outright —
 * a Fortitude save against coupDeGraceSaveDC, instant death on
 * failure rather than a gradual Dying worsening (there's no
 * "surviving a failed coup de grace save," per the rulebook's own
 * "or die").
 *
 * @param {boolean} saveSucceeded
 * @param {number} baseDeathState
 * @param {number} [doomedValue]
 * @returns {{dead: boolean, dyingValue: number|null}}
 */
export function coupDeGraceSaveResult(saveSucceeded, baseDeathState, doomedValue = 0) {
  if (saveSucceeded) return { dead: false, dyingValue: null };
  const deathState = effectiveDeathState(baseDeathState, doomedValue);
  return { dead: true, dyingValue: deathState + 1 };
}
