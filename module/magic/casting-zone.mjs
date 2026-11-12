/**
 * A REGION THAT RAISES SPELL CONCENTRATION DCs (3.685.0, H8). Pure; no Foundry.
 *
 * Eldritch Arts' Zone Disruption: "Any Spell Concentration checks or sustain
 * actions automatically increase their DC by +2." A Region may carry
 *
 *   flags["trg-prime"].castingZone = { concentrationDC: 2, label: "Zone Disruption", exempt: [actorUuid…] }
 *
 * and a Spell Concentration check made by a creature inside it — while
 * casting, or to keep a sustained spell it was interrupted sustaining — has
 * its DC raised by that much. `exempt` lists the creatures it does not touch
 * (Zone Disruption: "on a Critical they ignore the penalties"). Two zones over
 * one creature raise it by the larger, not by both.
 */

export const CASTING_ZONE_FLAG = "castingZone";

/** One Region's zone, or null. */
function normaliseCastingZone(raw) {
  if (!raw || typeof raw !== "object") return null;
  const concentrationDC = Math.max(0, Math.trunc(Number(raw.concentrationDC) || 0));
  if (!concentrationDC) return null;
  return {
    concentrationDC,
    label: String(raw.label ?? "").trim() || "A casting zone",
    exempt: (Array.isArray(raw.exempt) ? raw.exempt : []).map((u) => String(u ?? "").trim()).filter(Boolean)
  };
}

/**
 * The rise for one creature from the zones it stands in.
 * @param {object[]} zones raw `castingZone` flags of the Regions it is inside
 * @param {string} actorUuid
 * @returns {{value: number, label: string}}
 */
export function zoneConcentrationDC(zones = [], actorUuid = "") {
  let best = { value: 0, label: "" };
  for (const raw of zones ?? []) {
    const zone = normaliseCastingZone(raw);
    if (!zone || zone.exempt.includes(String(actorUuid ?? ""))) continue;
    if (zone.concentrationDC > best.value) best = { value: zone.concentrationDC, label: zone.label };
  }
  return best;
}
