/**
 * block33-plan — what 3.609.0 writes to the spells pack, as data.
 *
 * Block 33 (pages 331–340, Sympathy to Warp Mind) and Graham's rulings of
 * 1 October 2026: R1 "Yes", R2–R10 "As recommended", R3 "Yes". This plan
 * carries everything but the walls (R9) and Storm Of Vengeance, which
 * follow in 3.610.0.
 *
 * Every row quotes the page it comes from in the audit
 * (claude/audit-pages-331-340.md). WHOLE FIELDS ARE REPLACED, as every
 * plan before this one: the pack-repair manifest records old → new per
 * field, which only means something when "new" is the whole field.
 */

const note = (text, onSave) => (onSave ? { kind: "note", onSave, text } : { kind: "note", text });
const ALL = ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"];

export const PLAN = {
  /* ---------------------------------------------------------------- *
   * R1 — the two damaging ladders that rolled no damage.
   * ---------------------------------------------------------------- */
  "Wail Of The Banshee": {
    // "Each living foe suffers 8d10 essence damage" — enemies only (already
    // so), and living: neither undead nor construct.
    kindGate: "living",
    effects: [
      {
        kind: "saveLadder", target: "targets",
        ladder: { heroic: "", critical: "half", success: "full", failure: "full", fumble: "double", blunder: "" },
        criticalOn: { failure: "serious", fumble: "deadly" },
        slaysOn: ["blunder"]
      }
    ]
  },
  "Volcanic Inferno": {
    effects: [
      {
        kind: "saveLadder", target: "targets",
        ladder: { critical: "", success: "half", failure: "full", fumble: "full" },
        // "a light fire critical"
        criticalOn: { fumble: "minor" },
        // "creatures in the area and those within 5 feet of the cylinder
        // automatically take 3d6 fire damage … regardless of the results
        // of their saving throws"
        regardless: { formula: "3d6", type: "fire", reachFeet: 5 }
      },
      // ENCASED: "slowed 1 and … a -10-foot circumstance penalty to its
      // Speeds", until it Escapes against the spell DC.
      { kind: "condition", target: "targets", condition: "slowed", value: 1, onSave: ["failure", "fumble"], escape: true },
      { kind: "bonus", target: "targets", slot: "allSpeeds", bonusType: "circumstance", value: -10, onSave: ["failure", "fumble"], escape: true },
      note("Encased in rock: Escape against the spell DC breaks free, or 50 damage to the rock (by hand).", ["failure", "fumble"]),
      note("A flying creature that is encased descends 20 feet, taking no falling damage — by hand.")
    ]
  },

  /* ---------------------------------------------------------------- *
   * R2 — the same fault on earlier pages.
   * ---------------------------------------------------------------- */
  "Incandescence": {
    effects: [
      {
        kind: "saveLadder", target: "targets",
        ladder: { critical: "", success: "half", failure: "full", fumble: "double" },
        // "Success … the object deals no recurring fire damage. Failure …
        // full recurring damage. Fumble … double recurring damage."
        persistentOn: { failure: 1, fumble: 2 }
      },
      note("Target the creature wearing or carrying the metal item. A creature holding the item may drop it to "
        + "improve its save by one step — by hand. On an unattended item the spell needs no save and is harmless.")
    ],
    // "+2 PP: damage increases by 1d6 and the persistent by 1d4" — the
    // recurring die, which `persistent` (a bare number) could not hold.
    warps: [
      { ppCost: 2, text: "damage increases by 1d6 and the persistent by 1d4", mods: { damageDice: "1d6", persistentDice: "1d4" } }
    ]
  },
  "Gust": {
    effects: [
      // The 2d6 is the Fumble's alone: "pushed 30 feet in the wind's
      // direction, knocked prone, and takes 2d6 bludgeoning damage".
      { kind: "saveLadder", target: "targets", ladder: { critical: "", success: "", partial: "", failure: "", fumble: "2d6" } },
      { kind: "condition", target: "targets", condition: "prone", onSave: ["failure", "fumble"] },
      { kind: "forcedMove", target: "targets", label: "Gust", feet: 30, direction: "away", onSave: ["fumble"] },
      note("Cannot move against the wind.", ["success"]),
      note("Moving against the wind counts as difficult terrain.", ["partial"]),
      note("Knocked prone. A FLYING creature suffers the fumble result instead — by hand.", ["failure"]),
      note("Pushed 30 feet downwind, knocked prone, and takes 2d6 bludgeoning.", ["fumble"])
    ]
  },
  "Portal Maelstrom": {
    effects: [
      // "All creatures must make a saving throw at the beginning of their
      // turn" — and "each target takes a force critical as if the saving
      // throw was Basic".
      {
        kind: "saveLadder", target: "targets",
        recurring: {
          save: "reflex", on: "startOfTurn", damageType: "force", basicCriticals: true,
          ladder: { critical: "", success: "4d8", failure: "8d8", fumble: "12d8" }
        }
      },
      { kind: "difficultTerrain", label: "Portal Maelstrom", target: "area" },
      note("Leaps free — unaffected.", ["critical"]),
      note("4d8 force damage and slowed 1 for 1 round.", ["success"]),
      note("8d8 force damage, teleported 1d4×10 feet in a random direction, landing prone.", ["failure"]),
      note("12d8 force damage and shunted into an adjacent plane for 1 round.", ["fumble"]),
      note("Each creature saves when it BEGINS its turn in the maelstrom; the damage and the force critical are "
        + "rolled then. The slow, the teleport and the shunt are applied by hand.")
    ]
  },
  "Phantasmal Killer": {
    kindGate: "living",
    effects: [
      {
        kind: "saveLadder", target: "targets", damageType: "mental",
        ladder: { critical: "", success: "4d6", partial: "6d6", failure: "8d6", fumble: "12d6" },
        criticalOn: { partial: "minor", failure: "serious", fumble: "deadly" }
      },
      { kind: "condition", target: "targets", condition: "frightened", value: 1, onSave: ["success"] },
      { kind: "condition", target: "targets", condition: "frightened", value: 2, onSave: ["partial", "failure"] },
      { kind: "condition", target: "targets", condition: "frightened", value: 4, onSave: ["fumble"] },
      { kind: "condition", target: "targets", condition: "fleeing", onSave: ["fumble"], duration: "1 round" },
      // "It must attempt a Fortitude save; if the target fails, it dies."
      {
        kind: "followUpSave", target: "targets", onSave: ["fumble"], save: "fortitude",
        label: "Phantasmal Killer — so afraid it might die",
        rungs: { success: [], failure: { slays: true } }
      },
      note("Unaffected.", ["critical"]),
      note("4d6 mental damage and frightened 1.", ["success"]),
      note("6d6 mental damage, a Minor Critical and frightened 2.", ["partial"]),
      note("8d6 mental damage, a Serious Critical and frightened 2.", ["failure"]),
      note("A Fortitude save or the target DIES. Surviving it: 12d6 mental, a Deadly Critical, fleeing until the end of its next turn, and frightened 4.", ["fumble"])
    ],
    warps: [
      { ppCost: 1, text: "the damage increases by 1d6 on a failure and by 2d6 on a fumble", mods: { rungDice: { failure: "1d6", fumble: "2d6" } } }
    ]
  },
  "Touch Of Undeath": {
    kindGate: "living",
    effects: [
      {
        kind: "saveLadder", target: "targets",
        ladder: { critical: "", success: "half", failure: "full", fumble: "double" },
        criticalOn: { failure: "minor", fumble: "minor" }
      }
    ]
  },

  /* ---------------------------------------------------------------- *
   * R3 — Turn Undead.
   * ---------------------------------------------------------------- */
  "Turn Undead": {
    effects: [
      {
        kind: "turnSave", label: "Turn Undead", save: "will", maxLevel: 1, stepLevels: 4,
        rungs: {
          critical: [],
          success: [{ kind: "condition", condition: "stunned", value: 1, ignoreImmunity: true }],
          failure: [{ kind: "condition", condition: "fleeing", duration: "1 round" }],
          fumble: [{ kind: "condition", condition: "fleeing", duration: "1 round" }]
        },
        criticalOn: { fumble: { severity: "minor", damageType: "essence" } },
        remark: "Only undead that can see or hear the caster are turned — the table's call."
      }
    ],
    warps: [
      { ppCost: 1, text: "increase the level of affected undead by 1", mods: { levelBump: 1 } }
    ]
  },

  /* ---------------------------------------------------------------- *
   * R4 — data with nothing to decide.
   * ---------------------------------------------------------------- */
  "Unprepared Combatant": {
    effects: [
      { kind: "bonus", target: "targets", slot: "defence", bonusType: "circumstance", value: -2, onSave: ["failure"] },
      { kind: "bonus", target: "targets", slot: "defence", bonusType: "circumstance", value: -4, onSave: ["fumble"] },
      { kind: "bonus", target: "targets", slot: "reflex", bonusType: "circumstance", value: -4, onSave: ["fumble"] }
    ]
  },
  "Wall Of Light": {
    damage: { formula: "2d8", type: "essence", persistent: "" },
    damageScope: "kinds:undead,ooze"
  },
  "Voice Of Healing": {
    warps: [
      { ppCost: 2, text: "ignore the injured condition", mods: { suppressConditions: ["injured"] } },
      { ppCost: 2, text: "the amount of healing increases by 1d6+6", mods: { healDice: "1d6", healBonus: 6 } },
      { ppCost: 2, text: "ignore a further -1 injury (max -5)", mods: { suppressBump: 1, suppressMax: 5 } },
      { ppCost: 2, text: "reduce a bleeding wound by 1", mods: { bleedPoints: 1 } }
    ]
  },
  "Vital Beacon": {
    warps: [
      { ppCost: 2, text: "the beacon restores an additional die of HP", mods: { damageDice: "1d12" } },
      { ppCost: 4, text: "the beacon may also stop bleeding at a rate of 1 point per die of healing used", mods: { stopsBleeding: true } }
    ]
  },
  "Umbral Blast": {
    warps: [
      { ppCost: 2, text: "The cold damage increases by 1d10, and the essence damage by 1d4", mods: { damageDice: "1d10", secondaryDice: "1d4" } }
    ],
    effects: [
      // R5: "A target that takes a critical injury must also make a
      // Fortitude Save."
      {
        kind: "followUpSave", target: "targets", trigger: "critical", save: "fortitude",
        label: "Umbral Blast — the darkness in its eyes",
        rungs: {
          success: [],
          failure: [{ kind: "condition", condition: "blinded", roundsPerMargin: 1 }],
          fumble: [{ kind: "condition", condition: "blinded", duration: "permanent" }]
        }
      },
      note("Any light effects the blast overlaps may be countered — by hand.")
    ]
  },
  "Sunburst": {
    warps: [
      { ppCost: 2, text: "The fire damage increases by 1d10, and the essence damage against undead increases by 1d4", mods: { damageDice: "1d10", secondaryDice: "1d4" } }
    ]
  },
  "Meteor Swarm": {
    warps: [
      { ppCost: 2, text: "The bludgeoning damage increases by 1d10, and the fire damage increases by 2d6", mods: { damageDice: "1d10", secondaryDice: "2d6" } }
    ]
  },
  "Tangling Creepers": {
    effects: [
      note("Creatures moving on land, or climbing or swimming within the creepers, take a -10-foot circumstance "
        + "penalty to their Speeds while in the area. As part of casting and then once per round as a 1 AP attack "
        + "action, a vine with 15-foot reach makes a Grapple using your Spellcraft bonus.")
    ]
  },
  "Telekinetic Manoeuvre": {
    effects: [
      { kind: "maneuver", target: "targets", label: "Telekinetic Manoeuvre", penalty: 0, actions: ["disarmAttack", "shoveAttack", "tripAttack"] }
    ]
  },
  "Unshakable": {
    effects: [
      { kind: "defence", target: "self", field: "immunity", value: "stunned" },
      note("The +4 PP option (range touch, arcane only) is cast by hand on another creature.")
    ]
  },
  "Unwelcome Halo": {
    effects: [
      { kind: "light", source: "unwelcome-halo", target: "targets", onSave: ["success"], duration: "1 round" },
      { kind: "light", source: "unwelcome-halo", target: "targets", onSave: ["failure", "fumble"] },
      // "all attacks made against the target receive a +2-circumstance
      // bonus" — carried by the target as -2 to its Defence.
      { kind: "bonus", target: "targets", slot: "defence", bonusType: "circumstance", value: -2, onSave: ["fumble"] },
      note("Sheds light until the beginning of its next turn.", ["success"])
    ]
  },
  "Tame": {
    effects: [
      { kind: "attitude", target: "targets", steps: 1 },
      { kind: "tempImmunity", target: "targets", length: "1 day", label: "Tame" },
      note("Once the spell ends the target is temporarily immune for 1 day.")
    ]
  },
  "Telepathic Demand": {
    effects: [
      { kind: "tempImmunity", target: "targets", onSave: ["success"], length: "1 day", label: "Telepathic Demand" },
      { kind: "tempImmunity", target: "targets", onSave: ["critical"], length: "1 month", label: "Telepathic Demand" },
      note("Resists, and is immune to your demands for 1 month.", ["critical"]),
      note("Resists, and is immune to your demands for 1 day.", ["success"]),
      note("Acts on your message as a suggestion. A message of 25 words or fewer; the target may reply in as many.", ["failure", "fumble"])
    ]
  },
  "Warp Mind": {
    effects: [
      { kind: "condition", target: "targets", condition: "confused", onSave: ["failure"], duration: "1 minute" },
      { kind: "condition", target: "targets", condition: "confused", onSave: ["fumble"], duration: "permanent" },
      note("Spends the first action of its next turn confused.", ["success"]),
      note("Confused for 1 minute.", ["failure"]),
      note("Confused PERMANENTLY.", ["fumble"]),
      // "Regardless of the outcome, the target becomes temporarily immune
      // to the spell for 10 minutes."
      { kind: "tempImmunity", target: "targets", onSave: ALL, length: "10 minutes", label: "Warp Mind" }
    ]
  },

  /* ---------------------------------------------------------------- *
   * R5 — the second save (Umbral Blast's is above).
   * ---------------------------------------------------------------- */
  // `hold` (3.609.1, the 3.609.0 live test's F4): the stun stays at 1 for the
  // minute instead of being spent at the first turn; the save ends it.
  "Vision Of Havoc": {
    effects: [
      {
        kind: "followUpSave", target: "targets", onSave: ["fumble"], save: "reflex",
        label: "Vision Of Havoc — trapped in the vision",
        rungs: {
          success: [],
          failure: [{ kind: "condition", condition: "stunned", value: 1, duration: "1 minute", hold: true,
            conditionSave: { save: "will", onSuccess: "end", label: "Vision Of Havoc" } }],
          fumble: [{ kind: "condition", condition: "stunned", value: 1, duration: "1 minute", hold: true,
            conditionSave: { save: "will", onSuccess: "end", label: "Vision Of Havoc" } }]
        }
      },
      note("Believes it is trapped in a dire circumstance from the vision; a Will save at the end of each of its turns disbelieves it and ends the stun.", ["fumble"])
    ]
  },

  /* ---------------------------------------------------------------- *
   * R2 (continued) — Painful Rebuke, through the attack gate.
   * ---------------------------------------------------------------- */
  "Painful Rebuke": {
    effects: [
      { kind: "rebuke", target: "targets", onSave: ["success"], formula: "2d6", damageType: "mental", once: true },
      { kind: "rebuke", target: "targets", onSave: ["failure"], formula: "2d6", damageType: "mental", duration: "1 minute" },
      { kind: "rebuke", target: "targets", onSave: ["fumble"], formula: "2d6", damageType: "mental", duration: "1 minute", critical: "minor" },
      note("Unaffected.", ["critical"]),
      note("The bite comes when the rebuked creature attacks you or aims a spell attack at you; other harm it does you is the table's.")
    ]
  },

  /* ---------------------------------------------------------------- *
   * R6 — Visage Of Horror.
   * ---------------------------------------------------------------- */
  "Visage Of Horror": {
    effects: [
      { kind: "horror", target: "targets" },
      note("With the +2 PP option, a hostile action that strikes several warded creatures at once needs only one save — by hand.")
    ]
  },

  /* ---------------------------------------------------------------- *
   * R7 — the advantage spells.
   * ---------------------------------------------------------------- */
  "True Strike": {
    effects: [
      {
        kind: "conditional", label: "True Strike", target: "self", duration: "1 round",
        edge: { ignoreCircumstance: true, ignoreConcealment: true },
        grants: [{ kind: "advantage", label: "True Strike", scope: "your next Strike before the end of your turn",
          when: { checkTypes: ["attack"] }, auto: true, oneShot: true }]
      }
    ]
  },
  "True Target": {
    effects: [
      {
        kind: "conditional", label: "True Target", target: "allies", againstChosenFoe: true,
        edge: { ignoreCircumstance: true, ignoreConcealment: true },
        grants: [{ kind: "advantage", label: "True Target", scope: "the first attack roll against the chosen creature",
          when: { checkTypes: ["attack"] }, auto: true, oneShot: true }]
      },
      note("Target the allies and the one foe together; the foe is the hostile creature among them.")
    ],
    warps: [
      { ppCost: 1, text: "you may affect another creature", mods: { extraTargets: 1 } }
    ]
  },
  "Twisted Fate": {
    effects: [
      { kind: "pending", target: "targets", onSave: ["failure"], swing: "disadvantage", span: "endOfNextTurn",
        oneShot: false, auto: true, scope: "all checks during its next turn" },
      { kind: "conditional", label: "Twisted Fate", target: "targets", onSave: ["fumble"],
        grants: [{ kind: "disadvantage", label: "Twisted Fate", scope: "all checks for the duration", when: { always: true }, auto: true }] },
      note("Cannot benefit from chance effects for the duration — the table's call.", ["success", "failure", "fumble"]),
      note("Unaffected.", ["critical"])
    ]
  },

  /* ---------------------------------------------------------------- *
   * R8 — moving life and power.
   * ---------------------------------------------------------------- */
  "Vampiric Touch": {
    kindGate: "living",
    effects: [
      { kind: "siphon", target: "self", share: 0.5, duration: "1 minute", label: "Vampiric Touch" }
    ]
  },
  "Trade Essence": {
    effects: [
      { kind: "essenceTrade", target: "targets", perLevel: 2, label: "Trade Essence" },
      note("With the +4 PP option, up to four willing creatures share PP in any arrangement — move it a pair at a time.")
    ],
    warps: [
      { ppCost: 2, text: "increase the transferable amount by +1 PP per caster level", mods: { bonusValue: 1 } },
      { ppCost: 2, text: "the range increases to 30 feet", mods: { rangeOverride: "30 feet" } },
      { ppCost: 4, text: "you can link up to four willing creatures, redistributing PP among them in any arrangement you choose", mods: {} }
    ]
  },
  "Vigour": {
    kindGate: "living",
    effects: [
      { kind: "turnHeal", target: "targets", amount: 2, label: "Vigour" }
    ]
  },

  /* ---------------------------------------------------------------- *
   * R10 — the smaller ones.
   * ---------------------------------------------------------------- */
  "Transmute Rock & Mud": {
    modeLabel: "Which way",
    modePrompt: "Transmute Rock & Mud — which way does the earth change?",
    apOptions: [
      {
        ap: 3, label: "Mud to Rock — creatures in the mud save (Reflex or Acrobatics)", area: "10-foot radius", defence: "Reflex",
        // "a Reflex saving throw or an Acrobatics check": the better of the two.
        saveAlternative: "acrobatics",
        effects: [
          { kind: "condition", target: "targets", condition: "prone", onSave: ["success"] },
          { kind: "condition", target: "targets", condition: "grabbed", onSave: ["failure"], duration: "1 round" },
          // "restrained" is not one of this system's conditions; immobilised
          // is what the Escape action breaks beside grabbed.
          { kind: "condition", target: "targets", condition: "immobilised", onSave: ["fumble"], duration: "1 round" },
          note("Escapes the mud and stands atop the stone.", ["critical"]),
          note("Climbs out and is prone atop the stone.", ["success"]),
          note("Partially stuck: grabbed for 1 round or until it Escapes.", ["failure"]),
          note("Entirely stuck: immobilised for 1 round or until it Escapes.", ["fumble"]),
          note("The drawn circle stands in for the two adjacent 10-foot areas — reshape the Region to fit.")
        ]
      },
      {
        ap: 3, label: "Rock to Mud — the stone becomes mud", area: "10-foot radius", defence: "",
        effects: [
          { kind: "difficultTerrain", label: "Transmute Rock & Mud", target: "area" },
          note("Mud 3 feet deep or more is formidable terrain or needs a DC 10 Swim (Athletics) check; too deep to touch "
            + "bottom, swimming is required. Cast on a ceiling, the falling mud causes a light bludgeoning critical "
            + "(Reflex to avoid) and the difficult terrain widens by 10 feet — by hand."),
          note("The drawn circle stands in for the two adjacent 10-foot areas — reshape the Region to fit.")
        ]
      }
    ]
  },
  "Tangling Creepers": {
    areaChoice: true,
    effects: [
      { kind: "zone", label: "Tangling Creepers", speedPenalty: -10 },
      { kind: "maneuver", target: "targets", label: "Tangling Creepers vine", penalty: 0, action: "grappleAttack" },
      { kind: "lash", target: "self" },
      note("Tick only the creature the first vine lashes at. Each round after, the card's button lashes again "
        + "(1 AP) at your current target; the 15-foot reach from the creepers is the table's to judge.")
    ]
  },
  "Untamed Journey": {
    effects: [
      { kind: "terrainFreedom", target: "targets" },
      note("With the +4 PP option the targets also ignore formidable terrain from the environment — by hand.")
    ],
    warps: [
      { ppCost: 2, text: "the spell lasts until your next daily preparation", mods: { durationText: "until your next daily preparation" } },
      { ppCost: 4, text: "the targets also ignore formidable terrain from environmental properties", mods: {} }
    ]
  },
  "True Seeing": {
    effects: [
      { kind: "avoidanceSight", target: "self", sight: "seeInvisible", level: "clear", label: "True Seeing" },
      note("Within 60 feet you also see through normal and magical darkness, displacement and blur, visual "
        + "illusions, and polymorphed creatures' true forms — the table's to apply.")
    ]
  },
  "Wake": {
    effects: [
      { kind: "wake", target: "targets" }
    ]
  },
  "Time Stop": {
    effects: [
      { kind: "timeStop", target: "self", formula: "1d6+3" }
    ],
    warps: [
      { ppCost: 2, text: "you gain an additional 1d6 actions", mods: { damageDice: "1d6" } }
    ]
  }
};

/** The fields each spell's plan writes — what the pack-repair manifest must cover. */
export function plannedFields() {
  const out = {};
  for (const [name, fields] of Object.entries(PLAN)) out[name] = Object.keys(fields);
  return out;
}
