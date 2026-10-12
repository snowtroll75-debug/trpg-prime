import { levelDC } from "../dice/resolution.mjs";

/**
 * Falling From Height (Chapter 8, Other Rules). Pure logic only — the
 * roll, damage application, and chat card live in falling-workflow.mjs.
 *
 * "When you fall from a dangerous height (more than 5 feet) you take an
 * amount of bludgeoning damage equal to half the distance you fell...
 * DR does not help you when taking fall damage."
 *
 * "You must make a level-based Fortitude saving throw to resist injury.
 * The DC is increased by 1 per 5 points of Hit Point damage you take
 * from the fall." Per Chapter 1's own definition of a level-based save
 * with no attacking creature or effect, this uses the faller's own
 * Level DC — there's no attacker here, just gravity.
 */

/**
 * The height below which a fall is not a dangerous one.
 *
 * "When you fall from a DANGEROUS HEIGHT (more than 5 feet) you take an
 * amount of bludgeoning damage equal half the distance you fell."
 *
 * MORE THAN, so five feet exactly is not dangerous.
 */
export const DANGEROUS_HEIGHT_FEET = 5;

/**
 * Bludgeoning damage from a fall of the given distance (rounded down).
 *
 * NOTHING AT ALL AT OR BELOW THE THRESHOLD. Until 3.285.0 this halved
 * any distance, so a four-foot drop dealt 2 damage, landed you prone and
 * rolled a Fortitude save that could take your teeth out — live testing
 * of 3.284.0 did exactly that, twice. The chapter's parenthesis is a
 * threshold (Graham, 12 Aug 2026, on the full chapter text), and it is
 * applied HERE rather than at the call sites: everything downstream
 * already asks "was there damage?" and gets the right answer as soon as
 * this one does.
 */
export function fallingDamage(distanceFeet) {
  const distance = Math.max(0, Number(distanceFeet) || 0);
  if (distance <= DANGEROUS_HEIGHT_FEET) return 0;
  return Math.floor(distance / 2);
}

/**
 * Does this fall call for the injury save at all?
 *
 * Graham's ruling, 12 Aug 2026: **a fall that deals no damage does not
 * provoke an injury saving throw.**
 *
 * The chapter's save is "to resist injury", and its DC rises with the
 * damage taken — so a fall of no damage was reaching the table with
 * nothing to resist, at the flat Level DC, and a bad roll could break a
 * character's leg for landing softly. That was never a rule; it was a
 * save that ran because nothing had told it not to.
 *
 * WRITTEN AS A QUESTION ABOUT THE DAMAGE, not about its causes. Four
 * things can bring a fall to nothing — a drop of 5 feet or less, a
 * successful Arrest a Fall, Catfall reducing the distance, and now
 * Skyfeather's Feather Fall — and a rule listed by cause would need
 * amending for the fifth. Nil damage is nil damage.
 */
/*
 * A SOFT LANDING (3.582.0; the pages 221-230 audit's D10, Graham's R14
 * of 22 September 2026: "Yes").
 *
 * "If you fall into water, snow, or another relatively soft substance,
 * you can treat the fall as though it were 20 feet shorter, or 30 feet
 * shorter if you intentionally dove in. The effective reduction can't be
 * greater than the depth (so when falling into 10-foot-deep water, you
 * treat the fall as 10 feet shorter)."
 *
 * The falling dialog used to quote this sentence in a hint and ask the
 * GM to type the already-reduced distance — the one number on that card
 * that was homework while every other one was computed.
 *
 * THE DEPTH CAP IS A CAP, NOT A SUBSTITUTE. Ten feet of water caps the
 * reduction at ten; a hundred feet of water does not raise it above the
 * twenty or thirty the surface itself is worth.
 */
export const SOFT_LANDING_FEET = 20;
export const DOVE_IN_FEET = 30;

/**
 * How many feet a soft landing takes off the fall.
 *
 * @param {object} options
 * @param {boolean} options.soft water, snow or similar
 * @param {boolean} options.dove entered deliberately
 * @param {number|null} options.depth how deep it is, null for unlimited
 * @returns {number}
 */
export function softLandingReduction({ soft = false, dove = false, depth = null } = {}) {
  if (!soft) return 0;
  const worth = dove ? DOVE_IN_FEET : SOFT_LANDING_FEET;
  if (depth === null || depth === undefined) return worth;
  return Math.max(0, Math.min(worth, Math.trunc(Number(depth) || 0)));
}

/**
 * The distance a fall is treated as, after a soft landing and any other
 * reduction (a successful Grab an Edge is worth 20 feet of its own).
 *
 * @param {number} distanceFeet what was actually fallen
 * @param {object} [options] passed to {@link softLandingReduction}, plus
 *   `grabbedAnEdge`
 * @returns {{effective: number, reduction: number, reasons: string[]}}
 */
export function effectiveFallDistance(distanceFeet, options = {}) {
  const fallen = Math.max(0, Number(distanceFeet) || 0);
  const reasons = [];
  let reduction = 0;

  const soft = softLandingReduction(options);
  if (soft > 0) {
    reduction += soft;
    reasons.push(`${soft} feet for ${options.dove ? "diving into" : "landing in"} `
      + `${String(options.surface ?? "something soft")}`);
  }
  // "You can Grab an Edge (Climbing) as a reaction to reduce the damage
  // from some falls" — the skill action prints its own 20 feet.
  if (options.grabbedAnEdge) {
    reduction += SOFT_LANDING_FEET;
    reasons.push(`${SOFT_LANDING_FEET} feet for grabbing an edge`);
  }

  return { effective: Math.max(0, fallen - reduction), reduction, reasons };
}

export function fallProvokesInjurySave(damage) {
  return Math.max(0, Number(damage) || 0) > 0;
}

/** The Fortitude save DC: the faller's own Level DC, +1 per 5 damage taken. */
export function fallingSaveDC(level, damage) {
  return levelDC(level) + Math.floor(Math.max(0, Number(damage) || 0) / 5);
}

/**
 * The critical injury severity from the save's degree — this is its own
 * table, distinct from Basic Saving Throw: Critical avoids injury
 * entirely, and severity escalates one full step per degree down to
 * Blunder, which kills outright rather than inflicting a "worse than
 * deadly" critical.
 */
export function fallingInjuryOutcome(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
      return { severity: null, instantDeath: false };
    case "success":
      return { severity: "minor", instantDeath: false };
    case "partial":
      // No Partial row is listed; treated as no better than a Failure,
      // matching the sparse-table convention used throughout this project.
      // falls through
    case "failure":
      return { severity: "serious", instantDeath: false };
    case "fumble":
      return { severity: "deadly", instantDeath: false };
    case "blunder":
      return { severity: null, instantDeath: true };
    default:
      return { severity: "deadly", instantDeath: false };
  }
}

/* ------------------------------------------------------------------ *
 * FALLING SPEED                                                       *
 * ------------------------------------------------------------------ */

/**
 * "You fall approximately 500 feet in the first round of any fall (or
 * less if you hit the floor first). Each subsequent round of falling,
 * you will drop about 1,500 feet."
 *
 * TWO DIFFERENT NUMBERS, and the first round is the short one — a fall
 * begins from rest. Held as two constants rather than one rate, because
 * no single rate produces both.
 */
export const FIRST_ROUND_FEET = 500;
export const SUBSEQUENT_ROUND_FEET = 1500;

/**
 * "Unless you make some kind of skill check, falling pretty much any
 * distance will always use a minimum of 1 AP during an encounter."
 *
 * A MINIMUM, not a cost — a faller who spends AP on something else
 * spends more, and this is the floor under it. Named so the sentence has
 * somewhere to live and so the workflow does not carry a bare 1.
 */
export const FALLING_MINIMUM_AP = 1;

/**
 * How many rounds a fall of this distance takes.
 *
 * "OR LESS IF YOU HIT THE FLOOR FIRST" — a 40-foot drop is one round,
 * not a fraction of one, because the round is the unit the table
 * counts in. A fall of nothing takes no rounds at all, which is the one
 * case that is not "at least one".
 */
export function roundsToFall(distanceFeet) {
  const distance = Math.max(0, Number(distanceFeet) || 0);
  if (distance <= 0) return 0;
  // A `distance <= FIRST_ROUND_FEET` short-circuit stood here and could
  // not be made to fail: for anything inside the first round the
  // remainder is zero or negative and the ceiling of it is zero, so the
  // formula already answers 1. A guard in front of working arithmetic.
  return 1 + Math.ceil((distance - FIRST_ROUND_FEET) / SUBSEQUENT_ROUND_FEET);
}

/**
 * The fall, round by round — what a GM narrating a long drop needs.
 *
 * @returns {{round: number, feet: number, cumulative: number}[]}
 */
export function fallByRound(distanceFeet) {
  const distance = Math.max(0, Number(distanceFeet) || 0);
  const rows = [];
  let fallen = 0;
  for (let round = 1; round <= roundsToFall(distance); round += 1) {
    const thisRound = Math.min(
      round === 1 ? FIRST_ROUND_FEET : SUBSEQUENT_ROUND_FEET,
      distance - fallen
    );
    fallen += thisRound;
    rows.push({ round, feet: thisRound, cumulative: fallen });
  }
  return rows;
}

/* ------------------------------------------------------------------ *
 * FALLING ON A CREATURE                                               *
 * ------------------------------------------------------------------ */

/**
 * "If you land on a creature after falling, that creature must make a
 * DC 20 Reflex Saving Throw."
 *
 * A FLAT DC, not a level-based one — the only save in this chapter that
 * is, and it is printed as a number rather than as "level-based", so it
 * is kept as a number.
 */
export const LANDED_ON_DC = 20;

/** The severity ladder, worst first — the order "one degree less" walks. */
export const CRITICAL_SEVERITIES = Object.freeze(["deadly", "serious", "minor"]);

/** The worst of them, read off the ladder rather than written again. */
export const WORST_SEVERITY = CRITICAL_SEVERITIES[0];

/**
 * What the faller's own result passes on to whoever is underneath.
 *
 * A BLUNDER PASSES ON A DEADLY (Graham's ruling, 12 Aug 2026). The
 * faller's Blunder is instant death rather than a critical injury, so
 * the faller has no severity of their own — and "a critical of one
 * degree less severity" than nothing is nothing, which made the most
 * lethal fall in the game the gentlest landing for the person
 * underneath. It is read as worse than a Fumble rather than as absent,
 * so the ladder keeps going the direction the table does.
 *
 * ASKED OF THE WHOLE OUTCOME, not of the severity alone, because the
 * fact that distinguishes the two cases — a faller who took no critical
 * and a faller who was killed — lives in `instantDeath` and not in
 * `severity`. A caller passing only the severity could not tell them
 * apart, and this is exactly the pair that has to be told apart.
 *
 * @param {{severity: string|null, instantDeath: boolean}} outcome
 * @returns {string|null}
 */
export function severityPassedOn({ severity = null, instantDeath = false } = {}) {
  if (instantDeath) return WORST_SEVERITY;
  return severity ?? null;
}

/**
 * One degree less severe, or null.
 *
 * "a bludgeoning critical of one degree less severity (NONE IF THE
 * INITIAL WAS MINOR)" — the parenthesis is the bottom of the ladder, and
 * it is why this returns null rather than clamping at minor.
 */
export function oneDegreeLessSevere(severity) {
  const index = CRITICAL_SEVERITIES.indexOf(String(severity ?? "").toLowerCase());
  if (index < 0) return null;
  return CRITICAL_SEVERITIES[index + 1] ?? null;
}

/**
 * FOUR DEGREES ARE PRINTED AND SIX EXIST, and the three that are not
 * printed are named here rather than left to a `default`.
 *
 * A Blunder silently reading as "no effect" would be the opposite of
 * what it is, and a `default` that happens to agree with Fumble is a
 * line no mutation can contradict — which is how this table came to be
 * written out: removing `case "blunder"` from the switch changed nothing
 * at all, so nothing was checking it.
 */
export const LANDED_ON_DEGREE_ALIASES = Object.freeze({
  heroic: "critical",
  partial: "failure",
  blunder: "fumble"
});

/**
 * What landing on a creature does to it.
 *
 * The three unprinted degrees are resolved through
 * `LANDED_ON_DEGREE_ALIASES` above — stated, not defaulted.
 *
 * THE CRITICAL IS THE FALLER'S OWN, one degree down. "a bludgeoning
 * critical of one degree less severity" — less severe than what the
 * faller took, so the faller's severity has to be passed in. A fall that
 * injured nobody passes null and the creature takes no critical either,
 * which is the honest reading of "one degree less" than nothing.
 *
 * @param {string} degreeKey the creature's Reflex save result
 * @param {object} options
 * @param {number} options.fallingDamage what the FALLER took
 * @param {string|null} [options.fallerSeverity] the faller's own critical
 * @returns {{damage: number, severity: string|null, share: string}}
 */
export function landedOnOutcome(degreeKey, { fallingDamage = 0, fallerSeverity = null } = {}) {
  const took = Math.max(0, Math.trunc(Number(fallingDamage) || 0));
  const quarter = Math.floor(took / 4);
  const half = Math.floor(took / 2);
  switch (LANDED_ON_DEGREE_ALIASES[String(degreeKey ?? "").toLowerCase()]
    ?? String(degreeKey ?? "").toLowerCase()) {
    case "critical":
      return { damage: 0, severity: null, share: "none" };
    case "success":
      return { damage: quarter, severity: null, share: "a quarter" };
    case "failure":
      // `half`, NOT `took`. This read `damage: took` while the card went on
      // saying "half of the N taken" — so a creature landed on took the
      // faller's FULL damage on a failed save and the card described a
      // halving that never happened. Found 17 Aug 2026 by sweeping every
      // harness rather than only the one belonging to the change in hand;
      // `half` had been computed on line 268 and never used, which is why
      // nothing else in the file looked wrong.
      return { damage: half, severity: oneDegreeLessSevere(fallerSeverity), share: "half" };
    case "fumble":
      // "all", not "all of it" — the card reads
      // "(${share} of the ${damage} taken)", and "all of it of the 50
      // taken" is what live testing of 3.285.0 found on the card.
      return { damage: took, severity: fallerSeverity ?? null, share: "all" };
    default:
      // An unrecognised degree reads as the worst printed one. Reachable
      // only for a string that is not a degree at all — the three
      // unprinted degrees are named in the table above, so none of them
      // arrives here by accident.
      return { damage: took, severity: fallerSeverity ?? null, share: "all" };
  }
}

/**
 * FALLING OBJECTS. "Falling objects take damage in the same way as
 * characters. If dropped on a character, they use the falling on the
 * creature rules above, although the GM may make some modifications
 * based upon the size of the item."
 *
 * NO SECOND SET OF FUNCTIONS, because the chapter does not give one: an
 * object falling uses `fallingDamage`, and an object landing on somebody
 * uses `landedOnOutcome`. What is here is the sentence that says the GM
 * may adjust for size — a modification with no printed figure, so it is
 * carried as a note for the card rather than invented as a multiplier.
 */
export const FALLING_OBJECT_NOTE =
  "A falling object takes damage as a character does, and lands on one by the same rules — "
  + "the GM may adjust for the size of the item.";
