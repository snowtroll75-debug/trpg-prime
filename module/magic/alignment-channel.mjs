/**
 * Alignment Channel (Chapter 5, Cleric).
 *
 *   "You have developed techniques to cause your positive energy to harm
 *    eternals. Any spell or ability that you have which affects creatures
 *    of the undead type in a harmful way, may also be applied to affect
 *    eternals with the evil trait."
 *
 * A WIDENING OF THE KIND GATE, not a new action. The feat does not give
 * the Cleric anything to press; it changes who an undead-keyed spell they
 * already have is allowed to reach. So it is a rule that
 * `kindGateResult` consults, and the feat itself is a wired passive.
 *
 * BOTH HALVES ARE REQUIRED. "Eternals WITH THE EVIL TRAIT" — an Eternal
 * that is not evil is not reached, and an evil creature that is not an
 * Eternal is certainly not. Written as two separate tests rather than
 * one because a single loose check here would quietly turn a narrow
 * clause about demons into "your Turn Undead now hits anything wicked".
 *
 * WHAT "IN A HARMFUL WAY" MEANS HERE. The feat's clause is about harmful
 * spells, and this system's answer to "which spells are keyed at undead"
 * is the `kindGate` field. Every undead-gated spell in the pack today is
 * one a Cleric aims at an enemy, so gate membership and harmfulness
 * coincide — but they are not the same idea, and a beneficial spell
 * keyed at undead (a Cure aimed at an allied wight) would be widened by
 * this feat when it should not. That is recorded rather than guessed at:
 * see BENEFICIAL_IS_NOT_WIDENED below, which refuses the widening for a
 * spell the system already knows to be beneficial.
 */

import { hasCreatureTrait } from "../creature-traits.mjs";

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/** The feat's own name, normalised. */
export const ALIGNMENT_CHANNEL = "alignment channel";

/** The gate this feat widens, and what it widens it to. */
export const WIDENED_GATE = "undead";
export const WIDENED_TYPE = "eternal";
export const WIDENED_TRAIT = "evil";

/** Does this actor hold the feat? */
export function hasAlignmentChannel(featNames) {
  return (Array.isArray(featNames) ? featNames : []).some((n) => normalise(n) === ALIGNMENT_CHANNEL);
}

/**
 * Is this creature one the feat reaches — an Eternal with the evil trait?
 *
 * Asked of `hasCreatureTrait` for both halves, so that the type-implies-
 * the-trait rule and a granted trait are both visible: a creature whose
 * TYPE is Eternal carries the eternal trait without anybody typing it
 * twice, which is the same reading every other kind gate uses.
 */
export function isEvilEternal(targetSystem) {
  if (!hasCreatureTrait(targetSystem, WIDENED_TYPE)) return false;
  return hasCreatureTrait(targetSystem, WIDENED_TRAIT);
}

/**
 * A beneficial spell is NOT widened.
 *
 * The feat's sentence is about harming: "cause your positive energy to
 * harm eternals… affects creatures of the undead type in a HARMFUL way."
 * Widening a beneficial undead-keyed spell would be the feat doing the
 * opposite of what it says — healing a demon because you took a feat
 * about hurting them.
 */
export const BENEFICIAL_IS_NOT_WIDENED = true;

/**
 * May this undead-keyed spell also reach this target, because of the feat?
 *
 * Every condition must hold: the feat, the gate, the target, and the
 * spell not being a beneficial one.
 *
 * @param {object} opts
 * @param {string[]} opts.featNames     the caster's feats
 * @param {string}   opts.gate          the spell's `kindGate`
 * @param {object}   opts.targetSystem  the target's `system`
 * @param {boolean}  [opts.beneficial]  the spell's own `beneficial` flag
 * @returns {boolean}
 */
export function alignmentChannelReaches({ featNames = [], gate = "", targetSystem = null, beneficial = false } = {}) {
  if (normalise(gate) !== WIDENED_GATE) return false;
  if (beneficial && BENEFICIAL_IS_NOT_WIDENED) return false;
  if (!hasAlignmentChannel(featNames)) return false;
  return isEvilEternal(targetSystem);
}

/** The line the card prints when the feat let something through. */
export function alignmentChannelNote(names) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean);
  if (!list.length) return "";
  return `Alignment Channel — ${list.join(", ")} ${list.length === 1 ? "is" : "are"} `
    + "reached as though undead (evil eternal).";
}
