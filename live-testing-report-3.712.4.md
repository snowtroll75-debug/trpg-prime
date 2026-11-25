# Live test: one Spellbook (TRG Prime 3.712.4, Eldritch Arts 0.17.3, Pillars of Faith 0.13.3)

25 November 2026. Tested in the "Test" world as Testing Dude (GM). Installed: TRG Prime 3.712.4, Eldritch Arts 0.17.3, Pillars of Faith 0.13.3, Inner Tempest 1.1.1, Prime Codex 0.2.2. The world was already stamped 3.712.4 when I joined. All test actors were temporary and have been deleted.

| Test | Result |
|---|---|
| Fresh Wizard, Archmage, Spellblade and Archivist, each built from its own compendium | **Passed.** Each got exactly one "Spellbook", the core item `6useCNgleUx3BiUw`, stamped `requested: Spellbook`. |
| A second grant pass on each | **Passed.** Still one book each. |
| Each book's sheet | **Passed.** The growth card and Add to Book are there. Slots: Wizard 0/6, Archmage 0/6, Spellblade 0/4, Archivist 0/6. |
| Existing characters (Character, Valmorius, Valmorius 2) after your migration | **Passed.** The Wizard's and both Archmages' class copies grant "Spellbook". A grant pass gave the Archmages no second book: the one they already had counted. |
| Old-style Archivist: owned Prayer Book, Archivist class granting "Prayer Book", Bless recorded in the book. The migration was run on it with `migrateWorldData("3.712.3")` | **Passed.** The book was renamed Spellbook, with its stamp moved and the stock description replaced. The class now grants Spellbook. Bless stayed in the book, and a grant pass added no second book. |
| Old-style Archmage with a blank grant and no book | **Passed.** The migration gave its class the grant, and the next grant pass gave it one Spellbook. |
| Repeat run | **Passed.** The first run changed only the test actors, because the world's own actors were already migrated. All 193 world and owned items now need nothing from the migration. |

**Noticed, not changed:** the Archmage's book card reads "Restriction arcane". The class is stored as arcane, though it casts as high magic. Valmorius 2's book already holds divinity spells (Bless, Cure), so this looks like a label only, and it predates this change. The Spellblade's card shows no restriction.

**Not tested:** the player's view.
