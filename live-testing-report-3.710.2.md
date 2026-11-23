# Live testing report: TRG Prime 3.710.2

23 November 2026. Test world, Foundry v14, as Testing Dude (GM) in Chrome. Version confirmed installed: 3.710.2.

## 1. Group rest: one check of each kind per character (R-0029)

**Setup:**
- A party of all 5 characters.
- Kharon set to Fatigued 2.
- Party sheet → Rest: 8 hours, safe environment, everyone Resting, with Healing Trance and Power Recovery ticked for all.

**Conviction prompts:**
- There were 10 in total, against 49 for the same rest on 3.710.0.
- No character got more than one prompt per check. Checks whose result Conviction couldn't change got no prompt, which is the existing behaviour.

**Rest cards:** one line per check, each ending "(one check for the rest)".

| Character | HP | PP | Healing Trance | Power Recovery | Fatigue |
|---|---|---|---|---|---|
| Character (L1) | 30 → 34 (full) | 0 → 4 (full) | Critical, ×3 every hour | Failure, no bonus | Failure, held steady |
| Kharon (L2) | 30 → 50 (full) | 0 → 8 (8 h × L2 resting) | Success, ×2 | Failure | Success, 2 → 1 |
| Syn (L2) | 30 → 60 (full) | 0/0 | Success, ×2 | Heroic, no bonus (no PP pool) | Success |
| Valmorius (L8) | 70/70 | 54/54 | Success, ×2 | Failure | Fumble, 0 → 1 |
| Valmorius 2 (L8) | 30 → 70 (full) | 0 → 40 (32 resting + 8 Critical bonus, paid once) | Success, ×2 | Critical, +8 PP | Success |

**Result:** pass.
- Fatigue moved one step, once: Kharon 2 → 1 on a Success; Valmorius 0 → 1 on a Fumble.
- Power Recovery's bonus was paid once: +8 at level 8 on a Critical.
- The trance multiplier covered the whole rest.

**Note: wording, not new.** When a character has no Fatigue, a successful save still prints "Fatigue Recovery … : -1" although nothing changed (Syn and Valmorius 2). The card reports the rolled step, not the applied one. 3.710.1 did the same, but per hour ("net -8 over the rest"). Raised with Graham.

**Note: not visible.** The new subtitle "for the whole 8-hour rest" isn't shown on the Conviction prompt card, because these rolls post no roll card of their own. The rest card's wording carries the same information.

## 2. Award XP, pressed twice (3.710.1, R-0028)

- Two presses 300 ms apart opened one chooser.
- After Cancel, and after closing with the X, the next press opened the chooser again, so the lock is released.
- **Result:** pass. No XP was awarded.

## Restore

- The party was deleted.
- The new chat messages were deleted.
- The five actors were restored from snapshots: system, flags, effects and items all compare equal.
- The world is back to baseline: 5 actors, 209 messages, Caves, paused, world time 36, 0 combats, 0 items, 23 `updateActor` hooks.
- Console: no errors from the system. The only error was a connection message during login.
