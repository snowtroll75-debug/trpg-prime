/**
 * armour-change-workflow — the sheet's Worn box, and the Continue button
 * (3.703.0). The rules, Graham's rulings and the readings taken are in
 * armour-change.mjs.
 *
 * ROUTED THROUGH `resolveAction`, as drawing a weapon is (held-change-
 * workflow.mjs). A piece is the Interact action; each turn's payment on a
 * suit is a Manipulate action of that many AP. So the AP gate, the Attack of
 * Opportunity a Manipulate action provokes, the conditions that forbid
 * manipulating (Grabbed and the rest) and the card are the actions' own, and
 * a payment refused at any of them changes nothing.
 */

import { actorInCombat } from "./action-points-workflow.mjs";
import { bindOnce } from "../dice/check-card-interactions.mjs";
import {
  ARMOUR_TASK_FLAG,
  QUICK_DONNING_DEGREES,
  QUICK_DONNING_FLAG,
  armourChangeInCombat,
  armourChangeKind,
  armourChangeTime,
  armourPayment,
  armourProgressLine,
  armourTaskAfter,
  armourTaskRemaining,
  armourTimeLine,
  armourTimeWithAP,
  armourVerb,
  newArmourTask
} from "./armour-change.mjs";

const SYSTEM_ID = "trg-prime";
const esc = (v) => foundry.utils.escapeHTML?.(String(v ?? "")) ?? String(v ?? "");

/** This armour's time for this change, with any Quick Donning result waiting (R1, R5). */
async function armourTimeFor(actor, item, { removing }) {
  const { donningTimeFor } = await import("../codex-runes.mjs");
  const { isFullSuit } = await import("../donning.mjs");
  const usual = donningTimeFor(item, { fullSuit: isFullSuit(item) });
  const quick = actor?.getFlag?.(SYSTEM_ID, QUICK_DONNING_FLAG) ?? null;
  return armourChangeTime({ usual, category: item?.system?.category, removing, quick });
}

/** A Quick Donning result is used by the change it timed (R5). */
async function spendQuickDonning(actor, time) {
  if (time?.quick && actor?.getFlag?.(SYSTEM_ID, QUICK_DONNING_FLAG)) await actor.unsetFlag(SYSTEM_ID, QUICK_DONNING_FLAG);
}

const line = (html) => `<p style="margin:2px 0">${html}</p>`;
async function card(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${esc(actor.name)}</span><h3>${esc(title)}</h3></div></header>${lines.filter(Boolean).map(line).join("")}</div>`
  });
}

/** The Continue button, on a card for a task still owed. */
function continueButton(actor, task) {
  return `<button type="button" data-action="armourContinue" data-actor-uuid="${esc(actor.uuid)}">`
    + `Continue ${armourVerb(task.removing, { ing: true }).toLowerCase()} ${esc(task.itemName)}</button>`;
}

async function wait(title, content, buttons) {
  const { DialogV2 } = foundry.applications.api;
  return DialogV2.wait({ window: { title }, content, buttons, rejectClose: false });
}

/**
 * The Worn box on a piece of armour, clicked.
 *
 * @returns {Promise<{handled: boolean, changed: boolean}>} `handled` false:
 *   not armour, or not an action here, so change it freely.
 */
export async function armourChangeOnSheet(actor, item, { equip }) {
  const kind = armourChangeKind(item);
  if (!kind) return { handled: false, changed: false };
  const inCombat = armourChangeInCombat({ combatStarted: Boolean(game.combat?.started), actorInCombat: actorInCombat(actor), item });
  const removing = !equip;

  /* R4: a piece is an Interact in combat, free outside it. */
  if (kind === "piece") {
    if (!inCombat) return { handled: false, changed: false };
    if (game.user?.isGM) {
      const how = await wait(`${item.name} — In Combat`,
        `<p>${equip ? "Putting on" : "Taking off"} <strong>${esc(item.name)}</strong> during combat is an Interact (1 AP) for ${esc(actor.name)}.</p>`,
        [
          { action: "act", label: "As an Interact (1 AP)", default: true },
          { action: "set", label: "Just set it (no action)" },
          { action: "cancel", label: "Cancel" }
        ]);
      if (how === "set") return { handled: false, changed: false };
      if (how !== "act") return { handled: true, changed: false };
    }
    const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
    const { resolveAction } = await import("./action-workflow.mjs");
    const interact = BASIC_ACTIONS.find((a) => a.key === "interact");
    await resolveAction(actor, interact, { armourChange: { item, piece: true, equip } });
    return { handled: true, changed: Boolean(actor.items.get(item.id)?.system?.equipped) === Boolean(equip) };
  }

  /* A suit. A task already under way on it: continue, or abandon (R2). */
  const task = actor.getFlag(SYSTEM_ID, ARMOUR_TASK_FLAG) ?? null;
  if (task && task.itemId === item.id) {
    const verb = armourVerb(task.removing, { ing: true }).toLowerCase();
    const choice = await wait(`${item.name} — ${armourVerb(task.removing, { ing: true })}`,
      `<p>${esc(actor.name)} is ${verb} <strong>${esc(item.name)}</strong>: ${task.paid} of ${task.total} AP paid.</p>`
        + "<p>Abandoning it loses the progress.</p>",
      [
        { action: "continue", label: `Continue ${verb}`, default: true },
        { action: "abandon", label: "Abandon it" },
        { action: "cancel", label: "Cancel" }
      ]);
    if (choice === "continue") {
      await continueArmourChange(actor);
      return { handled: true, changed: Boolean(actor.items.get(item.id)?.system?.equipped) === Boolean(!task.removing) };
    }
    if (choice === "abandon") await abandonArmourChange(actor, "abandoned");
    return { handled: true, changed: false };
  }

  const time = await armourTimeFor(actor, item, { removing });
  if (!time) return { handled: false, changed: false };

  /* R3: out of combat, at once, with the time on a card. */
  if (!inCombat) {
    await item.update({ "system.equipped": Boolean(equip) });
    await spendQuickDonning(actor, time);
    await card(actor, `${armourVerb(removing)} Armour`, [
      armourTimeLine(esc(item.name), removing, time),
      time.why ? `<em>${esc(time.why)}</em>` : "",
      "<em>The world clock is not advanced.</em>"
    ]);
    return { handled: true, changed: true };
  }

  /* R2: in combat, a task paid over the turns. */
  if (game.user?.isGM) {
    const how = await wait(`${item.name} — In Combat`,
      `<p>${removing ? "Removing" : "Donning"} <strong>${esc(item.name)}</strong> takes ${esc(armourTimeWithAP(time))}, paid over ${esc(actor.name)}'s turns.</p>`,
      [
        { action: "act", label: `Start ${removing ? "removing" : "donning"}`, default: true },
        { action: "set", label: "Just set it (no action)" },
        { action: "cancel", label: "Cancel" }
      ]);
    if (how === "set") return { handled: false, changed: false };
    if (how !== "act") return { handled: true, changed: false };
  }
  if (task) {
    const other = await wait("Armour — Another Task",
      `<p>${esc(actor.name)} is ${armourVerb(task.removing, { ing: true }).toLowerCase()} <strong>${esc(task.itemName)}</strong> (${task.paid} of ${task.total} AP paid). Abandon it and start on <strong>${esc(item.name)}</strong>?</p>`,
      [
        { action: "switch", label: "Abandon it and start" },
        { action: "cancel", label: "Cancel", default: true }
      ]);
    if (other !== "switch") return { handled: true, changed: false };
    await abandonArmourChange(actor, "abandoned");
  }
  // A FREE ACTION (Fleetguard's best tiers): nothing to pay over the turns.
  if (time.ap <= 0) {
    await item.update({ "system.equipped": Boolean(equip) });
    await spendQuickDonning(actor, time);
    await card(actor, `${armourVerb(removing)} Armour`, [
      armourTimeLine(esc(item.name), removing, time),
      time.why ? `<em>${esc(time.why)}</em>` : ""
    ]);
    return { handled: true, changed: true };
  }
  await actor.setFlag(SYSTEM_ID, ARMOUR_TASK_FLAG, newArmourTask({ item, removing, time, quick: time.quick }));
  await spendQuickDonning(actor, time);
  await continueArmourChange(actor, { starting: time });
  return { handled: true, changed: Boolean(actor.items.get(item.id)?.system?.equipped) === Boolean(equip) };
}

/** Give up a task; its progress is lost (R2). */
async function abandonArmourChange(actor, why = "abandoned") {
  const task = actor?.getFlag?.(SYSTEM_ID, ARMOUR_TASK_FLAG) ?? null;
  if (!task) return false;
  await actor.unsetFlag(SYSTEM_ID, ARMOUR_TASK_FLAG);
  await card(actor, `${armourVerb(task.removing)} Armour`, [
    `${armourVerb(task.removing, { ing: true })} <strong>${esc(task.itemName)}</strong> is ${why}, with ${task.paid} of ${task.total} AP paid. The progress is lost.`
  ]);
  return true;
}

/**
 * Pay this turn's AP on the task under way: the Continue button, and the
 * first payment when a task starts.
 */
async function continueArmourChange(actor, { starting = null } = {}) {
  const task = actor?.getFlag?.(SYSTEM_ID, ARMOUR_TASK_FLAG) ?? null;
  if (!task) {
    ui.notifications.warn(`${actor?.name ?? "That creature"} is not donning or removing any armour.`);
    return null;
  }
  const item = actor.items.get(task.itemId);
  if (!item) {
    await actor.unsetFlag(SYSTEM_ID, ARMOUR_TASK_FLAG);
    ui.notifications.warn(`${task.itemName} is no longer carried; the task is dropped.`);
    return null;
  }
  // THE FIGHT ENDED PART-WAY (R3): what is left is done at once.
  if (!actorInCombat(actor)) {
    const remaining = armourTaskRemaining(task);
    await item.update({ "system.equipped": !task.removing });
    await actor.unsetFlag(SYSTEM_ID, ARMOUR_TASK_FLAG);
    const { describeAP } = await import("../donning.mjs");
    await card(actor, `${armourVerb(task.removing)} Armour`, [
      armourProgressLine({ ...task, paid: task.total }),
      `<em>Finished out of combat: the last ${esc(describeAP(remaining))}. The world clock is not advanced.</em>`
    ]);
    return { done: true };
  }
  const pay = armourPayment(task, actor.system?.resources?.ap?.value ?? 0);
  const action = {
    key: "armourChange",
    name: `${armourVerb(task.removing)} Armour`,
    traits: "Manipulate",
    apCost: String(pay),
    checkType: "none",
    description: starting
      ? `${armourTimeLine(esc(task.itemName), task.removing, starting)} Paid over ${esc(actor.name)}'s turns: ${pay} AP now.`
        + (starting.why ? ` <em>${esc(starting.why)}</em>` : "")
      : ""
  };
  const { resolveAction } = await import("./action-workflow.mjs");
  return resolveAction(actor, action, { armourChange: { item, pay } });
}

/**
 * Called by `resolveAction` once the action is taken and paid for: what the
 * action did to the armour, as the card's lines.
 *
 * @param {Actor} actor
 * @param {{item: Item, piece?: boolean, equip?: boolean, pay?: number}} change
 * @returns {Promise<string[]>}
 */
export async function applyArmourChange(actor, change) {
  const item = change?.item;
  if (!item) return [];
  if (change.piece) {
    await item.update({ "system.equipped": Boolean(change.equip) });
    return [`<em>${esc(item.name)} is ${change.equip ? "put on" : "taken off"}.</em>`];
  }
  const task = actor.getFlag(SYSTEM_ID, ARMOUR_TASK_FLAG) ?? null;
  if (!task || task.itemId !== item.id) return [`<em>No task is under way on ${esc(item.name)}; nothing was paid towards it.</em>`];
  const { task: next, done } = armourTaskAfter(task, change.pay);
  if (done) {
    await item.update({ "system.equipped": !task.removing });
    await actor.unsetFlag(SYSTEM_ID, ARMOUR_TASK_FLAG);
    return [armourProgressLine(next)];
  }
  await actor.setFlag(SYSTEM_ID, ARMOUR_TASK_FLAG, next);
  return [armourProgressLine(next), continueButton(actor, next)];
}

/** Quick Donning's result, set on the creature it was rolled for (R5). */
export async function setQuickDonning(target, record) {
  if (!QUICK_DONNING_DEGREES.includes(String(record?.degree ?? ""))) return false;
  const { relayQuickDonning } = await import("./target-relay-workflow.mjs");
  return relayQuickDonning(target, record, () => target.setFlag(SYSTEM_ID, QUICK_DONNING_FLAG, record).then(() => true));
}

/** The Continue buttons. */
export function registerArmourChangeHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll?.('[data-action="armourContinue"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const resolve = foundry.utils?.fromUuid ?? globalThis.fromUuid;
        const actor = await resolve(button.dataset.actorUuid);
        if (!actor?.isOwner) { ui.notifications.warn("Only that creature's owner may continue."); return; }
        button.disabled = true;
        try { await continueArmourChange(actor); } finally { button.disabled = false; }
      });
    }
  });
}
