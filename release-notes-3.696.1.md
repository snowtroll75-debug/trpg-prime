# TRG Prime 3.696.1: fixes from the live test of 3.696.0

17 November 2026. Three fixes, all found by live-testing 3.696.0 with Pillars of Faith 0.12.4 in the TRG V14 world. The test used temporary actors on a temporary scene, which were deleted afterwards.

## A shield's maneuver uses shield proficiency (CD6)

- **Found.** An Ossuary Board Shove Attack was read as a heavy weapon. The card said "Non-proficient — Ossuary Board is a heavy weapon", −4. A shield's `category` ("heavy") went to the weapon proficiency rules.
- **Fixed.** `weaponManeuverModifiers` now asks the proficiency rules with the item's own type when it is a shield. So a shield is met by shield proficiency, and a creature trained with heavy shields takes no −4. A weapon is unchanged.

## A typed rider's line on the damage card names its type

- **Found.** Blood Awakened's essence rider was rolled and applied correctly (30 → 26 HP: 1 piercing and 3 essence). But the line under the weapon's own damage read "+1d6 secondary damage", as if it were added to the piercing.
- **Fixed.** A rider with a `damageType` now reads "+1d6 secondary damage (first damage this round) — essence, rolled as its own packet". An untyped rider reads as before.

## A critical rider's effect is named once

- **Found.** Final Sanction's card line read "Final Sanction: Final Sanction: −1 status to DB on …".
- **Fixed.** An effect whose name already begins with the rider's label drops the repeat.

## Confirmed working live (3.696.0)

- **CD1.** Each keep-better reroll was asked and spent correctly:
  - Continuity Unbroken, with advantage, kept 10 over 5;
  - Vowbound Resolve, on a skill check, kept 17 over 5;
  - Revelation in Crisis, which expended Revelatory Script;
  - Spirit Intercession for an ally 10 feet away (the ally's use spent, its reaction unchanged out of combat). It was not asked at 35 feet. "No" left the use.
- **CD2.** Blood Awakened's essence rider was rolled and applied. Hunter's Fangs laid Bleed 1 after the injury.
- **CD3.** Break the Evil Eye with its warp asked "choose up to 2", with checkboxes and "None of these". Each chosen effect got its own counteract check.
- **CD4.** Ossuary Lamellar, worn: 5 slashing → 4 taken, while 5 piercing → 5. Stowed: 5 slashing → 5.
- **CD5.** A 10-foot push was cut to 5 feet; a 5-foot push did not move the creature. The card named the reduction.
- **CD6.** With the board equipped, the Shove was made with it and the card named the shield's bash. Stowed, it was not used.
- **CD8.** Redundant Anatomy was asked after a critical injury. Yes read it one step lower and spent the daily use; once spent, it was not asked again.
- **CD12.** Judgement's rider carried `spells` and `spellClasses`. Final Sanction's −1 status to DB landed on a critical against the Subject.
- **Not tested live:**
  - Judgement on a Grimward spell (no Grimward caster was built for the test);
  - Expert Autopsist's Critical +4 (Perform Autopsy needs a corpse);
  - the CD9 hook.

## The harness

- **`verify-fixes-3696-0`:** 41 checks, including CD6d, L1 and L2 for these fixes.
- **`mutate-fixes-3696-0`:** 38 mutations, all caught.
- **Re-pointed:** `verify-drive-3616` C2 and its mutation, for the proficiency call's new shape.
- **Every verify file was re-run:** 0 failures.
- **Version pins:** 3.696.1.
