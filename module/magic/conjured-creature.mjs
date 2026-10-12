/**
 * THE CONJURE SPELLS' ONE WARPING OPTION.
 *
 * NEW at 3.565.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT, FOUND BY CASTING IT.
 *
 * Graham reported on 17 September 2026, from his own session:
 *
 *   "The sheet only allows the warping option to be applied once. This
 *    warping should be allowed multiple times (the same with the other
 *    conjure spells)."
 *
 * All nine conjure spells sell the same option —
 *
 *   "+1 PP: increase the max level of the creature by 1 (to a maximum of
 *    your caster level)"
 *
 * — and all nine carried `mods: {}`. `warpScalesWithRepeats` asks the
 * aggregator whether a second purchase changes anything; with no mods
 * there is nothing to change, so it answered no, and `buildWarpChooser`
 * drew a checkbox. A 20th-level caster could raise a 1st-level elemental
 * to 2nd and no further.
 *
 * THIS IS NOT THE QUALITATIVE CASE, which `warp-area.mjs` already sets
 * out: 478 of the pack's 702 warps carry no mods by design, because their
 * text is for the GM to apply. This one names a NUMBER, prints a CEILING
 * for it, and charges 1 PP per step — the three things that make a warp a
 * count box rather than a checkbox. It had no mods only because nobody
 * had written them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE PRINTED CEILING IS CARRIED ON THE WARP.
 *
 * "To a maximum of your caster level" is an absolute ceiling on the
 * RESULT, the same shape as an area warp's "max 50 feet" — and, like the
 * area cap, it means nothing without the spell's own printed starting
 * point. Each conjure prints its own, and prints it six different ways:
 *
 *   "This plant must be 1st level or lower."            Conjure Plant
 *   "This elemental must no more than level 1."         Conjure Elemental
 *   "This fey must be of 1st level or lower."           Conjure Fey
 *   "The swarm can be no more than 1st level."          Conjure Swarm
 *   "This animal must be no more than level 1."         Conjure Animal
 *   "This aberration must be 9th level or lower."       Conjure Entity
 *
 * PARSING SIX PHRASINGS OUT OF PROSE IS THE FRAGILE ANSWER, and it would
 * fail silently — a description reworded in a later revision would drop a
 * spell back to a checkbox with nothing to notice it. `conjuredBase` is
 * declared on the warp instead, through `tools/data-fixes.json` with
 * from/to guards, so the number is data rather than a guess. The nine
 * values are asserted against the printed descriptions by
 * `verify-conjure-warp`.
 */

/**
 * The most times the option can be bought: enough steps to walk the
 * spell's printed ceiling up to the caster's level, and no further.
 *
 * AN UNKNOWN CASTER LEVEL IS NOT A CEILING OF ZERO. The magic-item
 * workbench builds a chooser from a bare `{ name, system: { warps } }`
 * with no actor behind it, and an unknown level there must not silently
 * become "you may not buy this at all". It returns null, which
 * `warpMaxTimes` reads as "no computable cap" and falls through to its
 * own unlimited answer — the same thing it does for every other warp
 * with no printed ceiling.
 *
 * @param {object} mods the warp's own mods
 * @param {number|null} casterLevel
 * @returns {number|null} purchases, or null when it cannot be computed
 */
export function conjuredLevelMaxTimes(mods, casterLevel) {
  const step = Math.max(0, Math.trunc(Number(mods?.conjuredLevel) || 0));
  if (!step) return null;
  const base = Number(mods?.conjuredBase);
  if (!Number.isFinite(base)) return null;
  const level = Number(casterLevel);
  if (!Number.isFinite(level) || level <= 0) return null;
  // ONE FLOOR, NOT TWO — the same reasoning recorded on
  // `areaGrowthMaxTimes`. A caster whose level is at or below the spell's
  // printed ceiling divides to zero or negative, and the floor carries it
  // rather than a separate guard that no mutation could reach.
  return Math.max(1, Math.ceil((level - base) / step));
}

/**
 * The level of creature this casting may actually conjure.
 *
 * THE CLAMP LIVES HERE AS WELL AS IN THE CHOOSER, and that is not a
 * duplicated rule — they answer different questions. The chooser stops a
 * caster BUYING a step they cannot use; this states what the purchased
 * steps came to, and it is the only answer available on the item-cast
 * path, where the chooser never ran and the warp was settled at the
 * workbench.
 *
 * @param {object} mods aggregated warp mods
 * @param {number} casterLevel
 * @returns {{base: number, warped: number, level: number, clamped: boolean}|null}
 */
export function conjuredCreatureLevel(mods, casterLevel) {
  const base = Number(mods?.conjuredBase);
  if (!Number.isFinite(base)) return null;
  const bought = Math.max(0, Math.trunc(Number(mods?.conjuredLevel) || 0));
  const warped = base + bought;
  const ceiling = Number(casterLevel);
  // A CASTER LEVEL THAT IS NOT A NUMBER CANNOT LOWER ANYTHING. An item
  // cast reads the item's own level and a bare workbench preview has
  // none; neither is a reason to report a creature weaker than the PP
  // that was spent on it.
  const level = Number.isFinite(ceiling) && ceiling > 0 ? Math.min(warped, ceiling) : warped;
  return { base, warped, level, clamped: level < warped };
}

/**
 * The card line, or "" when this spell conjures nothing.
 *
 * WHY IT SAYS SO WHEN IT CLAMPS. The PP was spent before the ceiling was
 * read, so a caster who bought four steps and can use two has paid for
 * four. Printing only the result would leave them to work that out from
 * the PP total; naming it is the difference between a rule and a
 * surprise.
 *
 * @param {object} mods aggregated warp mods
 * @param {number} casterLevel
 * @returns {string}
 */
export function conjuredCreatureNote(mods, casterLevel) {
  const result = conjuredCreatureLevel(mods, casterLevel);
  if (!result || !Math.trunc(Number(mods?.conjuredLevel) || 0)) return "";
  const head = `Conjured creature: up to <strong>level ${result.level}</strong> (printed ${result.base}`;
  const bought = result.warped - result.base;
  const body = `, warped +${bought})`;
  if (!result.clamped) return `${head}${body}.`;
  return `${head}${body} — capped at your caster level ${casterLevel}.`;
}
