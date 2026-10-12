/**
 * caster-style — who decides whether you memorise.
 *
 * NEW at 3.547.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * Graham, 10 Sep 2026: Enigma "is not working as described."
 *
 * Enigma's text: "You are an Instinctive caster (see Chapter 9) and do
 * not have to memorise your spells during daily preparation. You replace
 * your Class Magical Tradition rules with the following..."
 *
 * Measured on a level-12 Wizard holding the feat: `casterStyle` was
 * still `learned` and `memorisationStyle` still `book`. Of the feat's
 * four promises only the +2 PP per level worked; the instinctive style,
 * the freedom from memorisation, and the entire repertoire — two spells
 * at 1st level, two more each level, swaps from 3rd, two cantrips — were
 * all inert. The repertoire UI is gated on `casterStyle === "instinctive"`
 * and therefore never appeared, so `repertoire.mjs` existed in full and
 * never switched on.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CAUSE WAS A COMMENT STATING A RULE THE PACK DISPROVES.
 *
 * In `documents/actor.mjs`:
 *
 *   "Caster style (Chapter 9: Learned / Instinctive), fixed by the class
 *    exactly as the tradition is. Derived only — no stored field —
 *    BECAUSE NO RULE LETS A CHARACTER CHANGE STYLE WITHIN A CLASS."
 *
 * Enigma is that rule, and it was in the pack when the sentence was
 * written. The line beneath it read the class and nothing else, so
 * nothing a feat did could move it. This is the third defect this month
 * whose root is a confident comment rather than a wrong calculation —
 * the tier gate that "passed untouched" and the action degrees that
 * "never crossed the line" were the other two.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE OVERRIDE IS GENERIC, NOT NAMED.
 *
 * This file does not mention Enigma. Any owned item may declare
 * `system.casterStyle`, exactly as a CLASS already does — the field and
 * its vocabulary already existed, and `grants-workflow` already read it
 * off a class item. Naming the feat here would be the fourth copy of a
 * hard-coded name in this system and would make the next archetype that
 * does the same thing a code change instead of a data change.
 */

/** The two styles Chapter 9 defines. Anything else is ignored. */
export const CASTER_STYLES = Object.freeze(["learned", "instinctive"]);

const clean = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The caster style an owned item declares, or null when none does.
 *
 * TAKES THE ITEMS, NOT THE ACTOR, so a check can drive it without a
 * world — the shape every other rule module in this directory uses.
 *
 * A CLASS IS NOT AN OVERRIDE. The class's own style is the baseline and
 * arrives through `progression`; only something ELSE on the sheet can
 * override it. Reading the class here as well would let the baseline
 * win a race with itself depending on item order.
 *
 * @param {Array<{type: string, system: object}>} items
 * @returns {string|null}
 */
export function declaredCasterStyle(items = []) {
  for (const item of Array.isArray(items) ? items : []) {
    if (item?.type === "class") continue;
    const style = clean(item?.system?.casterStyle);
    if (CASTER_STYLES.includes(style)) return style;
  }
  return null;
}

/**
 * The style this character actually casts with.
 *
 * @param {string} classStyle the style from `progression`
 * @param {Array} items every item on the sheet
 * @returns {string}
 */
export function resolveCasterStyle(classStyle, items = []) {
  return declaredCasterStyle(items) ?? clean(classStyle);
}

/**
 * How this character prepares spells, once the style is settled.
 *
 * AN INSTINCTIVE CASTER MEMORISES NOTHING, and that is not a second
 * ruling — it is what "instinctive" means in Chapter 9, and what
 * Enigma's own sentence says out loud: "do not have to memorise your
 * spells during daily preparation." So the memorisation style is
 * DERIVED from the caster style rather than being a second field an
 * override has to remember to set. Two fields that must agree are two
 * fields that will one day disagree.
 *
 * @param {string} classMemorisation the style from `progression`
 * @param {string} casterStyle the RESOLVED caster style
 * @returns {string} "list", "book", or "" for no memorisation at all
 */
export function resolveMemorisationStyle(classMemorisation, casterStyle) {
  if (clean(casterStyle) === "instinctive") return "";
  return String(classMemorisation ?? "");
}

/**
 * Is this character an instinctive caster?
 *
 * One place asks the question so the Magic tab, the memorisation
 * workflow and the repertoire card cannot disagree about the answer.
 */
export function isInstinctiveCaster(casterStyle) {
  return clean(casterStyle) === "instinctive";
}
