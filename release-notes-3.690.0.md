# TRG Prime 3.690.0

14 November 2026. The seams Eldritch Arts' Block 9c (its orbs, rods and staves, and the Spellhold rune's store) needs: **H23**, a kind of charged item a module registers (the Orb); **H24**, a casting option's Save DC for every target with a trait (the rods' powers) and the rod helpers; **H25**, one invested item per trait; and **H26**, held spells (Spellhold). From the Block 9 audit as Graham answered it ("Go with your recommendation for all questions and proceed", 13 November, 00:23) and his answer on Spellhold ("Yes build it", 14 November). Built on 3.689.0. No migration; no world data is touched. Every addition is read only for an item, a kind, a trait or a window a module declares, so nothing already in a world behaves differently.

Eldritch Arts 0.15.0 needs this release.

## H23: a kind of charged item (the Orb)

`registerChargedKind(key, spec)`. An item whose `chargedItem.kind` is `key` is read through `spec` wherever the core would treat it as a staff or an "other" item. The core's own kinds (staff, rod, wand, scroll, other) cannot be registered over.

| Key | What it does | The Orb |
|---|---|---|
| `warp: "staff"` | Cast from Item warps its spells from its own PP, up to its level, as a staff | Q210: "a spell from an orb may be warped from the orb's PP" |
| `naturalRecharge: false` | daily preparation regains nothing, and says so | "Orbs cannot recharge naturally" |
| `rechargeItemPP` | Recharge Item's PP for an item of the kind, and its picker shows it | "The PP cost is 4 instead of 2" |
| `releaseOptions(ctx)` | the release ladder in place of the core's, with `dcParts` that join the DC as labelled parts; handed the spell's traits | Spellcraft Hard with no tradition asked, High Magic's +2 on top; the tradition skill Very Hard |
| `depletion(ctx)` | asked when Charge Depletion is rolled; an answer that `replaces` the row stops the core's | the 41–65: a Resonant Flare, 0 PP, not broken |

And with it, for a charged item's own abilities (an orb's, a staff's):

- **`minItemPP`** on a wondrous ability or an item conditional: read only while the item holds that many PP ("Such abilities will stop working if the Orb is reduced to 2 PP or less"). The sheet says why a wondrous ability is not working; an item conditional below its PP is simply not offered.
- **A wondrous `resistance`** (a damage type), joined to the bearer's resistances as a rune's are.
- **A Spell Adder scoped to spells with a trait** (`spellTraits`). The cast offers an adder use only from the sources that pay for its spell; the day's uses are one count, as before.
- **`requiresArcaneOrHighMagicCaster`** on a wondrous ability: an arcane caster, or a High Magic caster of any tradition or of some (the Witch's). `isHighMagicCasterAtAll` answers the second.

## H24: the rods' powers

- **A casting option's `saveDCTarget` may name creature traits** (`{ traits: ["undead"], value: 2 }`), matched against each target as it saves, so a target chosen after the prompt is read; and may be several rows. A row naming one creature (Sanguine Channel's) works as before.
- **Module helpers `spendFromRod` and `rodUseRefusal`**: a rod's power paid through the one charged-item spend path (a rule's cut, the round's Rod stamp, Charge Depletion), and whether a Rod may be used now.

## H25: one invested item per trait

`registerOneInvestedTraits(traits)`: the Staff trait's rule for a trait a module names. Invest Item, and the module refusal it shares, refuse a second invested item with the trait. Eldritch Arts names ORB; Block 10's RELIC and SENTIENT will use it.

## H26: held spells (Spellhold)

A store that holds spells already rolled, beside Spell Storing's (whose check waits for the release):

- **A hold window** is Spell Storing's own window, marked `hold` with the store's room in PP (helper `armHold(actor, item, { capacityPP, label })`). The next cast lands in it.
- **The held cast is cast up to its check.** No targets are picked; its actions, its check, its PP (by the degree) and its Save DC are paid and set as any cast's. A spell that does not fit — the store's room, or more than the caster's cap on one cast — is refused before anything is spent. On a Success or better it is **kept** (its check's total, degree, margin and die, its Save DC, its warp) and the cast stops; on anything less it runs on as the failed cast it is, Fumble and all. Either way the window closes. A `trgPrimeSpellHeld` hook announces a held spell.
- **The release** (helper `releaseHeldSpell(actor, item, id, { ap })`) casts it with the check it was stored with: no PP, no new check, its warp as stored, its targets and area chosen now, its natural die standing, its Save DC the one it was stored with, and no reroll. It rides the path a woven spell already takes (S-M11), but the hooks say `held`, not `threaded`. Its AP are asked first and spent only once it is cast; a release called off at the target picker keeps the spell.
- **Helpers** `heldSpellsIn(item)` and `clearHeldSpells(item)`.
- **Paid and rolled at storing (Graham's rulings, 14 November 2026).** A held spell's PP cost cuts and PP sources apply as on any cast (Spell Storing's still don't). Its module metamagic and PP sources are settled when it is held, told `holding`. Its Resonance — chaos on the check, a named natural (Shadow Walk's 13), a module's forced Resonance — is rolled when it is stored; its release rolls none. `resonanceContext` is now declared above the hold exit.
- **Still to come, separately:** the core's own rods (a metamagic rod, a Rod of the Magi draw, an accuracy rod) can be combined on one cast, although "only one Rod may be used each round". This was in the core before this release; a fix will be prepared for approval after it.

## Graham's 3.689.1, merged

3.690.0 carries Graham's own 3.689.1 change. His zip changed one file, `module/picker-filters.mjs`. The rest of his zip matched 3.689.0, apart from the version number and the packs that Foundry V14 had rewritten when it opened them.

- **What it does:** `blockingArchetype` now honours an archetype-progression waiver from a registered feat-pick bonus (`registerFeatPickBonus`). A bonus row's `archetypeProgressionWaivers`, capped by its `archetype` picks, exempts that many of the actor's own archetype feats from their progression requirement before the picker looks for one blocking a new archetype. A failing provider grants no exemption.
- **Merging it:** `picker-filters.mjs` had not changed between 3.689.0 and 3.690.0, so his file was taken as it was, converted from Windows (CRLF) line endings.
- **The packs were not merged.** Every document matches 3.689.0 except for fields Foundry fills in or moves itself: effect `changes` moved under `system.changes`, the duration fields, and data-model defaults. No existing value differs and no document was added or removed. 3.690.0's packs are built from source as usual.

## Found in the independent review, and fixed

- **A wand's, scroll's or potion's spell no longer falls into an open storing or hold window.** Such a spell is a copy that isn't on the caster's sheet, so it was paid for, stored, and then lost at release. The window now stays open for a spell of the caster's own. This also applies to Spell Storing, which had the same gap.
- **A held spell keeps its casting options' target rows.** Soul's Echo's +2 against undead, and any attack-only bonus, are stored with the spell and applied to the targets chosen at release. Before this they were paid for and dropped.
- **The host is found once,** before the cast is paid for. A window that lapses while the cast's dialogs are open no longer sends the spell elsewhere, or lets it resolve with no targets after its PP were spent.
- **The cast hook of a spell being held names no targets,** and says `holding`. Before this, whatever tokens happened to be targeted were reported, and Alien Mind, Reflective Scales and Aligned Control reacted to them.
- **A woven or held release is offered no casting options.** It shows no prompt, and an offer must not disturb the first spell's choices.
- **Spellhold does not overwrite an open Spell Storing window,** which had already been paid for.
- **A second independent review** of these fixes found no TDZ errors, no double payments, and the PP sources charged before the hold exit; its points (the lent round, a stale store list, and the module's two rod points) are fixed.
- **One held spell can't be released twice.** A second press while the first release waits at its target picker is refused, and a release reads what the staff holds again once its spell is cast, so two releases from one staff can't bring a spent spell back.
- **A lent metamagic's round is spent** when its cut paid for a held spell (H9), as it is for any cast.
- `trgPrimeSpellHeld` now carries the cast's `castOptions`.

## The harness

- **New pair `verify-block9c-core`** (71 checks) and **`mutate-block9c-core`** (85 mutations, all caught).
- **Re-anchored, no change of meaning** (each marked in the file):
  - `verify-block39-traits` G5: Invest Item's Staff refusal line now carries the module trait's.
  - `verify-chapter10-321-330` W7: the per-target save hands the target itself to the option rows.
  - `verify-fixes-3688-2` and its mutation: a registered kind's DC parts join the release's DC.
  - `verify-ea-block2b-core` RW and `verify-spell-storing` G1 (with their mutations): the storing gate now also says a held release is never stored.
  - `verify-ea-block6a-core` M28/M30: the cast's hook payload says `threaded: woven, held: heldRelease`, and a held release joins the prelude-owed list.
  - `verify-ea-block6d-core` P11/O6 (with the O2 mutation): the same payload, and the per-target DC rows now also match on creature traits.
  - `verify-spell-storing` G5/G5b, `mutate-spell-storing` R1/B5: the store's exit is `storingNow && !holdingNow`; two mutation anchors widened because the held record and release repeat a line.
  - `mutate-ea-block3a-core` (two mutations): the settled hook's natural-die line widened by its comment, as the held record repeats it.
  - `verify-ea-block6a-core` M21d/M31/P6/D5/R1b and `mutate-ea-block6a-core`, `verify-ea-block6b-core` F12 and `mutate-ea-block6b-core`, `verify-chapter10-311-320` W1b and `mutate-chapter10-311-320`: a held spell now settles and rolls its Resonance at its hold exit, so each points at the cast's own settle, forced-Resonance loop and named-natural trigger; and the cost cut and PP sources read `storingUnpaid`.
  - `mutate-release-links`: the download-URL anchor pinned to v3.690.0 (missed by the pins script).
  - `tools/uncalled-exports.json`: five keeps, each with its reason (three reached through the module helpers, two exported for the harness).
- **Version pins** raised to 3.690.0.
- **Full core sweep** on the final tree (4 shards, 741 verifiers and mutation files): 0 failures in the code; the four files above failed on their anchors and were re-anchored and rerun clean, with their paired mutations.
