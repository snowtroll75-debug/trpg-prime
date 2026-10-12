/**
 * The damage runes (Chapter 11) — what a runed weapon adds to a strike.
 *
 * Seven runes deal damage of their own, and this is the arithmetic of
 * it. The damage is SECONDARY: a separate packet of a different type,
 * which goes through the target's own resistances independently of the
 * weapon's. A creature resistant to fire resists a Flaming rune's 1d4
 * and takes the sword's slashing damage in full, and the only way to get
 * that right is to keep the packets apart.
 *
 * THE FIVE ELEMENTAL RUNES SHARE ONE LADDER, printed identically five
 * times over:
 *
 *   I    1d4
 *   II   2d4 and a secondary critical at -40
 *   III  3d4 and a secondary critical at -20
 *
 * DISRUPTING IS NOT ONE OF THEM, though it looks like it. Its tier I
 * already carries a secondary critical where an elemental rune's has
 * none — and its tier II carries one with NO MODIFIER AT ALL, which is
 * the only unpenalised secondary critical in the chapter:
 *
 *   "DISRUPTING II ... The weapon inflicts 2d4 damage and a secondary
 *    critical."
 *
 * VICIOUS COSTS THE WIELDER. "An extra 2d4 secondary essence damage,
 * half of it (round up) feeding back into the wielder" — so it is the
 * one rune that produces damage in both directions.
 *
 * "A SECONDARY CRITICAL AT -40" (Graham's R10 of block 37, 3.618.0): only
 * when the STRIKE ITSELF is a critical, rolled on the rune's own damage
 * type's table at the strike's own severity, with that modifier. Until
 * 3.618.0 it was rolled on every hit, always as a minor injury.
 *
 * THE ENERGY RUNES ARE SWITCHED ON (R9): "Activate Command (1 AP) … When
 * active". Command (1 AP) switches one on, and it stays on until switched
 * off, which is free. Flametooth's flames are "eternal" and always on. A
 * batch of runed AMMUNITION has nothing to switch: its runes work when it is
 * fired (block 37, B1).
 *
 * DISRUPTING DEALS ESSENCE (block 37, A3). "Secondary essence damage" — the
 * pack said "positive", which is no damage type, so the packet took full DR,
 * never met an essence weakness and rolled its critical on the slashing
 * table.
 *
 * ALIGNED AND BANE ARE ROLLED (R12). Aligned's 1d4 is ALIGNED damage of the
 * chosen trait, and it harms only a creature of the opposing trait; Bane's
 * 2d4 is added against a creature of the chosen kind, read as a creature
 * trait.
 *
 * Pure functions, no Foundry API: the workflow rolls and applies, this
 * decides what.
 */

import { fieldToRunes } from "./rune-catalogue.mjs";
// ROMAN TIERS EVERYWHERE (Graham's ruling, 18 Aug 2026). Chapter 11
// prints every rune tier in roman, the customise dialog offers them in
// roman, and the field itself stores them in roman — this card was the
// one place that said "Disrupting 1". Found while watching Blade Ally's
// rune land at the dice.
import { roman } from "./runes.mjs";
import { baneMatches, runeUsageAllows, weaponUsage } from "./weapon-rune-usage.mjs";
import { alignedDamageAffects } from "./creature-traits.mjs";

/** The elemental runes and the energy each one deals. */
export const ENERGY_RUNES = Object.freeze({
  acidic: "acid",
  flaming: "fire",
  frost: "cold",
  shock: "electricity",
  thundering: "sonic"
});

/** The ladder all five share. `secondaryCritical` is null for none. */
const ENERGY_LADDER = Object.freeze([
  { dice: "1d4", secondaryCritical: null },
  { dice: "2d4", secondaryCritical: -40 },
  { dice: "3d4", secondaryCritical: -20 }
]);

/**
 * Every rune that deals damage, by tier.
 *
 * `conditional` marks the two whose damage depends on WHO is being hit —
 * the system cannot know whether that guard is a canine or a devil — so
 * they are reported for the table to apply rather than rolled.
 */
export const DAMAGE_RUNES = Object.freeze({
  ...Object.fromEntries(Object.entries(ENERGY_RUNES).map(([key, energy]) => [
    key, { label: key[0].toUpperCase() + key.slice(1), type: energy, tiers: ENERGY_LADDER }
  ])),
  disrupting: {
    label: "Disrupting",
    // "Secondary essence damage" (block 37, A3): it said "positive".
    type: "essence",
    tiers: Object.freeze([
      { dice: "1d4", secondaryCritical: -20 },
      // No modifier printed, and that is the point of the tier.
      { dice: "2d4", secondaryCritical: 0 }
    ])
  },
  vicious: {
    label: "Vicious",
    type: "essence",
    tiers: Object.freeze([{ dice: "2d4", secondaryCritical: null }]),
    // "half of it (round up) feeding back into the wielder"
    feedback: (total) => Math.ceil(Math.max(0, Number(total) || 0) / 2)
  },
  bane: {
    label: "Bane",
    type: "",            // the weapon's own type: "an additional 2d4 damage"
    conditional: true,
    addsToStrike: true,  // added to the weapon's own roll, not a packet beside it
    against: "the chosen kind of creature",
    tiers: Object.freeze([{ dice: "2d4", secondaryCritical: null }])
  },
  aligned: {
    label: "Aligned",
    // "1d4 secondary damage of the appropriate type" — the aligned damage
    // type, of the trait chosen (R12).
    type: "aligned",
    conditional: true,
    against: "creatures with the opposing alignment trait",
    tiers: Object.freeze([{ dice: "1d4", secondaryCritical: null }])
  }
});

/** The state flag an energy rune is switched on under (R9). */
export function energyRuneState(key) {
  return `${key}Active`;
}

/**
 * Is this energy rune switched on? Always, for a specific item whose page
 * says so (Flametooth's "eternal" flames, `specificItem.alwaysActive`), and
 * for ammunition, which has nothing to switch.
 */
export function energyRuneActive(item, key) {
  if (item?.type === "ammunition") return true;
  const flags = item?.flags?.["trg-prime"] ?? {};
  if ((flags.specificItem?.alwaysActive ?? []).includes(key)) return true;
  return Boolean(flags.runeState?.[energyRuneState(key)]);
}

/**
 * What this weapon's (or this batch of ammunition's) runes add to a strike.
 *
 * @param {object} item a weapon or ammunition, with `system.runes`
 * @param {object} [options]
 * @param {object|null} [options.target] the struck creature's system data:
 *   Aligned and Bane answer whether they apply from it
 * @returns {Array<{key, label, dice, type, secondaryCritical, conditional,
 *   against, parameter, feedbackOf, applies, addsToStrike, why}>}
 */
export function runeDamageFor(item, { target = null } = {}) {
  const isAmmunition = item?.type === "ammunition";
  if (item?.type !== "weapon" && !isAmmunition) return [];
  const usage = weaponUsage(item?.system, { ammunition: isAmmunition });
  const out = [];
  for (const chosen of fieldToRunes("weapon", item?.system?.runes ?? "")) {
    const rune = DAMAGE_RUNES[chosen.key];
    if (!rune) continue;
    // SUPPRESSED on a weapon it cannot be inscribed on (B10).
    if (!runeUsageAllows(chosen.key, usage).ok) continue;
    // SWITCHED ON, for the five energy runes (R9).
    if (ENERGY_RUNES[chosen.key] && !energyRuneActive(item, chosen.key)) continue;
    const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
    // A tier above what the rune prints takes the highest it does print,
    // rather than reaching past the end of the ladder for `undefined`.
    const step = rune.tiers[Math.min(tier, rune.tiers.length) - 1];
    if (!step) continue;
    const parameter = chosen.parameter ?? "";
    // WHO IT REACHES (R12), answered when the target is known.
    let applies = !rune.conditional;
    let why = "";
    if (rune.conditional && target) {
      if (chosen.key === "aligned") {
        applies = alignedDamageAffects(parameter, target);
        why = applies ? "" : `it harms only a creature with the trait opposing ${parameter || "its own"}`;
      } else if (chosen.key === "bane") {
        applies = baneMatches(parameter, target);
        why = applies ? "" : `it is not ${parameter || "the chosen kind"}`;
      }
    }
    out.push({
      key: chosen.key,
      label: `${rune.label}${rune.tiers.length > 1 ? ` ${roman(tier)}` : ""}`,
      dice: step.dice,
      // An empty type means the weapon's own — Bane adds to the strike
      // rather than alongside it.
      type: rune.type,
      secondaryCritical: step.secondaryCritical,
      conditional: Boolean(rune.conditional),
      // Known only with a target; without one the card still says so.
      resolved: Boolean(rune.conditional && target),
      applies,
      why,
      addsToStrike: Boolean(rune.addsToStrike),
      against: rune.against ?? "",
      parameter,
      feedbackOf: rune.feedback ?? null
    });
  }
  return out;
}

/**
 * The line a card prints for one rune's contribution.
 *
 * Kept here so the workflow does not carry the wording, and so the
 * harness can check that a conditional rune SAYS it is conditional
 * rather than being silently skipped.
 */
export function runeDamageLine(entry, rolled) {
  if (entry.conditional && !entry.resolved) {
    const against = entry.parameter
      ? `${entry.parameter}`
      : entry.against;
    return `<strong>${entry.label}</strong> — ${entry.dice} extra damage against ${against}. Apply if it applies.`;
  }
  if (entry.conditional && !entry.applies) {
    return `<strong>${entry.label}${entry.parameter ? ` (${entry.parameter})` : ""}</strong> — no extra damage: ${entry.why}.`;
  }
  const crit = entry.secondaryCritical === null
    ? ""
    : ` Secondary critical at ${entry.secondaryCritical > 0 ? "+" : ""}${entry.secondaryCritical || 0} on a critical strike.`;
  const type = entry.type === "aligned" && entry.parameter ? `${entry.parameter} aligned` : entry.type;
  return `<strong>${entry.label}</strong> — ${rolled} ${type} damage (${entry.dice}).${crit}`;
}

/**
 * THE SECONDARY CRITICAL (R10): rolled only when the strike is a critical,
 * at the strike's own severity, with the rune's modifier. Null when none.
 *
 * @param {{secondaryCritical: number|null}} entry
 * @param {string|null} strikeSeverity minor | serious | deadly, or null
 * @returns {{severity: string, modifier: number}|null}
 */
export function secondaryCriticalFor(entry, strikeSeverity) {
  if (entry?.secondaryCritical === null || entry?.secondaryCritical === undefined) return null;
  if (!strikeSeverity) return null;
  return { severity: strikeSeverity, modifier: Number(entry.secondaryCritical) || 0 };
}
