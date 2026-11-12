/**
 * A CAST REACTION THAT SHAPES THE SPELL (3.684.0; Eldritch Arts Block 6, G17
 * — Appendix B's S-4). Pure; no Foundry.
 *
 * The cast reaction of 3.681.0 (Disrupting Magic) could only STOP a cast.
 * The Spellwarden's Counter Channel (sidebar 13) answers by degree:
 *
 *   "Critical Success: The spell is negated. Success: The spell's variables
 *    are halved (area, duration, targets, damage die). If the spell has no
 *    such variables, all targets of the spell receive advantage on their
 *    saving throws against it. Failure: The spell resolves as normal.
 *    Fumble: The spell's variables are doubled … else disadvantage."
 *
 * and Reflective Warding rides its Critical: "redirect the spell back at its
 * caster (as though they had cast it on themselves, using their own save
 * DC)".
 *
 * GRAHAM'S Q118, as proposed: halved or doubled are the AREA (radius or
 * length, rounded DOWN to 5 ft), the DURATION, the NUMBER OF TARGETS (min 1)
 * and the NUMBER OF DAMAGE DICE (rounded down, min 1) — "damage die" is the
 * dice count, not the die size. "If the spell has no such variables" means
 * none of the four applies. On any creature's spell (the module asks only
 * for non-allies unless turned on).
 *
 * So a cast reaction may now answer, beside `{ stop }`:
 *   scale: 0.5 | 2        the four variables, halved or doubled;
 *   saveBias: "advantage" | "disadvantage"
 *                         every target's save, applied ONLY when no variable
 *                         could be scaled (the module answers both, the core
 *                         decides which holds);
 *   retargetCaster: true  the caster becomes the spell's sole target, at its
 *                         own DC (Reflective Warding). An area spell cannot
 *                         be turned so; that is said for the GM.
 * The first answer of each kind holds; later ones are said and ignored.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** 0.5, 2, or 1 (no scaling). Pure. */
export function cleanScale(value) {
  const n = Number(value);
  if (n === 0.5 || n === 2) return n;
  return 1;
}

/**
 * Every reaction's shaping answer folded: the first `scale`, the first
 * `saveBias`, any `retargetCaster`. Pure.
 * @param {Array<object|null>} answers
 * @returns {{scale: number, saveBias: string, retargetCaster: boolean, ignored: number}}
 */
export function castReactionShape(answers = []) {
  let scale = 1;
  let saveBias = "";
  let retargetCaster = false;
  let ignored = 0;
  // 3.685.0 (H5; Eldritch Arts' Spectral Aegis and Argent Reversal):
  // `exclude` — creatures the cast lands on no longer (every answer's, joined);
  // `turnBack` — the spell resolves against its source (or another creature)
  // at the reactor's check result and Save DC (the first answer holds).
  const exclude = [];
  let turnBack = null;
  for (const a of Array.isArray(answers) ? answers : []) {
    if (!a || typeof a !== "object") continue;
    const s = cleanScale(a.scale);
    if (s !== 1) { if (scale === 1) scale = s; else ignored += 1; }
    const b = text(a.saveBias).toLowerCase();
    if (["advantage", "disadvantage"].includes(b)) { if (!saveBias) saveBias = b; else ignored += 1; }
    if (a.retargetCaster === true) retargetCaster = true;
    for (const uuid of Array.isArray(a.exclude) ? a.exclude : a.exclude ? [a.exclude] : []) {
      const u = text(uuid);
      if (u && !exclude.includes(u)) exclude.push(u);
    }
    const t = cleanTurnBack(a.turnBack);
    if (t) { if (!turnBack) turnBack = t; else ignored += 1; }
  }
  return { scale, saveBias, retargetCaster, exclude, turnBack, ignored };
}

/**
 * A `turnBack` answer, or null (3.685.0, H5). `checkTotal` is the reactor's
 * result, read as the spell's casting check (an attack spell's attack);
 * `saveDC` the reactor's Save DC, which the targets roll against; `target`
 * the token or actor uuid it lands on instead — "" for the original caster.
 * Pure.
 */
function cleanTurnBack(raw) {
  if (!raw || typeof raw !== "object") return null;
  const checkTotal = Number(raw.checkTotal);
  const saveDC = Number(raw.saveDC);
  const out = {
    checkTotal: Number.isFinite(checkTotal) ? Math.trunc(checkTotal) : null,
    saveDC: Number.isFinite(saveDC) && saveDC > 0 ? Math.trunc(saveDC) : null,
    target: text(raw.target)
  };
  if (out.checkTotal === null && out.saveDC === null) return null;
  return out;
}

/** The creatures a cast still lands on, less those excluded (3.685.0, H5). Pure. */
export function withoutExcluded(list = [], exclude = [], uuidOf = null) {
  const out = new Set((exclude ?? []).map((u) => text(u)).filter(Boolean));
  if (!out.size) return Array.isArray(list) ? list : [];
  // BY THE ACTOR'S UUID OR ITS TOKEN'S (3.685.0, review), as the targeted
  // path reads either: an unlinked creature is named by its token.
  const names = typeof uuidOf === "function"
    ? (a) => [uuidOf(a)]
    : (a) => [a?.uuid, a?.token?.uuid, a?.parent?.uuid, ...Array.from(a?.getActiveTokens?.() ?? []).map((t) => t?.document?.uuid ?? t?.uuid)];
  return (Array.isArray(list) ? list : []).filter((a) => !names(a).some((u) => out.has(text(u))));
}

/**
 * THE NUMBER OF DAMAGE DICE, scaled: every `NdX` term's count, rounded down,
 * never below 1. Flat terms are untouched. A formula with no dice is
 * returned as it is. Pure.
 * @param {string} formula "3d6 + 2", "4d6 + 1d8"
 * @param {number} factor 0.5 or 2
 */
export function scaleDiceCount(formula, factor) {
  const f = cleanScale(factor);
  const source = String(formula ?? "");
  if (f === 1 || !source) return source;
  return source.replace(/(\d*)d(\d+)/gi, (whole, count, faces) => {
    const n = count === "" ? 1 : int(count);
    return `${Math.max(1, Math.floor(n * f))}d${faces}`;
  });
}

/** Does this formula carry dice? Pure. */
export function hasDice(formula) {
  return /\d*d\d+/i.test(String(formula ?? ""));
}

/**
 * THE AREA, scaled: its first distance (feet), rounded DOWN to a 5-ft
 * square and never below 5 ft (Q118). A prose area with no distance is
 * returned as null — no such variable. Pure.
 * @returns {string|null}
 */
export function scaleAreaText(areaText, factor) {
  const f = cleanScale(factor);
  const source = text(areaText);
  if (f === 1 || !source) return null;
  const m = source.match(/(\d+)(\s*-?\s*(?:ft|feet|foot|'|’))/i);
  if (!m) return null;
  const from = int(m[1]);
  if (from <= 0) return null;
  const to = Math.max(5, Math.floor((from * f) / 5) * 5);
  return source.slice(0, m.index) + String(to) + m[2] + source.slice(m.index + m[0].length);
}

/** A round in seconds, and the units a duration is counted in, smallest first. */
const UNITS = Object.freeze([
  { re: /^rounds?$/i, one: "round", many: "rounds", inNext: null },
  { re: /^minutes?$/i, one: "minute", many: "minutes", inNext: 10 },
  { re: /^hours?$/i, one: "hour", many: "hours", inNext: 60 },
  { re: /^days?$/i, one: "day", many: "days", inNext: 24 }
]);

/**
 * THE DURATION, scaled: "N unit" halved or doubled. A half that is not whole
 * is counted in the next smaller unit (1 minute → 5 rounds; 1 hour → 30
 * minutes; 1 round → 1 round, the floor). Instantaneous, permanent, "until
 * …" and any duration with no number is no such variable: null. A trailing
 * "(S)" or "(D)" is kept. Pure.
 * @returns {string|null}
 */
export function scaleDurationText(durationText, factor) {
  const f = cleanScale(factor);
  const source = text(durationText);
  if (f === 1 || !source) return null;
  const m = source.match(/^(\d+)\s+([A-Za-z]+)(.*)$/);
  if (!m) return null;
  let n = int(m[1]);
  let at = UNITS.findIndex((u) => u.re.test(m[2]));
  if (n <= 0 || at < 0) return null;
  let scaled = n * f;
  while (!Number.isInteger(scaled) && at > 0) {
    scaled *= UNITS[at].inNext;
    at -= 1;
  }
  n = Math.max(1, Math.floor(scaled));
  const unit = n === 1 ? UNITS[at].one : UNITS[at].many;
  return `${n} ${unit}${m[3]}`;
}

/** THE NUMBER OF TARGETS, scaled: rounded down, never below 1 (Q118). Pure. */
export function scaleTargetCount(count, factor) {
  const n = Math.max(0, int(count));
  const f = cleanScale(factor);
  if (!n || f === 1) return n;
  return Math.max(1, Math.floor(n * f));
}

/**
 * WHAT THE SCALE CHANGES ON THIS CAST, and whether anything could be. Pure.
 *
 * @param {{scale: number, areaText?: string, durationText?: string, damageFormula?: string, targetCount?: number, isArea?: boolean}} cast
 * @returns {{area: string|null, duration: string|null, dice: boolean, targets: number|null, any: boolean}}
 */
export function scaledVariables({ scale = 1, areaText = "", durationText = "", damageFormula = "", targetCount = 0, isArea = false } = {}) {
  const f = cleanScale(scale);
  if (f === 1) return { area: null, duration: null, dice: false, targets: null, any: false };
  const area = scaleAreaText(areaText, f);
  const duration = scaleDurationText(durationText, f);
  const dice = hasDice(damageFormula);
  // TARGETS ARE A VARIABLE ONLY FOR A TARGETED SPELL THAT HAS SOME; an area's
  // creatures are whoever stands in it.
  const n = Math.max(0, int(targetCount));
  const targets = !isArea && n > 0 ? scaleTargetCount(n, f) : null;
  return { area, duration, dice, targets, any: Boolean(area || duration || dice || targets !== null) };
}

/** The card's line for what was scaled. Pure. */
export function scaledLine(spellName, scale, v, { targetsBefore = 0 } = {}) {
  const word = cleanScale(scale) === 2 ? "doubled" : "halved";
  const parts = [
    v.area ? `area ${v.area}` : "",
    v.duration ? `duration ${v.duration}` : "",
    v.dice ? "damage dice" : "",
    v.targets !== null && v.targets !== undefined ? `targets ${targetsBefore} → ${v.targets}` : ""
  ].filter(Boolean);
  return parts.length
    ? `<strong>${spellName}'s variables are ${word}:</strong> ${parts.join("; ")}.`
    : `<em>${spellName} has no variable to be ${word}.</em>`;
}
