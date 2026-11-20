# TRG Prime 3.702.0: Quick Draw, and drawing in combat is an Interact

19 November 2026. Follows 3.701.0. Branch `release/3.702.0`.

## Quick Draw didn't draw anything

**The book:**

> **QUICK DRAW** · EXPERT MARTIAL. You draw your melee or thrown weapon and attack with the same motion. Prerequisites BAB +2. You use a 1 AP to Interact and Strike with your weapon.

**Graham, 19 November 2026:** "Quick Draw is not working."

**What was wrong:** the feat only offered weapons already in hand. So it made a plain 1 AP Strike with what you were holding and drew nothing. A sheathed sword couldn't be drawn with it at all.

## Now

- **What you can draw:** any melee or thrown weapon you aren't holding. A weapon counts as thrown if its attack mode is thrown or it has the Thrown trait.
  - Weapons in a Stash Sack count; drawing takes them out.
  - Natural attacks, bows and crossbows are not offered.
- **Choosing:** if you have several, you're asked which. If you have only one, there's no question. If you have none, you're told to use Strike instead.
- **Before any AP is spent:**
  - a Hand & a Half weapon asks for its grip, as the sheet does;
  - the free-hand test is the sheet's own;
  - cancelling, or having full hands, costs nothing. Full hands give the sheet's reason, with "Release something first."
- **For 1 AP:** the weapon goes into your hand and the Strike is made with it. The Strike follows the ordinary attack rules: reach, range for a thrown weapon, and the multiple attack penalty as one Strike.
- **If the Strike is refused** (no target, out of reach): the weapon stays in hand, and the card says so. The Interact happened.
- **Out of combat:** no AP. The weapon is drawn and the Strike is rolled.

## Quick Draw doesn't provoke (ruled)

Graham, 19 November 2026: "Drawing a weapon is an Interact action. This has the manipulate trait which provokes … Quick draw bypasses this."

## Drawing and putting away in combat is now an action

**The book (Chapter 6, Carrying & Using Items):** worn items "can be swiftly retrieved or returned with a 1 AP (Interact) action". Interact is a Manipulate action, and a Manipulate action within an enemy's reach provokes. Release ("You drop an item that you are holding") is free and does not provoke.

**What was wrong:** the sheet's equip tickbox changed what a character held at no cost, in combat as out of it. No AP was paid and no Attack of Opportunity was offered. The item sheet's own "Equipped" box was a second route that skipped it too. Earlier audits checked each action against the book but never asked what this sheet control let a player skip.

**Graham's rulings, 19 November 2026:**
- **Drawing in combat** (ticking a held item to equipped) is the **Interact** action:
  - 1 AP;
  - the Manipulate gates (Grabbed and the rest);
  - an Attack of Opportunity offered to enemies in reach;
  - a card.
  - A refused Interact leaves the item where it was.
- **Putting away in combat** asks how:
  - **Drop** is Release: free, doesn't provoke, and the item falls to the ground.
  - **Sheathe or Stow** is Interact: 1 AP, and it provokes.
- **A GM** is asked "As an Interact" or "Just set it (no action)", so corrections cost nothing.
- **Out of combat,** or in a combat the actor isn't part of, nothing changes.

**What counts:** anything that takes a hand, meaning weapons, shields, held gear such as a torch, and consumables. Natural attacks, Free Hand weapons and bucklers take no hand and stay free. Armour is worn, not held, and isn't covered by this.

**How it's built:** the Interact and Release actions themselves run, with the item already chosen (`resolveAction`'s new `heldChange` option). So the AP, the provocation, the condition gates and the card are the actions' own, not a copy. Interact changes the item only after it has been taken and paid for.

**Not covered:** putting on or taking off armour mid-combat is still free on the sheet. The book gives it much longer times. This needs a ruling.

## Data and migration

None. The schema stays 3.701.0, so no migration is offered.

## Tests

- **New:**
  - `verify-quick-draw-3702` (28 checks) and `mutate-quick-draw-3702` (18 of 18 mutations caught).
  - `verify-held-change-3702` (37 checks) and `mutate-held-change-3702` (18 of 18 mutations caught).
- **Re-anchored:** `verify-stash-stow` S5 now reads the whole equip handler.
- **Version pins:** raised to 3.702.0. The migration gates and schema anchors stay at 3.701.0.
- **Full regression suite:** core 767 of 767 pass. Pillars of Faith 11 of 11. Inner Tempest and Eldritch Arts are unchanged from their 3.697.0 baseline (`TRG_CORE_TEST_REPORT.md` §13).
- **Owed:** a live test in the Test world once installed.
