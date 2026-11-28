# TRG Prime 3.719.1: an Effective Level of 0 can be stored

28 November 2026. Branch `fix/creature-effective-level-zero`, on top of 3.719.0 (`fix/spell-module-sweep`).

- **Install over 3.718.3 or 3.719.0.** It includes everything in 3.719.0. No migration: the world is not asked to migrate.
- **Companion modules:** Fiends & Fables 0.47.1 uses the new marker. Eldritch Arts, Pillars of Faith and Inner Tempest need no update.

## New: Effective Level 0

- **Asked for:** by Graham on 28 November 2026, after the Fiends & Fables creature balance audit.
- **The problem:** a 0 in the GM tab's Effective Level box has always meant "blank, use the creature's level". The Codex gives a level-1 creature under 90% of the Development Point benchmark an Effective Level of `floor(1 × 0.9) = 0`, and the box could not say so. 21 Fiends & Fables creatures were budgeted as EL 1.
- **Now:** the GM tab has an **Effective Level 0** tick box beside the Effective Level box.
  - **Ticked, with the box at 0:** the creature's Effective Level is 0.
  - **Unticked:** a 0 in the box means the creature's level, as before.
  - **A number above 0 in the box always wins**, ticked or not.
- **In an encounter:** EL 0 is valued by its difference from the party's level like any other EL. Against a level-1 party it is one below, 300 XP; the same creature budgeted at level 1 was 400 XP. Against a party of level 10 or higher it is off the table and worth nothing.
- **Existing actors:** none reads differently. The marker is a new field, `system.gm.challengeZero`, off by default.

## For module authors

- `effectiveLevelOf(system)` in `module/rewards.mjs` returns `system.gm.challenge` when it is above 0, then 0 when `system.gm.challengeZero === true`, then the level.
- A pack that wants EL 0 on a creature sets `system.gm.challenge` to 0 and `system.gm.challengeZero` to true. Older cores ignore the marker.

## Testing

- `verify-fixes-3719-1`: 13 checks. `mutate-fixes-3719-1`: 9 mutations, all caught.
- `verify-block38-rewards`: 59 checks, unchanged.
- All 413 per-rule verify files passed, with `verify-no-undefined-names`, `verify-rules-have-callers` and `verify-checks-can-fail`.
- 62 of the 63 mutate files that touch the changed sources or the version anchors passed. `mutate-fixes-3685-3b` was stopped for time; its version anchor was checked by hand.
- Not run: `verify-checks-read-source`, and the mutate files that touch none of the changed sources.
- Live verification is owed once installed: tick the box on a creature, add it to a Party sheet encounter, and confirm it is listed at EL 0. The tick box's layout on the GM tab has not been seen in a browser.
