/**
 * TWO ABILITY SCORES TRADED (3.672.0; Inner Tempest's Ability Inversion,
 * Block 8's C1). Pure; no Foundry.
 *
 *   "The targets highest and lowest ability score (casters choice for any
 *    ties) are switched for an amount of time based upon the result of
 *    their saving throw."
 *
 * THE TOTALS TRADE, by Graham's ruling of 26 October 2026 (B8-1): a
 * creature's ability is its total, base and every bonus together. So the
 * highest takes the lowest's total and the lowest the highest's.
 *
 * THROUGH THE BONUS POOL, NOT BY WRITING THE BASE. The effect adds the
 * difference to each: the highest an untyped −(high − low), the lowest an
 * untyped +(high − low). Untyped entries always stack, so the two totals
 * land exactly on each other's figures, every number derived from them
 * follows (Defence, saves, skills, carrying), and the effect ending puts
 * everything back with nothing to restore. A bonus gained during the spell
 * adds on top, as the ruling says.
 *
 * ONE DURATION PER RUNG, BY ROWS. The book prints a length per save
 * result, and each rung is its own `abilitySwap` row gated by `onSave`
 * with its own `duration` — the machinery every save spell already uses.
 * The row itself carries only an optional label.
 */
import { ATTRIBUTE_KEYS } from "../config.mjs";

/** The effect flag that marks a creature's traded scores. */
export const ABILITY_SWAP_FLAG = "abilitySwap";

const text = (v) => String(v ?? "").trim();

/** "dexterity" → "Dexterity". */
export function abilityLabel(key) {
  const k = text(key);
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : "";
}

/**
 * The row, or null when it is not one.
 * @returns {{label: string}|null}
 */
export function normaliseAbilitySwap(row) {
  if (!row || row.kind !== "abilitySwap") return null;
  return { label: text(row.label) || "Ability Inversion" };
}

/**
 * Which scores are highest and lowest.
 *
 * TIES ARE RETURNED WHOLE, never broken here: the book gives them to the
 * caster, so the workflow asks. A creature whose scores are all equal has
 * nothing to trade, and gets null.
 *
 * @param {object} attributes `system.attributes`, each with a `total`
 * @returns {null|{high: number, low: number, highKeys: string[], lowKeys: string[]}}
 */
export function abilitySwapCandidates(attributes) {
  const scores = ATTRIBUTE_KEYS
    .map((key) => ({ key, total: Number(attributes?.[key]?.total) }))
    .filter((s) => Number.isFinite(s.total));
  if (scores.length < 2) return null;
  const high = Math.max(...scores.map((s) => s.total));
  const low = Math.min(...scores.map((s) => s.total));
  if (high === low) return null;
  return {
    high,
    low,
    highKeys: scores.filter((s) => s.total === high).map((s) => s.key),
    lowKeys: scores.filter((s) => s.total === low).map((s) => s.key)
  };
}

/**
 * The two pool entries that trade the totals.
 * @param {string} customType the CUSTOM change type (effect-change-types.mjs)
 */
export function abilitySwapChanges(highKey, lowKey, high, low, customType = "custom") {
  const gap = Number(high) - Number(low);
  return [
    { key: `system.attributes.${highKey}.untyped`, type: customType, value: String(-gap) },
    { key: `system.attributes.${lowKey}.untyped`, type: customType, value: String(gap) }
  ];
}

/** What the effect records, so the card and a later reader can say what was traded. */
export function abilitySwapFlag(highKey, lowKey, high, low) {
  return { high: highKey, low: lowKey, highTotal: Number(high), lowTotal: Number(low) };
}

/** Does the creature already carry a trade? A second would trade the traded scores. */
export function abilitySwapOn(effects = [], systemId = "trg-prime") {
  return Array.from(effects ?? []).some((e) => !e?.disabled && e?.flags?.[systemId]?.[ABILITY_SWAP_FLAG]);
}

/** The cast card's line. */
export function abilitySwapLine(name, highKey, lowKey, high, low) {
  return `${name}: <strong>${abilityLabel(highKey)}</strong> ${high} and <strong>${abilityLabel(lowKey)}</strong> ${low} `
    + `are switched — ${abilityLabel(highKey)} is now ${low} and ${abilityLabel(lowKey)} ${high}`;
}
