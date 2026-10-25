/**
 * Carrying things: what raises your allowance, and what stops counting
 * against it (Core 3.1, Chapter 6, and the wondrous items that bend it).
 *
 * THREE DISTINCT MECHANICS, easy to conflate and worth keeping apart:
 *
 * 1. WHAT YOU CAN CARRY. Weight Allowance is 50 + Strength x 10, and a
 *    few things raise the Strength that figure is worked out from — the
 *    Hauler feat's +2, and a worn Backpack's +1. Neither touches
 *    Strength itself; both touch only the allowance.
 * 2. WHAT COUNTS AS CARRIED. A Never-Ending Stash Sack "magically
 *    adjusts and always weighs the same amount, regardless of the weight
 *    of the objects placed within it" — so what is inside one is not
 *    weight you are carrying at all.
 * 3. WHAT WILL FIT. Each sack has a printed capacity, and stowing more
 *    than that is a thing the sheet should say out loud rather than
 *    silently allow.
 *
 * WHY A FLAG RATHER THAN A CONTAINER. This system has no parent/child
 * item model — `computeCarriedWeight` sums every item flat — and giving
 * it one means a data model, sheet plumbing for moving things in and
 * out, and a second place for every weight question to be answered
 * from. A `stowed` tickbox gets the rule that matters (the contents
 * weigh nothing, up to a capacity) without any of that, and leaves a
 * real container possible later: an item that knows it is stowed can be
 * told WHICH sack it is in without anything here changing.
 *
 * Pure and Foundry-free.
 */

import { declaredCarryStrength } from "./focus-declarations.mjs";
import { carriedWeightOf } from "./items.mjs";

/**
 * What a worn item adds to the Strength that Weight Allowance is worked
 * out from, by item name.
 *
 * "+1 Str for carrying capacity" — the Backpack's own printed line.
 * SADDLEBAGS ARE THE SECOND (3.576.0; Graham's R8): "When wearing
 * saddlebags, an animal's Strength score is considered 1 higher for
 * carrying capacity" — so an entry can say it is for an ANIMAL wearer
 * only. Still keyed by name, because the Backpack already is and a world
 * copy of one carries no flag; `verify-chapter6-gear-161-170` opens the
 * gear pack and fails if either name stops being a real item.
 */
export const CARRY_STRENGTH_ITEMS = Object.freeze({
  backpack: Object.freeze({ value: 1, animalOnly: false }),
  saddlebags: Object.freeze({ value: 1, animalOnly: true })
});

/** The Hauler feat: "strength is considered to be 2 higher". */
export const HAULER_STRENGTH = 2;

/**
 * The bonus to the Strength used for Weight Allowance — never to
 * Strength itself.
 *
 * NON-STACKING PER SOURCE. Two Backpacks are two Backpacks, not +2:
 * the rule is a property of wearing one, and a character festooned with
 * six of them is a character who has found a bug. Hauler and a Backpack
 * DO stack with each other, because they are different rules.
 *
 * @param {object} options
 * @param {string[]} [options.featNames]
 * @param {object[]} [options.items]
 * @returns {number}
 */
export function carryStrengthBonus({ featNames = [], items = [], animal = false } = {}) {
  const feats = new Set((featNames ?? []).map((n) => String(n ?? "").trim().toLowerCase()));
  const hauler = feats.has("hauler") ? HAULER_STRENGTH : 0;

  const worn = new Set();
  for (const item of items ?? []) {
    if (!item?.system?.equipped) continue;
    const key = String(item?.name ?? "").trim().toLowerCase();
    if (!Object.hasOwn(CARRY_STRENGTH_ITEMS, key)) continue;
    // SADDLEBAGS ON A PERSON ARE A BAG, not a bonus.
    if (CARRY_STRENGTH_ITEMS[key].animalOnly && animal !== true) continue;
    worn.add(key);
  }
  const fromItems = [...worn].reduce((total, key) => total + CARRY_STRENGTH_ITEMS[key].value, 0);

  // DECLARED (3.664.0): `carryStrength` on any owned item.
  return hauler + fromItems + declaredCarryStrength(items);
}

/**
 * Is this creature an animal, for the Saddlebags? An animal companion,
 * or anything whose creature type is Animal.
 *
 * @param {string} actorType the Foundry actor type
 * @param {object} actorSystem
 * @returns {boolean}
 */
export function carriesAsAnimal(actorType, actorSystem) {
  if (String(actorType ?? "") === "companion") return true;
  return String(actorSystem?.details?.creatureType ?? "").trim().toLowerCase() === "animal";
}

/**
 * Is this item stowed in a weightless container?
 *
 * EQUIPPED ARMOUR IS NEVER STOWED. You cannot be wearing a breastplate
 * and have it in the sack, and a tickbox left set from before it was
 * donned should not quietly halve the wearer's load. The same is true of
 * anything held or worn — the check is deliberately about `equipped`
 * rather than about the item's type, so it covers a drawn sword as well.
 */
export function isStowed(item) {
  return Boolean(item?.system?.stowed) && !item?.system?.equipped;
}

/**
 * The weight of one item line, quantity included.
 *
 * Through `carriedWeightOf` (3.311.0) rather than multiplying here, for the
 * reason that helper exists: a bundle's printed weight covers the bundle. A
 * quiver stowed in a stash sack was counting 60 lb against the sack's
 * capacity instead of 3, and could exceed it on arrows alone. Found beside
 * the Inventory-row defect Graham reported on 14 Aug 2026 — same root cause,
 * different file, and not yet noticed at the table.
 *
 * Armour is never halved here: half weight is for armour being WORN, and
 * `isStowed` excludes anything equipped.
 */
function lineWeight(item) {
  return carriedWeightOf(item);
}

/** Everything stowed, totalled. */
export function stowedWeight(items = []) {
  return (items ?? []).filter(isStowed).reduce((total, item) => total + lineWeight(item), 0);
}

/**
 * The capacity a sack declares, in pounds.
 *
 * AUTHORED ON THE ITEM, not parsed from its description. The five tiers
 * print 50 / 200 / 500 / 1,000 / 2,500 lb in prose, and the harness
 * asserts the recorded figure against the printed sentence — one copy of
 * a number that has to agree with itself, checked rather than trusted.
 */
export function itemStashCapacity(item) {
  const declared = Number(item?.flags?.["trg-prime"]?.container?.capacityLbs ?? 0);
  return Number.isFinite(declared) && declared > 0 ? declared : 0;
}

/**
 * How much stowage a character actually has.
 *
 * INVESTED, NOT MERELY OWNED. Every Stash Sack carries the Invested
 * trait, and this system already makes investment a deliberate act with
 * a limited number of slots — a sack in the cart is not a sack you are
 * using. Carried-but-uninvested sacks contribute nothing, which is also
 * what stops a mule train of them from being infinite stowage.
 *
 * Capacities of several invested sacks add, because they are separate
 * bags and nothing says otherwise.
 */
export function stashCapacity(items = []) {
  return (items ?? []).reduce((total, item) => (
    item?.system?.invested ? total + itemStashCapacity(item) : total
  ), 0);
}

/**
 * The stowage line for the sheet: what is stowed, what will fit, and
 * whether the second is smaller than the first.
 *
 * OVER CAPACITY IS REPORTED, NOT REFUSED — a GM mid-inventory should see
 * "that will not fit", not have their typing refused. But the excess IS
 * carried (3.617.0, Graham's R22 of block 37): `over` is added back to the
 * carried weight, and with no invested sack (capacity 0) that is all of
 * it. Before, the stowed weight never counted, sack or no sack.
 */
export function stowageSummary(items = []) {
  const stowed = stowedWeight(items);
  const capacity = stashCapacity(items);
  const count = (items ?? []).filter(isStowed).length;
  return {
    stowed,
    capacity,
    count,
    over: Math.max(0, stowed - capacity),
    hasStash: capacity > 0,
    // Shown with no sack too, when something is still stowed (a sack taken
    // off or un-invested): its contents are now carried (R22).
    shown: capacity > 0 || count > 0
  };
}
