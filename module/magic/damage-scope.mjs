/**
 * A SPELL WHOSE DAMAGE ONLY REACHES SOME CREATURES.
 *
 * NEW at 3.460.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUENCH IS THE CASE, AND IT WAS FOUND BY READING IT.
 *
 *   "You release a massive amount of water vapour into the air.
 *    Non-magical fires within the area are extinguished and FIRE
 *    CREATURES take 4d8 damage (basic Fortitude)."
 *
 * The pack carried the spell with no damage at all, because the ladder
 * this system has — an area, a Basic save, a formula scaled by degree —
 * would have burned everyone standing in the mist. The missing piece was
 * never the damage; it was the word "fire creatures".
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 1 September 2026: A FIRE CREATURE IS ONE IMMUNE TO
 * FIRE.
 *
 * Asked how the system should recognise one, given that there is no Fire
 * trait on creatures and no "fire" among the twelve creature types, he
 * chose the marker that is already populated: `Fire Dragon, Scaleborn`
 * carries `immunities: "fire, sleep, paralyzed"` and a cold weakness,
 * and every creature the spell is about is marked the same way.
 *
 * IT IS ASKED OF `actorDefences`, NOT OF THE RAW FIELD. That resolver
 * already folds in the immunities a creature has WITHOUT anybody typing
 * them — a Construct's essence immunity, a Mindless creature's mental
 * one, and, most relevantly here, an Elemental's immunity to its own
 * native element, which is a per-instance GM choice the book never
 * fixes. Parsing `combat.immunities` myself would have missed a fire
 * Elemental whose immunity is declared on its creature type rather than
 * typed into its sheet.
 *
 * THE RULING'S OWN EDGE, recorded rather than hidden: a creature immune
 * to fire for some other reason — a warded PC, a Construct a GM has
 * given fire immunity — is caught by this too. Graham chose the marker
 * knowing that; the alternative was adding a Fire trait to every fire
 * creature in the Codex before the spell did anything at all.
 */

import { actorDefences, ALIGNMENT_OPPOSITES } from "../creature-traits.mjs";
import { alignedTraitsOf } from "../aligned.mjs";
import { isOfKind } from "../kind-targeting.mjs";

/** The prefix the first form uses. */
const IMMUNE_PREFIX = "immune:";

/**
 * THE SECOND FORM: "creatures with an opposed aura" (3.552.4).
 *
 * GRAHAM'S RULING, 15 September 2026. Wash Away Sin prints "Allies in the
 * cone regain 1d8 HP... Creatures with an opposed aura take 1d8 essence
 * damage", and until now that whole clause was prose in a note nothing
 * read — while the cone itself was `areaTargeting: "allies"`, so the
 * damage could only ever have landed on the allies the spell exists to
 * heal. Offered three ways out, he chose this one: the cone catches
 * everyone, and the damage applies only to those with an opposed aura.
 *
 * WHAT "OPPOSED" MEANS IS ALREADY DECIDED. The Creature Codex's Aligned
 * appendix gives five aligned traits, and `creature-traits.mjs` has
 * carried ALIGNMENT_OPPOSITES since the Chapter 7 work: good <-> evil,
 * chaos <-> order. A creature is in scope when it carries the opposite of
 * something the CASTER carries — the same test `alignedDamageAffects`
 * makes for aligned damage, asked from the caster's side rather than the
 * damage type's.
 *
 * TWO CONSEQUENCES OF READING IT LITERALLY, both deliberate:
 *
 *   - A CASTER WITH NO ALIGNED TRAIT OPPOSES NOBODY, so their cast is
 *     pure healing. A Cleric's aligned trait comes from their Divine
 *     Aspect (documents/actor.mjs, prepareGrantedTraits); a caster
 *     without one has nothing for an aura to be opposed TO.
 *   - BALANCE HAS NO OPPOSITE in the table, so a Balance caster damages
 *     nobody and a Balance creature is damaged by nobody. That is the
 *     appendix as written, and if the table ever grows an entry this
 *     follows it without an edit here.
 */
const OPPOSED_AURA = "opposedaura";

/**
 * THE THIRD FORM: "creatures of these kinds" (3.609.0, block 33's R4).
 * WALL OF LIGHT: "Each undead and ooze in or moving through the curtain
 * suffers 2d8 essence damage". Two kinds, read by the same trait test the
 * kind gate uses (`isOfKind`), so a creature that has gained the undead
 * trait is reached exactly as a spell keyed at undead would reach it.
 * Written `kinds:undead,ooze`.
 */
const KINDS_PREFIX = "kinds:";

/**
 * The damage scope a spell declares, or null when its damage reaches
 * everyone the area caught.
 *
 * DECLARED ON THE PACK ENTRY, never inferred from the description. The
 * sentence "fire creatures take 4d8" is a fact about one spell; a parser
 * that went looking for it in prose would find it in spells that mean
 * something else by it.
 *
 * @param {object} spellSystem the spell's `system`
 * @returns {{immuneTo: string}|{opposedAura: true}|null}
 */
export function damageScope(spellSystem) {
  const raw = String(spellSystem?.damageScope ?? "").trim().toLowerCase();
  if (raw === OPPOSED_AURA) return { opposedAura: true };
  if (raw.startsWith(KINDS_PREFIX)) {
    const kinds = raw.slice(KINDS_PREFIX.length).split(",").map((k) => k.trim()).filter(Boolean);
    return kinds.length ? { kinds } : null;
  }
  if (!raw.startsWith(IMMUNE_PREFIX)) return null;
  const immuneTo = raw.slice(IMMUNE_PREFIX.length).trim();
  // A SCOPE THAT NAMES NOTHING IS NOT A SCOPE. Returning `{immuneTo: ""}`
  // would quietly match every creature, which is the opposite of what a
  // restriction is for — the same reason `normaliseHazard` refuses a row
  // with an empty damage type rather than defaulting one.
  return immuneTo ? { immuneTo } : null;
}

/**
 * Does this creature fall inside the spell's damage scope?
 *
 * @param {{immuneTo: string}|{opposedAura: true}|null} scope from `damageScope`
 * @param {object} targetSystem the creature's `system`
 * @param {object|null} creatureTypeSystem its creature type's system
 * @param {object|null} casterSystem the caster's `system`. Only the
 *   opposed-aura form needs it, because "opposed" is a RELATIONSHIP and
 *   not a property of the target alone.
 * @returns {boolean}
 */
export function inDamageScope(scope, targetSystem, creatureTypeSystem = null, casterSystem = null) {
  // NO SCOPE MEANS EVERYONE, so a spell that declares nothing behaves
  // exactly as it did before this file existed.
  if (!scope) return true;

  if (Array.isArray(scope.kinds)) {
    return scope.kinds.some((kind) => isOfKind(targetSystem ?? {}, kind));
  }

  if (scope.opposedAura) {
    const opposites = alignedTraitsOf(casterSystem ?? {})
      .map((trait) => ALIGNMENT_OPPOSITES[trait])
      .filter(Boolean);
    if (!opposites.length) return false;
    const theirs = new Set(alignedTraitsOf(targetSystem ?? {}));
    return opposites.some((trait) => theirs.has(trait));
  }

  // ONE ANSWER, ASKED OF THE RESOLVER. `actorDefences` always returns a
  // Set — empty for a creature with no defences at all — so the first
  // draft's `if (!immunities) return false;` and its Array fallback were
  // both unreachable. A mutation that inverted the guard SURVIVED, which
  // is the sign of a line that cannot be wrong rather than one that is
  // defended; `areaGrowthMaxTimes` lost a guard to the same test, for the
  // same reason. Deleted rather than given a check it could never fail.
  return actorDefences(targetSystem ?? {}, creatureTypeSystem)
    .immunities.has(scope.immuneTo);
}

/** What the card says about who the damage could reach. */
export function damageScopeLine(scope, sparedNames) {
  if (!scope) return "";
  const spared = Array.isArray(sparedNames) ? sparedNames.filter(Boolean) : [];
  const who = scope.opposedAura
    ? "only creatures whose aura is <strong>opposed to yours</strong>"
    : Array.isArray(scope.kinds)
      ? `only <strong>${scope.kinds.join(" and ")}</strong> creatures`
      : `only creatures immune to <strong>${scope.immuneTo}</strong>`;
  // NAMED, NOT COUNTED. "3 spared" leaves a table wondering which three,
  // and this is a spell whose whole point is that it passes most of the
  // people standing in it.
  return spared.length
    ? `Damage reaches ${who} — unharmed: ${spared.join(", ")}.`
    : `Damage reaches ${who}.`;
}
