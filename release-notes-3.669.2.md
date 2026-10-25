# TRG Prime 3.669.2

24 October 2026. Fixes from the live test of 3.669.1 with Inner Tempest 0.6.1 (`live-testing-report-3.669.1`), and Graham's rulings of the same afternoon: option (a) for Aid Another (B5-6), and "fix the smaller things".

- **Install over 3.669.1.** Inner Tempest 0.6.2 needs it. Inner Tempest 0.6.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **No migration prompt.**

## Fixed

**1. Aid Another asks its ticks in its own dialog** (B5-6, option (a)).
- **Found live:** 3.669.1 named Aid Another's action, but its tick was still never asked. Aid Another rolls without the check dialog, and the small prompt before the dice only asks on a weapon attack or a Spellcraft check (the ruling of 23 October). So Inner Tempest's Hive Coordination +2 never appeared. The 3.669.1 notes said this was fixed; it was not.
- **Now:** the Aid Another dialog lists the bonuses that match an Aid with the skill picked, unticked, under "Racial, feature & equipment bonuses".
  - **Picking another skill** shows that skill's ticks and unticks the others.
  - **The ones ticked** apply to the roll.
- **Unchanged:** the 23 October scope of the small prompt. A skill check is still not asked there; an answer given in a dialog is now honoured on any check.
- **Layout:** the ticks sit in a plain block under the fields, as the small prompt's do (found in review: the dialog's two-column grid would have split them).

**2. A day's first "without the need for a roll" is declared.**
- **Found live:** Inner Tempest's Tianzhi Discipline makes the first Refocus each day a Critical. Its check card still showed the unread dice's degree ("Fumble, fails DC by 18") above the outcome's Critical.
- **Now:** the check is declared at that degree before anybody reads it, as Prism Lotus's declared Success is. The card reads "Critical — Declared — the dice do not count", with no Chaos banner. Nothing that answers the dice is offered (conviction, a reroll, a conversion, Fate's declared Success).
- **Found in review, and fixed:**
  - **When the GM sets the DC after the roll,** the card declares the degree when the DC arrives, and offers no +1d6.
  - **Nothing is spent before the dice:** conviction's Advantage and Luck ticked in the dialog are not spent, and Luck armed on the sheet stays armed for the next check.

**3. A Blunder is called a Blunder.** Fortune's Reversal on a Blunder asked "You fumbled the skill check" and its card said "the fumble is rerolled". They now say "blundered" and "the blunder is rerolled".

**4. A defence reaction is offered only when it could be spent.**
- **Found live:** a Fighter's only reaction left was Battle Readiness's, which only serves an Attack or Martial reaction. It was still asked about Guardian's Intercession (Defence), and refused when it answered.
- **Now:** the "Reaction" question before an attack leaves out any reaction that spending would refuse, read with that reaction's own traits. This holds for the system's defence reactions and for a module's alike.

## Checks

- **New harness pair `verify/mutate-fixes-3669-2`:** 26 checks and 50 mutations, all caught.
- **Independent review** of the diff, before the sweep: no blocking defects. Its findings fixed here are the late DC, the spends before the dice, the Chaos banner and the tick layout.
- **Re-anchored to the new code, meaning unchanged:**
  - `verify-block5-core` (the fumble reroll's call), `verify-fixes-3669-1` (the exact first's options), `verify-block34b` (the rebuilt card's shift) and `verify-block40-luck` (Luck passed to the roll);
  - `mutate-fixes-3669-1` and `mutate-offered-conditionals`: one anchor each.
- **The 119 harnesses that read the changed files,** `verify-rules-have-callers` (backlog unchanged at 513) and `verify-no-undefined-names`: green on the dev tree before the sweep.
- **Full sweep** on the staged build: all 639 harnesses pass, first run.
