/**
 * WHAT A WARP DOES TO A ROW, BEYOND ITS NUMBERS.
 *
 * NEW at 3.611.0, block 34 (pages 341–350). Pure; no Foundry.
 *
 * THREE SMALL GATES THE BLOCK'S WARPS PRINT AND NOTHING READ.
 *
 *   A CONDITION'S VALUE, GROWN.
 *     Waves Of Fatigue  "+2 PP: increase the level of fatigue by 1 (max 5)"
 *     Cloud Mind        "+2 PP: … and Dazed by 1 (max 5)"
 *   Condition rows read no warp at all, so both carried `mods: {}` (or
 *   only Cloud Mind's damage die) and the fatigue stayed at 1.
 *
 *   A ROW A WARP ADDS.
 *     Animal Healing    "+2 PP: reduce the dazed or weakened condition by 1"
 *                       "+3 PP: reduce the injured condition by 1"
 *     Banish Fatigue    "+4 PP: the spell removes the fatigue permanently"
 *   Every other warp in the pack grows a row the spell already has. These
 *   add one it does not, so the row carries `unlockedBy` and is applied
 *   only when a warp naming it was bought.
 *
 *   A ROW THE CASTING'S TOTAL PP DECIDES.
 *     Zealous Conviction "PP 14: the status bonus increases to +3"
 *   Graham's ruling of 2 October 2026: "This is an auto warp if 14 or
 *   more PP are spent on the spell" — with the bonus "+3", the book's
 *   "+15" being the typo. Not bought: reached. So the +2 row says
 *   `ppBelow: 14` and the +3 row `ppAtLeast: 14`, and the total PP the
 *   cast spent (warps and Overcasting included, the number `rollData.pp`
 *   already carries) picks between them.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * A condition's value, after the warps this cast bought.
 *
 * @param {number|null} value the row's own value (null for an unvalued condition)
 * @param {object} warpMods the aggregated warp mods
 * @param {object} [effect] the row; `warpMax` on it beats the warp's own ceiling
 * @returns {number|null}
 */
export function warpedConditionValue(value, warpMods = {}, effect = {}) {
  if (value === null || value === undefined) return value;
  const base = Number(value);
  if (!Number.isFinite(base)) return value;
  const bumps = Math.max(0, int(warpMods?.conditionBump));
  if (!bumps || effect?.warpBump === false) return base;
  const ceiling = int(effect?.warpMax ?? warpMods?.conditionMax ?? 0);
  const grown = base + bumps;
  // A CEILING NEVER LOWERS what the row already gave — a Fumble printing
  // fatigued 4 under a "max 5" warp is grown to 5, not cut to it.
  return ceiling > 0 ? Math.max(base, Math.min(grown, ceiling)) : grown;
}

/**
 * Does this row apply to this cast?
 *
 * @param {object} effect the row
 * @param {object} warpMods the aggregated warp mods
 * @param {number|null} totalPP the PP this cast spent, when known
 * @returns {boolean}
 */
export function rowAppliesToCast(effect, warpMods = {}, totalPP = null) {
  if (!effect || typeof effect !== "object") return false;
  const bought = Array.isArray(warpMods?.unlocks) ? warpMods.unlocks.map(String) : [];
  const unlockedBy = String(effect.unlockedBy ?? "").trim();
  if (unlockedBy && !bought.includes(unlockedBy)) return false;
  // AND A ROW THE SAME WARP REPLACES (3.611.1, F3 of the 3.611.0 drive).
  // Banish Fatigue's "+4 PP: the spell removes the fatigue permanently" is
  // the removal INSTEAD OF the ignoring; with both, the points were ignored
  // and then removed again.
  const supersededBy = String(effect.supersededBy ?? "").trim();
  if (supersededBy && bought.includes(supersededBy)) return false;
  // NULL IS NO TOTAL. `Number(null)` is 0, and a 0 would pass every
  // `ppBelow` — the trap 3.610.1 fixed in `basicSaveHit`.
  const pp = totalPP === null || totalPP === undefined || totalPP === "" ? NaN : Number(totalPP);
  // A PP GATE WITH NO PP TO READ IS NOT PASSED. Applying both of a pair
  // because the total was missing would give Zealous Conviction +2 and +3
  // at once; applying neither at least leaves the card saying nothing.
  if (effect.ppAtLeast !== undefined && effect.ppAtLeast !== null) {
    if (!Number.isFinite(pp) || pp < Number(effect.ppAtLeast)) return false;
  }
  if (effect.ppBelow !== undefined && effect.ppBelow !== null) {
    if (!Number.isFinite(pp) || pp >= Number(effect.ppBelow)) return false;
  }
  return true;
}
