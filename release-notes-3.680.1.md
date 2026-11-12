# TRG Prime 3.680.1

2 November 2026. Teleports go past creatures. Asked for by Graham on 2 November 2026 ("Yes please fix the teleportation movement"), after the Eldritch Arts 0.5.0 live test.

- **Install over 3.680.0.** No migration. Eldritch Arts 0.5.1 and Inner Tempest 1.0.4 run on it unchanged.

## Fixed

**A teleport no longer walks the squares between its hops.** Page 198's space rules check each square a move passes through, square by square. They did that for a teleport too. Found on a throwaway scene with a hostile creature between two points:
- **A Blink drag with waypoints** was refused: "would move through ZZ EA Blocker's space — an unwilling creature's space — Tumble (Acrobatics) first." Each leg between hops was sampled as if walked.
- **A one-hop teleport** (Eldritch Arts' Gale Step, the core's own displacements, a Blink drag straight to its end) went over the creature. That was already right.

Now:
- **A leg Foundry marks as a teleport is not sampled.** That is `CONFIG.Token.movement.actions[action].teleport`, true for Blink and Displace, so a module's own teleporting action counts too.
- **A square a teleport lands on between hops is not passed through.** Page 198 asks nothing of it: no refusal, no Tumble, and no extra cost for a prone creature's square.
- **The square the whole move ends on is checked as before.** "You cannot end your turn in a space already occupied by another creature" (page 198) holds for a teleport as for a walk.
- **Walked legs are unchanged,** including a walk before or after a Blink in the same move.

**Unchanged:**
- **Walls:** Foundry's own wall rules for each action decide them. Blink is stopped by movement walls; Displace ignores them.
- **Hazards and AP:** a teleport into a hazard square was already free (Graham's ruling of 1 September 2026), and a teleport was already not charged as a Stride.

## Code

- **`combat/movement.mjs`:**
  - `isTeleportAction` reads Foundry's table, and falls back to "blink" and "displace" by name when there is no table.
  - `pathSquaresOf` is the path's squares, moved here from the workflow so it can be driven. It samples walked legs and marks teleport landings.
  - `crossedSquares` gives the squares passed through.
- **`combat/movement-workflow.mjs`:** `pathSquares` calls `pathSquaresOf`, and `spaceRules` reads `crossedSquares`. Nothing else in the hook changes.

## Harness

- **New pair: `verify-teleport-movement` (25 checks) and `mutate-teleport-movement` (14 mutations, all caught).** They cover:
  - T, which actions are teleports;
  - P, the squares a path touches;
  - C, the squares it passes through;
  - W, the wiring, with the end square still asked first;
  - Z, the version.
- **`verify-ea-block3a-core`:** its version check is now "3.680.0 or later".
- **Re-pinned to 3.680.1:** the version anchors of thirteen mutation files and `mutate-release-links`. `system.json`'s download now names v3.680.1.
- **Still green:**
  - `verify-chapter7-combat-191-200` 145 and its 112 mutations;
  - `verify-hazard-terrain` 56 and its 20;
  - `verify-rules-have-callers`, `verify-no-undefined-names`, `verify-checks-can-fail`;
  - `verify-ea-block3a-core` 85 and its 66.
- **Full sweep on the staged 3.680.1** (the list `tools/verify.mjs` runs, now 665 harnesses with the new pair, in two shards on two copies checked identical to the source): **all 665 pass**. None is unpaired or unrun.
- **Eldritch Arts 0.5.1 on 3.680.1:** `verify-block1` 883, `verify-block2` 131, `verify-block2b` 91, `verify-block3` 302, all green.
- **Inner Tempest 1.0.4 on 3.680.1:** Blocks 1–4, 6–10 and the weapons all green. Block 5's harness reads the book's text, which isn't in this workspace, so it can't run here at all.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
