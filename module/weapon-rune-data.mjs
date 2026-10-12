/**
 * The eighteen WEAPON RUNES, hand-typed from Chapter 11.
 *
 * The hand-typed half of the pair; `tools/source/magic-items.txt` is the
 * machine transcription, and `verify-magic-items.mjs` diffs the two
 * (lesson 6). Same arrangement, same fields and the same rule as
 * `armour-rune-data.mjs`: only the facts a parser cannot infer are typed
 * here, and every level and price is read from the document at build
 * time and checked against the figures below.
 *
 * FIVE RUNES ARE THE SAME RUNE WITH A DIFFERENT DAMAGE TYPE. Acidic,
 * Flaming, Frost, Shock and Thundering print identical tier text —
 * "1d4 damage", then "2d4 and a secondary critical at -40", then "3d4
 * and a secondary critical at -20" — at identical levels and prices,
 * differing only in the energy they deal. That is recorded as
 * `energyRune: true` rather than being collapsed into one entry with a
 * choice, because the chapter prints five runes and an item bearing
 * Flaming does not thereby bear Frost.
 *
 * DISRUPTING IS THE ONE UNDOUBLED TIER PARAGRAPH in the whole chapter,
 * and its tiers are NOT the energy pattern despite looking like it: 1d4
 * with a secondary critical at -20 at tier I, where an energy rune's
 * tier I has no secondary critical at all. Worth knowing, because the
 * obvious "these five are all the same" simplification would have
 * swallowed it.
 */

/** The tier ladder every energy rune shares. */
const ENERGY_TIERS = Object.freeze([
  { tier: "I", level: 5, price: 900 },
  { tier: "II", level: 10, price: 6000 },
  { tier: "III", level: 15, price: 40000 }
]);

const energyRune = (name, key, energy, traits) => ({
  name, key, traits, on: ["weapon"], energyRune: true, energy,
  tiers: ENERGY_TIERS.map((t) => ({ ...t })),
  effect: `Secondary ${energy} damage while active: 1d4 at I, 2d4 and a secondary critical at -40 at II, 3d4 and a secondary critical at -20 at III.`,
  // 3.618.0 (block 37, A4, A9, C5; Graham's R9 and R10).
  automation: "action",
  note: `Press Activate on the weapon (Command, 1 AP): each hit then deals the tier's secondary ${energy} damage until you switch it off, which is free. At II and III a CRITICAL strike also rolls a secondary critical on the ${energy} table, at the strike's severity.`
});

export const WEAPON_RUNES = Object.freeze([
  {
    name: "Weapon Potency",
    key: "potency",
    traits: "Invocation",
    on: ["weapon", "ammunition"],
    tiers: null, // the ladder lives in module/magic-item-tables.mjs
    effect: "An item bonus to attacks equal to the tier, +1 damage per tier, and +5 HP per tier on a weapon that tracks its HP. Required before any other rune.",
    automation: "table",
    note: "The core weapon rune, six tiers. Any rune that may be applied to a missile weapon may also be applied to a batch of ammunition unless it says otherwise."
  },
  energyRune("Acidic", "acidic", "acid", "Acid, Invested, Invocation"),
  {
    name: "Aligned",
    key: "aligned",
    traits: "Invested, Invocation",
    on: ["weapon"],
    level: 8,
    price: 3000,
    effect: "1d4 secondary damage of a chosen aligned trait (Chaos, Evil, Good or Order) against creatures with the opposing trait.",
    automation: "damage",
    note: "Choose the aligned trait when the rune is inscribed. Rolled automatically: 1d4 aligned damage against a creature with the OPPOSING trait, and nothing against anything else."
  },
  {
    name: "Bane",
    key: "bane",
    traits: "Invested, Invocation",
    on: ["weapon"],
    level: 4,
    price: 600,
    effect: "An additional 2d4 damage against one chosen kind of creature.",
    automation: "damage",
    note: "The crafter picks the creature kind — canines, dragons, elves, spiders — when the rune is inscribed. Added to the strike automatically against a creature carrying that kind as a trait."
  },
  {
    name: "Called",
    key: "called",
    traits: "Invested, Translocation",
    on: ["weapon"],
    tiers: [{ tier: "I", level: 7, price: 2100 }, { tier: "II", level: 12, price: 11000 }],
    effect: "Teleport the weapon to your hand. Tier I: within 100 feet and line of sight. Tier II: within a mile.",
    automation: "action",
    note: "Press Call on the weapon (Command, Contemplative, 2 AP). A creature holding it may resist with a Will save against the weapon's Level DC (its level + 14)."
  },
  {
    name: "Courageous",
    key: "courageous",
    traits: "Enchantment, Invested",
    on: ["weapon"],
    level: 5,
    price: 900,
    effect: "A bonus to saves against fear effects equal to the weapon's potency bonus (minimum +1).",
    automation: "conditional",
    note: "Applied automatically to saves against fear effects: the potency bonus the weapon's quality allows, minimum +1."
  },
  {
    name: "Disrupting",
    key: "disrupting",
    traits: "Invested, Soul",
    on: ["weapon"],
    tiers: [{ tier: "I", level: 6, price: 1400 }, { tier: "II", level: 14, price: 25000 }],
    effect: "Secondary essence damage: 1d4 with a secondary critical at -20 at I, 2d4 with a secondary critical at II. Melee weapons only.",
    automation: "damage",
    // NOT the energy pattern, despite the family resemblance — tier I
    // already carries a secondary critical, where an energy rune's does
    // not.
    note: "Essence damage on every successful strike (it is enshrouded in positive energy, and deals essence). Tier I already opens a secondary critical on a critical strike, unlike the elemental runes."
  },
  energyRune("Flaming", "flaming", "fire", "Fire, Invested, Invocation"),
  energyRune("Frost", "frost", "cold", "Cold, Invested, Invocation"),
  {
    name: "Ghost Touch",
    key: "ghostTouch",
    traits: "Invested, Soul",
    on: ["weapon"],
    level: 5,
    price: 900,
    effect: "Affects incorporeal creatures normally, and may be wielded by them. Melee weapons only.",
    automation: "event",
    note: "Applied automatically: an incorporeal creature's immunity to non-magical attacks and its resistance to all damage do not apply to this weapon's blows."
  },
  {
    name: "Life Stealing",
    key: "lifeStealing",
    traits: "Evil, Invested, Soul",
    on: ["weapon"],
    level: 10,
    price: 6000,
    effect: "On a critical hit, the target makes a Fortitude save or takes 1d6 Soul Drain, which heals the wielder. Slashing melee weapons only.",
    automation: "event",
    note: "Rolled on a critical hit: the target's Fortitude save against the weapon's Level DC; a failure takes 1d6 Soul Drain and heals you as much. Bleed it inflicts is recurring essence damage."
  },
  {
    name: "Razor",
    key: "razor",
    traits: "Alteration, Invested, Uncommon",
    on: ["weapon"],
    level: 13,
    price: 17000,
    effect: "A critical on an AV of 3+ instead of a Keen weapon's 4+. Keen piercing or slashing melee weapons only.",
    automation: "bonus",
    note: "Applied automatically on a Keen piercing or slashing melee weapon; suppressed on anything else."
  },
  {
    name: "Returning",
    key: "returning",
    traits: "Invested, Invocation",
    on: ["weapon"],
    level: 4,
    price: 600,
    effect: "A thrown Strike returns the weapon to your hand after the Strike resolves. Thrown weapons only.",
    automation: "event",
    note: "Applied automatically: a thrown Strike does not spend the weapon. If your hands are full it falls in your space."
  },
  {
    name: "Shifting",
    key: "shifting",
    traits: "Alteration, Invested",
    on: ["weapon"],
    tiers: [{ tier: "I", level: 8, price: 3000 }, { tier: "II", level: 12, price: 11000 }],
    effect: "Reshape the weapon into another melee weapon. Tier I: any of the same size. Tier II: within one size of the original. Melee weapons only.",
    automation: "action",
    note: "Press Shift on the weapon (Engage, 1 AP). The runes come along, so a Potency III shifting sword is a Potency III anything — and a rune the new form cannot take is suppressed until it shifts back."
  },
  energyRune("Shock", "shock", "electricity", "Electricity, Invested, Invocation"),
  {
    name: "Spell Effect",
    key: "spellEffect",
    traits: "Alteration, Invested",
    on: ["weapon"],
    tiers: null, // level and price come from the weapon spell table
    activate: "Cast a Spell",
    effect: "Casts one innate spell. Level and price come from the spell's PP on the weapon spell table; 3/day, At Will and Constant raise the level by 1, 2 and 4.",
    automation: "table",
    note: "A separate formula for every spell. The rune's level follows the spell's PP cost on the WEAPON spell table, which is cheaper than the armour one at every row."
  },
  energyRune("Thundering", "thundering", "sonic", "Invested, Invocation, Sonic"),
  {
    name: "Vicious",
    key: "vicious",
    traits: "Essence, Invested, Soul",
    on: ["weapon"],
    level: 6,
    price: 1400,
    effect: "An extra 2d4 secondary essence damage, half of it (round up) feeding back into the wielder. Melee weapons only.",
    automation: "damage",
    note: "Rolled automatically. The feedback is half the extra damage, rounded UP, through your own defences — essence resistance halves it. A wielder with essence resistance or immunity fumbles automatically on an unmodified 1."
  }
]);

/** The transcription's heading for each rune, for the diff. */
export const WEAPON_RUNE_SOURCE_NAMES = Object.freeze({
  potency: "WEAPON POTENCY",
  acidic: "ACIDIC",
  aligned: "ALIGNED",
  bane: "BANE",
  called: "CALLED",
  courageous: "COURAGEOUS",
  disrupting: "DISRUPTING",
  flaming: "FLAMING",
  frost: "FROST",
  ghostTouch: "GHOST TOUCH",
  lifeStealing: "LIFE STEALING",
  razor: "RAZOR",
  returning: "RETURNING",
  shifting: "SHIFTING",
  shock: "SHOCK",
  spellEffect: "SPELL EFFECT",
  thundering: "THUNDERING",
  vicious: "VICIOUS"
});
