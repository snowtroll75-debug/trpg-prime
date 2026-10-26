# TRG Prime 3.672.0

26 October 2026. The seams Inner Tempest's Block 8 (the Grimoire's other thirteen spells) needs, from its audit (C1–C10, and C11–C13 found while building) and Graham's rulings of 26 October (B8-1 to B8-9).

- **Install over 3.671.1.** Inner Tempest 0.9.0 needs it. Inner Tempest 0.8.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **No migration prompt.**
- **Nothing changes for a game that declares none of the new things,** except three things every table meets:
  - **A strike rider that lasts "until removed" now stays.** It became a one-round condition after its effect was read back, so Pillars of Faith's Rose of Thorns' Bleeding 2 lasted a round instead of until staunched.
  - **A spell whose save is rolled later says so** on its cast card ("— rolled later, not on casting"), Sanctuary and Visage of Horror included.
  - **A bonus warp's cap now holds on a DC bonus row** (a "+1 PP … (max +N)" warp on a `defenceDC` row went past N).

## What a module can now declare

**C1 — two ability scores traded.** A spell row `{ kind: "abilitySwap" }`: on each target the highest and lowest ability totals are switched, through two untyped bonus-pool entries, so everything derived follows and the effect's end restores everything. The caster is asked when scores tie. One row per save rung, each with its own `duration`. A creature already switched is refused. Ability Inversion (B8-1).

**C2 — a rider's save with a value per rung, at the caster's DC.** `conditionSave.ladder: { failure: 1, fumble: 2, blunder: 2 }` on a strike rider: the save's degree picks the condition's value, and a degree not named takes nothing. A rider laid by a spell and naming no DC takes that cast's spell save DC. Acidic Touch (B8-2).

**C3 — a projectile's own range multiple.** `flags.trg-prime.rangeIncrementMultiplier` on a stack of ammunition, or on a thrown weapon: `2`, or `{ value: 2, expiresAt, label }`, which reads as 1 once the world clock passes `expiresAt`. It multiplies the range increment after the round's own feet, in the range bands, the first-increment tests, Point Blank Shot and Penetrating. Arrows Flight (B8-3).

**C4 — flank immunity from an effect.** `flags.trg-prime.creatureAbility.derives.cannotBeFlanked` on an applied effect, as on an item. Boundless Vision.

**C5 — a module's answer to a casting.**
- `registerSpellCheckGate(key, gate)`: `gate({ actor, spell, spellData, innate, itemCast, attack, rollsCheck })` is awaited before the casting's check (beside Spell Drain's penalty) and may return `{ modifiers, lines }`: rows for that check (an innate or item attack's roll included) and lines for the cast card. It cannot stop the casting. Spiritual Distraction (B8-4).
- The hook `trgPrimeSpellSettled { actor, spell, spellData, degree, cast, ppSpent, refunded, innate, itemCast, level, warpMods }` fires when the casting is over, its cost charged, whatever the degree, and after the last point it can be refunded. Disrupt Soul (B8-5), Arrows Flight.
- `rollsCheck` tells a gate whether this casting rolls a check its rows can reach (none for a no-check cantrip, a ritual, an item's spell whose check was handed in, or an innate or item spell that is not an attack).

**C6 — a module's mark on a spell's target, and a save rolled later.** A spell row `{ kind: "moduleMark", module, key, label }` puts an effect on each target carrying `flags[module][key] = { casterUuid, casterName, level, casterLevel, dc, castId, spellUuid, spellName }` (the cast's own DC), timed and ended with the spell. Only a module's namespace. Any row carrying `saveAtCast: false` tells the cast not to roll the spell's printed save. Spiritual Distraction, Disrupt Soul, Age Resistance, Acidic Touch.

**C7 — a second ability for Refocus.** `flags.trg-prime.refocusExtra = true` on an item or effect: Refocus asks for a second spent Focus ability with the first, before the roll. A Critical restores both now and a Success both at the start of the next turn; a lower result touches only the first. Tranquil Mastery (B8-7).

**C8 — would a 10 succeed?** `flags.trg-prime.foretell = true` on an effect: the creature's next d20 check (not a flat check) first says whether a 10 on the die would succeed, from the check's own modifiers and DC; a result a condition forces (an Immobilised Reflex save) is a failure. The effect is spent either way.
- **A skill action is asked before it spends anything** — its AP, a prepared reaction, Born to Ride, a trait's use, a curse's bite, a Sanctuary, a tool. The answer comes from `TRGCheck.preview(config)`, the same check with its automatic rows read and none of them spent. When a 10 would fail the player may take a different action, and nothing is spent. A DC the GM sets afterwards is put to the GM through Foundry's user query, and the action waits. Foretell Failure (B8-6).
- **A Strike, a save or a casting's check is told at its roll.** By then a Strike has spent its AP and its defender has been offered reactions, so it is not called back; the card says the answer. An unset DC there is not put to the GM, because the answer could change nothing.

**C9 — more a declared effect may carry.** A `declare` row may now carry `ignoresDifficultTerrain`, `firstMoveNoReactions`, `foretell` and `refocusExtra` (each `true`), and `creatureAbility: { derives: { cannotBeFlanked | packAttack: true } }`. Flowing Step, Timeless Motion, Foretell Failure, Tranquil Mastery, Boundless Vision.

**C10 — a critical's severity on a spell row.** A spell attack hands each struck target's critical severity to the effect rows, and `minCriticalSeverity: "serious"` on a row gated `onAttack: ["critical"]` asks for that severity or worse. Water Bolt's push (B8-9).

**C11 — a caster's spell ended by its target's roll.** The helper `endSpellOf(caster, castId)` ends the caster's registered spell, directly when this client owns the caster and through the GM otherwise (a new relay action, `target.endSpell`). With it, `basicSaveSeverity(degree, margin)` and `rollCriticalInjury(...)`. Spiritual Distraction's and Disrupt Soul's "the spell ends"; Disrupt Soul's essence critical.

**C12 — a DC bonus row's warp stops at its cap.** Root's "+1 PP: increase bonus by +1 (max +4)".

**C13 — a declared tick that grows with a bonus warp.** A declared conditional marked `warpBonus: true` takes the bonus warps bought, to the warp's cap. Root's balance bonus.

## Found in review

An independent review of the build, before release, found these; all are fixed above.
1. **Foretell Failure's "different action" was not free.** It was asked inside the roll, after a skill action or a Strike had already spent one-shot bonuses, pending rows, trait uses, a curse's bite, a Sanctuary, a tool's use, and (for a Strike) its defender's reactions and an ally's interception, while only the AP came back, and a reaction's cost was never returned at all. A skill action is now asked before it spends anything, from a preview that spends nothing; a Strike is told at its roll and not called back.
2. **The settled-cast hook fired before a cast could still be refunded** (a target picker cancelled after payment). It now fires last, and says `refunded`.
3. **A gate was told a check would be rolled when none would** (an innate or item non-attack spell, an item attack with its check handed in), so a module could report a penalty nothing received. `rollsCheck` is now read from the branch that runs.
4. **Closing Tranquil Mastery's second-ability picker chose the first ability** (`Number(null)` is 0). Closing it chooses none.
5. **The GM was kept waiting** on an unset DC for a check already under way, and a forced failure could be foretold a success. Neither now.

## Checks

- **New harness pair `verify/mutate-block8-core`:** 63 checks and 76 mutations, all caught (the review's fixes included).
- **Re-anchored to the new code, checks unchanged in meaning:** `verify-block35` (F5: each struck target's outcome now carries its severity) and `mutate-block35` (its F2 anchor), and `verify-chapter6-gear-181-190` (H15: the gate's lines join the reagent's on the card); `verify-resume-outcome` (C2b) and `mutate-resume-outcome` (a skill action's roll now spreads one shared config, built before the commitment so Foretell's preview reads the same check); `verify-chapter10-261-270` (F9) and `mutate-chapter10-261-270` (a preview spends no one-shots); `verify-offered-conditionals` (C1) and `mutate-offered-conditionals` (a preview offers no tick-boxes); the anchors in `mutate-block3-core` (G2), `mutate-casting-dc` and `mutate-chapter10-331-340`. Version pins moved to 3.672.0 in `mutate-block6-core`, `mutate-block7-core`, `mutate-fixes-3669-2`, `mutate-fixes-3670-1` and `mutate-release-links`.
- `verify-rules-have-callers`: six new exports called in their own file or through the module API are recorded as deliberate keeps, each with its reason; the backlog is unchanged at 513.
