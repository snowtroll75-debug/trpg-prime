# TRG Prime 3.682.3 — Live Testing Report

3 November 2026. This covers Battle Mage on a maneuver spell's check (Q53, from 3.682.2) and the multiple attack penalty on that check (Q56, 3.682.3). The test ran after Graham installed 3.682.3, with Eldritch Arts 0.7.1, in Foundry V14, world "TRG V14", as Gamemaster in Chrome.

**Throwaway material, all deleted afterwards:**
- **The scene** "ZZ EA MAP 3.682.3".
- **"ZZ EA Spellblade":** 5th level (BAB 5, BSB 2), Path of the Arcane Duellist, with the core's Tanglefoot and a Broadsword.
- **"ZZ EA Target" and "ZZ EA Target Two".**
- **A combat of the three, on the test scene.** It was started at round 1 and left inactive, so Graham's running combat stayed the active one throughout. The penalty's counter reads any started combat.

**What was changed, and put back:**
- **None of Graham's actors was touched.** His combat (five combatants, round 1, active) was untouched.
- **Dice:** `CONFIG.Dice.randomUniform` was set at 0.3 (a 14) for the tests, then restored.
- **Removed:** the test combat, the chat cards, the scene and the actors. The Conviction hook came off.
- **The view** went back to Oldwatch Approach.

## Results

| # | Test | Result |
|---|---|---|
| 1 | Tanglefoot outside a combat: Battle Mage | **Pass.** The grapple check's rows: Spellcraft +2, Tanglefoot −4, "BAB 5 in place of BSB 2" +3. Total 15 against DC 10, a Success. No multiple attack penalty and no count, outside a combat. |
| 2 | In the combat, the first Tanglefoot | **Pass.** It rolled the same rows with no penalty (the first attack). The count went to 1. |
| 3 | The second Tanglefoot, on the other creature | **Pass.** "Multiple attack penalty −5" appeared on the roll, next to Battle Mage's +3. Total 10 against DC 10. The count went to 2. |
| 4 | A Broadsword Strike after them | **Pass.** "Multiple Attack Penalty (attack 3) −10": the Strike read the count the spells had raised. The count went to 3. Arcane Echo's +1 also rode on it. |
| 5 | A third Tanglefoot after the Strike | **Pass.** It rolled at −10, a Failure (5 against DC 10). The count went to 4. The spells and the Strike share one ladder. |

**Not tested live:**
- **One cast against several creatures** (Tangling Creepers' area: one count for all of them).
- **Monstrous Grab's exemption.**

The harness covers both: `verify-ea-block4-core` B9–B12 and their mutations.

**Console:**
- **No error from TRG Prime or Eldritch Arts.**
- **One Foundry exception,** in its own combat tracker ("Cannot use 'in' operator to search for 'turn' in undefined"). It came at 21:27:59, early in the session; the page had just been reloaded and logged in. Which of those it came from wasn't pinned down, and its stack is Foundry's own code throughout. Nothing in the test depended on it.

No findings.
