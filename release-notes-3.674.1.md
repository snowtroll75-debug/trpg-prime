# TRG Prime 3.674.1

28 October 2026. Fixes from the live test of 3.674.0 and Inner Tempest 1.0.0 (`live-testing-report-3.674.0.md`). Graham: "Build fixes 1-5 and amend text on point 6".

- **Install over 3.674.0.** Inner Tempest 1.0.1 needs it.
- **No migration prompt.**

## Fixed

**A player can now create a companion.**
- **The fault:** Dragon Tamer's hatching, as Test PC 1, was refused: "User Test PC 1 lacks permission to create Actor". The world lets only GMs create actors. The core Animal Companion feat creates its companion the same way, so it failed for players too.
- **The fix:** when the player may not create actors, the GM's client creates the companion through the relay. The player owns the companion, so their client then fills it as before: class, base creature, grants, flags and the creation card.
- **What the GM's client checks:** the request must be a companion, bound to the character asking, and asked by that character's owner. Anything else is refused.

**A new companion arrives at full HP.** It used to keep the template's 30 HP (a cold dragon at 30 of 76) through every level after. Its HP is now set to its maximum once its class, base creature and grants are on it.

**A companion's grants prefer its own book.**
- **The fault:** the class, base creature and creature type a companion is made from lost their compendium source when copied onto it. So a name two books share could not be settled. A dragon's "High Magic" tied with Fiends & Fables' own "High Magic" and was not granted. The unresolved name also posted an "Apply Grants" card on every later change to the companion.
- **The fix:** the copies keep their compendium source, so the base creature's own book wins.

**Hurling's old note is amended.**
- **The fault:** copies the 3.666.1 repair never reached (a Fiends & Fables creature's) still said "(the flat ability bonus is added by hand)", beside damage that now adds it.
- **The fix:** the cast card now says "(added to the damage roll for you)". This happens only when the damage does add the ability, which 3.674.0 made true for those copies.

**A kind's own setting-up comes before the creation card.** Found in the retest: a dragon's card said Will +12 while its sheet said +14, because the card was written before the dragon's printed Iron Will arrived. `createCompanionFor` now takes `beforeCard(companion)`, awaited before the HP and the card. Inner Tempest 1.0.1 hatches its dragon's printed feats, ranks and fields there.

## Harness

- **`verify-block10-core`:** 49 checks; **`mutate-block10-core`:** 79 mutations, all caught.
- **Re-pinned to 3.674.1:** the version mutations of the Block 6–10 core pairs, the two fix pairs and the release links.
- **`tools/uncalled-exports.json`:** a keep for `companionRelayRefusal`, which the relay calls in its own file and the harness drives.
- **`verify-actor-handle`:** the relay's fetch of the new companion is declared. It is a world actor fetched by the id the GM's reply names, as `companion-workflow.mjs` already is.
- **Full sweep on the staged 3.674.1:** 653 harnesses. 651 passed; the actor-handle pair failed only on that undeclared site, and is green once declared.
