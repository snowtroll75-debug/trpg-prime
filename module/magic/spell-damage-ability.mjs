/**
 * A SPELL WHOSE DAMAGE ADDS ONE OF THE CASTER'S ABILITIES.
 *
 * NEW at 3.611.0, block 34 (R10, Graham's ruling of 2 October 2026: "Your
 * recommendation"). Pure; no Foundry.
 *
 *   GUIDING STONE (PP 1): "the stone inflicts bludgeoning damage equal to
 *   2d6 plus your melee damage modifier."
 *
 * "Melee damage modifier" is a defined term, page 199: "A melee or thrown
 * attack gains a damage modifier equal to your Strength ability score."
 * So the damage row says `addAbility: "strength"` and the attack spell's
 * roll adds the caster's Strength total, the number a sword would add.
 * No spell formula read an actor value before this; the stone rolled 2d6.
 */

/*
 * AND "YOUR MAGICAL ABILITY SCORE" (3.666.1). Graham, 22 October 2026: "The
 * spell Hurling is not adding magical ability score to its damage."
 *
 *   HURLING (cantrip): "it inflicts 1d6 + magical ability score bludgeoning
 *   damage."
 *
 * The pack carried a note saying the bonus was added by hand. The magical
 * ability is not one fixed ability: it is whichever the CAST rolled its
 * Spellcraft off (a granted tradition's own, an archetype's cantrip's own,
 * an innate spell's own), so the row says `addAbility: "casting"` and the
 * cast hands in the key it used.
 */
const ABILITIES = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);

/** The row's word for "the ability this cast was made with". */
const CASTING = "casting";

/** The ability a damage row adds: a named ability, "casting", or "". */
export function damageAbility(damageRow) {
  const a = String(damageRow?.addAbility ?? "").trim().toLowerCase();
  return ABILITIES.includes(a) || a === CASTING ? a : "";
}

/**
 * The formula with the caster's ability added.
 *
 * @param {string} formula the warped formula
 * @param {object} damageRow the spell's damage row
 * @param {object} casterSystem the caster's `system`
 * @param {string} [castingAbilityKey] the ability this cast used, for a row
 *   that says "casting"; the sheet's own casting ability when not handed in
 * @returns {{formula: string, added: number, ability: string}}
 */
export function withDamageAbility(formula, damageRow, casterSystem, castingAbilityKey = "") {
  const named = damageAbility(damageRow);
  const ability = named === CASTING
    ? [castingAbilityKey, casterSystem?.magic?.castingAbility]
      .map((k) => String(k ?? "").trim().toLowerCase())
      .find((k) => ABILITIES.includes(k)) ?? ""
    : named;
  if (!ability || !formula) return { formula, added: 0, ability: "" };
  const added = Math.trunc(Number(casterSystem?.attributes?.[ability]?.total ?? 0)) || 0;
  if (!added) return { formula, added: 0, ability };
  return { formula: `${formula} ${added < 0 ? "-" : "+"} ${Math.abs(added)}`, added, ability };
}
