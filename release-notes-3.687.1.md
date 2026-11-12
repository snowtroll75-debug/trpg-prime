# TRG Prime 3.687.1

12 November 2026. This is **3.687.0 as live-tested, renumbered at Graham's request**, so it installs over the 3.687.0 builds he tested. It holds Block 8b's seams H13–H16 and one fix from the live test. The full notes are in `release-notes-3.687.0.md`.

- **Install over 3.687.0 or 3.686.2.** No migration, and no world data is touched.
- **Eldritch Arts 0.12.1 needs it.** Eldritch Arts 0.11.2, Inner Tempest and Pillars of Faith run on it unchanged.

## Since 3.687.0

**A cast's turn-start storm keeps its own clock** (found in the live test):
- **The fault:** Storm of Unmaking, cast successfully, struck once and never again, and never passed. Its "1 minute" is not a duration the active-spell registry records, so at the turn start its cast looked ended.
- **The fix:** the cast now gives a storm that strikes at its caster's turn start its own clock, the duration as cast. It then strikes at each turn start and passes on its time.
- **Unchanged:** Storm of Vengeance, whose cast is a sustained entry.

## Checks

- **`verify-block8b-core`:** 60 checks, all green.
- **`mutate-block8b-core`:** 58 mutations, all caught.
- **The other storm checks**, all green after the fix: `verify-walls-storm` (`mutate-walls-storm` caught all 39), `verify-missile-storm`, `verify-live-3610`, `verify-cast-result-line`, and `verify-ea-block2b`, `-3b` and `-5b-core`.
- **Static checks**, all green: undefined names, imports, rules with callers, checks that can fail.
- **The version bump (3.687.0 → 3.687.1):** it is re-pinned in `system.json`, `package.json` and `package-lock.json`, and in every harness that names the release (3 verifies, 25 mutates). Those three verifies are green; the 25 mutates were re-run on copies of the tree (see the session report).

## Live tests

- **The first live test:** `claude/eldritch-arts-live-testing-report-0.12.0.md`.
- **The second:** `claude/eldritch-arts-live-testing-report-0.12.1.md`, covering the eight spells not yet run.
- **Still to be tested live:** this release's storm fix, which needs 3.687.1 installed.
