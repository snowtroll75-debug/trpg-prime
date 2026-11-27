# TRG Prime 3.718.1: Cure's surge, Size Alteration's weapons, and Darkvision on yourself

27 November 2026. Branch `fix/spell-core-sweep`, on top of 3.718.0.

- **Install over 3.718.0.**
- **Migration:** the world migrates once more (schema 3.718.1). Owned copies of Size Alteration are brought up to date, and a house-ruled copy is left alone.

## The two spells Graham named

- **Cure's 3 AP option now heals everyone in the radius.** The book says: "A surge of restorative energy spreads outward in a 30-foot radius, healing all creatures within its range." Choosing 3 AP used to open the target picker and refuse a second creature ("Cure targets 1 creature or object; 2 were chosen").
  - **Cause:** the option names its area, but the picker, the target count and every "is this an area?" test read the spell's own fields. Those fields describe the 1 AP form: "1 willing creature" and no area.
  - **Now:** an AP option that names an area replaces the printed target line. The radius is placed around the caster and heals every creature it catches, friend or foe.
  - **Also fixed:** Inflict's 3 AP option had the same fault and is fixed by the same change. Death's Defiance, whose options name their own count, is unchanged.
- **Size Alteration now grows the target's weapons.** Per Graham, the target's weapons rise one die step for each size step; the book says "Its equipment grows with it".
  - **The die:** a weapon Strike's base dice move by the same number of steps as the size change. For example, a Short Sword goes from 1d6 to 1d8.
  - **Warps:** the +6 PP option moves the die two steps, and the reduce option moves it down.
  - **The ladder:** the dice follow the size ladder that monsters' natural attacks already use, so 1d4 becomes 1d5 and 1d12 becomes 1d16.
  - **What stays the same:** unarmed and natural attacks do not change, because they are not equipment. The card says the die has moved.

## Found in the 3.718.0 re-check

- **Darkvision and Nightvision cast on yourself now grant the ability.** They used to say "…already has Darkvision — Darkvision adds nothing". The spell on the caster's own sheet has the same name as the ability, and was counted as having it. Spells are no longer counted.

## The 3.718.0 re-check from the player's seat

All the spells 3.718.0 fixed were cast again by PC Tester at creatures the player does not own, with the GM connected. **No permission errors remained.**

- **Charms:** Alluring Caress and Charm Undead read "now helpful toward you (was indifferent)", and the attitude was written on the GM's creature.
- **Conjured items:** Bless Water gave the Ally Holy Water, and Power Crystal gave the Ally a crystal.
- **Records on the target:** each was written on the foe, as these show:
  - Disorient's and Doubt's owed penalties;
  - the temporary immunities from False Arrogance, Warp Mind, Word Of Blinding and Word Of Stunning;
  - Flame Prison's and Force Prison's cages;
  - Cutting Words', Spell Drain's and Serenity's records.
- **Granted Speeds:** Fly, Earth Glide and Spider Climb each granted the Ally its Speed.
- **Difficult terrain:** each of the nine spells' Regions has its movement behaviour.
- **Conditions and moves:** Petrification's slowed, Speed's quickened, Stasis, and Startle's push all landed.
- **Walls:** Wall Of Stone, Force, Ice and Thorns each drew a blocking Wall segment.
- **Conjuration Shield:** no saves were rolled on casting, and its card gives the conjurer's save.

## Still a question

- **Q2:** automate False Health's multiplier warp?
- **Q4:** a player casting a **Secret** spell (Doubt, for example) waits for the **GM** to answer the conviction prompt. The casting check is rolled blind, so the prompt is whispered to the GM only. The GM's answer reaches the player's cast, and the spell then resolves normally. Is that how you want Secret spells to work, or should the player be offered conviction without seeing the total?

## For developers

- **`cast-workflow.mjs`:** `castShape` lays the AP option over the spell (`range`, `area`, and `targets`, the last emptied when the option names an area). The four `spellNeedsTarget` gates, every `isAreaSpell` test, the picker's text and the target cap now read it.
- **`size-step.mjs`:** `EQUIPMENT_SIZE_FLAG` and `equipmentSizeSteps(actor)`.
- **`spell-effects.mjs`:** a `sizeStep` row with `equipmentGrows` stamps the signed steps on its effect.
- **`attack-workflow.mjs`:** `strikeBase` steps a weapon's base dice with `steppedCreatureDamage`, for weapon items only, never unarmed or natural attacks.
- **`granted-ability.mjs`:** `alreadyHasAbility` ignores items of type `spell`.
- **The pack:** in `packs/spells`, Size Alteration's row gains `equipmentGrows: true` (`declare-spell-matrix-fixes.mjs`). `size-alteration-effects-3608` was amended with `alsoFrom` (since 3.718.1), and `tools/block32c-plan.mjs` matches it.
- **Migration:** the pack-copy pass and `TRG_SCHEMA_VERSION` are re-gated to 3.718.1.
- **Harness:**
  - New `verify-fixes-3718-1`: 22 checks.
  - New `mutate-fixes-3718-1`: 10 mutations, all caught.
  - **Re-anchored to `castShape`, `strikeBase` and the spell-type check:** 14 verify files and their mutate anchors.
  - **Version re-pins:** across `tools/`.
