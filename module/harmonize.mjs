/**
 * HARMONIZE (3.634.0; Fiends & Fables 3.0 block 4, ruling R10 — Graham,
 * 12 October 2026). The Virtue, page 22:
 *
 *   "Harmonize (1 AP) (auditory, divinity) When using their innate spells,
 *    additional virtues can instead use this action to aid their companion
 *    adding the aid bonus to the DC to save against the spell (max of +2 per
 *    virtue)."
 *
 * The aiding Virtue rolls the Aid check — Perform, it being auditory — and
 * reads the Bonus Check Table, capped at +2 (a fumbled aid still costs, as
 * Aid does: down to −2). The result waits on the companion and is added to
 * the save DC of its next innate spell THIS ROUND; each Virtue's bonus is its
 * own, so three Virtues harmonising can add up to +6.
 *
 * Pure.
 */
import { bonusCheckModifier } from "./dice/resolution.mjs";

export const HARMONIZE_FLAG = "harmonize";
const CAP = 2;

/** One Virtue's aid, from its degree: the Bonus Check Table, capped at ±2. */
export function harmonizeBonus(degreeKey) {
  const value = bonusCheckModifier(String(degreeKey ?? "").trim().toLowerCase());
  return Math.max(-CAP, Math.min(CAP, value));
}

/** The record with this Virtue's aid added (one per Virtue; a second replaces). */
export function withHarmony(record, { by, bonus, when }) {
  const keep = sameMoment(record?.when, when) ? (record?.from ?? []).filter((f) => f.by !== by) : [];
  return { when, from: [...keep, { by, bonus }] };
}

/** The total waiting for this moment, or 0 when it has lapsed. */
export function harmonyTotal(record, when) {
  if (!record || !sameMoment(record.when, when)) return 0;
  return (record.from ?? []).reduce((sum, f) => sum + (Number(f.bonus) || 0), 0);
}

/**
 * "This round": the same combat and round, or — out of combat — within the
 * six seconds a round lasts.
 */
function sameMoment(a, b) {
  if (!a || !b) return false;
  if (a.combatId || b.combatId) return a.combatId === b.combatId && Number(a.round) === Number(b.round);
  return Math.abs(Number(a.worldTime) - Number(b.worldTime)) <= 6;
}
