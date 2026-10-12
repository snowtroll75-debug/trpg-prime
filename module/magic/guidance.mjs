/**
 * GUIDANCE (Chapter 10, PP 0) — the rules. Pure; no Foundry.
 *
 *   Cast     1 AP (verbal) · Range 30 feet · Targets 1 creature
 *   Duration until the start of your next turn
 *   "You imbue the target with a fragment of magical guidance, granting
 *    them a +1 status bonus to one attack roll, saving throw, or skill
 *    check the target attempts before the duration ends. If the target
 *    uses the bonus, the spell ends. The target is then temporarily
 *    immune to the spell for 1 hour."
 *   CL 4: increase duration to 1 minute
 *
 * ─────────────────────────────────────────────────────────────────────
 * A FLOATING BONUS, WHICH IS UNUSUAL AND WAS WORTH MEASURING.
 *
 * Most bonuses in this system attach to a thing: a slot, a save, a
 * skill. This one attaches to a CHOICE — the target picks which of three
 * kinds of roll it lands on, at the moment they roll it. That is why it
 * cannot be an ordinary `bonus` effect: `applyBonusEffect` writes into a
 * named pool and would hand the target a permanent +1 to all three.
 *
 * I SAID EARLIER THAT SEVERAL SPELLS WORK THIS WAY. They do not — the
 * phrase "to one attack roll, saving throw, or skill check" occurs once
 * in the entire rulebook, and so does "uses the bonus". Guidance is the
 * only spell with this shape, so it is built as itself rather than as a
 * family. Building a mechanism for one caller and calling it general is
 * how a system acquires abstractions nothing needs.
 *
 * WHAT *IS* SHARED is the other half: "temporarily immune ... for 1
 * hour" is printed twenty-six times across the book. That lives in
 * ../temporary-immunity.mjs, general in shape and wired only here.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHERE THE BUTTON LIVES — the third spell to answer this, after Cutting
 * Words and Natural Defence, and the same answer: the triggering check's
 * own card. The difference is that this one is not a reaction and costs
 * nothing to spend; the decision is only WHICH roll to spend it on.
 */

/** The spell's name, lower-cased — the one lookup key. */
export const GUIDANCE_NAME = "guidance";

/** The bonus, and its type. A status bonus takes the best of its type. */
export const GUIDANCE_BONUS = 1;

/** How long the target cannot be given it again. */
export const GUIDANCE_IMMUNITY_SECONDS = 3600;

/**
 * The three kinds of roll the bonus may be spent on.
 *
 * FROM THE PRINTED SENTENCE, in its order: "one attack roll, saving
 * throw, or skill check". A `skill` check and an `attack` are separate
 * card types in this system even though they share a card, so all three
 * are named rather than inferred.
 */
export const GUIDANCE_CHECK_TYPES = Object.freeze(["attack", "save", "skill"]);

/**
 * Is this check one the bonus may be spent on?
 *
 * NOT "ANY CHECK". Initiative, flat checks and recovery rolls all reach
 * the same card, and the spell names three kinds. A looser test would
 * quietly widen the spell.
 */
export function guidanceTriggers(checkType) {
  return GUIDANCE_CHECK_TYPES.includes(String(checkType ?? "").trim().toLowerCase());
}

/**
 * The modifier the card gains.
 *
 * STATUS, as printed. It matters: Appendix 1 takes the best of a type,
 * so a target already carrying a larger status bonus gains nothing —
 * and the card has to report what actually moved rather than the printed
 * +1. Cutting Words learned this for circumstance penalties and Natural
 * Defence for resistance bonuses; this is the third of the same shape.
 */
export function guidanceModifier(bonus = GUIDANCE_BONUS) {
  return {
    label: "Guidance",
    value: Math.max(0, Math.floor(Number(bonus) || 0)),
    type: "status"
  };
}

/**
 * The duration in seconds, given the caster level and the step threshold.
 *
 * TWO DURATIONS, AND NEITHER IS A NUMBER IN THE PACK. The spell prints
 * "until the start of your next turn" and "CL 4: increase duration to 1
 * minute" — one is a turn boundary and the other is sixty seconds, and
 * the compendium records the second as prose in `casterLevelMods`.
 *
 * A TURN BOUNDARY IS NOT A SPAN, so the base case returns null rather
 * than inventing one. "Until the start of your next turn" is a moment
 * the combat tracker knows and a clock does not: six seconds is the
 * length of a round, but the bonus granted halfway through your turn
 * does not last six seconds, it lasts until a specific event. Returning
 * a number here would be a plausible lie, and the workflow expires it on
 * the turn boundary instead.
 *
 * @returns {number|null} seconds, or null for "until your next turn"
 */
export function guidanceDurationSeconds(casterLevel, threshold) {
  const level = Math.floor(Number(casterLevel) || 0);
  const step = Math.floor(Number(threshold) || 0);
  // AN ABSENT THRESHOLD MUST NOT UPGRADE EVERYONE — the same guard
  // Natural Defence needed, and the same reason: `level >= 0` is true
  // for every caster in the game.
  if (step <= 0) return null;
  return level >= step ? 60 : null;
}

/**
 * Whether this target may be given Guidance, and why not when they may not.
 *
 * THE IMMUNITY IS THE INTERESTING HALF. "The target is then temporarily
 * immune to the spell for 1 hour" is a limit on the SPELL, not on the
 * caster — so a second Cleric cannot top the same ally up, and this asks
 * about the target's record rather than the caster's.
 *
 * ALREADY CARRYING IT IS ALSO A REFUSAL, and a different one. A target
 * who has an unspent Guidance does not need another; recasting would
 * either stack two +1s of the same type (which Appendix 1 forbids) or
 * silently replace one waiting bonus with another.
 */
export function guidanceEligibility({ immune = false, alreadyHeld = false, remaining = 0 } = {}) {
  if (alreadyHeld) {
    return { eligible: false, reason: "already carries an unspent Guidance" };
  }
  if (immune) {
    return {
      eligible: false,
      reason: "is temporarily immune to Guidance",
      remaining: Math.max(0, Math.floor(Number(remaining) || 0))
    };
  }
  return { eligible: true, reason: "" };
}

/**
 * What the card should say the bonus actually did.
 *
 * `gain` IS MEASURED, NOT ASSUMED — read either side of the recompute.
 * See guidanceModifier for why a printed +1 may move nothing.
 */
export function guidanceResult({ total = 0, dc = null, gain = 0 } = {}) {
  const before = Math.floor(Number(total) || 0);
  const moved = Math.floor(Number(gain) || 0);
  const after = before + moved;
  const target = dc === null || dc === undefined ? null : Math.floor(Number(dc));
  return {
    before,
    after,
    dc: target,
    applied: moved !== 0,
    turnedAside: target !== null && before < target && after >= target
  };
}
