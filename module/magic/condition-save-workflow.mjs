/**
 * Rolling the escape save at the end of a turn — the Foundry side of
 * magic/condition-save.mjs.
 *
 * NEW at 3.590.0, for Graham's R2 of 25 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPEC RIDES THE CONDITION'S OWN EFFECT, NOT A SEPARATE RECORD.
 *
 * `applyConditionTags` creates or updates the effect that backs a
 * condition, and that effect already carries this spell's `castId` and
 * its expiry. Hanging the save on a SECOND effect would mean two things
 * to keep in step: a Dispel that removed the paralysis would leave a
 * creature rolling Will saves every turn to escape something it no
 * longer has.
 *
 * So the spec is stamped onto the condition's effect after it is
 * applied, and it dies with it — which is the same reasoning the ball's
 * ActiveEffect uses, one release earlier.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "AT THE END OF EACH OF ITS TURNS" IS THE MOMENT ALL FOUR PAGES NAME,
 * so this hangs off `_onEndTurn` beside the recurring ladder. Neither
 * asks the other's question: the ladder asks who is standing in a place,
 * this asks what a creature is carrying.
 */

import {
  CONDITION_SAVE_FLAG, conditionSaveLine, conditionSaveOutcome, normaliseConditionSave
} from "./condition-save.mjs";

const SYSTEM_ID = "trg-prime";
const EXPIRY_FLAG = "conditionExpiresRound";

/** Every condition on this actor that may be saved out of. */
export function savableConditions(actor) {
  const out = [];
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.getFlag?.(SYSTEM_ID, CONDITION_SAVE_FLAG) ?? null;
    const spec = normaliseConditionSave(raw);
    if (spec) out.push({ effect, spec, dc: Number(raw?.saveDC) || 0 });
  }
  return out;
}

/**
 * Roll every escape save this creature owes.
 *
 * SWALLOWS ITS OWN FAILURE, for the reason the ladder and nexus sweeps
 * do: this runs inside the turn-advance path, and a throw would leave
 * the encounter mid-turn to report a bad flag.
 *
 * @returns {Promise<string[]>} lines for the turn card
 */
/** The creature's own rows for a save (3.653.1). */
function saveRowsFor(actor, save) {
  const stat = actor?.system?.combat?.saves?.[save];
  if (Array.isArray(stat?.checkModifiers)) return stat.checkModifiers.map((m) => ({ ...m }));
  return [{ label: `${save.charAt(0).toUpperCase()}${save.slice(1)} save`, value: Number(stat?.total ?? 0) || 0, type: "untyped" }];
}

export async function rollConditionSaves(actor) {
  const lines = [];
  try {
    const owed = savableConditions(actor);
    if (!owed.length) return lines;
    const { TRGCheck } = await import("../dice/check.mjs");

    for (const { effect, spec, dc } of owed) {
      const check = await TRGCheck.roll({
        actor,
        label: `${actor.name} — ${spec.save.charAt(0).toUpperCase() + spec.save.slice(1)} Save`,
        subtitle: `${spec.label} — to shake off ${spec.condition}`,
        type: "save",
        save: spec.save,
        dc,
        // A STATED MODIFIER ON THIS SAVE (3.630.0) — beside the creature's
        // own save, not instead of it (3.653.1).
        ...(spec.modifier ? { modifiers: [...saveRowsFor(actor, spec.save), { label: spec.label, value: spec.modifier, type: spec.modifier < 0 ? "status" : "circumstance" }] } : {})
      });
      const degree = check?.outcome?.degree?.key ?? "failure";
      const outcome = conditionSaveOutcome(spec, degree);

      if (outcome.ends) {
        await actor.toggleStatusEffect(spec.condition, { active: false });
        lines.push(conditionSaveLine(spec, actor.name, degree, outcome));
        continue;
      }

      // PERMANENT (3.650.0, the Gorgon's Fumble): no clock, no more saves.
      if (outcome.permanent) {
        await effect.update({
          [`flags.${SYSTEM_ID}.-=${EXPIRY_FLAG}`]: null,
          [`flags.${SYSTEM_ID}.-=conditionExpiresTime`]: null,
          [`flags.${SYSTEM_ID}.-=spellEffectEnd`]: null,
          [`flags.${SYSTEM_ID}.-=${CONDITION_SAVE_FLAG}`]: null,
          "duration.value": null
        });
        lines.push(`<strong>${spec.label}</strong> — ${actor.name} fumbles: <strong>${spec.condition} permanently</strong>. No further saves.`);
        continue;
      }

      if (outcome.shortenRounds > 0) {
        /*
         * "REDUCE THE REMAINING DURATION BY 1 ROUND." The remaining
         * duration IS the expiry round this effect carries, so the
         * shortening is one subtraction on that number rather than a
         * second clock — and when it reaches the current round the
         * ordinary end-of-turn sweep takes the condition away, through
         * the machinery that already removes everything else.
         */
        const round = Number(game.combat?.round ?? 0);
        const ends = Number(effect.getFlag?.(SYSTEM_ID, EXPIRY_FLAG));
        if (!Number.isFinite(ends)) {
          // NOTHING TO SHORTEN IS SAID OUT LOUD. A paralysis with no
          // clock cannot be reduced by a round, and silently ending it
          // would be more generous than the page.
          lines.push(`<strong>${spec.label}</strong> — ${actor.name} succeeds, but ${spec.condition} has no remaining duration to shorten.`);
          continue;
        }
        const left = Math.max(0, ends - outcome.shortenRounds);
        await effect.setFlag(SYSTEM_ID, EXPIRY_FLAG, left);
        lines.push(conditionSaveLine(spec, actor.name, degree, outcome, Math.max(0, left - round)));
        if (left <= round) {
          await actor.toggleStatusEffect(spec.condition, { active: false });
          lines.push(`<strong>${spec.condition}</strong> runs out.`);
        }
        continue;
      }

      if (outcome.valueDelta !== 0) {
        const held = Number(actor.getConditionValue?.(spec.condition) ?? 0);
        const next = Math.max(0, held + outcome.valueDelta);
        if (next <= 0) await actor.toggleStatusEffect(spec.condition, { active: false });
        else await actor.toggleStatusEffect(spec.condition, { value: next });
        lines.push(conditionSaveLine(spec, actor.name, degree, outcome));
        continue;
      }

      lines.push(conditionSaveLine(spec, actor.name, degree, outcome));
    }
  } catch (error) {
    console.error("TRG Prime | an escape save could not be rolled this turn", error);
  }
  return lines;
}

/**
 * Stamp the escape save onto the effect backing a condition just applied.
 *
 * FOUND BY STATUS, because `applyConditionTags` does not hand back the
 * document — it returns what it applied, not where. The effect carrying
 * the status is the one that was just created or updated.
 */
export async function recordConditionSave(actor, descriptor) {
  const spec = normaliseConditionSave(descriptor);
  if (!spec || !actor) return null;
  const effect = actor.effects?.find?.(
    (e) => !e.disabled && e.statuses?.has?.(spec.condition));
  if (!effect?.setFlag) return null;
  await effect.setFlag(SYSTEM_ID, CONDITION_SAVE_FLAG, descriptor);
  return spec;
}
