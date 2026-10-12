/**
 * A WEAPON OF FORCE THAT STRIKES WHEN IT IS SUSTAINED.
 *
 * NEW at 3.608.0, for R8 of the pages 321–330 audit. Pure; no Foundry.
 *
 * SPIRITUAL WEAPON (PP 4, page 327), 120 feet, 1 minute (S)
 *   "Requirements you are holding a melee weapon.
 *    A weapon composed of force emerges from your melee weapon and attacks
 *    1 target you can see within range. The weapon always strikes from your
 *    direction and cannot flank. It has the appearance and statistics of the
 *    melee weapon you are currently wielding.
 *    The weapon attacks using your Spellcraft bonus with a +1-item bonus.
 *    Each hit inflicts force damage equal to the weapon's normal damage
 *    modified by your magical ability score.
 *    Each time you Sustain the Spell, you can move the weapon to a new
 *    target within range (if needed) and Strike with it.
 *      +4 PP: The weapon's item bonus increases by +1."
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT `conjuredWeapon`. That kind puts a weapon in the caster's HAND, and
 * the caster swings it with their own attack. This one swings itself, with
 * the caster's Spellcraft, so it is a strike the SPELL makes — at the cast,
 * and again on every Sustain — rather than an item on the sheet.
 *
 * WHAT IS COPIED FROM THE HELD WEAPON, AT THE CAST: its name and its
 * damage dice. "Its statistics" are the weapon's as it was when the force
 * copy emerged; putting the sword away later does not end the spell, which
 * the page does not say it does.
 *
 * READINGS, said on the release notes:
 *
 *   "MODIFIED BY YOUR MAGICAL ABILITY SCORE" adds the casting attribute's
 *   total, the number every other "+ your magical ability" in the book adds.
 *
 *   A STRIKE IS AN ATTACK, so it takes and advances the multiple attack
 *   penalty exactly as a spell attack does (page 191, Graham's R1 of block
 *   19: "any action which has the attack trait … spells etc.").
 *
 *   ITS CRITICAL IS A WEAPON'S: the weapon's own die again as bonus damage,
 *   and an injury on the force table.
 */

import { isNaturalAttack } from "../combat/unarmed.mjs";

/** The flag the caster's effect carries. */
export const SPIRITUAL_WEAPON_FLAG = "spiritualWeapon";

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** A `spiritualWeapon` row, or null. */
export function normaliseSpiritualWeapon(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "spiritualWeapon") return null;
  const itemBonus = int(raw.itemBonus ?? 1);
  if (itemBonus < 0) return null;
  return {
    label: text(raw.label) || "Spiritual Weapon",
    itemBonus,
    damageType: text(raw.damageType).toLowerCase() || "force"
  };
}

/**
 * Can this weapon be the source? Equipped, a weapon, melee — and HELD.
 *
 * AN UNARMED STRIKE IS NOT A HELD WEAPON (3.608.2). "Requirements you are
 * holding a melee weapon": the 3.608.1 drive gave a wizard with nothing in
 * hand a force copy of his own fist. `isNaturalAttack` is the system's one
 * answer to "is this a body rather than a weapon" (natural attacks and the
 * Unarmed category), asked here rather than restated.
 */
export function spiritualSourceWeapons(items) {
  return Array.from(items ?? []).filter((i) => i?.type === "weapon" && i.system?.equipped
    && text(i.system?.attackMode || "melee") !== "missile"
    && !isNaturalAttack(i.system));
}

/**
 * The record stored on the caster: what the force copy is.
 *
 * @param {object} spec normalised row
 * @param {object} weapon the held melee weapon
 * @param {number} warpBonus the +4 PP warp's increase
 */
export function spiritualRecord(spec, weapon, warpBonus = 0) {
  const dice = text(weapon?.system?.damage);
  if (!spec || !dice) return null;
  return {
    label: spec.label,
    weaponName: text(weapon?.name) || "weapon",
    dice,
    itemBonus: spec.itemBonus + Math.max(0, int(warpBonus)),
    damageType: spec.damageType
  };
}

/** The damage formula for one hit. */
export function spiritualDamageFormula(record, abilityTotal = 0) {
  const a = int(abilityTotal);
  if (!record?.dice) return "";
  return a ? `${record.dice} ${a > 0 ? "+" : "-"} ${Math.abs(a)}` : record.dice;
}

/** The card's headline for one strike. */
export function spiritualStrikeHeadline(record, casterName, targetName) {
  return `<strong>${record.label}</strong> — the force copy of ${casterName}'s ${record.weaponName} `
    + `strikes <strong>${targetName}</strong> (Spellcraft +${record.itemBonus} item).`;
}
