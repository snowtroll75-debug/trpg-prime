# TRG Prime — Changelog

The full notes for every release are in `release-notes-<version>.md` beside this file; this changelog summarises from 3.697.0 onward.

## 3.698.3 — 18 November 2026: two faults found by the live Flame Blade cast

Branch `audit/release-3.698.3`, from 3.698.2. Not on `main` yet.

- **No Customise dialog for a conjured weapon.** Casting Flame Blade opened "Customise Scimitar", offering quality, materials and runes for a one-minute blade. Eldritch Weapon and Shadow Weapon did the same. `shouldOfferCustomisation` now skips any weapon a spell conjured.
- **The cast card names a fire blade correctly.** It read "Scimitar of pure force — fire damage"; it now reads "Scimitar (Flame Blade) — fire damage". Force blades keep their wording.
- **Harness:** `verify-audit-3698` / `mutate-audit-3698` now 46 checks / 35 mutations.

## 3.698.2 — 18 November 2026: the caster is always proficient with Flame Blade

Branch `audit/release-3.698.2`, from 3.698.1.

- **Flame Blade (Graham: "Flame blade does not need martial proficiency. The caster is always proficient."):** the conjured blade carries a `casterProficient` mark, so there is no −4 for a caster without martial weapons. A Scimitar bought in a shop has no mark and is judged as before. Eldritch Weapon is unchanged.
- **Pack and migration:** Flame Blade's row gains `casterProficient: true`. The owned-copy repair keeps one entry for the field: its `to` is the final row, and 3.698.1's row is listed as `alsoFrom`, so copies already updated in 3.698.1 are updated again. Migration re-gated to 3.698.2.
- **Harness:** `verify-audit-3698` / `mutate-audit-3698` now 43 checks / 32 mutations.

## 3.698.1 — 18 November 2026: Flame Blade's blade

Merged to `main` with Graham's approval, together with 3.697.0 and 3.698.0.

- **Flame Blade (U12, ruled "fire"):** casting puts a conjured Scimitar in the caster's hand for the spell's minute. It deals fire damage, so its criticals are fire criticals, and attacks with Spellcraft −2 in place of the attack bonus. It is removed when the spell ends.
- **Conjured weapons:** a row can now name its weapon (`weapons: ["Scimitar"]`) and roll on Spellcraft (`attackBase: "spellcraft"`, `attackAdjust`). The shaping dialog names the spell's own damage type instead of always saying force. Eldritch Weapon and Shadow Weapon are unchanged.
- **Attack:** a new `spellcraftAttackRow` (combat/attack-base.mjs) replaces the attack bonus, and the Finesse, declared-ability and ranged-Dexterity swaps it stands in for, with one named row.
- **Migration:** re-gated to 3.698.1, so owned Flame Blades get the blade.
- **Harness:** `verify-audit-3698` / `mutate-audit-3698` now 37 checks / 26 mutations. `verify-spell-range`, `verify-spell-book-fields` and `verify-ranged-ability` re-anchored on the 3.698.0 Flame Blade ruling, which the targeted 3.698.0 run had not reached.

## 3.698.0 — 18 November 2026: Graham's rulings on the audit

Branch `audit/release-3.698`, from 3.697.0.

- **Level drop:** levelled grants above the new level are taken back, with a notification (U1). This covers class abilities, feats and spells, an ability's spells and a school's specialist spells.
- **Flame Blade:** no range, no targets (R3).
- **Ability Enhancement:** once per four levels, enforced (R7).
- **Migration:** re-gated to 3.698.0, for Flame Blade's owned copies.
- **Harness:** `verify-audit-3698` / `mutate-audit-3698` (21 checks / 15 mutations).

## 3.697.0 — 17 November 2026: the core automation audit

Branch `audit/fixes` → `audit/release-3.697`, from 3.696.3. Merged to `main` with 3.698.1.

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
