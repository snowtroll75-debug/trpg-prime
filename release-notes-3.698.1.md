# TRG Prime 3.698.1 — Flame Blade's blade

18 November 2026. Follows 3.698.0 the same day. Merged to `main` with Graham's approval, together with 3.697.0 and 3.698.0.

## What changed

**Flame Blade** (Graham: "Flame Blade is fire"). "You wield this blade-like beam as if it were a scimitar using your Spellcraft bonus at -2 for your AB and inflicting fire criticals."

- Casting puts a **Scimitar** (the pack's: 1d6, Keen, Sweep) in the caster's inventory, marked as conjured by the spell. The spell doesn't ask which weapon, because a Scimitar is the only one it can make. (Corrected after the live test: the item keeps the name Scimitar, as Eldritch Weapon's blade keeps its weapon's name.)
- It deals **fire**, so a critical rolls on the fire table.
- Its attack card shows one row, "Spellcraft N −2 in place of attack bonus M", in place of the caster's attack bonus and any Finesse or declared-ability swap. The multiple attack penalty, circumstance bonuses, conditions and the like still apply.
- It goes when the spell's minute ends.

## Under the hood

- `conjuredWeapon` rows can name their weapon (`weapons`) and roll on Spellcraft (`attackBase: "spellcraft"`, `attackAdjust`).
- `spellcraftAttackRow` in `module/combat/attack-base.mjs`, called from the strike in `attack-workflow.mjs`.
- The shaping dialog names the spell's own damage type.
- Pack: Flame Blade's `effects`, declared in `tools/data-fixes.json` and `module/data/pack-repairs.mjs`.
- Migration re-gated to 3.698.1, so owned copies get the blade (copies a GM has edited are left alone).

## Tests

See TRG_CORE_TEST_REPORT.md §7.

## Still open

Whether "as if it were a scimitar" waives proficiency (TRG_CORE_UNRESOLVED.md, U12).
