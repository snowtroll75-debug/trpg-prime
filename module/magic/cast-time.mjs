/**
 * CASTING TIME (3.518.0) — how long a spell takes, whether that fits
 * inside an encounter, and what a warp may do to it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 7 September 2026, in full:
 *
 *   "Anything with a cast time of more than 3 AP cannot be cast in
 *    combat. A combat round is 6 seconds so an AP equates to about 2
 *    seconds. A 1 minute casting would be 30 AP and a 10 minutes
 *    casting 300 AP, no combat would ever last that long."
 *
 * Two constants and a refusal come straight out of that sentence, and
 * everything else in this file is arithmetic.
 * ─────────────────────────────────────────────────────────────────────
 *
 * WHAT IT WAS DOING INSTEAD. `cast-workflow.mjs` converted a cast time
 * to AP with `baseAPOf`, which reads the LEADING NUMBER of a string and
 * knows nothing about its unit. So "10 minutes" became 10 AP and "7
 * days" became 7 AP — and since the affordability gate refuses a cost
 * the pool cannot cover, a ritual cast during an encounter was rejected
 * for being 8 AP short rather than for taking ten minutes. Measured
 * before building: 81 spells in the pack print a cast time in minutes,
 * hours or days, and every one of them was mispriced this way.
 *
 * `parseApCost` in combat/action-points.mjs already answered this
 * correctly — it returns 0 for any label it cannot read as a number —
 * so the defect was ONE conversion disagreeing with the rest of the
 * system, not a missing rule.
 *
 * A REFUSAL, NOT A WARN-AND-OVERRIDE. `ensureActionPoints` refuses by
 * default but offers "proceed anyway", and its comment gives the
 * reason: "a GM override or an unmodelled bonus-AP source might
 * legitimately apply". That reasoning is about the SIZE OF THE POOL and
 * does not transfer here. No bonus-AP source makes a ten-minute ritual
 * fit inside six seconds, so there is nothing for an override to
 * represent and the cast is simply refused while a combat is running.
 *
 * OUT OF COMBAT NOTHING CHANGES. AP is not tracked turn-by-turn there
 * (see `actorInCombat`), so a ten-minute cast outside an encounter
 * costs nothing and is not gated — it is a ten-minute cast, which is
 * what the spell says.
 *
 * WHY THE AP-SHAPED STRINGS KEEP READING THEIR LEADING NUMBER. "1-3 AP"
 * is a choice the caster makes and "1 AP+" is a floor they may spend
 * above; both are castable in an encounter and both already cost what
 * their first number says. Taking the larger end of "1-3 AP" would have
 * charged three actions for a spell the player may have cast with one,
 * so the only behaviour this file changes is the unit conversion.
 */

/**
 * Seconds in one Action Point. Graham, 7 Sep 2026: a round is 6 seconds
 * and "an AP equates to about 2 seconds".
 */
export const SECONDS_PER_AP = 2;

/**
 * The longest cast that fits inside an encounter, in AP. Anything above
 * this is refused while a combat is running.
 */
export const MAX_COMBAT_AP = 3;

const SECONDS = {
  second: 1,
  minute: 60,
  hour: 3600,
  day: 86400,
  week: 604800
};

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * A cast time as a number of Action Points, or null when it is outside
 * the AP economy entirely.
 *
 * NULL IS NOT ZERO HERE. "Reaction" draws on a separate economy and
 * "Free" costs nothing, and both are perfectly castable during a fight;
 * returning null lets the legality test say so without the callers
 * having to special-case two labels each. An unreadable label returns
 * null for the same reason `parseApCost` treats one as free — a cast
 * time nothing can parse must not be GUESSED at, least of all upward
 * into a refusal.
 *
 * @param {number|string|null} castAP the spell's stored cast time
 * @returns {number|null}
 */
export function castTimeAP(castAP) {
  if (castAP === null || castAP === undefined) return null;
  if (typeof castAP === "number") return Math.max(0, int(castAP));

  const t = String(castAP).trim().toLowerCase();
  if (!t) return null;
  if (t === "free" || t === "reaction") return null;

  // A TIME UNIT IS TESTED FIRST, because it is the one shape the old
  // conversion got wrong and the one this file exists for.
  const time = /(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week)s?\b/.exec(t);
  if (time) {
    const seconds = Number(time[1]) * SECONDS[time[2]];
    // ROUNDED UP. Part of an action is an action, so a three-second cast
    // is two AP rather than one — and a cast time of no time at all
    // stays 0, which is free and perfectly legal, rather than being
    // pushed up to 1 by a floor guarding nothing the pack contains.
    return Math.ceil(seconds / SECONDS_PER_AP);
  }

  // THE LEADING NUMBER, deliberately: see the header. "1-3 AP" is 1
  // because the caster may cast it with one action, and "1 AP+" is 1
  // because that is its floor.
  const ap = /^\s*(\d+)/.exec(t);
  return ap ? int(ap[1]) : null;
}

/**
 * Whether this cast can be made while a combat is running.
 *
 * @param {number|string|null} castAP
 * @returns {boolean}
 */
export function castTimeIsCombatLegal(castAP) {
  // THROUGH THE COST, NOT THROUGH A NULL BRANCH. This was written as
  // `ap === null || ap <= MAX_COMBAT_AP`, and `mutate-cast-time` L3
  // showed the first half was doing nothing at all: `null <= 3` is TRUE
  // in JavaScript, because null coerces to 0. That is the EIGHTH dead
  // guard this project has deleted rather than defended.
  //
  // Deleting it alone would have left the rule working by accident —
  // correct today, wrong the day somebody reverses the comparison — so
  // the intent is said out loud instead. A cast outside the AP economy
  // costs nothing, and nothing fits in any encounter.
  return castTimeApCost(castAP) <= MAX_COMBAT_AP;
}

/**
 * What this cast time actually deducts from the pool. Outside the AP
 * economy — Reaction, Free, an unreadable label — it deducts nothing.
 *
 * @param {number|string|null} castAP
 * @returns {number}
 */
export function castTimeApCost(castAP) {
  return castTimeAP(castAP) ?? 0;
}

/**
 * A cast time in words, for a card that must say what the caster is
 * actually doing rather than print a number of actions nobody has.
 *
 * @param {number|string|null} castAP
 * @returns {string}
 */
export function castTimeLabel(castAP) {
  if (typeof castAP === "number") return `${castAP} AP`;
  const t = String(castAP ?? "").trim();
  if (!t) return "";
  // AN AP COUNT WRITTEN AS DIGITS gets its unit; anything else already
  // carries its own words ("10 minutes", "Reaction", "1-3 AP").
  return /^\d+$/.test(t) ? `${t} AP` : t;
}

/**
 * The line refusing a cast that cannot fit inside an encounter. It
 * SHOWS THE ARITHMETIC rather than only the verdict, because "you
 * cannot cast this" reads like a bug and "ten minutes is about 300
 * actions" reads like a rule.
 *
 * @param {string} spellName
 * @param {number|string} castAP
 * @returns {string|null}
 */
export function tooLongForCombatLine(spellName, castAP) {
  const name = String(spellName ?? "").trim();
  if (!name) return null;
  const ap = castTimeAP(castAP);
  if (ap === null) return null;
  return `<strong>${name}</strong> takes ${castTimeLabel(castAP)} to cast`
    + `${/^\d+$/.test(String(castAP).trim()) || typeof castAP === "number" ? "" : ` — about ${ap} AP at ${SECONDS_PER_AP} seconds an action`}`
    + `, and a cast longer than ${MAX_COMBAT_AP} AP cannot be made during an encounter.`;
}

/**
 * Does this spell sell a warp that changes its casting time? Asked
 * BEFORE the warp chooser opens, so a spell whose printed time is too
 * long for combat is not refused before the player can reach the option
 * that shortens it.
 *
 * READS THE DECLARED MODS, NOT THE PRINTED TEXT. Matching the sentence
 * is how `absorbConditions` and `reduceBleed` spent two releases
 * inert — see the note in spell-warp.mjs. A warp changes the cast time
 * when it says so in `mods`, and if it does not, it does not.
 *
 * @param {object} spellData the spell's `system`
 * @returns {boolean}
 */
export function offersCastTimeWarp(spellData) {
  return (Array.isArray(spellData?.warps) ? spellData.warps : [])
    .some((w) => w?.mods?.castApSet !== undefined && w?.mods?.castApSet !== null
      || Number(w?.mods?.castApDelta ?? 0) !== 0);
}

/**
 * The cast time after warping.
 *
 * TWO KEYS, BECAUSE THE FIVE WARPS SPEAK TWO WAYS. Three of them SET a
 * new time ("cast time changes to 3 AP", "the casting time changes to
 * 10 minutes") and one REDUCES the printed one ("lower the AP cost to
 * cast the spell by 1 AP (min 1)"). A set replaces; a delta adjusts.
 *
 * THE SET IS APPLIED FIRST and the delta to whatever it produced, which
 * is the only order that reads the two sentences as written: "changes
 * to 3 AP" names the new time, and "lower it by 1" lowers the time the
 * spell has.
 *
 * A DELTA ON A TIME-UNIT CAST IS APPLIED IN AP, at the ruling's own
 * conversion — one action off a ten-minute ritual is 299 AP rather than
 * nothing. Nothing in the pack pairs them today, and the honest answer
 * for the day something does is the arithmetic rather than a silently
 * dropped purchase.
 *
 * @param {number|string} castAP the printed (or AP-mode) cast time
 * @param {object} warpMods aggregated warp mods
 * @returns {number|string} the effective cast time
 */
export function warpedCastTime(castAP, warpMods = {}) {
  const set = warpMods?.castApSet;
  const base = set === undefined || set === null ? castAP : set;

  const delta = int(warpMods?.castApDelta);
  if (!delta) return base;

  const ap = castTimeAP(base);
  // A REACTION HAS NO NUMBER TO LOWER. Reducing it would turn a
  // reaction into a 1 AP cast, which is a different thing entirely.
  if (ap === null) return base;
  return Math.max(1, ap + delta);
}

/**
 * The cast time once extra actions have been bought on top of it — the
 * "1 AP+" spells, where spending more actions buys a bigger spell.
 *
 * HERE FOR THE REASON `totalCastTime` IS HERE. This was three lines in
 * the middle of `castSpell`, and the check that covered it matched the
 * SOURCE TEXT of those lines: it failed the moment the rule was MOVED
 * without being changed, and would have passed had the rule been
 * neutered in place. That is the defect this project has now recorded
 * three times.
 *
 * NOTHING BOUGHT LEAVES THE PRINTED TIME EXACTLY AS IT WAS, unit and
 * all. Collapsing "1 minute" to a number here is how the legality gate
 * below it lost the ability to see a unit at all.
 *
 * @param {number|string} castAP
 * @param {number} extraActions
 * @returns {number|string}
 */
export function castTimeWithExtraActions(castAP, extraActions = 0) {
  const extra = int(extraActions);
  if (!extra) return castAP;
  return (castTimeAP(castAP) ?? 0) + extra;
}

/**
 * What the cast finally spends, given the time it takes and everything
 * bought on top of it: extra casting time in actions, and a metamagic AP
 * delta (Quicken -1, Economic +1).
 *
 * HERE RATHER THAN INLINE IN THE WORKFLOW, and that is the whole point
 * of the function. It used to be three lines of arithmetic in the middle
 * of `castSpell`, where the only way to check it was to write the same
 * arithmetic again in a test — a check that agrees with a copy of the
 * rule rather than with the rule, which passes happily while the real
 * line is neutered. This project has caught that shape often enough to
 * stop writing it.
 *
 * THE FLOOR IS 1, and only for a cast that has a number at all. A
 * reaction passes through as its own label, which `parseApCost` reads as
 * free; pushing it to 1 AP would quietly move it into the action economy
 * it is defined as sitting outside of.
 *
 * @param {number|string} castAP the cast time AFTER warping
 * @param {{extraApSpent?: number, apDelta?: number}} extras
 * @returns {number|string} what to hand `spendActionCost`
 */
export function totalCastTime(castAP, { extraApSpent = 0, apDelta = 0 } = {}) {
  const ap = castTimeAP(castAP);
  if (ap === null) return castAP;
  return Math.max(1, ap + int(extraApSpent) + int(apDelta));
}
