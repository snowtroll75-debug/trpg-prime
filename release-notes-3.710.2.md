# TRG Prime 3.710.2: one check for a whole rest

22 November 2026. Follows 3.710.1, which it includes, on the same branch, `feature/party-sheet-v2-stage3`.

## A. One check of each kind per character for the whole rest (R-0029)

- **Graham's ruling:** "If the party are resting for a long period of time which provoke multiple checks, just make one check for the whole duration per character."
- **What happened before:** a rest of several hours rolled Healing Trance, Power Recovery and Fatigue Recovery every hour. Each roll could stop on a "Spend Conviction?" prompt. In the 3.710.0 live test, five characters resting 8 hours raised 49 of them.
- **Now:** each character makes each check once for the whole rest, whatever its length. Graham chose how far each result reaches:
  - **Healing Trance:** one check. Its ×2 (Success) or ×3 (Critical/Heroic) multiplies the Natural Healing of every hour of the rest.
  - **Power Recovery:** one check. Its bonus Power Points are paid once. The Resting/Sleeping PP per hour is unchanged.
  - **Fatigue Recovery:** one Fortitude save. Fatigue moves one step, once.
- **Unchanged:**
  - A one-hour rest still makes one check of each.
  - An Active rest makes none.
  - An unsafe environment still blocks Healing Trance and Natural Healing.
  - Sustaining a spell still blocks Power Recovery.
  - Quick Recovery, rest rates, the trance's scaling, Inner Tempest's daily-first doubling, and a full night's fatigue clear all work as before.
- **What you see:** each check's subtitle says "for the whole 8-hour rest" (or "for an hour of rest"). The rest card shows one line per check: its degree and what it did, for example "Healing Trance (one check for the rest): Success — Natural Healing ×2 for every hour".
- **Applies everywhere:** the group rest from the Party sheet, the scene control, the macro and the API all go through the same `performRestForActor`.

## Harness

- **New:** `verify-rest-single-check` (26 checks) drives `performRestForActor` itself, with `TRGCheck.roll` counted. Run against 3.710.1's code, 17 of its checks fail.
- **New:** `mutate-rest-single-check`. All 11 mutations are caught.
- **Re-anchored, same meaning:** two mutations, `mutate-daily-firsts` "the rest never doubles" and `mutate-recovery-companions` "the rest no longer asks". The loop level went, so the lines lost two spaces of indentation.
- **`verify-rules-have-callers` backlog:** `performRestForActor` now has a harness caller, so it leaves the backlog. The backlog goes from 505 to 504.
- **Version pins** raised.
- **Full sweep:** 400 verify scripts and 397 mutate scripts were run. The only failure was the callers backlog above, which is now fixed and re-run green. Two slow mutation scripts, `mutate-checks-read-source` and `mutate-fixes-3685-3b`, ran past the runner's time limit and were stopped. Neither touches the rest or fatigue code.
- **Companion modules:** all 51 verify scripts across Pillars of Faith, Inner Tempest and Eldritch Arts give the same result on 3.707.3 and on 3.710.2. The 11 failures already known are unchanged.

No data change and no migration.
