/**
 * A SECOND SAVING THROW THAT ONE OUTCOME OF THE FIRST CALLS FOR.
 *
 * NEW at 3.609.0, for block 33's R5 (Graham, 1 October 2026: "As
 * recommended"). Pure; no Foundry.
 *
 * THREE SPELLS PRINT IT, AND ALL THREE WERE PROSE.
 *
 *   UMBRAL BLAST (page 333)    "A target that takes a critical injury must
 *                               also make a Fortitude Save.
 *                                 Success  unaffected.
 *                                 Failure  blinded for 1 round per point of
 *                                          failure.
 *                                 Fumble   blinded for an unlimited duration."
 *   VISION OF HAVOC (page 337) "On a fumble, the creature must also make a
 *                               Reflex save. Failure … it becomes stunned
 *                               for a duration of 1 minute. The affected
 *                               creature can attempt a new Will save at the
 *                               end of each of its turns."
 *   PHANTASMAL KILLER          Fumble: "It must attempt a Fortitude save; if
 *                               the target fails, it dies. On a successful
 *                               Fortitude save, the target takes 12d6 … a
 *                               Deadly Critical, is fleeing … and is
 *                               frightened 4."
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO WAYS IN. A row with `onSave` is reached by the first save's degree,
 * exactly as every other gated row is (Vision Of Havoc, Phantasmal
 * Killer). A row with `trigger: "critical"` is reached by the creatures
 * the cast landed a critical injury on (Umbral Blast) — a fact the save
 * path records on each result, because nothing else can know it.
 *
 * ONE WAY OUT. The second save's rung names ordinary effect rows, and they
 * are applied by the ordinary engine with THIS save's degree and margin —
 * so "1 round per point of failure" is `roundsPerMargin` reading the
 * second save's margin, not the first's, and a repeating Will save is the
 * `conditionSave` every other condition uses. Nothing here re-implements
 * a condition. The only thing a rung can say that a row cannot is "it
 * dies", which is `slays`.
 *
 * THE RUNGS ARE READ LIKE EVERY OTHER PRINTED LADDER (spell-degrees.mjs):
 * a degree the spell does not name takes the nearest named one no better
 * than it, a Heroic reads at a printed Critical, and a save-side degree
 * with nothing printed escapes.
 */

import { DEGREE_ORDER } from "./save-ladder.mjs";
import { effectiveSaveDegree } from "./spell-degrees.mjs";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const TRIGGERS = Object.freeze(["critical"]);

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * A `followUpSave` row, or null when it is malformed.
 *
 * MALFORMED IS NULL AND THE CARD SAYS SO — a second save nobody can roll is
 * the silent half-spell this project keeps finding.
 */
export function normaliseFollowUpSave(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "followUpSave") return null;
  const save = lower(raw.save);
  if (!SAVES.includes(save)) return null;
  const trigger = lower(raw.trigger);
  if (trigger && !TRIGGERS.includes(trigger)) return null;
  const rungs = {};
  for (const [key, value] of Object.entries(raw.rungs ?? {})) {
    const degree = lower(key);
    if (!DEGREE_ORDER.includes(degree)) continue;
    const spec = Array.isArray(value) ? { rows: value } : (value && typeof value === "object" ? value : null);
    if (!spec) continue;
    rungs[degree] = {
      rows: (Array.isArray(spec.rows) ? spec.rows : []).filter((r) => r && typeof r === "object"),
      slays: spec.slays === true
    };
  }
  if (!Object.keys(rungs).length) return null;
  return { label: text(raw.label) || "A second save", save, trigger: trigger || null, rungs };
}

/**
 * What the second save's degree does.
 *
 * @returns {{rung: string|null, rows: Array<object>, slays: boolean}}
 */
export function followUpOutcome(spec, rolled) {
  const declared = Object.keys(spec?.rungs ?? {}).map((key) => ({ onSave: [key] }));
  const key = effectiveSaveDegree(declared, rolled);
  const rung = spec?.rungs?.[key] ?? null;
  if (!rung) return { rung: null, rows: [], slays: false };
  return { rung: key, rows: rung.rows, slays: rung.slays };
}

/** The card's line for one creature's second save. */
export function followUpLine(spec, name, degreeLabel, total, dc, outcome) {
  const saveName = spec.save.charAt(0).toUpperCase() + spec.save.slice(1);
  const via = outcome.rung && outcome.rung !== lower(degreeLabel) ? ` (read as ${outcome.rung})` : "";
  const what = outcome.slays ? " — <strong>it dies</strong>"
    : (!outcome.rung || (!outcome.rows.length)) ? " — unaffected" : "";
  return `${spec.label}: <strong>${name}</strong> — ${saveName} <strong>${degreeLabel}</strong> `
    + `(${total} vs DC ${dc})${via}${what}.`;
}
