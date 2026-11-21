# Live testing report: TRG Prime 3.707.3

21 November 2026, about 19:15–19:30. World "Test", Foundry V14 build 367. 3.707.3 was confirmed installed by Graham.

- **Who:** Testing Dude (GM), through the Claude desktop app's built-in browser (the Chrome extension was disconnected).
- **Setting:** the ZZ scene and actors kept from the 3.707.2 test (`live-testing-report-3.707.2.md`), in its combat at round 4, the Orc's turn.
- **Forced dice:** where marked, the d20 was fixed through `CONFIG.Dice.randomUniform` and restored.

## Results

| # | Test | Result |
|---|---|---|
| R1 | The Orc Strikes the Wizard (MAP reset, forced 14, total 19); Stone Shield taken from the reaction prompt | **Pass (defect A fixed).** The cast went through: no earth-or-stone dialog (the prompt states it), and Warp? and Casting Conditions answered within the attack's wait. Reaction spent (1 → 0); 1 PP spent (a Critical halves the base 2). The ward: +4 against ZZ Orc only, Hardness 8, 15 Hits, the turn-start stamp on the Wizard. The attack: DC 21 with "ZZ Wizard's Stone Shield: +4 DB", a miss by 2: "Stone Shield! … strikes the shield instead". Club damage 7, stopped by Hardness 8: 15/15 Hits. Wizard HP unchanged (63). |
| R1b | The shield's damage card | **Pass (defect C fixed).** "7 Bludgeoning to Stone Shield (before its Hardness)". |
| R2 | Sheet cast, one foe (ZZ Orc 2) targeted, earth-or-stone Yes | **Pass (defect A fixed).** "+4 circumstance to defence against ZZ Orc 2 only". A second shield, 15 Hits, stands beside the first, which is unchanged. |
| R3 | Seer's Vision cast by the Wizard on the Ally on the Orc's round-4 turn | **Pass (defect B fixed).** The record carries the stamp (the Wizard, cast turn round 4, the Orc's combatant) and replaced the unstamped 3.707.2 glimpse. It outlasted the ends of the Orc's, the Ally's and Orc 2's turns, and lapsed exactly as the Wizard's round-5 turn ended: "Spells end — Seer's Vision expires on ZZ Ally". |
| R3b | Both shields, on the way | **Pass.** Each ended at the Wizard's round-5 turn start ("Stone Shield expires." twice). |

**Console:** no errors.

With `live-testing-report-3.707.2.md`, everything in 3.707.0–3.707.3 has now passed live, except the two items that report lists as not tested here (the owned-copy repair, and a player's Strike on a GM's shielded NPC). Both are driven by the harness.

## Clean-up

- **Deleted:**
  - the "ZZ Stone Shield Test" scene and its combat;
  - the ZZ Wizard, ZZ Orc, ZZ Orc 2 and ZZ Ally actors;
  - the 59 chat messages Testing Dude posted since 18:30 today, across both test sessions.
- **The chat is back to its 209 messages.** No other user posted in that time.
- **Left as found:**
  - Testing Dude's 75 older messages, which predate today's sessions;
  - Character, Kharon, Syn, Valmorius and Valmorius 2, none of them touched;
  - the Caves scene, active again.
- **Paused:** the game is paused, as it was at launch.
- **Browser:** the test tab was closed.
