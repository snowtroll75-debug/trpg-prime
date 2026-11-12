# TRG Prime 3.677.1: live test

1 November 2026, world "TRG V14", TRG Prime 3.677.1 with Eldritch Arts 0.2.0, as Gamemaster.

**Setup and cleanup.**
- **Actors:** throwaway "ZZ EA …" actors on a throwaway scene. The caster was a copy of Borin Slatevein.
- **Dice:** fixed through `CONFIG.Dice.randomUniform`, and restored afterwards.
- **Cleanup:** the 6 actors, the scene and the 10 test chat cards were deleted, and the view was returned to Oldwatch Approach.
- **Console:** no errors were captured. Console tracking started at the end of the session, so earlier messages may not have been captured.

**The case:** Protective Ward (an allies-only emanation, 10 ft) cast by ZZ EA Caster. All three Nyrinn carry Null Aura.

## Passed

1. **Refused at the cast stays refused.**
   - Nyrinn A, inside at the cast, rolled 2 against DC 19 and was told "rejects Protective Ward … the spell has no effect on them". The ally got +1 DB.
   - **Nyrinn A got no effect**, where 3.677.0 handed them the aura's bonus.
   - The emanation's record: `benefit.accepted = { Nyrinn A: false }`, `saveDC 19`.
2. **Stepping out and back in asks nothing and gives nothing.** Nyrinn A moved out to 25 ft and back in. No new card, still no effect.
3. **A latecomer who passes gets it.** Nyrinn B walked in with the die at 19.
   - "ZZ EA Nyrinn B — Will Save to accept Protective Ward — DC 19 — success lets it affect you", a Success.
   - "accepts Protective Ward (Will 19 vs 19) — Null Aura disrupts beneficial magic, but this takes hold normally".
   - +1 status to DB.
4. **A latecomer who fails does not.** Nyrinn C walked in with the die at 2: "rejects Protective Ward (Will 2 vs 19) — Null Aura disrupts it, and the spell has no effect on them". No effect.
5. **Remembered both ways.**
   - Both moved out (the effect left B as it should) and back in.
   - No new cards: B had the bonus again without rolling, C stayed without it.
   - The record: A false, B true, C false.
6. **Everyone else is unchanged.** A plain character walking in got the bonus with no roll and no card.
