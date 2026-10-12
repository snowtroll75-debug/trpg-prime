/**
 * Assess Tracks (Chapter 5, Druid/Ranger class feat, p.115).
 *
 * NEW at 3.568.0.
 *
 * PRINTED: "You can discern certain details about creatures through their
 * tracks. Prerequisites Survival 10 ranks. Make a Level based Survival
 * check against the creature you are tracking or against their Survival
 * DC, if they are actively covering their tracks. If successful, you
 * learn the creature's base speed plus ONE ADDITIONAL DETAIL FOR EVERY
 * POINT BY WHICH YOUR CHECK EXCEEDS THE DIFFICULTY. The information you
 * gain includes whether a creature has a climb or swim speed, its
 * movement-based feats or traits, and possibly other information such as
 * the creature's diet, size, and obvious supernatural traits (a fire
 * creature, for instance, may scorch the ground when it walks), at the
 * GM's discretion. If you fail the track check, you may retry after an
 * hour of further observation."
 *
 * It was the block-11 audit's only note-only feat: a complete action —
 * two DC sources, a margin-scaled payout and a retry clause — declared in
 * prose and doing nothing. Graham's standing rule: a feat should grant
 * the ability, not just declare it.
 *
 * ───────────────────────────────────────────────────────────────────
 * WHERE THE LINE IS DRAWN, AND WHY IT IS DRAWN THERE.
 *
 * Graham's ruling of 18 September 2026 (R2, first option): the system
 * rolls the check, picks the DC, and prints "base Speed plus N further
 * details" — and leaves WHICH details to the table.
 *
 * The alternative was to read the details off the quarry's sheet, and
 * climb speed, swim speed and size really are all on there. It was
 * declined, and the reason is worth keeping: the printed list ends "and
 * obvious supernatural traits… at the GM's discretion". A system that
 * enumerates the three facts it can see would quietly redefine the rule
 * as those three, because what the card prints is what the table treats
 * as the answer. The count is arithmetic and belongs here; the content is
 * a judgement and does not.
 *
 * SO WHAT THIS MODULE OWES THE CARD IS A NUMBER, and the number has to be
 * right: "one per point by which your check EXCEEDS the difficulty" means
 * a check that exactly meets the DC learns the base Speed and nothing
 * more. Exceeding by one is one detail. That boundary is the whole of the
 * arithmetic and it is the easiest thing in the sentence to get wrong.
 *
 * THE SECOND DC IS A CONDITION, NOT A MAXIMUM. "…or against their
 * Survival DC, IF they are actively covering their tracks" — so the
 * Survival DC applies when that is true and not otherwise. The engine's
 * array form of `against` takes the HIGHER of two DCs (Trip Attack:
 * "whichever is higher"), which is the wrong rule here: a quarry strolling
 * along unawares would still be gated on their Survival DC whenever it
 * happened to be the larger number. So the action declares the level DC
 * and the workflow asks, once, whether they are covering — the same shape
 * as Cover Tracks' own prompt, which is the action on the other side of
 * this one.
 */

/**
 * "you may retry after an hour of further observation."
 *
 * MODULE-LOCAL, and the retry is NOT enforced. The clause is a permission
 * ("you MAY retry"), not a restriction the system has to police: nothing
 * stops a player rolling again, and the honest thing is to say so on the
 * card rather than to build a lockout the book did not ask for. Held as a
 * constant so the note and any future enforcement read one number.
 */
const RETRY_SECONDS = 3600;
const RETRY_HOURS = RETRY_SECONDS / 3600;

/**
 * How many details beyond the base Speed a check earns.
 *
 * MODULE-LOCAL. `assessTracksNote` is its only caller, and an exported
 * rule nobody calls from outside is a well-tested opinion rather than
 * automation (lesson 5.1). The harness checks the arithmetic THROUGH the
 * note — which is the better test anyway, because it proves the number
 * reaches the card rather than merely that it was computed.
 *
 * @param {number} margin The check total minus the DC.
 * @returns {number}
 */
function assessTracksDetails(margin) {
  const over = Math.trunc(Number(margin) || 0);
  // EXCEEDS, not meets. A margin of 0 is a success — the base Speed is
  // still learned — and buys no further detail.
  return over > 0 ? over : 0;
}

/**
 * The line the card prints on a success.
 *
 * NAMES THE COUNT AND HANDS BACK THE CHOICE, which is the whole of R2.
 * The printed list is repeated here rather than left to memory, because
 * the GM reading this card is the person the rule delegates to and they
 * should not have to find the page.
 *
 * @param {number} margin
 * @param {string} [quarry] The creature's name, where one is targeted.
 */
export function assessTracksNote(margin, quarry = "") {
  const details = assessTracksDetails(margin);
  const whose = quarry ? `${quarry}'s` : "the creature's";
  const base = `You learn <strong>${whose} base Speed</strong>`;
  if (!details) {
    return `${base} — and no more: the check met the difficulty without exceeding it.`;
  }
  return `${base}, plus <strong>${details} further detail${details === 1 ? "" : "s"}</strong> `
    + `(one per point of margin). Climb or swim speeds, movement-based feats or traits, diet, `
    + `size, obvious supernatural traits — the GM chooses which, as printed.`;
}

/** The line a failure prints. The retry is a rule, so it is stated. */
export function assessTracksFailureNote() {
  return "You learn nothing from the tracks. You may retry after "
    + `${RETRY_HOURS === 1 ? "an hour" : `${RETRY_HOURS} hours`} of further observation.`;
}

/**
 * Which DC this attempt rolls against.
 *
 * TWO NAMED SOURCES RATHER THAN A BOOLEAN, so the card can say which one
 * was used. "vs DC 18" tells a player nothing about whether the system
 * understood that their quarry was covering their tracks; "vs their
 * Survival DC 18" does.
 *
 * @param {boolean} covering Is the quarry actively covering their tracks?
 * @param {number|null} levelDCValue The quarry's level-based DC.
 * @param {number|null} survivalDCValue The quarry's Survival DC.
 * @returns {{dc: number|null, label: string}}
 */
export function assessTracksDC(covering, levelDCValue, survivalDCValue) {
  const level = Number.isFinite(Number(levelDCValue)) ? Number(levelDCValue) : null;
  const survival = Number.isFinite(Number(survivalDCValue)) ? Number(survivalDCValue) : null;
  if (covering) {
    // A QUARRY WHOSE SURVIVAL DC WE CANNOT READ falls back to the level
    // DC rather than to nothing: "covering their tracks" is a fact about
    // the fiction, and an unreadable sheet should not cancel the action.
    return survival === null
      ? { dc: level, label: "their Level DC (no Survival DC on the sheet)" }
      : { dc: survival, label: "their Survival DC (actively covering their tracks)" };
  }
  return { dc: level, label: "their Level DC" };
}
