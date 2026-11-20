# TRG Prime 3.703.1: the armour dialog, and the donning readings confirmed

20 November 2026. Follows 3.703.0. Branch `release/3.703.1`.

## The AP printed twice

**Found in the 3.703.0 live test.** The GM's "In Combat" dialog for light armour read "Donning Leather takes 5 rounds (15 AP) (15 AP)". The rounds label already names its AP; the minutes label ("2 minutes") doesn't.

**Graham:** "fix the display glitch".

**Now:** the dialog reads "takes 5 rounds (15 AP)" and "takes 2 minutes (60 AP)". The AP is added only when the label lacks it (`armourTimeWithAP`, in `combat/armour-change.mjs`).

## The readings, confirmed

Graham, 20 November 2026: "Go with your recommendations." The three readings flagged in 3.703.0 stand as built:

- **Q1** Donning provokes: each turn's payment is a Manipulate action, so it offers an Attack of Opportunity and Grabbed and the rest apply.
- **Q2** Quick Donning's Critical and Success times are absolutes and are not doubled for a full suit; a Fumble doubles the usual time, full suit and runes included.
- **Q3** When Quick Donning and a rune both give a time, the shorter stands.

The code comments now record them as rulings. No behaviour changed.

## Left as it is

**Books in hand.** The 3.703.0 live test noted that a Formula Book equips in combat with no prompt. Gear takes a hand only when its own `heldHands` field says so (a per-item choice), and the Formula Book takes none. This release doesn't change that. Setting it to 1 would make taking it out in combat an Interact, like a weapon.

## Harness

- `verify-armour-change-3703` gains H1 to H3 (88 checks); `mutate-armour-change-3703` gains two mutations (28).
- Version pins raised to 3.703.1. No data or migration change.
