/**
 * The choices a General Skill Action asks for before it is rolled
 * (Core 3.1, Chapter 4 — General Skill Actions).
 *
 * Three of these actions print a ladder or a pair of penalties in their
 * own text and then leave the player to remember them. Study Target's
 * equivalent ladder has been a real prompt since 3.320.0, so this is the
 * same shape applied to the three that were still text:
 *
 *   Identify Power  a time ladder that MODIFIES THE CHECK
 *   Transfer Runes  a time ladder that INCREASES THE DC
 *   Subsist         two circumstance penalties the player elects to take
 *
 * THE FIRST TWO LADDERS ARE NOT THE SAME KIND OF THING, and reading them
 * as one would get both wrong. Identify Power says "apply the following
 * modifiers", which is a number on your side of the check. Transfer
 * Runes says "by increasing the difficulty of the check by 2", which is
 * a number on the DC's side — the same wording First Aid uses, and
 * already implemented that way in the action workflow. So one produces a
 * modifier row and the other produces a DC increase, and the two never
 * share a code path.
 *
 * Pure and Foundry-free; the dialogs live in
 * general-skill-options-workflow.mjs.
 */

/* ------------------------------------------------------------------ *
 * IDENTIFY POWER                                                      *
 * ------------------------------------------------------------------ */

/**
 * "You choose the amount of time you wish to spend identifying the magic
 * and apply the following modifiers: 10 minutes (+0), 1 minute (-2),
 * 1 round (-5), 1 AP (-10)."
 *
 * Printed shortest-first; listed longest-first here because the
 * unmodified option is the one the dialog should open on and a radio
 * list reads down from its default.
 *
 * `apCost` is what the action actually costs, which is the same string
 * for three of them and a real spendable number for the fourth: only the
 * "1 AP" rung is AP at all, and only it should draw on the pool.
 */
export const IDENTIFY_POWER_TIME_OPTIONS = Object.freeze([
  Object.freeze({ key: "tenMinutes", label: "10 minutes", modifier: 0, apCost: "10 minutes" }),
  Object.freeze({ key: "minute", label: "1 minute", modifier: -2, apCost: "1 minute" }),
  Object.freeze({ key: "round", label: "1 round", modifier: -5, apCost: "1 round" }),
  Object.freeze({ key: "action", label: "1 AP", modifier: -10, apCost: "1" })
]);

/**
 * QUICK IDENTIFICATION (General, Chapter 5, BSB +4): "When identifying
 * magical items using Identify Power, you apply the following modifiers;
 * 10 minutes (+2), 1 minute (+0), 1 round (-2), 1 AP (-5), 0 AP (-10)."
 *
 * NEW at 3.377.0.
 *
 * WHAT THE FEAT ACTUALLY DOES, once both ladders are written out side by
 * side, is two things at once — and only one of them is obvious from the
 * sentence:
 *
 *   rung          standard    with the feat
 *   10 minutes      +0            +2
 *   1 minute        -2            +0
 *   1 round         -5            -2
 *   1 AP           -10            -5
 *   0 AP            —            -10      <- a rung that does not otherwise exist
 *
 * Every existing rung improves, but NOT by a constant: +2, +2, +3, +5.
 * "The feat gives +2 to Identify Power" would be right at the top of the
 * ladder and increasingly wrong down it, which is why this is DECLARED as
 * its own ladder rather than computed as an offset from the standard one.
 *
 * The fifth rung is the real prize: identifying an item for no action at
 * all, which the base ladder cannot express at any price.
 *
 * IT DELIBERATELY DISAGREES WITH SENSE MENTAL EFFECT, whose own fifth
 * rung is labelled "Free" with the note that a "0 AP" on the card "would
 * read as a bug rather than a rule". That reasoning is sound for that
 * ladder, because the chapter prints the word Free there. This feat
 * prints "0 AP", so that is what it says. Following the other ladder's
 * label here would be tidying the book rather than implementing it.
 *
 * OPEN QUESTION FOR GRAHAM, flagged rather than decided: whether a 0 AP
 * Identify Power is the same thing as a Free action for anything that
 * distinguishes them. It costs nothing from the pool either way — "0"
 * passes the numeric spend path and subtracts zero — so nothing is
 * currently riding on the answer, but the two are not obviously synonyms.
 */
const QUICK_IDENTIFICATION_TIME_OPTIONS = Object.freeze([
  Object.freeze({ key: "tenMinutes", label: "10 minutes", modifier: 2, apCost: "10 minutes" }),
  Object.freeze({ key: "minute", label: "1 minute", modifier: 0, apCost: "1 minute" }),
  Object.freeze({ key: "round", label: "1 round", modifier: -2, apCost: "1 round" }),
  Object.freeze({ key: "action", label: "1 AP", modifier: -5, apCost: "1" }),
  Object.freeze({ key: "free", label: "0 AP", modifier: -10, apCost: "0" })
]);

/**
 * Which Identify Power ladder this actor rolls on.
 *
 * RETURNS A WHOLE LADDER DESCRIPTOR, not a bare list of rungs — and the
 * first version of this function returned the list, which broke Identify
 * Power completely at 3.377.0. `promptTimeLadder` reads `ladder.options`,
 * `ladder.defaultKey`, `ladder.title` and `ladder.hint`; handed an array
 * it threw on `undefined.map`, the whole action unwound, and NOTHING was
 * posted — no dialog, no card, no notification. A feat meant to improve
 * the action removed it.
 *
 * So the swap is `{...base, options}`: everything about how the ladder is
 * presented stays with the action, and only the rungs come from the feat.
 * Taking the base ladder as an argument rather than reaching for
 * TIME_LADDERS here is what keeps that true if the descriptor ever grows
 * another field.
 *
 * @param {object} baseLadder The action's own ladder from TIME_LADDERS.
 * @param {string[]} featNames The actor's feat names.
 * @returns {object|null} A ladder descriptor of the same shape.
 */
export function identifyPowerLadderFor(baseLadder, featNames = []) {
  if (!baseLadder) return baseLadder ?? null;
  const owns = (Array.isArray(featNames) ? featNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === "quick identification");
  if (!owns) return baseLadder;
  return { ...baseLadder, options: QUICK_IDENTIFICATION_TIME_OPTIONS };
}

/** The rung the dialog opens on — the one that costs nothing. */
export const IDENTIFY_POWER_DEFAULT = "tenMinutes";

/**
 * @param {string} key
 * @returns {object|null}
 */
export function identifyPowerTime(key) {
  return IDENTIFY_POWER_TIME_OPTIONS.find((option) => option.key === key) ?? null;
}

/* ------------------------------------------------------------------ *
 * THE TIME LADDERS                                                    *
 * ------------------------------------------------------------------ */

/**
 * Every action that prints "you choose the amount of time you wish to
 * spend... and apply the following modifiers".
 *
 * THERE ARE THREE DIFFERENT LADDERS HERE AND THAT IS THE WHOLE REASON
 * THIS IS A TABLE. A quick reading of the chapter produces one shared
 * ladder dropped onto five actions, and it is wrong on three of them:
 *
 *   Identify Power / Evaluate     +0  -2  -5  -10
 *   Disable a Device / Pick Lock  +2  +0  -5  -10
 *   Sense Mental Effect           +2   0  -2   -5  and a FREE rung at -10
 *
 * Sense Mental Effect has five rungs, not four, and its whole scale is
 * shifted — the option that costs a character nothing at all is the one
 * that costs them the most accuracy.
 *
 * Not in here, deliberately:
 *   Study Target   its rungs run the other way and reach 1 hour (+5), and
 *                  it has had its own prompt since 3.320.0.
 *   Transfer Runes it says "by increasing the difficulty of the check",
 *                  which is a number on the DC's side, not the roll's.
 *
 * `apCost` is what the rung actually costs. Only the "1 AP" rung is AP at
 * all; the others are wall-clock time, and Sense Mental Effect's fifth is
 * a Free action. Non-numeric costs draw nothing from the pool, which is
 * what makes "10 minutes" and "Free" safe to pass straight through.
 *
 * `rowLabel` is the label the check card shows. Identify Power's reads
 * "Identification time" because that is what it read before this table
 * existed and a graded, harnessed string should not drift for tidiness.
 */

const FOUR_RUNG_LABELS = ["10 minutes", "1 minute", "1 round", "1 AP"];
const FOUR_RUNG_KEYS = ["tenMinutes", "minute", "round", "action"];
const FOUR_RUNG_COSTS = ["10 minutes", "1 minute", "1 round", "1"];

/** Build a four-rung ladder from its four printed modifiers. */
function fourRungLadder(modifiers) {
  return Object.freeze(
    modifiers.map((modifier, index) =>
      Object.freeze({
        key: FOUR_RUNG_KEYS[index],
        label: FOUR_RUNG_LABELS[index],
        modifier,
        apCost: FOUR_RUNG_COSTS[index]
      })
    )
  );
}

/** "10 minutes (+2), 1 minute (+0), 1 round (-5), 1 AP (-10)." */
export const THIEVERY_TIME_OPTIONS = fourRungLadder([2, 0, -5, -10]);

/**
 * "10 minutes (+2), 1 minute (0), 1 round (-2), 1 AP (-5), Free (-10)."
 *
 * The fifth rung is a Free action, so its cost is the word rather than a
 * number — a "0 AP" on the card would read as a bug rather than a rule.
 */
export const SENSE_MENTAL_EFFECT_TIME_OPTIONS = Object.freeze([
  Object.freeze({ key: "tenMinutes", label: "10 minutes", modifier: 2, apCost: "10 minutes" }),
  Object.freeze({ key: "minute", label: "1 minute", modifier: 0, apCost: "1 minute" }),
  Object.freeze({ key: "round", label: "1 round", modifier: -2, apCost: "1 round" }),
  Object.freeze({ key: "action", label: "1 AP", modifier: -5, apCost: "1" }),
  Object.freeze({ key: "free", label: "Free", modifier: -10, apCost: "Free" })
]);

/**
 * The ladder each action carries, keyed by the action's own key.
 *
 * `defaultKey` is the rung the dialog opens on: the one that changes the
 * check least, not the one printed first and not the best one. For the
 * two Thievery actions that is "1 minute" at +0 rather than "10 minutes"
 * at +2 — opening on a bonus would hand every lockpick a free +2 to
 * anyone who pressed the default button without reading.
 */
export const TIME_LADDERS = Object.freeze({
  identifyPower: Object.freeze({
    actionKey: "identifyPower",
    options: IDENTIFY_POWER_TIME_OPTIONS,
    defaultKey: "tenMinutes",
    rowLabel: "Identification time",
    title: "Identify Power — time spent",
    icon: "fa-solid fa-wand-sparkles",
    button: "Identify",
    hint: "How long do you spend identifying the magic? Rushing costs accuracy. An interrupted attempt must start over."
  }),
  evaluate: Object.freeze({
    actionKey: "evaluate",
    options: IDENTIFY_POWER_TIME_OPTIONS,
    defaultKey: "tenMinutes",
    rowLabel: "Evaluation time",
    title: "Evaluate — time spent",
    icon: "fa-solid fa-gem",
    button: "Evaluate",
    hint: "How long do you spend appraising the item? Rushing costs accuracy. An interrupted attempt must start over."
  }),
  disableADevice: Object.freeze({
    actionKey: "disableADevice",
    options: THIEVERY_TIME_OPTIONS,
    defaultKey: "minute",
    rowLabel: "Time spent",
    title: "Disable Device — time spent",
    icon: "fa-solid fa-screwdriver-wrench",
    button: "Disable",
    hint: "How long do you spend working on the device? Taking longer helps; rushing does not."
  }),
  // DISABLE A PERIL (3.620.0, Chapter 12): Disable Device's own ladder —
  // "counteracting … functions similarly to making a skill check to
  // disable a peril", and so does any disabling skill.
  disablePeril: Object.freeze({
    actionKey: "disablePeril",
    options: THIEVERY_TIME_OPTIONS,
    defaultKey: "minute",
    rowLabel: "Time spent",
    title: "Disable a Peril — time spent",
    icon: "fa-solid fa-person-falling-burst",
    button: "Disable",
    hint: "How long do you spend on the peril? Taking longer helps; rushing does not."
  }),
  pickLock: Object.freeze({
    actionKey: "pickLock",
    options: THIEVERY_TIME_OPTIONS,
    defaultKey: "minute",
    rowLabel: "Time spent",
    title: "Pick Lock — time spent",
    icon: "fa-solid fa-lock-open",
    button: "Pick",
    hint: "How long do you spend working the lock? Taking longer helps; rushing does not."
  }),
  senseMentalEffect: Object.freeze({
    actionKey: "senseMentalEffect",
    options: SENSE_MENTAL_EFFECT_TIME_OPTIONS,
    defaultKey: "minute",
    rowLabel: "Interaction time",
    title: "Sense Mental Effect — time spent",
    icon: "fa-solid fa-brain",
    button: "Sense",
    hint: "How long do you spend interacting with the creature? A free glance tells you least."
  })
});

/**
 * The ladder for an action, or null if it has none.
 * @param {string} actionKey
 * @returns {object|null}
 */
export function timeLadder(actionKey, action = null) {
  return TIME_LADDERS[actionKey] ?? declaredTimeLadder(action);
}

/**
 * A LADDER AN ACTION DECLARES FOR ITSELF (3.666.0). The table above is keyed
 * by core actions, so a module action could not offer "10 minutes, or 1
 * minute at -2, 1 round at -5, 1 AP at -10" (Inner Tempest's Centred Balance)
 * or "1 minute -2, 10 minutes, 1 hour +2" (Elemental Ward). An action may now
 * carry `timeLadder: {options: [{key, label, modifier, apCost}], defaultKey,
 * rowLabel, title, hint, button, icon}`; the same dialog and the same row
 * read it. A core ladder of the same key still wins.
 *
 * Normalised, or null when the declaration is unusable: every rung needs a
 * key, a label, a whole-number modifier and a cost, and the default must be
 * one of them.
 *
 * @param {object|null} action
 * @returns {object|null}
 */
export function declaredTimeLadder(action) {
  const raw = action?.timeLadder;
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.options) || !raw.options.length) return null;
  const options = [];
  for (const o of raw.options) {
    const key = String(o?.key ?? "").trim();
    const label = String(o?.label ?? "").trim();
    const modifier = Number(o?.modifier ?? 0);
    const apCost = String(o?.apCost ?? "").trim();
    if (!key || !label || !Number.isInteger(modifier) || !apCost) return null;
    options.push(Object.freeze({ key, label, modifier, apCost }));
  }
  const defaultKey = String(raw.defaultKey ?? options[0].key);
  if (!options.some((o) => o.key === defaultKey)) return null;
  const name = String(action?.name ?? "This action");
  return Object.freeze({
    actionKey: String(action?.key ?? ""),
    options: Object.freeze(options),
    defaultKey,
    rowLabel: String(raw.rowLabel ?? "Time spent"),
    title: String(raw.title ?? `${name} — time spent`),
    icon: String(raw.icon ?? "fa-solid fa-hourglass-half"),
    button: String(raw.button ?? name),
    hint: String(raw.hint ?? "How long do you spend? The modifier applies to the check.")
  });
}

/**
 * A rung by key, falling back to the ladder's default rather than null —
 * a dialog that somehow returns an unknown value should still roll at the
 * modifier the player was shown, not silently at none.
 *
 * @param {object|null} ladder
 * @param {string} key
 * @returns {object|null}
 */
export function ladderOption(ladder, key) {
  if (!ladder) return null;
  return (
    ladder.options.find((option) => option.key === key) ??
    ladder.options.find((option) => option.key === ladder.defaultKey) ??
    null
  );
}

/**
 * The modifier row a chosen rung earns, or null when the rung is 0.
 *
 * TYPED `circumstance` because that is what spending less time on a task
 * then falls under Appendix 1's rule that the worst circumstance penalty
 * applies rather than the sum.
 *
 * @param {object|null} ladder
 * @param {object|null} option
 * @returns {{label:string, value:number, type:string}|null}
 */
export function ladderModifier(ladder, option) {
  if (!ladder || !option || !option.modifier) return null;
  return {
    label: `${ladder.rowLabel} (${option.label})`,
    value: option.modifier,
    type: "circumstance"
  };
}

/* ------------------------------------------------------------------ *
 * SUBSIST                                                             *
 * ------------------------------------------------------------------ */

/**
 * "It is assumed that you spend at least 8 hours carrying out this
 * action... You can Subsist for less than 8 hours, but if you do, you
 * take a –5 circumstance penalty to the check."
 */
export const SUBSIST_HURRIED_PENALTY = -5;

/**
 * "By taking a -2-circumstance penalty to the check, you may provide
 * food and shelter for an additional target."
 */
export const SUBSIST_EXTRA_PERSON_PENALTY = -2;

/**
 * The rows a Subsist check earns from what the player elected.
 *
 * BOTH ARE EMITTED WHEN BOTH ARE ELECTED, and the resolution layer then
 * suppresses the smaller — Appendix 1: penalties of the same type do not
 * stack, and the worst one applies. That is deliberate rather than
 * overlooked. A hurried subsistence for two is -5 and not -7, the card
 * says why in as many words, and the alternative would have been to
 * silently invent a stacking exception this book does not print.
 *
 * @param {object} args
 * @param {boolean} [args.hurried] Fewer than 8 hours spent.
 * @param {boolean} [args.extraPerson] Providing for one more creature.
 * @returns {Array<{label:string, value:number, type:string}>}
 */
export function subsistModifiers({ hurried = false, extraPerson = false } = {}) {
  const rows = [];
  if (hurried) {
    rows.push({
      label: "Less than 8 hours spent",
      value: SUBSIST_HURRIED_PENALTY,
      type: "circumstance"
    });
  }
  if (extraPerson) {
    rows.push({
      label: "Providing for an additional person",
      value: SUBSIST_EXTRA_PERSON_PENALTY,
      type: "circumstance"
    });
  }
  return rows;
}
