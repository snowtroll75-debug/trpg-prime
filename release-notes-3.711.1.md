# TRG Prime 3.711.1: Stage 4 live fixes

23 November 2026. Follows 3.711.0 on `feature/party-sheet-v2-stage4`. Found in the 3.711.0 live test (`live-testing-report-3.711.0.md`); repair log R-0032.

- **Deposit Item works.** The chooser read its choice from `form.elements.item`, which is the form's own `item()` method, so nothing was ever deposited. It now reads the field by name.
- **Players can drag to deposit.** Foundry accepts drops only on sheets the user can edit, so a player's drag onto the party (where they have Observer) was ignored. The sheet now accepts every drop and decides what each may do; the GM's client checks it again.
- **The GM's Give says "given".** A GM's Give posted "Kharon took …". It now reads "Kharon was given …", headed "Given from the party". A player's take still reads "took".
- **Item types have labels.** `lang/en.json` had no item type labels, so the Inventory's Type column, and every item sheet's title, showed "TYPES.Item.weapon". All 19 item types now have labels, and the Type column falls back to the type's name.

## Harness

- **`verify-party-sheet-stage4`:** 130 checks. The new section L, plus G4b, covers the four findings.
- **`mutate-party-sheet-stage4`:** 43 mutations, all caught.
