/**
 * rooted-movement — Chapter 2's Storgar, against spells with the Movement
 * trait.
 *
 * NEW at 3.701.0, with the Movement trait audit (Graham, 18 Nov 2026: "Any
 * spell which moves either the caster or a target as part of the casting
 * (such as Misty Step) should have this trait"). Until then no spell in the
 * pack carried Movement, so the Storgar's third clause had nothing to read
 * and was a note telling the player to roll it by hand.
 *
 *   "you gain a +2 racial bonus to all checks to resist being shoved or
 *    moved involuntarily. Unfortunately, your attachment to the earth also
 *    forces you to make a DC 5 flat check when any friendly spell with the
 *    movement trait is cast upon you. If you fail this check, the spell does
 *    not work."
 *
 * THE TWO HALVES ARE THE SAME TRAIT FROM TWO SIDES.
 *
 *   - A FRIENDLY Movement spell cast upon the Storgar: the flat check, and a
 *     failure means the spell does not work on them. "Friendly" is read as a
 *     spell the Storgar casts themselves, or one an ally (the same token
 *     disposition) casts with the Storgar as a chosen target. A creature only
 *     caught in an ally's area is not "cast upon": the area is aimed at
 *     someone else, and a failed check there would rescue the Storgar from a
 *     hostile effect, which is the opposite of what the clause is for.
 *   - Anything else that would move them: the +2 racial bonus. A save
 *     against a spell with the Movement trait is a check to resist being
 *     moved, so it is published as an automatic row on saves with that
 *     source trait (`storgarSaveConditionals`). The forced-movement table's
 *     own prompt (`involuntaryMovementNote`) still covers pushes that have
 *     no save.
 *
 * READ FROM THE HERITAGE BY NAME, OR A FLAG. A Storgar on a character is an
 * owned copy of the heritage item, and a flag added to the pack today would
 * not reach it. The name is what every copy already carries; the flag lets a
 * module's own heritage or ability opt in with its own DC.
 *
 * Pure: no Foundry.
 */

import { hasTrait } from "../traits.mjs";

/** An item flag naming the flat-check DC a module's own item imposes. */
const ROOTED_FLAG = "friendlyMovementFlatCheck";

/** Heritages that print the clause, by lower-cased name, and their DC. */
const ROOTED_HERITAGES = Object.freeze({ storgar: 5 });

/**
 * The flat-check DC this creature makes when a friendly Movement spell is
 * cast upon it, or null when it makes none. The highest when several apply.
 *
 * @param {object[]} items the creature's owned items
 * @returns {number|null}
 */
export function rootedFlatCheckDC(items = []) {
  let dc = null;
  for (const item of items ?? []) {
    if (!item) continue;
    const flagged = Number(item.flags?.["trg-prime"]?.[ROOTED_FLAG]);
    const named = item.type === "heritage"
      ? ROOTED_HERITAGES[String(item.name ?? "").trim().toLowerCase()] ?? null
      : null;
    const value = Number.isFinite(flagged) && flagged > 0 ? flagged : named;
    if (value && (dc === null || value > dc)) dc = value;
  }
  return dc;
}

/**
 * Whether this creature must make the flat check for this cast.
 *
 * @param {object} p
 * @param {string} p.spellTraits the spell's trait line
 * @param {number|null} p.dc     `rootedFlatCheckDC` of the creature
 * @param {boolean} p.isSelf     the creature is the caster
 * @param {boolean} p.sameSide   the caster is on the creature's side
 * @param {boolean} p.chosen     the creature is a chosen target (or the
 *                               caster of a spell with no targets)
 * @returns {boolean}
 */
export function rootedCheckDue({ spellTraits = "", dc = null, isSelf = false, sameSide = false, chosen = false } = {}) {
  if (!dc || !chosen) return false;
  if (!hasTrait(spellTraits, "movement")) return false;
  return Boolean(isSelf || sameSide);
}

/**
 * Who the clause asks about for one cast: the chosen targets, or the caster
 * when the spell has none and no area (Misty Step, Dimension Door). An area
 * spell asks nobody (see the header).
 *
 * AND THE CASTER BESIDE THEM when the targets line begins "you": Teleport
 * ("you and up to 4 targets touched"), Word Of Recall, Shadow Walk and Wind
 * Walk move the caster with the creatures they touch, whether or not the
 * caster also targeted their own token.
 *
 * @param {object} caster
 * @param {object[]} targeted the actors the caster targeted
 * @param {{isArea?: boolean, targetsText?: string}} [options]
 * @returns {object[]}
 */
export function rootedCandidates(caster, targeted = [], { isArea = false, targetsText = "" } = {}) {
  const chosen = (targeted ?? []).filter(Boolean);
  const same = (a, b) => a === b || Boolean(a?.uuid && a.uuid === b?.uuid);
  if (chosen.length) {
    const withCaster = caster && /^\s*you\b/i.test(String(targetsText ?? "")) && !chosen.some((a) => same(a, caster));
    return withCaster ? [caster, ...chosen] : chosen;
  }
  if (isArea) return [];
  return caster ? [caster] : [];
}

/** The card's sentence when the check fails. */
export function rootedFailureLine(name, spellName, dc, total) {
  return `<strong>${spellName} does not work on ${name}</strong>: Storgar's attachment to the earth. `
    + `The DC ${dc} flat check failed (${total}).`
    + " Leave the token where it is.";
}

/** The card's sentence when the check passes. */
export function rootedSuccessLine(name, spellName, dc, total) {
  return `${name} passes the DC ${dc} flat check for ${spellName} (${total}). The spell takes hold.`;
}

/**
 * The +2 racial row a Storgar's saves carry against spells with the
 * Movement trait. Empty for anyone else.
 *
 * @param {object[]} items the creature's owned items
 * @returns {object[]}
 */
export function storgarSaveConditionals(items = []) {
  const storgar = (items ?? []).some((i) => i?.type === "heritage"
    && String(i.name ?? "").trim().toLowerCase() === "storgar");
  if (!storgar) return [];
  return [{
    kind: "modifier",
    value: 2,
    type: "race",
    label: "Storgar",
    scope: "Saving throws to resist being moved involuntarily (Movement-trait spells)",
    auto: true,
    when: { checkTypes: ["save"], traits: ["movement"] }
  }];
}
