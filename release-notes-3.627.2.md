# TRG Prime 3.627.2 — a player's Death critical, PP drain and AP watch go through the GM

7 October 2026. Built on 3.627.1, from its re-test as a player (`pillars-of-faith-live-testing-report-0.9.0.md`, addendum).

3.627.1 relayed a critical injury's Persistence record, Fatal mark, Injured location and lost air. The re-test confirmed that part: PC Tester's zombie crit the GM's victim twice, and both times the card said "Recorded as UH", the record was written on the GM's client, and nothing errored. The same test found three more direct writes to the target inside a critical:

- **The Death row's kill.** When the target fails the Death critical's save, Dying is pushed past its Death State. That was a direct `toggleStatusEffect` on the target. A player's strike threw "lacks permission to update ActiveEffect" and lost the whole strike: no damage and no card. It now goes through the existing `target.status` relay. The corpse is reaped by whoever made the write: by the striker if they own the target, and otherwise by the GM's death watch, which already reaps a creature that has just died.
- **"Drained of 2 PP"** (the Aligned 19 row). The target's PP was written directly. It is now an injury record of kind `ppDrain`, and the GM's client drains no more than the pool holds.
- **The AP-spend watch** a critical arms. It is now an injury record of kind `apWatch`.

## Harness

- **verify/mutate-live-fixes-3-627-1:** now 42 checks and 23 mutations (R11–R14 added).
- **verify/mutate-death-critical:** R3 and R4 re-anchored on the relayed kill and the owner-only reap.
- **Sweep:** 513 of 513 green on the first run.
