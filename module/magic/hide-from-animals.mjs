/**
 * A WARD THAT ENDS THE MOMENT ITS BEARER ACTS.
 *
 * NEW at 3.503.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HIDE FROM ANIMALS (PP 1, 2 AP, touch, 1 creature, 1 minute, Shadow)
 *
 *   "Animals cannot sense the warded creature. Even extraordinary or
 *    supernatural sensory capabilities, such as blindsense, blindsight,
 *    scent, and tremorsense, cannot detect or locate warded creatures.
 *    Animals simply act as though the warded creature is not there. IF A
 *    WARDED CHARACTER TOUCHES AN ANIMAL OR ATTACKS ANY CREATURE, EVEN
 *    WITH A SPELL, THE SPELL ENDS."
 *      +1 PP: per additional target
 *
 * It carried `effects: []`. Its warp was already live (`extraTargets`).
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS AUTOMATED, AND WHY IT IS THE HALF WORTH AUTOMATING.
 *
 * Graham ruled, 5 September 2026: AUTOMATE THE ENDING, NARRATE THE
 * HIDING. There is no perception or detection machinery in this system
 * for "animals cannot sense you" to hook into, and building one would be
 * a far larger release than the spell that asked for it. The GM runs
 * that half, and the effect's own name says so.
 *
 * THE ENDING IS THE HALF A TABLE FORGETS. A ward that should have ended
 * three rounds ago is not a rules dispute anybody notices — it is a
 * player quietly still hidden, and nobody at the table has a reason to
 * check. The two things that end it are gates this system already owns:
 * `rollWeaponAttack` and `castSpell` are each ONE function every route
 * crosses, which is the argument Delayed Respite's damage gate made and
 * Sacrificing Shield's inherited.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "EVEN WITH A SPELL" INCLUDES A SPELL THAT MAKES NO ATTACK ROLL.
 *
 * A spell that forces a save is an attack on a creature in every sense
 * the sentence means; only the die is different. So a cast ends the ward
 * when the spell is an ATTACK or declares a DEFENCE — the same two fields
 * `spellHasNoMechanics` reads to decide whether a spell is mechanical at
 * all, rather than a third opinion about what "hostile" means.
 *
 * AND THE ERROR IS DELIBERATELY POINTED ONE WAY. Ending a ward that the
 * book would have let stand costs a player one minute of a 1 PP spell.
 * NOT ending one the book says is over leaves them hidden from things
 * that can see them, which is the failure nobody notices until it has
 * decided a fight. Between the two, over-ending is the cheaper mistake.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOT BUILT AS A GENERAL "ENDS ON ATTACK" SHAPE, and that was measured
 * rather than assumed. Three other spells in the pack print a sentence
 * about ending near the word attack, and NONE of them is this shape:
 * Mirage Entity and Project Image end when the image IS HIT — the
 * opposite direction — and Delayed Respite's mention is about the blow it
 * is holding. This is a sample of one, so it is named for what it does,
 * the same conclusion `ap-scale.mjs` reached for "1 AP+".
 */

const text = (v) => String(v ?? "").trim();

/** The ward, written on the creature it protects. */
export const HIDE_FLAG = "hideFromAnimals";

/**
 * A Hide From Animals row, or null when it is malformed.
 */
export function normaliseHideFromAnimals(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "hideFromAnimals") return null;
  return { label: text(raw.label) || "Hide From Animals" };
}

/**
 * Does casting this spell end the ward?
 *
 * @param {object} spellSystem the spell's `system`
 */
export function castEndsHiding(spellSystem) {
  if (!spellSystem || typeof spellSystem !== "object") return false;
  if (text(spellSystem.category).toLowerCase() === "attack") return true;
  // A SAVE IS AN ATTACK ON A CREATURE. See the header: only the die is
  // different, and under-ending is the more expensive mistake.
  return Boolean(text(spellSystem.defence));
}

/**
 * What the Region-less ward is called where a GM will see it.
 *
 * THE UNAUTOMATED HALF IS IN THE NAME, the shape difficult-terrain.mjs
 * settled: an effect called "Hide From Animals" tells a GM nothing about
 * whose job the sensing half is.
 */
export function hideEffectName(spec) {
  return `${spec?.label || "Hide From Animals"} (animals cannot sense them — run by hand)`;
}

/** What the cast card says when the ward is placed. */
export function hidePlacedLine(targetName, durationText = "") {
  return `<strong>${targetName}</strong> cannot be sensed by animals${durationText}.`;
}

/**
 * The clauses this spell hands to the table, named on every cast.
 *
 * BOTH HALVES ARE SAID, the unautomated one first. A card that only
 * promised the ending would leave a table assuming the hiding was
 * enforced too.
 */
export function hideRemainderLine() {
  return "<em>Animals — including blindsense, blindsight, scent and tremorsense — simply act "
    + "as though the warded creature is not there; the system does not model senses, so the GM "
    + "runs that half. The ward ends automatically the moment the warded creature attacks "
    + "anything, with a weapon or with a spell. Touching an animal also ends it, and that one "
    + "is the GM's to call.</em>";
}

/** What the card says when the ward ends itself. */
export function hideEndedLine(actorName, reason) {
  return `<strong>${actorName}</strong>'s Hide From Animals ends — ${reason}.`;
}

/** The reason text for each of the two gates. */
export const HIDE_END_REASONS = Object.freeze({
  weapon: "they attacked",
  spell: "they attacked with a spell"
});
