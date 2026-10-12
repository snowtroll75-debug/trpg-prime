/**
 * spell-source — what a spell IS, as the damage pipeline needs to know it.
 *
 * NEW at 3.548.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS: NO SPELL IN THE SYSTEM HAS EVER DECLARED ITSELF
 * MAGICAL.
 *
 * 3.547.0 taught `resolveDamagePacket` the `magical` flag, so that a
 * creature's `mundane` resistance — twenty Fiends & Fables creatures
 * declare one — halves an ordinary blade and not a spell. The comment
 * written beside the wiring in `damage-workflow.mjs` says so directly:
 * "a spell counts as a magical source against `mundane` resistance, and
 * this is the route spells, Bleeding, Recurring Damage and the manual
 * Apply Damage dialog all take."
 *
 * Measured 10 Sep 2026: `magical` is passed by exactly one caller in the
 * system — the weapon strike, reading a Potency rune. Ten spell damage
 * paths pass nothing, so every one of them defaults to false and a
 * fireball is halved by mundane resistance exactly as a thrown rock is.
 * The flag was built, consumed, documented, and never set. That is the
 * third rule this release found with both ends authored and no middle.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND IT IS THE PLACE THE TWO NEW FACTS BELONG.
 *
 * Graham's rulings, 10 Sep 2026: `area` is "any damage resulting from a
 * spell or effect with an area (such as fireball) rather than a targeted
 * effect"; `targeted` is "any attack that requires an attack roll to hit
 * (weapon or spell)". Both are answered from the spell and the path,
 * once, here — rather than at ten call sites that would each get to
 * decide what "area" means.
 */

/** Splits a comma-separated trait field into normalised words. */
function words(text) {
  return String(text ?? "")
    .split(/[,;]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether a spell has an area.
 *
 * READS `system.area`, THE FIELD THE CARD ALREADY PRINTS FROM — the same
 * string `isArea` is derived from further down cast-workflow, so an area
 * spell cannot be one thing to the card and another to the defences.
 *
 * @param {object} spell
 * @returns {boolean}
 */
export function spellHasArea(spell) {
  return Boolean(String(spell?.system?.area ?? "").trim());
}

/**
 * The traits a spell's damage carries, for the trait-keyed defences.
 *
 * TRADITIONS ARE INCLUDED, and they are the point. `divinity` is both an
 * Appendix 3 sub-trait and one of this system's four traditions, and the
 * two live on different fields: `system.traits` and `system.tradition`.
 * Five undead declare a weakness to `divine`, which Graham ruled means
 * "any damage that results from a divinity spell" — so the weakness can
 * only ever match if the tradition travels with the damage. A creature
 * weak to divinity that shrugged off a Cleric's spell because the word
 * sat on the wrong field would look exactly like a weakness that does
 * not work, which is the failure this whole release is about.
 *
 * @param {object} spell
 * @returns {string[]}
 */
export function spellSourceTraits(spell) {
  return [...new Set([
    ...words(spell?.system?.traits),
    ...words(spell?.system?.tradition)
  ])];
}

/**
 * Everything the damage pipeline needs to know about a spell as a source.
 *
 * Spread straight into a `resolveAgainstDefences` call.
 *
 * @param {object} spell
 * @param {object} [options]
 * @param {boolean} [options.targeted] Did this path make an attack roll?
 *   Supplied by the caller rather than guessed, because it is a fact
 *   about the RESOLUTION and not about the spell: the same spell can be
 *   an attack on one path and a save on another.
 * @returns {{magical: boolean, area: boolean, targeted: boolean, sourceTraits: string[]}}
 */
export function spellDamageSource(spell, { targeted = false } = {}) {
  return {
    // ALWAYS TRUE, with no field to read. Graham's ruling of 10 Sep 2026
    // is that mundane means "non-magical source entirely" and a spell is
    // never that. A `system.magical` field would be a field every spell
    // in the pack would have to set, and the first one that forgot would
    // be a fireball a skeleton shrugs off.
    magical: true,
    area: spellHasArea(spell),
    targeted: Boolean(targeted),
    sourceTraits: spellSourceTraits(spell)
  };
}
