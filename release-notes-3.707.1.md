# TRG Prime 3.707.1: "until the start of your next turn", and Stone Shield's one foe

21 November 2026. Follows 3.707.0 (not yet installed), which it includes. Branch `fix/next-turn-start-clock`, from `fix/spell-stone-shield` at `5d40094`.

Graham's answers of 21 November 2026 to the two 3.707.0 questions:

1. "Any spell that has a duration of 'until the start of your next turn' should end at the beginning of the characters turn, so yes change it and other spells that have the same issue."
2. Should a Stone Shield cast from the sheet be limited to one foe: "Yes it should."

## A. "Until the start of your next turn" ends at the caster's turn (R-0015)

**What happened:** the duration was one round on two clocks. In an encounter the effect ended at whichever came first:

- the top of the next round, on the world clock;
- the start of the turn of the creature carrying it, once the round had moved on. For a buff on an ally, that is the ally's turn, not the caster's.

So it could end before the caster's next turn (an ally who acts first, or a caster who acts late in the round). Cast as a reaction before the caster's own turn in the same round, it lasted a turn too long.

**Now:**

- **In an encounter:** every effect of such a spell is stamped with its caster, on whichever creature it landed. It ends when that caster's next turn starts, and at no other creature's turn.
  - It doesn't depend on round order: cast after your turn, it ends at your next turn; cast as a reaction before your turn in the same round, it ends when that turn starts.
- **Out of an encounter:** six seconds, as before. There are no turns to wait for.
- **Backstop:** two rounds of world time (12 s). A round's change moves the world clock, so the backstop can't fall before the caster's next turn starts. It still ends an effect whose caster never takes that turn (removed from the combat, or the combat ended).
- **Conditions** a spell lays carry the stamp too, including through the GM's relay when a player's spell lands on the GM's creature. The relay accepts only a uuid.
- **On the sheet** the effect's duration reads "Until the start of the caster's next turn", not the backstop's seconds.
- **Which spells:** in the core pack, Gust, Guidance, Invulnerability, Stone Shield, True Target and Weapon Surge. A module spell with the same printed duration is covered by the same parser.
- **Not changed:**
  - "until the start of **its/their** next turn" names someone else's turn and keeps its old clock;
  - "until the **end** of your next turn" is unchanged. It was not part of the ruling. Say if you want the same treatment for it (Enchanting Utterance, Shifting Step, Seer's Vision).

## B. Stone Shield raises against one foe (R-0016)

- **The rule:** the ward row declares `foes: 1`. A cast with any other number of enemies targeted is refused after the targets are final and before anything is spent:
  - several: "Stone Shield is raised against one foe — you have 3 enemies targeted. Target only the one."
  - none: "Stone Shield: target the foe to raise it against." Until now that cast spent its PP and reaction and then applied nothing.
- **Counting enemies:** by disposition against the caster's, the same reading the shield's applier uses.
- **The reaction offer** always targets just the attacker, so it is unaffected.
- **Other wards:** a ward that declares no number (Forbidding Ward, Anticipations) is not limited.

## Data

- **Pack:** one record changed, Stone Shield's (`foes: 1`). It is declared as `stone-shield-one-foe-3707-1`, and `stone-shield-barrier-3707` is retired by it. The other packs are byte-identical.
- **Owned copies:** the `PACK_REPAIRS` row now brings a copy to the 3.707.1 row. Its 3.707.0 row is one of the values recognised as stale, beside the 3.406.0 and pre-3.406.0 ones.
- **Migration:** the pack-copy pass and the schema are re-gated to 3.707.1.

## Harness

- **New:** `verify-turn-start-clock` (28 checks) and `mutate-turn-start-clock` (17 mutations, all caught).
  - It drives the sweep with fake creatures: an ally's effect outlasts the orc's turn and ends at the caster's.
  - It checks that every one of the 60 spell-effect writers copying the round clock copies the stamp beside it.
- **`verify-stone-shield`:** follows the new row and the chain of fixes.
- **Version, schema and pack-copy gate pins** raised to 3.707.1.

## Testing

- **Core verify:** all 394 verify scripts at the final commit, in a clean worktree, with the packs restored after each. **All pass.** Four checks in older scripts were re-anchored first (below).
- **Core mutation:** every mutation script that reads a changed file or carries a pin, run in their own worktree: 262 scripts. **262 of 262 pass.** Four had anchors on lines this release reshaped and were re-anchored, then re-run.
- **Re-anchored** (the same rule, on its new line):
  - `verify-session-decisions-1015` D4b (the relay's carried options);
  - `verify-session-fixes-0829` D4 (the sweep refuses what is not due);
  - `mutate-effect-expiry` R3;
  - `mutate-chapter7-critical-211-220` I;
  - `mutate-session-fixes-0829` (three anchors).
- **Not run this release:** the two long whole-tree mutation scripts (`mutate-fixes-3685-3b`, `mutate-checks-read-source`, about 55 min each). They passed on 3.706.1; a run started at 3.707.0 was stopped when the session paused. Not counted.
- **Modules:** every verify script of Pillars of Faith 0.12.6, Inner Tempest 1.0.4 and Eldritch Arts 0.17.2 gives **identical results** on 3.707.1 and 3.706.1. The failures, on both, are:
  - the modules' own version pins;
  - Inner Tempest's missing book file;
  - one Eldritch Arts script that errors on both.
- **Pack:** a record diff against 3.707.0 shows exactly one change: Stone Shield's row gains `foes: 1`. The other packs are byte-identical.
- **Live Foundry:** not yet run. The Test world is on 3.706.1.
