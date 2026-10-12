/**
 * HOW LONG A CRITICAL ROW'S CONDITIONS ACTUALLY LAST — the rules, pure.
 *
 * NEW at 3.581.0, for the pages 211-220 audit's D1, D2 and D10, and
 * Graham's R1, R2 and R10 of 21 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG, AND IT WAS NOT SMALL.
 *
 * A critical row has TWO places that can say how long something lasts:
 * the Persistence column (M, D, UH, FR, P) and the effect text itself.
 * Only the column was ever read. The text was printed on the card and
 * obeyed by nobody, which cost three separate families of rows:
 *
 *   NINETEEN ROWS say "until the end of THEIR next turn" and nothing
 *   expired. Bludgeoning 47: "Target is Stunned 2 and Injured 2 until
 *   the end of their next turn" — an Injured 2 the book lends for one
 *   round and the target kept for the rest of the campaign. Eight of the
 *   nineteen have Persistence "-", so no clock reached them from any
 *   direction at all.
 *
 *   TWENTY-FOUR ROWS tie a condition to another condition's ending —
 *   "Bleeding 3 & Injured 1 until the bleeding stops", "Recurring 2 &
 *   Blinded until the damage ends". The system had a round counter and a
 *   Persistence record and no way at all to say "this ends when that
 *   ends", so the bleed stopped on its own flat check and the Injured
 *   riding on it stayed forever.
 *
 *   FIVE ROWS state a real-world span — "for 1 minute", "for 1d4 hours"
 *   — which the round counter cannot hold and nothing recorded.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TEXT IS MORE SPECIFIC THAN THE COLUMN, SO THE TEXT WINS — but only
 * over the conditions it actually governs. Subdual 40's column says D
 * (roll dice for rounds) and its text says one round; one round is what
 * the row means, because the sentence naming the conditions is closer to
 * them than a letter in a column. Where the text says nothing, the
 * column still rules, exactly as before.
 *
 * WHICH IS WHY SCOPE IS CHARACTER POSITIONS AND NOT A FLAG. Three rows
 * would be got wrong by any rule that treats a duration as belonging to
 * the whole row:
 *
 *   Bludgeoning 39  "Target is Stunned 1. They are also Flat-Footed
 *                    until the end of their next turn."
 *                    — the Stunned is in a different sentence and is not
 *                      on the clock.
 *   Aligned 57      "Target cannot use verbal components until the end
 *                    of their next turn AND ARE STUNNED 2."
 *                    — the Stunned comes AFTER the clause and is not on
 *                      the clock either.
 *   Aligned 64      "-5 penalty to speed FOR 1 MINUTE and is Immobilized
 *                    UNTIL THE END OF THEIR NEXT TURN."
 *                    — two durations, one sentence, and each governs
 *                      only what precedes it.
 *
 * So a duration clause governs what was said between the end of the
 * previous clause (or the start of the sentence) and the clause itself.
 * Nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BLEEDING, RECURRING DAMAGE AND SICKENED KEEP THEIR OWN CLOCKS, and
 * that is the BOOK's carve-out, not one invented here. Chapter 7's own
 * note on the Persistence column says these three "have their own
 * separate duration rules… that doesn't use this column's rules at all",
 * and `computePersistenceRounds` has honoured it since it was written.
 * A text duration is the same kind of statement as the column, so it
 * gets the same carve-out — otherwise Piercing 69's "Bleeding 3 &
 * Flat-Footed until the end of their next turn" would end a bleed after
 * one round and skip the flat check the bleed is supposed to need.
 *
 * Pure; no Foundry. The dice a "1d4 hours" needs are rolled by the
 * caller and handed back in, the same way every other pure module in
 * this system takes its randomness as an argument.
 */
import { conditionMentions, stripConditionalClauses, NEXT_TURN_DURATION } from "../effect-parser.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { SELF_TIMED_CONDITION_IDS } from "../injuries.mjs";

/** A minute of combat, in rounds — the figure Conviction already uses. */
export const MINUTE_ROUNDS = 10;
/** Seconds in the spans the tables name. */
export const UNIT_SECONDS = Object.freeze({ minute: 60, hour: 3600, day: 86400 });

/*
 * THE THREE THE BOOK EXCUSES FROM THE PERSISTENCE COLUMN are excused
 * from a text duration for the same reason — and it is the SAME LIST,
 * not a second copy of it. `injuries.mjs` has held these three since the
 * block-19 audit's D9; a text duration is the same kind of statement and
 * gets the same answer, so it asks the same list. A second freeze of the
 * same three words beside it would have been free to drift the first
 * time the book adds a fourth, which is the exact shape of defect the
 * last two blocks spent their releases on.
 */

/*
 * "UNTIL THE BLEEDING STOPS" NAMES A CONDITION, in four different
 * spellings across the twenty-four rows that use it: "the bleeding",
 * "bleed", "the damage", "recurring". The first two are the Bleeding
 * condition and the last two are Recurring Damage — confirmed by
 * reading all twenty-four, every one of which inflicts the very
 * condition its clause then waits for.
 */
const LINK_WORDS = Object.freeze({
  bleeding: "bleeding",
  bleed: "bleeding",
  bleeds: "bleeding",
  damage: "recurring",
  recurring: "recurring",
  "recurring damage": "recurring"
});

const NEXT_TURN_GLOBAL = new RegExp(NEXT_TURN_DURATION.source, "gi");
const SPAN_GLOBAL = /\b(?:for|lasting)\s+(\d+d\d+|\d+)\s*(minute|hour|day)s?\b/gi;
/*
 * "UNTIL THE BLEED DAMAGE STOPS" (3.582.0; the pages 221-230 audit's D2,
 * Graham's R2 of 22 September 2026).
 *
 * This pattern was written for the CRITICAL tables at 3.581.0 and wanted
 * the noun immediately followed by "stops" or "ends". The FUMBLE tables
 * put a word between them — "until the BLEED DAMAGE stops" — so three
 * rows (melee, missile and thrown, all at 86-90) matched nothing and
 * their Sickened 1 was permanent: the exact defect the linked-duration
 * machinery was built to remove, surviving in the one wording nobody
 * checked.
 *
 * The optional "damage" is allowed after any of the nouns rather than
 * only after "recurring", because the book writes both "the bleed damage
 * stops" and "the recurring damage ends" and there is no reason to think
 * it will stop at those two.
 */
const LINKED_GLOBAL =
  /\buntil\s+(?:the\s+)?(bleeding|bleeds|bleed|recurring|damage)(?:\s+damage)?\s+(?:stops?|ends?)\b/gi;

/**
 * Every duration clause in the text, in the order it is written.
 *
 * @param {string} text a critical row's effect, or an armour clause's
 * @returns {Array<{start: number, end: number, duration: object}>}
 */
export function durationClauses(text) {
  const str = String(text ?? "");
  if (!str) return [];

  const clauses = [];
  const scan = (pattern, build) => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(str))) {
      const duration = build(match);
      if (duration) clauses.push({ start: match.index, end: match.index + match[0].length, duration });
    }
  };

  scan(NEXT_TURN_GLOBAL, (match) => ({
    kind: "rounds", rounds: 1, seconds: null, formula: null, unit: null, to: null,
    label: match[0].trim()
  }));

  scan(SPAN_GLOBAL, (match) => {
    const amount = String(match[1]);
    const unit = String(match[2]).toLowerCase();
    const seconds = UNIT_SECONDS[unit] ?? null;
    // A FIXED NUMBER RESOLVES HERE; A FORMULA CANNOT. "for 1 minute" is
    // ten rounds and this module can say so; "for 1d4 hours" needs a die
    // the caller rolls, so it is handed on as a formula rather than
    // guessed at an average — an average is a number nobody at the table
    // rolled.
    if (/^\d+$/.test(amount)) {
      const count = Math.max(1, Math.trunc(Number(amount)));
      return {
        kind: "rounds",
        rounds: unit === "minute" ? count * MINUTE_ROUNDS : null,
        seconds: seconds === null ? null : count * seconds,
        formula: null, unit, to: null, label: match[0].trim()
      };
    }
    return {
      kind: "time", rounds: null, seconds: null, formula: amount, unit, to: null,
      label: match[0].trim()
    };
  });

  scan(LINKED_GLOBAL, (match) => {
    const to = LINK_WORDS[String(match[1]).toLowerCase().replace(/\s+/g, " ")] ?? null;
    if (!to) return null;
    return {
      kind: "linked", rounds: null, seconds: null, formula: null, unit: null, to,
      label: match[0].trim()
    };
  });

  return clauses.sort((a, b) => a.start - b.start);
}

/** The inclusive-exclusive character spans of each sentence in `str`. */
function sentenceSpans(str) {
  const spans = [];
  let start = 0;
  const boundary = /[.;…!?]+/g;
  let match;
  while ((match = boundary.exec(str))) {
    spans.push([start, match.index + match[0].length]);
    start = boundary.lastIndex;
  }
  if (start < str.length) spans.push([start, str.length]);
  return spans;
}

/**
 * Each condition the text names, with the duration that governs it —
 * null where the text says nothing and the Persistence column still
 * rules.
 *
 * @param {string} text
 * @returns {Array<{key: string, label: string, value: number|null,
 *   duration: object|null}>}
 */
export function scopedConditionDurations(text) {
  // The same blanking `extractConditionTags` uses, so a "for 1 minute"
  // sitting inside "or fall unconscious for 1 minute" is not read as a
  // duration on a row that has not happened yet.
  const str = stripConditionalClauses(text);
  const clauses = durationClauses(str);
  const mentions = conditionMentions(str);

  const governing = new Map();
  if (clauses.length) {
    for (const [from, to] of sentenceSpans(str)) {
      /*
       * A DEFERRAL IS A SEGMENT BOUNDARY TOO (found by driving all 1932
       * row-by-armour combinations before any of this shipped).
       *
       * Poison 60: "Target Blinded AND THEN Dazzled for 1 minute
       * thereafter." The minute belongs to the Dazzled. Without this,
       * the clause reached back over the "and then" and blinded the
       * target for a minute as well — the one row in the tables where a
       * duration sits on the far side of a successor, and it would have
       * been wrong every time.
       */
      const boundaries = [];
      for (const pattern of [/\band\s+then\s+/gi, /\bwhen\s+(?:the\s+)?[A-Za-z]+\s+(?:ends|stops|wears\s+off)\b/gi]) {
        pattern.lastIndex = 0;
        let found;
        const sentence = str.slice(from, to);
        while ((found = pattern.exec(sentence))) boundaries.push(from + found.index + found[0].length);
      }

      let segmentStart = from;
      for (const clause of clauses) {
        if (clause.start < from || clause.start >= to) continue;
        const nearest = boundaries.filter((b) => b > segmentStart && b <= clause.start);
        const start = nearest.length ? Math.max(...nearest) : segmentStart;
        for (const mention of mentions) {
          if (mention.index >= start && mention.index < clause.start) {
            governing.set(mention, clause.duration);
          }
        }
        segmentStart = clause.end;
      }
    }
  }

  const best = new Map();
  for (const mention of mentions) {
    const previous = best.get(mention.key);
    if (previous === undefined) { best.set(mention.key, mention); continue; }
    // The same "highest value wins" the tag extraction uses, and the
    // duration travels with the mention that won.
    if (mention.value !== null && (previous.value === null || mention.value > previous.value)) {
      best.set(mention.key, mention);
    } else if (previous.value === null && governing.has(mention) && !governing.has(previous)) {
      // A boolean condition said twice, once inside a duration clause:
      // the timed mention is the informative one.
      best.set(mention.key, mention);
    }
  }

  return Array.from(best.values())
    .map((mention) => ({
      key: mention.key,
      label: mention.label,
      value: mention.value,
      duration: SELF_TIMED_CONDITION_IDS.includes(mention.key)
        ? null
        : (governing.get(mention) ?? null)
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The duration governing a phrase that is NOT a condition — "cannot use
 * verbal components until the end of their next turn", "cannot speak
 * until the bleeding ends".
 *
 * FORWARD, NOT BACKWARD, and that is the difference from
 * {@link scopedConditionDurations}. A condition is named and THEN its
 * duration; a lockout is a verb phrase whose duration follows it in the
 * same sentence. Asked for the first clause that starts at or after the
 * phrase and before the sentence ends.
 *
 * @param {string} text
 * @param {number} index where the phrase begins
 * @returns {object|null}
 */
export function durationAfter(text, index) {
  const str = stripConditionalClauses(text);
  const from = Math.max(0, Math.trunc(Number(index) || 0));
  const sentence = sentenceSpans(str).find(([start, end]) => from >= start && from < end);
  if (!sentence) return null;
  const clause = durationClauses(str)
    .find((c) => c.start >= from && c.start < sentence[1]);
  return clause ? clause.duration : null;
}

/**
 * The condition key a word in a "when the X ends" clause names.
 *
 * "when the control ends" is the Controlled condition and "until the
 * bleed ends" is Bleeding, so the match is by stem rather than by exact
 * label — the book conjugates these words and a registry does not.
 */
export function conditionKeyForWord(word) {
  const cleaned = String(word ?? "").trim().toLowerCase();
  if (!cleaned) return null;
  if (LINK_WORDS[cleaned]) return LINK_WORDS[cleaned];
  for (const [key, def] of Object.entries(CONDITIONS)) {
    const label = String(def.label ?? "").toLowerCase();
    if (key.toLowerCase() === cleaned || label === cleaned) return key;
    if (cleaned.length >= 4 && (key.toLowerCase().startsWith(cleaned) || label.startsWith(cleaned))) {
      return key;
    }
  }
  return null;
}

/*
 * A CONDITION THAT ARRIVES WHEN ANOTHER ONE LEAVES (3.581.0).
 *
 * Three rows sequence two conditions instead of inflicting both:
 *
 *   Mental 60  "Controlled by you until the end of their next turn AND
 *               THEN Injured 1 WHEN THE CONTROL ENDS."
 *   Mental 64  "Fleeing until the end of their next turn… WHEN THE
 *               FLEEING ENDS, target is Confused."
 *   Poison 60  "Target Blinded AND THEN Dazzled for 1 minute THEREAFTER."
 *
 * All three were applied at once, so a target was Controlled AND Injured
 * from the first instant — which loses the only interesting thing about
 * the row, that the second condition is the price of the first wearing
 * off.
 */
const WHEN_ENDS = /\bwhen\s+(?:the\s+)?([A-Za-z]+)\s+(?:ends|stops|wears\s+off)\b/i;
const AND_THEN = /\band\s+then\s+/i;
const DEFERRED = /\b(?:thereafter|afterwards?|later)\b/i;

/**
 * The conditions that wait for another condition to end.
 *
 * @param {string} text
 * @returns {Array<{after: string, tags: Array<object>, duration: object|null}>}
 */
export function followOnClauses(text) {
  const str = stripConditionalClauses(text);
  const scoped = scopedConditionDurations(str);
  const byKey = new Map(scoped.map((tag) => [tag.key, tag]));
  const out = [];

  for (const [from, to] of sentenceSpans(str)) {
    const sentence = str.slice(from, to);
    const mentions = conditionMentions(sentence);
    if (mentions.length < 2) continue;

    const whenEnds = sentence.match(WHEN_ENDS);
    const andThen = sentence.match(AND_THEN);

    let after = null;
    let splitAt = null;

    if (whenEnds) {
      after = conditionKeyForWord(whenEnds[1]);
      // "and then Injured 1 when the control ends" — the follow-on is
      // what sits between the "and then" and the "when", or simply
      // everything that is not the condition being waited for.
      splitAt = andThen ? andThen.index + andThen[0].length : null;
    } else if (andThen && DEFERRED.test(sentence)) {
      // "Blinded and then Dazzled for 1 minute THEREAFTER" — the
      // condition before the phrase is the one being waited for.
      //
      // THE "THEREAFTER" IS REQUIRED, and it is what tells this apart
      // from Electricity 60: "Target is Immobilised AND THEN falls
      // prone." Both conditions land at once there — the "and then" is
      // narrating a fall, not deferring it — and without this guard a
      // creature stood up the moment the current stopped holding it.
      // Measured: the guard takes four follow-on clauses across the
      // fourteen tables down to the three the book really sequences.
      const before = mentions.filter((m) => m.index < andThen.index);
      after = before.length ? before[before.length - 1].key : null;
      splitAt = andThen.index + andThen[0].length;
    }

    if (!after || !CONDITIONS[after]) continue;

    const tags = mentions
      .filter((m) => m.key !== after && (splitAt === null || m.index >= splitAt))
      .map((m) => byKey.get(m.key) ?? { key: m.key, label: m.label, value: m.value, duration: null })
      .filter((tag, index, list) => list.findIndex((t) => t.key === tag.key) === index);

    if (!tags.length) continue;
    out.push({
      after,
      tags: tags.map(({ key, label, value }) => ({ key, label, value })),
      duration: tags[0]?.duration ?? null
    });
  }

  return out;
}

/**
 * The conditions a follow-on removes from the immediate set — what the
 * row says happens LATER should not also happen now.
 *
 * @param {Array<object>} tags the row's scoped tags
 * @param {Array<object>} followOns from {@link followOnClauses}
 * @returns {Array<object>} the tags to apply immediately
 */
export function withoutFollowOns(tags, followOns) {
  const deferred = new Set();
  for (const clause of followOns ?? []) {
    for (const tag of clause.tags ?? []) deferred.add(tag.key);
  }
  return (tags ?? []).filter((tag) => !deferred.has(tag.key));
}
