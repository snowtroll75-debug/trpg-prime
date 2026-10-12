/**
 * Temporary Hit Points.
 *
 * `resources.hp.temp` has existed in the data model since the schema was
 * locked in, but nothing ever read it: every damage path in the system
 * wrote `hp.value` directly, so temporary HP was a number on a sheet
 * that absorbed nothing. Rage is the first rules content to grant it
 * ("temporary HP equal to your class bonus x 20"), which would have been
 * purely decorative without this.
 *
 * Deliberately a shared helper rather than logic inside the rage
 * workflow: temporary HP is a general resource, and every future source
 * of it (spells, potions, class features) should absorb damage the same
 * way rather than each re-implementing it.
 */

/**
 * Split incoming damage across temporary HP and real HP.
 *
 * @param {number} temp Current temporary HP.
 * @param {number} damage Incoming damage.
 * @returns {{absorbed: number, tempRemaining: number, damageRemaining: number}}
 */
export function absorbWithTemporaryHP(temp, damage) {
  const pool = Math.max(0, Math.floor(Number(temp) || 0));
  const incoming = Math.max(0, Math.floor(Number(damage) || 0));
  const absorbed = Math.min(pool, incoming);
  return {
    absorbed,
    tempRemaining: pool - absorbed,
    damageRemaining: incoming - absorbed
  };
}

/**
 * Spend an actor's temporary HP against incoming damage, writing the
 * reduced pool back, and report what damage is left to apply to real HP.
 *
 * @param {Actor} actor
 * @param {number} damage
 * @returns {Promise<{absorbed: number, damageRemaining: number, tempRemaining: number}>}
 */
export async function spendTemporaryHP(actor, damage) {
  const temp = Number(actor?.system?.resources?.hp?.temp ?? 0);
  const result = absorbWithTemporaryHP(temp, damage);

  if (result.absorbed > 0) {
    await actor.update({ "system.resources.hp.temp": result.tempRemaining });
  }

  return result;
}
