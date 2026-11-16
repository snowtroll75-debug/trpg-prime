# TRG Prime 3.688.3

13 November 2026. One change, approved by Graham: the Magic Ritual dialog's secondary-caster rows start at "not participating". Built on 3.688.2. No migration; no world data is touched. Eldritch Arts 0.13.1 runs on it unchanged.

## The ritual's secondary rows start empty

- **Before:** all six rows opened on "Success (+2)". A GM who rolled a ritual alone, or filled in one row and left the rest, was credited six secondary casters: +12 on the ritual check, and six seats for the overcast headroom. The first ritual in the 3.688.1 live test did exactly that.
- **Now** every row opens on "— not participating —". A secondary caster counts, and adds their modifier, only when the GM records their degree. The degrees and their modifiers (Critical +4, Success +2, Failure −4, Fumble −10, Blunder) are unchanged.

## The live test of 3.688.2 / 0.13.1

Run in Graham's world with throwaway actors (a copy of Valmorius, who had not studied today). The world was left as found: test actors and scene deleted, own messages removed, world time unchanged, game paused, the usual scene in view.

- **Wand of Cure, released by Spellcraft:**
  - the dialog offered Spellcraft (easy), with Religion and Nature unavailable for the right reasons;
  - the release check rolled **Spellcraft +14** (5 + 14 = 19 against DC 11, a success);
  - the wand went from 6 to 4 PP;
  - Cure was cast at the wand's 2 PP, and was not refused for the missed study.
- **Staff of Undeath, Charm Undead, released by Spellcraft:**
  - the release check rolled **Spellcraft +14**;
  - against a target that is not undead, the cast was refused, and the staff kept its 1 PP;
  - against an undead target, the cast went off: Will save against the staff's DC 21 failed, and the target turned from indifferent to helpful (sustained, 1 minute).

## The harness

- **New pair `verify-fixes-3688-3`** (9 checks) and **`mutate-fixes-3688-3`** (6 mutations, all caught).
- **Version pins** raised to 3.688.3.
- **Every `verify-*` and `mutate-*` on the final tree (the full sweep, four shards):** 735 scripts, 0 failures; unpaired 0, missed 0.
- **Eldritch Arts 0.13.1's 24 verifiers** on this core: all pass.
- **Independent review:** no defects. It noted that, with the rows empty, Eldritch Arts' Ritual Experts and its "ticked secondaries" check now start from zero seats rather than six phantom ones, which removes a refusal a GM could hit by leaving the rows alone.
