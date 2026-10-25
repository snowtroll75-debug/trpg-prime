/**
 * ward-zone — a circle on the ground whose occupants are protected while
 * they stand in it.
 *
 * NEW at 3.666.0 (Inner Tempest's Elemental Ward; Graham's ruling of 21
 * October 2026: "a real zone"). "You may draw a 10' radius circle in the
 * dirt which provides all creatures inside Resistance to either Acid, Cold,
 * Electricity or Fire damage … The ward lasts until physically disrupted or
 * its duration expires." Blunder: "The ward grants Weakness instead."
 *
 * WHY NOT AN EMANATION OR AN AURA. Both are centred on a creature and move
 * with it; a ward is a PLACE. The elemental nexus is a place too, but it
 * acts at the start of a turn; resistance is a standing fact about whoever
 * is inside, so the zone keeps an effect on its occupants and moves it as
 * they move: gained on entering, lost on leaving, gone with the circle.
 *
 * Pure: the declaration, the effect and the bookkeeping; the Foundry side
 * is ward-zone-workflow.mjs.
 */

export const WARD_FLAG = "wardZone";
/** On the occupant's effect: which ward put it there (the Region's uuid). */
export const WARD_EFFECT_FLAG = "wardZoneOf";
const WARD_DAMAGE_TYPES = Object.freeze(["acid", "cold", "electricity", "fire"]);

/**
 * A Region's declaration, normalised, or null when it is not a ward.
 *
 * @param {*} raw {label, damageType, weakness}
 */
export function normaliseWardZone(raw) {
  if (!raw || typeof raw !== "object") return null;
  const damageType = String(raw.damageType ?? "").trim().toLowerCase();
  if (!WARD_DAMAGE_TYPES.includes(damageType)) return null;
  return {
    label: String(raw.label ?? "Ward").trim() || "Ward",
    damageType,
    weakness: raw.weakness === true
  };
}

/**
 * The effect an occupant carries while inside.
 *
 * A TEXT FIELD, written as every other resistance in this system is: an
 * ADD of ", type" that `prepareTextLists` tidies.
 *
 * @param {object} spec from normaliseWardZone
 * @param {string} regionUuid
 * @param {{add: string}} changeType the CHANGE_TYPE table (injected: pure)
 */
export function wardEffectData(spec, regionUuid, changeType = { ADD: "add" }, systemId = "trg-prime") {
  const field = spec.weakness ? "weaknesses" : "resistances";
  const what = spec.weakness ? "weakness" : "resistance";
  return {
    name: `${spec.label}: ${what} to ${spec.damageType}`,
    img: "icons/svg/circle.svg",
    description: `You stand inside ${spec.label}: ${what} to ${spec.damageType} while you remain in the circle.`,
    changes: [{ key: `system.combat.${field}`, type: changeType.ADD, value: `, ${spec.damageType}`, priority: 20 }],
    flags: { [systemId]: { [WARD_EFFECT_FLAG]: regionUuid } }
  };
}

/**
 * What to add and remove so an actor carries exactly the wards it stands in.
 *
 * @param {string[]} holding the ward Region uuids its effects name now
 * @param {string[]} inside  the ward Region uuids its token is inside
 * @returns {{add: string[], remove: string[]}}
 */
export function wardDelta(holding = [], inside = []) {
  const now = new Set(holding), want = new Set(inside);
  return {
    add: [...want].filter((u) => !now.has(u)),
    remove: [...now].filter((u) => !want.has(u))
  };
}
