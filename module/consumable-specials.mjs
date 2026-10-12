/**
 * THE OTHER CONSUMABLES THAT DO SOMETHING (3.617.0, block 37's B3, B4, C2
 * and C4; Graham's R5). Pure; the Foundry half is
 * consumable-specials-workflow.mjs.
 *
 * Three items on page 376 were description only — using one spent it and
 * posted its words:
 *
 *   Pearl of Force     "can be thrown up to 60 feet with no range penalties.
 *                      Upon sharp impact, the bead explodes, sending forth a
 *                      burst that deals 3d8 points of force damage to all
 *                      creatures within a 10-foot radius (Basic Reflex DC
 *                      22)."                                   → `burst`
 *   Mystical Bandage   "You make a DC 20 Medicine check to apply the
 *                      bandage … At any point during the 24 hours that the
 *                      bandage is worn, the wearer may use a reaction to heal
 *                      themselves of either 2d8 HP, 1d4 Bleed, -2 weakened or
 *                      -1 injured. Using the bandage in this way destroys
 *                      it."                                    → `bandage`
 *                      R5: Interact (1 minute) to apply; the bandage is kept
 *                      on its wearer until the reaction is used or the 24
 *                      hours pass.
 *   Assisting Gloves   "You can have the hand assist you with a task as if
 *                      using the Aid action. The hand uses your … skill
 *                      bonus at +2"                            → `aid`
 *
 * What each does is data on the pack item, at
 * `flags.trg-prime.consumable.special`.
 */

const SYSTEM_ID = "trg-prime";
const KINDS = Object.freeze(["burst", "bandage", "aid"]);

/** The bandage's four choices, in the page's order. */
export const BANDAGE_CHOICES = Object.freeze([
  Object.freeze({ key: "heal", label: "Heal 2d8 HP", row: { kind: "heal", target: "self", formula: "2d8" } }),
  Object.freeze({ key: "bleeding", label: "Stop 1d4 Bleed", roll: "1d4", row: { kind: "conditionRelief", target: "self", condition: "bleeding" } }),
  Object.freeze({ key: "weakened", label: "Weakened −2", row: { kind: "conditionRelief", target: "self", condition: "weakened", amount: 2 } }),
  Object.freeze({ key: "injured", label: "Injured −1", row: { kind: "conditionRelief", target: "self", condition: "injured", amount: 1 } })
]);

/** The effect flag a worn bandage carries. */
export const BANDAGE_FLAG = "mysticalBandage";

/** The special a consumable carries, normalised, or null. */
export function consumableSpecialOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.consumable?.special ?? null;
  if (!raw || typeof raw !== "object" || !KINDS.includes(raw.kind)) return null;
  if (raw.kind === "burst") {
    return {
      kind: "burst",
      formula: String(raw.formula ?? "1d6"),
      damageType: String(raw.damageType ?? "force"),
      radiusFeet: Math.max(0, Number(raw.radiusFeet) || 0),
      rangeFeet: Math.max(0, Number(raw.rangeFeet) || 0),
      dc: Math.max(0, Math.floor(Number(raw.dc) || 0)),
      save: ["fortitude", "reflex", "will"].includes(raw.save) ? raw.save : "reflex"
    };
  }
  if (raw.kind === "bandage") {
    return {
      kind: "bandage",
      skill: String(raw.skill ?? "medicine"),
      dc: Math.max(0, Math.floor(Number(raw.dc) || 0)),
      seconds: Math.max(0, Math.floor(Number(raw.seconds) || 86400)),
      healingDCReduction: Math.max(0, Math.floor(Number(raw.healingDCReduction) || 0))
    };
  }
  return { kind: "aid", bonus: Math.floor(Number(raw.bonus) || 0) };
}

/** A bandage reaction's choice by key, or null. */
export function bandageChoice(key) {
  return BANDAGE_CHOICES.find((c) => c.key === key) ?? null;
}

/**
 * Where a thrown special may land: the one creature targeted, within range.
 * @returns {{ok: boolean, reason: string}}
 */
export function burstLanding({ targetCount = 0, distance = null, rangeFeet = 0 } = {}) {
  if (targetCount !== 1) return { ok: false, reason: "target the one creature it is thrown at" };
  if (rangeFeet > 0 && Number.isFinite(distance) && distance > rangeFeet) {
    return { ok: false, reason: `that creature is ${distance} ft away — it can be thrown up to ${rangeFeet} ft` };
  }
  return { ok: true, reason: "" };
}
