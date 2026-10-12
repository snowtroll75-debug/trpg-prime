/**
 * block32b-plan — what 3.606.0 writes to the spells pack, as data.
 *
 * The second half of block 32's R1 (Spirit Trap) and all of R2 (Shroud).
 * See tools/block32-plan.mjs for why a plan is data the harness imports.
 * Page numbers are the ones the book's own spell index prints.
 */

const note = (text) => ({ kind: "note", text });

export const PLAN = {
  /*
   * SPIRIT TRAP (PP 2, page 330), Will, 1 creature, 1 minute.
   *   Critical  unaffected.
   *   Success   all terrain difficult to the target; a new save at the
   *             beginning of their next turn.
   *   Failure   cannot move more than 5 feet from their current location;
   *             they may make a new save at the beginning of their next turn.
   *   Fumble    as failure, for the duration, with no further save.
   */
  "Spirit Trap": {
    effects: [
      {
        kind: "movementBind", target: "targets", label: "Spirit Trap", save: "will",
        rungs: {
          critical: {},
          success: { difficult: true, resave: true },
          failure: { leashFeet: 5, resave: true },
          fumble: { leashFeet: 5 }
        }
      },
      note("THE NEW SAVE RE-READS THE WHOLE LADDER. Apocalypse prints the same sentence and "
        + "there a fresh save plainly re-runs its rungs, so here the degree rolled at the start "
        + "of the creature's turn picks the next round's rung: a Critical frees it, a Success "
        + "means heavy ground, a Failure a 5-foot leash from where it now stands, and a Fumble "
        + "locks the leash for the rest of the minute."),
      note("NO SHADOW, NO TRAP. The spell fails outright on a creature that casts no shadow, and "
        + "ends if the creature is ever entirely in an area with no illumination — both judged "
        + "at the table; end it from the Spellcasting panel.")
    ]
  },

  /*
   * SHROUD (PP 2, page 325), 1 creature, 10 minutes.
   *   "The target perceives light as two steps lower than it actually is …
   *    The shroud also provides the target a +2-circumstance bonus to saving
   *    throws against light effects. … if the creature is unwilling, it can
   *    attempt an Acrobatics check to avoid the shroud and reduce the effect.
   *      Critical  The target is unaffected
   *      Success   The effect lasts for 1 round
   *      Failure   The effect lasts its normal duration."
   */
  "Shroud": {
    effects: [
      {
        kind: "skillLadder", label: "Shroud", skills: ["acrobatics"],
        candidates: "targets", governs: true,
        purpose: "to avoid the shroud",
        prompt: "Tick any target that is UNWILLING; each rolls Acrobatics to avoid the shroud. "
          + "Anyone left unticked accepts it for its full duration.",
        nobody: "no target resisted — each is shrouded for the full duration.",
        judged: "Judged at the table: whether a target is willing. A creature sensitive to light "
          + "may well welcome it.",
        degrees: {
          critical: { text: "avoids the shroud entirely", unaffected: true },
          success: { text: "is shrouded for <strong>1 round</strong>", duration: "1 round" },
          failure: { text: "is shrouded for the full duration" }
        }
      },
      { kind: "lightPerception", target: "targets", steps: -2, label: "Shroud" },
      {
        kind: "conditional", label: "Shroud", target: "targets",
        grants: [{
          kind: "modifier", value: 2, type: "circumstance", label: "Shroud",
          scope: "saving throws against light effects",
          when: { checkTypes: ["save"], traits: ["light"] }, auto: true
        }]
      }
    ]
  }
};

/** The fields each spell's plan writes — what the pack-repair manifest must cover. */
export function plannedFields() {
  const out = {};
  for (const [name, fields] of Object.entries(PLAN)) out[name] = Object.keys(fields);
  return out;
}
