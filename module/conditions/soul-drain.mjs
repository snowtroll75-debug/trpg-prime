/**
 * SOUL DRAIN'S DAMAGE, LESS WHAT THE FALLEN MAXIMUM ALREADY TOOK (3.660.1;
 * found live testing 3.660.0). "This amount is applied directly to your
 * character as Hit Point damage but also reduces your maximum hit points."
 * Lowering the maximum clamps the current HP beneath it during preparation,
 * so a creature near full has already lost part of the drain by the time the
 * damage is dealt. Only the rest is owed. Pure.
 *
 * @param {number} damage the drain's rise
 * @param {number} storedHP the HP as written, before the clamp
 * @param {number} derivedHP the HP after preparation's clamp
 */
export function soulDrainDamageAfterClamp(damage, storedHP, derivedHP) {
  const owed = Math.max(0, Math.trunc(Number(damage) || 0));
  const clamped = Math.max(0, Math.trunc((Number(storedHP) || 0) - (Number(derivedHP) || 0)));
  return Math.max(0, owed - clamped);
}

/*
 * SOUL DRAIN HELD BY A SOURCE (3.674.0, C8; Inner Tempest's lost dragon,
 * Graham's B10-13). "This Soul Drain cannot be healed until you are
 * reunited"; "Soul Drain caused by the death of a dragon companion cannot be
 * removed by other means while the bond remains broken." The holder records
 * what it laid on the actor, `flags.trg-prime.soulDrainHeld = { source: n }`,
 * and the condition may not fall below the sum by any other route — rest, a
 * spell, the HUD — until the holder releases it (`releaseSoulDrain`). Pure.
 */
export const SOUL_DRAIN_HOLD_FLAG = "soulDrainHeld";

/** What is held on this actor, summed over its sources. */
export function heldSoulDrain(actor) {
  const held = actor?.flags?.["trg-prime"]?.[SOUL_DRAIN_HOLD_FLAG];
  if (!held || typeof held !== "object") return 0;
  return Object.values(held).reduce((sum, n) => sum + Math.max(0, Math.floor(Number(n) || 0)), 0);
}

/** A requested Soul Drain value, raised to what is held (0 asks for removal). */
export function soulDrainWithHold(requested, held) {
  const want = Math.max(0, Math.floor(Number(requested) || 0));
  const floor = Math.max(0, Math.floor(Number(held) || 0));
  return Math.max(want, floor);
}

/** A source key Foundry can store as a flag key (no dots). */
export function soulDrainSourceKey(source) {
  return String(source ?? "").trim().replace(/[^A-Za-z0-9_-]/g, "_") || "held";
}

/**
 * A RELEASE, WORKED OUT (3.674.0, C8; the review's finding). `had` is what the
 * source holds, `amount` what it gives up (null: all), `current` the
 * condition's value now. Returns how much is released (`n`), the hold left
 * (`left`), and, with `heal`, the value to set (`target`).
 *
 * The hold never outlasts the drain it holds: when the GM's hand has already
 * healed below it, what is left is cut to the healed value, so the release
 * cannot raise the Soul Drain back up.
 */
export function soulDrainRelease({ had = 0, amount = null, current = 0, heal = false } = {}) {
  const h = Math.max(0, Math.floor(Number(had) || 0));
  const n = amount === null || amount === undefined ? h : Math.min(h, Math.max(0, Math.floor(Number(amount) || 0)));
  const now = Math.max(0, Math.floor(Number(current) || 0));
  if (!heal) return { n, left: Math.min(h - n, now), target: null };
  const target = Math.max(0, now - n);
  return { n, left: Math.min(h - n, target), target };
}

