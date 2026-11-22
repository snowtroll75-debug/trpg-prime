# TRG Prime 3.708.1: what the 3.708.0 live test found

22 November 2026. Follows 3.708.0 (Party Sheet V2, Stage 1), which it includes, on the same branch, `feature/party-sheet-v2-stage1`. The report is `live-testing-report-3.708.0.md`. Live, 26 of the 28 tests passed. The two failures, and two smaller problems found along the way, are fixed here.

## A. The roster's Remove button never appeared (R-0023)

- **What happened:** no roster row had a Remove button, for the GM either, so a deleted or ineligible entry couldn't be taken off the roster.
- **Why:** inside `{{#each members as |m|}}` the template tested a bare `isGM`, which Handlebars reads from the member, so it was always false. The Loot rows already used `../isGM`. This predates 3.708.0.
- **Fix:** `{{#if ../isGM}}`. Live, with the fix applied to an in-memory copy of the template, Remove cleared a deleted and an ineligible entry.

## B. An unlinked token's base actor wasn't watched (R-0024)

- **What happened:** an adversary on the Rewards tab placed as an unlinked token kept its old name after its world actor was renamed, until the next render.
- **Why:** in v14 a token's synthetic actor has no `baseActor`; the token has it (`actor.token.baseActor`). Changes to the token's own actor were already seen.
- **Fix:** `watchKeysFor` reads the base actor from the token.

## C. A taken stack didn't join the character's stack (R-0025)

- **What happened:** a player took 1 rope while already holding 2, and got a second row of 1 instead of a stack of 3. The totals were conserved.
- **Why:** `findMergeTarget` compared the incoming item's stored data with the existing item's prepared data, which includes `totalWeight`, a derived field that changes with the quantity. This predates 3.708.0.
- **Fix:** both sides compare stored data (`_source`). A genuinely different item still never merges.

## D. Wording

"is a affliction" now reads "is an affliction".

## Harness

- **`verify-party-sheet-stage1`:** a new section F (5 checks), 120 in all.
- **`mutate-party-sheet-stage1`:** 4 more mutations, all 51 caught.
- **Version pins** raised to 3.708.1.

No data change and no migration.
