/**
 * TAKING A CONDITION AWAY, AND GIVING A RESOURCE BACK (3.630.0). Pure.
 *
 * The relief rail (condition-relief.mjs) steps a VALUED condition down by
 * its unit. Two things it could not say:
 *
 *   conditionRemove — a condition gone outright, valued or not. Sunveil
 *     "You remove the Dazzled condition"; Divine Nectar "remove the
 *     Drained, Fatigued, Frightened, Sickened, Stunned and Weakened
 *     conditions"; Greysap "ends one source of persistent acid damage" —
 *     one Recurring Damage effect of that type, the condition's own record
 *     of where it came from.
 *
 *       { kind: "conditionRemove", conditions: ["dazzled"] }
 *       { kind: "conditionRemove", recurringType: "acid", count: 1 }
 *
 *   restore — a resource back to its ceiling or by a number. Divine Nectar
 *     "regain all Hit Points and Power Points"; Void Lily "regain 1
 *     Conviction Point, up to your normal maximum".
 *
 *       { kind: "restore", resource: "hp" | "pp" | "conviction", amount: "all" | N }
 *
 * "UNLESS IT WAS CAUSED BY A PERMANENT EFFECT" (Sunveil) is the table's: a
 * condition effect does not record whether its source was permanent, and a
 * permanent source puts it back. The card says so.
 */
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

export function normaliseConditionRemove(raw, knownConditions = {}) {
  if (!raw || typeof raw !== "object") return null;
  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .map(text).filter((c) => knownConditions[c]);
  const recurringType = lower(raw.recurringType);
  if (!conditions.length && !recurringType) return null;
  return {
    conditions,
    recurringType,
    count: Math.max(1, Math.trunc(Number(raw.count) || 1)),
    note: text(raw.note)
  };
}

/** Which Recurring Damage effects a typed removal ends: the first `count` of that type. */
export function recurringToEnd(effects = [], spec, systemId = "trg-prime") {
  if (!spec?.recurringType) return [];
  return Array.from(effects ?? [])
    .filter((e) => e?.flags?.[systemId]?.condition === "recurring"
      && lower(e?.flags?.[systemId]?.damageType) === spec.recurringType)
    .slice(0, spec.count);
}

const RESOURCES = Object.freeze({
  hp: { label: "Hit Points", short: "HP" },
  pp: { label: "Power Points", short: "PP" },
  conviction: { label: "Conviction", short: "Conviction" }
});

export function normaliseRestore(raw) {
  if (!raw || typeof raw !== "object") return null;
  const resource = lower(raw.resource);
  if (!RESOURCES[resource]) return null;
  const all = lower(raw.amount) === "all";
  const amount = all ? 0 : Math.trunc(Number(raw.amount) || 0);
  if (!all && amount <= 0) return null;
  return { resource, all, amount, label: RESOURCES[resource].label, short: RESOURCES[resource].short };
}

/**
 * How much a restore gives back, from the creature's own numbers.
 * PP's ceiling is its maximum less what extended spells hold locked — the
 * same ceiling a rest restores to.
 *
 * @param {{value: number, max: number, locked?: number}} pool
 */
export function restoreAmount(spec, pool = {}) {
  if (!spec) return 0;
  const value = Math.max(0, Number(pool.value) || 0);
  const ceiling = Math.max(0, (Number(pool.max) || 0) - (spec.resource === "pp" ? Math.max(0, Number(pool.locked) || 0) : 0));
  const room = Math.max(0, ceiling - value);
  return spec.all ? room : Math.min(room, spec.amount);
}
