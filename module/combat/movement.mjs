/**
 * Movement and Action Points (Chapter 4). Pure logic;
 * movement-workflow.mjs drives the Foundry side.
 *
 * Moving a token in combat cost nothing until now — the Basic Actions
 * that describe movement existed as cards you could click, but dragging
 * a token across the board was free, so the action economy only applied
 * to the half of the turn that went through a button.
 *
 * Per Graham directly:
 *
 * - Dragging a token is a Stride: "1 AP, move up to your Speed."
 * - The cost is cumulative across the turn rather than per drag, so
 *   nudging a token twice doesn't cost double. Total distance moved this
 *   turn divided by Speed, rounded up, charging only the difference each
 *   time — the thirty-first foot starts a second Stride.
 * - A move that would cost more AP than remains is refused outright
 *   rather than allowed and warned about.
 * - Selecting a movement action first arms it, and the next move uses
 *   that action's own rules instead of Stride.
 */

/**
 * Foundry's own movement actions map onto this system's movement types.
 * Jump and crawl both travel over ground, so both draw on land Speed;
 * blink and displace are teleportation rather than movement and are
 * deliberately absent, so they are never charged as a Stride.
 */
export const MOVEMENT_ACTION_SPEEDS = Object.freeze({
  walk: "land",
  crawl: "land",
  jump: "land",
  fly: "fly",
  swim: "swim",
  climb: "climb",
  burrow: "burrow"
});

/** Movement methods that represent a person moving their own token. */
export const CHARGED_MOVEMENT_METHODS = Object.freeze(["dragging", "keyboard", "api"]);

/**
 * The Speed that governs a given Foundry movement action.
 *
 * @param {object} actorSystem
 * @param {string} foundryAction One of CONFIG.Token.movement.actions.
 * @returns {{key: string|null, speed: number}} A null key means this
 *   movement isn't governed by a Speed at all (teleportation).
 */
import { speedValue } from "./speed-pool.mjs";

export function speedForMovement(actorSystem, foundryAction) {
  const key = MOVEMENT_ACTION_SPEEDS[String(foundryAction ?? "walk")] ?? null;
  if (!key) return { key: null, speed: 0 };
  // `speedValue`, NOT `Number()`. The speeds became bonus pools at
  // 3.412.0 and `Number({base:25,…})` is NaN, so this returned NaN,
  // `stridesFor` saw a speed of 0 and charged Infinity AP, and
  // **nothing could move in combat at all**. Found in a live combat
  // test on 26 August 2026, four releases after the pooling landed:
  //
  //   "Bugbear Soldier would need Infinity more AP to move 15 ft
  //    (15 ft of Striding this turn at Speed NaN) but has 3."
  //
  // Same defect as the climb/swim bonus that died at 3.412.1 — the one
  // the release notes called "the silent one" — in a reader that fix
  // did not find. Section J of verify-speed-pool now sweeps the source
  // for the pattern so a fifth one cannot hide.
  return { key, speed: Math.max(0, speedValue(actorSystem?.combat?.movement?.[key])) };
}

/**
 * Strides needed to have covered a total distance.
 *
 * @param {number} totalCost Terrain-adjusted distance covered this turn.
 * @param {number} speed
 * @returns {number}
 */
export function stridesFor(totalCost, speed) {
  const cost = Math.max(0, Number(totalCost) || 0);
  const spd = Math.max(0, Number(speed) || 0);
  if (cost <= 0) return 0;
  if (spd <= 0) return Infinity;
  return Math.ceil(cost / spd);
}

/**
 * What a proposed move costs, given what has already been moved and paid
 * for this turn.
 *
 * @param {object} options
 * @param {number} options.previousCost Distance already moved this turn.
 * @param {number} options.moveCost Terrain-adjusted cost of this move.
 * @param {number} options.speed
 * @param {number} options.apAlreadyCharged AP already spent on movement.
 * @returns {{totalCost: number, requiredAp: number, apDue: number, impossible: boolean}}
 */
export function movementApDue({ previousCost, moveCost, speed, apAlreadyCharged }) {
  const previous = Math.max(0, Number(previousCost) || 0);
  const move = Math.max(0, Number(moveCost) || 0);
  const charged = Math.max(0, Number(apAlreadyCharged) || 0);
  const totalCost = previous + move;
  const requiredAp = stridesFor(totalCost, speed);

  if (!Number.isFinite(requiredAp)) {
    return { totalCost, requiredAp: Infinity, apDue: Infinity, impossible: true };
  }
  return {
    totalCost,
    requiredAp,
    apDue: Math.max(0, requiredAp - charged),
    impossible: false
  };
}

/**
 * Which running total a move is charged against.
 *
 * Per Graham (3.98.0): "each type of Action should always expend its own
 * AP." A Step is a Step and a Stride is a Stride, so the five feet of the
 * one take nothing away from what the other will afterwards buy. Strides
 * are further separated by the Speed they used, because a Stride on land
 * and a Stride on the wing cover different distances for the same AP and
 * so cannot share a divisor.
 *
 * @param {string|null} armedAction The armed movement action, if any.
 * @param {string} speedKey The Speed governing this move.
 * @returns {string}
 */
export function movementPoolKey(armedAction, speedKey) {
  return armedAction ? `action:${armedAction}` : `stride:${speedKey ?? "land"}`;
}

/**
 * The movement actions that can be armed, and the rules each imposes on
 * the move that follows. Quoted from their own Chapter 4 entries.
 */
export const ARMED_MOVEMENT_ACTIONS = Object.freeze({
  step: {
    name: "Step",
    apCost: 1,
    maxDistance: 5,
    landSpeedOnly: true,
    requiresProne: false,
    // "This doesn't trigger reactions that a move action could
    // otherwise trigger" — recorded so a future Attack of Opportunity
    // implementation can honour it rather than rediscovering the rule.
    provokesReactions: false,
    note: "5 feet, no reactions provoked, land Speed only, not into difficult terrain."
  },
  crawl: {
    name: "Crawl",
    apCost: 1,
    maxDistance: 5,
    landSpeedOnly: true,
    requiresProne: true,
    provokesReactions: true,
    note: "5 feet while prone."
  },
  // CHARGE (Chapter 4). Armed like the three below it, and for the same
  // reason: the movement itself has to carry the action's rules. Its own
  // limits are checked by charge.mjs rather than by validateArmedMove,
  // because "directly towards your target" is a fact about two tokens
  // and this module knows about neither.
  charge: {
    name: "Charge",
    apCost: 3,
    maxFraction: 2,          // "two Stride actions"
    minDistance: 10,         // "minimum of 10 feet moved"
    landSpeedOnly: false,    // "while Burrowing, Climbing, Flying, or Swimming"
    requiresProne: false,
    provokesReactions: true,
    requiresTarget: true,
    note: "Two Strides towards your target, at least 10 feet, then a melee Strike at +4."
  },
  reposition: {
    name: "Reposition",
    apCost: 2,
    maxFraction: 0.5,
    minDistance: 5,
    landSpeedOnly: false,
    requiresProne: false,
    provokesReactions: true,
    note: "Up to half your Speed, then swap places with an adjacent willing ally."
  }
});

/** Whether an action key is one that arms the next move. */
export function isArmableMovement(actionKey) {
  // A COMPOUND ACTION'S LEG (3.631.0): armed like Step and Charge, its own
  // limit on the actor rather than in this table. See combat/compound-action.mjs.
  if (String(actionKey ?? "") === COMPOUND_LEG_KEY) return true;
  return Object.hasOwn(ARMED_MOVEMENT_ACTIONS, String(actionKey ?? ""));
}

export const COMPOUND_LEG_KEY = "compoundLeg";

/**
 * A compound leg's own check: the move must use the leg's Speed and stay
 * within its limit; it costs no AP of its own.
 */
export function validateCompoundLeg(leg, { moveCost = 0, speedKey = "land" } = {}) {
  const cost = Math.max(0, Number(moveCost) || 0);
  if (!leg) return { allowed: false, reason: "no leg is armed", apCost: 0, limit: null };
  if (leg.speedKey && speedKey && leg.speedKey !== speedKey) {
    return { allowed: false, reason: `${leg.label ?? "this leg"} moves with the ${leg.speedKey} Speed, not ${speedKey}`, apCost: 0, limit: leg.maxFeet };
  }
  if (cost > Number(leg.maxFeet)) {
    return { allowed: false, reason: `${leg.label ?? "this leg"} moves at most ${leg.maxFeet} feet — that move is ${cost}`, apCost: 0, limit: leg.maxFeet };
  }
  return { allowed: true, reason: "", apCost: 0, limit: Number(leg.maxFeet) };
}

/**
 * The furthest an armed action may carry you.
 *
 * @param {string} actionKey
 * @param {number} speed
 * @param {number} [limitBonus] Extra feet granted by a feat to this action's
 *   fixed distance (Graceful Step: Step covers 10 ft rather than 5 for the
 *   same 1 AP — per Graham, one enlarged Step, not two separate ones).
 * @param {{fraction: number, minDistance: number}|null} [fractionOverride]
 *   A feat that turns a fixed distance into a fraction of Speed — Skitter
 *   makes Crawl half your Speed instead of a flat 5 ft (3.378.0).
 *
 *   TAKEN HERE RATHER THAN APPLIED BY THE CALLER, because this function is
 *   the one place that knows how a limit is worked out. A caller that did
 *   its own half-Speed arithmetic would be a second implementation of the
 *   same rule, and the two would drift the first time either moved.
 * @returns {number|null} null when the action imposes no limit.
 */
export function armedMoveLimit(actionKey, speed, limitBonus = 0, fractionOverride = null) {
  const config = ARMED_MOVEMENT_ACTIONS[actionKey];
  if (!config) return null;
  if (fractionOverride) {
    const fraction = Number(fractionOverride.fraction);
    const floor = Number(fractionOverride.minDistance ?? 0);
    if (Number.isFinite(fraction) && fraction > 0) {
      return Math.max(
        Number.isFinite(floor) ? floor : 0,
        Math.floor((Number(speed) || 0) * fraction)
      ) + Math.max(0, Number(limitBonus) || 0);
    }
  }
  if (config.maxDistance != null) return config.maxDistance + Math.max(0, Number(limitBonus) || 0);
  if (config.maxFraction != null) {
    return Math.max(config.minDistance ?? 0, Math.floor((Number(speed) || 0) * config.maxFraction));
  }
  return null;
}

/**
 * Whether an armed move is legal, and what it costs.
 *
 * An armed action charges its own fixed AP rather than joining the
 * cumulative Stride pool: it is a discrete action in its own right, not
 * part of "move up to your Speed".
 *
 * @param {string} actionKey
 * @param {object} options
 * @param {number} options.moveCost
 * @param {number} options.speed
 * @param {boolean} [options.prone]
 * @returns {{allowed: boolean, reason: string, apCost: number, limit: number|null}}
 */
export function validateArmedMove(actionKey, { moveCost, speed, prone = false, limitBonus = 0, fractionOverride = null } = {}) {
  const config = ARMED_MOVEMENT_ACTIONS[actionKey];
  if (!config) return { allowed: false, reason: `${actionKey} is not a movement action`, apCost: 0, limit: null };

  const limit = armedMoveLimit(actionKey, speed, limitBonus, fractionOverride);
  const cost = Math.max(0, Number(moveCost) || 0);

  if (config.requiresProne && !prone) {
    return { allowed: false, reason: `${config.name} requires you to be prone`, apCost: config.apCost, limit };
  }
  if (config.landSpeedOnly && speed <= 0) {
    return { allowed: false, reason: `${config.name} needs a land Speed`, apCost: config.apCost, limit };
  }
  if (limit != null && cost > limit) {
    return {
      allowed: false,
      reason: `${config.name} moves at most ${limit} feet — that move is ${cost}`,
      apCost: config.apCost,
      limit
    };
  }
  return { allowed: true, reason: "", apCost: config.apCost, limit };
}
