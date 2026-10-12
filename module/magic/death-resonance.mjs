/**
 * A DEATH NEARBY, TURNED INTO HIT POINTS.
 *
 * NEW at 3.487.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REAPER'S RESONANCE (PP 1, Cast Reaction, 1 minute, Evil / Soul)
 *
 *   "Trigger: A creature within 20 feet of you dies or is destroyed (in
 *    the case of an undead). The essence of the departed creature heals
 *    your wounds. You gain a surge of vitality, healing HP equal to the
 *    level of the triggering creature plus 5. If the triggering creature
 *    was undead, the amount healed is doubled."
 *
 *   +2 PP: "for every 5 HP healed (round down), you may also reduce any
 *          bleeding damage by 1."
 *
 * The spell shipped carrying a `note` and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MY FIRST DESIGN WAS WRONG, AND THE STAT LINE CORRECTED IT.
 *
 * The obvious build is a hook: watch for a death, find every caster with
 * the spell running, heal them. `death-watch-workflow.mjs` exists for
 * exactly that shape and `reapDead` is the one place every death path
 * passes through, so it looked like a fifteen-line change.
 *
 * It is `castAP: "Reaction"`. A reaction spell is CAST in response to
 * something happening — it is not armed in advance and it does not fire
 * itself. Graham's ruling of 28 August 2026 settled this for the whole
 * class, on Counter Perform: *"the player with the spell would cast the
 * spell and select an eligible target"*. There is no hook to write,
 * because the player casting it IS the trigger.
 *
 * Recorded because the wrong design was cheaper, plausible, and would
 * have shipped a spell that fired without being cast.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE SYSTEM KNOWS AND WHAT IT ASKS.
 *
 * It knows which creatures are dead (the `dead` status the reaper sets),
 * where they are, their level and their creature type. So the caster is
 * offered a list rather than a blank box.
 *
 * It does NOT get to refuse the ones that look wrong. Graham's ruling of
 * 27 August 2026: *"the picker OFFERS; it does not adjudicate"* — so a
 * creature that is alive, or too far away, or the caster themselves, is
 * still listed and still tickable, carrying the reason it looks
 * ineligible. That is `dispositionReasonFor`'s shape from 3.443.2,
 * applied to a different question.
 */

const int = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/** The printed radius the trigger names. */
export const RESONANCE_RADIUS_FEET = 20;

/** The printed flat addition. */
export const RESONANCE_BONUS = 5;

/** How many hit points a death is worth to the caster. */
export const RESONANCE_PER_BLEED = 5;

/**
 * A death's worth in hit points.
 *
 * NEVER NEGATIVE, and the floor is at zero rather than at the bonus: a
 * creature of negative level is not a thing this system produces, but a
 * blank level field reads as 0 and "level + 5" is then simply 5, which
 * is what the sentence says. Clamping the SUM rather than the level
 * keeps that true without inventing a minimum level.
 *
 * DOUBLED FOR AN UNDEAD, applied to the whole amount rather than to the
 * level alone — "the amount healed is doubled" names the amount, and the
 * amount is level + 5.
 *
 * @param {object} options
 * @param {number} options.level the dead creature's level
 * @param {boolean} options.undead whether it was undead
 * @returns {number}
 */
export function resonanceHeal({ level = 0, undead = false } = {}) {
  const base = Math.max(0, int(level) + RESONANCE_BONUS);
  return undead ? base * 2 : base;
}

/**
 * What the +2 PP warp buys.
 *
 * "For every 5 HP healed (round down)" — measured against the hit points
 * ACTUALLY healed, not the amount the death was worth. A caster two hit
 * points from full does not get to reduce four points of bleed on the
 * strength of a heal that mostly went nowhere; the sentence says "healed".
 *
 * @param {number} healed hit points actually restored
 * @returns {number}
 */
export function resonanceBleedReduction(healed) {
  return Math.max(0, Math.floor(Math.max(0, int(healed)) / RESONANCE_PER_BLEED));
}

/**
 * Why a candidate looks like the wrong creature — or null if it does not.
 *
 * RETURNS A REASON, NOT A VERDICT. Nothing here refuses anything; the
 * picker prints these beside a checkbox that still works. A GM whose
 * corpse is 21 feet away, or who has not yet marked it dead, can tick it
 * anyway, which is the whole of Graham's ruling.
 *
 * ORDERED WORST-FIRST so one row carries one sentence: being the caster
 * is a more fundamental objection than being far away, and a creature
 * that is both should say the first.
 *
 * @param {object} options
 * @param {boolean} options.isSelf
 * @param {boolean} options.isDead
 * @param {number|null} options.feet distance, or null when unmeasurable
 * @param {number} [options.radiusFeet]
 * @returns {string|null}
 */
export function resonanceReason({
  isSelf = false, isDead = false, feet = null, radiusFeet = RESONANCE_RADIUS_FEET
} = {}) {
  if (isSelf) return "is you — the spell feeds on another's death";
  if (!isDead) return "is not dead";
  // A DISTANCE NOBODY MEASURED IS NOT AN OBJECTION. Off a canvas there is
  // no answer, and printing "unknown distance" beside every row would
  // make the annotation noise rather than information. Same rule as the
  // thorns: an unmeasured distance does not decide anything.
  if (feet === null) return null;
  const r = Math.max(0, int(radiusFeet));
  return int(feet) > r ? `is ${int(feet)} ft away — beyond ${r} ft` : null;
}

/* ═════════════════════════════════════════════════════════════════════
 * THE CARD
 * ═══════════════════════════════════════════════════════════════════ */

/** What the card says when the resonance lands. */
export function resonanceLine({ casterName, sourceName, owed, healed, undead }) {
  const doubled = undead ? " — <em>doubled: it was undead</em>" : "";
  if (healed <= 0) {
    return `<em>${casterName} is already at full health — ${sourceName}'s passing restores nothing.</em>`;
  }
  const short = healed < owed
    ? ` <em>(of ${owed} owed — ${casterName} had no more to restore)</em>`
    : "";
  return `<strong>${casterName}</strong> draws <strong>${healed}</strong> HP from `
    + `${sourceName}'s passing${short}${doubled}.`;
}

/** What the card says about the bleed the warp cleared. */
export function resonanceBleedLine(casterName, reduced, from, to) {
  if (reduced <= 0) return "";
  return `<em>${casterName}'s bleeding eases by <strong>${reduced}</strong> `
    + `(Bleeding ${from} &rarr; ${to}).</em>`;
}

/** What the card says when the warp was bought and there was no bleed. */
export function resonanceNoBleedLine(casterName) {
  return `<em>${casterName} is not bleeding — the warp finds nothing to ease.</em>`;
}
