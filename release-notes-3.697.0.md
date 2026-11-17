# TRG Prime 3.697.0: the core automation audit

17 November 2026. Graham asked for a whole-system audit of the core's automation, with two emphases: protect the live install, and run a system-wide regression suite against Pillars of Faith, Inner Tempest and Eldritch Arts for every core change.

**Needs:** Foundry 14. **Migration:** a world at 3.696.3 is offered one, schema 3.666.4 → 3.697.0. It runs only the pack-copy pass, which repairs owned copies of Changing Lungs, Long Arm and Inner Focus. A copy a GM has edited is left alone.

## Fixed

- **Fast Movement (familiar):** +15 ft to every speed the familiar has.
- **Energy Resistant, Ability Enhancement, Speak in Tongues, General Adeptness (familiar):** the Use button each item promised now works.
- **Spell Battery (familiar):** a +1 Spell Adder within 30 ft.
- **Changing Lungs:** no drowning.
- **Long Arm:** +5 ft reach.
- **Inner Focus:** no penalties for casting without the focus.

The details, rule by rule, are in `TRG_CORE_REPAIR_REPORT.md`.

## Audited and found right

- **Spell stat blocks:** all 691 printed blocks match Core 3.8.
- **Class tables:** all 8 match Core 3.8.
- **Live advancement:** all 8 classes levelled 1→20→1 in the Test world match their tables at every level, with no duplicate grants.
- **Compendium integrity:** no duplicate or malformed ids, broken references or unresolved grants.
- **Live install:** every one of the 831 shipped files was byte-identical to `main` before work began.

## Waiting on Graham

- **U1:** class abilities are kept after a level drop.
- **Rulings:** Flame Blade, Inner Focus as a somatic stand-in, and Ability Enhancement's four-level window.

See `TRG_CORE_UNRESOLVED.md`.

## Harness

- **`tools/regression-suite.mjs`:** the core sweep plus every module check, against the working core. Results are in `TRG_CORE_TEST_REPORT.md`.
- **`verify-audit-3697`:** 35 checks. **`mutate-audit-3697`:** 32 mutations, all caught.
- **Version pins:** 3.697.0.
