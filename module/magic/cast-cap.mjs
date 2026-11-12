/**
 * A RAISE OF THE PP CAP PER CAST (3.680.0; Eldritch Arts Block 3a, D5's cap
 * half).
 *
 * The core's cap is caster level + 1 (character level for a specialist spell),
 * plus a ritual's headroom. The Sorcerer's Raw Power raises it:
 *
 *   "When warping high magic spells, you may increase the total PP cost of the
 *    spell to 1 higher than that normally allowed for a caster of your level."
 *
 * The rule is the module's; this file asks, in registration order, and adds the
 * answers. A module that throws costs its own raise, never the casting, and a
 * raise is never negative: "Do not bypass maximum PP per cast" is about going
 * over, and a module lowering the cap would be a different rule.
 */
import { registeredCastCapModifiers } from "../module-api.mjs";

/**
 * @param {object} ctx `{ actor, spell, spellData, highMagic, warped, specialist, basePP, totalPP }`
 * @returns {Promise<{value: number, labels: string[]}>}
 */
export async function castCapRaise(ctx) {
  const out = { value: 0, labels: [] };
  for (const { key, raise } of registeredCastCapModifiers()) {
    let got;
    try {
      got = await raise(ctx);
    } catch (err) {
      console.error(`TRG Prime | cast cap modifier "${key}" failed`, err);
      continue;
    }
    const value = Math.trunc(Number(typeof got === "object" && got !== null ? got.value : got));
    if (!Number.isFinite(value) || value <= 0) continue;
    out.value += value;
    const label = typeof got === "object" && got !== null ? String(got.label ?? "").trim() : "";
    out.labels.push(label ? `${label} +${value}` : `+${value}`);
  }
  return out;
}
