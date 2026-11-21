# TRG Prime 3.707.2: "until the end of your next turn" ends at the caster's turn end

21 November 2026. Follows 3.707.1 (not yet installed), which it includes. Branch `fix/next-turn-end-clock`, from `fix/next-turn-start-clock` at `1010c65`.

Graham, asked whether "until the end of your next turn" should be tied to the caster's own turn as the start was in 3.707.1: **"Yes is the answer to your one question, please implement that before testing."**

## What was wrong (R-0017)

"Until the end of your next turn" was two rounds on the round clock. In an encounter it ended at whichever came first:

- two rounds of world time;
- the start of the carrying creature's own turn two rounds on.

Neither is the end of the caster's next turn. On an ally it could end before that ally had used it. Cast as a reaction on another creature's turn, it ran a turn late.

## What happens now

- **In an encounter:** every effect of such a spell carries its caster and the turn it was cast in (the round, and the combatant then acting). It ends as that caster's next turn ends, on every creature carrying it:
  - **Cast in the caster's own turn:** it outlasts that turn's end and ends at the end of the next one.
  - **Cast as a reaction on another creature's turn:** it ends at the end of the caster's coming turn.
  - **Nobody else's turn end** ends it.
- **The turn-end sweep** runs in `_onEndTurn` for every combatant, with the ending turn's own round (`context.round`), after the stasis check. Effects that end there are announced on a "Spells end" card.
- **Out of an encounter:** twelve seconds, as before.
- **Backstop:** three rounds of world time (18 s). The end of the caster's next turn is at most two round boundaries away, so the backstop can't come first. It still ends an effect whose caster never takes that turn.
- **Conditions** a spell lays carry the stamp, including through the GM's relay. The relay accepts two strings and nothing else.
- **On the sheet** the duration reads "Until the end of the caster's next turn".
- **Which spells:** in the core pack, Enchanting Utterance, Seer's Vision and Shifting Step, plus any module spell with that printed duration.
- **Not changed:**
  - "until the end of **its/their/the target's** next turn" names someone else's turn;
  - "until the end of your turn" is the turn in progress.

No data change and no migration. The schema stays at 3.707.1.

## Harness

- **New:** `verify-turn-end-clock` (21 checks) and `mutate-turn-end-clock` (15 mutations, all caught).
  - It drives the sweep: cast in the wizard's own turn, the effect outlasts that turn's end and the orc's, and ends as the wizard's next turn ends.
  - Cast as a reaction on the orc's turn, it ends as the wizard's coming turn ends.
- **Re-anchored:** `verify-turn-start-clock` R2 and R3, `mutate-turn-start-clock` (the relay list), `verify-session-decisions-1015` D4b.
- **Version pins** raised to 3.707.2. The schema and gate pins stay at 3.707.1.

## Testing

- **Core verify:** all 395 verify scripts at the final commit, in a clean worktree. **395 of 395 pass.**
- **Core mutation:** every mutation script that reads a changed file or carries a pin, run in their own worktree: 183 scripts. **183 of 183 pass.** Five needed a re-anchor and were re-run:
  - `mutate-block35b` (its verify's A9 now counts four stasis-aware sweeps);
  - `mutate-block9-core` and `mutate-wild-morph`: the new sweep had a line, and an ending, in common with the world-clock sweep. The sweep's line is now worded differently, and the wild-morph anchor names the world-clock sweep;
  - `mutate-chapter7-critical-211-220` and `mutate-session-fixes-0829` (the condition writer's guarded block).
- **Not run:** the two long whole-tree mutation scripts, as in 3.707.1.
- **Modules:** Pillars of Faith, Inner Tempest and Eldritch Arts give **identical results** on 3.707.2 and 3.706.1.
- **Pack:** unchanged from 3.707.1.
- **Live Foundry:** not yet run. The Test world is on 3.706.1.
