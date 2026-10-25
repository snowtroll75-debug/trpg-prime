/**
 * ATTACKS THAT COUNT AS MAGICAL (3.625.0). Pure; no Foundry.
 *
 * Two Pillars of Faith rules say a mundane weapon is treated as magical
 * for the one thing that word decides in the damage pipeline — whether
 * "immune to non-magical attack forms" and the resistances written
 * "except magical" stand against it:
 *
 *   SANCTIONED STRIKE (Grimward, 4th)   "all weapon and unarmed attacks you
 *     make against your Judged Subject are treated as magical for the
 *     purpose of overcoming Resistance and Immunity."
 *   CONSECRATED ARMAMENT (feat)         "Attacks you make with [your
 *     aspect's favoured weapon] are treated as Magical for the purpose of
 *     overcoming Resistance and Immunity."
 *
 * The damage path already carries `magical` (a potency rune, a runed
 * round, a morph's strike, a weapon's own `magicalStrike` flag); this adds
 * the actor's side of the same fact, as data on an effect:
 *
 *   flags["trg-prime"].magicalAttacks = {
 *     label: "Sanctioned Strike",
 *     targetUuids: [uuid],       // optional: only against these creatures
 *     weaponNames: ["Oath Hammer"], // optional: only with these weapons
 *     targetTraits: ["incorporeal"]  // optional (3.664.0): only against these traits
 *   }
 *
 * An entry naming neither applies to every strike the actor makes. Both
 * axes, when named, must hold. Nothing here grants an item bonus or any
 * other property — the books say so, in both places.
 */

const SYSTEM_ID = "trg-prime";

/** Every well-formed declaration on the actor's effects. */
export function declaredMagicalAttacks(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.magicalAttacks;
    if (!raw || typeof raw !== "object") continue;
    out.push({
      label: String(raw.label ?? effect.name ?? "Magical attacks"),
      targetUuids: (Array.isArray(raw.targetUuids) ? raw.targetUuids : []).map((u) => String(u ?? "").trim()).filter(Boolean),
      weaponNames: (Array.isArray(raw.weaponNames) ? raw.weaponNames : []).map((n) => String(n ?? "").trim().toLowerCase()).filter(Boolean),
      // ONLY AGAINST CREATURES WITH THESE TRAITS (3.664.0): Spirit Stance's
      // "treated as magical for the purpose of overcoming the defences of
      // incorporeal creatures and spirits".
      targetTraits: (Array.isArray(raw.targetTraits) ? raw.targetTraits : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean)
    });
  }
  return out;
}

/**
 * The declaration that makes THIS strike magical, or null.
 * @param {Array} declared declaredMagicalAttacks(...)
 * @param {{targetUuid?: string, weaponName?: string}} ctx
 */
export function magicalAttackSource(declared = [], { targetUuid = "", weaponName = "", targetTraits = [] } = {}) {
  const uuid = String(targetUuid ?? "").trim();
  const name = String(weaponName ?? "").trim().toLowerCase();
  const traits = (Array.isArray(targetTraits) ? targetTraits : []).map((t) => String(t ?? "").trim().toLowerCase());
  for (const d of declared ?? []) {
    if (d.targetUuids.length && (!uuid || !d.targetUuids.includes(uuid))) continue;
    if (d.weaponNames.length && (!name || !d.weaponNames.includes(name))) continue;
    if ((d.targetTraits ?? []).length && !d.targetTraits.some((t) => traits.includes(t))) continue;
    return d;
  }
  return null;
}
