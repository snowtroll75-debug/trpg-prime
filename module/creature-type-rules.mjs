/**
 * Creature Type — pure lookups and derived rules for the "creature-type"
 * item (Creature Codex V1.3, twelve entries: Aberration through Wyrm).
 *
 * Unlike a race's ability modifiers, a creature type's mechanical effects
 * split into two very different shapes:
 *
 *   - FIXED per type (an ADD/OVERRIDE Active Effect baked at build time,
 *     same as a race): ability score modifiers, saving throw bonuses,
 *     Death State, the fixed immunity/weakness/resistance lists.
 *   - PER-INSTANCE (a GM edits the field on the specific NPC's item after
 *     it lands on the actor, so no compendium-baked effect could ever
 *     know the value): a Construct's natural DR ("determined by the
 *     construct's race" — i.e. differs per specific creature), and an
 *     Elemental's element ("often have a weakness to another elemental
 *     type" — the book never fixes which, so this is a per-instance
 *     choice, not a rule to hard-code).
 *
 * This module is the single place both halves are read from, so the
 * combat code that needs them (critical immunity, flanking, damage
 * reduction, the Dying/Destroyed branch) doesn't each grow its own
 * `actor.items.find(...)` copy.
 */

/**
 * The actor's owned creature-type item, if any.
 *
 * A character usually carries exactly one — Humanoid, by default, same
 * as every race so far — and an NPC may carry any of the twelve or
 * none at all (an un-set creature type just means none of this module's
 * derived rules apply, not an error).
 */
export function ownedCreatureType(actor) {
  return Array.from(actor?.items ?? []).find((i) => i.type === "creature-type") ?? null;
}

/**
 * The plain `system` data of the actor's creature-type item, for
 * threading into the pure damage/immunity functions in `defences.mjs`
 * and `creature-traits.mjs` that are deliberately kept testable without
 * a live Foundry Document (their own stated design). `null` when the
 * actor carries no creature-type item.
 */
export function ownedCreatureTypeSystem(actor) {
  return ownedCreatureType(actor)?.system ?? null;
}

/**
 * Whether this actor's creature type says it cannot be critically hit.
 * Ooze: "immune to... criticals."
 */
export function isCritImmune(creatureTypeSystem) {
  return Boolean(creatureTypeSystem?.critImmune);
}

/**
 * Whether this actor's creature type says it cannot be flanked at all —
 * the FLANKING BONUS itself never applies, distinct from (and on top
 * of) an immunity to the Flat-Footed condition. Ooze: "cannot be
 * Flanked or Flat-Footed" — Flat-Footed immunity is carried as a plain
 * condition immunity in the item's baked immunities text (the existing
 * mechanism already covers it); this flag is the other half.
 */
export function cannotBeFlanked(creatureTypeSystem) {
  return Boolean(creatureTypeSystem?.noFlanking);
}

/**
 * Whether this actor's creature type says it sees despite being blind —
 * Ooze: "is blind but gains the Blindsight ability." Bypasses
 * Flat-Footed's Dexterity/dodge suppression when Blinded is the reason
 * Flat-Footed would otherwise apply.
 */
export function hasBlindsight(creatureTypeSystem) {
  return Boolean(creatureTypeSystem?.blindsight);
}

/*
 * REMOVED AT 3.662.1: `isCritOnlyDamage`. The Plant type's critical
 * sentence was read as "non-critical damage never reaches HP"; it describes
 * what a critical injury does to a plant (see dying-workflow.mjs). The
 * creature type's `critOnlyDamage` field is no longer read here; since
 * 3.663.4 it marks the type for Plant Resistance's critical filter
 * (creature-ability-rules.mjs `hasPlantResistance`), which is what it says.
 */

/**
 * Whether this actor's creature type has no Death State at all and is
 * simply destroyed at 0 HP — Construct, Elemental and Undead, all
 * three read the same way even though only two of them spell out
 * "no Death State" in so many words (Construct's own line, "When a
 * construct is reduced to 0 hit points it is destroyed," is the same
 * rule without repeating the phrase).
 */
export function hasNoDeathState(creatureTypeSystem) {
  return Boolean(creatureTypeSystem?.noDeathState);
}

/**
 * A Construct's natural damage reduction — a flat, always-adds DR value
 * a GM sets per specific creature (the book gives no formula; different
 * constructs plainly carry different DR). Returned as a plain number,
 * 0 when unset or not applicable, for the DR pool accumulation in
 * `documents/actor.mjs` to add directly — the same "read the owned
 * item's own field" style Critical Resistance already uses there for
 * Armour Master, not a compendium-baked Active Effect, since no fixed
 * value could ever be correct for every construct at once.
 */
export function naturalDR(creatureTypeSystem) {
  return Math.max(0, Number(creatureTypeSystem?.naturalDR) || 0);
}

/**
 * A creature type's fixed Critical Resistance bonus (Construct 4,
 * Elemental 2, Eternal 2; 0 for every other type). Unlike natural DR
 * this IS the same for every member of the type, so it's a plain baked
 * field rather than something a GM edits per NPC — still read directly
 * rather than routed through an Active Effect, matching how Armour
 * Master's contribution is already computed in `documents/actor.mjs`.
 */
export function criticalResistanceBonus(creatureTypeSystem) {
  return Math.max(0, Number(creatureTypeSystem?.criticalResistance) || 0);
}
