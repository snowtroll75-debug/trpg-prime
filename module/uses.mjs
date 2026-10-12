/**
 * Uses-per-day (Chapter 5 feats and abilities repeatedly say things like
 * "3/day" or "an amount of times per day equal to your Charisma"; Chapter 8
 * Daily Preparation resets them). Pure resolver; the Foundry glue lives in
 * uses-workflow.mjs and Daily Preparation.
 *
 * Every formula the rulebook actually uses is one of: a flat integer, an
 * ability-score name (the raw score, e.g. Crusader's Mercy's "times per
 * day equal to your Charisma"), or "unlimited" (some runes). Rather than
 * pull in Foundry's `@path` roll-data syntax — which nothing else in this
 * codebase uses, since every other formula resolves its numbers in JS
 * before building the dice string — this keeps the same house style.
 */

const ATTRIBUTE_KEYS = [
  "strength",
  "dexterity",
  "constitution",
  "intelligence",
  "wisdom",
  "charisma"
];

/**
 * Resolve a uses-per-day formula to a number of daily uses.
 *
 * @param {string} formula Empty string means "not tracked" (no limit
 *   worth recording, not the same as 0 uses).
 * @param {object} attributeTotals Keyed by the six ability names, each the
 *   actor's total score for that ability.
 * @param {number|null} [level] The character's level, for levelled
 *   formulas ("1, 2 at 15th"). Null when the caller has no level to
 *   offer — the base figure applies.
 * @returns {number|null} A non-negative integer, Infinity for "unlimited",
 *   or null if the formula is empty or unrecognised.
 */
export function resolveUsesPerDay(formula, attributeTotals = {}, level = null) {
  const trimmed = String(formula ?? "").trim();
  if (!trimmed) return null;

  // A LEVELLED formula: "1, 2 at 15th" — a base figure, then
  // comma-separated steps of "<uses> at <level>th". The highest step the
  // character has reached wins; with no level to hand, the base applies.
  // The Fighter's Unbreakable Resolve ("Once per day ... At 15th level,
  // ... twice per day") is the first thing in the book to need it —
  // before this, the field would have given a 15th-level Fighter one
  // reroll a day for their whole career: a definite wrong number, the
  // same shape of defect the Cleric's "Charisma +1" fixed at 3.209.0.
  if (trimmed.includes(",")) {
    const [head, ...rest] = trimmed.split(",").map((part) => part.trim());
    const base = Number(head);
    const steps = rest.map((part) =>
      /^(\d+)\s+at\s+(\d+)(?:st|nd|rd|th)?(?:\s+level)?$/i.exec(part)
    );
    if (Number.isFinite(base) && steps.every(Boolean)) {
      let uses = Math.max(0, Math.floor(base));
      const have = Math.floor(Number(level) || 0);
      for (const step of steps) {
        if (have >= Number(step[2])) {
          uses = Math.max(uses, Math.max(0, Math.floor(Number(step[1]))));
        }
      }
      return uses;
    }
    return null;
  }

  if (/^unlimited$/i.test(trimmed)) return Infinity;

  const flat = Number(trimmed);
  if (Number.isFinite(flat)) return Math.max(0, Math.floor(flat));

  const key = trimmed.toLowerCase();
  if (ATTRIBUTE_KEYS.includes(key)) {
    return Math.max(0, Math.floor(Number(attributeTotals[key]) || 0));
  }

  // "Charisma +1" — an ability score with a flat adjustment. The Cleric's
  // Channels is the first thing in the book to need it: "a number of
  // times each day equal to your Charisma modifier +1". Before 3.209.0
  // the field could only hold the bare ability name, so a Cleric with
  // Cha +3 got three Channels a day for their whole career instead of
  // four — a definite wrong number rather than an untracked one.
  //
  // NOT folded into the item's Bonus Uses field, which already means
  // something else: that is where a feat's "two additional times per
  // day" lands, and a class's own +1 sitting there would be overwritten
  // by the first feat that raised it.
  const adjusted = /^([a-z]+)\s*([+-])\s*(\d+)$/i.exec(trimmed);
  if (adjusted) {
    const base = adjusted[1].toLowerCase();
    if (ATTRIBUTE_KEYS.includes(base)) {
      const score = Math.floor(Number(attributeTotals[base]) || 0);
      const delta = Number(adjusted[3]) * (adjusted[2] === "-" ? -1 : 1);
      return Math.max(0, score + delta);
    }
  }

  return null;
}

/**
 * The full daily maximum: the resolved formula plus any flat bonus uses
 * (from feats such as "you can use Channel Energy two additional times per
 * day" — applied manually to the item's Bonus Uses field for now; see the
 * README for why this isn't yet feat-automated).
 */
/**
 * A GRANTED FOCUS INNATE SPELL IS ONE USE PER REFOCUS (Graham, 17 Sep 2026).
 *
 * The 14 August rule put the Focus trait on every innate spell a heritage
 * or feat grants; but a Focus item with no per-day count was untracked —
 * casting it spent nothing and Refocus ("restores an ability with the
 * Focus trait") never saw it as spent. So a spell that is innate, carries
 * Focus and prints no count has a count of ONE: spent on the cast,
 * restored by Refocus on that spell, or by Daily Preparation.
 *
 * Pure: the item's system data in, the implied per-day count out (null
 * when the rule does not apply). Read by `itemUsesMax` before the formula.
 */
export function focusInnateDefaultUses(system, type = "spell") {
  if (type !== "spell") return null;
  if (!system?.innate) return null;
  if (String(system?.usesPerDay ?? "").trim()) return null;
  return /\bfocus\b/i.test(String(system?.traits ?? "")) ? 1 : null;
}

export function usesMax(formula, attributeTotals, bonus = 0, level = null) {
  const resolved = resolveUsesPerDay(formula, attributeTotals, level);
  if (resolved === null) return null;
  if (resolved === Infinity) return Infinity;
  return resolved + Math.max(0, Math.floor(Number(bonus) || 0));
}
