/**
 * A SPELL THAT SETS THE DC OF SOMEBODY ELSE'S CHECK.
 *
 * NEW at 3.491.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SILENT BINDING (PP 1, Cleric, Warding, Fortitude, duration varies)
 *
 *   "You impose a binding silence upon the target… its whispers are
 *    muffled, making them inaudible to creatures more than 10 feet away
 *    without a successful Perception check AGAINST YOUR SPELL DC. This
 *    also interferes with auditory and linguistic effects, as well as
 *    communication.
 *      Critical  The target is unaffected.
 *      Success   The duration is 1 round.
 *      Failure   The duration is 1 minute.
 *      Fumble    The duration is 10 minutes."
 *
 * The pack shipped it with `effects: []`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A CONDITION.
 *
 * There is no Muffled condition. The word appears twice in the whole
 * rulebook — here, and in an unrelated wild-magic table row — and
 * Appendix 2 does not list it. "Auditory" and "linguistic" are TRAITS,
 * not conditions: the book's own Create a Diversion says an action
 * "gains the auditory and linguistic traits".
 *
 * Inventing a condition to carry this would put a word on the character
 * sheet the rulebook never prints, which is the argument `markers.mjs`
 * already made for Stabilise and which holds just as well here.
 *
 * A MARKER IS ALSO WRONG, for the opposite reason: a marker exists to be
 * READ by a named subsystem, and `verify-markers` refuses one with no
 * reader. There is no reader to write. Both of this system's Perception
 * actions — Awareness and Search — are declared `against: "none"`,
 * because the GM sets their difficulty. That is the rule, not a gap.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO WHAT IS AUTOMATED IS THE NUMBER, AND THAT IS NOT NOTHING.
 *
 * The spell's mechanical content is a DC. Left as prose, every table
 * works out "your spell DC" by hand, at the moment somebody tries to
 * overhear, from a caster who may since have been weakened. Carried
 * here, it is computed once at the cast, printed on the card, and sits
 * on the target's Effects tab where anyone can read it — alongside a
 * duration that expires by itself.
 *
 * WHAT IS NOT AUTOMATED IS SAID ON THE CARD rather than left to be
 * discovered: whether a given listener is close enough, and what
 * "interferes with auditory and linguistic effects" costs them, stay
 * with the GM.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS BUILT FOR ELEVEN SPELLS, NOT FOR ONE.
 *
 * Graham's ruling, 4 September 2026, on the measurement rather than on
 * the spell: eleven silent spells from PP 1 to PP 16 publish a DC for
 * somebody else's check, and they differ only in which check and by how
 * much.
 *
 *   PP 1  Silent Binding          Perception, to overhear
 *   PP 2  Pass Without Trace      Survival, to track — "whichever is higher"
 *   PP 2  Rope Trick              Escape
 *   PP 4  Lock                    Thievery, to unlock — spell DC +5
 *   PP 6  Disgrace                Will, to cooperate
 *   PP 6  Resonance Manipulation  Perception or Sense Motive
 *   PP 6  Spirit Mark             counteract
 *   PP 6  Tree Shape              Nature or Survival
 *   PP10  Inner Sanctum           —
 *   PP14  Volcanic Inferno        Escape
 *   PP16  Punishing Winds         Athletics or Acrobatics
 *
 * Hence `offset` (Lock's +5), `atLeast` (Pass Without Trace's "whichever
 * option is higher") and a free-text `check` rather than an enumeration:
 * the book names eight different checks across eleven spells and will
 * name more.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/**
 * A DC-threshold row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 */
export function normaliseDCThreshold(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "dcThreshold") return null;

  const check = text(raw.check);
  // THE CHECK IS THE WHOLE POINT. A threshold that does not say what it
  // is a threshold FOR is a number on a sheet nobody can act on.
  if (!check) return null;

  return {
    check,
    // Lock: "the DC to unlock it … is equal to your spell DC +5".
    offset: int(raw.offset),
    // Pass Without Trace: "+4 status bonus, or … equal to your spell DC,
    // whichever option is higher". A floor the published DC never falls
    // below, rather than a second number the table has to compare.
    atLeast: raw.atLeast === undefined || raw.atLeast === null ? null : int(raw.atLeast),
    // "inaudible to creatures more than 10 feet away" — who the
    // threshold applies to. Null when the spell puts no distance on it.
    withinFeet: raw.withinFeet === undefined || raw.withinFeet === null
      ? null : Math.max(0, int(raw.withinFeet)),
    // THE PRINTED SENTENCE, carried rather than paraphrased. This is
    // what the GM adjudicates with, and a summary of it would be this
    // system putting words in the book's mouth.
    text: text(raw.text)
  };
}

/**
 * The DC this threshold publishes.
 *
 * COMPUTED AT THE CAST AND THEN FIXED. The same reasoning `emanation`'s
 * `saveDC` records: a caster who is later weakened, polymorphed or
 * killed does not make their standing spell easier to beat.
 *
 * @param {object} spec a normalised row
 * @param {number} spellDC the caster's spell DC for this cast
 */
export function thresholdDC(spec, spellDC) {
  const base = int(spellDC) + int(spec?.offset);
  return spec?.atLeast === null || spec?.atLeast === undefined
    ? base
    : Math.max(base, int(spec.atLeast));
}

/** What the card says when the threshold lands. */
export function thresholdLine(spec, spellName, targetName, dc) {
  const reach = spec.withinFeet === null
    ? ""
    : ` beyond ${spec.withinFeet} ft`;
  return `<strong>${targetName}</strong>: ${spellName} sets a <strong>${spec.check} DC ${dc}</strong>`
    + `${reach}.`;
}

/**
 * The printed sentence, and an honest note about what it does not do.
 *
 * SAID EVERY TIME. The number is automated and the adjudication is not,
 * and a card that printed only the number would invite a table to
 * believe the rest was handled — which is the "automation that is really
 * a reminder" failure inverted, and just as misleading.
 */
export function thresholdRemainderLine(spec) {
  if (!spec.text) return null;
  return `<em>${spec.text} The DC is computed and carried; whether a given creature is `
    + "close enough, and what else the effect impedes, are the GM's call.</em>";
}
