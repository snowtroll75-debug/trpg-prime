/**
 * FOOD AND WATER (Chapter 8, page 230) — the rules, pure.
 *
 * NEW at 3.582.0, for the pages 221-230 audit's D8 and Graham's R12 of
 * 22 September 2026: "Yes".
 *
 * > "Characters who refrain from consuming food or drink will endure the
 * >  debilitating effects of exhaustion… you typically consume around 1
 * >  to 2 pounds of food per day… Each day that you consume less than the
 * >  required amount of food (within reason), your GM will require you to
 * >  make an Exhaustion check."
 * >
 * > "You typically require around 1 gallon of water per day… After a day
 * >  with no water, your GM will require you to begin making Exhaustion
 * >  checks every hour."
 *
 * The Exhaustion machinery has existed since the fatigue work —
 * `exhaustionSave`, the fatigue ladder, the unconscious-at-10 and
 * dead-at-20 thresholds. Nothing counted days, rations or water, so the
 * two clocks that feed it were never wound.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO CLOCKS, AND THEY ARE NOT THE SAME SHAPE. That is the whole reason
 * this is a module rather than a counter:
 *
 *   FOOD is a DAILY check, and it starts on the first day you eat less
 *   than you need. "Within reason" is the book's own hedge and stays the
 *   GM's — this asks whether the day's intake was short, and the GM says
 *   whether to hold them to it.
 *
 *   WATER is a daily threshold that turns into an HOURLY check once it
 *   is crossed: a full day with no water at all, and then every hour.
 *   Not "less than a gallon" — the page says "a day with NO water", so a
 *   character on short rations of water is thirsty and not yet dying.
 *
 * NOTHING HERE ROLLS. The checks are made by the exhaustion workflow
 * that already exists; this decides only whether one is due, and how
 * many.
 *
 * Pure; no Foundry.
 */

/** "around 1 to 2 pounds of food per day" — the floor of the range. */
export const FOOD_POUNDS_PER_DAY = 1;
/** The book's upper figure, for a card that wants to quote the range. */
export const FOOD_POUNDS_GENEROUS = 2;
/** "around 1 gallon of water per day". */
export const WATER_GALLONS_PER_DAY = 1;
/** After a day with no water, a check every hour. */
export const WATER_CHECK_INTERVAL_HOURS = 1;

/**
 * Is a day's food short of what the character needs?
 *
 * @param {number} pounds eaten that day
 * @param {number} [required] override for a race or size that differs
 * @returns {boolean}
 */
export function foodIsShort(pounds, required = FOOD_POUNDS_PER_DAY) {
  return (Number(pounds) || 0) < Math.max(0, Number(required) || 0);
}

/**
 * The exhaustion checks a character owes for going without.
 *
 * @param {object} state
 * @param {number} state.daysWithoutFood consecutive days short of food
 * @param {number} state.daysWithoutWater consecutive days with NO water
 * @param {number} state.hoursSinceWaterFailed hours elapsed since the
 *   water threshold was crossed
 * @returns {{checks: number, reasons: string[], hourly: boolean}}
 */
export function sustenanceChecksDue({
  daysWithoutFood = 0, daysWithoutWater = 0, hoursSinceWaterFailed = 0
} = {}) {
  const foodDays = Math.max(0, Math.trunc(Number(daysWithoutFood) || 0));
  const waterDays = Math.max(0, Math.trunc(Number(daysWithoutWater) || 0));
  const hours = Math.max(0, Math.trunc(Number(hoursSinceWaterFailed) || 0));

  const reasons = [];
  let checks = 0;

  // FOOD: one per short day.
  if (foodDays > 0) {
    checks += foodDays;
    reasons.push(`${foodDays} day${foodDays === 1 ? "" : "s"} short of food`);
  }

  /*
   * WATER: the daily threshold is crossed at one full day, and from then
   * on the clock is hourly. The day that crossed it is NOT also counted
   * as an hourly check — "after a day with no water … BEGIN making
   * Exhaustion checks every hour" starts the hourly clock, it does not
   * award a check for the day itself.
   */
  const hourly = waterDays >= 1;
  if (hourly) {
    const due = Math.floor(hours / WATER_CHECK_INTERVAL_HOURS);
    checks += due;
    reasons.push(
      due > 0
        ? `${due} hour${due === 1 ? "" : "s"} without water`
        : "a day without water — hourly checks begin now");
  }

  return { checks, reasons, hourly };
}

/**
 * Consuming food and water resets the clocks — but only the one it
 * feeds. A character who drinks and does not eat is still hungry.
 *
 * @param {object} state the stored clocks
 * @param {object} intake { pounds, gallons }
 * @returns {object} the new clocks
 */
export function recordIntake(state = {}, { pounds = 0, gallons = 0 } = {}) {
  const next = {
    daysWithoutFood: Math.max(0, Math.trunc(Number(state.daysWithoutFood) || 0)),
    daysWithoutWater: Math.max(0, Math.trunc(Number(state.daysWithoutWater) || 0)),
    hoursSinceWaterFailed: Math.max(0, Math.trunc(Number(state.hoursSinceWaterFailed) || 0))
  };
  if (!foodIsShort(pounds)) next.daysWithoutFood = 0;
  if ((Number(gallons) || 0) > 0) {
    // ANY water at all stops the hourly clock. The page's trigger is "a
    // day with NO water", so a mouthful is not a full ration but it is
    // not nothing either.
    next.daysWithoutWater = 0;
    next.hoursSinceWaterFailed = 0;
  }
  return next;
}

/**
 * A day passes.
 *
 * @param {object} state
 * @param {object} day { pounds, gallons }
 * @returns {object} the new clocks
 */
export function advanceDay(state = {}, { pounds = 0, gallons = 0 } = {}) {
  const next = recordIntake(state, { pounds, gallons });
  if (foodIsShort(pounds)) next.daysWithoutFood += 1;
  if (!((Number(gallons) || 0) > 0)) next.daysWithoutWater += 1;
  return next;
}
