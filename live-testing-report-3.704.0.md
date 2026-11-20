# Live testing report: TRG Prime 3.704.0 (Lunge)

20 November 2026. World "Test", Foundry at localhost:30000, user Testing Dude (GM). Installed build confirmed as 3.704.0, with the new attack-workflow code served.

## Setup

- **Migration:** the world was at schema 3.701.0. The 3.704.0 migration prompt was run, and the world now reads 3.704.0.
- **Scene:** a throwaway scene, "ZZ Lunge Test" (5 ft grid). Deleted afterwards.
- **ZZ Lunger** (character): Fighter 1, BAB +1. Lunge, Lunging Stance, a Broadsword (no Reach) and a Glaive (Reach), all from the compendium. The compendium notes on Lunge and Lunging Stance carried the new 3.704.0 text.
- **ZZ Lunge Target** (npc): 10 ft away, DB 10.
- **Combat:** started with the Lunger first. Round 1, 3 AP.
- Lunge and Lunging Stance were driven through `useFeat`, the sheet's Use button handler. Targets were confirmed in the Strike's own target dialog.

## Results

| # | Test | Result |
|---|---|---|
| C | Control: an ordinary Broadsword Strike at 10 ft | Refused: "10 ft away — beyond Broadsword's reach (max 5 ft)". AP 3 → 3. This is the reported failure. |
| 1 | Lunge at 10 ft | **Pass.** No weapon question (one eligible weapon). Strike rolled against the target. Card: Lunge (−1) circumstance, Reach (attacking at 10 ft) −2, BAB +1. Total 9 against DB 10, a miss. AP 3 → 2; attack count 0 → 1; Lunge card posted. |
| 2 | Lunge at 15 ft | **Pass.** Refused: "15 ft away — beyond Broadsword's reach (max 10 ft)". AP stays 2, count stays 1, no card. |
| 3a | Enter Lunging Stance | **Pass.** 1 AP (2 → 1). The effect carries `lungePenaltiesNegated`. The card reads "Lunge: no -1, and no Reach -2 … automatic." |
| 3b | Lunge at 10 ft in the stance | **Pass.** No Lunge −1 and no Reach −2. The rows are BAB +1 and Multiple Attack Penalty (attack 2) −5, which is right for the turn's second ordinary Strike. AP 1 → 0; count 1 → 2. The card reads "Lunging Stance: Lunge's penalties are negated". |
| 4a | Only the Glaive in hand | **Pass.** Refused: "Lunge: Glaive already has the Reach trait, so Lunge adds nothing. Use Strike." No card. |
| 4b | No melee weapon in hand | **Pass.** Refused: "Lunge: you must be wielding a melee weapon." No card. |
| 5 | Lunge at 10 ft out of combat (stance still up) | **Pass.** Rolled with no AP. The rows are BAB +1 only. |

## Console

Captured from test 5 onward: no errors or exceptions. Tests C to 4 ran before capture started, and none of their promises rejected.

## Not covered live

- Fight Defensively's paid Strike.
- The off-turn GM authorisation.
- A Large lunger.
- A player client: everything ran as the GM.

## Clean-up

Deleted the ZZ scene, both ZZ actors, their 11 chat cards and the test combat. The world is back to Kharon, Valmorius, Valmorius 2 and the Caves scene, which was not touched.
