/**
 * An item's spell is cast at the ITEM's level (3.617.0, A11 of block 37;
 * Graham's R23).
 *
 * Items & Innate Spells (index 361): "the level used to determine the DC and
 * attack check of the item is determined by the items level and not yours."
 * Graham ruled it sets the free warp budget too, for every item that grants a
 * spell — the wondrous spell items, and the Spell Effect runes (Air Drake
 * Armour's Fly, Quick Plate's Haste).
 *
 * The granted spell records its item (`spellEffectRune.itemId`); the level is
 * read LIVE from that item, so a spell granted before 3.617.0 needs no
 * re-grant, and a re-levelled item is felt at once.
 */

const SYSTEM_ID = "trg-prime";
const GRANT_FLAG = "spellEffectRune";

/** The owned item that granted this spell, or null. */
export function grantingItemOf(spell, items = []) {
  const id = spell?.flags?.[SYSTEM_ID]?.[GRANT_FLAG]?.itemId;
  if (!id) return null;
  return Array.from(items ?? []).find((item) => (item?.id ?? item?._id) === id) ?? null;
}

/**
 * The level an innate cast of this spell is made at.
 * @param {object} spell
 * @param {Array} items the caster's items
 * @param {number} characterLevel
 * @returns {{level: number, itemName: string|null}}
 */
export function innateCastLevel(spell, items, characterLevel) {
  const item = grantingItemOf(spell, items);
  const itemLevel = Math.floor(Number(item?.system?.itemLevel) || 0);
  if (item && itemLevel > 0) return { level: itemLevel, itemName: item.name ?? null };
  return { level: Math.max(0, Math.floor(Number(characterLevel) || 0)), itemName: null };
}
