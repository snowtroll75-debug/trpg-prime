#!/usr/bin/env node
/**
 * mutate-warp-area-targeting — can verify-warp-area-targeting fail?
 *
 * NEW at 3.530.0.
 *
 * T3b IS THE ONE WORTH THE WHOLE RUNNER. The rule falls back to the
 * spell's own side when the override is not one of the three words, and
 * the obvious "simplification" is to trust whatever the fix says. Do that
 * and a single mistyped data fix — "freinds" — silently widens an
 * allies-only circle to everyone standing in it. The mutation is one
 * character of intent and the damage is invisible at the table.
 *
 * C1 IS THE WIRING. Put either call site back the way it was for the
 * whole life of the pack — `spellData.areaTargeting || "all"` — and the
 * rule stays perfect and unasked. Aid's warp charges 3 PP and buffs the
 * enemies. There are two of these because the two consumers can drift
 * apart independently, and a standing emanation that disagreed with the
 * cast that created it would flip sides mid-scene.
 *
 * A2 IS THE VOCABULARY. A mod missing from `emptyWarpMods()` is offered,
 * charged, and dropped — the exact defect this release exists to repair,
 * put back to prove the new check would have caught it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "magic", "warp-area.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-warp-area-targeting.mjs");

const MUTATIONS = [
  /* ── T: the rule ───────────────────────────────────────────────── */
  {
    file: A,
    name: "T1 THE OVERRIDE IS NEVER READ — the gap itself, put back",
    from: '  const override = String(mods?.areaTargetingOverride ?? "").trim().toLowerCase();',
    to: '  const override = "";',
    breaks: "T2/T2b/T2c/D2b — Aid charges 3 PP and hands its buff to every enemy in range"
  },
  {
    file: A,
    name: "T3b A TYPO IS TREATED AS AN ANSWER",
    from: '  if (override === "all" || override === "allies" || override === "enemies") return override;',
    to: "  if (override) return override;",
    breaks: "T3b — one mistyped data fix widens an allies-only circle to everyone in it"
  },
  {
    file: A,
    name: "T1b THE SPELL'S OWN SIDE IS DISCARDED",
    from: '  return base === "allies" || base === "enemies" ? base : "all";',
    to: '  return "all";',
    breaks: "T1b/T1c — every allies-only spell in the pack starts catching enemies"
  },
  {
    file: A,
    name: "T4b THE SPELL FIELD IS TRUSTED RAW",
    from: '  const base = String(printed ?? "").trim().toLowerCase();',
    to: "  const base = printed;",
    breaks: "T4/T4b — a field with stray spacing or capitals stops matching either side"
  },

  /* ── A: the vocabulary ─────────────────────────────────────────── */
  {
    file: W,
    name: "A2 THE MOD IS NEVER AGGREGATED — offered, charged, dropped",
    from: "    if (m.areaTargetingOverride) mods.areaTargetingOverride = String(m.areaTargetingOverride);",
    to: "    if (false) mods.areaTargetingOverride = null;",
    breaks: "T5c — the selection carries nothing, which is precisely the defect class "
      + "this release was opened to repair"
  },

  /* ── C: the wiring ─────────────────────────────────────────────── */
  {
    file: C,
    name: "C1 THE FRIEND/FOE FILTER GOES BACK TO ASKING THE SPELL",
    from: "        const mode = warpedAreaTargeting(spellData.areaTargeting, warpMods);",
    to: '        const mode = spellData.areaTargeting || "all";',
    breaks: "C1/C1b — the rule stays correct and nobody asks it at the moment the "
      + "template picks its tokens"
  },
  {
    file: C,
    name: "C1b THE EMANATION RECORD GOES BACK TO ASKING THE SPELL",
    from: "        mode: warpedAreaTargeting(spellData.areaTargeting, warpMods),",
    to: '        mode: spellData.areaTargeting || "all",',
    breaks: "C1/C1b — the cast lands on allies and the standing circle it leaves "
      + "behind catches everyone who later walks in"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([A, W, C, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-warp-area-targeting: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-warp-area-targeting: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-warp-area-targeting: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
