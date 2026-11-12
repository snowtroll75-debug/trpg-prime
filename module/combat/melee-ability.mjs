/**
 * A DECLARED ABILITY FOR A MELEE STRIKE (3.684.0; Eldritch Arts Block 6,
 * G25). Pure; no Foundry.
 *
 *   CLEVER STRIKE (Spellblade): "When taking the Strike action with a melee
 *   weapon, you may use your Intelligence modifier instead of your Strength
 *   modifier for the attack roll."
 *   CLEVER DAMAGE (Spellblade): "you may use your Intelligence … instead of
 *   Strength" for melee weapon damage.
 *
 * Weapon Finesse's Dexterity is the core's one swap, by feat name. A module
 * row pushed beside it would STACK with it (Dex − Str and Int − Str both
 * added), so the swap is declared and read where Finesse is, on a feat,
 * ability or applied effect:
 *
 *   flags["trg-prime"].meleeAbility = {
 *     label: "Clever Strike",
 *     attack: ["intelligence"],     // the Strike's attack roll
 *     damage: ["intelligence"]      // its damage (Clever Damage)
 *   }
 *
 * "MAY": the best of the current ability, Finesse's Dexterity (where it
 * applies) and the declared ones — never two of them at once. A melee Strike
 * only: not a ranged one, and not a maneuver (Trip, Shove), which is not
 * "the Strike action".
 */

const SYSTEM_ID = "trg-prime";
const ABILITIES = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);

/**
 * The abilities the actor's documents declare for one half of a melee Strike.
 * @param {Iterable} docs items and applied effects
 * @param {"attack"|"damage"} half
 * @returns {Array<{ability: string, label: string}>}
 */
export function declaredMeleeAbilities(docs = [], half = "attack") {
  const out = [];
  for (const doc of Array.from(docs ?? [])) {
    if (!doc || doc.disabled) continue;
    if (doc.type === "ability" && doc.system?.active === false) continue;
    const raw = doc.flags?.[SYSTEM_ID]?.meleeAbility;
    if (!raw || typeof raw !== "object") continue;
    for (const a of Array.isArray(raw[half]) ? raw[half] : []) {
      const ability = String(a ?? "").trim().toLowerCase();
      if (!ABILITIES.includes(ability)) continue;
      out.push({ ability, label: String(raw.label ?? doc.name ?? "").trim() || "Declared ability" });
    }
  }
  return out;
}

/**
 * The best declared ability's value, if it beats what the Strike already
 * uses. `current` is the ability the Strike already adds (Strength, or
 * Finesse's Dexterity when that was better).
 *
 * @param {Array<{ability, label}>} declared
 * @param {object} attributes the actor's `system.attributes`
 * @param {number} current
 * @returns {{ability: string, label: string, value: number, delta: number}|null}
 */
export function bestMeleeAbility(declared = [], attributes = {}, current = 0) {
  let best = null;
  for (const d of declared ?? []) {
    const value = Math.trunc(Number(attributes?.[d.ability]?.total ?? 0) || 0);
    if (!best || value > best.value) best = { ...d, value };
  }
  if (!best) return null;
  const delta = best.value - Math.trunc(Number(current) || 0);
  return delta > 0 ? { ...best, delta } : null;
}
