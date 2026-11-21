# TRG Prime — Changelog

The full notes for every release are in `release-notes-<version>.md` beside this file; this changelog summarises from 3.697.0 onward.

## 3.707.1 — 21 November 2026: "until the start of your next turn", and Stone Shield's one foe

Branch `fix/next-turn-start-clock`, from 3.707.0. Full notes in `release-notes-3.707.1.md`; repair log R-0015, R-0016.

- **"Until the start of your next turn"** ends when the caster's next turn starts, on every creature carrying it (Graham: "should end at the beginning of the characters turn"). It used to end at the next round's top or at the bearer's own turn. Covers Gust, Guidance, Invulnerability, Stone Shield, True Target and Weapon Surge, and any module spell with that duration. Out of combat: 6 s, as before.
- **Stone Shield** raised from the sheet needs exactly one targeted enemy ("Yes it should"). Refused before anything is spent; no target is refused too, where it used to spend its PP for nothing.
- **Data:** one pack record (`foes: 1`); owned copies, including 3.707.0's, repaired; migration re-gated to 3.707.1.
- **Harness:** new `verify-turn-start-clock` (29) / mutate (17); `verify-stone-shield` updated; pins raised.

## 3.707.0 — 21 November 2026: Stone Shield, fully implemented

Branch `fix/spell-stone-shield`, from 3.706.1. Full notes in `release-notes-3.707.0.md`; repair log R-0014.

- **The shield is real:** a miss by 1–4 from the chosen foe (Strike, spell attack, bomb, Spiritual Weapon) strikes it. Hardness 8 comes off, then the 15 Hits. At 0 the spell ends.
- **Offered as a reaction when attacked**, as Nimble Dodge is, and cast against the attacker. From the sheet, the cast asks about earth or stone and is refused on No before anything is spent.
- **The GM's "Damage the shield" button** takes area damage, or anything else, by hand (Graham's ruling). The +4 stays DB only, as printed.
- **Spiritual Weapon** now reads the defender's DB bonuses (it ignored every ward and `defenceDC` row).
- **Data:** one pack record changed; owned copies repaired (including pre-3.406.0 copies, which gave +4 against everyone); migration re-gated to 3.707.0.
- **Harness:** new `verify-stone-shield` (64) / mutate (23); 9 checks and 2 mutation anchors re-anchored; pins raised.

## 3.706.1 — 21 November 2026: what the 3.706.0 live test found

Branch `fix/live-test-3706-1`, from 3.706.0. Full notes in `release-notes-3.706.1.md`; repair log R-0012, R-0013; live report `live-testing-report-3.706.0.md`.

- **Combat Grapple's Grabbed** lasts as long as a Grapple Attack's: two rounds on the clock, not one.
- **An Attack of Opportunity** with a Thrown-trait weapon is a melee Strike, never a throw, even once the provoker has moved beyond reach.
- **Harness:** new `verify-live-fixes-3706-1` (11) / mutate (4); one expectation updated; pins raised. No data or migration change.

## 3.706.0 — 21 November 2026: Graham's answers to the player-perspective live test

Branch `fix/live-test-rulings`, from 3.705.2. Full notes in `release-notes-3.706.0.md`; repair log R-0006 to R-0011.

- **Whip, adjacent Trip:** made with a free hand ("Free hand"), not the Whip.
- **Combat Grapple** applies Grabbed on a hit, with its clock and the grabbed-by record ("Yes").
- **A player's conditions on the GM's creature** (found reproducing the above): the clock, the conditionals and who laid them are written by the GM's client. A player's Grapple used to throw a permission error and lose its outcome card.
- **Strike feats pay when their Strike is made** ("Yes"): no AP for a refused Strike or a cancelled choice. Quick Draw puts the weapon back.
- **Lunging Stance:** Attacks of Opportunity threaten as far as a Lunge reaches ("Please automate").
- **Reaction offers** are read only by the GM and the reactors' own players, and created by the GM's client when need be ("players should not be able to read this card"). Reactive Disarm and Savage Jaw are no longer public.
- **Lunge's tooltip:** unchanged ("No").
- **Harness:** new `verify-live-rulings-3706` (62) / mutate (29); eight checks re-anchored; pins raised. No data or migration change.

## 3.705.2 — 21 November 2026: the player-perspective live test's findings

Branch `fix/live-test-3705-2`, from 3.705.1. Full notes in `release-notes-3.705.2.md`; repair log R-0005; live report `live-testing-report-3.705.1-player.md`.

- **Lunge with an action feat** (Vital Strike, Distracting Strike, Combat Grapple, Quick Draw) now posts its Lunge card. It doesn't when the feat's Strike was refused.
- **Coup de Grace** prints the critical's severity, not "[object Object]". Against a critical-immune target it says "no critical".
- **Reactive Disarm** works in V14: the button threw on `game.user.updateTokenTargets`. The reaction is now used up only when the Disarm was actually taken, not when it was refused for reach or cancelled.
- **Disarm Block's** card follows its Disarm, so a refusal for reach no longer leaves "grabs for the weapon" in the log.
- **Harness:** new `verify-live-findings-3705-2` (32) / mutate (12); one check and two mutation anchors re-anchored; pins raised. No data or migration change.

## 3.705.1 — 20 November 2026: Lunge, revised

Branch `fix/feat-lunge`, from 3.705.0. Full notes in `release-notes-3.705.1.md`; repair log R-0004.

- **Graham's revised Lunge:** the action gains the Reach trait, with no −1. Asked, he chose the Reach trait whole: −2 at the extra 5 ft, none against an adjacent foe. Lunging Stance negates the −2. This replaces "-1 only for lunge".
- **Data and migration:** the feat's text is now Graham's wording, and both notes are reworded, in the pack and on owned copies. Both migration passes and the schema are at 3.705.1.
- **Harness:** `verify-lunge-3704` (72) / mutate (24); `verify-lunge-actions-3705` (66) / mutate (27); pins raised.

## 3.705.0 — 20 November 2026: reach for every attack action, and Lunge with any of them

Branch `fix/feat-lunge`, from 3.704.1. Full notes in `release-notes-3.705.0.md`; repair log R-0003.

- **Reach check (new; Graham: "Add reach check + Lunge"):** Trip, Shove, Disarm, Grapple, Shield Bash, Aid and Coup de Grace are refused, before any AP is spent, when the target is out of reach. They used to work at any distance.
  - Trip, Shove and Disarm use a trait weapon's reach.
  - A creature you already hold can always be Grappled.
  - Coup de Grace needs adjacency.
  - A reach weapon's −2 applies at the extended distance.
  - Disarm uses reach as a reaction too ("Yes disarm does use reach"). Guardian Defence's Aid and Offensive Parry's Shove are exempt; Escape is not measured.
- **Lunge** now asks which action: Strike, Double Slice, Charge, the manoeuvres, Shield Bash, Aid, Improvised Attack, or the action feats you have. It reaches 5 ft further at −1. Natural attacks can Lunge (rulings L2 and L3).
- **Data and migration:** Lunge's note reworded; the migration and schema are at 3.705.0.
- **Harness:** new `verify-lunge-actions-3705` (65) / `mutate-lunge-actions-3705` (26); 3.704 pair updated; five source anchors widened for the new `reachExempt` option and the Lunge scope.

## 3.704.1 — 20 November 2026: Lunge is −1 only

Branch `fix/feat-lunge`, from 3.704.0. Full notes in `release-notes-3.704.1.md`; repair log R-0002.

- **Graham's ruling ("-1 only for lunge"):** a Lunge's only penalty is its −1. The Strike gains Reach's +5 ft but never the Reach trait's −2. Lunging Stance removes the −1. Other reach weapons keep their −2.
- **Data and migration:** the two note effects are reworded in the pack and on owned copies (from 3.703.1 or 3.704.0 wording). The 3.704.0 fix rows are retired by `supersededBy`, which `apply-data-fixes` now honours on effect edits too. The migration and schema are at 3.704.1.
- **Harness:** `verify-lunge-3704` (70) / `mutate-lunge-3704` (24); pins raised to 3.704.1.

## 3.704.0 — 20 November 2026: Lunge strikes at reach

Branch `fix/feat-lunge`, from 3.703.1. Full notes in `release-notes-3.704.0.md`; repair history in `TRG_PRIME_REPAIR_LOG.md` (R-0001).

- **Lunge** now makes the Strike. It uses a wielded melee weapon and has the Reach trait: +5 ft, with the trait's −2 in that band. Lunge's −1 circumstance applies automatically. It used to queue a −1 tick-box and nothing else, so a foe 10 ft away was still refused as out of reach. The Strike pays its own 1 AP and is refused before cost if the foe is still too far. A weapon that already has Reach is refused, with the reason.
- **Lunging Stance** negates Lunge's −1 and the Reach −2 (reading L1, for Graham).
- **Data and migration:** the Lunge and Lunging Stance note effects are corrected in the pack and on owned copies. The owned-effect migration is re-gated to 3.704.0, and the schema is stamped 3.704.0.
- **Harness:** `verify-lunge-3704` (66) / `mutate-lunge-3704` (23); `verify-chapter6-gear-151-160` G6 and H3 re-anchored.

## 3.703.1 — 20 November 2026: the armour dialog, and the donning readings confirmed

Branch `release/3.703.1`, from 3.703.0. Full notes in `release-notes-3.703.1.md`.

- **The GM's armour dialog** no longer prints the AP twice for times in rounds ("5 rounds (15 AP) (15 AP)"). Found in the 3.703.0 live test.
- **Q1 to Q3 confirmed** by Graham ("Go with your recommendations"): donning provokes; Quick Donning's printed times are not doubled for a full suit; the shorter of Quick Donning and a rune stands. Comments only.
- **Harness:** `verify-armour-change-3703` 88 checks; `mutate-armour-change-3703` 28 mutations.

## 3.703.0 — 19 November 2026: the Manipulate Attack of Opportunity, and donning armour

Branch `release/3.703.0`, from 3.702.0. Full notes in `release-notes-3.703.0.md`.

- **Attack of Opportunity for a Manipulate action** is now offered when the action is taken, not before the AP gate. A cancelled or unaffordable Interact no longer offers foes an attack (found in the 3.702.0 live test).
- **Armour** takes the chapter's time, in both directions (Graham's R1 to R5). In combat a suit is a Donning or Removing task paid over the turns, with a Continue button; out of combat it's done at once with a time card, and the clock is not advanced. A helmet, bracers or greaves is a 1 AP Interact in combat. Quick Donning's result times the next donning or removal of you or an ally. Readings Q1 to Q3 are flagged for Graham.
- **Harness:** `verify-manipulate-aoo-3703` (15) / `mutate-manipulate-aoo-3703` (6); `verify-armour-change-3703` (85) / `mutate-armour-change-3703` (26). No data or migration change.

## 3.702.0 — 19 November 2026: Quick Draw, and drawing in combat is an Interact

Branch `release/3.702.0`, from 3.701.0. Full notes in `release-notes-3.702.0.md`.

- **Quick Draw** now draws a melee or thrown weapon you aren't holding and Strikes with it, for 1 AP, without provoking (ruled). The weapon is chosen, its grip asked and a free hand checked before any AP is spent. A refused Strike leaves the weapon drawn.
- **Drawing in combat** from the sheet (or the item sheet's Equipped box) is now the Interact action: 1 AP, the Manipulate gates, and an Attack of Opportunity offer. Putting away asks Drop (Release, free) or Sheathe/Stow (Interact). A GM may just set it. Out of combat nothing changes.
- **Harness:** `verify-quick-draw-3702` (28) / `mutate-quick-draw-3702` (18); `verify-held-change-3702` (37) / `mutate-held-change-3702` (18). No data or migration change.

## 3.701.0 — 19 November 2026: the Movement trait on spells, and the Storgar

Branch `release/3.701.0`, from 3.700.0 (Skirmish). Full notes in `release-notes-3.701.0.md`.

- **Movement trait** on 34 spells: those that move the caster or a target as part of the casting (Graham's rule), plus rulings C1 and C2 of `claude/movement-trait-spell-audit.md`. Dimension Door's misprinted "Move" now reads Movement.
- **Storgar:** a friendly Movement spell cast upon a Storgar rolls the DC 5 flat check, and on a failure it does not work on them. A save against a Movement spell gets the +2 racial bonus automatically.
- **Quickened "for Move"** can now pay for Swim, Crawl, Stand, Tumble, the jumps and the other Movement-trait actions.
- **Astral Drift (ruled):** casting a Movement spell is not a movement action. No code change; a test pins it.
- **Data and migration:** 35 declared pack fixes; 34 owned-copy trait repairs and the Storgar note repair; migration re-gated to 3.701.0.
- **Harness:** `verify-movement-trait-3700` (59 checks) / `mutate-movement-trait-3700` (29 mutations); full suite core 763/763 on the merged tree, modules at baseline; `verify-joint-audit-3699` E9 is now a gate floor.

## 3.700.0 — 19 November 2026: Skirmish

Branch `release/3.700.0`, from 3.699.0. Full notes in `release-notes-3.700.0.md`.

- **Skirmish** now grants its free Step. The 1 AP arms a Step with no AP and no reactions, and posts the Strike as a button on the card, so the two can come in either order. The card's Strike keeps the Step; any other action removes whatever half is left. Any Strike, melee or ranged.
- **Harness:** `verify-skirmish-3700` (33 checks) / `mutate-skirmish-3700` (15 mutations).

## 3.699.0 — 18 November 2026: rulings from the joint Codex / Fiends & Fables audit

Branch `release/3.699.0`, from 3.698.4. Full notes in `release-notes-3.699.0.md`.

- **Mindless creatures** are never collapsed by Intelligence, Wisdom or Charisma. The Mindless ethic counts for this rule, so the Skeleton Warrior and Skeleton Champion no longer fall unconscious. Gaining the trait or the ethic re-runs the rule at once.
- **RD-03:** the Swim/Climb speed +4 applies only to the Swim and Climb actions; sheet totals match the printed blocks.
- **RD-04:** Keen Sense's +2 is on the Perception total; Acute Sense stays a row on the check.
- **RD-01:** Eternals have no Death State.
- **CO-02 / RD-08:** Oozes are immune to precision damage and disease.
- **CO-01:** a printed-range sense ("Darkvision (60 ft.)") is no longer granted a second time.
- **Data and migration:** three declared pack fixes; owned Eternal types and Ooze immunity effects repaired; migration re-gated to 3.699.0.
- **Harness:** `verify-joint-audit-3699` (34 checks) / `mutate-joint-audit-3699` (16 mutations), `verify-chapter1` 302 checks.

## 3.698.4 — 18 November 2026: version bump so Foundry offers the update

No code or data change from 3.698.3. Published so worlds on 3.698.1 or earlier see an update in Foundry. Graham asked for it on 18 November.

## 3.698.3 — 18 November 2026: two faults found by the live Flame Blade cast

Branch `audit/release-3.698.3`, from 3.698.2. Merged to `main` and published on 18 November, after a live re-test.

- **No Customise dialog for a conjured weapon.** Casting Flame Blade opened "Customise Scimitar", offering quality, materials and runes for a one-minute blade. Eldritch Weapon and Shadow Weapon did the same. `shouldOfferCustomisation` now skips any weapon a spell conjured.
- **The cast card names a fire blade correctly.** It read "Scimitar of pure force — fire damage"; it now reads "Scimitar (Flame Blade) — fire damage". Force blades keep their wording.
- **Harness:** `verify-audit-3698` / `mutate-audit-3698` now 46 checks / 35 mutations.

## 3.698.2 — 18 November 2026: the caster is always proficient with Flame Blade

Branch `audit/release-3.698.2`, from 3.698.1. Published with 3.698.3.

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
