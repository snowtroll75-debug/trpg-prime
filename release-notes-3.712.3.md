# TRG Prime 3.712.3: the Wizard's Spellbook is now the Spellbook

24 November 2026. Branch `fix/core-spellbook-rename`, from `main` at 3.712.2. Repair log R-0035.

- **The request.** Graham, 24 November 2026: other classes now use a spell book (Eldritch Arts' Archmage, Pillars of Faith's Archivist), so the core gear item should be called "Spellbook", with everything that links to it updated.
- **The packs** (declared in `tools/data-fixes.json`, written by `tools/declare-spellbook-rename.mjs`):
  - the gear item `6useCNgleUx3BiUw` is renamed from "Wizard's Spellbook" to "Spellbook". Its id, its Spell Book Container flag and everything else stay as they were;
  - its description no longer says that only the Wizard grants it;
  - the Wizard class's `grantedGear` now reads "Spellbook". This field is matched **by name** against the gear pack, so the old value would have granted new Wizards nothing.
- **Owned copies: a new migration pass** (`migrateSpellbookRename`, with its rule in `module/data/spellbook-rename.mjs`). The schema stamp is raised to 3.712.3, so the GM is offered the migration.
  - Every existing Wizard holds a book named "Wizard's Spellbook". That book is stamped `grantedBy.requested: "Wizard's Spellbook"`, and it sits under a class copy whose own grant says the same.
  - The pass renames the book, moves its stamp and updates the class copy's grant in one go. Changing only the class grant would have made the next grant pass give every Wizard a **second** book.
  - The pass only changes old values. A book the GM has renamed keeps its name, and a description the GM has edited is kept. A second run changes nothing.
  - It covers actors, unlinked tokens and world items. The GM's migration summary lists what it changed.
- **Text:**
  - The Magic tab's hint now says "open the Spellbook item".
  - On the item sheet, the Spell Book Container tooltip and the Granted Gear placeholder and tooltip no longer name the Wizard's book.
  - Code comments and the automation audit row are updated to match.
- **`apply-data-fixes`:** a fix may now carry `formerName`. This lets a fix that renames its own item still find it when the fixes are replayed.
- **What did not change:**
  - The spell book machinery reads the `spellbookContainer` flag, never the name.
  - The Archivist's Prayer Book and Liturgical Book (Pillars of Faith) are untouched. The Archmage's book (Eldritch Arts) is untouched too.
  - No companion module refers to the old name, apart from one code comment in each of the Pillars of Faith and Inner Tempest builders.

## Harness

- **`verify-spellbook-rename`:** 26 checks covering the packs, the migration rule (driven) and the wiring.
- **`mutate-spellbook-rename`:** 13 mutations, all caught.
- **`verify-stone-shield` B7:** this check pinned the schema stamp to exactly 3.707.1. It now accepts 3.707.1 or later, and `mutate-stone-shield` still catches all 23.
- **Full suite:** every `verify-*.mjs` in `tools/` ran one at a time, and all pass.
- **Mutation files run:** speed-pool (the schema gate), pack-repairs, migration-safety, classes, caster-style and arcanist-book, all caught everything.
- **Version pins:** re-pinned to 3.712.3 in 70 harness files.
