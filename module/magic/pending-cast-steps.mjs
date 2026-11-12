/**
 * A STEP BEFORE A PENDING CAST'S INTERRUPTION SETTLES (3.684.0; Eldritch Arts
 * Block 6, G26 — optional; Appendix F's S6s-7).
 *
 * Magical Retribution (Spellblade): "Trigger: A creature within melee strikes
 * you and inflicts HP damage whilst you are casting a spell … an attack of
 * opportunity against the attacker, resolved before any potential spell
 * fumbles are rolled." Graham's Q149: automated in the extra-casting-time
 * window — the only "whilst casting" this system models (page 237) — and a
 * reaction button elsewhere.
 *
 * The window's interruption is raised from `preUpdateActor` (hit points went
 * down) and settled on the next tick (magic/pending-cast-workflow.mjs
 * `interruptPendingCast`). That hook knows the hit points, not the blow. So
 * the damage primitive notes WHO dealt it here, synchronously, just before
 * the hit points move (combat/dying-workflow.mjs `applyDamageAndCheckDying`),
 * and the interruption reads the note — a source is only believed for the
 * same blow, within a short window, so a stale note never names the wrong
 * attacker.
 *
 * Then each registered step is awaited, in registration order, BEFORE the
 * window settles into its Failure or Fumble. A step that throws costs its
 * own answer — logged.
 */
import { registeredPendingCastSteps } from "../module-api.mjs";

/** How long a noted source stands for the blow that follows it (ms). */
export const SOURCE_NOTE_MS = 2000;

/** actor key → { sourceUuid, sourceName, context, at } */
const notes = new Map();

function keyOf(actor) {
  return String(actor?.uuid ?? actor?.id ?? "");
}

/**
 * Note who is about to hurt this actor. Called by the damage primitive before
 * the hit points are written; a blow with no known source notes nothing.
 */
export function noteDamageSource(actor, { sourceUuid = "", sourceName = "", context = null } = {}, now = Date.now()) {
  const key = keyOf(actor);
  if (!key) return;
  if (!String(sourceUuid ?? "").trim() && !String(sourceName ?? "").trim()) { notes.delete(key); return; }
  notes.set(key, { sourceUuid: String(sourceUuid ?? ""), sourceName: String(sourceName ?? ""), context: context ?? null, at: Number(now) || 0 });
}

/**
 * The source noted for this actor's latest blow, if it is recent enough to be
 * that blow's; else an empty source.
 * @returns {{sourceUuid: string, sourceName: string, context: object|null}}
 */
export function lastDamageSourceOf(actor, now = Date.now(), within = SOURCE_NOTE_MS) {
  const note = notes.get(keyOf(actor));
  if (!note || (Number(now) || 0) - note.at > within) return { sourceUuid: "", sourceName: "", context: null };
  return { sourceUuid: note.sourceUuid, sourceName: note.sourceName, context: note.context };
}

/** For the harness. */
export function clearDamageSourceNotes() {
  notes.clear();
}

/**
 * Every registered step, awaited before an interruption settles.
 * @param {{actor: Actor, spellName: string, dc: number, criticalSeverity: string|null, sourceUuid: string, sourceName: string, context: object|null}} ctx
 * @returns {Promise<string[]>} the lines the steps said
 */
export async function pendingCastStepsBefore(ctx = {}) {
  const lines = [];
  for (const { key, step } of registeredPendingCastSteps()) {
    try {
      const out = await step({ ...ctx });
      for (const text of Array.isArray(out?.lines) ? out.lines : []) {
        if (typeof text === "string" && text.trim()) lines.push(text.trim());
      }
    } catch (err) {
      console.error(`TRG Prime | a module's pending-cast step "${key}" failed`, err);
    }
  }
  return lines;
}
