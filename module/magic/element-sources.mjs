/**
 * WHAT AN ELEMENT HAS TO BE DRAWN FROM (3.603.0, Graham's R9).
 *
 * Pure; no Foundry.
 *
 * PRINTED, identically, on Energy Bolt (page 236) and Searing Burst
 * (page 313), under "There must be an appropriate element for you to draw
 * upon as follows":
 *
 *   Acid        — Solid or packed earth that you are in contact with.
 *   Cold        — Packed snow or ice. If the air temperature is less than
 *                 -5C you can draw the energy from the air.
 *   Electricity — You must be outdoors and the weather must be overcast.
 *   Fire        — You must be able to draw upon an open flame.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PRINTED ON THE CARD, NOT ENFORCED. GRAHAM'S RULING, 28 September 2026.
 *
 * The system models no weather, no terrain contact and no nearby flames,
 * and a gate built on none of those would either refuse every cast or ask
 * a question with no wrong answer — a click that teaches the player the
 * requirement does not really apply. So the card NAMES the condition the
 * caster has just committed to, and the table judges it: the same
 * treatment Resurrection's gemstones and willing soul get, and for the
 * same reason.
 *
 * WHICH IS WHY THIS FILE IS A TABLE AND NOT A CHECK. There is nothing here
 * to be clever about; the value is that the sentence reaches the card at
 * the moment it becomes relevant instead of living in the book.
 */

const lower = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The source each element must be drawn from.
 *
 * KEYED BY ELEMENT, not by spell, because two spells print it word for
 * word and a third printing it later should not have to repeat it.
 */
const SOURCES = Object.freeze({
  acid: "solid or packed earth that you are in contact with",
  cold: "packed snow or ice — or the air itself, if it is colder than -5°C",
  electricity: "you must be outdoors, and the weather must be overcast",
  fire: "you must be able to draw upon an open flame"
});

/** What this element must be drawn from, or null where the book names none. */
export function elementSource(element) {
  return SOURCES[lower(element)] ?? null;
}

/** Does the book name a source requirement for this element? */
export function hasElementSource(element) {
  return Boolean(elementSource(element));
}

/**
 * What the card says about the source the chosen element needs.
 *
 * SAYS WHOSE JOB IT IS. The line reads as a requirement the table settles,
 * not as something the system has checked — a card that stated the
 * condition flatly would be claiming a fact about a world it cannot see.
 */
export function elementSourceLine(element) {
  const source = elementSource(element);
  if (!source) return "";
  const name = lower(element);
  return `<em>Drawn from ${name}: ${source}. Whether one is at hand is the GM's call.</em>`;
}
