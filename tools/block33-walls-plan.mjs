/**
 * block33-walls-plan — what 3.610.0 writes to the spells pack, as data.
 *
 * The last of block 33 (pages 331–340): the nine walls (Graham's R9 of
 * 1 October 2026, "As recommended" — placed anywhere in range and turned,
 * the printed riders, real Foundry Walls for the walls that block, HP by
 * hand) and Storm Of Vengeance (a mode at the cast and at each Sustain).
 *
 * WHOLE FIELDS ARE REPLACED, as every plan before this one.
 */

const note = (text) => ({ kind: "note", text });
const lengthWarp = { ppCost: 2, text: "increase the length of the wall by 10 feet or its height by 5 feet", mods: { wallLength: 10 } };
const sectionHpWarp = { ppCost: 2, text: "the HP of each section increase by 5", mods: { wallHp: 5 } };

export const PLAN = {
  "Wall Of Blades": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "2 inches", snap: "centre",
        crossing: true, stopsOnFumble: true, turn: "endOfTurn" },
      note("The wall provides cover — by hand. A creature in the wall's space that succeeds at its save "
        + "when the wall is created is pushed to the nearest space on the side of its choice — move it by hand.")
    ],
    warps: [
      { ...lengthWarp, text: "increase the length of the wall by 10 feet or its height by 5 feet" },
      { ppCost: 2, text: "increase the damage by 1d8", mods: { damageDice: "1d8" } }
    ]
  },
  "Wall Of Fire": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "5 feet", snap: "centre",
        forms: ["line", "ring"], ringRadius: 10, crossing: true, turn: "startOfTurn", screen: true }
    ],
    warps: [
      lengthWarp,
      { ppCost: 2, text: "increase the radius of the ring by 5 feet", mods: { wallRadius: 5 } },
      { ppCost: 2, text: "the damage increases by 1d6", mods: { damageDice: "1d6" } }
    ]
  },
  "Wall Of Force": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "no discernible thickness", snap: "border",
        block: { move: "normal", sight: "none", light: "none", sound: "none" }, unobstructed: true,
        sections: { size: 0, db: 0, hardness: 30, hp: 60 } },
      note("Immune to critical hits and precision damage. Blocks incorporeal and ethereal creatures; teleportation "
        + "and visual effects pass. Immune to counteracting of its level or lower; destroyed by a disintegrate spell "
        + "of any level, a rod of cancellation or a sphere of annihilation — by hand.")
    ],
    warps: [
      { ppCost: 1, text: "the HP of the wall increases by 5", mods: { wallHp: 5 } },
      lengthWarp
    ]
  },
  "Wall Of Ice": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "1 foot", snap: "border",
        forms: ["line", "ring"], ringRadius: 10,
        block: { move: "normal", sight: "normal", light: "normal", sound: "normal" }, unobstructed: true,
        sections: { size: 10, db: 0, hardness: 5, hp: 40 } },
      note("Immune to critical hits, cold and precision damage; weakness to fire. A section destroyed by fire melts "
        + "away; one destroyed otherwise leaves chilling ice that is difficult terrain and deals 2d6 cold to a "
        + "creature passing through it — by hand.")
    ],
    warps: [
      sectionHpWarp,
      lengthWarp,
      { ppCost: 2, text: "increase the radius of the ring by 5 feet", mods: { wallRadius: 5 } },
      { ppCost: 4, text: "the cold damage dealt to creatures crossing a destroyed section increases by 1d6", mods: {} }
    ]
  },
  "Wall Of Light": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "5 feet", snap: "centre", crossing: true },
      note("Sight-based checks made through the light take −30 — by hand.")
    ],
    warps: [
      lengthWarp,
      { ppCost: 2, text: "increase the damage by 1d8", mods: { damageDice: "1d8" } }
    ]
  },
  "Wall Of Stone": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "1 inch", snap: "border",
        block: { move: "normal", sight: "normal", light: "normal", sound: "normal" }, unobstructed: true,
        sections: { size: 5, db: 0, hardness: 14, hp: 50 } },
      note("Immune to critical hits and precision damage. A destroyed section can be crossed, and its rubble is "
        + "difficult terrain — by hand. A wall that is not vertical (a bridge, stairs) is drawn by hand.")
    ],
    warps: [sectionHpWarp, lengthWarp]
  },
  "Wall Of Thorns": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "5 feet", snap: "centre",
        block: { move: "none", sight: "limited", light: "none", sound: "none" }, unobstructed: true,
        sections: { size: 5, db: 0, hardness: 5, hp: 20 } },
      { kind: "difficultTerrain", target: "area", label: "Wall Of Thorns" },
      { kind: "hazard", target: "area", label: "Wall Of Thorns", damage: "2d8", damageType: "piercing" },
      note("Both sides of the wall have cover from the other — by hand. It grows over one minute. A destroyed "
        + "section can be crossed freely.")
    ],
    warps: [
      sectionHpWarp,
      lengthWarp,
      { ppCost: 2, text: "the piercing damage dealt to creatures crossing a destroyed section increases by 1d8", mods: {} }
    ]
  },
  "Wall Of Wind": {
    effects: [
      { kind: "wall", target: "area", length: 20, height: 10, thickness: "5 feet", snap: "centre", wind: true },
      { kind: "difficultTerrain", target: "area", label: "Wall Of Wind" },
      note("Gases, and creatures in gaseous form, cannot pass. A creature flying through it saves Fortitude: "
        + "Critical moves normally; Success moves, the wall difficult terrain; Failure its movement stops; Fumble "
        + "stopped and pushed 10 feet away — by hand.")
    ]
  },
  "Wall Of Dispelling": {
    effects: [
      { kind: "wall", target: "area", length: 40, height: 20, thickness: "2 inches", snap: "centre" },
      note("An invisible wall: it counters spell effects that pass through it — by hand.")
    ],
    warps: [lengthWarp]
  },
  "Storm Of Vengeance": {
    // No save of its own: each strike carries one. The area stays the stat
    // line's "360-foot radius", which with a range is already aimed.
    defence: "",
    damage: { formula: "", type: "", persistent: "" },
    effects: [
      {
        kind: "storm", label: "Storm Of Vengeance",
        modes: [
          { key: "acidRain", label: "Acid Rain", formula: "4d8", type: "acid" },
          { key: "hail", label: "Hail", formula: "4d10", type: "bludgeoning", save: "fortitude", basic: true },
          { key: "lightning", label: "Lightning", formula: "4d12", type: "electricity", save: "reflex", basic: true, bolts: 10 },
          { key: "rainWind", label: "Rain and Wind", terrain: true, screen: true },
          { key: "thunderclap", label: "Thunderclap", save: "fortitude", condition: "deafened",
            duration: "10 minutes", immunity: "1 hour" }
        ]
      },
      note("Gales: ranged weapon attacks in or through the storm take −4 (applied). The air is greater difficult "
        + "terrain for flying creatures — by hand.")
    ]
  }
};

/** The fields each spell's plan writes — what the pack-repair manifest must cover. */
export function plannedFields() {
  const out = {};
  for (const [name, fields] of Object.entries(PLAN)) out[name] = Object.keys(fields);
  return out;
}
