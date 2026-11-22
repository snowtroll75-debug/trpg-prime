# TRG Prime 3.709.1: what the 3.709.0 live test found

22 November 2026. Follows 3.709.0 (Party Sheet V2, Stage 2), which it includes, on the same branch, `feature/party-sheet-v2-stage2`. The report is `live-testing-report-3.709.0.md`. Of the 25 tests, 23 passed outright; the other two each found a defect, fixed here.

## A. A player could use no button on a Party sheet (R-0026)

- **What happened:** for PC Tester, every button on the Party sheet was disabled: the tab buttons, Take Item, Take Coin, and the Overview's own Find, Select and Roll Initiative.
- **Why:** Foundry v14's `DocumentSheetV2._onRender` disables every form control when the user can't edit the document. A player has Observer on a party, never Owner (by design: the GM relay moves the loot). This predates Party Sheet V2. Since the sheet first ran on v14, a player couldn't switch tabs or press Take. The 3.708.0 test drove the Take workflow from code, not by clicking, and missed it.
- **Fix:** the sheet's `_toggleDisabled` runs Foundry's pass, then re-enables the controls the template marks `data-player-ok`:
  - the tabs, Take Item and Take Coin;
  - Open Sheet, Find, Select, Roll Initiative and the toolbar's Roll Initiative.

  A control the template itself disabled (no token, nothing to roll) stays disabled. Each one still checks permission when pressed: the relay for Take, ownership for Select and initiative.
- **Still locked:** every field that writes the party (coin, threat level) and every GM control.
- **Live:** with the fix applied in memory, the player switched tabs, rolled the Bard's initiative and took 3 gp by clicking.

## B. A stepper's + at the maximum stored a value above it (R-0027)

- **What happened:** Conviction was stored as 2 with a maximum of 1, PP as 1 with a maximum of 0, and HP as 31 of 30. The sheet showed the clamped value.
- **Why:** preparation clamps what's shown, not what's stored. The stored excess would surface when the maximum rose.
- **Fix:** a raise stops at the maximum. A value already above its maximum (an effect, an old typed value) isn't pushed further, and can still be lowered.

## Harness

- **`verify-party-sheet-stage2`:** a new section L (23 checks), 140 in all.
- **`mutate-party-sheet-stage2`:** 8 more mutations, all 48 caught.
- **Version pins** raised.

No data change and no migration.
