/**
 * WHEN THE SAVE NET IS WIDER THAN THE AREA.
 *
 * NEW at 3.488.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOOLS RICHES (PP 1, Cleric, Shadow, Will, sustained up to 1 minute)
 *
 *   Area: 5-foot burst
 *   "Any creature within 20 feet OF THE AREA … must make a Will saving
 *    throw. A creature that ENTERS the area automatically recognizes the
 *    illusion and is not at risk of becoming fascinated."
 *
 * Two radii in one spell, pulling in opposite directions. The 5-foot
 * burst is the ILLUSION — the pile of shimmering treasure — and standing
 * in it is what makes you immune. The 20 feet is the SAVE NET, and it is
 * the number that decides who rolls.
 *
 * Every area spell in this system until now has had one radius doing both
 * jobs, so the gather has always been "who is inside the template". Left
 * alone, Fools Riches would have caught only creatures standing in a
 * single 5-foot square — the exact creatures the spell says are IMMUNE —
 * and it would have looked like it worked.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE TEMPLATE IS NOT SIMPLY MADE 20 FEET.
 *
 * That was the cheap fix and it throws away a fact. "5-foot burst" is
 * what the book prints on the stat line, `verify-spell-book-fields` holds
 * the pack to it, and the illusion really is five feet across — the
 * clause about entering it is unbuildable once the drawn shape is a
 * twenty-foot circle. So the template stays the illusion, and the net is
 * declared separately, on the effect that needs it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 4 September 2026: **20 feet from the centre**, not 25.
 *
 * "Within 20 feet of the area" read strictly would mean twenty feet
 * measured from the burst's EDGE — a 25-foot net. Graham ruled the looser
 * reading: twenty feet from where you put it, measured the way every
 * other radius in this system is measured, and the number the book
 * actually prints is the number on the table.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * The widest declared save net across a spell's effects, or null.
 *
 * READ FROM THE EFFECTS, not from a new field on the spell. A spell's
 * `system` schema is defined in template.json and held against the book;
 * an effect row is free-form data authored per spell, which is where
 * every other per-spell mechanism in this system already lives. The net
 * belongs to the effect that needs it.
 *
 * THE WIDEST WINS if more than one row declares one, because the net
 * decides who is ASKED to save — and a creature that must roll for one
 * of a spell's effects has to be in the list before any of them can
 * reach it. Taking the narrowest would silently drop it from both.
 *
 * @param {object} spellData a spell's `system`
 * @returns {number|null} feet, or null when no row declares a net
 */
export function declaredSaveNetFeet(spellData) {
  const rows = Array.isArray(spellData?.effects) ? spellData.effects : [];
  let widest = null;
  for (const row of rows) {
    const feet = int(row?.catchRadiusFeet);
    if (feet <= 0) continue;
    if (widest === null || feet > widest) widest = feet;
  }
  return widest;
}

/**
 * What the card says about the widened net.
 *
 * SAID OUT LOUD, because the drawn template and the creatures caught will
 * not agree, and a player looking at a five-foot circle with four saves
 * rolling against it deserves to be told why rather than left to assume
 * a bug. This is the Stone Shield rule: a reach that is not the obvious
 * one names itself on the card.
 */
export function saveNetLine(spellName, netFeet, areaText) {
  const area = String(areaText ?? "").trim();
  const drawn = area ? ` &mdash; the ${area} is the illusion itself` : "";
  return `<em>${spellName} tests every creature within ${int(netFeet)} ft of the area${drawn}.</em>`;
}
