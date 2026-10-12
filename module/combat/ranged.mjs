/**
 * Ranged attacks (Core 3.1, Chapter 7 — Ranged Attacks). Pure logic; the
 * Foundry workflow in attack-workflow.mjs supplies distances and targets
 * measured from the canvas.
 */

/**
 * Range increment penalty. "If your target is at or within the listed
 * range increment... you take no penalty. If you're attacking beyond that
 * range increment, you take a -4 penalty for each additional increment
 * beyond the first. You can attempt to attack... up to six range
 * increments away."
 *
 * FAR THROW LENGTHENS ONLY THE FIRST BAND (3.357.0), which is why it is
 * an option here rather than something folded into `increment` before the
 * call. Archer's Range and Far Shot lengthen EVERY increment, so they can
 * be added to the increment itself and the bands counted normally; "you
 * increase your FIRST range increment by 10 feet" cannot be, and adding
 * it in anyway would hand a thrown weapon sixty extra feet of maximum
 * range instead of ten extra feet of no-penalty range.
 *
 * @param {number} distance Feet to the target.
 * @param {number} increment The weapon's range increment, in feet.
 * @param {{firstIncrementBonus?: number}} [options]
 * @returns {{increments: number, penalty: number, outOfRange: boolean}}
 */
export function rangeIncrementPenalty(distance, increment, { firstIncrementBonus = 0 } = {}) {
  const inc = Math.max(1, Math.floor(Number(increment) || 0));
  const dist = Math.max(0, Number(distance) || 0);
  const firstBand = inc + Math.max(0, Math.floor(Number(firstIncrementBonus) || 0));

  const increments = dist <= firstBand
    ? 1
    : 1 + Math.ceil((dist - firstBand) / inc);
  const outOfRange = increments > 6;
  const penalty = outOfRange ? null : -4 * (increments - 1);

  return { increments, penalty, outOfRange };
}

/**
 * Whether a target at `distance` sits within a ranged weapon's *first*
 * range increment — the "at or within the listed range increment" window.
 * Sniping's trigger ("a critical with a ranged weapon within its first
 * range increment") and Penetrating both hinge on exactly this, so the
 * comparison lives in one place rather than being re-spelled per caller.
 *
 * Distance unknown, non-ranged (no increment), or a non-positive
 * increment all read as *not* within it — there is no first increment to
 * be inside of.
 *
 * @param {number|null} distance Feet to the target; null/undefined if unknown.
 * @param {number} increment The weapon's range increment, in feet.
 * @returns {boolean}
 */
export function withinFirstRangeIncrement(distance, increment) {
  const inc = Number(increment) || 0;
  if (distance === null || distance === undefined || inc <= 0) return false;
  return Number(distance) <= inc;
}

/** "Engaged characters suffer a -4 penalty to all their ranged attack rolls." */
export const ENGAGED_RANGED_PENALTY = -4;

/** The Cover Table (Chapter 7): bonus to DB/Reflex/Stealth, and whether Hide is available. */
export const COVER_TYPES = Object.freeze({
  none: { label: "None", bonus: 0, canHide: false },
  lesser: { label: "Lesser Cover", bonus: 2, canHide: false },
  standard: { label: "Standard Cover", bonus: 4, canHide: true },
  greater: { label: "Greater Cover", bonus: 8, canHide: true }
});

/**
 * The table's Can Hide column (page 198): "a creature with standard or
 * greater cover can attempt to use Stealth to Hide, but lesser cover
 * isn't insufficient for this action" — the double negative is E7 of the
 * block-19 errata; it means lesser cover is not sufficient.
 *
 * NEW at 3.579.0 (D4, R4): the column had never been read, so a creature
 * with no cover at all could Hide as freely as one behind a wall.
 *
 * @param {string} coverKey none, lesser, standard or greater
 * @returns {boolean}
 */
export function coverAllowsHide(coverKey) {
  return Boolean(COVER_TYPES[String(coverKey ?? "").trim().toLowerCase()]?.canHide);
}

/** "Firing into melee... standard cover (+4 circumstance DB)." */
export const FIRING_INTO_MELEE_COVER = "standard";

/**
 * Resolve a stray shot: a ranged attack into melee that misses its target
 * by 1-4. With one other combatant present, that combatant is hit
 * (no critical injury possible). With several, each rolls a d20 and the
 * lowest is struck. The rulebook does not adjudicate ties between equally
 * low rolls, so — matching the coin-flip precedent used for initiative
 * ties — the caller supplies a tiebreak value to resolve them fairly
 * rather than always favouring whichever candidate was listed first.
 *
 * @param {object} options
 * @param {number} options.missBy DC minus the attack total (must be 1-4 to
 *   trigger; the caller checks this before calling).
 * @param {string[]} options.candidateIds Other combatants in the melee,
 *   excluding the original target.
 * @param {number[]} [options.rolls] Pre-rolled d20s, one per candidate, in
 *   the same order (supplied by the caller so this stays pure/testable).
 * @param {number} [options.tiebreak] 0-1 value used to pick fairly among
 *   candidates tied for lowest.
 * @returns {{struck: boolean, targetId: string|null, tie: boolean}}
 */
export function resolveStrayShot({ missBy, candidateIds, rolls = [], tiebreak = 0 }) {
  const inWindow = Number(missBy) >= 1 && Number(missBy) <= 4;
  if (!inWindow || !candidateIds?.length) {
    return { struck: false, targetId: null, tie: false };
  }

  if (candidateIds.length === 1) {
    return { struck: true, targetId: candidateIds[0], tie: false };
  }

  const lowest = Math.min(...rolls.slice(0, candidateIds.length));
  const tiedIndices = [];
  rolls.slice(0, candidateIds.length).forEach((roll, index) => {
    if (roll === lowest) tiedIndices.push(index);
  });

  const tie = tiedIndices.length > 1;
  const pick = tiedIndices[
    Math.min(tiedIndices.length - 1, Math.floor(tiebreak * tiedIndices.length))
  ];

  return { struck: true, targetId: candidateIds[pick], tie };
}
