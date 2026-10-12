/**
 * THE TETHER'S WATCHER (3.599.0) — the half that touches the world.
 *
 * The rule is in magic/distance-trigger.mjs, which is pure. This file arms a
 * trigger on the tethered creature, measures the distance when that creature
 * moves, and applies the condition when the tether goes taut.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `updateToken`, NOT `preMoveToken` AND NOT `moveToken`.
 *
 * The question is WHERE THE CREATURE ENDED UP, which is exactly what
 * `updateToken` answers — the same hook and the same reason the creature
 * auras use it. `preMoveToken` fires before the move and would measure the
 * distance the creature is escaping from; `moveToken` reports the path, which
 * matters to hazardous terrain (every square crossed) and not here: a
 * creature that loops out to 40 feet and back to 20 is not tethered taut at
 * the end of its move, and the page ties the condition to where it is.
 *
 * ONLY THE TETHERED CREATURE'S OWN MOVEMENT ARMS IT. "If THEY move more than
 * 30 feet away from you" — so the caster walking away does not snap it. That
 * is the printed subject of the sentence, and it is also the kinder reading:
 * a caster cannot immobilise somebody by retreating.
 */

const SYSTEM_ID = "trg-prime";

/** The flag that marks an effect as an armed tether. */
export const TETHER_FLAG = "distanceTether";

/** The armed tethers on this creature. */
export function tethersOn(actor) {
  return Array.from(actor?.appliedEffects ?? actor?.effects ?? [])
    .filter((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, TETHER_FLAG));
}

/**
 * Measure and fire, for one tethered creature that has just moved.
 *
 * SEPARATED FROM THE HOOK so the harness can drive it, and so the hook body
 * stays small enough to read.
 *
 * @returns {Promise<{fired: string[], measured: number|null}>}
 */
export async function checkTethers(tokenDocument) {
  const actor = tokenDocument?.actor ?? null;
  const tethers = tethersOn(actor);
  if (!tethers.length) return { fired: [], measured: null };

  const { distanceBetween } = await import("../combat/geometry.mjs");
  const { normaliseDistanceTrigger, distanceTriggerFires, distanceTriggerFiredLine } =
    await import("./distance-trigger.mjs");
  const moved = tokenDocument.object ?? tokenDocument;
  const fired = [];
  let measured = null;

  for (const tether of tethers) {
    const spec = normaliseDistanceTrigger(tether.getFlag(SYSTEM_ID, TETHER_FLAG));
    if (!spec) continue;
    const anchorUuid = String(tether.getFlag(SYSTEM_ID, "tetherAnchor") ?? "");
    const anchorDoc = anchorUuid ? await fromUuid(anchorUuid).catch(() => null) : null;
    const anchor = anchorDoc?.object ?? anchorDoc ?? null;
    if (!anchor) {
      /*
       * THE ANCHOR IS GONE — the caster's token was removed, or the scene
       * changed. The tether cannot be measured, so it is REMOVED rather than
       * left armed for ever measuring nothing. Said out loud, because a
       * silent disarm is a spell that stops working with no symptom.
       */
      await tether.delete();
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card"><p style="margin:2px 0"><em>`
          + `${actor.name}'s tether has nothing left to measure from — it is removed.</em></p></div>`
      });
      continue;
    }
    const feet = distanceBetween(moved, anchor);
    measured = feet;
    if (!distanceTriggerFires(spec, feet)) continue;

    const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs");
    // THE SPELL'S OWN CLOCK, carried on the tether since the cast: "becomes
    // immobilised FOR THE DURATION" is the spell's duration, not a fresh one.
    await applyConditionTags(actor, [{
      key: spec.condition,
      label: spec.label || spec.condition,
      value: spec.value || undefined
    }], {
      spellEffect: Boolean(tether.getFlag(SYSTEM_ID, "spellEffect")),
      spellEffectEnd: tether.getFlag(SYSTEM_ID, "spellEffectEnd") ?? null,
      expiresRound: tether.getFlag(SYSTEM_ID, "conditionExpiresRound") ?? null,
      castId: tether.getFlag(SYSTEM_ID, "castId") ?? null
    });
    // FIRES ONCE. The tether is spent, so it is disarmed — otherwise every
    // later step would re-apply a condition the creature already has.
    await tether.delete();
    fired.push(spec.condition);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
        + `<h3>Tether</h3></div></header><p style="margin:2px 0">`
        + `${distanceTriggerFiredLine(actor.name, spec, feet)}</p></div>`
    });
  }
  return { fired, measured };
}

/** Wire the hook. Called once, from the system's ready pass. */
export function registerDistanceTriggers() {
  Hooks.on("updateToken", async (tokenDocument, changed) => {
    const { isActingGM } = await import("../acting-gm.mjs");
    if (!isActingGM()) return;
    // MOVED, and nothing else. A token renamed or re-imaged has not walked.
    if (!("x" in changed) && !("y" in changed)) return;
    await checkTethers(tokenDocument);
  });
}
