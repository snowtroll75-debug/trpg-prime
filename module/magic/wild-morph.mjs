/**
 * A SPELL THAT GROWS YOU A WEAPON.
 *
 * NEW at 3.493.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WILD MORPH (PP 1, Alteration / Morph, 1 minute)
 *
 *   "You draw upon your Wildshape power, altering a portion of your
 *    physical form. You gain a single natural attack form from one of
 *    your Studied Targets."
 *      +2 PP: You gain an additional natural attack form (max 3).
 *      +2 PP: You instead gain a movement type from one of your Studied
 *             Targets.
 *      +4 PP: instead gain special ability from one of your Studied
 *             Targets.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT A STUDIED TARGET ACTUALLY IS, WHICH DECIDED THE WHOLE DESIGN.
 *
 * `applyStudyOutcome` records one of two shapes:
 *
 *   { name, type: "creature", id }   studied from a token
 *   { name, type: "named" }          typed into a box
 *
 * The second exists because Study Target's own prompt asks "what did you
 * study — a person, place, or thing?", and a place has no statblock. So
 * the spell cannot simply read a creature's attacks: half its subjects
 * are not creatures, and a `creature` entry's id belongs to an actor that
 * may since have been deleted or been an unlinked token.
 *
 * GRAHAM'S RULING, 4 September 2026: pick the Studied Target, name the
 * attack, and get a REAL one. The GM adjudicates what is reasonable for
 * that creature; the system does the part it can actually do, which is
 * put a Strikeable weapon on the sheet and take it away again.
 *
 * WHERE THE CREATURE DOES RESOLVE, its natural attacks prefill the
 * prompt. That is still the ruling — the player names the form — it just
 * stops them retyping "1d6 slashing" for a Claw the system can already
 * see.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO "INSTEAD" WARPS ARE PRINTED, NOT BUILT.
 *
 * "Instead gain a movement type" and "instead gain a special ability"
 * replace the attack with something this system has no general shape for
 * — a speed that is not on the sheet's speed list, an ability that could
 * be anything in the Codex. Building a guess at either would be worse
 * than saying what the book says, so the card carries them and the GM
 * settles them. The +2 PP "additional attack form (max 3)" IS built,
 * because it is the same thing again and only the count changes.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** The most attack forms one casting can grow, warps included. */
export const MAX_MORPH_FORMS = 3;

/** A Wild Morph row, or null when it is malformed. */
export function normaliseWildMorph(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "wildMorph") return null;
  return {
    label: text(raw.label) || "Wild Morph",
    // CAPPED WHERE THE CAP IS PRINTED. "max 3" is the spell's sentence.
    forms: Math.min(MAX_MORPH_FORMS, Math.max(1, int(raw.forms) || 1))
  };
}

/**
 * The item data for one grown attack form.
 *
 * MODELLED ON THE HYBRID BITE that Hybrid Transformation grants, down to
 * the proficiency comment: a created natural weapon without a category
 * would be the only natural attack in the game carrying a -4, because
 * the proficiency engine reads the category and every character is
 * proficient with unarmed attacks.
 *
 * @param {{name: string, damage: string, damageType: string}} form
 * @param {string} sourceName the Studied Target it was drawn from
 * @param {string} castId stamped so the spell can take it away again
 */
export function morphAttackData(form, sourceName, castId) {
  return {
    name: text(form.name) || "Natural Attack",
    type: "weapon",
    img: "icons/creatures/claws/claw-talons-glowing-orange.webp",
    system: {
      damage: text(form.damage) || "1d4",
      damageType: text(form.damageType) || "slashing",
      traits: "finesse, unarmed, brawling",
      attackMode: "melee",
      group: "brawling",
      natural: true,
      equipped: true,
      // See the header: the category is what keeps the proficiency
      // engine from treating a grown claw as an unfamiliar weapon.
      category: "Unarmed",
      proficiency: "simple",
      description: `A natural attack form drawn from ${text(sourceName) || "a Studied Target"} `
        + "(Wild Morph). It lasts as long as the spell."
    },
    flags: {
      "trg-prime": {
        castId: castId ?? null,
        // THE DECLARATION THAT MAKES IT TEMPORARY. Bless Water's Holy
        // Water is also created by a spell and is meant to survive it, so
        // the cleanup removes only what says it should be removed.
        endsWithSpell: true
      }
    }
  };
}

/** What the card says when the form is grown. */
export function wildMorphLine(actorName, formNames, sourceName) {
  const named = formNames.map((n) => `<strong>${n}</strong>`).join(" and ");
  return `${actorName} grows ${named}, drawn from <strong>${sourceName}</strong>.`;
}

/**
 * What the card says when there is nothing to draw from.
 *
 * SAID OUT LOUD rather than applied as nothing. A character who has
 * studied nobody cannot cast this, and the reason is one they can fix.
 */
export function noStudiedTargetLine(spellName) {
  return `<em>${spellName} draws its form from a Studied Target and you have none recorded — `
    + "nothing was grown. Use Study Target first.</em>";
}

/**
 * The clauses this spell does not automate, named on every cast.
 *
 * PRINTED EVERY TIME, not only when the warp is taken, because the
 * warps are alternatives a caster chooses at the moment of casting and
 * the card is where they find out what the choice costs them.
 */
export function wildMorphRemainderLine() {
  return "<em>Warps that replace the attack form — a movement type (+2 PP) or a special ability "
    + "(+4 PP) from a Studied Target — are the GM's to adjudicate; this spell grows attack forms "
    + "only. If the form is one you could not gain while wildshaped into that creature, the "
    + "duration becomes your Wildshape ability's instead.</em>";
}
