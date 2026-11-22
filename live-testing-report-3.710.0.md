# Live testing report: TRG Prime 3.710.0 (Party Sheet V2, Stage 3: the Party Actions)

22 November 2026, about 17:15–17:50. World "Test", Foundry V14 build 367. Graham installed 3.710.0, and the system reported 3.710.0.

**Who:**
- **Testing Dude (GM):** in Chrome.
- **PC Tester (player):** in the built-in browser.

**Starting state:** 5 actors, Caves, 209 messages, no combats or world items, paused, 23 `updateActor` hooks, world clock 36.

**Set-up, all throwaway (in a "ZZ Stage3 test" folder):**
- **ZZ Party A, six members:** ZZ A1, ZZ A2, ZZ A3 (NPC), ZZ A4 (land Speed 20), ZZ A5, ZZ Shared.
- **ZZ Party B, four members:** ZZ B1, ZZ B2, ZZ B3 (Speed 15 each) and ZZ Shared.
- **Unassigned:** ZZ Unassigned 1 (Speed 5) and ZZ Unassigned 2.
- **Everyone at 10 / 30 HP.** The characters are owned by PC Tester.

## Results

| # | Test | Result |
|---|---|---|
| S1 | The GM's toolbar | **Pass.** Roll Initiative, Rest, Travel, Begin Session, Award XP. No Group Check. |
| S2 | Party A → Rest (button) | **Pass.** The existing Rest dialog lists the six members of Party A only, with "Resting the 6 members of ZZ Party A. No one outside the party is included." |
| S3 | Rest pressed again while its dialog is open | **Pass.** Still one dialog. |
| S4 | 8 hours, safe environment, A1 sleeping, A2 unticked, then Rest | **Pass.** Five summary cards (A1, A3, A4, A5, Shared); those five go 10 → 30 HP. A2, Party B and the unassigned stay at 10. ZZ Shared, on both rosters, rests once. |
| S5 | Party B → Rest | **Pass.** Lists B1, B2, B3 and ZZ Shared: "Resting the 4 members of ZZ Party B". Cancelled. |
| S6 | `game.trgPrime.rest.openRestDialog()` and the compendium's Rest macro | **Pass, unchanged.** Every player-owned character (11), with the original note. Cancelled. |
| S7 | Party A → Travel, 24 miles | **Pass.** The dialog lists Party A's six with land Speeds 30/30/30/20/30/30. The existing card: "the party travels at 20, paced by ZZ A4… 24 miles: 1.5 days". |
| S8 | Party B → Travel, 24 miles | **Pass.** Paced by ZZ B1 at 15: "2 days". |
| S9 | The scene control's Travel (`openTravelDialog()`) | **Pass, unchanged.** All 11 player-owned characters, ZZ Unassigned 1 at 5 included. Cancelled. |
| S10 | Toolbar Award XP: the chooser | **Pass.** The encounter (0 XP, disabled), the five accomplishments, a custom amount. |
| S11 | Moderate (200) → the confirmation | **Pass.** "200 XP for a Moderate accomplishment: 33 XP each across 6 members. 2 XP does not divide evenly and is not awarded." Each character shows 10000 → 10033; the NPC shows "share counted; an NPC's level does not come from XP, so nothing is written". |
| S12 | Award | **Pass.** A1, A2, A4, A5 and Shared each 10000 → 10033. The NPC, Party B and the unassigned are unchanged. One card. |
| S13 | Award XP pressed again while the confirmation is open | **FAIL (finding A), fixed in 3.710.1.** A second chooser opened. No second award without its own confirmation was possible, but a repeated press must do nothing. |
| S14 | The Encounter tab's custom 60 XP, then Cancel on the confirmation | **Pass.** Nothing written, no card. |
| S15 | The same, then Award | **Pass.** Each of Party A's five characters 10033 → 10043. |
| S16 | Begin Session double-clicked from the toolbar (A1 given Hero's Resolve at 0/1) | **Pass.** One card, "conviction 0 → 1". |
| S17 | The player's toolbar (PC Tester, Observer on Party A) | **Pass.** Only Roll Initiative (off: no combat). No GM action, no Group Check. |

## Finding, fixed in 3.710.1

- **A. A second press of the toolbar's Award XP opened a second chooser** (R-0028). The repeat-click lock covered the confirmation and the award, not the chooser before them.
- **Fix:** the whole toolbar action, chooser included, holds the party's XP lock, and runs the un-locked award inside it.
- **Checks:** `verify-party-sheet-stage3` S10 and S11, and two mutations.

## Observed, not changed (outside Stage 3)

- **A group rest asks the Conviction question for each recovery roll.** Resting 5 characters for 8 hours raised 49 "Spend Conviction (+1d6)?" prompts (Fatigue Recovery and the like), each holding the rest until answered. This is the existing Conviction-hold behaviour of the Rest workflow, the same from the macro. It is worth Graham's ruling whether a GM-run group rest should skip or batch these prompts.
- **The standalone Travel dialog's note reads "Resting every player-owned character…".** It has always reused the Rest candidates' wording; unchanged.

## Clean-up

- **Deleted:** 13 ZZ actors, the folder, and 35 chat messages (summary cards, prompts, travel and XP cards).
- **Now:** 5 actors, 209 messages, Caves, no combats or items, paused, 23 hooks, clock 36.
- **Browsers:** both browser tabs were closed.
