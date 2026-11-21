# Live testing report: TRG Prime 3.705.1, from a player's seat

21 November 2026, from about 03:40 to 04:40. World "Test", Foundry at localhost:30000.

This pass covers what `live-testing-report-3.705.1.md` listed as "Not covered live".

- **Two sessions at once:**
  - **PC Tester** (player, at `localhost:30000`) drove every Lunge and every action, from the character's own sheet.
  - **Testing Dude** (GM, at `127.0.0.1:30000`) ran the setup between tests and answered the foe's reactions.
- **Build:** 3.705.1, the same install as the GM pass.
- **Someone else in the world:** a third user, "Gamemaster" (GM), connected during the pass and posted a "Syn Human — Apply Grants" card on another scene.
  - The game was found paused partway through; I unpaused it so that the player's token could move.
  - Nothing outside the ZZ scene was touched.

## Setup

- **Scene "ZZ Player Test"** (5 ft grid; ownership default Owner for the test actors).
- **ZZ PC Lunger:** a character owned by PC Tester. Fighter 1, BAB +1, 3 AP. Feats: Lunge, Vital Strike, Combat Grapple, Distracting Strike, Quick Draw, and later Lunging Stance.
  - Held in turn: Broadsword, a natural Claw, Dagger, Whip, Glaive, a Torch and a Light Steel Shield.
- **ZZ Foe:** an npc, 10 ft away unless noted, holding a Club.
  - Later it was given Reactive Disarm, Disarm Block, Offensive Parry, Shield Block and a Heavy Steel Shield.
- **ZZ Guard:** an npc with Guardian Defence and a Club, added for the last reaction test.
- **Combat:** round 1, ZZ PC Lunger's turn.
- **Between tests,** the GM restored AP, the attack count, the foe's HP and conditions.
- **Forced dice:** in four tests the dice were fixed on the player's client (`CONFIG.Dice.randomUniform`) to produce a fumble, a miss by the shield's DB, or a hit. Each is marked "forced".

## Results: Lunge with every action, as the player

Each Lunge was started from the Lunge feat's Use button on the sheet, then the "Lunge — Which Action?" dialog.

The dialog offered: Strike, Double Slice, Charge, Trip, Disarm, Shove, Grapple, Shield Bash, Aid Offensive, Aid Defensive, Improvised Attack, and the four action feats the character has. The target was 10 ft away unless noted.

| # | Lunge with | Result |
|---|---|---|
| P1 | Strike, with the natural Claw | **Pass.** The weapon question offered Broadsword and Claw. Rows: BAB +1, Reach (attacking at 10 ft) −2. AP 3 → 2. Lunge card posted. |
| P2 | Disarm Attack | **Pass.** Reach −2; 1 AP; Lunge card. (The multiple attack penalty from P1 also applied, which is right; the attack count was reset after this.) |
| P3 | Shove Attack | **Pass.** Reach −2; 1 AP; Lunge card. |
| P4 | Grapple Attack | **Pass.** Reach −2; 1 AP; Lunge card. |
| P5 | Aid Offensive | **Pass.** Reach −2; 1 AP; Lunge card. |
| P6 | Aid Defensive | **Pass.** Reach −2; 1 AP; Lunge card. |
| P7 | Improvised Attack, holding nothing | **Pass.** Refused: "holding nothing to attack with". No AP, no Lunge card. |
| P8 | Improvised Attack, with a Torch | **Pass.** Improvised −4, Reach −2; 1 AP; Lunge card. |
| P9 | Double Slice (Broadsword and Dagger) | **Pass.** Both Strikes at Reach −2; 3 AP; result card and Lunge card. |
| P10 | Vital Strike | **Defect A.** The Strike took Reach −2 and the AP was right, but **no Lunge card** was posted. |
| P11 | Distracting Strike, both hands full | **Pass.** Refused: "you need a free hand that can reach the target". No AP. |
| P12 | Distracting Strike, one hand free | **Defect A.** Reach −2, but no Lunge card. |
| P13 | Combat Grapple | **Defect A.** Reach −2 and the hit landed, but no Lunge card. (Also observation O2.) |
| P14 | Quick Draw (draws the Dagger) | **Defect A.** The Dagger was drawn and struck at Reach −2 for 1 AP, but no Lunge card. |
| P15 | Shield Bash | **Pass.** Reach −2; 1 AP; Lunge card. |
| P16 | Charge from 30 ft, the token dragged by the player | **Pass, as far as it went.** The drag landed 10 ft short. The Charge reported "ZZ Foe is 20 ft away, beyond your 10 ft reach — no Strike", which shows the Lunge's +5 ft was counted. 3 AP spent. |
| P17 | Charge from 30 ft, moved by `move(…, {method: "dragging"})` | **Pass.** It ended 10 ft from the foe, and the Strike was offered automatically: Charge +4, Reach −2. 3 AP in all. |
| P18 | Strike, holding only a Glaive | **Pass.** Refused: "Glaive already has the Reach trait, so Lunge adds nothing." No AP. |
| P19 | Trip with the Glaive at 15 ft | **Pass.** Refused at max 10 ft: the Lunge does not stack on a reach weapon. |
| P20 | Strike at 15 ft with Vital Strike | Refused at max 10 ft (right), **but Vital Strike's 2 AP were spent** (observation O7). |
| P21 | Cancel at the action question, at the Trip's Roll dialog, and at the Strike's target dialog | **Pass.** No AP, no cards. Afterwards a plain Trip at 10 ft was refused, so the Lunge left nothing behind. |
| P22 | Lunging Stance (1 AP), then Lunge → Strike and Lunge → Shove at 10 ft | **Pass.** No Reach −2 on either. The cards say the stance negated it. |

## Results: the reach check, as the player

These are plain actions from the sheet's Actions tab, with no Lunge.

| # | Test | Result |
|---|---|---|
| Q1 | At 10 ft, no reach weapon: Shield Bash, Aid Offensive, Aid Defensive, Disarm, Shove, Grapple, Trip | **Pass.** Each refused: "beyond your reach (max 5 ft)". No AP. |
| Q2 | Coup de Grace at 10 ft | **Pass.** Refused: "it must be adjacent". |
| Q3 | Coup de Grace adjacent | Allowed (right). **Defect B:** the card read "AV 11 — [object Object] critical". |
| Q4 | Trip with the Whip (reach 15 ft) at 15 ft | **Pass.** "Attack check with Whip": non-proficient −4, Reach (attacking at 15 ft) −2. Success, and the foe was knocked Prone. |
| Q5 | Trip with the Whip at 20 ft, plain and as a Lunge | **Pass.** Both refused at max 15 ft. |
| Q6 | Trip with the Whip against an adjacent foe | Made "with Whip", with the Whip's −4. See observation O1. |
| Q7 | Grapple a creature you already hold, at 10 ft | **Pass.** Allowed, with no reach penalty. |

## Results: reactions

| # | Test | Result |
|---|---|---|
| R1 | Reactive Disarm: the player Lunges at 10 ft and fumbles (forced) | The foe's Reactive Disarm card was offered. **Defect C:** pressing it did nothing. The console showed `TypeError: game.user.updateTokenTargets is not a function`. This button cannot work in Foundry V14. The reach refusal and the adjacent control could not be tested. |
| R2 | Disarm Block: the player's Lunge at 10 ft misses by the shield's DB (forced) | The offer appeared, and the Disarm was refused: "Disarm Attack: ZZ PC Lunger is 10 ft away — beyond your reach (max 5 ft)". **Defect D:** the "Disarm Block — turns the blow and grabs for the weapon" card had already been posted above the refusal. |
| R3 | Offensive Parry after the GM's Shield Block (6 damage, 1 stopped) | **Pass.** The Shove against the player at 10 ft went ahead (exempt): success, push 5 ft. |
| R4 | Guardian Defence: the player's Lunge hits the foe (forced); the guard, 15 ft from the player, answers | **Pass.** Its Aid Defensive went ahead (exempt): +1 to the foe against the player's next attack; the reaction spent. Before the guard was in the combat, and before it held a weapon, the card held the offer back with the reason. |

## Defects found, fixed in 3.705.2

- **A.** A Lunge made with Vital Strike, Distracting Strike, Combat Grapple or Quick Draw posted no Lunge card. The handlers returned nothing, which `runLunge` reads as "cancelled".
- **B.** Coup de Grace's card printed "[object Object] critical". The critical has been an object since 3.548.0. For a critical-immune target, it should say "no critical".
- **C.** Reactive Disarm's button threw in V14, so the reaction could never be taken. Once fixed, it would also have marked the card and the round's use before the Disarm was tried, so a refusal for reach would have used it up.
- **D.** Disarm Block's narrative card was posted before its Disarm was refused for reach.

## Observations, not changed (need a ruling or are outside this repair)

- **O1.** A Trip against an adjacent foe while holding the Whip is made "with Whip". The Whip "can't be used against adjacent creatures", so should the Trip fall back to a free hand (unarmed), or be refused? This is pre-existing (3.575.0's `maneuverWeapon`).
- **O2.** Combat Grapple's card says the target is Grabbed, but no Grabbed condition is applied. A plain Grapple Attack does apply it. This is pre-existing.
- **O3.** The Lunge Use button's tooltip says "1 AP", but the chosen action pays its own cost (Double Slice and Charge are 3 AP).
- **O4.** A reaction offer card created by the player's attack is whispered to the GMs, but its author (the player) can also read it. That shows the player which reactions the foe has (the buttons are hidden). This is pre-existing.
- **O5.** Lunging Stance's +5 ft for Attacks of Opportunity is still not automated (known since R-0001).
- **O6.** Testing note: a fast drag landed short of where the mouse was released, so the Charge ended 10 ft early (P16).
- **O7.** A weapon feat (Vital Strike here) used on a target out of reach spends its AP, then makes no Strike. The card says "No Strike was made". This is pre-existing for every Strike feat: the feat pays before its Strike is checked.

## Console

The only error during the pass was defect C's `TypeError`.

## Clean-up

Deferred until 3.705.2 has been tested. See `live-testing-report-3.705.2.md`.
