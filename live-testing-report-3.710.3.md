# Live testing report: TRG Prime 3.710.3

23 November 2026. Test world, Foundry v14, as Testing Dude (GM) in Chrome. Version confirmed installed: 3.710.3.

## Fatigue Recovery lines (R-0030)

**Rest card.** An 8-hour group rest with Kharon at Fatigued 2 and Valmorius at Fatigued 3. Each character got one Fatigue prompt.

| Character | Before | Roll | Card line | After |
|---|---|---|---|---|
| Character | 0 | Failure | "Failure — Fatigue holds steady." | 0 |
| Kharon | 2 | Partial | "Partial — Fatigue holds steady at 2." | 2 |
| Syn | 0 | Success | "Success — no Fatigue to recover." | 0 |
| Valmorius | 3 | Failure | "Failure — Fatigue holds steady at 3." | 3 |
| Valmorius 2 | 0 | Fumble | "Fumble — Fatigue 0 → 1." | 1 |

A second rest of Kharon and Valmorius only:

| Character | Roll | Card line |
|---|---|---|
| Kharon | Heroic | "Heroic — Fatigue 1 → 0." |
| Valmorius | Fumble | "Fumble — Fatigue 3 → 4." |

Every line matches the change that was actually applied, and no "-1" is shown where nothing changed. **Pass.**

**Standalone card** (Fatigue Recovery button on the character sheet):
- Syn at 0, rolled 4 times: each card read "No Fatigue to recover."
- Kharon at 2: "Fatigue reduces by 1, to 1", and Kharon was left at 1.
- **Pass.**

**Not tested live:** the curse-held wording (no held Fatigue was set up).

## Restore

- The party was deleted.
- The new messages were deleted.
- The five actors were restored from snapshots, and system, flags, effects and items all compare equal.
- The world is back to baseline: 5 actors, 209 messages, Caves, paused, world time 36, 0 combats, 0 items, 23 `updateActor` hooks.
- No console errors.
