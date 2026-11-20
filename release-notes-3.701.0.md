# TRG Prime 3.701.0: the Movement trait on spells, and the Storgar

19 November 2026. Follows 3.700.0 (Skirmish, built in a separate session). Branch `release/3.701.0`.

This work was first built as 3.700.0, at the same time as Skirmish took that number in another session. It now sits on top of Skirmish as 3.701.0. The two changes touch different files.

Graham, 18 November: "Any spell which moves either the caster or a target as part of the casting (such as Misty Step) should have this trait." The audit is `claude/movement-trait-spell-audit.md`. His ruling on its open groups was "Your recommendation", together with a reminder of what the trait means for a Storgar dwarf.

## The Movement trait on 34 spells

Before this release, no spell in the compendium carried Movement. Now these do:

- **The cast moves the caster (11):**
  - Misty Step, Dimension Door, Dimension Shift, Shadow Step.
  - Teleport, Word Of Recall, Plane Shift, Shadow Walk.
  - Shifting Step, Fluidity, Physical Surge.
- **The cast moves a target (15):**
  - Slide, Startle, Gust, Hydraulic Torrent.
  - Telekinetic Manoeuvre, Spectral Grasp, Forceful Strike, Wall Of Blades.
  - Earth Prison, Portal Maelstrom, Punishing Winds, Reverse Gravity, Volcanic Inferno, Wall Of Wind, Levitate.
- **Ruling C1, the spell moves you later in its duration (4):** Blink, Wind Walk, Map Of The Root-knit, Tree Walk.
- **Ruling C2, the spell sends a creature to another plane or space (4):** Banishment, Maze, Divine Decree, Magnificent Dawn.

**Dimension Door:** the book prints **MOVE**, which is not a trait. Foundry had copied it as "Move". It now reads Movement.

**Left off, as recommended:**
- Force Punch, Passwall and Ethereal Jaunt: the movement there is a side effect.
- Teleportation Circle and Gate: portals that creatures walk through themselves.
- Telekinetic Haul, Mage Hand and Call Item: they move objects.
- Command and Coercive Retribution: the target moves with its own actions.
- Snagging Pit, Earthquake and Transmute Rock & Mud: the falling rules move the creature.
- Spells that grant a speed.

**Astral Drift (ruled):** casting a Movement spell does not count as a movement action. This matches the Veilstride ruling that a teleport is not moving. Nothing changes in code: a cast spends its AP without reporting its traits, and a test now pins that.

## The Storgar

Chapter 2: "you gain a +2 racial bonus to all checks to resist being shoved or moved involuntarily. Unfortunately, your attachment to the earth also forces you to make a DC 5 flat check when any friendly spell with the movement trait is cast upon you. If you fail this check, the spell does not work."

Until now nothing carried the trait, so this clause was a sheet note telling the player to roll it by hand.

### The DC 5 flat check is now rolled by the cast

**Who rolls:** a Storgar, when a spell with the Movement trait is cast upon them by themselves or by an ally (same token disposition).

**When "cast upon them" applies:**
- The Storgar is a chosen target.
- The Storgar cast a spell with no targets, such as Misty Step.
- The Storgar cast a spell whose targets line begins "you…", such as Teleport, Word Of Recall, Shadow Walk or Wind Walk. These spells move the caster as well.

**When it is rolled:** after the cast succeeds and before anything lands.

**On a failure:**
- The spell does not work on that Storgar: no effects, and no Teleportation arrival card.
- The card tells you to leave the token where it is.
- The PP and AP stay spent, because the spell was cast.

**Readings flagged for Graham:**
- **The Storgar's own spells count.** "Any friendly spell" includes your own: a Storgar's own Misty Step can fail on a roll of 1–4.
- **Being caught in an ally's area spell doesn't count.** That spell isn't cast upon the Storgar, and failing the check there would protect them from a hostile effect.
- **Enemy spells don't trigger the flat check.** They get the +2 instead (below).

### The +2 against being moved

- **On saves:** a save against a spell with the Movement trait now gets an automatic +2 racial row, for example against Gust, Hydraulic Torrent or Punishing Winds. Such a save is a check to resist being moved involuntarily.
- **Unchanged:** the Shove bonus on Fortitude DC (ruled in August) and the forced-movement table's prompt for pushes that have no save.

**Copies characters already own:** the save row and the flat check both read the heritage by name. Storgar copies already on sheets get them with no migration. The sheet note "Storgar: rooted" now says the cast rolls the check. Its owned copies are repaired, old-value matched.

## Also fixed: a Quickened point "for Move" can pay for Movement-trait actions

**The defect:** the restricted-AP rule read only the word "Move". The book's word, which Swim, Crawl, Stand, Tumble, the jumps and others carry, is "Movement". So a Quickened point restricted to Move or Strike could pay only for Stride and Step. One example is Channel The Aspect's Limbs.

**Now:** both words count, as the movement-AP tally already read them. This was found during the audit.

## Data and migration

- **Pack edits** (`tools/data-fixes.json`):
  - 34 `movement-trait-*` edits to `system.traits`, each old-value matched.
  - `movement-trait-storgar-rooted-note` updates the Storgar note.
- **Owned copies:**
  - 34 `PACK_REPAIRS` entries on `traits`.
  - One `EFFECT_REPAIRS` entry for the Storgar note.
  - All are old-value matched, so a GM's own edit is left alone.
- **Migration:** both repair passes are re-gated to 3.701.0, and the schema is stamped 3.701.0. A world is offered the migration once.

## For the printed rulebook

1. Add **MOVEMENT** to the trait lines of the 34 spells above.
2. Correct Dimension Door's **MOVE** to **MOVEMENT**.

## Companion modules

- **Eldritch Arts:** its Astral Drift reads Movement only from actions, never from spells, so it is unaffected.
- **Fiends & Fables Prime 0.46.2 and TRG Prime Codex 0.2.2:** unaffected.
- **Regression:** Pillars of Faith, Inner Tempest and Eldritch Arts were regression-tested against this release, as the standing rule requires.

## Tests

- `verify-movement-trait-3700` (new): 59 checks.
- `mutate-movement-trait-3700`: 29 of 29 mutations caught.
- `verify-joint-audit-3699`: E9 now accepts a gate floor.
- **Full regression suite:** core 763 of 763 pass, on the merged tree with Skirmish. Pillars of Faith 11 of 11. Inner Tempest and Eldritch Arts are unchanged from their 3.697.0 baseline (TRG_CORE_TEST_REPORT.md §12).
- **Owed:** a live test in the Test world once installed.
