/**
 * RUNES INFUSED FOR ONE WIELDER (3.682.0; Eldritch Arts Block 4).
 *
 * The Spellblade's Infuse Weapon: "During daily preparation, you may infuse
 * one melee weapon with supernatural energy. It becomes magical for the
 * purpose of overcoming resistances. At 2nd level, you may infuse magical
 * weapon runes onto your weapon. The total level of runes may not exceed your
 * Spellblade level … Runes infused this way function only while wielded by
 * you and cannot be transferred."
 *
 * Held on the WIELDER, not the weapon: `flags.trg-prime.infusedRunes =
 * { weaponId, runes, magical }` on the actor. A weapon is prepared with them
 * only while that actor owns it, so they cannot be transferred: a weapon
 * handed on is a copy on another sheet, and the copy carries none. They are
 * never written into the weapon's own `system.runes`; the prepared item
 * carries them as `system.infusedRunes` and the union as `system.effectiveRunes`,
 * which every rune READER takes through `runeFieldOf`. A writer (the sheet,
 * Blade Ally, a transfer) still reads and writes `system.runes`, so nothing
 * infused is ever baked in.
 *
 * Graham's Q45 (3 November 2026): infused runes do not count against the
 * weapon's rune allowance and need no potency rune first; where a rune is both
 * on the weapon and infused, the higher tier applies (as `parseRunes` reads
 * any repeated rune). Q44: the infused weapon's damage is magical for
 * overcoming resistances.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
export const INFUSED_RUNES_FLAG = "infusedRunes";

/** The infusion this actor holds for this weapon, or null. */
export function infusionFor(actor, item) {
  const flag = actor?.flags?.[SYSTEM_ID]?.[INFUSED_RUNES_FLAG];
  if (!flag || typeof flag !== "object") return null;
  const id = item?.id ?? item?._id ?? null;
  if (!id || String(flag.weaponId ?? "") !== String(id)) return null;
  return {
    runes: String(flag.runes ?? "").trim(),
    magical: flag.magical !== false
  };
}

/** The weapon's own runes and its infused ones, as one field. */
export function mergedRuneField(own, infused) {
  return [String(own ?? "").trim(), String(infused ?? "").trim()].filter(Boolean).join(", ");
}

/**
 * The rune field a READER takes: the prepared union when the item carries an
 * infusion, else the item's own.
 */
export function runeFieldOf(item) {
  const effective = item?.system?.effectiveRunes;
  return typeof effective === "string" ? effective : String(item?.system?.runes ?? "");
}
