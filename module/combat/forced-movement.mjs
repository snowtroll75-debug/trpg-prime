/**
 * Forced movement — pushing a creature away from a source.
 *
 * NEW at 3.376.0.
 *
 * WHAT THIS IS FOR. Shove's success and critical both say the target is
 * "pushed back 5 feet" / "pushed up to 10 feet away", and **nothing moved
 * anything**. Driven live on 23 August 2026 at both degrees: the card
 * printed the sentence, the target's token document did not change by a
 * pixel, and the card carried no button, no `data-action` and no flag.
 * It was note-only without being *declared* note-only, which is the worst
 * of the three states — a reader cannot tell a decision from an omission.
 *
 * It is not one action. The same sentence appears in **14 critical-table
 * entries** ("Target is pushed back 5'" ten times, "10'" four times), none
 * of which were read either. Graham's ruling, 23 August 2026: build one
 * mechanism, offer it as **a button on the card**, and point both Shove
 * and the critical tables at it.
 *
 * WHY A BUTTON AND NOT AUTOMATIC. His own steer on Attack of Opportunity
 * a day earlier — *"Perhaps all we need here is a prompt on the chat
 * log"* — and it applies with more force here, because a push moves
 * somebody else's token. The system works out the direction, the distance
 * and where the path runs out; a person presses the button.
 *
 * EVERYTHING HERE IS PURE. Geometry takes numbers and a `isBlocked`
 * predicate and returns a plan; the Foundry half supplies the predicate
 * and performs the update. That split is what lets a harness drive walls,
 * occupied squares and grid sizes this project's world does not contain.
 *
 * ON THE GUARDS. Every invalid input returns `{ok: false, reason}` and
 * never a benign zero-distance plan. §5.4 of the handover was paid for by
 * `lightConcealment`, whose guard turned a caller's mistake into a polite
 * "not concealed" and hid a broken rule for a whole release. A push that
 * silently declines to move anything looks exactly like a push that was
 * correctly blocked, and the two must not be confusable.
 */

/**
 * Where a token actually IS, as opposed to where it is being drawn.
 *
 * NEW at 3.376.1, and it fixed a live defect rather than anticipating one.
 * A Foundry TokenDocument carries two positions: `_source.x`, the stored
 * value, and `x`, the PREPARED value, which follows the movement
 * animation. During a move they disagree — measured on 23 August 2026
 * with a token whose stored x was 800 while its prepared x still read
 * 600, two pushes behind.
 *
 * `planPushFromIds` read the prepared value, so a second push was planned
 * from where the target used to be. The plan came back "10 ft, nothing in
 * the way", the token travelled 5, and the card announced 10 — the
 * §5.9 shape exactly: the system did one thing and told the player
 * another, with nothing on screen disagreeing with itself.
 *
 * PURE, AND HERE RATHER THAN IN THE WORKFLOW, because "which of a
 * token's two positions counts" is a decision, and decisions that live
 * inside Foundry-only functions are this project's recurring defect. A
 * harness can hand this a `{x, _source}` pair and watch it choose.
 *
 * @param {object} token Anything with `x`/`y` and optionally `_source`.
 * @returns {{x: number, y: number}|null} Null when neither is usable —
 *   never a `{x: 0, y: 0}`, which would silently push from the corner of
 *   the map.
 */
export function storedPosition(token) {
  if (!token) return null;
  const x = Number(token._source?.x ?? token.x);
  const y = Number(token._source?.y ?? token.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

/**
 * The eight grid directions, indexed by octant of the source→target angle.
 * Screen coordinates: +y is down, so index 2 is "south" on the canvas.
 */
const OCTANTS = Object.freeze([
  Object.freeze({ dx: 1, dy: 0 }),
  Object.freeze({ dx: 1, dy: 1 }),
  Object.freeze({ dx: 0, dy: 1 }),
  Object.freeze({ dx: -1, dy: 1 }),
  Object.freeze({ dx: -1, dy: 0 }),
  Object.freeze({ dx: -1, dy: -1 }),
  Object.freeze({ dx: 0, dy: -1 }),
  Object.freeze({ dx: 1, dy: -1 })
]);

/**
 * The grid direction that continues the line from the source through the
 * target — i.e. directly away from whoever is doing the pushing.
 *
 * Snapped to one of eight, because a square grid has eight neighbours and
 * a true-angle push would land a token off-grid on almost every shove.
 *
 * @param {number} sourceX Pushing creature's centre.
 * @param {number} sourceY
 * @param {number} targetX Pushed creature's centre.
 * @param {number} targetY
 * @returns {{dx: number, dy: number}|null} Null when the two share a point,
 *   which has no "away" — the caller must say so rather than guess.
 */
export function pushDirection(sourceX, sourceY, targetX, targetY) {
  const dx = Number(targetX) - Number(sourceX);
  const dy = Number(targetY) - Number(sourceY);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (dx === 0 && dy === 0) return null;
  const octant = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return OCTANTS[((octant % 8) + 8) % 8];
}

/**
 * Plan a push, stopping wherever the path first runs out.
 *
 * The plan is returned rather than applied so that the card can describe
 * it before anybody commits to it, and so the same numbers can be checked
 * without a canvas.
 *
 * @param {object} options
 * @param {number} options.sourceCentreX Pusher's centre, for direction only.
 * @param {number} options.sourceCentreY
 * @param {number} options.targetCentreX Pushed token's centre, for direction.
 * @param {number} options.targetCentreY
 * @param {number} options.targetX Pushed token's top-left — what gets moved.
 * @param {number} options.targetY
 * @param {number} options.feet How far the outcome says to push.
 * @param {number} options.gridDistance Feet represented by one square.
 * @param {number} options.gridSize Pixels per square.
 * @param {(x: number, y: number, step: number) => boolean} [options.isBlocked]
 *   Called with each candidate top-left. True stops the push short of it.
 * @returns {object} `{ok: false, reason}`, or a plan.
 */
export function plannedPush({
  sourceCentreX,
  sourceCentreY,
  targetCentreX,
  targetCentreY,
  targetX,
  targetY,
  feet,
  gridDistance,
  gridSize,
  isBlocked = () => false
} = {}) {
  const distance = Number(feet);
  const perSquare = Number(gridDistance);
  const pixels = Number(gridSize);

  if (!Number.isFinite(distance) || distance <= 0) {
    return { ok: false, reason: `a push needs a positive distance, not ${JSON.stringify(feet)}` };
  }
  if (!Number.isFinite(perSquare) || perSquare <= 0) {
    return { ok: false, reason: `the scene's grid distance is unusable (${JSON.stringify(gridDistance)})` };
  }
  if (!Number.isFinite(pixels) || pixels <= 0) {
    return { ok: false, reason: `the scene's grid size is unusable (${JSON.stringify(gridSize)})` };
  }
  if (!Number.isFinite(Number(targetX)) || !Number.isFinite(Number(targetY))) {
    return { ok: false, reason: "the pushed token has no position on this scene" };
  }

  // A push shorter than one square cannot be shown on a square grid, and
  // rounding it to zero would look exactly like a push that was blocked.
  // Naming it is the only honest option.
  const exactSquares = distance / perSquare;
  if (!Number.isInteger(exactSquares)) {
    return {
      ok: false,
      reason: `${distance} ft does not divide into this scene's ${perSquare} ft squares`
    };
  }

  const direction = pushDirection(sourceCentreX, sourceCentreY, targetCentreX, targetCentreY);
  if (!direction) {
    return {
      ok: false,
      reason: "the two creatures share the same point, so there is no direction to push away in"
    };
  }

  const path = [];
  let x = Number(targetX);
  let y = Number(targetY);
  let stoppedShort = false;
  let blockedAt = null;

  for (let step = 1; step <= exactSquares; step += 1) {
    const nextX = x + direction.dx * pixels;
    const nextY = y + direction.dy * pixels;
    if (isBlocked(nextX, nextY, step)) {
      stoppedShort = true;
      blockedAt = { x: nextX, y: nextY, step };
      break;
    }
    x = nextX;
    y = nextY;
    path.push({ x, y });
  }

  return {
    ok: true,
    direction,
    requestedFeet: distance,
    requestedSquares: exactSquares,
    path,
    finalX: x,
    finalY: y,
    movedSquares: path.length,
    movedFeet: path.length * perSquare,
    moved: path.length > 0,
    stoppedShort,
    blockedAt
  };
}

/**
 * A one-line, human description of what a plan will do.
 *
 * Kept beside the geometry rather than in the card template so that the
 * sentence a player reads is checkable without Foundry — the Grapple
 * lesson at §5.9, where the table was corrected and the card went on
 * describing the outcome it used to have.
 *
 * @param {object} plan A `plannedPush` result.
 * @param {string} targetName
 * @returns {string}
 */
/**
 * HOW MUCH SHORTER A PUSH IS FOR THIS CREATURE (3.669.0; Inner Tempest's
 * Immovable Plating: "whenever a physical effect would forcibly move you,
 * reduce the distance moved by 5 feet, to a minimum of 0 feet"). The sum of
 * `flags.trg-prime.forcedMovementReduction` (feet) on its declaration
 * carriers.
 */
export function forcedMovementReduction(carriers = []) {
  let feet = 0;
  for (const c of carriers ?? []) {
    const n = Number(c?.flags?.["trg-prime"]?.forcedMovementReduction);
    if (Number.isFinite(n) && n > 0) feet += Math.trunc(n);
  }
  return feet;
}

/** The push's feet after a reduction, never below 0. */
export function reducedPushFeet(feet, reduction = 0) {
  return Math.max(0, Math.trunc(Number(feet) || 0) - Math.max(0, Math.trunc(Number(reduction) || 0)));
}

export function describePush(plan, targetName = "The target") {
  if (!plan?.ok) return `No push: ${plan?.reason ?? "unknown reason"}.`;
  const reduced = plan.reducedBy ? ` (${plan.reducedBy} ft shorter: ${plan.reducedLabel || "it resists being moved"})` : "";
  if (plan.reducedBy && !plan.requestedFeet) return `${targetName} is not moved${reduced}.`;
  if (!plan.moved) {
    return `${targetName} cannot be pushed — something is in the way immediately behind them.`;
  }
  if (plan.stoppedShort) {
    return `${targetName} is pushed ${plan.movedFeet} ft of the ${plan.requestedFeet} ft `
      + "and stops there — something is in the way.";
  }
  return `${targetName} is pushed ${plan.movedFeet} ft${reduced}.`;
}

/**
 * The table prompts a push should carry (Chapter 2, Storgar).
 *
 * GRAHAM'S RULING, 10 September 2026, on the printed line "resist being
 * shoved or moved involuntarily": *"create this as a text prompt for the
 * character… Each situation should be gauged at the time and there are
 * far too many variables."*
 *
 * So this is deliberately NOT a roll and NOT a modifier. Shove already
 * applies the +2 to the defender's DC (defence-dc.mjs, ruled 16 Aug
 * 2026) because Shove is a contest with a DC to move. Every other route
 * a creature is moved against its will — a critical-table push, a
 * spell's forced movement — has no contest to attach a bonus to, and
 * inventing one would be inventing a rule. A line on the card at the
 * moment the push is offered puts the printed sentence in front of the
 * people who can judge it.
 *
 * Carried on a FLAG rather than a feat name, for the reason the terrain
 * rule was rebuilt that way at 3.552.0: a heritage, a feat, a spell or
 * an item can all print a rule, and a name test can only ever see one
 * of them.
 *
 * @param {object} actor The creature being moved.
 * @returns {string[]} Lines to show, empty when there are none.
 */
export function involuntaryMovementPrompts(actor) {
  const notes = [];
  const carriers = [
    ...Array.from(actor?.items ?? []),
    ...Array.from(actor?.appliedEffects ?? actor?.effects ?? []).filter((e) => !e?.disabled)
  ];
  for (const carrier of carriers) {
    const note = carrier?.flags?.["trg-prime"]?.involuntaryMovementNote;
    const text = String(note ?? "").trim();
    if (!text) continue;
    const label = String(carrier?.name ?? "").trim();
    const line = label ? `${label}: ${text}` : text;
    if (!notes.includes(line)) notes.push(line);
  }
  return notes;
}
