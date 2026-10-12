/**
 * A SPELL THAT CHANGES WHAT THE AVOIDANCE CHECK SEES (3.597.0).
 *
 * Graham's R12, 27 September 2026. See Invisible is the first spell in the
 * Grimoire whose whole effect is a fact about the CASTER that some other
 * rule reads later — not damage, not a condition on a target, not a bonus
 * on a sheet, but "invisible creatures are concealed TO YOU" for ten
 * minutes, read at the moment somebody swings.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE `sense` KIND, WHICH ALREADY EXISTS.
 *
 * I nearly authored this as a `sense` row, which would have been the exact
 * mistake this project keeps finding: a rail that greps as a perfect match.
 * `sense` grants a PERCEPTION sense — a category, a range, and a `finds`
 * string — through `grantedSenseBlock`, and it is read by `actorSenses` to
 * draw the sheet's sense line. Its `finds` field is DISPLAY ONLY: nothing
 * anywhere reads it when an attack is resolved. A See Invisible authored as
 * `sense` with `finds: "invisible"` would have printed beautifully on the
 * sheet and changed nothing about any attack, for ever.
 *
 * So the two kinds are named for what reads them. `sense` is read by the
 * sheet; `avoidanceSight` is read by `missChanceAvoidance`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ROW MAKES AN EFFECT WITH NO CHANGES AT ALL.
 *
 * That is the shape of a thing that does nothing, which is why the
 * vocabulary lives in this file rather than in three lines of the applier:
 * a row naming a sight nothing reads is REFUSED, and `verify-see-invisible`
 * S1 asserts every entry's flag is read on the avoidance path. That is the
 * check that would have caught `invisible` sitting unread in the condition
 * registry — which is the hole R12 exists to close.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LEVEL IS A SET, NOT A GRANT.
 *
 * "A set assigns; a grant takes a maximum" — the distinction that cost a
 * release at 3.595.0. The +4 PP option is "invisible creatures can be seen
 * clearly and are not concealed", which REPLACES the base level rather than
 * stacking with it, so `sightLevel` assigns.
 */

import { SEE_INVISIBLE, SEE_INVISIBLE_FLAG, isSeeInvisibleLevel } from "../combat/invisibility.mjs";

const text = (v) => String(v ?? "").trim();

/**
 * The sights a row may grant, and how to validate a level for each.
 *
 * ONE ENTRY, ON PURPOSE. A second joins when a spell needs it.
 */
export const AVOIDANCE_SIGHTS = Object.freeze({
  seeInvisible: Object.freeze({
    flag: SEE_INVISIBLE_FLAG,
    label: "See Invisible",
    valid: isSeeInvisibleLevel,
    default: SEE_INVISIBLE.CONCEALED
  })
});

/** Is this a sight this system reads? */
export function isAvoidanceSightKey(key) {
  return Object.hasOwn(AVOIDANCE_SIGHTS, text(key));
}

/**
 * An avoidance-sight row, or null when it is malformed.
 *
 * REFUSED: a row naming no sight, a sight nothing reads, and a level the
 * sight does not define. All three would otherwise leave an effect on the
 * caster's sheet for ten minutes doing nothing at all — worse than an
 * error, because it looks like it worked.
 */
export function normaliseAvoidanceSight(raw, warpMods = null) {
  if (!raw || raw.kind !== "avoidanceSight") return null;
  const sight = text(raw.sight);
  if (!isAvoidanceSightKey(sight)) return null;
  const spec = AVOIDANCE_SIGHTS[sight];
  const warped = text(warpMods?.sightLevel);
  const level = warped || text(raw.level) || spec.default;
  if (!spec.valid(level)) return null;
  return { sight, flag: spec.flag, label: spec.label, level };
}

/**
 * What the card says.
 *
 * `durationText` ARRIVES ALREADY BRACKETED. The applier builds it as
 * `` ` (${durationSource})` `` and every other line in that file
 * interpolates it bare — so wrapping it again printed
 * "See Invisible — … ( (10 minutes))" on the 3.597.0 drive. Caught by
 * reading the card rather than by any check, because the check compared the
 * sentence and not the punctuation; N5b now measures it.
 */
export function avoidanceSightLine(casterName, spec, durationText = "") {
  const how = spec.level === SEE_INVISIBLE.CLEAR
    ? "invisible creatures are seen clearly and are not concealed to you"
    : "invisible creatures have the concealed condition to you";
  return `<strong>${casterName}</strong>: ${spec.label} &mdash; ${how}${durationText}.`;
}
