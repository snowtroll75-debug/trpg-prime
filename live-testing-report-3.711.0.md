# Live testing report: TRG Prime 3.711.0 (Party Sheet V2, Stage 4)

23 November 2026. Test world, Foundry v14.367.
- **GM:** Testing Dude, in Chrome.
- **Player:** PC Tester, who owns Valmorius 2, in the built-in browser.
- **Version installed:** 3.711.0, confirmed on both clients.

**Setup:**
- a party of the five characters;
- party loot: Test Sword (1), Test Arrows (20), Test Potion (3);
- treasury: 7 gp 5 sp 2 cp;
- Valmorius 2 carrying Test Rope (3) and Kharon carrying Test Dagger (2);
- an NPC "Outsider", not in the party.

## GM

| # | Test | Result |
|---|---|---|
| 1 | Inventory columns: Type, Qty, Weight (each / in all), Details ("1d8 slashing"); the member strip lists the 5 members; total value 7.52 gp | Pass, **except the Type column read "TYPES.Item.weapon"** (finding 1) |
| 2 | Search "ARR" shows only the arrows; type "consumable" shows only the potion; the filter survives a redraw; "Nothing matches" shows for "zzz"; the actor is unchanged | Pass |
| 3 | Give 5 of 20 arrows to Kharon (chooser, quantity): Kharon 5, party 15; card; journal shows done, nothing pending | Pass, **but the card read "Kharon took"** (finding 2) |
| 4 | Give pressed twice quickly: one chooser | Pass |
| 5 | GM override: the chooser lists the members, then "Outside the party (GM)/Outsider"; the potion goes to Outsider; the card says "(GM, to someone outside the party)" | Pass |
| 6 | Deposit Item button: the chooser lists members' items by character, equipped ones marked; choosing one deposits nothing | **Fail** (finding 3) |
| 7 | Split Coin among Kharon, Syn and Valmorius 2: the preview recalculates; each gets 2 gp 1 sp, and 1 gp 2 sp 2 cp stays; 7.52 gp before and after; card | Pass |
| 8 | Give Coin 1 gp 1 cp to Character; then 50 gp refused ("the party does not have that much GP"), with nothing moved | Pass |
| 9 | Drag the sword onto Syn in the member strip: a move ("Syn was given…") | Pass |
| 10 | Drag 4 arrows onto Valmorius's own sheet: a move, not a copy | Pass |
| 11 | Drag Kharon's 2 daggers onto the party sheet: a deposit; Kharon 0, party 2 | Pass |
| 12 | 99 arrows asked for, 11 there: "only 11 left", nothing moved | Pass |
| 13 | An unfinished transfer in the journal (set up by hand, a minute old) shows under Unfinished Transfers; "Checked" clears it | Pass |

## Player (PC Tester)

| # | Test | Result |
|---|---|---|
| 14 | Tabs: Overview and Inventory; Take, Deposit Item, Deposit Coin and Take Coin enabled; no Give, Split, Remove or member strip; coin fields read-only; search and filter usable | Pass |
| 15 | Take, pressed twice quickly: one quantity dialog, no destination chooser (one owned member); 1 of 2 potions taken through the GM relay | Pass |
| 16 | Deposit Coin 2 pp from Valmorius 2 | Pass |
| 17 | Take Coin 10 sp from 2 sp: refused with the reason; then 1 pp taken | Pass |
| 18 | Deposit Item button | **Fail** (finding 3) |
| 19 | Dragging own rope onto the party sheet: nothing happened | **Fail** (finding 4) |
| 20 | Requests forged from the console: a take to Kharon, the same with the override, a Split, and a deposit of Syn's sword. All refused by the GM's client ("you do not own that character"; "only the GM can split") | Pass |
| 21 | Dragging party arrows onto own sheet: refused, nothing copied | Pass |
| 22 | Clicking an item opens its sheet (Observer) | Pass. The sheet's title also showed "TYPES.Item.ammunition" (finding 1) |

## Concurrency

| # | Test | Result |
|---|---|---|
| 23 | The last potion requested by the player (relayed) and the GM at the same second: the player got it; the GM was told "no longer in the party inventory"; 3 potions in all across the world | Pass |

## Findings, fixed in 3.711.1

1. **Item types showed as raw keys.** Item types had no labels in `lang/en.json`, so the Type column, and every item sheet's title, read "TYPES.Item.weapon". Labels were added for all 19 item types, and the Type column falls back to the type name.
2. **Wording.** The GM's Give posted "Kharon took". It now reads "Kharon was given", under the heading "Given from the party".
3. **The Deposit Item chooser read `form.elements.item`.** That is the form collection's own `item()` method, not the field, so the choice was lost and nothing was deposited, for GM and player alike. The field is now named `depositItem` and read with `namedItem`.
4. **A player's drag-to-deposit was ignored.** Foundry only accepts drops on sheets the user can edit, and a player has Observer on the party. `_canDragDrop` now accepts every drop; `_onDrop` decides what each one may do, and the GM's client checks it again.

## Restore

- The party, the Outsider and all new messages were deleted.
- The five actors were restored from snapshots, items and coin included; all compare equal.
- The world is back to baseline: 5 actors, 209 messages, Caves, paused, world time 36, 0 combats, 0 items, 23 `updateActor` hooks.
- No console errors on either client.
