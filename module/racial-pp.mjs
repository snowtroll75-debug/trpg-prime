/**
 * RACIAL AND HERITAGE POWER POINTS — who grants how many, and per what.
 *
 * NEW at 3.417.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THAT PAID FOR THIS.
 *
 * Graham, 27 August 2026: "The Sharuk-Xal Heritage is not adding PP
 * correctly to the character."
 *
 * The grant fired. The arithmetic was right. Every plumbing check passed
 * — `heritage` is an autogrant type, the hook runs on `createItem`, the
 * stored delta reconciles on level change, and the +2 landed exactly as
 * written. What was wrong was the SCALE: races and Sharuk-Xal granted
 * their Power Points ONCE, while the three heritages whose text says
 * "an additional PP per level" granted them per level.
 *
 * So the same printed phrase meant two different things depending on
 * which item it was written on, and the error widened by a point every
 * level — which is why it looks correct on the character you build it on
 * and wrong two sessions later.
 *
 * GRAHAM'S RULING: racial Power Points are PER LEVEL. Sharuk-Xal, which
 * exists only to correct a racial figure, therefore scales the same way.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE TABLE IS HERE RATHER THAN IN feats-workflow.mjs.
 *
 * It lived in `PP_GRANTS`, in a module that touches the `foundry` global
 * at load and so cannot be imported by any harness in this project. The
 * values and the per-level rule are a pure decision — a lookup and a
 * multiply, no documents — sitting where nothing could check them. That
 * is the same shape this project has now paid for nine times, and the
 * fix is the one it always is: extract the decision, then check it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SHARUK-XAL IS +2, NOT +1, AND THAT IS DELIBERATE.
 *
 * Its text reads "your racial Power Points are +1 instead of -1". The
 * Orc's own -1 has already been granted by the time the heritage is
 * added, so the heritage carries the DIFFERENCE. Graham confirmed the
 * additive reading on 27 August: it matches how every other Sharuk
 * heritage is authored — Sharuk-Rin adds Dex +1 / Str -1 on top of the
 * Orc line rather than restating it — and one pattern for all of them
 * beats a special case that reads more literally.
 */
import { registeredRacialPP } from "./module-api.mjs";

/**
 * Racial Power Points, per level, by race.
 *
 * The four absent races print "Power Points: 0" — Dwarf, Halfling, Human
 * and Kornargon. They are listed as an explicit zero rather than omitted
 * so a reader can tell "this race grants nothing" from "nobody has
 * checked this race yet", which is a distinction the pack could not make
 * before.
 */
export const RACIAL_PP_PER_LEVEL = Object.freeze({
  ascendan: 1,
  dwarf: 0,
  elf: 1,
  gnome: 1,
  halfling: 0,
  human: 0,
  kornargon: 0,
  orc: -1
});

/**
 * Heritage Power Points, per level, by heritage.
 *
 * Sharuk-Xal is the correction described in the header. The other three
 * print "an additional PP per level" in so many words and were already
 * scaling before this file existed; they are here so that all seven
 * per-level PP lines are answerable in one place.
 */
export const HERITAGE_PP_PER_LEVEL = Object.freeze({
  "sharuk-xal": 2,
  urloch: 1,
  "gul-fyr": 1,
  fey: 1
});

/**
 * How many levels a per-level Power Point line counts.
 *
 * Floored at zero: a missing or zero level grants nothing rather than
 * reaching for a negative multiple of a negative racial figure, which
 * would hand an Orc power points for being level 0.
 */
export function ppLevels(level) {
  return Math.max(0, Math.trunc(Number(level) || 0));
}

/**
 * What one named race or heritage owes at this level.
 *
 * Returns 0 for anything not in the tables — an unknown name is not an
 * error here, because a homebrew race is a perfectly ordinary thing for
 * a table to have and it simply grants nothing this file knows about.
 *
 * @param {string} name the race or heritage name, in any case
 * @param {number} level the character's level
 * @returns {number} the total Power Points owed, signed
 */
export function racialPPDue(name, level) {
  const key = String(name ?? "").trim().toLowerCase();
  // A module-registered race or heritage (3.560.0) answers after the
  // core tables and before the homebrew default of nothing.
  const per = RACIAL_PP_PER_LEVEL[key] ?? HERITAGE_PP_PER_LEVEL[key] ?? registeredRacialPP(key) ?? 0;
  return per * ppLevels(level);
}

/**
 * What a race and heritage together owe — the number a player checks.
 *
 * THE PAIR IS THE POINT. An Orc Sharuk-Xal is the case that started
 * this, and reading its two halves separately is what made a scale error
 * invisible: -1 and +2 net to +1 at every level, and +1 is exactly what
 * the flat implementation produced at level 1. Only the pair, read at a
 * level above 1, tells the two readings apart.
 *
 * @param {string} race
 * @param {string} heritage
 * @param {number} level
 * @returns {number}
 */
export function racialPPTotal(race, heritage, level) {
  return racialPPDue(race, level) + racialPPDue(heritage, level);
}
