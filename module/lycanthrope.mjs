/**
 * LYCANTHROPES (3.652.0; Fiends & Fables 3.0 block 19 R6 and R7 — Graham,
 * 16 October 2026: "Go with your recommendations"). Page 145.
 *
 * SHIFT FORM rides Change Shape (change-shape.mjs) with two additions:
 *
 *   oneStep  "The lycanthrope may shift between forms one step at a time …
 *            humanoid to hybrid, hybrid to animal, animal to hybrid or hybrid
 *            to humanoid": only the forms next to the current one, in the
 *            order they are declared
 *   check    "an Easy (DC -2) level-based Meditation check must be made":
 *            the degree sets the AP — Critical 1, Success 2, Partial 3;
 *            Failure "expends 3 AP and does not change form"; Fumble "as
 *            partial but upon completion of the change, the lycanthrope
 *            enters a Luna Frenzy"
 *
 * The stat block is the hybrid and animal form's (ruling: they share it);
 * humanoid form "loses … any shape specific natural attacks (such as bite and
 * claw)". Manufactured weapons stay in every form (ruling: the book is
 * silent).
 *
 * LUNA FRENZY (`kind: "lunaFrenzy"`): "forced to enter its hybrid form … Its
 * size increases by one step. Its Intelligence gains a -5 racial penalty (min
 * -5). It gains the confused condition. It is considered to be raging and
 * gains all such modifiers." Delayed by "a Very Easy (DC -5) level based
 * Mental Focus check. A Critical delays the change for 1 hour and a Success
 * for 10 minutes … each time the degree of difficulty increases by one step."
 * "It can only stop when the full moon comes to an end": the GM ends it.
 *
 * Pure.
 */
import { DIFFICULTY_BY_KEY, stepDifficultyHarder } from "./dice/resolution.mjs";

export const LUNA_FRENZY_FLAG = "lunaFrenzy";
export const LUNA_DELAY_FLAG = "lunaFrenzyDelay";
export const LUNA_FRENZY_NAME = "Luna Frenzy";

const SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"]);
const RUNGS = Object.freeze(["critical", "success", "partial", "failure", "fumble"]);
const SKILLS = Object.freeze(["meditation", "mentalFocus"]);
/** The rungs a ladder of five does not print, read as their neighbours. */
const FOLD = Object.freeze({ heroic: "critical", blunder: "fumble" });
const rung = (degree) => FOLD[degree] ?? (RUNGS.includes(degree) ? degree : "failure");

/** The forms a creature may move to from `currentKey`: every other, or with `oneStep` only its neighbours. */
export function reachableForms(forms = [], currentKey = "", oneStep = false) {
  const others = forms.filter((f) => f.key !== currentKey);
  if (!oneStep) return others;
  const at = forms.findIndex((f) => f.key === currentKey);
  if (at < 0) return others;
  return forms.filter((_, i) => Math.abs(i - at) === 1);
}

/** A shift check's declaration, normalised; null when there is none. */
export function shiftCheckSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const skill = SKILLS.includes(String(raw.skill ?? "")) ? String(raw.skill) : "meditation";
  const difficulty = DIFFICULTY_BY_KEY[String(raw.difficulty ?? "")] ? String(raw.difficulty) : "medium";
  const ap = {};
  for (const r of RUNGS) ap[r] = Math.max(0, Math.trunc(Number(raw.ap?.[r]) || 0));
  const set = (v) => (Array.isArray(v) ? v : []).map((x) => rung(String(x))).filter((x) => RUNGS.includes(x));
  return { skill, difficulty, ap, noChange: set(raw.noChange), frenzy: set(raw.frenzy) };
}

/** The DC of a level-based check at this difficulty. */
export function levelCheckDC(levelDC, difficulty) {
  return Math.trunc(Number(levelDC) || 0) + Number(DIFFICULTY_BY_KEY[difficulty]?.modifier ?? 0);
}

/** What a degree does: the AP it costs, whether the form changes, whether Luna Frenzy follows. */
export function shiftOutcome(check, degree) {
  const r = rung(String(degree ?? ""));
  return { rung: r, ap: check?.ap?.[r] ?? 0, changes: !(check?.noChange ?? []).includes(r), frenzy: (check?.frenzy ?? []).includes(r) };
}

/** A size moved by steps along the ladder, clamped. */
export function steppedSize(size, steps = 1) {
  const at = SIZES.indexOf(String(size ?? "").toLowerCase());
  if (at < 0) return "";
  return SIZES[Math.max(0, Math.min(SIZES.length - 1, at + Math.trunc(Number(steps) || 0)))];
}

/**
 * "A -5 racial penalty (min -5)": the change to Intelligence that leaves it
 * no lower than the minimum — and never raises it.
 */
export function frenzyIntelligenceDelta(intelligence, penalty = -5, minimum = -5) {
  const now = Math.trunc(Number(intelligence) || 0);
  return Math.min(0, Math.max(Math.trunc(Number(penalty) || 0), Math.trunc(Number(minimum) || 0) - now));
}

/** The Luna Frenzy declaration, normalised. */
export function lunaFrenzySpec(raw = {}) {
  const delay = raw?.delay && typeof raw.delay === "object" ? raw.delay : {};
  return {
    sizeSteps: Math.trunc(Number(raw?.sizeSteps ?? 1) || 0),
    intPenalty: Math.trunc(Number(raw?.intPenalty ?? -5) || 0),
    intMinimum: Math.trunc(Number(raw?.intMinimum ?? -5) || 0),
    forcedForm: String(raw?.forcedForm ?? "hybrid"),
    delay: {
      skill: SKILLS.includes(String(delay.skill ?? "")) ? String(delay.skill) : "mentalFocus",
      difficulty: DIFFICULTY_BY_KEY[String(delay.difficulty ?? "")] ? String(delay.difficulty) : "veryEasy",
      criticalSeconds: Math.max(0, Math.trunc(Number(delay.criticalSeconds ?? 3600) || 0)),
      successSeconds: Math.max(0, Math.trunc(Number(delay.successSeconds ?? 600) || 0))
    }
  };
}

/** The Luna Frenzy effect: its size and Intelligence. Confused and raging are laid beside it. */
export function lunaFrenzyEffectData(spec, { ownSize = "", intelligence = 0, itemName = LUNA_FRENZY_NAME } = {}) {
  const size = steppedSize(ownSize, spec.sizeSteps);
  const intDelta = frenzyIntelligenceDelta(intelligence, spec.intPenalty, spec.intMinimum);
  const changes = [];
  if (size && size !== String(ownSize).toLowerCase()) changes.push({ key: "system.identity.size", type: "override", value: size, priority: 50 });
  if (intDelta) changes.push({ key: "system.attributes.intelligence.racial", type: "add", value: String(intDelta), priority: 20 });
  return { name: itemName, img: "icons/svg/terror.svg", changes, flags: { "trg-prime": { [LUNA_FRENZY_FLAG]: { size, intDelta } } }, size, intDelta };
}

/** The delay check's difficulty after `prior` successful delays: one step harder each time. */
export function lunaDelayDifficulty(base = "veryEasy", prior = 0) {
  let key = base;
  for (let i = 0; i < Math.max(0, Math.trunc(Number(prior) || 0)); i += 1) key = stepDifficultyHarder(key);
  return key;
}

/** Seconds a delay buys at this degree: an hour on a Critical, ten minutes on a Success, else none. */
export function lunaDelaySeconds(spec, degree) {
  const r = rung(String(degree ?? ""));
  if (r === "critical") return spec.delay.criticalSeconds;
  if (r === "success") return spec.delay.successSeconds;
  return 0;
}

/** Whether a creature is in Luna Frenzy now. */
export function inLunaFrenzy(effects = []) {
  return Array.from(effects ?? []).some((e) => !e?.disabled && e?.flags?.["trg-prime"]?.[LUNA_FRENZY_FLAG]);
}
