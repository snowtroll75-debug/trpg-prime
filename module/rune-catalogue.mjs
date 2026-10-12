/**
 * The rune catalogue, as a chooser needs it (Chapter 11).
 *
 * WHY THIS EXISTS. Until 3.241.0 an item's runes were a free-text field:
 * you typed "Potency II, Flaming I" and hoped. Nothing offered you the
 * list, nothing priced what you chose, and nothing told you a standard
 * weapon cannot take a Potency II. Graham's summary was fair — "they are
 * typed on manually so I doubt they do anything".
 *
 * This module turns the rune DATA (armour-rune-data.mjs and its weapon
 * twin, which are the hand-typed half of the document diff) into the
 * thing a dialog can render: every rune that may go on this kind of
 * item, every tier it comes in, what each tier costs, and which of them
 * the item's quality actually allows.
 *
 * A RUNE MAY CARRY A PARAMETER. Energy Resistance is against one energy
 * type, Aligned is one alignment, Bane is one kind of creature — the
 * chapter has the crafter choose when the rune is inscribed. Those are
 * written into the field in brackets ("Energy Resistance II (fire)"),
 * which is exactly how the chapter prints Elven Chainmail's
 * "Shadow I (Stealth +5)", so the notation is the book's rather than
 * mine.
 */

import { ARMOUR_RUNES } from "./armour-rune-data.mjs";
import { WEAPON_RUNES } from "./weapon-rune-data.mjs";
import { CODEX_ARMOUR_RUNES, CODEX_WEAPON_RUNES } from "./codex-rune-data.mjs";
import { registeredRunes } from "./module-api.mjs";
import {
  ARMOUR_POTENCY, SHIELD_POTENCY, WEAPON_POTENCY, runeRestrictions
} from "./magic-item-tables.mjs";
import { isPotency, normaliseRune, parseRunes, roman } from "./runes.mjs";
import { parseSpellEffect, spellEffectFor } from "./rune-spell-effect.mjs";

/** The parameters a rune asks the crafter to choose, if any. */
export const RUNE_PARAMETERS = Object.freeze({
  // Spell Effect's parameter is not a word from a short list — it is a
  // spell out of the compendium and a frequency, and the two together
  // are what the rune costs and what level it is. `spell: true` is how
  // the dialog knows to render two controls rather than one, and how
  // the pricing knows to go to the spell table rather than a tier.
  spellEffect: {
    label: "Spell and frequency",
    choices: [],
    spell: true
  },
  // ONE TYPE PER TIER (3.615.0, A3 of block 36): "Energy Resistance II …
  // against two element types", III three, IV four. `perTier` is how the
  // dialog knows to offer ticks rather than one select, and how the
  // effect knows how many of the ticks to honour.
  energyResistance: {
    label: "Energy type",
    choices: ["acid", "cold", "electricity", "fire", "sonic"],
    perTier: true
  },
  aligned: {
    label: "Aligned trait",
    choices: ["chaos", "evil", "good", "order"]
  },
  bane: {
    label: "Creature kind",
    choices: []   // free text: "canines, dragons, elves, spiders" is the book's own list of examples
  }
});

/**
 * The types a per-tier parameter names ("fire, cold"), lower-cased, known
 * ones only, each once — and how many the tier allows.
 * @param {string} key the rune key
 * @param {string} parameter the bracketed text
 * @param {number} tier
 * @returns {{types: string[], allowed: number, unknown: string[]}}
 */
export function perTierChoices(key, parameter, tier) {
  const spec = RUNE_PARAMETERS[key];
  const allowed = Math.max(1, Math.floor(Number(tier) || 1));
  const words = String(parameter ?? "").split(/[,/]|\band\b/i).map((w) => w.trim().toLowerCase()).filter(Boolean);
  const types = [];
  const unknown = [];
  for (const word of words) {
    if (!(spec?.choices ?? []).includes(word)) { unknown.push(word); continue; }
    if (!types.includes(word)) types.push(word);
  }
  return { types, allowed, unknown };
}

/** The potency ladder for a kind of item. */
function potencyLadderFor(kind) {
  if (kind === "weapon") return WEAPON_POTENCY;
  if (kind === "shield") return SHIELD_POTENCY;
  return ARMOUR_POTENCY;
}

/**
 * Every rune that may be inscribed on this kind of item, with its tiers.
 *
 * Potency is expanded from the cost tables rather than from the rune's
 * own entry, because that is where its ladder lives — and a shield's
 * ladder is not an armour's.
 */
export function runesFor(kind) {
  const key = String(kind ?? "").trim().toLowerCase();
  // TWO DOCUMENTS, ONE LIST. The Creature Codex adds runes to the same
  // items Chapter 11's go on — "these weapon runes expand upon those
  // found in the core rulebook" — so a chooser that showed only one
  // book's would be a chooser that lies about what may be inscribed.
  // They stay in separate SOURCE arrays (each is diffed against its own
  // transcription) and meet here, where the question is what fits on an
  // item rather than which book it came from. Chapter 11 first, so an
  // existing item's runes appear where they always have.
  // AND A COMPANION MODULE'S (3.626.0). Pillars of Faith's Chapter 11
  // "follow the normal rune rules in the Core Rulebook": its runes go on
  // the same items, so they are inscribed, parsed and priced through the
  // same list. Registered last, so the books' order holds.
  const source = key === "weapon"
    ? [...WEAPON_RUNES, ...CODEX_WEAPON_RUNES, ...registeredRunes()]
    : [...ARMOUR_RUNES, ...CODEX_ARMOUR_RUNES, ...registeredRunes()];
  const out = [];

  for (const rune of source) {
    if (!rune.on.includes(key)) continue;

    if (isPotency(rune.key)) {
      out.push({
        key: "potency",
        name: "Potency",
        parameter: null,
        tiers: potencyLadderFor(key).map((tier) => ({
          tier: tier.tier,
          numeral: tier.numeral,
          level: tier.level,
          price: tier.price
        })),
        effect: rune.effect,
        potency: true,
        spell: false
      });
      continue;
    }

    // SPELL EFFECT HAS NO TIERS. It is priced from the spell it carries
    // and the frequency chosen for it, so it is offered as a single
    // yes/no with a spell picker beside it, and its price is nothing
    // until a spell is named. Until 3.246.0 it was skipped here
    // entirely, which meant the one rune the chapter says "must be
    // learnt separately" could not be chosen at all.
    if (rune.tiers === null) {
      out.push({
        key: rune.key,
        name: rune.name,
        parameter: RUNE_PARAMETERS[rune.key] ?? null,
        tiers: [{ tier: "I", numeral: 1, level: 0, price: 0 }],
        effect: rune.effect,
        potency: false,
        spell: true
      });
      continue;
    }

    const tiers = (rune.tiers ?? [{ tier: "I", level: rune.level, price: rune.price }])
      .map((tier, index) => ({
        tier: tier.tier ?? "I",
        numeral: index + 1,
        level: tier.level,
        // Arrow Catching is the only rune with two prices — one for
        // armour, one for a shield — because it is the only one that
        // goes on either.
        price: tier.price ?? (key === "shield" ? rune.shieldPrice : rune.armourPrice) ?? 0
      }));

    out.push({
      key: rune.key,
      name: rune.name,
      parameter: RUNE_PARAMETERS[rune.key] ?? null,
      tiers,
      effect: rune.effect,
      potency: false,
      spell: false
    });
  }
  return out;
}

/** One rune's price at a tier, on a kind of item. */
export function runePrice(kind, runeKey, tierNumeral) {
  const rune = runesFor(kind).find((r) => r.key === normaliseRune(runeKey) || r.key === runeKey);
  if (!rune) return 0;
  const tier = rune.tiers.find((t) => t.numeral === Math.max(1, Math.floor(Number(tierNumeral) || 1)));
  return Number(tier?.price ?? 0);
}

/**
 * A selection of runes, as the dialog holds it, rendered back into the
 * field the derivation reads.
 *
 * `[{key, tier, parameter}]` -> `"Potency II, Energy Resistance I (fire)"`.
 * Potency first, because the chapter requires it before anything else
 * and a reader should see it first.
 */
export function runesToField(kind, selection = []) {
  const catalogue = runesFor(kind);
  const named = (selection ?? [])
    .map((entry) => {
      const rune = catalogue.find((r) => r.key === entry.key);
      if (!rune) return null;
      const tier = Math.max(1, Math.floor(Number(entry.tier) || 1));
      const numeral = rune.tiers.length > 1 || rune.potency ? ` ${roman(tier)}` : "";
      const parameter = entry.parameter ? ` (${String(entry.parameter).trim()})` : "";
      return { potency: rune.potency, text: `${rune.name}${numeral}${parameter}` };
    })
    .filter(Boolean);
  return [
    ...named.filter((n) => n.potency),
    ...named.filter((n) => !n.potency)
  ].map((n) => n.text).join(", ");
}

/** And back again, so the dialog can open on what the item already has. */
export function fieldToRunes(kind, field) {
  const catalogue = runesFor(kind);
  // The parameter is stripped by parseRunes itself (see runes.mjs) —
  // this used to carry its own copy, and the copy was the reason the
  // chooser read a comma'd parameter correctly while nothing else did.
  return parseRunes(String(field ?? ""))
    .map((entry) => {
      const rune = catalogue.find((r) => r.key === normaliseRune(entry.label)
        || normaliseRune(r.name) === normaliseRune(entry.label));
      if (!rune) return null;
      const parameter = new RegExp(`${rune.name}[^,(]*\\(([^)]*)\\)`, "i")
        .exec(String(field ?? ""))?.[1] ?? "";
      return { key: rune.key, tier: entry.tier, parameter: parameter.trim() };
    })
    .filter(Boolean);
}

/**
 * What a selection costs, and what it is allowed to be.
 *
 * The price is the sum of the chosen tiers. The problems are the
 * chapter's own limits — a potency above what the quality allows, more
 * additional runes than it allows, other runes with no potency to hang
 * on — REPORTED, because the dialog shows them live as you choose and
 * refusing a click is a worse way to say "that will not fit".
 */
export function priceSelection(kind, quality, selection = [], { spells = [] } = {}) {
  const limits = runeRestrictions(kind, quality);
  const catalogue = runesFor(kind);
  const problems = [];
  let price = 0;
  // Spell Effect is the only rune whose own printed LEVEL matters to the
  // finished item: every other rune reaches the item's level through its
  // price, but this one is priced off a different ladder entirely, so a
  // cheap item carrying a level-14 rune is a level-14 item.
  let minimumLevel = 0;
  let extrapolated = false;

  const potency = (selection ?? []).find((entry) => entry.key === "potency");
  const others = (selection ?? []).filter((entry) => entry.key !== "potency");

  for (const entry of selection ?? []) {
    const rune = catalogue.find((r) => r.key === entry.key);
    if (rune?.spell) {
      const { spell: spellName, frequency } = parseSpellEffect(entry.parameter);
      const known = (spells ?? []).find(
        (s) => String(s?.name ?? "").toLowerCase() === spellName.toLowerCase());
      if (spellName && !known) {
        problems.push(`${rune.name}: no spell called "${spellName}" is in the compendium.`);
      }
      const priced = spellEffectFor(kind, {
        ppCost: known ? Number(known.ppCost) : null, frequency
      });
      price += priced.price;
      minimumLevel = Math.max(minimumLevel, priced.level);
      if (priced.extrapolated) extrapolated = true;
      problems.push(...priced.problems);
      continue;
    }

    price += runePrice(kind, entry.key, entry.tier);
    if (rune?.parameter && rune.parameter.choices.length && !entry.parameter) {
      problems.push(`${rune.name} needs a ${rune.parameter.label.toLowerCase()} chosen.`);
    }
    if (rune?.parameter?.perTier && entry.parameter) {
      const { types, allowed } = perTierChoices(entry.key, entry.parameter, entry.tier);
      if (types.length > allowed) {
        problems.push(`${rune.name} ${roman(entry.tier)} protects against ${allowed} type${allowed === 1 ? "" : "s"}; ${types.length} are chosen — the first ${allowed} count.`);
      }
    }
  }

  // THE LADDER'S TOP CAPS IT TOO (3.615.0, R1): a shield's stops at IV.
  const ladderTop = Math.max(0, ...potencyLadderFor(kind).map((row) => row.numeral));
  const maxPotency = ladderTop ? Math.min(limits.maxPotency, ladderTop) : limits.maxPotency;
  if (potency && potency.tier > maxPotency) {
    problems.push(
      `${quality || "Standard"}-quality ${kind} takes a Potency ${roman(maxPotency)} at most.`);
  }
  if (others.length && !potency) {
    problems.push("An item must carry a potency rune before other runes can be etched onto it.");
  }
  if (others.length > limits.additionalRunes) {
    problems.push(
      `${quality || "Standard"}-quality ${kind} takes ${limits.additionalRunes} additional rune${limits.additionalRunes === 1 ? "" : "s"}; ${others.length} are chosen.`);
  }
  return { price, problems, limits, minimumLevel, extrapolated };
}
