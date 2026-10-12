#!/usr/bin/env node
/**
 * mutate-hazard-terrain — can verify-hazard-terrain fail?
 * NEW at 3.454.0.
 *
 * E1 AND E2 ARE THE ONES THAT MATTER. E1 is the Cutting Words failure —
 * a mechanism nobody registers. E2 is this release's own decision: the
 * hook was chosen by measuring all three in Graham's world, and moving
 * to `updateToken` silently turns a per-square rule into a per-move one,
 * which is the whole reason the mechanism exists.
 *
 * B2 IS GRAHAM'S RULING. Letting a teleport trigger the spikes is
 * exactly what he ruled against on 1 September 2026.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "hazard-terrain.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "hazard-terrain-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const B = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-hazard-terrain.mjs");

const MUTATIONS = [
  /* ── B: Graham's ruling ────────────────────────────────────────── */
  {
    file: R,
    name: "B1 THE RULING: a teleport triggers the hazard",
    from: "  const key = MOVEMENT_ACTION_SPEEDS[String(movementAction ?? \"walk\")];\n  return Boolean(key);",
    to: "  return true;",
    breaks: "B2 — Graham ruled only the creature's own move action"
  },
  {
    file: R,
    name: "B2 nothing triggers it",
    from: "  return Boolean(key);",
    to: "  return false;",
    breaks: "B1 — the spikes stop biting anybody"
  },

  /* ── A: what a hazard is ───────────────────────────────────────── */
  {
    file: R,
    name: "A1 a missing damage type is defaulted rather than refused",
    from: "  const damageType = text(raw.damageType).toLowerCase();\n  if (!damageType) return null;",
    to: "  const damageType = text(raw.damageType).toLowerCase() || \"untyped\";",
    breaks: "A2 — an empty type means \"the weapon's own\" elsewhere in this system"
  },
  {
    file: R,
    name: "A2 every hazard becomes enemies-only",
    from: "  const enemiesOnly = side === \"enemies\";",
    to: "  const enemiesOnly = true;",
    breaks: "A3/F3 — Spike Stones would spare the caster's allies, which it does not"
  },
  {
    file: R,
    name: "A3 no hazard is ever enemies-only",
    from: "  const enemiesOnly = side === \"enemies\";",
    to: "  const enemiesOnly = false;",
    breaks: "F4 — Verdant Retribution names enemies and would poison its own party"
  },

  {
    file: R,
    name: "A4 the printed save name is flattened to lower case",
    from: "  const save = text(raw.save);",
    to: "  const save = text(raw.save).toLowerCase();",
    breaks: "A4/A4b — the live card read \"A basic fortitude save applies\""
  },

  /* ── D: which squares ──────────────────────────────────────────── */
  {
    file: R,
    name: "D1 the square you start in counts as entered",
    from: "  const seen = new Set([cell(points[0])]);\n  for (let i = 1; i < points.length; i += 1) {",
    to: "  const seen = new Set();\n  for (let i = 0; i < points.length; i += 1) {",
    breaks: "D2 — every crossing would be charged one square too many"
  },
  {
    file: R,
    name: "D2 a square is only ever charged once",
    from: "    if (key === cell(points[i - 1])) continue;",
    to: "    if (seen.has(key)) continue;",
    breaks: "D4 — \"each time it enters\" is the printed wording"
  },

  /* ── E: is it reached? ─────────────────────────────────────────── */
  {
    file: B,
    name: "E1 THE OLD FAILURE: the hook is never registered",
    from: "  registerHazardTerrain();",
    to: "  ;",
    breaks: "E1 — Cutting Words exactly: a rule that exists and never runs"
  },
  {
    file: F,
    name: "E2 THE HOOK CHOICE: it listens after the move but loses the path",
    from: '  Hooks.on("moveToken", async (tokenDocument, movement) => {',
    to: '  Hooks.on("updateToken", async (tokenDocument, movement) => {',
    breaks: "E2/E2b — updateToken reports the final square, turning per-square into per-move"
  },
  {
    file: F,
    name: "E3 the ruling is asked only after the work",
    // RE-ANCHORED AT 3.456.0, when the one-move-one-charge guard was
    // inserted between the ruling and the sweep.
    from: "    if (!hazardTriggers(actionOf(movement))) return;\n",
    to: "",
    breaks: "E3 — a teleport would still sweep the scene"
  },
  {
    file: F,
    name: "E3b THE SHIPPED DEFECT: a movement may be charged twice",
    from: "    if (alreadyApplied(movement?.id)) return;",
    to: "    ;",
    breaks: "E3b — one walk printed two cards with different totals"
  },
  {
    file: F,
    name: "E3c a movement with no id is skipped instead of charged",
    from: "  if (!id) return false;",
    to: "  if (!id) return true;",
    breaks: "E3d — every hazard would go silent, which is worse than charging twice"
  },
  {
    file: F,
    name: "E4 the destination stands in for the path",
    from: "    const entered = squaresEntered(pathPoints(movement), gridSize);",
    to: "    const entered = squaresEntered([movement?.origin, movement?.destination], gridSize);",
    breaks: "E4 — the squares between are exactly what this charges for"
  },
  {
    file: F,
    name: "E5 one roll is multiplied across the squares",
    from: "      for (let i = 0; i < hits.length; i += 1) {",
    to: "      {",
    breaks: "E6 — four identical numbers, and the dice stop meaning anything"
  },
  {
    file: F,
    name: "E6 the damage is reported but not applied",
    from: "      if (taken > 0) await applyDamageAndCheckDying(mover, taken, { isCritical: false });",
    to: "      if (false) await applyDamageAndCheckDying(mover, taken, { isCritical: false });",
    breaks: "E7 — a card that reports damage nobody takes"
  },
  {
    file: F,
    name: "E7 defences are skipped",
    from: "        const packet = resolveAgainstDefences(mover.system ?? {}, {",
    to: "        const packet = { taken: roll.total }; void resolveAgainstDefences; void ({",
    breaks: "E8 — a creature immune to piercing would bleed in the spikes"
  },
  {
    file: F,
    name: "E8 every client applies the damage",
    from: "    if (!isActingGM()) return;\n    await applyHazardTerrain(tokenDocument, movement);",
    to: "    await applyHazardTerrain(tokenDocument, movement);",
    breaks: "E9 — damage multiplied by the number of people at the table"
  },
  {
    file: C,
    name: "E10 THE SHIPPED DEFECT: the recording moves back beside the emanation",
    from: "        if (row?.kind !== \"hazard\" || !placedArea?.regionId) continue;",
    to: "        if (row?.kind !== \"hazard\" || !placedArea?.regionId || !(lock || spellData.sustained)) continue;",
    breaks: "E11b — a hazard is neither locked nor sustained, so nothing would ever record"
  },
  {
    file: C,
    name: "E9 the cast stops recording the caster's side",
    from: "          casterDisposition: casterToken?.document?.disposition ?? null",
    to: "          casterDisposition: null",
    breaks: "E12 — Verdant Retribution would stop knowing who its enemies are"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, F, C, B, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-hazard-terrain: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-hazard-terrain: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-hazard-terrain: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
