/**
 * A CAGE YOU HURT YOURSELF GETTING OUT OF.
 *
 * NEW at 3.472.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS, ONE SENTENCE.
 *
 *   FLAME PRISON  "Escaping the prison requires a successful Reflex save
 *                  with the following results.
 *                  Critical  8d6 fire damage and escapes.
 *                  Success  16d6 fire damage and escapes.
 *                  Failure  24d6 fire damage, a Minor Fire critical, and
 *                           escapes.
 *                  Fumble   24d6 fire damage, a Serious Fire critical,
 *                           and FAILS to escape."
 *
 *   FORCE PRISON   the same ladder at 8d6 / 12d6 / 16d6 / 16d6, force.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LADDER RUNS THE WRONG WAY, AND THAT IS THE POINT.
 *
 * Every other save in this system pays a BETTER result with LESS harm by
 * halving or negating a single number. This one lists four separate
 * numbers, and the damage rises as the roll gets worse — 8d6 on a
 * Critical to 24d6 on a Fumble. It is not "basic save damage with a
 * multiplier"; it is four printed outcomes, so it is stored as four
 * printed outcomes rather than derived from one.
 *
 * A DERIVED LADDER WOULD HAVE BEEN WRONG TWICE OVER: Flame Prison
 * doubles from Critical to Success (8 → 16) and Force Prison does not
 * (8 → 12), and both repeat their top number on Fumble. No single rule
 * generates both.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ESCAPING IS THE SEPARATE QUESTION.
 *
 * Three of the four degrees let you out — including FAILURE, which costs
 * 24d6 and a Minor critical and still opens the cage. Only a Fumble
 * keeps you in. That is unusual enough that it is DECLARED per spell
 * rather than assumed for the family: a third prison that held you on a
 * failure would be a legal spell, and inferring the rule from these two
 * would silently give it the wrong one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 2 September 2026.
 *
 *   THE ATTEMPT IS A BUTTON on the cast card, pressed when the prisoner
 *   chooses to try, and pressable again after a Fumble. Escaping is a
 *   choice, and prompting every turn would spend the target's attention
 *   whether or not they meant to make it.
 *
 *   FLAME PRISON'S OTHER TWO NUMBERS ARE PRINTED, NOT ROLLED. "1d6 fire
 *   damage per minute" is a clock this system does not keep — a minute
 *   is ten rounds and nothing ticks on it — and "touching the bars
 *   inflicts 2d6" is a choice with no trigger anything can see. Charging
 *   the 1d6 per ROUND would have been ten times the printed rate, which
 *   is the system inventing a rule rather than applying one.
 *
 *   THE PRISONER IS MARKED, with an effect naming which prison holds
 *   them, cleared when they get out. With two cages up at once the table
 *   otherwise cannot see who is in which.
 */

/** Where a prisoner's cage is recorded. */
export const PRISON_FLAG = "imprisoned";

/** The degrees a prison ladder may name. */
export const PRISON_DEGREES = Object.freeze(["critical", "success", "failure", "fumble"]);

/** The critical severities this system knows. */
const SEVERITIES = Object.freeze(["minor", "serious"]);

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const DICE = /^([1-9]\d*)d([1-9]\d*)$/i;

/*
 * THE BOOK PRINTS FOUR DEGREES; THIS SYSTEM ROLLS SEVEN.
 *
 * `dice/resolution.mjs` has heroic, critical, success, partial, failure,
 * fumble and blunder. Both prisons name only Critical, Success, Failure
 * and Fumble — so three of the seven have no printed outcome, and a roll
 * that lands on one of them must still cost something definite.
 *
 * THE RULE: an unnamed degree takes the nearest named one that is NO
 * BETTER than it. Heroic beats Critical, so it takes Critical's 8d6 —
 * the best the spell offers. Partial is not a success, so it cannot take
 * Success's line and takes Failure's. Blunder is worse than Fumble and
 * takes Fumble's.
 *
 * ROUNDING TOWARDS THE PRINTED WORSE OUTCOME is the conservative
 * direction: it never hands a roll a better result than the book names
 * for a roll of that quality.
 *
 * GRAHAM CONFIRMED THIS ON 2 SEPTEMBER 2026, having been shown it as an
 * assumption of mine rather than a reading of the book. It is a RULING
 * now and not a default, which is why it is written here rather than
 * buried in a lookup nobody would find.
 */
const DEGREE_FALLBACK = Object.freeze({
  heroic: "critical",
  critical: "critical",
  success: "success",
  partial: "failure",
  failure: "failure",
  fumble: "fumble",
  blunder: "fumble"
});

/**
 * Which printed degree a rolled one resolves to.
 *
 * @param {string} rolled a key from dice/resolution.mjs
 * @returns {string|null} one of PRISON_DEGREES
 */
export function prisonDegree(rolled) {
  return DEGREE_FALLBACK[lower(rolled)] ?? null;
}

/**
 * A prison row, or null when it is malformed.
 *
 * EVERY DEGREE MUST BE NAMED. A ladder missing one is not a prison with
 * a gap — it is a prison whose behaviour on that roll nobody decided,
 * and defaulting it would invent a number the book never printed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normalisePrison(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "prison") return null;

  const damageType = lower(raw.damageType);
  if (!damageType) return null;

  const ladder = {};
  for (const degree of PRISON_DEGREES) {
    const dice = text(raw.ladder?.[degree]);
    if (!DICE.test(dice)) return null;
    ladder[degree] = dice;
  }

  // WHICH DEGREES OPEN THE CAGE, declared rather than inferred. Failure
  // opens it in both of these and that is surprising enough to write
  // down; a third prison may differ.
  const escapesOn = Array.isArray(raw.escapesOn)
    ? raw.escapesOn.map(lower).filter((d) => PRISON_DEGREES.includes(d))
    : [];
  if (!escapesOn.length) return null;

  const criticalOn = {};
  for (const [degree, severity] of Object.entries(raw.criticalOn ?? {})) {
    const d = lower(degree);
    const s = lower(severity);
    if (PRISON_DEGREES.includes(d) && SEVERITIES.includes(s)) criticalOn[d] = s;
  }

  return {
    label: text(raw.label) || "Prison",
    damageType,
    save: text(raw.save) || "Reflex",
    ladder,
    escapesOn,
    criticalOn,
    // PRINTED, NOT ROLLED — Graham's ruling. Carried so the card can say
    // them rather than the table having to remember they exist.
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(text).filter(Boolean)
  };
}

/**
 * What one escape attempt costs and whether it works.
 *
 * @param {object|null} spec a normalised prison
 * @param {string} degree the degree achieved on the Reflex save
 * @returns {{dice: string, escapes: boolean, severity: string|null}|null}
 */
export function prisonOutcome(spec, degree) {
  if (!spec) return null;
  const d = lower(degree);
  if (!PRISON_DEGREES.includes(d)) return null;
  return {
    dice: spec.ladder[d],
    escapes: spec.escapesOn.includes(d),
    severity: spec.criticalOn[d] ?? null
  };
}

/** What the card says when an escape is attempted. */
export function prisonAttemptLine(spec, name, degree, taken, rolled, outcome) {
  const reduced = Number(taken) !== Number(rolled) ? ", reduced by their defences" : "";
  return `<strong>${spec.label}</strong> — ${name} rolls ${spec.save}: `
    + `<strong>${degree}</strong>, taking <strong>${taken}</strong> ${spec.damageType} `
    + `(${outcome.dice} rolled ${rolled}${reduced}).`;
}

/** What the card says about getting out — or not. */
export function prisonEscapeLine(spec, name, escaped) {
  return escaped
    ? `<strong>${name} is out.</strong>`
    // A FUMBLE COSTS THE MOST AND CHANGES NOTHING, which is worth saying
    // plainly: a player who has just taken 24d6 needs to know they may
    // try again rather than assuming the spell is stuck.
    : `<em>${name} is still caged, and may try again.</em>`;
}

/** The whole printed ladder, for the cast card. */
export function prisonLadderLine(spec) {
  return PRISON_DEGREES
    .map((d) => {
      const o = prisonOutcome(spec, d);
      const crit = o.severity ? `, a ${o.severity} ${spec.damageType} critical` : "";
      return `${d}: ${o.dice}${crit}${o.escapes ? "" : " — and stays in"}`;
    })
    .join("; ");
}

/** What the card says when there is nothing to escape from. */
export function prisonRefusal(why) {
  return `<em>No escape attempt — ${why}.</em>`;
}
