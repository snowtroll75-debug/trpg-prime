/**
 * HOW FAR AN ATTACK ACTION REACHES (3.705.0).
 *
 * Graham, 20 November 2026: Trip, Disarm, Shove, Grapple, Shield Bash, Aid
 * and Coup de Grace could be used on a creature any distance away. Nothing
 * in `resolveAction` measured it, so a Trip from thirty feet was a Trip.
 * Asked whether to add a reach check (so that Lunge can extend it), he chose
 * "Add reach check + Lunge".
 *
 * The rulebook (Chapter 11, space and reach): "A creature's reach is how far
 * it can make melee attacks". Each action's own text decides whose reach:
 *
 *   tripAttack, shoveAttack, disarmAttack  a free hand: your reach. With a
 *       weapon carrying the Trip, Shove or Disarm trait: "This uses the
 *       weapon's reach (if different from your own)" (Chapter 6 traits).
 *   grappleAttack  your hand: your reach. "You can Grapple a target you
 *       already have grabbed", so a creature you hold is never refused.
 *   shieldBash  the shield in your hand: your reach.
 *   aidOffensive, aidDefensive  "You make a melee Strike against the
 *       target": your reach, or a held melee weapon's with Reach.
 *   coupDeGrace  "an adjacent helpless opponent": adjacent, whatever the
 *       reach. Lunge does not change adjacency.
 *
 * Escape is not here: its target is whatever holds you, which may be a
 * Large creature ten feet away or no creature at all.
 *
 * DISARM USES REACH, as a reaction too (Graham, 20 November 2026: "Yes
 * disarm does use reach"): Reactive Disarm and Disarm Block are measured.
 * Guardian Defence's Aid and Offensive Parry's Shove pass `reachExempt`.
 *
 * THE REACH TRAIT'S -2. "Weapons with this trait increase the reach …
 * Such attacks are subject to a -2 penalty to AB", only at the extended
 * distance (Graham's earlier ruling, as for a Strike). A Trip made at ten
 * feet with a reach weapon takes it. A LUNGE NEVER DOES (Graham, 20
 * November 2026: "-1 only for lunge").
 *
 * Pure.
 */

import { weaponReachExtension } from "./attack.mjs";

const ADJACENT_FEET = 5;

/** The extra reach a Lunge gives an action without a reach weapon. */
const LUNGE_EXTENSION_FEET = 5;

/**
 * The actions this measures, and whose reach each uses.
 *   own       your reach only
 *   maneuver  your reach, or the weapon carrying `trait`
 *   melee     your reach, or any held melee weapon with Reach
 *   adjacent  adjacent, whatever the reach
 */
export const ACTION_REACH = Object.freeze({
  tripAttack: { kind: "maneuver", trait: "trip" },
  shoveAttack: { kind: "maneuver", trait: "shove" },
  disarmAttack: { kind: "maneuver", trait: "disarm" },
  grappleAttack: { kind: "own" },
  shieldBash: { kind: "own" },
  aidOffensive: { kind: "melee" },
  aidDefensive: { kind: "melee" },
  coupDeGrace: { kind: "adjacent" }
});

/**
 * The reach a held weapon adds to this action: the trait weapon's for a
 * maneuver, the longest held melee Reach weapon's for Aid, nothing else.
 *
 * @param {string} key the action key
 * @param {Array<object>} items the actor's items
 * @returns {number} feet
 */
export function actionWeaponExtension(key, items = []) {
  const spec = ACTION_REACH[key];
  if (!spec) return 0;
  const held = (Array.isArray(items) ? items : Array.from(items ?? []))
    .filter((i) => i?.type === "weapon" && i.system?.equipped && (i.system?.attackMode ?? "melee") === "melee");
  if (spec.kind === "maneuver") {
    const pattern = new RegExp(`\\b${spec.trait}\\b`, "i");
    return Math.max(0, ...held.filter((w) => pattern.test(String(w.system?.traits ?? ""))).map((w) => weaponReachExtension(w.system)));
  }
  if (spec.kind === "melee") return Math.max(0, ...held.map((w) => weaponReachExtension(w.system)));
  return 0;
}

/**
 * Whether this action reaches its target, and what it costs to.
 *
 * @param {object} p
 * @param {string} p.key the action key
 * @param {number|null} p.distance feet to the target; null (no tokens) is never refused
 * @param {number} [p.ownReach] the actor's reach (a mount's where it is longer)
 * @param {number} [p.weaponExtension] from `actionWeaponExtension`
 * @param {boolean} [p.lunge] made with Lunge
 * @param {boolean} [p.holdsTarget] the actor already holds the target (Grapple)
 * @returns {null|{allowed: boolean, limit: number, reachPenalty: number, extendedBy: string|null, adjacentOnly?: boolean}}
 *   null when the action is not measured or there is no distance
 */
export function actionReachVerdict({ key, distance = null, ownReach = 5, weaponExtension = 0, lunge = false, holdsTarget = false } = {}) {
  const spec = ACTION_REACH[key];
  if (!spec || distance === null || distance === undefined) return null;
  const d = Number(distance);
  if (!Number.isFinite(d)) return null;
  if (spec.kind === "adjacent") {
    return { allowed: d <= ADJACENT_FEET, limit: ADJACENT_FEET, reachPenalty: 0, extendedBy: null, adjacentOnly: true };
  }
  if (key === "grappleAttack" && holdsTarget) return { allowed: true, limit: d, reachPenalty: 0, extendedBy: null };
  // A REACH OF ZERO IS A REACH (as `reachPenalty`): a Tiny creature must share the square.
  const declared = Number(ownReach);
  const base = Number.isFinite(declared) ? Math.max(0, declared) : 5;
  const weaponExt = spec.kind === "own" ? 0 : Math.max(0, Number(weaponExtension) || 0);
  const lungeExt = lunge ? LUNGE_EXTENSION_FEET : 0;
  const limit = base + Math.max(weaponExt, lungeExt);
  const allowed = d <= limit;
  const extended = allowed && d > base;
  const extendedBy = !extended ? null : (weaponExt > 0 && weaponExt >= lungeExt ? "weapon" : "lunge");
  return { allowed, limit, reachPenalty: extended && extendedBy === "weapon" && !lunge ? -2 : 0, extendedBy };
}

/**
 * The refusal, said as a Strike's is.
 *
 * @param {string} actionName
 * @param {string} targetName
 * @param {number} distance
 * @param {{limit: number, adjacentOnly?: boolean}} verdict
 */
export function actionReachRefusal(actionName, targetName, distance, verdict) {
  return verdict?.adjacentOnly
    ? `${actionName}: ${targetName} is ${distance} ft away — it must be adjacent.`
    : `${actionName}: ${targetName} is ${distance} ft away — beyond your reach (max ${verdict?.limit ?? 0} ft).`;
}
