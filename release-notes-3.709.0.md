# TRG Prime 3.709.0: Party Sheet V2, Stage 2 (the Overview dashboard)

22 November 2026. Branch `feature/party-sheet-v2-stage2`, from `feature/party-sheet-v2-stage1` at 3.708.1.

Graham's rulings for this stage (22 Nov 2026):
- **Tabs:** Skills and Notes are added when they're built (Stage 5). No placeholder tabs.
- **Resources:** the existing Apply Damage dialog, plus +/- steppers that make exactly the change that editing the sheet's field makes.
- **Conditions:** the GM can add and remove them from the dashboard, through the actor's own toggle.

## The sheet

- **Tabs:**
  - **Overview** (the old Roster);
  - **Inventory** (the Loot tab, unchanged);
  - **Encounter** (the Rewards tab, unchanged and still GM-only).

  The tab ids are unchanged, so an open tab and the Encounter drop behaviour carry over.
- **Party Actions toolbar:** sits under the header, so it shows on every tab. It holds only controls with a working system behind them:
  - **Roll Initiative:** the members in the active combat that you control and that haven't rolled. It uses the system's own roll.
  - **Begin Session** (GM).

  Rest, Travel and Award XP join in Stage 3.
- **Default window:** 820 × 760. Member panels wrap rather than scrolling sideways.

## The summary

| Figure | From |
|---|---|
| Members | the roster entries that resolved, with missing and not-allowed entries counted separately |
| APL | `averagePartyLevel` (Chapter 12) |
| Pace | the slowest land Speed, by `partyTravelSpeed` over `landSpeed` (the pool reader), naming who sets it |
| Party Coin | `coinValueInGP` |

For a player, an NPC they can't inspect isn't counted in APL or Pace, so its Speed and name aren't revealed.

## A member's panel

**Figures.** Every figure is the member's own prepared value, the same one its sheet prints:
- portrait, name, race and class, level, and an NPC tag;
- HP (with temporary HP) and PP as bars with values;
- DB, Initiative, Fortitude, Reflex and Will, read from `system.combat.*.total`;
- land Speed;
- AP, Reactions and Conviction. Conviction appears only where the world uses it.

A figure a creature doesn't have shows as "—", never as 0, and a pool it doesn't have isn't listed.

**Conditions and effects:** conditions are shown as chips. One granted by another (the Flat-Footed that comes with Blinded) is shown in italics and can't be removed on its own. Other active effects are listed separately.

**Controls (each checked again when pressed):**
- **Open sheet:** whoever Foundry lets see it.
- **Find token:** pans to the member's token on the current scene. A world actor's token means its *linked* tokens only. An unlinked copy is a separate creature: it's counted in the tooltip and never chosen. Several linked tokens are visited in a fixed order, one per press. Players aren't offered hidden tokens.
- **Select token:** only a token this user controls.
- **Roll Initiative:** the system's `rollInitiative` for the member's one combatant still to roll. If the member has several combatants to roll, the button refers you to the Combat Tracker.
- **GM only:**
  - Apply Damage (the existing dialog);
  - +/- steppers for HP, PP, AP, Reactions and Conviction;
  - remove a condition, or add one from the system's list. Both go through `toggleStatusEffect`, so immunity is respected and a valued condition asks for its value.
- **Remove from roster** (GM).

A gated NPC row (Stage 1) offers Find and Select, and nothing else.

## Live updates

The Stage 1 registry also listens to:
- combatants (initiative rolled, joining or leaving a combat);
- a combat starting, ending or becoming active;
- linked tokens being placed, removed or hidden;
- the GM viewing another scene.

Turn changes and token movement don't redraw the sheet.

## Harness

- **New:** `verify-party-sheet-stage2` (117 checks) and `mutate-party-sheet-stage2` (40 mutations, all caught).
- **Re-anchored, same meaning:**
  - `verify-party-sheet-stage1` R14 (counted within the render);
  - `verify-block38-rewards` I1 (the tab is now labelled Encounter);
  - two anchors in `mutate-party-sheet-stage1`.
- **Version pins** raised.
- **Template check:** the template was also rendered offline with Foundry v14's helper semantics (`eq`, `and`, `or`; v14 has no `array`), for a GM and for a player.

No data change and no migration.
