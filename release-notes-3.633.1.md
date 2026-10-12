# TRG Prime 3.633.1, with Fiends & Fables Prime 0.12.1

11 October 2026. These are fixes for the defects I found when testing 3.633.0 and 0.12.0 live (see `claude/fiends-and-fables-3.0-live-testing-report-3.633.0.md`). **Install both.**

## Core 3.633.1

- **Auras reach a large creature by its edge.** A Large Waarg standing next to the Aboleth was not caught by Mucus Cloud, because the aura measured only the centre of the creature entering it. A creature's own space now counts. A Medium creature is reached exactly as before. This applies to every creature aura.
- **An Extraplanar mook dies at 0 HP.** In 3.633.0 the hook asked the reaper to remove a creature that was only dying, and the reaper refused. The creature is now made dead first (Dying one past its Death State), then reaped, and the destruction card follows.
- **Card wording:**
  - An aligned rider reads "Claw (2d6) — 11 good aligned damage", not "(2d6 good) (good)".
  - An innate spell's save line says "(as printed)" when the stat block's DC is in use, and "(+2 High Magic)" when High Magic adds to it.
  - The Heighten note no longer appears on innate spells, where it means nothing.

## Fiends & Fables Prime 0.12.1

- **Item lists repaired.** In Foundry's pack format, an Actor lists the ids of its items, and 0.12.0 added and removed item records without updating those lists. As a result, the Aboleth Magi arrived with one item, and the Avoral, Dracoral, Feloral and Luporal had no Eternal Essence. Their five lists have been rebuilt, and the module check now confirms that every actor's list matches its item records.
- **Focus innate spells arrive ready.** 204 Focus innate spells came with their one use already spent, because a creature placed from the compendium never has a daily preparation. They now start at 1 of 1.

## Checks

- `verify-ff30-block3`: 30 checks. `mutate-ff30-block3`: 43 mutations, all caught.
- `verify-module-block3`: 33 checks.
- The full sweep result is in the delivery message.
