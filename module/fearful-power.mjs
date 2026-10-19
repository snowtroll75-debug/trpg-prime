/**
 * FEARFUL POWER (3.659.0; Fiends & Fables 3.0 block 28 R9 — Graham, 18
 * October 2026: "Option A on 9"). The Tenebrax:
 *
 *   "Any creature that gains the frightened condition within a 30' radius of
 *    the Tenebrax increases the value of the condition by 1. Furthermore, the
 *    Tenebrax gains a status bonus to all of its attacks and DB equal to the
 *    highest frightened value within this radius."
 *
 * Declared on the ability: `derives.fearfulPower: { feet: 30 }`. Positions
 * are read at the moment they matter (fearful-power-workflow.mjs), as the
 * ally auras' are. Pure.
 */
const SYSTEM_ID = "trg-prime";

/** A creature's Fearful Power, or null: `{ item, feet }`. */
export function fearfulPowerOf(items = []) {
  for (const item of Array.from(items ?? [])) {
    if (item?.type !== "ability") continue;
    const raw = item.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.fearfulPower;
    if (!raw || typeof raw !== "object") continue;
    const feet = Math.max(0, Math.trunc(Number(raw.feet) || 0));
    if (feet) return { item, feet };
  }
  return null;
}

/** A frightened tag raised by one for each Fearful Power in reach (at most once). */
export function boostedFrightenedTag(tag, powerNames = []) {
  if (!tag || tag.key !== "frightened" || !powerNames.length) return tag;
  const value = Math.max(0, Math.trunc(Number(tag.value) || 0));
  if (!value) return tag;
  return { ...tag, value: value + 1, label: `${tag.label ?? "Frightened"} (+1, ${powerNames[0]}'s Fearful Power)` };
}

/**
 * The status bonus a status already on the score leaves to add: status
 * bonuses do not stack, so only what it beats the existing one by.
 */
export function statusBonusOver(bonus, existingStatus = 0) {
  return Math.max(0, Math.trunc(Number(bonus) || 0) - Math.max(0, Math.trunc(Number(existingStatus) || 0)));
}
