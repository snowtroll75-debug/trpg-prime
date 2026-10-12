/**
 * Death watch — notice a death when it happens, not at the next turn.
 *
 * NEW at 3.373.0, for a defect Graham reported on 23 August 2026:
 * *"characters don't seem to die when their Dying Condition exceeds Death
 * State … the token should be removed from the combat tracker."*
 *
 * WHAT WAS ACTUALLY WRONG. Not the death rule, and not the reaping. Both
 * were correct and both were driven: `isDead` returned true at Dying 6
 * against a Death State of 5, and one full turn cycle later the actor was
 * skulled, removed from the tracker and announced. The gap was that
 * NOTHING ASKED in between. Every existing caller of `reapDead` sat on a
 * damage path or a turn boundary, so a Dying value that arrived any other
 * way — a GM typing it on the sheet, an effect applying the condition —
 * produced a corpse that stayed in the initiative order looking alive
 * until its own turn came round again, which can be most of a round.
 *
 * A rule with no trigger is the same shape as a rule with no caller: it is
 * correct, tested, and not happening.
 *
 * WHY A HOOK RATHER THAN A CALL SITE. There is no single place conditions
 * are written. They arrive from the sheet, from effects, from spells, from
 * the GM's condition controls and from other modules. Adding `reapDead` to
 * each is the "two places deciding one question" trap several times over,
 * and it would miss the next writer anyway. Watching the effect documents
 * catches every route by construction.
 *
 * ONE CLIENT ONLY. Reaping deletes combatants and writes a status, so
 * every connected client firing it would race. Gated on the acting GM, the
 * same test the turn automation uses.
 *
 * The decision itself — dead, and not yet dealt with — is
 * `needsReaping` in death-state.mjs, kept pure so a harness can drive it.
 */

import { isDead, needsReaping, reapDead } from "./death-state.mjs";
import { isActingGM } from "../acting-gm.mjs";

/** Actors already being handled, so overlapping writes reap once. */
const inFlight = new Set();

/** Actors with a reap scheduled or running. See `scheduleReap`. */
const scheduled = new Map();

/**
 * WHETHER THE SKULL IS ALREADY ON, ASKED OF THE DOCUMENTS (3.551.0).
 *
 * `actor.statuses` is derived and is rebuilt when the actor next
 * prepares. Reaping writes the Dead status, which is itself a document
 * event, which re-enters this watch through its own hooks — and on that
 * second pass the derived set had not caught up, so the watch reaped and
 * announced a second time. Driving the new Constitution-death rule in
 * Graham's world on 10 September 2026 left two Dead effects on the actor,
 * which is what surfaced this: the pattern has been here since 3.373.0
 * and nothing had exercised it from an effect-creation hook before.
 */
function alreadySkulled(actor) {
  if (actor?.statuses?.has?.("dead")) return true;
  for (const effect of actor?.effects ?? []) {
    if (effect?.disabled) continue;
    if (effect?.statuses?.has?.("dead")) return true;
  }
  return false;
}

/**
 * One reap per actor, run OUTSIDE the hook that asked for it.
 *
 * Same shape and same reasoning as ability-collapse-workflow's
 * `scheduleSettle`: a single death fires several hooks, and the write the
 * reap makes is itself a document event. Deferring takes it out of the
 * triggering event's dispatch; coalescing means a storm of hooks about
 * one death is one reap.
 */
function scheduleReap(actor) {
  if (!actor?.id) return;
  const existing = scheduled.get(actor.id);
  if (existing) {
    existing.again = true;
    return;
  }
  const entry = { again: false };
  scheduled.set(actor.id, entry);
  entry.promise = (async () => {
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      do {
        entry.again = false;
        await reapIfNewlyDead(actor);
      } while (entry.again);
    } finally {
      scheduled.delete(actor.id);
    }
  })();
}

/**
 * Reap an actor if this change has just killed them.
 *
 * Defensive throughout: a death notice must never throw back into whatever
 * applied the condition, or a failed reap becomes a failed condition.
 *
 * NOT EXPORTED, on the same grounds as `normaliseSize` in items.mjs:
 * `registerDeathWatchHooks` is this module's public form, and the DECISION
 * a harness needs to drive is `needsReaping` in death-state.mjs, which is
 * pure and exported. Exporting this as well would add a second public entry
 * point that nothing calls.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} whether this call did the reaping
 */
async function reapIfNewlyDead(actor) {
  try {
    if (!actor?.id) return false;
    if (!isActingGM()) return false;
    if (inFlight.has(actor.id)) return false;

    if (!needsReaping(isDead(actor), alreadySkulled(actor))) return false;

    inFlight.add(actor.id);
    try {
      const result = await reapDead(actor);
      // ANNOUNCED, because silence is what the defect looked like. A token
      // vanishing from the tracker with no card is indistinguishable from
      // a bug — and this path fires away from a turn, where no phase card
      // is coming to explain it. Only when THIS call did the removal, so
      // the turn-boundary path does not double-post.
      // AN INSTANT DEATH IS ANNOUNCED IN OR OUT OF COMBAT (3.621.0): Doomed,
      // Fatigue 20 or Soul Drain can kill with no initiative order to leave.
      if (result.removed || result.cause) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content:
            `<div class="trg-prime trg-check-card"><header class="check-header">`
            + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
            + `<h3>Death</h3></div></header>`
            + `<p style="margin:2px 0">${result.cause ? `${result.cause}` : "Dying has passed their Death State"} — `
            + `<strong>${actor.name} dies</strong>${result.removed ? ", and leaves the initiative order" : ""}.</p></div>`
        });
      }
      return result.removed;
    } finally {
      inFlight.delete(actor.id);
    }
  } catch (_e) {
    // Never disturb the write that triggered this.
    inFlight.delete(actor?.id);
    return false;
  }
}

/** Dying cut back to the Death State now in force, if it is above it. */
async function trimDyingToDeathState(actor) {
  try {
    const { actorDeathState, dyingTrimmedTo } = await import("./death-state.mjs");
    const limit = dyingTrimmedTo(actor?.getConditionValue?.("dying"), actorDeathState(actor));
    if (limit !== null) {
      await actor.toggleStatusEffect("dying", { value: limit });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card"><p>${actor.name}'s Death State returns to ${limit}; Dying is reduced to <strong>${limit}</strong>.</p></div>`
      });
    }
  } catch (_e) {
    // The reaper still runs; at worst this is the old behaviour.
  }
}

/**
 * Watch every route a condition can arrive by.
 *
 * `updateActor` is included because Death State itself is a sheet field —
 * lowering it below a standing Dying value kills the character just as
 * surely as raising the Dying value does, and only this hook sees that.
 */
export function registerDeathWatchHooks() {
  const fromEffect = (effect) => effect?.parent ?? null;

  Hooks.on("createActiveEffect", (effect) => {
    const actor = fromEffect(effect);
    if (actor?.documentName === "Actor") scheduleReap(actor);
  });

  Hooks.on("updateActiveEffect", (effect) => {
    const actor = fromEffect(effect);
    if (actor?.documentName === "Actor") scheduleReap(actor);
  });

  // A deletion can kill too: removing whatever was propping the Death State
  // up leaves a Dying value that now exceeds it.
  Hooks.on("deleteActiveEffect", (effect) => {
    const actor = fromEffect(effect);
    if (actor?.documentName !== "Actor") return;
    // A DEATH STATE BONUS THAT ENDS GENTLY (3.630.0) — Worldroot Fragment:
    // "When the effect ends, reduce your Dying condition to your normal Death
    // State if it is currently higher." Trimmed before the reaper looks, so
    // the end of the herb is not a death.
    if (effect?.flags?.["trg-prime"]?.deathStateClamp && isActingGM()) {
      trimDyingToDeathState(actor).finally(() => scheduleReap(actor));
      return;
    }
    scheduleReap(actor);
  });

  Hooks.on("updateActor", (actor, changes) => {
    // Only when something relevant moved — this hook fires on every sheet
    // edit, and asking `isDead` on each is cheap but pointless noise.
    const touched = foundry.utils.hasProperty(changes, "system.combat.deathState")
      || foundry.utils.hasProperty(changes, "system.combat.hp");
    if (touched) scheduleReap(actor);
  });
}
