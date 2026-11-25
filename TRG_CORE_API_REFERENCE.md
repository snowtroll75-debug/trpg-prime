# TRG Prime Core — Automation API Reference (3.697.0)

17 November 2026. The supported surface a sourcebook module uses to extend the core rules engine without patching it. Generated from `module/module-api.mjs`, `module/module-api-workflow.mjs` and the `Hooks.callAll` sites in the source, so it lists what exists rather than what was intended.

## Contract

- **Entry point.** `game.trgPrime.modules`, built by `buildModuleApi()` in the system's `init`.
- **When to register.** Inside `Hooks.on("trgPrime.registerContent", (api) => …)` at load time. Or call `game.trgPrime.modules.register*` from your own `init` or `setup`, as long as it is before `ready`.
- **The flush.** At `ready` the core flushes registrations into its live tables (languages, skill actions, `FEAT_AUTOMATION`, class-skill grants). Anything registered later needs `game.trgPrime.modules.flush()`.
- **Pack federation.** Declare `flags["trg-prime"].extends: "<logical pack>"` on a pack in your manifest, or call `registerPack(collectionId, logicalName)`. Every chooser and grant that reads, for example, `"feats"` then also reads your pack.
- **No dependency the other way.** The core never imports a module. A module that registers nothing is invisible; a failing registration is a console warning, not an error.
- **Stability.** Every function below is covered by the core harness (`verify-module-api*`, `verify-control-register-api` and the per-feature files) and by the companion modules' own suites, which `tools/regression-suite.mjs` runs against every core change.

## Registration functions

`register*` adds to a registry; the matching `registered*` reads it back (for tooling and tests).

| Function | Arguments | What it does |
|---|---|---|
| `registerPack` | `collectionId, logicalName, moduleId = null` | Declare that a module's compendium extends one of the system's logical packs, so every chooser and grant that reads "feats" also reads it. |
| `registerSourcebook` | `packageName, title, moduleId = null` | Name the sourcebook a module's content belongs to (3.628.0), for the pickers' Sourcebook menu. |
| `registerClass` | `name, spec = {}, moduleId = null` | @param {string} name The class item's name, as printed. |
| `registerArchetype` | `name, spec = {}, moduleId = null` | @param {string} name The archetype feat's name, as printed. |
| `registerFeatAccess` | `kind, ownerName, featNames, moduleId = null` | Open named feats to a race or a class that the feats' own tags do not name. |
| `registerFeatGate` | `trait, featNames, moduleId = null` | A trait that only some characters may take feats from. |
| `registerExclusiveFeats` | `group, featNames, moduleId = null` | Feats of which a character may own one. |
| `registerSkillSubstitution` | `featName, entries, moduleId = null` | "Use Perform instead of Religion for Perform Last Rites" — the same shape SKILL_SUBSTITUTION_FEATS holds: one entry or a list of `{ action, skill, modifier? }`, keyed by the feat's name. |
| `registerDegreeUpgrades` | `featName, entries, moduleId = null` | "Treat a Partial as a Success" — the Shadowborn Agility shape (`{ actionKey, from, to }`), keyed by the feat that grants it. |
| `registerSpellWarps` | `featName, entries, moduleId = null` | A warping option a feat grants (3.625.0). |
| `registerLightSources` | `entries, moduleId = null, coreKeys = []` | A light a module's content sheds, in the LIGHT_SOURCES shape, so the illumination ladder, the token's glow and the GM relay all read it as they read a torch. |
| `registerCreateRoute` | `raw, moduleId = null, { addSkill = null } = {}` | A ROAD TO CREATE THROUGH ANOTHER SKILL (3.673.0, C8). |
| `registerItemAutomation` | `name, spec, moduleId = null` | What a wondrous item's `{ kind: "use", automation }` ability runs (3.626.0): the same `{ hint, use(actor, item) }` shape as a feat automation, keyed by the name the item's data gives. |
| `registerPerilAutomation` | `name, spec, moduleId = null` | What a peril's Trigger, or a peril's routine action, runs in place of the generic save-and-apply (3.629.0): `trigger(peril, {spec, helpers})` and/or `use(peril, item, {spec, helpers})`, each returning card lines. |
| `registerFeatPickBonus` | `key, picks, moduleId = null` | Extra feat picks a module grants (3.630.0): `picks(actor)` returns `{ label, racial?, class?, general?, archetype? }` or null, and is asked every time the sheet draws its feat banner, so a world setting it reads takes ef |
| `registerDamageShare` | `key, share, moduleId = null` | A module's share of incoming HP damage (3.630.0): `share(actor, amount, ctx)` is asked, after temporary HP and Sacrificing Shield and before the dying machinery, and returns `{ taken }` — the part it moved elsewhere. |
| `registerSpellCheckGate` | `key, gate, moduleId = null` | A module's answer to a casting before its check is rolled (3.672.0; Block 8's C5): `gate(ctx)` is awaited with `{ actor, spell, spellData, innate, itemCast, attack, rollsCheck }` and may return `{ modifiers, lines }` — r |
| `registerCastSurcharge` | `key, surcharge, moduleId = null` | EXTRA PP A CASTING MUST PAY (3.675.0; Eldritch Arts Block 1, C3). |
| `registerReleasePath` | `key, path, moduleId = null` | ANOTHER WAY TO READ A SCROLL (3.675.0, C6). |
| `registerCastRefusal` | `key, refuse, moduleId = null` | A CASTING REFUSED (3.678.0; Eldritch Arts Block 2, D7). |
| `registerDeferredTeleport` | `key, defers, moduleId = null` | A TELEPORT THAT HAPPENS LATER THAN THE CAST (3.685.1; Eldritch Arts 0.10.0's live test, finding 1). |
| `registerCastDegreeRemap` | `key, remap, moduleId = null` | THE CASTING'S DEGREE READ DIFFERENTLY (3.678.0, D7). |
| `registerResonanceSuppressor` | `key, suppress, moduleId = null` | NO RESONANCE EVENT HERE (3.678.0, D6). |
| `registerEffectSuppressor` | `key, suppressed, moduleId = null` | AN EFFECT SWITCHED OFF WHILE A MODULE SAYS SO (3.678.0, D14). |
| `registerHighMagicRules` | `moduleId` | WHOSE HIGH MAGIC RULES (3.678.0, D1b). |
| `registerRitualRules` | `key, spec, moduleId = null` | A RITUAL'S RULES FROM A SOURCEBOOK (3.679.0; Eldritch Arts Block 2b, D13). |
| `registerCastOption` | `key, spec, moduleId = null` | A CASTING OPTION A MODULE OFFERS (3.679.0; Eldritch Arts Block 2b). |
| `registerCastItemOption` | `key, spec, moduleId = null` | AN ITEM A MODULE OFFERS AT THE CAST (3.688.0; Eldritch Arts Block 9a, H19 — the audit's D3; Graham's Q186–Q192). |
| `registerDispelModifier` | `key, spec, moduleId = null` | A DISPEL MODIFIER (3.683.0; Eldritch Arts Block 5, D10, seam C9; Graham's Q63, Q67, Q84, Q85, Q88). |
| `registerCastCapModifier` | `key, raise, moduleId = null` | A RAISE OF THE PP CAP PER CAST (3.680.0; Eldritch Arts Block 3a, D5). |
| `registerSpecialistAccess` | `key, allows, moduleId = null` | A SPECIALIST SPELL OPENED TO A CHARACTER (3.680.0, Block 3a). |
| `registerFamiliarModifier` | `key, modify, moduleId = null` | A FAMILIAR'S MODIFIER (3.680.0, Block 3a, D8). |
| `registerPPGrant` | `name, spec = {}, moduleId = null` | A POWER POINT GRANT BY FEATURE NAME (3.680.0, Block 3a). |
| `registerCheckReaction` | `key, spec = {}, moduleId = null` | A CHECK REACTION (3.681.0, Block 3b). |
| `registerDamageReaction` | `key, offer, moduleId = null` | A DAMAGE REACTION (3.681.0, Block 3b). |
| `registerCastReaction` | `key, offer, moduleId = null` | A CAST REACTION (3.681.0, Block 3b). |
| `registerCriticalReaction` | `key, offer, moduleId = null` | A CRITICAL REACTION (3.681.0, Block 3b). |
| `registerInnateLevelBonus` | `key, bonus, moduleId = null` | AN INNATE LEVEL BONUS (3.682.0; Eldritch Arts Block 4, D9). |
| `registerCastPrelude` | `key, prelude, moduleId = null` | A CAST'S PRELUDE (3.682.0; Eldritch Arts Block 4). |
| `registerDyingRecoveryModifier` | `key, modify, moduleId = null` | A DYING RECOVERY MODIFIER (3.683.0; Eldritch Arts Block 5, C8). |
| `registerFumbleModifier` | `key, modify, moduleId = null` | A FUMBLE MODIFIER (3.684.0; Eldritch Arts Block 6, G5, the audit's D6). |
| `registerResonanceModifier` | `key, spec, moduleId = null` | A RESONANCE MODIFIER (3.684.0; Eldritch Arts Block 6, G5). |
| `registerChargedItemRule` | `key, spec, moduleId = null` | A CHARGED-ITEM RULE (3.684.0; Eldritch Arts Block 6, G6 — the audit's D12, its feat half). |
| `registerChargedKind` | `key, spec, moduleId = null` | A KIND OF CHARGED ITEM (3.690.0; Eldritch Arts Block 9c, H23 — the Orb). |
| `registerOneInvestedTraits` | `traits, moduleId = null` | ONE INVESTED ITEM PER TRAIT (3.690.0; Eldritch Arts Block 9c, H25). |
| `registerInvestCost` | `key, fn, moduleId = null` | AN ITEM'S INVESTMENT COST, AND A MODULE'S REFUSAL (3.693.0; Eldritch Arts Block 10, H27). |
| `registerPendingCastStep` | `key, step, moduleId = null` | A STEP BEFORE A PENDING CAST'S INTERRUPTION SETTLES (3.684.0; Eldritch Arts Block 6, G26, optional). |
| `registerUnconsciousOffer` | `key, spec, moduleId = null` | "WHEN YOU WOULD FALL UNCONSCIOUS" (3.684.0; Eldritch Arts Block 6, G7). |
| `registerFeatEligibility` | `featName, check, moduleId = null` | A FEAT'S ELIGIBILITY, WHERE THE PREREQUISITE LINE CANNOT SAY IT (3.684.0; Eldritch Arts Block 6, G9). |
| `registerExtraUses` | `featName, spec = {}, moduleId = null` | EXTRA DAILY USES, DECLARED (3.684.0; Eldritch Arts Block 6, G21). |
| `registerReactionStep` | `name, run, moduleId = null` | A REACTION'S OWN WORK, ON THE REACTOR'S CLIENT (3.681.0, Block 3b). |
| `registerWeaponTraitRule` | `trait, spec, moduleId = null` | A WEAPON TRAIT THAT CHANGES THE CATEGORY FOR A CLASS TYPE (3.675.0, C8). |
| `registerMetamagic` | `key, spec, moduleId = null` | A MODULE'S METAMAGIC (3.684.0; Eldritch Arts Block 6, G1 — the audit's D2, Appendix D's S-M1, S-M3, S-M4 and S-M11; Graham's Q93–Q96, Q126, as proposed). |
| `registerCastPPSource` | `key, spec, moduleId = null` | ANOTHER WAY TO PAY A CAST'S PP (3.684.0; Eldritch Arts Block 6, G2 — the rod draw generalised, Appendix A's S-8; Bloodmage's "Bleed in place of PP"). |
| `registerMetamagicPayment` | `key, spec, moduleId = null` | A METAMAGIC OPTION PAID IN AP (3.684.0; Eldritch Arts Block 6, G3 — Appendix D's S-M2, Appendix F's n7; Metamagic Adept: "by expending an additional AP instead of increasing PP cost … the DC to cast the spell is still in |
| `registerCastCostModifier` | `key, modify, moduleId = null` | PP OFF WHAT A CAST PAYS (3.684.0; Eldritch Arts Block 6, G4 — D5's discount half; Graham's Q93: "Payment only. |
| `registerLanguage` | `name, { rarity = "uncommon", speakers = "" } = {}, moduleId = null` |  |
| `registerTraits` | `names, moduleId = null` |  |
| `registerRacialPP` | `name, perLevel, moduleId = null` |  |
| `registerHeritageRaceGrant` | `featName, races, moduleId = null` |  |
| `registerRunes` | `runes, moduleId = null` |  |
| `registerCompanionKind` | `raw, moduleId = null` |  |
| `registerMaterial` | `key, spec, moduleId = null` |  |
| `registerInvestPrepare` | `key, fn, moduleId = null` |  |
| `registerInvestRefusal` | `key, fn, moduleId = null` |  |

Also on `game.trgPrime.modules`, defined in `module-api-workflow.mjs` because they push into live tables: `registerClassSkillGrant`, `registerDefenceOffer`, `registerFeatAutomation`, `registerPassiveAutomation`, `registerSkillActions`. Plus `flush()`, `registry` and `problems`.

## Helpers (`game.trgPrime.modules.helpers`)

The core's own workflows, handed to modules so they act through the same code paths as core content (damage, conditions, checks, casting, light, timers). The signatures are in the source (`module/module-api-workflow.mjs`, `buildModuleApi`).

`activeRunesOn`, `activeToken`, `addPendingModifier`, `addRecurringDamage`, `applyConditionTags`, `applyConditionTagsTo`, `applyTypedDamage`, `armHold`, `armMove`, `askReactor`, `basicSaveHit`, `basicSaveSeverity`, `castAsReaction`, `castInnateOnce`, `castRefusal`, `castSpell`, `chargedItemLevelOf`, `clearHeldSpells`, `companionsOf`, `conditionHeld`, `contentPack`, `contentPacksFor`, `controlledCreature`, `controlledOf`, `convictionState`, `countsAsUnarmed`, `createCompanionFor`, `createEffectsOn`, `createFamiliarFor`, `deductGold`, `describeDamage`, `distanceBetween`, `endSpellOf`, `familiarsOf`, `formatAppliedTags`, `goldOf`, `grantTempHP`, `grantTemporaryImmunity`, `healActor`, `heldSpellsIn`, `heldStrikeDue`, `holdSoulDrain`, `innateSaveDCFor`, `investRefusal`, `isDead`, `isFederated`, `isUnderwater`, `itemUsesMax`, `itemUsesRemaining`, `keepsSpellbook`, `landHeldStrike`, `learnSpellDC`, `learnSpellOutcome`, `learnSpellTerms`, `levelDC`, `lightCirclesOf`, `lightLevelAt`, `mapPenalty`, `markTurnTable`, `metamagicCatalogue`, `moveLightCircles`, `movementThisTurn`, `placeLightCircles`, `placeStorm`, `reactionRefusal`, `readStoredSpell`, `recordControlled`, `recordTraitUsage`, `refreshTokenLight`, `regionContains`, `releaseControlled`, `releaseHeldSpell`, `releaseItemSpell`, `releaseSoulDrain`, `removeLightCircles`, `resolveAction`, `resolveBasicActionAtTotal`, `rodUseRefusal`, `rollAfflictionSave`, `rollCheck`, `rollCriticalInjury`, `rollExhaustionCheck`, `rollFalling`, `rollItemDepletion`, `rollResonanceEvent`, `rollWeaponAttack`, `rollWeaponDamage`, `runAreaEffect`, `runStrikeSeries`, `runeFrequencyAllows`, `runeMarkersOf`, `runeUseUpdates`, `runesFor`, `runesToField`, `setSpellSustainer`, `sheathedWeapons`, `spellCastable`, `spellDamagePerDieBonus`, `spellStoreHost`, `spendConviction`, `spendFromRod`, `spendReaction`, `startItemTimer`, `stopItemTimer`, `storeForeignSpell`, `teleportationArrives`, `teleportationFails`, `temporaryImmunityRefusal`, `traitCheck`, `traitGate`, `unarmedAbilityWeapon`

## Hooks the core fires

Listen with `Hooks.on(name, payload => …)`. Each is fired with `Hooks.callAll`, so it cannot be cancelled. Where a module needs to **change** an outcome, use the matching `register*Reaction` instead.

| Hook | Call sites |
|---|---|
| `trgPrimeActionAttempt` | 1 |
| `trgPrimeActionResolved` | 1 |
| `trgPrimeAmbushDealt` | 1 |
| `trgPrimeCheckResolved` | 1 |
| `trgPrimeCreatureSlain` | 1 |
| `trgPrimeCriticalInjury` | 1 |
| `trgPrimeDailyPreparation` | 1 |
| `trgPrimeDamageApplied` | 1 |
| `trgPrimeDeathGuardHeld` | 3 |
| `trgPrimeInitiativeRolled` | 1 |
| `trgPrimeOverheal` | 1 |
| `trgPrimeReleaseRolled` | 1 |
| `trgPrimeSecondaryDamage` | 1 |
| `trgPrimeSpellCast` | 1 |
| `trgPrimeSpellHealed` | 1 |
| `trgPrimeSpellHeld` | 1 |
| `trgPrimeSpellRiderLanded` | 1 |
| `trgPrimeSpellSettled` | 1 |
| `trgPrimeSpellSustained` | 2 |
| `trgPrimeStrikeResolved` | 1 |
| `trgPrimeStrikeRolled` | 1 |
| `trgPrimeTurnEnded` | 1 |
| `trgPrimeWeaponFumble` | 1 |

## Added in 3.713.0

| Function | Arguments | What it does |
|---|---|---|
| `registerWeaponEnhancement` | `key, fn, moduleId = null` | One weapon's temporary enhancement (Eldritch Arts 0.18.0, C-EA11-1): `fn(weapon, actor)` → `{ label, attack, attackType, damage, damageType, packets, reloadReduction }` or null. See `module/weapon-enhancements.mjs`. |
| `registerCraftingWorkModifier` | `key, fn, moduleId = null` | A Create project's time (C-EA11-2): `fn({ actor, featNames, project, ranks })` → `{ label, ranks, valueFactor }` or null. Time only; never the check, the DC or the cost. |

## Added in 3.697.0

No module-facing function changed. Additions inside the core that a module may rely on:

- **Markers** `longArm` and `innerFocus` (`magic/markers.mjs`), usable in any spell row `{kind: "marker", marker: …}`.
- **`familiarSpellAdders(familiars, {distanceTo})`** (`magic/spell-adder.mjs`): any familiar carrying an ability named Spell Battery is a +1 Spell Adder within 30 ft. A sourcebook familiar ability of that name is counted automatically.
- **`familiarSpeedEntries(abilityNames, movement)`** (`familiar-derive.mjs`): Fast Movement on any familiar, core or module.
