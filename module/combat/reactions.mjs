/**
 * Reaction eligibility (Chapter 4 — Reactions).
 *
 * A Reaction is a special response used when its trigger occurs; it sits
 * outside the normal 3 AP sequence. Several states forbid Reactions
 * outright, and the resource layer (spendReaction / the turn-start regain)
 * doesn't know about them — this module is the single place that decides
 * whether a creature may react at all, so the gate can be unit-tested
 * without a live Foundry actor.
 *
 * The rules enforced here (per Graham's Reactions report):
 *   - Flat-Footed creatures cannot use Reactions. (This is also why a
 *     combatant can't react before its first turn — everyone starts a
 *     round-1 encounter Flat-Footed until they have acted.)
 *   - Confused creatures cannot use Reactions, and additionally cannot
 *     Ready or Delay (both require deliberate, controlled choices).
 *   - Full Defence prevents all other actions, including Reactions, until
 *     the beginning of the creature's next turn.
 *
 * Stunned-that-consumes-all-AP is handled elsewhere (it zeroes the
 * reaction resource at turn start in documents/combat.mjs), so it isn't
 * repeated here.
 */
import { isInFullDefence } from "./basic-action-stances.mjs";
import { hasTrait } from "../traits.mjs";

/**
 * Why a Reaction-cost action may not be used right now, or null if it may.
 * Pure — takes the relevant condition/state flags rather than an actor.
 *
 * @param {object} state
 * @param {boolean} [state.flatFooted]
 * @param {boolean} [state.confused]
 * @param {boolean} [state.fullDefence]
 * @returns {string|null}
 */
/**
 * The Flat-Footed refusal, as a named constant.
 *
 * NAMED at 3.378.0 because Improved Combat Reflexes waives THIS block and
 * no other, and the alternative was a caller matching the sentence with a
 * regex. A rule identified by its own prose breaks the moment somebody
 * improves the wording, and silently — the waiver would simply stop
 * applying, with the feat still listed on the sheet.
 */
export const FLAT_FOOTED_BLOCK = "Flat-Footed creatures cannot use Reactions";

/*
 * A FUMBLE CAN TAKE YOUR REACTIONS TOO (3.582.0; the pages 221-230
 * audit's D1, Graham's R1 of 22 September 2026).
 *
 * Unarmed 11-15: "Such is your confidence that you overextend and are
 * slightly off balance. You may use no Reactions until the end of your
 * next turn." Three rows across the tables say it.
 *
 * NAMED AND ASKED HERE, not stamped and forgotten. The first draft
 * created an effect carrying a `fumbleNoReactions` flag and stopped —
 * and `actorReactionBlock` reads flat-footed, confused and full defence
 * and nothing else, so the effect sat on the sheet looking authoritative
 * while the character went on taking reactions. Found by driving it.
 *
 * That is the same mistake the weapon break avoided two hundred lines
 * away, by recording a break the way `itemStatus` already reads one. A
 * state nothing consults is a state that does not exist.
 */
export const FUMBLE_REACTION_BLOCK =
  "A fumble left you off balance — no Reactions until the end of your next turn";

export function reactionBlockReason({
  flatFooted = false, confused = false, fullDefence = false, fumbled = false
} = {}) {
  if (flatFooted) return FLAT_FOOTED_BLOCK;
  if (confused) return "Confused creatures cannot use Reactions";
  if (fullDefence) return "Full Defence prevents all other actions, including Reactions, until your next turn";
  if (fumbled) return FUMBLE_REACTION_BLOCK;
  return null;
}

/** Is a fumble's no-Reactions effect currently on this actor? */
export function fumbleBlocksReactions(actor) {
  return Array.from(actor?.effects ?? []).some(
    (effect) => !effect.disabled && effect.getFlag?.("trg-prime", "fumbleNoReactions") === true
  );
}

/**
 * Whether Confused forbids this specific non-Reaction action. Confused
 * blocks the two actions that hand control of your turn to a trigger —
 * Ready and Delay — on top of blocking Reactions themselves.
 *
 * @param {string} actionKey
 * @param {object} state
 * @param {boolean} [state.confused]
 * @returns {boolean}
 */
export function deliberateActionBlocked(actionKey, { confused = false } = {}) {
  return Boolean(confused) && (actionKey === "ready" || actionKey === "delay");
}

/**
 * Actor-facing wrapper: reads the live condition/stance state off an
 * actor and returns the reaction-block reason (or null). Kept separate
 * from the pure helper so the decision logic stays testable.
 *
 * @param {Actor} actor
 * @returns {string|null}
 */
export function actorReactionBlock(actor) {
  return reactionBlockReason({
    flatFooted: Boolean(actor?.hasCondition?.("flatFooted")),
    confused: Boolean(actor?.hasCondition?.("confused")),
    fullDefence: isInFullDefence(actor),
    fumbled: fumbleBlocksReactions(actor)
  });
}

/**
 * Actor-facing wrapper for the Ready/Delay-under-Confused gate.
 *
 * @param {Actor} actor
 * @param {string} actionKey
 * @returns {boolean}
 */
export function actorDeliberateActionBlocked(actor, actionKey) {
  return deliberateActionBlocked(actionKey, {
    confused: Boolean(actor?.hasCondition?.("confused"))
  });
}

/* ------------------------------------------------------------------ *
 * FULL DEFENCE — "all other actions ... are prohibited"               *
 * ------------------------------------------------------------------ */

/**
 * "You may take a SINGLE Move action as part of Full Defence."
 */
export const FULL_DEFENCE_MOVE_ALLOWANCE = 1;

/** Where the Move actions taken during this stance are counted. */
export const FULL_DEFENCE_MOVES_FLAG = "fullDefenceMoves";

/** Is this action's cost a Free one? */
export function isFreeAction(action) {
  return String(action?.apCost ?? "").trim().toLowerCase() === "free";
}

/**
 * Why Full Defence forbids this action, or null if it allows it.
 *
 * THE ENTRY HAS THREE SENTENCES AND ALL THREE ARE RULES:
 *
 *   "Instead of attacking, you can duck and weave to avoid attacks."
 *   "You may take a single Move action as part of Full Defence."
 *   "You can still use Free Actions ... but all other actions,
 *    including Reactions are prohibited."
 *
 * Until 3.336.0 only the last clause was enforced, and only for
 * Reactions. The AP economy hid it: Full Defence costs 3 of a standard
 * 3 AP pool, so every attempt to prove it live was refused for want of
 * AP rather than by the rule, and a character with a larger pool or an
 * AP-reducing feat was never stopped at all.
 *
 * CHARGE IS THE AWKWARD CASE, and it is decided by the first sentence
 * rather than by fiat. Charge carries the Movement trait, so read
 * narrowly it is "a Move action"; but it also carries Attack, and Full
 * Defence is defined as what you do *instead of attacking*. An action
 * that attacks is the one thing this stance cannot be doing, so the
 * Attack trait disqualifies it from the Move allowance.
 *
 * @param {object} action
 * @param {object} state
 * @param {boolean} [state.fullDefence]
 * @param {number} [state.movesUsed] Move actions already taken in this stance.
 * @returns {string|null}
 */
export function fullDefenceBlockReason(action, { fullDefence = false, movesUsed = 0 } = {}) {
  if (!fullDefence) return null;
  // A Reaction is prohibited too, but by the reaction gate above — which
  // says so in its own words, is what every Reaction already passes
  // through, and covers Flat-Footed and Confused in the same breath.
  // Answering here as well would only change the message.
  if (String(action?.apCost ?? "").trim().toLowerCase() === "reaction") return null;
  if (isFreeAction(action)) return null;
  const traits = action?.traits ?? "";
  if (hasTrait(traits, "movement") && !hasTrait(traits, "attack")) {
    if ((Number(movesUsed) || 0) < FULL_DEFENCE_MOVE_ALLOWANCE) return null;
    return "Full Defence allows a single Move action, and you have already taken it";
  }
  return "Full Defence prevents all other actions until the beginning of your next turn";
}

/**
 * The same question for a token being dragged, which never reaches an
 * action at all.
 *
 * ASKED SEPARATELY BECAUSE DRAGGING IS A STRIDE. This project's own
 * movement rule is that "dragging a token is a Stride", so a Move
 * allowance policed only at the action buttons would be no allowance:
 * a character in Full Defence could drag across the whole board for
 * free, which is exactly the shape of hole the reaction-only gate was.
 *
 * @param {object} state
 * @param {boolean} [state.fullDefence]
 * @param {number} [state.movesUsed]
 * @returns {string|null}
 */
export function fullDefenceMovementBlock({ fullDefence = false, movesUsed = 0 } = {}) {
  if (!fullDefence) return null;
  if ((Number(movesUsed) || 0) < FULL_DEFENCE_MOVE_ALLOWANCE) return null;
  return "Full Defence allows a single Move action, and you have already taken it";
}

/**
 * Actor-facing wrapper for the Full Defence gate.
 *
 * @param {Actor} actor
 * @param {object} action
 * @returns {string|null}
 */
export function actorFullDefenceBlock(actor, action) {
  return fullDefenceBlockReason(action, {
    fullDefence: isInFullDefence(actor),
    movesUsed: Number(actor?.getFlag?.("trg-prime", FULL_DEFENCE_MOVES_FLAG) ?? 0)
  });
}

/**
 * Count a Move action taken while in Full Defence.
 *
 * Called at the point of COMMITMENT rather than at the gate, so an
 * action abandoned in its own dialog has not spent the allowance — the
 * same reasoning `recordTraitUsage` is placed where it is.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND IT SPENDS NOTHING FOR AN ACTION FULL DEFENCE NEVER BLOCKED.
 *
 * Added at 3.557.0, on the evidence of a one-word data fix. Kip Up is
 * printed MOVEMENT (page 76) and the system stored no traits at all; the
 * pages 71-80 audit called the omission harmless, because the two places
 * that read the trait both let Kip Up through — `fullDefenceBlockReason`
 * exempts Free actions two lines ABOVE its movement test.
 *
 * This function had no such exemption. So restoring the printed trait
 * would have made a Free action consume the single Move that Full Defence
 * allows, and the Stride after it would have been refused — a rule
 * nobody wrote, arriving through a trait line being made CORRECT.
 *
 * The allowance and the block have to agree about what they are counting.
 * Anything `fullDefenceBlockReason` would never have stopped cannot have
 * spent the one thing it lets through.
 *
 * @param {Actor} actor
 * @param {object} action
 * @returns {Promise<boolean>} whether anything was counted.
 */
export async function noteFullDefenceMove(actor, action) {
  if (!isInFullDefence(actor)) return false;
  if (String(action?.apCost ?? "").trim().toLowerCase() === "reaction") return false;
  if (isFreeAction(action)) return false;
  const traits = action?.traits ?? "";
  if (!hasTrait(traits, "movement") || hasTrait(traits, "attack")) return false;
  const used = Number(actor?.getFlag?.("trg-prime", FULL_DEFENCE_MOVES_FLAG) ?? 0);
  await actor.setFlag("trg-prime", FULL_DEFENCE_MOVES_FLAG, used + 1);
  return true;
}
