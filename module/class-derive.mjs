/**
 * The two pieces of the class derivation that the actor document calls,
 * kept OUT of actor.mjs so the harness can import and run them.
 *
 * This split exists because of a mutation audit at 3.209.0. Both used to
 * live inside actor.mjs as a function and four inline lines, and the
 * only checks on them were regexes over that file's source. Twenty-two
 * realistic one-token mutations shipped with 2763 checks green, and the
 * three worst were all in these few lines:
 *
 *   - `(system.identity?.level ?? 1) - 1` — every character resolves one
 *     row low, and a 1st-level character resolves to null and gets
 *     nothing from their class at all.
 *   - `classSkillBonuses(sources.slice(0, 1), …)` — only the first
 *     source of a class skill counts, which is the whole of the class-
 *     skill work undone.
 *   - `flags: actor.flags` instead of `actor.flags["trg-prime"]`, or a
 *     filter on `"feats"` — all twelve archetype class-skill grants
 *     silently contribute nothing.
 *
 * A regex cannot tell any of those from the correct line. Running the
 * function can, and actor.mjs cannot be imported outside Foundry (it
 * extends `Actor` at module scope). So they live here.
 */

import { classItemOf, resolveClassProgression, skillPointsPerLevel } from "./class-progression.mjs";
import { CLASS_SKILL_GRANTS, classSkillBonuses, classSkillSources } from "./class-skills.mjs";
import { aspectsOf } from "./divine-aspect.mjs";
import { skillPointBonuses } from "./feats.mjs";
import { skillPointBudget } from "./skill-points.mjs";

/**
 * Resolve the character's row of their class's printed table.
 *
 * Called before conditions, because conditions read the saves it feeds.
 */
export function prepareClassProgression(system, actor) {
  system.progression = resolveClassProgression(
    classItemOf(actor),
    system.identity?.level ?? 1
  );
}

/**
 * Collect every source that calls a skill a class skill, and put one
 * class bonus per source into the skill's bonus pool.
 *
 * Contributed to the POOL rather than written into the skill's class
 * slot. Two reasons. The slot is where flat class-type bonuses land —
 * Favoured Terrain writes "+2 class" into it — and those have to stack
 * on top of the class-skill bonus, not replace or absorb it. And a class
 * bonus cannot be gained from the same source twice, which is a
 * statement about sources; the pool is where sources are visible.
 *
 * @returns {Map<string, Array<{id: string, label: string}>>} so the
 *   caller can still tell the sheet which sources apply.
 */
export function applyClassSkillBonuses(system, actor) {
  const classBonus = Number(system.identity?.classBonus ?? 0);
  const sourcesBySkill = classSkillSources({
    skills: system.skills,
    classItem: classItemOf(actor),
    flags: actor.flags?.["trg-prime"] ?? {},
    grants: CLASS_SKILL_GRANTS,
    ownedFeatNames: new Set(
      Array.from(actor.items ?? [])
        .filter((item) => item.type === "feat")
        .map((item) => String(item.name).trim().toLowerCase())
    ),
    aspects: aspectsOf(actor),
    schools: Array.from(actor?.items ?? []).filter((item) => item.type === "wizard-school"),
    declared: declaredClassSkills(actor?.items ?? [])
  });
  for (const [key, sources] of sourcesBySkill) {
    for (const bonus of classSkillBonuses(sources, classBonus)) {
      actor.addBonus(`system.skills.${key}`, bonus);
    }
  }
  return sourcesBySkill;
}

/**
 * The class skills feats and abilities declare outright (3.671.0):
 * `flags.trg-prime.classSkills`, a list of skill names or keys.
 *
 * @returns {Array<{id: string, label: string, skills: string[]}>}
 */
export function declaredClassSkills(items = []) {
  return Array.from(items ?? [])
    .filter((item) => item?.type === "feat" || item?.type === "ability")
    .map((item) => {
      const raw = item?.flags?.["trg-prime"]?.classSkills;
      const skills = (Array.isArray(raw) ? raw : (raw ? [raw] : [])).map((x) => String(x).trim()).filter(Boolean);
      return { id: String(item.id ?? item._id ?? item.name), label: String(item.name ?? ""), skills };
    })
    .filter((entry) => entry.skills.length);
}

/**
 * The printed "N + Int per level", resolved so the sheet can show the
 * budget beside the ranks.
 *
 * Called AFTER prepareAttributes, because Intelligence is not resolved
 * until then and reading it earlier gives the pre-racial, pre-effect
 * number.
 *
 * Exported and living here, not in actor.mjs, for the reason the rest of
 * this file exists: inserting `.slice(0, 0)` into the item list below
 * switches the Human's extra skill point back off and satisfies every
 * regex a harness can write over the call site. Running it does not.
 *
 * @returns {number} the resolved points, for the caller and the harness.
 */
export function prepareSkillPointBudget(system, actor) {
  if (!system.progression) return 0;
  const bonus = skillPointBonuses(
    Array.from(actor?.items ?? [])
      .filter((item) => item.type === "ability" || item.type === "feat")
      .map((item) => item.name)
  );
  // "N + <ability> per level". Intelligence for all eight player classes,
  // which is why this read `intelligence` directly until 3.232.0; the
  // Animal class (and so an animal companion) prints Wisdom instead.
  const abilityKey = system.progression.skillPointAbility || "intelligence";
  const ability = system.attributes?.[abilityKey]?.total ?? 0;
  const resolved = skillPointsPerLevel(system.progression.skillPoints, ability, bonus);
  // What the bonus ACTUALLY contributed, not what it nominally is.
  //
  // The total is floored at zero, so a Fighter with Intelligence -6 and
  // Skilled resolves to 0 — and the hint still read "0 at your
  // Intelligence, including +1 from Skilled", which is a sentence that
  // contradicts the number beside it.
  const withoutBonus = skillPointsPerLevel(system.progression.skillPoints, ability, 0);
  system.progression.skillPointBonus = resolved - withoutBonus;
  system.progression.skillPointsThisLevel = resolved;
  return resolved;
}

/**
 * The BUDGET, not just the rate: available, spent and left.
 *
 * Called at the END of prepareSkills rather than beside the rate,
 * because it counts ranks and prepareSkills clamps them to the
 * character's level first. Counting before that clamp would report
 * points spent on ranks the character does not actually have.
 */
export function prepareSkillBudget(system, actor = null) {
  if (!system.progression) return null;
  system.progression.skillBudget = skillPointBudget({
    perLevel: system.progression.skillPointsThisLevel,
    level: system.identity?.level ?? 0,
    skills: system.skills,
    // STORED, for the level-cap check only — see the note in
    // skillPointBudget. The prepared ranks are already clamped.
    storedSkills: actor?._source?.system?.skills ?? null,
    // Endeavour (optional rule): a Skill Point purchase is a flat,
    // one-time addition to the budget, not a per-level rate — the same
    // shape featBudget's classBonusFeats already uses for feats. Applied
    // even when the optional rule is off: a world that switches it off
    // after a character has already spent Endeavour should not silently
    // claw the points back.
    bonus: Number(system.identity?.endeavourSkillPoints ?? 0)
  });
  return system.progression.skillBudget;
}
