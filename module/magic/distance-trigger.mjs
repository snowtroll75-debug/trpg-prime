/**
 * A CONDITION THAT WAITS UNTIL YOU WALK TOO FAR (3.599.0).
 *
 * Graham's R8 of block 31, 26 September 2026: "Build."
 *
 * PRINTED (Shadow Tether, page 318), PP 6, Basic Reflex, 1 minute:
 *
 *   "You hurl a writhing lash of living darkness that seeks the target's
 *   essence. The target takes 2d8 essence damage and on a failed save,
 *   becomes immobilised for the duration IF THEY MOVE MORE THAN 30 FEET
 *   AWAY FROM YOU."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS THE ONE PLACE IN THE BLOCK WHERE THE SYSTEM DID SOMETHING THE
 * PAGE DOES NOT SAY.
 *
 * The authored row was a bare `condition: "immobilised"` with no trigger, so
 * a failed save immobilised the target WHERE IT STOOD — and a `note` beside
 * it explained the rule the row did not implement. A 6 PP spell that pins a
 * creature in place outright is a much better spell than the one printed,
 * which merely stops it running away. Everything else this project has found
 * in the Grimoire is a rule missing; this was a rule invented.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE ROW DECIDES, AND THE TWO READINGS I HAD TO CHOOSE BETWEEN.
 *
 * "Move more than 30 feet away from you" can mean
 *
 *   (a) the DISTANCE from you exceeds 30 feet, checked when they move; or
 *   (b) they DISPLACE themselves 30 feet further away than they were.
 *
 * I have built (a): the tether is a lash of darkness, and the natural
 * reading of "more than 30 feet away from you" is a distance from you, with
 * "move" naming the moment it is tested. (b) would need a remembered origin
 * and would let a creature cast at 50 feet wander to 79 feet untouched.
 *
 * AND IT IS TESTED AT THE CAST TOO. The spell's range is 60 feet, so a
 * target can already be beyond the tether's 30 when the save fails — the
 * lash is taut the moment it lands, and waiting for a step before applying
 * it would be a strange kind of mercy. Both halves are printed on the card
 * so the table can overrule either.
 *
 * FIRES ONCE. "Becomes immobilised FOR THE DURATION" — so the trigger arms,
 * fires, and disarms; the condition then lasts as long as the spell.
 */

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/*
 * NO FLAG CONSTANT LIVES HERE. The first draft exported `TRIGGER_FLAG` from
 * this file AND `TETHER_FLAG` from the workflow, two names for one flag with
 * only one of them read — the uncalled-export ratchet refused it, correctly.
 * The flag belongs to the workflow that writes and reads it.
 */

/** Whose distance is measured. One entry, because one spell needs it. */
export const TRIGGER_ORIGINS = Object.freeze(["caster"]);

/**
 * A distance-trigger row, or null when it is malformed.
 *
 * REFUSED: a row naming no condition, a threshold of zero or less, and an
 * origin nothing can resolve. A trigger with no distance would fire on the
 * first step — which is the defect this file exists to remove — and one with
 * no condition would fire and apply nothing, silently.
 */
export function normaliseDistanceTrigger(raw) {
  if (!raw || raw.kind !== "distanceTrigger") return null;
  const condition = text(raw.condition).toLowerCase();
  if (!condition) return null;
  const feet = int(raw.feet);
  if (feet <= 0) return null;
  const from = text(raw.from).toLowerCase() || "caster";
  if (!TRIGGER_ORIGINS.includes(from)) return null;
  return { condition, feet, from, label: text(raw.label), value: Math.max(0, int(raw.value)) };
}

/**
 * Has the tether gone taut?
 *
 * TAKES THE MEASURED DISTANCE, not two tokens, so the harness can drive
 * every boundary without a canvas — including the one that matters, which is
 * that exactly 30 feet is NOT more than 30 feet.
 */
export function distanceTriggerFires(spec, feetApart) {
  if (!spec) return false;
  /*
   * THE COMPARISON IS THE GUARD. A `Number.isFinite` check sat here until
   * `mutate-shadow-tether` removed it and nothing changed: `NaN > 30` is
   * already false, so the guard could not alter an answer and was therefore
   * untested code pretending to be a safety rail.
   *
   * IT MUST STAY WRITTEN THIS WAY ROUND. `measured > spec.feet` refuses NaN;
   * the equivalent-looking `!(measured <= spec.feet)` ACCEPTS it, because
   * every comparison with NaN is false. A canvas that cannot answer must not
   * immobilise anybody, and B3 measures exactly that difference.
   */
  const measured = Number(feetApart);
  return measured > spec.feet;
}

/** What the card says when the tether lands, still slack. */
export function distanceTriggerArmedLine(targetName, spec, durationText) {
  return `<strong>${targetName}</strong> is tethered: <strong>${spec.condition}</strong> the moment they `
    + `are more than ${spec.feet} feet from you${durationText}.`;
}

/** And when it was already taut as it landed. */
export function distanceTriggerImmediateLine(targetName, spec, feetApart) {
  return `<strong>${targetName}</strong> is already ${feetApart} feet away &mdash; the tether is taut and `
    + `they are <strong>${spec.condition}</strong> at once.`;
}

/** And when a step pulls it tight later. */
export function distanceTriggerFiredLine(targetName, spec, feetApart) {
  return `<strong>${targetName}</strong> moves ${feetApart} feet from you and the tether snaps taut &mdash; `
    + `<strong>${spec.condition}</strong> for the rest of the spell.`;
}
