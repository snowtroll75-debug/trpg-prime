/**
 * The Foundry side of a movement bind (see movement-bind.mjs).
 *
 * NEW at 3.606.0.
 *
 * THREE CALLERS, THREE MOMENTS:
 *   - the spell applier, when the rung first lands (`recordMovementBind`)
 *   - the movement hook, on every proposed move (`movementBindVerdict`)
 *   - the start of the creature's own turn (`rollMovementBindSaves`)
 *
 * THE BIND RIDES ONE ACTIVE EFFECT, stamped with the cast's id and clock,
 * so the spell's minute, a Dismiss and a Dispel all end it by the one route
 * every other spell effect is ended by — and a new save that frees the
 * creature deletes that same effect rather than setting a second flag
 * something would have to remember to read.
 */

import {
  MOVEMENT_BIND_FLAG, bindLine, bindOutcome, leashRefuses, leashRefusalLine, normaliseMovementBind
} from "./movement-bind.mjs";

const SYSTEM_ID = "trg-prime";

/** Every live bind on an actor. */
function bindsOn(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect?.disabled) continue;
    const record = effect.getFlag?.(SYSTEM_ID, MOVEMENT_BIND_FLAG) ?? null;
    if (record?.bind) out.push({ effect, record });
  }
  return out;
}

/** The square a token stands in now, as the anchor a leash is measured from. */
function anchorOf(tokenDocument) {
  if (!tokenDocument) return null;
  return {
    x: Number(tokenDocument.x ?? 0),
    y: Number(tokenDocument.y ?? 0),
    sceneId: tokenDocument.parent?.id ?? null
  };
}

/**
 * The flag written onto the bound creature's effect.
 *
 * @param {object} spec normalised
 * @param {object} outcome from `bindOutcome`
 * @param {object} context
 * @returns {object|null} the record, or null when the rung leaves them free
 */
export function bindRecord(spec, outcome, { saveDC, tokenDocument, raw }) {
  if (outcome.free) return null;
  return {
    ...raw,
    saveDC: Number(saveDC) || 0,
    bind: outcome.bind,
    rung: outcome.rung,
    anchor: outcome.bind.leashFeet !== null ? anchorOf(tokenDocument) : null
  };
}

/**
 * What the movement hook must do about this move, decided synchronously.
 *
 * EVERY WAYPOINT IS ASKED, NOT ONLY THE DESTINATION. A creature on a
 * five-foot leash dragged out twenty feet and back in one move ends inside
 * its leash and was never allowed to leave it.
 *
 * DEFENSIVE, like every other canvas read in that hook: a scene with no
 * grid or a Foundry that measures differently leaves the move alone.
 *
 * @returns {{refused: string, difficult: boolean}}
 */
export function movementBindVerdict(tokenDocument, movement) {
  const verdict = { refused: "", difficult: false };
  try {
    const actor = tokenDocument?.actor;
    const binds = bindsOn(actor);
    if (!binds.length) return verdict;
    const points = [
      ...(movement?.pending?.waypoints ?? []),
      movement?.destination
    ].filter((p) => p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
    for (const { record } of binds) {
      if (record.bind.difficult) verdict.difficult = true;
      const leash = record.bind.leashFeet;
      const anchor = record.anchor;
      if (leash === null || leash === undefined || !anchor) continue;
      if (anchor.sceneId && tokenDocument.parent?.id && anchor.sceneId !== tokenDocument.parent.id) continue;
      for (const p of points) {
        const measured = globalThis.canvas?.grid?.measurePath?.([
          { x: anchor.x, y: anchor.y }, { x: Number(p.x), y: Number(p.y) }
        ]);
        const feet = Math.round(Number(measured?.distance));
        if (leashRefuses(feet, leash)) {
          verdict.refused = leashRefusalLine(actor?.name ?? "The creature", record.label ?? "the spell", leash, feet);
          return verdict;
        }
      }
    }
  } catch (_e) {
    /* a bind that cannot be measured leaves the move alone */
  }
  return verdict;
}

/**
 * The new save each bound creature makes at the start of its turn.
 *
 * SWALLOWS ITS OWN FAILURE, as the other turn-boundary sweeps do: this runs
 * inside the turn-advance path, and a throw would leave the encounter
 * mid-turn to report a bad flag.
 *
 * @returns {Promise<string[]>} lines for the turn card
 */
export async function rollMovementBindSaves(actor, token = null) {
  const lines = [];
  try {
    const owed = bindsOn(actor).filter(({ record }) => record.bind.resave);
    if (!owed.length) return lines;
    const { TRGCheck } = await import("../dice/check.mjs");
    for (const { effect, record } of owed) {
      const spec = normaliseMovementBind(record);
      if (!spec) {
        lines.push(`<em>${record.label ?? "A bind"} on ${actor.name} is malformed — no save rolled.</em>`);
        continue;
      }
      const saveName = spec.save.charAt(0).toUpperCase() + spec.save.slice(1);
      const save = actor.system?.combat?.saves?.[spec.save];
      const check = await TRGCheck.roll({
        actor,
        label: `${actor.name} — ${saveName} Save`,
        subtitle: `${spec.label} — a new save, DC ${record.saveDC}`,
        type: "save",
        subject: spec.save,
        dc: Number(record.saveDC) || 0,
        modifiers: save?.checkModifiers ?? [
          { label: `${saveName} save`, value: Number(save?.total ?? 0), type: "untyped" }
        ]
      });
      const degree = check?.outcome?.degree?.key ?? "failure";
      const outcome = bindOutcome(spec, degree);
      lines.push(bindLine(actor.name, spec.label, degree, outcome));
      if (outcome.free) {
        await effect.delete();
        continue;
      }
      // "THEIR CURRENT LOCATION" IS WHERE THEY STAND WHEN THE RUNG LANDS —
      // so a new leash is anchored now, not where the first one was.
      const doc = token?.document ?? token ?? actor.getActiveTokens?.()[0]?.document ?? null;
      await effect.setFlag(SYSTEM_ID, MOVEMENT_BIND_FLAG, bindRecord(spec, outcome, {
        saveDC: record.saveDC, tokenDocument: doc, raw: record
      }));
    }
  } catch (error) {
    console.error("TRG Prime | a movement bind's new save could not be rolled", error);
  }
  return lines;
}
