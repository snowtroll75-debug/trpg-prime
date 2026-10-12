/**
 * conjured-weapon-workflow — ask which weapon, then make it.
 *
 * NEW at 3.543.0, beside `conjured-weapon.mjs`.
 *
 * EVERYTHING DECIDABLE LIVES IN THE PURE MODULE. This file reads the
 * pack, shows a dialog and writes an item; it decides nothing. The
 * filter, the widening and the damage override are all in
 * conjured-weapon.mjs so the harness can drive them without a world —
 * the split this repository uses everywhere, and the reason the Shield
 * spell's rule could be checked at all.
 */

import { conjuredWeaponChoices, conjuredWeaponData, CONJURED_WEAPON_PACK }
  from "./conjured-weapon.mjs";
import { contentPack } from "../content-packs.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every weapon in the pack the caster may choose from.
 *
 * READS THE PACK, FILTERS WITH THE RULE. A weapon added to the pack
 * tomorrow is offered without this file changing.
 */
export async function conjurableWeapons(spec, warpMods) {
  const pack = contentPack(CONJURED_WEAPON_PACK);
  if (!pack) return [];
  const index = await pack.getIndex();
  const docs = [];
  for (const entry of index) {
    const doc = await pack.getDocument(entry._id);
    if (doc) docs.push(doc);
  }
  return conjuredWeaponChoices(spec, warpMods, docs);
}

/** Which of them does the caster want? */
export async function promptConjuredWeapon(spellName, choices) {
  if (!choices.length) return null;
  if (choices.length === 1) return choices[0];
  const { DialogV2 } = foundry.applications.api;
  const rows = choices
    .map((w, i) => `<label style="display:block;margin:3px 0"><input type="radio" name="pick" value="${i}"${i === 0 ? " checked" : ""}> ${w.name} <span class="hint">(${w.system?.category ?? "?"}, ${w.system?.damage ?? "?"})</span></label>`)
    .join("");
  const picked = await DialogV2.prompt({
    window: { title: `${spellName} — Shape the Weapon` },
    classes: ["trg-prime", "trg-check-dialog"],
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">It deals force damage whatever shape you give it.</p>${rows}</div>`,
    ok: {
      label: "Create",
      callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form).object?.pick ?? "0";
      }
    },
    rejectClose: false
  });
  if (picked === null || picked === undefined) return null;
  return choices[Number(picked)] ?? null;
}

/**
 * Put the conjured weapon on the target.
 *
 * STAMPED WITH THE CAST **AND** `endsWithSpell`, and the second flag is
 * the one that does the work.
 *
 * AT 3.543.0 THIS CARRIED ONLY THE castId, and the comment here claimed
 * the stamp was "so the weapon can be found and removed when the spell
 * ends". It was not: `removeSpellItemsByCastId` deletes an item only when
 * it declares `endsWithSpell === true`, because Bless Water's Holy Water
 * is also made by a spell and is meant to be KEPT. Without the
 * declaration the weapon was permanent — a comment describing a
 * mechanism that did not exist, which is the same defect as a header
 * claiming a harness. Found live, 9 Sep 2026: the Morning Star outlived
 * its minute and sat on the sheet with a castId pointing at nothing.
 */
export async function conjureWeaponOnto(target, spec, chosen, castId) {
  if (!target || !spec || !chosen) return null;
  try {
    const data = conjuredWeaponData(spec, chosen.toObject ? chosen.toObject() : chosen);
    data.flags = data.flags ?? {};
    data.flags[SYSTEM_ID] = {
      ...(data.flags[SYSTEM_ID] ?? {}),
      conjured: true,
      conjuredWeapon: true,
      castId: castId ?? null,
      endsWithSpell: true
    };
    const [made] = await target.createEmbeddedDocuments("Item", [data]);
    return made ?? null;
  } catch (err) {
    console.error("trg-prime | conjureWeaponOnto failed", err);
    return null;
  }
}
