/**
 * The DC an action falls back to when nobody sets one.
 *
 * NEW at 3.422.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Graham, 27 August 2026: "Using the Study Target action does not allow
 * you to add anything to Studied Targets. It brings up Manage Studied
 * Targets, but when clicked there is no way to add anything here."
 *
 * The manager was innocent — it only forgets, because a target is meant
 * to be EARNED by passing the check. The check was the problem.
 *
 * Study Target declares `against: "none"`, so `actionTargetDC` answers
 * `dc: null` and the roll dialog opens with "Set by the GM (roll total
 * only)" selected. No DC means `buildOutcome` returns `degree: null`,
 * and the entire Study Target consequence sits behind `if (degree)`. So
 * the roll produced a total, printed the capacity, and recorded nothing.
 *
 * The card's own "Set DC" box looks like the way out and is not: it
 * recomputes the degree and re-renders, and the card then reads
 * "Heroic — exceeds DC by 21" over a studied-target list that is still
 * empty. Driven live on 3.421.0, that is exactly what happened.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND IT WAS NEVER ONLY STUDY TARGET.
 *
 * Nineteen actions apply a consequence gated on their degree. SIX of
 * them declare `against: "none"` and set no DC of their own, so all six
 * had the same hole; Graham reported the one he happened to use.
 *
 * The first draft of this list said eight. `identifyPower` and `subsist`
 * were on it because a coarse scan found `degree` within two thousand
 * characters of their names — but both of those branches are PRE-ROLL
 * (a time ladder, an elected penalty) and apply no outcome. The ratchet
 * in verify-action-default-dc, which derives the set from the outcome
 * section alone, rejected both on its first run. A default DC applied to
 * an action that did not need one would have been a silent rules change
 * to two more actions than Graham reported.
 *
 * A quieter consequence of the same gap: every DC adjustment downstream
 * is guarded by `finalDC !== null`, so with no base DC, Create's "+5 for
 * inventing a formula" and its batch modifier, and Transfer Runes'
 * `dcIncrease`, all silently did nothing at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 27 August 2026: default to MEDIUM on the Difficulty
 * Modifier Table — which is the level-based DC at a +0 modifier.
 *
 * This is what Study Target's own comment in skill-actions.mjs has
 * claimed all along: "No DC or difficulty is stated, so the GM sets the
 * DC and it defaults to Medium (Difficulty Modifier Table)." The comment
 * described an intention nothing implemented. It is true now.
 *
 * A DEFAULT IS NOT A DECISION. The value is pre-filled into the roll
 * dialog, where the GM can change it, raise it, lower it, or switch back
 * to "Set by the GM" deliberately. What it cannot do any more is be
 * absent by accident.
 */

import { levelDC } from "../dice/resolution.mjs";

/**
 * Medium on the Difficulty Modifier Table (Core, Chapter 4).
 *
 * NOT EXPORTED. It was, for one run, and `verify-rules-have-callers`
 * refused it — nothing outside this file needs the number, and an
 * exported rule nobody calls is a well-tested opinion (lesson 5.1). It
 * is named rather than inlined so a reader can see WHICH rung of the
 * table Graham chose and change it by moving one number.
 */
const MEDIUM_DIFFICULTY_MODIFIER = 0;

/**
 * Actions that apply a degree-gated consequence and bring no DC with
 * them — neither a target to roll against nor one they compute.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A RATCHET, and `verify-action-default-dc` reads the workflow's source
 * to keep it honest: every `action.key === "..."` branch that consults
 * `degree` must either resolve a DC some other way or appear here. An
 * action whose consequence depends on a degree it can never have is not
 * a harder action, it is an inert one — and it is inert SILENTLY, which
 * is how this survived.
 *
 * learnSpell is deliberately absent: it is degree-gated and declares
 * `against: "none"`, but overrides the DC outright from the chosen
 * spell's own PP-cost band ("action.against is 'none' purely as a
 * placeholder this overrides"). It has a DC; it just does not come from
 * a target.
 */
export const DEGREE_GATED_WITHOUT_DC = Object.freeze([
  "create",
  "earnIncome",
  "repair",
  "studyTarget",
  "surveyWildlife",
  "transferRunes",
  // SIX TO TEN AT 3.565.0, and all four arrived the same way: pages
  // 91-96 gave these actions consequences that read the degree, and an
  // action that reads a degree must be able to HAVE one. B5 caught all
  // four the moment they gained an outcome — which is the whole point of
  // this list being a ratchet rather than a note.
  //
  //   coverTracks     the party-size penalty to the Tracking DC
  //   gatherHerbs     4 / 2 / 1 yields
  //   disableADevice  two successes on a Critical, one on a Success
  //   pickLock        the same, for a complex lock
  //
  // NONE OF THEM HAS A TARGET and none prints a DC: the book hands each
  // one to the GM ("the difficulty of these checks is based on factors
  // like the freshness of the tracks", "each herb has a level-based
  // difficulty", "the complexity of the device"). A level-based Medium
  // is the right pre-fill for exactly that, and the GM still edits it.
  //
  // DISPEL AND RECHARGE ITEM ARE DELIBERATELY NOT HERE. Both are
  // degree-gated and both declare `against: "none"`, and both OVERRIDE
  // the DC from what the caster just declared — the effect's own DC, and
  // the item's level DC. They are the Learn a Spell case, recorded
  // above.
  "coverTracks",
  "gatherHerbs",
  "disableADevice",
  "pickLock"
]);

/** Whether this action would otherwise reach its roll with no DC at all. */
export function needsDefaultDC(actionKey, against) {
  return against === "none" && DEGREE_GATED_WITHOUT_DC.includes(String(actionKey ?? ""));
}

/**
 * The DC to pre-fill, or null to leave the GM's own "unknown" in place.
 *
 * ONLY WHEN NOTHING ELSE ANSWERED. Passed the DC already resolved, so a
 * target's Defence, a fixed DC, or Learn a Spell's own band all win —
 * this fills a hole rather than overriding a decision.
 *
 * @param {object} options
 * @param {string} options.actionKey
 * @param {string} options.against The action's `against` declaration.
 * @param {number|null} options.resolvedDC What actionTargetDC answered.
 * @param {number} options.level The acting character's level.
 * @returns {number|null}
 */
export function defaultActionDC({ actionKey, against, resolvedDC = null, level = 0 } = {}) {
  if (resolvedDC !== null && resolvedDC !== undefined) return resolvedDC;
  if (!needsDefaultDC(actionKey, against)) return null;
  // MEDIUM IS +0 on the Difficulty Modifier Table, so the level-based DC
  // stands unmodified. Written as an explicit addition rather than
  // omitted, because a reader should be able to see WHICH rung of the
  // table this is and change it by moving one number.
  return levelDC(level) + MEDIUM_DIFFICULTY_MODIFIER;
}

/** The label shown beside a DC this module supplied. */
export function defaultDCLabel(level) {
  return `Medium (level ${Math.max(0, Math.trunc(Number(level) || 0))} + 14)`;
}

/**
 * May the card call this DC "Medium (level + 14)"?
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONLY WHEN THIS MODULE ACTUALLY SUPPLIED IT — which is what the
 * workflow's own comment has claimed since 3.423.0:
 *
 *   "NAMED ONLY WHEN IT IS ACTUALLY THE RUNG. If the GM typed a number
 *    of their own, calling it 'Medium (level + 14)' on the card would be
 *    a caption describing a different DC than the one beside it."
 *
 * The condition beside that comment read `suggestedDC !== null &&
 * finalDC === suggestedDC`, and `defaultActionDC` RETURNS THE RESOLVED DC
 * UNCHANGED when there is one — so the test was true for every action
 * that resolved a DC at all, and the caption was applied to 47 of them.
 *
 * Kip Up's card said "Medium (level 3 + 14)" over a fixed DC 20. Pierce
 * Disguise's said it over the target's Deception DC. Both measured on
 * 6 September 2026; only SIX actions ever legitimately carry the label,
 * and they are the six this file's own header names.
 *
 * THE SAME DEFECT THIS MODULE WAS BUILT TO STOP — a comment describing
 * an intention the code did not carry — reproduced in the code that
 * fixed it, one line under the comment that stated the rule correctly.
 *
 * @param {{resolvedDC: number|null, suggestedDC: number|null, finalDC: number|null}} state
 * @returns {boolean}
 */
/**
 * The caption for this DC, or null when it has one of its own.
 *
 * THE WORKFLOW HAS NO CONDITION TO GET WRONG. The first repair left an
 * `if (labelIsDefault(...))` in `action-workflow.mjs`, and its mutation
 * SURVIVED: putting the old broken condition back there breaks no check,
 * because nothing in the harness can reach that file. The obvious
 * repair was a grep asserting the call — which is precisely what E5 was,
 * and precisely how this defect shipped.
 *
 * So the decision does not live there. The workflow asks for a caption
 * and uses one if it is given, and the only way to reintroduce the
 * defect is to change this function, where a check can run it.
 *
 * @param {{resolvedDC: number|null, suggestedDC: number|null,
 *          finalDC: number|null, level: number}} state
 * @returns {string|null}
 */
export function defaultDCCaption({ level = 0, ...state } = {}) {
  return labelIsDefault(state) ? defaultDCLabel(level) : null;
}

export function labelIsDefault({ resolvedDC = null, suggestedDC = null, finalDC = null } = {}) {
  // A DC THAT RESOLVED FROM ANYWHERE ELSE keeps its own caption, whether
  // that is "Fixed DC", "Target's Will DC", or the two-name form a
  // multi-target action carries.
  if (resolvedDC !== null && resolvedDC !== undefined) return false;
  if (suggestedDC === null || suggestedDC === undefined) return false;
  // AND THE DC ON THE CARD IS STILL THE SUGGESTION. A GM who typed their
  // own number in the dialog gets their number and no caption for it.
  return finalDC === suggestedDC;
}
