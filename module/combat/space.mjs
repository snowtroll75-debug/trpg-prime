/**
 * Space, and moving through it (Chapter 7, pages 197–198) — the rules,
 * pure.
 *
 * NEW at 3.579.0, for the block-19 audit's D12, D15 and D16 and Graham's
 * rulings R12, R15 and R16 (21 September 2026).
 *
 * WHAT WAS WRONG. Nothing stopped a character walking through an enemy,
 * or ending their move standing inside one. Tiny and Diminutive creatures
 * had a reach of 5 feet and no way to share a square, so the page's "must
 * do so to make attacks against them" was unreachable. A prone creature's
 * square cost what any other square cost.
 *
 * THE PAGE, in its own words:
 *
 *   "You may move through the occupied space of a willing ally. However,
 *    when it comes to moving through an unwilling creature's space, you
 *    must make a Tumble (Acrobatics) check. … you cannot end your turn in
 *    a space already occupied by another creature."
 *
 *   "If a creature is prone and is your size or smaller, then you can
 *    occupy its space, such a space is treated as difficult terrain. It is
 *    more difficult to move through the space of a prone creature that is
 *    larger than you. Such spaces would be treated as Greater difficult
 *    terrain…"
 *
 *   "If a creature is at least three sizes larger than you, then you can
 *    freely move through its space. … this also works in reverse … You
 *    still cannot end your movement in the space of another creature
 *    unless you are Tiny or Diminutive."
 *
 *   "Up to four Tiny creatures can occupy the same space and up to eight
 *    Diminutive creatures."
 */

import { SIZE_TABLE } from "../config.mjs";

/** The size ladder, smallest first — the order the page counts steps in. */
const SIZE_ORDER = Object.freeze(Object.keys(SIZE_TABLE));

/** "at least three sizes larger" / "three sizes smaller". */
const FREE_PASSAGE_STEPS = 3;

/** Difficult terrain doubles the cost; formidable triples it. */
const DIFFICULT_MULTIPLIER = 2;
const FORMIDABLE_MULTIPLIER = 3;

/**
 * How many size steps apart two creatures are — positive when the first
 * is the larger.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function sizeSteps(a, b) {
  const ia = SIZE_ORDER.indexOf(String(a ?? "").toLowerCase());
  const ib = SIZE_ORDER.indexOf(String(b ?? "").toLowerCase());
  if (ia < 0 || ib < 0) return 0;
  return ia - ib;
}

/** Does this size share a square with other creatures (page 197)? */
function sharesSquare(size) {
  return Boolean(SIZE_TABLE[String(size ?? "").toLowerCase()]?.sharesSquare);
}

/**
 * How many of this size fit in one square: four Tiny, eight Diminutive,
 * one of everything else.
 *
 * @param {string} size
 * @returns {number}
 */
function squareCapacity(size) {
  return Math.max(1, Number(SIZE_TABLE[String(size ?? "").toLowerCase()]?.perSquare ?? 1));
}

/**
 * The reach the page gives this size — 0 for Tiny and Diminutive, which
 * is why they must be in the square to attack.
 *
 * @param {string} size
 * @returns {number}
 */
function sizeReach(size) {
  const entry = SIZE_TABLE[String(size ?? "").toLowerCase()];
  return entry ? Number(entry.reach) : 5;
}

/**
 * What it takes to move THROUGH a creature's square.
 *
 * @param {object} state
 * @param {string} state.moverSize
 * @param {string} state.occupantSize
 * @param {boolean} [state.ally] a willing ally — the page's free passage
 * @param {boolean} [state.prone] the occupant is prone
 * @param {boolean|string} [state.tumbled] a Tumble check has already been
 *   passed: "normal" for its critical ("treating its squares as normal
 *   movement"), anything else truthy for its success ("treating its
 *   squares as difficult terrain")
 * @returns {{allowed: boolean, needsTumble: boolean, multiplier: number, reason: string}}
 */
export function passageThrough({
  moverSize = "medium", occupantSize = "medium", ally = false, prone = false, tumbled = false, swarm = false
} = {}) {
  const steps = sizeSteps(occupantSize, moverSize);

  // A SWARM SHARES SPACE (3.632.2; Fiends & Fables 3.0 Chapter 3): "When a
  // swarm moves into or occupies an area occupied by another creature…" —
  // a mass of small creatures is not a body that blocks, and its attack IS
  // being in the space. `swarm` is true when either the mover or the
  // occupant is a Swarm.
  if (swarm) return { allowed: true, needsTumble: false, multiplier: 1, reason: "a swarm shares the space" };

  // "You may move through the occupied space of a willing ally." The
  // optional Perception rule beneath it ("Realistic Methodology") is the
  // GM's and stays at the table.
  if (ally) return { allowed: true, needsTumble: false, multiplier: 1, reason: "a willing ally" };

  // "If a creature is at least three sizes larger than you, then you can
  // freely move through its space… this also works in reverse."
  if (Math.abs(steps) >= FREE_PASSAGE_STEPS) {
    return {
      allowed: true, needsTumble: false, multiplier: 1,
      reason: `three or more sizes ${steps > 0 ? "larger" : "smaller"}`
    };
  }

  // "If a creature is prone and is your size or smaller… such a space is
  // treated as difficult terrain", and a larger prone creature's square
  // is "Greater difficult terrain".
  if (prone) {
    return steps > 0
      ? { allowed: true, needsTumble: false, multiplier: FORMIDABLE_MULTIPLIER,
        reason: "a prone creature larger than you — formidable terrain, and the GM may ask for a Climb check" }
      : { allowed: true, needsTumble: false, multiplier: DIFFICULT_MULTIPLIER,
        reason: "a prone creature your size or smaller — difficult terrain" };
  }

  // Everything else is the unwilling creature the Tumble check is for.
  if (tumbled) {
    return {
      allowed: true,
      needsTumble: false,
      multiplier: String(tumbled) === "normal" ? 1 : DIFFICULT_MULTIPLIER,
      reason: "Tumble"
    };
  }
  return {
    allowed: false, needsTumble: true, multiplier: 1,
    reason: "an unwilling creature's space — Tumble (Acrobatics) first"
  };
}

/**
 * May the mover END its movement in this square?
 *
 * "You still cannot end your movement in the space of another creature
 * unless you are Tiny or Diminutive" — and then only up to the square's
 * own capacity for that size.
 *
 * @param {object} state
 * @param {string} state.moverSize
 * @param {Array<{size: string}>} [state.occupants] who is already there,
 *   excluding the mover
 * @returns {{allowed: boolean, reason: string}}
 */
export function mayEndInSquare({ moverSize = "medium", occupants = [], moverIsSwarm = false } = {}) {
  // A Swarm ends in a creature's space, and a creature in a swarm's (3.632.2).
  const others = moverIsSwarm ? [] : Array.from(occupants ?? []).filter((o) => !o?.swarm);
  if (!others.length) return { allowed: true, reason: "" };
  if (!sharesSquare(moverSize)) {
    return { allowed: false, reason: "you cannot end your turn in a space another creature occupies" };
  }
  // The cap counts creatures of the mover's own size — "up to four Tiny
  // creatures can occupy the same space and up to eight Diminutive".
  const sameSize = others.filter(
    (o) => String(o?.size ?? "").toLowerCase() === String(moverSize).toLowerCase()).length;
  const capacity = squareCapacity(moverSize);
  if (sameSize + 1 > capacity) {
    return {
      allowed: false,
      reason: `only ${capacity} ${String(moverSize).toLowerCase()} creatures fit in one square`
    };
  }
  return { allowed: true, reason: "" };
}

/**
 * May this creature attack that one from where it stands?
 *
 * A reach of 0 means the attacker must be IN the target's square — page
 * 197's "must do so to make attacks against them". Everything with a
 * reach answers the ordinary way, and this function says so rather than
 * claiming the question is its own.
 *
 * @param {object} state
 * @param {string} state.attackerSize
 * @param {number} state.distanceFeet
 * @returns {{allowed: boolean, mustShareSquare: boolean}}
 */
export function meleeFromHere({ attackerSize = "medium", distanceFeet = 0 } = {}) {
  const reach = sizeReach(attackerSize);
  if (reach > 0) return { allowed: true, mustShareSquare: false };
  return { allowed: Number(distanceFeet) <= 0, mustShareSquare: true };
}
