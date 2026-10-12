# TRG Prime 3.562.0 — per-day items arrive full; granted Focus spells are one use per Refocus

17 September 2026. Two rulings from Graham on findings the Pillars of Faith live tests turned up in the core.

## Per-day feats arrive with their uses available

"Go as you have stated so the item arrives full." Six core feats with a flat per-day count — Unyielding Tenacity, Luck of the Small Folk, Battle Hardened, Bestial Resilience, Wings of the Wyrm, Hidden Emotion — shipped with `usesValue: 0`, and `itemUsesRemaining` reads a stored 0 as none left, so a freshly granted feat refused its first Use until the next Daily Preparation. Declared as six data fixes (`declare-per-day-feats-arrive-full.mjs`, ids `arrive-full-*`) and applied to the feats pack: each now carries `usesValue` equal to its count. No rule change; a character who already holds one of these is unaffected until it is next granted.

## A granted Focus innate spell is one use per Refocus

"After use, the character must refocus that specific spell." The 14 August rule put the Focus trait on every innate spell a heritage or feat grants; a Focus item with no per-day count was untracked, so casting it spent nothing and Refocus never saw it as spent. `focusInnateDefaultUses` (uses.mjs, pure) now says: a spell that is innate, carries Focus and prints no count has a count of one. `itemUsesMax` consults it before the formula, so the innate cast branch spends the use and `focusRestorableItems` offers it to Refocus; item creation writes that one use so the spell arrives available. A printed count — "2", "unlimited" — still wins, as before. Galad-Iar's Dancing Lights and Light, Noldorni's cantrip, Injury Relief's Self Healing and the Pillars grants of Guidance, Stabilise and Purify all pick this up with no data change.

## Harness

`verify-focus-innate-uses.mjs` (23): the pure rule's nine edges; the three wiring points (structural, marked); every per-day feat in the compiled pack read back full; the six fixes declared. `mutate-focus-innate-uses.mjs` — 6 mutations, all caught. Full sweep: 313 of 313.
