# TRG Prime 3.667.0

22 October 2026. The core work for Inner Tempest's Block 3 (the Disciple and the Mystic), as Graham ruled on 22 October (B3-1 to B3-5).

- **Install over 3.666.4,** then Inner Tempest 0.4.0, which needs this release.
- **Unchanged and still working:** Inner Tempest 0.3.3, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.** Nothing stored changes shape.

Every addition below is a declaration or a helper a module uses. No core item changes, so a world without Inner Tempest plays as before, with two exceptions:
- the **Versatile B** fix;
- **Alter the Thread's reroll,** which is offered only against a creature that declares it.

## A Defence or Speed bonus that holds only unarmoured or unencumbered

**For:** Disciple's Dodge ("only applied if you are unencumbered and wearing no armour"), Incredible Movement and Serene Defence.

- **The declaration.** An item or effect declares `flags.trg-prime.statBonuses`: a target (`defence` or `speed`), a bonus type, and a value. The value is an ability's total (never below 0), a flat number, or steps by level. The row may also be conditional on `unarmoured` and `unencumbered`.
- **When it is added.** Actor preparation adds the row after armour and encumbrance are known, into the same typed pools as every other bonus. So it shows on the sheet's DB and Speed, it stacks by the Appendix 1 rules, and Flat-Footed strips a dodge row.
- **What counts as armour or a load:**
  - **Armour** is any equipped armour item, helmets and bracers included.
  - **A shield** is its own item type and never switches a row off.
  - **Encumbered** is any encumbrance step, as Instinctive Defence reads it.
- **A declared spell effect** (a spell's `declare` row) may now carry these rows, and check-dialog `conditionals` too. That is how Serene Defence adds Wisdom while sustained, and Reflective Mind gives its one advantage.

## Trained fists

**For:** Powerful Fists ("1d6 rather than the usual 1d4… the versatile bludgeoning trait… an additional point of total unarmed damage… class as magical… cold iron and silver… adamantine").

- **The declaration.** An item or effect declares `flags.trg-prime.unarmedDamage`:
  - **a die and a Versatile letter** for the Unarmed Strike itself. A larger die already on it stays. Fist of Rock still wins where both apply.
  - **a flat per BAB step,** added to the damage total after the dice and named on the card.
  - **what the blow counts as by BAB:** magical, cold iron, silver, adamantine.
- **What counts as unarmed.** The flat and the counts-as reach every Strike that counts as unarmed:
  - the fists;
  - a weapon the core already calls unarmed (gauntlets, brass knuckles, cestus);
  - a weapon with the **Monastic** trait (Inner Tempest, Chapter 6).

  A claw or a bite does not count.
- **A blow of several materials** now meets each of them: a weakness to silver or a resistance bypassed by cold iron.
- **Versatile B is bludgeoning.** "Versatile B" had read as no type at all, because no core weapon printed it. Powerful Fists is the first.

## Strikes that meet DR once

**For:** Flurry of Blows ("If both hit the same creature, apply DR, resistance and weakness only once… you may only inflict one critical injury").

`helpers.runStrikeSeries(actor, strikes, {label})` runs several Strikes through the normal Strike workflow:
- **DR once.** A later hit on a creature the series already hit meets no DR again, and the card says so. Resistance and weakness are proportional, so meeting them on each hit is meeting them once on the total.
- **One critical injury.** After one critical injury has been rolled, a later critical keeps its bonus dice and rolls no injury, and the card says so.
- **The multiple attack penalty** applies to each Strike normally, unlike Double Slice.
- **Disciplined Flurry's third Strike** (ruling B3-4) takes a penalty of 0 but still advances the count.

## A defender's conviction reroll

**For:** Alter the Thread ("You may use Conviction to force an opponent to reroll an attack check against you. Be aware that a Chaos result cannot be rerolled."). Ruling B3-5:
- it is a conviction spend;
- it is used after the roll is seen and before damage;
- the new roll stands;
- it works against any attack roll.

How it works:
- **The declaration.** A creature whose item declares `attackRerollConviction` is asked when a Strike or a spell attack is rolled against it, before it resolves.
- **Who is asked:** whoever plays it, or the GM for a creature nobody connected plays.
- **Volleys:** a volley asks on each ray, for that ray's creature.
- **On a yes:**
  - the point is spent on the defender's own client, after checking it is still available;
  - a Strike is rolled again whole, with no conviction of its own on the reroll;
  - a spell attack keeps its modifiers and takes new dice, because the same check also settled the casting;
  - a card records both totals.
- **Not offered:** on a Chaos result, against your own attack, or without conviction to spend. One point a round keeps one defender to one reroll of a volley. If no answer comes in time, the roll stands.

## An innate spell's own PP allowance

**For:** the Mystic (ruling B3-2). Every discipline spell arrives one PP above the level that grants it (Circle of Warmth at 1st, Fire Bolt at 3rd), and the 1st-level picks include two PP 2 spells.

- **The declaration.** A spell copy may carry `innatePPAllowance`. The innate gate then allows base PP up to level + that allowance.
- **Every other innate spell** keeps the plain limit.

## Damage applied, announced

**For:** Flame Within ("Trigger you take damage… resets when you end your turn without taking or dealing damage") and Dragon's Pulse.

- **The hook.** `trgPrimeDamageApplied` fires once damage has landed, with:
  - the creature and the amount taken;
  - critical and nonlethal;
  - the damage types;
  - the source creature's uuid;
  - a context.
- **The context.** A Strike gives `{kind: "strike", melee, damageType, weaponName}`; a spell gives `{kind: "spell", spellName}`.
- **Nothing fires for zero damage.**

## Helpers

- `helpers.runStrikeSeries` (above).
- `helpers.countsAsUnarmed(weapon)` (above).
- `helpers.basicSaveHit`: one basic save against one creature, by the cast's own rule. For Inner Blast.

## Checks

- **New harness pair:** `verify/mutate-block3-core`, 53 checks and 52 mutations, all caught.
- **The uncalled-export ratchet:** backlog unchanged.
  - Six exports are declared keeps with reasons: the strike series' pure steps and `statRowValue`, which the harness drives, and the two helpers modules reach by dynamic import.
  - Six internal helpers are unexported.
- **Re-anchored, without changing what they test.** These read the Strike and cast code as text, and that code changed shape. The rule each holds is the same:
  - `verify-chapter6-gear-151-160` H3: the bracers' profile reaches the Strike through the trained fists;
  - `verify-chapter6-gear-161-170` B3b: Blunt Arrow is asked before the attack check;
  - `verify/mutate-chapter6-gear-181-190` F11: the struck material reaches the damage;
  - the injury gate (`!noCriticalInjury` added) in `verify/mutate-defence-vocabulary` W4, `verify/mutate-ff30-block17` S10, `verify-ff30-block19` S1 and `verify-ff30-block22` S3;
  - `verify-session-fixes-1022` D10: the defence offer comes before the attack check;
  - `verify/mutate-focus-declarations`: the innate gate takes the allowance;
  - `mutate-damage-categories`: weakness and bypass over several materials;
  - `mutate-unliving-mechanisms`: the Strike's damage call;
  - `verify-thorns` E4 (below).
  - One code order was put back instead: the series' `drWaived` now follows `damageRiders` in the damage call, so `verify-damage-riders` C5 reads as before.
- **Schema stamp:** unchanged at 3.666.4 (no pass).
- **Full sweep: 620 of 621 green.** It ran on a clean stage: the 3.666.4 release plus exactly this release's changed files.
  - **The one failure:** `mutate-thorns` W4 survived. Thorns' check E4 looked for the text `melee: isMelee,`, which the Strike's new damage context also contains, so it no longer proved that thorns are told. E4 is now held to the thorns call.
  - **After the fix:** that pair was rerun on the stage. `verify-thorns` passes its 59 checks and `mutate-thorns` catches all 28 mutations.
- **Inner Tempest 0.4.0's own harnesses** drive these declarations with that module's real items: `verify-block3` (1034 checks) and `mutate-block3` (102 mutations).
- **Not yet tested live.**
