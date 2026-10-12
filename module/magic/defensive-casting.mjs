/**
 * Defensive Casting a creature always has (3.627.0).
 *
 * Pillars of Faith, Chapter 9 — Faultless Casting (Unliving Lich): "All
 * spells you cast are treated as though you were using Defensive Casting.
 * Defensive Casting checks for your spells are Medium (+0) rather than Very
 * Hard (DC +5)."
 *
 *   flags.trg-prime.defensiveCasting = { label: "Faultless Casting", always: true, dcAdd: 0 }
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const DEFENSIVE_CASTING_FLAG = "defensiveCasting";

/** The declaration in force, or null. Two declarations: the cheapest wins. */
export function declaredDefensiveCasting(effects = []) {
  let best = null;
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.[DEFENSIVE_CASTING_FLAG];
    if (!raw || typeof raw !== "object" || raw.always !== true) continue;
    const dcAdd = Number.isFinite(Number(raw.dcAdd)) ? Math.trunc(Number(raw.dcAdd)) : 5;
    if (!best || dcAdd < best.dcAdd) best = { label: String(raw.label ?? "").trim() || "Defensive Casting", always: true, dcAdd };
  }
  return best;
}
