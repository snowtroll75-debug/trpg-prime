# TRG Prime 3.696.2: a maneuver's check names what it is made with

17 November 2026. One fix, found in the retest of 3.696.1 (Graham: "Please fix").

- **Found.** A Shove Attack made with Ossuary Board's bash was titled "Shove Attack — Unarmed attack check", although its modifiers named the board. The same title showed for a Shove or Trip made with a Shove- or Trip-trait weapon.
- **Fixed.** The check now names what it is made with:
  - a shield: "Shove Attack — Shield Bash attack with Ossuary Board";
  - a trait weapon: "Trip Attack — Attack check with Whip".
- **Unchanged.** A maneuver made with no weapon still reads "Unarmed attack check". The modifiers are unchanged.

## The harness

- **`verify-fixes-3696-0`:** 42 checks (new: L3).
- **`mutate-fixes-3696-0`:** 39 mutations, all caught.
- **Every verify file was re-run on the final tree:** 0 failures.
- **`verify-checks-can-fail`:** passed.
- **Version pins:** 3.696.2.

No Pillars of Faith change is needed: 0.12.5 works with 3.696.2.
