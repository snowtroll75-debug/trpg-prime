# TRG Prime 3.668.2

23 October 2026. Double Slice's pair rules, fixed as Graham asked after the Inner Tempest 0.5.1 live test ("Yes please fix Double Slice").

- **Install over 3.668.1.** Inner Tempest 0.5.1 works on it unchanged, and so do Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **This changes Double Slice for every game,** with or without a module.
- **No migration prompt.**

## What was wrong

Double Slice was written when damage was a button pressed after the roll, so its result card could overrule a swing. Damage is now applied as a Strike hits, and the card came too late:
- **Both swings' critical injuries were inflicted.** The live test's second Tonfa swing added Injured 1 and Stunned 1, while the card said "only one can be inflicted, so the second counts as an ordinary hit".
- **The card still asked for damage to be rolled** ("Roll damage from both cards and combine the totals …"), though both swings' damage had already been applied.
- **Two more, found while fixing these:**
  - "If either attack fumbles, then the other attack automatically misses" could not unmake the first swing's damage when the second swing fumbled.
  - "Combine their damage" met the target's DR twice, once per swing.

## What Double Slice does now

The book's rule:

> "If both attacks hit, combine their damage, choosing the most beneficial against your current target. You can only inflict one critical and if either attack fumbles, then the other attack automatically misses."

**The second swing is rolled while the first waits,** after the first's attack card and before any of its injury, damage or grab is applied. Then:
- **One critical.** The first critical stands. A critical on the second swing counts as an ordinary hit: no bonus dice and no injury, and its attack card says so.
- **DR once.** When the first swing hits, the second is rolled with the target's DR already met. The first swing's damage meets it.
- **A fumble on the second swing** makes the first one miss before it lands.
- **A fumble on the first swing** means the second is not made: "it automatically misses".
  - A first swing that may fumble (an unmodified 1, or 2 when not proficient) cannot wait, because its fumble check comes after it. It finishes first, and the second follows if it did not fumble.

**The result card** now says what happened:
- each swing hit or missed, and the damage it dealt;
- a hit voided by the other swing's fumble;
- a second critical counted as an ordinary hit;
- that both hits met DR once;
- Twin and Backswing, as in 3.668.1;
- "The damage above has been applied", or "Neither swing deals damage".

**The cards come in a new order:** the first swing's attack, then the second swing's attack and damage, then the first swing's injury and damage, then the result.

**Not automated:** "choosing the most beneficial [damage type]". Each swing deals its own type (a Versatile weapon asks as usual).

**One side effect of the order.** Something a Strike's damage spends once (a once-per-round rider, Sneak Attack's once a round, Unseen Assault) now goes to the second swing's damage when both hit, because it lands first.

## How

Two new options on a Strike, for any caller that rolls a pair:
- **`noCritical`:** a critical is read as an ordinary hit before the attack card is written, so the card, the bonus dice and the injury all agree.
- **`beforeDamage`:** a function asked once the hit is known, before anything it does is applied. Answering `{ void: true }` turns the hit into a miss.

The check reports both back to its caller (`voidedByPair`, `criticalDowngraded`).

## Checks

- **New harness pair `verify/mutate-double-slice-3668-2`:** 18 checks and 20 mutations, all caught.
- **The other harnesses that read Double Slice or the Strike's text** still pass, unchanged:
  - `verify-it-fixes-3668-1`;
  - `verify-map-combat-only`;
  - `verify-natural-ready`;
  - `verify-chapter6-gear-151-160`;
  - `verify-block2-core`;
  - `verify-block4-core`.
- **The uncalled-export ratchet:** backlog unchanged at 513.
- **Full sweep (`node tools/verify.mjs` on the staged release): all 633 checks pass.**
- **Inner Tempest 0.5.1's harnesses against the staged 3.668.2:** Blocks 1 to 4 and the weapons, 380, 205, 1040, 1360 and 117 checks, all green.
