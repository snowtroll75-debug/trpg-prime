/**
 * A SPELL THAT BINDS HOW A CREATURE MAY MOVE, RE-SAVED EACH TURN.
 *
 * NEW at 3.606.0, for block 32's R1 (the second half). Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SPIRIT TRAP (PP 2, page 330), Will, 1 creature, 1 minute
 *
 *   "You pin the target's shadow to its current location.
 *      Critical  The creature is unaffected.
 *      Success   All terrain is considered difficult to the target, and
 *                they make a new saving throw at the beginning of their
 *                next turn.
 *      Failure   The target cannot move more than 5 feet from their
 *                current location, and they may make a new saving throw
 *                at the beginning of their next turn.
 *      Fumble    As failure except the effect lasts for the duration with
 *                no further saving throw."
 *
 * The pack carried `effects: []`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO THINGS NOTHING COULD SAY, AND ONE THING NOTHING DID.
 *
 *   DIFFICULT TERRAIN FOR ONE CREATURE. Every difficult ground in this
 *   system is a Region, and a Region is difficult for whoever walks on it.
 *   "All terrain is considered difficult TO THE TARGET" is a fact about
 *   the creature, wherever it goes — so it is a pricing floor the movement
 *   hook applies to that creature alone: a path costs at least twice its
 *   length. Ground that was already difficult costs what it did.
 *
 *   A LEASH. "Cannot move more than 5 feet from their current location" is
 *   a refusal, asked where every other refusal is asked — the movement
 *   hook — against the square the creature stood in when the rung landed.
 *
 *   A NEW SAVE EACH TURN THAT RE-READS THE WHOLE LADDER. Apocalypse prints
 *   the same sentence ("a fresh saving throw at the beginning of their
 *   next turn") and there it plainly re-runs the ladder, because its
 *   Critical makes the target immune. So a new save here is read the same
 *   way: the degree rolled picks the rung for the next round. A Critical
 *   frees the creature; a Success loosens a leash to heavy ground; a
 *   Failure tightens heavy ground to a leash; a Fumble locks it for the
 *   rest of the spell. Reported to Graham as a reading, with Apocalypse as
 *   the reason, rather than settled in silence.
 */

import { DEGREE_ORDER } from "./save-ladder.mjs";

/** The flag the target's effect carries. */
export const MOVEMENT_BIND_FLAG = "movementBind";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * A movement-bind row, or null when it is malformed.
 *
 * AN EMPTY RUNG IS "UNAFFECTED", declared rather than missing — Spirit
 * Trap's Critical. A rung that is neither empty nor a real bind is refused
 * with the whole row, for the reason `normaliseSaveLadder` refuses bad
 * dice: a bind nobody can enforce is worse than one that fails to load.
 */
export function normaliseMovementBind(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "movementBind") return null;
  const save = lower(raw.save);
  if (!SAVES.includes(save)) return null;

  const rungs = {};
  for (const key of DEGREE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(raw.rungs ?? {}, key)) continue;
    const r = raw.rungs[key];
    if (!r || typeof r !== "object") return null;
    const leash = r.leashFeet === undefined || r.leashFeet === null ? null : Math.trunc(Number(r.leashFeet));
    if (leash !== null && (!Number.isFinite(leash) || leash < 0)) return null;
    rungs[key] = {
      difficult: r.difficult === true,
      leashFeet: leash,
      resave: r.resave === true
    };
  }
  if (!Object.keys(rungs).length) return null;
  return { save, rungs, label: text(raw.label) || "The spell" };
}

/**
 * Which printed rung a rolled degree reads at.
 *
 * DOWN FIRST, then the worst printed rung — the save ladder's own walk, so
 * a Heroic reads at the Critical and a Blunder at the Fumble.
 */
function bindRung(spec, rolled) {
  const from = DEGREE_ORDER.indexOf(lower(rolled));
  if (from < 0 || !spec) return null;
  const has = (k) => Object.prototype.hasOwnProperty.call(spec.rungs, k);
  for (let i = from; i < DEGREE_ORDER.length; i += 1) if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];
  for (let i = DEGREE_ORDER.length - 1; i >= 0; i -= 1) if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];
  return null;
}

/** What one degree does: null when the creature goes free. */
export function bindOutcome(spec, rolled) {
  const rung = bindRung(spec, rolled);
  const r = rung ? spec.rungs[rung] : null;
  if (!r || (!r.difficult && r.leashFeet === null)) return { rung, free: true, bind: null };
  return { rung, free: false, bind: { difficult: r.difficult, leashFeet: r.leashFeet, resave: r.resave } };
}

/**
 * What a move costs a creature for whom all terrain is difficult.
 *
 * A FLOOR, NOT A MULTIPLIER. Doubling a path Foundry already priced as
 * difficult would make the ground formidable; "considered difficult" makes
 * everything at least difficult and nothing worse than it already was.
 */
export function difficultFloor(cost, distance) {
  const c = Math.max(0, Number(cost) || 0);
  const d = Math.max(0, Number(distance) || 0);
  return Math.max(c, d * 2);
}

/**
 * Does a leash refuse a point this far from its anchor?
 *
 * THE BOUNDARY IS ALLOWED. "No more than 5 feet" includes five.
 */
export function leashRefuses(feetFromAnchor, leashFeet) {
  if (leashFeet === null || leashFeet === undefined) return false;
  const d = Number(feetFromAnchor);
  if (!Number.isFinite(d)) return false;
  return d > Number(leashFeet);
}

/** The refusal the movement hook shows. */
export function leashRefusalLine(name, label, leashFeet, feet) {
  return `${name} cannot move more than ${leashFeet} feet from where ${label} pinned them `
    + `(that point is ${feet} feet away).`;
}

/** The card line for a rung landing, at the cast or at a new save. */
export function bindLine(name, label, rolled, outcome) {
  const deg = (d) => (d ? d.charAt(0).toUpperCase() + d.slice(1) : "—");
  const via = outcome.rung && outcome.rung !== lower(rolled) ? ` (read as ${deg(outcome.rung)})` : "";
  if (outcome.free) return `<strong>${name}</strong> — ${deg(lower(rolled))}${via}: free of ${label}.`;
  const parts = [];
  if (outcome.bind.difficult) parts.push("all terrain is difficult to them");
  if (outcome.bind.leashFeet !== null) parts.push(`cannot move more than ${outcome.bind.leashFeet} feet`);
  const next = outcome.bind.resave ? " New save at the start of their next turn." : " No further save.";
  return `<strong>${name}</strong> — ${deg(lower(rolled))}${via}: ${parts.join(" and ")}.${next}`;
}
