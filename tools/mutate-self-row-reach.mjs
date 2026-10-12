#!/usr/bin/env node
/**
 * mutate-self-row-reach — can verify-self-row-reach fail?
 *
 * NEW at 3.534.0.
 *
 * R1 IS THE REGRESSION GUARD. Every spell whose `self` row worked before
 * this release must be untouched by it. Make the rule share by default
 * and nothing in the new channel breaks — all six new spells still pass —
 * while every other self row in the pack quietly starts spilling onto
 * whoever else the cast happened to reach. A regression that only touches
 * the spells you were NOT working on is the kind that ships.
 *
 * R2b IS THE ONE THAT WOULD BE WORSE THAN THE GAP. Fall back to the
 * caster when a retarget reached nobody, and Jump hands its bonus to the
 * person who spent PP to give it away.
 *
 * G1 IS THE POSITIVE CONTROL, and it exists because the 3.533.0 reach
 * ratchet shipped without one and two mutations survived. "No violations"
 * is also what an empty search returns.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const D = path.join(SYSTEM_ROOT, "module", "magic", "spell-degrees.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-self-row-reach.mjs");

const MUTATIONS = [
  /* ── R: the rule ───────────────────────────────────────────────── */
  {
    file: D,
    name: "R1 EVERY SELF ROW SHARES BY DEFAULT — the quiet regression",
    from: "  if (!warpMods?.shareSelfRows) return caster ? [caster] : [];",
    to: "  if (false) return caster ? [caster] : [];",
    breaks: "R1 — every unwarped self row in the pack spills onto whoever else the cast "
      + "reached, while all six new spells keep passing"
  },
  {
    file: D,
    name: "R2 A RETARGET STOPS MOVING THE ROW",
    from: "  if (warpMods?.retargetSelfRows) return others;",
    to: "  if (false) return others;",
    breaks: "R2/R4/D-live — Jump charges its PP and the bonus stays on the caster, which "
      + "is the defect this release exists to repair"
  },
  {
    file: D,
    name: "R2b A RETARGET THAT REACHED NOBODY FALLS BACK TO THE CASTER",
    from: "  if (warpMods?.retargetSelfRows) return others;",
    to: "  if (warpMods?.retargetSelfRows) return others.length ? others : (caster ? [caster] : []);",
    breaks: "R2b — the caster keeps a buff they spent PP to give away, which is worse "
      + "than the cast doing nothing"
  },
  {
    file: D,
    name: "R3b THE CASTER IS COUNTED TWICE IN A SHARE",
    from: "  return caster ? [caster, ...others.filter((t) => t !== caster)] : others;",
    to: "  return caster ? [caster, ...others] : others;",
    breaks: "R3b — a no-range circle centres on the caster, so they are already in the "
      + "list and would receive the effect twice"
  },
  {
    file: D,
    name: "R3 A SHARE DROPS THE CASTER",
    from: "  return caster ? [caster, ...others.filter((t) => t !== caster)] : others;",
    to: "  return others;",
    breaks: "R3/R3c — Prescience says \"YOU affect all allies\" and the caster would "
      + "lose their own spell"
  },

  /* ── A: the vocabulary ─────────────────────────────────────────── */
  {
    file: W,
    name: "A1 retargetSelfRows IS NEVER AGGREGATED — offered, charged, dropped",
    from: "    if (m.retargetSelfRows) mods.retargetSelfRows = true;",
    to: "    if (false) mods.retargetSelfRows = true;",
    breaks: "A1 — the selection carries nothing and Jump's warp goes back to buying air"
  },
  {
    file: W,
    name: "A2 shareSelfRows IS NEVER AGGREGATED",
    from: "    if (m.shareSelfRows) mods.shareSelfRows = true;",
    to: "    if (false) mods.shareSelfRows = true;",
    breaks: "A2 — the four area warps go back to granting nothing to anyone in the circle"
  },

  /* ── G: the ratchet, both directions ───────────────────────────── */
  {
    file: V,
    name: "G1 THE RATCHET LOOKS FOR MODS THAT DO NOT EXIST",
    from: 'const LIFTS = ["rangeOverride", "areaOverride", "areaGrowth"];',
    to: 'const LIFTS = ["noSuchMod"];',
    breaks: "G1 — the positive control catches a search that finds nothing, which is the "
      + "failure mode that survived at 3.533.0"
  },
  {
    file: V,
    name: "G2 A WARP NO LONGER HAS TO SAY WHAT ITS SELF ROW DOES",
    from: 'const SAYS = ["retargetSelfRows", "shareSelfRows"];',
    to: 'const SAYS = ["retargetSelfRows", "shareSelfRows", "areaOverride", "rangeOverride"];',
    breaks: "G2 — every reach-granting warp would satisfy the ratchet by granting reach, "
      + "which is the thing it is supposed to be checking is not enough"
  },

  /* ── W: the wiring ─────────────────────────────────────────────── */
  {
    file: E,
    name: "W1 THE APPLIER GOES BACK TO HANDING SELF ROWS TO THE CASTER",
    // RE-ANCHORED AT 3.606.0: a gated self row now asks the targets' rolls
    // first, and the ungated branch is the one this mutation is about.
    from: "        : selfRowRecipients(caster, targets, warpMods))",
    to: "        : [caster])",
    breaks: "W1/W1b — the rule stays correct and nobody asks it; all six warps charge "
      + "their PP and change nothing"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([D, W, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-self-row-reach: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-self-row-reach: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-self-row-reach: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
