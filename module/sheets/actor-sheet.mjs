import { stashCapacity } from "../stowage.mjs";
import { ALWAYS_READY_ACTOR_TYPES } from "../combat/natural-ready.mjs";
import { coinValueInGP } from "../items.mjs";
import { describeDefenceField } from "../defences.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { effectDeletion, effectGroup, isMechanical } from "../effect-grouping.mjs";
import { promptConditionValue } from "../conditions/manager.mjs";
import { promptAddEffect } from "../effects/add-effect-dialog.mjs";
import { promptSpecialistSkill } from "../specialist-skill-table-workflow.mjs";
import { specialistInvokedKey, specialistSkillActions } from "../specialist-skill-table.mjs";
import { SHOW_INTERNALS_FLAG } from "./effect-sheet.mjs";
import {
  ATTRIBUTE_ICONS,
  ATTRIBUTE_LABELS,
  CORE_SKILL_KEYS,
  ETHICS,
  FOUNDATION_ITEM_TYPES,
  SIZE_TABLE,
  SKILLS,
  TRADITIONS,
  blankSkill,
  blankSpecialistSkill,
  classDeclinesDivineAspect, classNeedsDivineAspect,
  classNeedsWizardSchool,
  slugifyKey,
  uniqueKey
} from "../config.mjs";
import { TRGCheck } from "../dice/check.mjs";
import { TRGCombat } from "../documents/combat.mjs";
import { TRGItem } from "../documents/item.mjs";
import { aspectEthicsChoices, aspectMissingWarning, divinityCasterSources, secondAspectRefusal } from "../aspect-rules.mjs";
import { startingWealthGranted } from "../starting-wealth.mjs";
import { isPeril, perilSheetView } from "../peril.mjs";
import { breakdownText, grantStartingWealth } from "../starting-wealth-workflow.mjs";
import {
  rollWeaponAttack,
  rollWeaponDamage
} from "../combat/attack-workflow.mjs";
import { reloadWeapon, spinWeapon } from "../combat/reload-workflow.mjs";
import { extractMagazine, hasSpinTrait, RELOAD_CONTROL, reloadControlFor } from "../combat/reload.mjs";
import { canEquip, isHandAndAHalf, promptTwoHandedGrip } from "../held-items-workflow.mjs";
import { castSpell, rollDisbelieveIllusion, rollMagicRitual, rollPowerPointRecovery, rollSpellConcentration } from "../magic/cast-workflow.mjs";
// `sustainActiveSpell` is deliberately NOT imported here any more: the
// sheet reaches a sustain through magic/sustain-workflow.mjs, which is
// the one place that knows what a Sustain costs and requires.
import { activeSpellState, endActiveSpell, getActiveSpells } from "../magic/active-spells.mjs";
import { lightShiftCanDrop } from "../magic/light-shift-workflow.mjs";
import { readStored } from "../magic/spell-storing-workflow.mjs";
import { spellAvailability } from "../magic/spell-availability.mjs";
import { cantripContext, openCantripPick, openRepertoirePick, openRepertoireSwap, repertoireContext } from "../magic/repertoire-workflow.mjs";
import {
  archetypeCastingContext,
  clearArchetypePrepared,
  openArchetypePermanentPick,
  openArchetypePrepare
} from "../magic/archetype-casting-workflow.mjs";
import { clearFeatSlot, featSlotContext, openFeatSlotPick } from "../magic/feat-casting-workflow.mjs";
import { memorisationContext, openMemoriseCantrip, openMemoriseSpell } from "../magic/memorisation-workflow.mjs";
import { innateAttackFor, innateSaveFor } from "../magic/innate-printed.mjs";
import { innateAbilityKey } from "../focus-declarations.mjs";
import { elAdjustOf } from "../el-adjust.mjs";
import { rollAidAnother, rollAutoCheck } from "../skills.mjs";
import { activateItem, investItem, rollItemDepletion } from "../magic-items-workflow.mjs";
import { addFormula } from "../formula-workflow.mjs";
import { damageItem, rollSleepingInArmour } from "../items-workflow.mjs";
import { rollLuckCheck } from "../luck-workflow.mjs";
import { applyDamage, promptSetDoomed, promptSetSoulDrain, rollNaturalHealing } from "../combat/dying-workflow.mjs";
import { applyAllGrants } from "../grants-workflow.mjs";
import { hasFeatAutomation, featAutomationHint, isPassiveAutomation, recordedFeatChoice, abilityChoicesOf, abilityChoiceHint } from "../feats-workflow.mjs";
import { addItemFromPicker, knownPrerequisiteNames } from "../picker-workflow.mjs";
import {
  PICKER_SLOTS,
  archetypeProgressionBlockReason,
  buildPickerFilter,
  facetsFor,
  withArchetypeProgressionGate,
  withHeritageGate,
  heritageBlockReason,
  withOwnedExclusion,
  withFeatGates,
  withPrerequisitesGate
} from "../picker-filters.mjs";
import { spellListFilterOptions, wireSpellListFilters } from "./list-filters.mjs";
import { rollFrightenedRecovery, rollSickenedRetch } from "../combat/conditions-workflow.mjs";
import { chargedItemSheetWarnings } from "../charged-items-workflow.mjs";
import { SKILL_POINT_BONUSES, companionFeatBudget, featBudget, registeredFeatPicks, featDisplayName, freeGrantSources, effectiveRaces, effectiveClasses, effectiveTiers, declaredClassFeatAccess, substituteSkillActions } from "../feats.mjs";
import { companionEffectiveLevel, companionSyncState, isCompanion, masterIdOf } from "../companion.mjs";
import {
  familiarAbilityBudget, familiarActionPoints, familiarEffectiveLevel,
  familiarMasterId, familiarMirrorFrom, familiarSyncState, isFamiliar
} from "../familiar.mjs";
import { totalDamageReduction } from "../combat/damage.mjs";
import { bardicPerformanceActions, bardicPerformanceItem } from "../bard.mjs";
import { proficiencySummary, proficiencySummaryIsEmpty } from "../proficiencies.mjs";
import { proficiencyDescription, proficiencyOf, proficiencyProfile } from "../proficiency-rules.mjs";
import { openConvictionMenu } from "../conviction.mjs";
import { openEndeavourMenu } from "../endeavour.mjs";
import { resolveAction } from "../combat/action-workflow.mjs";
import {
  openStudiedTargetManager,
  studiedTargetStatus
} from "../study-target-workflow.mjs";
import { SKILL_SPECIALTIES } from "../skill-specialties.mjs";
import {
  isSkillDeveloped,
  specialtyGrantCount,
  openSpecialtyManager,
  specialtyStatus,
  specialtySummary
} from "../skill-specialties-workflow.mjs";
import { earnIncomeStatus, openEarnIncomeManager } from "../earn-income-workflow.mjs";
import { createProjectStatus, openCreateManager } from "../create-crafting-workflow.mjs";
import { actionNeedsSkillChoice, actionsForSkill, meetsActionRequirement } from "../combat/action.mjs";
import { BASIC_ACTIONS } from "../data/basic-actions.mjs";
import { SPECIAL_ACTIONS } from "../data/special-actions.mjs";
import { senseLine } from "../senses.mjs";
import { perceivedLightShift, visualRangeReport } from "../light-check.mjs";
import { activeToken } from "../combat/geometry.mjs";
import { actionBadge } from "./action-badge.mjs";
import { SKILL_ACTIONS } from "../data/skill-actions.mjs";
import { promptExhaustionCheck, rollFatigueRecovery } from "../combat/exhaustion-workflow.mjs";
import { rollFalling } from "../combat/falling-workflow.mjs";
import { rollCounteractCheck } from "../combat/counteract-workflow.mjs";
import {
  itemUsesMax,
  itemUsesRemaining,
  performDailyPreparation,
  useItemCharge
} from "../uses-workflow.mjs";
import {
  applyAffliction,
  rollAfflictionStageSave,
  rollInitialExposureSave
} from "../combat/affliction-workflow.mjs";
import {
  promptCheckConfiguration,
  skipDialog
} from "../apps/check-dialog.mjs";
import {
  actorEffectChanges,
  lockedSlotTooltip,
  lockedSlotsFromChanges,
  lockedInputPaths,
  storedSlotValue
} from "../effect-slots.mjs";
import { languagePanel, openLanguageManager } from "../languages-workflow.mjs";
import { wondrousActive, wondrousBonusesFor } from "../wondrous-effects.mjs";
import { buildMagicItem } from "../magic-item-builder-workflow.mjs";
import { bombAt } from "../alchemical.mjs";
import { BUCKLER_ATTACK_PENALTY, isBuckler, shieldArmInUse } from "../buckler.mjs";
import { craftAtLevel, throwBomb } from "../alchemical-workflow.mjs";
import { useConsumable } from "../consumable-use-workflow.mjs";
import { consumableEffectRef, consumableMode, consumableSpellRef, consumableUseRule } from "../consumable-use.mjs";
import { hasFocusTrait } from "../combat/refocus.mjs";
import { creatureActionHint, hasCreatureActivation } from "../creature-activation.mjs";
import { deletionValue } from "../deletion.mjs";
import { MILITARY_MOUNT_FLAG, MOUNTED_FLAG, mountedState } from "../combat/mounted.mjs";
import { isVehicleActor, vehicleOf, vehiclePilotView } from "../vehicles.mjs";
import { goodsUseLabel } from "../goods.mjs";
import { wondrousUseLabel } from "../wondrous-use.mjs";
import { spellEffectDurationLabel } from "../magic/spell-effects.mjs";
import {
  LIT_FLAG, lightSourceKeyForItem, lightSource, fireStarterWarning, itemIsLit,
  HOODED_FLAG, itemIsHooded, lightSourceHasHood
} from "../light-sources.mjs";
import {
  abilityScoresOf, classItemOf, classMinimumShortfall, classMinimumWarning
} from "../class-progression.mjs";
import { DEFENCE_LIST_KEYS, grantedDefenceEntries, tidyDefenceList } from "../defence-lists.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Item and source names go into the proficiency panel's HTML, and an
 * item name is whatever the GM typed. Escaped the same way migration.mjs
 * and add-effect-dialog.mjs already do it — through the DOM, which
 * cannot get the entity table wrong.
 */
function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}
const SYSTEM_ID = "trg-prime";


const ITEM_LABELS = {
  weapon: "Weapon",
  armour: "Armour",
  shield: "Shield",
  gear: "Gear",
  consumable: "Consumable",
  ammunition: "Ammunition",
  spell: "Spell",
  feat: "Feat",
  ability: "Ability",
  skill: "Skill",
  class: "Class",
  race: "Race",
  heritage: "Heritage",
  background: "Background",
  affliction: "Affliction",
  "creature-type": "Creature Type"
};

const ITEM_ICONS = {
  weapon: "icons/svg/sword.svg",
  armour: "icons/svg/breastplate.svg",
  shield: "icons/svg/shield.svg",
  gear: "icons/svg/item-bag.svg",
  consumable: "icons/svg/potion.svg",
  ammunition: "icons/svg/coins.svg",
  spell: "icons/svg/book.svg",
  feat: "icons/svg/upgrade.svg",
  ability: "icons/svg/aura.svg",
  skill: "icons/svg/d20-grey.svg",
  class: "icons/svg/upgrade.svg",
  race: "icons/svg/mystery-man.svg",
  heritage: "icons/svg/mystery-man.svg",
  background: "icons/svg/mystery-man.svg",
  affliction: "icons/svg/poison.svg",
  "creature-type": "icons/svg/mystery-man.svg"
};

export class TRGActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["trg-prime", "sheet", "actor"],
    position: {
      width: 1120,
      height: 800,
      // Explicit starting position (was an experiment testing whether
      // Foundry's own window-cascade auto-positioning explained a
      // "cannot be parsed" console warning — it didn't; the warning
      // persisted unchanged with this in place too). Kept anyway since
      // a fixed starting spot is a harmless, arguably nicer default than
      // a cascaded one.
      top: 80,
      left: 80
    },
    window: {
      icon: "fa-solid fa-shield-halved",
      resizable: true,
      // GM-only header entry (filtered in _getHeaderControls) that opens the
      // Universal Modifier with this actor pre-selected.
      controls: [
        {
          icon: "fa-solid fa-sliders",
          label: "Universal Modifier",
          action: "openUniversalModifier"
        }
      ]
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    },
    actions: {
      selectTab: TRGActorSheet.selectTab,
      toggleAttributeDetails: TRGActorSheet.toggleAttributeDetails,
      togglePermanentEffects: TRGActorSheet.togglePermanentEffects,
      effectGoToItem: TRGActorSheet.effectGoToItem,
      rollAttribute: TRGActorSheet.rollAttribute,
      rollSkill: TRGActorSheet.rollSkill,
      rollSpecialistSkill: TRGActorSheet.rollSpecialistSkill,
      rollSpellcraft: TRGActorSheet.rollSpellcraft,
      rollSave: TRGActorSheet.rollSave,
      rollInitiative: TRGActorSheet.rollInitiative,
      rollFlatCheck: TRGActorSheet.rollFlatCheck,
      rollWeaponAttack: TRGActorSheet.rollWeaponAttack,
      rollWeaponDamage: TRGActorSheet.rollWeaponDamage,
      reloadWeapon: TRGActorSheet.reloadWeapon,
      spinWeapon: TRGActorSheet.spinWeapon,
      castSpell: TRGActorSheet.castSpell,
      rollMagicRitual: TRGActorSheet.rollMagicRitual,
      rollSpellConcentration: TRGActorSheet.rollSpellConcentration,
      rollPowerPointRecovery: TRGActorSheet.rollPowerPointRecovery,
      rollDisbelieveIllusion: TRGActorSheet.rollDisbelieveIllusion,
      sustainSpell: TRGActorSheet.sustainSpell,
      endSpell: TRGActorSheet.endSpell,
      releaseStoredSpell: TRGActorSheet.releaseStoredSpell,
      dropSpell: TRGActorSheet.dropSpell,
      rollAidAnother: TRGActorSheet.rollAidAnother,
      investItem: TRGActorSheet.investItem,
      addFormula: TRGActorSheet.addFormula,
      activateItem: TRGActorSheet.activateItem,
      rollItemDepletion: TRGActorSheet.rollItemDepletion,
      damageItem: TRGActorSheet.damageItem,
      rollSleepingInArmour: TRGActorSheet.rollSleepingInArmour,
      showProficiencies: TRGActorSheet.showProficiencies,
      rollLuckCheck: TRGActorSheet.rollLuckCheck,
      applyDamage: TRGActorSheet.applyDamage,
      promptSetDoomed: TRGActorSheet.promptSetDoomed,
      promptSetSoulDrain: TRGActorSheet.promptSetSoulDrain,
      rollFrightenedRecovery: TRGActorSheet.rollFrightenedRecovery,
      rollSickenedRetch: TRGActorSheet.rollSickenedRetch,
      rollNaturalHealing: TRGActorSheet.rollNaturalHealing,
      applyAllGrants: TRGActorSheet.applyAllGrants,
      grantStartingWealth: TRGActorSheet.grantStartingWealth,
      perilDetect: TRGActorSheet.perilDetect,
      perilReset: TRGActorSheet.perilReset,
      perilTrigger: TRGActorSheet.perilTrigger,
      perilResolve: TRGActorSheet.perilResolve,
      addFromPicker: TRGActorSheet.addFromPicker,
      buildMagicItem: TRGActorSheet.buildMagicItem,
      throwBomb: TRGActorSheet.throwBomb,
      craftAtLevel: TRGActorSheet.craftAtLevel,
      useConsumable: TRGActorSheet.useConsumable,
      restoreItemUse: TRGActorSheet.restoreItemUse,
      setItemUses: TRGActorSheet.setItemUses,
      toggleShieldArm: TRGActorSheet.toggleShieldArm,
      useStaticAction: TRGActorSheet.useStaticAction,
      rollExhaustionCheck: TRGActorSheet.rollExhaustionCheck,
      rollFatigueRecovery: TRGActorSheet.rollFatigueRecovery,
      conditionValueStep: TRGActorSheet.conditionValueStep,
      conditionValueSet: TRGActorSheet.conditionValueSet,
      rollFalling: TRGActorSheet.rollFalling,
      rollCounteractCheck: TRGActorSheet.rollCounteractCheck,
      dailyPreparation: TRGActorSheet.dailyPreparation,
      openMaster: TRGActorSheet.openMaster,
      pickRepertoireSpell: TRGActorSheet.pickRepertoireSpell,
      pickCantrip: TRGActorSheet.pickCantrip,
      pickArchetypeCantrip: TRGActorSheet.pickArchetypeCantrip,
      prepareArchetypeCantrip: TRGActorSheet.prepareArchetypeCantrip,
      clearArchetypeCantrips: TRGActorSheet.clearArchetypeCantrips,
      pickFeatSlotSpell: TRGActorSheet.pickFeatSlotSpell,
      clearFeatSlotSpell: TRGActorSheet.clearFeatSlotSpell,
      swapRepertoireSpell: TRGActorSheet.swapRepertoireSpell,
      memoriseSpell: TRGActorSheet.memoriseSpell,
      memoriseCantrip: TRGActorSheet.memoriseCantrip,
      useItemCharge: TRGActorSheet.useItemCharge,
      applyAffliction: TRGActorSheet.applyAffliction,
      rollInitialExposureSave: TRGActorSheet.rollInitialExposureSave,
      rollAfflictionStageSave: TRGActorSheet.rollAfflictionStageSave,
      convictionMenu: TRGActorSheet.convictionMenu,
      endeavourMenu: TRGActorSheet.endeavourMenu,
      itemCreate: TRGActorSheet.itemCreate,
      editImage: TRGActorSheet.editImage,
      itemEdit: TRGActorSheet.itemEdit,
      itemDelete: TRGActorSheet.itemDelete,
      toggleItemEquipped: TRGActorSheet.toggleItemEquipped,
      toggleItemStowed: TRGActorSheet.toggleItemStowed,
      toggleItemLit: TRGActorSheet.toggleItemLit,
      toggleItemHood: TRGActorSheet.toggleItemHood,
      clearMounted: TRGActorSheet.clearMounted,
      pilotVehicle: TRGActorSheet.pilotVehicle,
      useGoods: TRGActorSheet.useGoods,
      skillCreate: TRGActorSheet.skillCreate,
      skillDelete: TRGActorSheet.skillDelete,
      specialistSkillCreate: TRGActorSheet.specialistSkillCreate,
      specialistSkillDelete: TRGActorSheet.specialistSkillDelete,
      manageStudiedTargets: TRGActorSheet.manageStudiedTargets,
      manageSkillSpecialties: TRGActorSheet.manageSkillSpecialties,
      manageEarnIncome: TRGActorSheet.manageEarnIncome,
      manageCreateProject: TRGActorSheet.manageCreateProject,
      effectCreate: TRGActorSheet.effectCreate,
      effectEdit: TRGActorSheet.effectEdit,
      effectToggle: TRGActorSheet.effectToggle,
      effectDelete: TRGActorSheet.effectDelete,
      openUniversalModifier: TRGActorSheet.openUniversalModifier,
      useFeat: TRGActorSheet.useFeat,
      manageLanguages: TRGActorSheet.manageLanguages
    }
  };

  /** Open the language picker (Chapter 2 — Languages). */
  static async manageLanguages() {
    await openLanguageManager(this.actor);
    this.render(false);
  }

  /** Run a feat's automated action (choice, queued bonus, configuration). */
  static async useFeat(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const { useFeat } = await import("../feats-workflow.mjs");
    return useFeat(this.actor, item);
  }

  /**
   * Inputs whose displayed value includes a live Active Effect
   * contribution are locked, because the form would otherwise submit the
   * boosted number back as the stored base — and the effect would then
   * add its share again on top of that, every save, growing each time.
   *
   * This used to set `readOnly`, which looks like a lock and isn't one:
   * a readonly control is still submitted with its form, so the value
   * went straight back into the document exactly as before. `disabled`
   * is what actually keeps a control out of the posted data, and is what
   * this needed to be all along. It only became urgent with races, where
   * one Dwarf writes five attribute slots on every character carrying
   * it, from first level, permanently.
   *
   * The paths come from an explicit scan (module/effect-slots.mjs)
   * rather than `actor.overrides`, for two reasons: the scan knows to
   * leave CUSTOM-mode changes alone, since those write no slot and the
   * box stays safe to edit, and it knows which effect each path came
   * from, so the tooltip can name it instead of saying "an effect".
   */
  _onRender(context, options) {
    super._onRender?.(context, options);
    // 0, not CONST.ACTIVE_EFFECT_MODES.CUSTOM — Foundry 14 deprecated
    // accessing that enum at all ("Changes now have string types"), and
    // it warned on every single render since this call fires from every
    // one. effect-slots.mjs's own CHANGE_TYPE_TO_MODE table already
    // fixes CUSTOM at 0 for its (still-numeric) internal contract, so
    // the literal says exactly what that table already commits to,
    // without touching the deprecated CONST at all.
    const locked = lockedSlotsFromChanges(
      actorEffectChanges(this.actor),
      0
    );
    const stored = { system: this.actor._source?.system ?? {} };
    for (const [path, entry] of Object.entries(locked)) {
      // querySelectorAll, not querySelector: several fields are rendered
      // in two places (land/fly/swim/climb appear on both the summary and
      // the details tab) and every tab stays in the DOM. Locking only the
      // first copy leaves the second one named, editable and holding the
      // derived value — which is the whole bug, still live, one tab over.
      //
      // AND EVERY PATH THE CHANGE GOVERNS, not the one it literally
      // names. A race writes `…movement.land`; since 3.412.0 the box is
      // called `…movement.land.base`. Matching only the literal string
      // is how the lock silently stopped protecting speeds, and one
      // sheet submit then wrote the derived value over the stored one.
      const inputs = [];
      for (const candidate of lockedInputPaths(path)) {
        inputs.push(...this.element.querySelectorAll(`[name="${candidate}"]`));
      }
      if (!inputs.length) continue;
      const tooltip = lockedSlotTooltip(
        entry.sources,
        storedSlotValue(stored, path) ?? 0,
        entry.additive
      );
      for (const input of inputs) {
        input.disabled = true;
        input.classList.add("effect-modified");
        input.dataset.tooltip = tooltip;
      }
    }

    // Magic tab's Spells table — Tradition/PP filter row. Plain DOM
    // row-hiding, not sheet state (see list-filters.mjs).
    wireSpellListFilters(this.element, {
      // :not(.innate-spell-row) — Innate Spells share the .spell-row
      // class (and their own article shares the .spellbook class) but
      // aren't filtered here; the two tables read differently enough
      // (no Prepared toggle relevance the same way) that Graham's ask
      // was specifically the main Spells table.
      rowSelector: ".spell-row:not(.innate-spell-row)",
      filters: [
        { select: ".spell-filter-tradition", data: "tradition", mode: "list" },
        { select: ".spell-filter-pp", data: "pp" }
      ]
    });
  }

  /** The Universal Modifier header entry is a GM tool; hide it from players. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if (game.user?.isGM) return controls;
    return controls.filter((c) => c.action !== "openUniversalModifier");
  }

  /** Open the Universal Modifier with this actor pre-selected. */
  static async openUniversalModifier() {
    const { openUniversalModifier } = await import("../modifier/app.mjs");
    openUniversalModifier({ actor: this.actor });
  }

  static PARTS = {
    form: {
      template: "systems/trg-prime/templates/actor/actor-sheet.hbs"
    }
  };

  static TABS = {
    primary: {
      initial: "summary",
      tabs: [
        {
          id: "summary",
          icon: "fa-solid fa-scroll",
          label: "Summary"
        },
        {
          id: "combat",
          icon: "fa-solid fa-shield-halved",
          label: "Combat"
        },
        {
          id: "actions",
          icon: "fa-solid fa-bolt",
          label: "Actions"
        },
        {
          id: "skills",
          icon: "fa-solid fa-list-check",
          label: "Skills"
        },
        {
          id: "features",
          icon: "fa-solid fa-medal",
          label: "Feats & Abilities"
        },
        {
          id: "items",
          icon: "fa-solid fa-bag-shopping",
          label: "Items"
        },
        {
          id: "magicItems",
          icon: "fa-solid fa-gem",
          label: "Magic Items"
        },
        {
          id: "magic",
          icon: "fa-solid fa-wand-magic-sparkles",
          label: "Magic"
        },
        {
          id: "effects",
          icon: "fa-solid fa-burst",
          label: "Effects"
        },
        {
          id: "description",
          icon: "fa-solid fa-book-open",
          label: "Description"
        },
        {
          id: "gm",
          icon: "fa-solid fa-lock",
          label: "GM"
        }
      ]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    const system = actor.system;

    context.actor = actor;
    context.system = system;
    context.systemVersion = game.system.version;
    context.editable = this.isEditable;
    context.isGM = game.user.isGM;
    context.enableLuck = game.settings.get(SYSTEM_ID, "enableLuck");
    context.luckArmed = Boolean(actor.getFlag(SYSTEM_ID, "luckArmed"));
    // Endeavour (optional rule): PC-only, the same treatment Level-from-XP
    // gets — an NPC is a GM stat block, not a character tracking downtime
    // advancement.
    context.endeavourEnabled =
      actor.type === "character" && game.settings.get(SYSTEM_ID, "endeavourEnabled");
    context.isCharacter = actor.type === "character";
    context.isNPC = actor.type === "npc";
    // ADJUSTING LEVEL (3.633.0, F&F 3.0 R13) — the GM's EL step.
    context.elAdjust = elAdjustOf(actor);
    // CONVICTION IS OPTIONAL, AND AN NPC'S IS TYPED (3.619.0; Chapter 12,
    // Graham's R11).
    context.useConviction = game.settings.get("trg-prime", "useConviction") !== false;
    // An animal companion is neither. It has no heritage, background,
    // archetype, ethics, deity or XP — the whole of Chapter 1's character
    // apparatus is inapplicable to it — and it does have one thing no
    // other actor type has, a master. Shipped at 3.233.2 wearing the
    // character sheet unaltered, which announced it as an "Adventurer"
    // with an editable XP box that could not affect anything (a
    // companion's level is pushed, not earned) and no mention anywhere of
    // the actor it belongs to.
    context.isCompanion = isCompanion(actor);
    if (context.isCompanion) {
      const master = masterIdOf(actor)
        ? (game.actors?.get(masterIdOf(actor)) ?? null)
        : null;
      const state = companionSyncState({
        masterLevel: master?.system?.identity?.level ?? null,
        companionLevel: system.identity?.level ?? 0,
        hasMaster: Boolean(master)
      });
      context.companionSummary = {
        ...state,
        // The STORED name when the master is gone, so a companion whose
        // master was deleted still says whose it was rather than going
        // blank and looking like a bug.
        masterName: master?.name ?? (system.companion?.masterName || ""),
        masterId: master?.id ?? "",
        masterMissing: !master && Boolean(system.companion?.masterId),
        baseCreature: system.companion?.baseCreature ?? "",
        startingSize: system.companion?.startingSize ?? "",
        maximumSize: system.companion?.maximumSize ?? ""
      };
      // The table's EL column. Read through the class item rather than
      // stored on the actor, because it is a fact about the table and
      // would go stale the moment the table changed.
      context.companionEffectiveLevel = companionEffectiveLevel(
        Array.from(actor.items ?? []).find((i) => i.type === "class") ?? null,
        system.identity?.level ?? 0
      );
    }
    // A familiar is neither a character nor a companion: it has no
    // heritage, background, archetype, ethics, deity, XP or class, and
    // every number it does have belongs to somebody else. What it needs
    // on the sheet is the master, whether the mirror is current, and how
    // many of its abilities it has spent.
    context.isFamiliar = isFamiliar(actor);
    if (context.isFamiliar) {
      const master = familiarMasterId(actor)
        ? (game.actors?.get(familiarMasterId(actor)) ?? null)
        : null;
      const stored = system.familiar?.mirror ?? null;
      // Rebuilt from the master's CURRENT data, so the banner reports
      // what has actually drifted rather than what drifted last time.
      const current = master ? familiarMirrorFrom(master.system, master.name) : null;
      const state = familiarSyncState({ stored, current, hasMaster: Boolean(master) });
      const abilityNames = Array.from(actor.items ?? [])
        .filter((i) => i.type === "ability").map((i) => i.name);
      const empowerPicks = Array.from(master?.items ?? [])
        .filter((i) => String(i.name).trim().toLowerCase() === "empower familiar").length;
      context.familiarSummary = {
        ...state,
        masterName: master?.name ?? (system.familiar?.masterName || ""),
        masterId: master?.id ?? "",
        masterMissing: !master && Boolean(system.familiar?.masterId),
        form: system.familiar?.form ?? "",
        source: stored?.source ?? "",
        effectiveLevel: familiarEffectiveLevel(system.identity?.level ?? 0),
        actionPoints: familiarActionPoints(abilityNames),
        // Named in full rather than as a count: "level, will, skills"
        // tells a player what to expect to change, where "3 things" does
        // not.
        driftedLabel: state.drifted.join(", ")
      };
      context.familiarAbilities = familiarAbilityBudget({
        abilityNames, level: system.identity?.level ?? 1, empowerPicks
      });
    }
    context.abilityChoices = ATTRIBUTE_LABELS;
    // What each immunity entry actually resolved into, shown under the
    // field. An entry that matched nothing says so — otherwise a typo is
    // indistinguishable from an immunity that simply never came up,
    // which is exactly how "Concentration" for "Concentrate" hid for
    // three releases.
    context.defenceSummary = describeDefenceField(system.combat?.immunities);
    // THE BOXES HOLD WHAT WAS TYPED (3.666.4). They showed the derived
    // lists, effects included, and this sheet submits the whole form on
    // every change: each save stored a Construct's eleven immunities once
    // more, and its creature type added them again on top. The stored value
    // fills the box; what effects add is listed under it, read only. See
    // defence-lists.mjs.
    const storedCombat = actor._source?.system?.combat ?? {};
    context.defenceStored = Object.fromEntries(DEFENCE_LIST_KEYS.map((key) =>
      [key, tidyDefenceList(storedCombat[key])]));
    context.defenceGranted = Object.fromEntries(DEFENCE_LIST_KEYS.map((key) =>
      [key, grantedDefenceEntries(system.combat?.[key], storedCombat[key]).join(", ")]));
    context.showEffectInternals = Boolean(actor.getFlag(SYSTEM_ID, SHOW_INTERNALS_FLAG));
    // Whether the Attributes breakdown (folded into Summary, 3.219.0) is
    // open. An INSTANCE flag, not an actor flag: this sheet submits on
    // every field change (`submitOnChange: true`), and the breakdown IS
    // a form full of fields, so a write from inside it — or from
    // anywhere else on the sheet — triggers a full re-render. Reading a
    // plain instance property here means that re-render still finds the
    // panel exactly as the player left it, open or shut, without a
    // round trip through the actor document for what is purely a
    // client-side display preference.
    context.attributesExpanded = this._attributesExpanded ?? false;
    // `canDrop` IS DERIVED HERE RATHER THAN STORED (3.490.0). Umbral
    // Veil's decoy can only be put down while the circle is still
    // following somebody: droppable says the spell HAS a decoy, a
    // non-null anchor says it has not been used yet. Storing the answer
    // would be a second copy of a fact the record already holds, free to
    // disagree with it after a drop.
    context.activeSpells = getActiveSpells(actor).map((entry) => ({
      ...entry,
      // READ OFF THE CIRCLES THEMSELVES (3.622.2, R1): each Region carries
      // whether it may be put down and whom it still follows.
      canDrop: lightShiftCanDrop(entry.id),
      // WHAT THE ROW SAYS IT IS (3.494.0). The template branched two
      // ways — sustained, else "PP locked (…)" — which was true only
      // while every unsustained entry was locked. (D) spells joined the
      // list in this release and would have been announced as locking PP
      // they do not lock, with an empty pair of brackets after it.
      state: activeSpellState(entry)
    }));
    // THE STAFF'S CONTENTS (3.495.0). Read on every render rather than
    // stored anywhere on the actor: the record lives on the bonded item,
    // and a copy here would be free to disagree with it after a
    // re-designation.
    const heldSpell = readStored(actor);
    context.storedSpell = heldSpell
      ? {
        name: heldSpell.record.spellName,
        itemName: heldSpell.item.name,
        ppPaid: heldSpell.record.ppPaid,
        releaseLabel: heldSpell.record.releaseCost === "free" ? "free action"
          : heldSpell.record.releaseCost === "reaction" ? "reaction" : "1 AP"
      }
      : null;
    // The instinctive repertoire (Chapter 3 x Chapter 9): the schedule
    // card only exists for a class that declares the style. A non-caster
    // has none of the three.
    context.repertoire =
      system.magic?.casterStyle === "instinctive" ? repertoireContext(actor) : null;
    // KNOWN CANTRIPS (3.323.0) — cantrips a class learns ONCE, which is
    // a different thing from the four the learned casters prepare each
    // morning. Gated on the class's own `cantripsKnown` rather than on
    // caster style: the style says how spells are cast, and this says
    // whether there is a permanent cantrip list to fill. See
    // module/magic/known-cantrips.mjs for why the two are kept apart.
    context.knownCantrips = cantripContext(actor);
    // One entry per caster archetype held — Animist, Arcanist, Gleeman,
    // Priest. A separate card each, never merged with the class's pools.
    context.archetypeCasting = archetypeCastingContext(actor);
    // The LEVELLED half (3.345.0): a Knight feat's PP 2 slot and any
    // caster-tier slots, grouped by tradition. Kept apart from the
    // cantrip cards above because the two are separately spendable —
    // and because a slot carries its granting feat's PP ceiling, which a
    // cantrip pool has no use for.
    context.featSpellSlots = featSlotContext(actor);
    // The learned caster's daily memorisation cycle (3.225.0) — the
    // other half of spell distribution. memorisationContext already
    // returns null for anyone whose class isn't "list" or "book" style,
    // so no extra gating is needed here.
    context.memorisation = memorisationContext(actor);
    // The Wizard's own restricted, growing Spell Book moved onto the
    // Wizard's Spellbook gear item's own sheet (3.230.3) — see
    // module/sheets/item-sheet.mjs's isSpellbookContainer block. The
    // Magic tab keeps only the daily Memorisation card above.
    context.sizeChoices = Object.fromEntries(
      Object.entries(SIZE_TABLE).map(([key, entry]) => [key, entry.label])
    );
    context.traditionChoices = {
      "": "—",
      ...Object.fromEntries(
        Object.entries(TRADITIONS).map(([key, entry]) => [key, entry.label])
      )
    };
    // Ethics (Chapter 8): the sheet's old free-text Alignment field is a
    // fixed fifteen-entry list now — see config.mjs's ETHICS for why.
    // The tooltip surfaces the book's own Guiding Principle for whatever
    // is currently picked, so the choice means something on the sheet
    // itself rather than sending a player back to the rulebook.
    //
    // THE ASPECT'S THREE (3.623.0, block 40, Graham's R6): "A cleric,
    // crusader or other divinity caster must select one of these ethics."
    // While an aspect is held only its ethics are offered; one chosen
    // outside them stays, labelled, with the warning below — the sheet
    // never changes a stored choice by itself.
    const ethicsView = aspectEthicsChoices(
      ETHICS,
      Array.from(actor.items ?? []).filter((i) => i.type === "divine-aspect"),
      system.identity?.ethics ?? ""
    );
    context.ethicsChoices = ethicsView.choices;
    context.ethicsOffList = ethicsView.offList;
    context.ethicsPrinciple = ETHICS[system.identity?.ethics]?.principle ?? null;
    // A PERIL (3.620.0; Chapter 12, Graham's R17): an NPC with the Peril
    // section on, or tagged `trap` — the section opens for either.
    context.perilShown = isPeril(actor);
    context.perilSkillChoices = Object.fromEntries(
      Object.entries(this.actor.system?.skills ?? {}).map(([key, skill]) => [key, skill?.label ?? key]));
    context.perilActionChoices = { reaction: "Reaction", free: "Free action", complex: "Complex (rolls initiative)" };
    context.perilStateChoices = { armed: "Armed", triggered: "Triggered", disabled: "Disabled", suppressed: "Suppressed", resolved: "Resolved", broken: "Broken", destroyed: "Destroyed" };
    // HAUNTS (3.629.0): what the printed lines were read as, and what Trigger will apply.
    if (context.perilShown) {
      const view = perilSheetView(actor, Number(game.time?.worldTime ?? 0));
      context.perilOnDisableChoices = { disabled: "Disables it", suppressed: "Suppresses it (a haunt)" };
      context.perilEntriesText = view.entries;
      context.perilEffectPreview = view.effect;
      context.perilSuppressedText = view.suppressed;
      // The single skill and DC above a printed line are greyed out (3.629.1):
      // the line replaces them, and a GM reading both was left to guess which won.
      context.perilDetectionByLine = Boolean(String(system.gm?.peril?.detection ?? "").trim());
      context.perilDisableByLine = Boolean(String(system.gm?.peril?.disable ?? "").trim());
    }
    context.dispositionChoices = {
      hostile: "Hostile",
      neutral: "Neutral",
      friendly: "Friendly",
      secret: "Secret"
    };

    context.tabs = this._prepareTabs("primary");
    context.tabList = Object.values(context.tabs).filter((tab) => {
      return tab.id !== "gm" || context.isGM;
    });

    context.attributes = Object.entries(system.attributes ?? {}).map(
      ([key, attribute]) => ({
        key,
        label: ATTRIBUTE_LABELS[key] ?? key,
        icon: ATTRIBUTE_ICONS[key] ?? "fa-solid fa-circle",
        ...attribute
      })
    );

    const abilityPoints = system.identity?.abilityPoints;
    if (abilityPoints) {
      const sign = (value) => (value >= 0 ? `+${value}` : String(value));
      context.abilityPoints = {
        ...abilityPoints,
        spentDisplay: sign(abilityPoints.spent),
        maxDisplay: sign(abilityPoints.max)
      };
    }

    context.isFatigueDead = system.identity?.fatigueStatus === "dead";

    // Study Target: capacity/usage for the Skills-tab readout and manager
    // button (characters only — an NPC has no studied-target pool).
    context.studiedTargets = context.isCharacter ? studiedTargetStatus(actor) : null;

    // Earn Income: the active multi-day task, if any (characters only).
    context.earnIncomeTask = context.isCharacter ? earnIncomeStatus(actor) : null;

    // Create: the current crafting project, if any (characters only).
    context.createProject = context.isCharacter ? createProjectStatus(actor) : null;

    // Skill Specialties (Artistry, Crafting, Perform): the chosen specialties
    // per skill for the Skills-tab readout, characters only.
    context.skillSpecialties = context.isCharacter
      ? Object.entries(SKILL_SPECIALTIES)
          // Only skills the character has actually developed — you pick a
          // specialty when you first gain a rank, so an undeveloped skill
          // (e.g. Perform with no ranks) shouldn't ask for one.
          //
          // ...unless something has GRANTED a specialty slot for it. The
          // Entertainer background hands out a bonus Perform specialty,
          // and a level-1 Entertainer has no Perform ranks — so this
          // filter removed the only row, which removed the Specialties
          // button entirely, and the background's own description pointed
          // the player at a control that wasn't on their sheet.
          .filter(([key]) => isSkillDeveloped(actor, key) || specialtyGrantCount(actor, key) > 0)
          .map(([key, config]) => {
            const status = specialtyStatus(actor, key);
            return {
              key,
              label: config.label,
              summary: specialtySummary(actor, key),
              used: status.used,
              cap: status.cap
            };
          })
      : null;
    const classBonusValue = Number(system.identity?.classBonus ?? 0);
    context.skills = TRGActorSheet.#buildSkillRows(system.skills, (key) => ({
      core: CORE_SKILL_KEYS.includes(key),
      label: SKILLS[key]?.label,
      // What the tick is worth. Shown beside the box so a player can see
      // the number without hunting through the total's tooltip — and it
      // is per SOURCE, so a skill two things call a class skill shows
      // both. The derive puts the sources on the skill.
      classSkillValue: classBonusValue * (system.skills?.[key]?.classSkillSources?.length ?? 0)
    }));
    context.specialistSkills = TRGActorSheet.#buildSkillRows(
      system.specialistSkills,
      () => ({ core: false })
    );

    context.itemGroups = this.#groupItems(actor.items);
    // Tradition/PP filter options for the Magic tab's Spells table
    // (Graham, 3.230.5) — derived from what the table is actually
    // showing, not a fixed list; see list-filters.mjs.
    // NO FILTERS ON THE OWNED-ITEM TABLES. 3.247.0 put them here and
    // Graham's correction was exact: "I do not want to filter the gear
    // that is already selected. I want the filters to apply to the add
    // boxes so that a character can filter what they are picking from
    // the lists." A character carries six weapons and chooses from
    // seventy-six — the filter belongs where the seventy-six are.
    // They live in the compendium picker now (picker-workflow.mjs).
    // The investment count for the Magic Items tab's badge. Chapter 11
    // caps how many items may be invested at once, and the cap was
    // derived (system.magic.investmentSlots) with nothing on the sheet
    // ever showing it against what is actually invested.
    const investedCount = Array.from(actor.items ?? []).filter((i) => i.system?.invested).length;
    const investmentMax = Number(actor.system?.magic?.investmentSlots ?? 0);
    context.investment = {
      used: investedCount,
      max: investmentMax,
      // OVER THE CAP IS MARKED, not merely displayed. investItem refuses
      // to take you past the limit, but a GM edit, an import or a
      // dropping magical ability score can all leave a character over it
      // — and a badge reading "7 / 5" in the same colour as "3 / 5" is a
      // number nobody reads twice. Found while live-testing the tab.
      over: investedCount > investmentMax
    };
    context.spellFilters = spellListFilterOptions(
      context.itemGroups.spells.map((row) => ({
        tradition: row.system?.tradition,
        ppCost: row.system?.ppCost
      })),
      TRADITIONS
    );

    // The header's Race/Heritage/Class/Background display used to be
    // separate free-text fields — a legacy holdover from before these
    // existed as compendium-backed items. Left as text inputs, they
    // duplicated (and could silently drift out of sync with) whatever
    // was actually embedded in the Foundations section below, and
    // their identical labels made them a confusing, incorrect landing
    // spot for a dragged item (an HTML text input intercepts a drop
    // and inserts it as literal text, rather than letting it reach the
    // actor's own item-creation handling). Now purely derived.
    context.identitySummary = {
      race: context.itemGroups.identity.find((i) => i.type === "race") ?? null,
      heritage: context.itemGroups.identity.find((i) => i.type === "heritage") ?? null,
      class: context.itemGroups.identity.find((i) => i.type === "class") ?? null,
      background: context.itemGroups.identity.find((i) => i.type === "background") ?? null,
      // The rulebook's own sentence, kept for the panel's tooltip — but
      // no longer the thing shown as the character's languages, which is
      // computed from the rules instead (module/languages.mjs).
      languageRule: context.itemGroups.identity.find((i) => i.type === "race")?.system?.languages ?? ""
    };
    // Foundations' Divine Aspect / Wizard School "Add" buttons: only
    // Cleric and Crusader carry the Deific Aspect class ability, only
    // Wizard carries Wizard School (config.mjs) — a Fighter shouldn't be
    // offered a picker for a selection their class never asks them to
    // make. Gated on the class ITEM's name, not the effective/archetype-
    // widened class list feats use, since neither ability is ever opened
    // to another class by an archetype.
    // THE CLASS'S MINIMUM ABILITY SCORE (page 43), R1, Graham's ruling of
    // 15 September 2026: warn, never refuse.
    //
    // THE SECOND HALF OF THE SAME WARNING. The first fires as a
    // notification when the class is added (documents/item.mjs), and a
    // notification is gone in five seconds — while the character it
    // describes lasts a campaign. This banner is what a player who
    // dismissed it, or who was handed the sheet already built, has left
    // to read, and it clears itself the moment an ability increase meets
    // the requirement.
    //
    // Read off the ACTOR rather than `identitySummary.class`, which is a
    // display row built by `#groupItems` and carries a name the display
    // rule may have rewritten.
    context.classMinimum = context.isCharacter
      ? classMinimumShortfall(classItemOf(actor), abilityScoresOf(actor))
      : null;
    context.classMinimumWarning = classMinimumWarning(context.classMinimum);
    // WHO NEEDS AN ASPECT (3.623.0, block 40, Graham's R4): every caster
    // of the Divinity tradition — the class, Divine Knight, the Priest,
    // Champion and Cloistered Priest archetypes — not only a Cleric or a
    // Crusader. The button appears for each, and a banner warns while
    // none is held: warned, never refused, like the class minimum.
    {
      const own = Array.from(actor.items ?? []);
      const classItem = own.find((i) => i.type === "class");
      const sources = divinityCasterSources({
        className: classItem?.name ?? "",
        classTradition: classItem?.system?.magicalTradition ?? "",
        classCasterStyle: classItem?.system?.casterStyle ?? "",
        classNeedsAspect: classNeedsDivineAspect(classItem?.name ?? context.identitySummary.class?.name),
        classDeclinesAspect: classDeclinesDivineAspect(classItem?.name ?? context.identitySummary.class?.name),
        featNames: own.filter((i) => i.type === "feat" && i.system?.category !== "Archetype").map((i) => i.name),
        archetypeNames: own.filter((i) => i.type === "feat" && i.system?.category === "Archetype").map((i) => i.name)
      });
      context.needsDivineAspect = sources.length > 0
        || classNeedsDivineAspect(context.identitySummary.class?.name);
      context.aspectMissingWarning = aspectMissingWarning(
        sources, own.filter((i) => i.type === "divine-aspect").length);
    }
    context.needsWizardSchool = classNeedsWizardSchool(context.identitySummary.class?.name);
    // The class's printed class-skill line, for the Skills tab. Applied
    // as well as shown since 3.204.0 — the class is one of the sources
    // the skill bonus is derived from (class-skills.mjs).
    // What the character is proficient with — from their class, their
    // feats, their aspects and any recorded weapon-group choice. Nothing
    // showed any of it, so the -4 non-proficiency penalty appeared on a
    // roll with nothing on the sheet to explain it.
    context.proficiencies = proficiencySummary(actor);
    // Only whether to show the icon. The panel behind it builds its own
    // lists when it opens, rather than every render paying for a list
    // that is usually not looked at.
    context.hasProficiencies = !proficiencySummaryIsEmpty(context.proficiencies);

    context.classSkillLine = context.identitySummary.class?.system?.classSkills || "—";
    // The breakdown that used to sit permanently under the Skills
    // heading. It is reference — read once, not every time the tab is
    // opened — so it is the heading's tooltip now, and the page carries
    // the tally instead.
    {
      const p = system.progression;
      context.skillPointsDetail = p
        ? `${p.source} gives ${p.skillPoints} + Int skill points a level — ` +
          `${p.skillPointsThisLevel} at your Intelligence` +
          `${p.skillPointBonus ? `, including +${p.skillPointBonus} from ${context.skillPointBonusSource}` : ""}` +
          `. Your budget is that rate across all ${system.identity?.level ?? 0} of your levels; ` +
          "the sheet does not track what your Intelligence was at each past level. " +
          `Class skills: ${context.classSkillLine}`
        : "";
    }
    // Which ability or feat is adding skill points, so the hint can name
    // it rather than leaving a player to wonder where the extra came
    // from. Read off the items themselves, not from a second list.
    context.skillPointBonusSource = Array.from(actor.items ?? [])
      .filter((i) => (i.type === "ability" || i.type === "feat") &&
        SKILL_POINT_BONUSES[String(i.name).trim().toLowerCase()])
      .map((i) => i.name)
      .join(" and ");
    // Casting ability is derived when a class names one, or when
    // Charismatic Caster has recorded a choice. In both cases a select
    // would post the derived value back into storage on the next form
    // submit — the sheet submits on change — so it reads out instead, and
    // says which of the two settled it.
    const abilityChoice = actor.getFlag("trg-prime", "castingAbilityChoice");
    context.castingAbilityFixed = Boolean(abilityChoice || system.progression?.magicalAbility);
    context.castingAbilityWhy = abilityChoice
      ? "Set by Charismatic Caster. Remove the feat to choose again."
      : `Fixed by your class — ${system.progression?.source ?? "your class"} casts off ${system.progression?.magicalAbility ?? ""}.`;
    // BSB and Caster Level, the two numbers a class supplies that the
    // Magic tab was showing as raw stored fields.
    //
    // A level-5 Cleric read "BSB 0" and "Caster Level 0" beside
    // "Spellcraft 11" — and 0 + Wisdom 6 is not 11. The class's own
    // table (BSB 5, caster level 5) was doing the work and the tab that
    // exists to explain a caster's numbers said nothing about it. Shown
    // read-only when the class supplies them, exactly as Tradition and
    // Casting Attribute already are, so what you read adds up.
    const classBSB = Number(system.progression?.bsb ?? 0);
    context.bsbFixed = Boolean(system.progression && classBSB !== 0);
    context.bsbValue = classBSB + Number(system._source?.magic?.bsb ?? system.magic?.bsb ?? 0);
    context.bsbWhy =
      `${classBSB} from your ${system.progression?.source ?? "class"} table` +
      `${Number(system.magic?.bsb ?? 0) ? ` plus ${system.magic.bsb} of your own` : ""}.`;
    context.casterLevelFixed = system.magic?.casterLevelSource === "class";
    context.casterLevelWhy =
      `Fixed by your class — ${system.progression?.source ?? "your class"} casts at ` +
      `caster level ${system.magic?.casterLevelValue}. Clear the class to set it by hand.`;

    context.languages = languagePanel(actor);

    context.currencyTotalGP = coinValueInGP(system.currency);

    // STARTING WEALTH (Chapter 6). Offered while it is still unclaimed,
    // and only to a character — a monster's purse is whatever the GM
    // typed. The breakdown is shown rather than just the total, because
    // a player who cannot see why their score is 4 cannot tell a missing
    // background from a Charisma their race never applied.
    const wealth = system.wealth ?? null;
    context.startingWealth = wealth;
    context.startingWealthBreakdown = wealth ? breakdownText(wealth) : "";
    context.startingWealthTaken = startingWealthGranted(actor);
    context.showStartingWealth = Boolean(
      wealth && actor.type === "character" && !context.startingWealthTaken
    );

    // NO DUPLICATE-SLOT WARNING (3.617.0, Graham's R21 of block 37): "There
    // is no restriction to how many items of the same type that can be worn.
    // Limits are driven by the Invested Trait only." Two metal helms are the
    // GM's to rule on, not the sheet's.

    // "A character may only wield one charged item at any one time" —
    // reported beside the duplicate-slot warning, and for the same
    // reason: the sheet says so, the table decides.
    context.chargedItemWarnings = chargedItemSheetWarnings(actor);

    const featLevel = system.identity?.level ?? 0;
    // Computed by featBudget in feats.mjs, which the harness runs with
    // real rows. It used to be forty lines of object literal here,
    // checked only by regexes over this file — and the same bug got
    // through that twice (see the note on featBudget).
    context.featPicks = featBudget({
      groups: context.itemGroups,
      level: featLevel,
      featNames: Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat" || i.type === "ability")
        .map((i) => i.name),
      classBonusFeats: system.progression?.bonusFeats ?? 0,
      // Endeavour (optional rule): each purchase is a flat, one-time
      // addition to that group's budget — applied even when the rule is
      // switched off, so a character who already spent Endeavour keeps
      // what they bought.
      endeavourFeats: system.identity?.endeavourFeats,
      // A module's campaign option (3.630.0) — Pillars of Faith's Undead
      // Lords bonus Archetype feat, when its world setting is ticked.
      extraPicks: registeredFeatPicks(actor)
    });
    // A companion's allowance is the Animal Companion table's own Feats
    // column and nothing else — one pool, not the Level Table's three.
    // Computed instead of the above rather than alongside it, so the
    // banner cannot show both and leave a player to guess which applies.
    if (context.isCompanion) {
      context.featPicks = companionFeatBudget({
        groups: context.itemGroups,
        bonusFeats: system.progression?.bonusFeats ?? 0
      });
    }
    // The DR an ordinary hit is actually reduced by, for the Summary
    // panel's headline stat. Composed by damage.mjs from the same three
    // terms the attack workflow feeds into resolveDamagePacket, rather
    // than by reading one of them off `armour.dr` and calling it the
    // total — which is what the panel did until 3.233.3, and why a Wolf
    // with DR 2 from its own hide advertised DR 0.
    context.totalDR = totalDamageReduction({
      armourDr: system.combat?.armour?.dr ?? 0,
      naturalArmourDr: system.combat?.naturalArmour?.dr ?? 0,
      bonusDr: system.combat?.dr?.total ?? 0,
      bdb: system.combat?.bdb?.total ?? 0
    });
    // MOUNTED (3.576.0): set and cleared by Mount / Dismount. Shown so a
    // rider can see why a longbow is refused, and cleared by hand when
    // the mount is gone some other way.
    const mounted = mountedState(this.actor);
    context.mounted = mounted.mounted ? mounted : null;
    // A STEED'S OWN SHEET (3.577.0, R8): an animal NPC can be ticked as a
    // military mount, which is what spares it the panic page 176 gives an
    // animal steed when a combat begins.
    // A VEHICLE (3.577.0, R11): its pilot DC and skill, with a button.
    context.vehiclePilot = vehiclePilotView(vehicleOf(this.actor),
      Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.label])));
    // AND ITS CREATURE NUMBERS HIDDEN (3.577.2, Graham's ruling): see
    // `isVehicleActor`. The template wraps each in {{#unless isVehicle}}.
    context.isVehicle = isVehicleActor(this.actor);
    context.steedOptions = this.actor.type === "npc"
      && String(system.details?.creatureType ?? "").trim().toLowerCase() === "animal"
      ? { military: Boolean(this.actor.getFlag?.("trg-prime", MILITARY_MOUNT_FLAG)) }
      : null;
    context.basicActions = BASIC_ACTIONS.map((action) => ({
      ...action,
      badge: actionBadge(action)
    }));
    // THE SENSES LINE, as the Codex's stat block prints it —
    // "Darkvision 120 ft." Built from the derived list rather than
    // recomputed, so the sheet and anything else asking agree.
    context.senseLines = (this.actor.system?.details?.senses ?? []).map((sense) => ({
      text: senseLine(sense),
      detects: sense.detects,
      enhanced: sense.enhanced,
      baseFeet: sense.baseFeet,
      modality: sense.modality,
      note: sense.note,
      // Where the ability item's NAME carries a range that disagrees with
      // the computed one, the sheet says so instead of just showing the
      // computed figure. The name is stale data somebody can go and fix;
      // hiding the disagreement is how it stays stale.
      claimedFeet: sense.claimedFeet,
      nameRangeDisagrees: sense.nameRangeDisagrees
    }));

    // HOW FAR THOSE SENSES ACTUALLY REACH RIGHT NOW (3.371.0) — the other
    // half of Chapter 8's sentence, which had no caller until the senses
    // block was confirmed to be on the sheet.
    //
    // A SHEET HAS NO POSITION, and light is entirely positional. So this
    // is read off the actor's token on the current scene and offered ONLY
    // when there is one: no token means no answer, and inventing Bright
    // Light as a stand-in would print a confident figure about a place
    // the creature is not standing in. Same best-effort shape as
    // `lightRows` in check-dialog.mjs, for the same reason — a missing
    // canvas must not throw on the way to opening a sheet.
    context.visualRange = null;
    try {
      const token = activeToken(this.actor);
      if (token && context.senseLines.length) {
        const { lightLevelForToken } = await import("../light-workflow.mjs");
        const { level } = lightLevelForToken(token.document ?? token);
        const report = visualRangeReport({
          ambientLevel: level,
          items: Array.from(this.actor.items ?? []),
          senses: this.actor.system?.details?.senses ?? [],
          shift: perceivedLightShift(Array.from(this.actor.effects ?? []))
        });
        // Nothing visual to report on is not the same as no token, but it
        // reads the same on a sheet — offer neither rather than an empty
        // heading.
        context.visualRange = report.rows.length ? report : null;
      }
    } catch (_e) {
      context.visualRange = null;
    }

    context.specialActions = SPECIAL_ACTIONS.filter((action) =>
      meetsActionRequirement(action.requirement, system)
    ).map((action) => ({ ...action, badge: actionBadge(action) }));
    // THE EFFECTS TAB (3.383.0). Built from EVERY effect acting on the
    // character, not just the ones embedded on the actor document.
    //
    // It used to read `actor.effects` alone, which rendered three rows
    // for a character with seventeen effects applied: the permanent ones
    // live on their parent items and arrive by `transfer: true`. Graham
    // asked for the permanent ones to be moved OUT of this table; they
    // were never in it. See effect-grouping.mjs for the measurement.
    const effectRow = (effect, parentItem) => {
      // A valued condition (Stunned 2, Soul Drain 3, Bleeding 5) is an
      // ActiveEffect carrying the condition id and its value in flags.
      const conditionId = effect.flags?.[SYSTEM_ID]?.condition ?? null;
      const definition = conditionId ? CONDITIONS[conditionId] : null;
      const valued = Boolean(definition?.valued);
      // The item that granted this, when it is still on the actor, so
      // the warning can name it. `featSource` holds an item id;
      // `grantedBy` holds a record with the source's own id.
      const flags = effect.flags?.[SYSTEM_ID] ?? {};
      const sourceId = flags.featSource ?? flags.grantedBy?.sourceId ?? null;
      const sourceName = sourceId ? (actor.items.get(sourceId)?.name ?? null) : null;
      const deletion = effectDeletion(effect, parentItem, sourceName);
      return {
        id: effect.id,
        name: effect.name,
        img: effect.img,
        disabled: effect.disabled,
        origin: parentItem?.name ?? effect.sourceName ?? effect.origin ?? "TRG Prime",
        parentItemId: parentItem?.id ?? sourceId ?? null,
        // OUR OWN CLOCK FIRST (3.476.0). An effect this system expires
        // no longer carries a Foundry duration to label — see
        // spellExpiryTiming for why there is only one clock now.
        duration: spellEffectDurationLabel(effect),
        changes: effect.changes?.length ?? 0,
        mechanical: isMechanical(effect),
        deletable: deletion.deletable,
        deleteWarn: deletion.warn,
        deleteReason: deletion.reason,
        conditionId,
        conditionLabel: definition?.label ?? null,
        valued,
        value: valued ? Number(effect.flags?.[SYSTEM_ID]?.value ?? 1) : null,
        damageType: effect.flags?.[SYSTEM_ID]?.damageType ?? null
      };
    };

    const groups = { condition: [], temporary: [], permanent: [] };
    for (const effect of actor.effects) {
      groups[effectGroup(effect, null)].push(effectRow(effect, null));
    }
    for (const item of actor.items ?? []) {
      for (const effect of item.effects ?? []) {
        groups[effectGroup(effect, item)].push(effectRow(effect, item));
      }
    }

    // NOTES ARE SPLIT OFF, not mixed in. 74 of the 132 item-borne
    // effects in Graham's world change nothing — they are printed notes
    // attached to a feat or an ability. Listing them beside real
    // modifiers would replace one unusable table with another.
    const split = (rows) => ({
      mechanical: rows.filter((r) => r.mechanical),
      notes: rows.filter((r) => !r.mechanical)
    });
    context.effectGroups = {
      conditions: split(groups.condition),
      temporary: split(groups.temporary),
      permanent: split(groups.permanent)
    };
    context.permanentEffectsExpanded = this._permanentEffectsExpanded ?? false;
    context.permanentEffectCount =
      groups.permanent.length;
    // Kept for anything still reading the flat list.
    context.effects = [...groups.condition, ...groups.temporary];

    return context;
  }

  /**
   * Convert a keyed skill collection into sorted rows for rendering.
   * @param {object} collection The keyed skill object.
   * @param {(key: string) => object} decorate Extra per-row properties.
   * @returns {object[]}
   */
  static #buildSkillRows(collection, decorate) {
    return Object.entries(collection ?? {})
      .map(([key, skill]) => {
        const extra = decorate(key) ?? {};
        return {
          ...skill,
          ...extra,
          key,
          label: extra.label || skill.label || key,
          abilityLabel: ATTRIBUTE_LABELS[skill.ability] ?? skill.ability
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  #groupItems(items) {
    const groups = {
      racialFeats: [],
      archetypeFeats: [],
      classFeats: [],
      generalFeats: [],
      racialAbilities: [],
      classAbilities: [],
      otherFeatures: [],
      weapons: [],
      armour: [],
      shields: [],
      gear: [],
      chargedItems: [],
      wondrousItems: [],
      consumables: [],
      ammunition: [],
      spells: [],
      innateSpells: [],
      afflictions: [],
      identity: [],
      origins: []
    };

    // Innate spells (Chapter 9) use level-based attack/save rather than the
    // PP/Spellcraft maths, so the figures are computed once here for the
    // separate Magic-tab table: attack = ability + level, save = 10 + ability
    // + level, using the caster's magical ability score and character level.
    const magicSystem = this.actor?.system ?? {};
    const innateAbility = Number(
      magicSystem.attributes?.[magicSystem.magic?.castingAbility]?.total ??
        magicSystem.magic?.castingAbilityScore ??
        0
    );
    const innateLevel = Number(magicSystem.identity?.level ?? 0);
    // The class item's id, for marking the feats it granted. Read from
    // the item list rather than from identitySummary, which is built
    // from this function's own output.
    // The FOUNDATION items — the things a character IS, rather than the
    // things they pick. A feat any of them hands over is a bonus feat
    // and does not spend a pick.
    //
    // A DIVINE ASPECT is one of them. Your deific aspect is a class
    // feature, and the reaction feat it hands a Crusader — Strike of
    // Retribution or Self Preservation — is part of that feature, not a
    // pick you paid for. Found live: a 3rd-level Crusader of Death read
    // "Class: 1 / 2" having chosen nothing.
    //
    // CLOSED OVER THE GRANT CHAIN, not just the direct list. A class
    // hands a character an ABILITY, and that ability hands over a feat:
    // Cleric → Priestly Path → War Priest, Rogue → Archetypal Path →
    // Assassin. Seeding with the foundation items alone missed the last
    // step and charged a class pick for the character's own archetype —
    // Nick's sheet read "Class: 3 / 2", over budget on two chosen feats.
    // Reported by Graham, 12 Aug 2026. See freeGrantSources.
    const foundationIds = freeGrantSources(
      Array.from(items ?? []),
      ["class", "divine-aspect", "wizard-school", "creature-type", ...FOUNDATION_ITEM_TYPES]
    );

    // Whether THIS character is proficient with each thing they are
    // carrying. Built once, outside the loop.
    //
    // Every weapon, armour and shield in the packs ships with an empty
    // `proficiency` field, so nothing on the sheet has ever been able to
    // say "you cannot use that" — the -4 simply appeared on the roll.
    const proficiency = proficiencyProfile(this.actor);

    for (const item of items) {
      const row = {
        id: item.id,
        // A FEAT THAT HAS CHOSEN SAYS WHAT IT CHOSE (3.553.1). Graham's
        // request: "the feat should show the selected pick in brackets
        // next to its name on the sheet." Three rows reading "Weapon
        // Focus" are three rows nobody can tell apart, on the one feat
        // whose whole content is the group it names. Display only — the
        // item keeps its own name, which is what every grant and
        // prerequisite matches on. See feats.mjs's featDisplayName.
        name: featDisplayName(item.name, recordedFeatChoice(this.actor, item)),
        img: item.img,
        type: item.type,
        typeLabel: ITEM_LABELS[item.type] ?? item.type,
        system: item.system,
        sort: item.sort
      };
      if (["weapon", "armour", "shield"].includes(item.type)) {
        const verdict = proficiencyOf(proficiency, item);
        // The NEGATIVE is the flag the template reads. A badge that
        // appears on the exception is a badge you notice; a tick on
        // every one of forty rows is wallpaper.
        row.notProficient = !verdict.proficient;
        row.proficiencyWhy = verdict.why;
      }
      // ALWAYS READY (3.666.0): a character's natural attack has no equip
      // toggle — it is part of the body. See combat/natural-ready.mjs.
      if (item.type === "weapon" && item.system?.natural && ALWAYS_READY_ACTOR_TYPES.includes(this.actor.type)) {
        row.alwaysReady = true;
      }

      if (["feat", "ability"].includes(item.type)) {
        row.usesMax = itemUsesMax(item);
        row.usesRemaining = itemUsesRemaining(item);
        row.usesUnlimited = row.usesMax === Infinity;
        // Tracked is `not null`, NOT truthiness. Handlebars treats 0 as
        // false, so an ability whose formula resolves to zero rendered
        // exactly like one with no uses at all — blank cell, no charge
        // button, nothing saying why. Nothing shipping could reach 0
        // until the Cleric's "Charisma +1" arrived in 3.209.0, which a
        // Cha -1 character resolves to zero.
        row.usesTracked = row.usesMax !== null && row.usesMax !== undefined;
        // A Creature Codex ability with an Action line gets the button
        // too. The name-keyed tables cannot know about it — it is
        // recognised by what the item DECLARES, not by what it is
        // called. Without this the cost, ladder and trigger parsed in
        // 3.265.0 exist on the item and nothing on the sheet can reach
        // them, which is exactly how the creature classes went ten
        // releases unreachable.
        row.hasFeatAction = hasFeatAutomation(item.name) || hasCreatureActivation(item)
          || Boolean(abilityChoicesOf(item));
        if (row.hasFeatAction) {
          row.featActionHint = featAutomationHint(item.name)
            || abilityChoiceHint(item)
            || creatureActionHint(item, this.actor?.system?.identity?.level);
        }
        // A WIRED PASSIVE gets an INFO control instead. Not the wand — there
        // is nothing to activate, and a button that looked activatable would
        // be worse than none. But a row with NO control at all is how these
        // came to read as unbuilt in the first place, and 3.309.0's passive
        // card could be posted by nothing: the only caller of `useFeat` is a
        // button the sheet never rendered for a passive.
        row.passiveAutomation = !row.hasFeatAction && isPassiveAutomation(item.name, item.type);
        if (row.passiveAutomation) row.featActionHint = featAutomationHint(item.name, item.type);
        // Did a FOUNDATION item hand this feat over? The feat budget
        // asks, and asking it here is the only place the source document
        // is still in scope — the row does not carry `flags`, which is
        // exactly how the budget filter came to be a no-op.
        //
        // Your class, your background, your race and your heritage all
        // give feats you did not spend a pick on. Every background in
        // Chapter 2 prints "Bonus feat: X" and means it; the City
        // heritage gives Skill Focus the same way. Counting them as
        // spent charged a 1st-level character for the background they
        // were born with — reported live by Graham at 3.210.1.
        row.bonusFeat = Boolean(
          foundationIds.has(item.flags?.["trg-prime"]?.grantedBy?.sourceId)
        );

        const category = item.system?.category;
        if (item.type === "feat" && category === "Racial") groups.racialFeats.push(row);
        else if (item.type === "feat" && category === "Archetype") groups.archetypeFeats.push(row);
        else if (item.type === "feat" && category === "Class") groups.classFeats.push(row);
        else if (item.type === "feat" && category === "General") groups.generalFeats.push(row);
        // ONE TABLE for these (Graham, 3.266.0): "Racial Abilities,
        // Creature Abilities and Creature Codex Abilities are
        // effectively the same thing." The table is headed Racial
        // Abilities on a character sheet and Creature Abilities on an
        // NPC's, which it already did — the Codex chapter simply joins
        // it rather than standing beside it.
        else if (item.type === "ability" && (category === "Racial" || category === "Creature")) groups.racialAbilities.push(row);
        else if (item.type === "ability" && (category === "Class" || category === "Proficiency")) groups.classAbilities.push(row);
        /*
         * AN ARCHETYPE-GRANTED ABILITY HAD NO BRANCH AT ALL (3.586.3).
         *
         * REPORTED FROM A LIVE TABLE, 24 September 2026: *"there is
         * nowhere on the sheet to make the Agile Display check or apply
         * Death Mark."*
         *
         * Three abilities in the pack carry `category: "Archetype"` —
         * Death Mark (Assassin), Agile Display (Gymnast) and Sense
         * Weakness (Mastermind) — and every branch above tests for
         * Racial, Creature, Class or Proficiency. So all three fell to
         * `otherFeatures`, which renders under a heading reading
         * "Uncategorised" and, until this release, carried no Use
         * control at all.
         *
         * Each one has had a complete handler since 3.185.0 with an AP
         * cost, a target picker and a check. None of it could be
         * reached. `row.hasFeatAction` was computed TRUE on all three
         * rows the whole time — the row knew it had an action and the
         * table it landed in had no way to say so.
         *
         * THEY JOIN THE ARCHETYPE FEATS TABLE rather than getting one of
         * their own, because that is where the feat that granted them
         * sits: the Assassin feat and the Death Mark it hands over read
         * as one thing on the page and now read as one thing on the
         * sheet. The row carries its own `typeLabel`, so nothing claims
         * they are feats.
         */
        else if (item.type === "ability" && category === "Archetype") groups.archetypeFeats.push(row);
        else groups.otherFeatures.push(row);
      }
      else if (item.type === "weapon") {
        const weaponTraits = String(item.system?.traits ?? "");
        // ONE PREDICATE, SHARED WITH THE WORKFLOW. This block used to
        // re-implement the question with `/\bload\s+[1-9]\d*\b/`, which
        // misses Quick Load — so Short Bow and Composite Shortbow, which
        // print Quick Load and no Load value, never got a reload button
        // at all, and the workflow's Quick Load branch was unreachable
        // through the interface. See `reloadControlFor`.
        const control = reloadControlFor(weaponTraits);
        row.hasLoad = control === RELOAD_CONTROL.load;
        row.hasMagazine = control === RELOAD_CONTROL.magazine;
        row.magazineCap = extractMagazine(weaponTraits);
        row.hasSpin = hasSpinTrait(weaponTraits);
        groups.weapons.push(row);
      }
      else if (item.type === "armour") groups.armour.push(row);
      else if (item.type === "shield") {
        // A BUCKLER is the one shield with a state a player toggles: is
        // the shield arm doing something else? Nothing on a sheet can
        // know, because the chapter's trigger is a choice.
        if (isBuckler(item)) {
          row.isBuckler = true;
          row.shieldArmInUse = shieldArmInUse(item);
          row.bucklerPenalty = BUCKLER_ATTACK_PENALTY;
        }
        groups.shields.push(row);
      }
      else if (item.type === "gear") {
        // A LIGHT NEEDS A SWITCH, because `equipped` is not "burning".
        // Only the five items the book gives an illumination step get
        // one, and `lightSourceKeyForItem` decides from the same table
        // the ladder reads — so the button cannot appear on something
        // the rules do not treat as a light, and cannot fail to appear
        // on something they do.
        if (lightSourceKeyForItem(item)) {
          row.isLightSource = true;
          row.isLit = itemIsLit(item);
          // THE HOOD (3.576.0) — only on a light that has one.
          row.hasHood = lightSourceHasHood(item);
          row.isHooded = itemIsHooded(item);
        }
        // THE GOODS THAT DO SOMETHING WHEN USED (3.576.0): Caltrops, Oil,
        // and an improvised attack with anything held in the hand.
        row.goodsUse = goodsUseLabel(item);
        row.hasInvested = /\binvested\b/i.test(String(item.system?.traits ?? ""));
        row.hasFormulae = /\bstores formulae\b/i.test(String(item.system?.traits ?? ""));
        // A charged item's remaining PP is the number a player looks at
        // most, and until 3.235.5 it was invisible without opening the
        // item — the row showed quantity, price and weight for a wand
        // whose entire state is its charge.
        const charged = item.flags?.[SYSTEM_ID]?.chargedItem;
        if (charged) {
          row.chargedMaxPP = Number(charged.maximumPP ?? 0);
          row.chargedPP = Number(item.system?.uses ?? 0);
          row.chargedRecharge = Number(charged.recharge ?? 0);
          row.chargedEmpty = row.chargedPP <= 0;
        }
        // CHARGED AND WONDROUS ITEMS ARE STORED AS GEAR, because that is
        // what they are mechanically — a thing you carry, wear or invest.
        // But a rod and a rucksack have nothing in common on a sheet, and
        // until 3.247.0 both fell into one Gear table with no way to add
        // either from its compendium. They are split out here by the flag
        // their builder writes, and given a tab of their own.
        const wondrous = item.flags?.[SYSTEM_ID]?.wondrous;
        if (charged) {
          row.chargedKind = String(charged.kind ?? "");
          row.chargedSpells = (charged.spells ?? []).map((s) => `${s.name} (${s.pp})`).join(", ");
          groups.chargedItems.push(row);
        } else if (wondrous) {
          row.wondrousSlot = String(item.system?.slot ?? "");
          const wondrousEffects = wondrousBonusesFor(item);
          row.wondrousAbilities = wondrousEffects.summary;
          row.wondrousReported = wondrousEffects.reported;
          // INVESTED AND WORN (3.617.1, G1 of the 3.617.0 drive; R16).
          row.wondrousActive = wondrousActive(item) && wondrousEffects.summary.length > 0;
          row.wondrousUse = wondrousUseLabel(item);
          groups.wondrousItems.push(row);
        } else {
          groups.gear.push(row);
        }
      }
      else if (item.type === "consumable") {
        // ALCHEMICAL ITEMS (Chapter 6) carry more than a consumable does:
        // a sub-category, and — if they have the Bomb trait — something
        // to throw and a ladder to climb. Shown on the row, because
        // "1d4 acid, splash 1" is what a player needs to decide with.
        const alchemical = item.flags?.[SYSTEM_ID]?.alchemical;
        if (alchemical) {
          row.alchemicalSection = alchemical.section ?? "";
          row.canCraftHigher = Boolean(alchemical.scaling);
          const bomb = bombAt(item);
          if (bomb) {
            row.isBomb = true;
            row.bombRange = bomb.rangeIncrement;
            row.bombLine = `${bomb.damage} ${bomb.damageType}${
              String(bomb.persistent) !== "0" ? `, recurring ${bomb.persistent}` : ""}${
              String(bomb.splash) !== "0" ? `, splash ${bomb.splash}` : ""}${
              String(bomb.bleed) !== "0" ? `, bleed ${bomb.bleed}` : ""}`;
          }
        }
        // A CONSUMABLE THAT CARRIES A SPELL CAN BE USED (3.310.0), and the
        // row has to say which kind it is for the button to make sense:
        // "Drink" and "Read" are different acts, and a Potion of Cure and a
        // Scroll of Fireball both used to print the word "Consumable" and
        // offer nothing to do about it.
        const consumableFlag = item.flags?.[SYSTEM_ID]?.consumable;
        // Every non-alchemical consumable gets the button, flagged or not.
        // A blank one that has never been told what it releases still needs
        // a way in — pressing it says what is missing, which is a thing a
        // player can act on, unlike a button that quietly is not there.
        if (!alchemical) {
          const spell = consumableSpellRef(item);
          const effect = consumableEffectRef(item);
          const rule = consumableUseRule(consumableFlag?.kind);
          row.consumableKind = String(consumableFlag?.kind ?? "");
          row.consumableLabel = row.consumableKind
            ? row.consumableKind[0].toUpperCase() + row.consumableKind.slice(1)
            : "";
          row.consumableVerb = rule.verb;
          row.consumableMode = consumableMode(item);
          row.consumableSpell = spell
            ? `${spell.name} (PP ${spell.pp})`
            : effect ? effect.label : "";
          if (spell) row.consumableLine = `${rule.verb}: ${spell.name} (PP ${spell.pp})`;
          else if (effect) row.consumableLine = `${rule.verb}: ${effect.label}`;
          row.canUseConsumable = true;
          // Only the description path has nothing recorded — and even that
          // one works, it just reads the item out for the GM.
          row.consumableNeedsSpell = row.consumableMode === "description";
        }
        groups.consumables.push(row);
      }
      else if (item.type === "ammunition") groups.ammunition.push(row);
      else if (item.type === "spell") {
        if (item.system?.innate) {
          row.usesMax = itemUsesMax(item);
          row.usesRemaining = itemUsesRemaining(item);
          row.usesUnlimited = row.usesMax === Infinity;
          row.usesTracked = row.usesMax !== null && row.usesMax !== undefined
            && row.usesMax !== Infinity;
          // A tracked spell already at its maximum has nothing to restore,
          // so the button says so rather than doing nothing when pressed.
          row.usesFull = row.usesTracked && row.usesRemaining >= row.usesMax;
          row.isFocus = hasFocusTrait(item.system?.traits);
          // The spell's own ability when it declares one (3.664.0).
          const ownAbilityKey = innateAbilityKey(item, this.actor.system?.magic?.castingAbility, this.actor.system?.attributes ?? {});
          const ownAbility = Number(this.actor.system?.attributes?.[ownAbilityKey]?.total ?? innateAbility);
          row.innateAttack = innateAttackFor(item, ownAbility, innateLevel).value;
          row.innateSave = innateSaveFor(item, ownAbility, innateLevel).value;
          row.isAttack = String(item.system?.category ?? "").toLowerCase() === "attack";
          row.isSave = String(item.system?.category ?? "").toLowerCase() === "save";
          groups.innateSpells.push(row);
        } else {
          // THE TABLE IS THE ANSWER TO "WHAT CAN I CAST?" (Graham's
          // ruling, 20 Aug 2026). Membership and castability are decided
          // by one rule, in one place, from the spell's own provenance —
          // not by a `prepared` stamp that nine different creation paths
          // had to remember to set, and that a tenth was always going to
          // miss. The only thing known-but-not-ready is a BOOK entry
          // awaiting today's preparation. See spell-availability.mjs.
          const source = spellAvailability(item);
          row.spellSource = source.label;
          row.spellSourceKey = source.key;
          if (source.onTable) groups.spells.push(row);
        }
      }
      else if (item.type === "affliction") groups.afflictions.push(row);
      // A CAMPAIGN ORIGIN lives on the Description tab, not in
      // Foundations — Graham asked for it under Creature Traits, which is
      // also the card that had one line of data and half a tab to hold
      // it. Kept OUT of the identity group deliberately: an item listed
      // in two places is two places to delete it from.
      else if (item.type === "origin") groups.origins.push(row);
      else {
        // Foundation items can carry automation too: seven heritages ask
        // the player to choose something (a cantrip, a spell school, a
        // crafting specialty) and Galad-Iar toggles its own light. Same
        // name-keyed registry the feats and abilities use.
        // Type as well as name: a divine aspect's Use action belongs to
        // every aspect, and its ten names are far too generic to put in
        // the feat namespace.
        row.hasFeatAction = hasFeatAutomation(item.name, item.type) || hasCreatureActivation(item)
          || Boolean(abilityChoicesOf(item));
        row.featHint = row.hasFeatAction
          ? (featAutomationHint(item.name, item.type)
            || abilityChoiceHint(item)
            || creatureActionHint(item, this.actor?.system?.identity?.level))
          : "";
        groups.identity.push(row);
      }
    }

    for (const group of Object.values(groups)) {
      group.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
    }

    return groups;
  }

  static selectTab(event, target) {
    event.preventDefault();

    const tab = target.dataset.tab;
    const group = target.dataset.group ?? "primary";
    if (!tab) return;

    const root = this.element;
    const groupElements = root?.querySelectorAll(
      `[data-group="${group}"][data-tab]`
    );
    if (!groupElements?.length) {
      throw new Error(
        `TRG Prime | No elements found for tab group "${group}"`
      );
    }

    let matchingButton = false;
    let matchingPanel = false;

    for (const element of groupElements) {
      const selected = element.dataset.tab === tab;
      element.classList.toggle("active", selected);

      if (element.matches('[role="tab"]')) {
        element.setAttribute("aria-selected", String(selected));
        element.tabIndex = selected ? 0 : -1;
        if (selected) matchingButton = true;
      }

      if (element.classList.contains("sheet-tab-panel")) {
        element.setAttribute("aria-hidden", String(!selected));
        if (selected) matchingPanel = true;
      }
    }

    if (!matchingButton || !matchingPanel) {
      throw new Error(
        `TRG Prime | No matching tab button and panel found for group "${group}" and tab "${tab}"`
      );
    }

    this.tabGroups[group] = tab;
  }

  /**
   * Open or close the Attributes breakdown on the Summary tab.
   *
   * Attributes used to be a tab of its own; folded into Summary instead
   * (3.219.0), hidden behind the icon next to the heading until clicked
   * — reference AND edit, the same "not permanently on screen" treatment
   * Proficiencies and the Skills breakdown already got. Those two are
   * read-only and open in a dialog; this one is still a live form (every
   * attribute's Base/Racial/Class/Item/Magic/Status/Other field), so it
   * has to stay inline and toggle in place instead.
   *
   * A DIRECT DOM TOGGLE, exactly like selectTab above, not a re-render —
   * and for the same reason: `submitOnChange: true` means editing any
   * field on this sheet re-renders the whole form, and routing "open the
   * panel" through `this.render()` would cost a round trip for what is
   * a purely client-side reveal. The instance flag is kept only so a
   * re-render triggered by something ELSE (an effect landing, a field
   * changing elsewhere on the sheet) still remembers whether this panel
   * was left open — see `_prepareContext`'s `attributesExpanded`.
   */
  static toggleAttributeDetails(event, target) {
    event.preventDefault();

    const card = target.closest(".summary-attributes");
    if (!card) return;

    const expanded = !card.classList.contains("expanded");
    card.classList.toggle("expanded", expanded);
    target.setAttribute("aria-expanded", String(expanded));
    target.dataset.tooltip = expanded
      ? "Hide the Attributes breakdown"
      : "Show the Attributes breakdown";

    this._attributesExpanded = expanded;
  }

  /**
   * Show or hide the permanent effects — the ones from race, heritage,
   * background, class, creature type, ability and feat.
   *
   * COLLAPSED BY DEFAULT, which was Graham's instinct and is right: they
   * are the largest group (5-7 mechanical rows plus 4-11 notes per
   * character at level 3) and the least often acted on. What changed is
   * that they are NEW CONTENT rather than moved content — the tab never
   * showed them at all.
   *
   * A DIRECT DOM TOGGLE, copying `toggleAttributeDetails` above rather
   * than inventing a second idiom. Its reasoning applies unchanged:
   * `submitOnChange: true` re-renders the whole form on any edit, so
   * routing a purely client-side reveal through `render()` costs a round
   * trip for nothing. The instance flag is kept so a re-render caused by
   * something ELSE — an effect landing, a field changing — remembers
   * whether the panel was open.
   */
  static togglePermanentEffects(event, target) {
    event.preventDefault();
    const card = target.closest(".permanent-effects");
    if (!card) return;
    const expanded = !card.classList.contains("expanded");
    card.classList.toggle("expanded", expanded);
    target.setAttribute("aria-expanded", String(expanded));
    target.dataset.tooltip = expanded
      ? "Hide the permanent effects"
      : "Show the permanent effects";
    this._permanentEffectsExpanded = expanded;
  }

  /**
   * Shared entry point for every d20 check made from the sheet.
   *
   * The sheet supplies the permanent modifiers already derived onto the actor;
   * the dialog supplies the situational ones. Holding Shift, Ctrl or Cmd skips
   * the dialog and rolls immediately.
   *
   * @param {Event} event
   * @param {object} config Base TRGCheck configuration.
   */
  static async #performCheck(event, config) {
    let situational = null;

    if (!skipDialog(event)) {
      situational = await promptCheckConfiguration({
        title: config.label,
        allowModifiers: !config.flat,
        dc: config.dc ?? null,
        actor: this.actor,
        checkType: config.type ?? "generic",
        // Which skill/save/attribute this is, so a permanent-but-scoped
        // conditional (Lead Boots' -4 to swim, Hardy's +2 against
        // poison) can tell whether it reaches this particular roll.
        subject: config.subject ?? "",
        actionKey: config.actionKey ?? ""
      });
      if (!situational) return null;
    }

    return TRGCheck.roll({
      actor: this.actor,
      ...config,
      convictionAdvantage: Boolean(situational?.convictionAdvantage),
      useLuck: Boolean(situational?.useLuck),
      // False when the dialog was skipped (Shift/Ctrl/Cmd), so the roll
      // itself still applies the automatic conditionals — otherwise the
      // fast path would be a way to dodge a racial penalty.
      conditionalsResolved: Boolean(situational?.conditionalsResolved),
      // SHIFT SKIPS THE QUESTIONS TOO (3.667.3): no tick-box prompt in
      // place of the dialog it skipped. See dice/offered-conditionals.mjs.
      offerConditionals: !skipDialog(event),
      dc: situational?.dc ?? config.dc ?? null,
      difficulty: situational?.difficulty ?? "medium",
      bias: situational?.bias,
      rollMode: situational?.rollMode,
      modifiers: [
        ...(config.modifiers ?? []),
        ...(situational?.modifiers ?? [])
      ]
    });
  }

  static async rollAttribute(event, target) {
    const key = target.dataset.attribute;
    const attribute = this.actor.system.attributes?.[key];
    if (!attribute) return;

    return TRGActorSheet.#performCheck.call(this, event, {
      label: `${ATTRIBUTE_LABELS[key] ?? key} Check`,
      type: "attribute",
      subject: key,
      modifiers: attribute.checkModifiers ?? [
        {
          label: ATTRIBUTE_LABELS[key] ?? key,
          value: Number(attribute.total ?? 0),
          type: "untyped"
        }
      ]
    });
  }

  /** Every action (Basic or Skill) invocable from a given skill key. */
  /** Every action registered for a given skill key. Basic Actions (Escape
   * included) are deliberately excluded here — they're already reachable
   * from the Actions tab, and offering the same action through two
   * different menus would be confusing, not additive. */
  static #actionsForSkillKey(key, actorSystem, featNames = [], abilityNames = []) {
    // Feat substitutions first (Impressive Performance opens Make an
    // Impression from Perform), then Bardic Performance's own six
    // (use-gated, so kept in a separate registry — see bard.mjs), then
    // the usual requirement filter over the combined list.
    return [
      ...actionsForSkill(key, SKILL_ACTIONS),
      ...substituteSkillActions(key, featNames, SKILL_ACTIONS),
      ...bardicPerformanceActions(key, abilityNames, SKILL_ACTIONS)
    ].filter((action) =>
      meetsActionRequirement(action.requirement, actorSystem)
      // AN ACTION A FEAT GRANTS IS OFFERED ONLY TO ITS OWNERS (3.360.0).
      // Survey Wildlife is the first — a General feat whose whole content
      // is "you can do this thing", so the action exists on the table and
      // has to be gated by the feat rather than by a skill rank. Declared
      // on the action itself, so the next one needs no change here.
      && (!action.requiresFeat || featNames.some(
        (n) => String(n).trim().toLowerCase() === String(action.requiresFeat).trim().toLowerCase()
      ))
    );
  }

  /**
   * Before rolling a skill, offer any registered actions for it alongside
   * the plain Generic Check — matching the rulebook's own framing that
   * Skill Actions (and General Skill Actions cross-listed to this skill)
   * are just different things you can do with the same roll. Skipped
   * entirely when nothing is registered for this skill yet, or when the
   * dialog-skip modifier is held.
   *
   * @returns {Promise<"generic"|object|null>} "generic" for the plain
   *   roll, an action definition to resolve instead, or null if cancelled.
   */
  static async #chooseSkillAction(event, key, label, skill, actorSystem, featNames = [], abilityNames = []) {
    const applicable = TRGActorSheet.#actionsForSkillKey(key, actorSystem, featNames, abilityNames);

    let autoCheckEligible = false;
    try {
      autoCheckEligible =
        game.settings.get(SYSTEM_ID, "autoChecks") &&
        Number(skill?.ranks ?? 0) > 0 &&
        !game.combat?.started;
    } catch {
      autoCheckEligible = false;
    }

    if (!applicable.length && !autoCheckEligible) return "generic";
    if (skipDialog(event)) return "generic";

    const options = applicable
      .map((action) => `<option value="${action.key}">${action.name}</option>`)
      .join("");
    const autoCheckOption = autoCheckEligible
      ? `<option value="__autoCheck__">Auto Check (Take ${10 + Number(skill.ranks)})</option>`
      : "";

    const result = await DialogV2.wait({
      window: { title: `${label} — Choose an Action`, icon: "fa-solid fa-bolt" },
      classes: ["trg-prime"],
      position: { width: 380 },
      content: `
        <div class="trg-prime trg-check-dialog">
          <div class="form-group">
            <label for="trg-skill-action">What are you doing?</label>
            <select id="trg-skill-action" name="actionKey">
              <option value="">Generic Check</option>
              ${autoCheckOption}
              ${options}
            </select>
          </div>
        </div>`,
      buttons: [
        {
          action: "roll",
          label: "Continue",
          icon: "fa-solid fa-dice-d20",
          default: true,
          callback: (evt, button) => {
            const form = button.form ?? button.closest?.("form");
            const FDE =
              foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
            return new FDE(form).object.actionKey;
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });

    // "GENERIC CHECK" IS AN EMPTY actionKey, AND AN EMPTY STRING IS NOT
    // A CANCELLATION. Found live at 3.251.0 while testing something else:
    // pick any skill that offers actions, leave the drop-down on its own
    // default of "Generic Check", press Continue — and nothing happened
    // at all. No dialog, no roll, no card, no error.
    //
    // The line below it was written for exactly this case and could
    // never run, because `!result` had already swallowed "" one line
    // earlier and returned null, which rollSkill reads as "the player
    // cancelled". Two guards, the broad one first, and the specific one
    // dead behind it.
    //
    // A closed dialog is null (rejectClose: false); Cancel is "cancel".
    // Those are the cancellations. "" is a choice.
    if (result === null || result === undefined || result === "cancel") return null;
    if (!result) return "generic";
    if (result === "__autoCheck__") return "autoCheck";
    return applicable.find((action) => action.key === result) ?? "generic";
  }

  static async rollSkill(event, target) {
    const key = target.dataset.skill;
    const skill = this.actor.system.skills?.[key];
    if (!skill) return;

    const label = SKILLS[key]?.label || skill.label || "Skill";

    const abilityNames = Array.from(this.actor.items ?? [])
      .filter((i) => i.type === "ability")
      .map((i) => i.name);
    // Feats AND class abilities gate and substitute actions (3.563.0):
    // a `requiresFeat` of "Folk Rites" or a substitution registered
    // against "Spirit Speaker" is read off an ability the same as a feat.
    // See action-workflow's actorFeatNames for the collision argument.
    const featNames = Array.from(this.actor.items ?? [])
      .filter((i) => i.type === "feat")
      .map((i) => i.name)
      .concat(abilityNames);
    const choice = await TRGActorSheet.#chooseSkillAction(event, key, label, skill, this.actor.system, featNames, abilityNames);
    if (choice === null) return null;
    if (choice === "autoCheck") {
      return rollAutoCheck(this.actor, key);
    }
    if (choice !== "generic") {
      // Bardic Performance (Bard, 1st): this specific action came from
      // bardicPerformanceActions above, not the always-free
      // SKILL_SUBSTITUTION_FEATS list, so it spends one of the day's
      // Cha+1 uses — checked and spent here, before resolveAction rolls
      // anything, matching Crusader's Mercy's spend-before-roll
      // convention. Refused outright if the use was spent elsewhere
      // (e.g. casting) between opening the dialog and confirming it.
      if (choice.bardicPerformance) {
        const item = bardicPerformanceItem(this.actor);
        const remaining = item ? itemUsesRemaining(item) : 0;
        if (!item || !remaining) {
          ui.notifications.warn("Bardic Performance: no uses remain today (resets at Daily Preparation).");
          return null;
        }
        await item.update({ "system.usesValue": remaining - 1 });
      }
      return resolveAction(this.actor, choice, { invokedSkillKey: key, event });
    }

    return TRGActorSheet.#performCheck.call(this, event, {
      label: `${label} Check`,
      subtitle: ATTRIBUTE_LABELS[skill.ability] ?? skill.ability,
      type: "skill",
      subject: key,
      modifiers: skill.checkModifiers ?? [
        { label: `${label} bonus`, value: Number(skill.total ?? 0), type: "untyped" }
      ]
    });
  }

  /**
   * Which of the specialist-capable actions is this roll, if any?
   *
   * Deliberately smaller than `#chooseSkillAction`: a specialist skill
   * has no ranks to Auto Check with and no feat substitutions pointed at
   * it, so the only question is which action — or none.
   */
  static async #chooseSpecialistAction(label, actions) {
    const options = actions
      .map((action) => `<option value="${action.key}">${action.name}</option>`)
      .join("");
    const result = await DialogV2.wait({
      window: { title: `${label} — Choose an Action`, icon: "fa-solid fa-bolt" },
      classes: ["trg-prime"],
      position: { width: 380 },
      content: `
        <div class="trg-prime trg-check-dialog">
          <div class="form-group">
            <label for="trg-specialist-action">What are you doing?</label>
            <select id="trg-specialist-action" name="actionKey">
              <option value="">Generic Check</option>
              ${options}
            </select>
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
    const key = String(result.actionKey ?? "").trim();
    if (!key) return "generic";
    return actions.find((action) => action.key === key) ?? "generic";
  }

  static async rollSpecialistSkill(event, target) {
    const key = target.dataset.specialist;
    const skill = this.actor.system.specialistSkills?.[key];
    if (!skill) return;

    const label = skill.label || "Specialist Skill";

    // AN ACTION MAY BE ATTEMPTED THROUGH A SPECIALIST SKILL (3.556.0).
    // Graham's amendment of 16 September 2026 opened Identify Power to
    // "an appropriate specialist skill"; the actions that say so declare
    // it, so this offers whatever is declared rather than naming one.
    // Nothing declared, or the dialog-skip modifier held, and this is the
    // plain roll it has always been.
    // AND AN ACTION A FEAT OPENS TO THIS SPECIALIST SKILL (3.630.0) —
    // Pillars of Faith's Veil Tracker: "You may use Spirit Lore instead of
    // Survival" to Track. Registered as a skill substitution whose skill is
    // `specialist:<slug of the skill's name>`.
    const featNames = Array.from(this.actor.items ?? []).filter((i) => i.type === "feat" || i.type === "ability").map((i) => i.name);
    const opened = substituteSkillActions(`specialist:${slugifyKey(label)}`, featNames, SKILL_ACTIONS);
    const openToSpecialists = [...specialistSkillActions(SKILL_ACTIONS), ...opened]
      .filter((a, i, all) => all.findIndex((b) => b.key === a.key) === i);
    if (openToSpecialists.length && !skipDialog(event)) {
      const chosen = await TRGActorSheet.#chooseSpecialistAction(label, openToSpecialists);
      if (chosen === null) return null;
      if (chosen !== "generic") {
        return resolveAction(this.actor, chosen, {
          invokedSkillKey: specialistInvokedKey(key),
          event
        });
      }
    }

    return TRGActorSheet.#performCheck.call(this, event, {
      label: `${label} Check`,
      subtitle: `Specialist · ${ATTRIBUTE_LABELS[skill.ability] ?? skill.ability}`,
      type: "specialist",
      subject: key,
      modifiers: skill.checkModifiers ?? [
        { label: `${label} bonus`, value: Number(skill.total ?? 0), type: "untyped" }
      ]
    });
  }

  static async rollSave(event, target) {
    const key = target.dataset.save;
    const save = this.actor.system.combat?.saves?.[key];
    if (!save) return;

    const label = `${key.charAt(0).toUpperCase()}${key.slice(1)} Save`;

    return TRGActorSheet.#performCheck.call(this, event, {
      label,
      type: "save",
      subject: key,
      modifiers: save.checkModifiers ?? [
        { label: `${label} bonus`, value: Number(save.total ?? 0), type: "untyped" }
      ]
    });
  }

  static async rollSpellcraft(event) {
    const spellcraft = this.actor.system.magic?.spellcraft;

    return TRGActorSheet.#performCheck.call(this, event, {
      label: "Spellcraft Check",
      subtitle: "Cast a Spell",
      type: "spellcraft",
      modifiers: spellcraft?.checkModifiers ?? [
        { label: "Spellcraft", value: Number(spellcraft?.total ?? 0), type: "untyped" }
      ]
    });
  }

  /**
   * A flat check never includes any modifiers, bonuses or penalties; only the
   * die face is compared to the DC.
   */
  static async rollFlatCheck(event, target) {
    const dc = Number(target?.dataset.dc ?? 10);

    return TRGActorSheet.#performCheck.call(this, event, {
      label: "Flat Check",
      type: "flat",
      flat: true,
      dc
    });
  }

  static async useStaticAction(event, target) {
    const source = target.dataset.actionSource;
    const key = target.dataset.actionKey;
    const registry = source === "special" ? SPECIAL_ACTIONS : BASIC_ACTIONS;
    const action = registry.find((entry) => entry.key === key);
    if (!action) return;
    /*
     * AN ACTION THAT OFFERS A CHOICE ARRIVES WITHOUT ONE (3.593.0).
     *
     * This passed `action.skills?.[0]` unconditionally, which is right
     * for the single-skill actions it was written for and silently wrong
     * for a multi-skill one: `resolveAction` treats an invoked key as a
     * decision already made, so handing it the FIRST skill is what stops
     * it asking. Giving Flowing Movement its three skills without
     * changing this line would have shipped a prompt that could never
     * fire — the vocabulary-entry-with-no-driver shape, one call site
     * away from being invisible.
     *
     * `actionNeedsSkillChoice` is the one authority on whether there is
     * a question to ask, so it decides here too rather than this line
     * re-deriving it from the array's length.
     */
    return resolveAction(this.actor, action, {
      invokedSkillKey: actionNeedsSkillChoice(action) ? null : (action.skills?.[0] ?? null),
      event
    });
  }

  static async manageStudiedTargets() {
    return openStudiedTargetManager(this.actor);
  }

  static async manageSkillSpecialties() {
    return openSpecialtyManager(this.actor);
  }

  static async manageEarnIncome() {
    return openEarnIncomeManager(this.actor);
  }

  static async manageCreateProject() {
    return openCreateManager(this.actor);
  }

  /**
   * Open the master's sheet from a companion's Master field.
   *
   * Warns rather than doing nothing when the master is gone or the
   * viewer cannot see it — a button that silently declines is
   * indistinguishable from a broken one.
   */
  static async openMaster() {
    // Both linked types use this button, and they store the id in
    // different places — a companion under `system.companion`, a familiar
    // under `system.familiar`. Asking both is cheaper and harder to get
    // wrong than branching on the actor type.
    const id = masterIdOf(this.actor) || familiarMasterId(this.actor);
    const master = id ? game.actors?.get(id) : null;
    if (!master) {
      ui.notifications.warn(
        `${this.actor.name} is bound to an actor that is no longer in this world.`
      );
      return null;
    }
    if (!master.testUserPermission(game.user, "LIMITED")) {
      ui.notifications.warn(`You do not have permission to view ${master.name}.`);
      return null;
    }
    return master.sheet.render(true);
  }

  static async rollExhaustionCheck() {
    return promptExhaustionCheck(this.actor);
  }

  static async rollFatigueRecovery() {
    return rollFatigueRecovery(this.actor);
  }

  static async rollFalling() {
    return rollFalling(this.actor);
  }

  static async rollCounteractCheck() {
    return rollCounteractCheck(this.actor);
  }

  static async dailyPreparation() {
    return performDailyPreparation(this.actor);
  }

  static async pickRepertoireSpell() {
    return openRepertoirePick(this.actor);
  }

  // KNOWN CANTRIPS (3.323.0). Its own action rather than a mode on the
  // repertoire pick: the two pools have different allowances, different
  // filters and different flags, and sharing a button would mean asking
  // the player which pool they meant every time.
  static async pickCantrip() {
    return openCantripPick(this.actor);
  }

  static async swapRepertoireSpell() {
    return openRepertoireSwap(this.actor);
  }

  // THE FOUR CASTER ARCHETYPES (3.344.0). One card per source, so these
  // take the source key off the button rather than guessing: a Cleric may
  // hold Arcanist, and then two cantrip cards are on screen at once.
  static async pickArchetypeCantrip(event, target) {
    return openArchetypePermanentPick(this.actor, target?.dataset?.source);
  }

  static async prepareArchetypeCantrip(event, target) {
    return openArchetypePrepare(this.actor, target?.dataset?.source);
  }

  static async clearArchetypeCantrips(event, target) {
    return clearArchetypePrepared(this.actor, target?.dataset?.source);
  }

  // FEAT-GRANTED LEVELLED SLOTS (3.345.0). The slot id travels on the
  // button: one character can hold a Knight's PP 2 slot and several
  // caster-tier slots at different ceilings, and a handler that guessed
  // would put a PP 4 spell in a slot that allows 2.
  static async pickFeatSlotSpell(event, target) {
    return openFeatSlotPick(this.actor, target?.dataset?.slot);
  }

  static async clearFeatSlotSpell(event, target) {
    return clearFeatSlot(this.actor, target?.dataset?.slot);
  }

  static async memoriseSpell() {
    return openMemoriseSpell(this.actor);
  }

  static async memoriseCantrip() {
    return openMemoriseCantrip(this.actor);
  }

  static async useItemCharge(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return useItemCharge(this.actor, item);
  }

  static async applyAffliction(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "affliction") return;
    return applyAffliction(item);
  }

  static async rollInitialExposureSave(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "affliction") return;
    return rollInitialExposureSave(this.actor, item);
  }

  static async rollAfflictionStageSave(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "affliction") return;
    return rollAfflictionStageSave(this.actor, item);
  }

  static async convictionMenu() {
    return openConvictionMenu(this.actor);
  }

  static async endeavourMenu() {
    return openEndeavourMenu(this.actor);
  }

  static async castSpell(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "spell") return;
    return castSpell(this.actor, item);
  }

  static async rollMagicRitual(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "spell") return;
    return rollMagicRitual(this.actor, item);
  }

  static async investItem(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return investItem(this.actor, item);
  }

  static async addFormula(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return addFormula(this.actor, item);
  }

  static async activateItem(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return activateItem(this.actor, item);
  }

  static async rollItemDepletion(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return rollItemDepletion(this.actor, item);
  }

  static async damageItem(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return damageItem(this.actor, item);
  }

  static async rollSleepingInArmour() {
    return rollSleepingInArmour(this.actor);
  }

  /**
   * What this character is proficient with, and what they are carrying
   * that they are not.
   *
   * A panel rather than a line on the tab. The first version printed
   * every clause as a chip under the Combat heading, and a Druid — whose
   * armour and shields are named individually rather than by category —
   * produced thirteen of them, wrapping onto three rows and shoving the
   * tab's actual content down the page. It is reference: read once,
   * checked occasionally, not wanted permanently on screen.
   */
  static async showProficiencies() {
    const actor = this.actor;
    const profile = proficiencyProfile(actor);
    const groups = proficiencyDescription(profile);

    const list = (entries) => entries.map((entry) => `
      <li>
        <span class="prof-what">${escapeHTML(entry.text)}</span>
        ${entry.source ? `<span class="prof-from">${escapeHTML(entry.source)}</span>` : ""}
      </li>`).join("");

    const section = (title, entries) => entries.length
      ? `<section class="prof-group"><h4>${title}</h4><ul>${list(entries)}</ul></section>`
      : "";

    // The other half of the question, and the half a player actually
    // asks: not "what may I use" but "why is there a -4 on this roll".
    const carried = Array.from(actor.items ?? [])
      .filter((item) => ["weapon", "armour", "shield"].includes(item.type))
      .map((item) => ({ item, verdict: proficiencyOf(profile, item) }))
      .filter((row) => !row.verdict.proficient)
      .sort((a, b) => a.item.name.localeCompare(b.item.name));

    const problems = carried.length
      ? `<section class="prof-group prof-problems">
           <h4><i class="fa-solid fa-triangle-exclamation"></i> Carrying, but not proficient</h4>
           <ul>${carried.map((row) => `
             <li>
               <span class="prof-what">${escapeHTML(row.item.name)}</span>
               <span class="prof-from">${escapeHTML(row.verdict.why)}</span>
             </li>`).join("")}</ul>
           <p class="prof-note">Attacks with these take -4 and fumble on an unmodified 1 or 2; armour and shields double their check penalty.</p>
         </section>`
      : "";

    const printed = String(actor.items.find((i) => i.type === "class")?.system?.proficiencies ?? "").trim();

    await DialogV2.wait({
      window: { title: `${actor.name} — Proficiencies`, icon: "fa-solid fa-shield-halved" },
      // The class goes on the DIALOG, not just on the div inside it.
      // `.trg-prime:not(.sheet) .window-content` is what paints the
      // parchment background; without it a DialogV2 keeps Foundry's own
      // near-transparent chrome, and this panel's dark ink text renders
      // over whatever is behind the window. Which is exactly how it
      // shipped in 3.215.2 — unreadable, reported by Graham.
      classes: ["trg-prime", "trg-proficiency-dialog"],
      position: { width: 520 },
      content: `<div class="trg-prime trg-proficiency-panel">
        ${section("Armour", groups.armour)}
        ${section("Shields", groups.shield)}
        ${section("Weapons", groups.weapon)}
        ${problems}
        ${printed ? `<p class="prof-printed">${escapeHTML(printed)}</p>` : ""}
      </div>`,
      buttons: [{ action: "close", label: "Close", default: true }]
    });
  }

  static async rollLuckCheck() {
    return rollLuckCheck(this.actor);
  }

  static async applyDamage() {
    return applyDamage(this.actor);
  }

  static async promptSetDoomed() {
    return promptSetDoomed(this.actor);
  }

  static async promptSetSoulDrain() {
    return promptSetSoulDrain(this.actor);
  }

  static async rollFrightenedRecovery() {
    return rollFrightenedRecovery(this.actor);
  }

  static async rollSickenedRetch() {
    return rollSickenedRetch(this.actor);
  }

  static async rollNaturalHealing() {
    return rollNaturalHealing(this.actor);
  }

  /**
   * Take the character's starting coin (Chapter 6), once.
   *
   * A button rather than something that happens at creation: the score
   * is not settled until race, background and class are all on the
   * sheet, and a character built in a different order would otherwise
   * be paid a Charisma or a background short.
   */
  static async grantStartingWealth() {
    return grantStartingWealth(this.actor);
  }

  /** A peril's detection: a secret check for each PC on the scene (R17). */
  static async perilDetect(event) {
    event?.preventDefault?.();
    const { rollPerilDetection } = await import("../peril-workflow.mjs");
    return rollPerilDetection(this.actor);
  }

  /** A peril's Reset: armed again, its progress gone. */
  static async perilReset(event) {
    event?.preventDefault?.();
    const { resetPeril } = await import("../peril-workflow.mjs");
    return resetPeril(this.actor);
  }

  /** A peril's Trigger: its Effect rolled and applied (3.629.0). */
  static async perilTrigger(event) {
    event?.preventDefault?.();
    const { triggerPeril } = await import("../peril-workflow.mjs");
    return triggerPeril(this.actor);
  }

  /** A peril's Resolution: ended for good (3.629.0). */
  static async perilResolve(event) {
    event?.preventDefault?.();
    const { resolvePeril } = await import("../peril-workflow.mjs");
    return resolvePeril(this.actor);
  }

  static async applyAllGrants(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return applyAllGrants(this.actor, item);
  }

  /**
   * The single, reusable handler behind every "Add" button on the
   * sheet — which pack and filter to use comes entirely from the
   * button's own data-slot attribute (a key into PICKER_SLOTS), so
   * adding a new slot elsewhere on the sheet is a template change and
   * a config entry, not a new handler method.
   */
  /**
   * Build a magic item from Chapter 11's own construction rules, rather
   * than typing one into a blank item. Graham, 3.247.4: "the rules are
   * there to custom build magical items, when I say I need automation
   * this is kind of important."
   */
  static async buildMagicItem() {
    return buildMagicItem(this.actor);
  }

  /**
   * Say whether the buckler's shield arm is being used for something
   * else — which costs its DB and adds its attack penalty (Chapter 6).
   */
  static async toggleShieldArm(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    return item.update({
      [`flags.trg-prime.buckler.armInUse`]: !shieldArmInUse(item)
    });
  }

  /** Throw an alchemical bomb (Chapter 6). */
  static async throwBomb(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    return throwBomb(this.actor, item);
  }

  /** Craft an alchemical item at a higher level (Chapter 6). */
  /**
   * PUT A USE BACK. Graham, 14 Aug 2026: "Innate spells with the Focus
   * trait have no way of being reset."
   *
   * They had none. The Magic tab printed `2 / 3` as plain text beside
   * Cast, Edit and Delete — a counter that could only ever go down. The
   * two things that restore uses were Daily Preparation (all-or-nothing,
   * and a whole day) and a successful Refocus check, which needs the Focus
   * trait, the skill action, and a good roll. Nothing let a GM simply
   * hand a use back, and nothing let them correct a misclick.
   *
   * Deliberately NOT gated on the Focus trait: the missing affordance is
   * the same for every tracked item, and a control that only appears on
   * some rows is the next thing to be reported.
   */
  static async restoreItemUse(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    const max = itemUsesMax(item);
    if (max === null || max === Infinity) return;
    const next = Math.min(max, itemUsesRemaining(item) + 1);
    if (next === itemUsesRemaining(item)) return;
    return item.update({ "system.usesValue": next });
  }

  /**
   * The same counter, set to an exact figure — for a correction rather
   * than a step.
   *
   * A BUTTON AND A PROMPT, not a bound input: this sheet submits on every
   * change and binds inputs to the ACTOR's system paths, so a number field
   * sitting in an item row would either write to the wrong document or
   * need its own escape from the form. `conditionValueSet` already
   * established the pattern for a per-item figure and this follows it.
   */
  static async setItemUses(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    const max = itemUsesMax(item);
    if (max === null || max === Infinity) return;
    const current = itemUsesRemaining(item);

    const typed = await foundry.applications.api.DialogV2.prompt({
      window: { title: `${item.name} — Uses Remaining` },
      classes: ["trg-prime", "trg-check-dialog"],
      content: `<div class="trg-prime trg-check-dialog">
        <div class="form-group"><label for="trg-uses">Uses left today (0 – ${max})</label>
        <input id="trg-uses" type="number" name="uses" value="${current}" min="0" max="${max}" step="1" autofocus></div>
      </div>`,
      ok: {
        label: "Set",
        callback: (e, button) => Number(button.form.elements.uses?.value)
      },
      rejectClose: false
    });
    if (typed === null || typed === undefined || !Number.isFinite(typed)) return;

    const next = Math.max(0, Math.min(max, Math.floor(typed)));
    if (next === current) return;
    return item.update({ "system.usesValue": next });
  }

  static async useConsumable(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (!item) return;
    return useConsumable(this.actor, item);
  }

  static async craftAtLevel(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    return craftAtLevel(this.actor, item);
  }

  static async addFromPicker(event, target) {
    const slotKey = target.dataset.slot;
    const slot = PICKER_SLOTS[slotKey];
    if (!slot) {
      console.warn(`TRG Prime | Unknown picker slot "${slotKey}"`);
      return;
    }

    const items = Array.from(this.actor.items ?? []);

    // "When you create your character at 1st level you select ONE
    // background of your choice" (Chapter 2). These five slots each hold
    // exactly one item, and a second silently stacks a second set of
    // whatever the first granted — a bonus feat and three class bonuses
    // for a background, ability modifiers and immunities for a creature
    // type — while the identity header shows only the first. The sheet
    // says one thing and the arithmetic does another.
    //
    // WARNED, NOT BLOCKED, for all but one of them: a GM rebuilding a
    // character may want the old one present while they swap.
    //
    // BACKGROUND IS THE EXCEPTION AS OF 3.549.0 (Graham's ruling, 10
    // September 2026): it is refused outright, by TRGItem._preCreate, so
    // that every route in — this picker, a compendium drag, a macro —
    // meets the same rule. This returns before opening the picker so the
    // refusal is stated once, here, rather than after the player has
    // chosen something that is then rejected.
    const SINGLE_SLOTS = {
      background: "background",
      // A character has exactly one campaign origin (Graham's ruling,
      // 3.250.0) — and "exactly one" here means what it already means
      // for the other four: warned about, not enforced by deleting the
      // one they had. See the note above for why this sheet warns.
      origin: "origin",
      race: "race",
      heritage: "heritage",
      class: "class",
      creatureType: "creature-type"
    };
    // ONE DIVINE ASPECT (3.623.0, Graham's R5) — refused by
    // TRGItem._preCreate on every route; said here before the picker
    // opens rather than after a choice that would only be rejected.
    if (slotKey === "divineAspect") {
      const refusal = secondAspectRefusal(
        items.filter((i) => i.type === "divine-aspect"), this.actor.name);
      if (refusal) {
        ui.notifications.warn(refusal);
        return;
      }
    }
    const singleType = SINGLE_SLOTS[slotKey];
    if (singleType) {
      const existing = items.filter((i) => i.type === singleType);
      // The three page-20 slots are refused outright by
      // TRGItem._preCreate, so this returns before opening a picker whose
      // result would only be rejected. Widened from background alone at
      // 3.552.0 with the rule itself.
      if (existing.length && TRGItem.LOCKED_IDENTITY_TYPES.includes(singleType)) {
        ui.notifications.warn(
          `${this.actor.name} already has a ${singleType}: ${existing.map((i) => i.name).join(", ")}. ` +
          `A character selects one ${singleType} at 1st level and keeps it — remove the existing one first.`
        );
        return;
      }
      if (existing.length) {
        ui.notifications.warn(
          `${this.actor.name} already has a ${singleType}: ${existing.map((i) => i.name).join(", ")}. ` +
          `A character has only one — remove it first unless you are deliberately comparing.`
        );
      }
    }

    // Effective races: the race item PLUS every lineage opened by owned
    // Heritage-trait feats (Half-Elf opens elf AND half-elf feats, etc.) —
    // see HERITAGE_RACE_GRANTS in feats.mjs.
    const heritageFeats = items
      .filter((i) => i.type === "feat" && /\bheritage\b/i.test(String(i.system?.traits ?? "")))
      .map((i) => i.name);
    // Adoptive Race (General, Heritage trait): the recorded adopted race
    // REPLACES the birth race for racial heritage/feat selection — other
    // Heritage feats still widen the list as usual.
    const adoptedRace = this.actor.getFlag(SYSTEM_ID, "adoptiveRace") ?? "";
    // Effective classes: the class item PLUS every class-feat list opened
    // by owned Archetype feats (Animist opens Druid feats...). The owned
    // archetype names themselves gate archetype-trait class feats
    // (Archer, Aegis, Thief...).
    const archetypeFeats = items
      .filter((i) => i.type === "feat" && i.system?.category === "Archetype")
      .map((i) => i.name);
    const context = {
      race: effectiveRaces(adoptedRace || (items.find((i) => i.type === "race")?.name ?? ""), heritageFeats),
      // 3.669.0: a registered access list may be limited to one heritage.
      heritage: items.find((i) => i.type === "heritage")?.name ?? "",
      class: effectiveClasses(items.find((i) => i.type === "class")?.name ?? "", archetypeFeats),
      // THE CLASS TRAITS AN OWNED FEAT OPENS (3.670.0; Inner Magic, B6-7:
      // the feats with the Mystic trait). Only a feat's own class trait is
      // matched against these: not a registered access list, not a feat's
      // source class (found in review: Inner Magic opened the Mystic's whole
      // list of core feats). See feats.mjs `declaredClassFeatAccess`.
      traitClasses: declaredClassFeatAccess(items).join(", "),
      // The class the character ACTUALLY is, separate from the lists an
      // archetype opens. A "Non-Fighter" prerequisite is about what you
      // are, not what feats you can reach: a Wizard who takes Thief has
      // effective classes "Wizard, Rogue" and would otherwise be refused
      // every Non-Rogue feat despite not being a Rogue.
      ownClass: items.find((i) => i.type === "class")?.name ?? "",
      // The class TYPE — Martial, Expert, Adept, or the Bard's
      // "Adept/Expert". Class feats traited with a tier gate on it, and
      // it had nowhere to come from until classes carried the field.
      //
      // PLUS whatever an archetype adds. War Priest is "considered to be
      // martial (as well as adept) for the purpose of selecting feats",
      // and reading `classType` alone left a Cleric who took it still
      // Adept — refused all forty Martial-traited class feats in the
      // compendium (Graham, 13 Aug 2026). Composed through effectiveTiers
      // for exactly the reason `class` above goes through
      // effectiveClasses.
      tier: effectiveTiers(
        items.find((i) => i.type === "class")?.system?.classType ?? "",
        archetypeFeats
      ),
      archetypes: archetypeFeats.join(", "),
      tradition: this.actor.system?.magic?.tradition ?? "",
      // The Companion-trait feats are offered on a companion's own sheet
      // and nowhere else (Graham, 3.249.2). Read off the document type,
      // because a companion IS a type in this system.
      isCompanion: this.actor.type === "companion",
      // R8 (3.623.0): which specialist spells this character may learn.
      specialistAccess: slotKey === "spell"
        ? await (await import("../aspect-workflow.mjs")).specialistAccessFor(this.actor)
        : null
    };

    // EVERY FEAT AND ABILITY NAME THAT EXISTS, so the prerequisite gate
    // can tell a clause that names a feat ("Shield Block") from prose a
    // comma split happened to leave looking like one ("Underworld").
    // Graham, 13 Aug 2026: "quite a lot of feats have another feat as
    // one" — fifty-one do, and none were enforced without this set.
    //
    // Abilities are included because the printed text does not
    // distinguish them: six feats require Wild Shape, which this system
    // stores as a Druid class ability. Foundry caches a pack index after
    // the first read, so this costs one lookup per session.
    const knownNames = await knownPrerequisiteNames();

    return addItemFromPicker(this.actor, slot.pack, {
      filter: withArchetypeProgressionGate(
        // THE HERITAGE GATE SITS INSIDE the prerequisite gate, so a feat
        // hidden for being Heritage is hidden whatever its prerequisites
        // say. "1st level only" is not a prerequisite the way BAB +2 is —
        // it is a window that has closed.
        withHeritageGate(
          withPrerequisitesGate(
            withFeatGates(withOwnedExclusion(buildPickerFilter(slotKey, context), this.actor, slotKey), this.actor, slotKey),
            this.actor,
            slotKey,
            knownNames
          ),
          this.actor,
          slotKey
        ),
        this.actor,
        slotKey
      ),
      fields: slot.fields,
      title: slot.title,
      // Only meaningful for archetypeFeat — undefined elsewhere, so
      // pickFromPack falls back to its own generic default message.
      emptyMessage: (slotKey === "archetypeFeat"
        ? archetypeProgressionBlockReason(this.actor) ?? heritageBlockReason(this.actor)
        : heritageBlockReason(this.actor)) ?? undefined,
      purchasable: slot.purchasable,
      customisable: slot.customisable,
      // The drop-down filters for THIS slot's pack — on the add box,
      // which is the list worth filtering. The actor is passed because
      // one facet's DEFAULT depends on who is picking: a creature's
      // class list opens on creature classes, a character's on character
      // classes.
      facets: facetsFor(slotKey, this.actor)
    });
  }

  static async rollSpellConcentration() {
    return rollSpellConcentration(this.actor);
  }

  static async rollPowerPointRecovery() {
    return rollPowerPointRecovery(this.actor);
  }

  static async rollDisbelieveIllusion() {
    return rollDisbelieveIllusion(this.actor);
  }

  /**
   * THE SAME SUSTAIN THE ACTIONS TAB PERFORMS (3.424.0).
   *
   * This used to call `sustainActiveSpell` directly — the storage
   * primitive, which extends the duration and knows nothing about
   * actions, AP or the printed requirements. So it sustained correctly
   * and for free, while the Actions tab's button charged for a sustain
   * it never performed (Graham, 27 August 2026). Neither door was doing
   * the whole rule; now both ask the one function that is the rule.
   */
  static async sustainSpell(event, target) {
    const { sustainSpellAction } = await import("../magic/sustain-workflow.mjs");
    await sustainSpellAction(this.actor, { spellId: target?.dataset?.spellId });
    this.render();
  }

  /**
   * The Magic tab's own Dismiss button.
   *
   * This used to call `endActiveSpell` directly — the storage primitive,
   * which knows nothing about actions or AP — so it ended the spell
   * correctly and FOR FREE, while the Actions tab's Dismiss charged 1 AP
   * and ended nothing (found by sweep, 29 August 2026). Neither door was
   * doing the whole rule; now both ask the one function that is the rule.
   *
   * The same sentence was written above `sustainSpell` four releases
   * earlier, about the same two tabs.
   */
  static async endSpell(event, target) {
    const { dismissSpellAction } = await import("../magic/dismiss-workflow.mjs");
    await dismissSpellAction(this.actor, { spellId: target?.dataset?.spellId });
    this.render();
  }

  /**
   * Release the spell held in the bonded item (3.495.0).
   *
   * ONE DOOR, and deliberately. `dismiss.mjs` records what two doors onto
   * one rule cost this project three times over — each doing the half the
   * other did not. A second door on the Actions tab would have to spend
   * the same action, honour the same two warps and reach the same
   * function; until there is a reason for it, there is one.
   */
  static async releaseStoredSpell() {
    const { releaseStoredSpell } = await import("../magic/spell-storing-workflow.mjs");
    await releaseStoredSpell(this.actor);
    this.render();
  }

  /**
   * Let a droppable circle go — Umbral Veil's decoy (3.490.0).
   *
   * NOT `endSpell`, and the button sits beside it rather than replacing
   * it for exactly that reason. The book: the discarded cloak "continues
   * to diminish the light for the remaining duration of the spell". Only
   * somebody RETRIEVING it ends things, which is the half Graham left to
   * the table on 4 September 2026 — so a GM ending a retrieved cloak uses
   * the Dismiss button next door, and this one does not.
   */
  static async dropSpell(event, target) {
    const { dropLightShift } = await import("../magic/light-shift-workflow.mjs");
    const said = await dropLightShift(this.actor, target?.dataset?.spellId);
    if (said) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<div class="trg-prime"><p style="margin:2px 0">${said}</p></div>`
      });
    }
    this.render();
  }

  static async rollAidAnother() {
    return rollAidAnother(this.actor);
  }

  static async rollWeaponAttack(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "weapon") return;
    return rollWeaponAttack(this.actor, item, { event });
  }

  static async rollWeaponDamage(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "weapon") return;
    return rollWeaponDamage(this.actor, item);
  }

  static async reloadWeapon(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "weapon") return;
    return reloadWeapon(this.actor, item);
  }

  static async spinWeapon(event, target) {
    const item = this.actor.items.get(
      target.closest("[data-item-id]")?.dataset.itemId
    );
    if (item?.type !== "weapon") return;
    return spinWeapon(this.actor, item);
  }

  static async rollInitiative(event) {
    const bonus = Number(this.actor.system.combat?.initiative?.total ?? 0);

    return TRGActorSheet.#performCheck.call(this, event, {
      label: "Initiative",
      subtitle: "d100 + (Dex x5) + (Wis x5)",
      type: "initiative",
      die: "d100",
      openEnded: TRGCombat.openEnded,
      suppressDegree: true,
      modifiers: this.actor.system.combat?.initiative?.checkModifiers ?? [
        { label: "Initiative bonus", value: bonus, type: "untyped" }
      ]
    });
  }

  static async itemCreate(event, target) {
    const type = target.dataset.itemType;
    if (!ITEM_LABELS[type]) return;

    const [item] = await this.actor.createEmbeddedDocuments("Item", [
      {
        name: `New ${ITEM_LABELS[type]}`,
        type,
        img: ITEM_ICONS[type] ?? "icons/svg/item-bag.svg"
      }
    ]);

    if (item) await item.sheet.render({ force: true });
  }

  /** Opens Foundry's own file picker to change the actor's portrait. */
  static async editImage() {
    const FilePickerImpl = foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker;
    const picker = new FilePickerImpl({
      type: "image",
      current: this.actor.img,
      callback: (path) => this.actor.update({ img: path })
    });
    return picker.render(true);
  }

  static async itemEdit(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (item) await item.sheet.render({ force: true });
  }

  /**
   * Stow an item in a Stash Sack, or take it out again.
   *
   * "Regardless of the weight of the objects placed within it, the sack
   * magically adjusts and always weighs the same amount" — so a stowed
   * item stops counting towards Encumbrance. Kept as a tickbox on the
   * item rather than as a container relationship: see `stowage.mjs` for
   * why, and for what it leaves possible later.
   *
   * REFUSED WITHOUT AN INVESTED SACK, because the weight has to go
   * somewhere. Refused for an equipped item too — you cannot be wearing
   * a breastplate and have it in the bag.
   */
  static async toggleItemStowed(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const willStow = !item.system.stowed;
    if (willStow) {
      if (item.system.equipped) {
        ui.notifications.warn(`${item.name} is equipped — take it off before stowing it.`);
        return;
      }
      if (!stashCapacity(Array.from(this.actor.items ?? []))) {
        ui.notifications.warn(
          `${this.actor.name} has no invested Stash Sack to stow ${item.name} in.`
        );
        return;
      }
    }
    await item.update({ "system.stowed": willStow });
  }

  /**
   * Lights or douses a torch, candle or lantern from its inventory row.
   *
   * WARNS WITHOUT REFUSING when no Flint & Steel/Tinderbox is carried —
   * Graham's ruling of 25 August. The same shape this system already
   * uses for proficiency, and deliberately NOT the shape of the spell
   * component gate, whose silent refusal cost a confusing live session
   * when a Hold Animal that "did nothing" turned out to be working
   * correctly and saying so nowhere anybody looked.
   *
   * THE GLOW GOES THROUGH THE SAME DOOR AS A CAST LIGHT, so a player
   * lighting a torch on a token they do not own is relayed to the GM's
   * client exactly as Light already is, and dousing one while a cast
   * Light is still running leaves that spell's glow alone.
   */
  static async toggleItemLit(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const key = lightSourceKeyForItem(item);
    if (!key) return;

    const willBeLit = !itemIsLit(item);
    await item.update({ [`flags.${SYSTEM_ID}.${LIT_FLAG}`]: willBeLit });

    if (willBeLit) {
      const warning = fireStarterWarning(this.actor.items.map((i) => i.name));
      if (warning) ui.notifications.warn(warning);
    }

    // ONE ENTRY POINT, NOT TWO BRANCHES. Lighting used to call
    // `attachTokenLight` straight away, which drew a glow for a torch
    // that was lit but not equipped and therefore shedding nothing —
    // the rule and the picture answering the same question differently.
    // `refreshAttachedLight` asks what the actor actually sheds.
    const { refreshAttachedLight } = await import("../light-attach-workflow.mjs");
    await refreshAttachedLight(this.actor);

    if (!willBeLit) {
      ui.notifications.info(`${item.name} put out.`);
    } else if (item.system.equipped) {
      // "Torch lit — Torch." is what naming both gives you when the item
      // and the source share a name, which four of the five do.
      const label = lightSource(key).label;
      ui.notifications.info(
        label === item.name ? `${item.name} lit.` : `${item.name} lit — ${label}.`);
    } else {
      // SAID PLAINLY, because a lit torch that sheds nothing looks like
      // a bug from the player's side.
      ui.notifications.info(`${item.name} lit, but it is not equipped — it sheds no light until it is.`);
    }
  }

  /**
   * Lowers or raises a hooded lantern's hood (3.576.0; Graham, 19 Sep 2026).
   *
   * "A cleverly designed hood that can be lowered to conceal its light
   * without extinguishing it" — the third state. The lantern stays lit and
   * sheds nothing while hooded; raising the hood needs no fire-starter.
   */
  static async toggleItemHood(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item || !lightSourceHasHood(item)) return;
    const willBeHooded = !itemIsHooded(item);
    await item.update({ [`flags.${SYSTEM_ID}.${HOODED_FLAG}`]: willBeHooded });
    const { refreshAttachedLight } = await import("../light-attach-workflow.mjs");
    await refreshAttachedLight(this.actor);
    ui.notifications.info(willBeHooded
      ? `${item.name}: hood lowered — still burning, shedding no light.`
      : `${item.name}: hood raised${itemIsLit(item) ? " — shedding light again" : ""}.`);
  }

  /** Clears a stale Mounted state by hand (3.576.0). */
  static async clearMounted() {
    await this.actor.unsetFlag(SYSTEM_ID, MOUNTED_FLAG);
  }

  /** A vehicle's Pilot button (3.577.0). See vehicles-workflow.mjs. */
  static async pilotVehicle() {
    const { pilotVehicle } = await import("../vehicles-workflow.mjs");
    await pilotVehicle(this.actor);
  }

  /**
   * The Goods that do something when used (3.576.0): Caltrops, Oil, and
   * an improvised attack with anything held. See goods-workflow.mjs.
   */
  static async useGoods(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    const { useGoodsItem } = await import("../goods-workflow.mjs");
    await useGoodsItem(this.actor, item, { event });
  }

  /** Toggles a physical item's equipped state directly from its row. */
  static async toggleItemEquipped(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;
    if (item.type === "weapon" && item.system?.natural && ALWAYS_READY_ACTOR_TYPES.includes(this.actor.type)) {
      ui.notifications.info(`${item.name} is a natural attack: always ready, and it takes no hand.`);
      return;
    }
    const willBeEquipped = !item.system.equipped;
    const changes = { "system.equipped": willBeEquipped };
    if (willBeEquipped) {
      // Hand & a Half (Chapter 6): grip is chosen once, at equip, and stored on
      // the weapon; the attack workflow reads it silently rather than prompting
      // on every swing.
      //
      // THE GRIP IS ASKED FIRST (3.575.0), because it decides the hands: a
      // two-handed grip takes both, and the budget has to be checked
      // against the grip the player is about to choose rather than the one
      // left on the weapon from last time.
      let grip = null;
      if (item.type === "weapon" && isHandAndAHalf(item.system?.traits)) {
        grip = await promptTwoHandedGrip(item.name, Boolean(item.system?.twoHandedGrip));
        if (grip === null) return; // cancelled — leave the weapon unequipped
        changes["system.twoHandedGrip"] = grip;
      }
      const asEquipped = grip === null
        ? item
        : { id: item.id, name: item.name, type: item.type, system: { ...item.system, twoHandedGrip: grip } };
      const result = canEquip(this.actor, asEquipped);
      if (!result.allowed) {
        ui.notifications.warn(result.reason);
        return;
      }
    }
    await item.update(changes);

    // A LIT TORCH THAT CHANGES HANDS CHANGES THE LIGHT. Equipping a lit
    // torch has to turn its glow on and stowing one has to put it out,
    // because `isLitLightSource` requires both lit AND equipped. Before
    // 3.397.1 neither did anything: a torch lit in a pack drew a glow it
    // was not entitled to, and stowing a burning one went on lighting
    // the room. Routed through the same `refreshAttachedLight` the light
    // switch uses, so there is still one answer to "what is this actor
    // shedding" rather than a copy of the rule here.
    if (lightSourceKeyForItem(item)) {
      const { refreshAttachedLight } = await import("../light-attach-workflow.mjs");
      await refreshAttachedLight(this.actor);
    }
  }

  static async itemDelete(event, target) {
    const item = this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
    if (!item) return;

    // A Spell Book pick shown on the Magic tab's Spells table is the SAME
    // owned item as the one listed on the Spellbook item's own contents
    // page — deleting it here would delete it from the book too, which
    // isn't what removing a row from "today's memorised spells" means
    // (Graham: "deleting the spell from the spell table should make the
    // spell no longer memorised... but not remove it from the spell
    // book"). Unprepare instead; the book keeps it, and the row simply
    // stops appearing here the same way any other unprepared book pick
    // already does (actor-sheet.mjs's own #groupItems filter, 3.230.4).
    if (item.type === "spell" && Boolean(item.flags?.["trg-prime"]?.spellBookPick)) {
      const confirmed = await DialogV2.confirm({
        window: {
          title: `Unmemorise ${item.name}`
        },
        content: `<p>Remove <strong>${item.name}</strong> from today's memorised spells?</p><p class="hint">It stays in your Spell Book — open the Spellbook item to remove it from there instead.</p>`,
        modal: true
      });
      if (confirmed) await item.update({ "system.prepared": false });
      return;
    }

    const confirmed = await DialogV2.confirm({
      window: {
        title: `Delete ${item.name}`
      },
      content: `<p>Delete <strong>${item.name}</strong> from ${this.actor.name}?</p>`,
      modal: true
    });

    if (confirmed) await item.delete();
  }

  static async skillCreate() {
    const skills = this.actor.system.skills ?? {};
    const key = uniqueKey(slugifyKey("New Skill"), skills);
    const skill = blankSkill("intelligence");
    skill.label = "New Skill";

    await this.actor.update({ [`system.skills.${key}`]: skill });
  }

  static async skillDelete(event, target) {
    const key = target.closest("[data-skill-key]")?.dataset.skillKey;
    const skill = this.actor.system.skills?.[key];
    if (!key || !skill) return;

    if (CORE_SKILL_KEYS.includes(key)) {
      ui.notifications.warn(
        `${SKILLS[key].label} is a core TRG Prime skill and cannot be removed.`
      );
      return;
    }

    const confirmed = await DialogV2.confirm({
      window: {
        title: `Delete ${skill.label}`
      },
      content: `<p>Delete the <strong>${skill.label}</strong> skill?</p>`,
      modal: true
    });

    if (confirmed) {
      await this.actor.update({ [`system.skills.${key}`]: deletionValue() });
    }
  }

  /**
   * Add a specialist skill, optionally seeded from the printed table.
   *
   * THE PICKER EXISTS FOR THE ABILITY, NOT THE NAME. A blank row defaults
   * to Intelligence and fifteen of the chapter's thirty-three rows are
   * not Intelligence, so a GM granting Hunting from a background and not
   * noticing the default is how a character ends up tracking off the
   * wrong score.
   *
   * Cancelling adds nothing. The old behaviour — a blank Intelligence row
   * with nothing asked — is still one keypress away, because the dialog
   * opens on "name it yourself" rather than on the first printed row.
   */
  static async specialistSkillCreate() {
    const chosen = await promptSpecialistSkill();
    if (!chosen) return;

    const skills = this.actor.system.specialistSkills ?? {};
    const skill = blankSpecialistSkill(chosen.ability ?? "intelligence");
    if (chosen.label) skill.label = chosen.label;
    const key = uniqueKey(slugifyKey(skill.label), skills);

    await this.actor.update({ [`system.specialistSkills.${key}`]: skill });
  }

  static async specialistSkillDelete(event, target) {
    const key = target.closest("[data-specialist-key]")?.dataset.specialistKey;
    const skill = this.actor.system.specialistSkills?.[key];
    if (!key || !skill) return;

    const confirmed = await DialogV2.confirm({
      window: {
        title: `Delete ${skill.label}`
      },
      content: `<p>Delete the <strong>${skill.label}</strong> specialist skill?</p>`,
      modal: true
    });

    if (confirmed) {
      await this.actor.update({
        [`system.specialistSkills.${key}`]: deletionValue()
      });
    }
  }

  /**
   * Nudge a valued condition up or down from the Effects tab.
   *
   * Stepping below 1 removes the condition outright rather than leaving a
   * Stunned 0 on the sheet, which is not a state the rules describe.
   */
  static async conditionValueStep(event, target) {
    const row = target.closest("[data-effect-id]");
    const effect = this.actor.effects.get(row?.dataset.effectId);
    const conditionId = effect?.flags?.[SYSTEM_ID]?.condition;
    if (!conditionId) return;

    const delta = Number(target.dataset.delta ?? 1);
    const current = Number(effect.getFlag(SYSTEM_ID, "value") ?? 1);
    const next = current + delta;

    if (next < 1) return this.actor.toggleStatusEffect(conditionId, { active: false });
    return this.actor.toggleStatusEffect(conditionId, {
      value: next,
      damageType: effect.getFlag(SYSTEM_ID, "damageType") ?? null
    });
  }

  /** Type an exact value, through the same dialog the token HUD uses. */
  static async conditionValueSet(event, target) {
    const row = target.closest("[data-effect-id]");
    const effect = this.actor.effects.get(row?.dataset.effectId);
    const conditionId = effect?.flags?.[SYSTEM_ID]?.condition;
    if (!conditionId) return;

    const result = await promptConditionValue(
      conditionId,
      Number(effect.getFlag(SYSTEM_ID, "value") ?? 1),
      { damageType: effect.getFlag(SYSTEM_ID, "damageType") ?? null }
    );
    if (!result) return;
    if (result.action === "remove") {
      return this.actor.toggleStatusEffect(conditionId, { active: false });
    }
    return this.actor.toggleStatusEffect(conditionId, {
      value: result.value,
      damageType: result.damageType ?? null
    });
  }

  /**
   * Add an effect.
   *
   * This used to create a blank "New Effect" and drop the raw Foundry
   * ActiveEffect config on the player, which is the only way the sheet
   * offered — there was no way to add one of the conditions the system
   * already defines without going through the token HUD.
   */
  static async effectCreate() {
    const choice = await promptAddEffect(this.actor);
    if (!choice) return;

    if (choice.kind === "condition") {
      return this.actor.toggleStatusEffect(choice.conditionId, choice.options ?? { active: true });
    }

    const [effect] = await this.actor.createEmbeddedDocuments("ActiveEffect", [
      {
        name: choice.name || "New Effect",
        img: choice.img || "icons/svg/aura.svg",
        disabled: false,
        changes: []
      }
    ]);

    if (effect) await effect.sheet.render({ force: true });
  }

  static async effectEdit(event, target) {
    const effect = this.actor.effects.get(
      target.closest("[data-effect-id]")?.dataset.effectId
    );
    if (effect) await effect.sheet.render({ force: true });
  }

  static async effectToggle(event, target) {
    const effect = this.actor.effects.get(
      target.closest("[data-effect-id]")?.dataset.effectId
    );
    if (effect) await effect.update({ disabled: !effect.disabled });
  }

  /**
   * Open the item a transferred effect belongs to.
   *
   * A TRANSFERRED EFFECT CANNOT BE DELETED FROM THE ACTOR — it belongs to
   * its item, and every one of the 132 item-borne effects in Graham's
   * world is `transfer: true`. A bin icon on those rows would promise
   * something the row cannot do, which is how an accidental deletion
   * becomes an accidental deletion ATTEMPT followed by confusion. This
   * makes the safe action the only action.
   */
  static effectGoToItem(event, target) {
    event.preventDefault();
    const itemId = target.dataset.itemId
      ?? target.closest("[data-item-id]")?.dataset.itemId;
    const item = itemId ? this.actor.items.get(itemId) : null;
    if (!item) {
      ui.notifications.warn("That effect's item is no longer on this actor.");
      return;
    }
    item.sheet?.render(true);
  }

  static async effectDelete(event, target) {
    const effect = this.actor.effects.get(
      target.closest("[data-effect-id]")?.dataset.effectId
    );
    if (!effect) return;

    // A GRANTED EFFECT WARNS BEFORE IT GOES (3.383.0). It came from
    // something the character holds, and whether re-running grants brings
    // it back is not obvious to the person clicking — which was Graham's
    // actual worry about this tab.
    const warning = target.dataset.warn ?? "";
    const confirmed = await DialogV2.confirm({
      window: {
        title: `Delete ${effect.name}`
      },
      content: `<p>Permanently delete <strong>${effect.name}</strong>?</p>`
        + (warning ? `<p class="hint">${warning}</p>` : ""),
      modal: true
    });

    if (confirmed) await effect.delete();
  }
}
