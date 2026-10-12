/**
 * Attitude, applied to real actors.
 *
 * NEW at 3.408.0. The Foundry half of `attitude.mjs`, kept apart so the
 * ladder itself stays importable by the harness — the split this project
 * has now paid for five times when a decision was made inside a
 * Foundry-only function that nothing could call.
 *
 * Everything here is bookkeeping: read a flag, ask the pure module what
 * the answer is, write the flag back. No rule is decided in this file.
 */

import {
  ATTITUDE_FLAG, TEMP_ATTITUDE_FLAG, applyAttitudeShift, charmedTo, effectiveAttitude,
  prunedTemporaryAttitudes, shiftAttitude, withTemporaryAttitude
} from "./attitude.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * How `subject` feels about `observer` RIGHT NOW.
 *
 * Asks both layers, so a live charm wins and a lapsed one falls back to
 * whatever conversation put there. Every gate and card goes through this
 * one function — two readers, one asking only the base, would disagree
 * the moment a spell was in force.
 */
export function attitudeOf(subject, observerUuid) {
  return effectiveAttitude(
    subject?.getFlag?.(SYSTEM_ID, ATTITUDE_FLAG) ?? {},
    subject?.getFlag?.(SYSTEM_ID, TEMP_ATTITUDE_FLAG) ?? {},
    observerUuid,
    Number(game?.time?.worldTime ?? 0)
  );
}

/**
 * Move `subject`'s attitude toward `observer` by N steps and record it.
 *
 * RETURNS WHAT HAPPENED so the card can say it — and says nothing itself,
 * because the caller owns the card. A clamped no-op reports `moved:
 * false` rather than a cheerful line about a change that did not occur.
 *
 * @returns {Promise<{from:string,to:string,moved:boolean}>}
 */
export async function shiftAttitudeToward(subject, observerUuid, steps) {
  const record = subject?.getFlag?.(SYSTEM_ID, ATTITUDE_FLAG) ?? {};
  const result = applyAttitudeShift(record, observerUuid, steps);
  if (result.moved) await subject.setFlag(SYSTEM_ID, ATTITUDE_FLAG, result.record);
  return { from: result.from, to: result.to, moved: result.moved };
}

/**
 * THE ONE WRITER OF THE TEMPORARY LAYER.
 *
 * Both spell operations end in a step and a span, so both come through
 * here — the `markerFlagData` shape, where two callers writing the same
 * flag their own way is how a mutation renames one and fifty-nine checks
 * stay green.
 *
 * `seconds` null means it does not lapse — Thrall's fumble.
 *
 * PRUNED ON THE WAY PAST, as `consumeMarker` does with immunities:
 * nothing depends on it, but a flag that only grows grows for ever.
 */
async function setTemporaryAttitude(subject, observerUuid, step, seconds) {
  const now = Number(game?.time?.worldTime ?? 0);
  const record = prunedTemporaryAttitudes(
    subject?.getFlag?.(SYSTEM_ID, TEMP_ATTITUDE_FLAG) ?? {}, now);
  const until = seconds === null || seconds === undefined ? null : now + Number(seconds);
  await subject.setFlag(SYSTEM_ID, TEMP_ATTITUDE_FLAG,
    withTemporaryAttitude(record, observerUuid, step, until));
}

/**
 * A charm: "becomes friendly toward you; helpful if already friendly."
 *
 * @returns {Promise<{from:string,to:string,moved:boolean}>}
 */
export async function charmAttitude(subject, observerUuid, floor, seconds) {
  const from = attitudeOf(subject, observerUuid);
  const to = charmedTo(from, floor);
  await setTemporaryAttitude(subject, observerUuid, to, seconds);
  return { from, to, moved: from !== to };
}

/**
 * Tame: one step better, FOR THE SPELL'S DURATION.
 *
 * TEMPORARY, and it nearly was not. The first cut sent this through
 * `shiftAttitudeToward`, which writes the PERMANENT map — so a 1-minute
 * cantrip would have permanently changed how an animal felt, and the
 * "once the spell ends" clause would never have happened. Tame says
 * plainly: *"This effect lasts for the duration of the spell."*
 *
 * A conversation changes someone; a spell wears off. That distinction is
 * the whole reason there are two maps.
 */
export async function charmAttitudeByStep(subject, observerUuid, steps, seconds) {
  const from = attitudeOf(subject, observerUuid);
  const to = shiftAttitude(from, steps);
  await setTemporaryAttitude(subject, observerUuid, to, seconds);
  return { from, to, moved: from !== to };
}

/** The card line for a shift, or null when nothing moved. */
export function attitudeLine(subjectName, result) {
  if (!result?.moved) return null;
  return `<strong>${subjectName}</strong> is now <strong>${result.to}</strong> toward you`
    + ` (was ${result.from}).`;
}

