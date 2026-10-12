/**
 * HEALING CHANNEL, and what "increased TO" means.
 *
 * NEW at 3.475.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FEAT.
 *
 *   "Furthermore, when casting the Cure spell, the amount healed is
 *    INCREASED TO d10's (and +10 for ranged)."
 *
 * THE SPELL IT CHANGES.
 *
 *   Cure, 2 AP: "The spell has a range of 30 feet and restores an
 *   ADDITIONAL 8 HP" — the pack carries that mode as `1d8 + 8`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND IN A LIVE SESSION, 2 September 2026: THE +10 WAS ADDED, NOT
 * SUBSTITUTED.
 *
 * The old code upgraded the dice and then appended a term:
 *
 *     "1d8 + 8"  →  "1d10 + 8"  →  "1d10 + 8 + 10"
 *
 * so a ranged Cure healed 1d10+18. Graham reported it from the table.
 * The comment beside it even stated the wrong reading out loud — "the
 * 2 AP Cure mode's own +8 stays — the +10 is IN ADDITION" — which is how
 * a misreading survives review: it had been written down as though it
 * were the rule.
 *
 * "INCREASED TO" IS A REPLACEMENT, AND THE SENTENCE PROVES ITSELF.
 * The same clause does both halves: d8 becomes d10, and 8 becomes 10.
 * Nobody reads "increased to d10's" as "roll a d8 AND a d10", so the
 * bracket that follows cannot mean "+8 AND +10". One sentence, one kind
 * of change, applied twice.
 *
 * WHY IT IS ITS OWN FILE. The rule lived inline in a 600-line cast
 * function, where nothing could test it and the only description of it
 * was a comment asserting the opposite of the book. Pulled out, it is
 * eight lines the harness can drive.
 */

/** The die faces this feat upgrades, and what to. */
const DIE_FROM = /d8\b/gi;
const DIE_TO = "d10";

/** The flat bonus a ranged Cure gets under this feat. */
export const RANGED_BONUS = 10;

/** A trailing flat term — "1d8 + 8" has one, "1d8" does not. */
const FLAT_TERM = /\s*\+\s*(\d+)\s*$/;

/**
 * Is this AP mode the ranged one the feat's bracket is about?
 *
 * ASKED OF THE RANGE, which is where Cure puts the distinction — the
 * 1 AP mode is "Touch" and the 2 AP mode is "30 feet". The 3 AP mode
 * carries no range at all (it is a radius) and has no flat bonus to
 * replace, so it is correctly not "ranged" for this purpose.
 */
export function isRangedCure(range) {
  return /\b(feet|ft)\b/i.test(String(range ?? ""));
}

/**
 * The healing formula this feat produces.
 *
 * @param {string} formula the AP mode's own formula
 * @param {boolean} ranged from `isRangedCure`
 * @returns {string}
 */
export function healingChannelFormula(formula, ranged) {
  const source = String(formula ?? "").trim();
  if (!source) return source;
  const upgraded = source.replace(DIE_FROM, DIE_TO);
  if (!ranged) return upgraded;
  // REPLACE THE FLAT TERM, DO NOT ADD TO IT. This is the whole fix:
  // "1d8 + 8" becomes "1d10 + 10" and not "1d10 + 8 + 10".
  if (FLAT_TERM.test(upgraded)) {
    return upgraded.replace(FLAT_TERM, ` + ${RANGED_BONUS}`);
  }
  // A RANGED MODE WITH NO FLAT TERM still gains the bonus — there is no
  // such mode in Cure today, and inventing a refusal for one would be a
  // rule about a spell nobody has written.
  return `${upgraded} + ${RANGED_BONUS}`;
}

/** Does this cast qualify at all? */
export function healingChannelApplies(spellName, hasFeat) {
  return Boolean(hasFeat) && /^cure$/i.test(String(spellName ?? "").trim());
}
