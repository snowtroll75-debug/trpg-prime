# TRG Prime 3.716.1: A lingering performance ends cleanly, and says it lingers

26 November 2026. Branch `fix/spell-metamagic-rulings`, on top of 3.716.0.

- **Install over 3.716.0.** No migration, and no world data changes.
- **Modules:** nothing new is needed.

## Found by the 3.716.0 live retest

All 14 cases of the 3.716.0 retest passed (`live-testing-report-3.716.0.md`). Case 13 (Inspire Courage with Lingering Performance, its Sustain allowed to lapse in combat) lingered and ended on the right rounds, but showed two faults.

### 1. A server error when the performance ended

At the start of the round it ended, the server logged `ActiveEffect "…" does not exist!` twice. All the effects still came off.

**Why.** Two sweeps end a spell whose time is up: one at each turn start, and one whenever the world clock moves. A new round does both at once. A lingering performance carries both a round and a world-time end, so each sweep found it before the other had removed it, and the second tried to delete effects that were already gone. The race was older than 3.716.0, but a lingering performance is the first spell that reaches it every time.

**Now.** A spell that is being ended is claimed first, so the second sweep leaves it alone. "… fades — its duration is spent" is said once.

### 2. The turn card called it a lapse

When the Sustain lapsed, the Phase 1 card said "Inspire Courage lapses (not sustained)", although the performance was only beginning to linger.

**Now:** "Inspire Courage lingers — the performance has stopped, and it carries on for 3 rounds (Lingering Performance)." A spell that really lapses still says "lapses".

## For developers

- `active-spells.mjs`:
  - `endActiveSpell` claims `actor|id` before its first await, and returns `null` to a second caller.
  - `sweepActiveSpellExpiry` reports only what it ended itself.
  - `sweepSustainedLapses` returns only the names that ended, with those now lingering as `.lingered` (`{name, rounds}`).
- `combat.mjs`: the lingering line on the turn card.
- `metamagic.mjs`: a stale comment that called Lingering Performance a note.
- **Harness:**
  - `verify-spell-metamagic-rulings` 99 checks (new: E1–E4, N1–N3), and `mutate-spell-metamagic-rulings` 61, all caught.
  - `mutate-dismissible-spells`: one anchor moved with the sweep's line.
  - The version pins are now 3.716.1. The schema stays at 3.716.0.
