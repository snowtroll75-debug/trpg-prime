/**
 * A STRIKE THAT CARRIES A SPELL (3.655.0; Fiends & Fables 3.0 block 22 R5 —
 * Graham, 17 October 2026: "Option A"). The Pixie's Bow Casting:
 *
 *   "All of the Pixies spells (not innate or cantrips) are cast as part of
 *   making a Strike action with a bow. If the strike actions hits it target,
 *   it is affected as normal for that spell and the attack inflicts no
 *   damage. If the strike action inflicts a critical hit, any saving throw DC
 *   is increased by 1 per level of severity of the inflicted critical. No
 *   further affects of the critical are applied. Finally, all of the Pixies
 *   spells are Heightened automatically."
 *
 * Declared on the ability:
 *
 *   creatureAbility.derives.bowCasting = { groups: ["Bow"], heighten: true, dcPerSeverity: 1 }
 *
 * A hit with a weapon of a named group offers the archer's spells; the one
 * chosen is cast at the target through core's ordinary cast (its PP paid,
 * its check rolled), Heightened, with the critical's severity added to its
 * DC — and the arrow deals no damage and rolls no injury. "None" lets the
 * arrow strike as normal.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const SEVERITY_STEPS = Object.freeze({ minor: 1, serious: 2, deadly: 3 });

/** The declaration that lets this weapon carry a spell, or null. */
export function bowCastingFor(items = [], weapon = null) {
  const group = String(weapon?.system?.group ?? "").trim().toLowerCase();
  if (!group) return null;
  for (const item of Array.from(items ?? [])) {
    const raw = item?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.bowCasting;
    if (!raw || typeof raw !== "object") continue;
    const groups = (Array.isArray(raw.groups) ? raw.groups : []).map((g) => String(g ?? "").trim().toLowerCase()).filter(Boolean);
    if (!groups.includes(group)) continue;
    return { source: String(item.name ?? "Bow Casting"), heighten: raw.heighten === true, dcPerSeverity: Math.max(0, Math.trunc(Number(raw.dcPerSeverity) || 0)) };
  }
  return null;
}

/** The spells it may carry: its own, not innate, not cantrips (0 PP); cheapest first. */
export function carriedSpells(items = []) {
  return Array.from(items ?? [])
    .filter((i) => i?.type === "spell" && i.system?.innate !== true && Number(i.system?.ppCost ?? 0) > 0)
    .sort((a, b) => Number(a.system.ppCost) - Number(b.system.ppCost) || String(a.name).localeCompare(String(b.name)));
}

/** "Increased by 1 per level of severity": Minor 1, Serious 2, Deadly 3, times the step. */
export function severityDCBonus(severity, perStep = 1) {
  return (SEVERITY_STEPS[String(severity ?? "").toLowerCase()] ?? 0) * Math.max(0, Math.trunc(Number(perStep) || 0));
}
