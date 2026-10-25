# TRG Prime 3.666.0

21 October 2026. This release adds the core support for Inner Tempest's Block 2 (Chapter 4, Skills & Actions), as Graham ruled on 21 October. It also fixes core's Nimble Dodge, makes the multiple attack penalty count only in combat, and makes a character's natural attacks always ready.

- **Install over 3.665.1.** Inner Tempest **0.3.0** needs this release. Inner Tempest 0.2.0, Pillars of Faith 0.11.1 and Fiends & Fables Prime 0.45.1 work with it unchanged.
- **There is no migration.**

## Fixes Graham asked for

### Nimble Dodge lasts the one attack, and spends the reaction

The Core Rulebook was signed off as fully automated, and Nimble Dodge was not. Its +2 dodge stayed on the sheet until someone deleted it by hand, and its card said "Reaction spent" without spending anything. Graham's ruling: a reaction to being attacked is declared when you are targeted, and it lasts for that attack.

- **The new mechanism.** An effect may now carry `oneAttack`. The next attack against its bearer that it applies to removes it. Every attack path does this: a Strike, a spell attack, a bomb, a spiritual weapon, and an action resolved against you (a Shove or a Trip). When the attacker's client does not own the defender, the removal goes through the GM.
- **Nimble Dodge now uses it.** In combat it is refused when no reaction is left. Otherwise it spends the reaction and gives +2 dodge until the next attack.
- **Inner Tempest's Evade and Impact Absorption** use the same mechanism.
- **A defence can name one attacker** (`fromUuids`). Only an attack by that creature spends it.

### The multiple attack penalty counts only in combat

Outside combat there is no turn to reset the count, so attacks kept adding to it. Graham ruled that it counts only in combat.

- The count is read and written in one place. Every caller now goes through it: weapon attacks, actions, Double Slice, bombs, spells, the spiritual weapon and mounted combat.
- Outside combat it reads 0 and writes nothing.
- Each combatant's count is cleared when a combat begins.

### A character's natural attacks are always ready

Graham: "Unarmed attacks (natural attacks such as unarmed strike, claw, bite etc). If a character has such an attack, it should always be armed and not take up a hand. At the moment, you have to equip them!"

- **The hand was already right:** a natural attack has always cost no hand.
- **"Equipped" was the problem.** Every attack chooser offers equipped weapons only, and the weapons pack ships its eight natural attacks unequipped. So a Claw dropped on a sheet, or a heritage's natural attack, could not be used until someone clicked the fist.
- **Now** a natural attack on a character, companion or familiar is ready wherever the system asks. It is worked out each time the sheet is prepared, never written, so nothing needs migrating and every attack chooser, reaction and feat agrees at once.
- **The sheet** shows a fixed fist marked "always ready, and it takes no hand" in place of the equip button.
- **A creature (npc) is unchanged.** Its forms switch its strikes on and off through the stored equipped state: the Huanling's Change Shape equips its Bite and Claw only for the spider and the tiger. A Change Shape form on a character still sets aside the strikes it lists.
- **A fumble's "you drop it"** no longer drops a fist or a claw.

## New support for companion modules

| Change | What it does | For |
|---|---|---|
| **A reaction that rolls a skill before a save** | An item or effect may declare `saveBonusReaction` {label, skill, saves, traits, type}. Before a matching save, the player is asked. On a yes, the reaction is spent in combat, the skill is rolled against your Level DC, and the Bonus Check result is added to that save. Negatives count as 0. | Steel the Mind |
| **A defence row against a list of DCs** | A Trip is rolled against the higher of your Acrobatics and Fortitude DCs. A row raising either DC now applies to it, once. Until now a list matched no row at all. | Root the Body (ruled as Storgar) |
| **The Dying Check has a scope** | It carries `actionKey: "dyingCheck"`, so a bonus can name it and nothing else. | Resist Dying |
| **An action's own time ladder** | A registered action may declare `timeLadder` {options: [{key, label, modifier, apCost}], defaultKey}. The existing time dialog offers it. | Centred Balance, Elemental Ward |
| **An action's traits reach its check** | A skill action's check now carries the action's own traits. Before shipping, every existing bonus scoped by traits was checked: none reaches a skill, attack or unarmed check that it did not reach before. | Maintain Clarity |
| **Ward zones** | `helpers.placeWardZone(actor, {label, damageType, weakness, seconds, radiusFeet})` draws a circle Region around the actor's token. Every creature inside has resistance (or weakness) to acid, cold, electricity or fire while it stays inside. The acting GM keeps occupants in step as tokens and wards move, appear or go. The ward ends on the world clock. | Elemental Ward |
| **`outcomesApplied: true`** | Marks an action whose module applies its own outcome rows. The generic readers (bonus or penalty, healing, push, attitude) leave its text alone. Without the mark, a verbatim book row such as Maintain Clarity's "-1 circumstance penalty" would have been applied a second time, unscoped. | All 17 Inner Tempest actions |
| **Helpers** | `bonusCheckModifier` (CRB p.63), `levelDC`, and `reduceCondition(actor, key, by)`. `reduceCondition` lowers a valued condition the way Rally does: never below an area's floor, and removed at 0. | Inner Tempest |
| **Hooks** | `trgPrimeDailyPreparation` {actor}, fired after the daily preparation card. `trgPrimeTurnEnded` {actor, combatant, combat}, fired on the acting GM's client when a turn ends, after stasis. | Elemental Ward's Fumble; "before the end of your next turn" |

**One small change to the card:** "Lasts N rounds — no encounter running, so clear it by hand" now appears only when the action actually applied a condition. Before, every action whose text named a duration printed it, out of combat.

## Checks

- **New harness pairs:**
  - `verify/mutate-block2-core`: 40 checks and 37 mutations, all caught.
  - `verify/mutate-natural-ready`: 13 checks and 11 mutations, all caught.
  - `verify/mutate-map-combat-only`: 17 checks and 12 mutations, all caught.
- **Re-anchored, without changing what they test:**
  - chapter6-gear-171-180 C14g;
  - chapter6-gear-181-190 E13;
  - chapter7-combat-191-200 A8 and A9;
  - scorching-ray M4 and M6;
  - defence-disadvantage's "any" mutation and forced-movement's F3, moved onto the lines this release rewrote.
- **The uncalled-export ratchet:**
  - five new constants and helpers used only in their own file are no longer exported;
  - seven pure rules stay exported for their harnesses, each listed in `uncalled-exports.json` with its reason.
- **Companion modules** run against this release:
  - Pillars of Faith 0.11.1: 10 harnesses, 9,511 checks, all green.
  - Inner Tempest 0.3.0: `verify-block1` 374 checks and `verify-block2` 194 checks, all green; `mutate-block1` 54 and `mutate-block2` 75 mutations, all caught.
- **Full sweep: 611 of 611 green.** It ran on a clean stage: the 3.665.1 release plus exactly this release's 47 files.
