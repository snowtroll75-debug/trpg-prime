/**
 * block32c-plan — what 3.608.0 writes to the spells pack, as data.
 *
 * Block 32's R3–R8 (Graham, 29 September 2026: "R1 - R8 go with your
 * recommendation"). See tools/block32-plan.mjs for why a plan is data the
 * harness imports. Page numbers are the ones the book's own spell index
 * prints.
 */

const note = (text) => ({ kind: "note", text });

export const PLAN = {
  /* ── R3: THE DAMAGE RIDERS ─────────────────────────────────────── */

  /*
   * SHOCKING GRASP (PP 2, page 324). "If the target is wearing metal armour
   * or is made of metal, you gain a +1-circumstance bonus to your attack
   * roll … and the target also takes 1 recurring electricity damage on a
   * hit. On a critical hit, double the recurring damage." The rider was
   * stored unconditional; the +1 not at all.
   */
  "Shocking Grasp": {
    damage: {
      formula: "2d12", type: "electricity", persistent: "1",
      metal: { attack: 1, recurringOnlyVsMetal: true, doubleOnCritical: true }
    },
    warps: [{
      ppCost: 2,
      text: "the damage increases by 1d12, and the recurring electricity damage increases by 1",
      mods: { damageDice: "1d12", persistent: 1 }
    }]
  },

  /*
   * SHOCK BOLT (PP 4, page 324). "If the attack inflicts a critical injury,
   * all adjacent targets who are wearing metal armour take half damage
   * (basic Reflex)."
   */
  "Shock Bolt": {
    damage: {
      formula: "2d12", type: "electricity", persistent: "",
      critSplash: { fraction: 0.5, save: "reflex", basic: true, requires: "metalArmour", reachFeet: 5 }
    }
  },

  /*
   * SONIC BOLT (PP 6, page 327). "If the attack inflicts a critical, it
   * bypasses light armour when reading the critical result." + a warp that
   * climbs one step.
   */
  "Sonic Bolt": {
    damage: { formula: "4d10", type: "sonic", persistent: "", critArmourBypass: "light" },
    warps: [
      { ppCost: 2, text: "the damage increases by 1d10", mods: { damageDice: "1d10" } },
      { ppCost: 2, text: "the type of armour ignored increases by one step", mods: { armourStep: 1 } }
    ]
  },

  /*
   * SONIC RUPTURE (PP 20, page 327), Basic Fortitude, 30-foot cone. "4d6
   * Bleed damage to living beings … Creatures which are immune to bleed
   * take 5d8 sonic damage instead due to the vibrations (even those usually
   * immune to such damage)."
   */
  "Sonic Rupture": {
    damage: {
      formula: "4d6", type: "bleed", persistent: "",
      asCondition: { condition: "bleeding", criticalType: "sonic" },
      immuneAlternate: { immuneTo: "bleeding", formula: "5d8", type: "sonic", ignoresImmunity: true }
    },
    effects: [
      note("BLEED DAMAGE IS BLEEDING. The save scales the 4d6 and the result is the Bleeding value "
        + "(Chapter 7's Bleed Damage; the alchemical bombs read \"bleed damage\" the same way). A "
        + "creature immune to bleeding takes the vibration instead — 5d8 sonic, rolled once, scaled "
        + "by its own save, through any immunity to sonic.")
    ]
  },

  /* ── R4 ─────────────────────────────────────────────────────────── */

  /*
   * SIZE ALTERATION (PP 6, page 324). One step larger; no effect on Large
   * or larger. +2 PP reduce instead (tiny min); +6 PP two steps, or a
   * Large creature by one.
   */
  "Size Alteration": {
    effects: [{
      kind: "sizeStep", target: "targets", label: "Size Alteration",
      steps: 1, largestAffected: "medium", floor: "tiny", reversible: true
    }],
    warps: [
      { ppCost: 2, text: "reduce the size of a creature (tiny min)", mods: { sizeReverse: true } },
      { ppCost: 2, text: "effect an additional target", mods: { extraTargets: 1 } },
      { ppCost: 3, text: "increase the duration to 10 minutes", mods: { durationText: "10 minutes" } },
      { ppCost: 6, text: "change the targets size by two steps, or a large creature by one step", mods: { sizeReach: 1 } }
    ]
  },

  /* ── R5 ─────────────────────────────────────────────────────────── */

  /*
   * SPECTRAL GRASP (PP 6, page 326). "either Disarm, Grapple, Shove or Trip
   * (attack actions) using your Spellcraft check at -4."
   */
  "Spectral Grasp": {
    effects: [
      {
        kind: "maneuver", target: "targets", label: "Spectral Grasp", penalty: -4,
        actions: ["disarmAttack", "grappleAttack", "shoveAttack", "tripAttack"]
      },
      note("The +2 and +4 PP options (sustained, one option each turn; a new target each Sustain) are "
        + "printed and not yet automated — cast again each turn for now.")
    ]
  },

  /* ── R6 ─────────────────────────────────────────────────────────── */

  /*
   * SPELL TURNING (PP 14, page 326), 1 hour. A ward: each targeted spell
   * that succeeds against the warded creature offers the reaction.
   */
  "Spell Turning": {
    effects: [{ kind: "spellTurning", target: "self", label: "Spell Turning" }]
  },

  /*
   * SPELL DRAIN (PP 14, page 326), Reaction, Will.
   *   Critical  unaffected.
   *   Success   -2 to their Spellcraft check.
   *   Failure   their spell is a failure; you absorb its PP.
   *   Fumble    as Failure, and their check is a fumble.
   */
  "Spell Drain": {
    effects: [
      { kind: "spellDrain", target: "targets", label: "Spell Drain", onSave: ["success"], penalty: -2 },
      { kind: "spellDrain", target: "targets", label: "Spell Drain", onSave: ["failure"], forced: "failure", absorb: true },
      { kind: "spellDrain", target: "targets", label: "Spell Drain", onSave: ["fumble"], forced: "fumble", absorb: true },
      note("CAST IT WHEN THE SPELL IS ANNOUNCED, before the target's casting is rolled — Cutting "
        + "Words' road. The rung waits on the target and is spent by its next casting.")
    ]
  },

  /* ── R7 ─────────────────────────────────────────────────────────── */

  /*
   * SOLID FOG (PP 8, page 326), 20-foot radius, 1 minute. Concealed inside;
   * everything outside concealed to those inside; difficult terrain.
   */
  "Solid Fog": {
    effects: [
      { kind: "zone", target: "area", label: "Solid Fog", condition: "concealed", obscuresOutward: true },
      { kind: "difficultTerrain", target: "area", label: "Solid Fog" },
      note("A MOVING CLOUD is the GM's: drag the fog's Region 10 feet each round and whoever it "
        + "covers is concealed the moment it arrives.")
    ]
  },

  /*
   * STONE CALL (PP 6, page 327). "For the remaining duration of the spell,
   * this debris covers the ground, making the entire area difficult
   * terrain."
   */
  "Stone Call": {
    effects: [{ kind: "difficultTerrain", target: "area", label: "Stone Call" }]
  },

  /* ── R8 ─────────────────────────────────────────────────────────── */

  /*
   * STONESKIN (PP 10, page 328), 10 minutes. "You gain physical resistance
   * (adamantine). Each time you are hit by a physical attack, the duration
   * of the spell decreases by 1 minute." +4 PP: adamantine too.
   */
  "Stoneskin": {
    effects: [
      { kind: "defence", target: "self", field: "resistance", value: "physical (adamantine)" },
      { kind: "wearingClock", target: "self", on: "physical", seconds: 60, label: "Stoneskin" }
    ],
    warps: [{
      ppCost: 4, text: "the resistance applies to adamantine damage as well", mods: { defenceValue: "physical" }
    }]
  },

  /* SPIDER CLIMB (PP 4, page 326). "a climb Speed equal to its Speed." */
  "Spider Climb": {
    effects: [{ kind: "speedGrant", target: "targets", key: "climb", feet: 0, orLand: true }]
  },

  /* SPIRITUAL WEAPON (PP 4, page 327), 1 minute (S). */
  "Spiritual Weapon": {
    effects: [
      { kind: "spiritualWeapon", target: "self", label: "Spiritual Weapon", itemBonus: 1, damageType: "force" },
      note("Mark the creature it strikes before casting and before each Sustain. It strikes from "
        + "your direction and cannot flank.")
    ]
  },

  /* SMASH (PP 6, page 326), 1 hour (D). */
  "Smash": {
    effects: [
      {
        kind: "versusDamage", target: "self", label: "Smash", value: 1, bonusType: "status",
        vsTypes: ["construct"], max: 5, discharge: 2
      },
      note("OBJECTS ARE THE TABLE'S: nothing marks a door as something a Strike is aimed at, so add "
        + "the bonus by hand when you smash one. Against a construct it is added — and offered for "
        + "discharge — automatically.")
    ]
  }
};

/** The fields each spell's plan writes — what the pack-repair manifest must cover. */
export function plannedFields() {
  const out = {};
  for (const [name, fields] of Object.entries(PLAN)) out[name] = Object.keys(fields);
  return out;
}
