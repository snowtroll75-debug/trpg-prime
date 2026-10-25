/**
 * natural-ready — a character's natural attacks are always ready.
 *
 * NEW at 3.666.0. Graham, 21 October 2026: "Unarmed attacks (natural
 * attacks such as unarmed strike, claw, bite etc). If a character has such
 * an attack, it should always be armed and not take up a hand. At the
 * moment, you have to equip them!"
 *
 * THE HAND WAS ALREADY RIGHT: `itemRequiredHands` charges a natural attack
 * no hand (held-items.mjs). THE "EQUIPPED" WAS NOT. Every attack chooser in
 * the system offers equipped weapons only (`usableAttacks` and some sixty
 * other readers), and the weapons pack ships its eight natural attacks
 * unequipped, so a Claw dropped on a sheet, or a heritage's Raptorial
 * Blade, could not be used until somebody clicked the fist.
 *
 * DERIVED, NOT WRITTEN. A natural attack on a character is read as
 * equipped wherever `system.equipped` is read, from the item's own
 * derivation, so every one of those readers agrees without being touched
 * and nothing needs migrating. The sheet shows it as always ready, with no
 * toggle to fight the derivation.
 *
 * WHO. Characters, companions and familiars: their natural attacks are their
 * body. A creature (npc) keeps its stored state, because a creature's forms
 * switch its strikes on and off through it: the Huanling's Bite and Claw are
 * stored unequipped and its Change Shape equips them for the spider and the
 * tiger (F&F, tested live on 3.651.0).
 *
 * AND A FORM STILL TAKES WHAT IT TAKES. A Change Shape form on a character
 * that lists a strike in `loses` sets it aside for as long as the form is up.
 *
 * Pure: the decision lives here; documents/item.mjs applies it.
 */

/** The actor types whose natural attacks are always ready. */
export const ALWAYS_READY_ACTOR_TYPES = Object.freeze(["character", "companion", "familiar"]);

/**
 * Is this weapon a natural attack its bearer always has ready?
 *
 * @param {{type: string, natural: boolean, name: string}} item
 * @param {string} actorType
 * @param {string[]} formLoses the strikes an active form has set aside
 */
export function naturalAlwaysReady(item, actorType, formLoses = []) {
  if (item?.type !== "weapon" || !item?.natural) return false;
  if (!ALWAYS_READY_ACTOR_TYPES.includes(String(actorType ?? ""))) return false;
  return !Array.from(formLoses ?? []).includes(String(item?.name ?? ""));
}

/**
 * The strikes the actor's active Change Shape form has set aside.
 *
 * @param {Iterable<object>} effects the actor's effects
 * @param {string} systemId
 * @param {string} flag the change-shape flag key
 */
export function formLosesOf(effects, systemId = "trg-prime", flag = "changeShapeForm") {
  for (const effect of Array.from(effects ?? [])) {
    const form = effect?.flags?.[systemId]?.[flag];
    if (form && !effect?.disabled) return Array.isArray(form.loses) ? form.loses.map(String) : [];
  }
  return [];
}
