# TRG Prime spell regression report

## 3.716.0 (branch `fix/spell-metamagic-rulings`)

- **The spell matrix:** the baseline went from 4,112 cases to 8 (see TRG_PRIME_SPELL_REPAIR_LOG.md). `--compare` reports 0 regressions. The warp-only full sweep has 0 PP disagreements.
- **The project's full sweep:** every one of `tools/verify.mjs`'s 813 files was run, in three stretches, because it takes over three hours. Indices 0–195 ran before the last small edits, so every affected verify file and every touched mutation file was re-run after them, all green.
- **Found and fixed by the sweep:**
  - `mutate-ff30-block22`: a line I duplicated made its anchor ambiguous.
  - `verify-strike-riders` and `verify-thorns`: they anchored on the component-gate call.
  - `verify-rules-have-callers`: six helpers had been exported only for the harness. They are internal now, and are tested through `lingerOnEnd`, the Temporal option's `max`, and `stampCastPower`.
- **Already failing at 3.715.1, re-pinned:**
  - `mutate-thorns` W5 (its loop had gained `enhancementPackets`);
  - four schema anchors at 3.707.1 (`mutate-dedicated-rows`, `-defence-lists`, `-drive-3622`, `-focus-default`);
  - three pack-copy gate anchors (`mutate-audit-3698`, `-movement-trait-3700`, `-session-fixes-1022`).
- **Still structural, and pre-existing:** `verify-ea11-seams` has no `mutate-` file beside it, so the official sweep reports it UNPAIRED.
- **Companion modules:** their core seams (`foldModuleMetamagicMods`, lent metamagic, `offeredModuleMetamagic`) are unchanged. Their `-core` harnesses (`verify-ea-block*-core`, `verify-ea11-seams`) pass. A live module regression run comes with the live retest.

## 3.715.1 (the first matrix run)

26 November 2026, core 3.715.1, branch `test/spell-matrix`.

## This session

**No engine, pack or module file changed**, so no other spell, class or sourcebook module can have regressed. The additions are confined to:
- `tools/spell-matrix/`;
- the nine `TRG_PRIME_SPELL_*`, `TRG_PRIME_WARPING_*`, `TRG_PRIME_METAMAGIC_*` and `TRG_PRIME_GM_PLAYER_*` reports.

The project's `tools/verify.mjs` sweep was run on the clean tree for 15 minutes. **It did not finish:** my own time limit stopped it at `verify-checks-read-source`. Every check it reached passed, and every mutation file it reached caught all its mutations. A complete run is still owed, and it is moot until `module/` changes.

**Harness caveat, found while doing this.** A run of `npm run verify` that is killed part-way does two things:
- It leaves `module/combat/attack.mjs` mutated until its guard restores it on exit.
- It churns the LevelDB logs under `packs/` (131 files).

Both were restored to the committed state before anything else was done. Never kill that sweep mid-run on a tree you mean to commit.

## The baseline every later release is compared against

`tools/spell-matrix/data/baseline-failures.json` holds the id and reason of **every generated case that does not pass on 3.715.1**: 4,112 cases, all traced to RC1 (Temporal), RC3 (Distant), RC5 to RC8, U12, or review items.

On a new core build:

```
node tools/spell-matrix/generate.mjs          # cases from the new packs (1-2 s)
node tools/spell-matrix/verify.mjs --compare   # engine vs book, then vs the baseline
```

- **Exit 3** means at least one case now fails that did not; `data/regression-diff.json` names each one.
- **Cases that now pass** are listed as `fixed`. A repair release then runs `--update-baseline` on purpose.

Checked: removing one known failure from the baseline made `--compare` report exactly that case and exit 3. Restoring it reported 0.

A new spell, warp or feat in the packs produces new cases automatically, and their ids are stable (spell id, profile, picks), so nothing in the suite needs rebuilding.

## Owed after each repair (per the standing practice)

- The RC's own `verify-` / `mutate-` pair, the spell-matrix `--compare`, and the full `tools/verify.mjs` sweep.
- Live: the failing pilot case from both seats.
- Then the companion modules that read the touched code:
  - Eldritch Arts: module metamagic folds after the core's duration (`foldModuleMetamagicMods`), and Lent Metamagic;
  - Pillars of Faith;
  - Inner Tempest.
