/**
 * RECURRING DAMAGE STACKS BY TYPE (3.685.0). Pure; no Foundry.
 *
 * Graham, 7 November 2026 (Eldritch Arts Block 7, Q150): "recurring damage
 * stacks with a flat check made for totals of the same damage type. Bleed is
 * different for the flat check (only up to 4) but still stacks (or at least
 * it should do)."
 *
 * So:
 *   - recurring damage of the SAME type adds to one running total — one
 *     Recurring Damage condition per type;
 *   - each type's total is dealt in Phase 3 as before (DR never reduces it,
 *     Graham's ruling of 2 August 2026) and makes ONE flat check;
 *   - DIFFERENT types are separate totals, each with its own flat check;
 *   - nothing replaces anything any more.
 *
 * BEFORE THIS RELEASE there were two rules, and they disagreed:
 *   - `recurringAfterHit` (bombs, weapon "recurring +N", a spell attack's
 *     rider, a ladder's recurring rung, `helpers.addRecurringDamage`): one
 *     condition per creature; the same type kept the HIGHER value; another
 *     type REPLACED it;
 *   - a recurring condition TAG (critical injuries, a spell's `condition`
 *     row, the Universal Modifier): ADDED the new value to the one condition
 *     and wrote the NEWEST type over it, whatever the old one was.
 * Both now go through `recurringAfterHit` below.
 *
 * BLEEDING already stacked: every source that adds it goes through a
 * condition tag, and `combinedConditionValue` adds Bleeding. Its flat check
 * is unchanged: the book's "If you are suffering from light bleeding, you may
 * attempt to remove it in the same way as other recurring damage each round
 * by making a flat check" — Light is 1 to 4 ("only up to 4").
 */

import { combinedConditionValue } from "./condition-rules.mjs";

/** The type an untyped recurring damage has (the condition manager's ruling). */
const DEFAULT_RECURRING_TYPE = "fire";

/** A damage type as the condition stores it; untyped is fire. */
export function recurringType(type) {
  const t = String(type ?? "").trim().toLowerCase();
  return t || DEFAULT_RECURRING_TYPE;
}

/**
 * The live recurring entries on a creature, read from its effects.
 * @param {Iterable<object>} effects ActiveEffect-like
 * @param {string} [systemId]
 * @returns {Array<{effect: object, value: number, damageType: string}>}
 */
export function recurringEntries(effects = [], systemId = "trg-prime") {
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled) continue;
    const statuses = effect.statuses;
    const has = statuses?.has?.("recurring") || (Array.isArray(statuses) && statuses.includes("recurring"))
      || effect.flags?.[systemId]?.condition === "recurring";
    if (!has) continue;
    const flags = effect.flags?.[systemId] ?? {};
    out.push({
      effect,
      value: Math.max(0, Math.floor(Number(flags.value ?? 1) || 0)),
      damageType: recurringType(flags.damageType)
    });
  }
  return out;
}

/**
 * One total per damage type, in the order the types first appear. Two
 * effects of one type (a world from before this release, or a GM's hand) are
 * read as one total: one packet and one flat check.
 * @param {Array<{effect, value, damageType}>} entries
 * @returns {Array<{damageType: string, value: number, effects: object[]}>}
 */
export function recurringByType(entries = []) {
  const groups = new Map();
  for (const entry of entries ?? []) {
    const type = recurringType(entry?.damageType);
    const group = groups.get(type) ?? { damageType: type, value: 0, effects: [] };
    group.value += Math.max(0, Math.floor(Number(entry?.value) || 0));
    if (entry?.effect) group.effects.push(entry.effect);
    groups.set(type, group);
  }
  return Array.from(groups.values());
}

/** The total a creature already carries of one type (0 if none). */
export function recurringOfType(entries = [], type) {
  const want = recurringType(type);
  return (entries ?? []).filter((e) => recurringType(e?.damageType) === want)
    .reduce((sum, e) => sum + Math.max(0, Math.floor(Number(e?.value) || 0)), 0);
}

/**
 * THE ONE STACKING RULE. What a creature's total of this type becomes when
 * `incoming` more recurring damage of that type lands on it.
 *
 * `existing` is that type's current total — a number, or `{value,
 * damageType}` (the shape callers held before 3.685.0). One of another type
 * is NOT this type's total: it stands beside it, untouched, and this type
 * starts from 0.
 *
 * @param {number|{value: number, damageType: string}|null} existing
 * @param {number} incoming
 * @param {string} damageType
 * @returns {{value: number, damageType: string, before: number, added: number, stacked: boolean, replaced: false}}
 *   `replaced` is always false now; kept so a caller reading it says nothing.
 */
export function recurringAfterHit(existing, incoming, damageType) {
  const type = recurringType(damageType);
  let before = 0;
  if (typeof existing === "number") before = existing;
  else if (existing && typeof existing === "object") {
    before = recurringType(existing.damageType) === type ? Number(existing.value) || 0 : 0;
  }
  before = Math.max(0, Math.floor(before));
  const added = Math.max(0, Math.floor(Number(incoming) || 0));
  const value = combinedConditionValue("recurring", before, added);
  return { value, damageType: type, before, added, stacked: before > 0 && added > 0, replaced: false };
}

/** The card's words for what landed: "Recurring 5 acid (2 + 3)". */
export function recurringStackLine(next) {
  if (!next) return "";
  return `Recurring ${next.value} ${next.damageType}${next.stacked ? ` (${next.before} + ${next.added}, stacked)` : ""}`;
}

/**
 * HOW MUCH EASIER ONE TYPE'S FLAT CHECK IS (3.685.0). Page 193's GM lever
 * ("the GM may deem that your action to stop your recurring damage works
 * automatically or lowers the DC of the Flat-Check") is written on the
 * Recurring effect it was set on, so it eases that type's check only; a
 * lever on anything else (a feat, an item) eases every type's.
 *
 * @param {Iterable<object>} effects the creature's applied effects
 * @param {{effects: object[]}} group one entry of `recurringByType`
 * @returns {number}
 */
export function recurringFlatCheckEase(effects = [], group = null, systemId = "trg-prime") {
  const isRecurring = (e) => e?.statuses?.has?.("recurring") || e?.flags?.[systemId]?.condition === "recurring";
  const lever = (e) => Math.max(0, Number(e?.flags?.[systemId]?.recurringFlatCheckReduction ?? 0) || 0);
  const general = Array.from(effects ?? []).filter((e) => e && !e.disabled && !isRecurring(e)).reduce((n, e) => n + lever(e), 0);
  const own = (group?.effects ?? []).filter((e) => e && !e.disabled).reduce((n, e) => n + lever(e), 0);
  return general + own;
}

/**
 * A recurring type's label (3.685.0, review): the system's own, or the type's
 * name capitalised ("Coldfire") — never another type's ("Fire").
 */
export function recurringTypeLabel(type, damageTypes = {}) {
  const t = recurringType(type);
  return damageTypes?.[t]?.label ?? `${t.charAt(0).toUpperCase()}${t.slice(1)}`;
}
