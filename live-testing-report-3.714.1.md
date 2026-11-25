# Live test: Free Spell at any PP, and the Learned box (TRG Prime 3.714.1)

25 November 2026, in the "Test" world, run from two clients:
- the GM: Testing Dude, on localhost;
- a player: PC Tester, on 127.0.0.1.

The test character was a temporary level-1 Wizard owned by PC Tester, with a castable maximum of PP 2. It has since been deleted.

| Test | Result |
|---|---|
| Learn a Spell success: Magic Missile, through the shipped `applyLearnSpellOutcome` | **Passed.** The Learned box read 1, the row was marked "(learned)", and Slots filled stayed 0/6. |
| The player's book card | **Passed.** Five boxes: Slots filled 0/6, Owed 6, Restriction arcane, Free spells 0, Learned 1. |
| The Free Spell browser | **Passed.** Titled "…any PP, not already known". It offered 430 spells:<br>• 324 of them are above PP 2;<br>• none are outside the arcane tradition;<br>• none are specialist;<br>• Magic Missile is not offered, because it is already known.<br>Add to Book's own browser is still capped: 106 spells, none above PP 2. |
| The player asks for Fireball (PP 6) | **Passed.** The GM saw "asks to add Fireball (PP 6, arcane, verdant) to their Spellbook for free…", and approved it. |
| After approval | **Passed.** Free spells 1 and Learned 1, with Slots filled 0/6 and Owed 6. The rows read "Fireball (free)" and "Magic Missile (learned)". |
