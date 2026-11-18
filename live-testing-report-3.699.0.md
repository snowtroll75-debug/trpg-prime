# Live testing report — core 3.699.0, Codex 0.2.1, Fiends & Fables 0.46.1

18 November 2026, Graham's **Test** world (Foundry 14.367), as Testing Dude, on the builds Graham installed. Dice were fixed (`randomUniform` 0.5). All temporary actors, the scratch scene, chat cards and stored test keys were deleted afterwards. The module configuration was restored, and the world was left paused on Caves.

Installed: TRG Prime 3.699.0, TRG Prime Codex 0.2.1, Fiends & Fables Prime 0.46.1, Eldritch Arts 0.17.2, Inner Tempest 1.0.5, Pillars of Faith 0.12.5.

## Migration (3.698.2 → 3.699.0)

Three stale world copies were planted before migrating:

| Copy | Before | After the migration |
|---|---|---|
| Eternal type, `noDeathState: false` | false | **true** (reported on the migration card) |
| Ooze type, the old seven immunities | 7 rows | **9 rows**: disease and precision added; description updated |
| Ooze type, house-ruled ("mental" only) | house rule | **left alone** |

The world is now stamped 3.699.0. The migration ran once.

## Rulings and fixes

| Check | Result |
|---|---|
| Skeleton Warrior and Skeleton Champion ("Ethics Mindless", INT/CHA −5, no trait), re-checked by an effect change | **No collapse**: no statuses |
| Control: the same Skeleton with its ethic cleared | Unconscious and prone, as the rule says |
| …then given the Mindless trait | **Unconscious removed at once**. Prone stays, as it does whenever a creature wakes, and INT shows −10 because the trait's −5 penalty now applies |
| A Mindless-trait creature (Ape) at Wisdom −5 | No collapse |
| Crocodile Athletics / Constrictor Athletics / Constrictor Climbing | Sheet 9 / 15 / 8 = printed. A plain check gets no +4; with the Swim or Climb action, an automatic "Swim Speed +4" or "Climb Speed +4" row |
| Giant Eagle and Gryphon Perception | Sheet 13 and 8 = printed. The check's modifiers add up exactly to the sheet total, so Keen Sense is counted once. Acute Sense (Sight) is still only offered |
| Re-derivation of all 64 creature/skill pairs that differed before | **61 now match print.** The other 3 are Ape, Ape Lord and Laeleth Intimidate (RD-05: Strength kept, as ruled) |
| Eternal at 0 HP (Quasit, force damage) | **Destroyed** (`destroyed-no-death-state`: dying past its state, dead) |
| Archangel at 0 HP | Falls but cannot die. Its printed Regeneration 20 (Evil) holds it, which is correct |
| Ochre Jelly | Immune to precision (0 of 10) and to the disease trait; still immune to poison and slashing; takes fire |
| Ghost on a Ghoul (CO-01) | **One** "Darkvision (60 ft.)" before, during, after a later grant pass, and after removal; Undead type kept |
| Cold Dragon, Talon / Sovereign breath | "A 30-foot cone" / "A 40-foot cone", Focus, 0 PP, `codexInherit: false` |
| Codex: Quasit variant (Tiny, RD-02) | Imported, previewed with no issues, applied; reach 0; "Reach beyond five feet" 0 DP |
| Codex toolkit | "Published creatures (start a variant)" lists 294 creatures with a "Start variant" button. Screenshot taken |

## Shared battery in four configurations

| Configuration | Sections | Result |
|---|---|---|
| A: all modules | Core, Fiends, Codex | All pass |
| 1: Core + Codex + Fiends | Core, Fiends, Codex | All pass |
| 2: Core + Fiends | Core, Fiends | All pass |
| 3: Core + Codex | Core, Codex (picker empty without Fiends) | All pass |

Every shared result is **identical across all four**. That now includes the breath area: 30 ft with or without Inner Tempest, whereas on 0.45.2 it was 15 ft with Inner Tempest.

Highlights, all equal in every configuration that runs them:
- **Core fixture:** HP 96, DB 19, saves 14/9/11; poison immune; Bite 20.
- **Fiends & Fables creatures:**
  - Archangel DR 28.
  - Behir immune to electricity.
  - Mummy immune to disease.
  - Raven Swarm with its swarm immunities.
- **Breath:** 30 ft, 0 PP, uses 1→0, 30 HP lost.
- **Archer:** +9, ammunition 20→19.
- **Templates:** Zombie, Skeleton, Lich and Werewolf with no duplicates, no collapse, and restored.
- **Dragon advance:** no duplicate abilities; Bite 1d6 cold.
- **Codex-built creature:** HP 90, ledger 162, XPM −0.2.

## Findings

1. **Returned Essence on a Codex apply (new, harmless).** "Returned Essence" is the core Eternal type's text card ("your native essence returns to your home plane"). Only 4 of the 47 published Eternals carry it. An ordinary grant pass doesn't add it, but the Codex's full grant reconcile on apply does. So an unchanged apply on a published Eternal adds this one card. It has no mechanics. Fix options:
   - Fiends & Fables adds the card to the 43 Eternals, matching what their type grants;
   - or the Codex skips type-granted text cards on imported creatures.

   Graham chose the first option: Fiends & Fables 0.46.2 adds the card to the 43 Eternals (FF-17), and Codex 0.2.2 prices type-granted abilities through the type ledger (CX-08).
2. **Battery duplicate check (not a defect).** The battery flags "Source Stat Calibration ×2" on the Codex Ghoul variant. These are the published Ghoul's two distinct calibration items (HP +17 and Fortitude +1), also present on Ghast, Human Ghost and Belkar Storm Lord. The battery's name-based duplicate check should ignore them.

## Re-test: Codex 0.2.2 and Fiends & Fables 0.46.2 (18 November 2026, 19:15)

Installed by Graham; the world was already at schema 3.699.0 and no migration was offered.

| Check | Result |
|---|---|
| Published Eternals carrying Returned Essence | 47 of 47, once each |
| Codex unchanged apply on Quasit, Archangel, Succubus and Draeglir Halya variants | **Identical actors**: nothing added or removed; Returned Essence present once; not listed as unresolved in the ledger |
| Shared battery, all modules | Every check passes (Archangel DR 28; Behir and Mummy immunities; 30-ft breath at 0 PP; archer; dragon advance with no duplicates and Bite 1d6 cold; Zombie, Skeleton, Lich and Werewolf clean; Codex-built ledger 162). The only flag is the Ghoul's two distinct calibration items, which is published data, as above |

Cleaned up: test actors, scene, chat cards and stored test keys. The world was left paused on Caves.
