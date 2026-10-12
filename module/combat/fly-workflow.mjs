/**
 * Fly — the Foundry side of fly.mjs.
 *
 * Three jobs, and they live in three different places in the engine, so
 * they are gathered here rather than scattered across their hosts:
 *
 *   the cost of a flown path          called from movement-workflow.mjs
 *   the record that you flew          called from both of the above and
 *                                     from the action workflow's hover
 *   the fall at the end of your turn  called from documents/combat.mjs
 */
import { FLEW_FLAG, fallsAtTurnEnd, flightLegs, flyPathCost } from "./fly.mjs";
import { rollFalling } from "./falling-workflow.mjs";
import { speedValue } from "./speed-pool.mjs";
import { abilitiesHover } from "../creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Note that this actor has used a Fly action in the current round.
 *
 * A ROUND NUMBER, NOT A BOOLEAN — see flewThisRound. Outside an
 * encounter there are no rounds and nothing falls at the end of a turn
 * that does not exist, so nothing is written.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} whether anything was recorded.
 */
export async function recordFlyAction(actor) {
  if (!actor) return false;
  if (!game.combat?.started) return false;
  await actor.setFlag(SYSTEM_ID, FLEW_FLAG, Number(game.combat.round ?? 0));
  return true;
}

/** Every waypoint of a proposed movement, in order. */
export function movementWaypoints(movement) {
  return [
    ...(movement?.passed?.waypoints ?? []),
    ...(movement?.pending?.waypoints ?? [])
  ].filter(Boolean);
}

/**
 * What a flown path costs, with the chapter's two modifiers applied.
 *
 * NO GRID, NO MEASUREMENT. Every waypoint carries the cost of the step
 * that arrives at it, so the legs sum to exactly the figure the engine
 * reports and this never has to know what kind of grid the scene has.
 * The earlier version re-measured each leg through `canvas.grid` and was
 * wrong twice over: it approximated Foundry's own arithmetic, and it
 * built legs only BETWEEN waypoints — losing the step from the origin to
 * the first of them, which undercharged a 20-foot climb by a quarter.
 *
 * Returns null when there is nothing to work from — no origin, no
 * waypoints — so the caller keeps Foundry's own figure rather than
 * silently charging zero.
 *
 * @param {object} movement
 * @returns {{cost:number, base:number, ascentFeet:number, descentFeet:number, adjusted:boolean}|null}
 */
export function flyMovementCost(movement) {
  const origin = movement?.origin;
  if (!origin) return null;
  const waypoints = movementWaypoints(movement);
  if (!waypoints.length) return null;
  return flyPathCost(flightLegs(origin, waypoints));
}

/**
 * "If you're airborne at the end of your turn and didn't use a Fly
 * action this round, you fall."
 *
 * The token is brought to the ground before the roll rather than after
 * it: the character IS falling, and a dialog left open on a distracted
 * GM's screen should not leave them hovering in the meantime.
 *
 * @param {Combatant} combatant
 * @param {number} round
 * @returns {Promise<{fell:boolean, distance:number}>}
 */
export async function resolveTurnEndFall(combatant, round) {
  const actor = combatant?.actor;
  const token = combatant?.token;
  if (!actor || !token) return { fell: false, distance: 0 };

  const verdict = fallsAtTurnEnd({
    elevation: token.elevation,
    flyFlag: actor.getFlag?.(SYSTEM_ID, FLEW_FLAG),
    round,
    // The POOL was being handed to a numeric test — see combat/movement.mjs.
    flySpeed: speedValue(actor.system?.combat?.movement?.fly),
    hover: abilitiesHover(Array.from(actor.items ?? []))
  });
  if (!verdict.falls) return { fell: false, distance: 0 };

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="trg-prime trg-check-card"><header class="check-header">` +
      `<div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Fly — You Fall</h3></div>` +
      `</header><p style="margin:2px 0">Airborne at the end of the turn with no Fly action used this round — ` +
      `${actor.name} drops <strong>${verdict.distance} ft</strong>.</p></div>`
  });

  await token.update({ elevation: 0 });
  await rollFalling(actor, { distance: verdict.distance });
  return { fell: true, distance: verdict.distance };
}
