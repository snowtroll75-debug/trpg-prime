/**
 * IMPROVED REPOSITION (General, Chapter 5): "You are very adept at
 * protecting weaker allies. You no longer need a free hand to use the
 * Reposition action. In addition, you make a Reflex DC (against your
 * targets level DC) to avoid reactions when using this action."
 *
 * NEW at 3.381.0, deferred from 3.378.0 because it needed a mechanism the
 * system did not have and a shape that was not obvious.
 *
 * TWO CLAUSES, AND ONLY ONE OF THEM IS REAL HERE.
 *
 * THE FREE HAND CLAUSE IS ALREADY MOOT, and saying so is the honest
 * implementation. Nothing in this system enforces a free hand for
 * Reposition — `attack.mjs` says as much about itself: *"'Free hand'
 * isn't a restriction this system enforces anywhere today, so that part
 * of the trait text is already moot"*. The requirement is printed on the
 * action's card and adjudicated by whoever is running the table. Writing
 * code to waive a restriction that does not exist would produce a feat
 * that passes a harness and changes nothing, which is the shape this
 * whole audit exists to find.
 *
 * THE REFLEX CLAUSE IS DECLARED BEFORE THE MOVE, NOT DURING IT, and that
 * is forced rather than chosen. Foundry's `preMoveToken` hook is
 * SYNCHRONOUS: the decision about whether a move provokes is made inside
 * it, and a saving throw is a roll — asynchronous, and usually
 * interactive. There is no way to pause that hook on a dialog.
 *
 * So the save is its own step, taken from the feat before repositioning,
 * and its success is remembered for the next Reposition. That is also
 * Graham's own steer on Attack of Opportunity, applied again: *"Perhaps
 * all we need here is a prompt on the chat log."*
 *
 * ONE ODDITY, FLAGGED RATHER THAN CORRECTED. The DC is "your target's
 * level DC", and Reposition's target is the **willing ally** you swap
 * places with — so the save is made against the level of the person being
 * helped, which is a strange thing for the rule to key on. It is what the
 * sentence says, and it is implemented as written; Graham has been told,
 * because guessing that the book meant "whoever might react" would be
 * inventing a different feat.
 */

import { levelDC } from "../dice/resolution.mjs";

/*
 * THERE IS NO `hasImprovedReposition` HERE, and its absence is deliberate.
 * One was written and deleted the same hour: `FEAT_AUTOMATION` is keyed by
 * feat name, so the registry itself answers "does this actor have the
 * feat" — the helper had no caller and never would have. §5.1 says a rule
 * with no caller is not automation, and manufacturing a caller to justify
 * an export is that same mistake wearing a hat.
 */

/**
 * The DC of the Reflex save, from the target's level.
 *
 * @param {number} targetLevel The willing ally's level.
 * @returns {number}
 */
export function repositionSaveDC(targetLevel) {
  return levelDC(Math.max(0, Math.floor(Number(targetLevel) || 0)));
}

/**
 * Did the Reflex save avoid the reactions?
 *
 * A PARTIAL DOES NOT COUNT. The sentence offers one thing — avoiding
 * reactions — and there is no half of it to give. `DEGREES` marks
 * partial as `success: false`, and this defers to that rather than
 * deciding for itself what counts as making a save.
 *
 * @param {string} degree The degree rolled.
 * @returns {boolean}
 */
export function repositionAvoided(degree) {
  return ["success", "critical", "heroic"].includes(String(degree ?? "").trim().toLowerCase());
}

/**
 * The line the card prints, so a Reposition that provokes nothing does
 * not look like a bug in the reaction system.
 *
 * @param {boolean} avoided
 * @param {string} targetName
 * @returns {string}
 */
export function repositionSaveNote(avoided, targetName = "your ally") {
  return avoided
    ? `<em>Improved Reposition: the next Reposition with <strong>${targetName}</strong> provokes no reactions.</em>`
    : `<em>Improved Reposition: the save fails — repositioning with <strong>${targetName}</strong> provokes as usual.</em>`;
}
