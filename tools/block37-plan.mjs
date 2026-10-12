/**
 * block37-plan — 3.617.0, block 37 (pages 371–383): consumables and wondrous
 * items. Written to the packs by `author-block37-items.mjs`; the owned-copy
 * side of every engine-read SYSTEM field is in module/data/pack-repairs.mjs.
 *
 * Every row cites the ruling or finding it builds (claude/audit-pages-371-383.md).
 */

/* ───────────────────────────── consumables ───────────────────────────── */

/**
 * Flags merged into `flags.trg-prime.consumable`, and system fields set.
 * Keyed by item name.
 */
export const CONSUMABLES = Object.freeze({
  // C1 / R4: "1d6 secondary fire damage upon your next 5 successful strikes
  // which must be made within an hour" — hits only, a critical is one hit,
  // the fire is secondary and never multiplied. "any melee weapon".
  "Combustion Unguent": {
    consumable: {
      oil: {
        kind: "rider", secondary: { dice: "1d6", type: "fire" }, strikes: 5,
        meleeOnly: true, weaponDuration: "1 hour"
      }
    }
  },
  // C1 / R3: "+1 item bonus to attack and damage for 1 hour", one slashing or
  // piercing weapon or up to 5 pieces of such ammunition. The item bonus does
  // not stack with potency (the attack's own item-bonus rule).
  "Unguent of Sharpness": {
    consumable: {
      oil: {
        kind: "rider", attack: 1, damage: 1, damageTypes: ["slashing", "piercing"],
        weaponDuration: "1 hour", ammoDuration: "1 hour", ammoCount: 5
      }
    }
  },
  // C2: "thrown up to 60 feet … a burst that deals 3d8 points of force damage
  // to all creatures within a 10-foot radius (Basic Reflex DC 22)".
  "Pearl of Force": {
    consumable: {
      special: {
        kind: "burst", formula: "3d8", damageType: "force", radiusFeet: 10,
        rangeFeet: 60, dc: 22, save: "reflex"
      }
    }
  },
  // C4 / R5 / B4: "a DC 20 Medicine check to apply the bandage … lowering all
  // DCs for such healing by 1 for the next 24 hours", then its reaction.
  "Mystical Bandage": {
    consumable: {
      special: { kind: "bandage", skill: "medicine", dc: 20, seconds: 86400, healingDCReduction: 1 }
    }
  },
  // C4: "The hand uses your attack bonus or skill bonus at +2".
  "Assisting Gloves": {
    consumable: { special: { kind: "aid", bonus: 2 } }
  },
  // C3: "+2 status bonus to all Tumble (Acrobatics) checks made within the
  // next hour" — a conditional the check dialog offers on a Tumble.
  "Potion of Tumbling": {
    consumable: {
      effect: {
        label: "Potion of Tumbling", pp: 3, duration: "1 hour",
        effects: [{
          kind: "conditional", label: "Potion of Tumbling", target: "self",
          grants: [{
            kind: "modifier", value: 2, bonusType: "status", label: "Potion of Tumbling",
            scope: "Tumble (Acrobatics) checks", when: { actions: ["tumble"] }
          }]
        }]
      }
    }
  },
  // R6: "every other potion says Interact" — Flying's "Engage (2 AP)" is read
  // as Interact (2 AP). Engine-read (the activation), so it has a repair.
  "Potion of Flying": {
    system: { activation: "Interact (2 AP)" }
  }
});

/* ─────────────────────────────── spells ─────────────────────────────── */

/** System fields set on spells. */
export const SPELLS = Object.freeze({
  // C3 / B5: "The targets can breathe water freely" — a marker the drowning
  // clock reads (module/drowning-workflow.mjs).
  "Water Breathing": {
    effects: [{ kind: "marker", target: "targets", marker: "waterBreathing" }]
  }
});

/* ─────────────────────────────── wondrous ────────────────────────────── */

/** System fields set, flags removed and description rewrites, on existing items. */
export const WONDROUS = Object.freeze({
  // A14: the page calls the healing essence.
  "Gloves of Vitality I": { note: ["This is a positive healing effect.", "This is an essence healing effect."] },
  "Gloves of Vitality II": { note: ["This is a positive healing effect.", "This is an essence healing effect."] },
  // A14: and the old "+15" misprint record goes; the 3.7 page prints +3.
  "Gloves of Vitality III": {
    note: ["This is a positive healing effect.", "This is an essence healing effect."],
    dropFlags: ["printedValue", "correctedValue", "correctedFromPrinted", "correctionRuling"]
  },
  // A14: "This golden amulet" — a neck item. Engine-read (the slot), repaired.
  "Faith’s Eye": { system: { slot: "neck" } }
});

/** The book's items the pack never had (A10; R20). Fixed ids, so re-runs replace. */
export const NEW_WONDROUS = Object.freeze([
  ...[1, 2, 3].map((tier) => {
    const roman = ["I", "II", "III"][tier - 1];
    return {
      _id: `trgRingProtect0${tier}`,
      name: `Ring of Protection ${roman}`,
      level: [6, 12, 18][tier - 1],
      price: [2000, 16000, 180000][tier - 1],
      weight: 0,
      slot: "ring",
      traits: "Invested Warding",
      wondrous: { base: "Ring of Protection", tier: roman, slotInferred: true, activate: "", frequency: "" },
      description: "The ring is a simple band of polished metal, usually silver, gold or blackened steel, "
        + "engraved with fine protective runes along its inner surface.\n\n"
        + "When worn, the markings give off the faintest glimmer. When you invest the ring, you gain a "
        + "status bonus to your DB based upon the items level.\n\n"
        + `The status bonus is +${tier}.`
    };
  }),
  {
    _id: "trgFullSight0001",
    name: "Full Sight",
    level: 15,
    price: 55000,
    weight: 3,
    slot: "head",
    traits: "Insight Invested",
    wondrous: { base: "", tier: "", slotInferred: true, activate: "", frequency: "atWill" },
    description: "The helm is fashioned from dark, supple leather reinforced with narrow bands of blackened "
      + "metal. Strange eye-shaped sigils have been tooled across the brow and temples, each seeming to shift "
      + "subtly when caught in peripheral vision.\n\n"
      + "When worn, the leather tightens comfortably around the head, and a faint silver sheen passes across "
      + "the wearer’s eyes.\n\n"
      + "While invested, the helm allows the wearer to perceive the world as though under the effects of True "
      + "Seeing at will. Illusions blur and fall away, disguises become transparent, and hidden magical "
      + "deceptions are laid bare beneath the helm’s relentless gaze."
  }
]);
