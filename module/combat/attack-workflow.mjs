import { DAMAGE_TYPES, SIZE_TABLE } from "../config.mjs";
import { actionDamagePackets, alignedPacketTraits, creatureSecondaryPackets } from "./creature-secondary.mjs";
import { TRGCheck } from "../dice/check.mjs";
import {
  armourRendingValue,
  rangeBandOf,
  attackOutcome,
  bonusDamageDice,
  armourCRBypass,
  buildWeaponDamageFormula, itemDamageExcess, weaponQualityDamageBonus,
  criticalPrecisionDice,
  CRITICAL_BONUS_DICE,
  computePersistenceRounds,
  injuryDurationFormula,
  criticalChaosReplacement,
  CRITICAL_CHAOS_FACE,
  criticalBecomesSubdual,
  drAfterRendingAndPenetrating,
  deathOrFatalSave,
  effectiveFumbleDC,
  extractTraitValue,
  extractVersatileType,
  finesseAdjustment,
  handAndAHalfStrengthBonus,
  lookupTableRow,
  mapPenalty,
  penetratingApplies,
  propulsiveStrengthBonus,
  rangedAbilityAdjustment,
  quickCritResult,
  reachPenalty,
  weaponReachExtension,
  sweepApplies,
  biggerTheyAreDamageBonus
} from "./attack.mjs";
import { weaponAttackAbilities } from "../dice/check-abilities.mjs";
import { IMMUNITY_TOKENS } from "../defences.mjs";
import { lineOfEffectBlocked } from "../magic/spell-template.mjs";
import { isFatalPersistence, splitPersistenceTags } from "../injuries.mjs";
import { meleeFromHere } from "./space.mjs";
import { markFatalInjury, recordPersistence, fatalBlockNote } from "../injury-workflow.mjs";
import { declaredDamageRiders, damageRidersFor, riderFormula, ridersBurnUpdate, RIDERS_USED_FLAG } from "./damage-riders.mjs";
import { declaredMagicalAttacks, magicalAttackSource } from "./magical-attacks.mjs";
import { weaponDamageBonusFor } from "../magic/weapon-damage-bonus.mjs";
import { weaponDamageBonusesOn } from "../magic/weapon-damage-bonus-workflow.mjs";
import { defencePierceFor, defencePierceLine } from "../magic/defence-pierce.mjs";
import { defencePiercesOn } from "../magic/defence-pierce-workflow.mjs";
import { applyDamageAndCheckDying } from "./dying-workflow.mjs";
import { respiteCaughtLine } from "../magic/delayed-respite.mjs";
import { actorDeathState, deathCriticalOutcome, reapDead } from "./death-state.mjs";
// SHIELDED STRIDE WAS USED HERE AND NEVER IMPORTED (fixed 3.365.0, found
// live). `shieldedStrideBonus` is called at the target's Defence Bonus,
// which only runs when there IS a target — so an attack with nothing
// targeted worked fine and every attack against an actual creature threw
// "shieldedStrideBonus is not defined" and abandoned the whole strike.
// The one path anybody uses was the broken one.
import { farThrowBonus, shieldedStrideBonus } from "./passive-feats.mjs";
import { isStrengthBasedAttack, RAGE_BONUS } from "./rage.mjs";
import { isRaging } from "./rage-workflow.mjs";
import { recordTraitUsage, traitGate, wordAftermathModifier } from "../traits-workflow.mjs";
import { hasWeaponTrait, traitList } from "../traits.mjs";
import { actorDefences, creatureTraits, hasCreatureTrait } from "../creature-traits.mjs";
import { runeGhostTouch } from "../rune-declarations.mjs";
import { applyRuneAfterStrikes, offerMerciful } from "../rune-strike-workflow.mjs";
import { declaredDamageBonus } from "./damage-conditionals-workflow.mjs";
import { resolveAgainstDefences, applyHealsInstead } from "./damage-workflow.mjs";
import { cannotBeFlanked, ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { abilitiesPreventFlanking } from "../creature-ability-rules.mjs";
import {
  SUBDUAL_SHOT_PENALTY,
  ammoPotencyTier,
  ammunitionAttackModifier,
  ammunitionDamagePackets,
  ammunitionEffects,
  ammunitionFormulaExtra,
  combinedArmourRending,
  effectiveRangeIncrement,
  rangeIncrementMultiplierOf,
  traitsAfterAmmunition
} from "./ammunition.mjs";
import { improvisedAttackModifier, improvisedDamagePackets } from "../goods.mjs";
import { splashNeighboursLine } from "../magic/splash.mjs";
import { consumeAmmunition, selectAmmunition } from "./ammunition-workflow.mjs";
import { consumeThrownWeapon } from "./thrown-weapons.mjs";
import { skipDialog } from "../apps/check-dialog.mjs";
import { spendActionPoints } from "./action-points-workflow.mjs";
import { clearAimIfOtherAction } from "./aim.mjs";
import { needsReloading, extractLoadValue, extractMagazine } from "./reload.mjs";
import { hitLocationFromUnitDie, locationCoveredByArmour, armourAtLocation, armourPieceCoversLocation, armourContributesToHit, wholeBodyArmour, withWholeBodyArmour, HIT_LOCATION_LABELS } from "./hit-location.mjs";
import { underwaterMeleePenalty, underwaterRangedOutcome, underwaterFireFails, underwaterStrikeExemption, UNDERWATER_MARAUDER } from "./underwater.mjs";
import { criticalRowRiders, typeRecurringTags } from "./critical-riders.mjs";
import { MINUTE_ROUNDS } from "./critical-durations.mjs";
import { loseAirToEvent } from "../drowning-workflow.mjs";
import { tokenIsUnderwater } from "./underwater-workflow.mjs";
import { hasFreeHandAvailable, heldInTwoHandGrip, itemRequiredHands, twoHandedStrengthApplies } from "../held-items.mjs";
import { steppedCreatureDamage } from "../creature-attacks.mjs";
import { applyConditionTags, applySelfDamage, formatAppliedTags } from "./effect-application-workflow.mjs";
import { resolveEffectiveConditions, selectArmourClause, effectivePersistence, extractConditionTags, extractConditionalConditions, extractSelfDamage, extractTextDuration, applySerratedBonus, applySavageStrikes, criticalAmendmentApplies, extractPushDistance, applySkeweringStrikes } from "../effect-parser.mjs";
import { pushButtonsHtml, resolvePushTokens } from "./forced-movement-workflow.mjs";
import { involuntaryMovementPrompts } from "./forced-movement.mjs";
import { CRITICAL_TABLES } from "../data/critical-tables.mjs";
import { FUMBLE_TABLES } from "../data/fumble-tables.mjs";
import { effectiveDR, resolveDamagePacket } from "./damage.mjs";
import { computeWeaponModifiers, dragonhideShieldDB, materialDefenceWord, materialGrantedWeaponTraits } from "../item-quality.mjs";
import { weaponHasSpellTrait } from "../magic/weapon-trait.mjs";
import { isIncorporeal, isSwarm, swarmReducedDR } from "../codex-trait-rules.mjs";
import { runeUsageAllows, weaponUsage } from "../weapon-rune-usage.mjs";
import { lifeStealingStrike, offerCriticalSpell } from "../weapon-rune-workflow.mjs";
import { applyItemDamage, brokenArmourDR, effectiveArmourDR, itemStatus } from "../items.mjs";
import { isBodyArmour, stackedArmourDR } from "../armour-stacking.mjs";
import { attackTermsAgainst, endFixationOnHostileAct } from "../conditions/condition-events-workflow.mjs";
import { promptTargetSelection } from "./targeting.mjs";
import { targetPromptText } from "./target-prompt.mjs";
import { surpriseAttackApplies, surpriseAttackDefenceBonus, surpriseRoundInEffect } from "./surprise.mjs";
import {
  FIGHT_DEFENSIVELY_ATTACK_FLAG, fightDefensivelyCoversAttack, isFightingDefensively, takeCoverLevelOf
} from "./basic-action-stances.mjs";
import {
  relayConditionTags,
  relayHpZero,
  relayItemHp,
  relayStatus
} from "./target-relay-workflow.mjs";
import { rollPercentile, percentileDigits } from "../dice/open-ended.mjs";
import { awardConviction } from "../conviction.mjs";

import {
  COVER_TYPES,
  ENGAGED_RANGED_PENALTY,
  FIRING_INTO_MELEE_COVER,
  rangeIncrementPenalty,
  resolveStrayShot,
  withinFirstRangeIncrement
} from "./ranged.mjs";
import { FLANKING_BONUS, allyThreatens, findFlankingAlly, occupiedSquares } from "./flanking.mjs";
import { racialAttackBonuses } from "../feats.mjs";
import { aspectsOf, favouredWeaponAttackModifiers } from "../divine-aspect.mjs";
import {
  hasPressTheAdvantage,
  pressTheAdvantageAvailable,
  pressTheAdvantageStride,
  weaponExemplarBonusFor,
  weaponExemplarPicks,
  weaponExemplarTierCount,
  weaponSupremacyForgiveness
} from "../fighter.mjs";
import {
  attackIsFromATrap,
  hasSneakDice,
  killersEdgeAllowance,
  sneakDiceLabel,
  opportunistsStrikeBonus,
  sneakDiceFor,
  sneakAttackTargetQualifies,
  sneakAttackWeaponEligible,
  targetFlankedByAllies,
  trapFinderDefenceBonus
} from "../rogue.mjs";
import {
  hasHuntPrey,
  huntPreyBonus,
  isHuntedPrey,
  precisionHunterOffer,
  relentlessHunterReduction,
  wardenHunterBonus
} from "../ranger.mjs";
import { sideFlags } from "./flanking.mjs";
import { isCompanion, isBoundTo, masterIdOf } from "../companion.mjs";
import {
  companionPairModifier, perfectFlankingFlanks, preyingCompanionModifier
} from "../companion-tactics.mjs";
import { wildShapeAttackBonus } from "../druid.mjs";
import { FEROCIOUS_MODIFIER, ferociousAttackBonus, inFormNow } from "../magic/wildshape-feats.mjs";
import { adjustableRows } from "./critical-adjust.mjs";
import { POISON_COAT_FLAG } from "../poisons.mjs";
import { oilCoatOf, riderAttackRow, riderDamageBonus, riderPackets, struckMaterial } from "../oils.mjs";
import { effectiveWeaponCategory, proficiencyProfile, proficiencyOf } from "../proficiency-rules.mjs";
import { armouredFistProfile } from "../armour-descriptions.mjs";
import { stoneFistProfile } from "../elixirs.mjs";
import { abilityStrikeView, attackFormOf, declaredUnarmedRows, declaresUnarmedAbilities, unarmedAbilityCarriers, unarmedProfile, weaponScalingProfile, withUnarmedProfile } from "./unarmed-profile.mjs";
import { isBuckler } from "../buckler.mjs";
import { fumbleTableFor, isUnarmedAttack } from "./unarmed.mjs";
import { weaponStrikeRefused } from "../codex-action-rules.mjs";
import { declaredStrikeTypeOptions, forcedStrikeTypes, strikeTypeChoices, strikeTypeIsMagical, weaponStrikeTypeOptions } from "./strike-type-options.mjs";
import { applyDeclaredAfterStrikes, applyOnFell } from "./declared-after-strikes-workflow.mjs";
import { deathMarkDeadly, deathMarkQualifies, markedUuidOf } from "./death-mark.mjs";
import { mountedAttackBonus, mountedDefenceOffer, mountedReach, mountedState, mountedWeaponRefusal } from "./mounted.mjs";
import { setSharedMapCount, sharedMapCount } from "./mounted-workflow.mjs";
import { backswingRefund, braceApplies } from "./weapon-chapter6-traits.mjs";
import { struckOnSurfaceNote, surfacesUnder } from "./surfaces.mjs";
import { parseGrantList } from "../grants.mjs";
import {
  activeToken,
  distanceBetween,
  tokenOrigin,
  tokensAlliedWith,
  tokensEngaging
} from "./geometry.mjs";
import { runeDamageFor, runeDamageLine, secondaryCriticalFor } from "../rune-damage.mjs";
import {
  strikeRiderPackets, spendStrikeRiders, applyRiderConditions, burnStrikeRiders
} from "../magic/strike-riders-workflow.mjs";
import { areaRiderPackets } from "../magic/area-rider-workflow.mjs";
import { applyThorns } from "../magic/thorns-workflow.mjs";
import { runeBonusesFor, runeBonusesForActor } from "../rune-effects.mjs";
import { equippedEventRune } from "../rune-events.mjs";
import { CRIMSON_COVENANT_FLAG, HOWLING_KINSHIP, crimsonCovenantAtAttack, howlingKinshipModifier, ownsCodexFeat } from "../codex-feat-rules.mjs";
import { savageJawOffer, vorpalInjuryResult, vorpalOn } from "../codex-runes.mjs";
import { defenceDCBonus } from "./defence-dc.mjs";
import { aidBonusAgainst, consumeAidBonus } from "./aid-bonus.mjs";
import { alignedTraitsOf, creatureTypesOf } from "../aligned.mjs";
import { OPPOSED_AURA_FLAG, opposedAuraAttackBonus } from "../magic/opposed-aura.mjs";
import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";
import { healsFromDamage } from "../creature-ability-rules.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Unsteady (Chapter 6): "-2 circumstance penalty unless the weapon is
 * rested upon a solid surface before firing." Whether the weapon is
 * actually rested isn't something the system can detect — it's the
 * player's own call, per Graham directly: a tick box on the attack
 * that, if checked, removes the penalty. Shown only for weapons that
 * actually have the trait, right before the attack roll since the
 * penalty affects the roll itself, not something judged afterward.
 */
async function promptUnsteadyRested(weaponName) {
  const result = await DialogV2.wait({
    window: { title: `${weaponName} — Unsteady`, icon: "fa-solid fa-triangle-exclamation" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label><input type="checkbox" name="rested"> Weapon is rested upon a solid surface</label>
          <p class="hint">Unsteady (Chapter 6): removes the -2 circumstance penalty when checked.</p>
        </div>
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Attack",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return Boolean(result.rested);
}

/**
 * Versatile (Chapter 6): "You must choose the damage type before you
 * make the attack." Shown only for weapons that actually have the
 * trait, right before the attack roll — same reasoning and dialog
 * pattern as Unsteady, just above.
 */
/**
 * Blunt Arrows' choice (3.576.0): fire for subdual damage at -4?
 *
 * @returns {Promise<boolean|null>} null if the attack was called off
 */
async function promptSubdualShot(ammoName) {
  const result = await DialogV2.wait({
    window: { title: `${ammoName} — Subdual?`, icon: "fa-solid fa-feather" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog"><p>${ammoName}: an archer can choose to inflict <strong>subdual</strong> damage by taking a <strong>-4 circumstance</strong> penalty to the attack.</p></div>`,
    buttons: [
      { action: "lethal", label: "Normal damage", icon: "fa-solid fa-bullseye", default: true },
      { action: "subdual", label: "Subdual (-4)", icon: "fa-solid fa-feather" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result === "subdual";
}

/**
 * The radio rows for a strike's damage-type choice: the weapon's own type
 * first and checked, then a Versatile alternate, then any declared option
 * (3.627.0 — Essence Attacks). One builder for both dialogs that ask.
 */
function damageTypeRadios(choices) {
  return choices.map((choice, i) => {
    const label = DAMAGE_TYPES[choice.type]?.label ?? choice.type;
    const note = choice.source === "normal" ? "normal" : choice.source;
    return `<div class="form-group"><label><input type="radio" name="damageType" value="${choice.type}"${i === 0 ? " checked" : ""}> ${label} (${note})</label></div>`;
  }).join("");
}

async function promptVersatileDamageType(weaponName, choices) {
  const normalType = choices[0]?.type ?? "";
  const versatileOnly = choices.length === 2 && choices[1].source === "Versatile";
  const result = await DialogV2.wait({
    window: { title: `${weaponName} — ${versatileOnly ? "Versatile" : "Damage Type"}`, icon: "fa-solid fa-shuffle" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        ${damageTypeRadios(choices)}
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Attack",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result.damageType || normalType;
}

const SYSTEM_ID = "trg-prime";

/**
 * Support and Perfect Flanking, resolved for whichever end of a
 * master/companion pair is attacking.
 *
 * BOTH ENDS BENEFIT, BUT ONLY ONE END OWNS THE FEAT. These are
 * Companion-trait feats bought with a companion's own pick, and the text
 * is "you BOTH gain" — so a Ranger with no companion feats of its own
 * still gets the bonus, by reading its companion's sheet. That is why
 * this takes the attacking actor and works out which side it is on
 * rather than simply reading `actor`'s feats.
 *
 * ADJACENCY IS `sideFlags` RETURNING NON-NULL, the same test the ordinary
 * flank is built from — deliberately including its approximation, which
 * measures from a token's ORIGIN square rather than its whole footprint.
 * A better test here than the one Flanking uses would make a Huge bear
 * "supporting" from a square it could not flank from, and two different
 * answers to "is this creature next to that one" is worse than one
 * imperfect answer used consistently.
 *
 * @param {object} options
 * @param {Actor} options.actor The attacker.
 * @param {{col: number, row: number}} options.attackerOrigin
 * @param {Array<{col: number, row: number, id: string, name: string}>} options.allies
 * @param {Array<{col: number, row: number}>} options.squares The target's squares.
 * @returns {{modifier: object|null, flanks: boolean, partner: object|null}|null}
 */
function companionPairBonusFor({ actor, attackerOrigin, allies = [], squares = [] } = {}) {
  if (!actor || !attackerOrigin || !squares.length) return null;
  // The attacker has to be next to the target itself — a reach weapon
  // can strike from two squares away, and neither feat describes
  // anything a creature gets while standing off.
  if (!sideFlags(attackerOrigin, squares)) return null;

  const attackerIsCompanion = isCompanion(actor);
  const partner = allies.find((ally) => {
    const allyActor = canvas?.tokens?.get(ally.id)?.actor ?? null;
    if (!allyActor) return false;
    return attackerIsCompanion
      ? allyActor.id === masterIdOf(actor)
      : isBoundTo(allyActor, actor.id);
  }) ?? null;
  if (!partner) return null;
  if (!sideFlags(partner, squares)) return null;

  // Whichever of the two is the companion is the one whose feats decide.
  const companionActor = attackerIsCompanion
    ? actor
    : (canvas?.tokens?.get(partner.id)?.actor ?? null);
  const companionFeatNames = Array.from(companionActor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);

  const modifier = companionPairModifier({
    companionFeatNames, bothAdjacent: true, partnerName: partner.name
  });
  if (!modifier) return null;
  return {
    modifier,
    flanks: perfectFlankingFlanks({ companionFeatNames, bothAdjacent: true }),
    partner
  };
}

function setting(key, fallback) {
  try {
    return game.settings.get(SYSTEM_ID, key);
  } catch {
    return fallback;
  }
}

/** The first targeted token, if any. */
function firstTargetToken() {
  return game.user.targets?.first?.() ?? [...(game.user.targets ?? [])][0] ?? null;
}

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

// The resistance/immunity/weakness splitter that used to live here has
// moved to defences.mjs and is reached through actorDefences(). Being
// private to this file is precisely why no other damage path in the
// system ever consulted a target's defences.

/**
 * The damage type or trait making this target immune to this strike, if
 * any — the thing that must also suppress the critical.
 *
 * @returns {string|null} A label for reporting.
 */
function immuneToThisStrike(targetSystem, weapon, damageTypeOverride = null, creatureTypeSystem = null) {
  const defences = actorDefences(targetSystem, creatureTypeSystem);

  // Critical Immunity (Chapter 7 sidebar, confirmed by Graham): "A
  // creature or character with critical immunity ignores all critical
  // injuries" — recorded as the word "critical" in the immunities field,
  // blanket rather than per-type.
  if (defences.immunities.has("critical")) return "critical hits (Critical Immunity)";

  const type = String(
    damageTypeOverride || weapon?.system?.damageType || ""
  ).trim().toLowerCase();
  if (type && defences.immunities.has(type)) return DAMAGE_TYPES[type]?.label ?? type;

  const traits = traitList(`Attack, ${weapon?.system?.traits ?? ""}`);
  for (const trait of traits) {
    if (defences.immuneTraits.has(trait)) return `the ${trait} trait`;
  }
  return null;
}

async function postCard(actor, title, lines, rolls = [], { compactSummary = null, flags = null, extraContent = "" } = {}) {
  const body = compactSummary
    ? `<div class="check-details-wrapper"><div class="compact-summary-row"><span class="compact-summary">${compactSummary}</span><i class="fa-solid fa-list-ul check-details-icon" data-tooltip="Hover for the full breakdown"></i></div><div class="check-details">${lines.join("")}</div></div>`
    : lines.join("");
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    ...(flags ? { flags } : {}),
    content: `<div class="trg-prime trg-check-card${compactSummary ? " compact" : ""}"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${body}${extraContent}</div>`
  });
}

/**
 * Press the Advantage (Fighter, 4th): "Once per round, when you achieve
 * one of the following, you may immediately Step 5 feet or Interact as a
 * free action" — a critical hit, a disabled enemy, a successful combat
 * manoeuvre, or an enemy fumbling within reach.
 *
 * The system prompts on the triggers it can SEE — your attack critting
 * (here), your Shove/Trip/Disarm/Grapple succeeding (resolveAction), and
 * from 3.555.0 the enemy you DISABLED (reaction-feat-detection, off the
 * same `incapacitated` Cleave asks). The ability's Use button now covers
 * one trigger rather than two: the enemy who fumbled at you, which is a
 * fumble on somebody else's attack measured against your reach.
 *
 * THAT COUNT WAS WRONG FOR SEVERAL RELEASES and this comment said so
 * confidently — "the two it cannot [see]". The disabled-enemy fact was
 * already being computed, in a file this one imports, for a different
 * feat. The pages 51-60 audit found it. A comment naming a limit the
 * code no longer has is the kind that stops the next reader looking.
 *
 * One flag serves them all, reset alongside the reaction pool at the
 * turn start: the book's free action happens "immediately", so a prompt
 * declined is an opportunity passed, not one banked for later in the
 * round.
 *
 * @returns {boolean} Whether the prompt fired.
 */
export async function maybePromptPressTheAdvantage(actor, trigger) {
  if (!game.combat?.started) return false;
  if (!pressTheAdvantageAvailable({
    hasAbility: hasPressTheAdvantage(actor),
    usedThisRound: Boolean(actor.getFlag?.(SYSTEM_ID, "pressAdvantageUsed"))
  })) return false;
  await actor.setFlag(SYSTEM_ID, "pressAdvantageUsed", true);

  const stride = pressTheAdvantageStride(Number(actor.system?.identity?.level ?? 0));
  await postCard(actor, "Press the Advantage", [
    line(`<strong>Trigger:</strong> ${trigger}.`),
    line(stride
      ? "You may immediately, as a free action, <strong>Step 5 feet</strong>, <strong>Interact</strong>, or <strong>Stride up to half your Speed</strong> (13th) — the Stride must end adjacent to an enemy, in cover, in a flanking position, or protecting an ally."
      : "You may immediately, as a free action, <strong>Step 5 feet</strong> or <strong>Interact</strong>."),
    line("<em>The Interact must relate directly to the combat: drawing a weapon, changing grip, drawing ammunition, opening or closing a door, grabbing an item, switching weapons, or manipulating battlefield gear.</em>"),
    line("<em>Once per round — it happens now or not at all; resets at the start of your turn.</em>")
  ]);
  return true;
}

/**
 * The weapon attack workflow.
 *
 * 1. Attack check through TRGCheck (open-ended, advantage-aware), with the
 *    actor's derived attack modifiers, the weapon's own bonus, MAP from the
 *    turn's attack count, and -4 when not proficient.
 * 2. Resolution against the first targeted token's DB if one is targeted;
 *    otherwise the card reports the total for the GM.
 * 3. On AV >= 5, the critical injury roll: d100 with the severity's dice
 *    bias, on the table for the weapon's damage type, with armoured
 *    variants, Death/Fatal save instructions, and the unmodified-66 chaos
 *    replacement.
 * 4. On UM 1 (or 2 non-proficient), the d20 Fumble Check against the
 *    weapon's Fumble DC, and the category fumble table on failure.
 *
 * Damage rolling is a separate action so a GM can veto a hit first.
 */
/**
 * `apPaid`, `extraModifiers` and `skipTargetPrompt` exist for the actions
 * that CONTAIN a Strike rather than being one (3.336.0).
 *
 * Charge is "two Stride actions ... and you may make a melee Strike
 * action against them with a +4-circumstance bonus", all for its own
 * 3 AP; Double Slice is "make two Strikes", also for 3. Neither may
 * charge a further 1 AP per swing — the containing action has already
 * been paid for — and both need to add their own modifier to the roll.
 * Charge additionally already knows its target, having just moved
 * towards it, so asking again would be asking twice.
 */
/**
 * Whether a strike is made outside its maker's own turn (3.645.0, F4): a
 * started combat in which this creature has a place, on someone else's turn.
 * Outside combat, or for a creature not in it, there is no turn to be off.
 */
/** What the MAP row names: the caller's ability when it set the penalty, else the attack number. */
function mapSetBy({ mapOverride = null, optionLabel = "", attackIndex = 0 } = {}) {
  // ONLY WHEN THE CALLER NAMES ITSELF: Sweeping Strike and Torrent of
  // Strikes also set the penalty, without a name, and keep "attack N".
  const set = mapOverride !== null && Number.isFinite(Number(mapOverride));
  const name = String(optionLabel ?? "").trim();
  return set && name ? name : `attack ${attackIndex + 1}`;
}

function strikeIsOffTurn(actor) {
  const combat = game.combat;
  if (!combat?.started || !actor) return false;
  const mine = combat.combatants?.filter?.((c) => c.actor === actor || (c.actorId === actor.id && c.token?.actorLink)) ?? [];
  if (!mine.length) return false;
  const current = combat.combatant;
  return !mine.some((c) => c.id === current?.id);
}

/**
 * SHOVE AND TRIP WITH A WEAPON (Chapter 6 traits): "uses your attack bonus
 * with the weapon instead of your unarmed attack bonus."
 *
 * The maneuver started from the character's general attack total and
 * added only the item's own `attackBonus` field, which is 0 on every
 * weapon in the pack — so a whip-trip ignored Finesse, Weapon Focus,
 * Weapon Exemplar, a favoured weapon and the -4 for not knowing how to
 * use the thing. Found in the pages 151-160 audit (3.575.0).
 *
 * These are the rows `rollWeaponAttack` adds for the WEAPON, built from
 * the same helpers, so the two cannot disagree about what "your attack
 * bonus with the weapon" is. What belongs to a Strike and not to a
 * weapon — range, flanking, sweep, cover, MAP — is not here.
 *
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {Array<object>} modifier rows
 */
export function weaponManeuverModifiers(actor, weapon) {
  if (!actor || !weapon) return [];
  const system = actor.system ?? {};
  const weaponData = weapon.system ?? {};
  const rows = [];
  const finesse = /\bfinesse\b/i.test(String(weaponData.traits ?? ""));
  const finesseBonus = finesseAdjustment(
    finesse,
    Number(system.combat?.attack?.ability ?? 0),
    Number(system.attributes?.dexterity?.total ?? 0)
  );
  if (finesseBonus) rows.push({ label: `Finesse (Dexterity) — ${weapon.name}`, value: finesseBonus, type: "untyped" });
  const weaponBonus = Number(weaponData.attackBonus ?? 0);
  if (weaponBonus) rows.push({ label: weapon.name, value: weaponBonus, type: "item" });
  const runes = runeBonusesFor(weapon);
  if (runes.strikeAttack) {
    rows.push({ label: `${weapon.name} (Ancient Echoes)`, value: runes.strikeAttack, type: runes.strikeType || "luck" });
  }
  const thisGroup = String(weaponData.group ?? "").trim().toLowerCase();
  for (const effect of Array.from(actor.appliedEffects ?? actor.effects ?? [])) {
    if (effect.disabled) continue;
    const group = String(effect.getFlag?.(SYSTEM_ID, "weaponFocusGroup") ?? "").trim().toLowerCase();
    if (group && group === thisGroup) rows.push({ label: effect.name, value: 1, type: "class" });
  }
  for (const bonus of favouredWeaponAttackModifiers(aspectsOf(actor), weapon.name, weaponData.group)) rows.push(bonus);
  const exemplar = weaponExemplarBonusFor(
    weaponExemplarPicks(actor), weaponExemplarTierCount(Number(system.identity?.level ?? 0)), weaponData.group);
  if (exemplar) rows.push({ label: `Weapon Exemplar (${weaponData.group})`, value: exemplar, type: "class" });
  const proficiency = proficiencyOf(proficiencyProfile(actor), { type: "weapon", name: weapon.name, system: weaponData, flags: weapon.flags });
  if (!proficiency.proficient) {
    rows.push({ label: `Non-proficient — ${proficiency.why}`, value: -4, type: "untyped" });
  }
  return rows;
}

export async function rollWeaponAttack(actor, weapon, {
  event,
  isReaction = false,
  apPaid = false,
  extraModifiers = [],
  skipTargetPrompt = false,
  mapFrozen = false,
  // A COMPOUND ACTION'S STRIKE (3.631.0; Fiends & Fables 3.0 block 1):
  // Powerful Charge's "+1 die of base damage", Torrent of Strikes' "current
  // multiple attack penalty at -2" (a fixed MAP for every strike of the
  // action), Pack Attack's precision die. See combat/compound-action.mjs.
  extraBaseDice = 0,
  // STORM OF BLADES (3.640.0, F&F 3.0 block 10 R8): a compound strike's
  // flat extra damage, and what a critical does to it (`criticalBoost`:
  // { severityUp, extraDamageMultiplier }) — see combat/compound-action.mjs.
  extraFlatDamage = 0,
  criticalBoost = null,
  mapOverride = null,
  // A STRIKE THAT "COUNTS AS TWO ATTACKS WHEN CALCULATING YOUR MULTIPLE
  // ATTACK PENALTY" (3.670.0; Inner Tempest's Perfect Strike and Perfect
  // Shot): the counter advances by this many, as Power Attack's does by two.
  mapSteps: mapStepsOption = 1,
  // A STRIKE ITS TARGET CANNOT REACT TO (3.671.0; Inner Tempest's Drawn
  // Verdict: "The target cannot use reactions triggered by the drawing of
  // your weapon or this Strike"). The target is offered no defence, no
  // critical replacement, no reactive disarm and no miss reaction, and the
  // resolved hook says so for a module's own offers. Its conviction reroll
  // is not a reaction and is still asked; an ally's intercept is not the
  // target's and is still asked.
  noReactions = false,
  extraPrecisionDice = 0,
  // SHIELDED STRIDE'S ONE FACT (fixed 3.365.0, found live). This was read
  // as `options.provokedByMovement` inside a function that destructures its
  // options and never binds `options` — a ReferenceError on the one line
  // that needed it. Opportunity attacks pass it; everything else defaults.
  provokedByMovement = false,
  // REACH WAS ALREADY ESTABLISHED WHEN THE REACTION WAS OFFERED (3.374.0).
  //
  // Graham, 23 August 2026: an Attack of Opportunity fires and "the
  // character moves and then is out of range". The reach gate below
  // measures the distance AT THE MOMENT THE BUTTON IS CLICKED, and refuses
  // outright when the provoker has finished its move — which it always has,
  // because the card is read after the animation. Worse, the reaction was
  // already spent by then, so the reactor lost it and got no attack.
  //
  // The gate is asking the wrong question. An Attack of Opportunity is
  // provoked BY leaving reach: the target WAS in reach at the moment it
  // triggered, and that is the fact the rule turns on. `movementReactors`
  // and `stationaryReactors` already measured it to decide who could be
  // offered a strike at all — so re-measuring here is two places deciding
  // one question, and the second one holds stale geometry.
  reachAlreadyEstablished = false,
  // XITHRA AND SCREECH (3.643.0, F&F 3.0 block 13 R6): a weapon marked
  // `viaAbility` is struck only through that ability's Use.
  viaAbility = false,
  // AN ACTION'S OWN EXTRA DAMAGE (3.649.0; F&F 3.0 block 16 R4/R5): the
  // Cloud Giant's Thundering Strike "+2d12 bludgeoning", Lightning Strike's
  // "+3d12 electricity" — typed packets of their own, met by the struck
  // creature's defences like a weapon's printed secondary damage.
  extraTypedDamage = [],
  // ONE ROLL, MANY DEFENCES (3.649.0, R5): the die the first creature's
  // check rolled, met here by this creature's DB; and the damage dice the
  // first hit rolled, shared by formula. See codex-actions-workflow.mjs
  // `sweepingStrike`.
  presetDice = null,
  sharedDamage = null,
  // A SERIES OF STRIKES THAT MEETS ITS DEFENCES ONCE (3.667.0; Inner
  // Tempest's Flurry of Blows): "If both hit the same creature, apply DR,
  // resistance and weakness only once … you may only inflict one critical
  // injury, although you still gain additional critical damage from both
  // strikes." A later Strike of the series that hits the same creature
  // passes `drWaived` (its DR was met by the first) and, once a critical
  // injury has been rolled, `noCriticalInjury` (its critical dice still
  // count). See combat/strike-series.mjs.
  drWaived = false,
  noCriticalInjury = false,
  seriesLabel = "",
  // PER-STRIKE OPTIONS (3.668.0; Inner Tempest's Shadowy Step and Formless
  // Cut): the target "is considered to be flanked", "treated as
  // flat-footed", and its "active stance or form bonuses" ignored, for this
  // Strike only. `optionLabel` names the ability on the card. See
  // combat/strike-options.mjs.
  treatAsFlanked = false,
  treatAsFlatFooted = false,
  ignoreTargetStance = false,
  optionLabel = "",
  // A BLOW HELD (3.668.0; Inner Tempest's Black Lotus, Graham's ruling of 23
  // October 2026): on a hit, the critical and the damage are not rolled now.
  // The hit is recorded, and lands from a card at the start of the target's
  // turn. See combat/held-strike.mjs.
  holdDamage = false,
  // A PAIR'S RULES (3.668.2; Double Slice, Graham 23 October 2026: "Yes
  // please fix Double Slice"). `noCritical`: "You can only inflict one
  // critical" — a critical this Strike rolls counts as an ordinary hit, its
  // bonus dice and injury with it. `beforeDamage(…)`: asked once the hit is
  // known and before anything it does is applied; `{ void: true }` turns it
  // into a miss ("if either attack fumbles, then the other attack
  // automatically misses"). See combat/double-slice-workflow.mjs.
  noCritical = false,
  beforeDamage = null,
  // A READIED STRIKE (3.668.1): made through Ready, for Inner Tempest's
  // Brace trait. See combat/weapon-chapter6-traits.mjs.
  readied = false,
  // THE REROLL OF A FUMBLED STRIKE (3.669.0; Fortune's Reversal): set on the
  // second roll, so a fumble there is not offered again.
  fumbleRerolled = false
} = {}) {
  const viaRefused = weaponStrikeRefused(weapon, viaAbility);
  if (viaRefused) {
    ui.notifications?.warn(`${weapon.name} is used through ${viaRefused} — use that ability.`);
    return null;
  }
  // BROKEN WEAPONS DO NOT ATTACK (3.573.0). Chapter 6, the Broken
  // Condition: "a broken object can't be used for its normal function."
  // A weapon's normal function is this. Graham ruled on 18 September 2026
  // that the rule should be enforced rather than printed as a note.
  //
  // REFUSED BEFORE THE TARGET PROMPT and before any AP is spent, so a
  // player who tries is told why and loses nothing. An untracked weapon —
  // one with no maximum HP, which is every weapon in the shipped pack —
  // is never broken and never reaches this.
  const weaponCondition = itemStatus(weapon?.system?.hp?.value, weapon?.system?.hp?.max);
  if (weaponCondition === "broken" || weaponCondition === "destroyed") {
    ui.notifications?.warn(
      `${weapon.name} is ${weaponCondition} and cannot be used`
      + `${weaponCondition === "broken" ? " until it is Repaired" : ""}.`
    );
    return null;
  }

  // MOUNTED (3.576.0; Graham, 19 Sep 2026): the Lance "can only be
  // effectively wielded while the user is mounted", and the Composite
  // Longbow "cannot be used whilst mounted". Declared on the weapon
  // (`mountedUse`), refused here before a target is asked for.
  const mountedRefusal = mountedWeaponRefusal(weapon?.system, mountedState(actor).mounted, weapon.name);
  if (mountedRefusal) {
    ui.notifications.warn(mountedRefusal);
    return null;
  }

  // MOUNTED COMBAT (page 200; the block-19 audit's D13, Graham's R13 of
  // 21 September 2026: "all of it"). The rider and the mount are "a
  // single entity" for the reach they attack at, the penalty they share
  // and the bonus they gain — resolved once, here, and used three times
  // below. The steed is looked up through its handle because a mount is
  // usually an unlinked token and its id alone names the wrong sheet.
  const riderState = mountedState(actor);
  const steedActor = riderState.mounted && riderState.steed
    ? await resolveActorHandle(riderState.steed)
    : null;

  const confirmed = skipTargetPrompt || await promptTargetSelection(actor, {
    title: `${weapon.name} — Select Target`,
    prompt: targetPromptText({ isAttack: true })
  });
  if (!confirmed) return null;

  // Load (Chapter 6): a weapon that isn't loaded can't be fired at
  // all — checked before AP is spent, so a blocked attack doesn't
  // waste the actor's Strike AP on nothing.
  if (needsReloading(weapon.system.traits) && !weapon.system.loaded) {
    ui.notifications.warn(`${weapon.name} isn't loaded — reload it first.`);
    return null;
  }

  // Magazine (Repeater): auto-loads each shot from a magazine, firing until it
  // runs dry — then the whole magazine is reloaded as a full-round action.
  const magazineCapacity = extractMagazine(weapon.system.traits);
  if (magazineCapacity > 0 && Number(weapon.system.magazine ?? 0) <= 0) {
    ui.notifications.warn(`${weapon.name}'s magazine is empty — reload it (a full round).`);
    return null;
  }

  // Ammunition (Chapter 6): a missile weapon fires something, and what
  // it fires changes the attack — Armour Rending, damage type, range
  // increment and any extra damage all come from the round, not the bow.
  // Chosen before AP is spent, so an empty quiver costs nothing.
  const ammoChoice = await selectAmmunition(actor, weapon, { skipPrompt: skipDialog(event) });
  if (ammoChoice.cancelled) return null;
  if (ammoChoice.blocked) {
    ui.notifications.warn(
      `${weapon.name} has no compatible ammunition — none of ${actor.name}'s rounds fit it, or they are all spent.`
    );
    return null;
  }
  const ammo = ammoChoice.ammo;
  const ammoSystem = ammo?.system ?? null;
  const ammoEffects = ammunitionEffects(ammoSystem);

  // Free Hand (Chapter 6): "if the hand is occupied or in use,
  // attacking with the free-hand weapon is not possible" — the
  // weapon itself never consumes hand budget (see itemRequiredHands),
  // but attacking with it still needs a hand genuinely free of
  // everything else at that moment.
  if (
    /\bfree[\s-]*hand\b/i.test(String(weapon.system?.traits ?? "")) &&
    !hasFreeHandAvailable(Array.from(actor.items ?? []), actor.system?.identity?.size ?? "medium")
  ) {
    ui.notifications.warn(
      `${weapon.name} needs a free hand to attack with, but both of your hands are occupied.`
    );
    return null;
  }

  // Traits (Appendix 3): a weapon Strike is an Attack action, so it
  // both obeys the per-turn trait rules and — more importantly — is
  // what closes the window on Open actions and opens the one Press
  // needs. Its own traits are carried too, so a Flourish or Press
  // weapon is governed by the same rules as a Flourish or Press action.
  const strikeTraits = { traits: `Attack, ${weapon.system?.traits ?? ""}` };
  if (!traitGate(actor, strikeTraits, weapon.name)) return null;

  const system = actor.system;
  // METAL BRACERS ARE GAUNTLETS (Chapter 6; Graham, 19 Sep 2026): an
  // Unarmed Strike made in them is a gauntlet attack — its damage type,
  // traits, fumble DC and category. `weaponData` is the one object this
  // workflow reads the weapon through, so replacing it here is the whole
  // change. See armour-descriptions.mjs.
  const armouredFist = armouredFistProfile(weapon, Array.from(actor.items ?? []));
  // FIST OF ROCK (page 179; 3.577.0): "For 1 hour, your fists deal 1d6
  // base bludgeoning damage and lose the nonlethal trait." The elixir
  // leaves a marker; the Unarmed Strike reads it here, beside the bracers.
  const { findMarker } = await import("../magic/markers.mjs");
  const stoneFist = stoneFistProfile(weapon?.system, Boolean(findMarker(actor, "fistOfRock")));
  // AND THE ROUND HAS ITS SAY (3.576.0): Distance Arrows "remove the
  // deadly trait". Read through here, the bow's trait line loses what the
  // arrow declares it removes for this one shot. See ammunition.mjs.
  // TRAINED FISTS (3.667.0; Inner Tempest's Powerful Fists): a declared
  // die and Versatile letter on the Unarmed Strike. Fist of Rock still wins
  // where both apply. See combat/unarmed-profile.mjs.
  const unarmedHere = unarmedProfileFor(actor, armouredFist.data);
  const trainedFist = withUnarmedProfile(armouredFist.data, unarmedHere);
  const fistData = stoneFist ? { ...trainedFist, ...stoneFist } : trainedFist;
  const ammoData = ammoSystem
    ? { ...fistData, traits: traitsAfterAmmunition(fistData.traits, ammoSystem) }
    : fistData;
  // A TRAIT THE WEAPON'S GROUP GAINS (3.668.0; Weapon Discipline's Finesse
  // "if wielded in one hand"). See combat/strike-options.mjs.
  const { traitsWithGroupGrants } = await import("./strike-options.mjs");
  // UNARMED ABILITIES WITH THIS WEAPON (3.671.0; Soul-Bound Weapon, Zen
  // Archer, B7-6). Abilities only: `abilityData` below is what the
  // ability readers see; the fists' damage profile above never does.
  const abilityUnarmed = declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon);
  const groupTraits = traitsWithGroupGrants(ammoData.traits, [...Array.from(actor.items ?? []), ...Array.from(actor.appliedEffects ?? actor.effects ?? [])], {
    group: ammoData.group,
    oneHanded: itemRequiredHands(weapon, actor.system?.identity?.size ?? "medium") < 2 && !heldInTwoHandGrip(weapon),
    // AN UNARMED-SCOPED GRANT (3.670.0; Mantis and Dragon Stance).
    unarmed: attackFormOf(ammoData) === "unarmed" || abilityUnarmed
  });
  const weaponData = groupTraits === ammoData.traits ? ammoData : { ...ammoData, traits: groupTraits };
  const abilityData = abilityStrikeView(weaponData, abilityUnarmed);

  /*
   * HIDE FROM ANIMALS ENDS HERE (3.503.0). "If a warded character
   * touches an animal or ATTACKS ANY CREATURE, even with a spell, the
   * spell ends."
   *
   * AT THIS ONE GATE, because every route to a weapon attack crosses it
   * — a Strike from the sheet, a reaction feat, an Attack of Opportunity
   * — and a ward that asked each caller to remember would end on some of
   * them. Silent when nobody is warded, which is almost always.
   *
   * BELOW THE TARGET PICKER, AND THAT IS RIGHT (corrected at 3.504.0).
   * The first version of this comment claimed the gate sat ABOVE the
   * target lookup "so an attack that finds no target has still been
   * made". Driving it live on 5 September showed the opposite: the
   * picker runs first, and the ward was still on the token while
   * "Select Target" was open. The BEHAVIOUR is the one to want — an
   * attack nobody committed to does not spend the ward, exactly as a
   * cast refused before its action spend does not — but the comment
   * described code this file has never had.
   */
  {
    const { endHidingWards } = await import("../magic/hide-from-animals-workflow.mjs");
    await endHidingWards(actor, "weapon");
  }

  // `let`, NOT `const` (3.616.0): an Arrow Catching rune can divert a
  // missile to another creature once the attack is known to be ranged —
  // see the diversion below `isRanged`.
  let targetToken = firstTargetToken();
  let targetActor = targetToken?.actor ?? null;

  // A PERIL WITH NO BODY (3.629.0; Pillars of Faith, Chapter 8): "A haunt
  // normally has no physical body. Unless its stat block provides DB, HP or
  // another relevant statistic, it cannot be directly damaged." Refused
  // before anything is spent.
  {
    const { perilHasNoBody } = await import("../peril.mjs");
    if (targetActor && perilHasNoBody(targetActor)) {
      ui.notifications.warn(`${targetActor.name} has no physical body to strike — it cannot be attacked.`);
      return null;
    }
  }

  // SURPRISE ATTACK, DECLARED BEFORE IT IS USED (3.352.1).
  //
  // THIS THREW ON EVERY ATTACK WITH A TARGET. The value was declared
  // ~300 lines below its first use, so reading it hit the temporal dead
  // zone and `rollWeaponAttack` rejected with "Cannot access
  // 'surpriseAttackOn' before initialization" — no card, no
  // notification, nothing in the log. Present since Surprise Attack was
  // automated, and invisible to the harness because no check ever RAN an
  // attack against a target; the file was only ever read.
  //
  // Found by driving a live attack on 21 August 2026.
  //
  // "They are flat-footed TO YOU" — a property of the pairing, not of
  // either creature — so it is answered here, where both are known, and
  // never written onto the target. Round one's Flat-Footed is shed at
  // the start of each combatant's own turn, so by the time you act,
  // anyone above you in the order has already lost it.
  const surpriseAttackOn = surpriseAttackApplies(
    Array.from(actor.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "surprise attack"
    ),
    surpriseRoundInEffect(
      game.combat?.getFlag?.(SYSTEM_ID, "surpriseRoundActive"),
      Number(game.combat?.round ?? 0)
    )
  );

  // Attack mode (Chapter 6): missile/thrown weapons are inherently ranged. A
  // *melee* weapon that also carries the Thrown trait is thrown automatically
  // when its target is beyond melee reach, and used in melee otherwise — so a
  // dagger jabs an adjacent foe but is hurled at a distant one, with no manual
  // toggle. Distance is measured up front (needs the tokens) to make that
  // call — and now to make the reach/range checks below, which is why this
  // whole block sits before AP is spent rather than after.
  const attackerToken = activeToken(actor);
  const positional = setting("positionalAutomation", true) && attackerToken && targetToken;
  let distanceToTarget = positional ? distanceBetween(attackerToken, targetToken) : null;
  const inherentRanged = ["missile", "thrown"].includes(weaponData.attackMode);
  const canThrow = /\bthrown\b/i.test(String(weaponData.traits ?? ""));
  // HOW FAR THIS WEAPON REACHES (3.576.0): the Reach trait's +5, or what
  // the weapon prints — the Whip's 15 ft. See `weaponReachExtension`.
  const reachExtension = weaponReachExtension(weaponData);
  const hasReachTrait = reachExtension > 0;
  const meleeReach = (Number(system.combat?.reach ?? 5) || 5) + reachExtension;
  const thrownByDistance =
    !inherentRanged &&
    canThrow &&
    distanceToTarget !== null &&
    distanceToTarget > meleeReach;
  const thrownAttack = weaponData.attackMode === "thrown" || thrownByDistance;
  const isRanged = inherentRanged || thrownByDistance;

  /*
   * ARROW CATCHING DRAWS THE MISSILE (3.616.0, Graham's R6 of block 36):
   * "any projectile or thrown weapon aimed at a target within 5 feet of the
   * wielder diverts from its original target and targets them instead",
   * unless the wielder has greater cover. Aimed at anyone, as ruled. Asked
   * here, once the attack is known to be ranged and before anything reads
   * the target — range, cover, DB, concealment, the card — so every one of
   * them is the catcher's. See arrow-catching.mjs.
   */
  let diversionNote = "";
  if (isRanged && targetToken && canvas?.tokens?.placeables?.length) {
    const { divertingCatcher, arrowCatchingActive, diversionLine } = await import("../arrow-catching.mjs");
    const candidates = canvas.tokens.placeables
      .filter((t) => t?.actor && t.id !== targetToken.id && t.id !== attackerToken?.id)
      .map((t) => ({
        id: t.id,
        token: t,
        active: arrowCatchingActive(runeBonusesForActor(Array.from(t.actor.items ?? []))),
        distanceToTarget: null,
        cover: ""
      }))
      .filter((c) => c.active)
      .map((c) => ({ ...c, distanceToTarget: distanceBetween(c.token, targetToken), cover: takeCoverLevelOf(c.token.actor) }));
    const catcher = divertingCatcher(candidates, { attackerId: attackerToken?.id ?? "", targetId: targetToken.id, ranged: true });
    if (catcher) {
      diversionNote = diversionLine({
        weaponName: weapon.name,
        fromName: targetActor?.name ?? "its target",
        toName: catcher.token.actor.name,
        feet: catcher.distanceToTarget
      });
      targetToken = catcher.token;
      targetActor = catcher.token.actor;
      try { targetToken.setTarget?.(true, { user: game.user, releaseOthers: true }); } catch { /* the attack goes on regardless */ }
      if (positional) distanceToTarget = distanceBetween(attackerToken, targetToken);
    }
  }

  // Guardian's Intercession is asked further down, once the Strike is
  // committed (3.669.0; see "AN ALLY STEPS IN").
  let interceptNote = "";

  const finesse = !isRanged && /\bfinesse\b/i.test(String(weaponData.traits ?? ""));
  const sweep = /\bsweep\b/i.test(String(weaponData.traits ?? ""));
  const hasReach = !isRanged && hasReachTrait;

  const ownsFeat = (name) => Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === name
  );

  // Creature Type: Ooze — "cannot be Flanked or Flat-Footed." Computed here
  // (rather than beside the rest of the flanking logic, below) because it
  // also gates whether the reach check runs at all, matching this block's
  // original placement exactly — only WHEN these checks run has moved.
  // Creature Codex: All Round Vision grants the same immunity from an
  // ability, so both places are asked. One rule, two homes — not two
  // rules.
  const targetCannotBeFlanked = Boolean(targetActor)
    && (cannotBeFlanked(ownedCreatureTypeSystem(targetActor))
      || abilitiesPreventFlanking(Array.from(targetActor.items ?? []), Array.from(targetActor.appliedEffects ?? targetActor.effects ?? [])));

  // Reach (Chapter 6, melee) and range increment (Chapter 6, ranged): a
  // Strike that can never land — out of melee reach with nothing to throw
  // it with, or beyond a missile weapon's six range increments — is refused
  // here, before AP is spent, the same as the Load/Magazine/Ammunition/Free
  // Hand checks above. Both used to be checked much later in this function,
  // after `spendActionPoints` had already run, so a blocked Strike still
  // cost the player 1 AP for nothing. `reach`/`rangeIncrement` are reused in
  // their original locations below (for the attack-roll modifier and the
  // Powerful/Volley/Point Blank Shot maths) rather than recomputed.
  let reach = null;
  // REACH IS NOT A FLANKING QUESTION (3.575.0). This was gated on
  // `!targetCannotBeFlanked` along with the flank below, so against an
  // ooze or anything else that cannot be flanked a dagger could be swung
  // from thirty feet away and a reach weapon never took its -2. Found in
  // the pages 151-160 audit.
  const measuresReach = positional && !isRanged;
  if (measuresReach) {
    // SHARED SPACE (page 200): "you occupy all the squares within your
    // mount's space when making your attacks… you can attack a creature
    // with a reach of 10 feet rather than 5 (assuming of course that your
    // mount does not have reduced reach)."
    const normalReach = steedActor
      ? mountedReach(
        Number(system.combat?.reach ?? 5), Number(steedActor.system?.combat?.reach ?? 5))
      : Number(system.combat?.reach ?? 5);
    // THE DISTANCE IS NOT MEASURED FOR AN ATTACK OF OPPORTUNITY, rather
    // than this whole block being skipped. `reach` is read again much later
    // for the attack-roll modifier, so skipping it left `reach` null and
    // every AoO threw on `reach.penalty`. Found live at 3.374.0 within
    // minutes — and only because it was driven: the first version of this
    // batch's verify file ASSERTED the skip, so the harness agreed with the
    // bug and went green over it.
    //
    // Passing null is `reachPenalty`'s own documented "no distance to
    // measure" case and returns {penalty: 0, outOfReach: false}, which is
    // exactly right: the provoker WAS in reach when it triggered, and where
    // it stands now is not the fact the rule turns on.
    reach = reachPenalty(
      hasReach,
      normalReach,
      reachAlreadyEstablished ? null : distanceToTarget,
      { extension: reachExtension, noAdjacent: Boolean(weaponData.noAdjacent) }
    );
    // THE WHIP CANNOT STRIKE AN ADJACENT CREATURE (Chapter 6; 3.576.0).
    if (reach.tooClose) {
      ui.notifications.warn(
        `${weapon.name} can't be used against an adjacent creature — ${targetActor?.name ?? "the target"} is ${distanceToTarget} ft away.`
      );
      return null;
    }
    if (reach.outOfReach) {
      // A TINY OR DIMINUTIVE ATTACKER HAS REACH 0 (page 197; R12): it must
      // be inside the target's own square to strike at all, so the warning
      // says that rather than quoting a reach of 0 feet.
      const fromHere = meleeFromHere({
        attackerSize: system.identity?.size, distanceFeet: distanceToTarget });
      ui.notifications.warn(
        fromHere.mustShareSquare
          ? `${actor.name} is ${SIZE_TABLE[system.identity?.size]?.label ?? "this size"} and has no reach — `
            + `move into ${targetActor?.name ?? "the target"}'s square to attack it (page 197).`
          : `${targetActor?.name ?? "The target"} is ${distanceToTarget} ft away — beyond ${weapon.name}'s reach (max ${meleeReach} ft). It has no Thrown trait, so it can't be hurled either.`
      );
      return null;
    }
  }

  // FOR HELD PREY ONLY (3.651.0; block 18 R6, the Kraken's Bite): refused
  // unless the target is Grabbed by this attacker. See grab-gate.mjs.
  {
    const { grabbedOnlyRefusal } = await import("./grab-gate.mjs");
    const refusal = grabbedOnlyRefusal(weapon, targetActor ? {
      name: targetActor.name,
      grabbed: Boolean(targetActor.hasCondition?.("grabbed")),
      grabbedByUuid: targetActor.getFlag?.(SYSTEM_ID, "grabbedBy")?.uuid ?? ""
    } : null, { name: actor.name, uuid: actor.uuid });
    if (refusal) { ui.notifications.warn(refusal); return null; }
  }

  /*
   * UNDERWATER COMBAT (page 201; Graham's R2 of 21 September 2026).
   *
   * Read from the TOKENS, because water is a place. Both ends matter:
   * the page penalises a blow "that passes through water" and stops a
   * ranged one "if the attacker or target is underwater", so a swimmer
   * shot at from the bank is as much in the rule as one shooting from
   * the water.
   */
  const attackerUnderwater = tokenIsUnderwater(attackerToken ?? actor.getActiveTokens?.()?.[0] ?? null);
  const targetUnderwater = tokenIsUnderwater(targetToken ?? null);
  // THE TYPE AS IT WILL ARRIVE, ammunition included — a Blunt Arrow turns
  // a piercing shot into a bludgeoning one, which is the difference
  // between halved range increments and an automatic miss.
  const waterDamageType = String(
    ammoEffects.damageTypeOverride ?? weaponData.damageType ?? "").trim().toLowerCase();

  // AQUATIC AND SUBMERSIBLE (3.632.0; Fiends & Fables 3.0 block 2, ruling 6)
  // lift what they print: the melee −2, and for Submersible the fire failure.
  const waterExempt = underwaterStrikeExemption({
    aquaticAttacker: hasCreatureTrait(actor.system, "aquatic"),
    submersibleWeapon: Boolean(equippedEventRune([weapon], "submersible")),
    marauder: ownsCodexFeat(actor.items, UNDERWATER_MARAUDER)
  });

  // "Any attempt to use a fire spell underwater results in a failure.
  // Furthermore, actions with the fire trait also fail automatically."
  if (!waterExempt.fireFails && underwaterFireFails({
    underwater: attackerUnderwater, damageType: waterDamageType, traits: weaponData.traits
  })) {
    ui.notifications.warn(
      `${weapon.name} carries fire, and ${actor.name} is underwater — page 201: it fails automatically.`);
    return null;
  }

  const waterRanged = isRanged
    ? underwaterRangedOutcome({ attackerUnderwater, targetUnderwater, damageType: waterDamageType })
    : { automaticMiss: false, rangeIncrementFactor: 1, note: "" };
  if (waterRanged.automaticMiss) {
    await postCard(actor, "Underwater", [
      line(`<strong>${weapon.name} automatically misses.</strong> Page 201: `
        + `${waterRanged.note}.`)
    ]);
    return null;
  }

  /*
   * WHAT A RANGED SHOT FLIES THROUGH (3.610.0). Wall Of Wind: "ammunition
   * from physical ranged attacks … cannot pass through the wall", and a
   * thrown weapon through it takes "a -2 circumstance penalty". Storm Of
   * Vengeance's gales: "a –4 circumstance penalty to physical ranged
   * attacks". Asked of the line between the two tokens, the same question
   * the concealment check asks. See magic/wall-spell-workflow.mjs.
   */
  const weatherRows = [];
  if (positional && isRanged) {
    const { galesBetween, windBetween } = await import("../magic/wall-spell-workflow.mjs");
    const wind = windBetween(attackerToken, targetToken);
    if (wind && !thrownAttack) {
      await postCard(actor, wind, [
        line(`<strong>${weapon.name}'s shot cannot pass ${wind}</strong> — arrows, bolts and sling bullets are turned aside.`)
      ]);
      return null;
    }
    if (wind) weatherRows.push({ label: `${wind} (thrown)`, value: -2, type: "circumstance" });
    const gales = galesBetween(attackerToken, targetToken);
    if (gales) weatherRows.push({ label: `${gales} (gales)`, value: -4, type: "circumstance" });
  }

  let rangeIncrement = null;
  if (positional && isRanged) {
    // Ammunition can extend the weapon's own range increment (Distance
    // Arrows: "increase the range increment of the bow by ten feet").
    // Archer archetype (Chapter 5): "all your range increments are
    // increased by 10 feet" with bows.
    const archerRange =
      String(weaponData.group ?? "").trim().toLowerCase() === "bow" && ownsFeat("archer") ? 10 : 0;
    // Far Shot (Class, Chapter 5): "The range increment for all ranged
    // weapons is doubled" — applied after Archer's flat +10.
    const farShot = ownsFeat("far shot") ? 2 : 1;
    // A PROJECTILE'S OWN MULTIPLE (3.672.0; Arrows Flight): the round's, or
    // the thrown weapon's — see `rangeIncrementMultiplierOf`.
    rangeIncrement = (effectiveRangeIncrement(weaponData, ammoSystem, {
      multiplier: rangeIncrementMultiplierOf(weapon, ammo, Number(game.time?.worldTime ?? 0))
    }) + archerRange) * farShot;
    // "piercing ranged attacks made by an underwater creature or against
    // an underwater target have their range increments halved" (page 201).
    // Applied to the increment itself, after everything that lengthens it,
    // so every band beyond the first shortens with it.
    if (waterRanged.rangeIncrementFactor !== 1) {
      rangeIncrement = Math.max(1, Math.floor(rangeIncrement * waterRanged.rangeIncrementFactor));
    }
    // Far Throw (Chapter 5): "you increase your FIRST range increment by 10
    // feet" — the first band only, which is why it rides an option rather
    // than being added to `rangeIncrement` beside Archer's Range and Far
    // Shot. See rangeIncrementPenalty.
    const farThrow = farThrowBonus(
      Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name),
      weaponData?.traits
    );
    if (distanceToTarget !== null && rangeIncrement > 0) {
      const range = rangeIncrementPenalty(distanceToTarget, rangeIncrement, {
        firstIncrementBonus: farThrow
      });
      if (range.outOfRange) {
        ui.notifications.warn(
          `${targetActor?.name ?? "The target"} is ${distanceToTarget} ft away — beyond ${weapon.name}'s six range increments (max ${rangeIncrement * 6 + farThrow} ft).`
        );
        return null;
      }
    }
  }

  /*
   * SANCTUARY (3.598.0, Graham's R1) — ASKED BEFORE THE AP IS SPENT, and
   * honoured after it.
   *
   * The page draws a line this workflow has to respect in two places:
   *
   *   "can't attack the target and WASTES THE ACTION"     — the AP is spent
   *   "can't ATTEMPT further attacks … this turn"         — nothing is spent
   *
   * So the verdict is taken here, before the spend, and an opponent already
   * locked out leaves immediately having paid nothing. One that must save
   * rolls now; if it fails, the spend below runs as it normally would — with
   * Fight Defensively and the reaction rules intact — and the attack is
   * abandoned straight after. Spending inside the gate would have meant a
   * second copy of the rule that decides whether a Strike costs anything.
   */
  let sanctuary = { blocked: false };
  if (targetActor) {
    const { sanctuaryCheck } = await import("./sanctuary-gate.mjs");
    sanctuary = await sanctuaryCheck(actor, targetActor, `${weapon.name} attack`);
    if (sanctuary.blocked && !sanctuary.wastesAction) return null;
  }

  // Strike (Chapter 4, Basic Actions): 1 AP, only spent during active
  // combat — matches how the Basic Action itself is costed, since the
  // weapon row's Attack button is the actual, automated form of Strike.
  //
  // NOT FOR A REACTION (3.311.5). Graham, 14 Aug 2026: "Attack of
  // Opportunity ... forces the use of an AP."
  //
  // An Attack of Opportunity is a REACTION. `executeAttackOfOpportunity`
  // has always called `spendReaction` for it — and then this line charged
  // 1 AP as well, out of a pool the reactor needs on their own turn. A
  // reaction "sits outside the normal 3 AP sequence" (reactions.mjs), so
  // paying both is paying twice for one thing.
  //
  // `isReaction` already existed and was already threaded in from the AoO
  // path; it governed the multiple-attack penalty, the attack counter,
  // Focused Strike and whether the strike provokes further. It simply did
  // not reach the one line that spends the resource.
  // FIGHT DEFENSIVELY BOUGHT THIS STRIKE (Chapter 4). Its 2 AP entry says
  // "take a single attack action", so the first Strike inside the stance
  // is already paid for. Counted rather than merely allowed: a SECOND
  // Strike in the same stance pays its own way.
  // OFF ITS MAKER'S TURN (3.646.0; Graham, 15 October 2026): an Attack of
  // Opportunity and a readied Strike spend a reaction through their own
  // doors; "any other weapon swing made outside of a turn should be free but
  // prompt a GM authorisation". Asked here — after every refusal the weapon
  // itself can make, before anything is spent — and the swing happens only
  // on the GM's yes.
  const offTurn = strikeIsOffTurn(actor);
  const offTurnFree = offTurn && !isReaction && !apPaid;
  if (offTurnFree) {
    const { requestGMAuthorisation } = await import("./gm-authorisation.mjs");
    const what = `a Strike with ${weapon.name}${targetActor ? ` against ${targetActor.name}` : ""}`;
    if (!(await requestGMAuthorisation(actor, what))) return null;
  }
  const fightDefensivelyPays = fightDefensivelyCoversAttack(
    isFightingDefensively(actor),
    Number(actor?.getFlag?.(SYSTEM_ID, FIGHT_DEFENSIVELY_ATTACK_FLAG) ?? 0)
  ) && !isReaction && !apPaid && !offTurnFree;

  if (fightDefensivelyPays) {
    await actor.setFlag(
      SYSTEM_ID, FIGHT_DEFENSIVELY_ATTACK_FLAG,
      Number(actor.getFlag(SYSTEM_ID, FIGHT_DEFENSIVELY_ATTACK_FLAG) ?? 0) + 1
    );
  } else if (!isReaction && !apPaid && !offTurnFree) {
    await spendActionPoints(actor, "1", `${weapon.name} — Strike`, { use: "strike" });
  }
  await recordTraitUsage(actor, strikeTraits);

  // AND THE ACTION IS NOW WASTED. The spend above has run, so a failed
  // Sanctuary save costs exactly what the page says it costs.
  if (sanctuary.blocked) return null;

  /*
   * A STRIKE IS A HOSTILE ACTION, so the ATTACKER'S OWN Sanctuary ends here
   * — "If the target uses a hostile action, the spell ends."
   *
   * WIRED HERE AND NOT ONLY AT THE ACTION COMMIT POINTS. A Strike does not
   * pass through `resolveAction`, so the three places that already end
   * things on an offensive action never see the most obvious hostile act in
   * the game. A ward wired only there would have let a warded fighter swing
   * all day with the spell still up.
   */
  {
    const { endSanctuaryOnHostileAction } = await import("./sanctuary-gate.mjs");
    await endSanctuaryOnHostileAction(actor);
    // AND THE TARGET'S FIXATION (3.621.0): Fixated "ceases to exist if you
    // or any of your allies are subjected to hostile actions".
    if (targetActor) await endFixationOnHostileAct([targetActor], actor);
  }

  /*
   * THE DEFENDER'S REACTION, DECLARED BEFORE THE ROLL (3.666.1). Graham,
   * 22 October 2026: "Nimble Dodge still isn't giving any option for the
   * player to use." The defender's player is asked here, after the strike is
   * committed and before anything about it is rolled or read; a yes runs the
   * reaction on their own client and the DB read below includes it. Nothing
   * to offer asks nobody. See combat/defence-offer.mjs.
   */
  /*
   * AN ALLY STEPS IN (3.669.0; Inner Tempest's Guardian's Intercession: "an
   * adjacent ally is targeted by a physical attack … You Step into a position
   * adjacent to the ally if necessary and interpose yourself … You become
   * the target of the triggering attack instead"). Asked of the allies beside
   * the target HERE, once the Strike is committed — its reach, range, the
   * GM's leave and the AP all settled against the creature it was aimed at —
   * so a reaction is never spent on a Strike that then refuses (found in
   * review). The one who steps in takes the target's place, so the distance
   * already measured stands. A Strike a technique makes against a creature
   * it has already chosen (a reaction, a pair's second swing, Flow Strike)
   * does not ask again.
   */
  if (targetToken && targetActor && !isReaction && !skipTargetPrompt) {
    const { offerIntercepts } = await import("./defence-offer-workflow.mjs");
    const interceptor = await offerIntercepts(actor, targetToken, attackerToken ?? null, { kind: "weapon", what: weapon.name });
    if (interceptor?.actor) {
      interceptNote = `<em>${interceptor.actor.name} steps in: the attack meant for ${targetActor.name} targets ${interceptor.actor.name} instead.</em>`;
      targetToken = interceptor;
      targetActor = interceptor.actor;
      try { targetToken.setTarget?.(true, { user: game.user, releaseOthers: true }); } catch { /* the attack goes on regardless */ }
    }
  }

  if (targetActor && !noReactions) {
    const { offerDefences } = await import("./defence-offer-workflow.mjs");
    await offerDefences(actor, targetActor, { kind: "weapon", what: weapon.name });
  }

  // Hidden/Concealed miss chance (Appendix 2): checked before anything
  // else, since a successful check means the attack never affects the
  // target at all — "the attack, spell, or effect doesn't affect you."
  // Doesn't apply to area effects, which this (single-target) workflow
  // never produces anyway.
  /*
   * AN EDGE THAT SEES THROUGH IT (3.609.0, block 33's R7). True Strike and
   * True Target: "ignores … the concealed or hidden conditions". Read off
   * the same effect as the advantage, so both are spent together. See
   * magic/strike-edge.mjs.
   */
  const { strikeEdgeFrom } = await import("../magic/strike-edge.mjs");
  const strikeEdge = strikeEdgeFrom(Array.from(actor.appliedEffects ?? actor.effects ?? []), targetActor?.uuid ?? "", SYSTEM_ID);
  if (targetActor && !strikeEdge?.ignoreConcealment) {
    const { missChanceAvoidance } = await import("./targeting.mjs");
    // ARROW CATCHING GIVES UP CONCEALMENT TO MISSILES (3.616.0, B3 of block
    // 36): "those attacking the wearer with ranged weapons ignore any
    // bonuses for the concealed condition". Concealed only — hidden and
    // invisible keep their checks.
    const { ignoresConcealmentOf } = await import("../arrow-catching.mjs");
    const avoidance = await missChanceAvoidance(targetActor, {
      attackerName: actor.name,
      sourceName: `${weapon.name} attack`,
      attackerActor: actor,
      ignoreConcealed: ignoresConcealmentOf(runeBonusesForActor(Array.from(targetActor.items ?? [])), { ranged: isRanged })
    });
    if (avoidance.avoided) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${weapon.name} — Attack</h3></div></header><p style="margin:2px 0"><strong>The attack doesn't affect ${targetActor.name}.</strong> ${targetActor.name} was ${avoidance.condition} and passed the DC ${avoidance.dc} avoidance flat check.</p></div>`
      });
      return null;
    }
  }

  // Proficiency (Chapter 6): -4 when you are not proficient with the
  // weapon in your hand.
  //
  // Until 3.215.0 this line tested the weapon item's own `proficiency`
  // field against the string "none" — a field every one of the 76
  // weapons in the pack shipped empty, so the test was true for
  // everybody, always, and the -4 could not fire. It was also asking the item what the CHARACTER can use, which
  // an item cannot know: the same greatsword is a Fighter's weapon and a
  // Wizard's mistake.
  //
  // proficiencyProfile gathers the class's list, the proficiency feats,
  // a Weapon Proficient choice effect, a heritage's whole-group grant
  // (Morgar: "always considered to be trained when using ... the axe and
  // hammer weapon groups") and a deific aspect's favoured weapon, and
  // answers the question once.
  const profile = proficiencyProfile(actor);
  const proficiency = proficiencyOf(profile, {
    type: "weapon",
    name: weapon.name,
    // The flags, for a charged item's weapon form (3.616.1, R2).
    flags: weapon.flags,
    // weaponData, not weapon.system: a thrown or superior-quality weapon
    // reaches here with its traits and group already resolved.
    system: weaponData
  });
  const proficient = proficiency.proficient;
  // DOUBLE IS NOT AGILE (3.575.0). "A double weapon may be used to double
  // slice and always treats the second attack as agile" — the second
  // attack OF THE DOUBLE SLICE, Graham 19 Sep 2026. This read `double` as
  // `agile`, so a staff's third swing in a turn took -8 instead of -10 and
  // Double Slice itself could not use the trait at all. The trait now
  // lives in double-slice.mjs and nowhere near the MAP.
  const agile = /\bagile\b/i.test(String(weaponData.traits ?? ""));
  // Improved Critical (Class, Chapter 5): attacks with a recorded Weapon
  // Focus group gain the Keen trait (no effect if the weapon is already
  // Keen — a single flag either way).
  const improvedCriticalGroups = Array.from(actor.appliedEffects ?? actor.effects ?? [])
    .filter((e) => !e.disabled)
    .map((e) => String(e.getFlag?.(SYSTEM_ID, "improvedCriticalGroup") ?? "").trim().toLowerCase())
    .filter(Boolean);
  // THE MATERIAL'S OWN KEEN (3.573.0). Densewood, Eaog and Mithril each
  // print "weapons gain the Keen trait", and customisation never writes
  // to `system.traits` — it writes the material key and leaves the trait
  // string alone. So this regex, the only reader Keen had, could never
  // see it, and the `grantedTraits` the material layer has always
  // computed went nowhere. Found in the pages 141-150 audit.
  // KEEN EDGE'S SPELL-GRANTED KEEN (3.590.0). A fourth source, added to
  // this test rather than beside it, for the reason 3.573.0 records one
  // line above: `keen` is the single thing every critical-severity rule
  // consults, and a second answer to "is this blow keen" would be a
  // second thing to keep in step. See magic/weapon-trait.mjs.
  const keen = /\bkeen\b/i.test(String(weaponData.traits ?? "")) ||
    materialGrantedWeaponTraits(weaponData).includes("keen") ||
    weaponHasSpellTrait(actor.appliedEffects ?? actor.effects ?? [], weapon?.id ?? "", "keen") ||
    improvedCriticalGroups.includes(String(weaponData.group ?? "").trim().toLowerCase());
  const weaponIsDeadly = /\bdeadly\b/i.test(String(weaponData.traits ?? ""));
  /*
   * THE ASSASSIN'S MARK GRANTS DEADLY (3.586.3).
   *
   * "Agile, finesse, unarmed and first-increment ranged attacks against
   * it gain the Deadly trait (already-Deadly weapons: +1 damage)."
   *
   * WIDENING THE EXISTING TEST rather than adding a channel, which is
   * how Keen's material grant was fixed at 3.573.0: `deadly` is the one
   * thing every critical-severity rule reads, so a second answer to "is
   * this blow deadly" would be a second thing to keep in step.
   *
   * THE FIRST-INCREMENT TEST NEEDS A MEASURED DISTANCE. With no token
   * and no measurement `distanceToTarget` is null, and the rule answers
   * false rather than true — a rider that fires when nothing can be
   * measured is a rider that fires always. See combat/death-mark.mjs.
   */
  const mark = deathMarkDeadly(
    deathMarkQualifies({
      markedUuid: markedUuidOf(actor.appliedEffects ?? actor.effects ?? []),
      targetUuid: targetActor?.uuid ?? "",
      agile,
      finesse: !isRanged && /\bfinesse\b/i.test(String(weaponData.traits ?? "")),
      unarmed: isUnarmedAttack(abilityData),
      isRanged,
      withinFirstIncrement: Number.isFinite(Number(distanceToTarget))
        && Number(rangeIncrement) > 0
        && Number(distanceToTarget) <= Number(rangeIncrement)
    }),
    weaponIsDeadly
  );
  const deadly = weaponIsDeadly || mark.grantsDeadly;
  // RAZOR (Chapter 11): "any attacks made with the weapon inflict a
  // critical if the AV is 3+ instead of the usual 4+ for a Keen weapon."
  // Keen already adds 1 to the AV for critical purposes; Razor adds
  // another, which is the same thing said the other way round.
  // Every rune on the weapon being swung, resolved once: Razor's
  // critical AV here, Ancient Echoes' luck bonus below.
  const weaponRunes = runeBonusesFor(weapon);
  const razorAV = weaponRunes.criticalAV;
  // Attack mode (attackerToken/positional/distanceToTarget/isRanged/
  // hasReach/etc.) was resolved above, before AP was spent, so the reach
  // and range-increment checks could run before the Strike was paid for.
  // Exotic (Chapter 6): the -4 non-proficiency penalty already
  // matches Exotic's own stated penalty exactly (handled generically
  // below via the proficient flag); this trait's only additional
  // effect — "it gains the Clumsy trait" — only applies when untrained.
  //
  // "Untrained" is asked of the weapon's category FOR THIS WIELDER
  // (3.575.0): a dwarf's zokarrin is a martial weapon to them, so a dwarf
  // without martial proficiency takes the -4 of an untrained martial
  // weapon and not the exotic weapon's Clumsy.
  const clumsy =
    /\bclumsy\b/i.test(String(weaponData.traits ?? "")) ||
    (!proficient && String(effectiveWeaponCategory(profile, { system: weaponData })).toLowerCase() === "exotic");

  // Hunt Prey (Ranger, 1st): is the current target the designated prey?
  // Token identity first — two goblins share one actor and only one of
  // them is the prey — with the actor id as fallback. Resolved once,
  // read by the attack bonus, Relentless Hunter's MAP relief and
  // Precision Hunter's dice below.
  const targetIsPrey = Boolean(targetToken) && isHuntedPrey(actor, {
    tokenId: targetToken?.id ?? "",
    actorId: targetActor?.id ?? ""
  });

  // MAP from this turn's attack count, tracked on the actor. An Attack of
  // Opportunity is exempt (Chapter 4): it neither suffers MAP nor advances
  // the counter for the turn's own attacks.
  // SHARED WITH A MOUNT (page 200; R13): "both you and your mount are
  // subject to the same multiple attack penalty." `sharedMapCount` is the
  // higher of the pair's two counters, and the actor's own when it is
  // riding nothing.
  const attackIndex = await sharedMapCount(actor);
  // OFF ITS OWN TURN, A STRIKE CARRIES NO MULTIPLE ATTACK PENALTY (3.645.0,
  // F4 of Graham's 14 October session). The penalty counts the attacks made
  // during your turn; the counter is only cleared when your next turn
  // starts, so a strike made between — an Attack of Opportunity rolled from
  // the weapon row, a readied Strike — read last turn's count. Throngar's
  // opportunity swing took −10 as "attack 5". Nor does such a strike add to
  // the count. (`offTurn` is read above, where the GM is asked.)
  // ownsFeat was declared above, before AP was spent (the range-increment
  // check needs it too).
  // Agile Strikes (Class, Chapter 5): the agile MAP ladder tightens to -3/-6.
  const baseMap = (isReaction || offTurn) ? 0
    : Number.isFinite(Number(mapOverride)) && mapOverride !== null ? Number(mapOverride)
      : mapPenalty(attackIndex, agile, agile && ownsFeat("agile strikes"));
  // Relentless Hunter (Ranger, Hunter's Method): "your multiple attack
  // penalty against your hunted prey is reduced by 1" (2 at 11th) —
  // relief clamped to the penalty actually being paid, so it can never
  // turn a penalty into a bonus.
  const relentlessRelief = baseMap
    ? Math.min(
        relentlessHunterReduction({
          actor,
          level: Number(system.identity?.level ?? 0),
          targetIsPrey
        }),
        -baseMap
      )
    : 0;
  const map = baseMap + relentlessRelief;

  // Power Attack (Class, Chapter 5): queued one-shot via the feat's Use —
  // this melee Strike deals +2d8 (3d8 at BAB +12, 4d8 at +18) and counts
  // as TWO attacks for MAP; Furious Focus reduces that back to one.
  const powerAttack = Boolean(actor.getFlag(SYSTEM_ID, "powerAttackQueued"));
  if (powerAttack) await actor.unsetFlag(SYSTEM_ID, "powerAttackQueued");

  const modifiers = [
    ...(Array.isArray(extraModifiers) ? extraModifiers : []),
    ...weatherRows,
    // READ NOW, NOT FROM THE COPY TAKEN AT THE TOP (3.609.2, G1 of the
    // 3.609.1 drive). The ward gate above can change the attacker — Visage
    // Of Horror's Failure makes it frightened 2 "before using its action" —
    // and `system` is the data as it stood before the gate, so the attack
    // it gated rolled without the −2.
    ...(actor.system.combat?.attack?.checkModifiers ?? [
      {
        label: "Attack bonus",
        value: Number(actor.system.combat?.attack?.total ?? 0),
        type: "untyped"
      }
    ])
  ];

  // CRIMSON COVENANT (3.632.0; Fiends & Fables 3.0 block 2, ruling 2): armed
  // by a bleed result of 5+, spent by this attack — see codex-feat-rules.mjs.
  {
    const covenant = crimsonCovenantAtAttack(actor.getFlag?.(SYSTEM_ID, CRIMSON_COVENANT_FLAG));
    if (covenant.modifier) modifiers.push(covenant.modifier);
    if (covenant.next === "live") await actor.setFlag(SYSTEM_ID, CRIMSON_COVENANT_FLAG, { state: "live" });
    else if (covenant.next === null) await actor.unsetFlag(SYSTEM_ID, CRIMSON_COVENANT_FLAG);
  }
  // HOWLING KINSHIP (3.632.0, ruling 3): master and animal companion within
  // 10 ft of each other, the master owning the feat.
  {
    const kinship = howlingKinshipFor(actor);
    if (kinship) modifiers.push(kinship);
  }

  // UNDERWATER MELEE (page 201, R2): "a -2 circumstance penalty to melee
  // slashing or bludgeoning attacks that pass-through water". Piercing is
  // exempt, which is the point of the sentence naming two types of three.
  const waterMelee = isRanged || waterExempt.meleePenalty ? 0 : underwaterMeleePenalty({
    attackerUnderwater, targetUnderwater, damageType: waterDamageType
  });
  if (waterMelee) {
    modifiers.push({ label: "Through water", value: waterMelee, type: "circumstance" });
  }

  // MOUNTED AGAINST THE UNMOUNTED (page 200; R13): "you gain a
  // +2-circumstance bonus to all attack checks against unmounted targets
  // whilst mounted." Against another rider it does not apply.
  const mountedBonus = mountedAttackBonus(
    riderState.mounted, Boolean(targetActor && mountedState(targetActor).mounted));
  if (mountedBonus) {
    modifiers.push({
      label: `Mounted${steedActor ? ` on ${steedActor.name}` : ""}`,
      value: mountedBonus,
      type: "circumstance"
    });
  }
  // BRACE (3.668.1; Inner Tempest, Chapter 6): "If you use a Ready action to
  // attack a mounted target with this weapon, your attack gains a
  // +2-circumstance bonus and inflicts an additional die of base damage on a
  // successful hit." The die is added where the damage is rolled.
  const brace = braceApplies({
    weaponSystem: weaponData, readied: Boolean(readied),
    targetMounted: Boolean(targetActor && mountedState(targetActor).mounted)
  });
  if (brace) {
    modifiers.push({ label: "Brace (readied, against a mounted target)", value: brace.attackBonus, type: "circumstance" });
  }

  const finesseBonus = finesseAdjustment(
    finesse,
    Number(system.combat?.attack?.ability ?? 0),
    Number(system.attributes?.dexterity?.total ?? 0)
  );
  if (finesseBonus) {
    modifiers.push({ label: "Finesse (Dexterity)", value: finesseBonus, type: "untyped" });
  }

  /*
   * AND DEXTERITY FOR A RANGED ATTACK ROLL (3.489.0).
   *
   * Sits beside Finesse because it is the same swap made for the other
   * half of the rule — and the two can never both fire, since `finesse`
   * is computed as `!isRanged && …` twenty lines up.
   *
   * PUSHED EVEN WHEN NEGATIVE, unlike Finesse. A Strength-built
   * character firing a bow is genuinely worse at it, and the card must
   * say so rather than quietly keeping the better number: a penalty the
   * player cannot see is how the wrong ability survived here in the first
   * place. See `rangedAbilityAdjustment` in attack.mjs for the ruling.
   */
  const rangedAbilityBonus = rangedAbilityAdjustment(
    isRanged,
    Number(system.combat?.attack?.ability ?? 0),
    Number(system.attributes?.dexterity?.total ?? 0)
  );
  if (rangedAbilityBonus) {
    modifiers.push({
      label: `Ranged (Dexterity)${rangedAbilityBonus < 0 ? " — replaces Strength" : ""}`,
      value: rangedAbilityBonus,
      type: "untyped"
    });
  }

  const sweepTargets = actor.getFlag(SYSTEM_ID, "sweepTargets")?.[weapon.id] ?? [];
  if (sweepApplies(sweep, sweepTargets, targetToken?.id ?? null)) {
    modifiers.push({ label: "Sweep (different target this turn)", value: 1, type: "circumstance" });
  }

  const weaponBonus = Number(weaponData.attackBonus ?? 0);
  if (weaponBonus) {
    modifiers.push({ label: weapon.name, value: weaponBonus, type: "item" });
  }

  // AND WHAT THE ROUND ITSELF ADDS (3.513.0). Pushed beside the weapon's
  // own bonus and carrying the same `item` type on purpose: a +1 Magic
  // Stone fired from a +2 sling is +2, because that is what typed
  // stacking does with two item bonuses on one roll. Every one of the
  // nine authored rounds declares nothing here and gets no row.
  const ammoAttack = ammunitionAttackModifier(ammoSystem, ammo?.name);
  if (ammoAttack) modifiers.push(ammoAttack);
  // AN UNGUENT'S ITEM BONUS (3.617.0, C1 of block 37; Graham's R3): Unguent
  // of Sharpness on the weapon or on the fired pieces. An `item` row, so the
  // stacking keeps the higher of it and the weapon's own.
  {
    const coatNow = { worldTime: Number(game.time?.worldTime ?? 0), combatId: game.combat?.id ?? null, round: game.combat ? Number(game.combat.round ?? 0) : null };
    for (const coated of [ammo, weapon]) {
      const row = riderAttackRow(oilCoatOf(coated), coatNow);
      if (row) modifiers.push(row);
    }
  }
  // A FOUND ROCK (3.576.0): "A sling can be used to throw found rocks at a
  // -2-attack bonus." Chosen with the ammunition, untyped as printed.
  if (ammoChoice.found) {
    modifiers.push({ label: "Found rock", value: ammoChoice.found.penalty, type: "untyped" });
  }
  // AN IMPROVISED ATTACK (3.576.0): "-4-circumstance penalty to the
  // attack", or what the item declares — the pole's -2, Graham's ruling.
  const improvisedRow = improvisedAttackModifier(weaponData, weapon.name);
  if (improvisedRow) modifiers.push(improvisedRow);

  // ANCIENT ECHOES (Creature Codex, Chapter 3): "all attacks made with
  // this weapon gain a +1-luck bonus to attack and damage."
  //
  // Typed, and the type is not decoration: a luck bonus does not stack
  // with another luck bonus, so it enters the pool AS LUCK rather than
  // being folded into the weapon's item bonus above — where it would
  // have stacked with everything, including itself.
  //
  // The WEAPON's runes, not the actor's gathered ones: the rune says
  // "this weapon", and the actor-wide gather deliberately does not carry
  // it (see rune-effects.mjs).
  if (weaponRunes.strikeAttack) {
    modifiers.push({
      label: `${weapon.name} (Ancient Echoes)`,
      value: weaponRunes.strikeAttack,
      type: weaponRunes.strikeType || "luck"
    });
  }

  // Racial attack abilities (Chapter 2): the Orc's Ferocious on melee
  // attacks, the Halfling's Sure Shot with bows and slings. Unlike the
  // scoped racial bonuses that go through the check dialog's tickboxes,
  // these need no judgement — the weapon itself says whether they apply
  // — so they are simply added, under their own name.
  for (const bonus of racialAttackBonuses(
    Array.from(actor.items ?? [])
      .filter((i) => ["feat", "ability"].includes(i.type))
      .map((i) => i.name),
    { attackMode: weaponData.attackMode, group: weaponData.group }
  )) {
    modifiers.push(bonus);
  }

  // Weapon-group focus (Chapter 5): "+1 class bonus on attack rolls made
  // with the chosen weapon group" — each carrying effect (Weapon Focus's
  // recorded choice, the Archer archetype's transferred Bow effect) adds
  // its own +1 under its own name; class bonuses stack, so Weapon Focus
  // (Bow) + Archer legitimately reach +2.
  // appliedEffects, not actor.effects: Weapon Focus's choice effects live
  // on the actor, but the Archer archetype's Bow effect is TRANSFERRED
  // from the compendium item — V12+ keeps those on the item (found live,
  // 3.185.1), and appliedEffects is the one collection holding both.
  const thisGroup = String(weaponData.group ?? "").trim().toLowerCase();
  for (const effect of Array.from(actor.appliedEffects ?? actor.effects ?? [])) {
    if (effect.disabled) continue;
    const group = String(effect.getFlag?.(SYSTEM_ID, "weaponFocusGroup") ?? "").trim().toLowerCase();
    if (group && group === thisGroup) {
      modifiers.push({ label: effect.name, value: 1, type: "class" });
    }
  }

  // Deific Aspect, the other half: "you gain a +1-class bonus to all
  // attacks made with this weapon." One per aspect naming it — class
  // bonuses stack across sources, so this rides on top of a Weapon Focus
  // for the same weapon's group rather than being folded into it.
  for (const bonus of favouredWeaponAttackModifiers(aspectsOf(actor), weapon.name, weapon.system?.group)) {
    modifiers.push(bonus);
  }

  // Weapon Exemplar (Fighter, 4th): "+1-class bonus on attack rolls and
  // damage rolls" with a chosen weapon group, the earliest pick carrying
  // the largest bonus as the tiers arrive (8th, 12th, 16th, 20th). The
  // damage half is in resolveWeaponDamage. A class bonus under its own
  // name, stacking with Weapon Focus exactly as the aspects above do.
  const actorLevel = Number(system.identity?.level ?? 0);
  const exemplarPicks = weaponExemplarPicks(actor);
  const exemplarBonus = weaponExemplarBonusFor(
    exemplarPicks, weaponExemplarTierCount(actorLevel), weaponData.group
  );
  if (exemplarBonus) {
    modifiers.push({
      label: `Weapon Exemplar (${weaponData.group})`,
      value: exemplarBonus,
      type: "class"
    });
  }

  // The second half of Surprise Attack. Being flat-footed costs a
  // creature its Dexterity in Defence, and `defence.ability` holds
  // exactly that contribution — already ZERO on a creature that really
  // is flat-footed, so a target who has not yet acted contributes
  // nothing here and cannot be counted twice.
  //
  // Applied to the attack rather than to the target's Defence, because
  // the target's Defence is theirs and applies against everyone; this
  // only applies against the character who bought the feat.
  if (targetActor) {
    const surpriseBonus = surpriseAttackDefenceBonus(
      targetActor.system?.combat?.defence?.ability, surpriseAttackOn
    );
    if (surpriseBonus > 0) {
      modifiers.push({
        label: `Surprise Attack (${targetActor.name} is flat-footed to you)`,
        value: surpriseBonus,
        type: "circumstance"
      });
    }
  }

  // THE TARGET'S CONDITIONS, AND THE ATTACKER'S (3.621.0; Appendix 2, block
  // 39's R7): advantage against a creature that cannot move, Prone's +4
  // within 5 ft and −4 beyond, and "a creature you're hidden from is
  // flat-footed to you" — paid, as Surprise Attack is, as a bonus on this
  // attack only. Surprise Attack's own bonus already paid the Dexterity, so
  // the hidden attacker's is not added on top of it.
  const conditionTerms = targetActor
    ? attackTermsAgainst(targetActor, actor, { distanceFeet: distanceToTarget, melee: !isRanged })
    : null;
  for (const row of conditionTerms?.rows ?? []) {
    if (surpriseAttackOn && /flat-footed to you/.test(row.label)) continue;
    modifiers.push(row);
  }
  if (conditionTerms?.advantage) {
    modifiers.push({ label: `Advantage — ${conditionTerms.advantage}`, value: 0, type: "untyped" });
  }
  // A REACTION STRIKE AGAINST A CREATURE THAT PUNISHES THEM (3.668.0;
  // Flickering Flame's "-5 penalty to hit you with reaction attacks").
  if (isReaction && targetActor) {
    const { reactionAttackPenaltyRows } = await import("./strike-options.mjs");
    modifiers.push(...reactionAttackPenaltyRows([...Array.from(targetActor.items ?? []), ...Array.from(targetActor.appliedEffects ?? targetActor.effects ?? [])]));
  }
  // TREATED AS FLAT-FOOTED (3.668.0; Formless Cut): paid as "flat-footed to
  // you" is, as a bonus on this Strike, unless it is flat-footed already.
  if (treatAsFlatFooted && targetActor) {
    const { flatFootedLoss, treatedFlatFootedRow } = await import("./strike-options.mjs");
    const row = treatedFlatFootedRow({
      alreadyFlatFooted: Boolean(targetActor.hasCondition?.("flatFooted")) || Boolean(conditionTerms?.flatFootedBy) || surpriseAttackOn,
      loses: flatFootedLoss(targetActor.system?.combat?.defence),
      targetName: targetActor.name,
      label: optionLabel || "this Strike"
    });
    if (row) modifiers.push(row);
  }

  // Hunt Prey (Ranger, 1st): "You may add your class bonus to all
  // checks made against your prey." The attack roll against the
  // designated prey is the automatic case; every other check goes
  // through the check dialog's prey tickbox instead. A class bonus
  // under its own name, stacking exactly as Weapon Focus and a
  // favoured weapon already do.
  const preyBonus = huntPreyBonus({
    actor,
    classBonus: Number(system.identity?.classBonus ?? 0),
    targetIsPrey
  });
  if (preyBonus) {
    modifiers.push({ label: "Hunt Prey", value: preyBonus, type: "class" });
  }

  // AN OPPOSED-AURA AURA (3.446.0). Wellspring Of Valour grants allies
  // inside it "+1 status bonus to attack rolls vs any creatures of an
  // opposed aura" — a bonus that lives on the attacker and applies only
  // against some targets, which is exactly Hunt Prey's shape and is why
  // it sits here rather than on the sheet total.
  //
  // THE TARGET DECIDES. A creature carrying no aligned trait is opposed
  // to nobody, so most attacks see nothing — and a Balance-aligned caster
  // grants a record whose `opposedTo` is empty, which can never match.
  // Both are deliberate; see magic/opposed-aura.mjs.
  const auraAttack = targetActor
    ? opposedAuraAttackBonus(
      Array.from(actor.appliedEffects ?? actor.effects ?? [])
        .filter((e) => !e.disabled)
        .flatMap((e) => {
          const held = e.getFlag?.("trg-prime", OPPOSED_AURA_FLAG);
          return Array.isArray(held) ? held : [];
        }),
      targetActor.system ?? {}
    )
    : null;
  if (auraAttack) modifiers.push(auraAttack);

  // Preying Companion (Companion feat): "Your companion gains any
  // bonuses granted by the hunt prey class ability when you use it."
  // The gate is the MASTER's — a companion never has Hunt Prey itself,
  // which is why `huntPreyBonus` above returns nothing for it — and the
  // designation is the master's flag, read from the master's document.
  if (isCompanion(actor)) {
    const master = masterIdOf(actor) ? (game.actors?.get(masterIdOf(actor)) ?? null) : null;
    const inherited = master ? preyingCompanionModifier({
      companionFeatNames: Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat").map((i) => i.name),
      masterHasHuntPrey: hasHuntPrey(master),
      targetIsPrey: Boolean(targetToken) && isHuntedPrey(master, {
        tokenId: targetToken?.id ?? "",
        actorId: targetActor?.id ?? ""
      }),
      // A companion's level is its master's, and the class bonus is a
      // function of level alone, so "your class bonus" is the same
      // number read from either sheet. Read from the companion's, since
      // that is the sheet this roll belongs to.
      classBonus: Number(system.identity?.classBonus ?? 0)
    }) : null;
    if (inherited) modifiers.push(inherited);
  }

  // Wild Shape (Druid, 3rd): "+1-class bonus to all attacks made using
  // natural weapons when using this ability or any form spell." Gated
  // on the weapon's own `natural` flag (excluding the baseline Unarmed
  // Strike every character carries) rather than on tracking whether a
  // shapeshift is currently active — see wildShapeAttackBonus's own
  // comment for why the weapon's presence already answers that.
  const wildShapeBonus = wildShapeAttackBonus({
    actor,
    weaponName: weapon.name,
    weaponNatural: Boolean(weaponData.natural),
    shapeWeapon: Boolean(weapon.flags?.["trg-prime"]?.shapeWeapon)
  });
  if (wildShapeBonus) {
    modifiers.push({ label: "Wild Shape (natural weapon)", value: wildShapeBonus, type: "class" });
  }

  // Ferocious Shape (Chapter 5, Druid): "+2-circumstance bonus to all
  // natural attacks… when using your Wildshape ability."
  //
  // A SECOND MODIFIER, NOT A BIGGER ONE. Wild Shape's bonus above is a
  // CLASS bonus and this is a CIRCUMSTANCE bonus; two types stack where
  // two of a kind do not, so folding 2 into `wildShapeBonus` would have
  // quietly turned what should be +3 into +2 for every Druid who took
  // this feat — and the card would have shown one honest-looking line.
  const ferociousBonus = ferociousAttackBonus({
    featNames: Array.from(actor.items ?? [])
      .filter((i) => i.type === "feat").map((i) => i.name),
    inForm: inFormNow({
      effects: Array.from(actor.effects ?? []),
      items: Array.from(actor.items ?? [])
    }),
    weaponName: weapon.name,
    weaponNatural: Boolean(weaponData.natural)
  });
  if (ferociousBonus) {
    modifiers.push({ ...FEROCIOUS_MODIFIER, value: ferociousBonus });
  }

  // Vanguard archetype (Chapter 5): "+1 class bonus to all attack rolls
  // using two-handed melee weapons" — two-handedness derived exactly as
  // the hand-budget logic does (size step or the Two-Handed trait).
  if (!isRanged && itemRequiredHands(weapon, system.identity?.size ?? "medium") === 2 &&
    Array.from(actor.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "vanguard"
    )) {
    modifiers.push({ label: "Vanguard (two-handed)", value: 1, type: "class" });
  }

  // Throw Anything (Chapter 5): "+1 circumstance bonus to attack with any
  // thrown weapon" (the no-improvised-penalty half is a note — improvised
  // weapons aren't modelled as a penalty here).
  if (thrownAttack && Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "throw anything"
  )) {
    modifiers.push({ label: "Throw Anything", value: 1, type: "circumstance" });
  }
  if (map) {
    modifiers.push({
      // A penalty SET by the caller (Flow Strike's "as if it was your third
      // strike") is not the count's: name what set it, not attack N (3.668.1).
      label: `Multiple Attack Penalty (${mapSetBy({ mapOverride, optionLabel, attackIndex })}${relentlessRelief ? `, Relentless Hunter +${relentlessRelief}` : ""})`,
      value: map,
      type: "untyped"
    });
  }
  // WORD (Appendix 3): "After using a spell with this trait, all further
  // spell and attack checks made during your turn suffer a -4 penalty."
  const wordPenalty = wordAftermathModifier(actor);
  if (wordPenalty) modifiers.push(wordPenalty);
  if (!proficient) {
    // The reason travels with the penalty. "A -4 appeared on a roll with
    // nothing on the character to explain it" is the complaint that
    // started this work, and a label of "Non-proficient" on its own does
    // not answer it.
    modifiers.push({
      label: `Non-proficient — ${proficiency.why}`,
      value: -4,
      type: "untyped"
    });
  }

  // Positional modifiers: range increments and melee engagement for ranged
  // attacks, flanking for melee attacks. Silently skipped (not just left at
  // zero) when either token isn't placed on the current scene, so the
  // workflow degrades to manual play rather than reporting false zeros.
  // attackerToken / positional / distanceToTarget were computed up front for
  // the throw-vs-melee decision.
  let strayCandidates = [];
  // Page 199's line-of-sight requirement, held for the card (3.579.0).
  let lineOfSightNote = null;
  let coverBonus = 0;
  let rangedDistance = null;

  if (positional && isRanged) {
    const distance = distanceToTarget;
    rangedDistance = distance;
    // archerRange/farShot/rangeIncrement were resolved above, before AP was
    // spent, so the out-of-range check could run before the Strike was paid
    // for. Recomputing the penalty here (rather than threading the whole
    // result through) costs nothing — rangeIncrementPenalty is pure and
    // distance/rangeIncrement are unchanged since then.
    const increment = rangeIncrement;

    if (distance !== null && increment > 0) {
      const range = rangeIncrementPenalty(distance, increment);
      if (range.penalty) {
        modifiers.push({
          label: `Range increment ${range.increments} (${distance} ft)`,
          value: range.penalty,
          type: "untyped"
        });
      }
    }

    // Powerful (Chapter 6): "gains a bonus to AB when fired at a
    // target within 20 feet." Volley: "less effective at close
    // distances... within 20 feet take a -2 circumstance penalty."
    if (distance !== null && distance <= 20) {
      const powerfulBonus = extractTraitValue(weaponData.traits, "powerful");
      if (powerfulBonus) {
        // CIRCUMSTANCE (3.576.0; Graham, 19 Sep 2026). The trait prints no
        // type; the Heavy Crossbow's description does — "a significant +4
        // circumstance bonus when targeting foes within 20 feet" — and the
        // ruling applies it to every Powerful weapon.
        modifiers.push({ label: "Powerful (within 20 ft)", value: powerfulBonus, type: "circumstance" });
      }
      // Point Blank Shot (Class, Chapter 5): "You ignore the volley
      // trait" — and non-volley weapons gain +1 circumstance to attack
      // (and damage, applied in the damage formula) within the first
      // range increment.
      const hasVolley = /\bvolley\b/i.test(String(weaponData.traits ?? ""));
      const pointBlank = ownsFeat("point blank shot");
      if (hasVolley && !pointBlank) {
        // CIRCUMSTANCE, as printed: "take a –2 circumstance penalty"
        // (3.575.0). It was untyped, so it stacked with other
        // circumstance penalties it should have overlapped.
        modifiers.push({ label: "Volley (within 20 ft)", value: -2, type: "circumstance" });
      }
    }

    // Point Blank Shot's +1 applies across the whole FIRST range
    // increment (not just 20 ft), for weapons without the Volley trait.
    if (ownsFeat("point blank shot") &&
      !/\bvolley\b/i.test(String(weaponData.traits ?? "")) &&
      distance !== null && increment > 0 && distance <= increment) {
      modifiers.push({ label: "Point Blank Shot", value: 1, type: "circumstance" });
    }

    const attackerEngaged = tokensEngaging(attackerToken).length > 0;
    if (attackerEngaged) {
      modifiers.push({
        label: "Engaged in melee",
        value: ENGAGED_RANGED_PENALTY,
        type: "untyped"
      });
    }

    // LINE OF SIGHT (page 199): "To be able to make a ranged attack you
    // must have a clear line of sight to your target."
    //
    // GRAHAM'S R3 OF THE BLOCK-19 AUDIT: "GM Call." So the shot is NOT
    // refused — the note is put on the card and the table decides. A
    // wall that blocks movement is the same test a spell's line of
    // effect already uses, and it is deliberately the only thing tested:
    // fog, darkness and a crowd are not walls, and the sentence the GM
    // is being asked to rule on is the one about walls.
    if (lineOfSightNote === null && lineOfEffectBlocked(attackerToken.center, targetToken.center)) {
      lineOfSightNote =
        `<em>No clear line of sight to ${targetToken.name ?? "the target"} — a solid barrier is in the way. `
        + "Page 199 requires one for a ranged attack; whether this shot is allowed is the GM's call.</em>";
    }

    strayCandidates = tokensEngaging(targetToken, { exclude: [attackerToken] });
    if (strayCandidates.length) {
      // Precise Shot (Class, Chapter 5): "you ignore the +4 standard
      // cover bonus" for firing into melee (other cover still applies —
      // this is only the firing-into-melee grant). Stray-shot candidates
      // are unaffected; only the DB bonus is waived.
      coverBonus = ownsFeat("precise shot") ? 0 : COVER_TYPES[FIRING_INTO_MELEE_COVER].bonus;
    }
  }

  // Creature Type: Ooze — "cannot be Flanked or Flat-Footed." Flat-Footed
  // immunity is carried in the item's own baked immunities text (the
  // existing condition-immunity mechanism already covers it); this is
  // the other half — the Flanking bonus itself never applies against it,
  // and (below) it can never make the "target is flanked" half of Sneak
  // Attack/Opportunist's Strike true either. (targetCannotBeFlanked and
  // reach were both resolved above, before AP was spent.)

  // The reach penalty, OUTSIDE the flanking gate for the reason given
  // where `reach` is measured.
  if (measuresReach && reach.penalty) {
    modifiers.push({
      label: `Reach (attacking at ${distanceToTarget} ft)`,
      value: reach.penalty,
      type: "untyped"
    });
  }

  let flankingAlly = null;
  /** Allies who were in a flanking square but not threatening (R14). */
  let flankingRefusals = [];
  if (positional && !isRanged && !targetCannotBeFlanked) {

    const attackerOrigin = tokenOrigin(attackerToken);
    const targetOrigin = tokenOrigin(targetToken);
    if (attackerOrigin && targetOrigin) {
      const squares = occupiedSquares(targetOrigin);
      // FOUR CONDITIONS, NOT ONE (page 200; the block-19 audit's D14,
      // Graham's R14 of 21 September 2026). "The flanking characters must
      // also be threatening the same enemy, meaning they are capable of
      // making melee attacks against that enemy." Until 3.579.0 the only
      // question asked was disposition, so an unconscious ally, a fleeing
      // one, or one standing beyond its own reach of the target all
      // granted the flank. `allyThreatens` is the rule; this reads the
      // four facts off the token and hands them over.
      const rejectedAllies = [];
      const allies = tokensAlliedWith(attackerToken, [targetToken])
        .map((token) => {
          const origin = tokenOrigin(token);
          if (!origin) return null;
          const allyActor = token.actor ?? null;
          const verdict = allyThreatens({
            conditions: Array.from(allyActor?.statuses ?? []),
            reachFeet: Number(allyActor?.system?.combat?.reach ?? 5),
            distanceFeet: distanceBetween(token, targetToken),
            // "Wielding a melee weapon or able to strike unarmed"
            // (R14). An Unarmed Strike is available to every creature
            // that can act at all, so this is true for anything with an
            // actor behind it — the conditions above are what actually
            // takes the flank away. Written as the rule rather than as
            // `true` so the sentence is visible where it is applied.
            canStrike: Boolean(allyActor)
          });
          if (!verdict.threatens) {
            // Recorded for the card only when this ally was standing
            // somewhere that would otherwise have flanked — an ally
            // asleep across the room is not a missing flank.
            if (sideFlags(origin, squares)?.adjacent) {
              rejectedAllies.push(`${token.name} ${verdict.reason}`);
            }
            return null;
          }
          return { ...origin, id: token.id, name: token.name };
        })
        .filter(Boolean);
      const result = findFlankingAlly(attackerOrigin, allies, squares);
      // SAID OUT LOUD ONLY WHEN IT MATTERED: a flank the player expected
      // and did not get is worth a sentence; a list of every ally on the
      // board who is not flanking is noise.
      if (!result.flanking && rejectedAllies.length) {
        flankingRefusals = rejectedAllies;
      }
      if (result.flanking) {
        flankingAlly = allies.find((a) => a.id === result.allyId) ?? null;
        modifiers.push({
          label: flankingAlly
            ? `Flanking (with ${flankingAlly.name})`
            : "Flanking",
          value: FLANKING_BONUS,
          type: "circumstance"
        });
      }

      // Support and Perfect Flanking (Companion feats). Both ask the
      // same question the flank above answered the hard way — are these
      // two both next to the target — minus the opposite-sides
      // requirement. Resolved inside this same positional block so they
      // inherit all of its gates: melee only, positional automation on,
      // both tokens placed, and a target that can be flanked at all.
      const pair = companionPairBonusFor({
        actor, attackerOrigin, allies, squares
      });
      if (pair?.modifier) {
        modifiers.push(pair.modifier);
        // Perfect Flanking's wording is that the pair's presence "grants
        // you a flanking bonus" — the ordinary flank — so it makes the
        // target FLANKED for everything else that reads it, Sneak Attack
        // included. Support does not: its +1 is a circumstance bonus the
        // book never calls a flank.
        if (pair.flanks && !flankingAlly) flankingAlly = pair.partner;
      }
    }
  }

  // --- Sneak Attack and Opportunist's Strike (Rogue, Chapter 3) --------
  //
  // Both turn on the same question: does the TARGET qualify — flanked,
  // or flat-footed. Flat-footed is a condition and needs no geometry.
  // "Flanked" is the book's word and it is about the target, not about
  // this attacker: the melee flanking modifier above already answers
  // "am I flanking", so what remains is "is the target flanked by any
  // PAIR of my allies" — which is also the only flank a ranged attacker
  // can shoot into.
  const rogueAsks = hasSneakDice(actor) ||
    Array.from(actor.items ?? []).some(
      (i) => i.type === "ability" && String(i.name).trim().toLowerCase() === "opportunist's strike"
    );
  // CONSIDERED FLANKED (3.668.0; Shadowy Step): the flanking bonus, and
  // flanked for Sneak Attack, "regardless of your actual positioning".
  if (treatAsFlanked && !isRanged) {
    const { treatedFlankingRow } = await import("./strike-options.mjs");
    const row = treatedFlankingRow({ alreadyFlanking: Boolean(flankingAlly), cannotBeFlanked: Boolean(targetCannotBeFlanked), bonus: FLANKING_BONUS, label: optionLabel || "this Strike" });
    if (row) modifiers.push(row);
  }
  let targetFlanked = Boolean(flankingAlly) || (treatAsFlanked && !isRanged && !targetCannotBeFlanked);
  if (rogueAsks && !targetFlanked && positional && !targetCannotBeFlanked) {
    const targetOrigin = tokenOrigin(targetToken);
    if (targetOrigin) {
      const squares = occupiedSquares(targetOrigin);
      const allyOrigins = tokensAlliedWith(attackerToken, [targetToken])
        .map((token) => tokenOrigin(token))
        .filter(Boolean);
      targetFlanked = targetFlankedByAllies(allyOrigins, squares);
    }
  }
  // SURPRISE ATTACK (Chapter 5): "All opponents are flat-footed to you in
  // the surprise round regardless of whether they have acted or not."
  //
  // Round one's Flat-Footed is shed at the start of each combatant's own
  // turn, so by the time you act, anyone above you in the order has
  // already lost it. The feat says they are flat-footed TO YOU — a
  // property of the pairing, not of either creature — so it is answered
  // here, where both are known, and never written onto the target.
  //  is declared far above, beside  — see
  // the comment there for why it had to move (3.352.1).

  const sneakTargetQualifies = Boolean(targetActor) && sneakAttackTargetQualifies({
    flatFooted: Boolean(targetActor?.hasCondition?.("flatFooted")) || surpriseAttackOn
      || Boolean(conditionTerms?.flatFootedBy) || Boolean(treatAsFlatFooted),
    flanked: targetFlanked
  });

  // Sneak Attack's dice ride the damage roll; decided here, where the
  // target is known, and handed through to resolveWeaponDamage.
  let sneakDice = 0;
  // STEALTHY STRIKE TOO (3.651.0): the general feat is this rule — see hasSneakDice.
  if (hasSneakDice(actor) && sneakTargetQualifies &&
    sneakAttackWeaponEligible({
      isRanged,
      isThrownMelee: thrownByDistance,
      traits: weaponData.traits
    })) {
    sneakDice = sneakDiceFor(actor, system.skills?.stealth?.ranks ?? 0);
  }

  // AMBUSH DICE (3.668.0; Inner Tempest's Unseen Assault). Settled here,
  // where the target and the weapon are known: once per round, the weapon
  // half, and why the target is flat-footed to you (Graham's B4-3). A cause
  // that needs a person is asked on the hit, not before the roll. See
  // combat/ambush-dice.mjs.
  const { ambushCause, ambushDiceCount, ambushExtrasFor, ambushRoundKey, ambushWeaponEligible, declaredAmbush, declaredAmbushExtras } = await import("./ambush-dice.mjs");
  const ambushCarriers = [...Array.from(actor.items ?? []), ...Array.from(actor.appliedEffects ?? actor.effects ?? [])];
  const ambushDeclared = targetActor ? declaredAmbush(ambushCarriers) : null;
  let ambush = null;
  if (ambushDeclared) {
    const roundKey = ambushRoundKey(game.combat?.id ?? "", game.combat?.started ? Number(game.combat.round ?? 0) : 0);
    const usedThisRound = ambushDeclared.oncePerRound && roundKey && actor.getFlag?.(SYSTEM_ID, "ambushRound") === roundKey;
    const fromFlag = targetActor.getFlag?.(SYSTEM_ID, "flatFootedFrom");
    const cause = ambushCause({
      flatFootedBy: conditionTerms?.flatFootedBy ?? null,
      targetFlatFooted: Boolean(targetActor.hasCondition?.("flatFooted")),
      fromOwnAbility: Boolean(fromFlag?.uuid) && fromFlag.uuid === actor.uuid,
      otherwiseFlatFooted: Boolean(surpriseAttackOn) || Boolean(treatAsFlatFooted)
    });
    const eligible = ambushWeaponEligible({
      isRanged: isRanged && !thrownByDistance,
      isThrown: Boolean(thrownByDistance) || String(weaponData.attackMode ?? "").trim().toLowerCase() === "thrown",
      traits: weaponData.traits,
      rangeBand: rangeBandOf({ isRanged, distance: distanceToTarget, rangeIncrement })
    });
    if (!usedThisRound && cause && eligible) {
      ambush = { declared: ambushDeclared, cause, roundKey, count: ambushDiceCount(ambushDeclared, actorLevel), undetected: conditionTerms?.flatFootedBy === "undetected" };
    }
  }

  // Precision Hunter (Ranger, Hunter's Method): "Once per round, the
  // first time you damage your hunted prey with a Strike, you deal
  // +1d6 precision damage" (2d6 at 9th, 3d6 at 17th). Decided here;
  // the once-per-round marker is only burned when damage actually
  // rolls (the hit branch below) — an attack that misses has not
  // damaged the prey, so the round's first-damage window stays open.
  const precisionDice = precisionHunterOffer({
    actor,
    level: actorLevel,
    targetIsPrey,
    usedThisRound: Boolean(actor.getFlag?.(SYSTEM_ID, "precisionHunterUsed"))
  });
  // PACK ATTACK (Creature Codex, 3.631.0): "+1d6 precision damage when
  // attacking any creature within reach of at least two of its allies" —
  // read off the tokens, here, where the target is known.
  const { packAttackDice } = await import("./pack-attack.mjs");
  const packDice = packAttackDice(actor, targetToken, { attackerToken });
  const compoundPrecision = Math.max(0, Math.floor(Number(extraPrecisionDice) || 0)) + packDice;

  // DECLARED STRIKE RIDERS (3.564.0): the same once-per-round,
  // first-damage window Precision Hunter has, read off any effect that
  // declares `strikeDamageRider` — Pillars of Faith's Judgement is the
  // first. Decided here, where the target is known; burnt on the hit.
  const damageRiders = damageRidersFor(
    declaredDamageRiders(Array.from(actor.appliedEffects ?? actor.effects ?? [])),
    {
      targetUuid: targetActor?.uuid ?? "", used: actor.getFlag?.(SYSTEM_ID, RIDERS_USED_FLAG) ?? {},
      // THE TARGET'S HIT POINTS BEFORE THE BLOW (3.625.0), for a rider that grows against a wounded creature.
      targetHp: Number(targetActor?.system?.resources?.hp?.value ?? NaN),
      targetMax: Number(targetActor?.system?.resources?.hp?.max ?? 0),
      // AND WHAT IT IS (3.630.0), for a rider that grows against a kind of creature.
      targetTypes: creatureTypesOf(targetActor?.system ?? {}),
      targetTraits: creatureTraits(targetActor?.system ?? {})
    }
  );

  // Opportunist's Strike: "+1-circumstance bonus to the attack roll"
  // (+2 at 11th), once per round, agile/finesse weapons only. Appendix 1
  // stacks circumstance bonuses HIGHEST-WINS, so a bonus that would be
  // wholly absorbed by a larger circumstance modifier already on the
  // roll (Flanking's +2, most rounds) is not applied at all — and, more
  // to the point, does not burn the once-per-round use on a roll it
  // cannot change.
  let opportunistBonus = 0;
  if (sneakTargetQualifies) {
    const bestCircumstance = Math.max(
      0, ...modifiers.filter((m) => m.type === "circumstance").map((m) => Number(m.value) || 0)
    );
    const offered = opportunistsStrikeBonus({
      actor,
      level: actorLevel,
      traits: weaponData.traits,
      targetQualifies: sneakTargetQualifies,
      usedThisRound: Boolean(actor.getFlag?.(SYSTEM_ID, "opportunistUsed"))
    });
    if (offered > bestCircumstance) {
      opportunistBonus = offered;
      modifiers.push({
        label: "Opportunist's Strike",
        value: offered,
        type: "circumstance"
      });
      await actor.setFlag(SYSTEM_ID, "opportunistUsed", true);
    }
  }

  const baseDB = targetActor
    ? Number(targetActor.system?.combat?.defence?.total ?? null)
    : null;
  // Warden Hunter (Ranger, Hunter's Method), the defender's side: the
  // TARGET gains "+1-circumstance bonus to DB ... against your hunted
  // prey's attacks" — read off the target's own sheet, applied when the
  // attacker walking in is the target's designated prey.
  const wardenDB = targetActor
    ? wardenHunterBonus({
        actor: targetActor,
        attackerIsPrey: isHuntedPrey(targetActor, {
          tokenId: attackerToken?.id ?? "",
          actorId: actor.id ?? ""
        })
      })
    : 0;
  // SHIELDED STRIDE (Chapter 5): "your shield bonus to DB is increased by
  // +4 against actions which are provoked via movement. You cannot use
  // Shielded Stride with a buckler."
  //
  // The DEFENDER's feat, read off the defender's sheet and scoped to this
  // one attack — the same shape as the Warden's bonus above, and the same
  // reason it is not a standing effect: a permanent +4 would apply to every
  // blow in the round rather than to the one their movement invited.
  const shieldedStrideDB = targetActor
    ? shieldedStrideBonus({
      featNames: Array.from(targetActor.items ?? [])
        .filter((i) => i.type === "feat").map((i) => i.name),
      provokedByMovement: provokedByMovement === true,
      hasShield: Number(targetActor.system?.combat?.shield?.db ?? 0) > 0,
      // BY CATEGORY, NOT BY NAME (3.575.0): `isBuckler` is what decides a
      // buckler's hands and its lost DB, so it decides this too. A renamed
      // buckler used to slip through.
      buckler: Array.from(targetActor.items ?? []).some(
        (i) => i.system?.equipped && isBuckler(i)
      )
    })
    : 0;
  // TRAP FINDER (Rogue 1st / Ranger 1st), the third of its three printed
  // bonuses: "+2-circumstance bonus to Perception checks to find traps,
  // TO DB AGAINST ATTACKS MADE BY TRAPS, and to saves against traps."
  //
  // The other two are authored conditionals on the ability. This one
  // cannot be: a conditional's axes all describe a check its owner
  // ROLLS, and DB is a number somebody else rolls against. So it belongs
  // here, with the two defender-side attacker-scoped bonuses above it —
  // the pages 51-60 audit found it missing entirely, in both automatic
  // and manual form, on both classes.
  //
  // NOTHING FIRES WITHOUT THE TRAIT (Graham's ruling of 16 September
  // 2026). No pack ships a trap, so there is nothing to detect and
  // nothing worth guessing from; a GM who tags the attacker — or the
  // attack — gets the bonus applied and named on the card, and a GM who
  // does not gets silence rather than a wrong number.
  const trapFinderDB = targetActor && attackIsFromATrap({
    attackerSystem: actor.system ?? null,
    weaponTraits: weaponData.traits ?? ""
  })
    ? trapFinderDefenceBonus({
        actor: targetActor,
        attackerIsTrap: true,
        perceptionRanks: Number(targetActor.system?.skills?.perception?.ranks ?? 0)
      })
    : 0;
  // ARROW CATCHING (Chapter 11): "the armour or shield increases its
  // bonus to DB by +1 against missile attacks" — the target's rune, read
  // off the target's own equipment, and only against a ranged strike.
  // Same shape as cover and the Warden's bonus just above.
  const arrowCatchingDB = targetActor && isRanged
    ? runeBonusesForActor(Array.from(targetActor.items ?? [])).missileDefence
    : 0;
  // DRAGONHIDE (Chapter 6, 3.574.0): "+2 DB when used against the energy
  // type of the dragon the scales were harvested from." Arrow Catching's
  // shape exactly — the target's own shield, scoped by a fact about THIS
  // attack. Most strikes are physical and never meet it; a natural attack
  // or a weapon whose own damage type is an energy (an acid spit, a fire
  // lash) does. The spell-attack path has the same check, which is where
  // it bites most often.
  const dragonhideDB = targetActor
    ? dragonhideShieldDB(Array.from(targetActor.items ?? []), [weaponData.damageType])
    : 0;
  // WHAT THE DEFENDER BRINGS AGAINST *THIS* ATTACKER (3.321.0).
  //
  // Thengar (Chapter 2): "+1 racial bonus to your DB and Saving Throws
  // against the attacks of creatures of the Undead Type." Like the three
  // bonuses above it is read off the TARGET's own sheet, but it is scoped
  // by a fact about the attacker rather than about the weapon or the
  // ground — so it goes through the defence-DC channel, which is where
  // "what the defender adds to the number you must beat" already lives.
  const attackerTypes = creatureTypesOf(actor.system ?? {});
  // WHO, EXACTLY, IS SWINGING (3.406.0). The type answers Thengar; only
  // the uuid answers a ward raised against ONE named creature. Passed
  // from here because this is the call that already holds both actors —
  // and an axis this call does not supply is one the defence channel can
  // never ask about later, since the defender rolls nothing.
  // AND WHAT THE ATTACKER IS ALIGNED TO (3.446.0), the third axis on the
  // same channel. Radiant Aegis raises an ally's DB "against attacks made
  // by creatures with an opposing aura type to your own", and Graham's
  // ruling of 31 August 2026 settled that an aura type is the Aligned
  // trait. An axis this call does not supply is one the channel can never
  // ask about later — the same reason the uuid is passed from here.
  const attackerAlignments = alignedTraitsOf(actor.system ?? {});
  const typedDefence = targetActor
    // …AND ITS TRAITS (3.664.0): Spirit Stance's DB "against spirits and
    // incorporeal creatures".
    ? defenceDCBonus(targetActor, "defence", "", attackerTypes, actor?.uuid ?? "", attackerAlignments, creatureTraits(actor.system ?? {}))
    : { total: 0, entries: [] };
  // STANCE BONUSES IGNORED (3.668.0; Formless Cut): what the target's
  // stances give its DB against this Strike, paid back as a bonus on it.
  if (ignoreTargetStance && targetActor) {
    const { stanceDefenceOf } = await import("./strike-options.mjs");
    const { activeStanceEffects } = await import("../stance-declarations.mjs");
    const ignored = stanceDefenceOf({
      breakdown: targetActor.system?.combat?.defence?.breakdown?.entries ?? [],
      stanceUuids: activeStanceEffects(Array.from(targetActor.appliedEffects ?? targetActor.effects ?? [])).map((e) => e.uuid),
      dcEntries: typedDefence.entries ?? []
    });
    if (ignored.total > 0) {
      modifiers.push({ label: `${optionLabel || "This Strike"}: ignores ${targetActor.name}'s stance (${ignored.labels.join(", ")})`, value: ignored.total, type: "untyped" });
    }
  }
  // AID DEFENSIVE (Chapter 4): "+N circumstance to Defence, only against
  // that target's next attack." Read here rather than off a shared
  // circumstance pool because "only against THAT target" is a fact about
  // this exchange, and this is the one place that knows both sides of it.
  const aidDefence = targetActor
    ? aidBonusAgainst(targetActor, { kind: "defensive", against: actor.id })
    : null;
  /*
   * ABJURERS STRIKE AND ANYTHING LIKE IT (3.585.0, page 248, R13).
   *
   * "the weapon treats all targets as unarmoured and ignores all
   * magical bonuses to DB" — both halves are the target's `item`
   * defence slot, so the pierce subtracts that component. Applied to
   * the composed DB rather than to `baseDB` so that cover, Aid and the
   * rest are untouched: the spell pierces what the target IS wearing,
   * not the wall they are standing behind.
   */
  const pierce = targetActor
    ? defencePierceFor(defencePiercesOn(actor), weapon?.id, targetActor.system?.combat?.defence)
    : { amount: 0, slots: [], labels: [] };
  // FEARFUL POWER (3.659.0; block 28 R9): the Tenebrax's status bonus to DB,
  // less any status bonus its DB already carries (they do not stack).
  let fearfulDB = 0;
  if (targetActor) {
    const { fearfulPowerBonus } = await import("../fearful-power-workflow.mjs");
    const { statusBonusOver } = await import("../fearful-power.mjs");
    fearfulDB = statusBonusOver(fearfulPowerBonus(targetActor), Number(targetActor.system?.combat?.defence?.breakdown?.byType?.status ?? 0));
  }
  const db = Number.isFinite(baseDB)
    ? baseDB + coverBonus + wardenDB + arrowCatchingDB + dragonhideDB + shieldedStrideDB + typedDefence.total + fearfulDB
      + trapFinderDB + (aidDefence?.amount ?? 0) - pierce.amount
    : null;

  // AID OFFENSIVE (Chapter 4): the mirror of the above — a bonus to the
  // aided creature's next attack against one named enemy, and against
  // nobody else.
  const aidAttack = targetActor
    ? aidBonusAgainst(actor, { kind: "offensive", against: targetActor.id })
    : null;
  if (aidAttack) {
    modifiers.push({ label: aidAttack.label, value: aidAttack.amount, type: "circumstance" });
  }

  if (/\bunsteady\b/i.test(String(weaponData.traits ?? ""))) {
    const rested = await promptUnsteadyRested(weapon.name);
    if (rested === null) return null;
    if (!rested) {
      modifiers.push({ label: "Unsteady", value: -2, type: "circumstance" });
    }
  }

  // Versatile (Chapter 6): "you must choose the damage type before
  // you make the attack" — prompted here, before the roll, and
  // carried through to whichever damage resolution follows a hit.
  // BLUNT ARROWS (3.576.0): "an archer can choose to inflict subdual
  // damage with the arrows by taking a -4-circumstance penalty to their
  // attack." Asked before the roll, like Versatile, because the penalty
  // is on the roll.
  let subdualShot = false;
  // DRACONIC SHIFTING (Creature Codex; 3.631.0): while shifted, its Strikes
  // "would now be classed as unarmed subdual attacks" — the modifiers stand,
  // the damage type is subdual.
  const { strikesAreSubdual } = await import("../creature-ability-rules.mjs");
  const shiftedSubdual = strikesAreSubdual(Array.from(actor.items ?? []));
  if (shiftedSubdual) modifiers.push({ label: "Draconic Shifting (unarmed subdual)", value: 0, type: "untyped" });
  if (ammoEffects.allowsSubdual && !skipDialog(event)) {
    subdualShot = await promptSubdualShot(ammo?.name ?? "Ammunition");
    if (subdualShot === null) return null;
    if (subdualShot) {
      modifiers.push({ label: `Subdual (${ammo?.name ?? "ammunition"})`, value: SUBDUAL_SHOT_PENALTY, type: "circumstance" });
    }
  }

  let versatileDamageType = null;
  const versatileAlternate = extractVersatileType(weaponData.traits);
  // AND ANY TYPE THE ATTACKER DECLARES FOR THIS KIND OF STRIKE (3.627.0):
  // Essence Attacks' "you may have the attack deal essence damage instead".
  // Asked in the same breath as Versatile; see combat/strike-type-options.mjs.
  const strikeTypeOptions = [...declaredStrikeTypeOptions(Array.from(actor.appliedEffects ?? actor.effects ?? [])), ...weaponStrikeTypeOptions(weapon)];
  // A TYPE SET RATHER THAN OFFERED (3.670.0; Tiger and Wolf Stance): it is
  // the Strike's type, and nothing else is asked; two set at once are asked
  // between.
  const forcedTypes = forcedStrikeTypes(abilityData, strikeTypeOptions);
  const damageTypeChoices = forcedTypes.length ? forcedTypes : strikeTypeChoices(abilityData, strikeTypeOptions, versatileAlternate);
  if (forcedTypes.length === 1) versatileDamageType = forcedTypes[0].type;
  else if (damageTypeChoices.length > 1) {
    versatileDamageType = await promptVersatileDamageType(weapon.name, damageTypeChoices);
    if (versatileDamageType === null) return null;
  }

  // THE x1.5 (Chapter 6, Weapon Sizes): a weapon one size larger than its
  // wielder, or a Hand & a Half weapon in its two-handed grip (chosen at
  // equip and stored on the weapon). Until 3.575.0 only the second case
  // existed. Melee only — the sentence is about the melee damage bonus.
  // See `twoHandedStrengthApplies`.
  const usedTwoHanded = !isRanged &&
    twoHandedStrengthApplies({ type: "weapon", system: weaponData }, system.identity?.size ?? "medium");

  // …AND THE CIRCUMSTANCE PENALTIES THIS SWING WOULD OTHERWISE CARRY
  // (3.609.0). Set aside here, said on the roll as a zero-value line.
  if (strikeEdge) {
    const { withoutCircumstancePenalties } = await import("../magic/strike-edge.mjs");
    if (strikeEdge.ignoreCircumstance) {
      const { kept, removed } = withoutCircumstancePenalties(modifiers);
      if (removed.length) {
        modifiers.splice(0, modifiers.length, ...kept);
        modifiers.push({ label: `${strikeEdge.label || "Edge"}: ignores ${removed.map((m) => m.label).join(", ")}`, value: 0, type: "untyped" });
      }
    }
    if (strikeEdge.ignoreConcealment && targetActor) {
      modifiers.push({ label: `${strikeEdge.label || "Edge"}: sees through concealment`, value: 0, type: "untyped" });
    }
  }

  // THE TARGET'S STATE AGAINST THIS ATTACKER (3.668.0): flat-footed to you
  // for any reason, alone (none of its allies beside it), or in a duel (none
  // of yours beside it). Read off the board only when both tokens are on it.
  const { targetStatesOf } = await import("./strike-options.mjs");
  const adjacentFrom = (tokens) => (positional && targetToken)
    ? tokens.some((t) => Number(distanceBetween(t, targetToken)) <= 5)
    : null;
  const targetStates = targetActor ? targetStatesOf({
    flatFooted: Boolean(targetActor.hasCondition?.("flatFooted")) || Boolean(conditionTerms?.flatFootedBy) || Boolean(surpriseAttackOn) || Boolean(treatAsFlatFooted),
    targetAlliesAdjacent: (positional && targetToken) ? adjacentFrom(tokensAlliedWith(targetToken, [attackerToken])) : null,
    attackerAlliesAdjacent: (positional && targetToken) ? adjacentFrom(tokensAlliedWith(attackerToken, [targetToken])) : null
  }) : [];

  const attackCheckConfig = {
    actor,
    label: `${weapon.name} — Attack${thrownByDistance ? " (thrown)" : ""}`,
    subtitle: targetActor
      ? `vs ${targetActor.name}${thrownByDistance ? ` — thrown ${distanceToTarget} ft` : ""}`
      : "No target selected",
    type: "attack",
    // WHAT THIS STRIKE IS BASED ON (3.613.0, R1): Strength in melee,
    // Dexterity at range, both with a finesse weapon. Physical Boost reads it.
    abilities: weaponAttackAbilities({ ranged: isRanged, finesse }),
    dc: db,
    // WHO THIS SWING IS AIMED AT (3.415.0) — the mirror of the attacker
    // uuid this same function already hands `defenceDCBonus` fifty lines
    // up. It is what makes "a -1 penalty to attacks AGAINST YOU" mean
    // against one creature rather than against everybody. Blank when
    // nothing is targeted, at which point a target-scoped entry
    // correctly matches nothing rather than guessing.
    targetUuid: targetActor?.uuid ?? "",
    // …AND WHAT KIND OF THING IT IS (3.567.0). The type axis beside the
    // uuid one, for rules written about a category rather than about one
    // creature — the same pairing the source side has carried since
    // 3.406.0. Blank with nothing targeted, for the same reason.
    targetTypes: creatureTypesOf(targetActor?.system ?? {}),
    // …AND ITS TRAITS (3.664.0): Spirit Stance's "against spirits and
    // incorporeal creatures" is a fact about the traits line.
    targetTraits: creatureTraits(targetActor?.system ?? {}),
    // MELEE OR RANGED (3.650.0) — a conditional scoped to ranged attacks
    // (Irritating Glamour's penalty) asks this.
    attackMode: isRanged ? "ranged" : "melee",
    // WHAT IT IS STRUCK WITH (3.667.3): "unarmed" (the fists, a gauntlet, a
    // Monastic weapon), "natural" or "weapon". Inner Strike's +1 status to
    // unarmed attack rolls reads it; found live on Inner Tempest 0.4.1.
    attackForm: attackFormOf(abilityData),
    // THE WEAPON'S GROUP (3.668.0): Weapon Discipline's scope.
    attackGroup: String(weaponData.group ?? "").trim().toLowerCase(),
    // HOW FAR IT REACHES (3.668.0): Stone Serpent's reach, Distant Honour's
    // first increment.
    rangeBand: rangeBandOf({ isRanged, distance: distanceToTarget, rangeIncrement }),
    // ITS STATE (3.668.0): Ghost Fox, Dread Wolf, the Oath of Honour.
    targetStates,
    // A WEAPON ATTACK OPENS NO DIALOG, so its tick-boxes are asked before
    // the dice (3.667.3) — unless Shift skipped the questions.
    offerConditionals: !skipDialog(event),
    // "All attacks against you gain advantage if you cannot move" (3.621.0).
    // Handed in as the starting bias, so a disadvantage from anywhere else
    // cancels against it through `resolveBias` as the Advantage trait says.
    ...(conditionTerms?.advantage ? { bias: "advantage" } : {}),
    // THE SAME DIE, NOT A NEW ONE (3.649.0): a shared strike's later
    // creatures. Conviction was offered on the first; this is that roll.
    ...(presetDice ? { presetDice, allowConviction: false } : {}),
    suppressDegree: true,
    modifiers,
    toMessage: false
  };
  // FORETELL FAILURE IS TOLD HERE, NOT ASKED (3.672.0; C8): by this line the
  // Strike has spent its AP and its defender has been offered reactions, so
  // it cannot be swapped for another action. See TRGCheck.roll.
  let check = await TRGCheck.roll(attackCheckConfig);

  // ALTER THE THREAD (3.667.0; Inner Tempest's Mystic, Graham's B3-5): the
  // defender may spend conviction, once the roll is seen and before it
  // resolves, to make this attack roll again; the new roll stands. Not on a
  // shared strike's later creatures, whose die is the first creature's. See
  // combat/attack-reroll-workflow.mjs.
  if (targetActor && !presetDice) {
    const { offerAttackReroll, postRerollCard } = await import("./attack-reroll-workflow.mjs");
    const asked = await offerAttackReroll({ attacker: actor, defender: targetActor, check, what: weapon.name, db });
    if (asked.rerolled) {
      const before = Number(check.outcome?.total ?? check.total ?? 0);
      // THE FIRST ROLL'S TICK-BOXES STAND (3.667.3): not asked again.
      check = await TRGCheck.roll({ ...attackCheckConfig, allowConviction: false, conditionalChoices: check.conditionalChoices ?? [] });
      await postRerollCard(targetActor, actor, asked.label, before, Number(check.outcome?.total ?? check.total ?? 0));
    }
  }

  // YOUR OWN FUMBLE, REROLLED IN PLACE (3.669.0; Inner Tempest's Fortune's
  // Reversal: "Reroll the triggering check and use the second result, even
  // if it is worse"). Asked HERE, straight after the roll and before the
  // Strike spends anything — ammunition, the loaded state, a thrown weapon,
  // Aim, Aid, Power Attack, a once-rider, a Flourish — so the second roll is
  // the triggering check made again and nothing else (found in review: the
  // first build re-ran the whole Strike after all of that was spent). The
  // fumble is confirmed first (the fumble check, audit interpretation 2),
  // and only for an attacker who could take the reroll, so every other
  // Strike keeps its order of cards. A reroll that fumbles again is checked
  // as usual below, and is not offered again.
  let fumbleConfirmedEarly = null;
  if (!presetDice && !fumbleRerolled) {
    const face = Math.floor(Number(check.dice?.unmodified ?? 0) || 0);
    const window = proficient ? 1 : 2;
    const risk = face <= window || (clumsy && face === window + 1);
    const { fumbleRerollAvailable } = await import("../fumble-reroll-workflow.mjs");
    if (risk && fumbleRerollAvailable(actor, "attack")) {
      const dcHalved = !(face <= window);
      fumbleConfirmedEarly = await confirmAttackFumble(actor, weapon, { dcHalved, weaponData });
      if (fumbleConfirmedEarly) {
        const { offerFumbleReroll } = await import("../fumble-reroll-workflow.mjs");
        const taken = await offerFumbleReroll(actor, "attack");
        if (taken) {
          const before = Number(check.outcome?.total ?? 0);
          check = await TRGCheck.roll({ ...attackCheckConfig, conditionalChoices: check.conditionalChoices ?? [], allowConviction: false });
          fumbleRerolled = true;
          fumbleConfirmedEarly = null;
          await postCard(actor, taken.label, [line(`The fumble is not rolled on its table: the attack check is made again (${before} → <strong>${Number(check.outcome?.total ?? 0)}</strong>), and the second result stands, even if it is worse.`)]);
        }
      }
    }
  }

  // Opportunist's Strike: "this bonus does not apply if the attack is
  // made with disadvantage." Whether the roll ended up at disadvantage
  // is only knowable now — an automatic conditional can force the bias
  // during TRGCheck.roll — so the modifier is withdrawn from the rolled
  // check, the outcome rebuilt, and the once-per-round use handed back.
  if (opportunistBonus && check.bias === "disadvantage") {
    const withdrawn = check.modifiers.findIndex((m) => m.label === "Opportunist's Strike");
    if (withdrawn >= 0) check.modifiers.splice(withdrawn, 1);
    check.applyExtraModifier({
      label: "Opportunist's Strike (does not apply at disadvantage)",
      value: 0,
      type: "untyped"
    });
    await actor.unsetFlag(SYSTEM_ID, "opportunistUsed");
  }

  // THE SHOT USES UP THE SPIN, HIT OR MISS (3.575.0). Spin builds a
  // bonus for the next shot, and a missed shot was still the next shot —
  // but the bonus was only cleared on the damage path, so a miss kept it
  // for the shot after. Taken here, carried to the damage roll below.
  const spinCarried = Math.max(0, Number(weaponData.spinBonus ?? 0));
  if (spinCarried) await weapon.update({ "system.spinBonus": 0 });

  // DOUBLE SLICE freezes it: "using your CURRENT multiple attack
  // penalty, make two Strikes" — both swings are rolled at the penalty
  // that stood when the action began, and the action then advances the
  // counter by two itself ("this counts as two attacks").
  if (!isReaction && !mapFrozen && !offTurn) {
    const powerSteps = powerAttack && !isRanged && !ownsFeat("furious focus") ? 2 : 1;
    // The larger of the two (3.670.0): a Perfect Strike made as a Power
    // Attack counts as two, not three.
    const mapSteps = Math.max(powerSteps, Math.max(1, Math.trunc(Number(mapStepsOption) || 1)));
    await setSharedMapCount(actor, attackIndex + mapSteps);
  }

  // "Remove once used." Consumed at the same point the ammunition is,
  // and for the same reason: the bonus is spent when the shot is taken,
  // not when the prompts open. Both halves go, because both were granted
  // for this one exchange.
  if (aidDefence) await consumeAidBonus(targetActor, aidDefence.effect);
  if (aidAttack) await consumeAidBonus(actor, aidAttack.effect);

  // Ammunition (Chapter 6): the round is spent once the shot is taken —
  // after the roll, alongside the attack count, so an attack abandoned
  // at one of the prompts above costs no arrows.
  let ammoRemaining = null;
  if (ammo) {
    ammoRemaining = await consumeAmmunition(ammo);
  }

  // THROWN WEAPONS LEAVE THE HAND (Chapter 6). Spent in the same place, and
  // for the same reason, as the round above: after the roll, so an attack
  // abandoned at one of the prompts costs no javelins. Before this, Bugbear
  // Soldier 1 threw the same three javelins fifteen times in the 13 Aug 2026
  // playtest and still had three.
  //
  // `thrownAttack` rather than the weapon's mode, because a dagger with the
  // Thrown trait is only gone on the throws — in melee it stays in the hand.
  const thrownSpend = await consumeThrownWeapon(actor, weapon, thrownAttack);

  // Load (Chapter 6): firing spends the loaded round, so the weapon is now empty
  // and must be reloaded before it can fire again (Reload spends the Load AP,
  // carried over rounds; Quick Load makes the first reload each round free). Only
  // Load weapons track this; thrown and melee weapons are unaffected. Without
  // this the weapon stayed permanently "loaded" and reload never engaged.
  if (needsReloading(weaponData.traits) && weaponData.loaded) {
    await weapon.update({ "system.loaded": false, "system.reloadProgress": 0 });
  }
  // Magazine (Repeater): each shot spends one bolt from the magazine; when it
  // hits zero the block above stops further fire until it's reloaded.
  if (magazineCapacity > 0) {
    await weapon.update({
      "system.magazine": Math.max(0, Number(weaponData.magazine ?? 0) - 1)
    });
  }

  // Aim (Chapter 4): "if you take any other action besides this one,
  // you lose all accrued aiming bonus" — cleared here, after the
  // bonus has already applied to this roll (the whole point of
  // aiming), rather than before it could.
  await clearAimIfOtherAction(actor, "strike");

  // Parry (Chapter 6): "the bonus is lost if the weapon is used to
  // attack with" — per Graham directly. Only relevant (and only
  // written) for weapons that actually have the trait.
  if (/\bparry\b/i.test(String(weaponData.traits ?? ""))) {
    await weapon.update({ "system.attackedThisTurn": true });
  }

  if (targetToken?.id) {
    const allSweepTargets = foundry.utils.deepClone(actor.getFlag(SYSTEM_ID, "sweepTargets") ?? {});
    const forThisWeapon = allSweepTargets[weapon.id] ?? [];
    if (!forThisWeapon.includes(targetToken.id)) {
      allSweepTargets[weapon.id] = [...forThisWeapon, targetToken.id];
      await actor.setFlag(SYSTEM_ID, "sweepTargets", allSweepTargets);
    }
  }

  // Per Graham: "an immunity to damage means you take no damage or
  // critical from that type." Critical immunity has existed as a
  // parameter since criticals were built and was wired to nothing but a
  // GM prompt during Coup de Grace, so an immune creature still took
  // critical injuries — including the instant-kill results — from damage
  // it could not be hurt by. Also covers a trait the target is immune to.
  const critImmunity = targetActor
    ? immuneToThisStrike(targetActor.system, weapon, versatileDamageType, ownedCreatureTypeSystem(targetActor))
    : null;
  // Weapon Supremacy (Fighter, 13th): a Strike with a Weapon Exemplar
  // group treats a miss by 1 (2 at 19th) as a hit — never on a roll made
  // with disadvantage. check.bias is the bias the dice were actually
  // rolled with, conditionals included.
  const missForgiveness = weaponSupremacyForgiveness({
    actor,
    level: actorLevel,
    groupMatches: exemplarBonus > 0,
    disadvantage: check.bias === "disadvantage"
  });

  // ARMOUR-GRANTED CR, BYPASSED BY A NAMED LOCATION (page 203, R5).
  // Vital Strike is the attack in the book that names one before the
  // blow lands; Ambush picks its location afterwards, by shifting an
  // injury roll that has already been made, so there is no severity
  // left for it to change.
  const declaredLocation = actor.getFlag?.(SYSTEM_ID, "vitalStrikeLocation") ?? null;
  const declaredLocationArmoured = declaredLocation && targetActor
    ? locationCoveredByArmour(Array.from(targetActor.items ?? []), declaredLocation)
      // Mage Armour and Bracers cover the named location too (3.617.4).
      || wholeBodyArmour(targetActor.system).armoured
    : true;
  const crBypass = armourCRBypass({
    criticalResistance: Number(targetActor?.system?.combat?.criticalResistance ?? 0),
    armourCriticalResistance: Number(targetActor?.system?.combat?.armourCriticalResistance ?? 0),
    declaredLocation,
    locationArmoured: declaredLocationArmoured
  });

  // A STRIKE WAS MADE (3.632.0): Aligned Control's hostile-action re-save
  // listens (aligned-control-workflow.mjs).
  if (targetActor) Hooks.callAll("trgPrimeStrikeRolled", { attacker: actor, target: targetActor, weapon });

  const outcome = attackOutcome({
    unmodified: check.dice?.unmodified ?? 0,
    total: check.outcome.total,
    db,
    proficient,
    // A real template.json field, summed in documents/actor.mjs from
    // Armour Master, Critical Resilience/Improved, the Armour Grants CR
    // optional rule, and a creature type's fixed bonus (creature-type-
    // rules.mjs's criticalResistanceBonus) — shown on the actor sheet's
    // Combat Readiness card.
    criticalResistance: crBypass.criticalResistance,
    // MODES OF LETHALITY (page 204, optional; R13).
    criticalThresholdShift: Number(setting("criticalThresholdShift", 0) || 0),
    criticalImmune: Boolean(critImmunity),
    glancingRule: setting("glancingBlows", false),
    keen,
    // Razor rides in on the same channel Keen uses, since the rule is
    // stated as a change to the AV a critical needs.
    razorAV,
    deadly,
    clumsy,
    missForgiveness
  });
  // ONE CRITICAL FOR THE PAIR (3.668.2): read as an ordinary hit before the
  // card is written, so the card, the bonus dice and the injury all agree.
  const criticalDowngraded = Boolean(noCritical) && Boolean(outcome.critical);
  if (criticalDowngraded) outcome.critical = null;

  // Focused Strike (Class, Chapter 5): a strike "only counts towards
  // your multiple attack penalty if it hits your target" — the counter
  // was advanced before the roll (as always), so a miss rolls it back.
  if (!isReaction && !offTurn && outcome.resolved && !outcome.hits && ownsFeat("focused strike")) {
    await setSharedMapCount(actor, attackIndex);
  }

  // Compact result summary (the whole point: hit/miss/critical at a
  // glance, with the full check breakdown tucked behind a hover icon
  // rather than always taking up space).
  let compactSummary;
  if (!outcome.resolved) {
    compactSummary = `Total ${check.outcome.total} — no target`;
  } else if (outcome.critical) {
    const severityLabel =
      outcome.critical.severity.charAt(0).toUpperCase() + outcome.critical.severity.slice(1);
    compactSummary = `Critical Hit — ${severityLabel}`;
  } else if (outcome.hits) {
    compactSummary = outcome.forgiven
      ? `Hit — Weapon Supremacy (missed by ${Math.abs(outcome.av)})`
      : outcome.glancing ? "Hit — Glancing" : "Hit";
  } else {
    compactSummary = "Miss";
  }

  const lines = [];
  // Page 199's line of sight, as a note the GM rules on (R3).
  if (lineOfSightNote) lines.push(line(lineOfSightNote));
  // WHAT THE ATTACK IGNORED (3.585.0). A defence that silently dropped
  // by 4 is a card the table cannot check against the sheet; saying
  // which slots went and how much is what makes Abjurers Strike
  // visible as the 18 PP it cost.
  {
    const pierceNote = targetActor ? defencePierceLine(pierce, targetActor.name) : "";
    if (pierceNote) lines.push(line(pierceNote));
  }
  // STRUCK ON AN UNUSUAL SURFACE (page 196; R17): "if you are struck by
  // an attack while on such a surface, the GM may require you to make a
  // similar check to avoid losing your footing." Offered on the card,
  // because "may require" is the GM's word.
  if (targetToken) {
    // ASKED OF THE REGION'S OWN TOKEN SET (3.579.1, F4). Foundry keeps it
    // as tokens move, so "is the defender standing on one" needs no
    // geometry — and the point test that F4 got wrong is only the
    // fallback. See `surfacesUnder`.
    const standing = surfacesUnder(canvas?.scene, targetToken.document, targetToken.center);
    if (standing.length) {
      const dcs = standing.map((s) => Number(s.dc)).filter((n) => Number.isFinite(n) && n > 0);
      const note = struckOnSurfaceNote({
        defenderName: targetActor?.name ?? targetToken.name,
        labels: standing.map((s) => s.label),
        dc: dcs.length ? Math.max(...dcs) : null
      });
      if (note) lines.push(line(`<em>${note}</em>`));
    }
  }

  // MOUNTED DEFENCE (page 200; R13). Offered on the card rather than
  // applied: whether the mount is in the way is a look at the board, and
  // the page hands both halves of the choice to the attacker.
  if (targetActor) {
    const defenderState = mountedState(targetActor);
    if (defenderState.mounted) {
      const offer = mountedDefenceOffer({
        riderName: targetActor.name, mountName: defenderState.mount || "its mount" });
      if (offer) lines.push(line(`<em>${offer}</em>`));
    }
  }
  // WHY THE FLANK DID NOT HAPPEN (page 200; R14). Printed only when an
  // ally WAS in a flanking square and was not threatening — a player who
  // expected +2 is owed the reason, and a board-wide list is not one.
  if (flankingRefusals.length) {
    lines.push(line(
      `<em>No flank: ${flankingRefusals.join("; ")} — page 200 asks that a flanking ally `
      + "be capable of making melee attacks against that enemy.</em>"));
  }
  if (armouredFist.source) {
    lines.push(line(`<em>${armouredFist.source.name}: treated as gauntlets for attacking — ${weaponData.damage} ${weaponData.damageType}, ${weaponData.traits}.</em>`));
  }
  if (stoneFist) {
    lines.push(line(`<em>Fist of Rock: your fists deal ${stoneFist.damage} ${stoneFist.damageType}, not subdual.</em>`));
  }
  // THE CARD SAYS WHAT THE IMMUNITY ACTUALLY DOES (3.576.0). Since
  // Graham's ruling of 10 Sep 2026 (3.548.0) a critical against an immune
  // creature keeps its bonus damage dice and only the injury roll is
  // bypassed — but this line went on saying "no critical can be scored",
  // and the same card then printed a critical and added its dice. Seen
  // live on the 3.575.0 test; Graham asked for the wording to change.
  if (critImmunity) {
    lines.push(
      line(
        `<em>${targetActor.name} is immune to ${critImmunity} — a critical still adds its bonus damage dice, but no critical injury is rolled.</em>`
      )
    );
  }
  if (ammo) {
    const spent = [`Fired <strong>${ammo.name}</strong>`];
    const notes = [];
    if (ammoEffects.armourRending) notes.push(`AR +${ammoEffects.armourRending}`);
    if (ammoEffects.rangeIncrementBonus) notes.push(`range increment +${ammoEffects.rangeIncrementBonus} ft`);
    // SAID ON THE CARD LIKE EVERY OTHER THING THE ROUND DID. The attack
    // row also appears in the roll's own modifier list, but a reader
    // looking at "Fired Magic Stone (…)" should not have to open the
    // check card to learn that the pebble is why the shot landed.
    if (ammoEffects.attackModifier) {
      notes.push(`attack ${ammoEffects.attackModifier > 0 ? "+" : ""}${ammoEffects.attackModifier}`);
    }
    if (ammoEffects.damageModifier) notes.push(`damage ${ammoEffects.damageModifier}`);
    if (ammoEffects.damageTypeOverride) notes.push(`${ammoEffects.damageTypeOverride} damage`);
    if (ammoEffects.extraDamage) {
      notes.push(`+${ammoEffects.extraDamage} ${ammoEffects.extraDamageType || ""} damage`.trim());
    }
    if (notes.length) spent.push(`(${notes.join(", ")})`);
    spent.push(`— <strong>${ammoRemaining}</strong> left.`);
    lines.push(line(`<em>${spent.join(" ")}</em>`));
    if (ammoRemaining === 0) {
      lines.push(line(`<em>That was the last of them.</em>`));
    }
  }
  // The thrown weapon's own line, in the same voice as the ammunition one
  // above — what left the hand, what is left, and where it can be picked up.
  if (thrownSpend.thrown) {
    const where = thrownSpend.recovered === "party"
      ? " It can be recovered from the party sheet."
      : thrownSpend.recovered === "battlefield"
        ? " Like ammunition, half of what is thrown can be recovered when the battle ends."
        : "";
    lines.push(
      line(
        thrownSpend.returned
          ? `<em><strong>${weapon.name}</strong> is Returning — it flies back to your hand after the Strike. If your hands are full, it falls in your space.</em>`
          : thrownSpend.removed
          ? `<em>Threw <strong>${weapon.name}</strong> — that was the last one.${where}</em>`
          : `<em>Threw <strong>${weapon.name}</strong> — <strong>${thrownSpend.remaining}</strong> left.${where}</em>`
      )
    );
  }
  if (coverBonus) {
    lines.push(
      line(
        `<em>${targetActor?.name ?? "The target"} is engaged in melee: +${coverBonus} DB (Standard cover, firing into melee).</em>`
      )
    );
  }
  if (diversionNote) lines.push(line(diversionNote));
  if (interceptNote) lines.push(line(interceptNote));
  if (arrowCatchingDB) {
    lines.push(
      line(
        `<em>${targetActor?.name ?? "The target"} bears an Arrow Catching rune: +${arrowCatchingDB} DB against missile attacks, and its concealment does not count against them.</em>`
      )
    );
  }
  // SAID ON THE CARD, like every other defender-side bonus above it — a
  // DB that moved with nothing to explain it reads as a fault.
  if (fearfulDB) lines.push(line(`<em>${targetActor?.name ?? "The target"}'s Fearful Power: +${fearfulDB} status to DB (the highest frightened value within 30 feet).</em>`));
  if (dragonhideDB) {
    lines.push(
      line(
        `<em>${targetActor?.name ?? "The target"}'s Dragonhide shield: +${dragonhideDB} DB against ${String(weaponData.damageType ?? "").toLowerCase()}.</em>`
      )
    );
  }
  if (shieldedStrideDB) {
    lines.push(
      line(
        `<em>${targetActor?.name ?? "The target"} answers with their shield as they go: +${shieldedStrideDB} DB (Shielded Stride).</em>`
      )
    );
  }
  if (wardenDB) {
    lines.push(
      line(
        `<em>${targetActor?.name ?? "The target"} is a Warden Hunter and you are its hunted prey: +${wardenDB} DB (circumstance).</em>`
      )
    );
  }
  if (trapFinderDB) {
    lines.push(
      line(
        `<em>${targetActor?.name ?? "The target"} has Trap Finder and this attack carries the trap trait: +${trapFinderDB} DB (circumstance).</em>`
      )
    );
  }
  if (outcome.resolved) {
    lines.push(
      line(
        outcome.hits
          ? `<strong>Hit</strong> — Attack Value ${outcome.av}${outcome.autoHit ? " (unmodified 20 always hits)" : ""}${outcome.glancing ? " — <strong>glancing blow, half damage</strong>" : ""}`
          : `<strong>Miss</strong>${outcome.autoMiss ? " (unmodified 1 always misses)" : ""} — Attack Value ${outcome.av}`
      )
    );
  } else {
    lines.push(
      line(
        `Total <strong>${check.outcome.total}</strong> — compare against the target's DB.` +
          (outcome.autoHit ? " Unmodified 20 always hits." : "") +
          (outcome.autoMiss ? " Unmodified 1 always misses." : "")
      )
    );
  }

  if (outcome.forgiven) {
    lines.push(
      line(
        `<strong>Weapon Supremacy</strong> — a miss by ${Math.abs(outcome.av)} with a Weapon Exemplar group is treated as a hit.`
      )
    );
  }

  if (outcome.critical) {
    const sevLabel = outcome.critical.severity.charAt(0).toUpperCase()
      + outcome.critical.severity.slice(1);
    lines.push(
      line(outcome.critical.injuryImmune
        // THE CARD SAYS WHICH HALF WAS IGNORED (3.548.0). A critical
        // that printed nothing about the immunity was indistinguishable
        // from a critical that had not been rolled — which is how the
        // lost bonus dice went unnoticed for as long as they did.
        ? `<strong>${sevLabel} critical</strong> — +${outcome.critical.bonusDice} bonus damage dice. <em>${critImmunity ?? "Immune"} — the injury roll is bypassed.</em>`
        : `<strong>${sevLabel} critical</strong> — +${outcome.critical.bonusDice} bonus damage dice, injury roll at ${outcome.critical.diceBias}.`)
    );
  }

  // Firing into melee: a miss by 1-4 may strike a nearby combatant instead.
  //
  // WHO IT HIT, KEPT (3.579.0). Until now this block printed a line and
  // stopped: "the attack instead strikes X" and then nothing happened to
  // X. Page 192 says the attack strikes them, so it deals its damage —
  // Graham's R2 of the block-19 audit: "Yes". The token is held here and
  // the damage is rolled below, down the same pipeline a hit takes, so a
  // stray arrow meets the bystander's DR, resistances and dying rules
  // exactly as an aimed one would.
  let strayStruckToken = null;
  const missBy = outcome.resolved && !outcome.hits ? -Number(check.outcome.margin) : null;
  if (isRanged && strayCandidates.length && missBy !== null && missBy >= 1 && missBy <= 4) {
    const rolls = [];
    // One roll per candidate; the candidate itself is not needed here
    // (resolveStrayShot takes the ids and the rolls, in order).
    for (const _candidate of strayCandidates) {
      const roll = await new Roll("1d20").evaluate();
      rolls.push(roll.total);
    }
    const stray = resolveStrayShot({
      missBy,
      candidateIds: strayCandidates.map((t) => t.id),
      rolls,
      tiebreak: Math.random()
    });
    if (stray.struck) {
      const struckToken = strayCandidates.find((t) => t.id === stray.targetId);
      strayStruckToken = struckToken ?? null;
      lines.push(
        line(
          `<strong>Stray shot!</strong> The attack instead strikes <strong>${struckToken?.name ?? "another combatant"}</strong> in the melee — damage is rolled against them (a stray shot is never a critical hit).`
        )
      );
    }
  }

  if (criticalDowngraded) {
    lines.push(line(`<em>${optionLabel || "Only one critical"}: this critical counts as an ordinary hit — no bonus dice and no injury.</em>`));
  }
  check.compact = true;
  check.compactSummary = compactSummary;
  check.extraDetailLines = lines;
  await check.toMessage();

  // Press the Advantage: "you inflict a critical hit" is a trigger the
  // system can see, so it prompts — right behind the attack card, before
  // the injury and damage dialogs take the screen.
  if (outcome.critical) {
    await maybePromptPressTheAdvantage(
      actor,
      `critical hit with ${weapon.name}${targetActor ? ` against ${targetActor.name}` : ""}`
    );
  }

  // THE PAIR DECIDES BEFORE ANYTHING LANDS (3.668.2). Double Slice rolls its
  // second Strike here, while this one waits; a fumble there makes this one
  // miss, before its injury, damage or grab are applied.
  let voidedByPair = false;
  if (typeof beforeDamage === "function") {
    const verdict = await beforeDamage({ outcome, check });
    if (verdict?.void && outcome.hits) {
      voidedByPair = true;
      outcome.hits = false;
      outcome.critical = null;
    }
  }
  check.voidedByPair = voidedByPair;
  check.criticalDowngraded = criticalDowngraded;

  let armourAmended = false;
  let locationArmoured = true;
  let hitLocation = null;
  // A STRIKE THAT ONLY GRABS (3.652.0; block 19 R4, the Giant Chameleon's
  // Tongue): a hit Grabs, and rolls neither injury nor damage. See
  // grab-only.mjs.
  const { isGrabOnly, grabOnlyLine } = await import("./grab-only.mjs");
  const grabOnly = isGrabOnly(weapon);
  if (grabOnly && outcome.hits && targetActor) {
    await applyConditionTags(targetActor, [{ key: "grabbed", label: "Grabbed" }], {});
    if (targetActor.setFlag) await targetActor.setFlag(SYSTEM_ID, "grabbedBy", { uuid: actor.uuid, name: actor.name, round: Number(game.combat?.round ?? 0) });
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card">${line(grabOnlyLine(actor.name, targetActor.name, weapon.name, Boolean(outcome.critical)))}</div>` });
  }
  // A STRIKE THAT ONLY LAYS A CONDITION (3.661.0; block 30 R2, the spiders'
  // Web): a hit lays it, and rolls neither injury nor damage.
  const { hitConditionOf, hitConditionLine } = await import("./grab-only.mjs");
  const hitCondition = hitConditionOf(weapon);
  if (hitCondition && outcome.hits && targetActor) {
    const { conditionLabel } = await import("../conditions/condition-rules.mjs");
    const label = conditionLabel(hitCondition.key);
    await applyConditionTags(targetActor, [{ key: hitCondition.key, label }], {});
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card">${line(hitConditionLine(actor.name, targetActor.name, weapon.name, label, Boolean(outcome.critical)))}</div>` });
  }
  // A STRIKE THAT CARRIES A SPELL (3.655.0; block 22 R5, Pixie Bow Casting):
  // a hit offers the archer's spells; one chosen lands instead of the arrow,
  // with no damage and no injury. See bow-casting.mjs.
  let spellCarried = false;
  if (!grabOnly && !hitCondition && outcome.hits && targetActor) {
    const { bowCastingFor } = await import("../bow-casting.mjs");
    const bowCast = bowCastingFor(Array.from(actor.items ?? []), weapon);
    if (bowCast) {
      const { castThroughStrike } = await import("../bow-casting-workflow.mjs");
      spellCarried = await castThroughStrike(actor, weapon, targetActor, bowCast, outcome.critical?.severity ?? null);
    }
  }
  const strikeLands = !grabOnly && !hitCondition && !spellCarried;
  // THE GRAB TRAIT (3.657.0; block 24 R6): a landed hit also Grabs, with the
  // same mark a Grapple writes, so Constrict and the grabbed-only gates read it.
  {
    const { hasGrabTrait, grabTraitLine } = await import("./grab-only.mjs");
    if (strikeLands && outcome.hits && targetActor && hasGrabTrait(weapon)) {
      await applyConditionTags(targetActor, [{ key: "grabbed", label: "Grabbed" }], {});
      if (targetActor.setFlag) await targetActor.setFlag(SYSTEM_ID, "grabbedBy", { uuid: actor.uuid, name: actor.name, round: Number(game.combat?.round ?? 0) });
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="trg-prime trg-check-card">${line(grabTraitLine(actor.name, targetActor.name, weapon.name))}</div>` });
    }
  }
  // THE INJURY IS WHAT THE IMMUNITY STOPS (3.548.0) — the bonus dice
  // above have already been counted, per Graham's ruling.
  // A CRITICAL REPLACEMENT (3.650.0; block 17 R8, Prankster's Cruelty): the
  // attacker may trade the injury for a lesser effect, asked before it rolls.
  // HELD (3.668.0): the hit is decided; its critical and damage wait.
  const held = Boolean(holdDamage) && strikeLands && outcome.hits && Boolean(targetActor);
  if (held) {
    const { heldStrikeRecord } = await import("./held-strike.mjs");
    const record = heldStrikeRecord({
      weaponId: weapon.id, weaponName: weapon.name, targetUuid: targetActor.uuid, targetName: targetActor.name,
      critical: outcome.critical?.severity ?? null, damageType: versatileDamageType || weaponData.damageType || "",
      label: optionLabel || "Held blow", combatId: game.combat?.id ?? "", round: Number(game.combat?.round ?? 0)
    });
    await actor.setFlag(SYSTEM_ID, "heldStrike", record);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card">${line(`<strong>${record.label}</strong>: the blow against <strong>${targetActor.name}</strong> is held${record.critical ? ` (a ${record.critical} critical)` : ""} — its critical and damage are rolled at the start of ${targetActor.name}'s turn.`)}</div>`
    });
  }
  let injuryReplaced = false;
  // A HELD BLOW (3.668.0) rolls no injury now: it lands with the damage.
  if (!held) {
    if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && targetActor && !noReactions) {
      const { offerCriticalReplacement } = await import("../creature-reactions-workflow.mjs");
      injuryReplaced = await offerCriticalReplacement(actor, weapon, targetActor);
    }
    if (strikeLands && outcome.critical && noCriticalInjury) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card">${line(`<em>${seriesLabel || "This series"}: only one critical injury — this critical's bonus damage dice count, but no injury is rolled.</em>`)}</div>`
      });
    }
    if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && !injuryReplaced && !noCriticalInjury) {
      const isMook = targetActor?.type === "npc" && Boolean(targetActor?.system?.gm?.isMook);
      if (isMook) {
        await rollQuickCrit(targetActor, {
          attacker: actor,
          weapon,
          severity: outcome.critical.severity,
          attackerIsSwarm: isSwarm(actor?.system),
          baseDamage: weaponData.damage || "1d6",
          damageType: versatileDamageType || weaponData.damageType || "slashing"
        });
      } else {
        const injuryResult = await rollCriticalInjury(actor, {
          targetActor,
          // VERSATILE (3.364.0). This read `weaponData.damageType` alone,
          // so a spear set to piercing for this attack dealt piercing
          // damage and then rolled its critical on the SLASHING injury
          // table. The mook quick-crit six lines above already honoured the
          // choice, and `versatileDamageType`'s own comment says it is
          // "used everywhere weaponData.damageType would otherwise be read
          // directly" — this was the one place that had been missed.
          //
          // Found while pinning Graham's ruling that a critical belongs to
          // the weapon's own damage: it does, and the weapon's own damage
          // for THIS attack is the type the player chose for it.
          damageType: versatileDamageType || weaponData.damageType || "slashing",
          severity: outcome.critical.severity,
          attackBonus: Number(system.combat?.attack?.total ?? 0),
          hasSerrated: /\bserrated\b/i.test(String(weaponData.traits ?? "")),
          // Ambush and Sniping are reactions to this critical; capture the
          // mechanical half of each one's trigger now, while the weapon and
          // range are still in hand. Ambush wants an Agile weapon; Sniping a
          // ranged weapon inside its first range increment. Distance uses
          // the effective (ammo-adjusted) increment, the same figure the
          // range-penalty and Penetrating paths above already use.
          weaponIsRanged: isRanged,
          weaponHasAgile: /\bagile\b/i.test(String(weaponData.traits ?? "")),
          withinFirstIncrement:
            isRanged &&
            withinFirstRangeIncrement(rangedDistance, effectiveRangeIncrement(weaponData, ammoSystem, { multiplier: rangeIncrementMultiplierOf(weapon, ammo, Number(game.time?.worldTime ?? 0)) })),
          weaponTraits: String(weaponData.traits ?? ""),
          // VORPAL is a rune rather than a trait, so the weapon itself is
          // handed over and `rollCriticalInjury` reads its runes.
          weapon
        });
        armourAmended = injuryResult.armourAmended;
        locationArmoured = injuryResult.locationArmoured;
        hitLocation = injuryResult.hitLocation;
      }
    }
  }

  // WHAT THE DAMAGE DID, kept so the reaction feats can ask. Cleave
  // needs to know the Strike dropped its target, and Armoured Counter
  // and Self Preservation need to know the defender actually took HP
  // damage — none of which `outcome` can answer, because it reports the
  // ATTACK and not its consequences.
  let damageOutcome = null;
  // EVERYTHING THE HIT DEALT THE TARGET (3.668.1): the weapon's packet, and
  // its runes' and riders' own, each announced as it is applied. Backswing
  // and Twin ask whether the Strike "inflicts damage"; a flaming blade whose
  // fire lands when DR stops the steel did.
  let hitDealt = 0;
  const hitDealtHook = targetActor && outcome.hits && strikeLands && !held
    ? Hooks.on("trgPrimeDamageApplied", ({ actor: hurt, amount } = {}) => {
      if (hurt && hurt.uuid === targetActor.uuid) hitDealt += Math.max(0, Number(amount) || 0);
    })
    : null;
  if (outcome.hits && strikeLands && !held) {
    // Precision Hunter's window is "the first time you DAMAGE your
    // hunted prey" — the marker burns here, on a hit that rolls
    // damage, not on the attempt.
    if (precisionDice) {
      await actor.setFlag(SYSTEM_ID, "precisionHunterUsed", true);
    }
    // A COMPOUND STRIKE'S FLAT DAMAGE AND ITS CRITICAL (3.640.0).
    const { compoundFlatDamage, steppedCriticalSeverity } = await import("./compound-action.mjs");
    const strikeCritical = outcome.critical?.severity ?? null;
    const boostedCritical = strikeCritical && criticalBoost?.severityUp ? steppedCriticalSeverity(strikeCritical, criticalBoost.severityUp) : strikeCritical;
    const flatExtra = compoundFlatDamage(extraFlatDamage, strikeCritical, criticalBoost);
    const flatLines = flatExtra ? [`+${flatExtra} damage (the action's${strikeCritical && criticalBoost ? `, doubled on the critical${boostedCritical !== strikeCritical ? ` — ${strikeCritical} raised to ${boostedCritical}` : ""}` : ""})`] : [];
    const ridersBurnt = ridersBurnUpdate(damageRiders, actor.getFlag?.(SYSTEM_ID, RIDERS_USED_FLAG) ?? {});
    if (ridersBurnt) await actor.setFlag(SYSTEM_ID, RIDERS_USED_FLAG, ridersBurnt);
    // CONDITIONALS SCOPED TO THE DAMAGE ROLL (3.626.1): the `auto` rows
    // taken, the rest asked, before the formula is built. See
    // combat/damage-conditionals.mjs for why this had never applied.
    const declaredDamage = await declaredDamageBonus(actor, weapon, {
      skipPrompt: skipDialog(event),
      // THE SAME FACTS THE ATTACK'S OWN CHECK CARRIES (3.668.0).
      context: {
        targetUuid: attackCheckConfig.targetUuid,
        targetTypes: attackCheckConfig.targetTypes,
        targetTraits: attackCheckConfig.targetTraits,
        attackMode: attackCheckConfig.attackMode,
        attackForm: attackCheckConfig.attackForm,
        attackGroup: attackCheckConfig.attackGroup,
        rangeBand: attackCheckConfig.rangeBand,
        targetStates: attackCheckConfig.targetStates
      }
    });
    // AMBUSH DICE ON THE HIT (3.668.0): asked when the cause needs a person
    // (never with Shift), then the extras (Ghost Blade's AR, Ambusher's
    // Patience's dice), and the once-per-round and once-per-creature marks.
    let ambushDice = 0; let ambushAR = 0; const ambushLines = [];
    if (ambush) {
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      let take = ambush.cause === "auto";
      if (!take && !skipDialog(event) && DialogV2) {
        take = Boolean(await DialogV2.confirm({
          window: { title: `${ambush.declared.label} — ${targetActor.name}` },
          content: `<p>Is <strong>${targetActor.name}</strong> flat-footed to you because of your own Stealth, Deception or ${ambush.declared.label} ability? Flanking alone does not count.</p>`,
          rejectClose: false
        }));
      }
      if (take) {
        const encounterKey = game.combat?.id ?? "";
        const ambushed = actor.getFlag?.(SYSTEM_ID, "ambushedCreatures") ?? {};
        const already = Boolean(encounterKey) && (ambushed[encounterKey] ?? []).includes(targetActor.uuid);
        const extras = ambushExtrasFor(declaredAmbushExtras(ambushCarriers), { level: actorLevel, undetected: ambush.undetected, alreadyAmbushed: already });
        let extraDice = extras.dice; let spendsCreature = extras.spendsCreature;
        for (const row of extras.asks) {
          if (skipDialog(event) || !DialogV2) continue;
          const yes = await DialogV2.confirm({
            window: { title: `${row.label} — ${targetActor.name}` },
            content: `<p>Had <strong>${targetActor.name}</strong> not detected you before this attack?</p>`,
            rejectClose: false
          });
          if (yes) { extraDice += Number(row.dice) || 0; extras.labels.push(`${row.label}: +${Number(row.dice)}d6`); if (row.oncePerCreature) spendsCreature = true; }
        }
        ambushDice = ambush.count + extraDice;
        ambushAR = extras.ar;
        ambushLines.push(...extras.labels);
        if (ambush.roundKey) await actor.setFlag(SYSTEM_ID, "ambushRound", ambush.roundKey);
        if (spendsCreature && encounterKey) {
          await actor.setFlag(SYSTEM_ID, "ambushedCreatures", { [encounterKey]: [...(ambushed[encounterKey] ?? []), targetActor.uuid] });
        }
      }
    }
    // ARMOUR RENDING BY DECLARATION (3.668.0; Inner Tempest's Challenge,
    // Oaths of Vengeance and Fealty, Distant Honour): scoped like a
    // conditional, against this Strike's facts. A one-shot (Retribution's
    // "+2 AR") is spent by the Strike it joined. See combat/declared-rending.mjs.
    const { declaredRending, declaredRendingRows } = await import("./declared-rending.mjs");
    const { scalingFor } = await import("../conditionals.mjs");
    const rending = declaredRending(
      declaredRendingRows([...Array.from(actor.items ?? []), ...Array.from(actor.appliedEffects ?? actor.effects ?? [])], scalingFor(actor)),
      {
        targetUuid: attackCheckConfig.targetUuid,
        targetTypes: attackCheckConfig.targetTypes,
        targetTraits: attackCheckConfig.targetTraits,
        attackMode: attackCheckConfig.attackMode,
        attackForm: attackCheckConfig.attackForm,
        attackGroup: attackCheckConfig.attackGroup,
        rangeBand: attackCheckConfig.rangeBand,
        targetStates: attackCheckConfig.targetStates
      }
    );
    for (const { sourceId } of rending.spent) await actor.effects?.get?.(sourceId)?.delete?.();
    damageOutcome = await resolveWeaponDamage(actor, weapon, {
      damageRiders,
      drWaived,
      seriesLabel,
      declaredRending: rending.total + ambushAR,
      declaredRendingLines: [...rending.lines, ...(ambushAR ? ambushLines.filter((l) => /: AR /.test(l)) : [])],
      // THE HIT PATH ONLY. The miss branch below is a Strike that did
      // not land; there is nothing for the mark to add to.
      deathMarkBonus: mark.damageBonus,
      declaredBonus: declaredDamage.bonus,
      declaredBonusLines: declaredDamage.lines,
      compoundFlat: flatExtra,
      compoundFlatLines: flatLines,
      critical: boostedCritical,
      glancing: Boolean(outcome.glancing),
      locationArmoured,
      armourAmended,
      hitLocation,
      distance: rangedDistance,
      // The gauntlet's damage type when metal bracers made this a gauntlet
      // attack (3.575.0) — `resolveWeaponDamage` reads the weapon's own.
      // Subdual from a Blunt Arrow chosen before the roll (3.576.0) wins.
      damageTypeOverride: subdualShot || shiftedSubdual ? "subdual"
        : versatileDamageType ?? (stoneFist || armouredFist.source ? weaponData.damageType : null),
      // FIST OF ROCK'S 1d6 (3.577.0): `resolveWeaponDamage` reads the
      // weapon's own die, which for the Unarmed Strike is 1d4.
      damageOverride: stoneFist?.damage ?? extraBaseDiceOverride(weaponData.damage, extraBaseDice + (brace?.extraDice ?? 0)),
      extraTypedDamage,
      sharedDamage,
      usedTwoHanded,
      spinBonus: spinCarried,
      ammo: ammoSystem,
      ammoName: ammo?.name ?? "",
      ammoCoat: oilCoatOf(ammo),
      powerAttack: powerAttack && !isRanged,
      sneakDice,
      precisionDice: precisionDice + compoundPrecision + ambushDice,
      // EACH SOURCE NAMED (3.663.3; found in the block 34 live test): Pack
      // Attack's die was printed as "Precision Hunter — first damage against
      // your hunted prey", the only label the card had for precision dice.
      precisionParts: [
        precisionDice ? { dice: precisionDice, label: "Precision Hunter", why: "first damage against your hunted prey this round" } : null,
        Math.max(0, Math.floor(Number(extraPrecisionDice) || 0)) ? { dice: Math.max(0, Math.floor(Number(extraPrecisionDice) || 0)), label: "The action", why: "its own precision dice" } : null,
        packDice ? { dice: packDice, label: "Pack Attack", why: "the target is within reach of at least two of its allies" } : null,
        ambushDice ? { dice: ambushDice, label: ambush.declared.label, why: `flat-footed to you${ambushLines.some((l) => /d6/.test(l)) ? `; ${ambushLines.filter((l) => /d6/.test(l)).join(", ")}` : ""}` } : null
      ].filter(Boolean),
      // THE BIGGER THEY ARE (3.377.0) needs the target's size, and this
      // damage function had no target reference at all — the only thing
      // standing between the feat and the formula. Passed as the SIZE
      // rather than the actor, because the size is all the rule wants and
      // handing the damage step a whole actor invites the next rule to
      // reach for something else on it.
      targetSize: targetActor?.system?.identity?.size ?? null,
      // VIBRANT THORNS (3.440.0) needs to know whether the blow was
      // struck from ADJACENT, and `distance` above carries only the
      // ranged one. Passed as the measured number rather than the
      // tokens, for the reason the size line above gives: hand the
      // damage step the fact the rule wants and nothing else.
      meleeDistance: isRanged ? null : distanceToTarget
    });
    // AMBUSH DEALT (3.668.0): announced after the damage, for what follows
    // it — Inner Tempest's Vanishing Retreat ("Trigger: you inflict Unseen
    // Assault damage against a creature").
    if (ambushDice > 0 && targetActor) {
      Hooks.callAll("trgPrimeAmbushDealt", { actor, target: targetActor, weapon, dice: ambushDice, label: ambush.declared.label });
    }
  } else if (strayStruckToken) {
    // THE STRAY SHOT LANDS (3.579.0; page 192, Graham's R2). The same
    // damage step a hit takes, aimed at the bystander instead:
    // `targetTokenOverride` is what makes every defence below — DR,
    // resistance, weakness, the dying pipeline — read THEIR sheet.
    //
    // WHAT IT DOES NOT CARRY, and why:
    //   - no critical, which page 192 says outright and the card repeats;
    //   - no Sneak Attack or Precision Hunter dice, which are bought with
    //     a condition on the creature you aimed at (flat-footed, flanked,
    //     hunted prey) and cannot follow the arrow to someone else;
    //   - no declared riders, which are spent on the Strike below whether
    //     it landed or not, exactly as they are on any other miss.
    damageOutcome = await resolveWeaponDamage(actor, weapon, {
      critical: null,
      glancing: false,
      locationArmoured: true,
      armourAmended: false,
      hitLocation: null,
      distance: rangedDistance,
      damageTypeOverride: subdualShot || shiftedSubdual ? "subdual" : versatileDamageType ?? null,
      usedTwoHanded,
      spinBonus: spinCarried,
      ammo: ammoSystem,
      ammoName: ammo?.name ?? "",
      ammoCoat: oilCoatOf(ammo),
      powerAttack: false,
      targetSize: strayStruckToken.actor?.system?.identity?.size ?? null,
      meleeDistance: null,
      targetTokenOverride: strayStruckToken
    });
  }
  if (hitDealtHook !== null) Hooks.off("trgPrimeDamageApplied", hitDealtHook);

  /*
   * A BLOW THAT WEARS A SPELL DOWN (3.608.0, R8). Stoneskin: "Each time you
   * are hit by a physical attack, the duration of the spell decreases by 1
   * minute." Asked of whoever the damage step actually struck — the aimed
   * target on a hit, the bystander on a stray shot — with the type it dealt.
   * See magic/wearing-clock.mjs.
   */
  if (damageOutcome?.targetActor) {
    const { wearOnHit } = await import("../magic/wearing-clock-workflow.mjs");
    await wearOnHit(damageOutcome.targetActor, damageOutcome.damageType);
  }

  // DR STOPPED THE CRITICAL (3.579.0; page 192, Graham's R5).
  //
  // WHY THIS IS A BUTTON AND NOT A SILENT SWAP. The injury table is
  // rolled BEFORE the damage — it has to be, because the row decides the
  // hit location, the location decides whether equipped armour's DR
  // applies at all, and that decides the damage. So by the time the
  // sentence's condition can be tested, the normal critical has already
  // been rolled and its conditions applied. Rolling a second injury on
  // top would apply two. The card says what the rule says and offers the
  // one click that re-reads the SAME number on the Subdual table; the GM
  // drops what the first one applied.
  //
  // The record comes from `lastCriticalInjury`, written by the injury
  // roll moments ago, so the subdual read uses the same result — not a
  // fresh roll on a different table, which would be a second critical.
  if (damageOutcome?.drStoppedCritical && targetActor) {
    const record = actor.getFlag?.(SYSTEM_ID, "lastCriticalInjury") ?? null;
    if (record && String(record.damageType) !== "subdual" && record.round === (game.combat?.round ?? null)) {
      await postCard(actor, "Critical becomes Subdual", [
        line("<strong>DR reduced the critical's damage to zero.</strong> Page 192: "
          + `${targetActor.name} takes a <strong>subdual critical</strong> instead of the normal type.`),
        line(`<em>Re-reads the same injury result (${record.result}) on the Subdual table. `
          + "Remove whatever the first critical applied.</em>"),
        line('<button type="button" data-action="subdualCritical" style="width:100%">'
          + `Roll ${record.result} on the Subdual table</button>`)
      ], [], {
        flags: {
          [SYSTEM_ID]: {
            subdualCritical: {
              actorHandle: actorHandle(actor, actor.token ?? actor.getActiveTokens?.()?.[0] ?? null),
              targetHandle: actorHandle(
                targetActor, targetActor?.token ?? targetActor?.getActiveTokens?.()?.[0] ?? null),
              record: {
                severity: record.severity,
                attackBonus: record.attackBonus,
                hasSerrated: record.hasSerrated,
                result: record.result
              },
              applied: false
            }
          }
        }
      });
    }
  }

  // A COATED WEAPON'S FIRST HIT DELIVERS ITS POISON (3.578.0; the
  // block-18 audit's R1 and R2). After the damage, so the exposure save's
  // cards follow the ones reporting the blow that carried it in.
  // A STRAY SHOT CARRIES IT TOO (3.579.0): the blow landed, on somebody
  // else, and an injury poison is delivered by the blow.
  const poisonedTarget = outcome.hits ? targetActor : (strayStruckToken?.actor ?? null);
  if (poisonedTarget && weapon?.getFlag?.(SYSTEM_ID, POISON_COAT_FLAG)) {
    const { deliverWeaponPoison } = await import("../poison-workflow.mjs");
    await deliverWeaponPoison(actor, weapon, poisonedTarget);
  }

  // A MISS STILL SPENDS THE ARROW. `strike-riders.mjs` records the
  // ruling: a once-rider is spent when the Strike RESOLVES, which is
  // exactly what Spoil The Profane says ("make a Strike") and the
  // conservative reading of Arrow Of The Wild Hunt, whose book text
  // conditions only the DAMAGE on a hit.
  //
  // ON A HIT THIS FINDS NOTHING, because the damage step above has
  // already spent them and printed the line on the card that reported
  // the damage. So this is the miss path in practice, and it posts its
  // own line only when there was something to spend — the attack card
  // has already gone to chat by the time damage is rolled, so there is
  // no `lines` array left to push to.
  const spentOnMiss = await spendStrikeRiders(actor, weapon, { hit: false });
  if (spentOnMiss.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card">${spentOnMiss.map((l) => line(l)).join("")}</div>`
    });
  }

  // A CONFIRMED fumble, kept so the caller can see it. `outcome` reports
  // only the RISK of one — the check that turns a risk into a fumble is
  // rolled below — and Double Slice's "if either attack fumbles" needs
  // the confirmed answer, not the risk.
  let confirmedFumble = false;
  // ONE SWING FUMBLES ONCE (3.649.1; found live on Lightning Strike, 15
  // October 2026). A shared strike's later creatures meet the first's die, so
  // an unmodified 1 is the same 1: its fumble check and table were rolled on
  // the first creature, and are not rolled again for each one after it.
  if (outcome.fumbleRisk && !presetDice) {
    // CONFIRMED ALREADY (3.669.0) when Fortune's Reversal was asked and
    // declined: the fumble check is not rolled twice.
    const fumbled = await rollFumbleCheck(actor, weapon, { dcHalved: outcome.fumbleDcHalved, weaponData, thrown: thrownAttack, confirmed: fumbleConfirmedEarly });
    confirmedFumble = Boolean(fumbled);

    // SAVAGE JAW (Creature Codex, Chapter 3): "Trigger an enemy fumbles
    // against you whilst your shield is equipped."
    //
    // A CONFIRMED fumble, not the risk of one. rollFumbleCheck returns
    // the fumble table's row when the fumble actually happened and null
    // when it was averted — by passing the UM-1 check, or by a Crusader
    // spending Devotion. "An enemy fumbles against you" is the fumble,
    // not the unmodified 1 that threatened it, and offering the
    // counterattack on an averted fumble would be handing the defender a
    // Reaction the trigger never fired for.
    //
    // OFFERED ON THE DEFENDER'S OWN CARD, not rolled: what follows is
    // their Attack Check, their melee bonus and their Reaction.
    if (fumbled && targetActor && !isRanged) {
      // REACTIVE DISARM (Creature Codex; 3.631.0): "Reaction; Frequency
      // 1/rnd; Trigger A target fumbles a weapon Strike against the
      // creature. The creature attempts a disarm attempt … not subject to
      // multiple attack penalty." A button on the defender's card, the way
      // every reaction feat is offered (Graham, 21 August 2026).
      const { offerReactiveDisarm } = await import("./reactive-disarm-workflow.mjs");
      if (!noReactions) await offerReactiveDisarm(targetActor, actor, weapon);
      const jaw = noReactions ? null : savageJawOffer(Array.from(targetActor.items ?? []), { melee: true });
      if (jaw) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: targetActor }),
          content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${targetActor.name}</span><h3>${jaw.item.name} — Savage Jaw</h3></div></header>${
            line(`<strong>${actor.name} fumbled.</strong> Your Reaction is available: an Attack Check against ${actor.name} at your usual melee attack bonus.`)
          }${
            line(`On a hit, <strong>${jaw.damage} ${jaw.damageType}</strong> damage plus your ability modifier.`)
          }</div>`
        });
      }
    }
  }

  // A MISS THE DEFENDER MAY ANSWER BY MOVING (3.650.0; block 17 R7,
  // Gleam-Dart Escape): offered on its own card, as every reaction is.
  // OUTSIDE THE FUMBLE BRANCH (3.650.1, found live): 3.650.0 put it beside
  // Reactive Disarm, inside `if (outcome.fumbleRisk …)`, so only a miss on
  // an unmodified 1 ever offered it.
  if (outcome.resolved && !outcome.hits && targetActor && !noReactions) {
    const { offerMissedReactions } = await import("../creature-reactions-workflow.mjs");
    await offerMissedReactions(targetActor, actor).catch(() => []);
  }

  // Attack of Opportunity (Chapter 4): making a ranged attack while within
  // an enemy's reach provokes. Detection only, fired after the attack
  // resolves; an AoO strike (isReaction) never provokes further. Detached
  // and defensive so it can never disturb the attack itself.
  if (isRanged && !isReaction && game.combat?.started) {
    import("./opportunity.mjs")
      .then((m) => m.detectStationaryAoO(actor, "ranged"))
      .catch(() => {});
  }

  // THE THIRTEEN REACTION FEATS (Chapter 5). One call, five triggers:
  // a Strike that dropped somebody (Cleave), an attack action taken at
  // all (Allied Strike), a defender who took damage (Armoured Counter,
  // Self Preservation), an ally who was hit near somebody (Chance of
  // Redemption, Strike of Retribution, Guardian Defence), and a
  // confirmed fumble (both Ripostes).
  //
  // FIRE AND FORGET, like the AoO detection above it. A reaction offer
  // must never be able to disturb the attack that provoked it — an
  // exception thrown while building a card would otherwise roll back a
  // resolved swing, which is far worse than a missing button.
  if (!isReaction && game.combat?.started) {
    import("./reaction-feat-detection.mjs")
      .then((m) => m.detectAttackReactions({
        actor, attackerToken, targetActor, targetToken, outcome,
        confirmedFumble, damageOutcome, check
      }))
      .catch(() => {});
  }

  // THE ATTACK'S OWN OUTCOME, not just the check's degree. Double Slice
  // has to know whether each swing hit, critted or fumbled in order to
  // apply "you can only inflict one critical" and "if either attack
  // fumbles, then the other attack automatically misses" — and the check
  // object alone cannot answer that. Attached rather than returned
  // separately so every existing caller is untouched.
  check.attackOutcome = outcome;
  check.attackFumbled = confirmedFumble;
  // WHAT THE HIT DEALT THE TARGET (3.668.1), after its defences: 0 for a
  // miss, a held blow, or damage that went to a bystander. Double Slice
  // reads it for Twin and Backswing.
  const hitTaken = outcome?.hits && strikeLands && !held ? Math.max(Number(damageOutcome?.taken ?? 0) || 0, hitDealt) : 0;
  check.damageTaken = hitTaken;
  check.damageType = hitTaken ? String(damageOutcome?.damageType ?? weaponData.damageType ?? "") : "";
  // BACKSWING (3.668.1; Inner Tempest, Chapter 6): "Your multiple attack
  // penalty is only considered after a successful attack (one that inflicts
  // damage)." The count this Strike added is taken back. Focused Strike's
  // roll-back above is the same step; the two together take it back once.
  if (backswingRefund({
    weaponSystem: weaponData, isReaction, offTurn, mapFrozen,
    resolved: Boolean(outcome?.resolved), hits: Boolean(outcome?.hits) && strikeLands, held, damageTaken: hitTaken
  })) {
    await setSharedMapCount(actor, attackIndex);
    await postCard(actor, `${weapon.name} — Backswing`, [
      line(`No damage inflicted: this Strike does not count towards ${actor.name}'s multiple attack penalty.`)
    ]);
  }
  // A DEFENCE THAT LASTED THIS ATTACK (3.666.0): Nimble Dodge, Evade,
  // Impact Absorption — declared when targeted, spent by the attack they
  // answered, damage included. See one-attack.mjs.
  if (targetActor) {
    const { consumeOneAttackEffects } = await import("./target-relay-workflow.mjs");
    await consumeOneAttackEffects(targetActor, { kind: "weapon", attackerUuid: actor?.uuid ?? "" });
  }
  // A STRIKE RESOLVED (3.668.0): announced once the hit, the critical and
  // the damage are settled, with what happened. `trgPrimeStrikeRolled` is
  // too early for "on a hit" and "when it misses you": Inner Tempest's Flow
  // Strike, Steel Viper, Echoing Crane, Form Reversal and Shadow Counter
  // listen here. `held` is Black Lotus's blow, not yet landed.
  if (targetActor) {
    Hooks.callAll("trgPrimeStrikeResolved", {
      attacker: actor, target: targetActor, weapon,
      hits: Boolean(outcome?.hits) && strikeLands, critical: outcome?.critical?.severity ?? null,
      melee: !isRanged, thrown: Boolean(thrownByDistance) || String(weaponData.attackMode ?? "").trim().toLowerCase() === "thrown",
      isReaction: Boolean(isReaction), mapFrozen: Boolean(mapFrozen), optionLabel: String(optionLabel ?? ""),
      held: Boolean(held), damageTaken: Number(damageOutcome?.taken ?? 0) || 0,
      // THE ATTACK MISSED (3.670.0, found in review): resolved, and not a
      // hit. `hits` is false too for an attack never resolved and for a hit
      // that lands nothing (a grab, a carried spell), and neither is a miss
      // to answer (Snake Stance, Waiting Blade), as offerMissedReactions reads it.
      resolved: Boolean(outcome?.resolved), missed: Boolean(outcome?.resolved) && !outcome?.hits,
      // THE TARGET MAY NOT REACT TO THIS STRIKE (3.671.0; Drawn Verdict). A
      // module's reaction to it (Snake Stance, Waiting Blade) is not offered.
      noReactions: Boolean(noReactions)
    });
  }
  return check;
}

/**
 * Roll a critical injury on the table for a damage type.
 * Exported so spells and abilities can call it directly ("takes a Minor Fire
 * Critical") with an explicit severity or modifier.
 */
/*
 * A CRITICAL INJURY IS THE WORSE HALF OF PAGE 238 (3.584.0).
 *
 * "If you are struck for a critical whilst casting a spell your spell
 * casting check is automatically a fumble." The hit-point hook in
 * `pending-cast-workflow` catches every ordinary hit and calls it a
 * failure; only this function knows that a hit was a CRITICAL, and the
 * difference is a trip to the Spell Failure Table and the whole PP
 * rather than half of it.
 *
 * ONE LINE, AT THE ONE PLACE CRITICALS ARE APPLIED — rather than a
 * second detector trying to infer a critical from an effect appearing
 * beside a hit point change.
 */
export async function rollCriticalInjury(
  actor,
  {
    targetActor = null,
    damageType,
    severity,
    attackBonus = 0,
    modifier = 0,
    hasSerrated = false,
    // The mechanical half of Ambush's and Sniping's triggers, remembered
    // alongside the injury so each reaction can test its own before
    // anything is spent. Default to a non-triggering melee crit so a crit
    // rolled directly by a spell or ability (which passes none of these)
    // can be Ambushed/Sniped off — which it can't, and shouldn't.
    weaponIsRanged = false,
    weaponHasAgile = false,
    withinFirstIncrement = false,
    // The full trait line of the weapon that scored the critical, for
    // Killer's Edge's agile-or-finesse test. Spell and ability crits
    // pass nothing and get no adjustment buttons, correctly.
    weaponTraits = "",
    // Ambush and Sniping let a player shift the injury roll they already
    // made. Re-reading the table at a different number must not re-roll
    // the dice, so the result can be supplied instead of drawn — every
    // step after it (row lookup, persistence, conditions, saves, armour
    // damage) then runs exactly as it did the first time.
    forcedResult = null,
    // VORPAL (Creature Codex, Chapter 3) needs the WEAPON, not a
    // pre-resolved rune. This function already derives what it needs
    // from the weapon that scored the critical — `weaponTraits` is here
    // for Killer's Edge — and resolving the rune inside means a caller
    // cannot hand over a weapon and forget its runes. Null for a fall or
    // a spell, neither of which has a weapon at all.
    weapon = null,
    /*
     * WHAT SPELL SCORED THIS, WHEN A SPELL DID (3.585.0, page 245).
     *
     * "whenever you roll a 66 on a Spell Fumble OR A SPELL CRITICAL
     * INJURY RESULT, you invoke a Resonance Event."
     *
     * TWO TRIGGERS ARE PRINTED AND ONLY ONE EXISTED. The fumble's 66 has
     * fired a resonance event since the table was transcribed; this half
     * was absent outright — `attack-workflow.mjs` contained the word
     * "resonance" nowhere at all, so a spell's critical injury rolling
     * 66 did the ordinary combat-chaos thing and nothing more.
     *
     * It is the SPELL that decides, not the injury: the same 66 from a
     * greatsword invokes nothing. So the marker travels from the caller
     * that knows, carrying the resonance modifiers with it (PP, trait,
     * tradition) rather than a bare boolean — the Resonance Modifiers
     * table wants all three, and a caller that has to remember to send
     * them separately is a caller that will one day forget.
     */
    spellResonance = null,
    /*
     * ARMOUR THE TABLE READS STRAIGHT THROUGH (3.608.0, R3). Sonic Bolt
     * "bypasses light armour when reading the critical result". A list of
     * lower-case categories; pieces of those weights are left out of the
     * struck location's armour, so a jerkin collects the unarmoured row.
     * Empty for every other critical in the game.
     */
    armourBypass = [],
    armourBypassSource = ""
  }
) {
  // No `weapon ? ... : null` guard: `vorpalOn` already answers null for
  // nothing at all, and a second gate in front of a working one is a
  // line no mutation can contradict — the sixth of that shape these
  // runes have produced. Q1c is the check that a critical with no weapon
  // (a fall, a spell) still reads the row it rolled.
  // Page 238's worse half, before the table is even read: whoever is
  // taking this injury stops casting, and it is a fumble not a failure.
  {
    const struck = targetActor ?? actor;
    const { interruptPendingCast } = await import("../magic/pending-cast-workflow.mjs");
    await interruptPendingCast(struck, { criticalSeverity: severity ?? "minor" });
  }

  const vorpal = vorpalOn(weapon);
  const table = CRITICAL_TABLES[damageType] ?? CRITICAL_TABLES.slashing;
  // WHICH TABLE WAS READ, by name, for the recurring type (3.609.0). See
  // typeRecurringTags in critical-riders.mjs.
  const tableKey = CRITICAL_TABLES[damageType] ? damageType : "slashing";
  const bias =
    severity === "deadly"
      ? "advantage"
      : severity === "minor"
        ? "disadvantage"
        : "normal";

  const rolls = [];
  const draw = async (faces) => {
    const roll = await new Roll(`1d${faces}`).evaluate();
    rolls.push(roll);
    return roll.total;
  };

  const forced = forcedResult === null ? null : Math.max(1, Math.min(100, Math.trunc(Number(forcedResult) || 0)));
  const percentile = forced === null
    ? await rollPercentile({
        drawTen: async () => (await draw(10)) % 10,
        drawUnit: async () => (await draw(10)) % 10,
        bias
      })
    // THE INVERSE OF THE ZERO RULE, and it used to be wrong here.
    // Ambush and Sniping shift a critical to a different row and feed
    // the new number back through as a forced result, which then has to
    // be taken apart into digits again because the units one decides the
    // hit location. `Math.floor(forced / 10)` answers TEN for a forced
    // 100 — a tens digit of ten, printed on the card. See
    // percentileDigits: 100 is the pair 00, the same pair that rolled it.
    : { value: forced, ...percentileDigits(forced), drawn: null, swapped: false };

  // Hit location (Chapter 7): the units die of the injury roll
  // determines which body location was struck, and armour only
  // reduces damage from a critical if it actually covers that
  // location — replacing the old "does the target have any armour
  // at all" approximation with the real, location-specific answer.
  const hitLocation = hitLocationFromUnitDie(percentile.unit);
  // WHAT covers the struck location, not merely WHETHER (3.580.0, R6/R7):
  // the tables address metal and rigid armour separately, and a leather
  // jerkin used to collect results the book reserves for plate.
  const { itemsSeenByCritical, armourBypassLine } = await import("../magic/attack-riders.mjs");
  const seenItems = itemsSeenByCritical(Array.from(targetActor?.items ?? []), armourBypass);
  // MAGE ARMOUR AND BRACERS COVER EVERY LOCATION (3.617.4, Graham's Q1 of
  // the 3.617.3 drive): laid over the worn pieces here, so the table, the
  // amendment and the damage step's DR bypass all read one answer. Mage
  // Armour's CL 10 rigidity rides on it (MA4: while it has HP).
  const targetArmour = targetActor
    ? withWholeBodyArmour(armourAtLocation(seenItems, hitLocation), targetActor.system)
    : { armoured: false, rigid: false, metal: false, coveredBy: "" };
  const targetArmoured = targetArmour.armoured;

  const lines = [];
  // SAID WHEN IT MATTERED: only a bypassed piece that covers the struck
  // location changed what the table reads.
  if (targetActor && armourBypass?.length) {
    const ignored = Array.from(targetActor.items ?? [])
      .filter((i) => !seenItems.includes(i) && i.type === "armour" && i.system?.equipped
        && armourPieceCoversLocation(i, hitLocation))
      .map((i) => i.name);
    if (ignored.length) lines.push(line(armourBypassLine(armourBypassSource, armourBypass, ignored)));
  }
  let result = percentile.value + Number(modifier || 0);
  /** Chaos's fumble roll, when Chaos happened; see `rollChaosFumble`. */
  let chaosFumble = null;

  /*
   * A SPELL'S 66 INVOKES A RESONANCE EVENT (page 245), and it does so
   * INDEPENDENTLY OF THE CHAOS SETTING below.
   *
   * The two rules share a number and nothing else. Chaos is the general
   * combat rule, optional at the GM's table and switched by
   * `chaosResults`. Resonance is Chapter 9's, printed without any such
   * option, and it is about the weave rather than the blow. Folding this
   * into the chaos branch would have made a Chapter 9 rule vanish for
   * every table that turned chaos off.
   *
   * ON THE UNMODIFIED FACE, like chaos: the page says "roll a 66", and
   * every other 66 rule in this system reads the die rather than the
   * total.
   */
  if (percentile.value === CRITICAL_CHAOS_FACE && spellResonance) {
    const { rollResonanceEvent } = await import("../magic/cast-workflow.mjs");
    await rollResonanceEvent(actor, {
      reason: "Spell critical injury — 66",
      modifiers: spellResonance
    });
  }

  // Chaos: an unmodified 66 on the injury roll.
  if (percentile.value === CRITICAL_CHAOS_FACE && setting("chaosResults", false)) {
    const chaos = criticalChaosReplacement(await draw(30));
    result = chaos.result;
    await awardConviction(actor, chaos.conviction);
    // ROLLED HERE, APPLIED BELOW (3.580.0, R10). The roll is made now so
    // its number is on the card beside the Chaos line that called for it;
    // the "1 on the fumble" consequence needs the ROW the injury lands on,
    // which is not looked up for another forty lines.
    chaosFumble = await rollChaosFumble(actor, weapon);
    rolls.push(chaosFumble.rollObject);
    lines.push(
      line(
        `<strong>Chaos!</strong> The injury roll becomes ${result}, and regain 1 Conviction. `
        + `Fumble table (${chaosFumble.category}): <strong>${chaosFumble.roll}</strong> — `
        + `<em>${chaosFumble.row.effect}</em>`
      )
    );
  }

  // VORPAL: "the result of the injury is always increased to the next
  // available head result", and then to the severity's minimum.
  //
  // APPLIED AFTER THE MODIFIER AND AFTER CHAOS, to whatever the result
  // now is. "Always increased" is unqualified, and Chaos replaces the
  // result rather than the roll — a Chaos result that then went to the
  // head is stranger to read than one that did not, but it is what the
  // sentence says, and the alternative is Chaos silently cancelling a
  // rune the wielder paid 60,000 gp for.
  //
  // BEFORE THE ROW IS READ, which is the whole point: the table is
  // consulted once, at the modified number, so persistence, conditions,
  // armour and the death saves all follow from the head result rather
  // than from the roll it replaced.
  let vorpalLine = "";
  if (vorpal && forced === null) {
    const raised = vorpalInjuryResult({ roll: result, severity });
    if (raised.result !== result) {
      vorpalLine = `<strong>Vorpal:</strong> ${result} → <strong>${raised.result}</strong>`
        + ` (${raised.rolledHead ? "already a head result, so the next one" : `next head result ${raised.head}`}`
        + `${raised.result === raised.minimum && raised.minimum > raised.head
          ? `, then the ${severity} minimum of ${raised.minimum}` : ""}).`;
      result = raised.result;
    }
    if (vorpal.mismatch) {
      vorpalLine += `${vorpalLine ? " " : ""}<em>${vorpal.mismatch}</em>`;
    }
  }

  // A CRITICAL INJURY OVER 90 REGAINS 1 LUCK (3.624.0, block 40's R15):
  // "If you take a critical injury with a modified result of higher than 90
  // you regain a 1 luck." The one who TAKES it; once, on the roll itself —
  // an Ambush or Sniping re-read (a forced result) is the same injury.
  if (forced === null) {
    const { regainLuckFromInjury } = await import("../luck-workflow.mjs");
    const regained = await regainLuckFromInjury(targetActor ?? actor, result);
    if (regained) lines.push(line(regained));
  }

  let row = lookupTableRow(table, result);

  /*
   * "IF TARGET HAS NO ARMOUR USE '69' RESULT INSTEAD" (Bludgeoning 67-68;
   * Graham's R15 of 21 September 2026: "All").
   *
   * The row is telling the reader which row to read, so it is applied
   * rather than offered. Read BEFORE persistence, conditions, the armour
   * clause and the Death/Fatal test, so every one of them follows from
   * the row actually in force rather than the one that pointed at it.
   */
  const alternate = criticalRowRiders(row).alternateResult;
  if (alternate !== null && !targetArmoured) {
    const replacement = lookupTableRow(table, alternate);
    if (replacement && replacement !== row) {
      lines.push(line(
        `<strong>No armour there</strong> — the row sends the result to `
        + `<strong>${alternate}</strong> instead (page 206).`));
      result = alternate;
      row = replacement;
    }
  }

  const typeLabel = DAMAGE_TYPES[damageType]?.label ?? damageType;

  if (vorpalLine) lines.unshift(line(vorpalLine));
  lines.unshift(
    line(
      `Hit location: <strong>${HIT_LOCATION_LABELS[hitLocation]}</strong>${targetArmoured ? ` (armoured${targetArmour.coveredBy ? ` by ${targetArmour.coveredBy}` : ""})` : ""}.`
    )
  );
  lines.unshift(
    line(
      forced === null
        ? `Rolled <strong>${percentile.value}</strong>${modifier ? ` ${modifier > 0 ? "+" : ""}${modifier} = ${result}` : ""} (${severity}, ${bias}) on the ${typeLabel} table.`
        : `Result modified to <strong>${percentile.value}</strong> on the ${typeLabel} table.`
    )
  );

  // Remembered so Ambush and Sniping have something to modify. Stored on
  // the attacker, since they are the one taking the reaction.
  if (forced === null) {
    await actor.setFlag(SYSTEM_ID, "lastCriticalInjury", {
      damageType,
      severity,
      attackBonus,
      hasSerrated,
      result,
      round: game.combat?.round ?? null,
      // Which creature the critical was against, and the weapon facts each
      // reaction's trigger turns on. The forced re-read path never reaches
      // here, so a shifted roll can't overwrite these with a melee default.
      targetActorId: targetActor?.id ?? null,
      // AND THE UUID, WHICH IS THE ONLY PRECISE HANDLE (3.468.0).
      //
      // An UNLINKED token has a SYNTHETIC actor whose `id` is the base
      // actor's, so `game.actors.get(targetActorId)` returns the sheet in
      // the sidebar rather than the creature on the map. Driving War Cry
      // proved it: the card read "6 sonic to ZZ Undead Foe", the base
      // actor fell to 24/30, and the token actually hit stayed at 27/30.
      // Most NPCs are unlinked, so that was most NPCs — and the card
      // names the right creature either way, so nothing showed it.
      //
      // A synthetic actor's uuid carries its Scene and Token
      // ("Scene.x.Token.y.Actor.z"), so it names the creature struck and
      // not merely its species. `targetActorId` stays for the reactions
      // that were reading it before this field existed.
      targetActorUuid: targetActor?.uuid ?? null,
      weaponIsRanged,
      weaponHasAgile,
      withinFirstRangeIncrement: withinFirstIncrement
    });
  } else {
    // A shifted re-read (Killer's Edge, Ambush, Sniping) becomes the
    // CURRENT result — only the result field, so the weapon facts the
    // forced path never receives aren't clobbered with melee defaults.
    // This is what makes the adjustments genuinely stack: a later
    // Ambush measures its allowance from where Killer's Edge left the
    // roll, not from the original number.
    await actor.update({
      [`flags.${SYSTEM_ID}.lastCriticalInjury.result`]: result
    });
  }
  lines.push(line(`<em>${row.effect}</em>`));

  // THE PERSISTENCE THIS TARGET ACTUALLY GETS (3.580.0, R9). An armour
  // clause may rewrite the column rather than the conditions —
  // Bludgeoning 41-43, "Metal Armoured: Persistence becomes D", broken
  // fingers inside a gauntlet healing on a timer instead of staying
  // Until Healed. The clause was read only for conditions before this,
  // so the row stayed UH whatever the target was wearing.
  const persistence = effectivePersistence(row, targetArmour);
  const persistenceInfo = computePersistenceRounds(persistence, severity);
  let expiresRound = null;
  if (persistence === "D") {
    const durationRoll = persistenceInfo.rollFormula
      ? await new Roll(persistenceInfo.rollFormula).evaluate()
      : null;
    if (durationRoll) {
      rolls.push(durationRoll);
      expiresRound = (game.combat?.round ?? 0) + durationRoll.total;
      lines.push(
        line(
          `Persistence: <strong>Duration</strong> — lasts <strong>${durationRoll.total} rounds</strong> (${persistenceInfo.rollFormula}).`
        )
      );
    } else {
      lines.push(line("Persistence: <strong>Duration</strong>"));
    }
  } else if (persistenceInfo.autoExpires) {
    expiresRound = (game.combat?.round ?? 0) + persistenceInfo.rounds;
    lines.push(line("Persistence: <strong>Minimal Effect</strong> — lasts until the end of your next turn."));
  } else if (persistence && persistence !== "-") {
    lines.push(line(`Persistence: <strong>${persistence}</strong>`));
  }

  /*
   * INDESTRUCTIBLE NEGATES THE RESULT, NOT JUST THE ARMOUR'S DAMAGE (3.615.0,
   * Graham's R8 of block 36). "Armour inscribed with this rune completely
   * negates a critical injury result that would normally be reduced by it."
   * The rune used to be read only in the damage step, after this function
   * had already put the result's conditions on the target — so the card
   * said "negated completely" over an injury that had landed. Asked here,
   * where the armour's amendment is known, and before anything is applied:
   * the piece covering the struck location, carrying the rune, and an
   * amendment that applies.
   */
  const indestructiblePiece = targetActor && criticalAmendmentApplies(row, targetArmour)
    ? seenItems.find((item) => item.type === "armour" && item.system?.equipped
      && (!hitLocation || armourPieceCoversLocation(item, hitLocation))
      && equippedEventRune([item], "indestructible"))
    : null;
  const armourClause = selectArmourClause(row, targetArmour);
  if (armourClause) {
    const label = { metal: "Metal armoured", rigid: "Rigid armoured", unarmoured: "Unarmoured" }[armourClause.kind]
      ?? "Armoured";
    lines.push(
      line(
        `<strong>${label} target:</strong> ${armourClause.text}`
        // NOT WHEN THE RUNE NEGATES IT (3.616.0, G1 of the 3.615.0 drive):
        // the line below says the armour takes nothing.
        + (armourClause.kind === "unarmoured" || indestructiblePiece ? "" : " The armour also takes damage (Chapter 6).")
      )
    );
  }

  if (indestructiblePiece) {
    lines.push(line(
      `<strong>${indestructiblePiece.name} is Indestructible</strong> — the critical injury is <strong>negated completely</strong>: no conditions, no save, and the armour takes nothing for it.`));
    await postCard(actor, "Critical Injury", lines, rolls, {});
    return {
      result, row, save: null, hitLocation,
      locationArmoured: targetArmoured,
      armourAmended: true,
      negated: true
    };
  }

  // The EFFECTIVE persistence, not the printed one, so a clause that
  // rewrites the column is read by the Death/Fatal test as well.
  const save = deathOrFatalSave({ ...row, persistence }, damageType, attackBonus);
  if (save) {
    // THE SAVE IS ROLLED, AND A FAILURE KILLS (3.457.0, Graham's ruling of
    // 1 September 2026). Until then this printed the sentence, reduced the
    // target to 0 HP, and left the deadliest rows in the game — "Skull
    // obliterated. Target dies instantly." — changing nothing: the
    // creature lay at Dying 1 against Death State 5 and stayed in the
    // initiative order. See `deathCriticalOutcome` in combat/death-state.
    lines.push(
      line(
        `<strong>${save.descriptor}:</strong> a ${save.save === "will" ? "Will" : "Fortitude"} save, DC ${save.dc}, lowers the result by ${save.reduction}. Either way they are reduced to 0 HP.`
      )
    );

    if (targetActor) {
      const currentHP = Number(targetActor.system?.resources?.hp?.value ?? 0);
      if (currentHP > 0) {
        await applyDamageAndCheckDying(targetActor, currentHP, { isCritical: true });
        lines.push(line(`<strong>${targetActor.name} is reduced to 0 HP.</strong>`));
      }

      // THE TARGET'S OWN SAVE, through the one place every check in this
      // system passes — so a Death critical meets the same modifiers,
      // advantage and open-ended chain as any other saving throw.
      const { TRGCheck } = await import("../dice/check.mjs");
      const saveData = targetActor.system?.combat?.saves?.[save.save] ?? null;
      const saveRoll = await TRGCheck.roll({
        actor: targetActor,
        type: "save",
        subject: save.save,
        label: `${save.descriptor} Critical — ${save.save === "will" ? "Will" : "Fortitude"} Save`,
        dc: save.dc,
        modifiers: saveData?.checkModifiers ?? [
          { label: `${save.save} save`, value: Number(saveData?.total ?? 0), type: "untyped" }
        ]
      });
      const verdict = deathCriticalOutcome(save, saveRoll?.total, result);
      lines.push(line(
        `${targetActor.name} rolls <strong>${saveRoll?.total ?? "—"}</strong> against DC ${save.dc} — `
        + `<strong>${verdict.died ? "failed" : "made it"}</strong>.`));

      if (verdict.died) {
        // ONE REPRESENTATION OF DEATH. The system has no separate "dead"
        // condition; `reapDead` reads Dying against Death State, so this
        // is expressed exactly as the Dying Check expresses it.
        // THE PERMISSION BOUNDARY (3.627.2): a player's Death critical on the
        // GM's creature threw here and lost the strike, found live on
        // 7 October 2026. The status crosses at the relay's own primitive;
        // the reap is the GM's death watch's when the GM made the write.
        const deadAt = actorDeathState(targetActor) + 1;
        await relayStatus(targetActor, "dying", { value: deadAt }, () =>
          targetActor.toggleStatusEffect("dying", { value: deadAt }));
        const reaped = targetActor.isOwner ? await reapDead(targetActor, game.combat ?? null) : { removed: false };
        lines.push(line(`<strong>${targetActor.name} dies.</strong>`));
        if (reaped.removed) lines.push(line("<em>Removed from the initiative order.</em>"));
      } else if (verdict.newResult !== null) {
        // THE PRINTED RULE, AUTOMATED (Graham's second ruling). "Lower the
        // critical result by 10" lands on a real row of the same table,
        // and the lookup already exists — the card used to print the new
        // number and leave a GM to read it.
        const lowered = lookupTableRow(table, verdict.newResult);
        lines.push(line(
          `The result drops to <strong>${verdict.newResult}</strong>: <em>${lowered?.effect ?? "no lesser result on this table"}</em>`));
      }
    }
  }

  // SAVAGE STRIKES (Racial, 3.377.0): an unarmed critical adds 1d4 to any
  // bleed, and at severity serious or worse inflicts 1 bleed even where
  // the row inflicts none.
  //
  // UNARMED IS DERIVED HERE, from the weapon this function already
  // receives, rather than added as a parameter every caller would have to
  // remember to pass. A caller that forgot would silently disable the
  // feat, and nothing on the card would say so. Both of the system's
  // unarmed markers are accepted because the data uses both: the pack's
  // natural attacks carry `category: "Unarmed"`, while feat-created ones
  // carry the trait keyword.
  //
  // ONE RULE SINCE 3.576.0 — `isUnarmedAttack` (combat/unarmed.mjs), which
  // also knows the Gauntlet family and Brass Knuckles are unarmed attacks.
  // A caller that hands no weapon still gets its trait line read.
  // Flags this card carries beyond Killer's Edge's (see injuryCardOptions).
  let injuryCardFlags = null;
  const savageIsUnarmed = isUnarmedAttack(weapon?.system ?? { traits: weaponTraits })
    // A weapon the holder's unarmed abilities reach (3.671.0, B7-6).
    || declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon);
  const savageActive = savageIsUnarmed && Array.from(actor?.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "savage strikes"
  );
  // Rolled OUTSIDE the pure rule and passed in, so the harness can drive
  // every face rather than hoping one turns up.
  const savageBleedBonus = savageActive
    ? Number((await new Roll("1d4").evaluate()).total)
    : 0;

  // SKEWERING STRIKES (Creature Codex; 3.631.0): a spear-group weapon in
  // the hands of a creature with the ability — bleed +1 per severity level.
  const skeweringActive = String(weapon?.system?.group ?? "").trim().toLowerCase() === "spear"
    && Array.from(actor?.items ?? []).some((i) => i.type === "ability" && String(i.name).trim().toLowerCase() === "skewering strikes");

  if (targetActor) {
    let tags = typeRecurringTags(applySkeweringStrikes(applySavageStrikes(
      applySerratedBonus(resolveEffectiveConditions(row, targetArmour), hasSerrated),
      { active: savageActive, severity, bleedBonus: savageBleedBonus }
    ), { active: skeweringActive, severity }), tableKey, DAMAGE_TYPES);
    // PLANT RESISTANCE (Creature Codex; 3.631.0): "Creatures of the plant
    // type always suffer additional HP damage, bleed and recurring damage
    // results. Other critical results only affect them if the result is
    // appropriate to their anatomy." The bleed and recurring tags land; the
    // rest are printed for the GM's anatomy call rather than applied.
    {
      const { hasPlantResistance, plantResistanceSplit } = await import("../creature-ability-rules.mjs");
      if (hasPlantResistance(Array.from(targetActor.items ?? []))) {
        const split = plantResistanceSplit(tags);
        if (split.gm.length) {
          lines.push(line(`<em>Plant Resistance: ${split.gm.map((t) => t.label ?? t.key).join(", ")} applied only if appropriate to its anatomy — GM's call (not applied).</em>`));
        }
        tags = split.keep;
      }
    }
    // A DECLARED BLEED BONUS (3.670.0; Tiger Stance). See combat/bleed-bonus.mjs.
    // Not on an injury a creature deals itself (a poison's critical, a
    // fumble's, a backlash's: found in review).
    {
      const { declaredBleedBonus, withBleedBonus } = await import("./bleed-bonus.mjs");
      const bleed = targetActor === actor ? { value: 0, labels: [] }
        : declaredBleedBonus([...Array.from(actor?.items ?? []), ...Array.from(actor?.appliedEffects ?? actor?.effects ?? [])]);
      const raised = withBleedBonus(tags, bleed.value);
      if (raised !== tags) {
        tags = raised;
        lines.push(line(`<em>${bleed.labels.join(", ")}: any bleed you inflict is increased by ${bleed.value}.</em>`));
      }
    }
    if (skeweringActive) lines.push(line(`<em>Skewering Strikes: any bleed from this ${severity} critical is increased by ${{ minor: 1, serious: 2, deadly: 3 }[String(severity).toLowerCase()] ?? 0}.</em>`));
    if (savageActive) {
      const floorApplies = ["serious", "deadly"].includes(String(severity).toLowerCase());
      lines.push(line(
        `<em>Savage Strikes: unarmed critical — any bleed is increased by `
        + `<strong>${savageBleedBonus}</strong> (1d4)`
        + (floorApplies ? `, and a ${severity} critical bleeds even if the row does not` : "")
        + `.</em>`
      ));
    }
    if (tags.length) {
      // PAGE 193: "these rules only apply to conditions that do not have
      // their own durations." The Persistence clock used to be stamped on
      // EVERY condition a critical inflicted — so a "D" critical that
      // caused Bleeding ended the bleed when its rounds ran out, instead
      // of leaving it to its own DC 16 flat check. The block-19 audit's
      // D9; Graham's R9 (21 September 2026).
      //
      // Two applications rather than one, because the clock is a single
      // option on `applyConditionTags` and these two groups want
      // different answers to it.
      /*
       * THE ROW'S OWN WORDS ABOUT TIME, WHICH NOTHING READ (3.581.0; the
       * pages 211-220 audit's D1, D2 and D10, Graham's R1, R2 and R10).
       *
       * A row can say how long a condition lasts in its effect text, and
       * forty-nine of them do — nineteen "until the end of their next
       * turn", twenty-four "until the bleeding stops", five a span in
       * minutes or hours, three queueing one condition behind another.
       * The Persistence column was the only thing consulted, so every
       * one of those statements was printed on the card and obeyed by
       * nobody.
       *
       * THE ARMOUR CLAUSE IS READ TOO, because Slashing 51's rigid
       * clause carries its own: "Weakened 1 until the bleeding ends".
       */
      const { stampRowDurations } = await import("./linked-conditions-workflow.mjs");
      const qualifying = selectArmourClause(row, targetArmour);
      const { timed: textTimed, plain, notes: durationNotes } = await stampRowDurations(
        tags,
        `${row.effect} ${qualifying?.text ?? ""}`,
        // The column's own rounds, for a successor the text does not time.
        { persistenceRounds: expiresRound === null ? null : expiresRound - Number(game.combat?.round ?? 0) }
      );
      const { timed, selfTimed } = splitPersistenceTags(plain);
      // THE PERMISSION BOUNDARY (3.339.4). A player attacking a monster
      // does not own it; the write is refused and the whole damage step
      // unwinds. Relayed to the GM's client instead.
      const applied = [];
      if (timed.length) {
        applied.push(...await relayConditionTags(targetActor, timed, { expiresRound }, () =>
          applyConditionTags(targetActor, timed, { expiresRound })));
      }
      if (selfTimed.length) {
        applied.push(...await relayConditionTags(targetActor, selfTimed, {}, () =>
          applyConditionTags(targetActor, selfTimed, {})));
      }
      // NO CALL-LEVEL EXPIRY BEHIND THESE. Each one carries its own, and
      // a fallback consulted when the per-tag round is absent would put
      // the Persistence clock back onto a condition whose duration is a
      // link or a world time.
      if (textTimed.length) {
        applied.push(...await relayConditionTags(targetActor, textTimed, {}, () =>
          applyConditionTags(targetActor, textTimed, {})));
      }
      for (const note of durationNotes) lines.push(line(`<em>${note}</em>`));
      // A CRITICAL INJURY LANDED (3.632.0): Crimson Covenant listens — the
      // defender's bleed result arms it, the attacker's live covenant stops
      // the attacker's bleeding. See codex-hooks-workflow.mjs.
      Hooks.callAll("trgPrimeCriticalInjury", { attacker: actor, target: targetActor, severity, tags: [...timed, ...selfTimed, ...textTimed] });
      lines.push(
        line(
          `<em>Applied to ${targetActor.name}:</em> ` +
            formatAppliedTags(applied) +
            "."
        )
      );

      /*
       * SPECIFIC LOCATION INJURIES (page 204, optional; R14).
       *
       * The location is already in hand — it was computed to decide
       * whether the target's armour reduced anything — and was thrown
       * away the moment the condition went on. Recorded on the Injured
       * effect itself so `conditionModifiers` can narrow the penalty to
       * the actions that location governs, and so it travels with the
       * condition rather than sitting in a flag that outlives it.
       */
      if (setting("specificLocationInjuries", false)
        && applied.some((a) => a.key === "injured" && !a.immune)) {
        // Through the GM relay when the striker does not own the target
        // (3.627.1): the GM's client finds its own copy of the effect.
        const { relayInjuryRecord } = await import("./target-relay-workflow.mjs");
        const located = await relayInjuryRecord(targetActor, "location", { location: hitLocation }, async () => {
          const injuredEffect = Array.from(targetActor.effects ?? [])
            .find((e) => !e.disabled && e.statuses?.has?.("injured"));
          if (!injuredEffect) return false;
          await injuredEffect.setFlag(SYSTEM_ID, "injuryLocation", hitLocation);
          return true;
        });
        if (located) {
          lines.push(line(
            `<em>Specific location: the Injured penalty applies to `
            + `${HIT_LOCATION_LABELS[hitLocation]} actions only (page 204).</em>`));
        }
      }
      if (selfTimed.length && expiresRound !== null) {
        lines.push(line(
          `<em>${selfTimed.map((t) => t.label ?? t.key).join(", ")} keep${selfTimed.length === 1 ? "s" : ""} `
          + "its own duration — page 193: the Persistence column governs only conditions that have none.</em>"));
      }

      // UNTIL HEALED / FULL REST / PERMANENT (R9). Three of the five
      // Persistence kinds were printed on the card and tracked by nobody.
      // Recorded on the creature so the rest workflow and the healing
      // paths can end them; M and D are round-counted above.
      const persistenceEntry = {
        code: persistence,
        conditions: applied.filter((a) => !a.immune).map((a) => ({ key: a.key, value: a.value ?? 0 })),
        effect: row.effect
      };
      // Through the GM relay when the striker does not own the target (3.627.1).
      const { relayInjuryRecord } = await import("./target-relay-workflow.mjs");
      if (await relayInjuryRecord(targetActor, "persistence", persistenceEntry,
        () => recordPersistence(targetActor, persistenceEntry))) {
        lines.push(line(
          `<em>Recorded as ${String(persistence).toUpperCase()} — it ends when the rule says, not by the round.</em>`));
      }
    }

    /*
     * "IF YOU ROLL A 1 ON THE FUMBLE, YOU ARE ALSO SUBJECTED TO YOUR
     * CRITICAL RESULT" (page 204, R10).
     *
     * The same row, applied to the attacker. Resolved against THEIR OWN
     * armour at the same location, because the row's armour clauses are
     * about who is wearing what, and the person it rebounds onto is not
     * the person it was rolled against.
     *
     * Not the Death or Fatal save, and not the damage: the sentence says
     * the critical RESULT, which is the row's effect. The save belongs to
     * the blow that was struck and the damage was rolled from a weapon
     * that struck someone else.
     */
    if (chaosFumble?.backfires && actor) {
      const ownArmour = withWholeBodyArmour(armourAtLocation(Array.from(actor.items ?? []), hitLocation), actor.system);
      const ownTags = typeRecurringTags(resolveEffectiveConditions(row, ownArmour), tableKey, DAMAGE_TYPES);
      if (ownTags.length) {
        const { timed: ownTimed, selfTimed: ownSelfTimed } = splitPersistenceTags(ownTags);
        const backfired = [];
        if (ownTimed.length) {
          backfired.push(...await applyConditionTags(actor, ownTimed, { expiresRound }));
        }
        if (ownSelfTimed.length) {
          backfired.push(...await applyConditionTags(actor, ownSelfTimed, {}));
        }
        lines.push(line(
          `<strong>A 1 on the fumble.</strong> Page 204: ${actor.name} is also subjected to their own `
          + `critical result — ${formatAppliedTags(backfired)}.`));
      } else {
        lines.push(line(
          `<strong>A 1 on the fumble.</strong> Page 204: ${actor.name} is also subjected to their own `
          + "critical result, which carries no condition to apply."));
      }
    }

    // AIR LOST TO A CRITICAL (page 202, R3): "you also lose 1 round worth
    // of air each time you are critically hit". Inert unless this
    // creature is actually holding its breath, so it costs nothing on dry
    // land beyond a flag read.
    {
      const { relayInjuryRecord } = await import("./target-relay-workflow.mjs");
      await relayInjuryRecord(targetActor, "air", {}, () => loseAirToEvent(targetActor, { criticallyHit: true }));
    }

    // A FATAL INJURY MARKS THE CREATURE (page 193; the audit's D8, R8).
    // "A character suffering from such an injury cannot lose the Dying
    // condition when making a recovery check and therefore cannot be
    // brought above 0 HP." Nothing recorded that a Fatal row had been
    // rolled, so nothing could enforce it.
    if (isFatalPersistence(row.persistence)) {
      {
        const fatalEntry = { effect: row.effect, severity, persistence: row.persistence };
        const { relayInjuryRecord } = await import("./target-relay-workflow.mjs");
        await relayInjuryRecord(targetActor, "fatal", fatalEntry, () => markFatalInjury(targetActor, fatalEntry));
      }
      lines.push(line(fatalBlockNote(targetActor)));
      // "Fatal and Death Injuries will not heal without magical aid"
      // (page 194) — which is a judgement, not a formula, so the mark is
      // cleared by the GM here rather than by any healing path guessing
      // that the magic it just applied was the right magic.
      lines.push(line(
        '<button type="button" data-action="clearFatalInjury" style="width:100%">'
        + `Magical aid heals the Fatal injury — clear ${targetActor.name}'s mark</button>`));
      injuryCardFlags = {
        clearFatalInjury: {
          targetHandle: actorHandle(
            targetActor, targetActor?.token ?? targetActor?.getActiveTokens?.()?.[0] ?? null)
        }
      };
    }
  }

  /*
   * THE ROW'S OWN RIDERS (pages 206-219; Graham's R15: "All").
   *
   * Six rows in the five tables this block audited ask for a save, a
   * flat check, a free attack or a price in AP, and the system printed
   * the sentence and did none of it. Read from the row's own text, so
   * the six the later tables carry — cold 51, cold 70, force 50, force
   * 60, force 87 — are answered by the same code without waiting for
   * their own block.
   */
  {
    const riders = criticalRowRiders(row, armourClause?.text ?? "");
    const riderFlags = {};

    if (riders.save) {
      const who = riders.save.scope === "adjacent"
        ? "Every creature adjacent to the target"
        : targetActor?.name ?? "The target";
      const saveName = riders.save.save === "will" ? "Will"
        : riders.save.save === "reflex" ? "Reflex" : "Fortitude";
      // "TO AVOID X" AND "TO X" ARE OPPOSITE SENTENCES (D8). Cold 51's
      // "Fortitude Save (1 AP) to break the ice" was printed as a save
      // "to avoid (1 AP) to break the ice", which promised the wrong
      // thing and charged nothing.
      const purpose = riders.save.avoids
        ? ` to avoid ${riders.save.avoids}`
        : riders.save.achieves ? ` to ${riders.save.achieves}` : "";
      const price = riders.save.ap ? ` — ${riders.save.ap} AP` : "";
      lines.push(line(
        `<button type="button" data-action="criticalRowSave" style="width:100%">`
        + `${who}: ${saveName} save${purpose} (DC ${Number(attackBonus || 0) + 10})${price}</button>`));
      riderFlags.criticalRowSave = {
        save: riders.save.save,
        scope: riders.save.scope,
        avoids: riders.save.avoids,
        achieves: riders.save.achieves,
        ap: riders.save.ap,
        dc: Number(attackBonus || 0) + 10,
        targetHandle: targetActor
          ? actorHandle(targetActor, targetActor?.token ?? targetActor?.getActiveTokens?.()?.[0] ?? null)
          : null
      };
    }

    /*
     * THE REST OF THE ROW'S INSTRUCTIONS (3.581.0; the pages 211-220
     * audit's D4 to D9, Graham's R4 to R9). Each one is a sentence the
     * book writes and the system used to print and ignore.
     */

    // D7 — Cold 90: "may spend 3 AP each round trying to remove the Ice.
    // This is a DC 15 flat check." A way out of a row that suffocates
    // the target, printed and never offered.
    if (riders.escape && targetActor) {
      lines.push(line(
        `<button type="button" data-action="criticalRowBreakFree" style="width:100%">`
        + `Spend ${riders.escape.ap} AP to ${riders.escape.action} — DC ${riders.escape.dc} flat check</button>`));
      riderFlags.criticalRowBreakFree = {
        ap: riders.escape.ap,
        action: riders.escape.action,
        dc: riders.escape.dc,
        targetHandle: actorHandle(
          targetActor, targetActor?.token ?? targetActor?.getActiveTokens?.()?.[0] ?? null)
      };
    }

    // D3 and D9 — Sonic 90. The Unconscious is no longer applied up
    // front (effect-parser.mjs refuses to lift a condition out of a
    // consequence clause); the trigger that earns it is armed here.
    if (riders.apWatch && targetActor) {
      const { armApSpendWatch } = await import("./critical-ap-watch.mjs");
      const watch = {
        threshold: riders.apWatch.threshold,
        dc: riders.apWatch.dc,
        tags: extractConditionalConditions(row.effect),
        rounds: MINUTE_ROUNDS,
        source: row.effect
      };
      // Through the GM relay when the striker does not own the target (3.627.2).
      const { relayInjuryRecord } = await import("./target-relay-workflow.mjs");
      await relayInjuryRecord(targetActor, "apWatch", watch, () => armApSpendWatch(targetActor, watch));
      lines.push(line(
        `<em><strong>Watching:</strong> each time ${targetActor.name} spends more than `
        + `${riders.apWatch.threshold} AP in a round they must make a DC ${riders.apWatch.dc} `
        + "flat check. Nothing has happened yet — page 217.</em>"));
    }

    // D4 — Aligned 19: "Drained of 2 PP."
    if (riders.ppDrain && targetActor) {
      const pool = Number(targetActor.system?.resources?.pp?.value ?? 0);
      const spent = Math.min(pool, riders.ppDrain);
      if (spent > 0) {
        // Through the GM relay when the striker does not own the target (3.627.2).
        const { relayInjuryRecord } = await import("./target-relay-workflow.mjs");
        await relayInjuryRecord(targetActor, "ppDrain", { amount: spent }, () =>
          targetActor.update({ "system.resources.pp.value": pool - spent }));
      }
      lines.push(line(
        `<em><strong>Drained of ${riders.ppDrain} PP</strong> — `
        + `${targetActor.name} had ${pool}, now ${pool - spent}.</em>`));
    }

    // D5 and D6 — Force 96's "cannot cast spells for (D)", Aligned 57's
    // "cannot use verbal components until the end of their next turn",
    // Force 39's "Spellcasting requires a Spell Concentration success
    // next round".
    if ((riders.lockout || riders.concentration) && targetActor) {
      const { armCastingRestriction } = await import("../magic/casting-restriction-workflow.mjs");
      const said = await armCastingRestriction(targetActor, {
        lockout: riders.lockout,
        concentration: riders.concentration,
        text: row.effect,
        /*
         * THE SCOPED (D) IS THE SEVERITY'S FORMULA, NOT THE COLUMN'S
         * (F1 of this block, found by driving Force 96 in a live world
         * before the harness was written).
         *
         * This read `persistenceInfo.rollFormula`, which is the ROW's
         * own Persistence resolved — and Force 96's column says
         * **Fatal**, so that formula is null and the lockout came out
         * with no duration at all: "cannot cast spells until a GM
         * removes it", on a row that says "for (D)".
         *
         * The whole point of a scoped (D) is that it belongs to the
         * clause and not to the column, so it is rolled from the
         * severity directly — the same `injuryDurationFormula` every
         * other Duration in this chapter uses.
         */
        persistenceRounds: riders.lockout?.persistence === "D"
          ? injuryDurationFormula(severity)
          : null,
        severity
      });
      for (const note of said) lines.push(line(`<em>${note}</em>`));
    }

    if (riders.flatCheck) {
      lines.push(line(
        `<em>While it lasts: a <strong>DC ${riders.flatCheck.dc} flat check</strong> to `
        + `${riders.flatCheck.what}${riders.flatCheck.until ? `, until ${riders.flatCheck.until}` : ""}. `
        + "Roll it when they try.</em>"));
    }

    if (riders.freeAttack) {
      lines.push(line(
        `<em><strong>${actor?.name ?? "The attacker"} may make a free attack at their current `
        + "multiple attack penalty</strong> against an adjacent target, or against this one if "
        + "there is none. Free of the action, not of the penalty.</em>"));
    }

    if (riders.apEscape && targetActor) {
      lines.push(line(
        `<button type="button" data-action="criticalRowEscape" style="width:100%">`
        + `Spend ${riders.apEscape.ap} AP to ${riders.apEscape.action} and avoid `
        + `${riders.apEscape.avoids}</button>`));
      riderFlags.criticalRowEscape = {
        ap: riders.apEscape.ap,
        action: riders.apEscape.action,
        avoids: riders.apEscape.avoids,
        targetHandle: actorHandle(
          targetActor, targetActor?.token ?? targetActor?.getActiveTokens?.()?.[0] ?? null)
      };
    }

    if (Object.keys(riderFlags).length) {
      injuryCardFlags = { ...(injuryCardFlags ?? {}), ...riderFlags };
    }
  }

  // Killer's Edge (Rogue, 1st): "you may increase or decrease the
  // critical result by an amount equal to your class bonus" on a crit
  // with an agile or finesse attack. The reachable rows are offered as
  // buttons ON THIS CARD, through the same criticalAdjust machinery
  // Ambush and Sniping already use — and "stacks with any adjustment
  // gained from Ambush, Sniping" comes free, because every shifted
  // re-read above updates the stored result those reactions measure
  // their own allowance from. Fresh rolls only: a forced re-read must
  // not offer a second helping of the same allowance.
  let injuryCardOptions = {};
  const keAllowance = forced === null
    ? killersEdgeAllowance({
        actor,
        traits: weaponTraits,
        classBonus: actor.system?.identity?.classBonus ?? 0
      })
    : 0;
  if (keAllowance > 0) {
    const reachable = adjustableRows(damageType, result, keAllowance)
      .filter((row) => !row.current);
    if (!reachable.length) {
      lines.push(line(
        `<em>Killer's Edge: an allowance of ±${keAllowance} reaches no other row on this table.</em>`
      ));
    } else {
      const buttons = reachable
        .map((row) => {
          const sign = row.shift > 0 ? "+" : "";
          const effect = row.effect.slice(0, 130) + (row.effect.length > 130 ? "…" : "");
          return (
            `<button type="button" data-action="adjustCritical" data-roll="${row.roll}" ` +
            `style="display:block;width:100%;height:auto;min-height:0;line-height:1.3;white-space:normal;text-align:left;padding:5px 7px;margin:3px 0;border-radius:3px">` +
            `<span style="display:block;font-weight:bold">${sign}${row.shift} → ${row.roll} ` +
            `<span style="font-weight:normal;opacity:.65">(d100 ${row.min}–${row.max})</span></span>` +
            `<span style="display:block;font-size:.85em;opacity:.9;margin-top:2px">${effect}</span>` +
            `</button>`
          );
        })
        .join("");
      injuryCardOptions = {
        flags: {
          [SYSTEM_ID]: {
            criticalAdjust: {
              actorId: actor.id,
              targetActorId: targetActor?.id ?? null,
              // NAMED EXACTLY (3.469.0). Re-rolling a critical from this
              // card applies dying, bleed and damage to whatever these
              // ids resolve to — and for an unlinked token a bare actor
              // id resolves to the SIDEBAR SHEET. Same defect War Cry
              // had, re-entered through a button. See
              // module/actor-handle.mjs.
              // THE TOKEN IS TAKEN FROM THE ACTOR HERE, because this
              // function is handed `targetActor` and no token —
              // `targetTokenHere` belongs to resolveWeaponDamage, and
              // reaching for it was a scope error the undefined-name
              // check caught. `actor.token` is the TokenDocument of a
              // SYNTHETIC actor, which is exactly the case that matters.
              actorHandle: actorHandle(actor, actor.token ?? actor.getActiveTokens?.()?.[0] ?? null),
              targetHandle: actorHandle(
                targetActor, targetActor?.token ?? targetActor?.getActiveTokens?.()?.[0] ?? null),
              record: {
                damageType,
                severity,
                attackBonus,
                hasSerrated,
                result,
                targetActorId: targetActor?.id ?? null,
                weaponIsRanged,
                weaponHasAgile,
                withinFirstRangeIncrement: withinFirstIncrement
              },
              allowance: keAllowance,
              applied: false
            }
          }
        },
        extraContent:
          `<p style="margin:6px 0 2px"><em>Killer's Edge: modify the result by up to ±${keAllowance} — rolled ${result}:</em></p>${buttons}`
      };
    }
  }

  // FORCED MOVEMENT (3.376.0). Fourteen rows of the critical tables say
  // "Target is pushed back 5'" or "10'", and nothing read a single one of
  // them — the same gap as Shove's, in a place nobody would think to look
  // because the sentence is buried in a longer effect line. Read off
  // `row.effect`, the exact text printed on the card two lines above, so
  // the button can never offer a push the row does not describe.
  const injuryPush = extractPushDistance(row.effect);
  if (injuryPush) {
    const tokens = resolvePushTokens(actor, targetActor);
    if (tokens) {
      const buttons = pushButtonsHtml(
        injuryPush,
        Number(canvas?.scene?.grid?.distance ?? 5),
        involuntaryMovementPrompts(targetActor)
      );
      if (buttons) {
        injuryCardOptions.flags = foundry.utils.mergeObject(injuryCardOptions.flags ?? {}, {
          [SYSTEM_ID]: {
            forcedMovement: {
              ...tokens,
              offeredFeet: injuryPush.feet,
              upTo: injuryPush.upTo,
              applied: false
            }
          }
        });
        injuryCardOptions.extraContent = `${injuryCardOptions.extraContent ?? ""}${buttons}`;
      }
    }
  }

  if (injuryCardFlags) {
    injuryCardOptions.flags = foundry.utils.mergeObject(
      injuryCardOptions.flags ?? {}, { [SYSTEM_ID]: injuryCardFlags });
  }
  await postCard(actor, "Critical Injury", lines, rolls, injuryCardOptions);
  // Critical Amendment (Chapter 6): "whenever a critical injury
  // result is modified in your favour due to you wearing armour" —
  // exactly the condition already checked above to decide whether to
  // print the "Armoured target" line, so it's already known here
  // rather than something the player should be asked to judge again.
  return {
    result,
    row,
    save,
    hitLocation,
    locationArmoured: targetArmoured,
    armourAmended: criticalAmendmentApplies(row, targetArmour)
  };
}


/**
 * CHAOS'S OWN FUMBLE ROLL (page 204; Graham's R10 of 21 September 2026).
 *
 *   "Get ready for random, roll 1d30+70 and use as the result of the
 *    injury. You must make a roll on the appropriate fumble table and
 *    regain 1 conviction. If you roll a 1 on the fumble, you are also
 *    subjected to your critical result."
 *
 * The 1d30+70 and the Conviction have worked since criticals were
 * automated. The fumble roll had never been made: the card said "roll on
 * the fumble table as well" and left it to the table, which also left the
 * consequence clause — the interesting half of the rule — with nothing to
 * hang on.
 *
 * ROLLED, NOT RESOLVED. This is not a fumble: no Fumble DC is checked and
 * nothing is being confirmed. Chaos sends you to the table directly, so
 * the roll is made and its row read, and `rollFumbleCheck` beside it is
 * left alone.
 *
 * @param {Actor} actor the attacker, who is the one rolling
 * @param {Item|null} weapon what they swung, for the right table
 * @returns {Promise<{roll: number, row: object, category: string, backfires: boolean}>}
 */
async function rollChaosFumble(actor, weapon) {
  const category = fumbleTableFor(weapon?.system ?? null);
  const roll = await new Roll("1d100").evaluate();
  const row = lookupTableRow(FUMBLE_TABLES[category], roll.total);
  return { roll: roll.total, row, category, backfires: roll.total === 1, rollObject: roll };
}

/**
 * Wade Through the Mooks (Chapter 7, optional rule, NPC only): replaces
 * the full critical injury table with a d100 roll against the Quick
 * Crit table — a flat HP-damage multiplier (of the weapon's own base
 * die, not the full total) applied on top of the normal damage, plus
 * Injured 1 to represent the accumulating toll, or an immediate drop
 * on a "Kill" result with no save.
 */
export async function rollQuickCrit(targetActor, {
  severity, baseDamage, damageType = "slashing",
  // The attacker, for its own traits. Optional: a quick crit rolled from
  // somewhere with no attacker in hand simply has none.
  attackerIsSwarm = false,
  // WHO ROLLED IT (3.580.0, R11). Chaos gives "you" a Conviction, and
  // "you" is the one making the critical injury roll — the attacker. This
  // function was never handed one, so it had nobody to give it to and
  // gave it to the mook being hit instead, while the main critical path
  // a hundred lines above gave it to the attacker. One of the two was
  // wrong and it was this one.
  attacker = null,
  // What they swung, so Chaos's fumble roll reads the right table.
  weapon = null
}) {
  const percentile = await new Roll("1d100").evaluate();
  let result = percentile.total;
  let chaosFumble = null;

  const lines = [
    line(`Rolled <strong>${percentile.total}</strong> on the Quick Crit table (${severity}).`)
  ];
  const rolls = [percentile];

  // Chaos (Chapter 7): "Chaos | See Chaos Result above" — the Quick
  // Crit table's own entry for an unmodified 66, deferring to the same
  // mechanic every other critical table uses: replace the result with
  // 1d30+70, roll on the fumble table as well, and regain 1 Conviction.
  if (percentile.total === CRITICAL_CHAOS_FACE && setting("chaosResults", false)) {
    const d30 = await new Roll("1d30").evaluate();
    rolls.push(d30);
    const chaos = criticalChaosReplacement(d30.total);
    result = chaos.result;
    await awardConviction(attacker ?? targetActor, chaos.conviction);
    // ROLLED, NOT DESCRIBED (3.580.0, R10) — the same correction the main
    // critical path took, so the Quick Crit table's own "Chaos | See
    // Chaos Result above" really does mean the same thing above.
    chaosFumble = await rollChaosFumble(attacker ?? targetActor, weapon);
    rolls.push(chaosFumble.rollObject);
    lines.push(
      line(
        `<strong>Chaos!</strong> The result becomes ${result}, and regain 1 Conviction. `
        + `Fumble table (${chaosFumble.category}): <strong>${chaosFumble.roll}</strong> — `
        + `<em>${chaosFumble.row.effect}</em>`
      )
    );
  }

  const outcome = quickCritResult(result, severity);

  if (outcome === null) {
    lines.push(line("No additional effect at this severity."));
    await postCard(targetActor, "Quick Crit (Mook)", lines, rolls);
    return { roll: percentile.total, outcome: null };
  }

  if (outcome === "kill") {
    // THE PERMISSION BOUNDARY (3.339.4). Zeroing HP is a damage
    // application like any other, so it crosses at the same primitive
    // rather than writing to the target directly.
    await relayHpZero(targetActor, () =>
      targetActor.update({ "system.resources.hp.value": 0 }));
    lines.push(line("<strong>Kill.</strong> The mook drops immediately — no save."));
    await postCard(targetActor, "Quick Crit (Mook)", lines, rolls);
    return { roll: percentile.total, outcome: "kill" };
  }

  const baseDieMatch = String(baseDamage || "1d6").match(/^(\d*)d(\d+)/i);
  const baseDieRoll = baseDieMatch
    ? await new Roll(`${baseDieMatch[1] || 1}d${baseDieMatch[2]}`).evaluate()
    : null;
  const extraDamage = (baseDieRoll?.total ?? 0) * outcome;

  // The mook's extra critical damage is damage of the weapon's own type,
  // so it goes through the target's defences like any other. It went
  // straight to HP before, which meant a resistance that halved the
  // weapon's damage did nothing at all to its critical.
  const quickCritPacket = resolveAgainstDefences(targetActor.system, {
    amount: extraDamage,
    type: damageType,
    creatureTypeSystem: ownedCreatureTypeSystem(targetActor),
    attackerIsSwarm
  });
  const damageResult = quickCritPacket.taken > 0
    ? await applyDamageAndCheckDying(targetActor, quickCritPacket.taken, { isCritical: false })
    : { case: "none", newHP: Number(targetActor.system?.resources?.hp?.value ?? 0) };
  if (quickCritPacket.immune) {
    lines.push(line(`<em>${targetActor.name} is immune — no damage.</em>`));
  }
  const currentInjured = Number(targetActor.getConditionValue?.("injured") ?? 0);
  // THE PERMISSION BOUNDARY (3.339.4).
  await relayStatus(targetActor, "injured", { value: currentInjured + 1 }, () =>
    targetActor.toggleStatusEffect("injured", { value: currentInjured + 1 }));

  lines.push(
    line(
      `<strong>x${outcome}</strong> additional damage: ${extraDamage} (base die x${outcome}). Gains <strong>Injured ${currentInjured + 1}</strong>.`
    )
  );

  // "If you roll a 1 on the fumble, you are also subjected to your
  // critical result" (page 204, R10). Here the result IS the extra
  // damage, so that is what rebounds — through the attacker's own
  // defences, like any other damage.
  if (chaosFumble?.backfires && attacker && extraDamage > 0) {
    const ownPacket = resolveAgainstDefences(attacker.system, {
      amount: extraDamage,
      type: damageType,
      creatureTypeSystem: ownedCreatureTypeSystem(attacker)
    });
    if (ownPacket.taken > 0) {
      await applyDamageAndCheckDying(attacker, ownPacket.taken, { isCritical: false });
    }
    lines.push(line(
      `<strong>A 1 on the fumble.</strong> Page 204: ${attacker.name} is also subjected to their own `
      + `critical result — <strong>${ownPacket.taken}</strong> ${damageType}.`));
  }
  if (damageResult.case === "reached-zero" || damageResult.case === "massive-damage-death") {
    lines.push(line("<strong>Reduced to 0 HP.</strong>"));
  }

  await postCard(targetActor, "Quick Crit (Mook)", lines, [...rolls, baseDieRoll].filter(Boolean));
  return { roll: percentile.total, outcome, extraDamage };
}

/**
 * Reset Parry's "attacked this turn" tracking at the start of each of
 * the actor's turns — called from TRGCombat._onStartTurn alongside
 * the other per-turn resets already there.
 */
export async function resetParryTrackingForTurn(actor) {
  const weapons = Array.from(actor.items ?? []).filter(
    (item) => item.type === "weapon" && item.system?.attackedThisTurn
  );
  for (const weapon of weapons) {
    await weapon.update({ "system.attackedThisTurn": false });
  }
}

/** The UM-1 fumble confirmation and, on failure, the category fumble table. */
/**
 * Does a Vicious weapon go unfed in this wielder's hands? Its rune must be in
 * force (a melee weapon, B10) and the wielder resist or be immune to essence.
 */
function viciousStarves(actor, weapon) {
  const vicious = runeDamageFor(weapon).some((rune) => rune.key === "vicious");
  if (!vicious) return false;
  const defences = actorDefences(actor?.system ?? {}, ownedCreatureTypeSystem(actor));
  return Boolean(defences?.resistances?.has?.("essence") || defences?.immunities?.has?.("essence"));
}

export async function rollFumbleCheck(actor, weapon, { dcHalved = false, weaponData = null, thrown = false, confirmed = null } = {}) {
  // THE CHECK ALREADY MADE (3.669.0): `confirmed` true or false when the
  // Strike confirmed the fumble early, for Fortune's Reversal. False: it was
  // averted, and its card already said so.
  if (confirmed === false) return null;
  // THE TABLE THE ATTACK WAS MADE ON (3.576.0): melee, missile, thrown or
  // unarmed, by what was swung and whether it was thrown.
  const swung = weaponData ?? weapon.system ?? {};
  const category = fumbleTableFor(swung, { thrown });
  if (confirmed !== true && !(await confirmAttackFumble(actor, weapon, { dcHalved, weaponData }))) return null;
  return fumbleTableAfterConfirmation(actor, weapon, category);
}

/**
 * THE FUMBLE CHECK ALONE (split out at 3.669.0): the DC, Vicious's automatic
 * fumble, the check, and "Fumble Averted". Resolves true when the fumble
 * stands. The Strike asks it early when Fortune's Reversal could answer.
 */
async function confirmAttackFumble(actor, weapon, { dcHalved = false, weaponData = null } = {}) {
  // THE WEAPON AS IT WAS SWUNG (3.575.0): metal bracers make an Unarmed
  // Strike a gauntlet attack, with the gauntlet's fumble DC. The caller
  // passes what it attacked with; the document is the fallback.
  const swung = weaponData ?? weapon.system ?? {};
  // Archer archetype (Chapter 5): "Your Fumble DC with all bow weapons
  // is decreased by 1."
  const archerBowBonus =
    String(swung.group ?? "").trim().toLowerCase() === "bow" &&
    Array.from(actor.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "archer"
    ) ? 1 : 0;
  // Weapon Mastery (Class, Chapter 5): Fumble DC -1 per 6 BAB (minimum
  // DC 4) with weapons covered by a recorded Weapon Focus group.
  let masteryReduction = 0;
  if (Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "weapon mastery"
  )) {
    const focusedGroups = Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled)
      .map((e) => String(e.getFlag?.("trg-prime", "weaponFocusGroup") ?? "").trim().toLowerCase())
      .filter(Boolean);
    if (focusedGroups.includes(String(weapon.system?.group ?? "").trim().toLowerCase())) {
      masteryReduction = Math.floor(Number(actor.system?.combat?.bab?.total ?? 0) / 6);
    }
  }
  // BALANCED (Chapter 6, superior weapon trait): "reduces its Fumble DC by
  // 1 (minimum of 4). This trait may be applied multiple times." Computed
  // by `computeWeaponModifiers` since the trait was written and read by
  // nothing until 3.575.0. Found in the pages 151-160 audit.
  const balancedReduction = -Number(computeWeaponModifiers(
    swung.quality || "standard", swung.material || "",
    parseGrantList(swung.superiorTraits || "")
  ).fumbleDCDelta ?? 0);
  const baseFumbleDC = effectiveFumbleDC(swung.fumbleDC ?? 5, {
    flat: archerBowBonus,
    floored: masteryReduction + balancedReduction
  });
  // Clumsy (Chapter 6): "the DC being half of the listed value" —
  // the rulebook doesn't specify a rounding direction, so this
  // rounds down (the lower, easier-to-pass DC), worth flagging as an
  // interpretation rather than a confirmed reading, same as Deadly
  // and Reach elsewhere in this batch.
  // ETERNAL ESSENCE (Creature Codex; 3.631.0): "lowers all FDC by 1".
  const { abilityFumbleDCShift } = await import("../creature-ability-rules.mjs");
  const fumbleDC = Math.max(0, (dcHalved ? Math.floor(baseFumbleDC / 2) : baseFumbleDC) + abilityFumbleDCShift(Array.from(actor.items ?? [])));

  /*
   * VICIOUS MUST BE FED (3.618.0, C6 of block 37): "if its wielder has either
   * Essence Resistance or Essence Immunity, the weapon automatically fumbles
   * when an UM 1 is rolled on an attack check." No check to avert it.
   */
  const starved = viciousStarves(actor, weapon);
  const check = starved ? null : await TRGCheck.roll({
    actor,
    label: `${weapon.name} — Fumble Check`,
    subtitle: `DC ${fumbleDC}${dcHalved ? " (Clumsy — half DC)" : ""} to avoid a fumble`,
    type: "flat",
    flat: true,
    dc: fumbleDC
  });
  if (starved) {
    await postCard(actor, "Fumble", [
      line(`<strong>${weapon.name} is Vicious, and its magic must be fed.</strong> ${actor.name} resists essence, so the 1 is an automatic fumble — no check.`)
    ]);
  }

  if (check?.outcome?.degree?.success) {
    await postCard(actor, "Fumble Averted", [
      line("The attack is merely a miss.")
    ]);
    return false;
  }
  return true;
}

/**
 * After a fumble stands: Devotion, then the table. The table the attack was
 * made on (3.576.0) is melee, missile, thrown or unarmed — chosen by attack
 * mode alone it was never Unarmed, and a thrown dagger fumbled on the melee
 * one.
 */
async function fumbleTableAfterConfirmation(actor, weapon, category) {

  // Devotion (Crusader, 1st): "Trigger: You fumble a check with either
  // a class skill or favoured weapon attack. ...expend 2 PP treat the
  // check as a failure." This is the favoured-weapon-attack half —
  // the skill-check half lives in check-card-interactions.mjs, on the
  // Chapter 8 degrees table this function never touches. Attacks have
  // no "failure" degree to downgrade to; "treat the check as a
  // failure" maps onto THIS mechanism as averting the fumble-table
  // roll entirely, which is exactly what passing the UM-1 check just
  // above already grants — Devotion buys that same "merely a miss"
  // outcome with PP instead of rolling for it.
  const { devotionAttackTrigger, DEVOTION_PP_COST } = await import("../crusader.mjs");
  const { favouredWeaponSources } = await import("../divine-aspect.mjs");
  const aspects = Array.from(actor.items ?? []).filter((i) => i.type === "divine-aspect");
  const isFavouredWeapon = favouredWeaponSources(aspects, weapon.name, weapon.system?.group).length > 0;
  const ppRemaining = Number(actor.system?.resources?.pp?.value ?? 0);
  if (devotionAttackTrigger({ actor, isFavouredWeapon }) && ppRemaining >= DEVOTION_PP_COST) {
    const spend = await DialogV2.confirm({
      window: { title: "Devotion", icon: "fa-solid fa-hand-holding-heart" },
      content: `<p>Spend ${DEVOTION_PP_COST} PP to treat this fumble as a plain miss instead of rolling on the fumble table?</p>`,
      rejectClose: false
    });
    if (spend) {
      await actor.update({ "system.resources.pp.value": ppRemaining - DEVOTION_PP_COST });
      await postCard(actor, "Fumble Averted (Devotion)", [
        line(`Spends ${DEVOTION_PP_COST} PP. The attack is merely a miss.`)
      ]);
      return null;
    }
  }

  const roll = await new Roll("1d100").evaluate();
  const row = lookupTableRow(FUMBLE_TABLES[category], roll.total);
  const rolls = [roll];

  const lines = [
    line(`Rolled <strong>${roll.total}</strong> on the ${category} fumble table.`),
    line(`<em>${row.effect}</em>`)
  ];

  const hasSerrated = /\bserrated\b/i.test(String(weapon.system.traits ?? ""));

  const duration = extractTextDuration(row.effect);
  const expiresRound = duration.autoExpires ? (game.combat?.round ?? 0) + duration.rounds : null;

  const tags = applySerratedBonus(extractConditionTags(row.effect), hasSerrated);
  if (tags.length) {
    /*
     * THE FUMBLE TABLES GET THE SAME CLOCKS AS THE CRITICAL ONES
     * (3.582.0; the pages 221-230 audit's D2, Graham's R2). Three rows
     * tie a condition to a bleed — "Sickened 1 until the bleed damage
     * stops" — and `extractTextDuration` cannot express that, so the
     * whole of critical-durations.mjs is asked here as well. It was
     * wired to the critical path alone since it was written.
     */
    const { stampRowDurations } = await import("./linked-conditions-workflow.mjs");
    const { timed: textTimed, plain, notes: durationNotes } =
      await stampRowDurations(tags, row.effect, { persistenceRounds: duration.rounds });
    const applied = [];
    if (plain.length) applied.push(...await applyConditionTags(actor, plain, { expiresRound }));
    // No call-level expiry behind these: each carries its own.
    if (textTimed.length) applied.push(...await applyConditionTags(actor, textTimed, {}));
    lines.push(
      line(
        `<em>Applied to ${actor.name}:</em> ` +
          formatAppliedTags(applied) +
          "."
      )
    );
    for (const note of durationNotes) lines.push(line(`<em>${note}</em>`));
  }

  const selfDamageResult = await applySelfDamage(
    actor,
    extractSelfDamage(row.effect),
    applyDamageAndCheckDying,
    hasSerrated ? 1 : 0
  );
  if (selfDamageResult.roll) rolls.push(selfDamageResult.roll);
  if (selfDamageResult.line) lines.push(line(selfDamageResult.line));

  /*
   * EVERYTHING ELSE THE ROW ASKS FOR (3.582.0; the pages 221-230 audit's
   * D1, Graham's R1: "Yes"). Fifty-five of the 120 fumble rows tell the
   * system to do something and it used to print the sentence and stop.
   * The critical tables gained this at 3.580.0; this is the same
   * treatment, read from the same kind of patterns.
   */
  {
    const { applyFumbleRiders } = await import("./fumble-riders-workflow.mjs");
    const fumbleFlags = await applyFumbleRiders(actor, row, {
      weapon, category, lines, rolls, line
    });
    if (fumbleFlags && Object.keys(fumbleFlags).length) {
      await postCard(actor, "Fumble!", lines, rolls, { flags: { [SYSTEM_ID]: fumbleFlags } });
      return row;
    }
  }

  await postCard(actor, "Fumble!", lines, rolls);

  return row;
}

/**
 * Roll a weapon's damage: base dice, BAB bonus dice, Strength for melee and
 * thrown attacks, and critical precision dice when requested. The pipeline
 * (DR, resistance, weakness) is reported against the current target if one
 * is selected; application to HP stays with the GM.
 */
/**
 * The actual damage roll, DR/resistance pipeline, and HP application —
 * shared by the standalone Damage button (rollWeaponDamage, below,
 * which prompts for critical/glancing/armour details first) and the
 * automatic damage roll that follows a successful weapon Attack
 * (rollWeaponAttack), which already knows critical/glancing from the
 * attack outcome itself and only needs the two armour-judgment
 * questions on an actual critical, where they matter.
 *
 * Applies the final, DR-adjusted damage to the target's HP via
 * applyDamageAndCheckDying — the same function already used for the
 * Mook-only Quick Crit path — rather than only reporting it in a chat
 * card and leaving application to a separate manual step.
 */
async function resolveWeaponDamage(
  actor,
  weapon,
  { critical = null, glancing = false, locationArmoured = true, armourAmended = false, distance = null, damageTypeOverride = null, damageOverride = null, usedTwoHanded = false, hitLocation = null, ammo = null, ammoName = "", ammoCoat = null, powerAttack = false, sneakDice = 0, precisionDice = 0, precisionParts = null, damageRiders = [], targetSize = null, meleeDistance = null, spinBonus = null, targetTokenOverride = null, deathMarkBonus = 0, declaredBonus = 0, declaredBonusLines = [], compoundFlat = 0, compoundFlatLines = [], extraTypedDamage = [], sharedDamage = null, drWaived = false, seriesLabel = "", declaredRending = 0, declaredRendingLines = [] } = {}
) {
  /*
   * WHETHER THIS BLOW TREATS ITS TARGET AS UNARMOURED (3.585.0).
   *
   * Derived HERE rather than threaded in from `resolveAttack`, because
   * this function has three call sites and a fourth would one day
   * forget to pass it — the shape that left `magicRitualSecondaryModifier`
   * uncalled and `ritual: true` unreachable. Everything it needs is
   * already in hand: the attacker carries the effect and the weapon
   * names itself.
   *
   * The TARGET's defence is not read here, and does not need to be: the
   * Defence-Bonus half of a pierce is applied in `resolveAttack` where
   * the target is known, and only the armour half belongs in the damage
   * pipeline.
   */
  const damagePierce = defencePierceFor(defencePiercesOn(actor), weapon?.id, null);

  // A BLANCHED OR SILVERED BLOW (3.578.0; the block-18 audit's D8, R8):
  // "counts as adamantine instead of its normal material for any physical
  // damage it deals". The fired piece's coat first, then the weapon's.
  const struck = struckMaterial({
    weaponMaterial: weapon?.system?.material ?? "",
    weaponCoat: oilCoatOf(weapon),
    ammoCoat,
    now: {
      worldTime: Number(game.time?.worldTime ?? 0),
      combatId: game.combat?.id ?? null,
      round: game.combat ? Number(game.combat.round ?? 0) : null
    }
  });
  // Ammunition (Chapter 6) contributes to the damage of the shot it is
  // fired on: Blunt Arrows change the damage type, Distance Arrows trade
  // damage for range, and the Fire Bolt adds damage of its own type.
  const ammoDamage = ammunitionEffects(ammo);
  const system = actor.system;
  const weaponData = weapon.system;
  // Versatile (Chapter 6): the chosen damage type for this specific
  // attack, if the player picked the alternate — used everywhere
  // weaponData.damageType would otherwise be read directly, without
  // mutating the actual item's own data.
  const effectiveDamageType =
    damageTypeOverride ?? ammoDamage.damageTypeOverride ?? weaponData.damageType;

  /*
   * THE TARGET IS RESOLVED HERE (3.548.0), ABOVE THE FORMULA — and
   * since 3.580.0 above the FIRST line of it, not merely above the
   * additions, because the critical bonus dice are precision damage
   * (page 203, R4) and they are built into the weapon's own expression.
   *
   * It used to be looked up a hundred lines further down, beside the
   * defences — which was fine while nothing before that point needed it.
   * The precision gate does, and reading it early without moving the
   * declaration is a temporal-dead-zone throw on EVERY weapon damage
   * roll in the game. Caught by tools/verify-use-before-declaration.mjs
   * before it left the tree.
   *
   * `firstTargetToken` reads the user's targets and nothing local, so it
   * gives the same answer here as it did below.
   */
  // WHO THE DAMAGE LANDS ON. The user's target, except when the caller
  // names someone else: a stray shot (3.579.0, page 192, Graham's R2)
  // strikes a different combatant in the melee entirely, and everything
  // below — precision immunity, DR, weaknesses, the dying pipeline —
  // must read THAT creature's defences and not the one aimed at.
  const targetTokenHere = targetTokenOverride ?? firstTargetToken() ?? null;
  const targetActor = targetTokenHere?.actor ?? null;
  const damageTargetDefences = targetActor
    ? actorDefences(targetActor.system ?? {}, ownedCreatureTypeSystem(targetActor))
    : null;
  const precisionImmune = Boolean(
    damageTargetDefences?.immunities?.has?.(IMMUNITY_TOKENS.precision));
  /*
   * RESISTANCE TO PRECISION (3.579.0), the errata beside the immunity.
   *
   * `DEFENCE_TRAITS` lists precision as a thing a creature can declare,
   * and the immunity has been enforced since 3.548.0 — but a creature
   * declaring RESISTANCE to it parsed to a token nothing read, so a
   * Rogue's dice landed in full. No creature in the pack has one today;
   * the token exists, so the rule should.
   *
   * HALVED AS DICE, not as damage, because the precision dice are folded
   * into one damage expression with everything else and cannot be told
   * apart after the roll. Half the dice is half the damage on average,
   * which is what a resistance is, and the card says what it did.
   */
  const precisionResisted = !precisionImmune && Boolean(
    damageTargetDefences?.resistances?.has?.(IMMUNITY_TOKENS.precision));
  const halveIfResisted = (n) => (precisionResisted ? Math.floor(n / 2) : n);

  // THE CRITICAL BONUS DICE ARE PRECISION (page 203, R4): a creature
  // immune to precision takes none of them, one resisting it takes half.
  const critDiceKept = criticalPrecisionDice(critical, {
    immune: precisionImmune, resisted: precisionResisted
  });
  // HAND & A HALF, HELD IN TWO HANDS (3.645.0, F5 of Graham's 14 October
  // session): "This increases weapons damage as if it were a size larger."
  // The die climbs one rung of the size ladder — a Bastard Sword's 1d8
  // becomes 1d10 — as the weapon one size larger would roll. The ×1.5
  // Strength of a two-handed larger weapon still applies below. Before this
  // only the Strength half was read, and the die never moved.
  // A Vital Strike's extra base dice arrive as an override and step too.
  // TRAINED FISTS AT DAMAGE (3.667.0): the die (when nothing else set one),
  // the flat "total unarmed damage", and what the blow counts as. See
  // combat/unarmed-profile.mjs.
  const unarmed = unarmedProfileFor(actor, weaponData);
  if (!damageOverride && unarmed?.damage) damageOverride = unarmed.damage;
  // ONE BONDED WEAPON'S SCALING (3.671.0; Soul-Bound Weapon): the same
  // flat, magic and materials, for that weapon only. See unarmed-profile.mjs.
  const bonded = weaponScalingProfile(unarmedAbilityCarriers(actor), weapon, Number(actor?.system?.combat?.bab?.total ?? 0));
  const handAndAHalfDamage = usedTwoHanded && heldInTwoHandGrip(weapon)
    ? steppedCreatureDamage(damageOverride ?? weaponData.damage, 1)
    : null;
  // REAVER BLADE (3.659.0; block 28 R8): the critical's bonus dice become
  // Soul Drain — kept off the blow, rolled after it lands.
  const { criticalDiceAsDrain, damageDieOf, ignoresResistanceInMelee } = await import("./reaver-strikes.mjs");
  const drainDice = criticalDiceAsDrain(weapon, critical, critDiceKept);
  // UNSTOPPABLE FORCE (3.659.0; block 28 R8), read where the packets resolve below.
  const unstoppable = (weaponData.attackMode ?? "melee") !== "missile" && ignoresResistanceInMelee(Array.from(actor?.items ?? []));
  let formula = buildWeaponDamageFormula(handAndAHalfDamage ?? damageOverride ?? weaponData.damage, {
    bab: Number(system.combat?.bab?.total ?? 0),
    critical,
    criticalDice: drainDice ? 0 : critDiceKept,
    // QUICK DAMAGE (page 204, optional; R12).
    quickDamage: setting("quickDamage", false),
    quality: weaponData.quality || "standard",
    material: weaponData.material || "",
    superiorTraits: weaponData.superiorTraits || "",
    mightyBonus: extractTraitValue(weaponData.traits, "mighty") || 0
  });

  const isMelee = (weaponData.attackMode ?? "melee") !== "missile";
  // Weapon Finesse (Chapter 5): "When you attack with a finesse melee
  // weapon, you can add your Dex to damage rolls instead of Str" — taken
  // automatically when Dex is the better stat (the feat's prerequisite
  // guarantees Dex > Str at pick time, but both can change later).
  const dexterityMod = Number(system.attributes?.dexterity?.total ?? 0);
  const rawStrengthMod = Number(system.attributes?.strength?.total ?? 0);
  const ownsDamageFeat = (name) => Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === name
  );
  // THE BIGGER THEY ARE (Racial, 3.377.0): "+2 base damage ... with a
  // sling against a Large or larger creature." Added here with the other
  // flat feat bonuses (Weapon Specialisation, Point Blank Shot) rather
  // than anywhere new, so there is one list of things that add to a
  // damage formula.
  const biggerBonus = biggerTheyAreDamageBonus({
    featNames: Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name),
    weaponGroup: weaponData.group,
    targetSize
  });
  if (biggerBonus > 0) formula += ` + ${biggerBonus}`;

  /*
   * GRAVITY WEAPON (3.493.0), and it goes HERE for the reason the comment
   * above gives: one list of things that add to a damage formula.
   *
   * "The base damage die of the weapon gains a +2 bonus" — the weapon's
   * OWN damage, in the weapon's own type, which is what makes it a flat
   * addition to this formula rather than a strike rider's separate typed
   * packet. Graham ruled it a flat +2 rather than a die step on
   * 4 September 2026; see magic/weapon-damage-bonus.mjs for the argument.
   *
   * SCOPED TO THE WEAPON THE SPELL WAS CAST ON. The spell says "one
   * chosen weapon in your grasp", and its +1 PP warp buys a second — so
   * the record names weapon ids and this asks about the one being rolled.
   * Unscoped it would arm every weapon the character owns, which is the
   * defect Talon Strike's `weaponScoped` exists to prevent.
   */
  const gravityBonus = weaponDamageBonusFor(weaponDamageBonusesOn(actor), weapon?.id);
  if (gravityBonus > 0) formula += ` + ${gravityBonus}`;
  // AGAINST ONE KIND OF THING (3.608.0, R8) — Smash's "+1-status bonus to
  // base damage rolls against objects and constructs". Scoped to the
  // TARGET, not the weapon; see magic/versus-damage.mjs.
  const { versusDamageFor } = await import("../magic/versus-damage-workflow.mjs");
  const versus = await versusDamageFor(actor, targetActor);
  if (versus.value > 0) formula += ` + ${versus.value}`;

  const weaponFinesseDamage = isMelee &&
    /\bfinesse\b/i.test(String(weaponData.traits ?? "")) &&
    dexterityMod > rawStrengthMod &&
    ownsDamageFeat("weapon finesse");
  // Proper Hardman (Class, Chapter 5): "strength is multiplied by 1.5
  // when determining your melee damage bonus" — the Strength value only,
  // so a finesse (Dex) damage choice is unaffected.
  const hardmanStrength = isMelee && ownsDamageFeat("proper hardman")
    ? Math.floor(rawStrengthMod * 1.5)
    : rawStrengthMod;
  const strengthMod = weaponFinesseDamage ? dexterityMod : hardmanStrength;
  const hasPropulsive = !isMelee && /\bpropulsive\b/i.test(String(weaponData.traits ?? ""));
  // THE SLING (3.576.0): "A sling is treated as a thrown weapon for
  // determining damage modifiers" — full Strength, as a thrown weapon adds.
  // Graham, 19 Sep 2026: its Propulsive trait is removed and the damage is
  // as thrown. Declared on the weapon (`thrownDamage`), not by name.
  const thrownDamage = !isMelee && weaponData.thrownDamage === true;
  // `usedTwoHanded` is the whole answer since 3.575.0 — a one-size-larger
  // weapon as well as a Hand & a Half grip — so it is no longer ANDed with
  // the trait here. See `twoHandedStrengthApplies` (held-items.mjs).
  const strength = isMelee
    ? handAndAHalfStrengthBonus(usedTwoHanded, strengthMod)
    : thrownDamage ? strengthMod : propulsiveStrengthBonus(hasPropulsive, strengthMod);
  if (strength) formula += ` + ${strength}`;

  // Rage (Chapter 4), per Graham directly: rage's +2 circumstance bonus
  // to Strength-based checks applies to the base damage of Strength-based
  // attacks too, not only to the attack roll. Added to the formula here
  // rather than through the bonus pools, since damage is a rolled
  // expression rather than a derived total with typed slots.
  if (isRaging(actor) && isStrengthBasedAttack(weaponData)) {
    formula += ` + ${RAGE_BONUS}`;
  }

  // WEAKENED REACHES THE DAMAGE (3.621.0; block 39's A6): "This includes
  // melee attack rolls and damage rolls based on Strength". The same test
  // as Rage's just above, and a status penalty of the condition's value.
  {
    const weakened = Number(actor.getConditionValue?.("weakened") ?? 0);
    if (weakened > 0 && isStrengthBasedAttack(weaponData)) formula += ` - ${weakened}`;
  }

  // Weapon Specialisation (Class, Chapter 5): "+2 extra base damage"
  // with a recorded Weapon Focus group.
  const specGroups = Array.from(actor.appliedEffects ?? actor.effects ?? [])
    .filter((e) => !e.disabled)
    .map((e) => String(e.getFlag?.(SYSTEM_ID, "weaponSpecialisationGroup") ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (specGroups.includes(String(weaponData.group ?? "").trim().toLowerCase())) {
    formula += " + 2";
  }

  // Weapon Exemplar (Fighter, 4th): the damage half of "+1-class bonus
  // on attack rolls and damage rolls" with a chosen weapon group —
  // the attack half is a modifier in rollWeaponAttack; damage is a
  // rolled expression, so the figure joins the formula here like Rage
  // and Weapon Specialisation above.
  const exemplarDamage = weaponExemplarBonusFor(
    weaponExemplarPicks(actor),
    weaponExemplarTierCount(Number(system.identity?.level ?? 0)),
    weaponData.group
  );
  if (exemplarDamage) {
    formula += ` + ${exemplarDamage}`;
  }

  // ANCIENT ECHOES (Creature Codex, Chapter 3): the damage half of
  // "+1-luck bonus to attack and damage". The attack half is a typed
  // modifier in rollWeaponAttack; damage is a rolled expression with no
  // typed slots to stack in, so it joins the formula here — the same
  // split Rage, Weapon Specialisation and Weapon Exemplar above already
  // live with, and the reason the rune's two halves are two numbers
  // rather than one.
  const echoesDamage = runeBonusesFor(weapon).strikeDamage;
  if (echoesDamage) {
    formula += ` + ${echoesDamage}`;
  }

  // Sneak Attack (Rogue, 1st): "an extra 1d6 precision damage", scaling
  // with Stealth ranks. Decided in rollWeaponAttack — where the target's
  // flanked/flat-footed state is known — or ticked by hand in the
  // standalone damage dialog; either way it arrives here as a dice
  // count and joins the rolled expression.
  /*
   * PRECISION IMMUNITY (3.548.0) — and it had never applied.
   *
   * `codex-trait-rules.mjs` pushes IMMUNITY_TOKENS.precision into the
   * immunity set for every Incorporeal and every Swarm, under a comment
   * saying the trait's defences "are enforced the moment this ships".
   * Measured 10 Sep 2026: nothing in the system read that token. A
   * Rogue's Sneak Attack and a Ranger's Precision Hunter dice landed in
   * full on a Rat Swarm and on a ghost, which are the two creatures in
   * the book the immunity exists for.
   *
   * Resolved ONCE here and reused for the packet below, rather than
   * calling actorDefences twice in one damage roll.
   */

  const sneak = precisionImmune ? 0 : halveIfResisted(Math.max(0, Math.floor(Number(sneakDice) || 0)));
  if (sneak) {
    formula += ` + ${sneak}d6`;
  }

  // Precision Hunter (Ranger, Hunter's Method): the once-per-round
  // precision dice against the hunted prey, decided in rollWeaponAttack
  // (where prey identity and the round marker are known) or ticked by
  // hand in the standalone damage dialog — the same two routes Sneak
  // Attack's dice already travel.
  const precision = precisionImmune ? 0 : halveIfResisted(Math.max(0, Math.floor(Number(precisionDice) || 0)));
  if (precision) {
    formula += ` + ${precision}d6`;
  }
  // Declared riders (3.564.0) — secondary damage of the weapon's own
  // type, so it rides the same formula and the same pipeline.
  formula += riderFormula(damageRiders);
  // Whether any precision dice were actually taken away, for the card
  // line further down — `lines` does not exist yet at this point.
  const precisionSuppressed = precisionImmune
    && (Number(sneakDice) > 0 || Number(precisionDice) > 0);

  // Point Blank Shot (Class, Chapter 5): +1 damage within the first
  // range increment for non-Volley ranged weapons (mirrors the attack
  // side's increment derivation, Archer/Far Shot adjustments included).
  if (!isMelee && distance !== null && ownsDamageFeat("point blank shot") &&
    !/\bvolley\b/i.test(String(weaponData.traits ?? ""))) {
    const archerRange = String(weaponData.group ?? "").trim().toLowerCase() === "bow" &&
      ownsDamageFeat("archer") ? 10 : 0;
    const pbIncrement = (effectiveRangeIncrement(weaponData, ammo, { multiplier: rangeIncrementMultiplierOf(weapon, ammo?.parent ?? null, Number(game.time?.worldTime ?? 0)) }) + archerRange) *
      (ownsDamageFeat("far shot") ? 2 : 1);
    if (pbIncrement > 0 && distance <= pbIncrement) formula += " + 1";
  }

  /*
   * THE MARK'S +1, for a weapon that already prints Deadly (3.586.3).
   * "…gain the Deadly trait (already-Deadly weapons: +1 damage)." The
   * trait half rides the `deadly` boolean in `resolveAttack`; this is
   * the other branch of the same sentence, and it is flat because the
   * page says +1 rather than +1 die. Same shape as Point Blank's
   * `formula += " + 1"` twenty lines up.
   */
  if (Number(deathMarkBonus) > 0) {
    formula += ` + ${Math.trunc(Number(deathMarkBonus))}`;
  }

  // A CONDITIONAL SCOPED TO THE DAMAGE ROLL (3.626.1), already resolved
  // by `declaredDamageBonus` — typed stacking done, the offered rows
  // answered — so this is one signed number and the lines that explain it.
  const declaredDamageTotal = Math.trunc(Number(declaredBonus) || 0);
  if (declaredDamageTotal) {
    formula += declaredDamageTotal > 0 ? ` + ${declaredDamageTotal}` : ` - ${Math.abs(declaredDamageTotal)}`;
  }
  // A COMPOUND STRIKE'S FLAT DAMAGE (3.640.0, Storm of Blades' +5 a blade).
  const compoundFlatTotal = Math.max(0, Math.trunc(Number(compoundFlat) || 0));
  if (compoundFlatTotal) formula += ` + ${compoundFlatTotal}`;
  // "AN ADDITIONAL POINT OF TOTAL UNARMED DAMAGE" (3.667.0): total, not
  // base, so it is added to the formula after the dice, like the compound
  // flat above, and the card names it.
  const unarmedFlat = Math.max(0, Math.trunc(Number(unarmed?.flat) || 0));
  if (unarmedFlat) formula += ` + ${unarmedFlat}`;
  const bondedFlat = Math.max(0, Math.trunc(Number(bonded?.flat) || 0));
  if (bondedFlat) formula += ` + ${bondedFlat}`;

  // Power Attack (Class, Chapter 5): "+2d8 damage... At BAB +12, 3d8
  // and at BAB +18 4d8" — same type as the base damage.
  if (powerAttack && isMelee) {
    const bab = Number(system.combat?.bab?.total ?? 0);
    const dice = bab >= 18 ? 4 : bab >= 12 ? 3 : 2;
    formula += ` + ${dice}d8`;
  }

  /*
   * ITEM BONUSES TO DAMAGE TAKE THE HIGHER (3.617.0, B2 of block 37; Graham's
   * R3). "Any item bonus granted from ammunition does not stack with the item
   * bonus from the firing weapon" — and the weapon's quality bonus to damage
   * is one. The round's bonus used to be added on top of it. A PENALTY is not
   * a bonus and still applies in full. An unguent's +1 (Sharpness) is a third
   * item bonus and joins the same comparison.
   */
  const qualityItemDamage = weaponQualityDamageBonus(damageOverride ?? weaponData.damage, {
    bab: Number(system.combat?.bab?.total ?? 0),
    critical, criticalDice: critDiceKept,
    quality: weaponData.quality || "standard",
    material: weaponData.material || "",
    superiorTraits: weaponData.superiorTraits || ""
  });
  /*
   * POTENCY'S DAMAGE (3.618.0, Graham's R7 of block 37): "an additional point
   * of damage per level of potency", flat, on top of quality — the specific
   * weapons' printed lines are base plus quality, and potency adds to them.
   * RUNED AMMUNITION (B1) carries its own potency; the round's and the bow's
   * item bonuses do not stack (R3), so the round adds only what it beats the
   * weapon's by.
   */
  const weaponPotencyDamage = Math.max(0, Number(weaponData.runeDamageBonus ?? 0) || 0);
  if (weaponPotencyDamage) formula += ` + ${weaponPotencyDamage}`;
  const weaponItemDamage = qualityItemDamage + weaponPotencyDamage;
  const ammoPotencyDamage = ammoPotencyTier(ammo);
  const ammoDamageMod = Number(ammoDamage.damageModifier) || 0;
  if (ammoDamageMod < 0) formula += ` + ${ammoDamageMod}`;
  const ammoItemDamage = itemDamageExcess(Math.max(0, ammoDamageMod) + ammoPotencyDamage, weaponItemDamage);
  if (ammoItemDamage) formula += ` + ${ammoItemDamage}`;
  const coatNow = { worldTime: Number(game.time?.worldTime ?? 0), combatId: game.combat?.id ?? null, round: game.combat ? Number(game.combat.round ?? 0) : null };
  const coatItemDamage = itemDamageExcess(
    Math.max(riderDamageBonus(ammoCoat, coatNow), riderDamageBonus(oilCoatOf(weapon), coatNow)),
    Math.max(weaponItemDamage, Math.max(0, ammoDamageMod) + ammoPotencyDamage));
  if (coatItemDamage) formula += ` + ${coatItemDamage}`;
  // BANE (3.618.0, Graham's R12): "an additional 2d4 damage when attacking
  // creatures of the selected type" — added to the strike itself, against a
  // creature carrying the chosen kind as a trait.
  const ammoRuneItem = ammo ? { type: "ammunition", name: ammoName || "Ammunition", system: ammo } : null;
  const strikeRunes = [
    ...runeDamageFor(weapon, { target: targetActor?.system ?? null }),
    ...(ammoRuneItem ? runeDamageFor(ammoRuneItem, { target: targetActor?.system ?? null }) : [])
  ];
  const baneLines = [];
  for (const bane of strikeRunes.filter((r) => r.addsToStrike)) {
    if (bane.resolved && bane.applies) {
      formula += ` + ${bane.dice}`;
      baneLines.push(`<strong>${bane.label} (${bane.parameter})</strong> — +${bane.dice} against ${targetActor.name}.`);
    } else {
      baneLines.push(runeDamageLine(bane, 0));
    }
  }
  // WHAT THE ROUND ADDS TO THE SHOT ITSELF (3.576.0) — only an extra of
  // the shot's own type. The Fire Bolt's fire is a packet of its own,
  // below, with the rune dice; it used to be added here, as piercing.
  formula += ammunitionFormulaExtra(ammo, effectiveDamageType);
  // AND WHAT ARRIVES AS ITS OWN TYPE — the Fire Bolt's explosion, the
  // torch's flame. Resolved in the secondary-damage loop against the
  // target's own defences, like a Flaming rune.
  const typedExtras = [
    ...ammunitionDamagePackets(ammo, ammoName || "Ammunition", effectiveDamageType),
    ...improvisedDamagePackets(weaponData, weapon?.name ?? ""),
    // A CREATURE'S PRINTED "plus 2d6 good" (3.633.0, F&F 3.0 R2) — the
    // book's secondary damage, a packet of its own type like the rest.
    ...creatureSecondaryPackets(weapon, targetActor?.system ?? null),
    // AN ACTION'S OWN "+2d12 bludgeoning" (3.649.0, block 16 R4/R5).
    ...actionDamagePackets(extraTypedDamage, weapon)
  ];

  // Spin (Chapter 6): whatever bonus was built up by a prior Spin
  // action applies to this attack only, then resets — it's a
  // one-shot buildup consumed by the next attack, not a standing
  // bonus. The attack path has already taken it off the weapon and
  // hands it over (`spinBonus`); the standalone damage button, which has
  // no attack before it, still takes it here.
  const spinCarried = spinBonus ?? Math.max(0, Number(weaponData.spinBonus ?? 0));
  if (spinCarried) formula += ` + ${spinCarried}`;
  if (spinBonus === null && Number(weaponData.spinBonus ?? 0)) {
    await weapon.update({ "system.spinBonus": 0 });
  }

  const roll = await sharedRoll(sharedDamage, "strike", formula);
  let total = roll.total;
  if (glancing) total = Math.ceil(total / 2);

  const typeLabel =
    DAMAGE_TYPES[effectiveDamageType]?.label ?? effectiveDamageType ?? "";

  const displayBonusDice = bonusDamageDice(Number(system.combat?.bab?.total ?? 0));
  const lines = [
    line(
      `<strong>${total}</strong> ${typeLabel} damage (${formula}${glancing ? ", glancing: halved" : ""}).`
    )
  ];
  if (displayBonusDice) lines.push(line(`Includes +${displayBonusDice} base dice from BAB.`));
  if (versus.line) lines.push(line(versus.line));
  if (critical) {
    lines.push(line(`Includes critical bonus dice (${critical}), precision type.`));
  }
  for (const said of Array.isArray(declaredBonusLines) ? declaredBonusLines : []) lines.push(line(said));
  for (const said of Array.isArray(compoundFlatLines) ? compoundFlatLines : []) lines.push(line(said));
  if (unarmedFlat) lines.push(line(`<em>${unarmed.flatLabel}: total unarmed damage.</em>`));
  if (bondedFlat) lines.push(line(`<em>${bonded.flatLabel}: total damage.</em>`));
  // SAID OUT LOUD, because dice that silently vanish read as a bug. The
  // player spent Sneak Attack or the once-per-round Precision Hunter die
  // on this strike and has to see where it went.
  if (precisionSuppressed) {
    lines.push(line("<em>Immune to precision damage</em> — Sneak Attack and Precision Hunter dice do not apply."));
  }
  if (precisionResisted && (Number(sneakDice) > 0 || Number(precisionDice) > 0)) {
    lines.push(line(
      `<em>Resistant to precision damage</em> — the precision dice are halved `
      + `(${Math.max(0, Math.floor(Number(sneakDice) || 0)) + Math.max(0, Math.floor(Number(precisionDice) || 0))} → ${sneak + precision}).`));
  }
  // The CRITICAL bonus dice are precision too (page 203, R4), and they
  // are not in the two counts above — they were folded into the weapon's
  // own expression before it was rolled, so the only place their loss
  // can be reported is here.
  {
    const critDiceFull = CRITICAL_BONUS_DICE[String(critical ?? "").toLowerCase()] ?? 0;
    if (critDiceFull && critDiceKept !== critDiceFull) {
      lines.push(line(
        `<em>${precisionImmune ? "Immune" : "Resistant"} to precision damage</em> — a critical's bonus dice `
        + `are precision (page 203), so ${critDiceFull} becomes <strong>${critDiceKept}</strong>.`));
    }
  }
  if (sneak) {
    lines.push(line(`<strong>${sneakDiceLabel(actor)}</strong> — +${sneak}d6 precision damage (target flanked or flat-footed).`));
  }
  if (precision) {
    const parts = Array.isArray(precisionParts) && precisionParts.length ? precisionParts : [{ dice: precision, label: "Precision Hunter", why: "first damage against your hunted prey this round" }];
    for (const part of parts) lines.push(line(`<strong>${part.label}</strong> — +${part.dice}d6 precision damage (${part.why}).`));
  }
  for (const rider of damageRiders ?? []) {
    lines.push(line(`<strong>${rider.label}</strong> — +${rider.dice} secondary damage${rider.grownBy ? ` (with ${rider.grownBy})` : ""}${rider.oncePerRound ? " (first damage this round)" : ""}.`));
  }
  // WITH NOBODY TARGETED, the typed extras are said rather than lost.
  if (!targetActor) {
    for (const extra of typedExtras) {
      lines.push(line(`<strong>${extra.label}</strong> — also ${extra.dice} ${extra.type} damage; no target selected, apply by hand.`));
    }
  }

  // The pipeline (DR, resistance, weakness, immunity), applied directly
  // to the current target's HP if one is selected, via the same
  // applyDamageAndCheckDying function already used elsewhere in this
  // file (the Mook Quick Crit path) rather than only reported for
  // manual application.
  // THE TOKEN, NOT ONLY THE ACTOR (3.465.0). Area riders ask where the
  // struck creature is standing, which an Actor cannot answer. Both are
  // now resolved above the damage formula, for the precision gate.
  let finalTaken = null;
  // PAGE 192: "If DR reduces the damage from a critical hit to zero or
  // less, the target takes a subdual critical instead of the normal
  // type." Answered here and handed back to the caller (3.579.0, R5):
  // the injury table has already been rolled by the time damage is
  // resolved, so this is the fact the caller needs to offer the swap.
  let drStoppedCritical = false;
  // THE CASE, NOT JUST THE NUMBER. "Did this drop them" is what Cleave
  // triggers on, and  alone cannot say — 3 damage to a creature on
  // 3 HP and to one on 30 are the same number and different events.
  let finalCase = null;
  let finalHP = null;
  if (targetActor) {
    const targetSystem = targetActor.system ?? {};
    // The defences this target actually has, resolved once. Also the
    // traits this strike carries, so a target immune to a trait the
    // weapon or its effect bears takes nothing from it.
    // RESOLVED ABOVE (3.548.0) for the precision-immunity check, and
    // reused rather than recomputed — one damage roll, one reading of
    // the target's defences.
    const targetDefences = damageTargetDefences
      ?? actorDefences(targetSystem, ownedCreatureTypeSystem(targetActor));
    // The attacker's own trait, read once for the two DR pools below and
    // for the rune packets further down.
    const attackerIsSwarm = isSwarm(actor?.system);
    const strikeTraitList = traitList(`Attack, ${weaponData?.traits ?? ""}`);
    // Hit location (Chapter 7): "DR (regardless of its location) is
    // applied" on a non-critical hit, per Graham directly — but on a
    // critical with a known struck location, only armour that
    // actually covers that location contributes its DR, not every
    // equipped piece summed together regardless of where it sits.
    const coveringArmour = Array.from(targetActor.items ?? []).filter((item) =>
      armourContributesToHit(item, { isCritical: Boolean(critical), hitLocation })
    );
    // ONE SUIT COUNTS (3.621.0; block 39's A2, Graham's R3) — the best body
    // armour covering the blow, and the fittings on top. See
    // armour-stacking.mjs; the sheet's figure is worked out the same way.
    const wornArmourDR = stackedArmourDR(coveringArmour.map((item) => {
      const status = itemStatus(item.system.hp?.value, item.system.hp?.max);
      const dr = effectiveArmourDR(item, effectiveDamageType);
      // A destroyed piece of armour provides no protection at all;
      // broken armour still works, but at half its DR (Chapter 6,
      // Broken Condition).
      return {
        name: item.name,
        suit: isBodyArmour(item),
        dr: status === "destroyed" ? 0 : (status === "broken" ? brokenArmourDR(dr) : dr)
      };
    })).dr;
    // BRACERS OF ARMOUR ARE ARMOUR (3.617.0, Graham's R17 of block 37): "You
    // may only benefit from the highest Base DR that you gain" — the higher
    // of the bracers and the worn armour, never both. They sit in the
    // equipped pool, so a critical to an unarmoured location bypasses them
    // as it does any armour.
    // COMPARED AS THE DR A BLOW MEETS (3.617.1): worn armour scales by BDB,
    // the bracers by BSB and no further than their pool (Graham's Q1, Q2).
    const targetBracers = targetSystem.combat?.bracers ?? null;
    const { bracersAreTheArmour, drainBracers } = await import("../bracers-workflow.mjs");
    const wornEffectiveDR = effectiveDR(wornArmourDR, targetSystem.combat?.bdb?.total ?? 0);
    const bracersSource = bracersAreTheArmour(wornEffectiveDR, targetBracers);
    const equippedEffectiveDR = Math.max(wornEffectiveDR, Number(targetBracers?.effective ?? 0));
    // Bonus DR (Dracoris, Iron Hide — Graham's ruling): always adds on top,
    // carried through the natural-armour channel (whole-body coverage, so
    // the critical uncovered-location bypass can't strip it; Armour
    // Rending/Penetrating still reduce it, per the both-pools precedent).
    const bonusDr = Number(targetSystem.combat?.dr?.total ?? 0);
    // A NEGATIVE POOL IS A PENALTY, SPENT HERE (3.611.0) — Devastating
    // Might's "DR reduced by 3". See combat/dr-penalty.mjs; the same rule
    // runs in `resolveAgainstDefences` for every other damage path.
    const { drAfterPenalty } = await import("./dr-penalty.mjs");
    const penalisedPools = drAfterPenalty(
      equippedEffectiveDR,
      Number(targetSystem.combat?.naturalArmour?.dr ?? 0) + Math.max(0, bonusDr),
      bonusDr);
    const naturalArmourDrValue = penalisedPools.naturalDr;
    const dr = penalisedPools.armourDr;

    // Armour Rending (Chapter 6): "ignore the listed Armour DR,"
    // scaled by quality. Penetrating (Chapter 6): "treats all armour
    // as none" within the weapon's first range increment. Confirmed
    // by Graham directly: both traits also affect Natural Armour DR,
    // not just manufactured — each pool is reduced/bypassed
    // independently by the same amount, since the rule describes
    // ignoring/treating-as-none "Armour DR" generally rather than a
    // single combined pool split between the two sources.
    // Per Graham directly: ammunition Armour Rending adds to the
    // weapon's own rather than replacing it or taking the higher.
    // …AND WHAT ABILITIES DECLARE (3.668.0), added as ammunition's is.
    const arValue = combinedArmourRending(
      armourRendingValue(weaponData.traits, weaponData.quality || "standard"),
      ammo
    ) + Math.max(0, Number(declaredRending) || 0);
    // The Chapter 6 *weapon* trait, deliberately read through the weapon
    // namespace helper — Appendix 3's similar trait is now called
    // Penetrate and must never be picked up here.
    /*
     * ABJURERS STRIKE RIDES PENETRATING'S RAILS (3.585.0, page 248).
     *
     * "the weapon treats all targets as unarmoured" and Penetrating's
     * "treats all armour as none" are the same instruction, so this is
     * the same flag rather than a second subtraction somewhere else —
     * which also means it inherits Graham's ruling that the effect
     * reaches BOTH the manufactured and the natural pool.
     *
     * DRIVEN LIVE FIRST. Two earlier drafts made this a Defence Bonus
     * subtraction, and armour in this system contributes nothing to DB
     * at all — see magic/defence-pierce.mjs for the measurement.
     */
    const penetrating = penetratingApplies(
      hasWeaponTrait(weaponData, "penetrating"),
      distance,
      effectiveRangeIncrement(weaponData, ammo, { multiplier: rangeIncrementMultiplierOf(weapon, ammo?.parent ?? null, Number(game.time?.worldTime ?? 0)) })
    ) || Boolean(damagePierce.unarmoured);
    const rendedDr = drAfterRendingAndPenetrating(dr, arValue, penetrating);
    const rendedNaturalArmourDr = drAfterRendingAndPenetrating(
      naturalArmourDrValue,
      arValue,
      penetrating
    );
    // SWARM (Creature Codex): "treats the target's DR as half its normal
    // value". Applied HERE, beside Armour Rending and Penetrating, because
    // all three are reductions to the same two pools and keeping them in
    // one place is what stops the next one being applied somewhere else.
    //
    // AFTER the other two, deliberately: halving what Rending already took
    // off is the reading that treats "the target's DR" as the DR this
    // attack actually faces, rather than the number on the sheet.
    //
    // WIRED AT 3.366.0 — `swarmReducedDR` had been written, tested and
    // called by nothing, so a Swarm met full DR.
    // WHETHER THIS STRIKE IS A MAGICAL SOURCE, decided once for the blow
    // and every packet that rides it (3.626.1 — it used to be decided
    // for the blow alone; see the rune loop below).
    const strikeIsMagical = Boolean(weapon?.system?.runeModifiers?.potency) || ammoPotencyTier(ammo) > 0
      // A RUNED ROUND IS MAGICAL TOO (3.618.0, B1).
      // …AND A MORPH'S GROWN STRIKE (3.622.0; R11): "Any strikes granted by
      // a morph effect are magical."
      || weapon?.flags?.[SYSTEM_ID]?.magicalStrike === true
      // …AND THE ACTOR'S OWN DECLARATION (3.625.0): Sanctioned Strike's
      // "against your Judged Subject", Consecrated Armament's "with that
      // weapon". See combat/magical-attacks.mjs.
      || Boolean(magicalAttackSource(declaredMagicalAttacks(Array.from(actor.appliedEffects ?? actor.effects ?? [])), { targetUuid: targetActor?.uuid ?? "", weaponName: weapon?.name ?? "", targetTraits: creatureTraits(targetActor?.system ?? {}) }))
      // …AND A TYPE CHOSEN THROUGH AN OPTION THAT SAYS SO (3.627.0): Essence
      // Attacks' "the attack remains magical".
      || strikeTypeIsMagical(abilityStrikeView(weaponData, declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon)), declaredStrikeTypeOptions(Array.from(actor.appliedEffects ?? actor.effects ?? [])), effectiveDamageType, extractVersatileType(weaponData.traits))
      // …AND TRAINED FISTS THAT "CLASS AS MAGICAL" (3.667.0, Powerful Fists at BAB 3).
      || Boolean(unarmed?.magical)
      // …AND A BONDED WEAPON THAT CLASSES AS MAGICAL (3.671.0, Soul-Bound Weapon at BAB 3).
      || Boolean(bonded?.magical);
    // PENETRATING STRIKES (Creature Codex; 3.631.0): "the creature's
    // indicated physical attacks treat all DR as half" — a MELEE attack
    // carrying the penetrating trait (a stat block prints "Claws +18
    // (penetrating)"). Chapter 6's Penetrating is the ranged trait above,
    // read within one range increment; on a melee swing that test never
    // holds, which is how the Codex's rule and the weapon's share a word
    // without sharing a path. Halved the way the Swarm halves.
    const penetratingStrike = isMelee && weaponData.attackMode !== "thrown" && hasWeaponTrait(weaponData, "penetrating") && !penetrating;
    // DR MET ONCE BY A SERIES (3.667.0): a later Strike of a Flurry of
    // Blows on the creature the first already hit meets no DR again.
    const effectiveDrForHit = drWaived ? 0
      : attackerIsSwarm || penetratingStrike ? swarmReducedDR(rendedDr) : rendedDr;
    const effectiveNaturalArmourDr = drWaived ? 0
      : attackerIsSwarm || penetratingStrike
        ? swarmReducedDR(rendedNaturalArmourDr)
        : rendedNaturalArmourDr;
    if (drWaived && (rendedDr > 0 || rendedNaturalArmourDr > 0)) {
      lines.push(line(`<em>${seriesLabel || "This series"}: ${targetActor.name}'s DR was applied once, to the first hit — none again here.</em>`));
    }
    if (penetratingStrike && (rendedDr > 0 || rendedNaturalArmourDr > 0)) {
      lines.push(line(`<em>Penetrating Strikes: ${targetActor.name}'s DR is halved — ${rendedDr + rendedNaturalArmourDr} → ${effectiveDrForHit + effectiveNaturalArmourDr}.</em>`));
    }
    // WHAT THE DECLARED AR WAS (3.668.0), so the card says why the armour
    // gave less: "Challenge: AR 3".
    if (declaredRending > 0 && (dr > 0 || naturalArmourDrValue > 0)) {
      lines.push(line(`<em>${(declaredRendingLines ?? []).join("; ")} — added to the weapon's Armour Rending.</em>`));
    }
    if (attackerIsSwarm && (rendedDr > 0 || rendedNaturalArmourDr > 0)) {
      lines.push(line(
        `<em>Swarm: ${targetActor.name}'s DR is halved — `
        + `${rendedDr + rendedNaturalArmourDr} → ${effectiveDrForHit + effectiveNaturalArmourDr}.</em>`));
    }

    // DR & Criticals (Chapter 7): equipped-armour DR only applies to a
    // critical if the struck location is actually covered by that
    // armour. Non-critical hits are unaffected — the location-coverage
    // rule is specific to criticals. Natural Armour (Chapter 7) covers
    // the whole creature, not a single piece of equipment, so it's
    // deliberately passed through separately below rather than folded
    // into effectiveDrForHit — resolveDamagePacket applies it
    // regardless of this bypass (a separate rule from Armour
    // Rending/Penetrating above, which do reduce it).
    const drBypassed = Boolean(critical) && !locationArmoured;
    // GHOST TOUCH (3.618.0, C6 of block 37): "The weapon affects incorporeal
    // creatures normally" — a melee weapon carrying it, against a creature
    // that is incorporeal. It used to print a line on every hit and change
    // nothing.
    // OR A REGISTERED RUNE THAT SAYS THE SAME (3.626.0): Pillars of Faith's
    // Exorcist, "the weapon may strike incorporeal spirits and incorporeal
    // Undead normally".
    // OR THE ATTACKER ITSELF (3.630.0): Pillars of Faith's Grasp the Unseen —
    // "while you are in Shadow Stance, your unarmed attacks and any weapons
    // you wield are treated as possessing Ghost Touch". See actorGhostTouch.
    const ghostTouchHere = (
      (Boolean(equippedEventRune([weapon], "ghostTouch")) && runeUsageAllows("ghostTouch", weaponUsage(weaponData)).ok)
      || runeGhostTouch(weapon)
      || actorGhostTouch(actor, { magical: strikeIsMagical })
    ) && isIncorporeal(targetActor.system);

    // UNSTOPPABLE FORCE (3.659.0; block 28 R8): "bypasses all resistance
    // with its melee attacks" — the target's resistances are not read.
    if (unstoppable) lines.push(line(`<em>Unstoppable Force: ${actor.name}'s melee attack bypasses all resistance.</em>`));
    const packet = resolveDamagePacket({
      amount: total,
      type: effectiveDamageType,
      dr: effectiveDrForHit,
      drBypassed,
      naturalArmourDr: effectiveNaturalArmourDr,
      // What a creature *is* confers immunities of its own, on top of
      // anything typed into its immunities field: a Mindless creature is
      // immune to mental damage, a Construct to Essence (Chapter 7).
      // Resolved through one accessor now, so every damage path in the
      // system reads the same defences rather than only this one.
      resistances: unstoppable ? new Set() : targetDefences.resistances,
      immunities: targetDefences.immunities,
      weaknesses: targetDefences.weaknesses,
      immuneTraits: targetDefences.immuneTraits,
      sourceTraits: strikeTraitList,
      // THE SOURCE AND THE STEEL (3.547.0). A weapon carrying a Potency
      // rune is a magical source, so a creature's `mundane` resistance
      // does not halve it; the weapon's special material is what a
      // creature's cold iron / silver / adamantine weakness reads.
      resistanceCategories: unstoppable ? [] : targetDefences.resistanceCategories,
      weaknessMaterials: targetDefences.weaknessMaterials,
      // WIRED AT 3.548.0. Computed since 3.547.1, consumed since 3.547.1,
      // and passed by neither damage path in between — so the bracketed
      // material that overcomes a resistance overcame nothing.
      resistanceBypassMaterials: targetDefences.resistanceBypassMaterials,
      resistanceSources: unstoppable ? new Set() : targetDefences.resistanceSources,
      weaknessSources: targetDefences.weaknessSources,
      resistanceTraits: unstoppable ? new Set() : targetDefences.resistanceTraits,
      weaknessTraits: targetDefences.weaknessTraits,
      resistanceExcept: targetDefences.resistanceExcept,
      // A RUNED ROUND IS MAGICAL TOO (3.618.0, B1).
      // …AND A MORPH'S GROWN STRIKE (3.622.0; R11): "Any strikes granted by
      // a morph effect are magical."
      magical: strikeIsMagical,
      // GHOST TOUCH against the incorporeal (3.618.0, C6).
      incorporealTouch: ghostTouchHere,
      // TRAINED FISTS "TREATED AS COLD IRON AND SILVER" (3.667.0): the
      // weapon's own material first, then every one the training names.
      material: [materialDefenceWord(struck.material), ...(unarmed?.materials ?? []), ...(bonded?.materials ?? [])].filter(Boolean).join(", "),
      // A STRIKE IS TARGETED BY DEFINITION (3.548.0). Graham's ruling:
      // targeted is "any attack that requires an attack roll to hit
      // (weapon or spell)", and this is the path every attack roll in
      // the system takes. Never an area — a weapon with an area rider
      // deals that damage down the spell path, which answers for itself.
      targeted: true,
      area: false
    });
    // FIRE HEALING (3.631.0): the blow's own type heals this creature instead.
    const healsInstead = healsFromDamage(Array.from(targetActor.items ?? []), effectiveDamageType);
    if (healsInstead) {
      const healPacket = { taken: 0, immune: false, healsInstead: Math.floor(total * healsInstead.fraction), drApplied: 0, steps: [] };
      packet.taken = 0; packet.drApplied = 0;
      packet.steps = [`${total} ${effectiveDamageType} — ${await applyHealsInstead(targetActor, healPacket)}`];
    }
    finalTaken = packet.taken;
    // The pool absorbs what the bracers' DR stopped (R17).
    const bracersLine = await drainBracers(targetActor, packet, bracersSource && !drBypassed);
    if (bracersLine) lines.push(bracersLine);
    drStoppedCritical = criticalBecomesSubdual({
      critical,
      damageType: effectiveDamageType,
      total,
      taken: packet.taken,
      drApplied: packet.drApplied
    });
    if (drStoppedCritical) {
      lines.push(line(
        `<strong>DR stops the critical.</strong> Page 192: with the damage reduced to `
        + `${packet.taken}, ${targetActor.name} takes a <strong>subdual critical</strong> `
        + "instead of the normal type."));
    }
    if (struck.coated) {
      lines.push(line(`<em>${struck.source}:</em> counts as ${materialDefenceWord(struck.material) || struck.material} for this damage.`));
    }

    if (penetrating) {
      lines.push(line("<em>Penetrating:</em> all armour (including Natural Armour) treated as none (within first range increment)."));
    } else if (arValue) {
      lines.push(line(`<em>Armour Rending:</em> target's DR (including Natural Armour) reduced by ${arValue}.`));
    }

    // Subdual (Chapter 7): the packet already knows whether this damage
    // was nonlethal — it was simply never carried through to where it
    // decides between Unconscious and Dying.
    const damageResult = await applyDamageAndCheckDying(targetActor, packet.taken, {
      isCritical: Boolean(critical),
      nonlethal: Boolean(packet.nonlethal),
      // What a death guard asks of the blow (3.627.0): its type, and whose level it is opposed by.
      damageTypes: [String(effectiveDamageType ?? "").trim().toLowerCase()].filter(Boolean),
      sourceLevel: Number(actor.system?.identity?.level ?? 0),
      sourceName: actor.name,
      sourceUuid: actor.uuid ?? "",
      context: { kind: "strike", melee: isMelee, damageType: String(effectiveDamageType ?? ""), weaponName: weapon?.name ?? "" }
    });
    finalCase = damageResult?.case ?? null;
    finalHP = Number.isFinite(damageResult?.newHP) ? damageResult.newHP : null;
    // …AND THE CRITICAL'S DICE AS SOUL DRAIN (3.659.0; Reaver Blade).
    if (drainDice) {
      const drainRoll = await new Roll(`${drainDice}d${damageDieOf(weaponData.damage)}`).evaluate();
      if (drainRoll.total > 0) {
        const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
        const { relayConditionTags } = await import("./target-relay-workflow.mjs");
        const { conditionLabel } = await import("../conditions/condition-rules.mjs");
        const tags = [{ key: "soulDrain", value: drainRoll.total, label: conditionLabel("soulDrain") }];
        const applied = await relayConditionTags(targetActor, tags, {}, () => applyConditionTags(targetActor, tags, {}));
        lines.push(line(`<strong>${weapon.name}:</strong> the critical's ${drainDice} bonus dice (${drainDice}d${damageDieOf(weaponData.damage)} = ${drainRoll.total}) become Soul Drain — ${formatAppliedTags(applied)}.`));
      }
    }
    // THE STRIKE LOG (3.631.0): Rend ("strikes a target twice with the
    // listed attack type") and Tear Flesh ("using the result of its
    // previous attack") read the creature's last few hits. Six kept.
    if (actor.setFlag) {
      const log = Array.isArray(actor.getFlag?.(SYSTEM_ID, "strikeLog")) ? actor.getFlag(SYSTEM_ID, "strikeLog") : [];
      await actor.setFlag(SYSTEM_ID, "strikeLog", [...log.slice(-5), {
        weaponId: weapon?.id ?? "", weaponName: weapon?.name ?? "", targetUuid: targetActor?.uuid ?? "", targetName: targetActor?.name ?? "",
        damage: Number(packet.taken) || 0, rolled: Number(total) || 0, critical: critical || null, damageType: effectiveDamageType,
        round: Number(game.combat?.round ?? 0), turn: Number(game.combat?.turn ?? 0), at: Number(game.time?.worldTime ?? 0)
      }]);
    }

    if (damageResult.case === "stasis") {
      // IMPERVIOUS (3.614.0, R2): the steps print, the HP did not move.
      lines.push(line(
        `<em>vs ${targetActor.name}:</em> ${packet.steps.join(" \u2192 ")} = <strong>${packet.taken}</strong> — `
        + `<strong>${targetActor.name} is in stasis and takes no damage.</strong>`));
    } else if (damageResult.case === "delayed") {
      // DELAYED RESPITE HELD IT (3.493.0). THE HP DID NOT MOVE AND THE
      // CARD MUST NOT SAY THEY DID — "Now 30 / 30 HP" under a 12-damage
      // hit is indistinguishable from a broken damage path. The steps
      // still print, because the book determines "damage and critical
      // hits as usual" and only the arrival is deferred.
      lines.push(
        line(
          `<em>vs ${targetActor.name}:</em> ${packet.steps.join(" \u2192 ")} = <strong>${packet.taken}</strong>.`
        )
      );
      lines.push(line(respiteCaughtLine(targetActor.name, damageResult.delayed)));
    } else {
      lines.push(
        line(
          `<em>vs ${targetActor.name}:</em> ${packet.steps.join(" \u2192 ")} = <strong>${packet.taken}</strong> taken. Now ${damageResult.newHP} / ${Number(targetActor.system?.resources?.hp?.max ?? 0)} HP.`
        )
      );
    }
    if (damageResult.case === "knocked-out") {
      lines.push(
        line(
          `<strong>${targetActor.name} is knocked out.</strong> Subdual damage: Unconscious at 0 HP, and not Dying.`
        )
      );
    } else if (damageResult.case === "nonlethal-no-effect") {
      lines.push(
        line(
          `<em>Subdual damage has no further effect on a Dying creature.</em>`
        )
      );
    } else if (damageResult.case === "reached-zero" || damageResult.case === "massive-damage-death") {
      lines.push(line(`<strong>${targetActor.name} is reduced to 0 HP.</strong>`));
    } else if (damageResult.case === "already-dying-escalated") {
      lines.push(line(`<strong>${targetActor.name}'s Dying condition escalates.</strong>`));
    } else if (damageResult.case === "already-dying-dead") {
      lines.push(line(`<strong>${targetActor.name} dies.</strong>`));
    }
    // MERCIFUL (3.626.0): a registered rune's offer to leave the felled creature Stable.
    for (const mercyLine of await offerMerciful(actor, weapon, targetActor, damageResult)) {
      lines.push(line(mercyLine));
    }

    // THE EVENT RUNES that fire on a strike (Chapter 11, group 3).
    //
    // LIFE STEALING waits for a critical: "the target must make a
    // Fortitude saving throw to avoid taking 1d6 Soul Drain. This Soul
    // Drain immediately heals the wielder." The save is the TARGET's, so
    // it is posted for them to roll rather than rolled for them — the
    // same stance every opposed save in this system takes.
    const lifeStealing = equippedEventRune([weapon], "lifeStealing");
    // LIFE STEALING, ROLLED (3.618.0, C6; Graham's R11): on a critical, the
    // target's Fortitude save against the WEAPON's Level DC ("the items level
    // and not yours"); a failure takes 1d6 Soul Drain, which heals the
    // wielder by as much. Suppressed on a weapon that is not a slashing melee
    // one (B10), and said only on a critical (B13).
    if (lifeStealing && critical && runeUsageAllows("lifeStealing", weaponUsage(weaponData)).ok) {
      for (const stolen of await lifeStealingStrike(actor, weapon, targetActor)) lines.push(line(stolen));
    }
    // DA BIG ITTER'S FEAR (3.618.0, Graham's R15): offered on its critical.
    if (critical) {
      const castLine = await offerCriticalSpell(actor, weapon, targetActor);
      if (castLine) lines.push(line(castLine));
    }
    // GHOST TOUCH is said only when it mattered: against the incorporeal.
    if (ghostTouchHere) {
      lines.push(line(`<em>${weapon.name} — Ghost Touch: ${targetActor.name} is struck as though solid.</em>`));
    }
    // SUBMERSIBLE (Creature Codex, Chapter 3): applied at the roll since
    // 3.632.0 (see `underwaterStrikeExemption`); the line says so. Returning
    // is answered where the throw is spent (thrown-weapons.mjs).
    {
      const found = equippedEventRune([weapon], "submersible");
      if (found) lines.push(line(`<em>${found.rune.label}: ${found.rune.description}</em>`));
    }
    for (const said of baneLines) lines.push(line(said));

    // THE DAMAGE RUNES (Chapter 11). Each is a SEPARATE PACKET of its
    // own damage type, resolved against this target's own defences —
    // a fire-resistant creature resists a Flaming rune's 1d4 and takes
    // the sword's slashing in full, and folding them together would
    // lose that. Rolled and applied one at a time, each reported.
    //
    // Bane and Aligned depend on WHO is being hit, which nothing here
    // can know, so they are printed for the table rather than applied.
    //
    // SPELL RIDERS JOIN THE SAME LIST (3.437.0). Arrow Of The Wild Hunt,
    // Talon Strike and Spoil The Profane are the rune chapter's own
    // sentence — "secondary damage", the book's word for both — so they
    // are packets in this loop rather than a second loop of their own.
    // A parallel path would have been a second place deciding how
    // secondary damage meets a defence. Spoil's die arrives already
    // marked `conditional` and takes the branch directly above, exactly
    // as Aligned does. See magic/strike-riders.mjs.
    // AND THE GROUND THE TARGET IS STANDING ON (3.465.0). Consecrate and
    // Desecrate hang their 1d4 on the struck creature's location and
    // kind rather than on the attacker, so their packets come from the
    // scene — but they are the book's "secondary damage" like everything
    // else in this list, so they join the same loop rather than getting
    // a second one. See magic/area-rider.mjs.
    const areaPackets = areaRiderPackets(targetActor, targetTokenHere);
    // AN UNGUENT'S SECONDARY DAMAGE (3.617.0, C1): Combustion's 1d6 fire,
    // a packet like a Flaming rune's, on the weapon's coat or the round's.
    const unguentPackets = [...riderPackets(oilCoatOf(weapon), coatNow), ...riderPackets(ammoCoat, coatNow)]
      .map((packet) => ({ ...packet, mundane: true }));
    // WHAT A GATED RIDER ASKS (3.625.0): the target's kind, whether this
    // blow was a critical, and the target's hit points BEFORE the damage.
    const riderCtx = {
      targetTypes: creatureTypesOf(targetActor?.system ?? {}),
      // AND ITS TRAITS (3.626.0), for a rider gated on a word of the
      // traits line — Requiem's "Undead or Unliving trait".
      targetTraits: creatureTraits(targetActor?.system ?? {}),
      critical: Boolean(critical),
      // AND THE TYPE THIS STRIKE DEALS (3.627.0), for a rider gated on it —
      // Grave-Cold Touch rides an essence strike only.
      damageType: String(effectiveDamageType ?? "").trim().toLowerCase(),
      targetHp: Number(targetActor?.system?.resources?.hp?.value ?? NaN),
      targetMax: Number(targetActor?.system?.resources?.hp?.max ?? 0)
    };
    for (const rune of [
      // BANE IS IN THE STRIKE ITSELF (above); everything else is a packet.
      ...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon, riderCtx), ...areaPackets, ...typedExtras, ...unguentPackets
    ]) {
      if (rune.conditional && (!rune.resolved || !rune.applies)) {
        lines.push(line(`<em>${runeDamageLine(rune, 0)}</em>`));
        continue;
      }
      const runeRoll = await sharedRoll(sharedDamage, String(rune.type ?? ""), rune.dice);
      // UNSTOPPABLE FORCE reaches the blow's other packets too (3.659.0).
      const { setResistanceBypass: bypassFor, clearResistanceBypass: bypassClear } = await import("./damage-workflow.mjs");
      if (unstoppable) bypassFor([String(rune.type ?? "").toLowerCase()], 5);
      const runePacket = resolveAgainstDefences(targetActor.system, {
        amount: runeRoll.total,
        type: rune.type,
        creatureTypeSystem: ownedCreatureTypeSystem(targetActor),
        targetItems: Array.from(targetActor.items ?? []),
        attackerIsSwarm,
        incorporealTouch: ghostTouchHere,
        // A RUNE'S SECONDARY DAMAGE IS MAGICAL (3.626.1; found live on
        // Pillars of Faith 0.8.0, Requiem's essence against a ghost
        // "immune to mundane" resolving to 0). A Flaming rune's fire, a
        // feat rider's essence, a scene's area rider: every packet in this
        // loop is a magical source EXCEPT an unguent's, which is alchemy
        // on the blade and is as magical as the blade. Graham had this on
        // the observations list from 0.7.0's test.
        magical: rune.mundane ? strikeIsMagical : true,
        // AN ALIGNED PACKET CARRIES ITS ALIGNMENT (3.634.0, F&F 3.0 block 4
        // R3): "Weakness good" and "evil resistance" are alignment-keyed
        // defences, read against the damage's source traits.
        sourceTraits: alignedPacketTraits(rune)
      });
      if (unstoppable) bypassClear();
      lines.push(line(runeDamageLine(rune, runeRoll.total)));
      if (runePacket.taken !== runeRoll.total) {
        lines.push(line(
          `<em>${targetActor.name}'s defences: ${runeRoll.total} → ${runePacket.taken} ${rune.type}.</em>`));
      }
      if (runePacket.healsInstead !== undefined) {
        lines.push(line(`<em>${targetActor.name}: ${await applyHealsInstead(targetActor, runePacket)} (Fire Healing).</em>`));
      }
      if (runePacket.taken > 0) {
        // CORRODE (Creature Codex; 3.631.0) listens here: secondary damage
        // also lands on the target's metal armour (codex-hooks-workflow).
        Hooks.callAll("trgPrimeSecondaryDamage", { attacker: actor, target: targetActor, amount: runePacket.taken, type: rune.type, weapon });
        await applyDamageAndCheckDying(targetActor, runePacket.taken, {
          isCritical: false,
          damageTypes: [String(rune.type ?? "").trim().toLowerCase(), ...alignedPacketTraits(rune)].filter(Boolean),
          sourceLevel: Number(actor.system?.identity?.level ?? 0),
          sourceName: actor.name
        });
      }
      // "...and a secondary critical at -40." The chapter names the
      // modifier and never says what it modifies; read as the rune's own
      // damage type rolling on its own critical table at that number.
      // An interpretation, and recorded as one.
      // A SECONDARY CRITICAL ONLY ON A CRITICAL STRIKE (3.618.0, Graham's
      // R10): on the rune's own table, at the strike's severity, with the
      // rune's modifier. It used to roll on every hit, always minor.
      const secondary = secondaryCriticalFor(rune, critical);
      if (secondary) {
        await rollCriticalInjury(actor, {
          targetActor,
          damageType: rune.type,
          severity: secondary.severity,
          attackBonus: Number(system.combat?.attack?.total ?? 0),
          modifier: secondary.modifier
        });
      } else if (critical && (weaponSecondaryCritical(weaponData) || weapon?.flags?.[SYSTEM_ID]?.secondaryCritical === true)) {
        // SECONDARY CRITICAL (Creature Codex; 3.631.0): "On a critical hit,
        // the indicated attack inflicts an additional critical injury of 1
        // degree less severity of the secondary damage type" — a stat block
        // prints "1d6 poison plus secondary critical". Minor has no lesser
        // degree, so a Minor strike opens none.
        const lesser = oneDegreeLess(critical);
        if (lesser) {
          await rollCriticalInjury(actor, {
            targetActor, damageType: rune.type, severity: lesser,
            attackBonus: Number(system.combat?.attack?.total ?? 0), modifier: 0
          });
          lines.push(line(`<em>Secondary Critical: a ${lesser} ${rune.type} injury (one degree below the ${critical}).</em>`));
        }
      }
      // Vicious feeds half its damage back into the wielder, round up —
      // the one rune that costs the person swinging it. THROUGH THE
      // WIELDER'S OWN DEFENCES (3.618.0, Graham's R13): essence resistance
      // halves it, and immunity stops it.
      if (rune.feedbackOf) {
        const back = rune.feedbackOf(runeRoll.total);
        if (back > 0) {
          const fed = resolveAgainstDefences(actor.system, {
            amount: back, type: rune.type, creatureTypeSystem: ownedCreatureTypeSystem(actor), applyDR: false
          });
          if (fed.taken > 0) await applyDamageAndCheckDying(actor, fed.taken, { isCritical: false });
          lines.push(line(
            `<em>${rune.label} feeds back: ${back} ${rune.type} (half, rounded up)${fed.taken !== back ? ` → <strong>${fed.taken}</strong> after ${actor.name}'s defences` : ""} to ${actor.name}.</em>`));
        }
      }
    }
    // A HIT SPENDS ONE OF A COUNTED UNGUENT'S STRIKES (R4).
    if (unguentPackets.length && weapon?.id && actor.items?.get?.(weapon.id)) {
      const { spendRiderStrike } = await import("../oil-workflow.mjs");
      const said = await spendRiderStrike(weapon);
      if (said) lines.push(line(said));
    }
    // THE FIRE BOLT'S SPLASH REACHES THE NEIGHBOURS TOO (3.576.0) — named,
    // not applied, by Graham's splash ruling: the book prints no radius.
    for (const extra of typedExtras) {
      if (extra.splash) lines.push(line(splashNeighboursLine({ damageType: extra.type }, extra.splash)));
    }

    // A RIDER MAY ALSO CARRY A CONDITION, and it lands here because it
    // lands on a hit: Spoil The Profane's "on a hit ... the target
    // becomes weakened 1 until the beginning of your next turn". The
    // DAMAGE half of that spell is conditional on an aura nothing can
    // read and is printed above; this half is not conditional on
    // anything and is applied.
    for (const riderLine of await applyRiderConditions(actor, weapon, targetActor, riderCtx)) {
      lines.push(line(riderLine));
    }
    // AND THEN THE ONCE-RIDERS ARE SPENT, after they have been rolled and
    // after any condition they carry has landed. Read first, spend
    // second: reversing those two would delete the effect this card is
    // about to describe.
    for (const spentLine of await spendStrikeRiders(actor, weapon, { ctx: riderCtx })) {
      lines.push(line(spentLine));
    }
    // AND THE ONCE-PER-ROUND RIDERS ARE MARKED (3.625.0), on the hit that used them.
    for (const burntLine of await burnStrikeRiders(actor, weapon, riderCtx)) {
      lines.push(line(burntLine));
    }
    // A REGISTERED RUNE'S AFTER-STRIKE SAVE AND CRITICAL LINE (3.626.0):
    // Soulchain, Banishing, Remembrance. See rune-strike-workflow.mjs.
    for (const afterLine of await applyRuneAfterStrikes(actor, weapon, targetActor, { critical: Boolean(critical) })) {
      lines.push(line(afterLine));
    }
    // …AND THE ATTACKER'S OWN (3.627.0): a feat's after-strike on a critical
    // injury with a named natural attack — Ghoulish Venom, Paralytic Touch,
    // the Unliving diseases. See combat/declared-after-strikes.mjs.
    for (const afterLine of await applyDeclaredAfterStrikes(actor, weapon, targetActor, { critical: critical || null, damageTaken: Number(packet?.taken ?? 0) || 0 })) {
      lines.push(line(afterLine));
    }
    // A WEAPON'S "RECURRING +N" (3.656.0; F&F 3.0 block 23 R5 — the Fire
    // Primals' Fiery Slam): a hit that reaches the target also lays Recurring
    // N of the weapon's damage type, through the rule the bombs and spells
    // use (the stronger of one type is kept).
    {
      const { weaponRecurringValue } = await import("../codex-action-rules.mjs");
      const recurring = weaponRecurringValue(weapon.system?.traits);
      if (recurring > 0) lines.push(line(await layWeaponRecurring(targetActor, recurring, String(effectiveDamageType ?? weapon.system?.damageType ?? "fire"), Boolean(packet?.immune))));
    }
    // AND WHAT FELLING THE TARGET GIVES BACK (3.627.0) — Hunger Beyond Pain.
    for (const fellLine of await applyOnFell(actor, weapon, targetActor, finalCase)) {
      lines.push(line(fellLine));
    }

    // VIBRANT THORNS (3.440.0) — the same kind of packet, pointed the
    // other way. Placed beside the Vicious rune's feedback above, which
    // is the only other thing in this function that damages the person
    // who swung, and AFTER the blow has landed, because "lands a melee
    // blow" is the trigger. See magic/thorns.mjs.
    for (const thornLine of await applyThorns(actor, targetActor, {
      melee: isMelee,
      unarmed: isUnarmedAttack(weaponData),
      distanceFeet: meleeDistance,
      critical: Boolean(critical)
    })) {
      lines.push(line(thornLine));
    }

    // Critical Amendment (Chapter 6): armour that changes a critical
    // result in the wearer's favour takes damage equal to the attack's
    // base damage (the weapon's own base die, not the full total with
    // BAB/critical/Strength added) x1/x2/x3 by severity. Applied to
    // whichever equipped piece actually covers the struck location
    // (Chapter 7) — falling back to the first equipped piece only
    // when no hit location is known at all (the standalone Damage
    // button, with no critical injury roll to draw one from).
    if (armourAmended && critical) {
      const items = Array.from(targetActor.items ?? []);
      // INDESTRUCTIBLE (Chapter 11): "armour inscribed with this rune
      // completely negates a critical injury result that would normally
      // be reduced by it." So it acts exactly where the amendment does,
      // and the armour takes no damage for it either — the amendment's
      // cost is the price of reducing a critical, and this rune does not
      // pay it.
      const indestructible = equippedEventRune(items, "indestructible");
      if (indestructible) {
        lines.push(line(
          `<strong>${indestructible.item.name} is Indestructible</strong> — the critical result is negated completely, and the armour takes nothing for it.`));
      }
    }
    if (armourAmended && critical && !equippedEventRune(Array.from(targetActor.items ?? []), "indestructible")) {
      const items = Array.from(targetActor.items ?? []);
      const targetArmourItem = hitLocation
        ? items.find(
            (item) =>
              item.type === "armour" &&
              item.system?.equipped &&
              armourPieceCoversLocation(item, hitLocation)
          )
        : items.find((item) => item.type === "armour" && item.system?.equipped);
      const AMENDMENT_MULTIPLIER = { minor: 1, serious: 2, deadly: 3 };
      const amendmentDamage = async () => {
        const baseDieMatch = String(weaponData.damage || "1d6").match(/^(\d*)d(\d+)/i);
        const baseDieRoll = baseDieMatch
          ? await new Roll(`${baseDieMatch[1] || 1}d${baseDieMatch[2]}`).evaluate()
          : null;
        return (baseDieRoll?.total ?? 0) * (AMENDMENT_MULTIPLIER[critical] ?? 1);
      };
      // MAGE ARMOUR AND BRACERS TAKE THEIR SHARE (3.617.5, Graham's Q2 of
      // 4 October 2026). When the Base DR in force at the spot is theirs —
      // the same armour the blow's DR drained (MA2) — the amendment's
      // damage comes off their pool, not off a worn piece that was not the
      // armour the blow met. Under them alone there is no worn piece at all,
      // and the card used to say the armour took damage that nothing took.
      if (bracersSource && !drBypassed) {
        const { absorbAmendment } = await import("../bracers-workflow.mjs");
        const poolLine = await absorbAmendment(targetActor, await amendmentDamage(),
          `base die x${AMENDMENT_MULTIPLIER[critical] ?? 1}`);
        if (poolLine) lines.push(poolLine);
      } else if (targetArmourItem) {
        const armourDamage = await amendmentDamage();
        const hp = targetArmourItem.system?.hp;
        if (hp && Number(hp.max) > 0) {
          const itemDR = effectiveArmourDR(targetArmourItem, effectiveDamageType);
          const newValue = applyItemDamage(hp.value, armourDamage, itemDR);
          // THE PERMISSION BOUNDARY (3.339.4). The armour is an item on
          // the target, so writing to it needs the target's permissions.
          await relayItemHp(targetActor, targetArmourItem.id, newValue, () =>
            targetArmourItem.update({ "system.hp.value": newValue }));
          const status = itemStatus(newValue, hp.max);
          lines.push(
            line(
              `<em>${targetArmourItem.name} absorbs the critical:</em> ${armourDamage} damage (base die x${AMENDMENT_MULTIPLIER[critical] ?? 1}), reduced by its own DR ${itemDR}. Now ${newValue} / ${hp.max} HP${status !== "intact" ? ` (<strong>${status}</strong>)` : ""}.`
            )
          );
        } else {
          lines.push(
            line(
              `<em>${targetArmourItem.name} absorbs the critical</em> (${armourDamage} damage) but has no Max HP set — item damage isn't tracked for it.`
            )
          );
        }
      }
    }
  }

  const damageCompactSummary = () =>
    finalTaken !== null ? `${finalTaken} ${typeLabel} taken` : `${total} ${typeLabel}`;

  await postCard(actor, `${weapon.name} — Damage`, lines, [roll], {
    compactSummary: damageCompactSummary()
  });
  return { total, taken: finalTaken, damageCase: finalCase, newHP: finalHP, targetActor, damageType: effectiveDamageType, drStoppedCritical };
}

export async function rollWeaponDamage(actor, weapon, { preset = null } = {}) {
  const weaponData = weapon.system;
  // Sneak Attack, on the standalone damage path: this dialog has no
  // target in hand, so the flanked/flat-footed question is a tickbox
  // rather than the attack workflow's automatic detection. Weapon
  // eligibility is still the system's to answer — a non-agile,
  // non-finesse melee weapon does not offer the box at all.
  // A melee weapon needs agile/finesse whether swung or hurled, so the
  // melee-traits test already covers the thrown-melee clause here.
  const sneakOffered = hasSneakDice(actor) && sneakAttackWeaponEligible({
    isRanged: ["missile", "thrown"].includes(weaponData.attackMode),
    isThrownMelee: false,
    traits: weaponData.traits
  });
  const sneakOfferDice = sneakOffered
    ? sneakDiceFor(actor, actor.system?.skills?.stealth?.ranks ?? 0)
    : 0;
  // Precision Hunter, same treatment: no target in hand here, so
  // "this damaged my hunted prey, first time this round" is a tickbox;
  // the method being selected and the round marker are still the
  // system's to answer.
  const precisionOfferDice = precisionHunterOffer({
    actor,
    level: Number(actor.system?.identity?.level ?? 0),
    targetIsPrey: true,
    usedThisRound: Boolean(actor.getFlag?.(SYSTEM_ID, "precisionHunterUsed"))
  });
  const versatileAlternate = extractVersatileType(weaponData.traits);
  // Versatile and any declared type option (3.627.0), as the strike asks.
  // A TYPE SET RATHER THAN OFFERED (3.670.0; Tiger and Wolf Stance), here
  // as on the attack path: one is the type without a question.
  const standaloneOptions = declaredStrikeTypeOptions(Array.from(actor.appliedEffects ?? actor.effects ?? []));
  // The holder's unarmed abilities with this weapon (3.671.0, B7-6).
  const standaloneAbilityData = abilityStrikeView(weaponData, declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon));
  const standaloneForced = forcedStrikeTypes(standaloneAbilityData, standaloneOptions);
  const standaloneTypeChoices = standaloneForced.length ? standaloneForced : strikeTypeChoices(
    standaloneAbilityData, standaloneOptions, versatileAlternate);
  const showVersatile = standaloneTypeChoices.length > 1;
  const showHandAndAHalf = /\bhand\s*&\s*a\s*half\b/i.test(String(weaponData.traits ?? ""));
  // THE SAME x1.5 THE ATTACK PATH USES (3.575.0): a one-size-larger weapon
  // or a two-handed Hand & a Half grip, and never a thrown or fired one.
  const twoHandedHere = weaponData.attackMode === "melee" &&
    twoHandedStrengthApplies(weapon, actor.system?.identity?.size ?? "medium");

  // A HELD BLOW LANDING (3.668.0; Black Lotus): set by the hit it came from,
  // so nothing is asked. See combat/held-strike.mjs.
  const result = preset ? {
    critical: preset.critical || "",
    // HALF DAMAGE (3.668.0; Steel Viper's "if you miss with an attack, roll
    // the damage and deal it as half damage"), through the glancing halving.
    glancing: Boolean(preset.glancing),
    locationArmoured: preset.locationArmoured !== false,
    armourAmended: Boolean(preset.armourAmended),
    damageType: preset.damageType || null,
    sneakAttack: false,
    precisionHunter: false
  } : await DialogV2.wait({
    window: { title: `${weapon.name} — Damage`, icon: "fa-solid fa-burst" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `
      <div class="trg-prime trg-check-dialog">
        ${
          showVersatile
            ? damageTypeRadios(standaloneTypeChoices)
            : ""
        }
        ${
          showHandAndAHalf
            ? `<p class="hint">Hand &amp; a Half grip: <strong>${weaponData.twoHandedGrip ? "two-handed (die one size larger, ×1.5 Str)" : "one-handed"}</strong> — set when the weapon is equipped.</p>`
            : twoHandedHere
              ? `<p class="hint">One size larger than you, held two-handed: <strong>×1.5 Str</strong>.</p>`
              : ""
        }
        <div class="form-group">
          <label for="trg-damage-critical">Critical severity (from the Attack Check, AV 5+)</label>
          <select id="trg-damage-critical" name="critical">
            <option value="">None</option>
            <option value="minor">Minor</option>
            <option value="serious">Serious</option>
            <option value="deadly">Deadly</option>
          </select>
        </div>
        ${
          sneakOffered
            ? `<div class="form-group">
          <label><input type="checkbox" name="sneakAttack"> ${sneakDiceLabel(actor)} (+${sneakOfferDice}d6) — target was flanked or flat-footed</label>
        </div>`
            : ""
        }
        ${
          precisionOfferDice
            ? `<div class="form-group">
          <label><input type="checkbox" name="precisionHunter"> Precision Hunter (+${precisionOfferDice}d6) — first damage against your hunted prey this round</label>
        </div>`
            : ""
        }
        <div class="form-group">
          <label><input type="checkbox" name="glancing"> Glancing Blow (AV 0-1, optional rule)</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="locationArmoured" checked> Struck location is covered by armour</label>
          <p class="hint">Only matters on a critical (Chapter 7, DR & Criticals) — armour only reduces damage if it covers the specific location the critical result struck.</p>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="armourAmended"> Critical result was amended by the target's armour</label>
          <p class="hint">Chapter 6, Critical Amendment: if the target's armour changed the critical result in their favour (an "Armoured:" line applied), their armour takes damage from absorbing it. (Determined automatically when Damage is rolled straight from an Attack — this manual checkbox only applies here, when rolling Damage on its own with no critical injury roll to draw from.)</p>
        </div>
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Roll",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  // The tickbox is a claim of damage against the prey — the round's
  // marker burns exactly as it does on the automatic path.
  if (result.precisionHunter && precisionOfferDice) {
    await actor.setFlag(SYSTEM_ID, "precisionHunterUsed", true);
  }

  // FIST OF ROCK on the standalone roll too (3.577.0) — the same marker
  // the Strike reads, or a fist would hit harder from one button than
  // from the other.
  const { findMarker: findFistMarker } = await import("../magic/markers.mjs");
  const standaloneFist = stoneFistProfile(weapon?.system, Boolean(findFistMarker(actor, "fistOfRock")));
  // THE DAMAGE CONDITIONALS ON THIS BUTTON TOO (3.630.1, F16 of the 3.630.0
  // live test): Vowkeeper's class bonus was offered on a Strike's damage and
  // not on the sheet's own Damage roll — the second time a damage bonus
  // reached one of these two paths and not the other (see Fist of Rock).
  const standaloneDeclared = await declaredDamageBonus(actor, weapon, preset?.targetToken?.actor ? {
    context: { targetUuid: preset.targetToken.actor.uuid, attackMode: weaponData.attackMode === "melee" ? "melee" : "ranged", attackGroup: String(weaponData.group ?? "").trim().toLowerCase() }
  } : {});
  const damageResult = await resolveWeaponDamage(actor, weapon, {
    declaredBonus: standaloneDeclared.bonus,
    declaredBonusLines: [...(preset?.note ? [preset.note] : []), ...standaloneDeclared.lines],
    ...(preset?.targetToken ? { targetTokenOverride: preset.targetToken } : {}),
    critical: result.critical || null,
    glancing: Boolean(result.glancing),
    locationArmoured: Boolean(result.locationArmoured),
    armourAmended: Boolean(result.armourAmended),
    damageTypeOverride: showVersatile ? result.damageType || null
      : standaloneForced.length === 1 ? standaloneForced[0].type
      : (standaloneFist?.damageType ?? null),
    damageOverride: standaloneFist?.damage ?? null,
    usedTwoHanded: twoHandedHere,
    sneakDice: result.sneakAttack ? sneakOfferDice : 0,
    precisionDice: result.precisionHunter ? precisionOfferDice : 0
  });
  return damageResult.total;
}

/**
 * GHOST TOUCH THE CREATURE CARRIES (3.630.0), not its weapon: an applied
 * effect declaring `flags.trg-prime.ghostTouch = { whileStance: "Shadow
 * Stance" }` — every Strike it makes counts as Ghost Touch while that
 * stance's effect is up (or always, with no `whileStance`).
 */
function actorGhostTouch(actor, { magical = false } = {}) {
  const effects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
  for (const effect of effects) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.["trg-prime"]?.ghostTouch;
    if (!raw || typeof raw !== "object") continue;
    // MAGICAL ATTACKS ONLY (3.664.0): Inner Tempest's Ethereal Sight — "any
    // magical attacks you make against them inflict damage normally".
    if (raw.magicalOnly === true && !magical) continue;
    const stance = String(raw.whileStance ?? "").trim().toLowerCase();
    if (!stance) return true;
    // THE STANCE'S OWN EFFECT, by name: Shadow Stance is made by its feat's
    // Use (replaceFeatEffect), not by the feat-stance helper, so the name is
    // the one thing every stance's effect shares.
    if (Array.from(actor?.effects ?? []).some((e) => !e.disabled
      && String(e.name ?? "").trim().toLowerCase() === stance)) return true;
  }
  return false;
}

/** "+1 die of base damage" (Powerful Charge, Trample): the weapon's own formula with its count raised. */
/*
 * ONE DAMAGE ROLL FOR EVERY CREATURE A SHARED STRIKE HITS (3.649.0, block 16
 * R5). Keyed by the packet and its formula: the first hit rolls and records
 * it, every later hit with the same formula takes the same dice. A formula
 * that differs — a critical's bonus dice, a bane against this creature — is a
 * different roll, because it is different dice.
 */
async function sharedRoll(shared, key, formula) {
  if (!shared || typeof shared !== "object") return new Roll(formula).evaluate();
  const slot = `${key}|${String(formula ?? "").replace(/\s+/g, "")}`;
  if (shared[slot]) return Roll.fromData(shared[slot]);
  const roll = await new Roll(formula).evaluate();
  shared[slot] = roll.toJSON();
  return roll;
}

/**
 * This Strike's unarmed profile (3.667.0), from the attacker's items and
 * applied effects, or null. See combat/unarmed-profile.mjs.
 */
function unarmedProfileFor(actor, weaponSystem) {
  const carriers = [...Array.from(actor?.items ?? []), ...Array.from(actor?.appliedEffects ?? actor?.effects ?? [])];
  return unarmedProfile(weaponSystem, declaredUnarmedRows(carriers), Number(actor?.system?.combat?.bab?.total ?? 0));
}

function extraBaseDiceOverride(damage, extra = 0) {
  const n = Math.max(0, Math.floor(Number(extra) || 0));
  if (!n) return null;
  const m = /^(\d*)d(\d+)([+-]\d+)?$/i.exec(String(damage ?? "").trim());
  if (!m) return null;
  return `${Number(m[1] || 1) + n}d${m[2]}${m[3] ?? ""}`;
}

/** Secondary Critical (Creature Codex): the weapon's trait field says so, or a flag on it. */
function weaponSecondaryCritical(weaponData) {
  return /\bsecondary critical\b/i.test(String(weaponData?.traits ?? "")) || weaponData?.secondaryCritical === true
    || weaponData?.flags?.["trg-prime"]?.secondaryCritical === true;
}

/** One degree of critical severity down: deadly → serious → minor → none. */
function oneDegreeLess(severity) {
  const s = String(severity ?? "").toLowerCase();
  return s === "deadly" ? "serious" : s === "serious" ? "minor" : null;
}


/**
 * Howling Kinship's +1 for this attacker, or null (3.632.0, ruling 3). The
 * partner is the companion bound to this actor, or this companion's master;
 * the feat is the master's. Measured token to token.
 */
function howlingKinshipFor(actor) {
  const actors = Array.from(globalThis.game?.actors ?? []);
  let master = null;
  let partners = [];
  if (actor?.type === "companion") {
    const masterId = String(actor.system?.companion?.masterId ?? "").trim();
    master = masterId ? actors.find((a) => a.id === masterId) ?? null : null;
    if (master) partners = [master];
  } else {
    master = actor;
    partners = actors.filter((a) => a?.type === "companion" && String(a.system?.companion?.masterId ?? "").trim() === actor?.id);
  }
  if (!master || !ownsCodexFeat(master.items, HOWLING_KINSHIP)) return null;
  const mine = activeToken(actor);
  if (!mine) return null;
  let nearest = Infinity;
  for (const partner of partners) {
    const theirs = activeToken(partner);
    if (!theirs) continue;
    nearest = Math.min(nearest, Number(distanceBetween(mine, theirs)));
  }
  return howlingKinshipModifier({ masterOwnsFeat: true, partnerFeet: nearest });
}

/**
 * A WEAPON'S RECURRING DAMAGE (3.656.0; F&F 3.0 block 23 R5 — "recurring +N"
 * on the Fire Primals' Fiery Slam): laid through `recurringAfterHit`, the
 * rule the bombs and the spells use, so a second hit of one type keeps the
 * stronger rather than adding.
 */
async function layWeaponRecurring(targetActor, amount, damageType, immune) {
  if (immune) return `<em>No recurring ${damageType} damage — ${targetActor.name} is immune to ${damageType}.</em>`;
  const { recurringAfterHit } = await import("../bombs.mjs");
  const existingEffect = Array.from(targetActor.effects ?? []).find((e) => e.statuses?.has?.("recurring"));
  const existing = existingEffect
    ? { value: Number(existingEffect.getFlag(SYSTEM_ID, "value") ?? 0), damageType: existingEffect.getFlag(SYSTEM_ID, "damageType") ?? "" }
    : null;
  const next = recurringAfterHit(existing, amount, damageType);
  await targetActor.toggleStatusEffect("recurring", { value: next.value, damageType: next.damageType });
  return `Plus <strong>Recurring ${next.value} ${next.damageType}</strong> on ${targetActor.name} — dealt in its end phase until a flat check ends it`
    + `${next.replaced ? ", replacing the recurring damage already there" : ""}.`;
}
