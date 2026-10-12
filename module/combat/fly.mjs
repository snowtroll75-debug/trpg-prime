/**
 * Fly (Core 3.1, Chapter 4 — Special Actions). Pure logic; the Foundry
 * side is split between movement-workflow.mjs (the cost of a path and
 * the record that you flew) and documents/combat.mjs (the turn-end
 * fall).
 *
 * The entry is four sentences long and every one of them is a rule:
 *
 *   "You move through the air up to your fly Speed. Moving upward
 *    (straight up or diagonally) uses the rules for moving through
 *    difficult terrain. You can move straight down 10 feet for every 5
 *    feet of movement you spend. If you Fly to the ground, you don't
 *    take falling damage. You can use an action to Fly 0 feet to hover
 *    in place. If you're airborne at the end of your turn and didn't use
 *    a Fly action this round, you fall."
 *
 * Until now the system honoured the first: a fly Speed appeared, the
 * pill appeared, and dragging a token charged Strides against it. The
 * other three cost nothing and did nothing, and the last of them is the
 * one with teeth — a character could hang in the air indefinitely
 * without ever spending an action on it.
 *
 * WHY THE COST RULES ARE EXPRESSED AS AN ADJUSTMENT rather than as a
 * measurement. Foundry already measures a path, and what it measures is
 * not this system's business — recomputing distance here would mean
 * reimplementing whatever grid the scene uses. Every waypoint of a
 * proposed move carries its OWN cost, which is the cost of the step that
 * arrives at it, so the legs are read straight off the path and only the
 * chapter's two modifiers are applied on top. That is the only part that
 * is this system's to decide.
 *
 * A PATH'S WAYPOINTS DO NOT INCLUDE WHERE IT STARTED. Found live on
 * 3.335.0, driving a 20-foot climb: Foundry reported four waypoints at
 * elevations 5, 10, 15 and 20, and building legs between consecutive
 * waypoints therefore silently dropped the first step. The climb was
 * charged 30 feet instead of 40 — the rule was right and the path it was
 * applied to was one leg short. `movement.origin` is where the move
 * began, and it is prepended before anything is counted.
 */

/** The flag holding the round in which this actor last used a Fly action. */
export const FLEW_FLAG = "flewThisRound";

/**
 * "Moving upward ... uses the rules for moving through difficult
 * terrain" — and difficult terrain, in this system, costs double.
 */
export const DIFFICULT_TERRAIN_MULTIPLIER = 2;

/**
 * "You can move straight down 10 feet for every 5 feet of movement you
 * spend" — two feet of descent per foot spent, so the cost is halved.
 *
 * STRAIGHT DOWN, and the adjective is load-bearing. A diagonal descent
 * is not straight down and gets no discount, which is why `groundMoved`
 * is part of the question below rather than only `rise`.
 */
export const DESCENT_FEET_PER_FOOT_SPENT = 2;

/**
 * What one leg of a flight costs.
 *
 * `groundMoved` IS A YES OR NO, not a distance, and deliberately so. The
 * only question the chapter asks of the horizontal is whether there was
 * any — "straight down" means the token did not travel across the map —
 * and a boolean is something a path's own waypoints answer exactly,
 * where a per-leg ground distance would have to be re-measured against
 * the scene's grid and guessed at.
 *
 * @param {object} leg
 * @param {number} leg.cost          Foundry's own cost for this leg.
 * @param {number} [leg.rise]        Elevation gained (negative for a descent).
 * @param {boolean} [leg.groundMoved] Whether the leg also travelled across the map.
 * @returns {number}
 */
export function flyLegCost({ cost = 0, rise = 0, groundMoved = false } = {}) {
  const base = Math.max(0, Number(cost) || 0);
  const climb = Number(rise) || 0;

  // Upward first, because a leg that both climbs and travels is still a
  // leg that climbs — "straight up OR DIAGONALLY" names both.
  if (climb > 0) return base * DIFFICULT_TERRAIN_MULTIPLIER;
  // Straight down, and only straight down.
  if (climb < 0 && !groundMoved) return base / DESCENT_FEET_PER_FOOT_SPENT;
  return base;
}

/**
 * What a whole flight costs, with the climb and the drop kept so the
 * notification can say why the number differs from the one Foundry drew
 * on the ruler.
 *
 * `descentFeet` COUNTS ONLY THE DESCENT THAT WAS DISCOUNTED — the
 * straight-down kind. A diagonal glide loses height too, and reporting
 * it here would put a figure on the notification that the arithmetic
 * beside it does not use, which is how a correct number comes to look
 * like a bug.
 *
 * @param {Array<{cost:number, rise?:number, groundMoved?:boolean}>} legs
 * @returns {{cost:number, base:number, ascentFeet:number, descentFeet:number, adjusted:boolean}}
 */
export function flyPathCost(legs = []) {
  let cost = 0;
  let base = 0;
  let ascentFeet = 0;
  let descentFeet = 0;
  for (const leg of legs ?? []) {
    const rise = Number(leg?.rise) || 0;
    base += Math.max(0, Number(leg?.cost) || 0);
    cost += flyLegCost(leg);
    if (rise > 0) ascentFeet += rise;
    else if (rise < 0 && !leg?.groundMoved) descentFeet += -rise;
  }
  // Rounded rather than left fractional: a half-foot of Striding is not a
  // thing the AP arithmetic upstream can spend, and the ruler the player
  // just read was in whole feet.
  cost = Math.round(cost * 100) / 100;
  return { cost, base, ascentFeet, descentFeet, adjusted: cost !== base };
}

/**
 * The legs of a path: where it began, then every waypoint in turn.
 *
 * THE ORIGIN IS A SEPARATE ARGUMENT because Foundry does not put it in
 * the waypoint list — the waypoints are the destinations of each step,
 * and the first of them is already one step from the start. Omitting it
 * loses the first leg of every flight, which is precisely the defect
 * 3.335.0 shipped with and live testing caught.
 *
 * EACH WAYPOINT'S OWN `cost` is used rather than a re-measurement. It is
 * Foundry's figure for the step that arrives there, so the legs sum to
 * exactly the path cost the engine reports and nothing has to know what
 * kind of grid the scene has.
 *
 * @param {{x:number, y:number, elevation?:number}} origin Where the move began.
 * @param {Array<{x:number, y:number, elevation?:number, cost?:number}>} waypoints
 * @returns {Array<{cost:number, rise:number, groundMoved:boolean}>}
 */
export function flightLegs(origin, waypoints = []) {
  const points = [origin, ...(waypoints ?? [])].filter(Boolean);
  const legs = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    legs.push({
      cost: Math.max(0, Number(b?.cost) || 0),
      rise: (Number(b?.elevation) || 0) - (Number(a?.elevation) || 0),
      groundMoved:
        (Number(b?.x) || 0) !== (Number(a?.x) || 0) || (Number(b?.y) || 0) !== (Number(a?.y) || 0)
    });
  }
  return legs;
}

/** Above the ground. */
export function airborne(elevation) {
  return (Number(elevation) || 0) > 0;
}

/**
 * Did this actor use a Fly action in this round?
 *
 * The flag stores the ROUND NUMBER rather than a boolean, so a stale
 * true from three rounds ago cannot keep a character aloft — and so
 * nothing has to remember to clear it.
 *
 * @param {*} flag
 * @param {number} round
 * @returns {boolean}
 */
export function flewThisRound(flag, round) {
  const stored = Number(flag);
  if (!Number.isFinite(stored)) return false;
  return stored === (Number(round) || 0);
}

/**
 * "If you're airborne at the end of your turn and didn't use a Fly
 * action this round, you fall."
 *
 * THREE THINGS HAVE TO BE TRUE and each one is a separate mercy:
 *
 * - You are off the ground. A character who flew down and landed is at
 *   elevation 0 and does not fall, which is the same sentence as "if you
 *   Fly to the ground, you don't take falling damage" seen from the
 *   other side.
 * - You did not Fly this round. Hovering is a Fly action of 0 feet, so
 *   the character who spent an action to stay put has spent it.
 * - You have a fly Speed at all. The rule lives inside the Fly action,
 *   whose Requirements are "you have a fly speed" — a wizard held up by
 *   a spell is aloft by something else's rules and is not dropped by
 *   this one.
 *
 * @param {object} args
 * @param {number} [args.elevation]
 * @param {*} [args.flyFlag]
 * @param {number} [args.round]
 * @param {number} [args.flySpeed]
 * @returns {{falls: boolean, distance: number, reason: string}}
 */
export function fallsAtTurnEnd({ elevation = 0, flyFlag = null, round = 0, flySpeed = 0, hover = false } = {}) {
  const height = Math.max(0, Number(elevation) || 0);
  if (!airborne(height)) return { falls: false, distance: 0, reason: "on the ground" };
  if ((Number(flySpeed) || 0) <= 0) return { falls: false, distance: 0, reason: "no fly Speed" };
  // HOVER (Creature Codex; 3.631.0): "does not have to expend an AP to
  // remain in the air when flying" — Wingless Flight grants the same.
  if (hover) return { falls: false, distance: 0, reason: "hovers (Hover)" };
  if (flewThisRound(flyFlag, round)) {
    return { falls: false, distance: 0, reason: "used a Fly action this round" };
  }
  return {
    falls: true,
    distance: height,
    reason: "airborne at the end of your turn with no Fly action this round"
  };
}

/**
 * GROUND ACTIONS IN THE AIR (page 201; Graham's R1 of 21 September 2026).
 *
 *   "The GM makes the final decision as to whether certain actions that
 *    are typically performed on the ground would be feasible or
 *    effective in the air. For instance, a flying creature would face
 *    limitations when it comes to executing a Jump (Athletics) action,
 *    as the mechanics of jumping rely upon solid ground for propulsion."
 *
 * A NOTE, NOT A REFUSAL. The page hands the decision to the GM twice in
 * one paragraph, so the card carries the sentence and the call stays at
 * the table — the same shape the unusual-surface and underwater notes
 * take.
 *
 * THE SYSTEM ALREADY KNEW. `airborne` has existed since flight was
 * automated and was consulted by exactly one rule, the end-of-turn fall,
 * so a character at forty feet could Jump, go Prone and take cover
 * behind a rock without anything remarking on it.
 *
 * @param {object} state
 * @param {boolean} [state.airborne]
 * @param {string} [state.actionName]
 * @returns {string} the card's sentence, or ""
 */
export function airborneActionNote({ airborne: aloft = false, actionName = "" } = {}) {
  if (!aloft || !actionName) return "";
  const jumping = /\bjump\b/i.test(actionName);
  return `<strong>${actionName} while airborne.</strong> Page 201: the GM decides whether an `
    + "action usually performed on the ground works in the air"
    + (jumping ? " — jumping in particular relies on solid ground for propulsion" : "")
    + ".";
}
