/**
 * CUTTING WORDS (Bard, PP 1) — Composition, Enchantment, Mental, Save.
 *
 *   Cast R (verbal); Range 30 feet; Targets 1 creature
 *   Trigger  target makes an attack or skill check
 *   Saving Throw  Will
 *
 *   Critical  No effect
 *   Success   Target takes a -1 circumstance penalty to the action
 *   Failure   Target takes a -2 circumstance penalty to the action
 *   Fumble    Target takes a -3 circumstance penalty to the action
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD — a promise with no keeper.
 *
 * Graham, 28 August 2026: "At the moment it just seems to leave a log on
 * the chat card for a friendly player."
 *
 * The spell carries `flags.trg-prime.selfApplying`, which means "code
 * resolves this, do not tell the GM to apply it by hand". That flag has
 * exactly ONE reader — `nonBasicSaveLine`, which uses it to SUPPRESS the
 * by-hand advice. Nothing anywhere applied the penalty. So the cast card
 * read "is affected", deliberately withheld the one sentence that would
 * have told a GM to apply it themselves, and the -3 went nowhere.
 *
 * The penalty WAS applied, once, by a button drawn on the triggering
 * check's own card — and that button could only ever appear when the
 * roller was a LINKED actor, because `activeToken` asked Foundry for
 * linked tokens only. Every monster in a normal game is unlinked, so the
 * only card that ever carried the button was a player's. That is exactly
 * what Graham saw, and why he saw nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 28 August 2026, which replaced the design rather than
 * repairing it:
 *
 *   "It should be triggered only by the caster of the spell. After an
 *    attack or skill check has been announced (nothing mechanical here
 *    just talk at the table), the player with the spell would cast the
 *    spell and select an eligible target."
 *
 * So the trigger is A SENTENCE AT THE TABLE, not a hook. There is no
 * button on anybody else's card. The Bard casts from their own sheet,
 * picks an eligible target, and the penalty waits on that creature until
 * the announced action is actually rolled.
 *
 * WAITING IS THE WHOLE SHAPE. "A -2 circumstance penalty to the action"
 * cannot be applied to a card that does not exist yet, and under Graham's
 * sequence — announce, cast, then roll — it does not. So the penalty is
 * recorded on the target and CONSUMED by their next attack roll or skill
 * check. `combat/aid-bonus.mjs` already carries a value on a flag for a
 * matchup the shared pools cannot express; this is the same answer to the
 * same shape of problem.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LADDER RUNS THE OTHER WAY. This is the TARGET's save, so a good
 * roll for them is a small number for us: their Critical shrugs it off
 * entirely and their Fumble costs them three. Reading it as the caster's
 * ladder — the reflex, since every other spell card in this system is
 * read that way — inverts the whole spell.
 *
 * THREE DEGREES THE PRINTED LADDER DOES NOT NAME. This system resolves
 * seven degrees and the spell prints four, so heroic, partial and blunder
 * need an answer. They take the one `basicSavingThrow` already gives
 * every other save in the game (dice/resolution.mjs): heroic resolves as
 * a critical, blunder as a fumble, and partial — which is not a success,
 * and takes full damage on a basic save — as a failure.
 */

/** The penalty each save degree earns the target, by the spell's own ladder. */
export const CUTTING_WORDS_LADDER = Object.freeze({
  heroic: 0,
  critical: 0,
  success: -1,
  partial: -2,
  failure: -2,
  fumble: -3,
  blunder: -3
});

/*
 * NO `CUTTING_WORDS_PP` ANY MORE. It existed so the old card button could
 * refuse a Bard who could not afford the spell before drawing itself.
 * The cast path spends and checks PP for every spell in the game, so a
 * second copy of this one's cost had nothing left to do.
 */

/** The reach of its clever words. */
export const CUTTING_WORDS_RANGE = 30;

/*
 * NO `CUTTING_WORDS_NAME` ANY MORE. It existed so the cast gate could
 * recognise this spell by name — the shortcut 3.432.0 shipped and
 * recorded as the weak part of that fix. The gate reads
 * `areaTargeting: "enemies"` off the pack entry now, so nothing needs to
 * know the spell's name at all, and the uncalled-export ratchet said so
 * the moment the last reader went.
 */

/** Where the waiting penalty is recorded on the target. */
export const CUTTING_WORDS_FLAG = "cuttingWords";

/**
 * The circumstance penalty a resolved Will save earns.
 *
 * An unresolved degree earns the FAILURE rung, not zero: a save that did
 * not resolve is not the target shrugging the spell off, and returning 0
 * would quietly refund the PP and the reaction the Bard already spent.
 *
 * @param {string} degree the target's Will-save degree
 * @returns {number} 0, -1, -2 or -3
 */
export function cuttingWordsPenalty(degree) {
  const key = String(degree ?? "");
  return Object.hasOwn(CUTTING_WORDS_LADDER, key)
    ? CUTTING_WORDS_LADDER[key]
    : CUTTING_WORDS_LADDER.failure;
}

/**
 * The modifier the penalty becomes on the check that consumes it, or
 * null when there is nothing to add.
 *
 * CIRCUMSTANCE, and therefore HIGHEST-WINS (Appendix 1). Two Bards cutting
 * at the same swing do not stack to -5; the pool keeps the larger. That is
 * decided by the type carried here, not by anything at the call site.
 */
export function cuttingWordsModifier(degree) {
  const value = cuttingWordsPenalty(degree);
  if (!value) return null;
  return { label: "Cutting Words", value, type: "circumstance" };
}

/**
 * "Trigger target makes an attack or skill check" — the two check types
 * this spell may interrupt, and no others.
 *
 * A SAVE IS NOT A SKILL CHECK, and neither is a Spellcraft cast check, a
 * dying check or a flat check. Answering "which rolls does this spell
 * reach" in one predicate is what stops the button appearing on all of
 * them the first time somebody widens the hook that calls it.
 *
 * @param {string} checkType the `type` a TRGCheck card carries
 */
export function cuttingWordsTriggers(checkType) {
  const key = String(checkType ?? "").toLowerCase();
  return key === "attack" || key === "skill";
}

/**
 * What the cast leaves waiting on the target, or null when it leaves
 * nothing.
 *
 * A CRITICAL SAVE RECORDS NOTHING AT ALL, rather than a zero. A stored
 * penalty of 0 would sit on the creature looking like an effect, be
 * consumed by their next roll, and print a line saying nothing happened —
 * three lies for the price of one. The spell says "No effect"; the
 * absence of a record is what that looks like.
 *
 * @param {object} options
 * @param {string} options.degree      the target's Will-save degree
 * @param {string} options.casterName  for the line the consuming card prints
 * @param {number|null} options.round  the combat round it was cast in
 * @returns {{penalty: number, casterName: string, round: number|null}|null}
 */
export function cuttingWordsRecord({ degree = "", casterName = "", round = null } = {}) {
  const penalty = cuttingWordsPenalty(degree);
  if (!penalty) return null;
  return {
    penalty,
    casterName: String(casterName ?? ""),
    round: round === null || round === undefined ? null : Number(round)
  };
}

/**
 * The modifier a WAITING record becomes on the check that spends it.
 *
 * NAMED WITH ITS CASTER, because by the time it lands the cast card has
 * scrolled away and "Cutting Words -2" on a goblin's attack is a number
 * with no author. Two Bards in a fight make that worse, not better.
 *
 * BUILT HERE RATHER THAN AT THE CALL SITE, and this is the second
 * attempt: the first wrote the object out by hand in `dice/check.mjs`
 * and then referenced `cuttingWordsModifier` with a `void` statement to
 * suggest a link that did not exist — a fake use, which is the exact
 * vacuous shape this project keeps catching in its own checks. The
 * ladder, the type and the label now have one owner.
 *
 * @param {object|null} pending what the target is carrying
 * @returns {{label: string, value: number, type: string}|null}
 */
export function pendingCuttingWordsModifier(pending) {
  const value = Number(pending?.penalty);
  if (!value) return null;
  const who = String(pending?.casterName ?? "").trim();
  return {
    label: who ? `Cutting Words (${who})` : "Cutting Words",
    value,
    type: "circumstance"
  };
}

/**
 * Whether this check is the one that takes the waiting penalty.
 *
 * BOTH HALVES ARE ASKED HERE so neither call site has to remember the
 * other: there must BE a record carrying a real penalty, and the check
 * must be one the spell's printed trigger names.
 *
 * @param {string} checkType
 * @param {object|null} pending what the target is carrying
 */
export function cuttingWordsConsumes(checkType, pending) {
  if (!pending || !Number(pending.penalty)) return false;
  return cuttingWordsTriggers(checkType);
}

/**
 * Whether a creature may be chosen as the target of this cast.
 *
 * ENEMIES ONLY — Graham's ruling, 28 August 2026, and the spell's own
 * sentence: "you sow confusion and doubt in the mind of your ENEMIES".
 * The Targets line says "1 creature", which is what let the old offer
 * appear on every ally's card; the flavour sentence carries the
 * restriction the Targets line does not.
 *
 * `isEnemy` IS PASSED IN, NOT DECIDED HERE. Disposition is a fact about a
 * TOKEN, not an actor — Graham's earlier ruling of 18 August 2026, which
 * `combat/aid-bonus.mjs` records after that file's own prompt offered a
 * hostile creature as an "ally". This module is pure and has no tokens,
 * so the caller asks `sameSide` and hands over the answer rather than a
 * second copy of that rule being written here.
 *
 * @param {object} state
 * @param {boolean} state.isEnemy      the target is on the other side
 * @param {number|null} state.distance feet from caster to target
 * @param {boolean} state.isSelf       the target IS the caster
 * @returns {{eligible: boolean, reason: string}}
 */
export function cuttingWordsTargetEligibility({
  isEnemy = false,
  distance = null,
  isSelf = false,
  // THE SPELL'S OWN REACH (3.434.0), defaulting to Cutting Words' 30 ft.
  // The gate is declaration-driven now, so the next spell to declare
  // `areaTargeting: "enemies"` is judged at ITS printed range rather than
  // at this one's.
  rangeFeet = CUTTING_WORDS_RANGE,
  // WHICH SIDE THE SPELL IS FOR (3.443.1). Counter Perform declares
  // `areaTargeting: "allies"` and its printed trigger is "YOU or a studied
  // ally", so both of the answers below invert for it: the caster is a
  // legal target rather than the first thing refused, and a same-side
  // creature is the point rather than the refusal.
  //
  // ADDED BECAUSE THE FIELD DID NOTHING. Counter Perform shipped at
  // 3.443.0 with `areaTargeting: "allies"` on the belief that the target
  // picker honours it. Driven on 29 August 2026, the picker offered an
  // enemy — `keepByDisposition` filters AREA membership, not a targeted
  // spell's picker, and the only thing that has ever refused by side is
  // this gate, which was keyed to the word "enemies" alone. So a Bard
  // could hand a foe a bonus to its save.
  side = "enemies"
} = {}) {
  const wantsAllies = String(side).trim().toLowerCase() === "allies";
  if (isSelf) {
    if (!wantsAllies) return { eligible: false, reason: "is the caster" };
  } else if (wantsAllies) {
    if (isEnemy) return { eligible: false, reason: "is not an ally" };
  } else if (!isEnemy) {
    return { eligible: false, reason: "is not an enemy" };
  }
  // NULL IS A FAILURE TO ANSWER THE RANGE QUESTION, not a pass. Two
  // tokens on different scenes have no distance between them.
  if (distance === null) return { eligible: false, reason: "is not on the same scene" };
  const reach = Number(rangeFeet) || CUTTING_WORDS_RANGE;
  if (distance > reach) {
    return { eligible: false, reason: `is ${Math.round(distance)} ft away (range ${reach} ft)` };
  }
  return { eligible: true, reason: "" };
}

/*
 * NO `cuttingWordsResult` ANY MORE. It computed "before, after, and did
 * this turn a hit into a miss" for the card the old button recomputed in
 * place. Under Graham's design the penalty is spent by the target's own
 * next check, which prints it in its own modifier breakdown and reaches
 * its own degree — so the before/after sentence had no card to appear on
 * and no reader to serve.
 */
