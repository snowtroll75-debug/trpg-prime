/**
 * The Ranger's class abilities (Chapter 3).
 *
 * Same split as fighter.mjs, rogue.mjs, crusader.mjs and bard.mjs:
 * everything that is arithmetic on data already on the sheet lives here
 * as pure functions the harness can RUN without a Foundry actor. The
 * glue:
 *
 *   Hunt Prey            feats-workflow.mjs (the Use designation),
 *                        combat/attack-workflow.mjs (the attack bonus)
 *                        and apps/check-dialog.mjs (the tickbox on
 *                        skill/save checks)
 *   Hunter's Method      feats-workflow.mjs (the chooser, changeable at
 *                        daily preparation); each method's teeth:
 *                          Precision  combat/attack-workflow.mjs (dice
 *                                     into the damage roll, once per
 *                                     round, reset in documents/
 *                                     combat.mjs)
 *                          Relentless combat/attack-workflow.mjs (MAP
 *                                     relief against the prey)
 *                          Warden     combat/attack-workflow.mjs (DB
 *                                     side) and apps/check-dialog.mjs
 *                                     (the save side)
 *                          Stalker    apps/check-dialog.mjs (the three
 *                                     named skills, via the same prey
 *                                     tickbox)
 *   Swift Pursuit        combat/swift-pursuit.mjs (the reaction prompt
 *                        when the prey's token moves away) and
 *                        feats-workflow.mjs (the manual Use for moves
 *                        the system can't see)
 *   Terrain Mastery      feats-workflow.mjs (the in-favoured-terrain
 *                        toggle) and apps/check-dialog.mjs (the ally
 *                        aura tickbox)
 *   Trap Finder          shared with the Rogue's, live since 3.217.0 —
 *                        authored conditionals plus the +4 true-up in
 *                        feats-workflow's reconcile; the scaling
 *                        function stays in rogue.mjs deliberately
 *   Magical Tradition    module/magic/repertoire.mjs — the instinctive
 *                        repertoire is shared machinery (the Bard and
 *                        Crusader print the identical schedule), not a
 *                        Ranger-only rule, so it lives with the magic
 *                        module rather than here
 *
 * Levels are the CHARACTER level (system.identity.level), as everywhere
 * else — this system is single-class.
 */

import { hasClassAbility } from "./crusader.mjs";

const SYSTEM_ID = "trg-prime";

/* ---------------------------------------------------------------------- */
/*  Hunt Prey (1st)                                                       */
/* ---------------------------------------------------------------------- */

/** Does this actor have Hunt Prey on their sheet? */
export function hasHuntPrey(actor) {
  return hasClassAbility(actor, "Hunt Prey");
}

/**
 * The recorded designation, or null. Stored as an actor flag rather
 * than an effect: the book puts no duration on it ("You can have only
 * one creature designated as your prey at a time"), so it persists
 * until replaced — which also means it must NOT be swept by the
 * once-per-round reset in documents/combat.mjs.
 *
 * @returns {{tokenId: string, actorId: string, name: string}|null}
 */
export function huntedPrey(actor) {
  const prey = actor?.flags?.[SYSTEM_ID]?.huntedPrey;
  if (!prey || typeof prey !== "object") return null;
  if (!prey.tokenId && !prey.actorId) return null;
  return {
    tokenId: String(prey.tokenId ?? ""),
    actorId: String(prey.actorId ?? ""),
    name: String(prey.name ?? "")
  };
}

/**
 * Is THIS creature the recorded prey? Token identity first — two goblins
 * share an actor, and only one of them is the prey — with the actor id
 * as the fallback for an unlinked lookup that has no token in hand.
 */
export function isHuntedPrey(actor, { tokenId = "", actorId = "" } = {}) {
  const prey = huntedPrey(actor);
  if (!prey) return false;
  if (prey.tokenId && tokenId) return prey.tokenId === tokenId;
  return Boolean(prey.actorId && actorId && prey.actorId === actorId);
}

/**
 * "You may add your class bonus to all checks made against your prey."
 * The value IS the class bonus — the same identity.classBonus figure
 * Killer's Edge reads — and the type is class, which stacks across
 * sources in this system (Appendix 1) exactly as Weapon Focus and a
 * favoured weapon already do.
 */
export function huntPreyBonus({ actor = null, classBonus = 0, targetIsPrey = false } = {}) {
  if (!hasHuntPrey(actor)) return 0;
  if (!targetIsPrey) return 0;
  return Math.max(0, Math.floor(Number(classBonus) || 0));
}

/* ---------------------------------------------------------------------- */
/*  Hunter's Method (1st; scaling at 9th/10th/11th/15th/17th)             */
/* ---------------------------------------------------------------------- */

/** The four printed methods, keyed for storage. */
export const HUNTER_METHODS = Object.freeze([
  { key: "precision", label: "Precision Hunter" },
  { key: "relentless", label: "Relentless Hunter" },
  { key: "warden", label: "Warden Hunter" },
  { key: "stalker", label: "Stalker Hunter" }
]);

/**
 * The method currently selected, as a key ("precision"...), or "" when
 * none has been chosen yet. Stored on the Hunter's Method ability item
 * itself — "The Ranger may only have one Hunter's Method active at a
 * time" is enforced by there being exactly one slot to store it in —
 * and changed through the same Use button at daily preparation.
 */
export function selectedHunterMethod(actor) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "ability") continue;
    if (String(item.name).trim().toLowerCase() !== "hunter's method") continue;
    const choice = String(item.flags?.[SYSTEM_ID]?.hunterMethodChoice ?? "").trim().toLowerCase();
    return HUNTER_METHODS.some((m) => m.key === choice) ? choice : "";
  }
  return "";
}

/**
 * Precision Hunter's dice: "+1d6 precision damage. This becomes +2d6 at
 * 9th level and +3d6 at 17th level."
 */
export function precisionHunterDice(level) {
  const value = Math.floor(Number(level) || 0);
  if (value >= 17) return 3;
  if (value >= 9) return 2;
  return 1;
}

/**
 * The whole Precision gate: "Once per round, the first time you damage
 * your hunted prey with a Strike". Selected method, prey identity and
 * the once-per-round marker are all part of the trigger; the dice are
 * only the answer once every clause holds.
 *
 * @returns {number} dice to add, or 0.
 */
export function precisionHunterOffer({
  actor = null,
  level = 0,
  targetIsPrey = false,
  usedThisRound = false
} = {}) {
  if (!hasClassAbility(actor, "Hunter's Method")) return 0;
  if (selectedHunterMethod(actor) !== "precision") return 0;
  if (!targetIsPrey || usedThisRound) return 0;
  return precisionHunterDice(level);
}

/**
 * Relentless Hunter: "your multiple attack penalty against your hunted
 * prey is reduced by 1. At 11th level, it is reduced by 2." Returned as
 * a POSITIVE relief figure; the attack workflow clamps so relief never
 * turns a penalty into a bonus.
 */
export function relentlessHunterReduction({
  actor = null,
  level = 0,
  targetIsPrey = false
} = {}) {
  if (!hasClassAbility(actor, "Hunter's Method")) return 0;
  if (selectedHunterMethod(actor) !== "relentless") return 0;
  if (!targetIsPrey) return 0;
  return Math.floor(Number(level) || 0) >= 11 ? 2 : 1;
}

/**
 * Warden Hunter: "+1-circumstance bonus to DB and saving throws against
 * your hunted prey's attacks and abilities." The DB half is answered
 * from the DEFENDER's own sheet — the attacker walking into it is what
 * the workflow supplies.
 */
export function wardenHunterBonus({ actor = null, attackerIsPrey = false } = {}) {
  if (!hasClassAbility(actor, "Hunter's Method")) return 0;
  if (selectedHunterMethod(actor) !== "warden") return 0;
  return attackerIsPrey ? 1 : 0;
}

/** The three skills Stalker Hunter names. Lowercase skill KEYS. */
export const STALKER_SKILLS = Object.freeze(["stealth", "perception", "survival"]);

/**
 * Stalker Hunter: "+1-circumstance bonus to Stealth, Perception, and
 * Survival checks against your hunted prey. This increases to +2 at
 * 10th level."
 */
export function stalkerHunterBonus({ actor = null, level = 0, subject = "" } = {}) {
  if (!hasClassAbility(actor, "Hunter's Method")) return 0;
  if (selectedHunterMethod(actor) !== "stalker") return 0;
  if (!STALKER_SKILLS.includes(String(subject ?? "").trim().toLowerCase())) return 0;
  return Math.floor(Number(level) || 0) >= 10 ? 2 : 1;
}

/**
 * The modifiers a check DIALOG should offer when "this check is against
 * my hunted prey" is ticked — Hunt Prey's class bonus on every check,
 * and Stalker's circumstance on its three skills. The Warden save bonus
 * rides the same tickbox on saving throws: a save "against your hunted
 * prey's attacks and abilities" is a check made against the prey.
 *
 * Pure — the dialog supplies checkType/subject; whether the roll really
 * is against the prey stays the box's question, exactly like Pattern
 * Disruption's "is it magical".
 */
export function huntPreyCheckModifiers({
  actor = null,
  classBonus = 0,
  checkType = "",
  subject = "",
  level = 0
} = {}) {
  if (!huntedPrey(actor)) return [];
  const modifiers = [];
  const bonus = huntPreyBonus({ actor, classBonus, targetIsPrey: true });
  if (bonus) {
    modifiers.push({ label: "Hunt Prey", value: bonus, type: "class" });
  }
  if (checkType === "skill") {
    const stalker = stalkerHunterBonus({ actor, level, subject });
    if (stalker) {
      modifiers.push({ label: "Stalker Hunter", value: stalker, type: "circumstance" });
    }
  }
  if (checkType === "save") {
    const warden = wardenHunterBonus({ actor, attackerIsPrey: true });
    if (warden) {
      modifiers.push({ label: "Warden Hunter", value: warden, type: "circumstance" });
    }
  }
  return modifiers;
}

/* ---------------------------------------------------------------------- */
/*  Swift Pursuit (6th; 13th)                                             */
/* ---------------------------------------------------------------------- */

/**
 * "At 6th level when your hunted prey moves away from you, you may Step
 * 5 feet as a reaction. At 13th level, you may instead Stride up to
 * half your Speed as a reaction..."
 *
 * @returns {"step"|"stride"|null}
 */
export function swiftPursuitMode(level) {
  const value = Math.floor(Number(level) || 0);
  if (value >= 13) return "stride";
  if (value >= 6) return "step";
  return null;
}

/**
 * Should the reaction be OFFERED for this move? "Moves away from you"
 * is read as the distance between you and the prey increasing over the
 * move — a prey circling at constant range is not moving away. The
 * "must move you closer" clause on the 13th-level Stride is guidance on
 * the card, not enforced geometry — the same treatment Press the
 * Advantage's free Step already gets.
 *
 * @returns {"step"|"stride"|null} the mode to offer, or null.
 */
export function swiftPursuitOffer({
  hasAbility = false,
  level = 0,
  preyMatches = false,
  distanceBefore = null,
  distanceAfter = null,
  reactions = 0
} = {}) {
  if (!hasAbility || !preyMatches) return null;
  if (Number(reactions) <= 0) return null;
  const mode = swiftPursuitMode(level);
  if (!mode) return null;
  // Explicit null/undefined guard BEFORE coercion: feetFromPointToToken
  // returns null on an unmeasurable path, and Number(null) is 0 — which
  // is finite, and would read as "the prey started at range zero". The
  // same trap 3.223.3's movement migration recorded.
  if (distanceBefore == null || distanceAfter == null) return null;
  const before = Number(distanceBefore);
  const after = Number(distanceAfter);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return null;
  return after > before ? mode : null;
}

/* ---------------------------------------------------------------------- */
/*  Terrain Mastery (9th; 15th)                                           */
/* ---------------------------------------------------------------------- */

/** The three skills the aura names — the same three Stalker names. */
export const TERRAIN_MASTERY_SKILLS = Object.freeze(["stealth", "perception", "survival"]);

/**
 * "allies within 30 feet who can see or hear you gain a +1-circumstance
 * bonus to Survival, Stealth, and Perception checks made in that
 * terrain. At 15th level, this bonus increases to +2." Zero below 9th —
 * the ability has not arrived.
 */
export function terrainMasteryBonus(level) {
  const value = Math.floor(Number(level) || 0);
  if (value >= 15) return 2;
  if (value >= 9) return 1;
  return 0;
}

/** The aura's printed reach, in feet. */
export const TERRAIN_MASTERY_RANGE = 30;

/**
 * The aura as seen from an ALLY's check dialog: an allied Ranger with
 * the in-favoured-terrain toggle on, within 30 feet, offering the
 * levelled bonus on one of the three named skills. "Can see or hear
 * you" stays the tickbox's question.
 */
export function terrainMasteryAuraOffer({
  rangerHasAbility = false,
  toggleOn = false,
  rangerLevel = 0,
  distance = null,
  subject = ""
} = {}) {
  if (!rangerHasAbility || !toggleOn) return 0;
  if (!TERRAIN_MASTERY_SKILLS.includes(String(subject ?? "").trim().toLowerCase())) return 0;
  // Null before coercion — Number(null) is 0, which is "in range".
  if (distance == null) return 0;
  const feet = Number(distance);
  if (!Number.isFinite(feet) || feet > TERRAIN_MASTERY_RANGE) return 0;
  return terrainMasteryBonus(rangerLevel);
}
