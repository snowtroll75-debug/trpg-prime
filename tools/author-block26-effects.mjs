#!/usr/bin/env node
/**
 * Block 26, the second authoring pass: R3, R4 and R6.
 *
 * Graham's rulings, 24 September 2026. The first pass
 * (author-block26-spells.mjs) authored R1's eleven ladders, R2's double
 * save, R5's duration and R7's seven warps. This one authors the work
 * that needed machinery built first.
 *
 * IDEMPOTENT: every edit REPLACES the field it owns. The warp edits use
 * `mods: { ... }` outright rather than spreading the existing object,
 * which is the bug block 25 shipped and block 26's first script records.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS BUILT FOR THIS, AND WHY EACH ONE IS A RULE MODULE.
 *
 *   magic/death-knell.mjs       R3 — rungs that move hit points on both
 *                               sides of the table, and kill outright.
 *   magic/spell-pending.mjs     R4 — a rung made of advantage, with the
 *   pending-modifiers.mjs       swing channel it needed.
 *   conditionals.mjs            R4 — `oneShot`, so Clarity is spent by
 *                               being used instead of by being asked to.
 *   magic/granted-ability.mjs   R6 — Darkvision, granted from the pack
 *                               entry rather than redefined.
 *   conditions/suppression.mjs  R6 — a choice between options that do
 *                               not share an amount, and a complete
 *                               ignore that is not a large number.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY LEFT AS A NOTE, so a later reader does not think
 * it was forgotten:
 *
 *   Decursive Veil's "immune to insight spells of PP 2 or lower" —
 *     there is no PP-threshold immunity rail, and inventing one for a
 *     single spell would be a key nothing else can reach.
 *   Disgrace's "cooperative actions require a Will save" and
 *     "attempts to bolster Charisma automatically fail" — both are
 *     triggers on another creature's action, with no hook to hang on.
 *   Delay Pain's end-of-duration fatigue — the cost falls when the
 *     spell lapses, and nothing carries a debt to that moment.
 *   Deflections' "cannot deflect massive projectiles" — a judgement.
 */

import { ClassicLevel } from "classic-level";

const note = (text) => ({ kind: "note", text });
const say = (onSave, text) => ({ kind: "note", onSave, text });

/** The pack's own Darkvision — Chapter 8, `derives.light.raisesLevelBy: 2`. */
const DARKVISION_UUID = "Compendium.trg-prime.abilities.Item.vCbewmPdYNpHNnHl";

const EDITS = {

  /* ─── R3: Death Knell ───────────────────────────────────────────── */

  "Death Knell": (y) => {
    y.effects = [
      { kind: "deathKnell", target: "targets", mode: "dying", onSave: ["success"] },
      // "As failure" is not printed, but a Fumble is never better for the
      // target than a Failure — the rule block 25 settled. The page's
      // three rungs are Critical (unaffected), Success and Failure.
      { kind: "deathKnell", target: "targets", mode: "kill", onSave: ["failure", "fumble"] },
      say(["success"], "Dying increases by 1; you regain 1 HP for every 2 levels it possesses."),
      say(["failure", "fumble"], "The target dies; you regain 1 HP for every level it possesses."),
      note("Only reaches a creature that already has the Dying condition.")
    ];
  },

  /* ─── R4: Disorient, and Clarity's matching gap ─────────────────── */

  "Disorient": (y) => {
    y.effects = [
      {
        kind: "pending", target: "targets", onSave: ["success"],
        value: -1, bonusType: "circumstance", span: "endOfNextTurn",
        scope: "the next check it makes, before the end of its next turn"
      },
      {
        kind: "pending", target: "targets", onSave: ["failure"],
        swing: "disadvantage", span: "endOfNextTurn",
        scope: "the next check it makes, before the end of its next turn"
      },
      {
        // ALL CHECKS, SO IT ARRIVES PRE-TICKED and is not spent by the
        // first roll. Those are the two axes that make this rung
        // different from the one above it, and both are set here rather
        // than inferred from the wording.
        kind: "pending", target: "targets", onSave: ["fumble"],
        swing: "disadvantage", span: "endOfNextTurn",
        oneShot: false, auto: true,
        scope: "all checks, until the end of its next turn"
      },
      say(["success"], "-1 circumstance to its next check before the end of its next turn."),
      say(["failure"], "Its next check before the end of its next turn is made with DISADVANTAGE."),
      say(["fumble"], "DISADVANTAGE on ALL checks until the end of its next turn.")
    ];
  },

  "Clarity": (y) => {
    // The conditional stays — its bound is the spell's DURATION, which
    // the effect carrying it already tracks, and a pending entry has no
    // world clock. What was missing is the other bound: "the NEXT mental
    // saving throw". `oneShot` spends the effect when it is used, which
    // is also what the spell's own text says happens.
    y.effects = [{
      kind: "conditional", label: "Clarity", target: "targets",
      grants: [{
        kind: "advantage", label: "Clarity",
        scope: "the next mental saving throw made within the duration",
        when: { checkTypes: ["save"], traits: ["mental"] },
        auto: true, oneShot: true
      }]
    }];
  },

  /* ─── R6: the seven with a rail ──────────────────────────────────── */

  "Death Ward": (y) => {
    y.effects = [
      {
        kind: "conditional", label: "Death Ward", target: "targets",
        grants: [{
          kind: "modifier", value: 4, type: "status", label: "Death Ward",
          scope: "saving throws against essence and death effects",
          when: { checkTypes: ["save"], traits: ["essence", "death"] },
          auto: true
        }]
      },
      { kind: "defence", target: "targets", field: "resistance", value: "essence" },
      // "Ignores the Doomed Condition" — the whole condition, not a
      // number of points. See normaliseSuppression's `all`.
      { kind: "suppress", target: "targets", condition: "doomed", all: true, label: "Death Ward" }
    ];
  },

  "Delay Pain": (y) => {
    y.effects = [
      {
        kind: "suppress", target: "targets", label: "Delay Pain",
        choices: [
          { condition: "dazed", amount: 10 },
          { condition: "weakened", amount: 10 },
          { condition: "injured", amount: 5 }
        ]
      },
      note("At the end of the spell's duration you gain fatigue equal to the value of any ignored conditions — apply it by hand; nothing carries a debt to that moment.")
    ];
    y.warps = (y.warps ?? []).map((w) =>
      /ignore an additional point/i.test(String(w.text))
        ? { ...w, mods: { suppressBump: 1 } } : w);
  },

  "Decursive Veil": (y) => {
    y.effects = [
      { kind: "condition", target: "targets", condition: "concealed" },
      {
        kind: "suppress", target: "targets", label: "Decursive Veil",
        choices: [
          { condition: "frightened", amount: 1 },
          { condition: "sickened", amount: 1 }
        ]
      },
      note("Also immune to insight spells and effects of PP 2 or lower — there is no PP-threshold immunity rail, so judge it at the table.")
    ];
  },

  "Deflections": (y) => {
    /*
     * THE ONE PRINTED PARAMETER THIS BLOCK CHANGES, AND WHY.
     *
     * The page gives Deflections a Trigger and a Target ("1 missile")
     * and NO Range line. Since 3.532.0 a spell printing neither a range
     * nor an area means the caster — Graham's ruling of 8 September —
     * and the gate turns that into a reach of zero feet.
     *
     * So the -4 below, which belongs on the creature that SHOT at you,
     * would have been refused for every attacker except yourself. The
     * spell would have looked automated and reached nobody: the exact
     * shape 3.586.3 is about, caught here by `verify-spell-range` S4b
     * naming Deflections as a third self-bound spell with a row that
     * reaches another creature.
     *
     * "see text" is what the entry actually says. The base spell's limit
     * is AWARENESS — "you are aware of the physical ranged attack" — and
     * a shooter can be any distance away; the two warps then name
     * "within 30 feet" for melee and spell attacks. `spellRangeFeet`
     * already reads "see text" as no limit to enforce, which is the
     * truth here rather than a number invented to get past a gate.
     *
     * FLAGGED TO GRAHAM rather than slipped in: it is a printed
     * parameter, and this project's rule is that those match the page.
     */
    y.range = "see text";
    // THE BUNGLE SHAPE, and the note is Bungle's note for the same
    // reason: the penalty goes into the attack pool, which is exact for
    // an attack check and is what this spell penalises.
    y.effects = [
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "circumstance", value: -4 },
      note("Reaction against a ranged attack you are aware of. The penalty applies to THAT attack check. Cannot deflect massive projectiles such as boulders or ballista bolts.")
    ];
  },

  "Disgrace": (y) => {
    y.effects = [
      // FOUR ROWS, FOUR SLOTS. `perform`, not `performance` — measured
      // against the skill registry rather than typed from the page,
      // because `bonusTargetFor` sends an unknown slot to
      // `system.combat.performance`, which exists as an object path and
      // would have taken the penalty silently.
      { kind: "bonus", target: "targets", slot: "deception", bonusType: "status", value: -2 },
      { kind: "bonus", target: "targets", slot: "diplomacy", bonusType: "status", value: -2 },
      { kind: "bonus", target: "targets", slot: "intimidate", bonusType: "status", value: -2 },
      { kind: "bonus", target: "targets", slot: "perform", bonusType: "status", value: -2 },
      note("Creatures interacting with the target must succeed at a Will save against your spell DC for any cooperative action (Aid, forming an agreement); on a failure they hesitate and refuse. Attempts to magically bolster the target's Charisma or social influence automatically fail.")
    ];
  },

  "Deific Knowing": (y) => {
    y.effects = [{
      kind: "conditional", label: "Deific Knowing", target: "self",
      grants: [{
        kind: "advantage", label: "Deific Knowing",
        scope: "the triggering Recall Knowledge (Religion) or deity-specific check",
        when: { checkTypes: ["skill"], subjects: ["religion"] },
        auto: true
      }]
    }];
  },

  "Darkvision": (y) => {
    y.effects = [{
      kind: "grantAbility", target: "self", uuid: DARKVISION_UUID, label: "Darkvision"
    }];
    // `retargetSelfRows`, ADDED TO THE WARP THE FIRST PASS AUTHORED.
    //
    // "The spell's range is touch and it targets 1 willing creature" is
    // the exact sentence `selfRowRecipients` was built for: a warp that
    // MOVES the effect off the caster. Without it the row stays
    // `target: "self"` and the caster would gain Darkvision while
    // paying a point to give it away — a silent wrong recipient, which
    // is worse than a visible failure. The range and cap alone do not
    // say this; they describe where the spell reaches, not who the row
    // lands on.
    y.warps = (y.warps ?? []).map((w) =>
      /range is touch/i.test(String(w.text))
        ? { ...w, mods: { rangeOverride: "touch", targetCap: 1, retargetSelfRows: true } } : w);
  }
};

const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
const done = [];
for await (const [key, value] of db.iterator()) {
  if (!Object.prototype.hasOwnProperty.call(EDITS, value?.name)) continue;
  EDITS[value.name](value.system);
  await db.put(key, value);
  done.push(value.name);
}
await db.close();
console.log(`authored ${done.length}: ${done.sort().join(", ")}`);
const missing = Object.keys(EDITS).filter((n) => !done.includes(n));
if (missing.length) { console.error(`MISSING from the pack: ${missing.join(", ")}`); process.exit(1); }
