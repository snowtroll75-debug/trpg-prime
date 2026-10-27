# TRG Prime 3.673.3

27 October 2026. One wording fix, found while live testing 3.673.2.

- **Install over any of 3.673.0 to 3.673.2.** It carries their fixes:
  - Guarded's heal is counted in a weapon card's "Now X HP" (3.673.1).
  - A rune timer posts one ending card (3.673.2).
- **No migration prompt.**
- **These modules work on it unchanged:** Inner Tempest 0.10.0 to 0.10.2, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.

## Fixed

**A weapon's damage card said "Includes critical bonus dice" when the dice were not in the roll.**
- Seen in the live test: "9 Slashing damage (1d6 + 3). Includes critical bonus dice (minor), precision type." Guarded had kept the minor critical's die off the blow, and the Guarded line under it said so.
- The line was printed on every critical. It was equally wrong in two other cases where the critical's dice are left out of the formula:
  - when a Reaver Blade turns them into Soul Drain (since 3.659.0);
  - against a creature immune to precision damage.
- **Now** it is printed only when the dice are in the roll. Each of the other three cases already has its own line saying what became of them.

## Checks

- **`verify-block9-core`:** 73 checks (71 at 3.673.2).
  - New: the line is printed only when the dice are in the roll, after the Guarded question.
  - New: the version is 3.673.3 or later.
- **`mutate-block9-core`:** 103 mutations, all caught (98 at 3.673.2).
  - New: the line on every critical, under Guarded, under Soul Drain and against precision immunity; the version not raised.
- **Version pins moved to 3.673.3:**
  - `mutate-block6-core`, `mutate-block7-core`, `mutate-block8-core` and `mutate-block9-core`
  - `mutate-fixes-3669-2` and `mutate-fixes-3670-1`
  - `mutate-release-links`
