/**
 * What a Form spell makes you (Chapter 5, the nine Shape Of The… spells).
 *
 * THE GAP THIS CLOSES. Every Shape spell opens with a sentence of the same
 * shape — "You gain the Beast and Polymorph traits", "the Fey & Polymorph
 * traits", "the Aligned (based upon your form) & Polymorph traits" — and until
 * now every one of them was printed on the card and applied to nothing. It was
 * the last of the three pieces deferred in 3.305.0, and it was deferred because
 * natural attacks and the breath weapon both needed a lifecycle first. They
 * have one; this needs a smaller version of it.
 *
 * WHY THESE STRINGS ARE NOT DECORATION — and exactly how far they reach.
 * Graham, 15 Aug 2026, defining what a creature trait is: it "is used to
 * determine if certain effects and spells affect a character. They provide no
 * mechanical modifiers. So if a character gains the animal trait (through a
 * feat or spell) they will be affected by anything that is keyed towards an
 * animal (such as charm animal for example)."
 *
 * So the grant reaches the rules that decide what a spell may touch:
 *
 *   - `kind-targeting.mjs` — Charm Animal reaches a druid in Animal form, and
 *     Charm Kind reaches only creatures of the caster's own type;
 *   - `alignedTraitsOf` decides which aligned damage can harm you, per Chapter
 *     7's "good damage only harms evil creatures" — which Graham confirmed the
 *     same day: "Yes — it's a real trait, treat it as one."
 *
 * And it reaches nothing that hands out a modifier. A druid in Beast form is
 * NOT a Beast for `sharesCreatureType`, which halves the aligned-control level
 * gap: that reads the creature-type item, because a Creature Type is a separate
 * object that "determines a number of core abilities" and changes only when the
 * creature itself does. 3.314.0 got this wrong for one release — the trait line
 * was being read as the type — and it was invisible because every shipped
 * statblock types its type into both places by hand.
 *
 * WHY THE GRANT IS NOT WRITTEN ONTO THE SHEET. `creature-traits.mjs` states the
 * principle for derived immunities — "returned separately rather than written
 * into that field so the sheet keeps showing what a GM actually entered, and a
 * derived immunity can never be accidentally edited away" — and a temporary
 * trait has the same hazard twice over: a caster who opened their sheet mid-form
 * and saved it would make "beast" permanent, and expiry would have to subtract a
 * string from a string. So the grant lives on the granting ActiveEffect as a
 * flag, is folded into a DERIVED `details.grantedTraits` by the actor's own
 * preparation, and `creatureTraits()` unions the two. Nothing has to remove it:
 * the effect ends, the derived field is rebuilt without it, and the trait is
 * gone. No cleanup hook, unlike the granted ITEMS, which cannot be derived.
 *
 * THE APPENDIX PICKS ARE A STOPGAP, AND SAY SO. Seven of the nine spells offer
 * "add a [type] trait (see Appendix, max 3)", and two grant one free besides.
 * That Appendix is not in this project — the Codex Chapter 3 transcription
 * holds the six Codex traits and Appendix 3 holds the eighty-one general ones,
 * and neither is a list of beast traits. Graham chose, 15 Aug 2026, to ship the
 * fixed grants mechanised now and take the picks as free text typed at cast
 * time. So a picked trait is honoured exactly like a printed one — same field,
 * same expiry, same readers — and is recorded as PICKED so that the day the
 * Appendix arrives, a real chooser replaces the prompt and nothing downstream
 * changes.
 */

/**
 * "max 3" — the cap every one of the seven warping options prints.
 *
 * The cap is on the PICKS, not on the grant: a Beast form's own `beast` and
 * `polymorph` are not picks and do not count against it. Stated once here
 * because seven spells repeat it and a second copy is a second thing to get
 * wrong.
 */
export const TRAIT_PICK_MAX = 3;

/**
 * Split a trait string the way the rest of the project does.
 *
 * Separators are comma AND semicolon, matching `prepareTextLists` in the actor
 * document, so a GM who types "swift; keen" at the prompt gets two traits
 * rather than one trait with a semicolon in its name.
 *
 * @param {string} text
 * @returns {string[]} Lowercased, trimmed, deduplicated, order preserved.
 */
export function normaliseTraits(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text ?? "").split(/[,;]/)) {
    const trait = part.trim().toLowerCase();
    if (!trait || seen.has(trait)) continue;
    seen.add(trait);
    out.push(trait);
  }
  return out;
}

/**
 * How many Appendix picks this cast is owed.
 *
 * TWO SOURCES, ADDED. The form itself may grant one outright — Beast's "You
 * gain a single beast trait (see Appendix)" and Eternal's "a single eternal
 * trait" are the only two that do — and each warping option taken adds another.
 * A cast of Shape Of The Beast that takes the +1 PP warp twice is owed three:
 * one printed, two warped. Which is also the cap, and the cap is applied here
 * rather than at the prompt so that a warp taken a fourth time is refused by
 * the rule instead of by the dialog.
 *
 * @param {Array<object>} effects The chosen form's effect set.
 * @param {object|null} warpMods Aggregated warp mods (`traitPicks`).
 * @returns {number} 0…TRAIT_PICK_MAX
 */
export function traitPickCount(effects, warpMods = null) {
  const printed = (Array.isArray(effects) ? effects : [])
    .filter((e) => e?.kind === "trait")
    .reduce((sum, e) => sum + Math.max(0, Math.floor(Number(e.picks) || 0)), 0);
  const warped = Math.max(0, Math.floor(Number(warpMods?.traitPicks) || 0));
  return Math.min(TRAIT_PICK_MAX, printed + warped);
}

/**
 * What the caster actually typed, cut down to what they are owed.
 *
 * Returns the surplus rather than discarding it silently. A player who names
 * four traits when the cast affords three has made a mistake worth telling them
 * about on the card — the alternative is three traits appearing and the fourth
 * vanishing with nothing said, which is the class of silence this project keeps
 * finding at the bottom of its defects.
 *
 * @param {string} typed What was entered at the prompt.
 * @param {number} allowed How many picks this cast is owed.
 * @returns {{picked: string[], surplus: string[]}}
 */
export function resolveTraitPicks(typed, allowed) {
  const cap = Math.max(0, Math.min(TRAIT_PICK_MAX, Math.floor(Number(allowed) || 0)));
  const all = normaliseTraits(typed);
  return { picked: all.slice(0, cap), surplus: all.slice(cap) };
}

/**
 * Every trait one `kind: "trait"` effect confers.
 *
 * The picks are unioned in rather than concatenated: a caster who picks "beast"
 * on a Beast form has picked something they already have, and the form should
 * not report it twice or make expiry ambiguous. The fixed traits lead, because
 * that is the order the spell prints them in.
 *
 * @param {object} effect A `kind: "trait"` effect.
 * @param {string[]} picked Traits chosen at the prompt.
 * @returns {string[]}
 */
export function grantedTraitsFor(effect, picked = []) {
  const fixed = normaliseTraits(effect?.traits);
  const chosen = normaliseTraits(Array.isArray(picked) ? picked.join(",") : picked);
  return normaliseTraits([...fixed, ...chosen].join(","));
}

/**
 * The traits an actor's active effects are currently granting.
 *
 * Reads `appliedEffects` in preference to `effects` — the same pair, in the
 * same order, that every other consumer in this system uses. `appliedEffects`
 * excludes the disabled and the suppressed, which is what makes a GM ticking
 * "disabled" on a form effect take the trait away as they would expect.
 *
 * @param {Actor} actor
 * @returns {string[]}
 */
export function effectGrantedTraits(actor) {
  const source = actor?.appliedEffects ?? actor?.effects ?? [];
  const all = [];
  for (const effect of Array.from(source)) {
    const granted = effect?.flags?.["trg-prime"]?.grantedTraits;
    if (Array.isArray(granted)) all.push(...granted);
    else if (typeof granted === "string") all.push(...normaliseTraits(granted));
  }
  return normaliseTraits(all.join(","));
}
