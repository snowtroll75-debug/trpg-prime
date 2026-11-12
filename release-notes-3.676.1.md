# TRG Prime 3.676.1

29 October 2026. Two fixes from the live test of 3.676.0 (`live-testing-report-3.676.0.md`).

- **Install over 3.676.0.**
- **No migration prompt.**

## Fixed

**A slot holds only a spell within its ceiling.**
- **The fault:** a 6th-level Fighter/Arcanist had Grease (PP 4) memorised in a Minor Arcane Caster slot. Removing Arcane Knight dropped their caster level from 3 to 0, so the Minor slots' ceiling fell to PP 1. Grease still showed in the slot and read as castable. Casting it would have gone to the Sacrifice overcast prompt rather than being free, but the slot table still listed it as memorised in a slot it could never have been put into.
- **The fix:** a book spell counts as memorised only while its slot exists *and* its PP is within that slot's ceiling ("You still cannot cast spells above your caster level"). A spell its slot has outgrown goes back to being a book entry, exactly as one whose slot has gone does. It isn't castable, isn't reported as orphaned, and is free to be memorised in a slot it fits.
- **Self-correcting:** nothing is written to the spell. If the caster level comes back, the same spell is memorised again by itself. Driven live at 3.676.0: restoring Arcane Knight made Magic Missile castable again with no change to the item.
- The Arcanist card's "— memorised" mark uses the same rule as the cast gate, so the two can't disagree.

**The "Spellbook — Levelled Spells" sub-heading sits flush left.** The sheet centres every h3, so under its left-aligned eyebrow line the heading read as an indent. It now sits flush left with a divider above, matching the card's own heading.

## Harness

- **`verify-arcanist-book`:** 85 checks (was 71). New:
  - E4 and E5: an outgrown book spell neither fills its slot nor is orphaned.
  - H1–H10: what a live slot holds, including the live case replayed (Arcane Knight removed, caster level 3 → 0, Grease no longer castable).
  - G18: the CSS.
  - G19: the card's mark reads the cast gate's rule.
- **`mutate-arcanist-book`:** 42 mutations, all caught. Two anchors that this release's own edit moved were re-anchored.
- **Re-pinned to 3.676.1:** the version anchors of ten mutation files and the release link.
- **`tools/uncalled-exports.json`:** a keep for `liveSlotHolds`. Its callers are in its own file, and the verify file drives it.
- **Full sweep on the staged 3.676.1:** 657 harnesses. 655 passed. The other two were the uncalled-export ratchet (`liveSlotHolds`, not yet declared) and `verify-checks-can-fail`, which needs that ratchet green. Both pass once it is declared.
- **Packs:** unchanged. The release ships the 3.675.0 pack files byte for byte.
