/**
 * A FORM'S OWN SPEEDS, WHICH REPLACE YOURS (3.595.0).
 *
 * Graham, 26 September 2026, R2 of block 31: *"Your Recommendation"* —
 * build it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWENTY-FIVE FORMS PRINTED A SPEED AND GRANTED NONE.
 *
 * Every form in the nine Shape Of The … spells carries its movement in a
 * `note`: *"Air: Fly 60 ft. Hover"*, *"Cave: Speed 30 ft., Burrow 20 ft.,
 * Climb 20 ft."*. The sheet got nothing. A druid in dragon form with a
 * printed Fly 60 could not fly, and a bulwark plant form whose Speed is
 * 20 moved at whatever the character's own legs did.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT `speedGrant`, WHICH ALREADY EXISTS.
 *
 * `speedGrant` gives a creature a speed it LACKS, as an ability item, and
 * `grantedSpeedBase` treats its figure as a floor — Fly's "equal to its
 * land Speed or 20 feet, whichever is greater". That is right for Fly and
 * wrong for a form: page 316's Form Spells sidebar says the form's
 * abilities *"replace any existing physical abilities you already have"*.
 * A form printing Speed 25 must SLOW a character whose own Speed is 30,
 * and a floor can only ever raise.
 *
 * So the non-land speeds a form adds are still `speedGrant` rows — a
 * creature that could not fly gains a fly speed — and the figure the form
 * REPLACES is this: an override of the stored base, at priority 30, for
 * `hulking-form.mjs`'s reason. The typed bonus pools are untouched, so a
 * status bonus to Speed still adds to the form's figure rather than to the
 * one the character left behind.
 *
 * ONE FORM IN TWENTY-FIVE PRINTS NO LAND SPEED AT ALL — Shape Of The
 * Elemental's Air, whose only line is "Speed: Fly 60 ft." Authored as
 * land 0 and flown, because that is what the page prints and because an
 * air elemental that walks is the stranger reading; recorded here because
 * it is the one figure in the family that is an interpretation rather
 * than a transcription.
 */

const SETTABLE = Object.freeze(["land", "fly", "swim", "climb", "burrow"]);
const int = (v) => Math.trunc(Number(v) || 0);

/**
 * A speed-set row, or null when it names no speed this system has.
 *
 * ZERO IS A REAL FIGURE HERE, unlike `speedGrant`, where a grant of
 * nothing is not a grant: "this form has no land Speed" is exactly what
 * Air prints, and refusing it would silently leave the character walking.
 *
 * @param {object} raw the effect row
 * @returns {{key: string, feet: number}|null}
 */
export function normaliseSpeedSet(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = String(raw.key ?? "").trim().toLowerCase();
  if (!SETTABLE.includes(key)) return null;
  return { key, feet: Math.max(0, int(raw.feet)) };
}

/**
 * The item payload that carries a replaced speed into the derivation.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT AN ACTIVEEFFECT CHANGE, AND THE LIVE DRIVE IS WHY (3.595.1).
 *
 * The first version of this file wrote an override of
 * `system.combat.movement.land.base` at priority 30, on `hulking-form`'s
 * reasoning about the size field. It worked on paper and broke the sheet.
 *
 * Graham's world carries 22 race-item effects written in the PRE-POOLING
 * spelling — `system.combat.movement.land` set to the bare number 30 —
 * which `normaliseMovement` has quietly coerced into a pool ever since
 * 3.412.0. Two changes to one node then race:
 *
 *   • the race applied after ours: the form's figure is overwritten, and
 *     the character walks at their own Speed in a dragon's body;
 *   • the race applied FIRST: our change throws *"Cannot create property
 *     'base' on number '30'"* — and an exception inside effect application
 *     ABORTS THE WHOLE PREPARATION. Measured in Graham's world: the land
 *     pool was left as `{base: 35}` with no total, the fly grant the same
 *     cast had just created was never read, and every rule downstream of
 *     movement in `prepareDerivedData` silently did not run.
 *
 * Losing the speed would have been a bug. Aborting the derivation is a
 * broken character sheet, and it happened on the first cast.
 *
 * So a replaced speed travels the way a GRANTED one does — as an ability
 * item the derivation reads — and is applied inside `resolveMovement`,
 * where every other movement rule already lives. Nothing writes a
 * sub-key of a node somebody else may have replaced with a number.
 *
 * @param {object} spec the effect row
 * @returns {{key: string, feet: number}|null}
 */
export function speedSetDerive(spec) {
  return normaliseSpeedSet(spec);
}

/** What the card says. */
export function speedSetLine(name, spec, shownFeet) {
  const set = normaliseSpeedSet(spec);
  if (!set) return "";
  const feet = Number.isFinite(Number(shownFeet)) ? int(shownFeet) : set.feet;
  if (set.key === "land" && feet === 0) {
    return `<strong>${name}</strong> has <strong>no land Speed</strong> in this form.`;
  }
  return `<strong>${name}</strong>&rsquo;s ${set.key === "land" ? "Speed" : `${set.key} Speed`} `
    + `is <strong>${feet} ft.</strong> in this form &mdash; the form's own figure, in place of `
    + "the character's.";
}

/*
 * NOTHING IS EXPORTED BUT THE THREE FUNCTIONS. `SETTABLE` was exported as
 * `SETTABLE_SPEEDS` for one hour and `verify-rules-have-callers` refused
 * it: an exported constant with no caller outside its own file is a claim
 * that somebody needs it. The list is the rule's business, and a caller
 * that wants to know whether a key is settable asks `normaliseSpeedSet`.
 */
