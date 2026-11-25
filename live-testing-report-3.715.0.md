# Live test: the Spellbook's School and PP menus, and selecting several spells (TRG Prime 3.715.0)

25 November 2026, in the "Test" world, run from two clients:
- the GM: Testing Dude, on localhost;
- a player: PC Tester, on 127.0.0.1.

The test character was a temporary Wizard owned by PC Tester, raised to 3rd level by XP. That gives 10 slots: 6 opening PP 2 picks and 4 later picks, with a castable maximum of PP 4. The character has since been deleted.

| Test | Result |
|---|---|
| Add to Book, first press (empty book) | **Passed.** Titled "Spell book: up to 6 slots (0 of 10 filled) — any PP 2 arcane spell (opening batch)". 80 rows, each with a tick box, and an Add Selected button. Menus: School (all eight schools) and Sourcebook (opens on Core Rulebook). There is no PP menu, because every opening pick is PP 2. |
| The School menu | **Passed.** Enchantment showed 9 rows (Bungle, Charm Kind, Command, Fear, Haze of Dreams, Sleep…). |
| Selecting across filters and the cap | **Passed.** I ticked 2 Enchantment spells, switched to Invocation and tried 5 more. Only 4 were kept: the 7th tick was undone with "You can select up to 6 here." The count read "6 of 6 selected". |
| Add Selected (a real click) | **Passed.** All six went in at PP 2 (Charm Kind, Breeze, Flare, Eldritch Touch, Bungle, Burning Hands), leaving Slots 6/10 and Owed 4. One chat card named all six and said "4 slots still open". |
| Add to Book, second press | **Passed.** Titled "up to 4 slots (6 of 10 filled) — any arcane spell of PP 4 or less". The PP menu read 0, 2, 4, in number order. Choosing PP 4 showed 54 of 161. Ticking two added Acid Bolt and Animate Object (both PP 4), leaving Slots 8/10 and Owed 2. |
| Free Spell with several spells | **Passed.** The PP menu ran 0 through 20 in number order. Choosing PP 10 and Translocation showed 5 of 423; there is no cap, and the count read "3 selected". |
| The GM's single question | **Passed.** "asks to add 3 spells — Conjure Wyrm (PP 10, arcane), Dulling Cloud (PP 10, arcane, ethereal, verdant), Passwall (PP 10, arcane, verdant) — to their Spellbook for free…". The GM said Yes. |
| After approval | **Passed.** All three were added, marked "(free)". Free spells read 3, with Slots filled still 8/10 and Owed 2. One chat card named all three. |
| The ordinary spell picker | **Passed.** It is still single-pick: radio buttons and an Add button, and Cancel returns nothing. Its PP menu now sorts in number order (0, 1, 2 … 9, 10, 11 … 20). |

**Noticed, not changed:** a later book slot also offers PP 0 spells. That comes from the existing "PP no higher than you can cast" rule, so it predates this release.
