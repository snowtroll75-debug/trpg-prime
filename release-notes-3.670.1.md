# TRG Prime 3.670.1

25 October 2026. Fixes from the live test of 3.670.0 with Inner Tempest 0.7.0 (`live-testing-report-3.670.0`), made with Graham's leave the same day.

- **Install over 3.670.0.** Inner Tempest 0.7.1 needs it. Everything that ran on 3.670.0 runs on it unchanged.
- **No migration prompt.**

## Fixed

**A Stride straight away from an adjacent enemy now provokes.**
- **What went wrong:** found while testing Mantis Stance. A creature beside an enemy that moved directly away drew no Attack of Opportunity; a move past the enemy's side did.
- **Why:** Foundry 14 hands the system the squares a move passes through without the square it starts from, so the square left beside the enemy was never among those departed. This affected every creature, not only a stance.
- **The fix:** the path now starts where the move started, as the wall spells already read it. Swift Pursuit, which measures the same path, now measures the prey's distance before the move from where it actually started.

**A check that takes another check's result does not ask for the skill's training.**
- **What went wrong:** found live with Inner Tempest's Drunken Strike. A Disciple with no Deception ranks hit, and the Feint was refused as "a Trained action".
- **The fix:** when another check's dice and modifiers stand as this one's (`presetDice` with `presetModifiers`, 3.670.0), nothing is rolled with the skill, so its training is not asked for. A shared roll without the modifiers (Spirit Roar's Demoralise) still asks.

**A waived trade-off says so on the card.**
- **What went wrong:** Monkey Stance's 1-AP jump read "Jump for 1 AP instead of 2 (+2 DC)" under "Traded difficulty (+0 DC)".
- **The fix:** it now reads "(waived)". A unit made free (Group Coercion's) is taken off the figure the card prints.

## Checks

- **New harness pair `verify/mutate-fixes-3670-1`:** 12 checks and 9 mutations, all caught.
- **Re-anchored to 3.670.1, meaning unchanged:** `verify-block6-core` (Z0, now "3.670.0 or later"), and the version mutations in `mutate-block6-core` and `mutate-fixes-3669-2`.
- **Full sweep** on the staged build: all 643 harnesses pass. `verify-no-undefined-names`, `verify-rules-have-callers` (backlog unchanged at 513) and `verify-checks-can-fail` green.
