/**
 * Support and Perfect Flanking — the two Companion feats that are about
 * where a master and its companion are standing.
 *
 * Support (Companion): "If both you and your companion are engaged in
 * melee with the same target, you both gain a +1 circumstance bonus when
 * attacking them."
 *
 * Perfect Flanking (Companion, prerequisites Support and 14th level):
 * "When you and your animal companion are positioned next to the same
 * opponent, your combined presence grants you a flanking bonus,
 * regardless of your actual placement on the battlefield."
 *
 * WHY THESE ARE AUTOMATIC RATHER THAN A TICKBOX. Both conditions are
 * "adjacent to the same target", and this system already answers that
 * question every melee attack: `sideFlags(...).adjacent` in
 * combat/flanking.mjs, which the ordinary Flanking bonus is built on.
 * Making a player tick a box for something the grid already knows would
 * be inventing a second, worse source of truth (lesson 13). They fall
 * back to nothing when positional automation is off or the tokens are
 * not on the canvas — exactly as ordinary Flanking does.
 *
 * WHOSE FEAT IT IS. The COMPANION's — these are Companion-trait feats
 * and a companion spends its own pick on them — but the benefit is
 * explicitly mutual ("you both gain"). So the master reads its
 * companion's feats, not its own, and neither actor needs a copy of the
 * other's. That asymmetry is the whole reason this is a shared pure
 * module rather than two branches inside the attack workflow.
 *
 * WHY PERFECT FLANKING IS PRICED AT THE FLANKING BONUS. The feat says
 * the pair "grants you a flanking bonus" — the existing one, not a new
 * kind — so it emits `FLANKING_BONUS` and is typed `circumstance` like
 * every other flank. It therefore does NOT stack with a real flank:
 * circumstance bonuses take the highest, so a companion pair that
 * happens to be genuinely opposed gets +2 once, which is what the
 * printed rule describes. Perfect Flanking buys the pair the flank
 * without the geometry, not a second flank on top of it.
 */

import { FLANKING_BONUS } from "./combat/flanking.mjs";
import { hasCompanionFeat } from "./companion-feats.mjs";
import { SUPPORT_BONUS } from "./companion-feats.mjs";

export const SUPPORT_FEAT = "Support";
export const PERFECT_FLANKING_FEAT = "Perfect Flanking";

/**
 * The attack modifier a master/companion pair earns for standing either
 * side of — or simply both next to — the same target.
 *
 * ONE MODIFIER, NOT TWO. Perfect Flanking's prerequisite IS Support, so
 * a companion that has the former almost always has the latter, and
 * emitting both would put a +1 and a +2 circumstance bonus into the pool
 * for the same fact about the battlefield. They would not add — highest
 * circumstance wins — but the tooltip would show a line that never does
 * anything, which is the kind of thing that gets "fixed" later by
 * someone who reads it as a bug. The better tier is emitted alone.
 *
 * @param {object} options
 * @param {string[]} options.companionFeatNames Every feat on the
 *   COMPANION, whichever end of the pair is attacking.
 * @param {boolean} options.bothAdjacent Are master and companion both
 *   adjacent to the target?
 * @param {string} [options.partnerName] For the modifier's label.
 * @returns {{label: string, value: number, type: string}|null}
 */
export function companionPairModifier({
  companionFeatNames = [], bothAdjacent = false, partnerName = ""
} = {}) {
  if (!bothAdjacent) return null;
  const withPartner = partnerName ? ` (with ${partnerName})` : "";
  if (hasCompanionFeat(companionFeatNames, PERFECT_FLANKING_FEAT)) {
    return {
      label: `Perfect Flanking${withPartner}`,
      value: FLANKING_BONUS,
      type: "circumstance"
    };
  }
  if (hasCompanionFeat(companionFeatNames, SUPPORT_FEAT)) {
    return {
      label: `Support${withPartner}`,
      value: SUPPORT_BONUS,
      type: "circumstance"
    };
  }
  return null;
}

/**
 * Does Perfect Flanking make the target count as FLANKED?
 *
 * Separate from the modifier above because "flanked" is a fact about the
 * target that other rules read — Sneak Attack and Opportunist's Strike
 * both ask it — and the feat says the pair's presence "grants you a
 * flanking bonus", which is the same flank those rules key off. Support
 * deliberately does NOT: its +1 is a circumstance bonus and the book
 * never calls it a flank.
 */
export function perfectFlankingFlanks({ companionFeatNames = [], bothAdjacent = false } = {}) {
  return Boolean(bothAdjacent) && hasCompanionFeat(companionFeatNames, PERFECT_FLANKING_FEAT);
}

/**
 * Preying Companion: does the companion inherit its master's Hunt Prey
 * bonus against this target?
 *
 * "Your companion gains any bonuses granted by the hunt prey class
 * ability when you use it." The bonus Hunt Prey grants is the Ranger's
 * class bonus against the designated prey, typed `class` — reproduced
 * here rather than reached for through `huntPreyBonus`, because that
 * function gates on `hasHuntPrey(actor)` and the actor holding this feat
 * is the companion, which never has the ability. The GATE is the
 * master's; the VALUE is the class bonus.
 *
 * WHOSE CLASS BONUS. The question looks live and is not: a companion's
 * level is its master's level, and `classBonusForLevel` reads level
 * alone, so the two figures are always identical. Passed in as one
 * number rather than argued about.
 *
 * @param {object} options
 * @param {string[]} options.companionFeatNames
 * @param {boolean} options.masterHasHuntPrey
 * @param {boolean} options.targetIsPrey Is this target the master's
 *   recorded prey?
 * @param {number} options.classBonus
 * @returns {{label: string, value: number, type: string}|null}
 */
export function preyingCompanionModifier({
  companionFeatNames = [], masterHasHuntPrey = false, targetIsPrey = false, classBonus = 0
} = {}) {
  if (!hasCompanionFeat(companionFeatNames, "Preying Companion")) return null;
  if (!masterHasHuntPrey || !targetIsPrey) return null;
  const value = Math.max(0, Math.floor(Number(classBonus) || 0));
  if (!value) return null;
  return { label: "Preying Companion (Hunt Prey)", value, type: "class" };
}
