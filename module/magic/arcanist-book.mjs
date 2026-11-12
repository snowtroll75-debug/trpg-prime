/**
 * THE ARCANIST'S SPELLBOOK, LEVELLED HALF (3.676.0).
 *
 * The Arcanist archetype "gain[s] a spellbook containing four arcane
 * cantrips" (archetype-casting.mjs owns that half). Its follow-on feats
 * fill the book's other half:
 *
 *   ARCANE KNIGHT      "You may now memorise and cast a PP 2 arcane spell."
 *   MINOR ARCANE CASTER "You can memorise and cast one additional arcane
 *                      spell FROM YOUR SPELLBOOK ... Each time you are
 *                      granted a new spell slot, you may also add an
 *                      arcane spell of the appropriate level to your
 *                      spell book."
 *   MAJOR / MASTER     the same two sentences, further up the ladder.
 *
 * Until this release every one of those slots was filled from the whole
 * arcane list in the compendium, and nothing ever went into a book.
 * Graham, 29 October 2026: "the later feats should also ask for the
 * memorised spells to also come from the spellbook, but foundry does not
 * do this. It simply links to a list of arcane spells."
 *
 * HIS TWO RULINGS, the same day:
 *
 *   R1  The free addition stands as printed. Each Minor, Major or Master
 *       arcane slot also adds one arcane spell to the book, of a PP the
 *       slot could hold; Learn a Spell (Arcana) adds more beyond that.
 *   R2  Arcane Knight's PP 2 slot is filled from the book too, although
 *       its own sentence does not say "from your spellbook". Its text has
 *       no free-addition sentence, so it grants none: that spell has to
 *       be learned, or taken with a tier slot's free addition.
 *
 * WHAT A BOOK SPELL IS. A spell item carrying `archetypeBook`, owned by
 * the Arcanist feat (removing the feat removes the book, exactly as it
 * removes the four cantrips). It is NOT `spellBookPick`: that flag is the
 * Wizard's book, counted by the Wizard's ladder and toggled by the
 * Wizard's daily memorisation, and an Arcanist is by prerequisite never a
 * Wizard — borrowing it would hand a Cleric/Arcanist's arcane spells to
 * machinery built for a class they do not have.
 *
 * A SLOT MARKS A BOOK SPELL; IT DOES NOT COPY IT. The cantrip half
 * learned this first (a copied Light appeared on the sheet twice). So a
 * memorised book spell is the book entry itself with the slot's id on it,
 * and clearing the slot takes the id off again. Nothing is created or
 * deleted by memorising.
 *
 * AND WHETHER IT CAN BE CAST IS DERIVED, NOT STAMPED. A book spell is
 * castable when the slot named on it exists right now — not when some
 * `prepared` flag says so. That matters for the one case a stamp gets
 * wrong: a feat removed, or a level lost, takes its slot away, and the
 * spell must stop being castable at that moment without anything having
 * to remember to write to it. It simply goes back to being a book entry.
 *
 * NO FOUNDRY, so the harness drives every rule here.
 */

import { TRADITIONS } from "../config.mjs";
import { maxPPPerCast } from "./casting.mjs";
import { casterTierSlots } from "./caster-tier-feats.mjs";
import { archetypeCastingSources } from "./archetype-casting.mjs";

const SYSTEM_ID = "trg-prime";

/** The flag a levelled book spell carries. */
const ARCHETYPE_BOOK_FLAG = "archetypeBook";

/** How a spell got into the book: the tier feats' free addition, or Learn a Spell. */
const BOOK_VIA = Object.freeze(["free", "learned"]);

/** Read the marker off a spell item, or null. */
export function archetypeBookMark(item) {
  const mark = item?.flags?.[SYSTEM_ID]?.[ARCHETYPE_BOOK_FLAG];
  if (!mark) return null;
  const source = String(mark.source ?? "").trim().toLowerCase();
  const via = String(mark.via ?? "").trim().toLowerCase();
  if (!source || !BOOK_VIA.includes(via)) return null;
  return { source, via };
}

/**
 * The archetype whose spellbook this character keeps, or null.
 *
 * READ OFF THE ARCHETYPE TABLE rather than naming the Arcanist: the
 * book belongs to whichever archetype's style is "book". Today that is
 * the Arcanist alone, and a second one would need no change here.
 */
export function bookArchetype(items) {
  return archetypeCastingSources(items).find((s) => s.style === "book") ?? null;
}

/** The levelled spells in that book. */
export function bookSpells(items, sourceKey) {
  const wanted = String(sourceKey ?? "").trim().toLowerCase();
  return Array.from(items ?? []).filter(
    (i) => i?.type === "spell" && archetypeBookMark(i)?.source === wanted
  );
}

/**
 * Is this slot filled from the book? A slot of the book's own tradition,
 * held by a character who keeps the book. Without the archetype there is
 * no book to fill from, and the slot keeps its old behaviour — that is a
 * character the prerequisites do not allow (every one of these feats
 * carries the Arcanist trait), so it is reported rather than broken.
 */
export function slotIsBookBound(slot, book) {
  if (!book) return false;
  return String(slot?.tradition ?? "").trim().toLowerCase() === String(book.tradition ?? "").trim().toLowerCase();
}

/**
 * Does a live slot hold a spell of this PP? (3.676.1)
 *
 * `live` is what `liveFeatSlotIds` returns — a Map of slot id to that
 * slot's PP ceiling. A bare Set of ids (the 3.676.0 shape) still answers
 * "does the slot exist", with no ceiling to test.
 *
 * WHY THE CEILING. Found driving 3.676.0: a Fighter/Arcanist with Grease
 * (PP 4) in a Minor slot lost Arcane Knight. Their caster level fell to
 * 0, the Minor slots' ceiling to PP 1 — and Grease still read as
 * memorised and castable, sitting in a slot it could never have been put
 * into. "You still cannot cast spells above your caster level." A slot
 * holds what fits in it; what no longer fits goes back to the book, the
 * same way a spell whose slot has gone does.
 */
export function liveSlotHolds(live, slotId, pp) {
  const id = String(slotId ?? "");
  if (!id || !live?.has?.(id)) return false;
  if (!(live instanceof Map)) return true;
  return Number(pp ?? 0) <= Math.max(0, Number(live.get(id)) || 0);
}

/**
 * May this BOOK spell go in this slot?
 *
 * The slot's own ceiling and tradition (the same test a pack spell meets
 * in `featSlotEligible`), and not already sitting in another live slot —
 * one book entry carries one slot id, and moving it silently out of the
 * slot it fills would empty that one behind the player's back.
 *
 * @param {object} item a book spell item
 * @param {object} slot the slot it is going into
 * @param {Map<string, number>|Set<string>} liveSlotIds the slots that
 *   exist now — see `liveSlotHolds`
 */
export function bookSlotEligible(item, slot, liveSlotIds = new Set()) {
  if (!archetypeBookMark(item)) return false;
  const pp = Number(item?.system?.ppCost ?? -1);
  if (!Number.isFinite(pp) || pp < 1) return false;
  if (pp > Math.max(0, Number(slot?.maxPP) || 0)) return false;
  const current = String(item?.flags?.[SYSTEM_ID]?.featSpellSlot?.slotId ?? "");
  // Held by ANOTHER slot only if that slot still exists and still fits it
  // (3.676.1) — a spell its old slot has outgrown is free to move.
  if (current && current !== slot?.id && liveSlotHolds(liveSlotIds, current, pp)) return false;
  return true;
}

/**
 * How many free additions the tier feats grant: one for every slot they
 * grant in the book's tradition — "Each time you are granted a new spell
 * slot, you may also add an arcane spell". The Knight slot is not
 * counted (R2: its text has no such sentence).
 *
 * A TIER FEAT OF THE CLASS'S OWN TRADITION GRANTS NO SLOTS, so it grants
 * no free additions either — the same exclusion `featSpellSlots` applies.
 */
export function freeBookAllowance(featNames, level, bookTradition, ownTradition = "") {
  const tradition = String(bookTradition ?? "").trim().toLowerCase();
  if (!tradition) return 0;
  if (tradition === String(ownTradition ?? "").trim().toLowerCase()) return 0;
  return Math.max(0, Math.floor(Number(casterTierSlots(featNames, level)?.[tradition] ?? 0)));
}

/** What the card shows for the free additions. */
export function freeBookState({ allowed = 0, used = 0 } = {}) {
  const a = Math.max(0, Math.floor(Number(allowed) || 0));
  const u = Math.max(0, Math.floor(Number(used) || 0));
  return { allowed: a, used: u, remaining: Math.max(0, a - u) };
}

/**
 * May this pack spell be written into the book — by a free addition, or
 * by Learn a Spell?
 *
 * "OF THE APPROPRIATE LEVEL" is read as the PP a slot could hold right
 * now, which is the caster-level ceiling the tier slots already use; and
 * Learn a Spell's own requirement is "the minimum casting level required
 * for the casting of the spell" — the same number. So one test serves
 * both doors into the book.
 *
 * Levelled only (PP 1 and up — the four cantrips are the other half of
 * the book), the book's tradition only, never a specialist spell (a free
 * pick must not take what a class or school is meant to grant).
 */
export function bookAdditionEligible(spell, { tradition = "", casterLevel = 0 } = {}) {
  const pp = Number(spell?.ppCost ?? -1);
  if (!Number.isFinite(pp) || pp < 1) return false;
  if (pp > maxPPPerCast(casterLevel)) return false;
  if (spell?.specialist) return false;
  const wanted = String(tradition ?? "").trim().toLowerCase();
  if (!wanted) return false;
  return String(spell?.tradition ?? "")
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}

/**
 * The item data for a spell going into the book.
 *
 * UNPREPARED and OWNED BY THE ARCHETYPE FEAT: the book is the feat's, so
 * deleting the feat takes the book with it through the ordinary
 * grant-cleanup chain.
 */
export function bookSpellData(data, { feat = null, source = "", via = "free", requested = "" } = {}) {
  return {
    ...data,
    system: { ...data?.system, prepared: false },
    flags: {
      ...data?.flags,
      [SYSTEM_ID]: {
        ...data?.flags?.[SYSTEM_ID],
        [ARCHETYPE_BOOK_FLAG]: { source, via },
        grantedBy: {
          sourceId: feat?.id ?? null,
          sourceName: via === "learned" ? "Learn a Spell" : (feat?.name ?? ""),
          requested
        }
      }
    }
  };
}

/**
 * Is this book spell memorised in a slot that exists right now?
 *
 * THE WHOLE CASTABILITY RULE for a levelled book spell. See the header:
 * derived, so a slot that disappears takes castability with it.
 */
export function bookSpellSlotted(item, liveSlotIds) {
  if (!archetypeBookMark(item)) return false;
  return liveSlotHolds(liveSlotIds, item?.flags?.[SYSTEM_ID]?.featSpellSlot?.slotId, item?.system?.ppCost);
}

/** The tradition's label, for card text. */
export function bookTraditionLabel(book) {
  const key = String(book?.tradition ?? "").trim().toLowerCase();
  return TRADITIONS[key]?.label ?? key;
}

/**
 * Where Learn a Spell writes, or null when the character keeps no book.
 *
 * "class"     — the Wizard's own Spellbook, as it always has.
 * "archetype" — the Arcanist's (3.676.0): Minor Arcane Caster's own
 *               sentence leaves room for more than the free additions,
 *               and Graham's instruction of 29 October names the route —
 *               "the character must add these themself using learn a
 *               spell".
 *
 * THE CLASS BOOK WINS, though the two cannot meet in a legal character:
 * the Arcanist's prerequisite is "Non-Wizard". Ordering it this way means
 * a GM-built Wizard/Arcanist keeps the Wizard's behaviour rather than
 * silently changing which book their purchases land in.
 */
export function learnSpellRoute({ classBook = false, book = null } = {}) {
  if (classBook) return "class";
  if (book) return "archetype";
  return null;
}
