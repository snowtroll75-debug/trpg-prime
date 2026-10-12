/**
 * The Foundry side of a conjured item (see conjured-item.mjs).
 *
 * NEW at 3.487.0.
 *
 * ONE JOB: fetch the real compendium document the row names and put a
 * copy of it on the target. Everything about WHAT to fetch, and what to
 * say afterwards, is decided in the pure module.
 */

import { conjuredItemName } from "./conjured-item.mjs";
import { contentPack } from "../content-packs.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The compendium a conjurable pack name refers to.
 *
 * Built from the declared name rather than searched for, so a row naming
 * a pack this system does not ship resolves to nothing and says so,
 * rather than quietly finding a same-named item somewhere else.
 */
function conjurablePackId(pack) {
  return `${SYSTEM_ID}.${pack}`;
}

/**
 * Create the named item on an actor.
 *
 * RETURNS THE DOCUMENT, so the card can print the item's OWN name rather
 * than the one the row asked for. If those ever differ the card should
 * say what actually arrived.
 *
 * WHETHER IT LASTS IS THE CALLER'S TO SAY (3.590.0), and the default is
 * FOREVER because that is what this mechanism was written for. Bless
 * Water makes real Holy Water and the flask is meant to be kept:
 * `removeSpellItemsByCastId` deletes an item only when it declares
 * `endsWithSpell === true`, so an unstamped item survives every sweep.
 *
 * Goodberry is the first conjured item with a clock -- "Duration 1 day",
 * after which five berries stop being magical. Stamped, it is removed by
 * the same sweep that takes a conjured weapon, and the companion effect
 * the CALLER creates is what carries the time. Measured before the
 * parameter was added: the pack holds exactly two conjureItem spells,
 * Bless Water's duration is blank and Goodberry's is a day, so the
 * distinction is real rather than hypothetical.
 *
 * @param {Actor} target
 * @param {object} spec a normalised conjured-item row
 * @param {object} [options]
 * @param {string|null} [options.castId] the cast this item belongs to
 * @param {boolean} [options.expires] stamp it to be swept when the spell ends
 * @returns {Promise<Item|null>} null when the pack has no such item
 */
export async function conjureItemOnto(target, spec, { castId = null, expires = false, stamp = null } = {}) {
  if (!target || !spec) return null;
  try {
    const pack = contentPack(spec.pack);
    if (!pack) return null;
    const index = await pack.getIndex();
    const wanted = conjuredItemName(spec).toLowerCase();
    const entry = index.find((e) => String(e.name).trim().toLowerCase() === wanted);
    if (!entry) return null;
    const doc = await pack.getDocument(entry._id);
    if (!doc) return null;

    const data = doc.toObject();
    // THE QUANTITY THE ROW ASKED FOR, over whatever the pack entry
    // happens to carry. A pack item is a template; the spell says how
    // many it makes.
    if (data.system && typeof data.system === "object") {
      data.system.quantity = spec.quantity;
    }
    // STAMPED WITH ITS ORIGIN, the same field every granted item carries
    // since 3.328.0, so a conjured flask is distinguishable from a bought
    // one by anything that later needs to ask — without its NAME being
    // different, which would split the stack and mislead every reader.
    data.flags = data.flags ?? {};
    data.flags[SYSTEM_ID] = { ...(data.flags[SYSTEM_ID] ?? {}), conjured: true };
    if (expires) {
      data.flags[SYSTEM_ID].castId = castId ?? null;
      data.flags[SYSTEM_ID].endsWithSpell = true;
    }
    /*
     * WHAT THIS PARTICULAR CASTING PUT IN IT (3.594.0). A Power Crystal
     * holds the points the caster paid for, so two crystals made by two
     * castings are not interchangeable and the pack entry cannot know
     * the number. Merged rather than assigned, so the conjured and
     * expiry stamps above survive it.
     */
    if (stamp && typeof stamp === "object") {
      data.flags[SYSTEM_ID] = { ...data.flags[SYSTEM_ID], ...stamp };
    }

    const [made] = await target.createEmbeddedDocuments("Item", [data]);
    return made ?? null;
  } catch (error) {
    console.error("TRG Prime | could not conjure an item", error);
    return null;
  }
}

/**
 * A conjured item that leaves early takes its clock with it.
 *
 * NEW at 3.594.2, and the live drive that asked for it is in
 * spell-effects.mjs beside the flag this reads.
 *
 * THE SWEEP ONLY EVER RAN ONE WAY: an expiring effect deletes the items
 * stamped with its cast. Nothing ran the other way, so an item that went
 * before its time — a Power Crystal dissolving on its last point, a
 * Goodberry eaten — left a companion effect ticking down on the holder's
 * sheet with nothing under it. Three of them at once in Graham's world.
 *
 * NAMED, NOT MATCHED BY NAME. The effect carries the item's id, so this
 * deletes the clock for THIS item and never a same-named one from a
 * second casting. Effects created before 3.594.2 carry no id and are left
 * alone rather than guessed at.
 *
 * GM ONLY, for the reason every other cleanup hook in this system is: two
 * clients racing to delete one effect means the loser is told it does not
 * exist.
 */
export function registerConjuredItemHooks() {
  Hooks.on("deleteItem", (item) => {
    if (!game.user?.isGM) return;
    const actor = item?.parent;
    if (!actor?.effects?.size) return;
    const clocks = actor.effects
      .filter((e) => e.getFlag?.(SYSTEM_ID, "conjuredItemId") === item.id)
      .map((e) => e.id);
    if (!clocks.length) return;
    actor.deleteEmbeddedDocuments("ActiveEffect", clocks).catch(() => {});
  });
}
