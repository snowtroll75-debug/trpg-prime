import { findEquippedGearByTrait, consumedUseValue } from "./gear-uses.mjs";

/**
 * Spends one use from a matching equipped gear item, if the actor has
 * one — silent (no warning) if they simply don't own or haven't
 * equipped a matching item at all, since owning one isn't a strict
 * requirement to attempt the action itself (Chapter 6/9). Warns only
 * when a matching item IS equipped but already depleted, so the
 * player knows to restock rather than wondering why nothing happened.
 *
 * @param {Actor} actor
 * @param {RegExp} traitPattern
 * @returns {Promise<void>}
 */
export async function consumeGearUse(actor, traitPattern) {
  const item = findEquippedGearByTrait(Array.from(actor.items ?? []), traitPattern);
  if (!item) return;

  const max = Number(item.system?.uses?.max ?? 0);
  const current = Number(item.system?.uses?.value ?? 0);
  if (max <= 0) return;

  if (current <= 0) {
    ui.notifications.warn(`${item.name} has no uses remaining.`);
    return;
  }

  const newValue = consumedUseValue(current, max);
  await item.update({ "system.uses.value": newValue });
}

/**
 * Spends one use of the kit an action was made with (3.577.0).
 *
 * THE KIT THE REQUIREMENT ACCEPTED, not merely an equipped one — see
 * `toolToSpend` in tools-requirement.mjs for the defect this closes
 * (block 17, D4: a carried Healers Tools never ran down). Silent when the
 * character has no counting kit to spend from: the missing-tools penalty
 * has already been offered on the check.
 *
 * @param {Actor} actor
 * @param {string} actionKey
 * @returns {Promise<{item: Item, left: number}|null>}
 */
export async function spendToolUse(actor, actionKey) {
  const { toolToSpend } = await import("./tools-requirement.mjs");
  const item = toolToSpend({ actionKey, items: Array.from(actor?.items ?? []) });
  if (!item) return null;
  const max = Number(item.system?.uses?.max ?? 0);
  if (max <= 0) return null;
  const left = consumedUseValue(item.system?.uses?.value, max);
  await item.update({ "system.uses.value": left });
  if (left <= 0) ui.notifications.info(`${item.name} is exhausted — it needs Replacements to be used again.`);
  return { item, left };
}
