# TRG Prime 3.699.0 — rulings from the joint Codex / Fiends & Fables audit

18 November 2026. Follows 3.698.4. Branch `release/3.699.0`.

Graham's rulings of 18 November on the joint TRG Prime Codex / Fiends & Fables Prime audit, the two core changes he approved, and his ruling on mindless creatures.

## Mindless creatures and the ability collapse

Graham: "If a creature gains the mindless trait, this may immobilise them based upon the mental penalties. Creatures with the mindless trait should be immune to this."

- **All three mental scores.** A mindless creature is no longer collapsed by Intelligence, Wisdom or Charisma at −5. Before, only Intelligence and Charisma were excused, which are the two the Mindless penalty lowers. Strength, Dexterity and Constitution still collapse it as before.
- **The Mindless ethic counts for this rule.** Published stat blocks write mindlessness as "Ethics Mindless", and many carry no Mindless trait. The Fiends & Fables Skeleton Warrior and Skeleton Champion print INT −5 and CHA −5, and were knocked unconscious the first time anything re-checked them. The ethic does not bring the trait's −5 penalty or its Mental immunity; only the collapse rule reads it.
- **Gaining Mindless takes effect at once.** Adding the trait to a creature's traits, or setting its ethic to Mindless, now re-runs the collapse rule. Before, a creature already knocked out stayed unconscious until something else changed.

## RD-03: Swim and Climb speed (+4 only when actually swimming or climbing)

The +4 circumstance bonus is no longer added to the whole Athletics or Climbing skill. It is an automatic row on a check made with the **Swim** action (Athletics) or the **Climb** action (Climbing). Sheet totals now match the printed stat blocks; 46 Fiends & Fables creatures had shown 4 higher. Quick Climber and Quick Swimmer, which grant the speeds, follow the same rule.

## RD-04: Keen Sense on the sheet

Keen Sense ("+2 racial bonus to Perception skill checks") is added to the Perception total on the sheet. Its row on the check stands down, so it is never counted twice. Acute Sense ("+2 to any specific action related to that sense") stays a row on the check.

## RD-01: Eternals have no Death State

The Creature Codex Death State table governs: Eternal is 0, beside Construct, Elemental and Undead. The Eternal creature type now has no Death State, so an Eternal is destroyed at 0 HP. Before, 32 of the 47 published Fiends & Fables Eternals derived Death State 5.

## CO-02 and RD-08: Ooze immunities

The Ooze type is now immune to **precision** damage (CO-02) and **disease** (RD-08), as the Creature Codex prints: "An Ooze is immune to disease, mental effects, poison, sleep effects, paralysis, polymorph, precision damage, stunning and criticals."

## CO-01: printed-range senses are not granted twice

A creature printed with "Darkvision (60 ft.)" holds Darkvision. The grant workflow now holds an ability under its base name as well as its full name. A later grant pass, such as a template being applied, no longer adds a second, generic "Darkvision" beside it.

## Data and migration

- `tools/data-fixes.json`: `rd01-eternal-no-death-state` (Eternal `system.noDeathState` false → true), `co02-rd08-ooze-immunities-changes` and `-description` ("Ooze: immunities" gains disease and precision).
- Owned copies: `PACK_REPAIRS` `rd01-eternal-no-death-state` and `EFFECT_REPAIRS` `co02-rd08-ooze-immunities`. Both are old-value matched, so a GM's own edit is left alone. Both passes are re-gated to 3.699.0, and the schema is stamped 3.699.0. A world will be offered the migration once.

## Companion modules

Fiends & Fables Prime 0.46.1 and TRG Prime Codex 0.2.1 are verified with this release. The modules work on 3.698.4 too; these rulings simply take effect once 3.699.0 is installed. Per the standing rule, Pillars of Faith, Inner Tempest and Eldritch Arts are regression-tested against this release.

## Tests

`verify-joint-audit-3699` (new, 34 checks; `mutate-joint-audit-3699` 16 of 16 mutations caught); `verify-chapter1` (302 checks, including new ones for the Wisdom exemption and the ethic); `verify-live-fixes-3-627-1` U6 accepts the re-gated pass. Full regression suite: core 759 of 759 pass; Pillars of Faith, Inner Tempest and Eldritch Arts unchanged from their 3.697.0 baseline (TRG_CORE_TEST_REPORT.md §10).
