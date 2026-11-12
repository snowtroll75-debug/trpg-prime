/**
 * STORM OF VENGEANCE (PP 20, page 334) — one storm, five strikes.
 *
 * NEW at 3.610.0, the last of block 33 (Graham's rulings of 1 October 2026,
 * "As recommended"). Pure; no Foundry. The rolling is in
 * magic/storm-workflow.mjs.
 *
 *   "When you Cast this Spell and the first time each round you Sustain the
 *    Spell, you can choose one of the following storm effects. You can't
 *    choose the same effect twice in a row."
 *      Acid Rain   4d8 acid to each creature in the storm, no save.
 *      Hail        4d10 bludgeoning, basic Fortitude.
 *      Lightning   up to 10 bolts at creatures of your choice in the storm,
 *                  no more than one each, 4d12 electricity, basic Reflex.
 *      Rain and Wind  the area becomes difficult terrain, and everything
 *                  seen within or through it is concealed.
 *      Thunderclap Fortitude or deafened for 10 minutes; a creature that
 *                  succeeds is immune to thunderclaps for 1 hour.
 *
 * WHAT WAS WRONG. The pack held a Fortitude save on 4d8 acid — Acid Rain's
 * damage on Thunderclap's save — so a cast rolled a save that is not Basic,
 * dealt nothing, and offered none of the five.
 *
 * THE STORM IS A REGION that remembers what it last did. The mode is chosen
 * at the cast and on each Sustain, and the one just used is not offered.
 * Rain and Wind lasts until another mode replaces it: it is the weather,
 * not a blow.
 */

/** The flag the storm's Region carries. */
export const STORM_FLAG = "storm";
/** Where a creature's thunderclap immunity is kept, by world time. */
export const THUNDER_IMMUNE_FLAG = "stormThunderImmune";

const text = (v) => String(v ?? "").trim();
const DICE = /^\d+d\d+(\s*\+\s*\d+)?$/i;
const SAVES = ["fortitude", "reflex", "will"];

/** One mode, or null. */
function normaliseMode(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = text(raw.key);
  if (!key) return null;
  const formula = text(raw.formula);
  if (formula && !DICE.test(formula)) return null;
  const save = text(raw.save).toLowerCase();
  if (save && !SAVES.includes(save)) return null;
  return {
    key,
    label: text(raw.label) || key,
    formula,
    type: text(raw.type).toLowerCase(),
    save,
    basic: raw.basic === true,
    bolts: Math.max(0, Math.trunc(Number(raw.bolts) || 0)),
    condition: text(raw.condition).toLowerCase(),
    duration: text(raw.duration),
    immunity: text(raw.immunity),
    terrain: raw.terrain === true,
    screen: raw.screen === true
  };
}

/**
 * A `storm` row, or null.
 *
 * AND HOW IT STRIKES (3.687.0, H16; Eldritch Arts Block 8b — Storm of
 * Unmaking: "When you initially cast the spell and then at the beginning of
 * each of your turns, roll 1d6"; its fumble, "storm appears above you and
 * follows you wherever you go"). All three default to Storm of Vengeance's
 * reading, so a row that says none of them is unchanged:
 *   pick     "choose" (the caster picks, never the same twice running) or
 *            "roll" (a die over the modes, in order; repeats allowed);
 *   strikes  "sustain" (the cast and the first Sustain each round) or
 *            "turnStart" (the cast and the start of each of the caster's
 *            turns; a Sustain strikes nothing);
 *   follow   true: the storm's circle moves with its caster's token.
 */
export function normaliseStorm(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== "storm") return null;
  const modes = (Array.isArray(raw.modes) ? raw.modes : []).map(normaliseMode).filter(Boolean);
  if (modes.length < 2) return null;
  const pick = text(raw.pick).toLowerCase() === "roll" ? "roll" : "choose";
  const strikes = text(raw.strikes) === "turnStart" ? "turnStart" : "sustain";
  return { label: text(raw.label) || "Storm", modes, pick, strikes, follow: raw.follow === true };
}

/** What may be chosen now: everything but the last (a rolled storm may repeat). */
export function stormModesOffered(spec, last = "") {
  if (spec?.pick === "roll") return [...(spec?.modes ?? [])];
  return (spec?.modes ?? []).filter((m) => m.key !== text(last));
}

/** The die a rolled storm rolls: one face a mode ("1d6" for six). */
export function stormDie(spec) {
  const n = (spec?.modes ?? []).length;
  return n >= 2 ? `1d${n}` : "";
}

/** The mode a face of that die names, in printed order; null off the die. */
export function stormModeForFace(spec, face) {
  const n = Math.trunc(Number(face));
  const modes = spec?.modes ?? [];
  return Number.isFinite(n) && n >= 1 && n <= modes.length ? modes[n - 1] : null;
}

/** Has a storm with its own clock (one a module raised, H16) run out? */
export function stormExpired(record, worldTime) {
  const until = Number(record?.until);
  return record?.ownExpiry === true && Number.isFinite(until) && Number(worldTime) >= until;
}

/** Is this creature still immune to thunderclaps? */
export function thunderImmune(until, worldTime) {
  const t = Number(until);
  return Number.isFinite(t) && Number(worldTime) < t;
}

/**
 * Has a Sustain already chosen a strike this round? (3.610.1, F2.)
 * "the first time each round you Sustain the Spell" — a second Sustain in
 * the same round keeps the storm going and strikes nothing. With no round
 * (out of combat) every Sustain is the first.
 */
export function stormStruckThisRound(lastRound, round) {
  if (round === null || round === undefined || !Number.isFinite(Number(round))) return false;
  if (lastRound === null || lastRound === undefined || lastRound === "") return false;
  return Number(lastRound) === Number(round);
}

/** Seconds in a printed span ("1 hour", "10 minutes"). */
export function spanSeconds(span) {
  const m = text(span).toLowerCase().match(/^(\d+)\s*(round|minute|hour|day)s?$/);
  if (!m) return 0;
  return Number(m[1]) * { round: 6, minute: 60, hour: 3600, day: 86400 }[m[2]];
}

/** The card's heading for a strike. */
export function stormStrikeLine(spec, mode, dc) {
  const how = mode.save
    ? ` — ${mode.basic ? "Basic " : ""}${mode.save.charAt(0).toUpperCase() + mode.save.slice(1)} save, DC ${dc}`
    : mode.formula ? " — no save" : "";
  return `<strong>${spec.label}: ${mode.label}</strong>${mode.formula ? ` (${mode.formula} ${mode.type})` : ""}${how}.`;
}
