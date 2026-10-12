/**
 * A SAVE OWED WHEN THE SPELL ENDS.
 *
 * NEW at 3.606.0, for block 32's R1. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SPEED (PP 4, page 329)
 *
 *   "Magic empowers the target to act faster. It gains the quickened
 *    condition … When the spell ends, the target must make a Will Saving
 *    Throw.
 *      Critical  The target is fatigued 1.
 *      Success   The target is fatigued 2.
 *      Failure   The target is fatigued 3.
 *      Fumble    The target is fatigued 4 and takes a minor mental
 *                critical."
 *
 * The pack carried quickened and a note that told the GM all of that, so
 * the whole second half of the spell — the price of it — lived in
 * somebody's memory for a minute of game time.
 *
 * ─────────────────────────────────────────────────────────────────────
 * MEASURED: SPEED IS THE ONLY SPELL THAT PRINTS THIS SENTENCE. The
 * rulebook has one "When the spell ends, the target must make a … Saving
 * Throw". So this is named for what it is and built once, the way the
 * skill ladder was for Shape Stone, rather than as a Speed special case —
 * and it rides the condition's own effect, so every route by which a
 * spell ends (its clock, a Dismiss, a Dispel, a GM clearing the token)
 * owes the save, because every one of them deletes that effect.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EVERY DEGREE NAMES A VALUE, SO THE LADDER IS READ FULLY.
 *
 * Speed prints all four rungs, including the Critical — a critical save
 * still costs fatigue 1. So there is no "unaffected" rung here, and a
 * Heroic reads at the Critical rung rather than escaping: the walk is the
 * save ladder's own (nearest printed rung no better than the roll, and
 * the best printed rung for a roll better than all of them).
 */

import { DEGREE_ORDER } from "./save-ladder.mjs";

/** The flag the effect carries. */
export const END_SAVE_FLAG = "endSave";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const SEVERITIES = Object.freeze(["minor", "serious", "deadly"]);
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * An end-of-spell save, or null when it is malformed.
 *
 * @param {object} raw as authored on the condition row, plus `saveDC`
 */
export function normaliseEndSave(raw) {
  if (!raw || typeof raw !== "object") return null;
  const save = lower(raw.save);
  if (!SAVES.includes(save)) return null;
  const condition = text(raw.condition);
  if (!condition) return null;

  const values = {};
  for (const key of DEGREE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(raw.values ?? {}, key)) continue;
    const n = Math.trunc(Number(raw.values[key]));
    if (!Number.isFinite(n) || n < 0) return null;
    values[key] = n;
  }
  if (!Object.keys(values).length) return null;

  const criticalOn = {};
  for (const [key, severity] of Object.entries(raw.criticalOn ?? {})) {
    if (DEGREE_ORDER.includes(lower(key)) && SEVERITIES.includes(lower(severity))) {
      criticalOn[lower(key)] = lower(severity);
    }
  }
  const dc = Math.trunc(Number(raw.saveDC));

  return {
    save,
    condition,
    values,
    criticalOn,
    criticalType: lower(raw.criticalType) || "mental",
    label: text(raw.label) || "The spell",
    // A DC OF ZERO IS NOT A DC. Refused at the moment of rolling rather
    // than here, so the card can say which spell forgot it.
    saveDC: Number.isFinite(dc) && dc > 0 ? dc : null
  };
}

/** Which printed rung a rolled degree reads at. Module-local: `endSaveOutcome` is the door. */
function endSaveRung(spec, rolled) {
  const from = DEGREE_ORDER.indexOf(lower(rolled));
  if (from < 0 || !spec) return null;
  const has = (k) => Object.prototype.hasOwnProperty.call(spec.values, k);
  for (let i = from; i < DEGREE_ORDER.length; i += 1) if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];
  // BETTER THAN EVERY PRINTED RUNG — a Heroic against Speed — reads at the
  // BEST printed one. Speed charges a Critical fatigue 1, and a Heroic that
  // escaped the price altogether would be a rule nobody wrote.
  for (let i = from; i >= 0; i -= 1) if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];
  for (const k of DEGREE_ORDER) if (has(k)) return k;
  return null;
}

/** What the save costs on this degree. */
export function endSaveOutcome(spec, rolled) {
  const rung = endSaveRung(spec, rolled);
  if (!rung) return { rung: null, value: 0, severity: null };
  return { rung, value: spec.values[rung], severity: spec.criticalOn[rung] ?? null };
}

/** The card line. */
export function endSaveLine(spec, name, rolled, outcome, total) {
  const label = (d) => (d ? d.charAt(0).toUpperCase() + d.slice(1) : "—");
  const via = outcome.rung && outcome.rung !== lower(rolled) ? ` (read as ${label(outcome.rung)})` : "";
  const condition = spec.condition.charAt(0).toUpperCase() + spec.condition.slice(1);
  const cost = outcome.value > 0 ? `<strong>${condition} ${outcome.value}</strong>` : "nothing";
  const injury = outcome.severity ? `, and a <strong>${outcome.severity} ${spec.criticalType}</strong> critical` : "";
  return `<strong>${spec.label} ends.</strong> ${name} rolls a ${label(spec.save)} save: `
    + `<strong>${total}</strong> vs DC ${spec.saveDC} — ${label(lower(rolled))}${via}: ${cost}${injury}.`;
}
