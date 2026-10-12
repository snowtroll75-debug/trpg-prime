/**
 * AN ITEM'S METAL, CHANGED FOR A WHILE — NEW at 3.614.0, Graham's R11 of
 * 2 October 2026 (block 35): "Yes".
 *
 * Precious Metals (page 355):
 *   "The target item transforms from its normal metal into cold iron, copper,
 *    gold, iron, silver, or steel. An item transmuted in this way deals damage
 *    according to its new material. … this change is both magical and
 *    temporary and so cannot be used to satisfy expensive material components.
 *    +8 PP: Add adamantine, Eaog and mithril to the list of metals you can
 *    transform the item into."
 *
 * THE ITEM'S OWN `material` FIELD IS WRITTEN, because that is what the damage
 * engine already reads for bypass and weakness (`materialDefenceWord`) and a
 * weapon struck with a silver blade must be silver to every reader. An effect
 * on the holder keeps the minute and the metal it was before, and puts it
 * back when it ends.
 *
 * FOUR OF THE NINE METALS ARE PLAIN METAL HERE. Copper, gold, iron and steel
 * carry no rule in Chapter 6's materials table, so the item takes no special
 * material; the card names the metal so a table with a creature weak to gold
 * can apply it.
 *
 * Pure; no Foundry.
 */

export const MATERIAL_SHIFT_FLAG = "materialShift";

/** The metals the page offers, as `{name, key}`; key "" is plain metal. */
const BASE_METALS = Object.freeze([
  { name: "cold iron", key: "coldIron" },
  { name: "copper", key: "" },
  { name: "gold", key: "" },
  { name: "iron", key: "" },
  { name: "silver", key: "silver" },
  { name: "steel", key: "" }
]);
const WARP_METALS = Object.freeze([
  { name: "adamantine", key: "adamantine" },
  { name: "Eaog", key: "eaog" },
  { name: "mithril", key: "mithril" }
]);

/** The unlock the +8 PP warp names. */
const PRECIOUS_UNLOCK = "preciousMetals";

/**
 * The metals one casting may choose from.
 * @param {object} warpMods the aggregated warp mods
 */
export function materialShiftChoices(warpMods = {}) {
  const unlocked = Array.isArray(warpMods?.unlocks) && warpMods.unlocks.map(String).includes(PRECIOUS_UNLOCK);
  return unlocked ? [...BASE_METALS, ...WARP_METALS] : [...BASE_METALS];
}

/** The item types the spell may touch. */
const SHIFTABLE_TYPES = Object.freeze(["weapon", "armour", "shield"]);

/** Non-metal materials an item may already be, which the spell cannot change. */
const NOT_METAL = Object.freeze(["densewood", "dragonhide"]);

/** Whether an item is one the spell may transform. */
export function shiftableItem(item) {
  return SHIFTABLE_TYPES.includes(String(item?.type ?? ""))
    && !NOT_METAL.includes(String(item?.system?.material ?? ""))
    // A CLAW IS NOT METAL, nor is a fist (page 166: natural attacks are not weapons).
    && !item?.system?.natural && String(item?.system?.category ?? "").toLowerCase() !== "unarmed";
}

/** The card line. */
export function materialShiftLine(itemName, metal, durationText = "") {
  const plain = !metal?.key;
  return `<strong>${itemName}</strong> becomes <strong>${metal?.name ?? "metal"}</strong>${durationText}`
    + (plain ? " — no special material in this system; a creature weak to it is the table's call" : " — it strikes as that material")
    + ". It cannot satisfy an expensive material component.";
}
