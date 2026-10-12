/**
 * Light, at the moment a Perception check is rolled.
 *
 * Chapter 8: "Each light source applies a modifier to the range at which
 * your visual senses work and can also apply a penalty to visual
 * perception checks."
 *
 * Three things follow from that one sentence, and all three are why this
 * OFFERS a row rather than applying a number:
 *
 *  - the penalty is to VISUAL perception. A creature listening in the
 *    dark is not penalised for the dark, and nothing on a Perception
 *    roll tells the system which sense the player meant. That is the
 *    same judgement the pending-modifier and conditional rows already
 *    leave to a person.
 *  - a creature's own special senses change the level it perceives at,
 *    so the penalty shown is the one AFTER its Darkvision or Nightvision
 *    is taken into account — which is the pay-off for the senses work.
 *  - a level with no printed penalty offers nothing at all, rather than
 *    a row saying zero.
 *
 * Pure and Foundry-free.
 */
import {
  lightLevel,
  raiseLightLevel,
  shadowyConceals,
  shiftLightLevel,
  visualPerceptionPenalty,
  visualRangeFeet
} from "./light.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The best light step a creature's own items grant it.
 *
 * Special senses do not stack — Chapter 8 gives each its own step and a
 * creature with two takes the better, exactly as effectiveLightLevel
 * already does for the named three.
 */
export function bestLightStep(items = []) {
  let best = 0;
  for (const item of items ?? []) {
    const step = Number(item?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.light?.raisesLevelBy);
    if (Number.isFinite(step) && step > best) best = step;
  }
  return best;
}

/**
 * Is this creature concealed by the light it is standing in?
 *
 * SHADOWY (Creature Codex): "The creature is always concealed if the light
 * level is 6 (Twilight) or lower." The threshold is declared per ability
 * (`derives.light.concealedAtOrBelow`) rather than assumed, so a later
 * ability with a different one works unchanged.
 *
 * WIRED AT 3.366.0, AND IT HAD NEVER APPLIED. `shadowyConceals` existed
 * and the pack entry carried its threshold; nothing read either, so a
 * Shadowy creature was concealed only if somebody remembered to tick the
 * condition by hand. "Always" is the ability's own word.
 *
 * READ AT THE MOMENT OF THE ATTACK rather than applied as a standing
 * condition, because it is a fact about where the creature is: it changes
 * when the creature moves, when a torch is lit, and when a Region ends —
 * none of which a condition on the sheet would notice.
 *
 * @param {Array} items the creature's items
 * @param {number} level the light level where it stands
 * @returns {{concealed: boolean, threshold: number|null}}
 */
export function lightConcealment(items = [], level = null) {
  let threshold = null;
  for (const item of items ?? []) {
    const at = Number(item?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.light?.concealedAtOrBelow);
    if (Number.isFinite(at) && (threshold === null || at > threshold)) threshold = at;
  }
  if (threshold === null) return { concealed: false, threshold: null };

  // ACCEPTS EITHER SHAPE, and that is a fix rather than laziness.
  // `lightLevelForToken` returns a RESOLUTION — `{level, source}` — while
  // this rule wants the number. 3.366.0 shipped with the resolution passed
  // straight in, so `Number({level: 6})` was NaN and a Shadowy creature was
  // never concealed by anything. Found live. The two shapes both exist in
  // this codebase and callers hold the resolution, so the trap is removed
  // rather than guarded against.
  const raw = (level && typeof level === "object" && "level" in level) ? level.level : level;

  // AN UNKNOWN LEVEL CONCEALS NOBODY, and this guard is load-bearing:
  // `Number(null)` is 0, which is comfortably "at or below 6", so without
  // it a creature whose light could not be resolved — no token, no scene —
  // would come back concealed. Caught by the harness on the first run.
  //
  // IT ALSO MASKED THE BUG ABOVE, which is worth saying plainly: a guard
  // that turns a wrong-shaped argument into a polite "no" is a guard that
  // hides the caller's mistake. That is why the shape is normalised first
  // and only genuine absence falls through here.
  if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) {
    return { concealed: false, threshold };
  }
  // THE COMPARISON IS `shadowyConceals`, not a second copy of it here.
  // This function's job is finding the threshold the creature declares;
  // deciding whether a level is under it belongs to the one place that
  // already knew, and had no caller until now.
  return { concealed: shadowyConceals(raw, threshold), threshold };
}

/*
 * A CREATURE THAT SEES THE LIGHT AS DARKER THAN IT IS (3.606.0).
 *
 * SHROUD (PP 2, page 325): "The target perceives light as two steps lower
 * than it actually is, affecting their ability to sense creatures and
 * objects accordingly." Not a Region — Umbral Veil and Darkness change the
 * light in a circle for everybody in it; this changes it for ONE creature,
 * wherever it stands. So it rides the creature's own effects as a flag and
 * is folded into the two places that already ask what a creature sees the
 * light as: the Perception penalty row and the visual range report.
 *
 * APPLIED TO THE AMBIENT LEVEL FIRST, then the creature's own senses raise
 * from there. The shroud changes the light that reaches their eyes;
 * Darkvision is how their eyes deal with it. Through `shiftLightLevel`,
 * the signed function the light spells already use, because
 * `raiseLightLevel` deliberately refuses a negative.
 *
 * TWO SHROUDS DO NOT MAKE A DEEPER ONE. The most negative shift wins, the
 * way two status bonuses of one type do not stack — the same spell cast
 * twice is one spell with a fresher clock.
 */
export const LIGHT_PERCEPTION_FLAG = "lightPerceptionShift";

/** The shift a creature's own effects put on the light it perceives. */
export function perceivedLightShift(effects = []) {
  let worst = 0;
  let best = 0;
  for (const effect of effects ?? []) {
    if (effect?.disabled) continue;
    const n = Math.trunc(Number(effect?.flags?.[SYSTEM_ID]?.[LIGHT_PERCEPTION_FLAG]));
    if (!Number.isFinite(n) || n === 0) continue;
    if (n < worst) worst = n;
    if (n > best) best = n;
  }
  return worst < 0 ? worst : best;
}

/**
 * The row to offer on a Perception check, or null.
 *
 * @param {object} args
 * @param {number} args.ambientLevel The level in force where the creature is.
 * @param {Array} [args.items] The creature's items, read for light steps.
 * @param {string} [args.subject] The skill being rolled.
 * @returns {{label, value, type, hint, effectiveLevel}|null}
 */
export function lightPenaltyRow({ ambientLevel, items = [], subject = "", shift = 0 } = {}) {
  // Only Perception. The chapter attaches the penalty to perception
  // checks and nothing else, and guessing that it reaches other skills
  // would be inventing a rule.
  if (String(subject ?? "").toLowerCase() !== "perception") return null;

  const steps = bestLightStep(items);
  const shrouded = shiftLightLevel(ambientLevel, shift, 1);
  const effective = raiseLightLevel(shrouded, steps);
  const penalty = visualPerceptionPenalty(effective);
  if (!penalty) return null;

  const here = lightLevel(effective);
  const ambient = lightLevel(ambientLevel);
  const raised = steps > 0 && effective !== shrouded;
  const dimmed = Number(shift) < 0 && shrouded !== Number(ambientLevel);
  const why = [
    dimmed ? `${-Number(shift)} steps darker to them` : "",
    raised ? `+${steps} steps by their own senses` : ""
  ].filter(Boolean).join(", ");
  return {
    label: here.name,
    value: penalty,
    type: "circumstance",
    effectiveLevel: effective,
    hint: why
      ? `${ambient?.name ?? "The area"}, seen as ${here.name} (${why}) — applies if this check relies on sight`
      : `${here.name} — applies if this check relies on sight`
  };
}

/**
 * How far each VISUAL sense actually reaches in the light it is in.
 *
 * Chapter 8's sentence has two halves — "each light source applies a
 * modifier to the range at which your visual senses work AND can also
 * apply a penalty to visual perception checks." `lightPenaltyRow` above
 * has always done the second half. `visualRangeFeet` has existed for the
 * first half since it was written and had no caller at all, because the
 * senses block it belongs on was believed to be dead. It is not — it has
 * been on the sheet all along (confirmed live, 3.370.0) — so this is the
 * half of the sentence that was missing, wired at 3.371.0.
 *
 * VISUAL ONLY, and that is the whole point of the modality existing.
 * Light does not shorten a Scent or a Tremorsense, and applying the
 * multiplier to every sense would have been the easy version of this
 * function and a wrong rule. A sense with no modality recorded is left
 * alone rather than assumed to be visual.
 *
 * THE CREATURE'S OWN SENSES RAISE THE LEVEL FIRST, via the same
 * `bestLightStep` + `raiseLightLevel` pair the penalty row uses — one
 * calculation of "what does this creature see this area as", not two.
 * That ordering is what makes Darkvision worth having: it lifts the
 * level, and the range multiplier is then read off the lifted level.
 *
 * @param {object} args
 * @param {number} args.ambientLevel The level in force where the creature is.
 * @param {Array} [args.items] The creature's items, read for light steps.
 * @param {Array} [args.senses] The derived senses (`system.details.senses`).
 * @returns {{effectiveLevel:number, levelName:string, ambientName:string,
 *   raised:boolean, steps:number, blinded:boolean, rows:Array}}
 */
export function visualRangeReport({ ambientLevel, items = [], senses = [], shift = 0 } = {}) {
  const steps = bestLightStep(items);
  const effective = raiseLightLevel(shiftLightLevel(ambientLevel, shift, 1), steps);
  const here = lightLevel(effective);
  const ambient = lightLevel(ambientLevel);

  const rows = (Array.isArray(senses) ? senses : [])
    .filter((sense) => sense?.modality === "visual")
    // A tactile-range sense carries null and there is nothing to scale.
    .filter((sense) => Number.isFinite(Number(sense?.rangeFeet)))
    .map((sense) => {
      const base = Number(sense.rangeFeet);
      const feet = visualRangeFeet(base, effective);
      return {
        name: sense.name,
        baseFeet: base,
        feet,
        // Reported rather than left for the reader to spot by comparing
        // two numbers, because "unchanged" and "halved" are the two
        // answers anybody is actually looking for.
        reduced: feet < base,
        blind: feet === 0
      };
    });

  return {
    effectiveLevel: effective,
    levelName: here?.name ?? "",
    ambientName: ambient?.name ?? "",
    raised: steps > 0 && effective !== Number(ambientLevel),
    steps,
    // Handlebars has no arithmetic, so the singular case is decided here
    // rather than with a `{{#if (eq steps 1)}}` helper the templates do
    // not have. "1 step(s)" reached the live sheet before this existed.
    oneStep: steps === 1,
    // Blinding Light's printed effect is blindness, not a range change,
    // so `visualRangeFeet` deliberately returns the range unmodified.
    // Saying only "60 ft." there would be true and useless.
    blinded: Boolean(here?.blinds),
    rows
  };
}
