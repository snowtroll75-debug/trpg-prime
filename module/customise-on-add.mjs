/**
 * Offer the Customise dialog when a weapon, armour or shield lands on a
 * character (Chapter 6 quality/material/traits, Chapter 11 runes).
 *
 * WHY A HOOK AND NOT A SHEET OVERRIDE. The picker's own Add/Buy already
 * customises before the item exists, but that is only one of the ways an
 * item gets onto a sheet: dragging from a compendium, dragging between
 * sheets, a macro, or a module all bypass it. Graham added a Battle Axe
 * by dragging it and was offered nothing, which is exactly right — the
 * sheet's drop path had never been touched. `createItem` catches all of
 * them, at the cost of the dialog arriving a moment AFTER the item does.
 *
 * WHAT STOPS IT NAGGING:
 *   - only weapons, armour and shields, and only on an actor;
 *   - only for the user who created the item, so a drop does not open a
 *     dialog on three other screens;
 *   - only when the item has not been customised already — the picker
 *     stamps `baseCustomisation`, so its items are left alone;
 *   - only when the world setting is on, and it can be turned off;
 *   - never for an item taken from party loot, which is changing
 *     hands rather than entering play (see shouldOfferCustomisation).
 *
 * Cancelling the dialog leaves the item exactly as dropped, which is the
 * behaviour that existed before this file.
 */

import { weaponUsage } from "./weapon-rune-usage.mjs";
import { computeFullCustomisation } from "./item-quality.mjs";
import { parseGrantList } from "./grants.mjs";

// `item-customize-workflow.mjs` reaches for `foundry.applications.api` at
// module scope, so it is imported where it is USED rather than at the
// top — which keeps this file loadable outside a browser, and lets the
// harness run `shouldOfferCustomisation` directly instead of reading it.

const SYSTEM_ID = "trg-prime";
export const CUSTOMISE_ON_ADD_SETTING = "customiseOnAdd";
const CUSTOMISABLE_TYPES = Object.freeze(["weapon", "armour", "shield"]);

/**
 * Should this creation open the dialog?
 *
 * A pure predicate so the harness can run it — the hook itself is three
 * lines of plumbing around this decision.
 */
export function shouldOfferCustomisation(item, userId, {
  currentUserId = "", enabled = true, partyTransfer = false
} = {}) {
  if (!enabled) return false;
  // AN ITEM TAKEN FROM PARTY LOOT IS NOT NEW TO PLAY. It was already in
  // the world, already customised — or deliberately not — by whoever put
  // it in the pile, and it is only changing hands.
  //
  // This matters more than tidiness because of how the party relay
  // works: the GM's client performs the creation, so `userId` is the
  // GM's, and every player who took a sword would otherwise open a
  // Customise dialog on the GM'S screen. Seen live, 12 Aug 2026.
  //
  // Read from the transient CREATE OPTIONS rather than from a flag on
  // the item — suppressing one dialog is not a fact worth writing into
  // somebody's inventory forever.
  if (partyTransfer) return false;
  if (userId !== currentUserId) return false;
  if (!item?.parent) return false;
  if (!CUSTOMISABLE_TYPES.includes(item?.type)) return false;
  // The picker already asked. Its items carry the record of what they
  // were before customisation, which nothing else writes.
  if (item?.flags?.[SYSTEM_ID]?.baseCustomisation) return false;
  // A SPECIFIC ITEM IS ALREADY FINISHED (3.615.0, Graham's R3 of block 36).
  // Its price, level, HP and penalties are the page's final figures, and
  // re-running quality and runes over them priced Air Drake Armour at
  // 540,100 gp the moment OK was pressed.
  if (item?.flags?.[SYSTEM_ID]?.specificItem) return false;
  // NOR IS A CHARGED ITEM'S WEAPON FORM (3.616.0, R15): its quality and
  // runes are the staff's own, printed. See charged-weapon-forms.mjs.
  if (item?.flags?.[SYSTEM_ID]?.weaponFormOf) return false;
  // A companion's natural attacks are weapons too, and nobody wants a
  // quality dialog for a wolf's bite.
  if (item?.system?.natural) return false;
  return true;
}

/** The item's own untouched figures, which customisation is relative to. */
export function baseFor(item) {
  return {
    level: item.system?.itemLevel ?? 0,
    price: item.system?.price ?? 0,
    hp: item.system?.hp?.max ?? 0,
    weight: item.system?.weight ?? 0,
    // A shield's size is its category, and nothing else: hardcoding
    // "light" here was quietly costing every tower shield its Lightweight
    // reduction. See computeFullCustomisation.
    category: item.system?.category ?? "",
    // A shield's `metal`, so Dragonhide is refused for a wooden one.
    metal: item.type === "shield" ? Boolean(item.system?.metal) : undefined
  };
}

/** Ask, and apply what comes back. Exported for the harness. */
export async function offerCustomisation(item) {
  const { promptCustomiseItem } = await import("./item-customize-workflow.mjs");
  const base = baseFor(item);
  const choice = await promptCustomiseItem(item.type, base, {
    title: `Customise ${item.name}`,
    quality: item.system?.quality || "standard",
    material: item.system?.material || "",
    dragonType: item.system?.dragonType || "",
    traitKeys: parseGrantList(item.system?.superiorTraits || ""),
    runes: item.system?.runes || "",
    usage: item.type === "weapon" ? weaponUsage(item.system) : null
  });
  // Cancelled: the item stays exactly as it was dropped.
  if (!choice) return null;

  const result = computeFullCustomisation(item.type, base, choice);
  const updates = {
    "system.quality": choice.quality,
    "system.material": choice.material,
    "system.dragonType": choice.dragonType ?? "",
    "system.superiorTraits": choice.traitKeys.join(","),
    "system.runes": choice.runes ?? "",
    "system.itemLevel": result.effectiveLevel,
    "system.price": result.price,
    "system.weight": result.weight,
    // The same record the item sheet and the picker write, so a second
    // customisation measures from the item's original figures rather
    // than compounding on the first one's.
    [`flags.${SYSTEM_ID}.baseCustomisation`]: base
  };
  if (item.system?.hp) {
    updates["system.hp.max"] = result.hpMax;
    updates["system.hp.value"] = result.hpMax;
  }
  await item.update(updates);
  return result;
}

/** Register the setting. Called from the system's own settings pass. */
export function registerCustomiseOnAddSetting() {
  game.settings.register(SYSTEM_ID, CUSTOMISE_ON_ADD_SETTING, {
    name: "Customise Items When Added",
    hint:
      "Opens the Quality / Material / Superior Traits / Runes dialog whenever a weapon, armour or shield is dropped onto a character, so it can be made magical before it is used. Items added through the sheet's own search button already ask beforehand. Turn this off to have drops land unchanged.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
}

/** Wire the hook. Called from the system's ready pass. */
export function registerCustomiseOnAddHook() {
  Hooks.on("createItem", async (item, options, userId) => {
    const enabled = game.settings.get(SYSTEM_ID, CUSTOMISE_ON_ADD_SETTING);
    if (!shouldOfferCustomisation(item, userId, {
      currentUserId: game.user?.id, enabled,
      partyTransfer: options?.trgPartyTransfer === true
    })) return;
    await offerCustomisation(item);
  });
}
