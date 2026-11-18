# TRG Prime 3.698.3 — two faults found by the live Flame Blade cast

18 November 2026. Follows 3.698.2. The live test of 3.698.0–3.698.2 in the Test world passed; casting Flame Blade showed two small faults, fixed here.

## Fixed

- **A conjured weapon no longer opens "Customise".** Adding a weapon to a character offers quality, materials and runes. That fired for a blade a spell makes too (Flame Blade, Eldritch Weapon, Shadow Weapon), on a weapon that lasts a minute. `shouldOfferCustomisation` (module/customise-on-add.mjs) now skips anything carrying the `conjuredWeapon` mark, as it already skips specific items and charged-item weapon forms.
- **Flame Blade's cast card.** It read "Scimitar of pure force — fire damage". It now reads "Scimitar (Flame Blade) — fire damage (1 minute)". Eldritch Weapon's force wording is unchanged.

## Correction to the 3.698.1 notes

The conjured item is called **Scimitar**, not "Flame Blade". It is the pack's Scimitar marked as conjured, the same way Eldritch Weapon's blade keeps its weapon's name.

## Data and migration

No pack or migration change. The world schema stays at 3.698.2.

## Tests

See TRG_CORE_TEST_REPORT.md §9 and live-testing-report-3.698.md.
