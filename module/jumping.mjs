/**
 * High Jump and Long Jump — the two printed DC formulas nobody computed.
 *
 * NEW at 3.557.0. Pure; no Foundry. The dialog lives in
 * general-skill-options-workflow.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * Auditing pages 71–80 on 16 September 2026, the two jumps were the only
 * printed DC FORMULAS in the chapter the system left to arithmetic at the
 * table. Page 77 states both outright:
 *
 *   High Jump — "The DC of the check is equal to 4 per foot jumped."
 *   Long Jump — "The DC of the check is equal to the amount of feet that
 *                you are attempting to jump."
 *   Both      — "If you didn't Stride at least 10 feet, the DC of the
 *                jump is doubled."
 *
 * Both actions declared `against: "none"`, so no DC reached the roll at
 * all: the GM typed a number and somebody multiplied by four in their
 * head. Compare Squeeze and Evaluate, whose DCs genuinely ARE the GM's to
 * invent — these two are not, the book computes them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND A SECOND THING FELL OUT OF IT.
 *
 * `resolveAction` guards every DC adjustment with `finalDC !== null`. So
 * with no DC, the printed trade-off these two actions DO implement — "By
 * increasing the difficulty of the jump check by 2 you may High Jump for
 * 1 AP" — cut the AP to 1 and then had nowhere to put the +2. The card
 * said so honestly ("add this to the DC you set"), but the half the
 * player was PAYING with was the half that never landed. Giving the jump
 * a DC is what makes that trade-off cost something for the first time.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING R1, 16 September 2026: option A — one dialog, two
 * questions, DC computed, working shown on the card.
 *
 * Both facts are the player's to declare and neither is visible to the
 * system: how far they are trying to jump, and whether they managed the
 * run-up. So the system asks, and then does the arithmetic and shows it.
 *
 * NOTHING IS ASSUMED. A distance of zero — the field's own default —
 * computes no DC and leaves the GM's own call exactly where 3.556.1 left
 * it. That is the same doctrine the trade-off prompt states for its own
 * fields: a pre-filled value would be the system asserting a thing only
 * the player knows.
 */

/** A 10-foot Stride is the run-up the printed action includes. */
const RUN_UP_FEET = 10;

/** "the DC of the jump is doubled" — without that run-up. */
const NO_RUN_UP_MULTIPLIER = 2;

/**
 * The two jumps, and the only thing that differs between them.
 *
 * Long Jump's "equal to the amount of feet" is a multiplier of one, so
 * both are one formula with one number changed rather than two branches
 * that could drift apart.
 *
 * NOT EXPORTED, and neither is `jumpRule` below. Both were, for one run,
 * and `verify-rules-have-callers` refused them: nothing outside this file
 * needs the table or the lookup — callers want a DC, a caption, a working
 * or a prompt — and an exported rule nobody calls is a well-tested
 * opinion (lesson 5.1).
 */
const JUMP_RULES = Object.freeze({
  highJump: Object.freeze({
    key: "highJump",
    name: "High Jump",
    axis: "vertical",
    dcPerFoot: 4,
    formula: "4 per foot jumped"
  }),
  longJump: Object.freeze({
    key: "longJump",
    name: "Long Jump",
    axis: "horizontal",
    dcPerFoot: 1,
    formula: "1 per foot jumped"
  })
});

/**
 * The rule for an action key, or null for the other ninety-six actions.
 * @param {string} actionKey
 * @returns {object|null}
 */
function jumpRule(actionKey) {
  return JUMP_RULES[String(actionKey ?? "")] ?? null;
}

/** Whether this action computes its DC from a distance. */
export function isJumpAction(actionKey) {
  return jumpRule(actionKey) !== null;
}

/**
 * The DC of a jump, or null when the player declared no distance.
 *
 * NULL IS THE DEFAULT AND NOT A FAILURE. Zero feet, a blank field, or
 * junk all mean "I am not telling you", and the correct response to that
 * is the behaviour this action had before: no DC, the GM's own call.
 *
 * @param {object} options
 * @param {string} options.actionKey
 * @param {*} options.feet How far the player is attempting to jump.
 * @param {boolean} [options.strode] Whether a 10-foot Stride was made.
 * @returns {{actionKey:string, name:string, feet:number, strode:boolean,
 *            base:number, dc:number, doubled:boolean}|null}
 */
export function jumpDC({ actionKey, feet, strode = true } = {}) {
  const rule = jumpRule(actionKey);
  if (!rule) return null;
  const distance = Math.floor(Number(feet) || 0);
  if (!(distance > 0)) return null;
  const base = distance * rule.dcPerFoot;
  const doubled = !strode;
  return {
    actionKey: rule.key,
    name: rule.name,
    feet: distance,
    strode: !doubled,
    base,
    dc: doubled ? base * NO_RUN_UP_MULTIPLIER : base,
    doubled
  };
}

/**
 * The caption the check dialog and the card show beside this DC.
 *
 * Says what the number IS, in the book's own terms, so a GM who then
 * raises or lowers it ("The DC may also be increased or decreased due to
 * the situation") can see what they are adjusting away from.
 *
 * @param {object|null} jump A jumpDC result.
 * @returns {string|null}
 */
export function jumpDCLabel(jump) {
  if (!jump) return null;
  return `${jump.feet} feet of ${jump.name}`;
}

/**
 * The arithmetic, written out.
 *
 * SHOWN RATHER THAN TRUSTED. A DC of 96 on a card is the sort of number
 * a table stops and argues about, and "12 × 4 = 48, doubled to 96
 * without the run-up" is the whole argument.
 *
 * @param {object|null} jump A jumpDC result.
 * @returns {string}
 */
export function jumpWorking(jump) {
  if (!jump) return "";
  const rule = jumpRule(jump.actionKey);
  const perFoot = rule?.dcPerFoot ?? 1;
  const base = perFoot === 1
    ? `${jump.feet} feet = DC ${jump.base}`
    : `${jump.feet} feet &times; ${perFoot} = DC ${jump.base}`;
  if (!jump.doubled) return `${base} (${RUN_UP_FEET}-foot Stride made).`;
  return `${base}, doubled to <strong>DC ${jump.dc}</strong> `
    + `without a ${RUN_UP_FEET}-foot Stride.`;
}

/**
 * The card line, or "" when the player left the distance to the GM.
 * @param {object|null} jump A jumpDC result.
 * @returns {string}
 */
export function jumpNote(jump) {
  if (!jump) return "";
  return `<strong>Jump distance:</strong> ${jumpWorking(jump)}`;
}

/**
 * What the dialog says above its two fields.
 *
 * Lives here, with the rule, rather than in the dialog — the wording IS
 * the formula, and a prompt that said "4 per foot" over a table that said
 * 5 would be the defect this file exists to close, reintroduced in the
 * one place a reader trusts most.
 *
 * @param {string} actionKey
 * @returns {{title:string, hint:string, strideLabel:string,
 *            distanceLabel:string, button:string}|null}
 */
export function jumpPrompt(actionKey) {
  const rule = jumpRule(actionKey);
  if (!rule) return null;
  return {
    title: `${rule.name} — distance`,
    hint: `The DC is ${rule.formula}. Leave the distance at zero to set the DC yourself.`,
    distanceLabel: `Feet of ${rule.axis} distance attempted`,
    strideLabel: `I did not Stride at least ${RUN_UP_FEET} feet first `
      + "(the DC of the jump is doubled)",
    button: rule.name
  };
}

/* ------------------------------------------------------------------ *
 * NATURAL LEAPER (3.627.0)                                             *
 * ------------------------------------------------------------------ */

/*
 * "You gain Natural Leaper. When you take the High Jump action, you may
 * jump a distance up to half your land Speed without making a check. When
 * you take the Long Jump action, you may leap up to your land Speed without
 * taking an action. You ignore the penalty for lacking a running start on
 * these checks." — Pillars of Faith's Corpse Leaper (Unliving Ghoul), which
 * prints the rule the core's Natural Leaper creature ability names and
 * never states. Until now that ability was text: nothing read it.
 */
const SYSTEM_ID = "trg-prime";

/** Does this creature leap naturally? A declared flag, or an owned item named "Natural Leaper". */
export function isNaturalLeaper(items = [], effects = []) {
  if (Array.from(effects ?? []).some((e) => !e?.disabled && e?.flags?.[SYSTEM_ID]?.naturalLeaper === true)) return true;
  return Array.from(items ?? []).some((i) => String(i?.name ?? "").trim().toLowerCase() === "natural leaper");
}

/**
 * A jump as a Natural Leaper makes it: never doubled for the missing
 * run-up, and — within the reach the rule prints — no check at all.
 *
 * @param {object|null} jump a jumpDC result
 * @param {{landSpeed: number}} opts
 * @returns {object|null} the jump, with `automatic` and `freeAction` where they hold
 */
export function naturalLeaperJump(jump, { landSpeed = 0 } = {}) {
  if (!jump) return jump;
  const speed = Math.max(0, Math.floor(Number(landSpeed) || 0));
  const reach = jump.actionKey === "highJump" ? Math.floor(speed / 2) : speed;
  const automatic = jump.feet <= reach;
  return {
    ...jump,
    strode: true,
    doubled: false,
    dc: jump.base,
    naturalLeaper: true,
    reach,
    automatic,
    // A Long Jump within the leaper's Speed takes no action at all; a High
    // Jump within reach is still the action, made without its check.
    freeAction: automatic && jump.actionKey === "longJump"
  };
}

/** The card line for a leap the rule settles without a check. */
export function naturalLeaperLine(jump) {
  if (!jump?.automatic) return "";
  return `<strong>Natural Leaper:</strong> ${jump.feet} feet of ${jump.name} — within ${jump.reach} feet, `
    + `${jump.freeAction ? "no check and no action" : "no check"}.`;
}

/**
 * The AP a leap the rule settles without a check still costs (3.627.1).
 *
 * The jumps print "2 (or 1 with a +2 difficulty increase)". The trade is a
 * harder CHECK for one less AP, and a Natural Leaper's automatic High Jump
 * makes no check to make harder — so it pays the printed 2. The whole string
 * parsed as a number is 0, which is what 3.627.0 spent (found live, 7 Oct
 * 2026). A plain number, "Free" or "Reaction" passes through unchanged.
 */
export function leapApCost(apCost) {
  const lead = String(apCost ?? "").match(/^\s*(\d+)\b/);
  return lead ? lead[1] : apCost;
}
