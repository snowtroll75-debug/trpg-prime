# TRG Prime 3.712.2: Flat-Footed with its own clock outlasts its owner's turn

24 November 2026. Branch `fix/core-flatfooted-own-clock`, from `main` at 3.712.1. Repair log R-0034.

- **The ruling.** Graham, 24 November 2026: the core's end-of-turn removal of Flat-Footed "should apply unless a local rule overrides it".
- **The defect.** `_onEndTurn` removed every Flat-Footed from a creature at the end of that creature's own turn. That included one a rule had given its own duration. Found live with Inner Tempest 1.1.0's Redirection Stance: an Orc missed on its own turn and was made flat-footed "until the end of its next turn", but it lost the condition as that same turn ended.
- **What changed.**
  - A Flat-Footed stamped with its own turn clock is now left to that clock: `endsAtTurnEndOf` ("until the end of its next turn") or `endsAtTurnStartOf` ("until the start of your next turn").
  - The existing sweeps end it: `expireAtTurnEnd` and `expireTimedConditions`.
  - Any other Flat-Footed goes at the end of its owner's turn, as before. With no clocked one present, the same toggle removes it.
  - The logic is `shedFlatFootedAtTurnEnd` in `combat/effect-application-workflow.mjs`, with `keepsOwnTurnClock` in `magic/effect-duration.mjs`.
- **What did not change:**
  - Chapter 4 Step 4's Flat-Footed is still removed at the start of its owner's turn.
  - A critical hit's or basic action's untimed Flat-Footed still goes at the end of its owner's turn.
  - A Flat-Footed on a **round** clock (`conditionExpiresRound`) still goes at the end of its owner's turn. Only the two turn clocks count as a local rule here.
- **Not covered by the fix:** if Flat-Footed lands on a creature that is already flat-footed from an untimed source, the core declines to stamp the new clock onto the old effect (3.433.0, "whose clock is it"). That creature then loses it at the end of its turn, as before.

## Harness

- **`verify-turn-end-clock`:** 27 checks. The new F section (F1 to F6) drives the helper with fake creatures, including the Redirection case: Flat-Footed laid on the Orc's own turn outlasts that turn and ends as its next turn ends.
- **`mutate-turn-end-clock`:** 22 mutations, all caught; seven are new.
- **Every `verify-*.mjs` in `tools/` ran:**
  - All pass. Run in parallel, 33 failed from contention over the shared LevelDB packs; all 33 passed when re-run one at a time.
  - `verify-checks-read-source` passed: 5 checks over 1,811 pairs.
- **The sweep's static checks** (`verify-no-undefined-names`, `verify-rules-have-callers`, `verify-checks-can-fail`): all OK.
- **Not run:** the full 399-file mutation corpus. The sweep that runs it was stopped at 15 minutes.
- **Mutation files run for the turn and condition clocks:** turn-automation, turn-start-clock, turn-table, condition-clocks, effect-expiry, one-clock, live-findings-3707-2, session-fixes-0829, death-watch, drive-3614, block39-conditions, chapter7-critical-211-220. All caught everything.
- **Companion regression:**
  - **Pillars of Faith** (GitHub `main`, 0.12.6): identical results on 3.712.1 and 3.712.2. Its nine failures are its own pre-existing version pins.
  - **Inner Tempest 1.1.1:** every block green, apart from mutate-block8's one known survivor.
  - **Eldritch Arts:** its GitHub repository holds no harness, so it was not run.
- **Version pins:** re-pinned to 3.712.2 in 69 harness files, as usual.

## Live

Verified on 24 November 2026 in the Test world, with a GM and a player client connected:
- A Skeleton missed on its own turn, and the player's Redirection Stance made it flat-footed. It kept Flat-Footed past the end of that turn and lost it at the end of its next.
- Untimed and Pinnacle-clocked Flat-Footed ended where expected.

See Inner Tempest's `docs/LIVE_TESTING_REPORT_1.1.1.md`.
