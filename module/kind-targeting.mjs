/**
 * What a spell keyed at a kind of creature may reach.
 *
 * THE POINT OF A CREATURE TRAIT. Graham, 15 Aug 2026, defining the three
 * objects this system keeps apart:
 *
 *   "A creature trait is used to determine if certain effects and spells affect
 *    a character. They provide no mechanical modifiers. So if a character gains
 *    the animal trait (through a feat or spell) they will be affected by
 *    anything that is keyed towards an animal (such as charm animal for
 *    example). Also spells such as charm kind and hold kind will only affect
 *    creatures of your type."
 *
 * Until now nothing in the project read a trait for that purpose. Charm Animal,
 * Hold Animal, Charm Undead, Charm Kind and Hold Kind all shipped with no gate
 * at all: every one of them would charm a rock. 3.314.0 then made Form spells
 * grant the traits, which gave the traits a source and still nothing that read
 * them. This module is the reader.
 *
 * TWO KINDS OF GATE, because the book asks two different questions:
 *
 *   - A NAMED kind — "a creature of the animal type" (Charm Animal). Satisfied
 *     by the trait OR by the type, which is exactly Graham's example: a
 *     character who GAINS the animal trait is affected by Charm Animal, without
 *     having become an Animal.
 *   - THE CASTER'S OWN kind — "only affect creatures of your type" (Charm
 *     Kind, Hold Kind). Same test, asked of whatever kind the caster is.
 *
 * WHY THIS READS TRAITS AND `creatureTypesOf` DOES NOT. They answer different
 * questions and the difference is the whole design. `creatureTypesOf` asks what
 * a creature IS, and feeds a mechanical modifier (the aligned-control level
 * gap), so it may only read the type. This asks what a spell may REACH, which
 * is the one job a trait has. A polymorphed druid is therefore still Humanoid
 * for the control rule and still catchable by Charm Animal — which is the
 * behaviour the two definitions describe, even though the two functions look
 * contradictory sitting next to each other.
 */
import { creatureTraits } from "./creature-traits.mjs";
import { alignmentChannelReaches } from "./magic/alignment-channel.mjs";

/** The gate value meaning "whatever the caster is". */
export const SAME_KIND = "same";

/**
 * The gate value meaning "a LIVING creature" (3.609.0, block 33's R1).
 *
 * WAIL OF THE BANSHEE: "Each living foe suffers 8d10 essence damage".
 * Phantasmal Killer and Touch Of Undeath print "Targets 1 living
 * creature". Nothing marks a creature as living; two of the twelve
 * creature types mark one as NOT — undead and construct — so living is
 * "neither of those", asked of the same trait list every other gate reads.
 * A player character with no creature type recorded is living, which is
 * what every player character is.
 */
export const LIVING_KIND = "living";
/*
 * AND "UNLIVING" (3.627.0). Pillars of Faith's Unliving player characters
 * carry the Unliving trait rather than the Undead type ("These options
 * deliberately distinguish an Unliving player character from a creature
 * possessing the full Undead type"), and they are no more living for it: a
 * ghoul's stench that catches "living creatures" does not catch its Unliving
 * companion, and Hunger Beyond Pain does not feed on one. Only that module
 * registers the trait, so nothing in the core changes.
 */
const NON_LIVING_KINDS = Object.freeze(["undead", "construct", "unliving"]);

/** Is this creature living — neither undead, construct nor Unliving? (3.627.0) */
export function isLivingCreature(actorSystem) {
  return !NON_LIVING_KINDS.some((kind) => isOfKind(actorSystem, kind));
}

/**
 * Is this creature of the named kind, for the purpose of being targeted?
 *
 * `creatureTraits` already unions the typed trait line, the type-implied trait
 * and anything an active effect is granting, so asking it is asking all three
 * at once — and a Form spell's grant is reachable here the moment it lands.
 *
 * @param {object} actorSystem
 * @param {string} kind
 * @returns {boolean}
 */
export function isOfKind(actorSystem, kind) {
  const wanted = String(kind ?? "").trim().toLowerCase();
  // No `if (!wanted) return false` guard. It was here, and it was a DUPLICATE:
  // `traitList` drops empty entries, so an empty kind can never be in the list
  // and the lookup already answers false. Two copies of one guarantee mask each
  // other — removing either changes nothing and tells you nothing — which is
  // exactly what thrown-weapons.mjs found with its doubled quantity clamp. The
  // guard was the duplicate, so the guard went; C7 now tests the real reason.
  return creatureTraits(actorSystem).includes(wanted);
}

/**
 * The kind a "creatures of your type" spell is keyed at when this actor casts
 * it.
 *
 * THE CASTER'S TYPE, not their traits — the sentence says "your type", and a
 * caster who is Humanoid and carrying a borrowed animal trait should not be
 * able to charm animals with Charm Kind. That the same caster can be CAUGHT by
 * Charm Animal is not a contradiction: being reachable and being able to reach
 * are the two different questions this file and `creatureTypesOf` split.
 *
 * @param {object} actorSystem
 * @returns {string} The caster's own type, or "" if they have none recorded.
 */
export function ownKind(actorSystem) {
  return String(actorSystem?.details?.creatureType ?? "").trim().toLowerCase();
}

/**
 * May this spell affect this target?
 *
 * Returns a REASON rather than a bare false, because every refusal in this
 * system that only said "no" has eventually been reported as the feature not
 * working — the Attack of Opportunity silence of 14 Aug 2026 being the most
 * expensive example. A gate that explains itself is a gate nobody files a bug
 * against.
 *
 * @param {object} casterSystem
 * @param {object} targetSystem
 * @param {string} gate A kind name, SAME_KIND, or "" for no gate.
 * @param {string} targetName For the reason text.
 * @returns {{allowed: boolean, reason: string, kind: string}}
 */
export function kindGateResult(casterSystem, targetSystem, gate, targetName = "The target", { featNames = [], beneficial = false } = {}) {
  const raw = String(gate ?? "").trim().toLowerCase();
  if (!raw) return { allowed: true, reason: "", kind: "" };

  if (raw === SAME_KIND) {
    const mine = ownKind(casterSystem);
    // NO TYPE, NO SPELL, and said out loud. A player character carries no
    // creature-type item unless a GM adds one, so this will be the common
    // answer for a PC — which is a gap in the character, not in the spell, and
    // the reason text is what makes that obvious instead of mystifying.
    if (!mine) {
      return {
        allowed: false, kind: "",
        reason: "you have no creature type recorded, so there is no kind for this spell to key on — add a Creature Type to your sheet."
      };
    }
    return isOfKind(targetSystem, mine)
      ? { allowed: true, reason: "", kind: mine }
      : { allowed: false, kind: mine, reason: `${targetName} is not ${article(mine)} ${mine}, and this spell only affects creatures of your own kind.` };
  }

  if (raw === LIVING_KIND) {
    const dead = NON_LIVING_KINDS.find((kind) => isOfKind(targetSystem, kind)) ?? null;
    return dead
      ? { allowed: false, kind: raw, reason: `${targetName} is not a living creature (${dead}).` }
      : { allowed: true, reason: "", kind: raw };
  }

  if (isOfKind(targetSystem, raw)) return { allowed: true, reason: "", kind: raw };

  // ALIGNMENT CHANNEL (Chapter 5, Cleric) widens one gate and only one:
  // an undead-keyed harmful spell also reaches an Eternal with the evil
  // trait. Asked HERE, once the ordinary answer is known to be no, so the
  // feat can only ever ADD a target — never remove one, never re-explain
  // one, and a Cleric without it reads exactly the refusal they always
  // did.
  if (alignmentChannelReaches({ featNames, gate: raw, targetSystem, beneficial })) {
    return { allowed: true, reason: "", kind: raw, widenedBy: "Alignment Channel" };
  }

  return { allowed: false, kind: raw, reason: `${targetName} is not ${article(raw)} ${raw}.` };
}

/** "an aberration", "a beast" — cosmetic, but the refusal is read by a player. */
function article(word) {
  return /^[aeiou]/i.test(String(word ?? "")) ? "an" : "a";
}
