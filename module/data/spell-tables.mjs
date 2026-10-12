/**
 * GENERATED DATA — extracted from TRG Prime Core 3.1, Chapter 9.
 *
 * The Spell Fumble roll is a Top Open Ended percentile (96-100 explodes
 * upward only), plus the tradition/school modifier below, +20 on a Blunder.
 * Unmodified 66 and unmodified 100 are specials, listed separately; the 66
 * reverses the spell with a Resonance Event, the 100 is catastrophic. A
 * MODIFIED result landing exactly on 66 or 100 falls back to the nearest
 * lower row via lookupTableRow, matching the tables' "UM" wording. Entries
 * with max 9999 absorb heavily modified results.
 */

export const SPELL_FUMBLE_TABLE = Object.freeze([
  {
    "min": 1,
    "max": 40,
    "effect": "The spell fizzles out harmlessly having no effect. You are Stunned 1."
  },
  {
    "min": 41,
    "max": 55,
    "effect": "The spell fails having no effect. You are Stunned 2."
  },
  {
    "min": 56,
    "max": 65,
    "effect": "The spell internalises giving you a minor headache, you are Stunned 2 and take 2d10 mental damage."
  },
  {
    "min": 67,
    "max": 80,
    "effect": "The spell affects a random target within range, including allies or innocent bystanders. You are Stunned 1."
  },
  {
    "min": 81,
    "max": 90,
    "effect": "The spell takes effect at a later time, determined randomly by rolling a d4 (1 = 1 round later, 2 = 1 minute later, 3 = 1 hour later, 4 = 1 day later). You are Stunned 2."
  },
  {
    "min": 91,
    "max": 99,
    "effect": "The spell goes awry and you take mental damage equal to 1d6 per PP of the spell. You are also Stunned 2."
  },
  {
    "min": 101,
    "max": 125,
    "effect": "The spell produces a random effect, roll on the resonance event table at +20. You are also Stunned 2."
  },
  {
    "min": 126,
    "max": 150,
    "effect": "The spell internalises, wracking you with magical energy. You take 4d10 damage and a Minor Critical (appropriate to the spell)."
  },
  {
    "min": 151,
    "max": 175,
    "effect": "The spell internalises, wracking you with magical energy. You take 6d10 damage and a Serious Critical (appropriate to the spell)."
  },
  {
    "min": 176,
    "max": 200,
    "effect": "You lose control of the casting and have no choice but to continue with it. You take 2d10 mental damage and must roll on this table again at the beginning of your next turn at +100. You may perform no other actions in the meantime."
  },
  {
    "min": 201,
    "max": 250,
    "effect": "The spell fails and produces a deafening boom affecting a 5’ radius per PP of the spell. All creatures including yourself must make a Basic Fortitude Save against a 1d10 per 2 PP sonic attack using your Spell Save DC."
  },
  {
    "min": 251,
    "max": 300,
    "effect": "You summon a creature with an EL of your level +2. This creature has a diametrically opposed ethos to yours and remains for 1 rnd per PP of the spell. The creature attacks you and will do everything in its power to kill you."
  },
  {
    "min": 301,
    "max": 350,
    "effect": "You take a Deadly Critical, gain Fatigued 5 and the spell effects a random target within range at +50."
  },
  {
    "min": 351,
    "max": 9999,
    "effect": "You open a permanent gate to the Abyss and are promptly sucked through. You are then take a Deadly Critical and 8d12 damage...ouch."
  }
]);

export const SPELL_FUMBLE_SPECIALS = Object.freeze([
  {
    "trigger": "um66",
    "face": 66,
    "effect": "The spell is reversed in the most appropriate fashion (GM discretion). Also roll for a Resonance Event (see below)."
  },
  {
    "trigger": "um100",
    "face": 100,
    "effect": "Caster must make a Will Save against their own Spell DC or be completely erased by the magic. A critical save treats this as the 251-300 result below, a success as 301-350 result."
  }
]);

/**
 * The eight spell schools (Chapter 9). Derived from the same rows the
 * Spell Fumble Modifiers table groups them into, and carried on each
 * spell's `system.traits` alongside its other traits — so a feature that
 * scopes to "one spell school" (the Furini gnome's warp discount) can be
 * matched at cast time rather than left to the player to apply by hand.
 */
export const SPELL_SCHOOLS = Object.freeze([
  "Alteration",
  "Enchantment",
  "Insight",
  "Invocation",
  "Shadow",
  "Soul",
  "Translocation",
  "Warding"
]);

export const SPELL_FUMBLE_MODIFIERS = Object.freeze({
  "Arcane": 10,
  "Divinity": 5,
  "Ethereal": -10,
  "Verdant": 10,
  "Insight & Shadow": 0,
  "Warding": 5,
  "Enchantment": 10,
  "Alteration & Translocation": 15,
  "Invocation & Soul": 20,
  "Per PP of the Spell": 5,
  "Spell Ritual": 20,
  "Spell result is a blunder": 20
});

export const RESONANCE_EVENT_TABLE = Object.freeze([
  {
    "min": 1,
    "max": 25,
    "effect": "Flickering Lights: Nearby lights dim or flicker momentarily."
  },
  {
    "min": 26,
    "max": 50,
    "effect": "Shadowy Whispers: Faint whispers can be heard in the distance, but their meaning remains elusive."
  },
  {
    "min": 51,
    "max": 65,
    "effect": "Muffled Sounds: Sounds become slightly muted or distorted. All hearing-based checks suffer a -2 penalty in 10’ radius emanating from the caster or 10 minutes."
  },
  {
    "min": 67,
    "max": 80,
    "effect": "Static Discharge: Small sparks of static electricity discharge around the caster. This is treated as 1 recurring electricity damage to the caster and any they touch whilst the damage continues."
  },
  {
    "min": 81,
    "max": 90,
    "effect": "Tangled Emotions: Surrounding individuals in a 20’ radius emanation experience brief waves of heightened emotion. This results in a -1 penalty to Will saves for 1 hour."
  },
  {
    "min": 91,
    "max": 99,
    "effect": "Temporal Distortion: Time appears to momentarily slow down or speed up. All creatures with a 30 radius of the caster gain either slowed 1 or quickened 1 (randomly) for 1 minute."
  },
  {
    "min": 101,
    "max": 110,
    "effect": "Terrifying Vision: The caster and all allies within a 50’ radius are plagued with a terrible vision (which may hold some truth). This is treated as a Fear Spell with a DC equal to that of the initial spell."
  },
  {
    "min": 111,
    "max": 120,
    "effect": "Hostile Apparitions: Two incorporeal undead of an equal level to the caster appear and attack."
  },
  {
    "min": 121,
    "max": 130,
    "effect": "Weakening Barriers: A surge of magical energy nullifies all spells and magical items of the Warding school for 1 minute in a 50’ radius burst."
  },
  {
    "min": 131,
    "max": 140,
    "effect": "Creature of Interest: A major antagonist of the current campaign sends a group of reasonably powerful servants to apprehend the caster."
  },
  {
    "min": 141,
    "max": 150,
    "effect": "Elemental Surge: A surge of elemental energy briefly manifests, causing a localized elemental effect (fire, ice, electricity, etc.). This is treated as a fireball (with appropriate elemental damage) centralised on the caster."
  },
  {
    "min": 151,
    "max": 175,
    "effect": "Reality Fracture: A small rift in reality opens, revealing glimpses of another plane of existence. This rift remains open for 1d4 x PP cost of the spell minutes."
  },
  {
    "min": 176,
    "max": 200,
    "effect": "Creature of Importance: A major antagonist of the current campaign sends a group of equally powerful servants to apprehend or destroy the caster."
  },
  {
    "min": 201,
    "max": 225,
    "effect": "Uncontrolled Conjuration: A creature is inadvertently summoned. It is a random creature from a conjure spell increased to the maximum level you could summon. The creature may or may not be hostile depending upon the situation and what it is."
  },
  {
    "min": 226,
    "max": 250,
    "effect": "Warp of Space: Space around you distorts temporarily, causing you and any creatures to vanish from existence for an amount of rounds equal to the PP cost of the spell."
  },
  {
    "min": 251,
    "max": 275,
    "effect": "Primary Concern: A major antagonist of the current campaign sends a powerful lieutenant to destroy the caster."
  },
  {
    "min": 276,
    "max": 300,
    "effect": "Cursed Aura: A curse affects the area, causing misfortune or ill luck to those within it. All creatures within a 50’ radius of the caster (but not the caster) suffer disadvantage to their checks for 1 minute per PP of the cast spell. If no targets are with range, the caster takes a +20 Force Critical."
  },
  {
    "min": 301,
    "max": 350,
    "effect": "Elemental Cataclysm: A massive elemental force is unleashed, causing widespread destruction in the immediate area. (fire, ice, electricity, etc.). This is treated as acidic eruption (with appropriate elemental damage) centralised on the caster."
  },
  {
    "min": 351,
    "max": 9999,
    "effect": "Catastrophic Convergence: The ultimate resonance event occurs, resulting in a cataclysmic event that alters the fabric of reality itself (GM discretion)."
  }
]);

export const RESONANCE_SPECIALS = Object.freeze([
  {
    "trigger": "um66",
    "face": 66,
    "effect": "Absolute Chaos: Roll twice on this table with both results taking effect. The spell that you were casting costs you no PP and has any one of its variables doubled."
  },
  {
    "trigger": "um100",
    "face": 100,
    "effect": "Caster must make a Will Save against their own Spell DC or be completely erased by the magic. A critical save treats this as the 276-300 result below, a success as 301-350 result."
  }
]);

/**
 * Resonance Modifiers (Chapter 9). "In a good, aligned area"/"In an evil
 * aligned area"/"In the dark lands" are situational and mutually
 * exclusive — applied by whichever the GM judges the location to be, at
 * most one of the three. The spell-trait modifiers (Cantrip/Attack/Save/
 * Utility) are likewise mutually exclusive per spell. "Per PP", "Evil
 * Spell", "Ethereal Magic", and "Soul Magic" can all stack alongside
 * whichever location and trait modifier apply.
 */
export const RESONANCE_MODIFIERS = Object.freeze({
  "In a good, aligned area": -10,
  "In an evil aligned area": 10,
  "In the dark lands": 20,
  "Cantrip": -20,
  "Attack Spell": 20,
  "Save Spell": 10,
  "Utility Spell": -10,
  "Per PP of the spell": 5,
  "Evil Spell": 20,
  "Ethereal Magic": -20,
  "Soul Magic": 10
});
