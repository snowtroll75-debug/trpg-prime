/**
 * Open-ended roll chains (Core 3.1, Chapter 1, Glossary).
 *
 * d20: a 20 is re-rolled and added; a 1 is re-rolled and subtracted. In both
 * directions the chain continues for as long as a 20 is rolled. A 1 rolled on
 * anything other than the first die does not extend the chain.
 *
 * d100: the same proportion applies, so 96-100 extends upward and 01-05
 * extends downward, continuing while 96-100 is rolled.
 *
 * The die-drawing function is injected so this logic can be tested without
 * Foundry, and so the Foundry layer can supply real Roll objects for Dice So
 * Nice and the roll log.
 */

export const OPEN_ENDED = Object.freeze({
  NONE: "none",
  TOP: "top",
  BOTTOM: "bottom",
  BOTH: "both"
});

/** Chain configuration for the two die types used by TRG Prime. */
export const CHAIN_PROFILES = Object.freeze({
  d20: { faces: 20, high: 20, low: 1, chaosOnFollowUp: 1, chaosOnInitial: null },
  d100: { faces: 100, high: 96, low: 5, chaosOnFollowUp: null, chaosOnInitial: 66 }
});

/**
 * Roll an open-ended chain.
 *
 * @param {object} options
 * @param {() => Promise<number>|number} options.draw Returns the next die face.
 * @param {object} [options.profile] A CHAIN_PROFILES entry.
 * @param {string} [options.openEnded] One of the OPEN_ENDED values.
 * @param {number} [options.maxDice] Safety valve against a runaway chain.
 * @returns {Promise<{faces: number[], total: number, chaos: boolean,
 *   direction: number, exploded: boolean}>}
 */
export async function rollChain({
  draw,
  profile = CHAIN_PROFILES.d20,
  openEnded = OPEN_ENDED.BOTH,
  maxDice = 50
} = {}) {
  const allowTop =
    openEnded === OPEN_ENDED.BOTH || openEnded === OPEN_ENDED.TOP;
  const allowBottom =
    openEnded === OPEN_ENDED.BOTH || openEnded === OPEN_ENDED.BOTTOM;

  const first = Number(await draw());
  const faces = [first];

  let chaos = profile.chaosOnInitial !== null && first === profile.chaosOnInitial;

  let direction = 0;
  if (first >= profile.high && allowTop) direction = 1;
  else if (first <= profile.low && allowBottom) direction = -1;

  if (direction === 0) {
    return { faces, total: first, chaos, direction: 0, exploded: false };
  }

  let total = first;

  while (faces.length < maxDice) {
    const next = Number(await draw());
    faces.push(next);
    total += direction * next;

    if (profile.chaosOnFollowUp !== null && next === profile.chaosOnFollowUp) {
      chaos = true;
    }

    // The chain continues only while the top of the die keeps coming up.
    if (next < profile.high) break;
  }

  return { faces, total, chaos, direction, exploded: true };
}

/**
 * Fold a digit into 0-9, reading a d10's 10 as the zero it stands for.
 *
 * A d10 in Foundry returns 1-10, and every caller writes `% 10` to turn
 * that into a digit. Doing it here as well makes the fold idempotent and
 * a forgotten `% 10` harmless rather than catastrophic: a raw 10 in the
 * tens place would otherwise read as 100-and-something.
 */
function digit(face) {
  return ((Math.trunc(Number(face) || 0) % 10) + 10) % 10;
}

/**
 * THE ZERO RULE. The one place that turns two digits into a d100 value.
 *
 * ─────────────────────────────────────────────────────────────────────
 * Graham, 27 August 2026:
 *
 *   "When making a percentile roll a 0 rolled on the tens die is
 *    considered to be a 0 unless the units die is a 0 as well (in which
 *    case the combined total is always a 100)."
 *
 * So 0 and 7 is seven, not seventy-seven and not a hundred and seven —
 * the zero in the tens place means nothing at all. Only the pair 00 is
 * special, and it is 100.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A FUNCTION AND NOT A LINE.
 *
 * It WAS a line — `raw === 0 ? 100 : raw` — and correct. It was also
 * written out by hand in FOUR places: here, the Spell Fumble roll, the
 * Magical Resonance roll, and (inverted, and wrong) the path that
 * re-resolves a critical after Ambush or Sniping shifts it. Three of the
 * four agreed. That is the racial-PP hazard exactly: two copies of a
 * value agree right up until somebody edits one of them, and the moment
 * a rule gets STATED OUT LOUD is the moment somebody edits it.
 *
 * `value === 0 ? 100 : value` is short enough to look like it needs no
 * owner, which is precisely why it acquired three unowned copies.
 *
 * @param {number} tens 0-9 (a d10's 10 is folded to 0).
 * @param {number} unit 0-9.
 * @returns {number} 1-100, never 0.
 */
export function percentileValue(tens, unit) {
  const raw = digit(tens) * 10 + digit(unit);
  return raw === 0 ? 100 : raw;
}

/**
 * THE ZERO RULE, INVERTED: which two digits produce this value.
 *
 * The exact mirror of `percentileValue`, and it exists because the other
 * direction had a copy too. Ambush and Sniping let a player shift a
 * critical injury to a different row, and the shifted result is fed back
 * through the injury card as a forced value — which then has to be taken
 * apart into digits again, because `hitLocationFromUnitDie` reads the
 * units one to decide where the blow landed.
 *
 * That teardown was `Math.floor(forced / 10)`, which answers TEN for a
 * forced 100. A tens DIGIT of ten is not a thing; the card printed it.
 * The `% 10` here is the whole fix, and having one function means the
 * round trip can be checked rather than eyeballed.
 *
 * @param {number} value 1-100.
 * @returns {{tens: number, unit: number}}
 */
export function percentileDigits(value) {
  const v = Math.max(1, Math.min(100, Math.trunc(Number(value) || 0)));
  return { tens: Math.floor(v / 10) % 10, unit: v % 10 };
}

/**
 * Roll a TRG Prime percentile value from an explicit tens and units die.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ADVANTAGE ON A d100 REORDERS THE TWO DIGITS. IT DOES NOT ROLL AGAIN.
 *
 * Graham, 27 August 2026:
 *
 *   "A d100 roll at advantage chooses the highest die as tens (so a roll
 *    of 67 would be 76, a roll of 23 would be 32). A d100 roll at
 *    disadvantage chooses the lowest die as tens (so 87 would be 78, 91
 *    would be 19)."
 *
 * TWO DICE ARE ROLLED, ONCE, and the bias decides which of them stands
 * in the tens place. The other takes the units. Nothing extra is drawn.
 *
 * WHAT THIS REPLACED, and why it was wrong in a way that reads right.
 * The previous version drew a SECOND TENS DIE and kept the higher or
 * lower of the two, leaving the units die untouched — "select the more
 * favourable die as the tens digit" taken to mean a die rolled for the
 * purpose. That is the d20 habit (roll twice, keep one) wearing a d100's
 * clothes, and it is a different distribution: it can produce a tens
 * digit that was never part of the original roll, and it leaves the
 * units digit unaffected by the bias entirely.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE UNITS DIGIT MATTERS, WHICH IS WHY THIS IS NOT COSMETIC.
 *
 * `hitLocationFromUnitDie` reads the units die of a critical injury roll
 * to decide WHERE the blow landed. Under the correct rule the swap moves
 * a digit into the units place, so a deadly hit striking at advantage
 * lands somewhere different from the same dice read normally. The old
 * version could not do that at all: its units die never moved.
 *
 * A DOUBLE ZERO IS STILL 100, and neither bias can change it — there is
 * nothing to reorder when digits match, so the zero rule survives the
 * reordering untouched. It is worth saying what that means at the table:
 * advantage cannot help you REACH a hundred and disadvantage cannot
 * protect you from one, because the only pair that produces it is the
 * one pair no bias can rearrange. See `percentileValue` for the rule.
 *
 * @param {object} options
 * @param {() => Promise<number>|number} options.drawTen Returns 0-9.
 * @param {() => Promise<number>|number} options.drawUnit Returns 0-9.
 * @param {string} [options.bias] "normal", "advantage" or "disadvantage".
 * @returns {Promise<{value: number, tens: number, unit: number,
 *   drawn: number[], swapped: boolean}>}
 */
export async function rollPercentile({
  drawTen,
  drawUnit,
  bias = "normal"
} = {}) {
  // FOLDED BEFORE THE BIAS COMPARES THEM, not after. A d10's 10 is the
  // digit zero, and zero is the SMALLEST digit — but 10 is the largest
  // number. Comparing the raw faces would hand advantage a 10 as its
  // "highest" and produce a leading zero: the single worst tens digit
  // dressed up as the best. The fold has to happen before Math.max sees
  // them or the zero rule and the bias rule contradict each other.
  const first = digit(await drawTen());
  const second = digit(await drawUnit());

  let tens = first;
  let unit = second;
  if (bias === "advantage") {
    tens = Math.max(first, second);
    unit = Math.min(first, second);
  } else if (bias === "disadvantage") {
    tens = Math.min(first, second);
    unit = Math.max(first, second);
  }

  // THE ZERO RULE LIVES IN ONE PLACE, and this is not it.
  const value = percentileValue(tens, unit);

  return {
    value,
    tens,
    unit,
    // The pair as they were rolled, so a card can show the reordering
    // rather than only its result.
    drawn: [first, second],
    swapped: tens !== first
  };
}
