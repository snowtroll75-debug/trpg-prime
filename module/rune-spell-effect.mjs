/**
 * The Spell Effect rune (Chapter 11, group 4) — the last one, and the
 * only rune in the chapter with no tiers at all.
 *
 * "This rune has a unique formula for each spell and must be learnt
 * separately. The level of the rune is determined by the PP of the
 * spell. The inscribed spell may be cast 1/day."
 *
 * So this rune is not a tier you pick, it is a SPELL you pick, and the
 * chapter prices it off a table of its own — two tables, in fact: the
 * weapon table is cheaper than the armour one at every row. Then:
 *
 *   "Enhancement: You may allow the spell to be cast '3/day' by
 *    increasing its level by 1, 'At Will' by increasing the level of the
 *    rune by 2 or be cast 'Constant' by increasing the level of the rune
 *    by 4."
 *
 * THE ENHANCEMENT MOVES THE LEVEL, AND THE PRICE FOLLOWS IT. The tables
 * are level-to-price ladders that the PP cost merely indexes into, so
 * "increasing its level by 1" means reading the next row down — a PP 4
 * spell on armour is level 5 at 1,250 gp, and at 3/day it is level 6 at
 * 2,000 gp. Nothing else in the chapter prices a level increase any
 * other way.
 *
 * PAST THE END OF THE TABLE. A PP 18 spell made Constant is level 23,
 * and both tables stop at 21. The ladder is continued rather than
 * clamped — clamping would silently make the most expensive thing in the
 * chapter cheap — using the tables' own late growth and rounded to two
 * significant figures, which is how every printed price above 1,000 gp
 * is written. Anything priced that way is flagged `extrapolated`, so the
 * number is never passed off as the book's.
 */

import { parseRunes } from "./runes.mjs";
import { runeKindOf } from "./rune-bearing.mjs";
import {
  SPELL_EFFECT_ENHANCEMENTS, spellEffectRune, spellTableFor
} from "./magic-item-tables.mjs";

/**
 * The four frequencies, and what each costs in rune levels.
 *
 * THE LEVEL INCREASES ARE READ OUT OF `SPELL_EFFECT_ENHANCEMENTS`, not
 * retyped here. That table and the two spell tables have been in
 * magic-item-tables.mjs since the rune work began, diffed against the
 * document by harness section G — and until 3.246.0 nothing but the
 * harness ever called them. Fourteen green checks on a function with no
 * caller, which is exactly the 3.235.4 defect that section O exists to
 * prevent, found again by going to wire the rune up.
 *
 * `usesPerDay` is the string the innate-spell machinery already reads
 * (uses.mjs), so a granted spell needs no special casing to know it may
 * be cast three times — it is the same field a feat uses.
 */
export const FREQUENCIES = Object.freeze([
  { key: "daily", label: "1/day", levels: SPELL_EFFECT_ENHANCEMENTS["1/day"], usesPerDay: "1" },
  { key: "thrice", label: "3/day", levels: SPELL_EFFECT_ENHANCEMENTS["3/day"], usesPerDay: "3" },
  { key: "atWill", label: "At Will", levels: SPELL_EFFECT_ENHANCEMENTS["at will"], usesPerDay: "unlimited" },
  { key: "constant", label: "Constant", levels: SPELL_EFFECT_ENHANCEMENTS.constant, usesPerDay: "unlimited", constant: true },
  // A FOCUS USE (3.626.0): one cast, "expended and may be restored through
  // Refocus" — Pillars of Faith's Lantern of the Veil. Priced as 1/day;
  // the granted spell carries the Focus trait so Refocus finds it.
  { key: "focus", label: "Focus", levels: SPELL_EFFECT_ENHANCEMENTS["1/day"], usesPerDay: "1", focus: true }
]);

/** The default, and the one the rune has if nothing is chosen. */
export const DEFAULT_FREQUENCY = "daily";

/** A frequency by key or by its printed label, however it was written. */
export function frequencyFor(name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return FREQUENCIES[0];
  return FREQUENCIES.find((f) => f.key.toLowerCase() === wanted)
    ?? FREQUENCIES.find((f) => f.label.toLowerCase() === wanted)
    ?? FREQUENCIES[0];
}

/**
 * What one Spell Effect rune is: its level, its price, and how often it
 * may be cast.
 *
 * `ppCost` is the spell's own PP cost, which is where the whole
 * calculation starts — a rune with no spell chosen has no level and no
 * price, and says so rather than pricing at zero.
 *
 * @param {string} kind "weapon" or "armour"
 * @param {object} options
 * @param {number|null} options.ppCost The spell's PP cost.
 * @param {string} options.frequency A frequency key or label.
 * @returns {{level:number, price:number, extrapolated:boolean,
 *   frequency:object, usesPerDay:string, constant:boolean, problems:string[]}}
 */
export function spellEffectFor(kind, { ppCost = null, frequency = DEFAULT_FREQUENCY } = {}) {
  const table = spellTableFor(kind);
  const freq = frequencyFor(frequency);
  const problems = [];

  if (ppCost === null || ppCost === undefined || !Number.isFinite(Number(ppCost))) {
    return {
      level: 0, price: 0, extrapolated: false, frequency: freq,
      usesPerDay: freq.usesPerDay, constant: Boolean(freq.constant),
      problems: ["Spell Effect needs a spell chosen before it can be priced."]
    };
  }

  const pp = Math.max(0, Math.floor(Number(ppCost)));
  // The arithmetic itself belongs to the table module, which is where
  // the tables and the enhancement steps are diffed against the
  // document. This layer only turns a UI's frequency key into the
  // frequency label that module already understands.
  const priced = spellEffectRune(kind, pp, freq.label);
  if (!priced) {
    return {
      level: 0, price: 0, extrapolated: false, frequency: freq,
      usesPerDay: freq.usesPerDay, constant: Boolean(freq.constant),
      problems: [
        `A PP ${pp} spell is past the end of the spell table, which stops at PP ${table.length - 1}.`
      ]
    };
  }
  if (priced.extrapolated) {
    problems.push(
      `Level ${priced.level} is past the printed table, which ends at ${table.length}; the price is extrapolated from the table's own growth.`);
  }

  return {
    level: priced.level, price: priced.price, extrapolated: priced.extrapolated,
    frequency: freq, usesPerDay: freq.usesPerDay,
    constant: Boolean(freq.constant), problems
  };
}

/**
 * The rune's parameter, as the runes field holds it: "Fireball, 3/day".
 *
 * The existing rune field already carries a parenthesised parameter —
 * "Energy Resistance I (fire)" — so this reuses that slot rather than
 * inventing a second place for a rune to keep something.
 */
export function formatSpellEffect({ spell = "", frequency = DEFAULT_FREQUENCY } = {}) {
  const name = String(spell ?? "").trim();
  if (!name) return "";
  return `${name}, ${frequencyFor(frequency).label}`;
}

/** And back: "Fireball, 3/day" -> {spell, frequency}. */
export function parseSpellEffect(parameter) {
  const text = String(parameter ?? "").trim();
  if (!text) return { spell: "", frequency: DEFAULT_FREQUENCY };
  // Split on the LAST comma: a spell name may contain one and a
  // frequency never does.
  const cut = text.lastIndexOf(",");
  if (cut < 0) return { spell: text, frequency: DEFAULT_FREQUENCY };
  const tail = text.slice(cut + 1).trim();
  const known = FREQUENCIES.find((f) => f.label.toLowerCase() === tail.toLowerCase());
  if (!known) return { spell: text, frequency: DEFAULT_FREQUENCY };
  return { spell: text.slice(0, cut).trim(), frequency: known.key };
}

/**
 * The Spell Effect runes inscribed on one item.
 *
 * Read from the field directly rather than through the rune catalogue,
 * because this is the one rune whose parameter is the whole point: an
 * entry with no spell named is not a rune, it is an unfinished one.
 */
export function spellEffectRunesOf(item) {
  // RUNED CLOTHING READS AS ARMOUR (3.615.0, B7 of block 36), as it does
  // for every other rune — `item.type` is "gear" for Traveller's clothing.
  const kind = runeKindOf(item) ?? item?.type;
  if (!["weapon", "armour"].includes(kind)) return [];
  const field = String(item?.system?.runes ?? "");
  const out = [];
  for (const entry of parseRunes(field)) {
    if (!/^spell\s*effect$/i.test(String(entry.label ?? "").trim())) continue;
    const parameter = /Spell\s*Effect[^,(]*\(([^)]*)\)/i.exec(field)?.[1] ?? "";
    const { spell, frequency } = parseSpellEffect(parameter);
    if (!spell) continue;
    out.push({ key: "spellEffect", spell, frequency, kind });
  }
  return out;
}
