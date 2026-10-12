/**
 * The Foundry side of a save owed when a spell ends (see end-save.mjs).
 *
 * NEW at 3.606.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOOKED ON `deleteActiveEffect`, FOR THE REASON linked-conditions GIVES.
 *
 * A spell ends five ways — its round clock, the world clock, a Dismiss,
 * a Dispel, or a GM clearing the token's HUD — and only two of those are
 * sweeps. The hook fires for all five, so none of them has to know that
 * Speed charges for itself on the way out. A sweep-side call would have
 * charged a Speed that ran its full minute and let one that was
 * dismissed a round early go free, which is the wrong way round.
 *
 * ONE CLIENT ROLLS, the active GM — every connected client sees the hook.
 *
 * THE SPEC IS STAMPED ON THE CONDITION'S OWN EFFECT, as `conditionSave`'s
 * is, so it dies with the quickened it belongs to and cannot be owed
 * twice.
 */

import {
  END_SAVE_FLAG, endSaveLine, endSaveOutcome, normaliseEndSave
} from "./end-save.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Stamp the save onto the effect backing a condition just applied.
 *
 * FOUND BY STATUS AND CAST, because `applyConditionTags` hands back what
 * it applied rather than where. The cast id narrows it to THIS casting's
 * quickened, so a creature hasted twice owes the save each one prints.
 *
 * TWO CONDITIONS, NOT ONE. `on` is the condition the spell GRANTS — the
 * effect whose ending owes the save (Speed's quickened). `spec.condition`
 * is what the save CHARGES (fatigued). Confusing the two would stamp the
 * price onto the price.
 *
 * @param {Actor} actor
 * @param {object} descriptor the row's `endSave`, plus `saveDC` and `label`
 * @param {object} where
 * @param {string} where.on the granted condition's key
 * @param {string|null} [where.castId]
 * @returns {Promise<object|null>} the normalised spec, or null
 */
export async function recordEndSave(actor, descriptor, { on, castId = null } = {}) {
  const spec = normaliseEndSave(descriptor);
  if (!spec || !actor || !on) return null;
  const candidates = Array.from(actor.effects ?? []).filter(
    (e) => !e.disabled && e.statuses?.has?.(on));
  // WITH A CAST ID, THAT CAST'S EFFECT OR NOTHING. A creature already
  // quickened by something else may have had this application folded into
  // the effect it already carried; stamping Speed's price onto somebody
  // else's quickened would charge it when THAT ends. Refused, and the card
  // says the save could not be recorded, which the table can act on.
  const effect = castId
    ? candidates.find((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId) ?? null
    : candidates[0] ?? null;
  if (!effect?.setFlag) return null;
  await effect.setFlag(SYSTEM_ID, END_SAVE_FLAG, descriptor);
  return spec;
}

/**
 * Roll the save a deleted effect was carrying, and charge for it.
 *
 * MODULE-LOCAL: the hook below is its one caller, and an export with no
 * caller outside the file is how the uncalled-export backlog starts.
 *
 * @returns {Promise<string|null>} the card line, or null when nothing was owed
 */
async function rollEndSave(actor, raw) {
  const spec = normaliseEndSave(raw);
  if (!spec || !actor) return null;
  if (spec.saveDC === null) {
    // SAID, NOT SKIPPED: a Speed whose DC was lost is a Speed that went
    // free, and the table should know to charge it by hand.
    return `<em>${spec.label} ended, but its ${spec.save} save has no DC recorded — `
      + `roll it by hand.</em>`;
  }
  const { TRGCheck } = await import("../dice/check.mjs");
  const saveName = spec.save.charAt(0).toUpperCase() + spec.save.slice(1);
  const save = actor.system?.combat?.saves?.[spec.save];
  const check = await TRGCheck.roll({
    actor,
    label: `${actor.name} — ${saveName} Save`,
    subtitle: `${spec.label} ends — DC ${spec.saveDC}`,
    type: "save",
    subject: spec.save,
    dc: spec.saveDC,
    modifiers: save?.checkModifiers ?? [
      { label: `${saveName} save`, value: Number(save?.total ?? 0), type: "untyped" }
    ]
  });
  const degree = check?.outcome?.degree?.key ?? "failure";
  const outcome = endSaveOutcome(spec, degree);

  if (outcome.value > 0) {
    const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs");
    const label = spec.condition.charAt(0).toUpperCase() + spec.condition.slice(1);
    await applyConditionTags(actor, [{ key: spec.condition, label, value: outcome.value }], {});
  }
  if (outcome.severity) {
    const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
    await rollCriticalInjury(actor, {
      targetActor: actor,
      damageType: spec.criticalType,
      severity: outcome.severity,
      attackBonus: spec.saveDC
    });
  }
  return endSaveLine(spec, actor.name, degree, outcome, check?.outcome?.total ?? "—");
}

/** Register the hook. Called once, at init. */
export function registerEndSaveHooks() {
  globalThis.Hooks.on("deleteActiveEffect", (effect) => {
    try {
      const raw = effect?.getFlag?.(SYSTEM_ID, END_SAVE_FLAG) ?? null;
      if (!raw) return;
      const actor = effect?.parent;
      if (!actor?.effects) return;
      const game = globalThis.game;
      if (game?.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
      // NOT AWAITED — a hook cannot be async. Errors are caught inside.
      (async () => {
        const said = await rollEndSave(actor, raw);
        if (!said) return;
        await globalThis.ChatMessage.create({
          speaker: globalThis.ChatMessage.getSpeaker({ actor }),
          content: `<div class="trg-prime"><p>${said}</p></div>`
        });
      })().catch((err) => console.warn(`${SYSTEM_ID} | an end-of-spell save failed`, err));
    } catch (err) {
      console.warn(`${SYSTEM_ID} | end-of-spell save hook failed`, err);
    }
  });
}
