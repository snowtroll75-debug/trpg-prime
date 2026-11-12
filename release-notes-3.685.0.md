# TRG Prime 3.685.0

7 November 2026. Recurring damage now stacks by damage type, for every world. And the seams Eldritch Arts' Block 7 needs: H1–H11 in `ELDRITCH_ARTS_BLOCK7_AUDIT.md` §7, as Graham answered it the same day ("All the rest as proposed", H1–H11 approved). Block 7 is the first half of the Grimoire: 42 cantrips, attack and save spells, wards, buffs and reactions. Built on 3.684.9.

- **Install over 3.684.9.** No migration, and no world data changes. A creature already carrying recurring damage keeps it, and it reads correctly.
- **Eldritch Arts 0.10.0 needs it.** Eldritch Arts 0.9.2 and Inner Tempest 1.0.4 run on it. The one change they will notice is the recurring rule below.

## For every world

**Recurring damage stacks by damage type** (Graham, 7 November 2026: "recurring damage stacks with a flat check made for totals of the same damage type. Bleed is different for the flat check (only up to 4) but still stacks (or at least it should do).")

- **Before:** the core had two rules, and they disagreed.
  - A bomb, a weapon's "recurring +N", a spell attack's rider, a save ladder's recurring rung and `helpers.addRecurringDamage` kept **one** Recurring Damage condition per creature. A second one of the **same** type kept the **higher** value. One of a **different** type **replaced** it.
  - A recurring **tag** (a critical injury's row, a spell's `condition` row, the Universal Modifier) **added** the new value to that one condition and wrote the **newest** type over it.
  - So acid 2 then fire 3 was "fire 3" by a bomb, and "fire 5" by a critical.
- **Now:** one rule for every source.
  - Recurring damage of the **same type adds** to one running total. There is one condition per type.
  - **Different types are separate totals.** Nothing replaces anything.
  - In Phase 3 each type's total is dealt as before. **DR never reduces it** (Graham, 2 August 2026: "if you catch fire, what good is armour"). Immunity and resistance still apply.
  - **One DC 16 flat check per type's total.** A success ends that type. The others carry on.
  - With more than one type, the check names its type ("Recurring Acid Damage — Flat Check").
  - Page 193's lever ("the GM may deem … lowers the DC of the Flat-Check") is per type now. A lever set on the fire's condition eases the fire's check. A lever on a feat or an item eases every type's, as before.
- **Examples:**
  - Two flasks of acid, 2 and then 3: **Recurring 5 acid**, one flat check. Before: acid 3.
  - Acid 2, then a fire critical with Recurring 3: **acid 2 and fire 3**, two conditions, two flat checks. Before: fire 3 (bomb) or fire 5 (critical).
  - Eaog Balls' 1d6 force and its +2 PP 2d8 coldfire: two totals, each with its own flat check (Graham's Q150).
- **Bleeding already stacked**, and still does. Every source that adds bleed goes through the same rule (`combinedConditionValue`). The book: "The number of HPs lost due to Bleed from different wounds is cumulative."
  - **Its flat check is unchanged.** The book: "If you are suffering from light bleeding, you may attempt to remove it in the same way as other recurring damage each round by making a flat check. More serious bleeding must be healed with the Medicine skill or using magic." Light is 1 to 4, which is Graham's "only up to 4".
  - Example: Bleeding 2, then a wound of 3: **Bleeding 5** (Moderate), and no flat check can end it.
- **The sheet and the HUD:**
  - Each type is its own row on the Effects tab. Its + and − move that type only. Stepping a row to 0 ends that type only.
  - The value dialog edits the type it was opened on. Choosing another type there sets that type's own total.
  - "Remove Recurring Damage" with no type (the HUD, the Universal Modifier's remove) ends every type, as it ended the one there was.
- **Healing an "until healed" critical takes off its own type** (found in review). The record now keeps the critical's damage type and what it added. Healing takes that much off that type's total.
  - **Before (and in the first build of 3.685.0):** the record held the condition's total, and healing took it off whichever recurring condition came first.
  - **Example:** a fire bomb's 3, then an acid critical's 2 (until healed). Healed: **fire 3**, the acid gone. The first build left fire 1 and acid 2.
  - **A record made before 3.685.0** names no type. It is read as fire, the type it was laid as.
- **The GM's lever stays where it was set** (found in review; older than this release). A second flask or a critical onto a type used to put its "flat check easier by" back to 0. Now only setting the lever changes it.
- **A value written with no type keeps the condition's type.** Before, such a write re-typed acid as fire.
- **A reduction that names no type lowers one total, the largest.** This covers `helpers.reduceCondition(actor, "recurring")` and a turn option's `reduce:recurring`. Before, they wrote the sum of every type onto one condition.
- **The end-phase card names an unknown type by its own name** ("Coldfire"). Before, it said "Fire".
- **The one function:** `layRecurring(actor, amount, type)` (conditions/recurring-workflow.mjs). Its rule is `recurringAfterHit` (conditions/recurring.mjs), which moved there from bombs.mjs.
  - `helpers.addRecurringDamage` returns `{ value, damageType, before, added, stacked, replaced: false }`. `value` is that type's new total. Eldritch Arts' Emberlord rider reads `value` and is unchanged.

## New for modules

Each seam is additive and default-off: a row, answer or flag that does not use the new shape behaves exactly as it did.

| # | Seam | Contract | Who reads it |
|---|---|---|---|
| **H1** | **Spell thorns at the caster's Save DC** | A `thorns` row may say `save: { key, dc: "spell" }`: the cast stamps its Save DC on the effect. `casterLevelBonus: { max: N }` adds the caster level, at most N, to `damage`, once, onto a flat term already there ("1d6+1" at CL 10, max 10, is "1d6+11"). `ladder: { degree: [rows] }` with an empty `damage` is a condition ladder in place of damage: the attacker rolls the save (not basic), and the rung's rows land on it through the spell engine. A missing rung reads as every core ladder reads one (m42). | `magic/thorns.mjs` `normaliseThorns`, `spellThorns`, `thornsLadderRows`; `thorns-workflow.mjs`; `spell-effects.mjs` case `thorns`. Brittleskin, Eldritch Mantle, Glyph of Retribution, Prismatic Guard. |
| **H2** | **Caster-level steps on effect rows** | A `casterLevelMods` entry may carry `rows: [{ match: { kind, slot?, label?, condition?, index? }, add: { field: number \| "NdM" } }]` (a number adds to a numeric field, away from 0 for a negative one; dice add through `addDice`), `duration: { amount, unit }` (round, minute, hour, day; lengthens "N unit" printed durations of that unit), and `areaFeet` (joins the warp's `areaGrowth`). Each once per step; rows are copied, never written. | `magic/caster-level-mods.mjs` `applyCasterLevelMods`, `casterLevelRows`, `casterLevelDuration`; the cast. Brittleskin, Decoherence, Feltwarp, Invoke True Name (Q164: a non-recurring step at 8). |
| **H3a** | **An entry check at the start of a turn** | An `entryCheck` row with `atTurnStart: true` is also rolled for a creature that begins its turn inside, with the same DC and rungs. Nothing is pushed back or barred at a turn's start. The movement path's filters apply: `hostileOnly`, `oncePerRound`, and a Critical's "no further checks this turn". | `magic/entry-check.mjs`, `entry-check-workflow.mjs` `applyTurnStartEntryChecks`. Arcane Mycelium. |
| **H3b** | **An area's ladder at each of the caster's turns** | A `turnLadder` row: `{ kind: "turnLadder", save, on: "casterTurnStart", atCast?, degrees: { degree: { rows, dice, damageType, endsSpell, unaffected } }, replace: "always" \| "worse", stopAt? }`. Recorded on the cast's Region at the cast's Save DC. `atCast` rolls it then for everyone the template caught. At the start of each of the caster's turns, everyone inside rolls. `replace: "worse"` keeps a better result standing; `stopAt: "failure"` stops a creature that reached it (m100). A new result removes the effects this cast left on that creature, then lands its rows with the cast's id. | `magic/turn-ladder.mjs`, `turn-ladder-workflow.mjs`. Bubble Buffet. |
| **H3c** | **A target's ladder at each of its turns, while sustained** | The same row with `on: "targetTurnStart"`, reached by `onSave` like any row. Each target gets a marker effect (the cast's id, so it ends with the spell) holding its first degree. At the start of its turns it rolls again; the new rung replaces the old (Q156). An `endsSpell` rung ends the cast. A target whose first result ends the spell is not marked. | the same. Flesh to Blossom. |
| **H4** | **A fly Speed of land Speed + N** | A `speedGrant` row with `landPlus: N`: the grant is the creature's land Speed + N, read as the land Speed is now. A bonus warp grows N (`warpBonusMax` caps N). | `combat/granted-speeds.mjs`; `spell-effects.mjs` case `speedGrant`. Dragon Wings. |
| **H5** | **Cast reactions: exclude, turn back, the Save DC** | ctx adds `saveDC` (the cast's DC at this degree, from the same assembly the cast reads afterwards). An answer may say `exclude: [uuid]`, an actor or token uuid (a targeted spell loses those creatures; an area spell leaves them out of what it catches) or `turnBack: { checkTotal, saveDC, target }` (the sole target becomes the source, or the token or actor named; an attack spell's attack is `checkTotal`; its targets save against `saveDC`). Exclusions join; the first turnBack holds. | `magic/cast-reaction-shape.mjs`, `cast-reaction-shape-workflow.mjs`; the cast. Spectral Aegis (Q152), Argent Reversal (Q153). |
| **H6** | **A hit made a miss** | A check reaction's `after` may answer `{ miss: true, line, label }` on an attack check that hit: no damage, no critical, nothing on a hit (not forgiven, glancing or an automatic hit either). On a Strike and on each ray of a spell attack. | `reactions/reactions-workflow.mjs` `checkReactionsAfter`; `reactions.mjs` `missedByReaction`. Mirror Reprise. |
| **H7** | **A lower critical severity, after the roll** | `registerCriticalReaction(key, { before, after })` (a plain function is still `before`). `after(ctx)` gets `{ attacker, target, weapon, severity, bias, result, row, hitLocation, percentile }` once the row is read, and may answer `{ severitySteps: -n, line }`. The same two dice are read n steps lower (Deadly → Serious → Minor), never past the lower die as tens. Whether it is below Minor, and so no injury, is decided by the severity, not by how the dice were read. Location, armour and row follow the new reading. | `combat/critical-severity.mjs`; `rollCriticalInjury`. Arcane Bastion (Q151). |
| **H8** | **Zone casting rules** | A spell-check gate may answer `disadvantage: true` (joined with the check's other biases) and `innateCheck: true` (an innate cast rolls Spellcraft, innate ability + level against 10 + ⌊1.5 × PP⌋; its degree is the casting's: a failure is a failed casting with the use spent, a Fumble rolls the fumble table). A Region with `flags["trg-prime"].castingZone = { concentrationDC, label, exempt: [actorUuid] }` raises the DC of a Spell Concentration check made inside it (the larger of two zones). | `magic/spell-check-gates.mjs`; `casting-zone.mjs`; the cast; `rollSpellConcentration`. Zone Disruption (Q154). |
| **H9** | **Lent metamagic** | An effect with `flags["trg-prime"].lentMetamagic = { key, costFactor: 1 \| 0.5 \| 0, label, from }` offers its bearer that option: `key` is a core Metamagic feat's name in lower case ("empower spell") or a `registerMetamagic` key. No requirement but owning it is asked (Q163). Once a round in combat (`lentMetamagicUsed` on the effect). The bearer pays from its own pool, ×1, half rounded down, or nothing — a payment discount, so the Casting DC, the cap and the Save DC read the PP as cast. | `magic/lent-metamagic.mjs`; the cast; `offeredModuleMetamagic`. Metamagic Resonance. |
| **H9b** | **A free warp that still raises the Save DC** | Checked first: a free warp's waived PP did **not** reach the Save DC (they left `totalPP`). They are not capped and do not raise the Casting DC, which is right. Seam: a `freeWarp` row (or `warpFreeSchool` flag) with `raisesSaveDC: true` puts its waived PP back into the Save DC only. The Save line names the grant ("+1 free warp PP, Mana Surge"), not Heighten Spell. Powerful Illusion and Healer's Grace do not say it and are unchanged. | `spell-effects.mjs` case `freeWarp`; the cast's `savePP`. Mana Surge (Q162). |
| **H10** | **A rider in place of the weapon's damage** | A `strikeRider` with dice, a type and `replacesDamage: true` gives the Strike that base damage and type, so a critical doubles it as weapon damage. It is not a secondary packet. Only the attacker's riders (not runes). It is asked with the Strike's facts, so a gated rider can pass its gate. An override the caller chose (a Vital Strike) wins, and the rider it beat is not spent. **`flat: true`** on a replacing rider (Graham on Spirit Arrow: "Flat 6d6"): the Strike's damage is exactly the rider's dice and type. Nothing else adds: no BAB dice, attribute, quality, feat or other flat or dice addition, and no secondary packet. A critical still doubles it as weapon damage (6d6 on a serious critical is 8d6). The card says it is flat and does not name the dropped additions. Without `flat`, behaviour is unchanged. | `magic/strike-riders.mjs` `damageReplacement`; `combat/attack.mjs` `flatReplacementFormula`; `strike-riders-workflow.mjs` `strikeDamageReplacement`; the Strike's damage. Spirit Arrow (Q161). |
| **H11** | **Ends when its bearer regains HP** | An ActiveEffect with `flags["trg-prime"].endsOnHeal = true` is removed the moment its bearer's HP rise, by any route. A spell's `bonus` row with `endsOnHeal: true` carries the flag. | `magic/heal-ends.mjs`; the HP hook in `condition-events-workflow.mjs`. Primal Snap (Q160). |

**The §7 checks** ("to be confirmed in the build; seams only if the check fails"):

- **A spell-check gate may await a reactor's cast** (Arcane Feedback): holds. A gate is awaited, and `castSpell` runs inside another cast (its cast scope is a stack). One caveat for the module: a cast inside the gate that sets the user's targets must put them back, because the outer cast reads them later.
- **A damage reaction may add a weakness** (Invoke True Name): it could not. **Seam:** an answer's `weak: [types]` is a weakness for its scope, beside the creature's own.
- **`registerDispelModifier` may bias the Dispel check** (Eaog Balls): it could not. **Seam:** an offer's `bias: "advantage" | "disadvantage"`, joined with the check's other biases.
- **A spell effect is a `fallReduction` carrier** (Bouncy Body): holds. Any applied effect carrying the flag is read.
- **The core's Mirror Image:** H6 makes it automatable (a d100 per attack, a duplicate destroyed on a "miss"), but it needs its own duplicate count and a core check reaction. Not changed: it is not trivial, and it is a rules change for a core spell.

## Harnesses

- **`verify-recurring-stacking` (new, 31 checks):** includes the real "until healed" record-and-settle path in both orders, a pre-3.685.0 record, the lever surviving a stack, the per-type reducer and the label. the rule (same type adds, another stands beside it, nothing replaces); one total per type; the real TRGActor toggle by type; the real `applyConditionTags` (a recurring tag stacks onto its own type only; bleeding adds); `layRecurring` through the real toggle; every source wired through it; the end phase (a packet and a flat check per type, DR never reducing it, the lever per type); bleed's Light-only flat check; the sheet.
- **`mutate-recurring-stacking` (new):** 32 mutations, all caught.
- **`verify-ea-block7-core` (new, 66 checks):** includes Spirit Arrow's flat 6d6, executed (the real rider's `flat` mark, and the real flat formula dropping BAB dice, quality and Mighty while a serious critical makes 6d6 into 8d6), and the review's cases, executed: the lowered critical, the thorns' flat term, an area's token uuid, the real turn-start sweep's three filters with the real roll, a gated replacing rider, and the real spend keeping one an override beat. H1–H11 and the §7 checks. The real cast-reaction collector and shaping, check and critical reaction collectors, spell-check gates, module metamagic offers, dispel offers and granted defences are driven; the pure rules are called; the wiring is read.
- **`mutate-ea-block7-core` (new):** 82 mutations, all caught.
- **Re-pinned, 30 verifies:** checks pinned to lines this release moved (the recurring callers, the save DC assembly, the attack total, the metamagic options, the entry check's roll, the claiming kinds, the injury roll). Each pin now names the new line. E11 of `verify-chapter6-gear-181-190` now asserts the new rule ("a second flask adds"). Three checks had become vacuous because new code repeats their text (`verify-sacrificing-shield` G7, `verify-skill-ladder` W7, `verify-chapter10-321-330c` R8c): each is now scoped to its own site, and its mutation is caught again. Later in the review and the flat ruling, eight more checks were re-pinned to their moved lines: `verify-block34b` D14, `verify-chapter7` R6, `verify-strike-riders` F2, `verify-block3-core` B11, `verify-block7-core` C7, `verify-damage-riders` C4, `verify-ea-block6d-core` H6b and `verify-item-fixes-3626-1` B2. `verify-free-warp` C3 had become vacuous, because the Save line's label repeats its text; it is now scoped to the note's own names, and its mutation is caught again.
- **Re-anchored, 19 mutate files**, on the same moved lines; two mutations are turned round to the old rule (`mutate-chapter6-gear-181-190`: "a second flask keeps the stronger again"; `mutate-ff30-block23`: a weapon's recurring skips the stacking rule). The version anchors of 19 files point at 3.685.0.
- **Run:** every `verify-*` passes in the main tree (354). Every mutate file whose anchors touch a changed file (291, with the two new ones) was run in a scratch copy: all mutations caught. Four of them were re-anchored on lines the review and the flat ruling moved (`mutate-block4-core`, `mutate-casting-dc`, `mutate-free-warp`, `mutate-block35`), then run again.
- **`verify-rules-have-callers`:** no new keeps. Internal helpers are not exported; every new export has a caller.
- **`verify-checks-read-source`:** every file the two new verifies read is depended upon (a blanked file turns them red).

## Found in review

An independent review of this build found ten defects, all fixed before release:
- "until healed" healing took recurring damage off the wrong type;
- the GM's lever was reset to 0 on every stack;
- a lowered critical read "no injury" from an over-shifted roll, and not from its severity;
- the caster-level bonus was dropped onto "1d6+1";
- the turn-start entry check skipped the movement path's filters;
- a replacing rider ignored the Strike's facts, and was spent even when an override beat it;
- a reaction-made miss kept Weapon Supremacy's "forgiven";
- an area's exclusion missed a token uuid;
- an unknown type's label read "Fire";
- the Save line credited a free warp's PP to Heighten.

## For Graham

- **Bleeding and Injured from an "until healed" critical** still record the condition's total and take that much off when healed, as before this release. The review found the same defect for recurring damage, and only recurring damage is fixed here. Graham, 7 November (08:35): keep it as built.
- **A Vital Strike (or any caller's damage override) on a Strike carrying Spirit Arrow** uses the override's dice, and the arrow's rider is kept for the next shot, not spent.
- **On a flat Strike, the other riders and once-a-round windows are still used up.** Spirit Arrow drops them from the damage, as ruled. But an ordinary strike rider is still spent, and Precision Hunter's and a declared damage rider's once-a-round window is still marked used, as on any hit. Graham, 7 November (08:35): keep it as built.
- **The casting check's "Recurring damage N" penalty** (a situational row the cast reads off the caster) reads the sum of every type's total. With one type it is what it was.
- **Recurring Healing** (Conviction) ends one type's total: "the flat check automatically succeeds" for one of them.
- **Bleed's "separate wounds"** sidebar is still not built: bleed is one total, one band, as the main rule says.
- **Glyph of Retribution's "+1 per caster level"** is added to the 1d6 thorns. Its +4 PP type change, "each time you are struck", is the module's (a damage reaction).
- **Dragon Wings, ruled (Graham, 7 Nov): "Max +50, four warps".** The total above land Speed is at most +50: the base +10 and four warps of +10. This is the module's reading (`landPlus` 10, `warpBonusMax` 50); the core caps the total it is given, with no core change.
- **Spirit Arrow, ruled (Graham, 7 Nov, 07:53): "Flat 6d6".** The Strike deals exactly 6d6 piercing; a critical still doubles it as weapon damage. Built as `flat: true` on the replacing rider (H10).
- **Lent metamagic's half** is taken of each option's own total, rounded down (an option of 3 PP costs 1).
- **Zone Disruption's "sustain actions"**: the core's Sustain a Spell rolls nothing except a Spell Concentration check when interrupted (which takes the +2) and the exhaustion check at a minute (which has no set DC, so it is not raised).
- **Flesh to Blossom's Critical at the cast** ("No effect and the spell ends"): that target is not marked and never saves again; ending the active-spell entry itself is the module's (or the GM's Dismiss).
