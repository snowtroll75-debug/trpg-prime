/**
 * NATURAL DEFENCE (Chapter 10, PP 0) — the rules. Pure; no Foundry.
 *
 *   Cast     R (somatic)
 *   Trigger  you make saving throw
 *   Duration 1 minute
 *   "You draw upon the spirits of long dead animals and fey which grant
 *    you a +1 resistance bonus to the triggering saving throw."
 *   CL 10: The bonus increases to +2
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHERE THE BUTTON LIVES IS THE WHOLE DESIGN, and this is the second
 * spell in the system to answer that question — Cutting Words was the
 * first, and this follows it deliberately.
 *
 * The trigger is a roll, and the effect modifies that same roll, so the
 * only place both are true at once is the triggering check's OWN card.
 * Putting the offer there means the bonus is applied to the roll it
 * belongs to, by the machinery that already recomputes a card in place,
 * and everyone at the table watches the number move.
 *
 * GRAHAM'S RULING, 25 August 2026: offered AFTER the roll, on the card.
 * The alternative was the pre-roll seam that Evasion, Juggernaut and
 * Resolve use — and the wording is what decided it. Those three all say
 * "you attempt a [save], BEFORE YOU ROLL"; Natural Defence says only
 * "you make saving throw". The clause the others carry to force a blind
 * spend is exactly the clause this spell omits.
 *
 * IT ALSO BUYS A REAL CAST. The card path resolves through `castSpell`,
 * so the reaction is spent, the somatic component is gated, and the
 * spell's own machinery runs — where the pre-roll seam would have had to
 * either nest a dialog inside the save's own or skip the cast entirely.
 * A shortcut that applied the bonus by hand would be a second casting
 * path, which is the mistake `castInnateSpell` already taught this
 * project once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A SAVE-REACTION (magic/save-reactions.mjs)
 *
 * That family — Gnome Resistance, Evasion, Juggernaut, Resolve — is the
 * obvious home and is the wrong one, for two reasons that both matter:
 *
 *   IT GRANTS ADVANTAGE, NOT A NUMBER. Every member buys Advantage on
 *   the save; Natural Defence buys "+1 resistance bonus". Bending the
 *   family to carry a numeric grant would change a mechanism six shipped
 *   features depend on, to serve one spell that does not fit it.
 *
 *   IT IS NOT A CAST. Those are abilities declared by a flag and spent
 *   in place. This is a SPELL, with a PP cost of zero, a somatic
 *   component and a tradition — all of which `castSpell` already knows
 *   how to handle and none of which that seam does.
 */

/** The spell's name, lower-cased — the one lookup key. */
export const NATURAL_DEFENCE_NAME = "natural defence";

/** Reactions cost 1; the spell itself costs no Power Points. */
export const NATURAL_DEFENCE_PP = 0;

/**
 * The bonus, given a caster level and the threshold at which it steps.
 *
 * NAMED `...SaveBonus`, NOT `naturalDefenceBonus`, AND THE RATCHET IS WHY.
 * There are TWO Natural Defences in this book: this cantrip, which grants
 * a resistance bonus to a saving throw, and a COMPANION FEAT ladder that
 * grants a Dodge bonus to DB — `naturalDefenceBonus` in
 * module/companion-feats.mjs, shipped long before this. I wrote the same
 * name for the spell and `verify-rules-have-callers` reported the
 * companion feat as having "acquired a caller", because it matches names
 * across files and mine had appeared elsewhere.
 *
 * That false positive was worth more than a true one: two exported
 * functions with one name, meaning a Dodge bonus to DB in one file and a
 * resistance bonus to a save in the other, is the `detects` collision of
 * three hours ago with higher stakes. The book's own duplication is not a
 * reason to reproduce it in code.
 *
 * THE THRESHOLD IS PASSED IN, NOT WRITTEN HERE. The spell's own
 * `casterLevelMods` carries `{threshold: 10, text: "The bonus increases
 * to +2"}`, so the number lives in the compendium where the rest of the
 * spell does. Copying it into this file would be a second place to edit
 * on the day it changes, and the harness would have no way to notice
 * they had drifted.
 *
 * THE TEXT IS PROSE AND STAYS PROSE. `casterLevelMods` records the step
 * as a sentence — there is no numeric field for "the bonus becomes 2" —
 * so the 2 below is this function's, and `verify-natural-defence` reads
 * the pack's sentence back to check they still agree.
 *
 * @param {number} casterLevel
 * @param {number} threshold the level at which the bonus steps up
 * @returns {1|2}
 */
export function naturalDefenceSaveBonus(casterLevel, threshold) {
  const level = Math.floor(Number(casterLevel) || 0);
  const step = Math.floor(Number(threshold) || 0);
  // A THRESHOLD OF ZERO WOULD HAND EVERYONE THE UPGRADE. It can only
  // arrive that way from a spell whose casterLevelMods went missing, and
  // silently doubling the spell for every caster is the wrong way to
  // fail — so an absent threshold means the base bonus.
  if (step <= 0) return 1;
  return level >= step ? 2 : 1;
}

/**
 * Is this check one Natural Defence could answer?
 *
 * A SAVE, AND ONLY A SAVE. The trigger names one, and the system rolls
 * plenty of other things through the same card.
 */
export function naturalDefenceTriggers(checkType) {
  return String(checkType ?? "").trim().toLowerCase() === "save";
}

/**
 * Whether this caster may answer this roll, and why not when they may not.
 *
 * SELF ONLY. "You make saving throw" — the trigger is the caster's own
 * save, which is the difference from Cutting Words, where the trigger is
 * somebody else's roll and a range matters. There is no distance here to
 * check because the caster and the roller are the same creature.
 *
 * EVERY REASON IS NAMED rather than collapsed into a boolean, so the
 * card can say why a button is absent instead of simply not appearing —
 * the anti-silence rule the reaction-feat offers already follow.
 */
export function naturalDefenceEligibility({
  hasSpell = false,
  reactions = 0,
  inCombat = true,
  isSelf = false
} = {}) {
  if (!hasSpell) return { eligible: false, reason: "does not know Natural Defence" };
  if (!isSelf) return { eligible: false, reason: "the trigger is your own saving throw" };
  // OUTSIDE COMBAT THERE IS NO REACTION ECONOMY. The same reading
  // cuttingWordsEligibility uses: a reaction spent when no round is
  // running is not a resource anybody is tracking.
  if (inCombat && Number(reactions) < 1) {
    return { eligible: false, reason: "no reaction left this round" };
  }
  return { eligible: true, reason: "" };
}

/** The modifier the card gains. */
export function naturalDefenceModifier(bonus) {
  const value = Math.max(0, Math.floor(Number(bonus) || 0));
  return {
    label: "Natural Defence",
    value,
    // RESISTANCE, WHICH IS WHY THE CARD MUST NOT ASSUME IT LANDS.
    // Appendix 1 takes the BEST of a type rather than summing, so a
    // character already carrying a larger resistance bonus gains
    // nothing at all from this — and reporting the rolled +1 as though
    // it had applied would be a card that lies. See naturalDefenceResult.
    type: "resistance"
  };
}

/**
 * What the card should say the bonus actually did.
 *
 * `gain` IS MEASURED, NOT ASSUMED — the caller reads the card's total
 * either side of the recompute and passes the difference. That is the
 * only way to be honest about a typed bonus: the spell may grant +1 and
 * move the total by nothing.
 *
 * @param {object} args
 * @param {number} args.total the total before
 * @param {number|null} args.dc
 * @param {number} args.gain what the recompute actually added
 */
export function naturalDefenceResult({ total = 0, dc = null, gain = 0 } = {}) {
  const before = Math.floor(Number(total) || 0);
  const moved = Math.floor(Number(gain) || 0);
  const after = before + moved;
  const target = dc === null || dc === undefined ? null : Math.floor(Number(dc));
  return {
    before,
    after,
    dc: target,
    applied: moved !== 0,
    // THE ONLY OUTCOME THE PLAYER CARES ABOUT: did spending the reaction
    // turn a failure into a success?
    turnedAside: target !== null && before < target && after >= target
  };
}
