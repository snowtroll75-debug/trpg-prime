#!/usr/bin/env node
/**
 * mutate-death-watch — can verify-death-watch actually fail?
 *
 * NEW at 3.373.0, the first mutation file since the corpus was lost.
 *
 * SURVIVED AND SKIPPED ARE BOTH FAILURES. A mutation nobody catches means
 * the check beside it is decorative; a mutation that never applied tests
 * nothing while reporting nothing, which is the quietest failure a harness
 * has. Both are reported as failures here.
 *
 * Every edit is applied to a real source file and undone through
 * `guardFiles`, which restores on every exit path including SIGINT and an
 * uncaught throw. It takes the harness lock, so this cannot run beside a
 * sweep.
 *
 * WHERE THE MUTATIONS AIM. Half at the pure rule — the Death State
 * threshold, whose off-by-one is the least recoverable bug in the system —
 * and half at the wiring, because 23 August's live pass showed the rule was
 * already correct and it was the wiring that was missing. A mutation set
 * that only attacked the arithmetic would have caught nothing that day.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const DEATH = path.join(SYSTEM_ROOT, "module", "combat", "death-state.mjs");
const WATCH = path.join(SYSTEM_ROOT, "module", "combat", "death-watch-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const INIT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");

/**
 * Each mutation names the file, the exact text to replace, and what it
 * breaks. `from` must appear EXACTLY ONCE — a mutation that matched
 * nothing, or matched several places, is reported rather than skipped.
 */
const MUTATIONS = [
  // ---- the threshold ----
  {
    name: "Death State comparison becomes >= (kills a step early)",
    file: DEATH,
    from: "return value > limit;",
    to: "return value >= limit;",
    breaks: "B2 — Dying equal to the Death State would become fatal"
  },
  {
    name: "Death State comparison becomes < (nobody ever dies)",
    file: DEATH,
    from: "return value > limit;",
    to: "return value < limit;",
    breaks: "B3/B4 — Dying past the Death State would stop being fatal"
  },
  {
    name: "a non-finite Dying value is treated as fatal",
    file: DEATH,
    from: "if (!Number.isFinite(value) || !Number.isFinite(limit)) return false;",
    to: "if (!Number.isFinite(value) || !Number.isFinite(limit)) return true;",
    breaks: "B5/B6/B7 — an actor with no Dying condition would read as dead"
  },
  // ---- needsReaping ----
  {
    name: "needsReaping ignores the already-skulled guard",
    file: DEATH,
    from: "return Boolean(dead) && !alreadySkulled;",
    to: "return Boolean(dead);",
    breaks: "A2/A5 — a reaped actor would reap again and post a second card"
  },
  {
    name: "needsReaping reaps the living",
    file: DEATH,
    from: "return Boolean(dead) && !alreadySkulled;",
    to: "return !alreadySkulled;",
    breaks: "A3/A4 — a living actor would be removed from the tracker"
  },
  // ---- the wiring, which is what was actually missing ----
  {
    name: "the death watch is never registered",
    file: INIT,
    from: "  registerDeathWatchHooks();",
    to: "  // registerDeathWatchHooks();",
    breaks: "C3 — the hooks would never register, the exact 23 Aug defect"
  },
  {
    name: "the effect-update route stops being watched",
    file: WATCH,
    from: 'Hooks.on("updateActiveEffect", (effect) => {',
    to: 'Hooks.on("updateActiveEffectDISABLED", (effect) => {',
    breaks: "C4 — raising a Dying value on an existing condition would go unnoticed"
  },
  {
    name: "the sheet route stops being watched",
    file: WATCH,
    from: 'Hooks.on("updateActor", (actor, changes) => {',
    to: 'Hooks.on("updateActorDISABLED", (actor, changes) => {',
    breaks: "C4 — lowering the Death State on the sheet would go unnoticed"
  },
  {
    name: "the GM gate is removed (every client races to reap)",
    file: WATCH,
    from: "    if (!isActingGM()) return false;",
    to: "    if (false) return false;",
    breaks: "C7 — every connected client would delete the same combatant"
  },
  {
    name: "the announcement fires even when nothing was removed",
    file: WATCH,
    // RE-ANCHORED AT 3.621.0: an instant death is announced out of combat too.
    from: "      if (result.removed || result.cause) {",
    to: "      if (true) {",
    breaks: "C8 — the turn-boundary path would double-post a death card"
  },
  // ---- the phase labelling ----
  {
    name: "the recurring flat check loses its phase subtitle",
    file: COMBAT,
    from: '        subtitle: recurringEasier\n          ? `${END_PHASE_LABEL} \u00b7 DC ${recurringDC} (reduced by ${recurringEasier})`\n          : END_PHASE_LABEL,',
    to: "",
    breaks: "D2 — the card would again say nothing about which phase it is in"
  },
  {
    name: "the phase label drifts from the summary card's heading",
    file: COMBAT,
    from: 'const END_PHASE_LABEL = "Phase 3 — End Phase";',
    to: 'const END_PHASE_LABEL = "End Phase";',
    breaks: "D1 — subtitle and heading would no longer match, which is the whole point"
  },
  {
    name: "a flat check is moved into Phase 1",
    file: COMBAT,
    from: "    // Dying check first: a dying creature regains no AP.",
    to: '    // Dying check first: a dying creature regains no AP.\n    void "Recurring Damage — Flat Check";',
    breaks: "D8 — a check appearing in _onStartTurn is the defect as originally reported"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-death-watch.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true; // verify passed — the mutation SURVIVED
  } catch {
    return false; // verify failed — the mutation was CAUGHT
  }
}

const guard = guardFiles([DEATH, WATCH, COMBAT, INIT]);
const results = [];
try {
  if (!run()) {
    process.stderr.write(
      "mutate-death-watch: verify-death-watch already fails on an unmodified tree, "
      + "so nothing below would prove anything. Fix that first.\n"
    );
    guard.release();
    process.exit(2);
  }

  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;

    if (occurrences !== 1) {
      // NOT a skip. An anchor that matched nothing — or matched twice — is
      // a mutation that tested nothing, and it is reported as a failure.
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${occurrences})` });
      continue;
    }

    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-death-watch: FAILED — ${bad.length} of ${results.length} mutations were not caught.\n`
    : `\nmutate-death-watch: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
