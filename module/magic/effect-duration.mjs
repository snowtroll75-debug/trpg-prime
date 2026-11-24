/**
 * How long ONE effect of a spell lasts.
 *
 * NEW at 3.405.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BACKLOG THIS UNBLOCKS, MEASURED BEFORE IT WAS BUILT.
 *
 * 3.404.0 taught effects to depend on the target's save degree, and the
 * next step was to wire the ~68 spells whose printed ladders had been
 * flattened to one row. `tools/parse-degree-ladders.mjs` read all of
 * them and could only express THREE. The largest single reason it
 * refused — nineteen spells, more than the other five reasons except
 * MULTI — was this one:
 *
 *   LUMINOUS FLARE   Critical  unaffected
 *                    Success   dazzled 1 for 1 round
 *                    Failure   dazzled 1 for 1 minute
 *                    Fumble    blinded for 1 hour
 *
 * The degree gate could already say WHICH condition each degree gets.
 * It could not say for HOW LONG, because the duration was read once per
 * CAST — `spell.system.duration`, one value for every effect the spell
 * carries. Wiring Luminous Flare without this would have applied the
 * right condition on every degree and the same length on all three: the
 * flattening removed at the condition layer and reintroduced one layer
 * down, which is precisely the trap `recipientsForEffect` was written
 * to avoid at the recipient layer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPELL'S DURATION REMAINS THE DEFAULT, AND THAT IS THE WHOLE
 * COMPATIBILITY STORY. An effect with no `duration` of its own reads
 * the spell's, exactly as every effect did before this file existed.
 * Around a hundred and fifty pack entries depend on that and not one of
 * them is touched. `duration` on an effect row is opt-in.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE CHOICE LIVES HERE RATHER THAN IN THE APPLIER.
 *
 * The obvious implementation is one line inside `applySpellEffects`:
 *
 *   const parsed = parseSpellDuration(effect.duration || durationSource);
 *
 * and it would work. It would also be invisible. `applySpellEffects` is
 * an async function that reads `game.time`, `game.combat` and the
 * condition registry, and no harness in this project can call it — the
 * exact shape that hid three defects this week: the light level that
 * returned a bare number, the sheet that decided a glow independently
 * of the shedding rule, and the cone that persisted onto a torch. Every
 * one of them was a decision made inside a Foundry-only function.
 *
 * So the decision is a pure function with a name, and the applier calls
 * it. What can then be checked without Foundry: that a per-effect
 * duration overrides the spell's, that a blank one does not, that an
 * unparseable one is caught before it ships.
 */

/**
 * Parse a duration phrase into `{rounds, seconds, sustained}`, or null.
 *
 * MOVED HERE FROM spell-effects.mjs AT 3.405.0, unchanged. It was the
 * only piece of duration reasoning in the system and it sat in a file
 * that cannot be imported for many purposes; now every question about
 * how long something lasts is answered in one pure place. spell-effects
 * re-exports it so its three existing importers are undisturbed.
 *
 * Instantaneous or blank → null: a heal and a burst of temp HP need no
 * duration, and inventing one for them would put a countdown on the
 * character sheet that the book never prints.
 *
 * @param {string} text
 * @returns {{rounds:number|null, seconds:number|null, sustained:boolean}|null}
 */
/**
 * How long a TURN-RELATIVE phrase lasts, in rounds.
 *
 * MOVED HERE FROM outcome-effects.mjs AT 3.414.0, unchanged. It lived two
 * directories away in a module about parsing outcome text, while THIS
 * file claimed in its own header to be the one pure place where "how long
 * does something last" is answered — and could not read the rulebook's
 * two commonest duration phrases. Two places deciding one question, with
 * the better answer in the one that had not claimed it.
 *
 * "Until the end of your next turn" is two round boundaries away; "until
 * the end of your turn" is one. Anything vaguer — "until you achieve a
 * Critical against them", "for 1 week" — returns null and is left to the
 * text, because inventing a round count for it would be worse than
 * leaving the effect in place for a person to clear.
 *
 * @param {string} text
 * @returns {number|null} Rounds from now, or null if not countable.
 */
export function extractDurationRounds(text) {
  const source = String(text ?? "");
  if (/until the end of (?:your|their|its) next turn/i.test(source)) return 2;
  if (/until the end of (?:your|their|its) (?:current )?turn/i.test(source)) return 1;
  // "THE CURRENT TURN" (3.611.0, R3 of block 34): a reaction cast on
  // somebody else's turn — Deflect Flame's, Windy Escape's and Element
  // Ward's resistance against the hit that triggered it — lasts until that
  // turn ends, whoever's it is.
  if (/until the end of the (?:current )?turn/i.test(source)) return 1;
  if (/until the (?:start|beginning) of (?:your|their|its) next turn/i.test(source)) return 1;
  const rounds = /\bfor (\d+) rounds?\b/i.exec(source);
  if (rounds) return Math.max(1, Math.trunc(Number(rounds[1])) || 1);
  if (/\bfor 1 round\b/i.test(source)) return 1;
  return null;
}

/**
 * THE CLOCK FOR "UNTIL THE START OF YOUR NEXT TURN" (3.707.1).
 *
 * In an encounter the effect ends when its CASTER's next turn starts — the
 * turn-start sweep reads `endsAtTurnStartOf` — and on no round clock, which
 * would end it at somebody else's turn. Out of an encounter there are no
 * turns, and the six seconds stand.
 *
 * THE BACKSTOP is two rounds of world time. A round's change moves the world
 * clock, so it cannot fall before the caster's next turn starts (that is at
 * most one round boundary away), and it still ends an effect whose caster
 * never takes that turn — removed from the combat, or the combat ended.
 *
 * Pure. `parsed.turnStartOf` is the caster's uuid, set by the cast on its own
 * duration only.
 *
 * @param {object|null} parsed parseSpellDuration's answer, with `turnStartOf`
 * @param {{inCombat: boolean, worldTime: number}} now
 * @returns {{turnStartOf: string, backstopEnd: number}|null}
 */
export function turnStartClock(parsed, { inCombat = false, worldTime = 0 } = {}) {
  if (!parsed?.untilTurnStart || !inCombat) return null;
  const who = String(parsed.turnStartOf ?? "").trim();
  if (!who) return null;
  return { turnStartOf: who, backstopEnd: Number(worldTime || 0) + TURN_START_BACKSTOP_SECONDS };
}

/** Two rounds of world time — see `turnStartClock`. */
const TURN_START_BACKSTOP_SECONDS = 12;

/**
 * THE CLOCK FOR "UNTIL THE END OF YOUR NEXT TURN" (3.707.2).
 *
 * Ends when the caster's NEXT turn ends. "Next" is the turn after the one in
 * progress at the cast: a cast in the caster's own turn outlasts that turn's
 * end, and a reaction cast on somebody else's turn ends with the caster's
 * coming one. So the stamp carries the turn it was cast in — the round and
 * the combatant then acting, the same pair the turn-end sweep is handed —
 * and that one turn's end is passed over.
 *
 * THE BACKSTOP is three rounds of world time: the end of the caster's next
 * turn is at most two round boundaries away, so it cannot come first.
 *
 * Pure. `parsed.turnEndOf` is the caster's uuid.
 *
 * @param {object|null} parsed
 * @param {{inCombat: boolean, worldTime: number, round: number, combatantId: string}} now
 * @returns {{turnEndOf: {of: string, castTurn: string}, backstopEnd: number}|null}
 */
export function turnEndClock(parsed, { inCombat = false, worldTime = 0, round = 0, combatantId = "" } = {}) {
  if (!parsed?.untilTurnEnd || !inCombat) return null;
  const who = String(parsed.turnEndOf ?? "").trim();
  if (!who) return null;
  return {
    turnEndOf: { of: who, castTurn: turnKey(round, combatantId) },
    backstopEnd: Number(worldTime || 0) + TURN_END_BACKSTOP_SECONDS
  };
}

/** Three rounds of world time — see `turnEndClock`. */
const TURN_END_BACKSTOP_SECONDS = 18;

/** A turn, named the same way at the cast and at its end (3.707.2). */
export function turnKey(round, combatantId) {
  return `${Math.trunc(Number(round) || 0)}:${String(combatantId ?? "")}`;
}

/**
 * Is this effect due as this turn ends? Pure (3.707.2): it ends "at the end of
 * your next turn", this is that caster's turn ending, and it is not the turn
 * the spell was cast in.
 *
 * @param {{of?: string, castTurn?: string}|null} stamp
 * @param {{turnOfUuid: string, endingTurn: string}} now
 */
export function dueAtTurnEnd(stamp, { turnOfUuid = "", endingTurn = "" } = {}) {
  const of = String(stamp?.of ?? "");
  if (!of || !turnOfUuid || of !== String(turnOfUuid)) return false;
  return String(stamp?.castTurn ?? "") !== String(endingTurn);
}

/**
 * Does this Flat-Footed carry a clock of its own rule's — "until the end of
 * its next turn", "until the start of your next turn" — stamped with whose
 * turn ends it (3.712.2)? Pure; takes the effect's `flags["trg-prime"]`.
 *
 * Graham, 24 November 2026: the core's end-of-turn removal of Flat-Footed
 * "should apply unless a local rule overrides it". A turn clock is that
 * local rule: its own sweep (`expireAtTurnEnd`, `expireTimedConditions`)
 * ends it, and the blanket removal leaves it alone. Found live with
 * Redirection Stance (Inner Tempest 1.1.0): an attacker made flat-footed
 * "until the end of its next turn" by a reaction on its own turn lost it as
 * that same turn ended.
 *
 * @param {object|null|undefined} flags
 * @returns {boolean}
 */
export function keepsOwnTurnClock(flags) {
  const end = flags?.endsAtTurnEndOf;
  if (end && typeof end.of === "string" && end.of) return true;
  const start = flags?.endsAtTurnStartOf;
  return typeof start === "string" && start.length > 0;
}

/** "Until the end of YOUR next turn" — the caster's (3.707.2). */
const UNTIL_YOUR_TURN_END = /until the end of your next turn/i;

/** "Until the start (or beginning) of YOUR next turn" — the caster's (3.707.1). */
const UNTIL_YOUR_TURN_START = /until the (?:start|beginning) of your next turn/i;

export function parseSpellDuration(text) {
  const t = String(text || "").toLowerCase();
  if (!t || /instant/.test(t)) return null;
  /*
   * "PERMANENT" IS A DURATION, NOT A PARSE FAILURE (3.586.0).
   *
   * Until now it returned null, and null is what `unreadableEffectDurations`
   * treats as a SHIP-BLOCKING typo — for the very good reason recorded
   * below it: "1 rnd" also parses to null, and an effect with no timing
   * never comes off the sheet.
   *
   * BLINDNESS IS WHERE THE TWO MEET. Its Fumble rung is *"the target is
   * blinded permanently"*, so the intended reading and the typo had
   * become the same signature — an effect that never expires — and the
   * check could not tell them apart. It was right to refuse: given only
   * `null`, "never expires" is indistinguishable from "nobody proofread
   * this".
   *
   * So permanence is SAID rather than inferred from a failure to read.
   * The shape is `sustained`'s, which has been a real duration with no
   * numbers in it since this parser was written: null rounds and null
   * seconds mean the same "no timing" they always did, and
   * `spellExpiryTiming` and `foundryDuration` need no case for it. What
   * changes is only that the harness can now see an author who MEANT it.
   */
  if (/\bpermanent(ly)?\b/.test(t)) {
    return { rounds: null, seconds: null, sustained: false, permanent: true };
  }
  const sustained = /sustain/.test(t);
  /*
   * A ROLLED DURATION IS NOT A NUMBER, AND USED TO PARSE AS THE WRONG ONE.
   *
   * NEW at 3.590.0. Word Of Blinding blinds "for 1d4 minutes" and
   * Magnificent Dawn blinds "for 3d6 rounds". The numeric match below
   * finds the digit that happens to sit before the unit, so:
   *
   *   "1d4 minutes"  ->  40 rounds   (it read the FOUR)
   *   "3d6 rounds"   ->   6 rounds   (it read the SIX)
   *
   * Both are wrong, and wrong in the worst way available — a confident
   * number, from a string the author wrote correctly. Refused here so
   * the unreadable-duration sweep catches an authored one, exactly as it
   * catches "1 rnd". A spell that MEANS a rolled duration says so with
   * `durationRoll` on the row, which is rolled when the condition is
   * applied; see the condition case in spell-effects.mjs.
   *
   * MEASURED BEFORE CHANGING: zero durations in the pack contain dice
   * today, so nothing that worked stops working.
   */
  if (/\d+\s*d\s*\d+/i.test(t)) return null;
  const m = t.match(/(\d+)\s*(rounds?|minutes?|mins?|hours?|hrs?|days?)/);
  if (!m) {
    // TURN-RELATIVE WORDING, tried only after the numeric forms fail.
    //
    // THE ORDER IS DELIBERATE AND CONSERVATIVE. Around a hundred and
    // fifty pack entries already parse through the numeric branch, and
    // `extractDurationRounds` reads "for N rounds" too — so running it
    // first would route existing entries down a new path to answer a
    // question the old one already answered. Reached only where the old
    // code returned null, this can ADD readings and cannot change one.
    const turns = extractDurationRounds(text);
    // "UNTIL THE START OF YOUR NEXT TURN" ENDS AT THE CASTER'S TURN (3.707.1).
    // Graham, 21 November 2026: "Any spell that has a duration of 'until the
    // start of your next turn' should end at the beginning of the characters
    // turn". One round on the clock ended it at the next round's top (the
    // world clock) or at the bearer's own turn, whoever's that was; the
    // marker lets the cast stamp the caster instead. See spell-effects.mjs's
    // `spellExpiryTiming` and the turn-start sweep in effect-application.
    // "YOUR" only: "their/its next turn" names a turn that is not the caster's.
    if (turns !== null && UNTIL_YOUR_TURN_START.test(String(text ?? ""))) {
      return { rounds: turns, seconds: turns * 6, sustained, untilTurnStart: true };
    }
    // "UNTIL THE END OF YOUR NEXT TURN" ENDS AT THE END OF THE CASTER'S NEXT
    // TURN (3.707.2; Graham, 21 November 2026, asked whether it should be
    // tied to the caster's own turn as the start was: "Yes").
    if (turns !== null && UNTIL_YOUR_TURN_END.test(String(text ?? ""))) {
      return { rounds: turns, seconds: turns * 6, sustained, untilTurnEnd: true };
    }
    if (turns !== null) return { rounds: turns, seconds: turns * 6, sustained };
    return sustained ? { rounds: null, seconds: null, sustained: true } : null;
  }
  const n = Number(m[1]);
  const unit = m[2];
  let rounds = null;
  let seconds = null;
  if (/round/.test(unit)) {
    rounds = n;
    seconds = n * 6;
  } else if (/min/.test(unit)) {
    rounds = n * 10;
    seconds = n * 60;
  } else if (/h/.test(unit)) {
    rounds = n * 600;
    seconds = n * 3600;
  } else if (/day/.test(unit)) {
    seconds = n * 86400;
  }
  /*
   * "×2 (EXTENDED)" IS A DOUBLING, NOT DECORATION (3.616.1, F1 of the 3.616.0
   * drive). Extend writes the doubled duration as the printed one with "×2"
   * after it, and this read only the number before the unit — so the card
   * said "1 minute ×2 (Extended)" and the effect still ended after 60
   * seconds, whether the feat or a Rod of Extension paid for it. The
   * multiplier is the "×" sign followed by a whole number; no printed
   * duration in the pack carries one.
   */
  const times = /×\s*(\d+)/.exec(t);
  const factor = times ? Math.max(1, Math.trunc(Number(times[1])) || 1) : 1;
  if (factor > 1) {
    if (rounds !== null) rounds *= factor;
    if (seconds !== null) seconds *= factor;
  }
  return { rounds, seconds, sustained };
}

/**
 * Does this effect declare a duration of its own?
 *
 * BLANK IS NOT A DECLARATION. `duration: ""` and `duration: "   "` are
 * what a half-finished pack entry looks like, and treating either as an
 * override would give the effect NO duration at all — permanent, until
 * a GM noticed and cleared it by hand. The spell's own duration is the
 * safer reading and the one the author almost certainly meant.
 */
export function declaresOwnDuration(effect) {
  return String(effect?.duration ?? "").trim().length > 0;
}

/**
 * The duration text that governs one effect.
 *
 * @param {object} effect
 * @param {string} spellDurationText the cast's duration, warps included
 * @returns {string}
 */
export function effectDurationText(effect, spellDurationText) {
  if (declaresOwnDuration(effect)) return String(effect.duration).trim();
  return String(spellDurationText ?? "");
}

/**
 * Every effect whose declared duration this system cannot read.
 *
 * THE SILENT FAILURE THIS EXISTS TO MAKE IMPOSSIBLE. `duration: "1 rnd"`
 * parses to null, and null means "no timing" — the effect is applied and
 * never expires. Nothing on the card says so; the condition simply stays
 * on the sheet after the spell it came from is long gone, and the first
 * person to notice is a GM wondering why a player has been blinded for
 * three sessions.
 *
 * A parse failure is therefore a SHIP-BLOCKING fault, not a warning, and
 * `verify-spell-degrees` fails on any entry this returns. Same reasoning
 * as an unknown `onSave` degree: an effect that silently does the wrong
 * thing for ever is worse than one that refuses to load.
 *
 * `sustained` with no number counts as readable — "sustained" is a real
 * duration the engine understands, not a typo. So does `permanent`,
 * since 3.586.0: Blindness's Fumble rung is permanent on purpose, and
 * the only way this check can tell that from an unproofread "1 rnd" is
 * if the author is able to say so. See `parseSpellDuration`.
 *
 * @param {object[]} effects
 * @returns {Array<{index:number, duration:string}>}
 */
export function unreadableEffectDurations(effects) {
  const out = [];
  const list = Array.isArray(effects) ? effects : [];
  list.forEach((effect, index) => {
    if (!declaresOwnDuration(effect)) return;
    const text = String(effect.duration).trim();
    if (parseSpellDuration(text) === null) out.push({ index, duration: text });
  });
  return out;
}

/**
 * Every distinct duration declared across an effect list.
 *
 * Used by the harness to check a degree ladder that PRINTS three lengths
 * carries three. Luminous Flare gating dazzled/dazzled/blinded on three
 * degrees but giving all three "1 round" is the flattening this release
 * removes, wearing the shape of the fix.
 */
export function declaredDurations(effects) {
  const seen = new Set();
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (declaresOwnDuration(effect)) seen.add(String(effect.duration).trim());
  }
  return [...seen];
}
