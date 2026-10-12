/**
 * Precious Metals against real documents — the Foundry half of
 * material-shift.mjs (3.614.0, Graham's R11 of block 35).
 */

import { MATERIAL_SHIFT_FLAG, materialShiftChoices, shiftableItem, materialShiftLine } from "./material-shift.mjs";

const SYSTEM_ID = "trg-prime";
const esc = (v) => foundry.utils.escapeHTML?.(String(v ?? "")) ?? String(v ?? "");

/**
 * Ask which item and which metal, change it, and keep the minute.
 * @returns {Promise<string>} the card line
 */
export async function applyMaterialShift(target, spell, { warpMods = {}, timing = {}, durationText = "", castId = null } = {}) {
  const items = Array.from(target?.items ?? []).filter(shiftableItem);
  if (!items.length) return `<em>${target?.name ?? "The target"} holds no metal weapon, armour or shield for ${spell.name} to change.</em>`;
  const metals = materialShiftChoices(warpMods);
  const { DialogV2 } = foundry.applications.api;
  const picked = await DialogV2.wait({
    window: { title: `${spell.name} — which item, which metal?`, icon: "fa-solid fa-coins" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <div class="form-group"><label>Item</label><select name="item">${items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</select></div>
      <div class="form-group"><label>Metal</label><select name="metal">${metals.map((m, n) => `<option value="${n}">${esc(m.name)}</option>`).join("")}</select></div>
    </div>`,
    buttons: [
      { action: "ok", label: "Transform", default: true,
        callback: (_e, button) => ({ item: button.form?.elements?.item?.value, metal: button.form?.elements?.metal?.value }) },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel") return `<em>No item was chosen for ${spell.name} — nothing changed.</em>`;
  const item = target.items.get(picked.item);
  const metal = metals[Number(picked.metal)];
  if (!item || !metal) return `<em>${spell.name}: that item or metal is not available — nothing changed.</em>`;

  const from = String(item.system?.material ?? "");
  // ONE SHIFT PER ITEM: a second casting on the same item replaces the first,
  // and restores to the metal the item really had.
  const prior = Array.from(target.effects ?? []).find((e) => e.flags?.[SYSTEM_ID]?.[MATERIAL_SHIFT_FLAG]?.itemId === item.id);
  const original = prior ? String(prior.flags[SYSTEM_ID][MATERIAL_SHIFT_FLAG].from ?? "") : from;
  if (prior) await prior.update({ [`flags.${SYSTEM_ID}.${MATERIAL_SHIFT_FLAG}.superseded`]: true }).then(() => prior.delete());

  await item.update({ "system.material": metal.key });
  const flags = { [SYSTEM_ID]: { spellBuff: true, [MATERIAL_SHIFT_FLAG]: { itemId: item.id, from: original, to: metal.key, metal: metal.name } } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: `${spell.name} — ${item.name} (${metal.name})`,
    img: spell.img || "icons/svg/aura.svg",
    origin: spell.uuid,
    changes: [],
    flags
  }]);
  return materialShiftLine(item.name, metal, durationText);
}

/** Register the restore. Called once, at init. */
export function registerMaterialShift() {
  globalThis.Hooks.on("deleteActiveEffect", async (effect) => {
    try {
      const record = effect?.flags?.[SYSTEM_ID]?.[MATERIAL_SHIFT_FLAG];
      if (!record || record.superseded) return;
      if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
      const item = effect.parent?.items?.get?.(record.itemId);
      // ONLY IF IT IS STILL WHAT THE SPELL MADE IT: a material somebody set
      // since is theirs, not the spell's to undo.
      if (!item || String(item.system?.material ?? "") !== String(record.to ?? "")) return;
      await item.update({ "system.material": record.from ?? "" });
      await ChatMessage.create({ content: `<div class="trg-prime"><p><em>${esc(item.name)} returns to its own metal.</em></p></div>` });
    } catch (err) {
      console.warn(`${SYSTEM_ID} | precious metals restore failed`, err);
    }
  });
}
