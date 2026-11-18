# TRG Prime 3.698.0–3.698.2 — live testing report

18 November 2026, Test world (`test`), Gamemaster, Foundry V14, system **3.698.2**. Migrated from 3.697.0. Test actors were all named "ZZ Audit …" and all deleted afterwards. World time was put back to 0. The world's three own actors were not touched.

| # | Check | How | Result |
|---|---|---|---|
| 1 | Migration 3.697.0 → 3.698.2 | Before clicking Migrate, three characters were given a Flame Blade: one as 3.697.0 left it (30 feet, 1 creature, no rows), one with 3.698.1's row, one with a hand-edited row | **Pass.** Schema 3.698.2. The first copy lost its range and targets and gained the marked blade row. The second copy gained the mark. The hand-edited copy was left alone and listed as "Left alone" in the migration's chat report. |
| 2 | Level drop (U1) | Fighter 1 → 13 one level at a time, XP set to 8th, then back to 13th | **Pass.** Notice: "ZZ Audit Fighter drop — Granted above level 8, removed: Unbreakable Resolve, Weapon Supremacy." Both abilities came back at 13th, and the item list matched the first time at 13th. |
| 3 | Advancement sweep | `trgAdvancementSweep` on Druid, Fighter, Ranger, Rogue and Crusader (the five that kept higher-level abilities on 3.697.0), 1 → 20 → 1 | **Pass.** 0 orphans (3.697.0 had 9), 0 table mismatches, 0 duplicates, 0 errors, 0 dialogs. |
| 4 | Ability Enhancement (R7) | A 5th-level master's Owl, three copies, each Used choosing Dexterity | **Pass.** The first two cards read "Dexterity +1 (1 of 2 at level 5)" and "(2 of 2 at level 5)". The third was refused: "at level 5 a familiar may have 2 (one per four levels), and 2 already chosen." Dexterity "Other" +2. |
| 5 | Flame Blade cast | Wizard 5 (Spellcraft 5, attack bonus 2, not proficient with a shop Scimitar), dice fixed at 18, through the real dialogs | **Pass.** Dialogs were Warp, then Casting Conditions, then Cast, with no target asked. 6 PP spent. A conjured Scimitar appeared: 1d6, fire, Spellcraft −2, `casterProficient`. **Two faults** (see below). |
| 6 | Flame Blade strike | Equipped; attack with the d20 fixed at 12 | **Pass.** Total 15: "BAB and ability +2", "Spellcraft 5 −2 in place of attack bonus 2 +1". **No "Non-proficient" row.** |
| 7 | Flame Blade damage | Damage roll | **Pass.** "6 Fire damage (1d6)". A critical reads the damage type, and the fire critical table exists. |
| 8 | Flame Blade expiry | World time advanced 61 seconds | **Pass.** The blade and the spell's effect were both gone. |

## Faults found, fixed in 3.698.3

1. **"Customise Scimitar" opened on cast.** The add-a-weapon Customise dialog (quality, materials, runes) opened for the conjured blade. It does the same for Eldritch Weapon and Shadow Weapon. Fixed: a conjured weapon is never offered for customising.
2. **The cast card read "Scimitar of pure force — fire damage".** Fixed: now "Scimitar (Flame Blade) — fire damage (1 minute)".

Also corrected in the notes: the conjured item is named **Scimitar**, not "Flame Blade".

## 3.698.3 re-test (18 November, 09:35)

Installed 3.698.3. No migration was offered, which is correct: the schema stays at 3.698.2. Wizard 5, dice fixed at 18.

| Check | Result |
|---|---|
| Cast Flame Blade | **Pass.** No Customise dialog. Card: "ZZ Audit FB Wizard: Scimitar (Flame Blade) — fire damage (1 minute)." |
| Cast Eldritch Weapon | **Pass.** The Shape the Weapon dialog as before, then no Customise dialog. Card unchanged: "Morning Star of pure force — force damage (1 minute)." |
| A Scimitar from the weapons pack added by hand | **Pass.** Customise Scimitar still opens (cancelled). |

The test actor was deleted. World time 0, and the world's 3 actors are untouched.
