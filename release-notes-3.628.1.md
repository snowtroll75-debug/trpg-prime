# TRG Prime 3.628.1 — Fiends & Fables actually joins, and no picker opens empty

7 October 2026, from the live check of 3.628.0.

## Fiends & Fables was never registered (module-api-workflow)

3.628.0 registered Fiends & Fables' four character packs at init by asking `game.packs` for each one. Foundry builds `game.packs` only after init, so every lookup came back empty and nothing was registered.

Live, the race, heritage, ability and feat lists held only Core and Pillars of Faith content, and the module registry's pack map was empty. The registration now reads the module's own pack list from its manifest, which exists at init.

With the four packs registered by hand in the session to stand in for the fix, the live pickers read:

| Picker | All | Core Rulebook | Fiends & Fables | Pillars of Faith |
|---|---|---|---|---|
| Race | 125 | 8 | 113 | 4 |
| Class feat (Test Cleric) | 31 | 30 | 1 | — |
| Archetype feat | 18 | 8 | — | 10 |
| General feat | 84 | 69 | — | 15 |
| Spell | 265 | 247 | — | 18 |
| Background | 54 | 42 | — | 12 |

- **Opening value.** Every one of these opened on Core Rulebook.
- **One book only.** A list with a single book shows no menu: the heritage list for a raceless character had 3 entries.
- **Grants still go to the right book.** An Unliving Vampire added from the compendium was granted Pillars of Faith's Fast Healing, Drink Blood and Sunlight Weakness, plus the core Darkvision, with F&F's same-named abilities in the list.

## No picker opens on an empty list (picker-workflow)

Each menu's default is sensible on its own, but two together could show nothing. The ability picker for a character opens on Kind "Racial", and the Core Rulebook's racial abilities arrive through races, not through this list. The result was "0 of 300 shown" on opening.

When the defaults together show nothing, the Sourcebook menu now steps back to All.

## Harness

- **verify/mutate-sourcebooks:** now 24 checks and 18 mutations (E6, E7 added).
- **Sweep:** 515 of 515 green on the first run.
