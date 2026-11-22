# Live testing report: TRG Prime 3.709.0 (Party Sheet V2, Stage 2: the Overview)

22 November 2026, about 16:15–17:00. World "Test", Foundry V14 build 367. Graham installed 3.709.0, and the system reported 3.709.0.

**Who:**
- **Testing Dude (GM):** in Chrome.
- **PC Tester (player):** in the built-in browser.

**Starting state:** 5 actors, 1 scene (Caves), 209 messages, no combats, no world items, paused, 23 `updateActor` hooks.

**Set-up, all throwaway:**
- **Six-member party:** ZZ Wizard, ZZ Bard (owned by PC Tester), ZZ Ally (an NPC), ZZ Rogue, ZZ Cleric and ZZ Fighter.
- **One-member and empty parties.**
- **A 22-member mixed party:** 10 PCs and 6 NPCs added to the six.
- **"ZZ Stage2 Scene":**
  - two linked tokens for the Wizard;
  - one each for the Bard, Rogue and Cleric;
  - an unlinked copy of the Ally;
  - no token for the Fighter.

## Results

| # | Test | Result |
|---|---|---|
| O1 | Tabs and toolbar | **Pass.** Overview, Inventory, Encounter. The toolbar has Roll Initiative (off: "No combat is active.") and Begin Session. |
| O2 | The summary, six members | **Pass.** 6 members, APL 1, Pace 30 ft (ZZ Wizard, the first of the tied slowest), 0 gp. |
| O3 | Every printed figure against the actor | **Pass.** For all six: DB, Init, Fort, Ref, Will and Speed (via `landSpeed`), HP, AP, Reactions and Conviction equal the actor's prepared values. |
| O4 | The Rogue's land Speed set to 20 | **Pass.** Pace changes live to "20 ft, ZZ Rogue". |
| O5 | The Cleric's Dexterity +2 and Wisdom +1 | **Pass.** The row changes live from DB 10 / Init 0 to DB 12 / Init 15 / Ref 2 / Will 1, matching the actor. |
| O6 | Find and Select availability | **Pass.** The Wizard reads "2 on this scene". The Ally reads "No token… 1 unlinked copy… is a separate creature" and is off. The Fighter has no token and is off. |
| O7 | Find on the Wizard, three presses | **Pass.** It pans to the token at (1550, 1150), then to (350, 350), then wraps back to the first. |
| O8 | Select | **Pass.** The Wizard's Select takes the token Find last went to. The Bard's Select then leaves only the Bard selected. |
| O9 | GM steppers on the Bard | **Pass:** HP 30 → 28 → 29; AP down to 0 and no further, then up to 1; Reactions stop at 0. **FAIL (finding B):** + at the maximum wrote above it. HP was stored as 31 (shown 30), Conviction 2 with a maximum of 1, PP 1 with a maximum of 0. |
| O10 | Apply Damage on the Rogue | **Pass.** The existing "ZZ Rogue — Apply Damage" dialog. 7 damage: 30 → 23, and the row followed. |
| O11 | Add a condition (GM) | **Pass.** The picker lists 37 conditions. Blinded is added and removable. Its granted Flat-Footed is shown in italics with no remove. |
| O12 | Add Weakened | **Pass.** The system's own "Apply Weakened" value prompt appeared; with 2 the chip reads "Weakened 2". |
| O13 | Remove Blinded from its chip | **Pass.** Blinded and the Flat-Footed it granted both go; "Weakened 2" stays. |
| O14 | Combat: the Wizard (2 tokens), Bard, Rogue and Cleric | **Pass.** The Wizard reads "2 of this actor's combatants need a roll — use the Combat Tracker". The Bard, Rogue and Cleric are ready. The Ally and Fighter read "Not in the current combat". The toolbar reads "Roll Initiative (3)". |
| O15 | Roll the Bard's initiative from its row | **Pass.** 47, by the system's roll with a chat card. The row shows "47" and the toolbar drops to (2). |
| O16 | The toolbar's party roll | **Pass.** The Rogue (96) and the Cleric (111) roll in one call; 3 cards in all; the toolbar goes off. The Wizard is left to the tracker. |
| O17 | Empty party | **Pass.** Members 0, APL 0, Pace "—", the add-members hint, Roll Initiative off. |
| O18 | One-member party | **Pass.** 1 member, APL 1, Pace 30 ft (ZZ Bard). |
| O19 | 22-member mixed party | **Pass.** 22 rows and the summary. A live update redrew it 85 ms after the change (including the 50 ms coalescing delay). |
| O20 | Window sizes 820×760, 620×600, 1100×800, 500×600 | **Pass.** No horizontal overflow at any size: the panel and all 22 rows. At about 520 px the panel wraps cleanly; the tab labels truncate ("Ove…"), as the existing tab style does at that width. |
| O21 | Scrolled to 900 px, then the Cleric is damaged | **Pass.** The live redraw kept the scroll at 900 and the tab. |
| P1 | **The player's view** | Restricted rows and the GM-only controls are correct: no steppers, damage, condition controls or Remove; the Ally gated; tabs Overview and Inventory only. **FAIL (finding A):** every button was disabled, the tabs and the player's own Bard controls included. |
| P2 | With the fix applied in memory (finding A) | **Pass.** The tabs, Roll Initiative (1) and the Bard's Find, Select and Roll are live. Find stays off for tokens the player can't see (the GM's, without shared vision) and for the hidden Rogue. The coin fields stay locked. |
| P3 | The player clicks the Bard's Roll Initiative, Find, then the Inventory tab | **Pass.** It rolled (34) and switched tab. |
| P4 | The player clicks Take Coin | **Pass.** The "Give To" chooser (PC Tester owns several characters), then 3 gp: the party went 10 → 7 and the Bard got 3. |

## Findings, fixed in 3.709.1

- **A. A player could use no button on a Party sheet** (R-0026). Foundry v14's `DocumentSheetV2` disables every form control on a sheet the user can't edit, and a player has Observer on a party. This predates Party Sheet V2: since the sheet first ran on v14, a player couldn't switch tabs or press Take Item or Take Coin. The 3.708.0 player test drove the Take workflow from code rather than by clicking, so it missed this.
  - **Fix:** after Foundry's pass, the controls marked `data-player-ok` (tabs, Take, Open, Find, Select, Roll Initiative) are enabled again unless the template disabled them. Each checks its own permission when pressed.
  - **Still locked for players:** every field that writes the party.
- **B. A stepper's + at the maximum stored a value above it** (R-0027). The actor showed the clamped value, but the stored one would surface the day the maximum rose: a free Conviction point after Hero's Fortune, for example.
  - **Fix:** a raise stops at the maximum, and a value already above it isn't pushed further but can still be lowered.

## Not covered live

- **Immunity on Add Condition:** that path is the actor's own `toggleStatusEffect`, unchanged.
- **The Encounter tab and the GM's Inventory:** unchanged since 3.708.1 and covered there.
- **The console:** not captured from the start.

## Clean-up

- **Deleted:**
  - the combat;
  - the 26 ZZ actors;
  - the ZZ scene and folder;
  - 6 chat cards.
- **Restored:** Caves is active and viewed again.
- **Now:** 5 actors, 209 messages, no combats, no world items, paused, 23 `updateActor` hooks.
- **Browsers:** the player's browser tab was closed, which also discarded the in-memory test patches. The Chrome tab was closed.

## Re-test of 3.709.1 (installed by Graham), 22 November 2026, about 16:45

Throwaway ZZ Bard (owned by PC Tester) and a party holding 5 gp and 3 rope.

| # | Test | Result |
|---|---|---|
| R1 | GM: + at the maximum on Conviction (1/1), HP (30/30) and AP (3/3) | **Pass (B fixed).** Nothing is written; the stored values stay at 1, 30 and 3. HP −1 then +1 still works. |
| R2 | Player: the sheet stays read-only (`isEditable` false), yet the tabs are live | **Pass (A fixed).** A real click on Inventory switches the tab. |
| R3 | Player clicks the rope's Take | **Pass.** The "Give To" chooser, then 2 of 3: the party has 1 and the Bard 2. |
| R4 | Player clicks Take Coin | **Pass.** The chooser, then 2 gp: party 5 → 3, Bard 2. |
| R5 | Player takes the last rope | **Pass.** It joins the Bard's stack: one row of 3 (the 3.708.1 merge fix, live). |
| R6 | Player's locks | **Pass.** The coin fields and party name stay disabled, and there are no GM controls. |

**Clean-up:** both ZZ actors, the folder and 3 chat cards were deleted. The world is back to 5 actors, 209 messages, Caves, no combats or items, paused, 23 hooks. Both browser tabs were closed.
