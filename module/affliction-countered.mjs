/**
 * WHICH CURES REACH AN AFFLICTION (3.633.0; Fiends & Fables 3.0 block 3, R8).
 *
 * A counteract names kinds ("disease", "poison"); an affliction answers by
 * its own `afflictionType`. The Aboleth's Slime is a CURSE that the page
 * says "a remove disease can counter", so it also declares the kinds that
 * reach it:
 *
 *   flags.trg-prime.counteredAs = ["disease"]
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();

/** Does a counteract of these kinds reach this affliction item? */
function afflictionCounteredBy(item, kinds = []) {
  const want = (kinds ?? []).map(lower).filter(Boolean);
  if (want.includes(lower(item?.system?.afflictionType))) return true;
  const extra = item?.flags?.[SYSTEM_ID]?.counteredAs;
  return (Array.isArray(extra) ? extra : []).map(lower).some((k) => want.includes(k));
}

/*
 * AN AFFLICTION CURED IN ORDER (3.695.0; Graham, 16 Nov 2026, from Fiends &
 * Fables' "Removing Mummy Rot"). "The first step in the process of curing
 * mummy rot is the casting of a Remove Curse spell … Following the successful
 * casting of Remove Curse, the next crucial phase unfolds. A Remove Disease
 * spell must be invoked … a caster will not know if their attempts to
 * counteract Mummy Rot have been successful until both castings have
 * completed. Thus, if the Remove Curse counteract fails, the caster must
 * still cast the Remove Disease (some GMs may require this to be a secret
 * check)."
 *
 * Declared on the affliction:
 *
 *   flags.trg-prime.cureSequence = ["curse", "disease"]
 *
 * (Pillars of Faith's copy also carries it under its own namespace; Fiends &
 * Fables' copy, which declares nothing, is recognised by its name.) Each
 * step's result is kept on the affliction, `flags.trg-prime.cureSteps =
 * { curse: true|false }`, and the affliction ends only when the last step
 * succeeds after every earlier one did. The last step, success or not,
 * closes the attempt: a failed cure begins again from the first step.
 */
const CURE_STEPS_FLAG = "cureSteps";

/** The kinds this affliction must be countered by, in order, or null. Pure. */
function cureSequenceOf(item) {
  if (item?.type !== "affliction") return null;
  for (const raw of [item?.flags?.[SYSTEM_ID]?.cureSequence, item?.flags?.["trg-pillars-of-faith"]?.cureSequence]) {
    const list = (Array.isArray(raw) ? raw : []).map(lower).filter(Boolean);
    if (list.length > 1) return list;
  }
  return /\bmummy rot\b/i.test(String(item?.name ?? "")) ? ["curse", "disease"] : null;
}

/** Does a counteract of these kinds reach this affliction at all — by its type, or as a step of its cure? */
export function afflictionReachedBy(item, kinds = []) {
  if (afflictionCounteredBy(item, kinds)) return true;
  const want = (kinds ?? []).map(lower);
  return (cureSequenceOf(item) ?? []).some((k) => want.includes(k));
}

/**
 * What one counteract does to an affliction cured in order. Pure.
 *
 * @param {object} item the affliction
 * @param {string[]} kinds the counteract's kinds
 * @param {boolean} succeeded whether the counteract check succeeded
 * @returns {null | {step: string, last: boolean, ends: boolean, steps: object}}
 *   null when the affliction has no cure sequence (the ordinary rule applies);
 *   `steps` the record to store (empty after the last step).
 */
export function cureStepOutcome(item, kinds = [], succeeded = false) {
  const sequence = cureSequenceOf(item);
  if (!sequence) return null;
  const want = (kinds ?? []).map(lower);
  const step = sequence.find((k) => want.includes(k));
  if (!step) return null;
  const recorded = item?.flags?.[SYSTEM_ID]?.[CURE_STEPS_FLAG];
  const steps = { ...(recorded && typeof recorded === "object" && !Array.isArray(recorded) ? recorded : {}) };
  const at = sequence.indexOf(step);
  const last = at === sequence.length - 1;
  if (!last) {
    steps[step] = Boolean(succeeded);
    return { step, last, ends: false, steps };
  }
  const earlier = sequence.slice(0, at).every((k) => steps[k] === true);
  return { step, last, ends: Boolean(succeeded) && earlier, steps: {} };
}

/** Is this affliction cured in order? (3.696.0: its counteract is rolled blind.) Pure. */
export function cureIsOrdered(item) {
  return Boolean(cureSequenceOf(item));
}

export { CURE_STEPS_FLAG };
