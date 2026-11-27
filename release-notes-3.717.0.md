# TRG Prime 3.717.0: The metamagic that chooses who is affected

27 November 2026. Branch `fix/spell-metamagic-rulings`, on top of 3.716.1.

- **Install over 3.716.1.**
- **Migration:** the world migrates once, re-gated to 3.717.0. Owned copies of Geas, Pass Without Trace and Unshakable take the new warps; a house-ruled copy is left alone.
- **Modules:** nothing new is needed.

## Graham's answers of 27 November

- **Built here:**
  - **O4 Selective, Split, Aligned and Imposing Will:** "Should be automated."
  - **O5 Geas and Pass Without Trace:** "Need building."
  - **O6 Unshakable's "(arcane only)":** "Needs checking."
- **Confirmed as built, nothing to change:**
  - **O1:** Temporal Extension's step from Hours is 12 hours ("my example should have been 12 hours for the second step not 2").
  - **O2:** counts are carried up the ladder.
  - **O3:** damage metamagic beside a damage warp is allowed.
  - **O7:** Extend works on "until", "varies" and "see text" durations.
  - **O8:** Healer's Grace's "(max +4)" is four purchases.

## The four metamagic feats (O4)

Until now each one charged its PP and printed a note for the table. Each now decides who the cast affects.

### Aligned Spell

*"You can cause your spell to only affect targets with either the chaos, evil, good, or order alignment traits chosen at the time of casting. You can warp the spell by a further PP to affect a second trait."* Divine casters only, as before.

- **The Warp dialog** offers a list: each of the four traits on its own (+1 PP), or any two of them (+2 PP).
- **A targeted spell** passes by every target carrying none of the chosen traits, and the card names them. If nobody is left, the cast is refused before anything is spent, as the kind gate does.
- **An area spell** keeps only the creatures in the template carrying a chosen trait.

### Imposing Will

*"When casting a spell with the mental trait, you may warp the spell to affect creatures that would normally be immune, at a PP cost by creature type."*

- **The effect:** a creature of the chosen type that is immune to a mental, emotion or fear spell (a Mindless undead, say) is now affected, and the card says so. Another creature type, or an immunity to some other trait, is not overcome.
- **The order of checks has changed:** when the caster owns the feat and the spell is mental, the targeted immunity check now waits until after the Warp dialog. Before, an immune target was refused before the feat could be bought.

### Selective Spell

*"Choose several targets in the area equal to the additional PP expended. These targets are excluded."*

- **The choice:** after the template has caught its creatures, a dialog lists them. The caster ticks up to the number bought, and the card names who was excluded.
- **Ticking too many** asks again rather than dropping some silently.
- **"Exclude nobody"**, or closing the dialog, lets the spell land on everyone it caught. Nothing is refunded: the PP bought the choice, and Missile Storm's refund-on-Cancel does not apply here.

### Split Spell

*"Your Spell Attack check is compared to the DB of multiple targets … The damage die … is reduced by one step per additional target (d8 becomes d6 for one additional target or d4 two additional targets etc). This counts as one attack for your multiple attack penalty."*

- **Targets:** the number of creatures the spell may target rises by the extra targets bought.
- **The attack:** the first creature targeted is attacked as usual. Each of the others, up to the number bought, is compared with the same check, at the multiple attack penalty from before the cast.
- **Damage:** every target takes damage at the stepped-down die. A d4 stays a d4, because the book names no smaller step.
- **The card:** it names the extra targets, says this was one attack for the multiple attack penalty, and says if any paid-for targets went unused.
- **Other effects:** 27 of the 30 core attack spells with damage deal damage only.
  - Acid Bolt's and Orb Of Acid's splash is added to each target the roll hits, because the same attack routine resolves every target.
  - Energy Bolt's chosen damage type applies to every target.
  - Any other effect of an attack spell still reaches only the first target.

## The warps (O5, O6)

- **Geas:**
  - all three warps now make the unwilling creature roll its **Will save to negate**, on the cast, against the cast's DC;
  - the second warp sets the duration to **1 year**, and the third to **unlimited**, on the clock;
  - Extend or Temporal Extension beside the second or third warp is refused (U8).
- **Pass Without Trace:**
  - its +4 PP warp is now a **20-foot emanation, within 20 feet, of up to 10 creatures of your choice**. The caster ticks them from those it caught, Missile Storm's way;
  - Distant Spell beside that warp is refused (U8).
- **Unshakable:**
  - its touch warp is **arcane only**. It is judged on the caster's own tradition, not the spell's list, which also includes ethereal;
  - a caster outside arcane who chooses it gets "Not Cast … Nothing was spent".

## Found on the way: the caster's tradition, not the spell's

The 3.716.0 retest's case 7 charged an **arcane** Wizard the Ethereal +6 for Distant Spell. The feat says *"Be aware that Ethereal Casters can use this option for PP +6"*: the extra is for an ethereal *caster*. The engine read the spell's list instead, and Mage Armour lists "arcane, ethereal". Aligned Spell's *"Requirement Divine Caster only"* had the same fault: a Wizard casting a spell that lists divinity would have been offered it.

- **Now:** both read the caster's own tradition (`system.magic.tradition`). An arcane caster pays +4 for Distant, an ethereal one +6, and only a divine caster is offered Aligned.
- **Correction:** the 3.716.0 report recorded case 7's 10 PP as matching the book. It did not, because Distant should have cost 4 there, not 6.

## For developers

- **New files:**
  - `module/magic/metamagic-targets.mjs` (the pure rules);
  - `module/magic/selective-spell-workflow.mjs` (Selective's dialog).
- **`metamagic.mjs`:**
  - Aligned Spell is a select (`select: "aligned"`);
  - Imposing Will gains `select: "imposingWill"`;
  - Selective and Split gain kinds;
  - the aggregate carries `splitExtra`, `selectiveCount`, `alignedTraits` and `imposingType`.
- **`spell-trait-immunity.mjs`:** `partitionTraitImmune(…, { imposes })` returns `imposed`.
- **`spell-warp.mjs`:** two new warp mods, `defence` (a save the warp adds) and `onlyTradition`, both aggregated and merged.
- **`tradition-gate.mjs`:** `warpTraditionRefusals`.
- **The caster's tradition:** `buildMetamagicOptions` takes `casterTradition`, which the cast and the catalogue pass in; Aligned and Distant read it. A caller that passes nothing falls back to `tradition`.
- **`cast-workflow.mjs`:**
  - the deferred immunity check;
  - a new check after the Warp dialog for Imposing Will and Aligned (targeted spells);
  - Split's raised target count;
  - the area's Imposing Will, Aligned and Selective steps;
  - Split's extra attacks;
  - the warp's save (`warpDefenceOf`);
  - the tradition refusal beside U8's.
- **Pack and migration:**
  - `packs/spells` was edited by `tools/declare-spell-matrix-fixes.mjs`. Three new `PACK_REPAIRS` entries; Unshakable's entry was amended with `alsoFrom`.
  - The pack-copy migration is re-gated, and `TRG_SCHEMA_VERSION` is 3.717.0.
- **Harness:**
  - **new:** `verify-metamagic-targets` (67 checks) and `mutate-metamagic-targets` (47 mutations, all caught).
  - **updated checks:** `verify-drive-3622`, `verify-ff30-block15`, `verify-block34`, `verify-block9a-core`, `verify-chapter9-231-240` and `verify-spell-metamagic-rulings`;
  - **re-pinned anchors:** six mutate files;
  - **spell matrix:** the rules model follows O8 and reads "lasts up to" its own duration as no change. The baseline is now 1 (Sonic Bolt, an error in the model, not the engine).
