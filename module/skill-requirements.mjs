/**
 * REQUIREMENTS PRINTED ON A SKILL, AND ON A SKILL ACTION'S RANKS.
 *
 * NEW at 3.565.0 (Chapter 4 audit, pages 91–100). Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE THING FROM `requirements`.
 *
 * A skill action's `requirements` field is a SENTENCE. Its only consumer
 * is `action-workflow.mjs`, which pushes it onto the card as a line of
 * text — so "Requirements Adept", "Ranks 2" and "PP Cost 1" were all
 * printed at the player and enforced by nobody. Text that describes a
 * gate is not a gate; it is the defect class this project has now named
 * in six consecutive blocks.
 *
 * These two tables are the machine-readable half. They are deliberately
 * tiny, because the rulebook is: ONE skill carries a class-type
 * requirement and ONE action carries a rank requirement, across all of
 * Chapter 4.
 */

/**
 * "POWER MANIPULATION (Int) — Requirements Adept" (page 91).
 *
 * The only skill in the book with a requirement line of its own, and it
 * gates the skill rather than any one of its five actions.
 *
 * GRAHAM'S RULING R1, 17 September 2026: "Refuse a non-adept." So this
 * is enforced at BUILD time — a non-Adept may not put ranks in the skill
 * — rather than at use time. That is the stronger of the two readings
 * and the simpler one to live with: a character sheet that cannot hold
 * the ranks cannot reach the actions, so one gate does the work of two
 * and there is no state where the sheet shows a bonus the character may
 * not roll.
 */
// MODULE-LOCAL: `skillClassTypeRequirement` and `meetsSkillClassType`
// are the two questions worth asking, and a caller reading the table
// directly would be a third answer that could drift from both.
const SKILL_CLASS_TYPE_REQUIREMENTS = Object.freeze({
  powerManipulation: "Adept"
});

/**
 * The class type a skill requires, or "" for the other twenty-odd.
 * @param {string} skillKey
 * @returns {string}
 */
export function skillClassTypeRequirement(skillKey) {
  return SKILL_CLASS_TYPE_REQUIREMENTS[String(skillKey ?? "")] ?? "";
}

/**
 * Does this character's tier list satisfy a skill's class-type gate?
 *
 * THE TIER LIST IS ASKED, NOT THE CLASS ITEM. `effectiveTiers` already
 * composes the class's own `classType` with every tier an archetype feat
 * adds, and it already splits the Bard's "Adept/Expert" into two — so a
 * Bard passes, and so does a Fighter who took an archetype granting
 * Adept. Reading `classType` alone would have refused both, which is the
 * exact mistake recorded on `effectiveTiers` itself for class feats on
 * 13 August 2026.
 *
 * A SKILL WITH NO REQUIREMENT IS ALWAYS SATISFIED, including for a
 * character with no class at all — the level cap in `_preUpdate` is the
 * rule that governs those, and this must not become a second one.
 *
 * @param {string} skillKey
 * @param {string} tiers comma/slash-joined tier list from effectiveTiers
 * @returns {boolean}
 */
export function meetsSkillClassType(skillKey, tiers) {
  const needed = skillClassTypeRequirement(skillKey);
  if (!needed) return true;
  return String(tiers ?? "")
    .split(/[,/]/)
    .map((t) => t.trim().toLowerCase())
    .includes(needed.toLowerCase());
}

/* ------------------------------------------------------------------ *
 * SIGIL'S "RANKS 2" IS NOT HERE, AND THAT IS THE POINT.
 *
 * Page 91 prints "Ranks 2" on Sigil — the only rank gate on an action
 * anywhere in the core rulebook (`grep "^Ranks [0-9]" rules.txt` returns
 * one line). Graham's ruling R2, 17 September 2026: "Please implement."
 *
 * It needed no new machinery. `minRank` already exists on a skill-action
 * entry, built at 3.561.0 for Pillars of Faith's eight "Requirements
 * Rank 2 / Rank 3" actions, and `action-workflow.mjs` already reads it
 * from whichever skill the action was invoked through. Sigil declares
 * `minRank: 2` and the existing gate does the rest.
 *
 * A SECOND TABLE HERE WOULD HAVE BEEN A SECOND ANSWER to "how many
 * ranks does this action need", and the next action to want one would
 * have had to guess which of the two to use. Recorded rather than left
 * silent, because the absence is the decision.
 * ------------------------------------------------------------------ */
