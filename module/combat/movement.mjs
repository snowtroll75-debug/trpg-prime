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

/**
 * IS THIS FOUNDRY ACTION A TELEPORT? (3.680.1; Graham, 2 November 2026,
 * after the Eldritch Arts 0.5.0 live test.) Foundry V14 says so itself:
 * `CONFIG.Token.movement.actions[action].teleport`, true for blink and
 * displace. Read from there, so a module's own teleporting action counts;
 * blink and displace by name only where Foundry's table is absent (the
 * harness).
 *
 * @param {string} action
 * @param {object} [actions] CONFIG.Token.movement.actions
 */
export function isTeleportAction(action, actions = globalThis.CONFIG?.Token?.movement?.actions) {
  const def = actions?.[String(action ?? "")];
  if (def && typeof def.teleport === "boolean") return def.teleport;
  return ["blink", "displace"].includes(String(action ?? ""));
}

/**
 * EVERY GRID SQUARE A PROPOSED PATH TOUCHES, IN ORDER (moved here from
 * movement-workflow.mjs at 3.680.1, so it can be driven).
 *
 * A walked leg is SAMPLED square by square, not just at its corners: a
 * straight drag across four squares is TWO waypoints, and the creature in
 * the middle of it is the one page 198 is about.
 *
 * A TELEPORTED LEG IS NOT (3.680.1). A teleport does not pass through the
 * squares between where it leaves and where it lands, so nothing is
 * sampled between them, and the square it lands on before another leg is
 * marked `landing`: the creature is there, it did not move through it.
 * Before, a Blink drag with waypoints was sampled like a walk, and refused
 * as "would move through" any creature on the straight line between hops.
 * The square the whole move ends on is never a landing: page 198's "you
 * cannot end your turn in a space already occupied" is asked of it as of
 * any move.
 *
 * @param {Array<{x:number,y:number,action?:string}>} waypoints
 * @param {number} grid the grid size in pixels
 * @param {object} [actions] CONFIG.Token.movement.actions
 * @returns {Array<{col:number,row:number,landing?:boolean}>}
 */
export function pathSquaresOf(waypoints, grid = 100, actions = globalThis.CONFIG?.Token?.movement?.actions) {
  const size = Number(grid) || 100;
  const points = (waypoints ?? []).filter((w) => Number.isFinite(Number(w?.x)) && Number.isFinite(Number(w?.y)));
  const out = [];
  const push = (x, y, landing = false) => {
    const square = { col: Math.round(Number(x) / size), row: Math.round(Number(y) / size) };
    const last = out.at(-1);
    if (last && last.col === square.col && last.row === square.row) return;
    if (landing) square.landing = true;
    out.push(square);
  };
  for (let i = 0; i < points.length; i++) {
    const teleported = isTeleportAction(points[i].action, actions);
    if (i > 0 && !teleported) {
      const a = points[i - 1];
      const b = points[i];
      const steps = Math.max(Math.abs(Number(b.x) - Number(a.x)), Math.abs(Number(b.y) - Number(a.y))) / size;
      for (let s = 1; s < steps; s++) {
        push(Number(a.x) + (Number(b.x) - Number(a.x)) * (s / steps), Number(a.y) + (Number(b.y) - Number(a.y)) * (s / steps));
      }
    }
    push(points[i].x, points[i].y, teleported && i < points.length - 1);
  }
  return out;
}

/**
 * The squares a path MOVES THROUGH: all but the last, less a teleport's
 * landings (see `pathSquaresOf`). Page 198's passage rules are asked of these.
 * @param {Array<{col:number,row:number,landing?:boolean}>} squares
 */
export function crossedSquares(squares) {
  return (squares ?? []).slice(0, -1).filter((s) => !s.landing);
}

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
 * THE COST AN ARMED ACTION'S CARD HEADER SHOWS (3.684.8): the cost this
 * character pays (`armedApCost`, Sudden Charge's 2 for a Charge) when it
 * differs from the printed one; otherwise `undefined`, so the header keeps
 * the printed cost exactly as it was.
 *
 * @param {string|number} printed the action entry's apCost
 * @param {string|number} pays what `armedMovementSummary` says the move costs
 * @returns {string|undefined}
 */
export function armedHeaderCost(printed, pays) {
  const a = String(printed ?? "").trim(), b = String(pays ?? "").trim();
  if (!/^\d+$/.test(a) || !/^\d+$/.test(b) || Number(a) === Number(b)) return undefined;
  return b;
}

/**
 * WHAT AN ARMED MOVE COUNTS AS (3.684.2; Agile Display). A compound leg may
 * say it is a Step (`countsAs: "step"` on its flag), so that what keys on a
 * Step — Feather Step's terrain relief, a Step-only restricted point — reads
 * the leg as one. Only a key the armed table knows is honoured; anything
 * else, and every non-leg key, is answered as itself.
 *
 * Graham, 5 November 2026: "When activated, this should allow the character
 * to step as a free (0 AP) action but does not seem to work."
 *
 * @param {string|null} armed the armed key on the actor
 * @param {object|null} leg the compound leg's flag, when one is armed
 * @returns {string|null}
 */
export function armedMovementKind(armed, leg = null) {
  if (String(armed ?? "") !== COMPOUND_LEG_KEY) return armed ?? null;
  const as = String(leg?.countsAs ?? "").trim().toLowerCase();
  return as && as !== COMPOUND_LEG_KEY && Object.hasOwn(ARMED_MOVEMENT_ACTIONS, as) ? as : COMPOUND_LEG_KEY;
}

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

/* ------------------------------------------------------------------ */
/* Movement this turn (3.683.0; Eldritch Arts Block 5, seam C17)        */
/* ------------------------------------------------------------------ */

/**
 * The flag a Movement-trait action's AP is recorded under when it is spent
 * OUTSIDE the drag (Stand, Climb, Swim, a Jump, Tumble …), keyed by the turn
 * it was spent on: `{ combatId, round, turn, ap }`. Written by
 * `spendActionPoints` (action-points-workflow.mjs).
 */
export const MOVEMENT_TRAIT_AP_FLAG = "movementTraitAp";

/**
 * Does this AP spend count as AP spent on movement, beside the drag's own?
 *
 * THE DRAG IS COUNTED BY ITS POOLS, and passes a `use` ("stride", "step",
 * "move") when it spends; counting it here as well would count it twice. So
 * only a spend with no `use` and the Movement trait counts: an action
 * resolved by name (resolveAction passes the action's traits). The book's
 * word is "Movement" (data/basic-actions.mjs, data/skill-actions.mjs);
 * "Move" is read too.
 *
 * @param {{use?: string|null, traits?: string|string[]}} spend
 * @returns {boolean}
 */
export function countsAsMovementAp({ use = null, traits = "" } = {}) {
  if (String(use ?? "").trim()) return false;
  const text = Array.isArray(traits) ? traits.join(",") : String(traits ?? "");
  return /\bmove(?:ment)?\b/i.test(text);
}

/**
 * The next Movement-trait record after a spend of `ap` on this turn.
 * A record from another turn is replaced, never added to.
 */
export function nextMovementTraitRecord(record, ap, turn = {}) {
  const spent = Math.max(0, Math.trunc(Number(ap) || 0));
  const same = record && record.combatId === turn.combatId && record.round === turn.round && record.turn === turn.turn;
  return { combatId: turn.combatId ?? null, round: turn.round ?? null, turn: turn.turn ?? null, ap: (same ? Math.max(0, Number(record.ap) || 0) : 0) + spent };
}

/**
 * HOW FAR THIS CREATURE HAS MOVED THIS TURN, AND WHAT IT HAS SPENT ON MOVING
 * (3.683.0, seam C17). Skyborne Agility, Astral Drift ("after spending all 3
 * AP on movement actions"), Shadow's Discipline and Veilstride ("When you
 * move at least 10 ft … before making a melee attack"; Graham, Q72: "10 ft or
 * more of your own movement this turn (a teleport is not moving)").
 *
 *   feet          the MEASURED distance of the turn's own moves, every pool
 *                 (Strides at any Speed, Steps, Crawls, Charges, Repositions,
 *                 a compound action's leg) — the ruler's distance, NOT the
 *                 terrain-priced cost. A teleport is no pool's: it is not
 *                 Speed-governed, the movement workflow never charges it.
 *   apOnMovement  the AP those pools charged, plus the AP of Movement-trait
 *                 actions spent on THIS turn outside the drag (`record`).
 *
 * Pools are the movement workflow's, cleared at the start of the creature's
 * turn (`resetMovementForTurn`); they are kept only for moves on its own
 * turn in a running combat, which is when "this turn" means anything.
 *
 * @param {object} pools    movementState(actor).pools
 * @param {object|null} record the MOVEMENT_TRAIT_AP_FLAG record
 * @param {{combatId, round, turn}} turn the turn being asked about
 * @returns {{feet: number, apOnMovement: number}}
 */
export function movementThisTurnFrom(pools = {}, record = null, turn = {}) {
  let feet = 0;
  let ap = 0;
  for (const pool of Object.values(pools ?? {})) {
    feet += Math.max(0, Number(pool?.movedFeet) || 0);
    ap += Math.max(0, Number(pool?.apCharged) || 0);
  }
  const same = record && record.combatId === turn?.combatId && record.round === turn?.round && record.turn === turn?.turn;
  if (same) ap += Math.max(0, Number(record.ap) || 0);
  return { feet, apOnMovement: ap };
}
