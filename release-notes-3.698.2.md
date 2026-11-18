# TRG Prime 3.698.2 — the caster is always proficient with Flame Blade

18 November 2026. Follows 3.698.1.

## What changed

Graham: "Flame blade does not need martial proficiency. The caster is always proficient."

- The blade Flame Blade conjures is marked as its caster's own (`flags.trg-prime.casterProficient`). `proficiencyOf` reads the mark, so the attack takes no "Non-proficient" −4, and the extra fumble risk for an unfamiliar weapon doesn't apply either. The sheet's proficiency warning is silent too.
- The mark only comes from the spell. The same Scimitar bought in a shop is judged on the wielder's proficiencies, and so is Eldritch Weapon's blade.

## Data and migration

- Flame Blade's `effects` row gains `casterProficient: true` (`tools/data-fixes.json`, `audit3698-flame-blade-proficient`).
- The owned-copy repair `audit3698-flame-blade-effects` now ends at the marked row. It lists 3.698.1's row as `alsoFrom`, so a world that already ran 3.698.1 updates its copies too. Copies a GM has edited are left alone.
- Migration re-gated to 3.698.2.

## Tests

See TRG_CORE_TEST_REPORT.md §8.
