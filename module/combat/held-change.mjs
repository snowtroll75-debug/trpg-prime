/**
 * held-change — drawing and putting away held items in combat (3.702.0).
 *
 * Chapter 6, Carrying & Using Items: worn items "can be swiftly retrieved or
 * returned with a 1 AP (Interact) action", and stowed items: "Changing the
 * way they are carried or drawing them usually demands the expenditure of a
 * 1 AP (Interact) action." Interact has the Manipulate trait, and a
 * Manipulate action in an enemy's reach provokes. Release (Chapter 4) is the
 * exception: "You drop an item that you are holding … Despite being a
 * manipulate action, this action does not trigger reactions."
 *
 * Until 3.702.0 the sheet's equip tickbox changed what a character held at
 * no cost, in combat as out of it, so a weapon was drawn or put away without
 * the Interact and without the Attack of Opportunity it invites. Graham, 19
 * November 2026 ("Drawing a weapon is an Interact action. This has the
 * manipulate trait which provokes … Quick draw bypasses this"), with his
 * rulings on the three questions:
 *
 *   - In combat, ticking a held item to equipped on the sheet is an Interact.
 *     It pays 1 AP, the action's gates apply, and enemies in reach are
 *     offered their Attack of Opportunity. Out of combat it stays free.
 *   - Unticking in combat asks: Drop (Release: free, does not provoke) or
 *     Sheathe/Stow (Interact).
 *   - A GM's change is asked "as an Interact, or just set it", so a
 *     correction costs nothing.
 *
 * WHAT COUNTS: an item that takes a hand (`itemRequiredHands` > 0): weapons,
 * shields and held gear such as a torch. Armour is worn, takes no hand and
 * is not covered here; nor is a natural attack, which is never drawn.
 *
 * Quick Draw (action-feats-workflow.mjs) is the feat that folds the draw
 * into its Strike, and it does not run through here.
 *
 * Pure.
 */

import { itemRequiredHands } from "../held-items.mjs";

/**
 * Whether changing this item's equipped state is an action right now.
 *
 * @param {object} p
 * @param {boolean} p.combatStarted an encounter has begun
 * @param {boolean} p.actorInCombat the actor is a combatant in it
 * @param {object}  p.item
 * @param {string}  [p.actorSize]
 * @returns {boolean}
 */
export function heldChangeIsAction({ combatStarted = false, actorInCombat = false, item = null, actorSize = "medium" } = {}) {
  if (!combatStarted || !actorInCombat || !item) return false;
  // A natural attack, a Free Hand weapon and a buckler take no hand
  // (`itemRequiredHands`), so none of them is ever drawn.
  const hands = itemRequiredHands(item, actorSize);
  return Number(hands ?? 0) > 0;
}

/**
 * The update that puts an item in hand: equipped, out of any sack, and in
 * the grip chosen for a Hand & a Half weapon (null when there is no grip to
 * set).
 *
 * @param {object} item
 * @param {boolean|null} [grip]
 * @returns {object}
 */
export function drawChanges(item, grip = null) {
  const changes = { "system.equipped": true };
  if (item?.system?.stowed) changes["system.stowed"] = false;
  if (grip !== null && grip !== undefined) changes["system.twoHandedGrip"] = grip;
  return changes;
}

/** The card's line for a draw or a put-away. */
export function heldChangeLine(name, equip) {
  return equip
    ? `<em>${name} is drawn, and is now in hand.</em>`
    : `<em>${name} is put away (sheathed or stowed).</em>`;
}
