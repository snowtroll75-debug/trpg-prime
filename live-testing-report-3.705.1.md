# Live testing report: TRG Prime 3.705.1 (Lunge revised; action reach)

21 November 2026, around 02:20. World "Test", Foundry at localhost:30000, user Testing Dude (GM).

- **Build:** 3.705.1 confirmed installed. It served the new terms: no row of Lunge's own, and the Reach −2 not waived outside the stance.

## Setup

- **The migration:**
  - The world was at schema 3.704.0. Before running the 3.705.1 migration, I deliberately created a character with an out-of-date Lunge: the 3.703.1 feat text, the 3.704.0 Lunge note and the 3.704.0 Lunging Stance note.
  - Then I ran the migration.
- **Scene:** a throwaway "ZZ Lunge Test" (5 ft grid). The same character, renamed ZZ Lunger, became a Fighter 1 (BAB +1) with Lunge, Lunging Stance and a Broadsword (no Reach). ZZ Lunge Target (npc) stood 10 ft away.
- **How the tests ran:**
  - Lunge was started from `useFeat`, the sheet's Use. Its new "Lunge — Which Action?" dialog, the Strike's target dialog and the Trip's check dialog were all answered in the UI.
  - The plain Trip was started from `resolveAction`, as the sheet's action button starts it.

## Results

| # | Test | Result |
|---|---|---|
| M | The migration to 3.705.1 | **Pass.** The schema is now 3.705.1. The stale Lunge's text became Graham's revised wording ("… gains the reach trait for that Strike."). Its note and the Lunging Stance note became the 3.705.1 wording. The migration card listed "ZZ Stale Lunger — Lunge: description". |
| A | A plain Trip at 10 ft, in combat | **Pass.** Refused: "Trip Attack: ZZ Lunge Target is 10 ft away — beyond your reach (max 5 ft)." AP 3 → 3, no card. |
| B | Lunge → Trip Attack at 10 ft, in combat | **Pass.** The dialog listed Strike and the ten basic attack actions. The Trip passed the reach check and opened its own check dialog. Rows: BAB +1 and "Reach (attacking at 10 ft) −2", with no Lunge −1. Total 12 against DC 10: success, and the target was knocked Prone. AP 3 → 2. The Lunge card carried the new wording. |
| C | Lunge → Strike at 10 ft, in combat | **Pass.** No weapon question (one eligible weapon). Rows: BAB +1, Target Prone (beyond 5 ft) −4, Multiple Attack Penalty (attack 2) −5, and "Reach (attacking at 10 ft) −2". No Lunge −1. AP 2 → 1. |
| D | Lunge → Strike against an adjacent foe, out of combat | **Pass.** Rows: BAB +1 only. No Reach −2, no Lunge row. |
| E | Lunging Stance, then Lunge → Strike at 10 ft, out of combat | **Pass.** The stance's card read "Lunge: no Reach -2 while this stance is up — automatic", and its effect carries `lungePenaltiesNegated`. The Strike's rows: BAB +1 only. It hit for a critical, with the injury and damage applied. The Lunge card read "Lunging Stance: the Reach trait's -2 is negated — no penalty". |
| F | Lunge → Trip Attack at 15 ft (console captured) | **Pass.** Refused: "… is 15 ft away — beyond your reach (max 10 ft)." No card, no Lunge card. |

## Console

Capture started before test F and found no errors or exceptions. Tests M to E ran before capture began; none of their promises rejected.

## Not covered live

- **Lunge with** Double Slice, Charge, Disarm, Shove, Grapple, Shield Bash, Aid, Improvised Attack and the action feats.
- **The reach check on** a held target's Grapple, Coup de Grace adjacency, Reactive Disarm and Disarm Block, and a trait weapon's own reach.
- **A player client:** everything ran as the GM.

These are covered by `verify-lunge-actions-3705`, not live.

## Clean-up

- **Deleted:** the ZZ scene, both ZZ actors, their 17 chat cards and the test combat.
- **Left as found:** the world has Character, Kharon, Valmorius and Valmorius 2, and the Caves scene, which was not touched.
- **Schema:** stays at 3.705.1.
