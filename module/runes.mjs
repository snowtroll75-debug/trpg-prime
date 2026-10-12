/**
 * Runes (Chapter 11) — the fourth axis on a weapon, armour or shield.
 *
 * Graham's ruling (2026-08-10): runes are a FIELD on the item, beside
 * quality and material, not separate documents. That is not merely
 * convenient — it is the shape the chapter describes. A rune is
 * "inscribed onto" an item, an item "can never have two runes of the
 * same type and can only have one Potency Rune", and the item's own
 * level and price are the sum of everything inscribed on it. All three
 * of those are statements about ONE object, and modelling them as two
 * documents would mean keeping a parent and its children in step for no
 * gain.
 *
 * WHAT ALREADY EXISTS AND IS REUSED. `computeArmourModifiers`,
 * `computeShieldModifiers` and `computeItemPrice` in item-quality.mjs
 * already turn a quality, a material and a list of superior traits into
 * modifiers and a price. Runes are the same operation with a different
 * table, so this file is deliberately shaped like those (lesson 13) —
 * `computeRuneModifiers` returns the same kind of aggregate, and the
 * price work goes through the same cost tables the chapter prints.
 *
 * WHAT A RUNE IS, AS DATA. A name and a tier — `{ rune: "energyResistance",
 * tier: 2 }` — because almost every printed rune has tiers I to IV or VI
 * and the tier is what carries the level, the price and the size of the
 * effect. A rune with a single printed entry is tier 1.
 */

import { suppressedRuneProblems } from "./weapon-rune-usage.mjs";
import {
  ARMOUR_POTENCY, SHIELD_POTENCY, WEAPON_POTENCY,
  itemLevelForPrice, runeRestrictions
} from "./magic-item-tables.mjs";

/** The potency ladder for a kind of item. */
export function potencyLadder(kind) {
  switch (String(kind ?? "").toLowerCase()) {
    case "armour": return ARMOUR_POTENCY;
    case "shield": return SHIELD_POTENCY;
    case "weapon": return WEAPON_POTENCY;
    default: return [];
  }
}

/** One potency tier's printed row, or null. */
export function potencyTier(kind, numeral) {
  const wanted = Math.floor(Number(numeral) || 0);
  return potencyLadder(kind).find((row) => row.numeral === wanted) ?? null;
}

/**
 * Parse the `runes` field into entries.
 *
 * The field is free text on the item — "potency II, energy resistance I,
 * shadow III" — for the same reason `superiorTraits` is: it is a list a
 * GM types or a builder writes, and a structured editor for it is a
 * bigger piece of UI than the rule deserves. Roman numerals or arabic
 * both work, and a bare name is tier 1.
 *
 * Returns `{ key, label, tier }` per entry, deduplicated by key with the
 * HIGHEST tier winning — "an item can never have two runes of the same
 * type", so two entries naming one rune is a data error and taking the
 * better of them is the reading that cannot make an item worse than the
 * text on it says.
 */
const ROMAN = Object.freeze({ i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 });

export function parseRunes(field) {
  // A RUNE'S PARAMETER IS STRIPPED BEFORE THE FIELD IS SPLIT, because it
  // is not a rune and may contain the separator. Found live at 3.246.0:
  // "Potency I, Spell Effect (Fireball, 3/day)" split into THREE
  // entries, one of them a phantom rune called "3/day)" that counted
  // against the item's additional-rune allowance. The same bug was
  // already sitting in the chapter's own Elven Chainmail — "Shadow I
  // (Stealth +5)" normalised to `shadowistealth5` and matched nothing —
  // it simply had no comma, so nothing had made it visible.
  //
  // The strip lives HERE rather than in each caller: `fieldToRunes` had
  // its own copy, which is why the rune chooser read the field correctly
  // while the sheet and the derivation did not.
  const raw = String(field ?? "")
    .replace(/\s*\([^)]*\)/g, "")
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
  const byKey = new Map();
  for (const part of raw) {
    const match = /^(.*?)[\s]*(\b[ivx]+\b|\b\d+\b)?$/i.exec(part);
    const label = String(match?.[1] ?? part).trim();
    if (!label) continue;
    const suffix = String(match?.[2] ?? "").trim().toLowerCase();
    const tier = suffix
      ? (ROMAN[suffix] ?? Math.max(1, Math.floor(Number(suffix) || 1)))
      : 1;
    const key = normaliseRune(label);
    const existing = byKey.get(key);
    if (!existing || tier > existing.tier) byKey.set(key, { key, label, tier });
  }
  return Array.from(byKey.values());
}

export function normaliseRune(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Is this the potency rune? Named several ways across the chapter. */
export function isPotency(key) {
  const k = normaliseRune(key);
  return k === "potency" || k === "armourpotency" || k === "shieldpotency"
    || k === "weaponpotency" || k === "armourshieldpotency";
}

/**
 * What an item's runes actually do to it.
 *
 * `exempt` NAMES RUNES THAT ARE NOT ETCHED (Graham's ruling, 18 Aug 2026).
 *
 * Both restrictions below are rules about ETCHING — buying a rune and
 * having it inscribed on an item at an anvil. A Crusader's Blade Ally is
 * not that: a spirit of the deity inhabits the weapon for a day and
 * leaves at the next daily preparation, and the character pays nothing
 * and etches nothing. So the divine rune must not need a potency rune
 * beneath it (a 4th-level Crusader swinging an ordinary axe is the
 * ordinary case, and requiring potency would make the feature unusable),
 * and it must not eat the weapon's additional-rune allowance.
 *
 * It is scoped as an OPT-IN LIST rather than a flag on the rune itself,
 * because the same rune can be present both ways: a Crusader may imbue
 * Courageous onto a sword that already carries a bought Courageous, and
 * only one of them is a divine loan.
 *
 * WHAT IT DOES NOT DO IS CHANGE WHAT THE RUNE IS WORTH. An exempt rune
 * still appears in `others`, still deals its damage and still grants its
 * bonus — Chapter 11's arithmetic is untouched. The exemption is only
 * about the two ownership rules.
 *
 * @param {object} options
 * @param {string} options.kind armour | shield | weapon
 * @param {string} options.runes the item's `runes` field
 * @param {string} options.quality the item's own quality
 * @param {string[]} [options.exempt] rune names not counted as etched
 * @returns {{potency: object|null, others: object[], db: number, hp: number,
 *   attack: number, price: number, valid: boolean, problems: string[]}}
 */
/** Weapon potency's hit points per tier (R8: +5 a tier, as armour's). */
export const WEAPON_POTENCY_HP_PER_TIER = 5;

export function computeRuneModifiers({ kind, runes, quality, exempt = [], usage = null } = {}) {
  const entries = parseRunes(runes);
  const limits = runeRestrictions(kind, quality);
  const problems = [];

  const spared = new Set(
    (Array.isArray(exempt) ? exempt : [exempt])
      .map((name) => normaliseRune(name))
      .filter(Boolean)
  );

  const potencyEntry = entries.find((e) => isPotency(e.key)) ?? null;
  const others = entries.filter((e) => !isPotency(e.key));
  // The two restriction tests below count ETCHED runes only. Kept as its
  // own list rather than filtered out of `others`, so the caller still
  // sees every rune the item carries.
  const etched = others.filter((e) => !spared.has(e.key));

  let potency = null;
  if (potencyEntry) {
    // THE LADDER'S TOP IS A CAP TOO (3.615.0, Graham's R1 of block 36). The
    // restriction table lets a Master shield take Potency V and a Legendary
    // one VI, but the shield's own table stops at IV — so a shield marked V
    // or VI is a Potency IV shield, not a shield with no potency at all,
    // which is what reading a missing row used to make it.
    const ladderTop = Math.max(0, ...potencyLadder(kind).map((row) => row.numeral));
    const ceiling = ladderTop ? Math.min(limits.maxPotency, ladderTop) : limits.maxPotency;
    const capped = Math.min(potencyEntry.tier, ceiling);
    if (capped !== potencyEntry.tier) {
      problems.push(
        `${quality || "Normal"}-quality ${kind} takes a Potency ${roman(ceiling)} at most — ` +
        `Potency ${roman(potencyEntry.tier)} is being treated as ${roman(capped)}.`
      );
    }
    potency = potencyTier(kind, capped);
    if (!potency) {
      problems.push(`Potency ${roman(potencyEntry.tier)} is not a printed tier for a ${kind}.`);
    }
  }

  // "All enchanted armour and shields must first be imbued with a
  // potency rune. The potency rune imbues the item with magic, provides
  // it with a bonus and ALLOWS OTHER RUNES TO BE ETCHED UPON IT."
  // Reported, not enforced — a GM may be mid-build, and blanking the
  // other runes would delete work rather than describe a problem.
  if (etched.length && !potency) {
    problems.push(
      `${etched.length} rune${etched.length === 1 ? "" : "s"} inscribed with no potency rune — ` +
      "an item must carry a potency rune before other runes can be etched onto it."
    );
  }
  if (etched.length > limits.additionalRunes) {
    problems.push(
      `${quality || "Normal"}-quality ${kind} takes ${limits.additionalRunes} additional ` +
      `rune${limits.additionalRunes === 1 ? "" : "s"}; ${etched.length} are inscribed.`
    );
  }

  // A RUNE THE WEAPON CANNOT TAKE IS SUPPRESSED (3.618.0, B10 of block 37):
  // "If a specific quality or rune cannot be applied to the new form, it is
  // suppressed". Reported here, where every other limit is; the rune's own
  // reader asks `runeUsageAllows` and does nothing.
  if (kind === "weapon" && usage) {
    problems.push(...suppressedRuneProblems(others.map((e) => e.key), usage,
      (key) => others.find((e) => e.key === key)?.label ?? key));
  }

  // WEAPON POTENCY'S DAMAGE AND HIT POINTS (3.618.0, Graham's R7 and R8 of
  // block 37): "increases the weapons item bonus to attack and increases its
  // hit points. The weapon also inflicts an additional point of damage per
  // level of potency." The ladder lives in the cost table and prints neither,
  // so they are read off the tier: +1 damage a tier, and +5 HP a tier as
  // armour's (R8). Armour and shields carry their own in the table.
  const weaponTier = kind === "weapon" ? Number(potency?.numeral) || 0 : 0;
  return {
    potency,
    others,
    db: Number(potency?.db) || 0,
    hp: kind === "weapon" ? WEAPON_POTENCY_HP_PER_TIER * weaponTier : Number(potency?.hp) || 0,
    damage: weaponTier,
    attack: Number(potency?.bonus) || 0,
    price: Number(potency?.price) || 0,
    valid: problems.length === 0,
    problems
  };
}

/**
 * A shield's whole DB bonus: its own, plus what its potency rune adds
 * (3.615.0, R2 of block 36). "The bonus provided by a shield increases the
 * existing shield DB bonus" — so potency on a shield is part of the SHIELD
 * bonus, stands and falls with it, and is what Benevolent and Disarm Block
 * mean by "the shield's bonus".
 * @param {object} system the shield's (derived) system data
 */
export function shieldDefenceWithPotency(system) {
  return (Number(system?.defenceBonus ?? 0) || 0) + (Number(system?.runeDefenceBonus ?? 0) || 0);
}

/** 1 -> "I". Only ever called with 1-6. */
export function roman(value) {
  return ["", "I", "II", "III", "IV", "V", "VI"][Math.max(0, Math.min(6, Math.floor(Number(value) || 0)))];
}

/**
 * The Customise panel's one-line summary of an item's potency rune.
 *
 * PURE, AND HERE RATHER THAN ON THE SHEET, because the sheet had it
 * wrong and nothing could tell. `computeRuneModifiers` returns the tier
 * as a NUMERAL STRING — `{ tier: "I", numeral: 1 }` — and the sheet was
 * passing that string through `roman()`, which takes a number and
 * answers "" for anything else. Every potency rune in every world
 * printed "Potency: — +1 to attack", numeral missing, and the only
 * reason it was ever noticed is that a live run happened to look at that
 * panel for something else.
 *
 * @param {object|null} runeModifiers the item's derived rune data
 * @param {object} [options]
 * @param {boolean} [options.isWeapon] weapons show attack; everything
 *   else shows DB and HP.
 * @returns {string}
 */
export function potencySummary(runeModifiers, { isWeapon = false } = {}) {
  const potency = runeModifiers?.potency;
  if (!potency) return "none";
  const effect = isWeapon
    ? `+${Number(runeModifiers?.attack ?? 0)} to attack`
    : `+${Number(runeModifiers?.db ?? 0)} DB, +${Number(runeModifiers?.hp ?? 0)} HP`;
  // The tier as the book prints it. `numeral` is the number, `tier` is
  // already the numeral, and converting one into the other twice is what
  // went wrong the first time — so this reads the numeral and converts
  // it once, and a tier that has drifted from its numeral shows up as a
  // mismatch rather than as an empty string.
  return `${roman(potency.numeral)} — ${effect}`;
}
