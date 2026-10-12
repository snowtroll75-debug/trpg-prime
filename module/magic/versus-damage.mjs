/**
 * A BONUS TO DAMAGE AGAINST ONE KIND OF THING, THAT CAN BE SPENT FOR DOUBLE.
 *
 * NEW at 3.608.0, for R8 of the pages 321–330 audit. Pure; no Foundry.
 *
 * SMASH (PP 6, page 326), 1 hour (D)
 *   "You gain a +1-status bonus to base damage rolls against objects and
 *    constructs. As a 0 AP action, you may end this spell early to double
 *    the bonus with one damage roll.
 *      +2 PP: increase the bonus by +1 (+5 max)."
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT GRAVITY WEAPON'S `weaponDamageBonus`. That one is scoped to chosen
 * WEAPONS and capped at +4 across castings; this one is scoped to the
 * TARGET, reaches every weapon the caster swings, and prints its own cap.
 * Stretching one kind to cover both would have given one of them the
 * other's cap.
 *
 * A STATUS BONUS, so two castings do not add: the higher applies.
 *
 * "OBJECTS" ARE THE TABLE'S. Nothing in Foundry marks a door as an
 * object a Strike can be aimed at, so the bonus is automated against
 * creatures of the named types and printed for the rest.
 *
 * THE DISCHARGE IS OFFERED, NOT TAKEN. "You may end this spell early" is a
 * choice, and the one moment it can be made is a damage roll against
 * something the bonus reaches — so that roll asks.
 */

/** The flag an effect carries this on. */
export const VERSUS_DAMAGE_FLAG = "versusDamage";

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/** A `versusDamage` row or stored record, or null. */
export function normaliseVersusDamage(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "versusDamage") return null;
  const vsTypes = (Array.isArray(raw.vsTypes) ? raw.vsTypes : []).map(lower).filter(Boolean);
  // AGAINST AN ALIGNMENT (3.634.0, F&F 3.0 block 4 R1): the Seraphim Aura's
  // "+2-status bonus to … base damage against evil creatures".
  const vsAlignments = (Array.isArray(raw.vsAlignments) ? raw.vsAlignments : []).map(lower).filter(Boolean);
  if (!vsTypes.length && !vsAlignments.length) return null;
  const max = int(raw.max) > 0 ? int(raw.max) : null;
  const value = int(raw.value);
  if (value <= 0) return null;
  return {
    label: text(raw.label) || "Damage bonus",
    value: max ? Math.min(max, value) : value,
    max,
    bonusType: lower(raw.bonusType) || "status",
    vsTypes,
    vsAlignments,
    discharge: Math.max(0, int(raw.discharge)),
    castId: text(raw.castId)
  };
}

/**
 * Which of an actor's records reach this target, best first.
 *
 * @param {Array<object>} records normalised
 * @param {string[]} targetTypes the target's creature types
 */
export function versusDamageReaching(records, targetTypes = [], targetAlignments = []) {
  const types = new Set((targetTypes ?? []).map(lower));
  const alignments = new Set((targetAlignments ?? []).map(lower));
  return (Array.isArray(records) ? records : [])
    .filter((r) => r && (r.vsTypes.some((t) => types.has(t)) || (r.vsAlignments ?? []).some((a) => alignments.has(a))))
    .sort((a, b) => b.value - a.value);
}

/**
 * What one damage roll adds.
 *
 * STATUS BONUSES DO NOT STACK: the best one reaching the target applies.
 * Discharging multiplies THAT bonus, once.
 *
 * @returns {{value: number, record: object|null}}
 */
export function versusDamageBonus(reaching, { discharge = false } = {}) {
  const best = reaching?.[0] ?? null;
  if (!best) return { value: 0, record: null };
  const multiplier = discharge && best.discharge > 1 ? best.discharge : 1;
  return { value: best.value * multiplier, record: best };
}

/** The line the damage card carries. */
export function versusDamageLine(record, value, discharged, targetName) {
  return `${record.label}: <strong>+${value}</strong> damage against ${targetName}`
    + `${discharged ? " — discharged, the spell ends" : ""}.`;
}
