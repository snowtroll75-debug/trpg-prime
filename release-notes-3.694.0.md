# TRG Prime 3.694.0: a module's item may cast at its own level

15 November 2026. One small seam for Eldritch Arts 0.17.1. Graham said yes on 15 November: Dawnshield "can independently cast" its Cure, so the Cure is cast at the shield's level 15.

## H29: a granted spell cast at its item's level, by the module's say

- **The opt-in.** A spell granted with `flags.trg-prime.grantedBy = { sourceId, atItemLevel: true }` is cast at that item's level: its DC, attack and innate gate. `innateCastLevel` and `grantingItemOf` (`module/item-innate-level.mjs`) read it.
- **Nothing else changes.**
  - Every other `grantedBy` (a feat, a class, an Eldritch Arts relic, whose level is its wielder's) is read as before.
  - An item with no level still falls back to the character's.
  - A Spell Effect rune's own record still comes first.
- Why not the rune's record? A spell granted that way would be taken down by the rune upkeep, which reconciles every such spell against the runes it finds.

## The harness

- **`verify-ea-block10-core`** gains H29: 22 checks.
- **`mutate-ea-block10-core`** gains three H29 mutations: 31, all caught.
- Version pins raised to 3.694.0.
- **Full core sweep:** 4 shards, 749 verifiers and mutation files, 0 failures.
- **Independent review:** found nothing in the core. It confirmed that the opt-in is strict, and that every caller of `innateCastLevel` reads it correctly: the cast's PP gate, its level and warp budget, and the innate save DC. Rune upkeep, grant clean-up and compendium refresh are unaffected.
