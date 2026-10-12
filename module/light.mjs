/**
 * Light levels.
 *
 * Chapter 8: "There are ten levels of light as detailed below. Each
 * light source applies a modifier to the range at which your visual
 * senses work and can also apply a penalty to visual perception checks."
 *
 * The numbering is the chapter's printed order, and it is confirmed from
 * a second document rather than assumed: the Creature Codex's Shadowy
 * says "always concealed if the light level is **6 (Twilight)** or
 * lower", and Twilight is sixth in Chapter 8's list. Two books agreeing
 * on one number is worth more than either alone, and the harness asserts
 * it in both directions.
 *
 * Pure and Foundry-free.
 */

/**
 * The ten levels, darkest first.
 *
 * `visibility` is the printed percentage, as a fraction — it multiplies
 * the range at which visual senses work. `penalty` applies to visual
 * perception checks. Blinding Light prints neither: it blinds, which is
 * a condition rather than a modifier, so `visibility` is null and the
 * effect is named instead of being invented as a number.
 */
export const LIGHT_LEVELS = Object.freeze([
  { level: 1, name: "Abyssal Darkness", visibility: 0, penalty: 0, defeatsDarkvision: true },
  { level: 2, name: "Supernatural Darkness", visibility: 0, penalty: 0 },
  { level: 3, name: "Pitch Black", visibility: 0, penalty: 0 },
  { level: 4, name: "Shadowy Darkness", visibility: 0.2, penalty: -10 },
  { level: 5, name: "Dim Light", visibility: 0.4, penalty: -5 },
  { level: 6, name: "Twilight", visibility: 0.6, penalty: -2 },
  { level: 7, name: "Flickering Light", visibility: 0.8, penalty: -1 },
  { level: 8, name: "Bright Light", visibility: 1, penalty: 0 },
  { level: 9, name: "Radiant Light", visibility: 1, penalty: 0 },
  { level: 10, name: "Blinding Light", visibility: null, penalty: 0, blinds: true }
].map(Object.freeze));

/** "By default, most areas are considered to be in bright light." */
export const DEFAULT_LIGHT_LEVEL = 8;

/**
 * "Be aware that special senses such as Darkvision cannot increase the
 * illumination level above 8."
 */
export const SPECIAL_SENSE_LIGHT_CAP = 8;

/**
 * How many steps each special sense raises the level by, from Chapter 8.
 * Named here once so the three figures cannot drift apart.
 */
export const LIGHT_STEPS = Object.freeze({
  darkvision: 2,
  perfectDarkvision: 3,
  nightvision: 1
});

export function lightLevel(level) {
  return LIGHT_LEVELS.find((l) => l.level === Number(level)) ?? null;
}

/**
 * The level a creature effectively perceives at.
 *
 * Two rules, both printed, and both easy to leave out:
 *
 *  - the cap: a special sense cannot take the level above 8, so
 *    Darkvision never manufactures Radiant Light;
 *  - Abyssal Darkness "render[s] even Darkvision ineffective", so it is
 *    immune to the step entirely rather than merely capped.
 *
 * @param {number} ambient The area's level, 1-10.
 * @param {object} [senses] {darkvision, perfectDarkvision, nightvision}
 */
export function effectiveLightLevel(ambient, senses = {}) {
  const base = Number(ambient);
  if (!Number.isFinite(base)) return DEFAULT_LIGHT_LEVEL;
  const clamped = Math.min(10, Math.max(1, Math.floor(base)));

  // The "Abyssal Darkness defeats even Darkvision" rule lives in
  // raiseLightLevel, once. It used to be checked here as well, and the
  // second copy meant a mutation could delete either one and nothing
  // changed — the same shape as the half-level rule contributed twice in
  // 3.253.1.
  const steps = Math.max(
    senses.perfectDarkvision ? LIGHT_STEPS.perfectDarkvision : 0,
    senses.darkvision ? LIGHT_STEPS.darkvision : 0,
    senses.nightvision ? LIGHT_STEPS.nightvision : 0
  );
  return raiseLightLevel(clamped, steps);
}

/**
 * Raise a level by a number of steps, honouring both printed rules.
 *
 * Split out because a creature's steps are read off its OWN sense items
 * — an ability may grant any number — and rebuilding the named-sense
 * object just to get back to a number would be a second way of saying
 * the same thing.
 */
export function raiseLightLevel(ambient, steps) {
  const base = Number(ambient);
  if (!Number.isFinite(base)) return DEFAULT_LIGHT_LEVEL;
  const clamped = Math.min(10, Math.max(1, Math.floor(base)));
  const n = Number(steps);
  if (!Number.isFinite(n) || n <= 0) return clamped;
  if (lightLevel(clamped)?.defeatsDarkvision) return clamped;
  // The cap applies to the RAISE, not to the ambient level: an area that
  // is already Radiant stays Radiant.
  if (clamped >= SPECIAL_SENSE_LIGHT_CAP) return clamped;
  return Math.min(SPECIAL_SENSE_LIGHT_CAP, clamped + Math.floor(n));
}

/**
 * A SPELL MOVING THE ILLUMINATION LEVEL, WITH ITS OWN PRINTED FLOOR.
 *
 * NEW at 3.490.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT `raiseLightLevel` WITH A NEGATIVE, AND THE DIFFERENCE IS PRINTED.
 *
 * `raiseLightLevel` above refuses `steps <= 0`, and that is not an
 * oversight to route around: it answers a different question. It exists
 * for SPECIAL SENSES and carries their cap — *"special senses such as
 * Darkvision cannot increase the illumination level above 8"* — plus the
 * rule that Abyssal Darkness defeats darkvision outright. None of that
 * belongs to a spell.
 *
 * A spell prints its OWN limit, and each prints a different number:
 *
 *   UMBRAL VEIL    (PP 1)  "reduced by three steps (to a minimum of 2)"
 *   DARKNESS       (PP 4)  "lowers the illumination level by four steps
 *                           (min 3)" — and its warps move BOTH numbers:
 *                           "+4 PP: the minimum illumination level is
 *                           reduced by 1", "+2 PP: -1 level of illumination"
 *   UNWELCOME HALO (PP 2)  "increases the illumination level by two steps"
 *
 * So steps and limit are both DECLARED per spell rather than built in,
 * and one function serves all three. Reusing the special-sense cap would
 * have quietly held Darkness at 3 when its own warp had bought 2.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LIMIT IS A FLOOR GOING DOWN, AND THE SCALE'S TOP GOING UP.
 *
 * A reduction stops at the spell's printed minimum. None of the three
 * prints a maximum, so a raise stops at the scale — level 10, Blinding
 * Light. The floor argument is ignored for a raise rather than
 * reinterpreted as a ceiling: a spell printing both would say so, and
 * none does.
 *
 * @param {number} ambient the level before the spell
 * @param {number} steps signed; negative lowers, positive raises
 * @param {number} floor the spell's own printed minimum, for a reduction
 * @returns {number} a level on the 1–10 scale
 */
export function shiftLightLevel(ambient, steps, floor = 1, cap = 10) {
  const base = Number(ambient);
  if (!Number.isFinite(base)) return DEFAULT_LIGHT_LEVEL;
  const clamped = Math.min(10, Math.max(1, Math.floor(base)));
  const n = Number(steps);
  if (!Number.isFinite(n) || n === 0) return clamped;

  // A RAISE STOPS AT THE SPELL'S CAP (3.622.0; block 39's A17, Graham's
  // R9): the Light trait's own "+1 step (max 8)" when a spell states no
  // light of its own. A level already above the cap is left where it is —
  // a cap is where a raise stops, not a level it pulls the area down to.
  if (n > 0) {
    const top = Math.min(10, Math.max(1, Math.floor(Number(cap) || 10)));
    if (clamped >= top) return clamped;
    return Math.min(top, clamped + Math.floor(n));
  }

  // ALREADY DARKER THAN THE SPELL'S FLOOR? THE SPELL DOES NOTHING.
  // "To a minimum of 2" is where the reduction STOPS, not a level the
  // spell drags the area up to — casting Umbral Veil in Pitch Black must
  // not brighten the room to Supernatural Darkness.
  const limit = Math.min(10, Math.max(1, Math.floor(Number(floor) || 1)));
  if (clamped <= limit) return clamped;
  return Math.max(limit, clamped + Math.ceil(n));
}

/** The penalty to visual perception checks at a level. */
export function visualPerceptionPenalty(level) {
  return lightLevel(level)?.penalty ?? 0;
}

/**
 * A visual sense's range once the light is taken into account —
 * "each light source applies a modifier to the range at which your
 * visual senses work".
 *
 * Returns 0 where there is no visibility at all, and the unmodified
 * range at Blinding Light, whose printed effect is blindness rather than
 * a range change.
 */
export function visualRangeFeet(baseRangeFeet, level) {
  const base = Number(baseRangeFeet);
  if (!Number.isFinite(base) || base < 0) return 0;
  const spec = lightLevel(level);
  if (!spec) return Math.floor(base);
  if (spec.visibility === null) return Math.floor(base);
  return Math.floor(base * spec.visibility);
}

/**
 * Shadowy (Creature Codex) — "The creature is always concealed if the
 * light level is 6 (Twilight) or lower."
 *
 * The threshold is the Codex's own, written once and asserted against
 * Chapter 8's table so the two cannot drift.
 */
export const SHADOWY_MAX_LEVEL = 6;

/**
 * @param {number} level the light level the creature stands in
 * @param {number} [threshold] the ability's own declared ceiling; defaults
 *   to Shadowy's printed 6, so a caller with no declaration still gets the
 *   Codex's rule rather than nothing.
 */
export function shadowyConceals(level, threshold = SHADOWY_MAX_LEVEL) {
  const n = Number(level);
  const at = Number(threshold);
  if (!Number.isFinite(n) || !Number.isFinite(at)) return false;
  return n <= at;
}

/**
 * The default darkness -> level mapping, and why it stops where it does.
 *
 * Foundry models illumination as a continuous `darknessLevel` from 0 to
 * 1. This chapter has ten NAMED steps, and they are not all the same
 * kind of thing: Bright, Twilight, Dim and Shadowy Darkness describe how
 * much light there is, while Abyssal and Supernatural Darkness describe
 * light behaving unnaturally, Flickering describes light behaving
 * unsteadily, and Radiant and Blinding describe light beyond bright.
 *
 * No darkness value can imply "malevolent energy" or "a guttering
 * torch". So the derived path covers only the natural gradient, and the
 * other five levels are AUTHORED — set on a scene or a Region by the GM.
 * Deriving them would be inventing a fact the value does not carry.
 *
 * Read as: the first row whose `maxDarkness` the value does not exceed.
 * Editable in Settings; `darknessMapProblems` is what stops an edited
 * table from being quietly nonsense.
 */
export const DEFAULT_DARKNESS_MAP = Object.freeze([
  Object.freeze({ maxDarkness: 0.10, level: 8 }),   // Bright Light
  Object.freeze({ maxDarkness: 0.35, level: 6 }),   // Twilight
  Object.freeze({ maxDarkness: 0.60, level: 5 }),   // Dim Light
  Object.freeze({ maxDarkness: 0.85, level: 4 }),   // Shadowy Darkness
  Object.freeze({ maxDarkness: 1.00, level: 3 })    // Pitch Black
]);

/** Levels the derived path will never produce, and must not. */
export const AUTHORED_ONLY_LEVELS = Object.freeze([1, 2, 7, 9, 10]);

/**
 * What is wrong with a mapping table, as a list of complaints.
 *
 * A setting a person can edit is a setting a person can break, and a
 * broken table here would silently mis-light every scene. Empty means
 * usable.
 */
export function darknessMapProblems(map) {
  const problems = [];
  if (!Array.isArray(map) || !map.length) return ["the table is empty"];
  let previous = -1;
  for (const [i, row] of map.entries()) {
    const max = Number(row?.maxDarkness);
    const level = Number(row?.level);
    if (!Number.isFinite(max) || max < 0 || max > 1) problems.push(`row ${i + 1}: maxDarkness must be between 0 and 1`);
    else if (max <= previous) problems.push(`row ${i + 1}: maxDarkness must increase down the table`);
    else previous = max;
    if (!lightLevel(level)) problems.push(`row ${i + 1}: ${row?.level} is not one of the ten levels`);
  }
  const last = Number(map.at(-1)?.maxDarkness);
  if (last !== 1) problems.push("the last row must reach darkness 1, or the darkest scenes fall off the end");
  const levels = map.map((r) => Number(r.level));
  if (levels.some((l, i) => i > 0 && l > levels[i - 1])) {
    problems.push("levels must not rise as darkness rises");
  }
  return problems;
}

/** The level implied by a darkness value, or null if the table is unusable. */
export function levelFromDarkness(darkness, map = DEFAULT_DARKNESS_MAP) {
  if (darknessMapProblems(map).length) return null;
  const d = Number(darkness);
  const value = Number.isFinite(d) ? Math.min(1, Math.max(0, d)) : 0;
  for (const row of map) {
    if (value <= Number(row.maxDarkness)) return Number(row.level);
  }
  return Number(map.at(-1).level);
}

/**
 * The level in force, and where it came from.
 *
 * Explicit wins, nearest first: a Region the creature stands in, then
 * the scene, then the darkness value. Returning the SOURCE as well as
 * the number is deliberate — "why is it dark here" is the question a GM
 * actually asks, and a bare number cannot answer it.
 */
export function resolveLightLevel({ regionLevel, sceneLevel, darkness, map = DEFAULT_DARKNESS_MAP } = {}) {
  if (lightLevel(regionLevel)) return { level: Number(regionLevel), source: "region" };
  if (lightLevel(sceneLevel)) return { level: Number(sceneLevel), source: "scene" };
  const derived = levelFromDarkness(darkness, map);
  if (derived !== null) return { level: derived, source: "darkness" };
  return { level: DEFAULT_LIGHT_LEVEL, source: "default" };
}
