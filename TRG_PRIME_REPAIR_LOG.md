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

---

## R-0002 — Lunge: −1 only (ruling on R-0001's reading L1)

### Repair identification

- **Date:** 20 November 2026
- **Reference:** R-0002, following R-0001
- **Feature:** Lunge, and Lunging Stance's negation
- **Reported:** Graham asked what the −2 was. Told it is the Reach trait's own penalty, which the Strike carried once Lunge gave it Reach, he ruled: "-1 only for lunge". He will amend the feat's wording in the rulebook.

### Source state

- **Starting version:** 3.704.0, on branch `fix/feat-lunge` at `7dff3ae`.
- **Working tree:** clean.
- **Remote:** unchanged (`main` 29ebb45, `release/3.700.0` 75e9551). No external changes.
- **Live Test world:** at 3.704.0 and schema 3.704.0 after R-0001's live test.

### Diagnosis

- **Expected:** a Lunge Strike reaches 5 ft further with a −1 circumstance penalty and nothing else. In Lunging Stance it has no penalty.
- **Actual (3.704.0):** at the extended distance a Lunge also took the Reach trait's −2, for −3 in total. Lunging Stance removed both.
- **Cause:** R-0001's reading L1 treated the gained Reach trait as bringing its penalty with it. The ruling reverses that.
- **Relevant files:** `module/combat/action-feats.mjs` (`lungeStrikeTerms`), the card text in `action-feats-workflow.mjs`, and the two note effects.

### Implementation

**Code:**

- `lungeStrikeTerms` always sets `waiveReachPenalty`.
- The Lunge card, the Lunging Stance card and its effect description now name only the −1.
- Comments are updated in `attack-workflow.mjs` and `strikePlan`.

**Data:**

- `tools/data-fixes.json`: `lunge-note-3704-1` and `lunging-stance-note-3704-1`. The 3.704.0 rows are marked `supersededBy`.
- `tools/apply-data-fixes.mjs`: `supersededBy` is honoured for `editEffect` rows.
- `module/data/pack-repairs.mjs`: the 3.704.0 rows now lead to the final wording, and two rows are added for copies already at the 3.704.0 wording.
- `packs/feats`: the two note effects.

**Migration:** the owned-effect pass and `TRG_SCHEMA_VERSION` are at 3.704.1.

**Harness:**

- `verify-lunge-3704` and `mutate-lunge-3704` are updated.
- 68 harness files have their version, schema or gate pins raised to 3.704.1.
- One comment is re-worded in `verify-chapter6-gear-151-160`.

### Testing

- `verify-lunge-3704`: 70 checks pass.
- `mutate-lunge-3704`: 24 of 24 mutations caught.
- `apply-data-fixes`: 2 applied, 780 already done or superseded. The 25 refusals are pre-existing and identical to 3.703.1.
- The re-run of the 414 affected scripts is recorded in `release-notes-3.704.1.md`.

### Delivery

- **Version:** 3.704.1
- **Branch:** `fix/feat-lunge` (local, not pushed)
- **Package:** `trg-prime.zip`
- **Outstanding:**
  - The compendium feat descriptions wait for Graham's amended wording.
  - Readings L2 (natural attacks) and L3 (other Attack-trait actions) are still open.
  - Lunging Stance's Attack of Opportunity reach is still not automated.

---

## R-0003 — Lunge with any attack action; reach for the attack actions

### Repair identification

- **Date:** 20 November 2026
- **Reference:** R-0003, following R-0002
- **Feature:** Lunge (readings L2 and L3), and the reach of Trip, Shove, Disarm, Grapple, Shield Bash, Aid and Coup de Grace.
- **Reported:** Graham, "Yes to the two questions": natural attacks can Lunge, and Lunge works with any action with the attack trait.
  - Investigating L3 found that those actions had no reach check at all. Asked, Graham chose "Add reach check + Lunge".
  - Later: "Yes disarm does use reach", so the reaction Disarms are measured too.

### Source state

- **Starting version:** 3.704.1, on branch `fix/feat-lunge` at `84d71c4`.
- **Working tree:** clean.
- **Remote:** unchanged.

### Diagnosis

- **Rules (Core 3.7):**
  - reach is "how far it can make melee attacks";
  - the Trip, Shove and Disarm traits "use the weapon's reach";
  - Grapple may target a creature you already hold;
  - Aid is "a melee Strike against the target";
  - Coup de Grace needs "an adjacent helpless opponent".
- **Actual:** `resolveAction` measured distance only for Prone's ±4, so these actions worked at any range. Lunge offered only Strike, and refused natural attacks.
- **Root cause:** no reach check existed for the basic actions. The Strike had its own, in `rollWeaponAttack`.
- **Relevant files:**
  - `combat/action-workflow.mjs`
  - `combat/attack-workflow.mjs`
  - `combat/action-feats(-workflow).mjs`
  - `combat/charge-workflow.mjs`
  - the reaction workflows

### Implementation

**New modules:**

- `combat/action-reach.mjs` (pure): which reach each action uses, the verdict, and the refusal text.
- `combat/lunge-scope.mjs`: a Lunge in scope for one action on this client, always cleared.

**Changed:**

- **`resolveAction`:** the reach check before any spend, a `reachExempt` option, and the Reach −2 and Lunge −1 rows. Charge records its Lunge.
- **`rollWeaponAttack`:** a melee, non-reaction Strike made in a Lunge's scope takes its terms.
- **Charge:** the charge record carries the Lunge to the Strike on arrival.
- **Lunge:** `lungeWeapons` admits natural attacks. New `lungeActionOptions` and `runLunge`.
- **Reactions:** Guardian Defence's Aid and Offensive Parry's Shove are `reachExempt`. Disarm Block and Reactive Disarm are measured.

**Data and migration:**

- `lunge-note-3705`; the 3.704.1 row is superseded by it.
- `EFFECT_REPAIRS` take every earlier Lunge note to the new text.
- The migration and `TRG_SCHEMA_VERSION` are at 3.705.0.

**Harness:**

- New `verify/mutate-lunge-actions-3705`.
- `verify/mutate-lunge-3704` updated.
- Source anchors widened: `verify-block5-core` G1, `verify-block6-core` C10, `verify-fixes-3669-1` C4, `verify-ea-block3b-core` W24, `verify-it-fixes-3668-1` C7.
- Pins raised to 3.705.0.

### Testing

- `verify-lunge-actions-3705`: 65 checks pass. R reproduces a Trip at 30 ft that used to go ahead.
- `mutate-lunge-actions-3705`: 26 of 26 caught. `verify-lunge-3704`: 70. `mutate-lunge-3704`: 24 of 24.
- **Core, every one of the 775 scripts run:**
  - The first sitting reached 471 passes before it was stopped for the Disarm change. Its only failures were the five widened anchors' pairs.
  - The second sitting re-ran the remaining scripts and everything touched since: 355 of 355 pass, including the whole-tree checks and `verify-checks-read-source`.
  - `mutate-fixes-3685-3b` and `mutate-checks-read-source`: see the release notes.
- **Modules:** Pillars of Faith 0.12.6, Inner Tempest 1.0.4 and Eldritch Arts 0.17.2 give identical results on 3.705.0 and on 3.703.1. 90 run, 74 pass, and the same 16 fail on both.
- **Live Foundry:** not yet run for 3.705.0.

### Delivery

- **Version:** 3.705.0
- **Branch:** `fix/feat-lunge` (local, not pushed)
- **Package:** `trg-prime.zip`
- **Outstanding:**
  - Lunging Stance's Attack of Opportunity reach is still not automated.
  - The compendium feat descriptions wait for Graham's amended Lunge wording.

---

## R-0004 — Lunge, revised: the Reach trait whole, no −1

### Repair identification

- **Date:** 20–21 November 2026
- **Reference:** R-0004, following R-0003
- **Feature:** Lunge, and Lunging Stance's negation
- **Reported:** Graham revised the feat: "the Lunge feat should apply the reach trait rather than a -1 circumstance penalty". New text: "… This action gains the reach trait for that Strike." (the −1 sentence removed).
- **Ruling:** asked whether the Reach trait's −2 then applies, he chose "Reach −2 at extra 5 ft". This supersedes R-0002's "-1 only for lunge".

### Source state

- **Starting version:** 3.705.0, on branch `fix/feat-lunge` at `cff1539`.
- **Working tree:** clean.
- **Remote:** unchanged.

### Diagnosis

- **Expected:** a Lunge gains the Reach trait. That means +5 ft, no penalty against a foe within normal reach, and −2 in the extra 5 ft. Lunging Stance negates that −2.
- **Actual (3.705.0):** a Lunge took −1 at any distance and never the Reach −2. The feat's text and notes printed the −1.
- **Relevant files:**
  - `lungeStrikeTerms` (`combat/action-feats.mjs`)
  - `actionReachVerdict` (`combat/action-reach.mjs`)
  - the waiver's use in `resolveAction`, `rollWeaponAttack` and the Charge Strike
  - the Lunge item's description and the two note effects

### Implementation

**Code:**

- `lungeStrikeTerms` returns no modifier row; `waiveReachPenalty` is set only in Lunging Stance.
- `actionReachVerdict` gives −2 whenever the reach is extended.
- `resolveAction` skips the row when the Lunge's stance waives it.
- `rollWeaponAttack` and Charge pass the waiver on, and no longer always set it.
- Cards and comments are reworded.

**Data:**

- `system.description` is Graham's text (`lunge-description-3705-1`, plus a `PACK_REPAIRS` row for owned copies).
- Two note fixes; the earlier rows are retired with `supersededBy`.
- `EFFECT_REPAIRS` take every earlier note straight to the new one.

**Migration:** the pack-copy and owned-effect passes and `TRG_SCHEMA_VERSION` are at 3.705.1.

**Harness:**

- `verify/mutate-lunge-3704` and `verify/mutate-lunge-actions-3705` updated.
- Three mutation files' pack-copy gate anchors raised.
- Pins raised to 3.705.1.

### Testing

- `verify-lunge-3704`: 72 pass. `mutate-lunge-3704`: 24 of 24 caught.
- `verify-lunge-actions-3705`: 66 pass. `mutate-lunge-actions-3705`: 27 of 27 caught.
- `apply-data-fixes`: 3 applied; the 25 refusals are pre-existing.
- **Core, 495 scripts:** every script reading a changed file or carrying a pin, plus the whole-tree checks and `verify-checks-read-source`. **495 of 495 pass.**
- The two long mutation files are recorded in `release-notes-3.705.1.md`.
- **Modules:** not re-run. Nothing they call changed since 3.705.0's comparison, which was identical to 3.703.1.
- **Live Foundry: passed** on 21 November 2026 in the "Test" world (`live-testing-report-3.705.1.md`):
  - the migration repaired a stale Lunge's text and notes;
  - a plain Trip at 10 ft was refused;
  - a Lunge Trip at 10 ft went through at −2 (no −1);
  - a Lunge Strike at 10 ft took −2, and none against an adjacent foe;
  - in Lunging Stance, no penalty;
  - a Lunge Trip at 15 ft was refused;
  - no console errors.

### Delivery

- **Version:** 3.705.1
- **Branch:** `fix/feat-lunge` (local, not pushed)
- **Package:** `trg-prime.zip`
- **Outstanding:** Lunging Stance's Attack of Opportunity reach is still not automated.

---

## R-0005 — Four defects found by the player-perspective live test

### Repair identification

- **Date:** 21 November 2026
- **Reference:** R-0005, following R-0004
- **Feature:** Lunge's card after an action feat; Coup de Grace's card; Reactive Disarm; Disarm Block's card
- **Reported:** found, not reported. Graham asked: "Okay can you now test everything that you have not. Including tests from a player perspective. Please use PC Tester profile for this." The pass is `live-testing-report-3.705.1-player.md`.

### Source state

- **Starting version:** 3.705.1, on branch `fix/feat-lunge` at `0463a95`.
- **Working tree:** clean. Work is on the new branch `fix/live-test-3705-2`.
- **Remote:** unchanged; nothing pushed.

### Diagnosis

- **A, Lunge card:**
  - *Expected:* a Lunge made with an action feat posts the Lunge card, as a Lunge Strike or Trip does.
  - *Actual:* no card. The Combat Grapple, Distracting Strike, Quick Draw and Vital Strike handlers return nothing, which `runLunge` reads as "cancelled". The Reach trait and its −2 were applied correctly.
- **B, Coup de Grace:**
  - *Expected:* the card names the severity, or "no critical" against a critical-immune target.
  - *Actual:* "[object Object] critical". The template predates 3.548.0, which made the critical an object and kept it against immune targets.
- **C, Reactive Disarm:**
  - *Expected:* the button attempts the Disarm.
  - *Actual:* `TypeError: game.user.updateTokenTargets is not a function` (V14), so the reaction could never be taken.
  - *Also:* the card and the once-a-round frequency were marked before the Disarm was tried, so a refusal (3.705.0's reach check) would have used them up.
- **D, Disarm Block:**
  - *Expected:* nothing claims a grab that didn't happen.
  - *Actual:* the "turns the blow and grabs for the weapon" card was posted before the Disarm was refused for reach.
- **Relevant files:**
  - `combat/action-feats-workflow.mjs`
  - `combat/coup-de-grace.mjs` and `combat/action-workflow.mjs`
  - `combat/reactive-disarm-workflow.mjs`
  - `combat/reaction-feats-workflow.mjs`

### Implementation

**Code:**

- `struckOrNull(checks)` is returned by the four feat handlers.
- `coupDeGraceHitLine(result, immune)` builds the card's line.
- Reactive Disarm targets with `Token#setTarget`. It marks the card and the round only when `reactiveDisarmTaken(result)`, and re-enables its button otherwise.
- Disarm Block tries its Disarm first, and posts its card only after one that happened.

**Data:** none. **Migration:** none. The schema and gates stay at 3.705.1.

**Harness:**

- new `verify-live-findings-3705-2` (32) and `mutate-live-findings-3705-2` (12);
- `verify-lunge-actions-3705` E8 and two `mutate-lunge-actions-3705` anchors re-anchored, intent unchanged;
- version pins raised to 3.705.2.

### Testing

- `verify-live-findings-3705-2`: 32 pass. `mutate-live-findings-3705-2`: 12 of 12 caught.
- **Core:** 158 verify scripts and 111 mutation scripts (every script reading a changed file or carrying a pin, plus the whole-tree checks, including `verify-checks-read-source`). **All pass**, including the two long mutation files, `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (50 min).
- **Modules:** the four module scripts that read the action workflow give the same results as on 3.703.1.
- **Live Foundry:** not yet run for 3.705.2.

### Delivery

- **Version:** 3.705.2
- **Branch:** `fix/live-test-3705-2` (local, not pushed)
- **Package:** `trg-prime.zip`
- **Outstanding** (observations, need a ruling or a separate repair):
  - the Whip's adjacent Trip;
  - Combat Grapple doesn't apply Grabbed;
  - Lunge's "1 AP" tooltip;
  - reaction offer cards are readable by the attacking player;
  - a weapon feat spends its AP before its Strike is checked;
  - Lunging Stance's Attack of Opportunity reach.

---

## R-0006 to R-0011 — Graham's answers to the player-perspective live test (3.706.0)

These six repairs went into one release, 3.706.0, so they share a source state, a test run and a delivery. Each has its own diagnosis and change below.

### Source state

- **Starting version:** 3.705.2, on branch `fix/live-test-3705-2` at `23d1ed2`. It has not been installed or live-tested.
- **Working tree:** clean. Work is on the new branch `fix/live-test-rulings`.
- **Remote:** unchanged; nothing pushed.
- **Rulings:** Graham, 21 November 2026, answering the questions of R-0005's report:
  1. "Free hand"
  2. "Yes"
  3. "Yes"
  4. "No"
  5. "Please automate and players should not be able to read this card"

### R-0006 — The Whip's adjacent Trip

- **Ruling:** 1, "Free hand".
- **Expected:** the Whip "Can't be used against adjacent creatures". Graham's ruling: a Trip against an adjacent foe is made with a free hand.
- **Actual:** made "with Whip" (`maneuverWeapon` took the first equipped Trip-trait weapon), with its −4 for an exotic weapon.
- **Change:**
  - `maneuverWeapon(items, trait, { adjacent })` passes over a `noAdjacent` weapon when the target is adjacent.
  - `resolveAction` measures adjacency (`targetAdjacent`: 5 ft or less, positional automation on) and hands it to the check.

### R-0007 — Combat Grapple applies Grabbed

- **Ruling:** 2, "Yes".
- **Expected:** a hit Grabs the target until the end of the grappler's next turn or an Escape.
- **Actual:** the card said so; nothing was applied.
- **Change:**
  - `combatGrappleGrab` (pure) gives the grab and its clock.
  - The handler lays Grabbed on the creature struck (`check.strikeTarget`, newly returned by `rollWeaponAttack`) through `applyBasicActionConditionEffects`, and records grabbed-by.
  - The card names the creature, and says when it couldn't be Grabbed.

### R-0008 — A player's conditions on the GM's creature

- **Found:** reproducing R-0007 live as PC Tester (3.705.1 installed). A successful Grapple Attack on ZZ Foe laid Grabbed (the toggle relays, 3.666.1), then threw "User PC Tester lacks permission to update ActiveEffect [VRd6sKfT8XezWOA6] in parent ActorDelta [wLo5jLR45eV7FbcN]". No outcome card was posted, no clock was stamped, and grabbed-by was not recorded.
- **Expected:** the condition, its clock and who laid it, as when the GM acts.
- **Actual:** the clock and conditionals were stamped, and `grabbedBy` and `flatFootedFrom` written, from the player's client. The same affected Feint, Create a Diversion, and both Grab strikes made by a player's creature.
- **Change:**
  - `applyBasicActionConditionEffects` hands the target's share to the GM's client when this client may not write it (`relayConditionsNeeded`; new request `CONDITION_EFFECTS`), and lays it there with `direct`.
  - `recordInflictedBy` writes grabbed-by and flat-footed-from directly or through the GM's client (`INFLICTED_BY`). The GM's client builds the record and requires the condition.
  - Both requests are accepted only for a creature the asking player owns.

### R-0009 — Strike feats pay when their Strike is made

- **Ruling:** 3, "Yes".
- **Expected:** a Strike feat whose Strike is refused costs nothing.
- **Actual:** `runActionFeat` spent the feat's AP before the attack workflow could refuse its Strike (Vital Strike at 15 ft: 2 AP gone, "No Strike was made").
- **Change:**
  - `paysAtStrike` names the feats whose handler is a Strike.
  - `runActionFeat` doesn't spend for them.
  - `strikePlan` gives `rollWeaponAttack` a `commitCost` that spends the feat's AP once, after every refusal, where a Strike's own AP is spent.
  - The card adds "No AP was spent." when none was.
  - Quick Draw puts the weapon back (`quickDrawRestore`) when its Strike is refused.

### R-0010 — Lunging Stance's Attacks of Opportunity

- **Ruling:** 5, "Please automate".
- **Expected:** in the stance, an Attack of Opportunity reaches as far as a Lunge would.
- **Actual:** not automated (left to the table since R-0001).
- **Change:**
  - `lungingStanceThreatExtension` (pure) and `opportunityReachOf` decide how far a reactor threatens; the provoking measurements read it.
  - A Charge and a Strike still read `reachOf`.
  - The stance's card says so.

### R-0011 — Reaction offers hidden from the players they're not for

- **Ruling:** 5, "players should not be able to read this card".
- **Expected:** a reaction offer is read by the GM and the reactors' own players only.
- **Actual:**
  - The offers raised by a player's move or attack were created on the player's client, and a whisper's author reads it.
  - Reactive Disarm and Savage Jaw weren't whispered at all.
- **Change:**
  - `postOfferCard` (`combat/offer-card.mjs`) whispers to `offerRecipients` (GMs, and the reactors' owners). It creates the card here only when this client is a reader; otherwise the GM's client creates it (`OFFER_CARD`, fire and forget).
  - Used by:
    - Attacks of Opportunity, and "nobody in reach can answer";
    - the reaction feats;
    - creature reaction moves;
    - Knife Flurry (read by the GM and the wielder's own players);
    - Swift Pursuit;
    - Reactive Disarm and Savage Jaw.

### Not changed

- **Lunge's tooltip** (ruling 4, "No").

### Testing

- `verify-live-rulings-3706`: 62 pass. `mutate-live-rulings-3706`: 29 of 29 caught.
- **Re-anchored, intent unchanged:**
  - `verify-block4-core` E8;
  - `verify-ff30-codex` B21;
  - `verify-ff30-block19` S1;
  - `verify-ff30-block24` S4;
  - `verify-quick-draw-3702` D6;
  - `verify-session-decisions-1015` D5;
  - their mutation anchors.
- **Core:**
  - Scope: every script reading a changed file or carrying a pin, plus the whole-tree checks.
  - 246 verify scripts and 206 mutation scripts, plus `verify-checks-read-source`, `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (50 min). **All pass.**
  - Two mutation anchors went stale and were re-anchored, then passed:
    - `mutate-fixes-3692-0`: the asker-owns line now appears in three relay cases;
    - `mutate-live-findings-3705-2`: Quick Draw's card tail.
  - Knife Flurry's readers were corrected afterwards, and the seven scripts reading it re-ran and pass.
- **Modules:** the 21 module verify scripts that read a changed core file give the same results as on 3.703.1. The failures are the modules' own version pins and a missing local book file, as before.
- **Live Foundry:** not yet run for 3.706.0.

### Delivery

- **Version:** 3.706.0
- **Branch:** `fix/live-test-rulings` (local, not pushed)
- **Package:** `trg-prime.zip`

---

## R-0012 and R-0013 — What the 3.706.0 live test found (3.706.1)

### Source state

- **Starting version:** 3.706.0 (installed by Graham, live-tested in the Test world), on branch `fix/live-test-rulings` at `24dcce5`.
- **Working tree:** clean. Work is on the new branch `fix/live-test-3706-1`.
- **Remote:** unchanged; nothing pushed.
- **Report:** `live-testing-report-3.706.0.md`

### R-0012 — Combat Grapple's clock

- **Found:** live test L6. A Combat Grapple hit in round 1 stamped Grabbed to expire at round 2. A Grapple Attack in the same round (L7) stamps round 3.
- **Expected:** "Until the end of your next turn", two rounds on the clock, as `extractDurationRounds` reads it for every action.
- **Actual:** `combatGrappleGrab` (3.706.0) gave round + 1. This was introduced by R-0007.
- **Change:** round + `UNTIL_END_OF_NEXT_TURN_ROUNDS` (2).

### R-0013 — An Attack of Opportunity thrown

- **Found:** live test L11. The player moved from adjacent to 15 ft, and the foe's Attack of Opportunity (the GM's button) was made "Club — Attack (thrown) … thrown 15 ft … Threw Club — that was the last one".
- **Expected:** an Attack of Opportunity is a melee Strike. The provoker was in reach when it provoked.
- **Actual:** `thrownByDistance` read the current distance even with `reachAlreadyEstablished`. This predates 3.706.0.
- **Change:** `thrownByDistance` requires `!reachAlreadyEstablished`.

### Testing

- `verify-live-fixes-3706-1`: 11 pass. `mutate-live-fixes-3706-1`: 4 of 4 caught.
- `verify-live-rulings-3706` B1's expectation, and its mutation anchor, updated for the new clock.
- **Core:** every script reading a changed file or carrying a pin, plus the whole-tree checks: 189 verify and 141 mutation scripts, plus `verify-checks-read-source`, `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (52 min). **All pass.**
- **Modules:** the six module verify scripts that read a changed core file give the same results as on 3.703.1.
- **Live Foundry:** 3.706.0's results are in `live-testing-report-3.706.0.md`. 3.706.1 itself: after install.

### Delivery

- **Version:** 3.706.1
- **Branch:** `fix/live-test-3706-1` (local, not pushed)
- **Package:** `trg-prime.zip`
