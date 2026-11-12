/**
 * WHAT A MODULE MAY SAY TO A CASTING (3.678.0; Eldritch Arts Block 2, D6, D7
 * and D14). Chapter 7's areas change casting in four ways the gates of
 * 3.672.0 could not:
 *
 *   - an antimagic zone REFUSES it: "No spell or magical ability functions
 *     inside" (D7);
 *   - a Magic Suppression area READS ITS DEGREE DIFFERENTLY: "results of
 *     partial, failure and fumble are all classed as a failure whereas
 *     blunder results are treated as fumbles" (D7);
 *   - the same area means NO RESONANCE EVENT: "Magical Resonance events
 *     simply do not exist in areas of suppression" (D6);
 *   - an antimagic zone SWITCHES EFFECTS OFF while you stand in it: "Magic
 *     items lose all properties except their physical form … Effects resume
 *     once they leave the zone" (D14).
 *
 * The rules are the module's; this file only asks, in registration order,
 * and cleans the answers. A module that throws costs its own answer, never
 * the casting — logged, and said on the card where there is one.
 */
import {
  registeredCastRefusals, registeredCastDegreeRemaps,
  registeredResonanceSuppressors, registeredEffectSuppressors, registeredCastPreludes
} from "../module-api.mjs";

/** The degrees a casting check can come out at, best first. */
export const CAST_DEGREES = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);

/**
 * The first reason any module gives for refusing this casting, or "".
 * @param {{actor: object, spell: object, spellData: object, innate: boolean, itemCast: boolean, ritual: boolean}} ctx
 * @returns {Promise<string>}
 */
export async function castRefusalFrom(ctx) {
  for (const refuse of registeredCastRefusals()) {
    try {
      const reason = await refuse(ctx);
      if (typeof reason === "string" && reason.trim()) return reason.trim();
    } catch (err) {
      console.error("TRG Prime | a module's cast refusal failed", err);
    }
  }
  return "";
}

/**
 * A CAST'S PRELUDE (3.682.0; Eldritch Arts Block 4): the first module that
 * takes this casting over, `{ handled: true, result }`, or null to go on. A
 * prelude that throws is logged and the cast goes on as the core's.
 * @param {{actor: object, spell: object, options: object}} ctx
 * @returns {Promise<{handled: true, result: *}|null>}
 */
export async function castPreludeFrom(ctx) {
  for (const { key, prelude } of registeredCastPreludes()) {
    try {
      const out = await prelude(ctx);
      if (out && out.handled === true) return { handled: true, result: out.result ?? null };
    } catch (err) {
      console.error(`TRG Prime | a module's cast prelude "${key}" failed`, err);
    }
  }
  return null;
}

/**
 * The casting's degree after every module's remap, and what each said.
 * An answer naming no known degree is ignored.
 * @param {{degree: string}} ctx and the rest of the casting
 * @returns {Promise<{degree: string, lines: string[]}>}
 */
export async function remapCastDegree(ctx) {
  let degree = String(ctx?.degree ?? "");
  const lines = [];
  for (const remap of registeredCastDegreeRemaps()) {
    try {
      const out = await remap({ ...ctx, degree });
      const next = String(out?.degree ?? "").trim().toLowerCase();
      if (CAST_DEGREES.includes(next)) degree = next;
      for (const text of Array.isArray(out?.lines) ? out.lines : []) {
        if (typeof text === "string" && text.trim()) lines.push(text.trim());
      }
    } catch (err) {
      console.error("TRG Prime | a module's casting degree remap failed", err);
      lines.push("<em>A module's reading of this casting's degree failed — see the console.</em>");
    }
  }
  return { degree, lines };
}

/**
 * Why no Resonance event is rolled here, or "".
 * @param {{actor: object, reason: string}} ctx
 * @returns {Promise<string>}
 */
export async function resonanceSuppressedBy(ctx) {
  for (const suppress of registeredResonanceSuppressors()) {
    try {
      const reason = await suppress(ctx);
      if (typeof reason === "string" && reason.trim()) return reason.trim();
    } catch (err) {
      console.error("TRG Prime | a module's Resonance suppressor failed", err);
    }
  }
  return "";
}

/**
 * Has a module switched this effect off? Synchronous and cheap: asked by
 * TRGActiveEffect.isSuppressed every time an actor prepares its data.
 * @param {ActiveEffect} effect
 * @returns {boolean}
 */
export function effectSuppressedByModule(effect) {
  for (const suppressed of registeredEffectSuppressors()) {
    try {
      if (suppressed(effect) === true) return true;
    } catch (err) {
      console.error("TRG Prime | a module's effect suppressor failed", err);
    }
  }
  return false;
}
