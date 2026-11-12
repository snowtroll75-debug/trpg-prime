/**
 * RECURRING DAMAGE ON A CREATURE (3.685.0) — the Foundry half of
 * conditions/recurring.mjs.
 *
 * EVERY SOURCE THAT LAYS RECURRING DAMAGE COMES HERE: a bomb, a weapon's
 * "recurring +N", a spell attack's rider, a save ladder's recurring rung,
 * `helpers.addRecurringDamage`, and (through `applyConditionTags`) a critical
 * injury's or a spell row's recurring tag. One rule, `recurringAfterHit`:
 * the same type adds to that type's total; another type stands beside it.
 */

import { recurringAfterHit, recurringByType, recurringEntries, recurringOfType, recurringType } from "./recurring.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Add recurring damage of one type to a creature.
 *
 * @param {Actor} actor
 * @param {number} amount
 * @param {string} damageType
 * @param {{apply?: (options: object) => Promise<any>}} [opts] `apply` replaces
 *   the plain toggle (a relay to the GM for a creature this client does not own)
 * @returns {Promise<{value, damageType, before, added, stacked, replaced}|null>}
 */
export async function layRecurring(actor, amount, damageType, { apply = null } = {}) {
  if (!actor) return null;
  const type = recurringType(damageType);
  const before = recurringOfType(recurringEntries(actor.effects ?? [], SYSTEM_ID), type);
  const next = recurringAfterHit(before, amount, type);
  if (next.added <= 0) return next;
  const options = { value: next.value, damageType: next.damageType };
  if (typeof apply === "function") await apply(options);
  else await actor.toggleStatusEffect("recurring", options);
  return next;
}

/**
 * LOWER RECURRING DAMAGE BY SOME AMOUNT (3.685.0, review). A reducer that
 * names no type ("reduce recurring damage by 1") lowers the largest total —
 * one type, never the sum of them written onto one. Removed at 0.
 *
 * @returns {Promise<{from: number, to: number, damageType: string|null}>}
 */
export async function reduceRecurring(actor, by = 1, damageType = null) {
  const groups = recurringByType(recurringEntries(actor?.effects ?? [], SYSTEM_ID));
  const group = damageType
    ? groups.find((g) => g.damageType === recurringType(damageType))
    : [...groups].sort((a, b) => b.value - a.value)[0];
  if (!actor || !group) return { from: 0, to: 0, damageType: damageType ? recurringType(damageType) : null };
  const to = Math.max(0, group.value - Math.max(0, Math.trunc(Number(by) || 0)));
  if (to > 0) await actor.toggleStatusEffect("recurring", { value: to, damageType: group.damageType });
  else await actor.toggleStatusEffect("recurring", { active: false, damageType: group.damageType });
  return { from: group.value, to, damageType: group.damageType };
}
