/**
 * A CONDITION NOTHING CAN LIFT (3.602.0).
 *
 * Graham's R6 of block 31, 26 September 2026: "Build."
 *
 * PRINTED (Resurrection, page 311): "The time in the realm of the dead leaves
 * the target temporarily debilitated, giving it the injured 2 condition for
 * 1 week; THIS CONDITION CANNOT BE REMOVED OR REDUCED BY ANY MEANS."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A SEAL, AND NOT A SPECIAL KIND OF CONDITION.
 *
 * The obvious build is a different injured — one the relief path does not
 * recognise. That is wrong twice over: the sheet must still show Injured 2 and
 * apply its penalties like any other, and `conditionModifiers` (registry.mjs)
 * reads the condition by NAME out of the actor's values map — a creature whose
 * injury does not count as an injury is a worse bug than the one being fixed.
 *
 * THAT NAME WAS WRONG HERE UNTIL THE LIVE DRIVE. This header called the reader
 * `conditionalPenalties`, which is not a function this project has ever had. A
 * comment naming a function nobody exports is the same defect as a check
 * matching comment prose: a claim that reads as measured and is not. So S10
 * below now RUNS the real reader against a sealed Injured 2 and counts the
 * penalty rows, rather than this paragraph asserting that it would.
 *
 * So the condition is ORDINARY and the SEAL is separate: a record on the actor
 * saying "this condition may not be reduced until this time". The relief path
 * asks before it writes, and refuses OUT LOUD. Everything that reads the
 * condition keeps reading it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT A SEAL DOES NOT DO.
 *
 * It does not stop a GM clicking the condition off in the HUD, and it should
 * not: "by any means" is a claim about what happens inside the fiction —
 * spells, items, rests — not about whether the table can overrule its own
 * game. The card says so rather than leaving a GM to discover it.
 *
 * KEYED BY CONDITION, WITH AN EXPIRY, because the seal in the book has one:
 * a week. A sealed condition whose seal has lapsed is an ordinary condition
 * again, and the relief that was refused on Tuesday works on the following
 * Wednesday.
 */

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/** The flag the seals live in, on the actor. */
export const SEALED_FLAG = "sealedConditions";

/**
 * How long a seal has left, in seconds, or 0 when there is none.
 *
 * TAKES THE RECORD AND THE CLOCK, not the actor, so the harness can drive
 * every boundary without a world.
 */
export function sealRemaining(record, condition, now) {
  const until = Number((record ?? {})[text(condition).toLowerCase()]);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, until - Number(now));
}

/** Is this condition sealed right now? */
export function isSealed(record, condition, now) {
  return sealRemaining(record, condition, now) > 0;
}

/**
 * The record with `condition` sealed for `seconds` from `now`.
 *
 * THE LONGER SEAL WINS, so a second week does not shorten the first — the
 * same rule `withImmunity` follows, and for the same reason: two sources of
 * the same protection should not be able to weaken each other.
 */
export function withSeal(record, condition, seconds, now) {
  const key = text(condition).toLowerCase();
  if (!key || int(seconds) <= 0) return { ...(record ?? {}) };
  const until = Number(now) + int(seconds);
  const existing = Number((record ?? {})[key]);
  return {
    ...(record ?? {}),
    [key]: Number.isFinite(existing) && existing > until ? existing : until
  };
}

/**
 * The record with every lapsed seal dropped.
 *
 * A creature raised a dozen times over a campaign should not carry a dozen
 * dead timestamps — the same housekeeping `prunedImmunities` does.
 */
export function prunedSeals(record, now) {
  const out = {};
  for (const [key, until] of Object.entries(record ?? {})) {
    if (Number(until) > Number(now)) out[key] = Number(until);
  }
  return out;
}

/** What the card says when something tries to lift a sealed condition. */
export function sealRefusedLine(targetName, label, remaining) {
  return `<em>${targetName}'s <strong>${label}</strong> cannot be removed or reduced by any means`
    + `${remaining ? ` — ${remaining} left` : ""}.</em>`;
}

/** And the note that goes on the card when a seal is applied. */
export function sealAppliedLine(targetName, label, remaining) {
  return `<strong>${targetName}</strong>'s <strong>${label}</strong> is sealed for ${remaining} — `
    + "no spell, item or rest can remove or reduce it.";
}
