# TRG Prime 3.717.1: Three things the 3.717.0 live test found

27 November 2026. Branch `fix/spell-metamagic-rulings`, on top of 3.717.0.

- **Install over 3.717.0.**
- **Migration:** the world migrates once more (schema 3.717.1). Owned copies of Unshakable lose a stale note, and a house-ruled copy is left alone.

The 3.717.0 live test ran 16 cases from the GM's and the Player's seats at once, and all passed (`live-testing-report-3.717.0.md`). Three of them found a defect:

- **Split Spell's critical dice are stepped too.** A split Acid Bolt that crit dealt "4d4 + 2d6 critical": the hit's die was stepped, and the critical's was not. The book steps "the damage die of the spell attack", and a spell's critical dice are its Base Damage entry's, so they now step with the hit: 2d6 becomes 2d4.
- **Unshakable's stale note is gone.** "The +4 PP option (range touch, arcane only) is cast by hand on another creature" was still printed on every cast, although that warp has been automated since 3.716.0. It has been removed from the pack, and from characters' existing copies by the migration.
- **Imposing Will's line ends with one full stop.** It read "…immunity to the mental trait..".

## Still a question

**Q1:** should the caster be ticked by default in the "choose who in the area" dialog for a beneficial area spell, such as Pass Without Trace's area warp? Today it follows Missile Storm's default, which leaves the caster out, and the caster can tick themselves.

## For developers

- **`cast-workflow.mjs`:** `resolveSpellAttack(…, { dieSteps })` steps the critical's formula, and both of Split's calls pass `dieSteps: splitBought`.
- **`metamagic-targets.mjs`:** `imposingWillLine` returns no full stop; the area's line adds its own.
- **The pack:** `packs/spells` Unshakable's `effects` were rewritten by `tools/declare-spell-matrix-fixes.mjs` (`SYSTEM_FIXES`). `PACK_REPAIRS` `unshakable-effects-3609` was amended with `alsoFrom`, and `tools/block33-plan.mjs` matches it.
- **Migration:** the pack-copy pass is re-gated to 3.717.1, and so is `TRG_SCHEMA_VERSION`.
- **Harness:**
  - `verify-metamagic-targets`: 72 checks (new: W17, W18, I9, T6, R4).
  - `mutate-metamagic-targets`: 51 mutations, all caught.
  - **Re-anchored to the new code:** `verify-chapter9-241-250` R11, and anchors in `mutate-chapter9-241-250` and `mutate-damage-type-choice`.
  - **Version re-pins:** the schema and pack-copy anchors in seven mutate files.
