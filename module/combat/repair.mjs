/**
 * Repair (Chapter 6, Skill Actions — Crafting): "Critical You restore
 * 2 Hit Points per rank in the crafting skill. Success You restore 1
 * Hit Point per rank in the crafting skill. Fumble You deal 2d6
 * damage to the item, ignoring its Hardness." "You cannot Repair a
 * destroyed item."
 *
 * Reuses this project's existing item-HP infrastructure (items.mjs:
 * itemStatus, applyItemDamage) rather than duplicating it — the same
 * functions Item Damage already uses.
 */

/**
 * @param {number} craftingRanks The actor's Crafting skill *ranks*
 *   specifically (system.skills.crafting.ranks) — not the full
 *   resolved bonus, which also includes ability/class/etc.
 * @param {string} degreeKey
 * @returns {number} 0 if this degree restores nothing.
 */
export function repairHPRestored(craftingRanks, degreeKey) {
  const ranks = Math.max(0, Math.floor(Number(craftingRanks) || 0));
  if (degreeKey === "critical" || degreeKey === "heroic") return ranks * 2;
  if (degreeKey === "success") return ranks;
  return 0;
}
