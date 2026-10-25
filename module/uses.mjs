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

/**
 * EVERY FOCUS FEAT AND ABILITY IS ONE USE TOO (3.665.0; Inner Tempest's D1,
 * approved by Graham on 21 October 2026).
 *
 * The rule above covered innate spells only, so a feat or ability carrying
 * the Focus trait with no printed count was untracked: never spent, never
 * refused, never offered to Refocus. Five core feats were in that state
 * (Ebon Bind, Ferocious Charge, Injury Relief, Primal Shape, Void Step),
 * with one Fiends & Fables feat and its creatures' Focus breaths and
 * screeches, and every Inner Tempest technique would have been.
 *
 * FEATS AND ABILITIES ONLY, beside the innate-spell rule. A spell that is
 * not innate is cast from Power Points and its Focus trait is not a count;
 * the Channels and form spells write a blank count on purpose so their
 * shared pool is the only counter (feats-workflow), and both stay as they
 * were.
 *
 * Pure: the item's system data and type in, the implied count out (null
 * when no default applies). `itemUsesMax` and item creation read this.
 */
export const FOCUS_DEFAULT_TYPES = Object.freeze(["feat", "ability"]);

export function focusDefaultUses(system, type = "spell") {
  if (type === "spell") return focusInnateDefaultUses(system, type);
  if (!FOCUS_DEFAULT_TYPES.includes(String(type ?? ""))) return null;
  if (String(system?.usesPerDay ?? "").trim()) return null;
  return /\bfocus\b/i.test(String(system?.traits ?? "")) ? 1 : null;
}

/**
 * SPENT BY THE USE BUTTON (3.665.1). Found in the live test of 3.665.0: D1
 * gave Void Step, Abyssal Healing and the rest a count of one, but their own
 * Use handlers were written when they had none, so nothing spent it and
 * nothing refused a spent one. Each of those handlers would need the same two
 * lines; the Use button is the one place they all pass through, so it gates
 * and spends there, for the DEFAULTED count only — an item that prints a
 * count has a handler that already spends it (Crusader's Mercy).
 *
 * Pure: whether the Use should spend the use now.
 *   max      focusDefaultUses for the item (null: not a defaulted count)
 *   before   the stored count when the Use began
 *   after    the stored count when its handler returned
 *   acted    whether the handler did something (it posted a card)
 *
 * Not spent when the handler spent it itself (the area-ability path does),
 * when it was refused or cancelled (no card), or when it reported failure.
 */
export function focusDefaultSpend({ max = null, before = NaN, after = NaN, acted = false, result } = {}) {
  if (max === null || max === undefined) return false;
  if (result === false || result === null) return false;
  if (!acted) return false;
  const b = Number(before), a = Number(after);
  if (!Number.isFinite(b) || b <= 0) return false;
  return a === b;
}

/**
 * Item source data with a defaulted Focus count primed to its one use, or
 * null when nothing needs writing.
 *
 * THE STORED COUNT STARTS AT 0, which reads as spent. An item dropped on a
 * sheet is primed by its own `_preCreate`; an actor arriving WITH its items
 * (a creature imported from Fiends & Fables, a duplicate) is primed by the
 * actor's, through this.
 *
 * @param {object} itemSource an item's source data ({type, system})
 * @returns {number|null} the usesValue to store, or null
 */
export function focusDefaultPrime(itemSource) {
  const max = focusDefaultUses(itemSource?.system ?? {}, itemSource?.type);
  if (max === null) return null;
  const stored = Number(itemSource?.system?.usesValue);
  return Number.isFinite(stored) && stored >= max ? null : max;
}

export function usesMax(formula, attributeTotals, bonus = 0, level = null) {
  const resolved = resolveUsesPerDay(formula, attributeTotals, level);
  if (resolved === null) return null;
  if (resolved === Infinity) return Infinity;
  return resolved + Math.max(0, Math.floor(Number(bonus) || 0));
}
