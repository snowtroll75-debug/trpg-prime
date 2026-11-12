/**
 * A REROLL AFTER YOUR OWN FUMBLE (3.669.0; Inner Tempest's Fortune's
 * Reversal: "Action R; Trigger you fumble an attack check, skill check or
 * saving throw. Reroll the triggering check and use the second result, even
 * if it is worse."). Pure: which of the actor's items offer it.
 *
 * Declared on a feat or ability:
 *
 *   flags.trg-prime.fumbleReroll: {
 *     checkTypes: ["attack", "skill", "save"],   // which fumbles it answers
 *     reaction: true,                            // costs the reaction in combat
 *     label: "Fortune's Reversal",
 *     subjects: ["arcana", "occultism"],         // optional (3.675.0): only these skills / saves
 *     degrees: ["failure", "fumble", "blunder"]  // optional (3.677.0): the results it answers
 *   }
 *
 * THE RESULTS IT ANSWERS (3.677.0; Eldritch Arts v1.6's Esoteric Insight:
 * "when you get a failure or fumble result on an Arcana or Occultism check,
 * you may reroll the check"). `degrees` names them; none means a Fumble or a
 * Blunder, as before (Graham's B5-5 of 24 October 2026 put the Blunder with
 * the Fumble). Skill checks and saves only: an attack's fumble is the
 * confirmed one, and has no Failure to answer.
 *
 * SCOPED TO SKILLS (3.675.0; Eldritch Arts Block 1, C4). Esoteric Insight:
 * "once per day, when you fumble an Arcana or Occultism check, you may
 * reroll the check." `subjects` names the skill (or save) keys it answers;
 * a check whose subject is not listed is not offered it. No `subjects`
 * means every subject, as before.
 *
 * An item with a counted use (a Focus ability) needs one left; the workflow
 * spends it. An attack's fumble is the confirmed one (the fumble check
 * failed), asked before the fumble table; a skill check's or a save's is the
 * Fumble degree, asked before the result is read.
 */

const KINDS = Object.freeze(["attack", "skill", "save"]);
/** What a reroll answers when it names nothing: a Fumble, and a Blunder (B5-5). */
export const DEFAULT_REROLL_DEGREES = Object.freeze(["fumble", "blunder"]);
/** Every result a reroll may name (3.677.0). */
export const REROLL_DEGREES = Object.freeze(["partial", "failure", "fumble", "blunder"]);

/** The fumble-reroll rows an item list offers for one kind of check, at one result. */
export function fumbleRerollRows(items = [], kind = "", subject = "", degree = "fumble") {
  const want = String(kind ?? "").trim().toLowerCase();
  const about = String(subject ?? "").trim().toLowerCase();
  const result = String(degree ?? "").trim().toLowerCase() || "fumble";
  if (!KINDS.includes(want)) return [];
  const out = [];
  for (const item of Array.isArray(items) ? items : Array.from(items ?? [])) {
    if (!item || !["feat", "ability"].includes(item.type)) continue;
    if (item.type === "ability" && item.system?.active === false) continue;
    const raw = item.flags?.["trg-prime"]?.fumbleReroll;
    if (!raw || typeof raw !== "object") continue;
    const types = (Array.isArray(raw.checkTypes) ? raw.checkTypes : KINDS).map((t) => String(t).trim().toLowerCase());
    if (!types.includes(want)) continue;
    const subjects = (Array.isArray(raw.subjects) ? raw.subjects : []).map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
    if (subjects.length && !subjects.includes(about)) continue;
    const named = (Array.isArray(raw.degrees) ? raw.degrees : []).map((d) => String(d ?? "").trim().toLowerCase()).filter((d) => REROLL_DEGREES.includes(d));
    if (!(named.length ? named : DEFAULT_REROLL_DEGREES).includes(result)) continue;
    out.push({ item, label: String(raw.label ?? item.name).trim() || item.name, reaction: raw.reaction !== false });
  }
  return out;
}

/**
 * WHAT IT IS CALLED (3.669.2; found live): a Blunder offered the reroll
 * (B5-5) was told "You fumbled", and its card said "the fumble is
 * rerolled". The word follows the degree; anything but a Blunder is a
 * fumble, as before.
 *
 * @param {string} degree the first result's degree key
 * @returns {{verb: string, noun: string}}
 */
export function fumbleWords(degree = "") {
  const k = String(degree ?? "").trim().toLowerCase();
  // A FAILURE OR A PARTIAL (3.677.0; Esoteric Insight) is called what it is.
  if (k === "failure") return { verb: "failed", noun: "failure" };
  if (k === "partial") return { verb: "only partly succeeded at", noun: "partial result" };
  return k === "blunder"
    ? { verb: "blundered", noun: "blunder" }
    : { verb: "fumbled", noun: "fumble" };
}

/**
 * Could any reroll answer this result? (3.677.0) The check asks before it
 * loads the workflow, so a Failure costs nothing for an actor with none.
 *
 * @param {object[]} items
 * @param {"skill"|"save"} kind
 * @param {string} subject
 * @param {string} degree
 */
export function rerollAnswers(items = [], kind = "", subject = "", degree = "") {
  return fumbleRerollRows(items, kind, subject, degree).length > 0;
}
