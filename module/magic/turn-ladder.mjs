/**
 * A SAVE LADDER ROLLED AGAIN ON A TURN BOUNDARY (3.685.0, H3 (b) and (c)).
 * Pure; no Foundry.
 *
 * Two shapes from Eldritch Arts' Grimoire, one rule:
 *
 *   (b) AN AREA, AT THE START OF EACH OF THE CASTER'S TURNS. Bubble Buffet:
 *       "When the spell is cast and at the beginning of each of your turns …
 *       Creatures within the spells radius must make a Will save" — Critical
 *       unaffected; Success distracted to the end of its next turn; Partial
 *       distracted for the duration; Failure fixated; Fumble fixated and
 *       slowed 1. Graham's m100 ("as proposed"): a creature that failed does
 *       not save again, and a later worse result replaces a better one.
 *       Authored `on: "casterTurnStart"`, `replace: "worse"`, `stopAt: "failure"`.
 *
 *   (c) ONE TARGET, AT THE START OF EACH OF ITS OWN TURNS, WHILE THE SPELL
 *       LASTS. Flesh to Blossom: "must make a new saving throw at the
 *       beginning of each of their turns if the spell is still active".
 *       Graham's Q156: each later save is a new result that replaces the
 *       last — Critical ends the spell; Success 1d12 and immobilised ends;
 *       Failure 2d12 and immobilised; Fumble 4d12 and petrified.
 *       Authored `on: "targetTurnStart"`, `replace: "always"`.
 *
 * A RUNG is `{ rows, dice, damageType, endsSpell, unaffected }`: rows applied
 * by the spell engine, damage dealt as a spell's, and `endsSpell` ending the
 * cast. "Replaces" means the effects that cast left on that creature are
 * removed before the new rung's rows land. A missing rung reads as every
 * core ladder reads one (`ladderDegree`, m42).
 */

import { DEGREE_ORDER, ladderDegree } from "./save-ladder.mjs";

const TURN_LADDER_KIND = "turnLadder";
/** The flag a Region carries for an area's ladder, and a marker effect for a target's. */
export const TURN_LADDER_FLAG = "turnLadder";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const MOMENTS = Object.freeze(["casterTurnStart", "targetTurnStart"]);
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const DICE = /^\d+d\d+(?:\s*\+\s*\d+)?$|^\d+$/i;

/** A `turnLadder` row, or null when it cannot be rolled. */
export function normaliseTurnLadder(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== TURN_LADDER_KIND) return null;
  const save = lower(raw.save);
  if (!SAVES.includes(save)) return null;
  const on = text(raw.on);
  if (!MOMENTS.includes(on)) return null;
  const degrees = {};
  for (const key of DEGREE_ORDER) {
    const rung = raw.degrees?.[key];
    if (!rung || typeof rung !== "object") continue;
    const dice = text(rung.dice);
    if (dice && !DICE.test(dice)) return null;
    degrees[key] = {
      rows: Array.isArray(rung.rows) ? rung.rows.filter((r) => r && typeof r === "object") : [],
      dice,
      damageType: lower(rung.damageType),
      endsSpell: rung.endsSpell === true,
      unaffected: rung.unaffected === true
    };
  }
  if (!Object.keys(degrees).length) return null;
  const replace = text(raw.replace) === "worse" ? "worse" : "always";
  const stopAt = DEGREE_ORDER.includes(lower(raw.stopAt)) ? lower(raw.stopAt) : "";
  return {
    kind: TURN_LADDER_KIND,
    label: text(raw.label),
    save,
    on,
    degrees,
    replace,
    stopAt,
    atCast: raw.atCast === true && on === "casterTurnStart",
    damageType: lower(raw.damageType)
  };
}

/** Is `a` a worse result than `b`? Degrees run heroic → blunder. */
function degreeWorse(a, b) {
  return DEGREE_ORDER.indexOf(lower(a)) > DEGREE_ORDER.indexOf(lower(b));
}

/**
 * Does this creature roll again at all? Not when its last result was at or
 * past `stopAt` (m100: "a creature that failed does not save again").
 */
export function turnLadderRollsAgain(spec, previous) {
  if (!spec?.stopAt || !previous) return true;
  return !(lower(previous) === spec.stopAt || degreeWorse(previous, spec.stopAt));
}

/**
 * What one new roll does.
 *
 * @param {object} spec normalised
 * @param {string|null} previous the degree it last rolled (null: first time)
 * @param {string} rolled
 * @returns {{at: string|null, rung: object|null, apply: boolean, replaceOld: boolean, endsSpell: boolean, record: string}}
 *   `record` is the degree to remember for next time.
 */
export function turnLadderStep(spec, previous, rolled) {
  const at = ladderDegree(spec?.degrees ?? {}, rolled);
  const rung = at ? spec.degrees[at] : null;
  const worse = !previous || degreeWorse(rolled, previous);
  const apply = spec?.replace === "worse" ? worse : true;
  return {
    at,
    rung,
    apply,
    replaceOld: apply && Boolean(previous),
    endsSpell: apply && Boolean(rung?.endsSpell),
    record: apply ? String(rolled) : String(previous)
  };
}

/** The card's line for one creature's roll. */
export function turnLadderLine(label, name, degreeLabel, step, { total = "—", dc = "—" } = {}) {
  const what = !step.apply
    ? "no worse than before — its earlier result stands"
    : step.endsSpell
      ? "the spell ends"
      : !step.rung || step.rung.unaffected || (!step.rung.rows.length && !step.rung.dice)
        ? (step.replaceOld ? "unaffected now; the last result is removed" : "unaffected")
        : step.replaceOld ? "the new result replaces the last" : "it takes hold";
  return `<strong>${label}</strong> — ${name} saves: <strong>${total}</strong> vs DC ${dc} (${degreeLabel}${step.at ? `, read at ${step.at}` : ""}): ${what}.`;
}
