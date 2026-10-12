/**
 * Chapter 11's cost, level and potency tables.
 *
 * Pure lookups, hand-typed from the chapter and diffed by
 * `tools/verify-magic-items.mjs` against the machine transcription in
 * `tools/source/magic-items.txt` — so the data here and the data in the
 * document have independent provenance and a typo in either fails
 * rather than agreeing with itself (lesson 6).
 *
 * WHY THESE ARE RULES AND NOT PACK CONTENT. An item's level is not
 * something an author types onto it — it is a fact about its total
 * price, looked up in one of these tables, and it moves the moment a
 * rune is added. The chapter says so outright: "when crafting magical
 * items it is important to remember that you must add up the total cost
 * of all modifiers before determining the total level."
 *
 * ROUNDING IS DOWN, TO THE NEAREST PRINTED PRICE, and the chapter gives
 * the worked example: "Signus has crafted some magical leather which has
 * a total price of 8,870 gp. This would make the armour level 10 as it
 * has a price which is higher than 8,000 gp but less than 11,000 gp."
 * Pinned as a check, because it is the one behaviour a plausible
 * implementation gets wrong by rounding to the NEAREST rather than down.
 */

/**
 * ARMOUR/SHIELD COST TABLE — total price to item level.
 * `[armourPrice, shieldPrice]` per level, index 0 being level 1.
 */
export const ARMOUR_SHIELD_COST_TABLE = Object.freeze([
  [100, 70], [250, 180], [450, 320], [750, 550], [1250, 900],
  [2000, 1400], [3000, 2100], [4200, 3000], [6000, 4200], [8000, 5600],
  [11000, 7700], [16000, 11200], [24000, 16800], [36000, 25200], [55000, 38500],
  [80000, 56000], [120000, 84000], [180000, 126000], [300000, 210000], [500000, 350000]
]);

/** WEAPON COST TABLE — total price to item level. */
export const WEAPON_COST_TABLE = Object.freeze([
  70, 200, 350, 600, 900, 1400, 2100, 3000, 4300, 6000,
  8000, 11000, 17000, 25000, 40000, 60000, 90000, 130000, 200000, 350000
]);

/** CHARGED ITEM COSTS — `[staffOrOther, rodOrWand]` per level. */
export const CHARGED_ITEM_COST_TABLE = Object.freeze([
  [80, 60], [200, 150], [350, 250], [600, 450], [1000, 750],
  [1600, 1200], [2400, 1800], [3500, 2500], [5000, 3600], [6500, 5000],
  [9000, 7000], [13000, 10000], [20000, 15000], [30000, 22000], [45000, 33000],
  [65000, 50000], [100000, 75000], [150000, 110000], [250000, 180000], [400000, 300000]
]);

/** CONSUMABLE ITEM COSTS — `[unguentPotionOther, scroll]` per level. */
export const CONSUMABLE_COST_TABLE = Object.freeze([
  [30, 20], [60, 40], [100, 70], [150, 120], [250, 180],
  [400, 300], [600, 450], [900, 700], [1300, 1000], [1800, 1400],
  [2500, 2000], [3500, 2800], [5000, 3800], [7500, 5500], [11000, 8500],
  [16000, 12000], [25000, 19000], [40000, 30000], [65000, 50000], [110000, 80000]
]);

/**
 * WONDROUS ITEM COSTS — one price per level.
 *
 * This table works differently from the others. The rest price a
 * finished item; this one prices an ABILITY, and a wondrous item's total
 * is the sum of its abilities' costs: "To determine the final cost of a
 * wondrous magic item, add up the cost of all its individual abilities.
 * To determine the items level, always round down to the nearest price
 * if its total does not match one of the below values."
 *
 * So the ladder is used in both directions — an ability's cost is read
 * off it by what the ability does (see WONDROUS_MODIFIERS in
 * module/wondrous.mjs), and the finished item's level is read back off
 * it by the total.
 */
export const WONDROUS_COST_TABLE = Object.freeze([
  100, 250, 450, 750, 1250,
  2000, 3000, 4200, 6000, 8000,
  11000, 16000, 24000, 36000, 55000,
  80000, 120000, 180000, 300000, 500000
]);

/**
 * The price ladder for a given kind of item, smallest first.
 *
 * One function rather than five call sites each knowing which column of
 * which table it wants.
 */
export function priceLadder(kind) {
  switch (String(kind ?? "").toLowerCase()) {
    case "armour": return ARMOUR_SHIELD_COST_TABLE.map((row) => row[0]);
    case "shield": return ARMOUR_SHIELD_COST_TABLE.map((row) => row[1]);
    case "weapon": return WEAPON_COST_TABLE.slice();
    case "staff": case "other-charged": return CHARGED_ITEM_COST_TABLE.map((row) => row[0]);
    case "rod": case "wand": return CHARGED_ITEM_COST_TABLE.map((row) => row[1]);
    case "consumable": case "potion": case "unguent":
      return CONSUMABLE_COST_TABLE.map((row) => row[0]);
    case "scroll": return CONSUMABLE_COST_TABLE.map((row) => row[1]);
    case "wondrous": return WONDROUS_COST_TABLE.slice();
    default: return [];
  }
}

/**
 * An item's level, from its total price.
 *
 * "Always round down to the nearest price if its total does not match
 * one of the above values" — so a price BETWEEN two rows takes the lower
 * row's level, and a price above the top row stays at 20 rather than
 * running off the end.
 *
 * A price below the first row is level 0, not level 1: an item cheaper
 * than the cheapest magical one is not magical, and reporting 1 would
 * make every mundane dagger a first-level magic item.
 *
 * @param {string} kind armour | shield | weapon | rod | wand | staff | scroll | consumable
 * @param {number} price total price in gp
 * @returns {number} 0-20
 */
export function itemLevelForPrice(kind, price) {
  const ladder = priceLadder(kind);
  const value = Math.max(0, Math.floor(Number(price) || 0));
  let level = 0;
  for (let i = 0; i < ladder.length; i += 1) {
    if (value >= ladder[i]) level = i + 1;
    else break;
  }
  return level;
}

/** The printed price at a level, for the sheet's own display. */
export function priceForLevel(kind, level) {
  const ladder = priceLadder(kind);
  const index = Math.floor(Number(level) || 0) - 1;
  return index >= 0 && index < ladder.length ? ladder[index] : 0;
}

/**
 * ARMOUR POTENCY RUNE BONUS — six tiers.
 *
 * "The DB bonus provided by armour is an ITEM bonus, whereas the bonus
 * provided by a shield INCREASES THE EXISTING SHIELD DB BONUS." Two
 * different mechanics wearing the same name, and the distinction is
 * carried here rather than left to the reader: `db` on armour is a typed
 * item bonus that competes with other item bonuses, and `db` on a shield
 * raises the shield's own figure and so stacks with nothing.
 */
export const ARMOUR_POTENCY = Object.freeze([
  { tier: "I", numeral: 1, level: 2, price: 250, db: 1, hp: 5 },
  { tier: "II", numeral: 2, level: 6, price: 2000, db: 2, hp: 10 },
  { tier: "III", numeral: 3, level: 10, price: 8000, db: 3, hp: 15 },
  { tier: "IV", numeral: 4, level: 13, price: 24000, db: 4, hp: 20 },
  { tier: "V", numeral: 5, level: 16, price: 80000, db: 5, hp: 25 },
  { tier: "VI", numeral: 6, level: 20, price: 500000, db: 6, hp: 30 }
]);

/** SHIELD POTENCY RUNE BONUS — four tiers. */
export const SHIELD_POTENCY = Object.freeze([
  { tier: "I", numeral: 1, level: 4, price: 550, db: 1, hp: 20 },
  { tier: "II", numeral: 2, level: 9, price: 4200, db: 2, hp: 40 },
  { tier: "III", numeral: 3, level: 14, price: 25200, db: 3, hp: 60 },
  { tier: "IV", numeral: 4, level: 19, price: 210000, db: 4, hp: 80 }
]);

/** WEAPON MAGIC RUNE BONUS — six tiers, attack bonus only. */
export const WEAPON_POTENCY = Object.freeze([
  { tier: "I", numeral: 1, level: 2, price: 200, bonus: 1 },
  { tier: "II", numeral: 2, level: 6, price: 1400, bonus: 2 },
  { tier: "III", numeral: 3, level: 10, price: 6000, bonus: 3 },
  { tier: "IV", numeral: 4, level: 13, price: 17000, bonus: 4 },
  { tier: "V", numeral: 5, level: 16, price: 60000, bonus: 5 },
  { tier: "VI", numeral: 6, level: 20, price: 350000, bonus: 6 }
]);

/**
 * The quality restriction tables.
 *
 * "The quality of the armour or shield restricts both the maximum power
 * level of the potency rune and the amount of additional runes that may
 * be applied to it." Weapons have their own, stricter at the bottom:
 * normal armour takes a Potency II, a normal weapon only a Potency I.
 */
export const ARMOUR_SHIELD_RESTRICTIONS = Object.freeze({
  normal: { maxPotency: 2, additionalRunes: 1 },
  expert: { maxPotency: 3, additionalRunes: 2 },
  master: { maxPotency: 5, additionalRunes: 3 },
  legendary: { maxPotency: 6, additionalRunes: 4 }
});

export const WEAPON_RESTRICTIONS = Object.freeze({
  normal: { maxPotency: 1, additionalRunes: 1 },
  expert: { maxPotency: 2, additionalRunes: 2 },
  master: { maxPotency: 4, additionalRunes: 3 },
  legendary: { maxPotency: 6, additionalRunes: 4 }
});

/**
 * What a given quality of item may carry.
 *
 * `inferior` is not in either printed table. It is a real quality tier in
 * Chapter 6, so an inferior item can exist and can be handed to this —
 * and it is treated as `normal` rather than refused, because nothing in
 * Chapter 11 forbids enchanting a poor weapon and inventing a
 * prohibition would be inventing a rule. Recorded here so the choice is
 * visible rather than looking like the table has five rows.
 */
export function runeRestrictions(kind, quality) {
  const table = String(kind ?? "").toLowerCase() === "weapon"
    ? WEAPON_RESTRICTIONS
    : ARMOUR_SHIELD_RESTRICTIONS;
  const key = String(quality ?? "").trim().toLowerCase();
  return table[key === "inferior" || !key ? "normal" : key] ?? table.normal;
}

/**
 * ARMOUR SPELL TABLE and WEAPON SPELL TABLE — a Spell Effect rune's
 * level and price, from the PP cost of the spell inscribed.
 *
 * Twenty-one rows, PP 0 to PP 20, and the level is always PP + 1. That
 * relationship is asserted rather than relied on: the table is the rule,
 * and if a future printing breaks the pattern the data still wins.
 */
export const ARMOUR_SPELL_TABLE = Object.freeze([
  100, 250, 450, 750, 1250, 2000, 3000, 4200, 6000, 8000, 11000,
  16000, 24000, 36000, 55000, 80000, 120000, 180000, 300000, 500000, 700000
]);

export const WEAPON_SPELL_TABLE = Object.freeze([
  60, 150, 250, 450, 750, 1200, 1800, 2500, 3600, 5000, 7000,
  10000, 15000, 22000, 33000, 50000, 75000, 110000, 180000, 300000, 550000
]);

/**
 * A Spell Effect rune, for a spell of the given PP cost.
 *
 * "Enhancement: You may allow the spell to be cast 3/day by increasing
 * its level by 1, At Will by increasing the level of the rune by 2, or
 * Constant by increasing the level of the rune by 4." The enhancement
 * raises the LEVEL, and the price follows the level up the same table —
 * which is why this returns both rather than a level alone.
 *
 * @param {string} kind "armour" | "weapon"
 * @param {number} ppCost
 * @param {string} frequency "1/day" | "3/day" | "at will" | "constant"
 */
export const SPELL_EFFECT_ENHANCEMENTS = Object.freeze({
  "1/day": 0, "3/day": 1, "at will": 2, constant: 4
});

/** Which spell table a kind of item is priced from. */
export function spellTableFor(kind) {
  return String(kind ?? "").trim().toLowerCase() === "weapon"
    ? WEAPON_SPELL_TABLE
    : ARMOUR_SPELL_TABLE;
}

/** Two significant figures, which is how the chapter writes every large price. */
export function roundSignificant(value, digits = 2) {
  const n = Number(value) || 0;
  if (n <= 0) return 0;
  const magnitude = 10 ** (Math.floor(Math.log10(n)) - (digits - 1));
  return Math.round(n / magnitude) * magnitude;
}

/**
 * How fast a price table grows at its top end — the geometric mean of
 * the last `window` steps.
 *
 * The geometric mean rather than the last step alone: the armour spell
 * table's final step is x1.4 and the one before it x1.667, so taking
 * either on its own would be reading noise as a rule.
 */
export function growthRatio(table, window = 5) {
  const tail = table.slice(-(window + 1));
  if (tail.length < 2) return 1;
  let product = 1;
  for (let i = 1; i < tail.length; i += 1) product *= tail[i] / tail[i - 1];
  return product ** (1 / (tail.length - 1));
}

/**
 * The price at a level, continuing the ladder past the table's end.
 *
 * A PP 18 spell made Constant is level 23 and both spell tables stop at
 * 21, so this is not a hypothetical. The ladder is CONTINUED rather than
 * clamped — clamping would silently make the most expensive thing in the
 * chapter cheap — and anything priced that way says so, so the number is
 * never passed off as the book's.
 *
 * @returns {{price:number, extrapolated:boolean}}
 */
export function priceAtLevel(table, level) {
  const wanted = Math.max(1, Math.floor(Number(level) || 1));
  if (wanted <= table.length) return { price: table[wanted - 1], extrapolated: false };
  const ratio = growthRatio(table);
  let price = table[table.length - 1];
  for (let l = table.length + 1; l <= wanted; l += 1) price = roundSignificant(price * ratio);
  return { price, extrapolated: true };
}

export function spellEffectRune(kind, ppCost, frequency = "1/day") {
  const table = spellTableFor(kind);
  const pp = Math.max(0, Math.floor(Number(ppCost) || 0));
  if (pp >= table.length) return null;
  const step = SPELL_EFFECT_ENHANCEMENTS[String(frequency ?? "").trim().toLowerCase()];
  if (step === undefined) return null;
  // The base row is PP + 1; the enhancement pushes it further up the
  // same table, and the price is whatever that row costs — past the last
  // printed row included.
  const level = pp + 1 + step;
  const { price, extrapolated } = priceAtLevel(table, level);
  return { level, price, extrapolated, ppCost: pp, frequency };
}
