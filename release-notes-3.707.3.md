# TRG Prime 3.707.3: what the live test of 3.707.2 found

21 November 2026. Follows 3.707.2 (installed and live-tested by Testing Dude in the Test world), which it includes. Branch `fix/stone-shield-range`, from `fix/next-turn-end-clock` at `71126d7`. The report is `live-testing-report-3.707.2.md`.

The live test passed the shield itself, the GM's button, the earth/stone refusal, the one-foe refusal and both turn clocks. It found three defects.

## A. Stone Shield could not be cast against a foe (R-0018)

- **What happened:** taking the reaction cast nothing. The card read "Stone Shield — Not Cast: ZZ Orc is 5 ft away — beyond Stone Shield's range of self". A cast from the sheet with one foe targeted was refused the same way. Nothing was spent either time.
- **Why:** Stone Shield prints no range and no area. Graham's ruling of 8 September 2026 reads such a spell as affecting its caster, so the range gate measured the targeted foe against "self". The foe isn't affected by Stone Shield; it only names who the +4 and the shield are against. This predates 3.707.0: the spell could never be cast with its foe targeted.
- **Fix:** the range gate doesn't measure a ward's foe in a spell that prints neither a range nor an area and whose rows are all wards on the caster (`targetOnlyNamesWardFoe`).
  - Anticipations, a self ward with "Range 30 feet", is still measured.
  - A warp that gives the spell a range or an area brings the gate back.

## B. Seer's Vision's glimpse never lapsed (R-0019)

- **What happened:** cast on the ally in round 3, the glimpse was still waiting after the end of the wizard's round-4 turn.
- **Why:** the recorded d20 lives on a flag, not an effect, and carried no clock. "Until the end of your next turn" was never enforced: the glimpse lasted until it was spent, however long that took.
- **Fix:**
  - in an encounter, the record carries the cast's turn-end stamp (the caster and the turn of the cast);
  - the turn-end sweep drops it as the caster's next turn ends;
  - another spell's recorded roll (Embrace Destiny) is kept.
- **Out of an encounter:** unchanged, as there are no turns to count.

## C. The shield's damage card read "no target" (R-0020, cosmetic)

A blow that struck the shield posted "Club — Damage to Stone Shield" with the summary "5 Bludgeoning — no target". It now reads "5 Bludgeoning to Stone Shield (before its Hardness)". The shield's own card already gave what Hardness stopped.

No data change and no migration.

## Harness

- **New:** `verify-live-findings-3707-2` (11 checks) and `mutate-live-findings-3707-2` (8 mutations, all caught). It drives the glimpse through the sweep: it outlasts the cast's turn and the orc's, lapses as the caster's next turn ends, and another spell's record stays.
- **Version pins** raised to 3.707.3.

## Testing

- **Core verify:** all 396 verify scripts at the final commit, in a clean worktree. **All pass**, after two checks on lines this release changed were re-anchored:
  - `verify-fixes-3685-1` O3 (the range gate's condition);
  - `verify-fixes-3681-2` W3 (the damage card's summary).
- **Core mutation:** 261 scripts reading a changed file or carrying a pin, in their own worktree. **261 of 261 pass.** Two anchors (in `mutate-fixes-3685-1` and `mutate-fixes-3681-2`) were re-anchored and re-run.
- **Not run:** the two long whole-tree mutation scripts, as in 3.707.1.
- **Modules:** Pillars of Faith, Inner Tempest and Eldritch Arts give **identical results** on 3.707.3 and 3.706.1.
- **Live Foundry:** 3.707.2's results are in `live-testing-report-3.707.2.md`. 3.707.3 was installed by Graham and retested the same day (`live-testing-report-3.707.3.md`):
  - the reaction cast and a one-foe sheet cast of Stone Shield work, with a real near miss striking the shield;
  - Seer's Vision's glimpse lapses at the end of the caster's next turn;
  - the shield's card names the shield.

  All pass. The Test world was cleaned up afterwards.
