# Live testing report: TRG Prime 3.711.1

23 November 2026. Test world, Foundry v14.367. GM: Testing Dude (Chrome). Player: PC Tester, who owns Valmorius 2 (built-in browser). Version confirmed installed: 3.711.1.

This is a re-test of the four fixes from the 3.711.0 live test (R-0032).

| # | Fix | Test | Result |
|---|---|---|---|
| 1 | Item type labels | Inventory Type column: "Ammunition", "Weapon", for the GM and the player. Filter options: "All types", "Weapon", "Ammunition". Item sheet title: "Ammunition: Test Arrows". | Pass |
| 2 | Wording | The GM's Give of the sword to Syn: "Given from the party — Syn was given Test Sword … By Testing Dude." | Pass |
| 3 | Deposit Item button | GM: 1 of Kharon's 2 daggers, leaving Kharon 1 and the party 1. Player: 1 of Valmorius 2's 3 ropes, leaving 2 and the party 1. Cards name the user. | Pass |
| 4 | Player drag-to-deposit | The player drags their own rope onto the party sheet: quantity 2, through the GM relay. Valmorius 2 has 0; the party has one row of 3. | Pass |
| 4b | Player drag-to-deposit, refused cases | The player drags Kharon's dagger: "You can only deposit from a character you own." The player drags an actor: "Only the GM can change the party roster." The roster is unchanged. | Pass |

**Restore:**
- The party and the new messages were deleted.
- The actors were restored from snapshots (system, flags, effects and items all compare equal).
- The world is back to baseline: 5 actors, 209 messages, Caves, paused, world time 36, 0 combats, 0 items, 23 `updateActor` hooks.
- No console errors on either client.
