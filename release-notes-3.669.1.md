# TRG Prime 3.669.1

24 October 2026. Fixes from the live tests of 3.669.0 with Inner Tempest 0.6.0 (`live-testing-report-3.669.0`, `live-testing-report-it-0.6.0` and its part 2), and Graham's ruling B5-5.

- **Install over 3.669.0.** Inner Tempest 0.6.1 needs it. Inner Tempest 0.6.0, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **No migration prompt.**

## Fixed

**1. A Blunder is offered the fumble reroll too** (B5-5; Graham, 24 October). Inner Tempest's Fortune's Reversal was offered on a Fumble only. A Blunder fails by more, and now gets the same offer.

**2. A reroll needing the reaction is not made when the reaction cannot be spent.**
- **Found live:** a Fighter's first reaction of the round was used. Its second is Battle Readiness's, which only serves an Attack or Martial reaction. Fortune's Reversal (Chance, Focus) was still offered; the reaction was refused, and the reroll was made and the use spent anyway.
- **Now:** the offer is not made when the reaction could not be spent. If the spend is refused, nothing is rerolled and the use is kept.
- **`spendReaction`** now resolves whether it spent (true out of combat).
- **New helpers for modules,** so their reaction feats follow the same rule:
  - `helpers.spendReaction(actor, label, { traits })`;
  - `helpers.reactionRefusal(actor, traits)`, which asks without spending.

**3. A shared roll asks for conviction once.**
- **Found live:** Spirit Roar's one Demoralise is met by every enemy, and the "+1d6?" card came up once per enemy. Spending on a later one would have changed that enemy's total alone.
- **Now:** a check meeting another's die (`presetDice`) is never asked. When the first creature's check spent the +1d6, that same die is met by the others ("Conviction (+1d6, the shared roll's)").
- **The new option:** `resolveAction` takes `presetConvictionDie`.

**4. No conviction on dice that are not read.** Tianzhi Discipline's first Refocus of the day is a Critical "without the need for a roll", but the "+1d6?" card still came up. A day's first declared `exact` now rolls with conviction off.

**5. A player's move while the game is paused costs nothing.** Foundry refuses a player's token move while paused. The system had already charged its AP: 1 AP for a move that never happened. The GM's moves while paused are unchanged.

**6. Aid Another names its action** (`aidAnother`), so a feat's tick for Aid is asked on it. Aid Another rolls without the dialog, so Inner Tempest's Hive Coordination +2 never appeared there; it appeared on Aid Offensive and Aid Defensive only.

## Checks

- **New harness pair `verify/mutate-fixes-3669-1`:** 16 checks and 18 mutations, all caught.
- **Re-anchored to the new code, meaning unchanged:**
  - `verify-block5-core`: the fumble line, the reaction spend, the shared-roll options, and its version check, now "3.669.0 or later";
  - `mutate-block5-core` and `mutate-daily-firsts`: one anchor each.
- **The 33 harnesses that read the changed files,** `verify-rules-have-callers` (backlog unchanged at 513) and `verify-no-undefined-names`: green on the dev tree before the sweep.
- **Full sweep** on the staged build: all 637 harnesses pass, first run.
