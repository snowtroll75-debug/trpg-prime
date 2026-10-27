# TRG Prime 3.673.1

27 October 2026. One fix, found while live testing 3.673.0 with Inner Tempest 0.10.0.

- **Install over 3.673.0.**
- **No migration prompt.**
- **These modules work on it unchanged:** Inner Tempest 0.10.0 and 0.10.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.

## Fixed

**A weapon's damage card left Guarded's heal out of "Now X HP".**
- In the live test, a goblin's critical hit on an archer wearing Guarded printed "Now 25 / 32 HP". The Guarded line under it healed 5, so the archer actually stood at 30.
- The weapon path read the target's HP before the heal was dealt. The spell path already added what the heal answered.
- The weapon card now counts the heal too, and so does the Strike's result that other code reads. It counts only what was actually healed, which is reported back through the GM relay when the target is someone else's.

## Checks

- **`verify-block9-core`:** 68 checks (66 before).
  - New: the weapon card counts the heal, before it prints "Now X HP", as the spell card does.
  - New: the version is 3.673.1 or later.
  - Re-anchored: Guarded's heal through the relay.
- **`mutate-block9-core`:** 91 mutations, all caught (86 before).
  - New: the heal is not added; the Strike's result is not mended; the heal is counted before it is dealt; the spell card loses its count; the patch version is not raised.
- **Version pins moved to 3.673.1:**
  - `mutate-block6-core`, `mutate-block7-core`, `mutate-block8-core` and `mutate-block9-core`
  - `mutate-fixes-3669-2` and `mutate-fixes-3670-1`
  - `mutate-release-links`

## Not changed

A timed rune effect still posts two cards when it lapses ("the minute is up" and "… expires"). Nothing is applied twice. This is left for the next core release.
