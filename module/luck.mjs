/**
 * Luck (Core 3.1, Appendix 5). An optional player-facing resource,
 * parallel to Conviction. "Fortune" in this rulebook is confirmed
 * synonymous with Advantage — the Moment of Fortune spell's own text
 * describes its fortune effect as letting the target "roll with
 * advantage."
 *
 * 3.624.0 (block 40, Graham's rulings R11–R17 of 6 October 2026): a luck
 * check is made FOR a skill check, attack or saving throw and changes that
 * check — Advantage on a success, the worse of Disadvantage and −5 on a
 * Fumble — rather than reporting a result for the player to carry over by
 * hand. Everything the page limits is decided here, pure:
 *
 *   - once per round in combat (luckEligibility);
 *   - one fortune per check, and Luck or Conviction, not both;
 *   - Halfling Luck is Luck of the Small Folk (hasHalflingLuck);
 *   - the Fumble's "whichever is worse" (luckFumbleChoice);
 *   - regaining a point (injuryRegainsLuck, naturalTwentyOffersLuck);
 *   - an NPC starts with none (luckOnCreate).
 *
 * Luck belongs to the player, not the character, per the rulebook's own
 * wording — this system tracks it per-actor for lack of a cross-actor
 * "player profile" concept, with a note on the sheet for GMs who want
 * to manually carry a score between characters.
 */

import { DEGREE_BY_KEY } from "./dice/resolution.mjs";

export const INITIAL_LUCK = 15;
export const MINIMUM_LUCK = 2;
export const LUCK_CHECK_DC = 20;

/** "Apply fortune to a skill check / an attack check / a saving throw." */
export const LUCK_CHECK_TYPES = Object.freeze(["skill", "attack", "save"]);

/**
 * The outcome of a Luck Check. Every outcome except Critical reduces
 * the luck score by 1 (floored at MINIMUM_LUCK). Fumble additionally
 * applies disadvantage (or -5, whichever is worse) to the check the
 * luck was being used for.
 */
export function luckCheckOutcome(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return { success: true, reduceLuck: 0, penalizeCheck: false };
    case "fumble":
    case "blunder":
      return { success: false, reduceLuck: 1, penalizeCheck: true };
    default: {
      // The rulebook's own Luck Check table only names four outcomes
      // (Critical/Success/Failure/Fumble), collapsing the standard
      // six-tier table. Success and Partial both still cost 1 luck per
      // the rulebook ("Success: reduce luck by 1"); Partial isn't
      // named separately, so it's treated by its own success flag on
      // the standard degree table rather than assumed either way.
      const degree = DEGREE_BY_KEY[degreeKey] ?? DEGREE_BY_KEY.failure;
      return { success: Boolean(degree.success), reduceLuck: 1, penalizeCheck: false };
    }
  }
}

/**
 * Applies a Luck Check's reduction, floored at the minimum.
 *
 * "(min 2)" LIMITS A LOSS; IT GRANTS NOTHING (3.624.0, block 40's section
 * C). `Math.max(2, …)` alone raised a score of 0 or 1 to 2 on a check that
 * cost a point. A score already at or below the floor stays where it is.
 */
export function applyLuckReduction(currentLuck, reduceLuck) {
  const value = Math.floor(Number(currentLuck) || 0);
  const loss = Math.max(0, Math.floor(Number(reduceLuck) || 0));
  if (value <= MINIMUM_LUCK) return value;
  return Math.max(MINIMUM_LUCK, value - loss);
}

/** Halfling Luck (racial feat): reduces the Luck Check DC by 2. */
export function luckCheckDC(halflingLuck = false) {
  return LUCK_CHECK_DC - (halflingLuck ? 2 : 0);
}

/**
 * IS THIS HALFLING LUCK? (3.624.0, R14.) No item in any pack is called
 * "Halfling Luck"; the halfling's feat is Luck of the Small Folk, and
 * Daring Fortune proves it — "Prerequisites Halfling Luck", then "If you
 * use Luck of the Small Folk…". Either name counts.
 */
export function hasHalflingLuck(itemNames = []) {
  return Array.from(itemNames ?? []).some((name) =>
    /^(luck of the small folk|halfling luck)$/i.test(String(name ?? "").replace(/[‘’]/g, "'").trim()));
}

/**
 * MAY LUCK BE USED ON THIS CHECK? (R11, R12.)
 *
 * @param {object} p
 * @param {boolean} p.enabled the world's Luck setting
 * @param {string} p.checkType TRGCheck type
 * @param {boolean} p.flat
 * @param {{combatId: string, round: number}|null} p.spent the last use
 * @param {{combatId: string, round: number}|null} p.current the running combat
 * @param {boolean} p.convictionTouched Conviction already changed this check
 * @param {string} p.chanceUsed a Chance effect already altered this check
 * @returns {{ok: boolean, reason: string|null}}
 */
export function luckEligibility({ enabled, checkType, flat = false, spent = null, current = null,
  convictionTouched = false, chanceUsed = "" } = {}) {
  if (!enabled) return { ok: false, reason: "Luck (Appendix 5) is an optional rule that is off in this world." };
  if (flat || !LUCK_CHECK_TYPES.includes(checkType)) {
    return { ok: false, reason: "Luck applies fortune to a skill check, an attack check or a saving throw." };
  }
  if (convictionTouched) {
    return { ok: false, reason: "Conviction already affects this check — only one of Luck and Conviction may." };
  }
  if (chanceUsed) {
    return { ok: false, reason: `${chanceUsed} already altered this check — only one fortune effect may.` };
  }
  if (spent && current && spent.combatId === current.combatId && spent.round === current.round) {
    return { ok: false, reason: "A luck check may be made only once per round." };
  }
  return { ok: true, reason: null };
}

/**
 * A FUMBLED LUCK CHECK: "the check gains disadvantage or a -5 penalty
 * (whichever is worse)." Worked out from the check's own two dice, so
 * "worse" means worse on this roll.
 *
 * Disadvantage combines with whatever bias the check already had (an
 * Advantage cancels to Normal, as the Advantage trait says); the −5 is
 * taken on the die the check's own bias would have kept.
 *
 * @param {object} p
 * @param {"normal"|"advantage"|"disadvantage"} p.bias the check's bias before the fumble
 * @param {number[]} p.totals the two chains' totals, in order
 * @returns {{index: number, penalty: number, total: number, label: string}}
 */
export function luckFumbleChoice({ bias = "normal", totals = [] } = {}) {
  const [first, second = first] = totals.map(Number);
  const low = Math.min(first, second);
  const high = Math.max(first, second);
  const lowIndex = first <= second ? 0 : 1;
  const highIndex = first >= second ? 0 : 1;
  // With Disadvantage added.
  const disadvantaged = bias === "advantage"
    ? { index: 0, total: first }
    : { index: lowIndex, total: low };
  // With −5 under the check's own bias.
  const kept = bias === "advantage"
    ? { index: highIndex, total: high }
    : bias === "disadvantage"
      ? { index: lowIndex, total: low }
      : { index: 0, total: first };
  const minus = { index: kept.index, total: kept.total - 5 };
  if (minus.total < disadvantaged.total) {
    return { index: minus.index, penalty: -5, total: minus.total, label: "Luck fumbled: −5 (worse than disadvantage)" };
  }
  return { index: disadvantaged.index, penalty: 0, total: disadvantaged.total, label: "Luck fumbled: disadvantage (worse than −5)" };
}

/**
 * REGAINING LUCK FROM A CRITICAL INJURY (R15): "If you take a critical
 * injury with a modified result of higher than 90 you regain a 1 luck."
 */
export function injuryRegainsLuck(modifiedResult) {
  return Number(modifiedResult) > 90;
}

/**
 * A NATURAL 20 (R15): "If you roll an unmodified 20 on a check whilst in a
 * situation that the GM deems strenuous … you regain 1 luck." Whether it
 * was strenuous is the GM's, so this only says whether to OFFER the award.
 */
export function naturalTwentyOffersLuck({ enabled, checkType, flat = false, unmodified, awarded = false } = {}) {
  if (!enabled || awarded || flat) return false;
  if (checkType === "luck") return false;
  return Number(unmodified) === 20;
}

/**
 * AN NPC STARTS WITH NO LUCK (R16). "Each player (not character) begins
 * … with a luck score of 15"; an NPC, a companion or a familiar is not a
 * player's. The template's 15 is the player's, so a non-character arriving
 * with exactly 15 gets 0 — a GM who gives a major NPC a pool types it.
 *
 * @returns {number|null} the value to write, or null to leave it
 */
export function luckOnCreate(actorType, luck) {
  if (actorType === "character") return null;
  return Number(luck) === INITIAL_LUCK ? 0 : null;
}
