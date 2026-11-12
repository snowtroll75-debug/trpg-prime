# TRG Prime 3.682.3

3 November 2026. Graham's ruling of the same day on maneuver spells and the multiple attack penalty: "It should not ignore MAP". It includes 3.682.2 (`release-notes-3.682.2.md`, Battle Mage on a maneuver spell's check), so it can be installed over 3.682.1 or 3.682.2.

- **No migration, and no world data changes.**
- **Eldritch Arts 0.7.1 and Inner Tempest 1.0.4 run unchanged on it.**
- **Item casts (Graham, "leave as is"):** a Spellblade's attack spell read from a scroll or a wand still gets no Battle Mage.

## Changed

- **A maneuver spell's check takes the multiple attack penalty and counts toward it.**
  - **Which spells:** Tanglefoot, Spectral Grasp, Telekinetic Manoeuvre, and Tangling Creepers' vine (the cast's lash and each later one). Each check is a Spellcraft check made as a Grapple, Shove, Trip or Disarm.
  - **Before:** the check came in at its full bonus whatever had been attacked that turn, and the next Strike or spell attack ignored it.
  - **Now:** the check is treated as the attack action it performs (Graham's block-19 R1: "Any action which has the attack trait counts towards the multiple attack penalty including disarm, shove, spells etc.").
    - **The penalty:** it rolls at the penalty that action would, as a "Multiple attack penalty" row on the roll. The count is the one a Strike keeps.
    - **The count:** the check counts toward the next attack, hit or miss. Only in a started combat, as for every attack.
  - **Monstrous Grab and Knockdown:** their exemption is read as the Grapple and Trip actions read it.
  - **One cast against several creatures** (Tangling Creepers' area): every check rolls at the count as it stood before the first, and the count rises by one for each. This is the spell volley's rule ("you don't increase your multiple attack penalty until after your spell attacks have been resolved"), applied here.
  - **Never counted twice:** the cast itself is no spell attack (`spellIsManeuver`), so it never touches the count.
  - **Where:** the `maneuver` case of `applySpellEffects` (`magic/spell-effects.mjs`).

## Harness

- **`verify-ea-block4-core`:** 99 checks, up from 95 in 3.682.2. New: B9–B12. They check that the penalty is applied before the roll, only for an action with the Attack trait; the exemption; the count after the roll; and one count frozen for the cast, outside the loop over its creatures.
- **`mutate-ea-block4-core`:** 76 of 76 caught, up from 70. New: the ruling undone, the count never raised, the exemption ignored, each creature climbing the ladder, the penalty on any action, and each creature freezing its own count.
- **Version pins** moved to 3.682.3 in nineteen mutation files. `system.json`'s download names v3.682.3.
- **Full sweep** (the list `tools/verify.mjs` runs, 673 harnesses, in two shards on two copies checked identical to the source): **673 of 673 passed.** The review's tightening of B12 and its mutation came after; that pair was rerun on the source: 99 checks, 76 of 76 caught.
- **Eldritch Arts 0.7.1 on 3.682.3:** `verify-block1`–`4` green, and every block's mutations caught.

## Review (independent, before release)

- **Found correct.**
  - **The penalty:** the same value and count as the Grapple, Shove, Trip and Disarm actions.
  - **No double count** with the cast or the vine's button. Nothing is counted out of combat.
  - **A cancelled maneuver choice** leaves the count untouched.
  - **Monstrous Grab's key** matches.
- **Fixed from it:** B12 now fails if the frozen count is declared inside the loop over the creatures. A per-creature freeze would have made a second creature's check roll a step worse.
- **Noted, not changed:**
  - **A mount's shared penalty** (page 200) is still read only by Strikes. Basic actions and spell attacks don't use it either.
  - **The new checks read the source text, as the rest of this harness does.** Nothing rolls a −5 then a −10 in a test; the live test will.

## Packs

- Unchanged. The release ships the 3.676.1 pack files byte for byte.
