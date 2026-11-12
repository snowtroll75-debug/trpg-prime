# TRG Prime 3.682.2

3 November 2026. One change, Graham's ruling of the same day on Battle Mage and the maneuver spells (Eldritch Arts Q53: "Yes it should").

- **Install over 3.682.1.** No migration, and no world data changes.
- **Eldritch Arts 0.7.1 and Inner Tempest 1.0.4 run unchanged on it.**

## Changed

- **Battle Mage covers a maneuver spell's check.**
  - **Which spells:** Tanglefoot, Spectral Grasp, Telekinetic Manoeuvre, and Tangling Creepers' vine (the cast's lash and each later one). Each uses a Spellcraft check as a grapple, shove, trip or disarm. By Graham's August ruling, that check is the spell's attack.
  - **Before:** Battle Mage moved only a spell attack roll. A maneuver spell rolls none, so its check kept the BSB.
  - **Now:** the check takes Battle Mage's row, BAB less BSB, when the BAB is the higher. It is the same row as on a spell attack, and is said on the roll. It applies to an innate maneuver spell too, as its Spellcraft holds the BSB all the same.
  - **Where:** the `maneuver` case of `applySpellEffects` (`magic/spell-effects.mjs`), through `spellAttackBaseRow`.
- **Not changed (Q54, "Leave as is"):** Spiritual Weapon's strikes. It is a utility spell with no Attack trait.

## Harness

- **`verify-ea-block4-core`:** 95 checks, up from 94. New: B8, the maneuver check takes the row before it is rolled, asking no trait.
- **`mutate-ea-block4-core`:** 70 of 70 caught, up from 68. New: the row dropped, and the row made to ask for the spell's trait.
- **Version pins** moved to 3.682.2 in nineteen mutation files. `system.json`'s download names v3.682.2.
- **Full sweep** (the list `tools/verify.mjs` runs, 673 harnesses, in two shards on two copies checked identical to the source): **673 of 673 passed.**
- **Eldritch Arts 0.7.1 on 3.682.2:** `verify-block1`–`4` green, and every block's mutations caught.

## Review (independent, before release)

- **The change:** found correct.
  - The Spellcraft check holds exactly the BSB that `bsbTotal` counts, so the swap is right, for an innate cast, a scroll and the vine's stub spell alike.
  - The casting check of a maneuver spell never takes the row as well, since it is not a spell attack.
  - Spiritual Weapon's strikes don't reach it.
- **Two older points, for Graham, not changed:**
  - **A Spellblade's attack spell read from a scroll or wand gets no Battle Mage.** Its attack is the release check, and the gate that skips innate spells also skips item casts. Should it? The answer turns on whether the release check holds the reader's BSB.
  - **A maneuver spell's check takes no multiple attack penalty and doesn't count toward it,** though your block-19 R1 says spells and maneuvers count. Possibly a gap, unchanged here.

## Packs

- Unchanged. The release ships the 3.676.1 pack files byte for byte.
