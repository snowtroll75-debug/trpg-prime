/**
 * Building a magic item from the rules (Chapter 11).
 *
 * WHY THIS EXISTS. Graham, 3.247.4: "I also have no way of building
 * custom gear. If I click to add something it is all text based. The
 * rules are there to custom build magical items, when I say I need
 * automation this is kind of important."
 *
 * Quite right. Every one of the chapter's four construction rules was
 * already implemented as arithmetic and none of them had a way in:
 *
 *   wondrous     add up the cost of its abilities   (wondrous.mjs)
 *   charged      level and PP from its spells       (charged-items.mjs)
 *   consumable   level is the spell's PP            (magic-item-tables)
 *   ammunition   weapon runes per batch of ten      (rune-catalogue)
 *
 * Runes on a weapon, armour or shield were the exception — those got
 * their chooser at 3.241.0, and this is the same job for the other four.
 *
 * THIS FILE IS THE ARITHMETIC AND THE SHAPE OF THE RESULT; the dialogs
 * live in magic-item-builder-workflow.mjs. Keeping the two apart is what
 * lets the harness run all of this outside Foundry, which is the only
 * reason any of it can be tested at all.
 */

import {
  CONSUMABLE_COST_TABLE, itemLevelForPrice, priceForLevel
} from "./magic-item-tables.mjs";
import {
  chargedItemPrice, dailyRecharge, rodLevel, staffLevel, staffPowerPoints,
  wandLevel, wandPowerPoints
} from "./charged-items.mjs";
import { wondrousItemValue } from "./wondrous.mjs";
import { fieldToRunes, priceSelection } from "./rune-catalogue.mjs";

/** The four things this builds, and what each needs to be told. */
export const BUILDER_KINDS = Object.freeze({
  wondrous: {
    label: "Wondrous Item",
    hint: "Priced by adding up what it does. Choose its abilities.",
    icon: "fa-solid fa-gem"
  },
  charged: {
    label: "Charged Item",
    hint: "A rod, staff or wand. Its level and power points come from the spells it holds.",
    icon: "fa-solid fa-wand-sparkles"
  },
  consumable: {
    label: "Consumable",
    hint: "An unguent, potion, scroll or other. Its level is the PP of the spell it carries.",
    icon: "fa-solid fa-flask"
  },
  ammunition: {
    label: "Magical Ammunition",
    hint: "Weapon runes, applied to a batch of ten.",
    icon: "fa-solid fa-bullseye"
  }
});

/* ------------------------------------------------------------------ */
/* WONDROUS                                                            */
/* ------------------------------------------------------------------ */

/**
 * A wondrous item built from its abilities.
 *
 * "To determine the final cost of a wondrous magic item, add up the cost
 * of all its individual abilities." The level then follows the total
 * price, rounding down to the nearest printed figure — the same rule
 * every other item in the chapter uses.
 *
 * @param {Array<{kind, value, adjustments, bonusType, stat, skill, save}>} abilities
 * @returns {{level, price, abilities, problems}}
 */
export function buildWondrous(abilities = []) {
  // wondrousItemValue does the whole sum — total price, level off the
  // ladder, and every ability's own problems. Reusing it rather than
  // re-adding the prices here is the difference between one implementation
  // of the chapter's rule and two that can drift apart.
  const valued = wondrousItemValue(abilities ?? []);
  const problems = [...valued.problems];
  if (!valued.abilities.length) problems.push("A wondrous item needs at least one ability.");
  return {
    level: valued.level,
    price: valued.price,
    abilities: valued.abilities.map((ability) => ({
      ...ability, level: ability.level, price: ability.price
    })),
    problems
  };
}

/**
 * What a chosen ability actually CHANGES, as a derivation target.
 *
 * The cost table prices "a skill bonus"; a character sheet needs to know
 * WHICH skill. Without this a built item would be priced correctly and
 * do nothing — which is precisely the state the shipped wondrous items
 * were in before 3.247.0, and would have been a poor thing to rebuild
 * one release after fixing it.
 *
 * An ability whose kind has no target this system can apply comes back
 * with none, and is reported on the sheet rather than silently dropped.
 */
export function wondrousAbilityTarget({ kind, subject = "" } = {}) {
  const key = String(subject ?? "").trim();
  switch (kind) {
    case "stat": return key ? { target: `system.attributes.${key}`, stat: key } : {};
    case "skillBonus": return key ? { target: `system.skills.${key}`, skill: key } : {};
    // ALL SAVES (3.617.0, B17 of block 37): one row, three pools — expanded
    // where the bonuses are gathered (wondrous-effects.mjs).
    case "saveBonus":
      if (key === "all") return { target: "system.combat.saves", save: "all" };
      return key ? { target: `system.combat.saves.${key}`, save: key } : {};
    // A SPELL ON A BUILT ITEM IS GRANTED (B17): the same innate grant the
    // book's spell items use, not a note.
    case "spell": return key ? { spell: key } : {};
    case "drBonus":
    case "baseDR": return { target: "system.combat.dr" };
    case "dbBonus": return { target: "system.combat.defence" };
    // Energy resistance, physical resistance, spells, Spell Adders: the
    // chapter prices them, and this system has no single number to add
    // them to. Reported, with what was chosen, so the table can apply it.
    default: return {};
  }
}

/** The default bonus type each ability kind is priced at. */
export function wondrousDefaultBonusType(kind) {
  if (kind === "saveBonus") return "resistance";
  // A SKILL BONUS IS PRICED AS STATUS (3.617.0, B17 of block 37): the table's
  // row is a status bonus, and "a different type of bonus to a skill" is the
  // offTypeSkill adjustment, +1 level. Built as item, it was applied as one
  // type and priced as the other.
  if (kind === "stat" || kind === "drBonus" || kind === "dbBonus" || kind === "skillBonus") return "status";
  return "item";
}

/**
 * Turn a builder's chosen rows into abilities the derivation can read.
 *
 * Kept beside the pricing rather than in the dialog, so the harness can
 * run it: the whole point is that a BUILT item behaves like a shipped
 * one, and that is a claim worth checking without Foundry.
 */
export function toWondrousAbilities(rows = [], label = "Custom item") {
  return (rows ?? []).map((row) => {
    const placement = wondrousAbilityTarget(row);
    const bonusType = row.bonusType || wondrousDefaultBonusType(row.kind);
    const ability = {
      kind: row.kind,
      value: Number(row.value) || 0,
      adjustments: row.adjustments ?? [],
      bonusType,
      label,
      ...placement
    };
    if (row.kind === "spell" && placement.spell) {
      ability.frequency = row.frequency || "daily";
      return ability;
    }
    if (!placement.target) {
      ability.reported = true;
      ability.note = `${label}: ${row.kind} ${row.value}${
        row.subject ? ` (${row.subject})` : ""} — apply by hand.`;
    }
    return ability;
  });
}

/* ------------------------------------------------------------------ */
/* CHARGED                                                             */
/* ------------------------------------------------------------------ */

/**
 * A rod, staff or wand built from the spells it holds.
 *
 * Each kind has its OWN rule and they are not variations of one:
 *
 *   rod    level is the total PP of everything it does
 *   staff  two levels above its highest spell, +1 for a second school,
 *          and it holds level x 2 power points
 *   wand   its one spell's PP + 1, +1 again if flexible, and it holds
 *          three castings' worth of power points
 *   other  (3.616.0, B13 of block 36) "Other Charged Items": the PP to
 *          cast each spell at its base cost twice, and "the PP cost of the
 *          contained spell +1" — read as the highest spell's, since the
 *          sentence names one and these items may hold several
 *
 * @param {"rod"|"staff"|"wand"|"other"} kind
 * @param {object} options
 * @param {Array<{name: string, pp: number, school?: string}>} options.spells
 * @param {boolean} [options.flexible] Wands only.
 * @param {number} [options.metamagicMinimumLevel] Rods only.
 * @returns {{level, price, maximumPP, recharge, problems}}
 */
export function buildCharged(kind, { spells = [], flexible = false, metamagicMinimumLevel = 0 } = {}) {
  const problems = [];
  const costs = (spells ?? []).map((spell) => Math.max(0, Math.floor(Number(spell?.pp) || 0)));
  const schools = (spells ?? []).map((spell) => spell?.school ?? "").filter(Boolean);

  // NOTHING CHOSEN IS NOTHING, not a level-1 item costing 60 gp. The
  // wand rule is "PP + 1", so an empty builder previewed as a real item
  // you could buy — which reads as an answer rather than a prompt.
  if (!costs.length) {
    return {
      level: 0, price: 0, maximumPP: 0, recharge: 0,
      problems: ["A charged item needs at least one spell."]
    };
  }
  if (kind === "wand" && costs.length > 1) {
    problems.push("A wand holds one spell; the others will be ignored.");
  }

  let level = 0;
  let maximumPP = 0;
  if (kind === "rod") {
    level = rodLevel({ spellPPCosts: costs, metamagicMinimumLevel });
    // "A ROD WILL ALWAYS CONTAIN 10 POWER POINTS WHEN FIRST CREATED"
    // (3.615.0, A14 of block 36). This used to read "the chapter gives no
    // separate formula" and sum the spells' costs; it does give one.
    maximumPP = ROD_POWER_POINTS;
  } else if (kind === "staff") {
    level = staffLevel({ spellPPCosts: costs, schools });
    maximumPP = staffPowerPoints(level);
  } else if (kind === "other") {
    ({ level, maximumPP } = otherChargedFigures(costs));
  } else {
    level = wandLevel(costs[0] ?? 0, { flexible });
    maximumPP = wandPowerPoints(costs[0] ?? 0);
  }

  const price = chargedItemPrice(kind, level);
  const recharge = dailyRecharge(maximumPP);
  return { level, price, maximumPP, recharge, problems };
}

/** "A rod will always contain 10 power points when first created." */
const ROD_POWER_POINTS = 10;

/**
 * OTHER CHARGED ITEMS (3.616.0, B13 of block 36): "contain enough PP to cast
 * each spell at base cost twice", at the level of "the PP cost of the
 * contained spell +1", priced from the Staff/Other column.
 * @param {number[]} costs each spell's base PP
 */
export function otherChargedFigures(costs) {
  const list = (costs ?? []).map((c) => Math.max(0, Math.floor(Number(c) || 0)));
  if (!list.length) return { level: 0, maximumPP: 0 };
  return {
    level: Math.max(...list) + 1,
    maximumPP: list.reduce((sum, c) => sum + 2 * c, 0)
  };
}

/* ------------------------------------------------------------------ */
/* CONSUMABLE                                                          */
/* ------------------------------------------------------------------ */

/**
 * A consumable's level: "equal to the PP of the spell it creates", and a
 * PP 0 spell's is Level 1 (Graham's R2 of block 37).
 */
export function consumableLevelFor(pp) {
  return Math.max(1, Math.floor(Number(pp) || 0));
}

/** Which column of the consumable cost table a kind is priced from. */
export const CONSUMABLE_KINDS = Object.freeze({
  // THE PRINTED ACTIVATION AND HANDS, per kind (3.617.0, A2 of block 37).
  // Every built consumable used to be "Interact (1 AP)": every printed
  // potion is Interact (2 AP), and the unguents are Engage (1 minute) and
  // take two hands. A scroll is read, so it takes the spell's own casting
  // time — no activation of its own.
  unguent: { label: "Unguent", column: 0, activation: "Engage (1 minute)", hands: 2 },
  potion: { label: "Potion", column: 0, activation: "Interact (2 AP)", hands: 1 },
  other: { label: "Other", column: 0, activation: "Interact (2 AP)", hands: 1 },
  scroll: { label: "Scroll", column: 1, activation: "", hands: 1 }
});

/**
 * A consumable built from the spell it carries.
 *
 * "A consumable has a level equal to the PP of the spell it creates."
 * Scrolls are the cheap column; everything else shares the first.
 *
 * @returns {{level, price, problems}}
 */
export function buildConsumable(kind, { spell = null } = {}) {
  const problems = [];
  const entry = CONSUMABLE_KINDS[kind] ?? CONSUMABLE_KINDS.other;
  if (!spell) {
    return { level: 0, price: 0, problems: ["A consumable needs a spell chosen."] };
  }
  const pp = Math.max(0, Math.floor(Number(spell.pp) || 0));
  // ONE ROW TOO HIGH UNTIL 3.617.0 (A1 of block 37). The table starts at
  // Level 1, so the level-L row is index L - 1; reading index `pp` priced a
  // PP 2 potion at 100 gp instead of 60 and put PP 20 off the end.
  // A CANTRIP IS LEVEL 1 (Graham's R2): 30 gp, or 20 gp as a scroll.
  const level = consumableLevelFor(pp);
  const row = CONSUMABLE_COST_TABLE[level - 1];
  if (!row) {
    problems.push(`A PP ${pp} spell is past the end of the consumable cost table.`);
    return { level, price: 0, problems };
  }
  return { level, price: Number(row[entry.column] ?? 0), problems };
}

/* ------------------------------------------------------------------ */
/* AMMUNITION                                                          */
/* ------------------------------------------------------------------ */

/** A batch is ten, and that is the chapter's own unit for runed ammo. */
export const AMMUNITION_BATCH = 10;

/**
 * Magical ammunition: weapon runes, priced per batch of ten.
 *
 * "Magical ammunition is created by applying weapon runes to a batch of
 * ten pieces." So the rune price is the batch price, the item's own
 * price is ten pieces of the base ammunition, and the level follows the
 * total — the same way an enchanted weapon's does.
 *
 * THE BASE PRICE IS FOR THE WHOLE BUNDLE, not for one arrow. The
 * equipment table prints "Arrows (20) | 1 gp" — one gold piece for
 * twenty — and this first multiplied that by ten as though it were the
 * price of a single arrow, making a batch cost twenty times what it
 * should. Found by live testing at 3.248.2; the rune price dwarfs it,
 * which is exactly why it would have gone unnoticed.
 *
 * @param {object} options
 * @param {number} options.basePrice The printed price of the base bundle.
 * @param {number} options.baseQuantity How many pieces that price buys.
 * @param {string} options.runes The runes field, as the chooser writes it.
 * @param {string} [options.quality]
 * @returns {{level, price, batch, runePrice, piecePrice, problems}}
 */
export function buildAmmunition({
  basePrice = 0, baseQuantity = 1, runes = "", quality = "standard"
} = {}) {
  const selection = fieldToRunes("weapon", runes);
  const { price: runePrice, problems } = priceSelection("weapon", quality, selection);
  const pieces = Math.max(1, Math.floor(Number(baseQuantity) || 1));
  const piecePrice = Math.max(0, Number(basePrice) || 0) / pieces;
  const batchBase = piecePrice * AMMUNITION_BATCH;
  const price = batchBase + runePrice;
  const level = runePrice ? itemLevelForPrice("weapon", price) : 0;
  if (!selection.length) {
    problems.push("Magical ammunition needs at least one rune; without one it is ordinary ammunition.");
  }
  return {
    level,
    // Rounded to the copper piece, which is the smallest coin in the
    // chapter — a batch price of 1100.5 gp is not a price.
    price: Math.round(price * 100) / 100,
    batch: AMMUNITION_BATCH, runePrice, piecePrice, problems
  };
}

/** What a base round carries that its runed batch must keep (B1). */
export const BASE_ROUND_FIELDS = Object.freeze([
  "armourRending", "damageTypeOverride", "rangeIncrementBonus", "attackModifier", "damageModifier",
  "extraDamage", "extraDamageType", "splashDamage", "allowsSubdual", "removesTraits"
]);

/**
 * The base round's own properties, copied onto a runed batch (3.618.0, B1 of
 * block 37): "the builder also drops the base round's own properties, so
 * runed Penetrating Arrows lose their AR 1".
 *
 * @param {object|null} system the base ammunition's system data
 * @returns {object}
 */
export function baseRoundProperties(system) {
  const out = {};
  for (const field of BASE_ROUND_FIELDS) {
    if (system?.[field] !== undefined) out[field] = JSON.parse(JSON.stringify(system[field]));
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* THE RESULT                                                          */
/* ------------------------------------------------------------------ */

/**
 * The item document a builder produces.
 *
 * A CUSTOM WONDROUS ITEM CARRIES ITS OWN ABILITIES, in its flags, rather
 * than relying on the name-keyed table the shipped twenty-seven use —
 * otherwise a built item would be inert, which is exactly the state the
 * shipped ones were in before 3.247.0 and the whole point of this work.
 * `wondrousAbilitiesOf` reads the flag first and falls back to the table.
 *
 * @returns {object} an Item creation payload
 */
export function builtItemData(kind, name, built, extra = {}) {
  const system = {
    quantity: kind === "ammunition" ? AMMUNITION_BATCH : 1,
    weight: Number(extra.weight ?? 0),
    price: built.price,
    equipped: false,
    invested: false,
    hp: { value: 0, max: 0 },
    traits: extra.traits ?? "Invested",
    description: extra.description ?? "",
    itemLevel: built.level
  };
  if (kind === "charged") {
    system.uses = built.maximumPP;
    system.slot = "";
    system.itemSize = "medium";
    system.heldHands = extra.heldHands ?? 1;
    system.formulae = "";
    system.spellbookContainer = false;
  }
  if (kind === "wondrous") {
    system.uses = 0;
    system.slot = extra.slot ?? "";
    system.itemSize = "medium";
    system.heldHands = 0;
    system.formulae = "";
    system.spellbookContainer = false;
  }
  if (kind === "consumable") {
    // A PAIR, NOT A NUMBER. `system.uses` is a scalar on a charged item —
    // its PP pool — and a `{value, max}` pair on a consumable: the
    // template says so, the item sheet binds `system.uses.value` and
    // `system.uses.max`, and every shipped potion stores the pair. This
    // line wrote the charged item's shape onto the wrong type, so a built
    // potion showed blank Uses fields and nothing could count a dose
    // down. Found 14 Aug 2026, alongside the missing spell reference.
    system.uses = { value: 1, max: 1 };
    system.activation = extra.activation ?? "";
  }
  if (kind === "ammunition") {
    // THE BASE ROUND'S OWN PROPERTIES FIRST (3.618.0, B1), so the runes are
    // added to a Penetrating Arrow rather than replacing it with a bare one.
    Object.assign(system, baseRoundProperties(extra.base));
    system.runes = extra.runes ?? "";
    system.compatibleWeaponGroup = extra.compatibleWeaponGroup ?? "";
    system.damage = extra.damage ?? "";
    // WITHOUT THIS, `carriedWeightOf` falls to the schema default of 1 and
    // multiplies the bundle's weight by the whole batch — the very defect
    // that helper exists to prevent, reintroduced by the one item type
    // that is always a bundle. The base bundle's size, not the built
    // batch's: the printed weight covers a bundle of twenty whether you
    // are holding twenty or ten.
    system.batchSize = Math.max(1, Math.floor(Number(extra.batchSize) || 1));
  }

  return {
    name,
    type: documentTypeFor(kind),
    img: extra.img ?? "icons/svg/mystery-man.svg",
    system,
    flags: {
      "trg-prime": {
        // Every built item says it was built, and by which rule — so a
        // GM looking at it later can tell a construction from a
        // transcription, and so grant cleanup and the sheet's own
        // grouping can find it.
        builtItem: { kind, rule: BUILDER_KINDS[kind]?.label ?? kind },
        ...(kind === "wondrous"
          ? { wondrous: { base: name, tier: "", custom: true, abilities: built.abilities ?? [] } }
          : {}),
        ...(kind === "charged"
          ? {
            chargedItem: {
              kind: extra.chargedKind ?? "wand",
              maximumPP: built.maximumPP,
              flexible: Boolean(extra.flexible),
              recharge: built.recharge,
              spells: extra.spells ?? []
            }
          }
          : {}),
        ...(kind === "consumable"
          ? {
            consumable: {
              kind: extra.consumableKind ?? "other",
              costColumn: "consumable",
              custom: true,
              // THE SPELL, KEPT. Until 3.310.0 the builder collected a
              // spell, priced the item from its PP, wrote "Creates the
              // effect of Cure (PP 2)" into the description and dropped
              // the reference on the floor — so the finished potion knew
              // its own price and level and had no idea what it did.
              // Nothing could use one. Same `{name, uuid, pp}` shape as a
              // charged item's spells, because it is the same question.
              spell: extra.consumableSpell ?? null,
              // The kind's hands (3.617.0, A2): an unguent takes two.
              hands: Number(extra.heldHands ?? 1) || 1
            }
          }
          : {})
      }
    }
  };
}

/** The label the custom compendium is created with, and found by. */
export const CUSTOM_PACK_LABEL = "Custom Magic Items";

/**
 * The existing world pack with that label, whatever id Foundry gave it.
 *
 * FOUND BY LABEL, NOT BY AN ASSUMED ID. Foundry derives a world pack's
 * id from the label it is created with — "Custom Magic Items" becomes
 * `world.custom-magic-items`, not the `world.trg-...` this first
 * guessed. The guess meant the pack was never found again, so a second
 * save tried to create it and threw. Live testing, 3.248.1.
 *
 * Here rather than in the workflow because it is a pure search over a
 * list, and the workflow cannot be imported outside Foundry — which is
 * exactly the reason to keep anything testable out of it.
 */
export function findCustomPack(packs = []) {
  return Array.from(packs ?? []).find((pack) =>
    pack?.metadata?.packageType === "world"
    && pack?.metadata?.type === "Item"
    && pack?.metadata?.label === CUSTOM_PACK_LABEL) ?? null;
}

/** Which Item type each built thing actually is. */
export function documentTypeFor(kind) {
  if (kind === "consumable") return "consumable";
  if (kind === "ammunition") return "ammunition";
  // Wondrous and charged items are gear, which is what they have always
  // been in this system — the Magic Items tab splits them out by flag.
  return "gear";
}

