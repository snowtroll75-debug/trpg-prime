/**
 * HOW MANY CREATURES A SPELL MAY TOUCH.
 *
 * NEW at 3.498.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES, found on 5 September 2026 while wiring Spirit Of
 * The Hunt's second warp.
 *
 * NOTHING IN THE SYSTEM PARSED OR ENFORCED A SPELL'S PRINTED TARGET
 * COUNT. The picker offered every creature on the scene and the player
 * ticked whom they liked, so "1 creature" was not a limit — and 46 warps
 * across the pack that sell "an additional target" could not buy
 * anything, because there was no limit for them to raise.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE PACK ACTUALLY SAYS, measured before any of this was written.
 * 354 spells declare targets:
 *
 *   304  a leading number        "1 creature", "2 objects"
 *     9  "up to N"               "up to 6 creatures"
 *     3  "or more"               Magic Missile, Scorching Ray, Scribers Chant
 *     9  "you and …"             six of them "you and up to N"
 *    19  a bare singular         "one willing creature", "the triggering ally"
 *    10  genuinely uncountable   "any number of creatures", "all creatures in range"
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TRAP, and it is why a naive `/up to (\d+)/` would have been wrong:
 * TWO OF THOSE NUMBERS ARE NOT COUNTS.
 *
 *   Shape Wood   "an unworked piece of wood up to 20 CUBIC FEET in volume"
 *   Open/close   "object weighing up to 30 LBS. or portal…"
 *   Rope Trick   "up to 50 FEET of rope…"
 *
 * A parser that read those as target counts would let one casting of
 * Open/close reach thirty creatures. So a number is only a count when
 * what follows it is not a unit of size or weight.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "YOU AND UP TO N" IS N + 1. Graham's ruling, 5 September 2026.
 *
 * The printed grammar counts two things: "you" AND "up to 5 willing
 * creatures". So Shadow Walk carries the caster plus five others, six
 * rows in the picker. Reading the 5 as the whole allowance would make
 * the caster spend one of their own companions' places.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NULL MEANS "NO CAP", AND THAT IS THE HONEST ANSWER FOR TEN OF THEM.
 * "Any number of creatures", "all creatures in range", "1 or more
 * creatures" — the printed line declines to give a number, and inventing
 * one would be this file deciding a rule the book left open. Everything
 * downstream treats null exactly as the system behaved before this
 * release, which is what makes an unparsed line safe rather than silently
 * restrictive.
 */

const WORD_NUMBERS = Object.freeze({
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12
});

/**
 * Units that make a number a MEASUREMENT rather than a count.
 * See the header: "up to 30 lbs" is not thirty targets.
 */
const SIZE_UNITS = /^\s*(cubic\s+)?(feet|foot|ft|lbs?|pounds?|inches|inch|miles?|squares?|gallons?|cubic)\b/i;

const int = (v) => Math.trunc(Number(v) || 0);

/** A number written as digits or as an English word, or null. */
function numberAt(token) {
  const raw = String(token ?? "").trim().toLowerCase();
  if (/^\d+$/.test(raw)) return Number(raw);
  return WORD_NUMBERS[raw] ?? null;
}

/**
 * The most creatures or objects a printed target line allows.
 *
 * @param {string} targets the spell's `system.targets`
 * @returns {{max: number|null, self: boolean, shape: string}}
 *   `max` null means the line declares no countable limit. `self` marks
 *   the "you and …" shape, kept so a caller can say WHY the number is
 *   what it is rather than only what it is.
 */
export function parseTargetCount(targets) {
  const text = String(targets ?? "").trim();
  if (!text) return { max: null, self: false, shape: "none" };

  /*
   * UNCOUNTABLE BY DECLARATION. "1 or more creatures" names no number on
   * purpose — Magic Missile scales with the actions spent — so nothing
   * here should invent one.
   *
   * ONLY THIS ONE GUARD IS NEEDED, and that is worth saying because two
   * more were written beside it and `mutate-target-count` proved them
   * dead. "any number of creatures" and "all creatures in range" both
   * BEGIN with a word that is not a number, so they fall through every
   * branch below and answer null anyway; their guards changed no
   * behaviour and no mutation could prove them. "1 or more" is different
   * precisely because it starts with a digit: without this line
   * `leadingCount` reads the 1 and caps Magic Missile at a single
   * missile.
   *
   * The `shape` those two now report is "unparsed" rather than
   * "anyNumber" or "all". That is honest — the parser genuinely did not
   * read them — and a guard nothing can reach is one nobody should
   * trust, which is the rule this project already applied to
   * weapon-damage-bonus.mjs.
   */
  if (/\bor more\b/i.test(text)) return { max: null, self: false, shape: "orMore" };

  // "YOU AND …" — the caster is counted separately, per the ruling.
  const you = /^\s*you\b\s+and\b\s*(.*)$/i.exec(text);
  if (you) {
    const rest = you[1];
    const upTo = upToCount(rest);
    if (upTo !== null) return { max: upTo + 1, self: true, shape: "youAndUpTo" };
    const lead = leadingCount(rest);
    if (lead !== null) return { max: lead + 1, self: true, shape: "youAndCount" };
    // "you and the triggering ally" — one named companion, so two.
    if (/^\s*(the|a|an|one)\b/i.test(rest)) return { max: 2, self: true, shape: "youAndOne" };
    return { max: null, self: true, shape: "youAndMany" };
  }

  const upTo = upToCount(text);
  if (upTo !== null) return { max: upTo, self: false, shape: "upTo" };

  const lead = leadingCount(text);
  if (lead !== null) return { max: lead, self: false, shape: "count" };

  // A BARE SINGULAR. "one willing creature", "the triggering ally", "your
  // druidstaff", "a weapon you are currently wielding" — all one thing,
  // and the article is what says so.
  if (/^\s*(a|an|one|the|your|each|non-magical|petrified|weapon)\b/i.test(text)) {
    return { max: 1, self: false, shape: "singular" };
  }

  return { max: null, self: false, shape: "unparsed" };
}

/** "up to N <things>", but not "up to N feet". */
function upToCount(text) {
  const m = /\bup\s+to\s+(\w+)\s+(.*)$/i.exec(String(text ?? ""));
  if (!m) return null;
  const n = numberAt(m[1]);
  if (n === null) return null;
  // THE SIZE TRAP. See the header: a measurement is not a count.
  if (SIZE_UNITS.test(m[2])) return null;
  return n;
}

/** A number at the very start of the line, digits or word. */
function leadingCount(text) {
  const m = /^\s*(\w+)\b\s+(.*)$/.exec(String(text ?? ""));
  if (!m) return null;
  const n = numberAt(m[1]);
  if (n === null) return null;
  if (SIZE_UNITS.test(m[2])) return null;
  return n;
}

/**
 * The cap this casting actually has, warps folded in.
 *
 * A SPELL WITH NO PARSED CAP STAYS UNCAPPED even when a warp adds
 * targets: "one more than no limit" is not a number, and refusing on it
 * would turn an unparsed line into a restriction the book never printed.
 *
 * @param {string} targets the printed line
 * @param {object} warpMods the aggregated warp mods
 * @returns {number|null}
 */
export function targetCapFor(targets, warpMods = {}, casterLevel = 0) {
  const parsed = parseTargetCount(targets);
  if (parsed.max === null) return null;
  return baseCapAfterWarps(parsed.max, warpMods, casterLevel)
    + Math.max(0, int(warpMods?.extraTargets));
}

/**
 * The printed cap after any warp that NAMES A NEW TOTAL, before the
 * "an additional creature" increment is added on top.
 *
 * THREE WAYS TO SAY IT, AND ONLY ONE OF THEM WAS BUILT (3.520.0).
 * `extraTargets` is an INCREMENT — "you can target an additional
 * creature" — and it is what the 46 warps of 3.498.0 needed. Measured
 * this release: TWELVE MORE warps name a TOTAL instead, and no key could
 * carry one:
 *
 *   "you can target up to 10 targets within range"   a flat total
 *   "target up to 1 creature per level"              a total per caster level
 *
 * A TOTAL REPLACES; AN INCREMENT ADDS. Folding "up to 10" into
 * `extraTargets` would have made it eleven on a "1 creature" spell and
 * twelve on a "2 creatures" one — the printed number would mean
 * something different on every spell that bought it.
 *
 * THE LARGEST OFFER WINS when more than one is present. Nothing in the
 * pack sells both today, and taking the larger is the only reading that
 * cannot make a purchase into a penalty — the rule `warpedAreaText`
 * already applies to its cap, recorded there as "a waiver is a discount,
 * never a rebate".
 *
 * PER LEVEL MEANS CASTER LEVEL. Graham's ruling, 7 September 2026: the
 * same `casterLevelOf` the system uses for max PP per cast, overcasting
 * and resting recovery. Trade Essence's warp writes "per caster level"
 * in full and these three write "per level"; they are one concept.
 *
 * A CASTER LEVEL OF NOTHING BUYS NOTHING RATHER THAN EVERYONE. If the
 * level cannot be read, a per-level warp falls back to the printed cap
 * instead of to zero — zero would refuse every target on a spell the
 * caster just paid 8 PP to widen.
 *
 * @param {number} printed the parsed printed cap
 * @param {object} warpMods
 * @param {number} casterLevel
 * @returns {number}
 */
export function baseCapAfterWarps(printed, warpMods = {}, casterLevel = 0) {
  const base = Math.max(0, int(printed));
  const flat = Math.max(0, int(warpMods?.targetCap));
  const perLevel = Math.max(0, int(warpMods?.targetCapPerLevel));
  // NO FLOOR ON THE LEVEL. A negative one makes `scaled` negative, and
  // the `Math.max` below already discards it in favour of the printed
  // cap — `mutate-target-cap` L5 proved a floor here decided nothing.
  // The TWELFTH dead guard, and the fourth found this way in two
  // releases; the pattern is always the same, a test in front of a
  // comparison that had already answered it.
  const scaled = perLevel ? perLevel * int(casterLevel) : 0;
  return Math.max(base, flat, scaled);
}

/**
 * What the picker adds about the limit, or null when nothing needs
 * saying.
 *
 * SAID IN THE DIALOG, NOT ENFORCED BY IT. Graham's ruling, which this
 * file inherits rather than reopens: "a picker that silently removes a
 * legal choice is worse than one that allows a strange one." So the
 * boxes are not disabled and rows are not hidden; the gate below refuses.
 *
 * AND ONLY WHEN THE NUMBER IS NOT THE OBVIOUS ONE. The prompt already
 * prints the book's own line — "Targets: 1 creature" — so restating "up
 * to 1 may be chosen" beneath it is noise. The two cases where a reader
 * would get a different number from the one enforced are worth a
 * sentence, and they are the only two:
 *
 *   "you and up to 5 willing creatures"  reads as 5, enforces 6
 *   a warp bought more                   reads as printed, enforces more
 */
export function targetCapNote(targets, warpMods = {}) {
  const parsed = parseTargetCount(targets);
  if (parsed.max === null) return null;
  const extra = Math.max(0, int(warpMods?.extraTargets));
  const cap = parsed.max + extra;
  if (!parsed.self && !extra) return null;
  return `Up to ${cap} may be chosen${extra ? " (warped)" : ""}`
    + `${parsed.self ? ", including yourself" : ""}.`;
}

/**
 * Why this selection is refused, or null when it is legal.
 *
 * REFUSED RATHER THAN TRIMMED. Taking "the first N" would apply the
 * spell to creatures the player did not choose — the picker's rows are
 * unordered as far as they are concerned — and silently dropping the
 * rest is the same silence the ruling above forbids one step later.
 *
 * A SENTENCE, NOT A BOOLEAN, the shape `dismissRefusal` records: "you
 * cannot do that" with no reason is the kind of refusal a player retries
 * three times before asking the GM.
 */
export function overTargetRefusal({ spellName = "This spell", cap = null, chosen = 0 } = {}) {
  if (cap === null || cap === undefined) return null;
  if (chosen <= cap) return null;
  return `${spellName} targets ${cap} ${cap === 1 ? "creature or object" : "creatures or objects"}; `
    + `${chosen} were chosen. Untick ${chosen - cap} of them, or warp the spell to reach more.`;
}
