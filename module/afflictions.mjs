import { levelDC } from "./dice/resolution.mjs";
import { afflictionRarityRaise } from "./trait-rules.mjs";

/**
 * Afflictions — poisons, diseases, curses (Core 3.1, Chapter 8, format
 * demonstrated by Chapter 6's poison stat blocks). Pure logic; the Foundry
 * workflow in combat/affliction-workflow.mjs drives the actual rolls and
 * item state.
 *
 * Both outcome tables in the rulebook are sparse — they list only some of
 * the seven degrees — so the interpolations below are recorded as
 * amendments rather than silently assumed:
 *
 *   Initial exposure only lists Success/Failure/Fumble. Heroic and
 *   Critical are treated as Success (unaffected, better results cap at
 *   the best listed outcome). Partial is treated as Failure (the ladder
 *   sits it just below Success, so it takes Failure's stage-1 entry
 *   rather than Fumble's worse stage-2). Blunder is treated as Fumble
 *   (worse than Fumble but nothing worse is defined, so it repeats the
 *   worst listed tier rather than inventing a stage 3 start).
 *
 *   Stage progression only lists Critical/Success/Failure/Fumble. Heroic
 *   is capped at Critical's -2 (nothing better is defined). Partial sits
 *   between Success (-1) and Failure (+1) on the ladder, with no listed
 *   entry of its own — treated as no change, matching how a "Partial"
 *   result elsewhere in this ruleset typically means "an outcome with no
 *   extra penalty" rather than a lesser version of Failure. Blunder is
 *   capped at Fumble's +2 for the same reason as the exposure table.
 */

/** Initial exposure: whether the target is affected, and which stage they
 * start at once incubation ends. */
export function initialExposureOutcome(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
    case "success":
      return { affected: false, startingStage: 0 };
    case "partial":
    case "failure":
      return { affected: true, startingStage: 1 };
    case "fumble":
    case "blunder":
      return { affected: true, startingStage: 2 };
    default:
      return { affected: true, startingStage: 1 };
  }
}

/**
 * The stage an exposure starts at, held to the stages the affliction has.
 *
 * A FUMBLE AGAINST A ONE-STAGE AFFLICTION IS STAGE 1 (3.578.0). The table
 * above says a Fumble starts at stage 2; Oil of Taggit has only one, and
 * a stage that does not exist posted nothing and applied nothing — the
 * worst result on the die was the one that did the least.
 *
 * @param {number} startingStage
 * @param {number} maxStage
 * @returns {number}
 */
export function exposureStartingStage(startingStage, maxStage) {
  const start = Math.max(0, Math.floor(Number(startingStage) || 0));
  const cap = Math.max(1, Math.floor(Number(maxStage) || 1));
  return Math.min(start, cap);
}

/** Stage progression, rolled at the end of each stage's interval. */
export const STAGE_DELTA = Object.freeze({
  heroic: -2,
  critical: -2,
  success: -1,
  partial: 0,
  failure: 1,
  fumble: 2,
  blunder: 2
});

export function stageDelta(degreeKey) {
  return STAGE_DELTA[degreeKey] ?? 0;
}

/**
 * Apply a stage change. "If the affliction's stage is ever reduced below
 * 1, the affliction ends. If the stage is increased beyond its maximum
 * value, the affliction instead repeats the effects of its highest
 * stage" — so the stage number itself never exceeds maxStage.
 *
 * @param {number} currentStage
 * @param {number} delta
 * @param {number} maxStage
 * @returns {{stage: number, ended: boolean}}
 */
export function applyStageChange(currentStage, delta, maxStage) {
  const next = Math.floor(Number(currentStage) || 0) + Math.floor(Number(delta) || 0);
  const cap = Math.max(1, Math.floor(Number(maxStage) || 1));

  if (next < 1) return { stage: 0, ended: true };
  return { stage: Math.min(next, cap), ended: false };
}

/**
 * The affliction's saving throw DC: level-based, and "more difficult to
 * resist if it has a rarity trait".
 *
 * THE NUMBER IS PRINTED (3.622.0; block 39's A19, Graham's R10). This said
 * the rulebook gave none, so the rarity raise was whatever the GM typed and
 * usually nothing. Appendix 3 gives it: Rare "+5", Uncommon "+2". Given the
 * affliction's system data, the raise is the GM's own modifier when one is
 * set and the page's otherwise; a bare number is still taken as the
 * modifier.
 */
export function afflictionSaveDC(level, rarity = 0) {
  const raise = rarity && typeof rarity === "object"
    ? afflictionRarityRaise(rarity)
    : Math.floor(Number(rarity) || 0);
  return levelDC(level) + raise;
}

/* ══════════════════════════════════════════════════════════════════════
 * THE CLOCKS (3.583.0; the pages 231-240 audit's D2, D3 and D4, and
 * Graham's R3, R4 and R5 of 22 September 2026).
 *
 * Page 232 gives an affliction three spans and the system understood one
 * of them:
 *
 *   INCUBATION was printed and ignored. The exposure save set
 *   `incubating: false` and applied the starting stage in the next line,
 *   while the card said "once incubation passes". The page is explicit —
 *   "during this time, the target suffers no adverse conditions" — so
 *   Filth Fever's 1d4 hours and Blinding Sickness's day arrived at once.
 *
 *   A STAGE INTERVAL only advanced in ROUNDS. Both printed diseases use
 *   a day, so after exposure the whole progression was a button somebody
 *   had to remember.
 *
 *   DURATION was read in rounds and stored as a string otherwise, so an
 *   affliction measured in days never ran out.
 *
 * WHY A FORMULA AND A UNIT RATHER THAN SECONDS. "Incubation 1d4 hours"
 * is a roll, and rolling belongs to the workflow — a pure module that
 * reached for dice would be untestable and would roll at parse time,
 * giving every reader of the text a different answer. This returns what
 * was written; the caller rolls it once and stamps the result.
 *
 * AN OPEN SPAN IS NOT ZERO. "Until cured", "until full moon" and
 * "varies" are spans with no end this system can compute, and the
 * difference between "no end" and "ends now" is the difference between
 * a curse and nothing at all.
 * ═══════════════════════════════════════════════════════════════════ */

/** Seconds in each unit the book writes spans in. */
export const UNIT_SECONDS = Object.freeze({
  round: 6,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800,
  month: 2592000,
  year: 31536000
});

/*
 * THERE IS NO `OPEN_SPAN` PATTERN, and there was one until the mutation
 * runner proved it did nothing. "Until cured", "varies" and "permanent"
 * all fail the SPAN pattern below and fall through to the same `open`
 * answer the named pattern gave them, so the two branches were one
 * branch wearing a hat. A check cannot see the difference because there
 * is none.
 */
/** A span that has already elapsed by the time it is read. */
const INSTANT_SPAN = /^(?:instant|instantaneous|none|immediate|-|—)$/i;
const SPAN = /^(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)\s*(round|minute|min|hour|hr|day|week|month|year)s?$/i;

const UNIT_ALIASES = Object.freeze({ min: "minute", hr: "hour" });

/**
 * Read one of page 232's spans.
 *
 * @param {string} text as printed on the affliction
 * @returns {{kind: "instant"} | {kind: "open", reason: string}
 *   | {kind: "span", formula: string, unit: string, seconds: number|null} | null}
 *   null when there is nothing written at all.
 */
export function afflictionSpan(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  if (INSTANT_SPAN.test(raw)) return { kind: "instant" };

  const match = SPAN.exec(raw);
  if (!match) return { kind: "open", reason: raw };

  const unit = UNIT_ALIASES[match[2].toLowerCase()] ?? match[2].toLowerCase();
  const literal = /^\d+$/.test(match[1]) ? Number(match[1]) : null;
  return {
    kind: "span",
    formula: match[1],
    unit,
    // A LITERAL RESOLVES HERE; a formula waits for the caller's roll.
    seconds: literal === null ? null : literal * UNIT_SECONDS[unit]
  };
}

/** Turn a rolled amount and a unit into seconds. */
export function spanSeconds(amount, unit) {
  const per = UNIT_SECONDS[String(unit ?? "").toLowerCase()];
  if (!per) return null;
  return Math.max(0, Math.floor(Number(amount) || 0)) * per;
}

/**
 * Is a stamped deadline due?
 *
 * A NULL DEADLINE IS NEVER DUE, which is the whole point: an affliction
 * with an open duration and one with a duration of zero must not be
 * confused, and `Number(null)` is 0 — the mistake block 22's water clock
 * shipped with.
 *
 * @param {number|null} at the stamped world time
 * @param {number} worldTime now
 * @returns {boolean}
 */
export function deadlineDue(at, worldTime) {
  if (at === null || at === undefined || at === "") return false;
  const stamp = Number(at);
  if (!Number.isFinite(stamp)) return false;
  return Number(worldTime) >= stamp;
}

/* ══════════════════════════════════════════════════════════════════════
 * THE CONDITIONS AN AFFLICTION HOLDS (Graham's R6: "Yes, but allow GM to
 * remove them manually").
 *
 * Page 232's closing sentence: "Any condition that you gain from an
 * affliction lasts beyond its duration and cannot be removed while the
 * affliction persists."
 *
 * WHO IS ASKING IS THE WHOLE RULE. A spell, a rest, a recovery roll or a
 * condition sweep trying to lift a disease's Sickened is exactly what the
 * sentence forbids. A GM deciding the disease has been cured is not — and
 * Graham's ruling keeps that door open deliberately.
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * May this removal go ahead?
 *
 * @param {object} state
 * @param {boolean} state.heldByAffliction is a live affliction holding it?
 * @param {boolean} state.byGM is a GM making this removal?
 * @param {boolean} state.fromRule did a rule ask, rather than a person?
 * @returns {{allowed: boolean, reason: string}}
 */
export function conditionRemovalAllowed({ heldByAffliction = false, byGM = false, fromRule = false } = {}) {
  if (!heldByAffliction) return { allowed: true, reason: "" };
  if (fromRule) {
    return { allowed: false, reason: "an affliction is holding it — page 232" };
  }
  if (byGM) return { allowed: true, reason: "" };
  return { allowed: false, reason: "an affliction is holding it — page 232; only the GM can lift it" };
}
