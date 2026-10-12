// CANTRIPS ONLY (3.583.0; page 235, Graham's R12) — the rule lives in
// daily-study.mjs; this is the one place that already answers "can I cast
// this?", so it is the one place that asks.
import { castingLimitToday } from "./daily-study.mjs";
/**
 * WHAT IS ON THE SPELLS TABLE, AND WHY — the one answer to "can I cast
 * this?".
 *
 * Graham, 20 August 2026:
 *
 * > "The prepared button on the spells table is not a good idea and needs
 * > to be amended. At the moment this box draws from what has been
 * > memorised by a learned caster and is useless to an instinctive caster.
 * > It also seems to block spells that are provided from deific aspects
 * > (as they are not actually memorised)."
 *
 * THE OLD MODEL WAS A STAMP, AND STAMPS GET FORGOTTEN. `system.prepared`
 * was read by the cast gate as "castable", so every path that put a spell
 * on a sheet had to remember to set it — nine of them did, and the
 * comment in `grants-workflow` records the same defect being found twice
 * and the fix widened both times: first a deific aspect's bonus spells,
 * then a wizard school's specialist spells. A tenth path was always going
 * to be missed, and when it was, the spell sat on the sheet with an empty
 * circle beside it and silently refused to cast.
 *
 * THE NEW MODEL IS A CONSEQUENCE. Graham's ruling:
 *
 * > "An instinctive caster simply has all of their spells (from whatever
 * > source) on their spell table… A learned caster only pre-populates the
 * > spells table with spells granted from sources other than their class
 * > (which are always available to cast). When a learned caster uses the
 * > memorise spell and memorise cantrip button to learn their daily
 * > spells, these spells are then placed on the spells table and can be
 * > cast… any specialist spells selected (from whatever source) are also
 * > always available to cast for any caster. Innate spells are unaffected."
 *
 * And, on the one case his sentences did not reach — a spell dragged onto
 * a sheet by hand, with no source and never memorised:
 *
 * > "Yes — if it is on the table, it can be cast."
 *
 * SO THE TABLE IS THE ANSWER. Being listed and being castable are the
 * same fact, and this file decides both at once. There is exactly one
 * thing that is known but not ready, and it is a BOOK: the Wizard's Spell
 * Book and the Arcanist's four-cantrip spellbook both hold more than
 * their owner can carry in a day, and both use `system.prepared` to mean
 * "prepared today". That is the only surviving job of the field, and the
 * only reason a spell can be on a sheet and absent from the table.
 *
 * WHY NOT KEEP A CASTER-STYLE BRANCH. `canCastSpell` asked whether the
 * class was "learned" and refused unprepared spells if so — which is why
 * an instinctive caster saw an empty circle on every row and a Cleric's
 * deific spells were refused. Under this model the style does not appear:
 * a book behaves the same whoever holds it, and everything else is
 * castable for everybody. A rule with no branches is a rule that cannot
 * be wrong for one kind of caster and right for another.
 *
 * NO FOUNDRY, so every rule here is driven by the harness rather than
 * grepped — see `tools/HARNESS-RULES.md`.
 */

const SYSTEM_ID = "trg-prime";

/**
 * The reasons a spell is where it is, in the order they are tested.
 *
 * `label` is what the sheet's Source column shows. It replaced a tick
 * that said "prepared" — true for a learned caster mid-day, meaningless
 * for a Bard, and actively misleading beside a deific aspect's spells.
 */
export const SPELL_SOURCES = Object.freeze({
  innate: Object.freeze({ key: "innate", label: "Innate" }),
  specialist: Object.freeze({ key: "specialist", label: "Specialist" }),
  book: Object.freeze({ key: "book", label: "Spellbook" }),
  memorised: Object.freeze({ key: "memorised", label: "Memorised" }),
  granted: Object.freeze({ key: "granted", label: "Granted" }),
  repertoire: Object.freeze({ key: "repertoire", label: "Repertoire" }),
  known: Object.freeze({ key: "known", label: "Known" }),
  added: Object.freeze({ key: "added", label: "Added" })
});

const flag = (item, name) => item?.flags?.[SYSTEM_ID]?.[name];

/**
 * Is this spell a member of a BOOK — a pool larger than a day's carry?
 *
 * Two exist and they behave identically: the Wizard's Spell Book
 * (`spellBookPick`, 3.230.3) and the Arcanist archetype's four arcane
 * cantrips, of which two are prepared each day. Both are the character's
 * permanently, and neither is castable until prepared.
 *
 * DELIBERATELY NOT KEYED ON CASTER STYLE. The Arcanist's book obeys its
 * own printed sentence whoever holds it — a Fighter, a Bard, a Cleric —
 * and the Wizard's belongs to the class rather than to the style.
 */
export function isBookPoolSpell(item) {
  if (flag(item, "spellBookPick")) return true;
  const archetype = flag(item, "archetypeCantrip");
  return String(archetype?.kind ?? "").trim().toLowerCase() === "book";
}

/**
 * Why this spell is on the sheet, whether it belongs on the spells table,
 * and whether it can be cast.
 *
 * `onTable` and `castable` differ in exactly two places and no others: an
 * innate spell is castable but lives on its OWN table, and an unprepared
 * book entry is neither.
 *
 * @param {object} item a spell item
 * @returns {{key: string, label: string, onTable: boolean, castable: boolean}}
 */
export function spellAvailability(item) {
  const at = (source, onTable, castable) => ({ ...source, onTable, castable });

  // INNATE IS UNAFFECTED BY ALL OF THIS, in Graham's words. It has its
  // own table, its own attack and DC formulas, and costs no PP.
  if (item?.system?.innate) return at(SPELL_SOURCES.innate, false, true);

  // SPECIALIST, FROM WHATEVER SOURCE, IS ALWAYS AVAILABLE — tested before
  // the book rule, not after, because that is the order the ruling puts
  // them in and because a specialist spell that also sat in a book would
  // otherwise be hidden by it.
  if (item?.system?.specialist) return at(SPELL_SOURCES.specialist, true, true);

  // THE ONLY THING THAT IS KNOWN BUT NOT READY.
  if (isBookPoolSpell(item)) {
    return item?.system?.prepared
      ? at(SPELL_SOURCES.memorised, true, true)
      : at(SPELL_SOURCES.book, false, false);
  }

  // Everything below is on the table and castable. The distinctions are
  // for the player's benefit — the Source column answers "why is this
  // here?", which is the question the old tick was failing to answer.
  if (flag(item, "dailyMemorised")) return at(SPELL_SOURCES.memorised, true, true);
  if (flag(item, "featSpellSlot")) return at(SPELL_SOURCES.granted, true, true);
  // An archetype's cantrips are two different things and the column
  // should say which: the Animist and the Priest re-pick theirs every
  // morning, the Gleeman's two are permanent and cast at will.
  const archetype = flag(item, "archetypeCantrip");
  if (archetype) {
    return String(archetype.kind ?? "").trim().toLowerCase() === "daily"
      ? at(SPELL_SOURCES.memorised, true, true)
      : at(SPELL_SOURCES.known, true, true);
  }
  if (flag(item, "repertoirePick")) return at(SPELL_SOURCES.repertoire, true, true);
  if (flag(item, "cantripPick")) return at(SPELL_SOURCES.known, true, true);
  if (flag(item, "grantedBy")) return at(SPELL_SOURCES.granted, true, true);

  // A spell somebody dragged on by hand. Castable, per the ruling: it is
  // a deliberate act, usually a GM building an NPC or fixing something,
  // and a spell visible on the table that silently would not fire is the
  // very confusion this change exists to remove.
  return at(SPELL_SOURCES.added, true, true);
}

/**
 * The cast gate, as a refusal reason or null.
 *
 * ONE GATE, NOT TWO. This replaces `canCastSpell` — which asked whether
 * the class was "learned" and so refused a Cleric's deific spells — and
 * `archetypeCantripCastBlocked`, which existed only because the first one
 * waved non-learned casters through and let a Fighter/Arcanist cast all
 * four of their spellbook cantrips. Both were the same question asked
 * about different pools.
 *
 * @param {object} item a spell item
 * @returns {string|null} why it cannot be cast, or null
 */
export function spellCastBlocked(item) {
  /*
   * CANTRIPS ONLY, WHEN THE STUDY WAS NOT DONE (3.583.0; page 235,
   * Graham's R12).
   *
   * "If a learned caster is unable to study their Spell Library, they can
   * only cast cantrips that day." This was a reminder on the daily
   * preparation card reading "GM judgement, not tracked"; it is a refusal
   * now, and it belongs here because this is the one function that already
   * answers "can I cast this?" — a second gate somewhere else would be a
   * second thing that has to agree.
   *
   * THE FLAG IS ONLY BELIEVED FOR TODAY. A `dailyStudy` stamp from last
   * week is not an answer about this morning, and treating it as one would
   * lock a character out of their spells over a session boundary.
   */
  const actor = item?.parent;
  const stamp = actor?.getFlag?.("trg-prime", "dailyStudy") ?? null;
  if (stamp && Number(item?.system?.ppCost ?? 0) > 0) {
    const since = Number(globalThis.game?.time?.worldTime ?? 0) - Number(stamp.at ?? 0);
    const limit = castingLimitToday({ owed: Number(stamp.minutes ?? 0) > 0, studied: stamp.studied !== false });
    if (limit.cantripsOnly && since >= 0 && since < 86400) {
      return `${item?.name ?? "That spell"} cannot be cast — ${limit.reason}. `
        + "Run Daily Preparation after a full rest.";
    }
  }

  const source = spellAvailability(item);
  if (source.castable) return null;
  return `${item?.name ?? "That spell"} is in your spellbook but is not prepared today — prepare it on the Magic tab.`;
}
