/**
 * The Wizard's Spell Book (Chapter 3 x Chapter 9) — the one learned
 * caster whose memorisation pool is a genuinely restricted, GROWING
 * list rather than blanket access to the whole tradition.
 *
 * "At 1st level you may select any six PP 2 arcane spells and add them
 * to your spell book. ... Each time you gain a level you automatically
 * add two new arcane spells to your spell book. Arcane spells gained in
 * this way cannot have a PP cost which is higher than the maximum that
 * you can cast."
 *
 * The eligibility SHAPE (tradition, specialist exclusion) and the PP
 * bands (exactly 2 for the first six, castable cap after) are the
 * identical rule the instinctive repertoire's own first-picks/later-
 * picks already use — `repertoirePickEligible` is reused directly
 * rather than re-derived (lesson 13), with `firstPick` covering the
 * initial six here exactly as it covers the Ranger's initial two there.
 * category is always "" — the book names no restriction the way the
 * Ranger's repertoire does.
 *
 * Ruling folded in at 3.224.0's repertoire and repeated here: "who
 * picks which two [per level]" is the player, via a levelled chooser —
 * the same shape as `openRepertoirePick`, confirmed with Graham.
 *
 * Growing the book is NOT the same as memorising from it — a spell
 * newly added to the book is not castable until a later daily
 * preparation actually memorises it (memorisation.mjs toggles
 * `prepared` on spellBookPick items; nothing here does).
 *
 * Pure functions only — the Foundry side lives in
 * spellbook-workflow.mjs.
 */

import { REPERTOIRE_FIRST_PICK_PP, repertoirePickEligible } from "./repertoire.mjs";
import { sourceEntryId } from "../items.mjs";

const SYSTEM_ID = "trg-prime";

export { REPERTOIRE_FIRST_PICK_PP as SPELLBOOK_FIRST_PICK_PP };
// sourceEntryId moved to items.mjs at 3.230.8 (general item mechanics, not
// magic-specific) once the feat/ability picker needed the same id-matching
// logic — re-exported here so spellbook-workflow.mjs's and
// memorisation-workflow.mjs's existing imports didn't need to change.
export { sourceEntryId };

/**
 * Total spell book slots granted by a level: the printed first-level
 * batch, plus two for every level gained since. `firstPicks` is the
 * class's own printed figure (6 for the Wizard) — kept as a parameter,
 * not a hardcoded constant, on the same "store the printed number as
 * data" convention `repertoireCategory` set, since a future arcane
 * book-caster could print a different opening batch.
 */
export function spellBookSlots(level, firstPicks) {
  const value = Math.floor(Number(level) || 0);
  const opening = Math.max(0, Math.floor(Number(firstPicks) || 0));
  if (value < 1) return 0;
  return opening + 2 * (value - 1);
}

/**
 * Is this pack spell eligible for a spell book slot right now? Exactly
 * the repertoire's own eligibility function — same shape, same PP
 * bands — with no category restriction.
 *
 * @param {object} spell {tradition, ppCost, specialist} — index fields.
 * @param {object} rules
 * @param {string} rules.tradition The class's tradition ("arcane").
 * @param {boolean} rules.firstPick Still filling the opening batch —
 *   PP must be exactly 2.
 * @param {number} rules.casterLevel For the castable cap on later picks.
 */
export function spellBookPickEligible(spell, { tradition = "", firstPick = false, casterLevel = 0 } = {}) {
  return repertoirePickEligible(spell, { tradition, category: "", firstPick, casterLevel });
}

/** The spells in the book: owned items carrying the spellBookPick flag
 * — permanent, unlike a day's memorised picks. */
export function spellBookSpells(actor) {
  return Array.from(actor?.items ?? []).filter(
    (item) => item.type === "spell" && Boolean(item.flags?.[SYSTEM_ID]?.spellBookPick)
  );
}

/**
 * The subset of the book that counts against the free, level-based
 * ladder (spellBookSlots/spellBookState below) — every book spell EXCEPT
 * one bought through Learn a Spell (learn-spell-workflow.mjs), which
 * flags its own additions `learnedExtra`. Learning a spell that way costs
 * time and gp instead of arriving free at level-up, so it must not eat
 * into the schedule's own owed/remaining count — a Wizard who pays to
 * learn a spell should not find their next free slot already spent.
 */
export function spellBookLadderSpells(actor) {
  return spellBookSpells(actor).filter(
    (item) => !Boolean(item.flags?.[SYSTEM_ID]?.learnedExtra)
  );
}

/**
 * Everything the Spell Book card shows, resolved once.
 *
 * @returns {{allowed, owned, remaining, firstPicksOutstanding}}
 */
export function spellBookState({ level = 0, firstPicks = 0, owned = 0 } = {}) {
  const allowed = spellBookSlots(level, firstPicks);
  const has = Math.max(0, Math.floor(Number(owned) || 0));
  return {
    allowed,
    owned: has,
    remaining: Math.max(0, allowed - has),
    firstPicksOutstanding: has < Math.min(Math.floor(Number(firstPicks) || 0), allowed)
  };
}
