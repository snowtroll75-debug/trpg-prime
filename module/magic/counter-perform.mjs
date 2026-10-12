/**
 * COUNTER PERFORM (Bard, PP 1) — Composition, Emotion, Enchantment.
 *
 *   Cast R (somatic or verbal); Range 30 feet; Targets 1 creature
 *   Trigger  you or a studied ally within range make a saving throw
 *
 *   "Your performance creates a shield of protection against the incoming
 *    effect. Your Perform check for casting this spell is compared to the
 *    Bonus check table against the Save DC of the incoming spell. Any
 *    positive modifier is then granted as a status bonus to the targets
 *    saving throw. Any negative modifier is disregarded."
 *
 * NEW at 3.443.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS CUTTING WORDS WITH THE SIGN FLIPPED.
 *
 * Graham's ruling of 28 August 2026 settled the sequencing for this whole
 * class of Bard reaction, and it was made about Cutting Words: *"It should
 * be triggered only by the caster of the spell. After an attack or skill
 * check has been announced (nothing mechanical here just talk at the
 * table), the player with the spell would cast the spell and select an
 * eligible target."*
 *
 * So there is no hook on anybody else's card. The Bard casts from their
 * own sheet at an announced save, and what waits on the target is spent
 * by the next roll the spell's printed trigger names. Four things differ
 * from Cutting Words and nothing else does:
 *
 *   Cutting Words          Counter Perform
 *   enemies                ALLIES
 *   a penalty              a BONUS
 *   circumstance           STATUS   (the book says so)
 *   attack or skill        SAVE     (the book says so)
 *
 * Reusing that path rather than building beside it is the whole design.
 * `dice/check.mjs`'s `evaluate` is the one place every check in this
 * system passes through, and it already knows how to spend a waiting
 * modifier before the outcome is built.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BOOK NAMES THE TABLE, SO THE TABLE IS WHAT IS USED.
 *
 * "compared to the Bonus check table" is `BONUS_CHECK_TABLE` in
 * dice/resolution.mjs — heroic 4, critical 3, success 2, partial 1,
 * failure 0, fumble -1, blunder -2 — the same table Aid and Meditation
 * read. Copying those numbers here would be two places deciding one
 * question, so this asks `buildOutcome` for them: one call compares the
 * Perform total against the incoming DC and returns the table's answer,
 * which is the printed sentence expressed as a function call rather than
 * as a ladder retyped beside it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "AGAINST THE SAVE DC OF THE INCOMING SPELL" — a DC nothing can know.
 *
 * The comparison is NOT against this spell's own casting DC. It is
 * against the DC of whatever is forcing the ally's save, which has not
 * been rolled yet and belongs to somebody else's spell — so the system
 * cannot derive it and the caster is asked for it at cast time. That is
 * a prompt rather than a guess, and a guess here would silently size
 * every Counter Perform in the game off the wrong number.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "ANY NEGATIVE MODIFIER IS DISREGARDED" is a floor, not an absence.
 *
 * A fumbled Perform earns -1 from the table and the spell discards it:
 * the Bard's bad performance does not make their friend WORSE at
 * resisting. The floor is applied here, once, so no call site can decide
 * it differently — and a bonus of zero records NOTHING, for the reason
 * `cutting-words.mjs` gives about its own zero: a stored 0 would sit on
 * the creature looking like an effect, be consumed by their next save,
 * and print a line saying nothing happened.
 */

import { buildOutcome } from "../dice/resolution.mjs";

/** Where the waiting bonus is recorded on the target. */
export const COUNTER_PERFORM_FLAG = "counterPerform";

/*
 * NO RANGE CONSTANT HERE. Cutting Words exports one because its own
 * eligibility function measures with it; this spell's 30 feet is enforced
 * by `system.range` and the targeting machinery that already reads it, so
 * a constant beside the rule would be a second place stating a distance
 * nothing here compares against. The uncalled-export ratchet asked, and
 * deleting was the honest answer rather than a keep with a reason.
 */

/**
 * The status bonus a Perform check earns against an incoming Save DC.
 *
 * ASKS THE SYSTEM'S OWN COMPARISON. `buildOutcome` resolves the margin
 * into a degree and reports that degree's Bonus Check Table value in
 * `bonusCheck`, so this function contains no ladder of its own and cannot
 * drift from Aid's.
 *
 * @param {number} performTotal the casting check's total
 * @param {number|null} incomingSaveDC the DC of the effect being resisted
 * @returns {number} 0..4 — never negative
 */
export function counterPerformBonus(performTotal, incomingSaveDC) {
  // `Number(null)` IS ZERO, AND ZERO IS FINITE. The first draft guarded
  // with `Number.isFinite` alone, so a missing DC became DC 0 and a
  // Perform of 30 came back a HEROIC 4 — the exact failure this file's
  // header warns about, "a guess would size every Counter Perform in the
  // game off the wrong number", written by the same hand that then wrote
  // the guess in. Caught by B8 the first time this check ran.
  if (!usableNumber(incomingSaveDC) || !usableNumber(performTotal)) return 0;
  const outcome = buildOutcome({ dieTotal: Number(performTotal), dc: Number(incomingSaveDC) });
  return Math.max(0, Number(outcome.bonusCheck) || 0);
}

/** A value that is really a number, rather than one `Number()` invents. */
function usableNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

/**
 * "you or a studied ally ... make a SAVING THROW" — the one check type
 * this spell may reach, and no others.
 *
 * A SAVE IS NOT A SKILL CHECK, and the mirror of this predicate in
 * `cutting-words.mjs` says the same thing from the other side. Answering
 * "which rolls does this spell reach" in one place is what stops the
 * bonus landing on an attack the first time somebody widens the hook.
 *
 * NOT EXPORTED: `counterPerformConsumes` is the public way to ask, and a
 * check that drove this directly would be testing a private opinion
 * rather than what the roll actually consults.
 *
 * @param {string} checkType the `type` a TRGCheck card carries
 */
function counterPerformTriggers(checkType) {
  return String(checkType ?? "").toLowerCase() === "save";
}

/**
 * What the cast leaves waiting on the target, or null when it leaves
 * nothing.
 *
 * @param {object} options
 * @param {number} options.bonus       the table's answer, already floored
 * @param {string} options.casterName  for the line the consuming card prints
 * @param {number|null} options.round  the combat round it was cast in
 * @returns {{bonus: number, casterName: string, round: number|null}|null}
 */
export function counterPerformRecord({ bonus = 0, casterName = "", round = null } = {}) {
  const value = Math.max(0, Math.trunc(Number(bonus)) || 0);
  if (!value) return null;
  return {
    bonus: value,
    casterName: String(casterName ?? ""),
    round: round === null || round === undefined ? null : Number(round)
  };
}

/**
 * The modifier a WAITING record becomes on the save that spends it.
 *
 * STATUS, and therefore HIGHEST-WINS (Appendix 1) — the book says "granted
 * as a status bonus" and the type carried here is what decides it, not
 * anything at the call site. Two Bards shielding one save do not stack.
 *
 * NAMED WITH ITS CASTER, because by the time it lands the cast card has
 * scrolled away; `cutting-words.mjs` learned that from the other side.
 *
 * @param {object|null} pending what the target is carrying
 */
export function pendingCounterPerformModifier(pending) {
  const value = Number(pending?.bonus);
  if (!value || value < 0) return null;
  const who = String(pending?.casterName ?? "").trim();
  return {
    label: who ? `Counter Perform (${who})` : "Counter Perform",
    value,
    type: "status"
  };
}

/** Does this check spend what the creature is carrying? */
export function counterPerformConsumes(checkType, pending) {
  if (!pending) return false;
  return counterPerformTriggers(checkType);
}

/** What the cast card says the ally is now holding. */
export function counterPerformCastLine(bonus, targetName) {
  if (!bonus) {
    return `${targetName}: the performance earns no bonus — nothing is held.`;
  }
  return `${targetName} holds <strong>+${bonus} status</strong> for their next saving throw.`;
}
