# TRG Prime 3.715.0: the Spellbook's browsers filter by school and PP, and take several spells at once

25 November 2026. Branch `feature/spellbook-free-spells`, on top of 3.714.1.

- **The request.** Graham, 25 November 2026: "At the moment when add spell or free spell are used there are no filters and no way of selecting multiple spells … I would [like] a filter by school option and filter by PP. Also, I would like the character to be able to select more than one spell at a time."
- **School and PP menus.** Both book browsers, Add to Book and Free Spell, now have three menus:
  - **School:** read off each spell's traits, which is where every spell names its school ("Fire, Invocation").
  - **PP:** listed in number order, so PP 10 comes after PP 9. The ordinary spell picker's PP menu sorts the same way now.
  - **Sourcebook:** already on every picker.
  
  The menus work together with the search box. As on every picker, a menu with only one value on offer is not shown.
- **Several at once.** In both browsers every row is a tick box, the button reads **Add Selected**, and a count under the list says how many are selected. A ticked row stays ticked when a menu hides it.
  - **Add to Book** takes up to the slots owed. While the opening batch is open, it takes only what is left of that batch, because those picks are held to PP 2. So a 3rd-level Wizard with an empty book picks the six PP 2 spells first, then presses again for the four later slots. A tick past the cap is undone, and a notice says how many may be taken. The chat card names every spell added.
  - **Free Spell** has no cap. The whole selection goes to the GM as **one** question, naming each spell with its PP and tradition. Yes adds them all; No adds none.
- **The picker itself** (`pickFromPack`) gains `multiple` and `maxPicks`, both off by default. Every other picker is unchanged: radio buttons, double-click to add, and one pick returned. In multi-select mode double-click does nothing, so it can't add one spell and drop the rest of the selection.
- **Not changed:**
  - what each browser offers (the tradition rule, the PP limits, "not already known");
  - the tallies and their boxes;
  - Learn a Spell;
  - no migration.

## Harness

- **New: `verify-spellbook-picker`, 32 checks.**
  - Driven: the school reading, the menu order, numeric PP sorting, Add to Book's cap at each stage of the opening batch, and Free Spell's question for several spells.
  - Checked in source: the multi-select mode, its cap and count, single-pick mode staying as it was, and both browsers' wiring.
- **New: `mutate-spellbook-picker`:** all 13 mutations caught.
- **`verify-spellbook-free` and `mutate-spellbook-free`:** still 38 checks, with all 21 mutations caught. One mutation's anchor was updated for the new question wording.
- **`uncalled-exports.json`:** two declared keeps added, `spellBookPickLimit` and `spellSchoolOf`. `PICKER_FACETS` now has a caller, so the backlog drops from 496 to 495.
- **Version pins:** re-pinned to 3.715.0.
