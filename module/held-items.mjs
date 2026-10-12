/**
 * Held items (Chapter 6, Weapon Sizes, and Graham's direct
 * clarification): a standard character has two hands. Weapons and
 * shields require a number of hands depending on their size relative
 * to the wielder's own size, plus the 2-Handed trait overriding that
 * entirely. Armour is worn, not held, and never consumes a hand.
 * Other gear is assessed individually — some genuinely needs a hand
 * (a lit torch, a wand), most doesn't.
 *
 * Pure logic; the Foundry workflow (module/held-items-workflow.mjs)
 * layers on top, same separation as attack.mjs and reload.mjs.
 */

import { animatedFreesHands } from "./rune-actions.mjs";
import { isBuckler } from "./buckler.mjs";
import { itemSizeStep } from "./items.mjs";


/**
 * How many hands a weapon or shield requires, per Graham's exact
 * clarification: same size as the wielder or smaller needs one hand
 * (unless it has the 2-Handed trait, which always needs two
 * regardless of size); exactly one size category larger needs two
 * hands; two or more sizes larger can't be wielded at all.
 *
 * @param {string} itemSize One of the size keys (e.g. "medium").
 * @param {string} actorSize One of the size keys.
 * @param {boolean} hasTwoHanded
 * @returns {number|null} 1, 2, or null if the item can't be wielded
 *   at all by a creature this size.
 */
export function requiredHands(itemSize, actorSize, hasTwoHanded) {
  // ONE VOCABULARY AND ONE STEP CALCULATION (3.368.0). This kept its own
  // list of the eight sizes and matched full words only, so the schema's
  // own default of "M" — and any size a person typed as a letter —
  // matched nothing. For "M" that was harmless, because an unrecognised
  // size falls back to the wielder's own; for "L" it silently meant the
  // same thing, so a Large weapon needed one hand instead of two.
  //
  // `itemSizeStep` is the same "how far from Medium" the Item Size
  // cost/weight table is keyed by. Two ideas of a size step in one system
  // is one more than it needs, and this is the older of the two.
  const itemStep = itemSizeStep(itemSize);
  // An unreadable WIELDER size is Medium: without that, its step is null,
  // every item reads as larger than the wielder, and nobody can hold
  // anything.
  const actorStep = itemSizeStep(actorSize) ?? 0;
  // Unrecognised ITEM size: don't guess at a hand requirement that could
  // be wrong — treat as the wielder's own size (no size penalty),
  // same conservative default used elsewhere in this system for
  // unrecognised inputs.
  const sizeDelta = (itemStep === null ? actorStep : itemStep) - actorStep;
  if (sizeDelta >= 2) return null;
  if (sizeDelta === 1) return 2;
  return hasTwoHanded ? 2 : 1;
}

/** Does this weapon carry the Hand & a Half trait? */
export function hasHandAndAHalfTrait(item) {
  return /\bhand\s*&\s*a\s*half\b/i.test(String(item?.system?.traits ?? ""));
}

/**
 * Is this weapon held in its Hand & a Half two-handed grip? The grip is
 * chosen at equip time and stored on the weapon (`system.twoHandedGrip`);
 * a weapon without the trait has no such grip whatever the field says.
 */
export function heldInTwoHandGrip(item) {
  return item?.type === "weapon" && hasHandAndAHalfTrait(item) && Boolean(item?.system?.twoHandedGrip);
}

/**
 * THE x1.5 (Chapter 6, Weapon Sizes): "Weapons that are one size category
 * larger can be used ... two-handed (if such a weapon is used two-handed,
 * your melee damage bonus is multiplied by 1.5)." Hand & a Half points
 * back at the same sentence: "This increases weapons damage as if it were
 * a size larger (see above)."
 *
 * Until 3.575.0 only the second half existed, so a Medium fighter's
 * greatsword added plain Strength while the same fighter's two-handed
 * bastard sword added half as much again. Graham, 19 Sep 2026: yes, every
 * one-size-larger weapon. And his earlier clarification stands — such a
 * weapon NEEDS two hands (`requiredHands`), so there is no one-handed
 * case to exclude here.
 *
 * MELEE ONLY: the sentence is about the melee damage bonus, so a spear
 * thrown from a two-handed grip does not carry it into the air. The
 * caller says whether this attack is melee.
 *
 * @param {object} item The weapon.
 * @param {string} actorSize The wielder's size.
 * @returns {boolean}
 */
export function twoHandedStrengthApplies(item, actorSize) {
  if (item?.type !== "weapon" || item?.system?.natural) return false;
  const itemStep = itemSizeStep(item?.system?.size);
  const actorStep = itemSizeStep(actorSize) ?? 0;
  if (itemStep !== null && itemStep - actorStep === 1) return true;
  return heldInTwoHandGrip(item);
}

/**
 * A LIGHT SHIELD'S HAND CAN CARRY SOMETHING (Chapter 6): "allowing you to
 * carry other items in the hand that holds the shield. However, you cannot
 * effectively wield weapons while holding the shield." Printed for the
 * light steel and light wooden shields; the klars are "considered" those
 * two. The madu is the exception its own entry names — "you cannot hold
 * anything else in the hand that bears the shield" — and says so on the
 * item (`handBound`) rather than by name.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function shieldHandCanCarry(item) {
  if (item?.type !== "shield") return false;
  if (String(item?.system?.category ?? "").trim().toLowerCase() !== "light") return false;
  return !item?.system?.handBound;
}

/**
 * Could this item ride in a light shield's hand? One hand's worth of
 * something that is not a weapon — a torch, a potion, a lantern.
 */
function carriableInShieldHand(item, actorSize) {
  if (item?.type !== "gear" && item?.type !== "consumable") return false;
  return itemRequiredHands(item, actorSize) === 1;
}

/**
 * Hands actually occupied by a set of equipped items.
 *
 * The plain sum, less one for each light shield whose hand is carrying a
 * one-handed non-weapon item alongside it (3.575.0). Everything that asks
 * "is a hand free" and everything that asks "can this be equipped" goes
 * through here, so the torch-and-shield case gets one answer everywhere.
 *
 * @param {Array} items Equipped items only.
 * @param {string} actorSize
 * @returns {number}
 */
export function handsOccupied(items, actorSize) {
  const list = Array.from(items ?? []);
  const sum = list
    .map((item) => itemRequiredHands(item, actorSize))
    .filter((n) => n !== null)
    .reduce((total, n) => total + Math.max(0, Number(n) || 0), 0);
  const carriers = list.filter(shieldHandCanCarry).length;
  const riders = list.filter((item) => carriableInShieldHand(item, actorSize)).length;
  return Math.max(0, sum - Math.min(carriers, riders));
}

/**
 * How many hands a physical item requires while equipped, dispatched
 * by item type: weapons and shields use the size-based calculation
 * above (plus the 2-Handed trait); armour is worn, never held, so
 * always 0; gear uses its own assessed heldHands value; everything
 * else defaults to 0 rather than guessing.
 *
 * @param {{type: string, system: object}} item
 * @param {string} actorSize
 * @returns {number|null} null specifically means "can't be wielded
 *   at all by a creature this size" (weapons/shields only).
 */
export function itemRequiredHands(item, actorSize) {
  // ANIMATED (Chapter 11): "you do however have both hands free." A
  // floating shield still grants its DB and still costs its penalties —
  // only the hands change, which is why this is the narrowest possible
  // exception rather than a general "is it really equipped" test.
  if (item.type === "shield" && animatedFreesHands(item)) return 0;
  // A BUCKLER IS STRAPPED TO THE FOREARM (Chapter 6): "while carrying a
  // buckler, you can use a bow or crossbow without any penalties" and
  // "you have the option to wield a weapon with your shield arm". It
  // consumed a hand like every other shield until 3.249.1, so a buckler
  // and a longbow put a character over capacity and the bow could not be
  // used — the exact combination the rule exists to allow. What it costs
  // instead is a -1 to attack and its own DB, both in buckler.mjs.
  if (isBuckler(item)) return 0;
  // A CHARGED ITEM'S WEAPON FORM (3.616.0, R15) is the staff or sceptre
  // itself, already in the hand the charged item occupies.
  if (item.type === "weapon" && item.flags?.["trg-prime"]?.weaponFormOf) return 0;
  if (item.type === "weapon" || item.type === "shield") {
    // Free Hand (Chapter 6): "integrated into your armour, thus
    // freeing up your hand" — the weapon itself never consumes hand
    // budget, regardless of its size. (Attacking with it still needs
    // an actually-free hand at that moment — see
    // hasFreeHandAvailable below, a separate check from this one.)
    if (item.type === "weapon" && /\bfree[\s-]*hand\b/i.test(String(item.system?.traits ?? ""))) {
      return 0;
    }
    // Natural attacks (Chapter 6, Unarmed Attacks): a bite, claw, or
    // Unarmed Strike is part of the creature's own body, not
    // something held — never consumes hand budget, for the same
    // mechanical outcome as Free Hand but a different reason.
    if (item.type === "weapon" && item.system?.natural) {
      return 0;
    }
    const hasTwoHanded = /\btwo-handed\b|\b2-handed\b/i.test(String(item.system?.traits ?? ""));
    const hands = requiredHands(item.system?.size, actorSize, hasTwoHanded);
    // HAND & A HALF, HELD TWO-HANDED, TAKES TWO HANDS (3.575.0). The grip
    // was stored on the weapon and read by the damage roll, and nothing
    // here ever looked at it — so a two-handed bastard sword and a heavy
    // shield came to two hands, and the character had the x1.5 and the
    // shield's DB at once. Found in the pages 151-160 audit.
    if (hands === 1 && heldInTwoHandGrip(item)) return 2;
    return hands;
  }
  if (item.type === "gear") {
    return Math.max(0, Math.min(2, Math.trunc(Number(item.system?.heldHands) || 0)));
  }
  // Consumables (Chapter 6): per Graham directly — always need a
  // hand when equipped, since using one means actually holding it
  // (drinking a potion, throwing an alchemical item), unlike gear
  // where it varies item by item.
  if (item.type === "consumable") return 1;
  return 0;
}

/**
 * HANDS TO RELOAD (3.576.0). The Hand Crossbow: "While it can be fired with
 * one hand, it necessitates the use of both hands for reloading." The
 * reload workflow never asked, so a hand crossbow and a shield reloaded
 * freely. The weapon declares it (`reloadHands`); every other crossbow
 * already needs two hands to hold.
 *
 * The hand holding the weapon counts, so a hand crossbow needs every
 * OTHER equipped item to leave one hand free.
 *
 * @param {Array} items the actor's items
 * @param {object} weapon the weapon being reloaded
 * @param {string} actorSize
 * @returns {{ok: boolean, needed: number, free: number}}
 */
export function reloadHandsCheck(items, weapon, actorSize) {
  const needed = Math.max(0, Math.trunc(Number(weapon?.system?.reloadHands) || 0));
  const others = Array.from(items ?? [])
    .filter((item) => item?.system?.equipped && item !== weapon && (!weapon?.id || item?.id !== weapon.id));
  const free = Math.max(0, 2 - handsOccupied(others, actorSize));
  return { ok: needed === 0 || free >= needed, needed, free };
}

/**
 * Free Hand (Chapter 6): "if the hand is occupied or in use,
 * attacking with the free-hand weapon is not possible." The weapon
 * itself is exempt from the hand budget (see itemRequiredHands
 * above), but attacking with it still needs at least one hand
 * genuinely free of everything else at that moment — checked
 * separately, since these are two distinct conditions in the
 * rulebook's own wording, not one.
 *
 * @param {Array<{id: string, type: string, system: object}>} weapons
 *   All of the actor's items (not just weapons, despite the param
 *   name — anything with a hand cost counts).
 * @param {string} actorSize
 * @returns {boolean}
 */
export function hasFreeHandAvailable(weapons, actorSize) {
  const otherHands = handsOccupied(
    weapons.filter((item) => item.system?.equipped), actorSize);
  return otherHands < 2;
}
