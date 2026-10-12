/**
 * The Foundry half of a wearing clock (see wearing-clock.mjs).
 *
 * NEW at 3.608.0. ONE CALLER: the weapon attack path, after a hit's damage
 * has been resolved, with the struck creature and the damage type it took.
 *
 * SWALLOWS ITS OWN FAILURE. It runs inside an attack after the damage has
 * landed; a throw here would lose the rest of the attack's card to report a
 * malformed flag.
 */

import { DAMAGE_TYPES } from "../config.mjs";
import { WEARING_CLOCK_FLAG, hitWears, normaliseWearingClock, wornClocks, wornLine } from "./wearing-clock.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Take a blow off every wearing spell the struck creature holds.
 *
 * @param {Actor} actor the creature that was hit
 * @param {string} damageType what the hit dealt
 * @returns {Promise<string[]>} card lines, already posted
 */
export async function wearOnHit(actor, damageType) {
  const lines = [];
  try {
    if (!actor?.effects) return lines;
    const byCast = new Map();
    for (const effect of actor.effects) {
      if (effect.disabled) continue;
      const raw = effect.getFlag?.(SYSTEM_ID, WEARING_CLOCK_FLAG);
      const spec = normaliseWearingClock(raw);
      const castId = effect.getFlag?.(SYSTEM_ID, "castId");
      if (!spec || !castId || byCast.has(castId)) continue;
      if (!hitWears(spec, damageType, DAMAGE_TYPES)) continue;
      byCast.set(castId, { spec, label: spec.label || effect.name });
    }
    if (!byCast.size) return lines;
    const now = {
      worldTime: Number(game.time?.worldTime ?? 0),
      round: game.combat?.started ? Number(game.combat.round ?? 0) : null
    };
    for (const [castId, { spec, label }] of byCast) {
      const held = Array.from(actor.effects).filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId);
      let spent = false;
      let failed = false;
      let shown = null;
      for (const effect of held) {
        const result = wornClocks({
          end: effect.getFlag?.(SYSTEM_ID, "spellEffectEnd") ?? null,
          expiresRound: effect.getFlag?.(SYSTEM_ID, "conditionExpiresRound") ?? null,
          // THE STORED SHAPE, not the derived getters: V14 keeps `{value, units}`.
          duration: effect._source?.duration ?? null
        }, spec.seconds, now);
        if (!shown || result.remainingSeconds !== null) shown = result;
        spent = spent || result.spent;
        if (result.spent) continue;
        const update = {};
        if (result.end !== null) update[`flags.${SYSTEM_ID}.spellEffectEnd`] = result.end;
        if (result.expiresRound !== null) update[`flags.${SYSTEM_ID}.conditionExpiresRound`] = result.expiresRound;
        if (result.duration) update["duration.value"] = result.duration.value;
        // A REFUSED UPDATE IS SAID, NOT HIDDEN (3.608.2). Foundry logs a
        // rejected update and returns nothing rather than throwing, which is
        // how the first build printed "wears: 1 minute off" over a clock that
        // had not moved.
        if (Object.keys(update).length && !(await effect.update(update))) failed = true;
      }
      if (spent) {
        const { removeEffectsByCastId } = await import("../combat/effect-application-workflow.mjs");
        await removeEffectsByCastId(actor, castId, { dismissed: false });
        const { endActiveSpell, getActiveSpells } = await import("./active-spells.mjs");
        if (getActiveSpells(actor).some((e) => e.id === castId)) {
          await endActiveSpell(actor, castId, { dismissed: false });
        }
      }
      lines.push(failed
        ? `<em>${label} on ${actor.name} should lose a minute to that blow, and its clock could not be changed — take it off by hand.</em>`
        : wornLine(actor.name, label, spec.seconds, { ...(shown ?? {}), spent, remainingSeconds: shown?.remainingSeconds ?? null }));
    }
    if (lines.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`
      });
    }
  } catch (error) {
    console.error("TRG Prime | a wearing clock could not be worn", error);
  }
  return lines;
}
