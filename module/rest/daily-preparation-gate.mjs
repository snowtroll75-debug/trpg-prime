/**
 * WHAT DAILY PREPARATION REQUIRES, AND WHAT IT ENDS — the rules, pure.
 *
 * NEW at 3.582.0, for the pages 221-230 audit's D9 and Graham's R13 of
 * 22 September 2026: "Yes".
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AUDIT ASKED FOR A DAILY PREPARATION ACTION AND THE SYSTEM ALREADY
 * HAD ONE.
 *
 * `performDailyPreparation` in uses-workflow.mjs has been on the actor
 * sheet for a long time, and it does most of page 229's list: per-day
 * uses reset, spell locks release, companions and familiars true up,
 * charged items regain their PP. Measured before anything was written
 * here, which is why this module is two rules and not a workflow.
 *
 * The two the page states and the system did not do:
 *
 *   THE PRECONDITION. "To use daily preparation you must have fully
 *   rested (typically 8 hours)." Nothing asked. A character could press
 *   the button on the hour, every hour, and refill everything.
 *
 *   "SPELLS WITH A DURATION OF 24 HOURS OR LESS END." The card printed
 *   *"Reminder — handle manually"* and left it to the GM, beside four
 *   other lines it had already automated.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "TYPICALLY 8 HOURS" IS NOT ALWAYS 8, which is why the requirement is
 * asked of `fullRestHours` rather than frozen here: a race or an effect
 * can shorten a full night, and that helper already knows which. A
 * second copy of the number would disagree with it the first time
 * somebody takes the feat.
 *
 * Pure; no Foundry.
 */

/** A day, in seconds — the ceiling for "24 hours or less". */
export const DAY_SECONDS = 86400;

/**
 * May this character prepare?
 *
 * ─────────────────────────────────────────────────────────────────────
 * NO REST RECORDED IS NOT A REST OF ZERO HOURS (3.586.2).
 *
 * REPORTED FROM A LIVE TABLE, 24 September 2026, at the start of a
 * session: *"characters are getting this message when using daily prep —
 * Grokash Hervik has not fully rested. Daily preparation needs 8 hours;
 * the last rest was 0 — 8 short."*
 *
 * The gate reads a `lastRest` flag that only exists once a rest has been
 * taken THROUGH THE REST WORKFLOW, and that workflow only began stamping
 * it at 3.582.0. So every character alive before that release — every
 * character in the world, the morning the release landed — had no flag,
 * `Number(null ?? 0)` gave 0, and 0 is a perfectly finite number that is
 * less than 8. The gate was not reporting a short rest. It was reporting
 * an absence, in the words of a short rest, and it locked the whole party
 * out of daily preparation with no way back except taking another full
 * rest they had already taken in the fiction.
 *
 * IT IS THE `Number(null)` DEFECT, which this project has now recorded
 * five times: null becomes 0, 0 is finite, and a comparison that should
 * have refused to answer answers "no".
 *
 * AND THE ANSWER WAS ALREADY WRITTEN, TWENTY LINES DOWN THIS FILE.
 * `spellEndsAtPreparation` faces exactly this question about a duration
 * and gets it right: "An effect with no duration recorded is not 'zero
 * seconds, which is less than a day'; it is a spell nobody gave an end
 * to." A rest nobody recorded is not a rest of zero hours; it is a rest
 * nobody recorded, and the honest response to no information is not to
 * refuse.
 *
 * SO AN UNRECORDED REST IS ALLOWED, AND SAID. The caller prints a line
 * explaining that no rest has been recorded yet — because a gate that
 * silently passes is how this one came to be needed in the first place.
 * A rest that IS recorded and is too short is still refused, which is the
 * rule page 229 states and the whole point of the gate.
 *
 * @param {object} state
 * @param {number|null} state.hoursRested how long the last rest was, or
 *   null/undefined when no rest has ever been recorded for them
 * @param {number} state.requiredHours what a full rest is for them
 * @returns {{allowed: boolean, short: number, requiredHours: number,
 *   unrecorded: boolean}}
 */
export function dailyPreparationAllowed({ hoursRested = null, requiredHours = 8 } = {}) {
  const required = Math.max(0, Number(requiredHours) || 0);
  // NOT `|| 0`, and not a truthiness test. Both would fold a recorded
  // rest of zero hours into "unrecorded" — and a zero IS information:
  // somebody's rest was interrupted before it began.
  const unrecorded = hoursRested === null || hoursRested === undefined
    || !Number.isFinite(Number(hoursRested));
  if (unrecorded) {
    return { allowed: true, short: 0, requiredHours: required, unrecorded: true };
  }
  const rested = Math.max(0, Number(hoursRested));
  return {
    allowed: rested >= required,
    short: Math.max(0, required - rested),
    requiredHours: required,
    unrecorded: false
  };
}

/**
 * Does a spell effect end at daily preparation?
 *
 * "Spells with a duration of 24 hours or less end." Read from the
 * effect's own recorded duration, not from how much of it is left — a
 * one-hour spell cast five minutes ago has 55 minutes to run and still
 * ends, because the rule is about the spell's LENGTH, not its remainder.
 *
 * A PERMANENT OR UNBOUNDED SPELL SURVIVES. An effect with no duration
 * recorded is not "zero seconds, which is less than a day"; it is a
 * spell nobody gave an end to, and ending it here would quietly cancel
 * every permanent enchantment on the character every morning.
 *
 * @param {object} effect an ActiveEffect-shaped thing
 * @param {string} systemId
 * @returns {boolean}
 */
export function spellEndsAtPreparation(effect, systemId = "trg-prime") {
  const flags = effect?.flags?.[systemId] ?? {};
  if (!flags.spellEffect) return false;
  const seconds = Number(effect?.duration?.seconds);
  if (!Number.isFinite(seconds) || seconds <= 0) return false;
  return seconds <= DAY_SECONDS;
}

/**
 * The line the card prints instead of the old manual reminder.
 *
 * @param {string[]} names what ended
 * @returns {string|null}
 */
export function endedSpellsLine(names = []) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return "<em>No spell of 24 hours or less was running.</em>";
  return `<strong>Ended — 24 hours or less:</strong> ${list.join(", ")}.`;
}
