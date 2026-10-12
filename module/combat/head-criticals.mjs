/**
 * Which critical injury results strike the head.
 *
 * WHY THIS FILE EXISTS AT ALL. Vorpal says "the result of the injury is
 * always increased to the next available head result", and the injury
 * tables carry no such flag: every row is a `min`, a `max`, a
 * persistence code and a sentence of English. So the first question
 * about Vorpal was not how to build it but whether the data could answer
 * it, and the first attempt — grepping the row text for "head", "face",
 * "eye" — got two rows wrong in the slashing table alone. It flagged
 * 64-66, where the blood spurts in the ATTACKER's face, and missed
 * 90, which drives a weapon through the target's mouth.
 *
 * THE ANSWER IS STRUCTURAL, NOT TEXTUAL. Every one of the fourteen
 * tables has forty-six rows, and every multiple of ten from 20 to 100 is
 * its own single-value row. Read them and they are all head results:
 *
 *   slashing      face · a shave · ear · throat · nose · throat · eye ·
 *                 mouth · decapitation
 *   bludgeoning   head · head · head · teeth · eye · head · head ·
 *                 nose · skull
 *   piercing      forehead · ears · eye · cheek · head · face · eye ·
 *                 cheek · eye into brain
 *
 * That is why the rune's own last line reads "(effectively +10 to the
 * injury result)" — the head results are exactly ten apart, so moving to
 * the next one from a head result is always +10. The parenthesis is the
 * book telling us the spacing, and it is the check that this reading is
 * right.
 *
 * THE BOOK'S OWN WORKED EXAMPLES ARE THE OTHER CHECK. A Balor's minor
 * critical rolls 78 and the page says the result "is modified to the
 * nearest head critical which is 80" — 80 is on this list and 79 is not.
 *
 * Pure arithmetic, no table lookup: the list is a property of every
 * table's shape, and `verify-codex-runes` asserts that shape against all
 * fourteen of them rather than trusting this comment.
 */

/** The head results, on every critical injury table. */
export const HEAD_RESULTS = Object.freeze([20, 30, 40, 50, 60, 70, 80, 90, 100]);

/** The gap between them, which is why Vorpal reads as "+10". */
export const HEAD_RESULT_SPACING = 10;

/**
 * The next head result at or above a roll — or strictly above it, when
 * the roll already strikes the head.
 *
 * "Be aware that if the result of your initial injury check strikes the
 * head, your result is still increased to the NEXT head critical injury
 * result (effectively +10 to the injury result)." So a roll that is
 * already a head result moves on; one that is not is lifted to the first
 * head result it reaches.
 *
 * A roll at or past the top of the table stays at 100. There is no
 * eleventh head result, and inventing one would be inventing a row.
 *
 * @param {number} roll
 * @param {boolean} [strictlyAbove] true when the roll itself is a head result
 */
export function nextHeadResult(roll, strictlyAbove = false) {
  const value = Math.trunc(Number(roll) || 0);
  const found = HEAD_RESULTS.find(
    (head) => (strictlyAbove ? head > value : head >= value));
  return found ?? HEAD_RESULTS[HEAD_RESULTS.length - 1];
}

/** Does this roll strike the head? */
export function isHeadResult(roll) {
  return HEAD_RESULTS.includes(Math.trunc(Number(roll) || 0));
}
