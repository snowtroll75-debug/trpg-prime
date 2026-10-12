/**
 * Double Slice (Core 3.1, Chapter 4 — Basic Actions). Pure logic; the
 * Foundry side is double-slice-workflow.mjs.
 *
 * "Requirements: You are wielding a melee weapon in both hands.
 *
 *  Using your current multiple attack penalty, make two Strikes, one
 *  with each of your melee weapons. Both Strikes must be made against
 *  the same target. If the second Strike is made with a weapon that
 *  doesn't have the agile trait, it takes a –2 circumstance penalty.
 *
 *  If both attacks hit, combine their damage, choosing the most
 *  beneficial against your current target. You can only inflict one
 *  critical and if either attack fumbles, then the other attack
 *  automatically misses.
 *
 *  This counts as two attacks when calculating your multiple attack
 *  penalty."
 *
 * FOUR RULES THAT ACT ON THE PAIR rather than on either swing, which is
 * why they live here and not in the attack workflow: the MAP is frozen
 * across both, only one critical survives, a fumble anywhere spoils
 * everything, and the counter moves by two at the end.
 *
 * THE ONE RETROACTIVE CASE IS AFFORDABLE. Three of the four resolve
 * forwards — the second swing knows what the first did — but "if either
 * attack fumbles, the other automatically misses" can strike backwards,
 * when the SECOND swing fumbles after the first has already hit. That
 * would be a problem if damage were rolled inline. It is not: damage in
 * this system is a button on the card, pressed afterwards, so a first
 * swing corrected to a miss has cost nothing yet. The pair's own card
 * says so plainly and is the one the player acts on.
 */

import { itemRequiredHands } from "../held-items.mjs";

/** "it takes a –2 circumstance penalty" */
export const OFF_HAND_PENALTY = -2;

/** "This counts as two attacks when calculating your multiple attack penalty." */
export const DOUBLE_SLICE_ATTACKS = 2;

/** Does this weapon carry the agile trait? */
export function isAgile(weapon) {
  return /\bagile\b/i.test(String(weapon?.system?.traits ?? ""));
}

/**
 * Does this weapon carry the Double trait (Chapter 6)? "A double weapon
 * may be used to double slice and always treats the second attack as
 * agile."
 */
export function isDoubleWeapon(weapon) {
  return /\bdouble\b/i.test(String(weapon?.system?.traits ?? ""));
}

/**
 * A DOUBLE WEAPON IS BOTH WEAPONS (3.575.0, Graham 19 Sep 2026). The
 * action's own requirement is "a melee weapon in both hands", and a double
 * weapon meets it by itself — but only held in both hands, which for the
 * staff and the anar dhagor means their Hand & a Half two-handed grip. A
 * staff held one-handed beside a shield is not being swung from both ends.
 *
 * @param {object} weapon
 * @param {string} actorSize
 * @returns {boolean}
 */
export function doubleWeaponInBothHands(weapon, actorSize = "medium") {
  return isDoubleWeapon(weapon) && itemRequiredHands(weapon, actorSize) === 2;
}

/**
 * The weapons Double Slice can be made with: melee, equipped, and held.
 *
 * NOT "any two weapons on the sheet". The requirement is that you are
 * WIELDING one in each hand, so a spare axe in the pack is not a second
 * weapon for this purpose.
 *
 * @param {Array} items
 * @returns {Array}
 */
export function doubleSliceWeapons(items = []) {
  return (items ?? []).filter(
    (item) =>
      item?.type === "weapon"
      && item?.system?.equipped
      && item?.system?.attackMode !== "missile"
  );
}

/**
 * Whether the requirement is met, and why not if it is not.
 *
 * @param {Array} items
 * @returns {{allowed: boolean, reason: string, weapons: Array}}
 */
export function doubleSliceRequirement(items = [], actorSize = "medium") {
  const weapons = doubleSliceWeapons(items);
  if (weapons.length < 2 && !weapons.some((w) => doubleWeaponInBothHands(w, actorSize))) {
    const double = weapons.find(isDoubleWeapon);
    return {
      allowed: false,
      reason: double
        ? `${double.name} is a double weapon, but it has to be held in both hands to Double Slice with it — re-equip it and choose the two-handed grip`
        : "Double Slice requires a melee weapon wielded in each hand",
      weapons
    };
  }
  return { allowed: true, reason: "", weapons };
}

/**
 * Is this pair a legal Double Slice? Two different weapons, or one double
 * weapon held in both hands striking twice.
 *
 * @returns {{ok: boolean, reason: string}}
 */
export function doubleSlicePairValid(first, second, actorSize = "medium") {
  if (!first || !second) return { ok: false, reason: "choose both strikes" };
  if (first.id !== second.id) return { ok: true, reason: "" };
  if (doubleWeaponInBothHands(first, actorSize)) return { ok: true, reason: "" };
  return {
    ok: false,
    reason: isDoubleWeapon(first)
      ? `${first.name} has to be held in both hands to strike with both ends`
      : "Double Slice strikes with a weapon in each hand — pick two different weapons, or one double weapon held in both hands"
  };
}

/**
 * The modifier row the second swing carries, or null when it is agile.
 *
 * THE SECOND END OF A DOUBLE WEAPON IS AGILE (3.575.0): "always treats the
 * second attack as agile." `sameDoubleWeapon` is true when both strikes
 * are the one double weapon.
 */
export function secondStrikeModifier(weapon, { sameDoubleWeapon = false } = {}) {
  if (isAgile(weapon)) return null;
  if (sameDoubleWeapon && isDoubleWeapon(weapon)) return null;
  return {
    label: `Double Slice (${weapon?.name ?? "second weapon"} is not agile)`,
    value: OFF_HAND_PENALTY,
    type: "circumstance"
  };
}

/**
 * What the pair actually did, given what each swing rolled.
 *
 * Each argument is the attack outcome the workflow hands back:
 * `{hits, critical, fumbleRisk, resolved}` — `critical` is an object or
 * null, and a fumble is reported by the workflow as a confirmed one.
 *
 * @param {object} first  {hits, critical, fumbled}
 * @param {object} second {hits, critical, fumbled}
 * @returns {{firstHits:boolean, secondHits:boolean, criticals:number,
 *   spoiledBy:string|null, combineDamage:boolean, notes:string[]}}
 */
export function resolveDoubleSlice(first = {}, second = {}) {
  const notes = [];
  const fumbledFirst = Boolean(first.fumbled);
  const fumbledSecond = Boolean(second.fumbled);

  // "if either attack fumbles, then the other attack automatically
  // misses" — so a fumble anywhere leaves nothing standing.
  if (fumbledFirst || fumbledSecond) {
    const which = fumbledFirst && fumbledSecond
      ? "Both swings fumbled"
      : fumbledFirst
        ? "The first swing fumbled"
        : "The second swing fumbled";
    notes.push(`${which} — the other attack automatically misses. Neither deals damage.`);
    return {
      firstHits: false,
      secondHits: false,
      criticals: 0,
      spoiledBy: fumbledFirst ? "first" : "second",
      combineDamage: false,
      notes
    };
  }

  let firstHits = Boolean(first.hits);
  let secondHits = Boolean(second.hits);
  let firstCritical = Boolean(first.critical);
  let secondCritical = Boolean(second.critical);

  // "You can only inflict one critical." The FIRST one stands, because
  // it is the one that was rolled first and nothing in the entry
  // suggests choosing between them; the second remains a hit, since it
  // still hit.
  if (firstCritical && secondCritical) {
    secondCritical = false;
    notes.push(
      "Both swings scored a critical — only one can be inflicted, so the second counts as an ordinary hit."
    );
  }

  if (firstHits && secondHits) {
    notes.push(
      "Both attacks hit — combine their damage, choosing the most beneficial type against this target."
    );
  }

  return {
    firstHits,
    secondHits,
    criticals: (firstCritical ? 1 : 0) + (secondCritical ? 1 : 0),
    spoiledBy: null,
    combineDamage: firstHits && secondHits,
    notes
  };
}
