/**
 * WHAT CAN CARRY RUNES — one answer, asked from every rune module.
 *
 * NEW at 3.577.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TRAVELLERS CLOTHING (page 173): "The attire of travellers is robust, can
 * be upgraded like armour, despite not being actual armour." Graham's R9
 * of the block-17 audit (20 September 2026): it carries armour runes while
 * worn, provided no body armour is worn.
 *
 * Until now six modules each asked `["weapon", "armour", "shield"]
 * .includes(item.type)`, so a gear item could never carry a rune however
 * it was flagged. They ask `runeKindOf` instead, and the clothing says
 * what it is with `flags.trg-prime.runeBearing: "armour"` — set in the
 * pack for Travellers, and available to any homebrew garment.
 */

const SYSTEM_ID = "trg-prime";

/** The flag a gear item declares its rune kind with. */
const RUNE_BEARING_FLAG = "runeBearing";

/**
 * The rune catalogue this item draws on, or null if it takes none.
 *
 * @param {object} item
 * @returns {"weapon"|"armour"|"shield"|null}
 */
export function runeKindOf(item) {
  const type = item?.type;
  if (type === "weapon" || type === "armour" || type === "shield") return type;
  if (type === "gear" && item?.flags?.[SYSTEM_ID]?.[RUNE_BEARING_FLAG] === "armour") return "armour";
  return null;
}

/** Is this a runed garment rather than a real piece of armour? */
export function isRunedClothing(item) {
  return item?.type === "gear" && runeKindOf(item) === "armour";
}

/**
 * Body armour: a suit, not a helmet, bracers or greaves. The armour pack
 * files those pieces under "Other".
 */
export function isBodyArmour(item) {
  if (item?.type !== "armour") return false;
  return ["light", "medium", "heavy"].includes(String(item?.system?.category ?? "").trim().toLowerCase());
}

/** Is any equipped body armour being worn? */
function wearsBodyArmour(items = []) {
  return (items ?? []).some((item) => isBodyArmour(item) && item?.system?.equipped);
}

/**
 * Do this item's runes count for its wearer right now?
 *
 * EQUIPPED, as every runed item's must be — and for clothing, WITH NO
 * BODY ARMOUR OVER IT (R9): the clothes are upgraded "like armour", so
 * they are the armour only when there is no other.
 *
 * @param {object} item
 * @param {Array} items the wearer's items
 * @returns {boolean}
 */
export function runesCountFor(item, items = []) {
  if (!runeKindOf(item) || !item?.system?.equipped) return false;
  if (isRunedClothing(item) && wearsBodyArmour(items)) return false;
  return true;
}
