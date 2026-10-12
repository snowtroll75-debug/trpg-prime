/**
 * FOOD AND WATER, WOUND AND READ — the two clocks of page 230, on the
 * two Foundry clocks that already move.
 *
 * NEW at 3.582.1. `module/sustenance.mjs` shipped at 3.582.0 with the
 * rules right and NOTHING CALLING THEM — thirty checks against a module
 * no production file imported. `verify-rules-have-callers` said so on
 * the first full sweep after it was written, which is the whole reason
 * that check exists (lesson 5.1: an exported rule nobody calls is not
 * automation, it is a well-tested opinion).
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO CLOCKS GO ON THE TWO CLOCKS, and the choice is not arbitrary:
 *
 *   THE DAY is the REST. A day passing is not a Foundry event, but a
 *   full night's rest is, and it is the moment the table agrees a day
 *   has gone by. So the Rest dialog asks whether each character ate and
 *   drank, and a rest that pays a FULL night advances the day. A
 *   one-hour breather does not, or a party catching its breath four
 *   times in an afternoon would starve by evening.
 *
 *   THE HOUR is the WORLD CLOCK. "After a day with no water your GM will
 *   require you to begin making Exhaustion checks EVERY HOUR" — an
 *   hourly rule needs an hourly tick, and `updateWorldTime` is the one
 *   the system already sweeps conditions on.
 *
 * WHY A STAMP RATHER THAN A COUNTER. The hourly clock records the world
 * time a check was last owed, not a number of hours accumulated. A
 * counter has to be incremented by something, and nothing increments
 * once per hour — the world clock jumps by whatever the GM advanced it
 * by, eight hours at a time on a long rest. Subtracting two stamps gets
 * the right answer for a jump of any size; incrementing gets one check
 * per jump however long the jump was.
 *
 * NOTHING HERE DECIDES HOW MANY CHECKS ARE DUE. `sustenance.mjs` does
 * that, and it is pure. This is the part that touches Foundry.
 */

import {
  FOOD_POUNDS_PER_DAY,
  FOOD_POUNDS_GENEROUS,
  WATER_GALLONS_PER_DAY,
  WATER_CHECK_INTERVAL_HOURS,
  advanceDay,
  sustenanceChecksDue
} from "./sustenance.mjs";

const SYSTEM_ID = "trg-prime";
/** The actor flag the two clocks live in. */
const SUSTENANCE_FLAG = "sustenance";
/** Seconds in the hourly interval the page charges. */
const WATER_INTERVAL_SECONDS = WATER_CHECK_INTERVAL_HOURS * 3600;

/**
 * The stored clocks, in the shape `sustenance.mjs` expects.
 *
 * @param {object} actor
 * @returns {{daysWithoutFood: number, daysWithoutWater: number,
 *   hoursSinceWaterFailed: number, waterClockAt: number|null}}
 */
export function sustenanceState(actor) {
  const raw = actor?.getFlag?.(SYSTEM_ID, SUSTENANCE_FLAG) ?? {};
  const whole = (value) => Math.max(0, Math.trunc(Number(value) || 0));
  /*
   * NULL SURVIVES THE READ (3.582.2, found by the live drive of
   * 3.582.1). This was `Number(raw.waterClockAt)` guarded by
   * `Number.isFinite`, and `Number(null)` is 0 — a finite number — so a
   * cleared clock read back as the epoch rather than as "no clock". It
   * never reached an answer, because the sweep returns early while the
   * character is hydrated, but stored state that lies is how the next
   * caller gets it wrong: `state.waterClockAt === null` was already
   * false for every cleared clock in the world.
   */
  const stored = raw.waterClockAt;
  const stamp = Number(stored);
  return {
    daysWithoutFood: whole(raw.daysWithoutFood),
    daysWithoutWater: whole(raw.daysWithoutWater),
    hoursSinceWaterFailed: whole(raw.hoursSinceWaterFailed),
    waterClockAt: stored === null || stored === undefined || stored === ""
      || !Number.isFinite(stamp) ? null : stamp
  };
}

/**
 * Is this character past the day-with-no-water threshold?
 *
 * THE GATE THE WORLD CLOCK ASKS, rather than a flag name exported for
 * `scripts/trg-prime.mjs` to reach into. The sweep runs over every actor
 * on every clock tick, so the cheap question belongs here beside the
 * shape it is asking about — a literal `getFlag("trg-prime", …)` in the
 * script is a second place that has to be right.
 *
 * @param {object} actor
 * @returns {boolean}
 */
export function isDehydrated(actor) {
  return Number(actor?.getFlag?.(SYSTEM_ID, SUSTENANCE_FLAG)?.daysWithoutWater) > 0;
}

async function store(actor, state) {
  await actor.setFlag(SYSTEM_ID, SUSTENANCE_FLAG, {
    daysWithoutFood: state.daysWithoutFood,
    daysWithoutWater: state.daysWithoutWater,
    hoursSinceWaterFailed: state.hoursSinceWaterFailed,
    waterClockAt: state.waterClockAt
  });
}

/** The line the rest card prints when nothing is wrong, quoting the page. */
export function sustenanceLine(state) {
  if (!state.daysWithoutFood && !state.daysWithoutWater) {
    return `<em>Fed and watered — about ${FOOD_POUNDS_PER_DAY}–${FOOD_POUNDS_GENEROUS} lb of food `
      + `and ${WATER_GALLONS_PER_DAY} gallon of water a day.</em>`;
  }
  const said = [];
  if (state.daysWithoutFood) {
    said.push(`<strong>${state.daysWithoutFood}</strong> day`
      + `${state.daysWithoutFood === 1 ? "" : "s"} short of food`);
  }
  if (state.daysWithoutWater) {
    said.push(`<strong>${state.daysWithoutWater}</strong> day`
      + `${state.daysWithoutWater === 1 ? "" : "s"} without water — Exhaustion checks every hour from now`);
  }
  return `<strong>Going without:</strong> ${said.join("; ")}.`;
}

/**
 * A day passes for one character.
 *
 * Called from the rest workflow when a rest pays a full night. Rolls the
 * Exhaustion checks the day owes and returns the lines for the rest card.
 *
 * @param {object} actor
 * @param {object} options
 * @param {boolean} [options.ate] did they eat their day's food?
 * @param {boolean} [options.drank] did they drink at all?
 * @returns {Promise<string[]>}
 */
export async function advanceSustenanceDay(actor, { ate = true, drank = true } = {}) {
  const before = sustenanceState(actor);
  const next = advanceDay(before, {
    pounds: ate ? FOOD_POUNDS_PER_DAY : 0,
    gallons: drank ? WATER_GALLONS_PER_DAY : 0
  });
  const worldTime = Number(globalThis.game?.time?.worldTime ?? 0);

  /*
   * THE HOURLY CLOCK STARTS WHEN THE THRESHOLD IS CROSSED, not when the
   * day began. "After a day with no water … BEGIN making Exhaustion
   * checks every hour" — so the day that crossed it costs no hourly
   * check, and the first one falls due an hour later.
   */
  next.waterClockAt = next.daysWithoutWater >= 1
    ? (before.daysWithoutWater >= 1 ? before.waterClockAt ?? worldTime : worldTime)
    : null;
  next.hoursSinceWaterFailed = 0;

  await store(actor, next);

  /*
   * ONLY THE FOOD CHECKS ARE ROLLED HERE. The water side is asked of
   * `sustenanceChecksDue` with no hours elapsed, which is the "hourly
   * checks begin now" reason and no check — the hours themselves are the
   * world clock's business.
   */
  const { checks, reasons } = sustenanceChecksDue({
    daysWithoutFood: next.daysWithoutFood,
    daysWithoutWater: next.daysWithoutWater,
    hoursSinceWaterFailed: 0
  });

  const lines = [sustenanceLine(next)];
  if (!checks) return lines;

  const { rollExhaustionCheck } = await import("./combat/exhaustion-workflow.mjs");
  for (let i = 0; i < checks; i += 1) {
    await rollExhaustionCheck(actor, { activity: reasons.join("; ") });
  }
  lines.push(`<strong>Exhaustion:</strong> ${checks} check${checks === 1 ? "" : "s"} — ${reasons.join("; ")}.`);
  return lines;
}

/**
 * The hourly water check, on the world clock.
 *
 * @param {object} actor
 * @param {number} worldTime
 * @returns {Promise<number>} how many checks were rolled
 */
export async function sweepSustenanceHours(actor, worldTime) {
  const state = sustenanceState(actor);
  if (!(state.daysWithoutWater >= 1)) return 0;

  const since = Number(state.waterClockAt);
  if (!Number.isFinite(since)) {
    await store(actor, { ...state, waterClockAt: Number(worldTime) || 0 });
    return 0;
  }

  const elapsed = (Number(worldTime) || 0) - since;
  if (!(elapsed > 0)) return 0;

  const { checks, reasons } = sustenanceChecksDue({
    daysWithoutFood: 0,
    daysWithoutWater: state.daysWithoutWater,
    hoursSinceWaterFailed: elapsed / 3600
  });
  if (!checks) return 0;

  // THE STAMP MOVES BY WHAT WAS CHARGED, not to now — a jump of ninety
  // minutes owes one check and keeps the spare half hour, so two such
  // jumps owe a second. Moving it to `worldTime` would throw the
  // remainder away every time the GM nudged the clock.
  await store(actor, { ...state, waterClockAt: since + (checks * WATER_INTERVAL_SECONDS) });

  const { rollExhaustionCheck } = await import("./combat/exhaustion-workflow.mjs");
  for (let i = 0; i < checks; i += 1) {
    await rollExhaustionCheck(actor, { activity: reasons.join("; ") });
  }
  return checks;
}
