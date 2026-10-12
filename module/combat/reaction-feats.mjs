/**
 * The thirteen Chapter 5 feats that react to somebody else's action.
 *
 * One shape, thirteen triggers. Each is a Reaction (two are Free
 * actions) that fires off an event the system already knows about — an
 * attack landing, a fumble, a shield block, a creature walking away —
 * and most of them answer with an attack that ignores the multiple
 * attack penalty.
 *
 * WHY THEY ARE ONE TABLE AND NOT THIRTEEN HANDLERS. Every one of them
 * has to ask the same four questions: does this actor hold the feat, is
 * the trigger the right one, are its requirements met right now, and can
 * this actor still react at all. Thirteen copies of those four questions
 * is thirteen places for the reaction economy to drift — and this
 * chapter has already paid for that mistake twice (the `prepared` stamp,
 * the reload button). The table declares; `offeredReactionFeats` decides.
 *
 * WHAT THIS FILE DELIBERATELY DOES NOT DO. It never reads a Foundry
 * document. Everything here takes plain values and returns plain values,
 * so the harness can drive the actual rule rather than read it back —
 * see reaction-feats-workflow.mjs for the half that needs a world.
 */

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/* ------------------------------------------------------------------ */
/* The triggers                                                        */
/* ------------------------------------------------------------------ */

/**
 * Every moment a reaction feat can fire on.
 *
 * Named for what HAPPENED, not for the feat that wants it — several
 * triggers serve more than one feat, and a trigger named "cleave" would
 * have to be renamed the moment a second feat wanted the same moment.
 */
export const TRIGGERS = Object.freeze({
  /** Your Strike dropped a target and another foe is in reach. */
  incapacitatedInReach: "incapacitatedInReach",
  /** You took an action with the Attack trait. */
  youAttacked: "youAttacked",
  /** An enemy's attack damaged you, without a critical. */
  damagedYou: "damagedYou",
  /** An enemy's attack damaged an ally near you. */
  damagedAlly: "damagedAlly",
  /** An ally in your reach was hit, and you can see the attacker. */
  allyHit: "allyHit",
  /** A creature in your reach fumbled a Strike. */
  fumbleInReach: "fumbleInReach",
  /** An attack missed you by your shield's contribution to DB. */
  missedByShield: "missedByShield",
  /** You used the Shield Block reaction. */
  shieldBlocked: "shieldBlocked",
  /** A creature in your reach moved away from you. */
  movedAway: "movedAway"
});

/* ------------------------------------------------------------------ */
/* Requirements                                                        */
/* ------------------------------------------------------------------ */

/**
 * The "Requirements" line each feat prints, as a key this file can test.
 *
 * Declared rather than inlined so that a feat and its requirement cannot
 * drift apart, and so the harness can drive every requirement against
 * every feat instead of trusting that the right `if` was written.
 */
export const REQUIREMENTS = Object.freeze({
  mediumOrHeavyArmour: "mediumOrHeavyArmour",
  oneHandedWithFreeHand: "oneHandedWithFreeHand",
  doubleStance: "doubleStance",
  oneHandedOrShield: "oneHandedOrShield",
  shield: "shield",
  // NOT GEAR — a fact about the TRIGGERING ATTACK. Armoured Counter
  // prints "inflicts HP damage with no critical", and the no-critical
  // half has to be asked at offer time like any other requirement or it
  // becomes an `if` in the detection code that nothing can drive.
  noCritical: "noCritical"
});

/** What each requirement means, for a card that has to explain a refusal. */
export const REQUIREMENT_TEXT = Object.freeze({
  mediumOrHeavyArmour: "you must be wearing medium or heavy armour",
  oneHandedWithFreeHand: "you must wield a weapon in one hand with the other free",
  doubleStance: "you must be in Double Stance",
  oneHandedOrShield: "you must be wielding a one-handed weapon or a shield",
  shield: "you must be wielding a shield",
  noCritical: "the triggering attack was a critical"
});

/**
 * Is this requirement met, given what the actor's gear and stances say?
 *
 * @param {string} key
 * @param {object} state
 * @param {string} [state.armourCategory]  "light" | "medium" | "heavy" | ""
 * @param {boolean} [state.oneHandedWeapon]
 * @param {boolean} [state.freeHand]
 * @param {boolean} [state.shield]
 * @param {string[]} [state.stances]
 * @returns {boolean}
 */
export function meetsRequirement(key, state = {}) {
  const stances = (state.stances ?? []).map(normalise);
  switch (key) {
    case REQUIREMENTS.mediumOrHeavyArmour:
      return ["medium", "heavy"].includes(normalise(state.armourCategory));
    case REQUIREMENTS.oneHandedWithFreeHand:
      return Boolean(state.oneHandedWeapon) && Boolean(state.freeHand);
    case REQUIREMENTS.doubleStance:
      return stances.includes("double stance");
    case REQUIREMENTS.oneHandedOrShield:
      return Boolean(state.oneHandedWeapon) || Boolean(state.shield);
    case REQUIREMENTS.shield:
      return Boolean(state.shield);
    case REQUIREMENTS.noCritical:
      return state.noCritical !== false;
    default:
      // AN UNKNOWN REQUIREMENT IS NOT MET. Returning true would mean a
      // typo in the table silently removes a restriction, which is the
      // direction that hands out free power.
      return false;
  }
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

/**
 * feat (normalised) → what it reacts to and what it costs.
 *
 * `cost` is "reaction" or "free" exactly as printed — Disarm Block and
 * Offensive Parry are Free actions that ride on a reaction somebody has
 * already spent, and charging them a second reaction would make both
 * unusable in the turn they exist for.
 *
 * `traits` feeds the Battle Readiness gate, which allows a Fighter's
 * extra reaction only on a Reaction with the Attack or Martial trait.
 * Getting these wrong is invisible until a Fighter runs out of reactions
 * a round early, so they are the printed traits and nothing else.
 */
export const REACTION_FEATS = Object.freeze({
  "cleave": {
    label: "Cleave",
    trigger: TRIGGERS.incapacitatedInReach,
    cost: "reaction",
    traits: "Attack, Martial",
    requires: [],
    // "this strike uses your current multiple attack penalty but does
    // not count towards increasing it further" — NOT map-exempt like the
    // ripostes; it is map-FROZEN, which is a different thing and the
    // reason the two are separate fields.
    map: "frozen",
    summary: "Strike the next foe in reach, at your current multiple attack penalty."
  },
  "great cleave": {
    label: "Great Cleave",
    trigger: TRIGGERS.incapacitatedInReach,
    cost: "extends",
    traits: "Attack, Martial",
    requires: [],
    map: "frozen",
    extends: "cleave",
    summary: "Keep striking while you keep dropping foes."
  },
  "allied strike": {
    label: "Allied Strike",
    trigger: TRIGGERS.youAttacked,
    cost: "reaction",
    traits: "Attack",
    requires: [],
    map: "exempt",
    summary: "An ally within 30 ft who can see and hear you makes a free attack."
  },
  "armoured counter": {
    label: "Armoured Counter",
    trigger: TRIGGERS.damagedYou,
    cost: "reaction",
    traits: "Attack, Martial",
    requires: [REQUIREMENTS.mediumOrHeavyArmour, REQUIREMENTS.noCritical],
    map: "exempt",
    summary: "Answer with any 1 AP attack action, ignoring the multiple attack penalty."
  },
  "self preservation": {
    label: "Self Preservation",
    trigger: TRIGGERS.damagedYou,
    cost: "reaction",
    traits: "",
    requires: [],
    map: "none",
    summary: "Raise your DR against the triggering attack, and answer it with aligned damage."
  },
  "chance of redemption": {
    label: "Chance of Redemption",
    trigger: TRIGGERS.damagedAlly,
    cost: "reaction",
    traits: "",
    requires: [],
    map: "none",
    summary: "The foe makes a Will save; the attack is reduced by 2 or 4."
  },
  "strike of retribution": {
    label: "Strike of Retribution",
    trigger: TRIGGERS.damagedAlly,
    cost: "reaction",
    traits: "Attack",
    requires: [],
    map: "exempt",
    summary: "Intercept the attack on your own Defensive Bonus, then strike back."
  },
  "guardian defence": {
    label: "Guardian Defence",
    trigger: TRIGGERS.allyHit,
    cost: "reaction",
    traits: "Martial",
    requires: [REQUIREMENTS.oneHandedOrShield],
    map: "none",
    summary: "Aid Defensive immediately, reducing the attack."
  },
  "duelling riposte": {
    label: "Duelling Riposte",
    trigger: TRIGGERS.fumbleInReach,
    cost: "reaction",
    traits: "Attack, Martial",
    requires: [REQUIREMENTS.oneHandedWithFreeHand],
    map: "exempt",
    summary: "Attack or Disarm the fumbling creature, ignoring the multiple attack penalty."
  },
  "twin riposte": {
    label: "Twin Riposte",
    trigger: TRIGGERS.fumbleInReach,
    cost: "reaction",
    traits: "Attack, Martial",
    requires: [REQUIREMENTS.doubleStance],
    map: "exempt",
    summary: "Attack or Disarm the fumbling creature with your offhand, ignoring the penalty."
  },
  "disarm block": {
    label: "Disarm Block",
    trigger: TRIGGERS.missedByShield,
    cost: "free",
    traits: "",
    requires: [REQUIREMENTS.shield],
    map: "none",
    summary: "Disarm the attacker whose blow your shield turned. No free hand needed."
  },
  "offensive parry": {
    label: "Offensive Parry",
    trigger: TRIGGERS.shieldBlocked,
    cost: "free",
    traits: "",
    requires: [REQUIREMENTS.shield],
    map: "none",
    summary: "Shove the blocked attacker, or leave it flat-footed if it cannot be moved."
  },
  "shadowing": {
    label: "Shadowing",
    trigger: TRIGGERS.movedAway,
    cost: "reaction",
    traits: "Martial",
    requires: [],
    map: "none",
    summary: "Stride after the retreating creature, keeping it in reach."
  }
});

/** Every feat this module speaks for — the register's evidence. */
export const REACTION_FEAT_NAMES = Object.freeze(Object.keys(REACTION_FEATS));

/* ------------------------------------------------------------------ */
/* Who is offered what                                                 */
/* ------------------------------------------------------------------ */

/**
 * Which of this actor's reaction feats fire on this trigger, and which
 * are held back — with the reason.
 *
 * BOTH LISTS, ALWAYS. `opportunity.mjs` learned this the hard way and
 * wrote it down: an offer that is silently suppressed reads as the
 * feature being broken, and in round one that is every character on the
 * board. A feat whose requirement is unmet is reported, not dropped.
 *
 * @param {object} opts
 * @param {string[]} opts.featNames      every feat on the actor
 * @param {string}   opts.trigger        one of TRIGGERS
 * @param {object}   opts.state          gear and stances, for `meetsRequirement`
 * @param {boolean}  opts.canReact       the reaction economy's answer
 * @param {string}   [opts.blockReason]  why not, when `canReact` is false
 * @returns {{offered: object[], held: object[]}}
 */
export function offeredReactionFeats({
  featNames = [],
  trigger = "",
  state = {},
  canReact = true,
  blockReason = null
} = {}) {
  const held = [];
  const offered = [];
  const seen = new Set();

  /*
   * AN EXTENSION IS NOT A BUTTON OF ITS OWN.
   *
   * Great Cleave does not fire; it changes what Cleave does. Offering it
   * separately would put two buttons on one trigger and invite a player
   * to spend two reactions on what the book calls one — which is the
   * exact opposite of Graham's ruling that the chain costs one reaction.
   * So an `extends` entry is recorded as a MODIFIER on the feat it
   * upgrades and never enters the offered list.
   */
  const owned = new Set((Array.isArray(featNames) ? featNames : []).map(normalise));
  const extensions = new Map();
  for (const key of owned) {
    const entry = REACTION_FEATS[key];
    // NO  GUARD. It was here and it was dead:
    // the map is only ever READ while walking the owned feats, so an
    // entry keyed at a feat nobody holds can never be reached. A guard
    // no input can exercise is a guard no mutation can prove, and an
    // unprovable line is what this chapter's harness rules refuse.
    if (entry?.extends) extensions.set(entry.extends, key);
  }

  for (const raw of Array.isArray(featNames) ? featNames : []) {
    const key = normalise(raw);
    const entry = REACTION_FEATS[key];
    if (!entry || entry.trigger !== trigger) continue;
    // The extension itself is never offered — see above. If its base
    // feat is missing it does nothing at all, which is what the
    // prerequisite chain already guarantees.
    if (entry.extends) continue;
    // ONE OFFER PER FEAT, however many copies are on the sheet. None of
    // these is repeatable, and two buttons for one feat would let a
    // duplicated grant spend two reactions on one trigger.
    if (seen.has(key)) continue;
    seen.add(key);

    const unmet = (entry.requires ?? []).filter((req) => !meetsRequirement(req, state));
    if (unmet.length) {
      held.push({ key, label: entry.label, reason: REQUIREMENT_TEXT[unmet[0]] ?? "its requirements are not met" });
      continue;
    }
    /*
     * A CONTINUATION IS FREE, and so is a Free action.
     *
     * Graham's ruling: Great Cleave costs ONE reaction for the whole
     * chain. Once the chain is running, every further Cleave offer is
     * free — otherwise the second link would bill a second reaction and
     * a Fighter with one would never see a third foe.
     *
     * `chainFree` arrives in the state from the trigger context, the
     * same way Armoured Counter's `noCritical` does, so the rule stays
     * here rather than becoming an `if` in the workflow.
     */
    // AND THE CHAIN ONLY EXISTS IF THE EXTENSION DOES. Asking
    // `extensions` rather than trusting whoever set the flag keeps this
    // rule self-contained: a Cleaver without Great Cleave can never be
    // handed a free Cleave, however the flag came to be set.
    const free = entry.cost === "free"
      || (key === "cleave" && state.chainFree === true && extensions.has(key));
    if (!free && !canReact) {
      held.push({ key, label: entry.label, reason: blockReason ?? "you have no reaction left" });
      continue;
    }
    const extendedBy = extensions.get(key) ?? null;
    offered.push({
      key, label: entry.label, cost: free ? "free" : entry.cost, traits: entry.traits,
      map: entry.map, summary: entry.summary,
      // Named on the button so the player can see the chain is available
      // before they commit the reaction, not after.
      extendedBy, extendedLabel: extendedBy ? REACTION_FEATS[extendedBy].label : null
    });
  }

  return { offered, held };
}

/**
 * The attack options a reaction strike is rolled with, from its MAP rule.
 *
 * EXTRACTED SO IT CAN BE DRIVEN (3.353.1). This was three lines inside
 * `reactionStrike`, and being three lines inside a Foundry-only function
 * is exactly how the defect shipped: the table said Cleave was "frozen",
 * the harness agreed the table said "frozen", and the call site passed
 * `isReaction: true` for everything. A regex could see the words; only
 * running it could see the choice.
 *
 *   "exempt"  `isReaction` — the penalty is set to ZERO.
 *             "Your multiple attack penalty does not apply."
 *
 *   "frozen"  `mapFrozen` — the penalty STILL APPLIES and the counter
 *             does not advance. "Uses your current multiple attack
 *             penalty but does not count towards increasing it further."
 *             `apPaid` is what stops a Reaction also being billed AP,
 *             a job `isReaction` had been doing as a side effect.
 *
 * ANYTHING ELSE IS TREATED AS EXEMPT, because every feat in the table
 * whose `map` is neither of these ("none") never strikes at all — and
 * of the two, exempt is the one that cannot silently apply a penalty
 * the book does not ask for.
 */
export function strikeOptionsFor(map) {
  return String(map) === "frozen"
    ? { apPaid: true, mapFrozen: true, skipTargetPrompt: true }
    : { isReaction: true, skipTargetPrompt: true };
}

/* ------------------------------------------------------------------ */
/* Cleave                                                              */
/* ------------------------------------------------------------------ */

/**
 * Did this Strike incapacitate its target?
 *
 * Graham's ruling, 21 August 2026: **0 HP, Unconscious or Dying**. The
 * system has no Incapacitated condition, and inventing one is a Chapter
 * 7 change reaching well past this batch; these three are what the
 * damage path already reports, so the feat can fire on its own rather
 * than asking a GM to adjudicate every hit.
 *
 * `damageCase` comes straight from `applyDamageAndCheckDying`.
 *
 * @param {object} opts
 * @param {string} [opts.damageCase]
 * @param {number|null} [opts.newHP]
 * @param {boolean} [opts.unconscious]
 * @param {boolean} [opts.dying]
 */
export function incapacitated({ damageCase = "", newHP = null, unconscious = false, dying = false } = {}) {
  if (unconscious || dying) return true;
  if (["reached-zero", "knocked-out", "massive-damage-death", "died-while-dying"].includes(String(damageCase))) {
    return true;
  }
  return Number.isFinite(newHP) && Number(newHP) <= 0;
}

/**
 * Is this creature still a foe worth cleaving into?
 *
 * THE CORPSE BUG (3.353.2). Found live: a Cleaver who dropped two of
 * three mooks was told there were "2 other foes still in reach", because
 * the count excluded only the creature just dropped and not the ones
 * already lying there. Cleave says "there is another within your melee
 * range" — a creature at 0 HP is not another foe, it is the last one.
 *
 * The inverse of `incapacitated`, deliberately expressed by calling it
 * rather than by repeating its three conditions: one answer to "is this
 * one down", asked by both the trigger and the target list.
 */
export function standingFoe({ hp = null, unconscious = false, dying = false } = {}) {
  return !incapacitated({ newHP: hp, unconscious, dying });
}

/**
 * May the Cleave chain continue?
 *
 * "You can keep attacking with melee Strikes until you fail to
 * incapacitate a creature or until there are no more adjacent creatures
 * left to attack, whichever condition is met first."
 *
 * Graham's ruling: **one reaction for the whole chain**. Cleave is the
 * Reaction; Great Cleave upgrades it rather than adding a second one, so
 * the reaction is spent once when the chain starts and never again.
 *
 * WITHOUT GREAT CLEAVE THERE IS NO CHAIN AT ALL — plain Cleave is one
 * extra Strike, full stop. Asking that first is what keeps a Cleaver
 * from getting a Great Cleaver's feat for free.
 */
export function cleaveContinues({ hasGreatCleave = false, lastIncapacitated = false, adjacentRemaining = 0 } = {}) {
  if (!hasGreatCleave) return false;
  if (!lastIncapacitated) return false;
  return Number(adjacentRemaining) > 0;
}

/* ------------------------------------------------------------------ */
/* Self Preservation                                                   */
/* ------------------------------------------------------------------ */

/**
 * "Your DR increases by 2 + half your level against the triggering
 * attack."
 *
 * HALF, ROUNDED DOWN, and never below the flat 2 — a 1st-level
 * character gets 2, not 2.5 and not 0.
 */
export function selfPreservationDR(level) {
  return 2 + Math.floor(Math.max(0, Number(level) || 0) / 2);
}

/** "+1 aligned (evil) or essence base damage… may be different each time." */
export const SELF_PRESERVATION_DAMAGE = Object.freeze(["aligned (evil)", "essence"]);

/* ------------------------------------------------------------------ */
/* Chance of Redemption                                                */
/* ------------------------------------------------------------------ */

/**
 * The printed ladder, read off the foe's Will save.
 *
 * "Critical The target is unaffected · Success The attack result is
 * reduced by 2 · Failure The attack result is reduced by 4 · Fumble As
 * failure and the enemy is also Stunned 2."
 *
 * NOTE WHOSE SAVE THIS IS. The ladder runs the wrong way round from
 * every other save in the system: the ENEMY rolls, so their success is
 * still a reduction and only their critical escapes it. Written out in
 * full rather than derived, because "success means it worked" is the
 * assumption that would quietly invert it.
 */
export function chanceOfRedemption(degreeKey) {
  switch (String(degreeKey ?? "").toLowerCase()) {
    case "heroic":
    case "critical":
      return { reduction: 0, stunned: 0, text: "unaffected" };
    case "success":
      return { reduction: 2, stunned: 0, text: "attack reduced by 2" };
    case "partial":
    case "failure":
      return { reduction: 4, stunned: 0, text: "attack reduced by 4" };
    case "fumble":
    case "blunder":
      return { reduction: 4, stunned: 2, text: "attack reduced by 4, and Stunned 2" };
    default:
      return { reduction: 0, stunned: 0, text: "no result" };
  }
}

/* ------------------------------------------------------------------ */
/* Reducing an attack that has already been rolled                     */
/* ------------------------------------------------------------------ */

/**
 * What a reduction does to a resolved attack.
 *
 * Graham's ruling, 21 August 2026: **buttons on the attack card**. The
 * attack is not re-rolled and not re-resolved — the card grows a button,
 * and pressing it reports the adjusted total and whether that still
 * beats the Defensive Bonus. Same pattern as Killer's Edge, which
 * already puts adjustment buttons on a critical card.
 *
 * Returns enough for the card to say what changed, including the case
 * everybody wants to see: a hit that becomes a miss.
 */
export function reducedAttack({ total = 0, dc = 0, reduction = 0 } = {}) {
  const before = Number(total) || 0;
  const target = Number(dc) || 0;
  const after = before - Math.max(0, Number(reduction) || 0);
  return {
    before,
    after,
    dc: target,
    hitBefore: before >= target,
    hitAfter: after >= target,
    turnedAside: before >= target && after < target
  };
}

/* ------------------------------------------------------------------ */
/* Shadowing                                                           */
/* ------------------------------------------------------------------ */

/**
 * "You remain within reach of the creature until it either stops moving,
 * or you have moved your full Speed."
 *
 * The follow ends at whichever comes first, so the distance actually
 * covered is the smaller of what the quarry moved and what this
 * character can move. Reported rather than applied: the Stride is the
 * player's to take, and moving somebody's token for them is a bigger
 * liberty than this feat asks for.
 */
export function shadowingFollow({ quarryMovedFeet = 0, speedFeet = 0 } = {}) {
  const moved = Math.max(0, Number(quarryMovedFeet) || 0);
  const speed = Math.max(0, Number(speedFeet) || 0);
  const follow = Math.min(moved, speed);
  return {
    follow,
    keptUp: follow >= moved,
    shortBy: Math.max(0, moved - speed)
  };
}
