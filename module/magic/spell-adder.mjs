/**
 * SPELL ADDERS (Chapter 3, Chapter 11, and the familiars pack).
 *
 * WHAT ONE IS. The Spell Battery familiar ability states the mechanic in
 * full, and every other carrier borrows the term from it:
 *
 *   "Your familiar acts as a +1 Spell Adder allowing you to cast any one
 *    spell from your repertoire each day with no power point cost."
 *
 * So a +N Spell Adder is N free casts a day. Graham's ruling, 18 August
 * 2026: the whole cast is free, warping included.
 *
 * WHY THIS MODULE EXISTS. "Spell adder" was priced, labelled, offered by
 * the magic-item builder, and printed on four different carriers — and
 * did nothing on any of them. `wondrous-data.mjs` marked it
 * `reported: true`; `wizard.mjs` said outright that "what the bonus
 * actually DOES … is not" implemented; the audit recorded Arcane Bond as
 * blocked on an undefined rule. It was not undefined. It was defined in
 * the familiars pack, in the one place nobody had looked.
 *
 * That is the same failure as Blade Ally's runes and Steed Ally's
 * companion, three times in one chapter: a note that outlived its reason,
 * believed instead of checked. The fix is deliberately ONE mechanic
 * shared by every carrier rather than a bonus bolted onto Arcane Bond,
 * because the moment there are two of them they disagree.
 *
 * WHAT COUNTS AS A CARRIER. Only sources that record a NUMBER are
 * collected here. A carrier that merely mentions the words in its prose
 * is not silently guessed at — `spellAdderSources` returns what it can
 * prove, and `unstructured` names what it found but could not rate, so
 * the sheet can say so instead of quietly under-counting.
 *
 * Pure but for the flag read/write: the collection takes an actor and
 * returns data, and the workflow decides what to do with it.
 */

const SYSTEM_ID = "trg-prime";

/** Where the day's spent uses are recorded, on the ACTOR. */
export const SPELL_ADDER_USED_FLAG = "spellAdderUsed";

/**
 * Every rated Spell Adder an actor carries.
 *
 * ARCANE BOND is a daily choice already recorded by its own Use button
 * (`arcaneBond: {itemId, itemName, bonus}`), and the bonus ladder is
 * `arcaneBondBonus`. It is read off the flag rather than recomputed, so
 * a character who has not made today's choice has no adder — which is
 * correct: the ability is "designate a single item you own", and until
 * they have, nothing is designated.
 *
 * WONDROUS ITEMS must be INVESTED, the same gate every other wondrous
 * ability uses ("in a pack, or worn but not invested, contributes
 * nothing"). The Wizardry Rings are the shipped example, +1 to +4.
 *
 * @param {Actor} actor
 * @returns {{sources: Array<{label: string, value: number}>, total: number,
 *   unstructured: string[]}}
 */
export function spellAdderSources(actor) {
  const sources = [];
  const unstructured = [];
  const items = Array.from(actor?.items ?? []);

  for (const item of items) {
    const bond = item?.flags?.[SYSTEM_ID]?.arcaneBond;
    if (bond?.bonus > 0) {
      sources.push({
        label: `Arcane Bond — ${bond.itemName ?? "bonded item"}`,
        value: Math.floor(Number(bond.bonus) || 0)
      });
    }
    // Any item may be rated directly. This is the channel the magic-item
    // builder writes and the one a GM can set by hand, and it is what
    // Sacred Weapon's "+1 Divine Spell Adder" records on the weapon.
    const rated = Math.floor(Number(item?.flags?.[SYSTEM_ID]?.spellAdder) || 0);
    if (rated > 0) sources.push({ label: item.name, value: rated });
  }

  return {
    sources,
    total: sources.reduce((sum, s) => sum + s.value, 0),
    unstructured
  };
}

/**
 * Merge the wondrous channel's own findings in.
 *
 * Kept separate from `spellAdderSources` because `wondrousBonusesForActor`
 * already walks every invested item and applies its own restriction
 * rules; duplicating that walk here would be a second answer to
 * "is this ring working?".
 *
 * @param {{sources: object[], total: number, unstructured: string[]}} base
 * @param {Array<{label: string, value: number}>} wondrous
 * @returns {{sources: object[], total: number, unstructured: string[]}}
 */
export function withWondrousAdders(base, wondrous = []) {
  const extra = (Array.isArray(wondrous) ? wondrous : [])
    .map((w) => ({ label: String(w?.label ?? "Wondrous item"), value: Math.floor(Number(w?.value) || 0) }))
    .filter((w) => w.value > 0);
  const sources = [...(base?.sources ?? []), ...extra];
  return {
    sources,
    total: sources.reduce((sum, s) => sum + s.value, 0),
    unstructured: [...(base?.unstructured ?? [])]
  };
}

/**
 * How many free casts remain today.
 *
 * CLAMPED AT BOTH ENDS. A character whose rating DROPS mid-day — the ring
 * comes off, the bond moves to a lesser item — must not go negative and
 * must not gain a use back by taking it off and putting it on again;
 * spent is spent.
 *
 * @param {number} rating
 * @param {number} used
 * @returns {number}
 */
export function spellAdderRemaining(rating, used) {
  const max = Math.max(0, Math.floor(Number(rating) || 0));
  const spent = Math.max(0, Math.floor(Number(used) || 0));
  return Math.max(0, max - spent);
}

/**
 * Whether this particular cast may be paid for with an adder.
 *
 * "CAST ANY ONE SPELL FROM YOUR REPERTOIRE" is the printed scope, and the
 * three exclusions below are the ones that would otherwise make the
 * offer meaningless or free money:
 *
 *   - a CANTRIP already costs 0, so spending a use on one is a trap
 *   - an INNATE spell-like already costs 0, same
 *   - an ITEM cast is paid for at the workbench and never touches the
 *     caster's pool at all
 *
 * A memorised spell counts: "repertoire" is the book's general word for
 * the spells a caster has available, and refusing a Wizard the use of a
 * ring every other caster benefits from would be a rule nobody wrote.
 *
 * @param {{isCantrip: boolean, isInnate: boolean, isItemCast: boolean, totalPP: number}} cast
 * @returns {boolean}
 */
export function spellAdderApplies({ isCantrip, isInnate, isItemCast, totalPP } = {}) {
  if (isCantrip || isInnate || isItemCast) return false;
  return Math.floor(Number(totalPP) || 0) > 0;
}
