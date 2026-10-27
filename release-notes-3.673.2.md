# TRG Prime 3.673.2

27 October 2026. One fix, asked for by Graham after the live test of 3.673.0: "Fix timed rune message".

- **Install over 3.673.0 or 3.673.1.** It carries 3.673.1's fix: a weapon card's "Now X HP" counts Guarded's heal.
- **No migration prompt.**
- **These modules work on it unchanged:** Inner Tempest 0.10.0 to 0.10.2, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.

## Fixed

**A rune's timed effect posted two cards when it ended.**
- Seen in the live test: Harmony's minute posted its own ending ("The rune's minute is up.") and also "Robe — Harmony expires."
- This affects every rune or item that runs on a timer: Animated, Arrow Catching, a module's declared rune with a duration (Harmony, Graceful Wind), and the Incense Burner's hour.
- **Why:** both clocks, the round clock in a combat and the world clock out of one, end such an effect like any timed effect and print "… expires." The timer's own deletion then printed the rune's ending.
- **Now:** a rune timer is still ended by either clock, but the clock leaves its line out. The rune's own ending is the only card. Every other timed effect still prints its "… expires." line as before.

## Checks

- **`verify-block9-core`:** 71 checks (68 at 3.673.1).
  - New: both clocks are driven on a stand-in creature carrying a rune timer and a spell effect. Both effects end, and only the spell effect is named.
  - New: the timer's own ending still speaks on a lapse.
  - New: the version is 3.673.2 or later.
- **`mutate-block9-core`:** 98 mutations, all caught (91 at 3.673.1).
  - New: each clock's line comes back; no effect, or every effect, speaks for itself; a silenced timer is not ended; a lapse says the manual ending; the version is not raised.
- **Unchanged and green:** `verify/mutate-effect-expiry` and `verify-one-clock`.
- **Version pins moved to 3.673.2:**
  - `mutate-block6-core`, `mutate-block7-core`, `mutate-block8-core` and `mutate-block9-core`
  - `mutate-fixes-3669-2` and `mutate-fixes-3670-1`
  - `mutate-release-links`
