# Live test: the Spellbook's Free Spell (TRG Prime 3.714.0)

25 November 2026, in the "Test" world, run from two clients at once:
- the GM: Testing Dude, on localhost;
- a player: PC Tester, on 127.0.0.1.

The test character was a temporary level-1 Wizard owned by PC Tester. It has since been deleted.

| Test | Result |
|---|---|
| The player opens the Spellbook | **Passed.** Add to Book and Free Spell are both shown. The boxes read Slots filled 0/6, Owed 6, Restriction arcane, Free spells 0. |
| The player presses Free Spell and picks Sleep | **Passed.** The browser opened, titled "…PP 2 or less, not already known". |
| The GM's screen | **Passed.** The "Free Spell — GM Approval" dialog read: "ZZ Free Spell QA Wizard (asked by PC Tester): asks to add Sleep (PP 2, arcane, ethereal) to their Spellbook for free…", with Yes and No. |
| The GM says Yes | **Passed.** Sleep was added with `spellBookPick` and `freeBookSpell`. Free spells went to 1; Slots filled stayed 0/6 and Owed stayed 6. The row is marked "(free)", and the chat card says "Slots filled is unchanged (0 / 6)". |
| The player asks again | **Passed.** Sleep was no longer offered, because it is already known. |
| The player asks for Alarm and the GM says No | **Passed.** Nothing was added, and Free spells stayed at 1. |

**3.714.1** (higher PP allowed, and the Learned box) needs installing before it can be tested live.
