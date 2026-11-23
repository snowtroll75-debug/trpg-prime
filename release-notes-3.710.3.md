# TRG Prime 3.710.3: the Fatigue line says what changed

23 November 2026. Follows 3.710.2, which it includes, on the same branch, `feature/party-sheet-v2-stage3`.

## A. Fatigue Recovery reports the change that landed (R-0030)

**Found:** in the 3.710.2 live test. A character with no Fatigue who passed the save still got "Fatigue Recovery (one check for the rest: Success): -1" on the rest card, although nothing changed. The card printed the step the save earned, not what was applied. The standalone Fatigue Recovery card, rolled from the character sheet, had the same fault: "Fatigue reduces by 1, to 0" from 0. Both are older than 3.710.2.

**Now:** the rest card's line matches the other check lines, showing the degree and then what happened:

| Before | After |
|---|---|
| Success, no Fatigue: "-1" | "Success — no Fatigue to recover." |
| Success, Fatigued 2: "-1" | "Success — Fatigue 2 → 1." |
| Fumble, no Fatigue: "+1" | "Fumble — Fatigue 0 → 1." |
| Failure, Fatigued 3: "fatigue held steady" | "Failure — Fatigue holds steady at 3." |
| Held by a curse | "Fatigue held at 3 (it cannot be lowered)." |

- On the standalone card, a Success with no Fatigue now reads "No Fatigue to recover."
- No rule changed. The save, its DC and the step it moves are as before.
- `rollFatigueRecovery` now also returns `from` and `applied`. Its `delta` is the earned step, as before.

## Harness

- **`verify-rest-single-check`:** 34 checks, up from 26. The new section F checks the card wording on the rest card and on the standalone card. 7 of its checks fail on 3.710.2's code.
- **`mutate-rest-single-check`:** 18 mutations, up from 11. All 18 are caught.
- **Not covered:** the curse-held wording on the rest card is not exercised by the harness, because stubbing a held condition needs the effect machinery.
- **`verify-rules-have-callers` backlog:** `postRestSummaryCard` now has a harness caller, so it leaves the backlog.
- **Version pins:** raised.
- **Sweeps:** all 400 verify scripts pass. All 15 mutate scripts that touch the rest, recovery or exhaustion code pass. The change is to card wording only, so the full mutate sweep was not repeated; it passed on 3.710.2.
