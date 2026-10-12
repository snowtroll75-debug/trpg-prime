/**
 * A REACTION THAT DRAINS A SPELL AS IT IS CAST.
 *
 * NEW at 3.608.0, for R6 of the pages 321–330 audit. Pure; no Foundry.
 *
 * SPELL DRAIN (PP 14, page 326), Reaction, 50 feet, 1 creature, Will
 *   "Trigger you have awareness of the target casting a spell.
 *    When a target within range casts a spell you attempt to drain the
 *    energy from the spell, causing it to fail and replenishing your own
 *    power points.
 *      Critical  The target is unaffected.
 *      Success   The target takes a -2 penalty to their Spellcraft check.
 *      Failure   The targets spell is classed as a failure, and you absorb
 *                the spell PP adding them to your total.
 *      Fumble    As failure and the targets check is a fumble."
 *
 * ─────────────────────────────────────────────────────────────────────
 * CUTTING WORDS' ROAD, AND GRAHAM'S RULING FOR IT (28 August 2026): "It
 * should be triggered only by the caster of the spell. After [the action]
 * has been announced … the player with the spell would cast the spell and
 * select an eligible target." So there is no hook on anybody else's card.
 * The drainer casts from their own sheet when a spell is announced; the
 * target's Will save is rolled then; and the rung it earns WAITS ON THE
 * TARGET, to be spent by the casting it was aimed at — the target's next.
 *
 * WHAT THE CASTING DOES WITH IT, in cast-workflow.mjs:
 *   - a penalty joins the Spellcraft check before it is rolled;
 *   - a forced degree overrides the dice after, exactly as page 238's
 *     interruption does — never to a BETTER degree than the one rolled;
 *   - the PP the casting spent go to the drainer.
 *
 * READINGS, said on the release notes:
 *   "ADDING THEM TO YOUR TOTAL" is capped at the drainer's maximum. The
 *   opening sentence calls it replenishing, and nothing else in the game
 *   fills a Power Point pool past its maximum.
 *   THE PP ABSORBED ARE THE PP THE FAILED CASTING SPENT — what the target
 *   actually lost, which a failure's reduced cost already decides.
 */

import { DEGREE_ORDER } from "./save-ladder.mjs";

/** Where the waiting drain is recorded on the target. */
export const SPELL_DRAIN_FLAG = "spellDrain";

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/** A `spellDrain` row's rung, or null when it does nothing. */
export function normaliseSpellDrain(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "spellDrain") return null;
  const penalty = int(raw.penalty);
  const forced = text(raw.forced).toLowerCase();
  if (forced && !DEGREE_ORDER.includes(forced)) return null;
  if (!penalty && !forced) return null;
  return {
    label: text(raw.label) || "Spell Drain",
    penalty: penalty < 0 ? penalty : 0,
    forced: forced || null,
    absorb: raw.absorb === true
  };
}

/** The record left waiting on the target. */
export function spellDrainRecord(spec, { drainerUuid = "", drainerName = "", worldTime = null } = {}) {
  if (!spec) return null;
  return { ...spec, drainerUuid: text(drainerUuid), drainerName: text(drainerName), worldTime };
}

/**
 * The degree a drained casting ends at: the forced one, unless the dice
 * already did worse. A Blunder is not lifted to a Failure by being drained.
 */
export function drainedDegree(record, rolled) {
  const forced = record?.forced;
  if (!forced) return rolled;
  const a = DEGREE_ORDER.indexOf(String(rolled ?? ""));
  const b = DEGREE_ORDER.indexOf(forced);
  if (a < 0) return forced;
  return a > b ? rolled : forced;
}

/**
 * How many PP the drainer gains.
 *
 * @param {number} spent what the drained casting spent
 * @param {number} current the drainer's pool now
 * @param {number} max the drainer's maximum
 */
export function drainedPP(spent, current, max) {
  const room = Math.max(0, int(max) - int(current));
  return Math.max(0, Math.min(int(spent), room));
}

/** The card line on the drained casting. */
export function spellDrainLine(record, { castName = "the spell", degree = "", gained = 0, spent = 0 } = {}) {
  const by = record.drainerName ? ` by ${record.drainerName}` : "";
  if (!record.forced) {
    return `<em>${record.label}${by}: ${record.penalty} to the Spellcraft check for ${castName}.</em>`;
  }
  const deg = degree ? degree.charAt(0).toUpperCase() + degree.slice(1) : "a failure";
  const lost = spent > gained ? ` (${spent - gained} beyond their maximum lost)` : "";
  return `<strong>${record.label}${by}</strong>: ${castName} is drained — it is a <strong>${deg}</strong>`
    + `${record.absorb ? `, and ${record.drainerName || "the drainer"} absorbs <strong>${gained} PP</strong>${lost}` : ""}.`;
}
