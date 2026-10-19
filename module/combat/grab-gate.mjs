/**
 * A WEAPON FOR HELD PREY ONLY (3.651.0; F&F 3.0 block 18 R6 — Graham, 16
 * October 2026: "Please adhere to the book ruling"). The Kraken's Bite: "Be
 * aware can only use bite on grabbed targets." Declared on the weapon as
 * `flags.trg-prime.creatureAttack.onlyGrabbedBySelf`; the Strike is refused,
 * before anything is spent, unless the target is Grabbed by this attacker —
 * the `grabbedBy` mark core already writes when a grab lands (and Constrict
 * reads).
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

/** Whether the weapon is declared for grabbed targets only. */
function grabbedOnly(weapon) {
  return weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.onlyGrabbedBySelf === true;
}

/**
 * The refusal, or "".
 *
 * @param {object} weapon
 * @param {{name?: string, grabbed?: boolean, grabbedByUuid?: string}|null} target
 * @param {{name?: string, uuid?: string}} attacker
 */
export function grabbedOnlyRefusal(weapon, target, attacker) {
  if (!grabbedOnly(weapon)) return "";
  const who = target?.name ?? "the target";
  if (!target) return `${weapon.name} can only be used on a creature ${attacker?.name ?? "this creature"} has Grabbed — pick a target.`;
  if (target.grabbed && String(target.grabbedByUuid ?? "") === String(attacker?.uuid ?? "")) return "";
  return `${weapon.name} can only be used on a creature ${attacker?.name ?? "this creature"} has Grabbed — ${who} is not held by it.`;
}
