/**
 * A SPELL THAT MOVES THE ILLUMINATION LEVEL IN A CIRCLE.
 *
 * NEW at 3.490.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * UMBRAL VEIL (PP 1, touch, Darkness / Invocation, 1 minute)
 *
 *   "Within a 20-foot emanation centred on the target, the illumination
 *    level is reduced by three steps (to a minimum of 2). By using a
 *    1 AP (Interact) action, the target can remove the cloak of shadows
 *    and leave it behind as a decoy, where it continues to diminish the
 *    light for the remaining duration of the spell. If someone retrieves
 *    the cloak after the original target discards it, the cloak
 *    dissipates, and the spell abruptly ends."
 *
 * The pack shipped it with `effects: []`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE `light` EFFECT KIND.
 *
 * `light` gives a creature a LIGHT SOURCE — a torch, a lantern, Dancing
 * Lights — an object that emits, from a named registry of sources with
 * printed radii. Umbral Veil emits nothing. It changes what the
 * illumination level IS inside a circle, whatever is producing it, and
 * a torch carried into that circle is still three steps dimmer than it
 * would otherwise be.
 *
 * Modelling it as a light source with a negative radius would have been
 * the cheap version, and it would have been a source that the source
 * arithmetic then folded in as if it were a lantern.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE MECHANISM, THREE SPELLS, AND THEY DISAGREE ON EVERY NUMBER.
 *
 *   UMBRAL VEIL    (PP 1)  −3 steps, floor 2, 20 ft, follows a creature
 *   UNWELCOME HALO (PP 2)  +2 steps, 20 ft, follows a creature, and the
 *                          DURATION is degree-gated
 *   DARKNESS       (PP 4)  −4 steps, floor 3, 20-ft radius, STATIC, and
 *                          its warps move the step count AND the floor
 *
 * So steps, floor, radius and whether the circle follows anything are
 * all declared per spell. Building any of them in would have made the
 * next two spells special cases of the first.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DECOY, AND WHAT IS AUTOMATED OF IT.
 *
 * Graham's ruling, 4 September 2026: **build the drop, print the
 * retrieval.** Dropping the cloak is the half that changes the map — the
 * circle stops following the target and stays where it was let go, still
 * dimming the light until the spell runs out. That is `anchorTokenId`
 * going null, and it is why the anchor is a field rather than always
 * being the caster.
 *
 * "If someone retrieves the cloak … the spell abruptly ends" stays at
 * the table, because retrieving requires an object to pick up and this
 * system has no spell-created objects. It is printed on the card, and
 * the GM ends the spell from the Spellcasting panel exactly as they
 * would dismiss any other running spell.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * A light-shift row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 */
export function normaliseLightShift(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (String(raw.kind ?? "").trim() !== "lightShift") return null;

  const steps = int(raw.steps);
  // A SHIFT OF ZERO IS NOT A SPELL. Refused rather than applied, because
  // a circle that changes nothing is indistinguishable on the map from
  // one that is broken.
  if (steps === 0) return null;

  const radiusFeet = int(raw.radiusFeet);
  if (radiusFeet <= 0) return null;

  return {
    steps,
    radiusFeet,
    // THE FLOOR IS THE SPELL'S OWN PRINTED MINIMUM, defaulting to the
    // bottom of the scale rather than to any particular spell's number.
    floor: Math.min(10, Math.max(1, int(raw.floor) || 1)),
    // THE CEILING OF A RAISE (3.622.0; R9): 8 for the Light trait's default
    // step, the scale's top (10) for a spell that states its own.
    cap: Math.min(10, Math.max(1, int(raw.cap) || 10)),
    // DOES THE CIRCLE FOLLOW ANYTHING? Umbral Veil and Unwelcome Halo
    // are centred on a creature; Darkness is a globe you put somewhere.
    follows: raw.follows !== false,
    // CAN IT BE PUT DOWN? Only Umbral Veil prints this, so it is opt-in
    // rather than a property of every following circle.
    droppable: raw.droppable === true
  };
}

/** What the card says when the circle appears. */
export function lightShiftLine(spec, spellName, targetName) {
  const direction = spec.steps < 0
    ? `dims the light by <strong>${Math.abs(spec.steps)} step${Math.abs(spec.steps) === 1 ? "" : "s"}</strong>`
    : `brightens the light by <strong>${spec.steps} step${spec.steps === 1 ? "" : "s"}</strong>`;
  const limit = spec.steps < 0 ? ` (to a minimum of ${spec.floor})` : "";
  const where = spec.follows
    ? `a ${spec.radiusFeet} ft emanation centred on <strong>${targetName}</strong>`
    : `a ${spec.radiusFeet} ft radius`;
  return `${spellName} ${direction}${limit} within ${where}.`;
}

/**
 * What the card says about putting the cloak down.
 *
 * PRINTED AT THE CAST, not when it happens, because the target has to
 * know the option exists before they can spend the AP on it.
 */
export function lightShiftDropLine(spec, targetName) {
  if (!spec.droppable) return null;
  return `<em>${targetName} may spend <strong>1 AP (Interact)</strong> to let the shadows go — `
    + "they stay where they are dropped and keep dimming the light for the rest of the duration. "
    + "If anyone retrieves the cloak afterwards the spell ends abruptly; the GM ends it from the "
    + "Spellcasting panel.</em>";
}

/** What the card says once it has actually been dropped. */
export function lightShiftDroppedLine(spellName, targetName) {
  return `<strong>${targetName}</strong> lets the shadows fall. ${spellName} stays where it was `
    + "dropped and no longer follows anyone.";
}

/* ------------------------------------------------------------------ */
/* THE CIRCLE OWNS ITS ANCHOR (3.622.2; the 3.622.1 drive's F1,        */
/* Graham's R1 of 5 October 2026, "your recommendation")               */
/* ------------------------------------------------------------------ */

/*
 * WHY THE REGION, NOT THE EMANATION RECORD.
 *
 * The circle was handed to `recordEmanation`, which writes onto the cast's
 * active-spell entry — and the cast applies its effects BEFORE it registers
 * that entry, so every light circle met an empty registry, logged its error
 * and was never recorded. Fairy Fire's raise and Umbral Veil's shadow then
 * never followed anybody, a dismissal left them on the map, and Umbral
 * Veil's "let the shadows go" found nothing to drop. One entry also holds
 * one emanation, so a Fairy Fire outlining two creatures could only ever
 * have had one circle follow.
 *
 * So each circle carries its own creature, and is moved, dropped and ended
 * by what it carries: the anchor and the decoy on the Region, the clock in
 * the Region-expiry stamp every placed area already wears, and the cast id
 * the end of the spell sweeps for.
 */

/** The Region flag naming the token a circle follows (null once dropped). */
export const LIGHT_SHIFT_ANCHOR_FLAG = "lightShiftAnchor";
/** The Region flag saying the circle may be put down (Umbral Veil's decoy). */
export const LIGHT_SHIFT_DROPPABLE_FLAG = "lightShiftDroppable";

/** A token's centre in canvas pixels, from its document. */
export function tokenCentrePx(doc, gridSize) {
  const size = Number(gridSize) || 0;
  return {
    x: Number(doc?.x ?? 0) + (Number(doc?.width ?? 1) * size) / 2,
    y: Number(doc?.y ?? 0) + (Number(doc?.height ?? 1) * size) / 2
  };
}

/**
 * The Region updates that move every circle anchored to a token onto its
 * new centre. Plain data in, plain data out: `regions` are
 * `{id, flags, shapes}` as the documents hold them.
 */
export function anchoredShiftUpdates(regions = [], tokenId = "", centre = { x: 0, y: 0 }, systemId = "trg-prime") {
  if (!tokenId) return [];
  const out = [];
  for (const region of regions ?? []) {
    const flags = region?.flags?.[systemId] ?? {};
    if (!flags.lightShift || flags[LIGHT_SHIFT_ANCHOR_FLAG] !== tokenId) continue;
    const shape = region?.shapes?.[0];
    if (!shape || shape.type !== "circle") continue;
    if (Number(shape.x) === centre.x && Number(shape.y) === centre.y) continue;
    out.push({ _id: region.id, shapes: [{ ...shape, x: centre.x, y: centre.y }] });
  }
  return out;
}

/** The circles of one cast still following somebody and allowed to be put down. */
export function droppableCircles(regions = [], castId = "", systemId = "trg-prime") {
  if (!castId) return [];
  return (regions ?? []).filter((region) => {
    const flags = region?.flags?.[systemId] ?? {};
    return Boolean(flags.lightShift) && flags.castId === castId
      && flags[LIGHT_SHIFT_DROPPABLE_FLAG] === true && Boolean(flags[LIGHT_SHIFT_ANCHOR_FLAG]);
  });
}

/** The circles a cast drew — what the end of the spell removes. */
export function circlesOfCast(regions = [], castId = "", systemId = "trg-prime") {
  if (!castId) return [];
  return (regions ?? []).filter((region) => {
    const flags = region?.flags?.[systemId] ?? {};
    return Boolean(flags.lightShift) && flags.castId === castId;
  });
}
