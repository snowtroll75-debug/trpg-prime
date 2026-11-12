# Eldritch Arts 0.5.1 and TRG Prime 3.680.1 — Live Testing Report

2 November 2026. Eldritch Arts 0.5.1 on TRG Prime 3.680.1, Foundry V14 (14.367), world "TRG V14", as Gamemaster in Chrome, after Graham installed both. Inner Tempest 1.0.4 was active.

**Throwaway material, all deleted afterwards:**
- the scene "ZZ EA Teleport 3.680.1" (5 ft squares) and a combat on it;
- the actors "ZZ EA Mover", "ZZ EA Foe", "ZZ EA Foe Two" and "ZZ EA Foe Three" (the foes hostile);
- "ZZ EA Witch" (3rd) with her familiars "ZZ EA Witch's Cat" and "ZZ EA Witch's Owl";
- "ZZ EA Storm" (a Storm Sorcerer, 1st).

None of Graham's actors was touched, and the dice were not steered. The 25 test chat cards, the combat, the actors and the scene were deleted, and the view went back to Oldwatch Approach. No console error or warning from TRG Prime or Eldritch Arts.

## TRG Prime 3.680.1: teleport movement

| # | Test | Result |
|---|---|---|
| 1 | Load | **Pass.** 3.680.1, Eldritch Arts 0.5.1, Inner Tempest 1.0.4. |
| 2 | Walk through a hostile creature (the control) | **Pass.** Refused, as before: "would move through ZZ EA Foe's space … Tumble (Acrobatics) first." |
| 3 | Blink drag, two hops, the foe on the line between | **Pass.** It arrived. On 3.680.0 this exact move was refused. |
| 4 | Blink drag, three hops, landing on the foe's square between | **Pass.** It arrived, because a landing is not moving through. |
| 5 | Blink drag ending on a creature's square | **Pass.** Refused: "you cannot end your turn in a space another creature occupies (page 198)". |
| 6 | One-hop teleport over the foe | **Pass.** It arrived, as before. |
| 7 | Walk through the foe, then Blink on | **Pass.** Refused for the walked leg. |
| 8 | Blink, then walk through a foe | **Pass.** Refused for the walked leg. |
| 9 | The token's own movement action set to Blink, then moved | **Pass.** Foundry sent the move as one Blink, and it went over the foe. |
| 10 | In combat, on the mover's turn | **Pass.** Two Blinks charged nothing. The Stride pool counted only the walks (45 ft), charging 2 AP. |

## Eldritch Arts 0.5.1: the live test's fixes

| # | Fix | Result |
|---|---|---|
| 11 | Hexes takes every hex owed | **Pass.** One Use asked "1 of 2", then "2 of 2". Armouring and Hemocovenant were added. |
| 12 | No familiar, no spell adder | **Pass.** The ability had no adder. Armouring cast without the free casting: 3 PP spent. |
| 13 | The bond sets the adder | **Pass.** After the Use made "ZZ EA Witch's Cat", the adder was 1. |
| 14 | The range, as the token moves | **Pass.** The +10 HP bonus was on at 10 ft (HP 48 → 58). It went off at once when the familiar moved to 55 ft (HP 48), and back on at once at 5 ft (58). 0.5.0 was one move behind. |
| 15 | Death by Dying | **Pass.** Damage took the familiar to 0 HP, then Dying 1 to 6 with HP staying at 0, and it died. The bond severed once: one card, Fatigued 2, the adder and the bonus gone. In 0.5.0 nothing happened. |
| 16 | Deleting the dead familiar | **Pass.** No second severing. |
| 17 | A new bond at daily preparation, with fatigue gained since | **Pass.** Fatigued 3 (the bond's 2 + 1 more). The daily preparation card offered no free casting. A new bond was made ("ZZ EA Witch's Owl"): "The severed bond's fatigued 2 ends: Fatigued 3 → 1". The adder was back. |
| 18 | Severed by distance, renewed with the same familiar | **Pass.** Use → severed: Fatigued 3, no adder. At daily preparation: "your bond with ZZ EA Witch's Owl is renewed … Fatigued 3 → 1". The adder was back, and the day's bonus was chosen. |
| 19 | Gale Step into a creature's square | **Pass.** The system refused it, and Gale Step said "the teleport was refused (see the notice), so nothing is spent". No card; the Focus use kept. |
| 20 | Gale Step over a creature | **Pass.** 10 ft to the free square beyond: "You teleport 10 feet", and the Focus use spent. |

## Findings

None.
