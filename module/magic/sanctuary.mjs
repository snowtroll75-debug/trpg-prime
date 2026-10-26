/**
 * SANCTUARY (3.598.0) — the first Grimoire spell that reaches into the
 * attack workflow.
 *
 * Graham's R1 of block 31, 26 September 2026: "Build in Full."
 *
 * PRINTED (page 312), PP 2, Will save, 1 minute:
 *
 *   "Opponents suffer waves of uncertainty when attacking one character of
 *   your choice. THE FIRST TIME EACH OPPONENT attempts to attack the
 *   protected character, he must first make a Will save. If the target uses
 *   a hostile action, the spell ends."
 *   Success  "The creature can attempt its attack and any other attacks
 *            against the target normally."
 *   Failure  "The creature can't attack the target and WASTES THE ACTION.
 *            It can't attempt further attacks against the target THIS TURN
 *            but may make the attempt triggering a fresh saving throw on
 *            their next turn."
 *   Fumble   "The creature wastes the action and can't attempt to attack
 *            the target FOR THE REST OF SANCTUARY'S DURATION."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE THINGS MAKE THIS UNLIKE EVERY OTHER SAVE SPELL.
 *
 * 1. THE OPPONENT ROLLS, AND NOT AT CAST TIME. Every other save in the
 *    Grimoire is rolled by the targets when the spell goes off. This one is
 *    rolled by whoever swings, at the moment they swing, which is why it
 *    needs a gate in the attack path rather than a row the applier runs.
 *
 * 2. THE STATE IS PER OPPONENT. "The first time each opponent" means the
 *    spell remembers a verdict for each attacker separately: one goblin may
 *    have passed and be attacking freely while the one beside it is locked
 *    out for the duration.
 *
 * 3. A SUCCESS IS PERMANENT AND A FAILURE IS NOT. "Any other attacks …
 *    normally" means a creature that passes never rolls again; a creature
 *    that fails rolls afresh on its next turn. So the record cannot be a
 *    single "has saved" boolean, which is the shape I reached for first.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEGREES ARE READ WITH THE RULE THAT ALREADY EXISTS.
 *
 * The page names three rungs and this system resolves SEVEN degrees, so
 * `heroic`, `partial` and `blunder` have to land somewhere. Rather than
 * three lines of `if` at the gate — "a rule hand-rolled at its call site"
 * being this project's most-found defect — the rungs are declared as
 * ordinary `onSave` rows and read through `effectiveSaveDegree`, the
 * function written for the Fear bug. Measured, it gives:
 *
 *   heroic   → no rung: the attack proceeds (a heroic save is a success)
 *   critical → passed          partial → blocked this turn
 *   success  → passed          failure → blocked this turn
 *   fumble   → blocked for the duration
 *   blunder  → blocked for the duration (a blunder is a worse fumble)
 *
 * A PARTIAL BLOCKS, and that is the existing rule rather than my
 * preference: `effectiveSaveDegree` clamps a non-success to the harsher
 * side of a gap it does not name, because the alternative is rolling badly
 * being rewarded. The page names no partial, so the table can overrule it.
 */

import { effectAppliesOnDegree, effectiveSaveDegree } from "./spell-degrees.mjs";

/** The flag the gate keeps its per-opponent verdicts in, on the EFFECT. */
export const SANCTUARY_FLAG = "sanctuary";

/**
 * What a verdict can be.
 *
 * ON THE EFFECT AND NOT ON THE ACTOR, so the fumble lockout — "for the rest
 * of sanctuary's duration" — ends exactly when the spell does, with no
 * clock of its own to get wrong. When the effect is deleted the verdicts go
 * with it, which is the printed rule and not a cleanup step somebody has to
 * remember.
 */
export const SANCTUARY = Object.freeze({
  PASSED: "passed",
  BLOCKED_TURN: "blockedTurn",
  BLOCKED_DURATION: "blockedDuration"
});

/*
 * THE PRINTED LADDER, as rows. Order matters only for the lookup below;
 * `effectiveSaveDegree` does the ranking.
 */
const LADDER = Object.freeze([
  /*
   * `success` ALONE, AND `critical` DELIBERATELY ABSENT. Any success-side
   * degree the ladder does not name — critical, heroic — is returned
   * unchanged by `effectiveSaveDegree` and matches no row, so it falls
   * through to PASSED below. Naming `critical` here as well was redundant:
   * `mutate-sanctuary` removed it and nothing changed, which is the proof
   * that it was decoration. The fallback is what carries both.
   */
  Object.freeze({ onSave: ["success"], outcome: SANCTUARY.PASSED }),
  Object.freeze({ onSave: ["failure"], outcome: SANCTUARY.BLOCKED_TURN }),
  Object.freeze({ onSave: ["fumble"], outcome: SANCTUARY.BLOCKED_DURATION })
]);

/** A sanctuary row, or null when it is malformed. */
export function normaliseSanctuary(raw) {
  if (!raw || raw.kind !== "sanctuary") return null;
  return { label: String(raw.label ?? "Sanctuary").trim() || "Sanctuary" };
}

/**
 * Does this spell's own effect list say its save is rolled LATER, by someone
 * else?
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO PREVENT, WHICH I WALKED INTO.
 *
 * Sanctuary's pack entry carries `defence: "Will"`, because the page prints
 * "Saving Throw Will". The cast workflow's save branch fires on exactly that
 * field — so the spell would have asked the PROTECTED ALLY to roll Will to
 * resist their own ward, and `beneficial-save.mjs` would have agreed, because
 * it treats any spell with `defence` set as non-beneficial.
 *
 * A cleric casting a 2 PP protection on a friend, and the friend rolling to
 * shrug it off. The page's save is real; it simply belongs to the opponents,
 * at the moment they swing.
 *
 * SO THE ROW DECLARES IT, and the cast workflow asks this question rather
 * than naming Sanctuary. Any later spell whose save is deferred to another
 * moment answers the same way, and `verify-sanctuary` D1 asserts the branch
 * reads this and not a spell name.
 */
export function spellDefersItsSave(effects) {
  return (Array.isArray(effects) ? effects : []).some((e) => normaliseSanctuary(e) !== null
    // VISAGE OF HORROR'S SAVE IS THE OPPONENT'S TOO (3.609.0): "When any
    // creature makes an aggressive move against the target, it must make a
    // Will save." The creature wearing the visage rolls nothing.
    || String(e?.kind ?? "") === "horror"
    // AND ANY ROW THAT SAYS SO (3.672.0; C6). Inner Tempest's Spiritual
    // Distraction and Disrupt Soul print "Saving Throw Will/Fortitude" and
    // roll it each time the cursed creature casts; Acidic Touch's Fortitude
    // is rolled by whoever its touch hits. None is rolled on casting.
    || e?.saveAtCast === false);
}

/**
 * Which verdict a rolled degree earns the opponent.
 *
 * A DEGREE THE LADDER DOES NOT NAME AND DOES NOT CLAMP INTO IT — only
 * `heroic` — lets the attack through, because it is a better save than the
 * best rung printed.
 */
export function sanctuaryOutcome(rolledDegree) {
  const key = effectiveSaveDegree(LADDER, rolledDegree);
  const row = LADDER.find((r) => effectAppliesOnDegree(r, key));
  return row?.outcome ?? SANCTUARY.PASSED;
}

/**
 * What should happen when `attackerId` tries to attack the protected
 * creature, given the verdicts so far and the round it is now.
 *
 * TAKES THE RECORD AND THE ROUND, not documents, so the harness can drive
 * every combination — including the ones that need three rounds to reach.
 *
 * @returns {{mustSave: boolean, blocked: boolean, reason: string|null}}
 */
export function sanctuaryVerdict(record, attackerId, round) {
  const entry = (record ?? {})[String(attackerId)] ?? null;
  if (!entry) return { mustSave: true, blocked: false, reason: null };
  if (entry.state === SANCTUARY.PASSED) return { mustSave: false, blocked: false, reason: null };
  if (entry.state === SANCTUARY.BLOCKED_DURATION) {
    return { mustSave: false, blocked: true, reason: SANCTUARY.BLOCKED_DURATION };
  }
  if (entry.state === SANCTUARY.BLOCKED_TURN) {
    /*
     * "THIS TURN … A FRESH SAVING THROW ON THEIR NEXT TURN." The round the
     * failure happened in is what is stored, and the lockout lifts when the
     * round moves on. A LATER ROUND ROLLS AGAIN rather than passing freely:
     * the page says a fresh save, not a free attack.
     *
     * OUT OF COMBAT THERE IS NO ROUND, and `round` arrives null. A stored
     * null can never differ from a later null, so a lockout out of combat
     * would last for ever — the exact silent-forever shape this project
     * refuses. So outside combat each attempt rolls afresh, which is the
     * reading that costs the attacker nothing it did not print, and the
     * card says so.
     */
    if (round === null || entry.round === null) return { mustSave: true, blocked: false, reason: null };
    if (Number(entry.round) === Number(round)) {
      return { mustSave: false, blocked: true, reason: SANCTUARY.BLOCKED_TURN };
    }
    return { mustSave: true, blocked: false, reason: null };
  }
  // AN UNREADABLE VERDICT IS NOT A LOCKOUT. A hand-edited flag must not be
  // able to make a creature unattackable for ever.
  return { mustSave: true, blocked: false, reason: null };
}

/**
 * The record after `attackerId` rolled `degree` in `round`.
 *
 * RETURNS A NEW OBJECT rather than mutating, so a caller cannot half-write
 * a flag it then fails to save — the same reason `withImmunity` does.
 */
export function sanctuaryRecordAfter(record, attackerId, degree, round) {
  const state = sanctuaryOutcome(degree);
  return {
    ...(record ?? {}),
    [String(attackerId)]: {
      state,
      round: state === SANCTUARY.BLOCKED_TURN ? (round === null ? null : Number(round)) : null
    }
  };
}

/* ═════════════════════════════════════════════════════════════════════
 * THE CARD
 * ═══════════════════════════════════════════════════════════════════ */

/** The line for the cast card. */
export function sanctuaryLine(protectedName, durationText) {
  return `<strong>${protectedName}</strong> is warded by <strong>Sanctuary</strong>: the first time each `
    + "opponent attempts to attack them it must make a Will save"
    + `${durationText}. A hostile action by ${protectedName} ends it.`;
}

/** And when an opponent passes. */
export function sanctuaryPassedLine(attackerName, targetName) {
  return `<strong>${attackerName}</strong> pushes through the uncertainty — attacks against `
    + `<strong>${targetName}</strong> proceed normally from now on.`;
}

/** When the save fails: the action is wasted and this turn is over for them. */
export function sanctuaryBlockedTurnLine(attackerName, targetName, inCombat) {
  return `<strong>${attackerName}</strong> cannot bring itself to attack <strong>${targetName}</strong> `
    + "&mdash; <strong>the action is wasted</strong>, and no further attempt against them "
    + (inCombat ? "this turn." : "until it tries again (no round is running, so the next attempt saves afresh).");
}

/** And when it fumbles: no attempt for the rest of the duration. */
export function sanctuaryFumbledLine(attackerName, targetName) {
  return `<strong>${attackerName}</strong> recoils &mdash; <strong>the action is wasted</strong>, and it `
    + `cannot attempt to attack <strong>${targetName}</strong> for the rest of Sanctuary's duration.`;
}

/** When a locked-out opponent tries again, which costs it nothing. */
export function sanctuaryStillBlockedLine(attackerName, targetName, reason) {
  const how = reason === SANCTUARY.BLOCKED_DURATION
    ? "for the rest of Sanctuary's duration"
    : "for the rest of this turn";
  return `<em>${attackerName} cannot attempt to attack ${targetName} ${how}.</em>`;
}

/** And when the protected creature breaks it themselves. */
export function sanctuaryEndedLine(protectedName) {
  return `<strong>Sanctuary</strong> on <strong>${protectedName}</strong> ends &mdash; `
    + "they took a hostile action.";
}
