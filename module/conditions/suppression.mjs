/**
 * IGNORING A POINT OF A CONDITION — a standing suppression.
 *
 * NEW at 3.439.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO PP 1 SPELLS, AND BOTH OF CONFIDENT VEIL'S CLAUSES, ARE ONE RULE.
 *
 *   Banish Fatigue   "ignore 1 point of fatigue for the duration"
 *   Confident Veil   "this lowers your existing frightened condition by
 *                     1, AND whenever you would normally become
 *                     frightened during the spell's duration, effect is
 *                     reduced by 1"
 *
 * Confident Veil's first two clauses read as two rules and are one. A
 * standing "-1 to the EFFECTIVE value of frightened" lowers the point
 * you already have and lowers every point you gain while it runs,
 * because it is not an event that fires once — it is a subtraction that
 * is simply always true. That the printed text needed two sentences to
 * say it, and this needs none, is the sign the mechanism is the right
 * shape rather than a clever one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PAIN TOLERANCE ALREADY SUPPRESSES, AND THIS IS NOT THAT.
 *
 * `combat/pain-tolerance.mjs` has ignored a point of Dazed, Injured or
 * Weakened since the Chapter 6 pass, and it settled the hard part: an
 * OFFSETTING BONUS does not work, because "Dazed and Weakened are Status,
 * which stacks by highest-applies rather than summing", so a +1 status
 * would not reliably cancel a -1 status if any other status modifier
 * were present. Its answer was to reduce the actor's real condition
 * value and restore it later.
 *
 * That answer is right and this keeps it. What this changes is WHERE:
 *
 *   Pain Tolerance   writes the reduced number onto the actor, and must
 *                    remember to put it back — and cannot, if the
 *                    condition was cleared in between, which its own
 *                    code checks for and gives up on.
 *   This             leaves the actor's data alone and reduces the
 *                    EFFECTIVE value that `prepareConditions` hands to
 *                    the penalty pipeline.
 *
 * One subtraction, in the one place every reader already agrees on:
 * `conditionModifiers` takes its numbers from that map, and so does
 * `getConditionValue`, so the penalties, the sheet and any rule that
 * asks all see the same number without any of them being told about
 * suppression. Nothing has to remember to put anything back either —
 * when the spell's effect goes, the suppression goes with it, because
 * the suppression only ever existed as a reading of that effect.
 *
 * Pain Tolerance is NOT refactored onto this. It works, it is tested,
 * and rewriting a shipped rule to use a mechanism written an hour ago is
 * how a good day becomes a regression. Recorded here as the obvious next
 * user rather than done unasked.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT LOWERS THE NUMBER; IT NEVER REMOVES THE CONDITION.
 *
 * Fatigued 1 with one point ignored is Fatigued 0 — no penalty, because
 * `conditionModifiers` pushes nothing for an amount of zero — but still
 * FATIGUED. You have the condition; you are ignoring its effect, which
 * is what the spell says and not the same sentence. A rule that asks
 * `hasCondition("fatigued")` for a reason that is not a penalty (a
 * recovery rule, a prerequisite, a card's wording) must still find it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HIGHEST APPLIES, NOT SUMMED — a ruling, recorded as one.
 *
 * Nothing printed says what two Banish Fatigues do. Summing would let
 * two PP 1 spells ignore two points and four ignore four, which is the
 * kind of arithmetic Appendix 1 exists to prevent, and this project's
 * own condition merge already takes the same position for a
 * non-cumulative condition arriving from two sources ("keeps the most
 * severe instance"). So two suppressions of the same condition do not
 * add: the larger one is the one in force.
 *
 * A single spell asking for two points — Banish Fatigue's "+2 PP: ignore
 * an additional point" — is ONE suppression of amount 2 and is
 * unaffected by this.
 */

/** The system flag carrying one condition suppression. */
export const SUPPRESSION_FLAG = "conditionSuppression";

const text = (value) => String(value ?? "").trim();

/**
 * Validate and normalise one authored suppression.
 *
 * RETURNS NULL RATHER THAN THROWING — the position every normaliser in
 * this project takes. IDEMPOTENT, because the applier stores what this
 * returns on the effect flag and `prepareConditions` reads it back on
 * every data preparation, which is far more often than a held bonus is
 * read. `held-bonus.mjs` records what forgetting that cost.
 *
 * A SUPPRESSION OF ZERO IS MALFORMED, not a no-op: it would be an
 * effect on the sheet that changes nothing, which is the shape this
 * project keeps removing.
 *
 * The condition NAME is not checked here. This file has no business
 * knowing the registry, and a suppression naming a condition nobody has
 * simply subtracts from nothing — `verify-suppression` asks the registry
 * that question at build time, which is where an authoring typo should
 * be caught.
 */
export function normaliseSuppression(raw) {
  if (!raw || typeof raw !== "object") return null;
  const condition = text(raw.condition).toLowerCase();
  if (!condition) return null;
  // "IGNORES THE DOOMED CONDITION" IS NOT A BIG NUMBER (3.587.0).
  //
  // Death Ward (page 262) ignores Doomed outright, and Doomed has no
  // printed maximum. The first draft of this wrote `amount: 99`, which
  // is a guess wearing a number's clothes: it is right until somebody
  // is Doomed 100, and nothing anywhere says it is meant to be a cap.
  // A complete ignore is its own thing, so it says so, and
  // `suppressedConditionValues` zeroes it rather than subtracting.
  if (raw.all === true) {
    return { condition, amount: Infinity, all: true, label: text(raw.label) || "Suppression" };
  }
  const amount = Math.trunc(Number(raw.amount ?? raw.value));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { condition, amount, label: text(raw.label) || "Suppression" };
}

/**
 * The effective condition values once every suppression is applied.
 *
 * TAKES AND RETURNS A PLAIN MAP, so the whole rule is drivable without
 * Foundry — `prepareConditions` has a Map in hand at exactly the moment
 * this is needed.
 *
 * A SUPPRESSION OF A CONDITION THE ACTOR DOES NOT HAVE DOES NOTHING, and
 * in particular does not invent an entry at 0. An entry in this map is
 * what "has the condition" means to everything downstream; a spell that
 * ignores fatigue must not give its target fatigue.
 *
 * @param {Map<string, number>} values effective values, by condition id
 * @param {Array<object>} suppressions normalised suppressions
 * @returns {Map<string, number>} a new map; the input is not mutated
 */
/**
 * A suppression after its spell's warps.
 *
 * NEW at 3.529.0. Pure, and deliberately the MIRROR of `reliefConditions`
 * / `reliefBump` on the relief side — same two shapes, same names but for
 * the verb, so a reader who has met one already knows this one.
 *
 *   `suppressConditions` REPLACES which condition is ignored. Every warp
 *   that carries it says "instead": Voice Of Healing's "+2 PP: ignore the
 *   injured condition" swaps the dazed/weakened the base grants. A list,
 *   because a spell may name two, and the FIRST is taken — a suppression
 *   row carries one condition, and picking one of two is the author's job
 *   at the data fix, not a guess made here.
 *
 *   `suppressBump` RAISES how much is ignored. "+2 PP: ignore an
 *   additional point of fatigue" is one more point of the same condition.
 *
 * THE CEILING IS THE WARP'S OWN, not a constant here. Voice Of Healing
 * prints "(max -5)" and Banish Fatigue prints none, so the cap travels in
 * `suppressMax` beside the count exactly as `potencyMax` does — see
 * magic/spell-rune.mjs, where the same question was answered the same way.
 *
 * @param {object} spec a normalised suppression
 * @param {object} warpMods aggregated warp mods
 * @returns {object|null} the suppression to apply
 */
/** What a suppression row grants before any warp raises it. */
export const SUPPRESSION_BASE = 1;

/**
 * How many times an "ignore one more point" warp may be bought.
 *
 * THE SAME SHAPE AS `potencyStepMaxTimes`, and the same assumption: the
 * printed ceiling is a TOTAL ("max -5"), the spell already grants one
 * point, so a max of 5 is FOUR purchases and not five.
 *
 * THE BASE IS ASSUMED TO BE 1 because `warpMaxTimes` sees only the warp,
 * never the effect row it raises — exactly the limitation potency had.
 * That assumption is not left to trust: `verify-condition-suppression`
 * pins that every spell carrying a `suppressMax` has a base amount of 1,
 * so a future row starting at 2 fails the check rather than quietly
 * selling a purchase that does nothing.
 *
 * @param {number} cap the printed ceiling
 * @param {number} base what the row grants unwarped
 * @returns {number}
 */
export function suppressBumpMaxTimes(cap, base = SUPPRESSION_BASE) {
  const start = Math.max(1, Math.trunc(Number(base) || SUPPRESSION_BASE));
  return Math.max(0, Math.trunc(Number(cap) || 0) - start);
}

export function warpedSuppression(spec, warpMods = {}) {
  if (!spec) return null;
  // A COMPLETE IGNORE HAS NOTHING TO RAISE. Left to the arithmetic
  // below it happens to survive — Infinity + 2 is Infinity — but
  // surviving by luck is how a later `Math.min` against a cap quietly
  // turns "ignores it entirely" into ten points.
  if (spec.all) return { ...spec };
  const swap = Array.isArray(warpMods?.suppressConditions) ? warpMods.suppressConditions : null;
  const condition = swap && swap.length
    ? String(swap[0]).trim().toLowerCase()
    : spec.condition;
  const bump = Math.max(0, Math.trunc(Number(warpMods?.suppressBump) || 0));
  const cap = Math.trunc(Number(warpMods?.suppressMax) || 0);
  const wanted = Math.max(1, Math.trunc(Number(spec.amount) || 1)) + bump;
  // NO GUARD FOR A MISSING CAP. A zero cap means none was printed, and
  // `Math.min` against it would suppress nothing at all — the shape that
  // cost `landedTier` a check to get right at 3.524.0.
  return { ...spec, condition, amount: cap > 0 ? Math.min(wanted, cap) : wanted };
}

export function suppressedConditionValues(values, suppressions) {
  const list = (Array.isArray(suppressions) ? suppressions : []).filter(Boolean);
  if (!list.length) return new Map(values ?? []);

  // HIGHEST APPLIES — see the header. Collected before anything is
  // subtracted, so the order the effects happen to be read in cannot
  // change the answer.
  const strongest = new Map();
  for (const spec of list) {
    const current = strongest.get(spec.condition) ?? 0;
    if (spec.amount > current) strongest.set(spec.condition, spec.amount);
  }

  const out = new Map(values ?? []);
  for (const [condition, amount] of strongest) {
    if (!out.has(condition)) continue;
    // A complete ignore carries Infinity, and `0 - Infinity` clamped at
    // zero is the same answer — but written out, because a reader who
    // meets Infinity in arithmetic is entitled to be told it was meant.
    if (!Number.isFinite(amount)) { out.set(condition, 0); continue; }
    out.set(condition, Math.max(0, Number(out.get(condition) ?? 0) - amount));
  }
  return out;
}

/**
 * What the cast card says a suppression is doing.
 *
 * NAMES THE CONDITION AND THE NUMBER, because "Confident Veil takes
 * effect" tells a player nothing they can act on, and this project's
 * anti-silence rule applies hardest to the card that reports a spell
 * whose whole visible result is a number going down somewhere else.
 */
export function suppressionCastLine(spec) {
  if (!spec) return "";
  // A COMPLETE IGNORE SAYS SO. Without this the card read "ignores
  // Infinity points of doomed", which is both absurd and, worse, a
  // number a player might try to reason about.
  if (spec.all) return `ignores <strong>${spec.condition}</strong> entirely`;
  const points = spec.amount === 1 ? "1 point" : `${spec.amount} points`;
  return `ignores <strong>${points}</strong> of <strong>${spec.condition}</strong>`;
}


/**
 * A suppression the caster chooses between at cast time.
 *
 * NEW at 3.587.0. Pure.
 *
 * Delay Pain (page 262): "The target may ignore up to 10 points of the
 * dazed or weakened conditions or 5 point of the injured condition."
 * Three options, and THEY DO NOT SHARE AN AMOUNT — ten of two of them,
 * five of the third — so a single row with a list of conditions would
 * have to pick one number and be wrong about the other.
 *
 * Decursive Veil prints the smaller version of the same shape: "you
 * reduce the frightened or sickened condition by 1".
 *
 * APPLYING ALL THE OPTIONS WAS THE TEMPTING WRONG ANSWER. It reads as
 * generous and is: a creature carrying dazed, weakened AND injured would
 * ignore twenty-five points from a spell that grants ten or five. The
 * page says "or".
 *
 * @param {object} raw the authored row
 * @returns {{options: Array<{condition: string, amount: number}>,
 *   label: string}|null}
 */
export function normaliseSuppressionChoice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const list = Array.isArray(raw.choices) ? raw.choices : null;
  if (!list || !list.length) return null;
  const options = [];
  for (const entry of list) {
    const condition = text(entry?.condition).toLowerCase();
    const amount = Math.trunc(Number(entry?.amount));
    if (!condition || !Number.isFinite(amount) || amount <= 0) continue;
    if (options.some((o) => o.condition === condition)) continue;
    options.push({ condition, amount });
  }
  if (!options.length) return null;
  return { options, label: text(raw.label) || "Suppression" };
}

/**
 * The suppression row for the option the caster picked.
 *
 * An unrecognised pick returns null rather than falling back to the
 * first option: a dialog that was cancelled and a dialog that answered
 * "dazed" must not produce the same spell.
 */
export function suppressionChoiceFor(choice, picked) {
  if (!choice) return null;
  const wanted = text(picked).toLowerCase();
  const option = choice.options.find((o) => o.condition === wanted);
  if (!option) return null;
  return { condition: option.condition, amount: option.amount, label: choice.label };
}
