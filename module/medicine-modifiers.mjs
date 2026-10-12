/**
 * Medicine action modifiers (Chapter 8) — the AP-cost/DC trade-offs
 * stated in the rulebook's own text for First Aid, Resuscitation, and
 * Treat Wounds specifically. Confirmed directly against the full
 * rulebook entries before building any of this: Treat Disease, Treat
 * Injury, and Treat Toxin have no stated modifiers at all, so nothing
 * is built for them here.
 *
 * Pure logic; the Foundry workflow (module/combat/action-workflow.mjs)
 * layers on top, same separation as the rest of this system.
 */

/**
 * First Aid / Resuscitation (Chapter 8): "By increasing the
 * difficulty of the check by [4 / one step] you may reduce the AP
 * cost of this action by 1 (min 1 AP)." Same reduction for both,
 * despite the different DC-increase mechanism each uses to get there.
 *
 * @param {number} baseAP
 * @param {boolean} traded Whether the player chose the trade-off.
 * @returns {number}
 */
export function medicineTradedApCost(baseAP, traded) {
  const base = Math.max(1, Math.floor(Number(baseAP) || 0));
  if (!traded) return base;
  return Math.max(1, base - 1);
}

/**
 * Treat Wounds (Chapter 8): "For every 1 that you increase the DC,
 * you may heal an additional 1 hit points (max of +20, doubled on a
 * critical)." The player commits to the extra DC before the roll
 * (this project's existing DC-override mechanism already supports
 * that); this is purely the resulting bonus once the outcome is
 * known.
 *
 * @param {number} extraDC The DC increase chosen before rolling,
 *   0-20.
 * @param {boolean} isCritical
 * @returns {number}
 */
export function treatWoundsBonusHealing(extraDC, isCritical) {
  const clamped = Math.max(0, Math.min(20, Math.floor(Number(extraDC) || 0)));
  return isCritical ? clamped * 2 : clamped;
}

/**
 * Treat Wounds' SECOND printed trade-off (page 87).
 *
 * "You may also increase the DC before rolling in an attempt to heal
 * additional targets. For every 5 that you increase the DC you may heal
 * an additional target."
 *
 * ─────────────────────────────────────────────────────────────────────
 * PRINTED, DOCUMENTED, AND UNREACHABLE UNTIL 3.559.0. The action's own
 * description offered it; the prompt asked only for extra healing and
 * capped that field at 20, so there was no way to spend a point on a
 * target even by hand. A player could read the offer and not take it.
 *
 * SEPARATE FROM THE PER-HIT-POINT TRADE, because the two are priced
 * differently (1 DC per HP against 5 DC per target) and only the first is
 * doubled on a critical. Folding them into one number is how the critical
 * would quietly double the targets as well.
 */
export const TREAT_WOUNDS_DC_PER_TARGET = 5;

/**
 * The DC increase bought by treating this many additional targets.
 *
 * @param {number} count Additional targets beyond the first.
 * @returns {number}
 */
export function treatWoundsTargetDC(count) {
  const extra = Math.max(0, Math.floor(Number(count) || 0));
  return extra * TREAT_WOUNDS_DC_PER_TARGET;
}

/**
 * Pain Tolerance's printed trade-off (page 88).
 *
 * "You may increase the DC before rolling in an attempt to ignore more
 * pain. For every 4 that you increase the DC, you may ignore an
 * additional point of the selected condition."
 *
 * ALSO PRINTED AND UNIMPLEMENTED until 3.559.0: the suppression reduced
 * the chosen condition by exactly 1, hard-coded, while the description
 * offered the trade.
 *
 * ONE POINT IS FREE — the base action ignores "up to 1 point" — so the
 * total ignored is 1 plus whatever the raised DC bought.
 *
 * NOT EXPORTED, unlike its Treat Wounds twin: that one is read by the
 * prompt to print its own price, and this one is not — Pain Tolerance's
 * trade is made by raising the DC in the roll dialog, so nothing outside
 * this file needs the number.
 */
const PAIN_TOLERANCE_DC_PER_POINT = 4;

/**
 * How many points of the chosen condition are ignored, for a given DC
 * increase.
 *
 * ROUNDED DOWN, and deliberately: three points of extra DC buys nothing,
 * because the book prices this per whole four. A player who types 7 has
 * paid for one extra point and three points of nothing, which is their
 * choice to make and not this function's to round up for them.
 *
 * @param {number} extraDC The DC increase chosen before rolling.
 * @returns {number} Total points ignored, never fewer than one.
 */
export function painToleranceIgnoredPoints(extraDC) {
  const extra = Math.max(0, Math.floor(Number(extraDC) || 0));
  return 1 + Math.floor(extra / PAIN_TOLERANCE_DC_PER_POINT);
}
