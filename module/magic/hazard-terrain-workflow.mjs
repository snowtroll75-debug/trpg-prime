/**
 * The Foundry side of HAZARDOUS TERRAIN (see hazard-terrain.mjs for the
 * rules and for Graham's ruling of 1 September 2026).
 *
 * NEW at 3.454.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `moveToken`, NOT `preMoveToken`, AND NOT `updateToken`.
 *
 * All three were measured in Graham's world before this was written,
 * because the choice decides whether the mechanism can exist at all:
 *
 *   preMoveToken  carries the full path — but fires BEFORE the move, and
 *                 the system's own movement gate refuses moves from that
 *                 hook. Damage applied here would land on moves that
 *                 never happened.
 *   updateToken   fires after, and reports only `{x, y}`. The final
 *                 square is not the path, and this family is paid PER
 *                 SQUARE ENTERED, so a creature crossing four squares of
 *                 Spike Stones would be hit once.
 *   moveToken     fires AFTER the move, with `origin`, `destination`,
 *                 `passed.waypoints` and `method`. The move definitely
 *                 happened and the whole path is there.
 *
 * THE EMANATION SWEEP IS A DIFFERENT QUESTION and is deliberately not
 * reused. `refreshAllEmanations` asks "who is inside the circle now",
 * which `updateToken` answers perfectly; this asks "which squares did
 * you cross", which it cannot answer at all. Two hooks, two questions.
 */

import {
  HAZARD_FLAG, normaliseHazard, hazardTriggers, hazardAffects,
  squaresEntered, hazardLine
} from "./hazard-terrain.mjs";
import { sameSide } from "../combat/aid-bonus.mjs";
import { isActingGM } from "../acting-gm.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Movement operations already applied, so one move is charged once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE MOVE PRODUCED TWO CARDS, AND THE SECOND ONE WAS FREE DAMAGE.
 *
 * Driving 3.455.0 in Graham's world: a single four-square walk into Spike
 * Stones printed two hazard cards five milliseconds apart, with DIFFERENT
 * totals — "takes 19" and "takes 31" — so the dice had genuinely been
 * rolled twice.
 *
 * IT WAS A SECOND BROWSER, AND THIS GUARD DID NOT FIX IT.
 *
 * Every component measured correct — the hook fired once, one listener
 * was registered, one region existed, one hazard applied, one
 * `ChatMessage.create` ran, and Foundry reported one active user. The
 * pair still appeared, and this guard changed nothing.
 *
 * The experiment that settled it: EVERY `moveToken` listener was removed
 * from the client, and a walk into the spikes STILL produced a card.
 * Nothing in that browser could have made it. Two sessions were logged
 * in as the same Gamemaster, each running the system, each rolling its
 * own dice. Graham logged the second out on 1 September 2026 and the
 * walk has printed exactly one card ever since.
 *
 * `isActingGM()` SELECTS A USER, NOT A CONNECTION, and that is the real
 * lesson here — it guards every GM-side automation in the system, the
 * emanation sweep included, so a GM with two tabs open doubles all of
 * them. Foundry shows one "active user" either way. A player client is
 * correctly excluded; that was confirmed in the same session with a
 * PC Tester connected alongside.
 *
 * THE GUARD STAYS ANYWAY, because it is true on its own terms: a
 * movement is charged once. It costs one Set lookup, it cannot mask a
 * real second move (every movement operation has its own id), and it
 * makes the within-client story unambiguous for the next reader. What it
 * cannot do — and what no client-side guard can do — is see another
 * machine's rolls.
 *
 * BOUNDED, because this is a per-session cache and a long game makes a
 * lot of moves — the oldest ids are dropped once it fills.
 */
const appliedMovements = new Set();
const APPLIED_CAP = 500;

/** Has this exact movement already been charged? */
function alreadyApplied(movementId) {
  const id = String(movementId ?? "").trim();
  // NO ID, NO GUARD. A movement without one is charged normally rather
  // than silently skipped: refusing to act is a worse failure than
  // acting twice, and this is the branch a future Foundry could take.
  if (!id) return false;
  if (appliedMovements.has(id)) return true;
  appliedMovements.add(id);
  if (appliedMovements.size > APPLIED_CAP) {
    appliedMovements.delete(appliedMovements.values().next().value);
  }
  return false;
}

/** Every region on the scene carrying a hazard, with its spec. */
function hazardRegions() {
  const out = [];
  for (const region of canvas?.scene?.regions ?? []) {
    const raw = region.getFlag?.(SYSTEM_ID, HAZARD_FLAG) ?? null;
    const spec = normaliseHazard(raw);
    if (spec) out.push({ region, spec, raw });
  }
  return out;
}

/** The path this move actually took, in pixels. */
function pathPoints(movement) {
  const points = [];
  const push = (p) => {
    if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) {
      points.push({ x: Number(p.x), y: Number(p.y) });
    }
  };
  push(movement?.origin);
  for (const w of movement?.passed?.waypoints ?? []) push(w);
  push(movement?.destination);
  return points;
}

/**
 * The movement action this move used.
 *
 * THE LAST WAYPOINT THAT NAMES ONE, which is how `movementAction` in
 * combat/movement-workflow.mjs reads the same structure. Written out
 * here rather than imported because that one is not exported, and a
 * second reader of a shape is not a second statement of a rule.
 */
function actionOf(movement) {
  const waypoints = [
    ...(movement?.passed?.waypoints ?? []),
    ...(movement?.pending?.waypoints ?? [])
  ];
  const withAction = waypoints.filter((w) => w?.action);
  return withAction.length ? withAction.at(-1).action : "walk";
}

/**
 * Apply every hazard this move crossed.
 *
 * SWALLOWS ITS OWN FAILURE. This runs after a move that has already
 * happened; throwing here would leave the token moved and the turn in an
 * unknown state to report a bad flag.
 *
 * @param {TokenDocument} tokenDocument the token that moved
 * @param {object} movement Foundry's movement operation
 * @returns {Promise<void>}
 */
export async function applyHazardTerrain(tokenDocument, movement) {
  try {
    const mover = tokenDocument?.actor;
    if (!mover) return;

    // GRAHAM'S RULING: only the creature's own move action.
    if (!hazardTriggers(actionOf(movement))) return;

    // ONE MOVE, ONE CHARGE — see `appliedMovements`.
    if (alreadyApplied(movement?.id)) return;

    const hazards = hazardRegions();
    if (!hazards.length) return;

    const gridSize = canvas?.scene?.grid?.size ?? 0;
    const entered = squaresEntered(pathPoints(movement), gridSize);
    if (!entered.length) return;

    const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

    for (const { region, spec, raw } of hazards) {
      // WHICH OF THE SQUARES CROSSED WERE IN THIS HAZARD. Asked of the
      // region itself rather than recomputed from the template's
      // geometry, so a region a GM has reshaped by hand still answers
      // for where it now is.
      const hits = entered.filter((p) => {
        try {
          return region.testPoint({ x: p.x, y: p.y, elevation: tokenDocument.elevation ?? 0 });
        } catch {
          return false;
        }
      });
      if (!hits.length) continue;

      // "TO AN ENEMY", where the spell says so. The caster's disposition
      // is recorded on the hazard at cast time, for the reason the
      // emanation records its save DC: a caster who later leaves the
      // scene must not change who their spikes bite.
      if (spec.enemiesOnly) {
        const casterDisposition = Number(raw?.casterDisposition);
        const isEnemy = Number.isFinite(casterDisposition)
          ? !sameSide(casterDisposition, tokenDocument.disposition)
          : false;
        if (!hazardAffects(spec, isEnemy)) continue;
      }

      // ONE ROLL PER SQUARE, because the book charges per square. A
      // single roll multiplied would give four identical results and
      // hide the variance the dice are there to produce.
      let rolled = 0;
      let taken = 0;
      for (let i = 0; i < hits.length; i += 1) {
        const roll = await new Roll(spec.damage).evaluate();
        rolled += roll.total;
        const packet = resolveAgainstDefences(mover.system ?? {}, {
          amount: roll.total,
          type: spec.damageType,
          creatureTypeSystem: ownedCreatureTypeSystem(mover),
          // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
          // Hazard terrain is a region on the canvas, so its damage is
          // area damage by Graham's definition.
          magical: true,
          area: true
        });
        taken += packet.taken;
      }

      if (taken > 0) await applyDamageAndCheckDying(mover, taken, { isCritical: false });

      const content = `<div class="trg-prime trg-card"><header class="trg-card-header">`
        + `<h3>${spec.label}</h3></header>`
        + `<p>${hazardLine(spec, mover.name, taken, rolled, hits.length)}</p>`
        // THE SAVE IS PRINTED, NOT ROLLED. Verdant Retribution's Basic
        // Fortitude belongs to a creature that has just been moved by
        // its own player, and interrupting a completed move with a
        // prompt would arrive after the damage it is meant to halve.
        // Named here so a table can apply it rather than silently
        // dropped — the anti-silence rule, with a full stop in it.
        + (spec.save
          ? `<p class="hint">A <strong>${spec.save}</strong> save applies to each square — apply by hand.</p>`
          : "")
        + `</div>`;
      await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: mover }) });
    }
  } catch (error) {
    console.error("TRG Prime | Hazardous terrain could not be applied to this move", error);
  }
}

/** Record a hazard on the region a spell's template just created. */
export async function recordHazard(region, descriptor) {
  if (!region?.setFlag) return null;
  const spec = normaliseHazard(descriptor);
  if (!spec) return null;
  await region.setFlag(SYSTEM_ID, HAZARD_FLAG, descriptor);
  return spec;
}

/** Hook it up. Called from the system's ready hook beside the others. */
export function registerHazardTerrain() {
  Hooks.on("moveToken", async (tokenDocument, movement) => {
    // ONE APPLIER, THE ACTING GM. Every client sees the move; damage
    // applied by each of them would multiply by the number of people at
    // the table — the shape of bug that only shows up in a real session,
    // and the lesson creature auras learned the hard way.
    if (!isActingGM()) return;
    await applyHazardTerrain(tokenDocument, movement);
  });
}
