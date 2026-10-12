/**
 * TRG Prime check resolution.
 *
 * This module is deliberately free of any Foundry dependency so that it can be
 * reasoned about and tested in isolation. It encodes the Action Resolution
 * Table (Core 3.1, Chapter 4), the Bonus Check Table, the difficulty ladder,
 * and the bonus stacking rules from Appendix 1.
 */

import { criticalSeverity } from "../combat/attack.mjs";

/**
 * Degrees of success, ordered from best to worst.
 * `min` is the inclusive lower bound of the margin (result - DC) for the degree.
 *
 * Core 3.1, Chapter 4, Actions Resolution Table:
 *   Exceeds by 20+       Heroic
 *   Exceeds by 10+       Critical
 *   Equals or Exceeds    Success
 *   Fails by less than 5 Partial
 *   Fails by 5+          Failure
 *   Fails by 10+         Fumble
 *   Fails by 20+         Blunder
 */
export const DEGREES = Object.freeze([
  { key: "heroic", label: "Heroic", min: 20, rank: 6, success: true },
  { key: "critical", label: "Critical", min: 10, rank: 5, success: true },
  { key: "success", label: "Success", min: 0, rank: 4, success: true },
  { key: "partial", label: "Partial", min: -4, rank: 3, success: false },
  { key: "failure", label: "Failure", min: -9, rank: 2, success: false },
  { key: "fumble", label: "Fumble", min: -19, rank: 1, success: false },
  { key: "blunder", label: "Blunder", min: -Infinity, rank: 0, success: false }
]);

/** Fast lookup of a degree definition by key. */
export const DEGREE_BY_KEY = Object.freeze(
  Object.fromEntries(DEGREES.map((degree) => [degree.key, degree]))
);

/**
 * Determine the degree of success for a given margin.
 *
 * @param {number} margin The check result minus the DC.
 * @returns {object} The matching degree definition.
 */
export function resolveDegree(margin) {
  const value = Number(margin);
  if (!Number.isFinite(value)) return DEGREE_BY_KEY.blunder;
  return DEGREES.find((degree) => value >= degree.min) ?? DEGREE_BY_KEY.blunder;
}

/**
 * Bonus Check Table (Core 3.1, Chapter 4).
 * Maps a degree of success to the circumstance modifier it confers, used by
 * Aid, Meditation, and any action carrying the bonus-check trait.
 */
export const BONUS_CHECK_TABLE = Object.freeze({
  heroic: 4,
  critical: 3,
  success: 2,
  partial: 1,
  failure: 0,
  fumble: -1,
  blunder: -2
});

/**
 * Convert a degree key into its Bonus Check Table circumstance modifier.
 * @param {string} degreeKey
 * @returns {number}
 */
export function bonusCheckModifier(degreeKey) {
  return BONUS_CHECK_TABLE[degreeKey] ?? 0;
}

/**
 * The example difficulty ladder (Core 3.1, Chapter 4).
 * `routine` requires no check and `impossible` fails automatically; both are
 * represented so that a GM can select them explicitly.
 */
export const DIFFICULTIES = Object.freeze([
  { key: "routine", label: "Routine (no check)", modifier: 0, auto: "success" },
  { key: "incrediblyEasy", label: "Incredibly easy (DC -10)", modifier: -10 },
  { key: "veryEasy", label: "Very easy (DC -5)", modifier: -5 },
  { key: "easy", label: "Easy (DC -2)", modifier: -2 },
  { key: "medium", label: "Medium (DC +0)", modifier: 0 },
  { key: "hard", label: "Hard (DC +2)", modifier: 2 },
  { key: "veryHard", label: "Very hard (DC +5)", modifier: 5 },
  { key: "incrediblyHard", label: "Incredibly hard (DC +10)", modifier: 10 },
  { key: "impossible", label: "Impossible (auto fail)", modifier: 0, auto: "failure" }
]);

export const DIFFICULTY_BY_KEY = Object.freeze(
  Object.fromEntries(DIFFICULTIES.map((entry) => [entry.key, entry]))
);

/**
 * The next-harder difficulty tier, per the actual DIFFICULTIES table
 * order — used for Resuscitation's "increasing the difficulty of the
 * check by one step" AP-cost trade-off (Chapter 8, Medicine).
 * Already at the hardest tier: returns the same key unchanged, rather
 * than stepping past it into something that doesn't exist.
 *
 * @param {string} currentKey
 * @returns {string}
 */
export function stepDifficultyHarder(currentKey) {
  const index = DIFFICULTIES.findIndex((entry) => entry.key === currentKey);
  if (index === -1 || index >= DIFFICULTIES.length - 1) return currentKey;
  return DIFFICULTIES[index + 1].key;
}

/** The level modifier applied to a level-based DC. */
export const LEVEL_DC_BASE = 14;

/**
 * Calculate a level-based DC.
 * "The DC is equal to the level of the task +14 unless noted otherwise."
 * @param {number} level
 * @returns {number}
 */
export function levelDC(level) {
  return Math.round(Number(level ?? 0)) + LEVEL_DC_BASE;
}

/**
 * The DC a GM typed into a check card's Set DC box, or null when there is
 * none to read.
 *
 * AN EMPTY BOX IS NOT DC 0 (3.577.1; F2 of the 3.577.0 live test).
 * `Number("")` is 0, and 0 is finite, so clicking Set DC with nothing typed
 * resolved the check against DC 0 — a Stay in Saddle total of 2 became a
 * Success, and the rider kept their seat. Blank and non-numeric text are
 * refused; a typed 0 is still a DC, because a GM may mean it.
 *
 * @param {*} value the box's raw value
 * @returns {number|null}
 */
export function parseEnteredDC(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Auto Check (Chapter 4, Using Skills — an optional rule, off by default
 * via its own game setting): forgo rolling a trained skill to instead
 * take a flat 10 + rank bonus, with no other bonuses, penalties, or
 * modifiers applied.
 */
export function autoCheckTotal(ranks) {
  return 10 + Math.max(0, Math.round(Number(ranks ?? 0)));
}

/**
 * Basic Saving Throw (Chapter 1, Glossary of Terms): the standard
 * degree-to-effect pattern many spells and effects reuse, rather than
 * defining their own table each time.
 *
 * Critical: unaffected. Success: half damage. Partial: full damage.
 * Failure: full damage, PLUS additional base damage and a critical
 * whose severity is set by how far the save fell short of the DC — the
 * same 5-14 / 15-24 / 25+ bands (Minor/Serious/Deadly) already used for
 * Attack Value critical severity, reused here rather than duplicated.
 *
 * @param {string} degreeKey One of the standard degree keys.
 * @param {number|null} margin The check result minus the DC (negative on
 *   a failed check) — the same value buildOutcome() already returns.
 * @returns {{damageMultiplier: number, bonusBaseDamage: number,
 *   criticalSeverity: string|null}}
 */
/**
 * A tracked resource's current value can never exceed its maximum —
 * HP, PP, AP, and Conviction all use this. If Max recalculates lower
 * than the current value (a level or Constitution change, for
 * instance), or a manual edit overshoots, clamp back down rather than
 * displaying an impossible value like 45/40.
 */
export function clampResourceValue(value, max) {
  const v = Number(value ?? 0);
  const m = Number(max ?? 0);
  return v > m ? m : v;
}

/** The 0-100 percentage used to size a resource bar, from an
 * already-clamped current value. */
export function resourcePercentage(value, max) {
  const v = Number(value ?? 0);
  const m = Number(max ?? 0);
  return m > 0 ? Math.min(Math.max(Math.round((v / m) * 100), 0), 100) : 0;
}

export function basicSavingThrow(degreeKey, margin = null) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return { damageMultiplier: 0, bonusBaseDamage: 0, criticalSeverity: null };
    case "success":
      return { damageMultiplier: 0.5, bonusBaseDamage: 0, criticalSeverity: null };
    case "partial":
      return { damageMultiplier: 1, bonusBaseDamage: 0, criticalSeverity: null };
    case "failure":
    case "fumble":
    case "blunder": {
      const failedBy = margin === null ? 0 : Math.max(0, -Math.round(Number(margin)));
      const severity = criticalSeverity(failedBy);
      return {
        damageMultiplier: 1,
        bonusBaseDamage: severity?.bonusDice ?? 0,
        criticalSeverity: severity?.severity ?? null
      };
    }
    default:
      return { damageMultiplier: 1, bonusBaseDamage: 0, criticalSeverity: null };
  }
}

/**
 * REMOVED AT 3.549.0: `castSpellDC`.
 *
 * A second definition of the Cast a Spell DC lived here, rounding with
 * Math.round while magic/casting.mjs's `castingDC` rounded with
 * Math.ceil. Nothing called this one — every live caster-side DC came
 * from castingDC — so the disagreement was invisible and would have
 * stayed invisible until the day something imported the wrong one.
 *
 * The rule now has exactly one definition: `castingDC` in
 * magic/casting.mjs, rounding DOWN per Chapter 1 and Graham's ruling of
 * 10 September 2026.
 */

/**
 * Bonus stacking behaviour, per Appendix 1.
 *
 *   "highest"  Only the highest bonus of the type applies. A penalty of the
 *              same type cancels against it.
 *   "stack"    Bonuses of this type stack when gained from different sources.
 *   "dodge"    Always stacks, including with other dodge bonuses.
 */
export const BONUS_TYPES = Object.freeze({
  armour: { label: "Armour", stacking: "highest" },
  circumstance: { label: "Circumstance", stacking: "highest" },
  class: { label: "Class", stacking: "stack" },
  dodge: { label: "Dodge", stacking: "dodge" },
  item: { label: "Item", stacking: "highest" },
  luck: { label: "Luck", stacking: "highest" },
  naturalArmour: { label: "Natural Armour", stacking: "highest" },
  race: { label: "Race", stacking: "stack" },
  resistance: { label: "Resistance", stacking: "highest" },
  shield: { label: "Shield", stacking: "highest" },
  status: { label: "Status", stacking: "highest" },
  untyped: { label: "Untyped", stacking: "stack" }
});

/**
 * Apply Appendix 1 stacking rules to a list of modifiers.
 *
 * Each modifier is `{ label, value, type }`. Modifiers that are suppressed by
 * the stacking rules are returned with `applied: false` so the chat card can
 * show the player exactly what was discarded and why.
 *
 * @param {object[]} modifiers
 * @param {object} [options]
 * @param {object} [options.stacking] Per-type stacking overrides, used where a
 *   specific rule departs from the Appendix 1 default.
 * @returns {{ modifiers: object[], total: number }}
 */
export function applyStacking(modifiers = [], { stacking = {} } = {}) {
  const entries = modifiers
    .filter((modifier) => modifier && Number.isFinite(Number(modifier.value)))
    .map((modifier, index) => ({
      label: String(modifier.label ?? "Modifier"),
      value: Number(modifier.value),
      type: BONUS_TYPES[modifier.type] ? modifier.type : "untyped",
      source: modifier.source ?? "check",
      index,
      applied: true,
      suppressed: null
    }));

  const byType = new Map();
  for (const entry of entries) {
    if (!byType.has(entry.type)) byType.set(entry.type, []);
    byType.get(entry.type).push(entry);
  }

  for (const [type, group] of byType) {
    const rule = stacking[type] ?? BONUS_TYPES[type].stacking;
    if (rule !== "highest") continue;

    // A zero-value modifier is inert; leave it applied but it changes nothing.
    const positives = group.filter((entry) => entry.value > 0);
    const negatives = group.filter((entry) => entry.value < 0);

    // "you may only apply the highest value of the two"
    if (positives.length > 1) {
      const best = positives.reduce((a, b) => (b.value > a.value ? b : a));
      for (const entry of positives) {
        if (entry === best) continue;
        entry.applied = false;
        entry.suppressed = `Does not stack with a higher ${BONUS_TYPES[type].label.toLowerCase()} bonus`;
      }
    }

    // Penalties of the same type likewise do not stack with each other; the
    // most severe applies and cancels against the surviving bonus.
    if (negatives.length > 1) {
      const worst = negatives.reduce((a, b) => (b.value < a.value ? b : a));
      for (const entry of negatives) {
        if (entry === worst) continue;
        entry.applied = false;
        entry.suppressed = `Does not stack with a greater ${BONUS_TYPES[type].label.toLowerCase()} penalty`;
      }
    }
  }

  const total = entries.reduce(
    (sum, entry) => (entry.applied ? sum + entry.value : sum),
    0
  );

  return { modifiers: entries, total };
}

/**
 * Build the complete outcome of a check from its component parts.
 *
 * @param {object} options
 * @param {number} options.dieTotal Result of the die (or open-ended chain).
 * @param {object[]} [options.modifiers] Typed modifier list.
 * @param {number|null} [options.dc] The DC, or null if unknown to the roller.
 * @param {boolean} [options.chaos] Whether a chaos result was triggered.
 * @param {string|null} [options.auto] "success" or "failure" to force a result.
 * @returns {object}
 */
export function buildOutcome({
  dieTotal,
  modifiers = [],
  dc = null,
  chaos = false,
  auto = null,
  stacking = {}
} = {}) {
  const stacked = applyStacking(modifiers, { stacking });
  const total = Number(dieTotal) + stacked.total;

  const hasDC = dc !== null && dc !== undefined && Number.isFinite(Number(dc));
  const target = hasDC ? Number(dc) : null;
  const margin = hasDC ? total - target : null;

  let degree = null;
  if (auto === "success") degree = DEGREE_BY_KEY.success;
  else if (auto === "failure") degree = DEGREE_BY_KEY.failure;
  else if (hasDC) degree = resolveDegree(margin);

  return {
    dieTotal: Number(dieTotal),
    modifiers: stacked.modifiers,
    modifierTotal: stacked.total,
    total,
    dc: target,
    margin,
    degree,
    chaos: Boolean(chaos),
    auto: auto ?? null,
    bonusCheck: degree ? bonusCheckModifier(degree.key) : null
  };
}
