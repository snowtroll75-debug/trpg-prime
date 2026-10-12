/**
 * WHEN A RUNNING SPELL STOPS RUNNING.
 *
 * NEW at 3.494.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE STAMP, TWO CLOCKS, THREE THINGS THAT WEAR IT.
 *
 * An emanation has carried an `ends` stamp since 3.430.0, because
 * Protective Ward's flat minute had nothing watching it. An active-spell
 * entry now carries the same stamp for the same reason: a spell
 * registered because its duration prints (D) has to come off the list
 * when its duration is spent, or the panel fills with spells that ended
 * some time last session.
 *
 * The arithmetic was written once, for emanations, in
 * `emanationHasElapsed`. It lives here now and both callers ask it,
 * rather than the second caller growing a copy that agrees with the
 * first only until somebody edits one of them.
 *
 * EITHER CLOCK ENDS IT. A spell cast in an encounter counts rounds; the
 * same spell cast in a corridor counts seconds. Whichever clock is
 * moving reaches the mark; the other never does and costs nothing.
 *
 * AN UNSTAMPED THING NEVER EXPIRES HERE, and that is deliberate rather
 * than a gap. The six emanations live before 3.430.0 are all
 * "Sustained"-word spells ended by the lapse sweep, and a spell whose
 * duration is "varies" — Forget, Confusion — has no end anybody can
 * compute. Inventing a clock for either would end somebody's spell at a
 * moment nobody chose.
 */

/**
 * The stamp for a cast that starts now.
 *
 * @param {object} options
 * @param {number|null} options.seconds the duration in seconds, if it has one
 * @param {number|null} options.rounds the duration in rounds, if it has one
 * @param {number|null} options.worldTime the clock at the moment of casting
 * @param {number|null} options.round the encounter round, or null out of combat
 * @returns {{endsAtWorldTime: number|null, endsOnRound: number|null}|null}
 *   null when nothing about the duration can be counted
 */
export function endsStamp({ seconds = null, rounds = null, worldTime = null, round = null } = {}) {
  const byTime = seconds != null && worldTime != null
    ? Number(worldTime) + Number(seconds)
    : null;
  const byRound = rounds != null && round != null
    ? Number(round) + Number(rounds)
    : null;
  // NOTHING TO COUNT IS NOT A STAMP OF NULLS. A stamp that exists but
  // can never elapse reads, to everything downstream, exactly like one
  // that is still running — and `endsHaveElapsed` would then be asked
  // about it forever. An uncountable duration gets no stamp at all.
  if (byTime === null && byRound === null) return null;
  return { endsAtWorldTime: byTime, endsOnRound: byRound };
}

/**
 * Has a stamped clock run out?
 *
 * @param {object|null} ends the stored stamp
 * @param {object} now {worldTime, round}
 * @returns {boolean}
 */
export function endsHaveElapsed(ends, { worldTime = null, round = null } = {}) {
  if (!ends) return false;
  const byTime = (ends.endsAtWorldTime ?? null) !== null
    && worldTime !== null && Number(worldTime) >= Number(ends.endsAtWorldTime);
  const byRound = (ends.endsOnRound ?? null) !== null
    && round !== null && Number(round) >= Number(ends.endsOnRound);
  return Boolean(byTime || byRound);
}
