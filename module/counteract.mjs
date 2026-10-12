/**
 * Counteraction (Core 3.1, Chapter 8). Pure logic; the Foundry workflow in
 * counteract-workflow.mjs rolls the actual opposed check.
 *
 * "Make an opposed check against the DC of the ability or effect that you
 * are attempting to counteract... The check is modified by +/-2 for each
 * level or PP difference between your counteract action and that of the
 * effect you are attempting to remove." The worked example: an 8 PP
 * counteract attempt against a 10 PP effect is 2 PP short, for a -4
 * penalty (2 x -2).
 *
 * Open question, recorded as an amendment rather than guessed: the
 * rulebook doesn't state what the target DC equals in every case (an
 * effect's own casting DC, its Save DC, or a GM-set number) — the workflow
 * therefore takes that DC as an input rather than deriving it.
 */

/**
 * @param {number} actingValue Your counteract action's level or PP.
 * @param {number} targetValue The effect's level or PP.
 * @returns {number} The circumstance modifier — positive when you exceed
 *   the effect, negative when you fall short.
 */
export function counteractModifier(actingValue, targetValue) {
  return (Number(actingValue || 0) - Number(targetValue || 0)) * 2;
}
