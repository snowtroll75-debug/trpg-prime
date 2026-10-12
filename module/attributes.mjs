/**
 * Ability score point-buy (Chapter 1, Choosing Ability Scores). Pure
 * logic only — the sheet display and derived-data wiring live in
 * documents/actor.mjs and the Attributes tab template.
 *
 * "At character creation, you are given 6 points to distribute... The
 * only restriction is that no ability score can exceed 4 points (ability
 * scores can increase beyond 4 through level advancement and specific
 * factors)... You can also use your level-based ability score increases
 * to bring a base ability above 4 to a maximum of 6."
 *
 * The Level Table grants +1 ability point at 3rd level and every 3
 * levels thereafter (3, 6, 9, 12, 15, 18) — so the pool grows by 1 for
 * every 3 levels gained, and the per-ability ceiling rises with it, but
 * never past 6 regardless of how many increases have accrued.
 */

const CREATION_POOL = 6;
const CREATION_MAX = 4;
const ABSOLUTE_MAX = 6;
const ABSOLUTE_MIN = -4;

/** How many +1 ability-increase levels have been reached (3, 6, 9, ...). */
export function abilityIncreaseCount(level) {
  return Math.max(0, Math.floor(Number(level ?? 0) / 3));
}

/** Total points available to distribute across all six abilities. */
export function abilityPointPool(level) {
  return CREATION_POOL + abilityIncreaseCount(level);
}

/** The valid range for any single ability's Base value at this level. */
export function abilityBaseRange(level) {
  return {
    min: ABSOLUTE_MIN,
    max: Math.min(CREATION_MAX + abilityIncreaseCount(level), ABSOLUTE_MAX)
  };
}

/**
 * Points currently spent: the sum of all six Base values. A negative
 * value refunds points for the others, matching the rulebook's own
 * example (a -2 Strength grants 2 more points elsewhere).
 */
export function abilityPointsSpent(baseValues) {
  return Object.values(baseValues ?? {}).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );
}

/** Full breakdown for the sheet's summary banner. */
export function abilityPointSummary(level, baseValues) {
  const pool = abilityPointPool(level);
  const spent = abilityPointsSpent(baseValues);
  const range = abilityBaseRange(level);
  return {
    level: Number(level ?? 0),
    pool,
    spent,
    remaining: pool - spent,
    min: range.min,
    max: range.max,
    increases: abilityIncreaseCount(level)
  };
}

/**
 * Skill Progression (Chapter 4): "Your maximum skill ranks in any one
 * skill cannot be higher than your career level" — stated twice for
 * emphasis in the rulebook. Ranks also can't go negative.
 */
export function clampSkillRanks(ranks, level) {
  const maxRanks = Math.max(1, Math.round(Number(level ?? 0)));
  const value = Math.round(Number(ranks ?? 0));
  return Math.min(Math.max(value, 0), maxRanks);
}
