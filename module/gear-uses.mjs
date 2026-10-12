/**
 * Finite-use gear consumption (Chapter 6/9, per Graham directly): a
 * Component Pouch spends one use per spell cast with a material
 * component; Healers Tools spend one use per Medicine check that
 * requires them. Kept as its own small module — pure logic, matching
 * this system's usual separation from the Foundry-side workflow that
 * actually calls it (in cast-workflow.mjs and action-workflow.mjs).
 */

/**
 * Finds an equipped gear item carrying a given trait — used to
 * identify a Component Pouch or Healers Tools robustly by function
 * rather than by display name, which a player could rename.
 *
 * @param {Array<{type: string, system: object}>} items
 * @param {RegExp} traitPattern
 * @returns {object|null}
 */
/**
 * The trait that marks a piece of gear as healer's tools.
 *
 * ONE SPELLING, added at 3.407.0. It was written twice — this regex in
 * combat/action-workflow.mjs, where the tools are SPENT, and a trait
 * string in magic/healing-earth.mjs, where a spell creates a substitute
 * that has to match it. Two spellings of one fact is the defect shape
 * that has cost this project five bugs; the most recent was the marker
 * flag `mutate-markers` #10 renamed while fifty-nine checks stayed green,
 * because the writer and the reader each held their own copy.
 *
 * Matches the pack item's own "Healer's Tools", with or without the
 * apostrophe, in any case.
 */
export const HEALERS_TOOLS = /\bhealer'?s tools\b/i;

/**
 * The flag marking gear that a spell made and that will revert on its
 * own. See TEMPORARY GEAR IS SPENT FIRST, below.
 */
export const TEMPORARY_GEAR_FLAG = "temporaryGear";

/** Is this a conjured, self-reverting piece of gear? */
export function isTemporaryGear(item) {
  return Boolean(item?.flags?.["trg-prime"]?.[TEMPORARY_GEAR_FLAG]);
}

/**
 * The equipped gear that satisfies a trait requirement, or null.
 *
 * TEMPORARY GEAR IS SPENT FIRST (3.407.0), and this is a RULING rather
 * than a reading — the book does not say. Healing Earth "can be used
 * instead of traditional healer's tools", and a character holding both
 * the earth and a real kit previously had the question settled by
 * whichever document happened to come first in the collection, which is
 * arbitrary and silently so.
 *
 * Spending the conjured one first is the only answer that never wastes a
 * resource: the earth reverts to dirt in ten minutes whether or not it
 * is used, and the tools do not. A player who had noticed would always
 * choose it. Declared here rather than left to document order so that
 * the behaviour is at least a decision somebody made.
 */
export function findEquippedGearByTrait(items, traitPattern) {
  const matches = Array.from(items ?? []).filter(
    (item) =>
      item.type === "gear" &&
      item.system?.equipped &&
      traitPattern.test(String(item.system?.traits ?? ""))
  );
  return matches.find(isTemporaryGear) ?? matches[0] ?? null;
}

/**
 * The new `uses.value` after spending one use, clamped so it never
 * goes negative and never exceeds the item's own max (in case of a
 * pre-existing data inconsistency).
 *
 * @param {number} currentValue
 * @param {number} max
 * @returns {number}
 */
export function consumedUseValue(currentValue, max) {
  const clampedCurrent = Math.max(0, Math.min(Number(max) || 0, Math.floor(Number(currentValue) || 0)));
  return Math.max(0, clampedCurrent - 1);
}
