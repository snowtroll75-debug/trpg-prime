# Live testing report: TRG Prime 3.712.1 (the remaining checks)

23 November 2026. Test world, Foundry v14.367. Version confirmed installed: 3.712.1.
- **First GM:** Testing Dude, in Chrome.
- **Second GM:** the world's "Gamemaster" user, in the built-in browser. This is the first time two GMs have been connected at once in this rebuild.

These are the checks the final report listed as still unverified.

## 1. Award Encounter XP from an imported encounter

**Setup:**
- a temporary level-3 NPC, "Temp Goblin", with two unlinked tokens in an active combat;
- a party of the 5 characters (APL 4, 4.2 exact).

| # | Test | Result |
|---|---|---|
| 1 | Import Combat: both goblins ticked and added as two creatures, each EL 3, 300 XP. The button reads "Award 600 XP (120 each)". | Pass |
| 2 | Award: the confirmation lists each member's share and their XP before and after. Award: every character +120 XP; the card names each one. | Pass |

## 2. 3.712.1's wording

| # | Test | Result |
|---|---|---|
| 3 | Group Check, Athletics, DC 15, Hard, GM-only. The summary reads "DC 15, Hard (DC +2): 17", with "1 Failure · 1 Critical". | Pass |

## 3. Two GMs connected

**Who performs:** Testing Dude was the designated GM; Gamemaster was not.

| # | Test | Result |
|---|---|---|
| 4 | The second GM gives 3 of 10 arrows to Kharon. The request was relayed and carried out by the designated GM's client: 7 left, Kharon 3; one card, "By Gamemaster". | Pass |
| 5 | Both GMs give the last potion at the same second: Testing Dude to Syn, Gamemaster to Kharon. Testing Dude's succeeded; Gamemaster's was refused ("that item is no longer in the party inventory"). Exactly one potion, Syn's, in the world. The journal holds both ids as done, nothing pending. | Pass |
| 6 | **Hand-over.** The designated GM's tab was closed. Foundry made Gamemaster the active GM, and its own client then carried out a transfer (2 of 5 arrows to Kharon) as performer. | Pass |

## Restore

- **First GM's client (before the hand-over):** the party, the combat, the 2 tokens, the temporary NPC and all new messages were deleted. The five actors, XP included, were restored from snapshots and compare equal. 5 actors, 209 messages, 0 combats, 0 items, world time 36.
- **Second GM's client (after the hand-over):** its temporary party, Kharon's arrows and its messages were deleted. 5 actors, 209 messages.
- **Console:** no errors on either client.

## Not covered

- A disconnect in the middle of one transfer (the journal's Unfinished Transfers case). It can't be forced reliably here. The harness covers it (Stage 4, F5–F9), and the list itself was checked live in 3.711.0.
