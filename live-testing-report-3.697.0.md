# Live testing report: TRG Prime 3.697.0

18 November 2026, 00:45–01:20. Graham's **Test** world on localhost:30000, Foundry 14.367, as the Gamemaster. **Installed system: 3.697.0**, which Graham installed after its release. Every actor below was a throwaway "ZZ Audit" actor, deleted at the end. World time was advanced for the expiry check and then set back to 0.

| # | Plan step | What was done | Result |
|---|---|---|---|
| 1 | Migration | The world opened at schema 3.666.4 and offered "TRG Prime World Migration" to 3.697.0. Accepted. | **Pass.** Schema 3.697.0, no console error. |
| 2 | Familiar check (`tools/live/familiar-check.js`) | 5th-level master with the Familiar feat; Owl summoned; Fast Movement, Spell Battery and Energy Resistant added. | **Fast Movement: pass**, land 25 → **40**. **Energy Resistant: pass**, Use present. The script's own Spell Battery line threw, because `helpers.familiarsOf` is async and the script did not await it (a script bug, fixed in the branch). Step 7 tests Spell Battery directly. |
| 3 | Energy Resistant | Use → Fire, then Use → Cold. | **Pass.** Resistances "Fire", then "Cold", replacing Fire. One effect, "Energy Resistant: Cold". |
| 4 | Ability Enhancement | Three copies on a 5th-level familiar, each Use → Dexterity. | **3.697.0 behaved as built:** Dexterity 3 → 6, three effects. This is what Graham's ruling (R7) corrects: **3.698.0 allows two at levels 5–8**, so the third is refused. That is checked by `verify-audit-3698` C1–C3 and needs a live retest on 3.698.0. |
| 5 | Speak in Tongues | Master knows Elvish and Dwarvish. Use → Elvish, then Use → Dwarvish. | **Pass.** The familiar's languages read "Elvish", then "Dwarvish" (replaced, not added). |
| 6 | General Adeptness | Use: the picker offered 230 general feats; Alertness picked. Then the ability was deleted. | **Pass.** Alertness granted, `grantedBy` General Adeptness. Deleting the ability removed Alertness. |
| 7 | Spell Battery | The master (Wizard 5, no tokens on the scene) cast Long Arm. | **Pass.** A Spell Adder prompt appeared, and the result card read "Spell Adder: 2 PP paid by ZZ Audit Wizard's Owl: Spell Battery (within 30 ft) — 0 free casts left today". (That cast fumbled on the dice, and the free cast was still marked used; that is the adder's existing behaviour, not a 3.697.0 change.) |
| 8 | Changing Lungs | Cast (dice fixed high to force a success). Then `startHoldingBreath`, with and without the effect. | **Pass.** "can breathe underwater (1 hour)" plus the toxic-atmosphere note. With the effect: 0 rounds held and "Breathes underwater". Effect removed: "5 rounds of air". |
| 9 | Long Arm | Cast; then world time advanced 61 seconds. | **Pass.** Reach 5 → **10**, "has 5 feet more reach (1 minute)". After a minute the effect was gone and reach was back to 5. |
| 10 | Inner Focus | Cast at 12th level (8 PP); the focus rules then read with Focus Ready off. | **Pass.** `focusIllusory` true. Check modifier none (was −2), fumble penalty 0 (was +10). With Focus Ready on, the +1 still applies. |
| 11 | Advancement sweep | `await trgAdvancementSweep()`: 8 classes, 1→20→1 | **Pass, as on 3.696.3.** 0 table mismatches, 0 duplicate grants, 0 errors, 0 dialogs, in 21 minutes. Higher-level grants were kept after the level drop on Druid, Fighter, Ranger, Rogue and Crusader: that is U1, which **3.698.0 changes** (see its plan). |

## Found during the session

- **`tools/live/familiar-check.js` did not await an async helper.** It was fixed to await `helpers.familiarsOf`. Not a system fault: `cast-workflow` calls the synchronous `familiarsOf` from `familiar-workflow.mjs`, which step 7 confirms.
- **An auto-answer script picked "Sacrifice" on an Overcasting prompt.** On the first throwaway Wizard it drained 50 HP of Soul Drain. That was the test driver's mistake, not a defect, and that actor was deleted.

## Not tested live

- **3.698.0** (Graham's rulings): not installed yet. Its live-test plan is in TRG_CORE_TEST_REPORT.md §6.
- **Spell Battery's 30 ft measurement:** no tokens were placed. Measured distance is covered by `verify-audit-3697` F2.
