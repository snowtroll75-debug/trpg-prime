/**
 * VEHICLES (Chapter 6, pages 176-177) — what a vehicle's sheet can say and
 * do. NEW at 3.577.0. Pure; no Foundry. The Foundry side is
 * vehicles-workflow.mjs; the compendium is built by tools/build-vehicles.mjs
 * from tools/vehicles.json.
 *
 * "Level: The vehicle's level will be displayed here which determines its
 * DC for piloting and construction. If the vehicle has any modifiers to
 * either craft or pilot, they will be displayed here. Check: The skill
 * required to pilot the vehicle is listed here."
 *
 * So a vehicle carries its pilot DC and the skill (or, for the three
 * ships whose check "varies", none — the pilot chooses), and the sheet's
 * Pilot button rolls the piloting character's skill against it.
 */

const SYSTEM_ID = "trg-prime";

/** The vehicle block an actor carries, or null for anything else. */
export function vehicleOf(actor) {
  const v = actor?.flags?.[SYSTEM_ID]?.vehicle;
  return v && typeof v === "object" ? v : null;
}

/**
 * Is this actor a vehicle, for what its sheet shows?
 *
 * GRAHAM'S RULING AFTER THE 3.577.1 RELEASE (20 September 2026): the
 * creature numbers an NPC derives — Initiative, the attack bonuses,
 * Critical Resistance, Reflex, Will and the six attributes — are hidden
 * on a vehicle's sheet. A Galley showed Initiative −20, Melee Attack 10
 * and Strength 4: numbers the printed stat block does not have and no
 * rule reads, computed only because a vehicle is built as an NPC.
 *
 * THE COMPENDIUM'S FLAG OR THE PRINTED TRAIT. A vehicle from the pack
 * carries its vehicle block; a GM's own raft may carry only the
 * "Vehicle" trait, as every printed stat block does, and should read the
 * same way.
 *
 * @param {object} actor
 * @returns {boolean}
 */
export function isVehicleActor(actor) {
  if (vehicleOf(actor)) return true;
  return /(^|,)\s*vehicle\s*(,|$)/i.test(String(actor?.system?.details?.traits ?? ""));
}

/**
 * What the sheet shows.
 *
 * @param {object} vehicle `vehicleOf(actor)`
 * @param {object} [skillLabels] key → label
 * @returns {{dc: number, skills: string[], skillText: string, choose: boolean}|null}
 */
export function vehiclePilotView(vehicle, skillLabels = {}) {
  if (!vehicle) return null;
  const skills = Array.isArray(vehicle.checks) ? vehicle.checks.filter(Boolean) : [];
  return {
    dc: Number(vehicle.pilotDC) || 0,
    skills,
    skillText: skills.length
      ? skills.map((key) => skillLabels[key] ?? key).join(" or ")
      : `the pilot's choice (${vehicle.checkText || "varies"})`,
    choose: skills.length !== 1
  };
}
