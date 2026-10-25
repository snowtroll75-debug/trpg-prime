/**
 * attack-reroll — a defender who spends conviction to make an attacker roll
 * again.
 *
 * NEW at 3.667.0, for Inner Tempest's Mystic. Alter the Thread: "You may use
 * Conviction to force an opponent to reroll an attack check against you. Be
 * aware that a Chaos result cannot be rerolled."
 *
 * GRAHAM'S RULINGS, 22 October 2026 (B3-5):
 *   - it is a conviction spend, so it counts towards the one point a round;
 *   - it is used after the attack roll is seen and before damage;
 *   - the new roll stands, even if it is better for the attacker;
 *   - it works against any attack roll: Strikes and spell attacks.
 *
 * DECLARED, NOT NAMED: an owned item carrying
 * `flags.trg-prime.attackRerollConviction: {label}`. Pure: no Foundry.
 */

const FLAG = "trg-prime";

/** The declaration key. */
export const ATTACK_REROLL_FLAG = "attackRerollConviction";

/** The first item on this creature that declares the spend, or null. */
export function attackRerollSource(items = []) {
  for (const item of items ?? []) {
    const raw = item?.flags?.[FLAG]?.[ATTACK_REROLL_FLAG];
    if (raw) return { item, label: String(raw?.label ?? item?.name ?? "Reroll") };
  }
  return null;
}

/**
 * Whether the defender is offered the reroll of this attack.
 *
 * @param {object} opts
 * @param {boolean} opts.declared the defender declares the spend
 * @param {{ok: boolean, reason?: string|null}} opts.conviction getConvictionState's verdict
 * @param {boolean} opts.chaos the roll is a Chaos result
 * @param {boolean} opts.attackerIsDefender the attacker is attacking itself
 * @returns {{offer: boolean, reason: string|null}}
 */
export function attackRerollOffer({ declared = false, conviction = { ok: false }, chaos = false, attackerIsDefender = false } = {}) {
  if (!declared) return { offer: false, reason: "nothing declares it" };
  if (attackerIsDefender) return { offer: false, reason: "not against your own attack" };
  if (chaos) return { offer: false, reason: "a Chaos result cannot be rerolled" };
  if (!conviction?.ok) return { offer: false, reason: String(conviction?.reason ?? "no conviction to spend") };
  return { offer: true, reason: null };
}

/**
 * A spell attack's total with new dice: the same modifiers, the new roll.
 * (A Strike is rolled again whole; a spell attack's check is the Cast a
 * Spell or innate attack check, which also settled the casting, so only its
 * dice are replaced for the attack.)
 *
 * @param {number} total the check's total
 * @param {number} oldDice the dice part of that total
 * @param {number} newDice the new dice
 */
export function rerolledTotal(total, oldDice, newDice) {
  return Number(total ?? 0) - Number(oldDice ?? 0) + Number(newDice ?? 0);
}
