# TRG Prime 3.676.0

29 October 2026. The Arcanist's spell slots now memorise from the Arcanist's spellbook.

Graham: "the later feats should also ask for the memorised spells to also come from the spellbook, but foundry does not do this. It simply links to a list of arcane spells."

- **Install over 3.675.1.** Eldritch Arts, Inner Tempest and Pillars of Faith run on it unchanged.
- **No migration prompt.** No character in the test world holds any of these feats.

## Rulings, 29 October 2026

- **R1, free additions as printed.** Minor, Major and Master Arcane Caster each say: "Each time you are granted a new spell slot, you may also add an arcane spell of the appropriate level to your spell book." So each of those slots also adds one spell to the book, free. Learn a Spell adds more on top.
- **R2, Arcane Knight fills from the book too.** Its text says only "You may now memorise and cast a PP 2 arcane spell". Its PP 2 slot now takes a spell from the book. It has no free-addition sentence, so it adds nothing to the book: that spell has to be learned, or taken with a tier slot's free addition.

## What changed

**The slots memorise from the book.**
- Arcane Knight's slot and every Minor, Major and Master arcane slot now open a list of the levelled spells in the Arcanist's spellbook, not the whole arcane list in the compendium.
- The list offers only spells within the slot's PP ceiling that aren't already memorised in another slot.
- An empty list says why: either the book has no levelled spells, or none fits.
- **Memorising marks the book's own entry. Nothing is copied.** A second "Sleep" never appears on the sheet.
- **Clearing a slot leaves the spell in the book.** Before, clearing deleted the spell.

**A book spell can be cast only while a slot holds it.**
- The system works this out from whether the slot exists right now, not from a "prepared" stamp.
- If Arcane Knight is removed, or a level is lost, the spell in that slot stops being castable straight away. It goes back to being a book entry, with nothing written to it.
- It is never reported as "orphaned" the way a stranded slot spell is.
- An unslotted book spell is off the spells table. Trying to cast it says: "is in your spellbook but is not memorised in a spell slot — memorise it from the Spell Slots card".

**The Arcanist card shows the book's levelled half.**
- A new **Spellbook — Levelled Spells** section lists each spell with its PP, and marks the ones memorised.
- It counts **free additions**: one per Minor, Major or Master arcane slot (R1). The Knight slot gives none (R2).
- While a free addition is owed, an **Add to Spellbook** button offers arcane spells up to the PP your slots can hold ("of the appropriate level"). Spells already on the sheet aren't offered.
- A tier feat of your class's own tradition grants no slots, so it gives no additions either.

**Learn a Spell is open to the Arcanist.**
- Before, it worked only for a class that keeps a spellbook (the Wizard).
- It now also writes into an Arcanist's spellbook: arcane spells only, up to your castable maximum. A Cleric/Arcanist learns arcane spells, not divinity ones.
- Spells learned this way are marked as learned, so they never use up a free addition.
- The outcome card says the spell was "added to your spellbook". Learn a Spell's own description names the Arcanist's book.
- If a character somehow had both books, the Wizard's would win. A legal character can't: the Arcanist requires Non-Wizard.

**The book belongs to the Arcanist feat.** Removing Arcanist removes its levelled spells along with its four cantrips, through the usual cleanup when a feat is removed.

## Unchanged

- The four Arcanist cantrips, and preparing two of them a day.
- The Priest, Animist and Gleeman, and every non-arcane Knight and caster feat. These still memorise from their tradition's whole list, as their text says.
- **A slot already filled from the compendium** under an earlier version keeps its spell. Clearing it deletes that copy as before; the next fill comes from the book.
- **A pre-existing gap, not touched:** a stranded compendium copy is labelled "cannot be cast" on the card, but the cast gate still allows it. Book spells don't have this problem, because their castability is worked out from the slot.

## Harness

- **New: `verify-arcanist-book`**, 71 checks. It drives the rules directly: whose book it is and which slots it binds, the free additions on every rung (Minor 1/2/3, Major +3, Master +2 then +1), what may go into the book and into a slot, castability through the spell's own actor (removing Arcane Knight from the actor is enough), never orphaned, and Learn a Spell's route. Plus 17 structural checks that the workflows, sheet and card use those rules.
- **New: `mutate-arcanist-book`**, 36 mutations, all caught.
- `tools/uncalled-exports.json`: a keep for `featSpellSlots`, now called by `actorFeatSpellSlots` in its own file and driven by the new verify file.
- **Re-pinned to 3.676.0:** the version anchors of ten mutation files and the release link.
- `verify-caster-tier-feats`, `verify-caster-level`, `verify-casting-feats`, `verify-archetype-abilities`, `verify-classes` and `verify-chapter9-231-240` were run separately and pass.
