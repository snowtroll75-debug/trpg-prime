/**
 * Refocus restoration (Chapter 6, Mental Focus). "You steel your mind and
 * centre your will, attempting to restore an ability with the Focus trait."
 * Per Graham: it restores one use to one chosen Focus-trait item, with no
 * daily cap. Granted innate spells carry the Focus trait by default, so this
 * is how one is recovered mid-day rather than by waiting for Daily
 * Preparation.
 *
 * THE ABILITY IS CHOSEN BEFORE THE ROLL, not after it. Under the ladder
 * Graham rewrote on 21 August 2026 every rung below Success attaches a
 * consequence to a NAMED ability — a minute's wait, a ten-minute block, or
 * nothing again today — so a player picking afterwards would be choosing
 * which ability to hand the fumble to with the fumble already on the table.
 * Picked up front, like Repair's target and Learn a Spell's setup, so
 * cancelling costs nothing.
 *
 * The pure predicates and the ladder itself live in refocus.mjs; the per-day
 * use maths reuse the shared usesPerDay/usesValue path (uses-workflow.mjs)
 * that innate spells, feats and abilities all track through.
 */

import {
  hasFocusTrait,
  refocusBarred,
  refocusPlan,
  refocusRestoreDue,
  refocusState,
  refocusTiming,
  restoredUses
} from "./refocus.mjs";
import { itemUsesMax, itemUsesRemaining } from "../uses-workflow.mjs";
import { refocusRestoredUses, refocusRestoresAll } from "../focus-declarations.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";
import { refocusCompanionCandidates, refocusCompanions, refocusSucceeded } from "./refocus.mjs";
import { skipDialog } from "../apps/check-dialog.mjs";

const SYSTEM_ID = "trg-prime";
const REFOCUS_FLAG = "refocus";

const { DialogV2 } = foundry.applications.api;

/** The world clock, in seconds, or 0 before it exists. */
function worldNow() {
  return Number(game?.time?.worldTime ?? 0) || 0;
}

/** An ability's stored Refocus state, or null. */
export function refocusStateOf(item) {
  return item?.getFlag?.(SYSTEM_ID, REFOCUS_FLAG) ?? null;
}

/**
 * The character's Focus-trait items that have a tracked per-day maximum and at
 * least one spent use — the candidates a Refocus could restore.
 */
export function focusRestorableItems(actor) {
  return Array.from(actor?.items ?? []).filter((item) => {
    // AN ITEM'S OWN FOCUS USE (3.626.0): a registered rune's "expended …
    // restored using Refocus" (Sanctuary) or a wondrous item's (Lantern of
    // the Veil's Open the Lantern) — a flag, not a per-day count.
    if (itemFocusExpended(item)) return true;
    if (!hasFocusTrait(item.system?.traits)) return false;
    const max = itemUsesMax(item);
    if (max === null || max === Infinity) return false;
    return itemUsesRemaining(item) < max;
  });
}

/**
 * The candidates split into those Refocus may be attempted on and those a
 * previous attempt has barred, each barred one carrying its reason.
 *
 * NAMED, NOT DROPPED. A Bard whose Refocus fumbled an hour ago and who now
 * cannot find that ability in the picker deserves to be told which rule
 * removed it — the same discipline the reaction-feat offer card follows
 * with the feats it holds back.
 *
 * @returns {{offered: Array, barred: Array<{item: object, reason: string}>}}
 */
export function refocusCandidates(actor, { worldTime = null } = {}) {
  const now = worldTime === null ? worldNow() : Number(worldTime) || 0;
  const offered = [];
  const barred = [];
  for (const item of focusRestorableItems(actor)) {
    const verdict = refocusBarred(refocusStateOf(item), { worldTime: now });
    if (verdict.barred) barred.push({ item, reason: verdict.reason });
    else offered.push(item);
  }
  return { offered, barred };
}

/**
 * Which option the player actually chose, read off the dialog's form.
 *
 * EXPORTED SO IT CAN BE DRIVEN. The bug this replaces was a single
 * expression inside a dialog callback — the one place a harness could not
 * reach — and it went unnoticed through two releases because every check
 * written about the picker was a regex over the source. `form.elements` is
 * an HTMLFormControlsCollection, whose named controls appear as properties
 * EXCEPT where the name collides with one of its own members: `item`,
 * `namedItem`, `length`. The field was called "item", so `elements.item`
 * returned the collection's native lookup METHOD, `.value` on it was
 * undefined, `?? 0` turned that into index 0, and the picker silently
 * restored whichever ability happened to be listed first.
 *
 * `namedItem` cannot collide with a method, and the field is no longer
 * called "item" either, so writing the shorter expression again would not
 * reintroduce it.
 *
 * @param {HTMLFormElement|null} form
 * @returns {number} the chosen index, or 0 when the form cannot answer
 */
export function selectedFocusIndex(form) {
  const chosen = form?.elements?.namedItem?.("focusItem")?.value;
  const index = Number(chosen);
  return Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0;
}

/** Prompt which Focus ability to attempt to restore. */
async function promptFocusSelection(items, barred) {
  const options = items
    .map(
      (item, i) =>
        `<option value="${i}">${item.name} (${itemFocusExpended(item) ? "expended" : `${itemUsesRemaining(item)} / ${itemUsesMax(item)}`})</option>`
    )
    .join("");
  const heldNote = barred.length
    ? `<p class="hint">Barred by an earlier attempt: ${barred
        .map((b) => `<strong>${b.item.name}</strong> (${b.reason})`)
        .join(", ")}.</p>`
    : "";
  const idx = await DialogV2.prompt({
    window: { title: "Refocus — which ability?" },
    classes: ["trg-prime"],
    content:
      `<div class="trg-prime trg-check-dialog"><div class="form-group">`
      + `<label for="trg-focus-item">Focus ability to restore</label>`
      + `<select id="trg-focus-item" name="focusItem">${options}</select></div>${heldNote}</div>`,
    ok: {
      label: "Refocus",
      // READ BY `namedItem`, AND NOT CALLED "item" (3.356.1).
      //
      // `form.elements.item` is not the field — it is
      // `HTMLFormControlsCollection.prototype.item`, the native lookup
      // METHOD. So the old expression read a function, took `.value` off it
      // (undefined), fell through `?? 0`, and returned index 0 EVERY TIME.
      // The picker offered a choice and then restored whichever ability
      // happened to be first, silently.
      //
      // Live on 21 Aug 2026: two spent abilities offered, Inner Flame
      // chosen, Second Sight restored. Harmless-looking before Graham's
      // rewrite, and not harmless after it — under the new ladder the
      // ability you name is the one that eats the fumble.
      //
      // Both halves of the fix are deliberate: `namedItem` cannot collide
      // with a method, and the field is no longer called "item" so the
      // collision cannot be reintroduced by someone writing the shorter
      // expression again.
      callback: (event, button) => selectedFocusIndex(button.form ?? button.closest?.("form"))
    },
    rejectClose: false
  });
  if (idx === null || idx === undefined) return null;
  return items[idx] ?? null;
}

/**
 * Choose the ability this Refocus is aimed at, before the check is rolled and
 * before any AP is spent.
 *
 * @returns {Promise<{item: object|null, reason: string, barred: Array}>}
 *   `item` is null with a reason when there is nothing to aim at or the
 *   player cancelled.
 */
export async function chooseRefocusTarget(actor, { event = null } = {}) {
  const { offered, barred } = refocusCandidates(actor);
  if (!offered.length) {
    return { item: null, reason: barred.length ? "barred" : "none", barred };
  }
  const chosen =
    offered.length === 1 || skipDialog(event)
      ? offered[0]
      : await promptFocusSelection(offered, barred);
  if (!chosen) return { item: null, reason: "cancelled", barred };
  return { item: chosen, reason: "", barred };
}

/**
 * The companion ability a successful Refocus also restores (3.625.0) —
 * see refocus.mjs `refocusCompanions`. Chosen when two qualify; restored
 * on the same timing as the refocused ability. Returns the line for the
 * card, or "" when nothing qualified.
 */
export async function restoreRefocusCompanion(actor, chosen, degree, { inCombat = false, worldTime = null } = {}) {
  if (!refocusSucceeded(degree)) return "";
  const companions = refocusCompanions(Array.from(actor?.appliedEffects ?? actor?.effects ?? []));
  if (!companions.length) return "";
  const candidates = refocusCompanionCandidates(companions, focusRestorableItems(actor).map((i) => ({ id: i.id, name: i.name, spent: true, item: i })), chosen?.id ?? "");
  if (!candidates.length) return "";
  let pick = candidates[0];
  if (candidates.length > 1) {
    const { MODULE_HELPERS } = await import("../feats-workflow.mjs");
    const id = await MODULE_HELPERS.chooseFromList(`${companions[0].label} — also restore`, "Which ability returns with it?", candidates.map((c) => [c.id, c.name]));
    if (!id) return "";
    pick = candidates.find((c) => c.id === id) ?? candidates[0];
  }
  const outcome = await applyRefocusOutcome(pick.item, degree, { inCombat, worldTime });
  if (outcome.restored) return `${companions[0].label}: restored a use of <strong>${outcome.name}</strong> (${outcome.next} / ${outcome.max}) as well.`;
  return `${companions[0].label}: <strong>${outcome.name}</strong> returns with it${outcome.when === "nextTurn" ? " at the beginning of your next turn" : ""}.`;
}

/** Does an item carry an expended Focus use of its own (3.626.0)? */
function itemFocusExpended(item) {
  const runes = item?.flags?.[SYSTEM_ID]?.runeState?.focusExpended ?? {};
  if (Object.values(runes).some(Boolean)) return true;
  return Boolean(item?.flags?.[SYSTEM_ID]?.wondrousFocusExpended);
}

/** Put one use back on an item, never past its maximum. */
async function returnOneUse(item) {
  if (itemFocusExpended(item)) {
    const updates = {};
    for (const key of Object.keys(item.flags?.[SYSTEM_ID]?.runeState?.focusExpended ?? {})) updates[`flags.${SYSTEM_ID}.runeState.focusExpended.-=${key}`] = null;
    if (item.flags?.[SYSTEM_ID]?.wondrousFocusExpended) updates[`flags.${SYSTEM_ID}.-=wondrousFocusExpended`] = null;
    await item.update(updates);
    return { name: item.name, next: 1, max: 1 };
  }
  const max = itemUsesMax(item);
  // ALL USES, WHERE A DECLARATION SAYS SO (3.664.0; Graham, 20 Oct 2026):
  // only an ability with extra uses from Deep Focus or Ghost Art Mastery
  // gets every use back. Anything else keeps the one use `restoredUses`
  // has always handed back.
  const all = item.actor ? refocusRestoresAll(item, declarationCarriers(item.actor)) : false;
  const next = all
    ? refocusRestoredUses(itemUsesRemaining(item), max, true)
    : restoredUses(itemUsesRemaining(item), max);
  await item.update({ "system.usesValue": next });
  return { name: item.name, next, max };
}

/**
 * Apply a resolved Refocus check to the ability it was aimed at.
 *
 * @param {object} item   the ability chosen before the roll
 * @param {string} degree the check's degree
 * @param {{inCombat?: boolean, worldTime?: number}} [options]
 * @returns {Promise<{restored: boolean, when: string, name: string,
 *   next?: number, max?: number, backlash: boolean}>}
 */
export async function applyRefocusOutcome(item, degree, { inCombat = false, worldTime = null } = {}) {
  const now = worldTime === null ? worldNow() : Number(worldTime) || 0;
  const plan = refocusTiming(refocusPlan(degree, { worldTime: now }), { inCombat });
  const state = refocusState(plan);

  // WRITTEN WHOLE OR NOT AT ALL. Foundry merges object flags on update, so a
  // partial write would leave the previous attempt's fields underneath —
  // a ten-minute block quietly surviving the restore meant to end it.
  if (state) await item.setFlag(SYSTEM_ID, REFOCUS_FLAG, state);
  else await item.unsetFlag(SYSTEM_ID, REFOCUS_FLAG);

  if (plan.restoreNow) {
    const done = await returnOneUse(item);
    return { restored: true, when: "now", backlash: plan.backlash, ...done };
  }
  return {
    restored: false,
    when: plan.restoreNextTurn ? "nextTurn" : plan.restoreAt != null ? "minute" : "none",
    name: item.name,
    backlash: plan.backlash
  };
}

/**
 * Hand back any uses whose pending restore has come due.
 *
 * Called from two places because two clocks can bring one due: the
 * character's own turn beginning (Success) and the world clock advancing
 * (Partial's minute). Both ask the SAME predicate — `refocusRestoreDue` —
 * so there is one answer to "is it time yet", not one per caller.
 *
 * @param {Actor} actor
 * @param {{ownTurnStarted?: boolean}} [options]
 * @returns {Promise<Array<{name: string, next: number, max: number}>>}
 */
export async function sweepRefocusRestores(actor, { ownTurnStarted = false } = {}) {
  // ONE SWEEP PER ACTOR AT A TIME (3.356.1).
  //
  // Both callers are async handlers on events this system does not control
  // the dispatch of, and live testing on 21 Aug 2026 showed two of them
  // overlapping: a restore that came due posted its card TWICE, from the
  // world clock and again from a turn boundary, because both runs read the
  // flag before either had cleared it. The game state was right both times
  // — `restoredUses` clamps, so the second `returnOneUse` wrote the same
  // number and Foundry dropped the no-op diff — but the table saw the card
  // twice, which reads as the ability having come back twice.
  //
  // The flag itself cannot be the lock: clearing it first would lose the
  // restore if the update failed in between. An in-flight claim can.
  const key = actor?.id ?? actor?.uuid ?? null;
  if (key !== null) {
    if (sweeping.has(key)) return [];
    sweeping.add(key);
  }
  try {
    const now = worldNow();
    const restored = [];
    for (const item of Array.from(actor?.items ?? [])) {
      const state = refocusStateOf(item);
      if (!refocusRestoreDue(state, { worldTime: now, ownTurnStarted })) continue;
      restored.push(await returnOneUse(item));
      await item.unsetFlag(SYSTEM_ID, REFOCUS_FLAG);
    }
    return restored;
  } finally {
    if (key !== null) sweeping.delete(key);
  }
}

/** Actors with a sweep in flight — see `sweepRefocusRestores`. */
const sweeping = new Set();

/**
 * Daily preparation clears every Refocus block and every pending restore.
 *
 * The blocks go because "until your next daily preparation" is precisely
 * this moment; the pending restores go because the generic daily loop is
 * about to set every ability back to its maximum anyway, and a stale
 * `restoreAt` surviving the night would hand out a use on top of a full
 * pool the first time the clock passed it.
 *
 * @returns {Promise<number>} how many abilities were cleared.
 */
export async function clearRefocusState(actor) {
  const stale = Array.from(actor?.items ?? []).filter((i) => refocusStateOf(i));
  for (const item of stale) await item.unsetFlag(SYSTEM_ID, REFOCUS_FLAG);
  return stale.length;
}
