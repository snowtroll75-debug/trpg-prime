/**
 * The Load reload mechanic (Chapter 6) and the two traits that
 * modify it — Quick Load and Spin. Kept as its own module rather
 * than folded into attack.mjs: this tracks state that persists
 * across turns (a weapon's loaded/reloading progress), not a
 * per-attack modifier computed fresh each time.
 *
 * Pure logic; the Foundry workflow (module/combat/reload-workflow.mjs)
 * layers on top, same separation as attack.mjs itself.
 */

/**
 * Load's own AP-cost value, extracted from the weapon's traits text
 * ("Load 3", "Load 5").
 *
 * @param {string} traits
 * @returns {number} 0 if the weapon doesn't have Load at all.
 */
export function extractLoadValue(traits) {
  const match = String(traits ?? "").match(/\bload\s+(\d+)\b/i);
  return match ? Math.trunc(Number(match[1])) : 0;
}

/**
 * Reloading a magazine weapon's whole magazine takes a full round — 3 AP,
 * carried over rounds like Load if the actor can't spend it all at once.
 */
export const MAGAZINE_RELOAD_AP = 3;

/** Whether a weapon carries the Quick Load trait. */
export function hasQuickLoadTrait(traits) {
  return /\bquick\s+load\b/i.test(String(traits ?? ""));
}

/**
 * Does this weapon have to be reloaded between shots at all?
 *
 * NOT THE SAME QUESTION AS "what does reloading cost", and conflating the
 * two is the defect. Graham, 14 Aug 2026: "You can fire a missile weapon
 * without reloading it."
 *
 * Both the fire gate and the spend-the-round step asked
 * `extractLoadValue(traits) > 0` — the weapon's Load AP cost. A Short Bow
 * ships as "Deadly, 2-Handed, **Quick Load**, Range 60" and a Composite
 * Shortbow as "AR 1, Deadly, Propulsive, **Quick Load**, Range 60": no
 * "Load N" trait at all, because Quick Load REPLACES the cost rather than
 * modifying it (see `reloadApCost`, which ignores `loadValue` entirely
 * when Quick Load is present). So `extractLoadValue` returned 0, both
 * gates decided the weapon needed no reloading, `system.loaded` never went
 * false, and a short bow fired for ever.
 *
 * Quick Load means the first reload each round is FREE — "after your first
 * load, it costs one action to reload the weapon" — which is a statement
 * that there IS a reload. This is that statement.
 *
 * @param {string} traits
 * @returns {boolean}
 */
export function needsReloading(traits) {
  return extractLoadValue(traits) > 0 || hasQuickLoadTrait(traits);
}

/**
 * A repeating weapon's magazine capacity, from a "Magazine N" trait (the
 * Repeater: "a typical repeater magazine holds five bolts"). It auto-loads a
 * bolt each shot (so no per-shot Load cost), firing until the magazine is empty,
 * then the whole magazine is reloaded as a full-round action.
 *
 * @param {string} traits
 * @returns {number} 0 if the weapon has no magazine.
 */
export function extractMagazine(traits) {
  const match = String(traits ?? "").match(/\bmagazine\s+(\d+)\b/i);
  return match ? Math.trunc(Number(match[1])) : 0;
}

/**
 * Load (Chapter 6): "indicates how many AP (Interact) it takes to
 * reload the weapon. This may be carried over rounds if necessary."
 * Quick Load (Chapter 6): "reload this weapon as a free action once
 * per round. After your first load, it costs one action to reload
 * the weapon" — read as: the first reload each round is free, any
 * further reload that same round costs a flat 1 AP, entirely
 * replacing the weapon's own Load value rather than reducing it.
 *
 * @param {number} loadValue The weapon's own Load AP cost.
 * @param {boolean} hasQuickLoad
 * @param {boolean} usedQuickLoadThisRound Whether the free reload
 *   has already been used this round.
 * @returns {{apCost: number, isFree: boolean}}
 */
export function reloadApCost(loadValue, hasQuickLoad, usedQuickLoadThisRound) {
  if (hasQuickLoad) {
    return usedQuickLoadThisRound ? { apCost: 1, isFree: false } : { apCost: 0, isFree: true };
  }
  return { apCost: Math.max(0, Math.floor(Number(loadValue) || 0)), isFree: false };
}

/**
 * Applies AP just spent toward a reload-in-progress. Handles the
 * "may be carried over rounds" case directly: if the AP spent
 * doesn't reach the full Load cost, the progress carries forward
 * rather than being lost.
 *
 * @param {number} currentProgress AP already spent toward this reload.
 * @param {number} apSpent AP spent just now.
 * @param {number} loadValue Full AP cost required to complete.
 * @returns {{progress: number, complete: boolean}}
 */
export function applyReloadProgress(currentProgress, apSpent, loadValue) {
  const total = Math.max(0, Number(currentProgress) || 0) + Math.max(0, Number(apSpent) || 0);
  const required = Math.max(0, Math.floor(Number(loadValue) || 0));
  if (total >= required) return { progress: 0, complete: true };
  return { progress: total, complete: false };
}

/**
 * Spin (Chapter 6): "If you fire this weapon as your next action
 * after loading it, you inflict the weapon's base damage. You can
 * use a special spin action to increase base damage. If you Spin for
 * 1 AP increase the base damage by 1, 2 AP increases the base damage
 * by 2." Read as a direct 1:1 AP-to-damage ratio (the two given
 * examples are consistent with that reading, and no other formula is
 * given).
 *
 * @param {boolean} hasSpin
 * @param {number} apSpentSpinning
 * @returns {number}
 */
export function spinDamageBonus(hasSpin, apSpentSpinning) {
  if (!hasSpin) return 0;
  return Math.min(SPIN_MAX_BONUS, Math.max(0, Math.floor(Number(apSpentSpinning) || 0)));
}

/**
 * THE PRINTED LADDER STOPS AT 2 (3.575.0): "If you Spin for 1 AP increase
 * the base damage by 1, 2 AP increases the base damage by 2." It was read
 * as open-ended, and repeated spins added together, so a slinger with 6 AP
 * could put +6 on one stone. The cap is on what one shot can carry,
 * however many Spin actions built it.
 */
export const SPIN_MAX_BONUS = 2;

/**
 * How much more spinning this weapon can still take before its next shot.
 *
 * @param {number} currentBonus The bonus already built up.
 * @returns {number}
 */
export function spinHeadroom(currentBonus) {
  return Math.max(0, SPIN_MAX_BONUS - Math.max(0, Math.floor(Number(currentBonus) || 0)));
}

/** Whether a weapon carries the Spin trait. */
export function hasSpinTrait(traits) {
  return /\bspin\b/i.test(String(traits ?? ""));
}

/** Which reload control, if any, a weapon's traits earn it. */
export const RELOAD_CONTROL = Object.freeze({
  none: "none",
  load: "load",
  magazine: "magazine"
});

/**
 * THE ONE ANSWER TO "does this weapon get a reload button, and which?"
 *
 * THE DEFECT THIS EXISTS TO KILL. `reloadWeapon` asked `needsReloading`,
 * which honours Quick Load; the actor sheet asked its own narrower
 * `/\bload\s+[1-9]\d*\b/`, which does not. Short Bow and Composite
 * Shortbow ship as "Quick Load" with no printed Load value — so the
 * button never rendered for either, and the whole Quick Load branch in
 * the workflow stayed unreachable through the interface. Its own comment
 * had said as much since 3.311.5: the fix went into the logic and never
 * reached the button.
 *
 * Two places deciding one question, one of them updated. So there is now
 * one place, and the sheet and the workflow both derive from it.
 *
 * MAGAZINE FIRST, because that is `reloadWeapon`'s own order — it returns
 * `reloadMagazine` before it ever asks about Load. The sheet used to test
 * Load first, so a weapon carrying both would have shown one button and
 * run the other. Nothing in the pack carries both today; the orders agree
 * now regardless, which is cheaper than remembering.
 *
 * @param {string} traits
 * @returns {"none"|"load"|"magazine"}
 */
export function reloadControlFor(traits) {
  if (extractMagazine(traits) > 0) return RELOAD_CONTROL.magazine;
  return needsReloading(traits) ? RELOAD_CONTROL.load : RELOAD_CONTROL.none;
}
