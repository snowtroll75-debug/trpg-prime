# TRG Prime 3.631.0 — Fiends & Fables 3.0, block 1: the Creature Codex automated

9 October 2026. Requires nothing new. Fiends & Fables Prime's creatures pick this up without a module rebuild (see **Codex inheritance**).

Graham's ruling on the block-1 audit (Chapter 2, Creature Abilities, pp. 235–244): "all automated, your recommendation". Of the chapter's 114 abilities, 22 were already automated, 44 were a card that applied nothing and 46 were text nobody read. This release gives every one that can be a mechanism one, by declaring it on the Codex entry and reading it where the rule lives. Nine stay the table's (narrative: Absorb Minerals, Earth Pass, Endless Hunger, Fear of Water, Telepathy, Water Glide, Grave-Touched Presence's attitude step, Blight Sense's filter, Garlic Repulsion's odour itself).

## Codex inheritance by name
- **A creature's copy of a Codex ability now takes the Codex entry's declarations at prepare time**, in memory, never written to the copy. The entry is the source of truth; the copy keeps one thing of its own — a printed sense range (`derives.sense.fixedFeet`).
- Matched on the base name ("Darkvision (55 ft.)" → Darkvision), from the `creature-abilities` pack first and `abilities` second, each read as the federated pack (3.628.0: the system's pack, then every module pack that extends it — a module's Codex additions are entries too). A name twice in one pack inherits nothing; a name both the system's pack and a module's hold resolves to the system's. `codexInherit: false` on a copy opts out.
- The index is built at `ready` and every actor reset, so senses, DR and auras derive from current declarations. The 1,660 ability copies on Fiends & Fables' 294 creatures are current from this release on, and will be after every later one.

## What carries a declaration
- Death guards, after-strikes and always-on Defensive Casting read **the actor's applied effects AND its active ability items** (`declaration-carriers.mjs`). Pillars of Faith declared these on a feat's effect; a Codex ability is an item. An ability marked inactive is a note.

## Rolled auras
- **Declared on the entries:** Stench, Aura of Despair, Frightful Aura (5 ft × level, on entering), Aura of Confusion (10-minute immunity on a Critical), Soulless Aura (24-hour immunity on a save), Aura of Ruin.
- **Aura damage** (`damage: { formula, type, basic }`): Aura of Death (living only), Decay, Fire, Heat, Ashen Aura, Elemental Aura (type from the name — Fiery/Caustic/Freezing/Shocking/Toxic), Infestation. Rolled through the typed-damage path, basic by default: halved on a Success, nothing on a Critical, an extra base die per failed severity.
- **`appliesToTraits`**: Aura of Ruin reaches only a good- or ordered-aligned creature.
- **An inactive ability emits no aura** — Elemental Aura's Free-action off switch is the Active tick.

## The area effect, for any creature
- The 3.629.0 peril effect is now the Codex's area action: `creatureAbility.area` on the entry, rolled and applied from the Use button with the AP spent. Sonic Moan (3d6 sonic, basic Will, 30 ft, a deafened creature immune), Howl (Will; frightened 1/2/3 + fleeing; immune 10 minutes after a save), Paralysing Gaze (Fortitude; stunned 1 / paralysed 1 round / 1 minute with a re-save / 1 minute), Entangling Vines (4d6 piercing basic Reflex, grabbed on a failure), Draconic Roar (the breath's dice, basic Fortitude, once an hour), Crush, Wing Buffet.
- **The rail gained:** damage by rung (Crush's 1d10 → 8d10, Wing Buffet's wing damage, borrowed from a named weapon with BAB dice and Strength), a critical injury by rung (Crush's Minor/Serious/Deadly), a push by rung offered on the card (Wing Buffet's 5/10/20 ft — forced movement is offered, Graham's ruling of 23 August 2026), a size-shifted degree (two sizes larger reads one degree better), `immunitySeconds` windows, DR bypass and resistance bypass (Penetrating Breath), and a record of who took what.

## Breath memory
- A declared area with `breath: true` leaves a record on the breather — each target's degree and damage — for one turn. Riders read it: **Shadow Breath** (blinded by the breath's own degree) and **Slowing Breath** (a Fortitude save, slowed 1/1/2) the moment it lands; **Clinging Breath** and **Scorching Breath** (half the dice again, rounded up, basic Fortitude) at the breather's next turn; **Penetrating Breath** bypasses DR and energy resistance on the breath itself. Scorching Breath is new in 3.0 and authored.
- Fiends & Fables' breath weapons are module abilities; they become rolled breaths when the module declares them (`area: { …, breath: true }`) — block 2's work.

## Compound actions
- One rail, declared on the entry (`creatureAbility.compound`): the AP, movement legs by Speed (armed on the token like Step and Charge, free of AP, with a limit), strikes by weapon name with a bonus, an extra base die, separate-target and MAP rules, a self effect and a cooldown. The strikes are buttons on the action's card and roll through the Strike workflow.
- Diving Strike (fly ×2, Claw +2), Double Strike (two weapons, two targets, MAP after), Draconic Assault (Claw, Claw, a non-claw), Flyby Attack, Swimby Attack, Pouncing Assault (−4 to be attacked until its next turn), Powerful Charge (Stride ×2, Gore +2 with +1 die), Surge of Speed (once every 10 minutes), Torrent of Strikes (six at a fixed −2 MAP).

## The Codex's own actions
- **Constrict** — the Constrict weapon's damage to every creature this one has Grabbed, basic Fortitude each. A Grapple that lands now records who holds the grab (`grabbedBy`).
- **Rend** — the listed attack's damage again when it has hit the same target twice this turn. **Tear Flesh** — the previous Bite's result again, its critical re-rolled. Both read a new six-entry strike log on the creature.
- **Abyssal Healing** — 1 AP, PP up to its level: 1d6 HP per PP, Bleeding −1 per PP, or Injured −1 per 2 PP (max 5).
- **Swallow** — Athletics against the grabbed target's Reflex DC; swallowed: Grabbed, Slowed 1, holding its breath, 2 × the bite as acid now and at each of its turn starts (opposed Level-based basic Fortitude, Very Hard); the escape thresholds printed.
- **Magic Dispelling** — a Dispel at 0 PP, 3/day. **Whispers of the Grave** — the opposed Meditation ladder, the Hard exhaustion check, 24-hour immunity per target.
- **Amorphous Split** — offered: half the HP each, a twin token placed beside it. **Eternal Summons** — kindred eternals 4/6/8 levels lower from the installed compendia, placed adjacent for 1 minute per 5 levels.
- **Trample** — twice its Speed through smaller creatures' spaces (no reactions), then the slam +1 die to each targeted creature, basic Reflex. **Draconic Shifting** — a toggle: its Strikes deal unarmed subdual while shifted.

## After-strikes
- **Life Drain** — on a hit against a living target: healed 3 HP; Fortitude or Soul Drain 5, +5 for each earlier drain by this creature (per target). **Shadow Hand** — on a critical with the Soul Touch: Fortitude (a Partial fails) or 1d6 Soul Drain, 2d6 on a Serious or Deadly. **Dispelling Strike** — a Dispel at 0 PP on every melee hit, the target's active spell effects listed.

## Derives, read where the rule lives
- **Hover / Wingless Flight** — never falls at turn end for want of a Fly action (it did).
- **Slow (I)/(II)** — AP regained each turn is 1/2 lower, meeting Stunned and Quickened the way the page does.
- **Elusive Movement / Smoke Form** — movement never provokes (Smoke Form: a full-Speed move in one action).
- **Hold Breath** — ×10. **Gallop** — a second consecutive Stride is at Speed +10.
- **Eternal Essence** — no ACP, Max Dex or Speed penalty from armour or shields; every Fumble DC −1.
- **Fire Healing** — fire heals half instead, read before immunity and resistance; at full HP, Bleeding −2.
- **Vorpal Weapons** — every melee weapon counts as Vorpal. **Elemental Strikes** — 1d6 secondary of the element on every physical attack; a declared die of that element doubled. **Penetrating Strikes** — a melee attack carrying the `penetrating` trait halves the target's DR (Chapter 6's Penetrating is the ranged trait; the two share a word, not a path). **Secondary Critical** — a weapon with `secondary critical` in its traits opens a second injury one degree down. **Skewering Strikes** — bleed +1/+2/+3 by severity with a spear-group weapon.
- **Pack Attack** — +1d6 precision when two allies threaten the target (the flank's own test). **Monstrous Grab / Knockdown** — +4 racial, no MAP on Grapple / Trip. **Fearful Strength** — Intimidate on Strength when higher. **Spell Resilience** — the class bonus as a racial row on a spell's save and its DB. **Reactive Disarm** — offered on the defender's card when a weapon Strike against it fumbles.
- **Regeneration** — applied at turn start unless the creature took its regeneration's worth of damage since its last turn (a damage record at the shared primitive, cleared at its turn).
- **Plant Resistance** — a critical's bleed and recurring tags land; the rest print for the GM's anatomy call.
- **Arcadian Caster** — casts as Specialist, provokes nothing, may learn arcane and ethereal spells; **True Caster** — any tradition. **Faultless Casting** — always-on Defensive Casting at Medium. **Undead Fortitude** — a death guard (Fortitude; not against essence or a weakness).
- **Alien Mind** — the creator of a mental-trait spell targeting it takes 4d6 mental, basic Will. **Reflective Scales** — a reaction: Dispel against the incoming spell; a Critical reflects it. **Corrode** — secondary damage also hits metal armour (split 50/50 with a metal shield) — item HP. **Elemental Grasp** — a grabbed creature takes 3d6 of the element at its turn start, basic Reflex. **Elemental Blood** — a bleeding creature's blood splashes every adjacent creature for its Bleeding value. **Souldrinker** — on killing a living creature within four levels: healed as a Cure at its level. **Undead Spawn** — the reminder on the kill. **Garlic Repulsion** — the GM marks the token near garlic (`flags.trg-prime.nearGarlic`: "near" / "adjacent"). **Ice Climb / Ice Stride** — ease every difficult terrain (ruling 6: blanket; the terrain rail has no source).
- Acute Sense and Grave-Touched Presence carry their +2 racial rows.

## Hooks a module can listen to
- `trgPrimeCreatureSlain` { victim, sourceName, sourceLevel, deathCase } · `trgPrimeSpellCast` { actor, spell, spellData, degree, targets } · `trgPrimeSecondaryDamage` { attacker, target, amount, type, weapon }.

## Harness
- `tools/declare-ff30-codex.mjs` applies the declarations (`tools/ff30-codex-declarations.mjs`, 85 entries + 2 authored) and is idempotent. `verify-ff30-codex` (79 checks) and `mutate-ff30-codex` (56 mutations, all caught). `structuredClone` added to the known globals.
- The sweep caught two things before they shipped: the peril effect's new rung-damage lookup was read before its declaration (every peril effect would have thrown at its first target — hoisted), and the Codex index read the system pack by literal id (now the federated pack). Nine older harness anchors moved with the code; `mutate-walls-storm`'s F7 anchor had been stale since 3.630.1 and is current again.

## Known limits, stated
- Draconic Roar reads its dice from a declared breath on the same creature; until the module declares its breaths it prints no damage.
- Double Strike's "two different limbs" matches the first weapon twice; Torrent of Strikes' six strikes are six buttons.
- Amorphous Split copies a linked actor as a new Actor; an unlinked token gets a token twin.
- Reflective Scales' reflection prints the instruction; the spell is resolved against the caster by hand.
