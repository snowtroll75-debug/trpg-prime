#!/usr/bin/env node
/**
 * mutate-conjure-warp — can verify-conjure-warp fail?
 *
 * NEW at 3.565.0.
 *
 * A1 IS THE ONE THIS RUNNER EXISTS FOR, because it is the bug Graham
 * reported, restored exactly: stop the aggregator scaling `conjuredLevel`
 * and `warpScalesWithRepeats` sees no difference between one purchase and
 * two, so the chooser draws a checkbox again. Every piece of arithmetic
 * in the verify still passes while the thing the release is for stops
 * working.
 *
 * W3 IS THE WIRING ONE. Take the caster level off the SECOND chooser —
 * Warp Manipulation's, after the check — and the pre-cast path is
 * perfect while a caster who warps after rolling is offered as many
 * steps as they can pay for, with no ceiling at all. That is the call
 * site a fix to this file would most plausibly miss.
 *
 * P4b IS THE DATA ONE. Nine declared numbers with no arithmetic between
 * them and the truth; the only thing standing between a typo and a
 * shipped rule is that the printed description is read back.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "conjured-creature.mjs");
const K = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-conjure-warp.mjs");

const MUTATIONS = [
  /* ── A: the aggregator ─────────────────────────────────────────── */
  {
    file: W,
    name: "A1 THE AGGREGATOR STOPS SCALING — Graham's bug, restored",
    from: "      mods.conjuredLevel += Number(m.conjuredLevel) * times;",
    to: "      mods.conjuredLevel += Number(m.conjuredLevel);",
    breaks: "A2 — one purchase and three become the same, so warpScalesWithRepeats "
      + "reports a checkbox and the option can be bought once"
  },
  {
    file: W,
    name: "A3 THE BASE IS MULTIPLIED BY times",
    from: "      if (m.conjuredBase != null) mods.conjuredBase = Math.max(mods.conjuredBase ?? 0, Number(m.conjuredBase));",
    to: "      if (m.conjuredBase != null) mods.conjuredBase = (mods.conjuredBase ?? 0) + Number(m.conjuredBase) * times;",
    breaks: "A3 — three purchases of a 1st-level conjure would report a printed base of 3"
  },

  /* ── C: the purchase count ─────────────────────────────────────── */
  {
    file: C,
    name: "C2 THE FLOOR IS REMOVED — a caster at the ceiling may buy nothing",
    from: "  return Math.max(1, Math.ceil((level - base) / step));",
    to: "  return Math.ceil((level - base) / step);",
    breaks: "C2 — a 1st-level caster on a 1st-level conjure divides to 0, and a 5th-level "
      + "caster on Conjure Entity to a negative"
  },
  {
    file: C,
    name: "C3 AN UNKNOWN CASTER LEVEL BECOMES A CEILING OF ZERO",
    from: "  if (!Number.isFinite(level) || level <= 0) return null;",
    to: "  if (!Number.isFinite(level)) return null;",
    breaks: "C3c — level 0 would compute a cap instead of falling through, so the "
      + "workbench's actorless chooser refuses the purchase"
  },
  {
    file: C,
    name: "C4 A MISSING BASE IS TREATED AS ZERO",
    from: "  if (!Number.isFinite(base)) return null;\n  const level = Number(casterLevel);",
    to: "  const base = Number.isFinite(Number(mods?.conjuredBase)) ? Number(mods?.conjuredBase) : 0;\n  const level = Number(casterLevel);",
    breaks: "C4 — a warp whose base never landed would silently get a cap counted from 0"
  },

  /* ── L: the resulting level ────────────────────────────────────── */
  {
    file: C,
    name: "L2 THE CASTER LEVEL STOPS CAPPING THE RESULT",
    from: "  const level = Number.isFinite(ceiling) && ceiling > 0 ? Math.min(warped, ceiling) : warped;",
    to: "  const level = warped;",
    breaks: "L2 — the printed 'to a maximum of your caster level' would be enforced nowhere "
      + "on the item-cast path, where the chooser never ran"
  },
  {
    file: C,
    name: "L2b THE CLAMP IS NEVER REPORTED",
    from: "  return { base, warped, level, clamped: level < warped };",
    to: "  return { base, warped, level, clamped: false };",
    breaks: "L2b/N2 — a caster who bought four steps and can use two is told nothing about "
      + "the two they paid for"
  },

  /* ── N: the card line ──────────────────────────────────────────── */
  {
    file: C,
    name: "N3 AN UNWARPED CONJURE PRINTS A LINE ANYWAY",
    from: '  if (!result || !Math.trunc(Number(mods?.conjuredLevel) || 0)) return "";',
    to: '  if (!result) return "";',
    breaks: "N3 — every conjure cast would carry a warping note for warping nobody bought"
  },

  /* ── W: the wiring ─────────────────────────────────────────────── */
  {
    file: W,
    name: "W1 THE COUNT LOSES THE CASTER LEVEL",
    from: "      const max = warpMaxTimes(w, areaText, casterLevel);",
    to: "      const max = warpMaxTimes(w, areaText);",
    breaks: "W1 — every conjure falls through to UNLIMITED and the printed ceiling is "
      + "offered by nobody"
  },
  {
    file: K,
    name: "W3 WARP MANIPULATION'S CHOOSER LOSES IT — the second call site",
    from: "+ `</p>` + buildWarpChooser(spell, basePP, { afterTheCheck: true, casterLevel }),",
    to: "+ `</p>` + buildWarpChooser(spell, basePP, { afterTheCheck: true }),",
    breaks: "W3 — warping after the check would be uncapped while the pre-cast path stays right"
  },
  {
    file: K,
    name: "W4 THE CARD STOPS ASKING FOR THE NOTE",
    from: "    const conjuredNote = conjuredCreatureNote(warpMods, casterLevel);",
    to: "    const conjuredNote = \"\";",
    breaks: "W4 — the PP is charged, the steps are bought, and the card never says what "
      + "level of creature they came to"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [V], { stdio: "pipe" });
    return true;
  }
  catch { return false; }
}

const guard = guardFiles([W, C, K, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-conjure-warp: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-conjure-warp: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-conjure-warp: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
