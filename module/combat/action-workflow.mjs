import { attackCountOf, setAttackCount } from "./turn-records.mjs";
import { BIAS, TRGCheck } from "../dice/check.mjs";
import { resolveBias, biasWithKinds } from "../conditionals.mjs";
import { tracklessStepApplies } from "./passive-feats.mjs";
import { cannySmugglerEarnIncome, fullSpeedTrackingDC, groupCoercionFreeTargets, schooledInSecretsSkills, surveyWildlifeOutcome, shadowbornAgilityDegree, shadowbornStepNote } from "../skill-feats.mjs";
import { promptCheckConfiguration, skipDialog } from "../apps/check-dialog.mjs";
import { ensureActionPoints, actorInCombat, spendActionCost } from "./action-points-workflow.mjs";
import {
  PRESS_MANOEUVRE_KEYS,
  PRESS_SUCCESS_DEGREES,
  battleReadinessBonus,
  battleReadinessSpendBlock,
  reactionQualifies
} from "../fighter.mjs";
import { maybePromptPressTheAdvantage, rollCriticalInjury, rollWeaponAttack, weaponManeuverModifiers } from "./attack-workflow.mjs";
import { spatialAwarenessOutcome } from "./spatial-awareness.mjs";
import { arrestAFallOutcome, catfallOutcome } from "./fall-reaction.mjs";
import { applyPainTolerance } from "./pain-tolerance.mjs";
import { thornboundOffer } from "../codex-runes.mjs";
import { resolveShieldBlock } from "./shield-block-workflow.mjs";
import { resolveAlignedControl } from "../aligned-control-workflow.mjs";
import { refocusBlunderFormula } from "./refocus.mjs";
import { actionAbilityRows } from "../focus-declarations.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";
import { DAILY_FIRSTS_FLAG, dailyFirstAdvantage, dailyFirstDegree, dailyFirstExact, dailyFirstExactDegree, dailyFirstSpent, hasDailyFirst } from "../daily-firsts.mjs";
import { applyRefocusOutcome, chooseRefocusTarget, restoreRefocusCompanion } from "./refocus-workflow.mjs";
import { rallyReduction } from "./rally.mjs";
import { repairHPRestored } from "./repair.mjs";
import {
  consumePreparedReaction, preparableReactions, preparationCovers, preparedReaction,
  promptPreparedReaction, storePreparedReaction
} from "./prepare.mjs";
import {
  TOOL_USE_ACTIONS, createKitShortfall, heldToolFor, toolDifficultyStep, toolShortfall, toolShortfallText
} from "../tools-requirement.mjs";
import { itemStatus, applyItemDamage } from "../items.mjs";
import { castSpell } from "../magic/cast-workflow.mjs";
import { usableAttacks, getOrCreateUnarmedStrike } from "./strike.mjs";
import {
  maneuverWeapon,
  hasSilentWeaponEquipped,
  sizeCategoryDifference,
  maneuverSizePenalty,
  MANEUVER_SIZE_PENALTY,
  countsTowardMAP,
  mapPenalty
} from "./attack.mjs";
import { coverAllowsHide } from "./ranged.mjs";
// STATICALLY, NOT INSIDE `settleMount` (3.579.1, F3). A dynamic import
// there is invisible to `verify-rules-have-callers`, which then called
// `sizeSteps` uncalled and had it un-exported — and Mount threw on the
// first live click. An import the ratchet can see cannot drift that way.
import { sizeSteps } from "./space.mjs";
import { spendToolUse } from "../gear-uses-workflow.mjs";
import {
  extractHealAmount,
  extractAttitudeShift,
  extractConditionIncrease,
  extractConditionReduction,
  extractCircumstanceBonus,
  extractPushDistance
} from "../effect-parser.mjs";
import { pushButtonsHtml } from "./forced-movement-workflow.mjs";
import { involuntaryMovementPrompts } from "./forced-movement.mjs";
import {
  basicActionConditionEffects,
  applyBasicActionConditionEffects, climbingFlatFooted
} from "./basic-action-conditions.mjs";
import {
  activeTakeCover, applyBasicActionStance, applyTakeCover, endTakeCover, takeCoverLevelOf
} from "./basic-action-stances.mjs";
import { accrueAim, clearAimIfOtherAction } from "./aim.mjs";
import { readInvokedSkillKey } from "../specialist-skill-table.mjs";
import { promptAllySelection, applyAidBonus } from "./aid-bonus.mjs";
import {
  equippedBashableShield,
  rollShieldBashDamage,
  rollShieldBashFumble,
  loseShieldBonusUntilNextTurn
} from "./shield-bash.mjs";
import {
  coupDeGraceAttackOutcome,
  coupDeGraceSaveDC,
  coupDeGraceSaveResult
} from "./coup-de-grace.mjs";
import { itemRequiredHands } from "../held-items.mjs";
import { enterDelay, returnFromDelay, isActorDelayed } from "../documents/delay.mjs";
import { BASIC_ACTIONS } from "../data/basic-actions.mjs";
import { SKILL_ACTIONS } from "../data/skill-actions.mjs";
import {
  isReadyEligible,
  readiedAction,
  readyActionAndEndTurn,
  consumeReadiedAction
} from "./ready.mjs";
import {
  stepDifficultyHarder,
  levelDC,
  basicSavingThrow,
  DIFFICULTY_BY_KEY
} from "../dice/resolution.mjs";
import {
  invokeRageResult,
  revokeRageResult,
  rageBlocksAction,
  rageExtensionDifficulty,
  rageExtensionSucceeds
} from "./rage.mjs";
import {
  beginRage,
  canExtendRage,
  canInvokeRage,
  canRevokeRage,
  endRage,
  isRaging,
  markRageRideOut,
  rageExtensionsUsed,
  recordRageExtension
} from "./rage-workflow.mjs";
import { spendTemporaryHP } from "./temporary-hp.mjs";
import { isArmableMovement } from "./movement.mjs";
import { armMovementAction, armedMovementSummary, clearArmedMovement } from "./movement-workflow.mjs";
import { recordTraitUsage, traitGate, wordAftermathModifier } from "../traits-workflow.mjs";
import { applyEscapeRoute } from "./escape.mjs";
import { armCharge, chargeState } from "./charge-workflow.mjs";
import { runDoubleSlice } from "./double-slice-workflow.mjs";
import { activeToken } from "./geometry.mjs";
import { promptEscapeRoute } from "./escape-workflow.mjs";
import {
  actorDeliberateActionBlocked,
  actorFullDefenceBlock,
  actorReactionBlock,
  noteFullDefenceMove
} from "./reactions.mjs";
import { immuneToEffect, secretRollMode, hasTrait } from "../traits.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { extractDurationRounds, extractModifier } from "../outcome-effects.mjs";
import { addPendingModifier } from "../pending-modifiers.mjs";
import { readsGenericModifier, scopeNamesAction } from "./dedicated-rows.mjs";
import {
  adjustableRows,
  criticalAdjustAllowance,
  criticalReactionTrigger,
  modifiesCriticalResult,
  sizeAdjustedDifficulty
} from "./critical-adjust.mjs";
import {
  TREAT_WOUNDS_DC_PER_TARGET, medicineTradedApCost, painToleranceIgnoredPoints,
  treatWoundsBonusHealing, treatWoundsTargetDC
} from "../medicine-modifiers.mjs";
import { actionFeatModifiers, apCostReduction, applyActionVariant, applyReactionToFree, applyTraitRemovals, oncePerRoundFreeAction } from "../feats.mjs";
import {
  applyStudyOutcome,
  promptStudyTime,
  studiedTargetStatus
} from "../study-target-workflow.mjs";
import {
  ladderModifier,
  subsistModifiers,
  timeLadder,
  identifyPowerLadderFor
} from "../general-skill-options.mjs";
import { hasTradeoffs, tradedApCost } from "../difficulty-tradeoffs.mjs";
import {
  promptDifficultyTradeoffs,
  tradeoffNote
} from "../difficulty-tradeoffs-workflow.mjs";
import {
  promptAssessTracks,
  promptCoverTracks,
  promptDispel,
  promptGatherHerbs,
  promptJumpDistance,
  promptPickPocket,
  promptRechargeItem,
  promptSensePowerAura,
  promptSneakOptions,
  promptSubsistOptions,
  promptTimeLadder
} from "../general-skill-options-workflow.mjs";
import { auraModifier, isSensePowerAction } from "../sense-power.mjs";
import { sneakModifiers } from "../stealth.mjs";
import { coverTracksPenalty, herbsAtOnce, herbYield, herbYieldWeight } from "../survival-rules.mjs";
import {
  assessTracksDC, assessTracksNote, assessTracksFailureNote
} from "../assess-tracks.mjs";
import {
  QUESTIONABLE_SOURCE_ACTION, hasQuestionableSource, questionableSourceNote
} from "../questionable-source.mjs";
import { GUARDED_OBJECT_DC, disableSuccesses, pickPocketAutoFail } from "../thievery.mjs";
import { misreadFlagPatch, misreadModifier, withMisread } from "../sense-motive.mjs";
import { deletionValue } from "../deletion.mjs";
import { maxPPPerCast } from "../magic/casting.mjs";
import { applyPowerPointCost } from "../power-points-workflow.mjs";
import { counteractModifier } from "../counteract.mjs";
import { speedValue } from "./speed-pool.mjs";
import { rechargeAmount, rechargeConsequence, FUMBLE_BLOCK_SECONDS } from "../recharge-item.mjs";
import { isJumpAction, jumpDCLabel, jumpNote, isNaturalLeaper, naturalLeaperJump, naturalLeaperLine, leapApCost } from "../jumping.mjs";
import { TREAT_AFFLICTION_KIND, firstAidDC, treatAfflictionDC } from "../medicine-dc.mjs";
import {
  applyRuneTransfer,
  promptRuneTransfer,
  runeTransferNote
} from "../rune-transfer-workflow.mjs";
import { recordFlyAction } from "./fly-workflow.mjs";
import { airborne, airborneActionNote } from "./fly.mjs";
import { underwaterGroundActionNote } from "./underwater.mjs";
import { tokenIsUnderwater } from "./underwater-workflow.mjs";
import { requiresSpecialty, SKILL_SPECIALTIES } from "../skill-specialties.mjs";
import { hasAnySpecialty, isSkillDeveloped, specialtyChoices } from "../skill-specialties-workflow.mjs";
import {
  earnIncomeStatus,
  isSkillTrained,
  openEarnIncomeManager,
  promptTaskLevel,
  skillRanks,
  startEarnIncomeTask
} from "../earn-income-workflow.mjs";
import {
  CONSUMABLE_ITEM_TYPES, alchemicalCheckTraits, actionCheckTraits, consumableDCModifier, meetsRankRequirement, ruinedOnTheDay
} from "../create-crafting.mjs";
import {
  activeCreateProject,
  createProjectStatus,
  itemTypesForSkill,
  openCreateManager,
  promptCreateSetup,
  recheckCreateProject,
  startCreateProject
} from "../create-crafting-workflow.mjs";
import { featGovernedCreateTypes, featlessHerbDC } from "../crafting-feats.mjs";
import {
  applyLearnSpellOutcome,
  learnSpellEligible,
  learnSpellSetupModifier,
  promptLearnSpellSetup
} from "../magic/learn-spell-workflow.mjs";
import {
  ACTION_CHECK_TYPES,
  OUTCOME_KEYS,
  actionNeedsSkillChoice,
  actionSkillChoices,
  actionSkillIsUnnamed,
  actionTargetDC,
  pickOutcome
} from "./action.mjs";
import { DEGREES, DEGREE_BY_KEY } from "../dice/resolution.mjs";

/** The degrees an action prints text for — the book's list, in order. */
const declaredOutcomeKeys = (action) =>
  OUTCOME_KEYS.filter((key) => String(action?.outcomes?.[key] ?? "").trim().length);
import { defaultActionDC, defaultDCCaption } from "./action-default-dc.mjs";
import { defenceDCBonus } from "./defence-dc.mjs";
import {
  rollsAsCheck, declaredDegree, automaticSuccessLine, listedOutcomesFor, unmatchedOutcomeLine
} from "./action-degrees.mjs";
import { creatureTypesOf } from "../aligned.mjs";
import {
  ATTITUDE_GATES, attitudeDegreeSteps, attitudeGateFor, improveDegree
} from "../attitude.mjs";
import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";
import { ACTION_IMMUNITIES, actionImmunityKey } from "../temporary-immunity.mjs";
import { concentrateRefusal, deliberateRefusal } from "../conditions/condition-rules.mjs";
import { rarityRaiseForAction, rarityRaiseNote } from "../trait-rules.mjs";
import { creatureTraits } from "../creature-traits.mjs";
import { abilityJump, abilityMapExemptActions } from "../creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Where a reader's Detect Deception misreads live (Chapter 4, page 92).
 *
 * ON THE READER, KEYED BY TARGET. It is their memory of having been
 * fooled by that creature, not a state the creature carries around — so
 * two characters who each fumbled against the same liar hold their own
 * penalties, and neither inherits the other's.
 */
const DETECT_DECEPTION_FLAG = "detectDeceptionMisreads";

/**
 * MOUNT / DISMOUNT SUCCEEDED — so the rider's state changes (3.576.0).
 *
 * Graham, 19 September 2026 (R4). The action printed "You mount, or
 * dismount" and nothing recorded which, so the Lance and the Composite
 * Longbow could not be held to their own sentences. Mounted if not, off
 * if so; the targeted creature, if any, is named as the mount.
 *
 * @returns {Promise<string>} the card line
 */
async function settleMount(actor, targetActor) {
  const { MOUNTED_FLAG, mountedState, mountedAfterSuccess, mountSizeAllowed } =
    await import("./mounted.mjs");
  const { clearRidden, markRidden, syncSharedAP } = await import("./mounted-workflow.mjs");
  // THE STEED'S HANDLE TOO (3.577.0), so a combat beginning can find it
  // and ask whether it panics (R8 of the block-17 audit).
  const targetToken = game.user?.targets?.first?.() ?? null;
  const handle = targetActor ? actorHandle(targetActor, targetToken?.document ?? null) : null;
  const was = mountedState(actor);
  const next = mountedAfterSuccess(was, targetActor?.name ?? "", handle);
  if (next) {
    // "It is necessary for your mount to be at least one size larger than
    // you and willing to be ridden" (page 200; R13). Willingness is the
    // GM's; the size is not, and nothing had checked it.
    if (targetActor) {
      const steps = sizeSteps(
        targetActor.system?.identity?.size, actor.system?.identity?.size);
      if (!mountSizeAllowed(steps)) {
        ui.notifications.warn(
          `${targetActor.name} is not at least one size larger than ${actor.name} — page 200.`);
        return `<em>${targetActor.name} is too small to be ridden by ${actor.name} `
          + "(page 200: a mount must be at least one size larger).</em>";
      }
    }
    await actor.setFlag(SYSTEM_ID, MOUNTED_FLAG, next);
    // BOTH ENDS OF THE LINK (page 200; R13), so the shared AP pool and
    // the shared multiple attack penalty can be asked from either.
    await markRidden(actor, targetActor);
    const pool = await syncSharedAP(actor);
    return `<strong>${actor.name} is mounted</strong>${next.mount ? ` on ${next.mount}` : ""}.`
      + (pool === null ? "" : ` <em>One shared pool of <strong>${pool} AP</strong>, and one `
        + "multiple attack penalty between them (page 200).</em>");
  }
  const steed = was.steed ? await resolveActorHandle(was.steed) : null;
  if (steed) await clearRidden(steed);
  await actor.unsetFlag(SYSTEM_ID, MOUNTED_FLAG);
  return `<strong>${actor.name} dismounts</strong> and is no longer mounted.`;
}

/**
 * Resolve any Basic, Special, or Skill Action definition (a plain data
 * object from module/data/basic-actions.mjs, special-actions.mjs, or
 * skill-actions.mjs — never an Item; see those files for why). Rolls the
 * right check against the right derived DC and reports the achieved
 * outcome, so adding an action is data entry, not code, exactly as when
 * this was item-based — only the source of the data object changed.
 */

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/*
 * WHAT `rollsAsCheck` AND `automaticSuccessLine` NEED TO KNOW, in one
 * place so the two cannot be told different things (3.582.0).
 *
 * THE SPEEDS ARE READ THROUGH `speedValue`, NOT `Number()`. A movement
 * pool is `{base, total, …}` and `Number({…})` is NaN, so a raw read
 * would answer "no climb speed" for every character who has one — the
 * defect 3.412.1 fixed once already, and the one `verify-speed-pool`
 * exists to refuse.
 */
function actionCheckState(actor, action) {
  const movement = actor?.system?.combat?.movement ?? {};
  return {
    inEncounter: Boolean(globalThis.game?.combat?.started),
    speeds: {
      climb: speedValue(movement.climb),
      swim: speedValue(movement.swim)
    },
    // The GM's own clause — "hazardous conditions, extremely challenging
    // surfaces… turbulent waters" — left where the book leaves it.
    hazardous: action?.hazardous === true
  };
}

/*
 * FLAT-FOOTED WHILE CLIMBING (3.582.0; the pages 221-230 audit's D5,
 * Graham's R9 of 22 September 2026: "Yes").
 *
 * Applied whatever the degree — the book ties it to being on the wall,
 * not to how the roll went — and waived by a climb speed or by the +2 DC
 * the difficulty table already sells for it.
 *
 * A FUNCTION RATHER THAN AN INLINE BLOCK INSIDE `applyActionOutcome`,
 * and `verify-action-default-dc` is the reason. That check derives which
 * actions are DEGREE-GATED by looking for an `action.key` comparison in
 * the outcome function and asking whether the word "degree" appears
 * nearby — so an inline block put Climb in a class it does not belong to
 * (its DC is the GM's, and this rule ignores the degree entirely) and B5
 * called it stranded. The check was right about its own rule; the code
 * was shaped so as to lie to it. Moving the rule out of that function
 * tells the truth instead of widening the check.
 */
async function climbingFlatFootedLines(actor, action, targetActor, ctx) {
  if (action?.key !== "climb") return [];
  const climbing = climbingFlatFooted({
    climbSpeed: speedValue(actor?.system?.combat?.movement?.climb),
    ignoresFlatFooted: (ctx?.chosenTradeoffs ?? []).includes("notFlatFooted")
  });
  if (!climbing.length) return [];
  await applyBasicActionConditionEffects(climbing, actor, targetActor, { actionKey: action.key });
  return [
    "<em>Flat-footed while climbing (page 226) — a Climb Speed, or the +2 DC trade-off, "
    + "would waive it.</em>"
  ];
}

/*
 * BURROWING HOLDS YOUR BREATH (3.582.0; the pages 221-230 audit's D7,
 * Graham's R11 of 22 September 2026: "Yes"). Page 226: "When burrowing,
 * most creatures must hold their breath."
 *
 * THE LADDER ALREADY EXISTS. Block 20 built the whole of page 202 —
 * lungful capacity, air spent per turn, the suffocation saves and what a
 * failed one costs — for going underwater. Burrowing is the same
 * predicament through a different medium, so it starts the same clock
 * rather than growing one of its own.
 *
 * A FUNCTION CALLED FROM BOTH BRANCHES, and that is the whole reason it
 * is one. Burrow declares `checkType: "none"`, so it resolves down the
 * NO-ROLL path — and block 20's F3 was a note written into the check
 * path only, on an action that takes the other one: High Jump said
 * nothing about being airborne because the sentence was in the branch it
 * never reached. One helper, both call sites, no second chance to get it
 * wrong.
 */
async function burrowingBreathLines(actor, action) {
  if (action?.key !== "burrow") return [];
  const { startHoldingBreath } = await import("../drowning-workflow.mjs");
  const air = await startHoldingBreath(actor);
  if (!air) return [];
  return [
    `<em>Burrowing — holding your breath (page 226). <strong>${air} rounds</strong> of air, `
    + "on page 202's clock.</em>"
  ];
}

async function postCard(actor, title, lines, { flags = null, extraContent = "", secret = false } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    // A SECRET ACTION'S OUTCOME (3.629.1): its check is rolled blind, so the
    // outcome is the GM's to tell as well — whispered, not posted for all.
    ...(secret ? { whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id) } : {}),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}${extraContent}</div>`,
    ...(flags ? { flags } : {})
  });
}

/**
 * First Aid / Resuscitation (Chapter 8): "By increasing the
 * difficulty of the check by [4 / one step] you may reduce the AP
 * cost of this action by 1 (min 1 AP)." Run after the situational
 * dialog (not before), since First Aid's own DC is manually entered
 * rather than derived — this way the increase applies to whatever
 * DC the player actually settled on, no mental arithmetic required
 * on their part.
 */
async function promptMedicineApTradeoff(actionName, hint) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: `${actionName} — AP Trade-off`, icon: "fa-solid fa-kit-medical" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label><input type="checkbox" name="traded"> ${hint}</label>
        </div>
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Continue",
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
  return Boolean(result.traded);
}

/**
 * Treat Wounds (Chapter 8): "For every 1 that you increase the DC,
 * you may heal an additional 1 hit points (max of +20, doubled on a
 * critical)." A number, not a checkbox — the player can commit any
 * amount from 0 to 20 before the roll, per the rulebook's own
 * wording ("increase the DC before rolling").
 */
async function promptTreatWoundsExtraDC(actionName) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: `${actionName} — Extra Healing`, icon: "fa-solid fa-kit-medical" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-extra-dc">Extra DC before rolling (0-20)</label>
          <input id="trg-extra-dc" type="number" name="extraDC" min="0" max="20" value="0">
        </div>
        <p class="hint">Each point heals 1 additional Hit Point on success, doubled on a critical.</p>
        <div class="form-group">
          <label for="trg-extra-targets">Additional targets (+${TREAT_WOUNDS_DC_PER_TARGET} DC each)</label>
          <input id="trg-extra-targets" type="number" name="extraTargets" min="0" max="10" value="0">
        </div>
        <p class="hint">Target them before rolling; the healing reaches whoever you have targeted.</p>
      </div>`,
    buttons: [
      {
        action: "roll",
        label: "Continue",
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
  return {
    extraDC: Math.max(0, Math.min(20, Math.floor(Number(result.extraDC) || 0))),
    extraTargets: Math.max(0, Math.min(10, Math.floor(Number(result.extraTargets) || 0)))
  };
}

/**
 * Take Cover (Chapter 4): "if you would have standard cover, you
 * instead gain greater cover... otherwise, you gain the benefits of
 * standard cover" — a GM-adjudicated fact about the actor's current
 * position that this system doesn't track, so the workflow asks
 * directly rather than guessing.
 */
async function promptTakeCoverLevel(actionName) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: actionName, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">What cover is there? Standard cover upgrades to greater; a creature in the way is lesser cover.</p>
        <p class="hint">Standard and greater each add their bonus to your <strong>DB, Reflex saves and Stealth</strong> (page 198). Lesser cover adds to DB alone, and you cannot Hide behind it.</p>
      </div>`,
    buttons: [
      { action: "greater", label: "I already have standard cover — Greater (+8)", icon: "fa-solid fa-shield-halved", default: true },
      { action: "standard", label: "Standard Cover (+4)", icon: "fa-solid fa-shield" },
      // LESSER COVER (R4): "a creature is in the way" — +2 to DB only,
      // and no hiding behind it. Defined since the first cover work and
      // reachable from nothing until 3.579.0.
      { action: "lesser", label: "A creature is in the way — Lesser (+2 DB)", icon: "fa-solid fa-user" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result;
}

/**
 * Coup de Grace (Chapter 4): "if the target is immune to critical
 * hits, the coup de grace does not deal critical damage or effects,
 * nor does it force the target to succeed at a saving throw or die."
 * This system has no tracked field for critical immunity anywhere
 * (it exists as a supported parameter in attackOutcome but was never
 * actually wired to any data source before this), so asked directly
 * rather than guessed.
 */
async function promptCriticalImmune(targetName) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: "Coup de Grace", icon: "fa-solid fa-skull" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">Is ${targetName} immune to critical hits?</p></div>`,
    buttons: [
      { action: "yes", label: "Yes — Immune", icon: "fa-solid fa-shield" },
      { action: "no", label: "No", icon: "fa-solid fa-xmark", default: true },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-ban" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result === "yes";
}

/**
 * "If the target survives the attack" — this workflow doesn't roll
 * or apply the actual weapon damage itself (that's this system's
 * existing, separate Apply Damage step), so it asks directly once
 * that's been resolved at the table.
 */
async function promptTargetSurvived(targetName) {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: "Coup de Grace", icon: "fa-solid fa-skull" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">Once damage has been applied, did ${targetName} survive?</p></div>`,
    buttons: [
      { action: "yes", label: "Yes — Survived", icon: "fa-solid fa-heart-pulse", default: true },
      { action: "no", label: "No — Already Dead", icon: "fa-solid fa-skull-crossbones" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-ban" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result === "yes";
}

function firstTargetActor() {
  return firstTargetToken()?.actor ?? null;
}

/**
 * THE TOKEN, NOT ONLY THE ACTOR (3.469.0).
 *
 * `firstTargetActor` threw the token away, and every card that recorded
 * its result did so by actor id alone — which for an unlinked token names
 * the sidebar sheet rather than the creature. See module/actor-handle.mjs.
 */
function firstTargetToken() {
  return game.user.targets?.first?.() ?? [...(game.user.targets ?? [])][0] ?? null;
}

/**
 * The OTHER creatures this user has targeted, for Treat Wounds' bought
 * additional targets (page 87).
 *
 * @param {Actor} primary The creature the card's own button heals.
 * @param {number} limit How many additional targets were paid for.
 * @returns {Array<{targetActorId:string, handle:object|null, name:string}>}
 */
function extraHealTargets(primary, limit) {
  const wanted = Math.max(0, Math.floor(Number(limit) || 0));
  if (!wanted) return [];
  const out = [];
  const seen = new Set([primary?.id].filter(Boolean));
  for (const token of game.user.targets ?? []) {
    const actor = token?.actor;
    // ONE ENTRY PER CREATURE, not per token: two tokens of the same
    // linked actor are one patient, and healing them twice from one
    // check would be a bug the card itself could not explain.
    if (!actor || seen.has(actor.id)) continue;
    seen.add(actor.id);
    out.push({ targetActorId: actor.id, handle: actorHandle(actor, token), name: actor.name });
    if (out.length >= wanted) break;
  }
  return out;
}

/**
 * WHAT A CONDITION ASKS AT THE POINT OF COMMITMENT (3.621.0; Appendix 2,
 * block 39's R7), once the AP is spent and before the action does anything:
 *
 * - Deafened, on an Auditory action, and Grabbed, on a Manipulate one: a
 *   DC 5 flat check, "or the action is lost";
 * - an offensive action ends the Fixated of whoever it is aimed at, and of
 *   their allies — "if you or any of your allies are subjected to hostile
 *   actions by another creature".
 *
 * @returns {Promise<boolean>} false when the action is lost.
 */
async function conditionCommitGate(actor, action) {
  const { endFixationOnHostileAct, passActionFlatChecks } = await import("../conditions/condition-events-workflow.mjs");
  if (!(await passActionFlatChecks(actor, action))) return false;
  try {
    const { isOffensiveAction } = await import("../magic/flat-ladder.mjs");
    if (isOffensiveAction(action)) {
      const targets = Array.from(game.user?.targets ?? []).map((t) => t?.actor).filter(Boolean);
      if (targets.length) await endFixationOnHostileAct(targets, actor);
    }
  } catch (_e) {
    // The action has been paid for; a fixation left standing is the lesser harm.
  }
  return true;
}

/**
 * Release (Chapter 4): "You drop an item that you are holding..." —
 * lists the actor's currently equipped hand-occupying items (per the
 * same itemRequiredHands logic the hand-budget system already uses)
 * and unequips the chosen one. The action's other two uses (release
 * your hold on something; change grip) have no persistent state in
 * this system to change — grip is already chosen per-attack for
 * Hand & a Half weapons — so those stay narrative, and choosing
 * "nothing" is a valid way to use the action for them.
 */
async function promptReleaseItem(actor) {
  const { DialogV2 } = foundry.applications.api;
  const actorSize = actor.system?.identity?.size ?? "medium";
  const held = Array.from(actor.items ?? []).filter(
    (item) => item.system?.equipped && itemRequiredHands(item, actorSize) > 0
  );

  const rows = held
    .map(
      (item, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="released" value="${item.id}" ${index === 0 ? "checked" : ""}>
          <span>${item.name}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Release — Drop an Item", icon: "fa-solid fa-hand" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `
      <div class="trg-prime trg-check-dialog">
        ${held.length ? rows : "<p class=\"hint\">Nothing hand-occupying is currently equipped.</p>"}
      </div>`,
    buttons: [
      ...(held.length
        ? [
            {
              action: "drop",
              label: "Drop It",
              icon: "fa-solid fa-hand",
              default: true,
              callback: (event, button) => {
                const form = button.form ?? button.closest?.("form");
                const FDE =
                  foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
                return new FDE(form).object.released;
              }
            }
          ]
        : []),
      { action: "none", label: "Release Hold / Change Grip Only", icon: "fa-solid fa-hand-back-fist", default: !held.length },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  if (result === "none") return { item: null };

  const item = actor.items.get(result);
  return item ? { item } : { item: null };
}

/**
 * Ready (Chapter 4): prompts for which action (no more than 2 AP) to
 * ready, and a trigger — free text, since watching for an arbitrary
 * narrative condition isn't something this system can do
 * mechanically. Scoped to basic and skill actions specifically,
 * which all already share resolveAction as their single entry point.
 */
/**
 * Strike (Chapter 4): when more than one usable attack is equipped,
 * asks which one to attack with.
 */
/**
 * Ready → Cast a Spell (Chapter 4/9), per Graham directly. No spells
 * exist in this compendium yet, so this is necessarily generic:
 * whichever of the actor's own spell items are at 2 AP or less,
 * chosen at the moment the trigger actually occurs (not locked in
 * when readying) — the same reasoning as Strike's own weapon choice,
 * since which spell makes sense can depend on exactly what's
 * happening when the trigger fires.
 */
/**
 * Pain Tolerance (Chapter 6): asks which of Dazed, Injured, or
 * Weakened to suppress a point of — only offers ones the actor
 * actually has active, since there's nothing to ignore otherwise.
 */
/**
 * Repair (Chapter 6): asks which damaged physical item to fix — only
 * items with a tracked max HP, below full, and not already destroyed
 * ("you cannot Repair a destroyed item").
 */
/**
 * Who is being tracked — asked before a Track check, so Trackless Step can
 * apply to the roll it is written about.
 *
 * NOBODY NAMED IS A VALID ANSWER, and it is the default: a GM tracking
 * something that is not a token on this scene should not be forced to
 * invent one. Cancelling does not abort the action either — Track is
 * useful without knowing whose feats apply, and a picker that could cancel
 * a check would be a worse bargain than one that can be skipped.
 *
 * @returns {Promise<Array<object>>} the chosen actors, possibly empty
 */
/**
 * The bias a Track check ends up with once its quarry is known.
 *
 * Exported so the whole rule is driven rather than read: what the picker
 * collects is a list of actors, and what matters is the single question of
 * whether any of them makes the roll harder.
 */
/**
 * The roll's bias with further advantage/disadvantage kinds reconciled in
 * one pass (3.665.0). With no kinds the chosen bias is returned untouched —
 * exactly what the roll received before.
 */
function rollBiasWith(chosen, kinds = []) {
  return biasWithKinds(chosen, kinds, BIAS);
}

export function tracklessBias(chosen, quarry) {
  const applies = tracklessStepApplies(
    Array.from(quarry ?? []).map((a) => Array.from(a?.items ?? [])
      .filter((i) => i.type === "feat").map((i) => i.name))
  );
  if (!applies.disadvantage) return chosen;
  return resolveBias(chosen, ["disadvantage"], BIAS);
}

async function promptTrackQuarry() {
  // DialogV2 WAS USED HERE AND NEVER BOUND (fixed 3.365.0). Every other
  // dialog in this file destructures it first; these three sites did not,
  // so Track's quarry prompt threw the moment it opened.
  const { DialogV2 } = foundry.applications.api;
  const candidates = (canvas?.tokens?.placeables ?? [])
    .map((t) => t.actor)
    .filter((a, i, all) => a && all.indexOf(a) === i);
  if (!candidates.length) return [];

  const rows = candidates
    .map((a, i) => `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">`
      + `<input type="checkbox" name="quarry" value="${i}"> <span>${a.name}</span></label>`)
    .join("");
  const picked = await DialogV2.wait({
    window: { title: "Track — whose trail?", icon: "fa-solid fa-shoe-prints" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">`
      + `<p class="hint">Naming the quarry lets their own feats apply to this check. Leave it empty if nobody here is being followed.</p>`
      + `${rows}</div>`,
    buttons: [
      {
        action: "confirm", label: "Track", icon: "fa-solid fa-shoe-prints", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          // READ BY `namedItem`, and never as a property — see
          // refocus-workflow's `selectedFocusIndex` for the trap that is.
          const field = form?.elements?.namedItem?.("quarry");
          const nodes = field == null ? [] : (field.length === undefined ? [field] : Array.from(field));
          return nodes.filter((n) => n.checked).map((n) => Number(n.value));
        }
      },
      { action: "cancel", label: "Nobody here", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!Array.isArray(picked)) return [];
  return picked.map((i) => candidates[i]).filter(Boolean);
}

async function promptRepairTarget(actor) {
  const { DialogV2 } = foundry.applications.api;
  const candidates = Array.from(actor.items ?? []).filter((item) => {
    const hp = item.system?.hp;
    if (!hp || Number(hp.max) <= 0) return false;
    if (Number(hp.value) >= Number(hp.max)) return false;
    return itemStatus(hp.value, hp.max) !== "destroyed";
  });

  if (!candidates.length) {
    ui.notifications.warn(`${actor.name} has nothing damaged (and repairable) to fix.`);
    return null;
  }

  const rows = candidates
    .map(
      (item, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="item" value="${item.id}" ${index === 0 ? "checked" : ""}>
          <span>${item.name} (${item.system.hp.value} / ${item.system.hp.max} HP)</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Repair — Which Item?", icon: "fa-solid fa-hammer" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
    buttons: [
      {
        action: "confirm",
        label: "Confirm",
        icon: "fa-solid fa-hammer",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.item;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return actor.items.get(result) ?? null;
}

async function promptPainToleranceTarget(actor) {
  const { DialogV2 } = foundry.applications.api;
  const candidates = ["dazed", "injured", "weakened"]
    .filter((key) => actor.hasCondition?.(key))
    .map((key) => ({ key, value: actor.getConditionValue(key) }));

  if (!candidates.length) {
    ui.notifications.warn(`${actor.name} has none of Dazed, Injured, or Weakened active to ignore a point of.`);
    return null;
  }

  const labels = { dazed: "Dazed", injured: "Injured", weakened: "Weakened" };
  const rows = candidates
    .map(
      (c, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="condition" value="${c.key}" ${index === 0 ? "checked" : ""}>
          <span>${labels[c.key]} ${c.value}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Pain Tolerance — Ignore Which?", icon: "fa-solid fa-hand-fist" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
    buttons: [
      {
        action: "confirm",
        label: "Confirm",
        icon: "fa-solid fa-hand-fist",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.condition;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result;
}

async function promptReadiedSpell(actor) {
  const { DialogV2 } = foundry.applications.api;
  const spells = Array.from(actor.items ?? [])
    .filter((item) => item.type === "spell" && isReadyEligible(item.system?.castAP))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!spells.length) {
    ui.notifications.warn(`${actor.name} has no spells at 2 AP or less to cast.`);
    return null;
  }

  const rows = spells
    .map(
      (item, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="spell" value="${index}" ${index === 0 ? "checked" : ""}>
          <span>${item.name} — ${item.system?.castAP || "Free"} AP</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Ready — Cast Which Spell?", icon: "fa-solid fa-wand-sparkles" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
    buttons: [
      {
        action: "confirm",
        label: "Cast",
        icon: "fa-solid fa-wand-sparkles",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.spell;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return spells[Number(result)] ?? null;
}

async function promptStrikeWeapon(attacks) {
  const { DialogV2 } = foundry.applications.api;
  const rows = attacks
    .map(
      (item, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="attack" value="${index}" ${index === 0 ? "checked" : ""}>
          <span>${item.name}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Strike — Which Attack?", icon: "fa-solid fa-hand-fist" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
    buttons: [
      {
        action: "confirm",
        label: "Attack",
        icon: "fa-solid fa-hand-fist",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.attack;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return attacks[Number(result)] ?? null;
}

async function promptReadyChoice() {
  const { DialogV2 } = foundry.applications.api;
  const eligible = [
    ...BASIC_ACTIONS.map((a) => ({ ...a, invokedSkillKey: null })),
    ...SKILL_ACTIONS.flatMap((a) =>
      (a.skills ?? [null]).map((skillKey) => ({ ...a, invokedSkillKey: skillKey }))
    )
  ]
    .filter((a) => a.key !== "ready" && a.key !== "delay")
    .filter((a) => isReadyEligible(a.apCost))
    .sort((a, b) => a.name.localeCompare(b.name));

  const options = eligible
    .map(
      (a, index) =>
        `<option value="${index}">${a.name}${a.invokedSkillKey ? ` (${a.invokedSkillKey})` : ""} — ${a.apCost || "Free"} AP</option>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Ready an Action", icon: "fa-solid fa-hourglass-half" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-ready-action">Action to ready (no more than 2 AP)</label>
          <select id="trg-ready-action" name="actionIndex">
            <option value="spell">Cast a Spell — 2 AP or less</option>
            ${options}
          </select>
        </div>
        <div class="form-group">
          <label for="trg-ready-trigger">Trigger</label>
          <input id="trg-ready-trigger" type="text" name="trigger" placeholder="e.g. if the door opens" required>
        </div>
      </div>`,
    buttons: [
      {
        action: "ready",
        label: "Ready",
        icon: "fa-solid fa-hourglass-half",
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

  const trigger = String(result.trigger ?? "").trim();
  if (!trigger) {
    ui.notifications.warn("Readying an action needs a trigger.");
    return null;
  }

  if (result.actionIndex === "spell") {
    return { kind: "spell", trigger };
  }

  const chosen = eligible[Number(result.actionIndex)];
  if (!chosen) {
    ui.notifications.warn("Readying an action needs a chosen action.");
    return null;
  }

  return {
    kind: "action",
    actionKey: chosen.key,
    invokedSkillKey: chosen.invokedSkillKey,
    trigger
  };
}

/**
 * "1 AP", "2 AP" — but "Reaction", "10 minutes", "Varies".
 *
 * The suffix used to go on unconditionally, so a card could read
 * "10 minutes AP" or "Reaction AP". Harmless until 3.335.0 gave three
 * actions a cost the PLAYER chooses, at which point "1 round AP" was
 * both wrong and the only place the choice showed up.
 */
function apCostLabel(cost) {
  const text = String(cost ?? "").trim();
  if (!text) return "";
  return /^\d+$/.test(text) ? `${text} AP` : text;
}

function headerLines(action, effectiveApCost) {
  const lines = [];
  const bits = [];
  // The cost actually paid, when the action let the player pick one —
  // otherwise the printed cost. A card that says "10 minutes" beside a
  // roll the player chose to make in 1 round contradicts itself.
  const shown = apCostLabel(effectiveApCost ?? action.apCost);
  if (shown) bits.push(`<strong>${shown}</strong>`);
  if (action.traits) bits.push(action.traits);
  if (bits.length) lines.push(line(bits.join(" — ")));
  if (action.trigger) lines.push(line(`<strong>Trigger:</strong> ${action.trigger}`));
  if (action.requirements) {
    lines.push(line(`<strong>Requirements:</strong> ${action.requirements}`));
  }
  return lines;
}

/**
 * Assemble the modifiers for the action's chosen check type.
 *
 * @param {Actor} actor
 * @param {object} action The static definition.
 * @param {string|null} invokedSkillKey Which skill this was invoked
 *   through — needed for Skill Actions, which carry a `skills` array
 *   rather than one fixed key, since the same action (e.g. Recall
 *   Knowledge) resolves differently depending on which skill the player
 *   clicked through to reach it.
 */
function checkConfiguration(actor, action, invokedSkillKey, targetActor) {
  const config = baseCheckConfiguration(actor, action, invokedSkillKey, targetActor);
  if (!config) return config;

  // THE MULTIPLE ATTACK PENALTY (page 191, Graham's R1 of the block-19
  // audit): "Any action which has the attack trait counts towards the
  // multiple attack penalty including disarm, shove, spells etc."
  //
  // Until 3.579.0 only a weapon Strike, a thrown bomb and the two feats
  // that grant Strikes read or advanced the counter, so a Disarm, Shove,
  // Trip or Grapple after a Strike came in at its full bonus and left the
  // next Strike at ITS full bonus too. The penalty is the same counter the
  // Strike keeps — `attackCount`, cleared at the end of the turn — so the
  // two ladders interleave exactly as the page describes.
  //
  // THE TRAIT IS THE WHOLE TEST (R1: "Only things with the attack
  // trait") — applied here, outside the branches, because it is not the
  // kind of check that decides: Escape and Force Open carry the trait and
  // roll as skill checks, and an attack-check action without the trait
  // would not count.
  // MONSTROUS GRAB / KNOCKDOWN (Creature Codex; 3.631.0): "doesn't suffer
  // multiple attack penalties when making Grapple [Trip] attempts" —
  // declared as `derives.mapExempt: ["grapple"]` on the ability.
  const mapExempt = abilityMapExemptActions(Array.from(actor.items ?? [])).has(String(action.key ?? "").toLowerCase());
  if (countsTowardMAP(action.traits) && !mapExempt) {
    const map = mapPenalty(attackCountOf(actor));
    if (map) config.modifiers = [...config.modifiers, { label: "Multiple attack penalty", value: map, type: "untyped" }];
  }
  return config;
}

/** The modifiers the action's own check type brings, before the MAP. */
function baseCheckConfiguration(actor, action, invokedSkillKey, targetActor) {
  const system = actor.system;
  const kind = ACTION_CHECK_TYPES[action.checkType] ?? ACTION_CHECK_TYPES.none;

  if (!kind.checkType) return null;

  // AND AN ACTION MAY BE A CHECK ONLY IN AN ENCOUNTER (3.506.0). Mount /
  // Dismount is a DC 20 Handle Animal check while a combat is running and
  // an automatic success otherwise, so it returns null down the same path
  // every no-check action already takes rather than growing a second one.
  // The rule itself is in action-degrees.mjs, where it can be checked.
  if (!rollsAsCheck(action, actionCheckState(actor, action))) return null;

  if (action.checkType === "attack" || action.checkType === "unarmed") {
    const modifiers = [
      ...(system.combat?.attack?.checkModifiers ?? [
        {
          label: "Attack bonus",
          value: Number(system.combat?.attack?.total ?? 0),
          type: "untyped"
        }
      ])
    ];

    // Shove/Trip (Chapter 6): "uses your attack bonus with the
    // weapon instead of your unarmed attack bonus" — added as an
    // extra modifier on top, matching how a weapon's own
    // attackBonus already layers onto the base attack total in
    // rollWeaponAttack itself.
    //
    // THE WHOLE WEAPON BONUS, not the item field (3.575.0): Finesse,
    // Weapon Focus, Exemplar, a favoured weapon, the -4 for an untrained
    // weapon — built by `weaponManeuverModifiers` from the same helpers a
    // Strike uses. See its comment.
    const maneuverTrait = { shoveAttack: "shove", tripAttack: "trip" }[action.key];
    if (maneuverTrait) {
      const weapon = maneuverWeapon(Array.from(actor.items ?? []), maneuverTrait);
      if (weapon) modifiers.push(...weaponManeuverModifiers(actor, weapon));
    }

    // Disarm/Grapple/Shove/Trip Attack (Chapter 4): each action's own
    // size-category penalty against a larger target, confirmed
    // against the exact wording for each rather than assumed
    // uniform — Disarm's threshold/step differs from the other three.
    const sizePenaltyConfig = MANEUVER_SIZE_PENALTY_CONFIG[action.key];
    if (sizePenaltyConfig && targetActor) {
      const diff = sizeCategoryDifference(
        actor.system?.identity?.size,
        targetActor.system?.identity?.size
      );
      const penalty = maneuverSizePenalty(
        diff,
        sizePenaltyConfig.threshold,
        sizePenaltyConfig.perCategory
      );
      if (penalty) {
        modifiers.push({ label: "Target size", value: penalty, type: "circumstance" });
      }
    }

    return {
      type: "attack",
      label: `${action.name} — ${kind.label}`,
      modifiers
    };
  }

  if (action.checkType === "skill") {
    // A SPECIALIST SKILL IS A DIFFERENT COLLECTION, not a different
    // action. Graham's amendment of 16 September 2026 lets Identify Power
    // be attempted "with an appropriate specialist skill"; the roll is
    // still this action's roll, with its modifiers taken from
    // `system.specialistSkills` instead of `system.skills`, and typed
    // `specialist` so a conditional scoped to one can never match the
    // other.
    const invoked = readInvokedSkillKey(invokedSkillKey ?? "");
    if (invoked.specialist) {
      const specialist = system.specialistSkills?.[invoked.key];
      return {
        type: "specialist",
        label: `${action.name} — ${specialist?.label ?? invoked.key}`,
        modifiers: specialist?.checkModifiers ?? [
          {
            label: `${specialist?.label ?? invoked.key} bonus`,
            value: Number(specialist?.total ?? 0),
            type: "untyped"
          }
        ]
      };
    }
    const skillKey = invokedSkillKey ?? action.skills?.[0] ?? null;
    const skill = system.skills?.[skillKey];
    return {
      type: "skill",
      label: `${action.name} — ${skill?.label ?? skillKey ?? "Skill"}`,
      modifiers: skill?.checkModifiers ?? [
        {
          label: skill?.label ?? "Skill",
          value: Number(skill?.total ?? 0),
          type: "untyped"
        }
      ]
    };
  }

  if (action.checkType === "spellcraft") {
    return {
      type: "spellcraft",
      label: `${action.name} — Spellcraft`,
      modifiers: system.magic?.spellcraft?.checkModifiers ?? [
        {
          label: "Spellcraft",
          value: Number(system.magic?.spellcraft?.total ?? 0),
          type: "untyped"
        }
      ]
    };
  }

  if (action.checkType === "save") {
    const fortitude = system.combat?.saves?.fortitude;
    return {
      type: "save",
      label: `${action.name} — Saving Throw`,
      modifiers: fortitude?.checkModifiers ?? [
        {
          label: "Fortitude",
          value: Number(fortitude?.total ?? 0),
          type: "untyped"
        }
      ]
    };
  }

  return null;
}

/**
 * Resolve an action: post its header/description card, roll its check
 * against the derived target DC if it has one, and report the achieved
 * outcome.
 *
 * @param {Actor} actor
 * @param {object} action A Basic/Special/Skill Action definition.
 * @param {object} [options]
 * @param {string|null} [options.invokedSkillKey] Which skill this was
 *   rolled through, for Skill Actions with a `skills` array.
 */
/**
 * Actions the rulebook explicitly gives the "increase difficulty to
 * reduce AP cost" trade-off to (Chapter 8) — confirmed directly
 * against the full text; Treat Disease/Injury/Toxin have no stated
 * modifier at all, so they're deliberately not included here.
 */
const MEDICINE_AP_TRADEOFF_ACTIONS = new Set(["firstAid", "resuscitation"]);

/**
 * Medicine actions whose beneficial outcomes reduce a valued
 * condition rather than heal HP — First Aid's bleeding, Resuscitation's
 * Dying. `label` matches the wording actually used in this project's
 * own outcome text (see extractConditionReduction); `conditionKey`
 * is the condition registry's own key for applying it.
 */
/**
 * Disarm/Grapple/Shove/Trip Attack (Chapter 4): each action's own
 * size-category penalty threshold and per-category step, confirmed
 * directly against each action's exact wording — Disarm differs from
 * the other three (1 category / -2 vs. 2 categories / -4).
 */
// MOVED TO combat/attack.mjs AT 3.401.0, beside `maneuverSizePenalty`
// which consumes it — Tanglefoot performs a grapple action from a spell
// and needed the same table, and two copies would have been two places
// holding one rule.
const MANEUVER_SIZE_PENALTY_CONFIG = MANEUVER_SIZE_PENALTY;

const MEDICINE_CONDITION_ACTIONS = {
  firstAid: { conditionKey: "bleeding", label: "bleeding", buttonLabel: "Bleeding" },
  resuscitation: { conditionKey: "dying", label: "dying", buttonLabel: "Dying" }
};

/**
 * Aid Defensive/Offensive (Chapter 4): both share the same Bonus
 * Check Table structure, differing only in which stat the granted
 * bonus applies to.
 */
const AID_BONUS_ACTIONS = {
  aidDefensive: "defensive",
  aidOffensive: "offensive"
};


/**
 * WHERE THIS IS BEING DONE (page 201; Graham's R1 and R2 of 21 September
 * 2026).
 *
 * Two of page 201's bullets hand the GM the same decision from different
 * directions — "the GM makes the final decision as to whether certain
 * actions that are typically performed on the ground would be feasible
 * or effective in the air", and "some ground-based actions might not
 * work underwater or while floating (GM discretion)" — so both are said
 * and neither refuses.
 *
 * ONE HELPER, CALLED FROM BOTH COMMITMENT POINTS (3.580.1, F3). The
 * first version put these lines on the no-roll action card alone, which
 * is the one branch a GM is least likely to be asking about: driving
 * 3.580.0 ran High Jump — the page's OWN example — at forty feet and got
 * nothing, because a check action builds its card somewhere else
 * entirely. A note on one of two paths is a note that is missing half
 * the time.
 *
 * @param {Actor} actor
 * @param {object} action
 * @returns {string[]} zero, one or two card lines
 */
function placeNotes(actor, action) {
  const here = actor?.getActiveTokens?.()?.[0]?.document ?? actor?.token ?? null;
  const out = [];
  const aloft = airborneActionNote({
    airborne: airborne(Number(here?.elevation ?? 0)),
    actionName: action?.name ?? ""
  });
  if (aloft) out.push(line(`<em>${aloft}</em>`));
  const water = underwaterGroundActionNote({
    underwater: tokenIsUnderwater(here),
    actionName: action?.name ?? ""
  });
  if (water) out.push(line(`<em>${water}</em>`));
  return out;
}

export async function resolveAction(actor, action, {
  invokedSkillKey: requestedSkillKey = null, event = null, readied = false,
  // ONE ROLL AGAINST SEVERAL CREATURES (3.669.0; Inner Tempest's Spirit Roar:
  // "Make a single Demoralise check and compare the result against the Level
  // DC of each enemy within the area … as though you had used Demoralise
  // against it"). `presetDice` is the first roll's die, met here again;
  // `dcOverride` the DC this creature is met at (`dcLabel` names it);
  // `ignoreActionImmunity` neither asks nor stamps the action's own
  // temporary immunity, which the ability replaces with its own.
  presetDice = null, dcOverride = null, dcLabel = "", ignoreActionImmunity = false,
  // THE SHARED ROLL'S CONVICTION DIE (3.669.1): when the first creature's
  // check spent conviction's +1d6, the creatures meeting that roll after it
  // meet it with the same die, and are not asked again.
  presetConvictionDie = 0,
  // ANOTHER CHECK'S RESULT AS THIS ONE (3.670.0; Drunken Strike, B6-3):
  // with `presetDice`, that check's modifiers replace this one's, so the
  // total is that check's. See TRGCheck.
  presetModifiers = null
} = {}) {
  // Same fix as promptTrackQuarry above: two dialogs in this function used
  // DialogV2 without binding it.
  const { DialogV2 } = foundry.applications.api;
  let invokedSkillKey = requestedSkillKey;
  // Feat adjustments first, so everything downstream — trait gate, usage
  // recording, reaction gating — sees the feat's version of the action.
  // Escapologist strips Escape's Attack trait; Deadly Training adds its
  // +2 class to Ambush/Sniping checks further below.
  // FEATS AND CLASS ABILITIES BOTH (3.563.0). Every gate below matches a
  // name against a table, and a class ability that prints a feat-shaped
  // rule — Pillars of Faith's Seasoned Hands, "treat a Fumble as a
  // Failure" on named checks — belongs in the same tables. No core
  // ability shares a name with a core feat (checked when this widened),
  // so nothing that matched before matches differently now.
  const actorFeatNames = Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat" || i.type === "ability")
    .map((i) => i.name);
  action = applyTraitRemovals(action, actorFeatNames);
  // THE ACTION'S OWN DECLARED VARIANT (3.625.0): a feat's version of the
  // cost and the outcome rows, from the entry itself — see feats.mjs.
  action = applyActionVariant(action, actorFeatNames);
  // Practised Killer: Ambush/Sniping become Free actions — applied here
  // so the reaction gate below never sees the Reaction cost.
  action = applyReactionToFree(action, actorFeatNames);

  // SCHOOLED IN SECRETS (Chapter 5): "when you make a Gather Information
  // check to obtain knowledge about cults or religious groups, you may
  // instead use your Religion skill instead of Diplomacy."
  //
  // ASKED, because both halves of the condition are things only the table
  // knows — whether this particular enquiry is about a cult, and whether
  // the player wants to spend it that way ("may"). Asked FIRST, before the
  // trait gate and before any AP, so declining costs nothing and so
  // everything downstream sees the skill actually being rolled.
  if (action.key === "gatherInformation" && !skipDialog(event)) {
    const secrets = schooledInSecretsSkills(actorFeatNames, action.skills ?? ["diplomacy"]);
    if (secrets.offered) {
      const useReligion = await DialogV2.confirm({
        window: { title: "Schooled in Secrets", icon: "fa-solid fa-place-of-worship" },
        classes: ["trg-prime"],
        content: `<div class="trg-prime trg-check-dialog">`
          + `<p>Is this enquiry about a <strong>cult or religious group</strong>?</p>`
          + `<p class="hint">If it is, you may roll <strong>Religion</strong> in place of Diplomacy.</p></div>`,
        yes: { icon: "fa-solid fa-place-of-worship", label: "Roll Religion" },
        no: { icon: "fa-solid fa-comments", label: "Roll Diplomacy", default: true },
        rejectClose: false
      });
      if (useReligion) {
        invokedSkillKey = "religion";
        action = { ...action, skills: ["religion"] };
      }
    }
  }
  /*
   * WHICH SKILL? (3.593.0 — Graham, 25 September 2026)
   *
   * Asked HERE for Schooled in Secrets' reasons: before the trait gate
   * and before any AP, so cancelling costs nothing and everything
   * downstream sees the skill actually being rolled.
   *
   * Flowing Movement is the action that needed it — "a check appropriate
   * to one of the movement types involved (the GM determines which)" —
   * but the rule is general, so the next action offering two skills
   * inherits the question instead of repeating the hole.
   */
  if (actionNeedsSkillChoice(action, invokedSkillKey)) {
    const choices = actionSkillChoices(action);
    if (skipDialog(event)) {
      // THE CONVENTION THIS FILE ALREADY USES: a held modifier skips the
      // question and takes the first offer, which is the page's default.
      invokedSkillKey = choices[0];
    } else {
      const picked = await DialogV2.wait({
        window: { title: `${action.name} — Which Skill?`, icon: "fa-solid fa-person-running" },
        classes: ["trg-prime"],
        position: { width: 380 },
        content: `<div class="trg-prime trg-check-dialog">`
          + `<p>${action.name} may be attempted with any of these.</p>`
          + `<div class="form-group"><label for="trg-action-skill">Skill</label>`
          + `<select id="trg-action-skill" name="skillKey">`
          + choices.map((key) => {
            const skill = actor?.system?.skills?.[key];
            const total = Number(skill?.total ?? 0);
            // THE NUMBER IS SHOWN so the choice is an informed one. A
            // player picking between three skills they cannot see the
            // totals of is guessing, and the GM answering for them is
            // reading it off the sheet anyway.
            return `<option value="${key}">${skill?.label ?? key} `
              + `(${total >= 0 ? "+" : ""}${total})</option>`;
          }).join("")
          + `</select></div></div>`,
        buttons: [
          {
            action: "roll", label: "Roll", icon: "fa-solid fa-dice-d20", default: true,
            callback: (ev, button) => {
              const form = button.form ?? button.closest?.("form");
              const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
              return new FDE(form).object.skillKey;
            }
          },
          { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
        ],
        rejectClose: false
      });
      // A CANCELLED QUESTION IS A CANCELLED ACTION, not a default roll.
      // Nothing has been spent at this point, so stopping is free.
      if (!picked || picked === "cancel") return null;
      invokedSkillKey = String(picked);
    }
    action = { ...action, skills: [invokedSkillKey] };
  } else if (actionSkillIsUnnamed(action)) {
    /*
     * SAID, NOT ROLLED. An action declaring `checkType: "skill"` with no
     * skills is a fault in the data, and this is exactly the state
     * Flowing Movement was in: the roll went ahead with a modifier list
     * reading `{ label: "Skill", value: 0 }`, so the card looked like a
     * check and the character's skill was nowhere in it. Refusing out
     * loud is what turns the next one into a bug report instead of a
     * quietly wrong number.
     */
    ui.notifications.warn(`${action.name} declares a skill check but names no skill.`);
    return null;
  }

  const featActionModifiers = actionFeatModifiers(action.key, actorFeatNames, {
    classBonus: Number(actor?.system?.identity?.classBonus ?? 0)
  });

  // A substituted action (Urban Tracker's Perception-based Track) may
  // carry its own modifier — only ever attached by substituteSkillActions,
  // so it applies exactly when the feat's route is the one being rolled.
  if (action.substitutionModifier) featActionModifiers.push(action.substitutionModifier);

  // Skill Focus (Chapter 5): "+2 class bonus when performing that
  // action" — each copy of the feat records its chosen action key on a
  // choice effect; every match adds its bonus (repeat picks must choose
  // different actions, so at most one per action in practice).
  // Feat STANCES (3.190.0) carry `stanceActionMods` the same way: action
  // bonuses (Disarm Stance's +1) and AP reductions (Double Stance's
  // 2 AP Double Slice; Duelling Dance's 1 AP Fight Defensively) that
  // apply only while the stance's effect is up.
  let stanceApReduction = 0;
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect.disabled) continue;
    if (effect.getFlag?.(SYSTEM_ID, "skillFocusAction") === action.key) {
      featActionModifiers.push({ label: "Skill Focus", value: 2, type: "class" });
    }
    const stanceMods = effect.getFlag?.(SYSTEM_ID, "stanceActionMods");
    if (stanceMods) {
      for (const bonus of stanceMods.bonuses ?? []) {
        if (bonus.actions?.includes(action.key)) {
          featActionModifiers.push({ label: bonus.label, value: bonus.value, type: bonus.type });
        }
      }
      stanceApReduction += Number(stanceMods.apReductions?.[action.key] ?? 0);
    }
  }

  // Aim (Chapter 4): "if you take any other action besides this one,
  // you lose all accrued aiming bonus" — checked before anything
  // else in this workflow, since every basic/skill action passes
  // through here.
  await clearAimIfOtherAction(actor, action.key);

  // An armed movement action survives only until you do something else,
  // exactly as Aim's accrued bonus does just above.
  if (!isArmableMovement(action.key)) {
    await clearArmedMovement(actor);
  }

  // Rage (Chapter 4): "you cannot use any action which has the Defence
  // trait" and "you cannot use actions with the concentrate trait unless
  // they also have the rage trait". Both are real checks rather than
  // reminders, since every action in this project's data carries its own
  // traits — so they're enforced here, once, for every action that
  // passes through this workflow.
  if (isRaging(actor)) {
    const blocked = rageBlocksAction(action);
    if (blocked.blocked) {
      // Moment of Clarity (Chapter 5): "you may use actions with the
      // concentrate trait... until the end of your turn" — lifts ONLY the
      // Concentrate prohibition; the Defence-trait rule stands.
      const clarityActive = Array.from(actor.appliedEffects ?? actor.effects ?? []).some(
        (e) => !e.disabled && e.getFlag?.(SYSTEM_ID, "momentOfClarity")
      );
      const concentrateRule = /concentrate/i.test(blocked.reason);
      if (!(clarityActive && concentrateRule)) {
        ui.notifications.warn(`${action.name}: ${blocked.reason}.`);
        return null;
      }
    }
  }

  // Traits (Appendix 3): the per-turn restrictions — Open, Flourish,
  // Defence, Press, Teleportation, Word, Conviction, Stance — checked
  // before anything is spent, so a refused action costs nothing. Strike
  // is excluded here only because it hands straight off to
  // rollWeaponAttack above, which runs the same gate itself.
  if (!traitGate(actor, action, action.name)) return null;

  // FULL DEFENCE (Chapter 4): "You can still use Free Actions whilst
  // using Full Defence, but all other actions, including Reactions are
  // prohibited" — and "you may take a single Move action as part of Full
  // Defence."
  //
  // Enforced for EVERY action from 3.336.0. It was previously consulted
  // only for Reactions, and the AP economy hid that: Full Defence costs
  // 3 of a standard 3 AP pool, so a character with anything left to
  // spend was never stopped. Placed with the other gates, before
  // anything is spent, so a refused action costs nothing.
  const fullDefenceBlocked = actorFullDefenceBlock(actor, action);
  if (fullDefenceBlocked) {
    ui.notifications.warn(`${action.name}: ${fullDefenceBlocked}.`);
    return null;
  }

  // Reactions (Chapter 4): Flat-Footed, Confused, and Full Defence each
  // forbid Reactions outright — an AoO, Arrest a Fall, or any other
  // Reaction-cost action is refused before anything is spent. Confused
  // additionally forbids Ready and Delay, the two actions that hand a
  // deliberate choice to a later trigger. Checked here so every basic/
  // skill action passes through one gate, matching the trait/rage gates.
  let preparedPaysFor = false;
  if (String(action.apCost ?? "").trim().toLowerCase() === "reaction") {
    const blocked = actorReactionBlock(actor);
    if (blocked) {
      ui.notifications.warn(`${action.name}: ${blocked}.`);
      return null;
    }
    // PREPARE (Chapter 4): "You may use this reaction once as a free
    // action until the beginning of your next turn." The preparation buys
    // the RESOURCE, not the permission — the block reasons above still
    // apply, and are deliberately checked first.
    preparedPaysFor = preparationCovers(preparedReaction(actor), action.key);
    // Battle Readiness (Fighter, 2nd): the extra reaction "can only be
    // used to perform an action with the Reaction action type that also
    // has either the Attack trait or the Martial trait." Checked here —
    // before anything is spent — like the other gates; the spend itself
    // (spendReaction) records which kind was used.
    if (actorInCombat(actor)) {
      const brBlocked = battleReadinessSpendBlock({
        hasBattleReadiness: battleReadinessBonus(actor) > 0,
        qualifies: reactionQualifies(action.traits),
        nonQualifyingSpent: Boolean(actor.getFlag?.(SYSTEM_ID, "nonMartialReactionSpent"))
      });
      if (brBlocked) {
        ui.notifications.warn(`${action.name}: ${brBlocked}`);
        return null;
      }
    }
  }
  // CONFUSED AND FLEEING (3.621.0; Appendix 2, block 39's R7): "You can't
  // Delay or Ready while fleeing" joins Confused's identical clause, and
  // Fixated's "Any actions with the concentrate trait cannot be used".
  // Both refused before anything is spent. See conditions/condition-rules.mjs.
  {
    const conds = actor.conditions?.effective;
    const deliberate = actorDeliberateActionBlocked(actor, action.key)
      ? "Confused creatures cannot Ready or Delay"
      : deliberateRefusal(conds, action.key);
    if (deliberate) {
      ui.notifications.warn(`${action.name}: ${deliberate}.`);
      return null;
    }
    const fixated = concentrateRefusal(conds, action.traits);
    if (fixated) {
      ui.notifications.warn(`${action.name}: ${fixated}.`);
      return null;
    }
  }

  // Attack of Opportunity (Chapter 4): a Manipulate-trait action used within
  // an enemy's reach provokes, unless the action is exempt (e.g. Release /
  // change grip). Detection only — detached and defensive so it never blocks
  // or delays the action itself. Strike/AoO/ranged provokes are handled in
  // the attack workflow, not here.
  if (
    hasTrait(action, "manipulate") &&
    !action.provokeExempt &&
    action.key !== "attackOfOpportunity" &&
    game.combat?.started
  ) {
    import("./opportunity.mjs")
      .then((m) => m.detectStationaryAoO(actor, "manipulate"))
      .catch(() => {});
  }

  // Invoke and Revoke Rage carry requirements this system can genuinely
  // test, unlike the GM-adjudicated requirements text most actions have.
  // Checked before anything is spent, so a refused attempt costs nothing.
  if (action.key === "invokeRage") {
    const allowed = canInvokeRage(actor);
    if (!allowed.allowed) {
      ui.notifications.warn(allowed.reason);
      return null;
    }
  }
  if (action.key === "revokeRage") {
    const allowed = canRevokeRage(actor);
    if (!allowed.allowed) {
      ui.notifications.warn(allowed.reason);
      return null;
    }
  }
  if (action.key === "extendRage") {
    const allowed = canExtendRage(actor);
    if (!allowed.allowed) {
      ui.notifications.warn(allowed.reason);
      return null;
    }
  }

  // Proficiency (Chapter 4 skill tables): a Trained skill action requires the
  // character to be trained — at least 1 rank — in the skill they invoke it
  // through. Entries carry `proficiency: "trained"` when the rulebook lists
  // them among a skill's Trained Actions (see TRAINED_ACTION_KEYS in
  // data/skill-actions.mjs); Untrained actions omit it and are never gated.
  // Checked before anything is spent, matching the Rage and Earn Income
  // requirement gates. Raised by Graham after a Transfer Runes (Arcana) check
  // resolved for a character with no Arcana ranks. Earn Income and Create keep
  // their own follow-up handling below; this catches every trained action
  // uniformly, including the ~50 that have no bespoke workflow.
  if (action.proficiency === "trained") {
    // A SPECIALIST SKILL YOU HOLD IS TRAINED BY DEFINITION. You do not
    // buy ranks in one — a background grants it, or you do not have it —
    // so "are you trained in Herb Lore" is the same question as "is Herb
    // Lore on your sheet".
    //
    // ─────────────────────────────────────────────────────────────────
    // WHERE THAT SENTENCE COMES FROM, recorded at 3.558.0 because for a
    // few hours it came from nowhere.
    //
    // It was page 20: "A specialist skill is always considered to be
    // trained and gains an additional +1 bonus." The 3.8 rulebook
    // revision deleted that sentence — rightly, because its +1
    // contradicted page 97's own formula, `Level + Class Bonus +
    // Ability Modifier + 2` — and took the trained half with it. For
    // that revision the book said it nowhere at all, and this gate, and
    // Graham's Identify Power amendment of 16 September 2026, both rested
    // on a line no reader could find.
    //
    // Reported to him on 16 September 2026 with three ways out: keep the
    // behaviour and restore the sentence; keep it and record the
    // reasoning here; or take the gate and the amendment back out. His
    // ruling R2: "I will amend."
    //
    // AND IT LANDED IN 3.8.1 (17 September 2026). The page 97 specialist
    // skills section now reads: "Be aware that for the purpose of
    // training, a specialist skill that you have is always considered to
    // be trained." So this gate rests on a printed sentence again, and
    // the paragraph above is history rather than a live caveat. It stays
    // because the next person to go looking for the rule in a 3.8 PDF
    // will find it missing and want to know why the code disagrees.
    //
    // The +2 in page 97's formula is the trained proficiency bonus baked
    // in, which is why the behaviour was right while the statement was
    // missing. DO NOT REMOVE THIS GATE on the strength of not finding
    // the sentence — find this comment first.
    const invokedForGate = readInvokedSkillKey(invokedSkillKey ?? "");
    if (invokedForGate.specialist) {
      if (!actor.system?.specialistSkills?.[invokedForGate.key]) {
        ui.notifications.warn(
          `${action.name}: you do not have that specialist skill.`
        );
        return null;
      }
    } else {
      const skillKey = invokedSkillKey ?? action.skills?.[0] ?? null;
      // A FEATURE MAY UNLOCK SPECIFIC ACTIONS (3.320.0). The Gnome's Detect
      // Magic says in as many words that its owner "may make Sense Power
      // checks untrained" — and the gate did not know the ability existed,
      // so a Gnome with no Power Manipulation ranks was refused the very
      // action their race grants them. Found live in the Chapter 2 Gnome
      // audit on 3.319.2.
      //
      // Declared as action keys on the feature rather than by matching its
      // name, so any later ability with the same clause works unchanged —
      // the same reasoning as Lys-Fod's linguistLanguageBonus flag.
      // ANOTHER CHECK'S RESULT STANDS AS THIS ONE (3.670.1; found live,
      // Inner Tempest's Drunken Strike, B6-3): nothing is rolled with the
      // skill, so its training is not asked for. See `presetModifiers`.
      const presetResult = Boolean(presetDice) && Array.isArray(presetModifiers);
      const exempt = presetResult || Array.from(actor.items ?? [])
        .concat(Array.from(actor.appliedEffects ?? []).filter((e) => !e.disabled))
        .some((source) => {
          const declared = source?.flags?.[SYSTEM_ID]?.untrainedActions;
          const keys = Array.isArray(declared)
            ? declared
            : String(declared ?? "").split(/[,;]/);
          return keys
            .map((k) => String(k ?? "").trim().toLowerCase())
            .filter(Boolean)
            .includes(String(action.key ?? "").trim().toLowerCase());
        });
      if (!exempt && (!skillKey || !isSkillTrained(actor, skillKey))) {
        const skillLabel = actor.system?.skills?.[skillKey]?.label ?? skillKey ?? "that skill";
        ui.notifications.warn(
          `${action.name}: a Trained action — you must be trained (at least 1 rank) in ${skillLabel}.`
        );
        return null;
      }
    }
  }

  // A RANK REQUIREMENT ABOVE TRAINED (3.561.0). Pillars of Faith's Chapter 4
  // prints "Requirements Rank 2" and "Rank 3" on eight of its actions;
  // the core book has only "trained" (1 rank). Declared as `minRank` on the
  // entry and read from whichever skill the action was invoked through —
  // so a substitution feat's "use your Perform ranks to meet the action's
  // Rank requirement" is the ordinary case, not a special one. A
  // specialist skill has no rank ladder and is not gated here.
  const minRank = Math.max(0, Math.trunc(Number(action.minRank) || 0));
  if (minRank > 1) {
    const skillKey = invokedSkillKey ?? action.skills?.[0] ?? null;
    const isCore = Boolean(skillKey && actor.system?.skills?.[skillKey]);
    if (isCore && skillRanks(actor, skillKey) < minRank) {
      const skillLabel = actor.system?.skills?.[skillKey]?.label ?? skillKey;
      ui.notifications.warn(`${action.name}: requires at least ${minRank} ranks in ${skillLabel}.`);
      return null;
    }
  }

  // Skill Specialties (Chapter 4): Artistry, Crafting and Perform each gate
  // their *trained* actions behind a specialty — "you may only make trained
  // skill checks when using one of your specialties." A character with none
  // in the invoked skill can't attempt them; refused before anything is
  // spent, per Graham. Whether the task actually fits a held specialty is
  // the GM's call, so this only tests that at least one is held.
  //
  // A FEAT CAN STAND IN FOR THE SPECIALTY ON CREATE (3.577.1; F1 of the
  // 3.577.0 live test). Graham's R6 put alchemy under Alchemical Crafting
  // and no specialty, and R5 lets its holder use Crafting — so a Crafting
  // Create with no specialty goes ahead when a feat covers some of the
  // skill's item types, and the setup dialog then offers only those.
  let createFeatOnlyTypes = null;
  {
    const specialtySkill = invokedSkillKey ?? action.skills?.[0] ?? null;
    if (
      specialtySkill &&
      requiresSpecialty(specialtySkill, action.key) &&
      isSkillDeveloped(actor, specialtySkill) &&
      !hasAnySpecialty(actor, specialtySkill)
    ) {
      const featTypes = action.key === "create"
        ? featGovernedCreateTypes(itemTypesForSkill(specialtySkill), Array.from(actor.items ?? [])
          .filter((i) => i.type === "feat").map((i) => i.name))
        : [];
      if (!featTypes.length) {
        ui.notifications.warn(
          `${action.name}: needs a ${SKILL_SPECIALTIES[specialtySkill].label} specialty — choose one on the character sheet first.`
        );
        return null;
      }
      createFeatOnlyTypes = featTypes;
    }
  }

  // Earn Income (Chapter 4): a trained, multi-day task. Must be trained in the
  // invoked skill; one active task at a time (invoking again opens its manager
  // rather than starting a second); the GM-assigned task level is taken before
  // the roll. All checked before anything is spent.
  let earnIncomeTaskLevel = null;
  if (action.key === "earnIncome") {
    const skillKey = invokedSkillKey ?? action.skills?.[0] ?? null;
    const skillLabel = actor.system?.skills?.[skillKey]?.label ?? skillKey ?? "that skill";
    if (!skillKey || !isSkillTrained(actor, skillKey)) {
      ui.notifications.warn(`Earn Income: you must be trained (at least 1 rank) in ${skillLabel}.`);
      return null;
    }
    if (earnIncomeStatus(actor)) {
      ui.notifications.info(`${actor.name} already has an active Earn Income task — opening its manager.`);
      await openEarnIncomeManager(actor);
      return null;
    }
    if (skipDialog(event)) {
      earnIncomeTaskLevel = 1;
    } else {
      earnIncomeTaskLevel = await promptTaskLevel();
      if (earnIncomeTaskLevel === null) return null;
    }
  }

  // Create (Chapter 4): a trained, multi-day crafting project. A fresh
  // invocation sets it up (item details + the requirement checklist, all
  // confirmed before anything is spent); invoking it again while a project is
  // in progress is the "make another check the following day" re-roll. The
  // ranks ≥ item level requirement is enforced here; the rest are confirmed in
  // the setup dialog, and a Crafting-invoked Create also needs a Crafting
  // specialty via the specialty gate above.
  let createSetup = null;
  // The project's item type, for the Crafting (alchemy) trait below.
  let createItemTypeKey = "";
  let createReroll = false;
  let createInventFormula = false;
  let createBatchDC = 0;
  // A herb made without Alchemical Crafting: Very Hard, DC +5 (R5).
  let createHerbDC = 0;
  if (action.key === "create") {
    const skillKey = invokedSkillKey ?? action.skills?.[0] ?? null;
    const existing = createProjectStatus(actor);
    const active = activeCreateProject(actor);
    if (existing && !active) {
      ui.notifications.info(`${actor.name} has a finished crafting project — clear it before starting another.`);
      await openCreateManager(actor);
      return null;
    }
    if (active) {
      // A DAY'S WORK NEEDS THE KIT AS MUCH AS THE FIRST DAY DID (3.577.0):
      // "It is not possible to make alchemical items without these tools."
      const kitShort = createKitShortfall({ itemTypeKey: active.itemTypeKey, items: Array.from(actor.items ?? []) });
      if (kitShort) {
        ui.notifications.warn(`Create: ${active.itemName ?? "this project"} — ${kitShort.reason}`);
        return null;
      }
      createReroll = true;
      createItemTypeKey = String(active.itemTypeKey ?? "");
      createInventFormula = Boolean(active.inventingFormula);
      createBatchDC = active.isConsumable ? consumableDCModifier(active.batchQty) : 0;
      createHerbDC = featlessHerbDC({
        itemTypeKey: active.itemTypeKey,
        featNames: Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
      });
    } else {
      if (skipDialog(event)) return null; // setup needs the dialog
      // The character's own feats decide what the setup dialog offers —
      // whether inventing a formula is open to them, and what each item
      // type requires. See crafting-feats.mjs.
      //
      // THE SPECIALTIES ARE THE ONES THE REST OF THE SYSTEM MEANS: the
      // Skill Specialties manager's, which the specialty gate a few lines
      // above has already insisted on. Reading a second list here — as
      // 3.361.0 did, off each Specialist Crafter copy — offered a
      // specialty the character did not hold, and paid Accomplished
      // Artisan and Masterful Crafter out on it.
      createSetup = await promptCreateSetup(skillKey, {
        featNames: Array.from(actor.items ?? [])
          .filter((i) => i.type === "feat").map((i) => i.name),
        specialties: specialtyChoices(actor, "crafting"),
        items: Array.from(actor.items ?? []),
        onlyTypes: createFeatOnlyTypes
      });
      if (!createSetup) return null;
      const ranks = skillRanks(actor, skillKey);
      if (!meetsRankRequirement(ranks, createSetup.itemLevel)) {
        const label = actor.system?.skills?.[skillKey]?.label ?? skillKey;
        ui.notifications.warn(
          `Create: you need at least ${Math.max(1, createSetup.itemLevel)} ranks in ${label} to craft a level ${createSetup.itemLevel} item.`
        );
        return null;
      }
      createInventFormula = Boolean(createSetup.inventingFormula);
      createItemTypeKey = String(createSetup.itemTypeKey ?? "");
      createBatchDC = CONSUMABLE_ITEM_TYPES.includes(createSetup.itemTypeKey)
        ? consumableDCModifier(createSetup.batchQty)
        : 0;
      createHerbDC = featlessHerbDC({
        itemTypeKey: createSetup.itemTypeKey,
        featNames: Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
      });
    }
  }

  // Learn a Spell (Chapter 4 x Chapter 9): a trained, single-check way to
  // grow a book-style caster's Spell Library outside the free per-level
  // ladder. Gated to a caster who actually keeps one (the Wizard, today)
  // — a list-style learned caster already has blanket tradition access
  // and an instinctive caster grows through its own repertoire schedule,
  // so neither has anything here to learn. The spell + source picks (and
  // the DC/item-bonus they resolve to) are all settled before anything is
  // spent, same as Create's setup dialog.
  let learnSpellSetup = null;
  if (action.key === "learnSpell") {
    if (!learnSpellEligible(actor)) {
      ui.notifications.warn("Learn a Spell: only a caster with a Spell Library (a spell book) can grow it this way.");
      return null;
    }
    if (skipDialog(event)) return null; // setup needs the dialog
    learnSpellSetup = await promptLearnSpellSetup(actor);
    if (!learnSpellSetup) return null;
  }

  // HIGH JUMP AND LONG JUMP (Chapter 4, page 77) — the two printed DC
  // FORMULAS the system left to arithmetic at the table until 3.557.0.
  // "The DC of the check is equal to 4 per foot jumped"; "equal to the
  // amount of feet"; "if you didn't Stride at least 10 feet, the DC of
  // the jump is doubled". Graham's ruling R1, 16 September 2026: ask.
  //
  // ASKED HERE, beside Learn a Spell's setup and for the same reason —
  // both compute a DC that `against: "none"` declares no other way to
  // reach, and both must have it before the check dialog opens so the GM
  // can still adjust it ("The DC may also be increased or decreased due
  // to the situation"). Asking after that dialog, as the audit first
  // proposed, would put the computed number and the GM's own number in
  // the same slot with no way to rank them.
  let jumpSetup = null;
  if (isJumpAction(action.key) && !skipDialog(event)) {
    const declared = await promptJumpDistance(action.key);
    // THREE OUTCOMES, NOT TWO. `undefined` is a cancel and abandons the
    // action before any AP is spent; `null` is a player who left the
    // distance at zero, which is not a refusal but a deliberate "you set
    // it" — and must roll on exactly as it did before this existed.
    if (declared === undefined) return null;
    jumpSetup = declared;
    // A NATURAL LEAPER (3.627.0): no run-up penalty, and no check — nor, for
    // a Long Jump, any action — within the reach the rule prints.
    if (jumpSetup && isNaturalLeaper(actor.items, actor.appliedEffects ?? actor.effects)) {
      jumpSetup = naturalLeaperJump(jumpSetup, { landSpeed: speedValue(actor.system?.combat?.movement?.land) });
      if (jumpSetup.automatic) {
        if (!jumpSetup.freeAction) {
          const leapCost = leapApCost(action.apCost);
          if (!(await ensureActionPoints(actor, leapCost, action.name, { traits: action.traits }))) return null;
          await spendActionCost(actor, leapCost, action.name, { traits: action.traits });
        }
        await postCard(actor, action.name, [line(naturalLeaperLine(jumpSetup))]);
        return null;
      }
    }
  }

  // DISPEL (Chapter 4, page 91). Three things the action needs before it
  // rolls, and none of them was being asked for until 3.565.0: how much
  // PP is poured in, the effect's own DC, and its level-or-PP for the
  // counteract modifier.
  //
  // "The check CLASSES AS A COUNTERACT CHECK" — so `counteractModifier`
  // applies, ±2 per level or PP difference, with the book's own worked
  // example of an 8 PP attempt against a 10 PP effect taking -4. That
  // function has existed since Chapter 8 was built and was reachable
  // only from a standalone button on the actor sheet; Dispel, the
  // action the rulebook names as a counteract check, never met it.
  //
  // ASKED BEFORE THE CHECK DIALOG, beside Learn a Spell and the jumps,
  // for the reason recorded there: the computed DC has to be in the slot
  // the GM can then still adjust.
  let dispelSetup = null;
  if (action.key === "dispel" && !skipDialog(event)) {
    // A HAUNT'S COUNTERACT (3.629.0): "Counteract Level: the haunt's Level.
    // Counteract DC: the haunt's Level DC" — the dialog opens on both.
    const { perilDispelDefaults } = await import("../peril-workflow.mjs");
    const declared = await promptDispel(
      maxPPPerCast(Number(actor.system?.magic?.casterLevelValue ?? 0)),
      Number(actor.system?.resources?.pp?.value ?? 0),
      perilDispelDefaults(firstTargetActor()) ?? {}
    );
    if (declared === undefined) return null;
    dispelSetup = declared;
  }

  // RECHARGE ITEM (Chapter 4, page 91). "A skill check with the DC based
  // upon the level and rarity of the item."
  //
  // GRAHAM'S RULING R4, 17 September 2026: "The level of the item
  // determines its DC (which should equate to a characters level DC)."
  // So the DC is `levelDC(itemLevel)` and RARITY DOES NOT ENTER IT —
  // his ruling is narrower than the printed sentence, deliberately, and
  // that is recorded here rather than silently implemented, because the
  // next reader will otherwise go looking for the rarity term.
  let rechargeSetup = null;
  if (action.key === "rechargeItem" && !skipDialog(event)) {
    const declared = await promptRechargeItem(actor);
    if (declared === undefined) return null;
    rechargeSetup = declared;
  }

  // SENSE POWER, BROAD AND FOCUSED (Chapter 4, page 91). The printed
  // aura table — a different tradition -5, active Shadow magic -10, an
  // active magical trap -10, active Insight magic -5 — and the opposed
  // check it modifies, neither of which existed outside the description
  // before 3.565.0.
  //
  // THE DEFAULT IS NO CHECK. "You send out a pulse that registers the
  // presence of magic": ordinary magic is simply found, and the opposed
  // check is only for the four hard auras. An untouched dialog therefore
  // leaves the action behaving exactly as it did before.
  let sensePowerSetup = null;
  if (isSensePowerAction(action.key) && !skipDialog(event)) {
    const declared = await promptSensePowerAura();
    if (declared === undefined) return null;
    sensePowerSetup = declared;
  }

  // SNEAK (Chapter 4, page 93). The cover bonus, and the -4 for moving
  // at full Speed. See stealth.mjs for why Taking Cover's own larger
  // bonus has to be cancelled here rather than left to stack.
  let sneakSetup = null;
  if (action.key === "sneak" && !skipDialog(event)) {
    const declared = await promptSneakOptions();
    if (declared === undefined) return null;
    sneakSetup = declared;
  }

  // COVER TRACKS (Chapter 4, page 95). "-2-circumstance penalty to your
  // Tracking DC" per character beyond the first four.
  let coverTracksCount = null;
  if (action.key === "coverTracks" && !skipDialog(event)) {
    const declared = await promptCoverTracks();
    if (declared === undefined) return null;
    coverTracksCount = declared;
  }

  // ASSESS TRACKS (Chapter 5, page 115). Which DC the reading is against
  // — the quarry's Level DC, or their Survival DC while they are working
  // to hide the trail. A CONDITION, so it is asked; see
  // module/assess-tracks.mjs for why the engine's higher-of-two array
  // form would be the wrong rule here.
  let assessTracksSetup = null;
  if (action.key === "assessTracks" && !skipDialog(event)) {
    const declared = await promptAssessTracks();
    if (declared === undefined) return null;
    assessTracksSetup = declared;
  }

  // GATHER HERBS (Chapter 4, page 95). How many herbs the character's
  // Survival ranks allow them to seek at once, and whether the day was
  // spent on nothing else.
  let gatherHerbsSetup = null;
  if (action.key === "gatherHerbs" && !skipDialog(event)) {
    const declared = await promptGatherHerbs(
      herbsAtOnce(skillRanks(actor, invokedSkillKey ?? "survival"))
    );
    if (declared === undefined) return null;
    gatherHerbsSetup = declared;
  }

  // PICK POCKET (Chapter 4, page 96). The +5 for a guarded object, and
  // the automatic failure against a mark who is in combat or on guard.
  //
  // THE ATTEMPT IS NOT REFUSED. A character does not know the mark is
  // alert until they try, so this resolves as a failure rather than
  // being blocked before the AP is spent — and the card says which half
  // of the sentence fired.
  let pickPocketSetup = null;
  if (action.key === "pickPocket" && !skipDialog(event)) {
    const declared = await promptPickPocket(Boolean(game.combat?.started));
    if (declared === undefined) return null;
    pickPocketSetup = {
      ...declared,
      autoFail: pickPocketAutoFail({
        inCombat: Boolean(game.combat?.started),
        onGuard: declared.onGuard
      })
    };

    // AN AUTOMATIC FAILURE IS NOT ROLLED. "Your check automatically
    // fails" leaves nothing for a die to decide, and printing a Success
    // beside a line saying the attempt cannot succeed is the card
    // asserting two things at once — the exact defect `warp-area.mjs`
    // records from Dark Tendrils.
    //
    // THE AP IS STILL SPENT, because the attempt was made. A character
    // does not learn the mark is alert until their hand is already
    // moving, which is the whole reason the book makes this a failure
    // rather than a refusal.
    if (pickPocketSetup.autoFail) {
      await spendActionCost(actor, action.apCost, action.name, { traits: action.traits });
      await postCard(actor, action.name, [
        line(`<strong>The attempt automatically fails</strong> — ${pickPocketSetup.autoFail}.`),
        line("<em>Page 96: your check automatically fails if the creature you are stealing from is in combat or on guard.</em>")
      ]);
      return null;
    }
  }

  // Strike (Chapter 4), per Graham directly: this basic action was
  // spending its own AP, then the weapon row's own Attack button
  // spent AP again — a genuine double-spend. Fixed by never spending
  // AP here at all; Strike finds the actor's actual usable attack(s)
  // (equipped weapons and natural attacks alike) and hands off
  // directly to rollWeaponAttack, which already spends the single,
  // correct AP cost on its own.
  if (action.key === "strike") {
    // A HELD WEAPON FIRST (3.646.0), so the chooser's default is the sword
    // in hand rather than the fist — as the feat and reaction choosers do.
    let attacks = usableAttacks(Array.from(actor.items ?? []))
      .sort((a, b) => Number(Boolean(a.system?.natural)) - Number(Boolean(b.system?.natural)));
    if (!attacks.length) {
      const unarmed = await getOrCreateUnarmedStrike(actor);
      attacks = [unarmed];
    }

    let chosen = attacks[0];
    if (attacks.length > 1) {
      chosen = await promptStrikeWeapon(attacks);
      if (!chosen) return null;
    }

    // A STRIKE ALREADY PAID FOR — a readied one (3.645.0, F7) — costs no AP.
    // READIED, SAID SO (3.668.1): Inner Tempest's Brace trait reads "if you
    // use a Ready action to attack".
    return rollWeaponAttack(actor, chosen, { event, apPaid: String(action.apCost ?? "").trim() === "0", readied: Boolean(readied) });
  }

  // IMPROVISED ATTACK (3.576.0): the same Strike, with a held item as the
  // weapon. See goods-workflow.mjs.
  if (action.key === "improvisedAttack") {
    const { improvisedAttack } = await import("../goods-workflow.mjs");
    return improvisedAttack(actor, { event });
  }

  const targetActor = firstTargetActor();
  // A MODULE MAY REFUSE AN ATTEMPT (3.630.0) — Pillars of Faith's Perform
  // Last Rites on a corpse whose rites were botched: "You cannot attempt
  // Last Rites on the corpse again until the error has been identified."
  // A handler returning false stops it before anything is spent or rolled;
  // the handler says why.
  if (globalThis.Hooks?.call?.("trgPrimeActionAttempt", { actor, action, targetActor, invokedSkillKey: requestedSkillKey }) === false) return null;
  // FORCED MOVEMENT (3.376.0) needs TOKENS, not actors — a push is a
  // position on a scene, and two tokens of the same actor are two
  // different places. Captured HERE, beside the target actor, rather than
  // when the outcome card is built: the handover records that "a token
  // target is released by the target-selection dialog", so anything read
  // later in this function may be reading an empty set. The ids are
  // stored on the card so the button still works long after the target
  // has moved on.
  const pushSourceTokenId = actor?.getActiveTokens?.()?.[0]?.document?.id ?? null;
  const pushTargetTokenId = (game.user?.targets?.first?.() ?? null)?.document?.id ?? null;
  const pushSceneId = canvas?.scene?.id ?? null;

  // Trait immunity (Appendix 3, and whatever the GM has typed into the
  // target's immunities). MENTAL says "objects and mindless creatures are
  // immune to effects with this trait"; that was the only case handled
  // here, hard-coded. Any immune trait now refuses the action before
  // anything is spent, and says which trait did it — an action that
  // achieves nothing should explain itself.
  const traitImmunity = targetActor
    ? immuneToEffect(action, targetActor.system, ownedCreatureTypeSystem(targetActor))
    : null;
  if (traitImmunity) {
    ui.notifications.warn(
      `${action.name}: ${targetActor.name} is immune to the ${traitImmunity.trait} trait.`
    );
    return null;
  }
  // DUAL MINDS (3.647.0, F&F 3.0 block 15 R9): an action aims at one creature,
  // so a mental one reaches one of an Ettin's heads and does nothing.
  if (targetActor) {
    const { dualMindsImmuneReason, dualMindsVerdict } = await import("../dual-minds.mjs");
    if (dualMindsVerdict(targetActor.items, action.traits ?? "", 1) === "immune") {
      ui.notifications.warn(`${action.name}: ${dualMindsImmuneReason(targetActor.name)}.`);
      return null;
    }
  }

  // Ambush and Sniping (Chapter 8 reactions): each fires only off a
  // critical you've just inflicted with the right kind of weapon — Ambush
  // an Agile one, Sniping a ranged one inside its first range increment.
  // That half of the trigger is genuinely testable, so like the Rage
  // requirements it's enforced here, before any AP is spent, against the
  // critical remembered on the attacker. The target-state half stays the
  // GM's call.
  // ATTITUDE GATES (3.408.0). Request needs friendly or helpful; Command
  // an Animal fails outright at hostile or unfriendly. Both were prose.
  //
  // ENFORCED BEFORE AP IS SPENT, beside the Rage and Ambush requirements,
  // because refusing after the cost is charged is the worse half of a
  // refusal. WARNS AND STOPS rather than rolling a check the book says
  // cannot succeed — but only when there IS a target to have an attitude;
  // a targetless invocation is left to the GM as it always was.
  // TEMPORARILY IMMUNE (3.559.0). Four of these pages' actions print an
  // immunity — Encourage and Rally for an hour, Demoralise for ten
  // minutes, Treat Wounds for an hour — and every one of them was prose
  // in a description, tracked by whoever was running the game.
  //
  // REFUSED BEFORE THE AP IS SPENT, and said out loud with the time
  // remaining, because "nothing happened" is the one answer a player
  // cannot act on.
  if (targetActor && ACTION_IMMUNITIES[action.key] && !ignoreActionImmunity) {
    const { isTemporarilyImmune, immunityRemaining, describeRemaining, IMMUNITY_FLAG } =
      await import("../temporary-immunity.mjs");
    const key = actionImmunityKey(action.key, actor?.uuid ?? "");
    const record = targetActor.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
    const now = Number(game?.time?.worldTime ?? 0);
    if (isTemporarilyImmune(record, key, now)) {
      ui.notifications.warn(
        `${targetActor.name} is temporarily immune to `
        + `${ACTION_IMMUNITIES[action.key].label} `
        + `(${describeRemaining(immunityRemaining(record, key, now))} remaining).`
      );
      return null;
    }
  }

  if (targetActor && ATTITUDE_GATES[action.key]) {
    const { attitudeOf } = await import("../attitude-workflow.mjs");
    const gate = attitudeGateFor(action.key, attitudeOf(targetActor, actor?.uuid ?? ""));
    if (!gate.allowed) {
      ui.notifications.warn(
        `${targetActor.name} ${gate.gate.refusal} ${gate.attitude}.`
      );
      return null;
    }
  }

  if (modifiesCriticalResult(action.key)) {
    const trigger = criticalReactionTrigger(
      action.key,
      actor.getFlag(SYSTEM_ID, "lastCriticalInjury"),
      targetActor?.id ?? null
    );
    if (!trigger.allowed) {
      ui.notifications.warn(trigger.reason);
      return null;
    }
  }

  // ESCAPE (Chapter 4): "attempt an Acrobatics, Athletics or Unarmed
  // Attack check against the effect's DC." Three routes, and the action
  // offered one until 3.336.0.
  //
  // ASKED HERE, before the check is configured, and not with the other
  // pre-roll prompts further down — because the Unarmed Attack route
  // changes the KIND of check being made, and the situational dialog
  // below needs to know whether it is configuring a skill check or an
  // attack. Nothing has been spent at this point, so cancelling is free.
  // LESSER COVER IS NOT ENOUGH TO HIDE BEHIND (page 198's Can Hide
  // column; the block-19 audit's D4, Graham's R4 of 21 September 2026).
  //
  // REFUSED ONLY ON COVER THE SYSTEM ITSELF APPLIED. Cover is the GM's
  // call and mostly untracked, so a creature the system knows nothing
  // about may well have standard cover, or concealment, and is not
  // refused. A creature standing in Lesser Cover is the one case the
  // system knows the answer to — and it is no.
  if (action.key === "hide") {
    const level = takeCoverLevelOf(actor);
    if (level && !coverAllowsHide(level)) {
      ui.notifications.warn(
        "Hide: lesser cover is not sufficient (page 198). Take standard or greater cover first.");
      return null;
    }
  }

  if (action.key === "escape" && !skipDialog(event)) {
    const route = await promptEscapeRoute();
    if (!route) return null;
    const chosen = applyEscapeRoute(action, route);
    action = chosen.action;
    invokedSkillKey = chosen.invokedSkillKey ?? invokedSkillKey;
  }

  const config = checkConfiguration(actor, action, invokedSkillKey, targetActor);

  // Actions with no check: the card is the whole workflow.
  if (!config) {
    // PREPARE: choose the reaction before anything is spent, so
    // cancelling the chooser costs nothing — the same shape as Take
    // Cover's level prompt and Create's setup.
    let preparedChoice = null;
    if (action.key === "prepare") {
      const choices = preparableReactions(BASIC_ACTIONS, SKILL_ACTIONS);
      if (!choices.length) {
        ui.notifications.warn("Prepare: no Reaction is available to prepare.");
        return null;
      }
      if (!skipDialog(event)) {
        preparedChoice = await promptPreparedReaction(choices);
        if (!preparedChoice) return null;
      } else {
        preparedChoice = choices[0];
      }
    }

    let takeCoverLevel = null;
    if (action.key === "takeCover") {
      // "…or end this effect as a free action." Pressing Take Cover while
      // it is already up ENDS it, and costs nothing — checked before the
      // level prompt and long before any AP is spent, so the free half of
      // the sentence is genuinely free. Graham, 18 Aug 2026.
      //
      // This replaces the old behaviour of re-prompting and swapping
      // tiers. Swapping was never a printed rule; ending is, and a player
      // who wants the other tier can end and take it again.
      if (activeTakeCover(actor)) {
        await endTakeCover(actor);
        await postCard(actor, action.name, [
          ...headerLines(action),
          line("<em>Cover abandoned — the bonus ends. Ending Take Cover is a free action and costs no AP.</em>")
        ]);
        return null;
      }
    }
    if (action.key === "takeCover" && !skipDialog(event)) {
      takeCoverLevel = await promptTakeCoverLevel(action.name);
      if (!takeCoverLevel) return null;
    }

    // Coup de Grace (Chapter 4): needs a target (the adjacent
    // helpless opponent — "helpless" itself is never defined as a
    // mechanical condition anywhere in this rulebook, so it stays a
    // GM-adjudicated prerequisite like other requirements text), and
    // the critical-immunity question is asked up front since it
    // changes everything that follows. Both before AP is spent.
    let coupImmune = null;
    if (action.key === "coupDeGrace") {
      if (!targetActor) {
        ui.notifications.warn("Coup de Grace needs a target — select the helpless opponent's token first.");
        return null;
      }
      coupImmune = await promptCriticalImmune(targetActor.name);
      if (coupImmune === null) return null;
    }

    // Release (Chapter 4): prompt for which held item to drop, if
    // any — hooked into the same held-items logic the hand-budget
    // system already uses.
    let releaseChoice = null;
    if (action.key === "release" && !skipDialog(event)) {
      releaseChoice = await promptReleaseItem(actor);
      if (releaseChoice === null) return null;
    }

    // Delay (Chapter 4): a single action that either enters or
    // returns from Delay depending on current state — handled as its
    // own early branch, since its workflow (advancing or re-pointing
    // the combat tracker's turn) doesn't fit the standard "spend AP,
    // show description, post a card" shape the rest of this block
    // follows.
    if (action.key === "delay") {
      if (!game.combat) {
        ui.notifications.warn("Delay only makes sense during active combat.");
        return null;
      }
      const combatant = game.combat.combatants.find((c) => c.actor?.id === actor.id);
      if (!combatant) {
        ui.notifications.warn(`${actor.name} isn't part of the current combat.`);
        return null;
      }

      if (isActorDelayed(game.combat, actor)) {
        await returnFromDelay(game.combat, combatant);
        return postCard(actor, "Delay — Return", [
          line(`${actor.name} returns to the initiative order and acts now.`)
        ]);
      }

      if (game.combat.combatant?.id !== combatant.id) {
        ui.notifications.warn("You can only choose to Delay on your own turn.");
        return null;
      }
      await enterDelay(game.combat, combatant);
      return postCard(actor, "Delay", [
        line(`${actor.name} delays, removing themselves from the initiative order for now.`),
        line("<em>Use Delay again at any point to return and act immediately.</em>")
      ]);
    }

    // Ready (Chapter 4): a single action that either readies or, if
    // one is already pending, triggers it — same toggle pattern as
    // Delay. The trigger itself stays a free-text, GM-adjudicated
    // judgement call — this system has no way to watch for an
    // arbitrary narrative condition mechanically.
    if (action.key === "ready") {
      const pending = readiedAction(actor);
      if (pending) {
        // THE TRIGGER IS ANSWERED WITH A REACTION (3.646.0; Graham, 15
        // October 2026: "Attack of Opportunity and Readied action (after its
        // initial AP outlay) should use a Reaction"). Asked before anything
        // else, so a creature with none left — or one Flat-Footed, Confused
        // or in Full Defence — is told so and keeps what it readied.
        if (actorInCombat(actor)) {
          const blocked = actorReactionBlock(actor);
          const left = Number(actor.system?.resources?.reactions?.value ?? 0);
          if (blocked || left < 1) {
            ui.notifications.warn(`Ready: ${actor.name} cannot react right now (${blocked ?? "no reaction left"}) — the readied action waits.`);
            return null;
          }
        }
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: "Ready — Trigger?" },
          content: `<p>Has this occurred: <strong>${pending.trigger}</strong>?</p>`,
          rejectClose: false
        });
        if (!confirmed) return null;

        if (pending.kind === "spell") {
          const spell = await promptReadiedSpell(actor);
          if (!spell) return null;

          // PAID FOR, AND KEPT UNTIL IT HAPPENS (3.645.0, F7 of Graham's 14
          // October session). Ready's 2 AP bought the readied action, so it
          // is not charged again — off-turn the pool is usually empty, and
          // the AP gate refused the very action that was paid for. And the
          // readied action is spent only once something happened: a cast
          // refused (no target, out of range) leaves it waiting.
          const cast = await castSpell(actor, spell, { apPaid: true });
          if (cast) {
            await consumeReadiedAction(actor);
            await spendActionCost(actor, "reaction", "Ready", { traits: spell.system?.traits ?? "" });
          }
          return cast;
        }

        const eligible = [
          ...BASIC_ACTIONS.map((a) => ({ ...a, invokedSkillKey: null })),
          ...SKILL_ACTIONS.flatMap((a) =>
            (a.skills ?? [null]).map((skillKey) => ({ ...a, invokedSkillKey: skillKey }))
          )
        ];
        const storedAction = eligible.find(
          (a) => a.key === pending.actionKey && a.invokedSkillKey === pending.invokedSkillKey
        );
        if (!storedAction) {
          ui.notifications.warn("The readied action's own data couldn't be found — it may have changed since you readied it.");
          await consumeReadiedAction(actor);
          return null;
        }

        const done = await resolveAction(actor, { ...storedAction, apCost: "0" }, {
          invokedSkillKey: storedAction.invokedSkillKey,
          event,
          readied: true
        });
        if (done) {
          await consumeReadiedAction(actor);
          await spendActionCost(actor, "reaction", "Ready", { traits: storedAction.traits ?? "" });
        }
        return done;
      }

      if (!game.combat) {
        ui.notifications.warn("Readying an action only makes sense during active combat.");
        return null;
      }
      if (game.combat.combatant?.actor?.id !== actor.id) {
        ui.notifications.warn("You can only ready an action on your own turn.");
        return null;
      }
      const choice = await promptReadyChoice();
      if (!choice) return null;
      // THE INITIAL OUTLAY (3.646.0; Graham, 15 October 2026: "Readied action
      // (after its initial AP outlay) should use a Reaction"). Ready printed
      // 2 AP and charged nothing — found live testing 3.645.0 — so a
      // character could spend all three AP and Ready besides.
      if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;
      await spendActionCost(actor, action.apCost, action.name, { traits: action.traits });
      await readyActionAndEndTurn(actor, game.combat, choice);
      const readiedLabel = choice.kind === "spell" ? "a spell (2 AP or less)" : "an action";
      return postCard(actor, "Ready", [
        line(`${actor.name} readies ${readiedLabel}, waiting for: <strong>${choice.trigger}</strong>.`),
        line("<em>Use Ready again once the trigger occurs, at any point before your next turn — otherwise it's wasted.</em>")
      ]);
    }

    // ALIGNED CONTROL (Creature Codex, Appendix). Three requirements to
    // check and a target to read, so it has its own resolution rather
    // than a card describing itself.
    if (action.key === "alignedControl") {
      return resolveAlignedControl(actor, action);
    }
    // SENSE ALIGNED (3.632.0, ruling 14) — see aligned-sense-workflow.mjs.
    if (action.key === "senseAligned") {
      const { resolveSenseAligned } = await import("../aligned-sense-workflow.mjs");
      return resolveSenseAligned(actor, action);
    }

    // DOUBLE SLICE (Chapter 4). Two Strikes whose results depend on each
    // other — one critical between them, and a fumble anywhere spoils
    // both — so it resolves as a pair rather than posting a card that
    // describes two attacks the player then makes by hand.
    if (action.key === "doubleSlice") {
      if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;
      await spendActionCost(actor, action.apCost, action.name, { traits: action.traits });
      await recordTraitUsage(actor, action);
      {
        // A REAL BINDING, NOT MEMBER ACCESS ON THE IMPORT. The first draft
        // wrote `(await import(...)).biteOffensiveCurses(...)`, and
        // `verify-rules-have-callers` correctly refused to count it: it
        // walks the AST and `a.b` is a property, not a reference to
        // anything named b. Destructuring declares the name, so the
        // dependency is visible to the tool that checks for dead exports.
        const { biteOffensiveCurses } = await import("../magic/flat-ladder-workflow.mjs");
        await biteOffensiveCurses(actor, action);
        // AND A SANCTUARY ON THE ACTOR ENDS (3.598.0) — "If the target uses
        // a hostile action, the spell ends." Double Slice is two Strikes, so
        // it is hostile by construction; this is its commitment point and it
        // does not reach the one inside the attack workflow.
        const { endSanctuaryOnHostileAction } = await import("./sanctuary-gate.mjs");
        await endSanctuaryOnHostileAction(actor, action);
      }
      return runDoubleSlice(actor, action);
    }

    // SUSTAIN A SPELL (Chapter 4, Special). Routed EARLY, beside Double
    // Slice, so it returns before the generic checkType:"none" path below
    // spends the AP — the sustain workflow spends it itself, and one
    // action paying twice would be a worse defect than the one this
    // fixes.
    //
    // Graham, 27 August 2026: the action "deducts an AP, creates an entry
    // on the chat card but does nothing else". It had no handler at all —
    // `sustainASpell` appeared exactly once in the system, in its own
    // data entry. See magic/sustain.mjs.
    if (action.key === "sustainASpell") {
      const { sustainSpellAction } = await import("../magic/sustain-workflow.mjs");
      await sustainSpellAction(actor);
      return null;
    }

    // DISMISS (Chapter 4, Special Actions) — THE THIRD OF THIS SHAPE,
    // and the first found by a sweep rather than by a report (3.434.0).
    //
    // `dismiss` appeared only in its own data entry. It is
    // `checkType: "none"`, so this function spent its AP, posted the
    // printed description and ended nothing — while the Magic tab's own
    // button called `endActiveSpell` directly and ended the spell FOR
    // FREE. Sustain's defect exactly, four releases later.
    //
    // Routed early, before the generic path can spend the AP twice.
    if (action.key === "dismiss") {
      const { dismissSpellAction } = await import("../magic/dismiss-workflow.mjs");
      await dismissSpellAction(actor);
      return null;
    }

    // ATTACK OF OPPORTUNITY (Chapter 4, Basic Actions) — THE SAME SHAPE,
    // FOUND THE SAME WEEK (3.430.3).
    //
    // Graham, 28 August 2026: "Attack of Opportunity is spending a
    // reaction but not prompting an attack" — clicking the action on the
    // character sheet.
    //
    // `attackOfOpportunity` appeared in exactly two places in the whole
    // system: its own data entry, and ONE NEGATIVE GUARD below excluding
    // it from provoking further reactions. Nothing dispatched on the key.
    // It is `checkType: "none"`, so `resolveAction` did what it does for
    // any such action — checked the cost, spent the Reaction, posted the
    // printed description — and there was no handler to do the rest.
    //
    // ITS OWN DESCRIPTION GIVES THE GAME AWAY: "Use your weapon's Attack
    // button to swiftly retaliate." That sentence was written for a
    // system with no automation, and it outlived one — the whole engine
    // exists in combat/opportunity.mjs and was reachable only from the
    // offer card a provoking move posts.
    //
    // ROUTED EARLY, beside Sustain a Spell and Shield Block, so it
    // returns before the generic path spends the Reaction a second time.
    // Two spends for one reaction would be worse than the bug being
    // fixed — the lesson sustain-workflow.mjs records in as many words.
    if (action.key === "attackOfOpportunity") {
      const { useAttackOfOpportunity } = await import("./opportunity.mjs");
      await useAttackOfOpportunity(actor);
      return null;
    }

    // SHIELD BLOCK (Chapter 4, Martial). A Reaction with a number in it
    // — the shield's DR against one incoming blow — so it asks for the
    // damage rather than posting a description of itself.
    if (action.key === "shieldBlock") {
      return resolveShieldBlock(actor, action);
    }

    // Movement actions (Chapter 4), per Graham directly: rather than
    // spending AP for a card that describes moving, these arm the next
    // token move so the movement itself carries the action's rules and
    // its cost. Stride is the default for any unarmed move, so it needs
    // no arming — clicking it just confirms what dragging already does.
    if (isArmableMovement(action.key)) {
      if (!game.combat?.started) {
        ui.notifications.warn(`${action.name} only costs AP during an encounter — move freely outside one.`);
        return null;
      }
      if (game.combat.combatant?.actor?.id !== actor.id) {
        ui.notifications.warn(`You can only take ${action.name} on your own turn.`);
        return null;
      }
      // CHARGE needs somewhere to charge. Its whole shape — a minimum
      // distance, a direction, and a Strike at the end — is defined
      // against a target, so it is asked for before anything is armed.
      let chargeStart = null;
      if (action.key === "charge") {
        const chargerToken = activeToken(actor);
        const targetToken = game.user?.targets?.first?.() ?? null;
        if (!chargerToken || !targetToken) {
          ui.notifications.warn("Charge: target the creature you are charging first.");
          return null;
        }
        if (targetToken.document?.id === chargerToken.document?.id) {
          ui.notifications.warn("Charge: you cannot charge yourself.");
          return null;
        }
        chargeStart = await armCharge(actor, chargerToken.document ?? chargerToken, targetToken.document ?? targetToken);
      }

      await armMovementAction(actor, action.key);
      const armed = armedMovementSummary(actor);
      return postCard(actor, action.name, [
        ...headerLines(action),
        line(action.description ?? ""),
        line(
          `<strong>Armed.</strong> Your next move is a ${armed.name}` +
            (armed.limit != null ? `, up to <strong>${armed.limit} ft</strong>` : "") +
            `, costing <strong>${armed.apCost} AP</strong>.`
        ),
        ...(action.key === "charge"
          ? [line(
              `Charging <strong>${chargeState(actor)?.name ?? "your target"}</strong>` +
              (chargeStart !== null ? `, currently <strong>${chargeStart} ft</strong> away` : "") +
              ` — move at least 10 ft towards them, and the Strike is offered when you arrive.`
            )]
          : []),
        line("<em>The AP is spent when you actually move. Taking a different action, or ending your turn, clears it.</em>")
      ]);
    }

    if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;
    if (preparedPaysFor) await consumePreparedReaction(actor, action.key);
    else await spendActionCost(actor, action.apCost, action.name, { traits: action.traits });
    await recordTraitUsage(actor, action);
    {
      // A REAL BINDING — see the doubleSlice commit point above. This
      // site and the one at the end of `resolveAction` shipped at
      // 3.485.0 in the member-access form the comment there says the
      // ratchet refuses to count, so `verify-rules-have-callers` was
      // guarding one of the three commit points and blind to two.
      const { biteOffensiveCurses } = await import("../magic/flat-ladder-workflow.mjs");
      await biteOffensiveCurses(actor, action);
      // AND A SANCTUARY ON THE ACTOR ENDS (3.598.0) — "If the target uses a
      // hostile action, the spell ends." Beside the curse bite because this
      // is the same commitment point and the same question: is what they
      // just committed to an offensive action?
      const { endSanctuaryOnHostileAction } = await import("./sanctuary-gate.mjs");
      await endSanctuaryOnHostileAction(actor, action);
    }
    // DEAFENED AND GRABBED (3.621.0) — see `conditionCommitGate`.
    if (!(await conditionCommitGate(actor, action))) return null;
    // SHAKING A SLEEPER AWAKE (3.621.0; Appendix 2, Unconscious): "Physical
    // intervention such as someone shaking you awake with an Interact action
    // can bring you to consciousness." An Interact aimed at a creature that
    // is Unconscious in its own right (not Dying) wakes it.
    if (action.key === "interact") {
      const { shakeAwake } = await import("../conditions/condition-events-workflow.mjs");
      for (const token of game.user?.targets ?? []) {
        if (token?.actor && token.actor !== actor) await shakeAwake(actor, token.actor);
      }
    }
    await noteFullDefenceMove(actor, action);
    // FLY, pressed as a button, is the printed 0-foot hover — "You can
    // use an action to Fly 0 feet to hover in place." It buys nothing on
    // the map, so the only thing it can leave behind is the record that
    // an action was spent on flying this round, which is exactly what
    // the turn-end drop asks about.
    const hovered = action.key === "fly" ? await recordFlyAction(actor) : false;
    const lines = headerLines(action);
    if (action.description) lines.push(line(action.description));

    // WHERE THIS IS BEING DONE (page 201, R1 and R2) — see `placeNotes`.
    lines.push(...placeNotes(actor, action));
    // THE DISGUISE KIT (page 173; 3.577.0, block 17 D5): "You can create 10
    // disguises with this kit before it is exhausted." Disguise rolls
    // nothing — the observer rolls against your Deception DC — so a missing
    // kit cannot be a penalty on a check, and is said here instead: "a
    // simpler, quicker disguise might do without one (GM discretion)".
    if (TOOL_USE_ACTIONS.includes(action.key)) {
      const kitShort = toolShortfall({ actionKey: action.key, items: Array.from(actor.items ?? []) });
      if (kitShort) {
        lines.push(line(`<em>${toolShortfallText(kitShort).replace(/^./, (c) => c.toUpperCase())} — the GM decides whether it can be done without.</em>`));
      } else {
        const kit = heldToolFor({ actionKey: action.key, items: Array.from(actor.items ?? []) });
        const spent = await spendToolUse(actor, action.key);
        if (spent) lines.push(line(`<em>${spent.item.name}: ${spent.left} use${spent.left === 1 ? "" : "s"} left.</em>`));
        else if (kit) lines.push(line(`<em>Using ${kit.name}.</em>`));
      }
    }
    if (hovered) {
      lines.push(
        line("<em>Hovering — a Fly action has been used this round, so you will not fall at the end of your turn.</em>")
      );
    }
    // WHY THERE WAS NOTHING TO ROLL, when that is the reason (3.506.0).
    const automatic = automaticSuccessLine(action, actionCheckState(actor, action));
    if (automatic) lines.push(line(automatic));
    const outcome = pickOutcome("success", action.outcomes ?? {});
    // AND ONLY THE OUTCOMES THIS CARD CAN HONESTLY OFFER (3.506.1). An
    // action that succeeded automatically must not print its Failure line
    // directly under the sentence saying it succeeded.
    for (const entry of listedOutcomesFor(action, outcome.listed)) {
      lines.push(
        line(
          `<strong>${entry.key.charAt(0).toUpperCase() + entry.key.slice(1)}:</strong> ${entry.text}`
        )
      );
    }
    await applyBasicActionConditionEffects(
      basicActionConditionEffects(action.key, "success"),
      actor,
      targetActor,
      { actionKey: action.key }
    );
    await applyBasicActionStance(actor, action.key);
    for (const said of await burrowingBreathLines(actor, action)) lines.push(line(said));
    if (action.key === "mountDismount") {
      lines.push(line(await settleMount(actor, targetActor)));
    }
    if (takeCoverLevel) {
      await applyTakeCover(actor, takeCoverLevel);
      // Page 198's own sentence, at the level taken (R4).
      lines.push(line(`<em>${{
        greater: "Greater Cover: +8 circumstance to DB, Reflex saves and Stealth.",
        standard: "Standard Cover: +4 circumstance to DB, Reflex saves and Stealth.",
        lesser: "Lesser Cover: +2 circumstance to DB only — you cannot Hide behind a creature."
      }[takeCoverLevel]}</em>`));
    }
    if (preparedChoice) {
      await storePreparedReaction(actor, preparedChoice);
      lines.push(
        line(
          `<em><strong>${preparedChoice.name}</strong> is prepared — you may use it once as a free action before your next turn, costing no reaction from your pool. Its trigger still has to occur.</em>`
        )
      );
    }
    if (action.key === "aim") {
      const stacks = await accrueAim(actor);
      lines.push(
        line(
          `<em>+${stacks} circumstance to Attack Bonus so far (max +4), and Flat-Footed while aiming. Lost if you take any action other than continuing to Aim.</em>`
        )
      );
    }
    if (releaseChoice?.item) {
      await releaseChoice.item.update({ "system.equipped": false });
      lines.push(line(`<em>${releaseChoice.item.name} is dropped (unequipped).</em>`));
    }
    if (action.key === "coupDeGrace" && targetActor) {
      const attackTotal = 20 + Number(actor.system?.combat?.attack?.total ?? 0);
      const targetDB = Number(targetActor.system?.combat?.defence?.total ?? 10);
      const result = coupDeGraceAttackOutcome(attackTotal, targetDB, {
        criticalImmune: Boolean(coupImmune)
      });
      lines.push(
        line(
          `<strong>Automatic hit</strong> (treated as an unmodified 20): AV ${result.av}${result.critical ? ` — <strong>${result.critical} critical</strong>` : coupImmune ? " — no critical (target is immune)" : ""}.`
        )
      );
      lines.push(
        line(
          "<em>Roll and apply the weapon's damage via its own Damage button / Apply Damage as normal.</em>"
        )
      );
      await postCard(actor, action.name, lines);

      // "If the target survives the attack, they must make a Level
      // based Fortitude Saving Throw or die" — waived entirely for a
      // critical-immune target, per the rulebook's own exception.
      if (!coupImmune) {
        const survived = await promptTargetSurvived(targetActor.name);
        if (survived) {
          const attackerLevel = Number(actor.system?.identity?.level ?? 1);
          const saveDC = coupDeGraceSaveDC(attackerLevel);
          const fortitude = Number(
            targetActor.system?.combat?.saves?.fortitude?.total ?? 0
          );
          const saveCheck = await TRGCheck.roll({
            actor: targetActor,
            label: "Fortitude Save — Coup de Grace",
            subtitle: `DC ${saveDC} or die`,
            type: "save",
            subject: "fortitude",
            // WHO IS DOING THIS TO THEM (3.321.0). A save forced BY an
            // attacker can be scoped by that attacker's creature type —
            // Thengar's "+1 to Saving Throws against the attacks of
            // creatures of the Undead Type". Every axis the engine is not
            // told here is one it can never ask about later, since this
            // roll opens no dialog.
            sourceTypes: creatureTypesOf(actor.system ?? {}),
            sourceUuid: actor?.uuid ?? "",
            dc: saveDC,
            modifiers: [
              { label: "Fortitude Save bonus", value: fortitude, type: "untyped" }
            ]
          });
          const saveResult = coupDeGraceSaveResult(
            Boolean(saveCheck.outcome?.degree?.success),
            Number(targetActor.system?.combat?.deathState ?? 5),
            Number(targetActor.getConditionValue?.("doomed") ?? 0)
          );
          if (saveResult.dead) {
            await targetActor.toggleStatusEffect("dying", { value: saveResult.dyingValue });
            await postCard(actor, "Coup de Grace — Result", [
              line(`<strong>${targetActor.name} fails the save and dies.</strong>`)
            ]);
          } else {
            await postCard(actor, "Coup de Grace — Result", [
              line(`${targetActor.name} succeeds on the save and survives.`)
            ]);
          }
        }
      }
      return null;
    }
    return postCard(actor, action.name, lines);
  }

  const resolved = actionTargetDC(
    action.against,
    targetActor?.system ?? null,
    action.fixedDC,
    actor.system
  );

  // A PERIL TARGETED BY A DISABLING ACTION (3.620.0; Chapter 12, Graham's
  // R17): "The specific skill and corresponding DC required to disable a
  // peril are indicated in its stat block." Its Disable DC, and only its
  // listed skill — asked before anything is rolled or spent.
  const { perilForAction } = await import("../peril-workflow.mjs");
  const perilTarget = perilForAction(action, targetActor, invokedSkillKey ?? action.skills?.[0] ?? null);
  if (perilTarget?.refused) {
    ui.notifications.warn(`${action.name}: ${perilTarget.refused}.`);
    return null;
  }
  if (action.key === "disablePeril" && !perilTarget) {
    ui.notifications.warn(`${action.name}: target the peril first — its stat block sets the DC and the skill.`);
    return null;
  }
  if (perilTarget?.dc) {
    resolved.dc = perilTarget.dc;
    resolved.label = `${targetActor.name}'s Disable DC`;
    resolved.missingTarget = false;
  }

  // WHAT THE DEFENDER BRINGS TO THEIR OWN DEFENCE (Chapter 2, Storgar).
  //
  // "A +2 racial bonus to all checks to resist being shoved or moved
  // involuntarily" — and there is no such check: Shove resolves against the
  // defender's static Fortitude DC and they roll nothing. Graham's ruling of
  // 16 Aug 2026 puts the bonus on the DC instead, so it is applied here,
  // where the DC the attacker must beat is settled.
  //
  // The DC moves NOW because everything downstream compares against it; the
  // card lines are held until `lines` exists further down. They are not
  // optional — a DC two higher than the target's sheet shows, with nothing
  // saying why, is the kind of thing that gets reported as the maths being
  // wrong.
  const defenceDCLines = [];
  // A DEFENDER'S "DISADVANTAGE ON THIS CHECK" ROW (3.665.0, Tsuchi): read
  // with the DC rows below, applied to the roll's bias further down.
  let defenceDisadvantages = [];
  if (targetActor && resolved.dc !== null) {
    const defence = defenceDCBonus(
      targetActor, action.against, action.key,
      creatureTypesOf(actor?.system ?? {}), actor?.uuid ?? "", [], creatureTraits(actor?.system ?? {}));
    if (defence.total) {
      resolved.dc += defence.total;
      for (const entry of defence.entries) {
        defenceDCLines.push(
          `<em>${targetActor.name}: ${entry.label} ${entry.value > 0 ? "+" : ""}${
            entry.value} to ${resolved.label}${entry.scope ? ` — ${entry.scope}` : ""}.</em>`
        );
      }
    }
    defenceDisadvantages = defence.disadvantages ?? [];
    for (const entry of defenceDisadvantages) {
      defenceDCLines.push(
        `<em>${targetActor.name}: ${entry.label} — this check is rolled at disadvantage${entry.scope ? ` (${entry.scope})` : ""}.</em>`
      );
    }
  }

  // Silent (Chapter 6): lowers the Sniping check's DC by 2 — per
  // Graham directly, correcting the rulebook's own wording, which
  // states the opposite of the intended effect.
  if (action.key === "sniping" && resolved.dc !== null && hasSilentWeaponEquipped(Array.from(actor.items ?? []))) {
    resolved.dc -= 2;
  }

  // Learn a Spell: the DC comes from the chosen spell's own PP-cost band
  // (learnSpellCost, resolved into learnSpellSetup.cost by the setup
  // dialog above), not from a target or a GM's own call — action.against
  // is "none" purely as a placeholder this overrides outright.
  if (action.key === "learnSpell" && learnSpellSetup) {
    resolved.dc = learnSpellSetup.cost.dc;
    resolved.label = `${learnSpellSetup.spellName}'s Difficulty`
      + (learnSpellSetup.rarityRaise ? ` (+${learnSpellSetup.rarityRaise}, ${learnSpellSetup.rarityRaise >= 5 ? "Rare" : "Uncommon"})` : "");
  }

  // THE THREE MEDICINE DCs (pages 86–87), added at 3.559.0. All three
  // declared `against: "none"` and left the GM to type a number that was
  // already on the patient's sheet:
  //
  //   First Aid     "The difficulty of the check is determined by the
  //                  amount that the target is bleeding" — a four-row
  //                  table this system already bands for Appendix 2.
  //   Treat Disease "an opposed Medicine check against the disease's
  //   Treat Toxin    save DC" — the same DC the affliction's own save
  //                  is rolled against.
  //
  // ASKED OF THE TARGET, NOT OF THE PLAYER. Unlike the jumps below, there
  // is no question to put: both numbers are readable off the creature
  // being treated. If the target is missing or carries nothing to treat,
  // this resolves nothing and the GM's own call stands, exactly as before.
  if (action.key === "firstAid" && targetActor) {
    const bleeding = firstAidDC(targetActor.getConditionValue?.("bleeding"));
    if (bleeding) {
      resolved.dc = bleeding.dc;
      resolved.label = bleeding.label;
    }
  }
  if (TREAT_AFFLICTION_KIND[action.key] && targetActor) {
    const treated = treatAfflictionDC(
      Array.from(targetActor.items ?? []).filter((i) => i.type === "affliction"),
      TREAT_AFFLICTION_KIND[action.key]
    );
    if (treated) {
      resolved.dc = treated.dc;
      resolved.label = `${treated.name}'s save DC`;
    }
  }

  // The jumps, the same way and for the same reason: `against: "none"` is
  // a placeholder, and the distance the player just declared is the DC.
  // Only when they declared one — `jumpSetup` is null for a player who
  // left the field at zero, and a null here would overwrite nothing with
  // nothing while replacing the label.
  if (jumpSetup) {
    resolved.dc = jumpSetup.dc;
    resolved.label = jumpDCLabel(jumpSetup);
  }

  // DISPEL AND RECHARGE ITEM, the same way. Both print `against: "none"`
  // because neither rolls at a creature, and both have a DC the caster
  // just supplied: the effect's own, and the item's level DC.
  //
  // A DISPEL DC OF NULL IS NOT A FAILURE TO ANSWER — it is a GM who
  // chose to set it in the next dialog, which is where an unstated DC
  // has always landed. Left alone so the default-DC fallback below can
  // still offer one.
  // WRITTEN AS `action.key === "..."` TESTS, not as bare setup-object
  // tests, and that is not redundancy: verify-action-default-dc reads
  // this file for exactly this shape to know which degree-gated actions
  // settle their own DC. A `if (dispelSetup)` alone is invisible to it,
  // and the action would be listed as stranded or, worse, quietly given
  // a level-based default on top of the number the caster declared.
  if (action.key === "dispel" && dispelSetup?.dc) {
    resolved.dc = dispelSetup.dc;
    resolved.label = "the effect's DC";
  }
  if (action.key === "rechargeItem" && rechargeSetup) {
    resolved.dc = rechargeSetup.dc;
    resolved.label = `${rechargeSetup.itemName}'s level DC`;
  }
  if (isSensePowerAction(action.key) && sensePowerSetup?.dc) {
    resolved.dc = sensePowerSetup.dc;
    resolved.label = "the aura's DC";
  }
  // The Survival DC applies ONLY while they are covering; otherwise the
  // level DC `resolved` already holds stands. Named in the label either
  // way, so the card says which rule was used rather than only a number.
  if (action.key === "assessTracks" && assessTracksSetup && targetActor) {
    const picked = assessTracksDC(
      assessTracksSetup.covering,
      resolved.dc,
      Number(targetActor.system?.skills?.survival?.dc ?? NaN)
    );
    if (picked.dc !== null) {
      resolved.dc = picked.dc;
      resolved.label = picked.label;
    }
  }

  // TREAT INJURY'S LADDER (page 194; the block-19 audit's D7, Graham's R7
  // of 21 September 2026): "a DC 20 Medicine Skill Check" for a Minor
  // injury, "a DC 24 Medicine Check" for a Serious one and "a DC 30
  // Medicine Check" for a Deadly one. The action had `against: "none"`
  // and rolled against no DC at all.
  //
  // THE DC IS THE PATIENT'S, so it is read from the target's worst injury
  // — written onto `resolved` here, before the dialog, so the GM sees the
  // number they are about to roll against and can still overrule it.
  let treatInjurySetup = null;
  if (action.key === "treatInjury" && targetActor) {
    const { worstInjurySeverity } = await import("../injury-workflow.mjs");
    const { treatInjuryDC } = await import("../injuries.mjs");
    const band = worstInjurySeverity(targetActor);
    treatInjurySetup = band
      ? { severity: band.key, label: band.label, dc: treatInjuryDC(band.key) }
      : null;
  }
  // WRITTEN AS ITS OWN OVERRIDE, in the shape `verify-action-default-dc`
  // recognises: an action declaring `against: "none"` escapes the
  // degree-gated list only by naming itself beside a `resolved.dc =`.
  // Learn a Spell is the other one.
  if (action.key === "treatInjury" && treatInjurySetup) {
    resolved.dc = treatInjurySetup.dc;
    resolved.label = `${treatInjurySetup.label} injury`;
    resolved.missingTarget = false;
  }

  // AN ESCAPE FROM SOMETHING THAT NAMED ITS OWN DC (3.609.0, block 33's R1).
  // Volcanic Inferno's rock: "attempt to Escape against your spell DC". The
  // effects carry it (magic/encase.mjs); the highest one is the attempt.
  //
  // WRITTEN AS AN OVERRIDE IN THE SHAPE `verify-action-default-dc` READS,
  // like Learn a Spell: Escape is degree-gated and declares `against:
  // "none"`, and here it takes its DC from what holds the creature. With
  // nothing holding it, the GM's DC stands exactly as it always has — a
  // grapple's Escape DC is the grappler's, which no pre-fill could know.
  const { escapableEffects, escapeDCFor } = await import("../magic/encase.mjs");
  const escapeHolds = action.key === "escape" ? escapableEffects(Array.from(actor.effects ?? []), SYSTEM_ID) : [];
  const escapeHoldDC = escapeDCFor(escapeHolds);
  if (action.key === "escape" && escapeHoldDC !== null) {
    resolved.dc = escapeHoldDC;
    resolved.label = [...new Set(escapeHolds.map((h) => h.from).filter(Boolean))].join(", ") || "what holds you";
    resolved.missingTarget = false;
  }

  // AN ACTION WHOSE CONSEQUENCE NEEDS A DEGREE MUST BE ABLE TO HAVE ONE
  // (3.422.0). Eight actions apply a degree-gated outcome and bring no
  // DC of their own, so they reached the roll with `dc: null`, resolved
  // to `degree: null`, and applied nothing — silently. Graham found it
  // through Study Target, which could therefore never record a target.
  //
  // Filled only where nothing else answered, so a target's Defence, a
  // fixed DC and Learn a Spell's own band above all still win. See
  // combat/action-default-dc.mjs for the ruling and the ratchet.
  //
  // A SUGGESTION, NOT A WRITE. The first version of this assigned
  // straight onto `resolved.dc`, and that quietly took the GM's choice
  // away: `finalDC` is `situational?.dc ?? resolved.dc`, so a GM who
  // deliberately selected "Set by the GM (roll total only)" got a null
  // from the dialog which fell through the `??` onto the default — and
  // rolled against it anyway. This module's own header promised the
  // opposite ("or switch back to Set by the GM deliberately"), which
  // made it the same defect as the comment that started all this:
  // documentation describing an intention the code did not carry.
  //
  // Found by driving it on 3.423.0 rather than by any check, which is
  // why `verify-action-default-dc` gained section E.
  const suggestedDC = defaultActionDC({
    actionKey: action.key,
    against: action.against,
    resolvedDC: resolved.dc,
    level: Number(actor.system?.identity?.level ?? 0)
  });
  const suggestedLevel = Number(actor.system?.identity?.level ?? 0);

  if (resolved.missingTarget) {
    ui.notifications.warn(
      `${action.name} rolls against ${resolved.label.toLowerCase()} — target a token first, or roll without one for the GM to compare.`
    );
  }

  // Same situational-configuration dialog every other check goes through
  // — DC override, difficulty, situational modifiers, roll mode, and the
  // Conviction Advantage checkbox. Held-modifier-key skip (Shift/Ctrl/Cmd)
  // works here exactly as it does for a plain skill or save roll.
  // Extend Rage's difficulty isn't a property of the action, it's a
  // property of how many times this particular rage has already been
  // extended — Hard, then Very Hard, then Incredibly Hard, then
  // Impossible. Resolved before the dialog so the correct step is what
  // the player is shown and what they roll against by default.
  let sizeEaseNote = null;
  let actionDifficulty =
    action.key === "extendRage"
      ? rageExtensionDifficulty(rageExtensionsUsed(actor))
      : action.difficulty ?? "medium";

  // Ambush and Sniping: "the difficulty decreases by one step for each
  // size category larger than you the target is." Stated in both
  // descriptions and applied by nothing, so a Small character sniping a
  // Huge creature got no reduction at all.
  if (modifiesCriticalResult(action.key) && targetActor) {
    const stepped = sizeAdjustedDifficulty(
      actionDifficulty,
      sizeCategoryDifference(actor.system?.identity?.size, targetActor.system?.identity?.size)
    );
    if (stepped.steps > 0) {
      actionDifficulty = stepped.difficulty;
      // Held rather than pushed: `lines` is not declared until after the
      // roll, and writing to it here would throw before it exists. The
      // same mistake in 3.99.0 killed every weapon attack in the game,
      // and ESLint cannot see it because the variable does exist in this
      // scope — just not yet.
      sizeEaseNote =
        `<em>${targetActor.name} is ${stepped.steps} size categor${stepped.steps === 1 ? "y" : "ies"} larger — difficulty eased ${stepped.steps} step${stepped.steps === 1 ? "" : "s"}.</em>`;
    }
  }

  // TOOLS (Chapter 4). Two halves, and they are different kinds of rule.
  //
  // Force Open prints an exact consequence — "If you do not have an
  // appropriate tool (such as a crowbar) to assist with the task, the
  // check's difficulty is increased by one step" — so it is APPLIED, here,
  // before the dialog, exactly as the Ambush/Sniping size step above is.
  // The player is then shown the difficulty they will actually roll
  // against rather than one that changes under them afterwards.
  //
  // Every other tool action hands the size of the consequence to the GM
  // ("up to -10… or may not allow the check at all"), so those are offered
  // as a pre-ticked row inside the dialog instead — see tools-requirement.mjs.
  let toolNote = null;
  {
    const items = Array.from(actor.items ?? []);
    const shortfall = toolShortfall({ actionKey: action.key, items });
    if (shortfall) {
      if (toolDifficultyStep({ actionKey: action.key, items })) {
        const stepped = stepDifficultyHarder(actionDifficulty);
        if (stepped !== actionDifficulty) {
          actionDifficulty = stepped;
          // Held rather than pushed, for the same reason sizeEaseNote is:
          // `lines` does not exist yet in this scope.
          toolNote =
            `<em>Without ${shortfall.label}, the difficulty increases one step.</em>`;
        }
      } else {
        ui.notifications.warn(
          `${action.name}: ${toolShortfallText(shortfall)} — a penalty is offered on the check.`
        );
      }
    }
  }

  let situational = null;
  if (!skipDialog(event)) {
    situational = await promptCheckConfiguration({
      title: action.name,
      allowModifiers: true,
      // PRE-FILLED with the fallback where there is one, so the dialog
      // opens on "Fixed DC" with a sensible number rather than on
      // "Set by the GM" — and the GM can still change it or choose
      // "Set by the GM" and be obeyed.
      dc: resolved.dc ?? suggestedDC,
      actor,
      checkType: config.type,
      // The skill this action rolls against, and the action itself, so a
      // permanent-but-scoped conditional can name either — "advantage on
      // all Subsist (Survival) checks" names the action, while "+1 to
      // Stealth in forests" names the skill.
      subject: readInvokedSkillKey(invokedSkillKey ?? "").key || action.skills?.[0] || "",
      actionKey: action.key,
      // AND WHO IT IS AIMED AT (3.567.0). BOTH PATHS OR NEITHER: the
      // dialog sets `conditionalsResolved`, so an axis the roll knows and
      // the dialog does not is an axis that works only when the player
      // holds Shift — which is the shape of working almost nowhere.
      // Dracoris's Wyrm bonus has to be offered here to be offered at
      // all, and it is offered pre-ticked because targeting a Wyrm
      // settles its whole scope.
      targetTypes: creatureTypesOf(targetActor?.system ?? {}),
      targetTraits: creatureTraits(targetActor?.system ?? {}),
      targetUuid: targetActor?.uuid ?? "",
      // WHAT IS BEING MADE (3.577.0): "alchemical" on a Crafting (alchemy)
      // check, so the Alchemy Lab's +4 is offered there and nowhere else.
      // BOTH PATHS, as the axes above are — see the roll below.
      traits: actionCheckTraits(action, createItemTypeKey),
      defaultDifficulty: actionDifficulty,
      // A PERIL'S SITUATIONAL BONUSES (3.629.0): the Empty Chair's remembered
      // name, the False Confession's examined ledger — offered, unticked.
      extraConditionals: perilTarget?.bonuses ?? []
    });
    if (!situational) return null;
  }

  // A GM WHO OPENED THE DIALOG HAS ANSWERED, even when the answer was
  // "no DC" — so the suggestion is used only on the path where nothing
  // was asked (a skipped dialog). Inside the dialog branch the original
  // `??` is untouched, because a deliberate "unknown" must still not
  // erase a real target's Defence.
  let finalDC = situational
    ? situational.dc ?? resolved.dc
    : resolved.dc ?? suggestedDC;
  if (dcOverride !== null && dcOverride !== undefined && Number.isFinite(Number(dcOverride))) {
    finalDC = Number(dcOverride);
    resolved.label = String(dcLabel || `DC ${finalDC}`);
    resolved.missingTarget = false;
  }
  // NAMED ONLY WHEN IT IS ACTUALLY THE RUNG. If the GM typed a number of
  // their own, calling it "Medium (level + 14)" on the card would be a
  // caption describing a different DC than the one beside it.
  // THE RULE MOVED INTO `labelIsDefault` AT 3.509.0, because the version
  // written here did not say what the comment above it says: it compared
  // `finalDC === suggestedDC`, and `defaultActionDC` hands back the
  // resolved DC unchanged when there is one — so it was true for every
  // action with any DC, and 47 cards carried a caption for a DC they had
  // not used. See combat/action-default-dc.mjs.
  // A RARE OR UNCOMMON CREATURE (3.622.0; block 39's A19, Graham's R10):
  // "All checks in relation to the entity with this trait have their DC
  // increased by +5" (Rare), +2 (Uncommon) — Recall Knowledge and the
  // identify actions aimed at it. On whatever DC was settled, the GM's own
  // included, and said on the card.
  const rarityRaise = targetActor && finalDC !== null && finalDC !== undefined
    ? rarityRaiseForAction(action.key, creatureTraits(targetActor.system ?? {}))
    : 0;
  if (rarityRaise) {
    // THE GM'S OWN NUMBER, NAMED AS SUCH (3.622.1, G3 of the 3.622.0 drive):
    // a DC typed into the dialog sat beside "No target DC".
    const baseLabel = resolved.missingTarget || /^no target/i.test(String(resolved.label ?? ""))
      ? `DC ${finalDC}` : (resolved.label ?? "DC");
    finalDC += rarityRaise;
    resolved.label = `${baseLabel} ${rarityRaiseNote(targetActor.name, rarityRaise)}`;
  }
  // …AND ONE THE GM SETS LATER (3.622.1, R2): stored with the pending
  // outcome below and added by the card's Set DC — see `lateSetDC`.
  const lateRarityRaise = targetActor && (finalDC === null || finalDC === undefined)
    ? rarityRaiseForAction(action.key, creatureTraits(targetActor.system ?? {}))
    : 0;
  const defaultCaption = defaultDCCaption({
    resolvedDC: resolved.dc, suggestedDC, finalDC, level: suggestedLevel });
  if (defaultCaption) {
    resolved.label = defaultCaption;
    resolved.missingTarget = false;
  }
  let effectiveDifficulty = situational?.difficulty ?? actionDifficulty;
  let effectiveApCost = action.apCost;

  // AP-cost reductions from feats (Fast Aim: Aim costs 1 less) and from
  // active feat stances (Double Stance, Duelling Dance) — only ever
  // applied to plainly numeric costs, never "Reaction"/"Varies".
  const apReduction = apCostReduction(action.key, actorFeatNames) + stanceApReduction;
  if (apReduction && /^\d+$/.test(String(effectiveApCost ?? "").trim())) {
    effectiveApCost = String(Math.max(0, Number(effectiveApCost) - apReduction));
  }
  // A CREATURE'S OWN JUMP (3.654.0, block 21 R9 — Ether Leap): the declared
  // AP, with no difficulty raised for it, and provoking nothing.
  const ownJump = ["highJump", "longJump"].includes(action.key) ? abilityJump(Array.from(actor.items ?? [])) : null;
  if (ownJump) effectiveApCost = String(ownJump.ap);

  // BORN TO RIDE (3.378.0): one of the three riding actions is Free, once
  // per round. Applied AFTER the reductions above so it sees the cost the
  // action would actually have had — and only marked as used when it
  // genuinely changed something, so guiding with knees (already Free)
  // cannot silently spend the round's one use.
  const bornToRide = oncePerRoundFreeAction(action.key, effectiveApCost, actorFeatNames);
  let bornToRideSpent = false;
  if (bornToRide.applies && bornToRide.changes
    && !actor.getFlag?.(SYSTEM_ID, "bornToRideUsed")) {
    effectiveApCost = "0";
    bornToRideSpent = true;
  }

  // First Aid / Resuscitation (Chapter 8): "By increasing the
  // difficulty of the check by [4 / one step] you may reduce the AP
  // cost of this action by 1 (min 1 AP)." Run after the situational
  // dialog above, not before, since First Aid's own DC is manually
  // entered rather than derived — this way the increase applies to
  // whatever DC the player actually settled on there.
  if (MEDICINE_AP_TRADEOFF_ACTIONS.has(action.key) && !skipDialog(event)) {
    const isResuscitation = action.key === "resuscitation";
    const hint = isResuscitation
      ? "Increase the difficulty by one step to reduce the AP cost by 1 (minimum 1 AP)."
      : "Increase the DC by 4 to reduce the AP cost by 1 (minimum 1 AP).";
    const traded = await promptMedicineApTradeoff(action.name, hint);
    if (traded === null) return null;
    if (traded) {
      if (isResuscitation) {
        effectiveDifficulty = stepDifficultyHarder(effectiveDifficulty);
      } else if (finalDC !== null) {
        finalDC += 4;
      }
      effectiveApCost = medicineTradedApCost(action.apCost, true);
    }
  }

  // Chapter 4's OTHER printed-option family: "By increasing the
  // difficulty of the check by N you may…". Same side of the check as
  // First Aid's trade above — the DC's, not the roll's — and asked in
  // the same place and for the same reason.
  //
  // Four of these are repeatable ("each time you increase the difficulty
  // in this way, another target is affected"), so the prompt takes a
  // COUNT rather than a tick.
  let tradedDifficulty = null;
  // Whether the increase actually reached a DC. It cannot when the
  // difficulty is left on "Set by the GM (roll total only)" — there is no
  // number to raise — and the card has to say which of the two happened,
  // because the GM sets that DC AFTER the roll and would otherwise never
  // learn that five of it had been bought.
  let tradedDifficultyApplied = false;
  // A creature's own jump price (Ether Leap) leaves the 1 AP trade nothing to buy.
  if (hasTradeoffs(action.key) && !ownJump && !skipDialog(event)) {
    // TWO GENERAL FEATS BUY ONE OF THESE OUTRIGHT (3.360.0). Group Coercion
    // frees additional Coerce targets — the first, and one more per 5
    // Intimidate ranks — and Experienced Tracker frees tracking at full
    // Speed. Both are exceptions to a price the tradeoff table sets, so the
    // waiver travels to the table rather than being subtracted afterwards
    // from a total neither feat computed.
    const tradeoffFeats = Array.from(actor.items ?? [])
      .filter((i) => i.type === "feat").map((i) => i.name);
    const waivers = {};
    if (action.key === "coerce") {
      const free = groupCoercionFreeTargets(
        tradeoffFeats, Number(actor.system?.skills?.intimidate?.ranks ?? 0)
      );
      if (free) waivers.extraTarget = { freeCount: free };
    }
    if (action.key === "track" && fullSpeedTrackingDC(tradeoffFeats) === 0) {
      waivers.fullSpeed = { dc: 0 };
    }
    // …AND ANY AN ITEM OR EFFECT DECLARES (3.670.0; Monkey Stance's 1-AP jumps).
    {
      const { declaredTradeoffWaivers } = await import("../difficulty-tradeoffs.mjs");
      Object.assign(waivers, declaredTradeoffWaivers([...Array.from(actor.items ?? []), ...Array.from(actor.appliedEffects ?? actor.effects ?? [])], action.key));
    }
    tradedDifficulty = await promptDifficultyTradeoffs(action.key, action.name, { waivers });
    if (tradedDifficulty === null) return null;
    if (tradedDifficulty.dcIncrease && finalDC !== null) {
      finalDC += tradedDifficulty.dcIncrease;
      tradedDifficultyApplied = true;
    }
    effectiveApCost = tradedApCost(effectiveApCost, tradedDifficulty.chosen);
  }
  const chosenTradeoffKeys = Array.isArray(tradedDifficulty?.chosen) ? tradedDifficulty.chosen : [];

  // Treat Wounds (Chapter 8): "For every 1 that you increase the DC,
  // you may heal an additional 1 hit points (max of +20, doubled on
  // a critical)." The bonus itself is applied to the extracted heal
  // amount further below, once the critical/non-critical outcome is
  // actually known.
  // PAIN TOLERANCE'S TRADE IS MADE IN THE ROLL DIALOG, not in a prompt of
  // its own: the player raises the DC above the action's printed 20 and
  // "for every 4 that you increase the DC, you may ignore an additional
  // point". So what was bought is the difference between the DC they
  // settled on and the one the action prints, measured HERE — where both
  // numbers exist — and carried to the outcome, which is the only place
  // that knows whether the check succeeded.
  const painToleranceExtraDC = action.key === "painTolerance"
    ? Math.max(0, Number(finalDC ?? 0) - Number(action.fixedDC ?? 0))
    : 0;
  let treatWoundsExtraDC = 0;
  let treatWoundsExtraTargets = 0;
  if (action.key === "treatWounds" && !skipDialog(event) && finalDC !== null) {
    const traded = await promptTreatWoundsExtraDC(action.name);
    if (traded === null) return null;
    treatWoundsExtraDC = traded.extraDC;
    treatWoundsExtraTargets = traded.extraTargets;
    // TWO PRICES, ADDED SEPARATELY (3.559.0). 1 DC per hit point and 5 DC
    // per additional target — and only the first is doubled on a
    // critical, which is why `treatWoundsExtraDC` stays the per-HP number
    // alone rather than becoming the total paid.
    finalDC += treatWoundsExtraDC + treatWoundsTargetDC(treatWoundsExtraTargets);
  }

  // PICK POCKET (Chapter 4, page 96): "If the object is in a pocket,
  // purse or is closely guarded in some other way THE DC IS INCREASED BY
  // 5." A DC adjustment and not a check penalty, and the book says so in
  // the sentence — so it lands here beside the other DC adjustments,
  // after the opposed Perception DC has resolved.
  if (action.key === "pickPocket" && pickPocketSetup?.guarded && finalDC !== null) {
    finalDC += GUARDED_OBJECT_DC;
  }

  // Create — inventing a new formula raises the DC by 5 (Chapter 4).
  if (action.key === "create" && createInventFormula && finalDC !== null) {
    finalDC += 5;
  }

  // Create — a batch of consumables moves the DC (Chapter 4's Core Table):
  // 1-3 is -2, 4 is level, and it climbs to +10 by ten.
  //
  // WIRED AT 3.363.0, AND IT HAD NEVER APPLIED. `consumableDCModifier` was
  // written, tested and called by nothing, while the dialog collected the
  // batch quantity, the project stored it and the card printed it — so
  // brewing ten potions rolled exactly the DC of brewing one, and both the
  // easier small batch and the much harder large one silently vanished.
  // Every visible sign said the number was in use. Found by
  // tools/verify-rules-have-callers.mjs.
  if (action.key === "create" && createBatchDC && finalDC !== null) {
    finalDC += createBatchDC;
  }

  // Create — a herb without Alchemical Crafting is a Very Hard check, DC +5
  // (Graham's R5 of the block-17 audit, 3.577.1). A DC adjustment in the
  // ruling's own words, so it lands beside the other two.
  if (action.key === "create" && createHerbDC && finalDC !== null) {
    finalDC += createHerbDC;
  }

  // Shield Bash (Chapter 4): needs an equipped shield actually
  // capable of it — the rulebook itself excludes Buckler outright,
  // and never mentions Parrying Scabbard for this at all.
  let bashShield = null;
  if (action.key === "shieldBash") {
    bashShield = equippedBashableShield(Array.from(actor.items ?? []));
    if (!bashShield) {
      ui.notifications.warn(
        "No equipped shield capable of a Shield Bash (Buckler and Parrying Scabbard can't be used this way)."
      );
      return null;
    }
  }

  // Repair (Chapter 6): "Requirements You have a repair kit" —
  // matched by name rather than a trait, since this item carries no
  // distinguishing trait text of its own. The target item is chosen
  // here too, before AP is spent, so cancelling either check costs
  // nothing.
  let repairTarget = null;
  if (action.key === "repair") {
    const hasRepairKit = Array.from(actor.items ?? []).some(
      (item) => item.type === "gear" && item.system?.equipped && item.name === "Repair Kit"
    );
    if (!hasRepairKit) {
      ui.notifications.warn(`${actor.name} needs an equipped Repair Kit to attempt this.`);
      return null;
    }
    repairTarget = await promptRepairTarget(actor);
    if (!repairTarget) return null;
  }

  // Trackless Step (Chapter 5): "attempts to track you are made at
  // disadvantage." The penalty lands on somebody ELSE's roll, and the Track
  // action has no target field, so nothing tells the system whose trail is
  // being followed. Graham's ruling, 21 August 2026: ask. The quarry is
  // named before the roll — information the GM has to settle anyway before
  // setting the difficulty — and anyone named who has the feat applies it.
  let tracklessQuarry = null;
  if (action.key === "track" && !skipDialog(event)) {
    tracklessQuarry = await promptTrackQuarry();
  }

  // Refocus (Chapter 6): the ability is named BEFORE the check, because every
  // rung below Success attaches its consequence to that named ability — a
  // minute's wait, a ten-minute block, or nothing again today. Picking after
  // the roll would let a player choose which ability to hand a fumble to with
  // the fumble already showing. Asked before the spend, like Repair's target,
  // so cancelling costs nothing.
  let refocusTarget = null;
  if (action.key === "refocus") {
    const pick = await chooseRefocusTarget(actor, { event });
    if (!pick.item) {
      if (pick.reason === "none") {
        ui.notifications.warn(`${actor.name} has no spent Focus ability to restore.`);
      } else if (pick.reason === "barred") {
        // NAMED, NOT SILENT. Everything spent is barred by an earlier
        // attempt, and the player is told which rule is holding each one.
        ui.notifications.warn(
          `Refocus is barred on every spent Focus ability: ${pick.barred
            .map((b) => `${b.item.name} (${b.reason})`)
            .join(", ")}.`
        );
      }
      return null;
    }
    refocusTarget = pick.item;
  }

  // Study Target (Chapter 4): the character chooses how long to spend, which
  // both sets the time cost and grants a circumstance modifier to the check
  // (1 round −2 … 1 hour +5). Asked before the spend, like the other pre-roll
  // choices, so cancelling costs nothing.
  let studyTimeModifier = null;
  if (action.key === "studyTarget" && !skipDialog(event)) {
    const timeOption = await promptStudyTime();
    if (!timeOption) return null;
    effectiveApCost = timeOption.label;
    if (timeOption.modifier !== 0) {
      studyTimeModifier = {
        label: `Study time (${timeOption.label})`,
        value: timeOption.modifier,
        type: "circumstance"
      };
    }
  }

  // Identify Power (Chapter 4): "You choose the amount of time you wish to
  // spend identifying the magic and apply the following modifiers: 10
  // minutes (+0), 1 minute (-2), 1 round (-5), 1 AP (-10)." A modifier to
  // the CHECK, like Study Target's ladder and unlike Transfer Runes' —
  // and the only rung that costs AP is the last one, which is why the
  // chosen option carries its own apCost rather than reusing its label.
  //
  // 3.337.0 generalises this to the other four actions that print the
  // same kind of ladder — Evaluate, Disable a Device, Pick Lock and
  // Sense Mental Effect. They do NOT share a scale (see TIME_LADDERS),
  // so the table is what varies and this branch is what stays the same.
  let identifyTimeModifier = null;
  // QUICK IDENTIFICATION (3.377.0) swaps the whole Identify Power ladder
  // for a better one that also has a rung the base ladder does not — 0 AP
  // at -10. Swapped HERE, at the one place the ladder is chosen, so the
  // dialog, the AP actually charged and the modifier all come from the
  // same table; picking the ladder for the prompt and the modifier
  // separately is how a player gets charged for a rung they did not pick.
  // A module action may declare its own (3.666.0) — see declaredTimeLadder.
  const baseLadder = skipDialog(event) ? null : timeLadder(action.key, action);
  const actionLadder = (baseLadder && action.key === "identifyPower")
    ? identifyPowerLadderFor(baseLadder, actorFeatNames)
    : baseLadder;
  if (actionLadder) {
    const timeOption = await promptTimeLadder(actionLadder);
    if (!timeOption) return null;
    effectiveApCost = timeOption.apCost;
    identifyTimeModifier = ladderModifier(actionLadder, timeOption);
  }

  // Subsist (Chapter 4): two circumstance penalties the player elects to
  // take — "-5 circumstance penalty" for fewer than 8 hours, and "-2
  // circumstance penalty... for an additional target". Both are emitted;
  // Appendix 1 then suppresses the smaller if both were taken.
  let subsistRows = [];
  if (action.key === "subsist" && !skipDialog(event)) {
    const chosen = await promptSubsistOptions();
    if (!chosen) return null;
    subsistRows = subsistModifiers(chosen);
  }

  // DISPEL'S COUNTERACT MODIFIER (Chapter 4, page 91; Chapter 8's rule).
  // "±2 for each level or PP difference between your counteract action
  // and that of the effect you are attempting to remove", with the
  // book's worked example of an 8 PP attempt against a 10 PP effect
  // taking -4.
  //
  // EMITTED ONLY WHEN THE GM SUPPLIED THE EFFECT'S VALUE. A 0 in that
  // box means "unknown", and counting it as a level-0 effect would hand
  // the caster a large bonus for the GM declining to answer — which is
  // the opposite of what leaving it blank means.
  const auraRows = [];
  if (sensePowerSetup) {
    const row = auraModifier(sensePowerSetup.keys);
    if (row) auraRows.push(row);
  }

  // SNEAK. The +2/+4 for cover, the -4 for full Speed, and the negative
  // row that cancels Taking Cover's larger bonus — which the effect on
  // the actor is already adding and page 93 says does not apply while
  // moving. Read off the live effect rather than assumed, so a character
  // who is not Taking Cover gets no correction row at all.
  const sneakRows = sneakSetup
    ? sneakModifiers({
      cover: sneakSetup.cover,
      fullSpeed: sneakSetup.fullSpeed,
      takeCoverStealthBonus: Number(
        activeTakeCover(actor)?.changes?.find?.(
          (c) => c.key === "system.skills.stealth.circumstance"
        )?.value ?? 0
      )
    })
    : [];

  // DETECT DECEPTION. The -4 a Fumble leaves standing against this
  // target, until a Critical clears it. Read from the ACTOR's own flag
  // and keyed by the target — it is the reader's memory of having been
  // fooled, not something done to the target.
  const misreadRows = [];
  if (action.key === "detectDeception" && targetActor) {
    const row = misreadModifier(
      actor.getFlag?.(SYSTEM_ID, DETECT_DECEPTION_FLAG) ?? {},
      targetActor.uuid,
      targetActor.name
    );
    if (row) misreadRows.push(row);
  }

  const dispelRows = [];
  if (dispelSetup && dispelSetup.effectValue > 0) {
    const value = counteractModifier(dispelSetup.pp, dispelSetup.effectValue);
    if (value) {
      dispelRows.push({
        label: `Counteract (${dispelSetup.pp} PP vs ${dispelSetup.effectValue})`,
        value,
        type: "circumstance"
      });
    }
  }

  // Transfer Runes (Chapter 4): the rune, the two items, and the time —
  // and unlike the two ladders above, this one raises the DC rather than
  // modifying the roll ("by increasing the difficulty of the check by 2").
  // Asked here, after the situational dialog, for the same reason First
  // Aid's own DC trade is: the increase belongs on whatever DC the player
  // actually settled on there.
  let runeTransferSetup = null;
  if (action.key === "transferRunes" && !skipDialog(event)) {
    runeTransferSetup = await promptRuneTransfer(actor);
    if (!runeTransferSetup) return null;
    effectiveApCost = runeTransferSetup.timeLabel;
    if (finalDC !== null) finalDC += runeTransferSetup.dcIncrease;
  }

  // Invoke and Revoke Rage cost "Action varies" — the AP spent is the
  // *result* of the check, not a price paid to attempt it, so unlike
  // every other action here the spend waits until the degree is known.
  const RAGE_ACTIONS = new Set(["invokeRage", "revokeRage"]);
  const defersApCost = RAGE_ACTIONS.has(action.key);

  // The same gate the cast path takes (3.311.3): refused by default when
  // the pool cannot cover it, with an explicit GM override. Placed with
  // the spend rather than at the top of the function because
  // `effectiveApCost` is what this action actually costs after its own
  // modifiers, and because a rage action defers its cost entirely.
  if (!defersApCost) {
    if (!(await ensureActionPoints(actor, effectiveApCost, action.name, { traits: action.traits }))) return null;
    if (preparedPaysFor) await consumePreparedReaction(actor, action.key);
    else await spendActionCost(actor, effectiveApCost, action.name, { traits: action.traits });
  }

  // BORN TO RIDE'S allowance is spent HERE, at the point of commitment —
  // not where the cost was worked out, several dialogs earlier. Everything
  // between the two can still bow out (a cancelled prompt, too few AP),
  // and a once-per-round rule burnt by an action that never happened is
  // the same defect the Attack of Opportunity refund exists to prevent.
  if (bornToRideSpent) {
    await actor.setFlag(SYSTEM_ID, "bornToRideUsed", true);
  }

  // Recorded at the point of commitment — after the situational dialog,
  // so an action abandoned there has not been "used" for trait purposes.
  await recordTraitUsage(actor, action);

  // WHERE THIS IS BEING DONE (page 201, R1 and R2). The CHECK path's own
  // commitment point: said here, just before the roll, so a High Jump at
  // forty feet carries the page's question with it. Its own card, because
  // this branch's card is assembled inside `TRGCheck.roll` and has no
  // line list to add to.
  {
    const notes = placeNotes(actor, action);
    if (notes.length) await postCard(actor, action.name, notes);
  }
  {
    // A REAL BINDING, for the reason given at the doubleSlice commit
    // point: the AST-walking ratchet counts a declared name, not a
    // member access on a module namespace.
    const { biteOffensiveCurses } = await import("../magic/flat-ladder-workflow.mjs");
    await biteOffensiveCurses(actor, action);
    // AND A SANCTUARY ON THE ACTOR ENDS — see the doubleSlice site above.
    const { endSanctuaryOnHostileAction } = await import("./sanctuary-gate.mjs");
    await endSanctuaryOnHostileAction(actor, action);
  }
  // DEAFENED AND GRABBED (3.621.0) — see `conditionCommitGate`.
  if (!(await conditionCommitGate(actor, action))) return null;
  // Full Defence's single Move allowance is spent here, at commitment —
  // an action abandoned in its own dialog has not used it.
  await noteFullDefenceMove(actor, action);

  if (bashShield) {
    await loseShieldBonusUntilNextTurn(actor);
  }

  // Healers Tools (Chapter 6): "using healer's tools or other
  // appropriate medical equipment" — per Graham directly, spends one
  // use per Medicine check that requires them. Scoped to the four
  // actions this project's own data already marks with that exact
  // requirement, rather than every Medicine check generally.
  //
  // FROM THE KIT THE REQUIREMENT ACCEPTED (3.577.0). This used to spend
  // only from an EQUIPPED kit while the requirement was met by a CARRIED
  // one, so a kit carried and never equipped never ran down (block 17,
  // D4). See `toolToSpend` in tools-requirement.mjs.
  if (TOOL_USE_ACTIONS.includes(action.key)) {
    await spendToolUse(actor, action.key);
  }

  const outcomeContext = {
    /*
     * WHICH TRADE-OFFS WERE BOUGHT (3.582.0). One of them waives a
     * condition the outcome applies — Climb's flat-footed — so it has to
     * reach `applyActionOutcome`, and this object is where that function
     * reads its state from. The first draft put it beside `rawDegree` on
     * the call instead, which `applyActionOutcome` does not destructure:
     * it would have parsed, run, and silently waived nothing.
     */
    chosenTradeoffs: chosenTradeoffKeys,
    invokedSkillKey,
    actorFeatNames,
    earnIncomeTaskLevel,
    createSetup,
    createReroll,
    learnSpellSetup,
    targetActor,
    pushSourceTokenId,
    pushTargetTokenId,
    pushSceneId,
    treatWoundsExtraDC,
    treatWoundsExtraTargets,
    painToleranceExtraDC,
    bashShield,
    repairTarget,
    refocusTarget,
    dispelSetup,
    rechargeSetup,
    gatherHerbsSetup,
    coverTracksCount,
    // ONE ROLL AGAINST SEVERAL (3.669.0): Spirit Roar's own immunity replaces the action's.
    ignoreActionImmunity: Boolean(ignoreActionImmunity),
    // TRAILING COMMA ON PURPOSE: every entry here is mirrored in
    // pendingOutcomeContext and restoreOutcomeContext, and whichever one
    // is last should not have to change shape when the next is added.
    runeTransferSetup,
  };

  // BUILT BEFORE THE ROLL, because the card is written DURING it.
  //
  // The first version assembled this after `TRGCheck.roll` returned and
  // assigned `check.pendingOutcome` there — by which time the chat
  // message, and the flag it carries, had already been created. The card
  // went out with `pendingOutcome: null` and "Set DC" had nothing to
  // resume from. The harness could not see it: it asserted that the
  // workflow sets the field and that check.mjs stores it, and both were
  // true. What was false was that either happened in time.
  //
  // Passed into the roll instead, so the value exists when the flag is
  // written. Whether it is KEPT is decided in check.mjs at that moment,
  // by which time the degree is known — a roll that resolved needs no
  // resume, and storing one would make every action re-runnable.
  const pendingOutcome = pendingOutcomeContext(actor, action, outcomeContext);
  if (lateRarityRaise) pendingOutcome.rarityRaise = { value: lateRarityRaise, name: targetActor.name };

  // AN ATTACK ACTION MEETS THE TARGET'S CONDITIONS AS A STRIKE DOES (3.621.0;
  // Appendix 2, block 39's R7): advantage against a creature that cannot
  // move, Prone's ±4 by distance, flat-footed to a hidden attacker. Trip,
  // Grapple, Shove and Disarm are attacks.
  let actionAttackTerms = null;
  if ((action.checkType === "attack" || action.checkType === "unarmed") && targetActor) {
    const { attackTermsAgainst, distanceBetweenActors } = await import("../conditions/condition-events-workflow.mjs");
    actionAttackTerms = attackTermsAgainst(targetActor, actor, {
      distanceFeet: await distanceBetweenActors(actor, targetActor), melee: true
    });
  }

  // ADVANTAGE ON THE DAY'S FIRST USE (3.669.0; Tianzhi Meditation). See
  // daily-firsts.mjs. Spent once the check is rolled.
  const firstAdvantage = dailyFirstAdvantage(declarationCarriers(actor), action.key, actor.flags?.[SYSTEM_ID]);
  // A FIRST WHOSE DICE ARE NOT READ (3.669.1): no conviction is asked for it.
  const exactFirst = dailyFirstExact(declarationCarriers(actor), action.key, dailyFirstSpent(actor.flags?.[SYSTEM_ID], action.key));
  // …AND DECLARED AT ITS DEGREE (3.669.2): the card no longer shows the
  // unread dice's degree above the outcome's.
  const exactDegree = exactFirst ? dailyFirstExactDegree(declarationCarriers(actor), action.key) : null;

  const check = await TRGCheck.roll({
    pendingOutcome,
    actor,
    ...(presetDice ? { presetDice, presetConvictionDie } : {}),
    ...(presetDice && Array.isArray(presetModifiers) ? { presetModifiers } : {}),
    ...(exactFirst ? { allowConviction: false, declaredDegree: exactDegree } : {}),
    label: config.label,
    subtitle:
      `${apCostLabel(effectiveApCost) ? `${apCostLabel(effectiveApCost)} — ` : ""}` +
      (targetActor
        ? `vs ${targetActor.name}${finalDC !== null ? ` (${resolved.label})` : ""}`
        : resolved.label),
    type: config.type,
    dc: finalDC,
    difficulty: effectiveDifficulty,
    // TRACKLESS STEP (Chapter 5): disadvantage when a named quarry has it.
    // COMBINED through `resolveBias` rather than assigned, so a Track check
    // already carrying Advantage from somewhere comes out Normal instead of
    // having its advantage silently replaced — the same lesson the save
    // family paid for in 3.356.0.
    // AND A DEFENDER'S DISADVANTAGE ROW (3.665.0, Tsuchi), in the SAME
    // reconciliation as the attack's own advantage, so the two cancel to
    // Normal rather than whichever was applied last winning.
    bias: rollBiasWith(tracklessBias(situational?.bias, tracklessQuarry), [
      ...(actionAttackTerms?.advantage ? ["advantage"] : []),
      ...(defenceDisadvantages.length ? ["disadvantage"] : []),
      ...(firstAdvantage ? ["advantage"] : [])
    ]),
    // SECRET (Appendix 3): "the GM rolls the check in secret." Forced
    // rather than defaulted — a Secret check the player can read isn't
    // secret, so an explicit roll-mode choice in the dialog doesn't
    // override it.
    rollMode: secretRollMode(action) ?? situational?.rollMode,
    // NOTHING SPENT ON DICE NOBODY READS (3.669.2, found in review): a day's
    // first declared `exact` takes no conviction Advantage and no Luck, though
    // the dialog offered them.
    convictionAdvantage: !exactFirst && Boolean(situational?.convictionAdvantage),
    useLuck: !exactFirst && Boolean(situational?.useLuck),
    // Scoped racial/feature bonuses: the dialog offered them all if it
    // opened, otherwise the roll applies the automatic ones itself so
    // that a Shift-skipped action still honours (and cannot dodge) them.
    subject: readInvokedSkillKey(invokedSkillKey ?? "").key || action.skills?.[0] || "",
    actionKey: action.key,
    // WHAT KIND OF THING THIS ACTION IS AIMED AT (3.567.0). Chapter 5's
    // Dracoris: "+1 racial bonus to all interactions with creatures of
    // the Wyrm type" — Deception, Diplomacy, Intimidate and Sense Motive
    // made AT a Wyrm. This is the one place the fact is known: the
    // action already resolved `targetActor` to write the subtitle, and
    // without it the rule could only be a tick offered on every social
    // check a Dracoris ever rolled. Blank with nothing targeted, at which
    // point the entry correctly stays out of the dialog entirely.
    targetTypes: creatureTypesOf(targetActor?.system ?? {}),
    targetTraits: creatureTraits(targetActor?.system ?? {}),
    targetUuid: targetActor?.uuid ?? "",
    traits: actionCheckTraits(action, createItemTypeKey),
    // WHAT THIS ACTION'S BANNER MAY SAY (3.508.0). Graham's ruling: "the
    // card banner should only show available results". 103 of the 105
    // actions that roll a check declare a subset of the seven degrees, so
    // the list travels with the check and the banner names the nearest
    // one the action actually has. The DEGREE itself is untouched.
    declaredOutcomes: declaredOutcomeKeys(action),
    conditionalsResolved: Boolean(situational?.conditionalsResolved),
    // SHIFT SKIPS THE QUESTIONS TOO (3.667.3). See dice/offered-conditionals.mjs.
    offerConditionals: !skipDialog(event),
    bonusCheck: Boolean(action.bonusCheck),
    modifiers: [
      ...config.modifiers,
      ...featActionModifiers,
      ...(situational?.modifiers ?? []),
      ...(studyTimeModifier ? [studyTimeModifier] : []),
      ...(identifyTimeModifier ? [identifyTimeModifier] : []),
      // ANOTHER ABILITY FOR THIS ACTION (3.664.0): Considered Mind's
      // Intelligence, Unwavering Purpose's Charisma — for Refocus only.
      ...actionAbilityRows(
        declarationCarriers(actor),
        action.key,
        actor.system?.skills?.[readInvokedSkillKey(invokedSkillKey ?? "").key || action.skills?.[0] || ""]?.ability ?? "",
        actor.system?.attributes ?? {}
      ),
      ...subsistRows,
      ...dispelRows,
      ...auraRows,
      ...sneakRows,
      ...misreadRows,
      ...(actionAttackTerms?.rows ?? []),
      // THE WORD AFTERMATH ON AN ATTACK ACTION (3.622.0; block 39's A12):
      // "all further spell and attack checks made during your turn".
      ...((action.checkType === "attack" || action.checkType === "unarmed") && wordAftermathModifier(actor)
        ? [wordAftermathModifier(actor)] : []),
      ...(actionAttackTerms?.advantage
        ? [{ label: `Advantage — ${actionAttackTerms.advantage}`, value: 0, type: "untyped" }] : []),
      ...(learnSpellSetup ? [learnSpellSetupModifier(learnSpellSetup)].filter(Boolean) : [])
    ]
  });

  // AND THE LADDER CLIMBS (R1). An attack-trait action counts toward the
  // next attack's penalty, whether it hit or missed — the counter the
  // Strike keeps, advanced here for everything else that has the trait.
  if (check && countsTowardMAP(action.traits)) {
    // COMBAT ONLY (3.666.0) — see turn-records.mjs.
    await setAttackCount(actor, attackCountOf(actor) + 1);
  }
  // A DEFENCE THAT LASTED ONE ATTEMPT (3.666.0): Root the Body's raised DC
  // against this Shove or Trip, spent by it. See one-attack.mjs.
  if (check && targetActor) {
    const { consumeOneAttackEffects } = await import("./target-relay-workflow.mjs");
    await consumeOneAttackEffects(targetActor, { kind: "action", actionKey: action.key, attackerUuid: actor?.uuid ?? "" });
  }

  const lines = headerLines(action, effectiveApCost);
  if (check && firstAdvantage) {
    await actor.setFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG, { ...(actor.getFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG) ?? {}), [firstAdvantage.slot]: true });
    lines.push(line(`<em>${firstAdvantage.label}: the first today — rolled with advantage.</em>`));
  }
  // A rider whose Command an Animal suddenly costs nothing should be told
  // why, and told that it was this round's one use.
  if (bornToRideSpent) {
    lines.push(line(
      `<em>${bornToRide.featName}: taken as a <strong>Free Action</strong> — `
      + "this round's one use."
    ));
  }
  for (const held of defenceDCLines) lines.push(line(held));
  if (sizeEaseNote) lines.push(line(sizeEaseNote));
  if (toolNote) lines.push(line(toolNote));
  if (runeTransferSetup) lines.push(line(runeTransferNote(runeTransferSetup)));
  // THE ARITHMETIC, SHOWN. A DC of 96 over "High Jump" is the sort of
  // number a table stops and argues about; "12 feet x 4 = DC 48, doubled
  // to DC 96 without a 10-foot Stride" is the whole argument, printed
  // once, above the roll it produced.
  if (jumpSetup) lines.push(line(jumpNote(jumpSetup)));
  if (ownJump) lines.push(line(`<em>${ownJump.source}: ${ownJump.ap} AP${ownJump.noProvoke ? ", provoking no reactions" : ""}.</em>`));
  // …AND THE MOVE IT MAKES PROVOKES NOTHING: the next token move reads this
  // and clears it, as Improved Reposition's avoidance does.
  if (ownJump?.noProvoke && game.combat?.started) await actor.setFlag(SYSTEM_ID, "jumpReactionsAvoided", true);
  // What the player bought with the raised DC. Printed even though the
  // DC on the card already includes it: "DC 22" does not tell the table
  // that it is 22 because somebody is shouting at four people at once.
  const tradeoffLine = tradeoffNote(tradedDifficulty, { applied: tradedDifficultyApplied });
  if (tradeoffLine) lines.push(line(tradeoffLine));
  // EVERY PIECE OF PRE-ROLL STATE THE OUTCOME READS, gathered in one
  // place (3.423.0). Built here rather than assembled at the call so the
  // same object can be serialised for a resumed card — the two must not
  // drift, because a field present at the roll and absent on resume is a
  // branch that quietly does nothing the second time.
  // THE OUTCOME, which now lives in a function so that a degree settled
  // AFTER the roll can reach it too (3.423.0). See applyActionOutcome.
  await applyActionOutcome({
    actor,
    action,
    rawDegree: check.outcome?.degree?.key ?? null,
    checkMargin: check.outcome?.margin ?? null,
    checkTotal: check.outcome?.total ?? null,
    lines,
    ctx: outcomeContext
  });

  return check;
}

/**
 * EVERYTHING AN ACTION DOES ONCE ITS DEGREE IS KNOWN.
 *
 * EXTRACTED FROM `resolveAction` AT 3.423.0, unchanged. It ran in exactly
 * one place — inline, at the bottom of a 1,400-line function — which meant
 * it could only ever run at the moment of the roll.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THAT WAS A DEFECT AND NOT MERELY A SHAPE.
 *
 * Graham, 27 August 2026, reporting Study Target: "does not allow you to
 * add anything to Studied Targets."
 *
 * An action with no DC resolves to `degree: null`, and everything here is
 * gated on the degree, so nothing happened. The chat card offers a "Set
 * DC" box for exactly that case — but `onSetDC` recomputed the degree and
 * re-rendered the card, and there was no way to reach this code again. On
 * 3.421.0 the card ended up reading "Heroic — exceeds DC by 21" over an
 * empty studied-target list.
 *
 * 3.422.0 fixed the six actions that reached their roll with no DC by
 * giving them one. THIS closes the other half: a degree settled after the
 * fact now applies what it means. A card that states an outcome the
 * system never acted on is the interface version of a check that proves
 * the wrong thing — and it is believed for the same reason.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MOVE WAS MECHANICAL, AND DELIBERATELY SO.
 *
 * The section was straight-line: no early returns, and exactly one
 * pre-existing local mutated (`lines`, pushed to). So it takes `lines` as
 * a parameter and everything else through `ctx`. The only edits to the
 * body itself were three reads of the live `check` object, which became
 * the `rawDegree` and `checkMargin` parameters — because at resume time
 * there is no live check to read, only a card.
 *
 * `ctx` carries live documents (`targetActor`, `repairTarget`,
 * `refocusTarget`, `bashShield`) when called from the roll, and the same
 * documents rebuilt from stored ids when called from a resumed card. See
 * `pendingOutcomeContext` / `restoreOutcomeContext` below.
 *
 * @param {object} options
 * @param {Actor} options.actor
 * @param {object} options.action The action record.
 * @param {string|null} options.rawDegree The degree the dice produced,
 *   BEFORE Shadowborn Agility rewrites it. Null means unresolved.
 * @param {number|null} options.checkMargin Used by Create, and since
 *   3.568.0 by Assess Tracks — whose printed payout is "one additional
 *   detail for every point by which your check exceeds the difficulty",
 *   which is this number and nothing else.
 * @param {string[]} options.lines Card lines so far; pushed to.
 * @param {object} options.ctx Pre-roll state the branches read.
 * @returns {Promise<{lines: string[], degree: string|null}>}
 */
/*
 * NOT EXPORTED. `resumeActionOutcome` below is the only way in from
 * outside this module, and `verify-rules-have-callers` refused the
 * export the moment it existed — an exported rule nobody calls is a
 * well-tested opinion (lesson 5.1). Keeping one door rather than two
 * also means the `applied` guard cannot be walked around.
 */
async function applyActionOutcome({
  actor, action, rawDegree = null, checkMargin = null, checkTotal = null, lines = [], ctx = {}
} = {}) {
  const {
    invokedSkillKey = null,
    actorFeatNames = [],
    earnIncomeTaskLevel = null,
    createSetup = null,
    createReroll = false,
    learnSpellSetup = null,
    targetActor = null,
    pushSourceTokenId = null,
    pushTargetTokenId = null,
    pushSceneId = null,
    treatWoundsExtraDC = 0,
    treatWoundsExtraTargets = 0,
    painToleranceExtraDC = 0,
    bashShield = null,
    repairTarget = null,
    refocusTarget = null,
    runeTransferSetup = null,
    dispelSetup = null,
    rechargeSetup = null,
    gatherHerbsSetup = null,
    coverTracksCount = null,
    ignoreActionImmunity = false
  } = ctx ?? {};
  // Re-derived rather than passed: it is a class reference, not state.
  const { DialogV2 } = foundry.applications.api;
  // THE CREATE PROJECT'S ITEM TYPE, for the ruined-herb line below (F4).
  // Read here, from what this function is handed — the day-one setup, or
  // the project a re-roll continues, which has not been re-checked yet —
  // because `createItemTypeKey` belongs to `resolveAction` and is not in
  // scope here. verify-no-undefined-names found the first version using it.
  const createTypeKey = action?.key === "create"
    ? String((createReroll ? activeCreateProject(actor)?.itemTypeKey : createSetup?.itemTypeKey) ?? "")
    : "";

  // SHADOWBORN AGILITY (3.377.0) rewrites the degree BEFORE anything
  // reads it. Everything downstream — the outcome text, the conditions
  // applied by `basicActionConditionEffects`, the feat gates — takes its
  // answer from this one variable, so upgrading it here means there is
  // exactly one place that knows the degree. Applying the feat separately
  // to the text and to the conditions would be two places deciding one
  // question, and they would disagree the first time either moved.
  const shadowborn = shadowbornAgilityDegree(action.key, rawDegree, actorFeatNames);
  // AND COLLAPSED TO TWO DEGREES WHERE THE ACTION DECLARES IT (3.506.0),
  // in the one place that knows the degree, for the reason the comment
  // above gives: the text and the conditions must not decide it twice.
  // AND RESOLVED TO A DEGREE THE ACTION ACTUALLY HAS (3.510.0). Graham,
  // on Kip Up: "Please follow the rulebook" — it lists Success, Failure
  // and Fumble, so a Heroic is one of those three and not a fourth state
  // for the table to settle. The card and every handler below read this
  // one variable, so they cannot disagree about it.
  //
  // The CHECK's own `outcome.degree` is untouched: the Chaos gate still
  // sees the fumble it fired on.
  // AND A HELPFUL ANIMAL IMPROVES IT BY ONE STEP (3.559.0). Page 83:
  // "If the animal is helpful towards you, increase your degree of
  // success by one step." Applied HERE, before `declaredDegree`, for the
  // reason the comment above gives — one place knows the degree — and
  // before it rather than after so that an improved degree the action
  // does not declare still resolves down to one it does.
  // The attitude is read through the workflow module, as the gate before
  // the roll does — it is the half of this rule that needs Foundry.
  const helpfulSteps = targetActor
    ? attitudeDegreeSteps(
      action.key,
      (await import("../attitude-workflow.mjs")).attitudeOf(targetActor, actor?.uuid ?? "")
    )
    : 0;
  const attitudeImproved = helpfulSteps
    ? (improveDegree(shadowborn.degree, helpfulSteps) ?? shadowborn.degree)
    : shadowborn.degree;
  // THE FIRST TIME EACH DAY (3.664.0; Inner Tempest's Centred Recovery and
  // Tianzhi Discipline) — see daily-firsts.mjs. The day's first use is
  // spent whether or not a declaration changed it.
  const firstCarriers = rawDegree && hasDailyFirst(declarationCarriers(actor), action.key, "degree") ? declarationCarriers(actor) : null;
  const dailyFirst = firstCarriers
    ? dailyFirstDegree(firstCarriers, action.key, attitudeImproved, dailyFirstSpent(actor.flags?.[SYSTEM_ID], action.key))
    : null;
  if (firstCarriers && !dailyFirstSpent(actor.flags?.[SYSTEM_ID], action.key)) {
    await actor.setFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG, { ...(actor.getFlag(SYSTEM_ID, DAILY_FIRSTS_FLAG) ?? {}), [action.key]: true });
  }
  const degree = rawDegree
    ? declaredDegree(declaredOutcomeKeys(action), dailyFirst?.degree ?? attitudeImproved, DEGREES)
    : null;
  const dailyFirstNote = dailyFirst?.exact
    ? `<em>${dailyFirst.labels.join(", ")}: the first ${action.name} today is a <strong>${dailyFirst.degree}</strong> without the need for a roll (the dice above are not read).</em>`
    : dailyFirst && dailyFirst.degree !== dailyFirst.from
      ? `<em>${dailyFirst.labels.join(", ")}: the first ${action.name} today — your ${dailyFirst.from} is treated as a <strong>${dailyFirst.degree}</strong>.</em>`
      : "";
  const shadowbornNote = shadowbornStepNote(shadowborn, action.key);
  let healAmount = null;
  let conditionReduction = null;
  let conditionIncrease = null;
  let aidBonusAmount = null;
  let pushDetail = null;

  // STAMPED ONCE THE ACTION HAS ACTUALLY HAPPENED (3.559.0), and
  // OUTSIDE THE DEGREE BLOCK ENTIRELY — which is where live testing put
  // it. The first version sat inside `if (degree) { if (outcome.matched)
  // { ... } }`, and Demoralise prints outcome text for a Critical and a
  // Success only: a failed Demoralise matched nothing, so the immunity
  // was never stamped. Page 84 says "REGARDLESS OF YOUR RESULT, the
  // target is temporarily immune to your attempts to Demoralize it for
  // 10 minutes", and the other three are unconditional in the same way —
  // Encourage's hour, Rally's hour and Treat Wounds' hour are all
  // consequences of the attempt, not of its success.
  //
  // After the roll and not before, though: an attempt abandoned in a
  // dialog has not used anybody up.
  if (targetActor && rawDegree && ACTION_IMMUNITIES[action.key] && !ignoreActionImmunity) {

    const { withImmunity, prunedImmunities, IMMUNITY_FLAG, describeRemaining } =
      await import("../temporary-immunity.mjs");
    const spec = ACTION_IMMUNITIES[action.key];
    const key = actionImmunityKey(action.key, actor?.uuid ?? "");
    const now = Number(game?.time?.worldTime ?? 0);
    const record = targetActor.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
    // PRUNED ON THE WAY PAST, as the spells do: an expired entry is
    // dead weight, and a record that only ever grows is a flag that
    // eventually has to be cleaned by hand.
    await targetActor.setFlag?.(
      SYSTEM_ID, IMMUNITY_FLAG,
      withImmunity(prunedImmunities(record, now), key, spec.seconds, now)
    );
    lines.push(line(
      `<em>${targetActor.name} is temporarily immune to ${spec.label} `
      + `for ${describeRemaining(spec.seconds)}.</em>`
    ));
  }

  // POWER POINTS (Chapter 4, page 91). Three actions print a PP cost and
  // until 3.565.0 `action-workflow.mjs` never touched `resources.pp` at
  // all — the cost was a sentence on the card and the pool never moved.
  //
  // SPENT AFTER THE ROLL, not before, for the reason the immunity stamp
  // above gives: an attempt abandoned in a dialog has cost nothing. But
  // spent on EVERY degree that rolled, because none of the three makes
  // its cost conditional on succeeding — Dispel's Failure says in as
  // many words "you fail to dispel the effect AND EXPEND THE PP".
  //
  // DISPEL REFUNDS HALF on a Critical and a Partial ("only expend half
  // the PP"). ROUNDED UP, so a 1 PP Dispel still costs 1 — a floor would
  // make the smallest attempt free on the two degrees the book is being
  // generous on, which is not generosity, it is a hole.
  // GATED ON `degree`, NOT `rawDegree`, AND THE DIFFERENCE COST A LIVE
  // TEST (3.565.2). `shadowborn.degree` is the degree the dice produced;
  // `degree` is the one the ACTION DECLARES, after `declaredDegree` has
  // collapsed anything it does not print onto the nearest thing it does.
  //
  // Driving 3.565.1 in Graham's world: a Detect Deception failing by 43
  // is a BLUNDER, and Detect Deception declares no blunder — so the card
  // printed "Fumble" while every one of this release's new handlers,
  // reading the raw value, saw "blunder" and did nothing at all. The
  // card and the sheet disagreed, and the card was the one telling the
  // truth about the rule.
  //
  // This file already warned about it, twenty lines up: "The card and
  // every handler below read this one variable, so they cannot disagree
  // about it." Six new handlers read the other one. `verify-chapter4-
  // skills-91-100` section G now refuses any handler that does.
  if (degree) {
    let ppCost = 0;
    let ppLabel = "";
    if (action.key === "dispel" && dispelSetup) {
      const halved = degree === "critical" || degree === "partial";
      ppCost = halved ? Math.ceil(dispelSetup.pp / 2) : dispelSetup.pp;
      ppLabel = halved ? `Dispel — half of ${dispelSetup.pp}` : "Dispel";
    }
    else if (Number(action.ppCost) > 0) {
      ppCost = Number(action.ppCost);
      ppLabel = action.name;
    }
    if (ppCost > 0) {
      const paid = await applyPowerPointCost(actor, ppCost, ppLabel);
      if (paid.note) lines.push(line(`<em>${paid.note}</em>`));
    }
  }

  // RECHARGE ITEM (Chapter 4, page 91). The PP the item regains, the
  // 24-hour block a Fumble puts on its natural recharging, and the
  // immunity that stops a second attempt before the next Daily
  // Preparation. All three were printed on the card and applied by
  // nothing until 3.565.0.
  if (action.key === "rechargeItem" && rechargeSetup && degree) {
    const item = actor.items?.get?.(rechargeSetup.itemId) ?? null;
    if (item) {
      const consequence = rechargeConsequence(degree);
      const charged = item.flags?.[SYSTEM_ID]?.chargedItem ?? {};
      const max = Math.max(0, Number(charged.maximumPP ?? 0));
      const current = Number(item.system?.uses ?? 0);
      const patch = { _id: item.id };

      if (consequence.pp) {
        const gained = rechargeAmount(
          degree,
          Number(actor.system?.magic?.casterLevelValue ?? 0)
        );
        // CAPPED AT THE ITEM'S OWN MAXIMUM. "Accelerate the natural
        // charging process" is a faster climb to the same ceiling, not
        // a way past it — `rechargeChargedItems` clamps the ordinary
        // daily gain the same way.
        const next = Math.min(max, current + gained);
        patch["system.uses"] = next;
        lines.push(line(
          next > current
            ? `<em>${item.name} regains <strong>${next - current} PP</strong> (${next} of ${max}).</em>`
            : `<em>${item.name} is already at its maximum ${max} PP.</em>`
        ));
      }
      if (consequence.blocksNatural) {
        const until = Number(game?.time?.worldTime ?? 0) + FUMBLE_BLOCK_SECONDS;
        patch[`flags.${SYSTEM_ID}.rechargeBlockedUntil`] = until;
        lines.push(line(
          `<em>${item.name}'s natural recharging is blocked for <strong>24 hours</strong>.</em>`
        ));
      }
      if (consequence.immune) {
        patch[`flags.${SYSTEM_ID}.rechargeImmuneUntilPrep`] = true;
        lines.push(line(
          `<em>${item.name} cannot be recharged again until your next Daily Preparation.</em>`
        ));
      }
      if (Object.keys(patch).length > 1) {
        await actor.updateEmbeddedDocuments("Item", [patch]);
      }
    }
  }

  // DETECT DECEPTION (Chapter 4, page 92). "A -4-circumstance penalty on
  // all future Detect Deception checks against the target UNTIL you
  // achieve a Critical Success against them." A Fumble sets it, a
  // Critical clears it, everything between leaves it alone — see
  // sense-motive.mjs, including why the key cannot contain a dot.
  if (action.key === "detectDeception" && targetActor && degree) {
    const held = actor.getFlag?.(SYSTEM_ID, DETECT_DECEPTION_FLAG) ?? {};
    const next = withMisread(held, targetActor.uuid, degree);
    // WRITTEN AS A PATCH, NOT WITH `setFlag` (3.565.1). Foundry's
    // setFlag MERGES: writing the record back with a key removed leaves
    // the key exactly where it was, so a Critical printed "cleared" on
    // the card while the -4 stayed on the sheet. Found live, the same
    // day it shipped; see misreadFlagPatch and deletion.mjs.
    const patch = misreadFlagPatch(
      held, next, `flags.${SYSTEM_ID}.${DETECT_DECEPTION_FLAG}`, deletionValue()
    );
    if (Object.keys(patch).length) {
      await actor.update(patch);
      lines.push(line(
        degree === "fumble"
          ? `<em>You will take -4 on future Detect Deception checks against ${targetActor.name} until you Critical against them.</em>`
          : `<em>Your -4 against ${targetActor.name} is cleared.</em>`
      ));
    }
  }

  // GATHER HERBS (Chapter 4, page 95). Critical 4 yields, Success 2,
  // Partial 1, Failure nothing — plus one more of each for a day spent
  // on nothing else, and a tenth of a pound per yield.
  //
  // ONE CHECK PER HERB is what the book asks for ("attempt a Survival
  // check against each herb's difficulty"), and each herb has its own
  // difficulty, so the card reports the yield for THIS check and names
  // how many herbs were declared rather than pretending one roll
  // settled all five.
  if (action.key === "gatherHerbs" && gatherHerbsSetup && degree) {
    const yielded = herbYield(degree, gatherHerbsSetup.soleActivity);
    lines.push(line(
      yielded
        ? `<em>Gathers <strong>${yielded} yield${yielded === 1 ? "" : "s"}</strong> of this herb`
          + `${gatherHerbsSetup.soleActivity ? " (including +1 for the full day)" : ""} — `
          + `${herbYieldWeight(yielded).toFixed(1)} lb.</em>`
        : "<em>No yield from this herb.</em>"
    ));
    if (gatherHerbsSetup.herbs > 1) {
      lines.push(line(
        `<em>${gatherHerbsSetup.herbs} herbs declared — roll once against each herb's own difficulty.</em>`
      ));
    }
  }

  // COVER TRACKS (Chapter 4, page 95). The party-size penalty to the
  // Tracking DC others must beat. Reported rather than written to a
  // field: there is no stored Tracking DC in this system, and the number
  // a pursuer rolls against is settled at the moment they Track.
  if (action.key === "coverTracks" && coverTracksCount !== null && degree) {
    const penalty = coverTracksPenalty(coverTracksCount);
    lines.push(line(
      penalty
        ? `<em>${coverTracksCount} sets of tracks — your Tracking DC is <strong>${penalty}</strong> `
          + `(2 per character beyond the first four).</em>`
        : `<em>${coverTracksCount} sets of tracks — no penalty to your Tracking DC (four are free).</em>`
    ));
  }

  // DISABLE A DEVICE / PICK LOCK (Chapter 4, page 96). "The complexity of
  // the device determines the number of successful attempts required" —
  // a Critical earns two, a Success one, and a Heroic three (Chapter 12;
  // 3.619.0).
  //
  // REPORTED, NOT BANKED. A device is not a document in this system:
  // there is nothing to key a running total to, and inventing an
  // identity for a trap the GM has just described would be a worse
  // answer than a clear number on the card. The successes this attempt
  // earned are what the GM needs; the tally is theirs.
  // A PERIL BANKS IT (3.620.0, R17): the successes go on the peril itself,
  // and a fumble or blunder triggers it. "A Heroic counts as three"
  // (Chapter 12) is disableSuccesses' own.
  const { perilForAction: perilOf, perilDisableAttempt } = await import("../peril-workflow.mjs");
  const perilHit = perilOf(action, targetActor, invokedSkillKey ?? action.skills?.[0] ?? null);
  // THE ROLLED DEGREE, NOT THE CARD'S (3.620.0; the 3.619.0 drive's F3).
  // Disable Device prints no Heroic line, so its card falls back to the
  // Critical's — and so did the count: a heroic earned two. The successes
  // are the dice's; the text is the card's.
  const disableDegree = rawDegree ?? degree;
  if (perilHit && !perilHit.refused && degree) {
    lines.push(...await perilDisableAttempt(perilHit.peril, disableDegree, { mode: perilHit.mode }));
  } else if ((action.key === "disableADevice" || action.key === "pickLock") && degree) {
    const earned = disableSuccesses(disableDegree);
    if (earned) {
      lines.push(line(
        `<em>Earns <strong>${earned} success${earned === 1 ? "" : "es"}</strong> toward `
        + `${action.key === "pickLock" ? "opening a complex lock" : "disabling a complex device"}.</em>`
      ));
    }
  }

  if (degree) {
    // Printed BEFORE the outcome, so a card reading "Critical" over a die
    // that plainly did not critical says why in the line above it rather
    // than leaving the player to conclude the system is broken.
    if (shadowbornNote) lines.push(line(shadowbornNote));
    if (dailyFirstNote) lines.push(line(dailyFirstNote));
    // SAID ON THE CARD, for the same reason Shadowborn Agility's note is:
    // a card reading "Critical" over a die that plainly did not critical
    // has to say why in the line above it.
    if (helpfulSteps && attitudeImproved !== shadowborn.degree) {
      lines.push(line(
        `<em>${targetActor.name} is <strong>helpful</strong> toward you — degree improved `
        + `one step (${shadowborn.degree} to ${attitudeImproved}).</em>`
      ));
    }
    // THE FEAT'S VERSION, SAID (3.625.0): the card names the variant it is
    // reading from, so a changed row does not look like a misprint.
    if (action.variantApplied) {
      lines.push(line(`<em>${action.variantApplied}${action.variantNote ? ` — ${action.variantNote}` : ""}.</em>`));
    }
    const outcome = pickOutcome(degree, action.outcomes ?? {});
    if (outcome.matched) {
      // A HERB RUINED ON THE DAY (3.577.2; F4) prints its own line below,
      // in place of Chapter 4's Fumble row and its 1d6-day clock.
      if (!(action.key === "create" && ruinedOnTheDay(createTypeKey, degree))) {
        lines.push(
          line(
            `<strong>${degree.charAt(0).toUpperCase() + degree.slice(1)}:</strong> ${outcome.text}`
          )
        );
      }
      // AN ACTION WHOSE MODULE APPLIES ITS OWN ROWS (3.666.0) declares
      // `outcomesApplied: true`, and the generic readers below leave its
      // text alone: Inner Tempest's Maintain Clarity prints "an additional
      // -1 circumstance penalty to Concentrate and Mental actions until the
      // beginning of your next turn", which its own code lays scoped to those
      // traits and timed to that turn — read here too, it was a second,
      // unscoped copy in the next roll dialog.
      const readsText = !action.outcomesApplied;
      healAmount = readsText ? extractHealAmount(outcome.text) : null;
      // Read off the SAME outcome text the player is reading, so the card
      // can never offer a push the sentence beside it does not describe.
      pushDetail = readsText ? extractPushDistance(outcome.text) : null;
      // Good Healer (Chapter 5): "Whenever you Treat Wounds, you heal an
      // additional amount of hit points equal to your ranks in Medicine."
      // Keyed on the action key, so Battle Medic's 3 AP copy (same key)
      // benefits too.
      if (healAmount && action.key === "treatWounds" &&
        actorFeatNames.some((n) => String(n).trim().toLowerCase() === "good healer")) {
        const medicineRanks = Math.max(0, Number(actor.system?.skills?.medicine?.ranks ?? 0));
        if (medicineRanks > 0) {
          healAmount += medicineRanks;
          lines.push(
            line(`<em>+${medicineRanks} bonus healing from Good Healer (Medicine ranks).</em>`)
          );
        }
      }
      if (healAmount && treatWoundsExtraDC > 0) {
        const bonus = treatWoundsBonusHealing(treatWoundsExtraDC, degree === "critical");
        if (bonus > 0) {
          healAmount += bonus;
          lines.push(
            line(
              `<em>+${bonus} bonus healing from the extra +${treatWoundsExtraDC} DC${degree === "critical" ? " (doubled on this critical)" : ""}.</em>`
            )
          );
        }
      }
      // TUMBLE (page 198; the audit's D15, Graham's R15). "When it comes
      // to moving through an unwilling creature's space, you must make a
      // Tumble (Acrobatics) check." The check existed and changed
      // nothing, because nothing stopped the move in the first place.
      //
      // A PASSED CHECK LEAVES A MARKER the movement hook spends on the
      // next move through a creature — success treats those squares as
      // difficult terrain, a critical as normal movement, and a failure
      // ends the movement, which is what refusing it amounts to here.
      if (action.key === "tumble") {
        const { TUMBLE_FLAG } = await import("./movement-workflow.mjs");
        if (["critical", "heroic", "success"].includes(degree)) {
          await actor.setFlag(SYSTEM_ID, TUMBLE_FLAG, degree === "success" ? "difficult" : "normal");
          lines.push(line(
            "<em>You may now move through an unwilling creature's space — "
            + `its squares count as ${degree === "success" ? "difficult terrain" : "normal movement"}.</em>`));
        } else if (actor.getFlag?.(SYSTEM_ID, TUMBLE_FLAG)) {
          await actor.unsetFlag(SYSTEM_ID, TUMBLE_FLAG);
        }
      }

      // TREAT INJURY (page 194; R7). A success starts the recovery clock
      // on the injuries the check's DC covered; a critical halves what is
      // left. The severity is re-read from the patient here rather than
      // carried in `ctx`, because nothing between the roll and this line
      // can have changed it, and a value that travels is a value that can
      // arrive stale.
      if (action.key === "treatInjury" && targetActor && ["critical", "success"].includes(degree)) {
        const { worstInjurySeverity, applyTreatInjury } = await import("../injury-workflow.mjs");
        const band = worstInjurySeverity(targetActor);
        const treated = band
          ? await applyTreatInjury(targetActor, band.key, { halved: degree === "critical" })
          : [];
        for (const note of treated) lines.push(line(note));
        if (!treated.length) {
          lines.push(line(`<em>${targetActor.name} has no injury to treat.</em>`));
        }
      }

      const conditionConfig = MEDICINE_CONDITION_ACTIONS[action.key];
      if (conditionConfig) {
        conditionReduction = extractConditionReduction(outcome.text, conditionConfig.label);
        // The other direction, read off the SAME sentence the player is
        // reading. Resuscitation's Fumble and Blunder are the only
        // outcomes in the table that worsen a condition, and until
        // 3.549.0 they worsened nothing.
        conditionIncrease = extractConditionIncrease(outcome.text, conditionConfig.label);
      }
      const aidKind = AID_BONUS_ACTIONS[action.key];
      if (aidKind) {
        aidBonusAmount = extractCircumstanceBonus(outcome.text);
      }
      // Durations (3.101.0): the conditions a Skill Action applies used to
      // be permanent. Feint's "flat-footed until the end of your next
      // turn" landed and stayed until somebody remembered to clear it.
      // The expiry machinery already existed for the critical tables; the
      // outcome text says when, so it is read and honoured.
      const durationRounds = extractDurationRounds(outcome.text);
      const expiresRound =
        durationRounds && game.combat?.started
          ? Number(game.combat.round ?? 0) + durationRounds
          : null;
      const applied = basicActionConditionEffects(action.key, degree);
      // ONLY WHEN A CONDITION WAS LAID HERE (3.666.0). The clock above is
      // for the conditions this table applies; an action that lays none
      // (every module action, whose own code keeps its own clocks: Inner
      // Tempest's Steady Heart and Read Intent) was told to "clear it by
      // hand" about nothing, out of combat.
      if (durationRounds && !game.combat?.started && applied.length) {
        lines.push(
          line(
            `<em>Lasts ${durationRounds} round${durationRounds === 1 ? "" : "s"} — no encounter running, so clear it by hand.</em>`
          )
        );
      }

      await applyBasicActionConditionEffects(applied, actor, targetActor, { expiresRound, actionKey: action.key });
      // WHO HOLDS THE GRAB (3.631.0): Constrict, Elemental Grasp and Swallow
      // act on "creatures grabbed … by it", so a Grapple that lands records
      // the grappler on the target. Read only while Grabbed stands.
      // WHO LEFT IT FLAT-FOOTED (3.668.0): a Feint or a Diversion that lands
      // records its maker on the target, as a Grapple records the grappler.
      // Inner Tempest's Unseen Assault needs a target "flat-footed to you as
      // a direct result of your own … Deception" (Graham's B4-3), and the
      // condition alone cannot say whose it is.
      if (["feint", "createADiversion"].includes(action.key) && targetActor?.hasCondition?.("flatFooted") && targetActor.setFlag) {
        await targetActor.setFlag(SYSTEM_ID, "flatFootedFrom", { uuid: actor.uuid, name: actor.name, action: action.key, round: Number(game.combat?.round ?? 0) });
      }
      if (action.key === "grappleAttack" && targetActor?.hasCondition?.("grabbed") && targetActor.setFlag) {
        await targetActor.setFlag(SYSTEM_ID, "grabbedBy", { uuid: actor.uuid, name: actor.name, round: Number(game.combat?.round ?? 0) });
      }

      // BREAKING OUT OF A SPELL'S HOLD (3.609.0). A success frees the actor
      // from everything that named an Escape DC, as it frees them from a
      // grab. See magic/encase.mjs.
      if (action.key === "escape") {
        const { escapableEffects, escapeFrees, escapedLine } = await import("../magic/encase.mjs");
        const escapeHolds = escapableEffects(Array.from(actor.effects ?? []), SYSTEM_ID);
        if (escapeHolds.length && escapeFrees(degree)) {
          const ids = escapeHolds.map((h) => h.id).filter((id) => actor.effects?.get?.(id));
          if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
          lines.push(line(escapedLine(actor.name, escapeHolds)));
        }
      }

      /*
       * FLAT-FOOTED WHILE CLIMBING (3.582.0; D5, R9). Applied whatever the
       * degree — the book ties it to being on the wall, not to the roll —
       * and waived by a climb speed or by the +2 DC the difficulty table
       * already sells for it.
       */
      for (const said of await burrowingBreathLines(actor, action)) lines.push(line(said));

      for (const said of await climbingFlatFootedLines(actor, action, targetActor, ctx)) {
        lines.push(line(said));
      }

      // MOUNTED (3.576.0): the rolled half of Mount / Dismount. See
      // `settleMount` — the no-check path above makes the same call.
      if (action.key === "mountDismount" && degree === "success") {
        lines.push(line(await settleMount(actor, targetActor)));
      }

      // FALLING OUT OF THE SADDLE (3.577.0; block 17, D9). Stay in Saddle's
      // Failure and Guide with Knees' Fumble put the rider on the ground,
      // and a rider on the ground is not mounted.
      {
        const { MOUNTED_FLAG, fallsFromSaddle, mountedState } = await import("./mounted.mjs");
        if (fallsFromSaddle(action.key, degree) && mountedState(actor).mounted) {
          await actor.unsetFlag(SYSTEM_ID, MOUNTED_FLAG);
          lines.push(line(`<strong>${actor.name} falls from the saddle</strong> and is no longer mounted.`));
        }
      }

      // CALMING A PANICKED STEED (page 176; 3.577.0, R8): "You may use
      // Command an Animal ... to calm the creature." Only a steed THIS RULE
      // panicked is calmed this way; its mark is cleared with the fear.
      if (action.key === "commandAnAnimal" && targetActor) {
        const { STEED_PANIC_FLAG, calmsSteed } = await import("./mounted.mjs");
        if (calmsSteed(action.key, degree, Boolean(targetActor.getFlag?.(SYSTEM_ID, STEED_PANIC_FLAG)))) {
          await targetActor.toggleStatusEffect?.("fleeing", { active: false });
          await targetActor.toggleStatusEffect?.("frightened", { active: false });
          await targetActor.unsetFlag(SYSTEM_ID, STEED_PANIC_FLAG);
          lines.push(line(`<strong>${targetActor.name} is calmed</strong> — no longer fleeing or frightened.`));
        }
      }

      // ATTITUDE (3.408.0). Make an Impression, Coerce and Request print
      // a step change on four degrees between them, and until now every
      // one of them was a sentence that changed nothing.
      //
      // READ OFF THE OUTCOME TEXT the player is reading, exactly as the
      // heal, push and condition-reduction extractors above do — so the
      // engine can never move an attitude the sentence beside it does not
      // describe, and a reworded outcome moves the mechanics with it.
      //
      // TOWARD THE ACTOR, because every printed instance says "toward
      // YOU": the attitude belongs to the target and is about the person
      // who impressed or offended them. See module/attitude.mjs.
      if (targetActor && outcome.matched && !action.outcomesApplied) {
        const steps = extractAttitudeShift(outcome.text);
        if (steps !== null) {
          const { shiftAttitudeToward, attitudeLine } =
            await import("../attitude-workflow.mjs");
          const moved = await shiftAttitudeToward(targetActor, actor?.uuid ?? "", steps);
          const said = attitudeLine(targetActor.name, moved);
          // A CLAMPED NO-OP SAYS SO rather than going quiet: "already as
          // hostile as it gets" is information, and silence here would
          // read as the rule not having run.
          lines.push(line(said
            ? `<em>${said}</em>`
            : `<em>${targetActor.name} is already <strong>${moved.to}</strong> toward you — no further ${steps > 0 ? "improvement" : "decline"}.</em>`));
        }
      }

      // THORNBOUND (Creature Codex, Chapter 3): "Trigger a creature grabs
      // or swallows the wearer."
      //
      // Fired off the CONDITION rather than off the action, because the
      // trigger is being grabbed and not being Grappled: anything that
      // comes to apply `grabbed` or `immobilised` to a creature has
      // grabbed it, and a check written against `action.key ===
      // "grappleAttack"` would miss the next thing that does.
      //
      // A CRITICAL GRAPPLE APPLIES `immobilised`, not `grabbed`, and it
      // is the tighter hold of the two — reading only `grabbed` would
      // have left the rune silent on the better grapple.
      //
      // OFFERED ON THE WEARER'S OWN CARD, like Savage Jaw: the Reaction,
      // the damage roll and the saves belong to people, not to this.
      const grabs = applied.some(
        (effect) => effect.target === "target" && effect.active
          && ["grabbed", "immobilised"].includes(effect.conditionKey));
      if (grabs && targetActor) {
        const thorns = thornboundOffer(Array.from(targetActor.items ?? []));
        if (thorns) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: targetActor }),
            content: `<div class="trg-prime trg-check-card"><header class="check-header">`
              + `<div class="check-heading"><span class="check-actor">${targetActor.name}</span>`
              + `<h3>${thorns.item.name} — ${thorns.label}</h3></div></header>`
              + line(`<strong>${actor.name} has hold of you.</strong> Your Reaction is available: the rune lashes out for <strong>${thorns.damage} ${thorns.damageType}</strong> damage.`)
              + line(`<strong>Basic Reflex save</strong> to halve it — the rune prints no DC, so use <em>${thorns.saveDCFrom}</em>.`)
              + (thorns.releases
                ? line(`Then a <strong>DC ${thorns.releaseDC} Fortitude save</strong> or ${actor.name} <strong>releases you immediately</strong>.`)
                : line(`<em>This tier does not force a release — that begins at Thornbound II.</em>`))
          });
        }
      }

      // Press the Advantage (Fighter, 4th): "you successfully Shove,
      // Trip, Disarm, Grapple, or otherwise succeed at a martial combat
      // manoeuvre" — the four named manoeuvres are triggers the system
      // can see, so a Fighter's success prompts the free Step/Interact.
      // The "otherwise" tail and the triggers resolved at the table go
      // through the ability's Use button instead.
      if (PRESS_MANOEUVRE_KEYS.includes(action.key) &&
        PRESS_SUCCESS_DEGREES.includes(degree)) {
        await maybePromptPressTheAdvantage(
          actor,
          `${action.name} succeeded${targetActor ? ` against ${targetActor.name}` : ""}`
        );
      }

      // Circumstance bonuses and penalties (3.101.0): fifteen outcome
      // rows state one and not a single one was applied to anything.
      // Every one is scoped — "to its next saving throw against the
      // disease", "on all future Detect Deception checks against the
      // target" — so it is recorded against whoever it names and offered
      // in that character's next roll dialog rather than pushed blindly
      // into a bonus pool, which would apply it to every roll of that
      // kind against everybody, for ever.
      // NOT A ROW A DEDICATED RULE ALREADY APPLIES (3.666.3): Detect
      // Deception's Fumble and Aid's bonus each had their own rule AND this
      // reader's unscoped copy — Keldran held ten. See dedicated-rows.mjs.
      const modifier = readsGenericModifier(action) ? extractModifier(outcome.text) : null;
      if (modifier) {
        const holder = modifier.subject === "target" ? targetActor : actor;
        if (holder) {
          await addPendingModifier(holder, {
            value: modifier.value,
            type: modifier.type,
            label: action.name,
            scope: modifier.scope,
            oneShot: modifier.oneShot,
            // A row naming its own action waits for that action's checks.
            ...(modifier.subject !== "target" && scopeNamesAction(modifier.scope, action.name) ? { actions: [action.key] } : {})
          });
          lines.push(
            line(
              `<em>${holder.name} has ${modifier.value > 0 ? "+" : ""}${modifier.value} ${modifier.type}${modifier.scope ? " " + modifier.scope : ""} — offered on their next roll.</em>`
            )
          );
        } else if (modifier.subject === "target") {
          lines.push(
            line(
              `<em>${modifier.value > 0 ? "+" : ""}${modifier.value} ${modifier.type} for the target — no token targeted, so apply it by hand.</em>`
            )
          );
        }
      }

      if (action.key === "spatialAwareness") {
        const currentAP = Number(actor.system?.resources?.ap?.value ?? 0);
        const spatialResult = spatialAwarenessOutcome(currentAP, degree);
        if (spatialResult.newAP !== currentAP) {
          await actor.update({ "system.resources.ap.value": spatialResult.newAP });
        }
        if (spatialResult.stunnedValue !== null) {
          await actor.toggleStatusEffect("stunned", { value: spatialResult.stunnedValue });
        }
      }
      if (action.key === "arrestAFall") {
        const fallResult = arrestAFallOutcome(degree);
        lines.push(
          line(
            fallResult.noDamage
              ? "<strong>You fall without taking damage.</strong>"
              : "You fall normally — roll Falling From Height separately to resolve it."
          )
        );
      }
      if (action.key === "catfall") {
        const acrobaticsBonus = Number(actor.system?.skills?.acrobatics?.total ?? 0);
        const catfallResult = catfallOutcome(acrobaticsBonus, degree);
        if (catfallResult.reductionFeet > 0) {
          lines.push(
            line(
              `Reduce the fall by <strong>${catfallResult.reductionFeet} feet</strong> (Acrobatics bonus ${acrobaticsBonus}). If this brings the total distance fallen below 10 feet, you take no damage and land on your feet.`
            )
          );
        } else if (catfallResult.damageMultiplier > 1) {
          lines.push(
            line(
              "<strong>The fall distance is doubled for damage purposes.</strong>"
            )
          );
        } else {
          lines.push(line("You fall normally."));
        }
      }
      if (action.key === "painTolerance" && (degree === "success" || degree === "critical" || degree === "heroic")) {
        const chosenCondition = await promptPainToleranceTarget(actor);
        if (chosenCondition) {
          // THE POINTS THE RAISED DC BOUGHT (3.559.0). "For every 4 that
          // you increase the DC, you may ignore an additional point of
          // the selected condition." `situational.dc` is what the player
          // actually set; the action's own DC is 20, so the difference is
          // what they paid. One point is free either way.
          const ignored = painToleranceIgnoredPoints(painToleranceExtraDC);
          const newValue = await applyPainTolerance(actor, chosenCondition, degree, ignored);
          const label = { dazed: "Dazed", injured: "Injured", weakened: "Weakened" }[chosenCondition];
          const until = degree === "success" ? "the end of your current turn" : "the end of your next turn";
          lines.push(
            line(
              `Ignores ${ignored} point${ignored === 1 ? "" : "s"} of <strong>${label}</strong>`
              + ` (now effectively ${newValue}) until ${until}.`
            )
          );
        }
      }
      // Invoke Rage: the degree names both the AP spent and whether a
      // rage actually started, so both are settled here rather than
      // before the roll.
      if (action.key === "invokeRage") {
        const result = invokeRageResult(degree);
        await spendActionCost(actor, String(result.apCost), action.name);
        lines.push(
          line(
            `Spends <strong>${result.apCost} AP</strong> — this action's cost is its result.`
          )
        );
        if (result.raging) {
          const started = await beginRage(actor, { degree, confused: result.confused });
          lines.push(line(`<strong>${actor.name} is now raging</strong> (1 minute).`));
          if (started.temporaryHP > 0) {
            lines.push(
              line(
                `Gains <strong>${started.temporaryHP} temporary HP</strong> (class bonus x 20).`
              )
            );
          }
          lines.push(
            line(
              "<em>+2 circumstance to Athletics, Fortitude and Will saves, and Strength-based attacks and their damage; -2 circumstance to DB. No Defence-trait actions, no Concentrate actions without the Rage trait, no spellcasting. Immune to Stun.</em>"
            )
          );
          if (started.confused) {
            lines.push(
              line(
                "<strong>Confused</strong> — cannot discern friend from foe, and the rage cannot end until the condition does."
              )
            );
          }
        } else {
          lines.push(line("The rage doesn't take. You may roll again next round."));
        }
      }

      // Extend Rage: a further minute per success, with each attempt
      // stepping the next one's difficulty up — the fourth lands on
      // Impossible, which the check engine already resolves as an
      // automatic failure without any special case here.
      if (action.key === "extendRage") {
        const succeeded = rageExtensionSucceeds(degree);
        const { extensions } = await recordRageExtension(actor, { succeeded });
        if (succeeded) {
          lines.push(
            line("<strong>The rage continues</strong> for a further minute.")
          );
        } else {
          lines.push(
            line("The rage isn't extended — it ends when its current minute runs out.")
          );
        }
        const next = rageExtensionDifficulty(extensions);
        lines.push(
          line(
            next === "impossible"
              ? "<em>This rage cannot be extended again — a further attempt would be Impossible.</em>"
              : `<em>A further extension would be ${DIFFICULTY_BY_KEY[next]?.label ?? next}.</em>`
          )
        );
      }

      // Revoke Rage: likewise variable in cost, and the only action that
      // can end the rage state early.
      if (action.key === "revokeRage") {
        const result = revokeRageResult(degree);
        await spendActionCost(actor, String(result.apCost), action.name);
        lines.push(
          line(
            `Spends <strong>${result.apCost} AP</strong> — this action's cost is its result.`
          )
        );
        if (result.ended) {
          const ended = await endRage(actor, { fatigue: result.fatigue });
          lines.push(line(`<strong>The rage ends.</strong>`));
          if (ended.temporaryHPLost > 0) {
            lines.push(line(`Loses <strong>${ended.temporaryHPLost}</strong> unspent temporary HP.`));
          }
          lines.push(line(`Now <strong>Fatigued ${ended.fatigue}</strong> for 1 hour.`));
        } else if (result.mustRideOut) {
          await markRageRideOut(actor);
          lines.push(
            line(
              `<strong>The rage cannot be mastered</strong> — it must run its full minute, and will leave you Fatigued ${result.fatigue}.`
            )
          );
        } else {
          lines.push(line("The rage holds. You may roll again next round."));
        }
      }

      // Refocus success (Chapter 4): "you regain use of the ability" with the
      // Focus trait. Restore one use of a chosen Focus-trait item — most innate
      // spells carry the Focus trait, so this recovers one mid-day without
      // waiting for Daily Preparation. One item, +1 use, no daily cap (Graham).
      // Timing (immediately on Critical, next turn on Success) stays in the
      // printed outcome text; the mechanical restore happens here.
      if (action.key === "refocus" && refocusTarget) {
        const outcome = await applyRefocusOutcome(refocusTarget, degree, {
          inCombat: Boolean(actor.inCombat)
        });
        // A COMPANION ABILITY RETURNS WITH IT (3.625.0) — Deepened Bond.
        const companionLine = await restoreRefocusCompanion(actor, refocusTarget, degree, { inCombat: Boolean(actor.inCombat) });
        if (companionLine) lines.push(line(companionLine));
        if (outcome.restored) {
          lines.push(
            line(`Restored a use of <strong>${outcome.name}</strong> (${outcome.next} / ${outcome.max}).`)
          );
        } else if (outcome.when === "nextTurn") {
          lines.push(
            line(
              `<strong>${outcome.name}</strong> returns at the <strong>beginning of your next turn</strong>.`
            )
          );
        } else if (outcome.when === "minute") {
          lines.push(
            line(
              `<strong>${outcome.name}</strong> returns in <strong>1 minute</strong>, and cannot be Refocused until then.`
            )
          );
        } else {
          lines.push(
            line(
              `<strong>${outcome.name}</strong> is not restored — ` +
                (degree === "failure"
                  ? "no further Refocus attempt on it for <strong>10 minutes</strong>."
                  : "no further Refocus attempt on it <strong>until your next daily preparation</strong>.")
            )
          );
        }
      }

      if (action.key === "refocus" && degree === "blunder") {
        const level = Number(actor.system?.identity?.level ?? 1);
        const damageRoll = await new Roll(refocusBlunderFormula(level)).evaluate();
        const willDC = levelDC(level);
        const will = actor.system?.combat?.saves?.will;
        const willModifiers = will?.checkModifiers ?? [
          { label: "Will", value: Number(will?.total ?? 0), type: "untyped" }
        ];
        const willCheck = await TRGCheck.roll({
          actor,
          label: "Will Save — Refocus Backlash",
          subject: "will",
          subtitle: `Level-based Will save, DC ${willDC} (own Level DC — a backlash, not an outside attacker)`,
          type: "save",
          dc: willDC,
          modifiers: [...willModifiers]
        });
        const saveDegree = willCheck.outcome?.degree?.key ?? "failure";
        // THE MARGIN, WHICH THIS CALL USED TO OMIT (3.549.0). Refocus's
        // Blunder reads "you take 1d4 mental damage per level (basic
        // Will)", and a basic save is the whole ladder: on a failure the
        // amount a save is MISSED by adds base damage and lands a
        // critical (5-14 Minor +1 base, 15-24 Serious +2, 25+ Deadly +3).
        // `basicSavingThrow(degree)` without the second argument defaults
        // the margin to null, which floors `failedBy` at 0 — so every
        // failure here, however badly rolled, produced flat damage and no
        // critical. The spell path has always passed it; this one caller
        // did not. Found by the pages 6-15 audit, 10 September 2026.
        const margin = willCheck.outcome?.margin ?? null;
        const bs = basicSavingThrow(saveDegree, margin);
        const damageMultiplier = bs.damageMultiplier;
        let rolledTotal = damageRoll.total;
        // The bonus is "+N base", and this action's base die is the d4 of
        // `refocusBlunderFormula` — same reading as the spell path, where
        // the bonus dice match the spell's own die size.
        if (bs.bonusBaseDamage > 0) {
          const bonusRoll = await new Roll(`${bs.bonusBaseDamage}d4`).evaluate();
          rolledTotal += bonusRoll.total;
          lines.push(
            line(
              `Missed the save by <strong>${Math.abs(Math.round(Number(margin ?? 0)))}</strong> — ` +
                `<strong>${bs.criticalSeverity}</strong>: +${bs.bonusBaseDamage} base ` +
                `(<strong>${bonusRoll.total}</strong> more).`
            )
          );
        }
        const finalDamage = Math.floor(rolledTotal * damageMultiplier);
        if (finalDamage > 0) {
          const absorbed = await spendTemporaryHP(actor, finalDamage);
          if (absorbed.absorbed > 0) {
            lines.push(
              line(
                `<strong>${absorbed.absorbed}</strong> absorbed by temporary HP.`
              )
            );
          }
          const hp = actor.system?.resources?.hp;
          if (hp && absorbed.damageRemaining > 0) {
            await actor.update({
              "system.resources.hp.value": Math.max(
                0,
                Number(hp.value ?? 0) - absorbed.damageRemaining
              )
            });
          }
        }
        lines.push(
          line(
            `Your mind backlashes: rolled <strong>${rolledTotal}</strong> mental damage` +
              (damageMultiplier === 0
                ? " — fully avoided by the save"
                : damageMultiplier === 0.5
                  ? `, halved to <strong>${finalDamage}</strong> on a successful save`
                  : `, taking <strong>${finalDamage}</strong>`) +
              "."
          )
        );
        // The critical the ladder reached, landed as a real injury —
        // the same call the spell path makes on a failed basic save.
        // The backlash has no attacker, so the DC it was rolled against
        // stands in as the attack bonus, exactly as the spell path uses
        // its own save DC.
        if (bs.criticalSeverity && finalDamage > 0) {
          await rollCriticalInjury(actor, {
            targetActor: actor,
            damageType: "mental",
            severity: bs.criticalSeverity,
            attackBonus: willDC
          });
        }
      }
      // SURVEY WILDLIFE (Chapter 5): "if you succeed, you may then make a
      // Recall Knowledge check, albeit with a -2-circumstance penalty, to
      // glean further information about the creatures solely from these
      // indicators."
      //
      // EARNED, NOT AUTOMATIC — and a Partial does not earn it. Offered
      // rather than rolled, because "you MAY then make" is the player's
      // call and the skill it uses is theirs to pick.
      if (action.key === "surveyWildlife") {
        const survey = surveyWildlifeOutcome(degree);
        if (survey.recall) {
          lines.push(line(
            `You find the signs. A <strong>Recall Knowledge</strong> check at `
            + `<strong>${survey.penalty}</strong> circumstance may tell you what left them.`
          ));
          const take = await DialogV2.confirm({
            window: { title: "Survey Wildlife", icon: "fa-solid fa-paw" },
            classes: ["trg-prime"],
            content: `<div class="trg-prime trg-check-dialog"><p>Read the signs further with a `
              + `<strong>Recall Knowledge</strong> check at ${survey.penalty} circumstance?</p></div>`,
            yes: { icon: "fa-solid fa-paw", label: "Recall Knowledge" },
            no: { icon: "fa-solid fa-xmark", label: "Leave it", default: true },
            rejectClose: false
          });
          if (take) {
            await addPendingModifier(actor, {
              value: survey.penalty, type: "circumstance", label: "Survey Wildlife",
              scope: "One Recall Knowledge check about the creatures whose signs you read",
              oneShot: true
            });
            lines.push(line(
              `<em>A ${survey.penalty} circumstance penalty is queued for your next Recall Knowledge check.</em>`
            ));
          }
        } else {
          lines.push(line("<em>Nothing here you can read.</em>"));
        }
      }

      if (action.key === "rally" && targetActor) {
        const reduction = rallyReduction(degree);
        if (reduction > 0 && targetActor.hasCondition?.("frightened")) {
          const currentFrightened = targetActor.getConditionValue("frightened") ?? 0;
          // The floor a Korath's Demoralise (or Song Of Despair) holds — 3.561.0.
          const { conditionFloorFor } = await import("../magic/emanation-workflow.mjs");
          const floor = conditionFloorFor(targetActor, "frightened");
          const newFrightened = Math.max(0, Math.max(currentFrightened - reduction, floor));
          if (newFrightened === currentFrightened) {
            lines.push(line(`<em>${targetActor.name}'s Frightened cannot be reduced below ${floor} right now.</em>`));
          }
          if (newFrightened === 0) {
            await targetActor.toggleStatusEffect("frightened", { active: false });
          } else {
            await targetActor.toggleStatusEffect("frightened", { value: newFrightened });
          }
          // THE REDUCTION ACTUALLY APPLIED, not the one rolled (3.561.1): a
          // Critical Rally against a Korath's floor printed "by 2 (now 1)"
          // straight after saying the floor had stopped it. Live, 17 Sep.
          const applied = currentFrightened - newFrightened;
          lines.push(
            line(
              `Reduces ${targetActor.name}'s Frightened by <strong>${applied}</strong>` +
                (applied !== reduction ? ` of ${reduction}` : "") +
                (newFrightened === 0 ? " — no longer Frightened." : ` (now ${newFrightened}).`)
            )
          );
        }
      }
      if (action.key === "repair" && repairTarget) {
        const hp = repairTarget.system.hp;
        if (degree === "fumble" || degree === "blunder") {
          const damageRoll = await new Roll("2d6").evaluate();
          const newValue = applyItemDamage(hp.value, damageRoll.total, 0);
          await repairTarget.update({ "system.hp.value": newValue });
          const status = itemStatus(newValue, hp.max);
          lines.push(
            line(
              `<strong>${repairTarget.name}</strong> takes <strong>${damageRoll.total}</strong> damage from the botched repair (Hardness ignored). Now <strong>${newValue} / ${hp.max}</strong> HP` +
                (status === "destroyed" ? " — <strong>destroyed</strong>." : status === "broken" ? " — Broken." : ".")
            )
          );
        } else {
          const restored = repairHPRestored(Number(actor.system?.skills?.crafting?.ranks ?? 0), degree);
          if (restored > 0) {
            const newValue = Math.min(hp.max, hp.value + restored);
            await repairTarget.update({ "system.hp.value": newValue });
            lines.push(
              line(
                `Restores <strong>${restored}</strong> HP to <strong>${repairTarget.name}</strong> (now ${newValue} / ${hp.max}).`
              )
            );
          }
        }
      }
      if (bashShield) {
        if (degree === "fumble" || degree === "blunder") {
          const fumbleResult = await rollShieldBashFumble(actor, bashShield);
          if (fumbleResult.averted) {
            lines.push(line("The fumble is averted — merely a miss."));
          } else {
            lines.push(
              line(
                `Rolled <strong>${fumbleResult.rollTotal}</strong> on the melee fumble table.`
              ),
              line(`<em>${fumbleResult.row.effect}</em>`)
            );
          }
        } else if (["heroic", "critical", "success"].includes(degree)) {
          const isCritical = degree === "heroic" || degree === "critical";
          const damageResult = await rollShieldBashDamage(
            actor,
            bashShield,
            isCritical ? "minor" : null
          );
          lines.push(
            line(
              `<strong>Damage:</strong> ${damageResult.total} ${damageResult.types.join(" or ")} (${damageResult.formula})`
            )
          );
          // SPIKES: "the versatile (piercing) weapon trait" — the choice is
          // the attacker's, and the card says it is theirs to make.
          if (damageResult.types.length > 1) {
            lines.push(line(`<em>Spikes: choose ${damageResult.types.join(" or ")} damage (Versatile).</em>`));
          }
        }
      }
    } else if (outcome.listed.length) {
      /*
       * WHAT THE CARD SAYS WHEN THE RESOLVED DEGREE HAS NO TEXT (3.545.1).
       *
       * THIS BLOCK CONTRADICTED THE LADDER IT NOW SERVES. Found live on
       * the 3.545.0 test, on the very card the release was written for:
       * a FAILED Treat Wounds printed the banner "Failure" correctly and
       * then, underneath it,
       *
       *   The action lists no failure outcome — the table adjudicates
       *   from the listed results:
       *   Critical: The target regains 20 Hit Points.
       *   Success:  The target regains 10 Hit Points.
       *   Partial:  The target regains 5 Hit Points.
       *   Fumble:   The target takes 10 damage...
       *
       * — three HEALING lines offered on a failed check. The banner had
       * been repaired and the paragraph beneath it still invited the
       * table to pick a success. Graham's ruling says the opposite in as
       * many words: a Failure with no text "simply means that the action
       * fails and nothing happens".
       *
       * ONLY TWO DEGREES CAN REACH HERE, and structurally rather than as
       * a fact about today's data: every fallback chain ends at `success`
       * or `failure`, so a resolved degree with no text is one of those
       * two. Measured across the 101 actions — 83 unmatched failures, 4
       * unmatched successes, nothing else. The generic list is kept for a
       * terminal some later ruling might add, not as live behaviour.
       */
      // Two actions declare outcomes but no success text — Disguise and
      // Conceal an Object. Every action is supposed to have a Success, so
      // those are data gaps; the card states the result plainly rather
      // than reciting failure lines at someone who passed.
      const unmatched = unmatchedOutcomeLine(degree, outcome.listed);
      if (unmatched.line) lines.push(line(`<em>${unmatched.line}</em>`));
      if (unmatched.showList) {
        for (const entry of outcome.listed) {
          lines.push(
            line(
              `<strong>${entry.key.charAt(0).toUpperCase() + entry.key.slice(1)}:</strong> ${entry.text}`
            )
          );
        }
      }
    }
  } else if (action.description) {
    lines.push(line(action.description));
  }

  if (lines.length) {
    const healTarget = targetActor ?? actor;
    // NAMED EXACTLY, NOT BY SPECIES (3.469.0). A heal recorded by actor
    // id alone lands on the sidebar sheet when the patient is an unlinked
    // token: the wound stays, the sheet gains the HP, and the card says
    // the right name throughout. Resuscitation is the worst of it — the
    // dying token stays dying while the base sheet is revived.
    const healHandle = actorHandle(
      healTarget, healTarget === targetActor ? firstTargetToken() : (actor.getActiveTokens?.()?.[0] ?? null));
    const cardOptions = {};
    if (healAmount && healTarget) {
      // TREAT WOUNDS' ADDITIONAL TARGETS (3.559.0). "For every 5 that you
      // increase the DC you may heal an additional target."
      //
      // THE OTHER TARGETS THE PLAYER ALREADY HAD SELECTED, capped at the
      // number they paid for. Nothing new is asked: targeting is how this
      // system says who an action is for, and a healer treating three
      // people has three tokens targeted.
      //
      // THEY GO THROUGH THE SAME BUTTON AND THE SAME RULES. A second
      // heal path would be a second copy of the Dying recovery, the
      // unconscious clear and the GM relay — which is exactly how two
      // versions of one rule start to disagree.
      const alsoHeal = treatWoundsExtraTargets > 0
        ? extraHealTargets(healTarget, treatWoundsExtraTargets)
        : [];
      cardOptions.flags = {
        [SYSTEM_ID]: {
          healCard: {
            kind: "heal",
            targetActorId: healTarget.id,
            handle: healHandle,
            amount: healAmount,
            alsoHeal,
            applied: false
          }
        }
      };
      const alsoNote = alsoHeal.length
        ? ` <span style="opacity:.75">(and ${alsoHeal.map((t) => t.name).join(", ")})</span>`
        : "";
      cardOptions.extraContent = `<p style="margin:6px 0 2px"><button type="button" data-action="applyMedicineEffect">Heal ${healAmount} HP</button>${alsoNote}</p>`;
      // BOUGHT AND UNSPENT IS WORTH SAYING. A player who paid +10 DC for
      // two extra targets and targeted nobody else has paid for nothing,
      // and the card is the only place that can tell them before the
      // healing lands.
      if (treatWoundsExtraTargets > alsoHeal.length) {
        lines.push(line(
          `<em>Paid for ${treatWoundsExtraTargets} additional target`
          + `${treatWoundsExtraTargets === 1 ? "" : "s"} `
          + `(+${treatWoundsTargetDC(treatWoundsExtraTargets)} DC) and had `
          + `${alsoHeal.length || "none"} other${alsoHeal.length === 1 ? "" : "s"} targeted.</em>`
        ));
      }
    } else if (conditionReduction && healTarget) {
      const conditionConfig = MEDICINE_CONDITION_ACTIONS[action.key];
      cardOptions.flags = {
        [SYSTEM_ID]: {
          healCard: {
            kind: "reduceCondition",
            targetActorId: healTarget.id,
            handle: healHandle,
            amount: conditionReduction,
            conditionKey: conditionConfig.conditionKey,
            applied: false
          }
        }
      };
      cardOptions.extraContent = `<p style="margin:6px 0 2px"><button type="button" data-action="applyMedicineEffect">Reduce ${conditionConfig.buttonLabel} by ${conditionReduction}</button></p>`;
    } else if (conditionIncrease && healTarget) {
      // THE BOTCHED REVIVAL (3.549.0). Resuscitation's Fumble and
      // Blunder raise the patient's Dying, and Chapter 1 names a failed
      // stabilisation as one of the four moments a creature's Dying is
      // tested against its Death State. The button applies the increase;
      // the death check that follows is the one the system already runs
      // on any change to Dying, so this does not re-decide it — it
      // supplies the change that was never being made.
      const conditionConfig = MEDICINE_CONDITION_ACTIONS[action.key];
      cardOptions.flags = {
        [SYSTEM_ID]: {
          healCard: {
            kind: "increaseCondition",
            targetActorId: healTarget.id,
            handle: healHandle,
            amount: conditionIncrease,
            conditionKey: conditionConfig.conditionKey,
            applied: false
          }
        }
      };
      cardOptions.extraContent = `<p style="margin:6px 0 2px"><button type="button" data-action="applyMedicineEffect" class="trg-harmful">Increase ${conditionConfig.buttonLabel} by ${conditionIncrease}</button></p>`;
    }
    // FORCED MOVEMENT (3.376.0). Shove's success and critical say the
    // target is pushed, and until now nothing moved. Offered rather than
    // applied, per Graham's ruling of 23 August 2026 and his Attack of
    // Opportunity steer the day before — a push moves somebody else's
    // token, so a person presses the button.
    //
    // APPENDED, not assigned: `extraContent` may already hold the heal
    // block above. No basic action currently both heals and pushes, but
    // an overwrite here would be a silent loss the day one does, and the
    // cost of appending is nothing.
    if (pushDetail && pushTargetTokenId && pushSourceTokenId && pushSceneId) {
      const gridDistance = Number(canvas?.scene?.grid?.distance ?? 5);
      const buttons = pushButtonsHtml(pushDetail, gridDistance, involuntaryMovementPrompts(targetActor));
      if (buttons) {
        cardOptions.flags = foundry.utils.mergeObject(cardOptions.flags ?? {}, {
          [SYSTEM_ID]: {
            forcedMovement: {
              sceneId: pushSceneId,
              sourceTokenId: pushSourceTokenId,
              targetTokenId: pushTargetTokenId,
              offeredFeet: pushDetail.feet,
              upTo: pushDetail.upTo,
              applied: false
            }
          }
        });
        cardOptions.extraContent = `${cardOptions.extraContent ?? ""}${buttons}`;
      }
    }
    // Ambush and Sniping (3.103.0): both say "you may modify the critical
    // result by up to" an amount and, until now, that sentence was the
    // whole of it — the card printed it and the player went back to the
    // injury card to read a different row by hand. The rows the allowance
    // can actually reach are offered here instead.
      if (modifiesCriticalResult(action.key)) {
      const allowance = criticalAdjustAllowance(degree);
      const record = actor.getFlag(SYSTEM_ID, "lastCriticalInjury");
      if (!allowance) {
        lines.push(line("<em>No modification — the reaction achieved nothing.</em>"));
      } else if (!record) {
        lines.push(
          line(
            `<em>May modify a critical result by up to ${allowance}, but no critical injury has been rolled to modify.</em>`
          )
        );
      } else {
        const rows = adjustableRows(record.damageType, record.result, allowance);
        const choices = rows.filter((row) => !row.current);
        if (!choices.length) {
          lines.push(
            line(`<em>An allowance of ${allowance} reaches no other row on this table.</em>`)
          );
        } else {
          cardOptions.flags = {
            ...(cardOptions.flags ?? {}),
            [SYSTEM_ID]: {
              ...(cardOptions.flags?.[SYSTEM_ID] ?? {}),
              criticalAdjust: {
                actorId: actor.id,
                targetActorId: targetActor?.id ?? null,
                record,
                allowance,
                applied: false
              }
            }
          };
          // A row per reachable result. Each button is laid out over two
          // lines \u2014 the shift and new roll (with its d100 band) bold on
          // top, the injury text wrapped beneath \u2014 with an explicit
          // auto height and normal white-space, because Foundry's default
          // fixed button height clipped the text and stacked each row's
          // label over the next one's description (unreadable in the
          // chat sidebar). Confirmed live before shipping.
          const buttons = choices
            .map((row) => {
              const sign = row.shift > 0 ? "+" : "";
              const effect =
                row.effect.slice(0, 130) + (row.effect.length > 130 ? "\u2026" : "");
              return (
                `<button type="button" data-action="adjustCritical" data-roll="${row.roll}" ` +
                `style="display:block;width:100%;height:auto;min-height:0;line-height:1.3;white-space:normal;text-align:left;padding:5px 7px;margin:3px 0;border-radius:3px">` +
                `<span style="display:block;font-weight:bold">${sign}${row.shift} \u2192 ${row.roll} ` +
                `<span style="font-weight:normal;opacity:.65">(d100 ${row.min}\u2013${row.max})</span></span>` +
                `<span style="display:block;font-size:.85em;opacity:.9;margin-top:2px">${effect}</span>` +
                `</button>`
              );
            })
            .join("");
          cardOptions.extraContent =
            `${cardOptions.extraContent ?? ""}<p style="margin:6px 0 2px"><em>Modify the critical result by up to ${allowance} — rolled ${record.result}:</em></p>${buttons}`;
        }
      }
    }

    // Study Target (Chapter 4): commit the studied target on a Success (a
    // flawed one on a Fumble) and show the capacity, with a button to the
    // manager. The subject is the targeted creature, or a name the player
    // types when studying a place or object.
    if (action.key === "studyTarget") {
      if (degree) {
        const study = await applyStudyOutcome(actor, degree, { targetActor });
        study.lines.forEach((studyLine) => lines.push(line(studyLine)));
      } else {
        const status = studiedTargetStatus(actor);
        lines.push(
          line(
            `Set a DC to resolve the study. Studied Targets: <strong>${status.used} / ${status.capacity}</strong>.`
          )
        );
      }
      cardOptions.flags = {
        ...(cardOptions.flags ?? {}),
        [SYSTEM_ID]: {
          ...(cardOptions.flags?.[SYSTEM_ID] ?? {}),
          studyTarget: { actorId: actor.id }
        }
      };
      cardOptions.extraContent =
        `${cardOptions.extraContent ?? ""}<p style="margin:6px 0 2px"><button type="button" data-action="manageStudiedTargets">Manage studied targets</button></p>`;
    }

    // Transfer Runes (Chapter 4): move the rune, crack the runestone, or
    // destroy what the degree says is destroyed. Runs only once a degree
    // exists — with no DC set there is no result to apply, and moving a
    // rune on the strength of an unresolved check would be worse than
    // moving none.
    if (action.key === "transferRunes" && degree && runeTransferSetup) {
      const transfer = await applyRuneTransfer(actor, degree, runeTransferSetup);
      transfer.lines.forEach((transferLine) => lines.push(line(transferLine)));
    }

    // Earn Income: day one starts the task from the rolled degree. A Fumble
    // means fired (no task). Otherwise the per-day income is shown with a
    // button to the manager for working further days or finishing.
    if (action.key === "earnIncome" && degree) {
      const skillKey = invokedSkillKey ?? action.skills?.[0];
      const ranks = skillRanks(actor, skillKey);
      const skillLabel = actor.system?.skills?.[skillKey]?.label ?? skillKey;
      // CANNY SMUGGLER (Chapter 5): "when using Underworld to make Earn
      // Income checks, the level of the work is always treated as 1 higher
      // WITHOUT AFFECTING THE DC." The second half is the whole feat — the
      // task level sets both the DC and the pay, and this raises only the
      // pay. Applied HERE, after the DC has already been set from the
      // level the player chose, which is what makes the two separable.
      const smuggler = cannySmugglerEarnIncome(
        Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name),
        skillKey,
        earnIncomeTaskLevel ?? 0
      );
      if (smuggler.raised) {
        lines.push(line(
          `<em>Canny Smuggler — the work pays as level <strong>${smuggler.payLevel}</strong>,`
          + ` though the check was set at level ${smuggler.dcLevel}.</em>`
        ));
      }
      const task = await startEarnIncomeTask(actor, {
        skillKey,
        skillLabel,
        taskLevel: smuggler.payLevel,
        degreeKey: degree,
        ranks
      });
      if (task.fired) {
        lines.push(line("<em>Fired — you earn nothing and cannot continue this task.</em>"));
      } else {
        const bumped = degree === "critical" || degree === "heroic";
        lines.push(
          line(
            `Day 1: <strong>${task.perDay} gp</strong> (task level ${task.taskLevel} × ${task.ranks} rank${task.ranks === 1 ? "" : "s"}${bumped ? " +2" : ""}). You earn the same each further day until the task ends.`
          )
        );
        cardOptions.flags = {
          ...(cardOptions.flags ?? {}),
          [SYSTEM_ID]: {
            ...(cardOptions.flags?.[SYSTEM_ID] ?? {}),
            earnIncome: { actorId: actor.id }
          }
        };
        cardOptions.extraContent =
          `${cardOptions.extraContent ?? ""}<p style="margin:6px 0 2px"><button type="button" data-action="manageEarnIncome">Work another day / finish</button></p>`;
      }
    }

    // ASSESS TRACKS (Chapter 5, page 115): the base Speed always, plus one
    // further detail per point of MARGIN — the same number Create reads,
    // used for a different rule. WHICH details is the GM's, per Graham's
    // ruling of 18 September 2026; the card says how many and repeats the
    // printed list so the person choosing does not have to find the page.
    if (action.key === "assessTracks" && degree) {
      // DEGREE_BY_KEY, NOT DEGREES. `DEGREES` is an ARRAY; indexing it with
      // the degree KEY yields undefined, which is falsy, which sent every
      // success down the failure branch — caught in live testing, not by
      // the harness, because the harness proved both notes exist and never
      // asked which one runs.
      const succeeded = Boolean(DEGREE_BY_KEY[degree]?.success);
      lines.push(line(
        succeeded
          ? assessTracksNote(Number(checkMargin ?? 0), targetActor?.name ?? "")
          : assessTracksFailureNote()
      ));
    }

    // QUESTIONABLE SOURCE (Chapter 5, page 133): "you ALWAYS gain a piece
    // of information about the target of your check that is true" — on a
    // Fumble as well, per Graham's ruling of 18 September 2026. The note
    // decides for itself which degrees it speaks on; this site only asks.
    if (action.key === QUESTIONABLE_SOURCE_ACTION && degree && hasQuestionableSource(actor)) {
      const note = questionableSourceNote(degree);
      if (note) lines.push(line(note));
    }

    // Create: the day-one (or re-roll) check resolves into the project. The
    // margin (how far the total beat the DC) drives the Success rate.
    if (action.key === "create" && degree) {
      const skillKey = invokedSkillKey ?? action.skills?.[0];
      const ranks = skillRanks(actor, skillKey);
      const margin = Number(checkMargin ?? 0);
      const project = createReroll
        ? await recheckCreateProject(actor, { ranks, degreeKey: degree, margin })
        : await startCreateProject(actor, { setup: createSetup, skillKey, ranks, degreeKey: degree, margin });
      if (project) {
        if (project.status === "complete") {
          lines.push(line(`<strong>${project.itemName} is finished</strong> — ${project.progress} gp of work meets its ${project.itemValue} gp Price.`));
        } else if (project.status === "failed" && project.ruined) {
          lines.push(line(`<strong>${degree.charAt(0).toUpperCase() + degree.slice(1)}:</strong> `
            + `failed by 10 or more — <strong>${project.itemName} is ruined</strong>, and its raw materials with it.`));
        } else if (project.status === "doomed") {
          lines.push(line(`<em>Fumble — the work is shoddy. In ${project.doomedDaysRemaining} more day(s) you'll realise it has failed and ruined the materials.</em>`));
        } else if (project.outcome === "failure") {
          lines.push(line(`<em>A wasted day — no progress. Make another Create check tomorrow.</em>`));
        } else {
          lines.push(line(`<strong>${project.perDay} gp/day</strong> (${project.outcome}) — progress ${project.progress} / ${project.itemValue} gp toward ${project.itemName}.`));
        }
        cardOptions.flags = {
          ...(cardOptions.flags ?? {}),
          [SYSTEM_ID]: {
            ...(cardOptions.flags?.[SYSTEM_ID] ?? {}),
            createProject: { actorId: actor.id }
          }
        };
        cardOptions.extraContent =
          `${cardOptions.extraContent ?? ""}<p style="margin:6px 0 2px"><button type="button" data-action="manageCreateProject">Open crafting project</button></p>`;
      }
    }

    // Learn a Spell: a single check, unlike Create/Earn Income's ongoing
    // projects — the degree resolves immediately into learned-or-not,
    // and on a Critical or Success the spell is embedded straight into
    // the Spell Library (applyLearnSpellOutcome), flagged so it never
    // eats into the free per-level ladder's own tally.
    if (action.key === "learnSpell" && degree && learnSpellSetup) {
      const result = await applyLearnSpellOutcome(actor, learnSpellSetup, degree);
      const gpLabel = `${result.cost.gp} gp`;
      // THE AMOUNT ACTUALLY TAKEN, not the full price. On a critical only
      // half the materials are consumed, and this line used to print the
      // whole figure beside the word "half" — which was harmless while
      // nothing was deducted, and would be a plain contradiction now that
      // the purse really is charged.
      const paidLabel = `${result.paid?.gp ?? 0} gp`;
      if (result.learned) {
        const spentText =
          result.materialsConsumed === "half"
            ? `half the materials spent — ${paidLabel} of ${gpLabel}`
            : result.materialsConsumed === "none"
              ? `the materials (${gpLabel}) survive untouched`
              : `the materials (${paidLabel}) spent`;
        const shortText = result.paid?.shortfallGP
          ? ` <em>(short by ${result.paid.shortfallGP} gp — nothing deducted, settle it with your GM)</em>`
          : "";
        lines.push(
          line(`<strong>${result.spellName}</strong> learned and added to your Spell Library — ${spentText}.${shortText}`)
        );
      } else {
        const materialsText =
          result.materialsConsumed === "full"
            ? `the materials (${gpLabel}) are expended`
            : `the materials (${gpLabel}) aren't expended — try again`;
        const retryText = result.retryModifier ? ` with a +${result.retryModifier} modifier` : "";
        lines.push(
          line(`<em>${result.spellName} not learned — ${materialsText}${retryText}.</em>`)
        );
      }
    }

    if (aidBonusAmount && targetActor) {
      const targetTokenId = game.user.targets?.first?.()?.id ?? null;
      const ally = await promptAllySelection(actor, targetTokenId);
      if (ally) {
        const kind = AID_BONUS_ACTIONS[action.key];
        await applyAidBonus(actor, ally, kind, aidBonusAmount, targetActor.name, targetActor.id);
        lines.push(
          line(
            `<em>${ally.name} gains +${aidBonusAmount} circumstance to ${kind === "defensive" ? "Defence" : "their next attack"}, only ${kind === "defensive" ? `against ${targetActor.name}'s next attack` : `against ${targetActor.name}`}. Remove from ${ally.name}'s effects once used.</em>`
          )
        );
      } else {
        lines.push(line("<em>No ally selected — bonus not granted.</em>"));
      }
    }
    await postCard(actor, `${action.name} — Outcome`, lines, { ...cardOptions, secret: Boolean(secretRollMode(action)) });
  }
  // FOR A MODULE THAT ANSWERS AN ACTION (3.629.0): Pillars of Faith's
  // Interpret Haunt whispers the haunt's Trigger to the GM on a Success.
  // Called after the card, with the rolled degree.
  // AND THE TOTAL (3.630.0): Conceal Faith's "the result becomes the DC".
  Hooks.callAll("trgPrimeActionResolved", { actor, action, degree: rawDegree ?? degree, targetActor, invokedSkillKey, total: checkTotal });
  return { lines, degree };
}

/**
 * The pre-roll state a resumed card needs, as plain data.
 *
 * NEW at 3.423.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IDS, NOT DOCUMENTS. A chat-message flag is stored data: an Actor or an
 * Item put into one arrives back as a lifeless copy of its own fields,
 * with no `update`, no `toggleStatusEffect` and no identity. Four of the
 * context's entries are live documents, so what is stored is their ids
 * and what comes back is the document those ids name TODAY.
 *
 * That is not merely a serialisation detail, it is the more correct
 * reading: a rune moved, a shield unequipped or an item repaired between
 * the roll and the GM's DC should be resolved against the sheet as it is
 * when the outcome lands, not as a photograph taken beforehand.
 *
 * WHAT IS DELIBERATELY NOT STORED: `actorFeatNames`, which is recomputed
 * from the actor on the way back in. It is derived state, and a stored
 * copy would be one more thing able to disagree with the sheet.
 */
function pendingOutcomeContext(actor, action, ctx) {
  return {
    actorId: actor?.id ?? null,
    actionKey: action?.key ?? null,
    invokedSkillKey: ctx.invokedSkillKey ?? null,
    earnIncomeTaskLevel: ctx.earnIncomeTaskLevel ?? null,
    createSetup: ctx.createSetup ?? null,
    createReroll: Boolean(ctx.createReroll),
    learnSpellSetup: ctx.learnSpellSetup ?? null,
    runeTransferSetup: ctx.runeTransferSetup ?? null,
    // PLAIN DATA, so both travel whole. `dispelSetup` is three numbers
    // the caster declared and `rechargeSetup` names an item by id — and
    // a Dispel resumed after the GM sets the DC must still spend the PP
    // that was declared before it, not re-ask for it.
    dispelSetup: ctx.dispelSetup ?? null,
    rechargeSetup: ctx.rechargeSetup ?? null,
    gatherHerbsSetup: ctx.gatherHerbsSetup ?? null,
    coverTracksCount: ctx.coverTracksCount ?? null,
    ignoreActionImmunity: Boolean(ctx.ignoreActionImmunity),
    treatWoundsExtraDC: Number(ctx.treatWoundsExtraDC ?? 0),
    treatWoundsExtraTargets: Number(ctx.treatWoundsExtraTargets ?? 0),
    painToleranceExtraDC: Number(ctx.painToleranceExtraDC ?? 0),
    pushSourceTokenId: ctx.pushSourceTokenId ?? null,
    pushTargetTokenId: ctx.pushTargetTokenId ?? null,
    pushSceneId: ctx.pushSceneId ?? null,
    // THE CREATURES BY HANDLE (3.622.2; the 3.622.1 drive's F2, Graham's
    // R2). An id alone names an unlinked token's WORLD actor, so a resumed
    // outcome — a Study Target, a learnt spell — landed on the sidebar
    // actor, not the token that rolled. The check card has resolved its
    // actor by token since 3.612.1; the resume now does the same. The ids
    // stay, for a card from before this release.
    actorHandle: actor ? actorHandle(actor, actor.token ?? null) : null,
    targetHandle: ctx.targetActor ? actorHandle(ctx.targetActor, ctx.targetActor.token ?? null) : null,
    // The live ones, by id.
    targetActorId: ctx.targetActor?.id ?? null,
    bashShieldId: ctx.bashShield?.id ?? null,
    repairTargetId: ctx.repairTarget?.id ?? null,
    refocusTargetId: ctx.refocusTarget?.id ?? null
  };
}

/**
 * Rebuild a live context from what `pendingOutcomeContext` stored.
 *
 * An id that no longer names anything comes back as null, which is the
 * same thing the branches already handle — every one of them is written
 * `if (action.key === "repair" && repairTarget)`. Deleting the item you
 * were repairing before the GM sets the DC therefore skips the repair
 * rather than throwing, and the card says nothing happened.
 *
 * @returns {{actor: Actor|null, action: object|null, ctx: object}}
 */
async function restoreOutcomeContext(stored) {
  const actor = (stored?.actorHandle ? await resolveActorHandle(stored.actorHandle) : null)
    ?? (stored?.actorId ? game.actors.get(stored.actorId) : null);
  const restoredTarget = (stored?.targetHandle ? await resolveActorHandle(stored.targetHandle) : null)
    ?? (stored?.targetActorId ? game.actors.get(stored.targetActorId) ?? null : null);
  // BOTH TABLES, because a resumed card does not know which it came from
  // and the two share one key namespace. A key in neither returns null,
  // and `resumeActionOutcome` then does nothing rather than guessing.
  const action = stored?.actionKey
    ? [...BASIC_ACTIONS, ...SKILL_ACTIONS].find((a) => a.key === stored.actionKey) ?? null
    : null;
  const item = (id) => (id && actor ? actor.items.get(id) ?? null : null);
  return {
    actor,
    action,
    ctx: {
      invokedSkillKey: stored?.invokedSkillKey ?? null,
      // RECOMPUTED, not restored — see pendingOutcomeContext.
      actorFeatNames: Array.from(actor?.items ?? [])
        .filter((i) => i.type === "feat")
        .map((i) => i.name),
      earnIncomeTaskLevel: stored?.earnIncomeTaskLevel ?? null,
      createSetup: stored?.createSetup ?? null,
      createReroll: Boolean(stored?.createReroll),
      learnSpellSetup: stored?.learnSpellSetup ?? null,
      runeTransferSetup: stored?.runeTransferSetup ?? null,
      dispelSetup: stored?.dispelSetup ?? null,
      rechargeSetup: stored?.rechargeSetup ?? null,
      gatherHerbsSetup: stored?.gatherHerbsSetup ?? null,
      coverTracksCount: stored?.coverTracksCount ?? null,
      ignoreActionImmunity: Boolean(stored?.ignoreActionImmunity),
      treatWoundsExtraDC: Number(stored?.treatWoundsExtraDC ?? 0),
      treatWoundsExtraTargets: Number(stored?.treatWoundsExtraTargets ?? 0),
      painToleranceExtraDC: Number(stored?.painToleranceExtraDC ?? 0),
      pushSourceTokenId: stored?.pushSourceTokenId ?? null,
      pushTargetTokenId: stored?.pushTargetTokenId ?? null,
      pushSceneId: stored?.pushSceneId ?? null,
      targetActor: restoredTarget,
      bashShield: item(stored?.bashShieldId),
      repairTarget: item(stored?.repairTargetId),
      refocusTarget: item(stored?.refocusTargetId)
    }
  };
}

/**
 * Run a card's held-over outcome, once a DC has finally been set.
 *
 * Called by `onSetDC` in dice/check-card-interactions.mjs.
 *
 * ONCE. The caller stamps the flag consumed before this returns, but the
 * guard is here as well: setting a DC twice on the same card must not
 * hand out two studied targets, two crafting projects or two repairs.
 *
 * @param {object} stored The `pendingOutcome` flag.
 * @param {string|null} rawDegree The degree the new DC produces.
 * @param {number|null} margin
 * @returns {Promise<boolean>} whether an outcome was actually applied.
 */
export async function resumeActionOutcome(stored, rawDegree, margin = null) {
  if (!stored || stored.applied) return false;
  if (!rawDegree) return false;
  const { actor, action, ctx } = await restoreOutcomeContext(stored);
  if (!actor || !action) return false;
  await applyActionOutcome({
    actor, action, rawDegree, checkMargin: margin, lines: [], ctx
  });
  return true;
}
