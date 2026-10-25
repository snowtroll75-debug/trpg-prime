/**
 * Forced movement — the Foundry half.
 *
 * NEW at 3.376.0. The decisions live in `forced-movement.mjs`, which is
 * pure and drivable; this file does only the three things that need a
 * live canvas: work out what blocks a square, move the token, and write
 * the result back onto the card.
 *
 * THE SPLIT IS THE POINT. The handover's recurring defect shape is "a
 * decision made inside a Foundry-only function that no harness can call",
 * and forced movement is full of decisions worth checking — which way is
 * away, how far a push actually travels, what happens when the second
 * square of a two-square push is a wall. None of those are in here.
 *
 * THE APPLIED STATE IS RE-READ FROM THE FLAG ON EVERY RENDER, not left to
 * the DOM edits made at click time. `check-card-interactions.mjs` learned
 * that the hard way on the critical-adjust buttons: the render hook fires
 * again on the very `setFlag` the handler performs, rebuilding the card
 * from stored HTML that still holds live-looking buttons, and the buttons
 * visibly re-enabled after use.
 */

import { describePush, forcedMovementReduction, plannedPush, reducedPushFeet, storedPosition } from "./forced-movement.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * A predicate that reports whether a token may not stand at a top-left.
 *
 * Two things stop a push: a wall between where the token is and where the
 * next square would put it, and another creature already standing there.
 * Both are checked against the CENTRES of the squares, because a token's
 * stored `x`/`y` is its top-left corner and testing corners would let a
 * push slip diagonally past a wall it should have hit.
 *
 * NOT EXPORTED, deliberately. It cannot run without a canvas, so no
 * harness can drive it and nothing outside this file has any use for it;
 * exporting it would add an entry to the uncalled-rules backlog that
 * looks like an unwired rule and is not one. The decisions worth checking
 * were extracted into `forced-movement.mjs` instead.
 *
 * @param {object} scene
 * @param {object} movingToken The TokenDocument being pushed — never blocks itself.
 * @returns {(x: number, y: number) => boolean}
 */
function blockedSquareTest(scene, movingToken) {
  const gridSize = Number(scene?.grid?.size ?? 0);
  const halfWidth = (Number(movingToken?.width ?? 1) * gridSize) / 2;
  const halfHeight = (Number(movingToken?.height ?? 1) * gridSize) / 2;
  // NAMED `squareCentre`, not `centreOf`, and the name matters. The
  // uncalled-exports ratchet matches on IDENTIFIERS APPEARING OUTSIDE
  // THEIR OWN FILE, not on imports — so a local called `centreOf` here
  // marked `charge-workflow.mjs#centreOf`, a genuinely dead export, as
  // having found a caller. It is §5.2 in reverse: there, a name appearing
  // was mistaken for an import; here, a name appearing was mistaken for a
  // call. Recorded in the tool's own header too, because the next
  // collision will not be this one.
  const squareCentre = (x, y) => ({ x: x + halfWidth, y: y + halfHeight });

  const others = Array.from(scene?.tokens ?? [])
    .filter((t) => t.id !== movingToken?.id)
    .map((t) => ({ token: t, at: storedPosition(t) }))
    .filter((entry) => entry.at);

  return (x, y) => {
    // STORED, not prepared — see `storedPosition`. The prepared value
    // trails the movement animation, and planning a push from where a
    // token is being drawn rather than where it is produced a card that
    // announced 10 ft for a 5 ft move.
    const here = storedPosition(movingToken);
    if (!here) return true;
    const from = squareCentre(here.x, here.y);
    const to = squareCentre(x, y);

    // A wall anywhere along the way.
    const backend = CONFIG?.Canvas?.polygonBackends?.move;
    if (backend?.testCollision) {
      try {
        if (backend.testCollision(from, to, { type: "move", mode: "any" })) return true;
      } catch (err) {
        // A collision test that throws must not be read as "clear" — that
        // is the §5.4 shape, a guard swallowing the caller's problem. Treat
        // it as blocked and say so, so a push stops short rather than
        // sliding a token through a wall nobody tested.
        console.warn(`${SYSTEM_ID} | forced movement: wall test failed, treating the square as blocked`, err);
        return true;
      }
    }

    // Another creature's space.
    for (const { token: other, at } of others) {
      const oW = Number(other.width ?? 1) * gridSize;
      const oH = Number(other.height ?? 1) * gridSize;
      if (to.x >= at.x && to.x < at.x + oW && to.y >= at.y && to.y < at.y + oH) return true;
    }
    return false;
  };
}

/**
 * Work out what a push would do, from ids alone.
 *
 * NOT EXPORTED, for the same reason as `blockedSquareTest`: it reads
 * `game.scenes` and cannot run outside Foundry, so an export would be an
 * orphan in the backlog rather than a rule anybody could check.
 *
 * @param {object} payload `{sceneId, sourceTokenId, targetTokenId}`
 * @param {number} feet
 * @returns {{plan: object, targetToken: object|null}}
 */
function planPushFromIds(payload, feet) {
  const scene = game.scenes?.get(payload?.sceneId);
  const sourceToken = scene?.tokens?.get(payload?.sourceTokenId);
  const targetToken = scene?.tokens?.get(payload?.targetTokenId);
  if (!scene || !sourceToken || !targetToken) {
    return {
      plan: { ok: false, reason: "the scene or one of the two tokens is no longer there" },
      targetToken: null
    };
  }
  const gridSize = Number(scene.grid?.size ?? 0);
  // Every position below is the STORED one. Mixing the two — planning
  // from a stored origin against prepared blockers, or the reverse —
  // is how a push comes out right in a quiet moment and wrong the
  // instant anything is still animating.
  const sourceAt = storedPosition(sourceToken);
  const targetAt = storedPosition(targetToken);
  if (!sourceAt || !targetAt) {
    return {
      plan: { ok: false, reason: "one of the two tokens has no usable position on this scene" },
      targetToken: null
    };
  }
  const half = (token, at) => ({
    x: at.x + (Number(token.width ?? 1) * gridSize) / 2,
    y: at.y + (Number(token.height ?? 1) * gridSize) / 2
  });
  const sourceCentre = half(sourceToken, sourceAt);
  const targetCentre = half(targetToken, targetAt);
  // A CREATURE THAT RESISTS BEING MOVED (3.669.0): the push is shorter.
  const reduction = forcedMovementReduction(targetToken.actor ? declarationCarriers(targetToken.actor) : []);
  const requested = feet;
  feet = reducedPushFeet(feet, reduction);
  if (reduction && feet <= 0) {
    return { targetToken, plan: { ok: true, moved: false, movedFeet: 0, requestedFeet: 0, reducedBy: Math.min(reduction, requested), reducedLabel: reductionLabel(targetToken.actor) } };
  }
  const withReduction = (plan) => (reduction && plan?.ok ? { ...plan, reducedBy: Math.min(reduction, requested), reducedLabel: reductionLabel(targetToken.actor) } : plan);

  return {
    targetToken,
    plan: withReduction(plannedPush({
      sourceCentreX: sourceCentre.x,
      sourceCentreY: sourceCentre.y,
      targetCentreX: targetCentre.x,
      targetCentreY: targetCentre.y,
      targetX: targetAt.x,
      targetY: targetAt.y,
      feet,
      gridDistance: Number(scene.grid?.distance ?? 0),
      gridSize,
      isBlocked: blockedSquareTest(scene, targetToken)
    }))
  };
}

/** The carriers' names, for the card. */
function reductionLabel(actor) {
  return declarationCarriers(actor).filter((c) => Number(c?.flags?.["trg-prime"]?.forcedMovementReduction) > 0).map((c) => c.name).join(", ");
}

/**
 * The button's handler: move the token, then record what happened.
 *
 * @param {object} message The chat message carrying the card.
 * @param {object} raw The stored `forcedMovement` flag.
 * @param {number} feet Which of the offered distances was pressed.
 * @returns {Promise<object>} The plan that was carried out.
 */
export async function applyForcedPush(message, raw, feet) {
  if (raw?.applied) return { ok: false, reason: "this push has already been applied" };

  const { plan, targetToken } = planPushFromIds(raw, feet);
  const targetName = targetToken?.name ?? "The target";

  if (plan.ok && plan.moved) {
    await targetToken.update({ x: plan.finalX, y: plan.finalY });
  }

  await message.setFlag(SYSTEM_ID, "forcedMovement", {
    ...raw,
    applied: true,
    appliedFeet: plan.ok ? plan.movedFeet : 0,
    requestedFeet: feet,
    stoppedShort: Boolean(plan.stoppedShort),
    note: describePush(plan, targetName)
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ token: targetToken }),
    content: `<div class="trg-prime"><p>${describePush(plan, targetName)}</p></div>`
  });

  return plan;
}

/**
 * The two tokens a push needs, worked out from two actors.
 *
 * The critical-injury card knows an attacker and a target as ACTORS, and
 * a push needs positions. Where an actor has exactly one token on the
 * current scene that is unambiguous; where it has none or several it is
 * not, and this returns null rather than picking one.
 *
 * GUESSING HERE WOULD BE WORSE THAN DECLINING. Choosing "the first token"
 * for an actor with three on the map would push a creature that was never
 * in the fight, and the card would look exactly as confident either way.
 * The cost of declining is a missing button on an uncommon card; the cost
 * of guessing is moving the wrong creature.
 *
 * @param {object} actor The pusher.
 * @param {object} targetActor The pushed.
 * @returns {{sceneId: string, sourceTokenId: string, targetTokenId: string}|null}
 */
export function resolvePushTokens(actor, targetActor) {
  const scene = canvas?.scene;
  if (!scene || !actor || !targetActor) return null;
  const onScene = (a) => (a.getActiveTokens?.() ?? [])
    .map((t) => t.document ?? t)
    .filter((d) => d?.parent?.id === scene.id);
  const source = onScene(actor);
  const target = onScene(targetActor);
  if (source.length !== 1 || target.length !== 1) return null;
  if (source[0].id === target[0].id) return null;
  return { sceneId: scene.id, sourceTokenId: source[0].id, targetTokenId: target[0].id };
}

/**
 * The button block for a card, or "" when there is nothing to offer.
 *
 * A push of "up to" N offers every 5-foot step to N, because "up to" is a
 * choice the pusher makes and a single button would turn a maximum into a
 * requirement. A flat N offers exactly one.
 *
 * A creature with a printed rule about being moved against its will
 * (Storgar) gets that sentence beside the buttons, because the moment
 * the push is OFFERED is the moment the table can still judge it.
 *
 * @param {{feet: number, upTo: boolean}} push From `extractPushDistance`.
 * @param {number} gridDistance The scene's feet-per-square.
 * @param {string[]} prompts From `involuntaryMovementPrompts(target)`.
 * @returns {string} HTML.
 */
export function pushButtonsHtml(push, gridDistance = 5, prompts = []) {
  if (!push?.feet) return "";
  const step = Number(gridDistance) > 0 ? Number(gridDistance) : 5;
  const distances = push.upTo
    ? Array.from({ length: Math.floor(push.feet / step) }, (_, i) => (i + 1) * step)
    : [push.feet];
  if (!distances.length) return "";
  const buttons = distances
    .map((d) => `<button type="button" data-action="applyForcedPush" data-feet="${d}">Push ${d} ft</button>`)
    .join(" ");
  const notes = (prompts ?? [])
    .map((line) => `<p style="margin:2px 0"><em>${line}</em></p>`)
    .join("");
  return `${notes}<p style="margin:6px 0 2px">${buttons}</p>`;
}

/**
 * A forced move a SPELL makes happen, rather than one a card offers.
 *
 * NEW at 3.606.0, for Startle (page 331): "Failure  The target takes a
 * forced Step action away from you."
 *
 * THE SAME PLANNER AS THE SHOVE BUTTON, called directly. A Shove offers
 * buttons because its pusher chooses how far; Startle's distance is fixed
 * by the page — a Step, one square — and nobody at the table has a choice
 * to make, so a button would be a click that could only ever say yes.
 *
 * `planPushFromIds` AND `blockedSquareTest` ARE REUSED, not restated: a
 * forced Step into a wall stops short exactly as a Shove into one does,
 * and two copies of "what stops a push" would disagree the first time
 * somebody taught one of them about difficult ground.
 *
 * @param {Actor} sourceActor who the target is moved away FROM
 * @param {Actor} targetActor who is moved
 * @param {number} feet how far
 * @returns {Promise<{ok: boolean, text: string}>}
 */
export async function forceMoveAway(sourceActor, targetActor, feet) {
  const ids = resolvePushTokens(sourceActor, targetActor);
  if (!ids) {
    return {
      ok: false,
      text: `${targetActor?.name ?? "The target"} could not be moved automatically — the caster `
        + "and the target each need exactly one token on this scene. Move it by hand."
    };
  }
  const { plan, targetToken } = planPushFromIds(ids, feet);
  // WRITTEN DIFFERENTLY FROM THE BUTTON'S OWN MOVE, deliberately: the
  // Shove harness anchors a mutation on that exact line, and a second copy
  // of it here would make the anchor ambiguous and the check prove nothing.
  const destination = plan.ok && plan.moved ? { x: plan.finalX, y: plan.finalY } : null;
  if (destination) await targetToken.update(destination);
  return { ok: Boolean(plan.ok), text: describePush(plan, targetToken?.name ?? targetActor?.name ?? "The target") };
}
