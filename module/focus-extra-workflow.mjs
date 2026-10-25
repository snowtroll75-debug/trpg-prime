/**
 * The Foundry side of `focusExtraTopUps` (focus-declarations.mjs), 3.667.1.
 *
 * When an item that declares `focusExtraUses` arrives on an actor (Inner
 * Tempest's Deep Focus), every Focus item it reaches gains those uses at
 * once. An item arriving AFTER the carrier is primed in full by
 * TRGItem._preCreate; this covers the ones already there, and the ones
 * created in the same batch as the carrier. Found in the live test of
 * 3.667.0: a Disciple's techniques held 1 of 2 until daily preparation.
 *
 * On the creating client only, and not for an import or duplicate
 * (`keepId`), which arrives with its counts already stored.
 */
import { focusExtraTopUps } from "./focus-declarations.mjs";

export function registerFocusExtraTopUps() {
  Hooks.on("createItem", async (item, options, userId) => {
    if (userId !== game.user?.id) return;
    if (options?.keepId) return;
    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor") return;
    const updates = focusExtraTopUps(item, Array.from(actor.items ?? []).filter((i) => i.id !== item.id));
    if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  });
}
