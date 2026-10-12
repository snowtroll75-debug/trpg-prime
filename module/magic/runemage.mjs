/**
 * runemage — the Symbol component.
 *
 * NEW at 3.546.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * "You replace all non-somatic components with a new component called
 * Symbol."
 *
 * Only the ARITHMETIC of this feat was ever built. `casting-dc.mjs`
 * carries the -1 casting DC, the +1 save DC and the +2 defensive clause,
 * and they work. The sentence those three bullets hang off — the
 * replacement itself — was never implemented anywhere.
 *
 * Measured, 10 Sep 2026: `componentGate` answers identically for a
 * Runemage and for a caster with no feat at all. A Runemage with no
 * Material Component Pouch is refused a material spell, exactly as
 * before, and 647 of the 692 spells in the pack carry at least one
 * non-somatic component. The feat's headline clause did nothing to any
 * of them.
 *
 * The feat was DETECTED IN TWO PLACES, both inline, both in
 * cast-workflow, and both only for the DC. This module is the third
 * reader, so the question "is this caster a Runemage" is answered once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 10 September 2026.
 *
 * SYMBOL NEEDS A FREE HAND — every spell, not only the ones that used to
 * be somatic. "You must have room to draw the rune for a spell (in the
 * air or otherwise)", and a rune is drawn with something. A Runemage
 * whose hands are both full casts nothing at all, where before a
 * verbal-only spell would have got through.
 *
 * AND A CASTING FOCUS DOES NOT SATISFY IT. This is the part worth
 * recording, because it is the one place Symbol is STRICTER than the
 * somatic rule it replaces: a held focus stands in for somatic gestures
 * (Chapter 9) and does not stand in for drawing a rune. Chosen
 * deliberately over the variant where it does.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ROOM TO DRAW IS PRINTED, NOT ENFORCED. Whether there is space to draw
 * a rune is a fact about the fiction — a grapple, a coffin, a crowded
 * rank — and nothing in this system knows it. It goes on the card as a
 * sentence the table can act on, the same position Magic Stone's
 * Disruptive trait takes. Saying it out loud is what stops an
 * unimplemented rule from looking like a working one.
 */

/** The component every non-somatic component becomes. */
export const SYMBOL_COMPONENT = "symbol";

/** The components Symbol replaces. Somatic is conspicuously absent. */
export const REPLACED_COMPONENTS = Object.freeze(["verbal", "material", "focus"]);

/**
 * Is this caster a Runemage?
 *
 * TAKES THE NAMES, NOT THE ACTOR, so the harness can ask without a
 * world — the same shape `naturalCastingWaives` takes for the feat
 * beside it in the component gate.
 *
 * @param {string[]} featNames every feat/ability name the actor owns
 * @returns {boolean}
 */
export function isRunemage(featNames = []) {
  return (Array.isArray(featNames) ? featNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === "runemage");
}

/**
 * The components a spell effectively has once Symbol has replaced the
 * non-somatic ones.
 *
 * REPLACED, NOT REMOVED. Symbol is a component in its own right — it is
 * what carries the free-hand requirement and the DC changes — so a spell
 * that was verbal-only does not become componentless, which would have
 * made it EASIER to cast than the book allows.
 *
 * @param {object} components the spell's `system.components`
 * @param {boolean} runemage
 * @returns {object} a new component map
 */
export function symbolComponents(components = {}, runemage = false) {
  const base = { ...(components ?? {}) };
  if (!runemage) return base;
  let replaced = false;
  for (const key of REPLACED_COMPONENTS) {
    if (base[key]) { base[key] = false; replaced = true; }
  }
  // A SPELL WITH NO COMPONENTS AT ALL GAINS NOTHING. There is nothing to
  // replace, so there is no rune to draw and no hand to free — an innate
  // or componentless effect is not dragged into the feat's requirements
  // by having been cast by a Runemage.
  if (replaced) base[SYMBOL_COMPONENT] = true;
  return base;
}

/**
 * Does this cast need a free hand?
 *
 * ONE QUESTION, ONE ANSWER, for the reason the workflow's own comment
 * gives about the degree: two places deciding this would disagree the
 * first time either moved.
 *
 * @param {object} components components AFTER symbolComponents
 * @returns {boolean}
 */
export function needsFreeHandFor(components = {}) {
  return Boolean(components?.somatic || components?.[SYMBOL_COMPONENT]);
}

/**
 * Does a held Casting Focus satisfy this cast's hand requirement?
 *
 * NO, WHEN A SYMBOL IS BEING DRAWN. Graham's ruling: the focus stands in
 * for somatic gestures and not for a rune. So a spell that needs a hand
 * ONLY because it is somatic may use the focus; one that needs a hand
 * because of Symbol may not, whatever else it declares.
 *
 * @param {object} components components AFTER symbolComponents
 * @returns {boolean}
 */
export function focusSatisfiesHand(components = {}) {
  return !components?.[SYMBOL_COMPONENT];
}

/** What the card says about the rune nothing can check. */
export function symbolRoomLine(components = {}) {
  if (!components?.[SYMBOL_COMPONENT]) return null;
  return "<em>Symbol — you must have room to draw the rune (in the air or otherwise). "
    + "The table decides whether you do.</em>";
}

/**
 * The component words a card should print, in the book's order.
 *
 * SO THE PLAYER CAN SEE THE FEAT WORKED. A card still reading "Verbal,
 * Material" on a Runemage's spell is indistinguishable from the feat
 * being broken — which it was, for as long as nothing replaced anything.
 *
 * @param {object} components components AFTER symbolComponents
 * @returns {string[]}
 */
export function componentWords(components = {}) {
  const order = ["verbal", "somatic", "material", "focus", SYMBOL_COMPONENT];
  return order
    .filter((k) => components?.[k])
    .map((k) => k.charAt(0).toUpperCase() + k.slice(1));
}
