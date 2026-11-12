# TRG Prime 3.684.8

6 November 2026. Graham's report about archetype feats charging a pick for what they grant, and one card line from the 3.684.7 live test. Built on 3.684.7.

- **Install over 3.684.7.** No migration, and no world data changes. Characters already on the sheet are re-counted the next time the sheet opens.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.2 and Inner Tempest 1.0.4 need no change: their grants are counted by the core.

## Fixed

- **What a feat grants no longer costs a feat pick** (Graham: "When the Spell Weaver Archetype feat is taken, it charges a feat pick for Magical Reservoir. I have just noticed it is doing the same for Agile Display. The benefits gained from an archetype feat should not charge the character an additional feat. There may be other feats also affected.")
  - **Before:** a grant spent nothing only when it came from a class, background, race or heritage, or through a chain from one. That's how a Rogue's Assassin, granted by Archetypal Path, was free. Two things were charged:
    - **an archetype feat's grant, when the archetype was bought with a pick.** The grant counted as a second pick.
    - **an Archetype ability.** It sits in the Archetype Feats table, beside the feat that granted it, so it was counted as a feat.
  - **Now:** anything another item on the sheet handed over spends nothing, since it is that item's benefit. An ability never spends a feat pick at all. Foundation grants are free, as before.
  - **Still counted:** a feat you bought yourself. Deleting the source item already takes its grants with it (grant cleanup). A grant whose source is somehow missing counts as a pick.
  - **Example:** a Gymnast bought at 3rd level was "Class: 2 spent". It's now "Class: 1 spent", Gymnast alone. Agile Display is free.
  - **No longer charged**, when the feat that grants them was bought with a pick:
    - **Core:**
      - Agile Display (Gymnast);
      - Death Mark (Assassin);
      - Sense Weakness (Mastermind);
      - Favoured Terrain (Warden);
      - Shield Focus (Aegis);
      - Alchemical Crafting (Alchemist).
    - **Eldritch Arts:**
      - Magical Reservoir (Spell Weaver);
      - Fade Step (Shade Master);
      - Spellstrike Riposte (Spell Duellist);
      - Counter Channel (Spellwarden);
      - Familiar (Hex Weaver).
    - **Inner Tempest:**
      - Inner Discipline (Inner Adept);
      - Stealthy Strike and Shadowy Step (Shadowdancer);
      - Affable (Way of the Geisha);
      - Perfect Shot (Zen Archer).
  - **Not affected:** the other grants in the packs are abilities that already sat outside the feat tables, so they were never counted. For example, Nightvision from Half-Elf, Leyline Power from Leyline Weaver, and the Inner Discipline techniques.
- **The Charge arming card's header now shows what you pay** (found in the 3.684.7 live test). A Sudden Charger's card read "3 AP" in its header, over an Armed line and a spend of 2. The header now says 2 AP. Only a reduced cost replaces the printed one, so no other action's header changes.

## Harnesses

- **New `verify-feat-budget-grants`:** 6 checks.
  - **G1:** `spendsNoFeatPick`, the sheet's rule as a pure function.
  - **G2:** `featBudget` with rows built from the real pack items: Gymnast, Assassin, Mastermind, Warden, Aegis and Alchemist each cost one pick, and what they grant costs none. Eldritch Arts' Spell Weaver → Magical Reservoir is checked from its sources when they're readable.
  - **G3:** a bought feat still counts, an orphaned grant counts, and a background's bonus feat is free. No ability row is counted, in a character's budget or a companion's.
  - **G4:** the wiring.
- **`verify-sudden-charge`:** C6 is new.
  - `armedHeaderCost`;
  - no armable action's header changes without a reduction;
  - the real arming card through `resolveAction`: 2 AP with Sudden Charge, 3 without.
- **Mutations:**
  - new `mutate-feat-budget-grants`, with 10;
  - three new in `mutate-sudden-charge`.

## For Graham

- **Settled: anything another item hands over is free** (Graham, 6 November: "It should cover anything that another item hands over"). That includes the feats a bought feat grants, such as Favoured Terrain (Warden), Shield Focus (Aegis) and Alchemical Crafting (Alchemist).
- **Settled from 3.684.7:** the Strike's Versatile, Unsteady and Blunt Arrows questions come before its later refusals (Graham: "leave the order as you have done it for now").
