/**
 * The three substantial Creature Codex traits.
 *
 * Aquatic and Elemental are definitions a GM applies; Aura has had its
 * own machinery since 3.255.0. These three carry real mechanics, and all
 * three had none.
 *
 *   INCORPOREAL  immune to non-magical attack forms and to precision
 *                damage; resistant to every damage type EXCEPT force;
 *                passes through solid objects.
 *   SWARM        immune to criticals, precision damage, mental effects
 *                and reactions provoked by movement; Resistance to
 *                targeted attacks; Weakness to area effects; halves the
 *                target's DR when it deals damage.
 *   SPAWN        Injured 2 until it feeds; saves against control from
 *                its creator are treated ONE DEGREE WORSE; lost only if
 *                the creator releases it or is destroyed.
 *
 * TWO KINDS OF RULE LIVE HERE, and the difference is the point.
 *
 * The DEFENCES join `derivedImmunitySets`, which the attack pipeline
 * already reads — so they are enforced the moment this ships, by the
 * same code that already enforces an Ooze's critical immunity.
 *
 * The RESISTANCES, WEAKNESSES and the DR halving are RETURNED, not
 * applied. Each depends on a fact about the incoming attack that the
 * defender's own data cannot answer — was this a targeted attack or an
 * area effect, is this weapon magical — and this system's convention is
 * that a fact only a person holds is asked for rather than assumed.
 * Returning them as data lets the sheet state them and a later pipeline
 * consume them without either inventing an answer now.
 *
 * Pure and Foundry-free.
 */

import { hasCreatureTrait } from "./creature-traits.mjs";
import { DEGREE_ORDER } from "./creature-activation.mjs";

export function isIncorporeal(actorSystem) { return hasCreatureTrait(actorSystem, "incorporeal"); }

/**
 * A CREATURE ABILITY THAT IS A TRAIT (3.618.1; F1 of the 3.618.0 drive, Graham's
 * Q1 — "your recommendation").
 *
 * Several Fiends & Fables incorporeal creatures — the Human Ghost, the Wraith,
 * the Shade Stalker — carry incorporeality as an "Incorporeal" ability item
 * ("uses the incorporeal creature rules") with their trait line blank, so no
 * rule keyed on the trait reached them: not Ghost Touch, not the immunity to
 * non-magical attack forms. An owned ability of that name now grants the trait,
 * through the same derived field a Form spell's trait rides on.
 *
 * Incorporeal only, the one the ruling covers.
 */
const ABILITY_GRANTED_TRAITS = Object.freeze(["incorporeal"]);

/**
 * The traits an actor's ability items grant.
 * @param {Array} items the actor's items
 * @returns {string[]}
 */
export function abilityGrantedTraits(items = []) {
  const out = new Set();
  for (const item of items ?? []) {
    if (item?.type !== "ability") continue;
    const name = String(item?.name ?? "").trim().toLowerCase();
    if (ABILITY_GRANTED_TRAITS.includes(name)) out.add(name);
  }
  return [...out];
}
export function isSwarm(actorSystem) { return hasCreatureTrait(actorSystem, "swarm"); }
export function isSpawn(actorSystem) { return hasCreatureTrait(actorSystem, "spawn"); }

/**
 * The one damage type Incorporeal does NOT resist.
 *
 * Named once. "Resistance to all damage types except force" written as a
 * list would be a list that goes stale the day a damage type is added,
 * and silently: the new type would simply not be resisted and nothing
 * would say why.
 */
export const INCORPOREAL_EXCEPTION = "force";

/**
 * Opaque immunity tokens.
 *
 * "Precision", "non-magical" and "reactions provoked by movement" are
 * none of them damage types, conditions or traits in this system's
 * vocabulary. They ride in the damageTypes list as bare tokens for a
 * consumer to read back — exactly the bypass the Ooze's "critical"
 * already uses, and named here so a fourth one cannot be spelled
 * differently by accident.
 *
 * MOVED TO `defences.mjs` AT 3.548.0 and re-exported here. A GM may TYPE
 * these words into an immunities field as well as inherit them from a
 * trait, and until that move the two halves used different vocabularies:
 * this file pushed the token "critical", while a field entry reading
 * "critical hits" matched nothing and was reported as a typo on ten
 * swarms. One list, so the two spellings cannot drift apart again.
 */
export { IMMUNITY_TOKENS } from "./defences.mjs";
import { IMMUNITY_TOKENS } from "./defences.mjs";

/**
 * Everything a Codex trait makes this creature immune to.
 *
 * Shaped exactly like derivedImmunitySets' return so it can be merged
 * rather than special-cased at the call site.
 */
export function codexTraitImmunities(actorSystem) {
  const damageTypes = [];
  const traits = [];

  if (isIncorporeal(actorSystem)) {
    // "immune to non-magical attack forms ... also immune to precision
    // damage".
    damageTypes.push(IMMUNITY_TOKENS.nonMagical, IMMUNITY_TOKENS.precision);
  }

  if (isSwarm(actorSystem)) {
    // "immune to critical hits, precision damage, mental effects, and any
    // reaction provoked by movement".
    damageTypes.push(
      IMMUNITY_TOKENS.critical, IMMUNITY_TOKENS.precision,
      IMMUNITY_TOKENS.movementReaction, "mental"
    );
    // Mental as a TRAIT too, so a Mental-traited effect is refused and
    // not merely its damage — the distinction Mindless already records.
    traits.push("mental");
  }

  return { damageTypes: [...new Set(damageTypes)], conditions: [], traits };
}

/**
 * What a Codex trait resists and what it is weak to, as data.
 *
 * `appliesWhen` is the question a person must answer before the entry
 * bites. It is carried as the book's own wording rather than a predicate
 * because none of these can be decided from the defender's sheet: whether
 * a blow came from a magical weapon, whether an effect was targeted or an
 * area, are facts about the attack.
 */
export function codexTraitDefenceNotes(actorSystem) {
  const notes = [];

  if (isIncorporeal(actorSystem)) {
    notes.push({
      trait: "Incorporeal",
      kind: "resistance",
      appliesWhen: `any damage type except ${INCORPOREAL_EXCEPTION}`,
      text: "Resistance to all damage types except force."
    });
    notes.push({
      trait: "Incorporeal",
      kind: "immunity",
      appliesWhen: "the attack form is non-magical",
      text: "Immune to non-magical attack forms."
    });
    notes.push({
      trait: "Incorporeal",
      kind: "movement",
      appliesWhen: "always — the GM's, not the canvas's",
      // Foundry walls do not know about this, and making them would be a
      // canvas feature rather than a rule. Said plainly instead of being
      // half-built.
      text: "Passes through solid objects; moves through walls and doors as if they were not there."
    });
  }

  if (isSwarm(actorSystem)) {
    notes.push({
      trait: "Swarm",
      kind: "resistance",
      appliesWhen: "the damage came from a targeted attack — one requiring an attack roll against the swarm's DB",
      text: "Resistance to targeted attacks. Does not apply to effects the swarm saves against."
    });
    notes.push({
      trait: "Swarm",
      kind: "weakness",
      appliesWhen: "the damage came from an area effect — a cone, line, burst, emanation, cloud or zone",
      text: "Weakness to area effects."
    });
    notes.push({
      trait: "Swarm",
      kind: "offence",
      appliesWhen: "the swarm deals damage",
      text: "The target's DR counts as half, applied before armour absorbs anything."
    });
  }

  if (isSpawn(actorSystem)) {
    notes.push({
      trait: "Spawn",
      kind: "condition",
      appliesWhen: "on first becoming a Spawn, and every 72 hours it does not feed",
      text: "Injured 2 until it feeds on a creature of at least half its Effective Level."
    });
    notes.push({
      trait: "Spawn",
      kind: "vulnerability",
      appliesWhen: "a control effect originating from its own creator",
      text: "Saving throws against control from its creator are treated one degree worse."
    });
    notes.push({
      trait: "Spawn",
      kind: "removal",
      appliesWhen: "always",
      text: "Lost only if the creator releases them or is destroyed."
    });
  }

  return notes;
}

/**
 * A result one degree worse.
 *
 * THE FIRST RULE IN EITHER BOOK THAT MOVES A RESULT ALONG THE LADDER
 * rather than modifying the roll, and the reason it is written once,
 * here, rather than inside Spawn: the shape will recur, and two copies
 * of a ladder walk would drift the day an eighth degree appears.
 *
 * DEGREE_ORDER runs best to worst — heroic, critical, success, partial,
 * failure, fumble, blunder — so "worse" is one step FORWARD in it. The
 * page's own example is the check: "a success becomes a partial, a
 * failure becomes a fumble".
 *
 * A blunder cannot get worse; there is nothing past it, and inventing a
 * step would be inventing a degree.
 */
export function worsenDegree(degree, steps = 1) {
  const index = DEGREE_ORDER.indexOf(String(degree ?? "").trim().toLowerCase());
  if (index < 0) return null;
  const by = Number(steps);
  if (!Number.isFinite(by) || by <= 0) return DEGREE_ORDER[index];
  return DEGREE_ORDER[Math.min(DEGREE_ORDER.length - 1, index + Math.floor(by))];
}

/**
 * A Spawn's save against control, after its Control Vulnerability.
 *
 * ONLY FROM ITS CREATOR. "an effect that grants direct control ...
 * ORIGINATING FROM ITS CREATOR" — a passing necromancer's command does
 * not get the bonus, and reading the clause loosely would make every
 * Spawn trivially controllable by anyone, which is the opposite of a
 * rule about a bond to one being.
 *
 * Both facts are the caller's: whether the effect grants control, and
 * whether it came from the creator. Neither can be read off the Spawn.
 *
 * @param {object} actorSystem
 * @param {string} degree The degree rolled.
 * @param {object} context {grantsControl, fromCreator}
 */
export function spawnControlDegree(actorSystem, degree, context = {}) {
  if (!isSpawn(actorSystem)) return degree;
  if (!context.grantsControl || !context.fromCreator) return degree;
  return worsenDegree(degree) ?? degree;
}

/** "treats the target's DR as half its normal value" — the Swarm's attack. */
export function swarmReducedDR(dr) {
  const value = Number(dr);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value / 2);
}

/**
 * The Injured value a creature takes on becoming a Spawn.
 *
 * V1.5's figure. V1.4 printed 10 — one of the six corrections that
 * arrived with the new chapter — and it is recorded rather than erased,
 * the same treatment the Mindless penalty got.
 */
export const SPAWN_INJURED = 2;
export const SPAWN_INJURED_PRINTED = Object.freeze({ v1_4: 10, v1_5: 2 });

/** "at least half that of the Spawn" — the EL a meal must reach. */
export function spawnFeedingLevel(effectiveLevel) {
  const el = Number(effectiveLevel);
  if (!Number.isFinite(el) || el <= 0) return 0;
  return Math.ceil(el / 2);
}
