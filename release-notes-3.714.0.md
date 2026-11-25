# TRG Prime 3.714.0: the Spellbook's Free Spell button

25 November 2026. Branch `feature/spellbook-free-spells`, from `main` at 3.713.1.

- **The request.** Graham, 25 November 2026: an extra button on the Spellbook lets a PC add a spell for free, with the GM's approval. Free spells are counted apart from the Slots filled box.
- **The button.** **Free Spell** sits beside Add to Book on the Spellbook's own sheet. Anyone who can edit the sheet sees it.
  1. **Pick a spell.** The browser offers what a later Add to Book slot would:
     - spells of the owner's tradition rule (any tradition for an Archmage);
     - PP no higher than they can cast;
     - no specialist spells;
     - nothing already on the sheet.
  2. **The GM is asked.** A player's press goes to the acting GM in a dialog titled "Free Spell — GM Approval". It names the spell, its PP and tradition, and says that it takes no slot. If no GM is connected, or there is no answer within two minutes, the request is refused and the player is told why. A GM's own press is confirmed on the GM's own screen.
  3. **On a yes, the spell joins the book.** It is flagged `spellBookPick` and `freeBookSpell`. It lists and memorises like any book spell, but it is **off the ladder**: Slots filled and Owed don't change.
- **The card:**
  - The empty fourth box is now **Free spells**, showing the count.
  - A free spell's row is marked "(free)".
  - The chat card shows the new count and confirms that Slots filled has not changed.
- **GM authorisation** (`combat/gm-authorisation.mjs`) can now take its own `title`, `question` and `label`. The free spell is its first user. Without them, the off-turn strike's dialog and notices are worded exactly as before.
- **Not changed:**
  - Add to Book.
  - Learn a Spell: its additions are still `learnedExtra`, off the ladder, and not counted as free spells.
  - Memorisation: a free spell is in the memorisation pool like any other book spell.
  - No migration.

## Harness

- **`verify-spellbook-free`:** 30 checks.
  - The tally, the flags and the GM's question are driven.
  - The GM ask is driven with stub Foundry globals, on the GM's own screen and across the socket from a player. It also checks that the strike's own wording is unchanged.
  - The sheet wiring is checked in source.
- **`mutate-spellbook-free`:** 15 mutations, all caught.
- **Version pins:** re-pinned to 3.714.0.
