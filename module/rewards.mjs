/**
 * ENCOUNTERS AND REWARDS — Chapter 12, pages 389–393 (3.619.0, block 38;
 * Graham's R1–R6 of 4 October 2026, "your recommendation" on all).
 *
 *   Threat Level → an XP budget per character (page 389)
 *   APL and Effective Level → the XP each creature is worth
 *   the five accomplishment awards (page 391)
 *   Treasure by Level, a guide for the GM (page 393)
 *
 * NONE OF THIS EXISTED. XP was typed by hand on each sheet, nothing read
 * a creature's level for XP, and the GM tab's "Challenge" box was read by
 * nothing at all.
 *
 * R1, THE TABLE'S DIRECTION. The page prints "APL − EL" beside the XP, so
 * read literally a creature nine levels ABOVE the party (−9) is worth 20 XP
 * and one seven levels BELOW is worth 1,600 — the reverse of the budget's
 * own logic. Read as EL − APL, an equal-level creature is 400, which is the
 * page's worked example exactly: four PCs, Very Easy, a 400 XP budget, one
 * creature at their level. Off the table: more than nine below is worth
 * nothing; more than seven above is flagged and valued at the top row.
 *
 * Pure. No Foundry.
 */

/** The seven Threat Levels and their XP budget per character (page 389). */
export const THREAT_LEVELS = Object.freeze([
  { key: "incrediblyEasy", label: "Incredibly Easy", xp: 50 },
  { key: "veryEasy", label: "Very Easy", xp: 100 },
  { key: "easy", label: "Easy", xp: 150 },
  { key: "medium", label: "Medium", xp: 200 },
  { key: "hard", label: "Hard", xp: 300 },
  { key: "veryHard", label: "Very Hard", xp: 400 },
  { key: "incrediblyHard", label: "Incredibly Hard", xp: 500 }
]);

/**
 * The XP a creature is worth, by how far its Effective Level sits from the
 * party's (R1: EL − APL). Index 0 is −9.
 */
const LEVEL_DIFFERENCE_XP = Object.freeze([
  20, 40, 60, 80, 100, 150, 200, 250, 300, 400, 500, 600, 800, 1000, 1200, 1400, 1600
]);
const LOWEST_DIFFERENCE = -9;
const HIGHEST_DIFFERENCE = 7;

/** The five accomplishment awards (page 391), for the party as a whole. */
export const ACCOMPLISHMENT_AWARDS = Object.freeze([
  { key: "minor", label: "Minor", xp: 100 },
  { key: "moderate", label: "Moderate", xp: 200 },
  { key: "major", label: "Major", xp: 500 },
  { key: "epic", label: "Epic", xp: 800 },
  { key: "legendary", label: "Legendary", xp: 1000 }
]);

/**
 * Treasure by Level (page 393): total party wealth in gp and the number of
 * magic items, by APL. A guide only (R6) — nothing counts or enforces it.
 */
const TREASURE_BY_LEVEL = Object.freeze({
  2: { gp: 1000, items: 4 },
  3: { gp: 2000, items: 8 },
  4: { gp: 4000, items: 10 },
  5: { gp: 10000, items: 12 },
  6: { gp: 16000, items: 14 },
  7: { gp: 24000, items: 16 },
  8: { gp: 40000, items: 18 },
  9: { gp: 60000, items: 20 },
  10: { gp: 88000, items: 24 },
  11: { gp: 120000, items: 28 },
  12: { gp: 168000, items: 32 },
  13: { gp: 240000, items: 36 },
  14: { gp: 340000, items: 40 },
  15: { gp: 500000, items: 44 },
  16: { gp: 740000, items: 48 },
  17: { gp: 1100000, items: 52 },
  18: { gp: 1600000, items: 56 },
  19: { gp: 2400000, items: 60 },
  20: { gp: 3600000, items: 70 }
});

const whole = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : 0;
};

/** A Threat Level by key, or null. */
export function threatLevel(key) {
  return THREAT_LEVELS.find((entry) => entry.key === key) ?? null;
}

/**
 * Average Party Level: "adding the total levels … together and dividing by
 * the number of party members (include any permanent NPCs)". Rounded to the
 * nearest level, a half rounding up, because the XP table is read by whole
 * levels; the exact average is returned too, for the sheet.
 *
 * @param {number[]} levels
 * @returns {{apl: number, exact: number, members: number}}
 */
export function averagePartyLevel(levels = []) {
  const list = (Array.isArray(levels) ? levels : []).map((level) => Math.max(0, Number(level) || 0));
  if (!list.length) return { apl: 0, exact: 0, members: 0 };
  const exact = list.reduce((sum, level) => sum + level, 0) / list.length;
  return { apl: Math.floor(exact + 0.5), exact: Math.round(exact * 100) / 100, members: list.length };
}

/**
 * A creature's Effective Level (R3): the GM tab's Effective Level box, or
 * the creature's own level while that is blank (0).
 *
 * @param {object} system an actor's system data
 */
export function effectiveLevelOf(system) {
  const typed = whole(system?.gm?.challenge);
  if (typed > 0) return typed;
  return Math.max(0, whole(system?.identity?.level));
}

/**
 * The XP one creature is worth to a party (R1, read as EL − APL).
 *
 * @returns {{xp: number, difference: number, beyond: "below"|"above"|null}}
 */
export function creatureXP(el, apl) {
  const difference = whole(el) - whole(apl);
  if (difference < LOWEST_DIFFERENCE) return { xp: 0, difference, beyond: "below" };
  if (difference > HIGHEST_DIFFERENCE) {
    return { xp: LEVEL_DIFFERENCE_XP[LEVEL_DIFFERENCE_XP.length - 1], difference, beyond: "above" };
  }
  return { xp: LEVEL_DIFFERENCE_XP[difference - LOWEST_DIFFERENCE], difference, beyond: null };
}

/** The encounter's XP budget: per character × the party's size. */
function encounterBudget(threatKey, members) {
  const threat = threatLevel(threatKey);
  if (!threat) return 0;
  return threat.xp * Math.max(0, whole(members));
}

/**
 * An encounter, totalled: each creature's XP at the party's APL, the
 * total, and how it sits against the budget.
 *
 * @param {object} options
 * @param {{name: string, el: number, count?: number}[]} options.creatures
 * @param {number} options.apl
 * @param {string} options.threat
 * @param {number} options.members
 */
export function encounterSummary({ creatures = [], apl = 0, threat = "", members = 0 } = {}) {
  const rows = (Array.isArray(creatures) ? creatures : []).map((creature) => {
    const count = Math.max(1, whole(creature?.count ?? 1));
    const each = creatureXP(creature?.el, apl);
    return { ...creature, count, xpEach: each.xp, xp: each.xp * count, difference: each.difference, beyond: each.beyond };
  });
  const total = rows.reduce((sum, row) => sum + row.xp, 0);
  const budget = encounterBudget(threat, members);
  return {
    rows,
    total,
    budget,
    remaining: budget - total,
    over: budget > 0 && total > budget,
    // WHICH THREAT THE TOTAL ACTUALLY AMOUNTS TO, for a GM who built first
    // and chose second: the highest level whose budget the total reaches.
    actualThreat: members > 0
      ? ([...THREAT_LEVELS].reverse().find((entry) => total >= entry.xp * members)?.label ?? "Below Incredibly Easy")
      : ""
  };
}

/**
 * "XP is distributed evenly among the party". Whole XP each; what does not
 * divide is reported, never invented.
 *
 * @returns {{each: number, remainder: number}}
 */
export function splitXP(total, members) {
  const n = Math.max(0, whole(members));
  const xp = Math.max(0, whole(total));
  if (!n) return { each: 0, remainder: xp };
  return { each: Math.floor(xp / n), remainder: xp % n };
}

/**
 * The Treasure by Level guide line for an APL (R6), or null below 2nd —
 * "1st level characters start with the wealth from Chapter 6".
 */
export function treasureGuide(apl) {
  const level = Math.min(20, whole(apl));
  const row = TREASURE_BY_LEVEL[level];
  if (!row) return null;
  return { apl: level, gp: row.gp, items: row.items };
}
