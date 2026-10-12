/**
 * A SAVE OWED BY A CREATURE THAT BEGINS ITS TURN IN A SUSTAINED AREA.
 *
 * NEW at 3.609.0, for block 33's R3 (Graham, 1 October 2026: "Yes").
 * Pure; no Foundry.
 *
 * TURN UNDEAD (PP 2, page 335), 30-foot emanation, Sustained, Will
 *   "All 1st level undead within the spells emanation that can see or hear
 *    you are affected and must make a saving throw if they begin their
 *    turn in the spells area of effect:
 *      Critical  No Effect
 *      Success   stunned 1 (even if such creatures are normally immune)
 *      Failure   gains the fleeing condition
 *      Fumble    As failure but … also takes a minor essence critical.
 *    +1 PP: increase the level of affected undead by 1
 *    Special: for every 4 levels that the undead is below your caster
 *    level, increase the severity of the critical by one step."
 *
 * It carried one note, and the note was wrong: "stunned 1 (success) up to
 * destroyed by degree". Nothing on the page destroys anything.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SAVE IS ROLLED AT THE START OF THE UNDEAD'S TURN, NOT AT THE CAST.
 * "Must make a saving throw if they begin their turn in the area" is the
 * whole trigger, so the cast rolls nothing (the row defers the save, the
 * way Sanctuary's does) and the turn clock asks, exactly where Luminance
 * asks "all creatures that BEGIN THEIR TURN in the radius".
 *
 * "1st LEVEL" IS A CEILING: an undead of that level or lower. The warp
 * raises it by one per purchase. A level the creature does not record is
 * read as 0, so an unlevelled skeleton is turned.
 *
 * THE RUNGS ARE ORDINARY EFFECT ROWS applied by the ordinary engine, as
 * `followUpSave` does. Only two things are new here: the ceiling, and a
 * critical whose severity climbs one step for every N levels the creature
 * stands below the caster — minor, serious, deadly, and no further.
 *
 * "THAT CAN SEE OR HEAR YOU" is the table's. Nothing records whether a
 * creature can perceive another; the card says it.
 */

import { DEGREE_ORDER } from "./save-ladder.mjs";
import { effectiveSaveDegree } from "./spell-degrees.mjs";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const SEVERITY_STEPS = Object.freeze(["minor", "serious", "deadly"]);

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const int = (v) => Math.trunc(Number(v) || 0);

/** A `turnSave` row, or null when it is malformed. */
export function normaliseTurnSave(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "turnSave") return null;
  const save = lower(raw.save);
  if (!SAVES.includes(save)) return null;
  const rungs = {};
  for (const [key, rows] of Object.entries(raw.rungs ?? {})) {
    const degree = lower(key);
    if (!DEGREE_ORDER.includes(degree) || !Array.isArray(rows)) continue;
    rungs[degree] = rows.filter((r) => r && typeof r === "object");
  }
  if (!Object.keys(rungs).length) return null;
  const criticalOn = {};
  for (const [key, spec] of Object.entries(raw.criticalOn ?? {})) {
    const degree = lower(key);
    const severity = lower(spec?.severity);
    const damageType = lower(spec?.damageType);
    if (!DEGREE_ORDER.includes(degree) || !SEVERITY_STEPS.includes(severity) || !damageType) continue;
    criticalOn[degree] = { severity, damageType };
  }
  const maxLevel = raw.maxLevel === undefined || raw.maxLevel === null ? null : Math.max(0, int(raw.maxLevel));
  return {
    label: text(raw.label) || "A save at the start of its turn",
    save,
    rungs,
    criticalOn,
    maxLevel,
    stepLevels: Math.max(0, int(raw.stepLevels)),
    remark: text(raw.remark)
  };
}

/**
 * The record the emanation carries, frozen at the cast: the ceiling with
 * its warps, the caster's level, and the kind the spell is keyed at.
 */
export function turnSaveRecord(spec, { levelBump = 0, casterLevel = 0, kindGate = "" } = {}) {
  if (!spec) return null;
  return {
    ...spec,
    maxLevel: spec.maxLevel === null ? null : spec.maxLevel + Math.max(0, int(levelBump)),
    casterLevel: Math.max(0, int(casterLevel)),
    kindGate: lower(kindGate)
  };
}

/** Is a creature of this level low enough to be reached? */
export function turnSaveReaches(record, level) {
  if (!record) return false;
  if (record.maxLevel === null) return true;
  return Math.max(0, int(level)) <= record.maxLevel;
}

/** The rung a rolled degree lands on, read like every other printed ladder. */
export function turnSaveOutcome(record, rolled) {
  const declared = Object.keys(record?.rungs ?? {}).map((key) => ({ onSave: [key] }));
  const key = effectiveSaveDegree(declared, rolled);
  if (!Object.prototype.hasOwnProperty.call(record?.rungs ?? {}, key)) {
    return { rung: null, rows: [], critical: null };
  }
  return { rung: key, rows: record.rungs[key], critical: record.criticalOn?.[key] ?? null };
}

/**
 * A critical's severity, stepped up for every `stepLevels` the creature
 * stands below the caster. Never past deadly; never down.
 */
export function steppedSeverity(base, { casterLevel = 0, level = 0, stepLevels = 0 } = {}) {
  const from = SEVERITY_STEPS.indexOf(lower(base));
  if (from < 0) return null;
  const per = Math.max(0, int(stepLevels));
  const gap = Math.max(0, int(casterLevel) - Math.max(0, int(level)));
  const steps = per > 0 ? Math.floor(gap / per) : 0;
  return SEVERITY_STEPS[Math.min(SEVERITY_STEPS.length - 1, from + steps)];
}

/** The card's line for one creature's save. */
export function turnSaveLine(label, name, degreeLabel, total, dc, outcome) {
  const via = outcome.rung && outcome.rung !== lower(degreeLabel) ? ` (read as ${outcome.rung})` : "";
  const nothing = !outcome.rung || (!outcome.rows.length && !outcome.critical);
  return `<strong>${label}</strong>: ${name} begins its turn in the area — `
    + `<strong>${degreeLabel}</strong> (${total} vs DC ${dc})${via}${nothing ? ", no effect" : ""}.`;
}

/** Does this spell's save wait for the creature's own turn? */
export function spellSavesOnTurnStart(effects) {
  return (Array.isArray(effects) ? effects : []).some((e) => normaliseTurnSave(e) !== null
    // AND A LADDER THAT IS ONLY EVER ROLLED AT THE START OF A TURN (3.609.0).
    // Portal Maelstrom and Incendiary Cloud print "each creature that starts
    // its turn in the spell's area must make a saving throw" and nothing
    // for the moment of casting. The cast rolled everyone's save anyway,
    // printed "is affected" and did nothing with it.
    || (String(e?.kind ?? "").toLowerCase() === "saveladder" && !e.ladder
      && String(e?.recurring?.on ?? "") === "startOfTurn")
    // AND A WALL THAT BITES ONLY A CREATURE IN IT AT THE START OF ITS TURN
    // (3.610.0, R9). Wall Of Fire prints damage for crossing it or for
    // occupying it as a turn begins, and nothing for the moment it rises.
    || (String(e?.kind ?? "") === "wall" && String(e?.turn ?? "") === "startOfTurn"));
}

/** The cast card's line: who the circle waits for, and against what. */
export function turnSaveAnnouncement(record, { radiusFeet = 0, dc = null } = {}) {
  const who = record.kindGate ? `${record.kindGate} creatures` : "creatures";
  const ceiling = record.maxLevel === null ? "" : ` of level ${record.maxLevel} or lower`;
  const saveName = record.save.charAt(0).toUpperCase() + record.save.slice(1);
  return `<em>${record.label}: ${who}${ceiling} that begin their turn within ${radiusFeet} feet roll `
    + `${saveName}${dc ? ` against DC ${dc}` : ""} while it lasts. Nothing is rolled now.</em>`;
}
