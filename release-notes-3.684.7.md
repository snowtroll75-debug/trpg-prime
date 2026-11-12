# TRG Prime 3.684.7

6 November 2026. Graham's three answers of 6 November to the 3.684.6 questions, and Sudden Charge. Built on 3.684.6.

- **Install over 3.684.6.** No migration, and no world data changes.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.2, 0.9.1 and 0.9.0, and Inner Tempest 1.0.4, run on it.

## Fixed

- **Sudden Charge now makes a Charge cost 2 AP** (Graham: "The charge action works fine but Sudden Charge does not reduce the AP cost of a charge." The book: "It only costs you 2 Action Points to Charge instead of 3").
  - **Before:** Charge is armed, then paid for when the token moves. The armed path never reached the step that applies Sudden Charge, so the move always cost 3 AP. A character with only 2 AP was refused the Charge.
  - **Now:** the move costs 2 AP with Sudden Charge, whether it is a feat or a class ability. The arming card says "costing 2 AP". A character with 2 AP and Sudden Charge can Charge.
  - **Unchanged:** a Charge without the feat costs 3, and the Strike at the end of a Charge still costs nothing.

## For every world

- **Natural Leaper's jump that needs no action removes Agile Display's Step** (Graham, asked "Is that right?" about keeping it: "Yes" to removing it).
  - **Before:** a Long Jump within the leaper's Speed, which takes no action, left the Step ready.
  - **Now:** it removes the Step, with the notice, as any other action does. It still costs no AP.
- **A cancelled Strike sets nothing off** (Graham, asked "Should a cancelled Strike undo these too?": "Yes").
  - **Before:** the Versatile, Unsteady and Blunt Arrows prompts came after the Strike had already done these things, so cancelling at one of them left them done:
    - spent its AP (refunded since 3.684.6);
    - counted its traits for the turn (Flourish, Open, Press and the like);
    - ended the attacker's own Sanctuary;
    - ended the target's Fixation;
    - used up a queued Power Attack;
    - moved the Crimson Covenant on;
    - marked Opportunist used;
    - ended a Hide From Animals ward.
  - **Now:** the three prompts come first, before any of these. Cancelling at one of them costs nothing and changes nothing. A Strike that goes ahead rolls exactly as before: the answers are applied to the roll where they always were.
  - **Why asked first, rather than undone afterwards:** undoing would mean re-creating a deleted Sanctuary ward and a lifted Fixated condition, and taking back chat cards other players have seen. Asking first gets the same result with nothing to undo.
  - **What you'll notice:** these prompts now come before the Strike's later refusals (out of range, a ward), so you may answer Versatile and then be told the Strike can't be made.
- **A cancelled spell gives back a Strike-only point as Strike-only** (Graham, asked about casts: "Yes").
  - **When:** a spell only spends a restricted point (Haste's or Fast Attack's) when it is cast with "Proceed anyway" past the general points.
  - **Before:** if its targeting was then cancelled, the point came back as a general AP.
  - **Now:** the point comes back as it was.
- **A refund gives back only the restricted points its own spend took.**
  - **Before:** 3.684.6 put back the whole list of restricted points as it stood before the Strike.
  - **Now:** each spend keeps a note of which points it took, and its refund adds back just those. A point spent on something else in between stays spent.
  - **Not yet for drinks** (from review): a potion or elixir whose release fails still returns any restricted point as general AP, as before. That only happens when you drink with "Proceed anyway" past your general AP.

## Harnesses

- **New `verify-sudden-charge`:** 5 checks.
  - **C1:** the reduced cost, for a feat and for a class ability.
  - **C2:** the real move hook. A Charge costs 3, or 2 with the feat. A 2-AP character with the feat can Charge, and one without it is refused.
  - **C3:** the arming card's cost.
  - **C4:** the real Charge Strike costs nothing.
  - **C5:** the wiring.
- **`verify-agile-display`:** 60 checks. They call the real `rollWeaponAttack`, `resolveAction`, `spendActionCost` and `refundActionCost`.
  - **N16, N22, N26 and N27 re-pointed:** a cancelled Strike now spends nothing.
  - **N28:** a Strike cancelled at Versatile or Unsteady keeps its AP, trait counts, the attacker's Sanctuary, the target's Fixation, a queued Power Attack and the Crimson Covenant. A Strike that goes ahead uses all of them, as before.
  - **N28b:** checks that the three prompts come before every one of these.
  - **N29:** Natural Leaper's Long Jump that needs no action, and a High Jump within reach.
  - **N30:** the restricted-points notes. A spell over the general points gets Haste's point back as Strike-only. A point a Strike spent in between isn't given back. Without a note, a refund returns general AP as before.
- **Pins re-pointed** to the cast's receipts: `verify-area-region-life` W2, `verify-ea-block5d-core` O6 and `verify-session-faults-1014` F7c.
- **Mutations:**
  - new `mutate-sudden-charge`, with 10;
  - `mutate-agile-display` has 12 new, and the nine 3.684.6 refund-path mutations removed with the code they tested (93 in all);
  - anchors re-pointed in `mutate-area-region-life`, `mutate-ea-block5d-core`, `mutate-session-faults-1014`, `mutate-hide-from-animals` and `mutate-chapter6-gear-161-170`.
- **`uncalled-exports.json`:**
  - `armedApCost` is kept as a harness seam, because its callers are in its own file;
  - `cappedEntries` comes off the keep list, because `action-points-workflow.mjs` now calls it.

## For Graham

- **The Strike's prompts come earlier** (Graham, 6 November: "leave the order as you have done it for now"). Versatile, Unsteady and Blunt Arrows are asked before the Strike's later refusals (range, reach, a ward, the GM's leave off-turn).
