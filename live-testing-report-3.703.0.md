# Live testing report: TRG Prime 3.703.0

20 November 2026, Graham's Test world at localhost:30000, as Testing Dude (GM). Foundry 14.367. System 3.703.0 loaded; no migration (none is needed).

**Result: pass.** One cosmetic finding; see Findings.

## Fixtures

- **AR Donner:** a copy of Valmorius 2, friendly, with unworn Chain (medium), Full Platemail (heavy, full suit), Leather (light) and a Metal Helmet (Other). Later given Quick Donning.
- **AR Foe:** a hostile copy, adjacent.
- **Combat:** started with no surprise, on AR Donner's turn. Deleted part-way for the last test.
- Both actors and tokens were deleted afterwards.

## The Manipulate Attack of Opportunity

| Test | Expected | Result |
|---|---|---|
| Helmet as an Interact at 0 AP, cancelled at "Not Enough AP" | No offer, nothing changed | No Attack of Opportunity card. Helmet not on, AP still 0 |
| Helmet as an Interact with 3 AP | 1 AP, helmet on, the offer made | AP 3 → 2. "Metal Helmet is put on." The AoO card posted (AR Foe flat-footed in round 1, so "nobody in reach can answer"; from round 2 the offer card proper) |

## Armour out of combat (R3)

| Test | Expected | Result |
|---|---|---|
| Chain on, then off, with the Worn box | At once; a card with the time each way (R1) | "Putting on Chain takes 4 minutes." / "Taking off Chain takes 4 minutes." Both: "The world clock is not advanced." World time unchanged |
| Full Platemail on and off | Doubled for a full suit | "takes 20 minutes", both ways |
| Metal Helmet on and off | Free, no card (R4) | No card, no AP |
| Leather off with the item sheet's Equipped box | Same route | "Taking off Leather takes 5 rounds (15 AP)." |

## Armour in combat (R2, R4)

| Test | Expected | Result |
|---|---|---|
| Leather (15 AP), Start donning, 2 AP left | A task, this turn's AP paid, a Continue button | AP 2 → 0. Card: "2 of 15 AP paid, 13 AP to go" with "Continue donning Leather". Leather not yet worn. AoO detection fired |
| Next round, the card's Continue button | 3 AP paid, progress kept | AP 3 → 0. "5 of 15 AP paid, 10 AP to go". AoO offer card for AR Foe |
| The Worn box while the task is under way | Continue / Abandon / Cancel | Dialog "Leather — Donning: 5 of 15 AP paid". Abandon: card "abandoned, with 5 of 15 AP paid. The progress is lost." Task cleared |
| The last payment, 2 AP owed with 3 AP available | Only what's owed; the armour on | AP 3 → 1. "Chain is on, and worn." Task cleared, box shows worn |
| Chain off, GM "Just set it" | Free, no card | Chain off, AP unchanged, no card |
| Leather with the item sheet's box, in combat | Same route as the sheet | One "Leather — In Combat" dialog; Start donning: 1 AP paid, task created |
| Combat deleted part-way, then Continue | Finished at once | "Leather is on, and worn. Finished out of combat: the last 14 AP. The world clock is not advanced." |

## Quick Donning (R5)

| Test | Expected | Result |
|---|---|---|
| Rolled with AR Foe targeted | "Whose armour?" offers yourself and the target | Offered "AR Donner (yourself)" and "AR Foe". Self chosen |
| Success (19 + conviction 6 = 25 vs DC 20) | The result stored on the creature | Card: "This times your next donning or removal, made with the Worn box." Flag `{degree: success}` set |
| Then Chain (medium, usually 4 minutes) in combat | 2 minutes (60 AP); the result used up | Dialog "takes 2 minutes (60 AP)"; card "Quick Donning succeeded (AR Donner): 2 minutes"; task total 60; flag cleared |

Not tested live: the GM relay for an ally a player doesn't own (only one user was logged in). It is covered by `verify-armour-change-3703` F13 to F16.

No console errors.

## Findings

1. **Cosmetic:** the GM's "In Combat" dialog for a light suit reads "takes 5 rounds (15 AP) (15 AP)". The rounds label already carries the AP. Minutes read correctly ("2 minutes (60 AP)").
2. **Observation, not 3.703.0's change:** in combat, AR Donner's Formula Book equipped with no prompt. Books are gear that takes no hand, so the held-item rule from 3.702.0 leaves them free. Graham to say whether reading a book in hand should count as holding it.
