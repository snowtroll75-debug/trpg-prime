# TRG Prime 3.710.1: what the 3.710.0 live test found

22 November 2026. Follows 3.710.0 (Party Sheet V2, Stage 3), which it includes, on the same branch, `feature/party-sheet-v2-stage3`. The report is `live-testing-report-3.710.0.md`: 16 of 17 tests passed.

## A. A second press of Award XP opened a second chooser (R-0028)

- **What happened:** with the award confirmation open, pressing the toolbar's Award XP again opened another "Award XP" chooser. No award could be written twice without a second confirmation, but a repeated press should do nothing.
- **Why:** the repeat-click lock covered the confirmation and the award, but not the chooser in front of them.
- **Fix:** the toolbar's Award XP holds the party's XP lock from the moment it's pressed, chooser included, and runs the award inside it. The Encounter tab's award buttons hold the same lock, so no two XP dialogs can be open for one party at once.

## Harness

- **`verify-party-sheet-stage3`:** S10 and S11 added (66 checks).
- **`mutate-party-sheet-stage3`:** two more mutations and one anchor re-anchored; all 25 caught.
- **Version pins** raised.

## Observed, for Graham's ruling (not changed)

A GM-run group rest raises a "Spend Conviction?" prompt on each recovery roll: 49 for five characters over 8 hours. Each holds the rest until answered. This is the existing Conviction hold in the Rest workflow, unchanged by the Party sheet.

No data change and no migration.
