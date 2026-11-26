# TRG Prime spell repair log

Started 26 November 2026 on branch `test/spell-matrix`, cut from `fix/skill-tumble` (**3.715.1**, the build installed in the Test world).

**No repair has been made yet.** This session built the test system and found the defects below. Nothing under `module/` or `packs/` has changed, and no version has been bumped.

Repairs wait on two things:
- **Your rulings.** Several items in TRG_PRIME_SPELL_UNRESOLVED.md decide how a repair should behave.
- **Your go-ahead.** Standing practice applies: one `fix/<feature>-<desc>` branch per repair, with a harness, a version bump, a package and a live retest.

## How to read this

Each item is a **root cause** (RC). One RC can fail many generated cases, and it is repaired once, in the shared engine. The case counts come from `tools/spell-matrix/data/calc-findings.json`.
- **Confirmed live** means it was reproduced in the Test world from both the GM and the Player seat. The evidence is in `tools/spell-matrix/data/live-pilot-3.715.1.json`.
- **Static** means it was found by driving the engine's own functions, and still needs a live repro.

| RC | Defect | Evidence | Scope | Layer | Status |
|---|---|---|---|---|---|
| RC1 | **Temporal Extension** charges for its steps but does not change the effect's clock. Its purchase limit is always 4, wherever the duration sits on the ladder (from Hours only one step remains). It is accepted beside Extend Spell or a duration warp, charged, and silently skipped. A duration off the ladder ("1 day") is described as stepping up to *minutes* (`temporalDurationText` falls back to index 0). | Confirmed live: Mage Armour, Temporal ×1, 3 PP, still 3,600 s. Temporal ×4 accepted, 6 PP. Extend + Temporal 5 PP, Extend only. GM and Player alike. | 444 spell durations; 1,418 illegal cases accepted, 392 of them stacking | core: `magic/metamagic.mjs` (`buildMetamagicOptions` max, `temporalDurationText`); `magic/cast-workflow.mjs` l.2064-2069; effect clock | Identified. Needs ruling U1. |
| RC2 | **Reach Spell** is charged and printed but does not double the range. The range check reads only `warpMods.rangeOverride`. | Confirmed live: Word Of Biting with Reach, foe at 45 ft (30 ft doubled is 60), refused "beyond … range of 30 feet". GM and Player. | 322 eligible spells | core: `aggregateMetamagicSelection` (`default:` branch); `magic/spell-range.mjs` `warpedRange` | Identified. Repair is unambiguous for numeric ranges; U7 for the others. |
| RC3 | **Distant Spell is never offered.** The gate is `range === "self"`, but the pack prints no such range: self-only spells have a blank range, targets and area. If offered, it would also be note-only. | Confirmed live: not in Mage Armour's offer list. GM and Player. | 148 self-only spells (1,168 cases) | core: `magic/metamagic.mjs` | Identified. Needs ruling U2. |
| RC4 | **Note-only metamagic.** Widen, Selective, Split, Aligned, Component Mastery, Imposing Will and Lingering Performance (and Reach and Distant, above) charge PP and add a card note, but set no field that the cast reads. The area is not widened, no target is excluded or added, no immunity is overridden, and the damage die is not stepped. | Static: the aggregate's `default:` branch; no reader outside `metamagic.mjs`. Live repro pending. | 9 feats | core | Identified. Needs ruling U10 (which to automate; some may be table rulings by design). |
| RC5 | **Extend Spell is offered on unlimited durations.** The feat says "a spell must have a limited duration". | Static | Magic Mouth, Glyph Of Protection, Continual Light, Soul Bind | core: `buildMetamagicOptions` | Identified. Unambiguous. |
| RC6 | **Split Spell is offered on Shatter**, a utility spell against an object. The gate is "damage and no save", not the Attack category the feat names. | Static | 1 spell | core: `buildMetamagicOptions` | Identified. Unambiguous. |
| RC7 | **Fixed ceilings the feats don't print:** Selective at most 6, Split at most 4. Both are "per target", so the cast cap is the only limit. | Static | all area / attack spells at high caster level | core: `buildMetamagicOptions` | Identified. Unambiguous. |
| RC8 | **Warp ceilings not enforced, or enforced where none is printed.** Forbiddance's uncapped "+10 ft radius" can be bought once (`areaGrowthMaxTimes` returns 1 without `areaMax`). Unliving Vitality "(max 10)" and Rapid Repair "(max 5)" are sold without limit (`warpMaxTimes` never reads `healingRateMax`). Gravity Weapon's "+2 (max +4)" has no ceiling authored. | Static | 4 spells | core: `magic/warp-area.mjs`, `magic/spell-warp.mjs`, pack data | Identified. Unambiguous. |
| RC9 | **94 mechanical warps in 70 spells carry no structured mods.** They are charged. Whether they are applied depends on spell-specific code, which only a live cast can show. | Static (review list) | 70 spells | per spell | Review: each needs a live cast. |

## Not defects (checked and cleared)

- **Every PP total, cap and Casting DC** in the 49,284 legal cases agrees with the book, apart from the 1,168 cases RC3 refuses outright and 4 repeat refusals (Forbiddance ×2, RC8; Shape Of The Wyrm, U12; Sonic Bolt, below). That includes Economic Spell's "DC of the unlowered PP, +2 per PP" (your 5 Nov ruling).
- **Sonic Bolt**'s "armour ignored increases by one step" stops after 2 purchases (light → medium → heavy). The engine is right; the model's "no ceiling printed" was too literal.
- **All 6,441 warp-only configurations** the full sweep could reach agree on PP.
- Word Of Biting: base, warp ×1, warp at the cap, over the cap (Overcasting offer), Empower, Intensified, Heighten, warp + Empower, warp + Economic. Mage Armour: Extend. **All passed live from the Player seat** against a GM-owned foe, with the foe's HP read on the GM side.
- **27 rows the model first flagged were the model's mistakes,** not the engine's. Its text parser could not read absolute ceilings like "(max 50 feet)". They are now listed as review items in the Warping report and are not counted as defects.
