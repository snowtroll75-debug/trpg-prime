/**
 * THE ENVIRONMENT — Chapter 12, pages 394–396 (3.620.0, block 38; Graham's
 * R13, R15 and R16, "your recommendation", and the audit's A4).
 *
 *   ENVIRONMENTAL DAMAGE TABLE (page 396), damage on a Failure / Fumble:
 *
 *     Extreme Heat   fire          1d6 / 2d6     every hour
 *     Extreme Cold   cold          1d6 / 2d6     every hour
 *     Sandstorm      bludgeoning   1d4 / 1d6     every 10 minutes
 *     Blizzard       cold          1d4 / 1d6     every 10 minutes
 *     Lava           fire          10d6 / 20d6   instant (touch or immersion)
 *     Acid Pool      acid          5d6 / 10d6    instant (touch or immersion)
 *     Quicksand      nonlethal     suffocation rules apply, until escape
 *     Thunderstorm   electricity   4d6 / 6d6     random (lightning strike)
 *
 *   "For many environmental hazards, an Exhaustion check is appropriate to
 *    mitigate damage. The DC should be set according to the severity of the
 *    condition and the players' level."
 *
 * R13: the Exhaustion Check takes a GM DC and an environment; a failure
 * deals the row's Failure damage, a fumble or blunder its Fumble damage —
 * ON TOP OF Chapter 7's Fatigue, which is the check's own result.
 *
 * A4: the cold-weather gear (Furs/Pelts, Winter clothing, the Bedroll) is a
 * conditional offered only in the check dialog, which the Exhaustion Check
 * never opens. In a cold environment the bonus plainly applies, so it is
 * taken — the best one, item bonuses not stacking.
 *
 * R16: "visibility … reduced by up to four steps" in a blizzard, a
 * sandstorm or fog is light-level steps (Chapter 8's scale), set on a scene
 * or a region as Weather.
 *
 * Pure. No Foundry.
 */

/** The table (page 396). `exhaustion`: rolled through an Exhaustion check. */
export const ENVIRONMENTAL_DAMAGE = Object.freeze({
  extremeHeat: { label: "Extreme Heat", type: "fire", failure: "1d6", fumble: "2d6", frequency: "every hour" },
  extremeCold: { label: "Extreme Cold", type: "cold", failure: "1d6", fumble: "2d6", frequency: "every hour", cold: true },
  sandstorm: { label: "Sandstorm", type: "bludgeoning", failure: "1d4", fumble: "1d6", frequency: "every 10 minutes" },
  blizzard: { label: "Blizzard", type: "cold", failure: "1d4", fumble: "1d6", frequency: "every 10 minutes", cold: true },
  lava: { label: "Lava", type: "fire", failure: "10d6", fumble: "20d6", frequency: "instant (touch or immersion)" },
  acidPool: { label: "Acid Pool", type: "acid", failure: "5d6", fumble: "10d6", frequency: "instant (touch or immersion)" },
  quicksand: { label: "Quicksand", type: "", failure: "", fumble: "", frequency: "until escape", suffocation: true, nonlethal: true },
  thunderstorm: { label: "Thunderstorm", type: "electricity", failure: "4d6", fumble: "6d6", frequency: "random, or the GM's discretion (lightning strike)" }
});

/**
 * The damage a degree deals in an environment: the Failure column on a
 * failure, the Fumble column on a fumble or blunder, nothing on a success.
 * Quicksand deals no table damage: it starts the suffocation clock.
 *
 * @param {string} key an ENVIRONMENTAL_DAMAGE key
 * @param {string} degree
 * @returns {{formula: string, type: string, column: "failure"|"fumble", label: string}|null}
 */
export function environmentalDamageFor(key, degree) {
  const row = ENVIRONMENTAL_DAMAGE[key];
  if (!row || row.suffocation) return null;
  const d = String(degree ?? "");
  // A PARTIAL deals none: the table prints a Failure and a Fumble column,
  // and a partial is a partial success (it costs its 1 Fatigue, Chapter 7).
  const column = d === "fumble" || d === "blunder" ? "fumble" : d === "failure" ? "failure" : null;
  if (!column) return null;
  return { formula: row[column], type: row.type, column, label: row.label };
}

/**
 * Does a failure here start Quicksand's suffocation? A failure, fumble or
 * blunder.
 */
export function environmentSuffocates(key, degree) {
  const row = ENVIRONMENTAL_DAMAGE[key];
  if (!row?.suffocation) return false;
  return ["failure", "fumble", "blunder"].includes(String(degree ?? ""));
}

const COLD_WORDS = /\b(cold|wintry|winter|chill)/i;

/**
 * A4 — the cold-weather bonus to take in a cold environment: the best of
 * the actor's offered cold conditionals that reach this save, or null.
 * Item bonuses do not stack, so only the highest counts.
 *
 * @param {object[]} conditionals the actor's offered conditionals
 * @param {string} saveKey "fortitude" or "will"
 * @returns {{label: string, value: number, type: string}|null}
 */
export function coldProtection(conditionals = [], saveKey = "fortitude") {
  let best = null;
  for (const entry of Array.isArray(conditionals) ? conditionals : []) {
    if (entry?.kind && entry.kind !== "modifier") continue;
    const value = Number(entry?.value) || 0;
    if (value <= 0) continue;
    if (!COLD_WORDS.test(`${entry?.label ?? ""} ${entry?.scope ?? ""}`)) continue;
    const subjects = entry?.when?.subjects;
    if (Array.isArray(subjects) && subjects.length && !subjects.includes(saveKey)) continue;
    const types = entry?.when?.checkTypes;
    if (Array.isArray(types) && types.length && !types.includes("save")) continue;
    if (!best || value > best.value) best = { label: String(entry.label ?? "Cold-weather gear"), value, type: String(entry.type ?? "item") };
  }
  return best;
}

/** R16 — the weather that reduces visibility, by up to four steps. */
export const WEATHER_KINDS = Object.freeze({
  fog: "Fog",
  sandstorm: "Sandstorm",
  blizzard: "Blizzard"
});

/** The most a weather can take away: "up to four steps". */
const WEATHER_MAX_STEPS = 4;

/**
 * A scene's or region's Weather as a light shift, or null.
 *
 * @param {{kind?: string, steps?: number}} weather the stored flag
 * @returns {{steps: number, floor: number, label: string}|null} steps negative
 */
function weatherLightShift(weather) {
  const label = WEATHER_KINDS[weather?.kind];
  if (!label) return null;
  const steps = Math.min(WEATHER_MAX_STEPS, Math.max(0, Math.floor(Number(weather?.steps) || 0)));
  if (!steps) return null;
  return { steps: -steps, floor: 1, label };
}

/**
 * The weather where a token stands: a region's Weather, where the token is
 * in one that sets it, wins over the scene's — the nearest authored answer,
 * as a region's light level wins over the scene's. One weather, never two
 * added together.
 *
 * @param {object|null} sceneWeather the scene's flag
 * @param {object[]} regionWeathers the flags of the regions the token is in
 */
export function weatherShiftFor(sceneWeather, regionWeathers = []) {
  for (const weather of Array.isArray(regionWeathers) ? regionWeathers : []) {
    const shift = weatherLightShift(weather);
    if (shift) return shift;
  }
  return weatherLightShift(sceneWeather);
}
