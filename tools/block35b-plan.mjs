/**
 * BLOCK 35, PART TWO (pages 351–360) — what the pack should hold for the
 * spells 3.614.0 builds.
 *
 * Graham's rulings of 2 October 2026 on claude/audit-pages-351-360.md:
 *   R2  Stasis — the time-stop itself; targeting only warns
 *   R6  Unity
 *   R7  Zealous Battlecry — "automate as stated"
 *   R8  Renewal's Touch's turn options — "build it"
 *   R9  Wellspring Of Valour's heal on damage
 *   R10 Nature's Bounty's food
 *   R11 Precious Metals
 *   R15 Wild Morph's movement warp (the special ability stays the table's)
 *
 * WHOLE FIELDS, NOT MERGES — see author-block34-spells.mjs.
 */

export const PLAN = {
  // R2 — the Failure and Fumble rungs; the Success rung is 3.613.0's.
  "Stasis": {
    effects: [
      { kind: "condition", target: "targets", condition: "stunned", value: 1, onSave: ["success"] },
      { kind: "stasis", target: "targets", label: "Stasis", onSave: ["failure"], rounds: 1 },
      { kind: "stasis", target: "targets", label: "Stasis", onSave: ["fumble"], rounds: 3, saveEachTurn: true },
      { kind: "note", text: "An inanimate object that is unattended automatically fumbles its save — the table applies it." }
    ]
  },

  // R6 — cast from inside an ally's save; see magic/save-reaction-spells.mjs.
  "Unity": {
    effects: [
      { kind: "note", sheetCastOnly: true, text: "Cast in answer to a saving throw: when you and allies within 30 feet are made to save against the same spell or ability, an ally's save offers Unity before the dice, and each ally may then use your save modifier instead of its own. Cast from here it has no save to answer." }
    ]
  },

  // R7 — offered as initiative is rolled; see combat/zealous-battlecry.mjs.
  "Zealous Battlecry": {
    effects: [
      { kind: "note", sheetCastOnly: true, text: "Cast as initiative is rolled: when you and an ally within 10 feet are about to roll, your initiative roll offers Zealous Battlecry, and both of you then use the higher d100. Cast from here there is no initiative to answer." }
    ]
  },

  // R8 — the turn options, and the warps that feed them.
  "Renewal’s Touch": {
    effects: [
      { kind: "heal", target: "targets", formula: "2d8 + 16" },
      {
        kind: "turnOptions", target: "targets", label: "Renewal’s Touch", apCost: 2,
        heal: "1d8 + 8", bleed: 1, reduce: { fatigued: 1 }, recovery: true,
        unlockable: {
          injuredOption: { injured: 1, dazed: 2, weakened: 2 },
          soulDrainOption: { soulDrain: 5 }
        }
      }
    ],
    warps: [
      { ppCost: 2, text: "increase the healing by 1d8+8", mods: { healDice: "1d8", healBonus: 8 } },
      { ppCost: 2, text: "target may reduce bleeding by an additional 1", mods: { bleedBump: 1 } },
      { ppCost: 2, text: "the target may also reduce the injured condition by 1 or the dazed and weakened conditions by 2", mods: { unlocks: ["injuredOption"] } },
      { ppCost: 2, text: "reduce the fatigued condition (or another condition if you have used that option) by an additional 1", mods: { conditionBump: 1 } },
      { ppCost: 4, text: "the target may also reduce the soul drain condition by 5", mods: { unlocks: ["soulDrainOption"] } }
    ]
  },

  // R9 — the heal on the first damage each round, in the aura.
  "Wellspring Of Valour": {
    effects: [
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: 1, opposedAura: true },
      { kind: "damageHeal", target: "targets", label: "Wellspring Of Valour", dice: "1d6" }
    ]
  },

  // R10 — the food, conjured, eaten, gone in a minute.
  "Nature’s Bounty": {
    duration: "1 minute",
    effects: [
      { kind: "conjureItem", label: "Nature’s Bounty", target: "self", pack: "consumables", itemName: "Bountiful Fruit", quantity: 1, healOnUse: "3d10 + 12" },
      { kind: "note", text: "You choose the fruit or vegetable. Whoever eats it (1 AP, Interact) regains the HP and the nourishment of a meal; hand it over to let someone else eat it." }
    ]
  },

  // R11 — the item's metal, for a minute.
  "Precious Metals": {
    effects: [
      { kind: "materialShift", target: "self", label: "Precious Metals" },
      { kind: "note", text: "Chosen from your own metal weapons, armour and shields. Ammunition and loose metal (up to 1 bulk) change at the table." }
    ],
    warps: [
      { ppCost: 8, text: ": Add adamantine, Eaog and mithril to the list of metals you can transform the item into", mods: { unlocks: ["preciousMetals"] } }
    ]
  },

  // R15 — the movement type is built; the special ability is said.
  "Wild Morph": {
    warps: [
      { ppCost: 2, text: "You gain an additional natural attack form (max 3)", mods: { morphForms: 1 } },
      { ppCost: 2, text: "You instead gain a movement type from one of your Studied Targets", mods: { morphMovement: true } },
      { ppCost: 4, text: "instead gain special ability from one of your Studied Targets", mods: { morphAbility: true } }
    ]
  }
};
