/**
 * Earn Income (Core, Chapter 4 — General Skill Actions, Trained). Pure logic;
 * the Foundry workflow (the multi-day task on the actor, the manager) lives
 * in earn-income-workflow.mjs.
 *
 * Income (gp) = task level × skill ranks, adjusted by the check degree. After
 * the first day's roll you earn the same amount each subsequent day with no
 * further check, until the task ends (GM-set duration).
 */

/**
 * The income a single day of work earns, and whether the worker was fired.
 *
 * The book gives Critical/Success/Partial/Failure/Fumble; the two missing
 * degrees interpolate the usual way — Heroic is at least a Critical, a
 * Blunder at least as bad as a Fumble.
 *
 * @param {string} degreeKey
 * @param {number} taskLevel The GM-assigned task level.
 * @param {number} ranks The character's ranks in the chosen skill.
 * @returns {{perDay: number, fired: boolean, label: string}}
 */
export function earnIncomeForDegree(degreeKey, taskLevel, ranks) {
  const level = Math.max(0, Math.trunc(Number(taskLevel) || 0));
  const rank = Math.max(0, Math.trunc(Number(ranks) || 0));
  const base = level * rank;

  switch (degreeKey) {
    case "heroic":
    case "critical":
      // Ranks count as 2 higher.
      return { perDay: level * (rank + 2), fired: false, label: "Critical — outstanding work" };
    case "success":
      return { perDay: base, fired: false, label: "Success — competent work" };
    case "partial":
      return { perDay: Math.floor(base * 0.5), fired: false, label: "Partial — average work (50%)" };
    case "failure":
      return { perDay: Math.floor(base / 10), fired: false, label: "Failure — the bare minimum (÷10)" };
    case "fumble":
    case "blunder":
      return { perDay: 0, fired: true, label: "Fumble — fired, and earn nothing" };
    default:
      return { perDay: base, fired: false, label: "Success — competent work" };
  }
}
