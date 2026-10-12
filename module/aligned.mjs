/**
 * The Aligned trait, expanded (Creature Codex, Appendix — Aligned).
 *
 * "The Aligned Trait in TRG connects creatures, items, or places to a
 * particular alignment, such as Balance, Chaos, Evil, Good, or Order."
 *
 * WHAT WAS ALREADY HERE. The five traits, and which damage harms which
 * creature — `creature-traits.mjs` has carried `ALIGNMENT_OPPOSITES` and
 * `alignedDamageAffects` since the Codex's Chapter 7 work. What the
 * appendix adds is everything else: how strongly a trait registers, how
 * it is detected, and the rules by which one aligned creature takes
 * control of another.
 *
 * A DIFFERENT CONCEPT FROM A CHARACTER'S ETHIC, and the distinction is
 * already recorded in `creature-traits.mjs`: these five are creature and
 * damage TRAITS, not the fifteen-entry role-play alignment a player
 * picks on the sheet. Nothing here reads `system.identity.ethics`.
 *
 * Pure logic, no Foundry API — the action that spends the AP and applies
 * the condition is `aligned-control-workflow.mjs`.
 */

import { creatureTraits, hasCreatureTrait } from "./creature-traits.mjs";

/** "Each aligned trait (Balance, Chaos, Evil, Good, Order)…" */
export const ALIGNED_TRAITS = Object.freeze(["balance", "chaos", "evil", "good", "order"]);

/** What each one is, in the appendix's own words. */
export const ALIGNED_TRAIT_MEANINGS = Object.freeze({
  balance: "Represents neutrality, maintaining equilibrium between opposing forces.",
  chaos: "Represents unpredictability and destruction, fuelled by chaotic energy.",
  evil: "Draws from malevolent energies tied to malicious intents and corruption.",
  good: "Represents benevolent forces, focused on protection and growth.",
  order: "Associated with structure, law, and purpose, coming from planes of order."
});

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/** "…to sense creatures or items sharing your trait within 60 feet." */
export const PASSIVE_DETECTION_FEET = 60;

/** "You gain a +1-circumstance bonus to such detection if your trait matches." */
export const ACTIVE_DETECTION_BONUS = Object.freeze({ value: 1, type: "circumstance" });

/**
 * The aura strength ladder, by level.
 *
 * Held as thresholds rather than as five ranges, because the last band
 * is open-ended ("21+") and a range with no top is a range waiting for a
 * caller to fall off the end of it.
 */
export const AURA_STRENGTHS = Object.freeze([
  { from: 0, label: "Faint" },
  { from: 6, label: "Moderate" },
  { from: 11, label: "Strong" },
  { from: 16, label: "Powerful" },
  { from: 21, label: "Overwhelming" }
]);

/** "The level of a mortal creature is five lower when determining aura strength." */
export const MORTAL_AURA_LEVEL_ADJUSTMENT = -5;

/**
 * How strongly a creature, item or spell's aligned trait registers.
 *
 * A MORTAL IS FIVE LEVELS QUIETER, which is the whole reason this takes
 * a flag rather than only a number: the appendix's ladder is about outer
 * planar energy, and a mortal carrying a trait is a borrowed echo of it.
 * A level driven below zero still reads Faint — there is no band under
 * the first, and a negative level is not a sixth strength.
 *
 * @param {number} level
 * @param {object} options
 * @param {boolean} options.mortal
 */
export function auraStrength(level, { mortal = false } = {}) {
  const adjusted = Math.trunc(Number(level) || 0) + (mortal ? MORTAL_AURA_LEVEL_ADJUSTMENT : 0);
  let found = AURA_STRENGTHS[0];
  for (const band of AURA_STRENGTHS) {
    if (adjusted >= band.from) found = band;
  }
  return { label: found.label, level: adjusted, mortal: Boolean(mortal) };
}

/* ------------------------------------------------------------------ */
/* Control                                                             */
/* ------------------------------------------------------------------ */

/**
 * "the controlling creature must share an aligned trait … and be at
 * least 6 levels higher than the target. If both creatures share the
 * same creature type … at least 4 levels higher."
 */
export const CONTROL_LEVEL_GAP = Object.freeze({ different: 6, sameType: 4 });

/** The traits an actor carries that are aligned ones. */
export function alignedTraitsOf(actorSystem) {
  const carried = new Set(creatureTraits(actorSystem));
  return ALIGNED_TRAITS.filter((trait) => carried.has(trait));
}

/**
 * The twelve creature types, for the control rule's own distinction.
 *
 * "If both creatures share the same creature type (e.g., both are
 * demons, angels, or undead), the controlling creature needs to be at
 * least 4 levels higher."
 *
 * WHY THIS LIST HAS TO EXIST. A creature's traits hold its type AND its
 * alignment in one field, so "do they share a trait" is not the same
 * question as "do they share a creature type" — and answering the second
 * with the first makes an Eternal and an Undead into the same type
 * because both are Evil. That halves the level gap the appendix asks
 * for, on a comparison that looked reasonable. Found by a harness check
 * that expected 6 and got 4.
 *
 * The twelve are the creature-types pack's own, and a check asserts this
 * list is that pack's names.
 */
export const CREATURE_TYPES = Object.freeze([
  "aberration", "animal", "beast", "construct", "elemental", "eternal",
  "fey", "humanoid", "ooze", "plant", "undead", "wyrm"
]);

/**
 * The creature type an actor IS.
 *
 * READS THE TYPE, NOT THE TRAIT LINE, and the distinction is the whole reason
 * this function exists twice over. Graham, 15 Aug 2026: a Creature Type
 * "determines a number of core abilities" and changes when the creature does —
 * a humanoid who dies and rises as a zombie becomes Undead — whereas a Creature
 * Trait "is used to determine if certain effects and spells affect a character"
 * and provides "no mechanical modifiers".
 *
 * This function feeds a MECHANICAL MODIFIER: `sharesCreatureType` below halves
 * the control level gap from 6 to 4. So it must ask the type.
 *
 * It used to read the trait line, and that was invisible because every shipped
 * statblock types its type into both places — the Aboleth is type Aberration
 * and traits "Aberration, Huge" — so the two always agreed. 3.314.0's Form
 * spells broke the agreement on purpose: a druid in Beast form carries the
 * `beast` TRAIT and is still Humanoid by TYPE, and would otherwise have been
 * handed a Beast's control gap by a trait that is not allowed to hand out
 * anything.
 *
 * `details.creatureType` is derived by the actor document from its owned
 * creature-type item; see prepareGrantedTraits in documents/actor.mjs. An actor
 * with no such item — which is every player character until a GM gives it one —
 * has no type, and correctly shares one with nobody.
 *
 * The OTHER question, "does this spell affect that creature", is a trait
 * question and is answered by `isOfKind` in kind-targeting.mjs, which reads
 * both. The two look contradictory side by side and are not: one asks what a
 * creature IS, the other asks what a spell may REACH.
 */
export function creatureTypesOf(actorSystem) {
  const type = String(actorSystem?.details?.creatureType ?? "").trim().toLowerCase();
  return CREATURE_TYPES.filter((known) => known === type);
}

/** Do two creatures share a creature type? */
export function sharesCreatureType(controllerSystem, targetSystem) {
  const theirs = new Set(creatureTypesOf(targetSystem));
  return creatureTypesOf(controllerSystem).some((type) => theirs.has(type));
}

/** The aligned traits two creatures have in common. */
export function sharedAlignedTraits(controllerSystem, targetSystem) {
  const theirs = new Set(alignedTraitsOf(targetSystem));
  return alignedTraitsOf(controllerSystem).filter((trait) => theirs.has(trait));
}

/**
 * May this creature attempt to control that one?
 *
 * THREE REQUIREMENTS, AND THEY ARE SEPARATE ON PURPOSE: a shared trait,
 * a level gap, and the core rulebook's Control Level cap. Each can fail
 * on its own and each is reported on its own, because "you cannot do
 * that" without saying which of the three stopped you is the kind of
 * answer that sends somebody to the book.
 *
 * THE ALIGNMENT REQUIREMENT CAN BE WAIVED. Grave Authority controls an
 * undead "as if using the Aligned Control rules (with no alignment
 * restrictions)" — so the waiver is a parameter rather than a second
 * copy of this function, and the LEVEL gap and the Control Level cap
 * still apply to it.
 *
 * THE CONTROL LEVEL CAP IS THE CORE RULEBOOK'S and is already derived on
 * every actor (`system.magic.controlLevels`). "A creature cannot control
 * another if it exceeds their allowed Control Level, regardless of their
 * level advantage" — so it is checked against what is ALREADY
 * controlled plus this target, not against this target alone.
 *
 * @param {object} options
 * @param {number} options.controllerLevel
 * @param {number} options.targetLevel
 * @param {string[]} options.shared aligned traits held in common
 * @param {boolean} options.sameCreatureType
 * @param {boolean} options.ignoreAlignment Grave Authority's waiver
 * @param {boolean} options.requiresUndead   Grave Authority's own limit
 * @param {boolean} options.targetIsUndead   from `isUndead`
 * @param {number} options.controlLevelCap  system.magic.controlLevels
 * @param {number} options.controlledAlready total levels already held
 */
export function alignedControlEligibility({
  controllerLevel = 0,
  targetLevel = 0,
  shared = [],
  sameCreatureType = false,
  ignoreAlignment = false,
  requiresUndead = false,
  targetIsUndead = false,
  controlLevelCap = 0,
  controlledAlready = 0
} = {}) {
  const problems = [];
  const controller = Math.trunc(Number(controllerLevel) || 0);
  const target = Math.trunc(Number(targetLevel) || 0);
  const needed = sameCreatureType ? CONTROL_LEVEL_GAP.sameType : CONTROL_LEVEL_GAP.different;

  if (!ignoreAlignment && !(shared ?? []).length) {
    problems.push("the controller and the target share no aligned trait");
  }
  // A ROUTE'S OWN LIMIT, reported beside the others rather than as a
  // separate refusal, for the reason this function exists at all: "you
  // cannot do that" without saying which requirement stopped you is the
  // kind of answer that sends somebody to the book.
  if (requiresUndead && !targetIsUndead) {
    problems.push("Grave Authority reaches only undead creatures");
  }
  if (controller - target < needed) {
    problems.push(
      `the controller must be at least ${needed} levels higher${
        sameCreatureType ? " (same creature type)" : ""} — ${controller} against ${target}`);
  }
  // ─────────────────────────────────────────────────────────────────
  // OVER THE CAP IS A WARNING, NOT A REFUSAL (3.585.0, Graham's R4).
  //
  // This used to `problems.push(...)`, which made the attempt
  // impossible. Page 242 does not forbid it:
  //
  //   "You may have an amount of creature levels controlled at any one
  //    time equal to your control levels. If you exceed this amount then
  //    the highest-level creature ... can make a DC 20 Will saving throw
  //    every round to release itself."
  //
  // The rule is pressure applied to a caster who has over-reached, and
  // refusing the attempt hid it entirely — nothing in the system could
  // ever be over the cap, so the DC 20 save had nothing to fire on.
  // Reported separately from `problems` so callers can say so on the
  // card without the attempt failing its requirements.
  const cap = Math.max(0, Math.trunc(Number(controlLevelCap) || 0));
  const held = Math.max(0, Math.trunc(Number(controlledAlready) || 0));
  const wouldHold = held + target;
  const overBy = Math.max(0, wouldHold - cap);

  return {
    able: problems.length === 0,
    problems,
    overCap: overBy > 0,
    overBy,
    wouldHold,
    cap,
    needed,
    gap: controller - target,
    shared: [...(shared ?? [])],
    ignoreAlignment: Boolean(ignoreAlignment),
    requiresUndead: Boolean(requiresUndead)
  };
}

/* ------------------------------------------------------------------ */
/* The action's outcomes                                               */
/* ------------------------------------------------------------------ */

/** A minute and an hour, in seconds, so a duration is one figure. */
export const CONTROL_DURATIONS = Object.freeze({ minute: 60, hour: 3600 });

/**
 * What an Aligned Control attempt does, by degree.
 *
 * FIVE DEGREES ARE PRINTED and six exist. Heroic and Blunder are not on
 * the page, and the convention this project already follows for a sparse
 * outcome table is that an unlisted degree is read as its nearest listed
 * neighbour in the same direction — Heroic as Critical, Blunder as
 * Fumble. Stated here rather than left to a default, because a Blunder
 * silently reading as "no effect" would be the opposite of what it is.
 *
 * @param {string} degreeKey
 */
export function alignedControlOutcome(degreeKey) {
  switch (String(degreeKey ?? "").toLowerCase()) {
    case "heroic":
    case "critical":
      return {
        controlled: false,
        seconds: 0,
        duration: "",
        immuneUntilPreparation: true,
        text: "The target shrugs off the attempt of control and cannot be controlled by this creature again until after their next daily preparation."
      };
    case "success":
      return {
        controlled: false,
        seconds: 0,
        duration: "",
        immuneUntilPreparation: false,
        text: "The target shrugs off the attempt of control."
      };
    case "partial":
      return {
        controlled: true,
        seconds: CONTROL_DURATIONS.minute,
        duration: "1 minute",
        newSaveAtEnd: true,
        immuneUntilPreparation: false,
        text: "The target gains the Controlled condition for 1 minute. At the end of this time, they may make a new saving throw to resist the effects."
      };
    case "failure":
      return {
        controlled: true,
        seconds: CONTROL_DURATIONS.hour,
        duration: "1 hour",
        newSaveAtEnd: true,
        immuneUntilPreparation: false,
        text: "The target gains the Controlled condition for 1 hour. At the end of this time, they may make a new saving throw to resist the effects."
      };
    case "fumble":
    case "blunder":
      return {
        controlled: true,
        seconds: Infinity,
        duration: "permanent",
        newSaveAtEnd: false,
        immuneUntilPreparation: false,
        text: "The target gains the Controlled condition with a permanent duration."
      };
    default:
      // An unrecognised degree controls nothing. Inventing a duration
      // for a degree that does not exist would be inventing a rule.
      return {
        controlled: false, seconds: 0, duration: "", immuneUntilPreparation: false,
        text: "No effect."
      };
  }
}

/**
 * "the target may make a new saving throw to resist if the controller or
 * any of their allies take any kind of hostile action against them."
 *
 * Held as a sentence rather than a mechanism: whether an action was
 * hostile is a judgement, and this system's convention is that a fact
 * only a person holds is stated rather than assumed.
 */
export const HOSTILE_ACTION_BREAKS_CONTROL =
  "Be aware that the target may make a new saving throw to resist if the controller or any of their allies take any kind of hostile action against them.";

/* ------------------------------------------------------------------ */
/* Who may take the action at all                                      */
/* ------------------------------------------------------------------ */

/**
 * The feats that grant Aligned Control to somebody who would not
 * otherwise have it, and what each one reaches.
 *
 * Both are Codex feats that were blocked on this appendix for four
 * releases, and neither is a button: they are ROUTES to an action that
 * now exists.
 */
export const ALIGNED_CONTROL_FEATS = Object.freeze({
  "ebon bind": {
    label: "Ebon Bind",
    reaches: "a creature from the shadescape you have summoned or struck a deal with",
    ignoreAlignment: false
  },
  "grave authority": {
    label: "Grave Authority",
    reaches: "an undead creature",
    // "as if using the Aligned Control rules (with no alignment
    // restrictions)" — the one waiver in the appendix.
    ignoreAlignment: true,
    // AND ITS OWN RESTRICTION, which until 3.363.0 was printed on the
    // card and enforced nowhere: `isUndead` existed, was tested, and had
    // no caller. The waiver applied while the limit did not, so Grave
    // Authority reached ANY creature — strictly more than the feat says,
    // and more than the trait route it is supposed to be a narrow
    // alternative to. Found by tools/verify-rules-have-callers.mjs.
    requiresUndead: true
  }
});

/**
 * May this actor take Aligned Control, and by what route?
 *
 * Three routes, and they are not exclusive: a creature with an aligned
 * trait of its own, and either feat. Returned as a list so the action's
 * card can say which one is being used and the sheet can gate on whether
 * there is any.
 *
 * @param {object} actorSystem
 * @param {string[]} featNames the actor's feat names
 */
export function alignedControlAccess(actorSystem, featNames = []) {
  const routes = [];
  const traits = alignedTraitsOf(actorSystem);
  if (traits.length) {
    routes.push({
      key: "trait",
      label: `Aligned (${traits.join(", ")})`,
      reaches: "a creature, item or place sharing one of your aligned traits",
      ignoreAlignment: false
    });
  }
  const owned = new Set((featNames ?? []).map((name) => String(name ?? "").trim().toLowerCase()));
  for (const [key, feat] of Object.entries(ALIGNED_CONTROL_FEATS)) {
    if (!owned.has(key)) continue;
    routes.push({
      key,
      label: feat.label,
      reaches: feat.reaches,
      ignoreAlignment: feat.ignoreAlignment,
      requiresUndead: Boolean(feat.requiresUndead)
    });
  }
  return { available: routes.length > 0, routes };
}

/** Undead, for Grave Authority's own restriction on what it reaches. */
export function isUndead(actorSystem) {
  return hasCreatureTrait(actorSystem, "undead");
}

/**
 * Is this creature MORTAL, for the aura ladder's five-level reduction?
 *
 * The appendix never defines the word, but it uses it once against
 * Eternal — "Many creatures of the Eternal type will have such weakness.
 * Mortal creatures rarely possess such weakness" — and Eternal is one of
 * this system's twelve creature types. So mortal is read as **not
 * Eternal**, which is the only distinction the appendix itself draws.
 *
 * RECORDED AS A READING. If a Wyrm or an Elemental should count as
 * outer-planar for this purpose, that is a ruling and this is the one
 * line it changes.
 */
export const NON_MORTAL_TYPES = Object.freeze(["eternal"]);

export function isMortal(actorSystem) {
  return !NON_MORTAL_TYPES.some((type) => hasCreatureTrait(actorSystem, type));
}
