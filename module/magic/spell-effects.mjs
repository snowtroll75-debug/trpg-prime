import { warpedDurationText } from "./active-spells.mjs";
/**
 * Spell effect engine (phase 3, hybrid model).
 *
 * A spell carries a structured `effects` array; on a successful cast this reads
 * those entries and applies the common mechanical patterns — healing, temporary
 * HP, conditions, and status/circumstance bonuses — to the caster or the spell's
 * targets, reusing the machinery that already exists (temp-HP pool, the 36-entry
 * condition registry via `applyConditionTags`, and the Appendix-1 bonus pool that
 * feeds attack/save/skill rolls through Active Effects). Effects auto-apply
 * (matching the damage pipeline) and, where they have a duration, auto-expire via
 * Foundry's own effect-duration tracking.
 *
 * Effect entry shape (each of these on `spell.system.effects`):
 *   { kind: "heal",      target: "self"|"targets", formula: "1d8 + @casterLevel" }
 *   { kind: "tempHP",    target, formula }
 *   { kind: "condition", target, condition: "frightened", value: 1 }
 *   { kind: "bonus",     target, slot: "attack"|"defence"|"will"|"reflex"|
 *                        "fortitude"|"initiative"|"spellcraft",
 *                        bonusType: "status"|"circumstance"|"item", value: 1,
 *                        note: "vs fear" }
 *   { kind: "defence",   target, field: "immunity"|"resistance"|"weakness",
 *                        values: ["fire", "sleep"], note: "Fire form" }
 *     — appends to the comma-separated defence TEXT fields for the
 *       spell's duration. A form's immunities are not numbers and cannot
 *       go through the bonus pool.
 *   { kind: "damage",    target, formula: "1d4+1", damageType: "force", count: 3 }
 *     — auto-hit (no attack roll, no save); `count` missiles distributed
 *       round-robin across the targets (Magic Missile). Runs the defence pipeline.
 */

import { quickenedActionsFor } from "../combat/restricted-ap.mjs";
import { afflictionCounteredBy } from "../affliction-countered.mjs";
import { lightTraitDefaultRow, morphStrikeIsMagical } from "../trait-rules.mjs";
import { SKILLS } from "../config.mjs";
import { speedBase } from "../combat/speed-pool.mjs";
import { createEffectsOn } from "../combat/target-relay-workflow.mjs";
import { defenceDCRowFrom } from "../combat/defence-dc.mjs";
import { applyConditionTags, formatAppliedTags } from "../combat/effect-application-workflow.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { grantedSenseBlock, actorSenses, senseLine } from "../senses.mjs";
import {
  recipientsForEffect, selfRowRecipients, isDegreeGated, effectiveSaveDegree,
  effectAppliesOnDegree, isBasicSave
} from "./spell-degrees.mjs";
import { MARKERS, isMarkerKey, markerAppliedLine, markerFlagData, findMarker } from "./markers.mjs";
import {
  isLightSourceKey, lightSource, lightSourceFlagData, lightRadiusFeet
} from "../light-sources.mjs";
import { normaliseLightShift, lightShiftLine, lightShiftDropLine } from "./light-shift.mjs";
import {
  normaliseSlotChoice, slotChoiceCount, slotChoiceRows, slotChoiceEmptyLine, slotChoiceLine, slotChoiceWords,
  withRankedSkills
} from "./slot-choice.mjs";
import { createLightShiftRegion } from "./light-shift-workflow.mjs";
import { normaliseDCThreshold, thresholdDC, thresholdLine, thresholdRemainderLine } from "./dc-threshold.mjs";
import { addDice, casterLevelOf, warpedHealFormula } from "./caster-level-mods.mjs";
import { HEALING_RIDERS_USED_FLAG, applyHealingRiders, declaredHealingRiders, healingRidersBurnUpdate } from "./healing-riders.mjs";
import { offerItemMaximise, offerOnHealedRelief, offerRodExtraHeal } from "./item-healing-workflow.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";
import { effectDurationText, parseSpellDuration } from "./effect-duration.mjs";
import {
  marginDurationText, parseRolledDuration, rolledDurationText, roundsFromMargin, valueFromMargin
} from "./condition-timing-rules.mjs";
import { wardFlagData, wardSlots, unknownWardSlots } from "./ward.mjs";
import { hinderFlagData, hinderSlots, unknownHinderSlots, hinderEntriesDisagree } from "./hinder.mjs";
import { healingEarthItemData, existingHealingEarth, healingEarthBonus } from "./healing-earth.mjs";
import { isAttitude } from "../attitude.mjs";
import { HELD_BONUS_FLAG, normaliseHeldBonus, heldBonusCastLine, warpedHeldBonus } from "./held-bonus.mjs";
import { rowAppliesToCast, warpedConditionValue } from "./condition-warp.mjs";
import { defenceValueChoices } from "./defence-choice.mjs";
import { STRIKE_RIDER_FLAG, normaliseStrikeRider, riderCastLine } from "./strike-riders.mjs";
import {
  WEAPON_DAMAGE_BONUS_FLAG, normaliseWeaponDamageBonus, weaponDamageBonusLine,
  weaponDamageShortfallLine
} from "./weapon-damage-bonus.mjs";
import {
  normaliseWildMorph, morphAttackData, wildMorphLine, noStudiedTargetLine,
  wildMorphRemainderLine
} from "./wild-morph.mjs";
import {
  RESPITE_FLAG, normaliseDelayedRespite, respiteRemainderLine
} from "./delayed-respite.mjs";
import {
  SHIELD_FLAG, normaliseSacrificingShield, shieldAmount,
  shieldPlacedLine, shieldRemainderLine
} from "./sacrificing-shield.mjs";
import { normaliseSpellShield, spellShieldDR, casterBSB, SPELL_SHIELD_FLAG }
  from "./spell-shield.mjs";
import { normaliseConjuredWeapon } from "./conjured-weapon.mjs";
import {
  HIDE_FLAG, normaliseHideFromAnimals, hideEffectName,
  hidePlacedLine, hideRemainderLine
} from "./hide-from-animals.mjs";
import {
  normaliseSpellStoring, releaseActionCost, armedLine, displacedLine, noBondCastLine,
  spellStoringRemainderLine
} from "./spell-storing.mjs";
import {
  normaliseSpellConditional, grantsFor, warpedGrants, traditionCount, traditionConditional,
  conditionalLine, traditionLine, traditionShortfallLine, conditionalRemainderLine
} from "./spell-conditional.mjs";
import { BEACON_FLAG, BEACON_BASE_DICE } from "./vital-beacon.mjs";
import { PRISON_FLAG, normalisePrison, prisonLadderLine } from "./prison.mjs";
import {
  LAST_CAST_FLAG, normaliseLifeSiphon, lifeSiphonQualifies, lifeSiphonFormula,
  lifeSiphonLine, lifeSiphonRefusal
} from "./life-siphon.mjs";
import {
  CRITICAL_RECORD_FLAG, normaliseTriggeredStrike, triggeredStrikeQualifies,
  triggeredStrikeLine, freeAttackLine, triggeredStrikeRefusal, victimIsPrecise
} from "./triggered-strike.mjs";
import {
  SUPPRESSION_FLAG, normaliseSuppression, normaliseSuppressionChoice, suppressionChoiceFor,
  warpedSuppression, suppressionCastLine
} from "../conditions/suppression.mjs";
import { traitList } from "./counteract-row.mjs";
import { attackRowRecipients, isAttackGated } from "./attack-degree-rows.mjs";
import { THORNS_FLAG, normaliseThorns, thornsCastLine, warpedThorns } from "./thorns.mjs";
import {
  offeredTypes, chosenType, opposingElement, typeChosenLine, typeRefusal
} from "./damage-type-choice.mjs";
import { promptTypeChoice } from "./damage-type-choice-workflow.mjs";
import { counterPerformBonus, counterPerformCastLine } from "./counter-perform.mjs";
import { aidDC, inspireCompetenceBonus, inspireCompetenceCastLine } from "./inspire-competence.mjs";
import { seersVisionCastLine } from "./seers-vision.mjs";
import { keepByDisposition } from "./spell-template.mjs";
import { grantedTraitsFor, resolveTraitPicks, traitPickCount } from "./form-traits.mjs";
import { DEFENCE_PIERCE_FLAG, normaliseDefencePierce } from "./defence-pierce.mjs";
import { warpedBonusValue } from "./spell-warp.mjs";
import {
  MAGIC_STONE_COUNT, magicStoneBonus, magicStoneItemData, magicStoneLine, magicStoneTraitLine
} from "./magic-stone.mjs";
import {
  BLEEDING, bleedReliefFor, bleedStoppedLine, healedInsteadLine, normaliseBleedAlternative
} from "./bleed-relief.mjs";
import {
  alreadyRelievedLine, alreadyRelievedToday, casterGainsLine, markRelievedToday, normaliseConditionRelief,
  reliefAmountFormula, reliefChoiceAmount, reliefReaches,
  reliefChoices, reliefLine, reliefNeedsPrompt, reliefNothingLine, reliefPlan
} from "./condition-relief.mjs";

/**
 * Where a creature's "one of these a day" record lives — on the TARGET,
 * cleared by their own daily preparations. See condition-relief.mjs.
 */
const RELIEF_FLAG = "reliefUsedToday";
import { OPPOSED_AURA_FLAG, opposedAuraRecordsFor, opposingTraitsOf } from "./opposed-aura.mjs";
import { effectNoTargetLine, reportsItsOwnAbsence } from "./cast-result-line.mjs";
import { normaliseFlatLadder, LADDER_KINDS } from "./flat-ladder.mjs";
import {
  normaliseConjuredItem, conjuredItemLine, conjuredItemMissingLine, conjuredItemNobodyNamedLine,
  conjuredItemRecipients
} from "./conjured-item.mjs";
import { contentPack } from "../content-packs.mjs";
// The damage pipeline is imported lazily inside applyDamageEffect (below): those
// combat modules touch Foundry globals at load, and pulling them at module-eval
// would make this file unimportable outside Foundry (e.g. the node harnesses).

const SYSTEM_ID = "trg-prime";
const DEFAULT_SPELL_IMG = "icons/magic/symbols/runes-star-blue.webp";
const SAVE_KEYS = new Set(["fortitude", "reflex", "will"]);

const line = (text) => `<p style="margin:2px 0">${text}</p>`;

/**
 * Duration reasoning now lives in ./effect-duration.mjs — one pure file
 * that answers every "how long?" question, including the per-effect
 * override this release adds. RE-EXPORTED rather than moved outright so
 * cast-workflow, bardic-conviction and wildshape-riders keep the import
 * they have always had; there is still exactly one definition.
 */
export { parseSpellDuration } from "./effect-duration.mjs";

/** The bonus-pool target path for a buff slot (saves live under system.combat.saves). */
/**
 * The six attributes, which live under `system.attributes` rather than
 * under `system.combat` — and which a spell can now raise directly.
 *
 * Shape Of The Animal's forms are the reason: "Agile: Str +1, Dex +2"
 * is a bonus like any other, but the slot it lands in is not a combat
 * one, and `bonusTargetFor` only knew about combat slots and saves. A
 * polymorph spell whose Str line silently went to `system.combat.strength`
 * would have applied nothing at all, quietly.
 */
const ATTRIBUTE_SLOTS = new Set([
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"
]);

/**
 * The 26 master skills, which live under `system.skills` — a third place
 * again, and the one a spell that buffs a skill has to reach.
 *
 * Animal Spirit is the reason: "Bear: ... a +2 status bonus to the
 * Athletics skill." Without this the slot resolved to
 * `system.combat.athletics`, which is not a pool, is read by nothing,
 * and would have applied absolutely nothing — quietly, exactly as a
 * polymorph spell's Strength line did before ATTRIBUTE_SLOTS was added
 * above it.
 *
 * Built from config.mjs's own skill list rather than named here, so a
 * skill added to the system is reachable without editing this file.
 */
const SKILL_SLOTS = new Set(Object.keys(SKILLS));

/**
 * The five movement speeds — POOLED at 3.412.0, on Graham's ruling.
 *
 * THIS SLOT EXISTED AT 3.410.0 AND DID NOTHING. Each speed was a bare
 * number, so a bonus written to `movement.land.status` set a property on
 * the number 30 and vanished. Live proof, one cast of Physical Surge:
 * Athletics 0 → 2, land 20 → 20. The check that passed it asked whether
 * the PATH existed — it did — rather than whether a bonus could land
 * there, which is the wrong property and the reason it was believed.
 *
 * 3.411.1 removed the slot and refused it loudly. 3.412.0 restores it,
 * because the speeds are now real pools carrying
 * `base/item/status/circumstance/other/total`, and both the spell applier
 * and the Universal Modifier — whose movement bonuses had never worked
 * either — reach them properly.
 *
 * "SPEED" MEANS LAND, which is what the books' unqualified "your Speed"
 * means and what every spell using it says. A spell meaning another names
 * it.
 */
const MOVEMENT_SLOTS = new Map([
  ["speed", "land"], ["land", "land"], ["fly", "fly"],
  ["swim", "swim"], ["climb", "climb"], ["burrow", "burrow"]
]);

/**
 * Every movement speed this creature actually has.
 *
 * GRAHAM'S RULING on Quick Time's "all Speeds": *"it will affect any
 * speeds that the character has (but only if they have them)."* A
 * landbound human gains land; a dragon gains land, fly and swim; nobody
 * gains a swim speed out of a haste spell.
 *
 * READ FROM `base`, not `total`, so a speed a creature only has BECAUSE
 * of this very spell cannot bootstrap itself into existence.
 */
export const ALL_SPEEDS_SLOT = "allSpeeds";
/*
 * "SKILL CHECKS", ALL OF THEM (3.594.0, R6 — Prayer). The page grants a
 * luck bonus "with attack checks, skill checks, and Will saves", and
 * `slot` names ONE pool: there are twenty-six skills and no word for all
 * of them. `allSpeeds` had the same problem for legs and solved it by
 * expanding into one change per pool the creature actually has; this is
 * that, for skills.
 */
export const ALL_SKILLS_SLOT = "allSkills";

export function speedsPresentOn(system) {
  const movement = system?.combat?.movement ?? {};
  return [...new Set(MOVEMENT_SLOTS.values())]
    // `speedBase`, not `movement[key]?.base`: on an unmigrated bare number
    // the optional chain yields undefined and Quick Time finds no speeds
    // at all on a character who plainly has one.
    .filter((key) => speedBase(movement[key]) > 0);
}

/**
 * The `system.combat.*` targets a bonus may land on, and the only ones.
 *
 * NEW at 3.590.0, and it closes a hole the comment below has claimed to
 * close since 3.411.1. That claim — "a slot with nowhere pooled to land
 * is still refused where somebody can see it; null is visible to a
 * harness, a wrong path is not" — was true for `allSpeeds` alone. Every
 * OTHER unknown word fell through to `system.combat.<word>`, which is a
 * path-shaped string rather than a refusal, so `applyBonusEffect`'s
 * `if (!placed)` guard never fired for it.
 *
 * MEASURED LIVE, 25 September 2026: a CUSTOM change written to
 * `system.combat.multitasking.status` reaches the bonus pool (the pool
 * for that path has one entry) and nothing ever resolves it, so
 * `system.combat.multitasking` stays null. The card announces "+5 status
 * bonus to multitasking" and the sheet does not move — the silent
 * nothing 3.411.1 was written to remove, still present for every slot
 * name but one.
 *
 * FOUND BY MUTATING A PACK ROW. Hypercognition's +5 was retargeted to a
 * slot nothing can reach and the block's own check went on passing,
 * because it asserted that senseMotive and perception exist rather than
 * that THIS SPELL's rows land.
 *
 * THE LIST IS THE SET OF `applyTarget` PATHS IN documents/actor.mjs,
 * read off it rather than remembered. `spellcraft` is NOT among them:
 * it is pooled at `system.magic.spellcraft`, and routing it through
 * `system.combat.` — which is what this function did — was the same
 * silent nothing wearing a real slot's name.
 */
const COMBAT_BONUS_SLOTS = new Set([
  "attack", "defence", "initiative", "dr",
  "naturalArmourFlat", "naturalArmourBase"
]);

export function bonusTargetFor(slot) {
  if (ATTRIBUTE_SLOTS.has(slot)) return `system.attributes.${slot}`;
  if (SKILL_SLOTS.has(slot)) return `system.skills.${slot}`;
  if (slot === "spellcraft") return "system.magic.spellcraft";
  // A slot with nowhere pooled to land is still refused where somebody
  // can see it — null is visible to a harness, a wrong path is not.
  if (slot === ALL_SPEEDS_SLOT || slot === ALL_SKILLS_SLOT) return null;
  if (MOVEMENT_SLOTS.has(slot)) return `system.combat.movement.${MOVEMENT_SLOTS.get(slot)}`;
  if (SAVE_KEYS.has(slot)) return `system.combat.saves.${slot}`;
  return COMBAT_BONUS_SLOTS.has(slot) ? `system.combat.${slot}` : null;
}

function foundryDuration(parsed) {
  if (!parsed) return undefined;
  const d = {};
  if (parsed.rounds) d.rounds = parsed.rounds;
  if (parsed.seconds) d.seconds = parsed.seconds;
  return Object.keys(d).length ? d : undefined;
}

/**
 * Timing for a spell-applied ongoing effect so it auto-removes when the spell
 * ends: a round-based expiry (swept at the start of a turn while a combat is
 * running) and an absolute world-time end (swept by the world clock otherwise).
 * A spell with no parseable duration returns no timing — the effect stays until
 * the GM clears it by hand.
 *
 * @param {{rounds:number|null, seconds:number|null}|null} parsed
 * @returns {{spellEffect:boolean, expiresRound:number|null, spellEffectEnd:number|null, foundryDuration:object|undefined}}
 */
/**
 * A declared effect's conditionals, the ones marked `warpBonus: true` grown by
 * a bonus warp (3.672.0). Every other row is returned as it came.
 */
export function declaredConditionalsWarped(rows, warpBonus = 0, warpBonusMax = null) {
  return (Array.isArray(rows) ? rows : []).map((row) => (row?.warpBonus === true && Number.isFinite(Number(row.value))
    ? { ...row, value: warpedBonusValue(Number(row.value), warpBonus, warpBonusMax) }
    : row));
}

/**
 * What a bonus warp adds to a DC bonus row, its cap counted (3.672.0). The
 * row's own value plus this never passes `warpBonusMax`, as
 * `warpedBonusValue` holds every other bonus row.
 */
export function defenceDCWarpExtra(value, warpBonus = 0, warpBonusMax = null) {
  const extra = Math.max(0, Number(warpBonus) || 0);
  if (warpBonusMax === null || warpBonusMax === undefined) return extra;
  return Math.max(0, Math.min(extra, Math.abs(Number(warpBonusMax) || 0) - Math.abs(Number(value) || 0)));
}

function spellExpiryTiming(parsed) {
  const out = { spellEffect: false, expiresRound: null, spellEffectEnd: null, foundryDuration: foundryDuration(parsed) };
  if (!parsed) return out;
  if (parsed.seconds != null) {
    out.spellEffect = true;
    out.spellEffectEnd = Number(game.time?.worldTime ?? 0) + Number(parsed.seconds);
  }
  if (parsed.rounds != null && game.combat?.started) {
    out.spellEffect = true;
    out.expiresRound = Number(game.combat.round ?? 0) + Number(parsed.rounds);
  }
  /*
   * ONE CLOCK PER EFFECT (3.476.0).
   *
   * REPORTED FROM A LIVE SESSION, 2 September 2026, as a console error
   * when Protective Ward ended:
   *
   *   "A parent Document provided to the database operation must be a
   *    Document instance"
   *   "undefined id [...] does not exist in the EmbeddedCollection"
   *
   * REPRODUCED HERE ON 3 September: advancing the world clock past a
   * spell's duration produced both errors, every time.
   *
   * THE CAUSE IS TWO CLOCKS ON ONE EFFECT. We set our own end —
   * `spellEffectEnd` / `expiresRound`, swept by `expireSpellEffects`,
   * which DELETES the effect and reports it on a card — and we ALSO
   * handed Foundry a `duration`, which its own `ActiveEffectRegistry`
   * sweeps and tries to UPDATE. Ours deletes first; Foundry's batch then
   * updates a document that is no longer there.
   *
   * SO THE EFFECT WE EXPIRE OURSELVES GETS NO FOUNDRY DURATION. The
   * remaining time is not lost — `spellEffectRemaining` reads our own
   * flag and the sheets render from that, so the countdown a player sees
   * is the clock that actually governs the effect rather than a second
   * one that agreed with it by construction.
   *
   * AN EFFECT WITH NO CLOCK OF OURS still gets Foundry's, unchanged: a
   * duration nobody sweeps is display-only and cannot race anything.
   */
  if (out.spellEffect) out.foundryDuration = undefined;
  return out;
}

/**
 * Seconds left on an effect this system expires, or null.
 *
 * THE CLOCK THAT ACTUALLY GOVERNS IT. Foundry's `duration.label` used to
 * answer this, and it was a SECOND clock that happened to agree; since
 * 3.476.0 our own end time is the only one, so it is also the only
 * honest source for what a player is shown.
 */
function spellEffectRemaining(effect, worldTime = null) {
  const end = effect?.flags?.[SYSTEM_ID]?.spellEffectEnd;
  if (end === undefined || end === null) return null;
  const now = Number(worldTime ?? game.time?.worldTime ?? 0);
  return Math.max(0, Number(end) - now);
}

/**
 * What the sheets show for how long an effect has left.
 *
 * FALLS BACK TO FOUNDRY'S LABEL, because effects this system does not
 * expire still carry a Foundry duration and it is still the right thing
 * to print for them.
 */
export function spellEffectDurationLabel(effect, worldTime = null) {
  const left = spellEffectRemaining(effect, worldTime);
  if (left === null) return effect?.duration?.label ?? "Ongoing";
  if (left <= 0) return "Expired";
  if (left < 60) return `${left} sec`;
  const mins = Math.floor(left / 60);
  const secs = left % 60;
  if (mins < 60) return secs ? `${mins} min ${secs} sec` : `${mins} min`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours} hr ${remMins} min` : `${hours} hr`;
}

/**
 * Restore HP up to the actor's maximum. Returns HP actually restored.
 * @param {Actor} actor
 * @param {number} amount
 * @returns {Promise<number>}
 */
export async function healActor(actor, amount, { magical = true, direct = false, noDyingFatigue = false, dyingHalf = false } = {}) {
  const hp = actor.system?.resources?.hp;
  if (!hp) return 0;

  /*
   * SOMEBODY ELSE'S CHARACTER IS HEALED THROUGH THE GM (3.474.0).
   *
   * FOUND IN A LIVE SESSION, 2 September 2026: a player cast Cure on
   * another player's character and Foundry refused — "user lacks
   * permission to create active effect". A player owns their own actor
   * and nobody else's, and everything below here writes: the HP update,
   * the Dying step, and the unconscious clear.
   *
   * `direct` IS THE GM'S OWN RE-ENTRY. The relay handler calls this
   * function on the GM's client, where the ownership check would pass
   * anyway — but without a flag it would ask the relay again and the
   * request would bounce for ever.
   */
  if (!direct) {
    const { relayHeal } = await import("../combat/target-relay-workflow.mjs");
    const { needsRelay } = await import("../combat/target-relay.mjs");
    if (needsRelay(actor)) return relayHeal(actor, amount, { magical, noDyingFatigue, dyingHalf }, null);
  }

  // HEALING WHILE DYING (Graham, 13 Aug 2026). "If a character receives the
  // benefit of a magical effect (including regeneration) that heals HP while
  // they have the Dying condition, the condition is reduced by 1. Non-magical
  // healing (including fast healing) has no effect on you unless the
  // Resuscitation (Medicine) action is used."
  //
  // So a Cure on a Dying ally is not a Cure at all: it spends itself buying
  // back one step of Dying and restores no hit points. `magical` defaults
  // TRUE because every caller of this function today is a spell — but it is
  // a parameter rather than an assumption, so a non-magical caller arriving
  // later says so rather than silently healing a dying character.
  if (actor.hasCondition?.("dying")) {
    const { healingWhileDying, applyDyingRecovery } = await import("../combat/death-state.mjs");
    const rule = healingWhileDying({ dying: true, magical });
    if (rule.dyingDelta) {
      const current = Number(actor.getConditionValue?.("dying") ?? 1);
      const next = Math.max(0, current + rule.dyingDelta);
      if (next > 0) await actor.toggleStatusEffect("dying", { value: next });
      // DEATH'S DEFIANCE (3.611.0): "coming back from dying due to this
      // healing doesn't increase its Fatigued condition".
      else await applyDyingRecovery(actor, { noFatigue: noDyingFatigue });
    }
    // RESURGENT HEALING (3.625.0): a Dying creature "regains half the
    // normal amount of HP restored by the spell rather than being restored
    // to 1 HP" — the Dying step above still happens; the hit points follow.
    if (!rule.healsHP && !dyingHalf) return 0;
    if (!rule.healsHP && dyingHalf) amount = Math.floor(Math.max(0, Number(amount) || 0) / 2);
  }

  const before = Number(hp.value ?? 0);
  const max = Number(hp.max ?? 0);
  const after = Math.min(max, before + Math.max(0, Math.round(Number(amount) || 0)));
  if (after !== before) await actor.update({ "system.resources.hp.value": after });
  // "…unless you are brought to 1+ HP, in which case you lose the
  // Unconscious condition."
  if (after > 0 && before <= 0) {
    const { clearUnconsciousIfConscious } = await import("../combat/death-state.mjs");
    await clearUnconsciousIfConscious(actor);
  }
  // UNTIL HEALED (page 193; the block-19 audit's D9, Graham's R9): a UH
  // critical's conditions end when the creature "reaches full HP" — by
  // magic here, which is the half that needs no rest at all.
  if (magical && max > 0 && after >= max) {
    const { settlePersistence } = await import("../injury-workflow.mjs");
    const cleared = await settlePersistence(actor, { fullHP: true, magicalHealing: true });
    if (cleared.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: '<div class="trg-prime trg-check-card">'
          + `<p style="margin:2px 0"><strong>Healed to full.</strong> Until Healed injuries end: `
          + `<em>${cleared.join("; ")}</em></p></div>`
      });
    }
  }
  return after - before;
}

/** Temporary HP doesn't stack — keep the higher pool. Returns the pool afterwards. */
/**
 * VAMPIRIC TOUCH'S GIFT (3.609.0, R8): temporary hit points the caster keeps
 * for the row's duration, carried by a marker effect whose end clears what
 * is left of them. See magic/life-transfer.mjs.
 *
 * @returns {Promise<number>} the pool now
 */
export async function grantSiphonedTempHP(caster, amount, { spellName = "", img = "", duration = "1 minute" } = {}) {
  const gift = Math.max(0, Math.floor(Number(amount) || 0));
  if (!caster || gift <= 0) return Number(caster?.system?.resources?.hp?.temp ?? 0);
  const pool = await grantTempHP(caster, gift);
  const timing = spellExpiryTiming(parseSpellDuration(duration));
  const flags = { [SYSTEM_ID]: { spellBuff: true, tempHpGrant: gift } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  const data = {
    name: `${spellName || "Siphon"} (temporary HP)`,
    img: img || DEFAULT_SPELL_IMG,
    changes: [],
    flags
  };
  if (timing.foundryDuration) data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  await createEffectsOn(caster, [data]);
  return pool;
}

export async function grantTempHP(actor, amount) {
  const current = Number(actor.system?.resources?.hp?.temp ?? 0);
  const next = Math.max(current, Math.max(0, Math.round(Number(amount) || 0)));
  if (next !== current) await actor.update({ "system.resources.hp.temp": next });
  return next;
}

async function rollAmount(formula, rollData, rolls) {
  const f = String(formula ?? "").trim();
  if (!f) return 0;
  const roll = await new Roll(f, rollData).evaluate();
  rolls.push(roll);
  return Math.max(0, roll.total);
}

/**
 * Auto-hit damage (no attack roll, no save) — e.g. Magic Missile's darts. Fires
 * `effect.count` instances (missiles), each rolling the formula and striking a
 * recipient, distributed round-robin across the targets (all onto one target if
 * only one is chosen). Each hit runs the normal defence/resistance pipeline and
 * the dying check. Pushes a line per hit and returns nothing (rolls collected in
 * `rolls`).
 */
async function applyDamageEffect(recipients, effect, { rollData, rolls, warpDice, lines, elementalType = null, extraDamage = 0 }) {
  const [{ resolveAgainstDefences }, { applyDamageAndCheckDying }] = await Promise.all([
    import("../combat/damage-workflow.mjs"),
    import("../combat/dying-workflow.mjs")
  ]);
  const formula = addDice(effect.formula, warpDice);
  // Elemental Spell (Chapter 5 metamagic): the chosen energy type
  // replaces the spell's normal damage type for this cast (the half/half
  // split variant is a card note the GM applies by hand).
  const type = elementalType || effect.damageType || effect.type || "force";
  const count = Math.max(1, Math.floor(Number(effect.count) || 1));
  for (let i = 0; i < count; i++) {
    const target = recipients[i % recipients.length];
    // Intense Spells (Wizard School: Invocation) folds in once, onto the
    // FIRST instance only — "increases its total damage", read as the
    // spell's overall total rather than a per-missile multiplier for an
    // auto-hit spell that strikes more than once.
    const bonus = i === 0 ? Math.max(0, Math.floor(Number(extraDamage) || 0)) : 0;
    const amount = (await rollAmount(formula, rollData, rolls)) + bonus;
    const packet = resolveAgainstDefences(target.system ?? {}, {
      amount,
      type,
      // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
      creatureTypeSystem: ownedCreatureTypeSystem(target),
      magical: true
    });
    // Bracers of Armour absorb what their DR stopped (3.617.0, R17).
    const { drainBracers } = await import("../bracers-workflow.mjs");
    const bracersLine = await drainBracers(target, packet);
    if (bracersLine) lines.push(bracersLine);
    let newHP = null;
    if (packet.taken > 0) {
      const applied = await applyDamageAndCheckDying(target, packet.taken);
      newHP = applied?.newHP;
    }
    const tag = count > 1 ? ` (${i + 1}/${count})` : "";
    lines.push(
      line(
        packet.immune
          ? `${target.name}: <strong>immune</strong> to ${type}${tag}.`
          : `${target.name}: <strong>${packet.taken}</strong> ${type}${newHP != null ? ` — now ${newHP} HP` : ""}${tag} (${formula}${bonus ? ` + ${bonus} Intense Spells` : ""}).`
      )
    );
  }
}

const SLOT_LABELS = {
  strength: "to Strength",
  dexterity: "to Dexterity",
  constitution: "to Constitution",
  intelligence: "to Intelligence",
  wisdom: "to Wisdom",
  charisma: "to Charisma",
  dr: "Damage Reduction",
  attack: "to attacks",
  defence: "to Defence",
  initiative: "to Initiative",
  will: "to Will saves",
  reflex: "to Reflex saves",
  fortitude: "to Fortitude saves",
  spellcraft: "to Spellcraft",
  // 3.578.1 (F3 of the 3.578.0 live test): the Tanglefoot Bag's card read
  // "-10 status penalty to allSpeeds" — the slot's key, not its words.
  allSpeeds: "to all Speeds",
  // 3.594.2 (the 3.594.1 live drive): Prayer's card read "+1 luck bonus
  // to allSkills" — the same defect as allSpeeds above, one slot later.
  // Keyed off the constant so a renamed slot cannot quietly lose its
  // words again.
  [ALL_SKILLS_SLOT]: "to every skill check",
  speed: "to Speed",
  perception: "to Perception"
};

function bonusDescription(effect) {
  const word = (Number(effect.value) || 0) < 0 ? "penalty" : "bonus";
  // AN INCREASE TO NATURAL ARMOUR IS NOT A TYPED BONUS (3.622.1, G1 of the
  // 3.622.0 drive). Barkskin's card read "+1 status bonus to
  // naturalArmourFlat": the slot's key, and a type that 3.621.0's R2 made
  // untrue — anything aimed at natural armour that is not itself a natural
  // armour VALUE is an increase, and adds.
  if (effect.slot === "naturalArmourFlat" || effect.slot === "naturalArmourBase") {
    if (String(effect.bonusType ?? "") !== "naturalArmour") {
      return `${(Number(effect.value) || 0) < 0 ? "decrease" : "increase"} to natural armour DR`;
    }
    return `natural armour DR`;
  }
  return `${effect.bonusType || "status"} ${word} ${SLOT_LABELS[effect.slot] || `to ${effect.slot}`}`;
}

/**
 * The name an applied effect carries on the target's Effects tab.
 *
 * A NOTE SUPPLIES ITS OWN BRACKETS, and this used to add a second pair.
 * Five sites built this string and every one of them wrote
 * `` `${spell.name} (${effect.note})` `` — while every note in the pack
 * is already written bracketed:
 *
 *   Aura                "(foes attack you at -2)"
 *   Stone Shield        "(cover from one chosen enemy until …)"
 *   Zealous Conviction  "(vs mental effects)"
 *
 * so those three have carried names like *Aura ((foes attack you at
 * -2))* since they were authored. Measured 25 August 2026: EIGHT of eight
 * notes in the pack are self-bracketed and none is bare, so the
 * convention is the data's, and the wrapper was the thing disagreeing
 * with it. The card's own line (further down) never added brackets and
 * has always read correctly — the two disagreed and the card was right.
 *
 * ONE FUNCTION because five places were deciding one question, which is
 * this project's named anti-pattern and the reason the fault survived in
 * three spells without being noticed in any of them.
 *
 * @param {string} spellName
 * @param {string} [note] The effect's scope, brackets included.
 * @param {string} [suffix] " — traits", " — Familiar", and so on.
 */
export function effectName(spellName, note, suffix = "") {
  const scope = String(note ?? "").trim();
  return `${spellName}${scope ? ` ${scope}` : ""}${suffix}`;
}

/** Create a bonus Active Effect on a target — its CUSTOM-mode change flows through
 *  TRGActiveEffect into the Appendix-1 bonus pool and onto the target's rolls. */
async function applyBonusEffect(target, spell, effect, parsedDuration, castId = null, opposedTo = [], registersCast = false) {
  const bonusType = effect.bonusType || "status";
  // "ALL SPEEDS" IS AS MANY ROWS AS THE CREATURE HAS SPEEDS, resolved
  // against the TARGET — it is their legs the spell is quickening.
  /*
   * EVERY SKILL THE SHEET HAS, resolved against the TARGET for the same
   * reason `allSpeeds` is: it is their training the spell is sharpening.
   * A creature with no skills block gets a refusal it can read rather
   * than an effect with an empty changes array, which is the shape this
   * file treats as "looks applied and does nothing".
   */
  if (effect.slot === ALL_SKILLS_SLOT) {
    const keys = Object.keys(target?.system?.skills ?? {}).filter((k) => SKILL_SLOTS.has(k));
    if (!keys.length) return { applied: false, reason: "no skills to modify" };
    const timingS = spellExpiryTiming(parsedDuration);
    const flagsS = { [SYSTEM_ID]: { spellBuff: true } };
    if (timingS.spellEffect) flagsS[SYSTEM_ID].spellEffect = true;
    if (timingS.spellEffectEnd != null) flagsS[SYSTEM_ID].spellEffectEnd = timingS.spellEffectEnd;
    if (timingS.expiresRound != null) flagsS[SYSTEM_ID].conditionExpiresRound = timingS.expiresRound;
    if (castId) flagsS[SYSTEM_ID].castId = castId;
    if (castId && registersCast) flagsS[SYSTEM_ID].endsWithCast = true;
    const dataS = {
      name: effectName(spell.name, effect.note),
      img: spell.img || DEFAULT_SPELL_IMG,
      origin: spell.uuid,
      changes: keys.map((key) => ({
        key: `${bonusTargetFor(key)}.${bonusType}`,
        type: CHANGE_TYPE.CUSTOM,
        value: String(Number(effect.value) || 0)
      })),
      flags: flagsS
    };
    if (timingS.foundryDuration) {
      dataS.duration = { ...timingS.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
    }
    await createEffectsOn(target, [dataS]);
    return { applied: true, skills: keys.length };
  }

  if (effect.slot === ALL_SPEEDS_SLOT) {
    const present = speedsPresentOn(target?.system);
    if (!present.length) {
      return { applied: false, reason: "no movement speeds to quicken" };
    }
    const speedKeys = present.map((key) => `${bonusTargetFor(key)}.${bonusType}`);
    const timing0 = spellExpiryTiming(parsedDuration);
    const flags0 = { [SYSTEM_ID]: { spellBuff: true } };
    if (timing0.spellEffect) flags0[SYSTEM_ID].spellEffect = true;
    if (timing0.spellEffectEnd != null) flags0[SYSTEM_ID].spellEffectEnd = timing0.spellEffectEnd;
    if (timing0.expiresRound != null) flags0[SYSTEM_ID].conditionExpiresRound = timing0.expiresRound;
    if (castId) flags0[SYSTEM_ID].castId = castId;
    if (castId && registersCast) flags0[SYSTEM_ID].endsWithCast = true;
    const data0 = {
      name: effectName(spell.name, effect.note),
      img: spell.img || DEFAULT_SPELL_IMG,
      origin: spell.uuid,
      changes: speedKeys.map((each) => ({
        key: each, type: CHANGE_TYPE.CUSTOM, value: String(Number(effect.value) || 0)
      })),
      flags: flags0
    };
    if (timing0.foundryDuration) {
      data0.duration = { ...timing0.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
    }
    await createEffectsOn(target, [data0]);
    return { applied: true, speeds: present };
  }

  // A CONDITIONAL BONUS IS NEVER A SHEET CHANGE (3.446.2).
  //
  // THE DEFECT: this function is the CAST-time path, and until now only
  // the boundary-crossing path (emanation-effects.mjs) knew about
  // `opposedAura`. So Radiant Aegis's "+1 DB against creatures with an
  // opposing aura" was written onto every ally caught at the cast as a
  // flat `system.combat.defence.status = 1` — an unconditional +1 that
  // raised their DB against everybody. Found by casting it in Graham's
  // world on 31 August 2026, in the spell the whole design was built to
  // protect, because the harness drove one caller and assumed the other.
  //
  // ROUTED THROUGH THE SHARED RULE so the two paths cannot diverge again.
  if (effect.opposedAura) {
    const records = opposedAuraRecordsFor(effect, opposedTo, spell.name);
    const conditional = { [SYSTEM_ID]: { spellBuff: true } };
    const timingC = spellExpiryTiming(parsedDuration);
    if (timingC.spellEffect) conditional[SYSTEM_ID].spellEffect = true;
    if (timingC.spellEffectEnd != null) conditional[SYSTEM_ID].spellEffectEnd = timingC.spellEffectEnd;
    if (timingC.expiresRound != null) conditional[SYSTEM_ID].conditionExpiresRound = timingC.expiresRound;
    if (castId) conditional[SYSTEM_ID].castId = castId;
    if (castId && registersCast) conditional[SYSTEM_ID].endsWithCast = true;
    if (records.defenceDC.length) conditional[SYSTEM_ID].defenceDC = records.defenceDC;
    if (records.attack.length) conditional[SYSTEM_ID][OPPOSED_AURA_FLAG] = records.attack;
    const dataC = {
      name: effectName(spell.name, effect.note),
      img: spell.img || DEFAULT_SPELL_IMG,
      origin: spell.uuid,
      // NO `changes`, deliberately. The whole point is that the number
      // is consulted per opponent rather than added to a total.
      changes: [],
      flags: conditional
    };
    if (timingC.foundryDuration) {
      dataC.duration = { ...timingC.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
    }
    await createEffectsOn(target, [dataC]);
    return { applied: true, conditional: true };
  }

  const placed = bonusTargetFor(effect.slot);
  if (!placed) {
    // LOUD. A bonus with nowhere to land used to vanish into a bare
    // number; now the caller can say which slot could not be placed.
    return { applied: false, reason: `"${effect.slot}" is not a bonus slot on this sheet` };
  }
  const keys = [`${placed}.${bonusType}`];
  const timing = spellExpiryTiming(parsedDuration);
  // Flag it as a managed spell effect (shows on the Effects table, auto-removed
  // when the spell ends) and record how it expires. `origin` points at the
  // spell so the table's origin column names it.
  const flags = { [SYSTEM_ID]: { spellBuff: true } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
  const data = {
    name: effectName(spell.name, effect.note),
    img: spell.img || DEFAULT_SPELL_IMG,
    origin: spell.uuid,
    changes: keys.map((each) => ({
      key: each, type: CHANGE_TYPE.CUSTOM, value: String(Number(effect.value) || 0)
    })),
    flags
  };
  // A CREATURE WITH NO SPEEDS AT ALL GETS NOTHING, and says so rather
  // than creating an effect with an empty changes array that looks
  // applied on the Effects tab and does nothing.

  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  await createEffectsOn(target, [data]);
}

/**
 * The three defence fields a form spell can add to, and the only three.
 *
 * They are TEXT, comma-separated, read by resolveImmunities and kin in
 * defences.mjs — not numbers, and not a bonus pool. So a form's
 * "Immunity to Fire" cannot go through applyBonusEffect at all; it is an
 * ADD-mode change that concatenates onto the list.
 */
export const DEFENCE_FIELDS = Object.freeze({
  immunity: { path: "system.combat.immunities", label: "immunity to" },
  resistance: { path: "system.combat.resistances", label: "resistance to" },
  weakness: { path: "system.combat.weaknesses", label: "weakness to" }
});

/**
 * Add an immunity, resistance or weakness for the spell's duration.
 *
 * WHY ADD-MODE AND A LEADING COMMA. There is no other way to append to a
 * string through an ActiveEffect — mode ADD concatenates — so every
 * authored value has to lead with ", " or it fuses onto whatever is
 * already there ("gnomefey"). `prepareTextLists` in documents/actor.mjs
 * tidies the leading separator when nothing wrote first, which is the
 * same treatment a race's own traits line already gets.
 *
 * EXPIRES WITH THE SPELL, through the same timing flags a bonus uses —
 * an immunity that outlived the form would be worse than one that never
 * applied, because nothing on the sheet would explain it.
 */
async function applyDefenceEffect(target, spell, effect, parsedDuration, castId = null, registersCast = false) {
  const field = DEFENCE_FIELDS[String(effect.field ?? "immunity")];
  if (!field) return null;
  const values = (Array.isArray(effect.values) ? effect.values : [effect.value])
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  if (!values.length) return null;

  const timing = spellExpiryTiming(parsedDuration);
  const flags = { [SYSTEM_ID]: { spellBuff: true } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

  const data = {
    name: effectName(spell.name, effect.note),
    img: spell.img || DEFAULT_SPELL_IMG,
    origin: spell.uuid,
    changes: values.map((value) => ({
      key: field.path,
      type: CHANGE_TYPE.ADD,
      value: `, ${value}`
    })),
    flags
  };
  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  await createEffectsOn(target, [data]);
  return `${field.label} ${values.join(", ")}`;
}

/**
 * Grant a natural attack for the spell's duration.
 *
 * WHY THIS IS TWO DOCUMENTS. A natural attack has to be a REAL weapon item —
 * that is the only thing `rollWeaponAttack` can be pointed at, and anything
 * less would be a card that describes claws you cannot swing with. But an Item
 * cannot expire: both sweepers (`expireTimedConditions` on the combat clock,
 * `expireSpellEffects` on the world clock) walk `actor.effects`, and teaching
 * each of them to also walk `actor.items` would put the "has this spell ended?"
 * decision in three places instead of one.
 *
 * So the weapon is OWNED by an ActiveEffect. The effect carries the ordinary
 * expiry flags every other spell effect carries, and a `grantedItems` flag
 * listing what it created. `registerGrantedItemCleanup` deletes those items
 * whenever that effect goes — by round expiry, by world-clock expiry, by the
 * spell being dismissed, or by a GM deleting the effect off the sheet. One
 * rule about when a spell ends, four routes into it, no duplication.
 *
 * THE LIFECYCLE PROBLEM THIS SOLVES was stated in the 3.305.0 notes as the
 * reason natural attacks were deferred: Hybrid Transformation creates a real
 * weapon too, but destroys it from a toggle the player presses twice, which is
 * not a clock. This is the clock-driven equivalent, and Hybrid Transformation
 * is deliberately left alone — its toggle is correct for what it models.
 *
 * PROFICIENCY. Natural attacks are never unproficient; the character is using
 * their own body. The created weapon carries the Unarmed category for the same
 * reason the Hybrid Bite does — without it the proficiency engine would hand
 * every polymorphed druid a -4 on the only attack their form has.
 */
/**
 * An effect that carries override changes and the spell's own clock.
 *
 * TWO KINDS USE THIS — `speedSet` and `sizeStep` — and it exists because
 * they are the first rows in this system that REPLACE a figure rather than
 * adding to it. Everything about the lifecycle is the same as a bonus
 * row's: the timing flags a sweeper reads, the cast id, and
 * `endsWithCast` when the cast registers one.
 */
function overrideEffectData({
  name, spell, changes, parsedDuration, castId, registersCast, grantedItems = null
} = {}) {
  const timing = spellExpiryTiming(parsedDuration);
  const flags = { [SYSTEM_ID]: { spellBuff: true } };
  // AN EFFECT THAT OWNS AN ITEM SAYS SO, so `registerGrantedItemCleanup`
  // takes the item away when the effect goes — the one lifecycle every
  // granted sense, speed and ability already uses.
  if (grantedItems?.length) flags[SYSTEM_ID].grantedItems = [...grantedItems];
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
  const data = {
    name,
    img: spell.img || DEFAULT_SPELL_IMG,
    origin: spell.uuid,
    changes,
    flags
  };
  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  return data;
}

async function applyAttackEffect(target, spell, effect, parsedDuration, castId = null, registersCast = false) {
  const wanted = String(effect.attack ?? effect.name ?? "").trim();
  if (!wanted) return null;

  // THE STATS COME FROM THE CREATURE-ATTACKS PACK, NOT FROM HERE.
  //
  // The system already ships Bite, Claw, Slam, Tentacle, Gore, Hoof, Sting,
  // Tail Slap and Wings, each with its damage die, damage type and traits.
  // The Shape spells' printed text names the attack ("You gain a slam natural
  // attack", "a bite and claw natural attack") and never states a die — so the
  // die is the pack's, and copying it here would be a second copy of a figure
  // that has to agree with itself across twenty-three forms.
  const pack = contentPack("creature-attacks");
  let source = null;
  if (pack) {
    const index = await pack.getIndex();
    const entry = index.find((e) => String(e.name).trim().toLowerCase() === wanted.toLowerCase());
    if (entry) source = await pack.getDocument(entry._id);
  }
  // A named attack the pack does not have is REPORTED, not invented. An
  // unrecognised name would otherwise become a 1d4 club with the right label,
  // which is worse than an honest gap — the same lesson the three unmodellable
  // defence values taught in 3.305.0.
  if (!source) {
    return { note: `${wanted} — no such creature attack in the compendium; add it by hand.` };
  }

  const packTraits = String(source.system?.traits ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const extra = String(effect.extraTraits ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const traits = [...new Set([...packTraits, ...extra])].join(", ");
  const timing = spellExpiryTiming(parsedDuration);

  // THE PACK ENTRY IS COPIED WHOLE, and only what the SPELL changes is
  // overridden. The compendium's natural attacks already ship equipped, at
  // quantity 1, flagged `natural`, in melee mode and in the Unarmed category —
  // that last one being what stops the proficiency engine handing a
  // polymorphed caster a -4 on the only attack their form has.
  //
  // Those were all re-stated here at first, and every one of them was
  // unmutatable: setting `category: "Unarmed"` on top of a pack that already
  // says Unarmed cannot be broken into a visible failure. They were duplicates
  // of the pack, so they went, and the checks that assert them now watch the
  // PACK's values arrive intact — which is the thing actually worth watching.
  const [created] = await target.createEmbeddedDocuments("Item", [{
    name: source.name,
    type: "weapon",
    img: source.img || spell.img || DEFAULT_SPELL_IMG,
    system: {
      ...foundry.utils.deepClone(source.system ?? {}),
      traits,
      description: `Natural attack of your ${effect.note || spell.name} form.`
    },
    flags: { [SYSTEM_ID]: { spellItem: true, ...(castId ? { castId } : {}) } }
  }]);
  if (!created) return null;

  const flags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [created.id] } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

  const data = {
    name: effectName(spell.name, effect.note, ` — ${source.name}`),
    img: created.img,
    origin: spell.uuid,
    changes: [],
    flags
  };
  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  await createEffectsOn(target, [data]);

  return {
    label: `${source.name} (${source.system?.damage ?? "?"} ${source.system?.damageType ?? ""}${traits ? `; ${traits}` : ""})`
  };
}

/**
 * Grant an innate spell — a breath weapon and its kin — for the duration.
 *
 * WHY A SPELL RATHER THAN A THIRD ATTACK SYSTEM. The Wyrm's breath weapon is
 * described as an activation that costs 2 AP, places an area, and lets each
 * creature caught make a basic Reflex save against a DC for elemental damage.
 * That is precisely what an innate spell already is — and since 3.306.0 innate
 * spells run the full resolution path (template, save, damage, DR, criticals)
 * rather than printing a number. Building a bespoke breath-weapon action would
 * have been a second implementation of casting, which is the exact mistake
 * `castInnateSpell` was.
 *
 * WHAT THE GRANTING EFFECT HAS TO SUPPLY. Two things the spell entry cannot
 * know for itself, both fixed at the moment the form is assumed:
 *
 *   - the DAMAGE, "1d8 per PP -2 of the spell (initial 10d8)" — scaled off the
 *     PP actually spent on this cast, warping included, which is why the
 *     formula is resolved here and not stored;
 *   - the SAVE DC, "equal to the DC of this spell" — the Shape spell's own,
 *     not the 10 + ability + level an innate spell would otherwise compute.
 *     Carried across as `fixedSaveDC` (see cast-workflow).
 *
 * Lifecycle is the natural attacks' — an owning effect carrying `grantedItems`
 * — so a breath weapon disappears with the form by every route, and nothing
 * new had to learn about expiry.
 */
async function applyGrantedSpellEffect(target, spell, effect, parsedDuration, castId = null, context = {}, registersCast = false) {
  const name = String(effect.name ?? "").trim();
  if (!name) return null;

  const pp = Math.max(0, Number(context.pp ?? 0));
  // "1d8 per PP -2 of the spell." A cast too small to reach one die grants no
  // breath weapon rather than a 0d8 one that rolls nothing and looks broken.
  const dice = Math.max(0, pp - 2);
  if (effect.diceFromPP && dice <= 0) {
    return { note: `${name} — this cast is too small to fuel it (needs more than 2 PP).` };
  }
  const formula = effect.diceFromPP ? `${dice}${effect.diceFromPP}` : String(effect.damage ?? "");
  const timing = spellExpiryTiming(parsedDuration);

  const [created] = await target.createEmbeddedDocuments("Item", [{
    name,
    type: "spell",
    img: effect.img || spell.img || DEFAULT_SPELL_IMG,
    system: {
      innate: true,
      prepared: true,
      category: effect.category || "save",
      defence: effect.defence || "Basic Reflex",
      area: effect.area || "",
      range: effect.range || "",
      targets: "",
      castAP: Number(effect.castAP ?? 2),
      ppCost: 0,
      usesPerDay: effect.usesPerDay || "",
      usesValue: 0,
      tradition: spell.system?.tradition ?? "",
      traits: effect.traits || "",
      damage: { formula, type: effect.damageType || "force", persistent: "" },
      areaTargeting: effect.areaTargeting || "all",
      // See the note above — the granting spell's DC, not a derived one.
      fixedSaveDC: Number(context.saveDC ?? 0) || 0,
      casterLevelMods: [],
      effects: [],
      warps: [],
      apOptions: [],
      components: {},
      description: `${effect.note ? `${effect.note}: ` : ""}${formula} ${effect.damageType || ""} in a ${effect.area || "shape"}. Granted by ${spell.name}.`
    },
    flags: { [SYSTEM_ID]: { spellItem: true, ...(castId ? { castId } : {}) } }
  }]);
  if (!created) return null;

  const flags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [created.id] } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

  const data = {
    name: effectName(spell.name, effect.note, ` — ${name}`),
    img: created.img,
    origin: spell.uuid,
    changes: [],
    flags
  };
  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  await createEffectsOn(target, [data]);

  return {
    label: `${name} — ${formula} ${effect.damageType || ""}, ${effect.area || ""}, ${effect.castAP ?? 2} AP` +
      (context.saveDC ? `, ${effect.defence || "Basic Reflex"} DC ${context.saveDC}` : "")
  };
}

/**
 * Grant a SENSE for the duration — Detect Life and Detect Undead.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A REAL ITEM, because that is where senses live. `senseOf` reads
 * `flags["trg-prime"].creatureAbility.derives.sense` off an ITEM, and
 * `actorSenses` walks the actor's items to build `details.senses`. So a
 * granted sense is an `ability` item carrying that flag, owned by an
 * effect that carries `grantedItems` — the same lifecycle the natural
 * attacks and breath weapons already use, and the reason this needed no
 * changes to senses.mjs at all.
 *
 * IT ALSO MEANS THE RANGE IS COMPUTED, NOT STORED. `senseRangeFeet`
 * derives a tertiary sense as 30 feet plus 5 per Wisdom, off the actor
 * holding it — so the same spell grants a longer sense to a wiser
 * caster, and a Wisdom change while it is running moves it, without this
 * function knowing any of those numbers.
 *
 * THE BLOCK COMES FROM `grantedSenseBlock`, never from the pack entry
 * directly. A category the compendium spelled wrong makes `senseOf`
 * return null — a spell that grants nothing, silently, for ever — so the
 * builder validates it and this refuses rather than applying an empty
 * sense.
 */
async function applySenseEffect(target, spell, effect, parsedDuration, castId = null, registersCast = false) {
  const block = grantedSenseBlock({
    category: effect.category,
    detects: effect.detects,
    rollWith: effect.rollWith
  });
  if (!block) return { note: `Unknown sense category "${effect.category}".` };

  const name = effectName(spell.name, effect.note);
  const [created] = await target.createEmbeddedDocuments("Item", [{
    name,
    type: "ability",
    img: spell.img || DEFAULT_SPELL_IMG,
    system: {
      description: `${block.note} Granted by ${spell.name}.`
    },
    flags: {
      [SYSTEM_ID]: {
        spellItem: true,
        creatureAbility: { derives: { sense: block } },
        ...(castId ? { castId } : {})
      }
    }
  }]);
  if (!created) return null;

  const timing = spellExpiryTiming(parsedDuration);
  const flags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [created.id] } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

  const data = {
    name,
    img: spell.img || DEFAULT_SPELL_IMG,
    origin: spell.uuid,
    changes: [],
    flags
  };
  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  await createEffectsOn(target, [data]);

  // THE RANGE IS READ BACK RATHER THAN RECOMPUTED for the card, so the
  // number the player is told is the one the sheet will show them.
  const shown = actorSenses(target.system, Array.from(target.items ?? []))
    .find((s) => s.name === name);
  return {
    label: shown ? senseLine(shown) : name,
    detail: block.note
  };
}

/**
 * Grant creature traits — what the form MAKES you — for the duration.
 *
 * The lightest of the three grants by a distance, and the only one that needs
 * no cleanup at all. A natural attack has to be a real Item and a breath weapon
 * has to be a real spell, so both need an owning effect and a delete hook when
 * it goes; a trait is a word in a derived list, so the owning effect alone is
 * the whole mechanism. When it expires the actor's next preparation rebuilds
 * `details.grantedTraits` without it and every rule that asks — aligned damage,
 * creature-type matching, the Mindless gate — stops seeing it in the same tick.
 *
 * NO `changes` ON THE EFFECT, deliberately. See prepareGrantedTraits in
 * documents/actor.mjs for why an ADD change onto `details.traits` is right for
 * a race and wrong for a spell.
 *
 * @returns {Promise<{label: string}|null>}
 */
async function applyTraitEffect(target, spell, effect, parsedDuration, castId = null, picked = [], registersCast = false) {
  const traits = grantedTraitsFor(effect, picked);
  if (!traits.length) return null;

  const timing = spellExpiryTiming(parsedDuration);
  const flags = { [SYSTEM_ID]: { spellBuff: true, grantedTraits: traits } };
  if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
  if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
  if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

  const data = {
    name: effectName(spell.name, effect.note, " — traits"),
    img: spell.img || DEFAULT_SPELL_IMG,
    origin: spell.uuid,
    changes: [],
    flags
  };
  if (timing.foundryDuration) {
    data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
  }
  await createEffectsOn(target, [data]);

  // The picked ones are named as picked on the card. They are GM-supplied
  // until the Appendix arrives, and a card that presents them identically to
  // the printed grant would hide which half of the line the book actually
  // said — see the stopgap note in form-traits.mjs.
  const fixed = grantedTraitsFor({ traits: effect.traits });
  const chosen = traits.filter((t) => !fixed.includes(t));
  return {
    label: fixed.join(", ") + (chosen.length ? ` (chosen: ${chosen.join(", ")})` : "")
  };
}

/**
 * Item ids whose deletion has been started but has not yet landed.
 *
 * Module-level rather than per-call: the whole point is that two SEPARATE
 * invocations of the cleanup hook must be able to see each other's in-flight
 * work. See the note in `registerGrantedItemCleanup`.
 */
const inFlightItemDeletes = new Set();

/**
 * Deletes the items an expiring effect granted.
 *
 * Registered once, at init. Hooked on `deleteActiveEffect` rather than called
 * from the sweepers, deliberately: that hook fires for EVERY route an effect
 * can leave an actor, so a GM who deletes "Shape Of The Beast — Claw" off the
 * Effects table gets the claw removed too, without that being a third place
 * that has to know about spell durations.
 */
export function registerGrantedItemCleanup() {
  Hooks.on("deleteActiveEffect", (effect, _options, userId) => {
    try {
      /*
       * A SIPHONED POOL GOES WHEN ITS MINUTE DOES (3.609.0, R8 — Vampiric
       * Touch: "You lose any remaining temporary HP after 1 minute"). Only
       * if the pool is still no larger than this spell's gift: a bigger one
       * from somewhere else since is not this spell's to take. Written once,
       * by the client that deleted the marker.
       */
      const siphoned = Number(effect?.getFlag?.(SYSTEM_ID, "tempHpGrant") ?? 0);
      if (siphoned > 0 && (!userId || userId === game.user?.id)) {
        const holder = effect.parent;
        const temp = Number(holder?.system?.resources?.hp?.temp ?? 0);
        if (holder?.update && temp > 0 && temp <= siphoned) {
          holder.update({ "system.resources.hp.temp": 0 }).catch(() => {});
        }
      }

      /*
       * A RAISED ITEM QUALITY GOES BACK DOWN (3.591.0).
       *
       * Masterwork Item RAISES a tier rather than setting one, so the
       * old tier travels on the grant: reading the item's quality back
       * at expiry would find the spell's own and leave it there for
       * good, which is the fault the conjured weapon's clock was added
       * to prevent.
       *
       * ON THE SAME HOOK as the granted items below, and for the reason
       * that comment gives: it fires for every route an effect can leave
       * an actor, so a GM clearing the row off the Effects table puts
       * the item back too.
       *
       * ONLY IF THE ITEM STILL WEARS WHAT THIS SPELL GAVE IT. A second
       * Masterwork on the same sword, or a GM who upgraded it by hand,
       * must not be undone by the first spell ending.
       */
      const quality = effect?.getFlag?.(SYSTEM_ID, "itemQuality");
      if (quality?.itemId) {
        const owner = effect.parent;
        const item = owner?.items?.get?.(quality.itemId) ?? null;
        if (item && String(item.system?.quality ?? "") === String(quality.to ?? "")) {
          item.update({ "system.quality": quality.from || "standard" }).catch(() => {});
        }
      }

      const granted = effect?.getFlag?.(SYSTEM_ID, "grantedItems");
      if (!Array.isArray(granted) || !granted.length) return;
      const actor = effect.parent;
      if (!actor?.deleteEmbeddedDocuments) return;

      // TWO GUARDS, AND THE SECOND ONE IS THE ONE THAT MATTERS.
      //
      // `items.get(id)` alone is a read-then-write race. A Hooks callback
      // cannot be awaited by Foundry, so the delete below is fire-and-forget;
      // if this hook runs again for the same effect before that delete lands
      // — and it does, because the hook fires locally AND on the socket
      // broadcast — the second run reads an item that is still present, and
      // both runs try to delete it. Foundry answers the loser with
      // `Item "…" does not exist!` as an unhandled rejection.
      //
      // Found live on 13 Aug 2026: a Wyrm form expiring on the combat clock
      // threw exactly that for its Claw, every time, while still removing
      // both weapons correctly. A cosmetic-looking error over a real race.
      //
      // `inFlightItemDeletes` closes it: an id is claimed before the delete
      // starts and released when it settles, so a second invocation skips
      // what is already going.
      const present = granted.filter(
        (id) => actor.items?.get?.(id) && !inFlightItemDeletes.has(id)
      );
      if (!present.length) return;
      for (const id of present) inFlightItemDeletes.add(id);
      void (async () => {
        try {
          await actor.deleteEmbeddedDocuments("Item", present);
        } catch (_e) {
          /* the item went by another route — nothing left to do */
        } finally {
          for (const id of present) inFlightItemDeletes.delete(id);
        }
      })();
    } catch (_e) {
      /* cleanup is best-effort: never let it break effect deletion */
    }
  });
}

/**
 * Mark effects as broken by an Escape against `dc` (3.609.0). See
 * magic/encase.mjs; the Escape action reads and clears the marks.
 */
async function stampEscapable(target, docs, dc, from) {
  const { ESCAPE_DC_FLAG, ESCAPE_LABEL_FLAG } = await import("./encase.mjs");
  for (const doc of docs) {
    if (!doc?.update || Number(doc.getFlag?.(SYSTEM_ID, ESCAPE_DC_FLAG)) > 0) continue;
    await doc.update({
      [`flags.${SYSTEM_ID}.${ESCAPE_DC_FLAG}`]: Math.trunc(Number(dc)),
      [`flags.${SYSTEM_ID}.${ESCAPE_LABEL_FLAG}`]: String(from ?? "")
    });
  }
}

/**
 * Apply a spell's structured effects. `targets` are the creatures the spell
 * affects (the caster's targets, the tokens under an area template, or the
 * creatures that failed a save); each effect's own `target` chooses self vs
 * those. Pushes description lines into `lines` and returns the dice rolled
 * (heals / temp HP) so the caller can attach them to the result card.
 *
 * @returns {Promise<{rolls: Roll[]}>}
 */
export async function applySpellEffects(caster, spell, { targets = [], areaCaught = [], saveResults = [], saveDC = null, attackResults = [], rollData = {}, warpMods = null, lines = [], effects: effectsOverride = null, extraDamage = 0, castId = null, pickedTraits = "", registersCast = false, durationOverride = null, lightTraitDefault = false } = {}) {
  // `effectsOverride` lets a variable-AP spell (see cast-workflow apOptions) run
  // the effect set for the chosen AP mode instead of the item's stored effects.
  const stated = Array.isArray(effectsOverride)
    ? effectsOverride
    : Array.isArray(spell.system?.effects)
      ? spell.system.effects
      : [];
  // THE LIGHT TRAIT'S OWN STEP (3.622.0; block 39's A17, Graham's R9): "Any
  // spell that has this trait increase the illumination level by one step
  // (max 8), unless its description states otherwise." A lasting Light spell
  // that states no light of its own — Fairy Fire, Radiant Aegis, Aura — gets
  // the step as a light-shift circle. See trait-rules.mjs.
  // THE CAST'S OWN CALL ONLY (`lightTraitDefault`): a sub-call for one row,
  // an entry check or a turn save must not draw the circle again.
  const lightDefault = lightTraitDefault ? lightTraitDefaultRow(spell.system ?? {}, spell.name) : null;
  const effects = lightDefault ? [...stated, lightDefault] : stated;
  const rolls = [];
  // Actors that received an ongoing (castId-flagged) effect — recorded so a
  // sustained spell can tear its own effects back down when it lapses.
  const affected = new Set();
  // A DIRECTED STRIKE IS RECORDED ONCE PER CAST, not once per recipient.
  // The ball belongs to the caster and remembers a target; running the
  // row for a second recipient would hand the caster a second ball
  // nobody paid four power points for.
  let directedStrikeRecorded = false;
  // A CHOICE "SELECTED WHEN CASTING" is asked once per cast, not once per
  // recipient (3.611.0) — Element Ward's damage type, Wits's ability score.
  // See the `defence` and `bonus` cases.
  const castChoices = new Map();
  if (!effects.length) return { rolls, affected: [] };

  // Warping can override the duration and add to healing/temp-HP dice and to a
  // buff's value (up to the option's cap).
  // OR THE LENGTH A GOVERNING LADDER'S RUNG SET (3.606.0) — Shroud's
  // Success is "the effect lasts for 1 round". See the governing block
  // just before the effect loop below.
  const spellDurationSource = durationOverride || warpedDurationText(spell.system?.duration, warpMods);

  // WHO THIS CAST IS AIMED AT, for a ward (3.406.0).
  //
  // Forbidding Ward targets "1 ally and 1 enemy" — two targets in ONE
  // list, playing different parts. The ally receives the bonus; the enemy
  // is what the bonus is scoped against. Nothing in the effect list can
  // tell them apart, so they are split here by DISPOSITION relative to
  // the caster, using the same `keepByDisposition` the area templates
  // already use rather than a second rule about who counts as an enemy.
  //
  // A SPELL WHOSE TARGET IS SIMPLY THE ENEMY still works: Anticipations
  // and Stone Shield benefit the CASTER and name one foe, so their ward
  // effect is `target: "self"` and the hostile list is just the target.
  const casterDisposition = Number(
    caster?.getActiveTokens?.()?.[0]?.document?.disposition
    ?? caster?.prototypeToken?.disposition ?? 0
  );
  // CLASSIFIED OVER EVERYONE THE CAST CONSIDERED, not only its `targets`
  // (3.552.6). On a save spell `targets` is the FAILURES, so an ally
  // standing in the cone was never classified at all — see the allies
  // branch below for why that mattered.
  const hostileUuids = [];
  for (const candidate of [...targets, ...areaCaught]) {
    const disposition = Number(
      candidate?.getActiveTokens?.()?.[0]?.document?.disposition
      ?? candidate?.prototypeToken?.disposition ?? 0
    );
    if (keepByDisposition(disposition, casterDisposition, "enemies") && candidate?.uuid) {
      hostileUuids.push(candidate.uuid);
    }
  }

  // EVERY ROLLED DEGREE MAPPED ONTO THE LADDER THIS SPELL ACTUALLY PRINTS,
  // once, before any effect is read. A blunder takes the fumble rung
  // rather than matching nothing — see magic/spell-degrees.mjs, which
  // explains why matching nothing made the worst roll in the game safer
  // than the second worst.
  //
  // EXCEPT ON A BASIC SAVE, WHERE THE ROWS ARE NOT A LADDER (3.493.0).
  // Surge Of The Tempest hangs its dazzle off "in the event of a fumble"
  // — an addition on one named degree — and remapping would dazzle on a
  // plain Failure, which the book never does. See `isBasicSave`.
  const basicSave = isBasicSave(spell?.system?.defence);
  const ladderResults = (Array.isArray(saveResults) ? saveResults : [])
    .map((result) => ({
      ...result,
      degree: effectiveSaveDegree(effects, result?.degree, { basicSave })
    }));
  // WHOSE AURA A CONDITIONAL BONUS IS MEASURED AGAINST (3.446.2).
  // Resolved from the CASTER, once, for the same reason the emanation
  // record resolves it at the cast: "an opposing aura type to YOUR OWN"
  // is a fact about who cast the spell.
  const casterOpposes = opposingTraitsOf(caster?.system ?? {});
  const warpDice = warpMods?.damageDice || "";
  const warpBonus = Number(warpMods?.bonusValue ?? 0);
  const warpBonusMax = warpMods?.bonusMax ?? null;

  // The Appendix picks, cut to what this cast affords. Resolved ONCE for the
  // whole effect set rather than per trait effect: a form grants one trait
  // entry, and resolving inside the loop would hand the same three picks to
  // each of two entries if a spell ever carried two.
  const picks = resolveTraitPicks(pickedTraits, traitPickCount(effects, warpMods));
  if (picks.surplus.length) {
    // Named, not dropped in silence. See resolveTraitPicks.
    lines.push(
      line(`<em>More traits were named than this cast affords — ignored: ${picks.surplus.join(", ")}.</em>`)
    );
  }

  /*
   * A LADDER THAT GOVERNS THE SPELL'S OTHER ROWS (3.606.0, block 32's R2).
   *
   * SHROUD: an unwilling target rolls Acrobatics, and the rung decides the
   * spell's whole effect on them — "Critical unaffected. Success the effect
   * lasts for 1 round. Failure the effect lasts its normal duration." A
   * willing target takes it as cast. So the ladder is resolved FIRST, the
   * targets are grouped by the length each one earned, and every row the
   * ladder governs is handed to this same applier once per group with that
   * length. One applier, called again, rather than a second copy of it.
   *
   * RESOLVED BEFORE THE LOOP, NOT IN IT, so a governed row placed ahead of
   * its ladder in the list is not applied to everybody before the ladder
   * has been asked. Notes are not governed: they speak for the cast.
   */
  const governing = effects.find((e) => e?.kind === "skillLadder" && e.governs === true
    && String(e.candidates ?? "") === "targets");
  let governed = false;
  if (governing) {
    const { normaliseSkillLadder, governedGroups } = await import("./skill-ladder.mjs");
    const spec = normaliseSkillLadder(governing);
    if (!spec) {
      lines.push(line(`<em>${spell.name} declares a malformed governing ladder.</em>`));
    } else {
      const { resolveSkillLadder } = await import("./skill-ladder-workflow.mjs");
      const ladderLines = [];
      const governingDC = Number(saveDC ?? rollData?.saveDC ?? 0) || 0;
      const result = await resolveSkillLadder(spell, spec, {
        dc: governingDC,
        lines: ladderLines,
        casterToken: caster?.getActiveTokens?.()[0]?.document ?? null,
        targets
      });
      for (const l of ladderLines) lines.push(line(l));
      const governedRows = effects.filter((e) => e !== governing && e?.kind !== "note"
        && e?.kind !== "skillLadder");
      for (const group of governedGroups(result.governed)) {
        const sub = await applySpellEffects(caster, spell, {
          targets: group.actors, areaCaught: [], saveResults: [], saveDC, rollData, warpMods, lines,
          effects: governedRows, extraDamage, castId, pickedTraits, registersCast,
          durationOverride: group.duration || null
        });
        rolls.push(...(sub?.rolls ?? []));
        for (const uuid of sub?.affected ?? []) affected.add(uuid);
      }
      governed = true;
    }
  }

  for (const effect of effects) {
    // A ROW A WARP UNLOCKS, OR THE CAST'S TOTAL PP DECIDES (3.611.0). See
    // magic/condition-warp.mjs — Animal Healing's added reliefs, Banish
    // Fatigue's permanent removal, Zealous Conviction's +3 at 14 PP.
    if (!rowAppliesToCast(effect, warpMods, rollData?.pp ?? null)) continue;
    // THE GOVERNED ROWS HAVE BEEN APPLIED ABOVE, per group; only the notes
    // and the ladder's own row remain for this loop, and the ladder has
    // already spoken.
    if (governed && (effect === governing || effect?.kind !== "note")) continue;
    // HOW LONG THIS ONE EFFECT LASTS. Read per effect rather than once
    // per cast, because a degree ladder can print three lengths for the
    // same spell — Luminous Flare's dazzle is 1 round on a success and
    // 1 minute on a failure. An effect that declares nothing gets the
    // spell's own duration, which is what every effect got before this.
    // See magic/effect-duration.mjs.
    const durationSource = effectDurationText(effect, spellDurationSource);
    const parsedDuration = parseSpellDuration(durationSource);
    const durationText = durationSource ? ` (${durationSource})` : "";

    // A NOTE IS A LINE FOR THE CARD, not a modifier — a display-only
    // rider (e.g. a conditional "+1 vs fear" that has no automatic
    // engine), surfaced for the GM and applied by hand. This compendium
    // carries a hundred and thirty; they once fell through to the
    // default below and printed `Unhandled effect kind "note"` on every
    // card that had one, which is what Polymorph Other and Gaseous Form
    // did until it was fixed.
    //
    // THIS `continue` IS THE ONLY ROUTE. A second `case "note":` lived
    // in the switch below until 3.435.1, unreachable behind this line
    // and carrying the comment above — dead code that made
    // `verify-effect-kinds-handled` answer "handled" after the live
    // route was deleted. Presence is not reachability, inside a check
    // as much as inside a rule.
    /*
     * A CHECK THE SPELL'S BYSTANDERS ROLL (3.605.0).
     *
     * ABOVE THE RECIPIENTS GATE, and the 3.605.0 live test is why.
     *
     * The first version put this in the per-recipient switch, beside the
     * things a spell does TO its targets. Shape Stone has no creature
     * targets at all — "Range touch; Targets cube of stone 10 feet across"
     * — so `recipients` was empty, `if (!recipients.length) continue` fired,
     * and the row was skipped on every cast. The spell reshaped the stone
     * and nobody was ever asked to keep their balance, which is precisely
     * the defect the release was written to fix.
     *
     * A LADDER FINDS ITS OWN SUBJECTS. The GM names who was standing on the
     * stone, so the row has nothing to do with whoever the caster targeted
     * and must not be gated on them. It sits here with `note` for the same
     * reason: both are rows that speak for the cast rather than to a target.
     *
     * NOTHING IN THE HARNESS COULD HAVE SEEN THIS. Every check measured the
     * ladder in isolation — the rungs, the clamp, the picker, the card —
     * and not one asked whether the applier ever reaches it. W8 does now.
     */
    if (effect.kind === "skillLadder") {
      const { normaliseSkillLadder } = await import("./skill-ladder.mjs");
      const spec = normaliseSkillLadder(effect);
      if (!spec) {
        lines.push(line(`<em>${spell.name} declares a malformed skill ladder.</em>`));
        continue;
      }
      const { resolveSkillLadder } = await import("./skill-ladder-workflow.mjs");
      const ladderLines = [];
      await resolveSkillLadder(spell, spec, {
        dc: Number(saveDC ?? rollData?.saveDC ?? 0) || 0,
        lines: ladderLines,
        casterToken: caster?.getActiveTokens?.()[0]?.document ?? null
      });
      for (const l of ladderLines) lines.push(line(l));
      continue;
    }

    if (effect.kind === "note") {
      /*
       * A NOTE MAY NOW BELONG TO ONE RUNG (3.493.0).
       *
       * Notes have always printed unconditionally, which is right for the
       * hundred-odd that describe the whole spell — and it is why
       * Enchanting Utterance's Failure outcome had to be written as prose
       * INSIDE a note, "Failure or fumble: the target cannot take hostile
       * actions", rather than as the rung it is.
       *
       * That mattered once the failure side started reading downward: the
       * spell declared `success` and `fumble` and nothing between, so a
       * plain Failure fell to the Fumble rung and picked up `stunned 1` —
       * a condition the book gives only on a Fumble. A rung whose whole
       * content is adjudicated cannot be left undeclared, or the ladder
       * has a hole and the fallback fills it from the wrong neighbour.
       *
       * BACKWARD-COMPATIBLE BY CONSTRUCTION: a note with no `onSave` is
       * ungated and prints exactly as before. No note in the pack declared
       * one before this release, so nothing existing changes.
       */
      if (isDegreeGated(effect)) {
        const rungHit = ladderResults.some((r) => effectAppliesOnDegree(effect, r?.degree));
        if (!rungHit) continue;
      }
      lines.push(line(`<em>${effect.text ?? ""}</em>`));
      continue;
    }
    // DEGREE-GATED EFFECTS PICK THEIR OWN RECIPIENTS. An effect that
    // declares `onSave` applies to the targets whose SAVE DEGREE it
    // names, drawn from the full result set rather than from `targets`
    // — because `targets` for a save spell is the failures, and the
    // whole point is that a target who SUCCEEDED can still be affected.
    // Fear's success is "frightened 1"; before this it took nothing.
    //
    // AN UNGATED EFFECT IS UNTOUCHED and still applies to `targets`
    // exactly as it always did, which is why the hundred-odd spells
    // relying on that behaviour do not change.
    // "allies" IS THE OTHER HALF OF A TWO-ROLE TARGET LIST (3.406.0).
    // Forbidding Ward names "1 ally and 1 enemy" and both arrive in one
    // `targets` array; the bonus belongs to the ally alone. Without this
    // the enemy would be warded against itself, which is both wrong and
    // very funny. Split by the same disposition test that built
    // `hostileUuids`, so the two halves cannot disagree about who is a foe.
    /*
     * A LADDER'S RECIPIENTS ARE EVERYONE WHO ROLLED (3.486.0).
     *
     * ─────────────────────────────────────────────────────────────────
     * FOUND LIVE, 4 September 2026, and it is the paragraph above
     * happening one layer further down.
     *
     * A `flatLadder` row carries no `onSave`, so it is not degree-gated,
     * so it fell to the ungated branch and took `targets` — which for a
     * save spell is the FAILURES. When nobody failed, `recipients` was
     * empty, the `continue` below skipped the switch entirely, and the
     * card printed "Serenity finds nobody to affect".
     *
     * That is wrong in a way peculiar to a ladder: a ladder names an
     * outcome for EVERY degree, success included. Word Of Death's
     * Success is fifty damage. Serenity's is five Mental. Both fired
     * only when some OTHER creature in the area failed — which is when
     * `targets` was non-empty and the switch ran, and then applied
     * everybody's rung at once. A creature's outcome depended on a
     * different creature's roll.
     *
     * `recipientsForEffect` already says this in its own header: "the
     * whole point is that a target who SUCCEEDED can still be affected
     * — handing this only the failures would reproduce the bug it exists
     * to fix, one layer down." It was right, and this is that layer.
     *
     * DERIVED FROM THE KIND, NOT FROM DATA. Giving the pack row an
     * `onSave` listing all seven degrees would also have worked and
     * would have been silently undone by the first ladder authored
     * without it. A ladder is degree-gated by construction.
     */
    // A `self` ROW ASKS ITS OWN RULE NOW (3.534.0). It used to be
    // `[caster]` outright, which was right while a spell with no range and
    // no area WAS the caster — and became wrong the moment a warp could
    // give that spell reach. See selfRowRecipients in spell-degrees.mjs
    // for why this is two mods rather than one.
    //
    // AND A GATED `self` ROW ANSWERS TO THE TARGETS' ROLLS (3.606.0).
    // Speak With Dead's Critical is the CORPSE's save, and what it does is
    // haunt the CASTER. So a self row carrying `onSave` reaches the caster
    // when any target rolled one of its degrees, and nobody otherwise.
    // MEASURED BEFORE IT WAS WRITTEN: no self row in any pack carried
    // `onSave`, so this changes no row that existed.
    let recipients = effect.target === "self"
      ? (isDegreeGated(effect)
        ? (ladderResults.some((r) => effectAppliesOnDegree(effect, r?.degree))
          ? [caster].filter(Boolean)
          : [])
        : selfRowRecipients(caster, targets, warpMods))
      // AN ALLIES ROW DRAWS FROM THE AREA, NOT FROM THE SAVE (3.552.6).
      //
      // FOUND LIVE, 15 September 2026, casting Wash Away Sin: the damage
      // landed correctly on the one opposed creature and the card then
      // said "Wash Away Sin finds nobody to affect" — the heal reached
      // no one, and the ally standing in the cone was untouched.
      //
      // The reason is that on a SAVE spell `targets` is the list of
      // creatures who FAILED, and an ally in the cone never rolled: the
      // spell heals them, it does not attack them. Filtering the failures
      // for non-hostiles is therefore filtering the wrong list, and for a
      // spell that heals allies and hurts enemies it can only ever return
      // nothing.
      //
      // 3.531.1 recorded this as "the healing half could not be observed
      // at all… that predates this release", and it was right: the
      // recipient selection is what was wrong, and this is it.
      //
      // Falls back to `targets` when there is no area, so every targeted
      // allies row — Forbidding Ward's, which is what this branch was
      // written for — behaves exactly as it did.
      : effect.target === "allies"
        ? (areaCaught.length ? areaCaught : targets)
          .filter((t) => t?.uuid && !hostileUuids.includes(t.uuid))
        /*
         * AND ITS MIRROR (3.594.0, R6 — Prayer). "You and each ally gain
         * a +1-luck bonus… All foes within the radius suffer the same
         * modifiers as a penalty." Two sets of rows, opposite signs, ONE
         * area and ONE cast.
         *
         * Until now a spell could bless the allies in its area or curse
         * the enemies in it, but not both: `allies` drew from the area
         * and every other row drew from the save. So Prayer's foe half
         * had nowhere to be authored and lived in a note admitting it
         * was applied by hand.
         *
         * Written as the exact mirror of the branch above — same source
         * list, same `hostileUuids`, opposite test — so the two halves of
         * one area cannot disagree about who is a foe.
         */
        : effect.target === "enemies"
          ? (areaCaught.length ? areaCaught : targets)
            .filter((t) => t?.uuid && hostileUuids.includes(t.uuid))
        : LADDER_KINDS.includes(effect.kind)
          ? ladderResults.map((r) => r?.target).filter(Boolean)
          /*
           * A SECOND SAVE OWED BY WHOEVER TOOK A CRITICAL (3.609.0, R5).
           * Umbral Blast: "A target that takes a critical injury must also
           * make a Fortitude Save." The save path marks each result it
           * landed an injury on; nothing else knows. See
           * magic/follow-up-save.mjs.
           */
          : effect.kind === "followUpSave" && effect.trigger === "critical"
            ? ladderResults.filter((r) => r?.critical).map((r) => r?.target).filter(Boolean)
            : recipientsForEffect(effect, ladderResults, targets);

    // AN ATTACK SPELL'S ROW MAY BELONG TO ONE OUTCOME (3.613.0, R13) —
    // Sickly Ray's sickened 1 on a hit, sickened 2 and slowed 1 on a
    // critical. See magic/attack-degree-rows.mjs.
    recipients = attackRowRecipients(effect, recipients, attackResults);

    // ANIMAL SOUL (Chapter 5): a Druid or Ranger whose companion the spell
    // could not touch may step out of it with them. Asked per recipient,
    // and only where the spell carries a kind gate at all — which is nearly
    // never, so the ordinary cast pays one comparison and no interruption.
    // See magic/animal-soul.mjs.
    if (spell?.system?.kindGate && recipients.length) {
      const { animalSoulRefuses } = await import("./animal-soul.mjs");
      const staying = [];
      for (const recipient of recipients) {
        if (await animalSoulRefuses(recipient, spell.system, spell?.name)) {
          lines.push(line(`<em>${recipient.name} steps out of it — <strong>Animal Soul</strong>.</em>`));
          continue;
        }
        staying.push(recipient);
      }
      recipients = staying;
    }
    // THE BLIND AND THE DEAF (3.621.0; Appendix 2, block 39's R7). Blinded:
    // "you are immune to visual effects"; Deafened: "you are immune to
    // auditory effects". A Visual or Auditory spell's rows pass them by,
    // said once per creature per cast.
    if (recipients.length && effect.target !== "self") {
      const { senseImmunityBy, conditionLabel } = await import("../conditions/condition-rules.mjs");
      const traits = `${spell?.system?.traits ?? ""}, ${pickedTraits ?? ""}`;
      const kept = [];
      for (const recipient of recipients) {
        const by = senseImmunityBy(recipient?.conditions?.effective, traits);
        if (!by) {
          kept.push(recipient);
          continue;
        }
        const key = `senseImmune:${recipient.uuid}`;
        if (!castChoices.has(key)) {
          castChoices.set(key, true);
          lines.push(line(`<em>${recipient.name} is ${conditionLabel(by)} — immune to `
            + `${by === "blinded" ? "visual" : "auditory"} effects; ${spell?.name ?? "the spell"} passes it by.</em>`));
        }
      }
      recipients = kept;
    }
    /*
     * A CONJURATION WITH NOBODY NAMED PUTS THE OBJECT IN THE CASTER'S OWN
     * HANDS (3.594.3, Graham's ruling of 26 September 2026).
     *
     * Measured on the 3.594.1 drive: Power Crystal cast with no target
     * printed "finds nobody to affect", spent its PP, and made nothing.
     * See `conjuredItemRecipients` for why the fallback asks nothing about
     * range and everything about whether the row is gated.
     */
    let conjureFellBack = false;
    if (effect.kind === "conjureItem") {
      const held = conjuredItemRecipients(recipients, caster, { gated: isDegreeGated(effect) });
      conjureFellBack = held.length > 0 && recipients.length === 0;
      recipients = held;
    }
    if (!recipients.length) {
      // A DEGREE-GATED EFFECT MATCHING NOBODY IS THE NORMAL CASE, not a
      // problem worth a line. Fear carries five entries and at most two
      // apply to any one target, so before this the card printed FOUR
      // copies of "condition effect — no target to apply to" on every
      // correct cast — which reads as four errors to anyone who does not
      // know the spell's shape.
      //
      // AN UNGATED EFFECT WITH NO TARGETS STILL SAYS SO. That was the
      // original diagnostic and it still means what it meant: a spell
      // tried to do something to somebody and there was nobody there.
      // AND NOT ONE THAT SPEAKS FOR ITSELF (3.484.0). A missed Orb Of
      // Acid printed "finds nobody to affect" beneath its own "Miss vs
      // …" line: the splash row has no recipients once the attack
      // misses, and the card had already said why.
      // NOR ONE GATED ON THE ATTACK'S OUTCOME (3.614.0, F1 of the 3.613.0
      // drive): Sickly Ray's hit row reaches nobody on a critical, and the
      // card said "finds nobody to affect" over the sickened 2 it applied.
      if (!isDegreeGated(effect) && !isAttackGated(effect) && !reportsItsOwnAbsence(effect)) {
        // IN THE SPELL'S OWN WORDS (3.481.0). This printed `effect.kind`
        // — an internal camelCase identifier — straight onto a
        // player-facing card: "missileStorm effect — no target to apply
        // to", and "hazard effect …" on an ordinary successful Spike
        // Stones. Pre-existing and general, found while driving the
        // refund card. The diagnostic is kept; only its wording changes.
        lines.push(line(effectNoTargetLine(effect, spell?.name)));
      }
      continue;
    }
    // TRADE ESSENCE MOVES BETWEEN TWO RECIPIENTS, so it is one act for the
    // pair rather than one per creature (3.609.0, R8).
    if (effect.kind === "essenceTrade") {
      const { applyEssenceTrade } = await import("./essence-trade-workflow.mjs");
      for (const said of await applyEssenceTrade(caster, spell, effect, recipients, warpBonus)) lines.push(line(said));
      continue;
    }
    // Auto-hit damage distributes N missiles across ALL recipients at once (not
    // one full effect per recipient), so it's handled before the per-target loop.
    if (effect.kind === "damage") {
      await applyDamageEffect(recipients, effect, { rollData, rolls, warpDice, lines, elementalType: warpMods?.elementalType ?? null, extraDamage });
      continue;
    }
    for (const target of recipients) {
      switch (effect.kind) {
        case "heal": {
          /*
           * OR STOPS THE BLEEDING (3.516.0). Cure, Self Healing and Voice
           * Of Healing all print "heals N HP OR stops a point of ongoing
           * bleed", and all three carried it as prose in a `note` row.
           *
           * GRAHAM'S RULING, 7 September 2026: "each target gets
           * whichever applies" — so this is asked per creature and there
           * is no prompt. The 3 AP radius version reaching a mixed group
           * is the ordinary case, and it now does the right thing for
           * each of them in one casting.
           *
           * A HEAL WITH NO ALTERNATIVE FALLS STRAIGHT THROUGH: `spec` is
           * null for every other healing spell in the pack, and
           * `bleedReliefFor` answers `{heal: true, bleed: 0}`.
           */
          const bleedSpec = normaliseBleedAlternative(effect);
          const wasBleeding = Math.max(0, Number(target.getConditionValue?.(BLEEDING) ?? 0));
          const relief = bleedReliefFor(bleedSpec, warpMods, wasBleeding > 0);

          if (relief.bleed > 0) {
            const left = Math.max(0, wasBleeding - relief.bleed);
            if (left > 0) await target.toggleStatusEffect?.(BLEEDING, { value: left });
            else await target.toggleStatusEffect?.(BLEEDING, { active: false });
            lines.push(line(bleedStoppedLine(target.name, wasBleeding, left)));
            if (castId && target.uuid) affected.add(target.uuid);
          } else if (bleedSpec && !wasBleeding) {
            lines.push(line(healedInsteadLine(bleedSpec, target.name)));
          }
          if (!relief.heal) break;

          // THE ROW'S OWN EXTRA FIRST (3.522.0). Cure's "+2 PP: … and the
          // extra healing for the 2-action version increases by 8" — the
          // die half has been live since the bleed channel and the eight
          // reached nothing. A row printing a bare "1d8" is untouched.
          // THE HEALING SIDE ASKS ITS OWN RULE NOW (3.531.0). It used to
          // build the formula here from `rowExtra` and `damageDice`, which
          // is right for Cure — where the healing IS the spell's one
          // number — and wrong for Wash Away Sin, which heals d8 and burns
          // d6 from a single warp reading "increase both by 1 die".
          // `warpedHealFormula` keeps the old fallback exactly, so Cure is
          // unchanged, and adds `healDice`/`healBonus` for the spells the
          // old shape could not express.
          // THE CASTER'S OWN HEALING RIDERS (3.625.0) — see magic/healing-riders.mjs.
          // Read before the roll, because one of them changes the formula.
          const healingRiders = declaredHealingRiders(Array.from(caster?.appliedEffects ?? caster?.effects ?? []));
          // "ONCE PER ROUND" HAS NO ROUND OUTSIDE COMBAT (3.625.1, found
          // live on 0.7.0). The marker resets with the combat round; between
          // fights — where most healing is cast — nothing resets it, and
          // Vital Surge fired once a day. Out of combat every cast is its
          // own round: the marker is neither read nor written.
          const ridersClocked = Boolean(game.combat?.started && caster?.inCombat);
          const ridersUsed = ridersClocked ? (caster?.getFlag?.(SYSTEM_ID, HEALING_RIDERS_USED_FLAG) ?? {}) : {};
          const riderPlan = applyHealingRiders(healingRiders, {
            formula: warpedHealFormula(effect.formula, warpMods),
            casterLevel: Math.max(0, Math.floor(Number(caster?.system?.identity?.level ?? 0) || 0)),
            targetHp: Number(target.system?.resources?.hp?.value ?? 0),
            targetMax: Number(target.system?.resources?.hp?.max ?? 0),
            targetDying: Boolean(target.hasCondition?.("dying")),
            self: target === caster || (target?.uuid && target.uuid === caster?.uuid),
            used: ridersUsed
          });
          // AN ITEM'S OFFER ON THE DICE (3.626.0): Hands of Mercy's Steady Gift.
          const itemMax = await offerItemMaximise(caster, { formula: riderPlan.formula, castId });
          for (const text of itemMax.lines) lines.push(line(`<em>${text}.</em>`));
          const formula = itemMax.formula;
          const amount = (await rollAmount(formula, rollData, rolls)) + riderPlan.extra;
          if (ridersClocked && riderPlan.burn.length && caster?.setFlag) {
            await caster.setFlag(SYSTEM_ID, HEALING_RIDERS_USED_FLAG, healingRidersBurnUpdate(riderPlan.burn, ridersUsed));
          }
          for (const text of riderPlan.lines) lines.push(line(`<em>${text}.</em>`));
          // Mystical Conduit (Chapter 5): the RECIPIENT "regains an
          // additional amount of Hit Points equal to half your caster
          // level" when magically healed — once per casting, which one
          // heal entry per cast already guarantees. Half of the target's
          // OWN caster level (a non-caster gains nothing).
          //
          // "A NON-CASTER GAINS NOTHING" ONLY BECAME TRUE AT 3.385.0.
          // `casterLevelValue` used to fall back to CHARACTER level, so
          // this line handed a 10th-level Fighter with the feat +5 HP on
          // every heal — the parenthesis above was describing an
          // intention the derivation did not implement. Nothing here
          // changed; the number underneath it did.
          const conduit = Array.from(target.items ?? []).some(
            (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "mystical conduit"
          )
            ? Math.floor(Math.max(0, Number(target.system?.magic?.casterLevelValue ?? 0)) / 2)
            : 0;
          const wasDying = Boolean(target.hasCondition?.("dying"));
          const healed = await healActor(target, amount + conduit, { noDyingFatigue: effect.noDyingFatigue === true, dyingHalf: riderPlan.dyingHalf });
          /*
           * HEALING THAT WOULD BE LOST (3.630.0) — announced for a module to
           * answer: Pillars of Faith's Grace beyond Need, a reaction "when a
           * spell or use of Channels that you cast restores HP to a willing
           * living creature, but some of that healing would be lost because
           * the creature has reached its maximum HP". Not for a Dying
           * creature, whose heal buys back Dying rather than hit points.
           */
          {
            const excess = Math.max(0, (amount + conduit) - healed);
            if (excess > 0 && !wasDying) globalThis.Hooks?.callAll?.("trgPrimeOverheal", { caster, target, excess, healed, spell });
          }
          lines.push(
            line(`${target.name}: healed <strong>${healed}</strong> HP${formula ? ` (${formula})` : ""}${conduit ? ` — includes +${conduit} from Mystical Conduit` : ""}.`)
          );
          // A ROD'S EXTRA DIE, AND THE HEALED CREATURE'S OWN RUNE (3.626.0).
          for (const text of await offerRodExtraHeal(caster, target, { castId, healed, healActor })) lines.push(line(text));
          for (const text of await offerOnHealedRelief(target, { spellName: spell.name, spellTraits: spell.system?.traits ?? "", ppRequired: Number(spell.system?.ppCost ?? 0), healed })) lines.push(line(text));
          break;
        }
        case "tempHP": {
          // AND A FLAT WARP (3.611.0) — "increase temporary HP by 1".
          const flatTemp = Math.max(0, Math.trunc(Number(warpMods?.tempHPBonus) || 0));
          const formula = flatTemp
            ? `${addDice(effect.formula, warpDice)} + ${flatTemp}`
            : addDice(effect.formula, warpDice);
          const amount = await rollAmount(formula, rollData, rolls);
          const pool = await grantTempHP(target, amount);
          lines.push(line(`${target.name}: <strong>${amount}</strong> temporary HP (pool now ${pool})${durationText}.`));
          break;
        }
        // A MARKER CHANGES NO NUMBER. It leaves a named flag that a rule
        // in another subsystem reads and spends — Stabilise's clamp on
        // the Dying Check is the first and, at 3.395.0, the only one.
        // See magic/markers.mjs for why this is not a condition, not a
        // bonus, and above all not a note.
        case "heldBonus": {
          // A BONUS THAT WAITS. See magic/held-bonus.mjs — Guidance was
          // the first, and four PP 1 spells share its shape exactly.
          const authored = normaliseHeldBonus(effect);
          if (!authored) {
            lines.push(line(`<em>${spell.name} declares a malformed held bonus.</em>`));
            break;
          }
          // AND WARPED (3.611.0) — Inspiration's wider checks, bigger die
          // and second die. See `warpedHeldBonus`.
          const spec = warpedHeldBonus(authored, warpMods);
          const timing = spellExpiryTiming(parsedDuration);
          const heldFlags = { [SYSTEM_ID]: { [HELD_BONUS_FLAG]: spec } };
          if (castId) heldFlags[SYSTEM_ID].castId = castId;
          if (timing.spellEffect) heldFlags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) heldFlags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) heldFlags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          const heldData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: heldFlags
          };
          if (timing.foundryDuration) {
            heldData.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          // RELAYED, NOT WRITTEN DIRECTLY (3.474.0). A player casting on another
          // player's character owns neither the actor nor its effects, and
          // Foundry refuses. `createEffectsOn` asks the GM when the target is
          // not ours — which eight other effect kinds in this file already did.
          await createEffectsOn(target, [heldData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(
            `${target.name} holds <strong>${spec.label}</strong> — `
            + `${heldBonusCastLine(spec)}, spent from its card${durationText}.`));
          break;
        }
        case "prison": {
          // A CAGE, AND A BUTTON TO GET OUT OF IT. See magic/prison.mjs
          // and Graham's rulings of 2 September 2026: the attempt is a
          // button rather than a per-turn prompt, the prisoner is
          // marked, and Flame Prison's per-minute die and its bars are
          // printed rather than rolled.
          const spec = normalisePrison(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed prison.</em>`));
            break;
          }
          const saveDC = Number(rollData?.saveDC ?? 0) || 0;
          for (const prisoner of recipients) {
            // THE CAGE IS RECORDED ON THE PRISONER, carrying the ladder
            // and the DC as they were AT CAST TIME. A caster who later
            // dies, or a pack entry edited mid-campaign, must not change
            // the cage somebody is already sitting in — the same reason
            // the emanation records its own save DC.
            await prisoner.setFlag(SYSTEM_ID, PRISON_FLAG, {
              spec, saveDC, castId, casterUuid: caster.uuid, spellName: spell.name
            });
            lines.push(line(`<strong>${prisoner.name}</strong> is caged. `
              + `Escape is a ${spec.save} save, DC ${saveDC || "—"} — ${prisonLadderLine(spec)}.`));
            lines.push(line(`<button type="button" data-action="attemptPrisonEscape" `
              + `data-prisoner-uuid="${prisoner.uuid}">Attempt to escape</button>`));
            for (const note of spec.notes) lines.push(line(`<em>${note}</em>`));
          }
          break;
        }
        case "vitalBeacon": {
          // ARMED HERE, USED FROM THE CARD. The casting takes a minute
          // and happens once; every heal afterwards is somebody touching
          // the caster, so the button lives on the card and the pool
          // lives on the caster. See magic/vital-beacon.mjs.
          // ONE DIE PER PURCHASE (3.609.0). The +2 PP option carried `mods: {}`
          // until block 33's R4, so this only ever saw "warped or not"; with a
          // real `damageDice` each purchase is one more die, as with every
          // other warp that prints no ceiling.
          const dice = BEACON_BASE_DICE + Math.max(0, Number((/^(\d+)d/.exec(String(warpDice ?? "")) ?? [])[1] ?? 0));
          // A SECOND CAST REPLACES THE FIRST — "only one vital beacon
          // active at a time" — so this overwrites rather than adding.
          // THE DECLARED LADDER TRAVELS WITH THE BEACON (3.471.0). The
          // first version stored no `steps`, so the pack row's ladder was
          // never read and `normaliseBeacon` fell back to its default —
          // identical by coincidence, and decorative in the entry. Data
          // that is present and unreached is the defect this project
          // keeps paying for.
          await caster.setFlag(SYSTEM_ID, BEACON_FLAG, {
            dice,
            used: 0,
            lastRound: null,
            steps: Array.isArray(effect.steps) ? effect.steps : null,
            // THE +4 PP OPTION (3.609.0, R4): carried as `mods: {}` and so
            // never reached the beacon, which already knew how to stop a bleed.
            stopsBleeding: Boolean(effect.stopsBleeding || warpMods?.stopsBleeding)
          });
          lines.push(line(`<strong>Vital Beacon</strong> — `
            + `${dice}d12, weakening a step with each use, until ${dice}d4 is spent.`));
          // THE BUTTON CARRIES THE CASTER'S OWN UUID, not a message flag.
          // The applier never sees the ChatMessage — it returns lines that
          // the cast workflow later assembles — so the handle rides on the
          // element, which is also what makes the button work from any
          // copy of the card.
          lines.push(line("<em>Target an ally (or nobody, for yourself), then touch the "
            + "beacon — once per round.</em>"));
          lines.push(line(`<button type="button" data-action="touchVitalBeacon" `
            + `data-caster-uuid="${caster.uuid}">Touch the beacon</button>`));
          break;
        }
        case "lifeSiphon": {
          // A REACTION PAID FOR BY THE SPELL YOU JUST CAST. See
          // magic/life-siphon.mjs — the same shape as War Cry, reading a
          // record of something already done rather than the board.
          const spec = normaliseLifeSiphon(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed siphon.</em>`));
            break;
          }
          const record = caster.getFlag?.(SYSTEM_ID, LAST_CAST_FLAG) ?? null;
          const verdict = lifeSiphonQualifies(spec, record, game.combat?.round ?? null);
          if (!verdict.ok) {
            lines.push(line(lifeSiphonRefusal(verdict.why)));
            break;
          }
          // THE WARPING OPTION ADDS A WHOLE SET, not a flat die: "+4 PP:
          // increase the amount you heal by 1d6 per 2 PP".
          const formula = lifeSiphonFormula(spec, verdict.pp, warpDice ? 1 : 0);
          if (!formula) {
            lines.push(line(lifeSiphonRefusal("that spell was too small to draw a die from")));
            break;
          }
          const roll = await new Roll(formula).evaluate();
          const hp = caster.system?.resources?.hp ?? {};
          const before = Number(hp.value) || 0;
          const max = Number(hp.max) || 0;
          const healed = Math.min(Math.max(0, roll.total), Math.max(0, max - before));
          if (healed > 0) {
            await caster.update({ "system.resources.hp.value": before + healed });
          }
          lines.push(line(lifeSiphonLine(
            caster.name, healed, formula, roll.total, verdict.pp)));
          break;
        }
        case "deathResonance": {
          /*
           * A DEATH NEARBY, TURNED INTO HIT POINTS (3.487.0).
           *
           * Reaper's Resonance. See magic/death-resonance.mjs for why
           * this is NOT a hook on `reapDead`: the spell is
           * `castAP: "Reaction"`, so the player casting it IS the
           * trigger — Graham's ruling of 28 August 2026 for the whole
           * class of reaction spell.
           *
           * The caster is asked WHICH death, because several creatures
           * can fall in a round and the spell names one. That is the
           * same question `promptIncomingSaveDC` asks for Counter
           * Perform: a fact the player holds and the engine does not.
           */
          const { promptResonanceSource, applyDeathResonance } =
            await import("./death-resonance-workflow.mjs");
          const source = await promptResonanceSource(caster, spell.name);
          if (!source) {
            lines.push(line(`<em>No death was named for ${spell.name} — nothing drawn.</em>`));
            break;
          }
          // THE WARP IS A CAPABILITY, NOT A NUMBER. "+2 PP: for every 5
          // HP healed you may also reduce any bleeding damage by 1" buys
          // the clause; how much it clears is computed from the heal.
          // A DECLARED MOD, NOT THE WARP'S TEXT (3.499.1). This read
          // `warpMods.applied.some(w => /bleed/i.test(w.text))` and
          // `applied` is not a key on what arrives here — the aggregate
          // returns {ppSpent, rawPP, mods, notes} and only `mods` is
          // passed — so the test was permanently false and this warp had
          // bought nothing since the day it was written. Found on
          // 5 September 2026 while a copy of the same shape failed live
          // on Sacrificing Shield.
          const bleedWarp = Boolean(warpMods?.reduceBleed);
          for (const l of await applyDeathResonance(caster, source, bleedWarp)) {
            lines.push(line(l));
          }
          break;
        }
        case "conjuredWeapon": {
          /*
           * A WEAPON MADE OF NOTHING (3.543.0).
           *
           * Eldritch Weapon shipped with `effects: []` — not a missing
           * warp but a missing SPELL. Six PP produced nothing, and all
           * three of its warping options were inert because there was no
           * weapon for any of them to modify.
           *
           * NOT `conjureItem`, which names one entry and copies it. This
           * spell names a CLASS and the caster picks; see
           * magic/conjured-weapon.mjs for the filter and for why the
           * damage type is a replacement rather than an addition.
           */
          const weaponSpec = normaliseConjuredWeapon(effect);
          if (!weaponSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed conjured weapon.</em>`));
            break;
          }
          const { conjurableWeapons, promptConjuredWeapon, conjureWeaponOnto } =
            await import("./conjured-weapon-workflow.mjs");
          const options = await conjurableWeapons(weaponSpec, warpMods);
          if (!options.length) {
            lines.push(line(`<em>${spell.name} found no weapon it could shape.</em>`));
            break;
          }
          const chosen = await promptConjuredWeapon(spell.name, options);
          if (!chosen) {
            lines.push(line(`<em>${spell.name} was not given a shape.</em>`));
            break;
          }
          const madeWeapon = await conjureWeaponOnto(target, weaponSpec, chosen, castId);
          if (!madeWeapon) {
            lines.push(line(`<em>${spell.name} could not create ${chosen.name}.</em>`));
            break;
          }
          /*
           * THE CLOCK THE WEAPON DOES NOT CARRY (3.543.1).
           *
           * MAGIC STONE'S SHAPE, and it should have been from the start —
           * an item stamped `endsWithSpell` plus a companion effect that
           * holds the duration. The weapon has no clock of its own; the
           * world-time sweep expiring THIS effect is what removes it.
           *
           * SHIPPED WITHOUT IT AT 3.543.0. Measured live the same day: a
           * Morning Star conjured for "1 minute" was still on the sheet
           * afterwards, carrying a castId that matched no registry entry —
           * a spell of this duration never registers, so nothing was ever
           * going to come looking. Six PP for a permanent force weapon,
           * and the release notes called the spell fixed.
           *
           * The comment on magicStone, one screen above where I wrote
           * this case, spells the failure out in advance: "without it
           * Magic Stone would hand out permanent +1 ammunition."
           */
          const cwTiming = spellExpiryTiming(parsedDuration);
          const cwFlags = { [SYSTEM_ID]: { spellBuff: true } };
          if (castId) cwFlags[SYSTEM_ID].castId = castId;
          if (cwTiming.spellEffect) cwFlags[SYSTEM_ID].spellEffect = true;
          if (cwTiming.spellEffectEnd != null) cwFlags[SYSTEM_ID].spellEffectEnd = cwTiming.spellEffectEnd;
          if (cwTiming.expiresRound != null) cwFlags[SYSTEM_ID].conditionExpiresRound = cwTiming.expiresRound;
          const cwData = {
            name: effect.label || "Conjured Weapon",
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: cwFlags
          };
          if (cwTiming.foundryDuration) {
            cwData.duration = { ...cwTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [cwData]);

          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: <strong>${madeWeapon.name}</strong> of pure force `
            + `— ${weaponSpec.damageType} damage${durationText}.`));
          break;
        }
        case "conjureItem": {
          /*
           * A SPELL THAT MAKES A REAL ITEM (3.487.0).
           *
           * Bless Water. It COPIES the pack's Holy Water rather than
           * describing one — see magic/conjured-item.mjs for why a
           * hand-built imitation would have been a second Holy Water
           * missing the Splash trait the 3.482.0 mechanism reads.
           */
          const spec = normaliseConjuredItem(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed conjured item.</em>`));
            break;
          }
          /*
           * A CONJURED ITEM MAY NOW HAVE A CLOCK (3.590.0).
           *
           * MAGIC STONE'S SHAPE, one screen below: the item is stamped
           * `endsWithSpell` and a COMPANION EFFECT carries the duration,
           * because an item has nowhere to keep one. Without it Goodberry
           * would hand out five permanent healing berries for two PP --
           * the same fault the conjured weapon shipped with at 3.543.0
           * and the same fix.
           *
           * OPT-IN BY DURATION, not by a new field. Bless Water's
           * duration is blank, so `parsedDuration` is null and its Holy
           * Water is created exactly as it always was; Goodberry's is
           * "1 day" and its berries expire. The pack holds these two and
           * no others, measured rather than assumed.
           */
          const conjureExpires = parsedDuration !== null && !parsedDuration.permanent;
          const { conjureItemOnto } = await import("./conjured-item-workflow.mjs");
          /*
           * A POWER CRYSTAL CARRIES WHAT WAS PAID FOR IT (3.594.0, R8).
           * The row names the base points and the warp adds to them; the
           * item is stamped with the total, and `documents/actor.mjs`
           * derives it into whoever is holding it. See
           * magic/power-crystal.mjs.
           */
          const crystalBase = Math.max(0, Number(effect.crystalPP ?? 0));
          let crystalStamp = crystalBase > 0
            ? { powerCrystal: { pp: crystalBase + Math.max(0, Number(warpMods?.crystalPP ?? 0)) } }
            : null;
          /*
           * A HEAL GROWN BY THE WARP (3.614.0, R10 — Nature's Bounty's "+2 PP:
           * The HP restored increase by 1d10"). The pack entry prints the base
           * heal; the copy this casting makes carries the warped one, stamped
           * over its consumable flag the way a Power Crystal carries its points.
           */
          if (effect.healOnUse) {
            const { contentPack } = await import("../content-packs.mjs");
            const pack = contentPack(spec.pack);
            const entry = pack ? (await pack.getIndex()).find((e) => String(e.name).toLowerCase() === spec.itemName.toLowerCase()) : null;
            const src = entry ? (await pack.getDocument(entry._id))?.toObject?.() : null;
            const consumable = foundry.utils.deepClone(src?.flags?.[SYSTEM_ID]?.consumable ?? null);
            const heal = consumable?.effect?.effects?.find?.((e) => e.kind === "heal");
            if (heal) {
              heal.formula = warpedHealFormula(String(effect.healOnUse), warpMods ?? {});
              crystalStamp = { ...(crystalStamp ?? {}), consumable };
            }
          }
          const made = await conjureItemOnto(target, spec, {
            castId, expires: conjureExpires, stamp: crystalStamp
          });
          if (!made) {
            lines.push(line(conjuredItemMissingLine(spec, spell.name)));
            break;
          }
          /*
           * ONLY A CRYSTAL HAS POINTS TO SAY (3.614.1, F2 of the 3.614.0 drive).
           * Nature's Bounty's fruit rides the same stamp with a `consumable`
           * and no `powerCrystal`, and asking `crystalStamp` alone threw on
           * `.pp` after the fruit was made: no Result card, and no one-minute
           * clock, so the fruit never went to dust.
           */
          if (crystalStamp?.powerCrystal) {
            /*
             * THE POINTS ENTER THE POOL WHERE EVERY OTHER ARRIVAL IS
             * HANDLED (3.594.2) — `power-crystal-workflow`'s `createItem`
             * hook, which the item above has just fired.
             *
             * 3.594.1 raised the pool HERE, by hand, and that is why the
             * spell worked for the caster who made the crystal and not for
             * anybody they handed it to: a line in the applier can only
             * ever cover the moment of conjuring. Hand-rolling a rule at
             * one of its call sites is this project's defect shape (c),
             * and this is what it costs.
             */
            const { crystalLine } = await import("./power-crystal.mjs");
            lines.push(line(crystalLine(crystalStamp.powerCrystal.pp, target.name)));
          }
          if (conjureExpires) {
            const ciTiming = spellExpiryTiming(parsedDuration);
            /*
             * THE CLOCK NAMES THE ITEM IT IS KEEPING TIME FOR (3.594.2).
             *
             * The sweep has always run effect -> item: when the duration
             * ends, the items stamped with this cast go. Nothing ran the
             * other way, so an item that left EARLY — a Power Crystal
             * dissolving as its last point is spent, a Goodberry eaten —
             * left its clock behind, and the holder's sheet carried a
             * "Power Crystal" row for the next 24 hours with nothing
             * under it. Seen three times over on one sheet in Graham's
             * world on 26 September.
             */
            const ciFlags = { [SYSTEM_ID]: { spellBuff: true, conjuredItemId: made.id } };
            if (castId) ciFlags[SYSTEM_ID].castId = castId;
            if (ciTiming.spellEffect) ciFlags[SYSTEM_ID].spellEffect = true;
            if (ciTiming.spellEffectEnd != null) ciFlags[SYSTEM_ID].spellEffectEnd = ciTiming.spellEffectEnd;
            if (ciTiming.expiresRound != null) ciFlags[SYSTEM_ID].conditionExpiresRound = ciTiming.expiresRound;
            const ciData = {
              name: effect.label || made.name,
              img: spell.img || DEFAULT_SPELL_IMG,
              origin: spell.uuid,
              changes: [],
              flags: ciFlags
            };
            if (ciTiming.foundryDuration) {
              ciData.duration = { ...ciTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
            }
            await createEffectsOn(target, [ciData]);
          }
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(conjuredItemLine(spec, target.name, made.name) + (conjureExpires ? durationText : "")));
          if (conjureFellBack) lines.push(line(conjuredItemNobodyNamedLine(target.name)));
          break;
        }
        case "runeGrant": {
          /*
           * A SPELL THAT LENDS A RUNE (3.523.0).
           *
           * Magic Weapon, Shillelagh, Magic Vestment and Magic Jaws all
           * promise a temporary Potency rune and all four shipped with
           * `effects: []` — the spell cast, spent its PP and posted a
           * card describing a rune nobody received. Their step warps were
           * inert twice over: they stepped a rune that was never applied.
           *
           * NOT ONE LINE OF RUNE MACHINERY IS WRITTEN HERE, for the
           * reason Blade Ally's note gives at 3.330.0 — writing the
           * item's own `runes` field IS the mechanism, and everything
           * downstream (attack and damage bonuses, the item sheet, the
           * rune summary) already reads it.
           *
           * See magic/spell-rune.mjs for the arithmetic and
           * magic/spell-rune-workflow.mjs for the loan and its return.
           */
          const { applyRuneGrant } = await import("./spell-rune-workflow.mjs");
          const runeTiming = spellExpiryTiming(parsedDuration);
          const runeDurationFlags = {};
          if (runeTiming.spellEffect) runeDurationFlags.spellEffect = true;
          if (runeTiming.spellEffectEnd != null) runeDurationFlags.spellEffectEnd = runeTiming.spellEffectEnd;
          if (runeTiming.expiresRound != null) runeDurationFlags.conditionExpiresRound = runeTiming.expiresRound;
          const lent = await applyRuneGrant(target, effect, {
            spellName: spell.name, castId, warpMods, durationFlags: runeDurationFlags
          });
          // A CANCELLED PICKER IS SILENT. The player closed the dialog;
          // saying "the spell finds nothing to imbue" would blame the
          // spell for their own decision.
          if (!lent) break;
          if (castId && target.uuid && lent.itemId) affected.add(target.uuid);
          lines.push(line(lent.line));
          break;
        }
        case "conditionRelief": {
          /*
           * A SPELL THAT TAKES A CONDITION DOWN (3.517.0). Restoration —
           * `effects: []` and SIX warps carrying `mods: {}`, the largest
           * cluster of inert warps on any one spell in the pack.
           *
           * See magic/condition-relief.mjs for the rules, and for why the
           * "+5 PP: cast time changes to 3 AP" warp is deliberately not
           * built here.
           */
          const reliefSpec = normaliseConditionRelief(effect);
          if (!reliefSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed condition relief.</em>`));
            break;
          }

          /*
           * THE DAILY LIMIT IS ASKED BEFORE ANYTHING IS SPENT ON THE
           * TARGET, and it belongs to the TARGET — Graham's ruling of
           * 7 September 2026. The record is cleared by THEIR daily
           * preparations, because the book limits the beneficiary.
           */
          // ONLY THE CREATURES IT NAMES (3.630.0) — Embalmer's Black Resin.
          if (!reliefReaches(reliefSpec, Array.from(target.items ?? []).map((i) => i.name))) break;
          // A DEAD CREATURE IS NOT RELIEVED OF DYING (3.630.0) — Soulvine
          // "has no effect upon a dead creature".
          if (reliefSpec.condition === "dying" || reliefSpec.choices?.includes?.("dying")) {
            const { isDead } = await import("../combat/death-state.mjs");
            if (isDead(target)) {
              lines.push(line(`<em>${target.name} is dead — ${spell.name} has no effect.</em>`));
              break;
            }
          }
          const reliefRecord = target.getFlag?.(SYSTEM_ID, RELIEF_FLAG) ?? {};
          // WAIVED BY A WARP (3.625.0): Renewed Restoration's +4 PP. The
          // record is still written below, so the next ordinary cast is
          // refused as the page wants.
          if (!warpMods?.ignoreDailyLimit && alreadyRelievedToday(reliefRecord, reliefSpec.oncePerDay)) {
            lines.push(line(alreadyRelievedLine(target.name, spell.name)));
            break;
          }

          // WHICH CONDITION, asked only when a warp bought a choice —
          // Resistance's prompt, reworded rather than rebuilt.
          let reliefPick = "";
          if (reliefNeedsPrompt(reliefSpec, warpMods)) {
            // ONLY WHAT THIS CREATURE HAS (3.625.1, found live on 0.7.0):
            // Bloom of Renewal asked "Fatigued or Sickened?" four times for
            // an emanation of four allies, three of whom had neither. A
            // creature holding none of the offers is told so without a
            // prompt; one holding exactly one is relieved of it; the
            // prompt opens only when the choice is real.
            const offered = reliefChoices(reliefSpec, warpMods);
            const held = offered.filter((c) => Number(
              target.conditions?.rawValues?.get?.(c) ?? target.getConditionValue?.(c) ?? 0) > 0);
            if (held.length === 1) reliefPick = held[0];
            else if (held.length > 1) {
              const { promptSlotChoice } = await import("./slot-choice-workflow.mjs");
              const picked = await promptSlotChoice(
                `${spell.name} — ${target.name}`, held, 1,
                { question: "Which condition?", noun: "these conditions", confirm: "Restore" });
              reliefPick = picked[0] ?? "";
            }
          }

          const relief = reliefPlan(reliefSpec, warpMods, reliefPick);
          // A ROLLED AMOUNT, OR ONE PRINTED FOR THAT CHOICE (3.630.0) —
          // Nine-Herb Restorative's "reduce Fatigued by 1d6 … or Injured by 1d4".
          {
            const formula = reliefAmountFormula(reliefSpec, relief.condition);
            if (formula) {
              const rolled = await rollAmount(formula, rollData, rolls);
              relief.amount = Math.max(1, rolled) + Math.max(0, Math.trunc(Number(warpMods?.reliefBump) || 0)) * (relief.step ?? 1);
              relief.rolled = `${formula} = ${rolled}`;
            } else if (reliefChoiceAmount(reliefSpec, relief.condition)) {
              relief.amount = reliefChoiceAmount(reliefSpec, relief.condition);
            }
          }
          // THE CONDITION'S OWN VALUE, NOT WHAT IS BEING IGNORED (3.611.1, F3
          // of the 3.611.0 drive). `getConditionValue` is the value after
          // suppression — Banish Fatigue ignoring two points read fatigued 3
          // as 1, and its "removes the fatigue permanently" then took all
          // three. A relief changes what the creature HAS, so it reads the
          // raw map the actor keeps for exactly this.
          const had = Math.max(0, Number(
            target.conditions?.rawValues?.get?.(relief.condition)
            ?? target.getConditionValue?.(relief.condition) ?? 0));
          if (had <= 0) {
            lines.push(line(reliefNothingLine(target.name, relief.label, spell?.type === "spell" && !spell?.flags?.[SYSTEM_ID]?.syntheticConsumable ? "spell" : "dose")));
            break;
          }

          /*
           * A SEALED CONDITION REFUSES RELIEF (3.602.0, Graham's R6).
           *
           * Resurrection's injured 2 "cannot be removed or reduced by any
           * means", and Restoration is exactly the spell that would try. The
           * refusal is OUT LOUD: a Restoration that silently did nothing
           * would read as a broken spell, and the caster has spent the PP.
           *
           * See conditions/sealed.mjs for why the condition itself stays
           * ordinary and the seal is kept beside it.
           */
          {
            const { SEALED_FLAG, isSealed, sealRemaining, sealRefusedLine } =
              await import("../conditions/sealed.mjs");
            const { describeRemaining } = await import("../temporary-immunity.mjs");
            const seals = target.getFlag?.(SYSTEM_ID, SEALED_FLAG) ?? {};
            const nowSeconds = Number(game.time?.worldTime ?? 0);
            if (isSealed(seals, relief.condition, nowSeconds)) {
              lines.push(line(sealRefusedLine(target.name, relief.label,
                describeRemaining(sealRemaining(seals, relief.condition, nowSeconds)))));
              break;
            }
          }

          const left = Math.max(0, had - relief.amount);
          if (left > 0) await target.toggleStatusEffect?.(relief.condition, { value: left });
          else if (relief.condition === "dying") {
            // OUT OF DYING IS A RECOVERY (3.630.0): Dying goes, Fatigued
            // rises by 1, and a fatal injury keeps them in it.
            const { applyDyingRecovery } = await import("../combat/death-state.mjs");
            const state = await applyDyingRecovery(target);
            if (state?.blocked) lines.push(line(`<em>${state.note ?? `${target.name} cannot leave Dying.`}</em>`));
          } else await target.toggleStatusEffect?.(relief.condition, { active: false });
          if (reliefSpec.oncePerDay && target.setFlag) {
            await target.setFlag(SYSTEM_ID, RELIEF_FLAG,
              markRelievedToday(reliefRecord, reliefSpec.oncePerDay));
          }
          lines.push(line(reliefLine(target.name, relief.label, had, left) + (relief.rolled ? ` <em>(${relief.rolled})</em>` : "")));
          // SHARE BURDEN'S OTHER HALF (3.625.1): the caster takes the
          // relieved condition on, one step higher than they hold it.
          if (reliefSpec.casterGains && caster && caster !== target && caster.uuid !== target.uuid) {
            const { conditionLabel } = await import("../conditions/condition-rules.mjs");
            const mine = Math.max(0, Number(
              caster.conditions?.rawValues?.get?.(relief.condition)
              ?? caster.getConditionValue?.(relief.condition) ?? 0));
            const applied = await applyConditionTags(caster, [{
              key: relief.condition, label: conditionLabel(relief.condition), value: mine + 1
            }], { sourceTraits: traitList(spell?.system?.traits) });
            const result = (applied ?? [])[0];
            lines.push(line(result?.immune
              ? `<em>${caster.name} is immune to ${relief.label} — the burden cannot be shared.</em>`
              : casterGainsLine(caster.name, relief.label, mine, mine + 1)));
          }
          break;
        }
        case "magicStone": {
          /*
           * THREE PEBBLES A SLING CAN THROW (3.513.0).
           *
           * WILD MORPH'S SHAPE, DELIBERATELY — items stamped
           * `endsWithSpell` plus a companion effect that carries the
           * duration. The pebbles have no clock of their own, and the
           * world-time sweep expiring that effect is what removes them.
           * Without it Magic Stone would hand out permanent +1 ammunition.
           *
           * See magic/magic-stone.mjs for why the Disruptive trait is
           * printed rather than applied.
           */
          const stoneValue = magicStoneBonus(warpMods, warpedBonusValue);
          await target.createEmbeddedDocuments("Item",
            [magicStoneItemData({ value: stoneValue, castId, img: spell.img })]);

          const sTiming = spellExpiryTiming(parsedDuration);
          const sFlags = { [SYSTEM_ID]: { spellBuff: true } };
          if (castId) sFlags[SYSTEM_ID].castId = castId;
          if (sTiming.spellEffect) sFlags[SYSTEM_ID].spellEffect = true;
          if (sTiming.spellEffectEnd != null) sFlags[SYSTEM_ID].spellEffectEnd = sTiming.spellEffectEnd;
          if (sTiming.expiresRound != null) sFlags[SYSTEM_ID].conditionExpiresRound = sTiming.expiresRound;
          const sData = {
            name: effect.label || "Magic Stone",
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: sFlags
          };
          if (sTiming.foundryDuration) {
            sData.duration = { ...sTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [sData]);
          if (castId && target.uuid) affected.add(target.uuid);

          lines.push(line(
            magicStoneLine(target.name, MAGIC_STONE_COUNT, stoneValue) + durationText));
          lines.push(line(magicStoneTraitLine()));
          break;
        }
        case "triggeredStrike": {
          // A REACTION SPENT ON A BLOW ALREADY LANDED. War Cry — see
          // magic/triggered-strike.mjs and Graham's ruling of 2 September
          // 2026 that the die lands on the strike that triggered it.
          //
          // THE RECIPIENT IS THE ALLY, NOT THE VICTIM. "Targets the
          // triggering ally" is the printed line, so the picker asks for
          // the ally and the creature that gets hurt is read off the
          // ally's own record of the critical.
          const spec = normaliseTriggeredStrike({ ...effect, dice: addDice(effect.dice, warpDice) });
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed triggered strike.</em>`));
            break;
          }
          const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
          const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
          const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
          for (const ally of recipients) {
            const record = ally.getFlag?.(SYSTEM_ID, CRITICAL_RECORD_FLAG) ?? null;
            const verdict = triggeredStrikeQualifies(spec, record, game.combat?.round ?? null);
            if (!verdict.ok) {
              // REFUSED WHERE SOMEBODY CAN SEE IT. A reaction that did
              // nothing and said nothing is a player wondering whether
              // the spell is broken.
              lines.push(line(triggeredStrikeRefusal(spell.name, ally.name, verdict.why)));
              continue;
            }
            // THE UUID FIRST, AND THE ID ONLY AS A FALLBACK (3.468.0).
            // An unlinked token's synthetic actor shares the base actor's
            // id, so `game.actors.get` would damage the sidebar sheet
            // rather than the creature in the fight — see
            // `victimIsPrecise` for what driving this looked like.
            // `fromUuid`, NOT `fromUuidSync`. Both resolve a synthetic
            // token actor, and this loop is already async — so the
            // already-declared global is used rather than widening
            // tools/foundry-globals.json, whose own header asks for a
            // name to be confirmed in a live client and added
            // deliberately. A global added to get a check to pass is the
            // check being talked out of its job.
            const victim = (verdict.targetActorUuid
              ? (await fromUuid(verdict.targetActorUuid).catch(() => null))
              : null) ?? game.actors?.get?.(verdict.targetActorId) ?? null;
            if (!victim) {
              lines.push(line(triggeredStrikeRefusal(
                spell.name, ally.name, "the creature they hit is no longer here")));
              continue;
            }
            const roll = await new Roll(spec.dice).evaluate();
            const packet = resolveAgainstDefences(victim.system ?? {}, {
              amount: roll.total,
              type: spec.damageType,
              // A SPELL IS A MAGICAL SOURCE (3.548.0).
              creatureTypeSystem: ownedCreatureTypeSystem(victim),
              magical: true
            });
            if (packet.taken > 0) await applyDamageAndCheckDying(victim, packet.taken);
            lines.push(line(triggeredStrikeLine(
              spec, ally.name, victim.name, packet.taken, roll.total)));
            // A RECORD FROM BEFORE 3.468.0 CARRIES NO UUID, so the
            // creature is identified only by species. Said out loud
            // rather than guessed at silently.
            if (!victimIsPrecise(verdict)) {
              lines.push(line(`<em>That critical was recorded before this version; `
                + `if ${victim.name} is an unlinked token, apply the damage by hand.</em>`));
            }
            const offer = freeAttackLine(spec, ally.name, victim.name);
            if (offer) lines.push(line(offer));
          }
          break;
        }
        case "conditionRemove": {
          // A CONDITION GONE OUTRIGHT (3.630.0) — Sunveil, Divine Nectar,
          // Greysap. See magic/restore-rows.mjs.
          const { CONDITIONS } = await import("../conditions/registry.mjs");
          const { normaliseConditionRemove, recurringToEnd } = await import("./restore-rows.mjs");
          const spec = normaliseConditionRemove(effect, CONDITIONS);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed condition removal.</em>`));
            break;
          }
          const gone = [];
          for (const key of spec.conditions) {
            if (!target.hasCondition?.(key)) continue;
            await target.toggleStatusEffect?.(key, { active: false });
            gone.push(CONDITIONS[key]?.label ?? key);
          }
          for (const fx of recurringToEnd(target.effects, spec, SYSTEM_ID)) {
            await fx.delete();
            gone.push(fx.name);
          }
          lines.push(line(gone.length
            ? `${target.name}: <strong>${gone.join(", ")}</strong> removed.${spec.note ? ` <em>${spec.note}</em>` : ""}`
            // "HAD NO …" (3.630.1, F5): "had none of persistent acid damage" read badly.
            : `${target.name} had no ${[...spec.conditions.map((c) => CONDITIONS[c]?.label ?? c), ...(spec.recurringType ? [`persistent ${spec.recurringType} damage`] : [])].join(" or ")} to remove.`));
          break;
        }
        case "restore": {
          // A RESOURCE BACK (3.630.0) — Divine Nectar's HP and PP, Void
          // Lily's Conviction. HP goes through `healActor`, so a Dying
          // creature is treated as healing always treats one.
          const { normaliseRestore, restoreAmount } = await import("./restore-rows.mjs");
          const spec = normaliseRestore(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed restore.</em>`));
            break;
          }
          const pool = target.system?.resources?.[spec.resource] ?? {};
          const give = restoreAmount(spec, pool);
          if (spec.resource === "conviction") {
            const { awardConviction, convictionEnabled } = await import("../conviction.mjs");
            if (!convictionEnabled()) {
              lines.push(line(`<em>This world does not use Conviction — ${target.name} regains none.</em>`));
              break;
            }
            if (give > 0) await awardConviction(target, give);
          } else if (spec.resource === "hp") {
            if (give > 0) {
              const healed = await healActor(target, give, { magical: true });
              lines.push(line(`${target.name}: regains <strong>${healed}</strong> ${spec.short}${spec.all ? " (all)" : ""}.`));
              break;
            }
          } else if (give > 0) {
            await target.update({ [`system.resources.${spec.resource}.value`]: Number(pool.value ?? 0) + give });
          }
          lines.push(line(give > 0
            ? `${target.name}: regains <strong>${give}</strong> ${spec.short}${spec.all ? " (all)" : ""}.`
            : `${target.name}'s ${spec.label} are already full.`));
          break;
        }
        case "counteractAffliction": {
          /*
           * COUNTERACT A DISEASE OR POISON (3.630.0) — Pillars of Faith's
           * Nine-Herb Restorative: "Select one Disease or Poison currently
           * affecting the target and attempt to Counteract it." Against the
           * affliction's own level and its save DC. Ended on a Success or
           * better; the rest of the spell's rows run whatever the result.
           */
          const kinds = (Array.isArray(effect.afflictionTypes) ? effect.afflictionTypes : ["disease", "poison"]).map((k) => String(k).toLowerCase());
          // A CURSE THAT A DISEASE CURE REACHES (3.633.0, F&F 3.0 R8): the
          // Aboleth's Slime — "a remove disease can counter this curse" —
          // declares `flags.trg-prime.counteredAs: ["disease"]`.
          const afflictions = Array.from(target.items ?? []).filter((i) => i.type === "affliction"
            && afflictionCounteredBy(i, kinds));
          if (!afflictions.length) {
            lines.push(line(`${target.name} has no ${kinds.join(" or ")} to counteract.`));
            break;
          }
          let chosen = afflictions[0];
          if (afflictions.length > 1) {
            const { DialogV2 } = foundry.applications.api;
            const picked = await DialogV2.wait({
              window: { title: `${spell.name} — ${target.name}` },
              content: `<div class="trg-prime"><p>Which affliction?</p><select name="pick">${afflictions.map((a) => `<option value="${a.id}">${a.name} (level ${a.system?.level ?? 0})</option>`).join("")}</select></div>`,
              buttons: [{ action: "ok", label: "Counteract", default: true, callback: (event, button) => button.form?.elements?.pick?.value ?? "" }],
              rejectClose: false
            });
            chosen = afflictions.find((a) => a.id === picked) ?? afflictions[0];
          }
          const { afflictionSaveDC } = await import("../afflictions.mjs");
          const level = Math.max(0, Number(chosen.system?.level ?? 0) || 0);
          const dc = afflictionSaveDC(level, chosen.system ?? 0);
          const { rollCounteractCheck } = await import("../combat/counteract-workflow.mjs");
          const result = await rollCounteractCheck(caster, { targetLevel: level, dc });
          const degree = result?.outcome?.degree;
          if (!degree) {
            lines.push(line(`<em>${chosen.name}: the counteract check was not completed — resolve it by hand.</em>`));
            break;
          }
          if (["heroic", "critical", "success"].includes(degree.key)) {
            await chosen.delete();
            lines.push(line(`${target.name}: <strong>${chosen.name}</strong> is counteracted (${degree.label}) and ends.`));
          } else {
            lines.push(line(`${target.name}: <strong>${chosen.name}</strong> resists (${degree.label}, DC ${dc}).`));
          }
          break;
        }
        case "counteractRoll": {
          /*
           * A COUNTERACT ROLLED AND ITS RUNG PRINTED (3.630.0) — Exorcise.
           * The system holds no possession state (Graham, 8 Oct 2026: roll
           * and print), so the GM enters the possessor's level in the
           * dialog and the result's rung is printed for the table to apply.
           */
          const { rollCounteractCheck } = await import("../combat/counteract-workflow.mjs");
          // THE WARP'S CIRCUMSTANCE, PRE-FILLED (3.630.1): "+1 circumstance
          // per +1 PP (max +12)" is the generic counted bonus.
          const warpCirc = Math.min(Number(warpMods?.bonusValue) || 0, Number(warpMods?.bonusMax ?? Infinity));
          const result = await rollCounteractCheck(caster, { targetLevel: 0, dc: null, circumstance: warpCirc, dcFromLevel: true });
          const degree = result?.outcome?.degree;
          const outcomes = effect.outcomes ?? {};
          if (!degree) {
            lines.push(line(`<em>${spell.name}: no counteract result — read the rungs from the spell.</em>`));
            break;
          }
          const rung = outcomes[degree.key]
            ?? (degree.key === "heroic" ? outcomes.critical : degree.key === "blunder" ? outcomes.fumble : degree.key === "partial" ? outcomes.failure : "");
          lines.push(line(`${spell.name} against ${effect.label ?? "the effect"} on ${target.name}: <strong>${degree.label}</strong>${rung ? ` — ${rung}` : ""}`));
          break;
        }
        case "revealFact": {
          /*
           * ONE ACCURATE FACT (3.630.0) — Analytical Glance. Read off the
           * target's sheet and whispered to the caster and the GM. See
           * magic/reveal-fact.mjs.
           */
          const { FACT_CATEGORIES, revealFact } = await import("./reveal-fact.mjs");
          const allowed = (Array.isArray(effect.categories) ? effect.categories : Object.keys(FACT_CATEGORIES)).filter((c) => FACT_CATEGORIES[c]);
          const count = Math.max(1, 1 + Math.trunc(Number(warpMods?.choiceExtra) || 0));
          const { promptSlotChoice } = await import("./slot-choice-workflow.mjs");
          const picked = (await promptSlotChoice(`${spell.name} — ${target.name}`, allowed, count,
            { question: count > 1 ? `Choose ${count} categories` : "Choose one category", noun: "categories", confirm: "Learn" })) ?? [];
          if (!picked.length) {
            lines.push(line(`<em>${spell.name}: no category chosen.</em>`));
            break;
          }
          const { actorDefences } = await import("../creature-traits.mjs");
          const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
          const { actorSenses } = await import("../senses.mjs");
          const sys = target.system ?? {};
          const facts = {
            saves: Object.fromEntries(["fortitude", "reflex", "will"].map((k) => [k, Number(sys.combat?.saves?.[k]?.total ?? 0)])),
            defences: actorDefences(sys, ownedCreatureTypeSystem(target)),
            speeds: Object.fromEntries(Object.entries(sys.combat?.movement ?? {}).map(([k, v]) => [k, Number(v?.total ?? 0)])),
            senses: actorSenses(sys, Array.from(target.items ?? []))
          };
          const said = picked.map((c) => revealFact(c, facts));
          const whisper = ChatMessage.getWhisperRecipients?.("GM")?.map((u) => u.id) ?? [];
          const casterOwners = game.users?.filter?.((u) => !u.isGM && caster?.testUserPermission?.(u, "OWNER")).map((u) => u.id) ?? [];
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: caster }),
            whisper: [...new Set([...whisper, ...casterOwners, game.user.id])],
            content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${caster.name}</span><h3>${spell.name} — ${target.name}</h3></div></header>`
              + said.map((f) => `<p style="margin:2px 0"><strong>${f.label}:</strong> ${f.text}</p>`).join("") + `</div>`
          });
          lines.push(line(`${spell.name}: ${picked.map((c) => FACT_CATEGORIES[c]).join(", ")} about ${target.name} — whispered to ${caster.name} and the GM.`));
          break;
        }
        case "declare": {
          /*
           * A DECLARED EFFECT (3.630.0) — a timed effect carrying a death
           * guard, a save improvement, a next-damage boost, a declared
           * Success or a Death State bonus, for the rails that read them.
           * Second Heart, Phoenix Root, Prism Lotus, Worldroot Fragment,
           * Communal Litany, Blackfire Ivy, Emberthistle. See
           * magic/declared-effect.mjs for why the flags are a closed list.
           */
          const { normaliseDeclaredEffect, declaredEffectData, declaredAlreadyOn, declaredCastLine } = await import("./declared-effect.mjs");
          const spec = normaliseDeclaredEffect(effect, { spellName: spell.name });
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed effect — nothing applied.</em>`));
            break;
          }
          if (declaredAlreadyOn(target.effects, spec, SYSTEM_ID)) {
            lines.push(line(`${target.name} already carries <strong>${spec.label}</strong> — it does not stack.`));
            break;
          }
          // A once-only rider's save DC, stamped as the strikeRider case does.
          const rider = spec.flags.strikeRider;
          if (rider?.conditionSave && !rider.conditionSave.dc && effect.flags?.strikeRider?.conditionSave?.dcLevel !== undefined) {
            const { levelDC } = await import("../dice/resolution.mjs");
            rider.conditionSave.dc = levelDC(Math.max(0, Number(effect.flags.strikeRider.conditionSave.dcLevel) || 0));
          }
          // A DECLARED TICK THAT GROWS WITH A BONUS WARP (3.672.0; Inner
          // Tempest's Root: "+1 PP: increase bonus by +1 (max +4)" on its
          // balance bonus). Only a row that says `warpBonus: true`; its cap
          // is the warp's own, as every bonus row's is.
          if (Array.isArray(spec.flags.conditionals) && warpBonus) {
            spec.flags.conditionals = declaredConditionalsWarped(spec.flags.conditionals, warpBonus, warpBonusMax);
          }
          // COMMUNAL LITANY'S "+2 PP: use the benefit twice" (3.630.0).
          if (spec.flags.saveConvert && Number(warpMods?.declareUses) > 0) {
            spec.flags.saveConvert = { ...spec.flags.saveConvert, uses: Math.max(1, Number(spec.flags.saveConvert.uses) || 1) + Number(warpMods.declareUses) };
          }
          const data = declaredEffectData(spec, SYSTEM_ID, CHANGE_TYPE.ADD);
          const timing = spellExpiryTiming(parsedDuration);
          if (castId) data.flags[SYSTEM_ID].castId = castId;
          if (timing.spellEffect) data.flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) data.flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) data.flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          // A ROW THAT LASTS ROUNDS, NOT THE SPELL (3.630.0).
          if (spec.rounds && game.combat?.started) data.flags[SYSTEM_ID].conditionExpiresRound = Number(game.combat.round ?? 0) + spec.rounds;
          data.img = spell.img || DEFAULT_SPELL_IMG;
          data.origin = spell.uuid;
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: <strong>${spec.label}</strong> — ${declaredCastLine(spec)}${durationText}.`));
          break;
        }
        case "strikeRider": {
          // SECONDARY DAMAGE HUNG ON A WEAPON. See magic/strike-riders.mjs
          // — the rune chapter's own mechanism, reached by three PP 1
          // spells that use the book's own word for it.
          //
          // WARPING RAISES THE DIE THROUGH `addDice`, the same call the
          // heal and tempHP cases make, so Spoil The Profane's "+2 PP:
          // increase secondary damage by 1d6" goes through one adder
          // rather than a second copy of that arithmetic.
          // AND ITS CONDITION GROWN BY A WARP (3.613.0) — Spoil The Profane's
          // "+3 PP: increase the weakened by 1 (max +5)", the same reader the
          // condition case uses. A die taken from the weapon itself (Weapon
          // Surge, R12) has no dice of its own for a warp to grow.
          // A CONDITION'S SAVE AT A LEVEL'S DC (3.630.0) — Tangleweed's Reflex
          // at the herb's level DC, stamped now so the Strike need not know it.
          // AND ONE THAT NAMES NO DC TAKES THE CASTER'S SPELL SAVE DC (3.672.0;
          // Inner Tempest's Acidic Touch, B8-2: "a successful melee attack
          // causes the target to make a Fortitude save" — at your spell save
          // DC). The nominal DC, so a spell rolling no save itself has one.
          const stampedSave = effect.conditionSave && !Number(effect.conditionSave.dc) && effect.conditionSave.dcLevel !== undefined
            ? { ...effect.conditionSave, dc: (await import("../dice/resolution.mjs")).levelDC(Math.max(0, Number(effect.conditionSave.dcLevel) || 0)) }
            : effect.conditionSave && !Number(effect.conditionSave.dc) && Number(saveDC ?? rollData?.saveDC ?? 0) > 0
              ? { ...effect.conditionSave, dc: Number(saveDC ?? rollData?.saveDC) }
              : effect.conditionSave;
          const spec = normaliseStrikeRider({
            ...effect,
            ...(stampedSave ? { conditionSave: stampedSave } : {}),
            dice: effect.weaponDie || !effect.dice ? "" : addDice(effect.dice, warpDice),
            ...(effect.condition
              ? { conditionValue: warpedConditionValue(Math.max(1, Number(effect.conditionValue ?? 1) || 1), warpMods, effect) }
              : {})
          });
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed strike rider.</em>`));
            break;
          }
          // A RIDER THAT NAMES A WEAPON MUST GET ONE. Talon Strike lasts a
          // minute and says "the target weapon"; left unbound it would arm
          // every weapon the character owns, which is a different spell.
          // Refused where somebody can see it — the position 3.411.1 took
          // for a bonus slot with nowhere to land.
          //
          // WHAT THIS STILL ANSWERS FOR, now that 3.438.0 gates the cast:
          // a rider aimed at somebody OTHER than the caster (whose hands a
          // pre-cast gate cannot know about), and a weapon prompt the
          // player cancelled. Both reach here with no weaponId and neither
          // is what the gate refuses, so the message says what is true of
          // both — "no weapon was chosen" — rather than repeating the
          // gate's "you are wielding none". Two guards, two claims; see
          // `weaponRiderRequirement` for why one must not stand in for
          // the other.
          if (spec.weaponScoped) {
            const { promptRiderWeapon } = await import("./strike-riders-workflow.mjs");
            spec.weaponId = (await promptRiderWeapon(target, spell.name)) ?? "";
            if (!spec.weaponId) {
              lines.push(line(
                `<em>No weapon was chosen for ${spell.name} to enchant on ${target.name} — nothing applied.</em>`));
              break;
            }
          }
          const timing = spellExpiryTiming(parsedDuration);
          const riderFlags = { [SYSTEM_ID]: { [STRIKE_RIDER_FLAG]: spec } };
          if (castId) riderFlags[SYSTEM_ID].castId = castId;
          if (timing.spellEffect) riderFlags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) riderFlags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) riderFlags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          const riderData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: riderFlags
          };
          if (timing.foundryDuration) {
            riderData.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          // RELAYED, NOT WRITTEN DIRECTLY (3.474.0). A player casting on another
          // player's character owns neither the actor nor its effects, and
          // Foundry refuses. `createEffectsOn` asks the GM when the target is
          // not ours — which eight other effect kinds in this file already did.
          await createEffectsOn(target, [riderData]);
          if (castId && target.uuid) affected.add(target.uuid);
          const named = spec.weaponId
            ? target.items?.get?.(spec.weaponId)?.name ?? "the chosen weapon"
            : "";
          lines.push(line(
            `${target.name}: ${riderCastLine(spec)}${named ? ` (${named})` : ""}${durationText}.`));
          break;
        }
        case "suppress": {
          // IGNORING A POINT OF A CONDITION. See conditions/suppression.mjs
          // — the effect carries the number and `prepareConditions`
          // subtracts it from the effective value, so nothing here has to
          // reduce the condition or remember to put it back.
          // WARPED BEFORE IT IS VALIDATED (3.529.0), so a swapped
          // condition is checked against the registry below exactly as an
          // authored one is — a warp naming a condition nothing knows
          // must fail the same way a typo in the row would.
          /*
           * "DAZED OR WEAKENED OR INJURED" IS A CHOICE (3.587.0, R6).
           * See conditions/suppression.mjs: the options do not share an
           * amount, so one row naming three conditions would have to
           * pick a number and be wrong about two of them. Asked before
           * the warp, so a purchased "+2 PP: ignore an additional point"
           * raises whichever one was chosen.
           */
          const suppressChoice = normaliseSuppressionChoice(effect);
          let chosenSuppression = null;
          if (suppressChoice) {
            const { promptSlotChoice } = await import("./slot-choice-workflow.mjs");
            const [pickedCondition] = await promptSlotChoice(
              spell.name, suppressChoice.options.map((o) => o.condition), 1,
              { question: "Which condition?", noun: "these conditions", confirm: "Ignore" });
            chosenSuppression = suppressionChoiceFor(suppressChoice, pickedCondition);
            if (!chosenSuppression) {
              lines.push(line(`<em>${spell.name}: no condition was chosen — nothing applied.</em>`));
              break;
            }
          }
          const spec = warpedSuppression(
            chosenSuppression ?? normaliseSuppression(effect), warpMods);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed suppression.</em>`));
            break;
          }
          // A CONDITION THE REGISTRY DOES NOT KNOW would subtract from
          // nothing for ever, silently. `verify-suppression` catches an
          // authoring typo at build time; this catches one that reaches a
          // table anyway, which is the pair this project always writes.
          if (!CONDITIONS[spec.condition]) {
            lines.push(line(`<em>${spell.name} names an unknown condition "${spec.condition}".</em>`));
            break;
          }
          // READ BEFORE, READ AFTER, REPORT BOTH. Working the new number
          // out by arithmetic here would be a second place deciding what
          // a suppression is worth, and it would be the place that does
          // not know about highest-applies — so the card asks the same
          // derivation every other reader asks, once on each side of the
          // change.
          const before = Number(target.getConditionValue?.(spec.condition) ?? 0);
          const timing = spellExpiryTiming(parsedDuration);
          const flags = { [SYSTEM_ID]: { [SUPPRESSION_FLAG]: spec } };
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          const data = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
// RELAYED, NOT WRITTEN DIRECTLY (3.474.0). A player casting on another
          // player's character owns neither the actor nor its effects, and
          // Foundry refuses. `createEffectsOn` asks the GM when the target is
          // not ours — which eight other effect kinds in this file already did.
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          // WHAT IT IS WORTH RIGHT NOW, beside what it will keep doing.
          // A card saying only "ignores 1 point of fatigue" leaves a
          // player who has none wondering whether the spell worked; one
          // saying only "Fatigued 3 → 2" would hide that it also covers
          // the next point they take. Both, or the card is describing
          // half a spell.
          const after = Number(target.getConditionValue?.(spec.condition) ?? 0);
          const moved = before > 0
            ? ` (${CONDITIONS[spec.condition].label} ${before} &rarr; ${after})`
            : "";
          lines.push(line(
            `${target.name} ${suppressionCastLine(spec)}${moved}${durationText}.`));
          break;
        }
        case "runeWard":
        case "saveReroll": {
          // REACHED FROM THE SAVE, NOT FROM THE CAST (3.625.0). The row is
          // what the save path looks for (save-reaction-spells-workflow);
          // a cast that arrives here was made as that reaction, and the
          // reroll it bought is reported on the save's own card. See
          // magic/save-reroll.mjs.
          lines.push(line(`<em>${spell.name}: the triggering saving throw is rerolled — see the save.</em>`));
          break;
        }
        case "runeWarning": {
          // THE SAME SHAPE AS `elementalNexus`, AND FOR THE SAME REASON.
          //
          // An inscribed rune is a Region, and the Region only exists at
          // the point in `cast-workflow` where the area was placed — which
          // is also where the caster must be asked who is designated,
          // because the answer is "whoever is inside the radius that was
          // just drawn". So all of it happens there, and these cases exist
          // so the kinds are not reported unhandled beside spells that
          // worked. See magic/inscribed-rune.mjs.
          break;
        }
        case "damageTypeChoice": {
          // THE SAME SHAPE AS `elementalNexus`, AND FOR THE SAME REASON.
          //
          // The choice has to be made in `cast-workflow`, between the
          // spellcasting check and the damage resolution — by the time the
          // applier runs, the save has been rolled and the damage dealt.
          // So all of it happens there, and this case exists so the kind is
          // not reported unhandled beside a spell that worked.
          break;
        }
        case "elementalNexus": {
          // THE SAME SHAPE AS `hazard`, AND FOR THE SAME REASON.
          //
          // The zone is a placed Region, and the Region only exists at
          // the point in `cast-workflow` where the template was drawn —
          // which is also where the element must be chosen, because the
          // element decides the save the Region will ask for. So all of
          // it happens there, and this case exists so the kind is not
          // reported unhandled beside a spell that worked.
          break;
        }
        case "flatLadder": {
          /*
           * FOUR PRINTED OUTCOMES WITH NO DICE (3.485.0).
           *
           * Serenity and Word Of Death, the two flat degree ladders on
           * the flat-damage backlog. Each target's own save degree picks
           * its rung, so this reads `ladderResults` rather than treating
           * the effect as one thing applied to everybody.
           *
           * See magic/flat-ladder.mjs for why these two do NOT share a
           * mechanism beyond their shape, and for the ordering rule in
           * `flatResolution` — Word Of Death's Failure asks the hit-point
           * threshold BEFORE the drop, and its Success applies the damage
           * FIRST and kills only if that brought them to zero.
           */
          const spec = normaliseFlatLadder(effect);
          if (!spec) {
            lines.push(line(`<em>${spell?.name ?? "The spell"} declares a malformed ladder.</em>`));
            break;
          }
          const { applyFlatLadder } = await import("./flat-ladder-workflow.mjs");
          /*
           * THIS TARGET'S RUNG, AND ONLY THIS TARGET'S (3.606.0).
           *
           * This case sits INSIDE the loop over recipients, and it used to
           * walk every save result itself. For a ladder kind the recipients
           * ARE everyone who rolled, so with two creatures caught each one
           * was handed the ladder twice — Serenity biting twice, Word Of
           * Death's 50 landing as 100 — and with k creatures, k times. It
           * never showed because every live drive of it had one target.
           * Found building Spirit Trap, which has this same shape.
           */
          const mine = ladderResults.find((r) => r?.target === target);
          if (mine) {
            for (const l of await applyFlatLadder(caster, spec, target, mine.degree, castId)) {
              lines.push(line(l));
            }
          }
          break;
        }
        case "lightPerception": {
          /*
           * THE LIGHT ONE CREATURE SEES (3.606.0). Shroud: "perceives light
           * as two steps lower than it actually is". A flag on the target's
           * own effect, read by the Perception penalty and the visual range
           * report — see `perceivedLightShift` in light-check.mjs for why it
           * is not a Region.
           */
          const steps = Math.trunc(Number(effect.steps) || 0);
          if (!steps) {
            lines.push(line(`<em>${spell.name} declares a light shift of nothing.</em>`));
            break;
          }
          const { LIGHT_PERCEPTION_FLAG } = await import("../light-check.mjs");
          const timing = spellExpiryTiming(parsedDuration);
          const flags = { [SYSTEM_ID]: { spellBuff: true, [LIGHT_PERCEPTION_FLAG]: steps } };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          const data = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name} sees the light as <strong>${Math.abs(steps)} step${Math.abs(steps) === 1 ? "" : "s"} `
            + `${steps < 0 ? "darker" : "brighter"}</strong> than it is${durationText}.`));
          break;
        }
        case "movementBind": {
          /*
           * A BIND ON HOW THE CREATURE MAY MOVE (3.606.0). Spirit Trap. See
           * magic/movement-bind.mjs for the three things it needed.
           *
           * THE ROLLED DEGREE, NOT THE MAPPED ONE. The row carries its whole
           * ladder and reads it with its own walk, exactly as a save ladder
           * does; `ladderResults` is mapped onto the spell's gated rows,
           * which is a different question.
           */
          const { normaliseMovementBind, bindOutcome, bindLine } = await import("./movement-bind.mjs");
          const spec = normaliseMovementBind(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed movement bind.</em>`));
            break;
          }
          const rolled = (Array.isArray(saveResults) ? saveResults : []).find((r) => r?.target === target);
          if (!rolled) break;
          const outcome = bindOutcome(spec, rolled.degree);
          lines.push(line(bindLine(target.name, spec.label, rolled.degree, outcome)));
          if (outcome.free) break;
          const { bindRecord } = await import("./movement-bind-workflow.mjs");
          const { MOVEMENT_BIND_FLAG } = await import("./movement-bind.mjs");
          const timing = spellExpiryTiming(parsedDuration);
          const record = bindRecord(spec, outcome, {
            saveDC: Number(saveDC ?? rollData?.saveDC ?? 0) || 0,
            tokenDocument: target.getActiveTokens?.()[0]?.document ?? null,
            raw: effect
          });
          const flags = { [SYSTEM_ID]: { spellBuff: true, [MOVEMENT_BIND_FLAG]: record } };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          const data = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "splash": {
          // RESOLVED IN THE ATTACK PATH, not here (3.482.0).
          //
          // Splash is part of the same blow as the spell's own damage —
          // "1d6 acid damage PLUS 1 splash acid damage" — so it is added
          // to the amount BEFORE `resolveAgainstDefences` runs, in
          // `resolveSpellAttack`. Resolving it here would make it a
          // second damage instance, and resistance halving two instances
          // is not the same as halving their sum.
          //
          // This case exists so the kind is not reported unhandled beside
          // a spell that worked — which is what
          // `verify-effect-kinds-handled` caught at 3.482.0, before Orb
          // Of Acid had been cast once.
          break;
        }
        case "missileStorm": {
          // THE SAME SHAPE AS `elementalNexus` ABOVE, for a related but
          // distinct reason.
          //
          // The nexus resolves in `cast-workflow` because the REGION only
          // exists there. This one resolves there because the LIST does:
          // the salvo fires at `areaTargets`, which the area block builds
          // after pruning by disposition, line of effect and the kind
          // gate. That list is not in scope here, and rebuilding it would
          // undo the pruning.
          //
          // So this case exists to keep the kind from being reported
          // unhandled beside a spell that worked — which is exactly what
          // `verify-effect-kinds-handled` caught at 3.478.0, before the
          // spell had been cast once.
          break;
        }
        case "elementalShield": {
          /*
           * AN ELEMENT CHOSEN AT CAST, WITH TWO CONSEQUENCES.
           *
           *   "You enshroud yourself in either fire or cold which grants
           *    you resistance to the OPPOSING element (fire grants cold
           *    resistance and cold grants fire). Furthermore, any adjacent
           *    creature that attacks you with a melee attack must make a
           *    Basic Reflex saving throw or take 2d6 damage."
           *
           * GRAHAM, 2 September 2026: "Resistance halves the damage, this
           * is a core rule and thus has no value." The system already
           * implements that — damage.mjs halves once on resistance — so
           * this grants a resistance TYPE and never a number.
           *
           * THE RIDER IS THORNS WITH A PRINTED SAVE, reusing the mechanism
           * Vibrant Thorns already proved rather than growing a second one.
           */
          const offered = offeredTypes(effect);
          if (!offered.length) {
            lines.push(line(typeRefusal(effect.label || spell.name)));
            break;
          }
          const picked = await promptTypeChoice(effect.label || spell.name, offered);
          const element = chosenType(effect, picked);
          if (!element) {
            lines.push(line(typeRefusal(effect.label || spell.name)));
            break;
          }
          const resists = opposingElement(element);
          const spec = normaliseThorns({ ...effect, damageType: element });
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed shield.</em>`));
            break;
          }
          const shieldTiming = spellExpiryTiming(parsedDuration);
          const shieldFlags = { [SYSTEM_ID]: { [THORNS_FLAG]: spec } };
          if (castId) shieldFlags[SYSTEM_ID].castId = castId;
          if (shieldTiming.spellEffect) shieldFlags[SYSTEM_ID].spellEffect = true;
          if (shieldTiming.spellEffectEnd != null) shieldFlags[SYSTEM_ID].spellEffectEnd = shieldTiming.spellEffectEnd;
          if (shieldTiming.expiresRound != null) shieldFlags[SYSTEM_ID].conditionExpiresRound = shieldTiming.expiresRound;
          const shieldData = {
            name: `${spec.label} (${element})`,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            // THE RESISTANCE IS AN ORDINARY CHANGE ON THE ACTOR'S OWN
            // resistances field, so it flows through the same defence
            // resolver every other resistance does.
            changes: resists
              ? [{ key: "system.combat.resistances", mode: 2, value: resists, priority: 20 }]
              : [],
            flags: shieldFlags
          };
          if (shieldTiming.foundryDuration) {
            shieldData.duration = { ...shieldTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          for (const wearer of recipients) {
            await createEffectsOn(wearer, [shieldData]);
            if (castId && wearer.uuid) affected.add(wearer.uuid);
            lines.push(line(typeChosenLine(spec.label, element)));
            lines.push(line(`${wearer.name}: ${thornsCastLine(spec)}${durationText}.`));
            if (resists) {
              lines.push(line(`Resistance to <strong>${resists}</strong> — halved, per the core rule.`));
            }
          }
          break;
        }
        case "thorns": {
          // A RIDER ON BEING HIT. See magic/thorns.mjs — the mirror of a
          // strike rider, landing in the same function that already feeds
          // a Vicious rune's damage back into its wielder.
          // GROWN BY ITS WARP (3.613.0) — Vibrant Thorns' "+4 PP: the damage
          // increases by 1, or 1d6 after you cast an essence spell". See
          // `warpedThorns`.
          const spec = normaliseThorns(warpedThorns(effect, warpBonus));
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares malformed thorns.</em>`));
            break;
          }
          const timing = spellExpiryTiming(parsedDuration);
          const thornFlags = { [SYSTEM_ID]: { [THORNS_FLAG]: spec } };
          if (castId) thornFlags[SYSTEM_ID].castId = castId;
          if (timing.spellEffect) thornFlags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) thornFlags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) thornFlags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          const thornData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: thornFlags
          };
          if (timing.foundryDuration) {
            thornData.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          // RELAYED, NOT WRITTEN DIRECTLY (3.474.0). A player casting on another
          // player's character owns neither the actor nor its effects, and
          // Foundry refuses. `createEffectsOn` asks the GM when the target is
          // not ours — which eight other effect kinds in this file already did.
          await createEffectsOn(target, [thornData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: ${thornsCastLine(spec)}${durationText}.`));
          break;
        }
        case "seersVision": {
          /*
           * A RECORDED D20, FOR TWO SPELLS NOW (3.589.0).
           *
           * THE KIND IS NAMED AFTER ITS FIRST CUSTOMER and that is worth
           * saying plainly rather than renaming a working spell's authored
           * row for cosmetics. Embrace Destiny (page 277) prints the same
           * mechanism — "roll a d20 and record the result … use that roll
           * … using the recorded result in place of a roll" — and differs
           * in exactly one way: its list includes an ATTACK ROLL, where
           * Seer's Vision says "a non-secret saving throw or skill check".
           *
           * So the row declares what it may replace. A row that declares
           * nothing gets Seer's Vision's list, which is what the only
           * authored row in the pack before this release is.
           */
          // "ROLL A D20 AND RECORD THE RESULT." A real roll, made now and
          // shown, rather than a number the spell decides — the whole
          // spell is the gamble that it is a good one.
          const visionRoll = await new Roll("1d20").evaluate();
          rolls.push(visionRoll);
          const { recordSeersVision } = await import("./seers-vision-workflow.mjs");
          const recorded = await recordSeersVision(target, {
            value: visionRoll.total,
            casterName: caster?.name ?? "",
            // THE SPELL NAMES ITSELF, so the prompt and both cards agree.
            label: spell?.name ?? "",
            round: game.combat?.started ? Number(game.combat.round ?? 0) : null,
            // AND IT IDENTIFIES ITSELF, so recasting one spell cannot
            // cancel the other's recorded number.
            source: spell?.name ?? "",
            types: Array.isArray(effect.types) ? effect.types : null
          });
          if (!recorded) {
            lines.push(line(`<em>${spell.name} foresaw nothing usable — nothing applied.</em>`));
            break;
          }
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(seersVisionCastLine(recorded.value, target.name, recorded.types)));
          break;
        }
        case "inspireCompetence": {
          // AN AID, EARNED BY THE CAST. Graham's Aid ruling of 31 August
          // 2026: "All other characters make an EASY Skill check using
          // the Bonus Check Table. The resulting bonus is added as a
          // CIRCUMSTANCE BONUS to the lead character's check."
          //
          // NO PROMPT, unlike Counter Perform. That spell's DC belongs to
          // somebody else's spell and cannot be known; this one's is the
          // Easy DC for the ALLY'S OWN LEVEL, which the system already
          // computes — so asking would be asking for something it has.
          const castTotal = Number(rollData?.castTotal);
          const bonus = inspireCompetenceBonus(castTotal, target.system?.identity?.level ?? 0);
          const { recordInspireCompetence } = await import("./inspire-competence-workflow.mjs");
          await recordInspireCompetence(target, {
            bonus,
            casterName: caster?.name ?? "",
            round: game.combat?.started ? Number(game.combat.round ?? 0) : null
          });
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(
            `${inspireCompetenceCastLine(bonus, target.name)} `
            + `<em>(${Number.isFinite(castTotal) ? `cast ${castTotal}` : "no cast check"} `
            + `vs Aid DC ${aidDC(target.system?.identity?.level ?? 0)})</em>`));
          // NOT AUTOMATED, AND SAID SO. "There might be situations where
          // your ability to encourage your ally could interfere with the
          // skill check, such as when attempting to sneak quietly." That
          // is a judgement about fiction, and guessing which skills are
          // quiet would be a rule wearing this spell's name.
          lines.push(line(
            "<em>The GM may rule this has no effect where encouragement would interfere "
            + "— sneaking quietly, holding a disguise.</em>"));
          break;
        }
        case "counterPerform": {
          // A BONUS THAT WAITS ON A SAVE. See magic/counter-perform.mjs —
          // Cutting Words with the sign flipped, spent by the same
          // `evaluate` hook that spends the penalty.
          //
          // THE CAST'S OWN TOTAL, not its degree. The book compares the
          // Perform check against the INCOMING spell's Save DC, which is
          // a different DC from the one this cast was rolled against, so
          // the degree on this card is the wrong answer and the total is
          // the only usable input.
          const performTotal = Number(rollData?.castTotal);
          if (!Number.isFinite(performTotal)) {
            lines.push(line(`<em>${spell.name} needs a casting check to compare, and this cast rolled none.</em>`));
            break;
          }
          const { promptIncomingSaveDC, recordCounterPerform } =
            await import("./counter-perform-workflow.mjs");
          const incomingDC = await promptIncomingSaveDC(spell.name);
          if (incomingDC === null) {
            lines.push(line(`<em>No incoming Save DC was given for ${spell.name} — nothing applied.</em>`));
            break;
          }
          const bonus = counterPerformBonus(performTotal, incomingDC);
          // A BONUS OF ZERO RECORDS NOTHING. "Any negative modifier is
          // disregarded" floors the table at zero, and a stored zero would
          // sit on the ally looking like an effect, be eaten by their next
          // save, and print a line saying nothing happened.
          if (bonus > 0) {
            await recordCounterPerform(target, {
              bonus,
              casterName: caster?.name ?? "",
              round: game.combat?.started ? Number(game.combat.round ?? 0) : null
            });
            if (castId && target.uuid) affected.add(target.uuid);
          }
          // THE SKILL THAT WAS ROLLED, NOT THE ONE THE BOOK ASSUMES
          // (3.443.2). This printed "Perform" unconditionally, so a cast
          // made WITHOUT Bardic Performance — an ordinary Spellcraft roll
          // — produced a card naming a check nobody made. Found by
          // casting it in Graham's world on 31 August 2026: "Perform 10"
          // over a Spellcraft 10. The number was always the casting
          // total; only the label was wrong. Whether a Spellcraft cast
          // should earn the bonus at all is a rules question, and printing
          // the truth is what makes it visible rather than answering it.
          const castSkill = String(rollData?.castSkill ?? "").trim() || "Casting check";
          lines.push(line(
            `${counterPerformCastLine(bonus, target.name)} `
            + `<em>(${castSkill} ${performTotal} vs DC ${incomingDC})</em>`));
          break;
        }
        case "criticalInjury": {
          /*
           * A CRITICAL INJURY AS A RUNG'S OWN OUTCOME (3.611.0, block 34).
           *
           * WOEFUL DREAD (PP 18): "Success … suffering a -20 mental critical
           * injury and becoming frightened 1. Partial … a -10 mental critical
           * injury … Failure … a mental critical injury … Fumble … On a
           * successful Fortitude save, the target takes a +10 mental
           * critical injury". No damage is dealt, so neither the basic-save
           * critical nor `flatLadder` (whose rung is a damage packet) is the
           * shape; and the last of the four sits inside a follow-up save's
           * rung, where only ordinary rows can go. So it is an ordinary row,
           * gated by `onSave` like a condition, rolled at the modifier the
           * page names. `rollCriticalInjury` posts its own card.
           */
          const severity = String(effect.severity ?? "minor").trim().toLowerCase() || "minor";
          const damageType = String(effect.damageType ?? "").trim().toLowerCase();
          if (!damageType) {
            lines.push(line(`<em>${spell.name} declares a critical injury with no table.</em>`));
            break;
          }
          const modifier = Math.trunc(Number(effect.modifier) || 0);
          const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
          await rollCriticalInjury(caster, {
            targetActor: target, damageType, severity, attackBonus: 0, modifier
          });
          const at = modifier ? ` at <strong>${modifier > 0 ? "+" : ""}${modifier}</strong>` : "";
          lines.push(line(`${target.name}: a <strong>${damageType} critical injury</strong>${at} — rolled on its own card.`));
          break;
        }
        case "attitude": {
          // TWO OPERATIONS, BOTH PRINTED. `to` is the charm sentence —
          // "becomes friendly toward you; helpful if it was already
          // friendly" — which five spells share. `steps` is Tame's plain
          // one-step improvement. Declaring which is which beats guessing
          // from the presence of a number.
          const floor = String(effect.to ?? "").trim().toLowerCase();
          const steps = Number(effect.steps ?? 0);
          if (floor && !isAttitude(floor)) {
            lines.push(line(`<em>Unknown attitude "${effect.to}".</em>`));
            break;
          }
          if (!floor && !steps) {
            lines.push(line(`<em>${spell.name} declares no attitude change.</em>`));
            break;
          }
          // THE SPELL'S OWN DURATION, through the per-effect reader added
          // at 3.405.0 — Thrall prints three different lengths across its
          // degrees and each row can carry its own.
          const seconds = parsedDuration?.seconds ?? null;
          // BOTH ARE TEMPORARY. A spell wears off; only a conversation
          // (Make an Impression) changes how somebody permanently feels.
          const { charmAttitude, charmAttitudeByStep, attitudeLine } =
            await import("../attitude-workflow.mjs");
          const moved = floor
            ? await charmAttitude(target, caster?.uuid ?? "", floor, seconds)
            : await charmAttitudeByStep(target, caster?.uuid ?? "", steps, seconds);
          const said = attitudeLine(target.name, moved);
          lines.push(line(said
            ? `<em>${said}${durationText}.</em>`
            : `<em>${target.name} is already <strong>${moved.to}</strong> toward you — unchanged.</em>`));
          break;
        }
        case "healingEarth": {
          // A RECAST REVERTS THE OLD ONE — "or if you cast the spell
          // again before using it" is printed, and this is the whole of
          // it. Swept from the RECIPIENT rather than only the caster,
          // because the earth can have changed hands by now.
          const stale = existingHealingEarth(target.items ?? []);
          if (stale.length) {
            await target.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
          }
          // READ FROM THE ONE PLACE IT LIVES. This first read
          // `system.level.value ?? system.details.level` — neither of
          // which exists — so every caster resolved to 0 and the CL 5
          // bonus could never apply. See casterLevelOf.
          const casterLevel = casterLevelOf(caster?.system);
          const expiresAt = parsedDuration?.seconds != null
            ? Number(game.time?.worldTime ?? 0) + Number(parsedDuration.seconds)
            : null;
          const [made] = await target.createEmbeddedDocuments("Item", [
            healingEarthItemData({ casterLevel, expiresAt, img: spell.img })
          ]);
          if (castId && target.uuid) affected.add(target.uuid);
          const bonus = healingEarthBonus(casterLevel);
          lines.push(line(
            `${target.name}: <strong>${made?.name ?? "Healing Earth"}</strong> — usable instead of `
            + `healer's tools for Treat Wounds`
            + `${bonus ? `, and grants <strong>+${bonus} item</strong> to the Medicine check` : ""}`
            + `${stale.length ? " (the earlier earth reverted to dirt)" : ""}${durationText}.`));
          break;
        }
        case "freeWarp": {
          // HEALER'S GRACE (3.447.0): "whenever you cast a spell that
          // possesses the Healing Trait, it is considered to be warped
          // 2 PP higher at no extra PP cost."
          //
          // NOTHING NEW WAS BUILT FOR THIS. `warpFreeSchool` has carried
          // exactly this rule since Powerful Illusion at 3.332.0, and its
          // test is `spellTraits.includes(...)` — scoped by TRAIT despite
          // the name. So the spell grants the same flag the feat does,
          // and cast-workflow's free-warp channel needed no new axis.
          //
          // THE GRANT NAMES ITSELF. The channel's card note used to say
          // "Powerful Illusion" for every source, hard-coded, so a Cleric
          // would have been told a Wizard feat waived their PP.
          const trait = String(effect.trait ?? "").trim().toLowerCase();
          // WARPABLE, through the same rule every other bonus uses.
          // Healer's Grace sells "+4 PP: increase the amount warped by
          // healing spells by an additional 1 PP (max +4)", and Bless's
          // "+1 (max +4)" sets the precedent that the cap is the TOTAL
          // rather than the increase.
          const free = Math.max(0, Math.trunc(
            warpedBonusValue(Number(effect.value) || 0, warpBonus, warpBonusMax)));
          if (!trait || !free) {
            // LOUD, like the ward below: a free warp that names no trait
            // would either apply to everything or to nothing, and both
            // are worse than saying so.
            lines.push(line(`<em>${spell.name} declares a free warp with no trait or no value — nothing applied.</em>`));
            break;
          }
          const timing = spellExpiryTiming(parsedDuration);
          const flags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              warpFreeSchool: { school: trait, value: free, label: spell.name }
            }
          };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          const data = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            // NO CHANGES. The grant is a flag the cast workflow reads;
            // there is no sheet field for "your next warp is cheaper".
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(
            `${target.name}: the first <strong>${free} PP</strong> of warping on any spell with the `
            + `<strong>${trait}</strong> trait is free${durationText}.`));
          break;
        }
        case "ward": {
          // A WARD WITH A SLOT NOBODY IMPLEMENTS IS LOUD, not silent —
          // the same position `marker` takes two cases below, and for
          // the same reason: a defence nothing covers is a spell that
          // quietly protects against less than it says.
          const strayed = unknownWardSlots(effect);
          if (strayed.length) {
            lines.push(line(`<em>Unknown ward defence "${strayed.join(", ")}".</em>`));
            break;
          }
          // THE SCOPE IS THE POINT. A ward that cannot name its enemy is
          // reported rather than applied unscoped — applying it would
          // recreate Stone Shield's +4-against-everyone exactly.
          if (!hostileUuids.length) {
            lines.push(line(
              `<em>${spell.name} found no enemy to ward against — nothing applied.</em>`));
            break;
          }
          const wardValue = Number(effect.value ?? 0) + warpBonus;
          const flags = wardFlagData({
            value: wardValue,
            bonusType: effect.bonusType,
            label: effect.label || spell.name,
            sourceUuids: hostileUuids,
            slots: effect.slots
          });
          const timing = spellExpiryTiming(parsedDuration);
          const effectFlags = { [SYSTEM_ID]: { ...flags } };
          if (castId) effectFlags[SYSTEM_ID].castId = castId;
          if (timing.spellEffect) effectFlags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) effectFlags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) effectFlags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          const data = {
            name: effect.label || spell.name,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: effectFlags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
// RELAYED, NOT WRITTEN DIRECTLY (3.474.0). A player casting on another
          // player's character owns neither the actor nor its effects, and
          // Foundry refuses. `createEffectsOn` asks the GM when the target is
          // not ours — which eight other effect kinds in this file already did.
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          const wardedNames = targets
            .filter((t) => hostileUuids.includes(t?.uuid))
            .map((t) => t.name)
            .join(", ");
          const shown = `${wardValue >= 0 ? "+" : ""}${wardValue}`;
          lines.push(line(
            `${target.name}: <strong>${shown} ${effect.bonusType ?? "status"}</strong> to `
            + `${wardSlots(effect).join(", ")} against <strong>${wardedNames}</strong>`
            + ` only${durationText}.`));
          break;
        }
        case "defenceDC": {
          // A BONUS ON THE DC SOMEBODY ELSE ROLLS AGAINST (3.506.0).
          //
          // Graham's ruling of 6 Sep 2026 on Self Mirage: "Any modifiers
          // to Disguise should benefit the disguised character so the DC
          // required to pierce the disguise should be increased."
          //
          // NOT A WARD, though it files the same flag. A ward must name
          // the enemy it wards against and refuses to apply unscoped —
          // that is Stone Shield's lesson and it is right for a ward.
          // This raises a DC against ANYBODY who tries the named action,
          // which is what "the DC required to pierce the disguise"
          // means: the disguise does not know who will look at it.
          //
          // THE SCOPE IS STILL COMPULSORY. An entry naming no action
          // would raise a DC against every action resolved against it,
          // and `defence-dc.mjs` would apply it silently. Refused out
          // loud instead, the position every other kind in this file
          // takes for an effect that cannot say what it covers.
          // AND ITS CAP (3.672.0; Inner Tempest's Root, "+1 PP: increase
          // bonus by +1 (max +4)"). The warp's `bonusMax` stopped every other
          // bonus row at its printed ceiling and this one went past it.
          const built = defenceDCRowFrom(effect, spell.name, defenceDCWarpExtra(effect.value, warpBonus, warpBonusMax));
          if (built.error) {
            lines.push(line(`<em>${built.error}</em>`));
            break;
          }
          const dcRow = built.row;
          const dcKey = dcRow.dc;
          const dcValue = dcRow.value;
          const dcTiming = spellExpiryTiming(parsedDuration);
          const dcFlags = { [SYSTEM_ID]: { defenceDC: [dcRow] } };
          if (castId) dcFlags[SYSTEM_ID].castId = castId;
          if (dcTiming.spellEffect) dcFlags[SYSTEM_ID].spellEffect = true;
          if (dcTiming.spellEffectEnd != null) dcFlags[SYSTEM_ID].spellEffectEnd = dcTiming.spellEffectEnd;
          if (dcTiming.expiresRound != null) dcFlags[SYSTEM_ID].conditionExpiresRound = dcTiming.expiresRound;
          const dcData = {
            name: effect.label || spell.name,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: dcFlags
          };
          if (dcTiming.foundryDuration) {
            dcData.duration = { ...dcTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [dcData]);
          if (castId && target.uuid) affected.add(target.uuid);
          const dcShown = `${dcValue >= 0 ? "+" : ""}${dcValue}`;
          lines.push(line(
            `${target.name}: <strong>${dcShown} ${effect.bonusType ?? "status"}</strong> to the `
            + `${dcKey.replace(/^skillDC:/, "")} DC anyone rolls against to `
            + `${effect.scope || dcRow.when.actions.join(", ")}${durationText}.`));
          break;
        }
        case "hinder": {
          // THE MIRROR OF A WARD (3.415.0). A ward is carried by the
          // defender and asks who is attacking; this is carried by the
          // ATTACKER and asks who they are attacking. Enchanting
          // Utterance's "-1 to attack and damage rolls AGAINST YOU" is
          // the first. See magic/hinder.mjs.
          const strayedHinder = unknownHinderSlots(effect);
          if (strayedHinder.length) {
            lines.push(line(`<em>Unknown hindered roll "${strayedHinder.join(", ")}".</em>`));
            break;
          }
          // THE SCOPE IS THE POINT, exactly as for a ward. A hindrance
          // that cannot name the creature it bites against would
          // penalise every roll the target makes — a strictly worse
          // spell, applied silently.
          const casterUuid = caster?.uuid ?? "";
          if (!casterUuid) {
            lines.push(line(
              `<em>${spell.name} could not identify its caster — nothing applied.</em>`));
            break;
          }
          // WARPING DEEPENS A PENALTY, so it moves away from zero — the
          // same sign discipline the `bonus` branch uses for Bane.
          const hinderValue = Number(effect.value ?? 0) - warpBonus;
          const entries = hinderFlagData({
            value: hinderValue,
            bonusType: effect.bonusType,
            label: effect.label || spell.name,
            // AGAINST THE CASTER. "Against you" in a spell's text means
            // the caster, and reading it off the cast rather than the
            // target list is what keeps it to one creature.
            targetUuids: [casterUuid],
            slots: effect.slots
          });
          if (!entries.length) {
            lines.push(line(
              `<em>${spell.name} declares a hindrance that reaches nothing — nothing applied.</em>`));
            break;
          }
          // ONE SENTENCE, ONE RULE. Every entry a hindrance writes comes
          // from a single printed clause and must still say the same
          // thing — same number, same pool, same creature. Checked HERE
          // and not only in the harness, because `ward.mjs` is the
          // cautionary tale: its harness proved the two halves AGREED for
          // nine releases while one of them reached no roll at all.
          const disagreements = hinderEntriesDisagree(entries);
          if (disagreements.length) {
            lines.push(line(
              `<em>${spell.name}'s hindrance disagrees with itself (${disagreements.join("; ")}) — nothing applied.</em>`));
            break;
          }
          const hinderTiming = spellExpiryTiming(parsedDuration);
          const hinderFlags = { [SYSTEM_ID]: { conditionals: entries } };
          if (castId) hinderFlags[SYSTEM_ID].castId = castId;
          if (hinderTiming.spellEffect) hinderFlags[SYSTEM_ID].spellEffect = true;
          if (hinderTiming.spellEffectEnd != null) hinderFlags[SYSTEM_ID].spellEffectEnd = hinderTiming.spellEffectEnd;
          if (hinderTiming.expiresRound != null) hinderFlags[SYSTEM_ID].conditionExpiresRound = hinderTiming.expiresRound;
          const hinderData = {
            name: effect.label || spell.name,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: hinderFlags
          };
          if (hinderTiming.foundryDuration) {
            hinderData.duration = { ...hinderTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          // RELAYED, NOT WRITTEN DIRECTLY (3.474.0). A player casting on another
          // player's character owns neither the actor nor its effects, and
          // Foundry refuses. `createEffectsOn` asks the GM when the target is
          // not ours — which eight other effect kinds in this file already did.
          await createEffectsOn(target, [hinderData]);
          if (castId && target.uuid) affected.add(target.uuid);
          const hinderShown = `${hinderValue >= 0 ? "+" : ""}${hinderValue}`;
          lines.push(line(
            `${target.name}: <strong>${hinderShown} ${effect.bonusType ?? "circumstance"}</strong> to `
            + `${hinderSlots(effect).join(" and ")} rolls against <strong>${caster.name}</strong>`
            + ` only${durationText}.`));
          break;
        }
        case "areaRider": {
          // THE SAME SHAPE AS `hazard`, AND FOR THE SAME REASON.
          //
          // Consecrate and Desecrate write onto the Region the template
          // created, and the die is collected from there when somebody
          // is struck inside it — which may be a day later and may
          // involve nobody who was present at the cast. This applier
          // walks the creatures the spell caught, and consecrated ground
          // is not about them.
          //
          // THE CASE EXISTS SO THE KIND IS NOT UNHANDLED, exactly as the
          // hazard case below records: without it the card would print
          // 'Unhandled effect kind "areaRider"' beside a spell that
          // worked. It prints nothing of its own because the cast has
          // already said what the ground now does.
          break;
        }
        case "turnSave": {
          // ROLLED AT THE START OF EACH CREATURE'S TURN, NOT HERE (3.609.0).
          // The cast card says so once; see magic/turn-save-workflow.mjs.
          break;
        }
        case "followUpSave": {
          const { normaliseFollowUpSave, followUpOutcome, followUpLine } = await import("./follow-up-save.mjs");
          const spec = normaliseFollowUpSave(effect);
          if (!spec || !(Number(saveDC) > 0)) {
            lines.push(line(`<em>${spell.name} declares a second save it cannot roll — resolve it by hand.</em>`));
            break;
          }
          const { TRGCheck } = await import("../dice/check.mjs");
          const saveName = spec.save.charAt(0).toUpperCase() + spec.save.slice(1);
          const saveData = target.system?.combat?.saves?.[spec.save];
          const followCheck = await TRGCheck.roll({
            actor: target,
            label: `${target.name} — ${saveName} Save`,
            subtitle: `vs ${spell.name} (${spec.label}) — DC ${saveDC}`,
            type: "save",
            saveSource: spell.name,
            traits: spell.system?.traits ?? "",
            traditions: spell.system?.tradition ?? "",
            sourceUuid: caster?.uuid ?? "",
            subject: spec.save,
            dc: Number(saveDC),
            modifiers: saveData?.checkModifiers ?? [
              { label: `${saveName} save`, value: Number(saveData?.total ?? 0), type: "untyped" }
            ]
          });
          const followDegree = followCheck?.outcome?.degree?.key ?? "partial";
          const followOutcome = followUpOutcome(spec, followDegree);
          lines.push(line(followUpLine(spec, target.name, followCheck?.outcome?.degree?.label ?? followDegree,
            followCheck?.outcome?.total ?? 0, saveDC, followOutcome)));
          if (castId && target.uuid) affected.add(target.uuid);
          if (followOutcome.slays) {
            const { actorDeathState, reapDead } = await import("../combat/death-state.mjs");
            await target.toggleStatusEffect("dying", { value: actorDeathState(target) + 1 });
            const reaped = await reapDead(target, game.combat ?? null);
            if (reaped?.removed) lines.push(line("<em>Removed from the initiative order.</em>"));
            break;
          }
          if (followOutcome.rows.length) {
            // THE RUNG'S ROWS, THROUGH THE ORDINARY ENGINE, WITH THIS SAVE'S
            // DEGREE AND MARGIN — so `roundsPerMargin` measures the second
            // save, and a `conditionSave` row repeats as any other does.
            const inner = await applySpellEffects(caster, spell, {
              targets: [target],
              saveResults: [{
                target, degree: followDegree, margin: followCheck?.outcome?.margin ?? null,
                saved: Boolean(followCheck?.outcome?.degree?.success)
              }],
              saveDC, rollData, warpMods: null, lines,
              effects: followOutcome.rows.map((row) => ({ ...row, target: "targets" })),
              castId, registersCast
            });
            for (const r of inner?.rolls ?? []) rolls.push(r);
          }
          break;
        }
        case "spellTurning": {
          /*
           * THE WARD, RECORDED (3.608.0, R6). The PP it counteracts at is
           * THIS casting's, warps included — "the PP cost of this casting of
           * Spell Turning". Read by the cast workflow; see
           * magic/spell-turning.mjs.
           */
          const { SPELL_TURNING_FLAG, normaliseSpellTurning } = await import("./spell-turning.mjs");
          const tSpec = normaliseSpellTurning({ ...effect, pp: Number(rollData?.pp ?? 0) });
          if (!tSpec || !tSpec.pp) {
            lines.push(line(`<em>${spell.name} could not record its ward — no PP for the counteract check.</em>`));
            break;
          }
          const tTiming = spellExpiryTiming(parsedDuration);
          const tFlags = { [SYSTEM_ID]: { [SPELL_TURNING_FLAG]: tSpec, spellBuff: true } };
          if (castId) tFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) tFlags[SYSTEM_ID].endsWithCast = true;
          if (tTiming.spellEffect) tFlags[SYSTEM_ID].spellEffect = true;
          if (tTiming.spellEffectEnd != null) tFlags[SYSTEM_ID].spellEffectEnd = tTiming.spellEffectEnd;
          if (tTiming.expiresRound != null) tFlags[SYSTEM_ID].conditionExpiresRound = tTiming.expiresRound;
          const tData = { name: tSpec.label, img: spell.img || DEFAULT_SPELL_IMG, origin: spell.uuid, changes: [], flags: tFlags };
          if (tTiming.foundryDuration) {
            tData.duration = { ...tTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [tData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name} is warded by <strong>${tSpec.label}</strong> at ${tSpec.pp} PP${durationText}. `
            + "Each targeted spell that succeeds against them offers the reaction to turn it."));
          break;
        }
        case "spellDrain": {
          /*
           * A RUNG LEFT WAITING ON THE TARGET'S CASTING (3.608.0, R6). The
           * target's Will save has been rolled; what it earned is spent by
           * the casting this reaction was aimed at. See magic/spell-drain.mjs.
           */
          const { recordSpellDrain } = await import("./spell-drain-workflow.mjs");
          const drainRecorded = await recordSpellDrain(target, effect, caster);
          if (!drainRecorded) {
            lines.push(line(`<em>${spell.name} declares a malformed drain.</em>`));
            break;
          }
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(drainRecorded.forced
            ? `<strong>${target.name}</strong>'s casting will be drained — a ${drainRecorded.forced}`
              + `${drainRecorded.absorb ? `, its PP to ${caster?.name ?? "the drainer"}` : ""}. Resolve their spell next.`
            : `<strong>${target.name}</strong> takes ${drainRecorded.penalty} on the Spellcraft check for the spell they are casting.`));
          break;
        }
        case "versusDamage": {
          /*
           * A DAMAGE BONUS AGAINST ONE KIND OF THING (3.608.0, R8) — Smash.
           * The warp's "+1 (+5 max)" is folded in before the row is
           * normalised, so the printed cap applies to the warped total.
           */
          const { VERSUS_DAMAGE_FLAG, normaliseVersusDamage } = await import("./versus-damage.mjs");
          const vSpec = normaliseVersusDamage({
            ...effect, value: Number(effect.value ?? 0) + Number(warpMods?.bonusValue ?? 0)
          });
          if (!vSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed damage bonus.</em>`));
            break;
          }
          const vTiming = spellExpiryTiming(parsedDuration);
          const vFlags = { [SYSTEM_ID]: { [VERSUS_DAMAGE_FLAG]: { ...vSpec, castId }, spellBuff: true } };
          if (castId) vFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) vFlags[SYSTEM_ID].endsWithCast = true;
          if (vTiming.spellEffect) vFlags[SYSTEM_ID].spellEffect = true;
          if (vTiming.spellEffectEnd != null) vFlags[SYSTEM_ID].spellEffectEnd = vTiming.spellEffectEnd;
          if (vTiming.expiresRound != null) vFlags[SYSTEM_ID].conditionExpiresRound = vTiming.expiresRound;
          const vData = {
            name: vSpec.label, img: spell.img || DEFAULT_SPELL_IMG, origin: spell.uuid, changes: [], flags: vFlags
          };
          if (vTiming.foundryDuration) {
            vData.duration = { ...vTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [vData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: <strong>+${vSpec.value}</strong> ${vSpec.bonusType} to weapon damage against `
            + `${vSpec.vsTypes.join(" and ")} creatures${durationText}.`
            + (vSpec.discharge > 1 ? ` End it early on a damage roll to make that roll's bonus ×${vSpec.discharge}.` : "")));
          break;
        }
        case "spiritualWeapon": {
          /*
           * A WEAPON OF FORCE THAT STRIKES BY ITSELF (3.608.0, R8). See
           * magic/spiritual-weapon.mjs. The copy is taken from a held melee
           * weapon NOW, recorded on the caster under this cast's id, and
           * strikes the marked target at once; every Sustain strikes again.
           */
          const {
            SPIRITUAL_WEAPON_FLAG, normaliseSpiritualWeapon, spiritualRecord, spiritualSourceWeapons
          } = await import("./spiritual-weapon.mjs");
          const spec = normaliseSpiritualWeapon(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed spiritual weapon.</em>`));
            break;
          }
          const held = spiritualSourceWeapons(target.items);
          let source = held[0] ?? null;
          if (held.length > 1) {
            const { promptRiderWeapon } = await import("./strike-riders-workflow.mjs");
            const picked = await promptRiderWeapon(target, spell.name);
            source = held.find((w) => w.id === picked) ?? null;
          }
          if (!source) {
            lines.push(line(`<em>${spell.name} needs a melee weapon in hand — ${target.name} `
              + `${held.length ? "chose none" : "holds none"}, so nothing emerges.</em>`));
            break;
          }
          const record = spiritualRecord(spec, source, Number(warpMods?.bonusValue ?? 0));
          if (!record) {
            lines.push(line(`<em>${source.name} has no damage dice for ${spell.name} to copy.</em>`));
            break;
          }
          const { spellSourceTraits } = await import("./spell-source.mjs");
          record.sourceTraits = spellSourceTraits(spell);
          const sTiming = spellExpiryTiming(parsedDuration);
          const sFlags = { [SYSTEM_ID]: { [SPIRITUAL_WEAPON_FLAG]: record, spellBuff: true } };
          if (castId) sFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) sFlags[SYSTEM_ID].endsWithCast = true;
          if (sTiming.spellEffect) sFlags[SYSTEM_ID].spellEffect = true;
          if (sTiming.spellEffectEnd != null) sFlags[SYSTEM_ID].spellEffectEnd = sTiming.spellEffectEnd;
          if (sTiming.expiresRound != null) sFlags[SYSTEM_ID].conditionExpiresRound = sTiming.expiresRound;
          const sData = {
            name: `${record.label} (${record.weaponName})`,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: sFlags
          };
          if (sTiming.foundryDuration) {
            sData.duration = { ...sTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [sData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`A weapon of force emerges from ${target.name}'s <strong>${record.weaponName}</strong> `
            + `(${record.dice} ${record.damageType}, Spellcraft +${record.itemBonus} item)${durationText}. `
            + "It strikes again each time the spell is Sustained."));
          const { spiritualStrike, firstStrikeTarget } = await import("./spiritual-weapon-workflow.mjs");
          const struck = await spiritualStrike(target, record, firstStrikeTarget(target));
          lines.push(...struck.lines);
          rolls.push(...struck.rolls);
          break;
        }
        case "wearingClock": {
          /*
           * A SPELL WORN DOWN BY BLOWS (3.608.0, R8) — Stoneskin. Written
           * onto the effects THIS cast has already placed on the creature,
           * so a blow shortens exactly this casting and nothing else; the
           * row therefore comes after the rows it wears. See
           * magic/wearing-clock.mjs.
           */
          const { WEARING_CLOCK_FLAG, normaliseWearingClock } = await import("./wearing-clock.mjs");
          const spec = normaliseWearingClock(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed wearing clock.</em>`));
            break;
          }
          const mine = Array.from(target.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId);
          if (!castId || !mine.length) {
            lines.push(line(`<em>${spell.name} placed nothing on ${target.name} for blows to wear.</em>`));
            break;
          }
          for (const held of mine) {
            await held.setFlag(SYSTEM_ID, WEARING_CLOCK_FLAG, { ...effect, label: spec.label || spell.name });
          }
          const minutes = Math.round(spec.seconds / 60);
          lines.push(line(`<em>Each ${spec.on} hit on ${target.name} takes ${minutes} minute${minutes === 1 ? "" : "s"} `
            + `off ${spell.name}.</em>`));
          break;
        }
        case "zone":
          // RESOLVED BY THE SWEEP (3.608.0). Who is in the fog is a
          // membership question, answered at the cast and at every move by
          // `refreshEmanation`; placing it here too would be a second holder
          // the sweep could not lift. See magic/obscuring-zone.mjs.
          break;
        case "difficultTerrain": {
          // APPLIED TO THE REGION, NOT TO A TARGET — the same shape as
          // `hazard` below, and more literally: the movement cost IS a
          // Foundry behaviour living on the Region, so there is nothing
          // about a caught creature for this applier to do. It is written
          // in `cast-workflow` where the region is known to exist, and
          // read thereafter by Foundry's own movement code rather than by
          // anything in this system.
          //
          // THE CASE EXISTS SO THE KIND IS NOT UNHANDLED, which is the
          // lesson the hazard case records directly below. It prints
          // nothing of its own because the cast already said what the
          // ground does.
          break;
        }
        case "wall":
        case "storm":
        // AND WEB'S CHECK (3.612.0, R6): recorded on the Region by the cast
        // and rolled by the move hook. See magic/entry-check-workflow.mjs.
        case "entryCheck": {
          // ON THE REGION (3.610.0), like `hazard` below: raised, recorded and
          // announced by the cast workflow. See magic/wall-spell-workflow.mjs
          // and magic/storm-workflow.mjs.
          break;
        }
        case "hazard": {
          // APPLIED TO THE REGION, NOT TO A TARGET.
          //
          // This applier walks the creatures a spell caught; a hazard is
          // not about them at all. It is written onto the Region the
          // template created, at the point in `cast-workflow` where that
          // region is known to exist, and collected from there by the
          // `moveToken` hook when somebody walks in — which may be
          // rounds later and may be somebody who was nowhere near the
          // cast. See magic/hazard-terrain.mjs.
          //
          // THE CASE EXISTS SO THE KIND IS NOT UNHANDLED. Without it the
          // card prints 'Unhandled effect kind "hazard"' beside a spell
          // that worked perfectly — which `verify-effect-kinds-handled`
          // caught within minutes of the mechanism landing. It prints
          // nothing of its own because the cast already said what the
          // hazard does, and two lines for one fact is the defect this
          // project keeps paying to remove.
          break;
        }
        case "fall": {
          /*
           * DROPPED BY THE SPELL (3.606.0, block 32's R1).
           *
           * SNAGGING PIT, Failure: "The target falls into the pit using the
           * normal falling rules." Fumble: "…but has no time to use
           * reactions." The normal falling rules are `rollFalling`, called
           * with the pit's depth already in the field — the same shape Fly's
           * turn-end drop uses — so a GM can still reduce it for an Arrest a
           * Fall before it is rolled, which is exactly what the Fumble takes
           * away. Nobody is below: see `onto` in combat/falling-workflow.
           */
          const feet = Math.trunc(Number(effect.feet) || 0);
          if (feet <= 0) {
            lines.push(line(`<em>${spell.name} declares a fall with no depth.</em>`));
            break;
          }
          const { rollFalling } = await import("../combat/falling-workflow.mjs");
          const note = effect.noReactions
            ? `${spell.name}: no time to use reactions — no Arrest a Fall, no Catfall, no Grab an Edge. `
              + "Roll the full depth."
            : `${spell.name}: the pit is ${feet} feet deep. Reduce the distance only for a reaction `
              + "actually taken (Arrest a Fall, Catfall, Grab an Edge).";
          const fell = await rollFalling(target, { distance: feet, onto: null, note });
          lines.push(line(fell
            ? `${target.name} falls into the pit — ${fell.damage} bludgeoning damage.`
            : `<em>${target.name}'s fall was cancelled at the dialog — nothing rolled.</em>`));
          break;
        }
        case "forcedMove": {
          /*
           * MOVED BY THE SPELL (3.606.0, block 32's R1).
           *
           * STARTLE, Failure: "The target takes a forced Step action away
           * from you." A Step is one square and the page fixes the distance,
           * so the token is moved here rather than offered a button — see
           * `forceMoveAway`, which is the Shove button's own planner called
           * directly, so a wall stops a startled creature exactly where it
           * stops a shoved one.
           *
           * ONLY "AWAY" EXISTS, measured: it is the only direction any spell
           * row names. An unknown direction is refused out loud rather than
           * read as "away", because pulling a creature toward the caster is
           * a different spell.
           */
          const feet = Math.trunc(Number(effect.feet) || 0);
          if (feet <= 0 || String(effect.direction ?? "away") !== "away") {
            lines.push(line(`<em>${spell.name} declares a malformed forced move.</em>`));
            break;
          }
          const { forceMoveAway } = await import("../combat/forced-movement-workflow.mjs");
          const moved = await forceMoveAway(caster, target, feet);
          lines.push(line(`${effect.label ? `<strong>${effect.label}</strong> — ` : ""}${moved.text}`));
          break;
        }
        case "abilitySwap": {
          /*
           * THE HIGHEST AND LOWEST ABILITY SCORES SWITCHED (3.672.0; Inner
           * Tempest's Ability Inversion, C1). The totals trade through the
           * bonus pool — see magic/ability-swap.mjs. One row per save rung,
           * each with its own duration.
           */
          const {
            normaliseAbilitySwap, abilitySwapCandidates, abilitySwapChanges, abilitySwapFlag,
            abilitySwapOn, abilitySwapLine, ABILITY_SWAP_FLAG
          } = await import("./ability-swap.mjs");
          const spec = normaliseAbilitySwap(effect);
          // NOT TWICE: a second inversion would switch the switched scores.
          if (abilitySwapOn(target.effects, SYSTEM_ID)) {
            lines.push(line(`<em>${target.name}'s ability scores are already switched — ${spell.name} does not stack.</em>`));
            break;
          }
          const found = abilitySwapCandidates(target.system?.attributes);
          if (!found) {
            lines.push(line(`<em>${target.name}'s ability scores are all equal — ${spell.name} has nothing to switch.</em>`));
            break;
          }
          // "CASTERS CHOICE FOR ANY TIES": asked only when there is a tie.
          const { chooseTiedAbility } = await import("./ability-swap-workflow.mjs");
          const highKey = await chooseTiedAbility(spell.name, target.name, found.highKeys, "highest", found.high);
          const lowKey = highKey ? await chooseTiedAbility(spell.name, target.name, found.lowKeys, "lowest", found.low) : "";
          if (!highKey || !lowKey) {
            lines.push(line(`<em>No score was chosen for ${spell.name} on ${target.name} — nothing applied.</em>`));
            break;
          }
          const timing = spellExpiryTiming(parsedDuration);
          const flags = { [SYSTEM_ID]: { [ABILITY_SWAP_FLAG]: abilitySwapFlag(highKey, lowKey, found.high, found.low) } };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          const data = {
            name: spec?.label ?? spell.name,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: abilitySwapChanges(highKey, lowKey, found.high, found.low, CHANGE_TYPE.CUSTOM),
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${abilitySwapLine(target.name, highKey, lowKey, found.high, found.low)}${durationText}.`));
          break;
        }
        case "moduleMark": {
          /*
           * A MODULE'S MARK (3.672.0; C6) — Inner Tempest's Spiritual
           * Distraction and Disrupt Soul. The module's data, stamped with the
           * caster and this cast's DC, timed and ended as the spell is. See
           * magic/module-mark.mjs.
           */
          const { normaliseModuleMark, moduleMarkRecord, moduleMarkOn, moduleMarkLine } = await import("./module-mark.mjs");
          const spec = normaliseModuleMark(effect, { spellName: spell.name });
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed module mark — nothing applied.</em>`));
            break;
          }
          if (moduleMarkOn(target.effects, spec)) {
            lines.push(line(`<em>${target.name} already carries <strong>${spec.label}</strong> — it does not stack.</em>`));
            break;
          }
          const record = moduleMarkRecord({
            caster, spell, castId,
            level: rollData?.level ?? null,
            casterLevel: rollData?.casterLevel ?? null,
            // THE CAST'S OWN DC, rolled against later (B8-4). The nominal one,
            // because a spell whose save waits rolls none on casting.
            dc: Number(saveDC ?? rollData?.saveDC ?? 0) || null
          });
          const timing = spellExpiryTiming(parsedDuration);
          const flags = { [spec.module]: { [spec.key]: record }, [SYSTEM_ID]: { moduleMark: `${spec.module}.${spec.key}` } };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          // ENDS WITH THE SPELL: a sustained curse stops when it is dropped.
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          const data = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${moduleMarkLine(target.name, spec, record)}${durationText}.`));
          break;
        }
        case "marker": {
          if (!isMarkerKey(effect.marker)) {
            // LOUD, NOT SILENT. An unrecognised marker is a spell that
            // does nothing for ever with no symptom, which is the exact
            // failure the anti-silence rule exists for. verify-markers
            // makes it impossible to ship; this line is what a world
            // copy carrying a hand-edited effect hits.
            lines.push(line(`<em>Unknown marker "${effect.marker}".</em>`));
            break;
          }

          // A MARKER MAY DECLARE AN IMMUNITY, and if the target is still
          // inside one the spell does not land. Guidance is the first:
          // "The target is then temporarily immune to the spell for 1
          // hour." REFUSED OUT LOUD rather than applied and silently
          // wasted — that is the shape the component gate got wrong once
          // and cost a confusing live session.
          if (Number(MARKERS[effect.marker]?.immunitySeconds) > 0) {
            const { isTemporarilyImmune, immunityRemaining, IMMUNITY_FLAG, describeRemaining } =
              await import("../temporary-immunity.mjs");
            const record = target?.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
            const now = Number(game.time?.worldTime ?? 0);
            if (isTemporarilyImmune(record, effect.marker, now)) {
              const left = describeRemaining(immunityRemaining(record, effect.marker, now));
              lines.push(line(`<em>${target.name} is still temporarily immune to `
                + `${MARKERS[effect.marker].label}${left ? ` — ${left} left` : ""}.</em>`));
              break;
            }
          }

          // AND NOT TWICE OVER. A target already carrying an unspent
          // marker gains nothing from a second: two status bonuses of one
          // type do not stack, so the only outcomes are a wasted cast or
          // a silently replaced one.
          if (findMarker(target, effect.marker)) {
            lines.push(line(`<em>${target.name} already carries an unspent `
              + `${MARKERS[effect.marker].label}.</em>`));
            break;
          }

          const timing = spellExpiryTiming(parsedDuration);
          // THE FLAG SHAPE COMES FROM markers.mjs, never from here. See
          // `markerFlagData` for the mutation that made that necessary.
          const flags = { [SYSTEM_ID]: { spellBuff: true, ...markerFlagData(effect.marker) } };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

          const data = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(
            line(markerAppliedLine(target.name, effect.marker, durationText))
          );
          break;
        }
        // A LIGHT SOURCE ATTACHES TO THE TARGET AND MOVES WITH IT —
        // Graham's ruling, 25 August 2026, chosen over authoring a
        // Region because the thing that carries the light walks around.
        //
        // TWO HALVES, and only one of them is cosmetic. The effect
        // carries the source key, which `lightLevelForToken` reads when
        // it decides what illumination level a token is standing in —
        // that is the RULES half, and it is what makes the spell change
        // a number rather than a picture. The token's own Foundry light
        // is then configured so players can see the radius; that half is
        // presentation, and it uses a declared default radius because
        // the book prints no distance for most of these sources. See
        // DEFAULT_LIGHT_RADIUS_FT in light-sources.mjs.
        case "light": {
          if (!isLightSourceKey(effect.source)) {
            lines.push(line(`<em>Unknown light source "${effect.source}".</em>`));
            break;
          }
          const entry = lightSource(effect.source);
          const timing = spellExpiryTiming(parsedDuration);
          const flags = {
            [SYSTEM_ID]: { spellBuff: true, ...lightSourceFlagData(effect.source) }
          };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

          const data = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);

          // THE VISIBLE HALF. Failing to draw the light must not fail
          // the cast: the rules half has already landed on the actor,
          // and a scene the caster cannot write to (an unowned token, a
          // player without token permissions) is a permissions problem,
          // not a spell problem. Reported rather than swallowed.
          try {
            const { attachTokenLight } = await import("../light-attach-workflow.mjs");
            await attachTokenLight(target, effect.source);
          } catch (err) {
            console.warn(`${SYSTEM_ID} | could not draw the light for "${effect.source}"`, err);
            lines.push(line("<em>The light is in effect, but the token's own glow could not be set — a GM may need to do it.</em>"));
          }

          const reach = lightRadiusFeet(entry);
          lines.push(
            line(`${target.name} sheds <strong>${entry.label}</strong> — `
              + `+${entry.steps} illumination step${entry.steps === 1 ? "" : "s"}`
              + `${entry.cap == null ? "" : ` (max ${entry.cap})`}, ${reach} feet${durationText}.`)
          );
          break;
        }
        case "lightShift": {
          // A CIRCLE THAT MOVES THE LEVEL, not a light source. See
          // magic/light-shift.mjs for why those are different spells.
          // BY CASTER LEVEL (3.630.0) — Pillars of Faith's Sporeglow: "CL 5:
          // increase the radius to 20 feet. CL 10: the light increases
          // illumination by two steps." Each row the caster has reached
          // replaces the figures it names, in order.
          let shiftRow = effect;
          for (const step of Array.isArray(effect.byCasterLevel) ? effect.byCasterLevel : []) {
            if (casterLevelOf(caster?.system) < Number(step?.cl ?? Infinity)) continue;
            shiftRow = {
              ...shiftRow,
              ...(Number(step.radiusFeet) > 0 ? { radiusFeet: Number(step.radiusFeet) } : {}),
              ...(Number(step.steps) ? { steps: Number(step.steps) } : {})
            };
          }
          const spec = normaliseLightShift(shiftRow);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed light shift.</em>`));
            break;
          }
          const made = await createLightShiftRegion(caster, target, spell, spec, {
            castId, parsedDuration
          });
          if (!made) {
            // LOUD. A shadow nobody can see is a spell that did nothing,
            // and this one's entire effect is the circle.
            lines.push(line(`<em>${spell.name} could not draw its circle on this scene — `
              + "a GM may need to place it by hand.</em>"));
            break;
          }
          lines.push(line(lightShiftLine(spec, spell.name, target.name) + durationText));
          const dropLine = lightShiftDropLine(spec, target.name);
          if (dropLine) lines.push(line(dropLine));
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "conditional": {
          // ADVANTAGE, SCOPED TO SOMETHING. See magic/spell-conditional.mjs:
          // nothing new is invented here, because conditionals.mjs already
          // holds this rule and its collector already reads effects.
          const { normaliseConditional } = await import("../conditionals.mjs");
          const spec = normaliseSpellConditional(effect, normaliseConditional);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed conditional.</em>`));
            break;
          }

          // WARPED VALUE FOLDED IN (3.504.0). See spell-conditional.mjs:
          // without this, five already-live "+1 to the bonus" warps would
          // have gone inert the moment their spells became conditionals.
          const granted = warpedGrants(spec, warpMods, warpedBonusValue);
          const wanted = traditionCount(spec, warpMods);
          let named = [];
          if (wanted > 0) {
            const { promptTraditions } = await import("./spell-conditional-workflow.mjs");
            named = await promptTraditions(spell.name, wanted);
            for (const [i, t] of named.entries()) {
              const entry = traditionConditional(spec, t, i, normaliseConditional);
              if (entry) granted.push(entry);
            }
            const short = traditionShortfallLine(spec, wanted, named.length);
            if (short) lines.push(line(short));
          }

          if (!granted.length) {
            lines.push(line(`<em>Nothing was warded for ${spell.name} — nothing applied.</em>`));
            break;
          }

          /*
           * AGAINST THE ONE FOE THE CASTER CHOSE (3.609.0, block 33's R7).
           * True Target: "Choose a target creature as you cast the spell. The
           * first time each target makes an attack roll against that
           * creature …". The foe is the hostile creature among those the
           * caster targeted — the same disposition split Forbidding Ward's
           * "1 ally and 1 enemy" uses — and every grant is narrowed to it.
           */
          let edgeAgainst = "";
          if (effect.againstChosenFoe) {
            edgeAgainst = hostileUuids[0] ?? "";
            if (!edgeAgainst) {
              lines.push(line(`<em>${spell.name}: no hostile creature was targeted to be the foe — nothing applied.</em>`));
              break;
            }
            for (const g of granted) g.when = { ...(g.when ?? {}), targetUuids: [edgeAgainst] };
          }
          const cTiming = spellExpiryTiming(parsedDuration);
          const cFlags = { [SYSTEM_ID]: { spellBuff: true, conditionals: granted } };
          // AND WHAT THE CONDITIONAL ENGINE CANNOT CARRY (3.609.0): the
          // penalties set aside and the concealment seen through, on the same
          // effect so the one-shot spends both. See magic/strike-edge.mjs.
          if (effect.edge && typeof effect.edge === "object") {
            const { STRIKE_EDGE_FLAG } = await import("./strike-edge.mjs");
            cFlags[SYSTEM_ID][STRIKE_EDGE_FLAG] = {
              ignoreCircumstance: effect.edge.ignoreCircumstance === true,
              ignoreConcealment: effect.edge.ignoreConcealment === true,
              label: spec.label,
              targetUuid: edgeAgainst
            };
          }
          if (castId) cFlags[SYSTEM_ID].castId = castId;
          if (cTiming.spellEffect) cFlags[SYSTEM_ID].spellEffect = true;
          if (cTiming.spellEffectEnd != null) cFlags[SYSTEM_ID].spellEffectEnd = cTiming.spellEffectEnd;
          if (cTiming.expiresRound != null) cFlags[SYSTEM_ID].conditionExpiresRound = cTiming.expiresRound;
          const cData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: cFlags
          };
          if (cTiming.foundryDuration) {
            cData.duration = { ...cTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [cData]);
          if (castId && target.uuid) affected.add(target.uuid);

          lines.push(line(named.length
            ? traditionLine(target.name, named) + durationText
            : conditionalLine(target.name, granted) + durationText));
          lines.push(line(conditionalRemainderLine()));
          break;
        }
        case "spellStoring": {
          // A WINDOW, NOT AN EFFECT. See magic/spell-storing.mjs: the
          // intercept lives at the top of castSpell, and this only opens
          // the round in which the next cast is caught.
          const spec = normaliseSpellStoring(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed store.</em>`));
            break;
          }
          const {
            bondedItemFor, armStoring, clearStored, readStored
          } = await import("./spell-storing-workflow.mjs");
          const bond = bondedItemFor(target);
          if (!bond) {
            lines.push(line(noBondCastLine(spell.name)));
            break;
          }
          // "IF YOU CAST THE SPELL AGAIN THE LAST SPELL YOU STORED IS
          // DISMISSED" — the book's own sentence about casting Spell
          // Storing a second time, and the reason this is not simply an
          // overwrite when the next spell arrives.
          const already = readStored(target);
          if (already?.record?.spellName) {
            lines.push(line(displacedLine(already.record.spellName)));
            await clearStored(target);
          }
          await armStoring(target, {
            releaseCost: releaseActionCost(warpMods)
          });
          lines.push(line(armedLine(bond.name)));
          lines.push(line(spellStoringRemainderLine()));
          break;
        }
        case "delayedRespite": {
          // A BLOW THAT ARRIVES LATE. The gate is in
          // combat/dying-workflow.mjs, at the one primitive every damage
          // route crosses; this only places the effect that waits there.
          const spec = normaliseDelayedRespite(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed respite.</em>`));
            break;
          }
          const rTiming = spellExpiryTiming(parsedDuration);
          const rFlags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              // EMPTY UNTIL A BLOW ARRIVES. `respiteCatches` reads this:
              // a Respite with a packet is spent and catches no more,
              // which is "one attack, one packet".
              [RESPITE_FLAG]: { label: spec.label, packet: null }
            }
          };
          if (castId) rFlags[SYSTEM_ID].castId = castId;
          if (rTiming.spellEffect) rFlags[SYSTEM_ID].spellEffect = true;
          if (rTiming.spellEffectEnd != null) rFlags[SYSTEM_ID].spellEffectEnd = rTiming.spellEffectEnd;
          if (rTiming.expiresRound != null) rFlags[SYSTEM_ID].conditionExpiresRound = rTiming.expiresRound;
          const rData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: rFlags
          };
          if (rTiming.foundryDuration) {
            rData.duration = { ...rTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [rData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(
            `<strong>${target.name}</strong>: the next blow is held out of time${durationText}.`));
          lines.push(line(respiteRemainderLine()));
          break;
        }
        case "hideFromAnimals": {
          // A WARD THAT ENDS WHEN ITS BEARER ACTS. The ending is at two
          // gates in attack-workflow and cast-workflow; this only places
          // the effect that waits for them. See magic/hide-from-animals.mjs
          // on why the sensing half is the GM's.
          const spec = normaliseHideFromAnimals(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed ward.</em>`));
            break;
          }
          const hTiming = spellExpiryTiming(parsedDuration);
          const hFlags = {
            [SYSTEM_ID]: { spellBuff: true, [HIDE_FLAG]: { label: spec.label } }
          };
          if (castId) hFlags[SYSTEM_ID].castId = castId;
          if (hTiming.spellEffect) hFlags[SYSTEM_ID].spellEffect = true;
          if (hTiming.spellEffectEnd != null) hFlags[SYSTEM_ID].spellEffectEnd = hTiming.spellEffectEnd;
          if (hTiming.expiresRound != null) hFlags[SYSTEM_ID].conditionExpiresRound = hTiming.expiresRound;
          const hData = {
            // THE UNAUTOMATED HALF IS IN THE NAME, the shape
            // difficult-terrain.mjs settled — this is where a GM looking
            // at the token's effects will read it.
            name: hideEffectName(spec),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: hFlags
          };
          if (hTiming.foundryDuration) {
            hData.duration = { ...hTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [hData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(hidePlacedLine(target.name, durationText)));
          lines.push(line(hideRemainderLine()));
          break;
        }
        case "spellArmour": {
          /*
           * MAGE ARMOUR IS ARMOUR (3.617.2; Graham's MA1–MA4). Base DR,
           * raised by the warp, scaled by the caster's BSB (+1 multiplier
           * step at CL 6), with an HP pool (+20 at CL 4) that absorbs what
           * it stops — the Bracers' channel. See magic/spell-armour.mjs.
           * The state rides on the spell's own effect, so it ends with the
           * spell; a fresh casting replaces the last.
           */
          const { normaliseSpellArmour, spellArmourAtCast, SPELL_ARMOUR_FLAG } = await import("./spell-armour.mjs");
          const armourSpec = normaliseSpellArmour(effect);
          if (!armourSpec) {
            lines.push(line(`<em>${spell.name} declares malformed spell armour.</em>`));
            break;
          }
          const armour = spellArmourAtCast(armourSpec, {
            casterLevel: Number(rollData?.casterLevel ?? casterLevelOf(caster?.system)) || 0,
            bsb: casterBSB(caster),
            warpMods: warpMods ?? {}
          });
          const stale = Array.from(target.effects ?? [])
            .filter((e) => e.getFlag?.(SYSTEM_ID, SPELL_ARMOUR_FLAG)?.spellName === spell.name)
            .map((e) => e.id);
          if (stale.length) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
          const timing = spellExpiryTiming(parsedDuration);
          const flags = { [SYSTEM_ID]: {
            spellBuff: true,
            [SPELL_ARMOUR_FLAG]: { ...armour, spellName: spell.name }
          } };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;
          const data = {
            name: spell.name,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            description: `Armour Base DR ${armour.baseDR} (BSB ${armour.bsb}${armour.multiplierBonus ? `, multiplier +${armour.multiplierBonus}` : ""}), `
              + `${armour.max} HP${armour.cr ? `, CR ${armour.cr}` : ""}${armour.rigid ? ", rigid for injury purposes" : ""}.`,
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);
          const { drMultiplier } = await import("../combat/damage.mjs");
          const shown = armour.baseDR * (drMultiplier(armour.bsb) + armour.multiplierBonus);
          lines.push(line(`${target.name}: <strong>${armourSpec.label}</strong> — Armour DR ${shown} `
            + `(base ${armour.baseDR} × ${drMultiplier(armour.bsb) + armour.multiplierBonus} for BSB ${armour.bsb}`
            + `${armour.multiplierBonus ? ` and caster level` : ""}), ${armour.max} HP`
            + `${armour.cr ? `, CR ${armour.cr}` : ""}${armour.rigid ? ", rigid" : ""}${durationText}. `
            + "<em>The higher of it and worn armour applies.</em>"));
          break;
        }
        case "spellShield": {
          /*
           * A SHIELD THE SPELL MAKES (3.542.0).
           *
           * Shield's Shield Block was a sentence in a `note` and nothing
           * else: `shieldBlockEligibility` asks for an equipped ITEM, so
           * a caster running Shield was told "no shield is equipped".
           * See magic/spell-shield.mjs — the DR is "1 + BSB" and scales
           * with the caster, which is why it cannot be a conjured item.
           *
           * THE FLAG CARRIES THE WARP MODS, not the finished number. BSB
           * can change between the cast and the block — a level, a feat,
           * a Song — and storing the total would freeze the shield at
           * what the caster was worth when they raised it.
           */
          const shieldSpec = normaliseSpellShield(effect);
          if (!shieldSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed spell shield.</em>`));
            break;
          }
          const held = target.getFlag(SYSTEM_ID, SPELL_SHIELD_FLAG) ?? [];
          const entry = {
            castId: castId ?? null,
            spell: spell.name,
            effect: { ...shieldSpec, kind: "spellShield" },
            warpMods: { bonusValue: warpMods?.bonusValue ?? 0, bonusMax: warpMods?.bonusMax ?? 0 }
          };
          await target.setFlag(SYSTEM_ID, SPELL_SHIELD_FLAG,
            [...(Array.isArray(held) ? held : []).filter((h) => h?.castId !== entry.castId), entry]);
          if (castId && target.uuid) affected.add(target.uuid);
          const shownDR = spellShieldDR({
            baseDR: shieldSpec.baseDR, bsb: casterBSB(target), warpMods: entry.warpMods
          });
          lines.push(line(`${target.name}: <strong>${shieldSpec.label}</strong> — Shield Block `
            + `with DR ${shownDR} (base ${shieldSpec.baseDR} + BSB)${durationText}.`));
          break;
        }
        case "sacrificingShield": {
          // A WOUND TAKEN IN SOMEBODY ELSE'S PLACE. The gate is in
          // combat/dying-workflow.mjs, at the same primitive Delayed
          // Respite uses; this only places the ward that waits there.
          const spec = normaliseSacrificingShield(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed shield.</em>`));
            break;
          }
          // THE CASTER IS STAMPED ON THE WARD, not looked up later. A
          // ward is the only effect in the system that has to reach a
          // SECOND creature when it fires, and "whoever cast this" is not
          // a question an ActiveEffect can answer on its own.
          const sAmount = shieldAmount(warpMods);
          // A DECLARED MOD, NOT THE WARP'S TEXT (3.499.1). See
          // spell-warp.mjs: `warpMods.applied` never existed, so the
          // clause this prints was bought and never said. Caught live on
          // 5 September 2026 — the card named the warp and the remainder
          // line went on claiming conditions were nobody's to move.
          const sConditions = Boolean(warpMods?.absorbConditions);
          const sTiming = spellExpiryTiming(parsedDuration);
          const sFlags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              [SHIELD_FLAG]: {
                label: spec.label,
                amount: sAmount,
                casterUuid: caster?.uuid ?? "",
                conditions: sConditions
              }
            }
          };
          if (castId) sFlags[SYSTEM_ID].castId = castId;
          if (sTiming.spellEffect) sFlags[SYSTEM_ID].spellEffect = true;
          if (sTiming.spellEffectEnd != null) sFlags[SYSTEM_ID].spellEffectEnd = sTiming.spellEffectEnd;
          if (sTiming.expiresRound != null) sFlags[SYSTEM_ID].conditionExpiresRound = sTiming.expiresRound;
          const sData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: sFlags
          };
          if (sTiming.foundryDuration) {
            sData.duration = { ...sTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [sData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(shieldPlacedLine(target.name, sAmount, durationText)));
          lines.push(line(shieldRemainderLine(sConditions)));
          break;
        }
        case "wildMorph": {
          // A SPELL THAT GROWS YOU A WEAPON. See magic/wild-morph.mjs for
          // what a Studied Target actually is, and why that decided the
          // whole design.
          const spec = normaliseWildMorph(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed morph.</em>`));
            break;
          }
          const { promptMorphSource, promptMorphForm } = await import("./wild-morph-workflow.mjs");
          const source = await promptMorphSource(target, spell.name);
          if (!source) {
            // TWO REASONS REACH HERE — nothing studied, or the picker
            // cancelled — and they are different problems. The first is
            // one the player can fix and the line says how.
            const { getStudiedTargets } = await import("../study-target-workflow.mjs");
            lines.push(line(getStudiedTargets(target).length
              ? `<em>No Studied Target was chosen for ${spell.name} — nothing was grown.</em>`
              : noStudiedTargetLine(spell.name)));
            break;
          }

          /*
           * THE TWO "INSTEAD" WARPS (3.614.0, Graham's R15). A movement type
           * is a speed the creature gains — the `speedGrant` shape, an ability
           * item deriving it — taken from the studied target where it
           * resolves. A special ability could be anything in the Codex, so
           * the card says what was bought and the GM settles it.
           */
          if (warpMods?.morphAbility) {
            lines.push(line(`<strong>${target.name}</strong> takes a special ability from <strong>${source.name}</strong> `
              + `instead of an attack form${durationText} — the GM settles which, and applies it at the table.`));
            break;
          }
          if (warpMods?.morphMovement) {
            const { promptMorphMovement } = await import("./wild-morph-workflow.mjs");
            const move = await promptMorphMovement(spell.name, source.name, source.actor);
            if (!move) {
              lines.push(line(`<em>No movement was chosen for ${spell.name} — nothing was granted.</em>`));
              break;
            }
            const [madeMove] = await target.createEmbeddedDocuments("Item", [{
              name: `${spell.name} — ${move.key} (${source.name})`,
              type: "ability",
              img: spell.img || DEFAULT_SPELL_IMG,
              system: { description: `A ${move.key} Speed of ${move.feet} feet, taken from ${source.name}. Granted by ${spell.name}.` },
              flags: { [SYSTEM_ID]: { spellItem: true, creatureAbility: { derives: { movement: { key: move.key, feet: move.feet, orLand: false } } }, ...(castId ? { castId } : {}) } }
            }]);
            const mvTiming = spellExpiryTiming(parsedDuration);
            const mvFlags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: madeMove ? [madeMove.id] : [] } };
            if (castId) mvFlags[SYSTEM_ID].castId = castId;
            if (mvTiming.spellEffect) mvFlags[SYSTEM_ID].spellEffect = true;
            if (mvTiming.spellEffectEnd != null) mvFlags[SYSTEM_ID].spellEffectEnd = mvTiming.spellEffectEnd;
            if (mvTiming.expiresRound != null) mvFlags[SYSTEM_ID].conditionExpiresRound = mvTiming.expiresRound;
            await createEffectsOn(target, [{ name: spec.label, img: spell.img || DEFAULT_SPELL_IMG, origin: spell.uuid, changes: [], flags: mvFlags }]);
            if (castId && target.uuid) affected.add(target.uuid);
            lines.push(line(`<strong>${target.name}</strong> gains a <strong>${move.key} Speed of ${move.feet} feet</strong> from ${source.name}${durationText}.`));
            break;
          }

          // THE WARPED COUNT, capped at the printed "max 3" inside the
          // pure module rather than here.
          const wanted = normaliseWildMorph({
            ...effect,
            forms: Number(effect.forms ?? 1) + Number(warpMods?.morphForms ?? 0)
          }).forms;

          const grown = [];
          for (let i = 0; i < wanted; i += 1) {
            const form = await promptMorphForm(spell.name, source.name, source.actor);
            if (!form) break;
            grown.push(form);
          }
          if (!grown.length) {
            lines.push(line(`<em>No form was described for ${spell.name} — nothing was grown.</em>`));
            break;
          }

          const mTiming = spellExpiryTiming(parsedDuration);
          // THE ITEMS, STAMPED SO THE SPELL CAN TAKE THEM AWAY. See
          // removeSpellItemsByCastId — an item is removed only if it says
          // it ends with the spell, so Bless Water's flask is untouched.
          await target.createEmbeddedDocuments("Item",
            // A MORPH'S STRIKES ARE MAGICAL (3.622.0; Graham's R11 of block
            // 39): "Any strikes granted by a morph effect are magical", so
            // they overcome magical damage reduction.
            grown.map((f) => {
              const data = morphAttackData(f, source.name, castId);
              if (morphStrikeIsMagical(spell.system?.traits ?? "")) data.flags["trg-prime"].magicalStrike = true;
              return data;
            }));

          // AND AN EFFECT TO CARRY THE DURATION. The items have no clock
          // of their own; this is what the world-time sweep expires, and
          // deleting it is what removes them.
          const mFlags = { [SYSTEM_ID]: { spellBuff: true } };
          if (castId) mFlags[SYSTEM_ID].castId = castId;
          if (mTiming.spellEffect) mFlags[SYSTEM_ID].spellEffect = true;
          if (mTiming.spellEffectEnd != null) mFlags[SYSTEM_ID].spellEffectEnd = mTiming.spellEffectEnd;
          if (mTiming.expiresRound != null) mFlags[SYSTEM_ID].conditionExpiresRound = mTiming.expiresRound;
          const mData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: mFlags
          };
          if (mTiming.foundryDuration) {
            mData.duration = { ...mTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [mData]);
          if (castId && target.uuid) affected.add(target.uuid);

          lines.push(line(
            wildMorphLine(target.name, grown.map((f) => f.name), source.name) + durationText));
          lines.push(line(wildMorphRemainderLine()));
          break;
        }
        case "weaponDamageBonus": {
          // THE WEAPON'S OWN DAMAGE MADE BIGGER — not a second packet.
          // See magic/weapon-damage-bonus.mjs for why this is not a strike
          // rider, and for the ruling behind the flat +2.
          //
          // THE WARPS ARE FOLDED IN BEFORE THE ROW IS NORMALISED, so the
          // printed "max +4" is applied to the warped total rather than
          // to the base — which is the only place that cap belongs. Both
          // of this spell's warps carried `mods: {}` and bought nothing
          // until 3.493.0: the same inert-warp shape Bless and Bane's
          // freeze-membership option had before 3.426.0.
          const spec = normaliseWeaponDamageBonus({
            ...effect,
            value: Number(effect.value ?? 0) + Number(warpMods?.weaponDamageBonus ?? 0),
            weapons: Math.max(
              Number(effect.weapons ?? 1) || 1,
              Number(warpMods?.weapons ?? 0) || 0
            )
          });
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed weapon bonus.</em>`));
            break;
          }
          // ONE PROMPT PER WEAPON THE CASTING PAID FOR. Gravity Weapon's
          // +1 PP warp buys a second, and this is the same prompt the
          // strike riders use — so "which weapon" is answered one way in
          // this system rather than two.
          const { promptRiderWeapon } = await import("./strike-riders-workflow.mjs");
          const chosen = [];
          for (let i = 0; i < spec.weapons; i += 1) {
            const id = await promptRiderWeapon(target, spell.name);
            if (!id || chosen.includes(id)) break;
            chosen.push(id);
          }
          if (!chosen.length) {
            lines.push(line(
              `<em>No weapon was chosen for ${spell.name} on ${target.name} — nothing applied.</em>`));
            break;
          }
          spec.weaponIds = chosen;

          const wTiming = spellExpiryTiming(parsedDuration);
          const wFlags = { [SYSTEM_ID]: { [WEAPON_DAMAGE_BONUS_FLAG]: spec, spellBuff: true } };
          if (castId) wFlags[SYSTEM_ID].castId = castId;
          if (wTiming.spellEffect) wFlags[SYSTEM_ID].spellEffect = true;
          if (wTiming.spellEffectEnd != null) wFlags[SYSTEM_ID].spellEffectEnd = wTiming.spellEffectEnd;
          if (wTiming.expiresRound != null) wFlags[SYSTEM_ID].conditionExpiresRound = wTiming.expiresRound;
          const wData = {
            name: spec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: wFlags
          };
          if (wTiming.foundryDuration) {
            wData.duration = { ...wTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [wData]);
          if (castId && target.uuid) affected.add(target.uuid);

          const names = chosen.map((id) => target.items?.get?.(id)?.name).filter(Boolean);
          lines.push(line(weaponDamageBonusLine(spec, target.name, names) + durationText));
          const short = weaponDamageShortfallLine(spec, chosen.length);
          if (short) lines.push(line(short));
          break;
        }
        case "itemQuality": {
          /*
           * AN ITEM MADE BETTER FOR A WHILE (3.591.0, Masterwork Item).
           *
           * `QUALITY_TIERS` has implemented expert/master/legendary for
           * months \u2014 the level delta, the item bonus, the per-die
           * weapon damage, the armour ACP and Dex cap, the shield DR.
           * The spell had no row and both its warps were inert.
           *
           * THE SAME WEAPON PROMPT the riders, Gravity Weapon, Abjurers
           * Strike and Keen Edge use, so "which item does this spell go
           * on" is answered one way in this system rather than five.
           * That prompt offers EQUIPPED weapons, which is narrower than
           * "any object" \u2014 said on the card rather than silently
           * assumed, since the page allows tools and armour too.
           */
          const {
            normaliseItemQuality, qualityGrantFor, itemQualityLine
          } = await import("./item-quality-grant.mjs");
          const qSpec = normaliseItemQuality(effect, warpMods);
          if (!qSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed item quality.</em>`));
            break;
          }
          const { promptRiderWeapon: promptQualityItem } = await import("./strike-riders-workflow.mjs");
          const qItemId = await promptQualityItem(target, spell.name);
          if (!qItemId) {
            lines.push(line(
              `<em>No item was chosen for ${spell.name} on ${target.name} &mdash; nothing applied.</em>`));
            break;
          }
          const qItem = target.items?.get?.(qItemId) ?? null;
          const grant = qualityGrantFor(qSpec, qItem?.system?.quality);
          if (!grant.raised) {
            lines.push(line(itemQualityLine(grant, qItem?.name ?? "the item")));
            break;
          }
          /*
           * THE OLD TIER TRAVELS WITH THE GRANT, because the spell ends.
           * Reading the item's tier back at expiry would find the
           * spell's own and leave it there for good \u2014 the fault the
           * conjured weapon's clock was added to prevent.
           */
          await qItem.update({ "system.quality": grant.quality });
          const qTiming = spellExpiryTiming(parsedDuration);
          const qFlags = { [SYSTEM_ID]: { spellBuff: true,
            itemQuality: { itemId: qItemId, from: grant.from, to: grant.quality } } };
          if (castId) qFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) qFlags[SYSTEM_ID].endsWithCast = true;
          if (qTiming.spellEffect) qFlags[SYSTEM_ID].spellEffect = true;
          if (qTiming.spellEffectEnd != null) qFlags[SYSTEM_ID].spellEffectEnd = qTiming.spellEffectEnd;
          if (qTiming.expiresRound != null) qFlags[SYSTEM_ID].conditionExpiresRound = qTiming.expiresRound;
          const qData = {
            name: effectName(spell.name, effect.note, ` \u2014 ${qItem.name}`),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: qFlags
          };
          if (qTiming.foundryDuration) {
            qData.duration = { ...qTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [qData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(itemQualityLine(grant, qItem.name, durationText)));
          break;
        }
        case "healingRate": {
          /*
           * FAST HEALING OR REGENERATION, FOR A DURATION (3.591.0,
           * Metabolism). See magic/healing-rate.mjs for why the row
           * names which rate: they are the same sentence for hit points
           * and six times apart for injuries.
           *
           * THE WHOLE MECHANISM IS THE FLAG. `documents/combat.mjs`
           * sums it at the start of a turn and `injury-workflow.mjs`
           * reads it against the Injured condition on its own cadence,
           * so there is nothing to write into `changes` \u2014 and an
           * effect with an empty changes array is exactly right here,
           * rather than the "looks applied and does nothing" shape it
           * usually signals.
           */
          const { normaliseHealingRate, healingRateLine, healingRateName } =
            await import("./healing-rate.mjs");
          /*
           * THE WARP'S SHARE, FOLDED IN BEFORE VALIDATION (3.594.0) —
           * the order `weaponDamageBonus` and the resource drain both
           * take, so a warped row is checked exactly as an authored one
           * is. Rapid Repair raises a rate it already grants; Regenerate
           * grants one only if the option is bought.
           */
          const rateBump = Math.max(0, Number(warpMods?.healingRateBump ?? 0));
          const rateCap = Math.max(0, Number(warpMods?.healingRateMax ?? 0));
          const rateRaw = Math.max(0, Number(effect.value ?? 0)) + rateBump;
          const rateSpec = normaliseHealingRate({
            ...effect,
            value: rateCap > 0 ? Math.min(rateRaw, rateCap) : rateRaw
          });
          if (!rateSpec) {
            /*
             * A ROW THAT EXISTS TO BE SWITCHED ON IS NOT MALFORMED WHEN
             * NOBODY SWITCHED IT ON. Regenerate's base text grants no
             * healing at all — the rate is a +1 PP option — so an
             * unbought row resolving to zero is a choice the caster made,
             * and announcing it as a fault on every cast would train
             * readers to ignore the one message that means something.
             *
             * `fromWarp` is what tells the two apart. Without it, zero is
             * still a malformed row and still says so.
             */
            if (!effect.fromWarp) {
              lines.push(line(`<em>${spell.name} declares a malformed healing rate.</em>`));
            }
            break;
          }
          const hrTiming = spellExpiryTiming(parsedDuration);
          const hrFlags = { [SYSTEM_ID]: { spellBuff: true, [rateSpec.rate]: rateSpec.value } };
          if (castId) hrFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) hrFlags[SYSTEM_ID].endsWithCast = true;
          if (hrTiming.spellEffect) hrFlags[SYSTEM_ID].spellEffect = true;
          if (hrTiming.spellEffectEnd != null) hrFlags[SYSTEM_ID].spellEffectEnd = hrTiming.spellEffectEnd;
          if (hrTiming.expiresRound != null) hrFlags[SYSTEM_ID].conditionExpiresRound = hrTiming.expiresRound;
          const hrData = {
            name: effectName(spell.name, effect.note,
              ` \u2014 ${healingRateName(rateSpec.rate)} ${rateSpec.value}`),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: hrFlags
          };
          if (hrTiming.foundryDuration) {
            hrData.duration = { ...hrTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [hrData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(healingRateLine(rateSpec, target.name, durationText)));
          break;
        }
        case "weaponTrait": {
          /*
           * A TRAIT PUT ON A WEAPON (3.590.0, page 285's Keen Edge).
           *
           * NOT the `trait` kind, which is the polymorph channel and
           * writes onto the CREATURE \u2014 see magic/weapon-trait.mjs for
           * the three readers Keen actually has and why all of them ask
           * about the weapon.
           *
           * THE SAME WEAPON PROMPT the riders, Gravity Weapon and
           * Abjurers Strike use, so "which weapon does this spell go on"
           * is answered one way in this system rather than four.
           */
          const { normaliseWeaponTrait, unreadableWeaponTraits, WEAPON_TRAIT_FLAG, weaponTraitLine } =
            await import("./weapon-trait.mjs");
          const traitSpec = normaliseWeaponTrait(effect);
          if (!traitSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed weapon trait.</em>`));
            break;
          }
          // LOUD, like an unknown ward slot. A trait nothing reads is a
          // spell that announces its whole mechanism and changes no roll.
          const strayTraits = unreadableWeaponTraits(traitSpec);
          if (strayTraits.length) {
            lines.push(line(`<em>${spell.name} grants "${strayTraits.join(", ")}" to a weapon, `
              + "and nothing in this system reads that on a weapon &mdash; nothing applied.</em>"));
            break;
          }
          const { promptRiderWeapon: promptTraitWeapon } = await import("./strike-riders-workflow.mjs");
          const traitWeapons = [];
          for (let i = 0; i < traitSpec.weapons; i += 1) {
            const id = await promptTraitWeapon(target, spell.name);
            if (!id || traitWeapons.includes(id)) break;
            traitWeapons.push(id);
          }
          if (!traitWeapons.length) {
            lines.push(line(
              `<em>No weapon was chosen for ${spell.name} on ${target.name} &mdash; nothing applied.</em>`));
            break;
          }
          traitSpec.weaponIds = traitWeapons;
          const wtTiming = spellExpiryTiming(parsedDuration);
          const wtFlags = { [SYSTEM_ID]: { [WEAPON_TRAIT_FLAG]: traitSpec, spellBuff: true } };
          if (castId) wtFlags[SYSTEM_ID].castId = castId;
          if (wtTiming.spellEffect) wtFlags[SYSTEM_ID].spellEffect = true;
          if (wtTiming.spellEffectEnd != null) wtFlags[SYSTEM_ID].spellEffectEnd = wtTiming.spellEffectEnd;
          if (wtTiming.expiresRound != null) wtFlags[SYSTEM_ID].conditionExpiresRound = wtTiming.expiresRound;
          const wtData = {
            name: traitSpec.label || spell.name,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: wtFlags
          };
          if (wtTiming.foundryDuration) {
            wtData.duration = { ...wtTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [wtData]);
          if (castId && target.uuid) affected.add(target.uuid);
          const wtNames = traitWeapons.map((id) => target.items?.get?.(id)?.name).filter(Boolean);
          lines.push(line(weaponTraitLine(traitSpec, target.name, wtNames) + durationText + "."));
          break;
        }
        case "defencePierce": {
          /*
           * A WEAPON THAT IGNORES PART OF WHAT DEFENDS AGAINST IT
           * (3.585.0, page 248's Abjurers Strike). See
           * magic/defence-pierce.mjs for why "unarmoured" and "ignores
           * magical bonuses to DB" are one defence slot rather than two
           * invented booleans.
           *
           * THE SAME WEAPON PROMPT the riders and Gravity Weapon use, so
           * "which weapon does this spell go on" is answered one way in
           * this system rather than three.
           */
          const pierceSpec = normaliseDefencePierce(effect);
          if (!pierceSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed defence pierce.</em>`));
            break;
          }
          const { promptRiderWeapon } = await import("./strike-riders-workflow.mjs");
          const pierceWeapon = await promptRiderWeapon(target, spell.name);
          if (!pierceWeapon) {
            lines.push(line(
              `<em>No weapon was chosen for ${spell.name} on ${target.name} — nothing applied.</em>`));
            break;
          }
          pierceSpec.weaponIds = [pierceWeapon];

          const pTiming = spellExpiryTiming(parsedDuration);
          const pFlags = { [SYSTEM_ID]: { [DEFENCE_PIERCE_FLAG]: pierceSpec, spellBuff: true } };
          if (castId) pFlags[SYSTEM_ID].castId = castId;
          if (pTiming.spellEffect) pFlags[SYSTEM_ID].spellEffect = true;
          if (pTiming.spellEffectEnd != null) pFlags[SYSTEM_ID].spellEffectEnd = pTiming.spellEffectEnd;
          if (pTiming.expiresRound != null) pFlags[SYSTEM_ID].conditionExpiresRound = pTiming.expiresRound;
          const pData = {
            name: pierceSpec.label,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: pFlags
          };
          if (pTiming.foundryDuration) {
            pData.duration = { ...pTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [pData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(
            `<strong>${target.items?.get?.(pierceWeapon)?.name ?? "The weapon"}</strong> treats all targets `
            + `as unarmoured and ignores magical bonuses to Defence Bonus${durationText}.`));
          break;
        }
        case "dcThreshold": {
          // A NUMBER SOMEBODY ELSE ROLLS AGAINST. See magic/dc-threshold.mjs
          // for why this is neither a condition nor a marker.
          const spec = normaliseDCThreshold(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed DC threshold.</em>`));
            break;
          }
          const spellDC = Number(rollData?.saveDC ?? 0) || 0;
          if (!spellDC) {
            // LOUD. The DC is the whole effect, and publishing a zero
            // would be a threshold everybody beats without noticing it
            // was ever there.
            lines.push(line(`<em>${spell.name} publishes a ${spec.check} DC, but this cast has `
              + "no spell DC to publish — nothing was applied.</em>"));
            break;
          }
          const dc = thresholdDC(spec, spellDC);
          const timing = spellExpiryTiming(parsedDuration);
          const flags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              // READ BY A PERSON, NOT BY A RULE — and STORED rather than
              // recomputed, for the reason `emanation.saveDC` records: a
              // caster since weakened does not lower a standing DC.
              dcThreshold: {
                check: spec.check, dc, withinFeet: spec.withinFeet, text: spec.text
              }
            }
          };
          if (timing.spellEffect) flags[SYSTEM_ID].spellEffect = true;
          if (timing.spellEffectEnd != null) flags[SYSTEM_ID].spellEffectEnd = timing.spellEffectEnd;
          if (timing.expiresRound != null) flags[SYSTEM_ID].conditionExpiresRound = timing.expiresRound;
          if (castId) flags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) flags[SYSTEM_ID].endsWithCast = true;

          const data = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags
          };
          if (timing.foundryDuration) {
            data.duration = { ...timing.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [data]);
          if (castId && target.uuid) affected.add(target.uuid);

          lines.push(line(thresholdLine(spec, spell.name, target.name, dc) + durationText));
          const remainder = thresholdRemainderLine(spec);
          if (remainder) lines.push(line(remainder));
          break;
        }
        case "condition": {
          const cond = CONDITIONS[effect.condition];
          if (!cond) {
            lines.push(line(`<em>Unknown condition "${effect.condition}".</em>`));
            break;
          }
          /*
           * A VALUE MAY BE ROLLED (3.589.0). Enervation's line is "1d8
           * recurring essence damage" on a success and 4d8 on a fumble —
           * dice, not a printed number, and `Number("1d8")` is NaN. The
           * roll happens here and the TOTAL becomes the condition's
           * value, because that is what the end-of-turn clock reads: one
           * number per round, not a formula it re-rolls.
           */
          let conditionValue = cond.valued ? Number(effect.value ?? 1) : null;
          if (cond.valued && effect.formula) {
            const rolled = await new Roll(String(effect.formula)).evaluate();
            rolls.push(rolled);
            conditionValue = Math.max(0, rolled.total);
          }
          /*
           * OR SCALED BY HOW BADLY THE SAVE WAS MISSED (3.591.0).
           *
           * NIGHTMARE: "awakens fatigued 1 per point of failure (max 5)".
           * The sibling of `roundsPerMargin`, which 3.590.0 built for
           * Holy Shout \u2014 same margin, same floor, a different unit and
           * a printed ceiling. See magic/condition-timing-rules.mjs.
           *
           * REFUSED RATHER THAN GUESSED when there is no margin to
           * measure, and SAID: falling back to the authored value would
           * give the condition a size the page never granted it, which
           * is the quiet half of the same defect.
           */
          if (cond.valued && effect.valuePerMargin) {
            const mine = (Array.isArray(saveResults) ? saveResults : [])
              .find((r) => r?.target === target);
            const scaled = valueFromMargin(
              mine?.margin ?? null, effect.valuePerMargin, effect.valueMax ?? 0);
            if (scaled === null) {
              lines.push(line(
                `<em>${spell.name}: no save margin to scale ${cond.label} from — `
                + `applied at ${conditionValue}.</em>`));
            } else {
              conditionValue = scaled;
            }
          }
          // AND GROWN BY A WARP (3.611.0) — Waves Of Fatigue's "+1 fatigue
          // (max 5)", Cloud Mind's "Dazed by 1 (max 5)". See
          // magic/condition-warp.mjs.
          if (cond.valued) conditionValue = warpedConditionValue(conditionValue, warpMods, effect);
          const tag = {
            key: effect.condition,
            label: cond.label,
            value: conditionValue,
            /*
             * AND RECURRING DAMAGE CARRIES ITS TYPE. Without this the
             * actor defaults it to FIRE — deliberately, so automation
             * never produces an untyped recurring effect — and an
             * essence line would have burned its targets for the whole
             * encounter under the wrong element.
             */
            ...(effect.damageType ? { damageType: String(effect.damageType) } : {}),
            // PAST AN IMMUNITY, when the page says so (3.609.0 — Turn
            // Undead's "even if such creatures are normally immune").
            ...(effect.ignoreImmunity === true ? { ignoreImmunity: true } : {}),
            // ENDING WITH ANOTHER CONDITION (3.613.0, R13) — Sickly Ray's
            // "slowed 1 as long as it's sickened". The clock the critical
            // tables already use; see combat/linked-conditions-workflow.mjs.
            ...(effect.endsWith ? { endsWith: String(effect.endsWith).trim() } : {}),
            // WHAT QUICKENED'S POINT MAY BUY (3.648.0): "The individual effect
            // that renders you quickened will outline the specific actions
            // that this bonus AP can be used for." The row may say; otherwise
            // the spell's own name is looked up (Haste, Speed, Swift Sonata,
            // Channel The Aspect), so a copy already on a sheet is covered.
            ...(effect.condition === "quickened"
              ? { apFor: Array.isArray(effect.apFor) ? effect.apFor : (quickenedActionsFor(spell?.name) ?? "any") }
              : {})
          };
          /*
           * HOW LONG, WHEN THE PAGE DOES NOT GIVE A PLAIN NUMBER
           * (3.590.0). Two shapes, both from pages 281-290, and both
           * previously unsayable — see magic/condition-timing-rules.mjs.
           *
           * BOTH PRODUCE A DURATION STRING and go back through
           * `parseSpellDuration`, which is the one reader that decides
           * what a duration means. Computing rounds here would be a
           * second answer to that question.
           */
          let conditionDuration = parsedDuration;
          let conditionDurationText = durationText;

          const rolledSpec = parseRolledDuration(effect.durationRoll);
          if (effect.durationRoll && !rolledSpec) {
            lines.push(line(`<em>${spell.name} declares an unreadable rolled duration "${effect.durationRoll}".</em>`));
          } else if (rolledSpec) {
            const durRoll = await new Roll(rolledSpec.formula).evaluate();
            rolls.push(durRoll);
            const said = rolledDurationText(durRoll.total, rolledSpec.unit);
            conditionDuration = parseSpellDuration(said);
            conditionDurationText = ` (${said})`;
          } else if (effect.roundsPerMargin) {
            /*
             * "1 ROUND PER 2 FAILURE" — Holy Shout, the only spell in the
             * Grimoire that scales a duration by how badly the save was
             * missed. The margin is already on the save result; it has
             * been since saves were built, and nothing had needed it.
             */
            const mine = (Array.isArray(saveResults) ? saveResults : [])
              .find((r) => r?.target === target);
            const rounds = roundsFromMargin(mine?.margin ?? null, effect.roundsPerMargin);
            if (rounds === null) {
              // AN UNMEASURED MARGIN IS SAID, NOT GUESSED AT. A silent
              // fallback to the spell's own duration would give this
              // condition a length the page never granted it.
              lines.push(line(
                `<em>${spell.name}: no save margin to scale ${cond.label} from — applied with the spell's own duration.</em>`));
            } else {
              const said = marginDurationText(rounds);
              conditionDuration = parseSpellDuration(said);
              conditionDurationText = ` (${said})`;
            }
          }

          /*
           * A STEP DOWN, AND NO REACTIONS (3.630.0) — Pillars of Faith's Writ
           * of Restraint: "Slowed 2 until the end of its next turn, then
           * Slowed 1 for the remainder of the duration, and cannot use
           * Reactions." The first value is held for `firstRounds` (default
           * 1) and then the core's follow-on queue puts `thenValue` in its
           * place for what is left, carrying the escape save and the
           * no-Reactions flag across. Out of combat there are no rounds to
           * count, so the first value simply stands.
           */
          const resaveModFor = () => Math.trunc(Number(effect.conditionSave?.modifier) || 0) + Math.trunc(Number(warpMods?.resaveModifier) || 0);
          if (Number(effect.thenValue) > 0 && game.combat?.started) {
            const firstRounds = Math.max(1, Math.trunc(Number(effect.firstRounds) || 1));
            const totalSeconds = Number(conditionDuration?.seconds) || 0;
            tag.expiresRound = Number(game.combat.round ?? 0) + firstRounds;
            const carry = {};
            if (effect.noReactions) carry.fumbleNoReactions = true;
            if (effect.conditionSave) {
              carry.conditionSave = {
                ...effect.conditionSave, condition: effect.condition,
                label: effect.conditionSave.label || spell.name, saveDC: Number(saveDC ?? 0) || 0,
                ...(resaveModFor() ? { modifier: resaveModFor() } : {})
              };
            }
            tag.followOn = {
              tags: [{ key: effect.condition, label: cond.label, value: Math.trunc(Number(effect.thenValue)) }],
              rounds: null,
              seconds: totalSeconds ? Math.max(6, totalSeconds - 6 * firstRounds) : null,
              ...(Object.keys(carry).length ? { carry } : {})
            };
          }
          const timing = spellExpiryTiming(conditionDuration);
          const applied = await applyConditionTags(target, [tag], {
            expiresRound: timing.expiresRound,
            duration: timing.foundryDuration,
            spellEffect: timing.spellEffect,
            spellEffectEnd: timing.spellEffectEnd,
            castId,
            // THE SPELL'S TRAITS RIDE THE CONDITION (3.613.0, R14), so a
            // counteract scoped to "emotion effects" can find it later.
            sourceTraits: traitList(spell?.system?.traits)
          });
          if (castId && target.uuid) affected.add(target.uuid);
          // HELD UNTIL IT ESCAPES (3.609.0, R1 — Volcanic Inferno's rock).
          // Only a condition THIS cast put there is stamped; one the creature
          // already had stays when it climbs out. See magic/encase.mjs.
          if (effect.escape && Number(saveDC) > 0) {
            const fresh = (applied ?? []).filter((a) => a && !a.immune && !a.wasAlreadyPresent).map((a) => a.key);
            await stampEscapable(target, Array.from(target.effects ?? [])
              .filter((e) => fresh.some((key) => e.statuses?.has?.(key))), saveDC, spell.name);
          }
          /*
           * HELD, NOT COUNTED DOWN (3.609.1, the 3.609.0 live test's F4).
           * Vision Of Havoc's "stunned 1 for up to a minute": an ordinary
           * stun is spent at the start of the creature's turn, so the minute
           * and the Will save to end it never mattered. A `hold` row stamps
           * the value the turn tracker must not go below while this effect
           * stands; the save, or the clock, is what ends it.
           */
          if (effect.hold) {
            const holdAt = Math.max(1, Math.trunc(Number(effect.value) || 1));
            for (const e of Array.from(target.effects ?? []).filter((x) => x.statuses?.has?.(effect.condition))) {
              await e.setFlag(SYSTEM_ID, "conditionHold", holdAt).catch(() => {});
            }
          }
          /*
           * A CONDITION YOU CAN SAVE OUT OF (3.590.0, R2). Stamped onto
           * the effect `applyConditionTags` just created, so it dies with
           * the condition — a Dispel that removes the paralysis must not
           * leave a creature rolling every turn to escape something it
           * no longer has. See magic/condition-save.mjs.
           */
          // NO REACTIONS WHILE IT LASTS (3.630.0) — the flag the reaction gate
          // already reads, stamped on the condition so it ends with it.
          if (effect.noReactions) {
            for (const e of Array.from(target.effects ?? []).filter((x) => !x.disabled && x.statuses?.has?.(effect.condition))) {
              await e.setFlag(SYSTEM_ID, "fumbleNoReactions", true).catch(() => {});
            }
          }
          if (effect.conditionSave) {
            const { recordConditionSave } = await import("./condition-save-workflow.mjs");
            const resaveMod = resaveModFor();
            const stamped = await recordConditionSave(target, {
              ...effect.conditionSave,
              ...(resaveMod ? { modifier: resaveMod } : {}),
              condition: effect.condition,
              label: effect.conditionSave.label || spell.name,
              saveDC: Number(saveDC ?? 0) || 0
            });
            if (!stamped) {
              lines.push(line(`<em>${spell.name} declares an escape save that could not be recorded.</em>`));
            }
          }
          /*
           * AND A SAVE OWED WHEN IT ENDS (3.606.0). Speed's quickened carries
           * the Will save its ending costs — see magic/end-save.mjs. Stamped
           * on the same effect, so every way the spell can end owes it.
           */
          if (effect.endSave) {
            const { recordEndSave } = await import("./end-save-workflow.mjs");
            const stamped = await recordEndSave(target, {
              ...effect.endSave,
              label: effect.endSave.label || spell.name,
              saveDC: Number(saveDC ?? rollData?.saveDC ?? 0) || 0
            }, { on: effect.condition, castId });
            if (!stamped) {
              lines.push(line(`<em>${spell.name} declares a save at its end that could not be recorded.</em>`));
            } else {
              // "Will", NOT "will" (3.608.0) — the stored key is lower case
              // and the card printed it as it was stored.
              const saveWord = String(stamped.save ?? "").charAt(0).toUpperCase() + String(stamped.save ?? "").slice(1);
              lines.push(line(`<em>${target.name} owes a ${saveWord} save (DC ${stamped.saveDC ?? "?"}) `
                + `when ${spell.name} ends.</em>`));
            }
          }
          lines.push(line(`${target.name}: ${formatAppliedTags(applied)}${conditionDurationText}.`));
          break;
        }
        case "bonus": {
          /*
           * A SLOT CHOSEN AT CAST TIME (3.507.0). See magic/slot-choice.mjs.
           *
           * Resistance: "a +1 resistance bonus to any ONE of its saving
           * throws (selected when casting)". The row names a list rather
           * than a slot, so the slot is settled here and the ordinary
           * bonus path below does the rest — one bonus per chosen slot,
           * through the same applier, with the same warp arithmetic.
           *
           * NOT A NEW EFFECT KIND, because it is not a new effect: it is a
           * bonus that does not know its slot yet. A `chooseSlot` kind
           * would have needed its own applier, its own card line and its
           * own refusal branch, all duplicating this case.
           */
          const choice = withRankedSkills(normaliseSlotChoice(effect), caster?.system?.skills);
          if (choice) {
            const { count, prompt } = slotChoiceCount(choice, warpMods);
            const { promptSlotChoice } = await import("./slot-choice-workflow.mjs");
            // ASKED ONCE PER CAST (3.611.0). "Selected when casting" is one
            // choice; Wits warped to six targets asked it six times.
            if (prompt && !castChoices.has(`slot:${effects.indexOf(effect)}`)) {
              castChoices.set(`slot:${effects.indexOf(effect)}`,
                await promptSlotChoice(spell.name, choice.options, count, slotChoiceWords(choice.chooseFrom)));
            }
            const picked = prompt
              ? castChoices.get(`slot:${effects.indexOf(effect)}`)
              : choice.options.slice(0, count);
            const rows = slotChoiceRows(choice, picked, warpMods, warpedBonusValue);
            if (!rows.length) {
              // SAID ONCE, not once per recipient (3.611.1, G4).
              if (!castChoices.has(`slotSaid:${effects.indexOf(effect)}`)) {
                castChoices.set(`slotSaid:${effects.indexOf(effect)}`, true);
                lines.push(line(slotChoiceEmptyLine(spell.name, choice.chooseFrom)));
              }
              break;
            }
            for (const row of rows) {
              const res = await applyBonusEffect(
                target, spell, row, parsedDuration, castId, casterOpposes, registersCast);
              if (res && res.applied === false) {
                lines.push(line(
                  `<em>${target.name}: ${res.reason ?? "the bonus could not be applied"} — nothing applied.</em>`));
                continue;
              }
              if (castId && target.uuid) affected.add(target.uuid);
              const sh = `${row.value >= 0 ? "+" : ""}${row.value}`;
              lines.push(line(
                `${target.name}: <strong>${sh} ${bonusDescription(row)}</strong>${durationText}.`));
            }
            const chosenLine = slotChoiceLine(
              spell.name, rows.map((r) => r.slot), { warped: Boolean(warpMods?.allSlots) });
            // ONCE PER CAST (3.611.1, G4 of the 3.611.0 drive): Wits warped to
            // a radius printed "Wits covers Charisma." for every creature.
            if (chosenLine && !castChoices.has(`slotSaid:${effects.indexOf(effect)}`)) {
              castChoices.set(`slotSaid:${effects.indexOf(effect)}`, true);
              lines.push(line(chosenLine));
            }
            break;
          }

          // Warping raises a bonus's magnitude (Aid +1→+2) up to its cap. A
          // penalty is stored as a negative value (Bane -1); warp it away from
          // zero and clamp its magnitude so the sign is preserved.
          // THE ARITHMETIC MOVED TO spell-warp.mjs AT 3.446.1, unchanged,
          // because a live emanation needs the same answer and was
          // getting the unwarped pack row instead.
          const value = warpedBonusValue(Number(effect.value) || 0, warpBonus, warpBonusMax);
          const bonusResult = await applyBonusEffect(
            target, spell, { ...effect, value }, parsedDuration, castId, casterOpposes, registersCast);
          // THE CARD MUST NOT ANNOUNCE WHAT DID NOT HAPPEN.
          //
          // 3.411.1 taught the applier to refuse a slot it cannot place,
          // and the live pass then showed the caller printing
          // "+10 status bonus to speed" anyway — nothing was applied and
          // the card said it was. A refusal nobody reads is the
          // anti-silence rule inverted: not a missing line, a false one.
          if (bonusResult && bonusResult.applied === false) {
            lines.push(line(
              `<em>${target.name}: ${bonusResult.reason ?? "the bonus could not be applied"} — nothing applied.</em>`));
            break;
          }
          if (castId && target.uuid) affected.add(target.uuid);
          // THE SPEED HALF OF AN ENCASEMENT (3.609.0). The bonus this cast just
          // wrote is the effect carrying this cast's id and no condition.
          if (effect.escape && Number(saveDC) > 0 && castId) {
            await stampEscapable(target, Array.from(target.effects ?? [])
              .filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId && !(e.statuses?.size)), saveDC, spell.name);
          }
          const shown = `${value >= 0 ? "+" : ""}${value}`;
          lines.push(
            line(
              `${target.name}: <strong>${shown} ${bonusDescription({ ...effect, value })}</strong>${warpBonus ? " (warped)" : ""}${effect.note ? ` ${effect.note}` : ""}${durationText}.`
            )
          );
          break;
        }
        case "defence": {
          /*
           * A WARP THAT WIDENS A RESISTANCE (3.608.0, R8). Stoneskin's "+4
           * PP: the resistance applies to adamantine damage as well" — the
           * printed "physical (adamantine)" becomes plain "physical". A
           * replacement VALUE rather than an arithmetic, because what
           * changes is which blows the resistance answers to.
           */
          let warpedDefence = effect.field === "resistance" && warpMods?.defenceValue
            ? { ...effect, value: String(warpMods.defenceValue) }
            : effect;
          /*
           * A TYPE CHOSEN AT THE CAST, AND A RESISTANCE THAT BECOMES AN
           * IMMUNITY (3.611.0, R3 of block 34). Element Ward: "You gain
           * resistance acid, cold, electricity, or fire damage from the
           * triggering effect (choose one type)", and "+8 PP: you instead
           * gain immunity". `valueChoices` is the printed list; the field
           * swap is a state the warp sets. See magic/defence-choice.mjs.
           */
          const choices = defenceValueChoices(effect);
          if (choices.length) {
            if (!castChoices.has(effect)) {
              const { promptDefenceChoice } = await import("./defence-choice-workflow.mjs");
              castChoices.set(effect, await promptDefenceChoice(spell.name, choices, effect.field));
            }
            warpedDefence = { ...warpedDefence, value: castChoices.get(effect) };
          }
          if (warpMods?.defenceField && effect.field === "resistance") {
            warpedDefence = { ...warpedDefence, field: String(warpMods.defenceField) };
          }
          const described = await applyDefenceEffect(target, spell, warpedDefence, parsedDuration, castId, registersCast);
          if (castId && target.uuid) affected.add(target.uuid);
          if (described) {
            lines.push(line(`${target.name}: <strong>${described}</strong>${durationText}.`));
            break;
          }
          /*
           * A MALFORMED DEFENCE ROW USED TO SAY NOTHING AT ALL (3.590.0).
           *
           * `applyDefenceEffect` returns null for a row naming a field
           * that is not one of the three -- immunity, resistance,
           * weakness -- and this case then fell through to `break` with
           * no line pushed. Nothing applied, nothing said: the silent
           * nothing this applier refuses everywhere else. Every sibling
           * case announces its own malformed row ("declares a malformed
           * conjured item", "a malformed triggered strike"); this one
           * did not, and was the only kind that could fail invisibly.
           *
           * FOUND BY WRITING ONE. Iron Body was authored an hour before
           * this with `field: "dr"`, which is a real pool but not a
           * defence field, and the cast printed a clean card with the DR
           * silently absent. The row is now a `bonus` and this case can
           * no longer hide the next one.
           */
          lines.push(line(
            `<em>${spell.name} declares a defence of "${effect.field ?? "(none)"}", `
            + `which is not one of immunity, resistance or weakness &mdash; nothing applied.</em>`));
          break;
        }
        case "spell": {
          const result = await applyGrantedSpellEffect(
            target, spell, effect, parsedDuration, castId,
            { pp: rollData?.pp, saveDC: rollData?.saveDC }, registersCast
          );
          if (castId && target.uuid) affected.add(target.uuid);
          if (result?.label) {
            lines.push(line(`${target.name} gains <strong>${result.label}</strong>${durationText}.`));
          } else if (result?.note) {
            lines.push(line(`<em>${result.note}</em>`));
          }
          break;
        }
        // A SENSE GRANTED FOR THE DURATION — Detect Life, Detect Undead.
        // Its range is not stored anywhere: `senseRangeFeet` derives it
        // from the bearer's Wisdom, so a wiser caster gets a longer one
        // and nothing here has to know the numbers.
        case "sense": {
          const result = await applySenseEffect(target, spell, effect, parsedDuration, castId, registersCast);
          if (castId && target.uuid) affected.add(target.uuid);
          if (result?.label) {
            lines.push(line(`${target.name} gains <strong>${result.label}</strong>${durationText}.`));
            if (result.detail) lines.push(line(`<em>${result.detail}</em>`));
          } else if (result?.note) {
            lines.push(line(`<em>${result.note}</em>`));
          }
          break;
        }
        // A SPELL THAT PERFORMS A BASIC ACTION with a substituted check.
        // Tanglefoot is the only one in the book: "Use your Spellcraft
        // result at -4 to perform a grapple action against the target."
        //
        // THE ACTION'S OWN DATA DOES THE WORK. What it rolls against and
        // what each degree applies are read from the action tables, so
        // this case knows nothing about grabbing — and Graham's
        // correction to grapple's critical outcome, made in August
        // against a typo in the printed book, reaches this spell without
        // anyone remembering that it should.
        case "lash": {
          // TANGLING CREEPERS' VINE AGAIN (3.609.0, R10): a button on the card,
          // pressed once a round as a 1 AP attack action. See
          // magic/vine-lash-workflow.mjs.
          lines.push(`<p style="margin:2px 0"><button type="button" data-action="vineLash" class="gold-button small-button" `
            + `data-caster-uuid="${caster?.uuid ?? ""}" data-spell-name="${spell.name}">`
            + `Lash with a vine (1 AP) — Grapple your target with Spellcraft</button></p>`);
          break;
        }
        case "maneuver": {
          const { TRGCheck } = await import("../dice/check.mjs");
          const { spellManeuverModifiers, spellManeuverEffects } =
            await import("./spell-maneuver.mjs");
          const { applyBasicActionConditionEffects } =
            await import("../combat/basic-action-conditions.mjs");

          /*
           * WHICH MANEUVER (3.608.0, R5). A row that offers several —
           * Spectral Grasp's Disarm, Grapple, Shove or Trip — asks once per
           * target; a row with one takes it, as Tanglefoot always has. See
           * `maneuverChoices` in spell-maneuver.mjs.
           */
          const { maneuverChoices, maneuverOutcomeText, maneuverPushFeet } = await import("./spell-maneuver.mjs");
          const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
          const offered = maneuverChoices(effect);
          let actionKey = offered[0] ?? "";
          if (offered.length > 1) {
            const labelOf = (key) => BASIC_ACTIONS.find((a) => a.key === key)?.name?.replace(/ Attack$/, "") ?? key;
            const picked = await foundry.applications.api.DialogV2.wait({
              window: { title: `${spell.name} — ${target.name}` },
              classes: ["trg-prime"],
              content: `<div class="trg-prime trg-check-dialog"><p>Which maneuver do the limbs make against `
                + `<strong>${target.name}</strong>? Spellcraft ${Number(effect.penalty ?? 0) || 0}.</p></div>`,
              buttons: offered.map((key) => ({ action: key, label: labelOf(key) })),
              rejectClose: false
            });
            if (!picked || !offered.includes(picked)) {
              lines.push(line(`<em>${spell.name}: no maneuver chosen against ${target.name} — nothing happens.</em>`));
              break;
            }
            actionKey = picked;
          }
          const actionData = BASIC_ACTIONS.find((a) => a.key === actionKey) ?? null;
          const modifiers = [
            ...(caster.system?.magic?.spellcraft?.checkModifiers ?? [{
              label: "Spellcraft",
              value: Number(caster.system?.magic?.spellcraft?.total ?? 0),
              type: "untyped"
            }]),
            ...spellManeuverModifiers({
              actionKey,
              spellPenalty: Number(effect.penalty ?? 0),
              actorSize: caster.system?.identity?.size,
              targetSize: target.system?.identity?.size,
              label: spell.name
            })
          ];

          // AGAINST THE ACTION'S OWN DC, named in the action data rather
          // than assumed here. Grapple rolls against Fortitude; a spell
          // that later borrowed Shove or Trip would read theirs.
          // AND NOW EACH ACTION'S OWN (3.608.0): Disarm reads the Attack DC,
          // Trip the better of Acrobatics and Fortitude. Grapple still reads
          // Fortitude, so Tanglefoot rolls against exactly what it did.
          const { actionTargetDC } = await import("../combat/action.mjs");
          const dc = actionData?.against
            ? actionTargetDC(actionData.against, target.system ?? null).dc
            : Number(target.system?.combat?.saves?.fortitude?.dc ?? 0) || null;

          const check = await TRGCheck.roll({
            actor: caster,
            type: "spellcraft",
            subject: "spellcraft",
            label: `${spell.name} — ${target.name}`,
            dc
          , modifiers });
          const degree = check?.outcome?.degree?.key ?? "";

          // "The effects of the spell end at the beginning of your next
          // turn." Stamped as a round so the combat tracker clears it,
          // the same expiry every other action outcome uses.
          //
          // A CHOSEN MANEUVER KEEPS THE ACTION'S OWN CLOCK (3.608.0).
          // Spectral Grasp prints no ending of its own, so a grab lasts as
          // the Grapple action says ("until the end of your next turn") and
          // a trip leaves the target prone until it stands — read from the
          // outcome text exactly as the action workflow reads it.
          const outcomeText = offered.length > 1 ? maneuverOutcomeText(actionData, degree) : "";
          let expiresRound = game.combat?.started
            ? Number(game.combat.round ?? 0) + 1
            : null;
          if (offered.length > 1) {
            const { extractDurationRounds } = await import("./effect-duration.mjs");
            const rounds = extractDurationRounds(outcomeText);
            expiresRound = rounds && game.combat?.started ? Number(game.combat.round ?? 0) + rounds : null;
          }
          const applied = spellManeuverEffects(actionKey, degree);
          await applyBasicActionConditionEffects(applied, caster, target, { expiresRound, actionKey });
          if (castId && target.uuid) affected.add(target.uuid);
          // WHAT FOLLOWS THE ROLL, said after the line that reports it.
          const after = [];
          const pushFeet = maneuverPushFeet(actionKey, degree);
          if (pushFeet) {
            const { forceMoveAway } = await import("../combat/forced-movement-workflow.mjs");
            const moved = await forceMoveAway(caster, target, pushFeet);
            after.push(line(`<em>${moved.text}</em>`));
          }
          if (outcomeText && actionKey === "disarmAttack") {
            after.push(line(`<em>${actionData?.name ?? "Disarm"}: ${outcomeText}</em>`));
          }

          lines.push(line(
            `${target.name}${offered.length > 1 ? ` (${actionData?.name ?? actionKey})` : ""}: <strong>${degree || "no result"}</strong>`
            + (applied.length
              ? ` — ${applied.map((e) => `${e.active ? "" : "no longer "}${e.conditionKey}`).join(", ")}.`
              // A PUSH OR A DISARM IS AN EFFECT (3.608.2). The 3.608.1 drive
              // printed "heroic — no effect." above "ZZ Bare is pushed 10 ft".
              : after.length ? "." : " — no effect.")
          ));
          lines.push(...after);
          break;
        }
        case "trait": {
          const result = await applyTraitEffect(target, spell, effect, parsedDuration, castId, picks.picked, registersCast);
          if (castId && target.uuid) affected.add(target.uuid);
          if (result?.label) {
            lines.push(line(`${target.name} gains the <strong>${result.label}</strong> traits${durationText}.`));
          }
          break;
        }
        case "attack": {
          const result = await applyAttackEffect(target, spell, effect, parsedDuration, castId, registersCast);
          if (castId && target.uuid) affected.add(target.uuid);
          if (result?.label) {
            lines.push(line(`${target.name} gains <strong>${result.label}</strong>${durationText}.`));
          } else if (result?.note) {
            lines.push(line(`<em>${result.note}</em>`));
          }
          break;
        }
        // A PER-TURN EVENT IS NOT RESOLVED AT THE CAST. It happens to
        // whoever begins a turn inside the area, so the turn-start pass
        // in documents/combat.mjs owns it and there is nothing to do
        // here. Falling through to the default printed `Unhandled effect
        // kind "perTurn"` ONCE PER CREATURE CAUGHT — three lines on
        // Luminance's first card telling the table the spell was broken
        // while the machinery behind it was merely elsewhere.
        case "speedGrant": {
          /*
           * A SPEED THE CREATURE DOES NOT HAVE (3.589.0, R6).
           *
           * Fly and Earth Glide. Built as an ABILITY ITEM carrying
           * `creatureAbility.derives.movement`, which is the same shape
           * the `sense` kind uses and which `resolveMovement` reads
           * during derivation. Not because a bonus row cannot give a fly
           * total — it can, measured live in Graham's world — but
           * because "equal to its land Speed or 20 feet, whichever is
           * greater" is not a number a bonus could carry. See
           * combat/granted-speeds.mjs for the claim I withdrew.
           */
          const { normaliseGrantedSpeed, grantedSpeedLine } =
            await import("../combat/granted-speeds.mjs");
          const { SPEED_KEYS } = await import("../combat/speed-pool.mjs");
          // THE WARP RAISES THE PRINTED FEET, folded in before validation
          // so a warped grant is checked exactly as an authored one is —
          // the same order `warpedSuppression` takes, for the same reason.
          const grantFeet = warpedBonusValue(
            Number(effect.feet) || 0, warpBonus, warpBonusMax);
          const grant = normaliseGrantedSpeed({ ...effect, feet: grantFeet }, SPEED_KEYS);
          if (!grant) {
            lines.push(line(`<em>${spell.name} declares a malformed speed grant.</em>`));
            break;
          }
          const gsName = effectName(spell.name, effect.note);
          const [madeSpeed] = await target.createEmbeddedDocuments("Item", [{
            name: gsName,
            type: "ability",
            img: spell.img || DEFAULT_SPELL_IMG,
            system: {
              description: grant.landFraction
                ? `A ${grant.key} Speed equal to ${grant.landFraction === 0.5 ? "half" : `${grant.landFraction} of`} this creature's land Speed. Granted by ${spell.name}.`
                : grant.orLand
                ? `A ${grant.key} Speed equal to this creature's land Speed, or ${grant.feet} feet, whichever is greater. Granted by ${spell.name}.`
                : `A ${grant.key} Speed of ${grant.feet} feet. Granted by ${spell.name}.`
            },
            flags: {
              [SYSTEM_ID]: {
                spellItem: true,
                creatureAbility: { derives: { movement: grant } },
                ...(castId ? { castId } : {})
              }
            }
          }]);
          if (!madeSpeed) {
            lines.push(line(`<em>${target.name} could not be given a ${grant.key} Speed — nothing applied.</em>`));
            break;
          }
          // THE SAME `grantedItems` LIFECYCLE the sense and ability grants
          // use, so the spell takes the speed back when it ends.
          const gsTiming = spellExpiryTiming(parsedDuration);
          const gsFlags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [madeSpeed.id] } };
          if (gsTiming.spellEffect) gsFlags[SYSTEM_ID].spellEffect = true;
          if (gsTiming.spellEffectEnd != null) gsFlags[SYSTEM_ID].spellEffectEnd = gsTiming.spellEffectEnd;
          if (gsTiming.expiresRound != null) gsFlags[SYSTEM_ID].conditionExpiresRound = gsTiming.expiresRound;
          if (castId) gsFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) gsFlags[SYSTEM_ID].endsWithCast = true;
          const gsData = {
            name: gsName,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: gsFlags
          };
          if (gsTiming.foundryDuration) {
            gsData.duration = { ...gsTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [gsData]);
          if (castId && target.uuid) affected.add(target.uuid);
          // READ BACK RATHER THAN RECOMPUTED, so the number the player is
          // told is the one the sheet will show them — the same reason
          // applySenseEffect reads its range back.
          const shownFeet = Number(
            target.system?.combat?.movement?.[grant.key]?.total ?? 0) || grant.feet;
          lines.push(line(
            `${grantedSpeedLine(target.name, grant, shownFeet)}${durationText}.`));
          break;
        }
        /*
         * A FORM'S OWN SPEEDS AND ITS SIZE (3.595.0, R2 and R3).
         *
         * BOTH ARE OVERRIDES CARRIED ON AN EFFECT, not items and not
         * bonuses: a form REPLACES a figure the character already has, and
         * neither an ability item (a floor) nor a typed bonus (an addition)
         * can lower one. See magic/speed-set.mjs and magic/size-step.mjs.
         *
         * THE SAME CLOCK AS EVERY OTHER ROW, so the character's own Speed
         * and size come back when the form ends, without a sweeper knowing
         * these kinds exist.
         */
        case "speedSet": {
          /*
           * AN ABILITY ITEM, LIKE A GRANTED SPEED (3.595.1) — not an
           * ActiveEffect change. A change writing into the movement pool
           * can be aborted by a stale bare-number change on the same node,
           * and an exception in effect application takes the whole
           * preparation with it. Measured in Graham's world on the first
           * cast of this spell: see magic/speed-set.mjs.
           */
          const { normaliseSpeedSet, speedSetDerive, speedSetLine } =
            await import("./speed-set.mjs");
          const { SET_SPEED_PATH } = await import("../combat/granted-speeds.mjs");
          const set = normaliseSpeedSet(effect);
          const derive = speedSetDerive(effect);
          if (!set || !derive) {
            lines.push(line(`<em>${spell.name} declares a malformed speed.</em>`));
            break;
          }
          const ssName = effectName(spell.name, effect.note);
          const [madeSet] = await target.createEmbeddedDocuments("Item", [{
            name: ssName,
            type: "ability",
            img: spell.img || DEFAULT_SPELL_IMG,
            system: {
              description: set.feet === 0 && set.key === "land"
                ? `No land Speed while ${spell.name} lasts.`
                : `A ${set.key === "land" ? "" : `${set.key} `}Speed of ${set.feet} feet, in place `
                  + `of this creature's own, while ${spell.name} lasts.`
            },
            flags: {
              [SYSTEM_ID]: {
                spellItem: true,
                creatureAbility: { derives: { [SET_SPEED_PATH]: derive } },
                ...(castId ? { castId } : {})
              }
            }
          }]);
          if (!madeSet) {
            lines.push(line(`<em>${target.name}'s ${set.key} Speed could not be replaced — nothing applied.</em>`));
            break;
          }
          // THE SAME `grantedItems` LIFECYCLE the granted speed uses, so the
          // character's own Speed comes back when the form ends.
          await createEffectsOn(target, [overrideEffectData({
            name: ssName, spell, changes: [], parsedDuration, castId, registersCast,
            grantedItems: [madeSet.id]
          })]);
          if (castId && target.uuid) affected.add(target.uuid);
          // READ BACK, like the speed GRANT above and for the same reason:
          // the number the card gives is the one the sheet will show.
          //
          // THROUGH `speedValue`, NOT `Number()` (verify-speed-pool J2). A
          // movement pool is an object, and a reader that coerces one gets
          // NaN the day it is handed the pool instead of the total — which is
          // the defect that made the pooling necessary in the first place.
          const { speedValue } = await import("../combat/speed-pool.mjs");
          const shownSet = speedValue(target.system?.combat?.movement?.[set.key]) || set.feet;
          lines.push(line(speedSetLine(target.name, set, shownSet) + durationText));
          break;
        }
        case "sizeStep": {
          const { sizeStepChange, sizeStepLine, sizeStepRefusedLine, sizeStepTarget } =
            await import("./size-step.mjs");
          const from = String(target.system?.identity?.size ?? "").trim().toLowerCase();
          /*
           * A ROW WITH A CEILING (3.608.0, R4) — Size Alteration. The step
           * count comes from the creature's size and the two warps; see
           * `boundedSizeSteps`. A row without `largestAffected` is a Shape
           * form's own step and takes its number as written.
           */
          let steps = Math.trunc(Number(effect.steps) || 0);
          if (effect.largestAffected) {
            const { boundedSizeSteps, boundedSizeRefusedLine } = await import("./size-step.mjs");
            const bounded = boundedSizeSteps(from, effect, {
              reach: Number(warpMods?.sizeReach ?? 0),
              reverse: Boolean(effect.reversible && warpMods?.sizeReverse)
            });
            if (!bounded.steps) {
              lines.push(line(boundedSizeRefusedLine(target.name, from || "of no size", bounded.why,
                { ...effect, label: effect.label || spell.name })));
              break;
            }
            steps = bounded.steps;
          }
          const change = sizeStepChange(from, steps);
          if (!change) {
            // TWO REASONS REACH HERE and they are different: a size the
            // table does not know, and a step the table has no room for.
            // Only the second is worth a line at the table.
            lines.push(line(sizeStepTarget(from, steps) === null
              ? `<em>${spell.name} cannot resize ${target.name} — "${from || "no size"}" is not a size.</em>`
              : sizeStepRefusedLine(target.name, from, steps)));
            break;
          }
          await createEffectsOn(target, [overrideEffectData({
            name: effectName(spell.name, effect.note), spell, changes: [change],
            parsedDuration, castId, registersCast
          })]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(sizeStepLine(target.name, from, change.value, steps) + durationText));
          break;
        }
        /*
         * A COUNTERACT, AND AN IMMUNITY (3.596.0, R7 of block 31).
         *
         * Two spells whose whole content was prose: Restore Senses, whose
         * only mechanic is a counteract check, and Scrying, whose two
         * better degrees buy the target immunity from being scried again.
         * Both mechanisms already existed; neither could be reached from a
         * spell. See magic/counteract-row.mjs and magic/temp-immunity-row.mjs.
         */
        case "resurrect": {
          /*
           * WHAT COMING BACK COSTS (3.602.0, Graham's R6).
           *
           * Four printed consequences, none of them automated before this, on
           * a PP 12 spell whose whole point is that it is expensive. See
           * magic/resurrection.mjs for each one and for which pools the page's
           * "any other daily resources" is read to mean.
           *
           * THE ORDER MATTERS. The refusal is checked FIRST, because a spell
           * that may not be attempted must not empty anybody's pools on the
           * way to saying so.
           */
          const {
            DEATH_CONDITIONS_CLEARED, bleedingStoppedLine, FAILED_FLAG, POOLS_LEFT_ALONE, alreadyFailedLine, deathStateAfterReturn, deathStateLine,
            debilitatedLine, judgedAtTheTableLine, restoredLine, restoredResourceUpdate,
            resurrectionRefused, soulDestroyedLine, soulIsDestroyed,
            SOUL_DESTROYED_FLAG, soulIsGone, soulGoneRefusalLine
          } = await import("./resurrection.mjs");

          if (resurrectionRefused(target.getFlag?.(SYSTEM_ID, FAILED_FLAG))) {
            lines.push(line(alreadyFailedLine(target.name)));
            break;
          }
          // A SOUL ANOTHER SPELL DESTROYED (3.606.0). Refused before anything
          // is touched, for the same reason as the refusal above.
          {
            const gone = target.getFlag?.(SYSTEM_ID, SOUL_DESTROYED_FLAG);
            if (soulIsGone(gone)) {
              lines.push(line(soulGoneRefusalLine(target.name, gone)));
              break;
            }
          }

          // THE BODY COMES BACK, and the conditions of death go with it: a
          // creature that is still dead and dying is not restored to life.
          // Dead LAST — see DEATH_CONDITIONS_CLEARED for why the order matters.
          // Bleeding is valued and may sit on more than one effect, so each
          // condition is cleared until none is left (bounded, in case a
          // removal is refused).
          const bled = Boolean(target.hasCondition?.("bleeding"));
          for (const gone of DEATH_CONDITIONS_CLEARED) {
            for (let tries = 0; tries < 6 && target.hasCondition?.(gone); tries += 1) {
              await target.toggleStatusEffect?.(gone, { active: false });
            }
          }
          await target.update?.(restoredResourceUpdate());
          lines.push(line(restoredLine(target.name)));
          if (bled) lines.push(line(bleedingStoppedLine(target.name)));

          // INJURED 2 FOR A WEEK, SEALED.
          {
            const { SEALED_FLAG, prunedSeals, withSeal } = await import("../conditions/sealed.mjs");
            const { ONE_WEEK, describeRemaining } = await import("../temporary-immunity.mjs");
            const nowSeconds = Number(game.time?.worldTime ?? 0);
            await applyConditionTags(target, [{ key: "injured", label: "Injured", value: 2 }], {
              spellEffect: true, spellEffectEnd: nowSeconds + ONE_WEEK, castId: castId ?? null
            });
            const seals = target.getFlag?.(SYSTEM_ID, SEALED_FLAG) ?? {};
            await target.setFlag?.(SYSTEM_ID, SEALED_FLAG,
              withSeal(prunedSeals(seals, nowSeconds), "injured", ONE_WEEK, nowSeconds));
            lines.push(line(debilitatedLine(target.name, describeRemaining(ONE_WEEK))));
          }

          // AND THE PERMANENT COST.
          {
            const was = Number(target.system?.combat?.deathState ?? 5);
            const now = deathStateAfterReturn(was);
            await target.update?.({ "system.combat.deathState": now });
            lines.push(line(deathStateLine(target.name, was, now)));
            if (soulIsDestroyed(now)) lines.push(line(soulDestroyedLine(target.name)));
          }

          lines.push(line(judgedAtTheTableLine()));
          if (POOLS_LEFT_ALONE.length && castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "distanceTrigger": {
          /*
           * A CONDITION THAT WAITS UNTIL YOU WALK TOO FAR (3.599.0,
           * Graham's R8).
           *
           * See magic/distance-trigger.mjs for the rule and the two readings
           * of "move more than 30 feet away from you", and
           * magic/distance-trigger-workflow.mjs for the watcher.
           *
           * THE ROW REPLACES A BARE CONDITION THAT FIRED AT ONCE. Shadow
           * Tether's authored `condition: "immobilised"` had no trigger, so a
           * failed save pinned the target where it stood — the one place in
           * this block where the system did something the page does not say.
           */
          const { normaliseDistanceTrigger, distanceTriggerArmedLine,
            distanceTriggerFires, distanceTriggerImmediateLine } =
            await import("./distance-trigger.mjs");
          const { TETHER_FLAG } = await import("./distance-trigger-workflow.mjs");
          const tetherSpec = normaliseDistanceTrigger(effect);
          if (!tetherSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed tether.</em>`));
            break;
          }
          const casterToken = caster?.getActiveTokens?.(true, true)?.[0]
            ?? caster?.getActiveTokens?.()?.[0]?.document ?? null;
          const targetToken = target?.getActiveTokens?.(true, true)?.[0]
            ?? target?.getActiveTokens?.()?.[0]?.document ?? null;
          const tetherTiming = spellExpiryTiming(parsedDuration);
          /*
           * TESTED AT THE CAST TOO. The spell's range is 60 feet and the
           * tether is 30, so a target can already be beyond it when the save
           * fails — the lash is taut as it lands. Measured only when both
           * tokens exist; without a canvas the tether simply arms.
           */
          let tautNow = false;
          let feetNow = null;
          if (casterToken && targetToken) {
            const { distanceBetween } = await import("../combat/geometry.mjs");
            feetNow = distanceBetween(targetToken.object ?? targetToken, casterToken.object ?? casterToken);
            tautNow = distanceTriggerFires(tetherSpec, feetNow);
          }
          if (tautNow) {
            await applyConditionTags(target, [{
              key: tetherSpec.condition,
              label: tetherSpec.label || tetherSpec.condition,
              value: tetherSpec.value || undefined
            }], {
              spellEffect: tetherTiming.spellEffect,
              spellEffectEnd: tetherTiming.spellEffectEnd ?? null,
              expiresRound: tetherTiming.expiresRound ?? null,
              castId: castId ?? null
            });
            lines.push(line(distanceTriggerImmediateLine(target.name, tetherSpec, feetNow)));
            if (castId && target.uuid) affected.add(target.uuid);
            break;
          }
          const tetherFlags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              /*
               * THE KIND TRAVELS WITH THE SPEC (fixed in the 3.599.0 drive).
               *
               * This stored the NORMALISED spec, and `normaliseDistanceTrigger`
               * refuses anything whose `kind` is not "distanceTrigger" — which a
               * normalised spec does not carry. So the watcher re-normalised the
               * flag, got null, and skipped the tether: THE SPELL COULD NEVER
               * FIRE. Armed for ever, at any distance, with nothing on any card
               * to say so.
               *
               * The same round-trip trap `flat-ladder.mjs` documents from
               * 3.485.0, and the harness missed it for the same reason both
               * times: it checked that the flag was WRITTEN and that the reader
               * MENTIONED the normaliser, never that a stored spec survives
               * being read back. `verify-shadow-tether` A2c now measures the
               * round trip itself.
               */
              [TETHER_FLAG]: { kind: "distanceTrigger", ...tetherSpec },
              tetherAnchor: casterToken?.uuid ?? ""
            }
          };
          if (tetherTiming.spellEffect) tetherFlags[SYSTEM_ID].spellEffect = true;
          if (tetherTiming.spellEffectEnd != null) tetherFlags[SYSTEM_ID].spellEffectEnd = tetherTiming.spellEffectEnd;
          if (tetherTiming.expiresRound != null) tetherFlags[SYSTEM_ID].conditionExpiresRound = tetherTiming.expiresRound;
          if (castId) tetherFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) tetherFlags[SYSTEM_ID].endsWithCast = true;
          const tetherData = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: tetherFlags
          };
          if (tetherTiming.foundryDuration) {
            tetherData.duration = { ...tetherTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [tetherData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(distanceTriggerArmedLine(target.name, tetherSpec, durationText)));
          break;
        }
        case "sanctuary": {
          /*
           * A WARD THE ATTACK PATH READS (3.598.0, Graham's R1).
           *
           * See magic/sanctuary.mjs for the rule and
           * combat/sanctuary-gate.mjs for the gate. Like `avoidanceSight`
           * this effect carries NO changes — it is a fact the attack
           * workflow reads when somebody swings. Unlike it, the fact lives
           * on the DEFENDER and the opponent rolls against it.
           *
           * EVERYTHING THE LATER SAVE NEEDS IS STORED NOW, because that roll
           * opens no dialog: the DC, who cast it, and the spell's traits and
           * tradition. A fact the check is not told at the call cannot be
           * asked about afterwards — the Ascendan lesson, which cost a live
           * save on 15 August.
           */
          const { normaliseSanctuary, sanctuaryLine } = await import("./sanctuary.mjs");
          const { WARD_FLAG } = await import("../combat/sanctuary-gate.mjs");
          const wardSpec = normaliseSanctuary(effect);
          if (!wardSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed sanctuary.</em>`));
            break;
          }
          const wardTiming = spellExpiryTiming(parsedDuration);
          const wardFlags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              [WARD_FLAG]: true,
              sanctuary: {},
              sanctuaryDC: Number(saveDC ?? 0) || null,
              sanctuaryCaster: caster?.uuid ?? "",
              sanctuaryTraits: spell.system?.traits ?? "",
              sanctuaryTradition: spell.system?.tradition ?? ""
            }
          };
          if (wardTiming.spellEffect) wardFlags[SYSTEM_ID].spellEffect = true;
          if (wardTiming.spellEffectEnd != null) wardFlags[SYSTEM_ID].spellEffectEnd = wardTiming.spellEffectEnd;
          if (wardTiming.expiresRound != null) wardFlags[SYSTEM_ID].conditionExpiresRound = wardTiming.expiresRound;
          if (castId) wardFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) wardFlags[SYSTEM_ID].endsWithCast = true;
          const wardData = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: wardFlags
          };
          if (wardTiming.foundryDuration) {
            wardData.duration = { ...wardTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [wardData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(sanctuaryLine(target.name, durationText)));
          break;
        }
        case "terrainFreedom": {
          /*
           * UNTAMED JOURNEY (3.609.0, R10): "immune to Speed penalties caused
           * by vegetation, rubble, winds … regardless of whether they are
           * magical. Additionally, they can traverse difficult terrain
           * created by these environmental factors without any impediment."
           * Two flags the movement code and the zone sweep already ask about.
           */
          const { ENVIRONMENT_SPEED_IMMUNE_FLAG } = await import("./obscuring-zone.mjs");
          const freeTiming = spellExpiryTiming(parsedDuration);
          const freeFlags = { [SYSTEM_ID]: { spellBuff: true, ignoresDifficultTerrain: true, [ENVIRONMENT_SPEED_IMMUNE_FLAG]: true } };
          if (freeTiming.spellEffect) freeFlags[SYSTEM_ID].spellEffect = true;
          if (freeTiming.spellEffectEnd != null) freeFlags[SYSTEM_ID].spellEffectEnd = freeTiming.spellEffectEnd;
          if (freeTiming.expiresRound != null) freeFlags[SYSTEM_ID].conditionExpiresRound = freeTiming.expiresRound;
          if (castId) freeFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) freeFlags[SYSTEM_ID].endsWithCast = true;
          const freeData = { name: effectName(spell.name, effect.note), img: spell.img || DEFAULT_SPELL_IMG, origin: spell.uuid, changes: [], flags: freeFlags };
          if (freeTiming.foundryDuration) freeData.duration = { ...freeTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          await createEffectsOn(target, [freeData]);
          // AND ANY ZONE PENALTY IT IS ALREADY CARRYING GOES NOW.
          const { OBSCURING_ZONE_FLAG } = await import("./obscuring-zone.mjs");
          for (const held of Array.from(target.effects ?? [])) {
            if (held.getFlag?.(SYSTEM_ID, OBSCURING_ZONE_FLAG)?.speedPenalty && (held.changes ?? []).length) {
              await held.update({ changes: [] });
            }
          }
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name} moves unhindered by vegetation, rubble and wind${durationText}.`));
          break;
        }
        case "wake": {
          /*
           * WAKE (3.609.0, R10): "one sleeping creature … immediately awakens".
           * Asleep is an Unconscious creature that is not down — above 0 HP
           * and not Dying. One that IS down is not asleep, and a snap of the
           * fingers does not raise it.
           */
          const hp = Number(target.system?.resources?.hp?.value ?? 0);
          const dying = Number(target.getConditionValue?.("dying") ?? 0) > 0 || target.hasCondition?.("dying");
          if (!target.hasCondition?.("unconscious")) {
            lines.push(line(`${target.name} is not asleep.`));
          } else if (hp <= 0 || dying) {
            lines.push(line(`<em>${target.name} is not sleeping — it is down, and Wake does not raise it.</em>`));
          } else {
            await target.toggleStatusEffect("unconscious", { active: false });
            lines.push(line(`<strong>${target.name}</strong> wakes up.`));
          }
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "materialShift": {
          // PRECIOUS METALS (3.614.0, R11): an item's metal, for the duration.
          // See magic/material-shift.mjs.
          const { applyMaterialShift } = await import("./material-shift-workflow.mjs");
          lines.push(line(await applyMaterialShift(target, spell, {
            warpMods: warpMods ?? {}, timing: spellExpiryTiming(parsedDuration), durationText, castId
          })));
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "damageHeal": {
          // WELLSPRING OF VALOUR (3.614.0, R9): the first damage each round
          // heals. A flag on the creature, adopted by the emanation like every
          // other live row — see magic/damage-heal.mjs.
          const { DAMAGE_HEAL_FLAG, normaliseDamageHeal } = await import("./damage-heal.mjs");
          const dhSpec = normaliseDamageHeal({ ...effect, label: effect.label || spell.name }, warpBonus);
          if (!dhSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed heal on damage.</em>`));
            break;
          }
          const dhTiming = spellExpiryTiming(parsedDuration);
          const dhFlags = { [SYSTEM_ID]: { spellBuff: true, [DAMAGE_HEAL_FLAG]: dhSpec } };
          if (dhTiming.spellEffect) dhFlags[SYSTEM_ID].spellEffect = true;
          if (dhTiming.spellEffectEnd != null) dhFlags[SYSTEM_ID].spellEffectEnd = dhTiming.spellEffectEnd;
          if (dhTiming.expiresRound != null) dhFlags[SYSTEM_ID].conditionExpiresRound = dhTiming.expiresRound;
          if (castId) dhFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) dhFlags[SYSTEM_ID].endsWithCast = true;
          await createEffectsOn(target, [{
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: dhFlags
          }]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: the first time it takes damage each round it regains <strong>${dhSpec.dice}</strong> HP${durationText}.`));
          break;
        }
        case "turnOptions": {
          // A CHOICE AT THE START OF EACH OF THE TARGET'S TURNS (3.614.0, R8 —
          // Renewal's Touch). See magic/turn-options.mjs.
          const { TURN_OPTIONS_FLAG, turnOptionsSpec, turnOptionChoices } = await import("./turn-options.mjs");
          const toSpec = turnOptionsSpec({ ...effect, label: effect.label || spell.name }, warpMods ?? {}, warpedHealFormula);
          if (!toSpec) {
            lines.push(line(`<em>${spell.name} declares malformed turn options.</em>`));
            break;
          }
          const toTiming = spellExpiryTiming(parsedDuration);
          const toFlags = { [SYSTEM_ID]: { spellBuff: true, [TURN_OPTIONS_FLAG]: toSpec } };
          if (toTiming.spellEffect) toFlags[SYSTEM_ID].spellEffect = true;
          if (toTiming.spellEffectEnd != null) toFlags[SYSTEM_ID].spellEffectEnd = toTiming.spellEffectEnd;
          if (toTiming.expiresRound != null) toFlags[SYSTEM_ID].conditionExpiresRound = toTiming.expiresRound;
          if (castId) toFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) toFlags[SYSTEM_ID].endsWithCast = true;
          await createEffectsOn(target, [{
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: toFlags
          }]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: at the start of each of its turns it may spend ${toSpec.apCost} AP on one of — `
            + `${turnOptionChoices(toSpec).map((c) => c.label).join("; ")}${durationText}.`));
          break;
        }
        case "stasis": {
          // TIME HALTS FOR THE TARGET (3.614.0, R2). See magic/stasis.mjs.
          const { applyStasis } = await import("./stasis-workflow.mjs");
          lines.push(line(await applyStasis(target, spell, effect, { castId, saveDC, img: spell.img })));
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "timeStop": {
          /*
           * TIME STOP (3.609.0, R10): "you can use up to 1d6+3 AP (a secret
           * roll made by the GM)", +1d6 per warp. Rolled blind to the GM and
           * added to the caster's pool, past its maximum — the actions are
           * extra. The page's ending conditions stay the table's.
           */
          const formula = addDice(String(effect.formula ?? "1d6+3"), warpDice);
          const apRoll = await new Roll(formula).evaluate();
          const gmIds = (game.users ?? []).filter((u) => u.isGM).map((u) => u.id);
          // BLIND BY ROLL MODE (3.609.1, F9). Whisper and blind written into
          // the message data were overwritten by the roll's own mode, so the
          // "secret" roll posted to everyone; Foundry's blind roll is the
          // one that reaches only the GM.
          await apRoll.toMessage({ flavor: `${spell.name} — AP (secret)`, whisper: gmIds, blind: true },
            { rollMode: CONST.DICE_ROLL_MODES?.BLIND ?? "blindroll" }).catch(() => {});
          // PAST THE MAXIMUM, AND ALLOWED TO STAY THERE (3.609.1, F9). The
          // stored value is read off `_source` because the prepared one is
          // already clamped; the `apOverflow` flag is the allowance the
          // preparation honours until the next turn's regain clears it.
          const extra = Math.max(0, apRoll.total);
          const before = Number(target._source?.system?.resources?.ap?.value ?? target.system?.resources?.ap?.value ?? 0);
          const overflow = Number(target.getFlag?.(SYSTEM_ID, "apOverflow")) || 0;
          await target.update({
            "system.resources.ap.value": before + extra,
            [`flags.${SYSTEM_ID}.apOverflow`]: overflow + extra
          });
          lines.push(line(`<em>${spell.name}: time stops. The GM has rolled how many actions ${target.name} gains `
            + `(${formula}); they are in the pool. Affecting anyone else, or moving more than 1,000 feet, ends it.</em>`));
          break;
        }
        case "siphon": {
          // READ BY THE SAVE PATH, which is the only place that knows what
          // each creature took (3.609.0, R8). See magic/life-transfer.mjs.
          break;
        }
        case "turnHeal": {
          /*
           * VIGOUR (3.609.0, R8): healed at the END of each of the target's
           * turns. A marker the combat tracker reads at that boundary; see
           * magic/life-transfer.mjs and magic/turn-heal-workflow.mjs.
           */
          const { TURN_HEAL_FLAG, normaliseTurnHeal } = await import("./life-transfer.mjs");
          const healSpec = normaliseTurnHeal(effect, warpBonus);
          if (!healSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed turn heal.</em>`));
            break;
          }
          const healTiming = spellExpiryTiming(parsedDuration);
          const healFlags = { [SYSTEM_ID]: { spellBuff: true, [TURN_HEAL_FLAG]: { ...healSpec, label: spell.name } } };
          if (healTiming.spellEffect) healFlags[SYSTEM_ID].spellEffect = true;
          if (healTiming.spellEffectEnd != null) healFlags[SYSTEM_ID].spellEffectEnd = healTiming.spellEffectEnd;
          if (healTiming.expiresRound != null) healFlags[SYSTEM_ID].conditionExpiresRound = healTiming.expiresRound;
          if (castId) healFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) healFlags[SYSTEM_ID].endsWithCast = true;
          const healData = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: healFlags
          };
          if (healTiming.foundryDuration) healData.duration = { ...healTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          await createEffectsOn(target, [healData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`${target.name}: healed <strong>${healSpec.amount}</strong> HP at the end of each of its turns`
            + `${warpBonus ? " (warped)" : ""}${durationText}.`));
          break;
        }
        case "horror": {
          /*
           * VISAGE OF HORROR (3.609.0, block 33's R6). A fact on the warded
           * creature that the attack gate reads, exactly as Sanctuary's ward
           * is — with the DC, the caster and the spell's traits stored now,
           * because the opponent's save opens no dialog. See
           * magic/aggression-wards.mjs and combat/sanctuary-gate.mjs.
           */
          const { HORROR_WARD_FLAG, HORROR_MEMORY_FLAG } = await import("./aggression-wards.mjs");
          const horrorTiming = spellExpiryTiming(parsedDuration);
          const horrorFlags = {
            [SYSTEM_ID]: {
              spellBuff: true,
              [HORROR_WARD_FLAG]: true,
              [HORROR_MEMORY_FLAG]: {},
              horrorDC: Number(saveDC ?? 0) || null,
              horrorCaster: caster?.uuid ?? "",
              horrorTraits: spell.system?.traits ?? "",
              horrorTradition: spell.system?.tradition ?? ""
            }
          };
          if (horrorTiming.spellEffect) horrorFlags[SYSTEM_ID].spellEffect = true;
          if (horrorTiming.spellEffectEnd != null) horrorFlags[SYSTEM_ID].spellEffectEnd = horrorTiming.spellEffectEnd;
          if (horrorTiming.expiresRound != null) horrorFlags[SYSTEM_ID].conditionExpiresRound = horrorTiming.expiresRound;
          if (castId) horrorFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) horrorFlags[SYSTEM_ID].endsWithCast = true;
          const horrorData = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: horrorFlags
          };
          if (horrorTiming.foundryDuration) {
            horrorData.duration = { ...horrorTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [horrorData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`<strong>${target.name}</strong> takes on a horrifying form${durationText}: anyone who `
            + `moves against it saves Will (DC ${Number(saveDC ?? 0) || "?"}) first.`));
          break;
        }
        case "rebuke": {
          /*
           * PAINFUL REBUKE (3.609.0, block 33's R2). What the save bought,
           * carried on the rebuked creature and naming the caster; the
           * attack gate bites when it turns on them. See
           * magic/aggression-wards.mjs.
           */
          const { REBUKE_FLAG, normaliseRebuke } = await import("./aggression-wards.mjs");
          const rebukeSpec = normaliseRebuke({
            casterUuid: String(caster?.uuid ?? ""), casterName: caster?.name ?? "",
            formula: effect.formula, type: effect.damageType, once: effect.once === true,
            critical: effect.critical ?? null, dc: Number(saveDC ?? 0) || null, label: spell.name
          });
          if (!rebukeSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed rebuke.</em>`));
            break;
          }
          const rebukeTiming = spellExpiryTiming(parsedDuration);
          const rebukeFlags = { [SYSTEM_ID]: { spellBuff: true, [REBUKE_FLAG]: rebukeSpec } };
          if (rebukeTiming.spellEffect) rebukeFlags[SYSTEM_ID].spellEffect = true;
          if (rebukeTiming.spellEffectEnd != null) rebukeFlags[SYSTEM_ID].spellEffectEnd = rebukeTiming.spellEffectEnd;
          if (rebukeTiming.expiresRound != null) rebukeFlags[SYSTEM_ID].conditionExpiresRound = rebukeTiming.expiresRound;
          if (castId) rebukeFlags[SYSTEM_ID].castId = castId;
          const rebukeData = {
            name: `${spell.name} (${caster?.name ?? "caster"})`,
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: rebukeFlags
          };
          if (rebukeTiming.foundryDuration) {
            rebukeData.duration = { ...rebukeTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [rebukeData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(`<strong>${target.name}</strong> is rebuked${rebukeSpec.once ? " once" : durationText}: `
            + `turning on ${caster?.name ?? "the caster"} costs it ${rebukeSpec.formula} ${rebukeSpec.type}`
            + `${rebukeSpec.critical ? ` and a ${rebukeSpec.critical} critical` : ""}`
            + `${rebukeSpec.once ? ", and then the spell ends" : ""}.`));
          break;
        }
        case "avoidanceSight": {
          /*
           * A FACT ABOUT THE CASTER THAT ANOTHER RULE READS (3.597.0).
           *
           * See magic/avoidance-sight.mjs, which explains why this is NOT
           * the `sense` kind. The effect carries NO changes at all — it
           * exists so `missChanceAvoidance` can read one flag at the moment
           * somebody swings at an invisible creature.
           */
          const { normaliseAvoidanceSight, avoidanceSightLine } = await import("./avoidance-sight.mjs");
          const senseSpec = normaliseAvoidanceSight(effect, warpMods);
          if (!senseSpec) {
            lines.push(line(`<em>${spell.name} declares a sight this system does not read.</em>`));
            break;
          }
          const senseTiming = spellExpiryTiming(parsedDuration);
          const senseFlags = { [SYSTEM_ID]: { spellBuff: true, [senseSpec.flag]: senseSpec.level } };
          if (senseTiming.spellEffect) senseFlags[SYSTEM_ID].spellEffect = true;
          if (senseTiming.spellEffectEnd != null) senseFlags[SYSTEM_ID].spellEffectEnd = senseTiming.spellEffectEnd;
          if (senseTiming.expiresRound != null) senseFlags[SYSTEM_ID].conditionExpiresRound = senseTiming.expiresRound;
          if (castId) senseFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) senseFlags[SYSTEM_ID].endsWithCast = true;
          const senseData = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: senseFlags
          };
          if (senseTiming.foundryDuration) {
            senseData.duration = { ...senseTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [senseData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(avoidanceSightLine(target.name, senseSpec, durationText)));
          break;
        }
        case "counteract": {
          const { normaliseCounteract, counteractCandidates, counteractedLine,
            counteractFailedLine, nothingToCounteractLine } =
            await import("./counteract-row.mjs");
          const spec = normaliseCounteract(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed counteract.</em>`));
            break;
          }
          // THE CONDITIONS NAMED, AND ANY EFFECT FROM A SPELL OF A NAMED TRAIT
          // (3.613.0, R14) — see `counteractCandidates`.
          const { SOURCE_TRAITS_FLAG } = await import("../combat/effect-application-workflow.mjs");
          // A NON-CONDITION EFFECT NAMES ITS SPELL BY `origin`; a condition the
          // spell inflicted carries the traits itself. Only asked when the row
          // has traits to look for — Restore Senses never pays for it.
          const traitedRows = [];
          if (spec.traits.length) {
            // NOT THIS SPELL'S OWN EFFECTS: Soothing Words is itself an emotion
            // spell, and its +1 to Will lands a row before this one.
            for (const e of Array.from(target.effects ?? []).filter((x) => !x.disabled
              && x.origin !== spell.uuid && !(castId && x.flags?.[SYSTEM_ID]?.castId === castId))) {
              let sourceTraits = e.flags?.[SYSTEM_ID]?.[SOURCE_TRAITS_FLAG] ?? null;
              if (!sourceTraits && e.origin) {
                const origin = await fromUuid(e.origin).catch(() => null);
                sourceTraits = origin?.type === "spell" ? origin.system?.traits ?? "" : "";
              }
              traitedRows.push({ id: e.id, name: e.name, statuses: Array.from(e.statuses ?? []), sourceTraits });
            }
          }
          let held = counteractCandidates(spec, (c) => Boolean(target.hasCondition?.(c)), traitedRows);
          // "ONE EMOTION EFFECT" — the caster picks which, when there is a choice.
          if (spec.limit && held.length > spec.limit) {
            const { promptCounteractChoice } = await import("./counteract-workflow-choice.mjs");
            held = await promptCounteractChoice(spell.name, target.name, held, spec.limit);
          }
          if (!held.length) {
            // SAID, NOT ROLLED. A check against nothing reads as a failure
            // that cost a spell.
            lines.push(line(nothingToCounteractLine(target.name, spec)));
            break;
          }
          const { rollCounteractCheck } = await import("../combat/counteract-workflow.mjs");
          for (const candidate of held) {
            const condition = candidate.label;
            // ONE CHECK PER CONDITION, because each was inflicted by its own
            // effect with its own DC — which is the only thing the check
            // asks the table for.
            // THE CASTER ROLLS IT — this function's own parameter is
            // `caster`, and `actor` is the name the attack path uses. A
            // check rolled by the wrong document is the kind of mistake
            // `verify-no-undefined-names` exists to refuse.
            const result = await rollCounteractCheck(caster);
            if (result === null) break;
            /*
             * THE CHECK'S OWN DEGREE, not a `success` field it does not have.
             * `rollCounteractCheck` returns the TRGCheck, so the answer is
             * `outcome.degree.success` — the same read every other caller of
             * a check uses. A `result.success` would have been undefined for
             * ever and every counteract would have failed, silently and
             * plausibly.
             *
             * AND A CHECK WITH NO DC IS THE GM'S TO JUDGE: the dialog allows
             * a blank DC ("DC not specified — GM adjudicates"), and a blank
             * DC produces no degree. That is reported rather than counted as
             * a failure.
             */
            const degree = result?.outcome?.degree ?? null;
            if (!degree) {
              lines.push(line(`<em>${target.name}'s ${condition} — the counteract check was rolled `
                + "with no DC, so the table decides whether it lands.</em>"));
              continue;
            }
            if (degree.success) {
              // A CONDITION IS SWITCHED OFF; ANY OTHER EFFECT IS REMOVED.
              if (candidate.kind === "effect") await target.effects?.get?.(candidate.key)?.delete?.();
              else await target.toggleStatusEffect?.(candidate.key, { active: false });
              lines.push(line(candidate.kind === "effect"
                ? `<strong>${target.name}</strong> is free of <strong>${condition}</strong> &mdash; the effect was counteracted.`
                : counteractedLine(target.name, condition)));
            } else {
              lines.push(line(counteractFailedLine(target.name, condition)));
            }
          }
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "counteractPeril": {
          /*
           * A SPELL THAT COUNTERACTS A HAUNT (3.629.0; Pillars of Faith's
           * Still the Haunt and Quarantine Working). "If no Counteract entry
           * is given: Counteract Level: the haunt's Level. Counteract DC: the
           * haunt's Level DC" — the check opens on both — and "Spells such as
           * Still the Haunt use their own listed suppression durations": the
           * row's `suppress` ladder, a warp's `perilSuppress` over it. A
           * Fumble or Blunder triggers it, as any attempt to disable a peril
           * does (Chapter 12).
           */
          const { isPeril } = await import("../peril.mjs");
          if (!isPeril(target)) {
            lines.push(line(`<em>${spell.name}: ${target.name} is not a haunt or peril, so nothing is rolled here — resolve any Counteract against it from the spell's text.</em>`));
            break;
          }
          const { perilDispelDefaults, perilDisableAttempt } = await import("../peril-workflow.mjs");
          const { parseSpellDuration } = await import("./effect-duration.mjs");
          const defaults = perilDispelDefaults(target) ?? { level: Number(target.system?.identity?.level ?? 0), dc: null };
          const { rollCounteractCheck } = await import("../combat/counteract-workflow.mjs");
          const result = await rollCounteractCheck(caster, { targetLevel: defaults.level, dc: defaults.dc });
          if (result === null) break;
          const degree = result?.outcome?.degree ?? null;
          if (!degree) {
            lines.push(line(`<em>${target.name} — the counteract check was rolled with no DC, so the table decides whether it lands.</em>`));
            break;
          }
          const ladder = { ...(effect.suppress ?? {}), ...(warpMods?.perilSuppress ?? {}) };
          const rung = ladder[degree.key] ?? (degree.key === "heroic" ? ladder.critical : undefined);
          if (degree.key === "fumble" || degree.key === "blunder") {
            lines.push(...await perilDisableAttempt(target, degree.key, { mode: "counteract" }));
          } else if (rung) {
            const seconds = /reset/i.test(rung) ? null : (parseSpellDuration(rung)?.seconds ?? 6);
            lines.push(...await perilDisableAttempt(target, degree.key, { mode: "counteract", seconds, force: true }));
          } else {
            lines.push(line(`${target.name} is unaffected by ${spell.name}.`));
          }
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "tempImmunity": {
          const { normaliseTempImmunity, tempImmunityLine, alreadyImmuneLine } =
            await import("./temp-immunity-row.mjs");
          const spec = normaliseTempImmunity(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed immunity.</em>`));
            break;
          }
          const { IMMUNITY_FLAG, describeRemaining, immunityRemaining, prunedImmunities, withImmunity } =
            await import("../temporary-immunity.mjs");
          // KEYED BY THE SPELL'S OWN NAME unless the row names a key: the
          // page means immune to THIS spell, not to a school of them.
          const key = spec.key || spell.name;
          const now = Number(game.time?.worldTime ?? 0);
          const record = target.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
          const already = immunityRemaining(record, key, now);
          if (already > 0) {
            lines.push(line(alreadyImmuneLine(target.name, key, describeRemaining(already))));
            break;
          }
          await target.setFlag?.(SYSTEM_ID, IMMUNITY_FLAG,
            withImmunity(prunedImmunities(record, now), key, spec.seconds, now));
          lines.push(line(tempImmunityLine(target.name, key, describeRemaining, spec.seconds)));
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "resource": {
          /*
           * SOMETHING OTHER THAN HIT POINTS (3.589.0, R4). See
           * magic/resource-drain.mjs for why this is a gated ROW rather
           * than a fourth ladder mechanism.
           *
           * BOTH WRITES GO THROUGH THE RULES THAT ALREADY OWN THEM:
           * `applyPowerPointCost` knows Chapter 4's below-zero charge of
           * 5 Soul Drain per point, and `setSoulDrain` knows that Soul
           * Drain lowers maximum hit points and can therefore kill. A
           * drain that called `update()` would have been the forty-first
           * caller to forget the first and the third to forget the
           * second.
           */
          const { normaliseResourceDrain, casterGainFrom, resourceDrainLine, casterGainLine } =
            await import("./resource-drain.mjs");
          /*
           * THE WARP'S SHARE, FOLDED IN BEFORE VALIDATION — the order
           * `warpedSuppression` takes, so a warped row is checked
           * exactly as an authored one is. Eldritch Disruption's two
           * options live on the WARP, not on the row; reading only the
           * row would have offered the option, charged for it, and done
           * nothing, which is what the ratchet caught.
           */
          const drain = normaliseResourceDrain({
            label: spell.name,
            ...effect,
            ...(warpMods?.casterGains ? { casterGains: warpMods.casterGains } : {})
          });
          if (!drain) {
            lines.push(line(`<em>${spell.name} declares a malformed resource drain.</em>`));
            break;
          }
          const drainRoll = await new Roll(drain.formula).evaluate();
          rolls.push(drainRoll);
          const asked = Math.max(0, drainRoll.total);

          if (drain.resource === "pp") {
            const { applyPowerPointCost } = await import("../power-points-workflow.mjs");
            const spend = await applyPowerPointCost(target, asked, drain.label);
            lines.push(line(resourceDrainLine(drain.label, target.name, {
              resource: "pp", rolled: asked, taken: spend.spent - spend.shortfall,
              note: spend.shortfall
                ? `${spend.shortfall} beyond empty, so <strong>${spend.soulDrain} Soul Drain</strong>.`
                : ""
            })));
            // THE CASTER GAINS FROM WHAT WAS TAKEN, not from the roll —
            // see casterGainFrom. A pool that never held the points
            // cannot give them away.
            const gained = casterGainFrom(spend.spent - spend.shortfall, drain.casterGains);
            if (gained > 0) {
              const pp = caster.system?.resources?.pp ?? {};
              const before = Number(pp.value) || 0;
              const max = Number(pp.max) || 0;
              const room = Math.max(0, max - before);
              const took = Math.min(gained, room);
              if (took > 0) await caster.update({ "system.resources.pp.value": before + took });
              lines.push(line(casterGainLine(caster.name, took, drain.casterGains)));
              if (took < gained) {
                lines.push(line(`<em>${caster.name} was too near full to take all ${gained} — ${took} recovered.</em>`));
              }
            }
          } else {
            const { setSoulDrain } = await import("../combat/dying-workflow.mjs");
            const held = Number(target.getConditionValue?.("soulDrain") ?? 0);
            await setSoulDrain(target, held + asked);
            lines.push(line(resourceDrainLine(drain.label, target.name, {
              resource: "soulDrain", rolled: asked, taken: asked
            })));
          }
          if (castId && target.uuid) affected.add(target.uuid);
          break;
        }
        case "directedStrike": {
          /*
           * A BALL AIMED AGAIN EVERY TURN (3.588.0). See
           * magic/directed-strike.mjs for Graham's three rulings and
           * magic/directed-strike-workflow.mjs for why it is an
           * ActiveEffect on the caster rather than a record of its own.
           *
           * RECORDED ON THE CASTER, NOT THE TARGET, however `target`
           * resolved — the ball belongs to whoever conjured it, and the
           * target is a field on the ball. So this fires once, on the
           * first pass, and a second target does not get a second ball.
           */
          if (directedStrikeRecorded) break;
          directedStrikeRecorded = true;
          const { recordDirectedStrike } = await import("./directed-strike-workflow.mjs");
          const dsTiming = spellExpiryTiming(parsedDuration);
          const dsFlags = { [SYSTEM_ID]: { spellBuff: true } };
          if (castId) dsFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) dsFlags[SYSTEM_ID].endsWithCast = true;
          if (dsTiming.spellEffect) dsFlags[SYSTEM_ID].spellEffect = true;
          if (dsTiming.spellEffectEnd != null) dsFlags[SYSTEM_ID].spellEffectEnd = dsTiming.spellEffectEnd;
          if (dsTiming.expiresRound != null) dsFlags[SYSTEM_ID].conditionExpiresRound = dsTiming.expiresRound;
          const dsData = {
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            flags: dsFlags
          };
          if (dsTiming.foundryDuration) {
            dsData.duration = { ...dsTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          // THE WARP BUYS A SECOND BALL, and `targetCap` is the key it
          // already carries — "create an additional ball which must have
          // a different target" caps the spell at two creatures, which
          // is the same number.
          const dsCount = Math.max(1, Math.trunc(Number(warpMods?.targetCap ?? effect.count ?? 1)) || 1);
          const dsSpec = await recordDirectedStrike(caster, {
            ...effect,
            count: dsCount,
            label: effect.label || spell.name,
            /*
             * THE DC THE SAVES WERE ROLLED AGAINST, NOT THE ONE THE
             * SPELL HAS (3.588.0).
             *
             * The first draft read `rollData?.saveDC`, and my first
             * reason for changing it was wrong: I wrote that rollData
             * "has never carried a save DC", and the harness disproved
             * it in one grep — three other places in this file read
             * exactly that field.
             *
             * The real reason is the distinction cast-workflow spells
             * out at the point it computes both, and which cost a live
             * defect at 3.309.1:
             *
             *   `saveDC`        what THIS spell's targets roll against.
             *                   Null when the spell offers no save.
             *   `nominalSaveDC` the DC this spell HAS, computed whenever
             *                   the cast lands — because a granted
             *                   spell-like may borrow it.
             *
             * `rollData.saveDC` is the NOMINAL one. A ball freezes the
             * number its targets will keep rolling against for the next
             * minute, which is the first — the same number the nexus and
             * the recurring ladder freeze, for the same reason.
             */
            saveDC: Number(saveDC ?? 0) || 0,
            baseDamage: String(spell.system?.baseDamage ?? ""),
            targetUuid: target?.uuid ?? ""
          }, dsData);
          if (!dsSpec) {
            lines.push(line(`<em>${spell.name} declares a malformed directed strike — it will not fire on later turns.</em>`));
            break;
          }
          if (castId && caster?.uuid) affected.add(caster.uuid);
          lines.push(line(dsCount > 1
            ? `<strong>${dsSpec.label}</strong> &times;${dsCount} — each is aimed at the start of your turn, and two may not share a target.`
            : `<strong>${dsSpec.label}</strong> — aimed at the start of each of your turns; a free action redirects it, otherwise it strikes ${target?.name ?? "its current target"} again.`));
          break;
        }
        case "grantAbility": {
          /*
           * AN ABILITY THE PACK ALREADY DEFINES (3.587.0, R6). See
           * magic/granted-ability.mjs for why the row names a uuid
           * rather than carrying a second copy of the ability's rules.
           */
          const { normaliseGrantedAbility, alreadyHasAbility, grantedAbilityLine } =
            await import("./granted-ability.mjs");
          const spec = normaliseGrantedAbility(effect);
          if (!spec) {
            lines.push(line(`<em>${spell.name} declares a malformed ability grant.</em>`));
            break;
          }
          const source = await fromUuid(spec.uuid).catch(() => null);
          if (!source) {
            lines.push(line(grantedAbilityLine(spell.name, target.name, { missing: true })));
            break;
          }
          const grantName = spec.label || source.name;
          if (alreadyHasAbility(Array.from(target.items ?? []), grantName)) {
            lines.push(line(grantedAbilityLine(
              spell.name, target.name, { name: grantName, already: true })));
            break;
          }
          const payload = source.toObject ? source.toObject() : { ...source };
          delete payload._id;
          payload.name = grantName;
          if (spec.system) payload.system = { ...(payload.system ?? {}), ...spec.system };
          payload.flags = payload.flags ?? {};
          payload.flags[SYSTEM_ID] = {
            ...(payload.flags[SYSTEM_ID] ?? {}),
            spellItem: true,
            ...(castId ? { castId } : {})
          };
          const [madeAbility] = await target.createEmbeddedDocuments("Item", [payload]);
          if (!madeAbility) {
            lines.push(line(`<em>${target.name} could not be given ${grantName} — nothing applied.</em>`));
            break;
          }
          // THE SAME `grantedItems` LIFECYCLE the sense, conjured-weapon
          // and natural-attack grants use, so a spell that ends takes
          // back what it gave through machinery that already exists.
          const gaTiming = spellExpiryTiming(parsedDuration);
          const gaFlags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [madeAbility.id] } };
          if (gaTiming.spellEffect) gaFlags[SYSTEM_ID].spellEffect = true;
          if (gaTiming.spellEffectEnd != null) gaFlags[SYSTEM_ID].spellEffectEnd = gaTiming.spellEffectEnd;
          if (gaTiming.expiresRound != null) gaFlags[SYSTEM_ID].conditionExpiresRound = gaTiming.expiresRound;
          if (castId) gaFlags[SYSTEM_ID].castId = castId;
          if (castId && registersCast) gaFlags[SYSTEM_ID].endsWithCast = true;
          const gaData = {
            name: effectName(spell.name, effect.note),
            img: spell.img || DEFAULT_SPELL_IMG,
            origin: spell.uuid,
            changes: [],
            flags: gaFlags
          };
          if (gaTiming.foundryDuration) {
            gaData.duration = { ...gaTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }
          await createEffectsOn(target, [gaData]);
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(
            `${grantedAbilityLine(spell.name, target.name, { name: grantName })}${durationText}.`));
          break;
        }
        case "deathKnell": {
          /*
           * HIT POINTS ON BOTH SIDES OF THE TABLE (3.587.0, R3). See
           * magic/death-knell.mjs for why no `onSave` row can say either
           * of its two rungs, and why "the target dies" reuses Dying
           * one past Death State rather than inventing a dead status.
           */
          const { deathKnellOutcome, deathKnellLine } = await import("./death-knell.mjs");
          const { effectiveDeathState } = await import("../combat/turn-economy.mjs");
          const { reapDead } = await import("../combat/death-state.mjs");
          const outcome = deathKnellOutcome({
            mode: effect.mode,
            // `system.identity.level`, MEASURED IN THE LIVE WORLD RATHER
            // THAN GUESSED. The first draft read `system.details.level`,
            // which is the path a d20 system would use and does not
            // exist here — it returned undefined on every creature in
            // Graham's world, so Death Knell would have healed nothing
            // and said "no recorded level" every single time, on a
            // spell whose whole payoff is that number. Same path
            // `conditionals.mjs` scales with.
            targetLevel: target.system?.identity?.level ?? null,
            targetDying: target.getConditionValue?.("dying") ?? null,
            hasDying: Boolean(target.hasCondition?.("dying")),
            // The Doomed rule lives in turn-economy and is applied there,
            // not restated here — a second copy of it is a second answer
            // waiting to disagree with the first.
            deathState: effectiveDeathState(
              target.system?.combat?.deathState ?? 5,
              target.getConditionValue?.("doomed") ?? 0
            )
          });
          if (outcome.refusal) {
            lines.push(line(deathKnellLine(spell.name, target.name, caster.name, outcome)));
            break;
          }
          if (outcome.kills) await target.update({ "system.resources.hp.value": 0 });
          await target.toggleStatusEffect("dying", { value: outcome.dyingTo });
          if (outcome.kills) await reapDead(target);
          if (outcome.healing > 0) {
            const khp = caster.system?.resources?.hp ?? {};
            const kbefore = Number(khp.value) || 0;
            const kmax = Number(khp.max) || 0;
            const gained = Math.min(outcome.healing, Math.max(0, kmax - kbefore));
            if (gained > 0) await caster.update({ "system.resources.hp.value": kbefore + gained });
            // The line says what the SPELL granted; the cap is stated
            // separately when it bit, because "regains 7 HP" on a caster
            // who was already full is the silent-nothing shape.
            if (gained < outcome.healing) {
              lines.push(line(`${caster.name} was already too close to full to take all ${outcome.healing} — ${gained} restored.`));
            }
          }
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(deathKnellLine(spell.name, target.name, caster.name, outcome)));
          break;
        }
        case "pending": {
          // A RUNG MADE OF ADVANTAGE (3.587.0). See magic/spell-pending.mjs
          // for why the three axes — what, how many rolls, how long —
          // are kept apart, and pending-modifiers.mjs for the channel.
          const { normalisePendingGrant, pendingGrantLine } =
            await import("./spell-pending.mjs");
          const { addPendingModifier, pendingTurnsFor } =
            await import("../pending-modifiers.mjs");
          const acting = game.combat?.combatant?.actor?.uuid ?? null;
          const grant = normalisePendingGrant(
            // Unfold the Future's "+4 PP: one additional Portent" (3.630.0).
            { label: spell.name, ...effect, ...(Number(warpMods?.heldUses) > 0 && Number(effect.uses) > 0 ? { uses: Number(effect.uses) + Number(warpMods.heldUses) } : {}) },
            Boolean(acting) && acting === target.uuid,
            pendingTurnsFor
          );
          if (!grant) {
            lines.push(line(`<em>${spell.name} declares a malformed pending modifier.</em>`));
            break;
          }
          const record = await addPendingModifier(target, grant);
          if (!record) {
            lines.push(line(`<em>${spell.name} granted nothing to ${target.name}.</em>`));
            break;
          }
          if (castId && target.uuid) affected.add(target.uuid);
          lines.push(line(pendingGrantLine(target.name, grant)));
          break;
        }
        case "perTurn":
          break;
        /*
         * A PRINTED LADDER IS NOT RESOLVED AT THE EFFECT STAGE EITHER
         * (3.585.0). `resolveSpellSave` reads it, because the ladder IS
         * the saving throw — it needs the degree each target rolled,
         * which does not exist yet when this applier runs.
         *
         * THE `break` IS LOAD-BEARING, exactly as `perTurn`'s is. The
         * full sweep caught its absence before this shipped: falling
         * through to the default prints `Unhandled effect kind
         * "saveLadder"` on Acid Cloud's card, telling the table the
         * spell is broken while the machinery is merely elsewhere —
         * word for word the defect the comment above records.
         */
        case "saveLadder":
          break;
        /*
         * AND AN ANTIMAGIC FIELD IS RESOLVED BY THE EMANATION SWEEP
         * (3.586.0). The same `break` as the two above and for the same
         * reason: what the row does happens when somebody crosses the
         * boundary, which is a question only `refreshEmanation` can ask,
         * and it asks it on every movement for as long as the spell
         * runs. See magic/antimagic.mjs.
         *
         * THE `break` IS LOAD-BEARING. Falling through prints "Unhandled
         * effect kind" on a card for a spell that is working perfectly —
         * which is how Acid Cloud's ladder nearly shipped last week, and
         * the full sweep is what caught it then.
         */
        case "antimagic":
          break;
        default:
          lines.push(line(`<em>Unhandled effect kind "${effect.kind}".</em>`));
      }
    }
  }
  return { rolls, affected: Array.from(affected) };
}
