/**
 * SNIPING WITH A SPELL (3.683.0; Eldritch Arts Block 5, D14's Sniping half,
 * seam C15).
 *
 * Silent Spellstrike: "You may use the Sniping (Stealth) skill action with
 * spells that have the Attack trait. When doing so, you must still meet all
 * normal requirements for that action."
 *
 * Sniping's trigger is "you've inflicted a critical with a ranged weapon
 * within its first range increment" (combat/critical-adjust.mjs
 * `criticalReactionTrigger`), read from the critical remembered on the
 * attacker. A spell's critical has always been remembered as a melee one
 * (`rollCriticalInjury`'s defaults), so no spell could open it. This file
 * says what a spell attack's critical records instead, for a caster who owns
 * something declaring `flags.trg-prime.spellSniping: true`:
 *
 *   - RANGED: a spell whose range is a distance. Touch and self are not (a
 *     touch spell's attack is a melee one), nor is a spell that prints no
 *     range, whose silence the core reads as "self" (spell-range.mjs).
 *   - WITHIN ITS FIRST RANGE INCREMENT, read as WITHIN THE SPELL'S RANGE
 *     (Graham, Q86: "A critical on a spell attack within the spell's range"):
 *     spells print one range and no increments. A range the core cannot read
 *     as a number ("unlimited", "see text") sets no limit. A distance nobody
 *     could measure (no token) is not within it, as a weapon's is not
 *     (`withinFirstRangeIncrement`).
 *
 * The target-state half ("unaware or flat-footed") stays the GM's, as it is
 * for weapons. Without the declaration nothing changes: the record is the
 * melee default it always was.
 *
 * Pure.
 */
import { outOfSpellRange, spellRangeFeet } from "./spell-range.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Does anything the caster owns open Sniping to their spell attacks?
 * A disabled effect, or an ability switched off, declares nothing.
 *
 * @param {Array<object>} sources the caster's items and applied effects
 * @returns {boolean}
 */
export function declaresSpellSniping(sources = []) {
  return Array.from(sources ?? []).some((s) =>
    s && !s.disabled && s.system?.active !== false && s.flags?.[SYSTEM_ID]?.spellSniping === true);
}

/**
 * What a spell attack's critical records for Sniping's trigger, or null to
 * leave the core's default (a melee critical, which Sniping refuses).
 *
 * @param {object} opts
 * @param {boolean} opts.declared   `declaresSpellSniping` for the caster
 * @param {string}  opts.rangeText  the cast's range, warped, as the range gate reads it
 * @param {number|null} opts.distanceFeet caster to the creature critted
 * @param {number}  [opts.reach]    the caster's touch reach
 * @returns {{weaponIsRanged: boolean, withinFirstIncrement: boolean}|null}
 */
export function spellCriticalSnipingFacts({ declared = false, rangeText = "", distanceFeet = null, reach = 5 } = {}) {
  if (!declared) return null;
  const t = String(rangeText ?? "").trim();
  const ranged = Boolean(t) && !/^(touch|self|personal)$/i.test(t);
  if (!ranged) return { weaponIsRanged: false, withinFirstIncrement: false };
  const measured = distanceFeet !== null && distanceFeet !== undefined && distanceFeet !== "" && Number.isFinite(Number(distanceFeet));
  const within = measured && !outOfSpellRange(Number(distanceFeet), spellRangeFeet(t, reach));
  return { weaponIsRanged: true, withinFirstIncrement: within };
}
