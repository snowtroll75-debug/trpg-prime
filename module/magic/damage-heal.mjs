/**
 * A HEAL THAT ANSWERS DAMAGE — NEW at 3.614.0, Graham's R9 of 2 October 2026
 * (block 35): "Yes" to automating Wellspring Of Valour's heal.
 *
 * Page 359:
 *   "Whenever an ally in the aura first takes damage each round, they regain
 *    1d6 HP from the wellspring's restorative flow.
 *    +4 PP: increase the bonus by +1 and the healing by 1d6."
 *
 * A `damageHeal` row is a live emanation kind: it rides the membership effect
 * (emanation-effects.mjs), so a creature carries it exactly while it stands
 * in the aura. `applyDamageAndCheckDying` asks after every blow that moved
 * the creature's HP; the first in a round heals, and the round is recorded
 * on the effect so the second does not.
 *
 * NOT FOR THE DYING OR THE DEAD. A blow that drops a creature to 0 puts it on
 * the dying track, and a d6 of healing quietly lifting it off again is a
 * ruling this spell does not make; the card says it was withheld.
 *
 * Pure; no Foundry.
 */

export const DAMAGE_HEAL_FLAG = "damageHeal";
export const DAMAGE_HEAL_ROUND_FLAG = "damageHealRound";

const DIE = /^(\d+)d(\d+)$/i;

/**
 * One row, after the warps the cast bought.
 * @param {object} raw `{dice: "1d6", label}`
 * @param {number} extraDice dice added — Wellspring's +4 PP adds one per purchase
 * @returns {{dice: string, label: string}|null}
 */
export function normaliseDamageHeal(raw, extraDice = 0) {
  if (!raw || typeof raw !== "object") return null;
  const m = DIE.exec(String(raw.dice ?? "").trim());
  if (!m) return null;
  const n = Number(m[1]) + Math.max(0, Math.trunc(Number(extraDice) || 0));
  return { dice: `${n}d${m[2]}`, label: String(raw.label ?? "Damage heal") };
}

/**
 * Should this blow heal?
 * @param {{hpBefore: number, hpAfter: number, dying: boolean, dead: boolean,
 *   spentKey?: string|null, nowKey: string}} facts
 * @returns {"heal"|"spent"|"withheld"|"none"}
 */
export function damageHealVerdict({ hpBefore, hpAfter, dying = false, dead = false, spentKey = null, nowKey }) {
  if (!(Number(hpAfter) < Number(hpBefore))) return "none";
  if (spentKey && spentKey === nowKey) return "spent";
  if (dying || dead) return "withheld";
  return "heal";
}
