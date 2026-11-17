# TRG Prime Core 3.697.0 — Module Compatibility

17 November 2026. How each companion module fares on the 3.697.0 core: its own checks, run by `tools/regression-suite.mjs` against the working core (`TRG_PRIME_ROOT`), and before and after this release.

## Versions tested

| Module | Repository | Installed in Graham's Foundry | Tested |
|---|---|---|---|
| Pillars of Faith | `trg-pillars-of-faith` `main` (cd04d73) | 0.12.5 | 0.12.5, byte-identical to the install |
| Inner Tempest | `trg-inner-tempest` `main` (3c409d9) | **1.0.5** | 1.0.4: code identical to the installed 1.0.5; only `module.json` differs (see U9) |
| Eldritch Arts | `trg-eldritch-arts` `incoming/trg-eldritch-arts-0.17.2.zip` | 0.17.2 | 0.17.2 |
| Fiends & Fables Prime | not in this session's reach | 0.45.2 | **not tested**: no checkout available |
| Prime Codex, Vhalendar | not in this session's reach | 0.1.5, — | **not tested** |

## Results

| Module | Checks | 3.696.3 (baseline) | 3.697.0 | Change |
|---|---|---|---|---|
| Pillars of Faith | 11 verify files (no mutate files) | 11 pass | 11 pass | none |
| Inner Tempest | 11 verify + 11 mutate | 19 pass, 3 fail | 19 pass, 1 fail, 2 blocked | the same three; now classed correctly |
| Eldritch Arts | 29 verify + 28 mutate | 53 pass, 4 fail | 55 pass, 1 fail, 1 blocked | **verify-block10 and mutate-block10 now run**: the suite feeds them a core spell dump |

**No module check changed from pass to fail on the 3.697.0 core.**

### The remaining non-passes: all present on 3.696.3, none caused by the core

- **Inner Tempest `verify-block5` and `mutate-block5`: BLOCKED.** They read `book/it12.md`, the Inner Tempest book text, which is not in the repository.
- **Inner Tempest `mutate-block8`: 1 of 66 mutations survives.** It duplicates Root's +2 Trip row, expecting a total of +4. The core's stacking rule (one circumstance bonus of a type) gives +2 regardless. The core is right, and the test can no longer tell the difference. **Module-side fix:** assert the number of rows, not only the total.
- **Eldritch Arts `mutate-block10b`: 2 of 25 mutations survive.** Both move a page boundary in the book-extraction script ("the planes page stops short", "the sentient page runs into the tables"). Catching them needs the v1.6 book source, so this is effectively blocked on the same input as the next item.
- **Eldritch Arts `mutate-book-extract`: BLOCKED.** It needs `EA_BOOK_MD`, the v1.6 source.

## What each module relies on, and whether 3.697.0 touched it

| Module | Core surface it registers against (from its source) | Touched by 3.697.0? |
|---|---|---|
| Pillars of Faith | registerClass, registerArchetype, registerFeatAutomation, registerPassiveAutomation, registerSkillActions, registerCheckReaction, registerCriticalReaction, registerDamageShare, registerDegreeUpgrades, registerEffectSuppressor, registerLightSources, registerRunes, registerSpellWarps, registerItemAutomation, registerPerilAutomation, registerFeatAccess, registerFeatGate, registerExclusiveFeats, registerFeatPickBonus, registerLanguage, registerRacialPP, registerTraits, registerReactionStep, registerSkillSubstitution, registerClassSkillGrant, helpers, contentPack | No |
| Inner Tempest | registerClass, registerArchetype, registerCompanionKind, registerCreateRoute, registerDefenceOffer, registerSpellCheckGate, registerFeatAutomation, registerPassiveAutomation, registerSkillActions, registerRunes, registerLightSources, … ; helpers companionsOf, createCompanionFor, holdSoulDrain, releaseSoulDrain, startItemTimer, stopItemTimer | No |
| Eldritch Arts | 66 registration points, including registerFamiliarModifier (Soulbound Familiar) and the Arcanum Seal runes' spell adders | **Adjacent:** the familiar derivation and the spell-adder list. Both changes are additive: Fast Movement is read by name, and Spell Battery joins the existing sources. The Eldritch Arts suite is unchanged on 3.697.0. |

None of the three modules defines a familiar ability named Fast Movement, Spell Battery, Energy Resistant, Ability Enhancement, Speak in Tongues or General Adeptness, so none of the new automations double up with module content.

## How to repeat this

```
node tools/regression-suite.mjs --modules=<folder holding the three module checkouts>
```

- **Resumable:** run it again after an interruption and it carries on.
- **Re-runs:** a core change re-runs every suite; a module change re-runs only that module.
- **Green** means every suite ran to the end and passed. Exit code 2 means the only gaps are BLOCKED checks (book text not present).
