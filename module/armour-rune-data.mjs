/**
 * The fifteen ARMOUR & SHIELD RUNES, hand-typed from Chapter 11.
 *
 * The hand-typed half of the pair; `tools/source/magic-items.txt` is the
 * machine transcription, and `verify-magic-items.mjs` diffs the two so a
 * typo in either fails rather than agreeing with itself (lesson 6).
 *
 * WHAT IS TYPED HERE AND WHAT IS PARSED. Only the facts a parser cannot
 * infer: which items a rune goes on, what it actually DOES mechanically,
 * and how much of that this system automates. Every level and price is
 * read from the transcription at build time and checked against the
 * `tiers` figures below — so the numbers exist twice on purpose and once
 * by hand.
 *
 * `effect` records the mechanical shape so a later release can wire it
 * without re-reading the chapter, and `automation` records what actually
 * happens today. The Companion feats shipped for two releases promising
 * automation that had arrived (3.233.7); this field is what stops the
 * opposite — a note claiming an effect the system does not apply.
 */

export const ARMOUR_RUNES = Object.freeze([
  {
    name: "Armour/Shield Potency",
    key: "potency",
    traits: "Warding",
    on: ["armour", "shield"],
    // The Usage line says only "inscribed onto armour", but the rune's
    // own first sentence says "this rune may be placed upon either a
    // suit of armour or a shield", the chapter prints a separate shield
    // potency table, and the section is titled ARMOUR & SHIELD POTENCY.
    // Three statements against one, so the Usage line is incomplete and
    // the prose wins — recorded rather than quietly corrected, and the
    // harness asserts the prose really does say it.
    usageUnderstates: "This rune may be placed upon either a suit of armour or a shield",
    tiers: null, // the potency ladders live in module/magic-item-tables.mjs
    effect: "DB and HP by tier; armour's DB is an item bonus, a shield's raises the shield's own bonus.",
    automation: "table",
    note: "The core rune. Armour takes six tiers, a shield four; the bonus and the item's HP both rise with the tier. Every other rune requires this one first."
  },
  {
    name: "Animated",
    key: "animated",
    traits: "Invested, Alteration",
    on: ["shield"],
    activate: "Engage (1 AP)",
    tiers: [{ tier: "I", level: 8, price: 3000 }, { tier: "II", level: 14, price: 25200 }],
    effect: "The shield floats and grants its DB with both hands free; no Shield Block, penalties still apply. 1 minute, then 1 minute before it may be used again.",
    automation: "action",
    note: "Press Animate on the shield (Engage, 1 AP): it floats for 1 minute with both hands free, then drops to the ground, and cannot be animated again for 1 minute. Tier I is 3/day; tier II has no daily limit."
  },
  {
    name: "Arrow Catching",
    key: "arrowCatching",
    traits: "Invested, Warding",
    on: ["armour", "shield"],
    level: 5,
    armourPrice: 1300,
    shieldPrice: 900,
    activate: "Engage (1 AP)",
    effect: "+1 DB against missile attacks; projectiles aimed within 5 feet divert to the wearer; attackers ignore the concealed condition's bonus.",
    automation: "action",
    note: "Press Engage on the item (1 AP): for 1 minute, +1 DB against missile attacks."
  },
  {
    name: "Benevolent",
    key: "benevolent",
    traits: "Invested, Warding",
    on: ["shield"],
    level: 5,
    price: 900,
    effect: "When aiding an ally's defence, the shield's own DB bonus is added to theirs.",
    automation: "event",
    note: "Applied when you use the Aid Defensive action for an ally: the shield's whole bonus, potency included, is added to their DB as well as the aid."
  },
  {
    name: "Deathless",
    key: "deathless",
    traits: "Healing, Invested, Soul",
    on: ["armour"],
    level: 10,
    price: 8000,
    activate: "Reaction",
    frequency: "1/day",
    effect: "A Dying Check is treated as a Critical Result.",
    automation: "event",
    note: "Offered on a Dying Check, once a day: treat the result as a Critical."
  },
  {
    name: "Energy Resistance",
    key: "energyResistance",
    traits: "Invested, Warding",
    on: ["armour"],
    tiers: [
      { tier: "I", level: 4, price: 750 }, { tier: "II", level: 8, price: 4200 },
      { tier: "III", level: 12, price: 16000 }, { tier: "IV", level: 16, price: 80000 }
    ],
    effect: "Energy Resistance against one energy type per tier (acid, cold, electricity, fire or sonic).",
    automation: "resistance",
    note: "Applied automatically: choose the energy types in Customise — the tier is how many types (one to four), not how much."
  },
  {
    name: "Fortification",
    key: "fortification",
    traits: "Invested, Warding",
    on: ["armour"],
    tiers: [
      { tier: "I", level: 5, price: 1250 }, { tier: "II", level: 10, price: 8000 },
      { tier: "III", level: 15, price: 55000 }, { tier: "IV", level: 20, price: 500000 }
    ],
    effect: "Critical Resistance equal to the tier. The armour becomes bulkier: ACP worsens by 1.",
    automation: "bonus",
    note: "Applied automatically: Critical Resistance equal to the tier, and the armour's ACP worsens by 1 — the penalty is part of the rune, not a typo."
  },
  {
    name: "Glamoured",
    key: "glamoured",
    traits: "Invested, Shadow",
    on: ["armour"],
    level: 4,
    price: 750,
    activate: "Contemplative (1 AP)",
    effect: "The armour appears as ordinary clothing, keeping every property including weight. Disbelief DC 26, and only with true seeing.",
    automation: "action",
    note: "Press Glamour on the armour (Contemplative, 1 AP). Appearance only — the armour keeps all its properties and its weight."
  },
  {
    name: "Indestructible",
    key: "indestructible",
    traits: "Invested, Warding",
    on: ["armour"],
    level: 14,
    price: 36000,
    craftRequirements: "Can only be placed upon adamantine, eaog or mithril armour.",
    effect: "Completely negates a critical injury result that would normally be reduced by it.",
    automation: "event",
    note: "Applied automatically: a critical injury the armour would have amended is negated outright, and the armour takes nothing for it."
  },
  {
    name: "Reflecting",
    key: "reflecting",
    traits: "Invested, Warding",
    on: ["shield"],
    activate: "Reaction",
    tiers: [{ tier: "I", level: 14, price: 30000 }, { tier: "II", level: 20, price: 350000 }],
    effect: "Reflect a spell back at its caster, as the spell turning spell. Tier I: 1/day up to PP 14. Tier II: 1/day up to PP 18 and 3/day up to PP 14.",
    automation: "note",
    note: "Reaction when you are the trigger of a spell — reflect it as spell turning, within the tier's PP limit."
  },
  {
    name: "Saving",
    key: "saving",
    traits: "Invested, Warding",
    on: ["armour"],
    tiers: [
      { tier: "I", level: 4, price: 750 }, { tier: "II", level: 8, price: 4200 },
      { tier: "III", level: 12, price: 16000 }, { tier: "IV", level: 16, price: 80000 },
      { tier: "V", level: 20, price: 500000 }
    ],
    effect: "A resistance bonus to all saving throws equal to the tier.",
    automation: "bonus",
    bonusType: "resistance",
    note: "Applied automatically: a resistance bonus to all three saving throws, equal to the rune's tier."
  },
  {
    name: "Shadow",
    key: "shadow",
    traits: "Alteration, Invested",
    on: ["armour"],
    tiers: [
      { tier: "I", level: 4, price: 750 }, { tier: "II", level: 8, price: 4200 },
      { tier: "III", level: 12, price: 16000 }
    ],
    effect: "A status bonus to Stealth checks equal to the tier.",
    automation: "bonus",
    bonusType: "status",
    note: "Applied automatically: a status bonus to Stealth equal to the rune's tier."
  },
  {
    name: "Slick",
    key: "slick",
    traits: "Alteration, Invested",
    on: ["armour"],
    tiers: [
      { tier: "I", level: 3, price: 450 }, { tier: "II", level: 7, price: 3000 },
      { tier: "III", level: 11, price: 11000 }
    ],
    effect: "A status bonus to Escape and Squeeze (Acrobatics) checks equal to the tier.",
    automation: "conditional",
    bonusType: "status",
    note: "Offered on Acrobatics checks — tick it for Escape and Squeeze, which are the two actions the rune names."
  },
  {
    name: "Spell Effect",
    key: "spellEffect",
    traits: "Alteration, Invested",
    on: ["armour"],
    tiers: null, // level and price come from the armour spell table
    activate: "Cast a Spell",
    effect: "Casts one innate spell 1/day. Level and price come from the spell's PP; 3/day, At Will and Constant raise the level by 1, 2 and 4.",
    automation: "table",
    note: "A separate formula for every spell. The rune's level follows the spell's PP cost on the armour spell table, and the frequency enhancement pushes it further up the same table."
  },
  {
    name: "Tough",
    key: "tough",
    traits: "Alteration, Invested",
    on: ["armour"],
    tiers: [
      { tier: "I", level: 4, price: 750 }, { tier: "II", level: 8, price: 4200 },
      { tier: "III", level: 12, price: 16000 }, { tier: "IV", level: 16, price: 80000 }
    ],
    effect: "A status bonus to HP: +20 per tier.",
    automation: "bonus",
    bonusType: "status",
    perTier: 20,
    note: "Applied automatically: a status bonus to maximum hit points of 20 per tier."
  }
]);

/** The transcription's heading for each rune, for the diff. */
export const RUNE_SOURCE_NAMES = Object.freeze({
  potency: "ARMOUR/SHIELD POTENCY",
  animated: "ANIMATED",
  arrowCatching: "ARROW CATCHING",
  benevolent: "BENEVOLENT",
  deathless: "DEATHLESS",
  energyResistance: "ENERGY RESISTANCE",
  fortification: "FORTIFICATION",
  glamoured: "GLAMOURED",
  indestructible: "INDESTRUCTIBLE",
  reflecting: "REFLECTING",
  saving: "SAVING",
  shadow: "SHADOW",
  slick: "SLICK",
  spellEffect: "SPELL EFFECT",
  tough: "TOUGH"
});
