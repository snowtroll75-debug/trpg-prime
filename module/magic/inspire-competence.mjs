/**
 * INSPIRE COMPETENCE (Bard, PP 1) — Composition, Emotion, Enchantment.
 *
 *   Cast 1 AP; Targets 1 ally
 *
 *   "Your words of encouragement fill your ally with inspiration,
 *    boosting their chances of success. This counts as if you had taken
 *    an Aid action, using the result of the spell's check instead of a
 *    specific skill. The minimum bonus granted is +1."
 *
 * NEW at 3.448.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AID RULE, AS GRAHAM GAVE IT ON 31 AUGUST 2026:
 *
 *   "Sometimes you may need to assist other characters... one character
 *    must be appointed as the lead character. All other characters make
 *    an EASY Skill check using the BONUS CHECK TABLE. The resulting
 *    bonus is added as a CIRCUMSTANCE BONUS to the lead character's
 *    check."
 *
 * Three things fall straight out of that sentence and none of them had
 * to be invented:
 *
 *   - THE DC IS THE EASY ONE. `levelDC(level)` adjusted by the `easy`
 *     rung of the difficulty ladder (-2), both of which the system has
 *     carried since Chapter 4. No prompt is needed — which is the
 *     difference from Counter Perform, whose DC belongs to somebody
 *     else's spell and genuinely cannot be known.
 *   - THE TABLE IS THE SYSTEM'S OWN. `buildOutcome` resolves the margin
 *     and reports `bonusCheck`, exactly as Counter Perform asks it to.
 *     A ladder retyped here would be a second place deciding one
 *     question.
 *   - THE BONUS IS CIRCUMSTANCE, not status. That is what the Aid rule
 *     says, and the type is what decides whether two helpers stack
 *     (Appendix 1: they do not — highest wins).
 *
 * ─────────────────────────────────────────────────────────────────────
 * "THE MINIMUM BONUS GRANTED IS +1" — A FLOOR, AND THE SPELL'S WHOLE
 * DIFFERENCE FROM AN ORDINARY AID.
 *
 * An Aid check that fails grants nothing. This spell grants +1 anyway.
 * So where Counter Perform floors the table at ZERO and records nothing
 * when it lands there, this floors at ONE and always records something —
 * the mirror image, and the reason the two spells cannot share a
 * function however similar they look.
 *
 * A FUMBLED CAST STILL GRANTS +1. The printed sentence carries no
 * exception, and the spell has already been cast and paid for by the
 * time the table is read. Recorded here rather than argued at the
 * table.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS NOT AUTOMATED, AND SAYS SO.
 *
 * "There might be situations where your ability to encourage your ally
 * could interfere with the skill check, such as when attempting to
 * sneak quietly or maintain a disguise. In such cases, the GM may rule
 * that this spell has no effect." That is a judgement about fiction,
 * and the card prints it rather than guessing which skills are quiet.
 */

import { buildOutcome, levelDC, DIFFICULTY_BY_KEY } from "../dice/resolution.mjs";

/** Where the waiting bonus is recorded on the ally. */
export const INSPIRE_COMPETENCE_FLAG = "inspireCompetence";

/** "All other characters make an EASY Skill check." */
const AID_DIFFICULTY = "easy";

/** "The minimum bonus granted is +1." */
const MINIMUM_BONUS = 1;

/**
 * The DC an Aid check is made against, for a lead of this level.
 *
 * THE LEVEL IS THE ALLY'S, not the caster's. The Aid rule is about
 * helping with the lead character's task, and the difficulty of a task
 * belongs to whoever is attempting it. A caster's own level deciding how
 * much help their friend receives would make the same encouragement
 * worth more from a higher-level Bard, which the rule does not say.
 *
 * @param {number} leadLevel the aided creature's level
 * @returns {number}
 */
export function aidDC(leadLevel) {
  const base = levelDC(Number(leadLevel) || 0);
  const rung = DIFFICULTY_BY_KEY[AID_DIFFICULTY];
  return base + (Number(rung?.modifier) || 0);
}

/**
 * The circumstance bonus a cast earns for the ally.
 *
 * ASKS THE SYSTEM'S OWN COMPARISON, as Counter Perform does: one call to
 * `buildOutcome` resolves the margin into a degree and reports that
 * degree's Bonus Check Table value, so this function holds no ladder and
 * cannot drift from Aid's.
 *
 * @param {number} castTotal the casting check's total
 * @param {number} leadLevel the aided creature's level
 * @returns {number} at least 1
 */
export function inspireCompetenceBonus(castTotal, leadLevel) {
  const total = Number(castTotal);
  if (!Number.isFinite(total)) return MINIMUM_BONUS;
  const outcome = buildOutcome({ dieTotal: total, dc: aidDC(leadLevel) });
  const earned = Number(outcome.bonusCheck) || 0;
  // THE FLOOR IS THE SPELL'S OWN SENTENCE, and it is a floor rather than
  // a replacement: a heroic cast still earns the table's 4.
  return Math.max(MINIMUM_BONUS, earned);
}

/**
 * What the cast leaves waiting on the ally.
 *
 * ALWAYS A RECORD, unlike Counter Perform's. That spell records nothing
 * on a zero because a stored 0 would sit on the creature looking like an
 * effect; this one has no zero to store, because its floor is 1.
 *
 * @param {object} options
 * @param {number} options.bonus      the table's answer, already floored
 * @param {string} options.casterName for the line the consuming card prints
 * @param {number|null} options.round the combat round it was cast in
 */
export function inspireCompetenceRecord({ bonus = MINIMUM_BONUS, casterName = "", round = null } = {}) {
  const value = Math.max(MINIMUM_BONUS, Math.trunc(Number(bonus) || 0));
  return {
    bonus: value,
    casterName: String(casterName ?? ""),
    round: round === null || round === undefined ? null : Number(round)
  };
}

/**
 * The modifier a waiting record becomes on the check that spends it.
 *
 * CIRCUMSTANCE, because the Aid rule says so — and therefore
 * highest-wins under Appendix 1, so two Bards encouraging one ally do
 * not stack.
 */
export function pendingInspireCompetenceModifier(pending) {
  const value = Number(pending?.bonus);
  if (!value || value < 0) return null;
  const who = String(pending?.casterName ?? "").trim();
  return {
    label: who ? `Inspire Competence (${who})` : "Inspire Competence",
    value,
    type: "circumstance"
  };
}

/**
 * Does this check spend what the creature is carrying?
 *
 * A SKILL CHECK, and nothing else. The spell aids "their chances of
 * success" through the Aid rule, which is about Skill checks — and its
 * own examples (sneaking quietly, maintaining a disguise) are skills.
 * An attack roll is not a skill check, and neither is a saving throw:
 * Counter Perform is the spell that reaches saves, and one of these two
 * reaching both would make the pair meaningless.
 */
export function inspireCompetenceConsumes(checkType, pending) {
  if (!pending) return false;
  return String(checkType ?? "").trim().toLowerCase() === "skill";
}

/** What the cast card says the ally is now holding. */
export function inspireCompetenceCastLine(bonus, targetName) {
  return `${targetName} holds <strong>+${bonus} circumstance</strong> for their next skill check.`;
}
