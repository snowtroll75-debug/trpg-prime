# TRG Prime: handover, core automation audit (3.697.0)

17 November 2026. This is the progress record for the whole-system audit Graham asked for (`b427096e-attachment.txt`: 23 phases, plus his two emphases). Read this first to pick the work up.

## Where things are

- **Branches** (GitHub `snowtroll75-debug/trpg-prime`; none merged to `main`):
  - `audit/core-automation-3.697`: the baseline branch (regression suite and live sweep tools only).
  - `audit/fixes`: the 3.697.0 code.
  - `audit/release-3.697`: `audit/fixes` plus the documents. This is the branch to merge.
- **`main` is untouched at 3.696.3.** A push to `main` publishes a release (`.github/workflows/release.yml`), so it waits for Graham.
- **The live install was byte-identical to `main`** (831 files, checked through the Foundry server) before any work.
- **The ZIP** `trg-prime-3.697.0.zip` was built from `audit/release-3.697`. Graham installs it himself; the system folder is shared by every world, including the campaign world.
- **Test world.** "Test" on localhost:30000 (Graham's instruction, 17 Nov). Log in as Gamemaster, no password. Live scripts refuse to run in a world whose title lacks "test" or "audit".

## The rulebook

- **Core 3.8** was supplied as a 357 MB docx.
- **Text extraction:** `extract_docx.py` (lxml iterparse over `word/document.xml`) takes 3 seconds and gives 21,614 lines with tables as `| a | b |` rows.
- **Watch out:** the NEXUS OF ELEMENTAL ENERGY heading merges its trait line, so a naive spell parser folds it into Neutralise Poison. That is the same trap the 25 August parser fell into (see data-fixes.json).

## What was done

| Phase | State |
|---|---|
| 1. Baseline, protection | Done: branch, live parity, module versions |
| 2. Architecture | Static scans: V14 API usage (clean), hook registration (U5, U6), effect keys (all resolve), pack integrity (clean) |
| 3. Content inventory | Done: all 1,992 entries (`tools/audit-inventory.mjs`); 118 with no route classed by hand |
| 4. Advancement | Live 1→20→1 for all 8 classes: all match. U1 is open. |
| 5. Derived stats | Class tables verified book → pack → live actor |
| 6–13. Combat, spells, conditions, resources, feats, skills, equipment, NPCs | Covered by the 40-block audit and its harness (the 753-script core sweep). This session added the content fixes R1–R6. |
| 14. Modules | `tools/regression-suite.mjs` runs all three module suites against the working core |
| 17. Tests | See TRG_CORE_TEST_REPORT.md |
| 19–20. Version, LevelDB | 3.697.0 pins; 31 packs declared and present, LevelDB files only, ids clean |
| 21. Documents | TRG_CORE_*.md, CHANGELOG.md, release-notes-3.697.0.md |

## Next, in order

1. **Graham's rulings:** U1 (level drop), U2 (Flame Blade), U3 (Inner Focus), U4 (Ability Enhancement window).
2. **Once Graham has installed 3.697.0:** the live-test plan in TRG_CORE_TEST_REPORT.md, in the Test world.
3. **The C list** in TRG_CORE_UNRESOLVED.md, as a block. Divinity Purge and Mind Cleanse need the trait decision first.
4. **U7:** re-key pack effects from `mode` to `type`, in a quiet release.

## Lessons from this session

- **A killed mutation run leaves a sabotaged tree and a stale lock.** `regression-suite.mjs` now reclaims the lock (restoring the snapshot) before it fingerprints anything.
- **Never edit the worktree a suite is running in.** Use a second worktree. A guard restore will overwrite the edit, and the fingerprint changes mid-run.
- **Never `git commit -a` in this repository.** LevelDB rewrites `CURRENT`, `LOG` and `MANIFEST-*` whenever a pack is opened, and a test mutant may be on disk. Stage paths by name.
- **Two processes cannot open one pack.** "Database failed to open" means another process holds it, not a broken rule; the suite retries once.
- **Long background runs in this environment are killed** when the session state is saved. The suite resumes from `tools/.regression-state.json`; re-run the same command.
