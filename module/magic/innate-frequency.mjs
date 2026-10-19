/**
 * AN INNATE SPELL'S PRINTED FREQUENCY BEYOND "PER DAY" (3.651.0; F&F 3.0
 * block 18 R12 — Graham, 16 October 2026: "Please adhere to the book
 * ruling").
 *
 *   innateCooldownSeconds   "Timestop (1/minute)" — the Eclipse Hag. The cast
 *                           is refused, before PP or AP, until the clock it
 *                           started has run; stamped when the cast settles.
 *   innateQuickened         "Cold Bolt (quickened 4d8, at will)" — the
 *                           Frostsnarl Hag. Cast for 1 AP less (minimum 1), as
 *                           Quicken Spell does, at no PP surcharge: the
 *                           quickening is printed into the spell-like.
 *
 * Declared on the spell's `flags.trg-prime`. Pure.
 */
const SYSTEM_ID = "trg-prime";
export const INNATE_COOLDOWN_FLAG = "innateCooldownUntil";

const flagsOf = (spell) => spell?.flags?.[SYSTEM_ID] ?? {};
const innate = (spell) => Boolean(spell?.system?.innate);

/** The declared rest between casts, in seconds (0 when none). */
export function innateCooldownSeconds(spell) {
  if (!innate(spell)) return 0;
  return Math.max(0, Math.trunc(Number(flagsOf(spell).innateCooldownSeconds) || 0));
}

/** Seconds until it may be cast again (0 when it may). */
export function innateCooldownLeft(spell, now) {
  if (!innateCooldownSeconds(spell)) return 0;
  const until = Number(flagsOf(spell)[INNATE_COOLDOWN_FLAG]);
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil(until - Number(now ?? 0)));
}

/** When the next cast is allowed, from a cast at `now`. */
export function innateCooldownUntil(spell, now) {
  return Number(now ?? 0) + innateCooldownSeconds(spell);
}

/** The cast's AP: one less for a quickened innate, never below 1; anything not a plain number passes through. */
export function quickenedInnateAP(spell, castAP) {
  if (!innate(spell) || flagsOf(spell).innateQuickened !== true) return castAP;
  if (typeof castAP !== "number" || !Number.isFinite(castAP) || castAP <= 1) return castAP;
  return castAP - 1;
}
