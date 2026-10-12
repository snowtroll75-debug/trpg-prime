/**
 * Extracts condition references from the free-text effect descriptions
 * in the critical, fumble, spell fumble, and resonance tables (Chapter
 * 7 and Chapter 9) — "Injured 1", "Bleeding 2", "Prone", and so on —
 * so they can be applied to an actor automatically rather than only
 * described in a chat card.
 *
 * The approach (matching "{condition label} {number}" for valued
 * conditions, "{condition label}" as a whole word/phrase for boolean
 * ones, against this project's own condition registry) is adapted
 * from an earlier project of Graham's that used the identical
 * technique — there, explicitly for chat-card display only, never for
 * automatic application: "This does NOT apply conditions to the actor
 * (durations are not tracked in-system yet)." That system also never
 * reached the point of applying what it parsed. This module carries
 * the extraction forward, but the applying (see effect-application-
 * workflow.mjs) is new work, not something being ported in already
 * proven at that stage.
 */
import { CONDITIONS } from "./conditions/registry.mjs";

function escapeRegExp(str) {
  return String(str ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wording the rulebook's own table text uses for a condition that
 * diverges from that condition's registry label — "persistent damage"
 * for what this system calls Recurring Damage, confirmed directly
 * against the actual table text (94 of 644 critical rows use this
 * phrasing) rather than assumed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ALIAS OUTLIVED THE WORD, DELIBERATELY (3.441.1).
 *
 * Core 3.7 renames persistent damage to RECURRING damage throughout, and
 * every table row and card line in this system followed. This alias did
 * NOT, and that is the point of it: text written before the rename still
 * exists — in a GM's journal, in a homebrew item, in a chat card already
 * posted — and an alias that is removed the moment the book changes is
 * an alias that only ever worked for text nobody had yet written.
 * `verify-recurring-vocabulary` declares this as the one place the old
 * word is still allowed to appear.
 */
const LABEL_ALIASES = Object.freeze({
  recurring: ["persistent"],
  stunned: ["stun"],
  bleeding: ["bleed"],
  /*
   * "DRAINED" IS THE BOOK'S OWN LOOSE WORD FOR SOUL DRAIN (3.488.0).
   *
   * Found by `verify-condition-names-resolve`'s vocabulary sweep, which
   * turned up exactly one unrecognised capitalised condition name in the
   * whole compendium: the alchemical item **Dream Lichen**, "the user
   * automatically doubles the amount of the Drained condition they remove
   * after a night's rest".
   *
   * THE BOOK CONVICTS ITSELF. "Drained" appears three times, and the third
   * is inside the SOUL DRAIN entry in Appendix 2: *"Depending upon the
   * source of your Drained condition, your misery may not end with
   * death…"* — a condition entry using the loose word for the very
   * condition it is defining. There is no separate DRAINED entry anywhere
   * in Appendix 2; "Soul Drain" appears 38 times.
   *
   * Graham confirmed on 4 September 2026, alongside the Fixated ruling.
   *
   * SAFE BECAUSE SOUL DRAIN IS VALUED. An alias on a valued condition is
   * only ever matched beside a number, so ordinary prose — a drained
   * flask, a drained expression — cannot become a condition. Measured
   * before adding it: "drained" beside a number occurs zero times in the
   * packs and zero times in the transcribed tables, so this alias exists
   * for the text that has not been written yet.
   */
  soulDrain: ["drained"],
  /*
   * "IMMOBILIZED" IS A SPELLING, NOT A DIFFERENT CONDITION (3.581.0).
   *
   * Found by measuring rather than reading: the pages 211-220 duration
   * work dumped every row's scoped conditions, and three rows that
   * plainly immobilise somebody produced no condition at all. The
   * registry's label is "Immobilised" and the book writes both — five
   * rows with an s, three with a z — so Electricity 77-78 ("Recurring 4
   * & Immobilized until the damage ends"), Electricity 79 and Aligned
   * 64 have been printing the word and applying nothing.
   *
   * SAFE, because this is a boolean condition matched as a whole word:
   * there is no ordinary English sense of "immobilized" that is not the
   * condition.
   */
  immobilised: ["immobilized"]
});

/*
 * ─────────────────────────────────────────────────────────────────────
 * WORDS THAT ARE CONDITIONS IN THE REGISTRY AND ENGLISH IN THE BOOK
 * (3.581.0). Three leaks, all found by dumping what the extractor
 * actually produced for all 873 table texts rather than by reading it:
 *
 *   "Blow to side: BROKEN breath."        → the target became Broken
 *   "either a dead arm, or A BROKEN one"  → Broken again
 *   "You have either given the target A   → the target became DEAD,
 *    DEAD ARM"                              on a row whose whole effect
 *                                           is Injured 1
 *   "Your attempt to do a star jump does  → the character became
 *    NOT GO UNNOTICED"                      Unnoticed, which is the
 *                                           exact opposite of the
 *                                           sentence
 *
 * The Dead one is the serious one: Subdual 31-32 is a light hit that
 * killed whoever it landed on, outright, every time, because the book
 * used a common idiom for a numb arm.
 *
 * THREE NARROW RULES, each true of the language rather than of a row:
 *
 *   BROKEN IS AN ITEM CONDITION, AND MUST BE NAMED AS ONE. It is
 *   `hud: false` in the registry — Chapter 6 item damage, applied to a
 *   shield or a weapon, never to a creature by a table row. All nine of
 *   its mentions across the critical and fumble tables are an arm, a
 *   foot covering, a held item or a breath, and not one of them calls
 *   it a condition. Force Open's own text does: "it gains the BROKEN
 *   CONDITION (GM discretion)". So the word counts only where the book
 *   says the word "condition" after it — which is the same exemption
 *   the determiner rule below already makes, for the same reason.
 *
 *   THE FIRST VERSION OF THIS RULE BANNED THE WORD OUTRIGHT, and
 *   `verify-condition-names-resolve` caught it within the minute: Force
 *   Open's success line stopped resolving. The check was right and the
 *   rule was too wide.
 *
 *   A NEGATED CONDITION IS NOT A CONDITION. "does not go unnoticed"
 *   says the opposite of what was extracted.
 *
 *   AN ADJECTIVE BEFORE A NOUN IS NOT A CONDITION. "a dead arm" is a
 *   determiner, the word, and a noun; "Target is dead." is not. The
 *   follower "condition" is exempt, because "gains the Fixated
 *   condition" is the book naming one explicitly — which is the one
 *   phrasing where the determiner really does introduce a condition.
 */
const NAMED_AS_CONDITION_ONLY = Object.freeze(["broken"]);
const NAMED_AS_CONDITION = /^\s+condition\b/i;
const NEGATED_BEFORE = /\b(?:not|never|no)\s+(?:go|be|been|being|become)?\s*$/i;
const DETERMINER_BEFORE = /\b(?:a|an|the)\s+$/i;
const NOUN_AFTER = /^\s+(?!condition\b)[a-z]+\b/;

/**
 * Is this mention of a boolean condition actually the condition?
 *
 * @param {string} str the whole text
 * @param {string} key the condition key
 * @param {number} index where the word starts
 * @param {number} length how long the matched word is
 */
function mentionIsLiteral(str, key, index, length) {
  const before = str.slice(0, index);
  const after = str.slice(index + length);
  if (NAMED_AS_CONDITION_ONLY.includes(key)) return NAMED_AS_CONDITION.test(after);
  if (NEGATED_BEFORE.test(before)) return false;
  if (DETERMINER_BEFORE.test(before) && NOUN_AFTER.test(after)) return false;
  return true;
}

/*
 * ─────────────────────────────────────────────────────────────────────
 * A CONDITION NAMED AS THE PRICE OF A FAILED SAVE IS NOT A CONDITION YET
 * (3.581.0; the pages 211-220 audit's D3, Graham's R11 of 21 September
 * 2026, "as you recommend").
 *
 * Sonic 90 says, in as many words, that nothing has happened:
 *
 *   "Other than some physical damage the target appears to be UNTOUCHED
 *    by your attack…for now. Each time the target spends more than 1 AP
 *    in a round they must make a DC 5 flat check OR FALL UNCONSCIOUS for
 *    1 minute."
 *
 * and the extractor below took the word `unconscious` out of that second
 * sentence and laid the target out on the floor. The row's whole point
 * is the "for now".
 *
 * IT IS THE ONLY ROW IN FOURTEEN TABLES WHERE THIS LEAKED, and that was
 * luck, not design: Acid 67's "or be Sickened 1" is invisible only
 * because the same row inflicts Sickened 2 on its own and the higher
 * number wins. The extractor takes the biggest number it can see
 * wherever it sits in the sentence, so the next row the book writes in
 * this shape lands the same way.
 *
 * SO IT IS FIXED AS A SENTENCE PATTERN, not as a row. A consequence
 * clause is recognised by two things TOGETHER:
 *
 *   1. its own marker — "or be", "or fall", "or become", "to avoid", …
 *   2. a save or a check named BEFORE it in the same sentence.
 *
 * Both, because the marker alone is everywhere in this book's prose:
 * "as they attempt TO AVOID your attack", "Target stumbles back TO
 * AVOID.", "Target twists TO AVOID the attack and the acid tears into
 * their side." Measured across all 644 critical rows and every fumble
 * table before it was written: requiring the save cuts nine matches to
 * the three that are really conditional, and none of the six it drops
 * names a condition at all.
 *
 * THE SPAN STOPS AT THE NEXT "and", because the row goes on afterwards
 * and what follows is not conditional. Acid 31: "must make a Reflex save
 * to avoid dropping item AND IS INJURED 1" — the Injured is the next
 * thing the row does, and a rule that swallowed the rest of the sentence
 * would quietly stop applying it.
 *
 * BLANKED, NOT DELETED. The span is replaced with spaces of equal
 * length, so every index into the string still means what it meant —
 * critical-durations.mjs segments the SAME text by character position to
 * decide which duration governs which condition, and a strip that
 * shortened the string would silently shift every clause after it.
 */
const CONDITIONAL_MARKER =
  /\b(?:or\s+(?:be|become|fall|suffer|gain|is|are|they\s+(?:are|become))|to\s+avoid)\b/i;
const SAVE_OR_CHECK = /\b(?:saving\s+throw|save|check|DC\s*\d+)\b/i;

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
 * The spans of text that describe what happens IF a save or check is
 * failed, rather than what has happened already.
 *
 * @param {string} text
 * @returns {Array<{start: number, end: number, text: string}>}
 */
export function conditionalSpans(text) {
  const str = String(text ?? "");
  const spans = [];

  for (const [from, to] of sentenceSpans(str)) {
    const sentence = str.slice(from, to);
    const gate = sentence.match(SAVE_OR_CHECK);
    if (!gate) continue;

    // The marker must come AFTER the save, not before it: "to avoid" in
    // "twists to avoid the attack" is flavour, and a sentence that
    // happens to mention a DC later does not make it conditional.
    const afterGate = sentence.slice(gate.index + gate[0].length);
    const marker = afterGate.match(CONDITIONAL_MARKER);
    if (!marker) continue;

    const markerStart = gate.index + gate[0].length + marker.index;
    const rest = sentence.slice(markerStart + marker[0].length);
    const and = rest.match(/\s+and\s+/i);
    const end = and === null
      ? to
      : from + markerStart + marker[0].length + and.index;

    spans.push({ start: from + markerStart, end, text: str.slice(from + markerStart, end) });
  }

  return spans;
}

/**
 * The same text with every consequence-of-a-failure clause blanked out,
 * character for character, so positions are preserved.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripConditionalClauses(text) {
  const str = String(text ?? "");
  const spans = conditionalSpans(str);
  if (!spans.length) return str;

  let out = str;
  for (const span of spans) {
    out = out.slice(0, span.start) + " ".repeat(span.end - span.start) + out.slice(span.end);
  }
  return out;
}

/**
 * The conditions a row threatens on a failed save or check — what
 * `extractConditionTags` now refuses to apply up front, handed to
 * whoever rolls that save so it can be applied when it is actually
 * earned.
 *
 * @param {string} text
 * @returns {Array<{key: string, label: string, value: number|null}>}
 */
export function extractConditionalConditions(text) {
  const spans = conditionalSpans(text);
  if (!spans.length) return [];
  return tagsFrom(spans.map((span) => span.text).join(". "));
}

/**
 * @param {string} text
 * @returns {Array<{key: string, label: string, value: number|null}>}
 *   value is a number for valued conditions (e.g. Injured 2), or null
 *   for boolean conditions (e.g. Prone) that were simply mentioned.
 */
export function extractConditionTags(text) {
  return tagsFrom(stripConditionalClauses(text));
}

/*
 * WHERE A CONDITION WAS SAID, NOT ONLY THAT IT WAS (3.581.0).
 *
 * The extraction below used to collapse straight to a set of tags, which
 * is all anyone needed until a row's duration had to be scoped: Aligned
 * 64 grants a speed penalty "for 1 minute" AND an Immobilized "until the
 * end of their next turn", in one sentence, and the only thing that
 * tells those two durations apart is which side of which clause each
 * condition was named on. So the mentions carry their character
 * positions, and combat/critical-durations.mjs segments the same string
 * by the same indices.
 *
 * ONE VOCABULARY, ONE PLACE. Positions could have been recovered by a
 * second scan somewhere else, and that second scan would have been a
 * second copy of the label/alias/ordering rules above — free to drift
 * from this one the first time the book grows a word.
 *
 * @param {string} text
 * @returns {Array<{key: string, label: string, value: number|null,
 *   index: number, length: number}>} ordered by position.
 */
export function conditionMentions(text) {
  const str = String(text ?? "");
  if (!str) return [];

  const out = [];
  // Valued conditions: "Injured 1", "Bleeding 2" — checked against both
  // the condition's own label and any known rulebook wording alias, and
  // against both "{label} {number}" and "{number} {label}" orderings,
  // because the table text isn't consistent about which comes first
  // (confirmed directly, not assumed). Boolean conditions — "Prone",
  // "Flat-Footed" — are the whole word or phrase, with no value.
  for (const [key, def] of Object.entries(CONDITIONS)) {
    const words = [def.label, key, ...(LABEL_ALIASES[key] ?? [])];
    for (const word of words) {
      const escaped = escapeRegExp(word);
      const patterns = def.valued
        ? [
            new RegExp(`\\b${escaped}\\s+(\\d+)\\b`, "gi"),
            new RegExp(`\\b(\\d+)\\s+${escaped}\\b`, "gi")
          ]
        : [new RegExp(`\\b${escaped}\\b`, "gi")];
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(str))) {
          const value = def.valued ? Math.trunc(Number(match[1]) || 0) : null;
          if (def.valued && value <= 0) continue;
          // A VALUED CONDITION CARRIES ITS OWN PROOF — it was matched
          // beside a number, which ordinary prose does not do — so the
          // literal test is asked only of the boolean ones, which are
          // matched on the bare word.
          if (!def.valued && !mentionIsLiteral(str, key, match.index, match[0].length)) continue;
          out.push({ key, label: def.label, value, index: match.index, length: match[0].length });
        }
      }
    }
  }

  return out.sort((a, b) => a.index - b.index);
}

/** The extraction itself, on text that has already been gated. */
function tagsFrom(text) {
  const found = new Map();

  // The highest value mentioned wins if the same condition appears more
  // than once in the same row (this project's own stacking rules apply
  // once the condition is actually applied; this is just what the text
  // says).
  for (const mention of conditionMentions(text)) {
    if (mention.value === null) {
      if (!found.has(mention.key)) found.set(mention.key, null);
      continue;
    }
    const previous = found.get(mention.key);
    if (previous === undefined || previous === null || mention.value > previous) {
      found.set(mention.key, mention.value);
    }
  }

  return Array.from(found.entries())
    .map(([key, value]) => ({ key, label: CONDITIONS[key].label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Recognises "No {condition}" and "Ignore(d) the {condition}" wording
 * — confirmed as the dominant pattern in this system's own armoured-
 * variant critical text (e.g. "No Stun", "Ignore the Stunned") — for
 * removing a condition from the base (unarmoured) set rather than
 * treating armoured text with no positive match as nothing to do at
 * all.
 *
 * @param {string} text
 * @returns {string[]} Condition keys to remove from the base set.
 */
export function extractNegatedConditions(text) {
  const str = String(text ?? "");
  if (!str) return [];

  const negated = new Set();
  for (const [key, def] of Object.entries(CONDITIONS)) {
    const label = def.label;
    const words = [label, key, ...(LABEL_ALIASES[key] ?? [])];
    for (const word of words) {
      const escaped = escapeRegExp(word);
      const noPattern = new RegExp(`\\bno\\s+${escaped}\\b`, "i");
      const ignorePattern = new RegExp(`\\bignore[sd]?\\s+(?:the\\s+)?${escaped}\\b`, "i");
      if (noPattern.test(str) || ignorePattern.test(str)) {
        negated.add(key);
        break;
      }
    }
  }
  return Array.from(negated);
}

/**
 * Recognises "{condition} reduced by N" / "Reduce {condition} by N"
 * wording — confirmed as another common pattern in armoured-variant
 * critical text (armour lessening, rather than negating or replacing,
 * an existing valued condition).
 *
 * @param {string} text
 * @returns {Array<{key: string, label: string, delta: number}>}
 *   delta is always positive — the amount to subtract, not the result.
 */
export function extractReducedConditions(text) {
  const str = String(text ?? "");
  if (!str) return [];

  const found = new Map();
  for (const [key, def] of Object.entries(CONDITIONS)) {
    if (!def.valued) continue;
    const words = [def.label, key, ...(LABEL_ALIASES[key] ?? [])];
    for (const word of words) {
      const escaped = escapeRegExp(word);
      const patterns = [
        new RegExp(`\\b${escaped}\\s+reduced\\s+by\\s+(\\d+)\\b`, "gi"),
        new RegExp(`\\breduce\\s+(?:the\\s+)?${escaped}\\s+by\\s+(\\d+)\\b`, "gi")
      ];
      for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(str))) {
          const value = Math.trunc(Number(match[1]) || 0);
          if (value <= 0) continue;
          const previous = found.get(key);
          if (previous === undefined || value > previous) found.set(key, value);
        }
      }
    }
  }

  return Array.from(found.entries())
    .map(([key, delta]) => ({ key, label: CONDITIONS[key].label, delta }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Conditions an armour clause RAISES — "Recurring +1", "Stunned +1",
 * "Injured +1" (3.608.3, Graham, 30 September 2026: "the +1 on electricity
 * criticals for metal armour need adding in").
 *
 * FOUND ON THE 3.608.1 LIVE DRIVE. Five Electricity rows print a metal
 * armour clause that increases a condition the row already gives, and the
 * clause reader knew only three shapes — restate, negate, reduce — so "+1"
 * matched none of them and the metal-armoured target took exactly what an
 * unarmoured one did.
 *
 * THE LABEL MUST SIT RIGHT BEFORE THE SIGN. "Bleeding 1 +2 base damage" is
 * a condition and then a damage bonus, and must not read as Bleeding +2.
 *
 * @param {string} text
 * @returns {Array<{key: string, label: string, delta: number}>}
 */
export function extractIncreasedConditions(text) {
  const str = String(text ?? "");
  if (!str) return [];
  const found = new Map();
  for (const [key, def] of Object.entries(CONDITIONS)) {
    if (!def.valued) continue;
    const words = [def.label, key, ...(LABEL_ALIASES[key] ?? [])];
    for (const word of words) {
      const pattern = new RegExp(`\\b${escapeRegExp(word)}\\s*\\+\\s*(\\d+)\\b`, "gi");
      let match;
      while ((match = pattern.exec(str))) {
        const value = Math.trunc(Number(match[1]) || 0);
        if (value <= 0) continue;
        const previous = found.get(key);
        if (previous === undefined || value > previous) found.set(key, value);
      }
    }
  }
  return Array.from(found.entries())
    .map(([key, delta]) => ({ key, label: CONDITIONS[key].label, delta }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * WHICH ARMOUR CLAUSE THIS TARGET GETS (Chapter 7, page 204; Graham's
 * R6, R7 and R8 of 21 September 2026).
 *
 * "Some critical results will be modified if the target is wearing
 * armour… use the instructions given to either replace the critical
 * effects or modify them." A row can carry more than one such
 * instruction, and they are addressed to different targets:
 *
 *   Armoured:         anyone wearing armour at the struck location
 *   Metal Armoured:   only if that armour is metal
 *   Rigid Armoured:   only if that armour is rigid
 *   Unarmoured:       only if the location is NOT armoured
 *
 * MOST SPECIFIC FIRST, then the plain clause, then nothing. A target in
 * rigid plate takes "Rigid Armoured: Reduce bleeding by 2"; a target in
 * leather takes the row's "Armoured: Reduce bleeding by 1" beside it;
 * a target in leather on a row whose ONLY clause is a rigid one takes
 * the unmodified result, which is what the page means by writing the
 * qualifier at all.
 *
 * THE DEFECT THIS EXISTS FOR (3.580.0, D6-D8). The clauses used to be
 * one string. Every armoured target received the rigid reduction,
 * because `extractReducedConditions` keeps the LARGEST delta it finds
 * and both numbers were in the same sentence; "Metal Armoured" gated
 * nothing at all; and on Slashing 87-88 an armoured target took the
 * Unarmoured line's Bleeding 4 while an unarmoured one took no bleeding
 * whatsoever.
 *
 * @param {{armourClauses?: Array<{kind: string, text: string}>}} row
 * @param {{armoured?: boolean, rigid?: boolean, metal?: boolean}|boolean} armour
 *   the armour covering the STRUCK LOCATION; a bare boolean is read as
 *   "armoured, kind unknown", which qualifies for the plain clause only
 * @returns {{kind: string, text: string}|null}
 */
export function selectArmourClause(row, armour) {
  const clauses = Array.isArray(row?.armourClauses) ? row.armourClauses : [];
  if (!clauses.length) return null;

  const state = typeof armour === "boolean"
    ? { armoured: armour, rigid: false, metal: false }
    : (armour ?? {});
  const armoured = Boolean(state.armoured);

  if (!armoured) return clauses.find((c) => c.kind === "unarmoured") ?? null;

  const order = ["metal", "rigid", "armoured"];
  for (const kind of order) {
    if (kind === "metal" && !state.metal) continue;
    if (kind === "rigid" && !state.rigid) continue;
    const found = clauses.find((c) => c.kind === kind);
    if (found) return found;
  }
  return null;
}

/**
 * The full, combined condition set for a critical table row: the base
 * extraction, then the armour clause this target actually qualifies for
 * — its own effect entirely (when it positively restates a condition
 * set), or a negation/reduction adjustment against the base set (when
 * it doesn't).
 *
 * @param {{effect: string, armourClauses?: Array}} row
 * @param {{armoured?: boolean, rigid?: boolean, metal?: boolean}|boolean} armour
 * @returns {Array<{key: string, label: string, value: number|null}>}
 */
export function resolveEffectiveConditions(row, armour) {
  const base = extractConditionTags(row?.effect);
  const clause = selectArmourClause(row, armour);
  if (!clause) return base;

  /*
   * A CLAUSE THAT RAISES IS READ FIRST (3.608.3). "Recurring +1" is an
   * adjustment to the row, like a reduction, not a restatement of it — and
   * it must be asked before the restatement test, which would otherwise be
   * free to read "+1" as a bare "1". A raised condition the row does not
   * already give arrives at the raise.
   */
  const increases = extractIncreasedConditions(clause.text);
  if (increases.length) {
    const raised = base.map((tag) => {
      const up = increases.find((i) => i.key === tag.key);
      return up && tag.value !== null ? { ...tag, value: tag.value + up.delta } : tag;
    });
    for (const up of increases) {
      if (!raised.some((tag) => tag.key === up.key)) raised.push({ key: up.key, label: up.label, value: up.delta });
    }
    return raised;
  }

  const armouredPositive = extractConditionTags(clause.text);
  if (armouredPositive.length > 0) return armouredPositive;

  const negatedKeys = new Set(extractNegatedConditions(clause.text));
  const reductions = new Map(extractReducedConditions(clause.text).map((r) => [r.key, r.delta]));

  return base
    .filter((tag) => !negatedKeys.has(tag.key))
    .map((tag) => {
      const delta = reductions.get(tag.key);
      if (!delta || tag.value === null) return tag;
      const newValue = tag.value - delta;
      return newValue > 0 ? { ...tag, value: newValue } : null;
    })
    .filter(Boolean);
}

/**
 * A clause that rewrites the row's Persistence column rather than its
 * conditions (Chapter 7, page 204; Graham's R9).
 *
 * Bludgeoning 41-43 is the whole of it in the book as it stands:
 * "You break the targets fingers with a powerful blow. Target is
 * Injured 1. Metal Armoured: **Persistence becomes D.**" Broken fingers
 * inside a gauntlet heal on a timer instead of staying Until Healed —
 * and until 3.580.0 the row stayed UH, because the clause was read only
 * for conditions to add, negate or reduce.
 *
 * NOT EXPORTED. `effectivePersistence` below is the whole of its public
 * use, and an export with no caller in another file is what the
 * uncalled-export ratchet exists to catch — a rule written, believed in,
 * and reached by nothing.
 *
 * @param {string} text an armour clause's text
 * @returns {string|null} the replacement Persistence code
 */
function extractPersistenceAmendment(text) {
  const match = String(text ?? "").match(
    /\bpersistence\s+becomes\s+(Death|Fatal|UH|FR|[MDP])\b/i);
  if (!match) return null;
  const code = match[1];
  return /^(death|fatal)$/i.test(code)
    ? code.charAt(0).toUpperCase() + code.slice(1).toLowerCase()
    : code.toUpperCase();
}

/**
 * The Persistence this row resolves to for this target — the printed
 * column, unless the armour clause it qualifies for rewrites it.
 *
 * @param {object} row
 * @param {{armoured?: boolean, rigid?: boolean, metal?: boolean}|boolean} armour
 * @returns {string}
 */
export function effectivePersistence(row, armour) {
  const clause = selectArmourClause(row, armour);
  return extractPersistenceAmendment(clause?.text) ?? String(row?.persistence ?? "");
}

/**
 * Critical Amendment (Chapter 6): "whenever a critical injury result
 * is modified in your favour due to you wearing armour, your armour
 * takes [damage]." That's exactly the same condition already used to
 * decide whether the row's armour variant applies at all — this is that
 * same fact, not a separate judgment call, so it shouldn't be asked
 * again once it's already known.
 *
 * AN UNARMOURED CLAUSE IS NOT AN AMENDMENT. It is the row speaking to a
 * target with no armour to damage, so it never triggers this.
 *
 * @param {object} row
 * @param {{armoured?: boolean, rigid?: boolean, metal?: boolean}|boolean} armour
 * @returns {boolean}
 */
export function criticalAmendmentApplies(row, armour) {
  const clause = selectArmourClause(row, armour);
  return Boolean(clause && clause.kind !== "unarmoured");
}

/**
 * Self-inflicted damage mentioned in fumble table text — "You take 2
 * damage.", "1d4 persistent bleed damage." Distinct from the critical
 * tables' condition text: this is direct HP loss (or, for the
 * dice-based "persistent bleed" wording, becomes the Bleeding
 * condition once rolled — matching what "persistent" already means
 * elsewhere in this system, see the recurring/persistent alias
 * above), not a named condition being applied to a target.
 *
 * Deliberately returns null for weapon-type-conditional text ("For
 * Piercing or Slashing weapons... for Bludgeoning...") — applying the
 * wrong branch of a conditional the extractor can't safely resolve
 * would be a genuine mistake, not just an incomplete parse, and
 * confirmed against the real data that this exact pattern is rare
 * (3 of 120 fumble rows) — a safe text-only fallback is the right
 * call here, not worth the risk of guessing.
 *
 * @param {string} text
 * @returns {{type: "flat", amount: number}|{type: "bleed", formula: string}|null}
 */
/**
 * HP healing mentioned in an action's outcome text — "The target
 * regains 10 Hit Points." Deliberately narrow: only matches an
 * explicit flat Hit Points amount, not PP regeneration or other
 * resources phrased with similar "regain(s)" wording elsewhere in
 * this system's action data (Power Recovery, Recharge Item, and
 * so on), which this must not be confused with.
 *
 * @param {string} text
 * @returns {number|null}
 */
export function extractHealAmount(text) {
  const str = String(text ?? "");
  const match = str.match(/\bregains?\s+(\d+)\s+hit\s+points?\b/i);
  if (!match) return null;
  const amount = Math.trunc(Number(match[1]));
  return amount > 0 ? amount : null;
}

/**
 * A "pushed back N feet" outcome, wherever it is written.
 *
 * NEW at 3.376.0, and deliberately placed beside `extractHealAmount`
 * rather than in the forced-movement module: text-to-effect extraction
 * has a home in this project, and opening a second one is the "two places
 * deciding one question" trap in miniature.
 *
 * IT HAS TO READ TWO HOUSE STYLES, because the two places this sentence
 * appears do not agree with each other. The Shove action writes it out —
 * *"Your target is pushed back 5 feet"*, *"pushed up to 10 feet away"* —
 * and the critical tables abbreviate — *"Target is pushed back 5'"*,
 * *"Target is pushed back 10' and Stunned 2."*. Both forms were read off
 * the real data before this pattern was written, not guessed at.
 *
 * `upTo` is not cosmetic. Shove's critical says *up to* 10 feet, which is
 * a choice the shover makes; its success says 5 feet flat. A card that
 * offered a single button for both would quietly turn a maximum into a
 * requirement.
 *
 * @param {string} text
 * @returns {{feet: number, upTo: boolean}|null}
 */
export function extractPushDistance(text) {
  const str = String(text ?? "");
  const match = str.match(/\bpushed\s+(?:back\s+)?(up\s+to\s+)?(\d+)\s*(?:'|ft\b\.?|feet\b)/i);
  if (!match) return null;
  const feet = Math.trunc(Number(match[2]));
  if (!(feet > 0)) return null;
  return { feet, upTo: Boolean(match[1]) };
}

/**
 * A beneficial "reduce [condition] by N" outcome — First Aid's
 * bleeding reduction ("You reduce the bleeding by 3") and
 * Resuscitation's Dying reduction ("You reduce the target's Dying
 * condition by 3"). Deliberately narrow to the reducing direction
 * only: a fumble/blunder's "increase...by N" wording is the opposite
 * effect and must never be picked up by this same pattern.
 *
 * ITS OPPOSITE NOW EXISTS: `extractConditionIncrease` below. Until
 * 3.549.0 the harmful direction was read by nothing at all, which left
 * Resuscitation's Fumble and Blunder as text on a card — see that
 * function for what that cost.
 *
 * @param {string} text
 * @param {string} conditionLabel e.g. "bleeding" or "Dying"
 * @returns {number|null}
 */
export function extractConditionReduction(text, conditionLabel) {
  return conditionDelta(text, conditionLabel, "reduce");
}

/**
 * The harmful direction: "increase [condition] by N".
 *
 * WHY THIS EXISTS (3.549.0). Chapter 1's Death State entry names four
 * moments to test a creature's Dying against its Death State, and one
 * of them is a failed stabilisation. In TRG that is Resuscitation
 * (Medicine), whose Fumble reads "You increase the target's Dying
 * condition by 1" and whose Blunder reads "...by 2" — the only
 * increase-a-condition wording in the whole skill-action table.
 *
 * Nothing read it. The three beneficial degrees offered an Apply
 * button and the two harmful ones printed a sentence, so a botched
 * revival attempt did nothing to the patient unless the GM noticed
 * and edited the Dying value by hand. The death check itself was
 * never the gap — the death watch fires on any change to Dying — the
 * gap was that the change never happened. Found by the pages 6-15
 * audit, 10 September 2026.
 *
 * OFFERED, NOT APPLIED, in the same way the reduction is: the button
 * writes to somebody else's actor, and this one can kill them.
 *
 * @param {string} text
 * @param {string} conditionLabel e.g. "bleeding" or "Dying"
 * @returns {number|null}
 */
export function extractConditionIncrease(text, conditionLabel) {
  return conditionDelta(text, conditionLabel, "increase");
}

/**
 * The shared shape of both directions. One pattern with the verb
 * substituted, so the two can never drift into reading different
 * sentence structures — which is exactly what would have happened had
 * the increase been written as a second hand-rolled regex.
 */
function conditionDelta(text, conditionLabel, verb) {
  const str = String(text ?? "");
  const label = String(conditionLabel ?? "").trim();
  if (!label) return null;
  const pattern = new RegExp(
    `\\b${verb}[sd]?\\s+(?:the\\s+)?(?:target'?s\\s+)?${label}(?:\\s+condition)?\\s+by\\s+(\\d+)\\b`,
    "i"
  );
  const match = str.match(pattern);
  if (!match) return null;
  const amount = Math.trunc(Number(match[1]));
  return amount > 0 ? amount : null;
}

/**
 * Aid Defensive/Offensive (Chapter 4): "+N circumstance bonus" —
 * the Bonus Check Table result. Deliberately requires the literal
 * "+" sign in the text (not just any number) so this can't
 * accidentally match an unrelated numeric mention elsewhere in an
 * outcome's wording.
 *
 * @param {string} text
 * @returns {number|null}
 */
/**
 * An attitude shift, read off the outcome sentence the player is reading.
 *
 * NEW at 3.408.0, and written this way for the reason every extractor in
 * this file is: the card and the effect must come from ONE sentence, so
 * the engine can never announce a move the text beside it does not
 * describe. Make an Impression prints four different shifts across its
 * degrees; hard-coding them here would be a second copy of the table.
 *
 *   "The target's attitude toward you improves by two steps."   → +2
 *   "The target's attitude toward you improves by one step."    → +1
 *   "...attitude toward you decreases by one step."             → −1
 *   "...their attitude drops by two steps..."                   → −2
 *
 * WORDS, NOT DIGITS. Every printed instance spells the number out, so
 * the numerals are accepted too but the words are what this is for.
 *
 * RETURNS NULL FOR A SENTENCE THAT MERELY MENTIONS ATTITUDE — Request's
 * "The NPC's attitude is friendly or helpful" is a REQUIREMENT, not a
 * shift, and reading it as one would move an attitude every time
 * somebody made a request.
 *
 * @param {string} text
 * @returns {number|null} signed steps, or null
 */
export function extractAttitudeShift(text) {
  const str = String(text ?? "");
  const match = str.match(
    /\battitude\b[^.]*?\b(improves?|increases?|decreases?|drops?|worsens?|lowers?)\b[^.]*?\bby\s+(one|two|three|a|1|2|3)\s+steps?/i
  );
  if (!match) return null;
  const WORDS = { a: 1, one: 1, two: 2, three: 3, 1: 1, 2: 2, 3: 3 };
  const size = WORDS[String(match[2]).toLowerCase()];
  if (!size) return null;
  const worse = /^(decreases?|drops?|worsens?|lowers?)$/i.test(match[1]);
  return worse ? -size : size;
}

export function extractCircumstanceBonus(text) {
  const str = String(text ?? "");
  const match = str.match(/\+(\d+)\s+circumstance\s+bonus\b/i);
  if (!match) return null;
  const amount = Math.trunc(Number(match[1]));
  return amount > 0 ? amount : null;
}

export function extractSelfDamage(text) {
  const str = String(text ?? "");
  if (!str) return null;
  if (/\bfor\s+(piercing|slashing|bludgeoning)(\s+or\s+(piercing|slashing|bludgeoning))?\s+weapons\b/i.test(str)) return null;

  const flatMatch = str.match(/\byou\s+(?:take|inflict)\s+(\d+)\s+damage\b/i);
  if (flatMatch) {
    const amount = Math.trunc(Number(flatMatch[1]));
    if (amount > 0) return { type: "flat", amount };
  }

  const bleedMatch = str.match(/\b(\d+d\d+)\s+(?:persistent\s+)?bleed\b/i);
  if (bleedMatch) return { type: "bleed", formula: bleedMatch[1] };

  // Dice-based direct damage ("you take 2d10 mental damage") — but not
  // scaled amounts ("1d6 per PP of the spell"), which need context
  // (the spell's actual PP cost) this generic text parser doesn't
  // have; applying a flat single die-roll instead of the true scaled
  // amount would be a real understatement, not a safe approximation.
  const diceMatch = str.match(/\btake\s+(\d+d\d+)\s+(?:\w+\s+)?damage\b(?!\s+per\b)/i);
  if (diceMatch && !/\bper\s+(pp|level)\b/i.test(str)) {
    return { type: "diceDamage", formula: diceMatch[1] };
  }

  return null;
}

/**
 * Duration embedded directly in fumble-table text — these tables have
 * no structured persistence column the way critical tables do, so
 * "until the end of your next turn" (auto-expires after 1 round,
 * matching the critical tables' own "Minimal Effect" definition) and
 * "until healed" (never auto-expires — tied to healing, not turns,
 * same reasoning as computePersistenceRounds' UH handling) are
 * recognised directly from the wording instead.
 *
 * @param {string} text
 * @returns {{autoExpires: boolean, rounds: number|null}}
 */
/*
 * "THEIR" NEXT TURN IS A NEXT TURN (3.581.0; the pages 211-220 audit's
 * D1, Graham's R1 of 21 September 2026, "Yes").
 *
 * This pattern accepted exactly one possessive — "your" — which is the
 * FUMBLE tables' wording, and right there: a fumble happens to the
 * person swinging. The CRITICAL tables speak about the target and say
 * "their", and the pattern turned nineteen rows' one-round conditions
 * into permanent ones. Bludgeoning 47 is the plainest of them: "Target
 * is Stunned 2 and Injured 2 until the end of their next turn" — an
 * Injured 2 the book grants for a round, and the target carried for the
 * rest of the campaign.
 *
 * Every possessive the tables actually use is listed, measured against
 * all 644 rows rather than guessed at, and the possessive is optional
 * because two rows write "until the end of next turn" bare.
 */
export const NEXT_TURN_DURATION =
  /\buntil\s+(?:the\s+)?(?:beginning|end)\s+of\s+(?:your|their|its|his|her|the\s+target'?s?)?\s*next\s+turn\b/i;

export function extractTextDuration(text) {
  const str = String(text ?? "");
  if (NEXT_TURN_DURATION.test(str)) {
    return { autoExpires: true, rounds: 1 };
  }
  return { autoExpires: false, rounds: null };
}

/**
 * Serrated (Chapter 6, weapon trait): "Any bleed results from
 * criticals (or other sources when using the weapon) are increased
 * by 1." Applied as a small, separate step after condition resolution
 * rather than folded into resolveEffectiveConditions itself, which
 * shouldn't need to know about weapon traits — this is purely a
 * post-processing adjustment for whoever is wielding a Serrated
 * weapon.
 *
 * @param {Array<{key: string, label: string, value: number|null}>} tags
 * @param {boolean} hasSerrated
 * @returns {Array<{key: string, label: string, value: number|null}>}
 */
export function applySerratedBonus(tags, hasSerrated) {
  if (!hasSerrated) return tags;
  return tags.map((tag) =>
    tag.key === "bleeding" && tag.value !== null ? { ...tag, value: tag.value + 1 } : tag
  );
}

/**
 * SAVAGE STRIKES (Racial, Chapter 5, level 5): "When you critically hit
 * with a Strike using an unarmed attack, any bleed result is increased by
 * 1d4. A critical hit with a severity of serious or greater still
 * inflicts 1 bleed damage regardless."
 *
 * NEW at 3.377.0. Modelled on `applySerratedBonus` directly above,
 * because it is the same shape — a post-resolution transform of the
 * condition tags — and inventing a second shape for it would leave two
 * ways to adjust a bleed.
 *
 * TWO CLAUSES THAT DO DIFFERENT THINGS, and the distinction is the whole
 * rule:
 *
 *   1. A row that ALREADY bleeds gets `+1d4` on top.
 *   2. A row that does NOT bleed still inflicts a flat 1, but only at
 *      severity serious or deadly.
 *
 * THE SECOND CLAUSE DOES NOT THEN TAKE THE FIRST. "still inflicts 1 bleed
 * damage" is a floor, written as a flat number; adding 1d4 to it as well
 * would make the printed "1" describe nothing that can ever happen. This
 * is the reading, and it is a READING — the sentence can bear the other
 * one, and Graham has been told so rather than left to discover it.
 *
 * THE d4 IS INJECTED, not rolled here. This module is pure and Node-
 * importable, so the caller rolls and passes the face — which is also
 * what lets a harness drive every value from 1 to 4 instead of hoping.
 *
 * @param {Array<{key: string, label: string, value: number|null}>} tags
 * @param {object} options
 * @param {boolean} options.active Feat owned, unarmed, and a critical.
 * @param {string} options.severity "minor" | "serious" | "deadly".
 * @param {number} options.bleedBonus The rolled 1d4.
 * @returns {Array<{key: string, label: string, value: number|null}>}
 */
export function applySavageStrikes(tags, { active = false, severity = "", bleedBonus = 0 } = {}) {
  const list = Array.isArray(tags) ? tags : [];
  if (!active) return list;

  const bonus = Math.trunc(Number(bleedBonus));
  const hasBleed = list.some((tag) => tag.key === "bleeding" && tag.value !== null);

  if (hasBleed) {
    // A bonus that did not arrive must not silently become +0 — that
    // would be indistinguishable from the feat not applying at all.
    if (!Number.isFinite(bonus) || bonus <= 0) return list;
    return list.map((tag) =>
      tag.key === "bleeding" && tag.value !== null ? { ...tag, value: tag.value + bonus } : tag
    );
  }

  const seriousOrWorse = ["serious", "deadly"].includes(String(severity ?? "").trim().toLowerCase());
  if (!seriousOrWorse) return list;
  return [...list, { key: "bleeding", label: "Bleeding", value: 1 }];
}

/**
 * SKEWERING STRIKES (Creature Codex; 3.631.0): "If the attack inflicts
 * recurring bleed damage, the amount of bleed is increased by one per
 * severity level of the critical" — Minor 1, Serious 2, Deadly 3, on a
 * strike with a spear-group weapon. Pure; the attack path asks whether
 * the creature has it and the weapon's group.
 */
export function applySkeweringStrikes(tags, { active = false, severity = "" } = {}) {
  const list = Array.isArray(tags) ? tags : [];
  if (!active) return list;
  const level = { minor: 1, serious: 2, deadly: 3 }[String(severity ?? "").trim().toLowerCase()] ?? 0;
  if (!level) return list;
  return list.map((tag) => (tag.key === "bleeding" && tag.value !== null ? { ...tag, value: tag.value + level } : tag));
}
