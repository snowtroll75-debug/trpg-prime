# TRG Prime 3.677.0

1 November 2026. Three seams for Eldritch Arts 0.2.0, which rebuilds its Block 1 on book v1.6 with the rulings in *Responses to Audit Eldritch Arts*. Built on 3.676.1 as delivered.

- **Install over 3.676.1.**
- **No migration prompt.**
- **No existing item changes:**
  - Nothing in the core packs, or in Inner Tempest, declares the new flags.
  - Every racial weapon in the core and in Inner Tempest is Exotic, so it is still Martial for its race, as before (C13).

## New

**C12 — a reroll that answers a Failure.**
- **The rule (Eldritch Arts v1.6, Esoteric Insight):** "once per day, when you get a failure or fumble result on an Arcana or Occultism check, you can reroll the check".
- **Before:** a fumble reroll answered only a Fumble or a Blunder.
- **Now:** a reroll row may name its degrees: `flags.trg-prime.fumbleReroll.degrees`, any of `partial`, `failure`, `fumble`, `blunder`.
  - A row with no `degrees` answers a Fumble and a Blunder, exactly as before. Every existing row (Fortune's Reversal and the rest) is unchanged.
  - A skill check or save that comes out a Partial or a Failure offers the reroll only to an actor whose row names that degree. For everyone else, nothing changes and nothing extra is loaded.
  - The offer and the card name the degree rolled ("the failure is rerolled").
- **New exports:** `rerollAnswers(items, kind, subject, degree)`, `REROLL_DEGREES` and `DEFAULT_REROLL_DEGREES` (`module/fumble-reroll.mjs`). `fumbleRerollRows` and `fumbleRerollAvailable` take the degree as a last, optional argument.

**C13 — a racial weapon is one category easier for its race.**
- **Graham's ruling (m64, 1 November 2026):** "A weapon with a specific race listed in its traits allows a member of that race to use it with less proficiency. So a Martial weapon would become simple and an exotic weapon martial."
- **Before:** only an Exotic weapon stepped down, to Martial (Chapter 6, Exotic).
- **Now:** Exotic → Martial and Martial → Simple, for the race or heritage the trait names. A Simple weapon stays Simple. A weapon-trait rule for the class type (Eldritch Arts' Adept, 3.675.0) can still make it easier.
- **The proficiency reason** names the category the weapon became, for example "simple weapon proficiency (a Dwarf weapon, simple for a Dwarf)".
- **New export:** `RACIAL_STEP` (`module/proficiency-rules.mjs`).

**C14 — a beneficial-spell save that an ability declares.**
- **The rule (Eldritch Arts v1.6, Null Aura; Graham's C1):** "Your aura also disrupts beneficial spells cast upon you by other casters, and you must make a successful Will saving throw against the caster's Spell Save DC to benefit from them."
- **Before:** only the Ascendan's Forbidden Magic asked for this save, and only for a spell of a forbidden tradition.
- **Now:** an ability, feat, race or heritage may declare `flags.trg-prime.beneficialSpellSave: { label, otherCastersOnly }`. A switched-off ability declares nothing.
  - It is the same roll as the Ascendan's: the same spells count as beneficial (`isBeneficialSpell`), against the same DC (the caster's spell save DC). On a failure the spell has no effect on that target and still helps the others.
  - `otherCastersOnly` spares a creature's own spells on itself.
  - A creature with both a forbidden tradition and such an ability rolls once.
  - The card says which rule asked: "…Null Aura disrupts beneficial magic, but this takes hold normally", or "…disrupts it, and the spell has no effect on them".
- **New export:** `declaredBeneficialSaves(target)` (`module/magic/beneficial-save.mjs`). `beneficialSaveRequired` takes the caster as a last, optional argument.

## Harness

- **`verify-ea-block1-core`:** 89 checks (was 71).
  - **New:** C12 (every degree, the default, `rerollAnswers`, the card's words, the check's gate), C13 (each step, a heritage, the reason, an elf cleric refused), C14 (another's spell, one's own, a harmful one, no ability, a switched-off ability, the caster passed).
- **`mutate-ea-block1-core`:** 66 mutations, all caught (was 53). The C4 and C7 anchors this release moved were re-anchored.
- **Re-anchored to this release's moved lines:**
  - `verify-block5-core` D2 and `verify-fixes-3669-1` A1 read the reroll's gate in its new form;
  - `mutate-fixes-3669-1`'s Blunder mutation now goes at `rerollable`;
  - `mutate-fixes-3669-2`'s "a Blunder is called a fumble" goes at the degree read once;
  - `mutate-chapter6-gear-151-160`'s "the racial clause does nothing" goes at the new one-step line.
  - Each still catches what it was written for: 51 checks / 58 mutations, 16 / 18, 26 / 50, 158 / 43.
- **`tools/uncalled-exports.json`:** keeps for `rerollAnswers` (called through a dynamic import), `REROLL_DEGREES`, `DEFAULT_REROLL_DEGREES`, `RACIAL_STEP` and `declaredBeneficialSaves`. Their callers are in their own files, and the verify files drive them.
- **Re-pinned to 3.677.0:** the version anchors of ten mutation files and the release link.
- **Inner Tempest 1.0.3's harnesses on 3.677.0:** Blocks 1–4 and 6–10 and the weapons are all green (392, 205, 1040, 1360, 183, 228, 123, 84, 118 and 117 checks). Block 5 reads the Inner Tempest book's markdown, which is not in this workspace.
- **Full sweep on the staged 3.677.0:** 657 harnesses. 651 passed. The other six were the five re-anchorings above (pins on lines C12 and C13 moved), found by this sweep. Each was fixed and re-run green, with the ratchet, the undefined-names check and `verify-checks-can-fail`. The sweep's copy of the tree was compared with the release tree afterwards: they differ only in those five files.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
