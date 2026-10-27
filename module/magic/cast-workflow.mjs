import { attackCountOf, setAttackCount } from "../combat/turn-records.mjs";
import { spellOwnBonus } from "./spell-own-bonus.mjs";
import { TRGCheck } from "../dice/check.mjs";
import { innateAttackFor, innateSaveFor } from "./innate-printed.mjs";
import { highMagicFumble, highMagicHeightens, highMagicSaveStep } from "./high-magic.mjs";
import { HARMONIZE_FLAG, harmonyTotal } from "../harmonize.mjs";
import { classTradition, grantedTraditions, spellcraftAbilityFor } from "./caster-tier-feats.mjs";
import { CHAIN_PROFILES, OPEN_ENDED, rollChain, percentileValue } from "../dice/open-ended.mjs";
import { attackOutcome, lookupTableRow, mapPenalty, spellCountsTowardMAP } from "../combat/attack.mjs";
import { promptTargetSelection } from "../combat/targeting.mjs";
import { spellDefersItsSave } from "./sanctuary.mjs";
import { normaliseTurnSave, spellSavesOnTurnStart, turnSaveRecord } from "./turn-save.mjs";
import { targetPromptText } from "../combat/target-prompt.mjs";
import {
  ensureActionPoints, spendActionCost, refundActionCost, actorInCombat
} from "../combat/action-points-workflow.mjs";
import {
  castTimeAP, castTimeApCost, castTimeIsCombatLegal, castTimeLabel,
  castTimeWithExtraActions,
  offersCastTimeWarp, tooLongForCombatLine, totalCastTime, warpedCastTime
} from "./cast-time.mjs";
import {
  effectiveRangeText, outOfRangeLine, rangeLabel, targetsOutOfRange, touchAttackOutcome,
  touchAttackRequired, touchReach, warpedRange
} from "./spell-range.mjs";
import { activeToken, distanceBetween } from "../combat/geometry.mjs";
import { applyDamageAndCheckDying, enterDyingAt } from "../combat/dying-workflow.mjs";
import { rollCriticalInjury } from "../combat/attack-workflow.mjs";
import { resolveAgainstDefences } from "../combat/damage-workflow.mjs";
import { drainBracers } from "../bracers-workflow.mjs";
import { innateCastLevel } from "../item-innate-level.mjs";
import { innateAbilityKey, innateLevelRefusal, innatePPAllowanceOf } from "../focus-declarations.mjs";
import { spellDamageSource, spellSourceTraits } from "./spell-source.mjs";
import { divineDamageMark } from "../regeneration-rules.mjs";
import { damageScope, damageScopeLine, inDamageScope } from "./damage-scope.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { creatureTypesOf } from "../aligned.mjs";
import { basicSavingThrow } from "../dice/resolution.mjs";
import {
  addDice, applyCasterLevelMods, casterLevelOf, describeCasterLevelMods, warpedRowExtra
} from "./caster-level-mods.mjs";
import { describeArea, keepByDisposition, lineOfEffectBlocked, parseRangeFeet, parseSpellArea, placeSpellTemplate, spellBreaches, tokensInTemplate } from "./spell-template.mjs";
import { declaredSaveNetFeet, saveNetLine } from "./save-net.mjs";
import { ladderRungAmount, ladderUsesSharedRoll, normaliseSaveLadder, saveLadderLine, saveLadderOutcome } from "./save-ladder.mjs";
import { valueFromMargin } from "./condition-timing-rules.mjs";
import {
  normaliseSecondaryDamage, secondaryDamageLine, secondaryReaches
} from "./secondary-damage.mjs";
// DEATH IS ONE QUESTION WITH ONE ANSWER — a slaying rung uses the same
// spelling a Death critical does. See the ladder branch below.
import { actorDeathState, reapDead } from "../combat/death-state.mjs";
// ONE SPELLING OF THE RECURRING-STACK RULE (3.585.0). The bombs own it;
// a spell's rider asks the same question and must get the same answer.
import { recurringAfterHit } from "../bombs.mjs";
import { feetFromPointToToken } from "../combat/geometry.mjs";
import { warpedAreaText, warpedAreaTargeting } from "./warp-area.mjs";
import { opposedAuraLine, opposingTraitsOf } from "./opposed-aura.mjs";
import { warpedEmanationEffects } from "./spell-warp.mjs";
import { applySpellEffects, parseSpellDuration } from "./spell-effects.mjs";
import { narrationLines } from "./spell-narration.mjs";
import {
  endActiveSpell, getActiveSpells, isDismissibleDuration, ppLockCondition,
  registerActiveSpell, setActiveSpells, warpedDurationText, castWillRegister, sustainAfterWarp
} from "./active-spells.mjs";
import { declaresSingleCasting, singleCastingLine, supersededEntries } from "./single-casting.mjs";
import { endsStamp } from "./spell-ends.mjs";
import { castEndsHiding } from "./hide-from-animals.mjs";
import {
  normaliseDifficultTerrain, terrainAuraShape, terrainRegionName,
  terrainPlacedLine, terrainRemainderLine
} from "./difficult-terrain.mjs";
import {
  normaliseApScale, apScaleChoices, apScaleMods, apScaleLine, baseAPOf, castAPIsScalable
} from "./ap-scale.mjs";
import {
  releaseActionCost, storedSettlement, storedLine, displacedLine, noBondLine, settlementLine
} from "./spell-storing.mjs";
import { targetCapFor, targetCapNote, overTargetRefusal } from "./target-count.mjs";
import { luminanceOpeningState } from "./luminance-workflow.mjs";
import {
  emanationFloors, emanationIsLive, emanationSave, liveEmanationEffects, membershipFrozen
} from "./emanation.mjs";
import { recordEmanation } from "./emanation-workflow.mjs";
import { emanationExpiry, spellGrowth } from "./emanation-growth.mjs";
import { normaliseWall, wallAreaConfig } from "./wall-spell.mjs";
import { componentGate } from "./component-gate.mjs";
import { isRunemage, symbolComponents, symbolRoomLine, componentWords } from "./runemage.mjs";
import { weaponRiderGate } from "./strike-riders-workflow.mjs";
import { intensifyThorns } from "./thorns-workflow.mjs";
import { warpManipulationOffer, warpManipulationSpend } from "../combat/grant-feats.mjs";
import { accurateSpellWaivesMelee } from "../combat/passive-feats.mjs";
import { archetypeSpellcraftAbility } from "./archetype-casting.mjs";
import { spellCastBlocked } from "./spell-availability.mjs";
import { spontaneousScholarAllows } from "./casting-feats.mjs";
import { featSlotSpellcraftAbility } from "./feat-casting.mjs";
import {
  aggregateWarpSelection, applyFreeWarp, applyWarpDiscount, buildWarpChooser, emptyWarp,
  mergeWarpSelections,
  innateWarpBudget, innateWarpFits, innateCantripOf
} from "./spell-warp.mjs";
import { conjuredCreatureLevel, conjuredCreatureNote } from "./conjured-creature.mjs";
import { applyPowerPointCost } from "../power-points-workflow.mjs";
import {
  SPELL_ADDER_USED_FLAG, spellAdderApplies, spellAdderRemaining,
  spellAdderSources, withWondrousAdders
} from "./spell-adder.mjs";
import { wondrousBonusesForActor } from "../wondrous-effects.mjs";
import { traitPickCount } from "./form-traits.mjs";
import { applyKindGate, areaWidenedText, filterAreaByKind, isAreaSpell, kindSkippedText } from "./kind-gate.mjs";
import { areaIsChosen, applyAreaChoice, areaChoiceLine, areaChoseNobodyLine } from "./area-choice.mjs";
import { shouldClearAreaRegion, refundedPool, castRefundedLine } from "./area-region-life.mjs";
import { castResultHeadline } from "./cast-result-line.mjs";
import { normaliseSplash, splashTotal, splashFormulaNote, splashNeighboursLine, splashImmuneLine } from "./splash.mjs";
import { splashOnHit } from "../trait-rules.mjs";
import {
  armourBypassCategories, critSplashAmount, critSplashCatches, critSplashLine, immuneAlternateLine,
  isMetalTarget, metalAttackRow, metalRecurring, normaliseConditionDamage, normaliseCritSplash,
  normaliseImmuneAlternate, normaliseMetalAffinity, wearsMetalArmour
} from "./attack-riders.mjs";
import { actorDefences, hasCreatureTrait } from "../creature-traits.mjs";
import { spellIsManeuver } from "./spell-maneuver.mjs";
import { criticalBonusDamage, spellInflictsCriticalInjury } from "./spell-damage.mjs";
import { effectiveSpellTradition, traditionGate } from "./tradition-gate.mjs";
import { beneficialTraditionSave } from "./beneficial-save.mjs";
import { aggregateMetamagicSelection, buildMetamagicChooser, buildMetamagicOptions, emptyMetamagic, temporalDurationText } from "./metamagic.mjs";
import { grantedSpellWarps, warpsWithGranted } from "./granted-warps.mjs";
import { SPELL_RIDERS_USED_FLAG, declaredSpellDamageRiders, spellDamageRidersFor, spellRidersBurnUpdate, spellRiderLine } from "./caster-damage-riders.mjs";
import { registeredSpellWarps } from "../module-api.mjs";
import { consumeGearUse } from "../gear-uses-workflow.mjs";
import { innateSpendUpdate, itemUsesMax, itemUsesRemaining } from "../uses-workflow.mjs";
import { clearAimIfOtherAction } from "../combat/aim.mjs";
import { isRaging } from "../combat/rage-workflow.mjs";
import { recordTraitUsage, traitGate, wordAftermathModifier } from "../traits-workflow.mjs";
import { secretRollMode } from "../traits.mjs";
import { applyConditionTags, applySelfDamage, formatAppliedTags } from "../combat/effect-application-workflow.mjs";
import { extractConditionTags, extractSelfDamage, extractTextDuration } from "../effect-parser.mjs";
import { isProficientWith, proficiencyProfile } from "../proficiency-rules.mjs";
import { bardicPerformanceItem, bardicPerformSpellcraftModifiers, hasCompositionTrait } from "../bard.mjs";
import { intenseSpellsBonus, schoolsOf, wizardSchoolCastingDCDelta, wizardSchoolSaveDCDelta, wizardSchoolTraitMatches } from "../wizard.mjs";
import { LAST_CAST_FLAG } from "./life-siphon.mjs";
import {
  healingChannelApplies, healingChannelFormula, isRangedCure
} from "./healing-channel.mjs";
import {
  offeredTypes, chosenType, typeChosenLine, typeRefusal
} from "./damage-type-choice.mjs";
import { promptTypeChoice } from "./damage-type-choice-workflow.mjs";
import { elementSourceLine } from "./element-sources.mjs";
import { normaliseRune } from "./inscribed-rune.mjs";
import { promptRuneDesignation, promptRuneTrait } from "./inscribed-rune-prompts.mjs";
import { reagentEffectText, reagentMods, reagentOffers } from "../reagents.mjs";
import {
  normaliseNexus, nexusSave, nexusLadderLine, nexusIsCastable, nexusUnsupportedLine
} from "./elemental-nexus.mjs";
import {
  CANTRIP_PENALISED_DC,
  SPECIALIST_DIFFICULTY,
  activePPRecovery,
  armourCastingPenalty,
  capRitualDegree,
  castingDC,
  castingOutcome,
  harderSaveStep,
  extraCastingTimeBonus,
  extraCastingTimeIncrement,
  focusCheckModifier,
  focusFumblePenalty,
  concentrationDifficulty,
  concentrationOutcome,
  magicRitualOvercastLimit,
  magicRitualSecondaryModifier,
  maxPPPerCast,
  overcastDCIncrease,
  resonanceModifierTotal,
  restingPPRecovery,
  spellFumbleModifierTotal,
  spellNeedsTarget,
  ritualDCModifierTotal,
  sacrificeSoulDrain,
  sleepingPPRecovery,
  specialistAttackUplift,
  specialistMaxPP,
  specialistSaveDC,
  spellSaveDC,
  nonBasicSaveLine,
  savedRungActsWith,
  spellAppliesItself
} from "./casting.mjs";
import { effectiveSaveDegree } from "./spell-degrees.mjs";

/** A successful save that still lands a printed rung (3.611.1, G3). */
const savedRungActs = (effects, degree) => savedRungActsWith(effects, degree, effectiveSaveDegree);
import {
  assembledCastingDC,
  assembledSaveDC,
  assembledSpellAttackTotal,
  describeParts,
  heightenedSavePP
} from "./casting-dc.mjs";
import {
  RESONANCE_EVENT_TABLE,
  RESONANCE_SPECIALS,
  SPELL_FUMBLE_MODIFIERS,
  SPELL_FUMBLE_SPECIALS,
  SPELL_FUMBLE_TABLE
} from "../data/spell-tables.mjs";
import { dragonhideShieldDB } from "../item-quality.mjs";
import { interruptedDegree } from "./pending-cast.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";
import { spellResilienceModifiers } from "../creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * How many secondary caster seats the ritual dialog offers.
 *
 * SIX, BECAUSE SIX IS 12 PP OF HEADROOM — more than doubles any
 * caster's maximum, and past the point where a table is still tracking
 * individual rolls. The page sets no ceiling; this is a dialog that has
 * to be a sensible height, not a rule. Empty seats cost nothing.
 */
const MAX_SECONDARY_CASTERS = 6;
const { DialogV2 } = foundry.applications.api;

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

/**
 * The one place this file interpolates text it did not compose itself —
 * `itemCast.saveDCSource`, which names the skill a scroll's DC was scraped
 * from and so can carry a world's own skill label.
 */
function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines, rolls = [], extra = {}) {
  if (!lines.length) return;
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    rolls,
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`,
    ...extra
  });
}

/** The tradition's fumble modifier, tolerant of combined table keys. */
export function fumbleModifierFor(tradition) {
  if (!tradition) return 0;
  const wanted = String(tradition).toLowerCase();
  for (const [key, value] of Object.entries(SPELL_FUMBLE_MODIFIERS)) {
    const parts = key.toLowerCase().split("&").map((part) => part.trim());
    if (parts.includes(wanted)) return value;
  }
  return 0;
}

/**
 * One consolidated pre-cast prompt (Chapter 9): Defensive Casting, Extra Casting
 * Time, and the situational casting penalties (magical interference, vigorous/
 * violent motion, violent weather, and — for attack spells — the target being in
 * melee). All optional; the common case is a single "Cast" click. Returns the
 * chosen options, or null if the dialog is dismissed (cast cancelled).
 */
/**
 * The second warp chooser — Warp Manipulation's, offered once the check
 * has resolved and before anything has been applied.
 *
 * THE SAME CHOOSER AS THE FIRST, deliberately: `buildWarpChooser` and
 * `aggregateWarpSelection` between them already know every option this
 * spell has and what each costs, and a second, simpler list would be a
 * second answer to "what can this spell be warped into". What differs is
 * only the budget and the sentence explaining it.
 *
 * @returns {Promise<object|null>} an aggregate selection, or null
 */
async function promptWarpManipulation(spell, basePP, offer, casterLevel = null) {
  const form = await DialogV2.prompt({
    window: { title: `${spell.name} — Warp Manipulation` },
    classes: ["trg-prime", "trg-check-dialog"],
    content: `<p class="hint">The spell is cast. <strong>Warp Manipulation</strong> lets you add up to `
      + `<strong>${offer.allowance} PP</strong> of warping now — you still pay the PP.`
      + (offer.waivesCritical
        ? ` <strong>This replaces the Critical's usual benefit</strong>, so the base cost is no longer halved.`
        : "")
      // AFTER THE CHECK, so the chooser must not repeat its own sentence
      // about raising the Casting DC — there is no DC left to raise, and a
      // hint that is false is worse than none.
      + `</p>` + buildWarpChooser(spell, basePP, { afterTheCheck: true, casterLevel }),
    ok: {
      label: "Add",
      callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form).object;
      }
    },
    rejectClose: false
  });
  if (form === null || form === undefined) return null;
  return aggregateWarpSelection(spell.system?.warps, form);
}

/**
 * Refuses a cast that cannot fit inside an encounter, and says why.
 *
 * A CARD RATHER THAN ONLY A NOTIFICATION, for the reason recorded
 * against the target-gate a dozen releases ago: Graham's stated worry
 * was that "the player might not read the note", and a toast that
 * scrolls away is exactly that failure. Nothing has been rolled or
 * spent by the time this runs, so the card is the whole outcome.
 *
 * @param {Actor} actor
 * @param {string} spellName
 * @param {number|string} castAP
 */
async function refuseLongCast(actor, spellName, castAP) {
  const text = tooLongForCombatLine(spellName, castAP);
  ui.notifications.warn(`${spellName} takes ${castTimeLabel(castAP)} to cast — too long for an encounter.`);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-card"><header class="trg-card-header">`
      + `<h3>${spellName} — Not Cast</h3></header><p>${text}</p></div>`
  });
}

async function promptCastingConditions(spell, { extraInc = null, isAttack = false, actor = null, reagents = [] } = {}) {
  const row = (inner) => `<label style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:3px 0">${inner}</label>`;
  const check = (name, label) => `<label style="display:block;margin:3px 0"><input type="checkbox" name="${name}"> ${label}</label>`;
  const extraField = extraInc
    ? row(`<span>Extra casting time (${extraInc.label})</span><select name="extraTime">${[0, 1, 2, 3, 4, 5]
        .map((n) => `<option value="${n}">${n === 0 ? "None" : `+${n} (${n * extraInc.size} ${extraInc.unit === "AP" ? "AP" : "min"})`}</option>`)
        .join("")}</select>`)
    : "";
  const meleeField = isAttack ? check("melee", "Target is in melee (-4)") : "";
  /*
   * AN UNWILLING TOUCH (3.583.0; page 240, Graham's R13). Offered only
   * where the sentence can bite: a touch-range spell that is not an
   * Attack spell, because an Attack spell's Cast a Spell check already
   * IS its attack roll (page 239) and a second would hit twice.
   */
  const touchField = touchAttackRequired({ rangeText: spell?.system?.range, willing: false, isAttackSpell: isAttack })
    ? check("unwilling", "Target is unwilling — Spellcraft attack roll to touch them (page 240)")
    : "";

  // Bardic Performance (Bard, 1st): "you may make a Perform skill check
  // in place of a Spellcraft check when casting a spell which has the
  // composition trait." Offered only when both are true — the spell is
  // a composition spell and at least one daily use remains — and spends
  // the use when the cast actually proceeds (below), not merely on the
  // tickbox being ticked.
  let performField = "";
  if (actor && hasCompositionTrait(spell)) {
    const performItem = bardicPerformanceItem(actor);
    if (performItem && (itemUsesRemaining(performItem) ?? 0) > 0) {
      // The two Bardic Performance options a CAST can spend a use on. Both
      // are offered together because they draw on one Cha+1 pool, and a bard
      // choosing between them wants to see both at the moment of casting.
      //
      // THE CONVICTION POINT NEEDS A DURATION TO RIDE. "This conviction point
      // remains for the duration of the spell or until it is expended,
      // whichever comes first" — and four of the ten composition spells
      // (Cutting Words, Counter Perform, Inspire Competence, Soothing Ballad)
      // resolve instantly and have no duration at all. Graham's ruling: on
      // those the option is not offered. Found live at 3.309.0, where the
      // point landed on an instantaneous spell with nothing to end it.
      const lasting = Boolean(parseSpellDuration(spell.system?.duration));
      performField = `<hr>${check("bardicPerform", "Bardic Performance — roll Perform instead of Spellcraft (spends 1 use)")}`
        + (lasting
          ? check("bardicConviction", "Bardic Performance — assign a temporary conviction point to a target (spends 1 use)")
          : "");
    }
  }

  // REAGENTS (3.578.0, Graham's R10 of the block-18 audit): the carried
  // vials and elixirs that suit this spell, as ticks. A ticked one is
  // spent on the cast and its bonus applied — see reagents.mjs.
  const reagentField = reagents.length
    ? `<hr><p class="hint">Reagents — an additional material component, spent on the cast:</p>${reagents
      .map((r) => check(`reagent-${r.id}`, `${esc(r.name)} — ${esc(reagentEffectText(r.use, spell.system ?? {}))} <em>(${esc(r.why)})</em>`))
      .join("")}`
    : "";

  // A creature that always casts defensively (3.627.0) is not asked.
  const alwaysDefensive = actor
    ? (await import("./defensive-casting.mjs")).declaredDefensiveCasting(declarationCarriers(actor))
    : null;
  const content = `<div class="trg-prime trg-check-dialog">
    <p class="hint">Optional casting conditions for <strong>${spell.name}</strong>.</p>
    ${alwaysDefensive
    ? `<p class="hint">Defensive Casting — always, through ${esc(alwaysDefensive.label)} (DC ${alwaysDefensive.dcAdd >= 0 ? "+" : ""}${alwaysDefensive.dcAdd}).</p>`
    : check("defensive", "Defensive Casting — avoid reactions (DC +5)")}
    ${extraField}
    <hr>
    <p class="hint">Situational penalties (Chapter 9):</p>
    ${check("interference", "Magical interference — targeted by a spell while casting (-2)")}
    ${row(`<span>Motion</span><select name="motion"><option value="none">None</option><option value="vigorous">Vigorous (-2)</option><option value="violent">Violent (-5)</option></select>`)}
    ${row('<span>Violent weather penalty (0–10)</span><input type="number" name="weather" value="0" min="0" max="10" style="width:5em">')}
    ${meleeField}
    ${touchField}
    ${performField}
    ${reagentField}
  </div>`;
  const form = await DialogV2.prompt({
    window: { title: `${spell.name} — Casting Conditions` },
    classes: ["trg-prime", "trg-check-dialog"],
    content,
    ok: {
      label: "Cast",
      callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form).object;
      }
    },
    rejectClose: false
  });
  if (form == null) return null;
  return {
    defensive: Boolean(form.defensive),
    extraIncrements: Number(form.extraTime || 0),
    interference: Boolean(form.interference),
    motion: form.motion || "none",
    weather: Number(form.weather || 0),
    targetInMelee: Boolean(form.melee),
    touchUnwilling: Boolean(form.unwilling),
    bardicPerform: Boolean(form.bardicPerform),
    bardicConviction: Boolean(form.bardicConviction),
    reagents: reagents.filter((r) => Boolean(form[`reagent-${r.id}`])).map((r) => r.id)
  };
}

/**
 * The Cast a Spell workflow.
 *
 * 1. Confirm PP availability and the caster-level cap; offer Sacrifice
 *    overcasting (DC +2 per PP over, Fortitude save for Soul Drain after).
 * 2. Cantrips skip the check unless the actor carries check penalties the
 *    GM wants applied; a dialog offers the DC 10 penalised path.
 * 3. The Spellcraft check at DC 10 + PP x 1.5, through the check engine.
 * 4. PP spend by degree (Heroic halves total, Critical halves base, Partial
 *    loses none, Failure loses half, Fumble/Blunder lose all).
 * 5. Attack spells report against the target's DB with the same check;
 *    save spells report the Save DC; Chaos triggers a Resonance Event;
 *    Fumble and Blunder roll the Spell Fumble Table (top open-ended, plus
 *    tradition modifier, +20 on Blunder, UM 66 reversal, UM 100
 *    catastrophe).
 */
/**
 * @param {Actor} actor
 * @param {Item} spell
 * @param {object} [options]
 * @param {object|null} [options.itemCheck] A check ALREADY ROLLED to release
 *   this spell from an item — the scroll reading, or a wand's release check.
 *   When an item cast is an attack spell this IS the attack roll: Graham,
 *   14 Aug 2026, "the release check is the attack", which is exactly what an
 *   ordinary cast does with its own Spellcraft roll. Passed as an argument
 *   rather than on the `itemCast` flag because a rolled check is a live
 *   object carrying dice, and flags are serialised.
 */
/**
 * `reaction` (3.612.0, R4): a spell cast in answer to a save from inside that
 * save's roll — see magic/save-reaction-spells-workflow.mjs. `presetTargets`
 * means the caller has already set the user's targets to the triggering
 * creature, so the picker is not opened over a roll in progress.
 */
export async function castSpell(actor, spell, { itemCheck = null, stored = null, ritual = null, reaction = null, presetTargets = false, apPaid = false, carried = null } = {}) {
  // A DRUNK POTION IS NOT A CAST (3.617.0, Graham's R1 of block 37). The
  // spell inside is released by drinking it, so nothing that forbids
  // CASTING — a Rage, a critical's "cannot cast spells", a lost voice or a
  // full pair of hands — forbids drinking. See `drunkSpellTargeting`.
  const drunkPotion = Boolean(spell?.getFlag?.(SYSTEM_ID, "itemCast")?.consumed);
  // Rage (Chapter 4): "You cannot cast spells." Checked before anything
  // is spent or rolled, so a blocked attempt costs nothing.
  if (isRaging(actor) && !drunkPotion) {
    ui.notifications.warn(`${actor.name} cannot cast spells while raging.`);
    return null;
  }

  /*
   * A CRITICAL CAN TAKE SPELLCASTING AWAY TOO (3.581.0; the pages
   * 211-220 audit's D5 and D6, Graham's R5 and R6). Force 96's "cannot
   * cast spells for (D)" and Aligned 57's "cannot use verbal components"
   * were printed on the card and honoured by nothing.
   *
   * BESIDE RAGE AND FOR THE SAME REASON — before anything is spent or
   * rolled, so a refused cast costs nothing.
   */
  {
    const { castingRefusal } = await import("./casting-restriction-workflow.mjs");
    const refusal = castingRefusal(actor, spell?.system ?? {}, Boolean(spell?.system?.innate));
    if (refusal.blocked && !drunkPotion) {
      ui.notifications.warn(refusal.reason);
      return null;
    }
    if (refusal.concentration) {
      // FORCE 39 DEMANDS A SUCCESS, NOT A REFUSAL. The spell is allowed
      // once the Spell Concentration action has been passed, so this
      // asks rather than blocks — and the answer is the player's, the
      // same as every other "you may attempt this" in the chapter.
      const proceed = await DialogV2.confirm({
        window: { title: "Spell Concentration Required", icon: "fa-solid fa-brain" },
        content: `<p>A critical injury (page 215) means ${actor.name}'s spellcasting requires a `
          + "<strong>Spell Concentration</strong> success this round. Has it been passed?</p>",
        rejectClose: false
      });
      if (!proceed) return null;
    }
  }

  // "CAN'T BE RECAST FOR 10 MINUTES" (Shield, after a Shield Block;
  // 3.575.0). Recorded by the Shield Block workflow as a world-clock
  // deadline, refused here before anything is spent.
  {
    const { recastLockoutRemaining, SPELL_RECAST_LOCKOUT_FLAG } = await import("./spell-shield.mjs");
    const waiting = recastLockoutRemaining(
      actor.getFlag?.("trg-prime", SPELL_RECAST_LOCKOUT_FLAG) ?? {},
      spell?.name, Number(game.time?.worldTime ?? 0));
    if (waiting > 0) {
      ui.notifications.warn(`${spell.name} can't be cast again for another ${Math.ceil(waiting / 60)} minute${Math.ceil(waiting / 60) === 1 ? "" : "s"}.`);
      return null;
    }
  }

  // Traits (Appendix 3): a spell's own traits govern it exactly as an
  // action's do — Word must open the turn, Teleportation is once per
  // turn, and so on. Checked before any PP or AP is committed.
  if (!traitGate(actor, spell.system, spell.name)) return null;

  // Aim (Chapter 4): "if you take any other action besides this one,
  // you lose all accrued aiming bonus" — casting a spell doesn't use
  // that bonus, so it's cleared unconditionally here.
  await clearAimIfOtherAction(actor, "castSpell");

  const system = actor.system;
  const spellData = spell.system;

  /*
   * SPELL STORING'S INTERCEPT (3.495.0) — ONE GATE, at the top of the
   * one function every cast crosses. See magic/spell-storing.mjs.
   *
   * A cast that lands in an open window is STORED rather than resolved:
   * the warps are chosen and the PP is paid here, and the targets, the
   * Cast a Spell check and the saves all wait for the release.
   *
   * CASTING SPELL STORING ITSELF NEVER STORES ITSELF. "If you cast the
   * spell again the last spell you stored is dismissed" is the book's
   * own sentence about that case, and it is handled where the spell is
   * applied rather than here.
   */
  const isStoringSpell = (spellData?.effects ?? []).some((e) => e?.kind === "spellStoring");
  const { readArmed } = await import("./spell-storing-workflow.mjs");
  const storingNow = !stored && !isStoringSpell && Boolean(readArmed(actor));

  // ONE GATE. `canCastSpell` asked whether the class was "learned" and
  // refused anything unprepared if so, which is why a Cleric's deific
  // aspect spells would not fire and an instinctive caster saw an empty
  // circle on every row. `archetypeCantripCastBlocked` existed only to
  // patch the other half of that same question. `spellCastBlocked` is
  // both, and it asks about the SPELL rather than about the character:
  // the only thing that is known but not ready is a book entry that has
  // not been prepared today. See spell-availability.mjs.
  const castBlocked = spellCastBlocked(spell);
  let spontaneousSpent = false;
  if (castBlocked) {
    // SPONTANEOUS SCHOLAR (3.382.0) waives exactly this refusal and no
    // other. `spellCastBlocked` is the ONLY thing left in the system that
    // refuses a known spell — `canCastSpell` was deleted at 3.348.0 — so
    // "cast without studying your spell library" can only mean waiving
    // it. Placed HERE, inside the refusal, so the feat is spent only when
    // it actually buys something: a spell that was castable anyway must
    // not cost a day's allowance.
    const scholar = spontaneousScholarAllows({
      featNames: Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat")
        .map((i) => i.name),
      ppCost: spell.system?.ppCost,
      casterLevel: actor.system?.magic?.casterLevelValue,
      // `.total`, not `.base`: the score the character HAS, including a
      // racial or item bonus. `.base` is only the points they allocated.
      intelligenceScore: actor.system?.attributes?.intelligence?.total,
      usedToday: Number(actor.getFlag?.(SYSTEM_ID, "spontaneousScholarUsed") ?? 0)
    });
    if (!scholar.allowed) {
      // The feat's own reason is appended when it HAS one — a holder who
      // has run out, or whose spell is too costly, should be told that
      // rather than only the generic "not prepared today".
      ui.notifications.warn(scholar.reason ? `${castBlocked} (${scholar.reason}.)` : castBlocked);
      return null;
    }
    spontaneousSpent = true;
  }

  // INNATE IS A BRANCH, NOT AN EXIT.
  //
  // This line used to read `if (spellData.innate) return castInnateSpell(...)`,
  // and that `return` was the defect. `castInnateSpell` was a parallel
  // implementation that posted a card, spent AP, decremented uses and
  // stopped — so it never reached the area template, the save resolution,
  // the attack resolution, the damage roll, the DR pipeline or the critical
  // injury that the lines below perform. The result, in the 13 Aug 2026
  // combat playtest: a Fire Giant cast Fireball (20-ft radius, 6d6 fire,
  // Basic Reflex DC 31) at a target eight feet away and nothing happened to
  // anybody. Its Orb Of Fire rolled an innate attack of 35 and printed
  // "Awaiting Difficulty" — never compared against the target's Defence
  // Bonus, never rolled damage. Every monster spell-like ability was inert.
  //
  // What is genuinely different about an innate spell is small and local:
  // 0 PP, a per-day use, auto-warp to the caster's maximum, and level-based
  // attack/save formulae instead of the Spellcraft maths. Each of those is
  // now a guard at the point it applies (search `isInnate`), so the shared
  // resolution below is reached by both kinds of caster and cannot diverge
  // again without someone deleting a guard rather than adding a `return`.
  const isInnate = Boolean(spellData.innate);
  // WARPS THE CASTER'S FEATS GRANT (3.625.0) — see magic/granted-warps.mjs.
  // Offered beside the spell's own in the Warp? dialog, paid or free on
  // the same terms (an innate cast's free budget covers them), and
  // aggregated through the same arithmetic.
  const grantedWarps = grantedSpellWarps(
    Array.from(actor.items ?? [])
      .filter((i) => i.type === "feat")
      .map((i) => [String(i.name).trim().toLowerCase(), registeredSpellWarps(i.name)])
      .filter(([, entries]) => Array.isArray(entries) && entries.length),
    spell, { innate: isInnate });
  // What the chooser and the aggregation read: the spell's warps plus the
  // granted ones, on an object shaped like the spell for the chooser.
  const warpSpell = grantedWarps.length
    ? { name: spell.name, system: { warps: warpsWithGranted(spell, grantedWarps), area: spellData.area } }
    : spell;

  // A SPELL RELEASED BY AN ITEM (3.310.0) — a potion drunk, a scroll read.
  //
  // Mechanically this is the innate branch: nothing leaves the user's PP
  // pool, no Spellcraft check decides whether it works, no components, no
  // metamagic, and the warp (if any) was chosen when the item was MADE
  // rather than now. So it rides `innate: true` on the temporary spell
  // document consumable-use-workflow builds, and this flag carries the
  // three things that belong to the ITEM and not to whoever used it:
  //
  //   pp          what the item was made at — its level, and what its Save
  //               DC derives from. The DC itself arrives as
  //               `system.fixedSaveDC`, which the resolution below already
  //               honours for the Wyrm's breath weapon, so nothing here
  //               needs to know the formula.
  //   casterLevel the level the item's own scaling reads, so a Potion of a
  //               cantrip does not grow stronger because a level 14
  //               Fighter happened to be the one who drank it.
  //   warp        the warp baked in at creation, already aggregated into
  //               the same {mods, notes} an interactive warp produces, so
  //               the resolution below cannot tell the difference.
  //
  // WITHOUT THIS the innate branch alone would still fire, and would still
  // be wrong in those two ways — quietly, on the drinker's own stats.
  const itemCast = spell.getFlag?.(SYSTEM_ID, "itemCast") ?? null;
  const isItemCast = Boolean(itemCast);

  // Per-day uses, checked BEFORE anything is committed — a spell-like with
  // nothing left costs no AP and rolls nothing.
  const innateUsesMax = isInnate ? itemUsesMax(spell) : null;
  const innateTracked = isInnate && innateUsesMax !== null && innateUsesMax !== Infinity;
  // Recorded when the use is actually spent, and reused by the card — see
  // the comment at the spend for why computing it twice was a defect.
  let innateSpend = null;
  if (innateTracked && itemUsesRemaining(spell) <= 0) {
    ui.notifications.warn(`${spell.name}: no innate uses remain today.`);
    return null;
  }
  // THE INNATE PP LIMIT (3.664.0; Graham, 20 Oct 2026): an innate spell
  // cannot be cast while its base PP is above the level it is cast at.
  // Characters and companions only — a stat block's spell-likes are the
  // creature's own. Refused before anything is committed.
  if (isInnate) {
    const gateLevel = innateCastLevel(spell, Array.from(actor.items ?? []), Number(system.identity?.level ?? 0)).level;
    const refusal = innateLevelRefusal({
      actorType: actor.type, basePP: spellData.ppCost, castLevel: gateLevel, isItemCast,
      allowance: innatePPAllowanceOf(spell)
    });
    if (refusal) {
      ui.notifications.warn(`${spell.name}: ${refusal}.`);
      return null;
    }
  }
  /*
   * AN ITEM'S REST BETWEEN USES (3.616.0, Graham's R11 of block 36). Air
   * Drake Armour's Fly is "at will", and then "cannot be activated for
   * another 10 minutes". Asked here, with the per-day uses, before anything
   * is committed. See rune-timers.mjs.
   */
  const grantSource = (() => {
    const grant = spell.flags?.[SYSTEM_ID]?.spellEffectRune;
    return grant?.itemId ? actor.items?.get?.(grant.itemId) ?? null : null;
  })();
  const { grantCooldownSpec, grantCooldownUntil, runeCooldownLeft, cooldownWords, GRANT_COOLDOWN_KEY } = await import("../rune-timers.mjs");
  const grantRest = grantCooldownSpec(grantSource);
  if (grantRest) {
    const left = runeCooldownLeft(grantSource, GRANT_COOLDOWN_KEY, Number(game.time?.worldTime ?? 0));
    if (left > 0) {
      ui.notifications.warn(`${grantSource.name}: ${spell.name} cannot be activated again for another ${cooldownWords(left)}.`);
      return null;
    }
  }

  // AN INNATE SPELL'S OWN CLOCK (3.651.0; block 18 R12, the Eclipse Hag's
  // "Timestop (1/minute)"): refused before anything is committed.
  {
    const { innateCooldownLeft } = await import("./innate-frequency.mjs");
    const { cooldownWords: words } = await import("../rune-timers.mjs");
    const left = innateCooldownLeft(spell, Number(game.time?.worldTime ?? 0));
    if (left > 0) {
      ui.notifications.warn(`${spell.name}: ${actor.name} cannot cast it again for another ${words(left)}.`);
      return null;
    }
  }

  // Components (Chapter 9): a somatic spell needs a free hand; a material spell
  // needs a component pouch. Gated before any PP/AP is committed, like the trait
  // gate above. Innate spell-likes are exempt — they carry no components.
  //
  // AN ITEM CAST IS NOT AN INNATE ONE, for components (Graham's ruling, 17 Aug
  // 2026): "Casting a spell from a scroll should be a normal cast not innate.
  // Material components are satisfied by the scroll itself but all other
  // components must still be met."
  //
  // WHY THE `innate` FLAG STAYS ON regardless. `buildItemSpell` sets it because
  // it buys four separate exemptions a scroll independently needs — no
  // memorisation (the spell is on the page), no PP from the reader (the cost
  // was paid at the workbench), no warp chooser ("You cannot warp a spell cast
  // from a scroll", Chapter 11) and no metamagic. Components were the one thing
  // riding along that the book never exempts, so components are the one thing
  // taken back — rather than flipping the flag and quietly re-charging the
  // reader for a spell they already bought.
  // A POTION ASKS FOR NO COMPONENTS (3.617.0, B7 of block 37): it was
  // gated on its spell's somatic hand, when drinking takes the item's own.
  const componentsOK = drunkPotion
    ? true
    : isItemCast
    ? componentGate(actor, spellData, spell.name, { materialProvided: true })
    // A SPELL CARRIED BY A STRIKE (3.655.1; block 22 R5, found live testing
    // 3.655.0): "cast as part of making a Strike action with a bow" — both
    // hands are on the bow, and the bow is the somatic hand.
    : carried && !isInnate
    ? componentGate(actor, { ...spellData, components: { ...(spellData.components ?? {}), somatic: false } }, spell.name)
    : (isInnate || componentGate(actor, spellData, spell.name));
  if (!componentsOK) return null;

  /*
   * SPEAKING UNDERWATER COSTS EVERYTHING (page 202, R3).
   *
   *   "If you speak (including casting spells with verbal components or
   *    activating items with command components) you lose all remaining
   *    air."
   *
   * The book names this case itself, which is why it is hooked here and
   * not left to the table: a caster holding their breath who casts a
   * verbal spell has just emptied their lungs. Inert for anyone not
   * holding their breath.
   */
  if (spellData?.components?.verbal && !isInnate) {
    const { loseAirToEvent } = await import("../drowning-workflow.mjs");
    await loseAirToEvent(actor, { spoke: true });
  }

  /*
   * ELECTRICITY UNDERWATER (page 201, R2).
   *
   *   "Any spells or electricity abilities used underwater immediately
   *    have radius equal to the normal range of the spell emanating from
   *    their originator or caster. The creator of such an effect always
   *    takes double damage from the effect."
   *
   * THE RANGE BECOMES THE RADIUS, which is what makes the rule
   * frightening rather than fiddly: a 60-foot bolt becomes a 60-foot
   * ball centred on the caster, and the caster is standing in it. Said
   * on the card rather than redrawing the template and rolling the
   * caster's own damage — the shape a spell takes and who ends up inside
   * it is a table decision, and this is the sentence that tells them a
   * decision is needed.
   */
  {
    const { tokenIsUnderwater } = await import("../combat/underwater-workflow.mjs");
    const { underwaterElectricity } = await import("../combat/underwater.mjs");
    const here = actor.getActiveTokens?.()?.[0]?.document ?? actor.token ?? null;
    const shock = underwaterElectricity({
      underwater: tokenIsUnderwater(here),
      damageType: spellData?.damageType,
      traits: spellData?.traits ?? ""
    });
    if (shock.applies) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
          + `<strong>Electricity underwater.</strong> The range becomes Personal and the area an explosive `
          + `<strong>${shock.radiusFeet}-ft sphere</strong> centred on ${actor.name}: everyone in it is affected, `
          + `<strong>${actor.name} included</strong> (Appendix 3), and ${actor.name} takes double damage from it (page 201).</p>`
          // APPLY BY HAND, SAID (3.622.1; G6 of the 3.622.0 drive, Graham's R7).
          // The cast below still resolves as aimed, so a bolt at a creature
          // outside the sphere hit it and the caster took nothing — the card
          // and the outcome disagreed. The table moves the effect.
          + `<p style="margin:2px 0"><em>Apply by hand: the spell below resolves as it was aimed. Move its effect to `
          + `everyone in the sphere, and roll ${actor.name}'s own double damage.</em></p></div>`
      });
    }
  }

  // A WEAPON IN HAND, for a spell that enchants one (3.438.0). Beside the
  // component gate because it is the same question — what the caster's
  // hands are holding — asked at the same moment, so a Talon Strike cast
  // with empty hands costs nothing.
  //
  // THE 3.437.0 LIVE PASS FOUND THIS REFUSAL DOWNSTREAM, in the effect
  // applier, where the PP had already been debited: one card read
  // "nothing applied" and "1 PP spent" in the same breath, while this
  // file's own comments say a blocked attempt costs nothing. Graham's
  // ruling, 29 August 2026: gate it.
  //
  // NOT A SECOND COPY of the applier's refusal — see
  // `weaponRiderRequirement`. This asks about the CASTER, which is all a
  // pre-cast gate can know; the applier still answers for a rider aimed
  // at somebody else, and for a weapon choice that was cancelled.
  if (!weaponRiderGate(actor, spellData, spell.name)) return null;

  // TRADITION (Chapter 2). "You have absolutely no connection with either
  // divine or verdant magic and cannot cast spells from these traditions."
  //
  // Beside the component gate rather than below the target prompt, and the
  // difference from the kind gate is worth stating so the two placements do
  // not look inconsistent: the KIND gate is about who you aimed at, which
  // the player can still change, so it must wait until the target set is
  // final. This is about who YOU are and what the spell IS — neither can
  // change between here and resolution, so the earliest possible refusal is
  // also the correct one.
  //
  // Innate spell-likes are NOT exempt. A creature with no connection to a
  // tradition has none whether the magic came from a class or its own
  // blood; the exemption above is about components, which an innate spell
  // genuinely lacks.
  if (!traditionGate(actor, spellData, spell.name)) return null;

  // KIND — see `applyKindGate` further down. It used to sit HERE, beside the
  // component gate, and that placement was the bug: the gate ran, and then
  // `promptTargetSelection` below let the player pick somebody else, and nothing
  // asked again. Live on 15 Aug 2026 a druid targeted a wolf, passed the gate,
  // swapped to a goblin in the system's own prompt, and charmed it — "AUDIT
  // Goblin: Blunder save (-91 vs 12) — is affected." The gate now runs after
  // the target set is final. It is still before the warp chooser, the
  // Spellcraft check and the PP spend, so a refusal still costs nothing.

  // A MANEUVER SPELL'S CHECK IS ITS ATTACK, so it does not also run the
  // spell-attack and damage pipeline. Graham's ruling of 25 August 2026:
  // "if a spell emulates an attack action that does not inflict damage
  // (grapple, shove etc), it should also inflict no damage. Also, such
  // actions do not inflict criticals so the spells that emulate them
  // should not either."
  //
  // The category stays TRUE — Tanglefoot is an attack spell and the book
  // prints it as one. What changes is that the attack it makes is the
  // maneuver, not a second roll. Before this, Tanglefoot rolled a spell
  // attack alongside its grapple, critically hit for 0 damage and rolled
  // on the critical injury table.
  const isAttack = String(spellData.category ?? "").toLowerCase() === "attack"
    && !spellIsManeuver(spellData);

  // FIXATED (3.621.0; Appendix 2, block 39's R7): "Any actions with the
  // concentrate trait cannot be used". Refused here, before anything is
  // chosen or spent.
  {
    const { concentrateRefusal } = await import("../conditions/condition-rules.mjs");
    const refused = concentrateRefusal(actor.conditions?.effective, spellData.traits ?? "");
    if (refused) {
      ui.notifications.warn(`${spell.name}: ${refused}.`);
      return null;
    }
  }

  // FIRE, AIR, WATER, EARTH, SONIC (3.622.0; Graham's R11 of block 39): Fire,
  // Air and Water "cannot be cast underwater"; Earth "cannot be cast in
  // mid-air"; Sonic "cannot be used in a vacuum". Refused before anything is
  // chosen or spent. See trait-rules.mjs.
  {
    const { elementalCastGate } = await import("../trait-rules-workflow.mjs");
    if (!(await elementalCastGate(actor, spellData, spell.name))) return null;
  }

  // Variable-AP spells (e.g. Cure) change their range/area/effect with the number
  // of actions spent. Offer the choice up front; the picked mode then governs the
  // AP spent, the placement, and the effects applied for the rest of this cast.
  const apModes = Array.isArray(spellData.apOptions) ? spellData.apOptions : [];
  let apMode = null;
  if (apModes.length) {
    const picked = await DialogV2.wait({
      window: { title: `${spell.name} — ${spellData.modeLabel || "Action Points"}` },
      classes: ["trg-prime"],
      // A spell whose modes are a CHOICE OF FORM rather than a choice of
      // action cost says so — "Shape Of The Animal scales with the
      // actions you spend" is not what Agile and Brawn are.
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">${
        spellData.modePrompt || `${spell.name} scales with the actions you spend. Choose how to cast it:`
      }</p></div>`,
      buttons: apModes.map((o, i) => ({ action: String(i), label: o.label })),
      rejectClose: false
    });
    if (picked === null || picked === undefined) return null;
    apMode = apModes[Number(picked)] ?? null;
  }
  // Effective range / area / effects / AP for this cast (an AP mode overrides the
  // item's stored fields; otherwise they're used as-is).
  const effRange = apMode?.range ?? spellData.range;
  // A MODE MAY CARRY ITS OWN SAVE (3.609.0, R10). Transmute Rock & Mud's
  // Mud to Rock asks a Reflex save; Rock to Mud asks none of the creatures
  // standing on the stone. Null means the spell's own.
  const effDefence = apMode && Object.prototype.hasOwnProperty.call(apMode, "defence") ? String(apMode.defence ?? "") : null;
  const effArea = apMode ? (apMode.area ?? "") : spellData.area;
  let effEffects = apMode?.effects ?? spellData.effects;
  // A NOTE FOR A CAST FROM THE SHEET IS NOT SAID ON A REACTION (3.612.1, G1 of
  // the 3.612.0 drive). Fateful Temptation's and Lucky Break's rows explain
  // where they are really cast from; cast in answer to a save, that card was
  // telling the table it had "no save to answer" beside the save it answered.
  if (reaction && Array.isArray(effEffects)) effEffects = effEffects.filter((e) => !(e?.kind === "note" && e.sheetCastOnly === true));
  // A QUICKENED INNATE (3.651.0; block 18 R12, the Frostsnarl's Cold Bolt):
  // 1 AP less, as Quicken Spell, printed into the spell-like.
  const { quickenedInnateAP } = await import("./innate-frequency.mjs");
  const effCastAP = quickenedInnateAP(spell, apMode?.ap ?? spellData.castAP);

  // ENOUGH AP TO CAST AT ALL — asked here, before the warp chooser, the
  // conditions prompt, the Spellcraft check and the PP spend, because a
  // refusal is only useful before any of them. Until 3.311.3 the shortfall
  // was noticed at the very END, in `spendActionCost`, which clamped the
  // pool to 0, warned, and let the spell go off regardless (Graham,
  // 14 Aug 2026).
  //
  // The spell's OWN cost, not the final total: extra casting time and a
  // metamagic AP delta are chosen after this point and can only raise it.
  // Those are an opt-in the player makes knowing what they have left, and
  // `spendActionCost` still reports if the total outgrows the pool — one
  // gate that refuses, one clamp that reports, neither repeating the other.
  /*
   * "1 AP+" — EXTRA ACTIONS BUY A BIGGER SPELL (3.501.0).
   *
   * ASKED BEFORE THE POOL CHECK BELOW, so the refusal is measured against
   * what this cast will actually cost rather than its printed minimum.
   * The comment under that check says extra casting time and a metamagic
   * delta "are chosen after this point and can only raise it" — those are
   * opt-ins a player makes knowing what is left. This is not: it is the
   * spell's own printed cost, and a caster who picks 3 AP with two in the
   * pool should be told now, not clamped at the end.
   *
   * ONE SPELL IN THE PACK PRINTS IT. See magic/ap-scale.mjs for why the
   * shape is deliberately small rather than a general action-economy
   * feature built from a sample of one.
   */
  let apScaleExtra = 0;
  const apScaleSpec = normaliseApScale(spellData?.apScale);
  if (apScaleSpec && castAPIsScalable(effCastAP)) {
    const rows = apScaleChoices(spellData.apScale, baseAPOf(effCastAP) ?? 1);
    const picked = await DialogV2.wait({
      window: { title: `${spell.name} — Casting Time` },
      content: `<p>${spell.name} may be cast for longer: <em>${apScaleSpec.label}</em>.</p>`,
      buttons: rows.map((r, i) => ({ action: String(i), label: r.label })),
      rejectClose: false
    }).catch(() => null);
    // A CLOSED DIALOG IS THE PRINTED SPELL, not a cancelled cast. The
    // choice is an upgrade; declining to choose one is declining the
    // upgrade, and killing the whole cast over it would punish a stray
    // Escape key.
    apScaleExtra = picked === null || picked === undefined
      ? 0
      : (rows[Number(picked)]?.extra ?? 0);
  }
  // THE UNIT HAS TO SURVIVE THE SCALE (3.518.0). This line used to
  // collapse a string cast time to its leading number, so "1 minute"
  // reached the gate below as the number 1 and there was nothing left
  // to read a unit off. Extra actions only ever apply to an AP-shaped
  // cast time — `castAPIsScalable` gates the prompt that produces them
  // — so with none taken the printed value passes through untouched.
  const effCastAPWithScale = castTimeWithExtraActions(effCastAP, apScaleExtra);

  /*
   * TOO LONG TO CAST IN A FIGHT (3.518.0). Graham's ruling, 7 Sep 2026:
   * "Anything with a cast time of more than 3 AP cannot be cast in
   * combat. A combat round is 6 seconds so an AP equates to about 2
   * seconds. A 1 minute casting would be 30 AP and a 10 minutes casting
   * 300 AP, no combat would ever last that long."
   *
   * BEFORE THE POOL GATE, AND INSTEAD OF IT. Until now a ten-minute
   * ritual cast mid-encounter was converted to 10 AP and then REFUSED
   * FOR THE WRONG REASON — "costs 10 AP, and Toben has 3 — 7 short",
   * with a "proceed anyway" button that let it through. The pool was
   * never the problem and no override represents one, so this refuses
   * outright and says what the arithmetic actually is.
   *
   * A SPELL THAT SELLS A SHORTER CAST IS NOT REFUSED HERE. Regenerate,
   * Restoration and Crackling Tempest each print a one-minute cast and
   * each sell a warp that brings it under the ceiling; refusing before
   * the chooser opens would put the option behind the refusal it
   * removes. Those fall through to the same test again once the warps
   * are settled, below.
   */
  if (actorInCombat(actor) && !castTimeIsCombatLegal(effCastAPWithScale)) {
    if (!offersCastTimeWarp(spellData)) {
      await refuseLongCast(actor, spell.name, effCastAPWithScale);
      return null;
    }
  } else if (!apPaid && !(await ensureActionPoints(actor, castTimeApCost(effCastAPWithScale), `${spell.name} — Cast a Spell`))) {
    return null;
  }

  /*
   * Healing Channel (Class, Chapter 5): "when casting the Cure spell, the
   * amount healed is INCREASED TO d10's (and +10 for ranged)."
   *
   * THE RULE MOVED OUT AT 3.475.0 and the arithmetic changed with it.
   * This block used to append " + 10", so a ranged Cure — whose 2 AP mode
   * is `1d8 + 8` — healed 1d10 + 8 + 10. Graham reported 18 from a live
   * table. "Increased to" is a replacement in both halves of the same
   * clause: d8 becomes d10 and 8 becomes 10. See magic/healing-channel.mjs.
   */
  const hasHealingChannel = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "healing channel"
  );
  if (healingChannelApplies(spell.name, hasHealingChannel) && Array.isArray(effEffects)) {
    const ranged = isRangedCure(effRange);
    effEffects = effEffects.map((effect) => {
      if (effect?.kind !== "heal" || !effect.formula) return effect;
      return { ...effect, formula: healingChannelFormula(effect.formula, ranged) };
    });
  }
  // AFTER HEALING CHANNEL, which rewrites the formula's dice and flat term.
  // A STAFF OF CURE OR OF HEALING (3.615.0, B9 of block 36): "a +1-item
  // bonus to the Hit Points you restore anytime you cast the Cure spell
  // using your own PP or using those from the staff" — while wielded.
  {
    const cureBonus = Math.max(0, ...Array.from(actor.items ?? [])
      .filter((i) => i.system?.equipped)
      .map((i) => Number(i.flags?.[SYSTEM_ID]?.chargedItem?.cureBonus ?? 0) || 0));
    if (cureBonus > 0 && String(spell.name).trim().toLowerCase() === "cure" && Array.isArray(effEffects)) {
      effEffects = effEffects.map((effect) => (effect?.kind === "heal" && effect.formula
        ? { ...effect, formula: `${effect.formula} + ${cureBonus}` } : effect));
    }
  }

  // WHO IS THIS AIMED AT. The prompt used to fire only for spells of the
  // ATTACK category, so Magic Missile — "1 or more creatures", category
  // utility — went off at whatever happened to be targeted last. In the
  // 3.286.0 playtest that was the party's own fighter, targeted by an
  // ENEMY on the previous turn, and the Wizard put three missiles into
  // him without being asked a thing.
  //
  // `spellNeedsTarget` widens the gate to every spell that names
  // creatures, and still leaves area spells alone — their template
  // decides who is caught, and collecting a target the spell then
  // ignores would be worse than not asking.
  // NOT WHILE STORING. There is nothing to aim at yet — the whole point
  // of the ruling is that the targets are chosen at the release, and a
  // target picked now would be a creature that has had a round to move.
  if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {
    // THE SIDE GATE'S OWN SENTENCE, ONE STEP EARLY (3.443.2). The gate
    // below still decides; this only lets the picker say what it will
    // decide, so a Bard is not offered a bare row for a creature their
    // spell cannot reach. Null for every spell that declares no side, and
    // the picker treats that as "no annotations".
    const { dispositionReasonFor } = await import("./cutting-words-workflow.mjs");
    const confirmed = await promptTargetSelection(actor, {
      title: `${spell.name} — Select Target`,
      // THE BOOK'S OWN WORDS. "Targets: a handful of dirt or mud" beats
      // any sentence I could write, and beats calling a cantrip an attack.
      prompt: [
        targetPromptText({
          isAttack: spellData?.category === "attack",
          targets: spellData?.targets
        }),
        // THE ENFORCED NUMBER, said only where a reader would get a
        // different one from the printed line — "you and up to 5" reads
        // as five and allows six. See magic/target-count.mjs.
        targetCapNote(spellData?.targets, {})
      ].filter(Boolean).join(" "),
      note: dispositionReasonFor(actor, spell)
    });
    if (!confirmed) return null;
  }

  // THE SIDE GATE, ASKED HERE FOR THE REASON THE KIND GATE BELOW IS
  // (3.432.0, widened at 3.443.1). After the target set is final, and
  // still before the warp chooser, the Spellcraft check and the PP spend —
  // so a refusal costs nothing. See magic/cutting-words-workflow.mjs; it
  // answers null for every spell that declares neither side.
  {
    const { dispositionRefusal } = await import("./cutting-words-workflow.mjs");
    const refusal = dispositionRefusal(actor, spell, Array.from(game.user?.targets ?? []));
    if (refusal) {
      ui.notifications.warn(refusal);
      return null;
    }
  }

  // KIND (Chapter 5). "Spells such as charm kind and hold kind will only affect
  // creatures of your type", and Charm Animal reaches "a creature of the animal
  // type" — which, per Graham's definition of a creature trait, includes anyone
  // who has GAINED the animal trait from a feat or a Form spell.
  //
  // ASKED HERE, AFTER THE TARGET SET IS FINAL, and that is the whole point of
  // where it sits. Anywhere above `promptTargetSelection` the answer is about a
  // target the player is still free to change, which is exactly how 3.315.0's
  // gate came to be bypassable. Still before the warp chooser, the Spellcraft
  // check and the PP spend, so a refusal costs nothing.
  //
  // Spells with no `targets` and no area — Hold Animal, Hold Kind — never see
  // that prompt, so for them "after it" and "before it" are the same moment.
  // They are gated by the same call either way.
  //
  // AN AREA SPELL IS GATED LATER, against what its template caught —
  // see `filterAreaByKind`. Its targets do not exist yet at this point,
  // so asking here would hit the "aimed at nothing" branch and refuse
  // the cast outright. Turn Undead is the first gated area spell and
  // would have been uncastable (3.352.0).
  let kindSkipped = [];
  let kindWidened = [];
  if (spellData.kindGate && !isAreaSpell(spellData)) {
    const gate = applyKindGate(actor, spell, spellData);
    if (!gate.allowed) return null;
    kindSkipped = gate.skipped;
    kindWidened = gate.widened ?? [];
  }

  // TRAIT IMMUNITY (3.622.1; the 3.622.0 drive's F1, Graham's R1). Mental:
  // "objects and mindless creatures are immune to effects with this trait" —
  // and Emotion and Fear bring Mental. The kind gate's shape: an immune target
  // is pruned and named on the card, and a cast whose every target is immune
  // is refused before anything is spent. An area is asked against what its
  // template caught, further down. See magic/spell-trait-immunity.mjs.
  if (!isAreaSpell(spellData) && spellNeedsTarget(spellData) && !storingNow) {
    const targeted = Array.from(game.user?.targets ?? []).filter((t) => t?.actor);
    if (targeted.length) {
      const { partitionTraitImmune } = await import("./spell-trait-immunity.mjs");
      const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
      const immunity = partitionTraitImmune(targeted.map((t) => t.actor), spellData.traits ?? "", ownedCreatureTypeSystem);
      if (immunity.skipped.length) {
        if (!immunity.kept.length) {
          for (const miss of immunity.skipped) ui.notifications.warn(`${spell.name}: ${miss.reason}.`);
          return null;
        }
        for (const token of targeted) {
          if (!immunity.kept.includes(token.actor)) token.setTarget(false, { releaseOthers: false, groupSelection: true });
        }
        ui.notifications.info(`${spell.name}: ${immunity.skipped.map((s) => s.reason).join("; ")}.`);
        kindSkipped = [...kindSkipped, ...immunity.skipped];
      }
    }
  }

  // Innate: 0 PP, always. The stored ppCost is what the spell would cost a
  // learned caster and is deliberately ignored here — the Fire Giant's
  // Fireball lists 6 PP and its own card has always said "0 PP".
  const basePP = isInnate ? 0 : Math.max(0, Number(spellData.ppCost ?? 0));
  const characterLevel = Number(system.identity?.level ?? 0);
  // AN ITEM'S SPELL IS CAST AT THE ITEM'S LEVEL (3.617.0, A11 of block 37;
  // Graham's R23): its DC, its innate attack and its free warp budget.
  const innateAt = innateCastLevel(spell, Array.from(actor.items ?? []), characterLevel);
  const innateLevel = innateAt.level;
  const innateLevelWord = innateAt.itemName ? `${innateAt.itemName}'s level ${innateLevel}` : `level ${innateLevel}`;
  // "Auto-warped to the maximum (caster level N)" — an innate spell-like is
  // cast at the creature's own level rather than a class-derived caster
  // level, which is what the innate attack/save formulae below take too.
  // AN ITEM'S SPELL SCALES WITH THE ITEM. A consumable's level IS the PP of
  // the spell it creates (Chapter 11), so that is the level its caster-level
  // modifications read — not the level of whoever picked the bottle up.
  const casterLevel = isItemCast
    ? Math.max(0, Math.floor(Number(itemCast.casterLevel ?? itemCast.pp ?? 0)))
    : isInnate
      ? innateLevel
      : casterLevelOf(system);
  // Book of Notations (Bard, 1st): "cast it as a Specialist Spell until
  // the following day" — a repertoire spell flagged by today's pick is
  // treated as specialist for casting purposes without becoming one
  // permanently; the flag is swept at the next Daily Preparation
  // (uses-workflow.mjs), not written onto system.specialist itself.
  // ARCADIAN CASTER (Creature Codex; 3.631.0): "casts all spells as if they
  // were Specialist" — `derives.specialistAll` on the ability.
  const { castingDerives } = await import("../creature-ability-rules.mjs");
  const castDerives = castingDerives(Array.from(actor.items ?? []));
  const isSpecialist = Boolean(spellData.specialist) || Boolean(spell.getFlag?.(SYSTEM_ID, "bookOfNotationsPick")) || castDerives.specialistAll;
  const ppPool = Number(system.resources?.pp?.value ?? 0);
  /*
   * A RITUAL RAISES THE CAP RATHER THAN BREAKING IT (3.585.0, page 243).
   *
   * "A magic ritual permits the Primary caster to cast a spell of a
   * number of PP higher than their normal maximum by 2 x the amount of
   * secondary casters." The secondaries' headroom was already enforced
   * in `rollMagicRitual`, which then posted a card saying the spell was
   * cast and cast nothing. Handing the cast the headroom it bought is
   * what makes the sentence true — and doing it as a RAISED CAP rather
   * than a bypass means the Sacrifice offer below stays silent (a
   * ritual is the OTHER overcasting method, not both at once) while a
   * caster who somehow exceeds even the ritual's room still meets it.
   */
  const ritualHeadroom = Math.max(0, Math.floor(Number(ritual?.ppOver) || 0));
  const cap = (isSpecialist ? specialistMaxPP(characterLevel) : maxPPPerCast(casterLevel)) + ritualHeadroom;
  // NOT innate. `basePP === 0` alone would sweep every innate spell into the
  // cantrip path, whose fast route posts "Cantrip cast — no check required"
  // and returns before any resolution — reintroducing the very defect this
  // change removes, by a different door.
  const isCantrip = basePP === 0 && !isInnate;

  // Spell warping: cast for a higher PP cost for a stronger effect. Not
  // offered for cantrips, which have no PP cost to warp from. Metamagic
  // feats (Chapter 5) appear in the SAME dialog as character-owned
  // warping options, gated on ownership and on what this spell actually
  // has to warp (see buildMetamagicOptions).
  // Declared HERE, not below the warp dialog: buildMetamagicOptions reads
  // it a dozen lines down, and a `const` further into the same block put
  // that read inside the temporal dead zone — every non-cantrip cast threw
  // "Cannot access 'tradition' before initialization" before it reached
  // the warp chooser. Found in review of 3.196.0; the bug shipped earlier.
  // A SPECIALIST SPELL INHERITS THE CASTER'S TRADITION — Chapter 10 says
  // so outright. This line used `??`, which cannot reach its own fallback
  // for a value stored as "", so all 106 specialist spells cast with no
  // tradition and six tradition-keyed rules went silent. See
  // `effectiveSpellTradition` for what that cost.
  const tradition = effectiveSpellTradition(spellData.tradition, system.magic?.tradition);

  // WHAT THIS SPELL IS, handed to every casting check below.
  //
  // THE GAP THIS CLOSES, found in the Chapter 2 Elf audit on 3.319.0. The
  // Sindarni heritage grants "+1 to Cast a Spell (Spellcraft) checks made
  // to cast spells of the Insight school", and Insight is a TRAIT — 76
  // spells in the pack carry it, and `conditionals.mjs` has scoped by
  // traits since long before this rule was written. The bonus still could
  // not be scoped, because the casting check handed the conditional engine
  // nothing about the spell: actor, label, type, dc, modifiers, and no
  // more. So the entry had to be authored as a bare `checkTypes:
  // ["cast", "spellcraft"]` and was offered identically whether the spell
  // was an Insight spell or not.
  //
  // This is the third time the same shape has been found, and the comment
  // is here so it is the last:
  //   3.316.0  Forbidden Magic's -2 vs divine/verdant — the SAVE knew no
  //            tradition, so the rule was authored on a sheet roll and
  //            absent from the roll that provoked it.
  //   3.317.1  Pelora's +2 to Power Recovery — the rest workflow's check
  //            named neither its skill nor its action.
  //   3.319.1  this.
  // In every case the rule was authored correctly and the roll it applies
  // to never said what it was. A conditional can only be as good as the
  // context handed to the check.
  //
  // Both axes are passed, not just traits. The tradition is already known
  // here, costs nothing to forward, and a "+1 to cast arcane spells" rule
  // is the obvious neighbour of the one that prompted this.
  const castContext = {
    traits: spellData.traits ?? "",
    traditions: tradition,
    // SECRET (3.622.0; Graham's R11 of block 39): "If an ability has this
    // trait, the GM rolls the check in secret." Actions already were; a
    // Secret spell's casting check now is too.
    ...(secretRollMode(spellData) ? { rollMode: secretRollMode(spellData) } : {})
  };

  let warpPP = 0;
  let warp = emptyWarp();
  // A BAKED-IN WARP IS STILL A WARP. The item's maker paid for it — "the
  // spell in a wand must be warped to the amount of PP that it will be cast
  // with", and a potion is priced from the PP it creates — so its mods
  // (extra dice, a persistent rider, a bigger bonus, a longer duration) have
  // to reach the resolution below exactly as an interactively chosen warp
  // does. `ppSpent` stays 0: the cost was paid at the workbench, and adding
  // it here would charge the drinker for it a second time.
  // A RELEASED STORED SPELL CARRIES THE WARP IT WAS STORED WITH, and for
  // the same reason the item cast above does: it was chosen and PAID FOR
  // at storage. Re-offering the chooser would let a 1 PP spell be
  // released as a 20 PP one.
  if (stored?.mods) {
    warp = {
      ppSpent: 0,
      rawPP: 0,
      mods: { ...emptyWarp().mods, ...(stored.mods ?? {}) },
      notes: Array.isArray(stored.notes) ? [...stored.notes] : []
    };
  }
  if (isItemCast && itemCast.warp) {
    warp = {
      ppSpent: 0,
      rawPP: 0,
      mods: { ...emptyWarp().mods, ...(itemCast.warp.mods ?? {}) },
      notes: Array.isArray(itemCast.warp.notes) ? [...itemCast.warp.notes] : []
    };
  }
  let mm = emptyMetamagic();
  // Metamagic is a learned caster's feat set — an innate spell-like warps
  // automatically and has nothing to pay a feat with.
  const { metamagicRodsOf } = await import("../rod-powers.mjs");
  // …UNLESS THE INNATE SPELL TAKES IT (3.670.0; Inner Tempest's Mystic,
  // B6-8: "Metamagic Feats where compatible with innate spells"). A spell
  // flagged `innateMetamagic` offers the caster's Metamagic feats, paid from
  // its free innate budget below rather than from the pool. Never a cantrip
  // and never an item's spell.
  const innateMetamagic = isInnate && !isItemCast && !isCantrip && !innateCantripOf(spellData) && spell.getFlag?.(SYSTEM_ID, "innateMetamagic") === true;
  const mmOptions = (isCantrip || (isInnate && !innateMetamagic)) ? [] : buildMetamagicOptions({
    // THE METAMAGIC RODS HELD (3.616.0, R12) — see rod-powers.mjs.
    rods: metamagicRodsOf(Array.from(actor.items ?? [])),
    featNames: Array.from(actor.items ?? [])
      .filter((i) => i.type === "feat")
      .map((i) => String(i.name).trim().toLowerCase()),
    elementalTypes: Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .map((e) => e.getFlag?.(SYSTEM_ID, "elementalSpellType"))
      .filter(Boolean),
    spellData,
    // A MARKED INNATE SPELL'S FEATS ARE PRICED ON ITS PRINTED COST (3.670.0,
    // found in review): Temporal Extension's half of 0 was free.
    basePP: innateMetamagic ? Math.max(0, Number(spellData.ppCost ?? 0)) : basePP,
    casterLevel,
    tradition,
    // Echoing Performance needs the number, not the word "Cha".
    charisma: Number(system.attributes?.charisma?.total ?? 0)
  // Economic Spell lowers a pool cost a marked innate spell does not have.
  }).filter((o) => !(innateMetamagic && o.kind === "economic"));
  // INNATE CASTS NOW CHOOSE THEIR WARPS, FREE, UP TO THE CHARACTER'S
  // LEVEL (3.332.0, Graham's ruling 18 Aug 2026).
  //
  // This block used to be gated `!isCantrip && !isInnate`, on the reading
  // that an innate spell is "auto-warped to the maximum" and so has no
  // choice to offer. That phrase was on every innate card and meant only
  // the CASTER LEVEL MODIFICATIONS block; the spell's own Warping
  // Options were never offered and never applied.
  //
  // Found through Wild Shape. Its printed text — "1 hour if you use the
  // 10-minute warping option", and "you may reduce your size by one step
  // (which increases accordingly with the default warping options)" — is
  // describing Shape Of The Animal's own warps, which sit in the pack at
  // 1 PP and 4 PP (and 6 PP for two steps). Both had been recorded in
  // the audit as clauses that could not be automated. They were data.
  //
  // AN ITEM CAST IS NOT THIS, and the harness caught the first version of
  // this change offering it one. A potion, wand or scroll rides
  // `innate: true` on a temporary spell so that nothing leaves the
  // user's PP pool — but its warp was chosen and PAID FOR at the
  // workbench ("the spell in a wand must be warped to the amount of PP
  // that it will be cast with"). Offering the drinker a second, free
  // choice would let a 1 PP potion be cast as a 20 PP one.
  const innateBudget = (isInnate && !isItemCast) ? innateWarpBudget(innateLevel) : 0;
  if (!isCantrip && !isItemCast && !stored && (!isInnate || innateBudget > 0)) {
    const form = await DialogV2.prompt({
      window: { title: `${spell.name} — Warp?` },
      classes: ["trg-prime", "trg-check-dialog"],
      content: (isInnate
        ? `<p class="hint">Innate spell-like — <strong>free</strong> warping up to <strong>${innateBudget} PP</strong> (${innateAt.itemName ? innateLevelWord : "your level"}). Nothing here costs Power Points.</p>`
        : "") + buildWarpChooser(warpSpell, basePP, { casterLevel }) + buildMetamagicChooser(mmOptions),
      ok: {
        label: "Continue",
        callback: (event, button) => {
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(button.form).object;
        }
      },
      rejectClose: false
    });
    if (form === null || form === undefined) return null;
    warp = aggregateWarpSelection(warpSpell.system?.warps, form);
    warpPP = warp.ppSpent;
    // Read here, before the innate budget is checked (3.670.0): a marked
    // innate spell's Metamagic feats are spent from that budget.
    mm = aggregateMetamagicSelection(mmOptions, form, {
      damageFormula: String(spellData.damage?.formula ?? ""),
      baseDamage: String(spellData.baseDamage ?? "")
    });

    // THE INNATE BUDGET IS SPENT HERE AND CHARGED NOWHERE.
    //
    // Refused rather than trimmed: silently dropping the options that did
    // not fit would apply a different spell from the one the player
    // chose, and they cannot see which ones survived. `totalPP` below
    // floors an innate cast at 0, so leaving `warpPP` non-zero would
    // charge Power Points a creature does not have and refuse the cast.
    if (isInnate) {
      const fit = innateWarpFits(warp, innateBudget, { countRaw: innateMetamagic, metamagicPP: mm.ppSpent });
      if (!fit.ok) {
        ui.notifications.warn(
          `${spell.name}: ${fit.spent} PP of warping chosen, ${fit.over} more than your free budget of ${fit.budget} (${innateAt.itemName ? innateLevelWord : "your level"}).`
        );
        return null;
      }
      if (fit.spent) warp.notes.push(`Free: ${fit.spent} of ${fit.budget} PP innate warping${innateMetamagic && warp.rawPP ? " and Metamagic" : ""} (${innateAt.itemName ? innateLevelWord : "your level"})`);
      // The Metamagic box was spent from the budget, not the pool (3.670.0).
      warpPP = innateMetamagic ? 0 : warp.rawPP;
    }
    // Menora (Chapter 2): the chosen healing spell "costs one less PP to
    // Warp". Recorded on the granted spell itself at pick time, so it
    // travels with the spell rather than needing a name match here.
    //
    // Furini (Chapter 2) scopes the same discount to a SCHOOL rather than
    // one spell, so it is carried on an actor effect and matched against
    // the spell's traits. Both channels are summed: a Menora healing
    // spell that is also of a Furini gnome's chosen school is genuinely
    // covered by two separate rules.
    const spellTraits = String(spellData.traits ?? "")
      .split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const schoolDiscount = Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled)
      .reduce((sum, e) => {
        const scoped = e.getFlag?.(SYSTEM_ID, "warpDiscountSchool");
        if (!scoped?.school) return sum;
        if (!spellTraits.includes(String(scoped.school).trim().toLowerCase())) return sum;
        return sum + (Number(scoped.value) || 0);
      }, 0);
    // POWERFUL ILLUSION (Shadow, 3.332.0): "any Shadow spell that you
    // cast may have a 1 PP warping option applied to it for free."
    //
    // A SEPARATE CHANNEL FROM THE DISCOUNT BELOW, and the difference is
    // the floor. Menora's and Furini's discounts stop at 1 — "a discount
    // makes warping cheaper but never free" — while this one is free by
    // its own words. Applied FIRST, so the discount that cannot reach 0
    // works on what is left rather than racing it, and so a Shadow spell
    // that is also a Furini school spell is covered by both rules
    // without either swallowing the other.
    //
    // `warpFreeSchool` IS SCOPED BY TRAIT, not by school, whatever its
    // name says: the test below is `spellTraits.includes(...)`, and
    // Powerful Illusion's "school" is the word `Shadow`, which is a
    // trait. HEALER'S GRACE (3.447.0) rides the same channel on the
    // Healing trait without the channel learning anything new — the name
    // is left alone rather than renamed through feats-workflow for a
    // cosmetic gain.
    //
    // AND THE SOURCE IS NAMED BY THE GRANT (3.447.0). This note read
    // "Powerful Illusion" for every source, hard-coded — so a Cleric
    // under Healer's Grace would have been told a Wizard feat had waived
    // their PP. The same class of defect as the card that said "cone"
    // over a line: a sentence asserting something it does not know.
    const freeWarpSources = Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled)
      .map((e) => ({ effect: e, scoped: e.getFlag?.(SYSTEM_ID, "warpFreeSchool") }))
      .filter(({ scoped }) => scoped?.school
        && spellTraits.includes(String(scoped.school).trim().toLowerCase())
        && (Number(scoped.value) || 0) > 0);
    const freeWarp = freeWarpSources.reduce((sum, { scoped }) => sum + (Number(scoped.value) || 0), 0);
    if (freeWarp) {
      const free = applyFreeWarp(warpPP, warp.rawPP, freeWarp);
      if (free.waived) {
        // NAMED FROM THE GRANT ITSELF, falling back to the effect's own
        // name — never to a feat this caster may not have.
        const named = freeWarpSources
          .map(({ effect, scoped }) => String(scoped.label ?? effect.name ?? "").trim())
          .filter(Boolean);
        const who = named.length ? named.join(", ") : "a free-warp effect";
        warp.notes.push(`-${free.waived} PP: ${who} (free, no minimum)`);
        warpPP = free.total;
      }
    }

    const warpDiscount = (Number(spell.getFlag?.(SYSTEM_ID, "warpDiscount")) || 0) + schoolDiscount;
    if (warpDiscount) {
      // The discount is on WARPING, so the free-text Extra PP box (spent
      // on Metamagic feats, not on any warping option) is held out of it
      // and added back. Discounting the combined figure would make a cast
      // that warped nothing but paid 3 Metamagic PP cost 1 less, and
      // print a "warp discount" line for a cast that never warped.
      const warpOnly = Math.max(0, warpPP - warp.rawPP);
      const discounted = applyWarpDiscount(warpOnly, warpDiscount) + warp.rawPP;
      if (discounted !== warpPP) {
        warp.notes.push(`-${warpPP - discounted} PP: heritage warp discount (minimum 1)`);
        warpPP = discounted;
      }
    }
  }
  const warpMods = warp.mods;

  /*
   * THE EXTRA ACTIONS LAND IN THE WARP CHANNEL (3.501.0).
   *
   * `areaGrowth` is the mod `warp-area.mjs` already reads, so a spell
   * that grows by AP and a spell that grows by PP grow through one piece
   * of code rather than two that agree until somebody edits one.
   *
   * ADDED, NOT ASSIGNED. Warped Terrain has no area warp today, but a
   * spell that had both would otherwise have one of them silently
   * overwrite the other — the shape `aggregateWarpSelection` avoids
   * everywhere by incrementing.
   */
  for (const [key, value] of Object.entries(apScaleMods(spellData?.apScale, apScaleExtra))) {
    warpMods[key] = (Number(warpMods[key]) || 0) + Number(value);
  }

  // Metamagic damage riders join the warp-dice channel; Extend/Temporal
  // override the duration text; the rest fold in further below.
  if (mm.extraDamageDice) {
    warpMods.damageDice = addDice(warpMods.damageDice, mm.extraDamageDice);
  }
  if (mm.elementalType) warpMods.elementalType = mm.elementalType;
  if (mm.extend && !warpMods.durationText) {
    warpMods.durationText = `${spellData.duration} ×2 (Extended)`;
  }
  if (mm.temporalSteps && !warpMods.durationText) {
    warpMods.durationText = temporalDurationText(spellData.duration, mm.temporalSteps);
  }

  /*
   * WHAT THIS CAST ACTUALLY TAKES (3.518.0) — settled ONCE, here, and
   * read three times below: by the legality gate directly after it, by
   * the extra-casting-time prompt, and by the spend at the end.
   *
   * ONE VALUE RATHER THAN THREE COMPUTATIONS, because this file already
   * records what happens otherwise: "two that agree until somebody edits
   * one". The three used to read `effCastAP` and each rebuilt the number
   * its own way.
   *
   * THE SECOND HALF OF THE GATE ABOVE. A spell selling a shorter cast —
   * Regenerate, Restoration, Crackling Tempest — was let past that one
   * so the chooser could open. This is where it is asked again, now that
   * the answer is known, and where Restore Senses is caught going the
   * other way: its +4 PP warp pushes a 2 AP cast out to ten minutes, so
   * buying it during a fight is buying a spell you can no longer cast.
   */
  const warpedCastAP = warpedCastTime(effCastAPWithScale, warpMods);
  if (actorInCombat(actor) && !castTimeIsCombatLegal(warpedCastAP)) {
    await refuseLongCast(actor, spell.name, warpedCastAP);
    return null;
  }
  // AND THE POOL GATE THE FIRST ONE COULD NOT RUN. A one-minute cast
  // reaching this line has just been warped down to 2 or 3 AP, and this
  // is the first moment there is a real cost to measure the pool
  // against. Skipped when the warps left the cast time alone, because
  // then the gate above already asked and asking twice is a dialog for
  // nothing.
  if (warpedCastAP !== effCastAPWithScale && !apPaid
    && !(await ensureActionPoints(actor, castTimeApCost(warpedCastAP), `${spell.name} — Cast a Spell`))) {
    return null;
  }

  // THE APPENDIX TRAIT PICKS (Chapter 5, the Form spells). "You gain a single
  // beast trait (see Appendix)", and "+1 PP: add a beast trait (max 3)".
  //
  // Asked HERE — after the form and the warping options are settled, so the
  // count is known, and before the roll, so a cast abandoned at this prompt
  // costs nothing. That is the same placement, for the same reason, as the
  // thrown-weapon and ammunition spends on the other side of the roll.
  //
  // Free text rather than a picker because the Appendix these all point at is
  // not in this project; see form-traits.mjs. The prompt says so, so nobody
  // mistakes an empty list for the system having none.
  /*
   * THE WARPS THAT ADD TO A FORM (3.595.0, R3 and R4 of block 31).
   *
   * BESIDE THE TRAIT PICKS BELOW, and for the identical reason: after the
   * form and the warping options are settled, so the counts are known, and
   * before the roll, so a cast abandoned at one of these prompts has cost
   * nothing.
   *
   * THE ROWS JOIN THE FORM'S OWN and travel through the same applier, so a
   * warped form ends exactly as an unwarped one does. Nothing is applied
   * here. See magic/polymorph-warps.mjs, including why `morphForms` — a
   * key that greps as a perfect match — is NOT the one the attacks use.
   */
  if (warpMods.sizeSteps > 0 || warpMods.extraFormAttacks > 0) {
    const { polymorphWarpRows } = await import("./polymorph-warps-workflow.mjs");
    const added = await polymorphWarpRows(
      spell, warpMods, String(actor.system?.identity?.size ?? ""));
    if (added.length) effEffects = [...(Array.isArray(effEffects) ? effEffects : []), ...added];
  }

  let pickedTraits = "";
  const traitPicks = traitPickCount(effEffects, warpMods);
  if (traitPicks > 0) {
    const asked = await DialogV2.wait({
      window: { title: `${spell.name} — Appendix traits` },
      classes: ["trg-prime"],
      position: { width: 460 },
      content: `<div class="trg-prime trg-check-dialog">
        <p>This form grants <strong>${traitPicks}</strong> trait${traitPicks === 1 ? "" : "s"}
        from the Appendix. Name ${traitPicks === 1 ? "it" : "them"}, separated by commas —
        they are added to your creature traits for the duration and removed with the form.</p>
        <p class="hint">The Appendix list is not yet in the system, so this is typed rather
        than chosen. Leave it blank to take none.</p>
        <div class="form-group"><label>Trait${traitPicks === 1 ? "" : "s"}</label>
        <input type="text" name="traits" autofocus></div></div>`,
      buttons: [
        {
          action: "ok", label: "Take the form", icon: "fa-solid fa-check", default: true,
          callback: (event, button) =>
            new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
              button.form ?? button.closest("form")
            ).object
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    // Cancel abandons the cast, exactly as cancelling the form choice does.
    // Answering with an empty box is a different thing and is allowed: a
    // player who has not chosen yet takes the form and none of the traits.
    if (!asked || asked === "cancel") return null;
    pickedTraits = String(asked.traits ?? "");
  }

  // Component Savant (Chapter 5 metamagic): a queued one-cast component
  // swap costs +1 PP, folded into the warp bucket for spend maths.
  const componentSwap = actor.getFlag(SYSTEM_ID, "componentSwapNext") ?? null;
  // A marked innate spell's feats were spent from its free budget above
  // (3.670.0, found in review: they were charged to the pool).
  const metamagicPP = (componentSwap ? Math.max(0, Number(componentSwap.pp ?? 1)) : 0) +
    (innateMetamagic ? 0 : mm.ppSpent);

  // Signature Spell (Class, Chapter 5): "when you Warp this spell, the
  // total PP cost is reduced by 1" — only when something was actually
  // warped (spell warps or metamagic).
  const signatureDiscount = spell.getFlag?.(SYSTEM_ID, "signatureSpell") &&
    (warpPP + mm.ppSpent) > 0 ? 1 : 0;

  // Economic Spell's reduction applies last and can never drop a levelled
  // spell below 1 PP ("min 1 PP").
  // The "min 1 PP" floor is a floor on a LEVELLED spell's cost. A cantrip has
  // none, and neither has an innate spell-like — without `isInnate` here the
  // floor would charge every monster 1 PP for a spell whose card has always
  // read "0 PP", and refuse the cast outright for a creature with no pool.
  const totalPP = Math.max(
    (isCantrip || isInnate) ? 0 : 1,
    basePP + warpPP + metamagicPP + mm.ppDelta - signatureDiscount
  );

  // ONE PLACE SAYS "innate costs nothing", and it is the `totalPP` floor
  // just above (via `basePP`). This guard deliberately does NOT repeat it.
  //
  // It used to read `!isInnate && totalPP > ppPool`, and that second copy
  // masked the first: mutating either one alone changed no behaviour,
  // because the other still covered it, so neither was actually under test.
  // With the floor as the only statement of the rule, an innate cast has
  // totalPP 0 and a pool of 0 is never exceeded — and if the floor ever
  // stops exempting innate, THIS line is what starts refusing monsters
  // their spell-likes, loudly, instead of the two quietly agreeing.
  /*
   * A ROD'S PP INSTEAD OF YOUR OWN (3.616.0, Graham's R13 of block 36). The
   * Rod of the Magi and the Sceptre of the Clergy: "You may expend PP from
   * the rod instead of your own reserve when casting an arcane [a divine]
   * spell." Asked here, before the pool is tested, so a caster short of PP
   * can make it up from the rod. A spell nobody pays for — an innate, an
   * item's, a released stored one, a cantrip — has nothing to draw. The
   * draw is a ceiling: the rod pays what the casting turns out to cost, up
   * to it, and the caster the rest.
   */
  let rodDraw = 0;
  let rodPaid = 0;
  const { ppSourceRodFor } = await import("../rod-powers.mjs");
  const rodSource = (isCantrip || isInnate || isItemCast || stored || totalPP <= 0)
    ? null
    : ppSourceRodFor(Array.from(actor.items ?? []), tradition);
  if (rodSource) {
    const shortfall = Math.max(0, totalPP - ppPool);
    const offered = Math.max(0, Math.min(totalPP, Math.max(rodSource.uses, shortfall)));
    const answer = await DialogV2.prompt({
      window: { title: `${spell.name} — ${rodSource.name}` },
      classes: ["trg-prime", "trg-check-dialog"],
      content: `<p>${spell.name} costs <strong>${totalPP} PP</strong>; you have ${ppPool}. `
        + `<strong>${rodSource.name}</strong> holds ${rodSource.uses} PP.</p>`
        + `<div class="form-group"><label>PP to draw from the rod</label>`
        + `<input type="number" name="draw" value="${Math.min(offered, Math.max(shortfall, 0))}" min="0" max="${offered}" step="1"></div>`
        + `<p class="hint">Drawing more than the rod holds overspends it, which rolls Charge Depletion.</p>`,
      ok: {
        label: "Continue",
        callback: (event, button) => {
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(button.form).object;
        }
      },
      rejectClose: false
    });
    if (answer === null || answer === undefined) return null;
    rodDraw = Math.max(0, Math.min(offered, Math.floor(Number(answer.draw) || 0)));
  }

  if (totalPP > ppPool + rodDraw) {
    ui.notifications.warn(
      `${spell.name} costs ${totalPP} PP (${basePP} base + ${warpPP} warp${metamagicPP ? ` + ${metamagicPP} metamagic` : ""}); only ${ppPool} remain${rodDraw ? `, and ${rodDraw} from ${rodSource.name}` : ""}.`
    );
    return null;
  }

  /*
   * THE TARGET CAP (3.498.0), and it is asked HERE for the reason the
   * side gate and the kind gate give a few hundred lines above: after
   * the target set is final and after the warp that may raise it, but
   * still before the Spellcraft check and the PP spend — so a refusal
   * costs nothing.
   *
   * IT CANNOT SIT BESIDE THE PICKER, which is where it would read most
   * naturally. The warp chooser runs AFTER the picker, and "you can
   * target an additional creature" is bought there; a gate above it
   * would refuse a selection the caster was about to pay to make legal.
   *
   * REFUSED, NOT TRIMMED. Taking "the first N" would apply the spell to
   * creatures the player did not choose — the picker's rows are unordered
   * as far as they are concerned — and dropping the rest in silence is
   * the same silence Graham's picker ruling forbids one step earlier.
   *
   * SKIPPED WHILE STORING, because a stored spell picks no targets at
   * all and `game.user.targets` may still hold whatever was aimed at
   * last. See magic/spell-storing.mjs.
   */
  if (!storingNow && spellNeedsTarget(spellData)) {
    const refusal = overTargetRefusal({
      spellName: spell.name,
      // THE CASTER LEVEL THIS CAST IS ALREADY USING (3.520.0), so a
      // "target up to 1 creature per level" warp scales off the same
      // number as max PP per cast and overcasting — including an item
      // cast, whose level is the consumable's rather than the reader's.
      //
      // AN AP MODE MAY NAME ITS OWN COUNT (3.611.0, R7 of block 34) —
      // Death's Defiance: "1 living creature per action spent to cast this
      // spell", so the 2 AP mode targets two.
      cap: targetCapFor(apMode?.targets ?? spellData?.targets, warp.mods, casterLevel),
      chosen: Array.from(game.user?.targets ?? []).length
    });
    if (refusal) {
      ui.notifications.warn(refusal);
      return null;
    }
  }

  /*
   * AND WHETHER THEY ARE CLOSE ENOUGH (3.519.0).
   *
   * Until this release NOTHING compared a distance to a spell's printed
   * range: a touch spell landed on a creature across the room. A WEAPON
   * has refused this since long before — "Toben is 40 ft away — beyond
   * Longsword's reach (max 10 ft)" — so this is one rule reaching the
   * other half of the game rather than a new one. See magic/spell-range.mjs.
   *
   * BESIDE THE TARGET-COUNT GATE, AND FOR ITS REASON, which the comment
   * above states: a gate above the warp chooser "would refuse a selection
   * the caster was about to pay to make legal". Twenty-five spells sell a
   * warp that lengthens their range, and refusing before the chooser
   * would put every one of them behind the refusal it removes.
   *
   * NOTHING IS SPENT YET at this line — the PP is charged some seven
   * hundred lines below — so this refuses rather than warns, exactly as
   * the weapon does.
   */
  if (!storingNow && (game.user?.targets?.size ?? 0)) {
    const casterToken = actor.getActiveTokens?.()?.[0] ?? null;
    const reach = touchReach(system);
    // THE AREA IS PART OF THE QUESTION NOW (3.532.0). A spell printing
    // neither a range nor an area affects the caster — Graham's ruling of
    // 8 September 2026 — so silence is read here rather than treated as
    // an absent limit. Both halves are the WARPED ones: Shield Of Faith's
    // "+2 PP: increase the range to touch" and Pass Without Trace's warp
    // granting an area both have to be able to lift the restriction they
    // would otherwise be gated by.
    const castRange = effectiveRangeText(
      warpedRange(effRange, warpMods),
      warpedAreaText(effArea, warpMods)
    );
    // NO TOKEN, NO GATE. A cast with nothing to measure is not refused
    // for a distance nobody could measure; `attack-workflow.mjs` calls
    // the same condition `positional`.
    const far = casterToken
      ? targetsOutOfRange(
        Array.from(game.user.targets).map((t) => ({
          name: t.name,
          distance: distanceBetween(casterToken, t)
        })),
        castRange,
        reach
      )
      : [];
    if (far.length) {
      const lines = far
        .map((t) => outOfRangeLine(spell.name, t.name, t.distance, castRange, reach))
        .filter(Boolean);
      ui.notifications.warn(
        `${far.map((t) => t.name).join(", ")} — beyond ${spell.name}'s range of ${rangeLabel(castRange, reach)}.`
      );
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-card"><header class="trg-card-header">`
          + `<h3>${spell.name} — Not Cast</h3></header>`
          + lines.map((l) => `<p>${l}</p>`).join("")
          + `</div>`
      });
      return null;
    }
  }

  /*
   * AND HERE THE STORED SPELL STOPS. (3.495.0)
   *
   * Everything above this line is the part of casting that HAPPENS: the
   * rage and trait gates, the availability gate, the AP check, the warp
   * chooser, the metamagic, the price. Everything below it is
   * RESOLUTION — the check, the saves, the effects — and that is what
   * Graham's ruling of 4 September suspends.
   *
   * `totalPP` IS WHAT A SUCCESS COSTS, and it is what storage takes. The
   * release settles the difference against the degree it actually rolls,
   * so a Heroic hands half back and a Partial hands it all back. See
   * magic/spell-storing.mjs for the collision that made this necessary:
   * the price depends on a degree that has not been rolled yet.
   *
   * NO SPELL ADDER IS OFFERED FOR A STORAGE, deliberately — the offer
   * sits a few lines below this exit. "Cast one spell with no power
   * point cost" and "pay now, settle at release" are two different
   * answers to the same question, and combining them without a ruling
   * would invent one. A caster who wants the free cast casts normally.
   */
  if (storingNow) {
    const {
      bondedItemFor, readArmed: readArmedNow, storeSpell, disarmStoring
    } = await import("./spell-storing-workflow.mjs");
    const armed = readArmedNow(actor);
    const bond = bondedItemFor(actor);
    if (!bond) {
      // NOTHING IS SPENT AND THE WINDOW STAYS OPEN. A wizard who has not
      // designated a bonded item today has lost nothing yet, and closing
      // the window here would take the 1 PP Spell Storing cost with it.
      ui.notifications.warn(`${actor.name} has no bonded item to store ${spell.name} in.`);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-card"><header class="trg-card-header">`
          + `<h3>${spell.name} — Not Stored</h3></header><p>${noBondLine(spell.name)}</p></div>`
      });
      return null;
    }

    if (totalPP > 0) {
      await actor.update({ "system.resources.pp.value": Math.max(0, ppPool - totalPP) });
    }
    // THE WARPED TIME, NOT THE PRINTED ONE (3.518.0). Storing a spell
    // spends the cast, so a cast whose time was warped is stored at the
    // warped time.
    await spendActionCost(actor, castTimeApCost(warpedCastAP), spell.name);

    const kept = await storeSpell(actor, {
      spellId: spell.id,
      spellName: spell.name,
      ppPaid: totalPP,
      mods: warp.mods,
      notes: warp.notes,
      releaseCost: armed?.releaseCost ?? "1"
    });
    await disarmStoring(actor);

    const said = [storedLine(spell.name, bond.name, totalPP)];
    if (kept?.displaced?.spellName) said.push(displacedLine(kept.displaced.spellName));
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-card"><header class="trg-card-header">`
        + `<h3>${spell.name} — Stored</h3></header>`
        + said.map((l) => `<p>${l}</p>`).join("")
        + `<p class="hint">Release it for ${armed?.releaseCost === "free" ? "a free action"
          : armed?.releaseCost === "reaction" ? "a reaction" : "1 AP"} from your Magic tab.</p></div>`
    });
    return { cast: false, stored: true, ppSpent: totalPP, spellName: spell.name };
  }

  // SPELL ADDERS (3.332.0): "a +1 Spell Adder allowing you to cast any
  // one spell from your repertoire each day with no power point cost",
  // and Graham's ruling that the whole cast is free, warps included.
  //
  // OFFERED AFTER `totalPP` IS KNOWN, so the player can see what the use
  // is worth before spending it — a use burnt on a 1 PP spell when a 14
  // PP one is coming is the choice this ability is about. Declining
  // leaves the cast entirely ordinary.
  //
  // BEFORE THE OVERCAST GATE, deliberately. A free cast still counts
  // against the caster's PP-per-cast CAP: a Spell Adder pays the cost,
  // it does not raise the ceiling on what may be cast, and sliding it in
  // afterwards would let a +1 ring cast a 20 PP spell at 1st level.
  let spellAdderUsed = false;
  let adderSummary = null;
  if (spellAdderApplies({ isCantrip, isInnate, isItemCast, totalPP })) {
    const wondrous = wondrousBonusesForActor(Array.from(actor.items ?? []), {
      className: Array.from(actor.items ?? []).find((i) => i.type === "class")?.name ?? "",
      tradition: system.magic?.tradition ?? ""
    }).spellAdders ?? [];
    const rated = withWondrousAdders(spellAdderSources(actor), wondrous);
    const spent = Number(actor.getFlag?.(SYSTEM_ID, SPELL_ADDER_USED_FLAG)) || 0;
    const left = spellAdderRemaining(rated.total, spent);
    if (left > 0) {
      const take = await DialogV2.confirm({
        window: { title: "Spell Adder" },
        classes: ["trg-prime", "trg-check-dialog"],
        content: `<p>Cast <strong>${spell.name}</strong> for <strong>free</strong>, spending one of your `
          + `<strong>${left}</strong> remaining Spell Adder use${left === 1 ? "" : "s"} today?</p>`
          + `<p class="hint">The cast would otherwise cost ${totalPP} PP. From: ${rated.sources.map((x) => `${x.label} +${x.value}`).join(", ")}.</p>`,
        rejectClose: false
      });
      if (take) {
        spellAdderUsed = true;
        adderSummary = { left: left - 1, saved: totalPP, sources: rated.sources };
        await actor.setFlag(SYSTEM_ID, SPELL_ADDER_USED_FLAG, spent + 1);
      }
    }
  }

  let overcast = 0;
  if (!isInnate && totalPP > cap) {
    overcast = totalPP - cap;
    const proceed = await DialogV2.confirm({
      window: { title: "Overcasting — Sacrifice" },
      content: `<p><strong>${spell.name}</strong> costs ${totalPP} PP, above your limit of ${cap} (${isSpecialist ? "character level, specialist spell" : "caster level + 1"}).</p><p>Overcast by Sacrifice? The casting DC rises by ${overcastDCIncrease(totalPP, casterLevel)}, and afterwards a Fortitude save against attack level ${totalPP} determines Soul Drain.</p>`,
      rejectClose: false
    });
    if (!proceed) {
      // THE SPELL ADDER COMES BACK (3.617.0, B18 of block 37): it was spent
      // a dialog ago, on a cast that is now not happening.
      if (spellAdderUsed) {
        const spentNow = Number(actor.getFlag?.(SYSTEM_ID, SPELL_ADDER_USED_FLAG)) || 0;
        await actor.setFlag(SYSTEM_ID, SPELL_ADDER_USED_FLAG, Math.max(0, spentNow - 1));
      }
      return null;
    }
  }

  // Set by the block below and read three times on the way down: the
  // conditions prompt, the check itself, and the degree. All three are
  // the same question — "is there a roll?" — and a cantrip on this path
  // answers no to all of them.
  let noCheckCantrip = false;

  // Cantrip fast path: no check unless the penalised route is wanted.
  // Attack cantrips always need the check to resolve the attack roll
  // itself (Chapter 9: "if an attack cantrip is cast, a spellcraft
  // check must still be made to resolve the attack check"), so they
  // never take this path regardless of penalties.
  if (isCantrip && !isAttack) {
    const penalised = await DialogV2.confirm({
      window: { title: `${spell.name} — Cantrip` },
      content: `<p>Cantrips need no check normally. Apply the penalised path (Casting DC ${CANTRIP_PENALISED_DC}) because of damage or other penalties?</p>`,
      rejectClose: false
    });
    // IT USED TO RETURN HERE, AND THAT WAS THE BUG (fixed 3.393.0).
    //
    // The old comment on this block said it plainly without anyone
    // following the thought through: "this route returns roughly four
    // hundred lines before the `spendActionCost` every other cast
    // reaches". It returned before EVERYTHING else too — the effect
    // engine, the save, and the card's own text.
    //
    // So a no-check cantrip applied nothing. DAZE, CHILL TOUCH AND TAME
    // each carry a save in the pack and NONE OF THE THREE ever rolled
    // it: casting Daze posted "Cantrip cast — no check required" and
    // nothing happened to anybody. Found live on 25 August 2026 when two
    // newly authored cantrips (Orientate, Spook) applied no bonuses and
    // the actor came back with zero active effects.
    //
    // The fix is to skip the CHECK, not the resolution — which is what
    // this path was always for. `noCheckCantrip` now carries that the
    // whole way down, and the cast continues like any other.
    noCheckCantrip = !penalised;
  }

  const equippedArmourItems = Array.from(actor.items ?? [])
    .filter((item) => item.type === "armour" && item.system?.equipped);
  const equippedArmour = equippedArmourItems.map((item) => item.system);
  // Transcend Armour (Chapter 5): "You ignore your usual spellcasting
  // penalties for any armour that you are proficient with" — so the
  // pieces that still penalise are the ones the caster is NOT proficient
  // with. The Ranger/Druid metal-armour rule is a pick-time note.
  //
  // That filter used to read `a.proficiency === "none"`, against a field
  // no armour in the pack has ever set, which made it the empty list —
  // Transcend Armour waived the penalty for every piece including the
  // plate the caster has no business wearing. It now asks the character.
  const transcendArmour = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "transcend armour"
  );
  const casterProficiency = proficiencyProfile(actor);
  const penalisingArmour = transcendArmour
    ? equippedArmourItems
      .filter((item) => !isProficientWith(casterProficiency, item))
      .map((item) => item.system)
    : equippedArmour;
  const armourPenalty = armourCastingPenalty(tradition, penalisingArmour);

  // One consolidated pre-cast prompt: Defensive Casting, Extra Casting Time, and
  // the situational penalties (Chapter 9). Dismissing it cancels the cast.
  //
  // NOT FOR A POTION (3.311.1). Every field on this prompt exists to adjust a
  // Casting DC — Defensive Casting +5, extra casting time, magical
  // interference, vigorous motion, violent weather — and an item cast rolls
  // NO CHECK AT ALL, so all of it feeds a number that is never used.
  //
  // Live testing in Graham's world, 14 Aug 2026: drinking a Potion of Cure II
  // opened "Potion of Cure II — healing — Casting Conditions" and asked
  // whether the drinker wanted to avoid reactions and how bad the weather
  // was, with a Cast button. Nothing on it changed the outcome by a single
  // point. The harness could not have found this — it stubs DialogV2 and
  // answers every prompt, so a dialog that should not exist looks identical
  // to one that should.
  // OFF THE WARPED TIME (3.518.0). A Regenerate warped from a minute
  // down to 2 AP takes extra casting time in ACTIONS, not in minutes,
  // and this used to offer the printed spell's increment regardless.
  const extraInc = extraCastingTimeIncrement(warpedCastAP);
  // NOR FOR A MONSTER'S SPELL-LIKE (3.311.4). 3.311.1 suppressed this for
  // an item cast; live testing showed the same prompt still interrupting a
  // Fire Giant's Fireball, and the argument is identical — an innate cast
  // rolls NO CHECK, so every field on it feeds a Casting DC that is never
  // computed.
  //
  // CHECKED FIELD BY FIELD BEFORE REMOVING IT, because "it looks useless"
  // is how a real choice gets deleted:
  //   Defensive Casting  — its only modelled effects are the +5 DC and a
  //                        fumble note. Nothing in opportunity.mjs reads
  //                        `defensive`, so it does not avoid a reaction
  //                        here however the book words it.
  //   Extra casting time — buys a bonus to a check that is not rolled,
  //                        while still charging the AP.
  //   Interference, motion, weather, target-in-melee — all land in
  //                        `situational`, which is folded into the
  //                        SPELLCRAFT check's modifiers only. The innate
  //                        attack roll below builds its own list and has
  //                        never included them.
  //   Bardic Perform     — substitutes Perform for a Spellcraft check.
  //
  // So nothing on the prompt could change an innate outcome by a point.
  // A NO-CHECK CANTRIP JOINS THE OTHER TWO for exactly the reason given
  // above: every field on this prompt adjusts a Casting DC, and a cantrip
  // taking this path rolls no check for one to apply to. Asking would be
  // the "feeds a number that is never used" defect this gate was built to
  // avoid — and it would put a dialog in front of the quickest cast in
  // the game.
  // THE REAGENTS THAT SUIT THIS SPELL (3.578.0, R10) — offered on the same
  // prompt, and so only on a cast that has one: an item's or an innate
  // spell's material is not the caster's to add to.
  const reagentChoices = (isItemCast || isInnate || noCheckCantrip)
    ? []
    : reagentOffers(Array.from(actor.items ?? []), spellData, { tradition });
  const conditions = (isItemCast || isInnate || noCheckCantrip)
    ? { defensive: false, extraIncrements: 0, interference: false, motion: "", weather: 0, targetInMelee: false, touchUnwilling: false, bardicPerform: false, reagents: [] }
    : await promptCastingConditions(spell, { extraInc, isAttack, actor, reagents: reagentChoices });
  if (conditions === null) return null;

  // SPENT NOW, AS BARDIC PERFORMANCE'S USE IS: a material component is
  // consumed by the casting, whatever the check then does. What each adds
  // joins the channel that already carries its kind of number — the warp
  // dice, the warp save DC, the relief bump — so nothing downstream needs
  // to know a reagent was involved.
  const reagentsUsed = reagentChoices.filter((r) => (conditions.reagents ?? []).includes(r.id));
  const reagentBonus = reagentMods(reagentsUsed, spellData);
  const reagentLines = [];
  for (const used of reagentsUsed) {
    const item = actor.items.get(used.id);
    if (!item) continue;
    const quantity = Math.max(0, Math.floor(Number(item.system?.quantity ?? 1)));
    if (quantity <= 1) await item.delete();
    else await item.update({ "system.quantity": quantity - 1 });
    reagentLines.push(line(`<strong>Reagent:</strong> ${esc(used.name)} — ${esc(reagentEffectText(used.use, spellData))}.`));
  }
  if (reagentBonus.damageDice) warpMods.damageDice = addDice(warpMods.damageDice, reagentBonus.damageDice);

  // THE NEXT SPELL OF A TYPE, BOOSTED (3.630.0) — Blackfire Ivy's extra die
  // and ignored fire resistance, Emberthistle's 1d4. Spent here, beside the
  // reagents, because it is the same kind of thing: something used up to
  // make this casting hit harder. See magic/next-spell-damage.mjs.
  {
    const { clearResistanceBypass, setResistanceBypass } = await import("../combat/damage-workflow.mjs");
    clearResistanceBypass();
    const { declaredNextSpellDamage, nextSpellDamageFor } = await import("./next-spell-damage.mjs");
    const boost = nextSpellDamageFor(declaredNextSpellDamage(Array.from(actor.appliedEffects ?? actor.effects ?? [])), spellData, { elementalType: warpMods.elementalType ?? "" });
    if (boost) {
      warpMods.damageDice = addDice(warpMods.damageDice, boost.dice);
      if (boost.ignoreResistance) setResistanceBypass(boost.types);
      const spent = actor.effects?.get?.(boost.effectId);
      if (spent) await spent.delete();
      reagentLines.push(line(`<strong>${esc(boost.label)}:</strong> +${esc(boost.dice)} to the ${esc(boost.types.join("/"))} damage`
        + `${boost.ignoreResistance ? `, and each target's ${esc(boost.types.join("/"))} resistance is ignored` : ""} — the dose is spent.`));
    }
  }
  if (reagentBonus.saveDC) warpMods.saveDC = (Number(warpMods.saveDC) || 0) + reagentBonus.saveDC;
  if (reagentBonus.reliefBump) warpMods.reliefBump = (Number(warpMods.reliefBump) || 0) + reagentBonus.reliefBump;

  // ALWAYS DEFENSIVE, AT A DECLARED PRICE (3.627.0) — Faultless Casting.
  // Every cast, the innate and item ones included: "All spells you cast".
  const { declaredDefensiveCasting } = await import("./defensive-casting.mjs");
  const declaredDefensive = declaredDefensiveCasting(declarationCarriers(actor));
  const defensive = Boolean(conditions.defensive) || Boolean(declaredDefensive);
  const extraTimeBonus = extraCastingTimeBonus(conditions.extraIncrements);
  /*
   * `extraApSpent` LIVED HERE and was removed at 3.592.0. It was the
   * lump the final spend used to add; the window now pays the same AP
   * down a turn at a time, and `extraApOwed` in magic/pending-cast.mjs
   * is the one place that says what the time costs. Two places computing
   * one cost is how it came to be charged twice.
   */
  // Bardic Performance's Perform-for-Spellcraft substitution — only
  // ever true when promptCastingConditions actually offered the
  // tickbox (composition trait + a use available), so no further
  // eligibility check is needed here. Spent now, before the roll —
  // matching Crusader's Mercy's spend-before-roll convention — rather
  // than after, since the substitution is what was chosen regardless of
  // how the check turns out.
  const usePerform = Boolean(conditions.bardicPerform);
  // ───────────────────────────────────────────────────────────────────
  // SONG & DANCE, SEPARATED FROM THE SPELLCRAFT BONUS (3.443.3, reshaped
  // at 3.444.0 by Graham's ruling: "with Song and Dance the bonus needs to
  // be applied to the attack bonus and Save DC").
  //
  // TWO NUMBERS, because the class bonus has to be ADDED rather than
  // merely carried. `spellcraftForCast` is the Spellcraft bonus with Song
  // & Dance taken out, and every DC and attack derived from Spellcraft is
  // built from it; `songAndDanceForCast` is the bonus itself, added back
  // once, by name, where the ruling says it belongs.
  //
  // WHY NOT JUST LEAVE IT IN THE TOTAL. Because the Specialist formulas
  // are `max(ability + level, spellcraft)` — a MAX, not a sum. With the
  // bonus inside the Spellcraft half it applied when that half won and
  // vanished when the ability+level half won. It was never added to the
  // Bard's numbers; it was one of two candidates to replace them.
  //
  // THE AMOUNT IS THE DIFFERENCE BETWEEN THE RESOLVER'S TWO ANSWERS, not
  // the raw class bonus. The actor resolves the Spellcraft pool twice —
  // once whole, once with Song & Dance filtered out — so subtracting one
  // from the other gives what it actually CONTRIBUTED after stacking,
  // whatever Appendix 1's table says about the class type.
  //
  // ZERO ON A BARDIC PERFORMANCE CAST: "if you are using Bardic
  // Performance the Class bonus does not apply." The CHECK already loses
  // it there, because the modifier list is swapped wholesale for a single
  // Perform entry; this is what makes the DCs and the attack agree with
  // the check instead of quietly keeping it. Measured at 3.443.2: a Bardic
  // Performance cast of Cutting Words rolled Perform with no class bonus
  // and still set a Will save at DC 18.
  //
  // FALLS BACK TO THE WHOLE TOTAL, so an actor whose sheet was prepared
  // before `bardicPerformanceTotal` existed behaves exactly as it did —
  // a zero bonus and the old base — rather than losing its Spellcraft.
  const spellcraftWhole = Number(system.magic?.spellcraft?.total ?? 0);
  const spellcraftForCast = Number(
    system.magic?.spellcraft?.bardicPerformanceTotal ?? spellcraftWhole
  );
  //
  // "THIS ONLY APPLIES WHEN CASTING SPELLS USING SPELLCRAFT." Two casting
  // modes in this system do not use Spellcraft at all and are therefore
  // outside the grant: an INNATE spell-like, whose attack and save are
  // `ability + level` and which rolls no casting check, and an ITEM cast,
  // whose DC belongs to the scroll or the wand. A no-check CANTRIP is
  // NOT excluded — it is the Bard's own spell cast through their own
  // perform specialty, and a save DC that moved depending on whether the
  // caster happened to be penalised enough to roll would be absurd.
  const castWithSpellcraft = !usePerform && !isInnate && !isItemCast;
  const songAndDanceForCast = castWithSpellcraft
    ? Math.max(0, spellcraftWhole - spellcraftForCast)
    : 0;
  if (usePerform) {
    const performItem = bardicPerformanceItem(actor);
    const remaining = performItem ? itemUsesRemaining(performItem) : 0;
    if (performItem && remaining > 0) {
      await performItem.update({ "system.usesValue": remaining - 1 });
    }
  }

  // Situational casting penalties (Chapter 9), all circumstance modifiers.
  const situational = [];
  /*
   * BLEED AND RECURRING DAMAGE (3.583.0; the pages 231-240 audit's D7,
   * Graham's R8 of 22 September 2026).
   *
   * Page 238: "If you are taking recurring damage or bleed, the amount
   * of damage you are taking is applied as penalty to your casting
   * check." The only casting penalty on that page the system did not
   * apply — and the only one it never needed to ask about, because both
   * numbers are on the caster at the moment of the roll.
   *
   * READ, NOT ASKED. Every other entry in this list comes off the
   * dialog because only the table knows whether the boat is rough; these
   * two are facts about the character, and a checkbox for them would be
   * a question with one correct answer.
   */
  const bleeding = Math.max(0, Math.floor(Number(actor.getConditionValue?.("bleeding") ?? 0)));
  const recurring = Math.max(0, Math.floor(Number(actor.getConditionValue?.("recurring") ?? 0)));
  if (bleeding) situational.push({ label: `Bleeding ${bleeding}`, value: -bleeding, type: "circumstance" });
  if (recurring) situational.push({ label: `Recurring damage ${recurring}`, value: -recurring, type: "circumstance" });

  if (conditions.interference) situational.push({ label: "Magical interference", value: -2, type: "circumstance" });
  if (conditions.motion === "vigorous") situational.push({ label: "Vigorous motion", value: -2, type: "circumstance" });
  if (conditions.motion === "violent") situational.push({ label: "Violent motion", value: -5, type: "circumstance" });
  // Stormborn (Class, Chapter 5): "no circumstance penalties for ranged
  // spell attacks... caused by weather" — the entered weather penalty is
  // simply not applied for owners (the concealed-by-weather half rides
  // the avoidance card's GM note, like Blind Fight's).
  const stormborn = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "stormborn"
  );
  const weatherPenalty = Math.max(0, Math.min(10, Math.floor(Number(conditions.weather) || 0)));
  for (const used of reagentsUsed) {
    if (used.use.effect === "spellcraft") situational.push({ label: `${used.name} (reagent)`, value: used.use.value, type: "untyped" });
  }
  if (weatherPenalty && !stormborn) situational.push({ label: "Violent weather", value: -weatherPenalty, type: "circumstance" });
  if (weatherPenalty && stormborn) situational.push({ label: "Violent weather ignored (Stormborn)", value: 0, type: "circumstance" });
  // ACCURATE SPELL (Chapter 5): "when attacking a target in melee with a
  // spell, you ignore the +4 standard cover bonus that each target gains."
  // Its own second sentence draws the line — "this feat only ignores the
  // static penalty for firing into melee, it does not ignore any additional
  // bonuses that the target creature may gain from cover and concealment" —
  // so this waives exactly the flat penalty below and nothing else.
  if (isAttack && conditions.targetInMelee) {
    const accurate = accurateSpellWaivesMelee(
      Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
    );
    // A ZERO-VALUE ENTRY RATHER THAN SILENCE, exactly as Stormborn does
    // just above: the card should say the penalty was waived, not simply
    // not mention a number nobody expected to see.
    situational.push(accurate
      ? { label: "Target in melee ignored (Accurate Spell)", value: 0, type: "circumstance" }
      : { label: "Target in melee", value: -4, type: "circumstance" });
  }

  // Runemage archetype (Chapter 5): Symbol-component casting — "All
  // casting DCs are reduced by 1... All Defensive Casting DCs are
  // increased by 2" (the +1 save DC is applied where save DCs resolve;
  // the room-to-draw requirement stays a table call).
  // THE THREE BELOW ARE FACTS, NOT NUMBERS, and 3.386.0 changed them
  // from numbers deliberately. Their arithmetic is part of the rule, and
  // Runemage proves it: two sentences that interact to net +1 when
  // casting defensively rather than the -1 a reader expects. A harness
  // cannot drive arithmetic that was done before the call, so the
  // booleans go to `assembledCastingDC` and the sums live there.
  // ASKED IN ONE PLACE SINCE 3.546.0. This test was written out twice in
  // this file — here and at the save DC — and a third reader was needed
  // for the component gate. Three copies of a name comparison is three
  // chances to disagree about it.
  const runemage = isRunemage(Array.from(actor.items ?? [])
    .filter((i) => i.type === "feat" || i.type === "ability").map((i) => i.name));

  // Favoured Terrain (Class, Chapter 5): "the DC for all Spellcraft
  // checks made to cast verdant spells is reduced by 1 whilst in your
  // favoured terrain" — active while a Favoured Terrain choice-effect is
  // ENABLED (the player toggles it on entering/leaving the terrain).
  const favouredTerrainActive = /verdant/i.test(String(tradition ?? "")) &&
    Array.from(actor.appliedEffects ?? actor.effects ?? []).some(
      (e) => !e.disabled && e.getFlag?.("trg-prime", "favouredTerrainActive")
    );

  // Eloquence (Class, Chapter 5): "The DC for all Spellcraft checks made
  // to cast spells of your tradition is reduced by 1."
  const hasEloquence = Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "eloquence"
  );

  // Wizard School (Class, Chapter 3): "All spells of your chosen school
  // are easier to cast and reduce their Casting DC by 2." Matched
  // against the spell's own traits — every school's name doubles as a
  // spell trait in this pack's data (see wizard.mjs's header note).
  const wizardSchoolCasting = wizardSchoolCastingDCDelta(schoolsOf(actor), spellData.traits);

  // ASSEMBLED WHERE IT CAN BE CHECKED, AND WHERE IT EXPLAINS ITSELF.
  // This was one inline expression of nine terms, reachable by no
  // harness, and five of its nine never reached the card — see
  // casting-dc.mjs for what that cost. The parts come back labelled and
  // the subtitle is built from them, so a tenth contributor cannot be
  // added silently: the only way to move the DC is through `parts`, and
  // everything in `parts` is printed.
  const castingDCResult = assembledCastingDC({
    isCantrip,
    totalPP,
    casterLevel,
    armourPenalty,
    materialPenalty: Number(system.magic?.materialCastingDC ?? 0),
    // A declared defensive casting carries its own price; the core's +5 is then not added.
    defensive: defensive && !declaredDefensive,
    declaredDefensive,
    runemage,
    favouredTerrain: favouredTerrainActive,
    metamagicDelta: mm.dcDelta,
    eloquence: hasEloquence,
    wizardSchoolDelta: wizardSchoolCasting,
    reagentDelta: reagentBonus.castingDC
  });
  const dc = castingDCResult.dc;

  /*
   * THE WINDOW EXTRA CASTING TIME OPENS (3.584.0; page 237, R9 of the
   * pages 231-240 audit).
   *
   * HERE, AND NOT A LINE EARLIER OR LATER. Every question this cast asks
   * has been asked by now — targets, AP scale, warps, metamagic,
   * reagents, the conditions prompt — and the DC is computed. So the
   * cast can simply WAIT, and resume into code that knows nothing about
   * having waited. Arming any earlier would mean storing and replaying
   * the player's answers, which is a second copy of the cast's state
   * that has to agree with the first.
   *
   * Nothing below this point runs until the caster finishes standing
   * there, which is exactly what page 237 describes and what makes the
   * damage rule on page 238 reachable at all.
   */
  let forcedInterruption = null;
  if (!isItemCast && !isInnate && !noCheckCantrip && Number(conditions.extraIncrements) > 0 && extraInc) {
    const { awaitPendingCast } = await import("./pending-cast-workflow.mjs");
    const window_ = await awaitPendingCast(actor, {
      spell,
      increments: Number(conditions.extraIncrements),
      unit: extraInc.unit,
      size: extraInc.size,
      bonus: extraTimeBonus,
      // What the spell itself will still cost when they press Complete —
      // so the card can say it rather than letting a caster who spent
      // every point on the time discover it in a clamp warning.
      castAP: castTimeApCost(warpedCastAP),
      dc
    });
    // "No PPs are spent until the Spell is cast" — so stopping is free,
    // and there is nothing to unwind.
    if (window_.outcome === "stopped") return null;
    if (window_.outcome === "interrupted") forcedInterruption = window_;
  }

  // Bardic Performance: roll Perform instead of Spellcraft — and NOT the
  // ordinary Spellcraft modifier list, which is where Song & Dance's own
  // class bonus lives. Song & Dance's text excludes Bardic Performance
  // by name ("if you are using Bardic Performance the Class bonus does
  // not apply"), so swapping the whole list rather than adding a Perform
  // entry alongside it is the only reading that honours that sentence.
  const modifiers = usePerform
    ? bardicPerformSpellcraftModifiers(system.skills?.perform?.total)
    : [
      ...(system.magic?.spellcraft?.checkModifiers ?? [
        {
          label: "Spellcraft",
          value: Number(system.magic?.spellcraft?.total ?? 0),
          type: "untyped"
        }
      ])
    ];

  // CASTER FEATS (Chapter 5): "if you have gained spells from a second
  // tradition, your Spellcraft checks use the ability score of the NEW
  // tradition." Graham's ruling of 20 Aug 2026 reads that as per-spell:
  // each tradition's own ability for its own spells, so a wizard's granted
  // divinity spells roll off Wisdom while their arcane ones stay on
  // Intelligence.
  //
  // Applied as a NAMED SWAP rather than by rebuilding the Spellcraft
  // total, because the total carries BSB, Song & Dance, universal
  // modifiers and everything else — recomputing it here would have
  // quietly dropped all of them. The card shows both halves, which is
  // also the only way a player can check the rule was applied.
  // THE CLASS'S TRADITION, not the resolved one. Since 3.344.1 an
  // archetype writes `system.magic.tradition`, and reading it here made
  // every caster feat exclude the very tradition its own archetype
  // opened. See `classTradition`.
  const grantedForCast = grantedTraditions(
    Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name),
    Number(system.identity?.level ?? 0),
    classTradition(system.progression)
  );
  // A CASTER ARCHETYPE'S OWN CANTRIP ROLLS OFF ITS OWN TRADITION
  // (Graham's ruling, 20 August 2026), by exactly the mechanism the
  // granted traditions already use. Checked FIRST because it is the more
  // specific claim: this spell came from that feat, in that tradition,
  // and there is nothing to infer. A Cleric who takes Arcanist casts
  // their divinity spells off Wisdom and their arcane cantrips off
  // Intelligence, and the card shows the swap either way.
  // A FEAT SLOT'S SPELL DOES THE SAME. A Divine Knight casts their
  // divinity spell off Wisdom whatever the rest of the sheet says — the
  // defect this closes is that it was rolling off the schema's default
  // Intelligence, five points out on a Wis +4 / Int -1 character.
  const archetypeAbilitySwap = archetypeSpellcraftAbility(spell, system.magic?.castingAbility)
    ?? featSlotSpellcraftAbility(spell, system.magic?.castingAbility);
  const swapAbility = archetypeAbilitySwap
    ?? spellcraftAbilityFor(spellData.tradition, grantedForCast);
  if (swapAbility) {
    const ownAbility = String(system.magic?.castingAbility ?? "");
    const ownValue = Number(system.attributes?.[ownAbility]?.total ?? 0);
    const newValue = Number(system.attributes?.[swapAbility]?.total ?? 0);
    if (swapAbility !== ownAbility && ownValue !== newValue) {
      const title = (k) => (k ? k.charAt(0).toUpperCase() + k.slice(1) : k);
      modifiers.push({
        label: `${title(swapAbility)} instead of ${title(ownAbility)} — ` +
          `${archetypeAbilitySwap ? "archetype tradition" : "granted tradition"}`,
        value: newValue - ownValue,
        type: "untyped"
      });
    }
  }

  // Casting Focus (Chapter 9): +1 item with the focus in hand, -2 circumstance
  // when casting without it (a focus caster who has lost/can't use their focus).
  const focusMod = focusCheckModifier(system.magic);
  if (focusMod) modifiers.push(focusMod);

  // Combat Casting (Chapter 5): "+2 class bonus to all attempts to
  // defensive cast" — applied automatically whenever Defensive Casting is
  // ticked and the feat is owned. (Its other half — halved persistent/bleed
  // penalties to casting — stays on the feat's note until those penalties
  // are modelled.)
  if (defensive && Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "combat casting"
  )) {
    modifiers.push({ label: "Combat Casting (defensive)", value: 2, type: "class" });
  }

  // Physician (Chapter 5): "+1 class bonus... to Spellcraft checks made
  // when casting a spell with the healing trait" (the Medicine +1 is a
  // passive slot bonus on the compendium entry).
  if (/\bhealing\b/i.test(String(spell.system?.traits ?? "")) &&
    Array.from(actor.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "physician"
    )) {
    modifiers.push({ label: "Physician (healing spell)", value: 1, type: "class" });
  }

  // Divinity-casting archetypes (Chapter 5): Blessed By the Gods and
  // Cloistered Priest each grant "+1 class bonus to all Spellcraft checks
  // made to cast Divinity spells" — class stacks, so both together are +2.
  if (/divinity/i.test(String(tradition ?? ""))) {
    for (const featName of ["blessed by the gods", "cloistered priest"]) {
      if (Array.from(actor.items ?? []).some(
        (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === featName
      )) {
        modifiers.push({
          label: `${featName === "cloistered priest" ? "Cloistered Priest" : "Blessed By the Gods"} (Divinity)`,
          value: 1,
          type: "class"
        });
      }
    }
  }

  if (extraTimeBonus) {
    modifiers.push({ label: `Extra casting time (+${extraTimeBonus})`, value: extraTimeBonus, type: "circumstance" });
  }
  for (const mod of situational) modifiers.push(mod);

  // WORD (Appendix 3): "all further spell and attack checks made during
  // your turn suffer a -4 penalty" — including the next Word spell's
  // own check, which the trait gate has already refused anyway.
  const wordPenalty = wordAftermathModifier(actor);
  if (wordPenalty) modifiers.push(wordPenalty);

  // THE ONE PLACE THE TWO CASTERS GENUINELY PART.
  //
  // A learned caster makes a Spellcraft check whose degree decides whether
  // the spell goes off and what it costs. An innate caster makes no such
  // check: the spell-like simply works. What an ATTACK-category innate
  // spell does roll is its attack — "Innate Attack Bonus = magical ability
  // score + level" — and that roll has to be a TRGCheck of type "attack",
  // because `resolveSpellAttack` reads `outcome.total` and `dice.unmodified`
  // off it to compare against the target's Defence Bonus. Rolling it here,
  // as `check`, is what lets the shared resolution below treat both callers
  // identically. The old innate path rolled almost this exact check and
  // then threw it away, which is why its card said "Awaiting Difficulty".
  // ONE SPELL'S OWN ABILITY (3.664.0): `castingAbilityOverride` on an innate
  // spell ("Wisdom is your magical ability score for this spell").
  const innateAbilityAttr = isInnate
    ? innateAbilityKey(spell, system.magic?.castingAbility, system.attributes ?? {})
    : system.magic?.castingAbility;
  // THE ABILITY THIS CAST IS MADE WITH (3.666.1): the innate spell's own, or
  // the Spellcraft swap above, or the sheet's. A damage row that adds "your
  // magical ability score" (Hurling) adds this one.
  const castAbilityKey = String((isInnate ? innateAbilityAttr : (swapAbility ?? system.magic?.castingAbility)) ?? "");
  const innateAbility = Number(
    system.attributes?.[innateAbilityAttr]?.total ??
      system.magic?.castingAbilityScore ??
      0
  );
  // THE PRINTED PAIR WINS (3.633.0, F&F 3.0 R1): a stat block's "DC 24
  // (+14)" declared on the spell is the creature's own number.
  // …UNLESS A STRIKE CARRIES IT (3.656.0; block 23 R6, Air Blast Magic: "uses
  // the primals attack bonus rather than innate bonus").
  // A SPELL'S OWN ATTACK AND DC BONUS (3.671.0). See magic/spell-own-bonus.mjs.
  const ownBonus = spellOwnBonus(spell);
  const innateAttackHere = Number.isFinite(carried?.attackBonus)
    ? { value: carried.attackBonus, printed: false, from: String(carried.label ?? "the strike") }
    : innateAttackFor(spell, innateAbility, innateLevel);
  // AN ITEM'S ATTACK IS THE USER'S, AND IT IS THE ROLL THEY ALREADY MADE.
  //
  // Until 3.312.0 this rolled a flat `+PP` — the item's own level as an
  // attack bonus — reasoning by analogy with the innate pair, where attack
  // is `ability + level` and save is `10 + ability + level`. Graham settled
  // it the other way on 14 Aug 2026 ("The user's own spell attack value"),
  // and then settled how: "Yes — the release check is the attack."
  //
  // That is not a special case, it is the ordinary one. For a normal caster
  // there is no separate attack roll at all — `resolveSpellAttack` takes the
  // Cast a Spell check and compares ITS total against the target's Defence
  // Bonus. A caster's spell attack has always been their casting roll. So a
  // wand or a scroll releases through the check made to release it, and a
  // rogue who barely reads the page aims it about as well as they read it.
  //
  // `itemCheck` is that roll, handed in by whoever did the releasing. The
  // fallback below is for an item that needs no check to use — a potion, if
  // one ever carries an attack spell (none of the shipped ones do). It rolls
  // the user's own Spellcraft, which is the same number an ordinary cast of
  // an attack spell would put on the table.
  // A NO-CHECK CANTRIP ROLLS NOTHING. Null here rather than a suppressed
  // roll, because there is no check to suppress — the same shape an
  // innate non-attack cast already uses further down this expression.
  /*
   * A RITUAL'S CHECK IS THE CAST'S CHECK (fixed 3.585.1).
   *
   * Page 243: "The final result is determined as a normal Spell Casting
   * Check (see page 240), except that the maximum result is a success."
   * ONE check, already rolled — with the secondaries' modifiers and the
   * Ritual Mods table in it, and already capped.
   *
   * R6 hooked the cast up and let it roll again. FOUND LIVE: the table
   * saw two Spellcraft checks for one ritual, and the second card
   * announced "Heroic" while the outcome quietly used the ritual's
   * capped Success — a card contradicting the result beside it. And
   * because a spell attack in this system IS the casting roll, the
   * attack was being aimed by the wrong one of the two.
   *
   * Handed in the way an item cast hands in the roll that released it.
   */
  /*
   * A SPELL DRAIN WAITING ON THIS CASTER (3.608.0, R6). Another creature
   * reacted to this casting from its own sheet — Graham's Cutting Words
   * road — and its rung waits here. A penalty joins the check now; a
   * forced degree overrides the dice below, beside page 238's
   * interruption; the PP go to the drainer once the cost is known. See
   * magic/spell-drain.mjs.
   */
  const { pendingSpellDrain, settleSpellDrain } = await import("./spell-drain-workflow.mjs");
  const drain = pendingSpellDrain(actor);
  if (drain?.penalty) {
    modifiers.push({
      label: drain.drainerName ? `${drain.label} (${drain.drainerName})` : drain.label,
      value: drain.penalty,
      type: "untyped"
    });
  }
  /*
   * A MODULE'S ANSWER TO THIS CASTING (3.672.0; C5a) — Inner Tempest's
   * Spiritual Distraction rolls its save here and hands back the penalty.
   * Asked at the drain's moment and for the drain's reason: before the
   * check, so a row can change a degree. Its rows reach every form the
   * casting's roll takes (an innate or item attack included); its lines
   * join the card. See magic/spell-check-gates.mjs.
   */
  const { runSpellCheckGates } = await import("./spell-check-gates.mjs");
  const gated = await runSpellCheckGates({
    actor, spell, spellData,
    innate: isInnate, itemCast: isItemCast, attack: isAttack,
    // WHETHER A CHECK IS ROLLED BELOW, by the branch that will run (review):
    // none for a no-check cantrip, a ritual (rolled already), an item's spell
    // whose release check was handed in, or an innate or item spell that is
    // not an attack. A gate's penalty reaches only a check rolled here.
    rollsCheck: !noCheckCantrip && !ritual?.check && (isItemCast ? (isAttack && !itemCheck) : isInnate ? isAttack : true)
  });
  modifiers.push(...gated.modifiers);
  const gateLines = gated.lines.map((text) => line(text));
  /*
   * THE ROD OF ACCURACY (3.616.0, Graham's R14 of block 36): "expend 1 PP
   * from the rod to gain a +1-item bonus to the attack check portion of the
   * spell check or 2 PP to gain a +2." Asked before the roll, as an
   * activation is, and only of an attack spell — the bonus is to the attack
   * comparison against Defence, not to the Casting DC.
   */
  let accuracyPP = 0;
  const { accuracyRodOf, accuracyRow } = await import("../rod-powers.mjs");
  // A ROD IS ONCE A ROUND, AND NOT WITH A SCROLL, STAFF OR WAND (3.622.0;
  // Graham's R11 of block 39) — see trait-rules.mjs.
  const { rodUseRefusal, stampRodUse } = await import("../trait-rules-workflow.mjs");
  const accuracyRod = isAttack && !noCheckCantrip && !rodUseRefusal(actor, { fromItemCast: isItemCast })
    ? accuracyRodOf(Array.from(actor.items ?? [])) : null;
  if (accuracyRod) {
    const picked = await DialogV2.wait({
      window: { title: `${spell.name} — ${accuracyRod.name}` },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p><strong>${accuracyRod.name}</strong> holds ${accuracyRod.uses} PP. `
        + `Spend from it for an item bonus to ${spell.name}'s attack?</p></div>`,
      buttons: [
        { action: "0", label: "No", default: true },
        ...Array.from({ length: accuracyRod.maxPP }, (_, i) => ({ action: String(i + 1), label: `${i + 1} PP: +${i + 1}` }))
      ],
      rejectClose: false
    });
    accuracyPP = Math.max(0, Math.min(accuracyRod.maxPP, Math.floor(Number(picked) || 0)));
    if (accuracyPP > 0) await stampRodUse(actor, actor.items?.get?.(accuracyRod.itemId) ?? null);
  }
  const accuracyAttackRow = accuracyRod ? accuracyRow(accuracyRod, accuracyPP) : null;

  // "ALL ATTACKS AGAINST YOU GAIN ADVANTAGE IF YOU CANNOT MOVE" (3.621.0;
  // Appendix 2, block 39's R7). A spell attack's roll is this check, so the
  // advantage is handed in here, against the first target, as the starting
  // bias — a disadvantage from anywhere else still cancels it.
  if (isAttack && !noCheckCantrip) {
    const firstTarget = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
    const { attackTermsAgainst } = await import("../conditions/condition-events-workflow.mjs");
    if (firstTarget && attackTermsAgainst(firstTarget, actor).advantage) castContext.bias = "advantage";
  }

  // THE DEFENDERS' REACTIONS, BEFORE THE ATTACK IS ROLLED (3.666.1). A spell
  // attack's roll is this check, so each marked target's player is asked
  // here, before it — Nimble Dodge's "+2 against the triggering attack" was
  // otherwise only ever declared after the number was on the table. See
  // combat/defence-offer.mjs.
  if (isAttack) {
    const { offerDefences } = await import("../combat/defence-offer-workflow.mjs");
    for (const defender of new Set(Array.from(game.user?.targets ?? []).map((t) => t.actor).filter(Boolean))) {
      await offerDefences(actor, defender, { kind: "spell", what: spell.name });
    }
  }

  const check = noCheckCantrip
    ? null
    : ritual?.check
    ? ritual.check
    : isItemCast
    ? (isAttack
      ? (itemCheck ?? await TRGCheck.roll({
        actor,
        label: `${spell.name} — Item Attack`,
        subtitle: `${itemCast.itemName ? `${itemCast.itemName} — ` : ""}released from an item at ${itemCast.pp ?? 0} PP${tradition ? `, ${tradition}` : ""}. Your own Spellcraft — the item aims nothing for you`,
        type: "spellcraft",
        ...castContext,
        suppressDegree: true,
        modifiers: [...(system.magic?.spellcraft?.checkModifiers ?? [
          { label: "Spellcraft", value: Number(system.magic?.spellcraft?.total ?? 0), type: "untyped" }
        ]), ...gated.modifiers]
      }))
      : null)
    : isInnate
      ? (isAttack
        ? await TRGCheck.roll({
          actor,
          label: `${spell.name} — Innate Attack`,
          // AN INNATE SPELL'S ATTACK, BY NAME (3.669.0), for a conditional
          // scoped to innate spells (Inner Tempest's Elemental Attunement).
          actionKey: "innateSpellAttack",
          subtitle: `Innate spell-like — 0 PP, cast at ${innateLevelWord} with up to ${innateBudget} PP of free warping${tradition ? `, ${tradition}` : ""}. Innate attack +${innateAttackHere.value} (${innateAttackHere.from ? `${innateAttackHere.from}'s attack bonus` : innateAttackHere.printed ? "printed" : "magical ability + level"})`,
          type: "attack",
          ...castContext,
          // NO DEGREE BANNER. This roll has no DC of its own — the comparison
          // that matters happens below, in resolveSpellAttack, against the
          // target's Defence Bonus, and is printed on the Result card as
          // "Hit vs X — attack N vs DB M". Without this the card showed
          // "Awaiting Difficulty — Compare the total against the GM's DC" and
          // offered a Set DC box, inviting the GM to supply a number that
          // changes nothing. Graham flagged exactly that string in the 13 Aug
          // 2026 playtest. Same treatment initiative already gets, and for the
          // same reason.
          suppressDegree: true,
          modifiers: [
            {
              label: innateAttackHere.from ? `${innateAttackHere.from}'s attack bonus` : innateAttackHere.printed ? "Innate Attack (printed)" : "Innate Attack",
              value: innateAttackHere.value,
              type: "untyped"
            },
            // THE SPELL'S OWN BONUS (3.671.0; Lotus Enchanter, Onmyoji
            // Necromancer). See magic/spell-own-bonus.mjs.
            ...(ownBonus?.attack && !isItemCast ? [{ label: ownBonus.label, value: ownBonus.attack, type: ownBonus.type }] : []),
            // A MODULE'S ANSWER (3.672.0): this roll is the casting's check.
            ...gated.modifiers
          ]
        })
        : null)
    : await TRGCheck.roll({
      actor,
      label: `${spell.name} — Cast a Spell`,
      subtitle:
      `${tradition ? `${tradition} — ` : ""}${totalPP} PP${warpPP || metamagicPP ? ` (${basePP} base${warpPP ? ` + ${warpPP} warp` : ""}${metamagicPP ? ` + ${metamagicPP} metamagic` : ""})` : ""}, Casting DC ${dc}` +
      // EVERY CONTRIBUTOR, FROM THE ASSEMBLY ITSELF. This used to be a
      // hand-written list beside the sum, and the two disagreed: overcast,
      // armour and Defensive Casting were named while Runemage, Favoured
      // Terrain, Metamagic, Eloquence and Wizard School moved the number
      // in silence. Building the sentence from `parts` is what makes that
      // class of drift impossible rather than merely fixed.
      describeParts(castingDCResult.parts) +
      (focusMod ? (focusMod.value > 0 ? " (Focus +1)" : " (no focus -2)") : "") +
      (extraTimeBonus ? ` (extra time +${extraTimeBonus})` : "") +
      (situational.length ? ` (situational ${situational.reduce((sum, m) => sum + m.value, 0)})` : "") +
      (isSpecialist ? " (Specialist Spell — Very Easy)" : ""),
      type: "spellcraft",
      ...castContext,
      dc,
      difficulty: isSpecialist ? SPECIALIST_DIFFICULTY : undefined,
      modifiers: [...modifiers]
    });

  // An innate spell-like has no casting check to succeed or fail at, so it
  // is settled as a plain success. `chaos` follows the same logic: there is
  // no Spellcraft roll for a chaos result to appear on. An innate ATTACK
  // spell's roll is an attack roll, not a casting roll — a fumble on it is
  // the attack missing (attackOutcome's natural 1), not a spell fumble, so
  // it must not be read as a casting degree here.
  // A no-check cantrip is settled the same way an innate cast is: there
  // was no roll to succeed or fail at, so it is a plain success. Both
  // read `check` defensively because for both it is null.
  let degree = (isInnate || noCheckCantrip) ? "success" : (check?.outcome?.degree?.key ?? "partial");
  /*
   * A RITUAL'S DEGREE WAS DECIDED BY THE RITUAL (3.585.0, page 243).
   * "The final result is determined as a normal Spell Casting Check
   * (see page 240), except that the maximum result is a success" — that
   * check has already been rolled, with the secondaries' modifiers and
   * the Ritual Mods table applied and `capRitualDegree` run on it. This
   * cast is its consequence, not a second attempt at it.
   */
  if (ritual) degree = String(ritual.degree ?? degree);
  /*
   * AND PAGE 238 OVERRIDES THE DICE. "If you are struck for hit point
   * damage whilst casting a spell, your spell casting check is
   * automatically a failure. If you are struck for a critical … a
   * fumble." The roll still happens and is still shown — the table
   * should see what the caster would have made of it — but the outcome
   * is the page's, not the die's.
   */
  if (forcedInterruption) {
    degree = interruptedDegree(forcedInterruption.criticalSeverity);
  }
  // AND A DRAIN OVERRIDES THEM TOO — never to a better degree than rolled.
  if (drain?.forced) {
    const { drainedDegree } = await import("./spell-drain.mjs");
    degree = drainedDegree(drain, degree);
  }
  // DEAFENED AND GRABBED (3.621.0; Appendix 2, block 39's R7). Casting an
  // Auditory spell while Deafened, or a Manipulate one while Grabbed, owes a
  // DC 5 flat check, "or the action is lost". Lost, the cast resolves as a
  // failure: whatever a failure costs is paid, and nothing lands.
  if (!ritual) {
    const { passActionFlatChecks } = await import("../conditions/condition-events-workflow.mjs");
    if (!(await passActionFlatChecks(actor, { name: spell.name, traits: spellData.traits ?? "" }))) degree = "failure";
  }
  const chaos = (isInnate || noCheckCantrip) ? false : Boolean(check?.dice?.chaos);

  // Variable Success (Chapter 5 metamagic, BSB +8): "When you get a
  // partial result whilst casting a spell, you may expend an amount of
  // PP equal to the base cost of the spell to change the result to a
  // success." Offered post-roll, before the outcome is settled.
  let variableSuccessPP = 0;
  if (degree === "partial" && !isCantrip &&
    Array.from(actor.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "variable success"
    ) && ppPool >= totalPP + basePP) {
    const upgrade = await DialogV2.confirm({
      window: { title: "Variable Success" },
      content: `<p><strong>Partial result.</strong> Spend ${basePP} more PP to make it a <strong>Success</strong>?</p>`,
      rejectClose: false
    });
    if (upgrade) {
      degree = "success";
      variableSuccessPP = basePP;
    }
  }

  // WARP MANIPULATION (Chapter 5, Adept/Metamagic): "Requirements You have
  // successfully cast a spell and exceeded the casting DC by a minimum of
  // 2. Action Free. After successfully casting a spell, you may add a
  // warping option of up to 2 PP… If the result is a Critical, you may add
  // a warping option of up to 4. This replaces the usual benefit of a
  // Critical."
  //
  // HERE, AFTER THE CHECK AND BEFORE THE EFFECTS. Graham's ruling, 21 Aug
  // 2026. The margin is known by this line and nothing has been applied
  // yet, so every warping option still works exactly as one chosen up
  // front; offering it after the spell had resolved would mean undoing
  // damage already dealt and effects already applied, then redoing them —
  // two passes over one question, which is the shape this project has been
  // burned by before.
  let manipulationPP = 0;
  let waiveCritical = false;
  {
    const offer = warpManipulationOffer({
      degree,
      margin: check?.outcome?.margin ?? 0,
      featNames: Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat").map((i) => i.name)
    });
    if (offer.allowance > 0 && !isCantrip && !isItemCast) {
      const extra = await promptWarpManipulation(warpSpell, basePP, offer, casterLevel);
      if (extra) {
        // WHICH FIELD IS BUDGETED lives in `warpManipulationSpend`, not
        // here — see its own note for the 3.359.1 defect that put it
        // there. A decision made inside this function is a decision no
        // harness can drive, which is how reading the manual box instead
        // of the total survived to a live table in the first place.
        const fit = warpManipulationSpend(extra, offer.allowance);
        if (!fit.ok) {
          ui.notifications.warn(
            `${spell.name}: ${fit.spent} PP of extra warping chosen, ${fit.over} more than Warp Manipulation's ${fit.budget}.`
          );
        } else if (fit.applies) {
          warp = mergeWarpSelections(warp, extra);
          manipulationPP = fit.spent;
          waiveCritical = offer.waivesCritical;
          warp.notes.push(
            `Warp Manipulation: ${fit.spent} of ${fit.budget} PP added after the check`
            + (waiveCritical ? " (the Critical's halved base is given up for it)" : "")
          );
        }
      }
    }
  }

  /*
   * THE OPTIONAL HARDER SAVE DC (3.583.0; page 237, Graham's R14:
   * "World Setting"). Off unless the world turns it on.
   *
   * BOTH HALVES OR NEITHER. The paragraph that raises the DC ends "if
   * you apply this result, you do not save any PP" — so the setting
   * cannot raise the DC and leave the saving in place. `waiveSaving`
   * carries the second half to `castingOutcome` and `harderSaveDCStep`
   * the first to the save below, from the same boolean.
   */
  const harderSaveRule = Boolean(globalThis.game?.settings?.get?.("trg-prime", "harderSaveDCOnCritical"));
  const harderSaveDCStep = harderSaveRule ? harderSaveStep(degree) : 0;

  const outcome = castingOutcome(degree, {
    basePP,
    warpPP: warpPP + metamagicPP + manipulationPP,
    waiveCritical,
    waiveSaving: harderSaveRule && harderSaveDCStep > 0
  });
  // A CAST, FOR WHOEVER LISTENS (3.631.0): Alien Mind ("targeted with a
  // mental effect") and Reflective Scales ("targeted with a spell") answer
  // from the target's side — codex-hooks-workflow.mjs.
  Hooks.callAll("trgPrimeSpellCast", {
    actor, spell, spellData, degree,
    targets: Array.from(game.user?.targets ?? []).map((t) => t?.actor).filter(Boolean)
  });

  // A SPELL ADDER PAYS THE WHOLE COST, including a failed cast's partial
  // loss — the use was spent to cast this spell, and charging PP on top
  // of it would take payment twice for one casting.
  const ppSpent = (isCantrip || spellAdderUsed)
    ? 0
    : Math.min(outcome.ppSpent + variableSuccessPP, ppPool + rodDraw);
  // THE ROD PAYS ITS SHARE (3.616.0, R13): what was drawn, up to the spend.
  // The rest is the caster's, below; the rod's is deducted with the other
  // rod spends once the cast is settled.
  const { rodDrawSplit } = await import("../rod-powers.mjs");
  rodPaid = rodDraw > 0 ? rodDrawSplit(ppSpent, rodDraw).rod : 0;
  const casterPPSpent = ppSpent - rodPaid;
  /*
   * A RELEASED STORED SPELL SETTLES RATHER THAN PAYS. (3.495.0)
   *
   * Storage took `totalPP` — what a Success costs — because the price
   * depends on a degree that had not been rolled. Now it has, so the
   * difference moves: a Heroic hands half back, a Partial hands it all
   * back, a Fumble keeps what it already took. The caster ends up having
   * paid exactly what the degree says, which is the whole point of
   * settling rather than charging twice or not at all.
   *
   * `ppPool` IS READ FRESH FOR THE REFUND, not reused from the top of
   * the cast: the storage debit happened a round ago and the pool has
   * moved. Reusing the stale figure is how a refund invents points.
   */
  if (stored) {
    const settle = storedSettlement(stored.ppPaid, ppSpent);
    if (settle.owed !== 0) {
      const poolNow = Number(actor.system?.resources?.pp?.value ?? 0);
      const ppMax = Number(actor.system?.resources?.pp?.max ?? 0);
      await actor.update({
        "system.resources.pp.value": Math.max(0, Math.min(ppMax, poolNow - settle.owed))
      });
    }
  } else if (casterPPSpent) {
    await actor.update({
      "system.resources.pp.value": Math.max(0, ppPool - casterPPSpent)
    });
  }


  // SPONTANEOUS SCHOLAR'S ALLOWANCE IS SPENT HERE, at the point the cast
  // has actually happened — not where the gate was waived, several
  // dialogs earlier. Everything between the two can still bow out (a
  // cancelled target, too little PP), and a day's allowance burnt on a
  // spell nobody cast is the same defect the Attack of Opportunity refund
  // and Born to Ride's marker both exist to prevent.
  //
  // IT COSTS THE ALLOWANCE, NOT THE PP. The feat lets a Wizard cast
  // something they did not prepare; it does not make it free, and the
  // ppSpent above is charged exactly as it would have been.
  if (spontaneousSpent) {
    const used = Number(actor.getFlag?.(SYSTEM_ID, "spontaneousScholarUsed") ?? 0);
    await actor.setFlag(SYSTEM_ID, "spontaneousScholarUsed", used + 1);
  }

  // Material components (Chapter 9): a Component Pouch spends one use
  // per casting of a spell with a material component, per Graham
  // directly. Silent if the caster has none equipped — a pouch is a
  // convenience item, not a strict requirement to cast.
  // The pouch check honours a Component Savant swap: a spell whose material
  // component was swapped away consumes nothing; one swapped TO material does.
  let effectiveComponents = spellData.components ?? {};
  // Silent / Still Spell (Chapter 5 metamagic): the chosen component is
  // removed for this cast.
  for (const off of mm.componentsOff) {
    if (effectiveComponents[off]) {
      effectiveComponents = { ...effectiveComponents, [off]: false };
    }
  }
  if (componentSwap?.from && componentSwap?.to && effectiveComponents[componentSwap.from]) {
    effectiveComponents = {
      ...effectiveComponents,
      [componentSwap.from]: false,
      [componentSwap.to]: true
    };
  }
  // RUNEMAGE, LAST, so it replaces whatever the metamagic and the swap
  // left behind. This is also what stops a Runemage burning a pouch use
  // on a spell whose material component they no longer provide — the
  // consumption below reads this map.
  effectiveComponents = symbolComponents(effectiveComponents, runemage);
  // Innate spell-likes carry no components, so no pouch use is spent even if
  // the underlying spell entry happens to list one.
  //
  // AND AN ITEM CAST SPENDS NO POUCH EITHER, for the opposite reason: the
  // scroll's material component "will have been provided when the scroll was
  // created", so charging the reader's pouch for it would bill them twice for
  // something they already bought. `isItemCast` implies `isInnate` here, so
  // this one guard covers both — stated because the two reasons are different
  // and only one of them is "carries no components".
  if (!isInnate && effectiveComponents.material) {
    await consumeGearUse(actor, /\bmaterial component pouch\b/i);
  }
  if (componentSwap) {
    await actor.unsetFlag(SYSTEM_ID, "componentSwapNext");
  }

  // Quicken Spell (-1 AP, min 1) and Economic Spell (+1 AP) adjust the
  // cast's AP cost when it is a plain number.
  // `apScaleExtra` IS ALREADY IN `warpedCastAP` — it was folded into
  // `effCastAPWithScale` above — so adding it again here would charge
  // the extra actions twice.
  //
  // NULL MEANS OUTSIDE THE AP ECONOMY, and a Reaction spell must not be
  // pushed up to 1 AP by the floor below. It passes through as its own
  // label, which `parseApCost` reads as free exactly as it always has.
  /*
   * THE EXTRA CASTING TIME IS NOT CHARGED HERE ANY MORE (3.592.0).
   *
   * It used to be: `extraApSpent` went into this sum, and the whole cost
   * — the spell's own AP plus every extra increment — was taken in one
   * update after the window closed. Against a pool of three that meant
   * `spendActionPoints` clamped to zero and warned, while the pool
   * refilled on each turn the caster spent standing there. The cost was
   * arithmetic nobody paid.
   *
   * `pending-cast-workflow` now pays it down a turn at a time, at the
   * moment each turn's AP is granted, so by the time a caster presses
   * Complete the extra is already out of their pool. Adding it back here
   * would charge it twice.
   *
   * THE REFUND PATH BELOW THEREFORE RETURNS ONLY THIS, which is the
   * honest answer: a refunded spell gives back the actions it cost to
   * cast, not the turns the caster spent standing still for it. That
   * time passed whatever the spell did.
   */
  const totalCastAP = totalCastTime(warpedCastAP, { apDelta: mm.apDelta });
  // A READIED CAST WAS PAID FOR BY READY (3.645.0, F7): its 2 AP bought it.
  if (!apPaid) await spendActionCost(actor, totalCastAP, spell.name);

  /*
   * AND A SPELL COUNTS AS AN ATTACK (3.503.0). "…or attacks any
   * creature, EVEN WITH A SPELL, the spell ends."
   *
   * HERE RATHER THAN AT THE TOP: a cast refused for PP, AP, a component
   * or a cancelled picker never happened, and ending a ward on an
   * attack nobody made is a resource lost to a change of mind. By this
   * line the actions are spent and the cast is going ahead.
   *
   * `castEndsHiding` decides what counts — see magic/hide-from-animals.mjs
   * on why a spell that only forces a save is still an attack.
   */
  if (castEndsHiding(spellData)) {
    const { endHidingWards } = await import("./hide-from-animals-workflow.mjs");
    await endHidingWards(actor, "spell");
  }

  // COMPOSITION (3.622.0; Graham's R11 of block 39): "If you cast a new
  // composition spell, any ongoing effects from your previous composition
  // spell end immediately." At the same commitment point: the actions are
  // spent and the cast is going ahead.
  {
    const { endPreviousComposition } = await import("../trait-rules-workflow.mjs");
    const ended = await endPreviousComposition(actor, spell);
    if (ended.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card"><p style="margin:2px 0">${actor.name} begins ${spell.name}: `
          + `${ended.join(", ")} ends — only one Composition at a time.</p></div>`
      });
    }
  }

  await recordTraitUsage(actor, spellData);

  // Innate per-day uses are spent HERE, alongside the PP a learned caster
  // would be spending — after the cast is settled, before the card is built,
  // so the remaining count on the card is the count after this cast.
  if (innateTracked) {
    // SPENT FROM THE POOL OWNER (3.351.0). For all but four spells that
    // is the spell itself. The exceptions are the Wild Shape form spells,
    // which share the Druid's one allowance — spending each form's own
    // copy would have given a Druid with all four form feats five times
    // the shapeshifts the book allows, and the number on the card would
    // have agreed with itself the whole way.
    innateSpend = innateSpendUpdate(spell, spellData.usesValue, innateUsesMax);
    await innateSpend.item.update({ "system.usesValue": innateSpend.value });
  }
  // THE RODS PAY (3.616.0, R12 and R13), once the cast is settled — the
  // same point the caster's own PP are paid. See `spendFromRod`.
  const rodLines = [];
  {
    const { spendFromRod } = await import("../charged-items-workflow.mjs");
    for (const spend of mm.rodSpends ?? []) {
      const rodItem = actor.items?.get?.(spend.itemId);
      if (rodItem) rodLines.push(await spendFromRod(actor, rodItem, spend.pp));
    }
    if (rodDraw > 0 && rodSource) {
      const rodItem = actor.items?.get?.(rodSource.itemId);
      if (rodItem && rodPaid > 0) rodLines.push(await spendFromRod(actor, rodItem, rodPaid));
    }
    if (accuracyPP > 0 && accuracyRod) {
      const rodItem = actor.items?.get?.(accuracyRod.itemId);
      if (rodItem) rodLines.push(await spendFromRod(actor, rodItem, accuracyPP));
    }
  }
  // AND THE ITEM'S REST STARTS (3.616.0, R11): the effect's minute, then
  // the ten minutes it "cannot be activated" — stamped on the item, which
  // is what was activated.
  if (grantRest && grantSource) {
    await grantSource.update({
      [`flags.${SYSTEM_ID}.runeState.cooldown.${GRANT_COOLDOWN_KEY}`]: grantCooldownUntil(grantRest, Number(game.time?.worldTime ?? 0))
    });
  }

  // AND THE INNATE'S OWN CLOCK STARTS (3.651.0, R12).
  {
    const { INNATE_COOLDOWN_FLAG, innateCooldownSeconds, innateCooldownUntil } = await import("./innate-frequency.mjs");
    if (innateCooldownSeconds(spell) > 0) {
      await spell.update({ [`flags.${SYSTEM_ID}.${INNATE_COOLDOWN_FLAG}`]: innateCooldownUntil(spell, Number(game.time?.worldTime ?? 0)) });
    }
  }

  const lines = [...reagentLines, ...gateLines];
  for (const l of rodLines) lines.push(line(l));
  // THE DRAIN, SETTLED ONCE THE COST IS KNOWN: the PP this casting spent
  // go to the drainer, and the waiting record is spent either way.
  if (drain) {
    const settled = await settleSpellDrain(actor, drain, {
      rolledDegree: degree, ppSpent, castName: spell.name
    });
    lines.push(line(settled.line));
  }

  /*
   * THE TOUCH ON SOMEBODY WHO DOES NOT WANT IT (3.583.0; page 240,
   * Graham's R13). Rolled AFTER the cast succeeds and BEFORE the spell
   * resolves, which is the order the page describes: you cast, and then
   * you have to reach them.
   *
   * "IT DOESN'T CAUSE ANY DAMAGE, BUT IT TRIGGERS THE SPELL'S EFFECTS" —
   * so a hit is a hit and nothing more. No critical, no damage roll.
   * A miss stops the spell, and the PP is still spent: the casting
   * succeeded, the touch did not.
   */
  let touchMissed = false;
  if (outcome.cast && conditions.touchUnwilling) {
    const mark = Array.from(globalThis.game?.user?.targets ?? [])[0] ?? null;
    const defence = Number(mark?.actor?.system?.combat?.defence?.total ?? NaN);
    if (!mark || !Number.isFinite(defence)) {
      lines.push(line("<em>Unwilling touch — target a creature to roll against its Defence.</em>"));
    } else {
      const touch = await TRGCheck.roll({
        actor,
        label: `${spell.name} — Touch Attack`,
        subtitle: `Spellcraft against ${mark.name}'s Defence — page 240`,
        type: "attack",
        dc: defence,
        modifiers: [{ label: "Spellcraft", value: Number(actor.system?.magic?.spellcraft?.total ?? 0), type: "untyped" }]
      });
      const result = touchAttackOutcome(Number(touch?.total ?? 0), defence);
      touchMissed = !result.landed;
      lines.push(line(result.landed
        ? `<strong>The touch lands on ${mark.name}</strong> — no damage, but the spell takes hold (page 240).`
        : `<strong>The touch misses ${mark.name}</strong> by ${-result.by}. The spell is cast and does not reach them.`));
    }
  }


  // THE NO-CHECK CANTRIP SAYS SO, FIRST.
  //
  // This line sat up beside the degree at first and threw "Cannot access
  // 'lines' before initialization" on every cantrip — `lines` is declared
  // here, a hundred and sixty lines below where it was being pushed to.
  //
  // THE SAME MISTAKE IS ALREADY RECORDED IN THIS FILE, against
  // `tradition` near the top: "a `const` further into the same block put
  // that read inside the temporal dead zone — every non-cantrip cast
  // threw before it reached the warp chooser". Twice now, in one
  // function, for one reason: it is long enough that where a thing is
  // declared is not where you remember it being.
  if (noCheckCantrip) {
    lines.push(line(
      `<em>Cantrip cast — no check required, no PP spent (`
      + `${castTimeLabel(warpedCastAP)} spent).</em>`
    ));
  }

  // WHO THE GATE DROPPED. On the card, not only in the notification that
  // raised it — Graham's stated worry when he chose pruning over refusing was
  // that "the player might not read the note and think the goblin got charmed",
  // and a toast that scrolls away is exactly that failure. Pushed FIRST so it
  // sits above the save results it explains the absence from.
  const skippedText = kindSkippedText(kindSkipped);
  if (skippedText) lines.push(line(`<em>${esc(skippedText)}</em>`));
  // …and who a feat let through, for the same reason: a demon caught by
  // a spell gated at "undead" reads as a bug unless the card names it.
  const widenedText = areaWidenedText(kindWidened);
  if (widenedText) lines.push(line(`<em>${esc(widenedText)}</em>`));

  if (isItemCast) {
    // Not "auto-warped to the maximum": an item's spell was fixed at the
    // PP it was made at, and saying otherwise on the card would teach the
    // table the wrong rule about the thing in their hand.
    lines.push(
      line(
        `<strong>${itemCast.itemName ? `${itemCast.itemName} — ` : ""}released from an item</strong> — cast at the item's own ${itemCast.pp ?? casterLevel} PP, none of your own${tradition ? `, ${tradition}` : ""}.`
      )
    );
  } else if (isInnate) {
    lines.push(
      line(
        `<strong>Innate spell</strong> — 0 PP, cast at ${innateLevelWord}, warping free up to ${innateBudget} PP${tradition ? `, ${tradition}` : ""}.`
      )
    );
    if (innateTracked && innateSpend) {
      // THE SAME SPEND, NOT A SECOND ONE (3.352.1). This used to call
      //  again to build the line — and for a SHARED
      // pool that second call reads the owner's value, which the write
      // above has already decremented, so it decremented again and the
      // card said "2 / 4" over a pool holding 3.
      //
      // Only the shared pool exposed it: an ordinary innate spell is
      // asked about , a snapshot taken before the
      // cast, so the second call happened to agree. Found by driving a
      // Wyrm Shape cast live; the harness had driven the helper once and
      // never twice in sequence.
      const poolNote = innateSpend.shared ? ` (shared with <strong>${innateSpend.item.name}</strong>)` : "";
      lines.push(line(`Innate uses remaining today: <strong>${innateSpend.value} / ${innateUsesMax}</strong>${poolNote}.`));
    }
  }
  /*
   * THE HEADLINE IS REMEMBERED, NOT JUST PRINTED (3.481.0).
   *
   * It is written here, ~380 lines before the target picker can call the
   * cast off, and until 3.481.0 nothing revisited it — so a refunded
   * cast printed "The spell takes effect. 10 PP spent" directly above
   * its own refund line. Found by driving 3.480.0.
   *
   * The index is kept so the refund can REWRITE this one line rather
   * than append a correction under a sentence that still says the
   * opposite. Nothing splices `lines`, only pushes, so the index is
   * stable — and `headlineHtml` is kept beside it so the rewrite can
   * VERIFY it is changing the line it thinks it is.
   */
  const headlineFacts = { cast: outcome.cast, isInnate, ppSpent, degree, rodPaid, rodName: rodSource?.name ?? "" };
  let headlineHtml = line(castResultHeadline(headlineFacts));
  const headlineIndex = lines.length;
  lines.push(headlineHtml);

  if (defensive && (degree === "fumble" || degree === "blunder") && !castDerives.castNoProvoke) {
    lines.push(line("<strong>Defensive Casting still provokes</strong> on a fumble or blunder."));
  }
  // ARCADIAN CASTER: "does not provoke reactions" when casting — said on the
  // card, since a cast's provoke is adjudicated at the table from this line.
  if (castDerives.castNoProvoke) lines.push(line("<em>Arcadian Caster: this casting provokes no reactions.</em>"));
  if (castDerives.specialistAll) lines.push(line("<em>Arcadian Caster: cast as a Specialist spell.</em>"));

  /*
   * A FAILED CHECK THAT CLOSES THE DOOR FOR EVER (3.602.0, Graham's R6).
   *
   * Resurrection: "if the spell check fails, it cannot be attempted again on
   * the same target." HERE AND NOT IN THE EFFECT APPLIER, because the applier
   * runs only when the cast succeeds and this is the other branch — the one
   * place in the workflow where a failure has to be written down rather than
   * merely reported.
   *
   * THE TARGET IS THE ONE MARKED, since a failed cast never reaches the
   * targeting the effect framework does. A cast with nobody marked closes no
   * door, which is right: there was no target to fail on.
   */
  if (!outcome.cast) {
    const { spellFailureIsFinal, FAILED_FLAG, failureClosesLine } = await import("./resurrection.mjs");
    if (spellFailureIsFinal(spellData.effects)) {
      for (const token of Array.from(game.user?.targets ?? [])) {
        const doomed = token?.actor;
        if (!doomed) continue;
        await doomed.setFlag?.(SYSTEM_ID, FAILED_FLAG, {
          at: Number(game.time?.worldTime ?? 0), by: actor?.name ?? "", spell: spell.name
        }).catch(() => {});
        lines.push(line(failureClosesLine(doomed.name)));
      }
    }
  }

  // WHAT THE STORAGE TOOK AND WHAT THE DEGREE COST. Said on every
  // release, because the pool moved twice for one spell and a table that
  // cannot see both halves cannot check the arithmetic.
  if (stored) {
    lines.push(line(settlementLine(spell.name, stored.ppPaid, ppSpent)));
  }

  // Warping (Chapter 9): note which options were paid for; their quantifiable
  // mods (extra damage/bonus/Save DC/duration) fold into the resolution below.
  if (outcome.cast && warp.notes.length) {
    lines.push(line(`<em>Warped — ${warp.notes.join("; ")}.</em>`));
  }
  // THE CONJURE SPELLS' ONE OPTION BUYS A NUMBER, so the number is
  // stated rather than left as "+3 PP of warping" for the caster to add
  // up against a ceiling on a different page. Printed beside the warp
  // note rather than inside it, because it is the RESULT of the warping
  // and not another thing bought — and it is the only place the caster
  // level ceiling is applied on an item cast, where the chooser that
  // would have capped the purchase never ran.
  if (outcome.cast) {
    const conjuredNote = conjuredCreatureNote(warpMods, casterLevel);
    if (conjuredNote) lines.push(line(`<em>${conjuredNote}</em>`));
    // AND IT COUNTS AGAINST WHAT YOU CAN CONTROL (3.585.0, page 242).
    // Until now a conjured creature's level was a sentence on a card
    // and nothing else; summons never reported to the control cap, so
    // a caster could conjure without limit. Offered rather than taken:
    // the system places no token, so only the GM knows what arrived.
    const conjured = conjuredCreatureLevel(warpMods, casterLevel);
    if (conjured?.level > 0) {
      const { offerConjuredControl } = await import("./control-register-workflow.mjs");
      await offerConjuredControl(actor, conjured.level, spell.name);
    }
  }
  {
    // THE EXTRA ACTIONS GET THEIR OWN LINE, beside the warp note rather
    // than inside it: they were bought with AP and not PP, and a caster
    // reading "Warped —" over something no PP paid for would go looking
    // for the cost on their pool.
    const apLine = apScaleLine(spellData?.apScale, apScaleExtra);
    if (apLine) lines.push(line(apLine));
  }
  if (outcome.cast && mm.notes.length) {
    lines.push(line(`<em>Metamagic — ${mm.notes.join("; ")}.</em>`));
  }
  /*
   * THE SYMBOL, SAID OUT LOUD (3.546.0).
   *
   * A Runemage's card printed nothing to distinguish a Symbol cast from
   * an ordinary one, which is indistinguishable from the feat not
   * working — and for the components, it was not working. The words are
   * derived in runemage.mjs where a check can assert them, for the same
   * reason the banner label is.
   *
   * ROOM TO DRAW IS A TABLE CALL. Nothing here knows whether the caster
   * is in a grapple or a coffin, so the card states the requirement
   * rather than pretending to enforce it.
   */
  if (outcome.cast && effectiveComponents?.symbol) {
    lines.push(line(`<em>Components — ${componentWords(effectiveComponents).join(", ")}.</em>`));
    const room = symbolRoomLine(effectiveComponents);
    if (room) lines.push(line(room));
  }
  if (variableSuccessPP) {
    lines.push(line(`<em>Variable Success — ${variableSuccessPP} extra PP spent to turn the partial into a success.</em>`));
  }

  // Caster Level Modifications (Chapter 9): a cantrip auto-warps as caster
  // level rises — free extra damage dice, Save DC, and/or attack, no PP spent.
  // Resolved once here off the derived caster level so the Save DC line, the
  // attack roll, and its damage all see the same scaling.
  const clMods = outcome.cast
    ? applyCasterLevelMods(spellData.casterLevelMods, casterLevel)
    : { steps: 0, damageDice: "", saveDC: 0, attack: 0, applied: [] };

  // TWO NUMBERS, AND THEY ARE NOT THE SAME QUESTION.
  //
  //   `saveDC`        what THIS spell's targets roll against. Null when the
  //                   spell offers no save at all.
  //   `nominalSaveDC` the DC this spell HAS — computed whenever the cast
  //                   lands, save or no save — because a granted spell-like
  //                   may borrow it.
  //
  // FOUND LIVE AT 3.309.1. The two used to be one variable computed only
  // `if (spellData.defence)`, and Shape Of The Wyrm — a self-buff with no
  // save — therefore had no DC to hand on. Its breath weapon, whose printed
  // rule is "a DC equal to the DC of this spell", stored a fixed DC of 0 and
  // fell back to deriving its own: DC 19 where the 12-PP cast that granted it
  // was worth 30. The borrow existed and could never fire for the one spell
  // it was written for.
  // HOISTED (3.364.0), because three places needed it and two had already
  // written the expression out again. The specialist attack uplift below is
  // the third, and a third copy of "which score is the casting ability" is
  // three places for it to drift.
  const castingAbility = Number(
    system.attributes?.[isInnate
      ? innateAbilityKey(spell, system.magic?.castingAbility, system.attributes ?? {})
      : system.magic?.castingAbility]?.total ??
      system.magic?.castingAbilityScore ??
      0
  );
  let saveDC = null;
  let nominalSaveDC = null;
  if (outcome.cast) {

    // Heighten Spell (Chapter 5 metamagic): "treats the PP of the spell
    // for Saving Throw DC purposes as the maximum PP that you can cast."
    // HIGH MAGIC (3.633.0, F&F 3.0 R12) heightens for free.
    // …AND A SPELL CARRIED BY A STRIKE (3.655.0, block 22 R5: Pixie Bow
    // Casting, "Heightened automatically").
    const savePP = heightenedSavePP(totalPP, cap, highMagicHeightens(actor, mm.heightenSave || carried?.heighten === true));
    const innateSaveHere = isInnate ? innateSaveFor(spell, castingAbility, innateLevel) : null;
    // HARMONIZE (3.634.0, F&F 3.0 block 4 R10): companions' aid waiting for
    // this innate spell's save DC this round; spent by this cast.
    const harmonyRecord = isInnate ? actor.getFlag?.(SYSTEM_ID, HARMONIZE_FLAG) : null;
    const harmonyHere = harmonyTotal(harmonyRecord, {
      combatId: game.combat?.started ? game.combat.id : "", round: game.combat?.started ? Number(game.combat.round ?? 0) : 0,
      worldTime: Number(game.time?.worldTime ?? 0)
    });
    if (harmonyRecord && actor.unsetFlag) await actor.unsetFlag(SYSTEM_ID, HARMONIZE_FLAG);
    // "Innate Save = 10 + magical ability score + level" (Chapter 9) — a
    // creature's spell-like does not derive its DC from a PP cost it never
    // paid. This is the same number the old innate card printed; the change
    // is that it now reaches resolveSpellSave instead of being the last
    // thing the card said.
    const baseSaveDC = (isInnate
      ? innateSaveHere.value
      : isSpecialist
        ? specialistSaveDC(castingAbility, characterLevel, spellcraftForCast)
        : spellSaveDC({ pp: savePP, castingAbility }))
      // Page 237's optional rule, when the world has turned it on.
      + harderSaveDCStep
      // HIGH MAGIC: "All casting DCs are increased by 2" — not on a printed DC.
      + highMagicSaveStep(actor, { printed: innateSaveHere?.printed === true })
      + harmonyHere;
    // Runemage archetype (Chapter 5): "All Save DCs are increased by 1."
    // WAS `runemageSave > 0` AT THE CALL SITE BELOW, comparing a boolean
    // to a number — it happened to work, because `true > 0`. Kept as a
    // number here so the comparison it feeds is an honest one.
    const runemageSave = isRunemage(Array.from(actor.items ?? [])
      .filter((i) => i.type === "feat" || i.type === "ability").map((i) => i.name)) ? 1 : 0;
    // Wizard School (Class, Chapter 3): "All spells of your chosen
    // school are more difficult to resist and increase their Save DC by
    // 2." Same trait match as the Casting DC reduction above.
    const wizardSchoolSave = wizardSchoolSaveDCDelta(schoolsOf(actor), spellData.traits);
    // A FIXED DC OVERRIDES EVERY FORMULA ABOVE.
    //
    // Some granted spell-likes borrow their DC from the effect that granted
    // them rather than deriving one. The Wyrm's breath weapon is the first:
    // "Targets may make a basic reflex save to avoid damage with a DC equal to
    // the DC of this spell" — the Shape Of The Wyrm cast's own Save DC, which
    // is known when the form is applied and is not what 10 + ability + level
    // would produce. Stored on the granted item at that moment; honoured here.
    //
    // Nothing in the compendium sets it, so no existing spell's DC moves.
    //
    // A CONSUMABLE'S SPELL TAKES THE SAME ROUTE (3.310.0), for the same
    // reason: the DC belongs to the item, which has a PP and no caster, so
    // consumable-use-workflow computes it once (consumableSaveDC) and hands
    // it over rather than letting `10 + ability + level` read the stats of
    // whoever happened to open the bottle.
    const fixed = Number(spellData.fixedSaveDC ?? 0);
    // ASSEMBLED, for the reason the Casting DC is. Five terms were added
    // inline here and the card named one of them: Runemage's +1, the
    // Wizard School's +2 and the warp's own contribution all moved the
    // number a target rolls against without appearing anywhere.
    const { declaredSpellDCBonuses } = await import("./spell-dc-bonus.mjs");
    const saveDCResult = assembledSaveDC({
      fixedDC: fixed,
      baseDC: baseSaveDC,
      casterLevelWarp: clMods.saveDC,
      warpSaveDC: warpMods.saveDC,
      runemage: runemageSave === 1,
      wizardSchoolDelta: wizardSchoolSave,
      // ALL THREE BASES ABOVE ARE NOW SONG-FREE — the specialist one
      // because it is handed `spellcraftForCast`, the other two because
      // they never had a Spellcraft term — so this adds the class bonus
      // exactly once, and the card names it.
      songAndDance: songAndDanceForCast,
      // A caster's own declared bonus for this spell's traits (3.627.0) — not
      // on an item's spell, which is not "your own spellcasting".
      declaredBonuses: [...(isItemCast ? [] : declaredSpellDCBonuses(
        Array.from(actor.appliedEffects ?? actor.effects ?? []), spellData.traits, { innate: isInnate })),
        // THE CARRYING STRIKE'S CRITICAL (3.655.0, block 22 R5): "+1 per level of severity".
        ...(Number(carried?.dcBonus) > 0 ? [{ label: `${carried.label ?? "Carried"} (${carried.severity} critical)`, value: Number(carried.dcBonus) }] : []),
        // THE SPELL'S OWN DC BONUS (3.671.0; Lotus Enchanter). Not an item's cast.
        ...(spellOwnBonus(spell)?.dc && !isItemCast ? [{ label: spellOwnBonus(spell).label, value: spellOwnBonus(spell).dc, type: spellOwnBonus(spell).type }] : [])]
    });
    nominalSaveDC = saveDCResult.dc;
    // The card, and the number targets actually roll against, belong to a
    // spell that HAS a save. One copy of the figure either way.
    // THE CHOSEN MODE'S DEFENCE when it names one (3.609.1, the 3.609.0 live
    // test's F8). Mud to Rock's Reflex is printed on its mode; reading only
    // the spell left the DC unset, so no save was rolled and nothing landed.
    const castDefence = effDefence ?? spellData.defence;
    if (castDefence) {
      saveDC = nominalSaveDC;
      lines.push(
        line(
          // WHERE THE BASE CAME FROM, then every part that moved it. The
          // trailing clause used to be a hand-written "(includes +N
          // caster-level warp)" — one of five contributors, chosen by
          // hand, which is how the other four came to be silent.
          //
          // Heighten Spell is named separately because it does not ADD to
          // the DC: it rebuilds the base from a larger PP, so no reading
          // of the spell's printed cost explains the number without it.
          `Save: <strong>${castDefence}</strong> against DC <strong>${saveDC}</strong>${fixed > 0 ? (isItemCast ? ` (${esc(itemCast.saveDCSource || "the item's own")})` : " (set by the effect that granted this)") : isItemCast ? " (your own — you are the one casting it)" : isInnate ? (innateSaveHere?.printed ? " (as printed)" : " (10 + magical ability + level)") : isSpecialist ? " (Specialist — higher of ability+level or spellcraft)" : ""}${!fixed && !isInnate && savePP !== totalPP ? ` (Heighten Spell — as ${savePP} PP)` : ""}${!fixed && highMagicSaveStep(actor, { printed: innateSaveHere?.printed === true }) ? " (+2 High Magic)" : ""}${!fixed && harmonyHere ? ` (${harmonyHere > 0 ? "+" : ""}${harmonyHere} Harmonize)` : ""}${describeParts(saveDCResult.parts)}${spellDefersItsSave(spellData.effects) ? " — rolled later, not on casting" : ""}.`
        )
      );
    }
  }

  // Illusions (Chapter 9): a spell whose description says it can be disbelieved
  // surfaces its DC so affected creatures can use the Disbelieve Illusion action
  // (Will save or Sense Motive vs this DC) without the GM looking the number up.
  if (outcome.cast && /disbelieve/i.test(spellData.description || "")) {
    const abilityForDisbelief = castingAbility;
    // SONG & DANCE RIDES HERE TOO (3.444.0). This is a Save DC the Bard's
    // spell sets, built from the same two bases as the one above, so the
    // class bonus is added the same way. Added to the base rather than
    // routed through `assembledSaveDC` because this DC deliberately takes
    // none of that function's other terms — no warp, no Runemage, no
    // school — and pretending otherwise would be the larger change.
    const disbelieveDC = (isSpecialist
      ? specialistSaveDC(abilityForDisbelief, characterLevel, spellcraftForCast)
      : spellSaveDC({ pp: totalPP, castingAbility: abilityForDisbelief }))
      + songAndDanceForCast;
    lines.push(
      line(`<em>Illusion — an affected creature may attempt to <strong>disbelieve</strong> (Will save or Sense Motive vs DC <strong>${disbelieveDC}</strong>) via the Disbelieve Illusion action.</em>`)
    );
  }

  if (clMods.steps > 0) {
    const summary = describeCasterLevelMods(clMods);
    lines.push(
      line(`<em>Caster Level ${casterLevel} auto-warp: ${summary || "no numeric effect"}.</em>`)
    );
  }

  // Attack spells (Chapter 9): "your Cast a Spell check ... and your attack
  // roll are one and the same." A successfully-cast attack spell resolves the
  // same total against the target's DB — hit/miss/critical off the same tables
  // weapons use — then rolls and applies its damage. Built onto the cast card.
  // Area spells (Chapter 9): place a Region shape from the Area text and
  // gather the tokens caught inside, so an area save spell resolves against
  // everyone under the template rather than a single target.
  let areaTargets = null;
  // WHO A LADDER'S "REGARDLESS" DAMAGE REACHES BEYOND THE AREA (3.609.0,
  // R1 — Volcanic Inferno's "and those within 5 feet of the cylinder").
  // Null for every spell that declares no such reach.
  let regardlessActors = null;
  // TRUE ONCE THE CAST HAS BEEN CALLED OFF at the target picker. Read at
  // the end to decide both what the card says and whether the Region the
  // template drew is released — a refunded cast claims nothing.
  let castRefunded = false;
  // HOISTED so the active-spell registration further down can record a
  // live emanation's Region and radius (3.426.0). Everything about the
  // area is decided inside the block below; only the resulting shape is
  // needed later, and re-deriving it there would be a second answer to a
  // question already settled.
  /*
   * THE CAST'S OWN ID, MOVED UP HERE AT 3.604.0.
   *
   * It used to be declared beside the effect framework, four hundred lines
   * below. The inscribed runes need it at the moment the Region is drawn —
   * the ward hangs its bonus off `castId` so `removeEmanationEffectsFrom`
   * can find it again eight hours later — and reading it from up here was
   * the temporal-dead-zone mistake this file has now made twice: once on
   * `tradition` and the warp chooser, and once on this, caught by
   * `verify-use-before-declaration` before it reached a table.
   *
   * SAFE TO MOVE because it is a fresh random id and nothing between the
   * two points consumed it. One id for the whole cast, available from the
   * first thing the cast places.
   */
  const castId = foundry.utils.randomID();

  let placedArea = null;
  // A wall that would form through a creature (3.610.1): its notes are not printed.
  let wallDissipated = false;
  if (outcome.cast) {
    // THE AREA THIS CAST ACTUALLY HAS, warps included (3.445.0). Until now
    // a warp could not reach the area at all, so Dark Tendrils printed
    // "the area becomes a 15-foot cone" beside "30 ft line template
    // placed" and drew the line. The template, the card's own "Area:"
    // clause and the membership test below are all built from this one
    // string, so they cannot disagree with each other again.
    const warpedArea = warpedAreaText(effArea, warpMods);
    /*
     * A WALL IS PLACED, NOT DRAWN FROM THE CASTER (3.610.0, block 33's R9).
     * The nine wall spells print no Area: their size is on the `wall` row,
     * and the aim is the wall's own — anywhere in range, turned freely. The
     * placed wall answers the same questions a template does (who is in it,
     * where its Region is), so everything below reads it unchanged.
     */
    const wallSpec = normaliseWall((effEffects ?? []).find((e) => e?.kind === "wall") ?? null, warpMods);
    const areaConfig = wallSpec ? wallAreaConfig(wallSpec) : parseSpellArea(warpedArea, effRange);
    if (areaConfig) {
      // Range only governs placement when the area itself isn't drawn from the
      // range text (a few spells stash their area there).
      // A WALL HAS NO AREA TEXT AND IS ALWAYS PLACED IN RANGE (3.610.0).
      const rangeFeet = wallSpec ? parseRangeFeet(effRange) : warpedArea ? parseRangeFeet(effRange) : null;
      const { placeWall } = await import("./wall-spell-workflow.mjs");
      const placed = wallSpec
        ? await placeWall(wallSpec, actor, rangeFeet, spell.name)
        : await placeSpellTemplate(areaConfig, actor, rangeFeet, `${spell.name} Area`);
      placedArea = placed;
      // THE FORM IS KNOWN ONLY NOW (3.610.1): a Wall Of Fire or Ice ring is
      // described as a ring on every line below that names the area.
      if (wallSpec && placed?.form === "ring") Object.assign(areaConfig, wallAreaConfig(wallSpec, placed));
      if (placed) {
        // Friend/foe filtering (Chapter 9): an area affects everyone unless the
        // spell specifically targets allies or foes, judged by Foundry Token
        // Disposition relative to the caster's own token.
        // WARPS CAN CHANGE THE SIDE, NOT ONLY THE SHAPE (3.530.0). Aid's
        // "+3 PP: effect all allies in a 10-foot radius" is the one warp
        // in the pack that does; without this it would have buffed every
        // enemy standing near the target. Both places that ask this
        // question ask it through the same rule so they cannot disagree.
        const mode = warpedAreaTargeting(spellData.areaTargeting, warpMods);
        // ITS OWN TOKEN (3.622.3, R1): by actor id, a second copy found the first.
        const casterToken = activeToken(actor);
        const casterDisp = Number(casterToken?.document?.disposition ?? 1);
        // Line of Effect (Chapter 9): a solid barrier between the template's
        // origin and a token blocks the spell from reaching it — unless the
        // spell has the Breach trait, which ignores intervening walls.
        // PAGE 247'S "(B)", NOT A TRAIT NOBODY AUTHORS (3.585.0). This
        // read the traits line and no spell in the pack has ever carried
        // a Breach trait, so the whole rule was dead. See spellBreaches.
        const breach = spellBreaches(spellData);
        const origin = { x: placed.x, y: placed.y };
        /*
         * WHO THE SPELL REACHES — THE TEMPLATE, UNLESS A ROW SAYS WIDER
         * (3.488.0).
         *
         * Every area spell until Fools Riches had one radius doing both
         * jobs, so "inside the template" was the whole question. Fools
         * Riches prints a 5-foot burst and then says "any creature within
         * 20 feet OF THE AREA must make a Will saving throw" — the drawn
         * shape is the illusion, and the net is four times wider.
         *
         * IT REPLACES THE MEMBERSHIP TEST AND NOTHING ELSE. Disposition,
         * line of effect, the kind gate and the caster's choice all run
         * afterwards exactly as before, against whichever list this
         * produced — a wider net must not become a way around the three
         * filters that decide who a spell may legally touch.
         *
         * See magic/save-net.mjs for the ruling and why the template is
         * not simply widened instead.
         */
        const netFeet = declaredSaveNetFeet(spellData);
        const reached = netFeet === null
          ? tokensInTemplate(placed)
          : (canvas.tokens?.placeables ?? [])
            .filter((tok) => tok?.actor && feetFromPointToToken(origin, tok) <= netFeet);
        // A HOSTILE SPELL CENTRED ON ITS CASTER SPARES THE CASTER (3.611.1,
        // Graham's ruling of 2 October 2026 on the 3.611.0 drive's Q1, where
        // Waves Of Fatigue caught its own Wizard). A beneficial one, and any
        // area placed at range, still catch them. See magic/caster-in-area.mjs.
        const { areaSparesCaster } = await import("./caster-in-area.mjs");
        const sparesCaster = areaSparesCaster({
          centredOnCaster: !wallSpec && rangeFeet === null,
          defence: effDefence ?? spellData.defence,
          category: spellData.category
        });
        const disp = reached
          .filter((tok) => !(sparesCaster && casterToken && tok === casterToken))
          .filter((tok) => keepByDisposition(tok.document?.disposition ?? tok.disposition, casterDisp, mode));
        const blocked = breach ? [] : disp.filter((tok) => lineOfEffectBlocked(origin, tok.center));
        const blockedSet = new Set(blocked);
        const caught = disp
          .filter((tok) => !blockedSet.has(tok))
          .map((t) => t.actor)
          .filter(Boolean);
        // THE KIND GATE, FOR AN AREA (3.352.0). A gated area spell
        // could not be gated before its template existed, so it is
        // gated here against what the template actually caught — the
        // same rule, the same wording, the same widening by Alignment
        // Channel. Turn Undead's own note reads "Undead only"; without
        // this, a 30-foot emanation would have stunned the party.
        const kindFiltered = filterAreaByKind(actor, spellData, caught);
        areaTargets = kindFiltered.kept;
        // AND TRAIT IMMUNITY, against what the template caught (3.622.1, R1)
        // — a Mindless creature in a Fear's cloud is passed by and named.
        const { partitionTraitImmune } = await import("./spell-trait-immunity.mjs");
        const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
        // AN AREA REACHES BOTH OF AN ETTIN'S HEADS (3.647.0, R9): never "one target".
        const areaImmunity = partitionTraitImmune(areaTargets, spellData.traits ?? "", ownedCreatureTypeSystem, { targetCount: Infinity });
        areaTargets = areaImmunity.kept;
        /*
         * THE HEAT'S WIDER RING (3.609.0, R1). Measured from the same
         * origin as the template, out to the template's own size plus the
         * row's reach, through the same line-of-effect test the area used.
         * Not filtered by side: heat does not ask whose side you are on.
         */
        {
          const ladderRow = normaliseSaveLadder((effEffects ?? []).find((e) => String(e?.kind ?? "").toLowerCase() === "saveladder") ?? null);
          const reach = Number(ladderRow?.regardless?.reachFeet ?? 0);
          if (reach > 0 && Number(areaConfig?.distance) > 0) {
            regardlessActors = (canvas.tokens?.placeables ?? [])
              .filter((tok) => tok?.actor && feetFromPointToToken(origin, tok) <= Number(areaConfig.distance) + reach)
              .filter((tok) => breach || !lineOfEffectBlocked(origin, tok.center))
              .map((tok) => tok.actor);
          }
        }
        /*
         * AND THEN THE CASTER CHOOSES, IF THE SPELL SAYS THEY MAY (3.479.0).
         *
         * Missile Storm prints "YOU MAY TARGET each character in the
         * spells area of effect" — Graham's ruling of 3 September 2026:
         * the caster chooses who in the area is affected and who is not.
         * It is the only area spell in the pack that prints a choice, so
         * the field is opt-in and every other area is swept as before.
         *
         * IT SITS HERE, AFTER THE KIND GATE, ON PURPOSE. The picker must
         * offer what the spell can actually reach — a row for a creature
         * the gate already refused would invite the caster to choose
         * somebody who was never going to be hit, and then say so twice.
         * See magic/area-choice.mjs.
         */
        if (areaIsChosen(spellData) && areaTargets.length) {
          const { promptAreaChoice } = await import("./area-choice-workflow.mjs");
          const chosen = await promptAreaChoice(spell.name, areaTargets, actor.uuid || actor.id);
          /*
           * A CANCEL REFUNDS THE CAST — Graham's ruling, 3 September 2026,
           * after driving 3.479.1 showed the opposite.
           *
           * 3.479.0 treated a dismissed dialog as "no choice made" and
           * fell through to hitting everyone, the caster included: he took
           * 60 force from his own storm by pressing Cancel. That followed
           * `promptTargetSelection`'s convention for the tick DEFAULTS and
           * ignored the same function's convention for cancelling, which
           * is explicit — "false if the prompt was cancelled and the
           * action should not proceed."
           *
           * SO THE CAST IS CALLED OFF AND BOTH RESOURCES COME BACK. The
           * picker opens ~380 lines after the PP is written and ~320
           * after `spendActionCost`, so a refund that returned only the PP
           * would silently cost the player their turn. See
           * magic/area-region-life.mjs.
           */
          if (chosen === null) {
            castRefunded = true;
            const ppPoolNow = Number(actor.system?.resources?.pp?.value ?? 0);
            const ppMax = Number(actor.system?.resources?.pp?.max ?? 0);
            if (casterPPSpent > 0) {
              await actor.update({
                "system.resources.pp.value": refundedPool(ppPoolNow, casterPPSpent, ppMax)
              });
            }
            // THE ROD'S SHARE GOES BACK TO THE ROD (3.616.0, R13).
            if (rodPaid > 0 && rodSource) {
              const rodItem = actor.items?.get?.(rodSource.itemId);
              if (rodItem) await rodItem.update({ "system.uses": Number(rodItem.system?.uses ?? 0) + rodPaid });
            }
            if (totalCastAP > 0) await refundActionCost(actor, totalCastAP);
            lines.push(line(castRefundedLine(spell.name, ppSpent, totalCastAP)));
            areaTargets = [];
            /*
             * AND THE HEADLINE IS CORRECTED IN PLACE. Appending a second
             * sentence would leave "The spell takes effect. 10 PP spent"
             * standing three rows above the refund — which is what
             * 3.480.0 shipped and what driving it found.
             *
             * VERIFIED BEFORE IT IS REPLACED. If the line at that index
             * is not the one that was pushed, the card is left alone and
             * a correction is appended instead: a wrong rewrite would
             * silently overwrite somebody else's sentence, which is worse
             * than the duplicate it is avoiding.
             */
            const corrected = line(castResultHeadline({ ...headlineFacts, refunded: true }));
            if (lines[headlineIndex] === headlineHtml) {
              lines[headlineIndex] = corrected;
              headlineHtml = corrected;
            } else {
              lines.push(corrected);
            }
          } else {
            const before = areaTargets;
            areaTargets = applyAreaChoice(before, chosen);
            // "UP TO SIX", HELD TO SIX (3.611.1, G2 of the 3.611.0 drive).
            // Wits' "+8 PP: you may affect up to 6 targets in a 30-foot
            // radius" caught seven, foes among them. The warp's own total
            // caps the choice; the first that many chosen are kept, and the
            // card says so rather than dropping the rest in silence.
            const areaCap = Math.max(0, Math.trunc(Number(warpMods?.targetCap) || 0));
            if (areaCap > 0 && areaTargets.length > areaCap) {
              lines.push(line(`<em>${spell.name} affects up to ${areaCap} — the first ${areaCap} chosen; `
                + `${areaTargets.slice(areaCap).map((a) => a.name).join(", ")} spared.</em>`));
              areaTargets = areaTargets.slice(0, areaCap);
            }
            // NOT CHOSEN, AS DISTINCT FROM CAPPED (3.612.0, G1 of the 3.611.1
            // drive). Measured against what the caster ticked, so a creature
            // the cap above left out is named once — by the cap's own line —
            // and not a second time as one the caster "did not choose".
            const ticked = applyAreaChoice(before, chosen);
            const spared = before
              .filter((a) => !ticked.includes(a))
              .map((a) => a.name);
            const sparedText = areaChoiceLine(spell.name, spared);
            if (sparedText) lines.push(line(sparedText));
            if (!areaTargets.length) lines.push(line(areaChoseNobodyLine(spell.name)));
          }
        }
        // REPORTED HERE, not merged into the targeted list. That list is
        // printed further up the card and has already been written by
        // the time an area resolves; appending to it now would drop the
        // names silently — which is the exact failure Graham named when
        // he chose pruning over refusing ("the player might not read the
        // note and think the goblin got charmed").
        const areaSkipText = kindSkippedText([...kindFiltered.skipped, ...areaImmunity.skipped]);
        if (areaSkipText) lines.push(line(`<em>${esc(areaSkipText)}</em>`));
        const widenText = areaWidenedText(kindFiltered.widened);
        if (widenText) lines.push(line(`<em>${esc(widenText)}</em>`));
        // THE WIDER NET NAMES ITSELF (3.488.0). Fools Riches draws a
        // five-foot circle and tests everything within twenty feet of it,
        // so the card must say so — otherwise the drawn shape and the
        // list of names below it flatly contradict each other and the
        // reader has to guess which one is the bug.
        if (netFeet !== null) {
          lines.push(line(saveNetLine(spell.name, netFeet, describeArea(areaConfig))));
        }
        const modeLabel = mode === "allies" ? " (allies only)" : mode === "enemies" ? " (foes only)" : "";
        lines.push(
          line(
            `Area: <strong>${describeArea(areaConfig)}</strong>${modeLabel} template placed — ` +
              (caught.length
                ? `caught <strong>${caught.length}</strong>: ${caught.map((a) => a.name).join(", ")}.`
                : "no eligible tokens inside.")
          )
        );
        if (blocked.length) {
          const names = blocked.map((t) => t.actor?.name).filter(Boolean).join(", ");
          lines.push(line(`<em>Line of effect blocked by walls — spared: ${names || `${blocked.length} token(s)`}.</em>`));
        }

      // HAZARDOUS TERRAIN, recorded on the region the template just made
      // (3.454.0; MOVED HERE AT 3.455.0). Spike Stones, Verdant Retribution and Wall Of Thorns
      // all charge a creature PER SQUARE ENTERED, which nothing else in
      // this system asks — the emanation sweep answers "who is inside
      // now" and cannot see a path. See magic/hazard-terrain.mjs.
      //
      // IT SITS INSIDE `if (placed)`, AND THAT IS THE WHOLE POINT.
      // 3.454.0 put it beside the emanation recording, inside
      // `if (lock || spellData.sustained)` — and an emanation is always
      // one or the other, while a hazard is neither. So Spike Stones
      // placed its template, printed its note, and recorded NO HAZARD:
      // the region carried `hazard: null` and walking through it did
      // nothing at all. Found by casting it at the table on 1 September
      // 2026; the harness had asserted the code existed and never asked
      // whether anything reached it.
      //
      // THE CASTER'S DISPOSITION TRAVELS WITH IT, for the reason the
      // emanation's save DC does: Verdant Retribution bites "an enemy",
      // and a caster who later leaves the scene must not change who
      // their own plants attack.
      // AN AREA RIDER IS RECORDED THE SAME WAY (3.465.0). Consecrated
      // ground is a place, not a creature effect, so it lives on the
      // Region exactly as a hazard does — see magic/area-rider.mjs.
      /*
       * AN ELEMENTAL NEXUS IS RECORDED HERE, WITH ITS ELEMENT (3.477.0).
       *
       * The element is chosen at this point rather than in the applier
       * because it decides the SAVE the zone will ask of everyone who
       * begins a turn in it — "Fortitude for Acid and Cold, Reflex for
       * Electricity and Fire" — and the Region has to carry that from the
       * moment it exists. See magic/elemental-nexus.mjs.
       */
      /*
       * AN INSCRIBED RUNE IS RECORDED ON THE REGION IT JUST DREW
       * (3.604.0, Graham's R10).
       *
       * Beside the nexus because it is the same shape — a zone that
       * outlives its cast — and here rather than in the applier for the
       * same two reasons: the Region only exists at this point, and the
       * DESIGNATION can only be asked once the radius is on the map,
       * because the question is "which of the creatures inside this circle
       * do you ward?".
       *
       * TEN MINUTES OF CASTING IS WHEN A CASTER NAMES PEOPLE. Graham's
       * ruling of 29 September 2026: the picker lists who is inside the
       * radius as the ritual finishes, and creatures outside it cannot be
       * designated. See magic/inscribed-rune.mjs.
       */
      // A CHOSEN MODE'S ROWS, not the spell's (3.609.1, the 3.609.0 live test's F8):
      // Rock to Mud's difficult terrain lives on its mode, and these loops read only
      // the spell — so it was never laid. `effEffects` IS the spell's rows when no
      // mode was chosen.
      for (const row of (effEffects ?? [])) {
        const runeSpec = normaliseRune(row);
        if (!runeSpec || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const {
          runeRecord, wardInscribedLine, wardDesignatesNobodyLine, warningInscribedLine,
          warningNoTraitLine, runeJudgedAtTheTableLine, RUNE_FLAG
        } = await import("./inscribed-rune.mjs");
        const { pointInRune, refreshRunes } = await import("./inscribed-rune-workflow.mjs");
        const pxPerFoot = (canvas.scene.grid.size ?? 0) / (canvas.scene.grid.distance ?? 1);
        const centre = { x: Number(placedArea.x), y: Number(placedArea.y) };
        const radiusFeet = Number(areaConfig?.distance ?? 0);
        const seed = { kind: runeSpec.kind, label: runeSpec.label, centre, radiusFeet };

        let designated = [];
        let trait = "";
        if (runeSpec.kind === "runeWard") {
          const candidates = Array.from(canvas.scene.tokens ?? []).filter((t) => {
            const object = t.object ?? t;
            const point = object?.center ?? { x: t.x, y: t.y };
            return pointInRune({ centre, radiusFeet }, point, pxPerFoot);
          });
          designated = await promptRuneDesignation(spell.name, candidates);
        } else {
          trait = await promptRuneTrait(spell.name);
        }

        const record = runeRecord({
          ...seed, castId, designated, trait,
          // THE WARPED DURATION, NOT THE PRINTED ONE. Both runes sell
          // "+2 PP: change duration to 24 hours", so reading the item's own
          // field would charge for a warp that bought nothing — the exact
          // inert-warp shape this project keeps finding.
          until: Number(game.time?.worldTime ?? 0)
            + Number(parseSpellDuration(warpedDurationText(spellData.duration, warpMods))?.seconds ?? 0)
        });
        if (!record) {
          lines.push(line(`<em>${spell.name} could not be inscribed here.</em>`));
          continue;
        }
        await region.setFlag(SYSTEM_ID, RUNE_FLAG, record);
        if (runeSpec.kind === "runeWard") {
          const names = designated
            .map((u) => canvas.scene.tokens.find((t) => t.uuid === u)?.name)
            .filter(Boolean);
          lines.push(line(names.length
            ? wardInscribedLine(runeSpec.label, radiusFeet, names)
            : wardDesignatesNobodyLine(runeSpec.label)));
        } else {
          lines.push(line(trait
            ? warningInscribedLine(runeSpec.label, radiusFeet, trait)
            : warningNoTraitLine(runeSpec.label)));
        }
        lines.push(line(runeJudgedAtTheTableLine()));
        // THE WARD APPLIES AT ONCE to whoever is already standing in it.
        // Without this the designated allies present at the inscription
        // would gain nothing until somebody took a step.
        await refreshRunes(canvas.scene);
      }
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "elementalNexus" || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const spec = normaliseNexus(row);
        if (!spec) {
          lines.push(line(`<em>${spell.name} declares a malformed nexus.</em>`));
          continue;
        }
        const offered = offeredTypes(row);
        const element = chosenType(
          row, await promptTypeChoice(row.label || spell.name, offered));
        if (!element) {
          lines.push(line(typeRefusal(row.label || spell.name)));
          continue;
        }
        // AN ELEMENT WITH NO SAVE CANNOT POWER A ZONE (3.603.0). The
        // chooser's whitelist widened to every damage type this release,
        // so this is the guard that keeps a mis-authored row from placing
        // a Region that asks nobody anything. See `nexusIsCastable`.
        if (!nexusIsCastable(element)) {
          lines.push(line(nexusUnsupportedLine(spec.label, element)));
          continue;
        }
        const { recordNexus } = await import("./elemental-nexus-workflow.mjs");
        // THE SAVE DC IS FROZEN AT CAST, for the reason the emanation and
        // the prisons freeze theirs: a caster who later leaves must not
        // change the zone they left behind.
        const recorded = await recordNexus(region, {
          ...row, element, saveDC: Number(saveDC ?? 0) || 0
        });
        if (!recorded) continue;
        lines.push(line(typeChosenLine(spec.label, element)));
        lines.push(line(`Anyone beginning a turn inside rolls `
          + `<strong>${nexusSave(element)}</strong> — ${nexusLadderLine(spec, element)}.`));
        for (const note of spec.notes) lines.push(line(`<em>${note}</em>`));
      }
      /*
       * A RECURRING LADDER IS RECORDED THE SAME WAY (3.587.0, R2).
       *
       * Beside the nexus rather than anywhere else, because it is the
       * same shape: an area that outlives its cast and asks a question
       * of whoever is standing in it on a turn boundary. The save DC is
       * frozen here for the reason the nexus freezes its own — a caster
       * who later leaves must not change the zone they left behind.
       */
      for (const row of (effEffects ?? [])) {
        if (String(row?.kind ?? "").toLowerCase() !== "saveladder") continue;
        if (!row?.recurring || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const { recordRecurringLadder } = await import("./recurring-ladder-workflow.mjs");
        const recorded = await recordRecurringLadder(region, {
          ...row.recurring,
          name: spell.name,
          saveDC: Number(saveDC ?? 0) || 0,
          casterUuid: actor?.uuid ?? ""
        });
        if (!recorded) {
          lines.push(line(`<em>${spell.name} declares a malformed recurring ladder — its second save will not be rolled.</em>`));
          continue;
        }
        lines.push(line(
          `Anyone ${recorded.on === "endOfTurn" ? "ending" : "beginning"} a turn inside rolls `
          + `<strong>${recorded.save.charAt(0).toUpperCase() + recorded.save.slice(1)}</strong> again.`));
      }

      /*
       * A MISSILE STORM FIRES HERE, AT WHAT THE TEMPLATE CAUGHT (3.478.0).
       *
       * It needs no region and no flag: the salvo is spent the moment it
       * is cast, so unlike the nexus above there is nothing to remember.
       * What it does need is `areaTargets` — the list the area block has
       * already pruned by disposition, line of effect and kind gate — so
       * this must sit after that block and must NOT ask the geometry
       * again. See magic/missile-storm.mjs.
       */
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "missileStorm") continue;
        const { applyMissileStorm } = await import("./missile-storm-workflow.mjs");
        const stormLines = await applyMissileStorm(
          { ...row, label: row.label || spell.name },
          areaTargets ?? []
        );
        if (!stormLines.length) {
          lines.push(line(`<em>${spell.name} declares a malformed missile storm.</em>`));
        }
        for (const l of stormLines) lines.push(line(l));
      }
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "areaRider" || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const { recordAreaRider } = await import("./area-rider-workflow.mjs");
        const recorded = await recordAreaRider(region, { ...row, label: row.label || spell.name });
        lines.push(recorded
          ? line(`Attacks against <strong>${recorded.subject}</strong> creatures inside `
            + `gain <strong>+${recorded.attackBonus}</strong> and deal `
            + `<strong>${recorded.dice} ${recorded.damageType}</strong> secondary damage.`)
          : line(`<em>${spell.name} declares a malformed area rider.</em>`));
      }
      /*
       * THE WALL ITSELF (3.610.0, R9): refused if it would form through a
       * creature, put on the map as Foundry Walls if it blocks, and its
       * riders written on the Region for the crossing and turn hooks.
       *
       * BEFORE THE TERRAIN (3.610.1, G2 of the 3.610.0 drive). A wall that
       * dissipates takes its Region with it, and every row below asks for
       * the Region first — so raised here, a dissipated Wall Of Thorns no
       * longer tells the card its ground is difficult terrain.
       */
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "wall" || !wallSpec || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const { raiseWall } = await import("./wall-spell-workflow.mjs");
        const damageRow = spellData.damage ?? {};
        for (const said of await raiseWall(region, wallSpec, placedArea, {
          caster: actor, spellName: spell.name, castId, dc: nominalSaveDC,
          formula: damageRow.formula ? addDice(damageRow.formula, warpMods?.damageDice) : "",
          type: damageRow.type ?? "", baseDamage: spellData.baseDamage ?? "", damageScope: spellData.damageScope ?? ""
        })) lines.push(line(said));
        if (!canvas.scene?.regions?.get(placedArea.regionId)) {
          placedArea = { ...placedArea, regionId: null };
          wallDissipated = true;
        }
      }
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "difficultTerrain" || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        /*
         * GROUND THAT COSTS MORE TO CROSS (3.501.0).
         *
         * THE BEHAVIOUR BUILDER IS THE CREATURE AURAS' OWN. That function
         * is the one place in the system that knows how a
         * `modifyMovementCost` behaviour is spelled — it learned the
         * schema the hard way, with an unknown key silently dropped and
         * every difficulty defaulting to 1 — so this hands it the shape it
         * already takes rather than being right about the schema twice.
         */
        const spec = normaliseDifficultTerrain(row, warpMods);
        if (!spec) {
          lines.push(line(`<em>${spell.name} declares malformed terrain.</em>`));
          continue;
        }
        const { terrainBehaviours } = await import("../creature-aura-workflow.mjs");
        const behaviours = terrainBehaviours(terrainAuraShape(spec, spell.name));
        if (!behaviours.length) {
          lines.push(line(`<em>${spell.name} declares terrain that charges nothing.</em>`));
          continue;
        }
        await region.update({ name: terrainRegionName(spec, spell.name) });
        await region.createEmbeddedDocuments("RegionBehavior", behaviours);
        lines.push(line(terrainPlacedLine(spec, describeArea(areaConfig))));
        const remainder = terrainRemainderLine(spec);
        if (remainder) lines.push(line(remainder));
      }
      /*
       * THE STORM (3.610.0): its first strike, chosen now; a Sustain chooses
       * again. See magic/storm-workflow.mjs.
       */
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "storm" || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const { castStorm } = await import("./storm-workflow.mjs");
        for (const said of await castStorm(region, row, {
          caster: actor, castId, dc: nominalSaveDC, spellName: spell.name, baseDamage: spellData.baseDamage ?? ""
        })) lines.push(line(said));
      }
      /*
       * WEB'S CHECK ON MOVING THROUGH IT (3.612.0, R6), against this cast's
       * DC, frozen on the Region. See magic/entry-check-workflow.mjs.
       */
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "entryCheck" || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const { recordEntryCheck, entryCheckRecordedLine } = await import("./entry-check-workflow.mjs");
        const recorded = await recordEntryCheck(region, row, {
          dc: nominalSaveDC, casterUuid: actor.uuid ?? null, spellUuid: spell.uuid ?? null,
          spellName: spell.name, castId
        });
        lines.push(recorded
          ? line(entryCheckRecordedLine(recorded, nominalSaveDC))
          : line(`<em>${spell.name} declares a malformed entry check.</em>`));
      }
      for (const row of (effEffects ?? [])) {
        if (row?.kind !== "hazard" || !placedArea?.regionId) continue;
        const region = canvas.scene?.regions?.get(placedArea.regionId) ?? null;
        if (!region) continue;
        const { recordHazard } = await import("./hazard-terrain-workflow.mjs");
        const casterToken = actor.getActiveTokens?.()?.[0] ?? null;
        const recorded = await recordHazard(region, {
          ...row,
          label: row.label || spell.name,
          casterDisposition: casterToken?.document?.disposition ?? null
        });
        lines.push(recorded
          ? line(`<strong>${recorded.damage} ${recorded.damageType}</strong> to `
            + `${recorded.enemiesOnly ? "an enemy" : "a creature"} for each square of the area it moves into.`)
          : line(`<em>${spell.name} declares a malformed hazard.</em>`));
      }
      } else {
        lines.push(line(`<em>Area (${describeArea(areaConfig)}) not placed — resolve by hand.</em>`));
      }
    }
  }

  /*
   * Resonance-modifier context (Chapter 9 Resonance Modifiers table): the
   * spell's resolution trait, its PP, and whether it's Ethereal or Soul
   * magic. Aligned-area and Evil-spell modifiers stay GM-set (no data
   * hook), defaulting off.
   *
   * DECLARED HERE AT 3.585.0, six hundred lines above where it used to
   * be. Page 245's second resonance trigger is a 66 on a SPELL critical
   * injury, and critical injuries are rolled from BOTH the attack path
   * and the save path below — so the modifiers have to exist before
   * either runs. Leaving the declaration where it was and reading it
   * from above is the temporal-dead-zone mistake this same file already
   * paid for once, on `tradition` and the warp chooser: every non-cantrip
   * cast threw before it reached the dialog.
   */
  const resonanceContext = {
    spellTrait: isCantrip ? "cantrip" : isAttack ? "attack" : spellData.category === "save" ? "save" : "utility",
    pp: totalPP,
    etherealMagic: String(tradition || "").toLowerCase().includes("ethereal"),
    soulMagic: /\bsoul\b/i.test(spellData.traits || "")
  };

  /*
   * WHICH DAMAGE TYPE THIS CAST IS (3.603.0, Graham's R9).
   *
   * ASKED HERE, BETWEEN THE CHECK AND THE RESOLUTION, because that is the
   * only window where the answer can still reach the damage. Earlier — in
   * the warp dialog — would interrupt every fumbled cast for a choice
   * nobody gets to use; later, in the effect applier, the save has already
   * been rolled and the damage already dealt in whatever type the item
   * happened to carry.
   *
   * THE TYPE ON THE ITEM IS A PLACEHOLDER FOR THESE SPELLS, and until this
   * release it was the answer. Shadow Blast prints a choice of nine and
   * was authored as force — the one answer on its own list that ignores
   * Damage Reduction entirely. Energy Bolt and Searing Burst print a
   * choice of four and were both authored as fire. Every cast of all three
   * has been the same spell every time.
   *
   * THE FORMULA IS NOT TOUCHED, only the type. An AP mode that carries its
   * own damage keeps its formula and gets the chosen type laid over it,
   * because the mode answers "how big" and this answers "of what" — two
   * questions that must not overwrite each other.
   */
  let damageChoice = null;
  let damageChoiceRefused = false;
  if (outcome.cast) {
    const choiceRow = (spellData.effects ?? [])
      .find((e) => String(e?.kind ?? "").toLowerCase() === "damagetypechoice") ?? null;
    if (choiceRow) {
      const offered = offeredTypes(choiceRow);
      const label = choiceRow.label || spell.name;
      const picked = chosenType(choiceRow, await promptTypeChoice(label, offered));
      if (!picked) {
        /*
         * A REFUSED CHOICE DEALS NOTHING, and the card is allowed to say so.
         *
         * Until this flag existed the refusal line read "nothing happens"
         * and then the spell dealt its damage anyway, in whatever type the
         * item happened to carry — which for Shadow Blast was force, the
         * strongest answer on its list. A card that contradicts the dice is
         * worse than either outcome on its own.
         *
         * THE PAGE GIVES NO DEFAULT. Unlike the casting-time chooser, where
         * a closed dialog is simply the printed spell, there is no printed
         * type here to fall back to: "select acid, bludgeoning, cold..." is
         * the whole of the instruction. So an unanswered question stops the
         * spell rather than answering itself.
         */
        damageChoiceRefused = true;
        lines.push(line(typeRefusal(label)));
      } else {
        damageChoice = picked;
        lines.push(line(typeChosenLine(label, picked)));
        // WHAT THE ELEMENT HAS TO BE DRAWN FROM, for the two spells that
        // print it. Named, not enforced — see magic/element-sources.mjs.
        const sourceLine = elementSourceLine(picked);
        if (sourceLine && choiceRow.printSource) lines.push(line(sourceLine));
      }
    }
  }
  const baseDamageRow = apMode?.damage ?? spellData.damage;
  const damageForCast = damageChoice
    ? { ...(baseDamageRow ?? {}), type: damageChoice }
    : (apMode?.damage ?? null);

  /*
   * SPELL TURNING (3.608.0, R6). A casting that has succeeded and names a
   * warded creature as a target offers that creature its reaction. See
   * magic/spell-turning.mjs for why this is asked here, like Sanctuary,
   * rather than cast in answer from the warded creature's own sheet.
   */
  if (outcome.cast && !isItemCast) {
    const { castCanBeTurned } = await import("./spell-turning.mjs");
    if (castCanBeTurned(spellData)) {
      const { offerSpellTurning } = await import("./spell-turning-workflow.mjs");
      const turning = await offerSpellTurning(actor, spell, {
        spellPP: totalPP, castTotal: Number(check?.outcome?.total ?? 0)
      });
      for (const l of turning) lines.push(line(l));
    }
  }
  /*
   * REFLECTING (3.616.0, Graham's R7 of block 36). A shield rune that turns
   * a spell back "as if using the spell turning spell" — offered on the
   * same casts Spell Turning is, item casts included. See
   * `offerReflecting`.
   */
  if (outcome.cast) {
    const { castCanBeTurned } = await import("./spell-turning.mjs");
    if (castCanBeTurned(spellData)) {
      const { offerReflecting } = await import("./spell-turning-workflow.mjs");
      // THE SPELL'S OWN PP, which an item cast and an innate one carry as 0
      // in `totalPP` because nobody pays it: the allowance is "a spell of up
      // to PP 14", a fact about the spell.
      const reflectPP = isItemCast
        ? Math.max(0, Number(itemCast.pp ?? spellData.ppCost ?? 0) || 0)
        : isInnate ? Math.max(0, Number(spellData.ppCost ?? 0) || 0) : totalPP;
      const reflected = await offerReflecting(actor, spell, { spellPP: reflectPP });
      for (const l of reflected) lines.push(line(l));
    }
  }
  let spellAttack = null;
  let spellSave = null;
  if (isAttack && outcome.cast && !damageChoiceRefused) {
    spellAttack = await resolveSpellVolley(actor, spell, check, lines, clMods, warpMods, {
      // SPECIALIST ATTACK SPELLS (Chapter 9): "…equal to your magical
      // ability score + level or your spellcraft bonus, whichever is
      // higher." The save half of that sentence has always been applied;
      // the attack half was not. See `specialistAttackUplift`.
      //
      // SONG & DANCE IS ALREADY ON THIS ATTACK, and this is the line that
      // stops it being counted twice (3.444.0). A caster's spell attack IS
      // their Cast a Spell check — `resolveSpellAttack` compares that
      // check's total against the target's Defence Bonus — and the check's
      // modifier list is the Spellcraft one, class bonus included. So the
      // ruling's "applied to the attack bonus" is already true for an
      // ordinary cast, and the only thing needed here is that the uplift
      // be measured from the Spellcraft bonus WITHOUT it: the uplift is a
      // difference against the number already in the roll, so with the
      // bonus on both sides it cancelled, and a specialist Bard whose
      // ability+level beat their Spellcraft lost it entirely.
      specialistUplift: isSpecialist
        ? specialistAttackUplift(castingAbility, characterLevel, spellcraftForCast)
        : 0,
      /*
       * A VOLLEY, WHEN THE CHOSEN AP MODE BUYS MORE THAN ONE RAY (3.600.0,
       * Graham's R13). `rays` comes from the AP option the caster picked, so a
       * spell with no `apOptions` — every other attack spell in the pack — is
       * a volley of one and behaves exactly as it did. See magic/ray-volley.mjs.
       */
      rays: Number(apMode?.rays ?? 0),
      damageOverride: damageForCast,
      splashSaveDC: nominalSaveDC,
      // THE ROD OF ACCURACY'S ITEM BONUS (3.616.0, R14), stacked with the
      // attack pool so an item bonus from elsewhere is not paid twice.
      extraAttackRows: accuracyAttackRow ? [accuracyAttackRow] : [],
      // "+ MAGICAL ABILITY SCORE" (3.666.1, Hurling): the ability this cast's
      // Spellcraft rolled off, the swap included, so the damage adds the same
      // score the card's check named.
      castingAbilityKey: castAbilityKey
    });
  } else if (outcome.cast && !damageChoiceRefused && (effDefence ?? spellData.defence) && saveDC != null && !touchMissed
      && !spellDefersItsSave(spellData.effects)
      // NOR A SAVE OWED AT THE START OF EACH CREATURE'S TURN (3.609.0, R3).
      // Turn Undead: "must make a saving throw if they begin their turn in
      // the spells area" — nothing is rolled when it is cast. See
      // magic/turn-save.mjs.
      && !spellSavesOnTurnStart(spellData.effects)) {
    /*
     * Save spells (Chapter 9): each affected creature rolls the spell's save
     * against the Save DC; a basic-save spell deals its damage scaled by the
     * result (none/half/full + critical). Non-damage saves report pass/fail and
     * defer the effect to the effect engine.
     *
     * UNLESS THE SPELL'S SAVE BELONGS TO SOMEBODY ELSE (3.598.0). Sanctuary
     * prints "Saving Throw Will" and its save is rolled by each OPPONENT at
     * the moment they attack — so this branch, which fires on `defence`
     * alone, would have asked the protected ally to roll Will to resist their
     * own ward, and `beneficial-save.mjs` would have agreed with it. The
     * question is asked of the effect LIST rather than of the spell's name;
     * see magic/sanctuary.mjs.
     */
    spellSave = await resolveSpellSave(actor, effDefence === null ? spell : {
      name: spell.name, uuid: spell.uuid, img: spell.img,
      system: {
        ...(spell.system?.toObject?.(false) ?? spell.system),
        defence: effDefence,
        // AND THE MODE'S OWN ROWS (3.609.2, G2 of the 3.609.1 drive). The save
        // path reads them to know whether the spell applies itself; handed the
        // spell's empty rows, Mud to Rock's card told the table to apply a grab
        // the effect engine had already applied.
        effects: effEffects,
        // AND ITS OWN ALTERNATIVE TO THE SAVE, when the mode names one —
        // Mud to Rock's "or an Acrobatics check".
        ...(apMode?.saveAlternative ? { saveAlternative: String(apMode.saveAlternative) } : {})
      }
    }, {
      saveDC,
      clMods,
      warpMods,
      lines,
      targets: areaTargets ?? undefined,
      damage: damageForCast,
      resonanceContext,
      regardlessTargets: regardlessActors
    });
  }

  // Effect framework (phase 3): apply the spell's structured effects (heal, temp
  // HP, conditions, buffs) to the caster and/or the creatures it affects. Who
  // the "targets" effects hit depends on the spell: an attack spell's struck
  // target, a save spell's failed savers, an area's caught tokens, else the
  // caster's manual targets. Self-target effects always go to the caster.
  /*
   * WILL THIS CAST BE REGISTERED? Computed HERE, above both the block
   * that applies the effects and the block that registers the entry,
   * because the effects have to be STAMPED with the answer — see
   * `castWillRegister` in magic/active-spells.mjs and the sweep for
   * stranded effects that reads the stamp.
   *
   * ONE EVALUATION, NOT TWO. The registry guard further down uses this
   * same constant rather than re-deriving its five limbs: if the stamp
   * and the registration could ever disagree, the sweep would either miss
   * real orphans or delete live effects.
   */
  const registersCast = castWillRegister({
    durationText: warpedDurationText(spellData.duration, warpMods),
    /*
     * THE PRINTED FLAG HERE, AND THE WARPED ANSWER EVERYWHERE ELSE.
     *
     * I had this backwards at 3.538.0 and live testing caught it. This
     * predicate does not ask "is the cast sustained"; it asks "will
     * anything need to clean this up". Those came apart the moment a
     * warp could end the sustaining:
     *
     * Circle Of Warmth warped to 1 hour is no longer sustained, does not
     * lock, is not dismissible and is not single-casting — so passing the
     * warped answer made `castWillRegister` return FALSE and the cast
     * registered NOTHING. The aura went onto an ally with no entry, no
     * clock, no emanation record and no way to dismiss it. Live, the
     * spell took effect and left nothing behind that could ever end it.
     *
     * A spell whose printed line says Sustained always has something to
     * clean up. What the warp changes is HOW it ends — an `ends` stamp
     * instead of a lapse — not WHETHER it is tracked.
     */
    sustained: spellData.sustained,
    // THE LIGHT TRAIT'S OWN STEP IS A LIVE EMANATION TOO (3.622.1; the
    // 3.622.0 drive's F3, Graham's R3). Its row is added by the applier, not
    // printed on the spell, so asked about the printed rows alone the gate
    // registered nothing: Fairy Fire's raise was recorded against a cast
    // that was not in the registry, and never followed, expired or could be
    // dismissed. Asked here only — the placed template is not the light's
    // circle, so the Region clean-up below still reads the printed rows.
    emanationLive: emanationIsLive(spellData)
      || Boolean(outcome.cast && (await import("../trait-rules.mjs")).lightTraitDefaultRow(spellData, spell.name)),
    singleCasting: declaresSingleCasting(spellData)
  });

  // TELEPORTATION, ON WHOEVER IT MOVES (3.622.0; Graham's R11 of block 39):
  // a Spatial Awareness check to keep acting, and a second teleportation in
  // one turn fails. The targets, or the caster when there are none.
  if (outcome.cast) {
    const { teleportationArrives } = await import("../trait-rules-workflow.mjs");
    const moved = Array.from(game.user?.targets ?? []).map((t) => t?.actor).filter(Boolean);
    for (const said of await teleportationArrives(actor, spell, moved)) lines.push(line(said));
  }

  let spellEffectRolls = [];
  let affectedUuids = [];
  // …OR NONE BUT THE LIGHT TRAIT'S STEP (3.622.0; R9): Fairy Fire prints no
  // row, and its glow is the whole of what it does here.
  const { lightTraitDefaultRow } = await import("../trait-rules.mjs");
  if (outcome.cast && Array.isArray(effEffects) && (effEffects.length || lightTraitDefaultRow(spellData, spell.name))) {
    let effectTargets;
    let selfShapeBlocked = false;
    /*
     * EVERY RAY'S TARGET, not just the first (3.600.0, Graham's R13). A volley
     * hits up to three creatures, and a rider row on the spell applies to each
     * of them. `rays` is absent on a one-ray cast, so this reads exactly as it
     * did for every other attack spell in the pack.
     */
    if (isAttack) {
      effectTargets = Array.isArray(spellAttack?.rays) && spellAttack.rays.length
        ? spellAttack.rays.map((r) => r.targetActor).filter(Boolean)
        : (spellAttack?.targetActor ? [spellAttack.targetActor] : []);
    }
    else if (spellSave) effectTargets = spellSave.failed ?? [];
    else if (areaTargets) effectTargets = areaTargets;
    else effectTargets = Array.from(game.user?.targets ?? []).map((t) => t.actor).filter(Boolean);
    // AND A SPELL WITH NO SAVE IS KEPT OFF THE SAME WAY (3.612.0, F1) — Tame.
    if (!isAttack) effectTargets = await dropTemporarilyImmune(spell.name, effEffects, effectTargets, lines);

    // Invocation Wizard School, Intense Spells: "Any invocation spell
    // that you cast which inflicts damage increases its total damage by
    // half its PP cost." Folded into the damage roll BEFORE Damage
    // Reduction/resistance resolve — it is the spell's own total
    // increasing, not a separate untyped packet — the same "half the PP
    // charged" reading Conductive Healing's identical clause uses below.
    const intenseSpells = wizardSchoolTraitMatches("Invocation", spellData.traits) &&
      schoolsOf(actor).some((s) => String(s.name ?? "").trim().toLowerCase() === "invocation")
      ? intenseSpellsBonus(totalPP)
      : 0;

    // FORBIDDEN TRADITIONS, THIRD CLAUSE (Chapter 2). A creature with no
    // connection to this magic rolls Will before beneficial magic of that
    // tradition may take hold — a save it WANTS to pass. Placed here, and
    // only here, because it is the last moment before the help is handed
    // over and because it must not touch the caster: `effectTargets` is
    // the "targets" list, while self-target effects are resolved inside
    // applySpellEffects against the caster and are none of this rule's
    // business. A target that fails simply drops out of the list.
    effectTargets = await beneficialTraditionSave(actor, spell, {
      targets: effectTargets,
      saveDC: nominalSaveDC,
      lines
    });

    // POLYMORPH AGAINST POLYMORPH, AND AGAINST MORPH (3.622.0; Graham's R11
    // of block 39). A second polymorph counters the first; a polymorph ends
    // a morph. A creature whose earlier polymorph holds is left out.
    {
      const { shapeChangeArrives } = await import("../trait-rules-workflow.mjs");
      const shapeTotal = check?.outcome?.total ?? null;
      const kept = [];
      for (const target of effectTargets) {
        const shaped = await shapeChangeArrives(actor, spell, target, {
          castTotal: shapeTotal, castPP: totalPP, castId
        });
        for (const said of shaped.lines) lines.push(line(said));
        if (!shaped.blocked) kept.push(target);
      }
      effectTargets = kept;
      // A SELF-CAST SHAPE (Shape Of The Animal and its kin) changes the
      // caster, whose rows are resolved inside the effect engine.
      if ((effEffects ?? []).some((r) => r?.target === "self")) {
        const shaped = await shapeChangeArrives(actor, spell, actor, {
          castTotal: shapeTotal, castPP: totalPP, castId
        });
        for (const said of shaped.lines) lines.push(line(said));
        if (shaped.blocked) selfShapeBlocked = true;
      }
    }

    // VIBRANT THORNS (3.440.0): "whenever you cast an ESSENCE spell, the
    // potency of your thorns intensifies". Asked of the spell's own trait
    // line, and asked HERE — after the cast has succeeded and before the
    // effects land — so a failed cast sharpens nothing. Fire and forget:
    // a thorned Druid's window must never be able to disturb the spell
    // that opened it.
    for (const sharp of await intensifyThorns(actor, spell)) lines.push(line(sharp));

    const eff = await applySpellEffects(actor, spell, {
      registersCast,
      // THE LIGHT TRAIT'S DEFAULT STEP is drawn by the cast's own call
      // (3.622.0; R9) — see spell-effects.mjs.
      lightTraitDefault: true,
      targets: effectTargets,
      // EVERYONE THE AREA CAUGHT, beside the list this cast acted on.
      // An `allies` row reads this instead of `targets`, because on a
      // save spell `targets` is the failures and an ally in the cone
      // never rolled — see the allies branch in spell-effects.mjs, and
      // the live cast of Wash Away Sin on 15 Sep 2026 that found nobody
      // to heal while damaging exactly the right creature.
      areaCaught: Array.isArray(areaTargets) ? areaTargets : [],
      // THE PER-TARGET SAVE DEGREES, which `resolveSpellSave` has always
      // built and this call has always thrown away. An effect declaring
      // `onSave` reads them to pick its own recipients — see
      // magic/spell-degrees.mjs. Passed even when there was no save, so
      // the effect engine never has to ask whether there was one.
      saveResults: spellSave?.results ?? [],
      // AND THE DC THOSE DEGREES WERE ROLLED AGAINST (3.588.0). A
      // directed strike freezes it, for the reason the emanations and
      // the nexus freeze theirs: a caster who later changes must not
      // change a spell already running.
      saveDC,
      // AND HOW EACH STRUCK TARGET WAS STRUCK (3.613.0, R13): a row may
      // answer only a critical — Sickly Ray. Every ray of a volley, or the
      // one target of an ordinary attack.
      attackResults: isAttack
        ? (Array.isArray(spellAttack?.rays) && spellAttack.rays.length ? spellAttack.rays : (spellAttack ? [spellAttack] : []))
          // AND HOW HARD (3.672.0, C10): Water Bolt's push "on a serious or
          // deadly critical". Null when the critical carries no severity.
          .map((r) => ({ target: r?.targetActor ?? null, critical: Boolean(r?.critical), severity: r?.critical?.severity ?? null }))
          .filter((r) => r.target)
        : [],
      // `pp` is the PP ACTUALLY spent on this cast, warps and overcasting
      // included — so a formula can say "equal to the PP cost of the
      // spell" and mean it. Shape Of The Animal's temporary HP is the
      // first thing to need it; before this, a formula could only be
      // written as the base cost and would quietly lie the moment
      // anybody warped the spell.
      // `saveDC` rides along with `pp` so a granted spell-like can borrow the
      // DC of the cast that granted it — "a DC equal to the DC of this spell"
      // (the Wyrm's breath weapon). The NOMINAL DC, not the one the card
      // printed: Shape Of The Wyrm allows no save itself, and the whole point
      // is that its breath weapon still uses the DC that cast was worth.
      // `castTotal` rides along for COUNTER PERFORM (3.443.0), whose
      // printed rule is "your Perform check for casting this spell is
      // compared to the Bonus check table AGAINST THE SAVE DC OF THE
      // INCOMING SPELL". The comparison is against somebody else's DC, so
      // the effect engine needs the number this cast actually rolled —
      // the same reason `saveDC` and `pp` already ride here rather than
      // being re-derived downstream. Null on a cantrip that rolls no
      // check at all, which the applier refuses out loud.
      // `castSkill` NAMES THE SKILL THAT WAS ACTUALLY ROLLED (3.443.2).
      // Counter Perform's card printed "Perform 10" after a cast that
      // rolled SPELLCRAFT 10, because the word was typed into the applier
      // beside a number that is simply the casting total. The card now
      // says which check produced it; whether a Spellcraft cast should
      // earn the bonus at all is a rules question and is not decided here.
      rollData: {
        level: characterLevel, casterLevel, pp: totalPP, saveDC: nominalSaveDC,
        // THE CASTING ABILITY SCORE (3.589.0). False Health grants
        // "temporary HP equal to your spellcasting ability score x2",
        // which is the first formula in the pack to need it — every
        // other one is satisfied by level, caster level or PP. Computed
        // a few hundred lines above for the save DC; passed rather than
        // recomputed, so the two cannot disagree.
        castingAbility,
        castTotal: check?.outcome?.total ?? null,
        castSkill: usePerform ? "Perform" : "Spellcraft"
      },
      warpMods,
      lines,
      // A DISSIPATED WALL'S NOTES DESCRIBE A WALL THAT ISN'T THERE (3.610.1).
      effects: (wallDissipated ? (effEffects ?? []).filter((r) => r?.kind !== "note") : effEffects)
        .filter((r) => !(selfShapeBlocked && r?.target === "self")),
      extraDamage: intenseSpells,
      castId,
      pickedTraits
    });
    spellEffectRolls = eff.rolls;
    affectedUuids = eff.affected ?? [];

    // Conductive Healing (Chapter 5, Cleric): "Whenever you cast a spell
    // with the healing trait to restore Hit Points to a target other than
    // yourself, you also regain Hit Points equal to half the PP cost" —
    // half the PP as CHARGED (crit/heroic PP savings deliberately don't
    // change it, per the feat's own note).
    if (/\bhealing\b/i.test(String(spellData.traits ?? "")) &&
      effectTargets.some((t) => t && t.id !== actor.id) &&
      Array.from(actor.items ?? []).some(
        (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "conductive healing"
      )) {
      const conducted = Math.floor(totalPP / 2);
      if (conducted > 0) {
        const { healActor } = await import("./spell-effects.mjs");
        const healed = await healActor(actor, conducted);
        if (healed > 0) {
          lines.push(line(`<em>Conductive Healing — you regain <strong>${healed}</strong> HP (half the ${totalPP} PP cost).</em>`));
        }
      }
    }

    // THE WILD SHAPE RIDERS (Chapter 5, Druid) — Elemental Shape and Wyrm
    // Shape's resistance, and Ferocious Shape's dodge bonus. All three
    // say "whenever you use Wildshape to change into a different form",
    // so all three hang off a completed cast of a POLYMORPH spell rather
    // than off any one spell's name: a list of nine form spells would go
    // stale the first time one was added, and go stale silently.
    //
    // Placed beside Conductive Healing because it is the same shape — a
    // feat riding on somebody else's cast, applied only once that cast is
    // known to have worked. A rider on a failed shapeshift would grant
    // resistance to a Druid still standing in their own skin.
    const { applyWildShapeRiders } = await import("./wildshape-riders.mjs");
    await applyWildShapeRiders(actor, spell, {
      spellData,
      durationText: warpedDurationText(spellData.duration, warpMods),
      lines
    });
  }

  // Bardic Performance (Bard, 1st): "Each time you cast a spell that has the
  // composition trait, you may assign a temporary conviction point to any one
  // of the spells targets (excluding yourself). This conviction point remains
  // for the duration of the spell or until it is expended, whichever comes
  // first."
  //
  // AFTER the resolution, not beside the Perform substitution above, because
  // this one depends on the cast having WORKED and on knowing who it reached.
  // A spell that failed assigns nothing and spends no use.
  let convictionRecipientUuid = "";
  if (outcome.cast && conditions.bardicConviction) {
    const { assignTemporaryConviction } = await import("./bardic-conviction.mjs");
    const reached = affectedUuids.length
      ? affectedUuids
      : Array.from(game.user?.targets ?? []).map((t) => t.actor?.uuid).filter(Boolean);
    const granted = await assignTemporaryConviction(actor, spell, {
      targetUuids: reached,
      durationText: warpedDurationText(spellData.duration, warpMods),
      // So DISMISSING the spell reclaims the point, not only the clock
      // running out (3.324.0) — see bardic-conviction.mjs for the live
      // failure this closes.
      castId
    });
    if (granted?.note) lines.push(line(granted.note));
    convictionRecipientUuid = granted?.recipientUuid ?? "";
  }

  // Active-spell registry (Chapter 9): a sustained spell, or one whose extended
  // duration locks its PP ("until daily preparations" / "unlimited"), is recorded
  // on the caster so it can be sustained/dismissed and its PP held.
  if (outcome.cast) {
    // ONE ANSWER FOR SIX READERS (3.521.0), and it carries a printed
    // (D) forward that eighteen warps used to drop. See
    // `warpedDurationText` in magic/active-spells.mjs.
    const durationText = warpedDurationText(spellData.duration, warpMods);
    /* ONE ANSWER, ASKED ONCE, USED BY ALL FOUR. The banner, the registry
     * entry the Spellcasting panel reads, the `ends` clock and the
     * orphan-sweep predicate must agree; computing it separately at each
     * site is how they come to differ. */
    const warpedSustained = sustainAfterWarp(spellData.sustained, warpMods);
    const lock = ppLockCondition(durationText);
    // A LIVE EMANATION IS REGISTERED TOO, WHATEVER ITS DURATION SAYS
    // (3.463.0).
    //
    // 3.462.0 lifted `recordEmanation` out of this guard and Aura Of
    // Vitality STILL recorded nothing, because the lift was necessary and
    // not sufficient: `recordEmanation` looks the cast up in the active
    // spell registry — `entries.find((e) => e.id === castId)` — and
    // returns null when there is no entry. The spell was never
    // registered, so there was nothing for the emanation to be written
    // onto. Moving the call out of a guard cannot help when the thing it
    // writes to is what the guard creates.
    //
    // AND REGISTERING IT IS RIGHT ON ITS OWN TERMS. A live emanation is a
    // persistent thing: it follows its caster, it has a duration, and it
    // can be dismissed — "1 minute (D)" says so in the (D). That is what
    // the registry is for. The PP lock is a separate question and stays
    // exactly as it was: `lock` is still null here, so no PP is held.
    /*
     * EVERY SUCCESSFUL CAST IS REMEMBERED (3.470.0), whether or not it is
     * registered below.
     *
     * `registerActiveSpell` carries exactly the fields a reaction needs —
     * `pp`, `name`, `castRound` — and is written only for a spell that is
     * locked, sustained or a live emanation. Life Siphon triggers on "an
     * arcane soul spell of at least 2 PP", which is an ORDINARY cast and
     * registers nothing at all. So the same three facts are kept here for
     * every cast, in the shape `lastCriticalInjury` established for
     * Ambush and Sniping.
     *
     * THE PP IS WHAT WAS SPENT, NOT THE PRINTED COST. A Heroic success
     * halves the total, and "the spell's power" is the power that
     * actually left the caster — a 3 PP spell cast Heroically spends 1
     * and is worth nothing to siphon. See magic/life-siphon.mjs.
     */
    await actor.setFlag(SYSTEM_ID, LAST_CAST_FLAG, {
      name: spell.name,
      pp: ppSpent,
      tradition: String(spellData.tradition ?? ""),
      traits: String(spellData.traits ?? ""),
      round: game.combat?.started ? game.combat.round : null
    });

    /*
     * AND EVERY (D) SPELL (3.494.0). FOUND LIVE on 5 September 2026 while
     * testing Delayed Respite's dismissal, and it is the Umbral Veil
     * shape one door over: this gate asked three questions, none of them
     * the one the book actually prints on the duration line.
     *
     * `dismiss.mjs` has been complete since 3.434.0 and reaches "every
     * active entry" — but 53 of the 56 spells whose duration says (D)
     * were never entries, so Dismiss could only end spells dismissible
     * for some OTHER reason. Shield, Mirror Image, Levitate, Antimagic
     * Field, Geas, every Shape Of The ⟨…⟩ and all three Prisons could
     * not be dismissed by the action written to dismiss them.
     *
     * Graham ruled on 5 September: register them all, MERELY
     * dismissible. `lock` stays null so no PP is held, `sustained` stays
     * false so the lapse sweep never sees them, and the stamp below is
     * what takes them off the panel when their duration is spent.
     */
    const dismissible = isDismissibleDuration(durationText);
    /*
     * AND EVERY SPELL THAT ALLOWS ONLY ONE OF ITSELF (3.512.0), which is
     * the fifth reason and arrived the same way the fourth did.
     *
     * Six spells print the rule and only TWO of them were ever entries —
     * Vital Beacon and Light, and only because "until your next daily
     * preparations" locks PP. Breeze, Veiled Secret, Contingency and Pass
     * Without Trace registered nothing, so there was no record of which
     * casting was the live one and a recast had nothing to end.
     *
     * Graham ruled on 7 September 2026 that these show on the panel like
     * any other live spell. `lock` stays null so no PP is held, `sustained`
     * stays false so the lapse sweep never sees them, and the stamp below
     * takes them off the panel when their duration is spent.
     */
    const singleCasting = declaresSingleCasting(spellData);
    // THE SAME ANSWER THE EFFECTS WERE STAMPED WITH, not a second
    // evaluation of the same five limbs. `dismissible`, `lock` and
    // `singleCasting` are still computed above because the registry entry
    // itself carries them.
    if (registersCast) {
      /*
       * THE EARLIER CASTING GOES FIRST, before the new entry joins the
       * list — which is why `supersededEntries` needs no guard against
       * ending the cast that is calling it.
       *
       * `dismissed: false` because a rule ended it and not a person. The
       * default is the person, and every sweep that is not one says so.
       */
      const superseded = supersededEntries(getActiveSpells(actor), spellData, spell.name);
      for (const earlier of superseded) {
        await endActiveSpell(actor, earlier.id, { dismissed: false });
      }
      const supersededText = singleCastingLine(spell.name, superseded.length);
      if (supersededText) lines.push(line(supersededText));

      // WHEN IT ENDS, computed from the duration this cast actually got
      // — `durationText` is the warped one where a warp bought more.
      const parsedForEnd = parseSpellDuration(durationText);
      await registerActiveSpell(actor, {
        id: castId,
        name: spell.name,
        pp: ppSpent,
        lock,
        dismissible,
        // CARRIED SO AN INTERRUPTION CAN ASK FOR IT (3.585.0). `dc` is
        // this cast's Casting DC, already computed far above; a
        // sustained spell interrupted by damage rolls Spell
        // Concentration against it.
        castingDC: dc,
        /*
         * A LOCKED OR SUSTAINED SPELL GETS NO STAMP, and both refusals
         * are older decisions than this one.
         *
         * LOCKED: "until your next daily preparations" is not a number
         * of seconds, and the lock is what ends it. Stamping a clock as
         * well would be the two-clocks defect 3.476.0 paid for on
         * effects.
         *
         * SUSTAINED: 62 of the 72 sustained spells print a cap — "Bless,
         * Sustained (1 minute)" — and stamping it here would end them at
         * that cap for the first time. Their EFFECTS already end there,
         * on `spellEffectEnd`; it is only the entry that lingers. But
         * `emanation-growth.mjs` records a deliberate decision about the
         * six emanations live before 3.430.0 — they are ended by the
         * lapse sweep, and "inventing a clock for them would end
         * somebody's Bless at a moment nobody chose". A stamp here would
         * invent exactly that clock. Capping sustained spells is a
         * separate rule with its own 62-spell blast radius, and this
         * change does one thing.
         */
        ends: (lock || warpedSustained) ? null : endsStamp({
          seconds: parsedForEnd?.seconds ?? null,
          rounds: parsedForEnd?.rounds ?? null,
          worldTime: Number(game.time?.worldTime ?? 0),
          round: game.combat?.started ? Number(game.combat.round ?? 0) : null
        }),
        sustained: warpedSustained,
        singleCasting,
        sustainType: spellData.sustainType ?? null,
        // WHAT A SUSTAIN BUYS (3.586.0). Recorded HERE as well as on the
        // emanation record below, because a spell with no area never
        // reaches that branch — which is why Acid Arrow's choice, and
        // Blink's, had nowhere to live. See magic/sustain-choice.mjs.
        sustainChoices: Array.isArray(spellData.sustainChoices) ? spellData.sustainChoices : [],
        castRound: game.combat?.started ? game.combat.round : null,
        // THE CONVICTION RECIPIENT COUNTS AS A TARGET FOR CLEANUP (3.324.0).
        // `endActiveSpell` only visits the actors listed here, so a stamped
        // castId on somebody outside the list is a tag nobody goes looking
        // for. A composition spell that grants no OTHER effect reaches here
        // with an empty `affectedUuids` — Bardic Performance's point is then
        // the only thing the cast left behind, and it would have been the one
        // thing dismissal could not clear.
        targets: convictionRecipientUuid && !affectedUuids.includes(convictionRecipientUuid)
          ? [...affectedUuids, convictionRecipientUuid]
          : affectedUuids
      });
      if (lock) lines.push(line(`<em>${ppSpent} PP locked ${lock === "dailyPrep" ? "until your next daily preparations" : "until this spell is dismissed"}.</em>`));
      if (warpedSustained) lines.push(line(`<em>Sustained — active in your Spellcasting panel; Sustain it each turn to maintain it.</em>`));

    }

    // A LIVE EMANATION FOLLOWS ITS CASTER (3.426.0; LIFTED OUT OF THE
    // LOCK/SUSTAINED GUARD AT 3.462.0).
    //
    // IT USED TO SIT INSIDE `if (lock || spellData.sustained)` and was
    // correct there for three months by luck: all ten live emanations
    // were Sustained, so the guard never once excluded one. Aura Of
    // Vitality is the FIRST that is neither sustained nor PP-locked —
    // its duration is "1 minute (D)" — and it fell straight through.
    // The spell landed, the template placed, the card said it took
    // effect, and `runningEmanations()` came back empty, so the
    // per-turn heal could never fire. Found by driving it on 1
    // September 2026.
    //
    // THE GUARD IS ABOUT A DIFFERENT QUESTION. Locking PP and listing a
    // spell in the Spellcasting panel is about what the CASTER owes for
    // the duration; whether a circle exists on the map is about the
    // SPELL. Nesting the second inside the first made a live emanation
    // depend on a fact that has nothing to do with it — the same shape
    // as the hazard recording, which sat in this very block at 3.454.0
    // and never ran for exactly the same reason.
    //
    // Graham, 27 August 2026: "I have an issue with the way the
    // emanation works. This should move with the caster." Bless's own
    // text says the bonus applies "while within the emanation", and
    // both it and Bane sell "targets may move out of the area" for
    // 2 PP — a price nobody could have been paying, because the
    // behaviour it buys was the only behaviour there was.
    //
    // Recorded here rather than where the template is placed, because
    // this is the point at which the cast is known to have succeeded
    // and the entry that will carry the emanation exists.
    // SAID OUT LOUD, EVERY TIME (3.446.0). A bonus that can only apply
    // against some creatures — and which applies against NOBODY for a
    // Balance or unaligned caster — must name its condition on the
    // card. This is the Stone Shield lesson: "cover from one chosen
    // enemy" once sat in a note beside an unconditional +4.
    if (emanationIsLive(spellData)
      && (spellData.effects ?? []).some((e) => e?.opposedAura)) {
      lines.push(line(`<em>${spell.name} — ${opposedAuraLine(opposingTraitsOf(system))}.</em>`));
    }

    if (emanationIsLive(spellData) && placedArea?.regionId) {
      const { zoneIsPlaced } = await import("./obscuring-zone.mjs");
      await recordEmanation(actor, castId, {
        name: spell.name,
        img: spell.img,
        // A CLOUD PUT DOWN STAYS WHERE IT WAS PUT (3.608.0, R7). A null
        // anchor is Umbral Veil's dropped circle: its membership is read
        // off its own Region, so the fog does not follow the caster — and
        // a GM who drags the Region moves the fog.
        ...(zoneIsPlaced(spellData) ? { anchorTokenId: null } : {}),
        regionId: placedArea.regionId,
        radiusFeet: Number(placedArea.distance) || 0,
        mode: warpedAreaTargeting(spellData.areaTargeting, warpMods),
        // THE SAVE A LATECOMER OWES, and the DC it is owed against
        // (3.428.0). Recorded at the cast rather than recomputed on
        // entry: a caster since weakened does not make their standing
        // Bane easier to resist.
        //
        // NOT FOR A SAVE OWED AT THE START OF A TURN (3.609.1, the 3.609.0
        // live test's F2). Turn Undead's Will save belongs to its turn-save
        // record below; recorded here as well, every creature in the circle
        // — the caster included — was asked it on the way in too.
        save: spellSavesOnTurnStart(spellData.effects) ? null : emanationSave(spellData),
        saveDC: saveDC ?? null,
        // WHOSE AURA THIS IS MEASURED AGAINST (3.446.0). Radiant Aegis
        // and Wellspring Of Valour are keyed to "an opposing aura type
        // to YOUR OWN", so the caster's opposites are resolved HERE,
        // once, and travel with the circle — beside `saveDC` and for
        // the same reason it is recorded rather than recomputed: a
        // caster who later dies, leaves the scene or changes form does
        // not silently change what their standing aura opposes.
        //
        // EMPTY FOR A BALANCE OR UNALIGNED CASTER, deliberately, and
        // the card says so rather than granting a silent nothing.
        opposedTo: opposingTraitsOf(system),
        // WHAT THE CAST ALREADY ROLLED (3.428.1). Every creature caught
        // at the cast has made its save, and Graham's ruling is that it
        // is never asked again — so those degrees seed the record here.
        //
        // Driving 3.428.0 found this missing: the map was written only
        // by the ENTRY save, so the creatures the spell actually landed
        // on were the ones with no memory of having rolled. The first
        // step out and back in re-rolled a save the book rolls once,
        // which is the exact ruling the map exists to honour.
        tested: castSaveDegrees(spellSave),
        // THE MINIMUM THIS AREA HOLDS, if it holds one (3.429.0).
        floors: emanationFloors(spellData.effects),
        // WHAT A SUSTAIN BUYS, and WHEN THE CIRCLE ENDS (3.430.0).
        //
        // Protective Ward grows five feet per Sustain up to thirty,
        // and runs a flat minute that no lapse sweep watches — it is
        // not a "Sustained"-word spell. Both are stamped here, beside
        // the save and the floors, because this is the last point at
        // which the SPELL is in hand: `sustainSpellAction` sees only
        // the active-spell entry, and the turn sweep sees only the
        // emanation.
        //
        // `emanationExpiry` returns null for every sustained spell, so
        // the six emanations that were live before this release carry
        // no stamp and go on being ended by the lapse sweep alone.
        growth: spellGrowth(spellData),
        // WHAT A SUSTAIN MAY BUY, for a spell that offers a choice
        // rather than one fixed growth (3.435.0). Luminance is the
        // first: "+1d8 healing (max 5d8) OR remove 1 more bleed".
        sustainChoices: Array.isArray(spellData.sustainChoices)
          ? spellData.sustainChoices.map((c) => ({ ...c })) : [],
        maxDice: luminanceOpeningState(warpMods).maxDice,
        ends: emanationExpiry({
          duration: parseSpellDuration(durationText),
          worldTime: game.time?.worldTime ?? null,
          round: game.combat?.started ? game.combat.round : null
        }),
        // WARPED, NOT RAW (3.446.1). This carried the pack rows
        // untouched, so a caster who paid to raise a live emanation's
        // bonus got the printed value anyway — seven spells sold that
        // warp and all seven charged for nothing. The same arithmetic
        // the ordinary bonus applier uses, through the one function
        // both now call; see magic/spell-warp.mjs.
        effects: warpedEmanationEffects(liveEmanationEffects(spellData), warpMods),
        // THE SAVE A CREATURE OWES FOR BEGINNING ITS TURN HERE (3.609.0, R3),
        // frozen at the cast with its warped level ceiling, the caster's
        // level and the kind the spell is keyed at. See magic/turn-save.mjs.
        turnSave: turnSaveRecord(
          normaliseTurnSave((spellData.effects ?? []).find((e) => e?.kind === "turnSave") ?? null),
          { levelBump: warpMods?.levelBump, casterLevel, kindGate: spellData.kindGate }),
        // THE WARP THE CASTER MAY HAVE BOUGHT. Frozen means the list
        // drawn up at the cast stands wherever anybody walks.
        frozen: membershipFrozen(warpMods)
      });
      // SAID AT THE CAST, because the cast itself rolls nothing (3.609.0, R3).
      {
        const owed = getActiveSpells(actor).find((e) => e.id === castId)?.emanation?.turnSave ?? null;
        if (owed) {
          const { turnSaveAnnouncement } = await import("./turn-save.mjs");
          lines.push(line(turnSaveAnnouncement(owed, { radiusFeet: Number(placedArea.distance) || 0, dc: saveDC })));
        }
      }
      // THE OPENING DICE, if this spell grows them. Written after the
      // emanation record so both halves of one casting's state land
      // together — see magic/luminance.mjs.
      if (Array.isArray(spellData.sustainChoices) && spellData.sustainChoices.length) {
        const entries = getActiveSpells(actor);
        const mine = entries.find((e) => e.id === castId);
        if (mine) {
          mine.luminance = luminanceOpeningState(warpMods).luminance;
          await setActiveSpells(actor, entries);
  
          }
          lines.push(line(membershipFrozen(warpMods)
            ? "<em>The area's targets are fixed as cast — they keep the effect wherever they go.</em>"
            : "<em>The emanation follows you; its effect applies to those inside it.</em>"));
        }
      }
  }

  // THE SPELL ADDER LINE, UNCONDITIONALLY (3.332.1).
  //
  // It was first written inside the active-spell block above, which only
  // runs for a spell that LOCKS its PP or is sustained. Found live: a
  // Jump paid for by a Spell Adder posted "0 PP spent" and said nothing
  // about why, because Jump neither locks nor sustains. The card is the
  // only place a player learns a daily resource was spent on their
  // behalf, and "0 PP" with no explanation reads as a bug in the cost.
  //
  // OUTSIDE `if (outcome.cast)` too, and deliberately: the use is spent
  // when the offer is taken, so a cast that then FAILS has still cost the
  // player one of the day's free casts and must say so.
  if (adderSummary) {
    lines.push(line(
      `<em><strong>Spell Adder:</strong> ${adderSummary.saved} PP paid by `
      + `${adderSummary.sources.map((x) => x.label).join(", ")} — `
      + `${adderSummary.left} free cast${adderSummary.left === 1 ? "" : "s"} left today.</em>`
    ));
  }

  // THE SPELL'S OWN TEXT, when the engine applied nothing (3.392.0).
  //
  // Placed here because it is the last thing before the card is built,
  // so it sits under whatever the cast DID report rather than above it,
  // and only fires when there was nothing to report. Graham's ruling of
  // 25 August 2026: post the text, not a "no mechanical effect"
  // disclaimer — the latter reads as a broken system to anyone who does
  // not know it is deliberate.
  if (outcome.cast) {
    for (const paragraph of narrationLines(spellData)) {
      lines.push(line(`<em>${esc(paragraph)}</em>`));
    }
  }

  const cardRolls = [
    ...(spellAttack?.rolls ?? []),
    ...(spellSave?.rolls ?? []),
    ...spellEffectRolls
  ];
  // A SECRET SPELL'S RESULT IS THE GM'S TOO (3.622.1, G5 of the 3.622.0
  // drive). The casting check went out blind, and then the public Result card
  // said "(Critical: base halved)" — the degree the blind roll was hiding.
  // The card is whispered to the GM, and the table is told only that the
  // spell was cast.
  if (secretRollMode(spellData)) {
    const gms = ChatMessage.getWhisperRecipients?.("GM")?.map((u) => u.id) ?? [];
    await postCard(actor, `${spell.name} — Result`, lines, cardRolls, { whisper: gms });
    await postCard(actor, spell.name, [line(`<em>${esc(spell.name)} is cast — a Secret spell: the GM resolves it out of sight.</em>`)]);
  } else {
    await postCard(actor, `${spell.name} — Result`, lines, cardRolls);
  }

  // A critical spell attack adds the full critical injury, exactly as a weapon
  // critical does — rollCriticalInjury is built to be driven directly by a
  // spell (it posts its own injury card).
  // AND ONLY IF THE SPELL DEALS DAMAGE. Graham's ruling of 25 August
  // 2026 on Sickly Ray — "This spell inflicts no actual HP damage" —
  // "so it inflicts no critical as it inflicts no damage". An injury is
  // a wound and a wound needs damage; without this a spell that deals
  // none could critically hit for zero and still maim its target, which
  // is exactly what the live pass caught Tanglefoot doing.
  /*
   * ONE INJURY PER RAY THAT CRITTED (3.600.0, Graham's R13).
   *
   * A volley can crit more than one creature, and a critical injury belongs to
   * the blow that scored it. Reading only `spellAttack.critical` would have
   * given the first crit's injury to the first ray's target and dropped the
   * rest — which for a three-ray volley is two injuries silently lost.
   *
   * `rays` is absent on a one-ray cast, so the list is the single result and
   * this behaves as it always did.
   */
  const injuryRays = Array.isArray(spellAttack?.rays) && spellAttack.rays.length
    ? spellAttack.rays
    : (spellAttack ? [spellAttack] : []);
  for (const ray of injuryRays) {
    if (!ray?.critical || !ray.targetActor) continue;
    if (!spellInflictsCriticalInjury(spellData)) continue;
    await rollCriticalInjury(actor, {
      targetActor: ray.targetActor,
      damageType: ray.damageType,
      severity: ray.critical.severity,
      attackBonus: check.outcome?.total ?? 0,
      armourBypass: ray.armourBypass ?? [],
      armourBypassSource: spell.name,
      // THE SECOND RESONANCE TRIGGER (page 245). A 66 on this injury
      // roll is a Resonance Event because a SPELL scored it.
      spellResonance: resonanceContext
    });
  }

  if (chaos) {
    await rollResonanceEvent(actor, { reason: "Chaos on the casting check", modifiers: resonanceContext });
  }

  /*
   * A SPELL THAT CALLS A RESONANCE EVENT ON ITS OWN NUMBER (3.595.0).
   *
   * Shadow Walk, page 315: "traversing the plane of shadow in this way can
   * often draw unwanted attention and a Resonance Event occurs if you roll
   * a 13 on the Spellcraft check."
   *
   * THE UNMODIFIED FACE, like chaos above and like the critical injury's
   * 66: "roll a 13" is the die, not the total. `faces[0]` is the first draw
   * of the open-ended chain, so a 13 that exploded upward still counts —
   * it was still rolled.
   *
   * NO GUARD FOR "was a check rolled at all": an innate cast or a
   * no-check cantrip has no faces, and 0 is not 13.
   */
  {
    const resonanceFace = Math.trunc(Number(spellData?.resonanceOnNatural) || 0);
    if (resonanceFace > 0 && Number(check?.dice?.faces?.[0] ?? 0) === resonanceFace) {
      await rollResonanceEvent(actor, {
        reason: `${spell.name} — a natural ${resonanceFace} on the Spellcraft check`,
        modifiers: resonanceContext
      });
    }
  }

  if (outcome.fumbleRoll) {
    await rollSpellFumble(actor, {
      tradition,
      blunder: outcome.fumbleModifier > 0,
      pp: totalPP,
      focusPenalty: focusFumblePenalty(system.magic),
      // THE +20 ROW THAT NOTHING COULD REACH (3.585.0, page 244). The
      // Spell Fumble Modifiers table has carried "Spell Ritual +20"
      // since the table was transcribed, and `rollSpellFumble` has
      // accepted a `ritual` flag for as long — and NO CALLER ANYWHERE
      // passed it, because a ritual's fumble never reached the fumble
      // table at all. It posted "the ritual fails" and stopped.
      ritual: Boolean(ritual),
      resonanceContext
    });
  }

  if (overcast && (outcome.cast || ppSpent)) {
    await rollSacrificeSave(actor, { pp: totalPP, ppOver: overcast });
  }

  /*
   * THE REGION THE TEMPLATE DREW IS RELEASED UNLESS SOMETHING CLAIMED IT
   * (3.480.0).
   *
   * Found by driving 3.479.1: three casts of Missile Storm left three
   * Regions on the Charnel House, permanently. `placeSpellTemplate`
   * creates a Region for every area spell and deletion existed only for
   * emanations and creature auras — so of the pack's 152 area spells,
   * 113 littered the scene on every cast, silently and for ever.
   *
   * IT RUNS LAST, AFTER EVERY CLAIMANT HAS HAD ITS TURN. The hazard, the
   * nexus and the area rider all record onto this Region hundreds of
   * lines above; asking before them would delete the mechanism out from
   * under the spell that just placed it.
   *
   * See magic/area-region-life.mjs for why the default is to clean up.
   */
  // THE MODE'S ROWS DECIDE WHAT CLAIMS THE REGION (3.609.2, G3 of the 3.609.1
  // drive). Rock to Mud's difficult terrain lives on its mode; asked about the
  // spell's own rows, nothing claimed the Region and the mud was deleted the
  // moment it was laid.
  if (shouldClearAreaRegion(placedArea?.regionId, { effects: effEffects }, emanationIsLive(spellData), castRefunded)) {
    try {
      await canvas.scene?.deleteEmbeddedDocuments("Region", [placedArea.regionId]);
    } catch (error) {
      // SWALLOWED, AND SAID SO. A Region that cannot be removed is litter;
      // a throw here would lose the whole cast's result after the damage
      // has already been applied.
      console.warn("TRG Prime | the spell area region could not be released", error);
    }
  } else if (placedArea?.regionId && !emanationIsLive(spellData)) {
    /*
     * A KEPT REGION IS GIVEN AN ENDING (3.500.0).
     *
     * THE HALF 3.480.0 DID NOT DO. The clean-up above made an UNCLAIMED
     * Region temporary, and nothing ever deleted a claimed one — so the
     * six spells that claim theirs left a Region behind for ever, and
     * every one of them prints a finite duration (Consecrate a day,
     * Verdant Retribution a minute). Not one is permanent by design; what
     * was missing was never a reason to keep the Region, only a moment to
     * let it go.
     *
     * A LIVE EMANATION IS EXCLUDED because it already has an ending:
     * `emanation-workflow` deletes its Region when the spell ends, and a
     * second clock on the same document is the two-clocks defect 3.476.0
     * paid for on effects.
     *
     * AN UNCOUNTABLE DURATION GETS NO STAMP and is left alone for ever,
     * which is `stampRegionExpiry`'s own refusal. Litter is invisible and
     * annoying; a wall that vanishes mid-fight on a clock nobody set is a
     * rules dispute, and that is the worse direction for a mistake to
     * point.
     */
    const parsedForRegion = parseSpellDuration(warpedDurationText(spellData?.duration, warpMods));
    const { stampRegionExpiry } = await import("./region-expiry-workflow.mjs");
    await stampRegionExpiry(placedArea.regionId, {
      castId,
      spellName: spell.name,
      ends: endsStamp({
        seconds: parsedForRegion?.seconds ?? null,
        rounds: parsedForRegion?.rounds ?? null,
        worldTime: Number(game.time?.worldTime ?? 0),
        round: game.combat?.started ? Number(game.combat.round ?? 0) : null
      })
    });
  }

  /*
   * THE CASTING, PAID FOR AND OVER (3.672.0; C5b). `trgPrimeSpellCast` fires
   * before the cost is known; Inner Tempest's Disrupt Soul needs it — "1d8
   * per PP spent" (Graham's B8-5: the PP actually spent, a Partial's lower
   * cost included). Fired HERE, last, whatever the degree — "each time the
   * target casts a spell" is the attempt — and after the last point a cast
   * can be refunded (the target picker, review), saying `refunded` so a
   * refunded cast is not answered as a paid one. `innate` is true for an
   * innate spell or an item's.
   */
  Hooks.callAll("trgPrimeSpellSettled", {
    actor, spell, spellData, degree,
    cast: Boolean(outcome.cast),
    ppSpent,
    refunded: Boolean(castRefunded),
    innate: Boolean(isInnate),
    itemCast: Boolean(isItemCast),
    level: characterLevel,
    // WHAT WAS BOUGHT (3.672.0): a module's own warp reads its `unlocks`
    // (Inner Tempest's Arrows Flight, "+4 PP: projectiles up to a large size").
    warpMods
  });
  // `spellSave` rides along so a caller that needs the DEGREE each target
  // rolled — not just who failed — can read it without re-deriving anything.
  // AND THE WARPS IT WAS CAST WITH (3.612.0, R4): Fateful Temptation's bonus
  // is read from them by the save it answered.
  // The cast is over: a resistance it ignored is honoured again (3.630.0).
  { const { clearResistanceBypass } = await import("../combat/damage-workflow.mjs"); clearResistanceBypass(); }
  return { ...outcome, ppSpent, check, spellSave, refunded: castRefunded, warpMods };
}

/**
 * Resolve an attack spell against the current target once the spell is cast.
 * The cast check total is the attack roll; compared against the target's DB it
 * hits, misses, or critically hits (attackOutcome, the same core weapons use).
 * On a hit the spell's structured `damage` is rolled and applied through the
 * shared defence + dying pipeline. Returns the damage rolls and, on a critical,
 * the target and severity so the caller can add the injury after the card.
 *
 * @returns {Promise<{rolls: Roll[], critical: object|null, targetActor: Actor|null, damageType: string}|null>}
 */
/**
 * One spell attack, against one creature.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE FOUR OPTIONS AFTER `specialistUplift` EXIST FOR A VOLLEY (3.600.0,
 * Graham's R13).
 *
 * Scorching Ray fires up to three rays at three different targets from one
 * cast, and "you don't increase your multiple attack penalty until after your
 * spell attacks have been resolved". Rather than cut this 440-line function
 * in half, a volley calls it once per ray and tells it four things:
 *
 *   targetOverride   resolve against THIS creature, not `targets[0]`
 *   mapCount         the penalty count as it was BEFORE the volley
 *   deferMapAdvance  do not advance it; the volley does that once, by N
 *   quiet            do not repeat the per-cast lines on later rays
 *
 * Everything between the target selection and the damage depends only on the
 * caster, so running it per ray gives every ray the same attack total — which
 * is exactly what the deferral clause describes. See magic/ray-volley.mjs.
 */
/**
 * A VOLLEY OF SPELL ATTACKS FROM ONE CAST (3.600.0, Graham's R13).
 *
 * Reads the ray count, picks that many DISTINCT targets, freezes the multiple
 * attack penalty, resolves one ray against each, then advances the penalty once
 * by the number of rays that actually flew.
 *
 * A VOLLEY OF ONE IS THE OLD BEHAVIOUR EXACTLY, which is how every other attack
 * spell in the pack keeps working: `rays` defaults to 0, `raysForAP` floors it at
 * one, and a single ray takes the ordinary path with nothing frozen and nothing
 * deferred.
 */
async function resolveSpellVolley(actor, spell, check, lines, clMods = null, warpMods = null, opts = {}) {
  const { raysForAP, volleyTargets, volleyMapAdvance, volleyOpeningLine, volleyClosingLine,
    volleyNoTargetsLine } = await import("./ray-volley.mjs");
  const rays = raysForAP(opts.rays);
  if (rays <= 1) return resolveSpellAttack(actor, spell, check, lines, clMods, warpMods, opts);

  const marked = Array.from(game.user?.targets ?? []).map((t) => t.actor ?? null);
  const picked = volleyTargets(marked, rays);
  if (!picked.length) {
    lines.push(line(volleyNoTargetsLine(spell.name)));
    return null;
  }

  // FROZEN BEFORE THE FIRST RAY, so every ray rolls at the same penalty —
  // "you don't increase your multiple attack penalty until after your spell
  // attacks have been resolved."
  const mapBefore = attackCountOf(actor);
  lines.push(line(volleyOpeningLine(spell.name, rays, picked.length)));

  const results = [];
  for (const [index, targetActor] of picked.entries()) {
    const result = await resolveSpellAttack(actor, spell, check, lines, clMods, warpMods, {
      ...opts,
      targetOverride: targetActor,
      mapCount: mapBefore,
      deferMapAdvance: true,
      // THE PER-CAST LINES ONCE, on the first ray. The penalty note, the
      // Aggressive Magic note and the bonus pool describe the CAST, not the
      // ray, and three copies of each would bury the three attacks.
      quiet: index > 0
    });
    if (result) results.push(result);
  }

  // AND NOW IT CLIMBS, by the number of rays that actually flew rather than the
  // number bought: a caster who paid three actions and found two targets has
  // made two attacks, and the page counts attacks.
  const { spellCountsTowardMAP: counts } = await import("../combat/attack.mjs");
  const advance = volleyMapAdvance(results.length);
  if (advance && counts(spell.system)) {
    await setAttackCount(actor, mapBefore + advance);
  }
  lines.push(line(volleyClosingLine(results.length, mapBefore)));

  /*
   * THE FIRST RAY'S RESULT LEADS, with every ray beside it.
   *
   * The three things downstream read — the effect framework's recipients, the
   * rolls on the card, and a critical injury — each want something different
   * from a volley, so `rays` carries them all and the flat fields keep a
   * one-ray cast behaving as it always did.
   */
  return {
    rolls: results.flatMap((r) => r.rolls ?? []),
    critical: results.find((r) => r.critical)?.critical ?? null,
    targetActor: results[0]?.targetActor ?? null,
    damageType: results[0]?.damageType ?? "",
    rays: results
  };
}

/**
 * THE CASTER'S OWN SPELL-DAMAGE RIDERS (3.625.0) — see
 * magic/caster-damage-riders.mjs. Called by both damage paths after the
 * blow's own packet has landed; rolls each rider that joins it, resolves
 * it against the target as its own type, applies it, and burns the
 * per-creature marker.
 * @returns {Promise<number|null>} the target's HP after the riders, or null when none fired
 */
async function applyCasterSpellDamageRiders(actor, spell, target, { damageType, taken, rolls, lines }) {
  const riders = declaredSpellDamageRiders(Array.from(actor?.appliedEffects ?? actor?.effects ?? []));
  if (!riders.length) return null;
  const used = actor?.getFlag?.(SYSTEM_ID, SPELL_RIDERS_USED_FLAG) ?? {};
  const joining = spellDamageRidersFor(riders, {
    damageType, targetTypes: creatureTypesOf(target?.system ?? {}), taken, targetUuid: target?.uuid ?? "", used,
    tradition: String(spell?.system?.tradition ?? "")
  });
  if (!joining.length) return null;
  let newHP = null;
  for (const rider of joining) {
    const roll = await new Roll(rider.dice).evaluate();
    rolls.push(roll);
    const packet = resolveAgainstDefences(target.system ?? {}, {
      amount: roll.total,
      type: rider.damageType,
      creatureTypeSystem: ownedCreatureTypeSystem(target),
      ...spellDamageSource(spell, { targeted: true }),
      sourceTraits: ""
    });
    if (packet.taken > 0) newHP = (await applyDamageAndCheckDying(target, packet.taken, {}))?.newHP ?? newHP;
    lines.push(line(spellRiderLine(target.name, rider, packet.taken, packet.immune)));
    // A RIDER THAT LANDED (3.630.0), announced for a module to follow —
    // Pillars of Faith's Elemental Overflow spills Elemental Mantle's
    // secondary damage onto a second creature. Its lines join this card.
    if (packet.taken > 0) {
      const follow = [];
      globalThis.Hooks?.callAll?.("trgPrimeSpellRiderLanded", { caster: actor, target, rider, taken: packet.taken, spell, lines: follow });
      for (const l of follow) lines.push(line(l));
    }
  }
  if (actor?.setFlag) await actor.setFlag(SYSTEM_ID, SPELL_RIDERS_USED_FLAG, spellRidersBurnUpdate(joining, target?.uuid ?? "", used));
  return newHP;
}

async function resolveSpellAttack(actor, spell, check, lines, clMods = null, warpMods = null, {
  specialistUplift = 0, targetOverride = null, mapCount = null, deferMapAdvance = false, quiet = false,
  rays = 0, damageOverride = null,
  // THE DC A NEIGHBOUR SAVES AGAINST when a critical arcs (3.608.0). An
  // attack spell sets no save DC of its own, so the cast's nominal one is
  // handed in — the number a save against this spell would have used.
  splashSaveDC = null,
  // Bonus rows from the cast itself — the Rod of Accuracy (3.616.0).
  extraAttackRows = [],
  // The ability this cast rolled off (3.666.1) — see spell-damage-ability.mjs.
  castingAbilityKey = ""
} = {}) {
  const spellData = spell.system;
  // THE CHOSEN TYPE, WHEN THE CAST MADE A CHOICE (3.603.0). The same
  // override the save path takes, and for the same reason: Energy Bolt
  // prints a choice of four elements and the item can only carry one.
  const dmg = damageOverride ?? spellData.damage ?? {};
  // COLD UNDERWATER (3.622.0; Graham's R11 of block 39): "Cold spells cast
  // underwater crystalise and change their damage type to piercing."
  const { underwaterDamageType } = await import("../trait-rules.mjs");
  const { actorUnderwater } = await import("../trait-rules-workflow.mjs");
  const damageType = underwaterDamageType(dmg.type || "force", await actorUnderwater(actor));
  if (damageType !== (dmg.type || "force")) {
    lines.push(line(`<em>Cast underwater, ${spell.name} crystalises — its cold damage is piercing.</em>`));
  }
  // Caster-level auto-warp and paid warping options both fold into the roll and
  // damage: extra attack from caster level, extra damage dice from either.
  const attackWarp = Number(clMods?.attack ?? 0);
  // THE ROW'S OWN EXTRA FIRST (3.522.0), so Inflict's "or 1d8+8 for the
  // 2 AP version" grows the eight as well as the die. A row with no flat
  // term passes through untouched. See `warpedRowExtra`.
  // AND THE CASTER'S OWN ABILITY, where the row says so (3.611.0, R10) —
  // Guiding Stone's "2d6 plus your melee damage modifier". See
  // magic/spell-damage-ability.mjs.
  // …OR THE ABILITY THE CAST WAS MADE WITH (3.666.1): Hurling's "1d6 +
  // magical ability score", from the key castSpell resolved.
  const { withDamageAbility } = await import("./spell-damage-ability.mjs");
  const damageFormula = withDamageAbility(
    addDice(addDice(warpedRowExtra(dmg.formula, warpMods), clMods?.damageDice), warpMods?.damageDice),
    dmg, actor.system ?? {}, castingAbilityKey).formula;
  const warpPersistent = Number(warpMods?.persistent ?? 0);
  const targetActor = targetOverride ?? Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  if (!targetActor) {
    lines.push(line("<em>No target selected — resolve the attack against the target by hand.</em>"));
    return null;
  }

  /*
   * SANCTUARY (3.598.0, Graham's R1). A SPELL ATTACK IS AN ATTACK.
   *
   * Wired here as well as in the attack workflow because the alternative is
   * a ward that stops swords and not Magic Missile — a gap a player finds in
   * one session. The avoidance rule a few lines below already treats a
   * targeted spell and a weapon alike ("a targeted spell or effect"), and
   * "attempts to attack" is not narrower than that.
   *
   * THE AP IS ALREADY SPENT ON THIS PATH — a cast pays before it resolves —
   * so a failed save wastes the action by simply stopping here, and an
   * opponent already locked out stops here too. The distinction the attack
   * workflow has to draw does not arise.
   */
  {
    const { sanctuaryCheck } = await import("../combat/sanctuary-gate.mjs");
    const ward = await sanctuaryCheck(actor, targetActor, spell.name);
    if (ward.blocked) {
      lines.push(line(`<strong>${actor.name} cannot bring ${spell.name} to bear on `
        + `${targetActor.name}</strong> — ${ward.blockedBy ?? "Sanctuary"}.`));
      return null;
    }
    // A HOSTILE ACT ENDS THE TARGET'S FIXATION (3.621.0).
    const { endFixationOnHostileAct } = await import("../conditions/condition-events-workflow.mjs");
    await endFixationOnHostileAct([targetActor], actor);
  }

  // Hidden/Concealed (Appendix 2): a targeted spell lets the DEFENDER make
  // the avoidance flat check. Area effects never reach this path.
  // UNLESS THE CASTER HOLDS AN EDGE AGAINST IT (3.609.0) — True Target's
  // "ignores any penalties due to the creature being concealed or hidden".
  const { strikeEdgeFrom } = await import("./strike-edge.mjs");
  if (!strikeEdgeFrom(Array.from(actor.appliedEffects ?? actor.effects ?? []), targetActor?.uuid ?? "", SYSTEM_ID)?.ignoreConcealment) {
    const { missChanceAvoidance } = await import("../combat/targeting.mjs");
    const avoidance = await missChanceAvoidance(targetActor, {
      attackerName: actor.name,
      sourceName: spell.name,
      attackerActor: actor
    });
    if (avoidance.avoided) {
      lines.push(line(`<strong>${spell.name} doesn't affect ${targetActor.name}</strong> — ${avoidance.condition}, passed the DC ${avoidance.dc} avoidance flat check.`));
      return null;
    }
  }

  const targetSystem = targetActor.system ?? {};
  const baseDB = Number(targetSystem?.combat?.defence?.total ?? NaN);
  // Aggressive Magic (Class, Chapter 5): "+2 class bonus to the attack
  // roll" on elemental spell attacks (its +10 Fumble/Resonance rider and
  // 33-resonance rule stay on the feat's note).
  const aggressiveMagic = ["acid", "cold", "electricity", "fire"].includes(
    String(warpMods?.elementalType ?? damageType).toLowerCase()
  ) && Array.from(actor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "aggressive magic"
  ) ? 2 : 0;
  if (aggressiveMagic && !quiet) {
    lines.push(line("<em>Aggressive Magic: +2 class to this elemental spell attack (Fumble/Resonance checks at +10 — apply by hand).</em>"));
  }
  // SAID OUT LOUD, because it moves an attack roll the player watched land
  // and nothing else on the card would explain the difference.
  if (specialistUplift > 0 && !quiet) {
    lines.push(line(
      `<em>Specialist spell: +${specialistUplift} to the attack — your magical ability + level `
      + `is higher than your Spellcraft bonus.</em>`));
  }
  // ASSEMBLED, for the same reason the Casting DC is. `attackWarp` was
  // the silent one here — it comes from the CASTER LEVEL MODIFICATIONS
  // block, the least visible source on the card, while its two
  // neighbours each push their own line.
  // WHAT IS ALREADY MODIFYING THIS CREATURE'S ATTACK ROLLS (3.425.0).
  //
  // Graham, 27 August 2026: "bless seems to add its bonus to attack
  // checks but not those created by attack spells." A weapon Strike
  // builds its modifiers from `combat.attack.checkModifiers`; this path
  // is built from the Cast a Spell check and had never read the pool at
  // all, so Bless, Bane, Aid, Heroism, Divine Favour, Rage, Aim, Prone
  // and Fixated reached exactly one of the two things the book calls an
  // attack roll.
  //
  // STACKED HERE rather than summed: status and circumstance are
  // highest-wins, and the pool deliberately hands over the losers too so
  // a card can show what was discarded. Adding them raw would pay two
  // Blesses twice. See magic/spell-attack-bonus.mjs for which types
  // travel and why the rest do not.
  const { spellAttackBonusRows } = await import("./spell-attack-bonus.mjs");
  const { applyStacking } = await import("../dice/resolution.mjs");
  /*
   * AGAINST METAL (3.608.0, R3). Shocking Grasp: "If the target is wearing
   * metal armour or is made of metal, you gain a +1-circumstance bonus to
   * your attack roll". A circumstance bonus, so it joins the pool and is
   * stacked with whatever else is circumstance rather than added raw.
   */
  const metalSpec = normaliseMetalAffinity(dmg.metal);
  const targetIsMetal = metalSpec
    ? isMetalTarget(Array.from(targetActor.items ?? []), hasCreatureTrait(targetActor.system ?? {}, "metal"))
    : false;
  const metalRow = metalAttackRow(metalSpec, targetIsMetal, spell.name);
  // THE TARGET'S CONDITIONS, AND THE CASTER'S (3.621.0; Appendix 2, block
  // 39's R7): Prone's ±4 by distance, and a hidden caster's target
  // flat-footed to it. Circumstance rows, stacked with the rest. The
  // advantage half went into the casting check itself.
  const { attackTermsAgainst, distanceBetweenActors } = await import("../conditions/condition-events-workflow.mjs");
  const conditionRows = attackTermsAgainst(targetActor, actor, {
    distanceFeet: await distanceBetweenActors(actor, targetActor)
  }).rows;
  const stackedPool = applyStacking(
    spellAttackBonusRows(actor.system?.combat?.attack?.checkModifiers).concat(metalRow ? [metalRow] : [])
      .concat(conditionRows)
      .concat(Array.isArray(extraAttackRows) ? extraAttackRows : []), {});
  const poolRows = (stackedPool.modifiers ?? []).filter((row) => row.applied !== false);

  // THE MULTIPLE ATTACK PENALTY, on a spell (page 191; Graham's R1 of the
  // block-19 audit, 21 September 2026): "Any action which has the attack
  // trait counts towards the multiple attack penalty including disarm,
  // shove, spells etc."
  //
  // No spell in the pack writes the trait out, because for a spell the
  // trait IS this path: a spell that rolls its Cast a Spell total against
  // a Defence Bonus is making an attack roll. A save-only spell never
  // reaches here and is untouched, which is the other half of R1.
  //
  // The SAME counter a Strike keeps (`attackCount`, cleared at the end of
  // the turn), so Strike-then-bolt and bolt-then-Strike both ladder.
  // FROZEN FOR A VOLLEY. `mapCount` is the count as it stood before the first
  // ray, so every ray in one cast rolls at the same penalty.
  const mapBefore = mapCount ?? attackCountOf(actor);
  const spellMap = spellCountsTowardMAP(spellData) ? mapPenalty(mapBefore) : 0;
  if (spellMap && !quiet) {
    lines.push(line(
      `<em>Multiple attack penalty: ${spellMap} to the attack — `
      + `${mapBefore === 1 ? "your second" : "a subsequent"} attack this turn.</em>`));
  }

  // ALTER THE THREAD (3.667.0; Graham's B3-5): "any attack roll" — a spell
  // attack too. The cast itself stands; the dice the attack compares are
  // rolled again and the new roll stands. ASKED ON EVERY RAY, of that ray's
  // creature: each ray is an attack roll against it. The reroll is that
  // creature's alone (the shared check is not changed for the other rays),
  // and conviction's one point a round keeps one defender to one reroll of
  // a volley. See combat/attack-reroll-workflow.mjs.
  if (!check?.rerolledFrom) {
    const { offerAttackReroll, rerolledSpellCheck, postRerollCard } = await import("../combat/attack-reroll-workflow.mjs");
    const asked = await offerAttackReroll({ attacker: actor, defender: targetActor, check, what: spell.name, db: baseDB });
    if (asked.rerolled) {
      const before = Number(check.outcome?.total ?? 0);
      check = await rerolledSpellCheck(actor, check);
      await postRerollCard(targetActor, actor, asked.label, before, Number(check.outcome?.total ?? 0));
    }
  }
  const attackTotal = assembledSpellAttackTotal({
    checkTotal: check.outcome?.total,
    attackWarp,
    aggressiveMagic,
    specialistUplift,
    map: spellMap,
    poolRows
  });
  // AND THE LADDER CLIMBS: this attack counts toward the next one, hit or
  // miss — advanced here, before any of the outcome branches below can
  // return early.
  // A VOLLEY ADVANCES IT ONCE, BY THE NUMBER OF RAYS, after every ray has
  // resolved — "you don't increase your multiple attack penalty until after
  // your spell attacks have been resolved". See magic/ray-volley.mjs.
  if (!deferMapAdvance && spellCountsTowardMAP(spellData)) {
    await setAttackCount(actor, mapBefore + 1);
  }
  // A DEFENCE THAT LASTED ONE ATTACK (3.666.0) — the spell attack has been
  // rolled against the DB it raised. See combat/one-attack.mjs.
  {
    const { consumeOneAttackEffects } = await import("../combat/target-relay-workflow.mjs");
    await consumeOneAttackEffects(targetActor, { kind: "spell", attackerUuid: actor?.uuid ?? "" });
  }
  if (attackWarp && !quiet) {
    lines.push(line(`<em>Caster level modifications: ${attackWarp > 0 ? "+" : ""}${attackWarp} to the attack.</em>`));
  }
  // SAID OUT LOUD, like its three neighbours (3.425.0).
  //
  // The first version of this release collected the rows, added them to
  // the total, and pushed them into `assembledSpellAttackTotal`'s
  // `parts` — which NOTHING RENDERS. Each of the other three extras
  // pushes its own line here; the pool's did not, so the attack silently
  // moved from 17 to 18 with nothing on the card to account for it.
  // Found by driving it, not by the harness: the check asserted the
  // label was in the returned `parts` array, and it was. Being in that
  // array is not being on the card.
  for (const row of quiet ? [] : poolRows) {
    if (!Number(row.value)) continue;
    lines.push(line(
      `<em>${row.label}: ${row.value > 0 ? "+" : ""}${row.value} ${row.type} to the attack.</em>`));
  }
  // AND WHAT DID NOT APPLY, for the same reason. Two status bonuses do
  // not stack, and a player holding both should see which one lost
  // rather than wondering why the second did nothing.
  for (const row of quiet ? [] : (stackedPool.modifiers ?? [])) {
    if (row.applied !== false) continue;
    lines.push(line(
      `<em>${row.label} ${row.value > 0 ? "+" : ""}${row.value}: ${row.suppressed ?? "does not stack"}.</em>`));
  }
  const total = attackTotal.total;
  // A DRAGONHIDE SHIELD AGAINST ITS OWN DRAGON'S ENERGY (3.574.0). Page
  // 147: "an additional +2 DB when used against the energy type of the
  // dragon the scales were harvested from." A spell attack is where an
  // energy attack actually meets DB, so this is the site that matters
  // most. The type is the one the spell will DEAL — an elemental warp's
  // chosen element if there is one, the same reading Aggressive Magic
  // takes a few lines above — so a Fire Bolt warped to cold meets a Cold
  // dragon's shield, not a Fire one's.
  const dealtType = String(warpMods?.elementalType ?? damageType).toLowerCase();
  const dragonhideDB = dragonhideShieldDB(Array.from(targetActor.items ?? []), [dealtType]);
  if (dragonhideDB) {
    lines.push(line(
      `<em>${targetActor.name}'s Dragonhide shield: +${dragonhideDB} DB against ${dealtType}.</em>`));
  }
  // SPELL RESILIENCE (3.631.0): the target's class bonus to DB against a spell attack.
  const resilienceDB = spellResilienceModifiers(targetActor).reduce((sum, m) => sum + m.value, 0);
  if (resilienceDB) lines.push(line(`<em>${targetActor.name}'s Spell Resilience: +${resilienceDB} DB against magical attacks.</em>`));
  const defendedDB = Number.isFinite(baseDB) ? baseDB + dragonhideDB + resilienceDB : NaN;
  const outcome = attackOutcome({
    unmodified: check.dice?.unmodified ?? 0,
    total,
    db: Number.isFinite(defendedDB) ? defendedDB : null,
    proficient: true,
    criticalResistance: Number(targetSystem?.combat?.criticalResistance ?? 0)
  });
  if (!outcome.resolved) {
    lines.push(line(`<em>vs ${targetActor.name}: no Defence Bonus found — resolve the attack by hand.</em>`));
    return null;
  }
  if (!outcome.hits) {
    lines.push(
      line(
        `<strong>Miss</strong> vs ${targetActor.name} — attack ${total} vs DB ${defendedDB}${outcome.autoMiss ? " (natural 1)" : ""}.`
      )
    );
    return null;
  }

  const rolls = [];
  let dealt = 0;
  if (damageFormula) {
    const damageRoll = await new Roll(damageFormula).evaluate();
    rolls.push(damageRoll);
    dealt = damageRoll.total;
  }
  // THE BOLT'S OWN DICE, before the critical's extra and any splash — what
  // "half damage" to the neighbours is half OF (3.608.0).
  const boltRolled = dealt;
  /*
   * AND A CRITICAL ADDS BASE DAMAGE (3.585.1, page 247, Graham's
   * ruling of 23 September 2026).
   *
   * A weapon critical has always added bonus dice of the weapon's own
   * damage; a spell critical rolled the injury and added NOTHING. The
   * page says the Base Damage entry is what "determines additional
   * damage when warping the spell and inflicting criticals", so the
   * spell's equivalent of the weapon's die is its Base Damage.
   *
   * ADDED BEFORE `resolveAgainstDefences`, beside the splash and for
   * the same arithmetic reason: resistance HALVES, and halving two
   * instances is not halving their sum. One blow, resolved once.
   */
  let critBonus = 0;
  // GUARDED ON A SPELL'S CRITICAL TOO (3.673.0, C4; found in review): "the
  // wielder takes a critical hit" is any critical hit, and a spell attack's
  // critical adds its own dice here. Asked before they are rolled; on a yes
  // they are rolled, not dealt, and half is healed once the blow has landed.
  let guardedNegated = null;
  const critFormula = criticalBonusDamage(spell.system, outcome.critical?.severity ?? null);
  if (critFormula) {
    const { offerCriticalGuard } = await import("../combat/critical-guard-workflow.mjs");
    const guarded = await offerCriticalGuard(targetActor, actor, spell);
    const critRoll = await new Roll(critFormula).evaluate();
    rolls.push(critRoll);
    if (guarded) guardedNegated = { formula: critFormula, total: critRoll.total };
    else {
      critBonus = critRoll.total;
      dealt += critBonus;
    }
  }
  /*
   * SPLASH IS PART OF THE SAME BLOW (3.482.0).
   *
   * Graham reported from his table on 2 September 2026 that Orb Of Acid
   * "reported no splash damage" — the pack carried `effects: []` and the
   * printed "plus 1 splash acid damage" was read by nothing.
   *
   * IT IS ADDED BEFORE `resolveAgainstDefences`, NOT APPLIED SEPARATELY,
   * and that is arithmetic rather than tidiness: resistance HALVES, and
   * halving two instances is not halving their sum — 5 and 1 resolve to
   * 2 + 0 = 2 apart, and to 3 together. The book's own sentence is one
   * blow ("1d6 acid damage plus 1 splash acid damage"), so it is
   * resolved as one.
   *
   * See magic/splash.mjs for Graham's ruling and why the radius is still
   * the GM's.
   */
  const splashSpec = normaliseSplash(
    (spell.system?.effects ?? []).find((e) => e?.kind === "splash") ?? null
  );
  // × THE CRITICAL'S SEVERITY (3.622.0; block 39's A20).
  const splashDealt = splashOnHit(splashTotal(splashSpec, Number(clMods?.steps ?? 0)), outcome.critical?.severity ?? null);
  dealt += splashDealt;
  const packet = resolveAgainstDefences(targetSystem, {
    amount: dealt,
    type: damageType,
    creatureTypeSystem: ownedCreatureTypeSystem(targetActor),
    /*
     * WHAT THIS SPELL IS, AS A SOURCE (3.548.0).
     *
     * `targeted: true` because this function is the attack-roll path —
     * Graham's ruling is that targeted means "any attack that requires
     * an attack roll to hit (weapon or spell)", and that is decided by
     * the path rather than the spell, since the same spell may resolve
     * as a save elsewhere.
     */
    ...spellDamageSource(spell, { targeted: true })
  });
  // Bracers of Armour absorb what their DR stopped (3.617.0, R17).
  const bracersLine = await drainBracers(targetActor, packet);
  let newHP = null;
  if (packet.taken > 0) {
    const applied = await applyDamageAndCheckDying(targetActor, packet.taken, {
      isCritical: Boolean(outcome.critical),
      // For a death guard (3.627.0): the type, and the caster it is opposed by.
      damageTypes: [String(damageType ?? "").toLowerCase(), ...divineDamageMark(spellDamageSource(spell).sourceTraits)].filter(Boolean), sourceLevel: Number(actor?.system?.identity?.level ?? 0), sourceName: actor?.name ?? "", sourceUuid: actor?.uuid ?? "", context: { kind: "spell", spellName: spell?.name ?? "" }
    });
    newHP = applied?.newHP;
  }
  if (guardedNegated) {
    const { criticalGuardHeal } = await import("../combat/critical-guard-workflow.mjs");
    const heal = criticalGuardHeal(guardedNegated.total);
    const { relayHeal } = await import("../combat/target-relay-workflow.mjs");
    const { healActor } = await import("./spell-effects.mjs");
    if (heal > 0) {
      const healed = await relayHeal(targetActor, heal, {}, () => healActor(targetActor, heal));
      // The card's "Now X HP" counts the heal (relayHeal answers how much it healed).
      if (newHP !== null && Number.isFinite(Number(newHP))) newHP = Number(newHP) + (Number(healed) || 0);
    }
    lines.push(line(`<strong>Guarded:</strong> ${targetActor.name} negates the critical's extra damage (${guardedNegated.formula} = ${guardedNegated.total}) and heals <strong>${heal}</strong>.`));
  }
  const critLabel = outcome.critical
    ? ` <strong>Critical Hit (${outcome.critical.severity})</strong>`
    : "";
  lines.push(
    line(
      `<strong>Hit</strong> vs ${targetActor.name} — attack ${total} vs DB ${defendedDB}${outcome.autoHit ? " (natural 20)" : ""}.${critLabel}`
    )
  );
  /*
   * THE FORMULA MUST PRODUCE THE NUMBER BESIDE IT (3.484.0).
   *
   * The splash is added to `dealt` above, so a damage line reading
   * "(3d6, warped)" next to a 16 that includes 3 splash is a formula
   * that does not add up. Driving 3.483.0 printed exactly that. The
   * splash now appears in the formula it is part of.
   */
  const splashNote = splashFormulaNote(splashSpec, splashDealt);
  // NO DAMAGE LINE FOR A SPELL THAT DEALS NONE (3.614.1, F4 of the 3.614.0
  // drive). Sickly Ray's critical read "Critical Hit (deadly) 0 force damage."
  // above the conditions it actually inflicts — a number the spell never had.
  if (damageFormula || packet.taken > 0) lines.push(
    line(
      packet.immune
        ? `${targetActor.name} is <strong>immune</strong> to ${damageType} — no damage.`
        /*
         * THE CRITICAL'S OWN DICE ARE NAMED (3.585.2).
         *
         * FOUND IN THE 3.585.1 LIVE TEST. A deadly critical read
         * "44 acid damage (4d6 + 2 splash)" — and 4d6 plus 2 splash
         * cannot reach 44. The three base-damage dice the critical
         * added were doing a third of the damage and appearing
         * nowhere, so a table checking the arithmetic against the card
         * would have found the card wrong.
         *
         * This project's standing rule is that a card says where its
         * number came from. The number was right and the sentence
         * beside it was not.
         */
        : `<strong>${packet.taken}</strong> ${damageType} damage${damageFormula ? ` (${damageFormula}${clMods?.damageDice || warpMods?.damageDice ? " warped" : ""}${critFormula ? ` + ${critFormula} critical` : ""}${splashNote})` : ""}${newHP != null ? ` — now ${newHP} HP` : ""}.`
    )
  );
  if (bracersLine) lines.push(bracersLine);
  /*
   * AND THE HOLY HALF, IF THE TARGET IS THE KIND IT IS AIMED AT
   * (3.595.0). Searing Ray's "extra 5d6 good damage" against a demon or
   * undead, Frostbound Shadow's "additional 5d6 evil" against a good
   * eternal — two spells, one rail. See magic/vs-trait-damage.mjs for why
   * this is a second PACKET and why `onlyVs` is not the key.
   *
   * AFTER THE MAIN BLOW, so the card reads in the order the damage
   * happened, and resolved against its own type so a fire-resistant demon
   * does not halve holy damage.
   */
  {
    const { normaliseVsTraitDamage, vsTraitDamageLine, vsTraitMatches, vsTraitSourceTraits } =
      await import("./vs-trait-damage.mjs");
    // THE TRAIT READER IS THE ONE EVERY OTHER RULE USES, imported here
    // rather than at the top because this is the only place in this file
    // that asks: `creatureTraits` resolves granted traits and synonyms, so
    // a Shape Of The Eternal caster in evil form reads as evil.
    const { hasCreatureTrait } = await import("../creature-traits.mjs");
    const vsSpec = normaliseVsTraitDamage(dmg?.vsTrait);
    const matched = vsSpec
      ? vsTraitMatches(vsSpec, (t) => hasCreatureTrait(targetActor.system, t))
      : [];
    if (vsSpec && matched.length) {
      const vsRoll = await new Roll(vsSpec.formula).evaluate();
      rolls.push(vsRoll);
      /*
       * WITHOUT THE SPELL'S OTHER DAMAGE WORDS (3.595.3, R11 of the
       * 3.595.2 drive). A Skeleton Warrior resisting FIRE halved Searing
       * Ray's GOOD dice, because the spell's own Fire trait travels with
       * every packet and the resistance matched the spell rather than the
       * damage. The trait match stays — it is what makes a Shadow weak to
       * divine take more from any divinity spell — and this packet alone is
       * resolved without the damage words that are not its own. See
       * magic/vs-trait-damage.mjs.
       */
      const vsPacket = resolveAgainstDefences(targetSystem, {
        amount: vsRoll.total,
        type: vsSpec.type,
        // THE SAME SOURCE AS THE BLOW IT RIDES — magical, targeted, the
        // school and the tradition — spelled out here rather than hidden
        // behind a variable, because `verify-defence-vocabulary` W1 reads
        // this call site to decide whether the damage declares itself
        // magical, and a spread it cannot see is a claim nobody can check.
        ...spellDamageSource(spell, { targeted: true }),
        // AND WITHOUT THE SPELL'S OTHER DAMAGE WORDS (R11).
        sourceTraits: vsTraitSourceTraits(spellSourceTraits(spell), vsSpec.type)
      });
      if (vsPacket.taken > 0) await applyDamageAndCheckDying(targetActor, vsPacket.taken, {});
      lines.push(line(vsTraitDamageLine(
        targetActor.name, matched, vsPacket.taken, vsSpec, vsPacket.immune)));
    }
  }
  // THE CASTER'S OWN RIDERS, AFTER THE BLOW AND THE HOLY HALF (3.625.0).
  await applyCasterSpellDamageRiders(actor, spell, targetActor, {
    damageType, taken: packet.taken, rolls, lines
  });
  /*
   * A CRITICAL THAT ARCS (3.608.0, R3). Shock Bolt: "If the attack inflicts
   * a critical injury, all adjacent targets who are wearing metal armour
   * take half damage (basic Reflex)."
   *
   * THROUGH `resolveSpellSave`, not a second save loop: the neighbours make
   * a basic save against this spell, and that function is where a basic
   * save against a spell is rolled — the reactions it offers, the traits
   * and tradition it tells the engine, the critical a fumble earns. A copy
   * here would be the save path with half of that missing.
   *
   * GATED ON THE INJURY, not merely the critical: a spell that inflicts no
   * critical injury (Graham's Sickly Ray ruling) cannot trigger a rider
   * that is worded "if the attack inflicts a critical injury".
   */
  const critSplash = normaliseCritSplash(dmg.critSplash);
  if (critSplash && outcome.critical && spellInflictsCriticalInjury(spellData)) {
    const struck = targetActor.token?.object ?? targetActor.getActiveTokens?.()[0] ?? null;
    const amount = critSplashAmount(critSplash, boltRolled);
    const caught = [];
    for (const t of (struck ? globalThis.canvas?.tokens?.placeables ?? [] : [])) {
      if (!t?.actor || t === struck) continue;
      if (caught.includes(t.actor)) continue;
      if (critSplashCatches(critSplash, {
        isStruck: t.actor === targetActor,
        feet: distanceBetween(struck, t),
        wearsMetal: wearsMetalArmour(Array.from(t.actor.items ?? []))
      })) caught.push(t.actor);
    }
    lines.push(line(critSplashLine(spell.name, amount, caught.map((a) => a.name), critSplash)));
    if (caught.length && amount > 0) {
      const saveName = critSplash.save.charAt(0).toUpperCase() + critSplash.save.slice(1);
      const arc = await resolveSpellSave(actor, {
        name: spell.name,
        uuid: spell.uuid,
        img: spell.img,
        system: {
          // THE STORED FIELDS, whether `system` is a plain object or a data
          // model whose fields a spread would not see.
          ...(spell.system?.toObject?.(false) ?? spell.system),
          defence: `${critSplash.basic ? "Basic " : ""}${saveName}`,
          damage: { formula: String(amount), type: damageType, persistent: "" },
          effects: [],
          area: "adjacent"
        }
      }, {
        saveDC: Number(splashSaveDC ?? 0) || 0,
        clMods: null,
        warpMods: null,
        lines,
        targets: caught
      });
      rolls.push(...(arc?.rolls ?? []));
    }
  }
  // AND THE NEIGHBOURS' SHARE FOLLOWS THE BLOW, rather than preceding
  // the hit it comes from.
  if (splashSpec && splashDealt > 0) {
    lines.push(line(packet.immune
      ? splashImmuneLine(splashSpec, targetActor.name)
      : splashNeighboursLine(splashSpec, splashDealt)));
  }
  // THE FIELD KEEPS ITS NAME, and the card does not (3.441.1). Core 3.7
  // renames the rule to RECURRING damage, so the line printed below says
  // recurring — but `system.damage.persistent` is a stored field on 692
  // spell entries and on every owned copy in every world, and renaming it
  // is a migration with nothing at the end of it that a player can see.
  // The book renamed a rule, not a column.
  const basePersist = String(dmg.persistent || "");
  // THE CASTER-LEVEL LADDER CLIMBS IT TOO (3.483.0). Orb Of Fire's
  // "and the persistent by 1" was read by nothing until now; see
  // magic/caster-level-mods.mjs.
  const persistExtra = warpPersistent + Number(clMods?.persistent ?? 0);
  const persistLabel = persistExtra
    ? /^\d+$/.test(basePersist)
      ? String((Number(basePersist) || 0) + persistExtra)
      : `${basePersist}${basePersist ? " + " : ""}${persistExtra}`
    : basePersist;
  if (persistLabel) {
    /*
     * ─────────────────────────────────────────────────────────────
     * IT IS APPLIED NOW, NOT ANNOUNCED (3.585.0, Graham's R10).
     *
     * This printed "Plus 1d4 recurring acid damage (applies on the
     * target's turns)" and did nothing else. The Recurring Damage
     * CONDITION exists, the end-phase engine deals it, critical
     * injuries apply it correctly and alchemical bombs apply it
     * correctly — spells alone announced it and walked away. Nine
     * spells carry a rider: Acid Arrow, Acid Bolt, Arc Of Fire,
     * Incandescence, Fire Storm, Shocking Grasp and three more.
     *
     * THROUGH `recurringAfterHit`, the same rule the bombs use — a
     * second recurring damage of the SAME type takes the higher
     * rather than stacking, and of a different type replaces. Writing
     * a second spelling of that here is how the two would come to
     * disagree.
     *
     * ─────────────────────────────────────────────────────────────
     * AND SOME RIDERS ARE CRITICAL-ONLY (Graham's R11).
     *
     * Acid Bolt: "on a critical hit, the target also takes 1 recurring
     * acid damage." The pack stored that as an unconditional rider, so
     * every hit carried it. `persistentOn: "critical"` is the field
     * that says otherwise; absent, the rider is unconditional as
     * before.
     */
    const criticalOnly = String(dmg.persistentOn ?? "").trim().toLowerCase() === "critical";
    if (criticalOnly && !outcome.critical) {
      lines.push(line(
        `<em>${persistLabel} recurring ${damageType} damage on a critical hit only — this was not one.</em>`));
    } else if (packet.immune) {
      lines.push(line(
        `<em>No recurring ${damageType} damage — ${targetActor.name} is immune to ${damageType}.</em>`));
    } else if (metalSpec?.recurringOnlyVsMetal && !targetIsMetal) {
      // SHOCKING GRASP'S RIDER IS THE METAL'S (3.608.0). The pack stored it
      // as unconditional, so every hit on anybody burned.
      lines.push(line(
        `<em>No recurring ${damageType} damage — ${targetActor.name} wears no metal armour and is not made of metal.</em>`));
    } else {
      const persistRoll = await new Roll(String(persistLabel)).evaluate();
      rolls.push(persistRoll);
      // "ON A CRITICAL HIT, DOUBLE THE RECURRING DAMAGE" — the rolled rider,
      // warp included, doubled once.
      const metalRider = metalRecurring(metalSpec, {
        isMetal: targetIsMetal, critical: Boolean(outcome.critical), amount: persistRoll.total
      });
      const amount = metalRider.amount;
      const existingEffect = Array.from(targetActor.effects ?? [])
        .find((e) => e.statuses?.has?.("recurring"));
      const existing = existingEffect
        ? {
          value: Number(existingEffect.getFlag(SYSTEM_ID, "value") ?? 0),
          damageType: existingEffect.getFlag(SYSTEM_ID, "damageType") ?? ""
        }
        : null;
      const next = recurringAfterHit(existing, amount, damageType);
      await targetActor.toggleStatusEffect("recurring", {
        value: next.value, damageType: next.damageType
      });
      lines.push(line(
        `Plus <strong>Recurring ${next.value} ${damageType}</strong> on ${targetActor.name}`
        + `${criticalOnly ? " (critical hit)" : ""}${metalRider.doubled ? " (doubled — critical hit)" : ""} — dealt in its end phase until a flat check ends it`
        + `${next.replaced ? ", replacing the recurring damage already there" : ""}.`));
    }
  }
  /*
   * WHAT THE INJURY TABLE MAY NOT SEE (3.608.0, R3). Sonic Bolt: "If the
   * attack inflicts a critical, it bypasses light armour when reading the
   * critical result", and a warp that climbs a step. Carried to the injury
   * roll with the result rather than applied here, because the injury is
   * rolled after the card, by the loop that rolls every ray's.
   */
  const armourBypass = armourBypassCategories(dmg.critArmourBypass, warpMods?.armourStep);
  return { rolls, critical: outcome.critical, targetActor, damageType, armourBypass };
}

/**
 * Parse a spell's `defence` string into a structured save.
 * "Basic Reflex" → {key:"reflex", basic:true}; "Will Negates" →
 * {key:"will", basic:false, negates:true}. Free-text that names no save
 * ("see below") returns null so the caller falls back to a by-hand note.
 * @param {string} raw
 * @returns {{key:string, basic:boolean, negates:boolean, label:string}|null}
 */
function parseSpellDefence(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/\b(fortitude|reflex|will)\b/i);
  if (!m) return null;
  return {
    key: m[1].toLowerCase(),
    basic: /\bbasic\b/i.test(s),
    negates: /\bnegat/i.test(s),
    label: s
  };
}

/**
 * Resolve a save spell against the current targets once it is cast. Each target
 * rolls the spell's save (Fortitude/Reflex/Will) against the Save DC. For a
 * BASIC-save spell carrying a damage formula, the spell's damage is rolled once
 * and each target takes it scaled by their result (`basicSavingThrow`:
 * crit-save → none, save → half, partial → full, failure → full + bonus dice +
 * a critical injury), applied through the shared defence + dying pipeline.
 * Non-basic saves (negates/condition) report pass/fail and leave the effect to
 * the effect engine (phase 3). Returns the damage rolls for the result card.
 *
 * @returns {Promise<{rolls: Roll[]}|null>}
 */

/**
 * The degrees the cast's own saves produced, keyed by token id.
 *
 * KEYED BY TOKEN, not by actor, because that is what the emanation's
 * membership is keyed by — an unlinked token has its own actor, and two
 * tokens of one actor stand in different places.
 *
 * A creature that saved and one that failed are BOTH recorded. The
 * record answers "has this creature rolled?", and a creature that passed
 * has; leaving it out would ask it again on its next step and let a
 * successful save buy one round of relief and another roll.
 */
function castSaveDegrees(spellSave) {
  const out = {};
  for (const result of spellSave?.results ?? []) {
    const token = (canvas?.tokens?.placeables ?? []).find((t) => t.actor === result.target);
    if (token && result.degree) out[token.id] = result.degree;
  }
  return out;
}

/**
 * The creatures in `targets` that this spell's own immunity rows do not
 * keep it off, with a card line for each one they do (3.612.0, F1 of the
 * 3.611.1 drive). A spell with no immunity row returns `targets` untouched.
 *
 * @param {string} spellName
 * @param {object[]} effects the rows this cast reads
 * @param {Actor[]} targets
 * @param {string[]} lines the card
 * @returns {Promise<Actor[]>}
 */
async function dropTemporarilyImmune(spellName, effects, targets, lines) {
  const { spellImmunityKeys, immunityStillRunning, immuneRefusedLine } = await import("./temp-immunity-row.mjs");
  const keys = spellImmunityKeys(effects, spellName);
  if (!keys.length) return targets;
  const { IMMUNITY_FLAG, immunityRemaining, describeRemaining } = await import("../temporary-immunity.mjs");
  const now = Number(game.time?.worldTime ?? 0);
  const kept = [];
  for (const target of targets) {
    const left = immunityStillRunning(target?.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG), keys, now, immunityRemaining);
    if (left > 0) {
      // ONCE PER CARD: the save path and the effect path both ask, and a
      // save that refused everyone hands the effect path the same list.
      const said = line(immuneRefusedLine(target.name, spellName, describeRemaining(left)));
      if (!lines.includes(said)) lines.push(said);
    } else kept.push(target);
  }
  return kept;
}

async function resolveSpellSave(actor, spell, { saveDC, clMods, warpMods, lines, targets: explicitTargets, damage: damageOverride = null, resonanceContext = null, regardlessTargets = null }) {
  const spellData = spell.system;
  const parsed = parseSpellDefence(spellData.defence);
  if (!parsed) {
    lines.push(line("<em>Save unclear from the spell — resolve it by hand.</em>"));
    return null;
  }
  // Area spells pass the tokens caught inside the template; single-target spells
  // fall back to the caster's manual targets.
  const isAreaResolution = explicitTargets !== null && explicitTargets !== undefined;
  let targets = (
    explicitTargets ?? Array.from(game.user?.targets ?? []).map((t) => t.actor)
  ).filter(Boolean);

  // Hidden/Concealed (Appendix 2): TARGETED spells let each defender make
  // the avoidance flat check; area effects are exempt by the rule's wording.
  if (!isAreaResolution && targets.length) {
    const { missChanceAvoidance } = await import("../combat/targeting.mjs");
    const remaining = [];
    for (const target of targets) {
      const avoidance = await missChanceAvoidance(target, {
        attackerName: actor.name,
        sourceName: spell.name,
        attackerActor: actor
      });
      if (avoidance.avoided) {
        lines.push(line(`<strong>${spell.name} doesn't affect ${target.name}</strong> — ${avoidance.condition}, passed the DC ${avoidance.dc} avoidance flat check.`));
      } else {
        remaining.push(target);
      }
    }
    targets = remaining;
    if (!targets.length) {
      lines.push(line("<em>Every target avoided the spell.</em>"));
      return null;
    }
  }

  // A CREATURE STILL IMMUNE TO THIS SPELL ROLLS NOTHING (3.612.0, F1 of the
  // 3.611.1 drive). Area and targeted alike: the immunity is to the spell,
  // not to being aimed at. See magic/temp-immunity-row.mjs.
  if (targets.length) {
    const before = targets.length;
    targets = await dropTemporarilyImmune(spell.name, spellData.effects, targets, lines);
    if (!targets.length && before) return null;
  }

  if (!targets.length) {
    // AN EMPTY AREA HAS ALREADY SAID SO (3.611.0, H1 of the 3.610.1 drive).
    // Wall Of Blades placed on nobody read "no eligible tokens inside" and
    // then "No target selected — each affected creature rolls … by hand",
    // two lines contradicting each other. The hand-roll instruction is for
    // a TARGETED spell cast with nothing targeted; an area that caught
    // nobody has nobody to roll.
    if (!isAreaResolution) {
      lines.push(
        line(
          `<em>No target selected — each affected creature rolls a ${parsed.label} save vs DC ${saveDC} by hand.</em>`
        )
      );
    }
    return null;
  }

  // A variable-AP mode (see apOptions) can override the save-damage — e.g. Inflict
  // deals 1d8 essence at 1/3 AP but 1d8+8 at 2 AP.
  const effectiveDamage = damageOverride ?? spellData.damage;
  let damageFormula = addDice(addDice(warpedRowExtra(effectiveDamage?.formula, warpMods), clMods?.damageDice), warpMods?.damageDice);
  /*
   * A BIGGER DIE, IF THE CASTER HAS ALREADY HURT SOMEBODY THIS TURN
   * (3.611.0, R5 of block 34). Destructive Roar: "1d8 sonic damage, which
   * is increased to 1d12 if you have successfully dealt damage to an
   * enemy earlier in the same turn through a Strike or spell", and its
   * warp "+1d8 (or 1d12)". Nothing tracks damage dealt, so — Graham's
   * ruling — the caster is asked. See magic/damage-die-upgrade.mjs.
   */
  {
    const { damageDieUpgrade, upgradedFormula } = await import("./damage-die-upgrade.mjs");
    const upgrade = damageDieUpgrade(effectiveDamage);
    if (upgrade && damageFormula) {
      const yes = await foundry.applications.api.DialogV2.confirm({
        window: { title: `${spell.name} — the bigger die` },
        content: `<p>${upgrade.ask}</p><p class="hint">Yes rolls d${upgrade.to} instead of d${upgrade.from}.</p>`,
        rejectClose: false
      }).catch(() => false);
      if (yes) {
        damageFormula = upgradedFormula(damageFormula, upgrade);
        lines.push(line(`<em>${spell.name}: ${upgrade.because} — the damage dice are <strong>d${upgrade.to}</strong>.</em>`));
      }
    }
  }
  // COLD UNDERWATER (3.622.0) — the attack path's rule, on the save path.
  const { underwaterDamageType: crystalised } = await import("../trait-rules.mjs");
  const { actorUnderwater: casterSubmerged } = await import("../trait-rules-workflow.mjs");
  const damageType = crystalised(effectiveDamage?.type || "force", await casterSubmerged(actor));
  const dieMatch = String(damageFormula).match(/d(\d+)\b/);
  const dieSize = dieMatch ? Number(dieMatch[1]) : 0;
  const isBasic = parsed.basic && Boolean(damageFormula);
  // THE SPELL'S OWN PRINTED LADDER, when it authored one (3.585.0).
  // Null for the 600-odd spells that print no such thing, which take
  // the basic-save arithmetic or the effect engine exactly as before.
  const saveLadder = normaliseSaveLadder(
    (spell.system?.effects ?? []).find((e) => String(e?.kind ?? "").toLowerCase() === "saveladder") ?? null
  );

  const rolls = [];
  let baseDamage = 0;
  /*
   * A SECOND POOL ON THE SAME SAVE (3.591.0). Meteor Swarm's 14d6 fire,
   * Sunburst's and Umbral Blast's 8d4 essence \u2014 all three printed two
   * numbers where the basic-save path rolls one. See
   * magic/secondary-damage.mjs; "the saving throw applies to both" is
   * the page's own sentence, so it is rolled here beside the primary and
   * scaled by the same degree below.
   */
  const secondary = normaliseSecondaryDamage(spell.system);
  let secondaryBase = 0;
  /*
   * DAMAGE THAT IS A CONDITION, AND WHAT THE IMMUNE TAKE INSTEAD (3.608.0,
   * R3). Sonic Rupture: "4d6 Bleed damage … Creatures which are immune to
   * bleed take 5d8 sonic damage instead (even those usually immune to such
   * damage)." See magic/attack-riders.mjs for the reading of "bleed
   * damage" as the Bleeding condition. The alternate is rolled ONCE, on the
   * first creature that needs it — one screech, one number, scaled by each
   * save exactly as the primary is.
   */
  const asCondition = isBasic ? normaliseConditionDamage(effectiveDamage?.asCondition) : null;
  const immuneAlternate = asCondition ? normaliseImmuneAlternate(effectiveDamage?.immuneAlternate) : null;
  let alternateBase = null;
  if (isBasic) {
    const dmgRoll = await new Roll(damageFormula).evaluate();
    rolls.push(dmgRoll);
    baseDamage = dmgRoll.total;
    lines.push(
      line(
        `Spell damage: <strong>${baseDamage}</strong> ${asCondition?.condition ?? damageType} (${damageFormula}${clMods?.damageDice ? ", caster-level warped" : ""}) — scaled by each save.`
      )
    );
    if (secondary) {
      // THE SECOND POOL'S OWN WARP (3.609.0, R4). Umbral Blast's "+1d4
      // essence" — and Sunburst's and Meteor Swarm's — rode a warp whose
      // `damageDice` reached the first pool only.
      const secondaryFormula = addDice(secondary.formula, warpMods?.secondaryDice);
      const secondRoll = await new Roll(secondaryFormula).evaluate();
      rolls.push(secondRoll);
      secondaryBase = secondRoll.total;
      lines.push(line(secondaryDamageLine({ ...secondary, formula: secondaryFormula })
        + ` Rolled <strong>${secondaryBase}</strong>.`));
    }
  } else if (saveLadder && ladderUsesSharedRoll(saveLadder) && damageFormula) {
    /*
     * ONE ROLL FOR A LADDER THAT PRINTS "HALF" AND "FULL" (3.606.0).
     *
     * Sound Burst's Success is "half damage" — half of what the burst
     * dealt, which is one number for everybody caught in it. Rolling per
     * target would give six creatures six different "full damage"s from
     * one explosion, so the roll is made here, once, exactly as the basic
     * branch above makes its own. See magic/save-ladder.mjs.
     */
    const sharedRoll = await new Roll(damageFormula).evaluate();
    rolls.push(sharedRoll);
    baseDamage = sharedRoll.total;
    lines.push(line(`Spell damage: <strong>${baseDamage}</strong> ${damageType} (${damageFormula}) `
      + "— each save takes its printed share."));
  } else if (secondary) {
    // A SECOND POOL WITH NO BASIC SAVE TO SCALE IT IS SAID, NOT DROPPED.
    // All three spells that carry one are Basic; a fourth authored
    // without the word would lose the pool in silence, which is the
    // defect this field was added to end.
    lines.push(line(`<em>${spell.name} declares secondary damage but has no basic save `
      + "to scale it — nothing rolled.</em>"));
  }

  // A SPELL WHOSE DAMAGE ONLY REACHES SOME CREATURES (3.460.0).
  //
  // Quench: "fire creatures take 4d8 damage (basic Fortitude)." Graham
  // ruled on 1 September 2026 that a fire creature is one IMMUNE TO FIRE,
  // which is the marker already populated on the creatures the spell is
  // about. Everyone else in the mist is spared entirely — they do not
  // roll, because a save implies something to resist.
  //
  // FILTERED HERE, BEFORE THE SAVES, so the card shows who was spared
  // rather than a column of pointless successful saves. See
  // magic/damage-scope.mjs.
  //
  // THE CASTER IS PASSED IN SINCE 3.552.4, because the second form of a
  // scope — Wash Away Sin's "creatures with an opposed aura" — is a
  // relationship rather than a property: whether your aura opposes mine
  // cannot be answered by looking at you alone.
  const scope = damageScope(spellData);
  let sparedByScope = [];
  if (scope) {
    const inside = [];
    for (const t of targets) {
      if (inDamageScope(scope, t.system ?? {}, ownedCreatureTypeSystem(t), actor?.system ?? {})) inside.push(t);
      else sparedByScope.push(t.name);
    }
    targets = inside;
    lines.push(line(`<em>${damageScopeLine(scope, sparedByScope)}</em>`));
  }

  // VAMPIRIC TOUCH'S HALF (3.609.0, R8): counted as each creature takes it.
  const { normaliseSiphon, siphonAmount } = await import("./life-transfer.mjs");
  const siphonRow = normaliseSiphon((spellData.effects ?? []).find((e) => e?.kind === "siphon") ?? null);
  let siphonTotal = 0;
  const failed = [];
  // WHAT EACH TARGET ROLLED, not merely whether they beat it. A spell whose
  // ladder grades its effect by degree — Cutting Words is the first — cannot
  // work from a pass/fail list, and reading the degree back off the chat card
  // afterwards would be a second answer to a question already decided here.
  const results = [];
  for (const target of targets) {
    const save = target.system?.combat?.saves?.[parsed.key];
    const saveName = `${parsed.key[0].toUpperCase()}${parsed.key.slice(1)}`;
    // A REACTION THE DEFENDER MAY SPEND, asked before the dice (3.320.0).
    //
    // Gnome Resistance — "use a reaction when targeted by a spell to gain
    // advantage to the saving throw" — is a DECISION rather than a fact,
    // so the conditional engine cannot carry it: it costs a resource and
    // has to be offered. It shipped as a Use action that spent the
    // reaction and told the player to tick Advantage "in the roll dialog",
    // and this roll opens no dialog, so the reaction bought nothing.
    //
    // `spellArea` rather than the presence of a template: "does not apply
    // to area effect spells" is about what the SPELL is, and a one-target
    // spell resolved without a template is still not an area effect.
    //
    // THE OFFER USED TO BE MADE HERE (3.356.0 moved it). It was a second
    // place deciding "may this defender answer the save", and once Evasion,
    // Juggernaut and Resolve joined the family the first place had to be
    // `TRGCheck.roll` — a trap, a fall and a breath weapon never come
    // through this function at all. Left here, a spell save would have been
    // offered the reaction twice. What this call site still owns is the one
    // fact the check cannot work out for itself: whether the SPELL is an
    // area effect.
    /*
     * "A REFLEX SAVING THROW OR AN ACROBATICS CHECK" (3.609.0, R10 —
     * Transmute Rock & Mud). The creature rolls whichever is better, read
     * off the totals the sheet already shows. A spell that names no
     * alternative rolls the save, as every spell did.
     */
    const altSkillKey = String(spellData.saveAlternative ?? "").trim();
    const altSkill = altSkillKey ? target.system?.skills?.[altSkillKey] : null;
    const altBetter = altSkill && Number(altSkill.total ?? -Infinity) > Number(save?.total ?? 0);
    const check = await TRGCheck.roll({
      actor: target,
      label: altBetter ? `${target.name} — ${altSkill.label ?? altSkillKey} (instead of ${saveName})` : `${target.name} — ${saveName} Save`,
      subtitle: `vs ${spell.name} — DC ${saveDC}`,
      type: "save",
      saveSource: spell.name,
      isArea: Boolean(String(spellData.area ?? "").trim()),
      // The spell's traits reach the conditional engine, so the Elf's
      // advantage against sleep magic and the Halfling's against fear
      // apply on a spell's own save — which never opens a configuration
      // dialog to ask in.
      traits: spell.system?.traits ?? "",
      // AND ITS TRADITION. This save never opens a dialog, so anything the
      // engine is not TOLD here can never be asked about either — which is
      // how the Ascendan's "-2 to saving throws against divine or verdant
      // magic" came to be authored, offered on a sheet roll, and silently
      // absent from the one roll that provoked it. Live on 15 Aug 2026 an
      // Ascendan made a Will save against Unwelcome Halo (divinity) and
      // the card read "Modifiers +0"; the save succeeded by exactly zero.
      traditions: spell.system?.tradition ?? "",
      // AND WHO IS CASTING IT (3.321.1). Thengar: "+1 racial bonus to your
      // DB and Saving Throws against the attacks of creatures of the
      // Undead Type." 3.321.0 built the `sourceTypes` axis and fed it from
      // exactly one place — the Coup de Grace save — so a Will save against
      // a spell cast BY an undead read "Modifiers +0" on 17 Aug 2026 with
      // the heritage on the sheet and the rule correctly authored.
      //
      // The same argument as the tradition line above, and it is the whole
      // reason both lines exist: this save opens no dialog, so an axis the
      // engine is not TOLD here is not merely un-applied — it can never be
      // ASKED about either. The bonus is not deferred to a tick box; it is
      // gone. Every fact about the source that a scope might turn on has to
      // arrive at the call, or the scope is decoration.
      //
      // A spell reaching THIS save is by construction an attack: a spell
      // its target saves against is not beneficial (see beneficial-save.mjs,
      // which returns false the moment `defence` is set), so the acceptance
      // save deliberately does NOT get this argument. "Against the attacks
      // of" is not "against the magic of" — an undead ally's Cure Wounds
      // must not hand a Thengar +1 to shrug it off.
      sourceTypes: creatureTypesOf(actor.system ?? {}),
      // AND WHO EXACTLY (3.406.0) — Forbidding Ward's "+1 to saving
      // throws against the TARGET ENEMY'S ... spells" is a claim about
      // one caster, not about a category of them.
      sourceUuid: actor?.uuid ?? "", context: { kind: "spell", spellName: spell?.name ?? "" },
      subject: parsed.key,
      dc: saveDC,
      modifiers: [
        ...(altBetter
          ? (altSkill.checkModifiers ?? [{ label: altSkill.label ?? altSkillKey, value: Number(altSkill.total ?? 0), type: "untyped" }])
          : (save?.checkModifiers ?? [
            { label: `${saveName} save`, value: Number(save?.total ?? 0), type: "untyped" }
          ])),
        // SPELL RESILIENCE (Creature Codex; 3.631.0): "a racial bonus equal
        // to its class bonus to all saving throws and DB against magical
        // attacks" — a spell's save is one.
        ...spellResilienceModifiers(target)
      ]
    });
    const degreeKey = check.outcome?.degree?.key ?? "partial";
    const degreeLabel = check.outcome?.degree?.label ?? degreeKey;
    const margin = check.outcome?.margin ?? null;
    const total = check.outcome?.total ?? 0;
    const saved = Boolean(check.outcome?.degree?.success);
    if (!saved) failed.push(target);
    results.push({ target, degree: degreeKey, label: degreeLabel, total, margin, saved });

    /*
     * ─────────────────────────────────────────────────────────────
     * A SPELL THAT PRINTS ITS OWN FOUR OUTCOMES (3.585.0, R12).
     *
     * Checked BEFORE the basic-save branch and before the non-basic
     * fallback, because a ladder is neither: it is the spell telling
     * us exactly what each degree does, which beats both the
     * none/half/full arithmetic and "report pass/fail and hope the
     * effect engine has something". Acid Cloud had nothing for the
     * effect engine to apply, so its ladder was prose and every
     * target took the Success rung's 1d6 flat.
     */
    if (saveLadder) {
      // "AS IF THE SAVING THROW WAS BASIC" (3.609.0): the severity the
      // basic arithmetic would give this degree and margin, offered to a
      // ladder that asks for it and ignored by every other.
      const outcome = saveLadderOutcome(saveLadder, degreeKey, {
        basicSeverity: saveLadder.basicCriticals ? basicSavingThrow(degreeKey, margin).criticalSeverity : null
      });
      /*
       * THE LADDER'S OWN DAMAGE TYPE (3.606.0). This branch read the
       * SPELL's `damage.type` and never the ladder's, which went unnoticed
       * only because every ladder before this release stored the same type
       * in both places. Slay The Soul stores no spell damage at all, so its
       * essence would have landed as `force` — the fallback above — and a
       * creature immune to force would have shrugged off a soul-draining
       * touch. The ladder names its type; that is the one used.
       */
      const ladderType = saveLadder.damageType || damageType;
      let taken = 0;
      let newHP = null;
      // THE ONE DOOR EVERY RUNG'S AMOUNT COMES THROUGH (3.606.0) — dice,
      // a share of the cast's roll, or a point per point of failure.
      const rungAmount = outcome.harmless
        ? { formula: null, fixed: null, why: "" }
        : ladderRungAmount(outcome, {
          shared: ladderUsesSharedRoll(saveLadder) && damageFormula ? baseDamage : null,
          margin,
          fromMargin: valueFromMargin
        });
      if (rungAmount.why) {
        // SAID, NOT SILENT: a rung that could not be measured is a rung
        // that did nothing, and the card must not look as if it worked.
        lines.push(line(`<em>${spell.name}: ${target.name}'s ${outcome.rung} rung deals `
          + `nothing — ${rungAmount.why}.</em>`));
      }
      let rungTotal = null;
      if (rungAmount.formula) {
        // THE RUNG'S OWN WARP (3.609.0) — Phantasmal Killer's "+1d6 on a
        // failure and +2d6 on a fumble".
        const rungRoll = await new Roll(addDice(rungAmount.formula, warpMods?.rungDice?.[outcome.rung])).evaluate();
        rolls.push(rungRoll);
        rungTotal = rungRoll.total;
      } else if (rungAmount.fixed !== null) {
        rungTotal = rungAmount.fixed;
      }
      if (rungTotal !== null) {
        // `rungPacket`, NOT `packet`. The basic-save branch below owns
        // that name, and `mutate-basic-save` anchors on its exact line —
        // a second copy made that anchor AMBIGUOUS and broke a check
        // that has nothing to do with this rule. Caught by the sweep.
        const rungPacket = resolveAgainstDefences(target.system ?? {}, {
          amount: rungTotal,
          type: ladderType,
          creatureTypeSystem: ownedCreatureTypeSystem(target),
          ...spellDamageSource(spell)
        });
        taken = rungPacket.taken;
        if (taken > 0) {
          const applied = await applyDamageAndCheckDying(target, taken, {
            isCritical: Boolean(outcome.severity),
            sourceUuid: actor?.uuid ?? "", context: { kind: "spell", spellName: spell?.name ?? "" }
          });
          newHP = applied?.newHP;
        }
      }
      lines.push(line(
        saveLadderLine(target.name, degreeLabel, outcome, taken, ladderType)
        + (newHP != null ? ` Now ${newHP} HP.` : "")));
      /*
       * A RUNG THAT KILLS (3.591.0). Massacre's fumble is four words:
       * "The creature dies." Not damage, not a condition with a clock.
       *
       * EXPRESSED THE WAY THIS SYSTEM ALREADY EXPRESSES DEATH \u2014 Dying
       * set past the effective Death State, then reaped \u2014 which is the
       * spelling `attack-workflow` uses for a Death critical. There is no
       * separate "dead" condition, and `isDead` is deliberately one
       * question with one answer, so a second path would be a second
       * thing to keep in step.
       *
       * AFTER THE DAMAGE LINE, so the card reads in the order the table
       * experiences it.
       */
      if (outcome.slays) {
        await target.toggleStatusEffect("dying", { value: actorDeathState(target) + 1 });
        const reaped = await reapDead(target, game.combat ?? null);
        lines.push(line(`<strong>${target.name} dies.</strong>`));
        if (reaped.removed) lines.push(line("<em>Removed from the initiative order.</em>"));
      }
      /*
       * A RUNG THAT IS A DESTINATION (3.606.0). Slay The Soul's Failure:
       * "reduced to 0 HP and gains the Dying condition." Through
       * `enterDyingAt`, the one door Word Of Death already uses, so the
       * Death State, the no-Death-State creatures and the reaper are all
       * asked exactly as they are for every other route to zero.
       */
      if (outcome.dropsTo !== null && outcome.dropsTo !== undefined && !outcome.slays) {
        const dropped = await enterDyingAt(target, outcome.dropsTo, { isCritical: Boolean(outcome.severity) });
        lines.push(line(`<strong>${target.name}</strong> is reduced to <strong>${dropped?.newHP ?? outcome.dropsTo} HP</strong>`
          + `${dropped?.dying ? ` and is <strong>Dying ${dropped.dying}</strong>` : ""}`
          + `${dropped?.case === "destroyed-no-death-state" ? " — with no Death State, it is destroyed" : ""}.`));
      }
      /*
       * AND A RUNG THAT DESTROYS THE SOUL (3.606.0). Written onto the body,
       * because the only moment it matters is somebody casting
       * Resurrection on it later — see magic/resurrection.mjs.
       */
      if (outcome.soulDestroyed) {
        const { SOUL_DESTROYED_FLAG, soulDestroyedRecord, soulDestroyedByLine } = await import("./resurrection.mjs");
        // THROUGH THE GM WHEN THE BODY IS NOT OURS (3.666.1): a direct write
        // from a player's cast threw and lost the whole card.
        const { relayInjuryRecord } = await import("../combat/target-relay-workflow.mjs");
        const worldTime = Number(game.time?.worldTime ?? 0);
        await relayInjuryRecord(target, "soulDestroyed", { spellName: spell.name, worldTime },
          () => target.setFlag?.(SYSTEM_ID, SOUL_DESTROYED_FLAG, soulDestroyedRecord(spell.name, worldTime)));
        lines.push(line(soulDestroyedByLine(target.name, spell.name)));
      }
      /*
       * THE CRITICAL LANDS WHEN DAMAGE DID — OR WHEN THE RUNG HAD NONE TO
       * DEAL (3.606.0). A rung with dice whose damage was all resisted
       * still lands no injury, exactly as before. A rung with no dice at
       * all — Soul Destruction's "4d10 Soul Drain and a minor critical" —
       * prints a critical that no damage roll stands in front of, and
       * gating it on `taken > 0` would have made it unreachable.
       */
      if (outcome.severity && (taken > 0 || (!outcome.dice && !outcome.slays))) {
        results[results.length - 1].critical = true;
        await rollCriticalInjury(actor, {
          targetActor: target,
          damageType: ladderType,
          severity: outcome.severity,
          attackBonus: saveDC,
          modifier: outcome.modifier,
          spellResonance: resonanceContext
        });
      }
      /*
       * THE RECURRING RIDER, BY RUNG (3.609.0, R2). Incandescence: none on
       * a Success, full on a Failure, double on a Fumble. The rider is the
       * spell's own `damage.persistent` with its warp, rolled per creature
       * (each holds its own hot metal), multiplied by the rung, and laid
       * through `recurringAfterHit` exactly as the attack path lays one.
       */
      if (outcome.persistent > 0) {
        const ladderPersist = String(effectiveDamage?.persistent || "");
        const ladderPersistExtra = Number(warpMods?.persistent ?? 0) + Number(clMods?.persistent ?? 0);
        const ladderPersistFormula = addDice(ladderPersistExtra
          ? (/^\d+$/.test(ladderPersist)
            ? String((Number(ladderPersist) || 0) + ladderPersistExtra)
            : `${ladderPersist}${ladderPersist ? " + " : ""}${ladderPersistExtra}`)
          : ladderPersist, warpMods?.persistentDice);
        const rungImmune = actorDefences(target.system ?? {}, ownedCreatureTypeSystem(target)).immunities.has(ladderType);
        if (!ladderPersistFormula) {
          lines.push(line(`<em>${spell.name}'s ${outcome.rung} rung names recurring damage the spell does not carry.</em>`));
        } else if (rungImmune) {
          lines.push(line(`<em>No recurring ${ladderType} damage — ${target.name} is immune to ${ladderType}.</em>`));
        } else {
          const rungPersistRoll = await new Roll(ladderPersistFormula).evaluate();
          rolls.push(rungPersistRoll);
          const rungPersistAmount = Math.floor(rungPersistRoll.total * outcome.persistent);
          const priorRecurring = Array.from(target.effects ?? []).find((e) => e.statuses?.has?.("recurring"));
          const priorState = priorRecurring
            ? {
              value: Number(priorRecurring.getFlag(SYSTEM_ID, "value") ?? 0),
              damageType: priorRecurring.getFlag(SYSTEM_ID, "damageType") ?? ""
            }
            : null;
          const nextRecurring = recurringAfterHit(priorState, rungPersistAmount, ladderType);
          await target.toggleStatusEffect("recurring", { value: nextRecurring.value, damageType: nextRecurring.damageType });
          lines.push(line(`${target.name}: <strong>Recurring ${nextRecurring.value} ${ladderType}</strong>`
            + `${outcome.persistent === 2 ? " (doubled)" : ""} — dealt in its end phase until a flat check ends it`
            + `${nextRecurring.replaced ? ", replacing the recurring damage already there" : ""}.`));
        }
      }
    } else if (asCondition) {
      const bs = basicSavingThrow(degreeKey, margin);
      const spared = immuneAlternate && target.isImmuneToCondition?.(immuneAlternate.immuneTo);
      let injuryType = asCondition.criticalType || damageType;
      let landed = false;
      if (spared) {
        if (alternateBase === null) {
          const altRoll = await new Roll(immuneAlternate.formula).evaluate();
          rolls.push(altRoll);
          alternateBase = altRoll.total;
          lines.push(line(`Instead, for anything immune to ${immuneAlternate.immuneTo}: <strong>${alternateBase}</strong> `
            + `${immuneAlternate.type} (${immuneAlternate.formula}) — scaled by each save.`));
        }
        const altPacket = resolveAgainstDefences(target.system ?? {}, {
          amount: Math.floor(alternateBase * bs.damageMultiplier),
          type: immuneAlternate.type,
          creatureTypeSystem: ownedCreatureTypeSystem(target),
          ...spellDamageSource(spell),
          ignoreImmunityTo: immuneAlternate.ignoresImmunity ? immuneAlternate.type : ""
        });
        let altHP = null;
        if (altPacket.taken > 0) {
          const appliedAlt = await applyDamageAndCheckDying(target, altPacket.taken, {
            isCritical: Boolean(bs.criticalSeverity)
          });
          altHP = appliedAlt?.newHP ?? null;
        }
        lines.push(line(immuneAlternateLine(target.name, `${degreeLabel} save (${total} vs ${saveDC})`,
          immuneAlternate, altPacket.taken, altHP)));
        injuryType = immuneAlternate.type;
        landed = !altPacket.immune;
      } else {
        const value = Math.floor(baseDamage * bs.damageMultiplier);
        const label = asCondition.condition.charAt(0).toUpperCase() + asCondition.condition.slice(1);
        const applied = value > 0
          ? await applyConditionTags(target, [{ key: asCondition.condition, label, value }])
          : [];
        const immune = applied.some((a) => a.immune);
        lines.push(line(`${target.name}: <strong>${degreeLabel}</strong> save (${total} vs ${saveDC}) — `
          + (immune ? `<strong>immune</strong> to ${label}.`
            : value > 0 ? `<strong>${formatAppliedTags(applied)}</strong>.` : `no ${label}.`)
          + `${bs.criticalSeverity ? ` <strong>(critical ${bs.criticalSeverity})</strong>` : ""}`));
        landed = !immune;
      }
      if (bs.criticalSeverity && landed) {
        await rollCriticalInjury(actor, {
          targetActor: target,
          damageType: injuryType,
          severity: bs.criticalSeverity,
          attackBonus: saveDC,
          spellResonance: resonanceContext
        });
      }
    } else if (isBasic) {
      const bs = basicSavingThrow(degreeKey, margin);
      let amount = Math.floor(baseDamage * bs.damageMultiplier);
      /*
       * THE BONUS DICE COME FROM THE BASE DAMAGE ENTRY (3.585.1).
       *
       * This rolled `bs.bonusBaseDamage` dice at the die size of the
       * DAMAGE formula. All 99 spells carrying both fields share a
       * face, so the die was right by luck — but the 20 damaging
       * spells that print NO base damage were getting bonus dice the
       * page says they do not get, and the source was wrong in
       * principle either way.
       */
      const saveCrit = criticalBonusDamage(spell.system, bs.criticalSeverity, bs.bonusBaseDamage);
      if (saveCrit) {
        const bonusRoll = await new Roll(saveCrit).evaluate();
        rolls.push(bonusRoll);
        amount += bonusRoll.total;
      }
      const packet = resolveAgainstDefences(target.system ?? {}, {
        amount,
        type: damageType,
        creatureTypeSystem: ownedCreatureTypeSystem(target),
        // THE SAVE PATH MAKES NO ATTACK ROLL (3.548.0), so `targeted`
        // stays false; whether it is an area comes from the spell's own
        // area field, which is the same string the card prints.
        ...spellDamageSource(spell)
      });
      // Bracers of Armour absorb what their DR stopped (3.617.0, R17).
      const bracersLine = await drainBracers(target, packet);
      if (bracersLine) lines.push(bracersLine);
      /*
       * THE SECOND POOL, SCALED BY THE SAME DEGREE (3.591.0). Resolved
       * against defences on its own, because it is a different damage
       * TYPE \u2014 a creature resistant to fire and not to bludgeoning
       * must take the two halves differently, which is the whole reason
       * the page prints them separately.
       *
       * NO CRITICAL BONUS DICE. Those come from the spell's printed base
       * damage and the page grants one set, not one per pool.
       */
      let secondPacket = null;
      if (secondary && secondaryReaches(secondary, creatureTypesOf(target.system ?? {}))) {
        secondPacket = resolveAgainstDefences(target.system ?? {}, {
          amount: Math.floor(secondaryBase * bs.damageMultiplier),
          type: secondary.type,
          creatureTypeSystem: ownedCreatureTypeSystem(target),
          ...spellDamageSource(spell)
        });
      }
      let newHP = null;
      if (packet.taken > 0) {
        const applied = await applyDamageAndCheckDying(target, packet.taken, {
          isCritical: Boolean(bs.criticalSeverity),
          damageTypes: [String(damageType ?? "").toLowerCase(), ...divineDamageMark(spellDamageSource(spell).sourceTraits)].filter(Boolean), sourceLevel: Number(actor?.system?.identity?.level ?? 0), sourceName: actor?.name ?? "", sourceUuid: actor?.uuid ?? "", context: { kind: "spell", spellName: spell?.name ?? "" }
        });
        newHP = applied?.newHP;
      }
      if (secondPacket && secondPacket.taken > 0) {
        const appliedSecond = await applyDamageAndCheckDying(target, secondPacket.taken, {
          isCritical: Boolean(bs.criticalSeverity),
          damageTypes: [String(secondary.type ?? "").toLowerCase(), ...divineDamageMark(spellDamageSource(spell).sourceTraits)].filter(Boolean), sourceLevel: Number(actor?.system?.identity?.level ?? 0), sourceName: actor?.name ?? "", sourceUuid: actor?.uuid ?? "", context: { kind: "spell", spellName: spell?.name ?? "" }
        });
        newHP = appliedSecond?.newHP ?? newHP;
      }
      // THE CASTER'S OWN RIDERS (3.625.0), on the blow that landed.
      {
        const riderHP = await applyCasterSpellDamageRiders(actor, spell, target, {
          damageType, taken: packet.taken, rolls, lines
        });
        if (riderHP != null) newHP = riderHP;
      }
      if (siphonRow) siphonTotal += siphonAmount(packet.taken + (secondPacket?.taken ?? 0), siphonRow.share);
      if (secondPacket) {
        lines.push(line(`${target.name}: ${secondPacket.immune
          ? `<strong>immune</strong> to ${secondary.type}`
          : `<strong>${secondPacket.taken}</strong> ${secondary.type}`} (secondary).`));
      }
      lines.push(
        line(
          `${target.name}: <strong>${degreeLabel}</strong> save (${total} vs ${saveDC}) — ` +
            (packet.immune
              ? `<strong>immune</strong> to ${damageType}.`
              : `<strong>${packet.taken}</strong> ${damageType}${newHP != null ? ` — now ${newHP} HP` : ""}${bs.criticalSeverity ? ` <strong>(critical ${bs.criticalSeverity})</strong>` : ""}.`)
        )
      );
      // A failed basic save that reaches a critical severity lands a real
      // injury, exactly as an attack critical does.
      if (bs.criticalSeverity && !packet.immune) {
        // WHO TOOK A CRITICAL, KEPT ON THE RESULT (3.609.0, R5) for a row
        // that asks — Umbral Blast's second save. See follow-up-save.mjs.
        results[results.length - 1].critical = true;
        await rollCriticalInjury(actor, {
          targetActor: target,
          damageType,
          severity: bs.criticalSeverity,
          attackBonus: saveDC,
          // PAGE 245'S SECOND TRIGGER reaches the save path too — a
          // Spell Critical Injury is a Spell Critical Injury whether
          // the spell hit with an attack roll or with a failed save.
          spellResonance: resonanceContext
        });
      }
    } else {
      // Non-basic (negates/condition) saves: the spell's structured effects
      // are applied to the failed savers by the effect engine after this
      // returns; spells without structured effects still need a by-hand
      // ruling — unless the spell resolves itself. The whole decision, and
      // the sentence it produces, live in casting.mjs so they can be driven.
      lines.push(
        line(nonBasicSaveLine({
          targetName: target.name,
          degreeLabel,
          total,
          saveDC,
          saved,
          negates: parsed.negates,
          hasEffects: Array.isArray(spellData.effects) && spellData.effects.length > 0,
          selfApplying: spellAppliesItself(spell),
          reachedOnSave: saved && savedRungActs(spellData.effects, degreeKey)
        }))
      );

      // THE PROMISE `selfApplying` MAKES, FINALLY KEPT (3.432.0).
      //
      // That flag means "code resolves this, do not tell the GM to apply
      // it by hand", and until now its ONLY reader was the line above,
      // which used it to suppress that advice. Nothing applied anything.
      // So a Cutting Words cast read "is affected", withheld the one
      // sentence that would have told a GM to do it themselves, and the
      // penalty went nowhere — Graham, 28 August 2026: "it just seems to
      // leave a log on the chat card".
      //
      // DECLARED ON THE SPELL, not listed by name here, for the reason
      // `spellAppliesItself` was written that way in the first place: the
      // next spell of this kind should work without editing castSpell.
      if (spellAppliesItself(spell) && !saved) {
        const { recordCuttingWords } = await import("./cutting-words-workflow.mjs");
        const left = await recordCuttingWords(target, {
          degree: degreeKey,
          casterName: actor?.name ?? "",
          round: game.combat?.started ? game.combat.round : null
        });
        if (left) {
          lines.push(line(
            `<em>${target.name} carries a <strong>${left.penalty}</strong> circumstance penalty `
            + `to their next attack roll or skill check.</em>`
          ));
        }
      }
    }
  }
  if (siphonRow && siphonTotal > 0) {
    const { grantSiphonedTempHP } = await import("./spell-effects.mjs");
    const pool = await grantSiphonedTempHP(actor, siphonTotal, { spellName: spell.name, img: spell.img, duration: siphonRow.duration });
    lines.push(line(`${actor.name} gains <strong>${siphonTotal}</strong> temporary HP — half the damage taken `
      + `(pool now ${pool}) — lost after ${siphonRow.duration}.`));
  }
  /*
   * DAMAGE NO SAVE TOUCHES (3.609.0, R1). Volcanic Inferno's heat: rolled
   * once, dealt to everyone the area caught AND everyone within the row's
   * reach of it, "regardless of the results of their saving throws". The
   * cast hands over the wider list it measured; a cast with none (a
   * targeted spell) falls back to the creatures that saved.
   */
  if (saveLadder?.regardless) {
    const spec = saveLadder.regardless;
    const reached = [];
    for (const actorIn of [...targets, ...(Array.isArray(regardlessTargets) ? regardlessTargets : [])]) {
      if (actorIn && !reached.includes(actorIn)) reached.push(actorIn);
    }
    if (reached.length) {
      const heatRoll = await new Roll(spec.formula).evaluate();
      rolls.push(heatRoll);
      lines.push(line(`And to everyone in the area${spec.reachFeet ? ` or within ${spec.reachFeet} feet of it` : ""}, `
        + `regardless of their saves: <strong>${heatRoll.total}</strong> ${spec.type} (${spec.formula}).`));
      for (const victim of reached) {
        const heatPacket = resolveAgainstDefences(victim.system ?? {}, {
          amount: heatRoll.total,
          type: spec.type,
          creatureTypeSystem: ownedCreatureTypeSystem(victim),
          ...spellDamageSource(spell)
        });
        let heatHP = null;
        if (heatPacket.taken > 0) heatHP = (await applyDamageAndCheckDying(victim, heatPacket.taken))?.newHP ?? null;
        lines.push(line(`${victim.name}: ${heatPacket.immune ? `<strong>immune</strong> to ${spec.type}`
          : `<strong>${heatPacket.taken}</strong> ${spec.type}${heatHP != null ? ` — now ${heatHP} HP` : ""}`}.`));
      }
    }
  }
  return { rolls, failed, results };
}

/**
 * `castInnateSpell` USED TO LIVE HERE, and its removal is the fix.
 *
 * It was a second, shorter implementation of casting for creatures: it
 * posted a card, spent AP, decremented per-day uses, and returned. It never
 * placed an area template, never rolled a save, never resolved an attack
 * against a Defence Bonus, never rolled damage and never applied any. Every
 * innate spell in the game therefore printed a number and did nothing —
 * found in the 13 Aug 2026 combat playtest, where a Fire Giant's Fireball,
 * Line Of Fire and Orb Of Fire between them dealt no damage at all across
 * ten rounds.
 *
 * Innate casting is now a set of guards inside `castSpell` (search
 * `isInnate`) rather than a path that runs beside it. That is the point: a
 * guard that goes missing changes one number, where a parallel function
 * that falls behind loses every rule added to the other one.
 */

/** The Sacrifice Fortitude save and its Soul Drain. */
async function rollSacrificeSave(actor, { pp, ppOver }) {
  const fortitude = Number(actor.system.combat?.saves?.fortitude?.total ?? 0);
  const check = await TRGCheck.roll({
    actor,
    label: "Overcasting Sacrifice — Fortitude Save",
    subject: "fortitude",
    subtitle: `Attack level ${pp}`,
    type: "save",
    dc: Number(pp) + 14,
    modifiers: [{ label: "Fortitude", value: fortitude, type: "untyped" }]
  });

  const drain = sacrificeSoulDrain(check.outcome?.degree?.key ?? "failure", ppOver);
  if (!drain) return;

  const roll = await new Roll(drain.formula).evaluate();
  const lines = [
    line(`Soul Drain <strong>${roll.total}</strong> (${drain.formula}).`)
  ];
  if (drain.critical) {
    lines.push(
      line(
        `Also take a <strong>${drain.critical} Essence critical</strong>.`
      )
    );
  }
  lines.push(
    line("If this reduces you to 0 HP, you are consumed by the spell.")
  );
  await postCard(actor, "Sacrifice — Soul Drain", lines, [roll]);

  const current = actor.getConditionValue?.("soulDrain") ?? 0;
  await actor.toggleStatusEffect("soulDrain", { value: current + roll.total });
}

/** The Spell Fumble Table roll: top open-ended d100 + modifiers. */
export async function rollSpellFumble(actor, { tradition, blunder = false, pp = 0, focusPenalty = 0, ritual = false, resonanceContext = null }) {
  const rolls = [];
  const draw = async (faces) => {
    const roll = await new Roll(`1d${faces}`).evaluate();
    rolls.push(roll);
    return roll.total;
  };

  // Top open-ended percentile: 96-100 extends upward, no downward chain.
  const chain = await rollChain({
    // THE ZERO RULE IS NOT RESTATED HERE (3.420.0). This block used to
    // carry its own copy of `value === 0 ? 100 : value`, as did the
    // resonance roll below and, inverted and wrong, the critical-shift
    // path. percentileValue owns it now.
    draw: async () => percentileValue(await draw(10), await draw(10)),
    profile: CHAIN_PROFILES.d100,
    openEnded: OPEN_ENDED.TOP
  });

  const noFocus = Number(focusPenalty) || 0;
  const ppMod = 5 * Math.max(0, Math.floor(Number(pp) || 0));
  // Urloch (Chapter 2): "when you fumble a spell check, you add a +10
  // modifier to all fumble rolls." Carried on an effect flag so any later
  // source stacks the same way; higher is worse on this table.
  const featureFumbleMod = Array.from(actor?.appliedEffects ?? actor?.effects ?? [])
    .filter((e) => !e.disabled)
    .reduce((sum, e) => sum + (Number(e.getFlag?.(SYSTEM_ID, "spellFumbleModifier")) || 0), 0);
  // HIGH MAGIC (3.633.0, F&F 3.0 R12): "All Spell Fumble checks gain a +50 modifier."
  const highMagicMod = highMagicFumble(actor);
  const modifier = spellFumbleModifierTotal(fumbleModifierFor(tradition), { blunder, pp, focusPenalty: noFocus, ritual })
    + featureFumbleMod + highMagicMod;
  const result = chain.total + modifier;

  const parts = [
    tradition ? `${tradition}` : null,
    ppMod ? `PP +${ppMod}` : null,
    blunder ? "Blunder +20" : null,
    noFocus ? "no focus +10" : null,
    ritual ? "ritual +20" : null,
    featureFumbleMod ? `heritage +${featureFumbleMod}` : null,
    highMagicMod ? `High Magic +${highMagicMod}` : null
  ].filter(Boolean);
  const lines = [
    line(
      `Rolled <strong>${chain.total}</strong>${modifier ? ` + ${modifier} (${parts.join(", ") || "modifiers"}) = <strong>${result}</strong>` : ""}.`
    )
  ];

  // "UM" specials key off the first face rolled — unmodified means the die
  // face itself, so they trigger even when tradition modifiers apply. A
  // MODIFIED total landing on 66 or 100 without the face falls through to
  // lookupTableRow's nearest-lower fallback instead.
  const special = SPELL_FUMBLE_SPECIALS.find(
    (entry) => chain.faces[0] === entry.face
  );
  if (special) {
    lines.push(line(`<strong>Unmodified ${special.face}!</strong> <em>${special.effect}</em>`));
    await postCard(actor, "Spell Fumble", lines, rolls);
    if (special.trigger === "um66") {
      await rollResonanceEvent(actor, { reason: "Spell reversal (UM 66)", modifiers: resonanceContext ?? { pp } });
    }
    return special;
  }

  const row = lookupTableRow(SPELL_FUMBLE_TABLE, result);
  lines.push(line(`<em>${row.effect}</em>`));

  const duration = extractTextDuration(row.effect);
  const expiresRound = duration.autoExpires ? (game.combat?.round ?? 0) + duration.rounds : null;

  const tags = extractConditionTags(row.effect);
  if (tags.length) {
    const applied = await applyConditionTags(actor, tags, { expiresRound });
    lines.push(
      line(
        `<em>Applied to ${actor.name}:</em> ` +
          formatAppliedTags(applied) +
          "."
      )
    );
  }

  const selfDamageResult = await applySelfDamage(actor, extractSelfDamage(row.effect), applyDamageAndCheckDying);
  if (selfDamageResult.roll) rolls.push(selfDamageResult.roll);
  if (selfDamageResult.line) lines.push(line(selfDamageResult.line));

  await postCard(actor, "Spell Fumble", lines, rolls);
  return row;
}

/** A Magical Resonance Event roll. */
/**
 * A Magical Resonance Event roll (Chapter 9): "make a Top Open Ended
 * percentile check, adding any modifiers from the Resonance Modifiers
 * table." Previously rolled a plain, non-exploding 1d100 with no
 * modifiers applied at all — fixed to match rollSpellFumble's already-
 * correct open-ended pattern exactly, plus the modifiers this was
 * missing entirely.
 */
export async function rollResonanceEvent(actor, { reason = "", modifiers = {} } = {}) {
  const rolls = [];
  const draw = async (faces) => {
    const roll = await new Roll(`1d${faces}`).evaluate();
    rolls.push(roll);
    return roll.total;
  };

  const chain = await rollChain({
    // THE ZERO RULE IS NOT RESTATED HERE (3.420.0). This block used to
    // carry its own copy of `value === 0 ? 100 : value`, as did the
    // resonance roll below and, inverted and wrong, the critical-shift
    // path. percentileValue owns it now.
    draw: async () => percentileValue(await draw(10), await draw(10)),
    profile: CHAIN_PROFILES.d100,
    openEnded: OPEN_ENDED.TOP
  });

  const modifier = resonanceModifierTotal(modifiers);
  const result = chain.total + modifier;

  const lines = [];
  if (reason) lines.push(line(`<em>${reason}</em>`));
  lines.push(
    line(
      `Rolled <strong>${chain.total}</strong>${modifier ? ` + ${modifier} (modifiers) = <strong>${result}</strong>` : ""}.`
    )
  );

  // "UM" specials key off the first (unmodified) face rolled, same
  // convention as rollSpellFumble's specials.
  const special = RESONANCE_SPECIALS.find((entry) => chain.faces[0] === entry.face);
  const row = special ?? lookupTableRow(RESONANCE_EVENT_TABLE, result);
  lines.push(line(`<em>${row.effect}</em>`));
  lines.push(line("<em>Apply Manually.</em>"));

  await postCard(actor, "Magical Resonance Event", lines, rolls);

  if (special?.trigger === "um66") {
    // Absolute Chaos: roll twice more, carrying the same modifier context.
    await rollResonanceEvent(actor, { reason: "Absolute Chaos — first roll", modifiers });
    await rollResonanceEvent(actor, { reason: "Absolute Chaos — second roll", modifiers });
  }
  return row;
}

/**
 * Spell Concentration (Chapter 4): a Free reaction when you're interrupted
 * — take damage — while casting or sustaining a spell. Rolled at the
 * original casting DC, stepped up if the interrupting damage was itself a
 * critical injury. There's no live "currently sustaining" tracker in this
 * system yet (sustained-duration bookkeeping is a tracked, deferred
 * subsystem), so the dialog asks for the original DC and any PP at stake
 * rather than reading them from an active cast automatically.
 */
export async function rollSpellConcentration(actor, { dc: knownDC = null, criticalSeverity: knownSeverity = "" } = {}) {
  /*
   * THE DC ARRIVES KNOWN WHEN A PENDING CAST WAS INTERRUPTED (3.584.0).
   * The dialog has always asked the player to type the original Casting
   * DC — a number on a card that had usually scrolled away by the time
   * they needed it. Nothing else changes: the same reaction, the same
   * roll, opened already knowing what it is for. Called with no options
   * it behaves exactly as it did.
   */
  const result = await DialogV2.wait({
    window: { title: "Spell Concentration", icon: "fa-solid fa-om" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Free reaction — you're interrupted while casting or sustaining a spell.</p>
        <div class="form-group">
          <label for="trg-sc-dc">Original casting DC</label>
          <input id="trg-sc-dc" type="number" name="dc" value="${Number(knownDC) || 0}">
        </div>
        <div class="form-group">
          <label for="trg-sc-crit">Was the interrupting damage a critical injury?</label>
          <select id="trg-sc-crit" name="criticalSeverity">
            ${["", "minor", "serious", "deadly"].map((k) => `<option value="${k}"${k === String(knownSeverity ?? "") ? " selected" : ""}>${
              { "": "No", minor: "Minor (Hard, +2)", serious: "Serious (Very Hard, +5)", deadly: "Deadly (Incredibly Hard, +10)" }[k]
            }</option>`).join("")}
          </select>
        </div>
        <div class="form-group">
          <label for="trg-sc-skill">Skill</label>
          <select id="trg-sc-skill" name="skillKey">
            <option value="mentalFocus">Mental Focus</option>
            <option value="powerManipulation">Power Manipulation</option>
          </select>
        </div>
        <div class="form-group">
          <label for="trg-sc-pp">PP at stake (0 if sustaining, or untracked)</label>
          <input id="trg-sc-pp" type="number" name="pp" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-sc-tradition">Tradition (for the Fumble Table modifier)</label>
          <input id="trg-sc-tradition" type="text" name="tradition" value="${actor.system?.magic?.tradition ?? ""}">
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

  const dc = Number(result.dc || 0);
  const pp = Math.max(0, Number(result.pp || 0));
  const difficulty = concentrationDifficulty(result.criticalSeverity || null);
  const skillKey = result.skillKey === "powerManipulation" ? "powerManipulation" : "mentalFocus";
  const skill = actor.system?.skills?.[skillKey];
  const skillLabel = skillKey === "powerManipulation" ? "Power Manipulation" : "Mental Focus";

  const modifiers = skill?.checkModifiers ?? [
    {
      label: skillLabel,
      value: Number(skill?.total ?? 0),
      type: "untyped"
    }
  ];

  const check = await TRGCheck.roll({
    actor,
    label: "Spell Concentration",
    subtitle: `${skillLabel} — DC ${dc}${difficulty !== "medium" ? ` (${difficulty})` : ""}`,
    type: "skill",
    dc,
    difficulty,
    modifiers: [...modifiers]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const outcome = concentrationOutcome(degree);

  const lines = [];
  if (outcome.maintains) {
    lines.push(line("<strong>You maintain the spell</strong> (or cast it normally)."));
    if (outcome.fatigue) {
      const current = actor.getConditionValue?.("fatigued") ?? 0;
      await actor.toggleStatusEffect("fatigued", { value: current + outcome.fatigue });
      lines.push(line(`Gains <strong>${outcome.fatigue} Fatigue</strong>.`));
    }
  } else {
    lines.push(line("<strong>The spell fails.</strong>"));
    if (outcome.ppLossFraction && pp) {
      const lost =
        outcome.ppLossFraction === 1 ? pp : Math.floor(pp / 2);
      // THROUGH THE NEGATIVE-PP RULE (page 91), not a bare clamp. This
      // is the losing kind of PP loss — the spell failed and the points
      // are gone — and the amount is the SPELL's PP, which a caster
      // whose pool has since been drained may no longer hold. The old
      // `Math.max(0, current - lost)` discarded exactly the number the
      // rule is about: "you instead take 5 Soul Drain for every PP that
      // you would fall below 0."
      const paid = await applyPowerPointCost(actor, lost, "Spell Concentration failed");
      lines.push(line(paid.note || `Loses <strong>${lost} PP</strong>.`));
    } else if (outcome.ppLossFraction) {
      lines.push(
        line(
          `Loses ${outcome.ppLossFraction === 1 ? "the" : "half the"} PP (no PP value supplied — apply manually).`
        )
      );
    }
  }

  await postCard(actor, "Spell Concentration — Result", lines);

  if (outcome.rollFumble) {
    await rollSpellFumble(actor, { tradition: result.tradition, blunder: degree === "blunder", pp });
  }
  if (outcome.rollResonance) {
    await rollResonanceEvent(actor, { reason: "Spell Concentration — Blunder" });
  }

  return { check, outcome };
}

/**
 * Power Point Recovery (Chapter 9): lets the player pick which of the
 * three recovery tiers applies and for how long, then applies the
 * result directly to Current PP (clamped to Max, same as every other
 * tracked resource).
 */
export async function rollPowerPointRecovery(actor) {
  const result = await DialogV2.wait({
    window: { title: "Power Point Recovery", icon: "fa-solid fa-bolt" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label for="trg-pp-mode">What were you doing?</label>
          <select id="trg-pp-mode" name="mode">
            <option value="active">Active (1 PP every 3 hours)</option>
            <option value="resting">Resting (1 PP per 2 caster levels, per hour)</option>
            <option value="sleeping">Sleeping (50% of max PP per half-night)</option>
          </select>
        </div>
        <div class="form-group">
          <label for="trg-pp-amount">Hours (Active/Resting) or half-nights (Sleeping)</label>
          <input id="trg-pp-amount" type="number" name="amount" value="1" min="0">
        </div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
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

  const system = actor.system ?? {};
  const pp = system.resources?.pp;
  if (!pp) return null;

  const amount = Number(result.amount || 0);
  const casterLevel = casterLevelOf(system);

  let gained = 0;
  let label = "";
  if (result.mode === "active") {
    gained = activePPRecovery(amount);
    label = `Active (${amount} hour${amount === 1 ? "" : "s"})`;
  } else if (result.mode === "resting") {
    gained = restingPPRecovery(casterLevel, amount);
    label = `Resting (${amount} hour${amount === 1 ? "" : "s"}, caster level ${casterLevel})`;
  } else {
    gained = sleepingPPRecovery(Number(pp.max ?? 0), amount);
    label = `Sleeping (${amount} half-night${amount === 1 ? "" : "s"})`;
  }

  const newValue = Math.min(Number(pp.max ?? 0), Number(pp.value ?? 0) + gained);
  await actor.update({ "system.resources.pp.value": newValue });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Power Point Recovery</h3></div></header><p style="margin:2px 0">${label} — regains <strong>${gained} PP</strong>, now <strong>${newValue} / ${pp.max}</strong>.</p></div>`
  });

  return { gained, newValue };
}

const DISBELIEVE_OUTCOMES = {
  heroic: "You can see through the effect completely and it is no longer visible to you.",
  critical: "You can see through the effect completely and it is no longer visible to you.",
  success: "You realise that the effect is not real, but can still perceive any applicable effects.",
  partial: "Something is off but you can't quite place it. You can attempt to disbelieve again in one minute, or when further information about the effect is discovered.",
  failure: "What illusion? It looks pretty real to you. You cannot attempt to disbelieve again unless provided with irrefutable evidence to prove it's false.",
  fumble: "As Failure, but you cannot attempt to disbelieve this illusion again.",
  blunder: "As Failure, but you cannot attempt to disbelieve this illusion again."
};

/**
 * Disbelieving Illusions (Chapter 9): a Will save or Sense Motive check
 * against the illusion's own spell DC, only usable if the spell's own
 * description specifically states it can be disbelieved.
 */
export async function rollDisbelieveIllusion(actor) {
  const result = await DialogV2.wait({
    window: { title: "Disbelieve Illusion", icon: "fa-solid fa-eye-slash" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Only if the illusion's own description says it can be disbelieved.</p>
        <div class="form-group">
          <label for="trg-disbelieve-mode">Check</label>
          <select id="trg-disbelieve-mode" name="mode">
            <option value="will">Will Save</option>
            <option value="senseMotive">Sense Motive</option>
          </select>
        </div>
        <div class="form-group">
          <label for="trg-disbelieve-dc">Illusion's Spell DC</label>
          <input id="trg-disbelieve-dc" type="number" name="dc" value="0">
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

  const dc = Number(result.dc || 0);
  const system = actor.system ?? {};

  let type;
  let label;
  let modifiers;
  if (result.mode === "will") {
    type = "save";
    label = "Will Save";
    const will = system.combat?.saves?.will;
    modifiers = will?.checkModifiers ?? [
      { label: "Will", value: Number(will?.total ?? 0), type: "untyped" }
    ];
  } else {
    type = "skill";
    label = "Sense Motive";
    const skill = system.skills?.senseMotive;
    modifiers = skill?.checkModifiers ?? [
      { label: "Sense Motive", value: Number(skill?.total ?? 0), type: "untyped" }
    ];
  }

  const check = await TRGCheck.roll({
    actor,
    label: `Disbelieve Illusion — ${label}`,
    subtitle: `vs Spell DC ${dc}`,
    type,
    dc,
    modifiers: [...modifiers]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const text = DISBELIEVE_OUTCOMES[degree] ?? DISBELIEVE_OUTCOMES.failure;

  await postCard(actor, "Disbelieve Illusion — Result", [line(text)]);
  return { check, degree };
}

/**
 * Magic Ritual overcasting (Chapter 9): the cooperative alternative to
 * Sacrifice. Secondary casters roll their own Spellcraft checks (this
 * system has no multi-actor coordination step), and each result is
 * recorded in its own row here; `magicRitualSecondaryModifier` turns
 * the degrees into the primary caster's circumstance modifier. The
 * primary caster's roll is capped at Success; anything better shows as
 * a Success result rather than Critical or Heroic. The result is then
 * cast — see the `ritual` option on `castSpell`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SENTENCE THIS COMMENT USED TO END WITH WAS WRONG, and it is worth
 * recording that it was wrong rather than quietly deleting it:
 *
 *   "summed by hand before entry, since a dynamic per-caster form isn't
 *    practical in a static dialog."
 *
 * Six static rows are entirely practical, and the belief that they were
 * not is the whole reason `magicRitualSecondaryModifier` sat uncalled
 * while a hint asked the GM to do its arithmetic. A comment asserting
 * that something cannot be done is the kind of claim this project has
 * learned to measure rather than believe.
 */
export async function rollMagicRitual(actor, spell) {
  const spellData = spell.system;
  const basePP = Math.max(0, Number(spellData.ppCost ?? 0));

  /*
   * THE SECONDARIES ADD THEMSELVES UP (3.585.0, Graham's R5).
   *
   * This dialog used to print the four numbers in a hint and ask the GM
   * to type their total: "+4 Critical / +2 Success / -4 Failure / -10
   * Fumble each, summed by hand". `magicRitualSecondaryModifier` — the
   * function that IS that ladder — existed with NO CALLER anywhere in
   * the system; the only mention of it was a comment above this dialog
   * explaining that the arithmetic happened elsewhere, by a person.
   *
   * That is the shape this project keeps finding: a rule written
   * correctly and then hand-rolled at its one call site. Now each
   * secondary caster gets a degree picker and the ladder does the sum.
   */
  const secondaryRow = (index) => `
    <div class="form-group" data-secondary="${index}">
      <label for="trg-ritual-sec-${index}">Secondary caster ${index + 1}</label>
      <select id="trg-ritual-sec-${index}" name="secondary-${index}">
        <option value="">— not participating —</option>
        ${["critical", "success", "failure", "fumble", "blunder"].map((key) => {
          const mod = magicRitualSecondaryModifier(key);
          return `<option value="${key}"${key === "success" ? " selected" : ""}>${
            key.charAt(0).toUpperCase() + key.slice(1)} (${mod >= 0 ? "+" : ""}${mod})</option>`;
        }).join("")}
      </select>
    </div>`;

  const result = await DialogV2.wait({
    window: { title: `${spell.name} — Magic Ritual`, icon: "fa-solid fa-people-group" },
    classes: ["trg-prime"],
    position: { width: 440 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <p class="hint">Secondary casters roll their own Spellcraft checks first. Record each result below — their modifiers are summed for you.</p>
        ${Array.from({ length: MAX_SECONDARY_CASTERS }, (_, i) => secondaryRow(i)).join("")}
        <div class="form-group">
          <label for="trg-ritual-pp-over">PP over your normal maximum</label>
          <input id="trg-ritual-pp-over" type="number" name="ppOver" value="0" min="0">
        </div>
        <div class="form-group">
          <label for="trg-ritual-diff-tradition">Secondary casters with a different tradition</label>
          <input id="trg-ritual-diff-tradition" type="number" name="diffTradition" value="0" min="0">
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="castingTimeX100"> Casting time x100 (-2 DC)</label>
        </div>
        <div class="form-group">
          <label><input type="checkbox" name="durationUnaltered"> Duration unaltered (-10 DC)</label>
        </div>
        <div class="form-group">
          <label for="trg-ritual-focus">Ritual Focus DC modifier</label>
          <input id="trg-ritual-focus" type="number" name="focusModifier" value="0">
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

  // WHO TOOK PART, AND WHAT THEY CONTRIBUTED. One pass over the rows:
  // a blank row is a seat nobody sat in, and every other row is both a
  // head for the headroom count and a modifier for the check.
  const degrees = Array.from({ length: MAX_SECONDARY_CASTERS }, (_, i) =>
    String(result[`secondary-${i}`] ?? "").trim()).filter(Boolean);
  const secondaryCount = degrees.length;
  const secondaryModifier = degrees.reduce(
    (sum, key) => sum + magicRitualSecondaryModifier(key), 0);
  const ppOver = Number(result.ppOver || 0);
  const overcastLimit = magicRitualOvercastLimit(secondaryCount);

  if (!secondaryCount) {
    ui.notifications.warn("A magic ritual needs at least one secondary caster.");
    return null;
  }

  if (ppOver > overcastLimit) {
    ui.notifications.warn(
      `${secondaryCount} secondary caster${secondaryCount === 1 ? "" : "s"} permits at most ${overcastLimit} PP over your maximum; this attempt needs ${ppOver}.`
    );
    return null;
  }

  const dcModifiers = ritualDCModifierTotal({
    ppOverPrimaryMax: ppOver,
    differentTraditionSecondaryCasters: Number(result.diffTradition || 0),
    castingTimeX100: Boolean(result.castingTimeX100),
    durationUnaltered: Boolean(result.durationUnaltered),
    ritualFocusModifier: Number(result.focusModifier || 0)
  });

  const dc = castingDC(basePP) + dcModifiers;

  const system = actor.system ?? {};
  /*
   * A COPY, BECAUSE THE PUSH BELOW MUTATES IT (fixed 3.585.1).
   *
   * `system.magic.spellcraft.checkModifiers` is the actor's OWN derived
   * array, and `modifiers.push` was writing the secondary-caster bonus
   * straight into it. That was latent for as long as the ritual ended
   * at a chat card: nothing read the array again before the sheet
   * re-derived.
   *
   * R6 MADE IT REACHABLE. A successful ritual now casts the spell
   * immediately, and that cast read the polluted array — FOUND LIVE on
   * 23 September 2026, where a three-secondary ritual's +8 appeared on
   * the cast's own Spellcraft check AND, because a spell attack in this
   * system IS the casting roll, on the attack total that followed
   * ("attack 34 vs DB 10").
   *
   * A bug that could not be seen until the code around it started
   * working, which is the argument for driving a release rather than
   * reasoning about it.
   */
  const modifiers = [...(system.magic?.spellcraft?.checkModifiers ?? [
    { label: "Spellcraft", value: Number(system.magic?.spellcraft?.total ?? 0), type: "untyped" }
  ])];
  if (secondaryModifier) {
    modifiers.push({
      label: "Secondary Casters",
      value: secondaryModifier,
      type: "circumstance"
    });
  }

  const check = await TRGCheck.roll({
    actor,
    label: `${spell.name} — Magic Ritual`,
    subtitle: `DC ${dc} — capped at Success (no Critical/Heroic possible)`,
    type: "spellcraft",
    // A ritual is still a cast of this spell (see castContext above); its
    // own function scope has no access to that object, so the same two
    // fields are read from the spell directly.
    traits: spell.system?.traits ?? "",
    traditions: spell.system?.tradition ?? "",
    dc,
    modifiers: [...modifiers]
  });

  const rawDegree = check.outcome?.degree?.key ?? "failure";
  const degree = capRitualDegree(rawDegree);
  const cast = degree === "success";
  const consequences = degree === "failure" || degree === "fumble" || degree === "blunder";

  const lines = [];
  if (cast) {
    lines.push(line(`<strong>The ritual succeeds.</strong> The spell is cast at ${basePP + ppOver} PP.`));
  } else if (consequences) {
    lines.push(line("<strong>The ritual fails.</strong> All participants are subject to the consequences."));
    lines.push(line(
      `<em>${secondaryCount} secondary caster${secondaryCount === 1 ? "" : "s"} shared in this ritual `
      + `and share in what follows — the page puts every participant under the consequences, `
      + `and what those are is yours to set.</em>`));
  } else {
    // Partial: explicitly excluded from "the ritual fails" in the
    // rulebook's own wording — the spell doesn't take effect, but no PP
    // is lost and participants face no consequences, matching a normal
    // Partial result rather than the harsher failure/fumble/blunder case.
    lines.push(line("<strong>The spell fails, but no PP is lost and no participant faces consequences.</strong>"));
  }
  if (rawDegree !== degree) {
    lines.push(line(`(Rolled ${rawDegree}, capped down to Success.)`));
  }

  await postCard(actor, `${spell.name} — Magic Ritual Result`, lines);

  /*
   * ─────────────────────────────────────────────────────────────────
   * AND NOW THE SPELL ACTUALLY HAPPENS (3.585.0, Graham's R6 and R7).
   *
   * Everything above this line has been right since the ritual was
   * written — the headroom, the Ritual Mods table, the cap at Success —
   * and everything below it was one sentence on a card. "The ritual
   * succeeds. The spell is cast at 14 PP" spent no PP, applied no
   * effects, rolled no saving throw against anybody and registered
   * nothing as running. A whole overcasting method resolved to a
   * paragraph.
   *
   * THE CHECK IS NOT ROLLED TWICE. `castSpell` takes the degree this
   * ritual produced and the headroom it bought; see the `ritual` option
   * there. A fumble or blunder travels the same way, which is what
   * finally reaches the Spell Fumble Table's +20 Spell Ritual row.
   */
  if (cast || consequences) {
    await castSpell(actor, spell, {
      ritual: { degree, ppOver, secondaryCount, check }
    });
  }

  return { check, degree, ppOver, secondaryCount, secondaryModifier };
}
