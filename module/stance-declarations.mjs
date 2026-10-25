/**
 * STANCES A MODULE CAN SEE AND USE (3.664.0). Pure; no Foundry.
 *
 * Inner Tempest is built on stances — nine Disciple and Mystic stances,
 * twelve Kensai Combat Forms, Spirit Stance — and on rules that ask
 * whether a character is IN one:
 *
 *   MARTIAL AFFINITY (Tianzhi)  "+1 racial bonus to AB and DB when in any
 *     combat stance" (Graham, 20 Oct 2026, m7: any stance).
 *   TRANQUIL MIND (feat)        "Whilst in any stance, you gain advantage
 *     to all saving throws made against effects and spells with the
 *     emotion or fear traits."
 *
 * A STANCE IS AN EFFECT WITH THE `featStance` FLAG — what `enterFeatStance`
 * (feats-workflow.mjs) puts on the actor for every Stance-trait feat, and
 * what `helpers.enterStance` now puts there for a module's. Fight
 * Defensively and Full Defence are not stances: their actions carry no
 * Stance trait (data/basic-actions.mjs), and their effects carry a
 * different flag.
 *
 * A STANCE-GATED DECLARATION is the ordinary declaration under a second
 * name, read only while a stance is up:
 *
 *   flags["trg-prime"].stanceConditionals = [ …conditionals… ]
 *   flags["trg-prime"].stanceDefenceDC    = [ …defenceDC rows… ]
 *
 * `collectConditionals` and `collectDefenceDC` harvest them beside the
 * ungated ones. A gated defence row needs no other scope: the stance is
 * its scope, and "+1 to DB while in a stance" is a whole rule.
 */

const SYSTEM_ID = "trg-prime";

/** The flag every stance effect carries. */
const STANCE_EFFECT_FLAG = "featStance";

/**
 * Is this effect a stance that is up?
 * @param {object} effect
 * @returns {boolean}
 */
function isActiveStanceEffect(effect) {
  if (!effect || effect.disabled) return false;
  return Boolean(effect.flags?.[SYSTEM_ID]?.[STANCE_EFFECT_FLAG]);
}

/**
 * The stance effects among these, in order.
 * @param {Array} effects an actor's applied effects
 * @returns {Array}
 */
export function activeStanceEffects(effects = []) {
  return Array.from(effects ?? []).filter(isActiveStanceEffect);
}

/**
 * Is any stance up among these effects?
 * @param {Array} effects
 * @returns {boolean}
 */
export function inAnyStance(effects = []) {
  return Array.from(effects ?? []).some(isActiveStanceEffect);
}

/**
 * The stance-gated rows a document declares under `key`, or [].
 * @param {object} document an item or effect
 * @param {"stanceConditionals"|"stanceDefenceDC"} key
 * @returns {Array}
 */
export function stanceGatedRows(document, key) {
  const raw = document?.flags?.[SYSTEM_ID]?.[key];
  return Array.isArray(raw) ? raw : [];
}
