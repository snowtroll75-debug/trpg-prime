/**
 * The 3.631.0 Creature Codex declarations (Fiends & Fables 3.0 block 1).
 * Applied by declare-ff30-codex.mjs; read back by verify-ff30-codex.mjs.
 *
 * Each key is the entry's name; `flags` is merged onto its `flags.trg-prime`
 * (a `creatureAbility` block merges with the entry's own; every other key
 * replaces). The schemas are the rails' own — see the module files named
 * beside each family. Every line of rules text here is the chapter's.
 */

const AURA = (id, name, extra) => ({ id, name, triggers: ["turnStart", "enter"], ...extra });

export const CODEX_DECLARATIONS = {
  /* ------------------------------------------------------- rolled auras (creature-auras.mjs) */
  "Stench": { flags: { auras: [AURA("aura-stench", "Stench", {
    radius: 10, save: "fortitude", livingOnly: true, immunitySeconds: 60, immunityOn: "always", traits: ["aura", "olfactory"],
    appliesTo: "Living creatures",
    outcomes: { failure: "sickened 1", fumble: "as failure but also slowed 1 for the length of the sickened." },
    conditions: { failure: [{ key: "sickened", value: 1 }], fumble: [{ key: "sickened", value: 1 }, { key: "slowed", value: 1, endsWith: "sickened" }] }
  })] } },
  "Aura of Despair": { flags: { auras: [AURA("aura-of-despair", "Aura of Despair", {
    radius: 30, save: "will", livingOnly: true, traits: ["aura", "divinity", "fear"], appliesTo: "Any living creature",
    partialImmunity: { to: "paralyzed", seconds: 86400 },
    outcomes: { heroic: "The creature is unaffected.", critical: "The creature is frightened 1.", success: "The creature is frightened 2.", partial: "The creature is frightened 3.", failure: "The creature is frightened 3 and paralysed for 1 round.", fumble: "The creature is frightened 4 and paralysed for 1 round.", blunder: "The creature collapses from fear and is reduced to 0 hit points, gaining the unconscious condition." },
    conditions: { critical: [{ key: "frightened", value: 1 }], success: [{ key: "frightened", value: 2 }], partial: [{ key: "frightened", value: 3 }], failure: [{ key: "frightened", value: 3 }, { key: "paralyzed", rounds: 1 }], fumble: [{ key: "frightened", value: 4 }, { key: "paralyzed", rounds: 1 }], blunder: [{ key: "zeroHP" }, { key: "unconscious" }] }
  })] } },
  "Frightful Aura": { flags: { auras: [{ id: "aura-frightful-aura", name: "Frightful Aura", triggers: ["enter"], radiusPerLevel: 5, save: "will", immunitySeconds: 60, immunityOn: "always", traits: ["aura", "fear"],
    outcomes: { critical: "The creature is unaffected.", success: "The creature is frightened 1.", partial: "The creature is frightened 2.", failure: "The creature is frightened 3 and fleeing for 1 round.", fumble: "The creature is frightened 4 and fleeing until the frightened condition is removed.", blunder: "The creature collapses from fear and is reduced to 0 hit points, gaining the unconscious condition." },
    conditions: { success: [{ key: "frightened", value: 1 }], partial: [{ key: "frightened", value: 2 }], failure: [{ key: "frightened", value: 3 }, { key: "fleeing", rounds: 1 }], fumble: [{ key: "frightened", value: 4 }, { key: "fleeing", endsWith: "frightened" }], blunder: [{ key: "zeroHP" }, { key: "unconscious" }] }
  }] } },
  "Aura of Confusion": { flags: { auras: [AURA("aura-of-confusion", "Aura of Confusion", {
    radius: 20, save: "will", immunitySeconds: 600, immunityOn: "success", traits: ["aura", "emotion", "magical"],
    outcomes: { critical: "The creature is unaffected and is immune to the aura for 10 minutes.", success: "The target's mind is addled slightly causing them to become stunned 1.", failure: "The target is confused for 1 minute. It can attempt a new save at the end of each of its turns to end the confusion.", fumble: "The target is confused for 1 minute, with no save to end early." },
    conditions: { success: [{ key: "stunned", value: 1 }], failure: [{ key: "confused", minutes: 1, resave: true }], fumble: [{ key: "confused", minutes: 1 }] }
  })] } },
  "Soulless Aura": { flags: { auras: [{ id: "aura-soulless-aura", name: "Soulless Aura", triggers: ["enter"], radius: 10, save: "fortitude", immunitySeconds: 86400, immunityOn: "success", traits: ["aura", "negative", "soul"],
    outcomes: { failure: "5 Soul Drain." }, conditions: { failure: [{ key: "soulDrain", value: 5 }] }
  }] } },
  "Aura of Ruin": { flags: { auras: [{ id: "aura-of-ruin", name: "Aura of Ruin", triggers: ["turnStart"], radius: 30, save: "will", traits: ["aura", "divinity", "soul"],
    appliesTo: "A creature that is either good or ordered aligned", appliesToTraits: ["good", "ordered"],
    outcomes: { failure: "sickened 1", fumble: "sickened 2" }, conditions: { failure: [{ key: "sickened", value: 1 }], fumble: [{ key: "sickened", value: 2 }] }
  }] } },
  /* ------------------------------------------------------- damage auras */
  "Aura of Death": { flags: { auras: [AURA("aura-of-death", "Aura of Death", { radius: 30, save: "fortitude", livingOnly: true, appliesTo: "Any living creature", traits: ["aura", "divinity", "essence", "soul"], damage: { formula: "4d6", type: "essence", basic: true } })] } },
  "Aura of Decay": { flags: { auras: [AURA("aura-of-decay", "Aura of Decay", { radius: 30, save: "fortitude", traits: ["aura", "ethereal", "poison", "soul"], damage: { formula: "4d8", type: "poison", basic: true } })] } },
  "Aura of Fire": { flags: { auras: [AURA("aura-of-fire", "Aura of Fire", { radius: 20, save: "reflex", traits: ["aura", "fire", "invocation", "verdant"], damage: { formula: "4d6", type: "fire", basic: true } })] } },
  "Aura of Heat": { flags: { auras: [AURA("aura-of-heat", "Aura of Heat", { radius: 20, save: "reflex", traits: ["aura", "fire", "invocation", "verdant"], damage: { formula: "2d6", type: "fire", basic: true } })] } },
  "Ashen Aura": { flags: { auras: [AURA("aura-ashen-aura", "Ashen Aura", { radius: 20, save: "fortitude", appliesTo: "All creatures; everything within the mist is concealed, and everything outside it is concealed to those within", traits: ["aura", "divinity", "fire", "poison"], damage: { formula: "4d6", type: "poison", basic: true } })] } },
  "Elemental Aura": { flags: { auras: [AURA("aura-elemental-aura", "Elemental Aura", { radius: 10, save: "reflex", traits: ["arcane", "aura", "elemental"], damage: { formula: "2d6", basic: true }, damageTypeFromName: true, appliesTo: "Turned on or off as a Free Action (disable the ability item to switch it off)" })] } },
  "Infestation": { flags: { auras: [{ id: "aura-infestation", name: "Infestation", triggers: ["turnStart"], radius: 5, save: "fortitude", traits: ["aura", "poison"], damage: { formula: "1d6", type: "poison", basic: true } }] } },
  /* ------------------------------------------------------- death guard / defensive casting (declaration-carriers.mjs) */
  "Undead Fortitude": { flags: { deathGuard: { label: "Undead Fortitude", save: "fortitude", exceptDamageTypes: ["essence"], exceptWeakness: true } } },
  "Faultless Casting": { flags: { defensiveCasting: { label: "Faultless Casting", always: true, dcAdd: 0 } } },
  /* ------------------------------------------------------- after-strikes (combat/declared-after-strikes.mjs) */
  "Life Drain": { flags: { afterStrikes: [{ key: "life-drain", label: "Life Drain", save: "fortitude", livingOnly: true, selfHeal: 3,
    weaponNames: [], outcomes: { failure: "Soul Drain 5, +5 for each earlier drain by this creature." }, drain: { key: "soulDrain", base: 5, perHit: 5 } }] } },
  "Shadow Hand": { flags: { afterStrikes: [{ key: "shadow-hand", label: "Shadow Hand", save: "fortitude", onCriticalInjury: true, weaponNames: ["soul touch"],
    outcomes: { failure: "1d6 Soul Drain (2d6 if the critical was Serious or Deadly)." }, amountBySeverity: { key: "soulDrain", minor: "1d6", serious: "2d6", deadly: "2d6" } }] } },
  "Dispelling Strike": { flags: { afterStrikes: [{ key: "dispelling-strike", label: "Dispelling Strike", dispel: true, weaponNames: [] }] } },
  /* ------------------------------------------------------- conditionals (conditionals.mjs) */
  "Acute Sense": { flags: { conditionals: [{ kind: "modifier", value: 2, type: "race", label: "Acute Sense", scope: "any action relying on the named sense (the entry's parenthesis)", auto: false, when: { checkTypes: ["skill"], subjects: ["perception"] } }] } },
  "Grave-Touched Presence": { flags: { conditionals: [{ kind: "modifier", value: 2, type: "race", label: "Grave-Touched Presence", scope: "Intimidate and Sense Motive checks against undead", auto: true, when: { checkTypes: ["skill"], subjects: ["intimidate", "senseMotive"], targetTypes: ["undead"] } }] } },
  "Monstrous Grab": { flags: { conditionals: [{ kind: "modifier", value: 4, type: "race", label: "Monstrous Grab", scope: "Grapple checks", auto: true, when: { actions: ["grappleAttack", "grapple"] } }], creatureAbility: { derives: { mapExempt: ["grappleattack", "grapple"] } } } },
  "Monstrous Knockdown": { flags: { conditionals: [{ kind: "modifier", value: 4, type: "race", label: "Monstrous Knockdown", scope: "Trip checks", auto: true, when: { actions: ["tripAttack", "trip"] } }], creatureAbility: { derives: { mapExempt: ["tripattack", "trip"] } } } },
  /* ------------------------------------------------------- derives (creature-ability-rules.mjs) */
  "Hover": { flags: { creatureAbility: { derives: { hover: true } } } },
  "Wingless Flight": { flags: { creatureAbility: { derives: { hover: true } } } },
  "Slow": { flags: { creatureAbility: { derives: { apPenalty: 1 }, note: "Slow (II): set derives.apPenalty to 2 on the creature's copy, or name the copy 'Slow (II)'." } } },
  "Elusive Movement": { flags: { creatureAbility: { derives: { noMovementProvoke: true } } } },
  "Smoke Form": { flags: { creatureAbility: { derives: { noMovementProvoke: { fullMoveOnly: true } } } } },
  "Hold Breath": { flags: { creatureAbility: { derives: { breathMultiplier: 10 } } } },
  "Eternal Essence": { flags: { creatureAbility: { derives: { noArmourPenalties: true, fumbleDCAll: -1 } } } },
  "Fire Healing": { flags: { creatureAbility: { derives: { healsFromDamage: { type: "fire", fraction: 0.5 } } } } },
  "Gallop": { flags: { creatureAbility: { derives: { gallop: 10 } } } },
  "Vorpal Weapons": { flags: { creatureAbility: { derives: { vorpalWeapons: true } } } },
  "Elemental Strikes": { flags: { creatureAbility: { derives: { elementalStrikes: { dice: "1d6", doublesExisting: true } } } } },
  "Ice Climb": { flags: { ignoresDifficultTerrain: true, creatureAbility: { note: "Snow and ice only — the terrain rail has no source, so every difficult terrain is eased (ruling 6: blanket). Land Speed as a climb Speed on ice is the GM's." } } },
  "Ice Stride": { flags: { ignoresDifficultTerrain: true, creatureAbility: { note: "Snow and ice only (ruling 6: blanket); no Acrobatics checks on slippery ice." } } },
  "Fearful Strength": { flags: { creatureAbility: { derives: { skillAbilitySwap: { skill: "intimidate", ability: "strength" } } } } },
  "Spell Resilience": { flags: { creatureAbility: { derives: { spellResilience: true } } } },
  "Plant Resistance": { flags: { creatureAbility: { derives: { plantResistance: true } } } },
  "Pack Attack": { flags: { creatureAbility: { derives: { packAttack: true } } } },
  "Regeneration": { flags: { creatureAbility: { derives: { turnStart: { kind: "regeneration", auto: true } } } } },
  "Arcadian Caster": { flags: { creatureAbility: { derives: { castNoProvoke: true, specialistAll: true, learnTraditions: ["arcane", "ethereal"] } } } },
  "True Caster": { flags: { creatureAbility: { derives: { learnTraditions: "any" } } } },
  "Alien Mind": { flags: { creatureAbility: { derives: { retaliate: { traits: ["mental"], damage: "4d6", type: "mental", save: "will" } } } } },
  "Reflective Scales": { flags: { creatureAbility: { derives: { reflectSpells: true } } } },
  "Corrode": { flags: { creatureAbility: { derives: { corrode: true } } } },
  "Elemental Grasp": { flags: { creatureAbility: { derives: { grabbedTurnDamage: { dice: "3d6", save: "reflex" } } } } },
  "Elemental Blood": { flags: { creatureAbility: { derives: { bleedSplash: true } } } },
  "Souldrinker": { flags: { creatureAbility: { derives: { souldrinker: { levelsBelow: 4 } } } } },
  "Undead Spawn": { flags: { creatureAbility: { derives: { undeadSpawn: true } } } },
  "Garlic Repulsion": { flags: { creatureAbility: { derives: { garlicRepulsion: true }, note: "The GM sets flags.trg-prime.nearGarlic on the actor to 'near' or 'adjacent'." } } },
  "Penetrating Strikes": { flags: { creatureAbility: { derives: { penetratingStrikes: true }, note: "The attacks the stat block indicates carry the 'penetrating' trait on their weapon." } } },
  "Secondary Critical": { flags: { creatureAbility: { note: "The indicated attack carries 'secondary critical' in its weapon traits (or flags.trg-prime.secondaryCritical)." } } },
  "Skewering Strikes": { flags: { creatureAbility: { derives: { skeweringStrikes: true } } } },
  "Reactive Disarm": { flags: { creatureAbility: { derives: { reactiveDisarm: true } } } },
  /* ------------------------------------------------------- breath riders (breath-memory.mjs) */
  "Clinging Breath": { flags: { creatureAbility: { breathRider: { kind: "nextTurnDamage", fraction: 0.5, type: "acid", save: "fortitude" } } } },
  "Scorching Breath": { flags: { creatureAbility: { breathRider: { kind: "nextTurnDamage", fraction: 0.5, type: "fire", save: "fortitude" } } } },
  "Shadow Breath": { flags: { creatureAbility: { breathRider: { kind: "byBreathDegree",
    outcomes: { critical: "The target is unaffected.", success: "The target is blinded until its next turn begins.", failure: "The target is blinded for 1 minute.", fumble: "The target is blinded permanently." },
    conditions: { success: [{ key: "blinded", rounds: 1 }], failure: [{ key: "blinded", minutes: 1 }], fumble: [{ key: "blinded" }] } } } } },
  "Slowing Breath": { flags: { creatureAbility: { breathRider: { kind: "save", save: "fortitude",
    outcomes: { partial: "slowed 1 for 1 round.", failure: "slowed 1 for 1 minute.", fumble: "slowed 2 for 1 minute." },
    conditions: { partial: [{ key: "slowed", value: 1, rounds: 1 }], failure: [{ key: "slowed", value: 1, minutes: 1 }], fumble: [{ key: "slowed", value: 2, minutes: 1 }] } } } } },
  "Penetrating Breath": { flags: { creatureAbility: { breathRider: { kind: "penetrating" } } } },
  /* ------------------------------------------------------- area effects (creature-area.mjs; rolled by peril-workflow) */
  "Sonic Moan": { flags: { creatureAbility: { area: { save: "will", basic: true, damage: { formula: "3d6", type: "sonic" }, radiusFeet: 30, scope: "area", traits: ["auditory", "emotion", "focus"], immuneIf: ["deafened"] } } } },
  "Howl": { flags: { creatureAbility: { area: { save: "will", radiusFeet: 30, scope: "area", immunitySeconds: 600, immuneIf: ["deafened"],
    outcomes: { success: "The creature is unaffected.", partial: "The creature is frightened 1.", failure: "The creature is frightened 2.", fumble: "The creature is frightened 3 and fleeing for 1 round." },
    conditions: { partial: [{ key: "frightened", value: 1 }], failure: [{ key: "frightened", value: 2 }], fumble: [{ key: "frightened", value: 3 }, { key: "fleeing", rounds: 1 }] } } } } },
  "Paralysing Gaze": { flags: { creatureAbility: { area: { save: "fortitude", radiusFeet: 30, scope: "area", immuneIf: ["blinded"],
    outcomes: { critical: "the target is unaffected", success: "the target is stunned 1.", partial: "the target becomes paralysed for 1 round.", failure: "the target becomes paralysed for 1 minute; a new save at the end of each of its turns.", fumble: "the target becomes paralysed for 1 minute." },
    conditions: { success: [{ key: "stunned", value: 1 }], partial: [{ key: "paralyzed", rounds: 1 }], failure: [{ key: "paralyzed", minutes: 1, resave: true }], fumble: [{ key: "paralyzed", minutes: 1 }] } } } } },
  "Entangling Vines": { flags: { creatureAbility: { area: { save: "reflex", basic: true, damage: { formula: "4d6", type: "piercing" }, radiusFeet: 20, scope: "area",
    outcomes: { failure: "grabbed by the vines." }, conditions: { failure: [{ key: "grabbed" }] } } } } },
  "Draconic Roar": { flags: { creatureAbility: { area: { save: "fortitude", basic: true, damage: { fromItem: "breath" }, radiusFeet: 0, scope: "targets", cooldownSeconds: 3600, intro: "All creatures within the range of its Frightful Aura — target them." } } } },
  "Crush": { flags: { creatureAbility: { area: { save: "reflex", scope: "targets", drBypassed: true, damageType: "bludgeoning",
    intro: "Every creature at least two sizes smaller that begins its turn in the creature's space — target them.",
    damageByRung: { critical: "1d10", success: "2d10", partial: "4d10", failure: "6d10", fumble: "8d10" },
    criticals: { partial: "minor", failure: "serious", fumble: "deadly" },
    outcomes: { partial: "moved to an adjacent square after the damage.", success: "moved to an adjacent square after the damage.", critical: "moved to an adjacent square after the damage.", failure: "immobilised and prone.", fumble: "immobilised and prone." },
    conditions: { failure: [{ key: "immobilised" }, { key: "prone" }], fumble: [{ key: "immobilised" }, { key: "prone" }] } } } } },
  /* ------------------------------------------------------- compound actions (combat/compound-action.mjs) */
  "Diving Strike": { flags: { creatureAbility: { compound: { ap: 2, legs: [{ move: "fly", times: 2, note: "in a straight line, descending at least 10 feet" }], strikes: [{ weapon: "claw", count: 1, bonus: { value: 2, type: "circumstance", label: "Diving Strike" } }] } } } },
  "Double Strike": { flags: { creatureAbility: { compound: { ap: 1, legs: [], strikes: [{ weapon: ".", count: 2, separateTargets: true }], map: "after", note: "two different limbs, two different targets" } } } },
  "Draconic Assault": { flags: { creatureAbility: { compound: { ap: 2, legs: [], strikes: [{ weapon: "claw", count: 2 }, { weapon: ".", notWeapon: "claw", count: 1 }] } } } },
  "Flyby Attack": { flags: { creatureAbility: { compound: { ap: 2, legs: [{ move: "fly", times: 1 }], strikes: [{ weapon: "claw", count: 2, separateTargets: true }] } } } },
  "Swimby Attack": { flags: { creatureAbility: { compound: { ap: 2, legs: [{ move: "swim", times: 1 }], strikes: [{ weapon: "bite", count: 2, separateTargets: true }] } } } },
  "Pouncing Assault": { flags: { creatureAbility: { compound: { ap: 2, legs: [{ move: "land", times: 1, note: "a Jump (Athletics) check first" }], strikes: [{ weapon: "claw", count: 2 }], selfEffect: { label: "Pouncing Assault", defenceCircumstance: -4, rounds: 1, note: "attacks against it take -4 circumstance until its next turn" } } } } },
  "Powerful Charge": { flags: { creatureAbility: { compound: { ap: 2, legs: [{ move: "land", times: 2 }], strikes: [{ weapon: "gore", count: 1, bonus: { value: 2, type: "circumstance", label: "Powerful Charge" }, extraBaseDice: 1 }] } } } },
  "Surge of Speed": { flags: { creatureAbility: { compound: { ap: 1, legs: [{ move: "land", times: 2 }], strikes: [], cooldownSeconds: 600 } } } },
  "Torrent of Strikes": { flags: { creatureAbility: { compound: { ap: 3, legs: [], strikes: [{ weapon: ".", count: 6 }], map: { fixed: -2 }, note: "one creature or divided among adjacent targets" } } } },
  /* ------------------------------------------------------- the Codex's own actions (codex-actions-workflow.mjs) */
  "Constrict": { flags: { creatureAbility: { action: { kind: "constrict", ap: 1 } } } },
  "Rend": { flags: { creatureAbility: { action: { kind: "rend", ap: 0 } } } },
  "Tear Flesh": { flags: { creatureAbility: { action: { kind: "tearFlesh", ap: 1, weapon: "bite" } } } },
  "Abyssal Healing": { flags: { creatureAbility: { action: { kind: "abyssalHealing", ap: 1 } } } },
  "Swallow": { flags: { creatureAbility: { action: { kind: "swallow", ap: 1 } } } },
  "Magic Dispelling": { flags: { creatureAbility: { action: { kind: "magicDispelling", ap: 2, perDay: 3 } } }, system: { usesPerDay: "3", usesValue: 3 } },
  "Whispers of the Grave": { flags: { creatureAbility: { action: { kind: "whispersOfTheGrave" } } } },
  "Amorphous Split": { flags: { creatureAbility: { action: { kind: "amorphousSplit" }, note: "Pressed when hit by electricity, piercing or slashing damage (offered, not automatic)." } } },
  "Eternal Summons": { flags: { creatureAbility: { action: { kind: "eternalSummons", ap: 2 } } } },
  "Trample": { flags: { creatureAbility: { action: { kind: "trample", ap: 3, weapon: "slam" } } } },
  "Draconic Shifting": { flags: { creatureAbility: { action: { kind: "draconicShifting", ap: 1 }, derives: { strikesSubdual: true } } } },
  /* ------------------------------------------------------- Wing Buffet (new) is authored below with its area */
};

const now = 1791000000000;
function entry(id, name, traits, description, flags) {
  return {
    _id: id, name, type: "ability", img: "icons/svg/book.svg", effects: [], folder: null, sort: 0, ownership: { default: 0 },
    flags: { "trg-prime": flags },
    system: { source: "Fiends & Fables 3.0, Chapter 2", category: "Creature", tier: "", level: 0, prerequisites: "", active: true, traits, sourceRace: "", sourceClass: "", description },
    _stats: { coreVersion: "14", systemId: "trg-prime", systemVersion: "3.631.0", createdTime: now, modifiedTime: now, lastModifiedBy: null, compendiumSource: null, duplicateSource: null }
  };
}

export const NEW_ENTRIES = [
  entry("ff30ScorchingBrth", "Scorching Breath", "Arcane, Fire, Save",
    "<p>Action Free; Trigger a target took damage from the creature’s breath weapon on its last turn.</p><p>At the beginning of the creatures turn, it must make a basic fortitude save to avoid taking half the breath weapons dice again (round up) as fire damage.</p>",
    { creatureAbility: { printedTraits: "ARCANE FIRE SAVE", printedAction: "Action Free", printedArea: "", activation: { kind: "free", trigger: "a target took damage from the creature’s breath weapon on its last turn", save: "fortitude" },
      breathRider: { kind: "nextTurnDamage", fraction: 0.5, type: "fire", save: "fortitude" } } }),
  entry("ff30WingBuffet001", "Wing Buffet", "Air, Movement, Save",
    "<p>Action 2 AP; Area 30-foot cone</p><p>The dragon beats its wings with tremendous force, creating a violent cone of buffeting air, dust, debris, and pressure. All creatures in the area must make a level-based Reflex save.</p><p>Critical The target is unaffected.<br>Success The target is pushed 5 feet directly away from the dragon.<br>Partial The target takes bludgeoning damage equal to the dragon’s wing attack damage and is pushed 5 feet directly away from the dragon.<br>Failure The target takes bludgeoning damage equal to the dragon’s wing attack damage, is pushed 10 feet directly away from the dragon, and falls prone.<br>Fumble The target takes bludgeoning damage equal to twice the dragon’s wing attack damage, is pushed 20 feet directly away from the dragon, and falls prone.<br>Blunder As fumble, but the target is also stunned 1.</p><p>This movement does not provoke reactions. A creature that is at least two sizes larger than the dragon treats its save result as one degree better. A flying creature that fails its save loses 10 feet of altitude; on a fumble or blunder, it loses 20 feet of altitude instead.</p>",
    { creatureAbility: { printedTraits: "AIR MOVEMENT SAVE", printedAction: "Action 2 AP", printedArea: "Area 30-foot cone",
      activation: { kind: "action", ap: 2, area: "30-foot cone", save: "reflex",
        outcomes: { critical: "The target is unaffected.", success: "The target is pushed 5 feet directly away from the dragon.", partial: "The target takes bludgeoning damage equal to the dragon’s wing attack damage and is pushed 5 feet directly away from the dragon.", failure: "The target takes bludgeoning damage equal to the dragon’s wing attack damage, is pushed 10 feet directly away from the dragon, and falls prone.", fumble: "The target takes bludgeoning damage equal to twice the dragon’s wing attack damage, is pushed 20 feet directly away from the dragon, and falls prone.", blunder: "As fumble, but the target is also stunned 1." } },
      area: { save: "reflex", scope: "targets", damageType: "bludgeoning", intro: "A 30-foot cone — target the creatures in it.",
        damageByRung: { partial: { weapon: "wing" }, failure: { weapon: "wing" }, fumble: { weapon: "wing", times: 2 }, blunder: { weapon: "wing", times: 2 } },
        push: { success: 5, partial: 5, failure: 10, fumble: 20, blunder: 20 },
        degreeShift: { largerBy: 2, steps: 1 },
        outcomes: { critical: "unaffected.", success: "pushed 5 feet directly away.", partial: "pushed 5 feet directly away.", failure: "pushed 10 feet directly away and falls prone; a flier loses 10 feet of altitude.", fumble: "pushed 20 feet directly away and falls prone; a flier loses 20 feet of altitude.", blunder: "as Fumble, and stunned 1." },
        conditions: { failure: [{ key: "prone" }], fumble: [{ key: "prone" }], blunder: [{ key: "prone" }, { key: "stunned", value: 1 }] } } } })
];

/* ------------------------------------------------------------------ *
 * Block 2 (3.632.0) — Chapter 3's feats. Graham, 10 October 2026: "go with
 * your recommendations for all". Declared on the feats pack.
 * ------------------------------------------------------------------ */

/** Feats whose declarations change (flags replace the named keys; `system` merges). */
export const FEAT_DECLARATIONS = {
  // Ruling 2: automated (codex-feat-rules.mjs); the manual +4 row would double it.
  "Crimson Covenant": { flags: { conditionals: [], codexFeat: { readFrom: "your next attack gains +4 luck bonus", source: "Fiends & Fables 3.0", automation: "applied" } } },
  // Ruling 3: the attack bonus is measured now; Handle Animal's +1 class stays a row.
  "Howling Kinship": { flags: { conditionals: [{ kind: "modifier", value: 1, type: "class", label: "Howling Kinship", scope: "all Handle Animal checks", auto: true, when: { checkTypes: ["skill"], subjects: ["handleAnimal"] } }],
    codexFeat: { readFrom: "both you and the creature gain +1 circumstance bonus to all attack rolls while within 10 feet of each other", source: "Fiends & Fables 3.0", automation: "applied" } } },
  // Book note: the page prints "Any special auditory sense (Scent etc)"; Scent
  // is olfactory and the feat is Enhanced SMELL. Read as olfactory so the
  // prerequisite gate (ruling 1) asks the right question.
  "Enhanced Smell": { system: { prerequisites: "Any special olfactory sense (Scent etc)" } }
};

const feat = (id, name, category, traits, prerequisites, description, flags = {}) => ({
  _id: id, name, type: "feat", img: "systems/trg-prime/assets/feats/class.png",
  system: { source: "Fiends & Fables 3.0", category, tier: "", level: 0, prerequisites, active: true, description,
    usesPerDay: "", bonusUses: 0, usesValue: 0, sourceRace: "", sourceClass: "", sourceArchetype: "", traits,
    grantedSpells: "", grantedAbilities: "", grantedFeats: "" },
  effects: [], folder: null, sort: 0, ownership: { default: 0 },
  flags: { "trg-prime": { ...flags } },
  _stats: { coreVersion: "14", systemId: "trg-prime", systemVersion: "3.632.0", createdTime: 1791590400000, modifiedTime: 1791590400000, lastModifiedBy: null, compendiumSource: null, duplicateSource: null }
});

/**
 * The three feats Chapter 3 adds that core's pack lacks. NOT AUTHORED IN CORE
 * (3.632.1): Fiends & Fables Prime ships them in its own `feats` pack, which
 * core federates with its own (sourcebooks.mjs), so a core copy showed each
 * twice in the picker. Core's automation finds them by name — the familiar
 * buttons (feats-workflow) and Scaly Resilience (codex-feat-rules) — so the
 * module's entries are the ones that act. Kept here as the record of what the
 * page prints; `declare-ff30-codex` REMOVES any core copy under these ids.
 */
export const MODULE_OWNED_FEATS = [
  feat("ff30AbyssalFamil", "Abyssal Familiar", "Class", "Class, Evil", "Familiar, BSB +6",
    "You commune with your deity or patron and draw forth a quasit which becomes your familiar.\n\nYour familiar becomes a quasit. You replace its base statistics with those of a quasit.",
    { codexFeat: { readFrom: "Your familiar becomes a quasit. You replace its base statistics with those of a quasit.", source: "Fiends & Fables 3.0", automation: "offered" }, familiarCreature: "Quasit" }),
  feat("ff30NirvanicFami", "Nirvanic Familiar", "Class", "Class, Good", "Familiar, Divinity Caster, BSB +6",
    "You commune with your deity and draw forth a cherubim which becomes your familiar.\n\nYour familiar becomes a cherubim. You replace its base statistics with those of a cherubim.",
    { codexFeat: { readFrom: "Your familiar becomes a cherubim. You replace its base statistics with those of a cherubim.", source: "Fiends & Fables 3.0", automation: "offered" }, familiarCreature: "Cherubim" }),
  feat("ff30ScalyResilie", "Scaly Resilience", "Class", "Campaign, Class, Focus", "Toughness, Must have gained the dying condition from a dragons' breath weapon.",
    "Draconic energy has infused your skin.\n\nAction Reaction; Trigger You take damage from a dragon breath weapon.\n\nYou secrete an oily substance that grants you Resistance against the breath weapon. Additionally, you gain a +1-circumstance bonus to either your DB or saving throw against the attack.",
    { codexFeat: { readFrom: "You secrete an oily substance that grants you Resistance against the breath weapon.", source: "Fiends & Fables 3.0", automation: "applied" } })
];
