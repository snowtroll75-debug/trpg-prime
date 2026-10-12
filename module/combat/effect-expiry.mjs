/**
 * WHAT A CLOCK SAYS WHEN A SPELL EFFECT RUNS OUT.
 *
 * NEW at 3.514.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE SENTENCE, BECAUSE THERE ARE TWO CLOCKS AND THEY HAD DRIFTED.
 *
 * A spell effect can end on either clock — `expireTimedConditions` counts
 * rounds, `expireSpellEffects` reads world time — and in a combat BOTH
 * are stamped on the same effect, so which one ends it is a matter of
 * which is moving. That is fine as long as they do the same thing.
 *
 * They did not. Measured on 7 September 2026:
 *
 *   THE ROUND CLOCK announced the expiry and left behind everything the
 *   spell had built.
 *   THE WORLD CLOCK removed what the spell had built and said nothing.
 *
 * Each did exactly half the job, and each did the half the other missed —
 * so a player's experience of one spell ending depended entirely on
 * whether a combat was running. Both halves are fixed at 3.514.0, and
 * this file exists so the SPOKEN half cannot drift again: the sentence
 * lives in one place, and a check can run it.
 *
 * THE WORDING IS THE ROUND CLOCK'S, unchanged. It was the one that had a
 * sentence at all, players have been reading it since long before this
 * release, and a fix is not an excuse to reword something that worked.
 */

/**
 * The line a clock prints when an effect's time is up.
 *
 * @param {string} label the effect's own name, or its condition's label
 * @param {string} [onName] whose it was, when that is not already clear
 *   from who is speaking — the round clock sweeps every combatant on one
 *   turn and needs to say which, and the world clock speaks as the actor
 *   and does not.
 * @returns {string|null} null when there is nothing to name
 */
export function effectExpiredLine(label, onName = "") {
  const name = String(label ?? "").trim();
  // AN UNNAMED EFFECT SAYS NOTHING. "<strong></strong> expires." is a
  // line that tells a reader something ended and refuses to say what,
  // which is worse than the silence this release is removing.
  if (!name) return null;
  const who = String(onName ?? "").trim();
  return `<strong>${name}</strong> expires${who ? ` on ${who}` : ""}.`;
}
