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

const ABILITIES = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);

/** The ability a damage row adds, or "". */
export function damageAbility(damageRow) {
  const a = String(damageRow?.addAbility ?? "").trim().toLowerCase();
  return ABILITIES.includes(a) ? a : "";
}

/**
 * The formula with the caster's ability added.
 *
 * @param {string} formula the warped formula
 * @param {object} damageRow the spell's damage row
 * @param {object} casterSystem the caster's `system`
 * @returns {{formula: string, added: number, ability: string}}
 */
export function withDamageAbility(formula, damageRow, casterSystem) {
  const ability = damageAbility(damageRow);
  if (!ability || !formula) return { formula, added: 0, ability: "" };
  const added = Math.trunc(Number(casterSystem?.attributes?.[ability]?.total ?? 0)) || 0;
  if (!added) return { formula, added: 0, ability };
  return { formula: `${formula} ${added < 0 ? "-" : "+"} ${Math.abs(added)}`, added, ability };
}
