/**
 * Appendix 4 — what a divine aspect does to a character, as pure
 * functions.
 *
 * The aspect item has carried edicts, anathema, ethics, a class skill,
 * specialist and bonus spells and a favoured weapon since 3.175.0, but
 * until 3.209.0 only the two spell lists were read by anything. The
 * Cleric's Deific Aspect ability promises all of it, so the rest is
 * wired here — in one module, pure, so the harness can run every case
 * without a Foundry actor.
 *
 * (The class skill lives in class-skills.mjs instead, because it is one
 * source among several and the stacking rule is about sources.)
 */

/**
 * A weapon name reduced to its letters, with any trailing qualifier cut.
 *
 * The appendix and the weapons pack disagree about spacing and
 * apostrophes: the appendix prints "Battleaxe" where the pack has
 * "Battle Axe", and "Flail" has to reach "Footman’s Flail" through a
 * curly apostrophe. Letters-only settles all of that.
 *
 * The qualifier cut is separate and deliberate. A weapon on a sheet is
 * routinely renamed "Heavy Mace (cold iron)" or "Scythe, silvered", and
 * an aspect that stopped recognising its own favoured weapon the moment
 * a player added a material would be worse than useless — it would be
 * silently wrong, with nothing on the sheet saying why.
 */
const plain = (value) => String(value ?? "")
  // "(", "," or an em dash start a qualifier. A plain HYPHEN does not:
  // "Dagger-Axe" is a different weapon, not a qualified dagger, and
  // treating the hyphen as a separator handed it Murder's whole family.
  .replace(/\s*[(,\u2014]\s*[^()]*\)?\s*$/, "")
  .toLowerCase()
  .replace(/[^a-z]/g, "");

/**
 * Does this weapon count as the aspect's favoured weapon?
 *
 * The book treats the entry as a FAMILY, not one weapon: "you are
 * proficient with this group of weapons". Dawn's Mace covers the pack's
 * Heavy, Light and Footman's Mace; Death's Scythe is one weapon.
 *
 * The rule is that the weapon's name ENDS with the favoured name. Every
 * family in the appendix works that way, because English puts the head
 * noun last: Heavy Mace, Composite Longbow, Long Spear, Footman's
 * Flail. Nothing needs a prefix match.
 *
 * It used to accept a prefix match too, and that arm was never
 * exercised by any of the ten — but it was the dangerous one. "Staff
 * Sling", "Mace of Disruption", "Spear Thrower" and "Dagger-Axe" are
 * all real weapon names in the genre and all four would have joined a
 * family they have nothing to do with, handing out proficiency and a
 * +1 on every attack. Removing it changed no shipping family (pinned in
 * verify-block40-aspects) and closed all four.
 */
import { ALIGNED_TRAITS } from "./aligned.mjs";

export function favouredWeaponMatches(favoured, weaponName) {
  const want = plain(favoured);
  const name = plain(weaponName);
  if (!want || !name) return false;
  return name === want || name.endsWith(want);
}

/**
 * The divine aspects on a sheet whose favoured weapon this is.
 *
 * A list rather than a boolean because two aspects could in principle
 * name the same weapon, and Appendix 1 says class bonuses from different
 * sources stack — the same reasoning as the class-skill sources.
 */
/**
 * ...OR THE WEAPON'S GROUP (3.572.0). Pillars of Faith's Chapter 7 prints
 * a favoured weapon as a GROUP where the appendix printed a family head:
 * "Sword", "Hammer", "Knife", "Polearm". The suffix rule reaches most of
 * a group by accident of English (Longsword, Warhammer) and none of a
 * Knife's (Dagger, Sickle, Main-Gauche) or a Polearm's (Halberd,
 * Glaive). The proficiency rules already match the group
 * (proficiency-rules.mjs); the attack bonus and the Crusader's Devotion
 * now do too, by the same letters-only comparison.
 */
function favouredWeaponGroupMatches(favoured, weaponGroup) {
  const want = plain(favoured);
  const group = plain(weaponGroup);
  return Boolean(want && group && want === group);
}

export function favouredWeaponSources(aspects = [], weaponName = "", weaponGroup = "") {
  return Array.from(aspects ?? [])
    .filter((aspect) => favouredWeaponMatches(aspect?.system?.favouredWeapon, weaponName)
      || favouredWeaponGroupMatches(aspect?.system?.favouredWeapon, weaponGroup))
    .map((aspect) => ({
      name: aspect.name,
      favoured: String(aspect?.system?.favouredWeapon ?? "")
    }));
}

/**
 * The attack modifiers a favoured weapon contributes.
 *
 * "you gain a +1-class bonus to all attacks made with this weapon" —
 * shaped like every other entry in the attack workflow's modifier list,
 * and typed `class` so it stacks with Weapon Focus's +1 rather than
 * being folded into it.
 */
export function favouredWeaponAttackModifiers(aspects = [], weaponName = "", weaponGroup = "") {
  return favouredWeaponSources(aspects, weaponName, weaponGroup).map((source) => ({
    label: `${source.name} (favoured weapon)`,
    value: 1,
    type: "class"
  }));
}

/**
 * Proficiency, the other half of the favoured weapon line: "you add this
 * weapon to your list of those with which you are proficient".
 *
 * Separate from the bonus because the two are separate promises and a
 * character can meet one without the other — a Cleric of Death already
 * proficient with the Scythe still gains the +1.
 */
export function grantsProficiency(aspects = [], weaponName = "", weaponGroup = "") {
  return favouredWeaponSources(aspects, weaponName, weaponGroup).length > 0;
}

/** The divine-aspect items on an actor. */
export function aspectsOf(actor) {
  return Array.from(actor?.items ?? []).filter((item) => item.type === "divine-aspect");
}

/**
 * The ALIGNED TRAITS a character gains from their divine aspects.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 31 August 2026: *"any PC that takes a Divine Aspect
 * should gain the aligned trait of that aspect."*
 *
 * NOTHING HAD TO BE MAPPED. Every one of the ten aspects already carries
 * its alignment in its own `traits` line — Dawn is Good, Murder is Evil,
 * Justice is Good and Order, Tyranny is Evil and Order, Magic and Death
 * and Nature are Balance. The ruling was a WIRING job, not a data one,
 * and the first thing worth doing was checking rather than inventing a
 * table of ten.
 *
 * FILTERED TO THE FIVE, because an aspect's trait line is not promised
 * to hold only alignments. Taking the whole line would hand a character
 * whatever else an author writes there next, under a rule about
 * alignment.
 *
 * WHY THIS IS A GRANT AND NOT A SHEET FIELD. `prepareGrantedTraits` in
 * documents/actor.mjs sets out the argument in full: a trait written
 * into `system.details.traits` is a trait a player can save into their
 * own sheet permanently, and an aspect can be removed. So this joins the
 * DERIVED field beside the Form spells' grants, `creatureTraits()`
 * unions the two, and nothing ever has to subtract a word from a string
 * it does not own.
 *
 * @param {object[]} aspects the actor's divine-aspect items
 * @returns {string[]} lowercase aligned traits, deduplicated
 */
export function aspectAlignedTraits(aspects = []) {
  const out = [];
  for (const aspect of Array.from(aspects ?? [])) {
    const line = String(aspect?.system?.traits ?? "");
    for (const raw of line.split(/[,;]/)) {
      const trait = raw.trim().toLowerCase();
      if (!ALIGNED_TRAITS.includes(trait)) continue;
      if (!out.includes(trait)) out.push(trait);
    }
  }
  return out;
}
