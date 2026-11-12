/**
 * AN ATTACK ROLLED WITH ANOTHER BASE (3.680.0; Eldritch Arts Block 3a, D17).
 *
 * The Dragon birthright's claws: "When attacking with your claws you may use
 * BSB rather than your BAB when determining your attack bonus." A weapon
 * declares `flags.trg-prime.attackBase: "bsb"`; the attack's total already
 * holds the BAB, so this is the difference as one named row, and only when the
 * BSB is the higher ("may").
 *
 * The BSB is the one Spellcraft adds: the class table's column plus the sheet's
 * own (`system.magic.bsb`). Damage is untouched: the BAB's bonus damage dice
 * are a damage rule, and the claws' text speaks of the attack bonus only.
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";

/** The base a weapon declares: "bab" (the default) or "bsb". */
export function attackBaseOf(weapon) {
  const raw = String(weapon?.flags?.[SYSTEM_ID]?.attackBase ?? "").trim().toLowerCase();
  return raw === "bsb" ? "bsb" : "bab";
}

/** The actor's BSB, as Spellcraft counts it. */
function bsbTotal(system) {
  return Math.trunc(Number(system?.magic?.bsb ?? 0) + Number(system?.progression?.bsb ?? 0)) || 0;
}

/**
 * A SPELL ATTACK ON ANOTHER BASE (3.682.0; Eldritch Arts Block 4, D17): the
 * Spellblade's Battle Mage, "You may use your Base Attack Bonus (BAB) in
 * place of your Base Spell Bonus (BSB) when making attack rolls with spells
 * that have the Attack trait." An item or a live effect declares
 * `flags.trg-prime.spellAttackBase: "bab"`; the spell attack's total holds the
 * BSB through Spellcraft, so this is the difference as one named row, for the
 * attack alone (the casting check's degree is untouched), and only when the
 * BAB is the higher ("may").
 *
 * @param {Array<object>} sources the actor's items and applied effects
 * @param {object} system the actor's system data
 * @returns {{label: string, value: number, type: string}|null}
 */
export function spellAttackBaseRow(sources, system, spellData = null) {
  // "WITH SPELLS THAT HAVE THE ATTACK TRAIT" (review): asked when the spell is known.
  // AN ATTACK SPELL IS ONE (3.682.1, live test): the core's spells carry the
  // trait as their category, "attack", and none prints it among its traits,
  // so 3.682.0 laid Battle Mage on nothing but Eldritch Arts' own spells.
  if (spellData && String(spellData.category ?? "").trim().toLowerCase() !== "attack"
    && !String(spellData.traits ?? "").split(/[,;]/).some((t) => t.trim().toLowerCase() === "attack")) return null;
  const declared = (Array.isArray(sources) ? sources : []).some((s) =>
    !s?.disabled && s?.system?.active !== false && String(s?.flags?.[SYSTEM_ID]?.spellAttackBase ?? "").trim().toLowerCase() === "bab");
  if (!declared) return null;
  const bab = Math.trunc(Number(system?.combat?.bab?.total ?? 0)) || 0;
  const bsb = bsbTotal(system);
  if (bab <= bsb) return null;
  return { label: `BAB ${bab} in place of BSB ${bsb}`, value: bab - bsb, type: "untyped" };
}

/** The row an attack with this weapon gains, or null. */
export function attackBaseRow(weapon, system) {
  if (attackBaseOf(weapon) !== "bsb") return null;
  const bab = Math.trunc(Number(system?.combat?.bab?.total ?? 0)) || 0;
  const bsb = bsbTotal(system);
  if (bsb <= bab) return null;
  return { label: `BSB ${bsb} in place of BAB ${bab}`, value: bsb - bab, type: "untyped" };
}
