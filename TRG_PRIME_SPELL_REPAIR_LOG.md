# TRG Prime spell repair log

Started 26 November 2026 on branch `test/spell-matrix`, cut from `fix/skill-tumble` (**3.715.1**, the build installed in the Test world).

**Repaired in 3.716.0** (branch `fix/spell-metamagic-rulings`; core log entry R-0038; `release-notes-3.716.0.md`). This was done after Graham's rulings of 26 November 2026 (U1–U12; see TRG_PRIME_SPELL_UNRESOLVED.md).

What is still owed:
- **The live retest.** 3.716.0 must be installed in the Test world, then the cases in "Live retest" below run from both seats.
- **RC4 for the four feats not ruled on** (Selective, Split, Aligned, Imposing Will).
- **RC9**, the per-spell review.

## How to read this

Each item is a **root cause** (RC). One RC can fail many generated cases, and it is repaired once, in the shared engine. The case counts come from `tools/spell-matrix/data/calc-findings.json`.
- **Confirmed live** means it was reproduced in the Test world from both the GM and the Player seat. The evidence is in `tools/spell-matrix/data/live-pilot-3.715.1.json`.
- **Static** means it was found by driving the engine's own functions, and still needs a live repro.

| RC | Defect | Evidence | Scope | Layer | Status |
|---|---|---|---|---|---|
| RC1 | **Temporal Extension** charges for its steps but does not change the effect's clock. Its purchase limit is always 4, wherever the duration sits on the ladder (from Hours only one step remains). It is accepted beside Extend Spell or a duration warp, charged, and silently skipped. A duration off the ladder ("1 day") is described as stepping up to *minutes* (`temporalDurationText` falls back to index 0). | Confirmed live: Mage Armour, Temporal ×1, 3 PP, still 3,600 s. Temporal ×4 accepted, 6 PP. Extend + Temporal 5 PP, Extend only. GM and Player alike. | 444 spell durations; 1,418 illegal cases accepted, 392 of them stacking | core: `magic/metamagic.mjs` (`buildMetamagicOptions` max, `temporalDurationText`); `magic/cast-workflow.mjs` l.2064-2069; effect clock | **Repaired 3.716.0** (U1). Live retest pending. |
| RC2 | **Reach Spell** is charged and printed but does not double the range. The range check reads only `warpMods.rangeOverride`. | Confirmed live: Word Of Biting with Reach, foe at 45 ft (30 ft doubled is 60), refused "beyond … range of 30 feet". GM and Player. | 322 eligible spells | core: `aggregateMetamagicSelection` (`default:` branch); `magic/spell-range.mjs` `warpedRange` | **Repaired 3.716.0** (U7: numeric ranges only). Live retest pending. |
| RC3 | **Distant Spell is never offered.** The gate is `range === "self"`, but the pack prints no such range: self-only spells have a blank range, targets and area. If offered, it would also be note-only. | Confirmed live: not in Mage Armour's offer list. GM and Player. | 148 self-only spells (1,168 cases) | core: `magic/metamagic.mjs` | **Repaired 3.716.0** (U2). Live retest pending. |
| RC4 | **Note-only metamagic.** Widen, Selective, Split, Aligned, Component Mastery, Imposing Will and Lingering Performance (and Reach and Distant, above) charge PP and add a card note, but set no field that the cast reads. The area is not widened, no target is excluded or added, no immunity is overridden, and the damage die is not stepped. | Static: the aggregate's `default:` branch; no reader outside `metamagic.mjs`. Live repro pending. | 9 feats | core | **Partly repaired, 3.716.0:** Reach, Distant, Widen (U4), Component Mastery and Lingering Performance (U10) are automated. Selective, Split, Aligned and Imposing Will are still notes, awaiting a ruling. |
| RC5 | **Extend Spell is offered on unlimited durations.** The feat says "a spell must have a limited duration". | Static | Magic Mouth, Glyph Of Protection, Continual Light, Soul Bind | core: `buildMetamagicOptions` | **Repaired 3.716.0** (RC8 with Shape Of The Wyrm once, U12). |
| RC6 | **Split Spell is offered on Shatter**, a utility spell against an object. The gate is "damage and no save", not the Attack category the feat names. | Static | 1 spell | core: `buildMetamagicOptions` | **Repaired 3.716.0** (RC8 with Shape Of The Wyrm once, U12). |
| RC7 | **Fixed ceilings the feats don't print:** Selective at most 6, Split at most 4. Both are "per target", so the cast cap is the only limit. | Static | all area / attack spells at high caster level | core: `buildMetamagicOptions` | **Repaired 3.716.0** (RC8 with Shape Of The Wyrm once, U12). |
| RC8 | **Warp ceilings not enforced, or enforced where none is printed.** Forbiddance's uncapped "+10 ft radius" can be bought once (`areaGrowthMaxTimes` returns 1 without `areaMax`). Unliving Vitality "(max 10)" and Rapid Repair "(max 5)" are sold without limit (`warpMaxTimes` never reads `healingRateMax`). Gravity Weapon's "+2 (max +4)" has no ceiling authored. | Static | 4 spells | core: `magic/warp-area.mjs`, `magic/spell-warp.mjs`, pack data | **Repaired 3.716.0** (RC8 with Shape Of The Wyrm once, U12). |
| RC9 | **94 mechanical warps in 70 spells carry no structured mods.** They are charged. Whether they are applied depends on spell-specific code, which only a live cast can show. | Static (review list) | 70 spells | per spell | Review: each needs a live cast. 3.716.0 wired two of them, True Seeing and Unshakable (Invisibility's touch warp). |

## Not defects (checked and cleared)

- **Every PP total, cap and Casting DC** in the 49,284 legal cases agrees with the book, apart from the 1,168 cases RC3 refuses outright and 4 repeat refusals (Forbiddance ×2, RC8; Shape Of The Wyrm, U12; Sonic Bolt, below). That includes Economic Spell's "DC of the unlowered PP, +2 per PP" (your 5 Nov ruling).
- **Sonic Bolt**'s "armour ignored increases by one step" stops after 2 purchases (light → medium → heavy). The engine is right; the model's "no ceiling printed" was too literal.
- **All 6,441 warp-only configurations** the full sweep could reach agree on PP.
- Word Of Biting: base, warp ×1, warp at the cap, over the cap (Overcasting offer), Empower, Intensified, Heighten, warp + Empower, warp + Economic. Mage Armour: Extend. **All passed live from the Player seat** against a GM-owned foe, with the foe's HP read on the GM side.
- **27 rows the model first flagged were the model's mistakes,** not the engine's. Its text parser could not read absolute ceilings like "(max 50 feet)". They are now listed as review items in the Warping report and are not counted as defects.

## Also in 3.716.0, from the rulings

- **U3 Heighten Spell:** offered on every spell. A heightened cast's effects are counteracted at the caster's maximum PP (`cast-power.mjs`). Every cast's effects now carry the PP they were cast at; a cantrip's carry the caster's maximum.
- **U5:** neither Extend nor Temporal Extension is offered on a sustained duration.
- **U8:** a metamagic beside the spell's own warp of the same kind (duration, range, area), or Extend beside Temporal, is refused before anything is spent.
- **U11:** a player's spell rolls a GM-owned creature's save on the GM's client (`target.save` relay). With no GM connected, it is rolled locally at once.
- **True Seeing and Unshakable:** their "range becomes touch" warps now carry Invisibility's mods.

## The spell matrix after 3.716.0

The baseline went from **4,112** failing cases to **8**. Each is explained:

- **Geas** (warps 0–2, beside Extend; at two caster levels): the duration warps ("1 year", "unlimited") carry no structured mods, so U8 cannot see them.
- **Pass Without Trace** (warp 1, beside Distant): its range-and-area warp is unstructured too.
- **Healer's Grace** (warp 0 ×2): "an additional 1 PP (max +4)" is ambiguous.
- **Sonic Bolt** (warp 1): the model's error; the engine's two-step ladder is right.

## Live retest of 3.716.0 (26 November 2026): 14 of 14 passed

GM and Player sessions at once (`live-testing-report-3.716.0.md`; data in `tools/spell-matrix/data/live-3.716.0.json`).

- **Range and area:** Reach at 45 ft from both seats, and Widen's 40-ft template.
- **Duration:** Temporal ×1 reads 12 hours on the clock, with an offer ceiling of 1. Extend + Temporal was refused with nothing spent.
- **Distant and U8:** Distant moved Mage Armour onto the ally. Invisibility's own touch warp beside Distant was refused (U8).
- **Components:** Component Mastery lifted the pouch gate; without it the gate held.
- **Counteract:** a heightened buff's counteract opened at the caster's maximum castable PP.
- **Saves:** they were rolled on the GM's client (U11).
- **Lingering Performance:** it lingered Cha + 1 rounds after the lapse, then ended.
- **Forbiddance:** its uncapped count box.

**Two defects in the lingering case**, both fixed in 3.716.1 (R-0039):
- a double delete when it ended (the turn and world clocks both swept it);
- a turn card that called it a lapse.

3.716.1's own live check (case 13 again) is pending installation.
