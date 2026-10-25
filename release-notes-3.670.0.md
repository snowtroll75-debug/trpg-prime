# TRG Prime 3.670.0

24 October 2026. The seams Inner Tempest's Block 6 (the remaining class feats of Chapter 5) needs, from its audit (C1–C12) and Graham's rulings of 24 October (B6-1 to B6-10).

- **Install over 3.669.2.** Inner Tempest 0.7.0 needs it. Inner Tempest 0.6.2, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **No migration prompt.**
- **Nothing changes for a game that declares none of the new things,** except two small corrections found in review (below): a Drunken Strike-style shared result cannot pick up a waiting bonus, and `trgPrimeStrikeResolved` now says whether the Strike missed.

## What a module can now declare

**C1 — a trait on every unarmed attack, or every attack.** `weaponTraitGrants: [{ scope: "unarmed" | "any", trait, label }]` on an item or applied effect. "unarmed" is a Strike that counts as unarmed (the fists, a gauntlet, a Monastic weapon). Dragon Stance's Sweep, Mantis Stance's Deadly, Elemental Fist's element.

**C2 — a damage type set, not offered.** `strikeTypeOption: { type, scope: ["unarmed-form"], replace: true }`. One set type is the Strike's without a question; two (two stances under Stance Mastery) are asked between. The new scope "unarmed-form" is the narrower unarmed (a claw is not one). Tiger and Wolf Stance (B6-1).

**C3 — bleed you inflict, raised.** `bleedBonus: { value, label }`. It raises the bleeding of a critical injury you deal and of a condition a Strike lays after it; it never creates bleed. Tiger Stance.

**C4 — a longer Step.** `stepFeet: { feet, minSpeed }`: your Step is `feet` while your Speed is at least `minSpeed`. It does not add to Graceful Step; the longer wins. Tiger Stance.

**C5 — the first square of difficult terrain.** `ignoresFirstDifficultSquare: true`: on each Stride, the first square's extra cost is waived. Dragon Stance.

**C6 — Pack Attack from an effect.** An applied effect with `creatureAbility.derives.packAttack` gives Pack Attack, as the ability does. Wolf Stance.

**C7 — the first Move of each turn, free of reactions.** `firstMoveNoReactions: true`: the first move of each of your turns while you carry it provokes nothing. Each drag is one move. Mantis Stance (B6-4).

**C8 — a Strike counted twice.** `rollWeaponAttack(…, { mapSteps: 2 })` advances the multiple attack penalty by two, as Power Attack does. Perfect Shot and Perfect Strike.

**C9 — a trade-off waived.** `tradeoffWaivers: [{ actions: ["highJump", "longJump"], option: "forOneAp", label }]`: that option's DC increase is waived for those actions. Monkey Stance (B6-5).

**C10 — another check's result met again.** `resolveAction(actor, action, { presetDice, presetModifiers })`: the check's total is the other check's exactly. No tick-box, conviction, Luck, waiting bonus or rod is added to it. Drunken Strike's Feint (B6-3).

**C11 — a class's trait opened by a feat.** `classFeatAccess: ["Mystic"]` on a feat: the class feats carrying that class's trait are offered. Not the class's registered access list, and not its source-tagged feats. Inner Magic (B6-7).

**C12 — Metamagic on an innate spell.** A spell flagged `innateMetamagic` (never a cantrip, never an item's) offers its caster's Metamagic feats. They are priced on the spell's printed PP and spent from the innate free warping budget, with the Metamagic box; nothing is charged to the pool. Economic Spell is not offered there. The Mystic (B6-8).

**`trgPrimeStrikeResolved`** now carries `resolved` and `missed` (resolved, and not a hit). `hits` is false too for an attack never resolved and for a hit that lands nothing, such as a grab; neither is a miss.

## Found in review

An independent review of the build, before release, found these; all are fixed above.
1. Metamagic feats on a marked innate spell were charged to the PP pool, and priced on a cost of 0 (Temporal Extension was free; Economic Spell was never offered). They are spent from the free budget and priced on the printed PP.
2. The cast workflow's cantrip test is never true for an innate spell, so an innate cantrip marked for Metamagic was offered it. An innate cantrip is now read from the spell's data.
3. A feat's declared class access opened that class's whole registered list (Inner Magic offered a Disciple the Mystic's core feats). It now opens the class's trait only.
4. A preset check (Drunken Strike's Feint) still took a waiting Cutting Words, Counter Perform, Inspire Competence or Seer's Vision, and could ask for a rod. It takes none.
5. The bleed bonus was added to an injury a creature deals itself (a poison's critical, a fumble's). It is not.
6. The first-move record was written on every creature's move, and a move made before the stance was entered spent it. It is written only for a mover that carries the rule.
7. `trgPrimeStrikeResolved` could not tell a miss from an attack never resolved or a grab. It now says so.

## Checks

- **New harness pair `verify/mutate-block6-core`:** 39 checks and 49 mutations, all caught.
- **Re-anchored to the new code, checks unchanged in meaning:** `verify-block3-core` (C8), `verify-block5-core` (G1), `verify-fixes-3669-1` (C4), `verify-fixes-3669-2` (B8, E), `verify-unliving-mechanisms` (D4), `verify-ff30-block21` (S4), `verify-block36b` (E5b: the rod's offer, now also not on a preset check), and the mutations `mutate-ff30-block21` and `mutate-fixes-3669-2`.
- **Full sweep** on the staged build, after the review's fixes: 641 harnesses. 639 passed; `verify-block36b` and its mutation pair failed on one pinned line (the rod's condition, which now also reads `presetModifiers`). It was re-pinned and the pair run again on the stage: 90 checks green, 41 mutations caught. `verify-no-undefined-names`, `verify-rules-have-callers` (backlog unchanged at 513) and `verify-checks-can-fail` green.
