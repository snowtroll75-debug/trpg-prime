# TRG Prime 3.712.4: one Spellbook for every book caster

24 November 2026. Branch `fix/core-spellbook-rename`, on top of 3.712.3. Repair log R-0036.

- **The request.** Graham, 24 November 2026: the Archmage and the Archivist should also get the free Spellbook ("keeping it to one item makes things much easier in the long run"). He added the Spellblade too. An Archivist who already has a Prayer Book has it converted, and the Prayer Book's compendium entry stays.
- **The companion modules** carry the new grants (core content is unchanged):
  - **Eldritch Arts 0.17.3:** the Archmage and the Spellblade grant "Spellbook".
  - **Pillars of Faith 0.13.3:** the Archivist grants "Spellbook" instead of "Prayer Book". The Prayer Book entry stays (ids kept), granted by nothing, and its description says so.
- **The migration** (`migrateSpellbookRename`) is moved up to 3.712.4 and widened. The schema stamp is now 3.712.4, so a world that already ran the 3.712.3 pass is offered it again. Re-running it is safe, because it only changes old values.
  - **An owned Prayer Book becomes the Spellbook.** This applies only when the item is a spell book container. Its recorded spells are untouched, because they live on the actor (`spellBookPick`), not in the item. Its stamp moves too, and its stock description is replaced.
  - **An owned Archivist class copy** has "Prayer Book" in its Granted Gear changed to "Spellbook".
  - **An owned Archmage or Spellblade class copy** that is a book caster with a blank Granted Gear gains "Spellbook". The next grant pass then hands the character the book. A copy where the GM has set other gear is left alone.
  - The Liturgist's **Liturgical Book** is a different book, and is not touched.
  - Everything from 3.712.3 is unchanged: the Wizard's Spellbook, its stamp and the Wizard class copy.

## Harness

- **`verify-spellbook-rename`:** 34 checks. The new D section (D1–D8) covers the Prayer Book, the Archivist, the Archmage, the Spellblade and the Liturgical Book.
- **`mutate-spellbook-rename`:** 19 mutations, all caught; six are new.
- **Full suite:** every `verify-*.mjs` in `tools/` ran one at a time.
- **Version pins:** re-pinned to 3.712.4.
