/**
 * A CRITICAL INJURY READ AT A LOWER SEVERITY (3.685.0, H7). Pure; no Foundry.
 *
 * Eldritch Arts' Arcane Bastion: "If the effect of a critical injury grants
 * you the dying condition or incapacitates you, the shield also shatters but
 * lowers the severity of the critical by one step (negating a minor)", and
 * "+2 PP: the critical is lowered by a further step (max 3)". Graham's Q151:
 * after the roll, "the same d100 is read one severity lower (Minor → no
 * injury)".
 *
 * IN THIS SYSTEM A SEVERITY IS HOW THE TWO D10s ARE READ (rollPercentile):
 * Deadly takes the higher die as tens (advantage), Serious reads them as
 * rolled, Minor takes the lower as tens (disadvantage). So "the same d100,
 * one severity lower" is the same two dice read one step down that ladder,
 * and a step below Minor is no injury at all.
 */

import { percentileValue } from "../dice/open-ended.mjs";

const READINGS = Object.freeze(["advantage", "normal", "disadvantage"]);
const SEVERITIES = Object.freeze(["deadly", "serious", "minor"]);

/**
 * @param {{drawn?: number[], tens: number, unit: number}} percentile as rolled
 * @param {string} bias the reading it was rolled at
 * @param {number} steps negative: how many steps lower
 * @param {string} [severity] the critical's severity, lowered beside it
 * @returns {{none: true, steps: number}|{none: false, steps: number, bias: string, severity: string, tens: number, unit: number, value: number, drawn: number[]}}
 */
export function loweredCriticalReading(percentile, bias, steps, severity = "") {
  const n = Math.max(0, Math.abs(Math.trunc(Number(steps) || 0)));
  const from = READINGS.indexOf(String(bias ?? "normal"));
  const sevFrom = SEVERITIES.indexOf(String(severity ?? "").toLowerCase());
  if (!n) return { none: false, steps: 0, bias: String(bias ?? "normal"), severity: String(severity ?? ""), tens: percentile?.tens, unit: percentile?.unit, value: percentile?.value, drawn: percentile?.drawn ?? [percentile?.tens, percentile?.unit] };
  // "BELOW MINOR THERE IS NO INJURY" IS A QUESTION OF SEVERITY (3.685.0,
  // review). The reading the dice were rolled at may already have been moved
  // by something else (Eternity Resilience's disadvantage on a Serious, a
  // Deadly's advantage cancelled to normal), so it cannot say how far below
  // Minor a critical is. Only a critical whose severity is unknown falls
  // back on the reading.
  if (sevFrom >= 0 ? sevFrom + n >= SEVERITIES.length : (from < 0 ? 1 : from) + n >= READINGS.length) return { none: true, steps: n };
  // AND THE READING STOPS AT DISADVANTAGE: there is no reading lower than
  // the lower die as tens.
  const at = Math.min(READINGS.length - 1, (from < 0 ? 1 : from) + n);
  const drawn = Array.isArray(percentile?.drawn) && percentile.drawn.length === 2
    ? percentile.drawn.map(Number)
    : [Number(percentile?.tens), Number(percentile?.unit)];
  const [first, second] = drawn;
  let tens = first;
  let unit = second;
  if (READINGS[at] === "advantage") { tens = Math.max(first, second); unit = Math.min(first, second); }
  else if (READINGS[at] === "disadvantage") { tens = Math.min(first, second); unit = Math.max(first, second); }
  return {
    none: false, steps: n, bias: READINGS[at],
    severity: sevFrom >= 0 ? SEVERITIES[sevFrom + n] : String(severity ?? ""),
    tens, unit, value: percentileValue(tens, unit), drawn
  };
}

/** The first `after` answer that lowers, as a whole number of steps (≤ 0). */
export function severityStepsFrom(answers = []) {
  for (const a of Array.isArray(answers) ? answers : []) {
    const n = Math.trunc(Number(a?.severitySteps) || 0);
    if (n < 0) return n;
  }
  return 0;
}
