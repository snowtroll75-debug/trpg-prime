# TRG Prime 3.713.0: two seams for the Artificer (Eldritch Arts 0.18.0)

25 November 2026. Branch `feature/ea-block11-seams`, on top of 3.712.4 (`fix/core-spellbook-rename`). **Not published, merged or installed** — prepared for Graham's approval.

- **Why the Core changes.** Eldritch Arts' Feat Additions modify one weapon for a day (Modular Design, Overclocked Weaponry) and a Create project's time (Tinkerer Precision). Nothing in the Core could scope a bonus to one weapon:
  - a weapon's `attackBonus` is authored data, summed with its potency in `item.mjs`;
  - an actor effect reaches every attack;
  - a conditional has no weapon axis;
  - the spell-rune write-back would make an upgrade a priced, counted, magical rune.

  Create's ranks and completion value are local to `applyDegree`. See Eldritch Arts' `docs/ELDRITCH_ARTS_BLOCK11_AUDIT.md` §4.
- **Nothing changes for a game that registers nothing.** Both seams are empty unless a module registers into them. The verify file checks the empty case.
- **Install over 3.712.4.** No migration and no world data changes.
  - Eldritch Arts 0.18.0 is verified on it.
  - Inner Tempest and Pillars of Faith run unchanged on it: each of their verify harnesses gives the same result on 3.712.4 and 3.713.0.

## C-EA11-1 — `registerWeaponEnhancement(key, fn)`

- **What a module answers.** `fn(weapon, actor)` → null, or `{ label, attack, attackType, damage, damageType, packets: [{dice, type}], reloadReduction }` (or a list). Pure summary in `module/weapon-enhancements.mjs`.
- **Read at four places:**
  - **Attack rows** (`weaponManeuverModifiers` and the Strike): typed `item` by default, so the check's own stacking keeps the higher of it and the weapon's item bonus.
  - **Damage:** an `item` bonus adds only what it beats the strike's other item damage by (quality, potency, the round, a coat — R3's rule); an `untyped` one adds in full.
  - **Secondary packets:** resolved as a Flaming rune's, after the unguents'.
  - **Reload:** Load less the reduction, after Quick Reload, never below 0.
- A provider that throws costs its own answer only.

## C-EA11-2 — `registerCraftingWorkModifier(key, fn)`

- **What a module answers.** `fn({ actor, featNames, project, ranks })` → null or `{ label, ranks, valueFactor }`, summed by `craftingTimeModifiers` in `crafting-feats.mjs`. Every `ranks` is added; the lowest factor in (0, 1] applies, once.
- **Time only.** A day's work is priced at the extra ranks. The project completes at `timeValue` (`itemValue` × the factor, rounded up).
  - The check, its DC, the ranks recorded for it and `itemValue` (what the materials cost) are untouched.
  - The project card says what was read and that the materials still cost the full value.

## Harness

- **`verify-ea11-seams`** (new): 26 checks.
- **`verify-chapter6-gear-161-170` B2e** now accepts the enhancement packets after the unguents'. Its 66 mutations are still all caught.
- **Version pins:** re-pinned to 3.713.0.
- **Sweep:**
  - `verify-no-undefined-names`: OK, 841 files.
  - `verify-rules-have-callers`: OK, backlog unchanged.
  - The first ~100 sweep scripts: all green.
  - Then every verify/mutate pair that reads the changed files, 21 pairs: all green.
- **The full 804-file sweep was not run to completion in this session.** Run `node tools/regression-suite.mjs` before release.
