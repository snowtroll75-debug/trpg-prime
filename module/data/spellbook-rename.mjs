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
/*
 * ONE BOOK FOR EVERY BOOK CASTER (3.712.4; Graham, 24 November 2026):
 * "the Archmage and Archivist should also receive a free Spellbook (keeping
 * it to one item makes things much easier in the long run)", and the
 * Spellblade too. Pillars of Faith's Archivist used to be granted its own
 * Prayer Book; an owned one becomes the Spellbook, spells and all (the
 * spells live on the actor, flagged `spellBookPick`, not in the item). The
 * Prayer Book's compendium entry stays in Pillars of Faith, ids preserved,
 * but nothing grants it.
 */
const PRAYER_BOOK_NAME = "Prayer Book";
export const PRAYER_BOOK_OLD_DESCRIPTION = "<p>Granted for free the moment a character takes the Archivist class. Open this item's own sheet to see the book grow — six PP 2 Divinity spells at 1st level, two more every level after — and to add spells to it as slots open up. Being in the book is not the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can be cast, or Recite from the Text to reach one in the moment.</p>\n<p>The book may hold prayers of religions other than your own; recording a prayer is not accepting it. Specialist spells cannot be learned by copying them in.</p>";
/** Every old book name a class grant or an owned book may still carry. */
const SPELLBOOK_FORMER_NAMES = Object.freeze([SPELLBOOK_OLD_NAME, PRAYER_BOOK_NAME]);
/*
 * Book-style classes that used to grant NO book: Eldritch Arts' Archmage
 * and Spellblade. An owned copy still blank gains the grant, so the next
 * grant pass hands the character their Spellbook.
 */
const SPELLBOOK_NEWLY_GRANTED_BY = Object.freeze(["Archmage", "Spellblade"]);
export const SPELLBOOK_NEW_NAME = "Spellbook";

export const SPELLBOOK_OLD_DESCRIPTION = "Granted for free the moment a character takes the Wizard class. Open this item's own sheet to see the book grow — six PP 2 arcane spells at 1st level, two more every level after — and to add spells to it as slots open up. Being in the book isn't the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can actually be cast.";
export const SPELLBOOK_NEW_DESCRIPTION = "Granted for free the moment a character takes a class that keeps a spell book, such as the Wizard. Open this item's own sheet to see the book grow — for a Wizard, six PP 2 arcane spells at 1st level and two more every level after — and to add spells to it as slots open up. Being in the book isn't the same as knowing it for the day: memorise from it at daily preparation (the Magic tab's Memorisation card) before a spell in it can actually be cast.";

const same = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
const isFormerName = (name) => SPELLBOOK_FORMER_NAMES.some((old) => same(name, old));

/**
 * Replace a former book's entry in a comma-separated grant list, keeping
 * every other entry and the list's order. Null when there is none. A list
 * naming two former books (never shipped) keeps one Spellbook.
 */
export function renamedGrantList(list) {
  if (typeof list !== "string" || !list.trim()) return null;
  let changed = false;
  let seen = false;
  const out = [];
  for (const entry of list.split(",")) {
    if (isFormerName(entry)) {
      changed = true;
      if (seen) continue;
      seen = true;
      out.push(entry.replace(entry.trim(), SPELLBOOK_NEW_NAME));
    } else out.push(entry);
  }
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
  // The Prayer Book only when it IS the spell book container — a mundane
  // gear item a GM happened to call "Prayer Book" is not touched.
  if (item.type === "gear" && item.name === PRAYER_BOOK_NAME && item.system?.spellbookContainer === true) {
    update.name = SPELLBOOK_NEW_NAME;
    if (item.system?.description === PRAYER_BOOK_OLD_DESCRIPTION) {
      update["system.description"] = SPELLBOOK_NEW_DESCRIPTION;
    }
  }
  const grant = item.flags?.["trg-prime"]?.grantedBy;
  // The stamp moves even on a book the GM renamed: it is what tells the next
  // grant pass the Spellbook was already given.
  if (grant && isFormerName(grant.requested)) {
    update["flags.trg-prime.grantedBy.requested"] = SPELLBOOK_NEW_NAME;
  }
  if (item.type === "class") {
    const list = renamedGrantList(item.system?.grantedGear);
    if (list !== null) update["system.grantedGear"] = list;
    else if (SPELLBOOK_NEWLY_GRANTED_BY.includes(item.name) && item.system?.memorisationStyle === "book"
      && !String(item.system?.grantedGear ?? "").trim()) {
      update["system.grantedGear"] = SPELLBOOK_NEW_NAME;
    }
  }
  return Object.keys(update).length ? update : null;
}
