# TRG Prime 3.632.0 — Fiends & Fables 3.0, block 2: Feats, Traits, Runes and the Aligned appendix

10 October 2026. Graham's ruling on the block-2 audit (Chapter 3 and the Appendix, pp. 244–250): "go with your recommendations for all". Audit: `claude/fiends-and-fables-3.0-audit-block2-feats-traits-runes-appendix.md`; rulings: `claude/rulings-fiends-and-fables-3.0-block2-2026-10-10.md`.

## The module's breath weapons are breaths (ruling 16)
- **Core reads Fiends & Fables Prime's breath weapons as declared breaths**, with no module rebuild. Two sources: the dragons' `flags["fiends-and-fables-prime"].breath` (shape, distance, dice, type, save), and the other breathers' printed sentence ("breathes a 20-foot cone of flame that deals 10d6 fire damage; targets make a basic Reflex save"). A printed DC is the DC (Akrexe 20, Dracoral 38). Each rolls and applies from its Use button: AP spent, a basic save per targeted creature, typed damage through their defences.
- That closes 3.631.0's known limit: **Draconic Roar** reads the dragon's breath dice, and **Shadow, Slowing, Clinging, Scorching and Penetrating Breath** have a breath to ride.
- Breaths are read only when the text is unambiguous. Two damage types (the Aetherlings' "1d6 slashing plus 1d6 cold"), a save ladder (Petrifying Breath, Stone Golem), a lingering cloud (Iron Golem), a breath with no basic save named, and the two interim placeholders (Behir, Bulette) stay as cards.

## Feats
- **Enhanced Hearing / Smell / Vision (ruling 1).** The doubling was already applied where senses derive. This release adds the gate: "Any special visual sense" is now a prerequisite the picker checks against the actor's special senses. Enhanced Smell's prerequisite reads *olfactory* (the page prints "auditory").
- **Crimson Covenant (ruling 2).** A critical injury that leaves the character Bleeding 5 or more arms it. Their next weapon attack gains +4 luck, and if that attack deals a critical injury, their bleeding stops. The manual +4 row is retired.
- **Howling Kinship (ruling 3).** +1 circumstance to attacks for the master and their animal companion while their tokens are within 10 ft. The Handle Animal +1 stays.
- **Scaly Resilience (ruling 4), new in 3.0, authored.** When a declared breath reaches the character, the reaction is spent (in combat), the save gains +1 circumstance, and the breath's damage meets a resistance for that one blow. The Dying prerequisite is the GM's.
- **Abyssal Familiar and Nirvanic Familiar (ruling 5), authored.** Each feat has a button that rebuilds the master's familiar from the Quasit or the Cherubim: ability scores, size, speeds, type and traits, abilities, attacks and innate spells. The familiar stays linked to the master, keeps the mirrored saves, attack, skills and hit points, and keeps Empathic Link and the abilities chosen for it.
- **Underwater Marauder.** The core feat a 3.274-era tripwire was holding for the underwater rail: no −2 through the water, and never flat-footed in it.

## Traits
- **Aquatic (ruling 6).** No −2 for bludgeoning and slashing strikes through water. The creature breathes water and holds its breath in air, so the drowning rail is inverted for it at the waterline.
- **Spawn (ruling 8).** The trait arriving on an actor applies Injured 2 once. Its card has a **Fed** button: target the creature fed upon, which must be living and at least half the Spawn's level, and the Injured comes off. The Undead Spawn kill hook records the creator on the victim, and Aligned Control reads its save **one degree worse** against that creator.
- **Swarm (ruling 9).** The module's five swarm attacks ("each enemy in the swarm's space takes 1d6+1 piercing, basic Reflex") read as an area of the swarm's own space, enemies only. The save is asked automatically when the swarm moves onto creatures (only those it newly covers) and at the start of its turn for those it occupies, with no AP spent. The Use button stays for running it by hand. A swarm's damage now halves the target's DR on this path too, and any creature's area effect meets a Swarm's Weakness to area effects.
- Incorporeal's wall passage stays the GM's (ruling 7).

## Runes
- **Submersible (ruling 6)** lifts the melee −2 and the fire failure for its weapon.
- **Swarmed (ruling 12)** rolls its cone through the area rail: one roll of twice the weapon's dice, then each creature's basic Reflex against DC 24/28/32, applied. The thrower is never in its own cone.
- Savage Jaw stays offered as a Reaction (ruling 10). Thornbound's unprinted Reflex DC stays the wearer's Level DC (ruling 11). Dreadcarve, Fleetguard, Shellback, Skyfeather, Ancient Echoes, Vorpal and Wildform are unchanged; every figure matches 3.0.

## The Aligned appendix
- **Sense Aligned (ruling 14)** is a new special action for any creature with an aligned trait. It rolls one Perception check against each sharing creature's Level DC within 60 ft. The table sees how many presences there are and of which trait; the GM is whispered who they are. With Detect Aura running, the detection is active: +1 circumstance, and each aura's strength is reported.
- **Aligned Control (ruling 15)** now rolls the target's opposed Will save and applies it:
  - Controlled for 1 minute or 1 hour on a clock, or permanently, and recorded on the controller's register (the record button is retired).
  - A Critical makes the target immune to this controller until its next daily preparation.
  - The Spawn's shift applies against its creator.
  - A new save is offered when the clock runs out, and whenever the controller or an ally strikes or casts at the controlled creature (the GM judges hostility).
- Aligned weakness stays the declared +50% (ruling 13).

## Hooks
- `trgPrimeCriticalInjury` { attacker, target, severity, tags } and `trgPrimeStrikeRolled` { attacker, target, weapon }.

## Harness
- `verify-ff30-block2`: 39 checks; `mutate-ff30-block2`: 39 mutations, all caught. `declare-ff30-codex` now also declares on the feats pack and authors three feats; it is idempotent.
- The old anchors that moved with the code: chapter 7's B19 and C20, ff30-codex's B10, and general feats' K39/K40 (the tripwire, now two checks with mutations).
- The uncalled-export ratchet went from 523 to 517.

## Known limits
- Coldfire (the Shade Dragons' breath type) is the module's own term, not the book's. It rolls as printed, but its "half resistance" rule is not applied.
- Abyssal and Nirvanic Familiar need the familiar to exist first; the familiar's form name is replaced.
- Swarm riders ("subjected to Filth Fever", "a critical also inflicts bleed") ride on the card for the GM.
