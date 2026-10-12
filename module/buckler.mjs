/**
 * The buckler (Chapter 6).
 *
 * "A buckler is a small metal shield that is strapped to your forearm...
 * While carrying a buckler, you can use a bow or crossbow without any
 * penalties. Additionally, you have the option to wield a weapon with
 * your shield arm, whether it's an off-hand weapon or assisting in
 * wielding a two-handed weapon."
 *
 * WHICH MEANS IT COSTS NO HAND. Graham, 3.249.0: "buckler is not being
 * equipped properly." It was consuming a hand like every other shield,
 * so a buckler and a longbow put a character over capacity and the bow
 * could not be used — the exact combination the rule exists to allow.
 *
 * WHAT IT COSTS INSTEAD is three things, and they are conditions rather
 * than a hand:
 *
 *   -1 to attack when a weapon is used with the shield arm, stacking
 *      with off-hand and two-weapon penalties
 *   no DB from the buckler until your next turn, if you use a weapon in
 *      that off hand or cast a somatic spell with that arm
 *   no Raise Shield in that case either, and never a Shield Bash
 *
 * THE PENALTY IS -1 ON GRAHAM'S RULING (2026-08-11). The chapter and the
 * shipped description both print -5; he ruled -1, and the printed figure
 * is recorded on the item rather than erased — the two staves' treatment.
 */

const SYSTEM_ID = "trg-prime";

/** The printed figure, and the one in play. */
export const BUCKLER_PRINTED_PENALTY = -5;
export const BUCKLER_ATTACK_PENALTY = -1;

/**
 * Is this item a buckler?
 *
 * READ OFF system.category, WHICH IS WHERE A SHIELD'S SIZE ALREADY
 * LIVED. I first shipped this against a new field of my own — a second
 * copy of a fact the pack had carried correctly on all twelve
 * shields since 3.215, declared in template.json and already driving
 * shield proficiency. Two fields that must agree is one field too many:
 * edit the category on a custom shield and the buckler rule would have
 * silently stopped applying to it (lesson 13).
 */
export function isBuckler(item) {
  if (item?.type !== "shield") return false;
  return String(item?.system?.category ?? "").trim().toLowerCase() === "buckler";
}

/** Every equipped buckler. */
function equippedBucklers(items = []) {
  return (items ?? []).filter((item) => isBuckler(item) && item?.system?.equipped);
}

/**
 * Is the shield arm currently doing something else?
 *
 * Recorded on the item rather than guessed, because the chapter's
 * trigger is a CHOICE — "if you choose to use a weapon in your off hand
 * while wielding a buckler" — and nothing on a sheet can tell which arm
 * a player meant to swing with.
 */
export function shieldArmInUse(item) {
  return Boolean(item?.flags?.[SYSTEM_ID]?.buckler?.armInUse);
}

/**
 * What an equipped buckler is doing to this character right now.
 *
 * @param {Array} items
 * @returns {{buckler, attackPenalty, defenceBonusLost, canRaise,
 *   canShieldBash, notes: string[]}|null}
 */
export function bucklerState(items = []) {
  const buckler = equippedBucklers(items)[0] ?? null;
  if (!buckler) return null;
  const inUse = shieldArmInUse(buckler);
  return {
    buckler,
    // The penalty applies only while the arm is actually being used for
    // something — carrying a buckler and a bow costs nothing at all,
    // which is the first thing the rule says.
    attackPenalty: inUse ? BUCKLER_ATTACK_PENALTY : 0,
    defenceBonusLost: inUse,
    canRaise: !inUse,
    canShieldBash: false,
    notes: inUse
      ? [
        `${buckler.name}: ${BUCKLER_ATTACK_PENALTY} to attack while the shield arm is in use, stacking with any off-hand or two-weapon penalty.`,
        `${buckler.name}: its DB is lost until the beginning of your next turn, and it cannot be raised.`
      ]
      : [`${buckler.name}: a bow or crossbow may be used with no penalty at all.`]
  };
}

