/**
 * THREE WEAPON TRAITS FROM INNER TEMPEST'S CHAPTER 6 (3.668.1). Pure: the
 * attack workflow and Double Slice ask, and act on the answer.
 *
 * The book's text:
 *   - "Backswing: Your missed attacks carry momentum when using this weapon.
 *     Your multiple attack penalty is only considered after a successful
 *     attack (one that inflicts damage)."
 *   - "Brace: If you use a Ready action to attack a mounted target with this
 *     weapon, your attack gains a +2-circumstance bonus and inflicts an
 *     additional die of base damage on a successful hit."
 *   - "Twin: These weapons are used as a pair. If both weapons successfully
 *     hit and inflict damage whilst using the Double Slice action, their base
 *     damage increases by 1."
 *
 * The weapons that carry them (the Nunchaku; the Nodachi; the Tonfa and the
 * Butterfly Sword) are Inner Tempest's. No core weapon carries any of the
 * three, so nothing here changes a game without that module.
 */

/** Does the weapon's trait line name this trait (a whole word)? */
export function hasWeaponTrait(weaponSystem, trait) {
  const name = String(trait ?? "").trim();
  if (!name) return false;
  return new RegExp(`(^|[\\s,])${name}(?=$|[\\s,(])`, "i").test(String(weaponSystem?.traits ?? ""));
}

/** Brace's circumstance bonus to the attack. */
const BRACE_ATTACK_BONUS = 2;
/** Brace's additional die of base damage. */
const BRACE_EXTRA_DICE = 1;

/**
 * Brace: a readied Strike with a Brace weapon at a mounted target. Null
 * when any of the three is missing.
 *
 * @returns {{attackBonus: number, extraDice: number}|null}
 */
export function braceApplies({ weaponSystem = null, readied = false, targetMounted = false } = {}) {
  if (!readied || !targetMounted || !hasWeaponTrait(weaponSystem, "brace")) return null;
  return { attackBonus: BRACE_ATTACK_BONUS, extraDice: BRACE_EXTRA_DICE };
}

/**
 * Backswing: the attack counts towards the multiple attack penalty only if
 * it inflicted damage. True when the count this Strike added should be taken
 * back.
 *
 * Nothing to take back when the Strike added nothing to the count: a
 * reaction, a Strike off your turn, or one whose action keeps the count
 * itself (`mapFrozen`; Double Slice asks `backswingCounts` per swing). Nor
 * with no target to judge by, or for a blow held to land later (Black
 * Lotus): its damage is still to come.
 */
export function backswingRefund({
  weaponSystem = null, isReaction = false, offTurn = false, mapFrozen = false,
  resolved = false, hits = false, held = false, damageTaken = 0
} = {}) {
  if (!hasWeaponTrait(weaponSystem, "backswing")) return false;
  if (isReaction || offTurn || mapFrozen || !resolved || held) return false;
  return !(hits && Number(damageTaken) > 0);
}

/**
 * Double Slice counts as two attacks. With a Backswing weapon, a swing that
 * inflicted no damage is not counted.
 *
 * @param {Array<{weaponSystem: object, hits: boolean, damageTaken: number}>} swings
 * @param {number} attacks the action's own count (2)
 * @returns {number}
 */
export function backswingCounts(swings = [], attacks = 2) {
  const uncounted = (Array.isArray(swings) ? swings : []).filter((s) =>
    hasWeaponTrait(s?.weaponSystem, "backswing") && !(s?.hits && Number(s?.damageTaken) > 0)).length;
  return Math.max(0, Number(attacks) - uncounted);
}

/** Twin's increase to each weapon's base damage. */
const TWIN_BASE_DAMAGE = 1;

/**
 * Twin: both weapons Twin, both swings hit and inflicted damage. The two
 * swings must be two weapons (a double weapon's two ends are one weapon).
 *
 * @returns {number} the increase to each weapon's damage, or 0
 */
export function twinBonus({ first = null, second = null, sameWeapon = false } = {}) {
  if (sameWeapon || !first || !second) return 0;
  const twin = (s) => hasWeaponTrait(s.weaponSystem, "twin") && s.hits && Number(s.damageTaken) > 0;
  return twin(first) && twin(second) ? TWIN_BASE_DAMAGE : 0;
}
