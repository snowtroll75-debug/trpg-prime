/**
 * WHAT AGE DOES NOT CHANGE (3.673.0, C10). Pure; no Foundry.
 *
 * Inner Tempest's appendix on aging: "Age modifiers are applied directly to
 * your ability scores and therefore affect any statistics derived from those
 * abilities normally … A character does not need to recalculate previous Hit
 * Points, skill points or other choices gained at earlier levels." This system
 * derives maximum Hit Points from the current Constitution total times the
 * level, and the skill budget from the current Intelligence total, so an age
 * penalty would take away Hit Points the character already had. Graham's
 * B9-11: age modifiers leave max HP and the skill budget alone, now and at
 * later levels.
 *
 * An age effect declares itself with `flags.trg-prime.age` (any truthy value;
 * the module puts the category there). Its changes on
 * `system.attributes.<ability>.<type>` are the age modifiers; this sums them
 * per ability so the two derivations can take them back out.
 */

const SYSTEM_ID = "trg-prime";
const ABILITY_CHANGE = /^system\.attributes\.(strength|dexterity|constitution|intelligence|wisdom|charisma)\.[A-Za-z]+$/;

/**
 * @param {Iterable<object>} effects the actor's applied effects
 * @returns {{strength: number, dexterity: number, constitution: number, intelligence: number, wisdom: number, charisma: number}}
 */
export function ageShiftOf(effects = []) {
  const shift = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled || !effect.flags?.[SYSTEM_ID]?.age) continue;
    for (const change of Array.isArray(effect.changes) ? effect.changes : []) {
      const m = ABILITY_CHANGE.exec(String(change?.key ?? ""));
      if (!m) continue;
      const value = Number(change.value);
      if (Number.isFinite(value)) shift[m[1]] += value;
    }
  }
  return shift;
}

/** An ability total with its age modifiers taken back out. */
export function withoutAge(total, shift, ability) {
  return (Number(total) || 0) - (Number(shift?.[ability]) || 0);
}
