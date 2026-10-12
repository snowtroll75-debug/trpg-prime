/**
 * A SPELL CAST IN ANSWER TO A SAVE, DECLARED AS A ROW (3.625.0). Pure.
 *
 * Lucky Break (3.612.0) is wired by NAME in save-reaction-spells.mjs: the
 * saver casts it, rerolls, and is immune for ten minutes. Pillars of
 * Faith's SAINTLY INTERCESSION is the same shape cast by SOMEBODY ELSE:
 *
 *   "Reaction; Trigger an ally within range fails (but does not fumble or
 *    blunder) a saving throw. The target rerolls the failed saving throw
 *    and keeps the new result, then is immune to this spell for 10
 *    minutes. +2 PP: it may answer a Fumble. +4 PP: a Blunder. +4 PP: +2
 *    status to the reroll."
 *
 * So the rule is DATA on the spell —
 *
 *   { kind: "saveReroll", degrees: ["partial", "failure"], immunity: "10 minutes" }
 *
 * — with two warp mods the chooser folds in: `rerollDegrees` (more degrees
 * it may answer) and `rerollBonus` (a status bonus to the second roll).
 * The workflow (save-reaction-spells-workflow.mjs) finds every creature on
 * the saver's side holding such a spell, in range, able to react, and
 * offers the cast once the degree is known, exactly where Lucky Break is
 * offered. The spell's applier case prints a line and applies nothing,
 * because the row is reached from the save, not from the cast.
 */

const DEGREES = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
const UNITS = Object.freeze({ round: 6, rounds: 6, minute: 60, minutes: 60, hour: 3600, hours: 3600, day: 86400, days: 86400 });

const lower = (v) => String(v ?? "").trim().toLowerCase();

/** One authored saveReroll row, or null when it is malformed. */
export function normaliseSaveReroll(raw) {
  if (!raw || lower(raw.kind) !== "savereroll") return null;
  const degrees = (Array.isArray(raw.degrees) ? raw.degrees : []).map(lower).filter((d) => DEGREES.includes(d));
  if (!degrees.length) return null;
  let seconds = 0;
  const m = /^\s*(\d+)\s*([a-z]+)\s*$/i.exec(String(raw.immunity ?? ""));
  if (m && UNITS[m[2].toLowerCase()]) seconds = Number(m[1]) * UNITS[m[2].toLowerCase()];
  return { degrees, immunitySeconds: seconds };
}

/** The saveReroll row a spell carries, or null. */
export function saveRerollOf(spellSystem) {
  for (const row of Array.isArray(spellSystem?.effects) ? spellSystem.effects : []) {
    const spec = normaliseSaveReroll(row);
    if (spec) return spec;
  }
  return null;
}

/**
 * The degrees a spell could answer at all — its row's, plus any a warp
 * could buy — so the offer is made before the chooser rather than after.
 */
export function offerableDegrees(spec, warps = []) {
  const out = new Set(spec?.degrees ?? []);
  for (const w of Array.isArray(warps) ? warps : []) {
    for (const d of Array.isArray(w?.mods?.rerollDegrees) ? w.mods.rerollDegrees : []) if (DEGREES.includes(lower(d))) out.add(lower(d));
  }
  return [...out];
}

/** Does the cast, as warped, answer this degree? */
export function rerollCovers(spec, warpMods, degreeKey) {
  const key = lower(degreeKey);
  if ((spec?.degrees ?? []).includes(key)) return true;
  return (Array.isArray(warpMods?.rerollDegrees) ? warpMods.rerollDegrees : []).map(lower).includes(key);
}

/** The status modifier a warp buys for the second roll, or null. */
export function rerollModifier(warpMods, spellName) {
  const bonus = Math.max(0, Math.trunc(Number(warpMods?.rerollBonus) || 0));
  return bonus ? { label: spellName, value: bonus, type: "status" } : null;
}

/** The card line after the reroll. */
export function saveRerollLine(spellName, casterName, firstLabel, firstTotal, saverName, bonus = 0, immunitySeconds = 0) {
  // THE ROW'S OWN FIGURE (3.625.1): "for a while" said nothing a GM could
  // check against the page; the seconds the row declared are said back.
  const secs = Math.max(0, Math.trunc(Number(immunitySeconds) || 0));
  const span = secs <= 0 ? "" : secs % 3600 === 0 ? `${secs / 3600} hour${secs === 3600 ? "" : "s"}`
    : secs % 60 === 0 ? `${secs / 60} minute${secs === 60 ? "" : "s"}` : `${secs} seconds`;
  return `<em>${spellName} (${casterName}): ${saverName}'s ${firstLabel} (${firstTotal}) is rerolled${bonus ? ` at +${bonus} status` : ""} — the second result stands; ${saverName} is immune to ${spellName}${span ? ` for ${span}` : " for a while"}.</em>`;
}
