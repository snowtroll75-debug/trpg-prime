/**
 * DUAL MINDS (3.647.0; Fiends & Fables 3.0 block 15 R9 — Graham, 15 October
 * 2026: "Your recommendations").
 *
 * The Ettin: "Both of the Ettins heads act on the same initiative count but
 * have 2 AP and a reaction each … The two minds combine strength when
 * targeted with effects that have the mental trait. Such effects only work if
 * they target both heads (which each then get a separate save). The Ettin is
 * immune to any effect with the mental trait that has only a single target."
 *
 * Declared on the ability as `flags.trg-prime.dualMinds: true`. Core reads it
 * in four places:
 *
 *   AP          4 a turn, two per head (documents/combat.mjs)
 *   reactions   2, one per head (documents/actor.mjs)
 *   one target  a mental effect aimed at the Ettin alone does nothing
 *               (the spell and action immunity gates)
 *   many        a mental effect that catches it with others is saved against
 *               twice and the better stands — one free head keeps control
 *               (dice/check.mjs)
 *
 * "Restricted to 3 move actions in a turn" stays a line on the card.
 *
 * Pure.
 */
import { traitsWithImplied } from "./traits.mjs";

const SYSTEM_ID = "trg-prime";

/** AP and reactions a Dual Minds creature has: two heads, each with 2 AP and a reaction. */
export const DUAL_MINDS_AP = 4;
export const DUAL_MINDS_REACTIONS = 2;

/** Whether this creature has Dual Minds. */
export function hasDualMinds(items = []) {
  return Array.from(items ?? []).some((i) => i?.flags?.[SYSTEM_ID]?.dualMinds === true);
}

/** Whether an effect with these traits is mental (Fear and Emotion bring Mental). */
function isMental(traits) {
  return traitsWithImplied(traits).includes("mental");
}

/**
 * What Dual Minds makes of a mental effect.
 *
 * @param {object[]} items the creature's items
 * @param {string} traits the effect's traits
 * @param {number} targetCount how many creatures the effect is aimed at
 * @returns {"immune"|"twoSaves"|null}
 */
export function dualMindsVerdict(items, traits, targetCount) {
  if (!hasDualMinds(items) || !isMental(traits)) return null;
  return Number(targetCount) <= 1 ? "immune" : "twoSaves";
}

/** The card's reason when it is immune. */
export function dualMindsImmuneReason(name) {
  return `${name}'s Dual Minds: a mental effect aimed at it alone reaches only one head, and does nothing`;
}
