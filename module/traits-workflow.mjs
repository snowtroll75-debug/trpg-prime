/**
 * Traits (Appendix 3) — the Foundry side.
 *
 * Per-turn trait usage is one actor flag holding a small record of what
 * has been done this turn, cleared at the start of the actor's turn
 * alongside the other per-turn resets the combat document already
 * performs (MAP's attack count, Quick Load, parry tracking, stances).
 *
 * The Stance trait is the one exception: "you must wait at least one
 * round before using another" spans turns, so the round a stance was
 * entered is recorded in its own flag and deliberately not cleared.
 */
import {
  emptyTraitUsage,
  hasTrait,
  traitCombinationRestriction,
  traitRestriction,
  traitUsageKeys,
  WORD_AFTERMATH_PENALTY
} from "./traits.mjs";

import { RAGE_EFFECT_NAME } from "./combat/rage.mjs";
import { rageTraitRefusal } from "./trait-rules.mjs";

const SYSTEM_ID = "trg-prime";
const USAGE_FLAG = "traitUsage";
const STANCE_ROUND_FLAG = "lastStanceRound";

/** This actor's per-turn trait usage record. */
export function traitUsage(actor) {
  return { ...emptyTraitUsage(), ...(actor?.getFlag?.(SYSTEM_ID, USAGE_FLAG) ?? {}) };
}

/**
 * Clears the per-turn record. Called from the combat turn-start phase, and at
 * a combat's end. AN INHERITED RECORD IS OVERWRITTEN (3.622.1; the 3.622.0
 * drive's F4) — see combat/turn-records.mjs.
 */
export async function clearTraitUsage(actor) {
  const { clearTraitUsageRecord } = await import("./combat/turn-records.mjs");
  await clearTraitUsageRecord(actor);
}

/**
 * Whether Appendix 3's trait rules allow this action right now.
 *
 * @param {Actor} actor
 * @param {object} action Anything carrying a `traits` string.
 * @returns {{blocked: boolean, reason: string}}
 */
export function traitCheck(actor, action) {
  const combination = traitCombinationRestriction(action);
  if (combination.blocked) return combination;

  // THE ROUND'S CONVICTION POINT, read from the spend gate's own stamp.
  const spent = actor?.getFlag?.(SYSTEM_ID, "convictionSpent") ?? null;
  const combat = game.combat?.started ? game.combat : null;
  const ownTurn = isOwnTurn(actor, combat);
  // AP SPENT THIS TURN, from the spend's own stamp (3.622.0; R11).
  const apStamp = actor?.getFlag?.(SYSTEM_ID, "apSpentRound") ?? null;
  return traitRestriction(action, traitUsage(actor), {
    round: combat?.round ?? null,
    lastStanceRound: lastStanceRoundIn(actor, combat),
    inEncounter: Boolean(combat),
    convictionSpentThisRound: Boolean(spent && combat && spent.combatId === combat.id && spent.round === combat.round),
    attacksThisTurn: ownTurn ? Number(actor?.getFlag?.(SYSTEM_ID, "attackCount") ?? 0) : 0,
    actedThisTurn: Boolean(ownTurn && apStamp && apStamp.combatId === combat.id
      && apStamp.round === combat.round && apStamp.turn === combat.turn)
  });
}

/** Whether it is this actor's own turn in a running combat. */
function isOwnTurn(actor, combat = game.combat?.started ? game.combat : null) {
  const active = combat?.combatant?.actor ?? null;
  return Boolean(active && actor && (active === actor || active.uuid === actor.uuid));
}

/**
 * THE ROUND OF THIS COMBAT'S LAST STANCE, or null (3.622.0; block 39's A15).
 * Stamped as {combatId, round}, so a stance in round 4 of one fight no longer
 * blocks rounds 1–4 of the next. A bare number from before is from a combat
 * nobody can name, and blocks nothing.
 */
export function lastStanceRoundIn(actor, combat = game.combat?.started ? game.combat : null) {
  const stamp = actor?.getFlag?.(SYSTEM_ID, STANCE_ROUND_FLAG) ?? null;
  if (!combat || !stamp || typeof stamp !== "object") return null;
  return stamp.combatId === combat.id ? Number(stamp.round) : null;
}

/** The stamp a Stance writes. */
export function stanceStamp(combat = game.combat?.started ? game.combat : null) {
  return combat ? { combatId: combat.id, round: combat.round } : null;
}

/**
 * Enforces the trait rules, warning the player if the action is refused.
 * Returns whether the action may proceed, so callers read as a guard.
 *
 * @param {Actor} actor
 * @param {object} action
 * @param {string} actionName For the notification.
 * @returns {boolean}
 */
export function traitGate(actor, action, actionName = "This action") {
  // RAGE (3.622.0; Graham's R11 of block 39): "You must be in a state of
  // rage to use abilities and actions that have this trait." Invoke Rage is
  // how one gets there, and is exempt.
  const raging = Array.from(actor?.effects ?? []).some((e) => e?.name === RAGE_EFFECT_NAME && !e.disabled);
  const rage = rageTraitRefusal(action, raging, { key: action?.key ?? "" });
  if (rage) {
    ui.notifications.warn(`${actionName}: ${rage}.`);
    return false;
  }
  const result = traitCheck(actor, action);
  if (result.blocked) {
    ui.notifications.warn(`${actionName}: ${result.reason}.`);
    return false;
  }
  return true;
}

/**
 * Records that an action with these traits has been used this turn.
 *
 * @param {Actor} actor
 * @param {object} action
 * @returns {Promise<void>}
 */
export async function recordTraitUsage(actor, action) {
  // ONLY IN COMBAT (3.622.0; block 39's A11, Graham's R13). The record is
  // cleared at the start of each combat turn and nowhere else, so written
  // out of combat it lived for ever.
  if (!game.combat?.started) return;
  const usage = traitUsage(actor);
  for (const key of traitUsageKeys(action)) {
    usage[key] = Number(usage[key] ?? 0) + 1;
  }

  // WORD: "After using a spell with this trait, all further spell and
  // attack checks made during your turn suffer a -4 penalty."
  if (hasTrait(action, "word")) usage.wordPenalty = true;

  await actor.setFlag(SYSTEM_ID, USAGE_FLAG, usage);

  // STANCE spans rounds, so it lives outside the per-turn record.
  if (hasTrait(action, "stance") && game.combat?.round) {
    await actor.setFlag(SYSTEM_ID, STANCE_ROUND_FLAG, stanceStamp());
  }
}

/**
 * The Word aftermath modifier for a spell or attack check, as a check
 * modifier entry — or null when no Word spell has been used this turn.
 *
 * @param {Actor} actor
 * @returns {{label: string, value: number, type: string}|null}
 */
export function wordAftermathModifier(actor) {
  // "…made during YOUR TURN" (3.622.0; block 39's A12): an Attack of
  // Opportunity or a reaction spell on an enemy's turn is not under it.
  if (!isOwnTurn(actor)) return null;
  if (!traitUsage(actor).wordPenalty) return null;
  return {
    label: "Word spell aftermath",
    value: WORD_AFTERMATH_PENALTY,
    type: "untyped"
  };
}
