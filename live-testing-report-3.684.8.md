# Live test: TRG Prime 3.684.8 with Eldritch Arts 0.9.2

6 November 2026. Graham's world in Chrome, with 3.684.8 and 0.9.2 installed and active. The tests used three throwaway "ZZ EA …" characters, each level 6, and no scene or combat. They were read from the sheet's own context (`_prepareContext`): its feat-pick banner and its feat tables. Everything was cleaned up afterwards.

## Passes: granted items cost no pick

| Character | Added | Class picks spent | Archetype and class feat tables |
|---|---|---|---|
| Wizard | Spell Weaver (Eldritch Arts) | 0 → **1** of 5 | Spell Weaver (feat, paid); Magical Reservoir (ability, granted, **free**) |
| Fighter | Gymnast | 0 → **1** of 7 | Gymnast (feat, paid); Agile Display (ability, granted, **free**) |
| Fighter | Warden | 0 → **1** of 7 | Warden (feat, paid); Favoured Terrain (class feat, granted by Warden, **free**) |

- In each case only the archetype feat itself spends a pick.
- The Wizard's own Heighten Spell, granted by the class, stays free.

## Not run live

The Charge card's header ("Charge 2 AP" with Sudden Charge) needs a combat on the charger's turn. It was checked in the harness against the real arming card (`verify-sudden-charge` C6), not live. The Block 6 checks are on hold at Graham's request.

## Cleanup

- **Deleted:** the three ZZ characters and 9 test chat cards.
- **Not touched:** Graham's combat (active, round 1, turn 3, three combatants).
- **View:** Oldwatch Approach.
- **The game is still paused,** as it was before the test.
