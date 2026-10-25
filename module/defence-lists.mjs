/**
 * defence-lists — an actor's Resistances, Immunities and Weaknesses as the
 * GM typed them, and as effects add to them.
 *
 * NEW at 3.666.4. Found while fixing Graham's Vhalendar module on 22 October
 * 2026: his hand-made "Lesser Echo" listed the Construct type's eleven
 * immunities nine times over, and a Greater Resonance Echo read
 * "disease, poison, disease, poison".
 *
 * THE CAUSE. A creature type (Construct, Undead…) and many abilities grant
 * immunities with an Active Effect that ADDS ", poison" to
 * `system.combat.immunities`. The actor sheet's Immunities box was filled
 * from the DERIVED value, effects included, so saving the sheet for any
 * reason (a typo fixed in the notes, a skill rank changed) wrote the granted
 * entries back into the stored field. The effect then added them again on
 * top. Every save added one more copy, and a creature type changed later
 * left its old immunities behind in the stored text.
 *
 * THE FIX, IN THREE PARTS:
 *   1. The three boxes show and save what was TYPED (the stored value).
 *      What effects add is listed under the box, read only.
 *   2. The derived lists are de-duplicated, so a copy already stored is
 *      harmless.
 *   3. A migration pass cleans the stored lists that copies were baked into
 *      (see `bakedDefenceList`).
 *
 * Pure: no Foundry.
 */

/** The three free-text defence lists on `system.combat`. */
export const DEFENCE_LIST_KEYS = Object.freeze(["resistances", "immunities", "weaknesses"]);

const norm = (entry) => String(entry ?? "").trim().toLowerCase();

/** The entries of one list, in order, as written. */
function defenceListEntries(text) {
  return String(text ?? "")
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * One list, tidied: trimmed, comma-separated, each entry once (the first
 * spelling kept). "fire , cold, Fire" is "fire, cold".
 */
export function tidyDefenceList(text) {
  const seen = new Set();
  const out = [];
  for (const entry of defenceListEntries(text)) {
    const key = norm(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out.join(", ");
}

/**
 * What effects add to a list: the derived entries the stored text does not
 * already hold. Shown under the sheet's box, so the GM can see why a
 * Construct is immune to poison without the box claiming it was typed.
 *
 * @param {string} derived the prepared value (stored + effects)
 * @param {string} stored the stored value
 * @returns {string[]}
 */
export function grantedDefenceEntries(derived, stored) {
  const typed = new Set(defenceListEntries(stored).map(norm));
  return defenceListEntries(tidyDefenceList(derived)).filter((entry) => !typed.has(norm(entry)));
}

/**
 * A stored list that effects' entries were baked into, cleaned; or null to
 * leave it alone.
 *
 * THE SIGNATURE IS A REPEAT. Nobody types "poison" twice, and every save of
 * the old sheet added one more copy of what effects grant, so a stored list
 * holding a repeated entry is a baked one. Such a list loses its repeats and
 * every entry an effect on the actor still grants (the effect goes on
 * granting it). A list with no repeat is left exactly as typed, even where an
 * entry matches an effect, because that may be what the GM meant.
 *
 * @param {string} stored
 * @param {string[]} granted entries the actor's effects add to this list
 * @returns {string|null}
 */
export function bakedDefenceList(stored, granted = []) {
  const entries = defenceListEntries(stored);
  const keys = entries.map(norm);
  if (new Set(keys).size === keys.length) return null;
  const fromEffects = new Set((granted ?? []).map(norm));
  const cleaned = defenceListEntries(tidyDefenceList(stored)).filter((entry) => !fromEffects.has(norm(entry)));
  return cleaned.join(", ");
}

/**
 * The entries an effect change adds to a defence list: the value of an
 * Add change on `system.combat.<key>` (", poison" or "poison, disease").
 *
 * @param {object} change an Active Effect change
 * @param {string} key one of DEFENCE_LIST_KEYS
 * @returns {string[]}
 */
export function defenceEntriesAddedBy(change, key) {
  if (String(change?.key ?? "") !== `system.combat.${key}`) return [];
  return defenceListEntries(change?.value);
}
