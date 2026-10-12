/**
 * WARPING OPTIONS A FEAT GRANTS (3.625.0). Pure; no Foundry.
 *
 * Three Pillars of Faith feats print a warp that belongs to the CASTER:
 *
 *   SWIFT MENDER          "PP Cost +4: reduce the AP cost required to cast
 *                          a spell with the Healing trait by 1 (min 1 AP)."
 *   RENEWED RESTORATION   "PP Cost +4: the target ignores the normal
 *                          once-per-day limit on benefiting from Restoration."
 *   GUIDING LUMINESCENCE  "Whenever you cast Guidance using the innate spell
 *                          granted by your Lumeri growth, you may target
 *                          two creatures rather than one."
 *
 * Each has the shape of a spell's own warping option — a cost, a sentence
 * and a mod the warp arithmetic already knows (`castApDelta`,
 * `extraTargets`) or one added here (`ignoreDailyLimit`) — so the honest
 * build is to let a module REGISTER a warp against a feat and have the
 * cast offer it beside the spell's printed ones. The chooser, the
 * aggregation and the innate free budget then treat it as any other warp,
 * which is exactly the equal footing the book gives it.
 *
 * A match names the spells the warp joins: by name, by trait, by
 * tradition, and whether the cast is innate; every declared axis must
 * hold.
 */

/**
 * The warps the caster's feats add to this spell.
 *
 * @param {Array<[string, Array<{match, warp}>]>} granted [featKey, entries] for each owned feat
 * @param {{name: string, system: object}} spell
 * @param {{innate?: boolean}} [cast]
 * @returns {Array<{ppCost: number, text: string, mods: object, max: number, grantedBy: string}>}
 */
export function grantedSpellWarps(granted = [], spell = {}, cast = {}) {
  const name = String(spell?.name ?? "").trim().toLowerCase();
  const traits = String(spell?.system?.traits ?? "").split(/[,\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
  const tradition = String(spell?.system?.tradition ?? "").trim().toLowerCase();
  const innate = Boolean(cast?.innate ?? spell?.system?.innate);
  const out = [];
  for (const [featKey, entries] of granted ?? []) {
    for (const entry of entries ?? []) {
      const m = entry?.match ?? {};
      if (m.name && m.name !== name) continue;
      if (m.traits?.length && !m.traits.every((t) => traits.includes(t))) continue;
      if (m.tradition && m.tradition !== tradition) continue;
      if (m.innate !== null && m.innate !== undefined && m.innate !== innate) continue;
      out.push({ ...entry.warp, mods: { ...entry.warp.mods }, grantedBy: String(featKey) });
    }
  }
  return out;
}

/** The spell's own warps followed by the granted ones — what the chooser and the aggregation read. */
export function warpsWithGranted(spell = {}, granted = []) {
  const own = Array.isArray(spell?.system?.warps) ? spell.system.warps : [];
  return [...own, ...granted];
}
