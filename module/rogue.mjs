/**
 * The Rogue's class abilities (Chapter 3).
 *
 * Same split as fighter.mjs, crusader.mjs and bard.mjs: everything that
 * is arithmetic on data already on the sheet lives here as pure
 * functions the harness can RUN without a Foundry actor. The glue:
 *
 *   Scoundrel's Luck       documents/actor.mjs (conviction max),
 *                          grants-workflow.mjs (the one-off top-up) and
 *                          dice/check.mjs (the advantage refund)
 *   Roguish Skill          documents/actor.mjs (the +1 class bonus) and
 *                          feats-workflow.mjs (the picker)
 *   Sneak Attack           combat/attack-workflow.mjs (qualification and
 *                          the dice into the damage formula)
 *   Opportunist's Strike   combat/attack-workflow.mjs (attack modifier,
 *                          once per round)
 *   Killer's Edge          combat/attack-workflow.mjs (the adjustable
 *                          rows on the critical injury card)
 *   Trap Finder            authored conditionals on the ability, trued
 *                          up to +4 by feats-workflow's reconcile
 *   Pattern Disruption     apps/check-dialog.mjs (the Medium-difficulty
 *                          tickbox on Disable a Device / Pick Lock)
 *
 * Archetypal Path has no arithmetic — it is a chooser, and lives whole
 * in feats-workflow.mjs beside Martial Training.
 *
 * Levels are the CHARACTER level (system.identity.level), as everywhere
 * else — this system is single-class.
 */

import { hasClassAbility } from "./crusader.mjs";
import { isFlanking } from "./combat/flanking.mjs";
import { hasCreatureTrait } from "./creature-traits.mjs";
import { hasTrait } from "./traits.mjs";

const SYSTEM_ID = "trg-prime";

/** Word-boundary trait tests, shared by three abilities below. */
function hasAgileOrFinesse(traits) {
  const printed = String(traits ?? "");
  return /\bagile\b/i.test(printed) || /\bfinesse\b/i.test(printed);
}

/* ---------------------------------------------------------------------- */
/*  Scoundrel's Luck (1st)                                                */
/* ---------------------------------------------------------------------- */

/**
 * "You may increase your conviction pool and conviction points by 1" —
 * the third class to print this sentence, and the third entry in the
 * shared top-up loop.
 */
export function scoundrelsLuckBonus(actor) {
  return hasClassAbility(actor, "Scoundrel's Luck") ? 1 : 0;
}

/** The one-off half, mirroring divineResolveTopUp / warriorsResolveTopUp. */
export function scoundrelsLuckTopUp(actor, current, alreadyGiven) {
  if (alreadyGiven) return null;
  if (!scoundrelsLuckBonus(actor)) return null;
  return Math.max(0, Math.floor(Number(current) || 0)) + 1;
}

/**
 * "You do not expend the conviction used when gaining advantage on a
 * skill modified by Roguish Skill if the result of the check is a
 * failure."
 *
 * "A failure" is Failure, Fumble or Blunder — a Partial is its own
 * degree in this system, the same reading Unbreakable Resolve records
 * (per Graham, 3.217.0). The refund restores the point AND the
 * once-per-round eligibility: a point not expended was not spent.
 *
 * @param {object} state
 * @param {boolean} state.hasAbility
 * @param {boolean} state.advantageSpent A conviction point actually went
 *   on advantage for THIS roll.
 * @param {string} state.checkType The TRGCheck type ("skill", ...).
 * @param {string} state.subject The skill key rolled.
 * @param {string[]} state.picks The recorded Roguish Skill choices
 *   (skill KEYS, lowercase).
 * @param {string} state.degree The resolved degree key.
 */
export function scoundrelsLuckRefund({
  hasAbility = false,
  advantageSpent = false,
  checkType = "",
  subject = "",
  picks = [],
  degree = ""
} = {}) {
  if (!hasAbility || !advantageSpent) return false;
  if (checkType !== "skill") return false;
  if (!picks.includes(String(subject ?? "").trim().toLowerCase())) return false;
  return ["failure", "fumble", "blunder"].includes(degree);
}

/* ---------------------------------------------------------------------- */
/*  Roguish Skill (1st; 5th, 10th, 15th, 20th)                            */
/* ---------------------------------------------------------------------- */

/**
 * How many skills Roguish Skill has granted by a level: one at 1st,
 * "At 5th level and then every 5 levels thereafter ... an additional
 * skill". Five at 20th.
 */
export function roguishSkillPickCount(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1) return 0;
  return 1 + Math.min(4, Math.floor(value / 5));
}

/**
 * The recorded picks, as lowercase SKILL KEYS, off the Roguish Skill
 * ability item's flags. Unlike Weapon Exemplar, order carries no
 * mechanics — every pick is the same flat +1 — but the stored order is
 * preserved for the card all the same.
 */
export function roguishSkillPicks(actor) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "ability") continue;
    if (String(item.name).trim().toLowerCase() !== "roguish skill") continue;
    const picks = item.flags?.[SYSTEM_ID]?.roguishSkillChoices;
    return Array.isArray(picks)
      ? picks.map((key) => String(key).trim().toLowerCase())
      : [];
  }
  return [];
}

/* ---------------------------------------------------------------------- */
/*  Sneak Attack (1st)                                                    */
/* ---------------------------------------------------------------------- */

/**
 * "an extra 1d6 precision damage ... When your stealth skill reaches
 * rank 3 and then for every 3 additional ranks thereafter the amount
 * ... increases by 1d6."
 *
 *   ranks 0-2 → 1d6,  3-5 → 2d6,  6-8 → 3d6 ... 18-20 → 7d6
 */
export function sneakAttackDice(stealthRanks) {
  const ranks = Math.max(0, Math.floor(Number(stealthRanks) || 0));
  return 1 + Math.floor(ranks / 3);
}

/**
 * The weapon half of the trigger: "an agile or finesse melee attack, or
 * a ranged weapon attack ... For a ranged attack with a thrown melee
 * weapon, that weapon must also be agile or finesse."
 *
 * @param {object} state
 * @param {boolean} state.isRanged The attack resolved as ranged.
 * @param {boolean} state.isThrownMelee A melee weapon hurled by its
 *   Thrown trait — the one ranged case with its own condition.
 * @param {string} state.traits The weapon's trait line.
 */
export function sneakAttackWeaponEligible({
  isRanged = false,
  isThrownMelee = false,
  traits = ""
} = {}) {
  if (isThrownMelee) return hasAgileOrFinesse(traits);
  if (isRanged) return true;
  return hasAgileOrFinesse(traits);
}

/** The target half: "a creature that is flanked or that has the
 * flat-footed condition". */
export function sneakAttackTargetQualifies({ flatFooted = false, flanked = false } = {}) {
  return Boolean(flatFooted) || Boolean(flanked);
}

/**
 * Whether the target is flanked by any PAIR of the attacker's allies —
 * the case the melee flanking modifier never asks about, because there
 * the attacker is one half of the pair. A ranged Rogue shooting into a
 * flank needs the answer, and so does a melee Rogue attacking a target
 * two OTHER allies have pinned: the book's trigger is "a creature that
 * is flanked", not "a creature you are flanking".
 *
 * Pure geometry over the same origin shapes flanking.mjs uses.
 *
 * @param {Array<{col, row, size}>} allies Allied token origins.
 * @param {Array<{col, row}>} targetSquares occupiedSquares(target).
 */
export function targetFlankedByAllies(allies = [], targetSquares = []) {
  for (let i = 0; i < allies.length; i += 1) {
    for (let j = i + 1; j < allies.length; j += 1) {
      if (isFlanking(allies[i], allies[j], targetSquares)) return true;
    }
  }
  return false;
}

/** Does this actor have Sneak Attack on their sheet? */
function hasSneakAttack(actor) {
  // "SNEAK ATTACK (6d6)" IS SNEAK ATTACK (3.658.0; F&F 3.0 block 25 R2 — the
  // Shade Stalker): a creature's printed dice beside the name. The dice still
  // come from its Stealth ranks, which give what it prints.
  return hasClassAbility(actor, "Sneak Attack") || Array.from(actor?.items ?? []).some(
    (item) => item.type === "ability" && SNEAK_PRINTED.test(String(item.name ?? "").trim().toLowerCase()));
}
const SNEAK_PRINTED = /^sneak attack\s*\(\s*\d+d6\s*\)$/;

/**
 * PRECISION DICE ON A FLANKED OR FLAT-FOOTED TARGET (3.651.0; F&F 3.0 block
 * 18 R10 — Graham, 16 October 2026: "As recommended"). The general feat
 * STEALTHY STRIKE reads, word for word, as the Rogue's Sneak Attack: "If you
 * Strike a creature that is flanked or that has the flat-footed condition
 * with an agile or finesse melee attack, or a ranged weapon attack, you deal
 * an extra 1d6 precision damage … As your stealth skill increases, so does
 * the amount". It rides the same rail: same target test, same weapon test,
 * same dice from Stealth ranks. A creature with both takes ONE set of dice —
 * the two describe one rule, not two.
 */
/*
 * DICE IN THE NAME (3.652.0; F&F 3.0 block 19 R5 — Graham, 16 October 2026:
 * "Go with your recommendations"). The Werecat prints "Stealthy Strike
 * (2d6)", the Wererat "Stealthy Strike (1d6)": the same feat, its dice
 * fixed by the stat block. A trailing bracket is ignored when matching the
 * name, and a bracketed "Nd6" is the dice.
 */
const STEALTHY_NAME = /^stealthy strike(?:\s*\(([^)]*)\))?$/;
function stealthyStrikeItems(actor) {
  return Array.from(actor?.items ?? []).filter((item) => ["feat", "ability"].includes(item.type)
    && STEALTHY_NAME.test(String(item.name ?? "").trim().toLowerCase()));
}
function hasStealthyStrike(actor) {
  return stealthyStrikeItems(actor).length > 0;
}
/** The dice a stat block prints in the feat's name, or null. */
function printedStealthyDice(actor) {
  for (const item of stealthyStrikeItems(actor)) {
    const inner = STEALTHY_NAME.exec(String(item.name ?? "").trim().toLowerCase())?.[1] ?? "";
    const m = /^(\d+)d6$/.exec(inner.trim());
    if (m) return Number(m[1]);
  }
  return null;
}

/**
 * How many d6 of precision damage: the printed dice of a "Stealthy Strike
 * (Nd6)" when the attacker has no Sneak Attack of its own, otherwise the
 * Stealth-rank ladder.
 */
export function sneakDiceFor(actor, stealthRanks) {
  const printed = hasSneakAttack(actor) ? null : printedStealthyDice(actor);
  return printed ?? sneakAttackDice(stealthRanks);
}

/** Sneak Attack or Stealthy Strike: whether this attacker's precision dice apply at all. */
export function hasSneakDice(actor) {
  return hasSneakAttack(actor) || hasStealthyStrike(actor);
}

/** What the card calls those dice: the ability the attacker has. */
export function sneakDiceLabel(actor) {
  return hasSneakAttack(actor) ? "Sneak Attack" : "Stealthy Strike";
}

/* ---------------------------------------------------------------------- */
/*  Opportunist's Strike (3rd; 11th)                                      */
/* ---------------------------------------------------------------------- */

/**
 * "Once per round, when you make a Strike with an agile or finesseable
 * weapon against a target that qualifies for your Sneak Attack, you
 * gain a +1-circumstance bonus to the attack roll. At 11th level, this
 * bonus increases to +2."
 *
 * Unlike Sneak Attack's weapon clause, this one names agile/finesse
 * with no ranged exemption — a plain shortbow does not carry it.
 */
export function opportunistsStrikeBonus({
  actor = null,
  level = 0,
  traits = "",
  targetQualifies = false,
  usedThisRound = false
} = {}) {
  if (!hasClassAbility(actor, "Opportunist's Strike")) return 0;
  if (usedThisRound) return 0;
  if (!targetQualifies) return 0;
  if (!hasAgileOrFinesse(traits)) return 0;
  const value = Math.floor(Number(level) || 0);
  if (value < 3) return 0;
  return value >= 11 ? 2 : 1;
}

/* ---------------------------------------------------------------------- */
/*  Killer's Edge (1st)                                                   */
/* ---------------------------------------------------------------------- */

/**
 * "When you inflict a critical hit with an attack that has either the
 * agile or finesse traits, you may increase or decrease the critical
 * result by an amount equal to your class bonus. This modifier stacks
 * with any adjustment gained from Ambush, Sniping, or similar
 * abilities."
 *
 * The allowance feeds the same adjustable-rows machinery Ambush and
 * Sniping use, attached directly to the Rogue's own injury card.
 * Stacking comes free: each shift is measured from the current result,
 * so an Ambush taken afterwards moves it further.
 *
 * @returns {number} The allowance, or 0 when it does not apply.
 */
export function killersEdgeAllowance({ actor = null, traits = "", classBonus = 0 } = {}) {
  if (!hasClassAbility(actor, "Killer's Edge")) return 0;
  if (!hasAgileOrFinesse(traits)) return 0;
  return Math.max(0, Math.floor(Number(classBonus) || 0));
}

/* ---------------------------------------------------------------------- */
/*  Trap Finder (1st)                                                     */
/* ---------------------------------------------------------------------- */

/**
 * "+2-circumstance bonus ... If you have 10 or more ranks in the
 * perception skill, your bonus increases to +4."
 *
 * The ability ships its conditionals authored at 2; the reconcile pass
 * (feats-workflow) trues the actor's own copy up to this figure, the
 * same way Aura of Power's PP grant trues up.
 */
export function trapFinderValue(perceptionRanks) {
  return Math.floor(Number(perceptionRanks) || 0) >= 10 ? 4 : 2;
}

/**
 * The one word a GM has to put on a trap for the two rules below to fire.
 *
 * MODULE-LOCAL. Nothing outside needs the constant — what callers need
 * is the ANSWER, which `attackIsFromATrap` gives them, and the harness
 * drives that rather than reading the word back out of a constant it
 * could never see go wrong.
 */
const TRAP_TRAIT = "trap";

/**
 * THE THIRD BONUS, and it was missing until 3.555.0.
 *
 * Trap Finder prints THREE: "+2-circumstance bonus to Perception checks
 * to find traps, TO DB AGAINST ATTACKS MADE BY TRAPS, and to saves
 * against traps." The ability shipped conditionals for the first and the
 * third — and nothing at all, automatic or manual, for the second. A
 * trap attacking a Rogue or a Ranger rolled against a defence two points
 * lower than the book gives them, on two classes, silently. Found by the
 * pages 51-60 audit.
 *
 * IT CANNOT BE A CONDITIONAL, which is why it was missed: the
 * conditional engine's axes are all about a check the OWNER rolls, and
 * DB is a number somebody else rolls against. So it goes where the two
 * other defender-side, attacker-scoped bonuses already live — the attack
 * workflow's DB assembly, beside Warden Hunter and Shielded Stride.
 *
 * GRAHAM'S RULING, 16 September 2026 (R1), on the one question the fix
 * needed: HOW DOES THE SYSTEM KNOW THE ATTACKER IS A TRAP? There are no
 * trap or hazard entries anywhere in the packs — a trap is whatever the
 * GM builds — so there is no trait this can count on finding. The answer
 * is option A: read the trait if it is there, and if it is not, do
 * nothing and say how to tag it. Automation for the GM who marks their
 * traps, and no invented guess for the one who does not.
 *
 * @param {object} state
 * @param {Actor} state.actor The DEFENDER, who may have Trap Finder.
 * @param {boolean} state.attackerIsTrap `attackIsFromATrap` decided this.
 * @param {number} state.perceptionRanks The defender's, for the +4 band.
 */
export function trapFinderDefenceBonus({
  actor = null, attackerIsTrap = false, perceptionRanks = 0
} = {}) {
  if (!attackerIsTrap) return 0;
  if (!hasClassAbility(actor, "Trap Finder")) return 0;
  return trapFinderValue(perceptionRanks);
}

/**
 * Is the blow coming in "made by a trap"?
 *
 * BOTH CHANNELS, because a GM marks a trap in whichever place fits what
 * they built: a pressure-plate actor carries the trait on its own
 * statblock, while a trapped chest that swings a scything blade is an
 * ordinary actor whose ATTACK is the trap. `hasCreatureTrait` reads the
 * trait line, the creature type and any granted trait, so tagging any of
 * the three works.
 *
 * @param {object} state
 * @param {object} state.attackerSystem The attacker's `system`.
 * @param {string} state.weaponTraits The attacking weapon's trait line.
 */
export function attackIsFromATrap({ attackerSystem = null, weaponTraits = "" } = {}) {
  if (attackerSystem && hasCreatureTrait(attackerSystem, TRAP_TRAIT)) return true;
  return hasTrait(String(weaponTraits ?? ""), TRAP_TRAIT);
}

/* ---------------------------------------------------------------------- */
/*  Pattern Disruption (2nd)                                              */
/* ---------------------------------------------------------------------- */

/** The two Thievery actions the ability's wording reaches: "disarming
 * magical traps, devices and locks". */
export const PATTERN_DISRUPTION_ACTIONS = Object.freeze([
  "disableADevice",
  "pickLock"
]);

/**
 * Whether the Medium-difficulty tickbox should be offered on this roll.
 * Whether the device is actually MAGICAL is the one thing the dice
 * cannot see, so that stays the tickbox's question.
 */
export function patternDisruptionApplies({ actor = null, actionKey = "" } = {}) {
  if (!hasClassAbility(actor, "Pattern Disruption")) return false;
  return PATTERN_DISRUPTION_ACTIONS.includes(String(actionKey ?? ""));
}
