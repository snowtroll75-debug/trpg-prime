/**
 * DOES A SPELL'S AREA CATCH THE CREATURE WHO CAST IT?
 *
 * NEW at 3.611.1. Pure; no Foundry.
 *
 * GRAHAM'S RULING, 2 October 2026 (Q1 of the 3.611.0 drive, raised by
 * Waves Of Fatigue catching its own Wizard):
 *
 *   "A spell that is centred on the caster and produces a hostile effect
 *    will not effect the caster. Spells that produce a beneficial do
 *    (unless the description states otherwise). A spell that has a range
 *    (such as fireball) and an area effect will usually catch the caster as
 *    well if they are caught in the radius."
 *
 * So three facts decide it:
 *   - CENTRED ON THE CASTER: the area is drawn around them because the
 *     spell names no range to place it at (a wall is never centred).
 *   - HOSTILE: the spell asks a save or an attack of whoever it catches.
 *     A utility spell is beneficial unless its own text says otherwise —
 *     Devastating Might's "including yourself" is that text, and it is a
 *     utility spell, so it still catches its caster.
 *   - Everything else catches the caster when they stand in it.
 */

/**
 * @param {object} facts
 * @param {boolean} facts.centredOnCaster the template was drawn around the caster
 * @param {string} [facts.defence] the save the spell asks, if any
 * @param {string} [facts.category] the spell's category ("save", "attack", "utility")
 * @returns {boolean} true when the caster is left out of the catch
 */
export function areaSparesCaster({ centredOnCaster = false, defence = "", category = "" } = {}) {
  if (!centredOnCaster) return false;
  const cat = String(category ?? "").trim().toLowerCase();
  const asksSave = String(defence ?? "").trim().length > 0;
  return asksSave || cat === "save" || cat === "attack";
}
