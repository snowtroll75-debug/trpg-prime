/**
 * A SPELL BEING CAST — the window extra casting time opens, and what can
 * happen in it. The rules, pure.
 *
 * NEW at 3.584.0, for R9 of the pages 231-240 audit, deferred out of
 * 3.583.0 deliberately because it needed a model rather than a patch.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THERE WAS NOTHING TO INTERRUPT.
 *
 * Page 237 sells a bonus for taking longer:
 *
 * > "For each additional casting increment taken, beyond the initial
 * >  casting time, you gain a +1-circumstance bonus to the casting
 * >  check… If you willingly stop without casting, all accrued bonuses
 * >  are lost and the process must be started anew, but no PPs are spent
 * >  until the Spell is cast. If you are interrupted (take damage etc)
 * >  whilst preparing a spell in this way, it is treated as Taking
 * >  Damage whilst casting."
 *
 * And page 238 says what that costs:
 *
 * > "If you are struck for hit point damage whilst casting a spell, your
 * >  spell casting check is automatically a failure. If you are struck
 * >  for a critical whilst casting a spell your spell casting check is
 * >  automatically a fumble."
 *
 * The system took the bonus and skipped the window. A cast resolved
 * inside one dialog flow, so by the time the player chose three extra AP
 * the roll had already happened — there was no moment at which damage
 * could arrive, and a watch armed afterwards would have watched nothing.
 * The audit called this D8 and I would not build it in a hurry beside
 * fourteen other changes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE WINDOW IS THE WHOLE FEATURE. Everything else here is small.
 *
 * ONLY EXTRA CASTING TIME OPENS ONE, on Graham's ruling of 22 September
 * 2026. That is what page 237's sentence covers in as many words —
 * "interrupted whilst preparing a spell IN THIS WAY" — and it keeps a
 * second click away from the ordinary one-action cast, which is the most
 * used path in the system.
 *
 * NO PP IS AT STAKE UNTIL THE SPELL IS CAST. The page says so twice over,
 * and it is why stopping willingly costs nothing at all: the caster has
 * spent time, and time is not a resource this system tracks.
 *
 * Pure; no Foundry.
 */

/** The actor flag a cast in progress lives in. */
export const PENDING_CAST_FLAG = "pendingCast";

/**
 * What an interruption does to the casting check.
 *
 * > "Struck for hit point damage … automatically a failure. Struck for a
 * >  critical … automatically a fumble."
 *
 * A FUMBLE IS NOT MERELY A WORSE FAILURE HERE: it sends the caster to the
 * Spell Failure Table and costs the whole PP, where a failure costs half.
 * So the difference between these two words is the difference between
 * losing a spell and losing a spell plus whatever the table says.
 *
 * @param {string|null} criticalSeverity the severity of a critical
 *   injury taken, or null for ordinary hit point damage
 * @returns {"failure"|"fumble"}
 */
export function interruptedDegree(criticalSeverity) {
  return criticalSeverity ? "fumble" : "failure";
}

/**
 * Is this hit point change an interruption?
 *
 * ONLY A LOSS. Healing during a long casting is not "struck for hit
 * point damage", and a cast interrupted by its own caster drinking a
 * potion would be a rule nobody wrote.
 *
 * @param {number} before hit points before
 * @param {number} after hit points after
 * @returns {boolean}
 */
export function hitPointsLost(before, after) {
  /*
   * NULL IS NOT ZERO HIT POINTS. `Number(null)` is 0 and 0 is finite, so
   * a guard written as `Number.isFinite(Number(x))` lets null through as
   * a total loss — and this rule would then read a write of null as the
   * caster being struck to nothing.
   *
   * The third time this project has met that trap: block 22's water
   * clock read a cleared stamp as the epoch, block 23's affliction
   * deadline did the same, and it was caught here by this file's own
   * check rather than in a live world. Written the same way as
   * `deadlineDue` in afflictions.mjs, deliberately, so the two agree.
   */
  const readable = (v) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v));
  if (!readable(before) || !readable(after)) return false;
  return Number(after) < Number(before);
}

/**
 * How much longer the caster has to stand there.
 *
 * @param {object} state
 * @param {number} state.increments how many were taken
 * @param {string} state.unit "AP" | "minute"
 * @param {number} state.size the size of one increment
 * @returns {string}
 */
export function remainingLabel({ increments = 0, unit = "AP", size = 3 } = {}) {
  const n = Math.max(0, Math.trunc(Number(increments) || 0));
  const each = Math.max(1, Math.trunc(Number(size) || 1));
  const total = n * each;
  if (unit === "minute") return `${total} minute${total === 1 ? "" : "s"}`;
  return `${total} AP`;
}

/** The card posted while the caster is standing there. */
export function armedLine(spellName, state, bonus) {
  return `<strong>${spellName}</strong> — casting for a further `
    + `<strong>${remainingLabel(state)}</strong>, for <strong>+${bonus}</strong> to the check. `
    + "Nothing is spent until it is cast (page 237).";
}

/**
 * The line for a caster who thinks better of it.
 *
 * > "If you willingly stop without casting, all accrued bonuses are lost
 * >  and the process must be started anew, but no PPs are spent."
 */
export function stoppedLine(spellName) {
  return `<strong>${spellName} — stopped.</strong> The accrued bonus is lost and the `
    + "casting must be started anew. <em>No PP is spent</em> (page 237).";
}

/** The line for a caster who is hit while standing there. */
export function interruptedLine(spellName, criticalSeverity) {
  return criticalSeverity
    ? `<strong>${spellName} — interrupted by a ${criticalSeverity} critical injury.</strong> `
      + "The casting check is automatically a <strong>fumble</strong> (page 238)."
    : `<strong>${spellName} — interrupted by damage.</strong> `
      + "The casting check is automatically a <strong>failure</strong> (page 238).";
}

/* ══════════════════════════════════════════════════════════════════════
 * PAYING FOR THE TIME (3.592.0 — Graham, 25 September 2026)
 *
 * The window built at 3.584.0 charged nothing while it was open. The AP
 * *was* in the arithmetic — `totalCastTime` adds `extraApSpent` and
 * `spendActionCost` runs at the end — but it arrived as ONE LUMP after
 * the window closed, against a pool of three, so `spendActionPoints`
 * clamped it to zero and warned while the pool refilled every turn the
 * caster stood there. A cost that is charged once, too late, against a
 * pool that has already been replenished is not a cost.
 *
 * So the extra time is paid DOWN, a turn at a time, at the moment the
 * turn's AP is granted. Graham's ruling of 25 September: a caster who
 * has fewer than three AP — they moved first, or they are Slowed — pays
 * what they have and stands there longer. Extra casting time is time,
 * and a caster who took one step should not lose the turn's casting.
 * ════════════════════════════════════════════════════════════════════ */

/**
 * The total extra AP this window owes.
 *
 * ZERO IS A REAL ANSWER, and it means "nothing to pay down": a
 * minute-unit window (a 1-minute spell takes +1 minute per increment,
 * and minutes are not AP), or a caster outside combat, where there are
 * no turns to pay across and `spendActionPoints` spends nothing anyway.
 * Both cases keep 3.584.0's behaviour — the button is offered at once.
 *
 * @param {object} state the pending-cast record
 * @param {boolean} inCombat whether the caster is in a combat with turns
 * @returns {number} AP owed, never negative
 */
export function extraApOwed({ increments = 0, unit = "AP", size = 3 } = {}, inCombat = true) {
  if (!inCombat) return 0;
  if (String(unit ?? "") !== "AP") return 0;
  const n = Math.max(0, Math.trunc(Number(increments) || 0));
  const each = Math.max(0, Math.trunc(Number(size) || 0));
  return n * each;
}

/** What is still to pay. */
export function extraApRemaining(owed, paid) {
  return Math.max(0, Math.trunc(Number(owed) || 0) - Math.max(0, Math.trunc(Number(paid) || 0)));
}

/**
 * What this turn pays: what the caster HAS, capped by what is LEFT.
 *
 * Not "three", and not "their maximum". A caster who moved first has two
 * and pays two; a Quickened caster with four does not overpay a window
 * that only owes one. Both halves of that are Graham's ruling.
 *
 * @param {number} available the AP in the pool right now
 * @param {number} owed the window's total
 * @param {number} paid what previous turns have already put in
 * @returns {number}
 */
export function apPaymentForTurn(available, owed, paid) {
  const have = Math.max(0, Math.trunc(Number(available) || 0));
  return Math.min(have, extraApRemaining(owed, paid));
}

/**
 * May the casting be completed?
 *
 * A window owing nothing is ready the moment it opens — which is what
 * keeps the minute-unit and out-of-combat paths exactly as they were.
 */
export function pendingCastReady({ apOwed = 0, apPaid = 0 } = {}) {
  return extraApRemaining(apOwed, apPaid) === 0;
}

/**
 * The line a turn's card carries while the caster stands there.
 *
 * SAYS THE FRACTION, not just "still casting". A player who cannot see
 * how much is left cannot decide whether to keep standing there, and the
 * whole point of this release is that the window stopped being invisible.
 */
/**
 * The line a turn's card carries once the time is already paid.
 *
 * FOUND BY DRIVING IT, 25 September 2026. `payPendingCastTurn` answered
 * null the moment nothing was left to pay, so a turn after the last
 * instalment printed no line and — the part that matters — carried no
 * BUTTON. The "Complete the casting" affordance then lived on exactly
 * one card and scrolled away as the rounds passed, which is Graham's
 * original complaint postponed rather than fixed.
 *
 * It only shows up if the caster HOLDS the spell, and holding it is
 * precisely what his ruling allows: "the player presses it when they
 * want the spell to go off". So the turn that offers nothing to pay
 * still has something to say.
 *
 * @param {string} spellName
 * @param {object} state the pending-cast record
 * @returns {string}
 */
export function castingHeldLine(spellName, { apOwed = 0, castAP = 0 } = {}) {
  const own = Math.max(0, Math.trunc(Number(castAP) || 0));
  const paidFor = apOwed > 0
    ? ` The extra casting time is paid in full (<strong>${apOwed} of ${apOwed} AP</strong>).`
    : "";
  return `<strong>Still holding ${spellName}.</strong>${paidFor} `
    + "<em>It may be completed now"
    + (own > 0 ? `; its own <strong>${own} AP</strong> is spent when it is.` : ".")
    + "</em>";
}

export function castingProgressLine(spellName, { apOwed = 0, apPaid = 0, castAP = 0 } = {}, paidThisTurn = 0) {
  const left = extraApRemaining(apOwed, apPaid);
  const spent = paidThisTurn > 0
    ? `<strong>${paidThisTurn} AP</strong> goes into it this turn`
    : "<strong>no AP</strong> was available this turn";
  if (left > 0) {
    return `<strong>Casting ${spellName}</strong> — ${spent}: `
      + `<strong>${apPaid} of ${apOwed} AP</strong> of the extra casting time, `
      + `<strong>${left}</strong> still to go.`;
  }
  // NAMES WHAT IS STILL TO PAY. A caster who put every point into the
  // time has none left for the spell itself, and finding that out in a
  // clamp warning after pressing Complete is the kind of surprise this
  // release exists to remove.
  const own = Math.max(0, Math.trunc(Number(castAP) || 0));
  return `<strong>Casting ${spellName}</strong> — ${spent}, completing the extra casting time `
    + `(<strong>${apOwed} of ${apOwed} AP</strong>). `
    + `<em>The spell may now be completed`
    + (own > 0 ? `; its own <strong>${own} AP</strong> is spent when it is.` : ".")
    + "</em>";
}
