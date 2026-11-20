# TRG Prime 3.704.1: Lunge is −1 only

20 November 2026. Follows 3.704.0. Branch `fix/feat-lunge`.

## The ruling

**Graham, 20 November 2026:** "-1 only for lunge."

This settles reading L1 from 3.704.0. A Lunge's only penalty is its own −1 circumstance. The Strike gains the Reach trait's extra 5 ft, but not the trait's −2 at that distance. Graham is amending the feat's wording in the rulebook to match.

## What changed

- **Lunge:** a Lunge at 10 ft is now −1, not −3. The Reach trait's −2 is never applied to a Lunge Strike (`lungeStrikeTerms` always sets `waiveReachPenalty`). Its card reads "-1 circumstance on this Strike, and no other penalty".
- **Lunging Stance:** removes the −1, so a Lunge in the stance has no penalty at all, as before. Its card and note now name only the −1.
- **Other reach weapons:** a glaive or any other reach weapon still takes its −2 at the extended distance. Only a Lunge waives it.

## Data and migration

- **Pack:** two new declared fixes (`lunge-note-3704-1`, `lunging-stance-note-3704-1`) take the two note effects from their 3.704.0 wording, which mentioned the −2, to the new wording.
  - The 3.704.0 rows are retired as `supersededBy` the new ones, so they don't report as refused.
  - `apply-data-fixes` now honours `supersededBy` on an effect edit. Before, it did so only on a plain field fix.
- **Owned copies:**
  - A copy still at the 3.703.1 wording goes straight to the new one.
  - A copy at the 3.704.0 wording, like those in your Test world after its migration, is repaired by two new `EFFECT_REPAIRS` rows.
  - Old values are matched, so a GM's own edit is kept.
- **Migration:** the owned-effect pass is re-gated to 3.704.1, and the schema is stamped 3.704.1. A world at 3.704.0 is offered the migration once.
- **Compendium descriptions:** the feat texts themselves are not changed here. They still read "This action gains the reach trait for that Strike". When your amended wording is ready, the compendium descriptions can follow it.

## Harness

- `verify-lunge-3704`: 70 checks. E3 now requires the waiver on every Lunge. H covers both note chains, the retirement, and the tool's `supersededBy` branch.
- `mutate-lunge-3704`: 24 mutations. One puts back 3.704.0's −2; one leaves a 3.704.0 owned copy unrepaired.
- Version pins, the schema anchors and the effect-pass gate anchors raised to 3.704.1.

## Testing

- **Re-run:** every core script affected by this change, 415 in all. That covers:
  - every verify/mutate pair reading the migration, the action-feat files, `feats-workflow`, `attack-workflow`, the pack repairs or the data-fix tool;
  - every file carrying a 3.704.1 pin;
  - `mutate-fixes-3685-3b` (56 min);
  - `verify-checks-read-source` (12.5 min).
- **Result:** 415 of 415 pass. `verify-no-undefined-names`, `verify-rules-have-callers` (backlog unchanged at 505) and `verify-checks-can-fail` also pass.
- **Not re-run:** the other core scripts. They passed on 3.704.0, and this change doesn't touch what they read.
- **Not re-run:** the module suites. The change is confined to Lunge's own terms and its notes, and the module comparison on 3.704.0 was identical to 3.703.1.
- **Pack:** a record diff against 3.703.1 shows exactly the two note effects changed (`description` only), with every ID unchanged. The other 30 packs are byte-identical. A `specific-weapons` shadow folder, created by a test opening a pack that doesn't exist, was removed again.
- **Live Foundry:** not yet run for 3.704.1. What to check: a Lunge at 10 ft shows only "Lunge (-1)" (no Reach row); in Lunging Stance, no rows; a glaive Strike at 10 ft still shows Reach −2; the migration updates the 3.704.0 notes on an owned Lunge.
