# Live testing report: TRG Prime 3.716.0 (Metamagic does what it charges for)

26 November 2026. Test world, on a scratch scene "ZZ SM Live 3716". TRG Prime 3.716.0 as installed by Graham. Both clients ran `tools/spell-matrix/live/matrix-driver.js`, which clicks the real Warp, Casting Conditions and Conviction dialogs.

## Setup

- **GM:** Testing Dude at `localhost:30000`.
- **Player:** PC Tester at `127.0.0.1:30000`. The player owned the Wizard, the Bard and the Ally, and not the two foes.
- **Rig:**
  - **ZZ SM Wizard:** level 10, with every core Metamagic feat. Spells: Mage Armour, Invisibility, Word Of Biting and Chill Storm, plus Forbiddance and Soothing Words added for cases 12 and 14. No component pouch until case 11.
  - **ZZ SM Bard:** level 10, caster level 5, with Inspire Courage and Lingering Performance. Charisma was set to 2 for case 13, and Heighten Spell was added for case 12.
  - **ZZ SM Ally:** a player-owned NPC, 5 ft from the Wizard.
  - **ZZ SM Foe Near** (30 ft) and **ZZ SM Foe Far** (45 ft): GM-owned NPCs with 30 HP.
- **Dice:** each client fixed its own d20 through `DiceTerm.prototype.roll`: the GM's on 18, the player's on 9 or 15. A save die showing 18 on a player's cast was therefore rolled by the GM. The dice were restored at the end.

## Results

| # | Seat | Case | Seen | Verdict |
|---|---|---|---|---|
| 1 | Player | Word Of Biting + Reach at Foe Far (45 ft; base range 30 ft) | Cast. 4 PP. Casting DC 16, save DC 18. The save die was 18, the GM's. HP 30 → 27 | Pass |
| 2 | GM | The same | 4 PP. HP 27 → 24 | Pass |
| 3 | Player | Word Of Biting, base, at Foe Near | Player d20 9 for the cast; the save die was 18, the GM's (U11). Success, half damage, HP 30 → 27 | Pass |
| 4 | Player | Mage Armour + Temporal ×1 | 3 PP. `spellEffectEnd − worldTime` = 43,200 s (1 hour → 12 hours) | Pass |
| 5 | Player | Mage Armour: Temporal's ceiling | The count's `max` is 1 (one step left from Hours) | Pass |
| 6 | Player | Mage Armour + Extend + Temporal | "Not Cast … Nothing was spent." 0 PP | Pass |
| 7 | Player | Mage Armour + Distant, Ally targeted | Distant offered. The effect landed on the Ally, not the Wizard. 10 PP in all: Distant cost 6 on the Ethereal tradition, and a Partial with Variable Success added 2 | Pass on reach; **the price was wrong** (see note 1) |
| 8 | Player | Invisibility's own touch warp + Distant | "Not Cast — Distant Spell cannot be taken with the spell's own range warp … Nothing was spent." | Pass |
| 9 | Player | Invisibility with no pouch, + Component Mastery material → verbal | Cast. "The material component becomes verbal for this cast." Invisible on the Wizard. 4 PP (a critical halved the base) | Pass |
| 10 | Player | The same without Component Mastery | Refused after the Warp dialog with "no Material Component Pouch equipped". 0 PP, no effect | Pass |
| 11 | Player | Chill Storm (20-ft radius) + Widen | Placement banner "40 ft radius"; card "area measurements doubled (20-foot radius ×2)" and "Area: 40 ft radius template placed". 8 PP; the pouch went 100 → 99 | Pass |
| 12 | GM | Heighten on a no-save buff, then counteract it | Mage Armour + Heighten: 3 PP spent, effect stamped `counteractAs {pp: 11}` (CL 10 → 11). Inspire Courage + Heighten from the Bard (a Specialist Spell): 2 PP spent, stamped 10 (character level 10). Soothing Words then counteracted it, and the Counteract Check dialog opened with "Effect's level/PP" at **10** and "Your level/PP" at 11 | Pass |
| 13 | Player, GM turns | Inspire Courage + Lingering Performance, Sustain allowed to lapse in combat | Cast in round 1 (linger 3 rounds: Cha 2 + 1 Echoing). At round 3 the entry stopped being sustained and lingered to round 6; the effects stayed on all three. At the start of round 6 it ended and the effects came off all three | Pass, with two defects (see below) |
| 14 | Both | Forbiddance's radius warp | A count box with `min="0"` and no `max`, on both clients. Closing the dialog cast nothing (PP unchanged) | Pass |

## Defects found, and fixed in 3.716.1

**D1: a lingering performance threw a server error when it ended.** Every time, at the start of the round it ended, the server logged `ActiveEffect "…" does not exist!` (twice). Instrumenting the deletes showed both clocks ending the same entry:

- `TRGCombat._onStartTurn` → `sweepActiveSpellExpiry`;
- the `updateWorldTime` hook → `sweepActiveSpellExpiry`.

A new round advances the world clock by 6 seconds as it changes the round. A lingering entry carries both stamps (`endsAtWorldTime` and `endsOnRound`), so both sweeps read it before either had removed it, and the second delete of the same effects failed. The effects did all come off. The race was older than 3.716.0, but Lingering Performance is the first entry that reaches it every time.

- **Fix:** `endActiveSpell` claims an entry before its first await, so a second caller gets `null`. `sweepActiveSpellExpiry` only reports "fades" for an entry it ended itself.

**D2: the turn card called a lingering performance a lapse.** At the round it began to linger, the Phase 1 card said "Inspire Courage lapses (not sustained)".

- **Fix:** `sweepSustainedLapses` now returns only the spells that ended. Those that linger ride along as `lingered`, and the card says "Inspire Courage lingers — the performance has stopped, and it carries on for 3 rounds (Lingering Performance)."

A stale comment in `metamagic.mjs` that still called Lingering Performance a note was corrected too.

## Notes

1. **Case 7's cost was wrong.** This report first said it matched the book; it did not, and the correction came on 27 November. The Wizard is an arcane caster. Distant's +6 is for "Ethereal Casters", and the engine had read the spell's list ("arcane, ethereal") instead of the caster's tradition. Distant should have cost 4, so 8 PP in all. Fixed in 3.717.0 (R-0041).
2. **Case 11's area** was removed once the cast resolved, because nothing claimed it (`shouldClearAreaRegion`, 3.609.2 onward). This is by design.
3. **Case 12's counteract DC** was blank ("GM adjudicates"), because a cast's stamp carries the PP and no DC. That is how a counteract against a spell effect has always worked.
4. **Case 12's first half** shows that a Specialist Spell's "maximum castable PP" is the character level (`specialistMaxPP`), not the caster level + 1. The stamp follows the cast's own cap.

## Cleanup

- The combat, the five ZZ SM actors (and their items) and the scratch scene were deleted.
- The 67 chat messages the two test users wrote after index 296 were deleted.
- Caves was re-activated. World time was put back to 96, and the game stayed paused.
- Dice were restored on both clients, and the tabs were closed.

3.716.1 itself has not been live-tested yet. It needs installing, and then case 13 needs repeating (about two minutes).
