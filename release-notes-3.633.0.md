# TRG Prime 3.633.0, with Fiends & Fables Prime 0.12.0

11 October 2026. Fiends & Fables 3.0, block 3: creature pages 1–10, covering the stat-block rules, the Aboleth, the Aboleth Magi, the Aetherlings and the Avoral. Graham ruled "go with your recommendations" on all fifteen. **Install both:** core 3.633.0 and module 0.12.0, which needs 3.633.0.

## Core 3.633.0

- **Printed innate numbers (R1).**
  - An innate spell can declare its stat block's pair: `flags.trg-prime.innatePrinted = { dc, attack }`.
  - When declared, the cast, the save and the sheet use the printed pair. Without it, they derive 10 + ability + level as before.
  - High Magic's +2 is not added on top of a printed DC.
- **Weapon secondary damage (R2).**
  - A weapon's printed "plus 2d6 good" is declared as `flags.trg-prime.creatureAttack.secondary`.
  - It is rolled as its own damage packet in the strike's secondary-damage loop, beside the rune and ammunition packets, and each target's own defences meet it.
  - An aligned word (good, evil, chaos, order, balance) is aligned damage. It reaches only a creature of the opposing trait, as an Aligned rune does.
- **A weapon's own after-strike, and its own affliction (R3).**
  - An after-strike declared on a weapon fires for that weapon only.
  - Exposing the target looks first for the attacker's own affliction item of that name, at the attacker's level, so the Aboleth's Slime arrives with its printed stages.
- **Cures that reach a curse (R8).** An affliction can declare `counteredAs: ["disease"]`, so a disease counteract reaches the Aboleth's Slime.
- **Mucus Cloud (R7).** Creature auras gain three fields:
  - `emitterState: "submerged"`: the aura is live only while the emitter has the underwater rail's Submerged effect.
  - `exemptTraits`: an Aquatic creature is not "air breathing", so the aura passes it over.
  - `traitEffect`: a failed save grants traits for a while. Mucus-Bound gives Aquatic for 2 hours on the world clock. The breath is settled at once and again when the effect ends: on land, the creature starts holding its breath; in the water, it stops.
- **Breaths with several damage types (R10).**
  - "1d6 slashing plus 1d6 cold" is a breath of two packets. Each is rolled once and met by each target's own defences, and both are halved by the one basic save.
  - The Ice Aetherling's breath now rolls instead of posting a card, as does any other breath worded the same way.
- **High Magic (R12).** `flags.trg-prime.highMagic = true` gives:
  - spell save DC +2
  - Heighten's save reading for free
  - +50 on the Spell Fumble roll
- **Adjusting Level (R13).**
  - A small GM-only box under an NPC's level holds an EL step from −5 to +5.
  - Each step adds +1 untyped to attacks, DB, saves, Spellcraft and every skill, and 8 HP.
- **Extraplanar death (R14).**
  - When a creature with the Extraplanar trait dies, a card says it is destroyed and its essence returns to its home plane. The token is left for you to remove.
  - With Wade Through the Mooks, an Extraplanar mook dies at 0 HP.
  - A new world setting, "Extraplanar creatures are destroyed on death", is on by default; turn it off when the party is on another plane.
- **Condition names.** Chat cards print every condition's own name ("Controlled", "Frightened"), not the lower-case key. This was carried forward from block 2.

## Fiends & Fables Prime 0.12.0

- **R1:** 418 innate spells declare their printed DC and modifier. The Avoral now casts at DC 24 (+14), as printed; it was 19 before.
- **R15:** 214 innate spells that the book prints with no usage, or with only a PP cost, gain the Focus trait. The book: "If no such information exists, then the innate spell is classed as having the focus trait." Among them is the Aboleth's Dominate.
- **R2:** 106 weapon riders are declared as secondary packets:
  - the Avoral's 2d6 good
  - the Fire and Ice Aetherlings' 1d4 fire and 1d4 cold
  - the dragons' elemental bites
  - the rest of the riders that are written as dice

  Six riders also name an ability (for example "plus Shadow Hand"). Their dice now roll, and the named ability is kept as a note for its own block.
- **The Aboleth (R3, R6, R7, R8):**
  - It is Aquatic.
  - Its Tentacle exposes the target to its Slime.
  - Slime is no longer marked manual, and Remove Disease reaches it.
  - Mucus Cloud is a declared aura: 5 ft, live only while the Aboleth is Submerged, Fortitude against its Level DC, Mucus-Bound for 2 hours on a failure, and 24 hours of immunity after a successful save.
- **The Aboleth Magi (R9):**
  - It has been rebuilt as the Aboleth's exact statistics and items: DB 22, saves 16/11/22, HP 191, Tentacle +18 for 2d10+8.
  - It adds the caster block: CL 6, Spellcraft +10, PP 36.
  - It keeps the Learned Spell Repertoire. Its 4 cantrips and 10 spells are left for you to choose, because the book names none.
- **Eternal Essence (R5)** has been added to the Avoral, Luporal, Dracoral and Feloral.
- **Extraplanar (R14)** has been added to the five Aetherlings and all five Agothians (Avoral, Dracoral, Feloral, Luporal, Pyroral).
- **From block 2:** Scaly Resilience no longer carries its manual +1 row. Core has automated it since 3.632.0.

## Where the build differs from the audit, and why

- **R4, Weapon Focus.** The audit proposed having core read the weapon group from the feat's name.
  - Before building it, every Weapon Focus creature's real attack total was measured in the world and compared with the 3.0 book: 47 creatures, 117 attacks.
  - Of the 104 attacks that could be compared, **86 already match the book without Weapon Focus**. The module's calibration accounts for it.
  - The rule as proposed would have put about 70 of those 86 attacks one point above the page. Those are the ones whose weapon is in the named group, the Brawling attacks especially. It was not shipped.
  - Instead, the Avoral's Claw and Wing (+20) and the Banshee's Touch (+31), the only attacks that were exactly one short, carry the printed +1.
  - The other 15 attacks differ from the book by more than Weapon Focus would explain. They will be handled in their own blocks: the giants' Rocks, the Werebear's axes, the Pixie, the Dao's Slam and the Forest Dragon.
- **R1, tradition and casting ability.** The printed pair now decides every DC. So the module does not also set a casting ability on the 72 innate-only creatures, which would have given them a PP pool the book does not print.
- **R9, the "double count".** It is not a core defect. The Magi carried 36 PP in its stored base and also the class table's PP. The rebuild sets the base so the total is the printed 36.
- **R11, the Water Aetherling's Athletics +8.** This is core's +4 circumstance bonus for a swim Speed, on top of the printed +4. It is not a data error, so it is left as it is. The repeated immunity words come from synonyms that core merges ("paralysis" and "paralyzed"), and the change is cosmetic only.

## Checks

- `verify-ff30-block3`: 26 checks. `mutate-ff30-block3`: all 39 mutations caught.
- `verify-ff30-block2` was re-anchored: A3 no longer expects two-type breaths to stay a card.
- `verify-module-block3`: 31 checks on the module's packs, and the module tool is idempotent.
- The full sweep result is in the delivery message.
