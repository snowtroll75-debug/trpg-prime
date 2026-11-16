# TRG Prime 3.693.0: the seams for Eldritch Arts Block 10

15 November 2026. Graham approved both seams with the rest of the Block 10 audit ("Go with your recommendations"). **Eldritch Arts 0.17.0** (the relics and Dawnshield) uses both and needs this release. Nothing changes for a world without the module: with no module answering, every item still costs one slot and no damage is healed.

## H27: what an item costs to invest, and a module's say in it

- **`registerInvestCost(key, fn)`**: `fn(item, actor)` answers the slots an item takes (a whole number, 0 or more) or `null` for "not mine". The first answer counts; no answer is one slot, as before. A throwing answer counts as no answer.
- **`registerInvestRefusal(key, fn)`**: `fn(item, actor)` answers why this actor may not invest it, or `""`. It is checked with the one-Staff rule and the one-invested traits, before anything else.
- **`registerInvestPrepare(key, fn)`**: awaited before the slots are counted, with `(item, actor, { free, slots })`. It may ask a question and write to the item (a relic's tier), or answer `{ refused }` to stop.
- **Invest Item counts by cost.** "Now 7 / 9 investment slots used", and a refusal names the shortfall: "Wren has 3 of 9 investment slots free, and The Aegis of Valtea needs 4".
- **The sheet's investment badge** counts the same way.
- `investedSlotsOf(actor, { except })` is exported for a module's own count (a relic's daily preparation).

## H28: damage ignored as healing

- **A damage reaction may answer `heal`** beside `immune`: a fraction, such as `0.5`. The creature ignores the damage and regains that fraction of the amount it was about to be dealt, before defences. The card says so ("Vex regains 9 HP (half of 18)").
- **Where the amount is known.** Typed damage (`applyTypedDamage`), a magic missile's darts, a spell's damage at its five cast sites, and thorns now pass the amount to the reactions, as `ctx.amount`.
- **Where it is not**, the card says the healing is by hand rather than guessing.
- For the Veilshroud's Legendary tier: "When you would be dealt essence damage, you ignore it and instead regain HP equal to half the amount."

## Found in the independent review, and fixed

- **Every packet of a cast is healed at its own amount.** A creature is asked its reactions once a cast, so a volley's later darts were never asked, and only the first healed. A healing answer with the cast's scope is now remembered for the cast, and each later packet it covers heals by that packet's amount.
- **A mixed packet is not healed at the wrong amount.** A spell's primary and secondary types are asked together, with the primary's amount. Healing that covers only the secondary type now says it is by hand, rather than healing half the primary.
- **Three sites now pass their amount and show the reactions' lines:**
  - an area's save, with the amount after the save;
  - hazardous terrain, whose squares are now rolled before the reactions are asked, and asked with their sum;
  - the cage, rolled before the reactions are asked.

  Before this, their reaction lines were discarded.

## The harness

- **New pair `verify-ea-block10-core`** (20 checks) and **`mutate-ea-block10-core`** (28 mutations, all caught).
- **Re-anchored**, to the same lines:
  - `verify-ea-block3b-core` and `mutate-ea-block3b-core`, for the reactions' new `amount` (`, dealt` and `magical: true, amount`);
  - the investment refusal, now with a module's on the next line: `verify-block39-traits` G5, `verify-block9c-core` H25, `mutate-block9c-core`, and `mutate-ea-block1-core`'s slot limit (now counted by cost);
  - the reactions and their sites: `verify-ea-block3b-core` W37, `mutate-ea-block3b-core` (three anchors) and `mutate-hazard-terrain` E5.
- Version pins raised to 3.693.0.
- **Full core sweep** (4 shards, 749 verifiers and mutation files), on the tree with the review's fixes: 10 failures, all in the harness, none in the code. Seven were anchors and regexes that this release's own edits had moved: `verify-block39-traits` G5, `mutate-block39-traits`, `verify-block9c-core` H25, `mutate-block9c-core`, `verify-ea-block3b-core` W37, `mutate-ea-block3b-core` and `mutate-hazard-terrain` E5. One was `verify-rules-have-callers`: `resolveBasicActionAtTotal` now has a caller, so its keep is gone, and `investedSlotsOf`, `damageHealedBack` and `healCoverage` are kept with reasons. `mutate-ea-block1-core`'s slot-limit anchor was the ninth, and `verify-checks-can-fail` stood behind the callers check. All ten were re-anchored and rerun clean, and every verifier passes on the final tree.
- **Independent review:** both rounds. The first found the per-packet healing and the three silent sites, now fixed. The second, on the fixes, found nothing in the core.
- **Eldritch Arts 0.17.0:** all 28 module verifiers pass against this release, and all 27 of its mutation files catch every mutation.
