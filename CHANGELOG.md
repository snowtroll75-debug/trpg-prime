# TRG Prime — Changelog

The full notes for every release are in `release-notes-<version>.md` beside this file; this changelog summarises from 3.697.0 onward.

## 3.698.0 — 18 November 2026: Graham's rulings on the audit

Branch `audit/release-3.698`, from 3.697.0. Not on `main`.

- **Level drop:** levelled grants above the new level are taken back, with a notification (U1). This covers class abilities, feats and spells, an ability's spells and a school's specialist spells.
- **Flame Blade:** no range, no targets (R3).
- **Ability Enhancement:** once per four levels, enforced (R7).
- **Migration:** re-gated to 3.698.0, for Flame Blade's owned copies.
- **Harness:** `verify-audit-3698` / `mutate-audit-3698` (21 checks / 15 mutations).

## 3.697.0 — 17 November 2026: the core automation audit

Branch `audit/fixes` → `audit/release-3.697`, from 3.696.3. **Not on `main`:** awaiting Graham's approval to merge and publish.

### Fixed
- **Fast Movement (familiar):** +15 ft to every speed the familiar has. The item said "Applied automatically", but nothing applied it.
- **Energy Resistant, Ability Enhancement, Speak in Tongues, General Adeptness (familiar):** the Use button each item promised now works.
- **Spell Battery (familiar):** the familiar is a +1 Spell Adder within 30 ft. It was never read, because it sits on the familiar rather than the caster.
- **Changing Lungs:** the caster no longer drowns (the `waterBreathing` marker Water Breathing already uses).
- **Long Arm:** +5 ft reach, through a new `longArm` marker read where reach is set from size.
- **Inner Focus:** waives the -2 and the +10 fumble for casting without the focus, through a new `innerFocus` marker.

### Data and migration
- **Pack edits:** three spell rows, declared in `tools/data-fixes.json` and `module/data/pack-repairs.mjs`.
- **Migration:** the pack-copy pass and `TRG_SCHEMA_VERSION` are re-gated to 3.697.0. A world migrating from 3.696.3 repairs owned copies of the three spells and nothing else. Copies a GM has edited are left alone.

### Harness
- **New:** `tools/regression-suite.mjs`, the system-wide regression run (core plus Pillars of Faith, Inner Tempest and Eldritch Arts), resumable.
- **New:** `tools/audit-inventory.mjs`; `tools/live/advancement-sweep.js` (test worlds only); `verify-audit-3697` / `mutate-audit-3697` (35 checks / 32 mutations).
- **Version pins:** 3.697.0 in 54 harness files. `package-lock.json` brought into line (it had stayed at 3.694.0).

### Documentation
- `TRG_CORE_AUTOMATION_AUDIT.md`, `TRG_CORE_REPAIR_REPORT.md`, `TRG_CORE_RULES_AUDIT.md`, `TRG_CORE_TEST_REPORT.md`, `TRG_CORE_MODULE_COMPATIBILITY.md`, `TRG_CORE_UNRESOLVED.md` and `TRG_CORE_API_REFERENCE.md`.
