/**
 * WHAT SUSTAINING A SPELL COSTS OVER TIME — page 241's second paragraph.
 *
 * NEW at 3.585.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RULE, AND WHAT WAS THERE BEFORE.
 *
 *   "If you need to sustain a spell for 1 minute or longer you will need
 *    to make an exhaustion check as described in chapter 7, longer than
 *    10 minutes (100 rounds) and you must expend the Power Points for
 *    the spell again (no check required) for every additional 10 minutes
 *    (or part thereof)."
 *
 * Neither half happened, and neither COULD, because nothing counted. The
 * registry entry carries `sustainRound` — the round you last sustained —
 * which is exactly the field `sustainedLapses` needs to know whether you
 * have stopped, and tells you nothing about how long you have been
 * going. A spell sustained for an hour and a spell sustained twice were
 * indistinguishable.
 *
 * So the entry gains a second number, `sustainedRounds`, and this file
 * is what reads it. The two fields answer different questions and both
 * are needed: one is a timestamp, the other a tally.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A READING I WANT GRAHAM TO CHECK, recorded here rather than buried.
 *
 * The page says "an exhaustion check" — singular — attached to the
 * condition "sustain for 1 minute or longer". Two readings follow:
 *
 *   (a) ONE check, when the spell first reaches a minute.
 *   (b) A check every minute it continues.
 *
 * This file implements (a), the literal one. (b) is defensible — chapter
 * 7's exhaustion checks are periodic by nature, and an hour of
 * sustaining costing one check is odd — but (b) is also the HARSHER
 * reading, and inventing a cost the page does not clearly charge is the
 * wrong way to be wrong. `minutesHeld` is returned so (b) is a one-line
 * change to `sustainDues` if Graham reads it the other way.
 */

/** One minute, in rounds. The exhaustion threshold. */
const SUSTAIN_EXHAUSTION_ROUNDS = 10;

/** Ten minutes, in rounds. The PP re-expenditure period. */
const SUSTAIN_RECHARGE_ROUNDS = 100;

/**
 * Is this a number we may act on?
 *
 * THE `Number(null)` TRAP, FOR THE FOURTH TIME. `Number(null)` is 0 and
 * `Number.isFinite(0)` is true, so a cleared or never-written tally
 * reads as a real zero — which is harmless here but was not harmless in
 * the block-22 water clock, the block-23 affliction deadline or R9's
 * hit-point watch. The guard is written once and used, rather than
 * remembered three times.
 */
function readable(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

/**
 * How many whole rounds this entry has been sustained.
 *
 * @param {object} entry an active-spell registry entry
 * @returns {number} 0 for an entry that has never been sustained
 */
export function roundsHeld(entry) {
  const raw = entry?.sustainedRounds;
  if (!readable(raw)) return 0;
  return Math.max(0, Math.floor(Number(raw)));
}

/**
 * What a sustain taking the spell to `rounds` rounds owes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `charged` IS PASSED IN RATHER THAN RECOMPUTED, so a spell cannot be
 * billed twice for the same ten minutes. The block-22 water clock is the
 * lesson: a clock that recomputes what it owes from the current time,
 * rather than from what it has already collected, either double-charges
 * or loses the remainder depending on which way you round.
 *
 * @param {object} options
 * @param {number} options.rounds rounds held AFTER this sustain
 * @param {number} options.charged PP re-expenditures already collected
 * @param {boolean} options.exhausted whether the minute check has been made
 * @returns {{exhaustionCheck: boolean, ppCharges: number, minutesHeld: number}}
 */
export function sustainDues({ rounds = 0, charged = 0, exhausted = false } = {}) {
  const held = readable(rounds) ? Math.max(0, Math.floor(Number(rounds))) : 0;
  const paid = readable(charged) ? Math.max(0, Math.floor(Number(charged))) : 0;

  /*
   * PAST TEN MINUTES, AND ONLY PAST IT. The page charges for "every
   * additional 10 minutes (or part thereof)" beyond the first ten, so
   * round 100 owes nothing and round 101 owes one.
   *
   * NO `held > SUSTAIN_RECHARGE_ROUNDS` GUARD. One was here, and the
   * mutation harness proved it dead: for any `held` at or below 100 the
   * subtraction is zero or negative, `Math.ceil` of a negative fraction
   * is -0, and the `Math.max(0, ...)` below already floors it. No input
   * could tell the guarded form from this one, so no mutation could
   * catch its removal — and a guard nothing can reach is one nobody
   * should trust. The same finding weapon-damage-bonus.mjs records.
   */
  const due = Math.max(0, Math.ceil((held - SUSTAIN_RECHARGE_ROUNDS) / SUSTAIN_RECHARGE_ROUNDS));

  return {
    exhaustionCheck: !exhausted && held >= SUSTAIN_EXHAUSTION_ROUNDS,
    ppCharges: Math.max(0, due - paid),
    minutesHeld: Math.floor(held / SUSTAIN_EXHAUSTION_ROUNDS)
  };
}

/**
 * How long this has been going, in words, for the sustain card.
 *
 * @param {number} rounds
 * @returns {string}
 */
export function heldLabel(rounds) {
  const held = readable(rounds) ? Math.max(0, Math.floor(Number(rounds))) : 0;
  if (held < SUSTAIN_EXHAUSTION_ROUNDS) {
    return `${held} round${held === 1 ? "" : "s"}`;
  }
  const minutes = Math.floor(held / SUSTAIN_EXHAUSTION_ROUNDS);
  const spare = held % SUSTAIN_EXHAUSTION_ROUNDS;
  const base = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return spare ? `${base}, ${spare} round${spare === 1 ? "" : "s"}` : base;
}

/**
 * The sentence a sustain that owes something prints.
 *
 * @param {object} dues the result of `sustainDues`
 * @param {number} pp the spell's PP cost
 * @returns {string} "" when nothing is owed
 */
export function duesLine(dues, pp) {
  const parts = [];
  if (dues?.exhaustionCheck) {
    parts.push("held for a minute — an <strong>exhaustion check</strong> is called for");
  }
  const charges = Math.max(0, Math.floor(Number(dues?.ppCharges) || 0));
  if (charges > 0) {
    const cost = Math.max(0, Math.floor(Number(pp) || 0));
    parts.push(
      `past ten minutes — <strong>${charges * cost} PP</strong> must be expended again`
      + `${charges > 1 ? ` (${charges} periods at ${cost} PP)` : ""}`
    );
  }
  return parts.length ? `${parts.join("; ")}.` : "";
}
