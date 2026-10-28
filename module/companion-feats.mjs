/**
 * The Companion feats — the pure half.
 *
 * Nineteen feats carry the Companion trait (not eighteen, as the first
 * pass through the document counted). Most are ordinary content that
 * needs no code — Trampler grants an ability through the existing
 * `grantedAbilities` field, Master Tracker is an authored conditional —
 * and what lands here is the handful with real arithmetic behind them.
 *
 * THE TWO LADDERS. Natural Defence and Tough Hide each print four
 * tiers, and each tier's text says the bonus "increases by +1 taking it
 * to a total of +2 / +3 / +4". That total is the whole value, not an
 * increment to be summed: owning Improved is +2, NOT base +1 plus
 * another +1. So the rule is HIGHEST TIER OWNED WINS.
 *
 * The printed prerequisites name only a character level, never the tier
 * below — so nothing stops a companion taking Natural Defence, Master
 * at 12th without ever having taken the base feat. Graham's ruling
 * (2026-08-09): that is fine, and the value is simply what the best
 * owned tier says. The alternative — writing the missing chain into
 * each feat's prerequisites — would be inventing text the book does not
 * print, which this project does not do.
 *
 * WHICH DR TOUGH HIDE RAISES. The BASE value, not the flat one
 * (Graham's ruling). A companion's own printed DR is a base value that
 * scales with BDB through Chapter 7's multiplier, and Tough Hide raises
 * that same base, so it scales too. The alternative was not merely
 * different but useless: `naturalArmourDR` takes the BETTER of flat and
 * scaled-base rather than their sum, so a flat +1 on a creature whose
 * base already scales would be completely swallowed from 6th level
 * onward — a four-tier feat ladder that quietly stopped doing anything
 * halfway up. Worth recording as the reason, because "flat" is the more
 * obvious reading of "increased by 1" and it is the wrong one.
 */

import { SIZE_STEPS, canIncreaseSize, sizeStepUp } from "./companion.mjs";

/** Natural Defence: a Dodge bonus to DB. Highest tier owned wins. */
export const NATURAL_DEFENCE_LADDER = Object.freeze([
  { name: "Natural Defence", value: 1 },
  { name: "Natural Defence, Improved", value: 2 },
  { name: "Natural Defence, Master", value: 3 },
  { name: "Natural Defence, Supremacy", value: 4 }
]);

/** Tough Hide: an increase to BASE natural DR. Highest tier owned wins. */
export const TOUGH_HIDE_LADDER = Object.freeze([
  { name: "Tough Hide", value: 1 },
  { name: "Tough Hide, Improved", value: 2 },
  { name: "Tough Hide, Master", value: 3 },
  { name: "Tough Hide, Supremacy", value: 4 }
]);

/** The repeatable one. */
export const INCREASE_SIZE = "Increase Size";

/**
 * Companion feats with no computable effect, and the reminder each one
 * prints instead.
 *
 * Recorded rather than silently omitted, the same way Blade Ally's runes
 * and Arcane Bond's spell adder are. A feat that does nothing and says
 * nothing is indistinguishable from one that is broken.
 */
export const COMPANION_FEAT_NOTES = Object.freeze({
  "Animal Ability": "Choose an ability available to your companion's own animal type — the printed example is a lynx's climb speed for a Cat companion. What a given species can offer is the GM's call, so the choice is recorded here rather than picked from a list this pack does not have.",
  "Converse with Master": "Your companion understands you completely and can convey basic information about what it has perceived. How much that helps is GM discretion; nothing on the sheet changes.",
  Mount: "Your companion can carry a rider at least one size smaller than itself. While you are mounted, Command an Animal is 0 AP — this system tracks no mounted state, so apply that yourself."
});

function normalise(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * The value of a ladder, given the feats an actor owns.
 *
 * Highest tier owned, NOT the sum. Returns 0 when none is owned.
 *
 * @param {string[]} ownedNames Every feat name on the actor.
 * @param {ReadonlyArray<{name: string, value: number}>} ladder
 */
export function ladderValue(ownedNames = [], ladder = []) {
  const owned = new Set((ownedNames ?? []).map(normalise));
  let best = 0;
  for (const tier of ladder) {
    if (owned.has(normalise(tier.name)) && tier.value > best) best = tier.value;
  }
  return best;
}

/** Natural Defence's Dodge bonus to DB. */
export function naturalDefenceBonus(ownedNames = []) {
  return ladderValue(ownedNames, NATURAL_DEFENCE_LADDER);
}

/** Tough Hide's increase to BASE natural DR. */
export function toughHideBonus(ownedNames = []) {
  return ladderValue(ownedNames, TOUGH_HIDE_LADDER);
}

/**
 * How many times Increase Size has been taken.
 *
 * "This feat may be taken multiple times if applicable", so unlike every
 * other picker in this system a second copy is legitimate and each one
 * is a step. Counted rather than deduplicated.
 */
export function increaseSizePicks(ownedNames = []) {
  return (ownedNames ?? []).filter((n) => normalise(n) === normalise(INCREASE_SIZE)).length;
}

/**
 * The size a companion has actually reached, given its picks.
 *
 * Clamped at the creature's own maximum however many times the feat is
 * taken — the printed cap, enforced rather than trusted. Returns the
 * starting size unchanged when either size is unrecognised, for the same
 * refuse-before-coercion reason `canIncreaseSize` does (lesson 18).
 */
export function sizeAfterPicks(startingSize, maximumSize, picks = 0) {
  if (SIZE_STEPS.indexOf(normalise(startingSize)) < 0) return null;
  let size = normalise(startingSize);
  const wanted = Math.max(0, Math.floor(Number(picks) || 0));
  for (let step = 0; step < wanted; step += 1) {
    if (!canIncreaseSize(size, maximumSize)) break;
    size = sizeStepUp(size);
  }
  return size;
}

/**
 * How many further Increase Size picks would still do anything.
 *
 * For the feat's own Use button, so it can refuse with a reason rather
 * than appearing to work and changing nothing — a Horse starts at its
 * maximum and can never take this feat at all.
 */
export function remainingSizeSteps(currentSize, maximumSize) {
  const current = SIZE_STEPS.indexOf(normalise(currentSize));
  const maximum = SIZE_STEPS.indexOf(normalise(maximumSize));
  if (current < 0 || maximum < 0) return 0;
  return Math.max(0, maximum - current);
}

/**
 * The size a companion is actually at, from its own picks.
 *
 * DERIVED, NOT STORED, and not a button either. A companion's size
 * arrives as an ActiveEffect from its base creature
 * (`system.identity.size`), so a Use button writing the field would be
 * overwritten on the next preparation, and an effect on the feat cannot
 * express "one step from wherever this species starts" — the answer
 * depends on the creature, and the feat is repeatable.
 *
 * Deriving it means taking the feat IS the size change: nothing to press,
 * nothing to forget, and a companion whose feat is later removed shrinks
 * back rather than keeping a size it can no longer justify.
 *
 * Returns null when the starting size is unknown, so the caller can
 * leave whatever the effect set alone rather than coercing a companion
 * to Medium (lesson 18).
 */
export function companionCurrentSize({ startingSize, maximumSize, featNames = [], grownSize = "" } = {}) {
  const picked = sizeAfterPicks(startingSize, maximumSize, increaseSizePicks(featNames));
  // A KIND THAT GROWS WITH LEVEL (3.674.0, C3; the Dragon Companion Table's
  // Size column, Graham's B10-1). Its module records the size it has grown
  // to in `system.companion.grownSize`; the larger of that and the picks
  // governs. An unknown size is ignored rather than coerced.
  const grown = String(grownSize ?? "").trim().toLowerCase();
  const grownIndex = SIZE_STEPS.indexOf(grown);
  if (grownIndex < 0) return picked;
  if (!picked) return grown;
  return SIZE_STEPS.indexOf(picked) >= grownIndex ? picked : grown;
}

/** Support (Companion): "+1 circumstance bonus when attacking them". */
export const SUPPORT_BONUS = 1;

/** Does this list of feat names contain one, by name? */
export function hasCompanionFeat(featNames = [], name = "") {
  const wanted = normalise(name);
  return (featNames ?? []).some((owned) => normalise(owned) === wanted);
}

/**
 * Damage types Defensive Roll can never halve.
 *
 * "Be aware that the animal may not use this ability to half the damage
 * from unseen damage such as Mental and Poison." Those two are named in
 * the book; "such as" invites more, but this project does not invent
 * text, so the list is exactly the two printed and the card says so.
 */
export const DEFENSIVE_ROLL_EXCLUDED = Object.freeze(["mental", "poison"]);

/** The physical damage types the base feat covers. */
const PHYSICAL_DAMAGE = Object.freeze(["bludgeoning", "piercing", "slashing", "subdual"]);

/**
 * Can this companion halve this damage with Defensive Roll, and why not?
 *
 * TWO TIERS. The base feat is "when hit by a physical melee or ranged
 * attack"; Improved "may now apply defensive roll to damage from
 * spells". A damage TYPE is all the Apply Damage dialog knows — it
 * cannot see whether a fireball or a flaming sword delivered the fire —
 * so the split is drawn where the type actually tells us something:
 * physical types are reachable at either tier, and the energy and
 * exotic types only once Improved is owned, because before Improved the
 * only way to take fire damage is from something the base feat does not
 * cover. That is an approximation of the printed rule in the player's
 * favour by at most one edge case (a flaming sword's fire damage at
 * base tier), and the alternative — asking "was this a spell?" on every
 * damage entry — taxes every roll to catch it.
 *
 * UNTYPED IS OFFERED. A GM typing "8 damage" has told us nothing about
 * the source, and refusing a feat because the dialog lacks information
 * would make Defensive Roll unusable in exactly the case it is most
 * often needed. The card names the restriction instead.
 *
 * @returns {{available: boolean, tier: string|null, reason: string}}
 */
export function defensiveRollEligibility({ featNames = [], damageType = "" } = {}) {
  const improved = hasCompanionFeat(featNames, "Defensive Roll, Improved");
  const base = hasCompanionFeat(featNames, "Defensive Roll");
  if (!base && !improved) {
    return { available: false, tier: null, reason: "" };
  }
  const tier = improved ? "Defensive Roll, Improved" : "Defensive Roll";
  const type = String(damageType ?? "").trim().toLowerCase();
  if (DEFENSIVE_ROLL_EXCLUDED.includes(type)) {
    return {
      available: false, tier,
      reason: `${type[0].toUpperCase()}${type.slice(1)} is unseen damage — Defensive Roll cannot halve it.`
    };
  }
  if (!type || PHYSICAL_DAMAGE.includes(type)) {
    return { available: true, tier, reason: "" };
  }
  if (improved) return { available: true, tier, reason: "" };
  return {
    available: false, tier,
    reason: "Defensive Roll covers physical attacks; Defensive Roll, Improved adds spell damage."
  };
}

/**
 * Halve damage, Defensive Roll's way.
 *
 * "The damage is halved after applying DR and other applicable
 * resistances" — so this is applied to the pipeline's OUTPUT, not to the
 * rolled number, which is why it lives at the Apply Damage step rather
 * than anywhere in the attack workflow. Rounds down, the system default.
 */
export function defensiveRollDamage(amount) {
  return Math.floor(Math.max(0, Math.floor(Number(amount) || 0)) / 2);
}

/**
 * The two ladders as pooled bonus entries, ready for `actor.addBonus`.
 *
 * Target-keyed rather than pushed directly, so the whole rule can be RUN
 * in a harness without a live actor (lesson 2) — the same shape
 * `creatureBonusEntries` uses.
 *
 * Both go through the pool rather than into a slot, for the reason every
 * derived contribution in this system does: `dodge` and `natural` are
 * where a GM's own edits and ActiveEffects land, and assigning over
 * either would eat them.
 *
 * Natural Defence is a DODGE bonus, which has its own stacking rule
 * (dodge bonuses stack with each other but are lost when flat-footed) —
 * so it is typed `dodge` and inherits that automatically rather than
 * being special-cased here.
 *
 * Tough Hide lands on `naturalArmourBase`, so it scales with BDB exactly
 * as the creature's own printed DR does — but it is typed UNTYPED, not
 * `naturalArmour`, and that distinction is the whole feat.
 *
 * The `naturalArmour` bonus type stacks "highest wins", deliberately, so
 * that two INDEPENDENT sources of natural armour do not add. Typing
 * Tough Hide that way made it compete with the companion's own hide
 * instead of increasing it, and live testing showed exactly what that
 * costs: on a Bear (DR 1) the first tier changed nothing at all, and on
 * Horse, Pony and Snake (DR 2) the first TWO tiers were inert. A
 * four-tier ladder whose lower half does nothing for half the species is
 * not a design, and the printed text says "increased by 1".
 *
 * Graham's ruling (3.233.1): Tough Hide adds. It is not a separate
 * source of natural armour competing with the creature's — it is an
 * increase to that same hide — so "highest wins" was never the rule that
 * applied to it. Typed untyped so it stacks; genuinely separate sources
 * of natural armour still take the highest among themselves, and Tough
 * Hide adds on top of whichever of those won.
 */
export function companionFeatEntries(ownedNames = []) {
  const entries = {};
  const dodge = naturalDefenceBonus(ownedNames);
  if (dodge > 0) {
    entries["system.combat.defence"] = [{
      label: "Natural Defence", value: dodge, type: "dodge", source: "companionFeat"
    }];
  }
  const hide = toughHideBonus(ownedNames);
  if (hide > 0) {
    entries["system.combat.naturalArmourBase"] = [{
      label: "Tough Hide", value: hide, type: "untyped", source: "companionFeat"
    }];
  }
  return entries;
}
