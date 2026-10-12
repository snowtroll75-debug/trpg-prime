/**
 * QUESTIONABLE SOURCE — General feat, Chapter 5, page 133.
 *
 *   "You possess a wealth of knowledge, although not all of it originates
 *    from reputable or reliable sources."
 *
 *   "When you make a Recall Knowledge check (using any skill), you always
 *    gain a piece of information about the target of your check that is
 *    true (although not necessarily useful)."
 *
 * ALWAYS MEANS ALWAYS, INCLUDING A FUMBLE. Graham ruled this on 18
 * September 2026, asked directly, because the word is the whole feat and
 * a softer reading would have left it doing nothing a character would
 * notice. Recall Knowledge's printed Fumble is "You recall incorrect
 * information, or gain an erroneous or misleading clue" — with this feat
 * the misinformation still lands AND one true thing comes with it. That
 * is a strong feat, and it is what the sentence says.
 *
 * WHY THE NOTE IS SILENT ON A SUCCESS. Above a failure the guarantee is
 * already met: Recall Knowledge's own Success and Critical hand over
 * accurate knowledge, so printing "and one of these is true" beside them
 * would be noise on every card for no change in play. The feat is a
 * FLOOR, and this module prints where the floor is doing work. The
 * degrees are read from the shared ladder rather than listed here, so a
 * new degree cannot quietly fall through.
 */

import { DEGREE_BY_KEY } from "./dice/resolution.mjs";

/** The feat's name, as the compendium spells it. */
export const QUESTIONABLE_SOURCE_NAME = "Questionable Source";

/** The action this feat rides. */
export const QUESTIONABLE_SOURCE_ACTION = "recallKnowledge";

/** Does this actor carry the feat? */
export function hasQuestionableSource(actor) {
  return Array.from(actor?.items ?? []).some(
    (item) =>
      item?.type === "feat" &&
      String(item?.name ?? "").trim().toLowerCase() === QUESTIONABLE_SOURCE_NAME.toLowerCase()
  );
}

/**
 * The line this feat adds to a Recall Knowledge card, or null where it
 * adds nothing.
 *
 * @param {string} degreeKey  the degree the check landed on
 * @returns {string|null}
 */
export function questionableSourceNote(degreeKey) {
  const degree = DEGREE_BY_KEY[String(degreeKey ?? "")];
  // An unknown degree is not a failure — it is a question this module
  // cannot answer, and inventing a guarantee for it would be worse than
  // staying quiet.
  if (!degree) return null;
  if (degree.success) return null;
  return (
    "<strong>Questionable Source:</strong> you nonetheless gain <strong>one piece of "
    + "information about the target that is true</strong> — although not necessarily useful, "
    + "and the GM chooses which. Anything else you recalled here stands as rolled."
  );
}
