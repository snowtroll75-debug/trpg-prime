# TRG Prime 3.720.1: a token can be kept at its own size

28 November 2026. Branch `fix/token-size-link`, on top of 3.720.0.

- **Install over 3.720.0.** No migration.
- **3.720.0 passed live:** see `live-testing-report-3.720.0.md`. No defect was found.
- **Companion modules:** none needs an update.

## New: "Keep this size"

- **Asked for:** by Graham on 28 November 2026, with the Size link of 3.720.0.
- **Where:** a tick box under the Size row on the Appearance tab of a token's sheet, and of a prototype token's sheet. It is shown for creatures (characters, NPCs, companions and familiars); a party, a vehicle and a peril were never resized and have no box.
- **Ticked on a token:** that token is not resized by the system. Its creature's Size can change, by the sheet or by an effect, and the token stays as you set it.
- **Ticked on a prototype token:** the prototype is left alone, and every token dragged from it afterwards is created kept, at the prototype's size.
- **Unticked:** the token takes its creature's Size again at once.
- **What it holds against:** the Size link, and also Change Shape, Luna Frenzy and a companion's growth, which resize a token themselves.
- **What it does not change:** the creature's Size, statistics, reach and space. Those are still read from the actor.

## For module authors

- The flag is `flags.trg-prime.keepTokenSize`, a boolean, on a token or a prototype token. Only `true` keeps the token.
- `resizeTokenInPlace` in `module/combat/movement-workflow.mjs` returns without writing for a kept token.

## Testing

- `verify-fixes-3720-1`: 19 checks. `mutate-fixes-3720-1`: 23 mutations, all caught.
- `verify-fixes-3720-0` (48 checks) and `mutate-fixes-3720-0` (39 mutations) still pass.
- All 413 per-rule verify files passed, run one by one, with `verify-no-undefined-names` and `verify-rules-have-callers`.
- The 31 other mutate files that touch `geometry.mjs`, `movement-workflow.mjs` or `companion-workflow.mjs` passed.
- **Not run:** `verify-checks-read-source`, `verify-checks-can-fail`, the other mutate files, and the companion modules' suites.
- **In the Test world, before installing** (the box's markup added in the browser only, on 3.720.0; temporary actor and token, deleted):
  - The box sits under the Size row on the Appearance tab and matches the sheet's other rows (seen in a screenshot).
  - Ticked and saved, the token carries the flag; reopened, the box is ticked; unticked and saved, the flag is false.
  - On the prototype token's sheet the box saves to the prototype, and a token made from it carries the flag.
- **Still owed once installed:** that a kept token really is left alone by a Size change, a form and the scene's first-run correction, and that unticking resizes it.
