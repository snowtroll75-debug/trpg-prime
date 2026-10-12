/**
 * A DEGREE MOVED AFTER THE DICE (3.612.0, block 34's R4).
 *
 * NEW. Pure; no Foundry.
 *
 * Fateful Temptation (page 349): "If the original saving throw would have
 * been a success, it instead becomes a critical. Conversely, if it would
 * have been a failure, it becomes a fumble." Nothing in this system moved a
 * degree before — Scrying's Study Target clause said so in as many words —
 * so this is the one place a degree is rewritten after `buildOutcome`.
 *
 * NAMED, NOT ARBITRARY. A shift is a key into DEGREE_SHIFTS, so the check
 * can carry it in its card flags and the card can re-apply it whenever the
 * outcome is rebuilt (a Conviction die, a late DC). A function could not be
 * stored there, and a rebuilt card that forgot the shift would quietly hand
 * a fumble back as a failure.
 *
 * ONLY THE TWO DEGREES THE PAGE NAMES MOVE. A Partial is its own degree in
 * this system (Graham, 3.217.0), and Critical, Heroic, Fumble and Blunder are
 * not "a success" or "a failure" in the page's sense, so all of them stand.
 */

import { DEGREE_BY_KEY, bonusCheckModifier } from "./resolution.mjs";

const DEGREE_SHIFTS = Object.freeze({
  fateful: Object.freeze({ success: "critical", failure: "fumble" })
});

/**
 * The degree key a shift turns `key` into; `key` itself when it does not move.
 * @param {string} key
 * @param {string} shift a DEGREE_SHIFTS key, or "" for none
 */
function shiftedDegreeKey(key, shift) {
  const table = DEGREE_SHIFTS[String(shift ?? "")];
  if (!table) return key;
  return table[key] ?? key;
}

/**
 * An outcome with its degree moved, or the same outcome when nothing moves.
 * The margin and total are left as rolled — the shift is the spell's, not
 * the dice's — and the bonus-check value follows the new degree.
 *
 * @param {object} outcome from buildOutcome
 * @param {string} shift
 * @returns {object}
 */
export function applyDegreeShift(outcome, shift) {
  const from = outcome?.degree?.key;
  if (!from) return outcome;
  const to = shiftedDegreeKey(from, shift);
  if (to === from || !DEGREE_BY_KEY[to]) return outcome;
  return { ...outcome, degree: DEGREE_BY_KEY[to], bonusCheck: bonusCheckModifier(to), shiftedFrom: from };
}

/** The card line for a moved degree. */
export function degreeShiftLine(source, fromLabel, toLabel) {
  return `${source}: the ${fromLabel} becomes a ${toLabel}.`;
}
