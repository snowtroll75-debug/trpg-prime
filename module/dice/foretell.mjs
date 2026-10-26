/**
 * WOULD A 10 SUCCEED? (3.672.0; Inner Tempest's Foretell Failure, Block 8's
 * C8). Pure; no Foundry.
 *
 *   "You cast this spell immediately before you would take an action that
 *    requires a d20 roll, such as a skill check, attack roll, or saving
 *    throw. … The spell magically informs you whether the action will
 *    succeed if you roll a 10 or better on the d20 roll involved. If the
 *    action would be successful under those circumstances, you must take
 *    the action. If the action would not be successful, you can take a
 *    different action."
 *
 * A ONE-SHOT FLAG ON THE CASTER, spent by their next d20 check:
 *
 *   flags.trg-prime.foretell = true      (a declared effect — declared-effect.mjs)
 *
 * THE SAME SUM THE ROLL WILL MAKE. The answer is `buildOutcome` with the die
 * set to 10 and everything else the check already holds — its modifiers,
 * its DC, its difficulty's automatic result and any degree shift — so the
 * preview cannot disagree with the roll about anything but the die.
 *
 * A DC NOBODY HAS SET YET is the GM's to answer (Graham's B8-6): the check
 * waits for them. A known DC is answered here.
 */
import { DIFFICULTY_BY_KEY, buildOutcome } from "./resolution.mjs";
import { applyDegreeShift } from "./degree-shift.mjs";

/** The flag a Foretell Failure leaves on its caster. */
export const FORETELL_FLAG = "foretell";

/** The die face the spell asks about. */
const FORETOLD_DIE = 10;

/** The applied effects carrying a waiting foretelling. */
export function foretellEffects(effects = []) {
  return Array.from(effects ?? []).filter((e) => e && !e.disabled && e.flags?.["trg-prime"]?.[FORETELL_FLAG] === true);
}

/**
 * Does this check spend a waiting foretelling?
 *
 * A d20 check the actor makes for an action of their own or a save: not a
 * flat check (a DC 5 to keep an action is not "an action that requires a
 * d20 roll"), not percentile dice, not dice already thrown (a shared
 * strike's later creatures) or a degree already declared, and not
 * initiative or Luck.
 */
export function foretellApplies(check) {
  if (!check?.actor || check.flat) return false;
  if (String(check.die ?? "d20") === "d100") return false;
  if (check.presetDice || check.declaredDegree) return false;
  return !["initiative", "luck"].includes(String(check.type ?? ""));
}

/** The check's DC when it is known, or null. */
export function knownDC(check) {
  const dc = Number(check?.dc);
  return check?.dc !== null && check?.dc !== undefined && check?.dc !== "" && Number.isFinite(dc) && dc > 0 ? dc : null;
}

/**
 * The verdict.
 * @returns {{known: boolean, succeeds: boolean|null, total: number, dc: number|null}}
 */
export function foretellVerdict(check, { forcedFailure = false } = {}) {
  const modifiers = Array.isArray(check?.modifiers) ? check.modifiers : [];
  const dc = knownDC(check);
  const auto = DIFFICULTY_BY_KEY[check?.difficulty]?.auto ?? null;
  // STACKED AS THE ROLL STACKS THEM: two status bonuses give the higher.
  const outcome = applyDegreeShift(buildOutcome({ dieTotal: FORETOLD_DIE, modifiers, dc, auto }), check?.degreeShift);
  const total = Number(outcome?.total ?? FORETOLD_DIE);
  // A RESULT A CONDITION FORCES (an Immobilised creature's Reflex save fails
  // whatever the die): no 10 succeeds, DC or none.
  if (forcedFailure) return { known: true, succeeds: false, total, dc };
  if (!outcome?.degree) return { known: false, succeeds: null, total, dc: null };
  return { known: true, succeeds: Boolean(outcome.degree.success), total, dc };
}

/** The card's line for a verdict. */
export function foretellLine(label, verdict, { gmAnswered = false } = {}) {
  const name = String(label ?? "").trim() || "Foretell Failure";
  const sum = `a 10 on the die makes ${verdict.total}${verdict.dc ? ` against DC ${verdict.dc}` : ""}`;
  if (verdict.succeeds) return `<strong>${name}:</strong> ${sum} — it would succeed${gmAnswered ? " (the GM says)" : ""}, so the action must be taken.`;
  return `<strong>${name}:</strong> ${sum} — it would <strong>not</strong> succeed${gmAnswered ? " (the GM says)" : ""}.`;
}
