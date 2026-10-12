/**
 * Initiative ordering (Core 3.1, Chapter 7, Step 1: Roll Initiative).
 *
 * "The character with the highest initiative checks acts first, with each other
 * character acting in descending order. In the result of a tie the character
 * with the highest Wisdom bonus acts first. If the result is still tied then
 * highest Dexterity and then flip a coin."
 *
 * The comparator is kept free of Foundry types so the ordering can be tested
 * directly; the Combat document adapts its Combatants into this shape.
 */

/**
 * @typedef {object} InitiativeEntry
 * @property {number|null} initiative The rolled initiative total.
 * @property {number} wisdom Total Wisdom ability score.
 * @property {number} dexterity Total Dexterity ability score.
 * @property {number} tiebreak Stable random value standing in for the coin flip.
 * @property {string} id Document id, used as a final deterministic fallback.
 */

function score(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

/**
 * Compare two combatants for initiative order. Sorts highest first.
 *
 * @param {InitiativeEntry} a
 * @param {InitiativeEntry} b
 * @returns {number}
 */
export function compareInitiative(a, b) {
  const initiativeA = score(a?.initiative);
  const initiativeB = score(b?.initiative);
  if (initiativeA !== initiativeB) return initiativeB - initiativeA;

  // First tie-break: highest Wisdom bonus.
  const wisdomA = score(a?.wisdom);
  const wisdomB = score(b?.wisdom);
  if (wisdomA !== wisdomB) return wisdomB - wisdomA;

  // Second tie-break: highest Dexterity.
  const dexterityA = score(a?.dexterity);
  const dexterityB = score(b?.dexterity);
  if (dexterityA !== dexterityB) return dexterityB - dexterityA;

  // Third tie-break: the coin flip, resolved once and stored so that the order
  // does not shuffle every time the tracker re-renders.
  const coinA = score(a?.tiebreak);
  const coinB = score(b?.tiebreak);
  if (coinA !== coinB) return coinB - coinA;

  // Final deterministic fallback so the sort is always stable.
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

/**
 * Sort a list of initiative entries into turn order.
 * @param {InitiativeEntry[]} entries
 * @returns {InitiativeEntry[]}
 */
export function sortInitiative(entries = []) {
  return [...entries].sort(compareInitiative);
}
