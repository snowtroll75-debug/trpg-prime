/**
 * The Foundry half of consumable-specials.mjs (3.617.0, block 37).
 *
 * Every refusal comes before anything is spent: the printed activation, the
 * aim, the check. A Pearl that lands nowhere, a bandage that is not applied,
 * an Aid that is backed out of — none of them uses the item.
 */

import {
  BANDAGE_CHOICES, BANDAGE_FLAG, bandageChoice, burstLanding, consumableSpecialOf
} from "./consumable-specials.mjs";
import { activationCost, recipientMode } from "./elixirs.mjs";
import { consumeOneUse } from "./consumable-use.mjs";
import { actorHandle, resolveActorHandle } from "./actor-handle.mjs";

const SYSTEM_ID = "trg-prime";
const CARD_FLAG = "bandageCard";
const BOUND = Symbol("trgBandageBound");

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines, flags = null) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${esc(actor.name)}</span><h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`,
    ...(flags ? { flags: { [SYSTEM_ID]: flags } } : {})
  });
}

/** One use spent, and the line that says so. */
async function spendOne(item) {
  const after = consumeOneUse({
    uses: item.system?.uses?.value,
    max: item.system?.uses?.max,
    quantity: item.system?.quantity
  });
  if (after.destroy) await item.delete();
  else await item.update({ "system.quantity": after.quantity, "system.uses.value": after.uses });
  return after.destroy
    ? line(`The last of it is gone — ${esc(item.name)} is removed from the sheet.`)
    : line(`${after.quantity} remaining.`);
}

/** The printed activation, refused or paid. */
async function payActivation(actor, item) {
  const cost = activationCost(item.system?.activation, { inCombat: Boolean(game.combat?.started) });
  if (!cost.allowed) {
    ui.notifications.warn(`${item.name} ${cost.reason}.`);
    return null;
  }
  if (cost.ap > 0) {
    const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    if (!await ensureActionPoints(actor, cost.ap, item.name)) return null;
    await spendActionPoints(actor, cost.ap, item.name);
  }
  return cost;
}

/** The one targeted token, and how far it is. */
async function oneTarget(actor) {
  const targets = Array.from(game.user?.targets ?? []);
  const own = actor.getActiveTokens?.()?.[0] ?? null;
  const only = targets.length === 1 ? targets[0] : null;
  let distance = null;
  if (only && own && only.document?.id !== own.document?.id) {
    const { distanceBetween } = await import("./combat/geometry.mjs");
    distance = distanceBetween(own, only);
  }
  return { targets, own, only, distance };
}

/**
 * Use a consumable with a special. Null when it was refused or backed out of.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function useSpecialConsumable(actor, item) {
  const special = consumableSpecialOf(item);
  if (!special) return null;
  if (special.kind === "burst") return throwBurst(actor, item, special);
  if (special.kind === "bandage") return applyBandage(actor, item, special);
  return aidWithItem(actor, item, special);
}

/* ─────────────────────────── Pearl of Force ─────────────────────────── */

async function throwBurst(actor, item, special) {
  const { only, distance, targets } = await oneTarget(actor);
  const landing = burstLanding({ targetCount: targets.length, distance, rangeFeet: special.rangeFeet });
  if (!landing.ok) {
    ui.notifications.warn(`${item.name}: ${landing.reason}.`);
    return null;
  }
  const cost = await payActivation(actor, item);
  if (!cost) return null;
  const { burstDamage } = await import("./burst-workflow.mjs");
  const { lines } = await burstDamage({
    center: only,
    radiusFeet: special.radiusFeet,
    formula: special.formula,
    damageType: special.damageType,
    dc: special.dc,
    save: special.save,
    label: `${item.name} bursts on ${only.name}`,
    fallback: only.actor ? [only.actor] : []
  });
  lines.unshift(line(`<strong>${esc(actor.name)}</strong> throws ${esc(item.name)} at <strong>${esc(only.name)}</strong>`
    + `${Number.isFinite(distance) ? ` (${distance} ft)` : ""} — a ${special.radiusFeet}-foot burst.`));
  lines.push(await spendOne(item));
  await postCard(actor, `${item.name} — Thrown`, lines);
  return { used: true, special: "burst" };
}

/* ──────────────────────────── Assisting Gloves ──────────────────────── */

async function aidWithItem(actor, item, special) {
  const cost = await payActivation(actor, item);
  if (!cost) return null;
  const { rollAidAnother } = await import("./skills.mjs");
  const check = await rollAidAnother(actor, {
    extraModifiers: special.bonus ? [{ label: item.name, value: special.bonus, type: "untyped" }] : []
  });
  // BACKED OUT OF THE AID: the hand never formed, and the gloves keep it.
  if (!check) return null;
  await postCard(actor, `${item.name} — Used`, [
    line(`A glowing hand forms and helps — the Aid is rolled at <strong>+${special.bonus}</strong>.`),
    line("<em>The hand lasts for one action or one minute; then the gloves are nonmagical.</em>"),
    await spendOne(item)
  ]);
  return { used: true, special: "aid" };
}

/* ─────────────────────────── Mystical Bandage ───────────────────────── */

async function applyBandage(actor, item, special) {
  const { only, own, targets, distance } = await oneTarget(actor);
  const who = recipientMode({
    targetCount: targets.length,
    targetIsSelf: Boolean(only && own && only.document?.id === own.document?.id) || only?.actor?.id === actor.id,
    distance
  });
  if (who.mode === "refuse") {
    ui.notifications.warn(`${item.name}: ${who.reason.replace("feed it", "bandage them")}.`);
    return null;
  }
  const wearer = who.mode === "fed" ? only.actor : actor;
  const wearerToken = who.mode === "fed" ? only : own;
  const cost = await payActivation(actor, item);
  if (!cost) return null;

  const { TRGCheck } = await import("./dice/check.mjs");
  const skill = actor.system?.skills?.[special.skill];
  const check = await TRGCheck.roll({
    actor,
    label: `${item.name} — Apply`,
    subtitle: `DC ${special.dc} ${skill?.label ?? "Medicine"} check to apply it to ${wearer.name}`,
    type: "skill",
    subject: special.skill,
    dc: special.dc,
    modifiers: skill?.checkModifiers ?? [{ label: skill?.label ?? "Medicine", value: Number(skill?.total ?? 0), type: "untyped" }]
  });
  if (!check?.outcome?.degree?.success) {
    await postCard(actor, `${item.name} — Not Applied`, [
      line(`<strong>${esc(actor.name)}</strong> fails to apply ${esc(item.name)} to ${esc(wearer.name)} — the bandage is kept.`)
    ]);
    return { used: false, special: "bandage" };
  }

  // WORN FOR 24 HOURS (R5): an effect on the wearer, ended by its own clock
  // or by the reaction that destroys it.
  const now = Number(game.time?.worldTime ?? 0);
  const [effect] = await wearer.createEmbeddedDocuments("ActiveEffect", [{
    name: item.name,
    img: item.img || "icons/svg/regen.svg",
    changes: [],
    description: `Worn for 24 hours. Healing DCs for ${wearer.name} are ${special.healingDCReduction} lower. A reaction uses it to heal 2d8 HP, stop 1d4 Bleed, or reduce Weakened by 2 or Injured by 1 — which destroys it.`,
    flags: { [SYSTEM_ID]: {
      spellEffect: true,
      spellEffectEnd: now + special.seconds,
      [BANDAGE_FLAG]: { healingDCReduction: special.healingDCReduction, itemName: item.name }
    } }
  }]);
  const buttons = BANDAGE_CHOICES.map((c) =>
    `<button type="button" data-action="trgBandage" data-choice="${c.key}">${esc(c.label)}</button>`).join("");
  const spent = await spendOne(item);
  await postCard(actor, `${item.name} — Applied`, [
    line(`<strong>${esc(actor.name)}</strong> binds ${esc(item.name)} on <strong>${esc(wearer.name)}</strong> for 24 hours.`),
    line(`<em>Healing DCs for ${esc(wearer.name)} are ${special.healingDCReduction} lower while it is worn — the table applies it.</em>`),
    line(`At any time in the 24 hours, ${esc(wearer.name)} may use a <strong>reaction</strong>, which destroys the bandage:`),
    `<div class="trg-card-buttons" style="display:flex;flex-wrap:wrap;gap:4px">${buttons}</div>`,
    spent
  ], { [CARD_FLAG]: { handle: actorHandle(wearer, wearerToken ?? null), effectId: effect?.id ?? "", done: false } });
  return { used: true, special: "bandage", wearer: wearer.id };
}

/** The wearer's reaction, from the card's buttons. */
async function useBandageReaction(message, key) {
  const card = message.getFlag(SYSTEM_ID, CARD_FLAG);
  if (!card || card.done) return;
  const choice = bandageChoice(key);
  const wearer = await resolveActorHandle(card.handle);
  const effect = wearer?.effects?.get?.(card.effectId) ?? null;
  if (!choice || !wearer || !effect) {
    ui.notifications.warn("That bandage is no longer worn.");
    await message.setFlag(SYSTEM_ID, CARD_FLAG, { ...card, done: true });
    return;
  }
  const { actorInCombat, spendReaction } = await import("./combat/action-points-workflow.mjs");
  if (actorInCombat(wearer) && Number(wearer.system?.resources?.reactions?.value ?? 0) < 1) {
    ui.notifications.warn(`${wearer.name} has no reaction left.`);
    return;
  }
  await spendReaction(wearer, effect.name);
  const lines = [];
  const row = { ...choice.row, label: effect.name };
  if (choice.roll) {
    const roll = await new Roll(choice.roll).evaluate();
    row.amount = roll.total;
    lines.push(line(`${esc(choice.label)}: <strong>${roll.total}</strong>.`));
  }
  const { syntheticSpellData } = await import("./consumable-use-workflow.mjs");
  const data = syntheticSpellData({ name: effect.name, img: effect.img, system: {} }, { label: effect.name, effects: [row], duration: "" });
  const spell = new Item.implementation(data, { parent: wearer });
  const { applySpellEffects } = await import("./magic/spell-effects.mjs");
  await applySpellEffects(wearer, spell, { targets: [wearer], lines });
  await effect.delete();
  await message.setFlag(SYSTEM_ID, CARD_FLAG, { ...card, done: true });
  await postCard(wearer, `${effect.name} — Used`, [
    line(`<strong>${esc(wearer.name)}</strong> uses a reaction: ${esc(choice.label)}. The bandage is destroyed.`),
    ...lines
  ]);
}

/** Register the card's buttons. Called once, at init. */
export function registerConsumableSpecialHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const card = message?.getFlag?.(SYSTEM_ID, CARD_FLAG);
    if (!card) return;
    for (const button of html.querySelectorAll?.('[data-action="trgBandage"]') ?? []) {
      if (card.done) { button.disabled = true; continue; }
      if (button[BOUND]) continue;
      button[BOUND] = true;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        void useBandageReaction(message, button.dataset.choice);
      });
    }
  });
}
