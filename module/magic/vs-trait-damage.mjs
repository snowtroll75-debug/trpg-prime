/**
 * EXTRA DAMAGE AGAINST A KIND OF CREATURE (3.595.0).
 *
 * Graham, 26 September 2026: *"Go for the two things you will build as
 * well"* — this is one of them.
 *
 * PRINTED, and measured before it was built. Exactly TWO spells in the
 * pack carry this sentence:
 *
 *   Searing Ray (page 314): "If the target is a demon or undead, you deal
 *   an extra 5d6 good damage."
 *
 *   Frostbound Shadow: "if the target is a good eternal, they also suffer
 *   an additional 5d6 evil damage."
 *
 * Both authored 5d6 of their own type and nothing else, so half of each
 * spell's damage was prose.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A SECOND PACKET, NOT A BIGGER FIRST ONE.
 *
 * The extra dice are a DIFFERENT damage type — good against a demon, evil
 * against a good eternal — and resistances, weaknesses and immunities are
 * per type. Folding 5d6 good into 5d6 fire would let a fire-resistant
 * demon halve the holy half, and an immunity to fire would swallow it
 * whole. So this is resolved as its own packet against its own type, the
 * same separation the splash comment in `resolveSpellAttack` argues for in
 * the other direction: one blow of one type is halved once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `onlyVs` IS NOT THIS, and it is the obvious wrong answer.
 *
 * `bombs.mjs` has carried `onlyVs` since the alchemy blocks and it reads
 * as a perfect match — a list of creature kinds beside a damage figure.
 * It EXCLUDES: a bomb with `onlyVs: ["undead"]` does nothing at all to
 * anybody else. These two spells harm everybody and harm two kinds more.
 * Wiring one to the other would have made Searing Ray useless against
 * every creature that is not a demon.
 */

import { ALIGNED_TRAITS } from "../aligned.mjs";
import { DAMAGE_TYPES } from "../config.mjs";

const text = (v) => String(v ?? "").trim();

/**
 * The words that name a KIND OF DAMAGE rather than a kind of source.
 *
 * The fourteen damage types plus the five aligned traits, because "good"
 * and "evil" are damage in this book (Searing Ray's extra dice are good
 * damage) and are not in `DAMAGE_TYPES`, whose aligned entry is the single
 * key `aligned`.
 */
const DAMAGE_WORDS = new Set([...Object.keys(DAMAGE_TYPES), ...ALIGNED_TRAITS]);

/**
 * A vs-trait damage declaration, or null when it is malformed.
 *
 * REFUSED RATHER THAN GUESSED, and all three parts are required: without
 * a formula there is nothing to roll, without a type the packet cannot be
 * resolved against anything, and without traits it would apply to
 * everybody — which is a bigger first packet wearing this one's clothes.
 *
 * @param {object} raw the `damage.vsTrait` block
 * @returns {{traits: string[], formula: string, type: string}|null}
 */
export function normaliseVsTraitDamage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const traits = (Array.isArray(raw.traits) ? raw.traits : [])
    .map((t) => text(t).toLowerCase())
    .filter(Boolean);
  const formula = text(raw.formula);
  const type = text(raw.type).toLowerCase();
  if (!traits.length || !formula || !type) return null;
  return { traits, formula, type };
}

/**
 * Which of the named traits this creature actually has.
 *
 * TAKES THE TEST, not the actor: the caller passes
 * `hasCreatureTrait`-style predicate so this file needs no Foundry and the
 * harness can drive every combination.
 *
 * @param {{traits: string[]}|null} spec
 * @param {(name: string) => boolean} has
 * @returns {string[]} the matching trait names, in the order printed
 */
export function vsTraitMatches(spec, has) {
  if (!spec || typeof has !== "function") return [];
  return spec.traits.filter((t) => has(t));
}

/** The line the card prints when the extra dice land. */
export function vsTraitDamageLine(targetName, matched, taken, spec, immune = false) {
  const which = matched.length > 1 ? matched.join(" and ") : (matched[0] ?? "");
  if (immune) {
    return `<em>${targetName} is <strong>immune</strong> to ${spec.type} — no extra damage `
      + `for being ${which}.</em>`;
  }
  return `<strong>${taken}</strong> extra ${spec.type} damage (${spec.formula}) &mdash; `
    + `${targetName} is <strong>${which}</strong>.`;
}

/**
 * The source traits this SECOND packet is resolved against.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 26 September 2026 (R11 of the 3.595.2 drive): go with
 * the recommendation.
 *
 * WHAT WAS MEASURED. A Skeleton Warrior resists fire. Searing Ray hit it
 * for 42 fire, halved to 21 — correct — and for 30 good, halved to **15**,
 * which is not. The cause was not the damage type: a spell's traits travel
 * with every packet as `sourceTraits`, Searing Ray carries *Fire, Good,
 * Invocation, Light*, and the skeleton's fire resistance matched the SPELL.
 *
 *   good with the spell's traits   30 -> 15
 *   good without them              30 -> 30
 *
 * THE TRAIT MATCH ITSELF IS RIGHT AND IS NOT TOUCHED. It is the rule that
 * makes a Shadow declaring `weaknesses: divine` take more from a divinity
 * spell whatever the damage type — pinned by `verify-defence-vocabulary`
 * S3 and S5, and bought by a live session on 10 September 2026.
 *
 * WHAT IS NARROWED IS THIS PACKET ONLY: a second packet whose type is
 * named separately is resolved without the spell's OTHER damage words.
 * Searing Ray prints the good dice precisely so that undead take more, and
 * a fire resistance quietly halving them cancels half the reason to cast
 * it.
 *
 * KEPT: everything that describes the SOURCE — magical, targeted, the
 * school, the tradition — and the packet's own type, so a creature weak to
 * good still takes more from the good half.
 *
 * @param {string[]} sourceTraits the spell's own traits
 * @param {string} packetType this packet's damage type
 * @returns {string[]}
 */
export function vsTraitSourceTraits(sourceTraits, packetType) {
  const own = text(packetType).toLowerCase();
  return (Array.isArray(sourceTraits) ? sourceTraits : [])
    .map((t) => text(t).toLowerCase())
    .filter(Boolean)
    .filter((t) => t === own || !DAMAGE_WORDS.has(t));
}
