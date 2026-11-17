# TRG Prime Core 3.697.0 — Test Report

17 November 2026. Every test listed here was actually run, with its result as observed. Tests not run are listed as not run.

## 1. The full regression suite (`tools/regression-suite.mjs`)

| Suite | Scripts | Result on 3.697.0 |
|---|---|---|
| TRG Prime core (the whole harness: generic checks, every per-rule verify and its mutation file, self-checks) | 755 | 753 pass, 2 fail on the first run. Both were `verify-spell-narration` D2 and its mutation file, the "narrating spells" ratchet. Lowered 188 → 185 for the three spells that gained rows, then both re-run green on the release tree (56 checks; 13 of 13 mutations caught). |
| Pillars of Faith | 11 | 11 pass |
| Inner Tempest | 22 | 19 pass, 2 blocked (book text absent), 1 module-side survivor (pre-existing) |
| Eldritch Arts | 57 | 55 pass, 1 blocked (book source absent), 1 module-side (pre-existing, needs the book) |

- **Where it ran:**
  - Core: a clean worktree at commit 131256a, from an empty results file.
  - Modules: against the release tree, whose code is the same as 131256a's.
- **Module detail:** in TRG_CORE_MODULE_COMPATIBILITY.md.
- **A runner bug, found and fixed during the session.** The runner's first fingerprint could not see changes (`git ls-tree` rejected its pathspecs, and the error was swallowed). The core run above started from an empty results file, so none of its results were reused across trees. The module results were re-run after the fix (§1a).

- **The core run** went in three sittings, because this environment stops long processes: 415, then the rest after a time-limit kill. The killed mutation was restored from the harness snapshot before the run resumed.
- **Among the 755:** `verify-no-undefined-names` (821 files), the uncalled-export ratchet (505 of 5,778 exports, all declared), `verify-checks-can-fail`, `verify-checks-read-source` (11 minutes) and its mutation file. Also every per-rule verify paired with its mutate file.

### 1a. Module suites re-run on the final release tree

Run with the corrected runner on the final release tree (fingerprint 10b9c6a97fc0). The results are identical to the first module run:

- **Pillars of Faith:** 11 of 11 pass.
- **Inner Tempest:** 19 pass, 2 BLOCKED (`verify-block5` and `mutate-block5`, book text), and 1 fail (`mutate-block8`, the module-side survivor described in the compatibility report).
- **Eldritch Arts:** 55 pass, 1 BLOCKED (`mutate-book-extract`), and 1 fail (`mutate-block10b`, the two book-boundary survivors).

All of these were already present on 3.696.3.

## 2. The new checks

- **`verify-audit-3697`:** 35 checks, all green.
- **`mutate-audit-3697`:** 32 mutations, all caught, tree restored.
- **Sections:** A Fast Movement · B the four familiar Use buttons · C Long Arm · D Inner Focus · E the pack, its declaration and the owned-copy repair agree · F Spell Battery · Z the version.

Existing checks changed, and why:

| Check | Change | Reason |
|---|---|---|
| 54 verify/mutate files | Version pin 3.696.3 → 3.697.0 | Release convention |
| mutate-drive-3622, mutate-dedicated-rows, mutate-defence-lists, mutate-focus-default | Schema-stamp anchor → 3.697.0 | The stamp moved |
| mutate-session-fixes-1022 | Pack-copy gate anchor → 3.697.0 | The gate moved |
| verify-session-fixes-1022 C8 | "gate is 3.666.1" → "gate is 3.666.1 **or later**" | A later re-gate still covers Hurling. Its mutation (gate back to 3.648.0) is still caught. |
| verify/mutate-block9c-core H23 | Re-anchored to the cast line that now also adds familiar adders | The same rule, one more source |
| `uncalled-exports.json` | Backlog 507 → 505 | `actorLanguageState` and `masterOfFamiliar` gained callers |

## 3. Static audits

| Audit | Scope | Result |
|---|---|---|
| Foundry V14 API | Deprecated globals (`renderTemplate`, `mergeObject`, `Dialog`, `ACTIVE_EFFECT_MODES`…) across 820 files | All namespaced; no deprecated call |
| Hook registration | 165 `Hooks.on/once` sites | 2 at top level, 73 in register functions, 2 per-call with removal. Findings U5 and U6, both low risk. |
| Active Effect keys | 83 distinct keys over 444 pack effect changes | All resolve to the template or a derived pool |
| Compendium integrity | 31 packs, 2,023 documents and 590 embedded effects | 31 declared and 31 present; LevelDB files only; no duplicate or malformed id; no missing embedded effect; no broken `@UUID`; no unresolved grant. Document counts unchanged from 3.696.3. |
| Book cross-check | Core 3.8: 691 spell stat blocks, 8 class tables (160 rows), feat prerequisites | No discrepancy (see the rules audit) |

## 4. Runtime tests in Foundry (Graham's "Test" world, Foundry 14.367, 3.696.3 installed)

| Test | Result |
|---|---|
| Live install vs repository | 831 of 831 shipped files byte-identical to `main` (git blob hashes, served by the Foundry server). Pillars of Faith 20/20. Inner Tempest 16/17: only `module.json` differs (U9). |
| World load | Clean: no console errors or warnings. Companion content registered from 4 modules; 412 Codex entries. |
| Advancement sweep (`tools/live/advancement-sweep.js`) | 8 classes × 20 levels up, 19 down. BAB, BDB, Fort, Ref, Will, caster level and PP equal the class table at every level. 0 duplicate grants, 0 errors, 0 stuck dialogs. Level drop keeps higher-level class abilities (U1). Throwaway actors deleted. |
| Familiar check, **3.696.3** (`tools/live/familiar-check.js`) | Fast Movement: land 25 → **25**. Energy Resistant: **no Use handler**. Spell Battery: the master's adder total **0**. Confirms R1–R3 on the installed version. Actors deleted. |

**Not run live:** 3.697.0 itself. Installing a system replaces it for every world, the campaign world included, and Graham installs releases himself.

## 5. Live-test plan for 3.697.0 (Test world, after install)

1. **Migration.** Loading offers schema 3.666.4 → 3.697.0. It should repair only owned copies of Changing Lungs, Long Arm and Inner Focus whose rows are still empty.
2. **Familiar check.** Paste `tools/live/familiar-check.js` and `await trgFamiliarCheck()`. Expected: `landBefore 25, landAfter 40, energyResistantUse true, spellBattery 1`.
3. **Energy Resistant.** On a familiar, press Use and choose Fire. "Fire" appears in its Resistances; press again, choose Cold, and Fire is replaced.
4. **Ability Enhancement.** Use → Dexterity +1. A second copy → Dexterity +2, with the four-level warning on the card.
5. **Speak in Tongues.** Use → the master's languages are offered; the pick appears on the familiar; a second pick replaces the first.
6. **General Adeptness.** Use → only general feats the familiar lacks; the feat is granted. Deleting the ability removes the feat.
7. **Spell Battery.**
   - With the familiar's token within 30 ft, the master casts a repertoire spell. The Spell Adder prompt offers "Owl: Spell Battery +1".
   - Move the familiar to 35 ft: no offer.
   - With no tokens on the scene, the offer reads "(within 30 ft)".
8. **Changing Lungs.** Cast it, then go underwater: no breath clock starts. Remove the effect: it starts.
9. **Long Arm.** Cast it: reach reads 10 (Medium); an Attack of Opportunity is provoked at 10 ft. It ends after 1 minute.
10. **Inner Focus.** On a focus caster with Focus Ready unticked, cast a spell: no "Casting without focus" −2, and no +10 on a forced fumble. Tick Focus Ready: +1 as before.
11. **Advancement sweep.** Run it again (`await trgAdvancementSweep()`). Same results as §4.
12. **Regression in the modules.** Pick one Pillars of Faith, Inner Tempest and Eldritch Arts feature each that was live-tested on 3.696.x (for example Judgement on a Grimward spell, Root's Trip DC, the Aegis of Valtea's relic grants) and repeat it.
