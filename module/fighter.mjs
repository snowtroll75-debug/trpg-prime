/**
 * The Fighter's class abilities (Chapter 3).
 *
 * Same split as crusader.mjs, bard.mjs and divine-aspect.mjs, for the
 * same reason: everything that is arithmetic on data already on the
 * sheet lives here as pure functions the harness can RUN without a
 * Foundry actor. The Foundry glue — where each of these is read — is:
 *
 *   Warrior's Resolve      documents/actor.mjs (conviction max) and
 *                          grants-workflow.mjs (the one-off top-up)
 *   Battle Readiness       documents/actor.mjs (reactions max) and
 *                          combat/action-points-workflow.mjs (the gate)
 *   Armour Exemplar        documents/actor.mjs (ACP total, Max Dex cap)
 *   Weapon Exemplar        combat/attack-workflow.mjs (attack modifier,
 *                          damage formula) and feats-workflow.mjs (picker)
 *   Weapon Supremacy       combat/attack.mjs attackOutcome (missForgiveness)
 *   Unbreakable Resolve    dice/check-card-interactions.mjs (the reroll
 *                          button on a failed save card); uses.mjs holds
 *                          the "1, 2 at 15th" daily-uses formula
 *   Press the Advantage    combat/attack-workflow.mjs (your critical),
 *                          combat/action-workflow.mjs (manoeuvre success)
 *                          and feats-workflow.mjs (the Use button for the
 *                          triggers the system cannot see)
 *
 * Martial Training has no arithmetic — it is a chooser, and lives whole
 * in feats-workflow.mjs.
 *
 * Levels here are the CHARACTER level (system.identity.level), exactly
 * as the class progression, conviction and the divine aspects read it —
 * this system is single-class, so class level and character level are
 * the same number.
 */

import { hasClassAbility } from "./crusader.mjs";

const SYSTEM_ID = "trg-prime";

/* ---------------------------------------------------------------------- */
/*  Warrior's Resolve (1st)                                               */
/* ---------------------------------------------------------------------- */

/**
 * "You are a gritty front-line warrior and may increase your conviction
 * pool and conviction points by 1."
 *
 * Word for word the Crusader's Divine Resolve with the flavour changed,
 * and automated identically: the pool half is applied in base data so an
 * Active Effect still stacks on top, and the points half is a one-off
 * top-up recorded on the class item (grants-workflow), because a derive
 * that raised the current value would refill a spent point on every
 * sheet render.
 */
export function warriorsResolveBonus(actor) {
  return hasClassAbility(actor, "Warrior's Resolve") ? 1 : 0;
}

/**
 * The one-off half: the point Warrior's Resolve puts in your pool when
 * it arrives. Identical in shape to crusader.mjs's divineResolveTopUp,
 * and called from the same place (the grant path), for the same reason:
 * recorded on the class item so it happens exactly once however many
 * times Apply Grants is pressed.
 *
 * @param {number} current The stored conviction value (from _source —
 *   never prepared data, or a spent point reads as unspent).
 * @param {boolean} alreadyGiven Whether the class item already records it.
 */
export function warriorsResolveTopUp(actor, current, alreadyGiven) {
  if (alreadyGiven) return null;
  if (!warriorsResolveBonus(actor)) return null;
  return Math.max(0, Math.floor(Number(current) || 0)) + 1;
}

/* ---------------------------------------------------------------------- */
/*  Battle Readiness (2nd)                                                */
/* ---------------------------------------------------------------------- */

/** The extra reaction Battle Readiness adds to the per-round pool. */
export function battleReadinessBonus(actor) {
  return hasClassAbility(actor, "Battle Readiness") ? 1 : 0;
}

/**
 * Whether a Reaction-cost action QUALIFIES for the Battle Readiness
 * reaction: "an action with the Reaction action type that also has
 * either the Attack trait or the Martial trait."
 *
 * Word-boundary matches, as every other trait test in this codebase.
 * The lookbehinds keep a "Non-Attack" or "Non-Martial" trait — the
 * "Non-<X>" shape Chapter 5 already uses for feat traits — from reading
 * as the trait it negates: a bare \b boundary would match straight
 * through the hyphen.
 *
 * @param {string} traits The action's printed trait line, e.g. "Attack".
 */
export function reactionQualifies(traits) {
  const printed = String(traits ?? "");
  return /(?<!non-)\battack\b/i.test(printed) || /(?<!non-)\bmartial\b/i.test(printed);
}

/**
 * The gate on spending a reaction, for a character with Battle
 * Readiness. Their pool holds two reactions a round, but only ONE of
 * them — the base one — may go on a reaction without the Attack or
 * Martial trait. Rather than earmark which stored point is which (they
 * are fungible integers), the rule is enforced as a count: at most one
 * NON-qualifying spend per round.
 *
 * Returns the refusal reason, or null when the spend may proceed.
 *
 * @param {object} state
 * @param {boolean} state.hasBattleReadiness Whether the gate exists at all.
 * @param {boolean} state.qualifies Whether THIS action carries Attack/Martial.
 * @param {boolean} state.nonQualifyingSpent Whether the one unrestricted
 *   spend has already happened this round.
 */
export function battleReadinessSpendBlock({
  hasBattleReadiness = false,
  qualifies = false,
  nonQualifyingSpent = false
} = {}) {
  if (!hasBattleReadiness) return null;
  if (qualifies) return null;
  if (!nonQualifyingSpent) return null;
  return (
    "Only your Battle Readiness reaction remains this round, and it can " +
    "only be spent on a Reaction with the Attack or Martial trait."
  );
}

/* ---------------------------------------------------------------------- */
/*  Armour Exemplar (3rd; 7th, 11th, 15th)                                */
/* ---------------------------------------------------------------------- */

/**
 * How many steps of Armour Exemplar apply at a level: one at 3rd and one
 * more every four levels (7th, 11th, 15th), "to a maximum -4 reduction
 * ... and a +4 increase".
 *
 *   levels 1-2 → 0,  3-6 → 1,  7-10 → 2,  11-14 → 3,  15+ → 4
 */
export function armourExemplarSteps(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 3) return 0;
  return Math.min(4, 1 + Math.floor((value - 3) / 4));
}

/**
 * The two adjustments Armour Exemplar makes, or zeros when it does not
 * apply. "Whenever you are wearing armour": the caller says whether any
 * armour piece is actually equipped — a Fighter in robes gets nothing.
 *
 * The ACP reduction reads "you reduce the armour check penalty by 1" —
 * the character's ACP total, once, not once per worn piece (contrast
 * Iron Walker's explicit "for any armour that you wear"). The Max Dex
 * clause is "the maximum Dexterity bonus allowed by your armour", so it
 * raises the armour-derived cap — a character whose armour imposes no
 * cap has nothing to raise.
 */
export function armourExemplarAdjust(actor, level, wearingArmour) {
  if (!wearingArmour) return { acpReduction: 0, maxDexIncrease: 0 };
  if (!hasClassAbility(actor, "Armour Exemplar")) {
    return { acpReduction: 0, maxDexIncrease: 0 };
  }
  const steps = armourExemplarSteps(level);
  return { acpReduction: steps, maxDexIncrease: steps };
}

/* ---------------------------------------------------------------------- */
/*  Weapon Exemplar (4th; 8th, 12th, 16th, 20th)                          */
/* ---------------------------------------------------------------------- */

/**
 * How many weapon-group picks the ability has granted by a level: one at
 * 4th, "at 8th level and every four levels thereafter ... another group".
 *
 *   levels 1-3 → 0,  4-7 → 1,  8-11 → 2,  12-15 → 3,  16-19 → 4,  20 → 5
 */
export function weaponExemplarTierCount(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 4) return 0;
  return Math.min(5, 1 + Math.floor((value - 4) / 4));
}

/**
 * The recorded picks, in the order they were made, off the Weapon
 * Exemplar ability item's flags. Order is the whole point: "the bonuses
 * granted by previous weapon groups increase by +1 each", so the
 * earliest pick carries the largest bonus.
 */
export function weaponExemplarPicks(actor) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "ability") continue;
    if (String(item.name).trim().toLowerCase() !== "weapon exemplar") continue;
    const picks = item.flags?.[SYSTEM_ID]?.weaponExemplarGroups;
    return Array.isArray(picks) ? picks.map((g) => String(g)) : [];
  }
  return [];
}

/**
 * The class bonus a weapon group carries under Weapon Exemplar.
 *
 * The bonus follows the LEVEL milestones, not the act of choosing: "At
 * 8th level ... the bonuses granted by previous weapon groups increase
 * by +1 each" — the increase arrives with the level whether or not the
 * new group has been picked yet. So the i-th pick (0-based) is worth
 * (tiers reached − i), floored at 1 for any pick actually made.
 *
 * "Bonuses granted from overlapping groups do not stack. Take the
 * highest" — every weapon in the packs carries exactly one group, but a
 * duplicated pick must still resolve to the single highest figure
 * rather than a sum.
 *
 * @param {string[]} picks Ordered group names.
 * @param {number} tiers weaponExemplarTierCount(level).
 * @param {string} group The weapon's own group.
 * @returns {number} 0 when the group is not picked.
 */
export function weaponExemplarBonusFor(picks, tiers, group) {
  const wanted = String(group ?? "").trim().toLowerCase();
  if (!wanted) return 0;
  let best = 0;
  picks.forEach((pick, index) => {
    if (String(pick).trim().toLowerCase() !== wanted) return;
    const value = Math.max(1, Math.floor(Number(tiers) || 0) - index);
    if (value > best) best = value;
  });
  return best;
}

/* ---------------------------------------------------------------------- */
/*  Weapon Supremacy (13th; 19th)                                         */
/* ---------------------------------------------------------------------- */

/**
 * How far a miss may fall short and still hit: "you treat a miss by 1 as
 * a hit ... At 19th level, you treat a miss by 2 or less as a hit."
 *
 * In AV terms (result − DB, where 0 or better hits): a miss by 1 is
 * AV −1, so the return value is how far below zero the AV may sit.
 *
 * "This does not apply if the attack was made with disadvantage", and it
 * only reaches "a weapon from one of your weapon groups selected with
 * Weapon Exemplar" — both are the caller's to report, since bias and the
 * weapon in hand live in the attack workflow.
 *
 * An unmodified 1 still always misses: attackOutcome applies its autoMiss
 * AFTER the forgiveness widens the hit test, exactly as it already
 * overrides an ordinary hit.
 */
export function weaponSupremacyForgiveness({
  actor = null,
  level = 0,
  groupMatches = false,
  disadvantage = false
} = {}) {
  if (disadvantage) return 0;
  if (!groupMatches) return 0;
  if (!hasClassAbility(actor, "Weapon Supremacy")) return 0;
  const value = Math.floor(Number(level) || 0);
  if (value >= 19) return 2;
  if (value >= 13) return 1;
  return 0;
}

/* ---------------------------------------------------------------------- */
/*  Unbreakable Resolve (9th; 15th, 19th)                                 */
/* ---------------------------------------------------------------------- */

/**
 * "At 19th level, if the second result is a Partial, you may treat it as
 * a Success." Only the REROLL is upgraded, and only a Partial — the
 * original failed save that triggered the reroll is gone by then.
 */
export function unbreakableResolvePartialToSuccess(level) {
  return Math.floor(Number(level) || 0) >= 19;
}

/**
 * The degrees that count as FAILING a save for the reroll trigger:
 * "when you fail a Fortitude, Reflex, or Will saving throw". A Partial
 * is its own degree in this system, not a failure — and the 19th-level
 * clause upgrading a rerolled Partial to a Success would be pointless
 * if a Partial re-triggered the reroll instead.
 */
export const UNBREAKABLE_TRIGGER_DEGREES = Object.freeze([
  "failure",
  "fumble",
  "blunder"
]);

/* ---------------------------------------------------------------------- */
/*  Press the Advantage (4th; 13th)                                       */
/* ---------------------------------------------------------------------- */

/**
 * The movement half of the prompt: a Step at 4th, "At 13th level, when
 * Press the Advantage allows you to Step, you may instead Stride up to
 * half your Speed" — with the book's own placement conditions attached
 * by the card, not enforced in geometry.
 */
export function pressTheAdvantageStride(level) {
  return Math.floor(Number(level) || 0) >= 13;
}

/**
 * The manoeuvre action keys whose SUCCESS the system can see and prompt
 * on: "you successfully Shove, Trip, Disarm, Grapple, or otherwise
 * succeed at a martial combat manoeuvre." The "otherwise" tail — and
 * the enemy-fumble and enemy-disabled triggers — are what the ability's
 * Use button is for.
 */
export const PRESS_MANOEUVRE_KEYS = Object.freeze([
  "shoveAttack",
  "tripAttack",
  "disarmAttack",
  "grappleAttack"
]);

/** The degrees that count as succeeding at a manoeuvre. */
export const PRESS_SUCCESS_DEGREES = Object.freeze([
  "success",
  "critical",
  "heroic"
]);

/**
 * Whether the once-per-round prompt may fire. The flag is reset where
 * the reaction pool refills (the combatant's turn start), which is the
 * same round boundary the reaction economy already uses.
 */
export function pressTheAdvantageAvailable({ hasAbility = false, usedThisRound = false } = {}) {
  return Boolean(hasAbility) && !usedThisRound;
}

/** Does this actor have Press the Advantage on their sheet? */
export function hasPressTheAdvantage(actor) {
  return hasClassAbility(actor, "Press the Advantage");
}
