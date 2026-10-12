/**
 * Transfer Runes (Core 3.1, Chapter 4 — General Skill Actions, Trained).
 * Pure logic; the choosers and the item writes live in
 * rune-transfer-workflow.mjs.
 *
 * The entry prints three things the system was doing none of:
 *
 *   A LADDER, in DC rather than in check modifier. "By increasing the
 *   difficulty of the check by 2 you can transfer the rune in 1 minute.
 *   By increasing the difficulty of the check by 5 you can transfer the
 *   rune in 1 round." That is the same wording First Aid uses for its
 *   own trade, and First Aid has always added it to the DC — so this
 *   does too, and it is emphatically NOT the kind of ladder Identify
 *   Power and Study Target have, which modify the roll.
 *
 *   A SECOND, INDEPENDENT +5 for going item-to-item rather than from a
 *   runestone. Independent because the two sentences are in different
 *   paragraphs and neither mentions the other: a one-round transfer
 *   between two items is +5 and +5.
 *
 *   FOUR OUTCOMES THAT DESTROY THINGS, and until now the card said so
 *   and nothing happened. Worse, the two variants destroy DIFFERENT
 *   things — from a runestone, a Failure loses the runestone and a
 *   Fumble also takes the item you were transferring to; between items,
 *   a Failure destroys the item you transferred FROM and a Fumble
 *   "destroys both items!". A single table would have got one of them
 *   wrong, so there are two.
 */

import { runeKindOf } from "./rune-bearing.mjs";

/** Which of the two variants a transfer is. */
export const TRANSFER_SOURCES = Object.freeze({
  /** From a runestone — the printed default. */
  RUNESTONE: "runestone",
  /** "Transferring Between Items" — its own sub-heading, its own +5. */
  ITEM: "item"
});

/**
 * "You spend 10 minutes transferring a magical rune" is the base, and
 * the two shorter times each buy their speed with DC.
 */
export const TRANSFER_TIME_OPTIONS = Object.freeze([
  Object.freeze({ key: "tenMinutes", label: "10 minutes", dcIncrease: 0 }),
  Object.freeze({ key: "minute", label: "1 minute", dcIncrease: 2 }),
  Object.freeze({ key: "round", label: "1 round", dcIncrease: 5 })
]);

/** The rung the dialog opens on — the printed, unpriced one. */
export const TRANSFER_TIME_DEFAULT = "tenMinutes";

/** "By increasing the difficulty of the check by 5 you can transfer the magical rune from one item to another." */
export const BETWEEN_ITEMS_DC_INCREASE = 5;

/**
 * @param {string} key
 * @returns {object|null}
 */
export function transferTime(key) {
  return TRANSFER_TIME_OPTIONS.find((option) => option.key === key) ?? null;
}

/**
 * How much harder the check is for what was asked of it.
 *
 * @param {object} args
 * @param {string} [args.timeKey]
 * @param {string} [args.source] One of TRANSFER_SOURCES.
 * @returns {number}
 */
export function transferDCIncrease({ timeKey = TRANSFER_TIME_DEFAULT, source = TRANSFER_SOURCES.RUNESTONE } = {}) {
  const time = transferTime(timeKey);
  const haste = time ? time.dcIncrease : 0;
  const between = source === TRANSFER_SOURCES.ITEM ? BETWEEN_ITEMS_DC_INCREASE : 0;
  return haste + between;
}

/**
 * The three unprinted degrees, named rather than defaulted.
 *
 * Heroic reads as a Critical, which has no row of its own here and so
 * reads as a Success — the best printed outcome, and the transfer simply
 * works. A Blunder reads as a Fumble, which is this project's convention
 * everywhere and is the only reading that does not make the worst roll
 * in the game the safest one to make with somebody's magic sword.
 */
export const TRANSFER_DEGREE_ALIASES = Object.freeze({
  heroic: "success",
  critical: "success",
  blunder: "fumble"
});

/**
 * What a degree does to the rune, the source and the target.
 *
 * @param {string} degreeKey
 * @param {object} [options]
 * @param {string} [options.source] One of TRANSFER_SOURCES.
 * @returns {{transferred:boolean, destroySource:boolean, destroyTarget:boolean, crackSource:boolean, text:string}}
 */
export function transferOutcome(degreeKey, { source = TRANSFER_SOURCES.RUNESTONE } = {}) {
  const key = String(degreeKey ?? "").toLowerCase();
  const degree = TRANSFER_DEGREE_ALIASES[key] ?? key;
  const betweenItems = source === TRANSFER_SOURCES.ITEM;

  switch (degree) {
    case "success":
      return {
        transferred: true,
        destroySource: false,
        destroyTarget: false,
        crackSource: false,
        text: "The rune is transferred successfully."
      };
    case "partial":
      // "You transfer the rune successfully, but a small crack has
      // appeared in the runestone which renders it useless for future
      // rune storing." Written about a RUNESTONE, and the between-items
      // section rewrites only Failure and Fumble — so an item source is
      // left uncracked rather than given a consequence the book never
      // printed for it.
      return betweenItems
        ? {
            transferred: true,
            destroySource: false,
            destroyTarget: false,
            crackSource: false,
            text: "The rune is transferred successfully. The printed crack applies to a runestone; there is none here to crack."
          }
        : {
            transferred: true,
            destroySource: false,
            destroyTarget: false,
            crackSource: true,
            text: "The rune is transferred, but a small crack appears in the runestone — it will never store a rune again."
          };
    case "failure":
      return betweenItems
        ? {
            transferred: false,
            destroySource: true,
            destroyTarget: false,
            crackSource: false,
            text: "The transfer fails and destroys the item you were transferring from."
          }
        : {
            transferred: false,
            destroySource: true,
            destroyTarget: false,
            crackSource: false,
            text: "The runestone cracks apart. Both the rune and the runestone are lost."
          };
    case "fumble":
      return betweenItems
        ? {
            transferred: false,
            destroySource: true,
            destroyTarget: true,
            crackSource: false,
            text: "The transfer fails catastrophically and destroys both items."
          }
        : {
            transferred: false,
            destroySource: true,
            destroyTarget: true,
            crackSource: false,
            text: "The runestone cracks apart, taking the rune with it — and the item you were transferring it to is destroyed as well."
          };
    default:
      // Not a degree at all. Nothing is moved and nothing is broken,
      // because guessing in either direction here costs somebody an item.
      return {
        transferred: false,
        destroySource: false,
        destroyTarget: false,
        crackSource: false,
        text: "The transfer does not resolve."
      };
  }
}

/* ------------------------------------------------------------------ *
 * THE RUNE FIELD                                                      *
 * ------------------------------------------------------------------ */

/**
 * An item's runes, split into the entries a person typed.
 *
 * NOT `parseRunes`, deliberately. That function strips each rune's
 * parameter before splitting, because what it wants is the rune's key
 * and tier. What a transfer wants is the ENTRY, parameter and all —
 * moving "Spell Effect (Fireball, 3/day)" and leaving the bracket behind
 * would move a different rune from the one that was chosen. So this
 * splits on separators OUTSIDE brackets and keeps everything else
 * verbatim, which is also why it cannot borrow the other function's
 * regex: that comma inside the bracket is a real comma.
 *
 * @param {string} field
 * @returns {string[]}
 */
export function splitRuneEntries(field) {
  const text = String(field ?? "");
  const entries = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    if (character === "(") depth += 1;
    else if (character === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (character === "," || character === ";" || character === "\n")) {
      entries.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  entries.push(current.trim());
  return entries.filter(Boolean);
}

/** The field a list of entries makes. */
export function joinRuneEntries(entries = []) {
  return (entries ?? []).map((entry) => String(entry ?? "").trim()).filter(Boolean).join(", ");
}

/**
 * The field with one entry taken out — the FIRST match only, so an item
 * carrying two of the same rune loses one of them and not both.
 *
 * @param {string} field
 * @param {string} entry
 * @returns {string}
 */
export function removeRuneEntry(field, entry) {
  const wanted = String(entry ?? "").trim();
  const entries = splitRuneEntries(field);
  const index = entries.findIndex((candidate) => candidate === wanted);
  if (index < 0) return joinRuneEntries(entries);
  entries.splice(index, 1);
  return joinRuneEntries(entries);
}

/** The field with one entry added at the end. */
export function addRuneEntry(field, entry) {
  // NO GUARD ON AN EMPTY ENTRY. There was one, and it was a line no
  // mutation could contradict: joinRuneEntries already drops blanks, so
  // deleting the guard changed no answer anywhere. Removed rather than
  // kept for the look of the thing.
  return joinRuneEntries([...splitRuneEntries(field), String(entry ?? "").trim()]);
}

/* ------------------------------------------------------------------ *
 * WHAT MAY TAKE PART                                                  *
 * ------------------------------------------------------------------ */

// WHICH ITEMS CARRY RUNES is asked of `runeKindOf` (rune-bearing.mjs)
// since 3.577.0, so runed clothing can take part. The list that was here
// was the fourth copy of the same three words.

/**
 * Is this item a runestone?
 *
 * Asked by DECLARATION FIRST and by name second. The system has no
 * runestone item type — Chapter 11's runes live in a text field on
 * weapons, armour and shields, and a runestone is a thing you buy —
 * so an item may say what it is with
 * `flags["trg-prime"].runestone`, and anything named like one is taken
 * at its word. The same escape hatch the tool requirements use, for the
 * same reason: homebrew gear should not have to be renamed to work.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isRunestone(item) {
  if (!item) return false;
  if (item?.flags?.["trg-prime"]?.runestone) return true;
  return /\brunestones?\b/i.test(String(item?.name ?? ""));
}

/**
 * Which variant a chosen source makes this. A runestone is a runestone
 * whatever its item type; everything else is the between-items case and
 * pays the +5 for it.
 *
 * @param {object} item
 * @returns {string}
 */
export function sourceKind(item) {
  return isRunestone(item) ? TRANSFER_SOURCES.RUNESTONE : TRANSFER_SOURCES.ITEM;
}

/**
 * A runestone already cracked by an earlier Partial can never store a
 * rune again — "renders it useless for future rune storing". It may
 * still be the source of the rune it already holds, so this is not a
 * reason to hide it from the source list; it is a reason it can never
 * appear in the target list.
 */
export function isCracked(item) {
  return Boolean(item?.flags?.["trg-prime"]?.runestoneCracked);
}

/**
 * The items that could give up a rune: anything that has one to give.
 *
 * @param {Array} items
 * @returns {Array<{item:object, kind:string, entries:string[]}>}
 */
export function transferSources(items = []) {
  const out = [];
  for (const item of items ?? []) {
    const entries = splitRuneEntries(item?.system?.runes ?? "");
    if (!entries.length) continue;
    out.push({ item, kind: sourceKind(item), entries });
  }
  return out;
}

/**
 * The items that could receive one: rune-bearing kinds, never the source
 * itself, and never a cracked runestone.
 *
 * @param {Array} items
 * @param {object} [options]
 * @param {object} [options.exclude] The chosen source.
 * @returns {Array}
 */
export function transferTargets(items = [], { exclude = null } = {}) {
  return (items ?? []).filter((item) => {
    if (!item) return false;
    if (exclude && item.id === exclude.id) return false;
    if (isCracked(item)) return false;
    // Runed clothing too (3.577.0, R9) — see rune-bearing.mjs.
    return Boolean(runeKindOf(item));
  });
}
