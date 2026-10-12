/**
 * BLOCK 36, PART TWO (pages 361–370) — what the item packs hold after
 * 3.616.0.
 *
 * Graham's rulings of 2 October 2026 on claude/audit-pages-361-370.md:
 *   R6   Arrow Catching diverts missiles aimed at anyone
 *   R11  Air Drake Armour's Fly, with its cooldown ("Build the cooldown")
 *   R12  the metamagic rods; a 1 AP spell cannot be quickened
 *   R13  Rod of the Magi and Sceptre of the Clergy lend their PP
 *   R14  Rod of Accuracy and Rod of Alertness
 *   R15  staves and the Sceptre are weapons too
 *
 * WHOLE FIELDS, as in every plan file. `chargedItem` entries merge into the
 * item's `flags.trg-prime.chargedItem` key by key; `specificItem` likewise.
 */

/** specific-items: system fields, and flags under `specificItem`. */
export const SPECIFIC = {
  // R11 — "Activate Command (1 AP); Frequency at will … Once activated, the
  // effect lasts for 1 minute and then cannot be activated for another 10
  // minutes."
  "Air Drake Armour": {
    system: { runes: "Potency II, Energy Resistance I (electricity), Spell Effect (Fly, At Will)" },
    specificItem: { activationAP: 1, cooldownSeconds: 600, effectSeconds: 60 }
  }
};

/** charged-items: keys merged into `flags.trg-prime.chargedItem`. */
export const CHARGED = {
  // R12 — the rod pays Extend or Quicken; no PP or casting DC to the caster.
  "Rod of Extension I": { metamagic: { kind: "extend", maxPP: 4, cost: 2 } },
  "Rod of Extension II": { metamagic: { kind: "extend", maxPP: 8, cost: 2 } },
  "Rod of Extension III": { metamagic: { kind: "extend", maxPP: 12, cost: 2 } },
  "Rod of Quickening I": { metamagic: { kind: "quicken", maxPP: 4, cost: 2 } },
  // R13 — "expend PP from the rod instead of your own reserve".
  "Rod of the Magi": { ppSource: { tradition: "arcane" } },
  // R13 and R15 — "may be used to attack as a light mace (expert, potency I)".
  "Sceptre of the Clergy": {
    ppSource: { tradition: "divinity" },
    weaponForm: { base: "Light Mace", quality: "expert", material: "", runes: "Potency I" }
  },
  // R14.
  "Rod of Accuracy": { spellAttack: { maxPP: 2 } },
  "Rod of Alertness": { checkAdvantage: { subjects: ["perception", "senseMotive"], cost: 2 } },
  // R15 — every staff is a staff; three print more.
  "Animal Staff": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } },
  "Shock Staff": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } },
  "Staff of Cure": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } },
  "Staff of Fire": { weaponForm: { base: "Staff", quality: "expert", material: "", runes: "Potency I" } },
  "Staff of Healing": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } },
  "Staff of Imagery": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } },
  "Staff of Salinor Alshar": { weaponForm: { base: "Staff", quality: "expert", material: "densewood", runes: "" } },
  "Staff of the Coast Runner": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "Potency I" } },
  "Verdant Staff": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } },
  "Versarians Sight": { weaponForm: { base: "Staff", quality: "standard", material: "", runes: "" } }
};

/** runes: notes that 3.616.0 makes true or false, keyed by rune key — [old, new]. */
export const RUNE_NOTES = {
  arrowCatching: [
    "Press Engage on the item (1 AP): for 1 minute, +1 DB against missile attacks.",
    "Press Engage on the item (1 AP): for 1 minute, +1 DB against missile attacks, missiles aimed at anyone within 5 feet are drawn to the wearer (unless the wearer has greater cover), and ranged attackers ignore the wearer's concealment."
  ],
  reflecting: [
    "Reaction when you are the trigger of a spell — reflect it as spell turning, within the tier's PP limit.",
    "When a spell targets the wielder, the reflection is offered as a reaction, within the tier's PP limit, and the spell resolves on its caster. No check is rolled."
  ]
};
