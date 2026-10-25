/**
 * A failed save turned into a success, at a price (3.627.0).
 *
 * Pillars of Faith, Chapter 9 — Iron Will of the Tomb (Unliving Mummy):
 * "once per round when you fail such a Will save [against fear effects and
 * mental effects that would charm, compel, possess, confuse, control, or
 * otherwise overwhelm your will], you may harden your mind into sepulchral
 * stillness. You become Slowed 1 until the end of your next turn and treat
 * the failed save as a success instead. You cannot use this benefit if you
 * are unconscious, unable to act, or already unable to gain AP on your next
 * turn."
 *
 * "FAIL" is read as Failure, Fumble or Blunder — not Partial, which the
 * degree table counts as a partial success (the Chapter 9 audit's default
 * reading, unchallenged by Graham on 7 Oct 2026).
 *
 * THE TRAITS. A save does not always know what forced it, so the same
 * position the item rerolls take (3.626.0): where the check carries traits
 * and none is named, nothing is offered; where it carries none, the offer
 * says what the benefit answers and the table decides.
 *
 * Declaration, on any applied effect:
 *
 *   flags.trg-prime.saveConvert = {
 *     label, saves: ["will"], traits: ["fear", "mental", …],
 *     from: ["failure", "fumble", "blunder"],
 *     cost: { condition: "slowed", value: 1 },
 *     oncePerRound: true
 *   }
 *
 * Pure.
 */
import { DEGREE_BY_KEY, bonusCheckModifier } from "../dice/resolution.mjs";

const SYSTEM_ID = "trg-prime";
const SAVE_CONVERT_FLAG = "saveConvert";
/** Conditions under which a creature cannot "harden its mind" — unconscious or unable to act. */
const CANNOT_ACT = Object.freeze(["unconscious", "paralyzed", "petrified", "stunned", "dying", "dead"]);
const lower = (v) => String(v ?? "").trim().toLowerCase();
const list = (v) => (Array.isArray(v) ? v : []).map(lower).filter(Boolean);

/**
 * ONE DEGREE BETTER (3.630.0) — Pillars of Faith's Communal Litany: "it may
 * improve the final result of that saving throw by one degree. Failure
 * becomes Partial. Partial becomes Success. Fumble becomes Failure. Blunder
 * becomes Fumble." The printed list, not a ladder lookup, so a Success is
 * never offered a Critical.
 */
const IMPROVE_ONE_DEGREE = Object.freeze({ blunder: "fumble", fumble: "failure", failure: "partial", partial: "success" });

function normaliseSaveConvert(raw) {
  if (!raw || typeof raw !== "object") return null;
  const saves = list(raw.saves);
  if (!saves.length) return null;
  const improve = raw.improve === true;
  const from = list(raw.from).filter((d) => DEGREE_BY_KEY[d] && (!improve || IMPROVE_ONE_DEGREE[d]));
  const out = {
    label: String(raw.label ?? "").trim() || "Save conversion",
    saves,
    traits: list(raw.traits),
    from: from.length ? from : (improve ? Object.keys(IMPROVE_ONE_DEGREE) : ["failure", "fumble", "blunder"]),
    cost: raw.cost && typeof raw.cost === "object" && lower(raw.cost.condition)
      ? { condition: lower(raw.cost.condition), value: Math.max(1, Math.trunc(Number(raw.cost.value) || 1)) }
      : null,
    oncePerRound: raw.oncePerRound === true
  };
  // Keys added only when set, so a 3.627.0 declaration reads as it did.
  if (improve) out.improve = true;
  // A COUNTED BENEFIT (3.630.0): "Once a creature has improved a saving
  // throw using Communal Litany, it cannot benefit from the spell again
  // during that casting" — once, twice with the warp. The effect carries
  // what is left and goes when it reaches 0.
  const uses = Math.trunc(Number(raw.uses) || 0);
  if (uses > 0) out.uses = uses;
  return out;
}

export function declaredSaveConverts(effects = []) {
  return declaredSaveConvertSources(effects).map((row) => row.spec);
}

/** The same, each with the effect that carries it, so a counted one can be spent. */
export function declaredSaveConvertSources(effects = []) {
  const out = [];
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.[SAVE_CONVERT_FLAG];
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      const spec = normaliseSaveConvert(row);
      if (spec && !out.some((s) => s.spec.label === spec.label)) out.push({ spec, effect });
    }
  }
  return out;
}

/** Where this conversion takes the degree: one better, or a Success. */
export function convertTarget(spec, degreeKey) {
  return spec?.improve ? (IMPROVE_ONE_DEGREE[lower(degreeKey)] ?? null) : "success";
}

/**
 * Whether to offer, and how sure the offer is.
 *
 * @returns {null|"offer"|"ask"} "ask" when the save's traits are unknown
 */
export function saveConvertVerdict(spec, { save = "", degree = "", traits = [], conditions = [], used = {} } = {}) {
  if (!spec) return null;
  if (!spec.saves.includes(lower(save))) return null;
  if (!spec.from.includes(lower(degree))) return null;
  if (spec.oncePerRound && used?.[`convert:${spec.label}`]) return null;
  const held = new Set(Array.from(conditions ?? []).map(lower));
  if (CANNOT_ACT.some((c) => held.has(c))) return null;
  if (!spec.traits.length) return "offer";
  const known = list(Array.isArray(traits) ? traits : String(traits ?? "").split(/[,;]/));
  if (!known.length) return "ask";
  return spec.traits.some((t) => known.includes(t)) ? "offer" : null;
}

/** The outcome, now a success; the first degree kept as `shiftedFrom`. */
export function convertedOutcome(outcome, to = "success") {
  const from = outcome?.degree?.key;
  if (!from || !DEGREE_BY_KEY[to]) return outcome;
  return { ...outcome, degree: DEGREE_BY_KEY[to], bonusCheck: bonusCheckModifier(to), shiftedFrom: from };
}

/**
 * AN OUTCOME DECLARED AT A DEGREE (3.669.2): a day's first declared `exact`
 * (Tianzhi Discipline: "a Critical result without the need for a roll").
 * The degree is set, the outcome marked declared (the card then reads
 * "Declared — the dice do not count"), and no Chaos banner rides with dice
 * nobody reads. Unchanged when there is no degree yet (a DC the GM sets
 * later: the card applies this when it arrives) or the key is unknown.
 *
 * @param {object} outcome from buildOutcome
 * @param {string} degreeKey
 * @returns {object}
 */
export function declaredAt(outcome, degreeKey) {
  const set = convertedOutcome(outcome, String(degreeKey ?? ""));
  if (set === outcome) return outcome;
  return { ...set, shiftedFrom: undefined, declared: true, chaos: false };
}
