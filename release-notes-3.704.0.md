# TRG Prime 3.704.0: Lunge strikes at reach

20 November 2026. Follows 3.703.1. Branch `fix/feat-lunge`.

## Lunge didn't reach anyone

**The book (Chapter 5):**

> **LUNGE** · MARTIAL ROGUE. You can strike foes that would normally be out of reach. Prerequisites BAB +2. Requirements You are wielding a melee weapon. Using your melee weapon, you may take an action with the attack trait. This action gains the reach trait for that Strike. This strike is subject to a -1-circumstance penalty.

**Graham, 20 November 2026:** "The Lunge feat does not work correctly."

**What was wrong:** Lunge's Use button only queued a −1 tick-box for the next check and posted a card. No Strike gained the Reach trait, so the attack workflow's reach gate still measured the sword's ordinary 5 ft. A foe 10 ft away was refused as "beyond reach", which is the one thing Lunge exists to allow. The −1 also had to be ticked by hand, and it waited for any next check, not just the Lunge Strike.

## Now

- **Use is the Strike.** Lunge's Use makes a Strike with a wielded melee weapon. The Strike has the Reach trait, so:
  - it reaches 5 ft further (10 ft for a Medium creature, 15 ft for a Large one);
  - the Reach trait's own −2 applies when the target is in that extra 5 ft, as it does for a glaive;
  - Lunge's −1 circumstance applies to the Strike, near or far.
- **Which weapon:** any held melee weapon that isn't a natural attack and doesn't already have Reach. If you have one, there's no question. If you have several, you're asked which. A Thrown dagger is struck, not thrown, inside the Lunge's reach.
- **Refused, with the reason:**
  - nothing melee in hand: "you must be wielding a melee weapon";
  - only Reach weapons in hand: they "already have the Reach trait, so Lunge adds nothing. Use Strike."
- **AP:** the Strike's own 1 AP, charged by the Strike. A foe still out of reach (15 ft for a Medium lunger) is refused before anything is spent. Fight Defensively's paid Strike and the off-turn GM authorisation apply as for any Strike.
- **The multiple attack penalty:** it's one ordinary Strike. It takes the current penalty and adds one to the count.

## Lunging Stance negates Lunge's penalties

> "...any penalties associated with performing standard Lunge strikes are completely negated."

While the stance is up, a Lunge has no −1 and no Reach −2. This is read from the stance's own effect. A stance entered before this release counts too. The feat's always-on note effect, which has the same name, does not count. The stance's card and note no longer tell you to skip a queued −1 by hand.

## Readings to confirm

- **L1. Lunging Stance and the Reach −2.** I read "any penalties associated with … Lunge strikes" (plural) as both the −1 and the Reach trait's −2 that the Lunge brings. The other reading is that only the −1 goes, so a stance Lunge at 10 ft is still at −2.
- **L2. Natural attacks.** A fist or claw isn't offered, read as not a "melee weapon" you are "wielding". If a monk or a beast should be able to Lunge with the Unarmed Strike or a natural attack, it is one line to change.
- **L3. Other actions with the Attack trait.** The printed rule allows "an action with the attack trait". This release covers the Strike. Lunge with Trip, Disarm, Shove or a feat Strike such as Vital Strike isn't offered yet. The engine part (a trait granted for one Strike, `grantTraits` on `rollWeaponAttack`) is in place for it.

## Found, not changed

- **Lunging Stance's Attack of Opportunity reach.** "You extend the reach of your Strike by 5 feet" for an Attack of Opportunity isn't automated. It is only a line on the stance's card: the AoO offer still measures the ordinary reach. It's a separate rule, so it is left for your call.

## Code

- `combat/attack.mjs`: `traitsWithGranted`, a weapon's trait line with traits added for one Strike.
- `combat/attack-workflow.mjs`: two new `rollWeaponAttack` options. `grantTraits` is applied to `weaponData` before reach, the card and every trait reader see it. `waiveReachPenalty` skips the Reach −2 row. Both are no-ops by default.
- `combat/action-feats.mjs`: Lunge in `ACTION_FEATS`, with the `meleeWeapon` requirement and `strikePays`, and three pure helpers: `lungeWeapons`, `lungingStanceActive` and `lungeStrikeTerms`.
- `combat/action-feats-workflow.mjs`:
  - `strikePlan` passes the grant and the waiver, and lets a `strikePays` Strike charge its own AP;
  - `runActionFeat` asks Lunge's weapon first and spends nothing itself;
  - `chooseLungeWeapon` and `RUN.lunge` are new.
- `feats-workflow.mjs`: the old tick-box handler is removed. It would have overridden the table's, being later in the object. Lunging Stance stamps `lungePenaltiesNegated` on its effect.

## Data and migration

- **Pack:** two declared fixes in `tools/data-fixes.json` (`lunge-note`, `lunging-stance-note`). They update the note effects' descriptions, and only the `feats` pack changes. The pack was rebuilt from the 3.703.1 files plus these two fixes.
- **Owned copies:** matching `EFFECT_REPAIRS` rows. The owned-effect migration is re-gated to 3.704.0. It matches the old value, so a GM's own edit is kept, and a second run writes nothing.

## Migration schema

`TRG_SCHEMA_VERSION` is raised to 3.704.0, because the stamp must equal the newest pass. A world at 3.703.1 is offered the migration once.

## Harness

- **New:** `verify-lunge-3704` (66 checks; section R reproduces the defect) and `mutate-lunge-3704` (23 mutations, all caught).
- **Re-anchored to the reshaped lines.** What each guards is unchanged:
  - `verify-chapter6-gear-151-160` G6 and H3;
  - `verify-skirmish-3700` C4 and E4;
  - `verify-session-faults-1014` F6b.
- **Schema anchors raised to 3.704.0:** `mutate-dedicated-rows`, `mutate-defence-lists`, `mutate-drive-3622`, `mutate-focus-default`, `mutate-joint-audit-3699`, `mutate-live-fixes-3-627-1` and `mutate-movement-trait-3700`.
- **Version pins** raised to 3.704.0.

## Testing

**Core, all 773 scripts run:**

- 441 ran under `tools/regression-suite.mjs` (all pass).
- The other 332 ran one by one with the same environment, because the runner couldn't get past this cloud session's time limits. Of those, 316 passed on the first pass and 16 failed: 8 verify/mutate pairs.
- All 16 came from this change. Six pairs were the migration stamp, which wasn't raised with the re-gate (now fixed above). Two pairs were source anchors on the reshaped lines.
- After the fixes, these were re-run and all pass:
  - every script that reads `migration.mjs`, the action-feat files or the schema stamp (70 scripts, plus the three re-anchored mutation files);
  - the whole-tree checks: `verify-no-undefined-names` (828 files), `verify-rules-have-callers` (505 uncalled, backlog unchanged), `verify-checks-can-fail`, and `verify-checks-read-source` (1,722 pairs).
- Earlier core results were not re-run after the final edits, which were comments, the schema constant and harness anchors.

**Modules:** Pillars of Faith 0.12.6, Inner Tempest 1.0.4 and Eldritch Arts 0.17.2 (from its release zip) were run against this core and against the untouched 3.703.1 core.

- The results are identical script for script: 90 run, 74 pass on both, and the same 16 fail on both.
- **Pillars of Faith:** 9 of its 11 verify files pin the module's version, 0.12.5 against its own 0.12.6.
- **Inner Tempest:** block 5 is blocked (book text); `mutate-block8` is a known module-side survivor.
- **Eldritch Arts:** `verify-block10` / `mutate-block10`, `mutate-block10b` and `mutate-book-extract` fail identically on both cores.
- Fiends & Fables, Codex, Dreams & Shadows and Echoes of Steel were not run. Lunge touches no creature data.

**Live Foundry: not run.** Your installation is 3.703.1, and installing this build needs your go-ahead. The full Strike with tokens on a canvas still needs a live check:

- a Medium fighter with a longsword strikes a foe 10 ft away: −1 and −2 on the card, 1 AP, the MAP advanced;
- the same foe at 15 ft: refused with no AP spent;
- the same 10-ft Lunge in Lunging Stance: no penalties;
- a glaive alone: refused with the reason.

## Pack integrity

- The `feats` pack was rebuilt from the 3.703.1 files plus the two declared fixes. A record-by-record diff against 3.703.1 shows exactly two changed records (the two note effects, `description` only), with every ID unchanged.
- The other 30 packs are byte-identical to 3.703.1.
- 31 packs declared and 31 on disk, with document counts identical to 3.703.1.
- An empty `packs/specific-weapons` shadow folder, created when a test opened a pack that doesn't exist, was removed. No LOCK files.
