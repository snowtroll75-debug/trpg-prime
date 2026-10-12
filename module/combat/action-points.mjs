/**
 * Action Points (Core 3.1, Chapter 4): the shared resource every
 * apCost-bearing action, skill action, special action, and spell
 * draws from. Pure logic here; module/combat/action-points-workflow.mjs
 * does the actual actor.update().
 */

/**
 * Parses an apCost value (as it appears on Basic/Skill/Special Actions
 * and spells' castAP field — a plain number, a numeric string like
 * "1"/"3", or a non-numeric label like "Free"/"Reaction") into the
 * actual AP to deduct. "Free" costs nothing. "Reaction" draws from a
 * separate reaction economy, not the AP pool, so it costs nothing
 * here either. Anything else that isn't parseable as a non-negative
 * number is treated as free rather than guessed at.
 *
 * @param {string|number} apCost
 * @returns {number}
 */
export function parseApCost(apCost) {
  if (apCost === null || apCost === undefined) return 0;
  if (typeof apCost === "number") return Math.max(0, apCost);

  const normalised = String(apCost).trim().toLowerCase();
  if (normalised === "free" || normalised === "reaction" || normalised === "") return 0;

  const value = Number(normalised);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

/**
 * Given a current AP pool and a cost, the new value after spending —
 * clamped at 0 rather than going negative. Whether the pool actually
 * covered the cost is reported separately so the caller can warn
 * without blocking the action outright (a GM override, an unmodelled
 * feat granting bonus AP, and so on are all reasons an action might
 * still be legitimate despite an apparent shortfall).
 *
 * @param {number} currentAP
 * @param {number} cost
 * @returns {{newValue: number, sufficient: boolean, shortfall: number}}
 */
export function computeApSpend(currentAP, cost) {
  const current = Math.max(0, Number(currentAP) || 0);
  const spend = Math.max(0, Number(cost) || 0);
  const sufficient = current >= spend;
  const newValue = Math.max(0, current - spend);
  const shortfall = sufficient ? 0 : spend - current;
  return { newValue, sufficient, shortfall };
}

/**
 * Whether an actor can afford an action, and by how much they fall short.
 *
 * SEPARATE FROM `computeApSpend` ON PURPOSE. That one answers "what does
 * the pool become", which is a question you ask once you have decided to
 * act. This one answers "may this happen at all", which has to be asked
 * BEFORE anything is rolled, spent or committed — and until 3.311.3
 * nothing asked it. `spendActionPoints` clamped the pool to 0, warned,
 * and let the action through, so a character with 1 AP could cast a 2 AP
 * spell and the only trace was a notification that had already scrolled
 * past. Reported by Graham, 14 Aug 2026.
 *
 * @param {number} currentAP
 * @param {string|number} apCost
 * @returns {{cost:number, affordable:boolean, shortfall:number}}
 */
export function canAffordAP(currentAP, apCost) {
  const cost = parseApCost(apCost);
  const { sufficient, shortfall } = computeApSpend(currentAP, cost);
  return { cost, affordable: sufficient, shortfall };
}
