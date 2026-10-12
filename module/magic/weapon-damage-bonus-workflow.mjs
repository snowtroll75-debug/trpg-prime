/**
 * The Foundry side of a flat weapon-damage bonus (see
 * weapon-damage-bonus.mjs).
 *
 * NEW at 3.493.0.
 *
 * ONE JOB: read every live record off an actor. The arithmetic — which
 * weapon, how much, and the printed cap — is decided in the pure module,
 * and the formula it feeds is assembled in `resolveWeaponDamage` beside
 * the other flat bonuses rather than here.
 */

import { WEAPON_DAMAGE_BONUS_FLAG, normaliseWeaponDamageBonus } from "./weapon-damage-bonus.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every live weapon-damage bonus this actor carries.
 *
 * A DISABLED EFFECT CARRIES NOTHING — the position `strikeRidersOn` and
 * `spendHeldBonus` both take, and for the same reason: a GM who switched
 * an effect off expects it to stop happening.
 *
 * @returns {Array<{weaponIds: string[], value: number}>}
 */
export function weaponDamageBonusesOn(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.[WEAPON_DAMAGE_BONUS_FLAG];
    if (!raw) continue;
    const spec = normaliseWeaponDamageBonus(raw);
    if (!spec) continue;
    out.push(spec);
  }
  return out;
}
