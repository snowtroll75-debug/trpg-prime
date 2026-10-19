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
