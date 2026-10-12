# TRG Prime 3.632.1 — the module's Chapter 3 feats are the module's

10 October 2026. Two corrections to 3.632.0. Both were found by reading the Fiends & Fables Prime 0.11.1 source once Graham uploaded it. The block-2 audit was written without the module and counted these three feats as missing; they are not.

## Abyssal Familiar and Nirvanic Familiar: the module's button again
- Module 0.11.1 already ships both feats with a Use button (`scripts/feats-framework.mjs`), live-tested on 4 September 2026. It draws the Quasit or Cherubim from the creature compendium as a linked creature familiar with its printed statistics (DB 15, HP 35 for the Quasit), carries the chosen familiar abilities across, and retires the old familiar actor.
- The module registers its button only when core has no key of that name ("core has since built it — its version wins"). 3.632.0 added core keys, which would have replaced the tested behaviour with a different one: rebuilding the `familiar` actor in place on the master's mirrored numbers. **3.632.1 withdraws core's keys and `becomeCreatureFamiliar`**, so the module's button acts as it did in 0.11.1. Ruling 5 is satisfied by the module.

## No duplicate feats
- 3.632.0 also authored Abyssal Familiar, Nirvanic Familiar and Scaly Resilience in core's feats pack. Core federates the module's `feats` pack with its own (`sourcebooks.mjs`), so each would have appeared twice in the picker. `declare-ff30-codex` now removes any core copy.
- Scaly Resilience's automation (ruling 4) is unchanged. It is read by name in the area rail, so it acts on the module's feat.

## Harness
- `verify-ff30-block2` C1 now checks that core does not duplicate the three feats. B12 checks that core registers no familiar key over the module's, and its mutation adds one back. 39 checks, 39 mutations, all caught.

## For the module's next release
- Scaly Resilience in the module carries a manual +1 conditional (`auto: false`). Core now applies the +1 and the resistance automatically against a declared breath, so that row should go to avoid a double count if it is ticked.
- `dragon-framework.mjs` writes the `breath` flag that core reads as a declared breath (3.632.0, ruling 16), so regenerated dragons stay rollable.
- The module's data cites Fiends & Fables 2.7 and 2.8. The creature stat-block audit against 3.0 is where those differences land.
