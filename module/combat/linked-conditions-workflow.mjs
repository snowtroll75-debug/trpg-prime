/**
 * THE THIRD AND FOURTH CLOCKS: a condition that ends when ANOTHER
 * condition ends, and a condition that arrives when one does.
 *
 * NEW at 3.581.0, for the pages 211-220 audit's D2 and D10 and Graham's
 * R2 and R10 of 21 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE BOOK ASKS FOR, AND WHAT THERE WAS.
 *
 * Twenty-four critical rows tie one condition's life to another's:
 *
 *   Piercing 47   "Bleeding 3 & Injured 1 UNTIL THE BLEEDING STOPS."
 *   Fire 60       "Recurring 1 & Blinded UNTIL THE DAMAGE ENDS."
 *   Subdual 90    "Bleeding 2 & Unconscious UNTIL THE BLEED ENDS."
 *
 * The system had two clocks — a round counter and the world clock — and
 * neither of them can express this, because the moment a bleed stops is
 * decided by a flat check at the end of a turn, not by a number known
 * when the critical lands. So every one of those riders was permanent.
 * Subdual 90 is the one to read twice: an Unconscious that was meant to
 * last as long as a bleed, and lasted until a GM noticed.
 *
 * Three more rows run the other way — a condition that arrives when
 * another leaves:
 *
 *   Mental 60   "Controlled… AND THEN Injured 1 WHEN THE CONTROL ENDS."
 *   Mental 64   "WHEN THE FLEEING ENDS, target is Confused."
 *   Poison 60   "Blinded AND THEN Dazzled for 1 minute THEREAFTER."
 *
 * All three applied both conditions at once, which loses the only
 * interesting thing about them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOOKED ON `deleteActiveEffect`, NOT CALLED FROM THE SWEEPERS, and this
 * is the whole design. A bleed can stop five different ways — its own
 * flat check at the end of a turn, a Medicine check, a heal, a spell, a
 * GM clicking the token HUD — and only one of those is a sweep. The hook
 * fires for every one of them, so none of them has to know that linked
 * conditions exist. The same argument `registerAttachedLightCleanup`
 * makes for lights, for the same reason.
 *
 * THE ACTOR IS `effect.parent`, MEASURED. Blocks 19 and 20 cost three
 * releases to two uuids and a collection that each looked like the right
 * way to name a document and were not — `game.actors` has no token
 * actors in it, and `actor.uuid` and `effect.uuid` both carry a token
 * path prefix that renames a shared record. `effect.parent` is the
 * document the effect is actually embedded in, whether that is a world
 * actor or a token's own, and it is handed over by Foundry rather than
 * looked up by name.
 */
import {
  applyConditionTags, ENDS_WITH_FLAG, END_TIME_FLAG, FOLLOW_ON_FLAG
} from "./effect-application-workflow.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { effectExpiredLine } from "./effect-expiry.mjs";
import { frozenByStasis, stasisEffectOf } from "../magic/stasis.mjs";

const SYSTEM_ID = "trg-prime";

/*
 * A DELETE THAT CASCADES MUST NOT CASCADE INTO ITSELF. Removing a linked
 * condition fires `deleteActiveEffect` again, and a row could in
 * principle link A to B and B to A. The set is keyed by the actor's own
 * id for the duration of one cascade, which is cheap and ends it.
 */
const cascading = new Set();

/** The condition keys an effect carries. */
function statusKeysOf(effect) {
  const statuses = effect?.statuses;
  if (!statuses) return [];
  return Array.from(statuses).filter((key) => Boolean(CONDITIONS[key]));
}

/**
 * Remove every effect on the actor that was waiting for one of `ended`,
 * and only where the actor really no longer has that condition.
 *
 * THE SECOND HALF MATTERS. Two criticals can each inflict a bleed; the
 * first bleed's effect ending does not mean the bleeding has stopped.
 * `hasCondition` is asked AFTER the delete has landed, so what it
 * answers is the state the table can see.
 *
 * @param {Actor} actor
 * @param {string[]} ended condition keys that just went away
 * @returns {Promise<string[]>} labels of what was removed
 */
export async function sweepLinkedConditions(actor, ended = []) {
  const gone = [];
  if (!actor?.effects) return gone;

  const waiting = new Set(
    ended.filter((key) => !actor.hasCondition?.(key))
  );
  if (!waiting.size) return gone;

  for (const effect of Array.from(actor.effects ?? [])) {
    const link = effect.getFlag?.(SYSTEM_ID, ENDS_WITH_FLAG);
    if (!link || !waiting.has(link)) continue;
    const statusId = effect.statuses?.values?.().next?.()?.value ?? null;
    gone.push(statusId ? (CONDITIONS[statusId]?.label ?? effect.name) : effect.name);
    await effect.delete();
  }

  return gone;
}

/**
 * Apply whatever an effect had queued behind it.
 *
 * @param {Actor} actor
 * @param {object} followOn the FOLLOW_ON_FLAG payload
 * @returns {Promise<Array<object>>} what was applied
 */
export async function applyFollowOn(actor, followOn) {
  const tags = Array.isArray(followOn?.tags) ? followOn.tags : [];
  if (!actor || !tags.length) return [];

  // THE SUCCESSOR'S OWN DURATION IS RESOLVED HERE, not when the critical
  // landed, because a duration counted in rounds has to start from the
  // round it starts in. Poison 60's Dazzled lasts a minute FROM the
  // Blinded ending, and stamping that at the moment of the hit would
  // have spent most of it before it arrived.
  const round = Number(globalThis.game?.combat?.round ?? 0);
  const now = Number(globalThis.game?.time?.worldTime ?? 0);
  const stamped = tags.map((tag) => ({
    ...tag,
    expiresRound: Number.isFinite(Number(followOn?.rounds)) && followOn.rounds !== null
      ? round + Math.max(1, Math.trunc(Number(followOn.rounds)))
      : null,
    expiresTime: Number.isFinite(Number(followOn?.seconds)) && followOn.seconds !== null
      ? now + Math.max(1, Math.trunc(Number(followOn.seconds)))
      : null
  }));

  const applied = await applyConditionTags(actor, stamped);
  // FLAGS CARRIED ACROSS (3.630.0) — Writ of Restraint's escape save and
  // no-Reactions travel from the Slowed 2 to the Slowed 1 that replaces it.
  const carry = followOn?.carry && typeof followOn.carry === "object" ? followOn.carry : null;
  if (carry) {
    const keys = new Set(tags.map((t) => t?.key).filter(Boolean));
    for (const effect of Array.from(actor.effects ?? []).filter((e) => !e.disabled && [...keys].some((k) => e.statuses?.has?.(k)))) {
      for (const [flag, value] of Object.entries(carry)) {
        if (["conditionSave", "fumbleNoReactions"].includes(flag)) await effect.setFlag("trg-prime", flag, value).catch(() => {});
      }
    }
  }
  return applied;
}

/**
 * Delete conditions whose world-time deadline has passed.
 *
 * The out-of-combat counterpart of `expireTimedConditions`, for the five
 * rows that state a real span — "Unconscious for 1d4 hours" — which no
 * number of combat rounds can hold. Deliberately NOT folded into
 * `expireSpellEffects`: that one is gated on the spellEffect flag, and a
 * critical injury is not a spell.
 *
 * @param {Actor} actor
 * @param {number} worldTime
 * @returns {Promise<string[]>} labels of what expired
 */
export async function sweepWorldTimeConditions(actor, worldTime) {
  const expired = [];
  // NOT WHILE IN STASIS (3.614.0, R2) — see magic/stasis.mjs.
  const stasis = stasisEffectOf(Array.from(actor?.effects ?? []));
  for (const effect of Array.from(actor?.effects ?? [])) {
    if (frozenByStasis(effect, stasis)) continue;
    const end = effect.getFlag?.(SYSTEM_ID, END_TIME_FLAG);
    if (end === undefined || end === null) continue;
    if (Number(worldTime) < Number(end)) continue;
    const statusId = effect.statuses?.values?.().next?.()?.value ?? null;
    expired.push(statusId ? (CONDITIONS[statusId]?.label ?? effect.name) : effect.name);
    await effect.delete();
  }
  return expired;
}

/**
 * Turn a row's scoped text durations into timing the applier can stamp.
 *
 * THE ONE PLACE A TEXT DURATION BECOMES A NUMBER, so the critical path
 * and the fumble path cannot disagree about what "until the end of their
 * next turn" means.
 *
 * SEPARATED FROM THE PERSISTENCE CLOCK, NOT LAYERED OVER IT. A tag with
 * a text duration is applied on its own, with no call-level expiry
 * behind it — because a linked condition ("until the bleeding stops")
 * and a world-time one ("for 1d4 hours") must not ALSO carry the
 * column's round clock, and a fallback that is consulted whenever the
 * per-tag round is absent would give them exactly that.
 *
 * @param {Array<{key: string}>} tags the row's resolved condition tags
 * @param {string} text the row's effect (and any qualifying armour clause)
 * @returns {Promise<{timed: object[], plain: object[], notes: string[]}>}
 *   `timed` carry their own clocks; `plain` are for the Persistence
 *   clock exactly as before.
 */
export async function stampRowDurations(tags, text, { persistenceRounds = null } = {}) {
  const { scopedConditionDurations, followOnClauses, withoutFollowOns, UNIT_SECONDS } =
    await import("./critical-durations.mjs");

  const scoped = new Map(scopedConditionDurations(text).map((tag) => [tag.key, tag.duration]));
  const followOns = followOnClauses(text);
  const immediate = withoutFollowOns(tags, followOns);

  const game = globalThis.game;
  const round = Number(game?.combat?.round ?? 0);
  const now = Number(game?.time?.worldTime ?? 0);

  const timed = [];
  const plain = [];
  const notes = [];

  for (const tag of immediate) {
    const duration = scoped.get(tag.key) ?? null;
    const queued = followOns.find((clause) => clause.after === tag.key) ?? null;
    const followOn = queued
      ? {
          tags: queued.tags,
          /*
           * A SUCCESSOR WITH NO STATED DURATION INHERITS THE COLUMN'S.
           * Mental 60's "and then Injured 1 when the control ends" says
           * nothing about how long the Injured lasts, and the row's
           * Persistence is D — so it gets the rounds the column rolled,
           * counted from when it actually arrives rather than from the
           * blow. Without this the successor is permanent, which is the
           * defect this whole block exists to remove, arriving by a new
           * door.
           */
          rounds: queued.duration?.kind === "rounds"
            ? queued.duration.rounds
            : (persistenceRounds === null ? null : Math.max(1, Math.trunc(Number(persistenceRounds) || 0))),
          seconds: queued.duration?.seconds ?? null
        }
      : null;

    /*
     * A SUCCESSOR IS NOT A CLOCK (F2 of this block, found by driving
     * Poison 60 in a live world before the harness was written).
     *
     * "Target Blinded and then Dazzled for 1 minute thereafter" times
     * the DAZZLED, not the Blinded — and the Blinded's own duration is
     * the row's Persistence column, M. Carrying a follow-on used to be
     * enough on its own to move a tag into the timed group, which is
     * applied with no call-level expiry behind it, so the Blinded came
     * out with no clock of any kind and sat there for good.
     *
     * A tag that has a successor but no duration of its own goes back
     * to the column, carrying the successor with it — `applyConditionTags`
     * reads the follow-on off the tag and does not care which group it
     * arrived in.
     */
    if (!duration) {
      plain.push(followOn ? { ...tag, followOn } : tag);
      if (followOn) {
        notes.push(
          `<strong>${followOn.tags.map((t) => (t.value === null ? t.label : `${t.label} ${t.value}`)).join(", ")}</strong>`
          + ` arrives when the ${CONDITIONS[tag.key]?.label ?? tag.key} ends.`
        );
      }
      continue;
    }

    const stamped = { ...tag };
    if (followOn) {
      stamped.followOn = followOn;
      notes.push(
        `<strong>${followOn.tags.map((t) => (t.value === null ? t.label : `${t.label} ${t.value}`)).join(", ")}</strong>`
        + ` arrives when the ${CONDITIONS[tag.key]?.label ?? tag.key} ends.`
      );
    }

    if (duration?.kind === "rounds") {
      stamped.expiresRound = round + Math.max(1, Math.trunc(Number(duration.rounds) || 1));
      if (duration.seconds !== null && duration.seconds !== undefined) {
        // BOTH CLOCKS ON ONE EFFECT, the same way a spell's are: a
        // minute is ten rounds inside a fight and sixty seconds outside
        // one, and whichever clock is moving should be the one that ends
        // it.
        stamped.expiresTime = now + Number(duration.seconds);
      }
      notes.push(`<strong>${tag.label}</strong> ${duration.label}.`);
    } else if (duration?.kind === "linked") {
      stamped.endsWith = duration.to;
      notes.push(`<strong>${tag.label}</strong> ${duration.label}.`);
    } else if (duration?.kind === "time") {
      // THE DIE IS ROLLED, not averaged — "1d4 hours" is a number
      // somebody at the table should see.
      const roll = await new globalThis.Roll(duration.formula).evaluate();
      const seconds = (UNIT_SECONDS[duration.unit] ?? 0) * Number(roll.total ?? 0);
      stamped.expiresTime = now + seconds;
      notes.push(
        `<strong>${tag.label}</strong> for <strong>${roll.total} ${duration.unit}${roll.total === 1 ? "" : "s"}</strong> (${duration.formula}).`
      );
    }

    timed.push(stamped);
  }

  return { timed, plain, notes };
}

/** Say what a cascade did, as one card. */
async function announce(actor, removed, applied) {
  const lines = [];
  for (const label of removed) {
    const said = effectExpiredLine(label);
    if (said) lines.push(said);
  }
  if (applied.length) {
    lines.push(
      `<strong>${applied.map((t) => (t.value === null || t.value === undefined ? t.label : `${t.label} ${t.value}`)).join(", ")}</strong> now applies.`
    );
  }
  if (!lines.length) return;
  await globalThis.ChatMessage.create({
    speaker: globalThis.ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`
  });
}

/** Register the cascade. Called once, at init. */
export function registerLinkedConditionHooks() {
  globalThis.Hooks.on("deleteActiveEffect", (effect) => {
    try {
      const actor = effect?.parent;
      if (!actor?.effects) return;

      const followOn = effect.getFlag?.(SYSTEM_ID, FOLLOW_ON_FLAG) ?? null;
      const ended = statusKeysOf(effect);
      if (!followOn && !ended.length) return;

      // ONE CLIENT DOES THE DELETES, the same active-GM rule the world
      // clock uses — every connected client sees this hook fire.
      const game = globalThis.game;
      if (game?.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;

      const guard = actor.id ?? actor.uuid ?? "";
      if (cascading.has(guard)) return;
      cascading.add(guard);

      // NOT AWAITED — a hook cannot be async, and a promise returned
      // here is a promise nobody holds. Errors are caught inside.
      (async () => {
        try {
          const removed = await sweepLinkedConditions(actor, ended);
          const applied = followOn ? await applyFollowOn(actor, followOn) : [];
          await announce(actor, removed, applied);
        } finally {
          cascading.delete(guard);
        }
      })().catch((err) => {
        cascading.delete(guard);
        console.warn(`${SYSTEM_ID} | linked-condition cascade failed`, err);
      });
    } catch (err) {
      console.warn(`${SYSTEM_ID} | linked-condition hook failed`, err);
    }
  });
}
