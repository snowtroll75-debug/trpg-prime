/**
 * Printed skill names → system skill keys, for the module side.
 *
 * The same table lives in tools/background-data.mjs, which is a BUILD
 * tool and must not be imported at runtime — the packs ship, the tools
 * folder is developer material. Scholar is the first background whose
 * skills are chosen at play time rather than compiled in, so the mapping
 * finally needs to exist on both sides.
 *
 * verify-backgrounds asserts the two copies agree, so a name added to one
 * and not the other is a build failure rather than a silent no-op.
 */
export const SKILL_KEY_BY_NAME = Object.freeze({
  "Acrobatics": "acrobatics",
  "Arcana": "arcana",
  "Artistry": "artistry",
  "Athletics": "athletics",
  "Climbing": "climbing",
  "Crafting": "crafting",
  "Culture": "culture",
  "Deception": "deception",
  "Diplomacy": "diplomacy",
  "Handle Animal": "handleAnimal",
  "Intimidate": "intimidate",
  "Linguistics": "linguistics",
  "Medicine": "medicine",
  "Meditation": "meditation",
  "Mental Focus": "mentalFocus",
  "Nature": "nature",
  "Occultism": "occultism",
  "Perception": "perception",
  "Perform": "perform",
  "Planes": "planes",
  "Power Manipulation": "powerManipulation",
  "Religion": "religion",
  "Sense Motive": "senseMotive",
  "Stealth": "stealth",
  "Survival": "survival",
  "Thievery": "thievery"
});
