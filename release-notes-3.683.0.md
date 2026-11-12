# TRG Prime 3.683.0

3 November 2026. The seams Eldritch Arts' Block 5 (Chapter 5's racial and general feats) needs: C1–C19 in `ELDRITCH_ARTS_BLOCK5_AUDIT.md`, as Graham answered it the same day ("as proposed", except Q58 and Q59). Built on 3.682.3.

- **Install over 3.682.3** (or 3.682.1/3.682.2). No migration, and no world data changes.
- **Eldritch Arts 0.8.0 needs it.** Eldritch Arts 0.7.1 and Inner Tempest 1.0.4 run unchanged on it.

## For every world

- **Heritage and "Level N only" prerequisites are now enforced in the feat picker** (C1, Q57).
  - **"Name Heritage":** a feat with this prerequisite is offered only to a character with that heritage. "Azgar heritage or Elarni heritage" accepts either. The clause is gated only when every name is a heritage that exists; anything else still fails open, as before.
  - **"Level N only":** offered only at level N or lower.
  - **Core feats this now gates:** Fire-Like Blood, Arctic Elf, Necrotic Resilience, Tusks and Beastman, which Graham approved. **Charismatic Caster** ("Cha +2, Level 1 only") is gated too.
- **High Magic and Forbidden Magic** (Q58, Graham: "Ascendan suffer penalties for High Magic (as it combines all magic)").
  - **What changed:** against a High Magic cast, a target's save reads every tradition (`spellSaveTraditions`). So does the beneficial-spell Will save (`beneficialSaveRequired`). Today's code read only the spell's own tradition field, so a High Magic cast of an arcane spell escaped the Ascendan's −2.
  - **Where it reaches:** the spell save, a follow-up save, Sanctuary's and Visage of Horror's saves, and the beneficial save. Wards placed before this release keep their old behaviour.
  - **Q59, the exception:** a target owning anything flagged `forbiddenSparesHighMagic` (Eldritch Arts' Unbound) is spared. Against a High Magic cast, Forbidden Magic doesn't apply to it at all.
  - **Unchanged:** the Ascendan's own High Magic casting (3.680.0's bypass of the tradition gate).
- **Spell Recognition names itself** (C11, a fix). Its roll now carries `actionKey: "spellRecognition"` and its skill as `subject`. So conditionals, fumble rerolls and check reactions reach it; Eldritch Arts' Esoteric Insight never could.
- **Shadow Stance is a stance** (C19, a fix). Its effect carries the `featStance` flag, so "while in any stance" rules (Tranquil Mind, Inner Tempest's Martial Affinity) see it. A later stance ends it, and it ends an earlier one. It keeps its name, which the attack workflow reads.
- **Spell and storm terrain is marked as magical** (`flags.trg-prime.magicalTerrain`, C16). Plain `ignoresDifficultTerrain: true` (Wild Stride) still eases it, as before.

## New seams (for modules)

| # | Seam | What it does |
|---|---|---|
| **C2** | **Check reactions** | `before(ctx)` may answer `modifiers: [{label, value, type}]` (applied before the dice, carried on a reroll) or `declare: "success"` (exactly a Success, the dice don't count, the check locked; no later reaction is asked). ctx gains `isArea`, `saveSource`, `sourceUuid` and `attackMode`. |
| **C3** | **A spell-only defence offer** | `registerDefenceOffer({ against: "spell" })`, and the one-attack flag `{ against: "spell" }`. |
| **C4** | **Light level** | A conditional axis `when.lightLevels` (a level, a list, `{min, max}`), read from the ambient light at the roller's own token (1–10, Dim Light 5), not raised by darkvision. A roll with no token matches nothing. `helpers.lightLevelAt(token)`. |
| **C5** | **Water and falling** | `helpers.isUnderwater(token)`; `helpers.rollFalling(actor, {distance})`, with no dialog when a distance is given. |
| **C6** | **Per-die spell damage** | A `spellDamageBonus` row with `perDie` (and `damageTypes`) adds per die to every matching pool a cast rolls: the attack and its critical dice, the secondary, saves, ladder rungs and the immune alternate. Not recurring damage, nor the vs-trait "holy half". `helpers.spellDamagePerDieBonus(actor, {type, dice})`. |
| **C7** | **Death guard `healTo`** | `{ level: true, ability: "wisdom" }`: HP = level + that ability (minimum 1, at most max HP), in place of 1. |
| **C8** | **`registerDyingRecoveryModifier`** | Waives the fatigue for leaving Dying. ctx is `{actor, route, hp, fatigued, unconscious}`. |
| **C9** | **`registerDispelModifier` (D10)** | `offer(ctx)` returns a label, `ppFactor`, `ppReduction`, `ppReplace`, `difficulty`, an own `outcomes` ladder, `focus` and `modifiers`; an optional offer is a tick on the Dispel prompt. `onResult(ctx)` follows the outcome. PP paid: a replacement spends none; a reduction comes off the declared (minimum 1); a factor rounds up whatever the degree. The cheaper of the factor and Dispel's own half is paid; they don't compound. Counter Spell's free Dispel carries `counterSpell: true`. |
| **C10** | **The upgraded degree** | `trgPrimeActionResolved` carries `resolvedDegree` beside the raw `degree`. |
| **C12** | **Control levels** | `flags.trg-prime.controlLevelBonus` on feats, abilities, equipped items and effects adds after the cap. |
| **C13** | **Outside memorisation** | A spell flagged `memorisationFree` is outside the memorisation count. |
| **C14** | **Cast options** | The degree remap is told `highMagic` and `castOptions`. A cast option may cost AP, which is asked of the pool once, spent with the cast's AP in combat, and refunded with it. |
| **C15** | **Sniping on a spell critical (D14's half)** | For an owner of `spellSniping`, a spell attack's critical within the cast's warped range opens Sniping, as a ranged weapon's first-increment critical does (Q86). |
| **C16** | **Magical terrain only** | `ignoresDifficultTerrain: "magical"` eases a path only where its costing ground is magical. |
| **C17** | **Movement this turn** | `helpers.movementThisTurn(actor)` → `{ feet, apOnMovement }`. Ruler feet this turn, excluding teleports; AP from the movement pools and from Movement-trait actions. Zero outside combat. |
| **C18** | **Incorporeal passage** | A mover with an active `incorporeal` granted trait may pass through occupied squares, but may not end there. |
| **C19** | **Shadow Stance for a module** | `helpers.enterShadowStance(actor, { apCost, ignoreOpen })`. |

## Found in review (independent, before release)

- **Fire-Like Blood was never gated.** Its shipped text is "Azgar heritage or Elarni heritage, Level 10". It was read as one name and passed open. Each alternative is a heritage now, and the harness uses the shipped text.
- **A cast option's AP asked "Not enough AP" twice** when the pool could not cover the cast alone. It asks once now.
- **A Dispel card's label** said "half of 6" when a reduction had made it half of 4. It names the reduced figure now.
- **The per-die bonus's comment** claimed the "holy half". That pool keeps its own roll; the comment says so.
- **Noted, not changed:**
  - A shift-click Dispel skips the prompt, so no modifier applies; it spends no PP today either.
  - A path crossing both magical and mundane terrain isn't eased by "magical".
  - Terrain laid before this release carries no mark, so it counts as mundane.

## For Graham

- **Q58's reach:** an Ascendan without Unbound now makes the Will save against its own beneficial High Magic spell cast on itself. Any tradition-scoped bonus also sees every tradition against a High Magic cast. Both follow the ruling. Say if either should differ.
- **C6 counts a critical's extra dice** as "dice rolled" for Emberborn Fury and Elemental Apotheosis.

## Harness

- **Four new pairs:**

  | Pair | Seams | Checks | Mutations, all caught |
  |---|---|---|---|
  | `verify-ea-block5a-core` | C1–C3, Q58/Q59 | 66 | 47 |
  | `verify-ea-block5b-core` | C4, C5, C16–C19 | 59 | 39 |
  | `verify-ea-block5c-core` | C6–C8 | 50 | 42 |
  | `verify-ea-block5d-core` | C9–C15 | 71 | 67 |

- **Re-anchored at moved code, not weakened:**
  - `verify-block5-core` D4, `verify-block3-core`, `verify-offered-conditionals` C4 and `verify-ea-block3b-core` W28, with their mutation anchors: the reroll carries the reaction's modifiers.
  - `verify-automation-pass` B8/D8, `verify-block34` and `verify-unliving-mechanisms` A14: the death guard's options.
  - `verify-chapter4-skills-91-100` G2b, `verify-haunt-perils` F2/F4, `verify-ea-block2b-core` (O applied) and `verify-pending-cast`.
  - `verify-chapter2` I6–I8 and J17–J18, `verify-general-feats-131-140` K16 and `verify-classes` J6.
  - `verify-spell-range` X1: the gate's own line, now that Sniping reads the same range.
  - `verify-spell-maneuver` H9b: the injury gate, with Sniping's facts between.
  - `verify-block39-traits` A7: the AP stamp, now that the movement record writes the turn too.
  - The mutation anchors in `mutate-ea-block1-core`, `mutate-ea-block3b-core`, `mutate-hide-from-animals`, `mutate-session-fixes-1022` and `mutate-block39-traits`.
- **Version pins** moved to 3.683.0 in 23 mutation files. `system.json`'s download names v3.683.0.
- **Uncalled-export ratchet:** the backlog shrank to 511 (`usesPoolItem` gained a caller). New keeps carry their reasons.
- **Full sweep** (the list `tools/verify.mjs` runs: 681 harnesses with the four new pairs, in two shards on two copies checked identical to the source): **681 of 681 passed.** An earlier run found the five stale mutation anchors listed above; each was re-pointed and rerun before this final run.
- **Eldritch Arts 0.8.0 on 3.683.0:** `verify-block1`–`5d` all green, and every block's mutations caught.

## Packs

- Unchanged. The release ships the 3.676.1 pack files byte for byte.
