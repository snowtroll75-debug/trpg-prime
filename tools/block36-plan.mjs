/**
 * BLOCK 36 (pages 361–370) — what the item packs should hold after 3.615.0.
 *
 * Graham's rulings of 2 October 2026 on claude/audit-pages-361-370.md:
 *   R3   a specific item's printed figures are final
 *   R4   Elven Chainmail's Shadow I is +1 (no change: the rune already is)
 *   R10  Quick Plate's Haste is Command (1 AP)
 *   R18  the charged items keep their printed values (Versarians Sight's
 *        Recharge 2)
 * and the audit's no-ruling fixes A8, A11, A16, A17, B1, B2, B8 and B9.
 *
 * WHOLE FIELDS, as in every plan file; `flags` entries merge into the
 * item's `trg-prime` flags key by key.
 */

/** specific-items: system fields, and flags under `specificItem`. */
export const SPECIFIC = {
  // A11 — reinforced leather; the base Reinforced Leather covers the torso.
  "Diplomat Armour": { system: { coversTorso: true } },
  // A11, B2, R10 — a breastplate; its Haste is a 1/day innate spell, at the
  // item's own Command (1 AP).
  "Quick Plate": {
    system: { coversTorso: true, runes: "Potency I, Spell Effect (Haste, 1/day)" },
    specificItem: { activationAP: 1 }
  },
  // B1 — "Electricity Resistance" in its traits.
  "Air Drake Armour": { system: { runes: "Potency II, Energy Resistance I (electricity)" } }
};

/** runes: the stale notes (A8), keyed by rune key — [old sentence, new sentence]. */
export const RUNE_NOTES = {
  "animated": [
    "Press Use on the shield to track it yourself — this system has no floating-shield state. Tier I is 3/day; tier II has no daily limit.",
    "Press Animate on the shield (Engage, 1 AP): it floats for 1 minute with both hands free, then drops to the ground, and cannot be animated again for 1 minute. Tier I is 3/day; tier II has no daily limit."
  ],
  "arrowCatching": [
    "The +1 applies only against missiles and only while activated, and the diversion is a GM call about the battlefield — both are the sort of thing a sheet cannot decide.",
    "Press Engage on the item (1 AP): for 1 minute, +1 DB against missile attacks."
  ],
  "benevolent": [
    "Applies when you use the Aid Defensive action for an ally — add the shield's bonus to their DB as well as the aid.",
    "Applied when you use the Aid Defensive action for an ally: the shield's whole bonus, potency included, is added to their DB as well as the aid."
  ],
  "deathless": [
    "Reaction on a Dying Check, once a day: treat the result as a Critical.",
    "Offered on a Dying Check, once a day: treat the result as a Critical."
  ],
  "energyResistance": [
    "Choose the energy types and add them to the wearer's own Resistances field — the tier is how many types, not how much.",
    "Applied automatically: choose the energy types in Customise — the tier is how many types (one to four), not how much."
  ],
  "fortification": [
    "Critical Resistance equal to the tier, and the armour's ACP worsens by 1 — the penalty is part of the rune, not a typo.",
    "Applied automatically: Critical Resistance equal to the tier, and the armour's ACP worsens by 1 — the penalty is part of the rune, not a typo."
  ],
  "glamoured": [
    "Appearance only — the armour keeps all its properties and its weight.",
    "Press Glamour on the armour (Contemplative, 1 AP). Appearance only — the armour keeps all its properties and its weight."
  ],
  "indestructible": [
    "Negates outright a critical injury that Critical Resistance would merely have reduced.",
    "Applied automatically: a critical injury the armour would have amended is negated outright, and the armour takes nothing for it."
  ]
};

/** runes: the automation each rune now has (A8). */
export const RUNE_AUTOMATION = {
  "animated": "action",
  "arrowCatching": "action",
  "benevolent": "event",
  "deathless": "event",
  "energyResistance": "resistance",
  "fortification": "bonus",
  "glamoured": "action",
  "indestructible": "event"
};

/** runes: which items the potency runes go on (A8). */
export const POTENCY_ON = { "Armour Potency": ["armour"], "Shield Potency": ["shield"] };

/** runes: description text fixes (A8). */
export const RUNE_TEXT = {
  "Spell Effect (Armour)": [["This rune allows the wielder of the weapon to cast an innate spell.", "This rune allows the wearer to cast an innate spell."]]
};

/**
 * charged-items: `chargedItem` flag keys, `conditionals` (B9), and
 * description fixes.
 */
export const CHARGED = {
  // A16 — "Shillelagh (2 – can target the staff)".
  "Verdant Staff": {
    spells: [{ name: "Tanglefoot", pp: 0 }, { name: "Shillelagh", pp: 2 }, { name: "Entangle", pp: 4 }, { name: "Barkskin", pp: 4 }, { name: "Tree Shape", pp: 6 }],
    conditionals: [{ kind: "modifier", value: 2, type: "item", when: { checkTypes: ["skill"], subjects: ["nature"] },
      label: "Verdant Staff — identifying plants", scope: "Nature checks to identify plants",
      text: "+2 item bonus to Nature checks to identify plants, while wielding the staff." }],
    text: [["Spells: Tanglefoot (PP 0), Entangle (PP 4)", "Spells: Tanglefoot (PP 0), Shillelagh (PP 2 — can target the staff), Entangle (PP 4)"]]
  },
  // A17 — the book now prints 10.
  "Staff of Cure": {
    printedPowerPoints: 10, correctedFromPrinted: false, cureBonus: 1,
    text: [["\n\n(The book prints 8 PP here. A staff holds its level x 2, which is 10 — corrected per the author.)", ""]]
  },
  "Staff of Healing": { cureBonus: 1 },
  // A17 and R18 — the book prints 28 PP and Recharge 2.
  "Versarians Sight": {
    printedPowerPoints: 28, correctedFromPrinted: false, recharge: 2, printedRecharge: 2,
    conditionals: [{ kind: "modifier", value: 2, type: "item", auto: true, when: { checkTypes: ["skill"], actions: ["senseMagicBroad", "senseMagicFocused"] },
      label: "Versarians Sight — Sense Power", scope: "Sense Power checks",
      text: "+2 item bonus to Sense Power (Power Manipulation) checks, while wielding the staff." }],
    text: [
      ["\n\n(The book prints 16 PP here. A staff holds its level x 2, which is 28 — corrected per the author.)", ""],
      ["Power Points: 28; recharges 3 per day while invested.", "Power Points: 28; recharges 2 per day while invested."]
    ]
  },
  "Animal Staff": {
    conditionals: [{ kind: "modifier", value: 1, type: "item", when: { checkTypes: ["skill"], actions: ["recallKnowledge"] },
      label: "Animal Staff — identifying animals", scope: "Recall Knowledge to identify a creature of the animal type",
      text: "+1 item bonus to Recall Knowledge checks made to identify creatures of the animal type, while wielding the staff." }]
  },
  "Staff of Imagery": {
    conditionals: [{ kind: "modifier", value: 2, type: "item", when: { checkTypes: ["skill"], actions: ["senseMagicBroad", "senseMagicFocused", "identifyPower"] },
      label: "Staff of Imagery — shadow magic", scope: "checks to identify and sense shadow magic",
      text: "+2 item bonus to checks made to identify and sense shadow magic, while wielding the staff." }]
  },
  "Staff of the Coast Runner": {
    conditionals: [{ kind: "modifier", value: 2, type: "item", auto: true, when: { checkTypes: ["skill"], actions: ["swim"] },
      label: "Staff of the Coast Runner — swimming", scope: "swim checks",
      text: "+2 item bonus to all swim checks, while wielding the staff." }]
  },
  // B8 — "See Invisibility (4 PP)" is the spell See Invisible.
  "Rod of Alertness": {
    spells: [{ name: "See Invisible", pp: 4 }],
    text: [["The rod also allows you to cast See Invisibility (4 PP).", "The rod also allows you to cast See Invisible (4 PP)."]]
  },
  // A17 — book text that leaked into two descriptions.
  "Wand of Charm Kind": {
    text: [["\n\nOTHER CHARGED ITEMS Charged items can come in various shapes and sizes and although always uncommon, these items do exist. When first created, these items will contain enough power points to cast each spell it possesses at base cost twice. This value is also the maximum amount of power points which the item may contain when fully charged. OTHER CHARGED ITEMS Charged items can come in various shapes and sizes and although always uncommon, these items do exist. When first created, these items will contain enough power points to cast each spell it possesses at base cost twice. This value is also the maximum amount of power points which the item may contain when fully charged.", ""]]
  },
  "Wand of Magic Missile": {
    text: [["\n\n[Heading 1] CONSUMABLE ITEMS\n\nWe continue the magical item descriptions with consumable items. Any magical item that has the Consumable trait may only be used once.", ""]]
  }
};
