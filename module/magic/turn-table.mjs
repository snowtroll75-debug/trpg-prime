/**
 * A TABLE ROLLED AT THE START OF EACH OF A CREATURE'S TURNS (3.686.0, H18).
 * Pure; no Foundry.
 *
 * Core Insanity (page 300-odd; rulebook L23932): "The target is insane for 1
 * round per 2 failure and must roll on the following table at the beginning
 * of each of their turns to determine their behaviour. D10: 1 Target is
 * unaffected this round. 2-4 Target is stunned 1d3. 5-7 Target is slowed 1d3.
 * 8-10 Target is confused." "+4 PP: the target is insane for 1 round per 1
 * failure."
 *
 * Until 3.686.0 that was a `note` row: the d10 was rolled by hand each turn.
 * Graham approved H18 on 8 November 2026 (17:22, "As recommended"), knowing
 * it automates the core spell in every world. Eldritch Arts' Symbol of
 * Insanity targets each creature "with an Insanity spell using this symbol's
 * Spell Save DC" and reaches the same table through `helpers.markTurnTable`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ROW: `{ kind: "turnTable", label, die: "1d10", per: 2, rows: [{ min,
 * max, rows: [effect rows], unaffected, text }] }`. A creature the cast's save
 * reached (the failures, as any ungated row on a save spell) is marked for
 * `roundsFromMargin(margin, per)` rounds — the margin's failure, rounded
 * down, at least one round (Holy Shout's rule, condition-timing-rules.mjs) —
 * and a warp's `turnTablePer` replaces `per` (the +4 PP: "per 1 failure").
 *
 * EACH TURN'S ROLL IS THAT TURN'S BEHAVIOUR. "Target is unaffected THIS
 * ROUND" says so of the first row, and the table is rolled again the next
 * turn "to determine their behaviour": so a roll's conditions are removed
 * when the next roll is made, and when the insanity ends. Stunned's value is
 * spent by the turn's AP as stunned always is. The roll is made in the
 * turn-start pass before AP are regained, so a stun or slow rolled now
 * bites this turn.
 *
 * DEFAULT-OFF: a spell without the row is unchanged.
 */

import { roundsFromMargin } from "./condition-timing-rules.mjs";

const TURN_TABLE_KIND = "turnTable";
/** The flag the marker effect carries. */
export const TURN_TABLE_FLAG = "turnTable";
/** The cast id a roll's own effects are stamped with: `turnTable:<marker id>`. */
export const turnTableRollTag = (markerId) => `turnTable:${String(markerId ?? "")}`;

const text = (v) => String(v ?? "").trim();
const DIE = /^1d(\d+)$/i;

/** Core Insanity's table, as printed — the row the Insanity data fix declares. */
export const INSANITY_TURN_TABLE = Object.freeze({
  kind: TURN_TABLE_KIND, target: "targets", label: "Insanity", die: "1d10", per: 2,
  rows: Object.freeze([
    Object.freeze({ min: 1, max: 1, unaffected: true, text: "unaffected this round", rows: Object.freeze([]) }),
    Object.freeze({ min: 2, max: 4, text: "stunned 1d3", rows: Object.freeze([Object.freeze({ kind: "condition", target: "targets", condition: "stunned", formula: "1d3" })]) }),
    Object.freeze({ min: 5, max: 7, text: "slowed 1d3", rows: Object.freeze([Object.freeze({ kind: "condition", target: "targets", condition: "slowed", formula: "1d3" })]) }),
    Object.freeze({ min: 8, max: 10, text: "confused", rows: Object.freeze([Object.freeze({ kind: "condition", target: "targets", condition: "confused" })]) })
  ])
});

/**
 * A `turnTable` row, or null when it cannot be rolled: a die of one kind
 * ("1dN"), a positive `per`, and rows each with a range inside the die.
 */
export function normaliseTurnTable(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== TURN_TABLE_KIND) return null;
  const die = DIE.exec(text(raw.die));
  if (!die) return null;
  const faces = Number(die[1]);
  const per = Math.trunc(Number(raw.per) || 0);
  if (per < 1 || faces < 2) return null;
  const rows = [];
  for (const r of Array.isArray(raw.rows) ? raw.rows : []) {
    const min = Math.trunc(Number(r?.min)), max = Math.trunc(Number(r?.max));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > faces) return null;
    rows.push({
      min, max,
      rows: (Array.isArray(r.rows) ? r.rows : []).filter((x) => x && typeof x === "object"),
      unaffected: r.unaffected === true,
      text: text(r.text)
    });
  }
  if (!rows.length) return null;
  return { kind: TURN_TABLE_KIND, label: text(raw.label), die: `1d${faces}`, faces, per, rows };
}

/** The table's row for a roll, or null for a total no row covers. */
export function turnTableRow(spec, total) {
  const n = Math.trunc(Number(total));
  return (spec?.rows ?? []).find((r) => n >= r.min && n <= r.max) ?? null;
}

/**
 * How many of its turns the creature rolls: "1 round per 2 failure" (or the
 * warp's per), at least one; null when the save's margin was not measured.
 */
export function turnTableRounds(spec, margin, warpPer = 0) {
  if (!spec) return null;
  const per = Math.trunc(Number(warpPer) || 0) >= 1 ? Math.trunc(Number(warpPer)) : spec.per;
  return roundsFromMargin(margin, per);
}

/** The card's line for one turn's roll. */
export function turnTableLine(label, name, total, row, left) {
  const what = !row ? "no row covers it" : row.unaffected ? (row.text || "unaffected") : (row.text || "the row applies");
  return `<strong>${label}</strong> — ${name} rolls ${total}: ${what}.${left > 0 ? ` (${left} more turn${left === 1 ? "" : "s"})` : " (its last turn)"}`;
}

/**
 * A ROLL'S ROWS, SPLIT BY WHETHER THEIR CONDITION ALREADY STANDS (3.686.0; the
 * Block 8a re-review). A condition the creature does not have is laid as any
 * spell row is, stamped with the roll's own tag and its 1-round clock. One it
 * already has is not the roll's: the turn table raises a valued one's value
 * itself (and records the rise), and leaves an unvalued one alone — never its
 * cast id, its clock or its duration, and never by the general condition path.
 * Pure.
 * @param {object[]} rows the rolled row's rows
 * @param {(key: string) => boolean} isPresent
 * @returns {{fresh: object[], standing: object[]}}
 */
export function splitTurnTableRows(rows = [], isPresent = () => false) {
  const fresh = [], standing = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.kind === "condition" && r.condition && isPresent(String(r.condition))) standing.push(r);
    else fresh.push(r);
  }
  return { fresh, standing };
}

/**
 * The value once a roll's rise is taken back, or null to leave it (the Block 8a
 * re-reviews). Two rules, as the condition stacks:
 *   - one that ADDS (injured, bleeding, fatigued: `adds`): the rise
 *     (after − before) comes off what stands now, never below before;
 *   - one that KEEPS THE HIGHER (slowed, stunned, frightened…): it goes back to
 *     before only while it still stands at the roll's value — anything higher
 *     since is somebody else's (slowed 1 → 3 by the roll, then 4 from Slow,
 *     is left at 4).
 * Pure.
 * @param {{key: string, before: number, after: number, adds?: boolean}} entry
 * @param {number|null} current
 */
export function riseTakenBackTo(entry, current) {
  if (!entry || current === null || current === undefined) return null;
  const before = Number(entry.before), after = Number(entry.after), now = Number(current);
  if (!(after > before)) return null;
  if (!entry.adds) return now === after ? before : null;
  const to = Math.max(before, now - (after - before));
  return to < now ? to : null;
}

/**
 * IS THIS CREATURE ITSELF A COMBATANT IN A STARTED COMBAT (3.686.0; the Block
 * 8a re-review, H)? Only then do its turns get counted, so only then does its
 * marker go without a world-clock end. Marked from another scene, not in the
 * tracker, or in a combat not started: the clock. Pure.
 * @param {object} actor
 * @param {Iterable<object>} combats every combat in the world
 * @param {{except?: object}} [options] a combatant to leave out (one being deleted)
 */
export function countsTurnsIn(actor, combats = [], { except = null } = {}) {
  if (!actor) return false;
  for (const combat of Array.from(combats ?? [])) {
    if (!combat?.started) continue;
    for (const c of Array.from(combat.combatants ?? [])) {
      // A COMBATANT BEING DELETED is ignored, not its whole combat: a second
      // combatant of the same linked actor still counts (the re-review, J).
      if (except && c === except) continue;
      // A COMBATANT'S ACTOR IS THE TOKEN'S OWN (an unlinked token's synthetic
      // actor, a linked token's world actor), so it is matched as itself.
      if (c?.actor && (c.actor === actor || (actor.uuid && c.actor.uuid === actor.uuid))) return true;
    }
  }
  return false;
}

/** Seconds in a round, the world clock's (CONFIG.time.roundTime's default). */
export const ROUND_SECONDS = 6;

/**
 * THE MARKER'S WORLD-TIME END (3.686.0; Block 8a review): the core gives every
 * round-based spell effect a world-clock end beside its rounds, so an Insanity
 * marked outside combat (or left when combat ends) ends with its duration.
 * Refreshed at each roll to the turns still to come, so in combat the world
 * clock never ends it before its counted turns do. Pure.
 */
export function turnTableEndTime(now, turnsLeft) {
  return Number(now || 0) + Math.max(0, Math.trunc(Number(turnsLeft) || 0)) * ROUND_SECONDS;
}
