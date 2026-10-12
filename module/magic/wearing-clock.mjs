/**
 * A SPELL WHOSE DURATION IS WORN DOWN BY BLOWS.
 *
 * NEW at 3.608.0, for R8 of the pages 321–330 audit. Pure; no Foundry.
 *
 * STONESKIN (PP 10, page 328), 10 minutes
 *   "You gain physical resistance (adamantine). Each time you are hit by a
 *    physical attack, the duration of the spell decreases by 1 minute."
 *
 * THE SPELL'S OWN CLOCKS ARE WHAT SHRINK. An effect from a cast carries up
 * to three: the world-time end the effect sweep reads, the round expiry the
 * combat sweep reads (a fight's rounds pass without the world clock moving),
 * and Foundry's own duration the sheet counts down. A blow takes a minute
 * off all three, or the one that did not shrink would keep the spell alive.
 *
 * "HIT BY A PHYSICAL ATTACK" is an attack whose damage is physical —
 * bludgeoning, piercing, slashing or subdual — that HIT. A glancing blow is
 * a hit. A miss, a spell and a fall are not attacks that hit.
 */

/** The flag the worn spell's effects carry. */
export const WEARING_CLOCK_FLAG = "wearingClock";

const SECONDS_PER_ROUND = 6;

const text = (v) => String(v ?? "").trim();

/** A `wearingClock` row, or null. */
export function normaliseWearingClock(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "wearingClock") return null;
  const seconds = Math.trunc(Number(raw.seconds ?? 60));
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const on = text(raw.on) || "physical";
  if (on !== "physical") return null;
  return { on, seconds, label: text(raw.label) };
}

/**
 * Does a hit of this damage type wear the clock?
 *
 * @param {object} spec normalised
 * @param {string} damageType
 * @param {object} damageTypes the system's DAMAGE_TYPES table
 */
export function hitWears(spec, damageType, damageTypes = {}) {
  if (!spec) return false;
  return damageTypes?.[text(damageType).toLowerCase()]?.group === spec.on;
}

/**
 * The three clocks after one blow.
 *
 * @param {{end: number|null, expiresRound: number|null, duration: {value, units}|null}} clocks
 * @param {number} seconds taken off
 * @param {{worldTime: number, round: number|null}} now
 * @returns {{end, expiresRound, duration, spent: boolean, remainingSeconds: number|null}}
 */
export function wornClocks(clocks, seconds, { worldTime = 0, round = null } = {}) {
  const s = Math.max(0, Math.trunc(Number(seconds) || 0));
  const rounds = Math.ceil(s / SECONDS_PER_ROUND);
  const has = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
  const end = has(clocks?.end) ? Number(clocks.end) - s : null;
  const expiresRound = has(clocks?.expiresRound) ? Number(clocks.expiresRound) - rounds : null;
  /*
   * FOUNDRY 14'S DURATION IS `{ value, units }` (3.608.2). The first build
   * read `seconds` and `rounds`, found null, and wrote null back as the
   * duration's value — which V14 refuses outright ("value: must be an
   * integer"), so the WHOLE update failed and the spell's own clock never
   * moved while the card said it had. Found on the 3.608.1 live drive.
   * Only a whole-number value in a unit this can count is changed; any
   * other duration is left exactly as it is, and the spell's flags carry
   * the clock that matters.
   */
  let duration = null;
  const rawValue = clocks?.duration?.value;
  // `Number(null)` is 0, an integer — the very null this refuses.
  const v = rawValue === null || rawValue === undefined || rawValue === "" ? NaN : Number(rawValue);
  const units = String(clocks?.duration?.units ?? "");
  const off = { seconds: s, rounds, minutes: s / 60, turns: rounds }[units];
  if (clocks?.duration && Number.isInteger(v) && Number.isFinite(off)) {
    duration = { value: Math.max(0, Math.round(v - off)), units };
  }
  const remainingSeconds = end !== null ? end - Number(worldTime || 0) : null;
  const spentByTime = remainingSeconds !== null && remainingSeconds <= 0;
  const spentByRound = expiresRound !== null && has(round) && expiresRound <= Number(round);
  return { end, expiresRound, duration, spent: spentByTime || spentByRound, remainingSeconds };
}

/** The card line for one blow. */
export function wornLine(name, label, seconds, result) {
  const minutes = Math.round(seconds / 60);
  if (result.spent) {
    return `<strong>${label}</strong> on ${name} is worn away by the blow — the spell ends.`;
  }
  const left = result.remainingSeconds !== null
    ? ` About ${Math.max(0, Math.round(result.remainingSeconds / 60))} minute${Math.round(result.remainingSeconds / 60) === 1 ? "" : "s"} left.`
    : "";
  return `<strong>${label}</strong> on ${name} wears: ${minutes} minute${minutes === 1 ? "" : "s"} off its duration.${left}`;
}
