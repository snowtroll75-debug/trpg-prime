# TRG Prime 3.682.1

3 November 2026. Fixes the one system defect from the live test of 3.682.0 with Eldritch Arts 0.7.0 (Eldritch Arts' `LIVE_TESTING_REPORT_0.7.0.md`).

- **Install over 3.682.0.** No migration, and no world data changes.
- **Eldritch Arts 0.7.1 needs it.** 0.7.0 and Inner Tempest 1.0.4 run unchanged on it.

## Fixed

- **Battle Mage never applied to the core's attack spells.**
  - **Before:** 3.682.0's `spellAttackBaseRow` (`combat/attack-base.mjs`) looked for "Attack" only among a spell's traits. The core's spells carry the Attack trait as their category, `"attack"`, and none prints it among its traits. So a Spellblade's Orb of Force rolled with BSB and no BAB row (live: attack 15).
  - **Now:** a spell whose category is `"attack"` counts, as does one that prints the Attack trait. Nothing else about the seam changes: it is still the higher of BAB and BSB, as one row, never for an innate spell, a switched-off ability or a Strike's roll.

## Harness

- **`verify-ea-block4-core`:** 94 checks, up from 93. New: B6b, a spell whose category is "attack" takes the row.
- **`mutate-ea-block4-core`:** 68 of 68 caught, up from 67. New: the live defect, the category read no more. One mutation re-anchored to the moved line.
- **Version pins** moved to 3.682.1 in nineteen mutation files. `system.json`'s download names v3.682.1.
- **Full sweep** (the list `tools/verify.mjs` runs, 673 harnesses, in two shards on two copies checked identical to the source): **673 of 673 passed.**
- **Eldritch Arts 0.7.1 on 3.682.1:** `verify-block1`–`4` green, and every block's mutations caught.
- **An independent review** of the patch with Eldritch Arts 0.7.1 confirmed that a spell's category "attack" is the core's own test for a spell attack (`isAttack` in the cast, and `spellCountsTowardMAP`), and that no other caller gates on the trait alone. It raised two questions for Graham, neither changed: should Battle Mage cover a maneuver spell's Spellcraft check (Tanglefoot, Spectral Grasp, Telekinetic Manoeuvre), and Spiritual Weapon's strikes? Neither has the Attack trait.

## Packs

- Unchanged. The release ships the 3.676.1 pack files byte for byte.
