/**
 * UNARMED AND NATURAL ATTACKS — ONE ANSWER EACH (3.576.0).
 *
 * Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUR PLACES ASKED "IS THIS UNARMED", AND THEY DISAGREED.
 *
 * The pages 161-170 audit found Savage Strikes, Vibrant Thorns, the
 * strike riders' `unarmed` scope and the spell-rune picker each deciding
 * for itself — two read the category or the trait, one the category
 * only, and Thorns read the weapon AS SWUNG while the others read the
 * item. Chapter 6 then names two manufactured weapons that ARE unarmed
 * attacks:
 *
 *   GAUNTLET        "A strike with a gauntlet is otherwise considered an
 *                    unarmed attack."
 *   BRASS KNUCKLES  "deal lethal damage with an unarmed strike"
 *
 * and both are category Simple in the table, so none of the four counted
 * them. Graham, 19 September 2026 (R6): the Gauntlet and Brass Knuckles
 * as printed, the Spiked Gauntlet and Cestus with them, and one shared
 * rule. Metal Bracers are "treated as gauntlets", so an Unarmed Strike in
 * them stays unarmed (GAUNTLET_PROFILE carries the declaration).
 *
 * WHERE THE FACT LIVES. On the item, as `system.unarmed`, set in the pack
 * for the four weapons by tools/data-fixes.json — not recognised by name,
 * so a renamed gauntlet keeps it and a homebrew one can be given it on
 * the item sheet. The category and the trait keyword are still read,
 * because every natural attack in the pack and every one a feat creates
 * already carries one or the other.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NATURAL IS THE NARROWER QUESTION. Page 166: "natural attacks are not
 * weapons and abilities and effects that work with weapons do not work
 * with natural attacks." A gauntlet is unarmed AND a weapon; a bite, a
 * claw and the Unarmed Strike are unarmed and NOT weapons. The weapon
 * spells ask this one.
 */

const lower = (value) => String(value ?? "").trim().toLowerCase();

/**
 * A natural attack — part of the creature, not something it holds.
 *
 * `system.natural` is what every natural attack in the system carries;
 * the Unarmed category is the Chapter 6 table's own name for the same
 * row, and both are accepted because the pack stamps both.
 *
 * @param {object} weaponSystem a weapon's system data (or the profile it
 *   was swung as)
 * @returns {boolean}
 */
export function isNaturalAttack(weaponSystem) {
  if (!weaponSystem) return false;
  if (weaponSystem.natural) return true;
  return lower(weaponSystem.category) === "unarmed";
}

/**
 * An unarmed attack: every natural attack, and every weapon declared to
 * be one (the Gauntlet family, Brass Knuckles, Cestus).
 *
 * @param {object} weaponSystem
 * @returns {boolean}
 */
export function isUnarmedAttack(weaponSystem) {
  if (!weaponSystem) return false;
  if (isNaturalAttack(weaponSystem)) return true;
  if (weaponSystem.unarmed === true) return true;
  // THE ITEM SHEET OFFERS "Unarmed" AS AN ATTACK MODE, so a weapon set to
  // it by hand is one.
  if (lower(weaponSystem.attackMode) === "unarmed") return true;
  return /\bunarmed\b/i.test(String(weaponSystem.traits ?? ""));
}

/**
 * WHICH FUMBLE TABLE (Chapter 7): "a d100 roll on the associated attack
 * fumble table: melee, missile, thrown or unarmed."
 *
 * FOUND IN PASSING at 3.576.0. The table was chosen by `attackMode`
 * alone, and no weapon in any pack has the attack mode "unarmed" (only a
 * hand-edited one could) — so for every natural attack and gauntlet in
 * the game the Unarmed Fumble Table, extracted in full into
 * data/fumble-tables.mjs, was never rolled on. A thrown dagger used the melee table for the same
 * reason: its mode is melee and the throw was decided by distance.
 *
 * THE THROW DECIDES FIRST. A giant hurling its natural Rock is making a
 * thrown attack, and a fist is never fired from a bow.
 *
 * @param {object} weaponSystem
 * @param {{thrown?: boolean}} [options] whether THIS attack was a throw
 * @returns {"melee"|"missile"|"thrown"|"unarmed"}
 */
export function fumbleTableFor(weaponSystem, options = {}) {
  const mode = lower(weaponSystem?.attackMode);
  if (options?.thrown === true || mode === "thrown") return "thrown";
  if (mode === "missile") return "missile";
  if (isUnarmedAttack(weaponSystem)) return "unarmed";
  return "melee";
}
