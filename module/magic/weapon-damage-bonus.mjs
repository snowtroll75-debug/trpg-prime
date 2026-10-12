/**
 * A FLAT BONUS TO ONE WEAPON'S OWN DAMAGE.
 *
 * NEW at 3.493.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAVITY WEAPON (PP 1, Alteration, 1 minute, 1 held weapon)
 *
 *   "You empower the kinetic energy and density of one chosen weapon in
 *    your grasp. The base damage die of the weapon gains a +2 bonus for
 *    duration of the spell."
 *      +1 PP: You can affect two weapons.
 *      +4 PP: You increase the damage by an additional +2 (max +4).
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A STRIKE RIDER, WHICH IS WHERE IT WAS LOOKED FOR.
 *
 * `strike-riders.mjs` records Gravity Weapon as out of scope, and it is
 * right: a rider is a SECOND damage packet with its own dice and its own
 * type — Flaming Weapon's `1d6 fire`. It refuses a row with no dice and
 * no damage type, deliberately, because a rider that inherited "the
 * weapon's own" by omission is a rune's meaning leaking into a spell.
 *
 * Gravity Weapon adds no packet. It makes the weapon's OWN damage bigger,
 * in the weapon's own type, so it belongs in the formula the weapon
 * already rolls — beside the Bigger They Are and Weapon Specialisation
 * bonuses, which is exactly where it now goes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A FLAT +2, NOT A DIE STEP. Graham's ruling, 4 September 2026.
 *
 * The die reading was arguable — the ladder d4→d6→d8→d10→d12 moves in
 * twos, so "the die gains +2" could mean one size up, and "max +4" two.
 * Three things settled it against:
 *
 *   - the warp says "increase the DAMAGE by an additional +2 (max +4)",
 *     which is a number with a numeric cap, not a step with a step cap;
 *   - SEVEN weapons in the pack are already d12 and have nowhere to
 *     step, so under the die reading a greatsword would gain nothing
 *     from the spell OR from its 4 PP warp;
 *   - a step is WEAKER than the flat bonus (d6+2 averages 5.5, d8
 *     averages 4.5), which is a strange thing to charge 4 PP for.
 *
 * `stepDownDieSize` in item-quality.mjs stays what it is — a material
 * rule about shoddy weapons — rather than gaining a spell-facing twin.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** The flag an effect carries this on. */
export const WEAPON_DAMAGE_BONUS_FLAG = "weaponDamageBonus";

/** The most any one casting may add, warps included. */
export const MAX_WEAPON_DAMAGE_BONUS = 4;

/**
 * A weapon-damage-bonus row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 */
export function normaliseWeaponDamageBonus(raw) {
  if (!raw || typeof raw !== "object") return null;
  // THE KIND IS CHECKED ONLY WHEN IT IS PRESENT. This normalises both
  // the authored pack row (which carries `kind`) and the record read back
  // off a live effect flag (which does not) — one shape, one validator,
  // so a row that shipped cannot be read back as something different.
  if (raw.kind !== undefined && text(raw.kind) !== "weaponDamageBonus") return null;

  const value = int(raw.value);
  // A BONUS OF ZERO IS NOT A SPELL, and a negative one is a different
  // rule than this spell prints. Refused rather than applied as nothing.
  if (value <= 0) return null;

  return {
    label: text(raw.label) || "Weapon damage",
    // CAPPED HERE, where the cap is printed, rather than trusted to the
    // warp arithmetic that produced it. "max +4" is the spell's own
    // sentence and this is the only place that has to know it.
    value: Math.min(MAX_WEAPON_DAMAGE_BONUS, value),
    // HOW MANY WEAPONS THIS CASTING ARMS. Gravity Weapon's +1 PP warp
    // buys a second; declared rather than assumed to be one, because the
    // warp exists and a spell that silently armed one of two weapons
    // would look like it worked.
    weapons: Math.max(1, int(raw.weapons) || 1),
    weaponIds: Array.isArray(raw.weaponIds) ? raw.weaponIds.filter(Boolean).map(String) : []
  };
}

/**
 * The total flat bonus a set of records gives ONE weapon.
 *
 * @param {Array<{weaponIds: string[], value: number}>} records every live
 *   weapon-damage-bonus this actor carries
 * @param {string} weaponId the weapon actually being rolled
 * @returns {number}
 */
export function weaponDamageBonusFor(records, weaponId) {
  const id = text(weaponId);
  // NO `if (!id) return 0;` GUARD. It was here, and `mutate-weapon-damage-
  // bonus` proved it dead: `normaliseWeaponDamageBonus` runs
  // `weaponIds.filter(Boolean)`, so no stored record can carry an empty
  // id, so `ids.includes("")` is already false for every record there can
  // be. The guard read like the safety rail for an unnamed weapon and was
  // in fact unreachable — and a guard nothing can reach is one no
  // mutation can prove, which is one nobody should trust.
  let total = 0;
  for (const record of Array.isArray(records) ? records : []) {
    const ids = Array.isArray(record?.weaponIds) ? record.weaponIds.map(String) : [];
    if (!ids.includes(id)) continue;
    total += Math.max(0, int(record.value));
  }
  // CAPPED ACROSS EVERY RECORD, not per record. Two castings of Gravity
  // Weapon on the same blade are still bound by the sentence that says
  // "max +4" — and stacking them to +8 is the shape this project has
  // paid for before under other names.
  return Math.min(MAX_WEAPON_DAMAGE_BONUS, total);
}

/** What the card says when it lands. */
export function weaponDamageBonusLine(spec, targetName, weaponNames) {
  const named = weaponNames.length
    ? weaponNames.map((n) => `<strong>${n}</strong>`).join(" and ")
    : "the chosen weapon";
  return `${targetName}: ${named} gains <strong>+${spec.value}</strong> to its own damage.`;
}

/**
 * What the card says when the spell bought two weapons and got one.
 *
 * SAID OUT LOUD. The +1 PP warp is the difference between one weapon and
 * two, and a caster who paid for the second and armed one blade would
 * otherwise have no way to know.
 */
export function weaponDamageShortfallLine(spec, chosen) {
  if (chosen >= spec.weapons) return null;
  return `<em>${spec.label} was paid for ${spec.weapons} weapons and ${chosen === 0 ? "none was" : `only ${chosen} was`} chosen.</em>`;
}
