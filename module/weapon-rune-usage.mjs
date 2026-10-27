/**
 * WHAT A WEAPON RUNE MAY BE INSCRIBED ON, and who a conditional rune
 * reaches (3.618.0, block 37's B9, B10 and B12; Graham's R12).
 *
 * Every weapon rune prints a Usage line. Most say "any weapon"; seven do
 * not:
 *
 *   Disrupting, Ghost Touch, Shifting, Vicious   any melee weapon
 *   Life Stealing                                any slashing melee weapon
 *   Razor        any piercing or slashing melee weapon which has the Keen trait
 *   Returning                                    thrown weapon
 *
 * And ammunition: "any rune which can be applied to a missile weapon may
 * also be applied to ammunition unless stated otherwise" — so a batch of
 * arrows takes none of the seven.
 *
 * NOTHING CHECKED ANY OF IT. The chooser offered all eighteen runes for every
 * weapon and for ammunition, and a Razor on a club cut like a keen blade.
 * Now the chooser marks what will not take, and a rune on a weapon it does not
 * fit is SUPPRESSED — it does nothing, and the item says why. That is the
 * page's own word for a Shifting weapon's rune that "cannot be applied to the
 * new form": suppressed until it returns to its original form.
 *
 * Pure; no Foundry.
 */

import { traitList } from "./traits.mjs";
import { creatureTraits } from "./creature-traits.mjs";
import { registeredRune } from "./module-api.mjs";

/** The seven printed usage lines, as rules. */
export const RUNE_USAGE = Object.freeze({
  disrupting: { melee: true, text: "any melee weapon" },
  ghostTouch: { melee: true, text: "any melee weapon" },
  shifting: { melee: true, text: "any melee weapon" },
  vicious: { melee: true, text: "any melee weapon" },
  lifeStealing: { melee: true, damage: ["slashing"], text: "any slashing melee weapon" },
  razor: { melee: true, damage: ["piercing", "slashing"], keen: true, text: "any piercing or slashing melee weapon which has the Keen trait" },
  returning: { thrown: true, text: "a thrown weapon" }
});

const TYPE_LETTERS = Object.freeze({ b: "bludgeoning", p: "piercing", s: "slashing" });

/** A damage type, from a word or the book's one-letter abbreviation. */
function damageTypeWord(value) {
  const word = String(value ?? "").trim().toLowerCase();
  return TYPE_LETTERS[word] ?? word;
}

/**
 * What a weapon is, for its runes: melee or not, thrown or not, keen or
 * not, and every damage type it can deal (Versatile adds one).
 *
 * @param {object} system the weapon's system data, or an ammunition's
 * @param {{ammunition?: boolean}} [options]
 */
export function weaponUsage(system, { ammunition = false } = {}) {
  if (ammunition) return { ammunition: true, melee: false, thrown: false, keen: false, damageTypes: [] };
  const traits = traitList(system?.traits);
  const mode = String(system?.attackMode ?? "melee").trim().toLowerCase();
  const types = new Set([damageTypeWord(system?.damageType)].filter(Boolean));
  for (const trait of traits) {
    const versatile = /^versatile\s+([bps])$/.exec(trait);
    if (versatile) types.add(TYPE_LETTERS[versatile[1]]);
  }
  return {
    ammunition: false,
    // A missile weapon is the one kind that is not melee; a thrown dagger
    // is still a melee weapon that can also be thrown.
    melee: mode !== "missile",
    thrown: mode === "thrown" || traits.some((trait) => /^thrown\b/.test(trait)),
    keen: traits.includes("keen"),
    damageTypes: [...types]
  };
}

/**
 * May this rune work on this weapon?
 *
 * @param {string} key the rune key
 * @param {object} usage from weaponUsage
 * @returns {{ok: boolean, reason: string}}
 */
export function runeUsageAllows(key, usage) {
  // A MODULE'S RUNE PRINTS ITS OWN (3.673.0): `usage` on registerRunes.
  const rule = RUNE_USAGE[key] ?? registeredRune(key)?.usage ?? null;
  if (!rule) return { ok: true, reason: "" };
  const no = (why) => ({ ok: false, reason: `needs ${rule.text}${why ? ` — ${why}` : ""}` });
  if (usage?.ammunition) return no("ammunition takes only what a missile weapon does");
  if (rule.melee && !usage?.melee) return no("this is not a melee weapon");
  // "ANY RANGED WEAPON" (Tranquil Quiver): a missile weapon. A thrown melee
  // weapon is still a melee weapon (see `weaponUsage`).
  if (rule.ranged && usage?.melee) return no("this is not a ranged weapon");
  if (rule.thrown && !usage?.thrown) return no("this is not a thrown weapon");
  if (rule.damage && !rule.damage.some((type) => (usage?.damageTypes ?? []).includes(type))) {
    return no(`this deals ${(usage?.damageTypes ?? []).join(" or ") || "no listed damage type"}`);
  }
  if (rule.keen && !usage?.keen) return no("this has no Keen trait");
  return { ok: true, reason: "" };
}

/** The runes on a field that this weapon suppresses, as problem lines. */
export function suppressedRuneProblems(runeKeys = [], usage, labelOf = (key) => key) {
  const out = [];
  for (const key of runeKeys) {
    const allowed = runeUsageAllows(key, usage);
    if (!allowed.ok) out.push(`${labelOf(key)} ${allowed.reason}, so it is suppressed.`);
  }
  return out;
}

/**
 * BANE (R12): "the crafter chooses a specific race of creatures (canines,
 * dragons, elves, spiders etc)", read as a creature trait — which is where
 * a creature's kind lives (its type implies the trait). The page writes
 * the choice in the plural, so "dragons" matches a Dragon and "elves" an
 * Elf.
 *
 * @param {string} parameter what was written in the brackets
 * @param {object} targetSystem
 * @returns {boolean}
 */
export function baneMatches(parameter, targetSystem) {
  const word = String(parameter ?? "").trim().toLowerCase();
  if (!word) return false;
  const forms = new Set([word]);
  if (word.endsWith("ves")) forms.add(`${word.slice(0, -3)}f`);
  if (word.endsWith("ies")) forms.add(`${word.slice(0, -3)}y`);
  if (word.endsWith("es")) forms.add(word.slice(0, -2));
  if (word.endsWith("s")) forms.add(word.slice(0, -1));
  const traits = creatureTraits(targetSystem);
  return traits.some((trait) => forms.has(trait));
}
