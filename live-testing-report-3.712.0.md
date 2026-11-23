# Live testing report: TRG Prime 3.712.0 (Party Sheet V2, Stage 5)

23 November 2026. Test world, Foundry v14.367.
- **GM:** Testing Dude, in Chrome.
- **Player:** PC Tester, who owns Valmorius 2, in the built-in browser.
- **Version:** 3.712.0, confirmed.

**Setup:**
- **Party A:** six members, mixed: the 5 characters plus a temporary NPC, "Temp Ally NPC", which the player can't see.
- **Party B:** Kharon and Syn.
- **Temporary actors and tokens on Caves:**
  - two unlinked Temp Goblins;
  - two linked tokens of one Temp Ogre;
  - a linked Temp Friend (Friendly);
  - a hidden linked Temp Shade;
  - a linked Kharon token (a party member).
- **An active combat** of all seven tokens, with one goblin marked defeated.

## Skills

| # | Test | Result |
|---|---|---|
| 1 | Five tabs, in order: Overview, Skills, Inventory, Encounter, Notes. Group Check on the GM's toolbar. | Pass |
| 2 | All 156 cells (6 members × 26 skills) equal each actor's prepared `system.skills.<key>.total`. | Pass |
| 3 | Perception's best marked: Valmorius 2, +12. | Pass |
| 4 | Sort Z–A; the filter "per" leaves Perception and Perform; both kept after a redraw. | Pass |
| 5 | Clicking Valmorius 2's Perception opens **his own** "Perception — Choose an Action", then the Perception Check dialog. The roll card reads +12, as in the table. | Pass |
| 6 | Party B's Skills page lists only Kharon and Syn. | Pass |

## Group Check

| # | Test | Result |
|---|---|---|
| 7 | Stealth for Kharon, Syn and Temp Ally NPC; DC 15, Hard, "Private to Gamemasters". Each member rolled their own check: Kharon +3, Syn +2, the NPC +0. Each card says "Group Check — Party A Test", DC 17 (Hard). | Pass |
| 8 | The summary card lists each total and result, and "1 Success · 2 Partial". It says the rules set no group result. | Pass. **One wording note:** the summary read "DC 15 (Hard (DC +2))" without the resulting 17 (see below). |
| 9 | Visibility: every card is whispered to the GMs. The player sees "privately rolled some dice ???" for the rolls, and the summary not at all. | Pass |
| 10 | A Conviction prompt (Syn's) was answered and the check carried on. | Pass |

## Encounter

| # | Test | Result |
|---|---|---|
| 11 | Import Combat lists 6 of the 7 tokens; Kharon, a party member, is not offered. Defaults: goblin ticked, Friend unticked (friendly), Shade ticked (hidden), defeated goblin unticked, first Ogre ticked, second Ogre unticked ("another token of the same creature"). | Pass |
| 12 | Import: 3 added. The goblin is stored by its token's own actor; the Ogre once, as `Actor.…`. Storage version 2, with one token recorded each. | Pass |
| 13 | The same combat imported again: every imported row is locked as "already imported"; nothing added. | Pass |
| 14 | Add Selected Tokens with the defeated goblin and Kharon selected: only the goblin is offered (it isn't defeated outside the combat), and it is added as a separate creature. The total goes from 600 to 800 XP. | Pass |
| 15 | Clear: "No" keeps all 4; "Yes" empties the list. The combat, all 7 tokens and all temporary actors still exist. | Pass |

## Notes

| # | Test | Result |
|---|---|---|
| 16 | The GM's editor (`prose-mirror`) opens from the Notes tab. | Pass |
| 17 | A member's HP changes while the editor is open: the sheet doesn't redraw, and the editor stays open (R-0033). | Pass |
| 18 | The treasury changes to 9 gp while the editor is open. After the notes are saved, the party still has 9 gp (the stale-write fix, R-0033); the members and threat are intact. | Pass |
| 19 | The typed text is saved to `system.details.notes`. The sheet is closed and reopened, and the text is there. | Pass |
| 20 | The player sees "Shared start." only: no secret block, and no editor. | Pass |

## Player

| # | Test | Result |
|---|---|---|
| 21 | Tabs: Overview, Skills, Inventory, Notes (no Encounter). Toolbar: Roll Initiative only. | Pass |
| 22 | The NPC's row shows "?" in every column. Only Valmorius 2's modifiers are buttons, and clicking Perception opens his Perception chooser. The filter works. | Pass |

## Finding

The Group Check summary printed "DC 15 (Hard (DC +2))". That is correct, but it doesn't show the 17 each roll was checked against. Fixed in 3.712.1, which shows "DC 15, Hard (DC +2): 17".

## Restore

- Both parties, the combat, the 7 tokens, the 5 temporary actors and all new messages were deleted.
- Kharon's HP was put back.
- The actors compare equal to their snapshots.
- The world is back to baseline: 5 actors, 209 messages, Caves with its original 7 tokens, 0 combats, 0 items, paused, world time 36, 23 `updateActor` hooks.
- No console errors.
