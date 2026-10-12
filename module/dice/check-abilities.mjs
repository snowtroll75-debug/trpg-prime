/**
 * Which ability scores a check is "based on" — NEW at 3.613.0.
 *
 * Graham's R1 of 2 October 2026 (block 35, Physical Boost): "the next
 * Constitution, Strength, or Dexterity based check" reaches "any check
 * affected by the ability score". Until now the held bonus could only be
 * scoped by check type and subject, so Physical Boost named `attribute`
 * plus three subjects and an Athletics check never saw it.
 *
 * A check's abilities are worked out once, when it is rolled, from the
 * roller's own data — a skill's governing ability can be overridden on the
 * actor (config.mjs, SKILLS) — and travel on the card, because the held
 * bonus is offered after the fact, long after the check object is gone.
 *
 *   attribute            the attribute itself
 *   skill / specialist   the skill's governing ability, the actor's first
 *   save                 Fortitude → Con, Reflex → Dex, Will → Wis
 *                        (actor.mjs, `saveAbilities`)
 *   initiative           Dexterity and Wisdom: "(Dex x5) + (Wis x5)"
 *   attack               only what the caller names. A weapon Strike names
 *                        Strength in melee, Dexterity at range, and both for
 *                        a finesse weapon (attack.mjs, Chapter 1); a spell
 *                        attack names nothing, so a physical bonus never
 *                        reaches it.
 *
 * Anything else — damage, flat, Spellcraft, a cast — names nothing.
 */

import { SKILLS } from "../config.mjs";

export const SAVE_ABILITIES = Object.freeze({
  fortitude: "constitution",
  reflex: "dexterity",
  will: "wisdom"
});

const INITIATIVE_ABILITIES = Object.freeze(["dexterity", "wisdom"]);

const ABILITY_KEYS = Object.freeze([
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"
]);

const clean = (list) => [...new Set((Array.isArray(list) ? list : [list])
  .map((a) => String(a ?? "").trim().toLowerCase())
  .filter((a) => ABILITY_KEYS.includes(a)))];

/**
 * The abilities a check is based on.
 *
 * @param {object} check {type, subject, abilities?}
 * @param {object} [system] the roller's actor system data, for skill overrides
 * @returns {string[]} lower-case ability keys, possibly empty
 */
export function checkAbilities(check, system = null) {
  const declared = clean(check?.abilities ?? []);
  if (declared.length) return declared;
  const type = String(check?.type ?? "").trim().toLowerCase();
  const subject = String(check?.subject ?? "").trim();
  const key = subject.toLowerCase();
  if (type === "attribute") return clean([key]);
  if (type === "save") return clean([SAVE_ABILITIES[key]]);
  if (type === "initiative") return [...INITIATIVE_ABILITIES];
  if (type === "skill") {
    return clean([system?.skills?.[subject]?.ability ?? SKILLS[subject]?.ability]);
  }
  if (type === "specialist") {
    return clean([system?.specialistSkills?.[subject]?.ability]);
  }
  return [];
}

/**
 * The abilities a weapon Strike's attack roll is based on.
 * @param {{ranged?: boolean, finesse?: boolean}} weapon
 */
export function weaponAttackAbilities({ ranged = false, finesse = false } = {}) {
  if (ranged) return ["dexterity"];
  return finesse ? ["strength", "dexterity"] : ["strength"];
}
