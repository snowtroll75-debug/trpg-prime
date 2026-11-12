# TRG Prime 3.681.1

3 November 2026. Two old defects, found in the Eldritch Arts 0.6.0 live test, and fixed as Graham asked the same day ("Yes fix and then move onto Block 4").

- **Install over 3.681.0.** No migration and no world data changes.
- **Runs unchanged on it:** Eldritch Arts 0.6.1 and Inner Tempest 1.0.4.

## Fixed

- **A Death critical's save now counts.**
  - **The defect:** it was read from `saveRoll.total`, but a check keeps its total in `outcome.total` and has no `total` of its own. So every Death critical's save counted as failed, and the target always died.
  - **Seen live:** "ZZ EA Eternity" saved 23 against DC 17 and was still killed: "rolls — against DC 17 — failed… dies".
  - **Now:** a made save lowers the result by its reduction and looks the row up again, as page 193 says. The card prints the real total.
  - **Since when:** the code dates from the Death critical's build, and 3.680.1 had it too. The harness had pinned the wrong read, so it never failed.
- **Found in review: the Death critical's save is decided by its degree,** as every other save's is. A conversion (Iron Will of the Tomb's "treat the failed save as a success"), a declared degree or Fateful Temptation's shift moves the degree but not the total.
  - **Before:** a failed save converted to a success still killed, and a made save shifted to a failure did not.
  - **Now:** the total decides only when the check gave no degree. `deathCriticalOutcome` takes the verdict as an option, `{ saved }`.
- **An unwilling touch (the casting condition, page 240) can now land.**
  - **The defect:** the same misread. The touch's total was always 0, so it always missed.
  - **Now:** it reads the outcome's total.
- **A reactor who leaves the game** (Block 3b's reaction questions) now gets the notice "… left the game — no reaction." It used to say "did not answer in time". The outcome is the same as before: no reaction.

## Harness

- **New pair: `verify-fixes-3681-1` (11 checks) and `mutate-fixes-3681-1` (11 mutations, all caught).**
  - **Its scan:** every `await TRGCheck.roll(…)` result in the system, 104 of them. None may have its own `.total` read. A read that is only a fallback after the outcome's, `?? check.total`, is allowed.
  - **The scan's premise is pinned too:** TRGCheck has no `total`. If it ever gets one, the scan must be revisited.
- **`verify-death-critical`:**
  - R2 and R5 pinned the misread. They now pin the outcome's total.
  - The new R2b fails on the old read, and its mutation puts that read back.
- **Version pins** moved to 3.681.1 in sixteen mutation files.
  - `verify-ea-block3b-core`'s version check is now "3.681.0 or later".
  - `system.json`'s download names v3.681.1.
- **Full sweep** (the list `tools/verify.mjs` runs, 669 harnesses with the new pair, in two shards on two copies checked identical to the source): **667 passed as they stood.**
  - The other two were `verify-checks-read-source` and its mutation. It found that the new T3 passed with `check.mjs` blank, a vacuous check.
  - T3 now also asserts that the TRGCheck class and its outcome are there. Both of that pair pass, run again on the source.
- **After the review's fix** (three files touched):
  - every `verify-*` harness was run again on the source, and all pass;
  - so do `mutate-death-critical` (19 of 19) and `mutate-fixes-3681-1`.
- **Eldritch Arts 0.6.1 on 3.681.1:** `verify-block1`, `2`, `2b`, `3` and `3b`, all green.
- **Inner Tempest 1.0.4 on 3.681.1:** Blocks 1–4, 6–10 and the weapons all green. Block 5's harness reads the book's text, which isn't in this workspace.
## For Graham

- **The unwilling touch ignores a natural 1 and a natural 20.** It compares its total against Defence only. Weapon attacks don't: an unmodified 1 always misses and an unmodified 20 always hits. Is page 240's touch attack an attack check in that sense? If so, that's a small change.

## Packs

- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
