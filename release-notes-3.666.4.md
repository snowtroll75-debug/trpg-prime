# TRG Prime 3.666.4

22 October 2026. Stops creatures' immunities, resistances and weaknesses from gaining a copy every time their sheet is saved.

- **Install over 3.666.3.** Inner Tempest 0.3.3, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work with it unchanged.
- **There is a migration prompt.** It cleans the lists the copies were saved into; see below.
- **3.666.3 has not been installed yet.** This release contains it: Keldran's Detect Deception copies and the levels fix for Orb of Fire. Its own migration pass runs in the same prompt.

## Immunities doubling on every save

Found while fixing the Vhalendar module's creatures, not reported in play.

- **The Greater Resonance Echo in the world** reads "disease, poison, disease, poison".
- **The hand-made "Lesser Echo"** in the Vhalendar pack holds the Construct type's eleven immunities **nine times**.

**Cause.**
- A creature type (Construct, Undead and the rest) and many abilities grant immunities with an effect that adds ", poison" to the creature's Immunities.
- The sheet's Immunities box showed the result, effects included. This sheet saves the whole form whenever any field changes.
- So editing anything on the sheet (a skill rank, a note) wrote the granted entries into the stored field, and the effect then added them again.
- Every save added one more copy. A creature whose type was later changed kept its old type's immunities in the stored text.
- Resistances and Weaknesses work the same way.

**Fix.**
- **The three boxes show what was typed.** Resistances, Immunities and Weaknesses show and save only the stored value.
- **What effects add is listed under each box,** read only: "Also from effects: bleeding, healing, mental…". Change the effect to change those.
- **Each entry counts once.** The prepared lists drop repeats, so a copy already stored does nothing.
- **The migration cleans the saved copies.** It covers world actors and placed creatures, and reports whose lists it cleaned.
  - **A stored list holding a repeated entry** is one copies were saved into, because nobody types "poison" twice. It loses its repeats and every entry an effect on the creature still grants.
  - **A list with no repeat** is the GM's own typing and is left alone.
- **Compendium actors** (the Lesser Echo) are not migrated. Their repeats do nothing now. A copy dragged into the world shows the list once in its box, and keeps it there when saved: clear the box by hand, or let the next migration pass clean it. *(Corrected after the live test: this line first said a save would clear it.)*

**Effect in Graham's world.**
- A Lesser Echo dragged in from the pack shows the Construct list once in its box. Each save keeps it once; it no longer grows.
- The world Greater Resonance Echo already reads "disease, poison" once.

## Checks

- **New harness pair:** `verify/mutate-defence-lists`, 25 checks and 18 mutations, all caught.
- **Re-anchored, without changing what they test:**
  - dedicated-rows C6 now checks that the stamp *reaches* 3.666.3;
  - the stamp mutations in dedicated-rows, drive-3622 and focus-default.
- **The uncalled-export ratchet:** unchanged backlog. The list-splitting helper is internal.
- **Schema stamp:** 3.666.4, the new pass.
- **Full sweep: 619 of 619 green.** It ran on a clean stage: the 3.666.3 release plus exactly this release's changed files.
- **Not yet tested live.** The sheet and the migration need the release installed; the plan is in the reply that delivered it.
