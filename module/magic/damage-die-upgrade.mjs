/**
 * A DAMAGE DIE THAT GROWS ON A CONDITION THE SYSTEM CANNOT SEE.
 *
 * NEW at 3.611.0, block 34 (R5, Graham's ruling of 2 October 2026: "Your
 * recommendation"). Pure; no Foundry.
 *
 *   DESTRUCTIVE ROAR (PP 1): "The damage inflicted is 1d8 sonic damage,
 *   which is increased to 1d12 if you have successfully dealt damage to an
 *   enemy earlier in the same turn through a Strike or spell."
 *   +2 PP: increase the damage by 1d8 (or 1d12).
 *
 * NOTHING TRACKS DAMAGE DEALT, so the caster is asked at the cast — the
 * question is on the damage row as `upgrade.ask`, and a yes swaps every
 * d8 in the warped formula (the warp's dice included, which is what "(or
 * 1d12)" means) for a d12.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** The row's upgrade, or null. */
export function damageDieUpgrade(damageRow) {
  const u = damageRow?.upgrade;
  if (!u || typeof u !== "object") return null;
  const from = int(u.from);
  const to = int(u.to);
  if (!(from > 0) || !(to > from)) return null;
  const ask = String(u.ask ?? "").trim();
  if (!ask) return null;
  return { from, to, ask, because: String(u.because ?? "").trim() || "the condition was met" };
}

/** Every `dN` of the upgrade's size in the formula, made the bigger die. */
export function upgradedFormula(formula, upgrade) {
  if (!upgrade) return formula;
  return String(formula ?? "").replace(new RegExp(`(\\d+)d${upgrade.from}\\b`, "g"), `$1d${upgrade.to}`);
}
