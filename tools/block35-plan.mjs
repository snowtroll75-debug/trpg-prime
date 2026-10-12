/**
 * BLOCK 35, PART ONE (pages 351–360) — what the pack should hold for the
 * spells 3.613.0 builds.
 *
 * Graham's rulings of 2 October 2026 on claude/audit-pages-351-360.md:
 *   R1  Physical Boost: "any check affected by the ability score"
 *   R3  Protector's Sphere as a live aura
 *   R4  Inspire Heroics: one advantage a round however many castings (code)
 *   R5  Shifting Form: the mode chooser, 1d6 claws, half-Speed climb/swim
 *   R12 Weapon Surge: the weapon's own extra die
 *   R13 Sickly Ray: rows gated on the attack's outcome
 *   R14 emotion effects: frightened and fleeing, plus anything from a spell
 *       with the emotion trait
 * and the audit's no-ruling fixes (A1, A2, A3's Success rung, A5, A7, B1–B9).
 *
 * WHOLE FIELDS, NOT MERGES — see author-block34-spells.mjs.
 */

const DARKVISION = "Compendium.trg-prime.abilities.Item.vCbewmPdYNpHNnHl";
const SCENT = "Compendium.trg-prime.abilities.Item.gnDD0w96yHR7sVNv";
const CLAW = "Compendium.trg-prime.creature-attacks.Item.QlUfedrLQVBoECCY";

/** Every check a Constitution, Strength or Dexterity score can affect. */
const PHYSICAL_CHECKS = ["attribute", "skill", "specialist", "save", "attack", "initiative"];

export const PLAN = {
  // A1 — "the attack gains advantage". It held +1 status.
  "Wizard Strike": {
    effects: [
      { kind: "heldBonus", target: "self", label: "Wizard Strike", heldKind: "advantage", checkTypes: ["attack"] }
    ]
  },

  // A2 — "Each UNDEAD creature within the area takes 4d12 essence damage."
  "Purge The Unlife": {
    kindGate: "undead"
  },

  // A3 — the Success rung. The stasis itself is 3.614.0 (R2).
  "Stasis": {
    effects: [
      { kind: "condition", target: "targets", condition: "stunned", value: 1, onSave: ["success"] },
      { kind: "note", onSave: ["failure"], text: "Stasis for 1 round: impervious to all damage, cannot be targeted, no rounds pass for its timed effects, and immovable — applied at the table until 3.614.0." },
      { kind: "note", onSave: ["fumble"], text: "Stasis for 3 rounds: as a Failure, and at the end of each of its turns a new Will save reduces the remaining duration by 1 round, or ends it on a Critical — applied at the table until 3.614.0." }
    ]
  },

  // R3 — "You gain Physical Resistance (adamantine). Furthermore, any ally
  // within the area of effect also gains this resistance." A live aura: held
  // while inside, lost on leaving. The printed "15-foot radius" is centred on
  // the caster ("radiates from you"), so it is recorded as the emanation it is.
  "Protector’s Sphere": {
    area: "15-foot emanation",
    effects: [
      { kind: "defence", target: "targets", field: "resistance", value: "physical (adamantine)" }
    ],
    warps: [
      { ppCost: 6, text: "The resistance also applies against adamantine", mods: { defenceValue: "physical" } },
      { ppCost: 10, text: "The resistance applies against all damage", mods: { defenceValue: "all damage" } }
    ]
  },

  // A5 — "You gain resistance against the triggering attack or effect." The
  // block 34 R3 shape (Element Ward): a resistance until the end of the turn,
  // here to every type, because the trigger is "an attack or effect", not an
  // element.
  "Resilient Fortitude": {
    duration: "until the end of the current turn",
    effects: [
      { kind: "defence", target: "self", field: "resistance", value: "all damage" },
      { kind: "note", text: "The resistance is against the triggering attack or effect only — if something else damages you before the turn ends, remove it first." }
    ],
    warps: [
      { ppCost: 10, text: "you instead gain immunity", mods: { defenceField: "immunity" } }
    ]
  },

  // R5 — "gaining one of the following abilities". The cast asks which.
  "Shifting Form": {
    effects: [
      { kind: "note", text: "Choose one ability as you cast: +20 ft Speed, a climb or swim Speed of half your Speed, darkvision, a pair of claws, or scent." }
    ],
    modeLabel: "Ability",
    modePrompt: "Shifting Form changes your form in a minor way. Choose the ability you gain:",
    apOptions: [
      { ap: 1, label: "+20-foot status bonus to your Speed", range: "", area: "",
        effects: [{ kind: "bonus", target: "self", slot: "speed", bonusType: "status", value: 20 }] },
      { ap: 1, label: "A climb Speed equal to half your Speed", range: "", area: "",
        effects: [{ kind: "speedGrant", target: "self", key: "climb", feet: 0, orLand: true, landFraction: 0.5 }] },
      { ap: 1, label: "A swim Speed equal to half your Speed", range: "", area: "",
        effects: [{ kind: "speedGrant", target: "self", key: "swim", feet: 0, orLand: true, landFraction: 0.5 }] },
      { ap: 1, label: "Darkvision", range: "", area: "",
        effects: [{ kind: "grantAbility", target: "self", uuid: DARKVISION, label: "Darkvision" }] },
      { ap: 1, label: "A pair of claws (1d6 slashing, agile, finesse)", range: "", area: "",
        effects: [{ kind: "grantAbility", target: "self", uuid: CLAW, label: "Claws (Shifting Form)",
          system: { damage: "1d6", damageType: "slashing", traits: "Agile, Finesse", size: "medium", equipped: true } }] },
      { ap: 1, label: "Scent", range: "", area: "",
        effects: [{ kind: "grantAbility", target: "self", uuid: SCENT, label: "Scent" }] }
    ]
  },

  // A7 — "The target is granted fast healing 5" (+1 per +1 PP, max 10), and it
  // targets "1 willing undead creature". Beneficial, so Alignment Channel does
  // not widen it to a demon.
  "Unliving Vitality": {
    kindGate: "undead",
    beneficial: true,
    effects: [
      { kind: "healingRate", target: "targets", rate: "fastHealing", value: 5, label: "Unliving Vitality" }
    ],
    warps: [
      { ppCost: 1, text: "The fast healing increases by 1 (max 10)", mods: { healingRateBump: 1, healingRateMax: 10 } }
    ]
  },

  // B1 — "+2 PP: increase the healing by 1d8+8": the +8 was missing. The turn
  // options and the other four warps are 3.614.0 (R8).
  "Renewal’s Touch": {
    warps: [
      { ppCost: 2, text: "increase the healing by 1d8+8", mods: { healDice: "1d8", healBonus: 8 } },
      { ppCost: 2, text: "target may reduce bleeding by an additional 1", mods: {} },
      { ppCost: 2, text: "the target may also reduce the injured condition by 1 or the dazed and weakened conditions by 2", mods: {} },
      { ppCost: 2, text: "reduce the fatigued condition (or another condition if you have used that option) by an additional 1", mods: {} },
      { ppCost: 4, text: "the target may also reduce the soul drain condition by 5", mods: {} }
    ]
  },

  // B2 — the Fumble's "1 recurring electricity damage", and the warp's "+1".
  "Surge Of The Tempest": {
    effects: [
      { kind: "condition", target: "targets", condition: "dazzled", onSave: ["fumble"], duration: "1 round" },
      { kind: "condition", target: "targets", condition: "recurring", value: 1, damageType: "electricity", onSave: ["fumble"] }
    ],
    warps: [
      { ppCost: 2, text: "The initial damage increases by 1d12, and the recurring electricity damage on a fumble increases by 1", mods: { damageDice: "1d12", conditionBump: 1 } }
    ]
  },

  // B3 — "+2 against emotion effects", and "counteract one emotion effect".
  "Soothing Words": {
    effects: [
      { kind: "bonus", target: "targets", slot: "will", bonusType: "status", value: 1 },
      { kind: "conditional", label: "Soothing Words", target: "targets", grants: [
        { kind: "modifier", value: 2, type: "status", label: "Soothing Words", scope: "Will saves against emotion effects",
          when: { checkTypes: ["save"], subjects: ["will"], traits: ["emotion"] }, auto: true }
      ] },
      { kind: "counteract", target: "targets", label: "Soothing Words", conditions: ["frightened", "fleeing"], traits: ["emotion"], limit: 1 }
    ]
  },

  // B4 — "counteract fear effects" and "effects imposing paralysis".
  "Soothing Ballad": {
    effects: [
      { kind: "heal", target: "targets", formula: "8d8" },
      { kind: "counteract", target: "targets", label: "Soothing Ballad", conditions: ["frightened", "fleeing", "paralyzed"], traits: ["fear"] },
      { kind: "note", text: "The spell also lowers the severity of one Injury on each target by 1 (only once per injury) — applied at the table." }
    ]
  },

  // B5 — the allies' +1 to saves vs fear and disease; "+2 PP: increase both
  // the healing and damage by 1 die".
  "Wash Away Sin": {
    effects: [
      { kind: "heal", target: "allies", formula: "1d8" },
      { kind: "conditional", label: "Wash Away Sin", target: "allies", duration: "until the start of your next turn", grants: [
        { kind: "modifier", value: 1, type: "status", label: "Wash Away Sin", scope: "saves against fear and disease",
          when: { checkTypes: ["save"], traits: ["fear", "disease"] }, auto: true }
      ] }
    ],
    warps: [
      { ppCost: 2, text: "increase both the healing and damage by 1 die", mods: { damageDice: "1d8" } },
      { ppCost: 4, text: "cone increases to 30-feet", mods: { areaOverride: "30-foot cone" } }
    ]
  },

  // B6 — "+4 PP: increase the secondary damage TO 2d6": once.
  "Talon Strike": {
    warps: [
      { ppCost: 4, text: "increase the secondary damage to 2d6", mods: { damageDice: "1d6", once: true } }
    ]
  },

  // B7 — "+3 PP: increase the weakened by 1 (max +5)".
  "Spoil The Profane": {
    warps: [
      { ppCost: 2, text: "increase secondary damage by 1d6 (max 5d6)", mods: { damageDice: "1d6" } },
      { ppCost: 3, text: "increase the weakened by 1 (max +5)", mods: { conditionBump: 1, conditionMax: 5 } }
    ]
  },

  // B8 — "+4 PP: The damage increases by 1, or 1d6 after you cast an essence
  // spell". The warp text read "positive spell".
  "Vibrant Thorns": {
    effects: [
      { kind: "thorns", target: "self", label: "Vibrant Thorns", damage: "1", intensified: "1d6", damageType: "piercing", reachFeet: 5,
        warpStep: { damage: 1, intensified: "1d6" } }
    ],
    warps: [
      { ppCost: 4, text: "The damage increases by 1, or 1d6 after you cast an essence spell", mods: { bonusValue: 1 } }
    ]
  },

  // B9 — "+4 status bonus to skill checks to effectively conceal the secret …
  // the same bonus to saving throws against spells that specifically aim to
  // extract the knowledge". Offered, never automatic: only the table knows
  // what a check is for.
  "Veiled Secret": {
    effects: [
      { kind: "conditional", label: "Veiled Secret", target: "targets", grants: [
        { kind: "modifier", value: 4, type: "status", label: "Veiled Secret", scope: "skill checks to conceal the secret", when: { checkTypes: ["skill"] } },
        { kind: "modifier", value: 4, type: "status", label: "Veiled Secret", scope: "saves against spells or effects that aim to extract or coerce the secret", when: { checkTypes: ["save"] } }
      ] },
      { kind: "note", text: "Only those who know the chosen secret benefit. Casting it again ends any previous Veiled Secret of yours." }
    ]
  },

  // R1 — "the next Constitution, Strength, or Dexterity based check".
  "Physical Boost": {
    effects: [
      { kind: "heldBonus", target: "targets", label: "Physical Boost", value: 1, bonusType: "status",
        checkTypes: PHYSICAL_CHECKS, abilities: ["strength", "dexterity", "constitution"] }
    ]
  },

  // R12 — "+1 status bonus to the attack roll, and the weapon deals an
  // additional die of damage", on the next Strike with it before the start
  // of your next turn.
  "Weapon Surge": {
    duration: "until the start of your next turn",
    effects: [
      { kind: "heldBonus", target: "self", label: "Weapon Surge", value: 1, bonusType: "status", checkTypes: ["attack"] },
      { kind: "strikeRider", target: "self", label: "Weapon Surge", weaponDie: true, scope: "any", once: true, weaponScoped: true },
      { kind: "note", text: "If the weapon leaves your possession, Weapon Surge ends — remove it." }
    ]
  },

  // R13 — the attack's outcome picks the row.
  "Sickly Ray": {
    effects: [
      { kind: "condition", target: "targets", condition: "sickened", value: 1, onAttack: ["hit"] },
      { kind: "condition", target: "targets", condition: "sickened", value: 2, onAttack: ["critical"] },
      { kind: "condition", target: "targets", condition: "slowed", value: 1, onAttack: ["critical"], endsWith: "sickened" }
    ]
  }
};
