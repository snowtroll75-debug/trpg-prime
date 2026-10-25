# TRG Prime 3.667.1

23 October 2026. Two fixes from the live test of 3.667.0 with Inner Tempest 0.4.0.

- **Install over 3.667.0,** then Inner Tempest 0.4.1, which needs this release.
- **Unchanged and still working:** Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**

## A Disciple's techniques arrived with one use of two

**Found live.** A new Disciple's Burst Step, Guarded Centre and Disciplined Flurry showed 1 of 2 uses. Dragon's Pulse and the Technique feats did the same. A daily preparation filled them.

**Cause.**
- Deep Focus gives every Focus technique a second use, which raises the maximum.
- An item arriving on a sheet was given its one default use and no more. The extra use was only filled by a daily preparation.

**Fix.** A Focus item now arrives full, with every extra use a declaration on the sheet gives it. When Deep Focus itself arrives, every technique already on the sheet, or created alongside it, gains its use at once. A use already spent stays spent.

## Resolve gave no conviction point

**Found live.** A new Mystic read conviction 1 of 2: Mystical Resolve raised the pool but never the points. Disciple's Resolve is the same.

**Cause.**
- An item that raises the conviction pool (`convictionPool`, 3.664.0) gives its one-off point when the grant pass reaches it.
- The pass skips anything a class granted that has no grants of its own. Both Resolves are such items, so neither point was ever given.

**Fix.**
- **New characters:** the pass, and the watcher that runs as items arrive, now also visit a granted item that still owes its point. The point is given once and marked as given, as before.
- **Characters made on 3.667.0:** they get their point at their next grant pass, for example on gaining a level.

## Checks

- **`verify/mutate-block3-core`:** a new section H covers both fixes. 59 checks and 59 mutations, all caught.
- **Re-anchored, without changing what they test.** These read the changed code as text:
  - `verify-focus-default` C2;
  - `verify/mutate-focus-innate-uses` B2 and B3;
  - `verify-module-classes` C9 and C10;
  - three `mutate-feat-grants` anchors.
- **The uncalled-export ratchet:** backlog unchanged.
- **Full sweep: 621 of 621 green.** It ran on a clean stage: the 3.667.0 release plus exactly this release's changed files.
- **Live test of 3.667.0:** see live-testing-report-3.667.0. Everything else in 3.667.0 passed.
