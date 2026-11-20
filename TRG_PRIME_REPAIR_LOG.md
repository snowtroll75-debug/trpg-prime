# TRG Prime — Repair Log

The durable history of individual rules-automation repairs, one entry per repair. Each entry records:

- the state the repair started from;
- the diagnosis and what was changed;
- what was tested, and what was not;
- what was delivered.

Read it before repairing a feature, to see whether that feature or its mechanic was repaired before. Release-by-release detail stays in `release-notes-<version>.md` and `CHANGELOG.md`.

A repair is recorded as verified only when its stated tests actually ran and passed. Live Foundry verification is listed separately and is never inferred from the harness.

---

## R-0001 — Lunge (and Lunging Stance's penalty negation)

### Repair identification

- **Date:** 20 November 2026
- **Reference:** R-0001
- **Feature:** Lunge (Chapter 5 feat, Martial / Rogue); also Lunging Stance's "penalties … negated" clause.
- **Reported:** Graham: "The Lunge feat does not work correctly."

### Source state

- **Starting version:** 3.703.1, from the release zip Graham supplied on 20 November 2026.
- **GitHub:** `main` is at 3.699.0 (`29ebb45`); `release/3.700.0` is the newest pushed branch (`75e9551`). 3.701.0 to 3.703.1 have not been pushed.
- **Working base:** branch `fix/feat-lunge`, from `origin/release/3.700.0`. The 3.703.1 snapshot was committed over it unchanged as `caf2a1b` ("Import trg-prime 3.703.1 release snapshot"), and the repair was built on that.
- **Existing changes:** the clone was clean. Graham's local working copies (Foundry Data, Codex folders) were not touched; no device folder was connected.
- **Relevant external changes:** none to Lunge since its pack entry (systemVersion 3.215.3). The `ACTION_FEATS` framework, Quick Draw (3.702.0) and Skirmish (3.700.0) were the most recent work on the same machinery.

### Diagnosis

- **Rule** (Core 3.7 text, `tools/source/rulebook-core-3.7.txt` L8867–8872, identical to the pack entry): "Requirements You are wielding a melee weapon. Using your melee weapon, you may take an action with the attack trait. This action gains the reach trait for that Strike. This strike is subject to a -1-circumstance penalty."
- **Reach trait** (L12163, with Graham's earlier ruling): +5 ft, −2 AB only at the extended distance.
- **Lunging Stance** (L8878): "any penalties associated with performing standard Lunge strikes are completely negated."
- **Actual behaviour:** `feats-workflow.mjs` `"lunge".use` queued a −1 pending modifier and posted a card. No Strike gained Reach. `rollWeaponAttack`'s reach gate (`reachPenalty`, `weaponReachExtension`) still used the weapon's own traits, so a target at 10 ft was refused as out of reach. The −1 was a manual tick-box on any next check.
- **Root cause:** there was no way for a Strike to gain a trait for itself, and Lunge was a reminder card, not a Strike.
- **Relevant files:**
  - `module/feats-workflow.mjs`
  - `module/combat/attack-workflow.mjs`
  - `module/combat/attack.mjs`
  - `module/combat/action-feats.mjs`
  - `module/combat/action-feats-workflow.mjs`

### Implementation

**Files modified:**

- `module/combat/attack.mjs`
- `module/combat/attack-workflow.mjs`
- `module/combat/action-feats.mjs`
- `module/combat/action-feats-workflow.mjs`
- `module/feats-workflow.mjs`
- `module/data/pack-repairs.mjs`
- `module/migration.mjs`
- `tools/data-fixes.json`
- `packs/feats` (two note effects)
- `system.json`, `package.json`, `package-lock.json`
- 61 harness files (version pins only)
- re-anchors: `verify-chapter6-gear-151-160` (G6, H3), `verify-skirmish-3700` (C4, E4), `verify-session-faults-1014` (F6b)
- seven mutation files whose anchors name the schema stamp or the effect-pass gate
- new: `tools/verify-lunge-3704.mjs`, `tools/mutate-lunge-3704.mjs`

**Functions and data changed:**

- New:
  - `traitsWithGranted`;
  - `rollWeaponAttack` options `grantTraits` and `waiveReachPenalty`;
  - `ACTION_FEATS.lunge` (`strikePays`, `lunge`);
  - `REQUIREMENTS.meleeWeapon`;
  - `lungeWeapons`, `lungingStanceActive`, `lungeStrikeTerms`;
  - `chooseLungeWeapon`, `RUN.lunge`.
- Changed:
  - `strikePlan` (grant, waiver, `apPaid: !strikePays`);
  - `runActionFeat` (Lunge's chooser; no spend for `strikePays`);
  - `actorActionState` (`meleeWeapon`);
  - the Lunging Stance handler (declaration flag, text).
- Removed: the old `"lunge"` handler.

**Summary:** Lunge's Use is now a Strike with Reach (+5 ft, the trait's −2 in the band) and −1 circumstance. The Strike pays its own AP and is refused before cost when out of reach. Lunging Stance negates the −1 and the Reach −2.

**Migration:** the owned-effect repair now covers the two notes, re-gated to 3.704.0, and `TRG_SCHEMA_VERSION` is raised to 3.704.0. It matches the old value and is idempotent.

### Testing

**Executed and passed:**

- `verify-lunge-3704`: 66 checks. Section R reproduces the defect against the reach gate.
- `mutate-lunge-3704`: 23 of 23 mutations caught.
- `verify-chapter6-gear-151-160`: 158 checks, after re-anchoring G6 and H3.
- `mutate-chapter6-gear-151-160`: 43 of 43 caught.
- `verify-rules-have-callers`: 505 uncalled, backlog unchanged.

**Core regression, 773 of 773 scripts run:**

- The first pass had 16 failures, all from this change: the migration stamp wasn't raised with the re-gate, and source anchors sat on the reshaped lines.
- Fixed: `TRG_SCHEMA_VERSION` 3.704.0, and the anchors re-aimed.
- The affected 73 scripts and the whole-tree checks were re-run, and all pass.

**Modules** (Pillars of Faith 0.12.6, Inner Tempest 1.0.4, Eldritch Arts 0.17.2): identical results on 3.704.0 and on the untouched 3.703.1 core. 90 run, 74 pass, and the same 16 fail on both (module version pins, blocked book text, known module-side survivors).

**Pack:** a record diff against 3.703.1 shows only the two note descriptions changed.

**Live Foundry:** passed, 20 November 2026, in the "Test" world after Graham installed 3.704.0 (`live-testing-report-3.704.0.md`):

- the control Strike at 10 ft was refused;
- Lunge at 10 ft hit with −1 and −2 for 1 AP;
- Lunge at 15 ft was refused with no AP spent;
- in Lunging Stance there were no penalties, and the MAP was applied normally;
- a Glaive alone, or no weapon, was refused with the reason.

No console errors. The world migration to 3.704.0 ran.

### Delivery

- **Version:** 3.704.0
- **Branch:** `fix/feat-lunge` (committed locally, not pushed)
- **Package:** `trg-prime.zip`, top folder `trg-prime/`
- **Readings for Graham:** see `release-notes-3.704.0.md`.
  - L1: the stance also waives the Reach −2.
  - L2: natural attacks are excluded.
  - L3: Lunge is offered with Strike only, not other Attack-trait actions.
- **Found, not changed:** Lunging Stance's +5 ft Attack of Opportunity reach is not automated.
