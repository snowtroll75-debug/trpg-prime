/**
 * spell-trait-immunity — a spell's traits against what its targets are
 * immune to.
 *
 * NEW at 3.622.1 (the 3.622.0 drive's F1; Graham's R1 of 5 October 2026,
 * "your recommendation"). Appendix 3's Mental: "objects and mindless
 * creatures are immune to effects with this trait"; Emotion brings Mental,
 * and Fear brings Emotion and Mental (3.622.0's A18). The ACTION path has
 * asked `immuneToEffect` since 3.233.0 and refused Encourage at a Mindless
 * creature; the SPELL path asked nothing, so the 3.622.0 drive's Fear left a
 * Mindless foe Frightened 4 and Fleeing, and Command took hold of it.
 *
 * THE SAME RULE, NOT A SECOND ONE. `immuneToEffect` is the action path's own
 * question — derived immunities (Mindless → mental, Construct → essence) and
 * whatever the GM typed into the creature's immunities — so a spell and an
 * action can never disagree about who is immune.
 *
 * THE SHAPE IS THE KIND GATE'S (magic/kind-gate.mjs): an immune target is
 * PRUNED from the set and named on the card; a cast whose every target is
 * immune is refused before anything is spent. Pure: the workflow hands in
 * the actors and the reader of each one's creature type.
 */

import { immuneToEffect } from "../traits.mjs";

/** The trait this creature is immune to among a spell's, or null. */
function spellImmunityTrait(spellTraits, targetSystem, creatureTypeSystem = null) {
  const verdict = immuneToEffect(String(spellTraits ?? ""), targetSystem ?? null, creatureTypeSystem);
  return verdict?.trait ?? null;
}

/** The card's reason for one immune creature. */
function immunityReason(name, trait) {
  return `${name} is immune to the ${trait} trait`;
}

/**
 * Splits creatures into those a spell can reach and those immune to it.
 *
 * @param {object[]} actors the creatures the spell would reach
 * @param {string} spellTraits
 * @param {(actor:object)=>object|null} [typeOf] the owned creature type's system data
 * @returns {{kept:object[], skipped:{name:string, reason:string, trait:string}[]}}
 */
export function partitionTraitImmune(actors = [], spellTraits = "", typeOf = () => null) {
  const kept = [];
  const skipped = [];
  for (const actor of actors ?? []) {
    if (!actor) continue;
    const trait = spellImmunityTrait(spellTraits, actor.system, typeOf(actor));
    if (trait) skipped.push({ name: actor.name, reason: immunityReason(actor.name, trait), trait });
    else kept.push(actor);
  }
  return { kept, skipped };
}
