# TRG Prime 3.607.0 — an armour's own bonus is in force only while it is worn

29 September 2026. One mechanism for Pillars of Faith 0.6.0 (Chapter 6, Gear). Built on Graham's own 3.606.0 (block 32) — this mechanism was first cut as 3.606.0 on his 3.605.1 and rebased when his 3.606.0 arrived.

## The worn-and-standing gate for equipment conditionals

`flags.trg-prime.conditionals` on an item has always been harvested into the check dialog whenever the item is on the actor — right for a race, a feat or a class ability, which are on the actor because they are true of it. Chapter 6 of Pillars of Faith puts printed bonuses on equipment for the first time: a Pilgrim's Coat's +1 to Conceal Faith, a Gravewarden Coat's and a Sepulchral Plate's +1 to Fortitude against disease and poison, an Oathguard Plate's +1 against Shove and Trip, a Processional Aegis's +1 to Perform Last Rites. A coat in the pack does not conceal anything, and a suit at 0 HP is not being worn.

`collectConditionals` (conditionals.mjs) now skips an armour, shield, weapon or gear item that is not `wornAndStanding` (item-quality.mjs — equipped, and not destroyed), through a private `equipmentInUse(item)`: non-equipment types are unchanged, so nothing a race or feat carries is touched. This is the rule `goodsConditionals` (goods.mjs) has applied to a Goods item's printed bonuses since the block-16 audit, applied to the item's own conditional rows.

## Harness

`verify-equipment-conditionals.mjs` (13): a packed suit's rows are not collected and a worn one's are, through `collectConditionals` on plain items (armour, shield, weapon, gear; destroyed; non-equipment carriers unaffected); the gate structural. `mutate-equipment-conditionals.mjs` — 4 mutations, all caught. Full sweep green.
