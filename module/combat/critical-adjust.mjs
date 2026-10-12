/**
 * Ambush and Sniping: modifying a critical result.
 *
 * Both actions are reactions taken after a critical has already landed —
 * with an Agile melee weapon for Ambush, with a ranged weapon inside its
 * first range increment for Sniping — and every degree of their outcome
 * says "you may modify the critical result by up to" some amount.
 *
 * Nothing happened. The card printed the sentence and stopped, so the
 * whole point of both actions was a note asking the player to go back to
 * the critical injury card and read a different row by hand.
 *
 * Per Graham: the critical injury was a d100 roll on a table, so the
 * allowance shifts that roll and the new row is read. Offering every
 * number within the allowance would be forty buttons saying the same
 * thing, so what is offered is the distinct *rows* reachable — which is
 * what the player is actually choosing between.
 */
import { CRITICAL_TABLES } from "../data/critical-tables.mjs";

/** How far each degree lets the roll move. */
const ALLOWANCE = Object.freeze({
  heroic: 20,
  critical: 15,
  success: 10,
  partial: 5
});

/**
 * The allowance a degree grants, or 0 where the action achieved nothing.
 *
 * @param {string} degreeKey
 * @returns {number}
 */
export function criticalAdjustAllowance(degreeKey) {
  return ALLOWANCE[degreeKey] ?? 0;
}

/** The table row a d100 result falls on. */
export function rowForRoll(table, roll) {
  const value = Math.max(1, Math.min(100, Math.trunc(Number(roll) || 0)));
  return (table ?? []).find((row) => value >= row.min && value <= row.max) ?? null;
}

/**
 * The distinct rows a player may move to, given the roll they made and
 * the allowance they earned.
 *
 * Clamped to the table rather than to 1–100: a roll of 3 with an
 * allowance of 20 can reach 1, and no lower, and offering rolls that
 * resolve to nothing would be noise.
 *
 * @param {string} damageType Which critical table was used.
 * @param {number} originalRoll The d100 that was rolled.
 * @param {number} allowance How far it may move, from the degree.
 * @returns {Array<{roll: number, shift: number, min: number, max: number,
 *   persistence: string, effect: string, current: boolean}>}
 */
export function adjustableRows(damageType, originalRoll, allowance) {
  const table = CRITICAL_TABLES[damageType] ?? CRITICAL_TABLES.slashing;
  const roll = Math.max(1, Math.min(100, Math.trunc(Number(originalRoll) || 0)));
  const reach = Math.max(0, Math.trunc(Number(allowance) || 0));
  if (!reach) return [];

  const low = Math.max(1, roll - reach);
  const high = Math.min(100, roll + reach);
  const current = rowForRoll(table, roll);

  const rows = [];
  for (const row of table) {
    if (row.max < low || row.min > high) continue;
    // The nearest roll inside this row that the allowance can actually
    // reach — what the player would write on the sheet. The row the roll
    // already sits on is reached by not moving at all: taking its max
    // instead reported a shift of +1 for standing still, found by
    // running it on a real roll of 25 inside a 24-26 row.
    const inThisRow = roll >= row.min && roll <= row.max;
    const reachable = inThisRow
      ? roll
      : Math.min(high, Math.max(low, roll < row.min ? row.min : row.max));
    rows.push({
      roll: reachable,
      shift: reachable - roll,
      min: row.min,
      max: row.max,
      persistence: row.persistence,
      effect: row.effect,
      current: row === current
    });
  }
  return rows;
}

/**
 * Whether an action is one of the two that modify a critical.
 *
 * @param {string} actionKey
 */
export function modifiesCriticalResult(actionKey) {
  return actionKey === "ambush" || actionKey === "sniping";
}

/**
 * Whether the reaction's trigger is satisfied by the critical that was
 * just remembered on the attacker.
 *
 * Ambush: *"you've inflicted a critical with a weapon with the Agile
 * trait."* Sniping: *"you've inflicted a critical with a ranged weapon
 * within its first range increment."* Both are Reactions with no meaning
 * absent that critical — the card already said as much after the fact
 * ("no critical injury has been rolled to modify"), but the reaction had
 * been spent by then. This tests the same thing before anything is spent.
 *
 * Only the mechanical half of each trigger is checked. The target-state
 * clause — Ambush's *"flanked, unaware, or flat-footed"*, Sniping's
 * *"unaware or flat-footed"* — is fiction the GM adjudicates (unaware in
 * particular this system does not track), so it is deliberately left to
 * them rather than guessed at, matching how the rest of the Skill Action
 * prose is treated.
 *
 * @param {string} actionKey "ambush" | "sniping"
 * @param {object|null} record The attacker's lastCriticalInjury flag.
 * @param {string|null} currentTargetId The actor being targeted now, if any.
 * @returns {{allowed: boolean, reason: string}}
 */
export function criticalReactionTrigger(actionKey, record, currentTargetId = null) {
  const name = actionKey === "sniping" ? "Sniping" : "Ambush";

  if (!record) {
    return {
      allowed: false,
      reason: `${name} reacts to a critical you've just inflicted — none is on record.`
    };
  }

  // The reaction modifies the critical against the creature it was
  // inflicted on. Targeting someone else now means the wrong critical —
  // only enforced when a target is actually selected, since the reaction
  // can be taken without re-targeting.
  if (currentTargetId && record.targetActorId && currentTargetId !== record.targetActorId) {
    return {
      allowed: false,
      reason: `${name} must target the creature your critical was inflicted on.`
    };
  }

  if (actionKey === "ambush") {
    if (!record.weaponHasAgile) {
      return {
        allowed: false,
        reason: "Ambush needs a critical inflicted with a weapon with the Agile trait."
      };
    }
    return { allowed: true, reason: "" };
  }

  if (actionKey === "sniping") {
    if (!record.weaponIsRanged) {
      return {
        allowed: false,
        reason: "Sniping needs a critical inflicted with a ranged weapon."
      };
    }
    if (!record.withinFirstRangeIncrement) {
      return {
        allowed: false,
        reason: "Sniping needs the ranged critical to land within the weapon's first range increment."
      };
    }
    return { allowed: true, reason: "" };
  }

  return { allowed: true, reason: "" };
}

/**
 * The difficulty ladder, easiest to hardest, for stepping along.
 *
 * Impossible is deliberately absent: it is a statement that the thing
 * cannot be done rather than a rung, and stepping down from it would
 * turn "you cannot" into "Incredibly Hard".
 */
export const DIFFICULTY_LADDER = Object.freeze([
  "incrediblyEasy",
  "veryEasy",
  "easy",
  "medium",
  "hard",
  "veryHard",
  "incrediblyHard"
]);

/**
 * Ambush and Sniping: "the difficulty decreases by one step for each
 * size category larger than you the target is."
 *
 * A bigger target is easier to ambush, which reads oddly until you
 * picture it — there is more of it not looking at you. Only ever
 * downward: a target smaller than you makes no difference, because the
 * clause names one direction and inventing the other would be a rule
 * the book does not contain.
 *
 * @param {string} baseDifficulty The action's own difficulty.
 * @param {number} sizeDifference Target categories minus actor's.
 * @returns {{difficulty: string, steps: number}}
 */
export function sizeAdjustedDifficulty(baseDifficulty, sizeDifference) {
  const base = String(baseDifficulty ?? "medium");
  const index = DIFFICULTY_LADDER.indexOf(base);
  const larger = Math.max(0, Math.trunc(Number(sizeDifference) || 0));
  if (index === -1 || !larger) return { difficulty: base, steps: 0 };

  const moved = Math.max(0, index - larger);
  return { difficulty: DIFFICULTY_LADDER[moved], steps: index - moved };
}
