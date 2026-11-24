/**
 * The Wizard's Spellbook becomes the Spellbook (3.712.3). Pure data and one
 * pure function; no Foundry, so the harness can drive it.
 *
 * Graham, 24 November 2026: other classes keep a spell book now (Eldritch
 * Arts' Archmage, Pillars of Faith's Archivist), so the core gear item is
 * no longer the Wizard's alone and is named "Spellbook".
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY OWNED COPIES MUST MOVE WITH THE PACK — AND ALL THREE TOGETHER.
 *
 * A class's `grantedGear` is resolved BY NAME, and a grant pass decides
 * "already given?" from two things: the owned item's own name, and the
 * `grantedBy.requested` stamp the grant left on it. Every Wizard built
 * before this release holds a book named "Wizard's Spellbook", stamped
 * `requested: "Wizard's Spellbook"`, under a class copy whose own
 * `grantedGear` says "Wizard's Spellbook".
 *
 * Rename the class copy's grant alone and the next grant pass (any item
 * added or removed) asks for "Spellbook", finds neither a held item nor a
 * stamp by that name, and hands the character a SECOND book. So the pass
 * renames the book, its stamp and the class copy's grant in one go.
 *
 * OLD-VALUE MATCHED, as every repair here is: only the exact old name,
 * old stamp, old description and old grant entry are touched. A book a GM
 * has renamed or re-described is left alone, and an already-migrated copy
 * matches nothing, which is what makes the pass idempotent.
 */

export const SPELLBOOK_OLD_NAME = "Wizard's Spellbook";
export const SPELLBOOK_NEW_NAME = "Spellbook";

export const SPELLBOOK_OLD_DESCRIPTION = "Granted for free the moment a character takes the Wizard class. Open this item's own sheet to see the book grow — six PP 2 arcane spells at 1st level, two more every level after — and to add spells to it as slots open up. Being in the book isn't the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can actually be cast.";
export const SPELLBOOK_NEW_DESCRIPTION = "Granted for free the moment a character takes a class that keeps a spell book, such as the Wizard. Open this item's own sheet to see the book grow — for a Wizard, six PP 2 arcane spells at 1st level and two more every level after — and to add spells to it as slots open up. Being in the book isn't the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can actually be cast.";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

/**
 * Replace the old book's entry in a comma-separated grant list, keeping
 * every other entry and the list's order. Null when there is none.
 */
export function renamedGrantList(list) {
  if (typeof list !== "string" || !list.trim()) return null;
  const entries = list.split(",");
  let changed = false;
  const out = entries.map((entry) => {
    if (same(entry, SPELLBOOK_OLD_NAME)) {
      changed = true;
      return entry.replace(entry.trim(), SPELLBOOK_NEW_NAME);
    }
    return entry;
  });
  return changed ? out.join(",") : null;
}

/**
 * The update one owned or world item needs, or null.
 *
 * @param {object} item  an item's source-shaped data: {type, name, system, flags}
 * @returns {object|null} a dotted-path update
 */
export function spellbookRenameUpdate(item) {
  if (!item) return null;
  const update = {};
  if (item.type === "gear" && item.name === SPELLBOOK_OLD_NAME) {
    update.name = SPELLBOOK_NEW_NAME;
    if (item.system?.description === SPELLBOOK_OLD_DESCRIPTION) {
      update["system.description"] = SPELLBOOK_NEW_DESCRIPTION;
    }
  }
  const grant = item.flags?.["trg-prime"]?.grantedBy;
  if (grant && same(grant.requested, SPELLBOOK_OLD_NAME)) {
    update["flags.trg-prime.grantedBy.requested"] = SPELLBOOK_NEW_NAME;
  }
  if (item.type === "class") {
    const list = renamedGrantList(item.system?.grantedGear);
    if (list !== null) update["system.grantedGear"] = list;
  }
  return Object.keys(update).length ? update : null;
}
