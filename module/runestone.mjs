/**
 * runestone — a smooth stone that stores one rune (Chapter 6, Gear).
 *
 * NEW at 3.666.2. Graham, 22 October 2026: "add Runestone as an item to the
 * gear list".
 *
 *   RUNESTONE (Magical, Level 1, 80 gp, held in 1 hand, 1 lb): "You can
 *   inscribe only one rune upon the stone at any one time. Once the stone is
 *   etched, it gains the school and tradition traits of the rune etched upon
 *   it. When a rune is transferred from the runestone to another object, the
 *   runestone loses these traits."
 *
 *   "If a rune has been inscribed onto a Runestone it may be transferred to an
 *   item at a later date. This process incurs no cost but requires a
 *   successful Transfer Runes Crafting check (see Chapter 4)."
 *
 * WHAT WAS ALREADY HERE. Transfer Runes has always known a runestone
 * (rune-transfer.mjs): a stone is a source with no between-items +5, its
 * Partial cracks it, its Failure and Fumble destroy it. What did not exist
 * was the stone itself, a place on it for the rune, the one-rune rule, or
 * its traits.
 *
 * THE TRAITS ARE WRITTEN, NOT DERIVED. A derived trait list would show on the
 * sheet's Traits field, and saving the sheet would write it down for good, so
 * the stone would keep the rune's traits after the rune left: the one thing
 * the text says must not happen. So the stone records which traits the rune
 * gave it (`flags.trg-prime.runestoneTraits`), and every change to its rune
 * takes those away and adds the new rune's. Traits a GM typed are never
 * touched.
 *
 * A STORED RUNE DOES NOTHING. A runestone is not a rune-bearing kind
 * (rune-bearing.mjs), so no rune on it ever counts for its carrier: it is
 * stored, not worn.
 *
 * Pure: the decisions live here; documents/item.mjs applies them.
 */
import { SPELL_SCHOOLS } from "./data/spell-tables.mjs";
import { TRADITIONS } from "./config.mjs";
import { parseRunes, normaliseRune } from "./runes.mjs";
import { isRunestone, splitRuneEntries } from "./rune-transfer.mjs";
import { WEAPON_RUNES } from "./weapon-rune-data.mjs";
import { ARMOUR_RUNES } from "./armour-rune-data.mjs";
import { CODEX_ARMOUR_RUNES, CODEX_WEAPON_RUNES } from "./codex-rune-data.mjs";
import { registeredRunes } from "./module-api.mjs";

/** The flag recording the traits the stored rune gave the stone. */
export const RUNESTONE_TRAITS_FLAG = "runestoneTraits";

/** The school and tradition traits, in their printed spelling. */
const SCHOOL_AND_TRADITION = Object.freeze([
  ...SPELL_SCHOOLS,
  ...Object.values(TRADITIONS).map((t) => t.label)
]);

const splitTraits = (text) => String(text ?? "").split(",").map((t) => t.trim()).filter(Boolean);

/**
 * Must this change to a runestone's rune be refused, and why?
 *
 * @param {object} args
 * @param {string} args.after the field as it would be
 * @param {string} [args.before] the field as it is
 * @param {boolean} [args.cracked] an earlier Partial cracked the stone
 * @returns {string|null}
 */
export function runestoneRefusal({ after = "", before = "", cracked = false } = {}) {
  const next = splitRuneEntries(after);
  if (next.length > 1) return "a runestone holds only one rune at a time";
  // "A SMALL CRACK … RENDERS IT USELESS FOR FUTURE RUNE STORING": a cracked
  // stone may still give up the rune it holds, never take a new one.
  const prior = splitRuneEntries(before);
  if (cracked && next.length && next[0] !== prior[0]) return "this runestone is cracked and can never store a rune again";
  return null;
}

/**
 * Every rune the system knows: Chapter 11's, the Creature Codex's and any a
 * companion module registered.
 */
function knownRunes() {
  return [...WEAPON_RUNES, ...ARMOUR_RUNES, ...CODEX_WEAPON_RUNES, ...CODEX_ARMOUR_RUNES, ...registeredRunes()];
}

/**
 * The school and tradition traits of the rune named in an entry.
 *
 * @param {string} entry e.g. "Flaming II" or "Spell Effect (Fireball, 3/day)"
 * @param {Array<{key: string, name?: string, traits?: string}>} [catalogue]
 * @returns {string[]} in their printed spelling, or [] for a rune not known
 */
export function runeSchoolAndTradition(entry, catalogue = knownRunes()) {
  const key = parseRunes(entry)[0]?.key ?? "";
  if (!key) return [];
  const rune = (catalogue ?? []).find((r) => normaliseRune(r?.key) === key || normaliseRune(r?.name) === key);
  if (!rune) return [];
  const out = [];
  for (const trait of splitTraits(rune.traits)) {
    const printed = SCHOOL_AND_TRADITION.find((t) => t.toLowerCase() === trait.toLowerCase());
    if (printed && !out.includes(printed)) out.push(printed);
  }
  return out;
}

/**
 * The stone's traits once its rune changes: the last rune's traits taken
 * away, the new rune's added. A trait the stone carried before any rune
 * (Magical) or that a GM typed is left where it is.
 *
 * @param {string} current the stone's traits now
 * @param {string[]} previous what the last rune gave it
 * @param {string[]} next what this rune gives it
 * @returns {string}
 */
export function runestoneTraits(current, previous = [], next = []) {
  const gone = new Set((previous ?? []).map((t) => String(t).toLowerCase()));
  const kept = splitTraits(current).filter((t) => !gone.has(t.toLowerCase()));
  for (const trait of next ?? []) {
    if (!kept.some((t) => t.toLowerCase() === String(trait).toLowerCase())) kept.push(trait);
  }
  return kept.join(", ");
}

/**
 * The update a runestone needs for the rune field it is about to carry, or
 * null when it is not a runestone or nothing about its traits changes.
 *
 * @param {object} item the stone (its current state)
 * @param {string} runes the field as it will be
 * @param {string} [traitsNow] the traits as they will be, when the same
 *   change sets them
 * @returns {{traits: string, added: string[]}|null}
 */
export function runestoneTraitsUpdate(item, runes, traitsNow = undefined) {
  if (item?.type !== "gear" || !isRunestone(item)) return null;
  const previous = Array.isArray(item?.flags?.["trg-prime"]?.[RUNESTONE_TRAITS_FLAG])
    ? item.flags["trg-prime"][RUNESTONE_TRAITS_FLAG].map(String)
    : [];
  const entry = splitRuneEntries(runes)[0] ?? "";
  const added = entry ? runeSchoolAndTradition(entry) : [];
  const current = traitsNow ?? item?.system?.traits ?? "";
  const traits = runestoneTraits(current, previous, added);
  if (traits === current && JSON.stringify(previous) === JSON.stringify(added)) return null;
  return { traits, added };
}
