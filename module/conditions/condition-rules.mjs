/**
 * condition-rules — the clauses of Appendix 2 that the registry only named.
 *
 * NEW at 3.621.0 (block 39, Graham's rulings of 5 October 2026: R5, R6,
 * "Lets automate these", and R7, "Lets automate" — every clause of the
 * audit's section B).
 *
 * The registry (registry.mjs) says WHICH conditions a creature has and what
 * they do to its bonus pools. Everything here is the rest of each entry:
 * what a condition forbids, what it forces, and what happens the moment it
 * arrives. Pure, and given condition ids rather than an actor, so the
 * harness can run every clause without a world; the workflows read an actor
 * and hand the answer on.
 *
 * `conds` throughout is anything holding condition ids — a Set (an actor's
 * `conditions.effective`), an array, or a plain object keyed by id.
 */

import { resolveDegree } from "../dice/resolution.mjs";
import { fatigueStatus } from "../exhaustion.mjs";
import { CONDITIONS } from "./registry.mjs";

/** Whether a collection of condition ids holds this one. */
export function hasCondition(conds, id) {
  if (!conds) return false;
  if (conds instanceof Set || conds instanceof Map) return conds.has(id);
  if (Array.isArray(conds)) return conds.includes(id);
  return Boolean(conds[id]);
}

const LABELS = Object.freeze({
  immobilised: "Immobilised",
  grabbed: "Grabbed",
  paralyzed: "Paralyzed",
  petrified: "Petrified",
  unconscious: "Unconscious",
  prone: "Prone",
  blinded: "Blinded",
  dazzled: "Dazzled",
  deafened: "Deafened",
  hidden: "Hidden",
  undetected: "Undetected",
  unnoticed: "Unnoticed",
  invisible: "Invisible",
  fleeing: "Fleeing",
  fixated: "Fixated",
  sickened: "Sickened"
});

/** A condition's printed name. */
export function conditionLabel(id) {
  // EVERY CONDITION'S PRINTED NAME (3.633.0): the registry's label when the
  // short list has none — cards read "Controlled", not "controlled".
  const key = String(id ?? "");
  return LABELS[key] ?? CONDITIONS[key]?.label ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "");
}

/* ------------------------------------------------------------------ */
/* Movement (Immobilised, Grabbed, Paralyzed, Petrified, Prone)        */
/* ------------------------------------------------------------------ */

/**
 * The conditions under which a creature "cannot use any action with the
 * move trait". Grabbed and Unconscious are not listed because the registry
 * already makes each of them include Immobilised; naming them here as well
 * would be the same rule stated twice.
 */
const CANNOT_MOVE_CONDITIONS = Object.freeze(["immobilised", "paralyzed", "petrified"]);

/** The condition that stops this creature moving at all, or null. */
function cannotMoveBy(conds) {
  return CANNOT_MOVE_CONDITIONS.find((id) => hasCondition(conds, id)) ?? null;
}

/**
 * Why a creature's own move is refused, or "" when it may go.
 *
 * "The only move actions you can use while you're prone are Crawl and
 * Stand" — Stand is not a token movement, so a prone creature's drag is
 * allowed only when Crawl is the armed action.
 *
 * @param {string} name The mover's name, for the message.
 * @param {*} conds Its effective conditions.
 * @param {object} [options]
 * @param {string|null} [options.armed] The armed movement action, if any.
 * @param {boolean} [options.governed] False for movement no Speed governs
 *   (teleportation), which is not a move action and is never refused here.
 */
export function movementRefusal(name, conds, { armed = null, governed = true } = {}) {
  if (!governed) return "";
  const stuck = cannotMoveBy(conds);
  if (stuck) return `${name} is ${conditionLabel(stuck)} and cannot move`;
  if (hasCondition(conds, "prone") && armed !== "crawl") {
    return `${name} is Prone — the only move actions while prone are Crawl and Stand`;
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Reflex saves (Immobilised by 20, Paralyzed by 25)                   */
/* ------------------------------------------------------------------ */

/** "fail all Reflex Saving throws by 20" / "considered to have failed it by 25". */
const REFLEX_AUTO_FAIL_BY = Object.freeze({ paralyzed: 25, immobilised: 20 });

/** The margin a Reflex save is failed by, and the condition that forces it. */
export function reflexAutoFail(conds) {
  for (const [id, by] of Object.entries(REFLEX_AUTO_FAIL_BY)) {
    if (hasCondition(conds, id)) return { by, condition: id };
  }
  return null;
}

/**
 * An outcome rewritten as failed by `by`. The dice stay on the card; the
 * total becomes the DC less the margin, and the degree is whatever that
 * margin reads as (both 20 and 25 are a Blunder).
 */
export function autoFailedOutcome(outcome, { by, condition }) {
  if (!outcome) return outcome;
  const margin = -Math.abs(Number(by) || 0);
  const dc = outcome.dc;
  return {
    ...outcome,
    total: dc === null || dc === undefined ? outcome.total : Number(dc) + margin,
    margin,
    degree: resolveDegree(margin),
    autoFailed: { by: Math.abs(margin), condition }
  };
}

/**
 * A Perception check that needed the lost sense "automatically fumbles"
 * (3.622.1, G4 of the 3.622.0 drive). Written as a failure by 10 — the
 * Fumble rung's top — so the card's margin agrees with its degree: it read
 * "Fumble — Exceeds DC by 7" before. A roll already a Fumble or worse keeps
 * its own margin.
 */
const SENSE_FUMBLE_BY = 10;

export function senseFumbleOutcome(outcome, condition) {
  if (!outcome) return outcome;
  const margin = Number(outcome.margin);
  if (Number.isFinite(margin) && margin <= -SENSE_FUMBLE_BY) {
    return { ...outcome, autoFailed: { by: Math.abs(margin), condition } };
  }
  return autoFailedOutcome(outcome, { by: SENSE_FUMBLE_BY, condition });
}

/** The card line for a forced failure. */
export function autoFailLine({ by, condition }) {
  return `${conditionLabel(condition)}: the Reflex save fails by ${by}, whatever the dice say.`;
}

/* ------------------------------------------------------------------ */
/* Defence (Paralyzed, Unconscious, Petrified)                         */
/* ------------------------------------------------------------------ */

/** "You lose all DB except that provided by magic or armour." */
const MAGIC_ARMOUR_DB_ONLY = Object.freeze(["paralyzed", "unconscious"]);

/** Petrified: "an object with … DB 0, Hardness 8". */
export const PETRIFIED_HARDNESS = 8;

/**
 * What a creature's DB is cut down to: "zero" (petrified), "magicArmour"
 * (paralyzed or unconscious), or null.
 */
export function defenceRestriction(conds) {
  if (hasCondition(conds, "petrified")) return "zero";
  if (MAGIC_ARMOUR_DB_ONLY.some((id) => hasCondition(conds, id))) return "magicArmour";
  return null;
}

/**
 * Whether a DB pool entry survives "except that provided by magic or
 * armour". Armour and shield are the armour; item bonuses are the potency
 * runes and magic items; an entry from a spell or other effect marked
 * magical is the magic.
 */
export function keepsMagicOrArmour(entry) {
  const type = String(entry?.type ?? "");
  if (type === "armour" || type === "item") return true;
  if (entry?.magic === true || entry?.magical === true) return true;
  const source = String(entry?.source ?? "").toLowerCase();
  return source === "spell" || source.includes("(potency)");
}

/* ------------------------------------------------------------------ */
/* Attacks against and by a creature under a condition                  */
/* ------------------------------------------------------------------ */

/** "all attacks against you gain advantage if you cannot move." */
export function attackAdvantageAgainst(targetConds) {
  return cannotMoveBy(targetConds);
}

/**
 * Prone, as a target: "+4-circumstance bonus if the attacker is within 5
 * feet of you. Otherwise, they take a -4-circumstance penalty."
 *
 * @returns {{label:string, value:number, type:string}|null}
 */
export function proneTargetModifier(targetConds, distanceFeet, { melee = false } = {}) {
  if (!hasCondition(targetConds, "prone")) return null;
  // UNMEASURED, a melee attack is taken to be the adjacent one and anything
  // else the distant one — the only reading that needs no canvas.
  const feet = distanceFeet === null || distanceFeet === undefined || distanceFeet === "" ? NaN : Number(distanceFeet);
  const close = Number.isFinite(feet) ? feet <= 5 : Boolean(melee);
  return {
    label: close ? "Target Prone (within 5 ft)" : "Target Prone (beyond 5 ft)",
    value: close ? 4 : -4,
    type: "circumstance"
  };
}

/**
 * "A creature you're hidden from is flat-footed to you" (Hidden), and the
 * same of Undetected; Unnoticed and Invisible include it. The condition on
 * the attacker that makes its target flat-footed to it, or null.
 */
const FLAT_FOOTING_ATTACKER_CONDITIONS = Object.freeze(["unnoticed", "undetected", "invisible", "hidden"]);

export function flatFootedToAttackerBy(attackerConds) {
  return FLAT_FOOTING_ATTACKER_CONDITIONS.find((id) => hasCondition(attackerConds, id)) ?? null;
}

/**
 * What the defender's avoidance flat check reads from SENSES, beyond the
 * target's own Hidden and Concealed:
 *
 * - Undetected and Unnoticed: "This works like targeting a hidden creature
 *   (requiring a DC 10 flat check)" (A9).
 * - The attacker Blinded: "all creatures are hidden to you".
 * - The attacker Dazzled: "all creatures and objects become concealed to
 *   you". Blinded overrides Dazzled, which the registry already does.
 *
 * @returns {{hidden:boolean, concealed:boolean, reasons:string[]}}
 */
export function senseMissChance({ targetConds = null, attackerConds = null } = {}) {
  const reasons = [];
  let hidden = false;
  let concealed = false;
  for (const id of ["unnoticed", "undetected"]) {
    if (hasCondition(targetConds, id)) {
      hidden = true;
      reasons.push(`${conditionLabel(id)} — attacked as if hidden`);
      break;
    }
  }
  if (hasCondition(attackerConds, "blinded")) {
    hidden = true;
    reasons.push("the attacker is Blinded — every creature is hidden to it");
  } else if (hasCondition(attackerConds, "dazzled")) {
    concealed = true;
    reasons.push("the attacker is Dazzled — every creature is concealed to it");
  }
  return { hidden, concealed, reasons };
}

/* ------------------------------------------------------------------ */
/* Senses and hands (Deafened, Grabbed, Blinded)                        */
/* ------------------------------------------------------------------ */

/** The DC of Deafened's auditory check and Grabbed's manipulate check. */
const SENSE_FLAT_CHECK_DC = 5;

/** Deafened: "–4 status penalty to Perception checks that involve sound". */
const DEAFENED_PERCEPTION_PENALTY = -4;

function traitSet(traits) {
  const list = Array.isArray(traits) ? traits : String(traits ?? "").split(",");
  return new Set(list.map((t) => String(t).trim().toLowerCase()).filter(Boolean));
}

/**
 * The flat checks an action must pass after its cost is spent and before
 * anything it does lands: Deafened on an Auditory action ("or the action is
 * lost"), Grabbed on a Manipulate one ("or the action is wasted").
 *
 * @returns {{condition:string, trait:string, dc:number}[]}
 */
export function actionFlatChecks(conds, traits) {
  const set = traitSet(traits);
  const out = [];
  if (hasCondition(conds, "deafened") && set.has("auditory")) {
    out.push({ condition: "deafened", trait: "Auditory", dc: SENSE_FLAT_CHECK_DC });
  }
  if (hasCondition(conds, "grabbed") && set.has("manipulate")) {
    out.push({ condition: "grabbed", trait: "Manipulate", dc: SENSE_FLAT_CHECK_DC });
  }
  return out;
}

/**
 * "On a plus note, you are immune to visual effects" (Blinded); "immune to
 * auditory effects" (Deafened). The condition that makes this creature
 * immune to an effect bearing these traits, or null.
 */
export function senseImmunityBy(conds, traits) {
  const set = traitSet(traits);
  if (set.has("visual") && hasCondition(conds, "blinded")) return "blinded";
  if (set.has("auditory") && hasCondition(conds, "deafened")) return "deafened";
  return null;
}

/**
 * Perception that relies on a lost sense. Blinded: "You automatically
 * fumble Perception checks that require you to be able to see, and if
 * vision is your only primary sense, all Perception checks are one
 * difficulty level higher." Deafened: auto-fumble for hearing alone, and
 * −4 when sound is one sense among several.
 *
 * @param {*} conds
 * @param {"sight"|"hearing"|"sound"|""} sense What the check relies on:
 *   "sight", "hearing" (hearing alone), "sound" (hearing among others).
 * @returns {{fumble:boolean, harder:boolean, penalty:number, condition:string|null}}
 */
export function perceptionBySense(conds, sense = "") {
  const out = { fumble: false, harder: false, penalty: 0, condition: null };
  if (hasCondition(conds, "blinded")) {
    out.harder = true;
    out.condition = "blinded";
    if (sense === "sight") out.fumble = true;
  }
  if (hasCondition(conds, "deafened")) {
    if (sense === "hearing") {
      out.fumble = true;
      out.condition = out.condition ?? "deafened";
    } else if (sense === "sound") {
      out.penalty = DEAFENED_PERCEPTION_PENALTY;
      out.condition = out.condition ?? "deafened";
    }
  }
  return out;
}

/** Blinded: "All normal terrain is difficult terrain to you." */
export function allTerrainDifficult(conds) {
  return hasCondition(conds, "blinded");
}

/* ------------------------------------------------------------------ */
/* What a condition forbids                                            */
/* ------------------------------------------------------------------ */

/**
 * Why a Ready or Delay is refused, or "". Confused (Chapter 4) and Fleeing
 * ("You can't Delay or Ready while fleeing").
 */
export function deliberateRefusal(conds, actionKey) {
  if (actionKey !== "ready" && actionKey !== "delay") return "";
  if (hasCondition(conds, "confused")) return "Confused creatures cannot Ready or Delay";
  if (hasCondition(conds, "fleeing")) return "Fleeing creatures cannot Ready or Delay";
  return "";
}

/** Fixated: "Any actions with the concentrate trait cannot be used". */
export function concentrateRefusal(conds, traits) {
  if (!hasCondition(conds, "fixated")) return "";
  if (!traitSet(traits).has("concentrate")) return "";
  return "Fixated creatures cannot use Concentrate actions (unless the GM rules the action is about the object of the fixation)";
}

/** Sickened: "you cannot willingly ingest anything while sickened." */
export function ingestRefusal(conds) {
  return hasCondition(conds, "sickened") ? "Sickened creatures cannot willingly ingest anything" : "";
}

/** Sickened's Retch: "a 1 AP manipulate action". */
export const RETCH_AP = 1;

/* ------------------------------------------------------------------ */
/* Values: which add, which take the higher (R5)                       */
/* ------------------------------------------------------------------ */

/**
 * The valued conditions whose new instances ADD to what is there.
 *
 * Bleeding and Injured say so ("cumulative"), Recurring Damage is separate
 * wounds (the registry's ruling), and Fatigue and Soul Drain are amounts
 * gained or drained rather than severities (R5: "left as their own rules
 * already set"). Every other valued condition — Slowed, Stunned,
 * Frightened, Sickened, Dazed, Weakened, Doomed — "replaces": the more
 * severe instance stands.
 */
const ADDING_CONDITION_IDS = Object.freeze(["bleeding", "injured", "recurring", "fatigued", "soulDrain"]);

/** The value a condition holds after a new instance lands. */
export function combinedConditionValue(id, existing, incoming) {
  const had = Math.max(0, Number(existing) || 0);
  const add = Math.max(0, Number(incoming) || 0);
  return ADDING_CONDITION_IDS.includes(id) ? had + add : Math.max(had, add);
}

/* ------------------------------------------------------------------ */
/* Thresholds and moments                                              */
/* ------------------------------------------------------------------ */

/**
 * Soul Drain: "This amount is applied directly to your character as Hit
 * Point damage". The damage a change of value deals — only a rise does any.
 */
export function soulDrainDamage(before, after) {
  return Math.max(0, (Number(after) || 0) - (Number(before) || 0));
}

/**
 * Stunned gained on your own turn: "you immediately deduct the Stunned value
 * from any remaining AP", and — as with every Stunned deduction — "reduce
 * your Stunned value by the number of AP you lost".
 */
export function stunnedDeduction(apRemaining, stunned) {
  const ap = Math.max(0, Math.floor(Number(apRemaining) || 0));
  const value = Math.max(0, Math.floor(Number(stunned) || 0));
  const lost = Math.min(ap, value);
  return { lost, ap: ap - lost, stunned: value - lost };
}

/**
 * The instant deaths Appendix 2 prints, whichever route the value arrived
 * by (A7, A8, R6). The first that applies, as a sentence, or "".
 *
 * @param {object} state
 * @param {number} state.baseDeathState
 * @param {number} state.doomed
 * @param {number} state.fatigued
 * @param {number} state.soulDrain
 * @param {number|null} state.maxBeforeSoulDrain Maximum HP before Soul
 *   Drain is subtracted; null when unknown.
 */
export function instantDeathCause({ baseDeathState = 5, doomed = 0, fatigued = 0, soulDrain = 0, maxBeforeSoulDrain = null } = {}) {
  const d = Math.max(0, Math.floor(Number(doomed) || 0));
  const base = Math.max(0, Math.floor(Number(baseDeathState) || 0));
  if (d > 0 && base - d <= 0) return `Doomed ${d} reduces the Death State to 0`;
  if (fatigueStatus(fatigued) === "dead") return `Fatigue reaches ${Number(fatigued)}`;
  const drain = Math.max(0, Math.floor(Number(soulDrain) || 0));
  if (drain > 0 && maxBeforeSoulDrain !== null && maxBeforeSoulDrain !== undefined
    && Number.isFinite(Number(maxBeforeSoulDrain)) && Number(maxBeforeSoulDrain) - drain < 0) {
    return `Soul Drain ${drain} reduces maximum hit points below 0`;
  }
  return "";
}

/**
 * Whether a change of hit points wakes an Unconscious creature.
 *
 * "Damage inflicted to you can awaken you, given that it doesn't invoke the
 * dying condition"; "Receiving healing, barring the natural recovery gained
 * through rest". Only a creature unconscious in its own right — one made
 * unconscious by Dying or by Fatigue 10 wakes by those rules instead.
 */
export function wakesOnHpChange({ directlyUnconscious = false, dying = false, hpAfter = 0, rest = false } = {}) {
  if (!directlyUnconscious || dying || rest) return false;
  return Number(hpAfter) > 0;
}
