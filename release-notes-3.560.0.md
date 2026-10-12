# TRG Prime 3.560.0 — the companion-module API

16 September 2026. The first Pillars of Faith build forced a question the system had never had to answer: how does a sourcebook shipped as a Foundry module get its races into the race picker, its feats into the grant path, its languages into the language chooser? Until this release the answer was that it did not. Every chooser, grant and lookup read one compendium by literal id — `game.packs.get("trg-prime.spells")`, in some sixty places — and every name-keyed rule table (racial Power Points, class proficiency, archetype grants, the language catalogue, the trait vocabulary, the skill-action array, the skill-substitution table) was a frozen constant in system source.

Graham chose the system-side answer over a module that patches internals at runtime, so this release is that answer. No rule changes for an existing character; nothing a core world does differently.

## Pack federation

`module/content-packs.mjs`. `contentPack("spells")` replaces every literal pack read. It returns a federated pack — the same `getIndex`, `getDocument`, `getDocuments` and `index` the call sites already used — that reads the **system pack first** and then every module pack that extends it. A module pack extends a logical pack with one line in its manifest, no code:

```json
"flags": { "trg-prime": { "extends": "spells" } }
```

or at runtime through `game.trgPrime.modules.registerPack(id, "spells")`. System first means a core entry always wins a name match; a module cannot shadow core content, by accident or on purpose. The compendium refresh indexes extenders as well, and the prerequisite name set the feat picker gates on now includes a module's feats and abilities.

The refactor was mechanical and is verified by grep (`verify-module-api` C5): no file under `module/` reads a system pack by literal id any more.

## The registry

`module/module-api.mjs` (pure) and `module/module-api-workflow.mjs` (Foundry). The system fires `Hooks.callAll("trgPrime.registerContent", api)` from its own `init`, after `game.trgPrime` exists and after every module's script has loaded, so a module registers inside that hook. Registrations are additive and name-keyed; a core name already present wins and the clash is reported, never silently ignored.

What can be registered, and which consumer reads it:

| registration | read by |
|---|---|
| `registerPack` | content-packs (federation) |
| `registerLanguage` | languages.mjs `addLanguage` (the catalogue is no longer frozen; a core name is never overwritten) |
| `registerTraits` | defences.mjs trait vocabulary (immunity/resistance parsing) |
| `registerRacialPP` | racial-pp.mjs `racialPPDue`, after both core tables |
| `registerClass` | proficiency-rules `classProficiencyEntry`, starting-wealth `classWealth`, config `classNeedsDivineAspect` / `classNeedsWizardSchool`, picker-filters class-feat gating |
| `registerArchetype` | feats.mjs `effectiveClasses` / `effectiveTiers`, picker-filters archetype gating |
| `registerHeritageRaceGrant` | feats.mjs `effectiveRaces` |
| `registerSkillSubstitution` | feats.mjs `substituteSkillActions` |
| `registerSkillActions` | data/skill-actions `addSkillActions` (the array is no longer frozen; its entries still are; a core key is never replaced) |
| `registerFeatAutomation` | feats-workflow `FEAT_AUTOMATION` (flushed at `ready`; a core key is never replaced) |
| `registerPassiveAutomation` | feats-workflow hint and Use-card lookups |
| `registerClassSkillGrant` | class-skills `CLASS_SKILL_GRANTS` |

`game.trgPrime.modules.helpers` hands a module the same card, chooser, effect-replacement, pending-modifier, use-maths, level-DC and condition helpers a core automation uses, so a module's Use handler looks and behaves like a core one. `useBackground` is among them: a module heritage carrying a `specialistChoice` flag gets the same "name your Lore" chooser a core background does.

One console line at `ready` names every contributing module and what it added; every registration problem is a console warning.

## Race `grantedSpells`

A race may now grant a spell outright — `system.grantedSpells`, in `GRANT_FIELDS.race`, on the race sheet — with the same innate/Focus treatment a heritage's grant gets when the race carries `grantInnate`. Pillars of Faith's Kethrani ("gain Read Aura as a divinity innate cantrip with the Focus trait", on the race itself) is the first. Additive to `template.json`; every existing race reads as blank.

## Harness

`verify-module-api.mjs` — 82 checks. Section A drives the federation against a fake `game.packs` of four collections (system, flagged extender, runtime-registered extender, unrelated) through every member a call site uses. Section B drives every register function, its refusals, and the read-side helper each consumer calls. Section C is structural and marked as such: the entry script builds the API, fires the hook as live code, flushes at ready, and each consumer file consults the registry.

`mutate-module-api.mjs` — 12 mutations, all caught: the federation dropping the system pack, sweeping in strangers, ignoring a runtime registration, fetching only from the system; a system pack re-registered; racial PP, archetype grants, skill substitutions and Divine Aspect classes each ignoring the registry; a core language overwritten; a core skill action replaced; the hook never fired. The last of those survived the first run — the structural check accepted a commented-out call — and the check was tightened to live code before this shipped.

Full sweep green. `npm run verify`: 309 of 309 — names, callers (backlog 585, unchanged; `FEAT_AUTOMATION` acquired a real caller), checks-can-fail, and every per-rule verify on disk with its mutation file. Two existing mutation anchors (`mutate-proficiency` C1, `mutate-racial-pp` "unknown name") sat on lines this release lengthened by one operand and were repointed; both batteries still catch all their mutations.

## What this does not do

It does not make the system aware of a module's **actors** (bestiary packs are browsed through Foundry's own UI, as before). It does not let a module add a spell **effect kind**; `HANDLED_EFFECT_KINDS` stays frozen and the switch stays in the applier, so a module's spells must use the 54 kinds that exist. It does not add Chapter 4-style skill actions with bespoke dispatch branches; a registered action gets the generic roll-and-ladder path, which is what most of Pillars of Faith's need.
