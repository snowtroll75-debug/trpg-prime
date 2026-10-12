/**
 * block32-plan — what 3.606.0 writes to the spells pack, as data.
 *
 * Pages 321-330, block 32; Graham's rulings of 29 September 2026 ("R1–R8
 * go with your recommendation"). This release is the first half of R1:
 * the save ladders whose rungs need only small pieces. Spirit Trap and
 * Shroud (R2) are the next release; Spell Drain rides R6 with Spell
 * Turning, because its ladder is a counteract reaction's.
 *
 * DATA, NOT A SCRIPT, so the author tool WRITES it and the harness READS
 * it. The block-31 harness recovered the tool's plan by matching its
 * source with a regular expression; a plan that is imported cannot be
 * misread by one.
 *
 * EVERY ROW BELOW WAS TYPED FROM THE PAGE (rules.docx, TRG Prime 3.8.1),
 * and the page's words are quoted beside the rows that carry them. Page
 * numbers are the ones the book's own spell index prints.
 */

const note = (text, onSave) => (onSave ? { kind: "note", onSave, text } : { kind: "note", text });

export const PLAN = {
  /*
   * SLAY THE SOUL (PP 10, page 325), Fortitude.
   *   Success  unaffected.
   *   Partial  1 essence damage per point of failure and a Serious Critical.
   *   Failure  reduced to 0 HP and gains the Dying condition.
   *   Fumble   the target dies.
   * No Critical rung is printed: a Critical or Heroic reads at Success.
   */
  "Slay The Soul": {
    effects: [
      {
        kind: "saveLadder", target: "targets", damageType: "essence",
        ladder: { success: "", partial: "margin", failure: "", fumble: "" },
        criticalOn: { partial: "serious" },
        dropsToOn: { failure: 0 },
        slaysOn: ["fumble"]
      },
      note("THE PAGE PRINTS NO CRITICAL RUNG. Success is \"unaffected\", so a Critical or "
        + "Heroic save reads there too; a Blunder reads at the Fumble. The Partial's damage is "
        + "one per point the save fell short, so a Partial by 3 is 3 essence and a serious "
        + "critical.")
    ]
  },

  /*
   * SOUL DESTRUCTION (PP 20, page 327), Fortitude, 1 living creature.
   *   Critical  2d10 essence damage.
   *   Success   4d10 Soul Drain and a minor critical.
   *   Partial   6d10 Soul Drain and a serious critical.
   *   Failure   10d10 Soul Drain and a mortal critical.
   *   Fumble    dies, soul destroyed, resurrection impossible (GM discretion).
   *
   * "MORTAL" IS NOT A SEVERITY THIS BOOK DEFINES. The Critical Severity rules name three —
   * minor, serious, deadly — and nothing else uses the word. Authored as
   * DEADLY, the only reading that keeps the rungs rising, and reported to
   * Graham as a term to confirm rather than decided quietly.
   */
  "Soul Destruction": {
    effects: [
      {
        kind: "saveLadder", target: "targets", damageType: "essence",
        ladder: { critical: "2d10", success: "", partial: "", failure: "", fumble: "" },
        criticalOn: { success: "minor", partial: "serious", failure: "deadly" },
        slaysOn: ["fumble"],
        soulDestroyedOn: ["fumble"]
      },
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "4d10",
        label: "Soul Destruction", onSave: ["success"] },
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "6d10",
        label: "Soul Destruction", onSave: ["partial"] },
      { kind: "resource", target: "targets", resource: "soulDrain", formula: "10d10",
        label: "Soul Destruction", onSave: ["failure"] },
      /*
       * THE FUMBLE IS DECLARED, OR IT FALLS UP. With Soul Drain gated on
       * Success, Partial and Failure only, a Fumble has no rung at or below
       * it and `effectiveSaveDegree` hands it the worst printed one — so the
       * creature the ladder had just slain would ALSO take 10d10 Soul Drain.
       */
      note("Fumble: the target dies and its soul is destroyed — Resurrection refuses this "
        + "body, and says so, until the GM lifts it.", ["fumble"]),
      note("\"A MORTAL CRITICAL\" is read as DEADLY — the book defines minor, serious and "
        + "deadly and no fourth severity. Awaiting Graham's word.")
    ]
  },

  /*
   * SOUND BURST (PP 4, page 327), Fortitude — NOT Basic.
   *   Critical  unaffected.
   *   Success   half damage.
   *   Failure   full damage and deafened for 1 round.
   *   Fumble    full damage and a Minor critical.
   * The deafened rows were already right; the damage had never been dealt.
   */
  "Sound Burst": {
    effects: [
      {
        kind: "saveLadder", target: "targets", damageType: "sonic",
        ladder: { critical: "", success: "half", failure: "full", fumble: "full" },
        criticalOn: { fumble: "minor" }
      },
      { kind: "condition", target: "targets", condition: "deafened",
        onSave: ["failure", "fumble"], duration: "1 round" }
    ]
  },

  /*
   * SUNBURST (PP 14, page 333), Basic Reflex. The basic arithmetic stays;
   * the one rider it lacked is the Fumble's.
   *   Fumble  "full damage and becomes blinded permanently."
   */
  "Sunburst": {
    effects: [
      { kind: "condition", target: "targets", condition: "blinded", onSave: ["fumble"],
        duration: "permanent" }
    ]
  },

  /*
   * STARTLE (PP 2, page 331), Will.
   *   Success  unaffected.
   *   Failure  a forced Step action away from you.
   *   Fumble   as failure, and frightened 1.
   */
  "Startle": {
    effects: [
      { kind: "forcedMove", target: "targets", label: "Startle", feet: 5, direction: "away",
        onSave: ["failure", "fumble"] },
      { kind: "condition", target: "targets", condition: "frightened", value: 1,
        onSave: ["fumble"] }
    ]
  },

  /*
   * SNAGGING PIT (PP 4, page 326), Reflex, a 10-foot pit.
   *   Critical  unaffected.
   *   Success   avoids falling in but is stunned 1.
   *   Failure   falls into the pit using the normal falling rules.
   *   Fumble    falls in with no time to use reactions.
   */
  "Snagging Pit": {
    effects: [
      { kind: "condition", target: "targets", condition: "stunned", value: 1,
        onSave: ["success"] },
      { kind: "fall", target: "targets", feet: 10, onSave: ["failure"] },
      { kind: "fall", target: "targets", feet: 10, noReactions: true, onSave: ["fumble"] },
      note("THE AREA IS A 5-FOOT SQUARE, and no area in this system is square yet — the "
        + "backlog item this spell shares with Harrow and Flaming Sphere. So it places no "
        + "template: target whoever is standing on the pit. The warps (+5 feet deep, spikes, a "
        + "10-foot radius) are printed and not yet automated.")
    ]
  },

  /*
   * SPEED (PP 4, page 329). Quickened for a minute; then, "When the spell
   * ends, the target must make a Will Saving Throw."
   *   Critical fatigued 1; Success 2; Failure 3; Fumble 4 and a minor
   *   mental critical.
   */
  "Speed": {
    effects: [
      {
        kind: "condition", target: "targets", condition: "quickened",
        endSave: {
          save: "will", condition: "fatigued",
          values: { critical: 1, success: 2, failure: 3, fumble: 4 },
          criticalOn: { fumble: "minor" }, criticalType: "mental"
        }
      },
      note("The extra action may only be used for Strike or Stride. When the spell ends — "
        + "its minute, a Dismiss, a Dispel, or anything else that takes quickened away — the "
        + "target rolls the Will save automatically and is charged the fatigue it prints.")
    ]
  },

  /*
   * SUGGESTION (PP 8, page 333), Will. A compulsion the table adjudicates,
   * the shape Command and Enchanting Utterance already take: the card
   * names the rung each target reached, and the GM plays it.
   */
  "Suggestion": {
    effects: [
      note("Unaffected — and knows you tried to control it.", ["critical"]),
      note("Unaffected — and thinks you were simply talking to it.", ["success"]),
      note("Follows your suggestion for 1 minute, or until a finite suggestion is complete, or "
        + "it becomes self-destructive or plainly harmful.", ["failure"]),
      note("As failure, but for 1 hour.", ["fumble"]),
      note("An obviously harmful suggestion negates the spell. The suggestion is a sentence or "
        + "two and must sound reasonable — judged at the table.")
    ]
  },

  /*
   * SPEAK WITH DEAD (PP 6, page 328). "An unwilling corpse can attempt a
   * Will saving using its original statistics." The spell carried no
   * `defence`, so no save was ever rolled and none of its four rungs could
   * be reached.
   *   Critical  may deceive or withhold, and HAUNTS YOU FOR A FULL DAY,
   *             preventing any chance of rest or respite.
   *   Success   may ignore your questions or answer falsely.
   *   Failure   answers truthfully, but cryptically.
   *   Fumble    answers truthfully and directly.
   */
  "Speak With Dead": {
    defence: "Will",
    effects: [
      { kind: "marker", target: "self", marker: "haunted", onSave: ["critical"],
        duration: "1 day", note: "(the corpse's spirit)" },
      note("May deceive you or withhold its answers.", ["critical"]),
      note("May ignore your questions or answer them falsely.", ["success"]),
      note("Answers truthfully, but cryptically.", ["failure"]),
      note("Answers truthfully and directly.", ["fumble"]),
      note("A WILLING CORPSE DOES NOT SAVE. The save is rolled for every cast; when the corpse "
        + "is willing, ignore it and play the Fumble rung. Up to three questions; fails if the "
        + "spell was cast on this corpse in the last month.")
    ]
  }
};

/** The fields each spell's plan writes — what the pack-repair manifest must cover. */
export function plannedFields() {
  const out = {};
  for (const [name, fields] of Object.entries(PLAN)) out[name] = Object.keys(fields);
  return out;
}
