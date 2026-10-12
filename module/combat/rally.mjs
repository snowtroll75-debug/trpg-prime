/**
 * Rally (Chapter 6, Skill Actions — Diplomacy): "Critical Reduce the
 * creature's frightened value by 2. Success Reduce the creature's
 * frightened value by 1."
 *
 * Scoped to the single targeted creature. The rulebook's base version
 * is genuinely an emanation — "each of them... in a 10-foot emanation
 * around you who are frightened" — not an optional upgrade the way
 * Demoralise's extra targets are; this project has no multi-target
 * infrastructure yet (the same gap already noted for the Spread
 * weapon trait and Treat Wounds' additional-target option elsewhere
 * in this audit). Automating the reduction for whichever single
 * creature is actually targeted is still a genuine, honest piece of
 * the action — the GM/player can apply the same reduction by hand to
 * anyone else affected in the emanation.
 */

/**
 * @param {string} degreeKey
 * @returns {number} 0 if this degree grants no reduction.
 */
export function rallyReduction(degreeKey) {
  if (degreeKey === "critical" || degreeKey === "heroic") return 2;
  if (degreeKey === "success") return 1;
  return 0;
}
