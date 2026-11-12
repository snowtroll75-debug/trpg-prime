# TRG Prime 3.679.0

2 November 2026. The seams Eldritch Arts Block 2b needs: a sourcebook's ritual rules, and a casting option a module offers. Built from the Block 2 audit (`claude/eldritch-arts-block2-audit.md`), Graham's answers Q5 and Q8, and Q9–Q14, built as proposed on 2 November 2026.

- **Install over 3.678.0.** Install Eldritch Arts 0.4.0 with it.
- **No migration prompt.**
- **What changes without Eldritch Arts:**
  - **A ritual is refused like a casting.** An antimagic zone (or any module's cast refusal) now stops the ritual before its dialog. Nothing in the core refuses a casting, so a world without such a module sees no change.
  - **A ritual's check takes the casting's spell-check gates.** In the core alone the gates are Inner Tempest's and Eldritch Arts', so nothing changes without a module that has one.
  - Everything else is asked only when a module answers it.

## New

**D13 — a ritual's rules from a sourcebook (Eldritch Arts, Chapter 7).** `registerRitualRules(key, spec)`; every function optional.
- **`variants(ctx)`:** other ways to pay the PP. They are offered in the Magic Ritual dialog as "How the PP is paid", beside "Spellcraft, paying PP". Each is keyed `<rules key>:<variant key>`.
- **`fields(ctx)`:** the rules' own fields in the dialog (Eldritch Arts' secondary casters, ritual goods, Ritual Experts).
- **`prepare(ctx)`:** what the ritual becomes once the dialog is answered.
  - **The chosen variant's own rules only** set the check's skill and DC base (Eldritch Arts: the tradition skill against the primary's level DC, Very Hard).
  - **Every module's rules** may add DC rows, check rows, seats and card lines, or refuse.
  - **Asked before the seats are counted:** a Ritual Expert's extra seat counts toward the one-secondary requirement and the 2 PP headroom (Q13).
  - **A refusal stops the ritual** before anything is rolled.
  - **A chosen variant that no module owns any more, or that gives no skill or DC,** refuses rather than going ahead free.
- **`liftsCap(ctx)`:** true lifts the ritual's Success cap (M30: "Spells with the Ritual trait ignore the core cap"). A Critical or Heroic ritual then casts the spell.
- **The ritual's DC** is the base (the casting DC by PP, or the variant's), then the core's ritual modifiers (Q5), then High Magic's Hard (Q14), then the modules' rows. Each is named on the check.
- **The ritual check takes the casting's gates.** A Suppression area's −level now reaches it, which closes 0.3.0's reported gap. The cast that follows still asks its gates with `rollsCheck: false`, so no row is counted twice.
- **The ritual is refused like a casting,** before its dialog (antimagic, Q6). That closes the other half of the gap.
- **A variant's PP are substituted, not drawn.** `castSpell`'s `ritual.variant` changes three things:
  - the primary's pool is neither tested nor drawn;
  - the degree's PP are reported as `ppSubstituted` on `trgPrimeSpellSettled`, for the module to take (Q11);
  - a primary with caster level 0 is not asked to have prepared the spell (Q10), though a caster leading a variant still is.
- **What a variant leaves alone:** the cap per cast (caster level + 1, plus the ritual's headroom; Q9, "do not bypass maximum PP per cast"). A surcharge is still paid from the pool.

**A casting option a module offers.** `registerCastOption(key, { offer, apply })`.
- **`offer(ctx)`:** returns `{label, hint, required}` or null.
  - **Where it appears:** offered options are ticks on the Casting Conditions prompt.
  - **A `required` option** (a summoning circle's Critical) is said and applied without a tick.
  - **Only a cast that has the prompt is offered options:** not an innate, item or no-check cast.
- **`apply(ctx)`:** returns `{castingDC, saveDC, label, lines}`.
  - `castingDC` joins the casting DC as its own labelled part (Spell Trickery's +2).
  - `saveDC` joins the warp's Save DC channel, as a reagent's does (a true name's +4).
  - `lines` go on the result card.
- **`trgPrimeSpellCast` and `trgPrimeSpellSettled` now carry** `castOptions` (the keys taken) and `ritualVariant`.
- **`trgPrimeSpellSettled` also carries** `ppSubstituted` and `saveResults` (each target's save: `target`, `degree`, `saved`). A true name's "if the creature gets a success or greater on its saving throw … it becomes permanently hostile" reads them.

**`basicSaveHit` may bypass every defence.** `ignoreDefences: true` is Eldritch Arts' vital sacrifice, whose damage "bypasses all DR, Resistance and Immunity". The save still decides how much.

**Found in an independent review before release, and fixed.**
- **A held rod paid as well as the sacrifice.** A rod is no longer offered for a ritual variant.
- **A refunded cast still owed its sacrifice.** `ppSubstituted` is 0 when the cast is refunded.
- **The gates were asked twice per ritual,** once on its check and again in the cast. Inner Tempest's Spiritual Distraction would have rolled two saves. The ritual's answer is now handed to the cast (`ritual.gated`), so each gate is asked once. Its casting-only rows also come off a ritual attack spell's attack.
- **A failed ritual could escape its consequences** by a cancel on the Casting Conditions prompt. A failed ritual's cast no longer asks it. If a target or warp cancel still stops it, the card says the consequences were not applied.
- **A variant was checked only after its roll.** A caster's preparation (Q10) and the cap and headroom (Q9) are now checked before the roll. Sacrifice cannot help a ritual: its DC rise would land on a check already rolled.
- **A ritual's casting could be stored** by an armed Spell Storing, dropping its degree and its sacrifice. It no longer is.

**Found, and left as it is (Graham, 2 November 2026: "No for standard rituals").** A *standard* ritual whose spell is over the caster's cap, with too little "PP over your normal maximum" entered, is still offered Overcasting by Sacrifice after its roll, as in 3.678.0 and earlier. Only a ritual variant is refused before its roll.

**Module helpers.**
- `deductGold(actor, gp)` takes a material sacrifice from the purse as Learn a Spell takes its materials, and says a shortfall rather than taking it.
- `learnSpellDC(spell)` is Borrow Spell's "normal DC to learn the spell", with the rarity raise.
- `keepsSpellbook(actor)` is Learn a Spell's own test: only a book caster may borrow, or lend.
- `goldOf(actor)` is the purse in gold, as the core counts it, so a material sacrifice and the Ritual Censor's incense are checked before the roll.

## Harness

- **New pair: `verify-ea-block2b-core` (52 checks) and `mutate-ea-block2b-core` (60 mutations, all caught).** They cover:
  - R, the ritual rules:
    - registration;
    - the variants keyed by their module;
    - the fields;
    - the plan: the owner's DC and skill only, everyone's rows and seats, a refusal, a vanished variant, a variant with no skill, a failing owner or bystander;
    - the cap, lifted only on `true`;
    - the degrees that cast.
  - RW, the ritual wired:
    - refused before its dialog;
    - the variant select and fields;
    - the plan before the seats;
    - the DC's parts (Q5, Q14);
    - the skill check;
    - the gates, once;
    - the cap;
    - the cast told the variant;
    - in `castSpell`: the pool neither tested nor drawn, the cap kept, the non-caster's preparation (Q9–Q11), the settled hook;
    - the review's six fixes.
  - O, the casting options:
    - registration;
    - offered, ticked or required;
    - applied to the casting DC, the Save DC and the card;
    - only on a cast with the prompt;
    - the hooks.
  - H, the helpers:
    - the API;
    - `deductGold`, `goldOf`, `learnSpellDC` and `keepsSpellbook`;
    - `basicSaveHit`'s bypass.
  - Z: the version.
- **Re-anchored to lines this release moved:**
  - **The pool test:** `verify-block36b` (E3c, D3), `mutate-block36b`, `verify-spell-storing` (G5b), `verify-ea-block1-core` (C3) and `mutate-ea-block1-core` take the pool test's new form.
  - **The settled hook:** `verify-block8-core` (C5) accepts its new lines, and `mutate-ea-block2-core`'s settled-hook mutation goes at its new line.
  - **The Casting Conditions prompt:** `verify-chapter6-gear-181-190` (H12) accepts the prompt's new argument.
  - **The ritual:** `verify-chapter9-241-250` reads the ritual's own lines (I13 the cast's `variant` and `gated`; R1 the Spellcraft copy, now one branch of two), and `mutate-chapter9-241-250` goes at them.
  - **The gates handed in, the rod and Spell Storing:** `verify-block8-core` (C5's gate), `verify-block36b` (E3e) and `verify-spell-storing` (G1) and `mutate-spell-storing` take the review's lines.
- **Re-pinned to 3.679.0:** the version anchors of the mutation files and the release link.
- **Full sweep on the staged 3.679.0** (`tools/verify.mjs`, 661 harnesses, on a copy checked identical to the source first, after the review's fixes and the re-anchoring above): **all 661 pass**, with `verify-rules-have-callers` and `verify-no-undefined-names`.
- **Inner Tempest 1.0.4 on 3.679.0:** Blocks 1–4, 6–10 and the weapons all green.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
