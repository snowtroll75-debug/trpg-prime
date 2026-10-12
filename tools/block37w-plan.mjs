/**
 * BLOCK 37, THE WEAPONS (pages 377–380) — what the item packs should hold
 * after 3.618.0.
 *
 * Graham's rulings of 3 October 2026 on claude/audit-pages-371-383.md:
 *   R9   the energy runes are switched on (Command, 1 AP) and stay on until
 *        switched off; Flametooth's "eternal" flames are always on
 *   R14  the specific weapons' printed figures are final; bare dice, so
 *        quality is not counted twice; fumble DC from the base weapon
 *        (Scimitar 8, Morning Star 16 — and Da Big Itter's Mattock, 18);
 *        Scourge's AR 2 stands
 *   R15  Da Big Itter's Fear (DC 20) is offered on its critical
 * and the audit's no-ruling fixes A3 (Disrupting deals essence), A8 (the
 * specific weapons' data) and A9 (stale rune text).
 *
 * WHOLE FIELDS, as in every plan file; `specificItem` merges key by key.
 * Generated notes: the rune pack's descriptions end with the data file's
 * `note`, so every changed note is an [old, new] pair here.
 */

/** specific-items: system fields, and flags under `specificItem`. */
export const SPECIFIC = {
  // R14 — a Mattock (1d12 B, Large, AR 1, Shove, fumble 18), Expert, Potency I.
  "Da Big Itter": {
    system: { damage: "1d12", baseDamage: "1d12", damageType: "bludgeoning", fumbleDC: 18, size: "large" },
    // R15 — "Activate Command (1 AP); Frequency Upon a successful critical hit.
    // The weapon casts a Fear (DC 20) spell on the target of the critical hit."
    specificItem: { onCritical: { spell: "Fear", dc: 20, ap: 1 } }
  },
  // R14 — a cold iron Scimitar (1d6 S, fumble 8), Expert, Potency II, Flaming I.
  "Flametooth": {
    system: { damage: "1d6", baseDamage: "1d6", damageType: "slashing", material: "coldIron", fumbleDC: 8, size: "medium" },
    // R9 — "its gleaming cold iron blade eternally enveloped in flickering flames".
    specificItem: { alwaysActive: ["flaming"], material: "coldIron" }
  },
  // R14 — a Morning Star (1d8 B, fumble 16), Master, Potency III, Disrupting I; AR 2.
  "Scourge of the Unlife": {
    system: { damage: "1d8", baseDamage: "1d8", damageType: "bludgeoning", fumbleDC: 16, size: "medium", armourRending: 2 }
  }
};

/** runes: description text fixes the page itself makes (A3, A9). */
export const RUNE_TEXT = {
  "Disrupting I": [["On a successful strike, the weapon inflicts secondary positive damage based upon its level.", "On a successful strike, the weapon inflicts secondary essence damage based upon its level."]],
  "Disrupting II": [["On a successful strike, the weapon inflicts secondary positive damage based upon its level.", "On a successful strike, the weapon inflicts secondary essence damage based upon its level."]],
  "Life Stealing": [["any bleed damage inflicted by this weapon changes to persistent essence damage.", "any bleed damage inflicted by this weapon changes to recurring essence damage."]]
};

export const RUNE_NOTES = {
  "acidic": [
    "Activate the weapon to coat it; each strike then deals the tier's secondary acid damage. The higher tiers also open a secondary critical.",
    "Press Activate on the weapon (Command, 1 AP): each hit then deals the tier's secondary acid damage until you switch it off, which is free. At II and III a CRITICAL strike also rolls a secondary critical on the acid table, at the strike's severity."
  ],
  "aligned": [
    "Choose the aligned trait when the rune is inscribed. The extra 1d4 applies only against creatures with the OPPOSING trait.",
    "Choose the aligned trait when the rune is inscribed. Rolled automatically: 1d4 aligned damage against a creature with the OPPOSING trait, and nothing against anything else."
  ],
  "bane": [
    "The crafter picks the creature kind — canines, dragons, elves, spiders — when the rune is inscribed.",
    "The crafter picks the creature kind — canines, dragons, elves, spiders — when the rune is inscribed. Added to the strike automatically against a creature carrying that kind as a trait."
  ],
  "called": [
    "Call the weapon back to your outstretched hand from within the tier's range.",
    "Press Call on the weapon (Command, Contemplative, 2 AP). A creature holding it may resist with a Will save against the weapon's Level DC (its level + 14)."
  ],
  "courageous": [
    "The bonus is the weapon's own potency bonus, so it grows when the potency rune does — against fear effects only.",
    "Applied automatically to saves against fear effects: the potency bonus the weapon's quality allows, minimum +1."
  ],
  "disrupting": [
    "Positive energy on every successful strike. Note that tier I already opens a secondary critical, unlike the elemental runes.",
    "Essence damage on every successful strike (it is enshrouded in positive energy, and deals essence). Tier I already opens a secondary critical on a critical strike, unlike the elemental runes."
  ],
  "flaming": [
    "Activate the weapon to coat it; each strike then deals the tier's secondary fire damage. The higher tiers also open a secondary critical.",
    "Press Activate on the weapon (Command, 1 AP): each hit then deals the tier's secondary fire damage until you switch it off, which is free. At II and III a CRITICAL strike also rolls a secondary critical on the fire table, at the strike's severity."
  ],
  "frost": [
    "Activate the weapon to coat it; each strike then deals the tier's secondary cold damage. The higher tiers also open a secondary critical.",
    "Press Activate on the weapon (Command, 1 AP): each hit then deals the tier's secondary cold damage until you switch it off, which is free. At II and III a CRITICAL strike also rolls a secondary critical on the cold table, at the strike's severity."
  ],
  "ghostTouch": [
    "Works on incorporeal creatures as though they were solid — and an incorporeal creature can pick it up.",
    "Applied automatically: an incorporeal creature's immunity to non-magical attacks and its resistance to all damage do not apply to this weapon's blows."
  ],
  "lifeStealing": [
    "Triggers on a critical hit only — the target's Fortitude save is what stands between them and the drain.",
    "Rolled on a critical hit: the target's Fortitude save against the weapon's Level DC; a failure takes 1d6 Soul Drain and heals you as much. Bleed it inflicts is recurring essence damage."
  ],
  "razor": [
    "See the rune's own text — this one is descriptive rather than a fixed bonus.",
    "Applied automatically on a Keen piercing or slashing melee weapon; suppressed on anything else."
  ],
  "returning": [
    "Thrown weapons only, and it returns after the Strike completes rather than instead of it.",
    "Applied automatically: a thrown Strike does not spend the weapon. If your hands are full it falls in your space."
  ],
  "shifting": [
    "Reshape it into another weapon — which means the runes on it come along, so a Potency III shifting sword is a Potency III anything.",
    "Press Shift on the weapon (Engage, 1 AP). The runes come along, so a Potency III shifting sword is a Potency III anything — and a rune the new form cannot take is suppressed until it shifts back."
  ],
  "shock": [
    "Activate the weapon to coat it; each strike then deals the tier's secondary electricity damage. The higher tiers also open a secondary critical.",
    "Press Activate on the weapon (Command, 1 AP): each hit then deals the tier's secondary electricity damage until you switch it off, which is free. At II and III a CRITICAL strike also rolls a secondary critical on the electricity table, at the strike's severity."
  ],
  "thundering": [
    "Activate the weapon to coat it; each strike then deals the tier's secondary sonic damage. The higher tiers also open a secondary critical.",
    "Press Activate on the weapon (Command, 1 AP): each hit then deals the tier's secondary sonic damage until you switch it off, which is free. At II and III a CRITICAL strike also rolls a secondary critical on the sonic table, at the strike's severity."
  ],
  "vicious": [
    "The feedback is half the extra damage, rounded UP, and it hits you — this rune costs you something every time it works.",
    "Rolled automatically. The feedback is half the extra damage, rounded UP, through your own defences — essence resistance halves it. A wielder with essence resistance or immunity fumbles automatically on an unmodified 1."
  ]
};

export const RUNE_AUTOMATION = {
  "acidic": "action",
  "aligned": "damage",
  "bane": "damage",
  "called": "action",
  "courageous": "conditional",
  "disrupting": "damage",
  "flaming": "action",
  "frost": "action",
  "ghostTouch": "event",
  "lifeStealing": "event",
  "razor": "bonus",
  "returning": "event",
  "shifting": "action",
  "shock": "action",
  "thundering": "action",
  "vicious": "damage"
};
