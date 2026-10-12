/**
 * Creature traits — the traits an actor itself carries, as distinct from
 * the traits on an action, a weapon or a spell.
 *
 * This field did not exist until now, and its absence was blocking four
 * separate rules across two chapters, each of which had been audited,
 * understood and then recorded as unbuildable for the same reason:
 *
 * - MINDLESS (Appendix 3): a racial modifier to Intelligence and
 *   Charisma, and "immune to all mental effects". The printed figure is
 *   a d100 leftover; see MINDLESS_ATTRIBUTE_PENALTY below.
 * - MENTAL (Appendix 3, Chapter 7): "objects and mindless creatures are
 *   immune", and mindless creatures are "generally immune to mental
 *   damage".
 * - ESSENCE (Chapter 7): "creatures devoid of life, such as constructs,
 *   and inanimate objects are immune to the effects of Essence".
 * - ALIGNED (Chapter 7): "good damage only harms evil creatures, chaos
 *   damage affects order creatures".
 *
 * Free text rather than a fixed list, matching how every other trait
 * field in this project works and how Appendix 3 describes race traits
 * ("there are many race traits"). tools/validate-traits.mjs checks the
 * spellings.
 */
import { hasTrait, traitList } from "./traits.mjs";
import { resolveDamageTypeField, resolveImmunities, bypassMaterialsFor } from "./defences.mjs";
import { isCritImmune } from "./creature-type-rules.mjs";
import { codexTraitImmunities } from "./codex-trait-rules.mjs";

/**
 * MINDLESS: the racial modifier to Intelligence and Charisma.
 *
 * THE PRINTED FIGURES ARE BOTH WRONG, and Graham ruled why (2026-08-11):
 * the Core Rulebook prints -25 and the Creature Codex V1.4 revises it to
 * -30, and BOTH are leftovers from an old d100 engine, where a -25 to a
 * percentile score is what -5 is here. Every other racial modifier in
 * this system is a single digit; these two were the only pair that
 * weren't, which is what made them findable.
 *
 * The ruled figure is what applies. The two printed ones are recorded
 * rather than erased — the buckler's -5 and the Gloves of Vitality's +15
 * have had the same treatment.
 */
export const MINDLESS_ATTRIBUTE_PENALTY = -5;

/** What the two documents print, kept so the correction stays visible. */
export const MINDLESS_PRINTED_PENALTIES = Object.freeze({
  coreRulebook: -25,
  creatureCodex: -30
});

/** The attributes that penalty applies to. */
export const MINDLESS_PENALISED_ATTRIBUTES = Object.freeze(["intelligence", "charisma"]);

/**
 * Opposing alignment pairs (Chapter 7): "good damage only harms evil
 * creatures, chaos damage effects order creatures etc."
 *
 * Balance is the fifth aligned trait in Appendix 3 and the rulebook
 * never names its opposite, so it is deliberately absent here rather
 * than paired with a guess — Balance damage currently affects nothing
 * until Graham rules on it, and that is recorded rather than invented.
 *
 * A DIFFERENT concept from a character's chosen Ethic (config.mjs's
 * ETHICS, Chapter 8) — these four are creature/damage TRAITS, not the
 * fifteen-entry role-play alignment system a player picks from on the
 * sheet. Nothing here reads system.identity.ethics, and nothing there
 * reads this.
 */
export const ALIGNMENT_OPPOSITES = Object.freeze({
  good: "evil",
  evil: "good",
  chaos: "order",
  order: "chaos"
});

/**
 * The traits an actor carries, normalised.
 *
 * TWO FIELDS, ONE ANSWER. `details.traits` is what a GM typed and owns;
 * `details.grantedTraits` is derived, rebuilt from the actor's active effects
 * every preparation, and is how a Form spell makes a druid a Beast for ten
 * minutes (see magic/form-traits.mjs). Unioned HERE, in the one accessor every
 * rule in the project already goes through, so that a temporary trait reaches
 * the aligned damage rule, the creature-type comparison and the Mindless gate
 * without any of them being taught about spells.
 *
 * The derived field is never written to the sheet, for the same reason
 * `derivedImmunities` below is returned separately: a caster who opened their
 * character sheet mid-form and saved it would otherwise make "beast" permanent.
 */
export function creatureTraits(actorSystem) {
  return [...new Set([
    ...traitList(actorSystem?.details?.traits),
    // THE TYPE IMPLIES THE TRAIT. Graham, 15 Aug 2026: an Aberration-type
    // creature carries the aberration trait, so that a spell keyed at its kind
    // reaches it without anybody remembering to type the word twice. Every
    // shipped statblock DOES type it twice today — the Aboleth's trait line
    // reads "Aberration, Huge" — which is why nothing looked broken and why
    // the duplication is now harmless rather than load-bearing.
    //
    // This direction only. A trait never implies a type: that is what let a
    // polymorphed druid claim a Beast's control level gap.
    ...traitList(actorSystem?.details?.creatureType),
    ...traitList(actorSystem?.details?.grantedTraits)
  ])];
}

/** Whether an actor carries a given creature trait. */
export function hasCreatureTrait(actorSystem, name) {
  // Via creatureTraits rather than a second hasTrait on the raw field, so a
  // granted trait can never be visible to one of these two and not the other.
  // Synonyms still resolve: hasTrait is asked the joined, normalised list.
  return hasTrait(creatureTraits(actorSystem).join(", "), name);
}

/** Mindless creatures have "either programmed or rudimentary mental attributes". */
export function isMindless(actorSystem) {
  return hasCreatureTrait(actorSystem, "mindless");
}

/** Constructs are "devoid of life" for the purposes of Essence. */
export function isConstruct(actorSystem) {
  return hasCreatureTrait(actorSystem, "construct");
}

/**
 * Damage types an actor is immune to purely by virtue of what it is,
 * before anything typed into its own immunities field.
 *
 * Returned separately rather than written into that field so the sheet
 * keeps showing what a GM actually entered, and a derived immunity can
 * never be accidentally edited away.
 *
 * @param {object} actorSystem
 * @returns {string[]}
 */
export function derivedImmunities(actorSystem) {
  return derivedImmunitySets(actorSystem).damageTypes;
}

/**
 * The same thing across all three vocabularies.
 *
 * A creature's nature grants more than damage immunity: Chapter 7 says a
 * Mindless creature is immune to mental *damage*, and the trait gate has
 * separately always refused Mental-traited effects against it. Those were
 * two hard-coded rules in two files that happened to agree; they are one
 * declaration now, so a third consumer cannot be added that honours only
 * half of it.
 *
 * @param {object} actorSystem
 * @param {object|null} [creatureTypeSystem] The `system` data of the
 *   actor's owned "creature-type" item (see creature-type-rules.mjs),
 *   already extracted by the caller — this function stays a plain object
 *   reader, never a live Actor lookup, matching its own design.
 * @returns {{damageTypes: string[], conditions: string[], traits: string[]}}
 */
export function derivedImmunitySets(actorSystem, creatureTypeSystem = null) {
  const damageTypes = [];
  const conditions = [];
  const traits = [];

  // Chapter 7: mindless creatures are "generally immune to mental damage",
  // and by the same token to anything carrying the Mental trait.
  if (isMindless(actorSystem)) {
    damageTypes.push("mental");
    traits.push("mental");
  }

  // Chapter 7: constructs are immune to the effects of Essence.
  if (isConstruct(actorSystem)) {
    damageTypes.push("essence");
    traits.push("essence");
  }

  // Creature Type (Creature Codex): Ooze — "immune to... criticals."
  // "critical" is not a damage type, condition or trait anywhere in this
  // system's vocabulary, so it is pushed straight into damageTypes rather
  // than resolved through classifyDefence — an opaque token the immunity
  // Set carries purely for attack-workflow.mjs's own `.has("critical")`
  // check to read back, the same bypass isMindless/isConstruct already
  // use above for mental/essence.
  if (isCritImmune(creatureTypeSystem)) {
    damageTypes.push("critical");
  }

  // Creature Type: Elemental — "immune to their native elemental type."
  // A per-instance GM choice (the book never fixes which element a given
  // Elemental favours), so it is read straight off the owned item rather
  // than baked into a compendium effect.
  const elementalImmunity = String(creatureTypeSystem?.elementalImmunity ?? "")
    .trim()
    .toLowerCase();
  if (elementalImmunity) damageTypes.push(elementalImmunity);

  // Creature Codex Chapter 3: Incorporeal and Swarm. Asked here rather
  // than added as a fourth branch above, because the two books' rules
  // should not interleave in one function — but merged into the SAME
  // sets, so every consumer that already honours a Mindless creature's
  // immunity honours these without being told about them.
  const codex = codexTraitImmunities(actorSystem);
  damageTypes.push(...codex.damageTypes);
  conditions.push(...codex.conditions);
  traits.push(...codex.traits);

  return {
    damageTypes: [...new Set(damageTypes)],
    conditions: [...new Set(conditions)],
    traits: [...new Set(traits)]
  };
}

/**
 * The racial penalty a Mindless creature takes to a given attribute.
 *
 * @param {object} actorSystem
 * @param {string} attributeKey
 * @returns {number} 0 when it doesn't apply.
 */
export function mindlessAttributePenalty(actorSystem, attributeKey) {
  if (!isMindless(actorSystem)) return 0;
  return MINDLESS_PENALISED_ATTRIBUTES.includes(attributeKey)
    ? MINDLESS_ATTRIBUTE_PENALTY
    : 0;
}

/**
 * Whether aligned damage of a given alignment harms this creature.
 *
 * "Such damage only affects creatures of the opposing trait" — so Good
 * damage harms an Evil creature and nothing else. A creature carrying no
 * alignment trait at all is unaffected, which is the rule read
 * literally: there is no opposing trait for the damage to key against.
 *
 * @param {string} damageAlignment One of the aligned traits.
 * @param {object} targetSystem
 * @returns {boolean}
 */
export function alignedDamageAffects(damageAlignment, targetSystem) {
  const alignment = String(damageAlignment ?? "").trim().toLowerCase();
  const opposite = ALIGNMENT_OPPOSITES[alignment];
  if (!opposite) return false;
  return hasCreatureTrait(targetSystem, opposite);
}

/**
 * MENTAL (Chapter 7): "Armoured targets with no head armour cannot use
 * armour bonuses to DB against mental attacks."
 *
 * A defence rule rather than a reduction one — it suppresses armour's
 * contribution to Defence, not its Damage Reduction, which is handled
 * separately by the damage type's own DR mode.
 *
 * @param {string} damageType The incoming attack's damage type.
 * @param {boolean} hasHeadArmour Whether any equipped armour covers the head.
 * @returns {boolean} True when armour's DB bonus should be ignored.
 */
export function armourDBSuppressedByMental(damageType, hasHeadArmour) {
  return String(damageType ?? "").trim().toLowerCase() === "mental" && !hasHeadArmour;
}

/**
 * Everything the damage pipeline and the effect gates need to know about
 * a target's defences, resolved once from the actor's own fields plus
 * whatever its nature confers.
 *
 * A single accessor on purpose. Resistance, immunity and weakness were
 * previously parsed by a module-private splitter inside the weapon
 * workflow, which is why every other damage path in the system — spells,
 * Bleeding, Recurring Damage, the manual Apply Damage dialog — ignored
 * them completely. Anything that deals damage can reach this.
 *
 * @param {object} actorSystem
 * @param {object|null} [creatureTypeSystem] As derivedImmunitySets — the
 *   owned creature-type item's `system` data, if any.
 */
export function actorDefences(actorSystem, creatureTypeSystem = null) {
  const immune = resolveImmunities(
    actorSystem,
    derivedImmunitySets(actorSystem, creatureTypeSystem)
  );
  const weaknessField = resolveDamageTypeField(actorSystem?.combat?.weaknesses);
  const resistanceField = resolveDamageTypeField(actorSystem?.combat?.resistances);
  const weaknesses = weaknessField.damageTypes;

  // Creature Type: Elemental — "often have a weakness to another elemental
  // type." Also a per-instance GM choice, folded in the same way as the
  // immunity above rather than a fixed pairing this project would have to
  // invent (the book never fixes one).
  const elementalWeakness = String(creatureTypeSystem?.elementalWeakness ?? "")
    .trim()
    .toLowerCase();
  if (elementalWeakness) weaknesses.add(elementalWeakness);

  return {
    resistances: resistanceField.damageTypes,
    // Categories describe the SOURCE (mundane / magic) and materials the
    // WEAPON (cold iron / silver / adamantine) — see defences.mjs. Kept
    // apart from the typed sets so no consumer has to know that "mundane"
    // is not a damage type.
    resistanceCategories: resistanceField.categories ?? new Set(),
    // A MATERIAL NAMED IN BRACKETS OVERCOMES THE RESISTANCE (3.547.1):
    // "mundane (silver)" is mundane resistance a silver weapon ignores.
    resistanceBypassMaterials: bypassMaterialsFor(actorSystem?.combat?.resistances),
    weaknessMaterials: weaknessField.materials ?? new Set(),
    /*
     * WHAT THE INCOMING EFFECT WAS (3.548.0).
     *
     * `sources` are area / targeted — Graham's rulings of 10 Sep 2026 —
     * and `traits` are the effect's own traits, which is how a weakness
     * to `divinity` ("any damage that results from a divinity spell")
     * finds its match. Both are facts about the attack, and both reach
     * the packet through the door `magical` and `material` opened at
     * 3.547.0.
     */
    resistanceSources: resistanceField.sources ?? new Set(),
    weaknessSources: weaknessField.sources ?? new Set(),
    resistanceTraits: resistanceField.traits ?? new Set(),
    weaknessTraits: weaknessField.traits ?? new Set(),
    // "all damage except essence or force" — the types the blanket
    // resistance does NOT cover. Empty for every creature that does not
    // write the longhand.
    resistanceExcept: resistanceField.except ?? new Set(),
    weaknesses,
    immunities: immune.damageTypes,
    immuneTraits: immune.traits,
    immuneConditions: immune.conditions,
    // Words that resolve, apply no mechanism, and print instead — see
    // PRINTED_DEFENCES. Carried so the sheet can state them, rather than
    // leaving a real immunity looking like an unrecognised one.
    printedDefences: [...(immune.printed ?? []),
      ...(resistanceField.printed ?? []), ...(weaknessField.printed ?? [])],
    // Numbers typed into a field that halves rather than subtracts, so a
    // GM who writes "fire 5" is told the 5 did nothing.
    ignoredValues: [...(immune.ignoredValues ?? []),
      ...(resistanceField.ignoredValues ?? []), ...(weaknessField.ignoredValues ?? [])],
    /*
     * EVERY FIELD'S LEFTOVERS, NOT JUST THE IMMUNITIES' (3.547.0).
     *
     * `resolveDamageTypeField` has always computed `unresolved` for the
     * resistance and weakness fields — under a comment promising that a
     * dropped entry is "reported alongside the entries that matched
     * nothing at all, so neither kind is silent" — and this function
     * threw both away, keeping only the immunity list. So two thirds of
     * the promise was never kept.
     *
     * Measured across the 294 Fiends & Fables creatures: 24 declare a
     * `cold iron` weakness, 20 a `mundane` resistance, 14 `adamantine`,
     * 12 `silver`, 11 `magic` — every one of them discarded in silence,
     * which is why a creature that reads as weak to cold iron on its
     * sheet is not.
     */
    unresolved: [...immune.unresolved, ...resistanceField.unresolved,
      ...weaknessField.unresolved],
    unresolvedByField: {
      immunities: immune.unresolved,
      resistances: resistanceField.unresolved,
      weaknesses: weaknessField.unresolved
    }
  };
}
