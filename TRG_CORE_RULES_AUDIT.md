# TRG Prime Core 3.8 — Rules Audit (3.697.0 session)

17 November 2026. These are contradictions, ambiguities and apparent errors in **TRG Prime Core 3.8** found during the 3.697.0 automation audit. None was silently resolved. Where the implementation had to take a reading, the reading is stated and marked **for your ruling**.

The forty-block audit (Sep–Oct 2026) recorded its own findings and rulings in the project (`claude/audit-pages-*.md`, `handover-block*.md`). They are not repeated here.

## Mechanical cross-checks against the book (all clean)

| Check | Scope | Result |
|---|---|---|
| Spell stat blocks | 691 printed spells: PP, tradition, cast AP, range, duration, traits | **No discrepancy.** The differences found were spelling only: class names in the trait line (the pack keeps them as `specialistClass`) and "Penetrating" (book) vs "Penetrate" (pack). |
| Class tables | 8 classes × 20 levels: BAB, BDB, Fort, Ref, Will, bonus feats, caster level, PP, BSB | **Identical.** |
| Live advancement | 8 classes, 1→20→1, in the Test world | **The actor matches the table at every level.** No duplicate grants. |
| Feat prerequisites | Every feat heading the book prints | **No discrepancy.** The apparent ones were same-named entries: the Arcanist, Priest, Gleeman and Animist archetypes vs the trait lines of the Minor/Major caster feats, and Aegis the archetype vs Aegis the shield feat. |

## Findings

### R1. Familiar abilities: wording errors (no rules effect)

- **General Adeptness:** "any one general feat **foe** which it meets the prerequisites", should read "for".
- **Fast Movement:** "by 15 **-feet**" (stray hyphen). The rule is clear.
- **Amphibious, Fast Movement:** "familiars" is missing its apostrophe.

### R2. Inner Focus: does the illusory focus count as a focus? — **ruled 18 Nov: as built**

"You do not need to provide focus spell components and take no penalty for not using your Spell Focus item."

- **Implemented:** no penalty and no bonus. The -2 and the +10 fumble are waived; the +1 Casting Focus bonus is **not** given, because no focus is held.
- **Open:** Casting Focus also says a focus "can also be used in place of a somatic component". Whether the illusory focus does that is not stated. 3.697.0 does not let it stand in for a somatic component.

### R3. Flame Blade: range and targets contradict the effect — **ruled 18 Nov: no range, no targets** (3.698.0); damage type still open (U12)

The stat block reads "Range 30 feet; Targets 1 creature", but the text describes a blade that "springs forth from your hand", wielded "as if it were a scimitar using your Spellcraft bonus at -2 for your AB and inflicting fire criticals."

- **Questions:**
  - Is the range really self, with no target?
  - Is the damage a scimitar's die?
  - Is the damage type fire, or slashing with fire criticals?
  - Is there any ability modifier to damage?
- **Status:** not automated (class C) until ruled. The `conjuredWeapon` rail that Eldritch Weapon uses would carry it.

### R4. Long Arm: "with those limbs"

The +5 ft reach applies to the arms. 3.697.0 raises the creature's reach. That is exact for weapons and arm attacks, but over-generous for a bite or a tail.

- **Recorded as an interpretation.** Natural-attack reach per limb is not modelled anywhere in the core.

### R5. Changing Lungs: "poisonous or toxic atmosphere"

- **Automated:** the underwater half, through the same marker Water Breathing uses.
- **Not automated:** the core has no "inhaled" or "atmosphere" tag on hazards or poisons, so the toxic-atmosphere half is a card note.
- **If wanted:** an "inhaled" trait on the relevant poisons would let the marker grant immunity to them.

### R6. Losing levels is not defined — **ruled 18 Nov: levelled grants above the new level are taken back** (3.698.0)

Core 3.8 has no rule for a character losing a level. Nothing in it covers level drain, and nothing says what happens to class abilities when XP is reduced.

- **Earlier ruling:** your block-40 R7 takes a divine aspect's bonus spells back on a level drop.
- **What the system does:** nothing equivalent for class abilities and class feats.
- **Decision U1:** see TRG_CORE_UNRESOLVED.md.

### R7. Ability Enhancement: "never more than once every four levels" — **ruled 18 Nov: one at 1–4, two at 5–8, and so on** (3.698.0)

- **The rule** is a limit on how often the ability is *selected*, but the book does not say from which level the four-level window counts.
- **3.697.0:** applies each copy's +1 and warns when there are several copies. It does not refuse a pick.
- **For your ruling:** whether the limit means one copy per four familiar levels (1, 5, 9…) or one per four levels since the previous pick.

### R8. Typographical: "AEGIS MARTAL"

The trait line of **Shielded Stride** reads "AEGIS MARTAL"; it should be "MARTIAL".
