/**
 * A CHECK FOR MOVING THROUGH AN AREA (3.612.0, block 34's R6 — Web).
 *
 * NEW. Pure; no Foundry. The hook is entry-check-workflow.mjs.
 *
 * WEB (PP 6, page 340-odd of the Grimoire):
 *   "Any space filled with the web becomes difficult terrain ... When a
 *    creature starts to move through the web or enters it during a move
 *    action, it must make an Athletics or Acrobatics check against your DC
 *    to avoid penalties to its Speeds or becoming immobilized.
 *      Critical  The creature is unaffected, and it doesn't need to attempt
 *                further checks against the web this turn. If it used an
 *                Athletics check, it clears the web from every square it
 *                leaves after leaving the square.
 *      Success   The creature is unaffected during its action. If it used an
 *                Athletics check, it clears the web from every square it
 *                leaves after leaving the square.
 *      Failure   The creature takes a –10-foot circumstance penalty to its
 *                Speeds until the start of its next turn.
 *      Fumble    The creature is immobilized until the start of its next
 *                turn, after which it takes a –10-foot circumstance penalty
 *                to its Speeds for 1 round."
 *
 * THE SKILL LADDER'S RUNG RULES, NOT A SECOND SET. skill-ladder.mjs reads an
 * undeclared degree the way every save ladder does — an unnamed success
 * applies nothing, an unnamed failure clamps to the harsher named rung — and
 * this reads its rungs through the same `skillLadderDegree`, so a Partial is
 * Web's Failure and a Blunder its Fumble.
 *
 * A RUNG'S CONSEQUENCES ARE ORDINARY EFFECT ROWS. The −10 feet is a
 * circumstance `bonus` on `allSpeeds`, immobilised is a `condition`, and each
 * carries its own duration — so the timing, the expiry and the sheet are the
 * spell engine's own and nothing here re-decides them. The Fumble's "then
 * −10 feet for 1 round" is a penalty lasting two rounds from now: during the
 * first, the creature is immobilised and its Speeds are nothing anyway.
 *
 * ONCE PER MOVE, AND NOT AGAIN THIS TURN AFTER A CRITICAL. "Starts to move
 * through ... or enters it during a move action" is one check per move
 * action, however many web squares it crosses — the opposite of Spike
 * Stones' per-square bite, and the reason this is not a hazard.
 *
 * CLEARING THE WEB IS SAID, NOT DONE. Removing the squares an Athletics
 * mover left would mean cutting the Region's shape square by square; the
 * card names it for the GM, as the hazard family prints Verdant
 * Retribution's save.
 */

import { skillLadderDegree } from "./skill-ladder.mjs";
import { SKILLS } from "../config.mjs";
import { DEGREE_BY_KEY } from "../dice/resolution.mjs";

/** The row kind, and where the cast records it on the Region. */
const ENTRY_CHECK_KIND = "entryCheck";
export const ENTRY_CHECK_FLAG = "entryCheck";

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * The row, or null when it is unusable.
 * @param {object} raw
 */
export function normaliseEntryCheck(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== ENTRY_CHECK_KIND) return null;
  const skills = [];
  for (const s of Array.isArray(raw.skills) ? raw.skills : []) {
    const k = lower(s);
    if (Object.prototype.hasOwnProperty.call(SKILLS, k) && !skills.includes(k)) skills.push(k);
  }
  // OR A SAVE (3.630.0) — Pillars of Faith's thresholds: Old Law of the
  // Threshold and Threshold Ward ask a Will save of what tries to cross.
  const save = ["fortitude", "reflex", "will"].includes(lower(raw.save)) ? lower(raw.save) : "";
  if (!skills.length && !save) return null;
  const degrees = {};
  for (const [key, rung] of Object.entries(raw.degrees ?? {})) {
    const k = lower(key);
    if (!DEGREE_BY_KEY[k] || !rung || typeof rung !== "object") continue;
    degrees[k] = {
      text: text(rung.text),
      rows: Array.isArray(rung.rows) ? rung.rows.filter((r) => r && typeof r === "object") : [],
      unaffected: rung.unaffected === true,
      endsChecksThisTurn: rung.endsChecksThisTurn === true,
      clears: rung.clears === true,
      ...thresholdRung(rung)
    };
  }
  if (!Object.keys(degrees).length) return null;
  const out = {
    label: text(raw.label) || "Check",
    skills,
    degrees,
    clearsWith: lower(raw.clearsWith)
  };
  // THE THRESHOLD SHAPE (3.630.0), present only when declared so Web reads
  // exactly as it did.
  if (save) out.save = save;
  if (raw.crossingOnly === true) out.crossingOnly = true;
  if (raw.oncePerRound === true) out.oncePerRound = true;
  if (raw.hostileOnly === true) out.hostileOnly = true;
  const gate = (Array.isArray(raw.gate) ? raw.gate : []).map(normaliseGateClause).filter(Boolean);
  if (gate.length) out.gate = gate;
  return out;
}

/**
 * A threshold rung's movement consequences (3.630.0):
 *   pushBack: true     the creature is put back outside — "cannot cross"
 *   bar: "turn" | "spell" | seconds   and cannot try again for that long
 */
function thresholdRung(rung) {
  const out = {};
  if (rung.pushBack === true) out.pushBack = true;
  const bar = rung.bar;
  if (bar === "turn" || bar === "spell") out.bar = bar;
  else if (Number(bar) > 0) out.bar = Math.trunc(Number(bar));
  return out;
}

/** One clause of a gate: every axis it names must hold. */
function normaliseGateClause(raw) {
  if (!raw || typeof raw !== "object") return null;
  const types = (Array.isArray(raw.types) ? raw.types : []).map(lower).filter(Boolean);
  const traits = (Array.isArray(raw.traits) ? raw.traits : []).map(lower).filter(Boolean);
  const incorporeal = raw.incorporeal === true;
  if (!types.length && !traits.length && !incorporeal) return null;
  return { types, traits, incorporeal };
}

/**
 * Whether the creature is one the threshold stops. Any clause may hold; all
 * of a clause's axes must. "A disembodied spirit or incorporeal Undead" is
 * [{traits: ["spirit"]}, {types: ["undead"], incorporeal: true}].
 *
 * @param {object} spec
 * @param {{types?: string[], traits?: string[], incorporeal?: boolean}} facts
 */
export function entryGateHolds(spec, facts = {}) {
  if (!spec?.gate?.length) return true;
  const types = (facts.types ?? []).map(lower);
  const traits = (facts.traits ?? []).map(lower);
  return spec.gate.some((c) => (!c.types.length || c.types.some((t) => types.includes(t)))
    && (!c.traits.length || c.traits.some((t) => traits.includes(t)))
    && (!c.incorporeal || Boolean(facts.incorporeal)));
}

/** Is the creature barred from this Region now? (3.630.0) */
export function entryBarred(bars = {}, regionId, { now = 0, turnKey = null } = {}) {
  const bar = bars?.[regionId];
  if (!bar) return false;
  if (bar.spell) return true;
  if (bar.turn) return Boolean(turnKey) && bar.turn === turnKey;
  if (Number(bar.until) > 0) return now < Number(bar.until);
  return false;
}

/** The bar a rung leaves. */
export function entryBarFor(rung, { now = 0, turnKey = null } = {}) {
  if (!rung?.bar) return null;
  if (rung.bar === "spell") return { spell: true };
  if (rung.bar === "turn") return turnKey ? { turn: turnKey } : null;
  return { until: now + Number(rung.bar) };
}

/** The skill a mover rolls: the best it has of those offered; the first on a tie. */
export function entryCheckSkill(spec, totals = {}) {
  let best = spec?.skills?.[0] ?? "";
  for (const key of spec?.skills ?? []) {
    if (Number(totals[key] ?? 0) > Number(totals[best] ?? 0)) best = key;
  }
  return best;
}

/**
 * What a roll does.
 * @param {object} spec normalised
 * @param {string} rolled the degree key rolled
 * @param {string} skill the skill used
 */
export function entryCheckOutcome(spec, rolled, skill) {
  const at = skillLadderDegree(spec, rolled);
  const rung = spec?.degrees?.[at] ?? null;
  return {
    rolled: lower(rolled),
    at,
    clamped: at !== lower(rolled),
    text: rung?.text ?? "",
    rows: rung?.rows ?? [],
    unaffected: !rung || rung.unaffected === true,
    endsChecksThisTurn: Boolean(rung?.endsChecksThisTurn),
    ...(rung?.pushBack ? { pushBack: true } : {}),
    ...(rung?.bar ? { bar: rung.bar } : {}),
    clears: Boolean(rung?.clears) && Boolean(spec?.clearsWith) && lower(skill) === spec.clearsWith
  };
}

/**
 * Does this move call for a check? It does if the creature started inside
 * the area and moved, or entered a square of it.
 *
 * @param {boolean} startedInside the move's origin is in the area
 * @param {number} enteredInside squares of the area the path entered
 * @param {number} enteredAny squares the path entered at all
 */
export function entryCheckCalled(startedInside, enteredInside, enteredAny) {
  if (Number(enteredInside) > 0) return true;
  return Boolean(startedInside) && Number(enteredAny) > 0;
}

/**
 * The turn a Critical ends the checks for — "this turn", read as the combat
 * turn when there is one. Outside combat there is no turn to remember, so a
 * Critical holds for that move only.
 */
export function entryTurnKey({ combatId = null, round = null, turn = null } = {}) {
  if (!combatId || round === null || turn === null) return null;
  return `${combatId}:${round}:${turn}`;
}

/** The card's line for one creature. */
export function entryCheckLine(name, spec, outcome, skillLabel, total, dc) {
  const at = DEGREE_BY_KEY[outcome.at]?.label ?? outcome.at;
  const rolledLabel = DEGREE_BY_KEY[outcome.rolled]?.label ?? outcome.rolled;
  const readAt = outcome.clamped ? ` (${rolledLabel}, read as ${at})` : ` (${at})`;
  const what = outcome.unaffected ? "is unaffected" : (outcome.text || "is affected");
  const clears = outcome.clears
    ? " It used Athletics, so it clears the web from each square it left — remove those from the Region by hand."
    : "";
  const done = outcome.endsChecksThisTurn ? " No further checks against it this turn." : "";
  return `<strong>${spec.label}</strong> — <strong>${name}</strong> rolls ${skillLabel} `
    + `<strong>${total}</strong> vs DC <strong>${dc}</strong>${readAt}: ${what}.${done}${clears}`;
}
