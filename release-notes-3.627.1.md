# TRG Prime 3.627.1 — the Chapter 9 live test's fixes

7 October 2026. Built on 3.627.0, from the Pillars of Faith 0.9.0 live test (`pillars-of-faith-live-testing-report-0.9.0.md`). Four defects in the 3.627.0 mechanisms, one older defect the test was the first to reach as a player, a bonus-type alias for copies already on sheets, and Graham's Undead ruling.

## Forced checks carry the sheet's modifiers (new dice/check-modifiers)

`TRGCheck.roll` rolls exactly the modifiers it is handed. Every older forced roll reads the sheet's `checkModifiers` (afflictions, Sanctuary, the Death critical, falling). Five rolls added at 3.627.0 named the save and passed nothing, so they rolled the bare die. The live card read "Modifiers +0" on a 12th-level cleric's Fortitude save (+13). The five were:

- a death guard's save (Unliving Fortitude);
- a declared after-strike's save (Ghoulish Venom, Paralytic Touch);
- a rolled aura's save (Ghast Stench, Aura of Despair, Lich Aura);
- Drink Blood's Athletics check against a grabbed target;
- the module helper `rollCheck`, which the Phylactery siphon uses.

`withCheckModifiers(config)` now fills them in. A save named by `save` gets its `subject` and the sheet's rows (copies). A skill gets the skill's rows. A config that already carries modifiers is left alone. All five sites roll through it.

## Exposure is once a day again (combat/declared-after-strikes)

The once-a-day marker was keyed `Actor.<id>:ghoul fever`. Foundry reads every dot in an update path as nesting, so the flag was stored as `{Actor: {...}}` and the flat lookup never found it. Live, a second Ghoul Fever bite the same day exposed the target again and added a second affliction. Dots in the key now become `_`.

## A Natural Leaper's High Jump costs its AP (jumping, combat/action-workflow)

The jump actions print their cost as "2 (or 1 with a +2 difficulty increase)". Read as a number, that string is 0, so the automatic High Jump spent nothing. The 1-AP option trades a harder check for one less AP, and an automatic leap makes no check. `leapApCost` therefore takes the printed 2. A Long Jump within the leaper's speed is still free, as the feat says.

## A player's critical injury no longer loses the strike (combat/attack-workflow, target-relay)

This defect predates Chapter 9. When a critical's row carried an Until Healed, Full Rest or Permanent persistence, its record was written directly to the target. A Fatal row, a Specific Location penalty and a held breath's lost air were written the same way. When a player's character hit the GM's NPC, that write threw a permission error. The whole strike then failed: no damage and no damage card. The live repro was a player's zombie biting a GM NPC: the first critical had a UH persistence, so nothing landed.

There is a new relay action, `target.injuryRecord`. It accepts four named kinds (`persistence`, `fatal`, `location`, `air`), and the GM's client builds each record itself. An owner still writes directly. If the GM can't be reached, a whispered card says so and the strike still lands.

## Undead are immune to disease (creature-types pack; migration)

Graham, 7 October: Undead should have disease immunity. The Creature Codex prints "immune to bleed, poison, sleep, disease, paralysis, soul drain, subdual damage and stunning", but the type's immunities effect had every item except disease.

- **The pack.** It is corrected by two `editEffect` rows in `tools/data-fixes.json`.
- **NPCs already in the world.** They own a copy of the type. The new `EFFECT_REPAIRS` table in `data/pack-repairs.mjs` declares the old and new values. The 3.627.1 migration pass (schema 3.627.1) repairs each owned copy field by field, and only where the copy still holds the old value. A GM's own edit to that effect is kept.
- **The prompt.** A GM will be asked to run the migration once.

## "Racial" is read as "race" (conditionals)

The book's word is "racial bonus", and the core's key is `race`. Pillars of Faith typed the bonuses on 27 feats as `racial`: twenty racial feats and seven Chapter 9 feats. An unknown type was shown on the card as Untyped and stacked as untyped. Iron Will of the Tomb's +2 showed this live.

The module fixes its own data in 0.9.1, but a feat already on a sheet is a copy that a module fix can't reach. `normaliseConditional` therefore reads `racial` as `race`, so every copy passes through correctly.

## Harness

- **New pair:** verify/mutate-live-fixes-3-627-1 (38 checks, 20 mutations).
- **Re-anchored:** verify-unliving-mechanisms H5 (the leap's cost) and verify-feat-gates F4 (the `rollCheck` helper).
- **Rules-have-callers backlog:** unchanged.
- **Sweep:** 513 of 513 green. The first run had seven red, all stale anchors on lines this release changed (block40-luck G2, the schema pin; chapter7-combat H5 and I8, and chapter7-critical G6, the relayed injury records; drive-3622's schema mutation). They were re-anchored and each rerun green.
