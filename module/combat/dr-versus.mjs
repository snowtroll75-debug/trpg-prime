/**
 * DR AGAINST ONE DAMAGE TYPE (3.696.0, CD4 of the Pillars of Faith audit).
 *
 * Ossuary Lamellar: "grants +1 DR against slashing damage." DR on the sheet
 * is one number, applied to every physical type, so a type-scoped point had
 * nowhere to live. An effect declares it:
 *
 *   flags.trg-prime.drVersus = { slashing: 1 }        (or several types)
 *
 * and `resolveAgainstDefences` adds it to the ARMOUR pool for a packet of that
 * type — so an unarmoured location (drBypassed) does not get it, and the
 * type's own DR effectiveness (physical full, energy half, essence none)
 * scales it with the rest. Flat: not multiplied by BDB, as a Base DR bonus is
 * not (Graham's reading of "+1 DR" on an item, 16 Nov 2026 audit).
 *
 * Typed rows from several effects ADD — they are separate pieces of DR, as
 * two DR bonuses are. Read off the actor's applied effects, so a worn-gated
 * or invested-gated item effect counts only while it applies.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

/** The extra DR these effects declare against one damage type. */
export function drVersusFor(effects = [], type = "") {
  const want = String(type ?? "").trim().toLowerCase();
  if (!want) return 0;
  let total = 0;
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled || effect.isSuppressed) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.drVersus;
    if (!raw || typeof raw !== "object") continue;
    for (const [key, value] of Object.entries(raw)) {
      if (String(key).trim().toLowerCase() !== want) continue;
      const n = Math.trunc(Number(value) || 0);
      if (n > 0) total += n;
    }
  }
  return total;
}
