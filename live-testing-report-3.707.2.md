# Live testing report: TRG Prime 3.707.2

21 November 2026, about 18:35–19:30. World "Test", Foundry V14 build 367.

- **Build:** 3.707.2 was confirmed installed by Graham. The Test world was launched from setup, and its schema read 3.707.1 (the migration had run).
- **Who:** Testing Dude (GM) drove every test. The defender's reaction prompt came to the GM, since no player was connected.
- **Setting:** a new scene, "ZZ Stone Shield Test", with four throwaway actors:
  - ZZ Wizard, a copy of Valmorius (Archmage 8), given Stone Shield, Seer's Vision and Shifting Step;
  - ZZ Orc and ZZ Orc 2, copies of Syn, each given a Club;
  - ZZ Ally, a copy of Kharon (Shaman), given Guidance.
- **Combat order:** Wizard > Orc > Ally > Orc 2, started at round 1 on the Orc's turn.
- **Forced dice:** where marked, the d20 was fixed through `CONFIG.Dice.randomUniform` and then restored.

## Results

| # | Test | Result |
|---|---|---|
| S1 | The Orc Strikes the Wizard: the reaction prompt before the roll | **Pass.** "Reaction — ZZ Wizard: ZZ Orc is attacking ZZ Wizard with Club. Take a reaction before the attack is rolled?", offering Stone Shield with its summary and the earth-or-stone requirement. |
| S1b | Stone Shield taken from the prompt | **Fail (defect A).** "Stone Shield — Not Cast: ZZ Orc is 5 ft away — beyond Stone Shield's range of self." Nothing spent: PP 54, reaction 1. The attack went on unshielded: 18 against DB 17, a hit for 7. The Warp chooser opened inside the 30-second wait (Valmorius has metamagic options); answered in time. |
| S2 | The shield raised through the spell's own applier (`applySpellEffects`, as a cast would), to test the shield itself | **Pass.** +4 circumstance against ZZ Orc only; barrier Hardness 8, 15 Hits, scoped to the Orc's uuid; the turn-start stamp on the Wizard and no round clock; the sheet reads "Until the start of the caster's next turn". |
| S3 | The Orc's second Strike, a miss by 7 (forced 14, −5 MAP, DC 21) | **Pass.** "ZZ Wizard's Stone Shield: +4 DB (against one named creature)", DC 21. The shield wasn't struck. No second reaction was offered (a shield already stands against this Orc). |
| S4 | A miss by 1 (forced 15, total 20, DC 21) | **Pass.** "Stone Shield! The attack misses ZZ Wizard by 1 and strikes the shield instead". The Club rolled 5 with no creature under it. The shield's card: "takes 0 (5 damage, Hardness 8 stops 5): 15/15 Hits left". Wizard HP unchanged. **Cosmetic (C):** the damage card's summary read "5 Bludgeoning — no target". |
| S5 | GM's Damage the shield button: 20 | **Pass.** "takes 12 (20 damage, Hardness 8 stops 8): 3/15 Hits left". |
| S6 | The button again: 11 | **Pass.** "takes 3 (11 damage, Hardness 8 stops 8) and is destroyed — the spell ends and the shield crumbles away." The effect is gone, the +4 against the Orc is 0, and the card has no button. |
| S7 | Sheet cast, earth-or-stone answered No | **Pass.** "Stone Shield cannot be cast — you must be adjacent to a large area of earth or stone, such as the ground or a wall." Nothing spent. |
| S8 | Sheet cast, Yes, no foe targeted | **Pass.** "Stone Shield: target the foe to raise it against." Nothing spent. |
| S9 | Sheet cast, Yes, both Orcs targeted | **Pass.** "Stone Shield is raised against one foe — you have 2 enemies targeted. Target only the one." Nothing spent. |
| S10 | Sheet cast, Yes, one Orc targeted | **Fail (defect A).** "Not Cast … beyond Stone Shield's range of self". |
| T1 | Start of next turn, on the caster: a shield raised on the Orc's turn, round 1 | **Pass.** It stood through the Ally's and Orc 2's turns and ended at the Wizard's round-2 turn start ("Stone Shield expires."). |
| T2 | Start of next turn, on an ally: Guidance cast by the Ally on the Wizard, on the Ally's round-1 turn | **Pass.** Stamped with the Ally, no round clock. It **outlasted the Wizard's own round-2 turn start**, where the old clock would have ended it, and ended at the Ally's round-2 turn start ("Guidance expires on ZZ Wizard."). |
| T3 | End of next turn, a condition: Shifting Step cast on the Wizard's own round-3 turn | **Pass.** Concealed, stamped with the Wizard and the turn of the cast. It stood through the end of that turn and every other turn end, and ended at the end of the Wizard's round-4 turn ("Spells end — Concealed expires."). |
| T4 | End of next turn, a recorded d20: Seer's Vision cast by the Wizard on the Ally, round 3 | **Fail (defect B).** The glimpse was still waiting after the end of the Wizard's round-4 turn: the record has no clock at all (pre-existing). |

**Console:** no system error.

## Defects (fixed in 3.707.3)

- **A. Stone Shield can't be cast against a foe.** The range gate measures the named foe against "self", because the spell prints neither range nor area. This predates 3.707.0.
- **B. Seer's Vision's glimpse never lapses.** Its record carries no clock.
- **C. Cosmetic:** the shield's damage card summary says "no target".

## Not tested here

- **The owned-copy repair:** no actor in the Test world owned Stone Shield. The harness drives it (`verify-stone-shield` B6).
- **A player's Strike on the GM's shielded NPC (the relay):** no player was connected. The harness drives the relay.

## State left

The ZZ scene, its combat (round 4) and the four ZZ actors are kept for the 3.707.3 retest, along with the chat cards posted since 18:35. All of it will be removed after the retest. Valmorius, Syn, Kharon and every other actor were not touched. The game was unpaused for the test.
