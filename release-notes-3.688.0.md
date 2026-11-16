# TRG Prime 3.688.0

13 November 2026. The seams Eldritch Arts' Block 9a needs: **H19** and **H20** of `ELDRITCH_ARTS_BLOCK9_AUDIT.md` §6, as Graham answered it on 13 November (00:23: "Go with your recommendation for all questions and proceed", Q185–Q210 as each row recommends, H19–H25 approved). Block 9a is Chapter 6's catalysts, the four catalyst feats and the ten special materials (Eldritch Arts 0.13.0). H21–H25 come with Blocks 9b and 9c. Built on 3.687.1.

- **Install over 3.687.1.** No migration. **No core item, spell or material changes**, and no world data is touched: both seams are default-off, used only by a module that registers something.
- **Eldritch Arts 0.13.0 needs it.** Eldritch Arts 0.12.1, Inner Tempest and Pillars of Faith run on it unchanged.

## H19 — an item a module offers at the cast

Chapter 6's catalysts: "consumed immediately upon use, whether the spell succeeds or fails"; "A spellcaster may use only one catalyst per spell"; and each one's effect reaches the cast (advantage on the check, a die step, added damage, a Save DC, the range or duration, a PP off, an ignored resistance).

- **`registerCastItemOption(key, { label, offers, apply, settle? })`**, exposed on the module API:
  - `offers(ctx)` → `[{ itemId, label, hint?, consume? }]`, the caster's items of that kind that fit this cast (an id the caster does not own is dropped);
  - `apply(ctx)` with the chosen `item` → an answer in the module-metamagic vocabulary (G1: `mods`, `checkBias`, `discount`, `addTraits`, `addedDamage`, `saveDC`, `rangeFactor`, `durationFactor`, `areaFactor`, `dieStep`, `lines`) and four keys of its own: `checkModifiers` (typed rows on the casting check, `item` by default), `attack` and `attackType` (a row on the spell attack), `ignoreResistance` (damage types). `{ cancel: true, reason }` cancels the cast. Nothing else is read: no PP of its own, no free warp PP, no DC or AP rows.
  - `settle(ctx)` (optional), once the cast has settled, with its degree, `cast`, the PP as cast and paid and the saves → `{ lines, keep? }`.
- **One prompt, before the cost test** (`magic/cast-items-workflow.mjs`): one select per kind with an offer, "None" first and selected. No kind with an offer: no prompt. A closed prompt cancels the cast, as the Casting Conditions prompt does. It is asked before the cost so that a discount (Resonant Crystal Shard) reaches the payment (G4: payment only, Q93/Q189).
- **Not asked** for a cast from an item, an innate spell, a ritual (Eldritch Arts' ritual catalyst is a ritual-rules field, below), a stored, storing or threaded spell, a cast whose check is a Strike's roll (Thunderous Strike: its dice are rolled and its modifiers are the Strike's; found in review), or a cantrip with no attack.
- **Not what Q186 ruled, for two paths:** Q186 offers catalysts on a ritual's primary and on a charged item's Spellcraft path. The ritual's check is rolled before `castSpell`, so a cast item cannot reach it; Eldritch Arts offers its ritual catalyst through the ritual dialog instead. The charged item's Spellcraft path is left for Block 9c, with the charged items. Both are for Graham to confirm.
- **The fold:** the answer joins the cast through `foldModuleMetamagic`, as a module metamagic's does: its dice and warp factors with the warps', its bias joined to the check's, its discount with the others, its traits on the cast's context. Its check modifiers follow the reagents' on the casting check; its attack row joins the spell attack's rows; its ignored types join the cast's resistance bypass (`setResistanceBypass`, merged with a next-spell boost's). The card says "**Catalyst:** <item>." and the module's lines.
- **The spend:** after the cast has settled and before `trgPrimeSpellSettled`, each chosen item's `settle` runs, then one of it is spent (the last one deletes the item) unless `consume: false` or the settle answered `keep: true` (Catalyst Conservation). It has a card of its own. A failing `apply` says so on the card and spends nothing; a failing `settle` says so and still spends.
- **A cast called off and refunded** (its area's placement cancelled: PP and AP given back) settles nothing and spends nothing; the card says "<item> is not spent: the cast was called off." (Found in review: Sands of the Hourglass gave its AP on top of the refund.) A decision for Graham to confirm: the book says only "consumed … whether the spell succeeds or fails".
- **`trgPrimeSpellSettled` carries `castItems`:** `[{ key, itemId, itemName, kept }]`.

## A ritual's roll, settled for a module

Blood-etched Vellum (+2 to the ritual check) is "consumed immediately upon use, whether the spell succeeds or fails". A ritual's Partial that does not cast, and a cast stopped short, reach no `trgPrimeSpellSettled` (found in review).

- `registerRitualRules` takes **`settled(ctx)`**, awaited once the ritual's roll is resolved, whatever its degree and whether or not the spell was cast, with `degree`, `rawDegree`, `cast`, `partialCasts`, `settled` (false when the cast stopped short), `pp` (as cast) and `variant`. Its `lines` are posted on a card of their own (`magic/ritual-rules.mjs` `settleRitual`).
- Default-off: with no module answering, a ritual is exactly as in 3.687.1.

## H20 — a special material a module adds

Chapter 6's ten special materials: "may be selected when crafting weapons, armour, shields, or equipment, following the same guidelines as those found in the Core Rulebook."

- **`registerMaterial(key, spec)`**, exposed on the module API. The key is letters and digits; a label is required. The spec is the core table's own vocabulary (`rarity`, `levelDelta`, `appliesTo`, `hpPercent`, `hpMultiplier`, `weightPercent`, `armourWeightPercent`, `armourAcpReduction`, `armourMaxDexBonus`, `armourSpeedPenaltyReduction`, `weaponExtraDie`, `weaponGrantsTrait`, `overcomesResistance` and the rest), and four keys of its own:
  - `weaponDamageVs: [{ dice: "die" | "<n>" | "<NdM>", against: [words], label }]`, added to a strike's own damage against a creature whose type or trait is one of the words, as a Bane rune's is (`rune-damage.mjs`; "die" is the weapon's own die). Not for ammunition.
  - `declares`: the rune vocabulary (`rune-declarations.mjs`: conditionals, bonuses, strikeRider …), read by the same readers while the item counts, as a rune's is.
  - `declaresByType: { weapon?, armour?, shield? }`: the same for one type of item, read in place of `declares` for an item of a type it names, because a material's bonus is usually printed for one kind ("Bloodglass armour …", "Tairneach weapons …").
  - `note`: what the material does that nothing applies, shown under the item sheet's Material line (`context.materialNote`; the three Material lines of `templates/item/item-sheet.hbs`). Found in review: without it, what a module leaves to the GM was said nowhere.
- **`materialOf(key)`** (`item-quality.mjs`) is now the one reader of a material: the core's table first, then a module's. **A module key the core's table holds is refused** (`registerMaterial` returns false and says so; the table's keys are told to the registry by `item-quality.mjs` as it loads, `setCoreMaterialKeys`, since the registry cannot import it back without a cycle). Every read of the frozen table goes through it: the level, the armour and weapon modifiers, the defence word, the pickers (`applicableMaterials`, a module's after the core's), the item sheet's label and the oil workflow's.
- **Not modelled, as for the core's own materials:** hardness; and a weapon's HP and weight take nothing from its material (`computeWeaponModifiers` reads neither), so a material's "all items weigh half" or "50% more HP" reaches armour and shields only. A shield's weight reads `weightPercent`, not `armourWeightPercent`.

## The harness

- **New pair:** `tools/verify-block9a-core.mjs` (80 checks) and `tools/mutate-block9a-core.mjs` (71 mutations, all caught). H19: the registration and its refusals, the offers' cleaning, the answer's whitelist and what it drops, the prompt (none without an offer; None first; a closed prompt cancels), the fold into the aggregate, the check, attack and bypass rows, the settle and the spend (kept, consumed, deleted at one), the report on the hook, and where in `castSpell` each lands. H20: the registration, `materialOf` and the core's winning a clash, the pickers, the level, the armour and weapon properties, the silver word, `weaponDamageVs` with and without a target, `declares` and `declaresByType`, the refused core key, the sheet's note, and that no reader of the table is left outside `materialOf`. The ritual's `settled`: its registration, its call after the roll with the PP as cast, its card.
- **The version pins** in every harness that names the release (3.687.1 → 3.688.0).
- **Re-anchored**, to the new lines and with no change of meaning (a cast item's attack row, card lines and hook key join lists these checks pin; the ritual's `castResult` is declared before its call; `settled` joins the ritual rules' functions):
  - `verify-block36b` E4b;
  - `verify-block8-core` C5 (two checks) and `mutate-block8-core`'s "the gate's lines never reach the card";
  - `verify-block8b-core` H13 and `mutate-block8b-core`'s "partialCasts is not a known rules function";
  - `verify-chapter6-gear-181-190` H15;
  - `verify-ea-block2-core` D1, D7 and D7b, and `mutate-ea-block2-core`'s D7;
  - `verify-ea-block2b-core` O;
  - `verify-ea-block3a-core` N;
  - `verify-ea-block6d-core` O5 and `mutate-ea-block6d-core`'s O5.
- **A survivor from 3.687.0, closed:** `mutate-inscribed-runes`' W14 (the rune's 24-hour warp) survived, because 3.687.0's turn-start storm clock reads the warped duration with the same call. `verify-inscribed-runes` W14 now pins the rune's own line.
- **The full sweep** (`tools/verify.mjs`'s order, run in shards on copies of the tree): every pair passes. Each failure it found was one of the re-anchors above or the W14 survivor. Each of those harnesses was fixed, then its verify and mutate were run again and pass, along with `verify-no-undefined-names`, `verify-rules-have-callers`, `verify-checks-can-fail` and `verify-checks-read-source`.

## The independent review

An independent review read both seams and Eldritch Arts 0.13.0 against the book and the audit. Its core findings, each fixed above: a Strike-check cast was offered catalysts that could not reach its check; a refunded cast spent them; a ritual Partial that does not cast never settled the ritual's catalyst; a material's GM note was shown nowhere; a module key clashing with a core material was accepted and silently shadowed. It found the discount's placement (payment only), the fold (no PP or keys leak), the cancel paths, the single settle, the resistance-bypass merge, the attack rows and `materialOf`'s coverage correct.
