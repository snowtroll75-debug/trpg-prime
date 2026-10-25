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
import { contentPack, contentPacksFor, isFederated } from "./content-packs.mjs";
import { addLanguage } from "./languages.mjs";
import { addSkillActions } from "./data/skill-actions.mjs";
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
      get skillActions() { return SKILL_ACTIONS; },
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
      activeToken: async (...args) => (await import("./combat/geometry.mjs")).activeToken(...args),
      distanceBetween: async (...args) => (await import("./combat/geometry.mjs")).distanceBetween(...args)
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
