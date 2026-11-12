/**
 * THE INNATE SAVE DC, FOR A MODULE'S OWN ROLL (3.684.0; Eldritch Arts Block
 * 6, G25).
 *
 *   MALEVOLENT BLAST: "the target must make a Will save or be Stunned 1".
 *   XITHRA CONE: "release your Xithra Blast as a 30-foot cone … basic Reflex".
 *
 * Neither prints a DC. Graham's Q136 (as proposed): the Warlock's INNATE save
 * DC, "10 + Charisma + level, with the soul's +1 where it applies" — the DC an
 * innate cast of that spell would use: Chapter 9's "Innate Save = 10 +
 * magical ability score + level" (casting.mjs `innateSaveDC`), at the level
 * the cast is made at (an item's own, or the character's plus a registered
 * innate level bonus — the bonded soul's "+1": innate-level-bonus.mjs), with
 * the spell's printed DC where it prints one (innate-printed.mjs). The same
 * three pieces the cast reads, so the module's roll and the cast cannot
 * disagree. Exposed as `helpers.innateSaveDCFor(actor, spell)`.
 *
 * Not the High Magic +2 or a declared spell DC bonus: those are the cast's
 * own steps, and Q136 names the formula alone.
 */
import { innateSaveFor } from "./innate-printed.mjs";
import { innateLevelBonusFor } from "./innate-level-bonus.mjs";
import { innateCastLevel } from "../item-innate-level.mjs";
import { innateAbilityKey } from "../focus-declarations.mjs";

/**
 * @param {Actor} actor
 * @param {Item} spell an innate spell item (Xithra)
 * @returns {Promise<{value: number, printed: boolean, level: number, ability: string}>}
 */
export async function innateSaveDCFor(actor, spell) {
  const system = actor?.system ?? {};
  const characterLevel = Number(system.identity?.level ?? 0);
  const at = innateCastLevel(spell, Array.from(actor?.items ?? []), characterLevel);
  const bonus = at?.itemName ? 0 : await innateLevelBonusFor(actor, spell);
  const level = Number(at?.level ?? characterLevel) + bonus;
  const ability = innateAbilityKey(spell, system.magic?.castingAbility, system.attributes ?? {});
  const score = Number(system.attributes?.[ability]?.total ?? system.magic?.castingAbilityScore ?? 0);
  const dc = innateSaveFor(spell, score, level);
  return { value: dc.value, printed: Boolean(dc.printed), level, ability };
}
