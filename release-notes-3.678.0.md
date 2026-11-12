# TRG Prime 3.678.0

1 November 2026. The seams Eldritch Arts Block 2a needs: Eldritch Arts' High Magic casting, and what Chapter 7's areas do to a casting. Built from the Block 2 audit (`claude/eldritch-arts-block2-audit.md`) and Graham's answers to it the same day.

- **Install over 3.677.1.** Install Eldritch Arts 0.3.0 with it.
- **No migration prompt.**
- **What changes without Eldritch Arts:** nothing for a world that does not run it.
  - Every new seam is asked only when a module answers it.
  - High Magic changes only for a spell with the Highmagic trait or a caster that declares High Magic. No core or Fiends & Fables item does either.

## New

**D1 — a High Magic cast (Eldritch Arts, Chapter 7).**
- **Which casts are High Magic:**
  - a spell with the Highmagic trait, whoever casts it;
  - any spell cast by a caster whose class, archetype or feat declares `flags.trg-prime.highMagicCaster` (M27: those classes "treat any spells they can cast … as Highmagic");
  - with Eldritch Arts active, a Fiends & Fables High Magic creature's spell (D1b, below).
- **What a High Magic cast gets:**
  - **Casting check:** Hard, +2 on the casting DC ("High Magic, Hard" on the card).
  - **Armour:** every worn piece's DR × 4, in place of the tradition's prohibited-armour rule, with Divinity included (Q3). This applies to a class or a Highmagic spell, not to a creature's flag alone. Transcend Armour does not waive it: it ignores the usual penalties.
  - **Focus:** set aside (Q2). There is no +1 with it, and no −2 or +10 fumble without it. The exception is a caster with an item declaring `flags.trg-prime.highMagicFocus` (the Archmage, or a Sorcerer with the Arcanum birthright).
  - **Fumble:** +60 on top of the tradition modifier (M4), with +5 per PP and +20 for a Blunder as before.
  - **Traditions (M27):** a Highmagic spell counts as every tradition for its check's conditionals. Its fumble takes the caster's own tradition modifier (Q4).
  - **Resonance:** every event this cast provokes is rolled with disadvantage. That covers chaos, a named natural number and the fumble's 66. The first percentile is rolled twice and the higher kept; the open-ended rest is rolled once. The card shows both rolls.
- **Spell-check gates are now told `highMagic`.** Eldritch Arts' Ley Line Connection uses it.

**D1b — Eldritch Arts' rules supersede the Fiends & Fables guideline (Graham's M4 and Q1).**
- **How it switches:** while a module declares `registerHighMagicRules(moduleId)`, a creature flagged `highMagic` casts under D1 (Hard, fumble +60, Resonance with disadvantage). Its save DC +2 and free Heighten stop, and every one of its fumbles is +60 instead of +50.
- **Without such a module**, the guideline is exactly as before.

**D6 — no Resonance event here.** `registerResonanceSuppressor(key, ctx => reason|null)` is asked before any Resonance event is rolled. With a reason, nothing is rolled and the card says why. This is for Magic Suppression areas: "Magical Resonance events simply do not exist in areas of suppression".

**D7 — a casting refused, and its degree read differently.**
- **Refusal:** `registerCastRefusal(key, ctx => reason|null)` is asked first, before anything is spent or rolled, beside Rage and the critical's. A reason stops the cast with a warning. This is for antimagic zones, innate casts included (Q6). A drunk potion is not a cast and is not refused.
- **Degree remap:** `registerCastDegreeRemap(key, ctx => {degree, lines}|null)` runs after the page's own overrides and before the degree decides the PP, the fumble roll and the outcome. Its lines reach the card. It is not asked for an innate or no-check cast. This is for Magic Suppression areas: Partial, Failure and Fumble read as Failure, and Blunder as Fumble.
- **`trgPrimeSpellCast` now also carries** `chaos`, `rollsCheck`, `innate`, `itemCast`, `ritual` and `highMagic`, so a Wild Magic area can surge on "a Partial, Failure, Fumble, Blunder, or Chaos" (and on scrolls, wands and rituals, Q7).

**D7b — the settled cast and an item's release, said to modules (found in review).**
- **`trgPrimeSpellSettled` now also carries** `chaos`, `rollsCheck`, `ritual` and `highMagic`. A surge that grants or takes PP must wait until the spell's own PP are paid, or the two writes race; the settled hook is where it waits.
- **New hook `trgPrimeReleaseRolled`** `{actor, itemName, spellName, kind, pp, degree, chaos}`, at the end of a scroll's or wand's release check. The spell that follows casts with no check of its own, so the release check is the one a Wild Magic area reads (Q7).
- **A High Magic cast's card** says "High Magic (label): it registers simply as magic, and identifying it is Very Hard (DC +5)." The identify action has no spell in hand, so this is a line for the table, not a DC the system sets.

**D14 — an effect a module switches off.**
- **The predicate:** `registerEffectSuppressor(key, effect => boolean)` is asked synchronously by `TRGActiveEffect.isSuppressed`. Nothing is written, so the effect is back the moment the answer changes. This is for antimagic zones: "Magic items lose all properties … Effects resume once they leave the zone".
- **Conditionals now skip a suppressed effect**, not only a disabled one. This also stops the conditionals of an effect on a broken item, which already applied no changes ("nor does it grant bonuses").

**A module skill action's own DC.** A registered skill action may carry `resolveDC({actor, targetActor})`.
- **Return `{dc, label}`** to set the DC after the target's and before the defender's rows. Tap Ley Line uses it: "a Hard (+2) DC check based upon the ley lines level".
- **Return `{refused}`** to stop before anything is rolled.

**Module helpers.** `rollResonanceEvent`, `chargedItemLevelOf`, `rollItemDepletion` and `regionContains` are added for Chapter 7's tables and for Tap Magical Energy.

## Harness

- **New pair: `verify-ea-block2-core` (53 checks) and `mutate-ea-block2-core` (50 mutations, all caught).** They cover:
  - D1b: with and without the rules declared.
  - D1:
    - which casts are High Magic;
    - Hard;
    - armour, including Q3's creature exception;
    - the focus, including Q2's Archmage;
    - the fumble at +60;
    - M27 and Q4;
    - the casting DC's parts;
    - the cast's wiring.
  - D6: disadvantage, as two first rolls with the higher kept and the open-ended rest once; suppression; a failing module.
  - D7: the refusal, including a blank answer; the remap of each degree, in order, with an unknown answer ignored; its place in the cast; the card; the hook's payload.
  - D7b: the settled hook's payload, the release hook, and the identification line.
  - D14: the predicate, `isSuppressed`, and the conditionals.
  - A1: the action's own DC.
  - H: the helpers.
  - Z: the version.
- **Re-anchored to lines this release moved:**
  - `verify-ff30-block3` B9 accepts the fumble's new argument.
  - `mutate-ff30-block3`'s two High Magic mutations go at the guideline's new lines (43 mutations, all caught).
  - `verify-block8-core` C5 accepts the settled hook's new fields (65 checks; `mutate-block8-core` 79, all caught).
  - `mutate-casting-dc`'s negative-armour mutation goes at the armour part's new label (21, all caught).
  - `verify-chapter9-241-250` I16 reads the fumble call's own `ritual`, not any of the cast hooks' (184 checks; 88 mutations, all caught).
  - `verify-percentile-bias` H2 counts three reads of `percentileValue`: the fumble once, the Resonance roll twice for disadvantage (54 checks). `mutate-percentile-bias`'s fumble mutation is narrowed to the one line it changes, which is unique now (17, all caught; `verify-mutation-anchors` back to its baseline).
- **`tools/uncalled-exports.json`:** keeps for `CAST_DEGREES`, `declaresHighMagicCaster`, `highMagicFocusAllowed` and `spellIsHighmagic`. Their callers are in their own files, and the verify file drives them.
- **Re-pinned to 3.678.0:** the version anchors of the mutation files and the release link.
- **Full sweep on the staged 3.678.0** (`tools/verify.mjs`, 659 harnesses, on a copy checked identical to the source first): **651 passed; 8 failed**, all on pins this release moved: the four pairs above (verify/mutate-block8-core, mutate-casting-dc, mutate-chapter9-241-250, verify/mutate-mutation-anchors, verify/mutate-percentile-bias). All were re-anchored and re-run green, with `verify-rules-have-callers` and `verify-no-undefined-names`.
- **Inner Tempest 1.0.4 on 3.678.0:** Blocks 1–4, 6–10 and the weapons all green.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
