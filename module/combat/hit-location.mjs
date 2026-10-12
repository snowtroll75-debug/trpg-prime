/**
 * Hit location (Chapter 7, Critical Injuries + Chapter 6, Armour
 * Fittings): the units die of the critical injury roll determines
 * which body location was struck, and armour only reduces damage
 * from a critical if it actually covers that specific location —
 * "all armour...is considered to be a shirt or breastplate" (torso
 * only) "to increase your armour's coverage...you must add bracers,
 * greaves and helmets" for arms, legs, and head/neck respectively.
 *
 * Confirmed against the rulebook's own worked example (Chapter 7):
 * Valgar's Plate covers only the torso; a critical that rolls a leg
 * hit takes full damage since he has no leg armour, even though his
 * torso DR would have applied to a torso hit.
 *
 * Pure logic; the Foundry workflow (attack-workflow.mjs) layers on
 * top, same separation as the rest of this system.
 */

/**
 * Maps the critical injury roll's unit die to a hit location, per
 * Graham's own table: 1-3 Arms, 4-6 Legs, 7-8 Chest, 9 Abdomen, 10
 * Head/Neck. The unit die as already returned by rollPercentile is
 * 0-9 (a roll of 10 wraps to 0 via %10), so 0 here means "rolled a
 * 10" and maps to Head/Neck.
 *
 * @param {number} unit 0-9, as returned by rollPercentile's own
 *   `unit` field.
 * @returns {"arms"|"legs"|"chest"|"abdomen"|"headNeck"}
 */
export function hitLocationFromUnitDie(unit) {
  const face = ((Math.trunc(Number(unit) || 0) % 10) + 10) % 10;
  if (face === 0) return "headNeck";
  if (face <= 3) return "arms";
  if (face <= 6) return "legs";
  if (face <= 8) return "chest";
  return "abdomen";
}

/** Display label for a hit location, for chat cards. */
export const HIT_LOCATION_LABELS = {
  arms: "Arms",
  legs: "Legs",
  chest: "Chest",
  abdomen: "Abdomen",
  headNeck: "Head/Neck"
};

/**
 * Whether a single equipped armour piece covers a given hit
 * location, per the Armour Fittings coverage model: base armour
 * covers the torso (chest and abdomen together — "a shirt or
 * breastplate," a single garment, not two separate ones); bracers
 * cover arms; greaves cover legs; helmets cover head/neck (reusing
 * the existing isHelmet field, which already means exactly this,
 * rather than adding a redundant duplicate).
 *
 * @param {{system: {coversTorso?: boolean, coversArms?: boolean, coversLegs?: boolean, isHelmet?: boolean}}} armourItem
 * @param {string} location One of the hitLocationFromUnitDie keys.
 * @returns {boolean}
 */
export function armourPieceCoversLocation(armourItem, location) {
  const system = armourItem?.system ?? {};
  if (location === "chest" || location === "abdomen") return Boolean(system.coversTorso);
  if (location === "arms") return Boolean(system.coversArms);
  if (location === "legs") return Boolean(system.coversLegs);
  if (location === "headNeck") return Boolean(system.isHelmet);
  return false;
}

/**
 * Whether ANY of the actor's equipped armour covers the given
 * location — a full suit is usually more than one item, and the
 * question is whether the location is covered at all, not by which
 * specific piece.
 *
 * @param {Array<{type: string, system: object}>} items All of the
 *   actor's items (not just armour — filtered internally).
 * @param {string} location
 * @returns {boolean}
 */
export function locationCoveredByArmour(items, location) {
  return items
    .filter((item) => item.type === "armour" && item.system?.equipped)
    .some((item) => armourPieceCoversLocation(item, location));
}

/**
 * WHAT KIND of armour covers this location (Chapter 7, page 204;
 * Graham's R6 and R7).
 *
 * The critical tables address three different targets — "Armoured:",
 * "Metal Armoured:" and "Rigid Armoured:" — and until 3.580.0 the
 * system could only answer the first, so a leather jerkin collected
 * results the book reserves for plate.
 *
 * RIGID AND METAL ARE TRAITS, not categories. They are read off the
 * armour item's own `traits` line, the same place Sleeping in Armour
 * reads them ("Light Armour +5, Heavy Armour -5, Rigid -1, Metal -2"),
 * so a GM who has written them on one piece has written them for both
 * rules. Only pieces COVERING THE STRUCK LOCATION are consulted: a
 * helmet's steel says nothing about a blow to the legs.
 *
 * @param {Array<{type: string, system: object}>} items
 * @param {string} location
 * @returns {{armoured: boolean, rigid: boolean, metal: boolean}}
 */
export function armourAtLocation(items, location) {
  const covering = Array.from(items ?? []).filter(
    (item) => item.type === "armour" && item.system?.equipped
      && armourPieceCoversLocation(item, location));
  const traitsOf = (item) => String(item.system?.traits ?? "").toLowerCase();
  return {
    armoured: covering.length > 0,
    rigid: covering.some((item) => traitsOf(item).includes("rigid")),
    metal: covering.some((item) => traitsOf(item).includes("metal"))
  };
}

/**
 * ARMOUR THAT COVERS EVERY LOCATION (3.617.4).
 *
 * Mage Armour "grants you Armour DR 1" and names no location; Bracers of
 * Armour envelop the wearer "in a shield of magical armour". Graham, 4
 * October 2026 (Q1 of the 3.617.3 drive): "Yes it should cover every hit
 * location."
 *
 * Until then a critical counted as armoured only where a WORN piece covered
 * the struck location, so on a caster in no armour — the one Mage Armour is
 * for — every critical went straight past it, drained nothing, and its CL 10
 * rigidity never applied (it hardens armour at the struck location).
 *
 * Read off the one Base DR channel (`system.combat.bracers`, 3.617.2): it
 * covers while its source is live — a pair of bracers that is not inert, or
 * a spell's armour with HP. Its DR was already compared per location by the
 * damage step (the higher of it and the worn armour covering the spot); the
 * only thing missing was the answer "yes, armoured".
 *
 * @param {object} system an actor's system data
 * @returns {{armoured: boolean, rigid: boolean, name: string}}
 */
export function wholeBodyArmour(system) {
  const base = system?.combat?.bracers;
  const live = Boolean(base?.itemId || base?.effectId) && Number(base?.effective ?? 0) > 0;
  return {
    armoured: live,
    // "CL 10: rigid for injury purposes", while the spell's armour has HP
    // (MA4) — `spellArmour` is zeroed when it has none.
    rigid: live && Boolean(system?.combat?.spellArmour?.rigid),
    name: live ? String(base?.itemName ?? "") : ""
  };
}

/**
 * A location's armour, with the whole-body armour laid over it: armoured
 * wherever that is live, rigid where either is, metal only where a worn
 * piece is (neither the spell nor the bracers are metal).
 *
 * @param {{armoured: boolean, rigid: boolean, metal: boolean}} atLocation
 *   from armourAtLocation
 * @param {object} system the wearer's system data
 */
export function withWholeBodyArmour(atLocation, system) {
  const whole = wholeBodyArmour(system);
  const here = atLocation ?? { armoured: false, rigid: false, metal: false };
  if (!whole.armoured) return { ...here, coveredBy: "" };
  return {
    ...here,
    armoured: true,
    rigid: Boolean(here.rigid) || whole.rigid,
    // Named on the card only when it is the sole cover at the spot.
    coveredBy: here.armoured ? "" : whole.name
  };
}

/**
 * Whether a specific equipped armour piece's DR should contribute to
 * reducing this hit's damage — per Graham directly: "DR (regardless
 * of its location) is applied" on a non-critical hit (every equipped
 * piece counts), but on a critical with a known struck location, only
 * armour that actually covers that location contributes at all. When
 * the location isn't known (e.g. the standalone Damage button, with
 * no critical injury roll to draw from), falls back to counting every
 * equipped piece, matching the non-critical rule, since there's no
 * location-specific answer available to narrow it down.
 *
 * @param {{type: string, system: object}} item
 * @param {{isCritical: boolean, hitLocation: string|null}} context
 * @returns {boolean}
 */
export function armourContributesToHit(item, { isCritical, hitLocation }) {
  if (item.type !== "armour" || !item.system?.equipped) return false;
  if (!isCritical || !hitLocation) return true;
  return armourPieceCoversLocation(item, hitLocation);
}
