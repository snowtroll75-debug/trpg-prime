import { TRG } from "../module/config.mjs";
import { TRGCheck } from "../module/dice/check.mjs";
import { registerCheckCardListeners } from "../module/dice/check-card-interactions.mjs";
import * as resolution from "../module/dice/resolution.mjs";
import * as openEnded from "../module/dice/open-ended.mjs";
import { registerSystemSettings } from "../module/settings.mjs";
import {
  registerCustomiseOnAddHook, registerCustomiseOnAddSetting
} from "../module/customise-on-add.mjs";
import { registerConditions } from "../module/conditions/manager.mjs";
import * as conditionsRegistry from "../module/conditions/registry.mjs";
import { promptCheckConfiguration } from "../module/apps/check-dialog.mjs";
import { TRGActiveEffect, applyCustomBonusChange } from "../module/documents/active-effect.mjs";
import { expireSpellEffects } from "../module/combat/effect-application-workflow.mjs";
import { effectExpiredLine } from "../module/combat/effect-expiry.mjs";
import { sweepRefocusRestores } from "../module/combat/refocus-workflow.mjs";
import { TRGActor } from "../module/documents/actor.mjs";
import { TRGCombat } from "../module/documents/combat.mjs";
import { TRGItem } from "../module/documents/item.mjs";
import {
  checkWorldMigration,
  migrateWorldData,
  purgeOrphanedItemsOfType,
  registerMigrationSettings,
  TRG_SCHEMA_VERSION
} from "../module/migration.mjs";
import { TRGActorSheet } from "../module/sheets/actor-sheet.mjs";
import { TRGPartySheet } from "../module/sheets/party-sheet.mjs";
import { registerPartySocket } from "../module/party-socket.mjs";
import { registerTargetRelay } from "../module/combat/target-relay-workflow.mjs";
import { registerPerilHooks } from "../module/peril-workflow.mjs";
import { promptEnvironmentalDamage, registerWeatherConfig } from "../module/environment-workflow.mjs";
import { TRGItemSheet } from "../module/sheets/item-sheet.mjs";
import { TRGActiveEffectSheet } from "../module/sheets/effect-sheet.mjs";
import { openRestDialog } from "../module/rest/rest-workflow.mjs";
// TRAVEL (3.582.1; page 226) — the GM toolbar button and the card it posts.
import { openTravelDialog } from "../module/travel-dialog.mjs";
import { advanceSustenanceDay, isDehydrated, sustenanceState } from "../module/sustenance-workflow.mjs";
// AN AFFLICTION'S CLOCK (3.583.0) — the cheap gate lives with the sweep.
import { hasAfflictions, registerAfflictionConditionLock } from "../module/combat/affliction-workflow.mjs";
// THE WINDOW EXTRA CASTING TIME OPENS (3.584.0; page 237, R9).
import {
  completePendingCast, pendingCastOf, registerPendingCastCardListeners,
  registerPendingCastHooks, stopPendingCast
} from "../module/magic/pending-cast-workflow.mjs";
import { registerSustainInterruptHooks } from "../module/magic/sustain-workflow.mjs";
// A held Power Crystal's points are DERIVED into the pool (3.594.0); these
// hooks are only what keeps the item and that arithmetic in step.
import { registerConjuredItemHooks } from "../module/magic/conjured-item-workflow.mjs";
import { registerPowerCrystalHooks } from "../module/magic/power-crystal-workflow.mjs";
import {
  controlSummary, registerControlRegisterCardListeners, releaseControlled
} from "../module/magic/control-register-workflow.mjs";
import {
  openStudiedTargetManager,
  studiedTargetStatus
} from "../module/study-target-workflow.mjs";
import {
  openSpecialtyManager,
  specialtyStatus
} from "../module/skill-specialties-workflow.mjs";
import {
  earnIncomeStatus,
  openEarnIncomeManager
} from "../module/earn-income-workflow.mjs";
import {
  createProjectStatus,
  openCreateManager
} from "../module/create-crafting-workflow.mjs";
import { registerMovementHooks } from "../module/combat/movement-workflow.mjs";
import { registerGrantedItemCleanup } from "../module/magic/spell-effects.mjs";
import { registerTemporaryConvictionCleanup } from "../module/magic/bardic-conviction.mjs";
import { registerSpellRuneCleanup } from "../module/magic/spell-rune-workflow.mjs";
import { registerGrantCleanup } from "../module/grant-cleanup.mjs";
import { registerGrantAutorun } from "../module/grant-autorun.mjs";
import { deletionOperatorAvailable } from "../module/deletion.mjs";
import { registerOpportunityHooks } from "../module/combat/opportunity.mjs";
import { registerDeathWatchHooks } from "../module/combat/death-watch-workflow.mjs";
import { registerConditionEventHooks } from "../module/conditions/condition-events-workflow.mjs";
import { registerTraitRuleHooks } from "../module/trait-rules-workflow.mjs";
import { registerTurnRecordHooks } from "../module/combat/turn-records.mjs";
import { registerLightShiftFollow } from "../module/magic/light-shift-workflow.mjs";
import { registerAbilityCollapseHooks } from "../module/combat/ability-collapse-workflow.mjs";
import { registerInjuryHooks } from "../module/injury-workflow.mjs";
import { registerUnderwaterHooks } from "../module/combat/underwater-workflow.mjs";
// THE THIRD CLOCK (3.581.0; the pages 211-220 audit's D2): a condition that
// ends when another condition ends, and one that arrives when another leaves.
import { registerLinkedConditionHooks, sweepWorldTimeConditions } from "../module/combat/linked-conditions-workflow.mjs";
import { registerEndSaveHooks } from "../module/magic/end-save-workflow.mjs";
import { registerSwiftPursuitHooks } from "../module/combat/swift-pursuit.mjs";
import { registerAmmunitionRecoveryHooks } from "../module/combat/ammunition-workflow.mjs";
import { registerGoodsHooks } from "../module/goods-workflow.mjs";
import { registerConsumableSpecialHooks } from "../module/consumable-specials-workflow.mjs";
import { registerWondrousHooks } from "../module/wondrous-use-workflow.mjs";
import {
  buildModuleApi,
  fireRegistrationHook,
  flushModuleRegistrations,
  reportModuleRegistrations
} from "../module/module-api-workflow.mjs";
import { registerReactionFeatHooks } from "../module/combat/reaction-feats-workflow.mjs";
import { registerActionFeatHooks } from "../module/combat/action-feat-detection.mjs";
import { registerEncumbranceHooks } from "../module/encumbrance-workflow.mjs";
import { registerSpellEffectHooks } from "../module/rune-spell-workflow.mjs";
import { registerWeaponFormHooks } from "../module/charged-weapon-forms-workflow.mjs";
import { registerAuraHooks } from "../module/creature-aura-workflow.mjs";
import { registerDistanceTriggers } from "../module/magic/distance-trigger-workflow.mjs";
import { registerInscribedRunes } from "../module/magic/inscribed-rune-workflow.mjs";
import { registerEmanations } from "../module/magic/emanation-workflow.mjs";
import { registerHazardTerrain } from "../module/magic/hazard-terrain-workflow.mjs";
import { registerEntryChecks } from "../module/magic/entry-check-workflow.mjs";
import { registerStasis } from "../module/magic/stasis-workflow.mjs";
import { registerRuneTimers } from "../module/rune-timers-workflow.mjs";
import { registerTurnOptions } from "../module/magic/turn-options-workflow.mjs";
import { registerMaterialShift } from "../module/magic/material-shift-workflow.mjs";
import { registerWallSpells } from "../module/magic/wall-spell-workflow.mjs";
import { registerTurnStartHooks } from "../module/creature-turn-start-workflow.mjs";
import { registerSunlightHooks } from "../module/sunlight-workflow.mjs";
import { registerLightSettings } from "../module/light-workflow.mjs";
import { registerAttachedLightCleanup } from "../module/light-attach-workflow.mjs";
import { runIntegrationCheck } from "../module/foundry-integration-check.mjs";
import { FOUNDRY_SCHEMA_SNAPSHOT } from "../module/foundry-schemas.mjs";
import {
  openRefreshDialog,
  previewRefresh,
  applyRefresh
} from "../module/compendium-refresh.mjs";
import {
  listTargets as listModifierTargets,
  getTarget as getModifierTarget,
  registerModifierTarget,
  unregisterModifierTarget
} from "../module/modifier/registry.mjs";
import {
  registerModifierSettings,
  getModifierLog,
  undoTransaction,
  beginTransaction,
  commitTransaction
} from "../module/modifier/transactions.mjs";
import {
  openUniversalModifier,
  UniversalModifierApp
} from "../module/modifier/app.mjs";
import { registerCodexInheritance } from "../module/codex-inheritance-workflow.mjs";
import { registerBreathHooks } from "../module/breath-memory-workflow.mjs";
import { registerCodexActionHooks } from "../module/codex-actions-workflow.mjs";
import { registerCompoundHooks } from "../module/combat/compound-action-workflow.mjs";
import { registerReactiveDisarmHooks } from "../module/combat/reactive-disarm-workflow.mjs";
import { registerCodexHooks } from "../module/codex-hooks-workflow.mjs";
import { registerSpawnHooks } from "../module/spawn-workflow.mjs";
import { registerSwarmHooks } from "../module/swarm-workflow.mjs";
import { registerAuraTraitEffectHooks } from "../module/aura-trait-effect-workflow.mjs";
import { registerExtraplanarHooks } from "../module/extraplanar-workflow.mjs";
import { registerAlignedControlHooks } from "../module/aligned-control-workflow.mjs";

Hooks.once("init", () => {
  console.info("TRG Prime | Initialising Foundry VTT V14 system");

  // Chapter 7: "A round is a period of time approximately 6 seconds, in
  // which each character involved in the combat gets to take a turn."
  //
  // Core Foundry defaults BOTH of these to 0 and expects the system to
  // set them, and this one never did — so no combat in this system had
  // ever advanced world time. Nothing noticed, because nothing else read
  // the clock. The Creature Codex does: Stench prints "immune for one
  // minute after making a save", measured in world time, and a window in
  // seconds against a stopped clock never closes. Every printed duration
  // in the chapter lands on this same number.
  //
  // turnTime STAYS 0. Foundry advances the clock by turnTime on every
  // turn change and by roundTime on every round change. The six seconds
  // covers the whole round — the chapter is explicit that characters
  // "act almost simultaneously" — so charging it per turn would make a
  // round with five combatants last thirty seconds.
  CONFIG.time.roundTime = 6;

  registerMigrationSettings();
  registerSystemSettings();
  // Chapter 6 + 11: dropping a weapon, armour or shield onto a sheet
  // offers the Quality/Material/Traits/Runes dialog, so an item can be
  // made magical at the point it arrives rather than typed into
  // afterwards. The setting registers at init with the rest; the hook
  // is wired below.
  registerCustomiseOnAddSetting();
  registerCustomiseOnAddHook();
  registerModifierSettings();
  registerConditions();
  registerCheckCardListeners();
  // Movement costs AP in combat (Chapter 4) — the hook must be live
  // before any token moves, so it registers at init like the rest.
  registerMovementHooks();
  // Deletes the weapon items a spell effect granted (a form's claws, a
  // wyrm's bite) whenever that effect goes — see spell-effects.mjs.
  registerGrantedItemCleanup();
  // Takes an attached light back off a token by every route an effect can
  // leave an actor — expiry, dispel, a GM deleting it off the Effects tab.
  registerAttachedLightCleanup();
  // Reclaims an unspent temporary conviction point when the spell that
  // assigned it ends — see magic/bardic-conviction.mjs.
  registerTemporaryConvictionCleanup();
  // Takes a spell-granted Potency rune back off the item it was lent to,
  // by every route the spell can end — see magic/spell-rune-workflow.mjs
  // for why this is a hook and not a call beside the expiry sweeps.
  registerSpellRuneCleanup();
  registerGrantCleanup();
  // The other direction: a race/heritage/background/origin/class ARRIVING
  // applies its own grants, and levelling trues up the per-level ones. Both
  // were missing until the Chapter 2 audit found a race that landed and did
  // nothing — see grant-autorun.mjs.
  registerGrantAutorun();
  // Attack of Opportunity (Chapter 4): the card-button handler that turns a
  // detected provoke into a MAP-exempt reaction strike.
  registerOpportunityHooks();
  registerDeathWatchHooks();
  // APPENDIX 2'S MOMENTS (3.621.0, block 39): going Unconscious, waking,
  // Fixated ending, the Frightened save's button.
  registerConditionEventHooks();
  // APPENDIX 3 (3.622.0, block 39): the teleported creature's Spatial
  // Awareness button.
  registerTraitRuleHooks();
  registerTurnRecordHooks();
  registerLightShiftFollow();
  // Chapter 1, p13: an ability score of -5 has a consequence. Registered
  // beside the death watch because it is the same shape of rule — a
  // threshold on a derived value, with no single place it is crossed.
  registerAbilityCollapseHooks();
  // Chapter 7, p194: the combined value of dazed + injured + weakened
  // reaching 10 is the same shape of rule again — a threshold on a value
  // that moves from dozens of places. It also carries the world-clock
  // half of Fast Healing and Regeneration (p193). See injury-workflow.
  registerInjuryHooks();
  // WHAT AN AFFLICTION HOLDS (3.583.0; page 232's closing sentence).
  registerAfflictionConditionLock();
  // A cast held open by extra casting time, and the damage that ends it.
  registerPendingCastHooks();
  registerPowerCrystalHooks();
  registerConjuredItemHooks();
  registerPendingCastCardListeners();
  // AND THE SAME BLOW AGAINST A SPELL ALREADY RUNNING (3.585.0, page
  // 241). A pending cast is a spell being cast; a sustained spell is one
  // already up. Damage threatens both, and until now only the first was
  // watched — the Spell Concentration reaction existed with no trigger.
  registerSustainInterruptHooks();
  // The control register's card button (page 242's DC 20 Will release).
  registerControlRegisterCardListeners();
  registerUnderwaterHooks();
  registerLinkedConditionHooks();
  registerEndSaveHooks();
  registerSwiftPursuitHooks();
  registerAmmunitionRecoveryHooks();
  registerGoodsHooks();
  // THE MYSTICAL BANDAGE'S REACTION BUTTONS (3.617.0, block 37).
  registerConsumableSpecialHooks();
  registerWondrousHooks();
  registerReactionFeatHooks();
  registerActionFeatHooks();
  registerAuraHooks();
  // SHADOW TETHER'S WATCHER (3.599.0, Graham's R8). The same `updateToken`
  // hook the auras use and for the same reason — where the creature ended up
  // is the question. See magic/distance-trigger-workflow.mjs.
  registerDistanceTriggers();
  // BESIDE THE TETHER, off the same `updateToken` hook: both answer "who
  // just crossed an edge", which the turn clock cannot. See
  // magic/inscribed-rune.mjs for why a rune is not an emanation.
  registerInscribedRunes();
  // A spell emanation follows its caster and its bonus applies while
  // you are inside it (3.426.0) — the same Region machinery auras use,
  // registered beside them for that reason. See magic/emanation.mjs.
  registerEmanations();
  // HAZARDOUS TERRAIN, beside the emanation sweep and asking a different
  // question of a different hook — see hazard-terrain-workflow.mjs.
  registerHazardTerrain();
  // Web's check on moving through it (3.612.0, R6).
  registerEntryChecks();
  // STASIS (3.614.0, R2): the targeting warning, the refused move, and the
  // clocks that resume when it ends. See module/magic/stasis.mjs.
  registerStasis();
  registerRuneTimers();
  // RENEWAL'S TOUCH'S TURN CARD (3.614.0, R8). See module/magic/turn-options.mjs.
  registerTurnOptions();
  // PRECIOUS METALS PUTS THE METAL BACK (3.614.0, R11).
  registerMaterialShift();
  // THE WALL SPELLS (3.610.0): crossing a wall, and a wall's Foundry Walls
  // leaving with its Region.
  registerWallSpells();
  // Creature Codex: Regeneration and the two Sunlight abilities fire at
  // the start of a turn, on the same signal the auras use.
  registerTurnStartHooks();
  // BREATH MEMORY (3.631.0): Clinging / Scorching Breath on the breather's next turn.
  registerBreathHooks();
  // THE CODEX'S OWN BUTTONS (3.631.0): a swallowed creature's turn, and
  // the strike buttons on a compound action's card.
  registerCodexActionHooks();
  registerCompoundHooks();
  registerReactiveDisarmHooks();
  registerCodexHooks();
  registerSpawnHooks();
  registerSwarmHooks();
  registerAuraTraitEffectHooks();
  registerExtraplanarHooks();
  registerAlignedControlHooks();
  // …and whether the creature IS in sunlight, as the GM marks the scene or
  // the token (3.627.0): the config fields and the lift on a change.
  registerSunlightHooks();
  // Chapter 8: how Foundry's continuous darkness maps onto the ten
  // named light levels. A setting, because the boundaries are a
  // judgement and they should be Graham's, not mine.
  registerLightSettings();
  // Encumbered (Chapter 6): Immobilised at 0 Speed, kept in step with
  // whatever the character is carrying.
  registerEncumbranceHooks();

  // The Spell Effect rune (Chapter 11): an equipped item carrying one
  // grants its spell to the wearer as an innate spell, and takes it back
  // when the item comes off.
  registerSpellEffectHooks();
  // A STAFF IS ALSO A STAFF (3.616.0, R15).
  registerWeaponFormHooks();

  // Universal Modifier: a GM toolbar button on the token controls. Written
  // defensively for both the record-shaped (V13+) and array-shaped control
  // structures so a Foundry data-shape change degrades to "no button", not
  // an error at init.
  Hooks.on("getSceneControlButtons", (controls) => {
    if (!game.user?.isGM) return;
    const tool = {
      name: "universalModifier",
      title: "Universal Modifier",
      icon: "fa-solid fa-sliders",
      order: 999,
      button: true,
      visible: true,
      onChange: () => openUniversalModifier(),
      onClick: () => openUniversalModifier()
    };
    // TRAVEL (3.582.1; page 226, Graham's R7) — beside it, for the same
    // reason: the party's real speeds are on their sheets, and the
    // printed table can only answer the nine speeds it lists.
    const travel = {
      name: "travel",
      title: "Travel",
      icon: "fa-solid fa-person-hiking",
      order: 1000,
      button: true,
      visible: true,
      onChange: () => openTravelDialog(),
      onClick: () => openTravelDialog()
    };
    // ENVIRONMENTAL DAMAGE (3.620.0; Chapter 12, page 396, Graham's R15):
    // a hazard's row applied to the selected tokens.
    const environment = {
      name: "environmentalDamage",
      title: "Environmental Damage",
      icon: "fa-solid fa-volcano",
      order: 1001,
      button: true,
      visible: true,
      onChange: () => promptEnvironmentalDamage(),
      onClick: () => promptEnvironmentalDamage()
    };
    const tokens = Array.isArray(controls)
      ? controls.find((c) => c.name === "tokens" || c.name === "token")
      : (controls.tokens ?? controls.token);
    if (!tokens?.tools) return;
    if (Array.isArray(tokens.tools)) tokens.tools.push(tool, travel, environment);
    else {
      tokens.tools.universalModifier = tool;
      tokens.tools.travel = travel;
      tokens.tools.environmentalDamage = environment;
    }
  });

  CONFIG.TRG = TRG;

  CONFIG.ActiveEffect.documentClass = TRGActiveEffect;
  // V13+ dispatches CUSTOM-mode effect changes through this hook, not through
  // ActiveEffect#apply — this routes bonus-key changes into the Appendix-1 pool.
  Hooks.on("applyActiveEffect", applyCustomBonusChange);

  // SWITCHING RAGE OFF ENDS IT (3.416.0), on Graham's ruling.
  //
  // The toggle in the Effects table had no meaning for rage, and the
  // result was the worst of both: Foundry stopped applying the changes
  // while every rule still believed the character was raging, so they
  // kept none of the benefit and all of the lock — no new rage allowed,
  // and Revoke still gated behind a `mustRideOut` waiting on a minute
  // nothing measured. Found live on 26 August 2026, with no way out of
  // it from inside the system at all.
  //
  // The GM's most natural gesture now performs the whole ending:
  // temporary HP cleared, Fatigue charged, effect removed.
  Hooks.on("updateActiveEffect", async (effect, changed) => {
    if (!Object.hasOwn(changed ?? {}, "disabled") || !effect?.disabled) return;
    if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
    const { endRageOnDisable } = await import("../module/combat/rage-workflow.mjs");
    const ended = await endRageOnDisable(effect);
    if (!ended) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: effect.parent }),
      content: '<div class="trg-prime trg-check-card"><header class="check-header">'
        + `<div class="check-heading"><span class="check-actor">${effect.parent?.name ?? ""}</span>`
        + "<h3>Rage Ends</h3></div></header>"
        + `<p style="margin:2px 0">Switched off — the rage ends. Now <strong>Fatigued ${ended.fatigue}</strong> for 1 hour`
        + (ended.temporaryHPLost > 0
          ? `, losing <strong>${ended.temporaryHPLost}</strong> unspent temporary HP.</p>`
          : ".</p>")
        + "</div>"
    });
  });

  // Sweep spell-applied effects off their targets when the spell's duration
  // elapses in world time (the out-of-combat counterpart to the combat turn
  // sweep). One client — the active GM — performs the deletes.
  Hooks.on("updateWorldTime", async (worldTime) => {
    if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;

    /*
     * A SPELL'S AREA ON THE WORLD CLOCK (3.500.0) — the other half of the
     * sweep in TRGCombat._onStartTurn, and here for the reason rage and
     * Protective Ward are both here: Consecrate's day will never elapse
     * inside a combat, and a Region placed in a corridor gets no rounds
     * to count. Scene-wide, so it sits outside the per-actor loop below.
     */
    const { sweepRegionExpiry } = await import("../module/magic/region-expiry-workflow.mjs");
    const { regionExpiredLine } = await import("../module/magic/region-expiry.mjs");
    for (const name of await sweepRegionExpiry(canvas?.scene ?? null, {
      worldTime, round: game.combat?.started ? game.combat.round : null
    })) {
      await ChatMessage.create({ content: `<div class="trg-prime">${regionExpiredLine(name)}</div>` });
    }

    const actors = new Set(game.actors ?? []);
    for (const token of canvas?.tokens?.placeables ?? []) {
      if (token.actor?.isToken) actors.add(token.actor);
    }
    let strandedLive = null;
    for (const actor of actors) {
      if (actor.effects?.some((e) => e.getFlag?.("trg-prime", "spellEffect"))) {
        /*
         * AND IT SAYS SO (3.514.0). `expireSpellEffects` has always
         * RETURNED the labels of what it ended — the only caller in the
         * system threw them away, so a buff ending on the world clock was
         * the one sweep in either clock that happened in silence. Every
         * other one here announces itself; the round clock has printed
         * this exact sentence for the same effects since it was written.
         *
         * The asymmetry was the whole defect: the round clock spoke and
         * left the spell's items behind, the world clock removed them and
         * said nothing. Each did the half the other missed.
         */
        for (const label of await expireSpellEffects(actor, worldTime)) {
          const said = effectExpiredLine(label);
          if (said) {
            await ChatMessage.create({
              speaker: ChatMessage.getSpeaker({ actor }),
              content: `<div class="trg-prime"><p>${said}</p></div>`
            });
          }
        }
      }
      /*
       * A CRITICAL'S OWN WORLD-CLOCK DEADLINE (3.581.0; the pages
       * 211-220 audit's D10, Graham's R10): "Target becomes Unconscious
       * for 1d4 hours" (Subdual 96), "Unconscious for 1d6 hours" (Acid
       * 96), "Dazzled for 1 minute" (Poison 60).
       *
       * BESIDE `expireSpellEffects` RATHER THAN INSIDE IT, because that
       * sweep is gated on the spellEffect flag and a critical injury is
       * not a spell — stamping one as a spell effect to borrow its
       * sweeper would make it removable by a dispel.
       */
      for (const label of await sweepWorldTimeConditions(actor, worldTime)) {
        const said = effectExpiredLine(label);
        if (said) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime"><p>${said}</p></div>`
          });
        }
      }

      // AN OIL'S OR A POISON'S COAT, on the world clock (3.578.0; the
      // block-18 audit's D7 and D8) — which Foundry also moves on each
      // combat round, so this one sweep serves both clocks.
      if (Array.from(actor.items ?? []).some((i) => i.getFlag?.("trg-prime", "oilCoat") || i.getFlag?.("trg-prime", "poisonCoat"))) {
        const { sweepExpiredCoats } = await import("../module/oil-workflow.mjs");
        for (const said of await sweepExpiredCoats(actor)) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime"><p>${said}</p></div>`
          });
        }
      }
      /*
       * AN AFFLICTION'S OWN CLOCK (3.583.0; pages 231-240's D2/D3/D4,
       * Graham's R3/R4/R5). Incubation, a stage interval measured in
       * anything but rounds, and the affliction's own duration. The
       * end-phase sweep keeps the round-measured stages; this reaches
       * the hours and days both printed diseases are written in.
       */
      if (hasAfflictions(actor)) {
        const { sweepAfflictions } = await import("../module/combat/affliction-workflow.mjs");
        for (const said of await sweepAfflictions(actor, worldTime)) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime"><p>${said}</p></div>`
          });
        }
      }

      /*
       * THE HOURLY WATER CHECK (3.582.1; page 230, Graham's R12).
       *
       * "After a day with no water, your GM will require you to begin
       * making Exhaustion checks EVERY HOUR." An hourly rule needs an
       * hourly tick, and this is the only one the system has. Gated on
       * the flag so a fed and watered party costs one property read.
       */
      if (isDehydrated(actor)) {
        const { sweepSustenanceHours } = await import("../module/sustenance-workflow.mjs");
        await sweepSustenanceHours(actor, worldTime);
      }
      // RAGE'S MINUTE, on the world clock (3.416.0) — the other half of
      // the sweep in TRGCombat._onStartTurn. A rage invoked outside an
      // encounter has no rounds to count, and one that outlives its
      // combat stops getting turns; between the two clocks, whichever is
      // moving is the one that ends it.
      if (actor.effects?.some((e) => e.getFlag?.("trg-prime", "rage"))) {
        const { expireRage } = await import("../module/combat/rage-workflow.mjs");
        await expireRage(actor, { worldTime, round: game.combat?.round ?? null });
      }
      // AND THE ORPHANS (3.433.0) — a rage whose effect is gone but whose
      // temporary HP is not. Asked on the actor's own record rather than
      // on an effect, which is the whole point of moving it there.
      if (actor.getFlag?.("trg-prime", "rageTemporaryHP")) {
        const { reclaimOrphanedRageTemporaryHP } = await import("../module/combat/rage-workflow.mjs");
        await reclaimOrphanedRageTemporaryHP(actor);
      }
      // A WARD'S MINUTE, on the world clock (3.430.0) — the other half of
      // the sweep in TRGCombat._onStartTurn, and here for the same reason
      // rage is: Protective Ward cast in a corridor has no rounds to
      // count. Its effects carry no duration of their own, so the effect
      // sweep above cannot see it; the record on the caster's
      // active-spell entry is the only thing that knows when it ends.
      if (actor.getFlag?.("trg-prime", "activeSpells")?.some?.((e) => e?.ends || e?.emanation?.ends)) {
        const { sweepActiveSpellExpiry } = await import("../module/magic/active-spells.mjs");
        const faded = await sweepActiveSpellExpiry(actor, { worldTime, round: game.combat?.round ?? null });
        for (const name of faded) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime"><p><strong>${name}</strong> fades — its duration is spent.</p></div>`
          });
        }
      }
      // A ROW WITH NOTHING BEHIND IT, on the world clock (3.511.0) — the
      // other half of the sweep in TRGCombat._onStartTurn, and here for
      // the reason every sweep above it is here: a Bless cast in a
      // corridor has no rounds to count, and out of combat is precisely
      // where the row used to linger. Not guarded on `ends` like the
      // sweep above, because an orphaned row is one that never had a
      // stamp. See magic/orphaned-spells.mjs.
      if (actor.getFlag?.("trg-prime", "activeSpells")?.length) {
        const { sweepOrphanedSpells } = await import("../module/magic/active-spells.mjs");
        const { orphanedSpellLine } = await import("../module/magic/orphaned-spells.mjs");
        for (const name of await sweepOrphanedSpells(actor)) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime"><p>${orphanedSpellLine(name)}</p></div>`
          });
        }
      }
      /*
       * AND THE MIRROR OF THAT SWEEP (3.528.0): effects whose row is
       * gone, rather than a row whose effects are gone.
       *
       * FOUND IN THIS WORLD, 8 September 2026 — nine Bless effects on
       * three NPCs and a Light on a fourth, each from a cast no longer
       * registered. Bless is Sustained, so its effects carry no clock;
       * with the row gone, nothing would ever have collected them.
       *
       * ONLY STAMPED EFFECTS ARE CANDIDATES, which is what makes this
       * safe: see `strandedEffectIds`. The registered ids are gathered
       * ONCE for the whole pass rather than per actor, because the row
       * lives on the caster and the effect may not.
       */
      if (strandedLive === null) {
        const { registeredCastIds } = await import("../module/magic/active-spells.mjs");
        strandedLive = registeredCastIds(actors);
      }
      const { sweepStrandedEffects } = await import("../module/magic/active-spells.mjs");
      for (const name of await sweepStrandedEffects(actor, strandedLive)) {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<div class="trg-prime"><p><strong>${name}</strong> ends — the spell that `
            + "applied it is no longer running.</p></div>"
        });
      }
      // HEALING EARTH reverts to ordinary dirt when its ten minutes are
      // up — "if the earth remains unused until the spell's duration
      // expires". An ITEM on the world clock, so it comes due here
      // exactly as Refocus does rather than through the effect sweep,
      // which only walks `actor.effects`.
      if (actor.items?.some((i) => i.getFlag?.("trg-prime", "healingEarth"))) {
        const { expiredHealingEarth } = await import("../module/magic/healing-earth.mjs");
        const gone = expiredHealingEarth(actor.items, worldTime);
        if (gone.length) {
          await actor.deleteEmbeddedDocuments("Item", gone.map((i) => i.id));
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime trg-check-card"><header class="check-header">`
              + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
              + `<h3>Healing Earth</h3></div></header>`
              + `<p style="margin:2px 0">The earth reverts to ordinary dirt.</p></div>`
          });
        }
      }

      // Refocus, Partial (Chapter 6): "you must wait 1 minute before it can be
      // used again" — a wait measured on this clock rather than in turns, so
      // it comes due here. Combat's own turn boundary brings Success's restore
      // due instead (documents/combat.mjs); both call the same sweep, which
      // asks one predicate whether it is time yet.
      if (actor.items?.some((i) => i.getFlag?.("trg-prime", "refocus"))) {
        for (const back of await sweepRefocusRestores(actor)) {
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Refocus</h3></div></header><p style="margin:2px 0"><strong>${back.name}</strong> is yours again (${back.next} / ${back.max}).</p></div>`
          });
        }
      }
    }
  });
  // "An animal companion has a level equal to your level." A companion
  // stores its own level rather than reading its master's during
  // derivation (see companion.mjs for why), so something has to push the
  // new value across the moment the master's changes — and until 3.233.3
  // nothing did. A master levelling 6th to 8th left its companion on 6th
  // with a confident, wrong sheet.
  //
  // THE GATE IS THE WHOLE DESIGN. This hook fires on every actor update
  // in the world — HP ticks, condition toggles, token moves — so the
  // first three lines have to reject all of that for nothing. They do:
  // an id comparison, a type check and a key scan of the diff, before
  // anything touches `game.actors`. Only a genuine level or XP write
  // gets as far as looking for companions.
  //
  // `userId !== game.user.id` means the client that MADE the change is
  // the one that performs the push, so it happens exactly once no matter
  // how many people are logged in — the same once-only discipline the
  // world-time sweep above gets from `activeGM`, but without requiring a
  // GM to be online for a player's own level-up to take effect.
  Hooks.on("updateActor", async (actor, changed, options, userId) => {
    if (userId !== game.user?.id) return;
    if (actor?.type === "companion" || actor?.type === "familiar") return;

    // A FAMILIAR mirrors far more than a level — its saves, hit points,
    // attack and defence bonuses and every skill rank are its master's —
    // so there is no small set of paths to watch and the diff gate above
    // would miss most of what moves it. Gated on a flag instead, which is
    // constant time, and the mirror is rebuilt and compared rather than
    // written blind.
    const { mayHaveFamiliar, syncFamiliars } = await import("../module/familiar-workflow.mjs");
    if (mayHaveFamiliar(actor)) await syncFamiliars(actor, { announce: false });

    const { changeTouchesLevel } = await import("../module/companion.mjs");
    if (!changeTouchesLevel(changed)) return;
    const { syncCompanionLevels } = await import("../module/companion-workflow.mjs");
    await syncCompanionLevels(actor, { announce: true });
  });
  CONFIG.Actor.documentClass = TRGActor;
  CONFIG.Combat.documentClass = TRGCombat;
  CONFIG.Item.documentClass = TRGItem;

  game.trgPrime = {
    documents: {
      TRGActiveEffect,
      TRGActor,
      TRGItem,
      TRGCombat
    },
    applications: {
      TRGActorSheet,
      TRGItemSheet,
      TRGActiveEffectSheet
    },
    migration: {
      checkWorldMigration,
      migrateWorldData,
      purgeOrphanedItemsOfType,
      schemaVersion: TRG_SCHEMA_VERSION
    },
    dice: {
      TRGCheck,
      promptCheckConfiguration,
      ...resolution,
      ...openEnded
    },
    config: TRG,
    conditions: conditionsRegistry,
    rest: {
      openRestDialog
    },
    // TRAVEL AND SUSTENANCE (3.582.1; pages 226 and 230).
    travel: {
      openTravelDialog
    },
    /*
     * A CASTING IN PROGRESS (3.584.0). On the API because the window is
     * held open in ONE browser: if the player who started it disconnects,
     * the GM needs a way to read it and to end it, and the card's buttons
     * are in that player's client.
     */
    pendingCast: {
      status: pendingCastOf,
      complete: completePendingCast,
      stop: stopPendingCast
    },
    sustenance: {
      state: sustenanceState,
      advanceDay: advanceSustenanceDay
    },
    /*
     * THE CONTROL REGISTER (3.585.0, page 242). On the API because
     * releasing a creature is something a GM does between sessions as
     * often as during one — a summon that expired, a dominated guard
     * the party talked round — and the card button only exists on the
     * card that created the entry.
     */
    control: {
      status: controlSummary,
      release: releaseControlled
    },
    // Study Target: open the studied-targets manager for an actor at any
    // time (game.trgPrime.studyTarget.manage(actor)), not only from a
    // freshly-rolled card.
    studyTarget: {
      manage: openStudiedTargetManager,
      status: studiedTargetStatus
    },
    // Skill Specialties: open the chooser, or read a skill's cap/selection.
    skillSpecialties: {
      manage: openSpecialtyManager,
      status: specialtyStatus
    },
    // Earn Income: open the task manager, or read the active task.
    earnIncome: {
      manage: openEarnIncomeManager,
      status: earnIncomeStatus
    },
    // Create: open the crafting-project manager, or read the current project.
    create: {
      manage: openCreateManager,
      status: createProjectStatus
    },
    compendiumRefresh: {
      openRefreshDialog,
      previewRefresh,
      applyRefresh
    },
    // The live suite. `run()` is what the "Verify Foundry Integration"
    // macro calls, and the reason it lives here rather than in the macro
    // is that a rule kept in a compendium entry is a rule no harness can
    // read. See module/foundry-integration-check.mjs.
    integrationCheck: {
      run: runIntegrationCheck,
      schemas: FOUNDRY_SCHEMA_SNAPSHOT
    },
    // Universal Modifier: the GM resolution subsystem. `open()` raises the
    // window; the registry and transaction APIs are the module extension
    // surface (spec Section 25 — Semantic Target Registry API).
    modifier: {
      open: openUniversalModifier,
      app: UniversalModifierApp,
      listTargets: listModifierTargets,
      getTarget: getModifierTarget,
      registerTarget: registerModifierTarget,
      unregisterTarget: unregisterModifierTarget,
      log: getModifierLog,
      undo: undoTransaction,
      beginTransaction,
      commitTransaction
    },
    // Read from the manifest rather than hardcoded. It was hardcoded, and
    // had been reporting 3.96.1 from a 3.97.0 build — a version string that
    // has to be remembered on every release is one that will eventually be
    // wrong, and this one already was. A getter so it is correct whenever
    // it is asked, regardless of when game.system becomes available.
    get version() {
      return game.system?.version ?? "unknown";
    },
    // The companion-module API (3.560.0). See module/module-api.mjs.
    modules: buildModuleApi()
  };

  // A module registers its content here, with `game.trgPrime` now in
  // place. Modules loaded before init fired, so their listeners are up.
  fireRegistrationHook(game.trgPrime.modules);

  foundry.documents.collections.Actors.registerSheet("trg-prime", TRGActorSheet, {
    types: ["character", "npc", "companion", "familiar"],
    makeDefault: true,
    label: "TRG Prime Actor Sheet"
  });

  // The party gets its OWN sheet class, and is deliberately absent from
  // the list above. A party has no HP, no attributes and rolls nothing;
  // pointing the main actor sheet at one would run five thousand lines
  // of preparation against a schema that has none of the fields.
  foundry.documents.collections.Actors.registerSheet("trg-prime", TRGPartySheet, {
    types: ["party"],
    makeDefault: true,
    label: "TRG Prime Party Sheet"
  });

  // The effect sheet, replacing Foundry's own attribute-key form as the
  // default. Its technical half is behind a per-actor GM toggle.
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    ActiveEffect,
    "trg-prime",
    TRGActiveEffectSheet,
    { makeDefault: true, label: "TRG Prime Effect Sheet" }
  );

  foundry.documents.collections.Items.registerSheet("trg-prime", TRGItemSheet, {
    types: [
      "weapon",
      "armour",
      "shield",
      "gear",
      "consumable",
      "ammunition",
      "spell",
      "feat",
      "ability",
      "skill",
      "class",
      "race",
      "heritage",
      "background",
      "origin",
      "divine-aspect", "wizard-school",
      "affliction",
      "creature-type"
    ],
    makeDefault: true,
    label: "TRG Prime Item Sheet"
  });

  const handlebars = foundry.applications?.handlebars;
  const preload = handlebars?.loadTemplates ?? globalThis.loadTemplates;
  preload([
    "systems/trg-prime/templates/chat/check-card.hbs",
    // The effects tab renders one row markup in three places (3.383.0).
    // Preloaded so the partial is available by name at first render.
    "systems/trg-prime/templates/actor/effect-row.hbs"
  ]);
});

Hooks.once("ready", async () => {
  console.info(`TRG Prime | Ready on Foundry ${game.version}`);

  // Push module registrations into the live tables before anything reads
  // them — the migration below is the first thing that might.
  reportModuleRegistrations(flushModuleRegistrations());

  // The party sheet's Take buttons relay through the GM, so every
  // client listens: players to hear a refusal, the designated GM to
  // carry the move out. Registered on ready rather than init because
  // it reads game.user and game.users.
  registerPartySocket();
  // 3.339.4: lets a player's attack apply damage to a monster they do
  // not own. Without this, damage rolls and dies on application.
  registerTargetRelay();
  // A SUPPRESSED HAUNT'S CLOCK (3.629.0): re-armed when game time passes it.
  registerPerilHooks();
  // CODEX INHERITANCE (3.631.0): every Codex ability copy takes its entry's
  // declarations; the index needs the packs, so it waits for ready.
  await registerCodexInheritance();
  // WEATHER ON A SCENE OR A REGION (3.620.0; Chapter 12, Graham's R16):
  // the fields on their config sheets.
  registerWeatherConfig();

  // EVERY DELETION IN THE SYSTEM DEPENDS ON ONE FOUNDRY OPERATOR, and
  // when it is missing nothing throws — the update simply drops the
  // entry and the key survives. That is precisely how fifteen call sites
  // spent an unknown number of releases deleting nothing at all (see
  // module/deletion.mjs). If a future Foundry moves or renames it, this
  // says so on the first load instead of the next time somebody notices
  // that a skill will not delete.
  if (!deletionOperatorAvailable()) {
    console.error("TRG Prime | this Foundry has no ForcedDeletion operator — key deletions will silently do nothing. See module/deletion.mjs.");
    ui.notifications?.error("TRG Prime: this Foundry has no deletion operator — removing skills, flags and grants will not work. Please report this.");
  }

  // One-time cleanup: Items of type "action" (removed in 3.16.0, when the
  // action framework moved from items to static system data) fail schema
  // validation and can't be deleted through the normal UI. Gated the same
  // way as the schema migration below — GM only, and only the active GM if
  // several are logged in — so it runs exactly once per affected world,
  // then becomes a silent no-op forever after.
  if (game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id)) {
    await purgeOrphanedItemsOfType("action");
  }

  await checkWorldMigration();
});
