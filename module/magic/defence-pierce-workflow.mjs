/**
 * The Foundry side of a defence pierce (see defence-pierce.mjs).
 *
 * NEW at 3.585.0.
 *
 * ONE JOB: read every live record off an actor. Which slots, how much,
 * and against whom is decided in the pure module and applied in
 * `resolveAttack` beside the other defence adjustments.
 */

import { DEFENCE_PIERCE_FLAG, normaliseDefencePierce } from "./defence-pierce.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every live defence pierce this actor carries.
 *
 * A DISABLED EFFECT CARRIES NOTHING — the position `strikeRidersOn` and
 * `weaponDamageBonusesOn` both take, and for the same reason: a GM who
 * switched an effect off expects it to stop happening.
 *
 * @param {Actor} actor
 * @returns {Array<{label: string, slots: string[], weaponIds: string[]}>}
 */
export function defencePiercesOn(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.[DEFENCE_PIERCE_FLAG];
    if (!raw) continue;
    const spec = normaliseDefencePierce(raw);
    if (!spec) continue;
    out.push(spec);
  }
  return out;
}
