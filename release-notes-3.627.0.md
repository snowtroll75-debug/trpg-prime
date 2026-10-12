# TRG Prime 3.627.0 — what the Unliving needed

7 October 2026. Built on 3.626.1, for *Pillars of Faith* Chapter 9 (The Unliving), which ships as Pillars of Faith 0.9.0 (`pillars-of-faith-release-notes-0.9.0.md`). The audit is `pillars-of-faith-chapter9-audit.md`.

Every change below is opt-in: a module, or a core item, declares it. Nothing declared before this release behaves differently, with three exceptions, each a defect: owned module feats were never hidden in the picker; a strike rider's condition ignored its gates; and a disease never dealt its stage damage.

## Graham's rulings, 7 October 2026

- **The Unliving Lich is Level 12**, as its entry prints. The chapter introduction's "10th" is the slip.
- **Auras roll their saves where they declare their conditions.** This is opt-in. The Codex's own creature auras stay as cards: Frightful Aura, Stench, Aura of Despair and the rest are untouched.
- **Sunlight is the GM's word.** A scene can be marked Sunlit or Not sunlit, and a token can override its scene (in sunlight, or in shade).
- **Zombie Plague and Ghoul Fever come from Fiends & Fables.** Graham supplied the statistics.

## Feat gates and exclusive groups

These live in `module-api.mjs`, `picker-filters.mjs` and `documents/item.mjs`.

- **`registerFeatGate(trait, feats)`.** A feat carrying the trait is offered only to an actor owning one of the named feats. A feat that is itself one of the openers is not kept behind its own trait, since the Unliving archetypes print "ARCHETYPE UNLIVING" themselves.
- **`registerExclusiveFeats(group, feats)`.** Once one feat of the group is owned, the picker hides the rest. A second is refused on creation, beside the second-aspect refusal; `options.trgAllowExclusiveFeat` lets a deliberate script through.
- **Owned module feats are hidden now (defect).** The picker's owned-exclusion only recognised `Compendium.trg-prime.*` sources, so any feat picked from a module pack could be picked again. That includes every Pillars of Faith feat since 0.4.0. It now counts every pack federated into the slot's logical pack.
- **The module API's `helpers` gain `healActor` and `rollCheck`.**

## Death guards

These live in `combat/death-guard.mjs` and `death-guard-workflow.mjs`.

**What it does.** `flags.trg-prime.deathGuard` covers "if damage would reduce you to 0 HP…". It is asked in `applyDamageAndCheckDying`, after subdual and before destruction, massive damage and Dying. A guard either:
- **rolls** (Unliving Fortitude, Zombie Fortitude): an opposed, level-based save, meaning the defender's Fortitude against the attacker's Level DC (the core precedent is Resilience of Stone), or the defender's own Level DC when there is no attacker; or
- **asks** (Gaseous Escape, once a day).

**Exceptions.** A guard can except damage types and the creature's own weaknesses. For that, the primitive now carries the blow's `damageTypes` and its `sourceLevel`/`sourceName`:
- the weapon hit, rune packets, typed damage and the spell attack and save paths pass them;
- the relay carries them across;
- a guard on a path that doesn't report a type says so on its card.

**On success.** The creature is left at 1 HP. A guard's `spell` (Gaseous Form) is applied to the creature from the spell's own rows. A daily guard renews at daily preparation (`declaredUsedToday`).

**Save bonuses.** The guard's save carries the action key `deathGuard`, so Zombie Fortitude's +2 is an ordinary conditional.

## After a strike

- **Declared after-strikes** (`combat/declared-after-strikes*.mjs`).
  - **What.** A rune's after-strike save, declared by a creature rather than a blade, via `flags.trg-prime.afterStrikes`.
  - **Gates.** Named weapons (`weaponNames`), and `onCriticalInjury`, meaning a critical on a target not immune to criticals.
  - **DC.** `dcBySeverity` (Paralytic Touch: +2 Serious, +5 Deadly).
  - **Conditions.** Each carries its own clock: rounds (6 seconds of world time outside combat), minutes, none for "permanently", or `endsWith` another condition. An end-of-turn escape save goes on the core's `conditionSave` rail.
  - **Exposure.** `expose { affliction, level: "actorLevel", oncePerDay }` hands a copy of a named affliction, at the attacker's level, to the core's `exposeToAffliction`. Once a day per creature means 24 hours of world time.
- **`onFell`.** Healing for reducing a living creature to 0 HP with a named attack (Hunger Beyond Pain); level + an ability modifier, with a minimum, once a round.
- **Living creature.** `isLivingCreature` is exported (`kind-targeting.mjs`), and **Unliving** joins Undead and Construct as not living. Only Pillars of Faith registers that trait.

## Strikes

- **Damage-type options** (`combat/strike-type-options.mjs`).
  - `flags.trg-prime.strikeTypeOption`: Essence Attacks' "you may have the attack deal essence damage instead".
  - Asked in the same dialog as Versatile, before the roll, on the Strike and on the standalone damage roll.
  - An option declared `magical` makes a strike of that type a magical source.
- **Riders.**
  - A strike rider may be gated on its strike's type (`whenDamageType`, Grave-Cold Touch).
  - Riders are read from `appliedEffects`, so a feat's transferred effect counts. Before, a feat had to copy its rider onto the actor through a Use.
  - A weapon may declare riders of its own (`flags.trg-prime.strikeRiders`), as Bony Hand's 1d6 essence does.
- **Rider conditions ask their gates (defect).** `applyRiderConditions` put a rider's condition on every hit with any weapon, whatever its `weaponNames`, `onCritical` or target gates said. It now asks the same question the damage half does (`riderConditionReaches`).

## Saves, casting, jumping, breathing

- **Save conversion** (`magic/save-convert*.mjs`).
  - What: Iron Will of the Tomb's "treat the failed save as a success" — a Failure, Fumble or Blunder, at a declared cost (slowed 1), once a round.
  - When: offered after every reroll offer.
  - Traits: where the save names none, the dialog says what the benefit answers and the table decides.
  - Not while unconscious, paralysed, petrified, stunned or dying.
- **Always defensive** (`magic/defensive-casting.mjs`, `casting-dc.mjs`). Faultless Casting makes every cast defensive at +0. The card names it, and the core +5 is not added as well.
- **Spell save DC bonus by trait** (`magic/spell-dc-bonus.mjs`). Soul-Magic Dominion's +1 racial on a soul spell, as a named part of the save DC. It doesn't apply to an item's spell.
- **Natural Leaper** (`jumping.mjs`).
  - A High Jump within half land Speed, or a Long Jump within land Speed, needs no check.
  - The Long Jump also takes no action.
  - The run-up never doubles the DC.
  - A creature is a Natural Leaper when it declares `naturalLeaper` or owns an item named Natural Leaper, so the Codex's text-only Natural Leaper now works.
- **Granted spell uses** (`grants-workflow.mjs`). A granting item's `grantedSpellUses` sets a granted spell's `usesPerDay`. That is how Poltergeist Hurling's at-will cantrip keeps the Focus trait off.
- **Does not breathe** (`drowning-workflow.mjs`). A creature declaring `doesNotBreathe` holds no breath.

## Drink Blood, automated

`drink-blood*.mjs`; a named automation, so the Codex's vampires use it too.
- The requirement is read from the target's conditions: grabbed, immobilised, paralysed, unconscious, or willing (asked).
- A grabbed target needs the drinker's Athletics against the target's Fortitude DC.
- The target takes Soul Drain 10 plus declared bonuses (Blood Renewal's +5, +10 from 12th level).
- The drinker heals what actually landed.

## Rolled auras and sunlight

**Rolled auras** (`creature-auras.mjs`, `creature-aura-workflow.mjs`). An aura declaring `conditions` per degree has its save rolled — against the emitter's Level DC unless one is printed, carrying the aura's traits — and the degree's conditions applied.
- `livingOnly` passes over undead, constructs and Unliving.
- `immunityOn: "success"` honours "a creature that saves is immune"; the default stays the Codex's "regardless of the result".
- The partial window drops only its named effect (Aura of Despair's paralysis, "but not the fear").
- A Blunder's collapse to 0 HP is a row keyed `zeroHP`.

**Sunlight** (`sunlight*.mjs`).
- A Sunlight field on the scene's config and on the token's.
- At turn start, Sunlight Weakness is applied in the sun (injured 2, slowed 2) and lifted in the shade, along with Vulnerability's essence damage. The values held before are restored, unless something else has since raised them past the sun's.
- The mark changing on the scene or the token lifts it at once.
- A scene marked neither keeps the old card.
- Fast Healing declared `suppressedInSunlight` heals nothing in the sun.

## Afflictions

- **A stage may name its damage type.** It is still poison when it doesn't, which is every affliction written before this. Ghoul Fever and Mummy Rot deal essence.
- **A disease's stage damage is now dealt (defect).** Only a poison's ever was: the damage half was reached only through a poison's own record.

## A player's strike on the GM's creature

Each of the new effects that writes to somebody else's creature does so on a client that may.

- **Conditions.**
  - An after-strike's conditions go through the GM relay (`relayConditionTags`), as do Drink Blood's Soul Drain and a module's siphon (the new `helpers.applyConditionTagsTo`).
  - An escape save now rides the condition's own tag: `conditionSave` on a tag is stamped by `applyConditionTags` itself, wherever the condition lands. Before, the caller had to stamp it afterwards, which needs write access.
- **Afflictions.**
  - A new relay action, `target.affliction`, marks the once-a-day exposure and hands the copy to `exposeToAffliction` on the GM's client.
  - Anything that is not an affliction item is refused, so a forged payload cannot put an arbitrary item on somebody else's sheet.

## Harness

| Pair | Checks / mutations |
|---|---|
| verify/mutate-feat-gates | 33 / 13 |
| verify/mutate-unliving-mechanisms | 73 / 46 |
| verify/mutate-rolled-auras-sunlight | 22 / 13 |

Anchors on lines this release changed, re-anchored:
- verify-block37-weapons I4 (the `strikeIsMagical` expression gains the type option);
- verify-magical-attacks C1 (the same);
- verify-sacrificing-shield L3 and its mutation (the relayed options carry the guard's fields);
- verify-strike-riders F3/F6 and mutations R2/R4 (`applyRiderConditions` takes the strike's context);
- mutate-casting-dc (the declared-bonus loop follows the Wizard School line);
- mutate-chapter10-331-340 K (Unliving joins the non-living kinds);
- verify-chapter6-gear-181-190 D2/D5 (the stage damage type and the disease line).

The rules-have-callers backlog is unchanged (524). The full sweep's result is stated with the release.

## Observations for Graham (core, outside this block)

- **The Undead creature type is missing its disease immunity.** Its description lists disease; its immunity effect does not.
- **Priestly Path is in the archetype progression waiver list.** The book and the chooser's own card both say its progression must be completed before another archetype.
- **Exposure from a player's strike writes to the target directly**, as a poisoned blade's always has. A player who does not own the NPC may be refused by Foundry; the GM's own strikes are unaffected.
