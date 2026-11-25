# TRG Prime 3.714.1: Free Spell at any PP, and a Learned box

25 November 2026. Branch `feature/spellbook-free-spells`, on top of 3.714.0.

- **Graham's answers to the three choices in 3.714.0** (25 November 2026):
  1. "Keep tradition rules but allow higher PP spells."
  2. Learn a Spell's additions get "a box of their own".
  3. The GM-authorisation dialog stays as built.
- **Free Spell offers any PP.** The browser still applies:
  - the owner's tradition rule (all traditions for an Archmage);
  - the specialist exclusion;
  - "nothing already on the sheet".
  
  Only the castable-maximum cap is lifted. In code, `eligibilityFor(actor, { firstPick: false, anyPP: true })` replaces the cap with no limit, and Add to Book is unchanged. The browser's title now reads "any PP, not already known".
- **A Learned box.** The book card has five boxes: Slots filled, Owed, Restriction, Free spells and Learned. Learned counts the Learn a Spell additions (`learnedExtra`); a spell flagged free is never counted there. A learned spell's row is marked "(learned)", as a free one is marked "(free)". The grid is the existing `five-column` style, which drops to three columns on a narrow sheet.
- **Not changed:**
  - the ladder: free and learned spells still take no slot;
  - memorisation;
  - the approval dialog;
  - no migration.

## Harness

- **`verify-spellbook-free`:** 38 checks (8 new).
  - The Learned tally is driven, including a spell flagged both ways.
  - The lifted cap is driven: a PP 9 tradition spell passes, a specialist one does not, and a capped caster still refuses PP 9.
  - Also checked: the wiring and the five-box grid.
- **`mutate-spellbook-free`:** 21 mutations, all caught; six are new.
- **Version pins:** re-pinned to 3.714.1.
