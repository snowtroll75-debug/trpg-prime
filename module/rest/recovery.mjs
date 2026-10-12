/**
 * Rest & Recovery (Chapter 7/8): the mechanics triggered by resting
 * for a period of time — Natural Healing, Power Point Recovery (three
 * activity tiers), and the two skill checks that can boost recovery
 * (Healing Trance, Power Recovery). Fatigue Recovery already exists
 * as its own, separate system (exhaustion.mjs/exhaustion-workflow.mjs)
 * and isn't duplicated here — the Rest workflow calls it directly.
 *
 * Pure logic only; the GM-facing macro and its Foundry-coupled
 * workflow live in rest-workflow.mjs.
 */

/**
 * Natural Healing (Chapter 7): "You recover one tenth of your Total
 * HPs for every full hour of rest in a safe environment."
 *
 * @param {number} maxHP
 * @param {number} hours Whole hours only — partial hours grant nothing,
 *   matching "every full hour."
 * @returns {number}
 */
export function naturalHealingHP(maxHP, hours) {
  const perHour = Math.floor(Math.max(0, Number(maxHP) || 0) / 10);
  const wholeHours = Math.max(0, Math.floor(Number(hours) || 0));
  return perHour * wholeHours;
}

/**
 * PP Recovery while Active (Chapter 7): "one every three hours."
 *
 * @param {number} hours
 * @returns {number}
 */
export function activePPRecovery(hours) {
  return Math.floor(Math.max(0, Number(hours) || 0) / 3);
}

/**
 * PP Recovery while Resting (Chapter 7): "1 PP per two caster levels
 * (round up) for every hour of rest."
 *
 * @param {number} casterLevel
 * @param {number} hours
 * @returns {number}
 */
export function restingPPRecovery(casterLevel, hours) {
  const level = Math.max(0, Math.floor(Number(casterLevel) || 0));
  const perHour = Math.ceil(level / 2);
  const wholeHours = Math.max(0, Math.floor(Number(hours) || 0));
  return perHour * wholeHours;
}

/**
 * PP Recovery while Sleeping (Chapter 7): "recover 50% of power
 * points for each half of a full night's rest... you may only
 * benefit from a maximum of 1 sleep cycle in any given 24-hour
 * period. Any time sleeping beyond that is classed as Resting."
 *
 * A sleep cycle is 8 hours (two halves of 4 hours each). Hours
 * beyond 8 don't extend this — they're the caller's responsibility to
 * route through restingPPRecovery instead, matching "classed as
 * Resting."
 *
 * @param {number} maxPP
 * @param {number} hours Hours actually spent sleeping (capped at 8
 *   internally, per the one-sleep-cycle limit).
 * @returns {number}
 */
export function sleepingPPRecovery(maxPP, hours) {
  const cappedHours = Math.min(8, Math.max(0, Number(hours) || 0));
  const halvesCompleted = Math.floor(cappedHours / 4);
  const fraction = Math.min(1, halvesCompleted * 0.5);
  return Math.floor(Math.max(0, Number(maxPP) || 0) * fraction);
}

/**
 * Hours beyond one 8-hour sleep cycle, to be recovered at the
 * Resting rate instead — "classed as Resting."
 *
 * @param {number} hours
 * @returns {number}
 */
export function excessSleepHoursAsResting(hours) {
  return Math.max(0, Math.floor(Number(hours) || 0) - 8);
}

/**
 * Power Recovery (Chapter 6, Skill Actions — Meditation), the extra
 * PP earned on top of the base Resting/Sleeping recovery for a given
 * hour: "Heroic regain an additional 2 PP per caster level. Critical
 * ...1 PP per caster level. Success ...1 PP per two caster levels
 * (round up). Partial ...1 PP."
 *
 * @param {string} degreeKey
 * @param {number} casterLevel
 * @returns {number}
 */
export function powerRecoveryBonus(degreeKey, casterLevel, extras = []) {
  const level = Math.max(0, Math.floor(Number(casterLevel) || 0));
  // AND WHAT A FEAT ADDS ON TOP (3.625.0): Pillars of Faith's Spiritual
  // Reserve — "Whenever you achieve a Critical or Heroic result on Power
  // Recovery, recover 1 additional PP per caster level." Declared on an
  // effect (see powerRecoveryExtras) rather than by feat name here.
  const extra = (Array.isArray(extras) ? extras : [])
    .filter((e) => e.degrees.includes(String(degreeKey ?? "")))
    .reduce((sum, e) => sum + e.perCasterLevel * level + e.flat, 0);
  switch (degreeKey) {
    case "heroic":
      return level * 2 + extra;
    case "critical":
      return level + extra;
    case "success":
      return Math.ceil(level / 2) + extra;
    case "partial":
      return 1 + extra;
    default:
      return 0;
  }
}

const RECOVERY_DEGREES = Object.freeze(["heroic", "critical", "success", "partial"]);

/**
 * The Power Recovery extras the actor's effects declare (3.625.0):
 *   flags["trg-prime"].powerRecoveryExtra = {
 *     label: "Spiritual Reserve",
 *     degrees: ["critical", "heroic"],   // which results it rides
 *     perCasterLevel: 1,                 // PP per caster level
 *     flat: 0                            // or a flat number
 *   }
 * @param {Array<{disabled, name, flags}>} effects
 */
export function powerRecoveryExtras(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.["trg-prime"]?.powerRecoveryExtra;
    if (!raw || typeof raw !== "object") continue;
    const degrees = (Array.isArray(raw.degrees) ? raw.degrees : []).map((d) => String(d ?? "").trim().toLowerCase()).filter((d) => RECOVERY_DEGREES.includes(d));
    const perCasterLevel = Math.max(0, Math.floor(Number(raw.perCasterLevel) || 0));
    const flat = Math.max(0, Math.floor(Number(raw.flat) || 0));
    if (!degrees.length || (!perCasterLevel && !flat)) continue;
    out.push({ label: String(raw.label ?? effect.name ?? "Power Recovery extra"), degrees, perCasterLevel, flat });
  }
  return out;
}

/**
 * Healing Trance (Chapter 6, Skill Actions — Meditation): "Critical
 * You triple the amount of Hit Points regained naturally. Success You
 * double [it]." Applies to that specific hour's Natural Healing only
 * — "you cannot use Healing Trance again for 1 hour," matching the
 * action's own 1-hour AP cost.
 *
 * @param {string} degreeKey
 * @returns {number} The multiplier for that hour's Natural Healing —
 *   1 (no change) if this degree grants no bonus.
 */
export function healingTranceMultiplier(degreeKey) {
  if (degreeKey === "critical" || degreeKey === "heroic") return 3;
  if (degreeKey === "success") return 2;
  return 1;
}

/** A full night, in hours — the cycle every other rest rule is written against. */
export const FULL_NIGHT_HOURS = 8;

/**
 * How many hours a full night's rest takes this creature, if a feature
 * shortens it. Returns FULL_NIGHT_HOURS when nothing does.
 *
 * @param {Actor} actor
 * @returns {number}
 */
export function fullRestHours(actor) {
  const sources = Array.from(actor?.items ?? [])
    .concat(Array.from(actor?.appliedEffects ?? actor?.effects ?? []).filter((e) => !e.disabled));
  let shortest = FULL_NIGHT_HOURS;
  for (const source of sources) {
    const declared = Number(source?.flags?.["trg-prime"]?.fullRestHours);
    // A zero or negative would divide the whole rest by nothing; a value
    // above a full night is not a shortening and is ignored rather than
    // used to LENGTHEN somebody's night.
    if (Number.isFinite(declared) && declared > 0 && declared < shortest) shortest = declared;
  }
  return shortest;
}
