/**
 * General item mechanics (Core 3.1, Chapter 6, Gear & Services). Pure
 * logic only — the Foundry workflow lives in items-workflow.mjs.
 */
import { computeArmourModifiers, computeShieldModifiers } from "./item-quality.mjs";
import { parseGrantList } from "./grants.mjs";
import { effectiveDR } from "./combat/damage.mjs";
import { armourguardBonus } from "./oils.mjs";

/**
 * The trailing id segment of a document's own `_stats.compendiumSource`
 * (`"Compendium.trg-prime.spells.Item.<id>"` → `"<id>"`), used to match an
 * OWNED item back to the pack entry it was created from.
 *
 * Deliberately NOT a name match: several packs in this system genuinely
 * ship duplicate names (two different "Sleep" spells at different PP
 * costs), so matching by name alone can't tell them apart — the id can,
 * without any assumption about the rest of Foundry's UUID format.
 *
 * Originally the Wizard's Spellbook's own helper (3.230.7); moved here,
 * general item mechanics rather than magic-specific ones, once the
 * general item/ability picker needed the identical id-matching logic to
 * exclude an actor's already-owned feats/abilities from its own listing
 * (3.230.8) — spellbook.mjs re-exports it so nothing importing it from
 * there needed to change. One mechanism, not three near-identical copies
 * (lesson 13).
 */
export function sourceEntryId(compendiumSource) {
  if (!compendiumSource) return null;
  const parts = String(compendiumSource).split(".");
  return parts.length ? parts[parts.length - 1] : null;
}

/**
 * A compendium document, prepared to be created on an actor.
 *
 * THE ONE PLACE THAT REMEMBERS WHERE AN ITEM CAME FROM. `toObject()`
 * does NOT carry `_stats.compendiumSource` — only Foundry's own import
 * path sets one — so every hand-rolled `toObject()` + create in this
 * system produced an item that could not say which pack entry it is.
 * `sourceEntryId` above exists precisely to read that field back, and
 * for granted items it was always reading nothing.
 *
 * Found twice. 3.328.0 stamped the two grant paths after a live
 * Crusader showed all four of War's spells with `compendiumSource:
 * null`; 3.328.2 swept the other nine after a live Druid's specialist
 * spell came through `grantChosenSpell` the same way. Nine sites is not
 * nine bugs — it is one missing helper, so this is that helper, and
 * `verify-pack-copies` fails if a tenth site ever grows without it.
 *
 * The `_id` is dropped for the same reason every call site already
 * dropped it by hand: the pack entry's id belongs to the pack, not to
 * the copy being put on a sheet.
 *
 * NOT for actor-to-actor copies (an affliction spreading, a built item
 * saved back into a compendium). Those have no pack document to name,
 * and `toObject()` already carries whatever source the original had.
 *
 * @param {Document} document A document fetched from a compendium pack.
 * @returns {object} Creation data, sourced and id-free.
 */
export function packItemData(document) {
  const data = document.toObject();
  delete data._id;
  data._stats = { ...data._stats, compendiumSource: document.uuid };
  return data;
}

/**
 * Item Damage (Chapter 6): "It becomes broken when its Hit Points are
 * reduced to 0. If its HP are reduced to a negative value equal to half
 * its HP (round up) it is destroyed." An item with no max HP set (0) is
 * treated as untracked — most items don't need per-item HP tracking, so
 * this only applies once a GM has actually given an item a max HP.
 */
export function itemStatus(value, max) {
  const maxHP = Math.max(0, Math.floor(Number(max) || 0));
  if (maxHP <= 0) return "untracked";

  const current = Math.floor(Number(value) || 0);
  const destroyedThreshold = -Math.ceil(maxHP / 2);
  if (current <= destroyedThreshold) return "destroyed";
  if (current <= 0) return "broken";
  return "intact";
}

/**
 * "Each time an item takes HP damage, reduce it by an amount equal to
 * the item's DR" — applies to the item itself, distinct from a
 * creature's own DR against attacks.
 */
export function applyItemDamage(currentValue, amount, itemDR = 0) {
  const reduced = Math.max(0, Math.floor(Number(amount) || 0) - Math.max(0, Math.floor(Number(itemDR) || 0)));
  return Math.floor(Number(currentValue) || 0) - reduced;
}

/**
 * The hit points an item is left with when something BREAKS it outright.
 *
 * Chapter 6: "If an effect makes an item broken automatically it is
 * reduced to 0 HP" — and, from the Item Damage paragraph, only "if the
 * item had more Hit Points than that when the effect occurred". An item
 * already at -3 is not healed up to 0 by being broken again.
 *
 * ADDED AT 3.573.0. The rule had no implementation at all, and the one
 * effect in the system that should have used it — Item Depletion's
 * 41-65 result, "the item is depleted and gains the broken condition" —
 * posted a card and changed no hit points, so the item went on working.
 *
 * @param {number} currentValue
 * @returns {number} 0, or the current value if it is already lower.
 */
export function breakItemValue(currentValue) {
  return Math.min(0, Math.floor(Number(currentValue) || 0));
}

/**
 * Broken armour (Chapter 6, Broken Condition): "Broken armour has its
 * DR reduced by 50% until it loses the condition" — unlike other broken
 * items, which simply stop functioning, armour keeps working at half
 * strength. Rounds down, matching the default rounding rule.
 */
export function brokenArmourDR(baseDR) {
  return Math.floor(Math.max(0, Math.floor(Number(baseDR) || 0)) / 2);
}

/**
 * A single armour piece's fully modified DR against a given incoming
 * damage type: base DR, plus quality/material's flat bonus, plus any
 * superior trait bonus that specifically protects against that exact
 * damage type (Cushioned/bludgeoning, Warm/cold, and so on — those
 * don't apply against other types at all).
 *
 * @param {Item} item An armour item.
 * @param {string} [damageType] The incoming attack's damage type, for
 *   matching type-specific trait bonuses. Omit to get only the flat
 *   portion (used by Critical Amendment, which isn't type-specific).
 */
export function effectiveArmourDR(item, damageType) {
  const baseDR = Math.max(0, Number(item.system?.dr) || 0);
  const mods = computeArmourModifiers(
    item.system?.quality || "standard",
    item.system?.material || "",
    parseGrantList(item.system?.superiorTraits || ""),
    { category: item.system?.category || "" }
  );
  const typedBonus = damageType ? (mods.drByType[damageType] ?? 0) : 0;
  // ARMOURGUARD (3.578.0, the block-18 audit's R9): "armour gains a
  // +1-item bonus to DR" while the resin is on it.
  const guard = armourguardBonus(item).dr;
  return Math.max(0, baseDR + mods.drBonus + typedBonus + guard);
}

/**
 * One shield's DR contribution, condition included.
 *
 * UNLIKE `effectiveArmourDR` ABOVE, this folds in the Broken/Destroyed
 * branch rather than leaving it to the caller. Armour's version is
 * called from three places that each need the condition handled slightly
 * differently (a critical to an unarmoured location, the Combat tab, the
 * damage pipeline); a shield's DR has exactly one meaning, so putting the
 * condition anywhere else would mean every caller re-deriving it — which
 * is how Shield Block came to read the raw `system.dr` and block for full
 * with a broken shield right up to 3.233.5.
 *
 * @param {{system: object}} item A shield item (or its plain data).
 */
export function effectiveShieldDR(item) {
  const mods = computeShieldModifiers(
    item?.system?.quality || "standard",
    item?.system?.material || "",
    parseGrantList(item?.system?.superiorTraits || "")
  );
  const dr = Math.max(0, Number(item?.system?.dr ?? 0) + mods.drBonus);
  const status = itemStatus(item?.system?.hp?.value, item?.system?.hp?.max);
  if (status === "destroyed") return 0;
  return status === "broken" ? brokenArmourDR(dr) : dr;
}

/**
 * The BASE shield DR — the printed figure, before the wearer's own BDB
 * enters into it — of the BEST equipped shield.
 *
 * NOT A SUM (3.575.0). One shield does the blocking, and it is the one
 * that blocks most: that is `shieldBlockEligibility`'s rule, and this
 * summed every equipped shield instead, so a character carrying two
 * reported more block DR on the sheet than either shield could stop.
 * Found in the pages 151-160 audit.
 */
export function shieldBaseDR(items = []) {
  return (items ?? []).reduce((best, item) => Math.max(best, effectiveShieldDR(item)), 0);
}

/**
 * What a Shield Block actually stops.
 *
 * Graham's ruling (3.233.5): "its DR should be based on BDB (base DR)
 * like armour." So the same Chapter 6 multiplier applies — a shield's
 * printed DR is a base value, not a static one, exactly as worn armour's
 * is, and a 12th-level fighter's heavy shield stops three times what the
 * item says.
 *
 * This is deliberately NOT part of the passive Damage Reduction on the
 * Summary tab. Also per Graham: "Shield DR only comes into play when
 * using a Shield Block action" — so it is a reaction's worth of
 * mitigation, not something you have merely by carrying a shield, and
 * `totalDamageReduction` leaves it out on purpose.
 */
export function shieldBlockDR(items = [], bdb = 0) {
  return effectiveDR(shieldBaseDR(items), bdb);
}

/**
 * Item Size (Chapter 6): cost and weight multipliers for an item made
 * for a creature other than Medium size, keyed by size step relative to
 * Medium (0). The rulebook's own table only lists -2 through +4 steps
 * (not -3) — sizes outside that range clamp to the nearest listed value
 * rather than guessing at an extrapolation the source doesn't support.
 */
const ITEM_SIZE_STEPS = Object.freeze({
  "-2": { cost: 0.5, weight: 0.1 },
  "-1": { cost: 1, weight: 0.5 },
  "0": { cost: 1, weight: 1 },
  "1": { cost: 2, weight: 2 },
  "2": { cost: 5, weight: 5 },
  "3": { cost: 10, weight: 10 },
  "4": { cost: 20, weight: 20 }
});

/**
 * The eight size categories, smallest first, and the vocabulary problem
 * they have.
 *
 * THE SCHEMA DEFAULT IS `"M"` AND THE CODE MATCHES `"medium"`. Every
 * consumer so far has lower-cased the field and looked it up in a list of
 * full words, so `"M"` matched nothing — and the one live consumer,
 * `requiredHands`, treats "unrecognised" as "the wielder's own size", so
 * the default happened to behave correctly by accident.
 *
 * `"L"` DID NOT. A Large weapon typed as a letter silently meant "same
 * size as the wielder" — one hand, no penalty — while the same weapon
 * typed as "Large" needed two. The field is free text on the item sheet,
 * so both spellings are things a person would reasonably enter, and only
 * one of them worked. Found at 3.368.0 while wiring the size cost/weight
 * table, which needs the same vocabulary.
 *
 * One normaliser, used by everything that reads a size.
 */
const SIZE_CATEGORIES = Object.freeze([
  "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"
]);

const SIZE_ALIASES = Object.freeze({
  d: "diminutive", dim: "diminutive",
  t: "tiny",
  s: "small", sm: "small",
  m: "medium", med: "medium",
  l: "large", lg: "large",
  h: "huge",
  g: "gargantuan", garg: "gargantuan",
  c: "colossal", col: "colossal"
});

/**
 * A size in any spelling a person might type, as one of SIZE_CATEGORIES,
 * or null when it is genuinely unrecognisable.
 *
 * NOT EXPORTED: `itemSizeStep` is this rule's public form, and every
 * caller wants the step rather than the word. Kept separate because the
 * two answer different questions and the harness drives the vocabulary
 * through the step.
 */
function normaliseSize(size) {
  const raw = String(size ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (SIZE_CATEGORIES.includes(raw)) return raw;
  return SIZE_ALIASES[raw] ?? null;
}

/**
 * How many size steps an item is from Medium — the index the Item Size
 * cost/weight table is keyed by. Null for an unrecognisable size, so a
 * caller can tell "no size given" from "Medium".
 */
export function itemSizeStep(size) {
  const name = normaliseSize(size);
  if (!name) return null;
  return SIZE_CATEGORIES.indexOf(name) - SIZE_CATEGORIES.indexOf("medium");
}

/*
 * `itemSizeNote` stood here for one release. It phrased the size's
 * cost/weight multipliers for the item sheet, and went with the sheet
 * dropdown when both were reverted — see `carriedWeightOf` for why the
 * multipliers do not apply to this system's items at all.
 */

export function itemSizeMultiplier(step) {
  const clamped = Math.min(4, Math.max(-2, Math.round(Number(step) || 0)));
  return ITEM_SIZE_STEPS[String(clamped)];
}

/** Applies the Item Size multipliers directly to a base cost/weight. */
export function resizedItemCostWeight(baseCost, baseWeight, step) {
  const multiplier = itemSizeMultiplier(step);
  return {
    cost: Math.round(Math.max(0, Number(baseCost) || 0) * multiplier.cost * 100) / 100,
    weight: Math.round(Math.max(0, Number(baseWeight) || 0) * multiplier.weight * 100) / 100
  };
}

/**
 * Item Quality (Chapter 6): the generic Superior/Inferior tiers that
 * apply to any item type able to use them (weapons and armour have
 * their own specific quality benefits instead — see their respective
 * sections — this covers the generic case, e.g. tools and kits).
 */
export const ITEM_QUALITY = Object.freeze({
  inferior: { label: "Inferior", itemBonus: -1, levelChange: 0, priceMultiplier: 0.5 },
  normal: { label: "Normal", itemBonus: 0, levelChange: 0, priceMultiplier: 1 },
  expert: { label: "Expert", itemBonus: 1, levelChange: 2, priceMultiplier: 1 },
  master: { label: "Master", itemBonus: 2, levelChange: 8, priceMultiplier: 1 },
  legendary: { label: "Legendary", itemBonus: 3, levelChange: 14, priceMultiplier: 1 }
});

/**
 * Weight of Coins (Chapter 6, Encumbrance): "For coins to register as
 * weight... you must carry 50. Each 50 coins will register as 1 pound
 * of weight." Counted by number of physical coins, not their gp value
 * — 50 copper pieces weigh the same as 50 gold pieces. Rounds down,
 * matching the default rounding rule (fewer than 50 coins of any mix
 * register as 0 lb).
 */
export function coinWeight({ mp = 0, pp = 0, gp = 0, sp = 0, cp = 0 } = {}) {
  const totalCoins =
    Math.max(0, Math.floor(Number(mp) || 0)) +
    Math.max(0, Math.floor(Number(pp) || 0)) +
    Math.max(0, Math.floor(Number(gp) || 0)) +
    Math.max(0, Math.floor(Number(sp) || 0)) +
    Math.max(0, Math.floor(Number(cp) || 0));
  return Math.floor(totalCoins / 50);
}

/**
 * Total wealth converted to a single gold-piece value (Chapter 6,
 * Currency): 1 mp = 100 gp, 1 pp = 10 gp, 1 sp = 1/10 gp, 1 cp = 1/100
 * gp. Rounded to 2 decimal places — cp is the smallest denomination
 * this system tracks (1/100 gp), so nothing finer is meaningful.
 */
export function coinValueInGP({ mp = 0, pp = 0, gp = 0, sp = 0, cp = 0 } = {}) {
  const total =
    Math.max(0, Number(mp) || 0) * 100 +
    Math.max(0, Number(pp) || 0) * 10 +
    Math.max(0, Number(gp) || 0) +
    Math.max(0, Number(sp) || 0) * 0.1 +
    Math.max(0, Number(cp) || 0) * 0.01;
  return Math.round(total * 100) / 100;
}

/**
 * Deducts a gp-denominated price from a mixed mp/pp/gp/sp/cp purse
 * (Chapter 6, Currency). Rather than require the exact denominations
 * to cover the price directly (unrealistic — a purchase doesn't care
 * whether your wealth happens to be in gold or platinum), the whole
 * purse is converted to its smallest unit (cp), the price deducted
 * there, and the remainder re-broken into the fewest coins possible
 * (as many mp as possible, then pp, then gp, then sp, then cp) — the
 * same way a merchant making change would.
 *
 * @param {{mp?, pp?, gp?, sp?, cp?}} purse
 * @param {number} priceGP
 * @returns {{success: boolean, purse?: object, shortfallGP?: number}}
 */
export function deductCurrency(purse, priceGP) {
  const totalCP = Math.round(coinValueInGP(purse) * 100);
  const priceCP = Math.round(Math.max(0, Number(priceGP) || 0) * 100);

  if (priceCP > totalCP) {
    return { success: false, shortfallGP: Math.round((priceCP - totalCP)) / 100 };
  }

  let remaining = totalCP - priceCP;
  const mp = Math.floor(remaining / 10000);
  remaining -= mp * 10000;
  const pp = Math.floor(remaining / 1000);
  remaining -= pp * 1000;
  const gp = Math.floor(remaining / 100);
  remaining -= gp * 100;
  const sp = Math.floor(remaining / 10);
  remaining -= sp * 10;
  const cp = remaining;

  return { success: true, purse: { mp, pp, gp, sp, cp } };
}

/**
 * Item Formulas (Chapter 6): "You can purchase a formula for an item
 * if it is available to buy for cost of approximately 10% of the
 * items purchase price." Rounded to the nearest cp (2 decimal places
 * of gp), the smallest denomination this system's currency actually
 * tracks.
 *
 * @param {number} itemPriceGP
 * @returns {number}
 */
export function formulaCost(itemPriceGP) {
  const price = Math.max(0, Number(itemPriceGP) || 0);
  return Math.round(price * 0.1 * 100) / 100;
}

/**
 * How much of an item's weight the carrier is actually holding.
 *
 * WEIGHT IS NOT ALWAYS PER UNIT. Ammunition is priced and weighed as a
 * BUNDLE: the compendium's "Arrows (20)" ships `quantity: 20` and
 * `weight: 3`, and the 3 lb is the weight of all twenty together — one
 * quiver, as the name says. Multiplying the two gave 60 lb for a single
 * quiver of arrows, which is most of a character's whole allowance.
 * Reported by Graham, 12 Aug 2026.
 *
 * `batchSize` says how many the printed weight covers. It defaults to 1,
 * which is the ordinary per-unit case and leaves every other item in the
 * game computing exactly as before — a sword, a rope, a potion. Only the
 * bundles declare it, and they declare it in the pack rather than having
 * it parsed out of "(20)" in their name, because a name is a label and a
 * quantity is a number.
 *
 * Scaling is proportional, so a half-spent quiver weighs half: fire ten
 * of twenty arrows and you carry 1.5 lb, not 3.
 *
 * ONE COPY. The actor's encumbrance, the party sheet's loot pile and
 * anything else totting up weight must agree, and three multiplications
 * in three files is how they stop agreeing.
 *
 * @param {{system?: object, type?: string}} item
 * @param {object} [options]
 * @param {boolean} [options.worn] Armour being worn counts half.
 * @returns {number}
 */
export function carriedWeightOf(item, { worn = false } = {}) {
  const system = item?.system ?? {};
  const quantity = Math.max(0, Number(system.quantity ?? 1) || 0);
  const weight = Math.max(0, Number(system.weight ?? 0) || 0);
  const batch = Math.max(1, Number(system.batchSize ?? 1) || 1);
  const multiplier = worn ? 0.5 : 1;

  // ITEM SIZE IS NOT A WEIGHT MULTIPLIER HERE, and 3.368.0 wired it as one
  // for a day. The reasoning was that Chapter 6's cost/weight table gives
  // the multipliers for a copy made for a larger or smaller creature, so
  // the printed weight must be the MEDIUM figure.
  //
  // IT IS NOT. In this system's own data `system.itemSize` describes HOW
  // BIG THE OBJECT IS, and the weight column is that object's ACTUAL
  // weight: Rations are size T and weigh 0.5 lb; a 10-ft Pole is size L
  // and weighs 5 lb; an Alchemy Lab is size H and weighs 40 lb. Eighty-two
  // pack items carry a non-Medium size, and multiplying them turned
  // rations into 0.05 lb and the lab into 200. Found live, immediately.
  //
  // The chapter's table is about RESIZING an item for a differently-sized
  // wielder — a Large character's sword — which is a different fact from
  // "a lanyard is a tiny thing". This system records the second and has
  // nowhere to put the first, so `resizedItemCostWeight` stays uncalled
  // until something declares "made for a Large wielder".
  return (quantity / batch) * weight * multiplier;
}

/**
 * Item Formulas (Chapter 6): Crafting Book's own entry states it
 * "contains 20 crafting formula" — per Graham directly, this same
 * capacity now applies uniformly to both Crafting Book and Formula
 * Book, resolving what was previously an unenforced ambiguity (only
 * Crafting Book's own entry gave an explicit number).
 */
export const FORMULA_BOOK_CAPACITY = 20;

/**
 * Whether a book with `currentCount` formulae already in it has room
 * for one more.
 *
 * @param {number} currentCount
 * @param {number} [capacity]
 * @returns {boolean}
 */
export function hasFormulaCapacity(currentCount, capacity = FORMULA_BOOK_CAPACITY) {
  return Math.max(0, Math.floor(Number(currentCount) || 0)) < capacity;
}

/**
 * Sleeping in Armour (Chapter 6): "Light Armour +5, Heavy Armour -5,
 * Rigid -1, Metal -2" to the DC 20 Fortitude save. Medium armour is not
 * listed, so it carries no category modifier of its own — Rigid and
 * Metal (traits, not categories) can still stack on top of any weight
 * class, including Medium.
 */
export function sleepingInArmourModifier({ category, rigid = false, metal = false } = {}) {
  let modifier = 0;
  if (category === "light") modifier += 5;
  else if (category === "heavy") modifier += -5;
  if (rigid) modifier += -1;
  if (metal) modifier += -2;
  return modifier;
}

/**
 * Sleeping in Armour's own outcome table: "Success: no fatigue.
 * Failure: fatigue 1. Fumble: fatigue 2." Only three rows are given —
 * Heroic/Critical/Partial aren't worse than Success, so they hold at 0;
 * Blunder isn't given its own escalation beyond Fumble, so it stays at
 * the same 2 rather than inventing a fourth tier the rulebook doesn't
 * define here.
 */
export function sleepingInArmourFatigue(degreeKey) {
  switch (degreeKey) {
    case "failure":
      return 1;
    case "fumble":
    case "blunder":
      return 2;
    default:
      return 0;
  }
}
