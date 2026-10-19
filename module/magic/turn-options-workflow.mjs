/**
 * Renewal's Touch's turn options against real documents — the Foundry half
 * of turn-options.mjs (3.614.0, Graham's R8 of block 35).
 */

import { TURN_OPTIONS_FLAG, turnOptionChoices, turnOptionUsed, turnOptionKey } from "./turn-options.mjs";

const SYSTEM_ID = "trg-prime";
const CARD_FLAG = "turnOptionsCard";
const BOUND = Symbol("turnOptionBound");

/**
 * At the start of the creature's turn: a card offering what it holds.
 * @returns {Promise<number>} cards posted
 */
export async function offerTurnOptions(actor, combat) {
  let posted = 0;
  for (const effect of Array.from(actor?.effects ?? [])) {
    if (effect.disabled) continue;
    const spec = effect.getFlag?.(SYSTEM_ID, TURN_OPTIONS_FLAG);
    const choices = turnOptionChoices(spec);
    if (!choices.length) continue;
    const { actorHandle } = await import("../actor-handle.mjs");
    const handle = actorHandle(actor, actor.token ?? null);
    const buttons = choices.map((c) => `<button type="button" class="gold-button small-button" data-action="trgTurnOption" data-option="${c.key}">${c.label}</button>`).join(" ");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span>`
        + `<h3>${spec.label} — choose one (${spec.apCost} AP)</h3></div></header>`
        + `<p style="margin:2px 0">At the start of its turn ${actor.name} may spend ${spec.apCost} AP (concentrate) on one of these:</p>`
        + `<div class="trg-turn-options" style="display:flex;flex-wrap:wrap;gap:4px">${buttons}</div></div>`,
      flags: { [SYSTEM_ID]: { [CARD_FLAG]: { handle, effectId: effect.id, key: turnOptionKey(combat?.id, combat?.round) } } }
    });
    posted += 1;
  }
  return posted;
}

/** Apply one chosen option. @returns {Promise<string>} the line said */
async function applyTurnOption(actor, spec, option) {
  if (option === "heal") {
    const roll = await new Roll(spec.heal).evaluate();
    const hp = Number(actor.system?.resources?.hp?.value ?? 0);
    const max = Number(actor.system?.resources?.hp?.max ?? 0);
    const healed = Math.max(0, Math.min(roll.total, max - hp));
    if (healed) await actor.update({ "system.resources.hp.value": hp + healed });
    return `${actor.name} is healed <strong>${healed}</strong> HP (${spec.heal} = ${roll.total}).`;
  }
  if (option === "recovery") {
    return `${actor.name} ignores Fumble and Blunder results on its next recovery check this turn — apply it at the table.`;
  }
  const condition = option === "bleed" ? "bleeding" : option.startsWith("reduce:") ? option.slice(7) : "";
  const amount = option === "bleed" ? spec.bleed : Number(spec.reduce?.[condition] ?? 0);
  if (!condition || !amount) return "Nothing to apply.";
  const had = Math.max(0, Number(actor.conditions?.rawValues?.get?.(condition) ?? actor.getConditionValue?.(condition) ?? 0));
  if (!had) return `${actor.name} has no ${condition} to reduce.`;
  const left = Math.max(0, had - amount);
  if (left > 0) await actor.toggleStatusEffect?.(condition, { value: left });
  else await actor.toggleStatusEffect?.(condition, { active: false });
  return `${actor.name}'s ${condition} ${had} → ${left}.`;
}

/** Register the card's buttons. Called once, at init. */
export function registerTurnOptions() {
  globalThis.Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
    if (!card) return;
    html.querySelectorAll?.('[data-action="trgTurnOption"]').forEach((btn) => {
      wire(btn, message, card).catch((err) => console.warn(`${SYSTEM_ID} | turn option`, err));
    });
  });
}

async function wire(btn, message, card) {
  const { resolveActorHandle } = await import("../actor-handle.mjs");
  const actor = await resolveActorHandle(card.handle);
  if (!actor?.isOwner) { btn.style.display = "none"; return; }
  const effect = actor.effects?.get?.(card.effectId);
  const spec = effect?.getFlag?.(SYSTEM_ID, TURN_OPTIONS_FLAG);
  if (!spec || turnOptionUsed(effect.getFlag(SYSTEM_ID, "turnOptionUsed"), card.key)) {
    btn.disabled = true;
    return;
  }
  if (btn[BOUND]) return;
  btn[BOUND] = true;
  btn.addEventListener("click", async (event) => {
    event.preventDefault();
    btn.disabled = true;
    const live = actor.effects?.get?.(card.effectId);
    if (!live || turnOptionUsed(live.getFlag(SYSTEM_ID, "turnOptionUsed"), card.key)) return;
    const { generalAP } = await import("../combat/restricted-ap.mjs");
    const ap = generalAP(actor);
    if (ap < spec.apCost) {
      ui.notifications.warn(`${spec.label} costs ${spec.apCost} AP; ${actor.name} has ${ap}.`);
      btn.disabled = false;
      return;
    }
    const { spendActionPoints } = await import("../combat/action-points-workflow.mjs");
    await spendActionPoints(actor, spec.apCost, spec.label);
    await live.setFlag(SYSTEM_ID, "turnOptionUsed", card.key);
    const said = await applyTurnOption(actor, spec, btn.dataset.option);
    // A NEW CARD, NOT AN EDIT OF THIS ONE: the offer was posted by the GM's
    // client and a player may not rewrite it. The used mark is on the effect,
    // which the owner may write, so every copy of the offer goes dead.
    for (const other of btn.closest(".trg-turn-options")?.querySelectorAll("button") ?? []) other.disabled = true;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime"><p><strong>${spec.label}</strong> (${spec.apCost} AP): ${said}</p></div>`
    });
  });
}
