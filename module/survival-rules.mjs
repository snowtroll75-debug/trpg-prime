/**
 * SURVIVAL (Chapter 4, page 95) — Cover Tracks and Gather Herbs. Pure;
 * no Foundry.
 *
 * NEW at 3.565.0. Track was already built (its full-Speed difficulty
 * step, and Experienced Tracker's exception to it) and Survey Wildlife
 * was fully built and feat-gated. These two were description text and
 * nothing else.
 */

/* ------------------------------------------------------------------ *
 * COVER TRACKS                                                        *
 * ------------------------------------------------------------------ */

/**
 * "Covering your tracks and those of a small group is relatively easy
 * but for each characters' tracks that you are hiding beyond the first
 * four characters you take a -2-circumstance penalty to your Tracking
 * DC."
 */
const COVER_TRACKS_FREE_CHARACTERS = 4;
const COVER_TRACKS_PENALTY_PER_EXTRA = -2;

/**
 * The penalty to the party's Tracking DC for its size.
 *
 * IT IS A PENALTY TO A DC, NOT TO A ROLL, and the direction is the part
 * worth being careful about: this LOWERS the number a pursuer must beat,
 * so a big party is easier to follow. Reading it as a penalty to the
 * Cover Tracks check would have made a large party harder to track the
 * moment the check succeeded, which is backwards.
 *
 * FOUR IS FREE. "Beyond the first four characters" — a party of four
 * takes nothing, a party of five takes -2. Off-by-one here is the whole
 * rule, so the harness pins 4 and 5 rather than only a large number.
 *
 * @param {number} characters how many characters' tracks are hidden
 * @returns {number} zero or negative
 */
export function coverTracksPenalty(characters) {
  const count = Math.max(0, Math.trunc(Number(characters) || 0));
  const extra = Math.max(0, count - COVER_TRACKS_FREE_CHARACTERS);
  return extra * COVER_TRACKS_PENALTY_PER_EXTRA;
}

/* ------------------------------------------------------------------ *
 * GATHER HERBS                                                        *
 * ------------------------------------------------------------------ */

/**
 * "If you have 5 ranks in Survival, you can search for two different
 * types of herbs at once, and for each additional 5 ranks you have in
 * this skill, you can search for one additional herb, to a maximum of 5
 * herbs at once if you have 20 ranks."
 *
 * ONE HERB IS THE FLOOR, not zero: the paragraph before it says "you
 * must declare which herb you are looking for", so everybody gets one.
 * The ladder is 5 → 2, 10 → 3, 15 → 4, 20 → 5, which is exactly
 * `1 + floor(ranks / 5)` capped at 5 — and the book's own "maximum of 5
 * herbs at once if you have 20 ranks" is what that cap is, so a 25-rank
 * character (impossible today, but the cap is printed) still gets 5.
 *
 * @param {number} ranks Survival ranks
 * @returns {number} 1 to 5
 */
export function herbsAtOnce(ranks) {
  const held = Math.max(0, Math.trunc(Number(ranks) || 0));
  return Math.min(MAX_HERBS_AT_ONCE, 1 + Math.floor(held / RANKS_PER_EXTRA_HERB));
}

const RANKS_PER_EXTRA_HERB = 5;
const MAX_HERBS_AT_ONCE = 5;

/** Yields by degree: "Critical 4 … Success 2 … Partial 1 … Failure nothing." */
const HERB_YIELD = Object.freeze({ heroic: 4, critical: 4, success: 2, partial: 1 });

/**
 * Yields of one herb, for a degree.
 *
 * A HEROIC MATCHES THE CRITICAL rather than falling through to nothing.
 * The printed ladder stops at Critical, and the Actions Resolution Table
 * says a Heroic "is treated as a CRITICAL with extra benefit" — the same
 * rule `basicActionConditionEffects` cascades for its conditions, and
 * the same bug ("rolling better made things worse") that cost this
 * project a live test at 3.402.0.
 *
 * "Spending 8 hours doing nothing but gathering herbs from the area
 * grants 1 additional yield of each herb you're gathering" — the sole
 * activity bonus, which is why this takes it rather than the caller
 * adding one afterwards and forgetting on the failure branch. A failure
 * yields nothing, and nothing plus a bonus is still nothing.
 *
 * @param {string} degree
 * @param {boolean} soleActivity
 * @returns {number}
 */
export function herbYield(degree, soleActivity = false) {
  const base = HERB_YIELD[String(degree ?? "")] ?? 0;
  if (!base) return 0;
  return base + (soleActivity ? 1 : 0);
}

/** "A single yield of herb weighs 1/10 of a pound unless otherwise noted." */
const HERB_YIELD_WEIGHT = 0.1;

/**
 * What a number of yields weighs, in pounds.
 *
 * A FUNCTION RATHER THAN THE BARE CONSTANT, so the card cannot carry its
 * own `* 0.1` — which is what it did in the first draft, and which is a
 * second copy of a printed number living somewhere nobody would look for
 * it. `toFixed` is the caller's business; the arithmetic is this one's.
 *
 * @param {number} yields
 * @returns {number} pounds
 */
export function herbYieldWeight(yields) {
  return Math.max(0, Math.trunc(Number(yields) || 0)) * HERB_YIELD_WEIGHT;
}
