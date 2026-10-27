/**
 * Rune timers against real documents — the Foundry half of rune-timers.mjs
 * (3.615.0, Graham's R5, R6 and R10 of block 36).
 */

import { RUNE_TIMER_FLAG, runeTimerFlags, runeCooldownLeft, cooldownWords } from "./rune-timers.mjs";

const SYSTEM_ID = "trg-prime";
const MANUAL_OPTION = "trgRuneTimerManual";

const now = () => ({
  round: game.combat?.started ? Number(game.combat.round ?? 0) : null,
  worldTime: Number(game.time?.worldTime ?? 0)
});

/** The timer effect running for one of an item's runes, or null. */
function runeTimerOn(actor, item, key) {
  return Array.from(actor?.effects ?? []).find((effect) => {
    const t = effect.flags?.[SYSTEM_ID]?.[RUNE_TIMER_FLAG];
    return t && t.itemId === item?.id && t.key === key;
  }) ?? null;
}

/**
 * Refuse while the rune is cooling down.
 * @returns {boolean} true when it may be activated
 */
export function runeReady(item, key, label) {
  const left = runeCooldownLeft(item, key, now().worldTime);
  if (!left) return true;
  ui.notifications.warn(`${item.name}: ${label} cannot be activated again for another ${cooldownWords(left)}.`);
  return false;
}

/**
 * The activation's AP, in combat only (R10). The printed cost — Engage
 * (1 AP), Contemplative (1 AP) — is asked for first, so a refusal costs
 * nothing.
 * @returns {Promise<boolean>} false when the player backed out
 */
export async function payRuneActivation(actor, apCost, label) {
  const cost = Math.max(0, Math.floor(Number(apCost) || 0));
  if (!cost) return true;
  const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!await ensureActionPoints(actor, cost, label)) return false;
  await spendActionPoints(actor, cost, label);
  return true;
}

/**
 * Switch a timed rune on: its state on the item, and the minute on the
 * wearer.
 */
export async function startRuneTimer(actor, item, { key, state, label, durationSeconds, cooldownSeconds = 0, extraFlags = {}, changes = [], ending = null }) {
  await item.update({ [`flags.${SYSTEM_ID}.runeState.${state}`]: true });
  const existing = runeTimerOn(actor, item, key);
  if (existing) await existing.delete({ [MANUAL_OPTION]: "replace" });
  // WHAT THE MINUTE CARRIES (3.626.0): a declared rune's auras, offers or
  // changes ride the timer effect, so they end when it does.
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: `${item.name} — ${label}`,
    img: item.img || "icons/svg/shield.svg",
    origin: item.uuid,
    changes: Array.isArray(changes) ? changes : [],
    flags: { [SYSTEM_ID]: { ...(extraFlags ?? {}), ...runeTimerFlags({ itemId: item.id, key, state, durationSeconds, cooldownSeconds, ending }, now()) } }
  }]);
}

/**
 * Switch it off by hand. The timer's deletion does the rest.
 * @returns {Promise<boolean>} whether a timer was running
 */
export async function stopRuneTimer(actor, item, key) {
  const timer = runeTimerOn(actor, item, key);
  if (!timer) return false;
  await timer.delete({ [MANUAL_OPTION]: "manual" });
  return true;
}

/** What each timed rune says, and does, when its minute ends. */
const ENDINGS = Object.freeze({
  animated: {
    lapsed: "The minute is up: the shield <strong>drops to the ground</strong>. It is no longer equipped — pick it up to use it again.",
    manual: "The shield settles back into your hand. Shield Block is available again, and it occupies a hand once more.",
    // "after which the shield drops to the ground".
    dropsOnLapse: true
  },
  arrowCatching: {
    lapsed: "The minute is up: the rune stops drawing missiles.",
    manual: "The rune stops drawing missiles.",
    dropsOnLapse: false
  }
});

/** Register the hook. Called once, at init. */
export function registerRuneTimers() {
  globalThis.Hooks.on("deleteActiveEffect", async (effect, options) => {
    try {
      const timer = effect?.flags?.[SYSTEM_ID]?.[RUNE_TIMER_FLAG];
      if (!timer) return;
      if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
      const how = options?.[MANUAL_OPTION];
      if (how === "replace") return;
      const actor = effect.parent;
      const item = actor?.items?.get?.(timer.itemId);
      if (!item) return;
      const ending = timer.ending?.lapsed
        ? { lapsed: timer.ending.lapsed, manual: timer.ending.manual || timer.ending.lapsed, dropsOnLapse: false }
        : ENDINGS[timer.key] ?? { lapsed: "The rune's minute is up.", manual: "The rune is switched off.", dropsOnLapse: false };
      const lapsed = how !== "manual";
      const updates = { [`flags.${SYSTEM_ID}.runeState.${timer.state}`]: false };
      if (timer.cooldownSeconds) {
        updates[`flags.${SYSTEM_ID}.runeState.cooldown.${timer.key}`] = Number(game.time?.worldTime ?? 0) + Number(timer.cooldownSeconds);
      }
      if (lapsed && ending.dropsOnLapse) updates["system.equipped"] = false;
      await item.update(updates);
      const lines = [lapsed ? ending.lapsed : ending.manual];
      if (timer.cooldownSeconds) lines.push(`<em>It cannot be activated again for ${cooldownWords(timer.cooldownSeconds)}.</em>`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime"><p><strong>${item.name}</strong> — ${effect.name.split(" — ").pop()}</p>${lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("")}</div>`
      });
    } catch (err) {
      console.warn(`${SYSTEM_ID} | rune timer ending failed`, err);
    }
  });
}
