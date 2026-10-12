/**
 * Study Target (Core, Chapter 4 — General Skill Actions, Trained). Pure
 * logic; the Foundry workflow lives in study-target-workflow.mjs.
 *
 * You may hold a number of "Studied Targets" equal to your Int plus your
 * level, plus one more for every 5 combined ranks across the six
 * "knowledge" skills. Per Graham: invested **ranks**, not the total
 * proficiency bonus (the rulebook's worked example labels them
 * "proficiency bonuses", but the rule text says "ranks", and ranks is the
 * intent).
 */

/** The six "knowledge" skills whose ranks feed the capacity bonus. */
export const KNOWLEDGE_SKILLS = Object.freeze([
  "arcana",
  "culture",
  "nature",
  "occultism",
  "planes",
  "religion"
]);

/**
 * A character's Studied Target capacity, with the breakdown kept so the
 * card and manager can show where the number came from.
 *
 * @param {object} system actor.system
 * @returns {{int:number, level:number, ranks:number, bonus:number, total:number}}
 */
export function studiedTargetCapacity(system) {
  const int = Number(system?.attributes?.intelligence?.total ?? 0);
  const level = Number(system?.identity?.level ?? 0);
  const ranks = KNOWLEDGE_SKILLS.reduce(
    (sum, key) => sum + Number(system?.skills?.[key]?.ranks ?? 0),
    0
  );
  const bonus = Math.floor(ranks / 5);
  return { int, level, ranks, bonus, total: int + level + bonus };
}

/**
 * The time a character may spend, and the circumstance modifier it grants
 * the check. Base is one minute at no modifier; rushing costs accuracy,
 * lingering buys it. Values are Graham's: 1 round −2, 10 minutes +2,
 * 1 hour +5.
 */
export const STUDY_TIME_OPTIONS = Object.freeze([
  { key: "round", label: "1 round", modifier: -2 },
  { key: "minute", label: "1 minute", modifier: 0 },
  { key: "tenMinutes", label: "10 minutes", modifier: 2 },
  { key: "hour", label: "1 hour", modifier: 5 }
]);

/**
 * What a degree does to the study. The book gives Success, Failure and
 * Fumble; the rest interpolate the way the whole system does — a better
 * degree is at least a Success, a Partial is a retryable Failure, and a
 * Blunder is at least as bad as a Fumble.
 *
 * @param {string} degreeKey
 * @returns {"studied"|"retry"|"flawed"}
 */
export function studyDegreeResult(degreeKey) {
  switch (degreeKey) {
    case "heroic":
    case "critical":
    case "success":
      return "studied";
    case "fumble":
    case "blunder":
      return "flawed";
    default:
      // partial, failure, and anything unrecognised: no target, try again.
      return "retry";
  }
}
