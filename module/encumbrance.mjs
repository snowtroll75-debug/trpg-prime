/**
 * Encumbrance and Armour Check Penalty (Core 3.1, Chapter 6). Pure logic;
 * actor.mjs wires this into attribute, combat and skill derivation.
 *
 * Two genuinely distinct mechanics, easy to conflate:
 *
 * - Encumbered (carrying more than your Weight Allowance) reduces your Dex
 *   MODIFIER itself, and your Speed, "-1... for each 20 lb in excess" — a
 *   broad ability-score-level penalty that cascades into DB, Reflex,
 *   initiative and Dex-based skills alike.
 * - Armour Check Penalty (armour heavier than leather, and any shield)
 *   applies only "to all Dexterity- and Strength-based skill checks" — it
 *   never touches DB, saves, or the ability score itself. Non-proficient
 *   armour doubles its own ACP contribution.
 *
 * Max Dexterity Bonus is a third, narrower mechanic again: it caps the
 * POSITIVE Dex bonus used for DB specifically ("This restriction doesn't
 * affect any other Dexterity-related abilities").
 */

/** Weight Allowance: 50 + Strength score x 10. */
export function weightAllowance(strengthTotal) {
  return 50 + Math.floor(Number(strengthTotal) || 0) * 10;
}

/** Is this creature over its Weight Allowance at all?
 *
 * "If you exceed your weight allowance you gain the encumbered condition"
 * (Chapter 6, page 146). ANY excess, with no 20 lb threshold — which is
 * why this is a separate question from the step counts below. Until
 * 3.573.0 nothing asked it and the Encumbered condition, though
 * registered, was never applied to anybody.
 */
export function isEncumbered(carriedWeight, allowance) {
  return (Number(carriedWeight || 0) - Number(allowance || 0)) > 0;
}

/**
 * Encumbrance steps for the DEXTERITY penalty: -1 per 20 lb **or part
 * thereof** carried beyond the Weight Allowance.
 *
 * ROUNDS UP, and the Speed steps below round DOWN. That is not an
 * oversight in either direction — it is the rulebook read literally, and
 * Graham ruled on 18 September 2026 that page 146 governs where the book
 * disagrees with itself:
 *
 *   p.146, the Dex penalty: "for each 20 lb (or part thereof) in excess"
 *   p.146, the Speed penalty: "For every 20 lbs that you are carrying in
 *          excess" — no such phrase
 *   Appendix 2's ENCUMBERED entry: "for each 20 lb in excess" for the Dex
 *          penalty too, dropping the parenthesis
 *
 * So one shared step count CANNOT satisfy both sentences, which is what
 * this function used to be. Until 3.573.0 it floored for both and its own
 * comment quoted the appendix wording as though that were the rule — a
 * comment asserting something the page beside it contradicts.
 *
 * One pound over your allowance is now -1 Dexterity and no Speed loss.
 */
export function encumbranceSteps(carriedWeight, allowance) {
  const excess = Number(carriedWeight || 0) - Number(allowance || 0);
  if (excess <= 0) return 0;
  return Math.ceil(excess / 20);
}

/**
 * Encumbrance steps for the SPEED penalty: one per FULL 20 lb.
 *
 * "For every 20 lbs that you are carrying in excess of your weight
 * allowance, you also take a -5 penalty to your speed." No "or part
 * thereof", in either printing of the rule. See `encumbranceSteps`.
 */
export function encumbranceSpeedSteps(carriedWeight, allowance) {
  const excess = Number(carriedWeight || 0) - Number(allowance || 0);
  if (excess <= 0) return 0;
  return Math.floor(excess / 20);
}

/**
 * Sum the Armour Check Penalty from a list of equipped armour/shield
 * pieces, doubling any piece the wearer isn't proficient with.
 *
 * @param {Array<{penalty: number, proficient: boolean}>} pieces
 * @returns {number} A non-negative total (penalties expressed as positive
 *   magnitudes here; the caller applies it as a negative modifier).
 */
export function totalArmourCheckPenalty(pieces = []) {
  return pieces.reduce((total, piece) => {
    const base = penaltyMagnitude(piece.penalty);
    const multiplier = piece.proficient === false ? 2 : 1;
    return total + base * multiplier;
  }, 0);
}

/**
 * A penalty as a positive magnitude, whichever sign it was stored with.
 *
 * Every piece of armour in this project's own compendium stores its
 * Armour Check Penalty as a negative number (-2 for Chain, -5 for Plate),
 * while this module was written expecting positive magnitudes and clamped
 * anything below zero away. The result was that armour check penalties
 * silently never applied to anything, for every piece of armour in the
 * game. Reading the magnitude rather than the sign fixes that without
 * requiring the content to be rewritten, and keeps working if a future
 * item is authored the other way round.
 */
export function penaltyMagnitude(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.abs(Math.trunc(n));
}

/**
 * An Armour Check Penalty with a quality or material reduction applied,
 * FLOORED AT ZERO.
 *
 * Eaog prints "all penalties are reduced by 2 (min 0)"; the Superior
 * Armour table's ACP column is likewise a reduction, not a penalty. Until
 * 3.573.0 the reduction was simply ADDED to the stored penalty — which is
 * negative in this pack — and the sum then read for its magnitude. On
 * heavy armour that was right (-8 + 2 = -6, a penalty of 6). On light
 * armour it INVERTED: Padded and Leather store 0, so 0 + 2 = +2, and the
 * magnitude of that is a penalty of 2. Thirteen of the twenty-six armour
 * pieces got the wrong figure and seven were made strictly WORSE by the
 * material meant to help them — a Legendary suit of Padded acquired an
 * ACP of 2 for being well made. Found in the pages 141-150 audit.
 *
 * WORKED IN MAGNITUDES rather than clamped with Math.min(0, ...), because
 * this project's convention is that a penalty's SIGN is not meaningful
 * (see `penaltyMagnitude` above) and a sign-dependent clamp would zero a
 * penalty authored the other way round. A NEGATIVE delta is an INCREASE —
 * the Heavy superior trait — and raises the magnitude, which is why this
 * cannot be written as a simple subtraction floored at zero either.
 *
 * @param {number} storedPenalty As authored, sign irrelevant.
 * @param {number} delta Positive reduces the penalty; negative increases it.
 * @returns {number} The penalty in this pack's negative convention.
 */
export function reducedPenalty(storedPenalty, delta = 0) {
  const magnitude = penaltyMagnitude(storedPenalty);
  const reduction = Number(delta) || 0;
  return -Math.max(0, magnitude - reduction);
}

/** Speed lost to encumbrance: "a -5 penalty to your speed" per 20 lb. */
export const ENCUMBRANCE_SPEED_PENALTY_PER_STEP = 5;

/**
 * Speed lost to being over your Weight Allowance.
 *
 * Distinct from the Dexterity penalty, which is -1 per step: this is -5
 * per step. The two were conflated here, so a character 20 lb over their
 * allowance lost a single foot of Speed rather than five.
 */
export function encumbranceSpeedPenalty(steps) {
  return Math.max(0, Math.floor(Number(steps) || 0)) * ENCUMBRANCE_SPEED_PENALTY_PER_STEP;
}

/**
 * Speed lost to worn armour (Chapter 6).
 *
 * A separate value from the Armour Check Penalty — armour records both,
 * and only ACP was ever read. Quality and materials can reduce it, which
 * is what speedPenaltyDelta carries.
 *
 * @param {Array<{speedPenalty: number, speedPenaltyDelta?: number}>} pieces
 * @returns {number} A non-negative total.
 */
export function totalArmourSpeedPenalty(pieces = []) {
  return pieces.reduce((total, piece) => {
    const base = penaltyMagnitude(piece.speedPenalty);
    const reduction = Math.max(0, Number(piece.speedPenaltyDelta) || 0);
    return total + Math.max(0, base - reduction);
  }, 0);
}

/**
 * Round a Speed down to the nearest 5 feet: "if you are playing with a
 * battle grid, then you always round your speed down to the nearest 5 ft."
 */
export function roundSpeedToGrid(speed) {
  const value = Math.max(0, Number(speed) || 0);
  return Math.floor(value / 5) * 5;
}

/**
 * A creature's land Speed after armour and encumbrance.
 *
 * @param {object} options
 * @param {number} options.base
 * @param {number} [options.armourPenalty]
 * @param {number} [options.encumbrancePenalty]
 * @param {boolean} [options.roundToGrid]
 * @returns {{speed: number, immobilised: boolean}} Immobilised when it
 *   reaches zero — "if your speed is reduced to 0, you gain the
 *   Immobilised condition until you shed some weight."
 */
export function effectiveLandSpeed({
  base,
  armourPenalty = 0,
  encumbrancePenalty = 0,
  roundToGrid = true
} = {}) {
  const raw = Math.max(
    0,
    (Number(base) || 0) - Math.max(0, armourPenalty) - Math.max(0, encumbrancePenalty)
  );
  const speed = roundToGrid ? roundSpeedToGrid(raw) : raw;
  return { speed, immobilised: speed <= 0 };
}

/**
 * Clamp a Dexterity bonus to a Max Dex Bonus cap. Only the positive portion
 * is capped; a Dex penalty (negative) always applies in full. A cap value
 * below 0 (the -1 sentinel) means "no cap set" and is ignored.
 */
export function clampToMaxDexBonus(dexterityTotal, cap) {
  const dex = Number(dexterityTotal) || 0;
  const capValue = Number(cap);
  if (!Number.isFinite(capValue) || capValue < 0) return dex;
  return dex > capValue ? capValue : dex;
}

/** The tightest (lowest) Max Dex Bonus among a set of caps, ignoring
 * "no cap set" sentinels. Returns null if nothing restricts it. */
export function tightestMaxDexBonus(caps = []) {
  const valid = caps
    .map((cap) => Number(cap))
    .filter((cap) => Number.isFinite(cap) && cap >= 0);
  if (!valid.length) return null;
  return Math.min(...valid);
}

/**
 * THE OTHER TABLE'S MAX DEX IS A MODIFIER (Chapter 6, page 151). On the
 * Light, Medium and Heavy tables the column is a cap; on the Other table
 * it is "-" for most pieces and "-1" for Chain Greaves, Metal Greaves and
 * Metal Bracers — a cap of -1 would mean nothing, so it reduces the cap
 * the body armour sets. The system stores -1 in `maxDexBonus` as "no cap
 * from this piece", so the three could not say it and cost nothing; the
 * question was raised at 3.215.0 and never settled. They carry it in
 * `maxDexModifier` now (3.575.0).
 *
 * A character with no cap has nothing to reduce, so null stays null. The
 * cap never goes below 0.
 *
 * @param {number|null} cap From `tightestMaxDexBonus`.
 * @param {number[]} modifiers Each worn piece's `maxDexModifier`.
 * @returns {number|null}
 */
export function adjustedMaxDexCap(cap, modifiers = []) {
  if (cap === null || cap === undefined) return null;
  const change = (modifiers ?? []).reduce((sum, m) => sum + (Math.trunc(Number(m)) || 0), 0);
  return Math.max(0, Number(cap) + change);
}
