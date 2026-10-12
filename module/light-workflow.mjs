/**
 * Light: the Foundry half.
 *
 * The rules are in light.mjs and are pure. This asks Foundry the three
 * questions that module cannot ask for itself — what has the GM set on
 * this Region, what has the GM set on this scene, and what is the
 * darkness — and hands the answers over.
 */
import { DEFAULT_DARKNESS_MAP, DEFAULT_LIGHT_LEVEL, darknessMapProblems, resolveLightLevel, shiftLightLevel } from "./light.mjs";
import { weatherShiftFor } from "./environment.mjs";
import {
  lightRadiusFeet, lightSourceKeysOn, resolvedLevelWithSources
} from "./light-sources.mjs";

const SYSTEM_ID = "trg-prime";
export const DARKNESS_MAP_SETTING = "darknessLightMap";

/** The GM's mapping table, or the default if theirs does not survive validation. */
export function darknessMap() {
  try {
    const stored = game.settings?.get(SYSTEM_ID, DARKNESS_MAP_SETTING);
    const parsed = typeof stored === "string" ? JSON.parse(stored) : stored;
    if (!darknessMapProblems(parsed).length) return parsed;
    // A broken table must not silently mis-light every scene, and must
    // not throw either. Say so once, loudly, and carry on with the
    // default.
    console.warn(`TRG Prime | darkness->light table is unusable, using the default:`,
      darknessMapProblems(parsed));
  } catch (err) {
    console.warn("TRG Prime | could not read the darkness->light table", err);
  }
  return DEFAULT_DARKNESS_MAP;
}

/**
 * The first Region in this set that names a light level.
 *
 * Exported and Foundry-free on purpose: it takes anything with a
 * getFlag, so the harness can hand it fakes and assert what it RETURNS.
 * Checking the workflow file for the word "regions" would pass on a file
 * that reads them and throws the answer away — which is the mistake
 * 3.255.3 recorded, one file later.
 */
export function firstRegionLightLevel(regions = []) {
  return Array.from(regions ?? [])
    .map((r) => r?.getFlag?.(SYSTEM_ID, "lightLevel"))
    .find((v) => v !== undefined && v !== null);
}

/**
 * Every SHIFT the Regions a token stands in apply to the light level.
 *
 * NEW at 3.490.0, and a different flag from `lightLevel` above on
 * purpose. A Region that SETS a level answers "it is Twilight in here";
 * Umbral Veil and Darkness answer "it is three steps darker than it
 * otherwise would be here", which is not the same sentence and cannot be
 * written as an absolute — the region moves, and what it moves over
 * changes.
 *
 * EVERY ONE OF THEM, NOT THE FIRST. Two globes of Darkness overlapping
 * are two spells doing their work; taking the first would make the
 * second free. The absolute flag above takes the first because two
 * regions each declaring "it is Twilight here" cannot both be obeyed —
 * there is one answer and they disagree. Shifts do not disagree, they
 * accumulate.
 *
 * Same shape as `firstRegionLightLevel`: takes anything with a getFlag,
 * so a harness can hand it fakes and assert what it RETURNS.
 *
 * @returns {Array<{steps: number, floor: number}>}
 */
export function regionLightShifts(regions = []) {
  // ONE CAST, ONE SHIFT (3.622.4; the 3.622.3 drive's O1, Graham's R1 of
  // 6 October 2026). Fairy Fire draws a circle round each creature it
  // outlines, and two outlined creatures standing together each stood in
  // both circles — two steps from one spell, when the Light trait raises
  // "by one step". So circles sharing a cast id count once at a point.
  // Different spells — two globes of Darkness — still accumulate, as above;
  // a circle with no cast id (one drawn by hand) is its own.
  const seen = new Set();
  return Array.from(regions ?? [])
    .filter((r) => {
      const castId = r?.getFlag?.(SYSTEM_ID, "castId") ?? null;
      if (!castId || !r?.getFlag?.(SYSTEM_ID, "lightShift")) return true;
      if (seen.has(castId)) return false;
      seen.add(castId);
      return true;
    })
    .map((r) => r?.getFlag?.(SYSTEM_ID, "lightShift"))
    .filter((s) => s && Number.isFinite(Number(s.steps)) && Number(s.steps) !== 0)
    .map((s) => ({ steps: Number(s.steps), floor: Number(s.floor) || 1, cap: Number(s.cap) || 10 }));
}

/**
 * The light level where this token is standing, and where it came from.
 *
 * A Region the token is standing in wins over the scene, which wins over
 * the darkness value — the nearest authored answer.
 */
export function lightLevelForToken(tokenDocument) {
  const scene = tokenDocument?.parent ?? canvas?.scene;
  const regionLevel = firstRegionLightLevel(tokenDocument?.regions);
  const ambient = resolveLightLevel({
    regionLevel,
    sceneLevel: scene?.getFlag?.(SYSTEM_ID, "lightLevel"),
    darkness: scene?.environment?.darknessLevel ?? scene?.darkness ?? 0,
    map: darknessMap()
  });

  // CARRIED AND CAST LIGHT SOURCES, WHICH IS THE POINT OF 3.396.0.
  // Without this the `light` effect kind would move a picture around and
  // change no number — automation that is really a reminder, which is
  // what this chapter has spent a fortnight removing.
  //
  // THE GATHERING IS HERE AND THE ARITHMETIC IS NOT. Which tokens are
  // near enough is a question only Foundry can answer; what their
  // sources do to the level is `combinedLightLevel`, which is pure and
  // has 607 checks against it. That is the same split every other rule
  // in this system uses, and the reason a harness can reach any of it.
  const withSources = resolveLightLevelWithSources(ambient, tokenDocument, scene);

  /*
   * AND THEN THE SPELLS THAT MOVE THE LEVEL (3.490.0).
   *
   * LAST, AFTER THE LIGHT SOURCES, and that ordering is the spell.
   * Umbral Veil reduces "the illumination level" — the one that is
   * actually here, torches included. Applied before sources, a lantern
   * carried into the shadow would light it back up to bright and the
   * spell would have bought nothing; applied after, the lantern raises
   * the level and the shadow takes three steps off whatever that came
   * to, which is what a cloak of shadows does.
   *
   * The arithmetic is `shiftLightLevel` and is not repeated here — one
   * place decides what a step is worth, and it is the pure one.
   */
  const shifts = regionLightShifts(tokenDocument?.regions);
  // AND THE WEATHER (3.620.0; Chapter 12, Graham's R16): "visibility …
  // reduced by up to four steps" in a blizzard, a sandstorm or fog — a
  // region's Weather, or else the scene's. After the light sources, as the
  // spells are: a lantern does not see through a sandstorm.
  const weather = weatherShiftFor(
    scene?.getFlag?.(SYSTEM_ID, "weather") ?? null,
    Array.from(tokenDocument?.regions ?? []).map((r) => r?.getFlag?.(SYSTEM_ID, "weather") ?? null)
  );
  if (!shifts.length && !weather) return withSources;
  let level = Number(withSources?.level ?? DEFAULT_LIGHT_LEVEL);
  for (const shift of shifts) level = shiftLightLevel(level, shift.steps, shift.floor, shift.cap);
  if (weather) level = shiftLightLevel(level, weather.steps, weather.floor);
  return level === withSources?.level
    ? withSources
    : { level, source: weather && !shifts.length ? `weather (${weather.label})` : "spell" };
}

/**
 * Fold every light source in reach of this token into the ambient level.
 *
 * RETURNS A RESOLUTION — `{level, source}` — BECAUSE THAT IS THE
 * CONTRACT. `lightLevelForToken`'s three callers all destructure
 * `.level`: combat/targeting.mjs for concealment, apps/check-dialog.mjs
 * and sheets/actor-sheet.mjs for the perception penalty.
 *
 * THE FIRST VERSION OF THIS FUNCTION RETURNED A BARE NUMBER, and the
 * live pass on 25 August is the only reason that is not shipped. It was
 * invisible in two separate ways at once. The ambient object went into
 * `combinedLightLevel`, where `Number({level: 8, …})` is NaN and the
 * function's own fallback answered 8 — correct by coincidence on a
 * bright scene, wrong everywhere else. And the return value was the
 * object when no source was in reach and a number when one was, so all
 * three callers read `undefined` EXACTLY WHEN A LIGHT WAS LIT: the
 * feature broke the thing it was meant to feed, and only while in use.
 *
 * No harness could have caught it. `lightLevelForToken` needs a Foundry
 * scene, a token document and a canvas, so the whole decision sat inside
 * a function nothing pure can call — the defect shape this project has a
 * name for, demonstrating itself.
 *
 * A SOURCE LIGHTS ITS NEIGHBOURS, not only its bearer. A torch held by
 * one character illuminates the square beside it, so every token on the
 * scene is asked what it carries and the ones close enough contribute.
 *
 * DISTANCE IS MEASURED BY THE SCENE'S OWN GRID, via `canvas.grid`, so a
 * scene at 10 feet per square measures in the units the spell prints.
 * Falling back to raw pixels over grid size is what keeps this working
 * on a scene with no canvas active — a chat card resolved while the
 * scene is not the active one is an ordinary thing to happen.
 *
 * THE BEARER IS ALWAYS IN REACH OF ITS OWN SOURCE, whatever the geometry
 * says, because a distance of zero should not depend on a grid being
 * configured correctly.
 */
function resolveLightLevelWithSources(ambient, tokenDocument, scene) {
  const tokens = scene?.tokens;
  if (!tokens || !tokenDocument) return ambient;

  const keys = [];
  for (const other of tokens) {
    const actor = other?.actor;
    if (!actor) continue;
    const carried = lightSourceKeysOn(actor);
    if (!carried.length) continue;

    const isSelf = other?.id === tokenDocument?.id;
    for (const key of carried) {
      if (isSelf || withinFeet(tokenDocument, other, lightRadiusFeet(key), scene)) {
        keys.push(key);
      }
    }
  }
  // THE SHAPE DECISION IS NOT MADE HERE. `resolvedLevelWithSources` is
  // pure and harnessed; this function's only job is deciding which keys
  // are in reach, which is the part that genuinely needs Foundry.
  return resolvedLevelWithSources(ambient, keys);
}

/** Is `b` within `feet` of `a`? Measured on the scene's grid. */
function withinFeet(a, b, feet, scene) {
  const ax = Number(a?.x); const ay = Number(a?.y);
  const bx = Number(b?.x); const by = Number(b?.y);
  if (![ax, ay, bx, by].every(Number.isFinite)) return false;

  const size = Number(scene?.grid?.size ?? canvas?.grid?.size);
  const distancePerSquare = Number(scene?.grid?.distance ?? canvas?.grid?.distance);
  if (!Number.isFinite(size) || size <= 0
    || !Number.isFinite(distancePerSquare) || distancePerSquare <= 0) return false;

  const pixels = Math.hypot(ax - bx, ay - by);
  return (pixels / size) * distancePerSquare <= Number(feet);
}

/** Registered at init, with the rest of the system's settings. */
export function registerLightSettings() {
  game.settings.register(SYSTEM_ID, DARKNESS_MAP_SETTING, {
    name: "Darkness to light level",
    hint: "How Foundry's 0-1 darkness maps onto Chapter 8's ten light levels. "
      + "Abyssal, Supernatural, Flickering, Radiant and Blinding are never derived — "
      + "set those on a scene or Region instead. JSON: [{\"maxDarkness\":0.1,\"level\":8}, ...]",
    scope: "world",
    config: true,
    type: String,
    default: JSON.stringify(DEFAULT_DARKNESS_MAP)
  });
}
