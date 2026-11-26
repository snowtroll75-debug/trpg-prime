# Live testing report: TRG Prime 3.715.1 (Tumble)

26 November 2026, from about 02:10. Test world, Caves scene. TRG Prime 3.715.1 installed (confirmed byte-identical to the build), Inner Tempest 1.1.1 active.

## Setup

- **GM:** Testing Dude at `localhost:30000`, running the combat.
- **Player:** PC Tester at `127.0.0.1:30000`, who owned and played the Tumbler. Every Tumble was pressed from the player's sheet (Skills → Acrobatics → Tumble).
- **Rig:**
  - "ZZ Tumbler", a copy of Syn: Acrobatics +4, land Speed 25.
  - "ZZ Goblin" (Fortitude DC 18, Acrobatics DC 13) and "ZZ Kobold" (Fortitude DC 15, Acrobatics DC 16), from Fiends & Fables, both adjacent.
  - A combat with no surprise; both enemies acted before the Tumbler.
- **Dice:** forced through `CONFIG.Dice.randomUniform` on the player's client, and restored afterwards.

## Results

| # | Check | Seen | Verdict |
|---|---|---|---|
| 1 | Tumble with **no target** | The chooser listed both enemies, each as "past it" or "through its space (+2 DC)", nearest first | Pass |
| 2 | Cancel | AP stayed at 3, no card, nothing armed | Pass |
| 3 | Past the Goblin, d20 = 6 (total 10), **failure** | DC 18, the Goblin's Fortitude DC (higher than its Acrobatics 13). 1 AP spent, nothing armed. The card said the movement ends. The GM was offered Attacks of Opportunity for **both** enemies | Pass |
| 4 | Past the Goblin, total 19, **success** | Opened on the Goblin (the current target). 1 AP spent; the leg was armed at 25 ft, exempting the Goblin | Pass |
| 5 | The drag: 10 ft west, out of both enemies' reach | "Tumble: 10 ft for 0 AP." AP unchanged. An AoO was offered for the **Kobold only** | **Pass (the reported faults)** |
| 6 | Through the Goblin's space, a natural 20 | The DC was **20** (18 + 2), with a card line "Through ZZ Goblin's space: +2 DC". A critical; the passage marker was set to `normal` | Pass |
| 7 | The drag **through the Goblin's square**, 20 ft | Allowed: "20 ft for 0 AP". The marker was spent. An AoO was offered for the Kobold only | Pass |
| 8 | Round 2: a passed Tumble, then **Interact** before moving | Interact spent 1 AP. The leg was removed with the notice "Tumble: the free move is removed — it had to be ZZ Tumbler's next action." | Pass |
| 9 | **Inner Tempest: Pinnacle of Motion's** free Tumble | Same chooser, DC 18, **0 AP**. The leg was armed. "Pinnacle of Motion: ZZ Goblin is flat-footed until the end of your turn" (it read the chosen target). The 5 ft drag cost 0 AP | Pass |

## Notes

- **Nimble Escape.** After test 7, the Goblin's own **Nimble Escape** was offered: a Fiends & Fables creature reaction that triggers when a creature ends its move adjacent. That isn't an Attack of Opportunity provoked by moving through its threatened area, so the Tumble doesn't suppress it. Left for Graham.
- **The success outcome text.** It prints the book's "You move through the enemy's space…" even when the Tumble was past the enemy. That is the book's own sentence, unchanged.
- **Not covered live:**
  - Offensive Momentum (the rig has no Gymnast archetype). Its behaviour is unchanged by ruling.
  - Shift-click skip (the skill chooser route).
- **Console:** no errors from the system or modules while tracked. Tracking began partway through the session.

## Cleanup

- **Deleted:**
  - the combat;
  - the three ZZ tokens and the three ZZ actors;
  - the 25 messages posted since the test began.
- **Remaining:** 296 messages; the actors Character, Kharon, Syn, Valmorius and Valmorius 2.
- **Game state:** paused again, as found.
- **Clients:** the dice were restored and both tabs closed.
