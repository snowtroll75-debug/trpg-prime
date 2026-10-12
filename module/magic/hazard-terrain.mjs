/**
 * HAZARDOUS TERRAIN — damage for entering a square.
 *
 * NEW at 3.454.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE SPELLS, ONE SENTENCE, FOUND BY READING THEM.
 *
 * `tools/rulebook.mjs` put Graham's own book in the tree on 1 September
 * 2026, and comparing it against the pack showed a family nobody had
 * noticed because each spell had only ever been read as a stat block:
 *
 *   SPIKE STONES        "A creature that moves on the ground through the
 *                        area takes 1d8 piercing damage for every square
 *                        of that area it moves into."
 *   VERDANT RETRIBUTION "dealing 2d8 poison damage to an enemy each time
 *                        it enters an affected area (square)"
 *   WALL OF THORNS      "any creature that uses a move action to enter
 *                        one of the wall's spaces suffers 2d8 piercing
 *                        damage"
 *
 * PER SQUARE, NOT PER MOVE. All three say it in their own words — "for
 * every square", "each time it enters" — so a creature crossing four
 * squares of Spike Stones is hit four times. That is the part which
 * makes this a mechanism rather than a damage row.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 1 September 2026: ONLY THE CREATURE'S OWN MOVE.
 *
 * Asked whether being Shoved into Spike Stones, or teleporting into
 * them, should hurt, he chose: only a move action of the creature's own.
 * Wall of Thorns is the spell that prints the distinction — "uses a move
 * action to enter" — and the ruling reads that as the general rule for
 * the family rather than a quirk of one wall.
 *
 * THE TEST IS A TABLE THAT ALREADY EXISTS. `MOVEMENT_ACTION_SPEEDS` in
 * combat/movement.mjs maps every Foundry movement action that is
 * governed by a Speed — walk, crawl, jump, fly, swim, climb, burrow —
 * and answers nothing for the rest. `speedForMovement` already documents
 * the null case as "isn't governed by a Speed at all (teleportation)".
 * So the ruling is expressed by asking that table rather than by listing
 * movement kinds here, and a movement action added to the system is
 * covered without touching this file.
 *
 * WHAT THIS DELIBERATELY DOES NOT CLAIM. A forced move — a Shove pushing
 * somebody into the spikes — travels through the same Foundry movement
 * path as a walk and carries no marker to say it was involuntary. Under
 * Graham's ruling it should NOT trigger, and today it would. That is
 * recorded here rather than papered over, because the honest boundary of
 * a rule is part of the rule; closing it needs the Shove code to mark
 * the movement, which is a change to a different file for a different
 * release.
 */

import { MOVEMENT_ACTION_SPEEDS } from "../combat/movement.mjs";

/** Where a hazard's spec lives on the Region the template created. */
export const HAZARD_FLAG = "hazardTerrain";

/** The damage expressions this accepts — dice, or a flat number. */
const DICE_OR_FLAT = /^\d+(d\d+)?$/i;

const text = (v) => String(v ?? "").trim();

/**
 * A hazard row, or null when it is malformed.
 *
 * A MISSING DAMAGE TYPE IS REFUSED, for the reason `normaliseStrikeRider`
 * refuses one: an empty type means something specific elsewhere in this
 * system (a rune's "the weapon's own"), and a row that simply forgot its
 * type must not inherit that meaning by omission.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseHazard(raw) {
  if (!raw || typeof raw !== "object") return null;

  const damage = text(raw.damage);
  if (!DICE_OR_FLAT.test(damage)) return null;

  const damageType = text(raw.damageType).toLowerCase();
  if (!damageType) return null;

  // "TO AN ENEMY", where the spell says so. Verdant Retribution names
  // enemies and the other two name any creature, so this is declared per
  // spell rather than assumed for the family.
  const side = text(raw.side).toLowerCase();
  const enemiesOnly = side === "enemies";

  // A BASIC SAVE, where the spell has one. Verdant Retribution prints
  // "Saving Throw Basic Fortitude"; Spike Stones and Wall of Thorns
  // print none, and inventing one would halve damage the book applies in
  // full.
  // KEPT AS WRITTEN, NOT LOWERCASED. The first draft normalised this the
  // way `damageType` is normalised — and `damageType` is compared against
  // other strings, while this one is PRINTED. Driving it in Graham's
  // world produced a card reading "A basic fortitude save applies", which
  // is the interface mis-naming one of the system's own defined terms.
  const save = text(raw.save);

  return {
    label: text(raw.label) || "Hazardous terrain",
    damage,
    damageType,
    enemiesOnly,
    save
  };
}

/**
 * Does this movement action trigger a hazard?
 *
 * GRAHAM'S RULING, expressed against the system's own table rather than
 * a list of my own — see the header.
 *
 * @param {string} movementAction the Foundry movement action
 * @returns {boolean}
 */
export function hazardTriggers(movementAction) {
  const key = MOVEMENT_ACTION_SPEEDS[String(movementAction ?? "walk")];
  return Boolean(key);
}

/**
 * Does this creature take damage from this hazard?
 *
 * @param {object} spec a normalised hazard
 * @param {boolean} isEnemy is the mover an enemy of the caster?
 */
export function hazardAffects(spec, isEnemy) {
  if (!spec) return false;
  if (!spec.enemiesOnly) return true;
  return Boolean(isEnemy);
}

/**
 * The distinct grid squares a path enters, EXCLUDING the one it starts
 * in.
 *
 * THE SQUARE YOU ARE STANDING IN IS NOT ONE YOU ENTERED. A creature that
 * begins its turn in the spikes and walks one square takes one hit, not
 * two — "every square of that area it moves into" counts destinations,
 * not origins. Getting this wrong would double the damage of every
 * crossing and would look exactly like a bad die roll.
 *
 * @param {Array<{x:number,y:number}>} points the path, in pixels
 * @param {number} gridSize pixels per square
 * @returns {Array<{x:number,y:number}>} square coordinates, in order
 */
export function squaresEntered(points, gridSize) {
  const size = Number(gridSize);
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(size) || size <= 0) return [];

  const cell = (p) => `${Math.floor(Number(p?.x) / size)},${Math.floor(Number(p?.y) / size)}`;
  const out = [];
  const seen = new Set([cell(points[0])]);
  for (let i = 1; i < points.length; i += 1) {
    const key = cell(points[i]);
    // RE-ENTRY COUNTS. "Each time it enters" is the printed wording, so a
    // creature that steps out and back in is hit again — but a path that
    // merely reports the same square twice in a row is one square, not
    // two.
    if (key === cell(points[i - 1])) continue;
    out.push({ x: Number(points[i].x), y: Number(points[i].y), key });
    seen.add(key);
  }
  return out;
}

/** What the card says when a hazard bites. */
export function hazardLine(spec, moverName, taken, rolled, squares) {
  const times = Number(squares) > 1 ? ` across <strong>${squares}</strong> squares` : "";
  const reduced = Number(taken) !== Number(rolled) ? ", reduced by their defences" : "";
  return `<strong>${spec.label}</strong> — ${moverName} takes <strong>${taken}</strong> `
    + `${spec.damageType}${times} (${spec.damage} rolled ${rolled}${reduced}).`;
}
