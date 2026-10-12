/**
 * Ability collapse — applying Chapter 1's -5 consequences as they happen.
 *
 * NEW at 3.550.0. The rule itself is in ability-collapse.mjs and is pure;
 * this file is the trigger and the write, and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A HOOK, on the same grounds as the death watch beside it. An
 * attribute total is DERIVED — base plus racial plus item plus magic plus
 * status plus the size table — so there is no single place it changes.
 * It moves when the sheet is edited, when an effect is created, updated
 * or deleted, when an item carrying one is added or removed, and when a
 * spell drains somebody. Adding a call to each of those is the "two
 * places deciding one question" trap several times over, and it would
 * miss the next writer anyway.
 *
 * NOT IN prepareDerivedData, which is where the totals are computed and
 * where this obviously belongs until you try it: derivation runs on every
 * client on every re-render and must not write. A condition applied there
 * would re-enter derivation, and every connected client would race to
 * apply it.
 *
 * ONE CLIENT ONLY, gated on the acting GM, for that same reason.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT LIFTS AGAIN, AND THAT IS THE HALF WORTH THE CARE.
 *
 * A rule that only ever applies is a trap: Restore a drained
 * Constitution and the character would stay Unconscious for ever with
 * nothing on the sheet to say why. So the conditions come back off when
 * the scores recover — but ONLY the ones this rule put on, tracked on a
 * flag, and only when no OTHER reason to be unconscious is standing.
 * Waking somebody who is unconscious at 0 HP would be a worse bug than
 * the one being fixed.
 *
 * DEATH DOES NOT LIFT. Restoring a dead character's Constitution does not
 * un-kill them; that is a resurrection, and it is the GM's to perform.
 */

import { actorAbilityCollapse, collapseTransition } from "./ability-collapse.mjs";
import { isActingGM } from "../acting-gm.mjs";
import { reapDead } from "./death-state.mjs";

const SYSTEM_ID = "trg-prime";

/** The flag recording which conditions this rule applied, and for what. */
const FLAG = "abilityCollapse";

/** Actors already being handled, so overlapping writes settle once. */
const inFlight = new Set();

/**
 * Actors with a settle scheduled or running, so a storm of hooks about
 * one change becomes one pass. See `scheduleSettle`.
 */
const scheduled = new Map();

/**
 * EVERY STATUS THE ACTOR IS ACTUALLY UNDER (3.551.0).
 *
 * THE DEFECT THIS EXISTS FOR, found by driving 3.550.0 in Graham's world
 * on 10 September 2026: every condition this rule applied landed TWICE,
 * and its card posted twice — reproducible on all four attempts, by both
 * routes a drain can arrive by (an Active Effect, and a direct write to
 * an attribute slot).
 *
 * `actor.statuses` is DERIVED, and it is rebuilt when the actor next
 * prepares. Applying a condition is itself a document event, which
 * re-enters this rule through its own hooks — and on that second pass the
 * derived set had not yet caught up, so the rule read "nothing applied",
 * applied it again, and announced it again. The condition looked right
 * afterwards only because `statuses` is a Set; the actor was left
 * carrying two identical ActiveEffect documents.
 *
 * So presence is read from the EFFECT DOCUMENTS as well, which are
 * authoritative the moment the create resolves, and unioned with the
 * derived set so neither can be the one that is stale. Belt and braces on
 * purpose: this is the check that decides whether the rule writes at all.
 */
function presentStatuses(actor) {
  const out = new Set(actor?.statuses ?? []);
  for (const effect of actor?.effects ?? []) {
    if (effect?.disabled) continue;
    for (const status of effect?.statuses ?? []) out.add(status);
  }
  return Array.from(out);
}

/**
 * Conditions a creature can be under for reasons that have nothing to do
 * with its ability scores. If one of these is standing, this rule does
 * not take Unconscious back off — it cannot tell whose it is.
 */
function otherReasonToBeUnconscious(actor) {
  if (Number(actor?.system?.resources?.hp?.value ?? 1) <= 0) return true;
  const present = presentStatuses(actor);
  if (present.includes("dying")) return true;
  if (present.includes("dead")) return true;
  return false;
}

/**
 * One settle per actor, run OUTSIDE the hook that asked for it.
 *
 * TWO THINGS, BOTH LEARNED THE HARD WAY (3.551.0).
 *
 * DEFERRED, because a single logical change fires several hooks — an
 * effect is created AND the actor updates — and because the write this
 * rule makes is itself a document event. Running inside the triggering
 * event's own dispatch is what let the rule re-enter itself before
 * anything had settled.
 *
 * COALESCED, because the answer to "what should this actor be under" is
 * the same for every hook in that storm. A request arriving while a pass
 * is already scheduled or running does not start a second pass; it marks
 * the current one to run again when it finishes, so the last word is
 * always computed from the finished state. That is what makes this safe
 * to call from six different hooks without counting them.
 */
function scheduleSettle(actor) {
  if (!actor?.id || actor.documentName !== "Actor") return;
  const existing = scheduled.get(actor.id);
  if (existing) {
    existing.again = true;
    return;
  }
  const entry = { again: false };
  scheduled.set(actor.id, entry);
  entry.promise = (async () => {
    try {
      // Out of the calling hook's task entirely.
      await new Promise((resolve) => setTimeout(resolve, 0));
      do {
        entry.again = false;
        await settleAbilityCollapse(actor);
      } while (entry.again);
    } finally {
      scheduled.delete(actor.id);
    }
  })();
}

/**
 * Settle one actor against the rule.
 *
 * Defensive throughout, for the same reason the death watch is: this runs
 * inside somebody else's write, and a consequence that throws would turn
 * a failed condition into a failed spell.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} whether anything was changed
 */
async function settleAbilityCollapse(actor) {
  try {
    if (!actor?.id || actor.documentName !== "Actor") return false;
    if (!isActingGM()) return false;
    if (inFlight.has(actor.id)) return false;

    const result = actorAbilityCollapse(actor.system);
    const appliedBefore = actor.getFlag?.(SYSTEM_ID, FLAG) ?? null;
    const previous = Array.isArray(appliedBefore?.conditions) ? appliedBefore.conditions : [];

    // Nothing to do, and nothing was done before: the overwhelmingly
    // common case, and it must cost nothing.
    if (!result.dead && !result.conditions.length && !previous.length) return false;

    inFlight.add(actor.id);
    try {
      if (result.dead) {
        // Through the shared reaping, which `isDead` now answers for a
        // fatal Constitution — skull, out of the initiative order, and
        // the death watch's own announcement.
        //
        // ASKED OF THE DOCUMENTS, not the derived set: a second pass
        // arriving before the actor re-prepared used to announce the
        // death and reap a second time, leaving two Dead effects. See
        // `presentStatuses`.
        if (!presentStatuses(actor).includes("dead")) {
          const reason = result.reasons.find((r) => r.condition === "dead");
          await announce(actor, [reason]);
          await reapDead(actor);
        }
        return true;
      }

      // THE DECISION IS NOT MADE HERE. `collapseTransition` is pure and
      // is driven by the harness; this loop does nothing but carry out
      // what it returned. The ownership rule and the 0-HP exception both
      // live in there, where they can be tested without a world.
      const plan = collapseTransition({
        demanded: result.conditions,
        owned: previous,
        present: presentStatuses(actor),
        otherReasonUnconscious: otherReasonToBeUnconscious(actor)
      });

      for (const condition of plan.apply) {
        await actor.toggleStatusEffect(condition, { active: true });
      }
      for (const condition of plan.remove) {
        await actor.toggleStatusEffect(condition, { active: false });
      }

      if (plan.owned.length) {
        await actor.setFlag(SYSTEM_ID, FLAG, {
          conditions: plan.owned,
          reasons: result.reasons.map((r) => ({ ability: r.ability, value: r.value }))
        });
      } else if (appliedBefore) {
        await actor.unsetFlag(SYSTEM_ID, FLAG);
      }

      if (plan.apply.length) {
        await announce(actor, result.reasons.filter((r) => plan.apply.includes(r.condition)));
      }
      return plan.apply.length > 0 || plan.remove.length > 0;
    } finally {
      inFlight.delete(actor.id);
    }
  } catch (_e) {
    inFlight.delete(actor?.id);
    return false;
  }
}

/**
 * Say what happened and why.
 *
 * ANNOUNCED, because a token that silently falls unconscious is
 * indistinguishable from a bug — and this fires away from any turn, so no
 * phase card is coming to explain it. The PRINTED sentence is what the
 * card carries, not the condition name: "comatose" is what the book says
 * for Intelligence even though Unconscious is what the system applies.
 */
async function announce(actor, reasons) {
  const lines = reasons
    .filter(Boolean)
    .map((r) => `<p style="margin:2px 0"><strong>${label(r.ability)} ${r.value}</strong> — `
      + `${actor.name} is ${r.printed}.</p>`)
    .join("");
  if (!lines) return;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
      + `<h3>Ability Collapse</h3></div></header>${lines}</div>`
  });
}

function label(key) {
  return String(key ?? "").charAt(0).toUpperCase() + String(key ?? "").slice(1);
}

/**
 * Watch every route an ability total can move by.
 *
 * `updateActor` covers the sheet and any direct write; the three effect
 * hooks cover racial, item, magic and status slots, which is how a drain
 * spell and a worn item both arrive.
 *
 * EVERY ONE OF THEM SCHEDULES rather than settling (3.551.0). Six hooks
 * calling the rule directly is what let one logical change produce two of
 * everything; `scheduleSettle` collapses them into a single pass that
 * runs after the event that triggered it has finished.
 */
export function registerAbilityCollapseHooks() {
  const fromEffect = (effect) => effect?.parent ?? null;

  Hooks.on("createActiveEffect", (effect) => {
    const actor = fromEffect(effect);
    if (actor?.documentName === "Actor") scheduleSettle(actor);
  });

  Hooks.on("updateActiveEffect", (effect) => {
    const actor = fromEffect(effect);
    if (actor?.documentName === "Actor") scheduleSettle(actor);
  });

  // A deletion is the RECOVERY case: removing the drain is what brings
  // the score back, and without this hook the conditions would never lift.
  Hooks.on("deleteActiveEffect", (effect) => {
    const actor = fromEffect(effect);
    if (actor?.documentName === "Actor") scheduleSettle(actor);
  });

  // An item can carry an attribute change without an effect of its own.
  Hooks.on("createItem", (item) => {
    if (item?.parent?.documentName === "Actor") scheduleSettle(item.parent);
  });
  Hooks.on("deleteItem", (item) => {
    if (item?.parent?.documentName === "Actor") scheduleSettle(item.parent);
  });

  Hooks.on("updateActor", (actor, changes) => {
    // Only when an attribute or the HP that gates the recovery moved.
    // This hook fires on every sheet edit, and asking on each would be
    // cheap but pointless noise.
    const touched = foundry.utils.hasProperty(changes, "system.attributes")
      || foundry.utils.hasProperty(changes, "system.resources.hp");
    if (touched) scheduleSettle(actor);
  });
}
