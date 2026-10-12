/**
 * The halves of block 33's R8 that touch the world: Trade Essence's
 * transfer and Vigour's end-of-turn heal. The rules are in
 * magic/life-transfer.mjs. NEW at 3.609.0.
 */

import { essenceTradeAmount, essenceTradeCap, normaliseEssenceTrade, TURN_HEAL_FLAG, turnHealed } from "./life-transfer.mjs";
import { casterLevelOf } from "./caster-level-mods.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Trade Essence: the caster names the donor and the amount; the amount is
 * clamped by the three printed limits and moved.
 *
 * @returns {Promise<string[]>} card lines (HTML fragments)
 */
export async function applyEssenceTrade(caster, spell, row, recipients, warpPerLevel = 0) {
  const spec = normaliseEssenceTrade(row);
  if (!spec) return [`<em>${spell?.name ?? "The spell"} declares a malformed trade.</em>`];
  const pair = (Array.isArray(recipients) ? recipients : []).filter(Boolean).slice(0, 2);
  if (pair.length < 2) {
    return [`<em>${spec.label} needs two creatures to link — target both, then cast.</em>`];
  }
  const cap = essenceTradeCap(spec, casterLevelOf(caster?.system ?? {}), warpPerLevel);
  const pp = (a) => ({ value: Number(a.system?.resources?.pp?.value ?? 0), max: Number(a.system?.resources?.pp?.max ?? 0) });
  const { DialogV2 } = foundry.applications.api;
  const options = pair.map((a, i) => `<option value="${i}">${a.name} gives to ${pair[1 - i].name} (has ${pp(a).value} PP)</option>`).join("");
  const picked = await DialogV2.wait({
    window: { title: `${spec.label} — the conduit` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">Up to <strong>${cap}</strong> PP may move.</p>`
      + `<label>Direction <select name="donor">${options}</select></label>`
      + `<label>Power Points <input type="number" name="amount" min="0" max="${cap}" value="${cap}"></label></div>`,
    buttons: [
      {
        action: "trade", label: "Transfer", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          const data = new FDE(form).object;
          return { donor: Number(data.donor ?? 0), amount: Number(data.amount ?? 0) };
        }
      },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel" || typeof picked !== "object") {
    return [`<em>${spec.label}: no transfer was made.</em>`];
  }
  const donor = pair[picked.donor === 1 ? 1 : 0];
  const recipient = pair[picked.donor === 1 ? 0 : 1];
  const from = pp(donor);
  const to = pp(recipient);
  const { amount, limitedBy } = essenceTradeAmount(picked.amount, {
    cap, donorPP: from.value, recipientPP: to.value, recipientMax: to.max
  });
  if (amount > 0) {
    await donor.update({ "system.resources.pp.value": from.value - amount });
    await recipient.update({ "system.resources.pp.value": to.value + amount });
  }
  return [`<strong>${spec.label}</strong>: ${donor.name} gives <strong>${amount} PP</strong> to ${recipient.name}`
    + ` (${from.value} → ${from.value - amount}; ${to.value} → ${to.value + amount})`
    + `${limitedBy && amount < Math.max(0, Math.trunc(Number(picked.amount) || 0)) ? ` — held to ${limitedBy}` : ""}.`];
}

/**
 * Vigour's heal, at the end of the creature's own turn.
 * @returns {Promise<string[]>}
 */
export async function applyTurnHeals(actor) {
  const lines = [];
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect.disabled) continue;
    const spec = effect.getFlag?.(SYSTEM_ID, TURN_HEAL_FLAG);
    if (!spec) continue;
    const hp = Number(actor.system?.resources?.hp?.value ?? 0);
    const max = Number(actor.system?.resources?.hp?.max ?? 0);
    const healed = turnHealed(spec, hp, max);
    if (healed > 0) await actor.update({ "system.resources.hp.value": hp + healed });
    lines.push(healed > 0
      ? `<strong>${spec.label}</strong>: ${actor.name} is healed <strong>${healed}</strong> HP at the end of its turn.`
      : `<strong>${spec.label}</strong>: ${actor.name} is already at full health.`);
  }
  return lines;
}
