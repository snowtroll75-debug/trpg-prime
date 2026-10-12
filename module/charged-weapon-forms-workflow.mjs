/**
 * The documents half of charged-weapon-forms.mjs (3.616.0, R15).
 */

import {
  WEAPON_FORM_FLAG, reconcileWeaponForms, weaponFormGrants, weaponFormName, weaponFormSignature, weaponFormSystem
} from "./charged-weapon-forms.mjs";
import { packItemData } from "./items.mjs";
import { contentPack } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";
const inFlight = new Set();

function grantedFormsOf(actor) {
  return Array.from(actor?.items ?? [])
    .filter((item) => item.type === "weapon" && item.flags?.[SYSTEM_ID]?.[WEAPON_FORM_FLAG])
    .map((item) => ({ id: item.id, signature: item.flags[SYSTEM_ID][WEAPON_FORM_FLAG].signature ?? "" }));
}

/**
 * Bring the actor's granted weapon forms in line with its equipped charged
 * items.
 * @returns {Promise<{created: string[], removed: number}>}
 */
async function syncWeaponForms(actor) {
  if (!actor?.id || actor.documentName !== "Actor") return { created: [], removed: 0 };
  if (inFlight.has(actor.id)) return { created: [], removed: 0 };
  inFlight.add(actor.id);
  try {
    const { create, remove } = reconcileWeaponForms(weaponFormGrants(Array.from(actor.items ?? [])), grantedFormsOf(actor));
    if (!create.length && !remove.length) return { created: [], removed: 0 };
    if (remove.length) await actor.deleteEmbeddedDocuments("Item", remove);
    const created = [];
    if (create.length) {
      // FEDERATED, like every pack read: a module may extend the weapons.
      const pack = contentPack("weapons");
      const index = pack ? await pack.getIndex() : null;
      const docs = [];
      for (const grant of create) {
        const entry = index ? Array.from(index.values()).find((e) => e.name.toLowerCase() === grant.base.toLowerCase()) : null;
        if (!entry) {
          ui.notifications.warn(`${grant.itemName}: its weapon form "${grant.base}" is not in the weapons compendium.`);
          continue;
        }
        const data = packItemData(await pack.getDocument(entry._id));
        data.name = weaponFormName(grant);
        data.img = actor.items.get(grant.itemId)?.img || data.img;
        Object.assign(data.system, weaponFormSystem(grant));
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${WEAPON_FORM_FLAG}`, {
          itemId: grant.itemId, base: grant.base, signature: weaponFormSignature(grant)
        });
        // The provenance grant-cleanup already reads.
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
          sourceId: grant.itemId, sourceName: grant.itemName, requested: grant.base
        });
        docs.push(data);
      }
      if (docs.length) {
        const made = await actor.createEmbeddedDocuments("Item", docs);
        for (const doc of made ?? []) created.push(doc.name);
      }
    }
    return { created, removed: remove.length };
  } finally {
    inFlight.delete(actor.id);
  }
}

/** Register the hooks. Called once, at init. */
export function registerWeaponFormHooks() {
  const sync = (actor, userId) => {
    if (userId !== undefined && game.user?.id !== userId) return;
    if (actor?.documentName === "Actor") void syncWeaponForms(actor);
  };
  Hooks.on("createItem", (item, options, userId) => sync(item?.parent, userId));
  Hooks.on("updateItem", (item, changes, options, userId) => sync(item?.parent, userId));
  Hooks.on("deleteItem", (item, options, userId) => sync(item?.parent, userId));
}
