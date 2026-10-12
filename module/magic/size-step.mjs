/**
 * A SPELL THAT CHANGES THE SIZE OF THE FORM YOU ARE IN (3.595.0).
 *
 * Graham, 26 September 2026, R3 of block 31: *"Your Recommendation"* —
 * build it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SEVENTEEN WARPS, AND THEY ARE ONE SENTENCE.
 *
 * Measured across the pack before a line was written: *"you may increase
 * or decrease the size of the form by one step"* and *"…by two steps"*
 * appear on all NINE Shape Of The … spells and on nothing else — 17
 * options, every one of them inert. That is the most-repeated inert warp
 * text in the Grimoire; the next most common, the duration bump, is
 * wired. A key that serves 17 options is worth having, which is the whole
 * argument for building this one and not the one-offs beside it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN OVERRIDE, AT PRIORITY 30, and not a number written onto the sheet.
 *
 * This is `hulking-form.mjs`'s reasoning and it is repeated rather than
 * referenced because getting it wrong is silent: `system.identity.size`
 * is set by a race's own ActiveEffect at priority 10, so an override at a
 * higher priority is the only way a change here survives the next
 * preparation. A `Use` button that wrote the field would be overwritten
 * by the very next derivation.
 *
 * SIZE IS AN INPUT TO MOST OF THE SHEET — the Strength and Dexterity size
 * rows, the size row of the HP table, reach, and the space a creature
 * occupies — so this is one change with a long reach, and none of it
 * needs code here.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EITHER DIRECTION, BECAUSE THE PAGE SAYS "increase or decrease".
 *
 * The direction is the caster's at cast time, which is why it is asked
 * rather than assumed; the number of steps is what was bought. A step
 * off either end of the table clamps (`sizeStepUp` and `sizeStepDown`
 * both clamp, and for the same printed reason), so a colossal form asked
 * to grow stays colossal and the card says the size did not move.
 */

import { SIZE_STEPS, sizeStepDown, sizeStepUp } from "../companion.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";

const int = (v) => Math.trunc(Number(v) || 0);

/** Where the size ends up, or null when the starting size is unreadable. */
export function sizeStepTarget(currentSize, steps) {
  const from = String(currentSize ?? "").trim().toLowerCase();
  if (SIZE_STEPS.indexOf(from) < 0) return null;
  const count = Math.abs(int(steps));
  if (count === 0) return from;
  const step = int(steps) > 0 ? sizeStepUp : sizeStepDown;
  let size = from;
  for (let i = 0; i < count; i += 1) size = step(size);
  return size;
}

/**
 * The ActiveEffect change that resizes the creature, or null.
 *
 * NULL WHEN NOTHING MOVES, which is not the same as a malformed row: a
 * huge form asked to grow twice at the top of the table has bought
 * something the table cannot give, and the caller says so out loud rather
 * than writing an effect that changes nothing.
 */
export function sizeStepChange(currentSize, steps) {
  const to = sizeStepTarget(currentSize, steps);
  if (!to || to === String(currentSize ?? "").trim().toLowerCase()) return null;
  return {
    key: "system.identity.size",
    type: CHANGE_TYPE.OVERRIDE,
    value: to,
    priority: 30
  };
}

/** What the card says when the form changes size. */
export function sizeStepLine(name, from, to, steps) {
  const word = Math.abs(int(steps)) === 1 ? "one step" : `${Math.abs(int(steps))} steps`;
  return `<strong>${name}</strong> is <strong>${to}</strong> &mdash; ${word} `
    + `${int(steps) > 0 ? "larger" : "smaller"} than ${from}. Every size modifier follows it: `
    + "Strength and Dexterity, base HP, reach and the space it occupies.";
}

/** And when it does not, because the table has no room left. */
export function sizeStepRefusedLine(name, from, steps) {
  return `<em><strong>${name}</strong> stays <strong>${from}</strong> &mdash; the size table has `
    + `no room ${int(steps) > 0 ? "above" : "below"} it.</em>`;
}

/*
 * ─────────────────────────────────────────────────────────────────────
 * SIZE ALTERATION (PP 6, page 324) — a size step with a ceiling
 * (3.608.0, R4 of block 32).
 *
 *   "the target increases in size by one step … This spell has no effect
 *    on a Large or larger creature.
 *      +2 PP: reduce the size of a creature (tiny min).
 *      +6 PP: change the targets size by two steps, or a large creature by
 *             one step."
 *
 * THE +6 OPTION IS ONE RULE, NOT TWO. "Two steps, or a large creature by
 * one" is a step count that shrinks by one for every size the creature
 * stands above the spell's printed ceiling:
 *
 *                 medium or less   large   huge+
 *     unwarped         1             0       0     ← "no effect on Large"
 *     +6 PP            2             1       0
 *
 * so the row carries its ceiling (`largestAffected`) and the warp carries
 * one more step (`sizeReach`), and the table falls out of the subtraction.
 *
 * THE CEILING BINDS A REDUCTION TOO. "This spell has no effect on a Large
 * or larger creature" is said of the spell, not of growing; the reduce
 * option changes the direction and nothing else, so shrinking a Large
 * creature is what the +6 option buys, exactly as growing one is.
 *
 * "TINY MIN" IS A FLOOR, NOT A REFUSAL: a Small creature told to shrink two
 * steps stops at Tiny and the card says it moved one.
 */

/**
 * How many steps Size Alteration moves this creature, signed.
 *
 * @param {string} currentSize
 * @param {object} spec the row: steps, largestAffected, floor
 * @param {{reach?: number, reverse?: boolean}} warp
 * @returns {{steps: number, why: string}} `steps` 0 with a reason when nothing moves
 */
export function boundedSizeSteps(currentSize, spec = {}, { reach = 0, reverse = false } = {}) {
  const from = String(currentSize ?? "").trim().toLowerCase();
  const at = SIZE_STEPS.indexOf(from);
  if (at < 0) return { steps: 0, why: "unknown size" };
  const ceiling = SIZE_STEPS.indexOf(String(spec.largestAffected ?? "").trim().toLowerCase());
  const base = Math.max(0, int(spec.steps ?? 1)) + Math.max(0, int(reach));
  const over = ceiling < 0 ? 0 : Math.max(0, at - ceiling);
  const count = Math.max(0, base - over);
  if (!count) return { steps: 0, why: "too large" };
  if (!reverse) {
    const room = SIZE_STEPS.length - 1 - at;
    return room > 0 ? { steps: Math.min(count, room), why: "" } : { steps: 0, why: "no room" };
  }
  const floor = SIZE_STEPS.indexOf(String(spec.floor ?? "").trim().toLowerCase());
  const lowest = floor < 0 ? 0 : floor;
  const room = at - lowest;
  return room > 0 ? { steps: -Math.min(count, room), why: "" } : { steps: 0, why: "at the floor" };
}

/** The card line when Size Alteration moves nobody. */
export function boundedSizeRefusedLine(name, from, why, spec = {}) {
  if (why === "too large") {
    return `<em><strong>${name}</strong> is ${from} — ${spec.label || "the spell"} has no effect on a creature `
      + `larger than ${spec.largestAffected}${int(spec.steps) > 0 ? " without the +6 PP option" : ""}.</em>`;
  }
  if (why === "at the floor") {
    return `<em><strong>${name}</strong> is already ${from} — the smallest ${spec.label || "the spell"} can make it.</em>`;
  }
  return sizeStepRefusedLine(name, from, 1);
}
