# TRG Prime 3.687.0

12 November 2026. The seams Eldritch Arts' Block 8b needs: **H13**, **H14**, **H15** and **H16** of `ELDRITCH_ARTS_BLOCK8_AUDIT.md` §6, as Graham answered it on 8 November (17:22: "As recommended", Q167–Q184 as each row recommends, H12–H18 approved). Block 8b is the Grimoire's second half, second part: the ten rituals and the seven High Magic spells tied to Chapter 7 (Eldritch Arts 0.12.0). Built on 3.686.2.

- **Install over 3.686.2.** No migration. **No core spell changes**, and no world data is touched: every seam here is default-off, used only by a module that asks for it.
- **Eldritch Arts 0.12.0 needs it.** Eldritch Arts 0.11.2, Inner Tempest and Pillars of Faith run on it unchanged.

## H13 — a Ritual spell's Partial casts

Graham's Q171: "A Ritual spell's printed Partial takes effect, and no PP is lost (the base Partial)… Where no Partial is printed, the Failure line applies as m42 says, and still no PP is lost."

- **Before:** a ritual's Partial never reached the spell. `rollMagicRitual` posted "The spell fails, but no PP is lost" and stopped, so seven Eldritch Arts rituals' printed Partial lines (and Army of the Grave's, which "replaces the normal partial result") could not happen.
- **Now:** `registerRitualRules` takes `partialCasts(ctx)`. When a module answers `true` for the spell, the ritual's Partial calls `castSpell` with `ritual.partialCasts`. There, `castingOutcome(…, { castsPartial })` makes the Partial cast for **0 PP** with **no fumble roll**, and `trgPrimeSpellSettled` carries `degree: "partial"`, `ritual: true`, `cast: true` and the cast's Save DC. The ritual card says "Partial: the ritual's partial result is applied. No PP is lost; what the result does is the spell's own, on its card." (A ritual whose printed Partial is its Failure line, m42, still has consequences; the module's card says them.)
- **The order:** the Partial is asked after the casting's degree remaps. A Magic Suppression area's "partial … classed as a failure" still makes it a failure.
- **Two consequences:**
  - A cast Partial is not a failed ritual, so casting options and conditions are asked of it as of any cast.
  - Variable Success is not offered on a ritual's Partial: the ritual decided that degree. Before 3.687.0 a ritual's Partial never reached `castSpell`, so nothing that ran before changes.
- **Default-off:** with no module answering, every ritual behaves exactly as in 3.686.2. The core's own rituals (Clone and the rest) are unchanged.

## H14 — a ritual performed by its primary alone

Graham's Q172: Elemental Convergence, Essence Reforging and Eternal Invocation print no secondary casters, so "the primary may perform those three alone (with no overcasting room)".

- `registerRitualRules` takes `minSecondaries(ctx)`. An answer of `0` lets the ritual go ahead with no secondary caster; nothing else does (1, blank, null or a throw).
- **The overcasting room is unchanged:** 2 PP a secondary, so none when alone, and the cap per cast stands.
- The ritual card says "Performed by the primary caster alone, as this ritual allows: no secondary casters, so no PP over the maximum."
- Every other ritual still refuses with "A magic ritual needs at least one secondary caster."

## H15 — rest rates from an effect

Eternal Invocation: creatures sharing the caster's aligned traits gain "Double natural HP recovery / Double PP recovery"; those of an opposed aligned trait "Half".

- **New file `module/rest/rest-rate.mjs`:** an ActiveEffect may carry `flags.trg-prime.restRate = { hp, pp, label }`, each a multiplier (2 doubles, 0.5 halves; anything outside 0.1–10 is ignored).
- The rest multiplies its Natural Healing by every live `hp` and the PP it recovered by every `pp`, as Quick Recovery's ×2 and Healing Trance already multiply. A double and a half cancel. A disabled or suppressed effect gives none. The result is rounded down (m128).
- It moves neither maximum HP nor the PP a long spell locks, nor Soul Drain, Doomed or fatigue.
- The rest's summary card says it, for example *"Natural Healing doubled, PP recovery doubled (Eternal Invocation)."*
- **The standalone Power Point Recovery dialog** (cast-workflow, the active, resting and sleeping modes) applies the `pp` rate too, and its card's label says so. Found by the review.

## H16 — a storm whose strike is rolled, at its caster's turn start, that may follow its caster

Storm of Unmaking: "When you initially cast the spell and then at the beginning of each of your turns, roll 1d6"; its fumble, "storm appears above you and follows you wherever you go" (Graham's Q182: the storm as if cast, a 60-ft radius on you, moving with you, for the spell's minute, striking at once and at the start of each of your turns, everyone in it saving against your Save DC, you included).

- **The `storm` row takes three new keys.** Each defaults to Storm of Vengeance's reading, so it is unchanged:
  - `pick`: `"choose"` (the default) or `"roll"`, a die over the modes in printed order, where a mode may repeat;
  - `strikes`: `"sustain"` (the default) or `"turnStart"`, which strikes at the cast and at the start of each of the caster's turns, and never on a Sustain;
  - `follow: true`: the storm's circle moves with its caster's token.
- **The rolled strike** says its face on the card: "the storm's 1d6 — 4, Acid".
- **The turn start** (`documents/combat.mjs`, beside the turn ladders, on the acting GM) strikes the turn-start storms of the creature whose turn it is. It skips one whose cast has ended, and removes a module's storm whose own clock has run out ("the storm passes").
- **A following storm** is moved on the acting GM's `updateToken`. Where the move ends is read from the change, not the document, which is still at its start while V14 animates the move.
- **A cast's turn-start storm keeps its own clock** (found in the live test, below): the duration as cast, warps included.
- **`helpers.placeStorm(actor, row, { centre, radiusFeet, follow, dc, castId, seconds, spellName, baseDamage })`** lets a module raise a storm after a failed cast. It makes a circle on the caster, strikes at once, and keeps its own clock of `seconds`. That clock ends it at a turn start or on the world clock (`updateWorldTime`, the acting GM, every scene).

## The harness

- **New pair:** `tools/verify-block8b-core.mjs` (60 checks) and `tools/mutate-block8b-core.mjs` (58 mutations, all caught). It drives H16 on a fake board: the rolled face, the follower and its acting-GM guard, the turn start, an ended cast, the own clock at the turn start and on the world clock, and the registered hooks.
- **Re-anchored**, to the new lines and with no change of meaning:
  - `verify-ea-block2b-core` (three checks: the cast told the variant and now the Partial, a failed ritual's prompt, the seats counted before the refusal);
  - `mutate-ea-block2b-core` (two mutations, and `ritualCasts`' new form);
  - `verify-chapter9-241-250` I13 and `mutate-chapter9-241-250`;
  - the version pins in every harness that names the release (3.686.2 → 3.687.0).
- **Deliberate keeps** in `tools/uncalled-exports.json`, each with its reason:
  - `followStorms` and `expireStorms`, harness seams whose one caller is `registerStorms`' hooks;
  - `placeStorm`, the module API through `helpers`;
  - `REST_RATE_FLAG`, the module contract's flag name;
  - `normaliseRestRate`, a harness seam.
- **Full sweep:** see "Checks" below.

## For Graham

1. **Variable Success and a ritual's Partial.** It is not offered on one. The ritual decided the degree, and the book does not say a ritual's Partial may be bought up. Before 3.687.0 the question could not arise.
2. **Still open from 3.685.3/3.686.2, not in this release:** the stale `updateToken` readers listed with Eldritch Arts 0.11.2 (`geometry`, `creature-aura-workflow` L878, `light-shift-workflow` L175, `inscribed-rune-workflow` L127, `underwater-workflow` L66). They wait for a release of their own, with a live test.
3. **The connection election (3.686.2)** has still not had a live test with two GM tabs open.
4. **A turn-start storm strikes only on the scene the acting GM is viewing.** `tokensInRegion` reads the canvas's placeables, as every core storm and emanation does. A storm on another scene keeps its clock (the world-clock expiry runs on every scene) but does not strike there until that scene is viewed. Left as it is: changing the reader touches every area spell.

## Found in the live test (12 November)

Tested in your world with Eldritch Arts 0.12.0 (see `claude/eldritch-arts-live-testing-report-0.12.0.md`). One core fault, fixed:

- **Storm of Unmaking, cast successfully, struck once and never again, and never passed.** Its "1 minute" is not a duration the active-spell registry records (it is not sustained, not dismissible and locks no PP), so the turn start found no running cast for its cast id. The fake-board harness had given the storm an active entry, so it never saw this.
- **The fix:** the cast now gives a storm that strikes at the turn start its own clock, the duration as cast with warps. It then strikes at each of the caster's turn starts and passes on its time, as a module's storm (`placeStorm`) already did. Storm of Vengeance, whose cast is a sustained entry, is unchanged.
- **Checks:** a board check that a cast's storm with its own clock strikes with no active entry and passes at its time; a check on the cast site; three mutations.

## The independent review

An independent reviewer read the 3.687.0 diff and Eldritch Arts 0.12.0 against the audit. Its core findings, both fixed:

- **The Partial's card line overclaimed** ("no participant faces the failure's consequences"): for a ritual with no printed Partial the Failure line applies, consequences included. Softened as above.
- **The standalone PP Recovery dialog ignored H15's rates.** Fixed as above, with a check and a mutation.

## Checks

- `verify-block8b-core` 60/60; `mutate-block8b-core` 58/58 caught.
- The full sweep of every `verify-*` and `mutate-*` (727 scripts) on two copies of the tree. The four that went red on the copies (`verify-rules-have-callers`, `verify-checks-can-fail`, `verify-chapter9-241-250` with its mutate, `mutate-ea-block2b-core`) were re-anchored or given keeps, and re-run green on the final tree. After the review's fixes, the scripts that read the changed lines were re-run on the final tree: `verify-block8b-core`, `verify-ea-block2b-core`, `verify-chapter9-241-250`, `verify-control-register-api`, `verify-fixes-3686-2`, `verify-no-undefined-names`, `verify-imports-resolve`, `verify-rules-have-callers`, `verify-checks-can-fail`, and the mutates `mutate-block8b-core`, `mutate-ea-block2b-core`, `mutate-chapter9-241-250`. All green.
- After the live test's fix: `verify-block8b-core`, `verify-walls-storm`, `verify-missile-storm`, `verify-live-3610`, `verify-cast-result-line`, `verify-ea-block3b-core`, `verify-ea-block5b-core`, `verify-ea-block2b-core`, `verify-chapter9-241-250`, `verify-no-undefined-names`, `verify-imports-resolve`, `verify-rules-have-callers`, `verify-checks-can-fail`, and `mutate-block8b-core` and `mutate-walls-storm` (on a copy). All green.
