# Live testing report: the core spell sweep (3.717.1 installed, fixes in 3.718.0)

27 November 2026. Graham asked: "work on the core rulebook spells now. I know at least two that are not working correctly so it will be good to see what you find."

## How it was run

- **World:** the "Test" world only, with the test creatures `ZZ SW *` on scene "ZZ SW Sweep". The live campaign was not touched.
- **Two sessions at once:**
  - GM "Testing Dude" on localhost.
  - Player "PC Tester" on 127.0.0.1.
- **The sweep:** every one of the **692** core spells, sorted by name, was cast from the **player's seat**. The player owned the six caster creatures (Wizard, Cleric, Druid, Bard, Ranger, Crusader) and none of the targets: Ally, Foe Near, Foe Far, Undead.
- **Choosing a target:** taken from the spell's own fields.
  - Beneficial and willing spells went to the Ally, undead-only spells to the Undead, touch spells to Foe Near, and everything else to Foe Far.
  - An area was placed on the target or the foe.
- **Dice:**
  - The player's d20 was fixed at 19 (so casting succeeds).
  - The GM's d20 was fixed at 4 (so the foes fail their saves and every effect lands).
  - Dice So Nice was patched out in memory.
- **Recording each cast:** the dialogs, every chat card, each test creature's HP and new effects, and any error.
- **GM-seat re-casts:** the spells that failed from the player's seat were cast again from the GM's seat, to see their downstream behaviour. The wall spells were re-cast with a two-click placement.
- **Clean-up:** the test creatures were reset between casts, and the sweep's chat messages were deleted afterwards.

## What happened

| Outcome | Spells |
|---|---|
| Took effect, and the card and creatures agree | 523 |
| **Stopped partway, because a write on the target was refused** | **34** |
| Took effect with no visible change on a creature (notes, or a condition the creature did not meet) | 67 |
| Casting check failed (DC above 39 against a fixed 19; not a defect) | 24 |
| Refused by the test setup (not an animal, beyond range, no material pouch, no creature type recorded) | 26 |
| Timed out in the sweep (all re-run; see below) | 18 |

### The 34 permission failures (fixed in 3.718.0)

When a player cast any of these at a creature they did not own, Foundry refused one write on that creature. The cast had already spent its PP and rolled its save, then stopped with no Result card. The GM's seat never sees this, because a GM can write to anything.

| Write | Spells |
|---|---|
| Attitude | Alluring Caress, Charm Undead, Thrall |
| Conjured item | Bless Water, Power Crystal. The card wrongly said "not in the compendium" |
| Pending modifier | Doubt, Disorient |
| Temporary immunity | False Arrogance, Warp Mind, Word Of Blinding, Word Of Stunning |
| Prison | Flame Prison, Force Prison |
| Other records on the target | Cutting Words, Spell Drain, Serenity |
| Granted Speed | Fly, Earth Glide, Spider Climb |
| Difficult terrain | Entangle, False Mire, Ice Slick, Portal Maelstrom, Solid Fog, Stone Call, Verdant Snare, Warped Terrain, Web |
| Stamp on the condition just applied | Petrification, Speed, Vision Of Havoc, Volcanic Inferno |
| Effect created directly | Stasis |
| Forced movement | Startle |

The same kind of failure affects the blocking walls, with a softer symptom. For Wall Of Stone, Force, Ice and Thorns, a player's cast placed the Region but no Wall segments, and the card said "block movement and sight by hand".

All of these now go through the GM's client: see `release-notes-3.718.0.md`. From the GM's seat, every one of them took effect correctly. For example, Charm Undead read "now helpful toward you (was indifferent)", Fly gave a fly Speed of 30 feet, Wall Of Stone made one blocking Wall, and Startle pushed its target 5 ft.

### Two data defects (fixed in 3.718.0)

- **Nightvision:** "Nightvision declares a malformed ability grant", from both seats. The row named the ability rather than giving its uuid.
- **Conjuration Shield:** casting it rolled a Will save for all seven creatures in its radius, including the caster's allies. That save belongs to a creature that is later conjured inside the area.

### The 18 timeouts were the test runner, not the spells

- **The first seven** (Channel The Aspect, Conjuring Control, Deific Presence, Devotion Blast, Disappearance, Disgrace, Disintegrate) ran while Chrome was throttling the background tab's timers. Re-run with unthrottled timers, all seven completed normally.
  - Deific Presence and Devotion Blast take about 20 s, because each creature caught is offered its reactions.
- **Destructive Roar and Conjuration Shield** were re-run and completed.
- **The nine wall spells** wait for a two-click placement, which the sweep's runner did not perform. Re-cast with one, they behaved as their cards describe.

### Looked at, and not defects

- **Burning Hands:** in the sweep, its card said 3 fire but the Ally's HP did not change. Re-cast, the damage landed (−2 HP, "now 28 HP"). This was a snapshot timing artefact.
- **Healing at full HP** reads "healed 0 HP". That is correct: Cure, Lay On Hands, Death's Defiance and Soothing Ballad were cast on an Ally who was already at full health.
- **False Health** gave 0 temporary HP, because the test Wizard's Intelligence is 0: 0 × 2 = 0. That is correct.
- **Channel The Aspect (Body)** leaves two effects with the same name: the Fortitude bonus, and the Swim-only conditional. This is as designed.
- **Cards that ask for a choice or a second creature** said that nothing applied. The sweep's runner did not make those choices. The spells were Anticipations, Forbidding Ward, Keen Edge, Resistance, Wits, Trade Essence, True Target and Cancel Magic.

## Found, and left for Graham

- **False Health's warp** ("+2 PP: increase the ability score multiplier by x1 (max x5)") is charged and does nothing.
  - It is one of **220 warps** in the pack whose `mods` are empty.
  - Some of those print a "by hand" note, and others do not.
  - Unshakable's touch warp was the same kind of gap until O6.
- **A double-delete notice:** "Item … does not exist!" appeared twice in the GM's session (once for Entangle, once for Force Prison). It came while the test creatures were being reset, which removes effects whose granted items were already gone. It is cosmetic and has not been traced further.

## What 3.718.0 still needs

- Graham's install.
- A player-seat re-cast of the 34 spells, the four blocking walls, Nightvision and Conjuration Shield.
