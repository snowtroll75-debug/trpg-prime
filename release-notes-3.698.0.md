# TRG Prime 3.698.0: Graham's rulings on the 3.697.0 audit

18 November 2026. Built on 3.697.0, which Graham has installed.

**Migration:** a world at 3.697.0 is offered one, schema 3.697.0 → 3.698.0. It runs only the pack-copy pass, which clears an owned Flame Blade's range and targets if they are still the printed "30 feet" and "1 creature". A copy a GM has edited is left alone.

## Changed, by ruling

- **A level drop takes back what was granted above the new level** (U1, option 1).
  - **What goes:** class abilities, feats and spells; an ability's own spells; a wizard school's specialist spells. Each goes when its level in the grant list is above the character's.
  - **The notification:** "Granted above level 8, removed: Unbreakable Resolve, Weapon Supremacy."
  - **What goes with it:** anything a removed ability granted, through the existing cleanup. A choice recorded on a removed ability is lost, and levelling up again re-grants the ability and asks again.
  - **What is never touched:** anything the list does not name (a pick, a hand-added item). The divine aspect's bonus spells keep R7's own pass, which spares the specialist pick.
- **Flame Blade has no range and no targets** (R3). Casting it no longer asks for a target 30 feet away.
- **Ability Enhancement: once per four levels** (R7). One pick at levels 1–4, two at 5–8, three at 9–12. The level is the familiar's mirrored (master's) level. Using a further copy beyond the allowance is refused with a notice; a copy that has already chosen may still change its choice.
- **Inner Focus** stays as built (R2 confirmed).

## Still open

**Flame Blade's blade (U12):** fire damage or slashing with fire criticals? It also needs a Spellcraft −2 attack rail.

## Harness

- **`verify-audit-3698`:** 21 checks. **`mutate-audit-3698`:** 15 mutations, all caught.
- **Version pins:** 3.698.0. `verify-audit-3697`'s B3 window was widened for the new allowance code.
- **Grant, migration and pack-repair checks:** all 58 related verify files green.
- **Full regression suite:** see TRG_CORE_TEST_REPORT.md §6.
