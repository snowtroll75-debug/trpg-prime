/**
 * BLOCK 34 (pages 341–350) — what the pack should hold, spell by spell.
 *
 * 3.611.0. Graham's rulings of 2 October 2026: R1–R10 "Your
 * recommendation", and R2 "Should be +3" / "This is an auto warp if 14 or
 * more PP are spent on the spell". The audit is
 * claude/audit-pages-341-350.md; each entry here names the page it answers.
 *
 * WHOLE FIELDS, NOT MERGES — see author-block34-spells.mjs.
 */

// THE FOUR DEGREES THE WORDS PRINT (3.611.1, F1 of the 3.611.0 drive). The
// immunity rows first named all seven, and a degree a row NAMES stops
// falling back to the nearest printed rung — so a Blunder applied no stun
// and no blindness, a Partial no stun, and a Heroic was not read as a
// Critical. Naming the printed four keeps every degree reaching a rung,
// and every one of those rungs carries the immunity.
const PRINTED_DEGREES = ["critical", "success", "failure", "fumble"];

export const PLAN = {
  /* ---------------------------------------------------------------- *
   * A. WRONG, OR DOING NOTHING
   * ---------------------------------------------------------------- */

  // A1 — "You weave the fabric of fear …" Critical unaffected; Success −20
  // mental critical injury, frightened 1; Partial −10, frightened 2;
  // Failure a mental critical injury, frightened 2; Fumble a Fortitude
  // save: failure dies, success +10 mental critical injury, fleeing until
  // the end of its next turn, frightened 4.
  "Woeful Dread": {
    effects: [
      { kind: "criticalInjury", target: "targets", onSave: ["success"], damageType: "mental", modifier: -20 },
      { kind: "condition", target: "targets", onSave: ["success"], condition: "frightened", value: 1 },
      { kind: "criticalInjury", target: "targets", onSave: ["partial"], damageType: "mental", modifier: -10 },
      { kind: "condition", target: "targets", onSave: ["partial"], condition: "frightened", value: 2 },
      { kind: "criticalInjury", target: "targets", onSave: ["failure"], damageType: "mental" },
      { kind: "condition", target: "targets", onSave: ["failure"], condition: "frightened", value: 2 },
      {
        kind: "followUpSave", target: "targets", onSave: ["fumble"], save: "fortitude",
        label: "Woeful Dread — a fear that risks its life",
        rungs: {
          success: [
            { kind: "criticalInjury", damageType: "mental", modifier: 10 },
            { kind: "condition", condition: "fleeing", duration: "until the end of its next turn" },
            { kind: "condition", condition: "frightened", value: 4 }
          ],
          failure: { slays: true }
        }
      },
      { kind: "note", text: "Only the targeted creatures can perceive the apparitions. The +2 PP option (ignoring abilities that improve fear saves or lower the condition, but not fear immunity) is applied at the table." }
    ]
  },

  // A2 — Critical stunned 1; Success stunned 2; Failure stunned for 1 round;
  // Fumble stunned for 1d6 rounds; then immune for 10 minutes. "Stunned
  // for 1 round" is read as a full turn's AP (stunned 3), and the Fumble as
  // that held for 1d6 rounds — see the release notes.
  "Word Of Stunning": {
    effects: [
      { kind: "condition", target: "targets", onSave: ["critical"], condition: "stunned", value: 1 },
      { kind: "condition", target: "targets", onSave: ["success"], condition: "stunned", value: 2 },
      { kind: "condition", target: "targets", onSave: ["failure"], condition: "stunned", value: 3 },
      { kind: "condition", target: "targets", onSave: ["fumble"], condition: "stunned", value: 3, hold: true, durationRoll: "1d6 rounds" },
      { kind: "tempImmunity", target: "targets", onSave: PRINTED_DEGREES, length: "10 minutes", label: "Word Of Stunning" }
    ]
  },

  // A3 — Success fatigued 1 for 1 round; Failure fatigued 1 for 1 minute;
  // Fumble fatigued 1. "+2 PP: increase the level of fatigue by 1 (max 5)."
  "Waves Of Fatigue": {
    effects: [
      { kind: "condition", target: "targets", onSave: ["success"], condition: "fatigued", value: 1, duration: "1 round" },
      { kind: "condition", target: "targets", onSave: ["failure"], condition: "fatigued", value: 1, duration: "1 minute" },
      { kind: "condition", target: "targets", onSave: ["fumble"], condition: "fatigued", value: 1 },
      { kind: "note", text: "Castings stack: a second casting and a failed save leaves two levels of fatigue." }
    ],
    warps: [{ ppCost: 2, text: "increase the level of fatigue by 1 (max 5)", mods: { conditionBump: 1, conditionMax: 5 } }]
  },

  // A4 — "flat-footed until the end of its next turn".
  "Word Of Distraction": {
    effects: [{ kind: "condition", target: "targets", condition: "flatFooted", duration: "until the end of its next turn" }]
  },

  // A5 — "Every ally within the area … +10 status bonus to their initiative
  // roll … 5 temporary HP." "+4 PP: increase the bonus and HP by +5 (max +20)."
  "Battle’s Call": {
    areaTargeting: "allies",
    effects: [
      { kind: "tempHP", target: "targets", formula: "5" },
      { kind: "bonus", target: "targets", slot: "initiative", bonusType: "status", value: 10, duration: "1 round" },
      { kind: "note", text: "Cast as initiative is about to be rolled; roll it after the cast so the bonus is on the roll." }
    ],
    warps: [{ ppCost: 4, text: "increase the bonus and HP by +5 (max +20)", mods: { bonusValue: 5, bonusMax: 20, tempHPBonus: 5 } }]
  },

  // A5 — "By expending 1 to 3 AP … you can target creatures equal to the
  // amount of AP expended … 5d6 HP … coming back from dying due to this
  // healing doesn't increase its Fatigued condition." R7: a choice of AP,
  // up to that many living creatures within the 20-foot radius.
  "Death’s Defiance": {
    area: "",
    range: "20 feet",
    kindGate: "living",
    modeLabel: "Action Points",
    modePrompt: "Death's Defiance heals one living creature within 20 feet for each AP you spend. Choose how to cast it:",
    apOptions: [
      { ap: 1, label: "1 AP — 1 living creature within 20 feet", range: "20 feet", area: "", targets: "1 living creature" },
      { ap: 2, label: "2 AP — 2 living creatures within 20 feet", range: "20 feet", area: "", targets: "2 living creatures" },
      { ap: 3, label: "3 AP — 3 living creatures within 20 feet", range: "20 feet", area: "", targets: "3 living creatures" }
    ],
    effects: [{ kind: "heal", target: "targets", formula: "5d6", noDyingFatigue: true }]
  },

  // A6 — "If the target fumbles the save, it also suffers Dazed 1 until the
  // end of its next turn." "+2 PP: Increase the damage by 1d6 (max 5d6) and
  // Dazed by 1 (max 5)."
  "Cloud Mind": {
    effects: [{ kind: "condition", target: "targets", onSave: ["fumble", "blunder"], condition: "dazed", value: 1, duration: "until the end of its next turn" }],
    warps: [{ ppCost: 2, text: "Increase the damage by 1d6 (max 5d6) and Dazed by 1 (max 5)", mods: { damageDice: "1d6", conditionBump: 1, conditionMax: 5 } }]
  },

  // A7 — Failure friendly (helpful if already friendly — `charmedTo`
  // already steps a creature at the floor); Fumble helpful.
  "Charm Undead": {
    effects: [
      { kind: "attitude", target: "targets", to: "friendly", onSave: ["failure"] },
      { kind: "attitude", target: "targets", to: "helpful", onSave: ["fumble", "blunder"] },
      { kind: "note", text: "It can't take hostile actions against you, and any act that threatens it breaks the spell — both GM-adjudicated. A mindless undead gets no save and becomes your minion, commanded when you Sustain." }
    ]
  },

  // A8 / R1 — "If the target has 100 HP or fewer, it dies instantly;
  // otherwise, it drops to 0 HP." (3.8.1.)
  "Word Of Death": {
    effects: [{
      kind: "flatLadder", label: "Word Of Death", target: "targets", damageType: "untyped", save: "Will", immuneSeconds: 600,
      ladder: {
        critical: { damage: 20 },
        success: { damage: 50, diesIfReducedToZero: true },
        failure: { diesAtOrBelow: 100, dropsTo: 0 },
        fumble: { dies: true }
      }
    }]
  },

  // A9 / R2 — "+2 status bonus to Will saves against mental effects".
  // "+2 PP: increase temporary HP by 1." "PP 14: the status bonus
  // increases to +3" — automatic at 14 PP or more.
  "Zealous Conviction": {
    effects: [
      { kind: "tempHP", target: "targets", formula: "5" },
      {
        kind: "conditional", label: "Zealous Conviction", target: "targets", ppBelow: 14,
        grants: [{ kind: "modifier", value: 2, type: "status", label: "Zealous Conviction", scope: "Will saves against mental effects", when: { checkTypes: ["save"], subjects: ["will"], traits: ["mental"] }, auto: true }]
      },
      {
        kind: "conditional", label: "Zealous Conviction", target: "targets", ppAtLeast: 14,
        grants: [{ kind: "modifier", value: 3, type: "status", label: "Zealous Conviction", scope: "Will saves against mental effects (14 PP or more)", when: { checkTypes: ["save"], subjects: ["will"], traits: ["mental"] }, auto: true }]
      },
      { kind: "note", text: "A target compelled by your command complies; at the end of each of its turns it can attempt a Will save to end the spell on itself — GM-adjudicated." }
    ],
    warps: [{ ppCost: 2, text: "increase temporary HP by 1", mods: { tempHPBonus: 1 } }]
  },

  /* ---------------------------------------------------------------- *
   * B. DATA
   * ---------------------------------------------------------------- */

  // "once the target has been affected, they become temporarily immune to
  // the spell for 10 minutes."
  "Word Of Blinding": {
    effects: [
      { kind: "condition", target: "targets", condition: "dazzled", onSave: ["critical"], duration: "1 round" },
      { kind: "condition", target: "targets", condition: "dazzled", onSave: ["success"], duration: "1 minute" },
      { kind: "condition", target: "targets", condition: "blinded", onSave: ["failure"], durationRoll: "1d4 minutes" },
      { kind: "condition", target: "targets", condition: "blinded", onSave: ["fumble"], duration: "permanent" },
      { kind: "tempImmunity", target: "targets", onSave: PRINTED_DEGREES, length: "10 minutes", label: "Word Of Blinding" }
    ]
  },

  // "+1 status bonus to one mental ability score (Int, Wis or Cha),
  // selected when casting".
  // G2 of the 3.611.0 drive: "you may affect up to 6 targets" — the
  // caster's choice, held to six by the warp's own total.
  Wits: {
    areaChoice: true,
    effects: [{ kind: "bonus", target: "targets", chooseFrom: "mental", value: 1, bonusType: "status", label: "Wits" }]
  },

  // "+1 status bonus attack rolls and saves against fear effects."
  "Inspire Courage": {
    effects: [
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: 1 },
      {
        kind: "conditional", label: "Inspire Courage", target: "targets",
        grants: [{ kind: "modifier", value: 1, type: "status", label: "Inspire Courage", scope: "saving throws against fear effects", when: { checkTypes: ["save"], traits: ["fear"] }, auto: true }]
      }
    ]
  },

  // "You and all allies in the area gain a +1 status bonus to DB and saving throws."
  "Inspire Defence": {
    effects: [
      { kind: "bonus", target: "targets", slot: "defence", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "fortitude", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "reflex", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "will", bonusType: "status", value: 1 }
    ]
  },

  // "+1 status bonus all checks, DC's and DB."
  "Augment Conjuration": {
    effects: [
      { kind: "bonus", target: "targets", slot: "defence", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "fortitude", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "reflex", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "will", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "allSkills", bonusType: "status", value: 1 },
      { kind: "bonus", target: "targets", slot: "spellcraft", bonusType: "status", value: 1 },
      { kind: "note", text: "The bonus also applies to the creature's DCs — by hand." }
    ]
  },

  // "frightened 1 and are incapable of diminishing the effect."
  "Haunting Miasma": {
    effects: [{ kind: "condition", target: "targets", condition: "frightened", value: 1, floor: true }]
  },

  // "the ability to fly with a speed equal to your Speed … descend slowly
  // and safely … akin to … feather fall."
  "Gustborn Movement": {
    effects: [
      { kind: "speedGrant", target: "self", key: "fly", feet: 0, orLand: true },
      { kind: "note", text: "Still airborne when the spell ends, you drift down as Feather Fall. The +2 PP option (no difficult terrain flying against the wind) is applied at the table." }
    ]
  },

  // "+5-foot status bonus to your Speed and the ability to ignore difficult terrain."
  Fluidity: {
    effects: [
      { kind: "bonus", target: "self", slot: "speed", bonusType: "status", value: 5 },
      { kind: "terrainFreedom", target: "self" },
      { kind: "note", text: "You may Stride or Step as part of casting." }
    ]
  },

  // "Choose whether the spell's area is a 15-foot emanation or a 15-foot cone."
  "Localised Quake": {
    modeLabel: "Shape",
    modePrompt: "Localised Quake shakes a 15-foot emanation or a 15-foot cone. Choose the shape:",
    apOptions: [
      { ap: 2, label: "15-foot emanation", range: "", area: "15-foot emanation" },
      { ap: 2, label: "15-foot cone", range: "", area: "15-foot cone" }
    ],
    effects: [{ kind: "note", text: "Only creatures standing on solid ground are affected — a flying creature is not." }]
  },

  // "subjecting it to the effects of the spell command" — Command's rows.
  "Coercive Retribution": {
    effects: [
      { kind: "note", onSave: ["failure"], text: "For the FIRST action on its next turn, it must use a single action to do as commanded." },
      { kind: "note", onSave: ["fumble"], text: "It must use ALL its actions on its next turn to obey the command." },
      { kind: "note", text: "The target can't Delay or take reactions until it has obeyed. Requirement: your most recent action dealt it damage — the table's call." }
    ]
  },

  // "The aura sheds dim light (+1 light level) in the area."
  "Ember Of Devotion": {
    effects: [
      { kind: "bonus", target: "targets", slot: "will", bonusType: "status", value: 1 },
      { kind: "light", source: "ember-of-devotion", target: "self" }
    ]
  },

  // "A bright light emanates from you in a 10-foot radius (increasing the
  // light level by three steps)."
  Luminance: {
    effects: [
      { kind: "perTurn", target: "targets", formula: "1d8", mode: "heal", undeadMode: "damage", undeadDamageType: "essence" },
      { kind: "light", source: "luminance", target: "self" }
    ]
  },

  // "restoring 2d6 HP and reducing its bleed condition by 1." Warps: +1d6;
  // +1 bleed; reduce dazed or weakened by 1; reduce injured by 1.
  "Animal Healing": {
    kindGate: "animal",
    effects: [
      { kind: "heal", target: "targets", formula: "2d6", bleedAlternative: 1, bleedAndHeal: true },
      { kind: "conditionRelief", target: "targets", label: "Animal Healing", condition: "dazed", amount: 1, choices: ["dazed", "weakened"], unlockedBy: "dazedOrWeakened" },
      { kind: "conditionRelief", target: "targets", label: "Animal Healing", condition: "injured", amount: 1, unlockedBy: "injured" }
    ],
    warps: [
      { ppCost: 1, text: "the amount of healing increases by 1d6", mods: { damageDice: "1d6" } },
      { ppCost: 2, text: "the amount bleeding reduced increases by 1", mods: { bleedPoints: 1 } },
      { ppCost: 2, text: "reduce the dazed or weakened condition by 1", mods: { unlocks: ["dazedOrWeakened"] } },
      { ppCost: 3, text: "reduce the injured condition by 1", mods: { unlocks: ["injured"] } }
    ]
  },

  // "+4 PP: the spell removes the fatigue permanently."
  "Banish Fatigue": {
    effects: [
      // Ignored for the hour — unless the +4 PP option removes the points
      // instead (3.611.1, F3 of the 3.611.0 drive).
      { kind: "suppress", target: "targets", condition: "fatigued", amount: 1, label: "Banish Fatigue", supersededBy: "permanent" },
      { kind: "conditionRelief", target: "targets", label: "Banish Fatigue", condition: "fatigued", amount: 1, unlockedBy: "permanent" }
    ],
    warps: [
      { ppCost: 2, text: "ignore an additional point of fatigue", mods: { suppressBump: 1, reliefBump: 1 } },
      { ppCost: 4, text: "the spell removes the fatigue permanently", mods: { unlocks: ["permanent"] } }
    ]
  },

  // "+2 PP: you may use Inspiration to modify an attack check or a saving
  // throw. +2 PP: increase the die by one step (max d10). +6 PP: roll an
  // additional die."
  Inspiration: {
    warps: [
      { ppCost: 2, text: "you may use Inspiration to modify an attack check or a saving throw", mods: { heldChecks: ["attack", "save"] } },
      { ppCost: 2, text: "increase the die by one step (max d10)", mods: { heldDieStep: 1, heldDieFrom: "1d6" } },
      { ppCost: 6, text: "roll an additional die", mods: { heldDice: 1 } }
    ]
  },

  // "All creatures within the spell's radius, including yourself, have
  // their DR reduced by 3." "+4 PP: increase the amount you reduce by 1."
  "Devastating Might": {
    effects: [
      { kind: "bonus", target: "targets", slot: "dr", bonusType: "status", value: -3 },
      { kind: "note", text: "The +6, +8 and +10 PP options (negating physical resistance except adamantine, all physical resistance, then all resistance) are applied at the table." }
    ],
    warps: [
      { ppCost: 4, text: "increase the amount you reduce by 1", mods: { bonusValue: 1 } },
      { ppCost: 6, text: "also negate physical resistance (except adamantine)", mods: {} },
      { ppCost: 8, text: "also negate all physical resistance", mods: {} },
      { ppCost: 10, text: "negate all resistance", mods: {} }
    ]
  },

  /* ---------------------------------------------------------------- *
   * R3 — REACTIONS TO AN INCOMING HIT. Cast between the announced hit and
   * its damage (Graham's Cutting Words sequence); the resistance lasts
   * until the end of the current turn.
   * ---------------------------------------------------------------- */

  // "You gain Physical Resistance (non-magic) against this attack."
  // "+4 PP: the spell effects magical physical attacks."
  "Windy Escape": {
    duration: "until the end of the current turn",
    effects: [{ kind: "defence", target: "self", field: "resistance", value: "mundane" }],
    warps: [{ ppCost: 4, text: "the spell effects magical physical attacks", mods: { defenceValue: "physical" } }]
  },

  // "grants them fire resistance against the triggering effect."
  // "+4 PP: the resistance lasts for 1 minute."
  "Deflect Flame": {
    duration: "until the end of the current turn",
    effects: [{ kind: "defence", target: "targets", field: "resistance", value: "fire" }]
  },

  // "You gain resistance acid, cold, electricity, or fire damage from the
  // triggering effect (choose one type)." "+8 PP: you instead gain immunity."
  "Element Ward": {
    duration: "until the end of the current turn",
    effects: [{ kind: "defence", target: "self", field: "resistance", value: "fire", valueChoices: ["acid", "cold", "electricity", "fire"] }],
    warps: [{ ppCost: 8, text: "you instead gain immunity", mods: { defenceField: "immunity" } }]
  },

  /* ---------------------------------------------------------------- *
   * R5 and R10 — DAMAGE ROWS
   * ---------------------------------------------------------------- */

  // "1d8 sonic damage, which is increased to 1d12 if you have successfully
  // dealt damage to an enemy earlier in the same turn through a Strike or spell."
  "Destructive Roar": {
    damage: {
      formula: "1d8", type: "sonic", persistent: "",
      upgrade: {
        from: 8, to: 12,
        ask: "Have you dealt damage to an enemy earlier this turn with a Strike or a spell?",
        because: "damage already dealt to an enemy this turn"
      }
    }
  },

  // "2d6 plus your melee damage modifier" — Strength (page 199).
  "Guiding Stone": {
    damage: { formula: "2d6", type: "bludgeoning", persistent: "", addAbility: "strength" }
  }
};
