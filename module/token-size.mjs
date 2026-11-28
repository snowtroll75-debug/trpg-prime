/**
 * A TOKEN IS THE SIZE ITS CREATURE IS (3.720.0).
 *
 * Reported by Graham, 28 November 2026: "there seems to be no link between
 * the Size characteristic of the actor and its token size. This affects a
 * number of things such as starting character size and changes if a
 * temporary effect changes an actors size (such as size alteration)."
 *
 * His table, which is the whole rule — a token's width, height and depth
 * (Foundry 14's X, Y and Z size, in grid squares) by the creature's Size:
 *
 *   Diminutive 0.4 · Tiny 0.6 · Small 0.8 · Medium 1
 *   Large 2 · Huge 3 · Gargantuan 4 · Colossal 5
 *
 * THIS IS THE DRAWING, NOT THE SPACE. A Small creature still occupies its
 * one square, and a Tiny one still shares a square (config.mjs's
 * SIZE_TABLE, flanking.mjs's SIZE_FOOTPRINT): those are whole squares and
 * every distance, reach and flanking measure goes on reading them. The
 * three sizes under Medium are drawn smaller inside the square they stand
 * in, and nothing more.
 *
 * Pure: no Foundry globals, so the harness runs every row.
 */

/** Grid squares a side (width, height and depth alike) by Size. Graham's table. */
const TOKEN_SIZE_SIDE = Object.freeze({
  diminutive: 0.4,
  tiny: 0.6,
  small: 0.8,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
  colossal: 5
});

/**
 * The side a creature of this Size is drawn at, or null for a Size the
 * table does not have — a blank or hand-typed value is left alone rather
 * than coerced to Medium.
 * @param {string} size a value from `system.identity.size`
 * @returns {number|null}
 */
export function tokenSideForSize(size) {
  const key = String(size ?? "").trim().toLowerCase();
  return Object.hasOwn(TOKEN_SIZE_SIDE, key) ? TOKEN_SIZE_SIDE[key] : null;
}

const same = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

/**
 * What to write to a token (or a prototype token) so that it is this
 * Size: only the dimensions that differ, or null when it already is.
 * @param {{width?: number, height?: number, depth?: number}} current
 * @param {string} size
 * @returns {{width?: number, height?: number, depth?: number}|null}
 */
export function tokenSizePatch(current, size) {
  const side = tokenSideForSize(size);
  if (side === null) return null;
  const patch = {};
  for (const key of ["width", "height", "depth"]) {
    if (!same(current?.[key], side)) patch[key] = side;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * Does this actor's token follow its Size? Creatures do. A party has no
 * Size; a vehicle and a peril (a trap or a haunt) are drawn to their own
 * plan, which their Size field does not describe.
 * @param {{type?: string}} actor
 * @param {{vehicle?: boolean, peril?: boolean}} [kind]
 */
export function tokenFollowsSize(actor, { vehicle = false, peril = false } = {}) {
  if (!actor || vehicle || peril) return false;
  return ["character", "npc", "companion", "familiar"].includes(String(actor.type ?? ""));
}

/**
 * The grid column (or row) a token stands in, from its left (or top) edge.
 *
 * A token a square or more across sits on the grid lines, and rounding its
 * edge finds its first square — as geometry.mjs always did. A token UNDER a
 * square does not: Foundry snaps a 0.4 or 0.6 token to quarter squares, so a
 * Tiny creature may stand with its edge half-way across the square it is
 * in, and rounding that edge names the square NEXT to it. Its centre is
 * the honest answer.
 * @param {number} edge the token's x or y, in pixels
 * @param {number} side its width or height, in grid squares
 * @param {number} grid pixels a square
 */
export function tokenOriginSquare(edge, side, grid) {
  const g = Number(grid) > 0 ? Number(grid) : 100;
  const s = Number(side) > 0 ? Number(side) : 1;
  const at = Number(edge) || 0;
  if (s >= 1) return Math.round(at / g);
  return Math.floor((at + (s * g) / 2) / g + 1e-9);
}

/**
 * Where a token that is no longer under a square stands once it has grown.
 * A Tiny token at a quarter square would otherwise be left there at Medium,
 * straddling two squares; it takes the square its centre was in. Null when
 * there is nothing to move: it was already a square or more across, it is
 * still drawn at 0.4 or 0.6 (which keep their quarter squares), or it was
 * already on the grid lines.
 * @param {{x: number, y: number, width: number, height: number}} token
 * @param {number} side the side it is becoming
 * @param {number} grid pixels a square
 * @returns {{x: number, y: number}|null}
 */
export function regrownPosition(token, side, grid) {
  const g = Number(grid) > 0 ? Number(grid) : 0;
  if (!g || !(Number(side) >= 0.8)) return null;
  const w = Number(token?.width) || 1;
  const h = Number(token?.height) || 1;
  if (w >= 1 && h >= 1) return null;
  const x = tokenOriginSquare(token.x, w, g) * g;
  const y = tokenOriginSquare(token.y, h, g) * g;
  return same(x, token.x) && same(y, token.y) ? null : { x, y };
}
