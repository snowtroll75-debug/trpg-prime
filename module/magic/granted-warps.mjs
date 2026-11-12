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
 * hold. AT 3.684.0 (Eldritch Arts Block 6, G15): `anyTraits` (any one of
 * them), `damaging: true` (the spell deals damage), and the entry's own
 * `when(actor)`, asked of the caster.
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
      // ANY ONE OF THESE TRAITS, AND A SPELL THAT DAMAGES (3.684.0; Eldritch
      // Arts Block 6, G15). Blood of the Wyrm's warp "may be applied to any
      // spell that has an elemental trait" — Graham's Q106: any damaging
      // spell with the Elemental trait or an element or energy trait.
      if (m.anyTraits?.length && !m.anyTraits.some((t) => traits.includes(t))) continue;
      if (m.damaging === true && !spellDealsDamage(spell?.system ?? {})) continue;
      if (m.tradition && m.tradition !== tradition) continue;
      if (m.innate !== null && m.innate !== undefined && m.innate !== innate) continue;
      // OFFERED ONLY TO THIS CASTER (3.684.0, G15): `when(actor)`, the
      // module's own test (the stored dragon type). A throw offers nothing.
      if (typeof entry.when === "function") {
        let offered = false;
        try { offered = entry.when(cast?.actor ?? null) === true; } catch (err) { console.error(`TRG Prime | granted warp "${featKey}": when failed`, err); }
        if (!offered) continue;
      }
      out.push({ ...entry.warp, mods: { ...entry.warp.mods }, grantedBy: String(featKey) });
    }
  }
  return out;
}

/**
 * DOES THIS SPELL DEAL DAMAGE (3.684.0, G15)? Its damage row has a formula,
 * it prints a second pool, or an effect row of its deals damage.
 */
export function spellDealsDamage(system = {}) {
  if (String(system?.damage?.formula ?? "").trim()) return true;
  if (String(system?.secondaryDamage?.formula ?? "").trim()) return true;
  return (Array.isArray(system?.effects) ? system.effects : [])
    .some((e) => String(e?.kind ?? "").trim().toLowerCase() === "damage" && String(e?.formula ?? "").trim());
}

/**
 * A WARP THAT CHANGES THE DAMAGE TYPE (3.684.0; Eldritch Arts Block 6, G15).
 * Blood of the Wyrm: "+2 PP: the spells damage type changes to that of your
 * dragon type". Graham's Q106: ALL of the spell's damage becomes that type,
 * once a cast. The warp's mod `damageType` is aggregated (spell-warp.mjs) and
 * laid over each damage row the cast rolls: the primary, the second pool and
 * the effect rows. A row with no type to change, or no warp, is unchanged.
 *
 * @param {object|null} row a damage row ({formula, type, …}) or null
 * @param {object} warpMods the cast's aggregated mods
 * @returns {object|null} the row with the warped type, or the row as it was
 */
export function warpedDamageRow(row, warpMods = {}) {
  const type = String(warpMods?.damageType ?? "").trim().toLowerCase();
  if (!type || !row || typeof row !== "object") return row;
  return { ...row, type };
}

/**
 * A FREE-WARP CREDIT'S SCOPE (3.684.0; Eldritch Arts Block 6, G25). The core's
 * `warpFreeSchool { school, value }` (Powerful Illusion, Healer's Grace) waives
 * warp PP on spells of one school or trait. Resonance Surge: "automatically
 * warp a spell … by 2 PP without expending the additional PP or increasing the
 * casting DC" — any spell, so `school: "*"` matches every one. Graham's Q148:
 * up to 2 PP of the spell's own warps, not metamagic, which the free-warp
 * channel already is.
 */
export function freeWarpSchoolMatches(scoped, spellTraits = []) {
  const school = String(scoped?.school ?? "").trim().toLowerCase();
  if (!school || !((Number(scoped?.value) || 0) > 0)) return false;
  return school === "*" || (Array.isArray(spellTraits) ? spellTraits : []).includes(school);
}

/** The spell's own warps followed by the granted ones — what the chooser and the aggregation read. */
export function warpsWithGranted(spell = {}, granted = []) {
  const own = Array.isArray(spell?.system?.warps) ? spell.system.warps : [];
  return [...own, ...granted];
}
