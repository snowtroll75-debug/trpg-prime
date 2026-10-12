# TRG Prime 3.549.0 — Chapter 1 fix pass

10 September 2026. The first block of the page-by-page audit: pages 6–15 examined rule by rule, then fixed, then pinned. Rulings R1–R4 taken from Graham on the audit report; R5 (the ability −5 consequences) is still open and is the one thing from the block left undone.

## What was wrong

**The Halfling and the Gnome had been wrong for weeks.** The system applies the Creature Size Modifiers table itself, to every actor with a size, and page 14 says the Race Table's values already include it — so a race item must carry only the remainder. Both Small races carried the full printed line instead, and the two additions stacked. Measured by running `resolveBonuses` over a built actor: a Halfling resolved **Str −2 / Dex +3** against a printed −1 / +2, and a Gnome **Str −2 / Dex +2** against a printed −1 / +1.

The design was never in doubt. Both race items' own descriptions say in as many words that the effect applies "only the remainder", and the 3.193.0 notes record the ruling of 2 August and a harness check asserting `racial + size = printed`. The data and the check were both lost since, and nothing was left to notice. Every Halfling and Gnome in the world has a wrong Strength and Dexterity until this is installed.

**Every odd-PP spell was one DC too hard.** `castingDC` was `10 + ceil(PP × 1.5)`. Chapter 9 prints the formula and says nothing about rounding, so page 10's default governs it — "unless otherwise stated, always round down" — and PP 1 was DC 12 against a printed 11, PP 3 was 15 against 14. Even costs were right under either rounding, which is why it read as correct for so long. A second copy of the same formula sat in `resolution.mjs` rounding a third way (`Math.round`) and was called by nothing; it is deleted rather than corrected, because two spellings of one rule is how they come to disagree.

**A botched revival did nothing.** Page 8 names four moments to test a creature's Dying against its Death State, and one of them is a failed stabilisation. In TRG that is Resuscitation, whose Fumble reads "You increase the target's Dying condition by 1" and whose Blunder "...by 2" — the only increase-a-condition wording in the whole skill-action table. Nothing read it. The three good degrees offered an Apply button and the two bad ones printed a sentence. The death check was never the gap; the change it was meant to check never happened.

**The Refocus backlash never reached the bottom of its own ladder.** Its Blunder is "1d4 mental damage per level (basic Will)", and a basic save is the whole ladder — the amount the save is missed by adds base damage and lands a critical. The call passed the degree and not the margin, which floors the miss at zero, so every failure produced flat damage and no critical however badly it was rolled. The spell path has always passed it; this one caller did not.

**Two traps that had not gone off yet.** A held advantage spent on a card rolled its challenger as a hard-coded `1d20`, which on the one d100 card in the game — initiative — would have compared two numbers that are not on the same scale. And the combat tracker built its initiative check directly instead of going through `TRGCheck.roll`, so the tracker and the sheet were running different rules: the sheet applies a bias from an effect or an ally's aura, the tracker could not see one. Nothing currently grants an initiative bias, so neither was live. Both are closed while the two paths are still known to agree.

## What changed

The background rule is now enforced rather than warned about (Graham's ruling, R4). A second background is refused at the document layer — `TRGItem._preCreate` — so the picker, a compendium drag, a drag between actors and a macro all meet the same rule, where before only the picker warned and the other three said nothing. Removing a background above 1st level is refused too, because "it cannot be amended at higher levels", and **the GM is exempt from that half**: a GM correcting a mis-clicked pick is doing the thing the rule exists to stop a player doing casually, and welding a wrong background to a sheet for ever is the worse failure. Adding a *first* background at any level is untouched — building a 12th-level character from scratch is ordinary work.

The pack fix went in as two declared rows in `tools/data-fixes.json`, which needed a new operation: the tool could add an effect and set a field on an item, but not correct the changes an existing effect carries — which is the actual arithmetic a race applies. `op: "editEffect"` closes that, with the same from/to guard as every other row, so an effect somebody has changed since is refused rather than overwritten. Applying the file also flushed one unrelated fix, `wash-away-sin-both-dice`, that had been declared but never reached the shipped pack.

## What is now pinned

`tools/verify-chapter1.mjs` — 246 checks — and `tools/mutate-chapter1.mjs`, 33 mutations, all caught.

Before this release essentially none of Chapter 1 was pinned. The core check ladder, the open-ended chains, auto-hit and auto-miss, the Level DC constant, the casting DC, the size table, the HP formula, the race modifiers, the ability point pool and the death threshold could all be edited without a single check going red — and two of them had already drifted. The verifier drives page 10's own two worked examples (17 + 20 + 20 + 5 = 62, and 11 + 1 − 20 − 3 = −11), the full 1–100 percentile range, every AV severity band edge, every size row against the printed table, and `racial + size = printed` against the live pack for all eight races.

Two mutations are worth naming. **P1 and P2 recreate the Halfling and Gnome double-count exactly** and prove the new section catches it — that defect survived because nothing read the pack and compared it against the printed table, and now something does. And **N1 and N2 caught a weakness in my own checks** on the first run: the background assertions asked whether the guard was *defined*, and the mutation walked past them by disconnecting the *call* and leaving the definition in place. A rule that is defined and never called is the exact shape this project keeps finding. They now read the body of the method Foundry actually invokes.

## Still open from this block

**R5 — the ability −5 consequences (p13).** Str/Wis/Cha −5 → unconscious, Dex −5 → immobile but conscious, Con −5 → dead, Int −5 → comatose. Nothing in the system compares any attribute against a threshold, so a drain that pushes Con to −5 sits there as a number. Awaiting the ruling on whether to apply the conditions automatically or warn the way Fatigue 10/20 does.

Also recorded from the audit and not addressed here, because none is a defect in this block: the ability point pool warns rather than blocks (R3, keep as is), the feat allowance is display-only, `resources.ap.max` is not read by AP regain, Int→languages warns rather than blocks, and Endeavour ability purchases are not counted into the point pool so a legitimate purchase reads as overspent.

## Rulebook, not system

Page 14's Race Table disagrees with Chapter 2 on three Charisma values — Ascendan (+1 vs +2), Gnome (+2 vs +1) and Kornargon (+1 vs none). Graham's ruling, R2: the chapter and the pack are correct, so the table is the thing in error. The PP column reads as a flat figure where Chapter 2 says "granted as a bonus per level", which is what the system does. Page 15 says every background grants a bonus feat; Archaeologist, Diplomat, Lay Healer, Scholar and Weaver grant none in Chapter 2, and Lay Healer grants one skill rather than three. Page 14 writes "Skilled in Shadows" where Chapter 2 and the pack write "Skilled in Shadow".
