# TRG Prime 3.712.1: the Group Check summary's DC

23 November 2026. Follows 3.712.0 on `feature/party-sheet-v2-stage5`. Found in the 3.712.0 live test (`live-testing-report-3.712.0.md`), where the other 21 of 22 checks passed.

- **What changed:** the Group Check summary card now gives the DC as set and the DC each roll was checked against. Before, a Hard check at DC 15 read "DC 15 (Hard (DC +2))", leaving the 17 to arithmetic. It now reads "**DC 15, Hard (DC +2): 17**".
- **Unchanged:** Medium still reads "DC 15". With no DC set it reads "No DC set".
- **Rules:** none changed. Each member's own card already showed DC 17.

## Harness

- `verify-party-sheet-stage5` G15: 62 checks.
- `mutate-party-sheet-stage5`: 35 mutations, all caught.
