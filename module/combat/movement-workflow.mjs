/**
 * Movement and Action Points — the Foundry side.
 *
 * Foundry 14 fires a cancellable `preMoveToken` before a token moves and
 * reports the terrain-adjusted cost of the proposed path, which is
 * exactly what an AP charge needs: it means a move too expensive to
 * afford can be refused before it happens rather than undone after.
 *
 * Charging is deliberately narrow. It applies only during an active
 * encounter, only on the moving actor's own turn, and only to movement a
 * person actually initiated — so a GM arranging tokens before initiative,
 * or nudging someone else's token mid-round, costs nothing.
 */
import { apAvailable } from "./restricted-ap.mjs";
import { allTerrainDifficult, movementRefusal } from "../conditions/condition-rules.mjs";
import { spendActionPoints } from "./action-points-workflow.mjs";
import { IMMUNITY_TOKENS } from "../defences.mjs";
import { actorDefences } from "../creature-traits.mjs";
import { endTakeCover, isInFullDefence } from "./basic-action-stances.mjs";
import { flyMovementCost, recordFlyAction } from "./fly-workflow.mjs";
import { wildStrideCost, terrainReliefName } from "./passive-feats.mjs";
import { moveActionProvokes } from "./opportunity-rules.mjs";
import { FULL_DEFENCE_MOVES_FLAG, fullDefenceMovementBlock } from "./reactions.mjs";
import {
  chargeEndDistance,
  chargeTargetToken,
  resolveChargeStrike,
  validateCharge
} from "./charge-workflow.mjs";
import { movementLimitBonus, movementFractionOverride } from "../feats.mjs";
import { mayEndInSquare, passageThrough } from "./space.mjs";
import { regionContains, surfaceMovementEffect, unusualSurfaceOf } from "./surfaces.mjs";
import { feetFromPointToToken, tokenSquares } from "./geometry.mjs";
import { AURA_MOVE_LIMIT_FLAG, approachLimitLive, approachRefusal, difficultSurchargeFeet } from "./aura-move-limits.mjs";
import { movementBindVerdict } from "../magic/movement-bind-workflow.mjs";
import { difficultFloor } from "../magic/movement-bind.mjs";
import {
  ARMED_MOVEMENT_ACTIONS,
  CHARGED_MOVEMENT_METHODS,
  armedMoveLimit,
  isArmableMovement,
  movementApDue,
  movementPoolKey,
  speedForMovement,
  validateArmedMove,
  COMPOUND_LEG_KEY,
  validateCompoundLeg
} from "./movement.mjs";
import { abilityGallop } from "../creature-ability-rules.mjs";
import { isSwarm } from "../codex-trait-rules.mjs";

const SYSTEM_ID = "trg-prime";
const MOVED_FLAG = "movementPools";
/** A passed Tumble, waiting to be spent on the move it was rolled for. */
export const TUMBLE_FLAG = "tumbledThrough";
const ARMED_FLAG = "armedMovement";
// Superseded by MOVED_FLAG in 3.98.0. Cleared on turn reset so a world
// upgraded mid-combat doesn't keep stale scalars lying around.
const LEGACY_FLAGS = Object.freeze(["movementCost", "movementAp"]);

/**
 * The running tally, held in memory and keyed by actor id.
 *
 * preMoveToken must decide synchronously — the hook cancels on a false
 * return — while writing a flag is asynchronous. Reading the tally from
 * flags therefore loses a race the moment someone drags twice quickly:
 * both moves read the same pre-move state and the second is undercharged.
 * Found exactly that way, testing against a live world. The flags below
 * are still written, but as a visible mirror for the sheet and for
 * recovery after a reload — never as the source of truth mid-turn.
 *
 * Per Graham (3.98.0): every action type expends its own AP. Each pool is
 * therefore separate, so distance covered by a Step is not deducted from
 * what a Stride will buy you. His own example is the test case — a Step
 * for 1 AP, then 50 feet at Speed 25 for 2 more, three AP in total.
 * Pooled together those 55 feet would have been three Strides, and the
 * move would have been refused for want of a fourth AP.
 */
const tallies = new Map();

function tallyFor(actor) {
  const existing = tallies.get(actor.id);
  if (existing) return existing;
  // Seeded from the flag so a reload mid-turn doesn't hand out free
  // movement, then owned in memory from that point on.
  const stored = actor?.getFlag?.(SYSTEM_ID, MOVED_FLAG);
  const seeded = {
    pools: foundry.utils?.deepClone ? foundry.utils.deepClone(stored ?? {}) : { ...(stored ?? {}) },
    // AP committed by a move whose spend hasn't landed on the actor yet.
    pendingSpend: 0
  };
  tallies.set(actor.id, seeded);
  return seeded;
}

/**
 * One pool per action type. A Stride pools by the Speed it used, because
 * a Stride on land and a Stride on the wing buy different distances for
 * the same AP and cannot share a divisor.
 */
function poolFor(tally, key) {
  const existing = tally.pools[key];
  if (existing) return existing;
  const fresh = { movedCost: 0, apCharged: 0 };
  tally.pools[key] = fresh;
  return fresh;
}

/** Distance already moved this turn, and AP already paid for it, per pool. */
export function movementState(actor) {
  const tally = tallyFor(actor);
  return {
    pools: tally.pools,
    armed: actor?.getFlag?.(SYSTEM_ID, ARMED_FLAG) ?? null
  };
}

/** Clears the per-turn movement tally. Called at the start of a turn. */
export async function resetMovementForTurn(actor) {
  tallies.delete(actor?.id);
  // THE TUMBLE MARKER GOES WITH THE TURN (page 198; R15): a Tumble
  // bought one passage on the turn it was rolled, not a standing licence.
  for (const flag of [MOVED_FLAG, ARMED_FLAG, TUMBLE_FLAG, ...LEGACY_FLAGS]) {
    if (actor?.getFlag?.(SYSTEM_ID, flag) !== undefined) {
      await actor.unsetFlag(SYSTEM_ID, flag);
    }
  }
}

/**
 * Arms a movement action, so the next move this actor makes uses that
 * action's rules instead of a Stride.
 *
 * @param {Actor} actor
 * @param {string} actionKey
 * @returns {Promise<boolean>} Whether it was armed.
 */
export async function armMovementAction(actor, actionKey) {
  if (!isArmableMovement(actionKey)) return false;
  await actor.setFlag(SYSTEM_ID, ARMED_FLAG, actionKey);
  return true;
}

/** Disarms without moving. */
export async function clearArmedMovement(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, ARMED_FLAG) !== undefined) {
    await actor.unsetFlag(SYSTEM_ID, ARMED_FLAG);
  }
}

/**
 * The refusal a creature's conditions put on its own move, or "".
 *
 * ITS OWN MOVE: a drag or a keypress by a player, or by the GM on that
 * creature's turn in a running combat. A GM repositioning a token at any
 * other time, an API write (forced movement, a wall's push) and movement no
 * Speed governs (teleportation) are not the creature using a move action.
 */
function conditionMoveRefusal(tokenDocument, movement) {
  const actor = tokenDocument?.actor;
  if (!actor) return "";
  const method = String(movement?.method ?? "");
  if (!["dragging", "keyboard"].includes(method)) return "";
  if (game.user?.isGM) {
    const active = game.combat?.started ? game.combat.combatant?.actor : null;
    if (!active || active.id !== actor.id) return "";
  }
  const { key } = speedForMovement(actor.system, movementAction(movement));
  return movementRefusal(actor.name, actor.conditions?.effective, {
    armed: actor.getFlag?.(SYSTEM_ID, ARMED_FLAG) ?? null,
    governed: Boolean(key)
  });
}

/** Whether this movement should be charged at all. */
function chargeable(tokenDocument, movement) {
  if (!game.combat?.started) return false;
  if (!CHARGED_MOVEMENT_METHODS.includes(String(movement?.method ?? ""))) return false;

  const actor = tokenDocument?.actor;
  if (!actor?.system?.resources?.ap) return false;

  // Only on your own turn: a GM repositioning someone else's token, or
  // anything moved between turns, isn't that creature spending its AP.
  const active = game.combat.combatant?.actor;
  if (!active || active.id !== actor.id) return false;

  return true;
}

/** The terrain-adjusted cost of the movement being proposed. */
function proposedCost(movement) {
  return (
    Math.max(0, Number(movement?.passed?.cost ?? 0)) +
    Math.max(0, Number(movement?.pending?.cost ?? 0))
  );
}

/**
 * The cost THIS SYSTEM charges for a proposed path.
 *
 * For everything but flight that is Foundry's own measurement. Fly is
 * the one movement whose chapter entry prices the path differently from
 * the ruler — climbing counts double and a straight drop counts half —
 * so the measurement is taken as given and fly.mjs adjusts it.
 *
 * @returns {{cost:number, flown:object|null}}
 */
/** The raw distance of a proposed path, before terrain multiplies it. */
function proposedDistance(movement) {
  return (
    Math.max(0, Number(movement?.passed?.distance ?? 0)) +
    Math.max(0, Number(movement?.pending?.distance ?? 0))
  );
}

function pathCost(movement, actor = null, armedKey = null) {
  const base = proposedCost(movement);
  if (movementAction(movement) !== "fly") {
    // WILD STRIDE (Chapter 5): "you can ignore the effects of non-magical
    // difficult terrain… this also lets you treat the hindrances of
    // formidable terrain as those of difficult terrain."
    //
    // READ OFF THE COST, because that is all this system is told. Foundry
    // prices difficult ground with a Region behaviour that multiplies the
    // movement cost, so what arrives here is a bigger number rather than a
    // label — and the multiplier IS the terrain type. One step off it says
    // both halves of the rule at once. See `wildStrideCost`.
    //
    // NOT APPLIED TO FLIGHT, which is priced by fly.mjs against its own
    // chapter rules rather than by terrain, and which "difficult terrain"
    // does not describe.
    //
    // THE ARMED KEY IS PASSED because relief can be scoped to one action.
    // Feather Step eases a Step and nothing else, so the easing has to
    // know which action is being taken; Wild Stride ignores the argument
    // and eases anyway. See `terrainReliefName`.
    //
    // THE CARRIER'S NAME TRAVELS WITH THE ANSWER (3.570.1), because the
    // notice below used to hard-code "Wild Stride" and there are four
    // carriers now. Read here, where the question is already being
    // asked, rather than asked again at the notice — two scans could
    // disagree, and the one that printed would be the one nobody tested.
    const easedBy = terrainReliefName(actor, armedKey);
    const eased = wildStrideCost({
      cost: base,
      distance: proposedDistance(movement),
      eases: Boolean(easedBy)
    });
    return { cost: eased.cost, flown: null, eased: eased.eased, easedBy };
  }
  const flown = flyMovementCost(movement);
  // Unmeasurable (no canvas, a single waypoint) keeps Foundry's figure
  // rather than charging nothing: a rule that cannot be applied should
  // leave the previous behaviour alone, not replace it with zero.
  if (!flown) return { cost: base, flown: null };
  return { cost: flown.cost, flown };
}

/** The Foundry movement action the path uses. */
function movementAction(movement) {
  const waypoints = [
    ...(movement?.passed?.waypoints ?? []),
    ...(movement?.pending?.waypoints ?? [])
  ];
  const withAction = waypoints.filter((w) => w?.action);
  return withAction.length ? withAction.at(-1).action : "walk";
}

/**
 * Attack of Opportunity (Chapter 4): a provoking move — a Stride, Charge,
 * Crawl or Reposition, but not a Step — may draw an Attack of Opportunity
 * from any enemy whose reach the mover leaves. Fired only once the move is
 * permitted (from the success branches below), on the mover's own turn.
 * Detection only, detached and defensive — it never blocks or delays the
 * move.
 */
async function maybeOfferMovementAoO(tokenDocument, movement, armedKey) {
  try {
    if (!game.combat?.started) return;
    if (game.combat.combatant?.actor?.id !== tokenDocument.actor?.id) return;
    const config = armedKey === COMPOUND_LEG_KEY
      ? { provokesReactions: tokenDocument.actor?.getFlag?.(SYSTEM_ID, COMPOUND_LEG_KEY)?.provokes !== false }
      : armedKey ? ARMED_MOVEMENT_ACTIONS[armedKey] : null;
    // ASKED, NOT RE-DERIVED (3.363.0). This line was a verbatim copy of
  // `moveActionProvokes`, which was tested by the harness and called by
  // nothing — two places holding one rule, with the tested one inert.
    // IMPROVED REPOSITION (3.381.0): a Reflex save taken BEFORE the move
    // can buy this one out of provoking. Read here and cleared here,
    // whatever the answer, so a saved-up avoidance cannot follow the
    // character into a later move it was never bought for.
    const actor = tokenDocument.actor;
    const avoided = armedKey === "reposition"
      && Boolean(actor?.getFlag?.(SYSTEM_ID, "repositionReactionsAvoided"));
    if (avoided) {
      // Fire-and-forget, matching the rest of this deliberately detached
      // function: detection never blocks or delays a move.
      actor?.unsetFlag?.(SYSTEM_ID, "repositionReactionsAvoided")?.catch?.(() => {});
    }
    // A CREATURE'S OWN JUMP (3.654.0; block 21 R9 — Ether Leap, "do not
    // provoke reactions"): the jump action leaves a flag the move it makes
    // reads and clears, whatever move that is.
    const jumpAvoided = Boolean(actor?.getFlag?.(SYSTEM_ID, "jumpReactionsAvoided"));
    if (jumpAvoided) actor?.unsetFlag?.(SYSTEM_ID, "jumpReactionsAvoided")?.catch?.(() => {});
    /*
     * IMMUNE TO REACTIONS PROVOKED BY MOVEMENT (3.548.0) — the Swarm's
     * fourth immunity, which nothing had ever read. Resolved through
     * actorDefences so it works whether the word arrives from the
     * `swarm` trait or is typed into the immunities field; before this
     * release neither route reached anything.
     */
    // ELUSIVE MOVEMENT, SMOKE FORM (Creature Codex; 3.631.0): "does not
    // provoke reactions caused by movement" — declared on the ability as
    // `derives.noMovementProvoke` (Smoke Form: only a full-Speed move in one
    // action, `{ fullMoveOnly: true }`). Read with the Swarm's immunity, as
    // one more property of the mover.
    const { movementProvokeExempt } = await import("../creature-ability-rules.mjs");
    const moverImmune = jumpAvoided || Boolean(
      actorDefences(actor?.system ?? {}).immunities?.has?.(IMMUNITY_TOKENS.movementReaction))
      || movementProvokeExempt(Array.from(actor?.items ?? []), {
        movedFeet: proposedDistance(movement),
        speedFeet: Number(speedForMovement(actor?.system, movementAction(movement))?.speed ?? 0) || 0
      });
    const provokes = moveActionProvokes(
      armedKey, config?.provokesReactions, avoided, moverImmune);
    if (!provokes) return;
    import("./opportunity.mjs")
      .then((m) => m.detectMovementAoO(tokenDocument, movement))
      .catch(() => {});
  } catch (_e) {
    /* detection is best-effort */
  }
}

/**
 * Swift Pursuit (Ranger, 6th): fired for EVERY permitted move, not just
 * provoking ones — a Step doesn't provoke an Attack of Opportunity but
 * absolutely can carry the prey away from its hunter. Same detached,
 * best-effort shape as the AoO detection beside it.
 */
function maybeOfferSwiftPursuit(tokenDocument, movement) {
  try {
    if (!game.combat?.started) return;
    import("./swift-pursuit.mjs")
      .then((m) => m.detectSwiftPursuit(tokenDocument, movement))
      .catch(() => {});
    // SHADOWING (Chapter 5) answers the same event for its own reason:
    // "a creature within reach attempts to move away from you". Beside
    // Swift Pursuit rather than folded into it — one is a Ranger's prey
    // and the other is anybody in reach, and merging them would make a
    // Ranger's card appear for every retreat on the board.
    import("./reaction-feat-detection.mjs")
      .then((r) => r.detectShadowing(tokenDocument?.object ?? null, movement))
      .catch(() => {});
  } catch (_e) {
    /* detection is best-effort */
  }
}

/**
 * A MOVE THAT ENDS ADJACENT (3.650.0; block 17 R9, the Goblins' Nimble
 * Escape: "Trigger A creature ends a move action which leaves them
 * adjacent"). Read once the token has been written to its destination —
 * this runs while the move is still being proposed — and offered to every
 * creature now within 5 feet that carries an "adjacent" reaction move.
 */
function maybeOfferCreatureReactions(tokenDocument, movement) {
  try {
    if (!game.combat?.started) return;
    const id = tokenDocument?.id;
    const destination = movement?.destination ?? null;
    const hook = Hooks.on("updateToken", (doc, changes) => {
      if (doc?.id !== id || !("x" in (changes ?? {}) || "y" in (changes ?? {}))) return;
      Hooks.off("updateToken", hook);
      import("../creature-reactions-workflow.mjs")
        .then(({ offerAdjacentReactions }) => offerAdjacentReactions(doc, destination))
        .catch(() => {});
    });
    // A refused or abandoned move never writes; don't leave the hook behind.
    setTimeout(() => Hooks.off("updateToken", hook), 10000);
  } catch (_e) {
    /* detection is best-effort */
  }
}

/* ------------------------------------------------------------------ */
/* Moving through creatures (page 198; the audit's D15, Graham's R15)   */
/* ------------------------------------------------------------------ */

/** Every grid square a proposed path touches, in order. */
function pathSquares(movement) {
  try {
    const grid = canvas?.grid?.size ?? 100;
    const points = [
      ...(movement?.passed?.waypoints ?? []),
      ...(movement?.pending?.waypoints ?? [])
    ].filter((w) => Number.isFinite(Number(w?.x)) && Number.isFinite(Number(w?.y)));
    const out = [];
    const push = (x, y) => {
      const square = { col: Math.round(Number(x) / grid), row: Math.round(Number(y) / grid) };
      const last = out.at(-1);
      if (!last || last.col !== square.col || last.row !== square.row) out.push(square);
    };
    // SAMPLED ALONG EACH LEG, not just at the corners: a straight drag
    // across four squares is TWO waypoints, and the creature standing in
    // the middle of it is the one the rule is about.
    for (let i = 0; i < points.length; i++) {
      if (i > 0) {
        const a = points[i - 1];
        const b = points[i];
        const steps = Math.max(
          Math.abs(Number(b.x) - Number(a.x)), Math.abs(Number(b.y) - Number(a.y))) / grid;
        for (let s = 1; s < steps; s++) {
          push(Number(a.x) + (Number(b.x) - Number(a.x)) * (s / steps),
            Number(a.y) + (Number(b.y) - Number(a.y)) * (s / steps));
        }
      }
      push(points[i].x, points[i].y);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * AN AURA RUNG'S LIMITS ON THIS CREATURE (3.651.0, block 18 R8 — Shifting
 * Aura). See aura-move-limits.mjs.
 *
 *   refusal    a `noApproach` record live for this turn, and a move that ends
 *              nearer its emitter than it began
 *   surcharge  +5 ft for every square of the path inside a `difficult`
 *              record's radius of its emitter
 *
 * Synchronous, like the rest of this hook. A record whose emitter is no
 * longer on the scene limits nothing.
 */
function auraMoveLimits(tokenDocument, movement) {
  const out = { refusal: "", surcharge: 0, notes: [] };
  try {
    const actor = tokenDocument?.actor;
    const records = Array.from(actor?.effects ?? []).filter((e) => !e.disabled).map((e) => e.getFlag?.(SYSTEM_ID, AURA_MOVE_LIMIT_FLAG)).filter(Boolean);
    if (!records.length || !canvas?.tokens) return out;
    const grid = canvas.grid?.size ?? 100;
    const acting = Boolean(game.combat?.started) && game.combat.combatant?.actor?.id === actor.id;
    const round = Number(game.combat?.round ?? 0);
    const w = Math.max(1, Number(tokenDocument.width) || 1);
    const centreAt = (x, y) => ({ x: Number(x) + (w * grid) / 2, y: Number(y) + (w * grid) / 2 });
    for (const record of records) {
      const emitter = canvas.tokens.get(record.emitterTokenId);
      if (!emitter) continue;
      if (record.kind === "noApproach" && approachLimitLive(record, { round, acting })) {
        const start = feetFromPointToToken(centreAt(tokenDocument.x, tokenDocument.y), emitter);
        const dest = movement?.destination ?? null;
        const end = dest ? feetFromPointToToken(centreAt(dest.x, dest.y), emitter) : null;
        const refused = approachRefusal(record, start, end, actor.name);
        if (refused) { out.refusal = refused; return out; }
      } else if (record.kind === "difficult" && movementAction(movement) !== "fly") {
        // PAGE 196: "if you have a Fly speed, you are unhindered by difficult
        // terrain" — the ground this rung makes difficult does not reach a flier.
        // THE SQUARE IT STARTS IN IS NOT ENTERED: dropped wherever the path
        // lists it, and the rule's own "origin first" slot left empty.
        const oc = Math.round(Number(tokenDocument.x) / grid), or = Math.round(Number(tokenDocument.y) / grid);
        const entered = pathSquares(movement).filter((sq) => !(sq.col === oc && sq.row === or));
        const feet = [null, ...entered.map((sq) => feetFromPointToToken({ x: (sq.col + 0.5) * grid, y: (sq.row + 0.5) * grid }, emitter))];
        const extra = difficultSurchargeFeet(feet, record.radiusFeet);
        if (extra > 0) { out.surcharge += extra; out.notes.push(`${record.label}: +${extra} ft of difficult ground near ${record.emitterName}`); }
      }
    }
  } catch (_e) {
    /* best-effort: a limit that cannot be measured limits nothing */
  }
  return out;
}

/** The other tokens standing on any of these squares. */
function tokensOnSquares(squares, moverToken) {
  try {
    if (!squares.length) return [];
    const wanted = new Set(squares.map((s) => `${s.col},${s.row}`));
    return canvas.tokens.placeables.filter((other) => {
      if (other.id === moverToken.id) return false;
      return tokenSquares(other).some((s) => wanted.has(`${s.col},${s.row}`));
    });
  } catch {
    return [];
  }
}

/**
 * Page 198's two refusals, and its two terrain costs.
 *
 * SYNCHRONOUS, like everything else in this hook: the Tumble check it
 * asks for is a separate action the player takes and this refuses the
 * move until they have. A passed Tumble leaves `tumbledThrough` on the
 * actor, which this consumes.
 *
 * THE EXTRA COST IS A SURCHARGE, NOT A MULTIPLIER ON THE WHOLE PATH. A
 * prone creature's square is difficult terrain; the twenty feet of open
 * ground either side of it is not. Foundry's own ruler prices the Region
 * behaviours it knows about, and knows nothing about creatures, so this
 * adds five feet per difficult square crossed and ten per formidable one
 * — the same arithmetic those Regions do, applied only where the page
 * applies it.
 *
 * @returns {{refused: string, surcharge: number, notes: string[], spendTumble: boolean}}
 */
function spaceRules(tokenDocument, movement) {
  const token = tokenDocument?.object ?? null;
  const mover = tokenDocument?.actor ?? null;
  const result = { refused: "", surcharge: 0, notes: [], spendTumble: false };
  if (!token || !mover || !canvas?.tokens) return result;

  const moverSize = String(mover.system?.identity?.size ?? "medium");
  const squares = pathSquares(movement);
  if (!squares.length) return result;

  const tumbled = mover.getFlag?.(SYSTEM_ID, TUMBLE_FLAG) ?? false;

  // THE SQUARE THE MOVE ENDS IN. "You cannot end your turn in a space
  // already occupied by another creature" — unless you are Tiny or
  // Diminutive, and then only up to the square's own capacity.
  const finalSquare = squares.at(-1);
  const occupants = tokensOnSquares([finalSquare], token);
  const moverIsSwarm = isSwarm(mover.system);
  const ending = mayEndInSquare({
    moverSize,
    moverIsSwarm,
    occupants: occupants.map((o) => ({ size: String(o.actor?.system?.identity?.size ?? "medium"), swarm: isSwarm(o.actor?.system) }))
  });
  if (!ending.allowed) {
    result.refused = `${mover.name} can't finish there — ${ending.reason} (page 198).`;
    return result;
  }

  // AND THE SQUARES IT PASSES THROUGH.
  const crossed = squares.slice(0, -1);
  const crossedKeys = new Set(crossed.map((s) => `${s.col},${s.row}`));
  const feetPerSquare = Number(canvas?.scene?.grid?.distance ?? 5) || 5;
  for (const other of tokensOnSquares(crossed, token)) {
    const passage = passageThrough({
      moverSize,
      occupantSize: String(other.actor?.system?.identity?.size ?? "medium"),
      ally: other.document.disposition === tokenDocument.disposition,
      prone: Boolean(other.actor?.hasCondition?.("prone")),
      tumbled,
      swarm: moverIsSwarm || isSwarm(other.actor?.system)
    });
    if (!passage.allowed) {
      result.refused =
        `${mover.name} would move through ${other.name}'s space — ${passage.reason}.`;
      return result;
    }
    if (passage.reason === "Tumble") result.spendTumble = true;
    if (passage.multiplier > 1) {
      const overlap = tokenSquares(other)
        .filter((s) => crossedKeys.has(`${s.col},${s.row}`)).length;
      result.surcharge += (passage.multiplier - 1) * overlap * feetPerSquare;
      result.notes.push(`${other.name}: ${passage.reason}`);
    }
  }
  return result;
}

/**
 * The unusual surfaces a proposed path touches (page 196; R17).
 *
 * DEFENSIVE THROUGHOUT, like every other canvas read in this hook: a
 * scene with no Regions, a Foundry that spells `testPoint` differently,
 * or a Region that throws must leave the move alone rather than stop it.
 */
function surfacesOnPath(movement) {
  try {
    const regions = Array.from(canvas?.scene?.regions ?? []);
    if (!regions.length) return [];
    const grid = canvas?.grid?.size ?? 100;
    const points = [
      ...(movement?.passed?.waypoints ?? []),
      ...(movement?.pending?.waypoints ?? [])
    ].filter((w) => Number.isFinite(Number(w?.x)) && Number.isFinite(Number(w?.y)))
      .map((w) => ({ x: Number(w.x) + grid / 2, y: Number(w.y) + grid / 2 }));
    if (!points.length) return [];
    const out = [];
    for (const region of regions) {
      const spec = unusualSurfaceOf(region);
      if (!spec) continue;
      // ASKED OF THE PLACEABLE (3.579.1, F4) — see `regionContains`. The
      // first version asked the DOCUMENT and fell back with `??`, which
      // never fired because the document answers `false` rather than
      // nothing, so no surface was ever found.
      const inside = points.some((p) => regionContains(region, p));
      if (inside) out.push(spec);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * "Whilst moving on any unusual surface, you are flat-footed" (page 196;
 * the block-19 audit's D17, Graham's R17 of 21 September 2026).
 *
 * FIRE AND FORGET, like the Attack of Opportunity detection beside it: a
 * condition applied as a consequence of a move must never be able to
 * refuse the move, and this hook has already decided by the time it runs.
 */
function applySurfaceEffects(actor, surfaces) {
  try {
    const effect = surfaceMovementEffect(surfaces, true);
    if (!effect.flatFooted || !actor) return;
    if (!actor.hasCondition?.("flatFooted")) {
      void actor.toggleStatusEffect("flatFooted", { active: true });
    }
    void ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
        + `<strong>${actor.name} moves on ${effect.labels.join(" and ")}</strong> — `
        + "flat-footed while moving on an unusual surface, and the GM may call for a "
        + `<strong>Balance (Acrobatics)</strong> check${effect.dc ? ` (DC ${effect.dc})` : ""} `
        + "to keep their footing (page 196).</p></div>"
    });
  } catch (_e) {
    /* consequences are best-effort */
  }
}

/**
 * The `preMoveToken` handler. Returns false to refuse the move.
 *
 * Deliberately synchronous in its decision — the hook cancels on a false
 * return, so the AP spend is dispatched afterwards rather than awaited.
 */
/*
 * A TOKEN THAT CHANGES SIZE IS NOT MOVING (3.652.1; found live testing
 * 3.652.0, 16 October 2026). Foundry 14 sends a width change through
 * `preMoveToken` as an "api" movement: a lycanthrope's Luna Frenzy, and any
 * Change Shape into or out of a larger form, in combat was charged a
 * 5-foot Stride for it — or refused for want of the AP, or for the squares
 * the larger body now covers — and the token kept its old size while its
 * statistics changed. The resize marks the token here for the length of
 * its own update, and the hook lets it through uncharged; it is also
 * written as a displacement, so nothing downstream reads it as a walk.
 */
const RESIZING = new Set();

/**
 * Resize a token to `side` squares without it counting as a move.
 * @param {TokenDocument} tokenDocument
 * @param {number} side
 */
export async function resizeTokenInPlace(tokenDocument, side) {
  if (!tokenDocument?.update || !(Number(side) > 0)) return;
  RESIZING.add(tokenDocument.id);
  try {
    await tokenDocument.update({ width: side, height: side }, {
      movement: { [tokenDocument.id]: { method: "api", waypoints: [{ x: tokenDocument.x, y: tokenDocument.y, width: side, height: side, action: "displace" }] } }
    });
  } finally {
    RESIZING.delete(tokenDocument.id);
  }
}

function onPreMoveToken(tokenDocument, movement) {
  if (RESIZING.has(tokenDocument?.id)) return true;
  // TAKE COVER ENDS WHEN YOU MOVE (Chapter 4; Graham, 18 Aug 2026).
  //
  // Called at each point this hook ALLOWS a real displacement, and at
  // none of the points where it refuses one — clearing cover for a move
  // that is then cancelled for want of AP would take the bonus away and
  // leave the character standing exactly where they were.
  //
  // Deliberately not gated on `chargeable`: a teleport and an
  // out-of-combat walk both leave the space the cover was taken behind,
  // even though neither is charged.
  const mover = tokenDocument.actor;
  const displaced = proposedCost(movement) > 0;
  const leaveCover = () => {
    if (displaced && mover) void endTakeCover(mover);
  };

  // PAGE 198'S SPACE RULES, asked before anything is charged and whether
  // or not this move is chargeable at all: a creature cannot end its turn
  // standing inside another one out of combat either, and the Tumble the
  // page asks for is not an AP question. See `spaceRules`.
  const space = spaceRules(tokenDocument, movement);
  if (space.refused) {
    ui.notifications.warn(space.refused);
    return false;
  }

  // A SPELL THAT BINDS HOW THIS CREATURE MOVES (3.606.0) — Spirit Trap's
  // leash, asked beside the space rules for the same reason: it is a
  // refusal, in or out of combat, and nothing should be charged for a move
  // that is not going to happen. See magic/movement-bind.mjs.
  const bound = movementBindVerdict(tokenDocument, movement);
  if (bound.refused) {
    ui.notifications.warn(bound.refused);
    return false;
  }
  // A CONDITION THAT FORBIDS THE MOVE (3.621.0; Appendix 2, block 39's R7).
  // Immobilised (and Grabbed and Unconscious, which include it), Paralyzed
  // and Petrified: "You cannot use any action with the move trait". Prone:
  // "The only move actions you can use while you're prone are Crawl and
  // Stand", so a drag goes ahead only with Crawl armed. The creature's OWN
  // move only — a GM placing a token outside its turn, a shove (forced
  // movement writes through the API) and teleportation are not move
  // actions. Asked beside the other refusals, before anything is charged.
  const refusal = conditionMoveRefusal(tokenDocument, movement);
  if (refusal) {
    ui.notifications.warn(`${refusal}.`);
    return false;
  }
  // AN AURA'S "CANNOT MOVE TOWARDS" (3.651.0, block 18 R8): the creature's
  // own move only, asked with the condition refusals.
  const auraLimits = ["dragging", "keyboard"].includes(String(movement?.method ?? ""))
    ? auraMoveLimits(tokenDocument, movement) : { refusal: "", surcharge: 0, notes: [] };
  if (auraLimits.refusal) {
    ui.notifications.warn(`${auraLimits.refusal}.`);
    return false;
  }
  if (space.notes.length) {
    ui.notifications.info(`Moving through: ${space.notes.join("; ")}.`);
  }
  if (space.spendTumble && mover) {
    void mover.unsetFlag(SYSTEM_ID, TUMBLE_FLAG);
  }

  // UNUSUAL SURFACES (page 196; R17). After the refusals, because a move
  // that is not going to happen should leave nobody flat-footed.
  if (displaced) applySurfaceEffects(mover, surfacesOnPath(movement));

  if (!chargeable(tokenDocument, movement)) {
    leaveCover();
    return true;
  }

  const actor = tokenDocument.actor;
  // READ BEFORE THE COST, because scoped terrain relief needs to know
  // which action is being taken to decide whether it applies at all. The
  // same flag is read again below as `state.armed` for the limit and AP;
  // one read here would have meant threading it through six branches.
  const armedNow = actor?.getFlag?.(SYSTEM_ID, ARMED_FLAG) ?? null;
  const { cost: measured, flown, eased, easedBy } = pathCost(movement, actor, armedNow);
  // The creature-square surcharge page 198 adds, on top of whatever the
  // ruler already priced. See `spaceRules`.
  //
  // AND ALL TERRAIN DIFFICULT TO THIS CREATURE ALONE (3.606.0), as a floor
  // on what the path costs — see `difficultFloor` for why it is a floor
  // and not a doubling.
  // …AND AN AURA'S DIFFICULT GROUND, FOR THIS CREATURE ALONE (3.651.0, R8).
  if (auraLimits.notes.length) ui.notifications.info(auraLimits.notes.join("; ") + ".");
  const surcharged = measured + Math.max(0, Number(space.surcharge) || 0) + Math.max(0, Number(auraLimits.surcharge) || 0);
  // …AND TO THE BLIND (3.621.0): Blinded — "All normal terrain is difficult
  // terrain to you." The same floor as a bind's.
  const blindDifficult = allTerrainDifficult(actor?.conditions?.effective);
  const allDifficult = bound.difficult || blindDifficult;
  const cost = allDifficult ? difficultFloor(surcharged, proposedDistance(movement)) : surcharged;
  if (allDifficult && cost > surcharged) {
    ui.notifications.info(`${tokenDocument.actor?.name ?? "This creature"}: all terrain is difficult to them`
      + `${blindDifficult && !bound.difficult ? " (Blinded)" : ""} — `
      + `${surcharged} ft charged as ${cost} ft.`);
  }
  if (cost <= 0) return true;

  const action = movementAction(movement);
  const { key: speedKey, speed } = speedForMovement(actor.system, action);

  // FLYING IS A FLY ACTION, which is the whole point of recording it:
  // the turn-end drop asks whether one was used this round, and a
  // character who spent the turn on the wing plainly did.
  //
  // Called only where the move is ALLOWED, exactly as leaveCover is and
  // for the mirror-image reason. A move refused for want of AP never
  // happened, and crediting it would let a character stay aloft all
  // encounter by proposing flights they cannot afford.
  // Counted at the same points as the two records beside it, and for the
  // same reason: only a move that actually happens spends the allowance.
  const spendFullDefenceMove = () => {
    if (!inFullDefence) return;
    const used = Number(actor.getFlag?.(SYSTEM_ID, FULL_DEFENCE_MOVES_FLAG) ?? 0);
    void actor.setFlag(SYSTEM_ID, FULL_DEFENCE_MOVES_FLAG, used + 1);
  };

  const flew = () => {
    if (speedKey !== "fly") return;
    void recordFlyAction(actor);
    // Said out loud, because the number charged no longer matches the
    // one the ruler just showed and an unexplained discrepancy reads as
    // a bug rather than as a rule.
    if (flown?.adjusted) {
      const reasons = [];
      if (flown.ascentFeet > 0) reasons.push(`${flown.ascentFeet} ft of climb counts double`);
      if (flown.descentFeet > 0) reasons.push(`${flown.descentFeet} ft of straight descent counts half`);
      ui.notifications.info(
        `Fly: ${flown.base} ft measured, charged as ${flown.cost} ft — ${reasons.join(", ")}.`
      );
    }
  };

  // Teleportation (blink, displace) isn't Speed-governed movement and is
  // left alone — the Teleportation trait governs it instead.
  if (!speedKey) {
    leaveCover();
    return true;
  }

  if (speed <= 0) {
    ui.notifications.warn(
      `${actor.name} has no ${speedKey} Speed and cannot move that way.`
    );
    return false;
  }

  // FULL DEFENCE (Chapter 4): "you may take a SINGLE Move action as part
  // of Full Defence."
  //
  // Asked here as well as at the action buttons because THIS PROJECT'S
  // OWN RULE IS THAT DRAGGING A TOKEN IS A STRIDE. An allowance policed
  // only where actions are clicked would be no allowance at all: a
  // character in Full Defence could drag across the whole board and
  // never touch a button.
  const inFullDefence = isInFullDefence(actor);
  if (inFullDefence) {
    const movesUsed = Number(actor.getFlag?.(SYSTEM_ID, FULL_DEFENCE_MOVES_FLAG) ?? 0);
    const refused = fullDefenceMovementBlock({ fullDefence: true, movesUsed });
    if (refused) {
      ui.notifications.warn(`${actor.name}: ${refused}.`);
      return false;
    }
  }

  // Discount AP already committed by a move still being written, or a
  // quick second drag would be judged against a balance it no longer has.
  const tally = tallyFor(actor);
  // WHAT THIS MOVE MAY DRAW ON (3.648.0): Haste's point buys a Stride and
  // Channel the Aspect's any Move action, but Fast Attack's buys no movement.
  const state = movementState(actor);
  const moveKinds = !state.armed ? ["stride", "move"]
    : /^step$/i.test(String(state.armed)) ? ["step", "move"] : ["move"];
  const available = Math.max(
    0,
    apAvailable(actor, moveKinds) - tally.pendingSpend
  );

  // An armed action replaces the Stride entirely, with its own limit and
  // its own fixed cost.
  if (state.armed) {
    // A COMPOUND ACTION'S LEG (3.631.0): its limit is on the actor.
    const leg = state.armed === COMPOUND_LEG_KEY ? (actor.getFlag?.(SYSTEM_ID, COMPOUND_LEG_KEY) ?? null) : null;
    const config = leg
      ? { name: leg.label ?? "Compound action", apCost: 0, provokesReactions: leg.provokes !== false }
      : ARMED_MOVEMENT_ACTIONS[state.armed];
    // CHARGE is validated by its own module. Its limits are a minimum as
    // well as a maximum, and one of them ("directly towards your target")
    // is a fact about two tokens that movement.mjs cannot see.
    const charging = state.armed === "charge";
    const chargeEnd = charging
      ? chargeEndDistance(movement, tokenDocument, chargeTargetToken(actor))
      : null;
    const check = leg
      ? validateCompoundLeg(leg, { moveCost: cost, speedKey })
      : charging
      ? { ...validateCharge(actor, { moveCost: cost, speed, endDistance: chargeEnd }), apCost: config.apCost }
      : validateArmedMove(state.armed, {
        moveCost: cost,
        speed,
        prone: Boolean(actor.hasCondition?.("prone")),
        limitBonus: featMovementBonus(actor, state.armed),
        fractionOverride: featMovementFraction(actor, state.armed)
      });

    if (!check.allowed) {
      ui.notifications.warn(`${config?.name ?? state.armed}: ${check.reason}.`);
      return false;
    }
    if (check.apCost > available) {
      ui.notifications.warn(
        `${actor.name} needs ${check.apCost} AP for ${config.name} but has ${available}.`
      );
      return false;
    }

    // Commit in memory first, synchronously, so a second move cannot
    // read pre-move state while these writes are still in flight.
    //
    // Recorded in this action's own pool, not the Stride pool. Every
    // action type expends its own AP, so a Step's 5 feet are the Step's
    // and take nothing away from what a Stride will afterwards buy.
    const armedPool = poolFor(tally, movementPoolKey(state.armed, speedKey));
    armedPool.movedCost += cost;
    armedPool.apCharged += check.apCost;
    tally.pendingSpend += check.apCost;

    void (async () => {
      await spendActionPoints(actor, String(check.apCost), config.name, { use: /^step$/i.test(String(config.name)) ? "step" : "move" });
      tally.pendingSpend = Math.max(0, tally.pendingSpend - check.apCost);
      await actor.setFlag(SYSTEM_ID, MOVED_FLAG, tally.pools);
      await clearArmedMovement(actor);
      ui.notifications.info(
        `${config.name}: ${cost} ft for ${check.apCost} AP.${config.provokesReactions ? "" : " No reactions provoked."}`
        + (eased ? ` ${easedBy ?? "Your terrain training"} eased the terrain.` : "")
      );
    })();
    leaveCover();
    flew();
    spendFullDefenceMove();
    // "If your target is within reach at the end of your movement, you
    // MAY make a melee Strike." Offered once the move is allowed, on the
    // same best-effort footing as the AoO detection below it — a charge
    // that lands should never be undone because the follow-up could not
    // be offered.
    if (charging) {
      void resolveChargeStrike(actor, tokenDocument, {
        endDistance: chargeEnd,
        destination: movement?.destination ?? null
      }).catch(() => {});
    }
    maybeOfferMovementAoO(tokenDocument, movement, state.armed);
    maybeOfferSwiftPursuit(tokenDocument, movement);
    maybeOfferCreatureReactions(tokenDocument, movement);
    return true;
  }

  // Otherwise it's a Stride, charged cumulatively — but only against
  // other Strides made at this same Speed. Distance spent on a Step or a
  // Reposition sits in its own pool and is not counted here.
  const stridePool = poolFor(tally, movementPoolKey(null, speedKey));
  // GALLOP (Creature Codex; 3.631.0): "If the creature takes two
  // consecutive stride actions in the same turn, it increases its speed by
  // 10 feet for each action" — once the turn's Striding runs past one
  // Stride's worth, every Stride of it is at Speed + 10.
  const gallop = speedKey === "land" ? abilityGallop(Array.from(actor.items ?? [])) : 0;
  const galloping = gallop > 0 && stridePool.movedCost + cost > speed;
  const strideSpeed = galloping ? speed + gallop : speed;
  const due = movementApDue({
    previousCost: stridePool.movedCost,
    moveCost: cost,
    speed: strideSpeed,
    apAlreadyCharged: stridePool.apCharged
  });

  if (due.apDue > available) {
    ui.notifications.warn(
      `${actor.name} would need ${due.apDue} more AP to move ${cost} ft ` +
        `(${due.totalCost} ft of Striding this turn at Speed ${strideSpeed}${galloping ? ", galloping" : ""}) but has ${available}.`
    );
    return false;
  }

  stridePool.movedCost = due.totalCost;
  stridePool.apCharged = due.requiredAp;
  tally.pendingSpend += due.apDue;

  void (async () => {
    if (due.apDue > 0) {
      await spendActionPoints(actor, String(due.apDue), "Stride", { use: "stride" });
    }
    tally.pendingSpend = Math.max(0, tally.pendingSpend - due.apDue);
    await actor.setFlag(SYSTEM_ID, MOVED_FLAG, tally.pools);
  })();

  leaveCover();
  flew();
  spendFullDefenceMove();
  maybeOfferMovementAoO(tokenDocument, movement, null);
  maybeOfferSwiftPursuit(tokenDocument, movement);
  maybeOfferCreatureReactions(tokenDocument, movement);
  return true;
}

/** Registers the movement hook. Called once, from the system's init. */
export function registerMovementHooks() {
  Hooks.on("preMoveToken", onPreMoveToken);
}

/** The actor's feat names, normalised once for the two lookups below. */
function movementFeatNames(actor) {
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);
}

/** Extra feet a feat grants this actor for one armed movement action
 *  (Graceful Step: Step reaches 10 ft for the same 1 AP). */
function featMovementBonus(actor, actionKey) {
  return movementLimitBonus(actionKey, movementFeatNames(actor));
}

/** A feat that makes an action's limit a FRACTION of Speed rather than a
 *  fixed distance (Skitter: Crawl covers half your Speed). Threaded to
 *  BOTH the validator and the arming UI, so the number a player is shown
 *  before moving is the number they are then held to. */
function featMovementFraction(actor, actionKey) {
  return movementFractionOverride(actionKey, movementFeatNames(actor));
}

/** Exposed for the arming UI: what an armed action would allow. */
export function armedMovementSummary(actor) {
  const { armed } = movementState(actor);
  if (!armed) return null;
  const config = ARMED_MOVEMENT_ACTIONS[armed];
  const { speed } = speedForMovement(actor.system, "walk");
  return {
    key: armed,
    name: config.name,
    apCost: config.apCost,
    limit: armedMoveLimit(armed, speed, featMovementBonus(actor, armed), featMovementFraction(actor, armed)),
    note: config.note
  };
}
