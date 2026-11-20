# Live testing report: TRG Prime 3.702.0

19 November 2026, Graham's Test world at localhost:30000, as Testing Dude (GM). Foundry 14.367.

**Before testing:** system 3.702.0 was loaded and the schema was 3.701.0. No migration was offered, as expected.

**Result: pass.** One older ordering issue was found; see Findings.

## Fixtures

- **QD Fighter:** a copy of Valmorius 2, friendly. Given Quick Draw, and an unequipped Scimitar, Dagger and Greatpick.
- **QD Foe:** a hostile copy, adjacent.
- **Combat:** started with no surprise, on QD Fighter's turn.

## Quick Draw

| Test | Expected | Result |
|---|---|---|
| Three weapons to draw, foe targeted | Asked which; 1 AP; the weapon drawn and a Strike made; no Attack of Opportunity | "Draw Which Weapon?" (Scimitar chosen). AP 3 → 2. Scimitar in hand. Strike rolled vs QD Foe (miss). Card: "draws Scimitar and strikes in one motion". No AoO offer |
| Second Quick Draw (Dagger) | Drawn into the free hand; second attack penalty | AP 2 → 1. Dagger in hand. Strike at "Multiple Attack Penalty (attack 2) −4". No AoO offer |
| Hands full (Scimitar and Dagger), Greatpick the only one left | Refused before any AP | "Greatpick needs 2 hands, but you only have 0 free … Release something first." AP unchanged |
| Nothing left to draw (Greatpick removed, both weapons held) | Refused before any AP | "you have no melee or thrown weapon to draw — every one is already in hand. Use Strike instead." AP unchanged |

## Drawing and putting away in combat (the sheet's equip button)

| Test | Expected | Result |
|---|---|---|
| Greatpick, GM "Just set it", one hand already full | The hands check first | Refused: "Greatpick needs 2 hands, but you only have 1 free". Nothing changed |
| Put away the Dagger: As an action, then Sheathe or Stow | Interact, 1 AP, provokes | AP 1 → 0. Interact card: "Dagger is put away (sheathed or stowed)". AoO offer for QD Foe: "provokes — using a manipulate action in your reach" |
| Put away the Scimitar: As an action, then Drop | Release, free, does not provoke | AP stays 0. Release card: "Scimitar is dropped (unequipped)". No AoO offer |
| Draw the Scimitar at 0 AP, as an Interact | The AP gate | "Interact — Not Enough AP" (Proceed anyway / Cancel). Cancelled: Scimitar still not held, AP unchanged |
| Draw the Scimitar with 3 AP, as an Interact | Interact, 1 AP, provokes | AP 3 → 2. Card: "Scimitar is drawn, and is now in hand." AoO offer for QD Foe |
| GM "Just set it" (put away, then draw) | Free, no card | Both free. AP unchanged, no chat card |
| Item sheet's Equipped box on the Dagger, in combat | Same route | "Dagger — In Combat", then As an Interact: AP 2 → 1, Interact card, AoO offer. The box shows ticked |
| Out of combat (combat deleted), Dagger toggled | Free, no prompt | No dialog, no card, no AP. Dagger put away |

## Findings

**An Attack of Opportunity is offered before the AP check.** When the Interact was tried at 0 AP, the foe's AoO offer card was posted first, and then the "Not Enough AP" dialog opened. After Cancel, nothing was drawn, but the offer had already been made.

- **Why:** `resolveAction`'s Manipulate detection runs at the top of the action, before the AP gate and the commit.
- **Not new:** this is older than 3.702.0 and applies to every Manipulate action that's cancelled or refused after the offer. The new draw route only makes it easier to reach.
- **Status:** not changed in this release. A fix would move the detection to after the action is committed.

## Clean-up

- **Deleted:** the combat, QD Fighter and QD Foe, and their tokens.
- **Restored:** the notification wrappers.
- **The world as left:** Kharon, Valmorius and Valmorius 2, with the scene's original tokens, paused on Caves, schema 3.701.0.
