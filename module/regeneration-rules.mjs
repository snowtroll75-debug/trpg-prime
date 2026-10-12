/**
 * REGENERATION'S NEGATING TYPE, AND "CANNOT DIE" (3.634.0; Fiends & Fables
 * 3.0 block 4, ruling R2 — Graham, 12 October 2026).
 *
 * Chapter 2: "A creature with regeneration regains an amount of HP equal to
 * its level at the beginning of its turn. A creature with active regeneration
 * cannot die unless its Regeneration is … bypassed (usually by a specific
 * damage type) or its physical form is utterly destroyed. … Be aware that
 * regeneration is negated by a certain damage type."
 *
 * The stat block names the type in brackets — "Regeneration 20 (Evil)" — or
 * the declaration does: `derives.turnStart.negatedBy: ["evil"]`.
 *
 *   - damage of a negating type since its last turn disables the heal for
 *     that turn (beside the amount lockout core has applied since 3.631.0);
 *   - while regeneration is ACTIVE — not negated since its last turn and not
 *     by the blow itself — the creature cannot die: a blow that would take it
 *     to 0 or past it leaves it at 0 HP, unconscious, and its next turn's
 *     heal raises it. The amount lockout only stops the heal; it does not
 *     open the creature to death (the page names the type as what bypasses).
 *
 * An aligned packet reports its alignment ("evil") beside its type
 * ("aligned"), so "(Evil)" meets an evil rider as it meets an Evil spell.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();

function regenerationDerive(item) {
  const t = item?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.turnStart;
  return t && typeof t === "object" && t.kind === "regeneration" ? t : null;
}

/** The types that negate this regeneration item: declared, else its name's bracket. */
export function regenerationNegatedBy(item) {
  const t = regenerationDerive(item);
  if (!t) return [];
  const declared = (Array.isArray(t.negatedBy) ? t.negatedBy : []).map(lower).filter(Boolean);
  if (declared.length) return declared;
  const m = /\(([^)]+)\)\s*$/.exec(String(item?.name ?? ""));
  return m ? m[1].split(/[,/]| or /).map(lower).filter(Boolean) : [];
}

/** Is any of these damage types one that negates? */
export function negatedByTypes(negatedBy, types = []) {
  const have = new Set((types ?? []).map(lower));
  return (negatedBy ?? []).some((t) => have.has(lower(t)));
}

/**
 * Whether regeneration holds a creature from death.
 * @param {object[]} items the creature's items
 * @param {{blowTypes?: string[], sinceTypes?: string[]}} ctx the blow's types and the types taken since its last turn
 * @returns {{label: string, negatedBy: string[]}|null}
 */
export function regenerationHolds(items, { blowTypes = [], sinceTypes = [] } = {}) {
  for (const item of Array.from(items ?? [])) {
    if (!regenerationDerive(item)) continue;
    if (item?.type === "ability" && item?.system?.active === false) continue;
    const negatedBy = regenerationNegatedBy(item);
    if (negatedByTypes(negatedBy, [...(blowTypes ?? []), ...(sinceTypes ?? [])])) continue;
    return { label: String(item.name ?? "Regeneration"), negatedBy };
  }
  return null;
}

/** The damage-type record since its last turn, with this blow's types added. */
export function withDamageTypes(record, types = []) {
  const set = new Set((Array.isArray(record) ? record : []).map(lower));
  for (const t of types ?? []) if (lower(t)) set.add(lower(t));
  return [...set];
}
