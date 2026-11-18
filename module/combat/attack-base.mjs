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

/** The base a weapon declares: "bab" (the default), "bsb" or "spellcraft". */
export function attackBaseOf(weapon) {
  const raw = String(weapon?.flags?.[SYSTEM_ID]?.attackBase ?? "").trim().toLowerCase();
  return raw === "bsb" || raw === "spellcraft" ? raw : "bab";
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

/**
 * AN ATTACK ROLLED ON SPELLCRAFT (3.698.1; Flame Blade, Graham's ruling U12).
 *
 * "You wield this blade-like beam as if it were a scimitar using your
 * Spellcraft bonus at -2 for your AB." The weapon declares
 * `flags.trg-prime.attackBase: "spellcraft"` and `attackAdjust: -2`. Not a
 * "may" like the Dragon's claws: the blade has no attack bonus of its own,
 * so the row is taken whether it helps or hurts.
 *
 * THE ATTACK'S TOTAL ALREADY HOLDS THE ATTACK BONUS, and with it whatever
 * ability swap the strike made (Finesse, a declared ability), so `inPlaceOf`
 * is that whole number; the row is the difference, named on the card. What
 * the strike adds afterwards (the multiple attack penalty, circumstance,
 * conditions, the weapon's own quality) still applies.
 *
 * Pure.
 *
 * @param {object} weapon the weapon item (or its data)
 * @param {object} system the actor's system data
 * @param {number} inPlaceOf the attack bonus the strike would otherwise use
 * @returns {{label: string, value: number, type: string}|null}
 */
export function spellcraftAttackRow(weapon, system, inPlaceOf) {
  if (attackBaseOf(weapon) !== "spellcraft") return null;
  const adjust = Math.trunc(Number(weapon?.flags?.[SYSTEM_ID]?.attackAdjust ?? 0)) || 0;
  const spellcraft = Math.trunc(Number(system?.magic?.spellcraft?.total ?? 0)) || 0;
  const ab = Math.trunc(Number(inPlaceOf ?? 0)) || 0;
  const signed = adjust ? ` ${adjust > 0 ? "+" : "\u2212"}${Math.abs(adjust)}` : "";
  return {
    label: `Spellcraft ${spellcraft}${signed} in place of attack bonus ${ab}`,
    value: spellcraft + adjust - ab,
    type: "untyped"
  };
}
