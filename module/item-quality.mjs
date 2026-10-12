/**
 * Chapter 6's Item Quality, Special Materials, and the weapon/armour/
 * shield-specific Superior Item rules — the full customisation system
 * for purchasable gear, covering both price/level calculation and the
 * actual mechanical effects (damage bonuses, DR, HP, weight, and so
 * on) each layer grants.
 *
 * Three independent, stacking layers:
 *   - Quality (Expert/Master/Legendary/Inferior) — a tier applied to
 *     any weapon/armour/shield, with type-specific mechanical benefits.
 *   - Material (Adamantine, Mithril, Silver, ...) — an optional special
 *     material the item is constructed from, each with its own effects.
 *   - Superior Traits — additional crafted-in properties, gated by
 *     quality tier (Expert allows 1, Master 2, Legendary 3).
 *
 * All three contribute to a combined level increase, which is then
 * used once to compute the item's final price (Chapter 6: "add the
 * base value of the item to the minimum cost of an item of the new
 * level") — not as separate, compounding surcharges per layer.
 */

import { itemLevelForPrice } from "./magic-item-tables.mjs";
import { fieldToRunes, priceSelection } from "./rune-catalogue.mjs";
import { computeRuneModifiers } from "./runes.mjs";

// Cost tables (Chapter 6), level 0-20, base cost in gp. Index 0 is
// always "-" in the rulebook (no surcharge at the item's own starting
// level) and is represented here as 0.
import { parseGrantList } from "./grants.mjs";

export const WEAPON_COST_TABLE = Object.freeze([
  0, 70, 200, 350, 600, 900, 1400, 2100, 3000, 4300, 6000, 8000, 11000,
  17000, 25000, 40000, 60000, 90000, 130000, 200000, 350000
]);

export const ARMOUR_COST_TABLE = Object.freeze([
  0, 100, 250, 450, 750, 1250, 2000, 3000, 4200, 6000, 8000, 11000, 16000,
  24000, 36000, 55000, 80000, 120000, 180000, 300000, 500000
]);

export const SHIELD_COST_TABLE = Object.freeze([
  0, 70, 175, 315, 525, 875, 1400, 2100, 2940, 4200, 5600, 7700, 11200,
  16800, 25200, 38500, 56000, 84000, 126000, 210000, 350000
]);

const COST_TABLES = Object.freeze({
  weapon: WEAPON_COST_TABLE,
  armour: ARMOUR_COST_TABLE,
  shield: SHIELD_COST_TABLE
});

/**
 * The minimum base cost of an item at the given level, from the
 * appropriate table. Levels beyond the table's own range (20) clamp to
 * the table's highest entry rather than throwing — the rulebook's own
 * tables don't go further, and clamping is safer than extrapolating a
 * formula the rulebook never states.
 */
export function minimumCostAtLevel(itemType, level) {
  const table = COST_TABLES[itemType];
  if (!table) throw new Error(`No cost table for item type "${itemType}"`);
  const index = Math.max(0, Math.min(table.length - 1, Math.floor(Number(level) || 0)));
  return table[index];
}

/**
 * Final price for a customised item (Chapter 6): the item's own
 * original base price, plus the minimum cost of an item at the new,
 * combined level (quality + material + traits all summed into one
 * level delta first, not applied as separate sequential surcharges).
 * Inferior items are the one exception — their price is halved
 * instead, per their own explicit rule, and never combine with a
 * level-increasing quality tier (an item is Expert/Master/Legendary/
 * Inferior/standard, not more than one at once).
 */
export function computeItemPrice(itemType, basePrice, effectiveLevel, { inferior = false } = {}) {
  const base = Math.max(0, Number(basePrice) || 0);
  if (inferior) return Math.round((base / 2) * 100) / 100;
  return Math.round((base + minimumCostAtLevel(itemType, effectiveLevel)) * 100) / 100;
}

// The three item types whose price is level-dependent (the rule
// computeItemPrice above implements) — see pickerDisplayPrice below.
const PRICE_LEVEL_TYPES = new Set(["weapon", "armour", "shield"]);

/**
 * The price a picker row should DISPLAY for a compendium index entry — not
 * always the same as its raw `system.price`. Weapon/armour/shield items
 * carry the combined level+price rule above, which applies even at
 * completely standard, uncustomised quality whenever the item's own base
 * `itemLevel` is nonzero — this runs the exact same computeItemPrice
 * formula the customisation dialog and the picker's own Buy flow
 * (picker-workflow.mjs) already charge. Showing the raw `system.price` in
 * the list understates that: reproduced live (3.230.7 live-testing report,
 * fault #5), Full Chainmail (price 205, itemLevel 1) listed at 205gp but
 * charged 305gp (205 + the level-1 armour table entry, 100) with zero
 * customisation chosen. Gear/ammunition/consumables have no
 * itemLevel-driven surcharge — their raw price already is what Buy
 * charges, so they pass through unchanged.
 *
 * Lives here rather than in picker-workflow.mjs because it's pure price
 * math with no Foundry dependency, same reasoning as sourceEntryId's move
 * to items.mjs — picker-workflow.mjs re-exports it.
 *
 * @param {{type: string, system?: {price?: number, itemLevel?: number}}} entry
 * @returns {number}
 */
export function pickerDisplayPrice(entry) {
  const basePrice = Number(entry?.system?.price ?? 0);
  if (!PRICE_LEVEL_TYPES.has(entry?.type)) return basePrice;
  const itemLevel = Number(entry?.system?.itemLevel ?? 0);
  return computeItemPrice(entry.type, basePrice, itemLevel);
}

/**
 * Quality tiers (Chapter 6, and the weapon/armour/shield-specific
 * Superior Item sections). Standard is the default, no-op tier.
 * Inferior is mutually exclusive with the three superior tiers — an
 * item is one or the other, never both — and is handled as its own
 * flag rather than a level-increasing tier, since its price rule
 * (halved) and lack of a level increase are fundamentally different.
 */
export const QUALITY_TIERS = Object.freeze({
  standard: { label: "Standard", levelDelta: 0, maxTraits: 0 },
  expert: {
    label: "Expert",
    levelDelta: 2,
    maxTraits: 1,
    itemBonus: 1,
    weapon: { damageBonusPerDie: 1 },
    armour: { acpReduction: 0, maxDexBonus: 1, hpPercent: 10 },
    shield: { hpMultiplier: 2, dr: 1 }
  },
  master: {
    label: "Master",
    levelDelta: 8,
    maxTraits: 2,
    itemBonus: 2,
    weapon: { damageBonusPerDie: 2 },
    armour: { acpReduction: 1, maxDexBonus: 2, hpPercent: 20 },
    shield: { hpMultiplier: 3, dr: 2 }
  },
  legendary: {
    label: "Legendary",
    levelDelta: 14,
    maxTraits: 3,
    itemBonus: 3,
    weapon: { damageBonusPerDie: 3 },
    armour: { acpReduction: 2, maxDexBonus: 3, hpPercent: 30 },
    shield: { hpMultiplier: 4, dr: 3 }
  },
  inferior: {
    label: "Inferior",
    levelDelta: 0,
    maxTraits: 0,
    itemBonus: -1,
    priceHalved: true,
    craftDC: "Easy (+2)"
  }
});

/**
 * Special Materials (Chapter 6). Each material's own text is the
 * source for both its level increase and its mechanical effects;
 * `appliesTo` reflects what the rulebook actually says an item can be
 * made from — Dragonhide is explicit that it's armour/metal-shields
 * only, never weapons, so it's restricted rather than left open.
 * Effects are applied by the workflow layer, not here — this module
 * only describes what each material does.
 */
export const MATERIALS = Object.freeze({
  adamantine: {
    label: "Adamantine",
    rarity: "Rare",
    levelDelta: 5,
    appliesTo: ["weapon", "armour", "shield"],
    hpMultiplier: 2,
    drBonus: 1,
    weaponExtraDie: true
  },
  coldIron: {
    label: "Cold Iron",
    rarity: "Uncommon",
    levelDelta: 2,
    appliesTo: ["weapon", "armour", "shield"],
    hpPercent: 10,
    overcomesResistance: "cold iron"
  },
  densewood: {
    label: "Densewood",
    rarity: "Uncommon",
    levelDelta: 2,
    appliesTo: ["weapon", "armour", "shield"],
    hpMultiplier: 2,
    shieldDrBonus: 1,
    weaponGrantsTrait: "Keen"
  },
  dragonhide: {
    label: "Dragonhide",
    rarity: "Rare",
    levelDelta: 3,
    appliesTo: ["armour", "shield"],
    armourOnlyCategories: ["Medium", "Heavy"],
    hpPercent: 50,
    weightPercent: -20,
    // ACP and Speed penalties are separate mechanics on separate scales:
    // ACP is expressed in ones, Speed penalties in fives. Per Graham, the
    // Speed reduction is 5, not the same figure as the ACP reduction.
    armourAcpReduction: 1,
    armourSpeedPenaltyReduction: 5,
    shieldEnergyDBBonus: 2,
    armourEnergyResistance: true,
    // "can only be utilized in the crafting of medium or heavy armour as
    // well as METAL shields." Enforced from 3.574.0 against the shield's
    // own `metal` field, which every shield in the pack carries — the
    // armour half has been enforced since the material was written.
    shieldMetalOnly: true
  },
  eaog: {
    label: "Eaog",
    rarity: "Rare",
    levelDelta: 6,
    appliesTo: ["weapon", "armour", "shield"],
    hpMultiplier: 2,
    drBonus: 2,
    armourWeightPercent: -50,
    armourAcpReduction: 2,
    armourSpeedPenaltyReduction: 5,
    spellDCIncrease: 2,
    savingThrowBonusVsMagic: 2,
    weaponExtraDie: true,
    weaponGrantsTrait: "Keen"
  },
  mithril: {
    label: "Mithril",
    rarity: "Rare",
    levelDelta: 4,
    appliesTo: ["weapon", "armour", "shield"],
    weightPercent: -50,
    hpPercent: 50,
    armourAcpReduction: 2,
    armourMaxDexBonus: 2,
    weaponCountsAsSilver: true,
    weaponGrantsTrait: "Keen"
  },
  silver: {
    label: "Silver",
    rarity: "Uncommon",
    levelDelta: 1,
    appliesTo: ["weapon", "armour", "shield"],
    weightPercent: -50,
    hpPercent: -50,
    armourDrPenalty: 2,
    weaponDamageDieStepDown: 1,
    overcomesResistance: "silver"
  },
  alchemicalSilver: {
    label: "Alchemical Silver",
    rarity: "Rare",
    levelDelta: 2,
    appliesTo: ["weapon", "armour", "shield"],
    weightPercent: -50,
    overcomesResistance: "silver"
  }
});

/**
 * Superior Traits — additional crafted-in properties available once
 * an item has a superior quality tier, gated by that tier's maxTraits.
 * Each trait adds +1 to the item's combined level, regardless of type.
 */
export const WEAPON_SUPERIOR_TRAITS = Object.freeze({
  balanced: { label: "Balanced", repeatable: true, fumbleDCReduction: 1 },
  trait: { label: "Trait (add a weapon trait)", requiresQuality: "expert", grantsChosenTrait: true },
  lightweight: { label: "Lightweight", weightReductionBySize: { default: 1, large: 2 } }
});

export const ARMOUR_SUPERIOR_TRAITS = Object.freeze({
  cushioned: { label: "Cushioned", drBonusVsType: "bludgeoning", drBonus: 1 },
  flameResistant: { label: "Flame Resistant", drBonusVsType: "fire", drBonus: 1 },
  heavy: {
    label: "Heavy",
    acpPenaltyIncrease: 1,
    maxDexReduction: 1,
    drBonus: 1,
    weightPercent: 25
  },
  insulated: { label: "Insulated", drBonusVsType: "electricity", drBonus: 1 },
  lightweight: {
    label: "Lightweight",
    acpReduction: 1,
    maxDexBonus: 1,
    // Per Graham, correcting the rulebook's own wording: Speed penalties
    // are expressed in increments of 5, so "reduced by 1" would leave a
    // -4 that no armour in the game can actually have. Lightweight
    // removes a whole step of Speed penalty, not a single foot.
    speedPenaltyReduction: 5,
    weightPercent: -25
  },
  reinforced: { label: "Reinforced", drBonusVsType: "slashing", drBonus: 1, weightPercent: 25 },
  warm: { label: "Warm", drBonusVsType: "cold", drBonus: 1 }
});

export const SHIELD_SUPERIOR_TRAITS = Object.freeze({
  balanced: { label: "Balanced", repeatable: true, acpReduction: 1 },
  boss: { label: "Boss", bashDieStepUp: 1 },
  lightweight: {
    label: "Lightweight",
    repeatable: true,
    weightReductionBySize: { buckler: 1, light: 1, heavy: 2, tower: 5 }
  },
  spikes: { label: "Spikes", bashGainsTrait: "Versatile (Piercing)" }
});

export const SUPERIOR_TRAITS = Object.freeze({
  weapon: WEAPON_SUPERIOR_TRAITS,
  armour: ARMOUR_SUPERIOR_TRAITS,
  shield: SHIELD_SUPERIOR_TRAITS
});

/**
 * The combined level increase from quality + material + superior
 * traits, all summed into one delta before a single price lookup —
 * not applied as separate, compounding surcharges per layer. Inferior
 * items never increase level (their price rule is a halving instead).
 *
 * @param {number} baseLevel
 * @param {string} quality One of QUALITY_TIERS' keys.
 * @param {string} material One of MATERIALS' keys, or "" for none.
 * @param {string[]} traitKeys Selected superior trait keys.
 */
export function computeEffectiveLevel(baseLevel, quality, material, traitKeys = []) {
  const base = Math.max(0, Number(baseLevel) || 0);
  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;
  if (tier.priceHalved) return base;

  const materialDelta = material ? (MATERIALS[material]?.levelDelta ?? 0) : 0;
  const traitDelta = traitKeys.length;
  return base + tier.levelDelta + materialDelta + traitDelta;
}

/**
 * Full price + level for a customised weapon/armour/shield in one
 * call — the combination every picker and item-sheet workflow needs.
 */
export function computeCustomisedPrice(itemType, baseLevel, basePrice, { quality = "standard", material = "", traitKeys = [] } = {}) {
  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;
  const effectiveLevel = computeEffectiveLevel(baseLevel, quality, material, traitKeys);
  const price = computeItemPrice(itemType, basePrice, effectiveLevel, { inferior: Boolean(tier.priceHalved) });
  return { effectiveLevel, price };
}

/**
 * Aggregated weapon modifiers from quality + material + superior
 * traits — everything the attack workflow needs to build the actual
 * damage formula and other weapon stats in one pass.
 *
 * damageBonusPerDie is quality's own per-die item bonus (Chapter 6:
 * "the flat damage bonus for quality weapons is per base die" —
 * multiplied by however many dice are actually rolled, including
 * critical bonus dice, at the point the formula is built).
 */
export function computeWeaponModifiers(quality, material, traitKeys = []) {
  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;
  const mat = material ? MATERIALS[material] : null;

  const modifiers = {
    damageBonusPerDie: tier.weapon?.damageBonusPerDie ?? 0,
    extraDice: mat?.weaponExtraDie ? 1 : 0,
    damageDieStepDown: mat?.weaponDamageDieStepDown ?? 0,
    fumbleDCDelta: 0,
    weightDelta: 0,
    grantedTraits: [],
    countsAsSilver: Boolean(mat?.weaponCountsAsSilver),
    overcomesResistance: mat?.overcomesResistance ?? null
  };

  if (mat?.weaponGrantsTrait) modifiers.grantedTraits.push(mat.weaponGrantsTrait);

  for (const key of traitKeys) {
    const trait = WEAPON_SUPERIOR_TRAITS[key];
    if (!trait) continue;
    if (trait.fumbleDCReduction) modifiers.fumbleDCDelta -= trait.fumbleDCReduction;
    if (trait.weightReductionBySize) modifiers.weightDelta -= trait.weightReductionBySize.default;
  }

  return modifiers;
}

/**
 * Aggregated armour modifiers from quality + material + superior
 * traits. DR is split into a flat bonus (from quality/material, which
 * applies against any damage) and a per-damage-type bonus (from the
 * five superior traits that each protect against one specific type —
 * Cushioned/bludgeoning, Flame Resistant/fire, and so on), since those
 * two kinds of bonus behave differently in the damage pipeline.
 */
export function computeArmourModifiers(quality, material, traitKeys = [], { category = "" } = {}) {
  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;
  const mat = material ? MATERIALS[material] : null;
  const materialApplies =
    !mat || !mat.armourOnlyCategories || mat.armourOnlyCategories.includes(category);

  const modifiers = {
    acpDelta: tier.armour?.acpReduction ?? 0,
    maxDexBonus: tier.armour?.maxDexBonus ?? 0,
    hpPercent: tier.armour?.hpPercent ?? 0,
    hpMultiplier: 1,
    drBonus: 0,
    drByType: {},
    weightPercent: 0,
    speedPenaltyDelta: 0,
    energyResistance: null,
    savingThrowBonusVsMagic: 0
  };

  if (mat && materialApplies) {
    if (mat.hpMultiplier) modifiers.hpMultiplier *= mat.hpMultiplier;
    if (mat.hpPercent) modifiers.hpPercent += mat.hpPercent;
    if (mat.drBonus) modifiers.drBonus += mat.drBonus;
    if (mat.weightPercent) modifiers.weightPercent += mat.weightPercent;
    if (mat.armourWeightPercent) modifiers.weightPercent += mat.armourWeightPercent;
    if (mat.armourAcpReduction) modifiers.acpDelta += mat.armourAcpReduction;
    if (mat.armourMaxDexBonus) modifiers.maxDexBonus += mat.armourMaxDexBonus;
    if (mat.armourDrPenalty) modifiers.drBonus -= mat.armourDrPenalty;
    if (mat.armourSpeedPenaltyReduction) {
      modifiers.speedPenaltyDelta += mat.armourSpeedPenaltyReduction;
    }
    if (mat.savingThrowBonusVsMagic) modifiers.savingThrowBonusVsMagic += mat.savingThrowBonusVsMagic;
    if (mat.armourEnergyResistance) modifiers.energyResistance = true;
  }

  for (const key of traitKeys) {
    const trait = ARMOUR_SUPERIOR_TRAITS[key];
    if (!trait) continue;
    if (trait.drBonusVsType) {
      modifiers.drByType[trait.drBonusVsType] = (modifiers.drByType[trait.drBonusVsType] ?? 0) + trait.drBonus;
    }
    if (trait.acpPenaltyIncrease) modifiers.acpDelta -= trait.acpPenaltyIncrease;
    if (trait.acpReduction) modifiers.acpDelta += trait.acpReduction;
    if (trait.maxDexReduction) modifiers.maxDexBonus -= trait.maxDexReduction;
    if (trait.maxDexBonus) modifiers.maxDexBonus += trait.maxDexBonus;
    if (trait.speedPenaltyReduction) modifiers.speedPenaltyDelta += trait.speedPenaltyReduction;
    if (trait.drBonus && !trait.drBonusVsType) modifiers.drBonus += trait.drBonus;
    if (trait.weightPercent) modifiers.weightPercent += trait.weightPercent;
  }

  return modifiers;
}

/**
 * Aggregated shield modifiers from quality + material + superior
 * traits. Balanced and Lightweight are both explicitly repeatable in
 * the rulebook, so traitKeys naturally supports that — the same key
 * appearing more than once simply applies its effect that many times,
 * with no deduplication.
 *
 * @param {string} [category] "buckler" | "light" | "heavy" | "tower" —
 *   the shield's own category, which is also its size, and which
 *   determines Lightweight's weight reduction. Named to match
 *   computeArmourModifiers, and read off system.category by every
 *   caller. Defaults to "light", the most common shield category.
 */
export function computeShieldModifiers(quality, material, traitKeys = [], { category = "light" } = {}) {
  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;
  const mat = material ? MATERIALS[material] : null;

  const modifiers = {
    hpMultiplier: tier.shield?.hpMultiplier ?? 1,
    drBonus: tier.shield?.dr ?? 0,
    acpDelta: 0,
    weightDelta: 0,
    weightPercent: 0,
    bashDieStepUp: 0,
    bashGrantedTraits: [],
    energyDBBonus: 0
  };

  if (mat) {
    if (mat.hpMultiplier) modifiers.hpMultiplier *= mat.hpMultiplier;
    if (mat.hpPercent) modifiers.weightPercent += 0; // hpPercent tracked separately below
    if (mat.drBonus) modifiers.drBonus += mat.drBonus;
    if (mat.shieldDrBonus) modifiers.drBonus += mat.shieldDrBonus;
    if (mat.weightPercent) modifiers.weightPercent += mat.weightPercent;
    if (mat.shieldEnergyDBBonus) modifiers.energyDBBonus += mat.shieldEnergyDBBonus;
  }
  // hpPercent (Cold Iron, Dragonhide, Mithril, Silver) applied as its
  // own tracked value, kept separate from hpMultiplier since the two
  // stack additively/multiplicatively in different ways.
  modifiers.hpPercent = mat?.hpPercent ?? 0;

  for (const key of traitKeys) {
    const trait = SHIELD_SUPERIOR_TRAITS[key];
    if (!trait) continue;
    if (trait.acpReduction) modifiers.acpDelta += trait.acpReduction;
    if (trait.bashDieStepUp) modifiers.bashDieStepUp += trait.bashDieStepUp;
    if (trait.weightReductionBySize) {
      modifiers.weightDelta -= trait.weightReductionBySize[category] ?? trait.weightReductionBySize.light ?? 0;
    }
    if (trait.bashGainsTrait) modifiers.bashGrantedTraits.push(trait.bashGainsTrait);
  }

  return modifiers;
}

/**
 * Steps a damage die size down (used by Silver's "reduce damage die
 * size by 1 step"). The progression is confirmed directly from the
 * rulebook's own worked example elsewhere ("d8 becomes d6 for one
 * additional target, d4 for two") — the standard 4/6/8/10/12
 * sequence. A die size outside that sequence (this system has a
 * handful of unusual sizes like d3/d5 on specific weapons) steps down
 * to the nearest lower value in the standard sequence rather than
 * guessing at an extended progression the rulebook never states.
 */
const DIE_STEP_SEQUENCE = Object.freeze([4, 6, 8, 10, 12]);

export function stepDownDieSize(faces, steps = 1) {
  const value = Math.max(1, Math.floor(Number(faces) || 0));
  let index = DIE_STEP_SEQUENCE.findIndex((f) => f >= value);
  if (index === -1) index = DIE_STEP_SEQUENCE.length - 1;
  const newIndex = Math.max(0, index - steps);
  return DIE_STEP_SEQUENCE[newIndex];
}

/**
 * Steps a damage die size UP (Boss, superior shield trait: "The attack
 * dice is increased by one step"). The same 4/6/8/10/12 sequence as
 * `stepDownDieSize`, capped at d12; a die below d4 steps to d4 first.
 *
 * @param {number} faces
 * @param {number} [steps]
 * @returns {number}
 */
export function stepUpDieSize(faces, steps = 1) {
  const value = Math.max(1, Math.floor(Number(faces) || 0));
  let index = DIE_STEP_SEQUENCE.findIndex((f) => f >= value);
  if (index === -1) index = DIE_STEP_SEQUENCE.length - 1;
  const lifted = value < DIE_STEP_SEQUENCE[index] ? index - 1 : index;
  const newIndex = Math.min(DIE_STEP_SEQUENCE.length - 1, Math.max(0, lifted + Math.max(0, Math.floor(Number(steps) || 0))));
  return DIE_STEP_SEQUENCE[Math.max(0, newIndex)];
}

/**
 * Which materials a picker or item sheet should offer for a given
 * item type, respecting each material's own appliesTo restriction and
 * (for armour specifically) its armourOnlyCategories restriction —
 * Dragonhide shouldn't appear as an option for a Light armour piece
 * at all, rather than being selectable and silently doing nothing.
 *
 * @param {"weapon"|"armour"|"shield"} itemType
 * @param {string} [category] Armour category (Light/Medium/Heavy/
 *   Other), only relevant when itemType is "armour".
 * @returns {Array<{key: string, label: string}>}
 */
export function applicableMaterials(itemType, category = "", { metal = null } = {}) {
  return Object.entries(MATERIALS)
    .filter(([, mat]) => mat.appliesTo.includes(itemType))
    .filter(([, mat]) => {
      if (itemType !== "armour" || !mat.armourOnlyCategories) return true;
      return mat.armourOnlyCategories.includes(category);
    })
    // METAL SHIELDS ONLY, for a material that says so. `metal` is null
    // when the caller does not know — which keeps the old behaviour
    // rather than refusing a shield on a guess; only a shield KNOWN to be
    // wood, bone or leather is refused.
    .filter(([, mat]) => {
      if (itemType !== "shield" || !mat.shieldMetalOnly) return true;
      return metal !== false;
    })
    .map(([key, mat]) => ({ key, label: mat.label }));
}

/**
 * Combines a modifier set's hpMultiplier (stacks multiplicatively —
 * Legendary shield x4 with Densewood x2 becomes x8) and hpPercent
 * (stacks additively on top of that) into the item's actual new max
 * HP, rounded to a whole number.
 */
export function computeItemHP(baseHP, modifiers) {
  const base = Math.max(0, Number(baseHP) || 0);
  const multiplier = Number(modifiers?.hpMultiplier ?? 1) || 1;
  const percent = Number(modifiers?.hpPercent ?? 0) || 0;
  return Math.round(base * multiplier * (1 + percent / 100));
}

/**
 * An item's weight after quality, material and superior traits.
 *
 * Every material and trait that changes weight has always declared it
 * (Mithril -50%, Lightweight -25%, Heavy and Reinforced +25%), and
 * computeArmourModifiers has always summed those declarations into
 * modifiers.weightPercent — but nothing ever read the result, so a
 * Mithril breastplate weighed exactly as much as a steel one. This is
 * the reader.
 *
 * Rounded to two decimal places to match the item sheet's own step,
 * and never below zero.
 */
export function computeItemWeight(baseWeight, modifiers) {
  const base = Math.max(0, Number(baseWeight) || 0);
  const percent = Number(modifiers?.weightPercent ?? 0) || 0;
  // AND THE FLAT REDUCTION TOO, which had the same fault one layer down:
  // Lightweight on a weapon or a shield sheds POUNDS rather than a
  // percentage ("buckler 1, light 1, heavy 2, tower 5"), every one of
  // those was summed into modifiers.weightDelta, and this function read
  // only the percentage — so a Lightweight tower shield weighed exactly
  // what an ordinary one did. Applied after the percentage, because the
  // percentage is a property of the material the whole item is made of
  // and the delta is what the crafting took off the finished thing.
  const delta = Number(modifiers?.weightDelta ?? 0) || 0;
  return Math.max(0, Math.round((base * (1 + percent / 100) + delta) * 100) / 100);
}

/**
 * Everything a customisation UI (picker or item sheet) needs in one
 * call: the new price and level, the new max HP, and the full
 * type-specific modifier set (for displaying what changed — damage
 * bonus, DR, ACP, and so on).
 *
 * @param {"weapon"|"armour"|"shield"} itemType
 * @param {{level: number, price: number, hp: number, category?: string}} baseData
 * @param {{quality?: string, material?: string, traitKeys?: string[],
 *   runes?: string, spells?: Array<{name: string, ppCost: number}>}} choices
 *   `spells` is the compendium index the Spell Effect rune is priced
 *   against — passed in rather than fetched, so this stays a pure
 *   function the harnesses can run outside Foundry.
 */
export function computeFullCustomisation(itemType, baseData, choices = {}) {
  const {
    quality = "standard", material = "", traitKeys = [], runes = "", spells = []
  } = choices;
  const tier = QUALITY_TIERS[quality] ?? QUALITY_TIERS.standard;

  const base = computeCustomisedPrice(itemType, baseData.level, baseData.price, {
    quality,
    material,
    traitKeys
  });

  // RUNES ARE PART OF WHAT AN ITEM COSTS (Chapter 11): "to determine the
  // final cost of a magic item, add the cost of the item to the cost of
  // all its runes". Until 3.241.0 they were not in this calculation at
  // all, so a player could inscribe a Potency III and watch the price
  // stay where it was — which is what Graham reported.
  //
  // The rune price is added AFTER quality and material, and the level is
  // then read back off the total, because the level of an enchanted item
  // follows its final price rather than its base one.
  const runeSelection = fieldToRunes(itemType, runes);
  const {
    price: runePrice, problems: runeProblems, limits: runeLimits,
    minimumLevel: runeMinimumLevel = 0, extrapolated: runeExtrapolated = false
  } = priceSelection(itemType, quality, runeSelection, { spells });
  const price = base.price + runePrice;
  // A Spell Effect rune brings its OWN level, off the spell table, which
  // no other rune does — so the item is at least as high a level as the
  // rune it carries even where the item's price ladder disagrees.
  const effectiveLevel = runePrice
    ? Math.max(base.effectiveLevel, itemLevelForPrice(itemType, price), runeMinimumLevel)
    : Math.max(base.effectiveLevel, runeMinimumLevel);

  let modifiers;
  if (itemType === "weapon") {
    modifiers = computeWeaponModifiers(quality, material, traitKeys);
  } else if (itemType === "armour") {
    modifiers = computeArmourModifiers(quality, material, traitKeys, { category: baseData.category });
  } else {
    // A SHIELD'S SIZE IS ITS CATEGORY, and always was — every shield in
    // the pack carries buckler/light/heavy/tower in system.category, and
    // those are the same four words Lightweight's own table is keyed by.
    // Until 3.249.1 the three call sites passed "light" instead (twice
    // hardcoded, once read off system.size, which is the CREATURE size
    // and reads "medium" on every shield there is), so a Lightweight
    // Tower Shield shed 1 lb where its row says 5.
    modifiers = computeShieldModifiers(quality, material, traitKeys, {
      category: baseData.category
    });
  }

  // AND THE POTENCY RUNE'S HIT POINTS (3.615.0, A1 of block 36): armour
  // "+1/+5 … +6/+30", shields "+1/+20 … +4/+80". `_applyRunes` worked the
  // figure out and nothing ever added it, while the Customise panel
  // promised it. Added after quality and material, as a flat amount.
  // A WEAPON'S TOO (3.618.0, Graham's R8 of block 37): +5 HP a potency tier.
  // ONLY ON A WEAPON THAT TRACKS ITS HP. A weapon with no Max HP is never
  // broken — every one the pack ships — and giving a +1 sword 5 HP would make
  // it the most fragile thing in the party's hands.
  const potencyHP = computeRuneModifiers({ kind: itemType, runes, quality }).hp;
  const weaponHP = Math.max(0, Number(baseData.hp) || 0);
  const hpMax = itemType === "weapon"
    ? (weaponHP > 0 ? weaponHP + potencyHP : 0)
    : computeItemHP(baseData.hp, modifiers) + potencyHP;
  const weight = computeItemWeight(baseData.weight, modifiers);

  return {
    effectiveLevel, price, hpMax, weight, modifiers,
    maxTraits: tier.maxTraits,
    runePrice, runeProblems, runeLimits, runeExtrapolated
  };
}

/**
 * The word a creature's weakness field would use for this material.
 *
 * NEW at 3.547.0. The item stores a camelCase KEY (`coldIron`) and the
 * bestiary writes the words a person types (`cold iron`), so something
 * has to translate — and the label is already the authored spelling of
 * exactly that. Derived rather than a second hand-written table, because
 * a second table is a second thing to forget to update.
 *
 * @param {string} materialKey
 * @returns {string} lower-cased material word, or "" for none
 */
export function materialDefenceWord(materialKey) {
  const key = String(materialKey ?? "").trim();
  if (!key) return "";
  const material = MATERIALS[key];
  if (!material) return "";
  // WHAT IT OVERCOMES, NOT WHAT IT IS CALLED (3.573.0).
  //
  // The label was the only answer this gave, and for two materials the
  // label names nothing any creature is weak to. Mithril prints "classed
  // as silver for overcoming resistance" and Alchemical Silver "has all
  // the benefits of silver"; both were handed to the defence layer as
  // "mithril" and "alchemical silver", which `DEFENCE_MATERIALS` does not
  // list — so neither weapon ever bypassed a silver resistance, and the
  // `weaponCountsAsSilver` and `overcomesResistance` fields that record
  // the rule were read by nothing at all. Found in the pages 141-150
  // audit.
  //
  // Cold Iron and Silver are unaffected: their `overcomesResistance` is
  // their own label, so they answer exactly as before.
  if (material.overcomesResistance) {
    return String(material.overcomesResistance).trim().toLowerCase();
  }
  if (material.weaponCountsAsSilver) return "silver";
  return String(material.label ?? "").trim().toLowerCase();
}

/**
 * The weapon traits a weapon's MATERIAL and quality confer.
 *
 * Densewood, Eaog and Mithril each print "weapons gain the Keen trait",
 * and `computeWeaponModifiers` has returned that in `grantedTraits` for
 * as long as the materials have existed — read by nobody. Keen is
 * detected by a regex over the weapon's own `traits` string, and
 * customisation never writes to it, so a Mithril longsword never got its
 * Keen critical. Found in the pages 141-150 audit; this is the reader
 * that makes the computed answer count.
 *
 * Takes the weapon's SYSTEM OBJECT rather than the document, so the rule
 * can be run against a plain object in a harness.
 *
 * @param {object} weaponSystem
 * @returns {string[]} lower-cased trait names, possibly empty.
 */
export function materialGrantedWeaponTraits(weaponSystem) {
  const mods = computeWeaponModifiers(
    weaponSystem?.quality || "standard",
    weaponSystem?.material || "",
    parseGrantList(weaponSystem?.superiorTraits || "")
  );
  return (mods.grantedTraits ?? []).map((trait) => String(trait).trim().toLowerCase()).filter(Boolean);
}

/**
 * Eaog's two wearer-facing effects, read off the armour a character has
 * actually equipped.
 *
 * "All Spell Casting DCs are increased by 2 and the wearer also gains a
 * +2-item bonus to all saving throws against magic." Both figures have
 * been carried on the material since it was written (`spellDCIncrease`,
 * `savingThrowBonusVsMagic`) and neither was read by anything, so Eaog
 * armour granted the good half and charged none of the bad. Found in the
 * pages 141-150 audit; these are the readers.
 *
 * NOT SUMMED ACROSS PIECES. A character in an Eaog breastplate with Eaog
 * greaves is wearing Eaog, not Eaog twice — the rule is a property of
 * the material being worn, and the printed figure is +2 either way. The
 * highest is taken so a future material with a larger figure still wins.
 *
 * Both take plain item arrays so they can be run without an actor.
 */
function equippedMaterialFigure(items, field) {
  let best = 0;
  for (const item of items ?? []) {
    if (item?.type !== "armour" && item?.type !== "shield") continue;
    // THE SAME GATE DRAGONHIDE USES (3.574.0): worn, and not destroyed.
    // A destroyed breastplate warding its wearer against magic was the
    // one thing this could still do wrong. See `wornAndStanding`.
    if (!wornAndStanding(item)) continue;
    const material = MATERIALS[String(item.system.material ?? "").trim()];
    const value = Number(material?.[field] ?? 0) || 0;
    if (value > best) best = value;
  }
  return best;
}

/** "All Spell Casting DCs are increased by 2" — Eaog. */
export function eaogSpellDCIncrease(items = []) {
  return equippedMaterialFigure(items, "spellDCIncrease");
}

/**
 * "+2-item bonus to all saving throws against magic" — Eaog, as a
 * CONDITIONAL row rather than a pooled bonus.
 *
 * Conditional because it applies only against magic, and this system
 * cannot tell a spell from a pit trap: the player ticks it on the check
 * dialog, exactly as the familiar's own +2 against magic works. Pooling
 * it would quietly hand the wearer +2 against a falling rock.
 *
 * Shaped for `collectConditionals`' `declared` channel, which exists for
 * precisely this — a property chosen at the table rather than authored
 * into an item's flags.
 */
export function eaogSaveConditionals(items = []) {
  const value = equippedMaterialFigure(items, "savingThrowBonusVsMagic");
  if (value <= 0) return [];
  return [{
    kind: "modifier",
    value,
    type: "item",
    label: "Eaog armour (vs magic)",
    scope: "Saving throws against magic",
    auto: false,
    when: { checkTypes: ["save"] }
  }];
}

/* ------------------------------------------------------------------ */
/* DRAGONHIDE'S DRAGON                                                 */
/* ------------------------------------------------------------------ */

/**
 * The dragons Dragonhide can be taken from, and the energy each one
 * carries. Graham's table of 19 September 2026:
 *
 *   Cave - Acid        Cold - Cold          Fire - Fire
 *   Forest - Poison    Guardian - Force     Light - Electricity
 *   Sea - Sonic        Shade - Cold and Fire
 *
 * WHY THIS EXISTS. Page 147: "A dragonhide shield provides an additional
 * +2 DB when used against the energy type of the dragon the scales were
 * harvested from. Dragonhide armour grants the wearer resistance against
 * the same energy type." Both figures had been carried on the material
 * (`shieldEnergyDBBonus`, `armourEnergyResistance`) since it was written
 * and neither could ever fire, because nothing recorded WHICH dragon — a
 * rule about "the energy type of the dragon" with no dragon to ask. The
 * pages 141-150 audit found them computed and unread; this table and the
 * `dragonType` field on armour and shields are what they were waiting on.
 *
 * SHADE CARRIES TWO, and both are real: a Shade Dragonhide suit resists
 * cold AND fire, and its shield raises DB against either. Every reader
 * below takes the list, never the first entry.
 *
 * The energy words are the ones `resolveDamageTypeField` recognises, so
 * a resistance written from here is read by the same damage pipeline
 * every other resistance in the game goes through.
 */
export const DRAGONHIDE_DRAGONS = Object.freeze({
  cave: Object.freeze({ label: "Cave", energy: Object.freeze(["acid"]) }),
  cold: Object.freeze({ label: "Cold", energy: Object.freeze(["cold"]) }),
  fire: Object.freeze({ label: "Fire", energy: Object.freeze(["fire"]) }),
  forest: Object.freeze({ label: "Forest", energy: Object.freeze(["poison"]) }),
  guardian: Object.freeze({ label: "Guardian", energy: Object.freeze(["force"]) }),
  light: Object.freeze({ label: "Light", energy: Object.freeze(["electricity"]) }),
  sea: Object.freeze({ label: "Sea", energy: Object.freeze(["sonic"]) }),
  shade: Object.freeze({ label: "Shade", energy: Object.freeze(["cold", "fire"]) })
});

/**
 * The energy types one item's Dragonhide carries, or [] when it is not
 * Dragonhide or no dragon has been chosen.
 *
 * An unknown dragon key answers [] rather than guessing — a suit with no
 * recorded dragon grants nothing, which is what the sheet says about it.
 *
 * @param {object} system An armour or shield's system data.
 * @returns {string[]}
 */
export function dragonhideEnergyTypes(system) {
  if (String(system?.material ?? "").trim() !== "dragonhide") return [];
  const dragon = DRAGONHIDE_DRAGONS[String(system?.dragonType ?? "").trim().toLowerCase()];
  return dragon ? [...dragon.energy] : [];
}

/**
 * Worn, and not destroyed. The gate every worn-material property uses.
 *
 * NOT "not broken": the printed exception to the Broken condition is
 * armour, which "has its DR reduced by 50%" and goes on protecting. A
 * material's inherent protection — Dragonhide's resistance, Eaog's ward
 * against magic — is the same kind of thing as the DR it is built into,
 * so it holds while the piece is broken and ends when it is destroyed.
 * An item with no hit points tracked is never destroyed.
 */
export function wornAndStanding(item) {
  if (!item?.system?.equipped) return false;
  const hp = item.system?.hp;
  const max = Math.max(0, Math.floor(Number(hp?.max) || 0));
  if (max <= 0) return true;
  return Math.floor(Number(hp?.value) || 0) > -Math.ceil(max / 2);
}

/**
 * "Dragonhide armour grants the wearer resistance against the same energy
 * type." Every energy type the wearer's equipped Dragonhide ARMOUR resists,
 * de-duplicated — two Fire Dragonhide pieces are one fire resistance,
 * because resistance halves damage once however many sources grant it.
 *
 * ARMOUR ONLY. The printed sentence gives shields the DB bonus and armour
 * the resistance; a Dragonhide shield resists nothing.
 *
 * @param {object[]} items
 * @returns {string[]} energy words, in first-seen order.
 */
export function dragonhideResistances(items = []) {
  const found = [];
  for (const item of items ?? []) {
    if (item?.type !== "armour" || !wornAndStanding(item)) continue;
    for (const energy of dragonhideEnergyTypes(item.system)) {
      if (!found.includes(energy)) found.push(energy);
    }
  }
  return found;
}

/**
 * "A dragonhide shield provides an additional +2 DB when used against the
 * energy type of the dragon the scales were harvested from."
 *
 * @param {object[]} items The DEFENDER's items.
 * @param {string[]|string} incoming The damage type(s) of the attack
 *   being resolved against them.
 * @returns {number} the bonus to add to DB against THIS attack — +2 or 0,
 *   never more: one shield is used against one attack.
 */
export function dragonhideShieldDB(items = [], incoming = []) {
  const types = (Array.isArray(incoming) ? incoming : [incoming])
    .map((type) => String(type ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (!types.length) return 0;
  let best = 0;
  for (const item of items ?? []) {
    if (item?.type !== "shield" || !wornAndStanding(item)) continue;
    const energies = dragonhideEnergyTypes(item.system);
    if (!energies.some((energy) => types.includes(energy))) continue;
    const bonus = Number(MATERIALS.dragonhide?.shieldEnergyDBBonus ?? 0) || 0;
    if (bonus > best) best = bonus;
  }
  return best;
}

/**
 * The words a sheet shows for an item's dragon: "Fire dragon — fire",
 * "Shade dragon — cold and fire", or "" when none applies.
 */
export function dragonhideLabel(system) {
  const energies = dragonhideEnergyTypes(system);
  if (!energies.length) return "";
  const dragon = DRAGONHIDE_DRAGONS[String(system?.dragonType ?? "").trim().toLowerCase()];
  return `${dragon.label} dragon — ${energies.join(" and ")}`;
}
