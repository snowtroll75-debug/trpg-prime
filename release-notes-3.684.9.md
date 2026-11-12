# TRG Prime 3.684.9

6 November 2026. A Never-Ending Stash Sack can hold anything you carry, the inventory's weights are no longer hidden, the sheet counts Mage Armour's DR, and an inactive effect can be switched back on. Built on 3.684.8.

- **Install over 3.684.8.** No migration, and no world data changes.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.2 and Inner Tempest 1.0.4 run on it.

## Fixed

**The Stash Sacks' weight rule now reaches everything you carry** (Graham: "The Never Ending Stash Sack(s) are not applying their weight modifier").

- **Before:**
  - The rule itself worked. With an invested sack, a stowed item stops counting towards Encumbrance, up to the sack's capacity, and anything over the capacity is carried.
  - But the sheet's stow button (the sack icon) was only on the **Gear** rows. A weapon, armour, a shield, a consumable, ammunition, a charged item or a wondrous item couldn't be put in the sack, so its weight always counted.
- **Now:**
  - The sack icon is on every carried row, on the Items and Magic Items tabs: weapons, armour, shields, gear, consumables, ammunition, charged items and wondrous items.
  - Click it to stow the item and click again to take it out. The Encumbrance line's "stowed" figure shows what is in the sacks.
- **Unchanged:**
  - **An equipped item can't be stowed.** You're asked to take it off first. That includes worn armour, a drawn weapon and a worn wondrous item.
  - **You need an invested sack.** Without one, stowing is refused, and anything still marked stowed counts as carried.
  - **Capacity:** several invested sacks add their capacities together. A bundle of ammunition weighs as a bundle.
- **New:** a Stash Sack can't be stowed in itself (or in another sack). The sheet says "it holds things; it is not stowed."

**Weights no longer hidden under the row's buttons** (Graham: "weight does not actually show on the gear tab, it is hidden").
- **Before:** the inventory tables' button column was 78 px wide, room for under three buttons. A gear row carries up to eight (equip, stow, light, hood, use, edit, delete…), and they overflowed leftwards across the Wt. column.
- **Now:** the button column is four buttons wide, and the buttons wrap onto a second line inside it. The Wt. column shows on every row, in every inventory table.

**Drawing a stowed item takes it out of the sack** (found in review). Equipping a stowed item now clears its stowed mark. Before, the row kept saying "Stowed in a Stash Sack", and the item went silently back into the sack when it was put away. Its weight already counted while it was held.

**Clearer wording:** the charged-item and wondrous rows' equip button used to say "stow" ("Held — click to stow", "Worn — click to stow"). It now says "Held — click to put away" and "Worn — click to take off", so "stow" means only the Stash Sack.

**The sheet's Damage Reduction counts Mage Armour and the Bracers of Armour** (Graham: "I have just cast a warped Mage Armour spell and did not apply any DR to my character").
- **What was happening:** the DR *was* applied to every blow. Tested in Graham's world: a warped Mage Armour (Base DR 2, ×3 for BSB 8, so DR 6) cut a 12-point Greatsword hit to 7 (DR 6, less 1 for Armour Rending), and its pool went from 60 to 55 HP. But the Summary's Damage Reduction and the Combat tab's total read worn armour only, so both showed 0.
- **Now:**
  - Both totals take the higher of your worn armour's DR (after BDB) and your Mage Armour or Bracers DR, never both, as the damage itself always has. Natural Armour and Bonus DR still add.
  - The Combat tab's Protection card has a row for the magical armour, named after it ("Mage Armour DR"), with its pool in the tooltip.

**An inactive effect can be switched back on** (Graham: "I did make Mage Armour inactive but then the sheet would not allow me to make it active again").
- **Before:**
  - On the Effects tab, an inactive effect's row is drawn greyed out, and the sheet marks it with the class "disabled".
  - Foundry's own stylesheet makes anything with that class ignore the mouse. So once an effect was switched off, its row's Active toggle, edit and delete buttons no longer took clicks, and nothing happened.
  - Measured in Graham's world: the toggle's centre hit the card behind it, and a real click left the effect inactive.
- **Now:** the inactive row and its buttons take clicks again. The row still looks greyed out.
- **Valmorius:** his Mage Armour is still inactive. Once this release is installed, click its toggle on the Effects tab to switch it back on (or recast it).

**Example:** a character with an invested Stash Sack II (200 lb) stows a 30-lb suit of armour they aren't wearing and an 8-lb weapon. Their Encumbrance drops by 38 lb, and the stowed line reads 38 of 200.

## Harnesses

- **`verify-stash-stow` (new, 10 checks):**
  - every carried-item table has the stow control;
  - a sack is refused;
  - the weight rule over every kind of row: worn armour is never stowed, a bundle weighs as a bundle, the overflow is carried, and an uninvested sack holds nothing;
  - the Wt. column isn't covered by the buttons;
  - equipping clears the stowed mark, and the equip tooltips no longer say "stow".
- **`mutate-stash-stow` (new):** 14 mutations, all caught.
- **`verify-spell-armour-display` (new, 6 checks):** the total takes the higher of worn armour and the magical armour, never both; the sheet passes the scaled figure the damage workflow reads; the Combat tab's row and the tooltips.
- **`mutate-spell-armour-display` (new):** 6 mutations, all caught.
- **`verify-effect-toggle` (new, 4 checks) and `mutate-effect-toggle` (3 mutations, all caught):** the inactive row and its buttons take clicks; the row is still the one marked "disabled"; the toggle flips both ways.
- **`verify-rules-have-callers`:** `itemStashCapacity` now has a caller (the sheet's refusal), so it comes off the backlog.
