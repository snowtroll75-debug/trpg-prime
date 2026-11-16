# TRG Prime 3.690.1: three card fixes

14 November 2026. These are cosmetic fixes found in the live test of Eldritch Arts Block 9c (`claude/eldritch-arts-live-testing-report-0.15.0.md`), made at Graham's request. No rule changes. Eldritch Arts 0.15.1 runs on this release unchanged; it needs 3.690.0 or later.

## Fixed

- **Recharge Item prints the item's own PP cost.**
  - The outcome card's requirements line printed the action's "PP Cost 2." directly above "Spends 4 PP (Recharge Item (Orb))".
  - The line now names the kind's cost: "PP Cost 4 (Orb)."
  - An item whose kind sets no cost of its own (a wand, a staff) keeps the printed 2.
  - New pure helper: `rechargeRequirementsFor(requirements, kindSpec)` in `charged-items.mjs`.
- **The settle card is titled by what it carries.**
  - A rod paying part of a spell as a PP source (the Rod of Ley Resonance) was carded "— Metamagic" with no metamagic taken.
  - The title is now "PP Sources", "Metamagic", or "Metamagic and PP Sources". This applies to both the cast's own settle card and a held spell's.
  - New pure helper: `settledCardTitle(metamagicTaken, sourcesDrawn)` in `cast-result-line.mjs`.
- **A spell being held says so.**
  - The result card of a spell stored by a hold window (Spellhold) said "The spell takes effect. 2 PP spent." above "Sleep is held in …".
  - It now says "The spell is held. 2 PP spent."
  - A failed or called-off hold is told as before.
  - `castResultHeadline` takes `held`.

## The harness

- **New pair `verify-fixes-3690-1`** (12 checks) and **`mutate-fixes-3690-1`** (11 mutations, all caught).
- Version pins raised to 3.690.1 in the verifiers and mutation files that track the current version.
- **Re-anchored:** `verify-drive-3616` D2 and its `mutate-drive-3616` R3. The headline's facts now end with `held`.
- **Full core sweep** (4 shards, 743 verifiers and mutation files): 0 failures in the code. The first pass flagged only the D2 pair above, which reruns clean.
- **Independent review:** nothing serious. It confirmed that `rechargeSetup`, `holdingNow`, `outcome`, `mmx` and `ppSources` are all in scope where they're read. A hold with no item is refused before the headline, so "The spell is held." can't print for a spell that wasn't held. No other card path prints an Orb's Recharge Item cost as 2.
