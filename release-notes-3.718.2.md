# TRG Prime 3.718.2: False Health's multiplier warp

27 November 2026. Branch `fix/spell-core-sweep`, on top of 3.718.1.

- **Install over 3.718.1.**
- **Migration:** the world migrates once more (schema 3.718.2). Owned copies of False Health get the working warp, and a house-ruled copy is left alone.

## Graham's answers

- **Q2: False Health's warp now raises the multiplier.** The warp reads "+2 PP: increase the ability score multiplier by x1 (max x5)", and you said "it should increase the multiplier by 1 each time".
  - **Before:** the warp was charged and changed nothing.
  - **Now:** it is a count box, and you can buy it up to three times, which takes the printed ×2 up to ×5.
  - **Cost:** each purchase costs 2 PP.
  - **What changes:** each purchase adds one to the multiplier in "temporary HP equal to your spellcasting ability score ×N".
- **Q4: Secret spells stay as they are.** A player's Secret spell waits for the GM to answer its conviction prompt, and that is fine.

## 3.718.1, live (installed, from the player's seat with the GM connected)

- **Cure, 3 AP:** no target picker appeared.
  - The 30-foot radius caught the eight creatures inside it, friend and foe, and healed each of them. The two creatures outside it were not touched.
  - Cure at 1 AP still refuses two targets.
- **Size Alteration:**
  - **One step:** the Ranger became Large, and its Short Sword struck for 7d8 + 1, where it was d6 before. The card says "Its weapons' damage die rises by 1 step with it."
  - **The +6 PP warp:** the Ranger became Huge, and its weapons rose 2 steps.
- **Darkvision and Nightvision on yourself:** each now grants its ability ("ZZ SW Wizard gains Darkvision (1 hour)").

## Also fixed: the migration report named abilities as house-ruled spells

The 3.718.1 migration listed "Kharon — Nightvision: effects … left alone". Kharon carries the Nightvision *ability*, and the spell's repair was being checked against it.

Nothing was changed on Kharon, but the report would have sent you looking for an edit nobody made. A repair to the spells compendium is now checked only against spells.

## For developers

- **`spell-warp.mjs`:**
  - New mod `abilityMultiplierBump`, which is additive across purchases.
  - It is paired with `abilityMultiplierMax` and `abilityMultiplierFrom`, which are states; `warpMaxTimes` counts purchases from them.
  - New `multipliedAbilityFormula(formula, bump)` raises `@castingAbility * N`.
- **`spell-effects.mjs`:** the `tempHP` row reads the raised multiplier.
- **`pack-repair.mjs`:** `repairsForName(manifest, name, itemType)` keeps a spells-pack repair to items of type `spell`. The migration passes the item's type.
- **The pack:** in `packs/spells`, False Health's warp 0 carries the three mods (`declare-spell-matrix-fixes.mjs`). New repair: `false-health-warps-3718-2`.
- **Migration:** the pack-copy pass and `TRG_SCHEMA_VERSION` are re-gated to 3.718.2.
- **Harness:**
  - New `verify-fixes-3718-2`: 16 checks.
  - New `mutate-fixes-3718-2`: 6 mutations, all caught.
  - **Recounted:** `verify-warp-repeats` P2b (63) and P2c (457).
  - **Version re-pins:** across `tools/`.
