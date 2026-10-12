/**
 * BLOCK 34, PART TWO (pages 341–350) — what the pack should hold for the
 * spells 3.612.0 builds.
 *
 * Graham's rulings of 2 October 2026: R4, R6 and R8 "Your recommendation".
 * The audit is claude/audit-pages-341-350.md, section C.
 *
 * WHOLE FIELDS, NOT MERGES — see author-block34-spells.mjs.
 */

/** Every d20 check a held bonus can be spent on: Inspire Heroics' "any check". */
const ANY_CHECK = ["attack", "save", "skill", "specialist", "attribute", "cast", "spellcraft", "initiative"];

export const PLAN = {
  // R4 — "Trigger: You or an ally within range attempts a saving throw." Cast
  // from inside that save; see magic/save-reaction-spells.mjs. Cast from the
  // sheet there is no save to answer, so the card says where it is cast from.
  "Fateful Temptation": {
    effects: [
      { kind: "note", sheetCastOnly: true, text: "Cast in answer to a saving throw: when you or an ally within 120 feet is about to roll one, the save offers Fateful Temptation before the dice — +2 status (+1 per warp, max +5), a Success becomes a Critical and a Failure a Fumble. Cast from here it has no save to answer." }
    ]
  },
  // R4 — "Trigger: You fail (but don't fumble) a saving throw."
  "Lucky Break": {
    effects: [
      { kind: "note", sheetCastOnly: true, text: "Cast in answer to your own failed save: when a save you roll is a Partial or a Failure, the save offers Lucky Break before its result is used — the save is rolled again and the second result stands, and you are then temporarily immune for 10 minutes. Cast from here it has no save to answer." }
    ]
  },

  // R6 — difficult terrain, and an Athletics or Acrobatics check on starting to
  // move through it or entering it during a move. See magic/entry-check.mjs.
  "Web": {
    effects: [
      { kind: "difficultTerrain", target: "area", label: "Web" },
      {
        kind: "entryCheck", target: "area", label: "Web",
        skills: ["athletics", "acrobatics"], clearsWith: "athletics",
        degrees: {
          heroic: { unaffected: true, endsChecksThisTurn: true, clears: true },
          critical: { unaffected: true, endsChecksThisTurn: true, clears: true },
          success: { unaffected: true, clears: true },
          failure: {
            text: "takes a −10-foot circumstance penalty to its Speeds until the start of its next turn",
            rows: [{ kind: "bonus", target: "targets", slot: "allSpeeds", bonusType: "circumstance", value: -10, duration: "until the start of its next turn" }]
          },
          fumble: {
            text: "is immobilised until the start of its next turn, then takes a −10-foot circumstance penalty to its Speeds for 1 round",
            rows: [
              { kind: "condition", target: "targets", condition: "immobilised", duration: "until the start of its next turn" },
              { kind: "bonus", target: "targets", slot: "allSpeeds", bonusType: "circumstance", value: -10, duration: "2 rounds" }
            ]
          }
        }
      },
      { kind: "note", text: "Each space of the web has a DB of 10 and automatically fails saving throws. A single attack or effect dealing at least 5 slashing or 1 fire damage clears a space — remove it from the Region by hand. A creature that breaks free is no longer slowed by the web." }
    ]
  },

  // R8 — the penalty after each failed attack roll or skill check, lasting as
  // long as the save decided; 24 hours of immunity after any save. See
  // magic/false-arrogance.mjs. The page prints five rungs, Partial among them,
  // so Heroic reads as the Critical and Blunder as the Fumble.
  "False Arrogance": {
    effects: [
      { kind: "marker", target: "targets", marker: "falseArrogance", onSave: ["success"], duration: "1 round" },
      { kind: "marker", target: "targets", marker: "falseArrogance", onSave: ["partial"], duration: "1 minute" },
      { kind: "marker", target: "targets", marker: "falseArrogance", onSave: ["failure"], duration: "10 minutes" },
      { kind: "marker", target: "targets", marker: "falseArrogance", onSave: ["fumble"], duration: "24 hours" },
      { kind: "tempImmunity", target: "targets", onSave: ["critical", "success", "partial", "failure", "fumble"], length: "24 hours", label: "False Arrogance" }
    ]
  },

  // R8 — "You and all studied allies in the area may make one skill check each
  // round with advantage." A held advantage that comes back each round, on
  // the composition's membership. The warps widen what it may be spent on.
  "Inspire Heroics": {
    effects: [
      { kind: "heldBonus", target: "targets", heldKind: "advantage", checkTypes: ["skill"], perRound: true, label: "Inspire Heroics" }
    ],
    warps: [
      { ppCost: 4, text: "the spell may also be used with saving throws", mods: { heldChecks: ["save"] } },
      { ppCost: 8, text: "the spell may be used with saving throws & attack checks", mods: { heldChecks: ["save", "attack"] } },
      { ppCost: 12, text: "the spell may be used with any check", mods: { heldChecks: ANY_CHECK } }
    ]
  },

  // R8 — stays at the table; the card now says what to apply.
  "Elemental Fury": {
    effects: [
      { kind: "note", text: "Applied at the table: if your next action is to Cast a Spell from your wizard repertoire that is an invocation dealing acid, cold, electricity or fire damage, foes within 10 feet of you take 1 damage per PP of that spell, of its type (choose one if several), combined with that spell's damage against any foe both affect, before bonuses, penalties, resistance and weakness." }
    ]
  }
};
