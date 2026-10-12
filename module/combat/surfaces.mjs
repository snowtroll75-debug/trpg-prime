/**
 * Unusual surfaces (Chapter 7, page 196) — the rules, pure.
 *
 * NEW at 3.579.0, for the block-19 audit's D17 and Graham's R17 of
 * 21 September 2026.
 *
 * THE PAGE:
 *
 *   "Various surface types may require you to make a skill check when
 *    traversing them. Narrow surfaces or uneven ground may require a
 *    Balance (Acrobatics) check to maintain stability and prevent you
 *    from falling. Furthermore, if you are struck by an attack while on
 *    such a surface, the GM may require you to make a similar check to
 *    avoid losing your footing.
 *
 *    Whilst moving on any unusual surface, you are flat-footed."
 *
 * WHAT WAS WRONG. Balance existed as an action with that sentence in its
 * own description, and nothing applied the condition, prompted the check
 * or offered the one on being struck — because nothing in the system
 * could say that a patch of ground WAS an unusual surface.
 *
 * HOW A SURFACE IS DECLARED. A Foundry Region carrying
 * `flags.trg-prime.unusualSurface`, which is where difficult ground
 * already lives, so a GM marks one the same way they mark the other. A
 * Region merely NAMED for it counts too, because a GM who has drawn one
 * and called it "Icy ledge (unusual surface)" has said what they mean.
 *
 * THE DC IS THE GM'S. The page gives none — "may require a Balance
 * check" — so a surface that declares one is used and a surface that does
 * not leaves the number to the dialog, exactly as an untyped skill check
 * already does.
 */

/** The flag a Region carries. */
const UNUSUAL_SURFACE_FLAG = "unusualSurface";

/** A Region whose name says so, for a GM who typed rather than flagged. */
const NAMED = /\bunusual surface\b/i;

/**
 * Is this point inside that Region?
 *
 * THE DOCUMENT ANSWERS, AND IT ANSWERS WRONG (3.579.1, F4). Driving
 * 3.579.0 found `RegionDocument#testPoint` returning FALSE for a point
 * plainly inside the shape, while the PLACEABLE's `testPoint` returned
 * true. The first version asked the document and fell back to the
 * placeable with `??` — which never fires, because `false` is not
 * nullish, so no surface was ever detected and the whole rule was inert.
 *
 * The placeable is asked FIRST, and the document only when there is no
 * placeable (a Region on a scene that is not on screen).
 *
 * @param {object} region a RegionDocument
 * @param {{x: number, y: number}} point
 * @returns {boolean}
 */
export function regionContains(region, point) {
  try {
    const placeable = region?.object ?? null;
    if (typeof placeable?.testPoint === "function") return Boolean(placeable.testPoint(point));
    if (typeof region?.testPoint === "function") return Boolean(region.testPoint(point));
    return false;
  } catch {
    return false;
  }
}

/**
 * The unusual surfaces this creature is standing on.
 *
 * FOUNDRY ALREADY KNOWS. A Region keeps the set of TokenDocuments inside
 * it, maintained by the engine as tokens move, so for "where is this
 * creature standing" there is nothing to measure — and the geometry that
 * F4 got wrong is not consulted at all. The point test stays as the
 * fallback for a token the engine has not indexed yet.
 *
 * @param {object} scene
 * @param {object} tokenDocument
 * @param {{x: number, y: number}} [centre] its centre, for the fallback
 * @returns {object[]} the surfaces, from `unusualSurfaceOf`
 */
export function surfacesUnder(scene, tokenDocument, centre = null) {
  const out = [];
  for (const region of Array.from(scene?.regions ?? [])) {
    const spec = unusualSurfaceOf(region);
    if (!spec) continue;
    const inside = region.tokens?.has?.(tokenDocument)
      ?? (centre ? regionContains(region, centre) : false);
    if (inside) out.push(spec);
  }
  return out;
}

/**
 * The surface a Region declares, or null.
 *
 * @param {object} region a RegionDocument, or anything with name and flags
 * @returns {{label: string, dc: number|null, note: string}|null}
 */
export function unusualSurfaceOf(region) {
  if (!region) return null;
  const raw = region?.flags?.["trg-prime"]?.[UNUSUAL_SURFACE_FLAG] ?? null;
  const named = NAMED.test(String(region?.name ?? ""));
  if (!raw && !named) return null;
  const spec = raw && typeof raw === "object" ? raw : {};
  const dc = Number(spec.dc);
  return {
    label: String(spec.label ?? region?.name ?? "").trim() || "an unusual surface",
    dc: Number.isFinite(dc) && dc > 0 ? Math.trunc(dc) : null,
    // "Narrow surfaces or uneven ground" — which of the two, for the card.
    note: String(spec.note ?? "").trim()
  };
}

/**
 * What moving onto this surface does (page 196).
 *
 * @param {Array<object>} surfaces the surfaces the path touches
 * @param {boolean} [moved] whether the creature actually moved
 * @returns {{flatFooted: boolean, balance: boolean, labels: string[], dc: number|null}}
 */
export function surfaceMovementEffect(surfaces, moved = true) {
  const list = Array.from(surfaces ?? []).filter(Boolean);
  if (!list.length || !moved) {
    return { flatFooted: false, balance: false, labels: [], dc: null };
  }
  // THE HARDEST ONE DECIDES. A path across a narrow ledge and a patch of
  // scree asks for the check the ledge asks for; a surface with no DC
  // leaves the number to the dialog, and never overrides one that has it.
  const dcs = list.map((s) => Number(s.dc)).filter((n) => Number.isFinite(n) && n > 0);
  return {
    flatFooted: true,
    balance: true,
    labels: list.map((s) => String(s.label)),
    dc: dcs.length ? Math.max(...dcs) : null
  };
}

/**
 * "If you are struck by an attack while on such a surface, the GM may
 * require you to make a similar check to avoid losing your footing."
 *
 * OFFERED, NOT ROLLED. "May require" is the GM's word, so the defender's
 * card carries the sentence and the check is theirs to call for.
 *
 * @param {object} state
 * @param {string} state.defenderName
 * @param {string[]} [state.labels] the surfaces they are standing on
 * @param {number|null} [state.dc]
 * @returns {string} the card's sentence, or ""
 */
export function struckOnSurfaceNote({ defenderName = "", labels = [], dc = null } = {}) {
  const list = Array.from(labels ?? []).filter(Boolean);
  if (!defenderName || !list.length) return "";
  return `<strong>${defenderName} is on ${list.join(" and ")}.</strong> Page 196: the GM may call `
    + `for a Balance (Acrobatics) check${dc ? ` (DC ${dc})` : ""} to avoid losing their footing.`;
}
