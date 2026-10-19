/**
 * THE REAVER'S STRIKES (3.659.0; Fiends & Fables 3.0 block 28 R8 — Graham,
 * 18 October 2026: "Go with recommendations").
 *
 *   Unstoppable Force — "The Reaver bypasses all resistance with its melee
 *     attacks." A creature ability deriving `meleeIgnoresResistance: true`:
 *     its melee Strikes meet no resistance. DR and immunity still apply.
 *   Reaver Blade — "any additional HP damage inflicted by a critical injury
 *     become Soul Drain instead." A weapon declaring
 *     `creatureAttack.criticalDiceAsSoulDrain: true`: the critical's bonus
 *     dice are rolled as Soul Drain rather than added to the blow.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

/** Does this creature's melee Strike ignore resistance? */
export function ignoresResistanceInMelee(items = []) {
  return Array.from(items ?? []).some((i) => i?.type === "ability" && i?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.meleeIgnoresResistance === true);
}

/** How many of this critical's bonus dice become Soul Drain (0 when the weapon does not say so). */
export function criticalDiceAsDrain(weapon, critical, keptDice) {
  if (!critical || weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.criticalDiceAsSoulDrain !== true) return 0;
  return Math.max(0, Math.trunc(Number(keptDice) || 0));
}

/** The die a damage formula rolls ("5d8+10" → 8); 6 when none is written. */
export function damageDieOf(formula) {
  return Number(/d(\d+)/i.exec(String(formula ?? ""))?.[1] ?? 6) || 6;
}
