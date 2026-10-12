#!/usr/bin/env node
/**
 * mutate-elemental-nexus — can verify-elemental-nexus fail?
 * NEW at 3.477.0.
 *
 * W6 IS THE ONE THAT MATTERS. Reading the zone from `runningEmanations()`
 * is the mistake the first draft of area riders made, and it is silent:
 * every rule still passes and the spell simply never fires.
 *
 * L2 IS THE RULING. A Light Critical reads as Serious, because a Fumble
 * must be worse than the Failure line's Minor.
 *
 * D4 IS THE DIFFERENCE FROM THE PRISONS. This spell names Partial, so
 * Partial must NOT be folded into Failure the way the prisons fold it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const N = path.join(SYSTEM_ROOT, "module", "magic", "elemental-nexus.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "elemental-nexus-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const B = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-elemental-nexus.mjs");

const MUTATIONS = [
  {
    file: N,
    name: "L2 THE RULING BROKEN: a Light Critical reads as Minor",
    from: '    if (NEXUS_DEGREES.includes(d) && SEVERITIES.includes(s)) criticalOn[d] = s;',
    to: '    if (NEXUS_DEGREES.includes(d) && SEVERITIES.includes(s)) criticalOn[d] = "minor";',
    breaks: "L2 — a Fumble would be no worse than a Failure"
  },
  {
    file: N,
    name: "D4 Partial is folded into Failure, as the prisons do",
    from: '  partial: "partial",',
    to: '  partial: "failure",',
    breaks: "D4 — this spell prints its own Partial line"
  },
  {
    file: N,
    name: "D2 Heroic is given no outcome",
    from: '  heroic: "critical",',
    to: "  heroic: null,",
    breaks: "D1/D2 — a heroic save would cost nothing and say nothing"
  },
  {
    file: N,
    name: "R4 a degree with no dice is accepted anywhere",
    from: '      if (degree === "critical") { ladder[degree] = ""; continue; }\n      return null;',
    to: '      ladder[degree] = ""; continue;',
    breaks: "R4 — a Success with no dice would cost undefined"
  },
  {
    file: N,
    name: "R3 Critical is forced to name dice",
    from: '      if (degree === "critical") { ladder[degree] = ""; continue; }',
    to: "      if (false) { continue; }",
    breaks: "R3 — the pack row would be refused and the spell would do nothing"
  },
  {
    file: N,
    name: "C3 a critical save is described as taking nothing",
    from: "  if (outcome.harmless) {",
    to: "  if (false) {",
    breaks: "C3 — \"resists the elemental energies\" is what the book says"
  },
  {
    file: N,
    name: "S1 the save no longer comes from the element",
    from: "  return elementSave(element);",
    to: '  return "Reflex";',
    breaks: "S1 — acid and cold ask Fortitude"
  },
  {
    // THE SILENT WRONG DESIGN.
    file: F,
    name: "W6 THE WRONG LIST: the sweep reads emanations instead of regions",
    from: "  for (const region of canvas?.scene?.regions ?? []) {",
    to: "  for (const region of runningEmanations() ?? []) {",
    breaks: "W6 — the zone is a place, so the list can never contain it"
  },
  {
    file: F,
    name: "W7 everyone is charged, wherever they are standing",
    from: "      if (!inside) continue;",
    to: "      if (false) continue;",
    breaks: "W7 — the whole encounter would take the zone's damage"
  },
  {
    file: F,
    name: "W9 the rolled degree is used unmapped",
    from: "      const outcome = nexusOutcome(spec, nexusDegree(rolled));",
    to: "      const outcome = nexusOutcome(spec, rolled);",
    breaks: "W9 — a heroic or blunder roll would find no outcome and cost nothing"
  },
  {
    // A REAL MUTATION, not the no-op the first draft had: remove the
    // prompt entirely. The old check compared indexOf positions and
    // passed on -1, so this is exactly what it failed to catch.
    file: C,
    name: "W2 THE ELEMENT IS NEVER ASKED FOR",
    from: "          row, await promptTypeChoice(row.label || spell.name, offered));",
    to: "          row, offered[0]);",
    breaks: "W2 — the choice the spell is built around would be made for them"
  },
  {
    file: C,
    name: "W3 the save DC is not frozen with the zone",
    from: "          ...row, element, saveDC: Number(saveDC ?? 0) || 0",
    to: "          ...row, element",
    breaks: "W3 — a caster who leaves would change the zone they left behind"
  },
  {
    file: B,
    name: "W4 the turn clock stops sweeping the zone",
    from: "    for (const bite of await applyElementalNexus(actor, combatant.token?.object ?? null)) {",
    to: "    for (const bite of []) {",
    breaks: "W4 — nobody beginning a turn in it would ever be charged"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([N, F, C, B, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-elemental-nexus: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-elemental-nexus: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-elemental-nexus: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
