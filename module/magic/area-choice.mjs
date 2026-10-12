/**
 * AN AREA WHOSE TARGETS THE CASTER CHOOSES.
 *
 * NEW at 3.479.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SENTENCE, AND GRAHAM'S READING OF IT (3 September 2026).
 *
 *   MISSILE STORM  "YOU MAY TARGET each character in the spells area of
 *                   effect with a massive salvo of Magic Missiles."
 *
 *   "The spell targets characters in the area of effect — 'You may
 *    target...'. So the caster would choose who was affected within the
 *    area and who was not."
 *
 * Driving 3.478.0 is what raised it: the caster stood in his own 50-foot
 * radius, was caught by his own storm, took 47 force and dropped to 0.
 * The area machinery was doing exactly what `areaTargeting: "all"` says,
 * and the spell was still unusable.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS DECLARED PER SPELL, AND THE MEASUREMENT IS WHY.
 *
 * Every area spell in the pack was searched for a printed choice of
 * targets — "you may target", "you choose which", "creatures of your
 * choice", and the rest. **Exactly one matched: Missile Storm.**
 *
 * Turn Undead says "ALL 1st level undead within the spells emanation".
 * Bless catches every ally. Those are not choices, and a blanket picker
 * over every area spell would put a dialog in front of casts the book
 * gives no choice about — turning a rule into a chore and inviting the
 * player to untick something the spell says they cannot.
 *
 * So the field is on the SPELL and it is opt-in. A second spell printing
 * the same clause declares it and gets this for free; everything else is
 * untouched.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE CASTER IS LISTED AND NOT PRE-TICKED.
 *
 * Graham's ruling of 3 September 2026, and it composes two rules that
 * already existed rather than inventing a third:
 *
 *   THE PRINTED DEFAULT is "each character in the area", so everybody
 *   the template caught arrives ticked. A picker that started empty
 *   would make the ordinary cast five clicks.
 *
 *   THE CASTER IS THE EXCEPTION, because `promptTargetSelection` already
 *   settled this for targeted spells and said so out loud: the caster
 *   appears in the list, and "it is NEVER pre-checked: appearing in the
 *   list is the fix, being chosen by default would be a different and
 *   worse bug." The same sentence applies here with more force — here
 *   the consequence of a Continue nobody read is fifty force damage.
 *
 * A caster who genuinely wants to stand in their own storm ticks one
 * box. A caster who presses Continue without reading is never hurt by
 * their own spell, which is the asymmetry worth building in.
 */

/** Where a spell declares that its area is chosen rather than swept. */
export const AREA_CHOICE_FIELD = "areaChoice";

const text = (v) => String(v ?? "").trim();

/**
 * Does this spell let the caster choose who in the area is affected?
 *
 * READ AS A FLAG, NOT AS PROSE. Matching the printed sentence would mean
 * every spell whose description happens to contain "you may" opens a
 * dialog — and the description is where transcription noise lives.
 *
 * @param {object|null} spellData the spell's `system`
 * @returns {boolean}
 */
export function areaIsChosen(spellData) {
  return spellData?.[AREA_CHOICE_FIELD] === true;
}

/**
 * Which of the caught creatures start ticked.
 *
 * @param {Array} caught the actors the template caught, already pruned
 *   by disposition, line of effect and the kind gate
 * @param {string} casterId the casting actor's id
 * @returns {{id: string, name: string, ticked: boolean, isCaster: boolean}[]}
 */
/*
 * ONE ROW PER CREATURE, NOT PER SHEET (3.609.1, the 3.609.0 live test's
 * F5). Rows were keyed by `actor.id`, which two unlinked tokens of one NPC
 * share — so ticking one goblin ticked its twin. The uuid of an unlinked
 * token's actor names that token; a plain object with no uuid (the
 * harness's) still keys by id.
 */
function creatureKey(a) {
  return text(a?.uuid || a?.id);
}

export function areaChoiceRows(caught, casterId) {
  const self = text(casterId);
  return (caught ?? [])
    .filter(Boolean)
    .map((a) => {
      const isCaster = self !== "" && creatureKey(a) === self;
      return { id: creatureKey(a), name: text(a.name), ticked: !isCaster, isCaster };
    });
}

/**
 * The caught list reduced to the ids the caster ticked.
 *
 * AN ID THE CAUGHT LIST DOES NOT CONTAIN IS IGNORED rather than trusted.
 * The chosen set comes back from a dialog, and a dialog is the one place
 * in this workflow where a value can arrive that the area never caught —
 * a stale row, a re-render, a hand-edited form. Filtering the CAUGHT list
 * rather than resolving the ids means the geometry always has the last
 * word, which is the same reason the storm itself never re-asks the
 * canvas who is inside.
 *
 * @param {Array} caught
 * @param {Iterable<string>|null} chosenIds null means "no choice was
 *   made" — the whole caught list, unchanged
 * @returns {Array}
 */
export function applyAreaChoice(caught, chosenIds) {
  const list = (caught ?? []).filter(Boolean);
  if (chosenIds === null || chosenIds === undefined) return list;
  const wanted = new Set([...chosenIds].map(text).filter(Boolean));
  return list.filter((a) => wanted.has(creatureKey(a)));
}

/** What the card says about who the caster left out. */
export function areaChoiceLine(spellName, spared) {
  const names = (spared ?? []).map(text).filter(Boolean);
  if (!names.length) return "";
  // NAMED ON THE RESULT CARD, not only in a notification. Graham's ruling
  // of 15 August 2026 about the kind gate applies unchanged: "the player
  // might not read the note and think the goblin got charmed."
  return `<em>${text(spellName)} spares ${names.join(", ")} — not chosen by the caster.</em>`;
}

/** What the card says when the caster chose nobody at all. */
export function areaChoseNobodyLine(spellName) {
  // NOT A REFUSAL. "You MAY target" permits targeting no-one, and the
  // empty-selection warning (3.450.0, Graham's ruling) has already asked
  // whether that was meant. Saying it plainly is what stops a cast that
  // hit nobody reading as a broken spell.
  return `<em>${text(spellName)} is cast, and the caster targets no-one in the area.</em>`;
}
