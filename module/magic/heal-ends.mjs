/**
 * AN EFFECT THAT ENDS WHEN ITS BEARER REGAINS HIT POINTS (3.685.0, H11).
 * Pure; no Foundry.
 *
 * Eldritch Arts' Primal Snap: "a failed saving throw imposes a -10 status
 * penalty to speed (until healed)". Graham's Q160: "'Until healed' = until it
 * regains any HP."
 *
 * An ActiveEffect carrying `flags["trg-prime"].endsOnHeal = true` is removed
 * the moment its bearer's hit points rise — by any route: a spell, a potion,
 * natural healing, a GM's hand. A spell's `bonus` row may say `endsOnHeal:
 * true` and its effect carries the flag.
 */

const ENDS_ON_HEAL_FLAG = "endsOnHeal";

/** The ids of the effects a rise in HP from `before` to `after` ends. */
export function effectsEndedByHealing(effects = [], before, after, systemId = "trg-prime") {
  const was = Number(before);
  const now = Number(after);
  if (!Number.isFinite(was) || !Number.isFinite(now) || !(now > was)) return [];
  return Array.from(effects ?? [])
    .filter((e) => e && e.flags?.[systemId]?.[ENDS_ON_HEAL_FLAG] === true)
    .map((e) => String(e.id ?? ""))
    .filter(Boolean);
}

/** Stamp the flag onto an effect's flags when a row asks for it. */
export function withEndsOnHeal(flags, row, systemId = "trg-prime") {
  if (row?.endsOnHeal !== true) return flags;
  const out = { ...(flags ?? {}) };
  out[systemId] = { ...(out[systemId] ?? {}), [ENDS_ON_HEAL_FLAG]: true };
  return out;
}
