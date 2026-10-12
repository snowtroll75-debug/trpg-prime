/**
 * Flanking (Core 3.1, Chapter 7). Pure grid geometry; the Foundry workflow
 * converts token pixel positions to these integer grid coordinates.
 *
 * "Flanking occurs when two or more characters are positioned on opposite
 * sides of an enemy... To be considered flanking, the characters or
 * creatures must occupy squares that are adjacent to the enemy in a way
 * that forms a straight line. This line can be horizontal, vertical, or
 * diagonal." For a large-or-bigger target, "two or more characters must be
 * positioned on opposite sides of the creature... the flanking characters
 * must be adjacent to any of the squares occupied by the large creature."
 */

/**
 * Grid footprint side length by size category (Chapter 1's Size table: a
 * Large creature occupies 4 squares, Huge 9, Gargantuan 16, Colossal 25 —
 * i.e. an n x n footprint).
 */
export const SIZE_FOOTPRINT = Object.freeze({
  diminutive: 1,
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
  colossal: 5
});

/**
 * The squares a creature occupies, given the grid column/row of its
 * top-left square and its size.
 *
 * @param {{col: number, row: number, size?: string}} token
 * @returns {Array<{col: number, row: number}>}
 */
export function occupiedSquares({ col, row, size = "medium" }) {
  const span = SIZE_FOOTPRINT[size] ?? 1;
  const squares = [];
  for (let dc = 0; dc < span; dc++) {
    for (let dr = 0; dr < span; dr++) {
      squares.push({ col: col + dc, row: row + dr });
    }
  }
  return squares;
}

/**
 * Which side(s) of a target's bounding box a single attacking square is
 * adjacent from. A square can carry two flags at once (a corner square is
 * both, e.g., north and west), matching a diagonal approach.
 *
 * @param {{col: number, row: number}} square The attacker's square.
 * @param {Array<{col: number, row: number}>} targetSquares
 * @returns {{north: boolean, south: boolean, east: boolean, west: boolean,
 *   adjacent: boolean}|null} null if the square is not adjacent at all.
 */
export function sideFlags(square, targetSquares) {
  const cols = targetSquares.map((s) => s.col);
  const rows = targetSquares.map((s) => s.row);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);

  const inside =
    square.col >= minCol &&
    square.col <= maxCol &&
    square.row >= minRow &&
    square.row <= maxRow;
  if (inside) return null;

  const withinColBand = square.col >= minCol - 1 && square.col <= maxCol + 1;
  const withinRowBand = square.row >= minRow - 1 && square.row <= maxRow + 1;
  if (!withinColBand || !withinRowBand) return null;

  const north = square.row < minRow;
  const south = square.row > maxRow;
  const west = square.col < minCol;
  const east = square.col > maxCol;

  return { north, south, east, west, adjacent: true };
}

/** Each side-flag combination reduces to one of eight discrete octants. */
function octantFromFlags(flags) {
  if (!flags?.adjacent) return null;
  const vertical = flags.north ? "N" : flags.south ? "S" : "";
  const horizontal = flags.east ? "E" : flags.west ? "W" : "";
  const octant = `${vertical}${horizontal}`;
  return octant || null;
}

/** Opposite pairs for the eight octants — exact opposition only, so a
 * north-west attacker and a north-east ally (both broadly "north" but on
 * different corners) do not flank one another. */
const OPPOSITE_OCTANT = Object.freeze({
  N: "S",
  S: "N",
  E: "W",
  W: "E",
  NE: "SW",
  SW: "NE",
  NW: "SE",
  SE: "NW"
});

/**
 * Are two attackers flanking a target? Both must be adjacent, and one's
 * octant must be the exact opposite of the other's — which for a
 * single-square target is the eight-direction check the rulebook
 * describes, and for a larger target follows the same "opposite sides"
 * wording (a west-side attacker opposes an east-side ally regardless of
 * which row of that side each occupies).
 *
 * @param {{col: number, row: number}} attacker
 * @param {{col: number, row: number}} ally
 * @param {Array<{col: number, row: number}>} targetSquares
 * @returns {boolean}
 */
export function isFlanking(attacker, ally, targetSquares) {
  const attackerOctant = octantFromFlags(sideFlags(attacker, targetSquares));
  const allyOctant = octantFromFlags(sideFlags(ally, targetSquares));
  if (!attackerOctant || !allyOctant) return false;

  return OPPOSITE_OCTANT[attackerOctant] === allyOctant;
}

/**
 * Check every ally against a target for a flank, returning the first
 * qualifying pair (the +2 bonus does not stack beyond one flank).
 *
 * @param {{col: number, row: number}} attacker
 * @param {Array<{col: number, row: number, id: string}>} allies
 * @param {Array<{col: number, row: number}>} targetSquares
 * @returns {{flanking: boolean, allyId: string|null}}
 */
export function findFlankingAlly(attacker, allies, targetSquares) {
  for (const ally of allies) {
    if (isFlanking(attacker, ally, targetSquares)) {
      return { flanking: true, allyId: ally.id };
    }
  }
  return { flanking: false, allyId: null };
}

/** The flanking circumstance bonus to the attack roll. */
export const FLANKING_BONUS = 2;

/**
 * Conditions that stop a creature acting at all, and so stop it
 * threatening anything.
 *
 * `turn-economy.mjs` owns the general question of who may act; this is
 * the same list narrowed to the ones that make a melee attack
 * impossible, which is what page 200's "capable of making melee attacks
 * against that enemy" asks.
 */
const CANNOT_THREATEN = Object.freeze([
  "unconscious", "dying", "dead", "paralyzed", "petrified", "stunned", "restrained"
]);

/**
 * Conditions that mean the creature is not fighting THIS enemy: page
 * 200's "threatening the same enemy" fails for a creature that is
 * running away or lashing out at random.
 */
const NOT_FIGHTING_THIS_ENEMY = Object.freeze(["confused", "fleeing"]);

/**
 * Is this ally actually threatening the target (page 200)?
 *
 * "The flanking characters must also be threatening the same enemy,
 * meaning they are capable of making melee attacks against that enemy."
 *
 * NEW at 3.579.0 (the block-19 audit's D14; Graham's R14 of 21 September
 * 2026: all four checked). Until now any token of the right disposition
 * standing in the right square granted the flank — an unconscious ally,
 * an ally fifteen feet away behind the target, or an ally who had fled.
 *
 * @param {object} state
 * @param {string[]} [state.conditions] the ally's active conditions
 * @param {number} [state.reachFeet] the ally's own reach
 * @param {number|null} [state.distanceFeet] ally to target; null when it
 *   could not be measured, which is not a reason to refuse the flank
 * @param {boolean} [state.canStrike] whether it has any melee attack —
 *   a wielded melee weapon, or an unarmed strike
 * @returns {{threatens: boolean, reason: string}}
 */
export function allyThreatens({
  conditions = [], reachFeet = 5, distanceFeet = null, canStrike = true
} = {}) {
  const active = new Set(Array.from(conditions ?? []).map((c) => String(c)));
  const blocked = CANNOT_THREATEN.find((c) => active.has(c));
  if (blocked) return { threatens: false, reason: `is ${blocked}` };
  const astray = NOT_FIGHTING_THIS_ENEMY.find((c) => active.has(c));
  if (astray) return { threatens: false, reason: `is ${astray}` };
  if (!canStrike) return { threatens: false, reason: "has no melee attack" };
  // A reach of 0 (Tiny, Diminutive) threatens only the square it is in,
  // which is what page 197 says and what `sizeReach` already answers.
  if (distanceFeet !== null && Number(distanceFeet) > Math.max(0, Number(reachFeet) || 0)) {
    return { threatens: false, reason: "is out of its own reach of the target" };
  }
  return { threatens: true, reason: "" };
}
