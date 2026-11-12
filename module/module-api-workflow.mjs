/**
 * The Foundry half of the companion-module API (3.560.0).
 *
 * module-api.mjs holds the registry and knows nothing about Foundry.
 * This file builds the object a module talks to — `game.trgPrime.modules`
 * — fires the hook a module registers in, and then FLUSHES the queued
 * entries that belong in live tables owned by other files:
 *
 *   languages     → languages.mjs      addLanguage
 *   skill actions → data/skill-actions addSkillActions
 *   feat use      → feats-workflow     FEAT_AUTOMATION (a plain object)
 *   class skills  → class-skills       CLASS_SKILL_GRANTS (a plain array)
 *
 * Passive automation hints have nowhere to be pushed — PASSIVE_AUTOMATION
 * is frozen and should stay so — and are read from the registry by the
 * two lookups in feats-workflow instead.
 *
 * ORDER OF EVENTS. Foundry loads the system's esmodule, then every active
 * module's, THEN fires `init`. A module that does its registering inside
 * `Hooks.on("trgPrime.registerContent", ...)` at load time is therefore
 * guaranteed to be listening when the system fires that hook from its
 * own `init`, after `game.trgPrime` exists. A module that would rather
 * call `game.trgPrime.modules.register*` directly can do so from its own
 * `init` or `setup` hook — both run after the system's `init` — as long
 * as it finishes before `ready`, when the flush happens. Anything
 * registered after that lands in the registry but not in the live
 * tables until the next flush; `game.trgPrime.modules.flush()` is public
 * for exactly that case.
 *
 * WHAT IS REPORTED. One console line per contributing module at ready,
 * and every registration problem as a warning. A module that registers
 * nothing is invisible here, which is correct.
 */
import {
  registerPack,
  registerSourcebook,
  registeredSourcebook,
  registerLanguage,
  registerTraits,
  registerRacialPP,
  registerClass,
  registerArchetype,
  registerHeritageRaceGrant,
  registerFeatAccess,
  registerFeatGate,
  registerExclusiveFeats,
  registerSkillSubstitution,
  registerDegreeUpgrades,
  registerSpellWarps,
  registerRunes, registeredRunes, registerLightSources, registerItemAutomation, registerPerilAutomation, registerFeatPickBonus, registerDamageShare,
  registerSpellCheckGate,
  registerCastSurcharge, registerReleasePath, registerWeaponTraitRule,
  registerCastRefusal, registerDeferredTeleport, registerCastDegreeRemap, registerResonanceSuppressor, registerEffectSuppressor, registerHighMagicRules,
  registerRitualRules, registerCastOption, registerDispelModifier,
  registerCastCapModifier, registerSpecialistAccess, registerFamiliarModifier, registerPPGrant,
  registerCheckReaction, registerDamageReaction, registerCastReaction, registerCriticalReaction, registerReactionStep,
  registerInnateLevelBonus,
  registerCastPrelude,
  registerDyingRecoveryModifier,
  registerFumbleModifier, registerResonanceModifier, registerChargedItemRule, registerPendingCastStep,
  registerUnconsciousOffer, registerFeatEligibility, registerExtraUses,
  registerMetamagic, registerCastPPSource, registerMetamagicPayment, registerCastCostModifier,
  registerCreateRoute,
  registerCompanionKind,
  queueSkillActions,
  queueFeatAutomation,
  queuePassiveAutomation,
  queueClassSkillGrant,
  queuedSkillActions,
  queuedFeatAutomation,
  queuedClassSkillGrants,
  registeredLanguages,
  registrationProblems,
  registryContributors,
  moduleRegistry
} from "./module-api.mjs";
import { KNOWN_SOURCEBOOKS, knownExtenderPacks, sourcebookTitle } from "./sourcebooks.mjs";
import { SYSTEM_ID, contentPack, contentPacksFor, isFederated } from "./content-packs.mjs";
import { addLanguage } from "./languages.mjs";
import { addSkillActions, addSkillToAction } from "./data/skill-actions.mjs";
import { FEAT_AUTOMATION, MODULE_HELPERS } from "./feats-workflow.mjs";
import { addPendingModifier } from "./pending-modifiers.mjs";
import { itemUsesMax, itemUsesRemaining } from "./uses-workflow.mjs";
import { levelDC } from "./dice/resolution.mjs";
import { applyConditionTags } from "./combat/effect-application-workflow.mjs";
import { createEffectsOn } from "./combat/target-relay-workflow.mjs";
import { SKILL_ACTIONS } from "./data/skill-actions.mjs";
import { CLASS_SKILL_GRANTS } from "./class-skills.mjs";
import { registerDefenceOffer } from "./combat/defence-offer.mjs";
import { LIGHT_SOURCES } from "./light-sources.mjs";

const HOOK_NAME = "trgPrime.registerContent";

/** Keys already flushed, so a second flush is idempotent. */
const flushed = {
  languages: new Set(),
  skillActions: new Set(),
  featAutomation: new Set(),
  classSkillGrants: new Set()
};

/**
 * Build the API object. `moduleId` is optional on every call; a module
 * that passes it gets named in the startup report.
 */
export function buildModuleApi() {
  return Object.freeze({
    hook: HOOK_NAME,
    registerPack: (collectionId, logicalName, moduleId) => registerPack(collectionId, logicalName, moduleId),
    // Which book a module's content files under in the pickers' Sourcebook menu (3.628.0).
    registerSourcebook: (packageName, title, moduleId) => registerSourcebook(packageName, title, moduleId),
    registerLanguage: (name, spec, moduleId) => registerLanguage(name, spec, moduleId),
    registerTraits: (names, moduleId) => registerTraits(names, moduleId),
    registerRacialPP: (name, perLevel, moduleId) => registerRacialPP(name, perLevel, moduleId),
    registerClass: (name, spec, moduleId) => registerClass(name, spec, moduleId),
    registerArchetype: (name, spec, moduleId) => registerArchetype(name, spec, moduleId),
    registerHeritageRaceGrant: (featName, races, moduleId) => registerHeritageRaceGrant(featName, races, moduleId),
    registerFeatAccess: (kind, ownerName, featNames, moduleId) => registerFeatAccess(kind, ownerName, featNames, moduleId),
    // A trait whose feats need another feat owned, and feats of which one may be held (3.627.0).
    registerFeatGate: (trait, featNames, moduleId) => registerFeatGate(trait, featNames, moduleId),
    registerExclusiveFeats: (group, featNames, moduleId) => registerExclusiveFeats(group, featNames, moduleId),
    registerSkillSubstitution: (featName, entries, moduleId) => registerSkillSubstitution(featName, entries, moduleId),
    registerDegreeUpgrades: (featName, entries, moduleId) => registerDegreeUpgrades(featName, entries, moduleId),
    // A warping option a feat grants to the spells it names (3.625.0).
    registerSpellWarps: (featName, entries, moduleId) => registerSpellWarps(featName, entries, moduleId),
    registerRunes: (runes, moduleId) => registerRunes(runes, moduleId),
    // AN ITEM'S TIMED STATE (3.673.0, C9): the Incense Burner's lit hour. The
    // rune timer's own rail — a state on the item, an effect on the bearer
    // that ends it — so an aura declaring `whileState` runs exactly as long.
    startItemTimer: async (actor, item, { key, state, label, durationSeconds, ending = null }) => {
      const { startRuneTimer } = await import("./rune-timers-workflow.mjs");
      return startRuneTimer(actor, item, { key, state, label, durationSeconds, ending });
    },
    // …AND ENDED BY HAND (3.673.0; found in review): the timer's `manual`
    // ending is said, not its lapse. Resolves whether one was running.
    stopItemTimer: async (actor, item, key) => {
      const { stopRuneTimer } = await import("./rune-timers-workflow.mjs");
      return stopRuneTimer(actor, item, key);
    },
    // ANOTHER SKILL'S ROAD TO CREATE (3.673.0): Inner Tempest's Monastic Items.
    registerCreateRoute: (route, moduleId) => registerCreateRoute(route, moduleId, { addSkill: addSkillToAction }),
    // A KIND OF COMPANION BESIDE THE ANIMAL COMPANION (3.674.0, C1): Inner
    // Tempest's Dragon Companion. See companion.mjs `companionKindSpec`.
    registerCompanionKind: (kind, moduleId) => registerCompanionKind(kind, moduleId),
    // …AND MAKING ONE (3.674.0): the Animal Companion feat's own path, for a
    // kind. `options`: { kind, only, title, intro, flags }. See companion-workflow.mjs.
    createCompanionFor: async (master, featItem, options = {}) => {
      const { createCompanionFor } = await import("./companion-workflow.mjs");
      return createCompanionFor(master, featItem, options);
    },
    // SOUL DRAIN HELD BY A SOURCE (3.674.0, C8): Inner Tempest's lost dragon.
    holdSoulDrain: async (actor, source, amount) => (await import("./combat/dying-workflow.mjs")).holdSoulDrain(actor, source, amount),
    releaseSoulDrain: async (actor, source, options = {}) => (await import("./combat/dying-workflow.mjs")).releaseSoulDrain(actor, source, options),
    companionsOf: async (master, kind = null) => {
      const { companionsOf } = await import("./companion-workflow.mjs");
      return companionsOf(master, kind);
    },
    registeredRunes: (kind) => registeredRunes(kind),
    // A light a module's content sheds, in the LIGHT_SOURCES shape (3.669.0).
    registerLightSources: (entries, moduleId) => registerLightSources(entries, moduleId, Object.keys(LIGHT_SOURCES)),
    registerItemAutomation: (name, spec, moduleId) => registerItemAutomation(name, spec, moduleId),
    // A peril's Trigger or routine action that is more than a save (3.629.0).
    registerPerilAutomation: (name, spec, moduleId) => registerPerilAutomation(name, spec, moduleId),
    // Extra feat picks from a module's campaign option (3.630.0).
    registerFeatPickBonus: (key, picks, moduleId) => registerFeatPickBonus(key, picks, moduleId),
    // A share of an ally's HP damage taken elsewhere (3.630.0).
    registerDamageShare: (key, share, moduleId) => registerDamageShare(key, share, moduleId),
    // An answer to a casting before its check is rolled (3.672.0): rows and card lines.
    registerSpellCheckGate: (key, gate, moduleId) => registerSpellCheckGate(key, gate, moduleId),
    // ELDRITCH ARTS BLOCK 1 (3.675.0): a casting's surcharge (C3), another way
    // to read a scroll (C6), a weapon trait's category for a class type (C8).
    registerCastSurcharge: (key, surcharge, moduleId) => registerCastSurcharge(key, surcharge, moduleId),
    registerReleasePath: (key, path, moduleId) => registerReleasePath(key, path, moduleId),
    registerWeaponTraitRule: (trait, spec, moduleId) => registerWeaponTraitRule(trait, spec, moduleId),
    // ELDRITCH ARTS BLOCK 2 (3.678.0): a casting refused (D7), its degree read
    // differently (D7), no Resonance here (D6), an effect switched off (D14),
    // and whose High Magic rules are in force (D1b).
    registerCastRefusal: (key, refuse, moduleId) => registerCastRefusal(key, refuse, moduleId),
    // A TELEPORT LATER THAN ITS CAST (3.685.1): no Spatial Awareness card at
    // the cast; the module calls `helpers.teleportationArrives` when it moves.
    registerDeferredTeleport: (key, defers, moduleId) => registerDeferredTeleport(key, defers, moduleId),
    registerCastDegreeRemap: (key, remap, moduleId) => registerCastDegreeRemap(key, remap, moduleId),
    registerResonanceSuppressor: (key, suppress, moduleId) => registerResonanceSuppressor(key, suppress, moduleId),
    registerEffectSuppressor: (key, suppressed, moduleId) => registerEffectSuppressor(key, suppressed, moduleId),
    registerHighMagicRules: (moduleId) => registerHighMagicRules(moduleId),
    // A RITUAL'S RULES AND A CASTING OPTION (3.679.0; Eldritch Arts Block 2b).
    registerRitualRules: (key, spec, moduleId) => registerRitualRules(key, spec, moduleId),
    registerCastOption: (key, spec, moduleId) => registerCastOption(key, spec, moduleId),
    // A DISPEL MODIFIER (3.683.0; Eldritch Arts Block 5, D10, C9): Dispel Power,
    // Resonant Ascendance, Threadbreaker's Precision, Mirrored Rebuke; Block 6's
    // Runebreaker and Glyph Shatter. See module-api.mjs for the contract.
    registerDispelModifier: (key, spec, moduleId) => registerDispelModifier(key, spec, moduleId),
    // THE CLASSES' SEAMS (3.680.0; Eldritch Arts Block 3a): a raise of the PP
    // cap per cast (Raw Power), a specialist spell opened to a character (a
    // birthright's list), a familiar's modifier (the Soulbound Familiar), and a
    // PP grant by feature name (Wild Power).
    registerCastCapModifier: (key, raise, moduleId) => registerCastCapModifier(key, raise, moduleId),
    registerSpecialistAccess: (key, allows, moduleId) => registerSpecialistAccess(key, allows, moduleId),
    registerFamiliarModifier: (key, modify, moduleId) => registerFamiliarModifier(key, modify, moduleId),
    registerPPGrant: (name, spec, moduleId) => registerPPGrant(name, spec, moduleId),
    // THE REACTIONS (3.681.0; Eldritch Arts Block 3b): before and after a d20
    // check, before damage meets the defences, after a cast's check, before a
    // critical's roll; and a reaction's own work on the reactor's client.
    registerCheckReaction: (key, spec, moduleId) => registerCheckReaction(key, spec, moduleId),
    registerDamageReaction: (key, offer, moduleId) => registerDamageReaction(key, offer, moduleId),
    registerCastReaction: (key, offer, moduleId) => registerCastReaction(key, offer, moduleId),
    registerCriticalReaction: (key, offer, moduleId) => registerCriticalReaction(key, offer, moduleId),
    registerReactionStep: (name, run, moduleId) => registerReactionStep(name, run, moduleId),
    // LEVELS ON AN INNATE CAST (3.682.0; Block 4, D9): the bonded souls' "+1".
    registerInnateLevelBonus: (key, bonus, moduleId) => registerInnateLevelBonus(key, bonus, moduleId),
    registerCastPrelude: (key, prelude, moduleId) => registerCastPrelude(key, prelude, moduleId),
    // THE FATIGUE FOR LEAVING DYING, WAIVED (3.683.0; Block 5, C8): Relentless Will.
    registerDyingRecoveryModifier: (key, modify, moduleId) => registerDyingRecoveryModifier(key, modify, moduleId),
    // ELDRITCH ARTS BLOCK 6, GROUP B (3.684.0). The fumble and Resonance rolls
    // (G5: Mana Bound, Spell Surge, High Magic Resonance, Resonance Surge);
    // one spend path for every charged item (G6: the Adept's Conduit feats,
    // Weave Infusion); a step before a pending cast's interruption settles
    // (G26: Magical Retribution). Contracts in module-api.mjs; the cast
    // reaction's new answers (G17) and the spell store's host (G16) need no
    // registration — see registerCastReaction and helpers.storeForeignSpell.
    registerFumbleModifier: (key, modify, moduleId) => registerFumbleModifier(key, modify, moduleId),
    registerResonanceModifier: (key, spec, moduleId) => registerResonanceModifier(key, spec, moduleId),
    registerChargedItemRule: (key, spec, moduleId) => registerChargedItemRule(key, spec, moduleId),
    registerPendingCastStep: (key, step, moduleId) => registerPendingCastStep(key, step, moduleId),
    // ELDRITCH ARTS BLOCK 6, GROUP C (3.684.0). "When you would fall
    // unconscious" (G7: Subconscious Casting, Eternal Vigil); a feat's
    // eligibility the prerequisite line cannot say (G9: Arcane Study, High
    // Magic Resonance, Resonance Surge); extra daily uses by feat (G21: Extra
    // Communion, Deep Weave, Extra Reservoir). Contracts in module-api.mjs.
    registerUnconsciousOffer: (key, spec, moduleId) => registerUnconsciousOffer(key, spec, moduleId),
    registerFeatEligibility: (name, check, moduleId) => registerFeatEligibility(name, check, moduleId),
    registerExtraUses: (name, spec, moduleId) => registerExtraUses(name, spec, moduleId),
    // ELDRITCH ARTS BLOCK 6, GROUP A (3.684.0). The metamagic family: a module's
    // metamagic in the Warp? dialog (G1: the 13 Metamagic feats, Echo, Pulse,
    // Harmony, Spell Surge, Spell Weaver…); another way to pay a cast's PP (G2:
    // Bloodmage's Bleed); an option paid in AP (G3: Metamagic Adept); PP off
    // what is paid (G4: Hex Mastery, Storm Bolt). Contracts in module-api.mjs;
    // `helpers.metamagicCatalogue` lists what a character has.
    registerMetamagic: (key, spec, moduleId) => registerMetamagic(key, spec, moduleId),
    registerCastPPSource: (key, spec, moduleId) => registerCastPPSource(key, spec, moduleId),
    registerMetamagicPayment: (key, spec, moduleId) => registerMetamagicPayment(key, spec, moduleId),
    registerCastCostModifier: (key, modify, moduleId) => registerCastCostModifier(key, modify, moduleId),
    registerSkillActions: (actions, moduleId) => queueSkillActions(actions, moduleId),
    registerFeatAutomation: (name, entry, moduleId) => queueFeatAutomation(name, entry, moduleId),
    registerPassiveAutomation: (name, hint, moduleId) => queuePassiveAutomation(name, hint, moduleId),
    registerClassSkillGrant: (entry, moduleId) => queueClassSkillGrant(entry, moduleId),
    // A reaction to being attacked, offered to the defender before the roll (3.666.1).
    registerDefenceOffer: (name, spec, moduleId) => registerDefenceOffer(name, spec, moduleId),
    flush: flushModuleRegistrations,
    /**
     * What a module's Use handlers need to look and behave like core
     * ones: the card and chooser helpers, the pending-modifier queue,
     * per-day use maths, the level DC, condition application, and the
     * skill-action table (live — module additions included).
     */
    helpers: Object.freeze({
      ...MODULE_HELPERS,
      addPendingModifier,
      itemUsesMax,
      itemUsesRemaining,
      levelDC,
      applyConditionTags,
      // Effects on a creature this client may not own go through the GM relay.
      createEffectsOn,
      // A CASTER'S SPELL ENDED BY ITS TARGET'S ROLL (3.672.0): Inner Tempest's
      // Spiritual Distraction and Disrupt Soul, "the spell ends". Through the
      // GM when this client does not own the caster.
      // WHY AN ITEM CANNOT BE INVESTED NOW, or "" (3.675.0; Eldritch Arts'
      // Quickbind): Invest Item's own rules — one Staff, the slot limit.
      investRefusal: async (actor, item) => (await import("./magic-items-workflow.mjs")).investRefusal(actor, item),
      endSpellOf: async (caster, castId) => (await import("./combat/target-relay-workflow.mjs")).relayEndSpell(caster, castId),
      get skillActions() { return SKILL_ACTIONS; },
      // THE ONE DEATH QUESTION (3.674.0, C12; Inner Tempest's dragon bond:
      // "if your dragon companion is killed", and "restored to life"). Dying
      // past the Death State, an instant death, or Constitution −5, as the
      // system itself asks it (combat/death-state.mjs).
      isDead: async (actor) => (await import("./combat/death-state.mjs")).isDead(actor),
      // THE PER-DIE SPELL DAMAGE BONUS FOR A POOL THE MODULE ROLLS ITSELF
      // (3.683.0; Eldritch Arts Block 5, C6; Graham's Q70): "your magical
      // abilities' damage" (Elemental Reprisal, a breath) takes Emberborn
      // Fury's "+1 damage per die rolled" as a spell's pools do. `dice` is the
      // pool's formula (its dice are counted) or a number of dice; `type` the
      // pool's damage type. Resolves `{ dice, perDie, total, text }` from the
      // actor's per-die `spellDamageBonus` rows (magic/spell-damage-bonus.mjs);
      // the module adds `total` to its roll and says `text` on its card.
      spellDamagePerDieBonus: async (actor, { type = "", dice = 0, traits = [] } = {}) => {
        const { declaredSpellDamagePerDie, spellDamagePerDie } = await import("./magic/spell-damage-bonus.mjs");
        return spellDamagePerDie(dice, declaredSpellDamagePerDie(
          Array.from(actor?.appliedEffects ?? actor?.effects ?? []), { damageType: String(type ?? ""), traits }));
      },
      resolveAction: async (...args) => (await import("./combat/action-workflow.mjs")).resolveAction(...args),
      // HEALING AND A ROLL (3.627.0), for a module Use that heals its owner or
      // makes others save — Pillars of Faith's Carrion Feast and the lich's
      // phylactery. The system's own: healActor's rules (Dying, relay), and
      // TRGCheck with its automatic conditionals.
      healActor: async (...args) => (await import("./magic/spell-effects.mjs")).healActor(...args),
      // A save or skill config gains the sheet's modifiers when it brings none (3.627.1).
      rollCheck: async (config) => {
        const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
        return (await import("./dice/check.mjs")).TRGCheck.roll(withCheckModifiers(config));
      },
      // Conditions on a creature this client may not own go through the GM relay (3.627.0).
      applyConditionTagsTo: async (target, tags, options = {}) => {
        const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
        return relayConditionTags(target, tags, options, () => applyConditionTags(target, tags, options));
      },
      formatAppliedTags: async (applied) => (await import("./combat/effect-application-workflow.mjs")).formatAppliedTags(applied),
      // Typed damage through the whole pipeline — resistances, immunities, the
      // relay — and its card line (3.629.0; the Hungry Reliquary's essence).
      applyTypedDamage: async (...args) => (await import("./combat/damage-workflow.mjs")).applyTypedDamage(...args),
      describeDamage: async (...args) => (await import("./combat/damage-workflow.mjs")).describeDamage(...args),
      // ELDRITCH ARTS BLOCK 2 (3.678.0): what Chapter 7's tables and Tap
      // Magical Energy call that only the system has — a Resonance event (a
      // ley line's Chaos Backlash, a wild surge's 66), a charged item's level
      // and its Charge Depletion roll, and whether a point is inside a Region
      // (the placeable's own test first; see combat/surfaces.mjs).
      rollResonanceEvent: async (...args) => (await import("./magic/cast-workflow.mjs")).rollResonanceEvent(...args),
      chargedItemLevelOf: async (...args) => (await import("./charged-items.mjs")).chargedItemLevelOf(...args),
      rollItemDepletion: async (...args) => (await import("./magic-items-workflow.mjs")).rollItemDepletion(...args),
      // FOR BLOCK 2b (3.679.0): a material sacrifice's gold, from the purse
      // as Learn a Spell takes it; Borrow Spell's "normal DC to learn the
      // spell"; and a book caster, who alone may borrow.
      deductGold: async (actor, gp) => {
        const { deductCurrency } = await import("./items.mjs");
        const out = deductCurrency(actor?.system?.currency, gp);
        if (out.success) await actor.update({ "system.currency": out.purse });
        return { paid: Boolean(out.success), shortfallGP: Number(out.shortfallGP ?? 0) };
      },
      goldOf: async (actor) => (await import("./items.mjs")).coinValueInGP(actor?.system?.currency),
      learnSpellDC: async (spell) => {
        const { learnSpellCost } = await import("./magic/learn-spell.mjs");
        const { rarityDCIncrease } = await import("./traits.mjs");
        return learnSpellCost(spell?.system?.ppCost).dc + rarityDCIncrease(spell?.system ?? {});
      },
      // LEARN A SPELL'S TERMS FOR A PP (3.682.0; Eldritch Arts' Book of
      // Infusions, Q46: a rune is learned "using rules for learning spells",
      // its level as the PP): the materials' price, the DC and the hours.
      learnSpellTerms: async (pp) => {
        const { learnSpellCost, learnSpellHours } = await import("./magic/learn-spell.mjs");
        const cost = learnSpellCost(pp);
        return { gp: Number(cost.gp ?? 0), dc: Number(cost.dc ?? 0), hours: Number(learnSpellHours(pp) ?? 0) };
      },
      // …AND WHAT A DEGREE OF ITS CHECK MEANS (review): learned or not, and
      // the materials it consumes ("none", "half", "full"). See learnSpellOutcome.
      learnSpellOutcome: async (degreeKey) => (await import("./magic/learn-spell.mjs")).learnSpellOutcome(String(degreeKey ?? "")),
      // RECURRING DAMAGE ON A CREATURE (3.682.0; Eldritch Arts' Emberlord,
      // "it causes a target to erupt into flames inflicting 1d6 recurring fire
      // damage"): the core's own rule for a second source (`layRecurring`, as
      // a metal rider's and a bomb's), on the Recurring condition. Since
      // 3.685.0 (Q150) the same type adds to that type's total and another
      // type is its own. Resolves `{ value, damageType, before, added,
      // stacked, replaced: false }` — `value` is that type's new total.
      addRecurringDamage: async (target, amount, damageType) => {
        if (!target) return null;
        const { layRecurring } = await import("./conditions/recurring-workflow.mjs");
        // Through the GM when this client does not own the creature (a player's Xithra on a GM's monster).
        const { relayStatus } = await import("./combat/target-relay-workflow.mjs");
        return layRecurring(target, Math.max(0, Math.trunc(Number(amount) || 0)), String(damageType ?? ""), {
          apply: (options) => relayStatus(target, "recurring", options, () => target.toggleStatusEffect("recurring", options))
        });
      },
      // THE RUNES THAT GO ON A KIND OF ITEM, with their tiers and levels, and a
      // selection written back as a rune field (3.682.0; Eldritch Arts' Book of
      // Infusions and Infuse Weapon). See rune-catalogue.mjs.
      runesFor: async (kind) => (await import("./rune-catalogue.mjs")).runesFor(kind),
      runesToField: async (kind, selection = []) => (await import("./rune-catalogue.mjs")).runesToField(kind, selection),
      keepsSpellbook: async (actor) => (await import("./magic/learn-spell-workflow.mjs")).learnSpellEligible(actor),
      // FOR BLOCK 3a (3.680.0): the Soulbound Familiar is "treated as a
      // familiar", made as the core's Familiar feat makes one, and found again.
      createFamiliarFor: async (master, sourceItem) => (await import("./familiar-workflow.mjs")).createFamiliarFor(master, sourceItem),
      familiarsOf: async (master) => (await import("./familiar-workflow.mjs")).familiarsOf(master),
      regionContains: async (...args) => (await import("./combat/surfaces.mjs")).regionContains(...args),
      // THE AUTOMATION PASS (3.630.0) — Pillars of Faith's Martyr's Aegis,
      // Soul Mirror and Grace beyond Need: temporary HP that keeps the larger
      // pool, the runes that count on an item and their once-a-minute
      // markers, and the distance between two tokens.
      grantTempHP: async (...args) => { const { grantTempHP } = await import("./magic/spell-effects.mjs"); return grantTempHP(...args); },
      activeRunesOn: async (...args) => (await import("./rune-declarations.mjs")).activeDeclaredRunesOn(...args),
      runeMarkersOf: async (...args) => (await import("./rune-declarations.mjs")).runeMarkersOf(...args),
      runeFrequencyAllows: async (...args) => (await import("./rune-declarations.mjs")).runeFrequencyAllows(...args),
      runeUseUpdates: async (...args) => (await import("./rune-declarations.mjs")).runeUseUpdates(...args),
      // A MOVE AND A STRIKE THE ABILITY ALREADY PAID FOR (3.664.0) — Inner
      // Tempest's Predator's Pounce ("Stride … and then make a melee
      // Strike"), Wing Burst ("Fly up to your Speed"). `armMove` arms the
      // player's next drag free of AP, the way a compound action's leg is
      // armed: {maxFeet, speedKey ("" for any), provokes, note}, under the
      // ability's name. `rollWeaponAttack` is the Strike workflow itself;
      // pass {apPaid: true} for a strike the ability's AP already bought.
      armMove: async (actor, leg = {}, label = "") => {
        const { armCompoundLeg } = await import("./combat/compound-action-workflow.mjs");
        const clean = {
          speedKey: String(leg.speedKey ?? ""),
          maxFeet: Math.max(0, Number(leg.maxFeet) || 0),
          note: String(leg.note ?? ""),
          provokes: leg.provokes !== false
        };
        return armCompoundLeg(actor, clean, String(label || "Move"));
      },
      rollWeaponAttack: async (...args) => (await import("./combat/attack-workflow.mjs")).rollWeaponAttack(...args),
      // STRIKES THAT MEET THEIR DEFENCES ONCE (3.667.0): Flurry of Blows'
      // two Strikes, DR applied once to a creature hit twice and one critical
      // injury between them, with the multiple attack penalty run normally.
      // See combat/strike-series.mjs.
      runStrikeSeries: async (...args) => (await import("./combat/strike-series.mjs")).runStrikeSeries(...args),
      // A STRIKE THAT COUNTS AS UNARMED (3.667.0): the fists, or a weapon
      // with the Monastic trait. See combat/unarmed-profile.mjs.
      countsAsUnarmed: async (weapon) => (await import("./combat/unarmed-profile.mjs")).countsAsUnarmed(weapon?.system ?? weapon),
      /**
       * FOR THIS HOLDER'S ABILITIES (3.671.0; Soul-Bound Weapon, Zen
       * Archer, B7-6): unarmed as above, or a weapon the actor declares its
       * unarmed abilities reach (`unarmedAbilityWeapons`). For Flurry of
       * Blows and the like; never for unarmed damage.
       */
      /**
       * "IMMUNE TO ITS EFFECTS FOR 1 HOUR" (3.671.0; Inner Tempest's
       * Restorative Palm). The record the core's own Treat Wounds and
       * Guidance keep on the target (`flags.trg-prime.temporaryImmunity`),
       * by world time. `temporaryImmunityRefusal` resolves "" or why not;
       * `grantTemporaryImmunity` writes it, the longer expiry winning.
       */
      /**
       * CAST A SPELL AS INNATE, ONCE, WITHOUT KEEPING IT (3.671.0; Inner
       * Tempest's Harmony Warden: "once per day you may enter a trance for
       * 10 minutes and cast any one PP 2 Verdant spell … as an innate
       * spell"). `spellData` is a spell's data (a compendium entry's
       * `toObject()`); it is cast from a temporary document, as a potion's
       * spell is, so nothing is added to the sheet. `ability` (an attribute
       * key) and `tradition` stand as an innate grant's would; the usual
       * innate rules apply, the level limit included (`allowance` as
       * B3-2's). The caller keeps the once-a-day count. Resolves what
       * castSpell resolves.
       */
      castInnateOnce: async (actor, spellData, { ability = "", tradition = "", allowance = 0 } = {}) => {
        const data = foundry.utils.deepClone(spellData ?? {});
        delete data._id;
        data.type = "spell";
        data.system = { ...(data.system ?? {}), innate: true };
        // NO DAILY COUNT ON THE COPY: the caller keeps it ("once per day").
        // A spell's template carries `usesPerDay`, and an innate spell with
        // one is counted from it (uses-workflow `itemUsesMax`).
        delete data.system.usesMax;
        delete data.system.usesPerDay;
        delete data.system.usesValue;
        delete data.system.bonusUses;
        if (tradition) data.system.tradition = tradition;
        if (ability) foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.castingAbilityOverride`, ability);
        if (Math.trunc(Number(allowance) || 0) > 0) foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.innatePPAllowance`, Math.trunc(Number(allowance)));
        foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.innateOnce`, true);
        const spell = new Item.implementation(data, { parent: actor });
        const { castSpell } = await import("./magic/cast-workflow.mjs");
        return castSpell(actor, spell);
      },
      /**
       * "A NEW SAVING THROW AGAINST ONE POISON OR DISEASE CURRENTLY
       * AFFECTING IT" (3.671.0; Inner Tempest's Restorative Palm): the
       * affliction's own stage save, now, with its usual ladder and no
       * interval damage, as Antitoxin's immediate save. Resolves what the
       * save did ({ended} or {stage}), or null when it is still incubating.
       */
      /**
       * AN ITEM'S SPELL AT THE ITEM'S OWN PP (3.673.0, C11; Inner Tempest's
       * Restorative Mat: "you may once per day gain the benefit of either a
       * Cure or Restoration spell (8 PP) by meditating on the mat"). The
       * release potions, scrolls and wands already take
       * (consumable-use-workflow `releaseItemSpell`): the spell by name — the
       * actor's own copy, a uuid, or the spells pack — cast as an item cast at
       * `pp`, none of the user's own PP, its activation already paid when
       * `apPaid`. Resolves {cast, missing}; the caller keeps the once-a-day.
       */
      releaseItemSpell: async (actor, item, { name = "", uuid = "", pp = 0 } = {}, { apPaid = false, fixedDC = null } = {}) => {
        const { releaseItemSpell } = await import("./consumable-use-workflow.mjs");
        const ref = { name: String(name ?? ""), uuid: String(uuid ?? ""), pp: Math.max(0, Math.trunc(Number(pp) || 0)), warp: null };
        const out = await releaseItemSpell(actor, item, ref, { apPaid: Boolean(apPaid), fixedDC });
        return { cast: Boolean(out?.cast), missing: Boolean(out?.missing) };
      },
      rollAfflictionSave: async (actor, affliction) => (await import("./combat/affliction-workflow.mjs")).rollAfflictionStageSave(actor, affliction, { withDamage: false }),
      temporaryImmunityRefusal: async (target, key) => {
        const t = await import("./temporary-immunity.mjs");
        const now = Number(game.time?.worldTime ?? 0);
        const record = target?.getFlag?.(SYSTEM_ID, t.IMMUNITY_FLAG) ?? {};
        if (!t.isTemporarilyImmune(record, key, now)) return "";
        return `${target.name} is immune to ${key} for ${t.describeRemaining(t.immunityRemaining(record, key, now))}.`;
      },
      grantTemporaryImmunity: async (target, key, seconds) => {
        const t = await import("./temporary-immunity.mjs");
        const now = Number(game.time?.worldTime ?? 0);
        const record = target?.getFlag?.(SYSTEM_ID, t.IMMUNITY_FLAG) ?? {};
        await target?.setFlag?.(SYSTEM_ID, t.IMMUNITY_FLAG, t.withImmunity(t.prunedImmunities(record, now), key, seconds, now));
        return true;
      },
      /**
       * A SHEATHED WEAPON (3.671.0; Iaijutsu Master, B7-5): the weapons the
       * actor carries and is not wielding, of one group ("sword") or any.
       */
      sheathedWeapons: async (actor, group = "") => (await import("./combat/sheathed.mjs")).sheathedWeapons(actor?.items ?? [], group),
      unarmedAbilityWeapon: async (actor, weapon) => {
        const u = await import("./combat/unarmed-profile.mjs");
        return u.countsAsUnarmed(weapon?.system ?? weapon) || u.declaresUnarmedAbilities(u.unarmedAbilityCarriers(actor), weapon);
      },
      // A BLOW HELD BY BLACK LOTUS (3.668.0): is it due on this turn, and
      // land it (the critical, then the damage). See combat/held-strike.mjs.
      heldStrikeDue: async (record, turn) => (await import("./combat/held-strike.mjs")).heldStrikeDue(record, turn),
      landHeldStrike: async (actor) => (await import("./combat/held-strike.mjs")).landHeldStrike(actor),
      // A STRIKE'S DAMAGE WITHOUT ITS ATTACK (3.668.0): Inner Tempest's Steel
      // Viper, "if you miss with an attack, roll the damage and deal it as
      // half damage". The core's own damage roll with `preset` {glancing,
      // targetToken, critical, damageType, note}: glancing halves it, as a
      // glancing blow's damage is halved.
      rollWeaponDamage: async (actor, weapon, options = {}) => (await import("./combat/attack-workflow.mjs")).rollWeaponDamage(actor, weapon, options),
      // THE MULTIPLE ATTACK PENALTY AT AN ATTACK NUMBER (3.668.0): Inner
      // Tempest's Flow Strike is made "as if it was your third strike of the
      // turn (usually -10 but this may be lower based upon what feats you
      // have)". `index` counts from 0: the third Strike is 2. Agile Strikes'
      // ladder is read off the actor. See combat/attack.mjs.
      mapPenalty: async (actor, weapon, index) => {
        const { mapPenalty } = await import("./combat/attack.mjs");
        const agile = /\bagile\b/i.test(String(weapon?.system?.traits ?? weapon?.traits ?? ""));
        const agileStrikes = agile && Array.from(actor?.items ?? []).some((i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "agile strikes");
        return mapPenalty(index, agile, agileStrikes);
      },
      // ONE BASIC SAVE AGAINST ONE CREATURE (3.667.0, exposed): the cast's
      // own rule — the share, the critical's extra dice, a magical area
      // source — for a module's area technique (Inner Tempest's Inner Blast).
      // See magic/area-save-workflow.mjs.
      basicSaveHit: async (...args) => (await import("./magic/area-save-workflow.mjs")).basicSaveHit(...args),
      // A CRITICAL "AS IF A BASIC SAVE" (3.672.0; Inner Tempest's Disrupt
      // Soul: "an essence critical with a severity determined as if they were
      // making a basic saving throw"). `basicSaveSeverity(degree, margin)` is
      // the core's own reading of a save's failure margin, or null for none;
      // `rollCriticalInjury` is the injury roll the cast's criticals use.
      basicSaveSeverity: async (degree, margin) => (await import("./dice/resolution.mjs")).basicSavingThrow(degree, margin).criticalSeverity ?? null,
      rollCriticalInjury: async (...args) => (await import("./combat/attack-workflow.mjs")).rollCriticalInjury(...args),
      // AN AREA OR A TARGETED SAVE WITH A LADDER (3.669.0; Inner Tempest's
      // Blinding Majesty, Celestial Breath, Valley Chill, Web Snare): the
      // creature abilities' own rail — `spec` in the `creatureAbility.area`
      // shape (save, basic, dc, damage, radiusFeet, scope "area" or
      // "targets", enemiesOnly, conditions by degree, immunitySeconds), for a
      // module ability whose Use must also spend its AP and Focus first.
      // `opts.targets` names the creatures. Resolves the card's lines.
      runAreaEffect: async (actor, spec, opts = {}) => {
        const { perilEffectSpec } = await import("./peril-effect.mjs");
        const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
        return runDeclaredAreaEffect(actor, perilEffectSpec(spec), opts);
      },
      // THE TRAIT RULES FOR A MODULE ABILITY (3.664.0): Flourish's once a
      // turn, Press, Open, Rage, Stance's round — asked before the ability
      // acts (`traitGate(actor, {key, traits}, name)` → false and a warning
      // when a trait refuses it) and recorded after it has
      // (`recordTraitUsage(actor, {key, traits})`), exactly as a core
      // action is. Inner Tempest's Wing Burst and Predator's Pounce are
      // Flourishes.
      traitGate: async (...args) => (await import("./traits-workflow.mjs")).traitGate(...args),
      // THE SAME RULES, ASKED QUIETLY (3.668.0): {blocked, reason} and no
      // warning, for an offer that should not be made at all when a trait
      // refuses it (Inner Tempest's Flow Strike, a Flourish offered after
      // every hit).
      traitCheck: async (...args) => (await import("./traits-workflow.mjs")).traitCheck(...args),
      recordTraitUsage: async (...args) => (await import("./traits-workflow.mjs")).recordTraitUsage(...args),
      // LIGHT ON THE MAP (3.669.0). `refreshTokenLight(actor)` makes the
      // token's glow match the light sources its effects carry (an effect
      // flagged `lightSource: <key>`, a registered key included) — through
      // the GM when the token is not this client's. `placeLightCircles`,
      // `moveLightCircles` and `removeLightCircles` are Inner Tempest's
      // Foxfire motes: Regions that raise the light where they stand, placed
      // and moved with the area aim. See magic/placed-light-workflow.mjs.
      refreshTokenLight: async (actor) => (await import("./light-attach-workflow.mjs")).refreshAttachedLight(actor),
      placeLightCircles: async (...args) => { const { placeLightCircles } = await import("./magic/placed-light-workflow.mjs"); return placeLightCircles(...args); },
      moveLightCircles: async (...args) => { const { moveLightCircles } = await import("./magic/placed-light-workflow.mjs"); return moveLightCircles(...args); },
      removeLightCircles: async (...args) => { const { removeLightCircles } = await import("./magic/placed-light-workflow.mjs"); return removeLightCircles(...args); },
      lightCirclesOf: async (...args) => { const { lightCirclesOf } = await import("./magic/placed-light-workflow.mjs"); return lightCirclesOf(...args); },
      // THE REACTION, AS THE SYSTEM SPENDS IT (3.669.1). `spendReaction(actor,
      // label, { traits })` resolves whether it was spent, Battle Readiness's
      // Attack-or-Martial rule included; `reactionRefusal(actor, traits)`
      // resolves why it could not be, or "", without spending. A module's
      // reaction feat should spend through these, not write the pool itself.
      spendReaction: async (...args) => { const { spendReaction } = await import("./combat/action-points-workflow.mjs"); return spendReaction(...args); },
      reactionRefusal: async (...args) => { const { reactionRefusal } = await import("./combat/action-points-workflow.mjs"); return reactionRefusal(...args); },
      // ASK THE REACTOR, WHEREVER THEY ARE (3.681.0; Block 3b): their player
      // if online, else the GM, 30 seconds, and the named reaction step run on
      // their client. Resolves `{ answer, result }`. See reactions/reaction-ask-workflow.mjs.
      askReactor: async (...args) => (await import("./reactions/reaction-ask-workflow.mjs")).askReactor(...args),
      // A SPELL CAST AS A REACTION (3.681.0), with the user's targets set to
      // these token ids for the length of the cast. Resolves what castSpell does.
      castAsReaction: async (...args) => (await import("./magic/save-reaction-spells-workflow.mjs")).castAsReaction(...args),
      // CAST A SPELL, WITH THE CORE'S OWN OPTIONS (3.682.0; Block 4): among
      // them `strikeCheck`, a Strike's TRGCheck whose roll is the casting check
      // (Thunderous Strike), and `apPaid`. Resolves what castSpell does.
      // 3.684.0 (G1): also `metamagic: { preset: [{ key, choice, times }] }`
      // (options applied without a tick: Subconscious Casting), and `thread: {
      // check, degree, primaryUuid }` — a spell woven into another, resolved
      // under that spell's check at its degree, paying nothing (Spellthread).
      castSpell: async (actor, spell, options = {}) => (await import("./magic/cast-workflow.mjs")).castSpell(actor, spell, options ?? {}),
      // WHAT METAMAGIC A CHARACTER HAS (3.684.0; Eldritch Arts Block 6, G1):
      // every owned or granted option, core and module, as `{ key, label,
      // ppCost, focus, needsSpell, source }` — gated on `spell` when one is
      // given, as the Warp? dialog gates. Piercing Insight lists it for Sense
      // Magic; Metamagic Resonance reads it. See magic/module-metamagic-workflow.mjs.
      metamagicCatalogue: async (actor, options = {}) => (await import("./magic/module-metamagic-workflow.mjs")).metamagicCatalogue(actor, options ?? {}),
      // WOULD A CAST BE REFUSED (3.681.0): the reason castSpell would give
      // before spending anything, or "". See magic/cast-workflow.mjs.
      castRefusal: async (...args) => (await import("./magic/cast-workflow.mjs")).castRefusalReason(...args),
      // THE TELEPORT, WHEN IT HAPPENS (3.685.1; Eldritch Arts 0.10.0's live
      // test). `teleportationArrives(caster, spell, movedActors)` is what a
      // Teleportation cast does at its cast: in combat, it stamps each moved
      // creature's `teleportedTurn` and posts its "Teleported — Spatial
      // Awareness" card, and resolves the lines for a second teleport this
      // turn (which fails). `teleportationFails(actor)` resolves whether a
      // teleport of this creature now would be that second one. For a spell
      // registered with `registerDeferredTeleport`.
      teleportationArrives: async (...args) => (await import("./trait-rules-workflow.mjs")).teleportationArrives(...args),
      teleportationFails: async (...args) => { const { teleportationFails } = await import("./trait-rules-workflow.mjs"); return teleportationFails(...args); },
      // CONVICTION, BY THE CORE'S RULE (3.681.0): `convictionState` resolves
      // `{ value, max, ok, reason }` (one point a round in combat);
      // `spendConviction` spends one and stamps the round, resolving whether it could.
      convictionState: async (actor) => (await import("./conviction.mjs")).getConvictionState(actor),
      spendConviction: async (actor) => {
        const { getConvictionState, markConvictionSpent } = await import("./conviction.mjs");
        if (!getConvictionState(actor).ok) return false;
        await markConvictionSpent(actor);
        return true;
      },
      // ELDRITCH ARTS BLOCK 5, GROUP B (3.683.0; seams C4, C5, C17).
      // THE AMBIENT LIGHT LEVEL AT A TOKEN (C4; Graham's Q61): 1–10, where it
      // stands — sources, Darkness, regions and weather — not raised by its
      // own Darkvision or Nightvision. A Token or TokenDocument; null with
      // none. Veil of Silence, Moonlight Precision, Shadow Initiate, Silent
      // Veil, Veilstride, Ghostscale. (Rolls read it through the
      // conditionals' `lightLevels` axis; this is for everything else.)
      lightLevelAt: async (token) => {
        const { ambientLightLevelAt } = await import("./light-workflow.mjs");
        return ambientLightLevelAt(token);
      },
      // IS THIS TOKEN UNDERWATER (C5): in a Region the core counts as water,
      // as the attack and cast workflows ask it. Tideweaver's Resilience.
      isUnderwater: async (token) => (await import("./combat/underwater-workflow.mjs")).tokenIsUnderwater(token),
      // FALLING FROM HEIGHT (C5): the core's own roll and card. With a
      // `distance` (feet, already the final distance) it is rolled with no
      // dialog; the declared reductions and Skyfeather still apply. `onto`
      // (an actor landed on) defaults to nobody; `note` is a card line.
      // Resolves what the core's rollFalling does. Voidborn Wings,
      // Stormrunner's Zeal, Voidborn Grace (whose flight ends: lower the
      // token, then call this).
      rollFalling: async (actor, { distance = null, onto = null, note = "" } = {}) => {
        const { rollFalling } = await import("./combat/falling-workflow.mjs");
        const given = distance !== null && distance !== undefined && Number.isFinite(Number(distance));
        return rollFalling(actor, { distance: given ? Math.max(0, Number(distance)) : 0, onto, note: String(note ?? ""), ask: !given });
      },
      // HOW FAR THIS CREATURE HAS MOVED THIS TURN (C17): `{ feet,
      // apOnMovement }` — the measured feet of its own moves (a teleport is
      // not one), and the AP its moves and Movement-trait actions cost. Reset
      // with its turn. See combat/movement.mjs `movementThisTurnFrom`.
      movementThisTurn: async (actor) => {
        const { movementThisTurn } = await import("./combat/movement-workflow.mjs");
        return movementThisTurn(actor);
      },
      // ELDRITCH ARTS BLOCK 6, GROUP D (3.684.0; G24, G25).
      // THE INNATE SAVE DC (G25; Graham's Q136): `innateSaveDCFor(actor, spell)`
      // resolves `{ value, printed, level, ability }` — 10 + magical ability +
      // the level an innate cast of that spell is made at (a registered innate
      // level bonus included: the bonded soul's +1), or its printed DC. Xithra
      // Cone's basic Reflex, Malevolent Blast's Will. See magic/innate-save-dc.mjs.
      innateSaveDCFor: async (actor, spell) => (await import("./magic/innate-save-dc.mjs")).innateSaveDCFor(actor, spell),
      // CAN THIS SPELL BE CAST TODAY (G25; Prepared Sigil's "a spell that you
      // are able to cast that day"): true when the core's availability says so
      // — prepared, memorised, in the repertoire, specialist, innate — and no
      // daily-study refusal stands. An item the actor does not own is false.
      // See magic/spell-availability.mjs `spellCastBlocked`.
      spellCastable: async (actor, spell) => {
        if (!actor || spell?.type !== "spell" || (spell.parent && spell.parent !== actor)) return false;
        const { spellCastBlocked } = await import("./magic/spell-availability.mjs");
        return spellCastBlocked(spell) === null;
      },
      // A SPELL SUSTAINED BY ANOTHER CREATURE (G24; Symbiotic Witch, Q137):
      // `setSpellSustainer(caster, entryId, { uuid, label } | null)` hands one
      // sustained active-spell entry to that creature (one spell a creature;
      // null hands it back). While it holds it: no Sustain is owed, the caster
      // may recover PP, damage to the SUSTAINER asks the caster's Spell
      // Concentration check, and its death ends the spell at the caster's next
      // turn start. Resolves the entry, or null. See magic/active-spells.mjs.
      // (A cast measured from another token is `castSpell(actor, spell,
      // { rangeFrom: <token uuid> })`; a Prepared Sigil's is `castSpell(actor,
      // spell, { preparedSymbol: { label } })`.)
      setSpellSustainer: async (caster, entryId, sustainer = null) => (await import("./magic/active-spells.mjs")).setSpellSustainer(caster, entryId, sustainer),
      activeToken: async (...args) => (await import("./combat/geometry.mjs")).activeToken(...args),
      distanceBetween: async (...args) => (await import("./combat/geometry.mjs")).distanceBetween(...args),
      // ELDRITCH ARTS BLOCK 6, GROUP B (3.684.0; G16): A SPELL STORE.
      // `storeForeignSpell(actor, spell, { ppPaid, mods, notes, releaseCost,
      // host, from: { name, uuid } })` — Runebreaker's absorb (Q115): the
      // incoming spell is copied onto the storer (flagged `storedForeign`, cast
      // only by its release), stored "at the PP its caster paid", and released
      // through the core's Release as the storer's own casting, settling no PP.
      // `host` is the item to hold it (`spellStoreHost`), else the bond.
      // `spellStoreHost(actor, { host: "arcaneBond"|"spell"|"spellStore",
      // spellId })` — the item a store lives in (Storing Rune's own rune is
      // `host: "spell"` with its id). `readStoredSpell(actor)` — `{ item,
      // record }` of the store held, or null.
      storeForeignSpell: async (...args) => (await import("./magic/spell-storing-workflow.mjs")).storeForeignSpell(...args),
      spellStoreHost: async (actor, opts = {}) => (await import("./magic/spell-storing-workflow.mjs")).spellStoreHostFor(actor, opts),
      readStoredSpell: async (actor) => (await import("./magic/spell-storing-workflow.mjs")).readStored(actor),
      // THE CONTROL REGISTER (3.686.0, H12; Eldritch Arts' Bindings, Army of
      // the Grave, Versatile Binder, Ley Line Effects 25–27). Page 242's
      // register, as Aligned Control uses it: `recordControlled(controller,
      // { target, token, level, name, source, castId, data })` — `source` a
      // key of CONTROL_SOURCES ("bound" for a creature a spell binds), `castId`
      // the cast that holds it, `data` the module's own facts; `releaseControlled
      // (controller, id, { reason })`; `controlledOf(controller)` the entries;
      // `controlledCreature(entry)` the creature an entry names, or null. Every
      // release fires `trgPrimeControlReleased({ controller, entry, creature,
      // degree, reason })` — "overflow" when the DC 20 Will save freed it.
      recordControlled: async (...args) => (await import("./magic/control-register-workflow.mjs")).recordControlled(...args),
      releaseControlled: async (...args) => (await import("./magic/control-register-workflow.mjs")).releaseControlled(...args),
      controlledOf: async (actor) => (await import("./magic/control-register-workflow.mjs")).controlledOf(actor),
      // A STORM A MODULE RAISES (3.687.0, H16; Eldritch Arts' Storm of
      // Unmaking fumble, "storm appears above you and follows you wherever you
      // go"): `placeStorm(actor, row, { centre, radiusFeet, follow, dc, castId,
      // seconds, spellName, baseDamage })` — a circle of a `storm` row, struck
      // at once, then at the start of each of the caster's turns while its own
      // clock runs. Answers `{ regionId, lines }`.
      placeStorm: async (...args) => (await import("./magic/storm-workflow.mjs")).placeStorm(...args),
      controlledCreature: async (entry) => { const { controlledCreature } = await import("./magic/control-register-workflow.mjs"); return controlledCreature(entry); },
      // CONDITIONS HELD BY A CURSE (3.686.0, H17): is this condition held on
      // this creature (an effect carrying `flags.trg-prime.heldConditions`)?
      // See conditions/held-conditions.mjs for the flag a module lays.
      conditionHeld: async (actor, key) => (await import("./conditions/held-conditions.mjs")).actorConditionHeld(actor, key),
      // A TABLE ROLLED AT EACH OF A CREATURE'S TURNS (3.686.0, H18):
      // `markTurnTable(target, row | "insanity", { margin, per, dc, castId,
      // casterUuid, spellName, img })` — core Insanity's d10 for a creature
      // that failed its save by `margin` (Eldritch Arts' Symbol of Insanity:
      // "targeted with an Insanity spell using this symbol's Spell Save DC").
      // Resolves `{ marked, rounds, line }`, or null for a malformed row.
      markTurnTable: async (...args) => (await import("./magic/turn-table-workflow.mjs")).markTurnTable(...args)
    }),
    contentPack,
    contentPacksFor,
    isFederated,
    registry: moduleRegistry,
    problems: registrationProblems
  });
}

/**
 * The books that shipped before the module API (3.628.0): their packs join
 * the logical packs they hold, as if their manifests said `extends`, while
 * the module is active. See sourcebooks.mjs KNOWN_SOURCEBOOKS — Fiends &
 * Fables' races, heritages, abilities and feats. A pack that declares its
 * own `extends` is left to declare it.
 */
function registerKnownSourcebookPacks(modules = globalThis.game?.modules) {
  for (const moduleId of Object.keys(KNOWN_SOURCEBOOKS)) {
    const mod = modules?.get?.(moduleId);
    if (!mod?.active) continue;
    // READ FROM THE MANIFEST, NOT game.packs (3.628.1). This runs at init,
    // and Foundry builds `game.packs` only after init: 3.628.0 asked it for
    // each pack, got nothing, and registered none — found live, 7 Oct 2026.
    // The module's own pack list is there from the start.
    const declared = new Map(Array.from(mod.packs ?? []).map((p) => [`${moduleId}.${p.name}`, p]));
    for (const { collectionId, logical } of knownExtenderPacks(moduleId)) {
      const entry = declared.get(collectionId);
      if (!entry || entry.flags?.["trg-prime"]?.extends) continue;
      registerPack(collectionId, logical, moduleId);
    }
  }
}

/**
 * The Sourcebook menu's names, live (3.628.0): a module's registered title,
 * else its manifest's `flags.trg-prime.sourcebook`, else the known table,
 * else its own title. See sourcebooks.mjs `sourcebookTitle`.
 *
 * @returns {(packageName: string) => string}
 */
export function sourcebookResolver(modules = globalThis.game?.modules) {
  const cache = new Map();
  return (packageName) => {
    const id = String(packageName ?? "");
    if (!cache.has(id)) {
      const mod = modules?.get?.(id);
      cache.set(id, sourcebookTitle(id, {
        registered: registeredSourcebook(id),
        manifestFlag: mod?.flags?.["trg-prime"]?.sourcebook,
        moduleTitle: mod?.title
      }));
    }
    return cache.get(id);
  };
}

/** Fire the registration hook. Called from the system's init, once. */
export function fireRegistrationHook(api) {
  registerKnownSourcebookPacks();
  Hooks.callAll(HOOK_NAME, api);
}

/**
 * Push queued entries into the live tables. Safe to call more than once.
 *
 * @returns {{languages: number, skillActions: number, featAutomation: number, classSkillGrants: number}}
 */
export function flushModuleRegistrations() {
  const counts = { languages: 0, skillActions: 0, featAutomation: 0, classSkillGrants: 0 };

  for (const [name, spec] of Object.entries(registeredLanguages())) {
    if (flushed.languages.has(name)) continue;
    flushed.languages.add(name);
    if (addLanguage(name, spec)) counts.languages += 1;
  }

  const pendingActions = queuedSkillActions().filter((a) => !flushed.skillActions.has(a.key));
  if (pendingActions.length) {
    const { added, skipped } = addSkillActions(pendingActions);
    for (const key of [...added, ...skipped]) flushed.skillActions.add(key);
    counts.skillActions += added.length;
    for (const key of skipped) {
      console.warn(`TRG Prime | module skill action "${key}" clashes with a core action and was not added.`);
    }
  }

  for (const [key, entry] of queuedFeatAutomation()) {
    if (flushed.featAutomation.has(key)) continue;
    flushed.featAutomation.add(key);
    if (key in FEAT_AUTOMATION) {
      console.warn(`TRG Prime | module feat automation "${key}" clashes with a core entry and was not added.`);
      continue;
    }
    FEAT_AUTOMATION[key] = { hint: entry.hint, use: entry.use, module: true, ...(entry.ownsFocusUse === true ? { ownsFocusUse: true } : {}) };
    counts.featAutomation += 1;
  }

  for (const entry of queuedClassSkillGrants()) {
    if (flushed.classSkillGrants.has(entry.flag)) continue;
    flushed.classSkillGrants.add(entry.flag);
    if (CLASS_SKILL_GRANTS.some((g) => g.flag === entry.flag || g.name === entry.name)) {
      console.warn(`TRG Prime | module class-skill grant "${entry.name}" clashes with a core entry and was not added.`);
      continue;
    }
    CLASS_SKILL_GRANTS.push(entry);
    counts.classSkillGrants += 1;
  }

  return counts;
}

/** The ready-time report: who contributed, and what went wrong. */
export function reportModuleRegistrations(counts) {
  const contributors = registryContributors();
  if (contributors.length) {
    console.info(`TRG Prime | companion content from: ${contributors.join(", ")} — `
      + `${counts.languages} language(s), ${counts.skillActions} skill action(s), `
      + `${counts.featAutomation} feat automation(s), ${counts.classSkillGrants} class-skill grant(s).`);
  }
  for (const problem of registrationProblems()) {
    console.warn(`TRG Prime | module registration: ${problem}`);
  }
}
