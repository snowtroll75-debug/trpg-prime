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

## 6. 3.698.0 (Graham's rulings, 18 November 2026)

### Run

| Test | Result |
|---|---|
| `verify-audit-3698` / `mutate-audit-3698` | 21 checks green; 15 of 15 mutations caught |
| `verify-audit-3697` / `mutate-audit-3697` | 35 green (B3's window widened); 32 of 32 caught |
| Every verify file that touches grants, grant-autorun, the migration gates, pack repairs, data fixes or Ability Enhancement | 58 files, all green |
| `verify-no-undefined-names`, `verify-rules-have-callers` | green (821 files; 505 of 5,781 exports uncalled, backlog unchanged) |
| Module suites against 3.698.0 | Identical to 3.697.0. Pillars of Faith 11/11; Inner Tempest 19 pass, 2 blocked, 1 module-side; Eldritch Arts 55 pass, 1 blocked, 1 module-side. No pass turned to fail. |
| Full core sweep on 3.698.0 | Stopped by the environment after 179 files (every one green). Superseded by the 3.698.1 run below. |

### 3.697.0 live

Run in the Test world on 18 November; see `live-testing-report-3.697.0.md`. Every 3.697.0 fix passed live.

### Live-test plan for 3.698.0 (after install)

1. **Migration:** offered 3.697.0 → 3.698.0. An owned Flame Blade still at "30 feet" / "1 creature" is cleared.
2. **Level drop:** a Fighter at 13th, XP set to 8th. A notice reads "Granted above level 8, removed: Unbreakable Resolve, Weapon Supremacy." Raising XP back re-grants both. `trgAdvancementSweep()` should now report no orphans.
3. **Ability Enhancement:** a 5th-level familiar with three copies. Two take Dexterity; the third Use is refused with "at level 5 a familiar may have 2".
4. **Flame Blade:** casting asks for no target.

## 7. 3.698.1 (Flame Blade's blade, 18 November 2026)

| Test | Result |
|---|---|
| `verify-audit-3698` / `mutate-audit-3698` | 37 checks green; 26 of 26 mutations caught |
| **Every** core verify file (380, including the 11-minute `verify-checks-read-source`) | All green after three re-anchors. `verify-spell-range` (S4 148→149 self-only, U4 465/227→464/228) and `verify-spell-book-fields` (Flame Blade's blank range and targets declared) moved with **3.698.0's** ruling, which its targeted run had not reached. `verify-ranged-ability` W1 accepts the Spellcraft guard. |
| Mutate files for everything touched | `mutate-audit-3698`, `mutate-audit-3697`, `mutate-conjured-weapon`, `mutate-ea-block3a-core`, `mutate-ranged-ability`, `mutate-spell-range`, `mutate-spell-book-fields`: all caught, trees restored |
| `verify-no-undefined-names`, `verify-rules-have-callers` | green; backlog unchanged |
| Module suites against 3.698.1 | Identical to 3.697.0 and 3.698.0. Pillars of Faith 11/11; Inner Tempest 19 pass, 2 blocked (book text), `mutate-block8` module-side (U11); Eldritch Arts 55 pass, 1 blocked (book text), `mutate-block10b` module-side. |
| Rest of the core mutate files | Not re-run for 3.698.1 (about two hours). None anchors on the files changed, which was checked by search before the run above. |

### Live, after install

1. Migration offered 3.697.0 (or 3.698.0) → 3.698.1; an owned Flame Blade gains its blade row.
2. Cast Flame Blade: no target asked, no dialog; a conjured Scimitar appears unequipped; equip and strike. The card shows "Spellcraft N −2 in place of attack bonus M"; damage is fire; a critical rolls on the fire table.
3. After a minute of world time the blade is gone.
4. The 3.698.0 plan in §6 (level drop, Ability Enhancement, Flame Blade target).

## 8. 3.698.2 (the caster is always proficient, 18 November 2026)

| Test | Result |
|---|---|
| `verify-audit-3698` / `mutate-audit-3698` | 43 checks green; 32 of 32 mutations caught |
| **Every** core verify file (380, including `verify-checks-read-source`) | All green |
| Module suites against 3.698.2 | Same as every run since 3.697.0: Pillars of Faith 11/11; Inner Tempest 19 pass, 2 blocked, `mutate-block8` failing on the module's side; Eldritch Arts 55 pass, 1 blocked, `mutate-block10b` failing on the module's side |

### Live

Run in the Test world on 18 November on 3.698.2: see `live-testing-report-3.698.md`. Everything in §6, §7 and §8 passed. The cast turned up two small faults, fixed in 3.698.3 (§9).

## 9. 3.698.3 (two faults found by the live cast, 18 November 2026)

| Test | Result |
|---|---|
| `verify-audit-3698` / `mutate-audit-3698` | 46 checks green; 35 of 35 mutations caught |
| Every core verify file (380) | All green |
| Module suites against 3.698.3 | Same as every run since 3.697.0: Pillars of Faith 11/11; Inner Tempest 19 pass, 2 blocked, `mutate-block8` failing on the module side; Eldritch Arts 55 pass, 1 blocked, `mutate-block10b` failing on the module side |
| Live | **Pass** (live-testing-report-3.698.md). Flame Blade and Eldritch Weapon open no Customise dialog. The cards read "Scimitar (Flame Blade) — fire damage" and "Morning Star of pure force — force damage". A Scimitar added by hand is still offered for customising. |

## 10. 3.699.0 (rulings from the joint Codex / Fiends & Fables audit, 18 November 2026)

| Test | Result |
|---|---|
| `verify-joint-audit-3699` / `mutate-joint-audit-3699` (new) | 34 checks green; 16 of 16 mutations caught |
| `verify-chapter1` / `mutate-chapter1` (ability collapse) | 302 checks green; 52 of 52 mutations caught |
| Full regression suite, core (`tools/regression-suite.mjs`) | **759 of 759 pass** |
| Pillars of Faith 0.12.5 | 11 / 11 pass |
| Inner Tempest 1.0.4 (repository) | 19 pass, 2 blocked (`verify-block5` / `mutate-block5`, book text), `mutate-block8` failing on the module side. Same as every run since 3.697.0 |
| Eldritch Arts 0.17.2 | 55 pass, 1 blocked (`mutate-book-extract`), `mutate-block10b` failing on the module side (2 of 25). Same as every run since 3.697.0 |

How the suite ran:
- **Sittings.** The core suite ran in several sittings, because this environment stops long processes. A run killed mid-mutation was restored from the harness snapshot before it resumed.
- **Fixes made during the run:** three version and gate anchors left behind by the 3.699.0 re-gating:
  - `verify-audit-3698` E14 now accepts a gate at or after 3.698.2;
  - `mutate-audit-3698` and `mutate-live-fixes-3-627-1` anchor on the 3.699.0 gate;
  - `mutate-chapter1` O5 and O6 anchor on the new exemption list.
- **Read-source fix:** `verify-checks-read-source` caught one read-only claim in the new verify file (A7). It was rewritten to check the behaviour instead.
- **Two keeps removed from `uncalled-exports.json`:** `attackBaseOf` and `mayAskFor` now have real callers, so they no longer need to be kept.
- **Carried-forward results.** After the one-line anchor fix in `mutate-live-fixes-3-627-1`, the recorded results were carried forward. That file was re-run, together with the meta checks: `verify-no-undefined-names`, `verify-rules-have-callers`, `verify-checks-read-source` and `mutate-checks-read-source`.
- **Module test copies.** These were missing their npm dependencies on the first module run; they were re-run after `npm install`.

### Live (owed)

After installation in the Test world:
- a Skeleton Warrior and a creature given the Mindless trait while collapsed;
- Swim and Climb checks against plain Athletics and Climbing;
- a Keen Sense creature's Perception total;
- an Eternal at 0 HP;
- an Ooze against disease and precision;
- Ghost on a Ghoul (one Darkvision);
- the migration offered once, repairing owned Eternal and Ooze copies.

## 11. 3.700.0 (Skirmish, 19 November 2026)

| Test | Result |
|---|---|
| `verify-skirmish-3700` / `mutate-skirmish-3700` (new) | 33 checks green; 15 of 15 mutations caught |
| `verify-agile-display` / `mutate-agile-display` | 60 checks green; 93 of 93 mutations caught |
| `verify-session-faults-1014` | 27 checks green |
| Full regression suite, core | **760 of 760 run pass**. `mutate-checks-read-source` was carried forward from 3.699.0, see below |
| Pillars of Faith 0.12.5 | 11 / 11 pass |
| Inner Tempest (repository) | 19 pass, 2 blocked (`verify-block5` / `mutate-block5`, book text), `mutate-block8` failing on the module side. Same as every run since 3.697.0 |
| Eldritch Arts 0.17.2 (from the release zip) | 55 pass, 1 blocked (`mutate-book-extract`), `mutate-block10b` failing on the module side (2 of 25). Same as every run since 3.697.0 |

How the suite ran:
- **One process, not sittings.** It used a sequential copy of `tools/regression-suite.mjs`'s loop: the same script order, the same environment (`TRG_PRIME_ROOT`, `TRG_PRIME_DUMP`) and the same locked-pack retry.
  - **Why:** in sittings, the fingerprint kept resetting. Opening a pack compacts its LevelDB, and that deletes tracked `.ldb` files, which changes `git diff HEAD`. Worth excluding `*.ldb` churn from the fingerprint, or fingerprinting `packs-source` in its place.
- **Carried forward:** `mutate-checks-read-source`. It is about seven runs of the 20-minute checker, and neither the checker nor its mutations changed in 3.700.0. `verify-checks-read-source` itself was re-run and passes.
- **An early attempt was discarded.** Two suite processes overlapped, and two mutate files failed on the lock. Those results were thrown away, and the run above started clean.
- **Version anchors:** 58 harness files bumped from 3.699.0 to 3.700.0. Migration gates and `TRG_SCHEMA_VERSION` were left alone, because there is no data change.
## 12. 3.701.0 (the Movement trait on spells, and the Storgar, 19 November 2026)

| Test | Result |
|---|---|
| `verify-movement-trait-3700` / `mutate-movement-trait-3700` (new) | 59 checks green; 29 of 29 mutations caught |
| `verify-joint-audit-3699` (E9 now a gate floor) | 34 checks green |
| `verify-ea-block7-core` H2e, `verify-fixes-3685-1` T7 | Green. The cast workflow's pinned lines are unchanged: the Storgar logic sits around them, not inside them |
| Full regression suite, core (`tools/regression-suite.mjs`), on the merged tree (Skirmish + this) | **763 of 763 pass** |
| Pillars of Faith | 11 / 11 pass |
| Inner Tempest | 19 pass, 2 blocked (`verify-block5` / `mutate-block5`, book text), `mutate-block8` failing on the module side. Same as every run since 3.697.0 |
| Eldritch Arts | 55 pass, 1 blocked (`mutate-book-extract`), `mutate-block10b` failing on the module side (2 of 25). Same as every run since 3.697.0 |

How the suite ran (merged 3.701.0 tree): two sittings. The first was stopped mid-mutation at the background time limit. `pending-cast-workflow.mjs` was restored and the packs were reset to the committed state, so the fingerprint matched and its 417 results stood.

Earlier, on the 3.700.0 branch before the merge:
- **Sittings.** The suite ran in three sittings, because this environment stops long processes. One sitting was killed mid-mutation, and `pending-cast-workflow.mjs` was restored from the harness snapshot before the run resumed. The fingerprint was unchanged, so the earlier results stood.
- **One restart, after a fix found by the first sitting.** `verify-ea-block7-core` H2e and `verify-fixes-3685-1` T7 pin the exact lines that card a teleport and filter self rows.
  - **First version:** the Storgar gate was written inside those lines.
  - **Now:** it prunes rooted targets before them, as the trait-immunity gate does, and blocks self rows through the existing `selfShapeBlocked` flag.
  - **Result:** the pinned lines are byte-for-byte unchanged, and the suite was re-run from the start.
- **Meta checks.** `verify-rules-have-callers` flagged two new exported constants. They are now module-internal.

### Live (owed)

After installation in the Test world:
- Skirmish in combat, Step first: drag 5 ft (no AP, no AoO), then press Strike.
- Skirmish in combat, Strike first: press Strike, then drag.
- Another action before the second half removes it. A second press is refused.
- A ranged weapon offered in the chooser.
- Out of combat.
- the 34 spells show Movement, and Dimension Door's "Move" is gone;
- a Storgar's own Misty Step rolls the DC 5 flat check, and a failure leaves the token and gives no Spatial Awareness card;
- an ally's Slide on a Storgar rolls it, while an enemy's does not;
- Teleport by a Storgar rolls for the caster beside the targets;
- a Storgar's save against Gust carries the automatic +2 racial row;
- a Quickened point "for Move" pays for Swim;
- the migration offered once, repairing owned spell copies and the Storgar note.

## 13. 3.702.0 (Quick Draw, and drawing in combat is an Interact, 19 November 2026)

| Test | Result |
|---|---|
| `verify-quick-draw-3702` / `mutate-quick-draw-3702` (new) | 28 checks green; 18 of 18 mutations caught |
| `verify-held-change-3702` / `mutate-held-change-3702` (new) | 37 checks green; 18 of 18 mutations caught |
| `verify-stash-stow` / `mutate-stash-stow` (S5 re-anchored on the whole handler) | 10 checks green; 14 of 14 caught |
| `verify-block5-core` G1, `verify-block6-core` C10, `verify-fixes-3669-1` C4, `verify-ea-block3b-core` W24 | Green. The new `heldChange` option is declared early in `resolveAction`'s options, so the anchors on the last option still read |
| Full regression suite, core | **767 of 767 pass** |
| Pillars of Faith | 11 / 11 pass |
| Inner Tempest | 19 pass, 2 blocked (`verify-block5` / `mutate-block5`, book text), `mutate-block8` failing on the module side. Same as every run since 3.697.0 |
| Eldritch Arts | 55 pass, 1 blocked (`mutate-book-extract`), `mutate-block10b` failing on the module side (2 of 25). Same as every run since 3.697.0 |

How the suite ran:
- **Sittings.** Two sittings. The first was stopped at the background limit during `mutate-fixes-3685-3b`.
- **Before resuming.** `pending-cast-workflow.mjs` was restored and the packs were reset to the committed state. The fingerprint matched, so 417 results stood.
- **An earlier run was abandoned.** It covered Quick Draw alone, and was stopped when Graham's ruling on drawing in combat widened the release.

### Live (owed)

After installation, in the Test world:
- Quick Draw from a sheathed weapon;
- Quick Draw with full hands, and with nothing to draw;
- a player-side draw from the sheet in combat (AP, the Interact card, an Attack of Opportunity offered by an adjacent enemy);
- put away: Drop and Sheathe;
- a GM's "just set it";
- the item sheet's Equipped box;
- out of combat, still free.

## 14. 3.703.0 (the Manipulate Attack of Opportunity, and donning armour, 19 November 2026)

| Test | Result |
|---|---|
| `verify-manipulate-aoo-3703` / `mutate-manipulate-aoo-3703` (new) | 15 checks green; 6 of 6 mutations caught |
| `verify-armour-change-3703` / `mutate-armour-change-3703` (new) | 85 checks green; 26 of 26 mutations caught |
| `mutate-agile-display` (re-anchored) | 93 of 93 caught. Its "main commit point pays bare" anchor read the old one-line prepared-reaction payment, which is now a block |
| `verify-rules-have-callers` | OK, backlog unchanged. Helpers used only inside the armour workflow are not exported |
| Full regression suite, core | **771 of 771 pass** |
| Pillars of Faith | 11 / 11 pass |
| Inner Tempest | 19 pass, 2 blocked (`verify-block5` / `mutate-block5`, book text), `mutate-block8` failing on the module side. Same as every run since 3.697.0 |
| Eldritch Arts | 55 pass, 1 blocked (`mutate-book-extract`), `mutate-block10b` failing on the module side (2 of 25). Same as every run since 3.697.0 |

How the suite ran:
- **Sittings.** Two sittings on the final fingerprint; the first stopped at its time budget after 420 scripts, and the second resumed from there.
- **An earlier run was abandoned** when it found the stale `mutate-agile-display` anchor; it was stopped, the anchor fixed and committed, and the run started over.
- **Before the final run,** the 164 core mutation files that touch the changed sources were run against an archive of the commit, all green.

### Live (owed)

After installation, in the Test world:
- an Interact at 0 AP beside a foe, cancelled at the prompt: no Attack of Opportunity offer; with AP: the offer;
- out of combat: a medium suit on and off (4 minutes each), a full suit (doubled);
- in combat: a light suit as a task (the first payment, Continue next turn, worn when paid), the box mid-task (Continue / Abandon), a GM's "just set it";
- a helmet in combat (1 AP Interact), and out of combat (free);
- Quick Donning on yourself, then a donning at its time; on a targeted ally.

## 15. 3.703.1 (the armour dialog, and the donning readings confirmed, 20 November 2026)

| Test | Result |
|---|---|
| `verify-armour-change-3703` / `mutate-armour-change-3703` (H1 to H3 and two mutations added) | 88 checks green; 28 of 28 mutations caught |
| `verify-rules-have-callers` | OK, backlog unchanged |
| Full regression suite, core | **771 of 771 pass** |
| Pillars of Faith | 11 / 11 pass |
| Inner Tempest | 19 pass, 2 blocked (`verify-block5` / `mutate-block5`, book text), `mutate-block8` failing on the module side. Same as every run since 3.697.0 |
| Eldritch Arts | 55 pass, 1 blocked (`mutate-book-extract`), `mutate-block10b` failing on the module side (2 of 25). Same as every run since 3.697.0 |

How the suite ran: two sittings on one fingerprint, the first stopped at its time budget after 420 scripts.

### Live (owed)

After installation: the GM's "In Combat" dialog for a light suit (one "(15 AP)") and for a medium suit ("2 minutes (60 AP)" with Quick Donning, or "4 minutes (120 AP)").
